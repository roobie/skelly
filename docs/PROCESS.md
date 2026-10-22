---
read_if:
  - you build, review or merge a change and need its steps or merge checks
  - you create or maintain a slice checklist, including surveys and milestone records
  - you record a maintainer's decision and need to know where it goes
  - you plan refactoring, a maintainability survey or a slice retrospective
  - you apply the standing rules for visual work, playtest discoveries, review causes, test budgets or hosted-CI outages
---

# How work gets done in skelly

This document owns roles, decision gates and slice coordination. Project principles are in
`PILLARS.md`; shared worktree, install and check rules are in `AGENTS.md`. The rules hold for
any contributor and any clone; how a team staffs and runs the work stays out of this doc,
because that is local and changes on its own schedule.

## Who decides

- **The maintainer** owns the project: rules on design, judges by eye, ear and feel, and
  merges. The maintainer may grant a contributor the right to merge under the conditions in
  step 6.
- **Contributors** write specs and build changes, one item at a time. A contributor never
  decides a design question the maintainer has not ruled on.
- **Reviewers** review each change and advise whoever merges it.

## The life of a change

1. **Spec:** one self-contained item. Its proof uses independent bounds, not values derived
   from the tuning under test.
2. **Branch:** `<subproject>/<topic>` from `origin/main`, in a worktree under
   `.claude/worktrees/` (`AGENTS.md`). Never commit to `main`.
3. **Build and prove:** every new test is shown failing before the fix. The handover names the
   pushed commit and says whether the worktree is clean.
4. **Spec check, then code review:** the change is checked against its spec, then a reviewer
   reviews the commit. The review includes the principles section of
   `docs/principles-review-skill.md` and applies `PILLARS.md`, "Zero drift". The builder
   addresses accepted must-fix and should-fix findings. A false doc is a defect and a FIX.
5. **The maintainer's verdict:** anything judged by eye, ear or feel waits for the maintainer
   (below). This runs in parallel with the code review.
6. **PR:** its description stands on its own. Before it merges, the PR resolves every doc line
   that names its item (`until <item>`, `with #<pr>`), and any reason that outlives it is in a
   tracked doc. A contributor holding the maintainer's merge grant may merge it when all of
   these hold:
   - a SHIP review;
   - green CI on the head commit;
   - a clean merge with main and the merge checks below;
   - no maintainer gate left: a first look, an in-game approval or a "do not merge before"
     note.

   Otherwise the maintainer merges. The grant exists because the maintainer is often away,
   and waiting for the maintainer's merge stalled work that was otherwise done. It covers docs
   PRs. Docs-only PRs get the zero-drift workflow too, so green CI on the head commit applies
   to them as well.
7. **After the merge:** mark the PR's work items done, and close each issue it completed with
   a comment, since PRs cite issues without closing keywords. Tick the slice checklist where its
   workflow could not (below). Check main's push-only workflows, such as the pages deploy,
   because no PR run covers them. Remove the worktree, stop its dev server, and delete the
   remote branch.

## Merge checks

A clean `git merge-tree` result says no textual conflict, not that the merge is right. Each
check below catches a failure it misses.

- **When main moves,** re-check every open PR's merge with main, before opening it and again
  before calling it ready. A conflict goes back to the builder to merge main in.
- **Two open PRs touching one hunk:** decide which merges first and say so on both. Note a
  semantic conflict (a format one branch changes and the other uses) on both PRs, since
  neither merge shows it.
- **Trial merge** when both sides touched the same files, or when the PR last merged main
  before other merges landed: build the merge result in a detached worktree and run the
  subproject's typecheck and suite there. CI proves only the main it ran against; if a newer
  main merge touches the same area, ask for a fresh run.
- **Merge-loss scan** for a round that resolved a conflicted main merge. That the head equals
  its merge result proves nothing, because a wrong resolution is part of that result. For each
  file the PR touches, list main's added lines that `git diff main..<head>` deletes and main's
  deleted lines the head restores. A hit in JSON or a Tiled map is often formatting; confirm
  it with a semantic compare before calling it a loss.
- **Closing keywords** (`Closes`, `Fixes`, `Resolves`) in the PR body name only issues the PR
  completes, never another open PR. GitHub closes each target on merge, so a wrong target
  closes open work.
- **Save envelope version:** when a deadvox PR bumps `SAVE_SCHEMA_VERSION`, its value must
  exceed main's at merge. Two PRs bumping to the same number would otherwise give two
  envelopes one number. When to bump is in `packages/deadvox/docs/decisions/0002-saves.md`.
- **No rerun of a failed deadvox run:** its required check stays red after a failed attempt
  (`docs/browser-ci.md`). Comment the failure's disposition on the PR, then close and reopen
  it for a fresh run, so the PR records why the earlier failure doesn't count.

## Bound every run

Bound long shell and tool runs so a hung command cannot hold a machine or a contributor
indefinitely. Check whether a tool's timeout is in seconds or milliseconds, and keep each
stage's bound distinct from the whole-run bound.

## Slice checklist

The active checklist owns milestone evidence so parallel plans cannot drift.
`tools/slice-checklist.mjs`, `milestonesFromPrBody`, reads PR milestones; the merge
workflow updates statuses through `.github/workflows/slice-checklist.yml`, `tickMilestone`.
Whoever merges ticks by hand what the workflow cannot. Slice 3's checklist is #293.

## Reviews by eye and by play

- **Review references use page paths, never LAN addresses.** The maintainer reviews from
  another machine, so the review origin is supplied outside tracked work.
- **gungen:** give a page path per design with a `camera=` view (side, rear, rear-¾), from a
  stable review server pinned to the reviewed commit, not a contributor's live worktree.
