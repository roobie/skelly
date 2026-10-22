---
read_if:
  - you're changing persistent simulation state, save identity or restore guarantees
  - you're changing the save envelope or deciding whether its schema number changes
  - you're changing how a save record is compressed or which size its caps bound
  - you're changing when the game autosaves
  - you're deciding what happens to a save whose mod state no longer matches its mod
tags: [deadvox, adr, saves, persistence, determinism]
---

# 2. Save the simulation, not the runtime

[[THIS is_grounded_by: ../../DESIGN.md]]

**Status:** accepted.

## Decision

A save is an exact snapshot of one world and its bound character. Compare simulation fingerprint, save envelope schema, deterministic generator versions and content identity before resolving saved references through content. Content identity covers the evaluated content, not its pack sources; see [ADR 0008](0008-deterministic-world.md). The snapshot is the save's truth; a replay log beside it stays bounded. A Git revision is diagnostic, not identity. Exactness lets a restored scheduler, random stream and action continue as if save and load had not changed the simulation. Generator identity also protects saved chunk edits from being applied over different terrain.

Bump `SAVE_SCHEMA_VERSION` only when the save envelope changes: a field of `src/core/saveFormat.ts`, `Envelope`, other than its payload. `decodeSave` parses those fields before it can read the saved identity, so the number is what lets a build refuse, and name, a record whose header it cannot parse. A payload change never bumps it. `src/core/saveFormat.ts` is a simulation entry (`tools/simulationFingerprint.ts`, `SIMULATION_ENTRIES`), so any change to the payload's shape or its validation already changes the simulation fingerprint; a bump would refuse the same saves twice and add a hand-kept number that merging PRs must race for (`docs/PROCESS.md`, "Save envelope version"). Simulation rules and content need no bump either, since the fingerprint and content identity cover them.

The save is one compressed record. Players place, and take apart for resources, a great many blocks and pieces, so saved state grows with play; compression keeps that cheap to store and write, and one record keeps each commit atomic. The checksum, the canonical check and the payload cap apply to the uncompressed envelope, so save identity never depends on a browser's compressor output. The payload cap bounds the decompressed size and is enforced while inflating, so a small record cannot expand without limit; the storage cap bounds the compressed record. See `src/core/saveFormat.ts`, `encodeSave` and `decodeSave`, and `src/game/saveStorageRecord.ts`, `SAVE_RECORD_MAX_BYTES`.

Bump `INPUT_REPLAY_SCHEMA_VERSION` only when a field of `src/game/inputReplay.ts`, `ReplayWire`, other than `startSave` changes, because those fields are parsed before the starting save's identity is checked. That starting save's ordinary checks then refuse a replay whose simulation or content differs, so a simulation change needs no replay bump.

Change a generator's id in `defaultVersion` when its output for the same seed and options changes. The fingerprint refuses that change too, but the id is the part of identity that says saved chunk edits now belong to other terrain, and a refusal names it.

Persist every future-affecting owner state with the change that introduces it. Entity projections are explicit and exhaustive so each new field gets a save decision and unset optional runtime fields cannot leak into canonical saves; see `src/core/zombies.ts`, `projectSnapshot`. Keep input, rendering and external playback out of the snapshot. Debug toggles are not saved, while world changes made with them are. Presentation changes preserve save identity only when their modules remain outside the simulation dependency graph; gameplay rules remain fingerprinted.

Write snapshots through crash-safe A/B records. Disk work is asynchronous; a failed write leaves the previous valid record available. A back/forward-cache transition does not require another save: a frozen page can hold the origin lock, so the last committed generation remains the recovery point. These safeguards reduce corruption risk but are not backups.

After death, do not offer a death-bearing world for Continue. Mark death before the asynchronous final write so an unfinished write cannot revive the survivor; clear that marker only after another world's snapshot completes. Whether a new character may enter the same world after death remains an open decision for BR.

A completed scenario checkpoints its terminal outcome without treating the write
request as durable success. Only storage acknowledgement grants that claim;
failure leaves the prior record available and ordinary save recovery visible.
Continue of an acknowledged completion shows the terminal card, not a playable
pre-win survivor. Unlike death, an unsaved win does not invalidate the older
checkpoint: losing an unacknowledged completion is not resurrection. See
`src/ui/saveController.ts`, `finishWin` and `winCheckpointStatus`.

Autosave checkpoints count simulated play time, not wall-clock time or game hours. Pausing therefore does not advance the interval, and changing the clock ratio does not change its cadence. Saves before sleep, on `visibilitychange` and on `pagehide` cover the time between periodic checkpoints.

## Compatibility

Cross-version restore and migration are not supported before v1.0 beta (#1023). A changed simulation, schema, generator or content identity is a different world, not an implicit upgrade. Preserve and refuse mismatched records; before #1023 closes, BR chooses between selecting a matching build and migrating old saves.

Mod state that no longer matches its mod is refused the same way as a pack mismatch, neither dropped nor migrated by the mod. The game and the modding framework own this policy and a mod has no say in it, so one restore rule covers every pack and mod and no mod can change what a save restores.

The save boundary lets mutable simulation state resume exactly while the running version rebuilds browser storage, rendering and input. See `src/core/saveState.ts`, `snapshotSession`, and `src/core/saveFormat.ts`, `decodeSave` and `SAVE_SCHEMA_VERSION`.
