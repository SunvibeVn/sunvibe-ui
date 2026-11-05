import { expect, type Page, type Request, test } from "@playwright/test";

import { API_URL } from "./support/api";
import {
  AUTH_E2E_SKIP_REASON,
  authE2eReady,
  CUSTOMER,
  corsHeaders,
  expectSignedInAccount,
  isApiRequest,
  logOutButton,
  REFRESH_PATH,
  signInWith,
} from "./support/auth";
import { codeOf, isMailpitAvailable, MAILPIT_UNAVAILABLE_REASON, nextMailTo, resetOf } from "./support/mailpit";
import { completeDetails, fillCode, newPassword, submitCode } from "./support/sign-up";

// The public email flows in a browser (auth-email-access spec 6.5, U-2 to U-10), against the API with the phone channel
// `off` and Mailpit (sunvibe-server scripts/dev/run-e2e-auth-api off).
//
// Budget of one run, per IP (the limits are not raised for tests; a restart of the API resets them):
//   registration/email/send-code 5 per hour: 4 real sends here. The cases that are about what the page does with an answer
//   stub that answer instead (expired code, mail failure, a second address).
//   login 10 per minute: 3 here, 6 in auth-session.spec.ts and staff-session.spec.ts, in that order, over more than a minute.

// A trace records request headers, and the Bearer token must never land in a file.
test.use({ trace: "off" });
test.describe.configure({ timeout: 120_000 });

test.beforeEach(async () => {
  test.skip(!(await authE2eReady()), AUTH_E2E_SKIP_REASON);
  test.skip(!(await isMailpitAvailable()), MAILPIT_UNAVAILABLE_REASON);
});

const SEND_CODE_PATH = "/api/v1/auth/registration/email/send-code";
const VERIFY_CODE_PATH = "/api/v1/auth/registration/email/verify-code";
const EMAIL_NOT_AVAILABLE = "This email can't be used right now. Try another email or contact Sunvibe.";

/** An address nobody used: the daily caps count per address, so a run never meets the last one's. */
const newAddress = (label: string): string =>
  `e2e.${label}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@sunvibe.test`;

const apiUrl = (path: string) => `${API_URL}${path}`;

/** Answers `path` with `status` and `json` instead of the API. */
async function stub(page: Page, path: string, status: number, json: unknown, headers: Record<string, string> = {}) {
  await page.route(apiUrl(path), async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    await route.fulfill({ status, json, headers: { ...corsHeaders(request), ...headers } });
  });
}

const sentAnswer = () => ({
  channel: "EMAIL",
  sentTo: "e***@sunvibe.test",
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
});

const errorAnswer = (code: string) => ({ code, message: "x", errors: [], correlationId: "e2e" });

/** The first step of a sign-up, up to the code step. */
async function startSignUp(page: Page, address: string): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Email", { exact: true }).fill(address);
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page).toHaveURL(/\/sign-up\/verify$/);
}

test.describe.serial("an account made by email", () => {
  const address = newAddress("signup");
  const password = newPassword();
  const changed = newPassword();

  test("sign up by email, reload, a second tab, a refresh and a logout", async ({ page, context }) => {
    await startSignUp(page, address);
    await expect(page.getByText(address)).toBeVisible();

    await submitCode(page, codeOf(await nextMailTo(address)));
    await completeDetails(page, "E2E Email Account", password);
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(address)).toBeVisible();
    // An email account has no phone: no row, no prompt, no way to /verify-phone (U-5).
    await expect(page.getByText("Phone number")).toHaveCount(0);
    await expect(page.getByText("Verify your phone number")).toHaveCount(0);

    await test.step("a reload restores the session through a refresh", async () => {
      const refresh = page.waitForResponse((response) => isApiRequest(response.request(), "POST", REFRESH_PATH));
      await page.reload();
      expect((await refresh).status(), "refresh status").toBe(200);
      await expectSignedInAccount(page);
    });

    await test.step("a second tab is signed in too", async () => {
      const second = await context.newPage();
      await second.goto("/account");
      await expectSignedInAccount(second);
      await second.close();
    });

    await test.step("the logout ends the session", async () => {
      await logOutButton(page).click();
      await expect(page).toHaveURL(/\/$/);
      await page.goto("/account");
      await expect(page).toHaveURL(/\/login(\?|$)/);
    });
  });

  test("sign in with capitals and edge spaces reaches the same account", async ({ page }) => {
    await signInWith(page, `  ${address.toUpperCase()} `, password);
    await expect(page.getByText(address)).toBeVisible();
  });

  test("recovery by email: the token leaves the address bar and reaches no request", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("tab")).toHaveCount(0);
    await page.getByLabel("Email", { exact: true }).fill(address);
    await page.getByRole("button", { name: "Email me a reset link" }).click();
    await expect(page.getByText("Check your inbox")).toBeVisible();

    const { code, link } = resetOf(await nextMailTo(address, 1));
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get("token") ?? "";
    expect(token.length, "the link carries a token").toBeGreaterThan(0);

    // U-6: from here on nothing the page sends may carry the token, in its URL or its Referer.
    const leaks: string[] = [];
    const watch = (request: Request) => {
      if (request.url().includes(token)) leaks.push("url");
      if ((request.headers()["referer"] ?? "").includes(token)) leaks.push("referer");
    };
    page.on("request", watch);

    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password$/);
    expect(new URL(page.url()).hash, "the fragment is gone").toBe("");
    await expect(page.getByRole("button", { name: "Set new password" })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("sv_reset") !== null), "the tab holds the token").toBe(true);

    await fillCode(page, code);
    await page.getByLabel("New password", { exact: true }).fill(changed);
    await page.getByLabel("Confirm new password").fill(changed);
    await page.getByRole("button", { name: "Set new password" }).click();

    await expect(page).toHaveURL(/\/login\?reset=success$/);
    expect(leaks, "requests that carried the token").toEqual([]);

    await signInWith(page, address, changed);
  });
});

