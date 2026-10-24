import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { API_URL } from "../support/api";
import { corsHeaders, expectSignedInAccount, headerAccountLink, REFRESH_PATH, storesHolding } from "../support/auth";
import {
  type ApiCall,
  clickStatusBox,
  DESKTOP,
  detailHeader,
  expectLeadDetail,
  expectListPage,
  filterBar,
  fixture,
  hasSignInHint,
  closeConfirmDialog,
  entryActivity,
  entryStatus,
  header,
  historySection,
  isDetailCall,
  isListCall,
  leadCard,
  leadLink,
  leadRow,
  newStaffContext,
  openEntry,
  openLead,
  PHONE,
  recordApiCalls,
  recordHosts,
  saveEntry,
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
  byText,
} from "./support/staff";

// The SALE in the staff workspace: W11-20, W11-23, W11-27, W11-28, W11-30, W11-31, W11-37, W11-39, W11-41, W11-42,
// W11-43 (spec 2026-10-18 5.7) in English, and W14-22, W14-24, W14-25, W14-26, W14-30, W14-31, W14-32, W14-33 (spec
// 2026-10-22 5.6). Spec 5.8 budget: 1 sign-in; full loads of protected pages 4 of 8 (crafted list URL, unknown lead
// id, lead L5, the Back after the sign-out; /account is reached by the login redirect, "/" is a public page and the L2
// source is a plain HTTP fetch with no browser session); intake POSTs 0. One serial describe, one signed-in page; the
// leads are opened by clicks.
//
// Fixtures: the file only adds two notes to L4. The SALE spec runs BEFORE the leader
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

