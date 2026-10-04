# Notes for coding agents

Keep this file short: only what every agent needs on every task. Topic detail goes in
the relevant doc (a subproject's TROUBLESHOOTING.md, LESSONS.md and so on), with a
one-line cue under "Further docs" below.

## Project stage: pre-pre-alpha, no backwards compatibility

We owe no backwards compatibility (BR, 2026-10-02). Change formats, exports and
contracts freely when that makes the code simpler; don't add legacy paths, opt-in
flags, compat shims or migrations to keep old output or old data working, and
don't require byte-identical exports. What must still work: gungen exports a model
that deadvox validates and loads. Migration, especially of save games, starts
mattering at v1.0 beta.

## Work item IDs

Every coordinated work item (agent mail `X-Item`, branch, PR) has an ID:

- **Feature:** `<subproject><number>`, one feature that becomes one PR on one branch.
  Subprojects: `g` gungen, `d` deadvox, `m` mobgen, `r` repo-wide or docs. Numbers
  count up per subproject. New work always gets a new number, even when it grows
  out of another feature. PR titles end with it, e.g. "(g26)".
- **Round:** each dispatched piece of work on a feature is a round, and the round
  is the mail item: `g26-1`, `g26-2`, … The first round is always `-1`; BR's
  feedback, review fixes or a main merge start the next one.
- **Review:** `cr-` plus the exact round reviewed: `cr-g26-1`, `cr-g26-2`. Fixes
  after a review are the next round, so each review has one target.

IDs from before 2026-10-02 used letter suffixes (`g25b`, `g29c`) and keep them.

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

- Shared-host admission, capacity and default-run budgets: `docs/host-budget.md`.

- Debugging deadvox, including seeing it without a display: `deadvox/TROUBLESHOOTING.md`.
- Lessons from past problems: `deadvox/LESSONS.md`.

## Before pushing: tiered checks

Size each local run to the change (BR, 2026-10-04). CI runs everything, in
parallel and unbilled, on every push to a PR, so don't repeat it locally.

- **While coding:** only the test files that cover what you touched, plus typecheck.
- **Before each push** (minutes, not tens of minutes):
  - the touched subproject's typecheck and unit suite;
  - `validate` if content or schema changed;
  - Lit if UI changed;
  - only the browser stage(s) that exercise the behaviour you changed, once each.
  - Build only if build config changed; Gungen `test:sweeps` only if the change is in a sweep's path.
  - The pre-push hook runs root `npm run ci` and `npm run test:site`. The root `prepare`
    script configures Git to use `.githooks`; if the hook is missing, run
    `git config core.hooksPath .githooks`.
- **CI** runs the full matrix, including Deadvox's whole `test:ui-browser`. Open a draft PR
  at a feature's first push, so every later push is checked. Cite the CI run instead of
  re-running stages locally, and fix a red job in the next push.
- **Mutation proof:** only where "Tests" calls for it (tricky invariants): one mutant,
  against that rule's own test file. Don't re-prove untouched rules.
- **Reviews:** don't re-run what CI covers. Run only the probes a specific claim needs,
  in one reused review worktree, installing only where a lockfile changed.

Fix failures before pushing; `--no-verify` is for emergencies only, never to bypass a
real failure. Merging still needs green CI.

**No local absolute paths in tracked files** (BR, 2026-10-03). This covers code,
tests, docs, review reports, content and credits. Never write a host path
(`/home/…`, `~/…`, `/run/user/1000/…`, `/tmp/…`). Use a path relative to the
repository root or to the file, a public URL for an external source, or an
environment variable for a host location, such as
`"$XDG_RUNTIME_DIR/skelly-heavy.lock"`. Untracked scratch and mail may use
absolute paths. **Don't modify third-party files** to meet this rule: they stay as
received, so paths embedded in their metadata (for example inside the
`mobgen/reference/*.blend` files) are out of scope.
