---
read_if:
  - you're reviewing Slice 2 closure, its delivery, or its process lessons
  - you're planning Slice 3 from Slice 2's carried-forward work
---

# Slice 2 retrospective

[[THIS is_grounded_by: ../SLICE-2.md]]
[[THIS is_grounded_by: ../../../docs/PROCESS.md]]

**Status:** draft for BR, for issue #157. The Slice 2 plan, merged PRs, open PRs, issue #157, agent-work review records, and BR's dated transcript messages ground this retrospective. The checklist remains stale; the lead will update it at closure.

## BR's view

BR approved the plan's scope and steered its visual and playtest gates as the slice progressed. On 2026-10-03, after seeing the tree first look, BR said: “Overall: happy with the trees, looks good.” The next day, BR described the crafting panel as something “we're gonna need many iterations on it, but for now, I'll approve it”. After the forest runs on 2026-10-03, BR said: “I'd say it's good enough!” On 2026-10-05 BR's feedback on the handbook and long actions led to the ruling “long actions disable all actions”; for time near shamblers, BR chose “fast forward”. BR approved the hardware store and garage on 2026-10-05 after the window fixes.

The slice delivered its crafting, repair, salvage, lighting, building, sound, and tree systems, but its checklist, test-budget item, carried-forward links, and this retrospective still need closure work. BR's in-game approvals were useful gates, not a substitute for implementation review or CI.

## Closure status

Status of the Definition of done in `deadvox/SLICE-2.md`:

- **Milestones:** 2.0–2.9, 2.12 and 2.13 are merged. Milestones 2.10 and 2.11 have completed implementation and reached SHIP review verdicts, but their PRs remain open: #241 (2.10) and stacked #258 (2.11). CI was pending during the GitHub Actions incident; neither open PR counts as merged or green.
- **Frame budget and per-frame measurements:** the made-light benchmark passed on BR's reference laptop, as recorded in Results. BR's Firefox reference runs for the approved tree workload met the gate; the separate software-renderer observations are explicitly not treated as a pass. The other per-frame costs are recorded with their workloads. The final Slice 2 budget item remains open: d87 is measuring the default test run against the recorded budget and must either bring it within budget or document why it exceeds it.
- **Reachability and sound:** the content validator's reachability checks and the noise-to-positional-sound scenario are delivered in #184, #177 and #250.
- **BR's in-game approvals:** the crafting panel (#211), made lights (#252), and trees and hedges (#189) were approved.
- **Checklist:** issue #157 is still open and stale; its milestone boxes have not been updated for later delivery. The lead will update and close it with acceptance evidence and links to carried-forward work.
- **Carried-forward links:** still need to be listed on the checklist issue.
- **Retrospective:** this document is the remaining written deliverable; it still needs BR's review before closure.

## 1. Planned against delivered

| Milestone | Planned outcome | Delivery and status |
| --- | --- | --- |
| 2.0 Before code starts | Plan, host and default-test budgets, playtest questions, and checklist | Plan #156 and setup #166 merged. The checklist #157 was opened but not kept current. Its default-test budget is the subject of d87. |
| 2.1 Reach and options | Shared reach/options core and quick move | #173 merged. Quick move was pulled into this milestone with BR's approval; the interaction remained one ordinary timed move, not batch actions. |
| 2.2 Recipes as content | Validated recipe, skill, tool-quality and workstation references | #176 merged, including the F8 content-section descriptor. |
| 2.3 Reachability | World-grounded closure for ingredients and recipe prerequisites | #184 merged. Reachable teaching books, practice, qualities, and placed workstations became hard sources through later milestones. |
| 2.4 Planner and crafting | Saved long actions, work escrow, interruption/resume, and the first crafting panel | #211 merged and BR approved the panel as a first version, with further iterations expected. Rest and sleep joined the shared long-action owner. |
| 2.5 Skills, known recipes and books | Practice, recipe learning, and resumable reading | #231 merged. Books teach recipes; the planned four-book content shipped as part of the final content round. |
| 2.6 Wear and repair | Wear on melee weapons and worn clothing; repair as a saved long action | #230 merged. BR's later Slice 3 body model replaces the temporary torso hit rule. |
| 2.7 Disassembly and salvage | Declared yields, salvage lists, saved progress, and reachability | #234 merged. Salvage uses explicit content rather than reversing every recipe. |
| 2.8 Workbenches | Placed workstation qualities and craft-time effects | #239 merged, with a shed bench; the garage and hardware-store benches followed in 2.10. |
| 2.9 Light you make | Crafted lights, burn state, point-light pool, and reference workload | #252 merged and BR approved the in-game result and reference-laptop workload. Zombies sensing light and fire spread remained out of scope. |
| 2.10 Hardware store and garage | Two hamlet templates with benches and reachable stock | #241 is open after BR's look and review. The buildings gained window openings in response to the first look; #241 awaits CI and merge. |
| 2.11 Content | About 80 obtainable item types and reachable recipes | #258 is open, stacked on #241. Its validation report records that the planned content threshold and reachability checks pass, with no validation issues. It awaits CI and merge. |
| 2.12 Every noise is heard | Scenario proof in both directions between noise and positional sound | #177 and #250 merged; simulation-owned sound admission and its scenario test close the gate. |
| 2.13 Trees, a sneak peek | Trees and hedges, passable opaque foliage, rustle, and forest performance | #189 merged. Trees were pulled forward from Slice 4 at BR's request; the approved reference workload met its gate. |

Work pulled into Slice 2 included trees and hedges from Slice 4, plus quick move within 2.1. The checklist also records the carried-forward Slice 1 playtest and sound follow-ups; the playtest stays at the end of Slice 3, while the noise-to-positional-sound scenario became a Slice 2 gate.

