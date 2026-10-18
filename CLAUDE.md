@AGENTS.md
Hub workflow and cross-repo rules below; their paths (docs/...) are relative to the hub, i.e. ../docs/... from here.
@../AGENTS.md

## Claude Code only
- Cursor is the main FE agent. When Claude works here, start with `claude --add-dir ..`.
- Implement from the handoff file in ../docs/features/<module>/<feature>/impl/ when one exists; read the brief,
  never edit it.
- Implementation with Superpowers subagent-driven-development: dispatch implementer tasks to the feature-implementer
  subagent (hub agent, loaded through --add-dir ..). It defaults to Sonnet high (pass no `model`). A **hard** task is
  dispatched with `model: opus`, effort high. Hard = the plan marks it `Implementer: high`, or the Superpowers
  "Model Selection" judgment finds it hard (concurrency, token or session handling, layered authorization, many
  files with integration or design judgment). Superpowers decides the difficulty; the only two combinations allowed
  are Sonnet high (default) and Opus high (hard); never Haiku, never below Sonnet high. If feature-implementer stops
  after two evidence-backed failures on a task, re-dispatch that task once with `model: opus`, effort xhigh (same
  prompt plus its report); if that also fails, stop and ask the owner.
- The skill's "Model Selection" section applies to feature-implementer only, within the two combinations above.
  Dispatch the per-task reviews, re-reviews and final review to code-reviewer with no `model` parameter (it keeps its
  Opus high agent file). Where the skill escalates to "a more capable model" (fix rounds 4-5, stuck implementer),
  re-dispatch feature-implementer with `model: opus`, effort xhigh instead.
- Before a PR: run the code-reviewer and security-reviewer subagents; fix Blocker and Major findings.