test("a wrong code is refused, the right one goes on, and a used code works no more", async ({ page }) => {
  const address = newAddress("code");
  await startSignUp(page, address);
  const code = codeOf(await nextMailTo(address));

  await submitCode(page, code === "000000" ? "000001" : "000000");
  await expect(page.getByText("Incorrect verification code.")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-up\/verify$/);

  await submitCode(page, code);
  await expect(page).toHaveURL(/\/sign-up\/details$/);

  // The same code from the page's origin, as a second tab would send it.
  const status = await page.evaluate(
    async ({ url, body }) =>
      (
        await fetch(url, {
          method: "POST",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status,
    { url: apiUrl(VERIFY_CODE_PATH), body: { email: address, code } },
  );
  expect(status, "a used code").toBe(400);
});

test("an expired code says so and offers a new one", async ({ page }) => {
  await stub(page, SEND_CODE_PATH, 200, sentAnswer());
  await stub(page, VERIFY_CODE_PATH, 400, errorAnswer("CODE_EXPIRED"));
  await startSignUp(page, newAddress("expired"));

  await submitCode(page, "123456");
  await expect(page.getByText("The verification code is invalid or has expired. Please request a new one.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Resend code/ })).toBeVisible();
});

test("changing the email in the first step drops the code and the token (U-3)", async ({ page }) => {
  const address = newAddress("mismatch");
  await startSignUp(page, address);
  await submitCode(page, codeOf(await nextMailTo(address)));
  await expect(page).toHaveURL(/\/sign-up\/details$/);

  await stub(page, SEND_CODE_PATH, 200, sentAnswer());
  await startSignUp(page, newAddress("other"));

  const progress = await page.evaluate(() => sessionStorage.getItem("sv_signup") ?? "");
  expect(progress.includes("registrationToken"), "the token of the first address").toBe(false);
  expect(progress.includes(address), "the first address").toBe(false);

  await page.goto("/sign-up/details");
  await expect(page).toHaveURL(/\/sign-up\/verify$/);
});

test("an address already in use shows the way out and leaves nothing in the tab", async ({ page }) => {
  await stub(page, SEND_CODE_PATH, 200, sentAnswer());
  await stub(page, VERIFY_CODE_PATH, 409, errorAnswer("EMAIL_ACCOUNT_EXISTS"));
  await startSignUp(page, newAddress("exists"));

  await submitCode(page, "123456");
  await expect(page.getByText("This email already has a Sunvibe account.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" }).last()).toBeVisible();
  await expect(page.getByRole("link", { name: "Reset your password" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("sv_signup")), "the progress").toBeNull();
});

test("an address that cannot be used offers another one", async ({ page }) => {
  await stub(page, SEND_CODE_PATH, 200, sentAnswer());
  await stub(page, VERIFY_CODE_PATH, 409, errorAnswer("EMAIL_NOT_AVAILABLE"));
  await startSignUp(page, newAddress("unavailable"));

  await submitCode(page, "123456");
  await expect(page.getByText(EMAIL_NOT_AVAILABLE)).toBeVisible();
  await expect(page.getByRole("link", { name: "Use another email" })).toBeVisible();
});

test("a mail failure allows a retry at once, and a 429 tells the wait (U-4)", async ({ page }) => {
  await page.goto("/sign-up");
  await stub(page, SEND_CODE_PATH, 503, errorAnswer("EMAIL_DELIVERY_FAILED"), { "retry-after": "60" });
  await page.getByLabel("Email", { exact: true }).fill(newAddress("mailfail"));
  const send = page.getByRole("button", { name: "Send verification code" });
  await send.click();
  await expect(page.getByText("We couldn't send the email. Try again in a minute.")).toBeVisible();
  await expect(send).toBeEnabled();

  await page.unroute(apiUrl(SEND_CODE_PATH));
  await stub(page, SEND_CODE_PATH, 429, errorAnswer("CODE_RESEND_TOO_SOON"), {
    "retry-after": "45",
    "access-control-expose-headers": "Retry-After",
  });
  await send.click();
  await expect(page.getByText("Too many requests. Please wait 45 seconds and try again.")).toBeVisible();
});

test("a 200+ character email signs up and signs in", async ({ page }) => {
  // The local part stays within its 64.
  const address = `${"a".repeat(50)}.${Date.now().toString(36)}@${"b".repeat(60)}.${"c".repeat(60)}.${"d".repeat(10)}.sunvibe.test`;
  expect(address.length, "the length of the address").toBeGreaterThan(200);
  const password = newPassword();

  await startSignUp(page, address);
  await submitCode(page, codeOf(await nextMailTo(address)));
  await completeDetails(page, "E2E Long Address", password);
  await logOutButton(page).click();
  await expect(page).toHaveURL(/\/$/);

  await signInWith(page, address, password);
});

// Next keeps a visited route mounted but hidden (<Activity>), with its state, so these go through the page's own links:
// `page.goto` is a full load and would hide what a visitor sees.
test.describe("coming back to a step through the page's links", () => {
  /** The first step when the visitor is already on it. */
  async function sendCodeTo(page: Page, address: string): Promise<void> {
    await expect(page).toHaveURL(/\/sign-up(\?|$)/);
    await page.getByLabel("Email", { exact: true }).fill(address);
    await page.getByRole("button", { name: "Send verification code" }).click();
    await expect(page).toHaveURL(/\/sign-up\/verify$/);
  }

  const DETAILS_ANSWER = () => ({
    registrationToken: "token-1",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });

  test("the code step of a new address shows nothing of the last one", async ({ page }) => {
    await stub(page, SEND_CODE_PATH, 200, sentAnswer());
    await stub(page, VERIFY_CODE_PATH, 400, errorAnswer("CODE_INCORRECT"));
    await startSignUp(page, newAddress("first"));
    await submitCode(page, "123456");
    await expect(page.getByText("Incorrect verification code.")).toBeVisible();

    await page.getByRole("link", { name: "Wrong email?" }).click();
    const next = newAddress("second");
    await sendCodeTo(page, next);

    await expect(page.getByText(next)).toBeVisible();
    await expect(page.getByText("Incorrect verification code.")).toHaveCount(0);
  });

  test("the details step of a new address shows nothing of the last one", async ({ page }) => {
    await stub(page, SEND_CODE_PATH, 200, sentAnswer());
    await stub(page, VERIFY_CODE_PATH, 200, DETAILS_ANSWER());
    await stub(page, "/api/v1/auth/registration/email", 409, errorAnswer("EMAIL_NOT_AVAILABLE"));
    await startSignUp(page, newAddress("taken"));
    await submitCode(page, "123456");
    await expect(page).toHaveURL(/\/sign-up\/details$/);
    await page.getByLabel("Full name").fill("E2E Second Address");
    const password = newPassword();
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(EMAIL_NOT_AVAILABLE)).toBeVisible();

    await page.getByRole("link", { name: "Use another email" }).click();
    const next = newAddress("free");
    await sendCodeTo(page, next);
    await submitCode(page, "123456");

    await expect(page).toHaveURL(/\/sign-up\/details$/);
    await expect(page.getByText(`${next} is verified`)).toBeVisible();
    await expect(page.getByText(EMAIL_NOT_AVAILABLE)).toHaveCount(0);
  });

  test("a refused address keeps its way out when the tab is left and shown again, and the next address gets its code boxes", async ({
    page,
  }) => {
    await stub(page, SEND_CODE_PATH, 200, sentAnswer());
    await stub(page, VERIFY_CODE_PATH, 409, errorAnswer("EMAIL_NOT_AVAILABLE"));
    await startSignUp(page, newAddress("refused"));
    await submitCode(page, "123456");
    await expect(page.getByText(EMAIL_NOT_AVAILABLE)).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("link", { name: "Use another email" })).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up\/verify$/);

    await page.getByRole("link", { name: "Use another email" }).click();
    await sendCodeTo(page, newAddress("after"));
    await expect(page.getByLabel("Digit 1 of 6")).toBeVisible();
    await expect(page.getByText(EMAIL_NOT_AVAILABLE)).toHaveCount(0);
  });

  test("/forgot-password comes back with its form, and the sent page offers another try", async ({ page }) => {
    await stub(page, "/api/v1/auth/password-reset/email", 200, { expiresAt: new Date().toISOString(), otpExpirationMinutes: 15 });
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByLabel("Email", { exact: true }).fill(newAddress("typo"));
    await page.getByRole("button", { name: "Email me a reset link" }).click();
    await expect(page.getByText("Check your inbox")).toBeVisible();

    await page.getByRole("button", { name: "Use another email" }).click();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(newAddress("again"));
    await page.getByRole("button", { name: "Email me a reset link" }).click();
    await expect(page.getByText("Check your inbox")).toBeVisible();

    await page.getByRole("link", { name: "Back to log in" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  });
});

test.describe("the phone channel is closed (U-2)", () => {
  for (const path of ["/login/phone", "/sign-up/phone"]) {
    test(`${path} is not found`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), `status of ${path}`).toBe(404);
    });
  }

  for (const path of ["/login", "/sign-up", "/forgot-password"]) {
    test(`${path} shows no phone control or link`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("form").first()).toBeVisible();
      await expect(page.getByText(/phone/i)).toHaveCount(0);
      await expect(page.locator('input[type="tel"]')).toHaveCount(0);
      await expect(page.locator('a[href*="phone"]')).toHaveCount(0);
    });
  }

  test("a wrong sign-in offers no phone fallback", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(CUSTOMER.email);
    await page.getByLabel("Password", { exact: true }).fill("Not-the-password-1");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
    await expect(page.getByText(/phone/i)).toHaveCount(0);
  });
});

