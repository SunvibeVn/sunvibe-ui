import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { API_URL } from "../support/api";
import { corsHeaders, expectSignedInAccount, headerAccountLink, REFRESH_PATH, storesHolding } from "../support/auth";
import {
  type ApiCall,
  clickStatusBox,
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
  leadCard,
  leadLink,
  leadRow,
  newStaffContext,
  openLead,
  PHONE,
  recordApiCalls,
  recordHosts,
  signInAs,
  signOutFromWorkspace,
  statusBox,
  statusBoxLabels,
  T,
  tabs,
  tickedStatusLabels,
  TIME,
  UNKNOWN_LEAD_ID,
  uniqueText,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
  workspaceHeaderLink,
  byLabel,
  byText,
} from "./support/staff";

// The SALE in the staff workspace: W11-20, W11-23, W11-27, W11-28, W11-30, W11-31, W11-37, W11-39, W11-41, W11-42,
// W11-43 (spec 2026-10-18 5.7) in English, and W14-22, W14-24, W14-25, W14-26, W14-30, W14-31, W14-32, W14-33 (spec
// 2026-10-22 5.6). Spec 5.8 budget: 1 sign-in; full loads of protected pages 4 of 8 (crafted list URL, unknown lead
// id, lead L5, the Back after the sign-out; /account is reached by the login redirect, "/" is a public page and the L2
// source is a plain HTTP fetch with no browser session); intake POSTs 0. One serial describe, one signed-in page; the
// leads are opened by clicks.
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

/** C-46 column positions in a table row. */
const COL = { code: 0, owner: 1, ward: 2, requirement: 3, propertyType: 4, status: 5, created: 6, lastUpdate: 7, note: 8, action: 9 };

/** The titled card of the detail page (`History`, `Owner contact`, ...). */
const section = (page: Page, title: string): Locator =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: title, exact: true }) })
    .filter({ visible: true });

