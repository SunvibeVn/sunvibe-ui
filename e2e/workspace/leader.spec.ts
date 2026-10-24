import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { API_URL } from "../support/api";
import { corsHeaders, expectSignedInAccount, REFRESH_PATH, TEXT } from "../support/auth";
import {
  assigneeOption,
  clickStatusBox,
  closeConfirmDialog,
  dialog,
  detailHeader,
  entryActivity,
  entryStatus,
  expectLeadDetail,
  expectListPage,
  expectListSettled,
  type FixtureLead,
  fixture,
  findLeadLink,
  goToTab,
  header,
  historySection,
  leadLink,
  mainArea,
  newStaffContext,
  openEntry,
  openLead,
  saveEntry,
  signInAs,
  statusBox,
  statusBoxLabels,
  T,
  tab,
  tabs,
  tickedStatusLabels,
  TIME,
  uniqueText,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
  workspaceHeaderLink,
  byLabel,
  byText,
} from "./support/staff";

// The SALE_LEADER in the staff workspace: W11-24, W11-32, W11-33, W11-34, W11-35, W11-36 and the leader's 403 on the
// territories URL (W11-38) in English, and W14-25, W14-26, W14-27, W14-28 (Review Focus 1), W14-30 (no assignee column)
// and the expired session inside the workspace (Review Focus 3). Spec 5.8 budget: 1 sign-in (the second page of W11-35
// and W11-36 is the same user in a new page of the same browser: it restores its session with the refresh cookie, no
// second sign-in); full loads of protected pages: 7 of 10 (/account, a crafted list URL, its reload, a former-holder
// URL, the second page twice, the territories URL); intake POSTs: 0.
//
// Fixtures changed, in this order (the tests depend on it): L4 closed as REJECTED (W11-32), L8 closed as DUPLICATE of
// L7 by its request code and L5 closed as DUPLICATE of L7 by a pasted link (W11-33), L1 assigned to E2E Sale
// (W11-34), L2 moved to ON_HOLD by the second page (W11-35) and L3 closed as WITHDRAWN by the second page (W11-36).
// Nothing here can be repeated on changed data: run BOTH seeds again before every `npm run e2e:workspace`. This file
// runs after sale.spec.ts (which needs L1..L4 and L8 as seeded) and before admin.spec.ts
// (playwright.workspace.config.ts).

test.describe.configure({ mode: "serial", timeout: 120_000 });

const L1 = fixture.lead(1);
const L2 = fixture.lead(2);
const L3 = fixture.lead(3);
const L4 = fixture.lead(4);
const L5 = fixture.lead(5);
const L6 = fixture.lead(6);
const L7 = fixture.lead(7);
const L8 = fixture.lead(8);
const L10 = fixture.lead(10);

const SALE_OPTION = assigneeOption(fixture.sale.name, "Sale");
const LEADER_OPTION = assigneeOption(fixture.leader.name, "Sale leader");

/** The boxes and the default of "All Leads" without an assignee, and of "My Leads" or an assignee (spec 5.3). */
const ALL_BOXES = [
  T.status.NEW,
  T.status.ASSIGNED,
  T.status.CONTACTED,
  T.status.SURVEY_SCHEDULED,
  T.status.ON_HOLD,
  T.status.DUPLICATE,
  T.status.REJECTED,
  T.status.WITHDRAWN,
  T.showClosed,
];
const NO_NEW_BOXES = ALL_BOXES.slice(1);
const OPEN_DEFAULT = [T.status.ASSIGNED, T.status.CONTACTED, T.status.SURVEY_SCHEDULED, T.status.ON_HOLD];

/** The options of the new history row's STATUS select (D-4). */
const statusOptions = (page: Page): Locator => entryStatus(page).locator("option");
/** Picks `status` in the new history row. */
const pickStatus = (page: Page, status: string): Promise<string[]> => entryStatus(page).selectOption({ label: status });
const assigneeFilter = (page: Page): Locator => byLabel(page, T.assigneeFilter, { exact: true });

