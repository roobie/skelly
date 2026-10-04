---
id: skelly::deferred-assertions
description: Values deliberately left un-asserted pre-pre-alpha because they drift during development, with how to check each and when to pin it.
tags: [testing, process]
created: 2026-10-04
status: active
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
| deadvox validate counts (reachable / defined eligible, component closure, models, pending prerequisites) and the defined-but-unreachable list | `deadvox/test/validateCli.test.ts` (removed in d40-3 and d31-5) | `npm run validate` in `deadvox`: 0 issues; every unreachable item is one that isn't placed yet on purpose; pending prerequisites should fall to 0 as recipes land | content freeze, v1.0 beta |
| Starting known recipe IDs | `deadvox/test/snapshot.test.ts` and `deadvox/test/craftingUi.test.ts` (exact list removed in d31-5) | Inspect `STARTING_RECIPES` against the milestone's current starting-knowledge intent | content freeze, v1.0 beta |
| The simulation-fingerprint exclusion lists (`SIMULATION_EXCLUSIONS`, `excludedImports`) | `deadvox/test/simulationFingerprint.test.ts` (removal planned in r23-2) | The property tests stay: no `src/ui/`, render, engine or `node_modules/three` source in the graph, and save code is in it | save compatibility matters, v1.0 beta |
| Root launcher template, fixture, design and URL-parameter inventories | `test/site-launcher.test.mjs` | Run `npm run test:site`; verify every offered value resolves in the game and every supported value is offered or has an explicit omission reason | when launcher options change |
| Exact debug-readout coordinates, memory totals, revealed-coordinate list and FPS sample | `deadvox/test/playHud.test.ts` | Re-run the readout test; if telemetry fields change, review how each value is derived from the supplied measurement/geometry fixture | when telemetry fields change |
| Exact HUD, interruption and death-summary prose and formatted clocks | `deadvox/test/playHud.test.ts`, `deadvox/test/hud.test.ts`, `deadvox/test/death.test.ts`, `deadvox/test/restUi.test.ts` | Run `npm test`; manually review play HUD, quickbar, rest interruption and death-screen copy in the browser | when UI copy changes |
| Generated world-column level enumeration and raw air-block ID | `deadvox/test/worldgen.test.ts` | Run the worldgen tests; inspect that generated columns cover contiguous chunk levels, have a semantic surface, and resolve air above ground | at worldgen changes |
| Known-seed mobgen genomes and voxel-grid fingerprints | `mobgen/test/generate.test.ts` and its generated snapshot | Run generation/validation tests; start `npm run dev` in `mobgen`, then inspect representative gallery bodies for shape, proportions and buildability | at generator-change time |
| Exact gait-clock, walk/attack pose and bone-transform outputs across seed/speed samples | `mobgen/test/poseEquivalence.test.ts` and its generated snapshot | Run the gait, attack and pose property suites; start `npm run dev` in `mobgen` and inspect representative walk and Lunge Grab cycles | at gait/attack generator-change time |

## Pinned since

None yet.
