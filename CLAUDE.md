@AGENTS.md
Hub workflow and cross-repo rules below; their paths (docs/...) are relative to the hub, i.e. ../docs/... from here.
@../AGENTS.md

## Claude Code only
- Cursor is the main FE tool; Claude works here when the owner picks Claude for a run. Start with
  `claude --add-dir ..` (or the `claude` helper). The rules in .claude/rules are generated from .cursor/rules, so
  Claude and Cursor follow the same rules; edit the .mdc source, never the generated copy.
- Before writing code, make sure no other tool owns this checkout for the run (the hub flow run state or the owner
  says which). Taking over from Cursor: read its checkpoint (diff, open tasks, last check results) and continue from
  it; never discard or overwrite its changes.
- Feature work: this main session implements the FE part of the plan itself, from the FE handoff
  (../docs/features/<module>/<feature>/impl/YYYY-MM-DD-<feature>-fe-handoff.md; an FE-only change on the existing
  API has none and uses the committed contract), the latest spec and plan, the FE prompt and the generated
  client. Use superpowers:executing-plans ("Native") with
  superpowers:test-driven-development, on the run's branch, without a worktree unless the owner asks.
  feature-implementer is optional (legacy): only for one self-contained task the owner asks to delegate.
- Read the brief, never edit it; a missing or unclear one goes to the owner.
- Stop and report the exact conflict when handoff, spec, contract, plan, ADR or code disagree in a way that changes
  behavior, or when a task needs a business decision. After two evidence-backed failed attempts on one task, raise
  the effort once (`/effort xhigh`) with the evidence, then ask the owner.
- In a flow run (`claude -p` started by the hub scripts/flow): after two evidence-backed failed attempts stop and
  report both instead of raising the effort; the runner's review stage replaces the final review below; skip
  superpowers:finishing-a-development-branch and end with the report (the runner verifies, the owner pushes).
  Outside a flow run, finishing-a-development-branch never merges into the base locally; push and PR follow the repo
  rules (rebuild: G2 D-27 to D-29).
- Before "done": AGENTS.md "Before saying done" with superpowers:verification-before-completion.
- Independent review before the PR. Give each reviewer the diff range, the handoff, spec and plan paths, the
  decisions that apply and the checks you ran (they do not see this conversation): code-reviewer always (FE checklist
  ../docs/setup/checklists/fe-review.md, plus ui-ux-review.md for pages or shared components); security-reviewer by
  the triggers in ../docs/setup/AI_FLOW.md section 8 (auth, users, ownership, roles, money, uploads, personal data).
- This review replaces the final review of superpowers:executing-plans: dispatch the hub code-reviewer (and the
  triggered reviewers) without a model parameter, so each keeps its frontmatter model; read its Critical as Blocker
  and Important as Major. Fix every Blocker and Major test-first, or take it to the owner; a Ruling never declines
  one. After the fixes, the same reviewers review again.
- Model and effort are set when the session starts (../docs/setup/CLAUDE_MODEL_EFFORT_SETUP.md); never switch the
  model mid-session.
