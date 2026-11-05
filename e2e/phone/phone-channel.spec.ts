import { expect, type Page, test } from "@playwright/test";

import {
  AUTH_E2E_SKIP_REASON,
  authE2eReady,
  CUSTOMER,
  expectSignedInAccount,
  isApiRequest,
  logOutButton,
  PHONE_ONLY,
  signIn,
  signInWith,
  submitLoginForm,
} from "../support/auth";
import { codeOf, isMailpitAvailable, MAILPIT_UNAVAILABLE_REASON, nextMailTo } from "../support/mailpit";
import { completeDetails, fillCode, newPassword, submitCode } from "../support/sign-up";
import { isSmsLogAvailable, nextSmsCode, SMS_LOG_UNAVAILABLE_REASON, smsLogPosition } from "../support/sms-log";

// The phone channel in a browser (auth-email-access spec 6.5, US-5), UI and API in `on` with the `log` SMS sender:
// sunvibe-server scripts/dev/run-e2e-auth-api on, then npm run e2e:phone. Each test makes its own account: a bind has a
// 60 s cooldown and a daily cap per user, kept in the database, so a shared account would tie the suites together.
//
// Budget of one run, per IP: 4 phone sign-ups (send-code 5 per hour), 1 SMS reset (5 per hour), at most 7 sign-ins over
// more than a minute (10 per minute).

// A trace records request headers, and the Bearer token must never land in a file.
test.use({ trace: "off" });
test.describe.configure({ timeout: 120_000 });

test.beforeEach(async () => {
  test.skip(!(await authE2eReady()), AUTH_E2E_SKIP_REASON);
  test.skip(!(await isMailpitAvailable()), MAILPIT_UNAVAILABLE_REASON);
  test.skip(!isSmsLogAvailable(), SMS_LOG_UNAVAILABLE_REASON);
});

const CONFIRM_BIND_PATH = "/api/v1/me/email/confirm-code";

