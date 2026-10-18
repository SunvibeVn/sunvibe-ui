import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { API_URL } from "../support/api";
import { corsHeaders, expectSignedInAccount, headerAccountLink, REFRESH_PATH, storesHolding } from "../support/auth";
import {
  type ApiCall,
  dialog,
  DESKTOP,
  detailHeader,
  expectLeadDetail,
  expectListPage,
  fixture,
  futureNextAction,
  hasSignInHint,
  header,
  isDetailCall,
  isListCall,
  leadLink,
  leadRow,
  mainArea,
  newStaffContext,
  openLead,
  PHONE,
  recordApiCalls,
  recordHosts,
  signInAs,
  signOutFromWorkspace,
  T,
  tabs,
  UNKNOWN_LEAD_ID,
  uniqueText,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
  workspaceHeaderLink,
  byLabel,
  byText,
} from "./support/staff";

// The SALE in the staff workspace: W11-20, W11-23, W11-26/27, W11-28, W11-30, W11-31, W11-37, W11-39, W11-41, W11-42
// and W11-43 (spec 5.7). Spec 5.8 budget: 1 sign-in; full loads of protected pages 4 of 8 (crafted list URL, unknown
// lead id, lead L5, the Back after the sign-out; /account is reached by the login redirect, "/" is a public page and
// the L2 source is a plain HTTP fetch with no browser session); intake POSTs 0. One serial describe, one signed-in page; the leads are opened by clicks.
//
// Fixtures: the file only adds two notes (and a next action) to L4. The SALE spec runs BEFORE the leader
// and admin specs (playwright.workspace.config.ts) because they close L3, L4 and L8 and assign L1 to this SALE, which
// would change the leads this SALE sees. Run BOTH seeds again before every `npm run e2e:workspace`.

test.describe.configure({ mode: "serial", timeout: 120_000 });

const L2 = fixture.lead(2);
const L3 = fixture.lead(3);
const L4 = fixture.lead(4);
const L5 = fixture.lead(5);
const L7 = fixture.lead(7);
const L8 = fixture.lead(8);
const L9 = fixture.lead(9);

/** The titled card of the detail page (`Lịch sử`, `Liên hệ chủ nhà`, ...). */
const section = (page: Page, title: string): Locator =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: title, exact: true }) })
    .filter({ visible: true });

