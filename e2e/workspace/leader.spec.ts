import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { expectSignedInAccount } from "../support/auth";
import {
  assigneeOption,
  dialog,
  detailHeader,
  expectLeadDetail,
  expectListPage,
  type FixtureLead,
  fixture,
  findLeadLink,
  goToTab,
  leadLink,
  leadRow,
  mainArea,
  newStaffContext,
  openLead,
  signInAs,
  T,
  tab,
  tabs,
  uniqueText,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
  workspaceHeaderLink,
  byLabel,
  byText,
} from "./support/staff";

// The SALE_LEADER in the staff workspace: W11-24, W11-29, W11-32, W11-33, W11-34, W11-35, W11-36 and the leader's 403
// on the territories URL (W11-38). Spec 5.8 budget: 1 sign-in (the second page of W11-35 and W11-36 is the same user
// in a new page of the same browser: it restores its session with the refresh cookie, no second sign-in); full loads
// of protected pages: 7 of 10 (/account, a crafted list URL, its reload, a former-holder URL, the second page twice,
// the territories URL); intake POSTs: 0.
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
const LEADER_OPTION = assigneeOption(fixture.leader.name, "Trưởng nhóm sale");

const statusDialog = (page: Page): Locator => dialog(page, T.changeStatus);
const targets = (page: Page): Locator => statusDialog(page).getByRole("radio");
const target = (page: Page, status: string): Locator => statusDialog(page).getByRole("radio", { name: status, exact: true });
const cancelDialog = (page: Page): Promise<void> => statusDialog(page).getByRole("button", { name: T.cancel }).last().click();
const section = (page: Page, title: string): Locator =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: title, exact: true }) })
    .filter({ visible: true });