const cell = (row: Locator, index: number): Locator => row.getByRole("cell").nth(index);

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

  test("W11-20, W14-22 and W14-24: the public link and the English card on /account; the workspace top bar and SUPPLY LEADS", async () => {
    await signInAs(page, "SALE");
    await expectSignedInAccount(page);
    // The public header link stays Vietnamese (hidden below `sm`: this runs on the desktop viewport).
    await expect(workspaceHeaderLink(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: T.accountCardTitle, exact: true })).toBeVisible();

    await page.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(page);
    await expect(page).toHaveURL(/\/workspace\/owner-leads/);

    // C-43, A-9: logo, "Workspace", the user's full name and "Sign Out"; no link to the workspace itself.
    const bar = header(page);
    await expect(bar.getByRole("link", { name: "Sunvibe home" })).toBeVisible();
    await expect(bar.getByText(T.topBarLabel, { exact: true })).toBeVisible();
    await expect(bar.getByText(fixture.sale.name, { exact: true })).toBeVisible();
    await expect(bar.getByRole("button", { name: T.signOut, exact: true })).toBeVisible();
    await expect(workspaceHeaderLink(page)).toHaveCount(0);
    // C-42: the menu item; a SALE has no territories item.
    const menu = page.getByRole("navigation", { name: T.menuLabel });
    await expect(menu.getByRole("link")).toHaveText([T.menuOwnerLeads]);
    // W14-23: the workspace subtree is English, the document stays Vietnamese.
    await expect(page.locator('div[lang="en"]').getByRole("heading", { level: 1, name: T.listTitle })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");

    // A full load of a public page restores no session: only the account icon, no link and no error.
    await page.goto("/");
    await expect(headerAccountLink(page)).toBeVisible();
    await expect(page.getByRole("link", { name: T.workspaceLink, exact: true })).toHaveCount(0);
  });

  test("W11-23, W14-25 and W14-26: a crafted URL becomes My Leads with Assigned, Contacted and On Hold; no other scope or assignee is asked for", async () => {
    const from = calls.length;
    await page.goto("/workspace/owner-leads?scope=all&assignee=abc123");
    await expectListPage(page);
    await expect(leadLink(page, L2)).toBeVisible({ timeout: 20_000 });

    const url = new URL(page.url());
    expect(url.pathname).toBe("/workspace/owner-leads");
    expect(url.searchParams.get("scope")).toBe("mine");
    expect(url.searchParams.has("assignee")).toBe(false);
    // Only "My Leads" is offered to a SALE, still as a tab bar.
    const links = tabs(page).getByRole("link");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveText(T.tabMine);
    await expect(links.first()).toHaveAttribute("aria-current", "page");

    // The boxes of My Leads: no Unassigned; the default set ticked.
    expect(await statusBoxLabels(page)).toEqual([
      T.status.ASSIGNED,
      T.status.CONTACTED,
      T.status.ON_HOLD,
      T.status.DUPLICATE,
      T.status.REJECTED,
      T.status.WITHDRAWN,
      T.showClosed,
    ]);
    expect(await tickedStatusLabels(page)).toEqual([T.status.ASSIGNED, T.status.CONTACTED, T.status.ON_HOLD]);

    const sent = calls.slice(from);
    const listCalls = sent.filter(isListCall);
    expect(listCalls.length, "list calls").toBeGreaterThan(0);
    for (const call of listCalls) {
      expect(call.url.searchParams.get("scope"), "scope of a list call").toBe("mine");
      expect(call.url.searchParams.getAll("status"), "status of a list call").toEqual(["ASSIGNED", "CONTACTED", "ON_HOLD"]);
      expect(call.url.searchParams.has("assigneeUserId"), "assigneeUserId on a list call").toBe(false);
    }
    expect(sent.filter((call) => call.url.searchParams.get("scope") !== null && call.url.searchParams.get("scope") !== "mine")).toHaveLength(0);
    expect(sent.filter((call) => call.url.pathname.endsWith("/owner-lead-assignees")), "assignee list calls").toHaveLength(0);
    expect(sent.filter((call) => isDetailCall(call)), "detail calls while the list is shown").toHaveLength(0);
  });

  test("W11-27, W14-30 and W14-33: the table has the C-46 columns and never a next action, assignee, phone, email or address", async () => {
    // The SALE sees exactly these six open leads; the others (L1, L5, L6, L10) are not theirs.
    for (const lead of [2, 3, 4, 7, 8, 9].map(fixture.lead)) await expect(leadLink(page, lead)).toBeVisible();
    for (const lead of [1, 5, 6, 10].map(fixture.lead)) await expect(leadLink(page, lead)).toHaveCount(0);

    const table = page.getByRole("table", { name: T.listCaption });
    await expect(table.getByRole("columnheader")).toHaveText([...T.columns]);
    // No sort control (C-46).
    await expect(table.locator("[aria-sort]")).toHaveCount(0);
    await expect(table.locator("thead").getByRole("button")).toHaveCount(0);

    const row = leadRow(page, L2);
    await expect(cell(row, COL.code)).toHaveText(L2.code);
    await expect(cell(row, COL.code).getByRole("link")).toHaveCount(0);
    await expect(cell(row, COL.owner)).toHaveText(L2.contactName);
    await expect(cell(row, COL.ward)).toContainText("An Hải");
    await expect(cell(row, COL.requirement)).toHaveText("Short-term rental");
    await expect(cell(row, COL.propertyType)).toHaveText("Homestay");
    await expect(cell(row, COL.status)).toHaveText(T.status.ASSIGNED);
    await expect(cell(row, COL.created)).toHaveText(TIME);
    await expect(cell(row, COL.lastUpdate)).toHaveText(TIME);
    await expect(cell(row, COL.action).getByRole("link")).toHaveText("View");
    // L8 repeats the phone of L7: flagged. Every NOTE is the badge or a dash, nothing else.
    await expect(cell(leadRow(page, L8), COL.note)).toHaveText(T.possibleDuplicate);
    for (const note of await table.locator("tbody tr").locator("td:nth-child(9)").allInnerTexts()) {
      expect([T.possibleDuplicate, T.noNote], "a NOTE cell").toContain(note.trim());
    }
    // C-47: L3's next action is in the past on an open lead; the list no longer shows it or flags it.
    await expect(leadRow(page, L3)).not.toContainText(T.overdue);

    const shown = await table.innerText();
    expect(shown).not.toMatch(/912\d{6}|\+84|@example\.com|Võ Văn Kiệt|Nguyễn Văn Linh|Bạch Đằng|Hoàng Sa/);
    expect(shown).not.toContain(fixture.sale.name);
    expect(shown).not.toContain(fixture.leader.name);
    expect(shown).not.toMatch(/Next action|Assignee|Overdue/);

    // At least 1200px wide, scrolling sideways inside its box; the page itself does not scroll sideways.
    const widths = await table.evaluate((element) => {
      const box = element.parentElement as HTMLElement;
      return {
        table: element.getBoundingClientRect().width,
        boxScroll: box.scrollWidth,
        boxClient: box.clientWidth,
        overflowX: getComputedStyle(box).overflowX,
        page: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      };
    });
    expect(widths.table, "table width").toBeGreaterThanOrEqual(1200);
    expect(widths.overflowX).toBe("auto");
    expect(widths.boxScroll, "the table box scrolls sideways at 1280 px").toBeGreaterThan(widths.boxClient);
    expect(widths.page, "the page does not scroll sideways").toBeLessThanOrEqual(widths.viewport);
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
    const contact = section(page, T.contact);
    await expect(contact).toContainText(L2.contactName);
    await expect(contact.getByRole("link", { name: new RegExp(L2.phoneTail) })).toHaveAttribute("href", /^tel:/);
    await expect(contact.locator('a[href^="mailto:"]')).toHaveCount(0);
    const asset = section(page, T.property);
    await expect(asset).toContainText("88 Võ Văn Kiệt");
    await expect(asset).toContainText(/800\.000/);
    await expect(asset).toContainText("/night");

    // C-22: a button with the directions link in a new tab; nothing was requested from Google before a click.
    const map = page.getByRole("link", { name: T.map });
    await expect(map).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=16\.0812\d*,108\.2453\d*$/);
    await expect(map).toHaveAttribute("target", "_blank");
    await expect(map).toHaveAttribute("rel", /noopener/);
    await expect(map).toHaveAttribute("rel", /noreferrer/);
    expect(hosts.filter((host) => /(^|\.)google\.com$/.test(host)), "requests to google.com so far").toHaveLength(0);

    // W11-39: the owner's own entry is "Owner"; the assignment shows the names of both staff.
    const history = section(page, T.history);
    await expect(history.getByText("Owner submitted the form")).toBeVisible();
    await expect(history.getByText("Owner", { exact: true })).toBeVisible();
    await expect(history.getByText(fixture.leader.name, { exact: true })).toBeVisible();
    await expect(history.getByText(`Assigned to ${fixture.sale.name}`)).toBeVisible();
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
    await expect(section(page, T.property)).toBeVisible();
    await expect(page.getByRole("link", { name: T.map })).toHaveCount(0);
  });

  test("W11-31 and W14-31: a note appears in the history without a reload, and LAST UPDATE in the list is the note's time", async () => {
    await page.getByRole("link", { name: T.back }).click();
    await expectListPage(page);
    await openLead(page, L3);
    // W11-27: the detail shows the phone as tel: and the email as mailto:.
    const contact = section(page, T.contact);
    await expect(contact.getByRole("link", { name: new RegExp(L3.phoneTail) })).toHaveAttribute("href", /^tel:/);
    await expect(contact.locator('a[href="mailto:hanh.e2e@example.com"]')).toBeVisible();
    // The detail keeps the overdue flag of an open lead with a next action in the past (C-47 drops it from the list only).
    await expect(detailHeader(page)).toContainText(T.overdue);
    await expect(detailHeader(page)).toContainText(T.status.CONTACTED);

    // The note goes to L4 (ON_HOLD): L3 keeps its overdue next action, so this file can run again on the same data.
    await page.getByRole("link", { name: T.back }).click();
    await expectListPage(page);
    await openLead(page, L4);

    // An empty note is refused before any call.
    const noteBox = byLabel(page, T.noteField, { exact: true });
    await page.getByRole("button", { name: T.noteSubmit }).click();
    await expect(byText(page, T.noteRequired)).toBeVisible();

    const text = uniqueText("note L4");
    const next = futureNextAction(30);
    await noteBox.fill(text);
    await expect(byText(page, `${text.length} / 2000`)).toBeVisible();
    await byLabel(page, T.nextActionField, { exact: true }).fill(next.input);

    const from = calls.length;
    await page.getByRole("button", { name: T.noteSubmit }).click();
    await expect(byText(page, T.noteSaved)).toBeVisible();
    const history = section(page, T.history);
    await expect(history.getByText(text)).toBeVisible();
    await expect(history.getByText(`Next action: ${next.shown}`)).toBeVisible();
    await expect(detailHeader(page)).toContainText(next.shown);
    await expect(noteBox).toHaveValue("");
    // The page took the 201 answer: no detail request after the save (a settle for the negative check).
    await page.waitForTimeout(750);
    expect(calls.slice(from).filter((call) => isDetailCall(call)), "detail requests after the note").toHaveLength(0);

    // A second note with the next action left empty keeps the current one.
    const second = uniqueText("note L4 two");
    await noteBox.fill(second);
    await page.getByRole("button", { name: T.noteSubmit }).click();
    await expect(history.getByText(second)).toBeVisible();
    await expect(detailHeader(page)).toContainText(next.shown);

    // W14-31: the list's LAST UPDATE of L4 is the time of that latest note in the history (C-49).
    const entry = history.getByRole("listitem").filter({ hasText: second });
    const noteTime = (await entry.innerText()).match(TIME)?.[0];
    expect(noteTime, "time of the note in the history").toBeDefined();
    await page.getByRole("link", { name: T.back }).click();
    await expectListPage(page);
    await expect(cell(leadRow(page, L4), COL.lastUpdate)).toHaveText(noteTime as string);
    await expect(cell(leadRow(page, L4), COL.created)).toHaveText(TIME);
  });

  test("W11-28 and W14-32: cards with the ten fields on a phone, the table on a desktop, the empty state, and the menu drawer's focus", async () => {
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
    // C-43 on a phone: the top bar keeps room for the user's name, and a cut name stays readable through its title.
    const name = header(page).getByText(fixture.sale.name, { exact: true });
    await expect(name).toHaveAttribute("title", fixture.sale.name);
    expect((await name.boundingBox())?.width ?? 0, "width of the name on a phone").toBeGreaterThan(40);

    // C-48: the card holds the ten fields of the table (labels and values), and nothing more of the owner.
    const card = leadCard(page, L2);
    for (const label of T.columns.filter((column) => !["CODE", "STATUS", "ACTION"].includes(column))) {
      await expect(card.getByText(label, { exact: true })).toBeVisible();
    }
    for (const value of [L2.code, L2.contactName, "An Hải", "Short-term rental", "Homestay", T.status.ASSIGNED]) {
      await expect(card).toContainText(value);
    }
    await expect(card).toContainText(TIME);
    await expect(card.getByRole("link", { name: `View ${L2.code}`, exact: true })).toBeVisible();
    expect(await card.innerText()).not.toMatch(/912\d{6}|\+84|@example\.com|Võ Văn Kiệt|E2E Sale|Next action/);

    // Empty state: no lead of the SALE is "Owner Withdrawn" (the open boxes are cleared one by one after it is ticked).
    await clickStatusBox(page, T.status.WITHDRAWN);
    for (const status of [T.status.ASSIGNED, T.status.CONTACTED, T.status.ON_HOLD]) await clickStatusBox(page, status);
    await expect(statusBox(page, T.status.WITHDRAWN)).toBeChecked();
    await expect(byText(page, T.emptyFiltered)).toBeVisible();
    await page.getByRole("link", { name: T.clearFilters }).click();
    await expect(leadLink(page, L2)).toBeVisible();
    expect(await tickedStatusLabels(page)).toEqual([T.status.ASSIGNED, T.status.CONTACTED, T.status.ON_HOLD]);

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
    const noteDraft = uniqueText("note draft");
    const reasonDraft = uniqueText("reason draft");

    // A reason typed in the status dialog (closing target) stays after the dialog is cancelled.
    await page.getByRole("button", { name: T.changeStatus }).click();
    const statusDialog = dialog(page, T.changeStatus);
    await statusDialog.getByRole("radio", { name: T.status.REJECTED, exact: true }).check();
    await statusDialog.getByRole("textbox", { name: T.reason, exact: true }).fill(reasonDraft);
    await statusDialog.getByRole("button", { name: T.cancel }).last().click();
    await expect(statusDialog).toHaveCount(0);

    await byLabel(page, T.noteField, { exact: true }).fill(noteDraft);
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
    // The refresh is retried at about +2 s and +12 s before the block shows. It is English inside the workspace.
    await expect(page.locator('div[lang="en"]').getByText(T.sessionUnavailable)).toBeVisible({ timeout: 60_000 });
    await expect(byLabel(page, T.noteField, { exact: true })).toHaveCount(0);

    // The server is reachable again: retry, and the typed texts are back.
    await page.unroute(notePath);
    await page.unroute(`${API_URL}${REFRESH_PATH}`);
    await page.getByRole("button", { name: T.sessionRetry }).first().click();
    await expectLeadDetail(page, L9);
    await expect(byLabel(page, T.noteField, { exact: true })).toHaveValue(noteDraft);
    await page.getByRole("button", { name: T.changeStatus }).click();
    await statusDialog.getByRole("radio", { name: T.status.REJECTED, exact: true }).check();
    await expect(statusDialog.getByRole("textbox", { name: T.reason, exact: true })).toHaveValue(reasonDraft);
    await statusDialog.getByRole("button", { name: T.cancel }).last().click();
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
