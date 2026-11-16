---
read_if:
  - changing terrain worker count, lookahead or outstanding-work bounds
  - changing when or how a streamed terrain column is admitted
  - changing how a terrain worker failure reaches the generation failure path
  - measuring terrain data generation separately from admission or meshing
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

**Terrain ownership.** A worker result cannot replace resident edits. Canonical simulation reads and
edits of missing terrain stay synchronous: they need authoritative cells within the simulation
transaction, not eventual render residency. See `src/core/canonicalTerrain.ts`, `CanonicalTerrain`.

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
