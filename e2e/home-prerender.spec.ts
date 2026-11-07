import { expect, test } from "@playwright/test";

// W33 Task G2 (auth-browser-session 4.4): / keeps a prerendered shell, and the parts that read the sign-in hint cookie
// stay inside Suspense, so the first response still carries the right header button. Needs no API.
//
// Only a build prerenders, so these run against one: E2E_SERVER=production npm run e2e -- --grep @production

/** The hint cookie of a production build (browser-cookies.ts); its value is never checked on the server. */
const HINT_COOKIE = "__Host-sv_signed_in=throwaway-generation";
const LOG_IN = 'aria-label="Log in"';
const ACCOUNT = '<span class="sr-only">Account</span>';

test.use({ trace: "off" });

test("/ is served from its prerendered shell @production", async ({ request }) => {
  const response = await request.get("/");

  expect(response.status()).toBe(200);
  // Set by Next only for a page with a prerendered shell; a page that turned dynamic loses it.
  expect(response.headers()["x-nextjs-prerender"], "x-nextjs-prerender").toBe("1");
});

test("the first response of / has the header button the hint cookie asks for @production", async ({ request }) => {
  const guest = await (await request.get("/")).text();
  expect(guest, "a visitor without the hint").toContain(LOG_IN);
  expect(guest, "a visitor without the hint").not.toContain(ACCOUNT);

  const signedIn = await (await request.get("/", { headers: { cookie: HINT_COOKIE } })).text();
  expect(signedIn, "a visitor with the hint").toContain(ACCOUNT);
  expect(signedIn, "a visitor with the hint").not.toContain(LOG_IN);
});
