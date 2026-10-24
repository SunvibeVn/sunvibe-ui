import { defineConfig, devices } from "@playwright/test";

import { API_URL } from "./e2e/support/api";

const BASE_URL = "http://localhost:3000";

/**
 * E2E specs of the staff workspace (acquisition-owner-lead-queue-ui spec 5.8). Run with `npm run e2e:workspace`; they
 * need the local API on API_URL (dev profile), both E2E seeds loaded again just before the run (the specs change the
 * fixture leads and a territory) and the four E2E passwords exported (see e2e/workspace/support/staff.ts).
 *
 * One project per spec file, in the order the fixtures need: access, sale, leader, admin, survey. Each project depends on the
 * one before it, so Playwright runs them in that order whatever the file names (admin.spec.ts sorts first) and skips
 * the later ones when an earlier one fails (they would start on fixture data the earlier spec did not leave).
 */
export default defineConfig({
  testDir: "./e2e/workspace",
  fullyParallel: false,
  // Login 10/min, refresh 30/min per IP: one worker, never more (the limits are not raised for tests).
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
  projects: [
    { name: "access", testMatch: "access.spec.ts", use: { ...devices["Desktop Chrome"] } },
    { name: "sale", testMatch: "sale.spec.ts", dependencies: ["access"], use: { ...devices["Desktop Chrome"] } },
    { name: "leader", testMatch: "leader.spec.ts", dependencies: ["sale"], use: { ...devices["Desktop Chrome"] } },
    { name: "admin", testMatch: "admin.spec.ts", dependencies: ["leader"], use: { ...devices["Desktop Chrome"] } },
    { name: "survey", testMatch: "survey.spec.ts", dependencies: ["admin"], use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Set here, never through a .env file: the browser calls the API directly.
    env: {
      NEXT_PUBLIC_API_URL: API_URL,
    },
  },
});
