import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { expectSignedInAccount } from "../support/auth";
import {
  assigneeOption,
  byText,
  DESKTOP,
  detailHeader,
  dialog,
  entryActivity,
  entryStatus,
  expectLeadDetail,
  expectListPage,
  fixture,
  historySection,
  mainArea,
  newStaffContext,
  openEntry,
  openLead,
  saveEntry,
  signInAs,
  T,
  uniqueText,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
} from "./support/staff";

// Survey checklists in the staff workspace (survey-checklist spec 6.6): W16-25..W16-33, W16-45 and the W16-46 step.
// The SALE works in a browser set to New York time: dates and times still read as Vietnam time (W16-33). Budget: 2
// sign-ins (SALE, SALE_LEADER), full loads: the checklist URL for the leader and for the SALE after the reassignment.
//
// Fixture L13 (SURVEY_SCHEDULED, long-term rent, E2E Sale, one VISITED appointment the SALE performed yesterday 09:00
// Vietnam time) changes, in this order: the SALE starts checklist #1 and saves G1, G3, G8, G4 and G6; the leader
// reassigns L13 to themselves, takes the draft over, corrects G3 and G8, records an owner statement heard by the SALE,
// removes and puts back the air conditioner (W16-46) and puts L13 on hold. Run both seeds again before every
// `npm run e2e:workspace`. This project runs after survey.spec.ts (playwright.workspace.config.ts).

test.describe.configure({ mode: "serial", timeout: 180_000 });

const L13 = fixture.lead(13);
const LEADER_OPTION = assigneeOption(fixture.leader.name, "Sale leader");

const C = {
  start: "Start checklist (survey #1)",
  open: "Open checklist #1",
  legal: "Site survey record. It is not a legal or safety check.",
  media: "Photos and submission open once survey photos are available. You can save and preview this draft now.",
  notAssignee: "Only the lead's assignee edits the checklist.",
  leadStatus: "The lead is not in Survey Scheduled.",
  takeoverPrompt: "You are the new assignee. Take over this draft before editing.",
  needed: "Changing it needs a correction: reason, date and basis.",
  seenBySale: `Recorded as seen by ${fixture.sale.name} at survey #1.`,
  phone: "Remove the phone number: it must not be stored here.",
  kitchenGap: "Condition and availability · P1 · Kitchen: Not entered or only partly entered: Kitchen",
  photos: "Photos: waiting for survey photos",
  submission: "Submission is not available until survey photos are built.",
} as const;

/** Vietnam is UTC+7 all year. */
const VIETNAM_MS = 7 * 60 * 60 * 1000;
const vietnamIso = (ms: number): string => new Date(ms + VIETNAM_MS).toISOString().slice(0, 10);
const shown = (iso: string): string => iso.split("-").reverse().join("/");
const vietnamToday = (): string => vietnamIso(Date.now());

const checklistPath = (checklistId: string) => `${L13.path}/survey-checklists/${checklistId}`;
const panel = (page: Page, title: string): Locator => mainArea(page).getByRole("region", { name: title, exact: true });
const group = (scope: Locator, name: string): Locator => scope.getByRole("group", { name, exact: true });
const space = (scope: Locator, code: string): Locator =>
  scope.locator("section").filter({ has: scope.page().getByRole("heading", { name: `Space ${code}`, exact: true }) });
const surveySection = (page: Page): Locator => mainArea(page).getByRole("region", { name: "Survey", exact: true });

async function record(field: Locator): Promise<void> {
  await field.getByRole("radio", { name: "Recorded", exact: true }).check();
}

async function save(scope: Locator): Promise<void> {
  await scope.getByRole("button", { name: "Save", exact: true }).click();
}

async function expectSaved(scope: Locator, name: string): Promise<void> {
  await expect(scope.getByRole("status")).toContainText(`by ${name}`, { timeout: 20_000 });
}

