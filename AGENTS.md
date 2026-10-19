---
read_if:
  - you're an agent starting any task in this repository (always)
---

# Notes for coding agents

Keep this file short: only what every agent needs on every task. Topic detail goes in
the relevant doc (a subproject's TROUBLESHOOTING.md, LESSONS.md and so on), whose
`read_if` front matter says when to read it ("Further docs" below).

## Project stage: pre-pre-alpha, no backwards compatibility

At pre-pre-alpha, preserving old formats and behavior can obstruct simpler
changes, so we owe no backwards compatibility. Change formats, exports and
contracts freely when that makes the code simpler; don't add legacy paths, opt-in
flags, compat shims or migrations to keep old output or old data working, and
don't require byte-identical exports. What must still work: gungen exports a model
that deadvox validates and loads. Migration, especially of save games, starts
mattering at v1.0 beta.

Before writing or changing player-visible text, apply `deadvox/INTERFACE.md`, "Text".

## Jsonnet

The repository-wide authoring and conversion rule is `docs/jsonnet.md`.

## No host-specific information in tracked files

Tracked files must work for any clone and for CI. Do not commit local paths, private
addresses or host-service ports, or measurements and limits from this machine. Use
repository-relative paths, public URLs, environment variables for host locations and
page paths for review links.

Host operating facts belong in the lead's untracked `.agent-mail/HOST.md`, not in a PR.
Third-party files stay as received, including their metadata. See
`tools/zero-drift-check.mjs`, `checkHost`.

## Zero drift: code shows what and how, docs say why and when

The pillar and its reasons are in `PILLARS.md`, "Zero drift"; read `PILLARS.md` for
the other engineering pillars. When you write a doc,
a comment or a PR:

- Cue code by path and symbol ("see `<path>`, `<symbol>`"). No line numbers, and
  no lists, tables or values copied from code. A cited path is relative to the repo
  root, the doc's subproject root (`deadvox/`, `engine/`, `gungen/`, `mobgen/`) when relevant,
  or the doc itself. Cross-subproject cues use a repo-root path.
- Prose section cues use only a backticked path, comma and double-quoted name:
  `PILLARS.md`, "Zero drift". Bare paths, backticked names and numbered references
  fail: agents copy nearby examples, so alternate spellings undermine the rule.
  Markdown links with resolving heading anchors remain allowed. Names resolve to
  headings or bold lead-in labels; names in other file types must occur verbatim.
  Cue checks cover every tracked text file, not only docs. Scanner boundaries and
  their reasons belong in `docs/zero-drift-check.md`.
- A "when" names its trigger: an item ID or an issue. No "today", "currently" or
  "newly". When your PR completes an item, resolve every doc line that names it.
- The final reason goes in a tracked doc or ADR before the merge, not only in the PR,
  an issue or a commit message.
- Tracked docs state rules and reasons in plain words, without source attributions or
  timestamps. Keep the verbatim source quote and stamp in the commit message that adds
  or changes the rule, preserving provenance without turning the doc into a history log.
- Reviews, retros and superseded ADRs are not kept as files: git history holds them, so every
  tracked doc is a current record.
- Write a comment only for a special why.
- Every tracked doc starts with front matter whose `read_if` lists the reasons to read
  it. Add or update it whenever you add or change a doc.
- When you touch a doc, trim the whole part you touch of what, how and history, not
  only the lines you change. Keep the current rule instead of accumulated amendments.
  An amendment trail left in a touched section is a FIX because each section is a
  current record, not change history.
- Run one deep docs pass per slice at closure; Slice 3's trigger is the exit item on #293.
- A false doc is a defect: a review returns FIX for it.

## Work item IDs

Mint every new feature, round and review ID with `agent-work mint` (for example,
`agent-work mint d`, `agent-work mint d137` or `agent-work mint cr-d137-22`); never choose
one by hand. Mint checks the tracker and `.agent-mail/scratch/` to prevent collisions from
overwriting briefs and misrouting mail.

- **Feature:** `<subproject><number>` (`g` gungen, `d` deadvox, `m` mobgen, `r` repo-wide
  or docs), one PR on one branch; engine work uses the `g` prefix because gungen is the
  engine's only consumer. Numbers count up per subproject; new work always gets a new
  number, even when it grows out of another feature. PR titles end with the feature ID,
  e.g. `(g26)`.
- **Round:** each dispatched piece of work on a feature is a round and its mail item
  (`g26-1`, `g26-2`, …). The first round is `-1`; BR's feedback, review fixes or a
  main merge start the next round.
- **Review:** `cr-` plus the exact round reviewed; fixes after a review are the next round,
  so each review has one target. Existing letter-suffix IDs remain unchanged.

## Git workflow and worktrees

One topic branch per feature, in a worktree at `.claude/worktrees/<name>` from
`origin/main`, merged through a reviewed PR. Run the full install under "Installing check
dependencies" in a new worktree before its first push. Take in main by merging; never
rebase or force-push a published branch. The steps and their reasons are in
`docs/git-workflow.md`.

### Main checkout

**Lead note:** Leave the main checkout's untracked files alone; never clear them to satisfy a tool.

## Dependency age

- Covers adding or upgrading any project dependency or tool: npm packages in
  `package.json` or lockfiles, Python packages, project-work CLIs, and GitHub
  Actions versions in workflows.
- Use only versions released more than one month before they are added, avoiding
  bleeding-edge releases. Check the registry or release date, and name the version
  and date in the PR or report.
- If no version qualifies, stop and discuss with BR before installing.

## Installing check dependencies

Run `npm run setup` in each fresh worktree before its first push. The shared setup keeps
root lint from misreading missing dependencies as unresolved imports and installs the
pinned compiler required by `tools/jsonnet/compile.mjs`, `compileJsonnetSources`.

The projects are npm workspaces (`package.json`, `workspaces`), so one lockfile keeps
shared packages, `three` above all, on one version and one instance. Add a dependency
with `npm install <pkg> --workspace <name>`. `deadvox/tools/lit-check` stays a separate
install because its analyzer pins its own TypeScript.

Firefox and xvfb for deadvox's `test:browser:firefox`: see `.github/workflows/deadvox.yml`.

## Tests

Pre-pre-alpha, tests exist so we can change the game quickly and safely, not to freeze it.
More tests is not better QA; a test earns its place by catching a bug no other test catches.
So:

- Test behaviour and contracts that are costly to rediscover or that BR has ruled on:
  simulation rules, inventory and handling, save round-trip, and gungen exports that
  deadvox validates and loads. A bug fix gets a test that fails before the fix.
- **Never assert data that can drift during development.** That means content counts and
  lists, ids beyond the test's own fixture, exact coordinates or seeded outputs, hashes,
  fingerprints, tuning numbers and UI wording. Assert the property instead (validate
  reports 0 issues; every tree stands on the surface), or leave it un-asserted and record
  it in `docs/deferred-assertions.md` with how to check it and when to pin it.
- **Test hygiene is must-fix.** A test that does any of the following is fixed or removed
  in the same round, never deferred as a nit:
  - pins drifting data;
  - writes state past its owner, or sets state a player can't;
  - waits on wall-clock time for simulated work;
  - can pass vacuously;
  - near-duplicates another test.
- **No flaky tests.** A test that fails and then passes on a rerun is a flake. Fix it. If
  it cannot be made un-flaky, disable it from CI, investigate the cause and file an issue
  for its root cause; never retry until green or raise its timeout.
- Mutation proof is for tricky invariants only (ordering, reach, persistence, concurrency):
  show one mutant its test catches. Plain mappings and data-driven rows don't need one.
- Browser stages stay few: a handful of smoke flows plus the stages that must check
  pixels. A UI feature extends a flow rather than adding a stage, and any stage it does
  add gets its CI step in the same PR (a root contract test enforces this).
- Reviews return FIX only for a real defect or a test-hygiene problem. Style nits are
  listed, but never start a round.
- Each test protects one specific behaviour or constraint, and its name says which. Don't
  add a near-duplicate case for comfort.
- Prefer targeted cases and covering arrays (every pair or triple of parameter values)
  over full cartesian products and long seed loops. Exhaustive sweeps go behind the
  project's sweep flag (gungen: `GUNGEN_SWEEPS`), and only if something runs that flag.
- Measure before adding or cutting: coverage classes show which cases exercise the same
  code; mutation testing (inject small bugs, see which tests catch them) shows which
  tests actually detect anything. A removal states what the test protected and which
  remaining test still catches it, or, for drifting data, names its row in
  `docs/deferred-assertions.md`.
- Keep the default run fast and deterministic. A slow test gets split, or a timeout
  proportional to its work, never a flat generous one.

Detailed guidance: `gungen/PROJECT.md`, "Testing".

## Further docs

Every tracked doc's `read_if` front matter says why to read it. Use
`python3 tools/read_if.py` to list them or add terms to filter; the script also reports
missing front matter.

## Before pushing: tiered checks

Size each local run to the change. CI runs everything, in parallel and unbilled, on every
push to a PR, so don't repeat it locally.

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