/** A valid mobile number nobody used; a run never meets the last one's accounts or caps. */
const newPhone = (): string => `091${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;

const newAddress = (label: string): string => `e2e.${label}.${Date.now().toString(36)}@sunvibe.test`;

/** A whole phone sign-up, up to the signed-in account page. */
async function signUpByPhone(page: Page, phone: string, password: string): Promise<void> {
  await page.goto("/sign-up/phone");
  const position = smsLogPosition();
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page).toHaveURL(/\/sign-up\/verify$/);
  await submitCode(page, await nextSmsCode(position));
  await completeDetails(page, "E2E Phone Account", password);
}

/** The phone form on screen, up to the click on "Log in". */
async function submitPhoneLogin(page: Page, phone: string, password: string): Promise<void> {
  await page.goto("/login/phone");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

async function signOut(page: Page): Promise<void> {
  await logOutButton(page).click();
  await expect(page).toHaveURL(/\/$/);
}

test("the public pages lead to the phone forms", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Log in with your phone number" })).toBeVisible();
  await page.goto("/sign-up");
  await expect(page.getByRole("link", { name: "Sign up with your phone number" })).toBeVisible();
  await page.goto("/forgot-password");
  await expect(page.getByRole("tab", { name: "Phone" })).toBeVisible();
});

test("phone sign-up, then phone and password", async ({ page }) => {
  const phone = newPhone();
  const password = newPassword();

  await signUpByPhone(page, phone, password);
  await expect(page).toHaveURL(/\/account\?phone=verified$/);
  await signOut(page);

  await submitPhoneLogin(page, phone, password);
  await expectSignedInAccount(page);
  await expect(page.getByText(phone)).toBeVisible();
});

test("a wrong password on the phone form keeps its own text", async ({ page }) => {
  await submitPhoneLogin(page, PHONE_ONLY.phone, "Not-the-password-1");
  await expect(page.getByText("Phone number or password is incorrect.")).toBeVisible();
});

test("SMS reset sets a new password and signs in with it", async ({ page }) => {
  const phone = newPhone();
  const changed = newPassword();
  await signUpByPhone(page, phone, newPassword());
  await signOut(page);

  await page.goto("/forgot-password");
  await page.getByRole("tab", { name: "Phone" }).click();
  const position = smsLogPosition();
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Text me a code" }).click();
  await expect(page).toHaveURL(/\/reset-password\?via=sms$/);

  await fillCode(page, await nextSmsCode(position));
  await page.getByLabel("New password", { exact: true }).fill(changed);
  await page.getByLabel("Confirm new password").fill(changed);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page).toHaveURL(/\/login\?reset=success$/);

  await submitPhoneLogin(page, phone, changed);
  await expectSignedInAccount(page);
});

test("an account with both identifiers signs in by each of them", async ({ page }) => {
  if (!CUSTOMER.password) throw new Error(AUTH_E2E_SKIP_REASON);

  await signIn(page, CUSTOMER);
  await expect(page.getByText(CUSTOMER.email)).toBeVisible();
  await expect(page.getByText(CUSTOMER.phone)).toBeVisible();
  await signOut(page);

  await submitPhoneLogin(page, CUSTOMER.phone, CUSTOMER.password);
  await expectSignedInAccount(page);
  await expect(page.getByText(CUSTOMER.email)).toBeVisible();
});

test("a phone-only account binds an email and signs in with it", async ({ page }) => {
  const address = newAddress("bind");
  const password = newPassword();
  await signUpByPhone(page, newPhone(), password);

  // In `on` a phone account owes no email (spec 4.6), so the page offers it without asking.
  await expect(page.getByText("Add your email")).toHaveCount(0);
  await page.getByRole("link", { name: "Add email" }).click();
  await expect(page).toHaveURL(/\/account\/email$/);

  await page.getByLabel("Email", { exact: true }).fill(address);
  await page.getByLabel("Current password").fill(password);
  await page.getByRole("button", { name: "Send verification code" }).click();
  await submitCode(page, codeOf(await nextMailTo(address)));

  await expect(page).toHaveURL(/\/account\?email=bound$/);
  await expectSignedInAccount(page);
  await expect(page.getByText(address)).toBeVisible();
  // The state of the form stayed in its memory.
  expect(await page.evaluate(() => sessionStorage.length), "items in sessionStorage").toBe(0);
  await signOut(page);

  await signInWith(page, address, password);
});

test("switching accounts while the code step is open: no call goes out for the old account (U-8)", async ({ page, context }) => {
  const address = newAddress("switch");
  const password = newPassword();

  await signUpByPhone(page, newPhone(), password);
  await page.goto("/account/email");
  await page.getByLabel("Email", { exact: true }).fill(address);
  await page.getByLabel("Current password").fill(password);
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page.getByLabel("Digit 1 of 6")).toBeVisible();
  const code = codeOf(await nextMailTo(address));

  const confirms: string[] = [];
  page.on("request", (request) => {
    if (isApiRequest(request, "POST", CONFIRM_BIND_PATH)) confirms.push(request.url());
  });

  // `/login` itself leaves for /account while the hint is set; this is the way in with the hint still there.
  const other = await context.newPage();
  await other.goto("/login?session=expired");
  await submitLoginForm(other, CUSTOMER);

  // The other sign-in reloads this private page: the step and its code are gone from memory.
  await expect(page.getByLabel("Digit 1 of 6")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Change your email" })).toBeVisible({ timeout: 20_000 });
  expect(confirms, "confirm-code calls").toEqual([]);
  expect(code.length).toBe(6);
});

test.describe("before hydration (U-9)", () => {
  test.use({ javaScriptEnabled: false });

  for (const path of ["/login/phone", "/sign-up/phone"]) {
    test(`the server-rendered form on ${path} cannot submit`, async ({ page }) => {
      await page.goto(path);
      const form = page.locator("form").first();
      await expect(form).toBeAttached();
      expect(await form.getAttribute("action"), `form action on ${path}`).toMatch(/^javascript:/);
      expect((await form.getAttribute("method")) ?? "", `form method on ${path}`).not.toMatch(/^get$/i);
    });
  }
});
