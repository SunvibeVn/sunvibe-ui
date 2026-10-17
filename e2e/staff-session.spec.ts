import { expect, test } from "@playwright/test";

import { API_URL } from "./support/api";
import { AUTH_E2E_SKIP_REASON, authE2eReady, captureBearer, expectSignedInAccount, SALE, signIn } from "./support/auth";

// A SALE calls /api/v1/staff/** with the browser session (auth-browser-session spec §10.3, S-22, W10-31).
// Sign-in budget: 1 sign-in in this file (6 per run with auth-session.spec.ts; limit 6).

// A trace records request headers, and the Bearer token must never land in a file.
test.use({ trace: "off" });

test.beforeEach(async () => {
  test.skip(!(await authE2eReady()), AUTH_E2E_SKIP_REASON);
});

test("a SALE signed in through /login reads its own leads, is refused all leads, and stays signed in", async ({
  page,
}) => {
  // The token of the app's own GET /api/v1/me after the sign-in; no app code exposes it.
  const bearer = captureBearer(page);
  await signIn(page, SALE);
  const token = await bearer;

  const statusOf = (scope: "mine" | "all") =>
    page.evaluate(
      async ({ url, accessToken }) =>
        (await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: "omit" })).status,
      { url: `${API_URL}/api/v1/staff/owner-leads?scope=${scope}`, accessToken: token },
    );

  expect(await statusOf("mine"), "GET /api/v1/staff/owner-leads?scope=mine").toBe(200);
  expect(await statusOf("all"), "GET /api/v1/staff/owner-leads?scope=all").toBe(403);

  await page.reload();
  await expectSignedInAccount(page);
});
