import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { expectSignedInAccount } from "../support/auth";
import {
  byText,
  DESKTOP,
  dialog,
  expectLeadDetail,
  expectListPage,
  fixture,
  historySection,
  leadLink,
  mainArea,
  newStaffContext,
  openLead,
  signInAs,
  T,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
} from "./support/staff";

// Submission and review of a survey checklist (survey-checklist submission spec 6.4; U-1..U-5), the flow in one line: the
// SALE fills and submits, the leader returns it for documents with one kitchen photo not accepted, the SALE starts
// revision #2, removes every carried kitchen photo (SV-211 P-1: the count that came over is not asserted, two on the
// server before SV-211 and one after it), uploads a new one and submits again, the leader passes it and the lead is Qualified. NOT_INDEPENDENT is covered by the server tests
// (S-5). Two answers are changed in the browser: a refusal whose read ends the review, and a 500 after the real decision
// committed (spec 9.5). Budget: 2 sign-ins (SALE, SALE_LEADER), navigation by links but for one crafted URL and one
// reload. No trace, video or screenshot in this project (playwright.workspace.config.ts): no photo may land in a file of
// the run.
//
// Needs the API of sunvibe-server scripts/dev/run-e2e-media-api (uploads, processing and submission on) and both seeds
// run again just before. Fixture L15 (SURVEY_SCHEDULED, long-term rent, E2E Sale, visited yesterday by E2E Sale) ends
// QUALIFIED with two revisions; a re-run of the lead seed clears them.

test.describe.configure({ mode: "serial", timeout: 300_000 });

const L15 = fixture.lead(15);

const R = {
  start: "Start checklist (survey #1)",
  firstGate: "Some required items are missing. See the list above.",
  submit: "Submit for review",
  frozen: "The submitted record and its photos can no longer be changed.",
  site: "A site record, not a legal, safety or photo-permission check.",
  readOnly: "This revision was submitted and can no longer be changed.",
  decidedReadOnly: "This revision was reviewed and can no longer be changed.",
  notReviewer: "Only a sale leader, a sales manager or an admin reviews.",
  mediaBanner: "Media v1: photo permission was not recorded.",
  reason: "Bring the land use paper",
  markReason: "The kitchen is out of focus",
  notes: "Keep the other photos",
  limitations: "The roof was not seen",
  startRevision: "Start revision #2",
  carried: "From revision #1",
  removeCarried: "Remove from this revision",
  passedScope: "Internal site record only. It is not a legal, ownership, photo-permission or advertising approval.",
  keptText: "What you typed is kept here, read-only.",
  leaveReview: "Your review is not sent yet and leaving drops it. Leave this page?",
  alreadyDecided: "This revision has a decision now. It is shown above.",
} as const;

const DECISION_CALL = /\/api\/v1\/staff\/survey-checklists\/[0-9A-Z]{26}\/decision$/;
const CHECKLIST_READ = /\/api\/v1\/staff\/survey-checklists\/[0-9A-Z]{26}$/;
/** The name of a frozen kitchen photo in the Review tab: the number tells the two apart (I-3). */
const KITCHEN_MARK = /^Not accepted: Photo #\d+ · Space P1 · Kitchen$/;

const panel = (page: Page, title: string): Locator => mainArea(page).getByRole("region", { name: title, exact: true });
const group = (scope: Locator, name: string): Locator => scope.getByRole("group", { name, exact: true });
const surveySection = (page: Page): Locator => mainArea(page).getByRole("region", { name: "Survey", exact: true });
const views = (page: Page): Locator => mainArea(page).getByRole("navigation", { name: "Checklist views" });
const uploadForm = (scope: Locator): Locator => scope.getByRole("region", { name: "Add photos", exact: true });
const uploadRows = (scope: Locator): Locator => scope.getByRole("region", { name: "Uploads", exact: true }).getByRole("listitem");
const submitPanel = (page: Page): Locator => panel(page, R.submit);
const decisionPanel = (page: Page): Locator => panel(page, "Review decision");
const queueRow = (page: Page): Locator => mainArea(page).getByRole("listitem").filter({ hasText: L15.code });

async function record(field: Locator): Promise<void> {
  await field.getByRole("radio", { name: "Recorded", exact: true }).check();
}

async function save(scope: Locator, name: string): Promise<void> {
  await scope.getByRole("button", { name: "Save", exact: true }).click();
  await expect(scope.getByRole("status")).toContainText(`by ${name}`, { timeout: 20_000 });
}

