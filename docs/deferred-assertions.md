---
id: skelly::deferred-assertions
description: Values deliberately left un-asserted pre-pre-alpha because they drift during development, with how to check each and when to pin it.
tags: [testing, process]
created: 2026-10-04
status: active
read_if:
  - you're writing a test and want to assert a value that can drift during development
  - you remove or defer an assertion of mutable development data
  - you're deciding whether to pin a deferred value, or its pin-when trigger has come
  - a review flags a test for pinning drifting data
---

# Deferred assertions

Pre-pre-alpha, tests don't assert data that can drift during development (AGENTS.md, "Tests";
BR, 2026-10-04). This register lists each value we deliberately leave un-asserted, so nothing
is silently forgotten. Check them by hand when the area changes, and pin them when the "pin
when" condition arrives.

When you remove or skip a drifting assertion, add a row here in the same PR. When you pin one,
move its row to the bottom section with the PR that pinned it.

| What | Where it was (or would be) asserted | How to check by hand | Pin when |
|---|---|---|---|
| deadvox validate counts (reachable / defined eligible, component closure, models) and the defined-but-unreachable list | `deadvox/test/validateCli.test.ts` (removed in d40-3 and d31-5) | `npm run validate` in `deadvox`: 0 issues; every unreachable item is one that isn't placed yet on purpose | content freeze, v1.0 beta |
| Inventory hint/search/refusal prose and shipped clothing pocket counts | `deadvox/test/inventoryScreen.test.ts` (removed in d15-6) | Open inventory with the current loadout; check binding hints, search progress and duplicate-command feedback, then inspect each worn container’s pocket layout. Tests retain menu ownership, search redraw, refusal feedback and per-container containment properties | when an accessibility/copy contract is agreed; clothing counts at content freeze, v1.0 beta |
| Starting known recipe IDs | `deadvox/test/snapshot.test.ts` and `deadvox/test/craftingUi.test.ts` (exact list removed in d31-5) | Inspect `STARTING_RECIPES` against the milestone's current starting-knowledge intent | content freeze, v1.0 beta |
| Exact simulation-fingerprint exclusion details (`SIMULATION_EXCLUSIONS`, `excludedImports`) | `deadvox/test/simulationFingerprint.test.ts` | Print `excludedImports` from `deadvox/tools/simulationFingerprint.ts`; the test asserts no UI, render or Three source in the graph and requires save code to remain in it | save compatibility matters, v1.0 beta |
| Root launcher template, fixture, design and URL-parameter inventories | `test/site-launcher.test.mjs` | Run `npm run test:site`; verify every offered value resolves in the game and every supported value is offered or has an explicit omission reason | when launcher options change |
| Exact debug-readout coordinates, memory totals, revealed-coordinate list and FPS sample | `deadvox/test/playHud.test.ts` | Re-run the readout test; if telemetry fields change, review how each value is derived from the supplied measurement/geometry fixture | when telemetry fields change |
| Exact HUD, interruption, death-summary and unsupported-hand hint prose and formatted clocks | `deadvox/test/playHud.test.ts`, `deadvox/test/hud.test.ts`, `deadvox/test/death.test.ts`, `deadvox/test/restUi.test.ts`, `deadvox/test/primaryAction.test.ts`, `deadvox/test/playtestTools.test.ts` | Run `npm test`; manually review play HUD, quickbar, rest interruption and death-screen copy in the browser. Rest shows only the current stop binding; sleep also shows its current toggle binding. Tests retain those binding relationships, not the wording | when UI copy changes |
| Seeded authored-site building, spawn and tree placement details, including tree-height mix | `deadvox/test/authoredSite.test.ts` | Inspect authored sites in play; tests retain foundation, blend-band surface, spawn footing/headroom, tree-grounding and order-independence properties | when authored-site visuals are accepted for v1.0 beta |
| Test-house decorative finishes and furniture arrangement | `deadvox/src/game/testHouse.ts`, `deadvox/test/testHouse.test.ts` | Inspect the test house in play; tests retain enclosure, a floor-level doorway, stairs reaching the roof, furniture support and non-overlap | when the test-house visual layout is accepted for v1.0 beta |
| Specific audio approval dates, note wording and selected variants | `deadvox/test/soundGuide.test.ts`, `/sounds.html` | BR reviews the listening sheet and provenance. The note test checks nonempty per-event coverage, not mutable verdict copy | when an approved release asset set is frozen |
| Pump tube capacity, shell payload count and camera FOV as fixed content numbers | `deadvox/test/pumpShotgun.test.ts`, `deadvox/test/unpacking.test.ts`, `deadvox/test/browser/pump-handling.mjs` | Compare exported model/content metadata to BR's chosen gun and box. Unit fixtures own alternate capacity/payload values; the native flow derives current metadata and checks conservation and unchanged FOV | when these authored specifications become release guarantees |
| Spread, range, base damage/impulse, blast hearing radius and hull flight delay | `deadvox/src/core/pellets.ts`, `deadvox/src/game/firearmHandling.ts`, `deadvox/docs/pump-shotgun.md` | BR plays at different distances/cover and listens to the shot/rack/hull. Tests retain cartridge-driven diameter scaling, occlusion, admitted hearing and once-only saved landing at its committed timestamp | after gameplay/audio tuning is accepted as a stable contract |
| Rack cant angle | `deadvox/src/render/firearmModel.ts`, `rackCant`; `deadvox/src/render/hands.ts`, `HeldItems` | BR approved the look on 2026-10-04 as part of #209, with improvements deferred. Recheck port visibility and the eased return when the held pose changes; approval does not pin an angle | only when an explicit stable held-pose specification is agreed; remains un-pinned after the as-is approval |
| `RUMMAGE_POSE` tuning | `deadvox/src/render/rummagePose.ts`, `RUMMAGE_POSE`; `deadvox/src/render/hands.ts`, `HeldItems.poseRummage` | BR approved the look on 2026-10-04 as part of #225, including shotgun stowing; more specific shell-loading feedback is d53. Recheck held handling, completion/cancellation and dedicated-pose precedence when presentation changes; approval does not pin tuning | only when an explicit stable held-pose specification is agreed; remains un-pinned after BR's approval |
| Fist contact timing | `deadvox/test/meleeTimingRestore.test.ts` | Inspect `deadvox/src/core/meleePose.ts`, `meleeContactTime`, and play fist strikes. The test follows the live action's contact boundary and retains once-only tick ordering, save continuation and physical arm alternation, not a fixed frame count or elapsed-time golden | when melee timing is agreed as a stable gameplay contract |
| Pocket stow/extraction timing | `deadvox/test/reachOptions.test.ts` | Compare handling feel through different carried containers. The deferred-take test follows owner-created job durations and compares extraction with the live Inventory calculation, so it still catches planning from the obsolete source | when handling timing is agreed as a stable gameplay contract |
| Exact wall-clock handling bounds | `deadvox/test/browserHandlingBudget.test.ts` | Inspect native work/pacing logs under slow software rendering. Tests check monotonic work/pacing scaling and a simulation-work lower bound, not a tuning-derived millisecond golden | when an explicit supported-host latency budget is adopted |
| Generated world-column level enumeration and raw air-block ID | `deadvox/test/worldgen.test.ts` | Run the worldgen tests; inspect that generated columns cover contiguous chunk levels, have a semantic surface, and resolve air above ground | at worldgen changes |
| Published-design inventory and resolved geometry; generated-build appearance formerly snapshotted by `designCorpus.test.ts` and `generate.test.ts` | `gungen/test/designCorpus.test.ts` and `gungen/test/generate.test.ts` | Run `npm run check:designs` in `gungen`; inspect published designs in the viewer (`npm run dev`, `?design=<name>`) and generated examples (`?template=<name>&seed=<seed>`) | at generator-change time |
| Trigger-guard exact solid dimensions and clearances | `gungen/test/triggerGuard.test.ts` | Inspect the pistol/design trigger guard in the Gungen viewer; the tests retain non-overlap and validator-acceptance properties | at trigger-guard geometry changes |
| Mesh triangle totals and per-model/render budget | `gungen/test/mesh.test.ts`, `gungen/test/extrusionAxis.test.ts`, `gungen/test/receiverSection.test.ts` | Run `npm run mesh-stats` in `gungen` and inspect changed models in the viewer | when a render budget is agreed |
| Absolute AK/AR/thumbhole dimensions, builder solid-ID inventories, and bolt-carrier travel/part details | `gungen/test/ak.test.ts`, `gungen/test/ar.test.ts`, `gungen/test/thumbholeStock.test.ts`, `gungen/test/boltCarrier.test.ts` | Validate representative assemblies, then inspect each changed archetype part in the viewer; for action parts, inspect the full motion path for clearance | at generator-change time |
| Known-seed mobgen genomes and voxel-grid fingerprints | `mobgen/test/generate.test.ts` and its generated snapshot | Run generation/validation tests; start `npm run dev` in `mobgen` and inspect representative gallery bodies for shape, proportions and buildability | at generator-change time |
| Exact gait-clock, walk/attack pose and bone-transform outputs across seed/speed samples | `mobgen/test/poseEquivalence.test.ts` and its generated snapshot | Run the gait, attack and pose property suites; start `npm run dev` in `mobgen` and inspect representative walk and Lunge Grab cycles | at gait/attack generator-change time |
| Shipped melee weapon reach order | `deadvox/test/meleeReach.test.ts` | Compare `reach` in `deadvox/src/content/base/items-tools.json` against the intended feel | content freeze, v1.0 beta, or once BR rules an order |

## Pinned since

None yet.