/** Column positions of the detail's history table (D-4). */
const HCOL = { no: 0, updated: 1, activity: 2, pic: 3, status: 4, action: 5 };

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
    await expect(menu.getByRole("link")).toHaveText([T.menuOwnerLeads, T.menuSurveys]);
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
      T.status.SURVEY_SCHEDULED,
      T.status.ON_HOLD,
      T.status.DUPLICATE,
      T.status.REJECTED,
      T.status.WITHDRAWN,
      T.showClosed,
    ]);
    expect(await tickedStatusLabels(page)).toEqual([T.status.ASSIGNED, T.status.CONTACTED, T.status.SURVEY_SCHEDULED, T.status.ON_HOLD]);

    const sent = calls.slice(from);
    const listCalls = sent.filter(isListCall);
    expect(listCalls.length, "list calls").toBeGreaterThan(0);
    for (const call of listCalls) {
      expect(call.url.searchParams.get("scope"), "scope of a list call").toBe("mine");
      expect(call.url.searchParams.getAll("status"), "status of a list call").toEqual(["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD"]);
      expect(call.url.searchParams.has("assigneeUserId"), "assigneeUserId on a list call").toBe(false);
    }
    expect(sent.filter((call) => call.url.searchParams.get("scope") !== null && call.url.searchParams.get("scope") !== "mine")).toHaveLength(0);
    expect(sent.filter((call) => call.url.pathname.endsWith("/owner-lead-assignees")), "assignee list calls").toHaveLength(0);
    expect(sent.filter((call) => isDetailCall(call)), "detail calls while the list is shown").toHaveLength(0);
  });

  test("W11-27, W14-30 and W14-33: the table has the C-46 columns and never a next action, assignee, phone, email or address", async () => {
    // The SALE sees exactly these eight open leads (L11 and L12 of the survey seed too); the others (L1, L5, L6,
    // L10) are not theirs.
    for (const lead of [2, 3, 4, 7, 8, 9, 11, 12].map(fixture.lead)) await expect(leadLink(page, lead)).toBeVisible();
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

    // On a wide desktop the list takes the whole content width: the table fits without scrolling.
    await page.setViewportSize({ width: 1600, height: 900 });
    try {
      const wide = await table.evaluate((element) => {
        const box = element.parentElement as HTMLElement;
        return { boxScroll: box.scrollWidth, boxClient: box.clientWidth };
      });
      expect(wide.boxClient, "the table box grows with the viewport").toBeGreaterThan(widths.boxClient);
      expect(wide.boxScroll, "the table box does not scroll sideways at 1600 px").toBeLessThanOrEqual(wide.boxClient);
    } finally {
      await page.setViewportSize(DESKTOP);
    }
  });

  test("list layout (owner 2026-10-23): no visible title; a navy filter bar with white text, short chips and Clear filters at the right of the chips", async () => {
    // The title stays for screen readers only (one h1 per page).
    const title = await page.getByRole("heading", { level: 1, name: T.listTitle }).boundingBox();
    expect(title?.width ?? 0, "visible title width").toBeLessThanOrEqual(1);

    const bar = filterBar(page);
    // navy-950 (#04052b), the background of the site header, and white text.
    const colors = await bar.evaluate((element) => {
      const style = getComputedStyle(element);
      const legend = element.querySelector("legend");
      return {
        background: style.backgroundColor,
        image: style.backgroundImage,
        legend: legend === null ? "" : getComputedStyle(legend).color,
      };
    });
    expect(colors).toEqual({ background: "rgb(4, 5, 43)", image: "none", legend: "rgb(255, 255, 255)" });

    const chip = statusBox(page, T.status.WITHDRAWN).locator("xpath=..");
    const chipBox = await chip.boundingBox();
    expect(chipBox?.height ?? 0, "chip height").toBeLessThanOrEqual(36);

    await clickStatusBox(page, T.status.WITHDRAWN);
    const clear = bar.getByRole("link", { name: T.clearFilters });
    await expect(clear).toBeVisible();
    // At 1280 px the chips wrap onto two rows: "Clear filters" ends the last row, next to "Show closed leads".
    const lastChip = statusBox(page, T.showClosed).locator("xpath=..");
    const [barBox, clearBox, rowChip] = await Promise.all([bar.boundingBox(), clear.boundingBox(), lastChip.boundingBox()]);
    if (barBox === null || clearBox === null || rowChip === null) throw new Error("filter bar not laid out");
    const chipsRight = await bar
      .getByRole("checkbox")
      .evaluateAll((boxes) => Math.max(...boxes.map((box) => (box.parentElement as HTMLElement).getBoundingClientRect().right)));
    expect(barBox.x + barBox.width - (clearBox.x + clearBox.width), "gap right of Clear filters").toBeLessThanOrEqual(24);
    expect(clearBox.x, "Clear filters after the chips").toBeGreaterThan(chipsRight);
    expect(Math.abs(clearBox.y + clearBox.height / 2 - (rowChip.y + rowChip.height / 2)), "same row").toBeLessThanOrEqual(4);

    await clear.click();
    await expect(statusBox(page, T.status.WITHDRAWN)).not.toBeChecked();
    expect(await tickedStatusLabels(page)).toEqual([T.status.ASSIGNED, T.status.CONTACTED, T.status.SURVEY_SCHEDULED, T.status.ON_HOLD]);
  });

  test("W11-42: hovering the rows sends no detail request; opening a lead sends one", async () => {
    const from = calls.length;
    for (const lead of [2, 3, 4, 7, 8, 9, 11, 12].map(fixture.lead)) await leadRow(page, lead).hover();
    // A negative check needs a short settle: a hover prefetch would have started by now.
    await page.waitForTimeout(750);
    expect(calls.slice(from).filter((call) => isDetailCall(call)), "detail requests after hovering").toHaveLength(0);

    const beforeOpen = calls.length;
    await openLead(page, L2);
    expect(calls.slice(beforeOpen).filter((call) => isDetailCall(call, L2.id)), "detail requests of L2").toHaveLength(1);
  });

  test("W11-27, W11-30 and W11-39: the detail of L2 shows the contact with a copy button, the map link only after a click, and the history with names", async () => {
    const contact = section(page, T.contact);
    await expect(contact).toContainText(L2.contactName);
    // D-7: the phone is plain text with a copy button (no tel: or mailto: link); the button copies the shown value.
    await expect(contact.getByRole("link")).toHaveCount(0);
    await expect(contact).toContainText(L2.phoneTail);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await contact.getByRole("button", { name: T.copyPhone, exact: true }).click();
    await expect(contact.getByText(T.copied, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(L2.phoneTail);
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
    // D-8: the map link looks like the primary button (the brand gradient of Save).
    expect(await map.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("linear-gradient");
    expect(hosts.filter((host) => /(^|\.)google\.com$/.test(host)), "requests to google.com so far").toHaveLength(0);

    // D-1 on a desktop (order of D-6): the lead | Potential duplicates, then Owner contact | Property; each row has one
    // height.
    const box = async (locator: Locator) => {
      const found = await locator.boundingBox();
      if (found === null) throw new Error("detail block not laid out");
      return found;
    };
    const [contactBox, assetBox, leadBox, duplicatesBox] = await Promise.all([
      box(contact),
      box(asset),
      box(detailHeader(page)),
      box(section(page, "Potential duplicates")),
    ]);
    expect(Math.abs(leadBox.y - duplicatesBox.y), "the lead and Potential duplicates on one row").toBeLessThanOrEqual(1);
    expect(Math.abs(leadBox.height - duplicatesBox.height), "the lead as high as Potential duplicates").toBeLessThanOrEqual(1);
    expect(leadBox.x, "the lead left of Potential duplicates").toBeLessThan(duplicatesBox.x);
    expect(contactBox.y, "Owner contact below the lead").toBeGreaterThan(leadBox.y + leadBox.height - 1);
    expect(Math.abs(contactBox.y - assetBox.y), "Owner contact and Property on one row").toBeLessThanOrEqual(1);
    expect(Math.abs(contactBox.height - assetBox.height), "Owner contact as high as Property").toBeLessThanOrEqual(1);
    expect(contactBox.x, "Owner contact left of Property").toBeLessThan(assetBox.x);
    // The lead block holds the page h1 again (it is first in the DOM).
    await expect(detailHeader(page).getByRole("heading", { level: 1, name: L2.code })).toBeVisible();

    // D-4: one table, oldest first. W11-39: the owner's own entry has "Owner" as PIC; the assignment the leader's name.
    const history = historySection(page);
    await expect(history.getByRole("columnheader")).toHaveText([...T.historyColumns]);
    const rows = history.locator("tbody tr");
    await expect(cell(rows.first(), HCOL.no)).toHaveText("1");
    await expect(cell(rows.first(), HCOL.activity)).toHaveText("Owner submitted the form");
    await expect(cell(rows.first(), HCOL.pic)).toHaveText("Owner");
    const assigned = rows.filter({ hasText: fixture.leader.name }).last();
    await expect(cell(assigned, HCOL.activity)).toHaveText("Assigned");
    await expect(cell(assigned, HCOL.pic)).toHaveText(fixture.leader.name);
    // Earlier rows are read only: no input and nothing in ACTION.
    await expect(rows.locator("input, select, button")).toHaveCount(0);
    await expect(cell(rows.first(), HCOL.action)).toHaveText("");
    // D-9: the rules of the history are written under the table.
    await expect(history.getByText(T.historyRuleNoEdit)).toBeVisible();
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
    // W11-27 and D-7: phone and email as plain text, each with its copy button.
    const contact = section(page, T.contact);
    await expect(contact.getByRole("link")).toHaveCount(0);
    await expect(contact).toContainText("hanh.e2e@example.com");
    await expect(contact.getByRole("button", { name: T.copyPhone, exact: true })).toBeVisible();
    await expect(contact.getByRole("button", { name: T.copyEmail, exact: true })).toBeVisible();
    // D-2: the lead block shows no next action (not even L3's past one) and has no status button.
    await expect(detailHeader(page)).toContainText(T.status.CONTACTED);
    await expect(detailHeader(page)).not.toContainText(/Next action|Overdue/);
    await expect(page.getByRole("button", { name: "Change status" })).toHaveCount(0);

    // The note goes to L4 (ON_HOLD), so L3 stays as seeded for the later specs.
    await page.getByRole("link", { name: T.back }).click();
    await expectListPage(page);
    await openLead(page, L4);

    // D-4: "+" opens the new row; PIC is the signed-in SALE, disabled; STATUS keeps the current status.
    const history = historySection(page);
    await openEntry(page);
    const newRow = history.locator("tbody tr").filter({ has: page.getByRole("combobox", { name: T.entryStatus }) });
    await expect(cell(newRow, HCOL.pic)).toHaveText(fixture.sale.name);
    await expect(cell(newRow, HCOL.pic).locator("input, select")).toHaveCount(0);
    await expect(history.locator("select option:checked")).toHaveText(T.keepStatus(T.status.ON_HOLD));
    await expect(history.getByRole("textbox", { name: "Next action" })).toHaveCount(0);

    // An empty activity is refused before any call.
    await saveEntry(page);
    await expect(history.getByText(T.activityRequired)).toBeVisible();

    const text = uniqueText("note L4");
    await entryActivity(page).fill(text);
    await expect(history.getByText(`${text.length} / 2000`)).toBeVisible();

    const from = calls.length;
    await saveEntry(page);
    await expect(history.getByText(T.entrySaved)).toBeVisible();
    const added = history.locator("tbody tr").filter({ hasText: text });
    await expect(cell(added, HCOL.pic)).toHaveText(fixture.sale.name);
    await expect(cell(added, HCOL.status)).toHaveText(T.noNote);
    // The row closed; its text is gone from the draft.
    await expect(entryActivity(page)).toHaveCount(0);
    // The page took the 201 answer: no detail request after the save (a settle for the negative check).
    await page.waitForTimeout(750);
    expect(calls.slice(from).filter((call) => isDetailCall(call)), "detail requests after the note").toHaveLength(0);

    await openEntry(page);
    await expect(entryActivity(page)).toHaveValue("");
    const second = uniqueText("note L4 two");
    await entryActivity(page).fill(second);
    await saveEntry(page);
    const secondRow = history.locator("tbody tr").filter({ hasText: second });
    await expect(secondRow).toBeVisible();

    // W14-31: the list's LAST UPDATE of L4 is the time of that latest note in the history (C-49).
    const noteTime = (await cell(secondRow, HCOL.updated).innerText()).match(TIME)?.[0];
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

    // D-10 on a phone: the detail does not scroll sideways, the history rows are cards (no column headers on screen,
    // no empty ACTION cell) and the map link keeps a 44px touch target.
    await openLead(page, L2);
    const detailWidths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(detailWidths.scroll, "the detail does not scroll sideways on a phone").toBeLessThanOrEqual(detailWidths.client);
    const phoneHistory = historySection(page);
    await expect(phoneHistory.getByRole("columnheader")).toHaveCount(0);
    const firstEntry = phoneHistory.locator("tbody tr").first();
    await expect(firstEntry).toContainText("Owner submitted the form");
    await expect(firstEntry.getByRole("cell")).toHaveCount(5);
    expect((await page.getByRole("link", { name: T.map }).boundingBox())?.height ?? 0, "map link height").toBeGreaterThanOrEqual(44);
    await page.getByRole("link", { name: T.back }).click();
    await expectListPage(page);
    await expect(leadLink(page, L2)).toBeVisible();

    // Empty state: no lead of the SALE is "Owner Withdrawn" (the open boxes are cleared one by one after it is ticked).
    await clickStatusBox(page, T.status.WITHDRAWN);
    for (const status of [T.status.ASSIGNED, T.status.CONTACTED, T.status.SURVEY_SCHEDULED, T.status.ON_HOLD]) await clickStatusBox(page, status);
    await expect(statusBox(page, T.status.WITHDRAWN)).toBeChecked();
    await expect(byText(page, T.emptyFiltered)).toBeVisible();
    await page.getByRole("link", { name: T.clearFilters }).click();
    await expect(leadLink(page, L2)).toBeVisible();
    expect(await tickedStatusLabels(page)).toEqual([T.status.ASSIGNED, T.status.CONTACTED, T.status.SURVEY_SCHEDULED, T.status.ON_HOLD]);

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

  test("history entry: the row is locked while a change is sent, and a failed confirmation shows its message in the dialog", async () => {
    await openLead(page, L9);
    await openEntry(page);
    await entryStatus(page).selectOption({ label: T.status.REJECTED });
    await entryActivity(page).fill(uniqueText("reason not sent"));
    await saveEntry(page);
    await expect(closeConfirmDialog(page)).toBeVisible();

    // The change answers 503 after a short wait: nothing is changed on the server.
    const statusPath = `${API_URL}/api/v1/staff/owner-leads/${L9.id}/status-changes`;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(statusPath, async (route) => {
      const request = route.request();
      if (request.method() !== "POST") return route.continue();
      await held;
      await route.fulfill({ status: 503, headers: corsHeaders(request), json: { code: "UNAVAILABLE", message: "Down" } });
    });
    try {
      await closeConfirmDialog(page).getByRole("button", { name: T.confirm }).click();
      // CR-2: while it is on its way the row cannot be hidden (its answer would be lost) and Save is locked.
      await expect(historySection(page).getByRole("button", { name: T.hideEntry, exact: true })).toBeDisabled();
      release();
      await expect(closeConfirmDialog(page).getByText(T.generic)).toBeVisible();
    } finally {
      release();
      await page.unroute(statusPath);
    }
    await closeConfirmDialog(page).getByRole("button", { name: T.dialogBack, exact: true }).click();
    await expect(closeConfirmDialog(page)).toHaveCount(0);
    await expect(detailHeader(page)).toContainText(T.status.ASSIGNED);
    // Drop the typed reason, so the next test starts from an empty row.
    await entryActivity(page).fill("");
    await entryStatus(page).selectOption({ label: T.keepStatus(T.status.ASSIGNED) });
    await historySection(page).getByRole("button", { name: T.hideEntry, exact: true }).click();
  });

  test("W11-43: a typed history entry and its status survive an unavailable session; a sign-out leaves no lead data (W11-41)", async () => {
    await page.getByRole("link", { name: T.back }).click();
    await expectListPage(page);
    await openLead(page, L9);
    const draft = uniqueText("entry draft");

    await openEntry(page);
    await entryStatus(page).selectOption({ label: T.status.CONTACTED });
    await entryActivity(page).fill(draft);
    // Drafts live in the memory of the tab only (C-33).
    expect(await storesHolding(page, draft), "stores holding the entry").toEqual([]);

    // The save gets a 401, the refresh cannot reach the API: the session becomes unavailable.
    const statusPath = `${API_URL}/api/v1/staff/owner-leads/${L9.id}/status-changes`;
    await page.route(statusPath, async (route) => {
      const request = route.request();
      if (request.method() !== "POST") return route.continue();
      await route.fulfill({
        status: 401,
        headers: corsHeaders(request),
        json: { code: "UNAUTHORIZED", message: "Token expired" },
      });
    });
    await page.route(`${API_URL}${REFRESH_PATH}`, (route) => route.abort());
    await saveEntry(page);
    // The refresh is retried at about +2 s and +12 s before the block shows. It is English inside the workspace.
    await expect(page.locator('div[lang="en"]').getByText(T.sessionUnavailable)).toBeVisible({ timeout: 60_000 });
    await expect(entryActivity(page)).toHaveCount(0);

    // The server is reachable again: retry, and the row is open again with the typed text.
    await page.unroute(statusPath);
    await page.unroute(`${API_URL}${REFRESH_PATH}`);
    await page.getByRole("button", { name: T.sessionRetry }).first().click();
    await expectLeadDetail(page, L9);
    await expect(entryActivity(page)).toHaveValue(draft);
    await expect(historySection(page).locator("select option:checked")).toHaveText(T.status.CONTACTED);

    // W11-43 / W11-41: sign out here; the hint is gone, Back shows the login page and no lead data or draft.
    await signOutFromWorkspace(page);
    await expect.poll(() => hasSignInHint(page), { message: "the sign-in hint is gone" }).toBe(false);
    await page.goBack();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
    // The whole DOM, hidden Activity copies included (BR-2, C-33).
    const html = await page.content();
    for (const secret of [L9.code, L9.contactName, draft, L4.code, L7.code, L8.code]) {
      expect(html.includes(secret), "lead data or draft in the page after the sign-out and Back").toBe(false);
    }
    expect(await storesHolding(page, draft), "stores holding the entry after the sign-out").toEqual([]);
  });
});
