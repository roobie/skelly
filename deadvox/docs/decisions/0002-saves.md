---
read_if:
  - you're changing persistent simulation state or restore guarantees
  - you're evaluating save identity or compatibility policy
  - you're changing when the game autosaves
tags: [deadvox, adr, saves, persistence, determinism]
---

# 2. Save the simulation, not the runtime

[[THIS is_grounded_by: ../../DESIGN.md]]

**Status:** accepted.

## Decision

A save is an exact, versioned snapshot of one world and its bound character.
The world is the root; a character cannot be transferred to another world. A
new character entering the same world after death is an open decision for BR.

Restore only when the running build has the same simulation source fingerprint,
save schema, deterministic generator versions and ordered content identities.
Check that identity before resolving content, and refuse a mismatch without
changing the saved record. A Git revision is diagnostic, not part of identity.
Exactness matters because a restored scheduler, random stream or action must
continue as if saving and loading had not changed the simulation. The worldgen
generator identity also changes when the generated terrain baseline changes, so
saved chunk diffs are never applied over a different ground surface; see
`src/core/saveFormat.ts`, `defaultVersion`.

Persist every future-affecting owner state in the same change that introduces
it. At entity boundaries such as `src/core/zombies.ts`, `ZombieSystem.snapshotState`,
export through an explicit projection whose exhaustive key check forces every
added state field to receive a save decision. This prevents optional runtime
fields from leaking into canonical saves when they are unset. Keep input,
rendering and external playback out of the snapshot. God mode,
noclip and build toggles are debug state: they are not saved and are off after
load, while world changes made with them remain saved. Presentation changes leave
save identity stable only when their modules stay outside the simulation
dependency graph; gameplay rules remain fingerprinted even when they share a
file with presentation code. See `tools/simulationFingerprint.ts`,
`SIMULATION_ENTRIES`, and `src/core/saveState.ts`, `snapshotSession`.

Write snapshots through crash-safe A/B records. Disk work is asynchronous and
must not block a simulation frame; a failed write leaves the previous valid
record available. IndexedDB save writes request strict durability, so a save is
flushed to disk before it is acknowledged, as the OPFS path flushes before it
acknowledges; see `src/game/indexedDbCommit.ts`,
`createDurableWriteTransaction`, and `src/worker/save.worker.ts`, `writeOpfs`.
A back/forward-cache transition does not require a new save:
a frozen page can hold the origin lock and block the next page, so the last
committed generation remains the recovery point. See
`src/ui/saveController.ts`, `SaveController`, and `test/browser/save-storage.mjs`.
These safeguards reduce corruption risk but are not backups.

Autosave checkpoints often enough that a crash or a killed tab loses only a
little play. Periodic checkpoints count simulated play time, not wall-clock time
or game hours, so a paused game takes no periodic checkpoint and the cadence
does not change with the clock ratio. The interval is content tuning in
`src/content/base/saves.jsonnet`, which `src/game/play.ts`,
`autosaveCheckpointSimSeconds`, reads; `src/ui/checkpointSchedule.ts`,
`CheckpointSchedule`, decides when a checkpoint is due. Saves before sleep, on
`visibilitychange` and on `pagehide` cover the moments between checkpoints.

## Compatibility

Cross-version restore and migration are not supported. A changed simulation,
schema, generator or content identity is a different save world, not an input
to an implicit upgrade. This strict policy defers EPIC.md's v1 exit criterion
“Old saves migrate”; it does not waive it. Before v1.0 beta, BR owns the hard-fork
choice between selecting a matching build and migrating old saves. Until then,
preserve and refuse mismatched records.

The save boundary exists so mutable simulation state can resume exactly while
browser storage, rendering and input are rebuilt by the running version. The
current save and restore owners are `src/core/saveState.ts`, `snapshotSession`,
and `src/core/saveFormat.ts`, `SAVE_SCHEMA_VERSION`.
