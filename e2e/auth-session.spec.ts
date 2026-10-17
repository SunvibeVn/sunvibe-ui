import { type BrowserContext, expect, type Page, type Request, test } from "@playwright/test";

import { API_URL } from "./support/api";
import {
  AUTH_E2E_SKIP_REASON,
  authE2eReady,
  bearerOf,
  CUSTOMER,
  corsHeaders,
  expectSignedInAccount,
  isApiRequest,
  isMeRequest,
  LOGIN_PATH,
  LOGOUT_PATH,
  logOutButton,
  ME_PATH,
  REFRESH_PATH,
  refreshCookieOf,
  sendsRefreshCookie,
  signIn,
  storesHolding,
  submitLoginForm,
  TEXT,
} from "./support/auth";

// The browser session end to end (auth-browser-session spec §10.3, cases 1-9). Local only: the API on the dev profile,
// the seeded accounts and the two env passwords (see AUTH_E2E_SKIP_REASON).
//
// Sign-in budget (login 10/min, refresh 30/min per IP; one worker): 5 sign-ins in this file, 1 in
// staff-session.spec.ts, 6 per run in all (limit 6). Cases that can share a signed-in browser do:
//   1. cases 1 + 2 + 3   2. cases 4 + 8   3. cases 5 + 9 + 6   4.-5. case 7 (signs in again with a pending logout)
// About 12 real refreshes per run. A saved browser state cannot be reused (every refresh rotates the cookie).
//
// The logout is sent with `keepalive`, so its abort and its observation are on the browser context (context.route,
// context events), not the page. If case 7 or 8 fails waiting for the logout, check first whether Playwright saw the
// keepalive request at all (run with --debug and watch the network) before suspecting the app.
// Wait a minute before running the suite again; never raise a limit for tests.

// A trace records request headers, and the Bearer token must never land in a file.
test.use({ trace: "off" });
// Several tabs and the refresh retries (+2 s, +12 s) take longer than the default 30 s.
test.describe.configure({ timeout: 120_000 });

test.beforeEach(async () => {
  test.skip(!(await authE2eReady()), AUTH_E2E_SKIP_REASON);
});

const VERIFY_PHONE_SEND_PATH = "/api/v1/me/verification/phone/send-code";
const VERIFY_PHONE_CONFIRM_PATH = "/api/v1/me/verification/phone/confirm-code";
const LOGIN_EXPIRED_URL = "/login?session=expired&next=%2Faccount";

const apiUrl = (path: string) => `${API_URL}${path}`;

/** Collects the page's requests that match, from now on. */
function recordRequests(target: Page | BrowserContext, matches: (request: Request) => boolean): Request[] {
  const seen: Request[] = [];
  target.on("request", (request) => {
    if (matches(request)) seen.push(request);
  });
  return seen;
}

const isRefresh = (request: Request) => isApiRequest(request, "POST", REFRESH_PATH);
const isLogout = (request: Request) => isApiRequest(request, "POST", LOGOUT_PATH);

/** The signed-out result of opening `/account`: the login page, and nothing of the account on screen. */
async function expectSignedOutAt(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  await expect(logOutButton(page)).toHaveCount(0);
  // Not exact: the phone shares its <dd> with the "Verified" badge.
  await expect(page.getByText(CUSTOMER.phone)).toHaveCount(0);
}

