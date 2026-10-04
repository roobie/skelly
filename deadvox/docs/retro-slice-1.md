---
id: deadvox::retro-slice-1
description: Retrospective for deadvox Slice 1 (the loot run), what was planned against what shipped, what worked, what hurt, and proposed changes for Slice 2
tags: [deadvox, retrospective, slice-1, process]
created: 2026-10-02
status: final
---

# Slice 1 retrospective

[[THIS is_grounded_by: ../SLICE-1.md]]
[[THIS is_grounded_by: ../EPIC.md]]
[[THIS is_grounded_by: ../../../docs/PROCESS.md]]

**Status:** final (BR accepted, 2026-10-03), for issue #149. The lead wrote it from git history, PR bodies,
SLICE-1.md "Results", the ADRs, the lead's memory notes and session transcripts.
Judgements the lead inferred rather than found stated are marked "(lead's inference)".
BR's closing remarks (#149, 2026-10-02) are in "BR's view" below. The general reviewer
checked it (cr-r3, 2026-10-03), and its corrections are folded in.

## BR's view

> Retrospective: effective application of team effort, and more tests≠better and a lot
> of sneak peeking of other/upcoming slices (which is OK in these early stages, but as we
> approach some form of v1/BETA we need to be more disciplined).

— BR on #149, 2026-10-02

