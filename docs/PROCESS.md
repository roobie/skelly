---
read_if:
  - you dispatch, build, review or merge a change and need its steps
  - you maintain the slice checklist when milestone PRs merge
  - you record a decision by BR and need to know where it goes
  - you plan refactoring, a maintainability survey or a slice retrospective
  - you hit a working rule's situation (shared host, test pool, run bounds, units, CI cost)
  - you change Deadvox browser CI's browser installation or launch source
  - you apply BR's standing rules for visual work, playtest discoveries, review causes, test budgets or hosted-CI outages
---

# How work gets done in skelly

The working process, kept tight: what's done, how a change moves, and the rules that came out
of things going wrong. It grows by one line when a mistake repeats, and it shrinks when a rule
stops earning its place. The code-quality pillars are in `README.md`, and worktree and
install conventions are in `AGENTS.md`. This file doesn't repeat them.

## Who decides

- **BR** owns the project: rules on design, judges by eye, ear and feel, and merges.
- **The lead** (a Claude Code session) writes specs, dispatches work, checks reports against the
  spec, relays BR's verdicts, opens PRs, watches CI and merges under BR's grant (step 6). It
  never decides for BR.
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
   accepts. The review checks zero drift (`README.md`, "Zero drift") too:
   - a doc that restates code;
   - a "when" without a trigger, or one whose item is done;
   - a final reason left only in the PR;
   - a doc without `read_if`.

   A false doc is a defect, so it's a FIX.
5. **BR's verdict:** anything judged by eye, ear or feel waits for BR (below). This runs in
   parallel with the code review.
6. **PR:** the lead opens it with a description that stands on its own and watches CI. Before
   it merges, the PR resolves every doc line that names its item (`until <item>`, `with #<pr>`),
   and any reason that outlives it is in a tracked doc. The lead merges it under BR's grant.
   BR, 2026-10-03: "yes, until i revoke merge-rights you are granted merge-rights for PRs".
   That needs all of these:
   - a SHIP review;
   - green CI on the head commit;
   - a clean merge with main;
   - no BR gate left: a first look, an in-game approval or a "do not merge before" note.

   Otherwise BR merges. The grant covers docs PRs. Docs-only PRs get the zero-drift
   workflow too, so green CI on the head commit applies to them as well.
7. **Clean up after the merge:** remove the worktree, stop its dev server, and delete the remote
   branch.

## Slice checklist

The active slice checklist issue records milestone evidence and carried-forward
work; keeping it live prevents a parallel plan from drifting. Milestone PRs carry
`Slice-Milestone: <id>`, which `tools/slice-checklist.mjs`,
`milestonesFromPrBody`, reads. The merge workflow updates milestone status on
default-branch merges (`.github/workflows/slice-checklist.yml`, `tickMilestone`).
The lead reconciles cases the workflow cannot update, including fork merges and
cancelled runs. Slice 3's checklist is #293.

## Done, per subproject

A change is done when its subproject's CI checks pass locally, the root checks pass, and BR has
approved anything visual. Install each worktree's check dependencies as CI does; see
`AGENTS.md`.

| Where | Checks (run as CI does) |
|---|---|
| Root, every change | `npm run ci` and `npm run test:site` (the installed pre-push hook runs both for pushes that update refs) |
| gungen | `typecheck`, `test:sweeps` (the normal suite plus the sweeps CI enables), `validate`, `check:designs`, `build`. Regenerate deadvox's exported models when the export changes |
| deadvox | `lint:lit`, `typecheck`, `test`, `test:ui-browser` (with Playwright-managed Chromium), `test:browser:firefox` (under xvfb), `validate`, `build` (Vite also verifies the simulation fingerprint; `build` includes the favicon check) |
| mobgen | `typecheck`, `test:sweeps` (the normal suite plus the sweeps CI enables), `build` |

