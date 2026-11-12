---
read_if:
  - changing terrain worker count, lookahead or outstanding-work bounds
  - changing when or how a streamed terrain column is admitted
  - changing how a terrain worker failure reaches the generation failure path
---

# Terrain workers

## Decision

Dedicated terrain workers compute columns ahead of admission; only the main thread admits them.
See `src/game/terrainJobs.ts`, `TerrainJobs`; `src/game/streamer.ts`, `Streamer`; and
`src/game/terrainProtocol.ts`, `createTerrainService`. The workers serve the evaluator described in
`docs/decisions/shared-terrain-evaluation.md`, "Decision", from their own copy of the plan, so a
worker result is the column main would have generated.

**Strict admission.** The arrival trace stays unchanged: a column arrives on the same update, in the
same order and within the same per-update budget as without workers. When a worker reply misses its
old admission boundary, main finishes that column on the same frame with the same evaluator. A worker
can run ahead but never causes early or late arrival. A reply is only staged when it arrives; the
streamer decides at its own update whether a staged result, the resident touched chunks or main's own
evaluation supplies the column, so stale or reordered replies cannot become world or save changes.
A recentre retires every request and staged result, and replay ends speculative work, because replay
owns every arrival.

**One worker first.** One dedicated generation worker with bounded nearest-first lookahead. Each
worker holds its own plan copy, so memory and startup grow per worker; more workers only after
measurement. The protocol stays count-driven, with no one-worker ordering assumptions. The count,
lookahead and outstanding-work bound are graphics tuning in content, not a hardware heuristic, because
they trade device resources against streaming responsiveness. Retired requests keep their capacity
until they reply, so moving back and forth cannot grow the queue.

**Failures are not hidden.** An init, request, reply or worker fault latches and reaches the
streamer's generation failure path at its next update, before main could cover the column with its
own evaluation. A worker never answers a fault with empty terrain, and a failed worker is never retried.
