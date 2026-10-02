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

**Status:** draft for issue #149, written by the lead from git history, PR bodies,
SLICE-1.md "Results", the ADRs, the lead's memory notes and session transcripts.
Judgements the lead inferred rather than found stated are marked "(lead's inference)".
BR corrects this and adds their own view before it's final.

Slice 1 ran from 2026-09-25 (#5, the Slice 1 plan) to 2026-10-02: 132 merged PRs
in the repo, 62 of them deadvox, 40 gungen and 7 mobgen.

## Closure status

Open items from SLICE-1.md's Definition of done (tracked in #149):

- **1.9 saves** closes with #143 (d6): the current-build round trip and the size and
  load budgets in CI. ADR 0002 replaced the planned golden save with this round trip.
- **1.8 and 1.8.5** are merged (#41, #65) but have no status paragraph in SLICE-1.md.
- **Frame budget at night with every shambler active:** the benchmark exists
  (`?bench=shamblers`, SLICE-1 §1.7), but no reference-laptop result is recorded.
- **The playtest** has not run. 1.8's "players understand why they were woken" and
  the Definition of done both depend on it. BR decides whether it runs now or is
  carried into Slice 2.

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
| 1.8 Rest and sleep | interruption at most one step late; playtest confirms | #41; the playtest half is open |
| 1.8.5 Body regions | sever each limb, head-only death, survives save | #65 (pulled from Slice 3, design #61); physics #97 |
| 1.9 Saves | save → reload identical; golden save loads | ADR 0002 #46, steps #48, #50, #56, #62, #94, #131; closes with #143 |
| 1.10 Sound | missing ids fail; noise events emit sounds | #43; listening rounds #147 |
| 1.11 Playtest build | a playtester can play and send metrics | #123; debug loadout #124 |

Work that came in from later slices or from outside the plan:

- **Body regions and dismemberment** (1.8.5, BR 2026-09-29), with mobgen's severing
  and gore (#75) and rigid-body limb physics (#97).
- **mobgen** detailed zombies replaced the box shamblers (#54, #64, #66, #73, #75, #81, #89).
- **gungen as deadvox's gun source:** glTF export and a model entry (#79), the exported
  AR replacing `rifle_assault` (#82), then a long run of gungen work (Milestones 2 and 3,
  designs, archetypes, optics #139, handles #132, the revolver #138, the anti-materiel
  rifle #114 and #142).
- **Firearm handling** (ADR 0003, #133): ammunition and magazines with export fields
  (#145), the firing cycle (g35, in flight), and a debug handling range with saved
  spent-case piles (#148).
- **Melee depth:** first-person motion and hits at contact (#115), machete and Kabar
  (#130), the held item's primary action (#128).
- **The look workstream** (#104) and the lit-html UI port (ADR 0001, #22, #32–#36, #105).
- **Sounds** from BR's listening rounds on #101 (#147).

(lead's inference) Slice 1's core loop was finished early, around 2026-09-28; most of
the time after that went into depth (dismemberment, guns, look) that SLICE-1 lists as
out of scope. That was BR's choice each time, not drift, but it is why the playtest,
the slice's real exit test, still hasn't happened.

## 2. What worked

- **Decisions written before building.** ADR 0001 (lit-html), 0002 (saves) and 0003
  (firearm handling), plus gungen's ADR 0001 (calibre-driven sizing, #136). ADR 0002's
  exact-version refusal let saves skip migrations entirely, and it is why a golden save
  could be dropped for a current-build round trip.
- **Reference-laptop numbers, not guesses.** 1.0 picked the block size from measurement;
  1.1's first run failed the budget and the fix was found from the numbers (#8, #9). The
  d6 snapshot benchmark found Firefox's 1 ms timer clamp and was rebuilt to batch
  captures; the recorded p95 is 0.219 ms per capture against a 1 ms target.
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
  out in the full pool, and each got its own measured timeout raise. r4 (in flight)
  is meant to fix the cause once.
- **Host-only browser failures read as "not this branch".** primary-action timed out on
  this host for main and branch alike, so it was filed as a host problem. GitHub CI on
  #143 then showed a real race in the test (it clicked before the game had started),
  which d6's extra startup work exposed. The deadvox CI job also grew to about
  20 minutes before its steps were split and timed (#143).
- **Briefs that missed BR's intent.** The pump forend needed a screenshot and another
  round; the tubular bolt receiver (g33) was parked as "not good enough" after a full
  implementation round. (lead's inference) Both were visual design problems sent to
  coders as text specs, and an early rough view for BR might have caught them sooner.
- **Coders stalling after replies.** On 2026-10-01 coders read an answer that reopened
  their work, summarised it and stopped for about 30 minutes; the lead now checks every
  pane on each mail-watch re-arm.
- **The playtest kept slipping** behind more interesting feature work (lead's inference).

## 4. Changes for Slice 2 (proposals for BR)

1. **Run the Slice 1 playtest first**, or explicitly carry it, and plan Slice 2 from its
   findings, as SLICE-1's playtest plan says.
2. **Keep a "pulled forward" list in the slice plan**, so work from later slices is
   visible where the slice is planned and the exit criteria aren't quietly displaced.
3. **Budget the host:** disk per worktree, memory per agent and per browser, and the
   number of parallel heavy runs, written down in PROCESS.md and checked on each
   re-arm, rather than discovered at the limit.
4. **Treat GitHub CI as the browser-test judge** while the agent host is loaded; open a
   draft PR early so the hosted run starts sooner.
5. **For visual features, a cheap first look before the full round:** a screenshot or a
   rough model for BR to react to, then the engineering round.
6. **Fix the test pool once (r4)** and remove the per-test timeout raises.
7. **Slice exit as a checklist issue** from day one, like #149, not at the end.
