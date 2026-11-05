import { expect, type Page } from "@playwright/test";

import { expectSignedInAccount } from "./auth";

// The steps a visitor takes through sign-up and the code boxes, shared by the email and the phone suites.

/** A password the sign-up accepts; unique, so a mail or a log can never be mistaken for another run's. */
export const newPassword = (): string => `Sv@${Date.now().toString(36)}aA1`;

/** Types the code into the six boxes. A box that holds a digit takes one more, so the first box is emptied first. */
export async function fillCode(page: Page, code: string): Promise<void> {
  const first = page.getByLabel("Digit 1 of 6");
  await first.clear();
  await first.fill(code);
}

/** The code step, as a visitor sees it: `Verify` then the details step. */
export async function submitCode(page: Page, code: string): Promise<void> {
  await fillCode(page, code);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
}

/** The last step of a sign-up, up to the signed-in account page. */
export async function completeDetails(page: Page, fullName: string, password: string): Promise<void> {
  await expect(page).toHaveURL(/\/sign-up\/details$/);
  await page.getByLabel("Full name").fill(fullName);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expectSignedInAccount(page);
}