/** Back to the list from a detail page (if on one), then "All Leads" at its default (Unassigned only). */
async function allLeadsDefault(page: Page): Promise<void> {
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
}

/** "All Leads" at its default, the Unassigned lead opened by a click. */
async function openUnassigned(page: Page, lead: FixtureLead): Promise<void> {
  await allLeadsDefault(page);
  await openLead(page, lead);
}

/** "All Leads" filtered by one assignee (their open leads, Review Focus 1), the lead opened by a click. */
async function openFromAssignee(page: Page, assigneeId: string, lead: FixtureLead): Promise<void> {
  await allLeadsDefault(page);
  await assigneeFilter(page).selectOption(assigneeId);
  await expect(page).toHaveURL(new RegExp(`assignee=${assigneeId}`));
  await openLead(page, lead);
}

/**
 * A second page of the same browser changes the status of `lead` (the same user, a stale first page): it restores its
 * session with the refresh cookie, so it does not sign in again. A closing `target` needs `reason`.
 */
async function changeStatusInSecondPage(
  context: BrowserContext,
  lead: FixtureLead,
  status: string,
  reason?: string,
): Promise<void> {
  const other = await context.newPage();
  try {
    await other.goto(lead.path);
    await expectLeadDetail(other, lead);
    await openEntry(other);
    await pickStatus(other, status);
    if (reason !== undefined) await entryActivity(other).fill(reason);
    await saveEntry(other);
    if (reason !== undefined) await closeConfirmDialog(other).getByRole("button", { name: T.confirm }).click();
    await expect(historySection(other).getByText(T.entrySaved)).toBeVisible();
  } finally {
    await other.close();
  }
}