- **deadvox:** `/?seed=<n>&debug=1`. Anything that saves needs HTTPS (a secure context).
- **Quote the maintainer's verdict verbatim.** A verdict on one item never counts for another.

## Slice decision rules

- **Visual work.** Get the maintainer's first look on a small visual spike before a full engineering round. Once the look is approved, record its preview page path, seed and camera with the work item. Use a page path, never a LAN address.
- **Playtest discoveries.** File each discovery separately with exactly one of the `blocker` or `not-blocker` labels. A blocker also needs a `gate:*` label; name the blocked milestone when it is a prerequisite. A slice cannot close while an open issue carries both `blocker` and that slice's gate.
- **FIX causes.** Every FIX verdict carries its `Cause:` line immediately after the `VERDICT:` line, using one or more of behavior, persistence, test hygiene, visual feedback, integration, docs (a zero-drift defect) and ownership (content-versus-code ownership); SHIP verdicts carry no `Cause:` line. Tally causes at the retrospective.
- **Test-budget overruns.** Profile the suite, make named cuts that say what coverage they protected and which test still catches it, and record the result before closure. Alternate back-to-back baseline and candidate runs. The maintainer decides whether to raise the budget.
- **Hosted-CI outages.** Keep affected PRs open and report them as “blocked on hosted CI”. Checklist and milestone status stay open; local checks alone do not permit a merge.

## Recording decisions

- A small ruling belongs beside the rule it governs in the subproject's owning doc or
  `SLICE-*.md`. State the current rule and its reason in the document's own voice.
- A cross-cutting or format-defining decision belongs in an ADR under
  `<subproject>/docs/decisions/`. Each ADR states one current decision and why; it
  does not accumulate amendments. When a decision changes, add an ADR with the next
  free number, delete the superseded ADR and repoint every reference. Name the
  superseded ADR in the changing commit message.
- Chat, messages and issue threads only carry a ruling; a tracked doc or ADR owns the
  current rule and its reason before merge. A review checks that the reason is in the doc,
  not only in the commit message.
- A docs PR records only what the maintainer decided. Proposals stay in the discussion
  issue, and a spec or note that mixes the maintainer's words with the writer's labels which
  is which, so an addition is never recorded as the maintainer's rule.

## Continuous consolidation

Refactor against real change costs and planned work, not as a deletion target.
[#159](https://github.com/roobie/skelly/issues/159) is the ranked backlog. Keep code
reviews in PRs, surveys in #159 or a linked issue, and slice retrospectives on the
slice checklist issue.

- **Every spec and review:** name the ownership boundary or duplicated decision
  worth consolidating, or say none. Name the old authorities, intended consumers
  and deliberate distinctions; review callers and secondary consumers, not only
  the new owner.
- **At slice start and exit:** the slice checklist tracks a history-and-planned-change
  maintainability survey for each subproject. Follow the `maintainability-review` skill
  and link its report from #159 or a linked issue. Reuse an exit survey only when its
  base and next-change assumptions still hold; inspect the intervening delta. A recurring
  smell or repeated boundary failure triggers a targeted survey, not automatically a full
  survey. Keep reports out of repository files.
- **At slice closure:** commission one deep docs pass, tracked by the exit checkbox
  on the slice checklist issue. Record its findings in #159 or an issue linked from
  it, not in a repository file. Each docs-pass PR body carries a cut ledger: one
  row for each rule, gate, choice or reason the pass removes from or moves out of
  a doc, naming where it lives now (a doc path and section, a code symbol, or
  "dropped" with the reason). The reviewer checks that each destination still says
  it, and a cut with no row is a FIX. Reviewers rebuilding cuts from the diff is
  how passes lost rules and approval owners; a row per cut makes each one
  checkable.
- **Decide and date:** each finding gets a recorded owner, rationale, scope,
  affected milestone and decision: do separately, fold into named work, defer,
  or drop. Every open finding has a next revisit date, including folded and
  deferred work; a milestone name is not a date. On that date, record progress or
  a new decision and date the next revisit. Done or dropped findings get a dated
  disposition and evidence or reason. Partial completion leaves the remaining scope
  open; a remedy PR merging or a revisit being recorded does not retire it. The
  maintainer decides new scope and trade-offs.
- **One durable record:** #159 (or its linked issue) holds each finding, its owner,
  scope, decision and dated disposition history. The work tracker alone holds its
  next revisit date, so no second date can go stale. A reminder prompts a decision
  and does not complete, drop or reassign work.
- **Capacity:** review each group of four new feature IDs for named backlog work,
  aiming for at least one. Count each feature once, not its correction/review
  rounds; classify it as standalone, folded, or neither. A folded item counts only
  with a named, bounded backlog scope and proof. Record the split and explain a
  group with no such work. Also decide any due standalone finding explicitly:
  folded credits must not silently starve it. This is an attention check, not a
  claim that 25% of engineering time is refactoring.
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
dates, plus known waits. Decide whether the cadence and capacity check are worth
their cost, then date the next review. Claim a speedup only with a defensible
comparison; keep unknown effort or time saved unknown.

## Owned work

An owned failure or finding needs an explicit decision: fix it, schedule it into a real
slot, quarantine it with a revisit date, or close it with a reason. Its age forces
reconsideration rather than silent accumulation.

The work tracker owns each follow-up's next revisit date. Issue text records decisions and
dated history, not a second next-revisit date.

## When main is red

Fixing it comes first in the smallest separate PR. Work already in flight can carry the same
fix to get past its checks, and merges cleanly once the fix lands.
