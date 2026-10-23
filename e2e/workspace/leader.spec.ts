import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { API_URL } from "../support/api";
import { corsHeaders, expectSignedInAccount, REFRESH_PATH, TEXT } from "../support/auth";
import {
  assigneeOption,
  clickStatusBox,
  dialog,
  detailHeader,
  expectLeadDetail,
  expectListPage,
  expectListSettled,
  type FixtureLead,
  fixture,
  findLeadLink,
  goToTab,
  header,
  leadLink,
  mainArea,
  newStaffContext,
  openLead,
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
  T.status.ON_HOLD,
  T.status.DUPLICATE,
  T.status.REJECTED,
  T.status.WITHDRAWN,
  T.showClosed,
];
const NO_NEW_BOXES = ALL_BOXES.slice(1);
const OPEN_DEFAULT = [T.status.ASSIGNED, T.status.CONTACTED, T.status.ON_HOLD];

const statusDialog = (page: Page): Locator => dialog(page, T.changeStatus);
const targets = (page: Page): Locator => statusDialog(page).getByRole("radio");
const target = (page: Page, status: string): Locator => statusDialog(page).getByRole("radio", { name: status, exact: true });
const cancelDialog = (page: Page): Promise<void> => statusDialog(page).getByRole("button", { name: T.cancel }).last().click();
const assigneeFilter = (page: Page): Locator => byLabel(page, T.assigneeFilter, { exact: true });
const section = (page: Page, title: string): Locator =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: title, exact: true }) })
    .filter({ visible: true });

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
    await other.getByRole("button", { name: T.changeStatus }).click();
    await target(other, status).check();
    if (reason !== undefined) {
      await statusDialog(other).getByRole("textbox", { name: T.reason, exact: true }).fill(reason);
      await statusDialog(other).getByRole("button", { name: T.continue }).click();
      await expect(statusDialog(other).getByText(T.closeConfirm)).toBeVisible();
    }
    await statusDialog(other).getByRole("button", { name: T.confirm }).click();
    await expect(byText(other, T.statusSaved)).toBeVisible();
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

  test("W11-32: the status dialog offers exactly the allowed targets; closing needs a reason and a confirmation", async () => {
    await openFromAssignee(page, fixture.sale.id, L2);

    // ASSIGNED -> CONTACTED, ON_HOLD, DUPLICATE, REJECTED, WITHDRAWN.
    await page.getByRole("button", { name: T.changeStatus }).click();
    await expect(targets(page)).toHaveCount(5);
    for (const status of ["CONTACTED", "ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"] as const) {
      await expect(target(page, T.status[status])).toBeVisible();
    }
    await expect(target(page, T.status.ASSIGNED)).toHaveCount(0);
    await cancelDialog(page);
    await expect(statusDialog(page)).toHaveCount(0);

    // ON_HOLD (L4) -> CONTACTED, DUPLICATE, REJECTED, WITHDRAWN.
    await openFromAssignee(page, fixture.sale.id, L4);
    await page.getByRole("button", { name: T.changeStatus }).click();
    await expect(targets(page)).toHaveCount(4);
    await expect(target(page, T.status.ON_HOLD)).toHaveCount(0);

    // A non-closing target has the optional next action; a closing one hides it and asks for a reason.
    await target(page, T.status.CONTACTED).check();
    await expect(statusDialog(page).getByLabel(T.nextActionField, { exact: true })).toBeVisible();
    await target(page, T.status.REJECTED).check();
    await expect(statusDialog(page).getByLabel(T.nextActionField, { exact: true })).toHaveCount(0);
    await statusDialog(page).getByRole("button", { name: T.continue }).click();
    await expect(statusDialog(page).getByText(T.reasonRequired)).toBeVisible();
    await statusDialog(page).getByRole("textbox", { name: T.reason, exact: true }).fill("x".repeat(501));
    await statusDialog(page).getByRole("button", { name: T.continue }).click();
    await expect(statusDialog(page).getByText(T.reasonTooLong)).toBeVisible();

    const reason = uniqueText("owner declined");
    await statusDialog(page).getByRole("textbox", { name: T.reason, exact: true }).fill(reason);
    await statusDialog(page).getByRole("button", { name: T.continue }).click();
    await expect(statusDialog(page).getByText(T.closeConfirm)).toBeVisible();
    await statusDialog(page).getByRole("button", { name: T.confirm }).click();

    // The lead is closed: banner and reason, no status or assign button, no note form (W11-34: no assign when closed).
    await expect(byText(page, T.statusSaved)).toBeVisible();
    await expect(detailHeader(page)).toContainText(T.status.REJECTED);
    await expect(detailHeader(page)).toContainText(T.closedBanner);
    await expect(detailHeader(page)).toContainText(reason);
    await expect(page.getByRole("button", { name: T.changeStatus })).toHaveCount(0);
    await expect(page.getByRole("button", { name: T.reassign })).toHaveCount(0);
    await expect(page.getByRole("button", { name: T.assign })).toHaveCount(0);
    await expect(byLabel(page, T.noteField, { exact: true })).toHaveCount(0);
  });

  test("W11-33: DUPLICATE takes a pasted code or link; the lead itself, an unknown code and a DUPLICATE are refused; a closed original is found", async () => {
    await openFromAssignee(page, fixture.sale.id, L8);
    await page.getByRole("button", { name: T.changeStatus }).click();
    const dlg = statusDialog(page);
    await target(page, T.status.DUPLICATE).check();
    // L8 has one possible duplicate (L7): offered as a choice, and "another lead" opens the text field.
    await expect(dlg.getByRole("radio", { name: new RegExp(L7.code) })).toBeEnabled();
    await dlg.getByRole("radio", { name: /Another lead/ }).check();
    const original = dlg.getByRole("textbox", { name: "Lead link or request code", exact: true });
    const lookup = dlg.getByRole("button", { name: T.lookup, exact: true });
    const origin = new URL(page.url()).origin;

    // Refusals: the lead itself (a link, at once), an unknown code (after "Find").
    await original.fill(`${origin}${L8.path}`);
    await expect(dlg.getByText("This lead cannot be its own original.")).toBeVisible();
    await original.fill("SV-E2EA-ZZ9Z");
    await lookup.click();
    await expect(dlg.getByText("Lead not found, or you cannot see it")).toBeVisible();

    // A closed original is found (no status filter on the lookup), whatever the case and the outer spaces.
    await original.fill(`  ${L6.code.toLowerCase()} `);
    await lookup.click();
    await expect(dlg.getByText(new RegExp(`${L6.code} · ${T.status.REJECTED} · ${TIME.source}`))).toBeVisible();

    // A pasted link (relative) shows the id, no preview of the lead.
    await original.fill(L7.path);
    await expect(dlg.getByText(`Lead ID: ${L7.id}`)).toBeVisible();

    // The original of this DUPLICATE: L7 by its code.
    await original.fill(` ${L7.code.toLowerCase()} `);
    await lookup.click();
    await expect(dlg.getByText(new RegExp(`${L7.code} · ${T.status.ASSIGNED} · \\d{2}/\\d{2}/\\d{4}`))).toBeVisible();
    await dlg.getByRole("textbox", { name: T.reason, exact: true }).fill(uniqueText("duplicate of L7"));
    await dlg.getByRole("button", { name: T.continue }).click();
    await expect(dlg.getByText(T.closeConfirm)).toBeVisible();
    await expect(dlg.getByText(new RegExp(L7.code))).toBeVisible();
    await dlg.getByRole("button", { name: T.confirm }).click();

    await expect(byText(page, T.statusSaved)).toBeVisible();
    await expect(detailHeader(page)).toContainText(T.status.DUPLICATE);
    await expect(page.getByRole("link", { name: "View original lead" })).toHaveAttribute("href", L7.path);

    // L8 is a DUPLICATE now: it cannot be the original of another lead (L10, a NEW lead; nothing is sent).
    await openUnassigned(page, L10);
    await page.getByRole("button", { name: T.changeStatus }).click();
    await target(page, T.status.DUPLICATE).check();
    await dlg.getByRole("textbox", { name: "Lead link or request code", exact: true }).fill(L8.code);
    await dlg.getByRole("button", { name: T.lookup, exact: true }).click();
    await expect(dlg.getByText("This lead is already a duplicate and cannot be the original.")).toBeVisible();
    await cancelDialog(page);
    await expect(dlg).toHaveCount(0);

    // A pasted link is sent as it is (the id is shown, no preview; the server decides): L5 (the leader's, no possible
    // duplicate, so the text field shows at once) becomes a DUPLICATE of L7. No later test or spec uses L5.
    await openFromAssignee(page, fixture.leader.id, L5);
    await page.getByRole("button", { name: T.changeStatus }).click();
    await target(page, T.status.DUPLICATE).check();
    await dlg.getByRole("textbox", { name: "Lead link or request code", exact: true }).fill(`${origin}${L7.path}`);
    await expect(dlg.getByText(`Lead ID: ${L7.id}`)).toBeVisible();
    await dlg.getByRole("textbox", { name: T.reason, exact: true }).fill(uniqueText("duplicate of L7 by link"));
    await dlg.getByRole("button", { name: T.continue }).click();
    await expect(dlg.getByText(T.closeConfirm)).toBeVisible();
    await dlg.getByRole("button", { name: T.confirm }).click();

    await expect(byText(page, T.statusSaved)).toBeVisible();
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
    await expect(section(page, T.history)).toContainText(`Assigned to ${fixture.sale.name}`);

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
    await page.getByRole("button", { name: T.changeStatus }).click();
    await target(page, T.status.REJECTED).check();
    const reason = uniqueText("draft reason L2");
    await statusDialog(page).getByRole("textbox", { name: T.reason, exact: true }).fill(reason);
    await statusDialog(page).getByRole("button", { name: T.continue }).click();
    await expect(statusDialog(page).getByText(T.closeConfirm)).toBeVisible();

    // Meanwhile a second page moves L2 to ON_HOLD: the first page holds an old version.
    await changeStatusInSecondPage(context, L2, T.status.ON_HOLD);

    await statusDialog(page).getByRole("button", { name: T.confirm }).click();
    // The lead reloads with another status: the dialog closes and the message stays under the buttons.
    await expect(byText(page, T.concurrent)).toBeVisible();
    await expect(statusDialog(page)).toHaveCount(0);
    await expect(detailHeader(page)).toContainText(T.status.ON_HOLD);

    // The reason is still in the draft when the dialog is opened again.
    await page.getByRole("button", { name: T.changeStatus }).click();
    await target(page, T.status.REJECTED).check();
    await expect(statusDialog(page).getByRole("textbox", { name: T.reason, exact: true })).toHaveValue(reason);
    await cancelDialog(page);
  });

  test("W11-36: a note on a lead closed in another page gets the 409 message and the typed text stays visible", async () => {
    await openFromAssignee(page, fixture.sale.id, L3);
    const note = uniqueText("note after L3 closed");
    await byLabel(page, T.noteField, { exact: true }).fill(note);

    await changeStatusInSecondPage(context, L3, T.status.WITHDRAWN, uniqueText("owner withdrew L3"));

    await page.getByRole("button", { name: T.noteSubmit }).click();
    await expect(byText(page, T.noteClosedKeepText)).toBeVisible();
    await expect(detailHeader(page)).toContainText(T.status.WITHDRAWN);
    // The text is still there, read only and copyable, and it was not saved to the history.
    await expect(byLabel(page, T.noteField, { exact: true })).toHaveValue(note);
    await expect(section(page, T.history).getByText(note)).toHaveCount(0);
    await expect(page.getByRole("button", { name: T.noteSubmit })).toHaveCount(0);
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
