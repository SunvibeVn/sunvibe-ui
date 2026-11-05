import { expect, type Page, test } from "@playwright/test";

// U-6 (auth-email-access US-4 AC-2): the token of a reset link leaves the address bar at once and stays out of it. Needs no
// API: only what the page does with its address, with a throwaway value.
//
// `next dev` cannot show a failure here: the router's cache lookup that writes the first URL back only hits on a production
// server. So these specs also run against a build: E2E_SERVER=production npm run e2e -- --grep @production

const TOKEN = "throwaway-token-value";
const INVALID_LINK = "This link is invalid or has expired";

const storedToken = (page: Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("sv_reset") ?? "{}").token as string | undefined);

/** Opens a reset link; the page leaves for a new document, so what stands afterwards is that document. */
async function openLink(page: Page): Promise<void> {
  await page.goto(`/reset-password#token=${TOKEN}`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole("button", { name: "Set new password" })).toBeVisible();
}

test.use({ trace: "off" });

test("the token leaves the address bar and the tab keeps it @production", async ({ page }) => {
  await openLink(page);
  expect(await storedToken(page), "the token in this tab").toBe(TOKEN);
});

test("a reload finds nothing to move, so a cleared token stays cleared @production", async ({ page }) => {
  await openLink(page);

  await page.evaluate(() => sessionStorage.removeItem("sv_reset"));
  await page.reload();

  await expect(page.getByText(INVALID_LINK)).toBeVisible();
  expect(await storedToken(page), "the token after the reload").toBeUndefined();
});

test("Back never returns to the address with the token @production", async ({ page }) => {
  await page.goto("/login");
  await openLink(page);

  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
});

test("a second link in the same tab replaces the first one @production", async ({ page }) => {
  await openLink(page);

  await page.evaluate(() => {
    location.hash = "token=second-throwaway-value";
  });

  // The page leaves for a new document, so it is read once it stands.
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole("button", { name: "Set new password" })).toBeVisible();
  expect(await storedToken(page), "the new token").toBe("second-throwaway-value");
});

test("a token in the query is not read @production", async ({ page }) => {
  await page.goto(`/reset-password?token=${TOKEN}`);
  await expect(page.getByText(INVALID_LINK)).toBeVisible();
  expect(await storedToken(page), "the token").toBeUndefined();
});
