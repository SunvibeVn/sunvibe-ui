import { expect, test, type Page } from "@playwright/test";

// marketing-landing SV-250, EP-1 to EP-4 and R-3: the site's own 404 page. Status 404 and Next's noindex on every path;
// the first HTML is the Vietnamese page on every path (the root 404 is prerendered once and served for every unmatched
// URL), and under an English section the page switches to English after hydration, with no hydration error.
//
// Needs no API. Runs on `next dev`; the @production tests also run on a build:
// E2E_SERVER=production npm run e2e -- --grep @production. It signs nobody in and sends only the throwaway hint cookie.

/** The hint cookie (browser-cookies.ts): `__Host-` only on a production build. Its value is never checked on the server. */
const HINT_COOKIE = `${process.env.E2E_SERVER === "production" ? "__Host-" : ""}sv_signed_in=throwaway-generation`;
const HYDRATION_ERROR = /hydrat|Minified React error #(418|419|423|425)/i;

test.use({ trace: "off" });

/** Collects every console error and page error of the page; call before `goto`. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const hydrationErrors = (errors: string[]) => errors.filter((text) => HYDRATION_ERROR.test(text));

test("notFound_unknownPublicPath_brandedVietnamese @production", async ({ page }) => {
  const errors = watchErrors(page);

  const response = await page.goto("/khong-co-trang-nay");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Không tìm thấy trang" })).toBeVisible();
  await expect(page.getByText("Đường dẫn có thể không đúng, hoặc trang không còn trên Sunvibe.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
  await expect(page.getByText("This page could not be found")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page).toHaveTitle(/Không tìm thấy trang/);
  expect(hydrationErrors(errors)).toEqual([]);
});

test("notFound_englishSection_firstHtmlVietnamese_thenEnglish @production", async ({ page, request }) => {
  // The proxy sends a guest at /workspace/... to /login (spec U-15), so both parts send the hint cookie.
  const raw = await request.get("/workspace/no-such-page", { headers: { cookie: HINT_COOKIE } });
  expect(raw.status()).toBe(404);
  const html = await raw.text();
  // The English texts may sit in the page's RSC payload, never as the served heading.
  expect(html).toMatch(/<h1[^>]*>Không tìm thấy trang<\/h1>/);
  expect(html).not.toMatch(/<h1[^>]*>Page not found<\/h1>/);

  await page.setExtraHTTPHeaders({ cookie: HINT_COOKIE });
  const errors = watchErrors(page);

  const response = await page.goto("/workspace/no-such-page");

  expect(response?.status()).toBe(404);
  await expect(page.locator('[lang="en"]').getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  expect(hydrationErrors(errors)).toEqual([]);
});

test("notFound_closedPhoneRoute_english", async ({ page }) => {
  // The main suite runs with the phone channel off, so /login/phone answers notFound().
  const errors = watchErrors(page);

  const response = await page.goto("/login/phone");

  expect(response?.status()).toBe(404);
  await expect(page.locator('[lang="en"]').getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  expect(hydrationErrors(errors)).toEqual([]);
});

test("notFound_homeLink_goesHome", async ({ page }) => {
  await page.goto("/khong-co-trang-nay");

  await page.getByRole("link", { name: "Về trang chủ" }).click();

  await expect(page).toHaveURL(/\/$/);
});
