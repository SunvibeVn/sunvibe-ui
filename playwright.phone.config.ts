import { defineConfig, devices } from "@playwright/test";

import { API_URL } from "./e2e/support/api";

const BASE_URL = "http://localhost:3000";

/**
 * The E2E specs of the phone channel (auth-email-access spec 6.5). The flag is inlined when the page is built, so these
 * runs start their own dev server, never a running one (`reuseExistingServer: false`), and the API must run in the same
 * mode: sunvibe-server scripts/dev/run-e2e-auth-api on (or legacy-login, for playwright.legacy.config.ts).
 */
export function phoneSuiteConfig(mode: "on" | "legacy-login") {
  return defineConfig({
    testDir: "./e2e/phone",
    ...(mode === "on" ? { testIgnore: ["legacy-login.spec.ts"] } : { testMatch: ["legacy-login.spec.ts"] }),
    fullyParallel: false,
    // The specs send real POSTs; the API rate limits are not raised for tests.
    workers: 1,
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
    use: {
      baseURL: BASE_URL,
      locale: "vi-VN",
      // A trace records request headers, and the Bearer token must never land in a file.
      trace: "off",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
      command: "npm run dev",
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      // Set here, never through a .env file: the browser calls the API directly.
      env: {
        NEXT_PUBLIC_API_URL: API_URL,
        NEXT_PUBLIC_AUTH_PHONE_MODE: mode,
      },
    },
  });
}

export default phoneSuiteConfig("on");
