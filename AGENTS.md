# Notes for coding agents

## Worktrees

Put git worktrees in `.claude/worktrees/<name>` inside this repo, not beside
the clone:

```sh
git worktree add .claude/worktrees/<name> -b <branch>
```

The directory is in `.gitignore`. Each worktree needs its own `npm install`
in the subprojects it runs.