test.describe("SALE_LEADER in the workspace", () => {
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

  test("W11-24 and W14-25: the leader lands on All Leads with only Unassigned ticked and sees NEW leads; two tabs; no territories item", async () => {
    await signInAs(page, "SALE_LEADER");
    await expectSignedInAccount(page);
    await expect(workspaceHeaderLink(page)).toBeVisible();
    await page.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(page);

    await expect(tabs(page).getByRole("link")).toHaveText([T.tabMine, T.tabAll]);
    await expect(tab(page, T.tabAll)).toHaveAttribute("aria-current", "page");
    // The default tab is written to the URL by a replace navigation; its default status set is left out.
    await expect(page).toHaveURL((url) => url.search === "?scope=all");
    expect(await statusBoxLabels(page)).toEqual(ALL_BOXES);
    expect(await tickedStatusLabels(page)).toEqual([T.status.NEW]);

    // The NEW leads (also the ones other specs created, over several pages): L1 and L10 are there, and every row on
    // the page is Unassigned.
    await expect(await findLeadLink(page, L10)).toBeVisible();
    await expect(await findLeadLink(page, L1)).toBeVisible();
    for (const status of await mainArea(page).locator("tbody tr td:nth-child(6)").allInnerTexts()) {
      expect(status.trim(), "status of a row").toBe(T.status.NEW);
    }
    for (const lead of [L2, L5]) await expect(leadLink(page, lead)).toHaveCount(0);
    // W14-30: no assignee column (C-47).
    await expect(page.getByRole("columnheader")).toHaveText([...T.columns]);

    const menu = page.getByRole("navigation", { name: T.menuLabel });
    await expect(menu.getByRole("link", { name: T.menuOwnerLeads })).toBeVisible();
    await expect(menu.getByRole("link", { name: T.menuTerritories })).toHaveCount(0);
    await expect(header(page).getByRole("button", { name: T.signOut, exact: true })).toBeVisible();
  });

  test("W14-26 and W14-27: All → My → All resets the statuses; Show closed ticks and clears the three closed ones; a mixed set; an empty set is the default", async () => {
    await clickStatusBox(page, T.status.ASSIGNED);
    expect(await tickedStatusLabels(page)).toEqual([T.status.NEW, T.status.ASSIGNED]);

    await goToTab(page, T.tabMine);
    await expect(page).toHaveURL((url) => url.search === "?scope=mine");
    expect(await statusBoxLabels(page)).toEqual(NO_NEW_BOXES);
    expect(await tickedStatusLabels(page)).toEqual(OPEN_DEFAULT);
    await expect(leadLink(page, L5)).toBeVisible({ timeout: 20_000 });

    await goToTab(page, T.tabAll);
    await expect(page).toHaveURL((url) => url.search === "?scope=all");
    expect(await tickedStatusLabels(page)).toEqual([T.status.NEW]);

    // "Show closed leads" ticks the three closed statuses together, and clears them together.
    await clickStatusBox(page, T.showClosed);
    expect(await tickedStatusLabels(page)).toEqual([
      T.status.NEW,
      T.status.DUPLICATE,
      T.status.REJECTED,
      T.status.WITHDRAWN,
      T.showClosed,
    ]);
    await clickStatusBox(page, T.showClosed);
    expect(await tickedStatusLabels(page)).toEqual([T.status.NEW]);

    // One or two closed boxes: the box is mixed, and a click ticks all three (A-8).
    await clickStatusBox(page, T.status.REJECTED);
    const closedBox = statusBox(page, T.showClosed);
    await expect(closedBox).not.toBeChecked();
    // `indeterminate` is set by an effect after the render: poll it.
    await expect.poll(() => closedBox.evaluate((box) => (box as HTMLInputElement).indeterminate), { message: "mixed" }).toBe(true);
    await clickStatusBox(page, T.showClosed);
    await expect(closedBox).toBeChecked();
    expect(await tickedStatusLabels(page)).toEqual([
      T.status.NEW,
      T.status.DUPLICATE,
      T.status.REJECTED,
      T.status.WITHDRAWN,
      T.showClosed,
    ]);
    await clickStatusBox(page, T.showClosed);

    // Clearing the only ticked box gives the default back: Unassigned stays ticked, the URL does not change.
    const newBox = statusBox(page, T.status.NEW);
    await newBox.click();
    await expect(newBox).toBeChecked();
    await expect(page).toHaveURL((url) => url.search === "?scope=all");
  });

  test("W11-24: a page past the end shows the empty state; a filter change resets the page; filters survive a reload", async () => {
    await page.goto("/workspace/owner-leads?scope=all&page=999");
    await expectListPage(page);
    await expect(byText(page, T.emptyPastEnd)).toBeVisible({ timeout: 20_000 });
    expect(new URL(page.url()).searchParams.get("page")).toBe("999");
    // The page and the empty state survive a reload.
    await page.reload();
    await expectListPage(page);
    await expect(byText(page, T.emptyPastEnd)).toBeVisible({ timeout: 20_000 });
    expect(new URL(page.url()).searchParams.get("page")).toBe("999");

    await clickStatusBox(page, T.status.ASSIGNED);
    expect(new URL(page.url()).searchParams.has("page"), "page after a filter change").toBe(false);
    await clickStatusBox(page, T.status.NEW);
    await expect(statusBox(page, T.status.ASSIGNED)).toBeChecked();
    await expect(leadLink(page, L2)).toBeVisible();
    await expect(leadLink(page, L1)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.getAll("status")).toEqual(["ASSIGNED"]);

    await page.reload();
    await expectListPage(page);
    await expect(statusBox(page, T.status.ASSIGNED)).toBeChecked();
    await expect(statusBox(page, T.status.NEW)).not.toBeChecked();
    await expect(leadLink(page, L2)).toBeVisible();
    await expect(leadLink(page, L1)).toHaveCount(0);
  });

  test("W14-28 and W11-29: the ward filter; an assignee shows that person's open leads without Unassigned; clearing it gives the default; a former holder is labelled", async () => {
    // Ward An Hải with Assigned ticked (the state of the previous test).
    const ward = byLabel(page, T.wardFilter, { exact: true });
    await expect(ward.locator(`option[value="${fixture.territoryWardCode}"]`)).toBeAttached();
    await ward.selectOption(fixture.territoryWardCode);
    await expect(page).toHaveURL(new RegExp(`ward=${fixture.territoryWardCode}`));
    await expect(leadLink(page, L2)).toBeVisible();
    for (const lead of [L1, L3, L5]) await expect(leadLink(page, lead)).toHaveCount(0);
    await ward.selectOption("");
    await expect(page).not.toHaveURL(/ward=/);

    // From the default (Unassigned only), an assignee gives Assigned, Contacted and On Hold (Review Focus 1).
    await page.getByRole("link", { name: T.clearFilters }).click();
    await expect(page).toHaveURL((url) => url.search === "?scope=all");
    const assignee = assigneeFilter(page);
    await expect(assignee.locator("option", { hasText: SALE_OPTION })).toHaveCount(1);
    await expect(assignee.locator("option", { hasText: LEADER_OPTION })).toHaveCount(1);
    await assignee.selectOption(fixture.sale.id);
    await expect(page).toHaveURL(new RegExp(`assignee=${fixture.sale.id}`));
    expect(new URL(page.url()).searchParams.has("status"), "the assignee default stays out of the URL").toBe(false);
    expect(await statusBoxLabels(page)).toEqual(NO_NEW_BOXES);
    expect(await tickedStatusLabels(page)).toEqual(OPEN_DEFAULT);
    for (const lead of [2, 3, 4, 7, 8, 9].map(fixture.lead)) await expect(leadLink(page, lead)).toBeVisible();
    for (const lead of [L1, L5, L10]) await expect(leadLink(page, lead)).toHaveCount(0);
    await assignee.selectOption(fixture.leader.id);
    await expect(page).toHaveURL(new RegExp(`assignee=${fixture.leader.id}`));
    await expect(leadLink(page, L5)).toBeVisible();
    await expect(leadLink(page, L2)).toHaveCount(0);

    // Clearing the assignee from its default gives the no-assignee default back.
    await assignee.selectOption("");
    await expect(page).toHaveURL((url) => url.search === "?scope=all");
    expect(await tickedStatusLabels(page)).toEqual([T.status.NEW]);

    // A holder who no longer takes leads (the admin) and has none: the URL keeps the filter, labelled "Other staff
    // member", with that person's open leads asked for (an empty list, never the Unassigned queue).
    await page.goto(`/workspace/owner-leads?scope=all&assignee=${fixture.admin.id}`);
    await expectListPage(page);
    const former = assigneeFilter(page);
    await expect(former).toHaveValue(fixture.admin.id, { timeout: 20_000 });
    await expect(former.locator("option:checked")).toHaveText(T.assigneeOther);
    expect(await tickedStatusLabels(page)).toEqual(OPEN_DEFAULT);
    await expect(byText(page, T.emptyFiltered)).toBeVisible();
  });

  test("W11-32: the history row offers exactly the allowed targets; closing needs a reason and a confirmation", async () => {
    await openFromAssignee(page, fixture.sale.id, L2);

    // ASSIGNED: keep it, or CONTACTED, ON_HOLD, DUPLICATE, REJECTED, WITHDRAWN.
    await openEntry(page);
    await expect(statusOptions(page)).toHaveText([
      T.keepStatus(T.status.ASSIGNED),
      T.status.CONTACTED,
      T.status.ON_HOLD,
      T.status.DUPLICATE,
      T.status.REJECTED,
      T.status.WITHDRAWN,
    ]);

    // ON_HOLD (L4): keep it, or CONTACTED, DUPLICATE, REJECTED, WITHDRAWN.
    await openFromAssignee(page, fixture.sale.id, L4);
    await openEntry(page);
    await expect(statusOptions(page)).toHaveText([
      T.keepStatus(T.status.ON_HOLD),
      T.status.CONTACTED,
      T.status.DUPLICATE,
      T.status.REJECTED,
      T.status.WITHDRAWN,
    ]);

    // A closing target turns ACTIVITY into the required reason (1..500); no next action anywhere (D-5).
    await pickStatus(page, T.status.REJECTED);
    await expect(historySection(page).getByRole("textbox", { name: T.reasonField, exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Next action" })).toHaveCount(0);
    await saveEntry(page);
    await expect(historySection(page).getByText(T.reasonRequired)).toBeVisible();
    await entryActivity(page).fill("x".repeat(501));
    await saveEntry(page);
    await expect(historySection(page).getByText(T.activityTooLong(500))).toBeVisible();

    const reason = uniqueText("owner declined");
    await entryActivity(page).fill(reason);
    await saveEntry(page);
    await expect(closeConfirmDialog(page)).toBeVisible();
    await closeConfirmDialog(page).getByRole("button", { name: T.confirm }).click();

    // The lead is closed: banner and reason; no "+", no assign button (W11-34: no assign when closed).
    await expect(historySection(page).getByText(T.entrySaved)).toBeVisible();
    await expect(detailHeader(page)).toContainText(T.status.REJECTED);
    await expect(detailHeader(page)).toContainText(T.closedBanner);
    await expect(detailHeader(page)).toContainText(reason);
    await expect(page.getByRole("button", { name: T.addEntry })).toHaveCount(0);
    await expect(page.getByRole("button", { name: T.reassign })).toHaveCount(0);
    await expect(page.getByRole("button", { name: T.assign })).toHaveCount(0);
    await expect(entryStatus(page)).toHaveCount(0);
  });

  test("W11-33: DUPLICATE takes a pasted code or link; the lead itself, an unknown code and a DUPLICATE are refused; a closed original is found", async () => {
    await openFromAssignee(page, fixture.sale.id, L8);
    await openEntry(page);
    const history = historySection(page);
    await pickStatus(page, T.status.DUPLICATE);
    // L8 has one possible duplicate (L7): offered as a choice, and "another lead" opens the text field.
    await expect(history.getByRole("radio", { name: new RegExp(L7.code) })).toBeEnabled();
    await history.getByRole("radio", { name: /Another lead/ }).check();
    const original = history.getByRole("textbox", { name: "Lead link or request code", exact: true });
    const lookup = history.getByRole("button", { name: T.lookup, exact: true });
    const origin = new URL(page.url()).origin;

    // Refusals: the lead itself (a link, at once), an unknown code (after "Find").
    await original.fill(`${origin}${L8.path}`);
    await expect(history.getByText("This lead cannot be its own original.")).toBeVisible();
    await original.fill("SV-E2EA-ZZ9Z");
    await lookup.click();
    await expect(history.getByText("Lead not found, or you cannot see it")).toBeVisible();

    // A closed original is found (no status filter on the lookup), whatever the case and the outer spaces.
    await original.fill(`  ${L6.code.toLowerCase()} `);
    await lookup.click();
    await expect(history.getByText(new RegExp(`${L6.code} · ${T.status.REJECTED} · ${TIME.source}`))).toBeVisible();

    // A pasted link (relative) shows the id, no preview of the lead.
    await original.fill(L7.path);
    await expect(history.getByText(`Lead ID: ${L7.id}`)).toBeVisible();

    // The original of this DUPLICATE: L7 by its code.
    await original.fill(` ${L7.code.toLowerCase()} `);
    await lookup.click();
    await expect(history.getByText(new RegExp(`${L7.code} · ${T.status.ASSIGNED} · \\d{2}/\\d{2}/\\d{4}`))).toBeVisible();
    await entryActivity(page).fill(uniqueText("duplicate of L7"));
    await saveEntry(page);
    await expect(closeConfirmDialog(page)).toBeVisible();
    await expect(closeConfirmDialog(page).getByText(new RegExp(L7.code))).toBeVisible();
    await closeConfirmDialog(page).getByRole("button", { name: T.confirm }).click();

    await expect(history.getByText(T.entrySaved)).toBeVisible();
    await expect(detailHeader(page)).toContainText(T.status.DUPLICATE);
    await expect(page.getByRole("link", { name: "View original lead" })).toHaveAttribute("href", L7.path);

    // L8 is a DUPLICATE now: it cannot be the original of another lead (L10, a NEW lead; nothing is sent).
    await openUnassigned(page, L10);
    await openEntry(page);
    await pickStatus(page, T.status.DUPLICATE);
    await history.getByRole("textbox", { name: "Lead link or request code", exact: true }).fill(L8.code);
    await history.getByRole("button", { name: T.lookup, exact: true }).click();
    await expect(history.getByText("This lead is already a duplicate and cannot be the original.")).toBeVisible();
    await history.getByRole("button", { name: T.hideEntry, exact: true }).click();
    await expect(entryStatus(page)).toHaveCount(0);

    // A pasted link is sent as it is (the id is shown, no preview; the server decides): L5 (the leader's, no possible
    // duplicate, so the text field shows at once) becomes a DUPLICATE of L7. No later test or spec uses L5.
    await openFromAssignee(page, fixture.leader.id, L5);
    await openEntry(page);
    await pickStatus(page, T.status.DUPLICATE);
    await history.getByRole("textbox", { name: "Lead link or request code", exact: true }).fill(`${origin}${L7.path}`);
    await expect(history.getByText(`Lead ID: ${L7.id}`)).toBeVisible();
    await entryActivity(page).fill(uniqueText("duplicate of L7 by link"));
    await saveEntry(page);
    await expect(closeConfirmDialog(page)).toBeVisible();
    await closeConfirmDialog(page).getByRole("button", { name: T.confirm }).click();

    await expect(history.getByText(T.entrySaved)).toBeVisible();
    await expect(detailHeader(page)).toContainText(T.status.DUPLICATE);
    await expect(page.getByRole("link", { name: "View original lead" })).toHaveAttribute("href", L7.path);
  });

  test("W11-34 and W14-28: the leader assigns a NEW lead to the SALE; it leaves the Unassigned filter; the assignee link shows that person's open leads", async () => {
    await openUnassigned(page, L1);
    await expect(page.getByRole("button", { name: T.assign })).toBeVisible();
    await page.getByRole("button", { name: T.assign }).click();
    const assign = dialog(page, T.assign);
    const picker = assign.getByRole("combobox");
    await expect(picker.locator("option", { hasText: SALE_OPTION })).toHaveCount(1);
    await expect(picker.locator("option", { hasText: LEADER_OPTION })).toHaveCount(1);
    await picker.selectOption({ label: SALE_OPTION });
    await assign.getByRole("button", { name: "Assign", exact: true }).click();

    await expect(byText(page, T.assignSaved)).toBeVisible();
    await expect(detailHeader(page)).toContainText(fixture.sale.name);
    await expect(detailHeader(page)).toContainText(T.status.ASSIGNED);
    await expect(page.getByRole("button", { name: T.reassign })).toBeVisible();
    // D-4: the assignment is the last history row, with the leader as PIC.
    const assignedRow = historySection(page).locator("tbody tr").last();
    await expect(assignedRow).toContainText("Assigned");
    await expect(assignedRow).toContainText(fixture.leader.name);

    // The assignee link of the detail header: that person's open leads, never an empty Unassigned list (Review Focus 1).
    await detailHeader(page).getByRole("link", { name: `View leads of ${fixture.sale.name}` }).click();
    await expectListPage(page);
    await expect(page).toHaveURL((url) => url.search === `?scope=all&assignee=${fixture.sale.id}`);
    expect(await statusBoxLabels(page)).toEqual(NO_NEW_BOXES);
    expect(await tickedStatusLabels(page)).toEqual(OPEN_DEFAULT);
    for (const lead of [L1, L2]) await expect(leadLink(page, lead)).toBeVisible({ timeout: 20_000 });

    // L1 left the Unassigned queue: on no page of the default All Leads.
    await allLeadsDefault(page);
    await expect(await findLeadLink(page, L10)).toBeVisible();
    await expect(await findLeadLink(page, L1), "L1 on no page of the Unassigned filter").toHaveCount(0);
  });

  test("W11-35: a stale status change shows the concurrency message and keeps the typed reason", async () => {
    await openFromAssignee(page, fixture.sale.id, L2);
    await openEntry(page);
    await pickStatus(page, T.status.REJECTED);
    const reason = uniqueText("draft reason L2");
    await entryActivity(page).fill(reason);
    await saveEntry(page);
    await expect(closeConfirmDialog(page)).toBeVisible();

    // Meanwhile a second page moves L2 to ON_HOLD: the first page holds an old version.
    await changeStatusInSecondPage(context, L2, T.status.ON_HOLD);

    await closeConfirmDialog(page).getByRole("button", { name: T.confirm }).click();
    // The lead reloads with another status: the confirmation closes and the message stays under the row. The dialog
    // shows the message too while the reload runs, so wait for it to close first.
    await expect(closeConfirmDialog(page)).toHaveCount(0);
    await expect(historySection(page).getByText(T.concurrent)).toBeVisible();
    await expect(detailHeader(page)).toContainText(T.status.ON_HOLD);
    // The row keeps the typed reason.
    await expect(entryActivity(page)).toHaveValue(reason);
  });

  test("W11-36: a note on a lead closed in another page gets the 409 message and the typed text stays visible", async () => {
    await openFromAssignee(page, fixture.sale.id, L3);
    await openEntry(page);
    const note = uniqueText("note after L3 closed");
    await entryActivity(page).fill(note);

    await changeStatusInSecondPage(context, L3, T.status.WITHDRAWN, uniqueText("owner withdrew L3"));

    await saveEntry(page);
    await expect(byText(page, T.entryClosedKeepText)).toBeVisible();
    await expect(detailHeader(page)).toContainText(T.status.WITHDRAWN);
    // The text is still there, read only and copyable, and it was not saved to the history.
    await expect(byLabel(page, T.activityField, { exact: true })).toHaveValue(note);
    await expect(historySection(page).locator("tbody").getByText(note)).toHaveCount(0);
    await expect(page.getByRole("button", { name: T.save, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: T.addEntry })).toHaveCount(0);
  });

  test("W11-38: the leader has no territories item and gets the English 403 screen on the URL", async () => {
    await page.goto("/workspace/settings/territories");
    await expect(page.locator('div[lang="en"]').getByText(T.forbiddenTitle)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: T.territoriesTitle })).toHaveCount(0);
    await expect(mainArea(page).getByRole("table")).toHaveCount(0);
  });

  test("Review Focus 3: a session that expires inside the workspace ends on the English login notice", async () => {
    await page.getByRole("navigation", { name: T.menuLabel }).getByRole("link", { name: T.menuOwnerLeads }).click();
    await expectListPage(page);
    await expectListSettled(page);

    // The next list call gets a 401 and the refresh is refused: the session has ended.
    await page.route((url) => url.href.startsWith(`${API_URL}/api/v1/staff/owner-leads?`), async (route) => {
      const request = route.request();
      if (request.method() !== "GET") return route.continue();
      await route.fulfill({ status: 401, headers: corsHeaders(request), json: { code: "UNAUTHORIZED", message: "Token expired" } });
    });
    await page.route(`${API_URL}${REFRESH_PATH}`, async (route) => {
      const request = route.request();
      if (request.method() === "OPTIONS") return route.continue();
      await route.fulfill({ status: 401, headers: corsHeaders(request), json: { code: "UNAUTHORIZED", message: "Session ended" } });
    });
    await statusBox(page, T.status.ASSIGNED).click();

    await expect(page).toHaveURL(/\/login\?session=expired&next=%2Fworkspace%2Fowner-leads/, { timeout: 30_000 });
    await expect(page.getByText(TEXT.sessionEnded)).toBeVisible();
    await expect(page.getByText(/Phiên đăng nhập|Đăng nhập lại/)).toHaveCount(0);
  });
});
