@AGENTS.md
Hub workflow and cross-repo rules below; their paths (docs/...) are relative to the hub, i.e. ../docs/... from here.
@../AGENTS.md

## Claude Code only
- Cursor is the main FE agent. When Claude works here, start with `claude --add-dir ..`.
- Implement from the handoff file in ../docs/features/<module>/<feature>/impl/ when one exists; read the brief,
  never edit it.
