import { defineConfig, devices } from "@playwright/test";

import { API_URL } from "./e2e/support/api";

const BASE_URL = "http://localhost:3000";

/** E2E specs for the browser flows (C-FE-3). They need the local API on API_URL (dev profile). */
export default defineConfig({
  testDir: "./e2e",
  // The staff workspace specs run only through playwright.workspace.config.ts (npm run e2e:workspace).
  testIgnore: ["workspace/**"],
  fullyParallel: false,
  // The specs send real POSTs; stay well under the API rate limit (10 per window).
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    locale: "vi-VN",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Set here, never through a .env file: the page is gated and the browser calls the API directly.
    env: {
      NEXT_PUBLIC_OWNER_INTAKE_ENABLED: "true",
      NEXT_PUBLIC_API_URL: API_URL,
    },
  },
});
