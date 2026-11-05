import { expect, test } from "@playwright/test";

import {
  AUTH_E2E_SKIP_REASON,
  authE2eReady,
  expectSignedInAccount,
  logOutButton,
  PHONE_ONLY,
  signInWith,
} from "../support/auth";
import { codeOf, isMailpitAvailable, MAILPIT_UNAVAILABLE_REASON, nextMailTo } from "../support/mailpit";
import { submitCode } from "../support/sign-up";

// The window for phone-only accounts (auth-email-access D4-1, US-3 AC-5), UI and API in `legacy-login`:
// sunvibe-server scripts/dev/run-e2e-auth-api legacy-login, then npm run e2e:legacy. It binds the seeded phone-only
// account, so run the seeds again before each run.

// A trace records request headers, and the Bearer token must never land in a file.
test.use({ trace: "off" });
test.describe.configure({ timeout: 120_000 });

test.beforeEach(async () => {
  test.skip(!(await authE2eReady()), AUTH_E2E_SKIP_REASON);
  test.skip(!(await isMailpitAvailable()), MAILPIT_UNAVAILABLE_REASON);
});

test("the public pages keep the window to themselves", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('a[href*="phone"]')).toHaveCount(0);
  await page.goto("/forgot-password");
  await expect(page.getByRole("tab")).toHaveCount(0);

  const signUp = await page.goto("/sign-up/phone");
  expect(signUp?.status(), "status of /sign-up/phone").toBe(404);
});

test("a phone-only account signs in, is asked to bind, binds, and its phone is refused afterwards", async ({ page }) => {
  if (!PHONE_ONLY.password) throw new Error(AUTH_E2E_SKIP_REASON);
  const address = `e2e.legacy.${Date.now().toString(36)}@sunvibe.test`;

  const submitPhoneLogin = async () => {
    await page.goto("/login/phone");
    await page.getByLabel("Phone number").fill(PHONE_ONLY.phone);
    await page.getByLabel("Password", { exact: true }).fill(PHONE_ONLY.password as string);
    await page.getByRole("button", { name: "Log in" }).click();
  };

  await test.step("BIND_EMAIL reaches /account/email (U-5)", async () => {
    await submitPhoneLogin();
    await expect(page).toHaveURL(/\/account\/email$/);
    await expect(page.getByRole("heading", { name: "Add your email" })).toBeVisible({ timeout: 20_000 });
  });

  await test.step("the account page asks the same", async () => {
    await page.goto("/account");
    await expect(page.getByText("Add your email")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: "Add email" }).first().click();
    await expect(page).toHaveURL(/\/account\/email$/);
  });

  await test.step("/verify-phone leaves for the account page (D4-10)", async () => {
    await page.goto("/verify-phone");
    await expect(page).toHaveURL(/\/account(\?|$)/);
    await page.goto("/account/email");
  });

  await test.step("the bind", async () => {
    await page.getByLabel("Email", { exact: true }).fill(address);
    await page.getByLabel("Current password").fill(PHONE_ONLY.password as string);
    await page.getByRole("button", { name: "Send verification code" }).click();
    await submitCode(page, codeOf(await nextMailTo(address)));
    await expect(page).toHaveURL(/\/account\?email=bound$/);
    await expectSignedInAccount(page);
    await expect(page.getByText("Your email is saved. Use it to log in from now on.")).toBeVisible();
  });

  await test.step("the phone is refused afterwards, the email works", async () => {
    await logOutButton(page).click();
    await expect(page).toHaveURL(/\/$/);
    await submitPhoneLogin();
    await expect(page.getByText("Phone number or password is incorrect.")).toBeVisible();

    await signInWith(page, address, PHONE_ONLY.password as string);
  });
});