test("login, reload and a second tab stay signed in; the token stays in memory; logout signs out every tab (cases 1, 2, 3)", async ({
  page,
  context,
}) => {
  const tabA = page;
  const logins = recordRequests(tabA, (request) => isApiRequest(request, "POST", LOGIN_PATH));

  await test.step("case 1: login, reload, the token is only in memory", async () => {
    await signIn(tabA, CUSTOMER);
    expect(logins).toHaveLength(1);
    // Trivially true here (a fresh browser has no refresh cookie yet); case 7 checks it with a cookie in the jar.
    expect(await sendsRefreshCookie(logins[0]!), "the login request sends no sv_refresh cookie").toBe(false);

    const me = tabA.waitForRequest(isMeRequest);
    await tabA.reload();
    await expectSignedInAccount(tabA);
    const meRequest = await me;
    expect(await sendsRefreshCookie(meRequest), "GET /api/v1/me sends no sv_refresh cookie").toBe(false);
    const token = await bearerOf(meRequest);
    expect(token.length, "GET /api/v1/me carries a Bearer token").toBeGreaterThan(0);
    expect(await storesHolding(tabA, token), "browser stores holding the access token").toEqual([]);
  });

  // Tab B logs out, tab C is signed out with it, tab "back" goes Back to /account. Tab "kept" leaves /account
  // through a client-side link: Next keeps that route mounted but hidden (<Activity>), with its DOM.
  const tabB = await context.newPage();
  const tabC = await context.newPage();
  const tabKept = await context.newPage();
  const tabBack = tabA;

  await test.step("a second, a third and a fourth tab open /account signed in", async () => {
    await tabB.goto("/account");
    await expectSignedInAccount(tabB);
    await tabC.goto("/account");
    await expectSignedInAccount(tabC);
    await tabKept.goto("/account");
    await expectSignedInAccount(tabKept);
  });

  await test.step("case 2 setup: the first tab moves on to / in a new history entry", async () => {
    await tabBack.goto("/");
    await expect(tabBack).toHaveURL(/\/$/);
  });

  await test.step("case 2 setup: the fourth tab follows the header logo to / (client-side navigation)", async () => {
    await tabKept.bringToFront();
    await tabKept.getByRole("banner").getByRole("link", { name: "Sunvibe home" }).click();
    await expect(tabKept).toHaveURL(/\/$/);
    // Next keeps the /account route mounted but hidden: its private-view marker is still in the document.
    await expect(tabKept.locator("[data-private-view]")).toHaveCount(1);
    // Marks this document: a full page load replaces it.
    await tabKept.evaluate(() => {
      (window as Window & { svE2eDocument?: boolean }).svE2eDocument = true;
    });
  });

  await test.step("case 3: logout in one tab signs out the other", async () => {
    await tabB.bringToFront();
    await logOutButton(tabB).click();
    await expect(tabB).toHaveURL(/\/$/);
    await expect(tabC).toHaveURL(/\/login(\?|$)/, { timeout: 15_000 });
    await expect(logOutButton(tabC)).toHaveCount(0);
  });

  await test.step("case 2: Back to /account after the logout shows no private data", async () => {
    await tabBack.bringToFront();
    await tabBack.goBack();
    await expectSignedOutAt(tabBack);
  });

  await test.step("case 2: a hidden /account route leaves the document after the logout; Back never shows it", async () => {
    // The public page that still holds a hidden private route reloads: a full load drops that route and its memory.
    // Mid-reload the old document is gone and evaluate throws: that counts as "not reloaded yet".
    const sameDocument = () =>
      tabKept
        .evaluate(() => (window as Window & { svE2eDocument?: boolean }).svE2eDocument === true)
        .catch(() => true);
    await expect.poll(sameDocument, { message: "the tab reloaded after the logout", timeout: 15_000 }).toBe(false);
    // Counts hidden nodes too: nothing of the profile is left in the document.
    await expect(tabKept.locator(`text=${CUSTOMER.phone}`)).toHaveCount(0);

    // From here on, rendered (not hidden) text with the phone number counts, in every document of this tab.
    let profileShown = false;
    await tabKept.exposeFunction("svE2eProfileShown", () => {
      profileShown = true;
    });
    const watch = (phone: string) => {
      const report = () => {
        // innerText holds only rendered text: a route hidden with display: none does not count.
        if (document.body?.innerText.includes(phone)) {
          (window as Window & { svE2eProfileShown?: () => void }).svE2eProfileShown?.();
        }
      };
      new MutationObserver(report).observe(document, { childList: true, subtree: true, characterData: true });
      report();
    };
    await tabKept.addInitScript(watch, CUSTOMER.phone);
    await tabKept.evaluate(watch, CUSTOMER.phone);

    await tabKept.bringToFront();
    await tabKept.goBack();
    await expectSignedOutAt(tabKept);
    expect(profileShown, "the profile was shown after Back").toBe(false);
    await tabKept.close();
  });

  await test.step("case 1: after the logout a reload stays signed out", async () => {
    await tabB.reload();
    await tabB.goto("/account");
    await expectSignedOutAt(tabB);
  });
});

