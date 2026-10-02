# Notes for coding agents

Keep this file short: only what every agent needs on every task. Topic detail goes in
the relevant doc (a subproject's TROUBLESHOOTING.md, LESSONS.md and so on), with a
one-line cue under "Further docs" below.

## Worktrees

Put git worktrees in `.claude/worktrees/<name>` inside this repo, not beside
the clone:

```sh
git worktree add .claude/worktrees/<name> -b <branch>
```

The directory is in `.gitignore`. A new worktree has no `node_modules`, and the
pre-push hook (below) runs checks across every subproject. Run the full install
under "Installing check dependencies" in it before its first push, including the
push that publishes a new branch, or that push fails.

## Installing check dependencies

Root lint resolves imports across every subproject, so install them all, as CI does, before
you trust a lint failure (a missing `node_modules` looks like an unresolved import):

```sh
npm ci
npm ci --prefix gungen
npm ci --prefix deadvox
npm ci --prefix mobgen
npm ci --prefix deadvox/tools/lit-check   # for deadvox's lint:lit
```

Firefox and xvfb for deadvox's `test:browser:firefox`: see `.github/workflows/deadvox.yml`.

## Tests

More tests is not better QA; a test earns its place by catching a bug no other test
catches. So:

- Each test protects one specific behaviour or constraint, and its name says which. Don't
  add a near-duplicate case for comfort.
- Prefer targeted cases and covering arrays (every pair or triple of parameter values)
  over full cartesian products and long seed loops. Exhaustive sweeps go behind the
  project's sweep flag (gungen: `GUNGEN_SWEEPS`), and only if something runs that flag.
- Measure before adding or cutting: coverage classes show which cases exercise the same
  code; mutation testing (inject small bugs, see which tests catch them) shows which
  tests actually detect anything. A removal states what the test protected and which
  remaining test still catches it.
- Keep the default run fast and deterministic. A slow test gets split, or a timeout
  proportional to its work, never a flat generous one.

Detail and worked numbers: `gungen/PROJECT.md`, "Testing", and issue #113.

## Further docs

- Debugging deadvox, including seeing it without a display: `deadvox/TROUBLESHOOTING.md`.
- Lessons from past problems: `deadvox/LESSONS.md`.

## Before pushing

From the repository root, run `npm run ci` and `npm run test:site`. For a
subproject change, also run that project's CI checks before pushing (typecheck,
tests, and build; Gungen also runs `test:sweeps`, and Deadvox also runs
`test:ui-browser`). The installed pre-push hook runs the root checks; the root `prepare` script
configures Git to use `.githooks`. If the hook is not installed, run
`git config core.hooksPath .githooks`. Fix failures before pushing; do not use
`--no-verify` to bypass a real failure. It is for emergencies only.
