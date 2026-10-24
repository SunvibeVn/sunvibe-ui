import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { expectSignedInAccount } from "../support/auth";
import {
  assigneeOption,
  byText,
  detailHeader,
  DESKTOP,
  dialog,
  entryActivity,
  entryStatus,
  expectLeadDetail,
  expectListPage,
  fixture,
  findLeadLink,
  historySection,
  isDetailCall,
  mainArea,
  newStaffContext,
  openEntry,
  openLead,
  PHONE,
  recordApiCalls,
  saveEntry,
  signInAs,
  T,
  uniqueText,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
} from "./support/staff";

// Survey appointments in the staff workspace (survey-schedule spec 6.9): W15-31..W15-38 and Review Focus 3 and 5.
// The SALE works in a browser set to New York time: every time is typed and shown as Vietnam time. Budget: 2 sign-ins
// (SALE, SALE_LEADER), full loads: the SALE's L11 URL after the reassignment.
//
// Fixtures changed, in this order (the tests depend on it): on L11 (CONTACTED, long-term rent, E2E Sale) survey #1 is
// booked, edited, confirmed and visited, re-survey #2 booked; L12 (ASSIGNED, sale intent, E2E Sale) changes its
// requirement to long-term rent and gets survey #1 at the time of L11 #2 (overlap); the leader records #2 for the
// SALE (proxy), books #3, takes L11 over, puts it on hold (#3 cancelled) and resumes it; the leader cancels L12 #1. Run both seeds again before
// every `npm run e2e:workspace`. This project runs after admin.spec.ts (playwright.workspace.config.ts).

test.describe.configure({ mode: "serial", timeout: 150_000 });

const L11 = fixture.lead(11);
const L12 = fixture.lead(12);
const LEADER_OPTION = assigneeOption(fixture.leader.name, "Sale leader");

const S = {
  section: "Survey",
  empty: "No survey appointments yet",
  book: "Book survey",
  bookResurvey: "Book re-survey",
  resume: "Resume survey",
  edit: "Edit",
  editTitle: "Edit appointment",
  confirm: "Mark owner confirmed",
  visit: "Record visit",
  cancel: "Cancel appointment",
  cancelReason: "Cancel reason",
  cancelDescription: "Description",
  save: "Save",
  saving: "Saving…",
  start: "Start (Vietnam time)",
  ownerConfirmed: "Owner confirmed",
  notConfirmed: "Not confirmed by the owner",
  reconfirmTime: "Needs reconfirmation (time changed)",
  removesConfirmation: "Changing the time or the place removes the owner confirmation.",
  reason: "Reason for the change",
  resurveyReason: "Re-survey reason",
  visitNote: "Visit note",
  performer: "Who reached the property",
  proxyReason: "Reason for the record",
  basisDate: "Date of the confirmation",
  basisText: "How it was confirmed",
  resumeReason: "Reason",
  resumeDate: "Date the owner confirmed",
  resumeText: "What the owner confirmed",
  overlapTitle: "The surveyor has other appointments at this time",
  saved: "Saved.",
  blockedIntent: "Change the requirement to a rental before booking",
  requirementButton: "Change requirement",
  requirementTitle: "Change requirement",
  newIntent: "New requirement",
  perMonth: "Price per month (VND)",
  perNight: "Price per night (VND)",
  noPrice: "No price until confirmed",
  requirementReason: "Reason",
  agreedOn: "Date the owner agreed",
  agreedHow: "How the owner agreed",
  requirementSaved: "Requirement changed.",
  surveysTitle: "Surveys",
  tabsLabel: "Survey lists",
  mySurveys: "My Surveys",
  allSurveys: "All Surveys",
  surveyor: "Surveyor",
  emptyFiltered: "No scheduled surveys for this surveyor.",
} as const;

/** Vietnam is UTC+7 all year. */
const VIETNAM_MS = 7 * 60 * 60 * 1000;

