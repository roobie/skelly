---
read_if:
  - changing terrain worker count, lookahead or outstanding-work bounds
  - changing when or how a streamed terrain column is admitted
  - changing how a terrain worker failure reaches the generation failure path
  - measuring terrain data generation separately from admission or meshing
  - changing simulation terrain queries, readiness or their boundary with rendering
  - deciding whether standalone terrain admission may evaluate on main
  - changing the boundary check's compiler dependency or CI installation
---

# Terrain workers

## Decision

Dedicated terrain workers compute columns ahead of admission; only the main thread admits them.
See `src/game/terrainJobs.ts`, `TerrainJobs`; `src/game/streamer.ts`, `Streamer`; and
`src/game/terrainProtocol.ts`, `createTerrainService`. The workers serve the evaluator described in
`docs/decisions/shared-terrain-evaluation.md`, "Decision", from their own copy of the plan, so a
worker result is the column main would have generated.

**Simulation publication.** Supply and spawns must follow a fixed schedule rather than worker
completion or render admission, so worker timing cannot change the simulation, replay or save.
Publication precedes render work and retains the nearest-first update budget and retention boundary;
see `src/game/streamer.ts`, `Streamer.publishNearest` and `Streamer.unloadFar`. The publication ledger,
not render residency, supplies recording boundaries. Replay owns its recorded publication events.

**Terrain ownership.** Rendering is a picture of the world, not its source of truth. The simulation
owns published canonical facts in a separate store, so worker admission cannot change collision,
actor queries, light, sound or readiness. See `src/core/simulationTerrain.ts`, `SimulationTerrain`,
and `src/core/terrainRead.ts`, `TerrainRead`. An unpublished column explicitly returns `NOT_LOADED`:
it blocks physical, sight, combat and sound queries and supplies no footsteps or drop sounds. Readiness
retains the neighbouring-column requirement, but consults publication instead of render residency.

Canonical simulation reads and edits of missing terrain stay synchronous: they need authoritative
cells within the simulation transaction, not eventual render residency. Read-only scratch evaluation
neither publishes nor saves a column. Validated worker data can warm unqueried scratch entries before
render admission, saving duplicate evaluation without changing publication or replacing an existing
cache identity. Edits pin complete canonical columns and are copied to rendering; a worker cannot
replace them. See `src/core/canonicalTerrain.ts`, `CanonicalTerrain`, and
`src/game/worldSetup.ts`, `createWorldSetup`. Simulation sky fields fork the authored field definitions
onto simulation facts rather than sharing the renderer's resident-data cache; see
`src/core/skyField.ts`, `SkyFields.fork`.

**Enforced boundary.** A missed simulation reader must fail a check, not depend on review. Simulation
cannot import the renderer's world, even through a type, barrel or dynamic import; the build checks
the simulation dependency closure. See `tools/simulation-boundary.mjs`, `roots` and `visit`, and
`src/game/renderWorld.ts`, `RenderWorld`. Its render-only type also prevents injecting it as a
`SimulationWorld` or `TerrainRead`. Canonical-store construction rejects the same capability, so
wrapping render storage cannot bypass the reader boundary; see `src/core/canonicalTerrain.ts`,
`CanonicalWorld`. The plain sparse `World` remains the storage primitive for canonical state and
self-contained fixtures, not the live rendering capability.

The boundary check uses the JavaScript compiler API isolated with the analyzer, not the workspace's
native compiler CLI. Any job that runs the engine typecheck must install that dependency first;
otherwise the guard cannot run even though workspace compilation is installed. See `tools/simulation-boundary.mjs`,
`imports` and `localTargets`, and `tools/lit-check/package.json`, `dependencies`.

**Render admission.** A worker-backed source waits for the nearest missing column instead of filling
its deadline synchronously or skipping it for a farther reply. Polling does not retire its request;
recentres retain staged and running work still needed by the new window. This keeps movement from
throwing away the overlapping ahead ring or repeatedly requesting the column it is waiting for.
See `src/game/terrainJobs.ts`, `TerrainJobs.retain` and `TerrainJobs.take`, and
`src/game/streamer.ts`, `Streamer.generateNearest`.

**No-worker callers.** Browser Play and loading always provide a terrain worker source, so their
admissions cannot reach synchronous evaluation. See
`packages/presentation/src/presentation/engine.ts`, `createEngine`, and `src/game/streamer.ts`,
`Streamer.addGenerated`. The synchronous branch remains reachable for standalone engine callers,
including self-contained fixtures, that supply no worker port. It is their implementation, not a
fallback for late or failed workers; removing it would require changing that separate caller contract.
Canonical simulation reads and edits retain their synchronous authority for the same reason: they
cannot defer a transaction until the renderer catches up.

**Replay.** Recorded events publish simulation facts immediately, independent of the camera's render
window or pending terrain jobs. The initial loading mask still waits for drawing through
`packages/presentation/src/presentation/worldLoading.ts`, `WorldLoading.check`. After loading, replay
ticks need no worker wait: canonical reads can supply their published facts synchronously. A failed
publication is fatal, not a pending worker result, and load effects are applied once by the driver.
See `src/game/inputReplayDriver.ts`, `InputReplayDriver`, and `src/game/streamer.ts`,
`Streamer.publishReplayColumn` and `Streamer.admitReplayNearest`.

**One worker first.** One dedicated generation worker with bounded nearest-first lookahead. Each
worker holds its own plan copy, so memory and startup grow per worker; more workers only after
measurement. The protocol stays count-driven, with no one-worker ordering assumptions. The count,
lookahead and outstanding-work bound are graphics tuning in content, not a hardware heuristic, because
they trade device resources against streaming responsiveness. Retired requests keep their capacity
until they reply, so moving back and forth cannot grow the queue.

**Measure evaluation separately.** Admitting a staged result is cheap even when evaluating its terrain
was expensive, so admission timing alone cannot decide where terrain work belongs. Worker service
timings exclude queueing and transfer; see `src/game/terrainProtocol.ts`, `createTerrainService`, and
`src/game/streamer.ts`, `Streamer.debugDuration`. Main-thread evaluator marks also cover canonical
scratch misses, so removing render fallback cannot hide that remaining synchronous cost; see
`src/game/worldSetup.ts`, `measuredTerrain`.

**Failures are not hidden.** A fault creating, initializing or messaging a worker, a reply that is
not a well-formed message, and a fault the worker reports all latch and reach the streamer's
generation failure path at an update boundary instead of waiting indefinitely or evaluating a
replacement on main. A well-formed reply from an earlier epoch is only stale and is dropped. A worker never
answers a fault with empty terrain, and a failed worker is never retried.