test("a 401 on verify-phone refreshes once and sends the typed code again; a failed logout warns and is sent on the next load (cases 4, 8)", async ({
  page,
  context,
}) => {
  await signIn(page, CUSTOMER);

  await test.step("case 4: confirm-code answers 401 once, then 204", async () => {
    // The seeded account is verified, so the page data is stubbed; the refresh stays real.
    await page.route(apiUrl(ME_PATH), async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      const body = { ...(await response.json()), phoneVerified: false };
      // The body changes, so its length and encoding headers no longer apply.
      const headers = Object.fromEntries(
        Object.entries(response.headers()).filter(([name]) => !["content-length", "content-encoding"].includes(name)),
      );
      await route.fulfill({ response, json: body, headers: { ...headers, ...corsHeaders(route.request()) } });
    });
    await page.route(apiUrl(VERIFY_PHONE_SEND_PATH), async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({
        status: 200,
        headers: corsHeaders(route.request()),
        json: {
          channel: "PHONE",
          sentTo: "*******101",
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
        },
      });
    });
    const confirms: { code: unknown; token: string }[] = [];
    await page.route(apiUrl(VERIFY_PHONE_CONFIRM_PATH), async (route) => {
      const request = route.request();
      if (request.method() !== "POST") return route.continue();
      confirms.push({ code: (request.postDataJSON() as { code?: unknown } | null)?.code, token: await bearerOf(request) });
      if (confirms.length === 1) {
        await route.fulfill({
          status: 401,
          headers: corsHeaders(request),
          json: { code: "UNAUTHORIZED", message: "Token expired" },
        });
      } else {
        await route.fulfill({ status: 204, headers: corsHeaders(request) });
      }
    });

    await page.goto("/verify-phone");
    const send = page.getByRole("button", { name: /^Send code to / });
    await expect(send).toBeVisible({ timeout: 20_000 });
    // The account page after the confirm reads the real (verified) profile.
    await page.unroute(apiUrl(ME_PATH));

    const refreshes = recordRequests(page, isRefresh);
    const refreshed = page.waitForResponse((response) => isRefresh(response.request()), { timeout: 30_000 });
    await send.click();
    const code = page.getByLabel("Digit 1 of 6");
    await expect(code).toBeVisible();
    await code.fill("482913");
    await page.getByRole("button", { name: "Verify phone number" }).click();

    await expect(page).toHaveURL(/\/account\?phone=verified$/, { timeout: 20_000 });
    await expect(page.getByText(TEXT.phoneVerified)).toBeVisible();
    await expectSignedInAccount(page);
    expect(refreshes, "refreshes after the 401").toHaveLength(1);
    expect(confirms.map((confirm) => confirm.code)).toEqual(["482913", "482913"]);
    // Compared as a boolean, so a failure never prints a token. Two refreshes in the same second may issue equal
    // tokens (no jti, whole-second iat/exp), so the retry is compared with the refresh answer, not the first call.
    const { accessToken } = (await (await refreshed).json()) as { accessToken?: string };
    expect(Boolean(accessToken) && confirms[1]!.token === accessToken, "the retry carries the refreshed token").toBe(
      true,
    );
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  await test.step("case 8: the logout call fails, the page warns and offers a retry", async () => {
    await context.route(apiUrl(LOGOUT_PATH), (route) => route.abort());
    await logOutButton(page).click();
    await expect(page.getByText(TEXT.logoutFailed)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: TEXT.tryAgain })).toBeVisible();
    await context.unroute(apiUrl(LOGOUT_PATH));
  });

  await test.step("case 8: the next page load sends the pending logout", async () => {
    const logout = context.waitForEvent("response", { predicate: (response) => isLogout(response.request()) });
    await page.goto("/");
    expect((await logout).ok(), "the pending logout succeeds").toBe(true);
    await expect.poll(() => page.evaluate(() => document.cookie.includes("sv_logout_pending=1"))).toBe(false);
    await page.goto("/account");
    await expectSignedOutAt(page);
  });
});

