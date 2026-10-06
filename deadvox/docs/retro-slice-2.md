---
read_if:
  - you're reviewing Slice 2 closure, its delivery, or its process lessons
  - you're planning Slice 3 from Slice 2's carried-forward work
  - you're applying BR's decisions on the Slice 2 retrospective's process proposals
---

# Slice 2 retrospective

[[THIS is_grounded_by: ../SLICE-2.md]]
[[THIS is_grounded_by: ../../../docs/PROCESS.md]]

**Status:** BR approved it on 2026-10-06 (#285), for issue #157. The Slice 2 plan, merged PRs, open PRs, issue #157, agent-work review records, and BR's dated transcript messages ground this retrospective. The checklist remains stale; the lead will update it at closure.

## BR's view

BR approved the plan's scope and steered its visual and playtest gates as the slice progressed. On 2026-10-03 at 13:04, after the tree first look, BR said: “Overall: happy with the trees, looks good.” At 17:03, on the forest run's foliage feel, BR said: “I'd say it's good enough!” On 2026-10-04 at 15:31, BR described the crafting panel as something “we're gonna need many iterations on it, but for now, I'll approve it”. On 2026-10-05 at 20:09, BR ruled “long actions disable all actions” and chose “fast forward” for time near shamblers. BR approved the hardware store and garage on 2026-10-05 after the window fixes.

The slice delivered its crafting, repair, salvage, lighting, building, sound, and tree systems, but its checklist, test-budget item and carried-forward links still need closure work. BR's in-game approvals were useful gates, not a substitute for implementation review or CI.

## Closure status

Status of the Definition of done in `deadvox/SLICE-2.md`:

- **Milestones:** 2.0–2.13 are merged. 2.10 (#241) and 2.11 (#258, stacked on #241) merged last: their CI was held up by the GitHub Actions incident, and they merged only after fresh green runs.
- **Frame budget and per-frame measurements:** the made-light benchmark passed on BR's reference laptop, as recorded in Results. BR's Firefox reference runs for the approved tree workload met the gate; the separate software-renderer observations are explicitly not treated as a pass. Reach rebuilds and crafting-panel planning have no reference-laptop measurement recorded in `deadvox/SLICE-2.md`, "Results", so that done-when item is still open. The default-test budget remains open: d87 (#289) split `snapshot.test.ts`, but the run is still over budget. BR chose to accept named cuts rather than raise the budget (2026-10-06, option "B"). d92 owns the cuts.
- **Reachability and sound:** the content validator's reachability checks and the noise-to-positional-sound scenario are delivered in #184, #177 and #250.
- **Playtest questions:** met. EPIC.md's playtest plan includes the questions SLICE-2.md adds.
- **BR's in-game approvals:** the crafting panel (#211), made lights (#252), and trees and hedges (#189) were approved.
- **Checklist:** issue #157 is still open and stale; its milestone boxes have not been updated for later delivery. The lead will update and close it with acceptance evidence and links to carried-forward work.
- **Carried-forward links:** still need to be listed on the checklist issue.
- **Retrospective:** this document. BR approved it on 2026-10-06 (#285).

## 1. Planned against delivered

| Milestone | Planned outcome | Delivery and status |
| --- | --- | --- |
| 2.0 Before code starts | Plan, host and default-test budgets, playtest questions, and checklist | Plan #156 and setup #166 merged. The checklist #157 was opened but not kept current. Its default-test budget is the subject of d87 and d92. |
| 2.1 Reach and options | Shared reach/options core and quick move | #173 merged. Quick move was pulled into this milestone with BR's approval; the interaction remained one ordinary timed move, not batch actions. |
| 2.2 Recipes as content | Validated recipe, skill, tool-quality and workstation references | #176 merged, including the F8 content-section descriptor. |
| 2.3 Reachability | World-grounded closure for ingredients and recipe prerequisites | #184 merged. Reachable teaching books, practice, qualities, and placed workstations became hard sources through later milestones. |
| 2.4 Planner and crafting | Saved long actions, work escrow, interruption/resume, and the first crafting panel | #211 merged and BR approved the panel as a first version, with further iterations expected. Rest and sleep joined the shared long-action owner. |
| 2.5 Skills, known recipes and books | Practice, recipe learning, and resumable reading | #231 merged. Books teach recipes; the planned four-book content shipped as part of the final content round. |
| 2.6 Wear and repair | Wear on melee weapons and worn clothing; repair as a saved long action | #230 merged. BR's later Slice 3 body model replaces the temporary torso hit rule. |
| 2.7 Disassembly and salvage | Declared yields, salvage lists, saved progress, and reachability | #234 merged. Salvage uses explicit content rather than reversing every recipe. |
| 2.8 Workbenches | Placed workstation qualities and craft-time effects | #239 merged, with a shed bench; the garage and hardware-store benches followed in 2.10. |
| 2.9 Light you make | Crafted lights, burn state, point-light pool, and reference workload | #252 merged and BR approved the in-game result and reference-laptop workload. Zombies sensing light and fire spread remained out of scope. |
| 2.10 Hardware store and garage | Two hamlet templates with benches and reachable stock | #241 merged after BR's look and review. The buildings gained window openings in response to the first look. |
| 2.11 Content | About 80 obtainable item types and reachable recipes | #258 merged, stacked on #241. Its validation report records that the planned content threshold and reachability checks pass, with no validation issues. |
| 2.12 Every noise is heard | Scenario proof in both directions between noise and positional sound | #177 and #250 merged; simulation-owned sound admission and its scenario test close the gate. |
| 2.13 Trees, a sneak peek | Trees and hedges, passable opaque foliage, rustle, and forest performance | #189 merged. Trees were pulled forward from Slice 4 at BR's request; the approved reference workload met its gate. |

Work pulled into Slice 2 included trees and hedges from Slice 4, plus quick move within 2.1. The checklist also records the carried-forward Slice 1 playtest and sound follow-ups; the playtest stays at the end of Slice 3, while the noise-to-positional-sound scenario became a Slice 2 gate.

The boundary with Slice 3 was porous during development. Aim sway and firearms skill (#262, d62), long-action input behavior (#263, d73), diegetic refusal sound (#261, d74), held-action behavior (#266, d77), shot impacts (#268, d78), shambler pursuit fixes (#269–#270, d79 and d81), debug input (#272, d82), the bounded skill scale (#274, d83), and the beeline behavior replacing route planning (#279, d84) arose from BR's playtests and were handled as separate work. The ready stance and aim sway were drawn from Slice 3; the beeline replaced the planned route-planning direction after observing shamblers in play. These are not Slice 2 exit gates, and their own plans and PRs own their proofs.

## 2. What worked

- **The plan made scope and evidence visible.** `deadvox/SLICE-2.md` separated milestones, save ownership, reachability, first looks, reference workloads, and carried-forward work. That let the slice accept BR-directed trees without treating unrelated follow-ups as hidden exit criteria.
- **First looks caught visual defects before closure.** BR's building review initially found the store and garage hard to distinguish; subsequent looks identified closed windows and then their height. The repair remained in template content. The trees and light workloads also had separate visual and reference-machine approvals.
- **One owner per simulation concept paid off.** `reach()` and `options()` replaced scattered queries; the long-action owner absorbed rest, sleep, craft, repair, disassembly, and reading; reachability was extended as new sources arrived. See `deadvox/src/core/reach.ts`, `reach`; `deadvox/src/core/options.ts`, `options`; `deadvox/src/core/longAction.ts`, `LongActions`; and `deadvox/src/core/reachability.ts`, `checkReachability`.
- **Review found concrete defects before landing.** The tracker records multiple review rounds on the persistent and UI-heavy milestones. The counts below are submitted review reports, reconstructed from agent-work records and saved review messages for early milestones. A FIX count means a review round returned FIX, not the number of sub-findings within that report.

| Milestone | Review rounds | FIX verdicts |
| --- | ---: | ---: |
| 2.0 | 3 (one on #156, two on #166) | 1 |
| 2.1 | 2 | 1 |
| 2.2 | 1 | 0 |
| 2.3 | 2 | 1 |
| 2.4 | 7 | 5 |
| 2.5 | 4 | 3 |
| 2.6 | 2 | 1 |
| 2.7 | 3 | 1 |
| 2.8 | 2 | 1 |
| 2.9 | 8 | 4 |
| 2.10 | 5 | 1 |
| 2.11 | 5 | 2 |
| 2.12 | 3 (one on #177, two on #250) | 1 |
| 2.13 | 3 | 1 |

The review rounds improved both code and evidence: examples include the non-vacuous loot assertion in #241, the two-pocket fixture for quickbar stowing in #258, and the stop/resume and saved-progress cases in the long-action work. Review count is not a quality score; it shows where first-round handoffs did not yet satisfy the contract.

## 3. What hurt

- **The checklist drifted from delivery.** Issue #157 was opened with the plan, but later milestone boxes and carried-forward links were not maintained. By closure, the issue no longer described the shipped state, so the team had to reconstruct status from PRs and work records.
- **Some milestones became long review chains.** The planner, books, lights, and final content had several FIX rounds. The underlying causes were not one class: persistence ownership and UI interactions, test hygiene, first-look defects, and integration each needed different corrections. A reviewer finding a test that passes vacuously or writes state outside its owner is preventing false confidence, not asking for more tests.
- **Parallel branches created integration and sequencing work.** #258 depended on #241, and both needed mainline integration. Their stacked relationship delayed Slice 2 closure and made review/CI state harder to interpret. Earlier base checks helped, but did not remove the need to merge and verify each current tip.
- **The measured default-test budget became a real constraint.** The 2.0 budget was explicit, and the run stayed over it even after d87's `snapshot.test.ts` split (#289). BR chose named cuts (d92) over a higher budget. Test-bar audits also removed vacuous or drifting assertions and fixed nondeterministic browser and unit cases; those are distinct from the budget work.
- **Coders sometimes stopped after receiving an answer.** The lead's wake prompt did not consistently make the next action explicit. Agent-kit #33/#34 changed the wake instruction to require priming, reading new mail, acting on it, and continuing the active item. This addresses the coordination mechanism rather than relying on repeated manual nudges.
- **Issue closure was missing from the merge steps.** BR found #134 still open on 2026-10-05 at 22:20. PR #175 cited it without a closing directive, and the lead closed #134, #183, #185 and #193. Treating issue closure as an explicit merge check would avoid leaving completed work attached to open issues.
- **A late review still found a player-trapping defect.** `cr-d73-1` returned FIX because a sleeper hit by an interrupt remained locked in sleep; d73-3 ended the sleep, cleared the interruption and restored input. `cr-d84-1` also returned FIX on beeline pursuit, which d84-2 corrected. These playtest-driven rounds are separate from the Slice 2 milestone counts.
- **Visual defects were expensive when discovered after implementation.** The building windows needed more than one look/fix cycle. That supports keeping the first-look gate for visual work, not skipping it to accelerate delivery.
- **The GitHub Actions incident blocked integration.** At 22:49 on 2026-10-05, the service was in a major outage again. Five reviewed PRs (#241, #258, #274, #283 and #282) were waiting only on CI. A review verdict is not a green CI run, and a cancelled or unavailable hosted run is not evidence that a PR passed.

## 4. Changes for Slice 3 (proposals for BR)

These are proposals for BR's decision, not settled process:

1. **Keep the checklist live.** The lead could update the checklist issue at each milestone's merge with its evidence and carried-forward links, then use it as the source for the closure retrospective.
   - **Decided (BR, 2026-10-06):** “accept” (06:54); on the mechanism, “yes, queue A” (06:56). See the “Slice checklist” section in `docs/PROCESS.md`.
2. **Keep visual first looks before full engineering.** For buildings, foliage, lights, and other appearance-driven work, a rough in-game view could be a prerequisite to the full round; record BR's approved reference with the work item.
   - **Decided (BR, 2026-10-06):** “as for #2 -> yes tiny visual spike first” (06:56).
3. **Make slice boundaries explicit for playtest discoveries.** BR could continue directing discoveries into separately tracked features, while the slice plan names which adjacent changes are prerequisites, dependencies, or explicitly outside its exit gates.
   - **Decided (BR, 2026-10-06):** “accept / every discovery must get tagged with slice-blocker or deferred-blocker or nice-to-have / if that rubric makes sense?” (06:58); the lead proposed two refinements (a deferred blocker names its gate; a slice blocker names its milestone where it's a prerequisite); “i agree on the refinements, but the labels themselves - are they well-designed? I mean, we could use just 'blocker' and 'not-blocker' and tag also with a slice or version tag” (07:01); the lead agreed, making `not-blocker` explicit so a missing label means untriaged, and requiring one `gate:*` label on a blocker; “yes, do so” (07:02).
4. **Pair review counts with fix causes.** A short category for each FIX round—behavior, persistence, test hygiene, visual feedback, or integration—could show whether briefs, ownership boundaries, or test design need improvement, without rewarding fewer reviews as an end in itself.
   - **Decided (BR, 2026-10-06):** “proposal 4: what's the overhead vs gain?” (07:04); the lead answered with the lightweight form: one `Cause:` line per FIX, several causes allowed, tallied only at the retrospective; “accept” (07:04).
5. **Close test-budget overruns with evidence.** The slice lead could ask the assigned owner to profile the default suite, remove redundant work without losing coverage, and record the resulting budget before declaring closure.
   - **Decided (BR, 2026-10-06):** “p5 accept” (07:06).
6. **Keep incident status separate from product status.** If hosted CI is unavailable at closure, the lead could leave the PRs open and report the blocked gate explicitly, then finish merge and checklist closure only after the required runs are green.
   - **Decided (BR, 2026-10-06):** “p6: accept” (07:09).

BR decided all six proposals on 2026-10-06. The standing rules are in `docs/PROCESS.md`; proposal 1's `Slice-Milestone:` mechanism is cued in its “Slice checklist” section.