async function recordText(scope: Locator, name: string, text: string): Promise<void> {
  const field = group(scope, name);
  await record(field);
  await field.getByRole("textbox", { name }).fill(text);
}

async function recordChoice(scope: Locator, name: string, label: string): Promise<void> {
  const field = group(scope, name);
  await record(field);
  await field.getByRole("combobox", { name }).selectOption({ label });
}

async function recordCount(scope: Locator, name: string, value: string): Promise<void> {
  const field = group(scope, name);
  await record(field);
  await field.getByRole("textbox", { name }).fill(value);
  await field.getByRole("combobox", { name: "Source" }).selectOption({ label: "Seen on site" });
}

async function inspected(scope: Locator, name: string): Promise<void> {
  const field = group(scope, name);
  await record(field);
  await field.getByRole("combobox", { name: "Check" }).selectOption({ label: "Inspected (the whole area)" });
  await field.getByRole("combobox", { name: "Anything to note?" }).selectOption({ label: "Nothing seen" });
}

type Payload = { name: string; mimeType: string; buffer: Buffer };

/** A distinct synthetic JPEG drawn in the page: every photo has different bytes (survey-media A-16). */
async function drawnJpeg(page: Page, label: string, hue: number): Promise<Payload> {
  const dataUrl = await page.evaluate(
    ([text, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (context === null) return "";
      context.fillStyle = `hsl(${h} 55% 50%)`;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.font = "64px sans-serif";
      context.fillText(String(text), 60, 380);
      return canvas.toDataURL("image/jpeg", 0.9);
    },
    [label, hue] as const,
  );
  return { name: `${label.replace(/\W+/g, "-")}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(dataUrl.split(",")[1] ?? "", "base64") };
}

async function upload(scope: Locator, placement: string, category: string, file: Payload): Promise<void> {
  const form = uploadForm(scope);
  await form.getByRole("combobox", { name: "Placement" }).selectOption({ label: placement });
  await form.getByRole("combobox", { name: "Evidence category" }).selectOption({ label: category });
  await form.getByLabel("Choose photos", { exact: true }).setInputFiles(file);
}

/** The Submit panel's button, then the confirm dialog (U-1); the page answers with the status banner. */
async function submitRevision(page: Page): Promise<void> {
  await submitPanel(page).getByRole("button", { name: R.submit, exact: true }).click();
  const confirm = dialog(page, "Submit this checklist for review?");
  await expect(confirm.getByText(R.frozen, { exact: true })).toBeVisible();
  await expect(confirm.getByText(R.site, { exact: true })).toBeVisible();
  await confirm.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(mainArea(page).getByText(`Submitted by ${fixture.sale.name} on`)).toBeVisible({ timeout: 20_000 });
}

/** Opens the Reviews tab of the survey list from the workspace menu. */
async function openReviews(page: Page): Promise<void> {
  await page.getByRole("navigation", { name: T.menuLabel }).getByRole("link", { name: T.menuSurveys }).click();
  await page.getByRole("navigation", { name: "Survey lists" }).getByRole("link", { name: "Reviews", exact: true }).click();
  await expect(page).toHaveURL(/tab=reviews/, { timeout: 20_000 });
}

/** Sends the decision on screen and accepts the confirm step, which says where it takes the lead. */
async function sendDecision(page: Page, consequence: string): Promise<void> {
  await panel(page, "Decision").getByRole("button", { name: "Send decision", exact: true }).click();
  const confirm = dialog(page, "Send this decision?");
  await expect(confirm.getByText(consequence, { exact: true })).toBeVisible();
  await confirm.getByRole("button", { name: "Confirm decision", exact: true }).click();
}

test.describe("Checklist submission and review (survey-checklist submission W18b)", () => {
  let saleContext: BrowserContext;
  let sale: Page;
  let leaderContext: BrowserContext;
  let leader: Page;
  let firstChecklistUrl = "";

  test.beforeAll(async ({ browser }) => {
    test.skip(!(await workspaceE2eReady()), WORKSPACE_E2E_SKIP_REASON);
    const { baseURL } = test.info().project.use;
    saleContext = await browser.newContext({ baseURL, locale: "vi-VN", viewport: DESKTOP });
    sale = await saleContext.newPage();
    leaderContext = await newStaffContext(browser);
    leader = await leaderContext.newPage();
  });

  test.afterAll(async () => {
    await saleContext?.close();
    await leaderContext?.close();
  });

  test("U-1: the submit panel names the first failing gate until the checklist is complete, then the SALE submits", async () => {
    await signInAs(sale, "SALE");
    await expectSignedInAccount(sale);
    await sale.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(sale);
    await openLead(sale, L15);
    await surveySection(sale).getByRole("button", { name: R.start, exact: true }).click();
    await expect(sale).toHaveURL(/\/survey-checklists\/[0-9A-Z]{26}$/, { timeout: 20_000 });
    firstChecklistUrl = new URL(sale.url()).pathname;

    await expect(submitPanel(sale).getByText(R.firstGate, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(submitPanel(sale).getByRole("button", { name: R.submit, exact: true })).toHaveCount(0);

    // G1: the lead address, type, fit, the whole property with one space.
    const g1 = panel(sale, "G1 Identification");
    await g1.getByRole("button", { name: "Use the lead address" }).click();
    await recordChoice(g1, "Property type", "House");
    const fit = group(g1, "Fit with the rental scope");
    await record(fit);
    await fit.getByRole("combobox", { name: "Fit with the rental scope" }).selectOption({ label: "In scope" });
    await fit.getByRole("textbox", { name: "Why" }).fill("A whole house for long-term rent");
    await group(g1, "Rental scope").getByRole("radio", { name: "Whole property" }).check();
    const spaces = group(g1, "Spaces viewed");
    await spaces.getByRole("button", { name: "Add a space" }).click();
    await spaces.getByRole("textbox", { name: "Code" }).fill("P1");
    await spaces.getByRole("textbox", { name: "Where it is" }).fill("The whole house");
    await save(g1, fixture.sale.name);

    // G2, G3, G4, G5: every direct check of the single space.
    const g2 = panel(sale, "G2 Private and shared parts");
    await recordText(g2, "Way in", "Front gate from the street");
    await recordText(g2, "Shared areas", "None, the whole house is rented");
    await recordText(g2, "Floor", "Ground and first floor");
    await recordText(g2, "Private areas", "Every room of the house");
    await recordChoice(g2, "How far you got in", "Entered all of it");
    await save(g2, fixture.sale.name);

    const g3 = panel(sale, "G3 Size and layout");
    const area = group(g3, "Area (m2)");
    await record(area);
    await area.getByRole("textbox", { name: "Area (m2)" }).fill("80");
    await area.getByRole("combobox", { name: "Source" }).selectOption({ label: "Measured" });
    await recordCount(g3, "Bedrooms", "2");
    await recordCount(g3, "Private bathrooms", "1");
    const shared = group(g3, "Uses a shared bathroom");
    await record(shared);
    await shared.getByRole("combobox", { name: "Uses a shared bathroom" }).selectOption({ label: "No" });
    await shared.getByRole("combobox", { name: "Source" }).selectOption({ label: "Seen on site" });
    await save(g3, fixture.sale.name);

    const g4 = panel(sale, "G4 Condition and availability");
    await recordChoice(g4, "Occupancy on the visit day", "Vacant");
    await inspected(g4, "Main space");
    await inspected(g4, "Kitchen");
    await inspected(g4, "Bathroom");
    await save(g4, fixture.sale.name);

    const g5 = panel(sale, "G5 Access and risks");
    await recordText(g5, "Ways in and out", "Front door and back door");
    await recordChoice(g5, "Access restrictions", "None seen");
    await g5.getByRole("radiogroup", { name: "Risks" }).getByRole("radio", { name: "None seen", exact: true }).check();
    await save(g5, fixture.sale.name);

    // G7: the required pairs and a second kitchen photo.
    const g7 = panel(sale, "G7 Photos");
    await expect(uploadForm(g7)).toBeVisible({ timeout: 90_000 });
    let hue = 10;
    for (const [placement, category, label] of [
      ["Asset (whole property)", "Exterior and access", "front"],
      ["Space P1", "Main space", "main"],
      ["Space P1", "Kitchen", "kitchen one"],
      ["Space P1", "Kitchen", "kitchen two"],
      ["Space P1", "Bathroom", "bathroom"],
    ] as const) {
      await upload(g7, placement, category, await drawnJpeg(sale, label, (hue += 40)));
    }
    await expect(uploadRows(g7).filter({ hasText: "Ready" })).toHaveCount(5, { timeout: 180_000 });

    await expect(submitPanel(sale).getByRole("button", { name: R.submit, exact: true })).toBeVisible({ timeout: 30_000 });
    await submitRevision(sale);

    // The revision is frozen: read-only, no inputs, no submit panel.
    await expect(mainArea(sale).getByText(R.readOnly, { exact: true })).toBeVisible();
    await expect(submitPanel(sale)).toHaveCount(0);
    await expect(mainArea(sale).getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  });

  test("U-2: the queue tells the SALE why not; the leader finds the revision and its Review tab", async () => {
    await openReviews(sale);
    await expect(queueRow(sale).getByText(R.notReviewer, { exact: true })).toBeVisible({ timeout: 20_000 });
    await queueRow(sale).getByRole("link", { name: "Open checklist #1", exact: true }).click();
    await expect(sale).toHaveURL(new RegExp(`${firstChecklistUrl}$`), { timeout: 20_000 });
    await expect(views(sale).getByRole("link", { name: "Review", exact: true })).toHaveCount(0);

    // A crafted URL opens no review for a viewer who cannot review: the page falls back to Edit.
    await sale.goto(`${firstChecklistUrl}?tab=review`);
    await expect(mainArea(sale).getByText(R.readOnly, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(panel(sale, "Decision")).toHaveCount(0);

    await signInAs(leader, "SALE_LEADER");
    await expectSignedInAccount(leader);
    await leader.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(leader);
    await openReviews(leader);
    await expect(queueRow(leader).getByText("You can review this", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(queueRow(leader)).toContainText(`Submitted by ${fixture.sale.name} on`);
    await queueRow(leader).getByRole("link", { name: "Review checklist #1", exact: true }).click();
    await expect(leader).toHaveURL(/\?tab=review$/, { timeout: 20_000 });
    await expect(byText(leader, R.mediaBanner)).toBeVisible({ timeout: 20_000 });
  });

  test("Review Focus 2: a refusal whose read ends the review keeps the form, read-only, with the reason", async () => {
    const form = panel(leader, "Decision");
    await group(form, "Outcome").getByRole("radio", { name: "Needs changes", exact: true }).check();
    await group(form, "What is needed").getByRole("radio", { name: "Documents only", exact: true }).check();
    await form.getByRole("textbox", { name: /^Reason/ }).fill(R.reason);
    const photos = panel(leader, "Submitted photos");
    await photos.getByRole("checkbox", { name: KITCHEN_MARK }).first().check();
    await photos.getByRole("textbox", { name: /^Why it is not accepted/ }).fill(R.markReason);

    // Typed review text lives only in this page: leaving asks first, and "Stay" keeps it.
    const asked: string[] = [];
    leader.once("dialog", (prompt) => {
      asked.push(prompt.message());
      void prompt.dismiss();
    });
    await leader.getByRole("link", { name: "Back to the lead" }).click();
    await expect.poll(() => asked).toEqual([R.leaveReview]);
    await expect(form.getByRole("textbox", { name: /^Reason/ })).toHaveValue(R.reason);

    // The lead left Survey Scheduled meanwhile: the decision is refused and the read says the review is over.
    await leader.route(DECISION_CALL, (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ code: "CHECKLIST_DECISION_NOT_ALLOWED", message: "x", errors: [{ field: "lead.status", message: "x" }] }),
      }),
    );
    await leader.route(CHECKLIST_READ, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, review: { canReview: false, reason: "LEAD_STATUS", decisionBlockedBy: [] } } });
    });
    await sendDecision(leader, "The lead stays in Survey Scheduled and the assignee can start a new revision on this visit.");

    await expect(form.getByText(R.keptText, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(form.getByText("The lead is not in Survey Scheduled.", { exact: true }).first()).toBeVisible();
    await expect(form.getByRole("textbox", { name: /^Reason/ })).toHaveValue(R.reason);
    await expect(form.getByRole("textbox", { name: /^Reason/ })).toBeDisabled();
    await expect(photos.getByRole("textbox", { name: /^Why it is not accepted/ })).toHaveValue(R.markReason);
    await expect(photos.getByRole("textbox", { name: /^Why it is not accepted/ })).toBeDisabled();
    await expect(form.getByRole("button", { name: "Send decision", exact: true })).toBeDisabled();
    await expect(panel(leader, "Earlier decisions")).toHaveCount(0);
    await leader.unrouteAll({ behavior: "wait" });

    // The typed text still guards the page: the reload asks first.
    leader.once("dialog", (prompt) => void prompt.accept());
    await leader.reload();
    await expect(byText(leader, R.mediaBanner)).toBeVisible({ timeout: 20_000 });
    await expect(mainArea(leader).getByText(R.keptText, { exact: true })).toHaveCount(0);
  });

  test("U-3: NEEDS_CHANGES asks for a kind and a reason; a mark keeps PASSED off; the decision reaches every viewer", async () => {
    const form = panel(leader, "Decision");
    await group(form, "Outcome").getByRole("radio", { name: "Needs changes", exact: true }).check();
    await form.getByRole("button", { name: "Send decision", exact: true }).click();
    await expect(form.getByText("Choose one.", { exact: true })).toBeVisible();
    await expect(form.getByText("Fill in this field.", { exact: true })).toBeVisible();

    // One of the two kitchen photos is not accepted: PASSED turns off and says why.
    const photos = panel(leader, "Submitted photos");
    await expect(photos.getByRole("checkbox", { name: KITCHEN_MARK })).toHaveCount(2);
    await photos.getByRole("checkbox", { name: KITCHEN_MARK }).first().check();
    await photos.getByRole("textbox", { name: /^Why it is not accepted/ }).fill(R.markReason);
    await expect(group(form, "Outcome").getByRole("radio", { name: "Passed", exact: true })).toBeDisabled();
    await expect(form.getByText("A photo is marked Not accepted.", { exact: true })).toBeVisible();

    await group(form, "What is needed").getByRole("radio", { name: "Documents only", exact: true }).check();
    await form.getByRole("textbox", { name: /^Reason/ }).fill(R.reason);
    await form.getByRole("textbox", { name: /^Notes/ }).fill(R.notes);
    await sendDecision(leader, "The lead stays in Survey Scheduled and the assignee can start a new revision on this visit.");

    await expect(mainArea(leader).getByText("Needs changes (documents) · reviewed by")).toBeVisible({ timeout: 20_000 });
    await expect(views(leader).getByRole("link", { name: "Review", exact: true })).toHaveCount(0);
    await expect(decisionPanel(leader).getByText(R.reason, { exact: true })).toBeVisible();
    await expect(decisionPanel(leader)).toContainText(new RegExp(`Photo #\\d+ · Space P1 · Kitchen: ${R.markReason}`));

    // The review text stays on this page: never in the URL, never in the History of the lead.
    expect(leader.url()).not.toContain("land");
    await leader.getByRole("link", { name: "Back to the lead" }).click();
    await expectLeadDetail(leader, L15);
    await expect(historySection(leader)).toContainText("Checklist #1 reviewed: Needs changes");
    await expect(historySection(leader)).not.toContainText(R.reason);
    await expect(historySection(leader)).not.toContainText(R.markReason);
  });

  test("U-5: revision #2 keeps the values and photos; a carried photo leaves this revision only", async () => {
    await sale.getByRole("link", { name: "Back to the lead" }).click();
    await expectLeadDetail(sale, L15);
    await surveySection(sale).getByRole("button", { name: R.startRevision, exact: true }).click();
    await expect(sale).toHaveURL(/\/survey-checklists\/[0-9A-Z]{26}$/, { timeout: 20_000 });
    await expect(sale).not.toHaveURL(new RegExp(`${firstChecklistUrl}$`));
    await expect(sale.getByRole("heading", { level: 1, name: "Checklist #2" })).toBeVisible({ timeout: 20_000 });

    // The copied value keeps its original provenance.
    const g3 = panel(sale, "G3 Size and layout");
    await expect(group(g3, "Area (m2)")).toContainText(`Measured at survey #1 by ${fixture.sale.name}`);

    // How many photos come over is the server's business (SV-211 stops copying the refused one): the test counts none. It
    // takes every carried card out of the Kitchen group of Space P1, one by one, until the group holds none.
    const g7 = panel(sale, "G7 Photos");
    // The group is a div of its heading and its cards, with no role of its own: the heading's parent is the group.
    const kitchenGroup = g7.getByRole("heading", { level: 4, name: "Space P1 · Kitchen", exact: true }).locator("xpath=..");
    const carriedKitchen = kitchenGroup.getByRole("listitem").filter({ hasText: R.carried });
    const confirm = sale.getByRole("dialog", { name: /from this revision\?$/ });
    await expect(carriedKitchen.first()).toBeVisible({ timeout: 30_000 });
    for (let left = await carriedKitchen.count(); left > 0; left = await carriedKitchen.count()) {
      await carriedKitchen.first().getByRole("button", { name: R.removeCarried, exact: true }).click();
      await expect(confirm.getByText("The photo leaves this revision only. It stays in revision #1 and its file is kept.", { exact: true })).toBeVisible();
      await confirm.getByRole("button", { name: R.removeCarried, exact: true }).click();
      await expect(carriedKitchen).toHaveCount(left - 1, { timeout: 30_000 });
      await expect(confirm).toHaveCount(0);
    }

    // No kitchen photo is left, so the required pair is missing: the panel names the gate and offers no Submit.
    await expect(submitPanel(sale).getByText(R.firstGate, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(submitPanel(sale).getByRole("button", { name: R.submit, exact: true })).toHaveCount(0);

    // A new kitchen photo fills the pair again once its upload row reads Ready.
    await expect(uploadForm(g7)).toBeVisible({ timeout: 90_000 });
    await upload(g7, "Space P1", "Kitchen", await drawnJpeg(sale, "kitchen three", 250));
    await expect(uploadRows(g7).filter({ hasText: "Ready" })).toHaveCount(1, { timeout: 180_000 });

    await expect(submitPanel(sale).getByRole("button", { name: R.submit, exact: true })).toBeVisible({ timeout: 30_000 });
    await submitRevision(sale);

    // Revision #1 still shows all five photos.
    await sale.getByRole("link", { name: "Back to the lead" }).click();
    await expectLeadDetail(sale, L15);
    await surveySection(sale).getByText(/^Earlier appointments/).click();
    await surveySection(sale).getByRole("link", { name: "Open checklist #1", exact: true }).click();
    await expect(sale.getByRole("heading", { level: 1, name: "Checklist #1" })).toBeVisible({ timeout: 20_000 });
    await expect(mainArea(sale).getByText(R.decidedReadOnly, { exact: true })).toBeVisible();
    await expect(mainArea(sale).getByText("Ready", { exact: true })).toHaveCount(5, { timeout: 30_000 });
  });

  test("U-3, U-4: the leader sees the earlier decision, passes revision #2 and the lead is Qualified in detail and list", async () => {
    await openReviews(leader);
    await queueRow(leader).getByRole("link", { name: "Review checklist #2", exact: true }).click();
    await expect(leader).toHaveURL(/\?tab=review$/, { timeout: 20_000 });
    const earlier = panel(leader, "Earlier decisions");
    await expect(earlier).toContainText("Checklist #1: Needs changes (documents)", { timeout: 20_000 });
    await expect(earlier).toContainText(R.reason);
    // RU-2: revision #2 does not hold the refused photo, so the mark reads by its pair alone, with no photo number.
    await expect(earlier.getByText(`Space P1 · Kitchen: ${R.markReason}`, { exact: true })).toBeVisible();

    const form = panel(leader, "Decision");
    await group(form, "Outcome").getByRole("radio", { name: "Passed", exact: true }).check();
    await form.getByRole("textbox", { name: /^Limitations/ }).fill(R.limitations);

    // Spec 9.5: the decision commits, its answer fails. The page reads first and shows the decision, not an error.
    await leader.route(DECISION_CALL, async (route) => {
      await route.fetch();
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "INTERNAL_ERROR", message: "x", errors: [] }) });
    });
    await sendDecision(leader, "The lead moves to Qualified.");
    await expect(mainArea(leader).getByText("Passed · reviewed by")).toBeVisible({ timeout: 20_000 });
    await expect(mainArea(leader).getByText(R.alreadyDecided, { exact: true })).toBeVisible();
    await expect(mainArea(leader).getByRole("alert")).toHaveCount(0);
    await leader.unrouteAll({ behavior: "wait" });
    await expect(decisionPanel(leader).getByText(R.limitations, { exact: true })).toBeVisible();
    await expect(decisionPanel(leader).getByText(R.passedScope, { exact: true })).toBeVisible();

    await leader.getByRole("link", { name: "Back to the lead" }).click();
    await expectLeadDetail(leader, L15);
    await expect(mainArea(leader).getByText("Qualified", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(historySection(leader)).toContainText("Checklist #2 reviewed: Passed");

    // The SALE's list opens on the open set, which holds Qualified.
    await sale.getByRole("navigation", { name: T.menuLabel }).getByRole("link", { name: T.menuOwnerLeads }).click();
    await expectListPage(sale);
    await expect(leadLink(sale, L15).first()).toBeVisible({ timeout: 20_000 });
    await expect(mainArea(sale).getByRole("row").filter({ hasText: L15.code })).toContainText("Qualified");
  });
});
