import { type BrowserContext, expect, type Page, type Request, test } from "@playwright/test";

import { API_URL } from "../support/api";
import {
  AUTH_E2E_SKIP_REASON,
  authE2eReady,
  bearerOf,
  CUSTOMER,
  corsHeaders,
  expectSignedInAccount,
  isApiRequest,
  ME_PATH,
  REFRESH_PATH,
  signIn,
  TEXT,
} from "../support/auth";

// `/verify-phone` exists only in `on`, so case 4 of the browser session (auth-browser-session spec §10.3) lives in this
// suite. Sign-in budget: 1.

// A trace records request headers, and the Bearer token must never land in a file.
test.use({ trace: "off" });
test.describe.configure({ timeout: 120_000 });

test.beforeEach(async () => {
  test.skip(!(await authE2eReady()), AUTH_E2E_SKIP_REASON);
});

const VERIFY_PHONE_SEND_PATH = "/api/v1/me/verification/phone/send-code";
const VERIFY_PHONE_CONFIRM_PATH = "/api/v1/me/verification/phone/confirm-code";

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

test("a 401 on verify-phone refreshes once and sends the typed code again (case 4)", async ({ page }) => {
  await signIn(page, CUSTOMER);

  // The seeded account owes nothing, so the page data is stubbed; the refresh stays real.
  await page.route(apiUrl(ME_PATH), async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = { ...(await response.json()), phoneVerified: false, requiredAction: "VERIFY_PHONE" };
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
  // The account page after the confirm reads the real profile.
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
  // Compared as a boolean, so a failure never prints a token. Two refreshes in the same second may issue equal tokens
  // (no jti, whole-second iat/exp), so the retry is compared with the refresh answer, not the first call.
  const { accessToken } = (await (await refreshed).json()) as { accessToken?: string };
  expect(Boolean(accessToken) && confirms[1]!.token === accessToken, "the retry carries the refreshed token").toBe(true);
});
