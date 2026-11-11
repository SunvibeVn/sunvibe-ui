import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { expectSignedInAccount } from "../support/auth";
import {
  assigneeOption,
  byLabel,
  byText,
  clickStatusBox,
  DESKTOP,
  detailHeader,
  dialog,
  entryStatus,
  expectLeadDetail,
  expectListPage,
  expectListSettled,
  findLeadLink,
  type FixtureLead,
  fixture,
  goToTab,
  historySection,
  isDetailCall,
  isListCall,
  leadLink,
  leadRow,
  mainArea,
  newStaffContext,
  openEntry,
  openLead,
  recordApiCalls,
  saveEntry,
  signInAs,
  T,
  uniqueText,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
} from "./support/staff";

// Requalification of a passed survey (property-create requalification spec 6; U-1, U-2). The flow in one line: the SALE
// sees the pass and no action, a manager is refused once and keeps the form, marks with a double click, the lead goes back
// to Contacted and the revision reads Requalified for both. U-3 (a held lead) is covered by the server tests and by
// `onHold_afterMark_offersContacted`: no fixture reaches ON_HOLD with a pass. Answers changed in the browser: a stale
// version, a lead read as held, a lost answer with a failed read of the block, and a block that lands after the detail. Budget: 2 sign-ins
// (SALE, SALE_LEADER), navigation by links but for one reload. No trace, video or screenshot in this project
// (playwright.workspace.config.ts): a revision holds photos.
//
// Runs after survey-checklist-review, from L15's end state: QUALIFIED with two revisions, the second passed. A re-run of
// the lead seed clears the mark.
//
// The second describe: bulk assignment of owner leads (acquisition-owner-lead-bulk-assign AC-14 to AC-24, AC-27). The
// flow in one line: the leader ticks open rows of one page of All Leads, picks one person, confirms once and reads one
// result line per lead, then the list is read again with nothing selected. Answers changed in the browser: a lost answer
// (503) of the assignment call, which reaches no server. Fixtures changed, in this order (the tests depend on it): L7 and
// L9 to E2E Trưởng nhóm, L9 moved to Contacted by a second page, L7 back to E2E Sale, L10 to E2E Sale. It starts from the
// chain's end state (L7 and L9 Assigned to E2E Sale, L10 Unassigned; nothing runs after this file) and leaves L7 Assigned
// to E2E Sale, L9 Contacted held by E2E Trưởng nhóm and L10 Assigned to E2E Sale. A re-run of the lead seed restores
// them. Budget of this describe: 1 sign-in (SALE_LEADER) and 1 full load of a protected page (the second page of the
// stale case, which restores its session with one refresh call); everything else by clicks. The file: 3 sign-ins. No
// trace, video or screenshot (the project's settings).

test.describe.configure({ mode: "serial", timeout: 120_000 });

const L15 = fixture.lead(15);

const R = {
  action: "Requalify",
  dialog: "Requalify this survey",
  kind: "Wrong property",
  reason: "The survey was of the neighbouring unit",
  source: "Owner call to the office",
  scope: "The whole survey",
  required: "Fill in this field.",
  confirmRequired: "Tick this box to go on.",
  phone: "Remove the phone number: it must not be stored here.",
  stale: "Someone else just updated this lead. The lead has been reloaded. Your text is kept.",
  noLongerCounts: "This pass no longer counts: it was requalified.",
  failed: "The survey could not be saved. Please try again.",
  unknown: "The survey could not be read, so this may already be done. Close this window and check the survey first.",
} as const;

const REQUALIFY_CALL = /\/api\/v1\/staff\/survey-checklists\/[0-9A-Z]{26}\/requalification$/;
const SURVEY_READ = /\/api\/v1\/staff\/owner-leads\/[0-9A-Z]{26}\/survey$/;
const LEAD_READ = /\/api\/v1\/staff\/owner-leads\/[0-9A-Z]{26}$/;

