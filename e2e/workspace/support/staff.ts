import { type Browser, type BrowserContext, expect, type Locator, type Page, type Request, test } from "@playwright/test";

import { API_URL } from "../../support/api";
import {
  ADMIN,
  authE2eReady,
  CUSTOMER,
  type E2eAccount,
  LEADER,
  type LoginFormOptions,
  SALE,
  signIn,
  submitLoginForm,
} from "../../support/auth";

// Shared pieces of the staff workspace E2E specs (acquisition-owner-lead-queue-ui spec 5.7, 5.8). Passwords come from
// the shell only; nothing here logs a password or a token.
//
// BEFORE EVERY `npm run e2e:workspace` run the owner runs both seeds again (FE handoff section 6): the specs change
// the fixture data (L1 assigned, L2 status, L3, L4, L5 and L8 closed, An Hải handed over and back, surveys booked on
// L11 and the requirement of L12 changed) and a second run on changed data fails on its preconditions.

export const WORKSPACE_E2E_SKIP_REASON =
  `The workspace E2E specs need the local API at ${API_URL} (dev profile), both seeds ` +
  "(sunvibe-server/scripts/dev/seed-e2e-accounts.sql and seed-e2e-owner-leads.sql, target=local, run again before " +
  "every run) and E2E_CUSTOMER_PASSWORD, E2E_SALE_PASSWORD, E2E_LEADER_PASSWORD and E2E_ADMIN_PASSWORD exported in " +
  "the shell that runs npm run e2e:workspace (docs/features/acquisition/acquisition-owner-lead-queue-ui/impl/" +
  "2026-10-18-acquisition-owner-lead-queue-ui-fe-handoff.md section 6); at least one of them is missing.";

/** True when the API answers and all four passwords are set; never reveals the values. */
export const workspaceE2eReady = (): Promise<boolean> => authE2eReady({ workspace: true });

export type StaffRole = "SALE" | "SALE_LEADER" | "ADMIN" | "CUSTOMER";

const ACCOUNTS: Record<StaffRole, E2eAccount> = { SALE, SALE_LEADER: LEADER, ADMIN, CUSTOMER };

/**
 * Puts the password into its field without `locator.fill`, whose step title (HTML report, trace, `--reporter=line`
 * with steps) would show the value (SEC-M4): the native value setter, then a bubbling `input` event as typing makes.
 */
async function setPasswordQuietly(field: Locator, password: string): Promise<void> {
  await field.evaluate((input, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!(input instanceof HTMLInputElement) || setter === undefined) throw new Error("The password field is not an input");
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, password);
}

const QUIET: LoginFormOptions = { setPassword: setPasswordQuietly };

/** One UI sign-in through `/login` (ends on `/account`). */
export function signInAs(page: Page, role: StaffRole): Promise<void> {
  if (!ACCOUNTS[role].password) throw new Error(WORKSPACE_E2E_SKIP_REASON);
  return signIn(page, ACCOUNTS[role], QUIET);
}

/** Fills and submits the `/login` form on screen and waits for the 200 answer only (the caller checks where it ends). */
export function submitLogin(page: Page, role: StaffRole): Promise<void> {
  if (!ACCOUNTS[role].password) throw new Error(WORKSPACE_E2E_SKIP_REASON);
  return submitLoginForm(page, ACCOUNTS[role], { ...QUIET, expectAccount: false });
}

/** A browser context for one role: the project's base URL, Vietnamese locale and a desktop viewport. */
export function newStaffContext(browser: Browser): Promise<BrowserContext> {
  const { baseURL } = test.info().project.use;
  return browser.newContext({ baseURL, locale: "vi-VN", viewport: { width: 1280, height: 720 } });
}

export const DESKTOP = { width: 1280, height: 720 } as const;
export const PHONE = { width: 390, height: 844 } as const;

// ---------------------------------------------------------------------------------------------------------------
// Fixtures (seed-e2e-owner-leads.sql, FE handoff section 6)

export type FixtureLead = {
  n: number;
  /** ULID of the lead. */
  id: string;
  code: string;
  contactName: string;
  /** Digits of the phone that follow `+84`; the API may return it as `+84…` or `0…`. */
  phoneTail: string;
  /** Detail route. */
  path: string;
};

