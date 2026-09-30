# Notes for coding agents

## Worktrees

Put git worktrees in `.claude/worktrees/<name>` inside this repo, not beside
the clone:

```sh
git worktree add .claude/worktrees/<name> -b <branch>
```

The directory is in `.gitignore`. Each worktree needs its own `npm install`
in the subprojects it runs.

## Before pushing

From the repository root, run `npm run ci` and `npm run test:site`. For a
subproject change, also run that project's CI checks before pushing (typecheck,
tests, and build; Gungen also runs `test:sweeps`, and Deadvox also runs
`test:ui-browser`). The installed pre-push hook runs the root checks; the root `prepare` script
configures Git to use `.githooks`. If the hook is not installed, run
`git config core.hooksPath .githooks`. Fix failures before pushing; do not use
`--no-verify` to bypass a real failure. It is for emergencies only.