const surveySection = (page: Page): Locator => mainArea(page).getByRole("region", { name: "Survey", exact: true });
const action = (page: Page): Locator => surveySection(page).getByRole("button", { name: R.action, exact: true });
const decisionPanel = (page: Page): Locator => mainArea(page).getByRole("region", { name: "Review decision", exact: true });
const reasonField = (form: Locator): Locator => form.getByRole("textbox", { name: /^What happened/ });
const confirmation = (form: Locator): Locator => form.getByRole("checkbox", { name: /^I confirm: the lead goes back to Contacted/ });

/** The line of revision #2; the earlier appointments must be open. */
const secondRevision = (page: Page): Locator => surveySection(page).getByRole("listitem").filter({ hasText: "Checklist #2" });

/** Opens the collapsed earlier appointments, which hold the revision lines. */
const openEarlier = (page: Page): Promise<void> => surveySection(page).getByText(/^Earlier appointments/).click();

/** The next requalification answers a stale version, until the route is removed. */
async function refuseAsStale(page: Page): Promise<void> {
  await page.route(REQUALIFY_CALL, (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        code: "CONCURRENT_MODIFICATION",
        message: "x",
        errors: [{ field: "expectedVersion", message: "x" }],
      }),
    }),
  );
}

/** Today in Vietnam, where the server counts `basisDate`. */
const today = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