/** Goes back to the list from a detail page (if on one), picks the tab and opens the lead by a click. */
async function openFromTab(page: Page, tabName: string, lead: FixtureLead): Promise<void> {
  const back = page.getByRole("link", { name: T.back });
  if (await back.isVisible()) {
    await back.click();
    await expectListPage(page);
  }
  await goToTab(page, tabName);
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
      await statusDialog(other).getByLabel(T.reason).fill(reason);
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

  test("W11-24: the leader lands on the unassigned tab with all three tabs, and the menu has no territories item", async () => {
    await signInAs(page, "SALE_LEADER");
    await expectSignedInAccount(page);
    await expect(workspaceHeaderLink(page)).toBeVisible();
    await page.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(page);

    await expect(tab(page, T.tabUnassigned)).toHaveAttribute("aria-current", "page");
    await expect(tabs(page).getByRole("link")).toHaveText([T.tabMine, T.tabUnassigned, T.tabAll]);
    // The default tab is written to the URL by a replace navigation.
    await expect(page).toHaveURL(/scope=unassigned/);
    // "Chưa giao" lists the NEW leads (also the ones other specs created, over several pages): L1 and L10 are there,
    // and no row on the page shows an assigned status.
    await expect(await findLeadLink(page, L10)).toBeVisible();
    await expect(await findLeadLink(page, L1)).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: T.status.ASSIGNED })).toHaveCount(0);
    for (const lead of [L2, L5]) await expect(leadLink(page, lead)).toHaveCount(0);

    const menu = page.getByRole("navigation", { name: T.menuLabel });
    await expect(menu.getByRole("link", { name: T.menuOwnerLeads })).toBeVisible();
    await expect(menu.getByRole("link", { name: T.menuTerritories })).toHaveCount(0);
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

    const assigned = page.getByRole("checkbox", { name: T.status.ASSIGNED });
    await assigned.click();
    await expect(assigned).toBeChecked();
    await expect(leadLink(page, L2)).toBeVisible();
    await expect(leadLink(page, L1)).toHaveCount(0);
    const url = new URL(page.url());
    expect(url.searchParams.getAll("status")).toEqual(["ASSIGNED"]);
    expect(url.searchParams.has("page"), "page after a filter change").toBe(false);

    await page.reload();
    await expectListPage(page);
    await expect(assigned).toBeChecked();
    await expect(leadLink(page, L2)).toBeVisible();
    await expect(leadLink(page, L1)).toHaveCount(0);
  });

  test("W11-29: the all tab shows who holds each lead; the ward and assignee filters work; a former holder in the URL is labelled", async () => {
    await page.getByRole("link", { name: T.clearFilters }).click();
    await expect(page).not.toHaveURL(/status=/);
    await expect(page.getByRole("columnheader", { name: "Phụ trách" })).toBeVisible();
    // The last cell of a row is the assignee (the "Tất cả" tab adds that column).
    const holder = (lead: FixtureLead) => leadRow(page, lead).getByRole("cell").last();
    await expect(await findLeadLink(page, L1)).toBeVisible();
    await expect(holder(L1)).toHaveText(T.tabUnassigned);
    await expect(await findLeadLink(page, L2)).toBeVisible();
    await expect(holder(L2)).toHaveText(fixture.sale.name);
    await expect(await findLeadLink(page, L5)).toBeVisible();
    await expect(holder(L5)).toHaveText(fixture.leader.name);

    const ward = byLabel(page, "Xã/phường", { exact: true });
    await expect(ward.locator(`option[value="${fixture.territoryWardCode}"]`)).toBeAttached();
    await ward.selectOption(fixture.territoryWardCode);
    await expect(page).toHaveURL(new RegExp(`ward=${fixture.territoryWardCode}`));
    await expect(leadLink(page, L2)).toBeVisible();
    for (const lead of [L1, L3, L5]) await expect(leadLink(page, lead)).toHaveCount(0);
    await ward.selectOption("");
    await expect(page).not.toHaveURL(/ward=/);

    const assignee = byLabel(page, "Nhân viên phụ trách", { exact: true });
    await expect(assignee.locator("option", { hasText: SALE_OPTION })).toHaveCount(1);
    await expect(assignee.locator("option", { hasText: LEADER_OPTION })).toHaveCount(1);
    await assignee.selectOption(fixture.sale.id);
    await expect(page).toHaveURL(new RegExp(`assignee=${fixture.sale.id}`));
    for (const lead of [2, 3, 4, 7, 8, 9].map(fixture.lead)) await expect(leadLink(page, lead)).toBeVisible();
    for (const lead of [L1, L5, L10]) await expect(leadLink(page, lead)).toHaveCount(0);
    await assignee.selectOption(fixture.leader.id);
    await expect(page).toHaveURL(new RegExp(`assignee=${fixture.leader.id}`));
    await expect(leadLink(page, L5)).toBeVisible();
    await expect(leadLink(page, L2)).toHaveCount(0);

    // A holder who no longer takes leads (the admin) and has none: the URL keeps the filter, labelled "Nhân viên khác".
    await page.goto(`/workspace/owner-leads?scope=all&assignee=${fixture.admin.id}`);
    await expectListPage(page);
    const former = byLabel(page, "Nhân viên phụ trách", { exact: true });
    await expect(former).toHaveValue(fixture.admin.id, { timeout: 20_000 });
    await expect(former.locator("option:checked")).toHaveText("Nhân viên khác");
    await expect(byText(page, T.emptyFiltered)).toBeVisible();
  });

  test("W11-32: the status dialog offers exactly the allowed targets; closing needs a reason and a confirmation", async () => {
    await page.getByRole("link", { name: T.clearFilters }).click();
    await expect(page).not.toHaveURL(/assignee=/);
    await openLead(page, L2);

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
    await openFromTab(page, T.tabAll, L4);
    await page.getByRole("button", { name: T.changeStatus }).click();
    await expect(targets(page)).toHaveCount(4);
    await expect(target(page, T.status.ON_HOLD)).toHaveCount(0);

    // A non-closing target has the optional next action; a closing one hides it and asks for a reason.
    await target(page, T.status.CONTACTED).check();
    await expect(statusDialog(page).getByLabel(T.nextActionField)).toBeVisible();
    await target(page, T.status.REJECTED).check();
    await expect(statusDialog(page).getByLabel(T.nextActionField)).toHaveCount(0);
    await statusDialog(page).getByRole("button", { name: T.continue }).click();
    await expect(statusDialog(page).getByText(T.reasonRequired)).toBeVisible();
    await statusDialog(page).getByLabel(T.reason).fill("x".repeat(501));
    await statusDialog(page).getByRole("button", { name: T.continue }).click();
    await expect(statusDialog(page).getByText(T.reasonTooLong)).toBeVisible();

    const reason = uniqueText("chủ nhà từ chối");
    await statusDialog(page).getByLabel(T.reason).fill(reason);
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
    await expect(byLabel(page, T.noteField)).toHaveCount(0);
  });

  test("W11-33: DUPLICATE takes a pasted code or link; the lead itself, an unknown code and a DUPLICATE are refused; a closed original is found", async () => {
    await openFromTab(page, T.tabAll, L8);
    await page.getByRole("button", { name: T.changeStatus }).click();
    const dlg = statusDialog(page);
    await target(page, T.status.DUPLICATE).check();
    // L8 has one possible duplicate (L7): offered as a choice, and "another lead" opens the text field.
    await expect(dlg.getByRole("radio", { name: new RegExp(L7.code) })).toBeEnabled();
    await dlg.getByRole("radio", { name: /Lead khác/ }).check();
    const original = dlg.getByLabel("Link lead hoặc mã yêu cầu", { exact: true });
    const lookup = dlg.getByRole("button", { name: T.lookup, exact: true });
    const origin = new URL(page.url()).origin;

    // Refusals: the lead itself (a link, at once), an unknown code (after "Tìm").
    await original.fill(`${origin}${L8.path}`);
    await expect(dlg.getByText("Không thể chọn chính lead này làm lead gốc.")).toBeVisible();
    await original.fill("SV-E2EA-ZZ9Z");
    await lookup.click();
    await expect(dlg.getByText("Không tìm thấy lead này hoặc bạn không xem được")).toBeVisible();

    // A closed original is found (no status filter on the lookup), whatever the case and the outer spaces.
    await original.fill(`  ${L6.code.toLowerCase()} `);
    await lookup.click();
    await expect(dlg.getByText(new RegExp(`${L6.code} · ${T.status.REJECTED} · \\d{2}/\\d{2}/\\d{4} \\d{2}:\\d{2}`))).toBeVisible();

    // A pasted link (relative) shows the id, no preview of the lead.
    await original.fill(L7.path);
    await expect(dlg.getByText(`Mã lead: ${L7.id}`)).toBeVisible();

    // The original of this DUPLICATE: L7 by its code.
    await original.fill(` ${L7.code.toLowerCase()} `);
    await lookup.click();
    await expect(dlg.getByText(new RegExp(`${L7.code} · ${T.status.ASSIGNED} · \\d{2}/\\d{2}/\\d{4}`))).toBeVisible();
    await dlg.getByLabel(T.reason).fill(uniqueText("trùng lead L7"));
    await dlg.getByRole("button", { name: T.continue }).click();
    await expect(dlg.getByText(T.closeConfirm)).toBeVisible();
    await expect(dlg.getByText(new RegExp(L7.code))).toBeVisible();
    await dlg.getByRole("button", { name: T.confirm }).click();

    await expect(byText(page, T.statusSaved)).toBeVisible();
    await expect(detailHeader(page)).toContainText(T.status.DUPLICATE);
    await expect(page.getByRole("link", { name: "Xem lead gốc" })).toHaveAttribute("href", L7.path);

    // L8 is a DUPLICATE now: it cannot be the original of another lead (L10, a NEW lead; nothing is sent).
    await openFromTab(page, T.tabUnassigned, L10);
    await page.getByRole("button", { name: T.changeStatus }).click();
    await target(page, T.status.DUPLICATE).check();
    await dlg.getByLabel("Link lead hoặc mã yêu cầu", { exact: true }).fill(L8.code);
    await dlg.getByRole("button", { name: T.lookup, exact: true }).click();
    await expect(dlg.getByText("Lead này đã là bản trùng, không chọn làm lead gốc.")).toBeVisible();
    await cancelDialog(page);
    await expect(dlg).toHaveCount(0);

    // A pasted link is sent as it is (the id is shown, no preview; the server decides): L5 (the leader's, no possible
    // duplicate, so the text field shows at once) becomes a DUPLICATE of L7. No later test or spec uses L5.
    await openFromTab(page, T.tabAll, L5);
    await page.getByRole("button", { name: T.changeStatus }).click();
    await target(page, T.status.DUPLICATE).check();
    await dlg.getByLabel("Link lead hoặc mã yêu cầu", { exact: true }).fill(`${origin}${L7.path}`);
    await expect(dlg.getByText(`Mã lead: ${L7.id}`)).toBeVisible();
    await dlg.getByLabel(T.reason).fill(uniqueText("trùng lead L7 qua link"));
    await dlg.getByRole("button", { name: T.continue }).click();
    await expect(dlg.getByText(T.closeConfirm)).toBeVisible();
    await dlg.getByRole("button", { name: T.confirm }).click();

    await expect(byText(page, T.statusSaved)).toBeVisible();
    await expect(detailHeader(page)).toContainText(T.status.DUPLICATE);
    await expect(page.getByRole("link", { name: "Xem lead gốc" })).toHaveAttribute("href", L7.path);
  });

  test("W11-34: the leader assigns a NEW lead to the SALE by name and it leaves the unassigned tab", async () => {
    await openFromTab(page, T.tabUnassigned, L1);
    await expect(page.getByRole("button", { name: T.assign })).toBeVisible();
    await page.getByRole("button", { name: T.assign }).click();
    const assign = dialog(page, T.assign);
    const picker = assign.getByRole("combobox");
    await expect(picker.locator("option", { hasText: SALE_OPTION })).toHaveCount(1);
    await expect(picker.locator("option", { hasText: LEADER_OPTION })).toHaveCount(1);
    await picker.selectOption({ label: SALE_OPTION });
    await assign.getByRole("button", { name: "Giao", exact: true }).click();

    await expect(byText(page, T.assignSaved)).toBeVisible();
    await expect(detailHeader(page)).toContainText(fixture.sale.name);
    await expect(detailHeader(page)).toContainText(T.status.ASSIGNED);
    await expect(page.getByRole("button", { name: T.reassign })).toBeVisible();
    await expect(section(page, "Lịch sử")).toContainText(`Giao cho ${fixture.sale.name}`);

    await page.getByRole("link", { name: T.back }).click();
    await expectListPage(page);
    await goToTab(page, T.tabUnassigned);
    await expect(await findLeadLink(page, L10)).toBeVisible();
    await expect(await findLeadLink(page, L1), "L1 on no page of the unassigned tab").toHaveCount(0);
  });

  test("W11-35: a stale status change shows the concurrency message and keeps the typed reason", async () => {
    await openFromTab(page, T.tabAll, L2);
    await page.getByRole("button", { name: T.changeStatus }).click();
    await target(page, T.status.REJECTED).check();
    const reason = uniqueText("lý do nháp L2");
    await statusDialog(page).getByLabel(T.reason).fill(reason);
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
    await expect(statusDialog(page).getByLabel(T.reason)).toHaveValue(reason);
    await cancelDialog(page);
  });

  test("W11-36: a note on a lead closed in another page gets the 409 message and the typed text stays visible", async () => {
    await openFromTab(page, T.tabAll, L3);
    const note = uniqueText("ghi chú sau khi đóng L3");
    await byLabel(page, T.noteField).fill(note);

    await changeStatusInSecondPage(context, L3, T.status.WITHDRAWN, uniqueText("chủ nhà rút L3"));

    await page.getByRole("button", { name: T.noteSubmit }).click();
    await expect(byText(page, T.noteClosedKeepText)).toBeVisible();
    await expect(detailHeader(page)).toContainText(T.status.WITHDRAWN);
    // The text is still there, read only and copyable, and it was not saved to the history.
    await expect(byLabel(page, T.noteField)).toHaveValue(note);
    await expect(section(page, "Lịch sử").getByText(note)).toHaveCount(0);
    await expect(page.getByRole("button", { name: T.noteSubmit })).toHaveCount(0);
  });

  test("W11-38: the leader has no territories item and gets the 403 screen on the URL", async () => {
    await page.goto("/workspace/settings/territories");
    await expect(byText(page, T.forbiddenTitle)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: T.menuTerritories })).toHaveCount(0);
    await expect(mainArea(page).getByRole("table")).toHaveCount(0);
  });
});