test("three tabs at once, a link from an outside page, then a session ended behind the app (cases 5, 9, 6)", async ({
  page,
  context,
}) => {
  await signIn(page, CUSTOMER);

  await test.step("case 5: three tabs open /account at once", async () => {
    const refreshes = recordRequests(context, isRefresh);
    // W10-25: with Web Locks the refreshes run one after another, so each sends the cookie the previous one rotated.
    // The values stay in memory and are only counted, never printed.
    const sentCookies: Promise<string>[] = [];
    context.on("request", (request) => {
      if (isRefresh(request)) sentCookies.push(refreshCookieOf(request));
    });
    const tabs = await Promise.all([context.newPage(), context.newPage(), context.newPage()]);
    const refreshAnswers = tabs.map((tab) =>
      tab.waitForResponse((response) => isRefresh(response.request()), { timeout: 30_000 }),
    );
    await Promise.all(tabs.map((tab) => tab.goto("/account")));
    for (const tab of tabs) await expectSignedInAccount(tab);
    for (const answer of await Promise.all(refreshAnswers)) expect(answer.status(), "each refresh status").toBe(200);
    expect(refreshes.length, "one refresh per tab").toBe(3);
    const values = await Promise.all(sentCookies);
    expect(
      values.every(Boolean) && new Set(values).size === 3,
      "each refresh sent the cookie rotated by the previous one",
    ).toBe(true);
    await Promise.all(tabs.map((tab) => tab.close()));
  });

  await test.step("case 9: a link to /account from an outside page keeps the session", async () => {
    await page.goto("about:blank");
    await page.setContent('<a href="http://localhost:3000/account">Open my Sunvibe account</a>');
    await page.getByRole("link", { name: "Open my Sunvibe account" }).click();
    await expectSignedInAccount(page);
  });

  await test.step("case 6: the session ends behind the app, the next load says so", async () => {
    // From the page origin (the browser sends the Origin header) with the refresh cookie; the hint stays.
    const status = await page.evaluate(
      async (url) => (await fetch(url, { method: "POST", credentials: "include" })).status,
      apiUrl(LOGOUT_PATH),
    );
    expect(status, "logout status").toBeGreaterThanOrEqual(200);
    expect(status, "logout status").toBeLessThan(300);
    expect(await page.evaluate(() => /(^|;\s*)sv_signed_in=[^;]+/.test(document.cookie)), "hint kept").toBe(true);

    await page.reload();
    await expect(page).toHaveURL(LOGIN_EXPIRED_URL, { timeout: 20_000 });
    await expect(page.getByText(TEXT.sessionEnded)).toBeVisible();
  });
});

