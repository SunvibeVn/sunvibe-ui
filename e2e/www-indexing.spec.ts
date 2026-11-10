import { expect, test } from "@playwright/test";

// W35a Task U1: merging to main deploys www.sunvibe.vn (SV-232), and only every other host is noindex with a test
// banner. A build with NEXT_PUBLIC_SITE_URL unset, as CI and Vercel production build it, keeps www as it was: no
// X-Robots-Tag, no banner, and robots.txt names the sitemap. Needs no API.
//
// Runs against a build: E2E_SERVER=production npm run e2e -- --grep @production

const BANNER = "Môi trường thử nghiệm của Sunvibe";

test.use({ trace: "off" });

test("wwwSite_robotsAndHeaders_unchanged @production", async ({ page, request }) => {
  const home = await page.goto("/");
  expect(home?.status(), "status of /").toBe(200);
  expect(home?.headers()["x-robots-tag"], "X-Robots-Tag of /").toBeUndefined();
  // The visible page only: the message itself travels with the others in the page data.
  await expect(page.getByText(BANNER)).toHaveCount(0);

  const robots = await request.get("/robots.txt");
  expect(robots.status(), "status of /robots.txt").toBe(200);
  expect(robots.headers()["x-robots-tag"], "X-Robots-Tag of /robots.txt").toBeUndefined();
  const rules = await robots.text();
  expect(rules).toContain("Disallow: /workspace");
  expect(rules).toContain("Sitemap: https://www.sunvibe.vn/sitemap.xml");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status(), "status of /sitemap.xml").toBe(200);
  expect(await sitemap.text()).toContain("<loc>https://www.sunvibe.vn/</loc>");
});
