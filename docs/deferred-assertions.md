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
| deadvox validation summary counts (content and pending prerequisites) and the defined-but-unreachable list | `deadvox/test/validateCli.test.ts` (summary assertions removed in d31-5) | `npm run validate` in `deadvox`: 0 issues, and every unreachable item is one that isn't placed yet on purpose | content freeze, v1.0 beta |
| Starting known recipe IDs | `deadvox/test/snapshot.test.ts` and `deadvox/test/craftingUi.test.ts` (exact list removed in d31-5) | Inspect `STARTING_RECIPES` against the milestone's current starting-knowledge intent | content freeze, v1.0 beta |
| The simulation-fingerprint exclusion lists (`SIMULATION_EXCLUSIONS`, `excludedImports`) | `deadvox/test/simulationFingerprint.test.ts` (removal planned in r23-1) | The property tests stay: no `src/ui/`, render, engine or `node_modules/three` source in the graph, and save code is in it | save compatibility matters, v1.0 beta |

## Pinned since

None yet.
