import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import { expectSignedInAccount, headerAccountLink } from "../support/auth";
import {
  expectListPage,
  fixture,
  hasSignInHint,
  header,
  newStaffContext,
  recordApiCalls,
  signInAs,
  signOutFromWorkspace,
  submitLogin,
  T,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
  byText,
} from "./support/staff";

// Who may open the staff workspace: W11-21 (signed-out deep link, SALE), W11-22 (CUSTOMER gets 403) and the CUSTOMER
// part of W11-20 (no link, no card). Spec 5.8 budget: 2 sign-ins (SALE through the redirect, CUSTOMER), full loads of
// protected pages: 3 (deep link, /account, /workspace) of 4; intake POSTs: 0.
//
// Fixtures: this file changes none. Run BOTH seeds again before every `npm run e2e:workspace` (the other files change
// leads and a territory); this file runs first, then sale, leader and admin (playwright.workspace.config.ts).

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("who may open the workspace", () => {
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

  test("W11-21: a signed-out deep link goes to /login and, after the SALE signs in, to the workspace", async () => {
    const calls = recordApiCalls(page);
    await page.goto("/workspace/owner-leads?scope=all");

    // The proxy (hint cookie only) sends the visitor to the login page and keeps the page they asked for.
    await expect(page).toHaveURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/workspace/owner-leads?scope=all");
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();

    await submitLogin(page, "SALE");
    await expect(page).toHaveURL(/\/workspace\/owner-leads\?/, { timeout: 20_000 });
    await expectListPage(page);
    // A SALE cannot open "all": the same page, normalized to the SALE's own tab, and no call asked for "all".
    await expect(page).toHaveURL(/scope=mine/);
    expect(calls.filter((call) => call.url.searchParams.get("scope") === "all"), "calls with scope=all").toHaveLength(0);

    await signOutFromWorkspace(page);
    await expect.poll(() => hasSignInHint(page), { message: "the sign-in hint is gone after the sign-out" }).toBe(false);
  });

  test("W11-22 and W11-20: a CUSTOMER has no workspace link or card and gets the 403 screen, still signed in", async () => {
    await signInAs(page, "CUSTOMER");
    await expectSignedInAccount(page);
    // The session is restored here, so a staff user would have the link and the card by now.
    await expect(headerAccountLink(page)).toBeVisible();
    await expect(header(page).getByRole("link", { name: T.workspace })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: T.workspace })).toHaveCount(0);
    await expect(page.getByRole("link", { name: T.openWorkspace })).toHaveCount(0);

    await page.goto("/workspace/owner-leads");
    await expect(byText(page, T.forbiddenTitle)).toBeVisible({ timeout: 20_000 });
    // Nothing of the lead list, no workspace header, and the session stays.
    await expect(page.getByRole("heading", { level: 1, name: T.listTitle })).toHaveCount(0);
    await expect(header(page).getByRole("button", { name: T.signOut })).toHaveCount(0);
    expect(await hasSignInHint(page), "still signed in").toBe(true);
    await expect(page.getByRole("link", { name: "Về trang chủ" })).toBeVisible();
    // The fixtures were not touched: nobody can see a lead code on this page.
    expect((await page.content()).includes(fixture.lead(1).code), "a lead code anywhere in the page").toBe(false);
  });
});