test.describe("progress of a sign-up (U-7, SV-008)", () => {
  /** A tab with both progress keys, signed out. */
  async function tabWithProgress(page: Page): Promise<void> {
    await page.goto("/sign-up");
    await page.evaluate(() => {
      sessionStorage.setItem("sv_signup", "progress");
      sessionStorage.setItem("sv_reset", "progress");
    });
  }

  const keys = (page: Page) =>
    page.evaluate(() => [sessionStorage.getItem("sv_signup"), sessionStorage.getItem("sv_reset")]);

  test("progress of an older build is discarded", async ({ page }) => {
    await page.goto("/sign-up");
    await page.evaluate(() =>
      sessionStorage.setItem(
        "sv_signup",
        JSON.stringify({ phone: "0901234567", registrationToken: "t", tokenExpiresAt: "2999-01-01T00:00:00Z", startedAt: Date.now() }),
      ),
    );
    await page.goto("/sign-up/details");
    await expect(page).toHaveURL(/\/sign-up(\?|$)/);
    expect(await page.evaluate(() => sessionStorage.getItem("sv_signup")), "the old progress").toBeNull();
  });

  test("a sign-in in another tab clears both keys in a tab already signed out; focus keeps them", async ({ page, context }) => {
    await tabWithProgress(page);

    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(await keys(page), "after focus and visibility").toEqual(["progress", "progress"]);

    const other = await context.newPage();
    await other.goto("/");
    // The tab's own channel: the message a sign-in or a sign-out in that tab posts.
    await other.evaluate(() => {
      const channel = new BroadcastChannel("sv-auth");
      channel.postMessage({ type: "signed-out", generation: null });
      channel.close();
    });
    await expect.poll(() => keys(page), { message: "both keys are gone" }).toEqual([null, null]);
  });
});

test.describe("blocked storage (U-10)", () => {
  test("the sign-up form says so and refuses to submit", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "sessionStorage", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
    const sends: string[] = [];
    page.on("request", (request) => {
      if (isApiRequest(request, "POST", SEND_CODE_PATH)) sends.push(request.url());
    });

    await page.goto("/sign-up");
    await expect(page.getByText(/Sunvibe needs cookies to keep you signed in/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send verification code" })).toBeDisabled();
    expect(sends, "send-code calls").toEqual([]);
  });
});
