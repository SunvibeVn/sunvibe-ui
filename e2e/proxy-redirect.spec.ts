import { expect, test } from "@playwright/test";

// SV-323: what src/proxy.ts does when Next itself runs it (auth-browser-session 4.8, BR-5). The unit tests call
// authProxy directly, and a page that renders says nothing of the proxy: a build that registers the proxy and never
// runs it would pass both. These read the proxy's own answers, the redirect and the Set-Cookie. Needs no API, signs
// nobody in.
//
// Run against a build: E2E_SERVER=production npm run e2e -- --grep @production. They hold on `next dev` too.

/** The hint cookie (browser-cookies.ts): `__Host-` only on a production build. Its value is never checked on the server. */
const HINT_COOKIE = `${process.env.E2E_SERVER === "production" ? "__Host-" : ""}sv_signed_in=throwaway-generation`;

test.use({ trace: "off" });

test("proxy_guestOnProtectedPath_redirectsToLoginWithNext @production", async ({ request }) => {
  const response = await request.get("/workspace/owner-leads?tab=mine", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  const location = new URL(response.headers()["location"], "http://localhost:3000");
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("next")).toBe("/workspace/owner-leads?tab=mine");
});

test("proxy_hintOnGuestOnlyPath_redirectsToAccount @production", async ({ request }) => {
  const response = await request.get("/login", { maxRedirects: 0, headers: { cookie: HINT_COOKIE } });

  expect(response.status()).toBe(307);
  expect(new URL(response.headers()["location"], "http://localhost:3000").pathname).toBe("/account");
});

test("proxy_legacySessionCookie_isExpired @production", async ({ request }) => {
  const response = await request.get("/", { maxRedirects: 0, headers: { cookie: "sv_at=throwaway" } });

  expect(response.status()).toBe(200);
  const setCookies = response.headersArray().filter((header) => header.name.toLowerCase() === "set-cookie");
  // "Contains", not "equals": on a page that renders, a production server (16.4.2 and 16.4.6 alike) sends the cookie a
  // second time without Max-Age, which this test does not pin. Reported with SV-323 as a finding of its own.
  expect(setCookies.map((header) => header.value)).toContainEqual(expect.stringMatching(/^sv_at=;.*Max-Age=0/i));
  // Next's own carrier of the proxy's cookies to the render never leaves the server.
  expect(response.headers()["x-middleware-set-cookie"]).toBeUndefined();
});
