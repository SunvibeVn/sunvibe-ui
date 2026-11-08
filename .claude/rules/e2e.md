---
paths:
  - "e2e/**/*.ts"
  - "playwright.config.ts"
  - "playwright.workspace.config.ts"
  - "playwright.phone.config.ts"
  - "playwright.legacy.config.ts"
---
<!-- Generated from .cursor/rules/e2e.mdc by scripts/ai-config (sync); edit the source, then run sync. -->
- Four suites; do not add a fifth: npm run e2e (playwright.config.ts, every spec except e2e/workspace and e2e/phone),
  npm run e2e:workspace (playwright.workspace.config.ts, the staff workspace; projects run in the fixture order
  access -> sale -> leader -> admin), npm run e2e:phone and npm run e2e:legacy (playwright.phone.config.ts and
  playwright.legacy.config.ts, e2e/phone: the phone channel on, and legacy-login.spec.ts in legacy-login; they start
  their own dev server, because the mode is a build flag). The plan and the report name the suite a change needs.
- All need the local API (dev profile) at API_URL (e2e/support/api.ts) and the seed accounts. npm run e2e and the phone
  suites run on the auth run script of sunvibe-server (run-e2e-auth-api) in the matching mode (off, on, legacy-login),
  which also starts Mailpit (e2e/support/mailpit.ts) and writes the log the SMS codes are read from (e2e/support/sms-log.ts); e2e/phone
  changes the phone-only seed account, so run the seeds again before each phone suite. The workspace suite runs on
  run-e2e-media-api, because its survey photo specs need uploads and the processor; the workspace suite
  also needs the lead fixtures, loaded again just before the run (the owner runs the SQL; commands in
  sunvibe-server/AGENTS.md, "E2E seed accounts" and "E2E lead fixtures", outside the Cursor workspace). Passwords
  come from the E2E_* env vars, never from a file in the repo.
- Specs skip themselves when the API or the seeds are missing. A run with skipped specs is "not run", not a pass:
  report the skip count with the result.
- `next dev` hides what only a production server does (e2e/reset-link-address.spec.ts): tag such specs @production and
  run them with E2E_SERVER=production npm run e2e -- --grep @production. They need no API, because a production build
  refuses a non-https API URL. It is a switch of the main suite, not a suite of its own.
- One worker, no retries: the specs send real requests and the API rate limits (login 10/min, refresh 30/min per IP;
  a public send-code 5/h, which only a restart of the API resets) are not raised for tests. Count them in the spec
  header, and stub an answer when the case is about what the page does with it.
- Traces record request headers, including the Bearer token: every spec that signs in sets
  `test.use({ trace: "off" })` (as e2e/auth-session.spec.ts and e2e/staff-session.spec.ts do; the workspace suite
  keeps trace off in its config). Never commit, upload or share traces of signed-in specs.
- Locate by role, label or text (getByRole, getByLabel, getByText); wait for a state (expect(...).toBeVisible(),
  toHaveURL) instead of a fixed timeout; a fixed wait needs a comment that says why.
- A spec covers one user flow and names the acceptance criteria it proves (e.g. `W11-24`), like the existing specs.
- Each spec owns its data (seed fixture ids or data it creates); specs depend on each other only through the
  workspace projects' order.
- Adapted from ECC skills/e2e-testing (commit 76aaa77, MIT, Copyright (c) 2026 Affaan Mustafa); its parallel
  workers, retries and trace-on-retry examples do not apply here. Its CI upload applies to one job only: the CI job
  `e2e-production` runs the @production specs and uploads the Playwright report of a failed run (short retention). That
  report is public. The job's --trace off covers a spec that sets no trace, but a spec's own test.use wins over it, so
  a @production spec never sets trace to anything but off, sets no screenshot or video and starts no tracing itself.
  A failed assertion still records the page around it with its form values: a @production spec signs nobody in and
  types only throwaway values, never a credential or personal data. Open that artifact only from a run of reviewed code
  of this repo, never from a fork's pull request. See hub-docs/setup/AI_FLOW.md, "External sources".