test("the refresh cannot reach the API: retry block, sign out on this device, the next load sends the logout, a new sign-in settles it first (case 7)", async ({
  page,
  context,
}) => {
  await signIn(page, CUSTOMER);
  // Logout attempts that reached the route; counted in the handler, which also sees keepalive requests. Every
  // logout fails until the last step lets one through.
  const order: string[] = [];
  const logoutAttempts = () => order.filter((entry) => entry === "logout").length;
  let letLogoutThrough = false;
  await context.route(apiUrl(LOGOUT_PATH), (route) => {
    order.push("logout");
    return letLogoutThrough ? route.continue() : route.abort();
  });
  context.on("request", (request) => {
    if (isApiRequest(request, "POST", LOGIN_PATH)) order.push("login");
  });
  context.on("response", (response) => {
    if (isLogout(response.request()) && response.ok()) order.push("logout answered 2xx");
  });

  await test.step("the server is unreachable: the unavailable block", async () => {
    // Refresh and logout both fail, as when the network is down: with a working logout nothing would stay pending.
    await context.route(apiUrl(REFRESH_PATH), (route) => route.abort());
    await page.reload();
    // The refresh is retried at about +2 s and +12 s before the block shows.
    await expect(page.getByText(TEXT.unavailable)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("button", { name: TEXT.tryAgain })).toBeVisible();
  });

  await test.step("sign out on this device keeps a pending logout", async () => {
    const before = logoutAttempts();
    await page.getByRole("button", { name: TEXT.signOutHere }).click();
    await expect(page.getByText(TEXT.logoutFailed)).toBeVisible({ timeout: 20_000 });
    expect(logoutAttempts(), "logout attempts by the sign-out").toBeGreaterThan(before);
    expect(await page.evaluate(() => document.cookie.includes("sv_logout_pending=1")), "pending flag").toBe(true);
  });

  await test.step("the reload sends the pending logout and no refresh", async () => {
    // The refresh is let through again, so a refresh would show up here. The logout still fails, so the API keeps
    // the refresh cookie for the sign-in below.
    await context.unroute(apiUrl(REFRESH_PATH));
    const refreshes = recordRequests(context, isRefresh);
    const before = logoutAttempts();
    await page.reload();
    await expectSignedOutAt(page);
    await expect.poll(logoutAttempts, { message: "the pending logout is sent on the next load" }).toBeGreaterThan(before);
    expect(await page.evaluate(() => document.cookie.includes("sv_logout_pending=1")), "still pending").toBe(true);
    expect(refreshes, "refreshes after the sign-out").toHaveLength(0);
  });

  await test.step("a sign-in with a pending logout tries it first; the login sends no refresh cookie (S-23)", async () => {
    // The old refresh cookie is still in the browser (its logout never reached the API): the login request must not
    // carry it (the cookie's Path is /api/v1/auth/session). Only the cookie's name is read here.
    // All cookies: a URL filter would also match on Path and leave this cookie out.
    const apiCookies = await context.cookies();
    expect(apiCookies.some((cookie) => cookie.name.endsWith("sv_refresh")), "a refresh cookie is in the jar").toBe(true);

    // The /login page load sends the pending logout first; it still fails, so the flag stays for the sign-in.
    const pageLoadLogout = context.waitForEvent("requestfailed", { predicate: isLogout });
    await page.goto("/login");
    await pageLoadLogout;
    expect(await page.evaluate(() => document.cookie.includes("sv_logout_pending=1")), "still pending").toBe(true);

    // The next logout is the one the sign-in sends before its login (S-23): it reaches the API.
    order.length = 0;
    letLogoutThrough = true;
    const login = context.waitForEvent("request", {
      predicate: (request) => isApiRequest(request, "POST", LOGIN_PATH),
    });

    await submitLoginForm(page, CUSTOMER);

    expect(order[0], "the pending logout is sent first").toBe("logout");
    expect(order.indexOf("logout answered 2xx"), "the logout answered 2xx").toBeGreaterThan(0);
    expect(order.indexOf("logout answered 2xx"), "the logout answered before the login").toBeLessThan(
      order.indexOf("login"),
    );
    expect(await sendsRefreshCookie(await login), "the login request sends no sv_refresh cookie").toBe(false);
    expect(await page.evaluate(() => document.cookie.includes("sv_logout_pending=1")), "flag cleared").toBe(false);
    await context.unrouteAll({ behavior: "ignoreErrors" });
  });
});