A plain `test` skips the sweeps that CI runs, which has turned main red before (#85). Use
`test:sweeps` wherever it exists.

## Reviews by eye and by play

- **Review references use page paths, never LAN addresses.** BR reviews from another machine; the team supplies the review origin outside tracked work items.
- **gungen:** give a page path per design with a `camera=` view (side, rear, rear-¾), from a stable
  review server pinned to the reviewed commit, not a coder's live worktree.
- **deadvox:** `/?seed=<n>&debug=1`. Anything that saves needs HTTPS (a secure context); the host notes say where
  it's served.
- **Relay what BR said, in BR's words.** A verdict on one item never counts for another.

## Slice decision rules

- **Visual work.** BR, 2026-10-06 06:56: “as for #2 -> yes tiny visual spike first”. A tiny visual spike gets BR's first look before the full engineering round. Once BR approves a look, record its preview page path, seed and camera with the work item. Use a page path, never a LAN address.
- **Playtest discoveries.** BR, 2026-10-06 07:01: “i agree on the refinements, but the labels themselves - are they well-designed? I mean, we could use just 'blocker' and 'not-blocker' and tag also with a slice or version tag”; BR, 2026-10-06 07:02: “yes, do so”. File every discovery as its own issue with exactly one of the `blocker` or `not-blocker` labels. A blocker also needs a `gate:*` label. When it is a prerequisite, name the milestone it blocks (for example, “blocks 3.x”). A slice cannot close while an open issue carries both `blocker` and that slice's gate.
- **FIX causes.** BR, 2026-10-06 07:04: “accept”. Every FIX verdict carries its `Cause:` line immediately after the `VERDICT:` line, using one or more of behavior, persistence, test hygiene, visual feedback and integration; SHIP verdicts carry no `Cause:` line. Tally causes at the retrospective.
- **Test-budget overruns.** BR, 2026-10-06 07:06: “p5 accept”. Profile the suite, make named cuts that each say what coverage they protected and which test still catches it, and record the result before closure. Measure with alternating back-to-back baseline and candidate runs. Raising a budget is BR's call.
- **Hosted-CI outages.** BR, 2026-10-06 07:09: “p6: accept”. Keep affected PRs open and report them as “blocked on hosted CI”. Checklist and milestone status stay open; nothing merges on local checks alone.

## Recording decisions

- A small ruling belongs beside the rule it governs in `PROJECT.md`, `DESIGN.md` or
  `SLICE-*.md`. State the current rule and its reason in the document's own voice.
- A cross-cutting or format-defining decision belongs in an ADR under
  `<subproject>/docs/decisions/`. Each ADR states one current decision and why; it
  does not accumulate amendments. When a decision changes, add an ADR with the next
  free number, delete the superseded ADR and repoint every reference. Name the
  superseded ADR in the changing commit message.
- Keep source quotations and timestamps out of tracked docs; preserve the source in
  the commit message that adds or changes the rule. Mail and chat carry rulings but
  do not record them. The reason that governs the current rule must be in a tracked
  doc before merge.

## Continuous consolidation

Refactor actively while pre-pre-alpha against real change costs and planned work,
not as a deletion target. [#159](https://github.com/roobie/skelly/issues/159) is
the ranked backlog. Review records stay in their working layer: code reviews in
PRs, maintainability and consolidation surveys in #159 or an issue linked from it,
and slice retrospectives as comments on the slice checklist issue (#293 for Slice 3).
The repository keeps no review or retrospective snapshots.

- **Every brief and review:** name the ownership or duplicated decision worth
  consolidating, or say none. Name the old authorities, intended consumers and
  deliberate distinctions. Review callers and secondary consumers, not only the
  new owner. Prove a risky boundary with a discriminating test or mutation; do not
  add near-duplicate tests for a larger count.
- **At slice start and exit:** commission a history-and-planned-change
  maintainability survey for each subproject. Use the `maintainability-review`
  method: checks first; ranked, refutation-tested findings; stable IDs; and
  explicit disposition of earlier findings. An exit survey may serve as the next
  start survey only when its base and next-change assumptions still hold; record
  reuse and inspect the intervening delta. A recurring smell or repeated boundary
  failure triggers a targeted survey, not automatically another full survey.
  Reports live in #159 or an issue linked from it, not in files.
- **At slice closure:** commission one deep docs pass, as tracked by the exit item
  on #293 and planned in r50. A recurring smell or repeated boundary failure can
  still trigger a targeted maintainability survey.
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

At slice closure, remove the plan after its live content has moved to current
owners. Record the retrospective as a comment on that slice's checklist issue or
a linked issue, not as a tracked file. Report findings opened, completed, partly
completed, carried and dropped; per-item line/site figures; review-caught defects,
escaped regressions and review/CI rework separately; standalone and folded counts
with their denominator; and whether each finding is persistent or reintroduced. For
milestones said to be unblocked, record ready, start, review-ready and merge
dates, plus known waits. Decide whether the cadence earned its cost and date the
next review. Keep unknown effort or time saved unknown.

## Working rules

- **Shared hosts:** follow the host notes: its heavy-run lock (one full suite, browser stage
  or build at a time), its free-disk floor and its memory admission. They live outside the
  repository (AGENTS.md, "No host-specific information in tracked files").
- **Vitest pools:** all three projects share `testPool.ts` (40% available CPUs, file isolation). Don't raise a test timeout to mask pool contention; measured trade-offs and the two-core CI proof are in `docs/test-pool.md`.
- **Bound every run:** wrap long shell runs in `timeout 300` (300 seconds). Vitest timeouts are
  in milliseconds; a harness's own tool timeout may be in seconds or milliseconds, so check its
  schema. A browser script bounds each stage as well as the whole run. Mixing the units once
  turned a 4-minute limit into 67 hours, and the run hung for three hours before anyone noticed.
- **Units:** gungen uses 11.5 mm per u; deadvox and mobgen use metres and seconds.
- **Determinism:** seeded RNG only; no `Math.random` in simulation or generators.
- **Don't loosen a test to make room for a change.** Pin the new measured value as a documented
  expectation, so the next change to it is noticed.
- **CI costs time, not money** (BR, 2026-10-02: "it's not _billed_ money"). The repository is
  public, so runners are free. Rank CI changes by wasted runs and time to green, and never cut
  checks to save money that isn't being spent.
- **Owned work needs a decision and a date.** BR, 2026-10-03: "I can have thousands of bugs
  assigned to me, but what if I don't address them?" An owned failure or finding is fixed,
  scheduled into a real slot, quarantined with a revisit date, or closed with a reason, and its
  age forces a re-decision.
- **Mechanize every follow-up** (BR, 2026-10-03): "we should consider in every assignment
  relation how we can mechanize the follow-up. Basic example: set a date, and add a timer unit
  that adds a message when a decision expired". The work tracker's revisit dates and sweep do
  this for team items. An issue carries its revisit date in its body.

## When main is red

Fixing it comes first: the smallest possible PR, with nothing else in it (e.g. #98). Work
already in flight can carry the same fix to get past its own checks, and it merges cleanly
once the fix lands.