const FIXTURE_LEADS: ReadonlyArray<readonly [code: string, contactName: string, phoneTail: string]> = [
  ["SV-E2EA-AA2A", "Nguyễn Thị Lan", "912000001"],
  ["SV-E2EA-AA2B", "Trần Văn Minh", "912000002"],
  ["SV-E2EA-AA2C", "Lê Thị Hạnh", "912000003"],
  ["SV-E2EA-AA2D", "Phạm Quốc Bảo", "912000004"],
  ["SV-E2EA-AA2E", "Võ Thị Thu", "912000005"],
  ["SV-E2EA-AA2F", "Đặng Văn Hùng", "912000006"],
  ["SV-E2EA-AA2G", "Hoàng Thị Mai", "912000007"],
  ["SV-E2EA-AA2H", "Hoàng Thị Mai", "912000007"],
  ["SV-E2EA-AA2J", "Bùi Văn Sơn", "912000009"],
  ["SV-E2EA-AA2K", "Ngô Thị Yến", "912000010"],
  ["SV-E2EA-AA2L", "Đỗ Thị Hoa", "912000011"],
  ["SV-E2EA-AA2M", "Lý Văn Phúc", "912000012"],
];

export const fixture = {
  /** L1..L12 by their fixed id and request code (never by list position). */
  lead(n: number): FixtureLead {
    const row = FIXTURE_LEADS[n - 1];
    if (row === undefined) throw new Error(`No fixture lead L${n}`);
    const id = `01JE2EHEAD${String(n).padStart(16, "0")}`;
    return { n, id, code: row[0], contactName: row[1], phoneTail: row[2], path: `/workspace/owner-leads/${id}` };
  },
  sale: { id: "01JE2EACCT0000000000000002", name: "E2E Sale" },
  leader: { id: "01JE2EACCT0000000000000003", name: "E2E Trưởng nhóm" },
  admin: { id: "01JE2EACCT0000000000000004", name: "E2E Admin" },
  /** Territory ward of the seed: An Hải, held by E2E Sale. */
  territoryWardCode: "20275",
} as const;

/** A lead id that no lead has. */
export const UNKNOWN_LEAD_ID = "01JE2EHEAD0000000000000099";

// ---------------------------------------------------------------------------------------------------------------
// Texts. The workspace is English (src/i18n/messages/en.json: Workspace, OwnerLeads, SaleTerritories, Session; W14
// C-41); the public header link and the account card live outside it (vi.json WorkspaceEntry, the English /account).

export const T = {
  /** The public site header link (vi.json WorkspaceEntry.link). */
  workspaceLink: "Khu làm việc",
  /** The /account card (English literals, FC-6). */
  accountCardTitle: "Workspace",
  openWorkspace: "Open workspace",
  /** The label next to the logo in the workspace top bar (C-43). */
  topBarLabel: "Workspace",
  menuLabel: "Workspace menu",
  menuOpen: "Open menu",
  menuClose: "Close menu",
  menuOwnerLeads: "SUPPLY LEADS",
  menuSurveys: "SURVEYS",
  menuTerritories: "TERRITORIES",
  signOut: "Sign Out",
  listTitle: "SUPPLY LEADS",
  territoriesTitle: "TERRITORIES",
  tabsLabel: "Lead groups",
  tabMine: "My Leads",
  tabAll: "All Leads",
  listCaption: "Leads",
  filtersLabel: "Filters",
  showClosed: "Show closed leads",
  wardFilter: "Ward / commune",
  assigneeFilter: "Assignee",
  assigneeOther: "Other staff member",
  back: "Back to leads",
  leadNotFoundNotice: "Lead not found, or you can no longer see it.",
  emptyFiltered: "No leads match the filters.",
  emptyPastEnd: "There are no leads on this page.",
  clearFilters: "Clear filters",
  possibleDuplicate: "Potential Duplicate",
  noNote: "—",
  overdue: "Overdue",
  /** C-46 column headers, in order. */
  columns: [
    "CODE",
    "OWNER",
    "WARD / COMMUNE",
    "REQUIREMENT",
    "PROPERTY TYPE",
    "STATUS",
    "CREATED",
    "LAST UPDATE",
    "NOTE",
    "ACTION",
  ],
  status: {
    NEW: "Unassigned",
    ASSIGNED: "Assigned",
    CONTACTED: "Contacted",
    SURVEY_SCHEDULED: "Survey Scheduled",
    ON_HOLD: "On Hold",
    DUPLICATE: "Duplicate",
    REJECTED: "Declined",
    WITHDRAWN: "Owner Withdrawn",
  },
  assign: "Assign lead",
  reassign: "Reassign",
  closedBanner: "This lead is closed",
  closeConfirm: "A closed lead cannot be reopened",
  /** "Back" of the close confirmation (not "Back to leads"). */
  dialogBack: "Back",
  generic: "Something went wrong. Please try again.",
  /** The history table of the detail (owner 2026-10-23, D-4). */
  historyColumns: ["#", "UPDATED", "ACTIVITY", "PIC", "STATUS", "ACTION"],
  addEntry: "Add log entry",
  hideEntry: "Hide the new entry",
  activityField: "Activity",
  reasonField: "Reason for closing the lead",
  entryStatus: "Status after this entry",
  keepStatus: (status: string) => `${status} (no change)`,
  save: "Save",
  entrySaved: "Entry saved.",
  activityRequired: "Enter the activity.",
  activityTooLong: (max: number) => `The activity has at most ${max} characters.`,
  historyRuleNoEdit: "Earlier entries cannot be edited or deleted.",
  copyPhone: "Copy phone number",
  copyEmail: "Copy email",
  copied: "Copied.",
  entryClosedKeepText: "The lead is closed, so the entry was not saved. Your text is kept below to copy.",
  concurrent: "Someone else just updated this lead.",
  map: "Open map / Directions",
  /** The unavailable block has no title in English (englishSessionTexts): its body is the one sentence. */
  sessionUnavailable: "We couldn't reach the server to restore your session. You're still signed in.",
  sessionRetry: "Try again",
  sessionExpiredTitle: "Session expired",
  forbiddenTitle: "You don't have access to this page",
  forbiddenLink: "Back to home",
  assignSaved: "Lead assigned.",
  reasonRequired: "Enter a reason.",
  confirm: "Confirm",
  cancel: "Cancel",
  lookup: "Find",
  pagination: "Pagination",
  previousPage: "Previous page",
  nextPage: "Next page",
  history: "History",
  contact: "Owner contact",
  property: "Property",
} as const;

