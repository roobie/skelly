---
id: deadvox::retro-slice-1
description: Retrospective for deadvox Slice 1 (the loot run), what was planned against what shipped, what worked, what hurt, and proposed changes for Slice 2
tags: [deadvox, retrospective, slice-1, process]
created: 2026-10-02
status: draft
---

# Slice 1 retrospective (draft)

[[THIS is_grounded_by: ../SLICE-1.md]]
[[THIS is_grounded_by: ../EPIC.md]]
[[THIS is_grounded_by: ../../docs/PROCESS.md]]

**Status:** draft for issue #149. The lead wrote it from git history, PR bodies,
SLICE-1.md "Results", the ADRs, the lead's memory notes and session transcripts.
Judgements the lead inferred rather than found stated are marked "(lead's inference)".
BR's closing remarks (#149, 2026-10-02) are in "BR's view" below. The general reviewer
checks this draft before it's final.

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
  the project approaches v1/beta. Section 4, change 1 turns that into a rule.

Slice 1 ran from 2026-09-25 (#5, the Slice 1 plan) to 2026-10-02: 132 merged PRs
in the repo, 62 of them deadvox, 40 gungen and 7 mobgen.

## Closure status

State of SLICE-1.md's Definition of done (tracked in #149), as of 2026-10-03:

- **Frame budget at night with every shambler active:** met on the reference laptop
  (BR, 2026-10-02). p50/p95 16.4/17.2 ms at 10–50 shamblers, and 17.0/17.2 ms at 100 with
  1% of frames over 18 ms. At 100, ZombieSystem takes 8/11 ms, so headroom is thin there.
  Recorded in SLICE-1 Results by #152.
- **1.8 and 1.8.5** have their status paragraphs (#152).
- **1.9 saves** closes with #143 (d6): the current-build round trip, plus the size, load
  and snapshot budgets in CI. ADR 0002 replaced the planned golden save with this round
  trip. The snapshot budget (≤ 1 ms per frame, p95) is met in Chromium: individual
  captures give true p95 < 0.4 ms and max < 0.7 ms. Firefox's 1 ms timer only bounds
  p95 at < 3 ms, which is consistent but not conclusive. #143 has passed review and is
  waiting for a catch-up merge with main.
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
| 1.10 Sound | missing ids fail; noise events emit sounds | #43; listening rounds #147 |
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
  (#154), a debug handling range with saved spent-case piles (#148), and gunshot audio
  from BR's own csound synthesis (d18, in flight).
- **Melee depth:** first-person motion and hits at contact (#115), machete and Kabar
  (#130), the held item's primary action (#128).
- **The look workstream** (#104) and the lit-html UI port (ADR 0001, #22, #32–#36, #105).
- **Sounds** from BR's listening rounds on #101 (#147).

(lead's inference) Slice 1's core loop was finished early, around 2026-09-28. Most of
the time after that went into depth that SLICE-1 lists as out of scope: dismemberment,
guns and the look. That was BR's choice each time, not drift. BR calls it "sneak
peeking", acceptable at this stage. It is also why the playtest moved: the base game it
needs arrives in Slice 3.

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
- **Independent code review with reproductions.** From 2026-09-30 a reviewer agent
  reviewed every item before its PR. Today's examples: a failed JSON upload hidden
  behind a green button (cr-g37-2), cartridges lying along the wrong axis and an
  impossible magazine fit (cr-g34), each shown with a failing reproduction and a
  mutation check that the fix's test catches the bug.
- **Saved simulation versus presentation.** The source fingerprint (#56, #62, #71) with
  canaries both ways kept render-only code (flying cases, scatter, audio placement) out
  of save identity without anyone having to remember the rule.
- **Policies that removed work.** "The maintainable choice wins" (#77), "more tests is not
  better QA" (#121, #120), and "no backwards compatibility while pre-pre-alpha" (#140),
  which turned byte-identical exports from a requirement into an anti-requirement, so
  g36 could delete compatibility code (#144).
- **Work item IDs** (#140, #141): one ID per feature across mail, branch and PR; rounds
  and reviews numbered from it.

## 3. What hurt

- **Host capacity.** The first host (3.9 GB) thrashed swap with three coders, a
  reviewer, Vite servers and browser tests, and the team moved to a 19.5 GiB host on
  2026-10-01. On the new host, disk ran out (ENOSPC around 04:10 on 2026-10-02, with
  about 16 worktrees at ~640 MB each), and on 2026-10-02 a headless Chromium reached an
  11.4 GB peak. Chromium moves itself into its own systemd scope, outside the agents'
  3 GiB caps; it is now capped by a drop-in. (lead's inference) Each of these was found
  by running out, not by a budget planned beforehand.
- **git-flow's single repo-wide pending ticket** let one paused operation block every
  agent, and each topic's fresh worktree needed full installs before its first push. It
  was dropped on 2026-10-02 (#137); plain git since.
- **Test timeouts under the parallel pool.** At least three tests (the revolver
  watertight test, `revolverRules`, deadvox's melee-reach sweep) passed alone and timed
  out in the full pool, and each got its own measured timeout raise. r4 (#153) fixes the
  cause once: a shared worker policy (40% of CPUs, isolated forks), measured, with the
  raises removed and no cases cut.
- **Host-only browser failures read as "not this branch".** primary-action timed out on
  this host for main and branch alike, so it was filed as a host problem. GitHub CI on
  #143 then showed a real race in the test (it clicked before the game had started),
  which d6's extra startup work exposed.
- **Slow CI.** The deadvox job grew to about 20 minutes, about 18 of them in the Chromium
  browser suite. Since 2026-10-01 it has taken about three quarters of all runner
  minutes. No superseded PR run was ever cancelled, and every merge reran the full suite
  on main. The repo is public, so this costs time-to-green, not money (BR). r5 analyses
  it.
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

1. **Scope discipline that tightens toward v1/beta** (BR's point). Keep a "pulled
   forward" list in each slice plan, so work from later slices is visible and the
   slice's exit criteria aren't quietly displaced. Pulling forward stays acceptable
   now. From an agreed point on the way to v1/beta, it needs BR's explicit go per item.
2. **Budget the host:** disk per worktree, memory per agent and per browser, and the
   number of parallel heavy runs, written down in PROCESS.md and checked on each
   re-arm, rather than discovered at the limit.
3. **Make CI fast before making it busier:** adopt the measured, QA-preserving changes
   from r5 (likely: cancel superseded PR runs, skip drafts, split or shard the browser
   suite, stop double-running suites in Pages and gungen). Find out why 5 of 18 deadvox
   main runs failed before dropping any post-merge check.
4. **For visual features, a cheap first look before the full round:** a screenshot or a
   rough model for BR to react to, then the engineering round. Visual rework goes to the
   advanced coders.
5. **Keep "more tests ≠ better"** (BR): every test names what it protects; sweeps go
   behind flags; the default run has a time budget. Merge r4 (#153).
6. **No flaky tests** (BR, 2026-10-03): "we shall not have them. If we can't make them
   un-flaky, we must disable them from CI and get to the bottom of _why_ they are
   flakes." A flaky test is fixed or taken out of CI at once. A disabled one gets a
   tracking issue for its root cause; it's never retried until it passes, and its
   timeout is never raised to hide it.
7. **Check each PR against main before opening it**, and say the merge order when two
   open PRs touch the same code.
8. **Slice exit as a checklist issue** from day one, like #149, not at the end.
