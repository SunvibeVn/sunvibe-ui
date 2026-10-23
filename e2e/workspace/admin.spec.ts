import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { expectSignedInAccount } from "../support/auth";
import {
  assigneeOption,
  dialog,
  expectListPage,
  findLeadLink,
  fixture,
  leadLink,
  newStaffContext,
  signInAs,
  T,
  tab,
  tabs,
  tickedStatusLabels,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
  workspaceHeaderLink,
  byText,
} from "./support/staff";

// The ADMIN in the staff workspace: W11-24 / W14-25 (an ADMIN without SALE roles has only "All Leads", still as a tab
// bar, and lands on it with Unassigned), W14-24 ("TERRITORIES" item) and W11-38 / W14-28 (territories in English:
// change the holder, remove it with a confirmation, assign it again, the old-holder link to that person's open leads,
// and the fixture territory restored). Spec 5.8 budget: 1 sign-in; full loads of protected pages: 1 of 6 (/account;
// everything else is a click); intake POSTs: 0.
//
// Fixtures changed: only ward An Hải (E2E Sale in the seed): handed to the leader, removed, and assigned to E2E Sale
// again, which restores the fixture territory at the end of the last test. The other wards of the local database may be
// held by people who are not E2E accounts (they are never touched, so no other ward is used). After a run that stops in
// between, An Hải may stay with the leader or free: the fixtures seed restores it, so run BOTH seeds again before every
// `npm run e2e:workspace`. This file runs last (playwright.workspace.config.ts), after the leader spec.
//
// Not covered end to end: the flag "No longer receives leads" on the row of a holder who no longer takes leads (C-40).
// The seeds create no such holder and the other wards of the local database belong to real accounts, so the flag is
// covered by the unit tests of `holderFlag` only. An e2e gap for the handoff: it needs a seeded ineligible holder.

test.describe.configure({ mode: "serial", timeout: 120_000 });

const L7 = fixture.lead(7);
const L9 = fixture.lead(9);
const L10 = fixture.lead(10);

const SALE_OPTION = assigneeOption(fixture.sale.name, "Sale");
const LEADER_OPTION = assigneeOption(fixture.leader.name, "Sale leader");

const INELIGIBLE_FLAG = "No longer receives leads";
const FIXTURE_WARD = "An Hải";

const CHANGE_TITLE = "Change holder";
const ASSIGN_TITLE = "Assign holder";
const REMOVE_TITLE = "Remove holder";

/** The table row of a ward, found by the accessible name of its buttons ("... for|of <ward>"). */
const wardRow = (page: Page, ward: string): Locator =>
  page.getByRole("row").filter({
    has: page.getByRole("button", {
      name: new RegExp(`^(Assign a holder for|Change the holder of|Remove the holder of) (.*\\s)?${ward}$`),
    }),
  });

const assignButton = (row: Locator): Locator => row.getByRole("button", { name: /^Assign a holder for / });
const changeButton = (row: Locator): Locator => row.getByRole("button", { name: /^Change the holder of / });
const removeButton = (row: Locator): Locator => row.getByRole("button", { name: /^Remove the holder of / });

const saveDialog = (page: Page, title: string): Locator => dialog(page, title);

/** Picks `option` in the open dialog's select and saves. */
async function pickAndSave(page: Page, title: string, option: string): Promise<void> {
  const dlg = saveDialog(page, title);
  const picker = dlg.getByRole("combobox");
  await expect(picker.locator("option", { hasText: option })).toHaveCount(1);
  await picker.selectOption({ label: option });
  await dlg.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dlg).toHaveCount(0);
}

const notice = (page: Page, text: RegExp): Locator => byText(page, text);

/** Set once a test starts to change the fixture territory. */
let territoryTouched = false;

/** Puts ward An Hải back with E2E Sale if it is free or held by someone else (best effort, after a failed run). */
async function restoreFixtureTerritory(page: Page): Promise<void> {
  await page.goto("/workspace/settings/territories");
  const row = wardRow(page, FIXTURE_WARD);
  await expect(row.getByRole("button").first()).toBeVisible({ timeout: 20_000 });
  if ((await row.innerText()).includes(fixture.sale.name)) return;
  if ((await changeButton(row).count()) > 0) {
    await changeButton(row).click();
    await pickAndSave(page, CHANGE_TITLE, SALE_OPTION);
  } else {
    await assignButton(row).click();
    await pickAndSave(page, ASSIGN_TITLE, SALE_OPTION);
  }
}