/** The option text of the assignee pickers: "Name · Role" (middle dot U+00B7, `assignDialog.assigneeOption`). */
export const assigneeOption = (name: string, role: "Sale" | "Sale leader"): string => `${name} · ${role}`;

/** `dd/MM/yyyy HH:mm`, the time format of the workspace (C-51). */
export const TIME = /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/;

// ---------------------------------------------------------------------------------------------------------------
// Request log

export type ApiCall = { method: string; url: URL };

/** Collects the calls the page (or every page of a context) sends to the API, from now on. CORS preflights are left out. */
export function recordApiCalls(target: Page | BrowserContext): ApiCall[] {
  const seen: ApiCall[] = [];
  target.on("request", (request: Request) => {
    if (request.method() === "OPTIONS" || !request.url().startsWith(`${API_URL}/`)) return;
    seen.push({ method: request.method(), url: new URL(request.url()) });
  });
  return seen;
}

/** Host names of every request the page (or every page of a context) sends, from now on. */
export function recordHosts(target: Page | BrowserContext): string[] {
  const hosts: string[] = [];
  target.on("request", (request: Request) => {
    hosts.push(new URL(request.url()).hostname);
  });
  return hosts;
}

const LEADS_PATH = "/api/v1/staff/owner-leads";

/** `GET /api/v1/staff/owner-leads` (the list). */
export const isListCall = (call: ApiCall): boolean => call.method === "GET" && call.url.pathname === LEADS_PATH;

/** `GET /api/v1/staff/owner-leads/{id}` (the detail), of one lead when `leadId` is given. */
export const isDetailCall = (call: ApiCall, leadId?: string): boolean =>
  call.method === "GET" &&
  (leadId === undefined
    ? /^\/api\/v1\/staff\/owner-leads\/[^/]+$/.test(call.url.pathname)
    : call.url.pathname === `${LEADS_PATH}/${leadId}`);

// ---------------------------------------------------------------------------------------------------------------
// Page helpers

/** The workspace header (the `banner`). */
export const header = (page: Page): Locator => page.getByRole("banner");

/** The "Khu làm việc" link of the public site header (the workspace top bar has none, A-9). */
export const workspaceHeaderLink = (page: Page): Locator =>
  header(page).getByRole("link", { name: T.workspaceLink, exact: true });

