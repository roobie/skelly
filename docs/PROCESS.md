# How work gets done in skelly

The working process, kept tight: what's done, how a change moves, and the rules that came out
of things going wrong. It grows by one line when a mistake repeats, and it shrinks when a rule
stops earning its place. The code-quality pillars are in `README.md`, and worktree and
install conventions are in `AGENTS.md`. This file doesn't repeat them.

## Who decides

- **BR** owns the project: rules on design, judges by eye, ear and feel, and merges.
- **The lead** (a Claude Code session) writes specs, dispatches work, checks reports against the
  spec, relays BR's verdicts, opens PRs and watches CI. It never merges or decides for BR.
- **Coders** build one item at a time. The **code reviewer** reviews their commits and advises
  the lead.

The agents work over agent mail. Their roles and protocol are in agent-kit's
`skills/agent-mail/TEAM.md` and `PROTOCOL.md`.

## The life of a change

1. **Spec:** one item, self-contained. Its proof uses absolute bounds (mm, degrees, ms), never
   bounds derived from the tuning under test.
2. **Branch:** `<subproject>/<topic>` from `origin/main`, in a worktree under
   `.claude/worktrees/` (`AGENTS.md`). Never commit to `main`.
3. **Build and prove:** every new test is shown failing before the fix. A report names the pushed
   commit and says whether the worktree is clean.
4. **Spec check, then code review:** the lead checks the report against the spec, then has the
   code reviewer review the commit. The lead forwards the must-fix and should-fix findings it
   accepts.
5. **BR's verdict:** anything judged by eye, ear or feel waits for BR (below). This runs in
   parallel with the code review.
6. **PR:** the lead opens it with a description that stands on its own and watches CI. BR merges.
7. **Clean up after the merge:** remove the worktree, stop its dev server, and delete the remote
   branch.

## Done, per subproject

A change is done when its subproject's CI checks pass locally, the root checks pass, and BR has
approved anything visual. Install each worktree's check dependencies as CI does; see
`AGENTS.md`.

| Where | Checks (run as CI does) |
|---|---|
| Root, every change | `npm run ci` and `npm run test:site` (the installed pre-push hook runs both for pushes that update refs) |
| gungen | `typecheck`, `test:sweeps` (the normal suite plus the sweeps CI enables), `validate`, `check:designs`, `build`. Regenerate deadvox's exported models when the export changes |
| deadvox | `lint:lit`, `typecheck`, `test`, `test:ui-browser` (with `CHROME_BIN`), `test:browser:firefox` (under xvfb), `validate`, `build` (Vite also verifies the simulation fingerprint; `build` includes the favicon check) |
| mobgen | `typecheck`, `test:sweeps` (the normal suite plus the sweeps CI enables), `build` |

