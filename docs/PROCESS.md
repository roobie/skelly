---
read_if:
  - you dispatch, build, review or merge a change and need its steps
  - you create or maintain a slice checklist, including surveys and milestone records
  - you record a decision by BR and need to know where it goes
  - you plan refactoring, a maintainability survey or a slice retrospective
  - you apply BR's standing rules for visual work, playtest discoveries, review causes, test budgets or hosted-CI outages
---

# How work gets done in skelly

This document owns roles, decision gates and slice coordination. Project principles are in
`README.md`; shared worktree, install and check rules are in `AGENTS.md`.

## Who decides

- **BR** owns the project: rules on design, judges by eye, ear and feel, and merges.
- **The lead** writes specs, dispatches work, checks reports against the spec, relays BR's
  verdicts, opens PRs, watches CI and merges under BR's grant (step 6). The lead does not decide
  design questions for BR.
- **Coders** build one item at a time. The **code reviewer** reviews their commits and advises
  the lead.

## The life of a change

1. **Spec:** one self-contained item. Its proof uses independent bounds, not values derived
   from the tuning under test.
2. **Branch:** `<subproject>/<topic>` from `origin/main`, in a worktree under
   `.claude/worktrees/` (`AGENTS.md`). Never commit to `main`.
3. **Build and prove:** every new test is shown failing before the fix. A report names the pushed
   commit and says whether the worktree is clean.
4. **Spec check, then code review:** the lead checks the report against the spec, then has the
   code reviewer review the commit. The review includes the principles section of
   `docs/principles-review-skill.md` and applies `README.md`, "Zero drift". The lead forwards
   accepted must-fix and should-fix findings. A false doc is a defect and a FIX.
5. **BR's verdict:** anything judged by eye, ear or feel waits for BR (below). This runs in
   parallel with the code review.
6. **PR:** the lead opens it with a description that stands on its own and watches CI. Before
   it merges, the PR resolves every doc line that names its item (`until <item>`, `with #<pr>`),
   and any reason that outlives it is in a tracked doc. The lead merges it under BR's grant.
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

The active checklist owns milestone evidence so parallel plans cannot drift.
`tools/slice-checklist.mjs`, `milestonesFromPrBody`, reads PR milestones; the merge
workflow updates statuses through `.github/workflows/slice-checklist.yml`, `tickMilestone`.
The lead reconciles cases the workflow cannot update. Slice 3's checklist is #293.

## Reviews by eye and by play

- **Review references use page paths, never LAN addresses.** BR reviews from another machine; the team supplies the review origin outside tracked work items.
- **gungen:** give a page path per design with a `camera=` view (side, rear, rear-¾), from a stable
  review server pinned to the reviewed commit, not a coder's live worktree.
- **deadvox:** `/?seed=<n>&debug=1`. Anything that saves needs HTTPS (a secure context); the host notes say where
  it's served.
- **Relay what BR said, in BR's words.** A verdict on one item never counts for another.

## Slice decision rules

- **Visual work.** Get BR's first look on a small visual spike before a full engineering round. Once the look is approved, record its preview page path, seed and camera with the work item. Use a page path, never a LAN address.
- **Playtest discoveries.** File each discovery separately with exactly one of the `blocker` or `not-blocker` labels. A blocker also needs a `gate:*` label; name the blocked milestone when it is a prerequisite. A slice cannot close while an open issue carries both `blocker` and that slice's gate.
- **FIX causes.** Every FIX verdict carries its `Cause:` line immediately after the `VERDICT:` line, using one or more of behavior, persistence, test hygiene, visual feedback, integration, docs (a zero-drift defect) and ownership (content-versus-code ownership); SHIP verdicts carry no `Cause:` line. Tally causes at the retrospective.
- **Test-budget overruns.** Profile the suite, make named cuts that say what coverage they protected and which test still catches it, and record the result before closure. Alternate back-to-back baseline and candidate runs. BR decides whether to raise the budget.
- **Hosted-CI outages.** Keep affected PRs open and report them as “blocked on hosted CI”. Checklist and milestone status stay open; local checks alone do not permit a merge.

## Recording decisions

- A small ruling belongs beside the rule it governs in `PROJECT.md`, `DESIGN.md` or
  `SLICE-*.md`. State the current rule and its reason in the document's own voice.
- A cross-cutting or format-defining decision belongs in an ADR under
  `<subproject>/docs/decisions/`. Each ADR states one current decision and why; it
  does not accumulate amendments. When a decision changes, add an ADR with the next
  free number, delete the superseded ADR and repoint every reference. Name the
  superseded ADR in the changing commit message.
- Mail and chat transport rulings; a tracked doc or ADR owns the current rule and its
  reason before merge.

## Continuous consolidation

Refactor against real change costs and planned work, not as a deletion target.
[#159](https://github.com/roobie/skelly/issues/159) is the ranked backlog. Keep code
reviews in PRs, surveys in #159 or a linked issue, and slice retrospectives on the
slice checklist issue.

- **Every brief and review:** name the ownership boundary or duplicated decision
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
  it, not in a repository file.
- **Decide and date:** the lead records each finding's owner, rationale, scope,
  affected milestone and decision: do separately, fold into named work, defer,
  or drop. Every open finding has a next revisit date in the agent-work tracker,
  including folded and deferred work; a milestone name is not a date. On that date,
  record progress or a new decision and date the next revisit. Done or dropped
  findings get a dated disposition and evidence or reason. Partial completion
  leaves the remaining scope open; a remedy PR merging or a revisit being recorded
  does not retire it. BR decides new scope and trade-offs.
- **One durable record:** #159 (or its linked issue) holds each finding, its owner,
  scope, decision and dated disposition history. The agent-work tracker alone holds
  its next revisit date. Each open finding has exactly one lead-issued reminder:
  a dated draft named for the finding ID and linked to #159, so it cannot be
  claimed as engineering work. Keep that reminder open through partial deliveries;
  retire it only when #159 records the finding done or dropped. Engineering rounds
  are separate tracker items that link back to the finding. Mail is transport, not
  another backlog; a reminder prompts a decision and does not complete, drop or
  reassign work automatically.
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
dates, plus known waits. Decide whether the cadence and capacity check are worth
their cost, then date the next review. Claim a speedup only with a defensible
comparison; keep unknown effort or time saved unknown.

## Owned work

An owned failure or finding needs an explicit decision: fix it, schedule it into a real
slot, quarantine it with a revisit date, or close it with a reason. Its age forces
reconsideration rather than silent accumulation.

The agent-work tracker owns each follow-up's next revisit date. Issue text records
decisions and dated history, not a second next-revisit date.

## When main is red

Fixing it comes first in the smallest separate PR. Work already in flight can carry the same
fix to get past its checks, and merges cleanly once the fix lands.
