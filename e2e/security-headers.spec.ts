import { expect, test } from "@playwright/test";

// SV-323 (SEC-M3, SV-023): the headers of next.config.ts `headers()` as a running server sends them. The unit test of
// src/config/security-headers.ts checks the rules; how Next applies them (every matching rule, the later value of a
// header winning) is the framework's, so it is read here from the answers. Needs no API, signs nobody in.
//
// Run against a build: E2E_SERVER=production npm run e2e -- --grep @production. They hold on `next dev` too.

/** The hint cookie (browser-cookies.ts), so that the proxy lets a workspace page render. Its value is never checked. */
const HINT_COOKIE = `${process.env.E2E_SERVER === "production" ? "__Host-" : ""}sv_signed_in=throwaway-generation`;

test.use({ trace: "off" });

test("securityHeaders_publicPage_siteWidePolicy @production", async ({ request }) => {
  const response = await request.get("/");

  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["content-security-policy"]).toBe("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("securityHeaders_workspacePage_workspacePolicyReplacesSiteWide @production", async ({ request }) => {
  const response = await request.get("/workspace/owner-leads", { maxRedirects: 0, headers: { cookie: HINT_COOKIE } });

  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["content-security-policy"]).toBe(
    "frame-ancestors 'none'; img-src 'self' blob: data: https://tile.openstreetmap.org",
  );
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});