test.describe("Requalification of a passed survey (property-create requalification W20b)", () => {
  let saleContext: BrowserContext;
  let sale: Page;
  let leaderContext: BrowserContext;
  let leader: Page;

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

  test("U-1: the assigned SALE sees the pass and no action", async () => {
    await signInAs(sale, "SALE");
    await expectSignedInAccount(sale);
    await sale.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(sale);
    await openLead(sale, L15);
    await expect(detailHeader(sale)).toContainText("Qualified", { timeout: 20_000 });
    await openEarlier(sale);
    await expect(secondRevision(sale)).toContainText("Passed");
    await expect(action(sale)).toHaveCount(0);
  });

  test("U-1: the dialog checks the form, sends nothing until it is whole, and a refusal keeps it", async () => {
    await signInAs(leader, "SALE_LEADER");
    await expectSignedInAccount(leader);
    await leader.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(leader);
    // All Leads opens on Unassigned: the assignee filter brings the open set, which holds Qualified.
    await leader.getByLabel(T.assigneeFilter, { exact: true }).selectOption(fixture.sale.id);
    await expect(leader).toHaveURL(new RegExp(`assignee=${fixture.sale.id}`));
    await openLead(leader, L15);
    await action(leader).click();

    const calls = recordApiCalls(leader);
    const form = dialog(leader, R.dialog);
    const submit = form.getByRole("button", { name: R.action, exact: true });
    await submit.click();
    await expect(form.getByText(R.required, { exact: true }).first()).toBeVisible();
    await expect(form.getByText(R.confirmRequired, { exact: true })).toBeVisible();

    // The browser keeps no copy of this text in its form history (`survey BR-4`).
    const kind = form.getByRole("combobox", { name: /^What is wrong/ });
    const reason = reasonField(form);
    const source = form.getByRole("textbox", { name: /^Who or what reported it/ });
    const scope = form.getByRole("textbox", { name: /^What it affects/ });
    for (const field of [reason, source, scope]) await expect(field).toHaveAttribute("autocomplete", "off");

    await kind.selectOption({ label: R.kind });
    await reason.fill("Call the owner on 0901 234 567");
    await source.fill(R.source);
    await scope.fill(R.scope);
    await form.getByLabel(/^Date the source confirmed it/).fill(today());
    await confirmation(form).check();
    await submit.click();
    await expect(form.getByText(R.phone, { exact: true })).toBeVisible();
    // The submit sits in the footer of a tall dialog: focus goes to the field that was refused.
    await expect(reason).toBeFocused();
    expect(calls.filter((call) => REQUALIFY_CALL.test(call.url.pathname))).toHaveLength(0);
    await reason.fill(R.reason);

    await refuseAsStale(leader);
    await submit.click();
    await expect(form.getByText(R.stale, { exact: true })).toBeVisible({ timeout: 20_000 });
    await leader.unrouteAll({ behavior: "wait" });
    await expect(kind).toHaveValue("WRONG_ASSET");
    await expect(reason).toHaveValue(R.reason);
    await expect(scope).toHaveValue(R.scope);
    await expect(confirmation(form)).toBeChecked();
  });

  test("U-1: a reload that changes what the mark does asks for the confirmation again", async () => {
    const form = dialog(leader, R.dialog);
    const submit = form.getByRole("button", { name: R.action, exact: true });
    const held = form.getByRole("checkbox", { name: /^I confirm: the lead stays on hold/ });

    // The lead was put on hold meanwhile: the mark no longer sends it back to Contacted.
    await refuseAsStale(leader);
    await leader.route(LEAD_READ, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), status: "ON_HOLD" } });
    });
    await submit.click();
    await expect(held).toBeVisible({ timeout: 20_000 });
    await expect(held).not.toBeChecked();
    await leader.unrouteAll({ behavior: "wait" });

    // And back, with the real lead: a tick given for the hold does not stand for Contacted.
    await held.check();
    await refuseAsStale(leader);
    await submit.click();
    await expect(confirmation(form)).toBeVisible({ timeout: 20_000 });
    await expect(confirmation(form)).not.toBeChecked();
    await leader.unrouteAll({ behavior: "wait" });
    await confirmation(form).check();
  });

  test("Review Focus 1: a lost answer and a failed read keep the dialog, its text and its message", async () => {
    const form = dialog(leader, R.dialog);
    await leader.route(REQUALIFY_CALL, (route) => route.abort());
    await leader.route(SURVEY_READ, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: "INTERNAL_ERROR", message: "x", errors: [] }),
      }),
    );
    await form.getByRole("button", { name: R.action, exact: true }).click();
    await expect(form.getByText(R.failed, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(form.getByText(R.unknown, { exact: true })).toBeVisible();
    await expect(reasonField(form)).toHaveValue(R.reason);
    await expect(form.getByRole("button", { name: R.action, exact: true })).toBeDisabled();
    await leader.unrouteAll({ behavior: "wait" });

    // The section offers its retry; the text is back on the same revision, and the confirmation is asked again.
    await form.getByRole("button", { name: "Close", exact: true }).last().click();
    await surveySection(leader).getByRole("button", { name: "Try again", exact: true }).click();
    await action(leader).click();
    await expect(reasonField(form)).toHaveValue(R.reason);
    await expect(confirmation(form)).not.toBeChecked();
    await confirmation(form).check();
  });

  test("U-2: a double click marks once; the lead is Contacted and History says the event only", async () => {
    const calls = recordApiCalls(leader);
    const form = dialog(leader, R.dialog);
    await leader.route(SURVEY_READ, async (route) => {
      // The block lands after the detail, as it can: the wait is the case itself, not a wait for a state.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });
    await form.getByRole("button", { name: R.action, exact: true }).dblclick();
    await expect(form).toBeHidden({ timeout: 20_000 });
    await leader.unrouteAll({ behavior: "wait" });
    expect(calls.filter((call) => call.method === "POST" && REQUALIFY_CALL.test(call.url.pathname))).toHaveLength(1);
    // The button that opened the dialog is gone, so focus lands on the section title.
    await expect(surveySection(leader).getByRole("heading", { name: "Survey", exact: true })).toBeFocused();

    await expect(detailHeader(leader)).toContainText("Contacted", { timeout: 20_000 });
    await expect(action(leader)).toHaveCount(0);
    await expect(surveySection(leader).getByRole("button", { name: "Book re-survey", exact: true })).toBeVisible();

    await openEarlier(leader);
    const line = secondRevision(leader);
    await expect(line).toContainText("Requalified");
    await expect(line).not.toContainText("Passed");

    const history = historySection(leader);
    await expect(history).toContainText("Checklist #2 requalified");
    for (const text of [R.reason, R.source, R.scope]) {
      await expect(history).not.toContainText(text);
      await expect(surveySection(leader)).not.toContainText(text);
      expect(leader.url()).not.toContain(encodeURIComponent(text));
      expect(await leader.title()).not.toContain(text);
    }
  });

  test("U-2: the revision reads Requalified with the reason, keeps its decision and offers no edit", async () => {
    await secondRevision(leader).getByRole("link", { name: "Open checklist #2", exact: true }).click();
    await expect(leader).toHaveURL(/\/survey-checklists\/[0-9A-Z]{26}/, { timeout: 20_000 });

    await expect(mainArea(leader).getByText(/^Requalified by .+ on .+\. This pass no longer counts\.$/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(mainArea(leader).getByText("Passed · reviewed by")).toHaveCount(0);
    const decision = decisionPanel(leader);
    await expect(decision).toContainText("Passed");
    await expect(decision.getByText(R.noLongerCounts, { exact: true })).toBeVisible();
    for (const text of [R.kind, R.reason, R.source, R.scope]) await expect(decision).toContainText(text);
    await expect(mainArea(leader).getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  });

  test("U-1, U-2: the SALE still has no action, and reads the mark on the revision", async () => {
    await sale.reload();
    await expectLeadDetail(sale, L15);
    await expect(detailHeader(sale)).toContainText("Contacted", { timeout: 20_000 });
    await openEarlier(sale);
    const line = secondRevision(sale);
    await expect(line).toContainText("Requalified");
    await expect(action(sale)).toHaveCount(0);
    await expect(historySection(sale)).toContainText("Checklist #2 requalified");
    await expect(historySection(sale)).not.toContainText(R.reason);

    await line.getByRole("link", { name: "Open checklist #2", exact: true }).click();
    await expect(decisionPanel(sale)).toContainText(R.reason, { timeout: 20_000 });
  });

  test("property-create intake 4.1: the intake on this pass reads as ended, with its reason", async () => {
    await sale.goto(`/workspace/owner-leads/${L15.id}/inventory-intake`);
    const result = mainArea(sale).getByRole("region", { name: "Result", exact: true });
    await expect(result).toContainText("Ended", { timeout: 20_000 });
    await expect(result).toContainText("The survey behind this result was requalified.");
    await expect(mainArea(sale).getByText(/^An earlier intake made /)).toBeVisible();
  });
});

// Bulk assignment. Budget: 1 sign-in (SALE_LEADER), 1 full load (the second page of the stale case), the rest by clicks.
test.describe("Bulk assignment of owner leads (acquisition-owner-lead-bulk-assign)", () => {
  const L4 = fixture.lead(4);
  const L7 = fixture.lead(7);
  const L9 = fixture.lead(9);
  const L10 = fixture.lead(10);
  const SALE_OPTION = assigneeOption(fixture.sale.name, "Sale");
  const LEADER_OPTION = assigneeOption(fixture.leader.name, "Sale leader");
  const OPEN_LABELS: readonly string[] = [
    T.status.NEW,
    T.status.ASSIGNED,
    T.status.CONTACTED,
    T.status.SURVEY_SCHEDULED,
    T.status.QUALIFIED,
    T.status.ON_HOLD,
  ];
  const B = {
    selectAll: "Select all open leads on this page",
    assign: "Assign selected",
    clear: "Clear selection",
    result: "Assignment result",
    assigned: "Assigned",
    unchanged: "No change: already held by this person",
    stale: "Not assigned: someone else just updated this lead",
    retryHint: "To try again, select the leads that were not assigned in the reloaded list.",
    unknown:
      "We could not tell whether the leads were assigned. The list has been reloaded: check it before you try again. Your note is kept.",
  } as const;
  const ASSIGN_PATH = "/api/v1/staff/owner-leads/assignments";
  const PEOPLE_PATH = "/api/v1/staff/owner-lead-assignees";

  const selectedCount = (page: Page): Locator => byText(page, /^\d+ leads? selected$/);
  const selectAll = (page: Page): Locator => mainArea(page).getByRole("checkbox", { name: B.selectAll, exact: true });
  const rowBox = (page: Page, lead: FixtureLead): Locator =>
    leadRow(page, lead).getByRole("checkbox", { name: `Select ${lead.code}`, exact: true });
  const resultPanel = (page: Page): Locator => mainArea(page).getByRole("region", { name: B.result, exact: true });
  const resultLine = (page: Page, lead: FixtureLead): Locator =>
    resultPanel(page).getByRole("listitem").filter({ hasText: lead.code });
  const visibleRows = (page: Page): Locator => mainArea(page).locator("tbody tr").filter({ visible: true });

  /** "All Leads" at its default (Unassigned), from the list or a detail; with `assigneeId`, that person's open leads. */
  async function allLeads(page: Page, assigneeId?: string): Promise<void> {
    const back = page.getByRole("link", { name: T.back });
    if (await back.isVisible()) {
      await back.click();
      await expectListPage(page);
    }
    await goToTab(page, T.tabAll);
    const clear = page.getByRole("link", { name: T.clearFilters });
    if (await clear.isVisible()) {
      await clear.click();
      await expect(page).toHaveURL((url) => url.search === "?scope=all");
    }
    await expectListSettled(page);
    if (assigneeId === undefined) return;
    await byLabel(page, T.assigneeFilter, { exact: true }).selectOption(assigneeId);
    await expect(page).toHaveURL(new RegExp(`assignee=${assigneeId}`));
    await expectListSettled(page);
  }

  /** Every row on screen has a box when its status is open and none when it is closed (AC-14). */
  async function expectBoxesOnOpenRowsOnly(page: Page): Promise<void> {
    const rows = await visibleRows(page).all();
    expect(rows.length, "rows on the page").toBeGreaterThan(0);
    for (const row of rows) {
      const status = (await row.locator("td").nth(5).innerText()).trim();
      await expect(row.getByRole("checkbox"), `box of a ${status} row`).toHaveCount(OPEN_LABELS.includes(status) ? 1 : 0);
    }
  }

  /** "Assign selected", then waits for the dialog with the people loaded; nobody is picked. */
  async function openBulkDialog(page: Page, title: string): Promise<Locator> {
    await mainArea(page).getByRole("button", { name: B.assign, exact: true }).click();
    const bulk = dialog(page, title);
    await expect(bulk.getByRole("combobox").locator("option", { hasText: SALE_OPTION })).toHaveCount(1, { timeout: 20_000 });
    return bulk;
  }

  const pick = (bulk: Locator, option: string): Promise<string[]> => bulk.getByRole("combobox").selectOption({ label: option });

  /** "Assign" in the dialog; the dialog closes when the answer is handled. */
  async function confirm(bulk: Locator): Promise<void> {
    await bulk.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(bulk).toBeHidden({ timeout: 20_000 });
  }

  /** A second page of the same browser changes the status of `lead` (the same user; it restores its session, no sign-in). */
  async function changeStatusInSecondPage(context: BrowserContext, lead: FixtureLead, status: string): Promise<void> {
    const other = await context.newPage();
    try {
      await other.goto(lead.path);
      await expectLeadDetail(other, lead);
      await openEntry(other);
      await entryStatus(other).selectOption({ label: status });
      await saveEntry(other);
      await expect(historySection(other).getByText("Entry saved.")).toBeVisible({ timeout: 20_000 });
    } finally {
      await other.close();
    }
  }

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    test.skip(!(await workspaceE2eReady()), WORKSPACE_E2E_SKIP_REASON);
    context = await newStaffContext(browser);
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("AC-14 to AC-17: boxes on the open rows of All Leads only, select-all and Clear selection, a filter change empties the selection, none on My Leads, no detail read", async () => {
    await signInAs(page, "SALE_LEADER");
    await expectSignedInAccount(page);
    await page.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(page);
    const calls = recordApiCalls(page);

    // The default All Leads (Unassigned): every row is open and has its box.
    await expect(await findLeadLink(page, L10)).toBeVisible();
    await expectBoxesOnOpenRowsOnly(page);
    const rows = await visibleRows(page).count();

    await selectAll(page).check();
    await expect(selectedCount(page)).toHaveText(rows === 1 ? "1 lead selected" : `${rows} leads selected`);
    for (const box of await visibleRows(page).getByRole("checkbox").all()) await expect(box).toBeChecked();
    await selectAll(page).uncheck();
    await expect(selectedCount(page)).toHaveCount(0);

    await rowBox(page, L10).check();
    await expect(selectedCount(page)).toHaveText("1 lead selected");
    await expect(selectAll(page)).toHaveJSProperty("indeterminate", rows > 1);
    await mainArea(page).getByRole("button", { name: B.clear, exact: true }).click();
    await expect(selectedCount(page)).toHaveCount(0);
    await expect(rowBox(page, L10)).not.toBeChecked();

    // A filter change empties the selection; with the closed leads shown, a closed row has no box.
    await rowBox(page, L10).check();
    await expect(selectedCount(page)).toHaveText("1 lead selected");
    await clickStatusBox(page, T.showClosed);
    await expect(selectedCount(page)).toHaveCount(0);
    await expect(await findLeadLink(page, L4)).toBeVisible();
    await expect(leadRow(page, L4).getByRole("checkbox")).toHaveCount(0);
    await expectBoxesOnOpenRowsOnly(page);

    // My Leads: no box and no panel.
    await goToTab(page, T.tabMine);
    await expectListSettled(page);
    await expect(mainArea(page).getByRole("checkbox", { name: /^Select / })).toHaveCount(0);
    await expect(mainArea(page).getByRole("button", { name: B.assign, exact: true })).toHaveCount(0);

    expect(calls.filter((call) => isDetailCall(call)), "no detail read while selecting").toEqual([]);
  });

  test("AC-18 to AC-22 with AC-2: L7 and L9 go from E2E Sale to E2E Trưởng nhóm in one action, with the note on their History", async () => {
    await allLeads(page, fixture.sale.id);
    await expect(await findLeadLink(page, L7)).toBeVisible();
    // The selection is one page: both leads must be on the page they are selected on (a failed assumption fails here).
    await expect(leadLink(page, L9)).toBeVisible();

    const calls = recordApiCalls(page);
    await rowBox(page, L7).check();
    await rowBox(page, L9).check();
    await expect(selectedCount(page)).toHaveText("2 leads selected");

    const bulk = await openBulkDialog(page, "Assign 2 leads");
    await expect(bulk.getByRole("combobox")).toHaveValue("");
    await expect(bulk.getByRole("button", { name: "Assign", exact: true })).toBeDisabled();
    await pick(bulk, LEADER_OPTION);
    await expect(bulk).toContainText(`2 leads will be assigned to ${fixture.leader.name}.`);
    await expect(bulk).toContainText("2 of them are held by someone else now. Those people lose access at once.");
    await expect(bulk).not.toContainText(T.status.SURVEY_SCHEDULED);
    const note = uniqueText("bulk L7 L9");
    await bulk.getByRole("textbox", { name: "Note" }).fill(note);
    await confirm(bulk);

    await expect(resultPanel(page)).toContainText("2 assigned · 0 unchanged · 0 not assigned");
    await expect(resultPanel(page).getByRole("listitem")).toHaveCount(2);
    for (const lead of [L7, L9]) {
      await expect(resultLine(page, lead)).toContainText(B.assigned);
      await expect(resultPanel(page)).not.toContainText(lead.contactName);
      await expect(resultPanel(page)).not.toContainText(lead.phoneTail);
    }

    // The list is read again: E2E Sale no longer holds L7 and L9, and nothing is selected.
    await expectListSettled(page);
    for (const lead of [L7, L9]) await expect(leadLink(page, lead)).toHaveCount(0);
    await expect(selectedCount(page)).toHaveCount(0);
    expect(calls.filter((call) => call.method === "POST").map((call) => call.url.pathname)).toEqual([ASSIGN_PATH]);
    expect(calls.filter((call) => call.url.pathname === PEOPLE_PATH).length, "the people list").toBeGreaterThan(0);
    expect(calls.filter(isListCall).length, "the list read again").toBeGreaterThan(0);
    expect(
      calls.filter((call) => !isListCall(call) && call.url.pathname !== PEOPLE_PATH && call.url.pathname !== ASSIGN_PATH),
      "no other call",
    ).toEqual([]);

    // L9's detail, opened from E2E Trưởng nhóm's leads: the new holder, and the bulk row last in History. With a note
    // the ACTIVITY cell shows the note (the History rule of every assignment), and PIC is the leader who assigned.
    await allLeads(page, fixture.leader.id);
    await openLead(page, L9);
    await expect(detailHeader(page)).toContainText(fixture.leader.name);
    const last = historySection(page).locator("tbody tr").last();
    await expect(last).toContainText(note);
    await expect(last).toContainText(fixture.leader.name);
  });

  test("AC-4 and AC-21 (E-6): L9 changed in another page meanwhile is not assigned, L7 still is", async () => {
    await allLeads(page, fixture.leader.id);
    await expect(await findLeadLink(page, L7)).toBeVisible();
    await expect(leadLink(page, L9)).toBeVisible();
    await rowBox(page, L7).check();
    await rowBox(page, L9).check();

    await changeStatusInSecondPage(context, L9, T.status.CONTACTED);

    const bulk = await openBulkDialog(page, "Assign 2 leads");
    await pick(bulk, SALE_OPTION);
    await expect(bulk).toContainText(`2 leads will be assigned to ${fixture.sale.name}.`);
    await confirm(bulk);

    await expect(resultPanel(page)).toContainText("1 assigned · 0 unchanged · 1 not assigned");
    await expect(resultLine(page, L7)).toContainText(B.assigned);
    await expect(resultLine(page, L9)).toContainText(B.stale);
    await expect(resultPanel(page)).toContainText(B.retryHint);
  });

  test("AC-22 and AC-5 (E-7): L10 leaves the Unassigned list; assigning leads to the person who holds them changes nothing", async () => {
    await allLeads(page);
    await expect(await findLeadLink(page, L10)).toBeVisible();
    await rowBox(page, L10).check();
    let bulk = await openBulkDialog(page, "Assign 1 lead");
    await pick(bulk, SALE_OPTION);
    await expect(bulk).toContainText("None of them is held by someone else.");
    await confirm(bulk);
    await expect(resultPanel(page)).toContainText("1 assigned · 0 unchanged · 0 not assigned");
    await expect(await findLeadLink(page, L10), "L10 on no page of the Unassigned filter").toHaveCount(0);

    await allLeads(page, fixture.sale.id);
    await expect(await findLeadLink(page, L10)).toBeVisible();
    // Both on the page they are selected on (a failed assumption fails here).
    await expect(leadLink(page, L7)).toBeVisible();
    await rowBox(page, L10).check();
    await rowBox(page, L7).check();
    bulk = await openBulkDialog(page, "Assign 2 leads");
    await pick(bulk, SALE_OPTION);
    await expect(bulk).toContainText("None of them is held by someone else.");
    await confirm(bulk);
    await expect(resultPanel(page)).toContainText("0 assigned · 2 unchanged · 0 not assigned");
    for (const lead of [L7, L10]) await expect(resultLine(page, lead)).toContainText(B.unchanged);
    await expect(resultPanel(page)).not.toContainText(B.retryHint);
  });

  test("AC-24 (E-8): a lost answer shows the unknown-result notice, reads the list again and keeps the note", async () => {
    // The answer is stubbed (this case is what the page does with an unknown outcome): nothing reaches the server.
    await page.route(
      (url) => url.pathname === ASSIGN_PATH,
      (route) =>
        route.request().method() === "POST"
          ? route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ code: "SERVICE_UNAVAILABLE", message: "x", errors: [] }),
            })
          : route.continue(),
    );
    await allLeads(page, fixture.sale.id);
    await expect(await findLeadLink(page, L7)).toBeVisible();
    await rowBox(page, L7).check();
    const bulk = await openBulkDialog(page, "Assign 1 lead");
    await pick(bulk, LEADER_OPTION);
    const note = uniqueText("kept note");
    await bulk.getByRole("textbox", { name: "Note" }).fill(note);

    const calls = recordApiCalls(page);
    await confirm(bulk);
    await expect(byText(page, B.unknown)).toBeVisible({ timeout: 20_000 });
    await expectListSettled(page);
    await expect.poll(() => calls.filter(isListCall).length, { message: "one list read after the lost answer" }).toBe(1);
    await page.unrouteAll({ behavior: "wait" });

    // The dialog opened again for a selected lead holds the typed note; it is closed without sending.
    await rowBox(page, L7).check();
    const again = await openBulkDialog(page, "Assign 1 lead");
    await expect(again.getByRole("textbox", { name: "Note" })).toHaveValue(note);
    await again.getByRole("button", { name: T.cancel, exact: true }).last().click();
    await expect(again).toBeHidden();
  });
});
