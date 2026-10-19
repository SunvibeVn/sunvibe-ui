## What and why
Feature / fix:
Brief / spec / plan / FE handoff: sunvibe-hub/docs/features/<module>/<feature>/ (brief/, impl/)
Related PR (other repo):
FE tool for this run (Cursor / Claude Code; a switch had a checkpoint):

## Checklist
- [ ] npm run lint, typecheck, test and build pass locally
- [ ] Client generated from the committed contract of the handoff (FE-only change on the existing API: the committed
      contract) with npm run gen:api; npm run check:api-client passes
- [ ] E2E suite named in the plan passes with no skipped spec (npm run e2e / npm run e2e:workspace):
- [ ] Independent review (hub docs/setup/checklists/fe-review.md, ui-ux-review.md for pages) without open
      Blocker/Major; security review (security-review.md) by the triggers in hub docs/setup/AI_FLOW.md section 8
      (auth, users, ownership, roles, money, uploads, personal data)
- [ ] /update-docs run and hub docs PR opened