/** Fills the open correction box of a panel and saves with it. */
async function correct(scope: Locator, reason: string): Promise<void> {
  const box = scope.getByRole("group", { name: "Correction", exact: true });
  await expect(box).toBeVisible();
  await box.getByRole("textbox", { name: "Reason for the correction" }).fill(reason);
  await box.getByLabel(/^Date of the basis/).fill(vietnamToday());
  await box.getByRole("textbox", { name: "Basis", exact: true }).fill("Remeasured with the owner on the phone");
  await box.getByRole("button", { name: "Save with the correction" }).click();
}

test.describe("Survey checklists (survey-checklist W16b)", () => {
  let saleContext: BrowserContext;
  let sale: Page;
  let leaderContext: BrowserContext;
  let leader: Page;
  let checklistId = "";

  test.beforeAll(async ({ browser }) => {
    test.skip(!(await workspaceE2eReady()), WORKSPACE_E2E_SKIP_REASON);
    const { baseURL } = test.info().project.use;
    saleContext = await browser.newContext({ baseURL, locale: "vi-VN", viewport: DESKTOP, timezoneId: "America/New_York" });
    sale = await saleContext.newPage();
    leaderContext = await newStaffContext(browser);
    leader = await leaderContext.newPage();
  });

  test.afterAll(async () => {
    await saleContext?.close();
    await leaderContext?.close();
  });

  test("W16-25, W16-27, W16-29, W16-30, W16-33: the SALE starts the checklist and saves G1, G3, G8, G4 and G6", async () => {
    await signInAs(sale, "SALE");
    await expectSignedInAccount(sale);
    await sale.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(sale);
    await openLead(sale, L13);

    const section = surveySection(sale);
    await section.getByRole("button", { name: C.start, exact: true }).click();
    await expect(sale).toHaveURL(/\/survey-checklists\/[0-9A-Z]{26}$/, { timeout: 20_000 });
    checklistId = new URL(sale.url()).pathname.split("/").at(-1) ?? "";
    await expect(sale.getByRole("heading", { level: 1, name: "Checklist #1" })).toBeVisible({ timeout: 20_000 });
    await expect(byText(sale, C.legal)).toBeVisible();
    await expect(byText(sale, C.media)).toBeVisible();
    // W16-33: arrival yesterday 09:00 Vietnam time, read in Vietnam time in a New York browser.
    await expect(mainArea(sale)).toContainText(`visited ${shown(vietnamIso(Date.now() - 24 * 3600_000))} 09:00 by ${fixture.sale.name}`);

    // G1: the lead address (a WEB lead: the owner's form), type, fit, two spaces in PARTS; a phone number is refused.
    const g1 = panel(sale, "G1 Identification");
    await g1.getByRole("button", { name: "Use the lead address" }).click();
    await expect(group(g1, "Address seen").getByRole("combobox", { name: "Source" })).toHaveValue("OWNER_FORM");
    const type = group(g1, "Property type");
    await record(type);
    await type.getByRole("combobox", { name: "Property type" }).selectOption({ label: "House" });
    const fit = group(g1, "Fit with the rental scope");
    await record(fit);
    await fit.getByRole("combobox", { name: "Fit with the rental scope" }).selectOption({ label: "In scope" });
    await fit.getByRole("textbox", { name: "Why" }).fill("Two rooms for long-term rent");
    await group(g1, "Rental scope").getByRole("radio", { name: "Separate parts" }).check();
    const spaces = group(g1, "Spaces viewed");
    await spaces.getByRole("button", { name: "Add a space" }).click();
    await spaces.getByRole("button", { name: "Add a space" }).click();
    await spaces.getByRole("textbox", { name: "Code" }).nth(0).fill("P1");
    await spaces.getByRole("textbox", { name: "Where it is" }).nth(0).fill("Ground floor, front");
    await spaces.getByRole("textbox", { name: "Code" }).nth(1).fill("P2");
    await spaces.getByRole("textbox", { name: "Where it is" }).nth(1).fill("First floor, back");
    const note = g1.getByRole("textbox", { name: /^General note/ });
    await note.fill("Owner mobile 0905 123 456");
    await save(g1);
    await expect(g1.getByText(C.phone)).toBeVisible();
    await expect(g1.getByRole("status")).toContainText("Not saved");
    await note.fill("Blue gate, ring twice");
    await save(g1);
    await expectSaved(g1, fixture.sale.name);

    // G3: the area of both spaces, measured.
    const g3 = panel(sale, "G3 Size and layout");
    for (const [code, area] of [
      ["P1", "35.5"],
      ["P2", "20"],
    ] as const) {
      const field = group(space(g3, code), "Area (m2)");
      await record(field);
      await field.getByRole("textbox", { name: "Area (m2)" }).fill(area);
      await field.getByRole("combobox", { name: "Source" }).selectOption({ label: "Measured" });
    }
    await save(g3);
    await expectSaved(g3, fixture.sale.name);
    await expect(group(space(g3, "P1"), "Area (m2)")).toContainText(`Measured at survey #1 by ${fixture.sale.name}`);

    // G8: the rent of P1 seen on site.
    const g8 = panel(sale, "G8 Rental terms");
    const rent = group(space(g8, "P1"), "Monthly rent (VND)");
    await record(rent);
    await rent.getByRole("textbox", { name: "Monthly rent (VND)" }).fill("5000000");
    await rent.getByRole("combobox", { name: "Source" }).selectOption({ label: "Seen on site" });
    // An owner statement the SALE heard: the leader's later G8 saves carry it unchanged (review finding 1, A-18).
    const period = group(space(g8, "P1"), "Pay every (months)");
    await record(period);
    await period.getByRole("textbox", { name: "Pay every (months)" }).fill("3");
    await period.getByRole("combobox", { name: "Source" }).selectOption({ label: "Owner said" });
    await period.getByLabel(/^Date the owner said it/).fill(vietnamToday());
    await period.getByRole("combobox", { name: "Who heard it" }).selectOption({ label: "Me" });
    await expect(period.getByRole("textbox", { name: "How it reached you" })).toHaveCount(0);
    await save(g8);
    await expectSaved(g8, fixture.sale.name);

    // G4: the kitchen of P1 not entered.
    const g4 = panel(sale, "G4 Condition and availability");
    const kitchen = group(space(g4, "P1"), "Kitchen");
    await record(kitchen);
    await kitchen.getByRole("combobox", { name: "Check" }).selectOption({ label: "Not entered or only partly entered" });
    await kitchen.getByRole("textbox", { name: "What was not reached and why" }).fill("Door locked, the tenant keeps the key");
    await save(g4);
    await expectSaved(g4, fixture.sale.name);

    // G6: a shared air conditioner seen on site.
    const g6 = panel(sale, "G6 Amenities and furniture");
    await group(g6, "Shared amenities").getByRole("checkbox", { name: "Air conditioner" }).check();
    await save(g6);
    await expectSaved(g6, fixture.sale.name);
  });

  test("W16-31, W16-26: the preview lists the gaps with no submit control; History collapses the saves", async () => {
    await mainArea(sale).getByRole("navigation", { name: "Checklist views" }).getByRole("link", { name: "Preview" }).click();
    await expect(sale).toHaveURL(/\?tab=preview$/);
    await expect(mainArea(sale).getByRole("link", { name: C.kitchenGap })).toBeVisible();
    await expect(mainArea(sale).getByRole("link", { name: C.photos })).toBeVisible();
    await expect(byText(sale, C.submission)).toBeVisible();
    await expect(byText(sale, C.legal)).toBeVisible();
    await expect(mainArea(sale).getByRole("button", { name: /submit/i })).toHaveCount(0);
    await expect(mainArea(sale)).toContainText("Terms as offered or seen; not agreed lease terms.");

    await mainArea(sale).getByRole("link", { name: "Back to the lead" }).click();
    await expectLeadDetail(sale, L13);
    await expect(surveySection(sale).getByRole("link", { name: C.open })).toBeVisible({ timeout: 20_000 });
    const history = historySection(sale);
    await expect(history).toContainText("Checklist #1 started");
    await expect(history).toContainText(`Checklist #1: 5 saves by ${fixture.sale.name}`);
    await history.getByRole("button", { name: "Show the 5 saves" }).click();
    await expect(history).toContainText("Checklist #1: Identification saved");
    await expect(history).toContainText("Checklist #1: Amenities and furniture saved");
  });

  test("W16-32, W16-28: the leader reads it read-only, takes L13 over, the SALE loses it, the leader takes the draft over", async () => {
    await signInAs(leader, "SALE_LEADER");
    await expectSignedInAccount(leader);
    await leader.goto(checklistPath(checklistId));
    await expect(leader.getByRole("heading", { level: 1, name: "Checklist #1" })).toBeVisible({ timeout: 20_000 });
    await expect(byText(leader, C.notAssignee)).toBeVisible();
    await expect(mainArea(leader).getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await expect(mainArea(leader).getByRole("textbox")).toHaveCount(0);

    await mainArea(leader).getByRole("link", { name: "Back to the lead" }).click();
    await expectLeadDetail(leader, L13);
    await leader.getByRole("button", { name: T.reassign }).click();
    const assign = dialog(leader, "Reassign lead");
    await assign.getByRole("combobox").selectOption({ label: LEADER_OPTION });
    await assign.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(byText(leader, T.assignSaved)).toBeVisible();

    // W16-32: the former assignee gets "not found"; nothing of the checklist stays.
    await sale.goto(checklistPath(checklistId));
    await expect(byText(sale, T.leadNotFoundNotice)).toBeVisible({ timeout: 20_000 });

    await surveySection(leader).getByRole("link", { name: C.open }).click();
    await expect(byText(leader, C.takeoverPrompt)).toBeVisible({ timeout: 20_000 });
    await mainArea(leader).getByRole("button", { name: "Take over", exact: true }).click();
    const takeover = dialog(leader, "Take over this draft");
    await takeover.getByRole("textbox", { name: "Reason", exact: true }).fill("Lead reassigned to me");
    await takeover.getByLabel(/^Date of the basis/).fill(vietnamToday());
    await takeover.getByRole("textbox", { name: "Basis", exact: true }).fill("Handover call with the sale");
    await takeover.getByRole("button", { name: "Take over", exact: true }).click();
    await expect(takeover).toHaveCount(0, { timeout: 20_000 });
    await expect(panel(leader, "G1 Identification").getByRole("button", { name: "Save", exact: true })).toBeVisible();
  });

  test("W16-29, W16-45, W16-46: corrections in G3 and G8, an owner statement heard by the SALE, the air conditioner put back", async () => {
    // G3: the area the SALE measured needs a correction; the line keeps the SALE as observer.
    const g3 = panel(leader, "G3 Size and layout");
    const area = group(space(g3, "P1"), "Area (m2)");
    await area.getByRole("textbox", { name: "Area (m2)" }).fill("36");
    await save(g3);
    await expect(g3.getByText(C.seenBySale)).toBeVisible();
    await correct(g3, "Remeasured the room");
    await expectSaved(g3, fixture.leader.name);
    await expect(area).toContainText(`Measured at survey #1 by ${fixture.sale.name}`);
    await expect(area).toContainText(`entered by ${fixture.leader.name}`);
    await expect(area).toContainText(`Corrected by ${fixture.leader.name}: Remeasured the room`);

    // G8: the rent the SALE saw on site needs a correction too.
    const g8 = panel(leader, "G8 Rental terms");
    const rent = group(space(g8, "P1"), "Monthly rent (VND)");
    await rent.getByRole("textbox", { name: "Monthly rent (VND)" }).fill("5500000");
    await save(g8);
    await expect(g8.getByText(C.seenBySale)).toBeVisible();
    await correct(g8, "Owner raised the rent");
    await expectSaved(g8, fixture.leader.name);

    // An owner statement the SALE heard: "How it reached you" is asked, the line names the SALE as receiver.
    const deposit = group(space(g8, "P1"), "Deposit");
    await record(deposit);
    await deposit.getByRole("combobox", { name: "Deposit" }).selectOption({ label: "Months of rent" });
    await deposit.getByRole("textbox", { name: "Months of rent" }).fill("2");
    await deposit.getByRole("combobox", { name: "Source" }).selectOption({ label: "Owner said" });
    await deposit.getByLabel(/^Date the owner said it/).fill(vietnamToday());
    const receiver = deposit.getByRole("combobox", { name: "Who heard it" });
    await expect(receiver).toHaveValue("");
    await receiver.selectOption({ label: fixture.sale.name });
    await deposit.getByRole("textbox", { name: "How it reached you" }).fill("Sale's handover note");
    await save(g8);
    await expectSaved(g8, fixture.leader.name);
    await expect(deposit).toContainText(
      `Owner said on ${shown(vietnamToday())} (heard by ${fixture.sale.name}; passed on: Sale's handover note)`,
    );

    // W16-46: the SALE's air conditioner removed with a correction, ticked again: the server asks again.
    const g6 = panel(leader, "G6 Amenities and furniture");
    const shared = group(g6, "Shared amenities");
    await shared.getByRole("checkbox", { name: "Air conditioner" }).uncheck();
    await save(g6);
    await correct(g6, "The unit was removed by the owner");
    await expectSaved(g6, fixture.leader.name);
    await shared.getByRole("checkbox", { name: "Air conditioner" }).check();
    await save(g6);
    await expect(g6.getByText(C.needed)).toBeVisible({ timeout: 20_000 });
    await expect(shared.getByRole("checkbox", { name: "Air conditioner" })).toBeChecked();
    await correct(g6, "The owner put it back");
    await expectSaved(g6, fixture.leader.name);
    await expect(shared).toContainText(`Seen on site at survey #1 by ${fixture.sale.name}`);
  });

  test("W16-28, W16-27, W16-33: the snapshot view, leaving with unsaved changes asks first, phone width", async () => {
    await mainArea(leader).getByRole("button", { name: "View snapshot" }).click();
    await expect(mainArea(leader).getByRole("heading", { name: "Snapshot before takeover #1" })).toBeVisible({ timeout: 20_000 });
    await expect(byText(leader, C.legal)).toBeVisible();
    await expect(mainArea(leader)).toContainText("35.5 m2");
    await mainArea(leader).getByRole("button", { name: "Back to the checklist" }).click();

    const note = panel(leader, "G1 Identification").getByRole("textbox", { name: /^General note/ });
    const before = await note.inputValue();
    await note.fill(`${before} (draft)`);
    leader.once("dialog", (prompt) => void prompt.dismiss());
    await mainArea(leader).getByRole("link", { name: "Back to the lead" }).click();
    await expect(leader).toHaveURL(new RegExp(`/survey-checklists/${checklistId}`));
    await note.fill(before);

    await leader.setViewportSize({ width: 375, height: 800 });
    const nav = mainArea(leader).getByRole("navigation", { name: "Groups" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "G3 Size and layout" })).toBeVisible();
    expect(await leader.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await leader.setViewportSize(DESKTOP);
  });

  test("W16-32: on hold, the checklist is read-only with the reason", async () => {
    await mainArea(leader).getByRole("link", { name: "Back to the lead" }).click();
    await expectLeadDetail(leader, L13);
    await openEntry(leader);
    await entryStatus(leader).selectOption({ label: T.status.ON_HOLD });
    await entryActivity(leader).fill(uniqueText("owner travels"));
    await saveEntry(leader);
    await expect(detailHeader(leader)).toContainText(T.status.ON_HOLD, { timeout: 20_000 });
    await surveySection(leader).getByRole("link", { name: C.open }).click();
    await expect(byText(leader, C.leadStatus)).toBeVisible({ timeout: 20_000 });
    await expect(mainArea(leader).getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  });
});