/** `yyyy-MM-ddTHH:mm` (a `datetime-local` value) of an instant in Vietnam wall time. */
const vietnamInput = (ms: number): string => new Date(ms + VIETNAM_MS).toISOString().slice(0, 16);
/** `dd/MM/yyyy HH:mm` of an instant in Vietnam time, as the workspace shows it. */
const vietnamShown = (ms: number): string => {
  const [date, time] = vietnamInput(ms).split("T");
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year} ${time}`;
};
/** Today's date in Vietnam (`yyyy-MM-dd`). */
const vietnamToday = (): string => vietnamInput(Date.now()).slice(0, 10);
/** A whole minute `minutes` from now (rounded up), so the start is never before the current minute. */
const minutesAhead = (minutes: number): number => Math.ceil((Date.now() + minutes * 60_000) / 60_000) * 60_000;

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A control by the start of its label (a required label ends with "*", an optional one with "(optional)"). */
const field = (scope: Locator, label: string): Locator => scope.getByLabel(new RegExp(`^${escape(label)}`));

const surveySection = (page: Page): Locator => mainArea(page).getByRole("region", { name: S.section, exact: true });
const lastHistoryRow = (page: Page): Locator => historySection(page).locator("tbody tr").last();
const isSurveyRead = (call: { method: string; url: URL }): boolean =>
  call.method === "GET" && call.url.pathname.endsWith("/survey");

/** Saves an open survey dialog and waits until it closed with "Saved.". */
async function saveDialog(page: Page, title: string): Promise<void> {
  const open = dialog(page, title);
  await open.getByRole("button", { name: S.save, exact: true }).click();
  await expect(open).toHaveCount(0, { timeout: 20_000 });
  await expect(surveySection(page).getByText(S.saved, { exact: true })).toBeVisible();
}

test.describe("Survey appointments (survey-schedule W15b)", () => {
  let saleContext: BrowserContext;
  let sale: Page;
  let leaderContext: BrowserContext;
  let leader: Page;
  /** The start of L11's re-survey #2: L12's booking overlaps it (W15-33). */
  let resurveyStart = 0;

  test.beforeAll(async ({ browser }) => {
    test.skip(!(await workspaceE2eReady()), WORKSPACE_E2E_SKIP_REASON);
    const { baseURL } = test.info().project.use;
    // Review Focus 3: the SALE's laptop runs in another time zone; the workspace still reads and writes Vietnam time.
    saleContext = await browser.newContext({ baseURL, locale: "vi-VN", viewport: DESKTOP, timezoneId: "America/New_York" });
    sale = await saleContext.newPage();
    leaderContext = await newStaffContext(browser);
    leader = await leaderContext.newPage();
  });

  test.afterAll(async () => {
    await saleContext?.close();
    await leaderContext?.close();
  });

  test("W15-31, W15-32, W15-36, W15-38, Review Focus 3 and 5: the SALE books L11 in Vietnam time; every button waits for the answer", async () => {
    await signInAs(sale, "SALE");
    await expectSignedInAccount(sale);
    await sale.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(sale);
    // W15-36: My Leads holds Survey Scheduled by default; L11 (Contacted) is on it.
    await openLead(sale, L11);

    const section = surveySection(sale);
    await expect(section.getByText(S.empty)).toBeVisible({ timeout: 20_000 });
    const calls = recordApiCalls(sale);

    await section.getByRole("button", { name: S.book, exact: true }).click();
    const book = dialog(sale, S.book);
    await expect(book).toBeVisible();
    await expect(book.getByRole("region", { name: "Summary" })).toContainText(S.notConfirmed);
    const start = minutesAhead(30);
    await field(book, S.start).fill(vietnamInput(start));
    await book.getByRole("checkbox", { name: S.ownerConfirmed }).check();
    await expect(book.getByRole("region", { name: "Summary" })).toContainText(vietnamShown(start));
    await expect(book.getByRole("region", { name: "Summary" })).toContainText(S.ownerConfirmed);

    // Review Focus 5: while the booking is on its way every command of the page is locked.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await sale.route("**/api/v1/staff/owner-leads/*/survey-appointments", async (route) => {
      await held;
      await route.continue();
    });
    const fromSave = calls.length;
    // A double click on Save sends one booking (the second submit waits behind the first and sends nothing).
    await book.getByRole("button", { name: S.save, exact: true }).dblclick();
    // The modal makes the page behind it inert: those buttons are looked up with `includeHidden`.
    await expect(historySection(sale).getByRole("button", { name: T.addEntry, includeHidden: true })).toBeDisabled();
    await expect(mainArea(sale).getByRole("button", { name: S.requirementButton, includeHidden: true })).toBeDisabled();
    // While the booking runs the submit button reads "Saving…" and is disabled.
    await expect(book.getByRole("button", { name: S.saving, exact: true })).toBeDisabled();
    release();
    await expect(book).toHaveCount(0, { timeout: 20_000 });
    await sale.unroute("**/api/v1/staff/owner-leads/*/survey-appointments");

    // W15-31, W15-38: Vietnam time whatever the browser zone; the confirmation label; the status and History updated
    // from the answer, without another read (A-23).
    await expect(section).toContainText("Survey #1");
    await expect(section).toContainText(vietnamShown(start));
    await expect(section).toContainText("60 min");
    await expect(section).toContainText(fixture.sale.name);
    await expect(section.getByText(S.ownerConfirmed, { exact: true }).first()).toBeVisible();
    await expect(detailHeader(sale)).toContainText(T.status.SURVEY_SCHEDULED);
    await expect(lastHistoryRow(sale)).toContainText("Survey booked · #1");
    await expect(historySection(sale).getByRole("button", { name: T.addEntry })).toBeEnabled();
    const after = calls.slice(fromSave);
    expect(after.filter((call) => call.method === "POST"), "one booking sent").toHaveLength(1);
    expect(after.filter((call) => isDetailCall(call, L11.id) || isSurveyRead(call)), "reads after the booking").toHaveLength(0);
  });

  test("W15-32, W15-35: edit removes the confirmation, confirm again, own visit, STATUS options from Survey Scheduled, re-survey", async () => {
    const section = surveySection(sale);

    await section.getByRole("button", { name: S.edit, exact: true }).click();
    const edit = dialog(sale, S.editTitle);
    await field(edit, S.start).fill(vietnamInput(minutesAhead(45)));
    await expect(edit.getByText(S.removesConfirmation)).toBeVisible();
    await field(edit, S.reason).fill("Owner asked for later");
    await saveDialog(sale, S.editTitle);
    await expect(section).toContainText(S.reconfirmTime);
    await expect(lastHistoryRow(sale)).toContainText("Survey changed · #1");

    await section.getByRole("button", { name: S.confirm, exact: true }).click();
    await saveDialog(sale, S.confirm);
    await expect(section.getByText(S.ownerConfirmed, { exact: true }).first()).toBeVisible();
    await expect(lastHistoryRow(sale)).toContainText("Owner confirmation recorded · #1");

    await section.getByRole("button", { name: S.visit, exact: true }).click();
    const visit = dialog(sale, S.visit);
    // The surveyor's own record: no performer choice and no proxy fields.
    await expect(field(visit, S.performer)).toHaveCount(0);
    await expect(field(visit, S.proxyReason)).toHaveCount(0);
    await field(visit, S.visitNote).fill("Met the owner at the gate");
    await saveDialog(sale, S.visit);
    await expect(lastHistoryRow(sale)).toContainText("Site visit recorded · #1");
    await expect(detailHeader(sale)).toContainText(T.status.SURVEY_SCHEDULED);
    await expect(section.getByRole("button", { name: S.bookResurvey, exact: true })).toBeVisible();

    // W15-35: from Survey Scheduled the STATUS select offers only On Hold and the three closing statuses.
    await openEntry(sale);
    await expect(entryStatus(sale).locator("option")).toHaveText([
      T.keepStatus(T.status.SURVEY_SCHEDULED),
      T.status.ON_HOLD,
      T.status.DUPLICATE,
      T.status.REJECTED,
      T.status.WITHDRAWN,
    ]);
    await historySection(sale).getByRole("button", { name: T.hideEntry }).click();

    await section.getByRole("button", { name: S.bookResurvey, exact: true }).click();
    const resurvey = dialog(sale, S.bookResurvey);
    resurveyStart = minutesAhead(30);
    await field(resurvey, S.start).fill(vietnamInput(resurveyStart));
    await field(resurvey, S.resurveyReason).fill("Owner renovated the kitchen");
    await saveDialog(sale, S.bookResurvey);
    await expect(section).toContainText("Re-survey #2");
    await expect(section).toContainText("Follows visit #1");
    await expect(section.getByText(S.notConfirmed, { exact: true }).first()).toBeVisible();
    await expect(lastHistoryRow(sale)).toContainText("Survey booked · #2");
  });

  test("W15-34 and W15-33: L12 changes its requirement, then a booking that overlaps L11's re-survey warns and still saves", async () => {
    await sale.getByRole("link", { name: T.back }).click();
    await expectListPage(sale);
    await openLead(sale, L12);
    const section = surveySection(sale);
    await expect(section.getByText(S.blockedIntent)).toBeVisible({ timeout: 20_000 });

    await mainArea(sale).getByRole("button", { name: S.requirementButton }).click();
    const change = dialog(sale, S.requirementTitle);
    const intent = field(change, S.newIntent);
    // A sale lead may move to either rental; never to sale.
    await expect(intent.locator("option")).toHaveText(["Choose a requirement", "Short-term rental", "Long-term rental"]);
    await intent.selectOption({ label: "Short-term rental" });
    await expect(field(change, S.perNight)).toBeVisible();
    await intent.selectOption({ label: "Long-term rental" });
    await expect(field(change, S.perMonth)).toBeVisible();
    await change.getByRole("checkbox", { name: S.noPrice }).check();
    await field(change, S.requirementReason).fill("Owner wants long stays");
    await field(change, S.agreedOn).fill(vietnamToday());
    await field(change, S.agreedHow).fill("Owner said so on the phone");
    await change.getByRole("button", { name: S.save, exact: true }).click();
    await expect(change).toHaveCount(0, { timeout: 20_000 });
    await expect(byText(sale, S.requirementSaved)).toBeVisible();
    await expect(detailHeader(sale)).toContainText(T.status.CONTACTED);
    await expect(section).toContainText("Sale → Long-term rental");
    await expect(section).toContainText("Requirement cycle 2");
    await expect(lastHistoryRow(sale)).toContainText("Requirement changed");

    await section.getByRole("button", { name: S.book, exact: true }).click();
    const book = dialog(sale, S.book);
    await field(book, S.start).fill(vietnamInput(resurveyStart));
    // W15-33: the pre-check warns before saving (code and time only) ...
    await expect(book.getByText(S.overlapTitle)).toBeVisible({ timeout: 20_000 });
    await expect(book.getByText(new RegExp(`${L11.code} · ${escape(vietnamShown(resurveyStart))}`))).toBeVisible();
    // ... and saving stays possible.
    await saveDialog(sale, S.book);
    await expect(section).toContainText("Survey #1");
    await expect(section.getByText(S.overlapTitle)).toBeVisible();
  });

  test("W15-37: /workspace/surveys for the SALE: My Surveys only, groups, no private fields, phone cards, no prefetch", async () => {
    const calls = recordApiCalls(sale);
    await sale.getByRole("navigation", { name: T.menuLabel }).getByRole("link", { name: T.menuSurveys }).click();
    await expect(sale.getByRole("heading", { level: 1, name: S.surveysTitle })).toBeAttached({ timeout: 20_000 });
    await expect(sale).toHaveURL((url) => url.pathname === "/workspace/surveys" && url.search === "?scope=mine");
    await expect(sale.getByRole("navigation", { name: S.tabsLabel }).getByRole("link")).toHaveText([S.mySurveys]);
    await expect(mainArea(sale).locator("thead").getByRole("columnheader")).toHaveText([
      "WHEN",
      "DURATION",
      "CODE",
      "OWNER",
      "WARD / COMMUNE",
      "SURVEYOR",
      "CONFIRMATION",
      "FLAG",
      "ACTION",
    ]);
    for (const lead of [L11, L12]) {
      await expect(mainArea(sale).getByRole("link", { name: `View the survey of lead ${lead.code}` })).toBeVisible();
    }
    // The group headers: bookings start 30 to 60 minutes ahead, so Today (Upcoming only just before midnight).
    await expect(mainArea(sale).locator("tbody th").first()).toHaveText(/^(Today|Upcoming)$/);
    const text = await mainArea(sale).innerText();
    for (const secret of ["25 Trần Phú", "18 Núi Thành", L11.phoneTail, L12.phoneTail]) expect(text).not.toContain(secret);

    // No prefetch: hovering "View" sends no detail request, neither to the API nor a Next prefetch (RSC) of the page.
    const fromHover = calls.length;
    const prefetches: string[] = [];
    const onRequest = (request: { url(): string; headers(): Record<string, string> }) => {
      const url = new URL(request.url());
      const rsc = url.searchParams.has("_rsc") || "next-router-prefetch" in request.headers() || "rsc" in request.headers();
      if (rsc && url.pathname.startsWith("/workspace/owner-leads/")) prefetches.push(url.pathname);
    };
    sale.on("request", onRequest);
    await mainArea(sale).getByRole("link", { name: `View the survey of lead ${L11.code}` }).hover();
    // A negative check needs a short settle: a hover prefetch would have started by now.
    await sale.waitForTimeout(750);
    sale.off("request", onRequest);
    expect(calls.slice(fromHover).filter((call) => isDetailCall(call) || isSurveyRead(call))).toHaveLength(0);
    expect(prefetches).toEqual([]);
    // A SALE never asks for every survey.
    expect(calls.filter((call) => call.url.searchParams.get("scope") === "all")).toHaveLength(0);

    // Below `md` the rows are cards.
    await sale.setViewportSize(PHONE);
    const card = mainArea(sale).getByRole("listitem").filter({ hasText: L12.code });
    await expect(card).toBeVisible();
    await expect(card.getByRole("link", { name: `View the survey of lead ${L12.code}` })).toBeVisible();
    await sale.setViewportSize(DESKTOP);
  });

  test("W15-32: the leader records L11 #2 for the SALE (proxy), books #3, takes L11 over (the SALE loses it), holds and resumes", async () => {
    await signInAs(leader, "SALE_LEADER");
    await expectSignedInAccount(leader);
    await leader.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(leader);
    await leader.getByLabel(T.assigneeFilter, { exact: true }).selectOption(fixture.sale.id);
    await expect(leader).toHaveURL(new RegExp(`assignee=${fixture.sale.id}`));
    await (await findLeadLink(leader, L11)).click();
    await expectLeadDetail(leader, L11);
    const section = surveySection(leader);
    await expect(section).toContainText("Re-survey #2", { timeout: 20_000 });

    await section.getByRole("button", { name: S.visit, exact: true }).click();
    const visit = dialog(leader, S.visit);
    await expect(field(visit, S.performer)).toHaveValue(fixture.sale.id);
    await expect(visit.getByText("This record is made for someone else")).toBeVisible();
    await field(visit, S.visitNote).fill("The sale reached the gate");
    await field(visit, S.proxyReason).fill("The sale had no signal on site");
    await field(visit, S.basisDate).fill(vietnamToday());
    await field(visit, S.basisText).fill("The sale called me from the site");
    await saveDialog(leader, S.visit);
    await expect(lastHistoryRow(leader)).toContainText("Site visit recorded · #2");

    await section.getByRole("button", { name: S.bookResurvey, exact: true }).click();
    const resurvey = dialog(leader, S.bookResurvey);
    await field(resurvey, S.start).fill(vietnamInput(minutesAhead(60)));
    await field(resurvey, S.resurveyReason).fill("Owner added a floor");
    await saveDialog(leader, S.bookResurvey);
    await expect(section).toContainText("Re-survey #3");

    // The appointment follows the reassignment (US-2 AC-3).
    await leader.getByRole("button", { name: T.reassign }).click();
    const assign = dialog(leader, "Reassign lead");
    await assign.getByRole("combobox").selectOption({ label: LEADER_OPTION });
    await assign.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(byText(leader, T.assignSaved)).toBeVisible();
    await expect(section).toContainText(fixture.leader.name, { timeout: 20_000 });

    // The former SALE can no longer open the lead (nothing of it stays, BR-1).
    await sale.goto(L11.path);
    await expect(byText(sale, T.leadNotFoundNotice)).toBeVisible({ timeout: 20_000 });

    // Hold cancels the scheduled re-survey; the visit #2 can be resumed.
    await openEntry(leader);
    await entryStatus(leader).selectOption({ label: T.status.ON_HOLD });
    await entryActivity(leader).fill(uniqueText("owner travels"));
    await saveEntry(leader);
    await expect(detailHeader(leader)).toContainText(T.status.ON_HOLD, { timeout: 20_000 });
    await expect(section.getByRole("button", { name: S.resume, exact: true })).toBeVisible({ timeout: 20_000 });
    // No scheduled appointment any more: #3 is cancelled (it stays under the earlier appointments).
    await expect(section.getByRole("button", { name: S.edit, exact: true })).toHaveCount(0);

    await section.getByRole("button", { name: S.resume, exact: true }).click();
    const resume = dialog(leader, S.resume);
    await field(resume, S.resumeReason).fill("Owner is back");
    await field(resume, S.resumeDate).fill(vietnamToday());
    await field(resume, S.resumeText).fill("Same requirement and scope");
    await saveDialog(leader, S.resume);
    await expect(detailHeader(leader)).toContainText(T.status.SURVEY_SCHEDULED);
    await expect(lastHistoryRow(leader)).toContainText("Survey resumed · #2");
  });

  test("W15-37: the leader's All Surveys with the Surveyor filter", async () => {
    await leader.getByRole("navigation", { name: T.menuLabel }).getByRole("link", { name: T.menuSurveys }).click();
    await expect(leader).toHaveURL((url) => url.pathname === "/workspace/surveys" && url.search === "?scope=all");
    await expect(leader.getByRole("navigation", { name: S.tabsLabel }).getByRole("link")).toHaveText([S.mySurveys, S.allSurveys]);
    const surveyor = leader.getByLabel(S.surveyor, { exact: true });
    await surveyor.selectOption(fixture.sale.id);
    await expect(leader).toHaveURL(new RegExp(`surveyor=${fixture.sale.id}`));
    await expect(mainArea(leader).getByRole("link", { name: `View the survey of lead ${L12.code}` })).toBeVisible({
      timeout: 20_000,
    });
    await surveyor.selectOption(fixture.leader.id);
    await expect(byText(leader, S.emptyFiltered)).toBeVisible({ timeout: 20_000 });
    // Back to E2E Sale's surveys for the next test.
    await surveyor.selectOption(fixture.sale.id);
    await expect(mainArea(leader).getByRole("link", { name: `View the survey of lead ${L12.code}` }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("W15-32: the leader cancels L12's survey from the list's View (Other, with a description); L12 goes back to Contacted", async () => {
    await mainArea(leader).getByRole("link", { name: `View the survey of lead ${L12.code}` }).first().click();
    await expectLeadDetail(leader, L12);
    const section = surveySection(leader);
    await expect(section).toContainText("Survey #1", { timeout: 20_000 });
    await section.getByRole("button", { name: S.cancel, exact: true }).click();
    const cancel = dialog(leader, S.cancel);
    await field(cancel, S.cancelReason).selectOption({ label: "Other" });
    await cancel.getByRole("button", { name: S.save, exact: true }).click();
    // Other needs a description.
    await expect(cancel.getByText("Fill in this field.")).toBeVisible();
    await field(cancel, S.cancelDescription).fill("The road to the house is closed");
    await saveDialog(leader, S.cancel);
    await expect(lastHistoryRow(leader)).toContainText("Survey cancelled · #1");
    // No visit in the cycle: the lead goes back to Contacted (C-3a).
    await expect(detailHeader(leader)).toContainText(T.status.CONTACTED);
    await expect(section.getByRole("button", { name: S.book, exact: true })).toBeVisible();
  });
});
