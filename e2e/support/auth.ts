import { expect, type Locator, type Page, type Request } from "@playwright/test";

import { API_URL, isApiAvailable } from "./api";

// Accounts and helpers of the browser-session E2E specs (auth-browser-session spec §10.3). The passwords come from
// the shell only (never a file in the repo); nothing here logs a password or a token.

export type E2eAccount = { phone: string; password: string | undefined };

/** `TENANT` + `CUSTOMER`, `ACTIVE`, phone verified (seeded by sunvibe-server/scripts/dev/seed-e2e-accounts.sql). */
export const CUSTOMER: E2eAccount = { phone: "0900000101", password: process.env.E2E_CUSTOMER_PASSWORD };
/** `SALE`, `ACTIVE`, phone verified (same seed). */
export const SALE: E2eAccount = { phone: "0900000102", password: process.env.E2E_SALE_PASSWORD };

export const AUTH_E2E_SKIP_REASON =
  `The auth E2E specs need the local API at ${API_URL} (dev profile), the accounts from ` +
  "sunvibe-server/scripts/dev/seed-e2e-accounts.sql, and E2E_CUSTOMER_PASSWORD and E2E_SALE_PASSWORD exported " +
  "in the shell that runs npm run e2e (run the seed with psql as in " +
  "docs/features/auth/auth-browser-session/impl/2026-10-17-auth-browser-session-fe-handoff.md §3 E2E prerequisites); " +
  "at least one of them is missing.";

/** `SALE_LEADER`, `ACTIVE`, phone verified (same seed; used by the workspace specs only). */
export const LEADER: E2eAccount = { phone: "0900000103", password: process.env.E2E_LEADER_PASSWORD };
/** `ADMIN`, `ACTIVE`, phone verified (same seed; used by the workspace specs only). */
export const ADMIN: E2eAccount = { phone: "0900000104", password: process.env.E2E_ADMIN_PASSWORD };

/**
 * True when the API answers and the passwords are set; never reveals the values. The auth specs need the customer and
 * sale passwords; `{ workspace: true }` (the staff workspace specs) also needs the leader and admin passwords.
 */
export async function authE2eReady(options: { workspace?: boolean } = {}): Promise<boolean> {
  const passwords = [CUSTOMER.password, SALE.password];
  if (options.workspace) passwords.push(LEADER.password, ADMIN.password);
  return passwords.every(Boolean) && (await isApiAvailable());
}

export const LOGIN_PATH = "/api/v1/auth/login";
export const REFRESH_PATH = "/api/v1/auth/session/refresh";
export const LOGOUT_PATH = "/api/v1/auth/session/logout";
export const ME_PATH = "/api/v1/me";
export const REFRESH_COOKIE = "sv_refresh";

/** English texts of `/account` and `/verify-phone` (src/features/auth/lib/english-session-texts.ts, spec §7). */
export const TEXT = {
  unavailable: "We couldn't reach the server to restore your session. You're still signed in.",
  signOutHere: "Sign out on this device",
  logoutFailed: "You're signed out on this device, but we couldn't end your session on the server.",
  tryAgain: "Try again",
  sessionEnded: "Your session has ended. Please log in again.",
  phoneVerified: "Your phone number is verified. Welcome to Sunvibe!",
} as const;

/** A request to the API at `path` (any query), sent by the page itself; CORS preflights are left out. */
export function isApiRequest(request: Request, method: string, path: string): boolean {
  if (request.method() !== method) return false;
  const url = new URL(request.url());
  return url.origin === API_URL && url.pathname === path;
}

export const isMeRequest = (request: Request) => isApiRequest(request, "GET", ME_PATH);