test.describe("SALE in the workspace", () => {
  let context: BrowserContext;
  let page: Page;
  let calls: ApiCall[];
  let hosts: string[];

  test.beforeAll(async ({ browser }) => {
    test.skip(!(await workspaceE2eReady()), WORKSPACE_E2E_SKIP_REASON);
    context = await newStaffContext(browser);
    page = await context.newPage();
    calls = recordApiCalls(context);
    hosts = recordHosts(context);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("W11-20: the SALE sees the workspace link and the card on /account, the link inside the workspace, and only the account icon on /", async () => {
    await signInAs(page, "SALE");
    await expectSignedInAccount(page);
    // The header link is hidden below `sm`: this runs on the desktop viewport.
    await expect(workspaceHeaderLink(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: T.workspace })).toBeVisible();

    await page.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(page);
    await expect(page).toHaveURL(/\/workspace\/owner-leads/);
    await expect(workspaceHeaderLink(page)).toBeVisible();

    // A full load of a public page restores no session: only the account icon, no link and no error.
    await page.goto("/");
    await expect(headerAccountLink(page)).toBeVisible();
    await expect(page.getByRole("link", { name: T.workspace, exact: true })).toHaveCount(0);
  });

  test("W11-23: a crafted URL is replaced by the SALE's own tab and no call asks for another scope or an assignee", async () => {
    const from = calls.length;
    await page.goto("/workspace/owner-leads?scope=all&assignee=abc123");
    await expectListPage(page);
    await expect(leadLink(page, L2)).toBeVisible({ timeout: 20_000 });

    const url = new URL(page.url());
    expect(url.pathname).toBe("/workspace/owner-leads");
    expect(url.searchParams.get("scope")).toBe("mine");
    expect(url.searchParams.has("assignee")).toBe(false);
    // Only "Của tôi" is offered to a SALE.
    const links = tabs(page).getByRole("link");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveText(T.tabMine);

    const sent = calls.slice(from);
    const listCalls = sent.filter(isListCall);
    expect(listCalls.length, "list calls").toBeGreaterThan(0);
    for (const call of listCalls) {
      expect(call.url.searchParams.get("scope"), "scope of a list call").toBe("mine");
      expect(call.url.searchParams.has("assigneeUserId"), "assigneeUserId on a list call").toBe(false);
    }
    expect(sent.filter((call) => call.url.searchParams.get("scope") !== null && call.url.searchParams.get("scope") !== "mine")).toHaveLength(0);
    expect(sent.filter((call) => call.url.pathname.endsWith("/owner-lead-assignees")), "assignee list calls").toHaveLength(0);
    expect(sent.filter((call) => isDetailCall(call)), "detail calls while the list is shown").toHaveLength(0);
  });

  test("W11-27 and W11-26: the list shows the fields of each lead of the SALE and never a phone, email or address", async () => {
    // The SALE sees exactly these six open leads; the others (L1, L5, L6, L10) are not theirs.
    for (const lead of [2, 3, 4, 7, 8, 9].map(fixture.lead)) await expect(leadLink(page, lead)).toBeVisible();
    for (const lead of [1, 5, 6, 10].map(fixture.lead)) await expect(leadLink(page, lead)).toHaveCount(0);

    const row = leadRow(page, L2);
    for (const text of [L2.contactName, "An Hải", "Cho thuê ngắn hạn", "1 phòng ngủ", T.status.ASSIGNED]) {
      await expect(row).toContainText(text);
    }
    await expect(row).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    // L3's next action is a day in the past on an open lead: flagged. L8 repeats the phone of L7: flagged.
    await expect(leadRow(page, L3)).toContainText(T.overdue);
    await expect(leadRow(page, L8)).toContainText(T.possibleDuplicate);

    const shown = await mainArea(page).innerText();
    expect(shown).not.toMatch(/912\d{6}|\+84|@example\.com|Võ Văn Kiệt|Nguyễn Văn Linh|Bạch Đằng|Hoàng Sa/);
  });

  test("W11-42: hovering the rows sends no detail request; opening a lead sends one", async () => {
    const from = calls.length;
    for (const lead of [2, 3, 4, 7, 8, 9].map(fixture.lead)) await leadRow(page, lead).hover();
    // A negative check needs a short settle: a hover prefetch would have started by now.
    await page.waitForTimeout(750);
    expect(calls.slice(from).filter((call) => isDetailCall(call)), "detail requests after hovering").toHaveLength(0);

    const beforeOpen = calls.length;
    await openLead(page, L2);
    expect(calls.slice(beforeOpen).filter((call) => isDetailCall(call, L2.id)), "detail requests of L2").toHaveLength(1);
  });

  test("W11-27, W11-30 and W11-39: the detail of L2 shows the contact with tel:, the map link only after a click, and the history with names", async () => {
    const contact = section(page, "Liên hệ chủ nhà");
    await expect(contact).toContainText(L2.contactName);
    await expect(contact.getByRole("link", { name: new RegExp(L2.phoneTail) })).toHaveAttribute("href", /^tel:/);
    await expect(contact.locator('a[href^="mailto:"]')).toHaveCount(0);
    const asset = section(page, "Bất động sản");
    await expect(asset).toContainText("88 Võ Văn Kiệt");
    await expect(asset).toContainText(/800\.000/);
    await expect(asset).toContainText("/đêm");

    // C-22: a button with the directions link in a new tab; nothing was requested from Google before a click.
    const map = page.getByRole("link", { name: T.map });
    await expect(map).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=16\.0812\d*,108\.2453\d*$/);
    await expect(map).toHaveAttribute("target", "_blank");
    await expect(map).toHaveAttribute("rel", /noopener/);
    await expect(map).toHaveAttribute("rel", /noreferrer/);
    expect(hosts.filter((host) => /(^|\.)google\.com$/.test(host)), "requests to google.com so far").toHaveLength(0);

    // W11-39: the owner's own entry is "Chủ nhà"; the assignment shows the names of both staff.
    const history = section(page, "Lịch sử");
    await expect(history.getByText("Chủ nhà gửi form")).toBeVisible();
    await expect(history.getByText("Chủ nhà", { exact: true })).toBeVisible();
    await expect(history.getByText(fixture.leader.name, { exact: true })).toBeVisible();
    await expect(history.getByText(`Giao cho ${fixture.sale.name}`)).toBeVisible();
  });

  test("W11-41: the server HTML of a detail page holds no owner data or staff name, and the title is generic", async () => {
    const response = await context.request.get(L2.path);
    expect(response.status()).toBe(200);
    expect(response.url()).toContain(L2.id);
    const html = await response.text();
    expect(html).toContain("<html");
    for (const secret of [L2.contactName, L2.phoneTail, L2.code, "88 Võ Văn Kiệt", fixture.sale.name, fixture.leader.name]) {
      expect(html.includes(secret), "the server HTML holds an owner datum or a staff name").toBe(false);
    }
    const title = await page.title();
    expect(title).not.toContain(L2.code);
    expect(title).not.toContain(L2.contactName);
  });

  test("W11-30: L9 has no coordinates, so no map button", async () => {
    await page.getByRole("link", { name: T.back }).click();
    await expectListPage(page);
    await openLead(page, L9);
    await expect(section(page, "Bất động sản")).toBeVisible();
    await expect(page.getByRole("link", { name: T.map })).toHaveCount(0);
  });

  test("W11-31: a note with a next action appears in the history without a detail reload; an empty next action keeps the current one", async () => {
    await page.getByRole("link", { name: T.back }).click();
    await expectListPage(page);
    await openLead(page, L3);
    // W11-27: the detail shows the phone as tel: and the email as mailto:.
    const contact = section(page, "Liên hệ chủ nhà");
    await expect(contact.getByRole("link", { name: new RegExp(L3.phoneTail) })).toHaveAttribute("href", /^tel:/);
    await expect(contact.locator('a[href="mailto:hanh.e2e@example.com"]')).toBeVisible();
    // W11-26: an open lead with a next action in the past is flagged.
    await expect(detailHeader(page)).toContainText(T.overdue);
    await expect(detailHeader(page)).toContainText(T.status.CONTACTED);

    // The note goes to L4 (ON_HOLD): L3 keeps its overdue next action, so this file can run again on the same data.
    await page.getByRole("link", { name: T.back }).click();
    await expectListPage(page);
    await openLead(page, L4);

    // An empty note is refused before any call.
    const noteBox = byLabel(page, T.noteField);
    await page.getByRole("button", { name: T.noteSubmit }).click();
    await expect(byText(page, T.noteRequired)).toBeVisible();

    const text = uniqueText("ghi chú L4");
    const next = futureNextAction(30);
    await noteBox.fill(text);
    await expect(byText(page, `${text.length} / 2000`)).toBeVisible();
    await byLabel(page, T.nextActionField).fill(next.input);

    const from = calls.length;
    await page.getByRole("button", { name: T.noteSubmit }).click();
    await expect(byText(page, T.noteSaved)).toBeVisible();
    const history = section(page, "Lịch sử");
    await expect(history.getByText(text)).toBeVisible();
    await expect(history.getByText(`Việc tiếp theo: ${next.shown}`)).toBeVisible();
    await expect(detailHeader(page)).toContainText(next.shown);
    await expect(noteBox).toHaveValue("");
    // The page took the 201 answer: no detail request after the save (a settle for the negative check).
    await page.waitForTimeout(750);
    expect(calls.slice(from).filter((call) => isDetailCall(call)), "detail requests after the note").toHaveLength(0);

    // A second note with the next action left empty keeps the current one.
    const second = uniqueText("ghi chú L4 hai");
    await noteBox.fill(second);
    await page.getByRole("button", { name: T.noteSubmit }).click();
    await expect(history.getByText(second)).toBeVisible();
    await expect(detailHeader(page)).toContainText(next.shown);
  });

  test("W11-28: cards and no sideways scroll on a phone, the table on a desktop, the empty state, and the menu drawer's focus", async () => {
    await page.getByRole("link", { name: T.back }).click();
    await expectListPage(page);
    await expect(leadLink(page, L2)).toBeVisible();

    // Desktop: a table, no cards.
    await expect(page.getByRole("table", { name: T.listCaption })).toBeVisible();
    await expect(page.getByRole("list", { name: T.listCaption })).toHaveCount(0);

    await page.setViewportSize(PHONE);
    await expect(page.getByRole("list", { name: T.listCaption })).toBeVisible();
    await expect(page.getByRole("table", { name: T.listCaption })).toHaveCount(0);
    await expect(leadLink(page, L2)).toBeVisible();
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll, "scrollWidth <= clientWidth on a 390 px phone").toBeLessThanOrEqual(widths.client);

    // Empty state: no lead of the SALE is "Chủ nhà rút".
    const withdrawn = page.getByRole("checkbox", { name: T.status.WITHDRAWN });
    await withdrawn.click();
    await expect(withdrawn).toBeChecked();
    await expect(byText(page, T.emptyFiltered)).toBeVisible();
    await page.getByRole("link", { name: T.clearFilters }).click();
    await expect(leadLink(page, L2)).toBeVisible();

    // The menu drawer (phone only): focus goes to the first link, Esc closes it, focus returns to the menu button.
    const menuButton = header(page).locator('button[aria-controls="workspace-drawer"]');
    await menuButton.click();
    const drawer = page.getByRole("dialog", { name: T.menuLabel });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: T.menuOwnerLeads })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(menuButton).toBeFocused();
    await expect(menuButton).toHaveAccessibleName(T.menuOpen);

    await page.setViewportSize(DESKTOP);
  });

  test("W11-37: an unknown lead id and a lead of the leader (L5) go back to the list with the notice", async () => {
    for (const path of [`/workspace/owner-leads/${UNKNOWN_LEAD_ID}`, L5.path]) {
      await page.goto(path);
      await expect(byText(page, T.leadNotFoundNotice)).toBeVisible({ timeout: 20_000 });
      await expectListPage(page);
      // The address bar keeps no lead id, and nothing of the other lead is on screen.
      expect(new URL(page.url()).pathname).toBe("/workspace/owner-leads");
      // Hidden Activity copies count (BR-2): look at the whole DOM, not only what is visible.
      const html = await page.content();
      expect(html.includes(L5.code), "L5 code anywhere in the page").toBe(false);
      expect(html.includes(L5.contactName), "L5 owner name anywhere in the page").toBe(false);
    }
  });

  test("W11-43: a typed note and reason survive an unavailable session; a sign-out leaves no lead data (W11-41)", async () => {
    await openLead(page, L9);
    const noteDraft = uniqueText("nháp ghi chú");
    const reasonDraft = uniqueText("nháp lý do");

    // A reason typed in the status dialog (closing target) stays after the dialog is cancelled.
    await page.getByRole("button", { name: T.changeStatus }).click();
    const statusDialog = dialog(page, T.changeStatus);
    await statusDialog.getByRole("radio", { name: T.status.REJECTED }).check();
    await statusDialog.getByLabel("Lý do").fill(reasonDraft);
    await statusDialog.getByRole("button", { name: "Hủy" }).last().click();
    await expect(statusDialog).toHaveCount(0);

    await byLabel(page, T.noteField).fill(noteDraft);
    // Drafts live in the memory of the tab only (C-33).
    expect(await storesHolding(page, noteDraft), "stores holding the note").toEqual([]);
    expect(await storesHolding(page, reasonDraft), "stores holding the reason").toEqual([]);

    // The save gets a 401, the refresh cannot reach the API: the session becomes unavailable.
    const notePath = `${API_URL}/api/v1/staff/owner-leads/${L9.id}/activities`;
    await page.route(notePath, async (route) => {
      const request = route.request();
      if (request.method() !== "POST") return route.continue();
      await route.fulfill({
        status: 401,
        headers: corsHeaders(request),
        json: { code: "UNAUTHORIZED", message: "Token expired" },
      });
    });
    await page.route(`${API_URL}${REFRESH_PATH}`, (route) => route.abort());
    await page.getByRole("button", { name: T.noteSubmit }).click();
    // The refresh is retried at about +2 s and +12 s before the block shows.
    await expect(byText(page, T.sessionUnavailableTitle)).toBeVisible({ timeout: 60_000 });
    await expect(byLabel(page, T.noteField)).toHaveCount(0);

    // The server is reachable again: retry, and the typed texts are back.
    await page.unroute(notePath);
    await page.unroute(`${API_URL}${REFRESH_PATH}`);
    await page.getByRole("button", { name: T.sessionRetry }).click();
    await expectLeadDetail(page, L9);
    await expect(byLabel(page, T.noteField)).toHaveValue(noteDraft);
    await page.getByRole("button", { name: T.changeStatus }).click();
    await statusDialog.getByRole("radio", { name: T.status.REJECTED }).check();
    await expect(statusDialog.getByLabel("Lý do")).toHaveValue(reasonDraft);
    await statusDialog.getByRole("button", { name: "Hủy" }).last().click();
    await expect(statusDialog).toHaveCount(0);

    // W11-43 / W11-41: sign out here; the hint is gone, Back shows the login page and no lead data or draft.
    await signOutFromWorkspace(page);
    await expect.poll(() => hasSignInHint(page), { message: "the sign-in hint is gone" }).toBe(false);
    await page.goBack();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
    // The whole DOM, hidden Activity copies included (BR-2, C-33).
    const html = await page.content();
    for (const secret of [L9.code, L9.contactName, noteDraft, reasonDraft, L4.code, L7.code, L8.code]) {
      expect(html.includes(secret), "lead data or draft in the page after the sign-out and Back").toBe(false);
    }
    expect(await storesHolding(page, noteDraft), "stores holding the note after the sign-out").toEqual([]);
  });
});
