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
| deadvox validate counts (reachable / defined eligible, component closure, models, pending prerequisites) and the defined-but-unreachable list | `deadvox/test/validateCli.test.ts` (removed in d40-3) | `npm run validate` in `deadvox`: 0 issues; every unreachable item is one that isn't placed yet on purpose; pending prerequisites should fall to 0 as recipes land | content freeze, v1.0 beta |
| The simulation-fingerprint exclusion lists (`SIMULATION_EXCLUSIONS`, `excludedImports`) | `deadvox/test/simulationFingerprint.test.ts` (removal planned in r23-1) | The property tests stay: no `src/ui/`, render, engine or `node_modules/three` source in the graph, and save code is in it | save compatibility matters, v1.0 beta |

## Pinned since

None yet.