A plain `test` skips the sweeps that CI runs, which has turned main red before (#85). Use
`test:sweeps` wherever it exists.

## Reviews by eye and by play

- **Links use the LAN IP** (`http://192.168.9.38:<port>/…`), and dev servers are bound with
  `--host`. BR reviews from another machine.
- **gungen:** give a link per design with a `camera=` view (side, rear, rear-¾), from a stable
  review server pinned to the reviewed commit, not a coder's live worktree.
- **deadvox:** `?seed=<n>&debug=1`. Anything that saves needs HTTPS: through caddy on `:8443`.
- **Relay what BR said, in BR's words.** A verdict on one item never counts for another.

## Recording decisions

- **Small rulings** go inline, where the thing is specified: "Decided (BR, YYYY-MM-DD): …" in the
  subproject's `PROJECT.md`, `DESIGN.md` or `SLICE-*.md`.
- **Cross-cutting or format-defining decisions** get an ADR in `<subproject>/docs/decisions/`
  (e.g. deadvox 0002, saves).
- **Mail and chat are transport, not the record.** A ruling that only exists in a thread isn't
  recorded.

## Continuous consolidation

We refactor actively while pre-pre-alpha, against real change costs and the next
planned work, not a deletion target. [#159](https://github.com/roobie/skelly/issues/159)
is the ranked backlog; survey reports live beside each subproject's code.

- **Every brief and review:** name the ownership or duplicated decision worth
  consolidating, or say none. Name the old authorities, intended consumers and
  deliberate distinctions. Review the callers and secondary consumers, not only
  the new owner. Prove the risky boundary with a discriminating test or mutation;
  do not add near-duplicate tests for a larger count.
- **At slice start and exit:** the lead commissions a history-and-planned-change
  maintainability survey for each subproject. Use the `maintainability-review`
  method: checks first, ranked and refutation-tested findings, stable IDs, and
  explicit disposition of earlier findings. An exit survey may serve as the next
  start survey if its base and next-change assumptions still hold; record reuse
  and inspect the intervening delta. A recurring smell or a repeated boundary
  failure triggers a targeted survey, not automatically another full survey.
- **Decide and date:** the lead records each finding's owner, rationale, scope,
  affected milestone and decision: do separately, fold into named work, defer,
  or drop. Every open owned finding has an actual calendar revisit date, including
  folded and deferred work; a milestone name is not a date. On that date, record
  progress or a new decision and date. Done/drop records a dated disposition and
  evidence or reason; partial completion leaves the remaining scope open and
  dated. BR decides new scope and trade-offs.
- **One durable record:** #159 (or its linked issue) holds the finding and decision.
  The host-local work.db tracker enforces assignment dates and sends reminders
  after its approved cutover; until then the lead maintains and checks the dated
  issue entries. Mail is transport, not another backlog. A reminder prompts a
  decision; it does not complete, drop or reassign work automatically.
- **Capacity:** review each group of four newly dispatched advanced-coder feature
  IDs for named backlog work, aiming for at least one. Count each feature once,
  not its correction/review rounds; classify it as standalone, folded, or neither.
  A folded item counts only with a named, bounded backlog scope and proof. Record
  the split and explain a group with no such work. Also decide any due standalone
  finding explicitly: folded credits must not silently starve it. This is an
  attention check, not a claim that 25% of engineering time is refactoring.
- **Scope and proof:** use a separate PR for independently useful work; fold a
  refactor into the milestone that immediately exercises it when that gives the
  clearer boundary. Keep the refactor and feature distinguishable in commits or
  the report. State preserved behavior, deliberate changes and save/export
  identity effects. No compatibility shims or speculative shared frameworks.

Each delivery links its finding ID and records the base/tip, completed versus
remaining scope, named authorities retired and consumers unified, and additions,
deletions and net lines. Separate source, tests, docs, content and generated
snapshots; distinguish whole-delivery totals from refactor-only totals. If mixed
changes cannot be isolated, say so rather than estimate.

The slice retrospective reports findings opened, completed, partially completed,
carried and dropped; per-item line/site figures; review-caught defects, escaped
regressions and review/CI rework separately; and standalone/folded capacity counts
with their denominator. Distinguish a persistent finding from a reintroduced one.
For milestones said to be unblocked, record ready/start/review-ready/merge dates
and known waits; claim a speedup only with a defensible comparison. Unknown effort
or time saved stays unknown. Decide whether the cadence and capacity check earned
their cost, and date the next review.

## Working rules

- **Heavy runs:** serialize full suites, browser suites and builds with `flock -w 900 "$XDG_RUNTIME_DIR/skelly-heavy.lock" timeout 300 …` on a shared host; single-file tests, typecheck and lint stay unlocked. Why: agent-kit `skills/agent-mail/RESOURCES.md`.
- **Host admission:** keep 5 GiB free disk; stop new work on reserve or live memory-high breaches. Measured session/browser/worktree costs, effective caps and default-run budgets: [host-budget.md](host-budget.md).
- **Vitest pools:** all three projects share `testPool.ts` (40% available CPUs, file isolation). Don't raise a test timeout to mask pool contention; measured trade-offs and the two-core CI proof are in `docs/test-pool.md`.
- **Bound every run:** wrap long shell runs in `timeout 300` (300 seconds). Vitest timeouts are
  in milliseconds; a harness's own tool timeout may be in seconds or milliseconds, so check its
  schema. A browser script bounds each stage as well as the whole run. Mixing the units once
  turned a 4-minute limit into 67 hours, and the run hung for three hours before anyone noticed.
- **Units:** gungen uses 11.5 mm per u; deadvox and mobgen use metres and seconds.
- **Determinism:** seeded RNG only; no `Math.random` in simulation or generators.
- **Don't loosen a test to make room for a change.** Pin the new measured value as a documented
  expectation, so the next change to it is noticed.

## When main is red

Fixing it comes first: the smallest possible PR, with nothing else in it (e.g. #98). Work
already in flight can carry the same fix to get past its own checks, and it merges cleanly
once the fix lands.