/**
 * Locators below that look for a label or a text keep only what is on screen. Next keeps a route left by a client-side
 * navigation mounted but hidden (React `<Activity>`), and `getByLabel` / `getByText` (unlike `getByRole`) also match
 * that hidden copy, e.g. the note form of the lead opened before.
 */
export const byLabel = (page: Page, label: string | RegExp, options?: { exact?: boolean }): Locator =>
  page.getByLabel(label, options).filter({ visible: true });

export const byText = (page: Page, text: string | RegExp): Locator => page.getByText(text).filter({ visible: true });

export const mainArea = (page: Page): Locator => page.getByRole("main");

/** The tabs of the lead list. */
export const tabs = (page: Page): Locator => page.getByRole("navigation", { name: T.tabsLabel });

export const tab = (page: Page, name: string): Locator => tabs(page).getByRole("link", { name, exact: true });

/** Waits until the list page shows its title (the shell and the page are mounted, signed in). */
export async function expectListPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: T.listTitle })).toBeVisible({ timeout: 20_000 });
}

/**
 * Clicks a tab and waits until the URL is the tab's own and it is the current one. A tab already current (page 2 of the
 * same tab) still changes the URL, and Next keeps the old list on screen until the new URL is committed.
 */
export async function goToTab(page: Page, name: string): Promise<void> {
  const link = tab(page, name);
  const href = await link.getAttribute("href");
  if (href === null) throw new Error("tab without href");
  await link.click();
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === href);
  await expect(link).toHaveAttribute("aria-current", "page");
}

/** The "View <code>" link of a lead in the list on screen (ACTION of a table row on a desktop, a card on a phone). */
export const leadLink = (page: Page, lead: FixtureLead): Locator =>
  mainArea(page).getByRole("link", { name: `View ${lead.code}`, exact: true });

/** The table row of a lead (desktop), found by its "View <code>" link. */
export const leadRow = (page: Page, lead: FixtureLead): Locator =>
  page.getByRole("row").filter({ has: page.getByRole("link", { name: `View ${lead.code}`, exact: true }) });

/** The card of a lead (phone), found by its "View <code>" link. */
export const leadCard = (page: Page, lead: FixtureLead): Locator =>
  page
    .getByRole("list", { name: T.listCaption })
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: `View ${lead.code}`, exact: true }) });

/** The filter bar of the list. */
export const filterBar = (page: Page): Locator => page.getByRole("region", { name: T.filtersLabel });

/** A status checkbox of the filter bar, by its exact label ("Assigned" is also part of "Unassigned"). */
export const statusBox = (page: Page, label: string): Locator =>
  filterBar(page).getByRole("checkbox", { name: label, exact: true });

/** Clicks a status checkbox (or "Show closed leads") and waits for the new URL and the list. */
export async function clickStatusBox(page: Page, label: string): Promise<void> {
  const before = page.url();
  await statusBox(page, label).click();
  await expect(page).not.toHaveURL(before);
  await expectListSettled(page);
}

/** The labels of the status checkboxes on screen, in order ("Show closed leads" last). */
export async function statusBoxLabels(page: Page): Promise<string[]> {
  const labels: string[] = [];
  for (const box of await filterBar(page).getByRole("checkbox").all()) {
    labels.push((await box.locator("xpath=..").innerText()).trim());
  }
  return labels;
}

/** The labels of the ticked checkboxes, in order ("Show closed leads" included when it is checked). */
export async function tickedStatusLabels(page: Page): Promise<string[]> {
  const labels: string[] = [];
  for (const box of await filterBar(page).getByRole("checkbox").all()) {
    if (await box.isChecked()) labels.push((await box.locator("xpath=..").innerText()).trim());
  }
  return labels;
}

/**
 * Loading skeletons on screen. A route left by a client-side navigation stays mounted but hidden (Activity); a hidden
 * detail whose lead was never found (404, back to the list) keeps its skeleton for good, by design: it loads again
 * when it is shown. Only a visible skeleton means the page on screen is still loading.
 */
const busy = (page: Page): Locator => page.locator('[aria-busy="true"]').filter({ visible: true });

/** Waits until a list has loaded (the "N lead(s)" count is shown; "1,000 leads" from a thousand on). */
async function expectListLoaded(page: Page): Promise<void> {
  await expect(busy(page)).toHaveCount(0);
  await expect(byText(page, /^[\d,]+ leads?$/)).toBeVisible({ timeout: 20_000 });
}

