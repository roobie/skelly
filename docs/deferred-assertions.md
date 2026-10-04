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
| Published-design inventory and resolved geometry; generated-build appearance formerly snapshotted by `designCorpus.test.ts` and `generate.test.ts` | `gungen/test/designCorpus.test.ts` and `gungen/test/generate.test.ts` | Run `npm run check:designs` in `gungen`; inspect published designs in the viewer (`npm run dev`, `?design=<name>`) and generated examples (`?template=<name>&seed=<seed>`) | at generator-change time |
| Trigger-guard exact solid dimensions and clearances | `gungen/test/triggerGuard.test.ts` | Inspect the pistol/design trigger guard in the Gungen viewer; the tests retain non-overlap and validator-acceptance properties | at trigger-guard geometry changes |
| Mesh triangle totals and per-model/render budget | `gungen/test/mesh.test.ts`, `gungen/test/extrusionAxis.test.ts`, `gungen/test/receiverSection.test.ts` | Run `npm run mesh-stats` in `gungen` and inspect changed models in the viewer | when a render budget is agreed |
| Absolute AK/AR/thumbhole dimensions, builder solid-ID inventories, and bolt-carrier travel/part details | `gungen/test/ak.test.ts`, `gungen/test/ar.test.ts`, `gungen/test/thumbholeStock.test.ts`, `gungen/test/boltCarrier.test.ts` | Validate representative assemblies, then inspect each changed archetype part in the viewer; for action parts, inspect the full motion path for clearance | at generator-change time |

## Pinned since

None yet.