test.describe("ADMIN in the workspace", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    test.skip(!(await workspaceE2eReady()), WORKSPACE_E2E_SKIP_REASON);
    context = await newStaffContext(browser);
    page = await context.newPage();
  });

  test.afterAll(async () => {
    // Failure safe: when a territory test stopped half way, An Hải goes back to E2E Sale before the browser closes.
    if (territoryTouched) await restoreFixtureTerritory(page).catch(() => undefined);
    await context?.close();
  });

  test("W11-24, W14-25 and W14-24: an ADMIN has only All Leads, lands on it with Unassigned, and has the TERRITORIES item", async () => {
    await signInAs(page, "ADMIN");
    await expectSignedInAccount(page);
    await expect(workspaceHeaderLink(page)).toBeVisible();
    await page.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(page);

    // One tab, still shown as a tab bar (spec 5.3).
    await expect(tabs(page).getByRole("link")).toHaveText([T.tabAll]);
    await expect(tab(page, T.tabAll)).toHaveAttribute("aria-current", "page");
    // The default tab is written to the URL by a replace navigation.
    await expect(page).toHaveURL((url) => url.search === "?scope=all");
    expect(await tickedStatusLabels(page)).toEqual([T.status.NEW]);
    await expect(await findLeadLink(page, L10)).toBeVisible();

    const menu = page.getByRole("navigation", { name: T.menuLabel });
    await expect(menu.getByRole("link")).toHaveText([T.menuOwnerLeads, T.menuTerritories]);
    await menu.getByRole("link", { name: T.menuTerritories }).click();
    await expect(page.getByRole("heading", { level: 1, name: T.territoriesTitle })).toBeVisible();
    await expect(page).toHaveURL(/\/workspace\/settings\/territories$/);
  });

  test("W11-38: the territories page states the rule and shows the seeded holder", async () => {
    await expect(byText(page, /A change applies to new leads only/)).toBeVisible();
    const anHai = wardRow(page, FIXTURE_WARD);
    await expect(anHai).toContainText(fixture.sale.name, { timeout: 20_000 });
    await expect(changeButton(anHai)).toBeVisible();
    // The seeded holder is eligible, so its row carries no "no longer receives leads" flag.
    await expect(anHai).not.toContainText(INELIGIBLE_FLAG);
  });

  test("W11-38 and W14-28: the ADMIN changes the holder of a ward; the notice links to the old holder's open leads", async () => {
    territoryTouched = true;
    const row = wardRow(page, FIXTURE_WARD);
    await changeButton(row).click();
    await expect(saveDialog(page, CHANGE_TITLE).getByRole("combobox")).toHaveValue(fixture.sale.id);
    await expect(saveDialog(page, CHANGE_TITLE)).toContainText(FIXTURE_WARD);
    await pickAndSave(page, CHANGE_TITLE, LEADER_OPTION);
    await expect(notice(page, new RegExp(`^The holder of (.*\\s)?${FIXTURE_WARD} is now ${fixture.leader.name}\\.$`))).toBeVisible();
    await expect(row).toContainText(fixture.leader.name);

    // The old-holder link leads to "All Leads" filtered by that holder with their open leads, to reassign them.
    await page.getByRole("link", { name: `View the leads of ${fixture.sale.name} to reassign them` }).click();
    await expectListPage(page);
    await expect(page).toHaveURL((url) => url.search === `?scope=all&assignee=${fixture.sale.id}`);
    expect(await tickedStatusLabels(page)).toEqual([T.status.ASSIGNED, T.status.CONTACTED, T.status.ON_HOLD]);
    for (const lead of [L7, L9]) await expect(leadLink(page, lead)).toBeVisible({ timeout: 20_000 });
    await expect(leadLink(page, L10)).toHaveCount(0);

    await page.getByRole("navigation", { name: T.menuLabel }).getByRole("link", { name: T.menuTerritories }).click();
    await expect(page.getByRole("heading", { level: 1, name: T.territoriesTitle })).toBeVisible();
    await expect(wardRow(page, FIXTURE_WARD)).toContainText(fixture.leader.name, { timeout: 20_000 });
  });

  test("W11-38: the ADMIN removes the holder after a confirmation, then assigns E2E Sale again (the fixture territory)", async () => {
    const row = wardRow(page, FIXTURE_WARD);

    // Remove: cancelling changes nothing; confirming frees the ward.
    await removeButton(row).click();
    const remove = saveDialog(page, REMOVE_TITLE);
    await expect(remove).toContainText(fixture.leader.name);
    await expect(remove).toContainText(FIXTURE_WARD);
    await remove.getByRole("button", { name: T.cancel }).last().click();
    await expect(remove).toHaveCount(0);
    await expect(row).toContainText(fixture.leader.name);

    await removeButton(row).click();
    await remove.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(remove).toHaveCount(0);
    await expect(notice(page, new RegExp(`^The holder of (.*\\s)?${FIXTURE_WARD} was removed\\.$`))).toBeVisible();
    await expect(
      page.getByRole("link", { name: `View the leads of ${fixture.leader.name} to reassign them` }),
    ).toHaveAttribute("href", new RegExp(`assignee=${fixture.leader.id}`));
    await expect(row).toContainText("Not assigned");

    // Assign the free ward: this puts the fixture territory back (An Hải held by E2E Sale).
    await assignButton(row).click();
    await expect(saveDialog(page, ASSIGN_TITLE)).toContainText(FIXTURE_WARD);
    await pickAndSave(page, ASSIGN_TITLE, SALE_OPTION);
    await expect(notice(page, new RegExp(`^${fixture.sale.name} now holds (.*\\s)?${FIXTURE_WARD}\\.$`))).toBeVisible();
    await expect(row).toContainText(fixture.sale.name);
    await expect(changeButton(row)).toBeVisible();
  });
});
