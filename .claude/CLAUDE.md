---
read_if:
  - you're Claude Code starting any task in this repository (loaded automatically)
---

@../AGENTS.md

# Notes for Claude Code

Git workflow is in `docs/git-workflow.md`.

If you are the lead, load the `role-lead` skill at session start and after every compaction,
before any other work. The skill lives in the lead's untracked team repo and is linked in
untracked, so a clone without that repo has no such skill.
