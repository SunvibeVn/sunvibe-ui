import { defineConfig, devices } from "@playwright/test";

import { API_URL } from "./e2e/support/api";

const BASE_URL = "http://localhost:3000";

/** The specs tagged @production against a build (E2E_SERVER=production npm run e2e -- --grep @production): see their file. */
const productionServer = process.env.E2E_SERVER === "production";

/** E2E specs for the browser flows (C-FE-3). They need the local API on API_URL (dev profile). */
export default defineConfig({
  testDir: "./e2e",
  // The staff workspace specs run only through playwright.workspace.config.ts (npm run e2e:workspace), and the phone
  // specs only through playwright.phone.config.ts and playwright.legacy.config.ts (npm run e2e:phone, e2e:legacy).
  testIgnore: ["workspace/**", "phone/**"],
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
    command: productionServer ? "npm run build && npm run start" : "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI && !productionServer,
    timeout: productionServer ? 300_000 : 120_000,
    // Set here, never through a .env file: the page is gated and the browser calls the API directly.
    env: {
      NEXT_PUBLIC_OWNER_INTAKE_ENABLED: "true",
      NEXT_PUBLIC_AUTH_PHONE_MODE: "off",
      NEXT_PUBLIC_API_URL: API_URL,
    },
  },
});
