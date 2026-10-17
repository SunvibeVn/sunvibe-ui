@AGENTS.md
Hub workflow and cross-repo rules below; their paths (docs/...) are relative to the hub, i.e. ../docs/... from here.
@../AGENTS.md

## Claude Code only
- Cursor is the main FE agent. When Claude works here, start with `claude --add-dir ..`.
- Implement from the handoff file in ../docs/features/<module>/<feature>/impl/ when one exists; read the brief,
  never edit it.
- Implementation with Superpowers subagent-driven-development: dispatch implementer tasks to the feature-implementer
  subagent (hub agent, loaded through --add-dir ..). A plan task marked `Implementer: high` is dispatched with effort
  high; others keep the agent default (Opus medium). If feature-implementer stops after two evidence-backed failures
  on a task, re-dispatch that task once with effort xhigh (same prompt plus its report); if that also fails, stop and
  ask the owner.
- The skill's "Model Selection" section and its "always specify the model" rule do not apply here; the model comes
  from the agent file. Dispatch the per-task reviews, re-reviews and final review to code-reviewer, and never pass a
  `model` parameter (it overrides the agent's model). Where the skill escalates to "a more capable model" (fix
  rounds 4-5, stuck implementer), re-dispatch the same agent with effort xhigh instead.
- Before a PR: run the code-reviewer and security-reviewer subagents; fix Blocker and Major findings.
