---
paths:
  - "e2e/**/*.ts"
  - "playwright.config.ts"
  - "playwright.workspace.config.ts"
---
<!-- Generated from .cursor/rules/e2e.mdc by scripts/ai-config (sync); edit the source, then run sync. -->
- Two suites, two configs; do not add a third: npm run e2e (playwright.config.ts, every spec except e2e/workspace)
  and npm run e2e:workspace (playwright.workspace.config.ts, the staff workspace; projects run in the fixture order
  access -> sale -> leader -> admin). The plan and the report name the suite a change needs.
- Both need the local API (dev profile) at API_URL (e2e/support/api.ts) and the seed accounts; the workspace suite
  also needs the lead fixtures, loaded again just before the run (the owner runs the SQL; commands in
  sunvibe-server/AGENTS.md, "E2E seed accounts" and "E2E lead fixtures", outside the Cursor workspace). Passwords
  come from the E2E_* env vars, never from a file in the repo.
- Specs skip themselves when the API or the seeds are missing. A run with skipped specs is "not run", not a pass:
  report the skip count with the result.
- One worker, no retries: the specs send real requests and the API rate limits (login 10/min, refresh 30/min per IP)
  are not raised for tests.
- Traces record request headers, including the Bearer token: every spec that signs in sets
  `test.use({ trace: "off" })` (as e2e/auth-session.spec.ts and e2e/staff-session.spec.ts do; the workspace suite
  keeps trace off in its config). Never commit, upload or share traces of signed-in specs.
- Locate by role, label or text (getByRole, getByLabel, getByText); wait for a state (expect(...).toBeVisible(),
  toHaveURL) instead of a fixed timeout; a fixed wait needs a comment that says why.
- A spec covers one user flow and names the acceptance criteria it proves (e.g. `W11-24`), like the existing specs.
- Each spec owns its data (seed fixture ids or data it creates); specs depend on each other only through the
  workspace projects' order.
- Adapted from ECC skills/e2e-testing (commit 76aaa77, MIT, Copyright (c) 2026 Affaan Mustafa); its parallel
  workers, retries, trace-on-retry and CI upload examples do not apply here. See hub-docs/setup/AI_FLOW.md,
  "External sources".