/** The Bearer token of a request, or "" when it has none. */
export async function bearerOf(request: Request): Promise<string> {
  const header = (await request.allHeaders())["authorization"] ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

/** The value of the HttpOnly refresh cookie the request sent, or "" (only for comparisons: never print it). */
export async function refreshCookieOf(request: Request): Promise<string> {
  const cookie = (await request.allHeaders())["cookie"] ?? "";
  for (const part of cookie.split(";")) {
    const entry = part.trim();
    const separator = entry.indexOf("=");
    if (separator > 0 && entry.slice(0, separator).endsWith(REFRESH_COOKIE)) return entry.slice(separator + 1);
  }
  return "";
}

/** True when the request sent the HttpOnly refresh cookie. */
export async function sendsRefreshCookie(request: Request): Promise<boolean> {
  return (await refreshCookieOf(request)) !== "";
}

/** The "Log out" button: shown only on a signed-in `/account`. */
export const logOutButton = (page: Page) => page.getByRole("button", { name: "Log out", exact: true });

/** Waits until the page shows the signed-in `/account`. */
export async function expectSignedInAccount(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/account(\?|$)/);
  await expect(logOutButton(page)).toBeVisible({ timeout: 20_000 });
}

/** The header's "Account" link: shown while the sign-in hint is set (the header reads only the hint). */
export const headerAccountLink = (page: Page) => page.getByRole("banner").getByRole("link", { name: "Account" });

/** Optional ways of `submitLoginForm` and `signIn`; without them both behave as the auth specs expect. */
export type LoginFormOptions = {
  /** Puts the password into its field; default `locator.fill`. */
  setPassword?: (field: Locator, password: string) => Promise<void>;
  /** Waits for the signed-in `/account` after the 200 (default true); false stops at the 200 (the caller checks). */
  expectAccount?: boolean;
};

/**
 * Fills and submits the `/login` form already on screen, then waits for `/account` with the header updated (the
 * seeded accounts are phone verified).
 */
export async function submitLoginForm(page: Page, account: E2eAccount, options: LoginFormOptions = {}): Promise<void> {
  if (!account.password) throw new Error(AUTH_E2E_SKIP_REASON);
  await page.getByLabel("Phone number").fill(account.phone);
  const password = page.getByLabel("Password", { exact: true });
  if (options.setPassword) await options.setPassword(password, account.password);
  else await password.fill(account.password);
  const login = page.waitForResponse((response) => isApiRequest(response.request(), "POST", LOGIN_PATH));
  await page.getByRole("button", { name: "Log in" }).click();
  // Fail on the answer itself (the body may hold a token: only the status is shown).
  expect((await login).status(), `POST ${LOGIN_PATH} status`).toBe(200);
  if (options.expectAccount === false) return;
  await expectSignedInAccount(page);
  // A sign-in in this tab updates its own header too.
  await expect(headerAccountLink(page)).toBeVisible();
}

/** Signs in through the real `/login` form and waits for `/account`. */
export async function signIn(page: Page, account: E2eAccount, options: LoginFormOptions = {}): Promise<void> {
  if (!account.password) throw new Error(AUTH_E2E_SKIP_REASON);
  await page.goto("/login");
  await submitLoginForm(page, account, options);
}

/**
 * The Bearer token of the app's own next `GET /api/v1/me` (start it before the navigation that loads the page).
 * Only for checks in the test: never log or print it.
 */
export async function captureBearer(page: Page): Promise<string> {
  const request = await page.waitForRequest(isMeRequest, { timeout: 30_000 });
  const token = await bearerOf(request);
  expect(token.length, "GET /api/v1/me carries a Bearer token").toBeGreaterThan(0);
  return token;
}

/** Names of the browser stores of the page that contain `token` (expected: none). */
export function storesHolding(page: Page, token: string): Promise<string[]> {
  return page.evaluate((secret) => {
    const found: string[] = [];
    if (document.cookie.includes(secret)) found.push("document.cookie");
    for (const [name, storage] of [
      ["localStorage", window.localStorage],
      ["sessionStorage", window.sessionStorage],
    ] as const) {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i) ?? "";
        if (key.includes(secret) || (storage.getItem(key) ?? "").includes(secret)) found.push(name);
      }
    }
    return found;
  }, token);
}

/** CORS headers for an answer `page.route` makes up for a call of the app (the app runs on another origin). */
export function corsHeaders(request: Request): Record<string, string> {
  return {
    "access-control-allow-origin": request.headers()["origin"] ?? "http://localhost:3000",
    "access-control-allow-credentials": "true",
    vary: "Origin",
  };
}
