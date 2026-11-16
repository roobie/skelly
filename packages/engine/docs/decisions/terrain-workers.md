---
read_if:
  - changing terrain worker count, lookahead or outstanding-work bounds
  - changing when or how a streamed terrain column is admitted
  - changing how a terrain worker failure reaches the generation failure path
  - measuring terrain data generation separately from admission or meshing
  - changing simulation terrain queries, readiness or their boundary with rendering
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
neither publishes nor saves a column. Edits pin complete canonical columns and are copied to rendering;
a worker cannot replace them. See `src/core/canonicalTerrain.ts`, `CanonicalTerrain`, and
`src/game/worldSetup.ts`, `createWorldSetup`. Simulation sky fields fork the authored field definitions
onto simulation facts rather than sharing the renderer's resident-data cache; see
`src/core/skyField.ts`, `SkyFields.fork`.

**Enforced boundary.** A missed simulation reader must fail a check, not depend on review. Simulation
cannot import the renderer's world, even through a type, barrel or dynamic import; the build checks
the simulation dependency closure. See `tools/simulation-boundary.mjs`, `roots` and `visit`, and
`src/game/renderWorld.ts`, `RenderWorld`. Its render-only type also prevents injecting it as a
`SimulationWorld` or `TerrainRead`. The plain sparse `World` remains the storage primitive for
canonical state and self-contained fixtures, not the live rendering capability.

**One worker first.** One dedicated generation worker with bounded nearest-first lookahead. Each
worker holds its own plan copy, so memory and startup grow per worker; more workers only after
measurement. The protocol stays count-driven, with no one-worker ordering assumptions. The count,
lookahead and outstanding-work bound are graphics tuning in content, not a hardware heuristic, because
they trade device resources against streaming responsiveness. Retired requests keep their capacity
until they reply, so moving back and forth cannot grow the queue.

**Measure evaluation separately.** Admitting a staged result is cheap even when evaluating its terrain
was expensive, so admission timing alone cannot decide where terrain work belongs. Worker service
timings exclude queueing and transfer; see `src/game/terrainProtocol.ts`, `createTerrainService`, and
`src/game/streamer.ts`, `Streamer.debugDuration`.

**Failures are not hidden.** A fault creating, initializing or messaging a worker, a reply that is
not a well-formed message, and a fault the worker reports all latch and reach the streamer's
generation failure path at an update boundary, before main could cover the column with its own
evaluation. A well-formed reply from an earlier epoch is only stale and is dropped. A worker never
answers a fault with empty terrain, and a failed worker is never retried.
