import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { expectSignedInAccount } from "../support/auth";
import {
  DESKTOP,
  detailHeader,
  dialog,
  expectLeadDetail,
  expectListPage,
  fixture,
  historySection,
  mainArea,
  newStaffContext,
  openLead,
  recordApiCalls,
  signInAs,
  T,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
} from "./support/staff";

// Requalification of a passed survey (property-create requalification spec 6; U-1, U-2). The flow in one line: the SALE
// sees the pass and no action, a manager is refused once and keeps the form, marks with a double click, the lead goes back
// to Contacted and the revision reads Requalified for both. U-3 (a held lead) is covered by the server tests and by
// `onHold_afterMark_offersContacted`: no fixture reaches ON_HOLD with a pass. Answers changed in the browser: a stale
// version, a lost answer with a failed read of the block, and a block that lands after the detail. Budget: 2 sign-ins
// (SALE, SALE_LEADER), navigation by links but for one reload. No trace, video or screenshot in this project
// (playwright.workspace.config.ts): a revision holds photos.
//
// Runs after survey-checklist-review, from L15's end state: QUALIFIED with two revisions, the second passed. A re-run of
// the lead seed clears the mark.

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

const surveySection = (page: Page): Locator => mainArea(page).getByRole("region", { name: "Survey", exact: true });
const action = (page: Page): Locator => surveySection(page).getByRole("button", { name: R.action, exact: true });
const decisionPanel = (page: Page): Locator => mainArea(page).getByRole("region", { name: "Review decision", exact: true });
const reasonField = (form: Locator): Locator => form.getByRole("textbox", { name: /^What happened/ });
const confirmation = (form: Locator): Locator => form.getByRole("checkbox", { name: /^I confirm: the lead goes back to Contacted/ });

/** The line of revision #2; the earlier appointments must be open. */
const secondRevision = (page: Page): Locator => surveySection(page).getByRole("listitem").filter({ hasText: "Checklist #2" });

/** Opens the collapsed earlier appointments, which hold the revision lines. */
const openEarlier = (page: Page): Promise<void> => surveySection(page).getByText(/^Earlier appointments/).click();

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

    await leader.route(REQUALIFY_CALL, (route) =>
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
    await submit.click();
    await expect(form.getByText(R.stale, { exact: true })).toBeVisible({ timeout: 20_000 });
    await leader.unrouteAll({ behavior: "wait" });
    await expect(kind).toHaveValue("WRONG_ASSET");
    await expect(reason).toHaveValue(R.reason);
    await expect(scope).toHaveValue(R.scope);
    await expect(confirmation(form)).toBeChecked();
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
});