So:
- **Effective application of team effort:** the parallel agent team (coders, a code
  reviewer, and a lead routing BR's verdicts) delivered the slice and a lot beyond it.
- **More tests ≠ better:** the "more tests is not better QA" policy (#121, #120) is a
  lesson to keep.
- **Sneak peeking at later slices** was fine at this stage, but it needs discipline as
  the project approaches v1/beta. Section 4, proposal 1 suggests how.

From 2026-09-25 (#5, the Slice 1 plan) through 2026-10-02 UTC, the repository merged
132 PRs across deadvox, gungen, mobgen, the site and process work.

## Closure status

State of SLICE-1.md's Definition of done (tracked in #149), as of 2026-10-03:

- **Frame budget at night with every shambler active:** met on the reference laptop
  (BR, 2026-10-02). p50/p95 16.4/17.2 ms at 10–50 shamblers, and 17.0/17.2 ms at 100 with
  1% of frames over 18 ms. At 100, ZombieSystem takes 8/11 ms, so headroom is thin there.
  Recorded in SLICE-1 Results by #152.
- **1.8 and 1.8.5** have their status paragraphs (#152).
- **1.9 saves** closes with #143 (d6): the current-build round trip and the size and
  load budgets in CI. ADR 0002 replaces the historical golden save with this round trip.
  Snapshot timing is checked separately on the reference laptop; CI doesn't gate it.
  BR's individual-capture observations on build `80644d1`, recomputed with the
  jitter-safe `+2r` bound, give Chromium true p95 < 0.4 ms and max < 0.7 ms, which meets
  the ≤ 1 ms p95 target. Firefox only bounds p95 at < 3 ms, which is inconclusive on its
  own. #143 has passed review and is waiting to be merged with current main.
- **The playtest** is carried to the end of Slice 3 (BR, 2026-10-02): "it's only by then
  we have the base game in place." Both 1.8's "players understand why they were woken"
  and the Definition of done's playtest item move with it. Recorded in SLICE-1 and EPIC
  by #152.

## 1. Planned against delivered

| Milestone | Done when (short) | Delivered |
| --- | --- | --- |
| 1.0 Scale measurement | results and the block-size decision in SLICE-1 | #6, 2026-09-25; 0.5 m blocks chosen |
| 1.1 Metres, half-metre blocks | reference-laptop run meets the frame budget | #7, then #8 fixed a meshing regression the first run exposed; #9 recorded the passing run |
| 1.2 Simulation core | compressed and live hours agree | #11 |
| 1.3 Content v2 | `validate` covers every kind; broken refs fail CI | #13 |
| 1.4 Items and inventory | grid placement, handling, stacking, nesting tests | #15 (design #14) |
| 1.5 The hamlet | order-independent generation; templates validate | #17; city stress test and culling #18 |
| 1.5.5 Item models | validator catches missing models and unlisted assets | #16 (plan), #19, #20, #24 |
| 1.6 Survival | needs, catch-up, food decay, death | #19 |
| 1.7 Shamblers | door behaviour, losing the player | #38, #40; BR approved in game 2026-09-27 |
| 1.8 Rest and sleep | interruption at most one step late; playtest confirms | #41; the playtest half is carried to the end of Slice 3 |
| 1.8.5 Body regions | sever each limb, head-only death, survives save | #65 (pulled from Slice 3, design #61); physics #97 |
| 1.9 Saves | save → reload identical; golden save loads | ADR 0002 #46, steps #48, #50, #56, #62, #94, #131; closes with #143 |
| 1.10 Sound | missing ids fail; noise events emit sounds | #43; listening rounds #147. SLICE-1 still lists sound follow-ups and the noise → positional-sound scenario proof as carried forward |
| 1.11 Playtest build | a playtester can play and send metrics | #123; debug loadout #124; the playtest itself is carried to the end of Slice 3 |

Work that came in from later slices or from outside the plan:

- **Body regions and dismemberment** (1.8.5, BR 2026-09-29), with mobgen's severing
  and gore (#75) and rigid-body limb physics (#97).
- **mobgen** detailed zombies replaced the box shamblers (#54, #64, #66, #73, #75, #81, #89).
- **gungen as deadvox's gun source:** glTF export and a model entry (#79), the exported
  AR replacing `rifle_assault` (#82), then a long run of gungen work (Milestones 2 and 3,
  designs, archetypes, optics #139, handles #132, the revolver #138, the anti-materiel
  rifle #114 and #142).
- **Firearm handling** (ADR 0003, #133): ammunition and magazines with export fields
  (#145), the AK and AR firing cycle with an AR receiver built around a real breech
  (#154, reviewed but not yet merged), a debug handling range with saved spent-case piles (#148), and gunshot audio
  from BR's own csound synthesis (d18, in flight).
- **Melee depth:** first-person motion and hits at contact (#115), machete and Kabar
  (#130), the held item's primary action (#128).
- **The look workstream** (#104) and the lit-html UI port (ADR 0001, #22, #32–#36, #105).
- **Sounds** from BR's listening rounds on #101 (#147).

By 2026-09-28, the hamlet, inventory, survival, shamblers, rest and first audio had
merged. Storage followed on 2026-09-30 (#94) and autosave/Continue on 2026-10-02 (#131);
saves closure still waits on #143. In parallel, the team pulled forward body regions,
firearms and more visual work. BR calls this "sneak peeking", acceptable at this stage,
and moved the first real playtest to the end of Slice 3, because the base game will be
in place then.

## 2. What worked

- **Decisions written before building.** ADR 0001 (lit-html), 0002 (saves) and 0003
  (firearm handling), plus gungen's ADR 0001 (calibre-driven sizing, #136). ADR 0002's
  exact-version refusal let saves skip migrations entirely, and it is why a golden save
  could be dropped for a current-build round trip.
- **Reference-laptop numbers, not guesses.** 1.0 picked the block size from measurement;
  1.1's first run failed the budget and the fix was found from the numbers (#8, #9).
  The d6 snapshot benchmark ran into Firefox's 1 ms timer clamp. It was first rebuilt to
  batch captures (0.219 ms per capture, p95). Review then showed that a batch mean hides
  the per-frame tail: a reported 0.55 ms could hide a true 8 ms. Both browsers also jitter
  their timers. The final measure reports individual captures with jitter-aware bounds
  (observed + 2 × the timer quantum), and it refuses to bound a clock coarser than the
  quantum it knows. The lesson: a benchmark's statistic has to match the budget's
  statistic, and its error bound has to be justified, not assumed.
- **Independent code review with reproductions.** From 2026-09-30, a dedicated reviewer
  agent reviewed coder work independently before PRs. Examples of the defects it
  reproduced: a failed JSON upload hidden
  behind a green button (cr-g37-2), cartridges lying along the wrong axis and an
  impossible magazine fit (cr-g34), each shown with a failing reproduction and a
  mutation check that the fix's test catches the bug.
- **Saved simulation versus presentation.** The source fingerprint (#56, #62, #71) with
  canaries both ways kept render-only code (flying cases, scatter, audio placement) out
  of save identity without anyone having to remember the rule.
- **Policies that removed work.** "The maintainable choice wins" (#77), "more tests is not
  better QA" (#121, #120), and "no backwards compatibility while pre-pre-alpha" (#140),
  which removed byte-identical exports as a requirement, so g36 could delete
  compatibility-only code (#144).
- **Work item IDs** (#140, #141): one ID per feature across mail, branch and PR; rounds
  and reviews numbered from it.

## 3. What hurt

- **Host capacity.** The first host was too small: it thrashed swap with three coders,
  a reviewer, Vite servers and browser tests, and the team moved to a bigger host on
  2026-10-01. On the new host, disk ran out (ENOSPC around 04:10 on 2026-10-02, with
  about 16 worktrees at ~640 MB each). Later, a Chromium scope's memory peaked far
  outside the agents' intended caps; a scope drop-in now caps it. Memory budgets had
  been set during the migration, but their estimates and coverage hadn't been validated
  against these workloads. Disk headroom and scope membership need explicit checks as
  well as nominal limits.
- **git-flow's single repo-wide pending ticket** let one paused operation block every
  agent, and each topic's fresh worktree needed full installs before its first push. It
  was dropped on 2026-10-02 (#137); plain git since.
- **Test-pool contention.** The revolver watertight case in `revolverRules.test.ts` and
  deadvox's melee-reach sweep missed their deadlines in pooled runs but passed alone,
  and got measured 25 s and 10 s overrides. r4 (#153, not yet merged) brings in a
  measured worker policy (40% of CPUs, isolated forks) and removes those two overrides
  without cutting any cases. Its measurements show better heavy-case latencies; they
  don't establish that every timeout had the same cause.
- **A shared failure was dismissed too quickly as host-only.** primary-action failed on
  both local main and the branch. GitHub failures and later readiness diagnostics showed
  that a visible Go button wasn't enough to show the title was ready. #143 and #153 add
  readiness checks. The lesson: investigate the failed condition on both sides; "main
  fails too" isn't an explanation.
- **Slow CI.** The deadvox job grew to about 20 minutes, about 18 of them in the Chromium
  browser suite. In r5-1's Oct 1–2 sample, deadvox used 76.5% of runner-minutes. No
  superseded PR run was cancelled, and the relevant main pushes ran the full suite
  again. The repo is public, so this costs time-to-green, not money (BR).
- **Shared heavy lock held by aggregates.** One agent's 30-minute chained check held
  the heavy-run lock while three others queued. The rule is now one stage per lock hold,
  capped at 300 s.
- **PRs opened without a conflict check.** #151 had branched before #147 and #148
  merged, and conflicted in a shared test. BR found it, not the lead. Each PR is now
  checked against current main with `git merge-tree` before it's opened or relayed, and
  rechecked when main moves.
- **Briefs that missed BR's intent.** The pump forend needed a screenshot and another
  round; the tubular bolt receiver (g33) was parked as "not good enough" after a full
  implementation round. (lead's inference) Both were visual design problems sent to
  coders as text specs, and an early rough view for BR might have caught them sooner.
- **Coders stalling after replies.** On 2026-10-01 coders read an answer that reopened
  their work, summarised it and stopped for about 30 minutes; the lead now checks every
  pane on each mail-watch re-arm.
- **The playtest kept slipping** behind feature work, until BR carried it to the end of
  Slice 3, where the base game it needs exists.

## 4. Changes for Slice 2 (proposals for BR)

Each proposal names an owner and what shows it's done. These are proposals for BR,
except where a ruling is quoted.

1. **Scope: the lead; BR approves.** Before Slice 2 work starts, add a "pulled forward /
   carried forward" list to its plan, naming each item's source slice and its effect on
   the exit criteria. Pulling work forward stays BR's decision now; BR chooses the
   stricter gate to apply on the way to v1/beta.
2. **Host budget: the lead, with a designated tooling coder.** Before adding more
   parallel workers, record measured worktree, browser and agent peaks, a free-disk
   reserve, memory ceilings and the allowed number of heavy runs. Check those limits on
   each mail-watch re-arm, and stop admitting work when one is breached. (Recorded on
   2026-10-03; since 2026-10-04 they live in the host's notes, outside the repository.)
3. **CI: the lead proposes, BR selects, and an assigned coder proves it.** From r5-1, BR
   decided on 2026-10-03:
   - adopted: cancelling superseded PR runs, pruning Pages triggers, and the duplicate
     gungen test removal (r5-2);
   - piloting: isolated browser sharding, gated on a union-manifest check and same-SHA
     serial-versus-sharded runs (r7-1);
   - held: skipping browsers on draft PRs.
   Full main checks stay until equivalent integration evidence exists. Measure contract
   coverage, runner-minutes and ready-PR time-to-green before and after. Keep and
   investigate failures; skipped QA never counts as a saving.
4. **Visual work: the lead and the assigned coder; BR judges.** Get a rough screenshot or
   model, and BR's direction, before the full engineering round. Record the accepted
   reference in the work item. Visual rework goes to the advanced coders.
5. **Test quality: coder and reviewer** (BR: "more tests ≠ better"). Each new test names
   a distinct behaviour or constraint and shows that it catches its intended fault.
   Flagged sweeps need a named CI or scheduled consumer. The lead records a measured
   default-run budget before Slice 2, and checks #153 after it lands. Tuning the worker
   budget is no substitute for reviewing what a test is worth.
6. **Flakes: the lead assigns one owner per failure.** BR, 2026-10-03: "we shall not have
   them. If we can't make them un-flaky, we must disable them from CI and get to the
   bottom of _why_ they are flakes."
   - Keep the first failure and all rerun evidence; a later pass doesn't erase it.
   - Fix demonstrated nondeterminism. If a test can't be made deterministic, disable
     that exact test in CI, with an issue naming the owner, the root-cause
     investigation, the coverage lost and the proof needed to reinstate it.
   - Never retry until green, and never raise a timeout to hide a failure.
   - A timeout alone doesn't prove a test is flaky.
   The five red deadvox main runs from Oct 1–2 are being diagnosed (r6-1).
7. **Integration: the lead.** Check each PR against current main before opening or
   relaying it, and again when main changes. Record the tested base and the merge order
   for overlapping changes. A conflict-free merge-tree result is no substitute for the
   integration tests.
8. **Exit checklist: the lead; BR approves exceptions.** Open the slice's checklist issue
   with its plan, before implementation starts. Before closure, link the acceptance
   evidence and every explicitly carried-forward item.