The boundary with Slice 3 was porous during development. Aim sway and firearms skill (#262, d62), long-action input behavior (#263, d73), diegetic refusal sound (#261, d74), held-action behavior (#266, d77), shot impacts (#268, d78), shambler pursuit fixes (#269–#270, d79 and d81), debug input (#272, d82), the bounded skill scale (#274, d83), and the beeline behavior replacing route planning (#279, d84) arose from BR's playtests and were handled as separate work. The ready stance and aim sway were drawn from Slice 3; the beeline replaced the planned route-planning direction after observing shamblers in play. These are not Slice 2 exit gates, and their own plans and PRs own their proofs.

## 2. What worked

- **The plan made scope and evidence visible.** `deadvox/SLICE-2.md` separated milestones, save ownership, reachability, first looks, reference workloads, and carried-forward work. That let the slice accept BR-directed trees without treating unrelated follow-ups as hidden exit criteria.
- **First looks caught visual defects before closure.** BR's building review initially found the store and garage hard to distinguish; subsequent looks identified closed windows and then their height. The repair remained in template content. The trees and light workloads also had separate visual and reference-machine approvals.
- **One owner per simulation concept paid off.** `reach()` and `options()` replaced scattered queries; the long-action owner absorbed rest, sleep, craft, repair, disassembly, and reading; reachability was extended as new sources arrived. See `deadvox/src/core/reach.ts`, `deadvox/src/core/longAction.ts`, and `deadvox/src/core/reachability.ts`.
- **Review found concrete defects before landing.** The tracker records multiple review rounds on the persistent and UI-heavy milestones. The counts below come from agent-work review records, cross-checked against PR bodies where early review records are not represented in the tracker. A FIX count means a review round returned FIX, not the number of sub-findings within that report.

| Milestone | Review rounds | FIX verdicts |
| --- | ---: | ---: |
| 2.0 | 2 | not itemized in the tracker |
| 2.1 | 2 | 1 |
| 2.2 | 1 | 0 |
| 2.3 | 2 | 1 |
| 2.4 | 7 | 5 |
| 2.5 | 4 | 3 |
| 2.6 | 2 | 1 |
| 2.7 | 3 | 1 |
| 2.8 | 2 | 1 |
| 2.9 | 8 | 4 |
| 2.10 | 4 completed, 1 in progress | 1 |
| 2.11 | 4 | 2 |
| 2.12 | 2 | 1 |
| 2.13 | 3 | 1 |

The review rounds improved both code and evidence: examples include the non-vacuous loot assertion in #241, the two-pocket fixture for quickbar stowing in #258, and the stop/resume and saved-progress cases in the long-action work. Review count is not a quality score; it shows where first-round handoffs did not yet satisfy the contract.

## 3. What hurt

- **The checklist drifted from delivery.** Issue #157 was opened with the plan, but later milestone boxes and carried-forward links were not maintained. By closure, the issue no longer described the shipped state, so the team had to reconstruct status from PRs and work records.
- **Some milestones became long review chains.** The planner, books, lights, and final content had several FIX rounds. The underlying causes were not one class: persistence ownership and UI interactions, test hygiene, first-look defects, and integration each needed different corrections. A reviewer finding a test that passes vacuously or writes state outside its owner is preventing false confidence, not asking for more tests.
- **Parallel branches created integration and sequencing work.** #258 depended on #241, and both needed mainline integration. Their stacked relationship delayed Slice 2 closure and made review/CI state harder to interpret. Earlier base checks helped, but did not remove the need to merge and verify each current tip.
- **The measured default-test budget became a real constraint.** The 2.0 budget was explicit, while a later suite run exceeded it. d87 is addressing the excess rather than treating a larger timeout as a solution. Test-bar audits also removed vacuous or drifting assertions and fixed nondeterministic browser and unit cases; those are distinct from the budget work.
- **Coders sometimes stopped after receiving an answer.** The lead's wake prompt did not consistently make the next action explicit. Agent-kit #33/#34 changed the wake instruction to require priming, reading new mail, acting on it, and continuing the active item. This addresses the coordination mechanism rather than relying on repeated manual nudges.
- **Visual defects were expensive when discovered after implementation.** The building windows needed more than one look/fix cycle. That supports keeping the first-look gate for visual work, not skipping it to accelerate delivery.
- **The GitHub Actions incident blocked the last integration step.** #241 and #258 had reached SHIP, but their PR CI was still pending during the incident. A review verdict is not a green CI run, and a cancelled or unavailable hosted run is not evidence that the PR passed.

## 4. Changes for Slice 3 (proposals for BR)

These are proposals for BR's decision, not settled process:

1. **Keep the checklist live.** The lead could update the checklist issue at each milestone's merge with its evidence and carried-forward links, then use it as the source for the closure retrospective.
2. **Keep visual first looks before full engineering.** For buildings, foliage, lights, and other appearance-driven work, a rough in-game view could be a prerequisite to the full round; record BR's approved reference with the work item.
3. **Make slice boundaries explicit for playtest discoveries.** BR could continue directing discoveries into separately tracked features, while the slice plan names which adjacent changes are prerequisites, dependencies, or explicitly outside its exit gates.
4. **Pair review counts with fix causes.** A short category for each FIX round—behavior, persistence, test hygiene, visual feedback, or integration—could show whether briefs, ownership boundaries, or test design need improvement, without rewarding fewer reviews as an end in itself.
5. **Close test-budget overruns with evidence.** The slice lead could ask the assigned owner to profile the default suite, remove redundant work without losing coverage, and record the resulting budget before declaring closure.
6. **Keep incident status separate from product status.** If hosted CI is unavailable at closure, the lead could leave the PRs open and report the blocked gate explicitly, then finish merge and checklist closure only after the required runs are green.

BR's decision on these proposals remains open.