/** Waits until the list on screen is no longer loading (it may be empty). */
export async function expectListSettled(page: Page): Promise<void> {
  await expect(busy(page)).toHaveCount(0, { timeout: 20_000 });
}

/** Follows a pagination link and waits for the new page of the list. */
async function turnPage(page: Page, link: Locator): Promise<void> {
  const href = await link.getAttribute("href");
  if (href === null) throw new Error("pagination link without href");
  await link.click();
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === href);
  await expect(busy(page)).toHaveCount(0);
  await expectListLoaded(page);
}

/**
 * The link of `lead` in the list on screen, turning pages when needed. The local database also holds the leads the
 * public intake E2E specs create on every run (All Leads holds more than one page of Unassigned leads), so a
 * fixture lead is found by its code, never by its position. Starts from page 1; gives the (missing) link of the last
 * page when the lead is on none, so the caller's expectation fails with its usual message.
 */
export async function findLeadLink(page: Page, lead: FixtureLead): Promise<Locator> {
  await expectListLoaded(page);
  const pager = page.getByRole("navigation", { name: T.pagination });
  for (let i = 0; i < 100; i += 1) {
    const previous = pager.getByRole("link", { name: T.previousPage });
    if ((await previous.count()) === 0) break;
    await turnPage(page, previous);
  }
  for (let i = 0; i < 100; i += 1) {
    const link = leadLink(page, lead);
    if ((await link.count()) > 0) return link;
    const next = pager.getByRole("link", { name: T.nextPage });
    if ((await next.count()) === 0) break;
    await turnPage(page, next);
  }
  return leadLink(page, lead);
}

/** Opens a lead from the list on screen by a click (turning pages to find it) and waits for its detail. */
export async function openLead(page: Page, lead: FixtureLead): Promise<void> {
  await (await findLeadLink(page, lead)).click();
  await expectLeadDetail(page, lead);
}

/** Waits until the detail of `lead` is loaded (its code is the page heading). */
export async function expectLeadDetail(page: Page, lead: FixtureLead): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: lead.code })).toBeVisible({ timeout: 20_000 });
}

/** The open modal dialog of a lead or territory command. */
export const dialog = (page: Page, name: string): Locator => page.getByRole("dialog", { name });

/** The lead block of the detail (the region "Lead"): request code, status, assignee and the closed banner. */
export const detailHeader = (page: Page): Locator =>
  mainArea(page).getByRole("region", { name: "Lead", exact: true }).filter({ visible: true }).first();

/** The History card of the detail. */
export const historySection = (page: Page): Locator =>
  mainArea(page)
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: T.history, exact: true }) })
    .filter({ visible: true });

/** Opens the new row of the history with its "+" (the row may be open already, from a kept draft). */
export async function openEntry(page: Page): Promise<void> {
  const add = historySection(page).getByRole("button", { name: T.addEntry, exact: true });
  if (await add.isVisible()) await add.click();
  await expect(entryStatus(page)).toBeVisible();
}

/** The ACTIVITY input of the new row: named "Activity", or the reason when the chosen status closes the lead. */
export const entryActivity = (page: Page): Locator =>
  historySection(page).getByRole("textbox", { name: new RegExp(`^(${T.activityField}|${T.reasonField})$`) });

/** The STATUS select of the new row. */
export const entryStatus = (page: Page): Locator =>
  historySection(page).getByRole("combobox", { name: T.entryStatus, exact: true });

/** Save of the new row. */
export const saveEntry = (page: Page): Promise<void> =>
  historySection(page).getByRole("button", { name: T.save, exact: true }).click();

/** The confirmation asked before an entry closes the lead. */
export const closeConfirmDialog = (page: Page): Locator => dialog(page, T.closeConfirm);

/** Signs out from the workspace header and waits for the full load of `/`. */
export async function signOutFromWorkspace(page: Page): Promise<void> {
  await header(page).getByRole("button", { name: T.signOut }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

/** True when the sign-in hint cookie is set (the cookie is readable by the page; only its presence is read). */
export const hasSignInHint = (page: Page): Promise<boolean> =>
  page.evaluate(() => /(^|;\s*)sv_signed_in=[^;]+/.test(document.cookie));

// ---------------------------------------------------------------------------------------------------------------
// Texts

/** Text that is unique to this run and test, so a note found in the history is the one just typed. */
export const uniqueText = (label: string): string => `E2E ${label} ${Date.now()}`;
