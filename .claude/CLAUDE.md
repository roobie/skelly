---
read_if:
  - you're Claude Code starting any task in this repository (loaded automatically)
---

@../AGENTS.md

# Notes for Claude Code

**REMEMBER to always RECORD the 'why'**

## Git: this project does not use `git-flow`

Don't use the `git-flow` skill or its driver here. Its single repo-wide pending
ticket can block every agent, and fresh worktrees need full installs before their
first push. Use plain git, following AGENTS.md:

- **Start a topic:** `git fetch origin`, then `git worktree add .claude/worktrees/<name> -b <branch> origin/main`, the installs under "Installing check dependencies", and `git push -u origin <branch>`.
- **While working:** commit in reasonable chunks and `git push`. To take in main, `git fetch origin && git merge origin/main`. Never rebase or force-push a published branch, and never bypass the pre-push hook with `--no-verify` to get past a real failure.
- **After BR merges the PR:** remove the worktree (`git worktree remove`) and delete the local branch; the lead does this.

Keep this copy aligned with `AGENTS.md` so either entry point gives the same git guidance.
