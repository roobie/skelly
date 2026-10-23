---
read_if:
  - you're changing persistent simulation state, save identity or restore guarantees
  - you're changing the save envelope, required item history or deciding whether its schema number changes
  - you're changing how a save record is compressed or which size its caps bound
  - you're changing when the game autosaves
  - you're adding or removing a scheduler system, or replacing the known scheduler id list
  - you're deciding what happens to a save whose mod state no longer matches its mod
tags: [deadvox, adr, saves, persistence, determinism]
---

# 2. Save the simulation, not the runtime

[[THIS is_grounded_by: ../../DESIGN.md]]

**Status:** accepted.

## Decision

A save is an exact snapshot of one world and its bound character. Compare simulation fingerprint, save envelope schema, deterministic generator versions and content identity before resolving saved references through content. Content identity covers the evaluated content, not its pack sources; see [ADR 0008](0008-deterministic-world.md). The snapshot is the save's truth; a replay log beside it stays bounded. A Git revision is diagnostic, not identity. Exactness lets a restored scheduler, random stream and action continue as if save and load had not changed the simulation. A changed column is saved whole and installed instead of generated, so no saved edit is applied over regenerated terrain; generator identity protects the untouched terrain that regenerates and its seams against saved columns.

Bump `SAVE_SCHEMA_VERSION` when the save envelope or a required item-state contract changes. The version gives a named format refusal before resolving content, rather than treating missing owner history as state that can be reconstructed. Food exposure in particular cannot be inferred from provenance once storage environments can differ. See `src/core/saveFormat.ts`, `Envelope` and `decodeSave`, and `src/core/items.ts`, `ItemState`. The simulation fingerprint also protects payload shape and validation because `src/core/saveFormat.ts` is a simulation entry (`tools/simulationFingerprint.ts`, `SIMULATION_ENTRIES`). Simulation-rule and content-only changes need no schema bump: the fingerprint and content identity cover them. Concurrent version changes follow `docs/PROCESS.md`, "Save envelope version".

The save is one compressed record. Players place, and take apart for resources, a great many blocks and pieces, so saved state grows with play; compression keeps that cheap to store and write, and one record keeps each commit atomic. The checksum, the canonical check and the payload cap apply to the uncompressed envelope, so save identity never depends on a browser's compressor output. The payload cap bounds the decompressed size, and a bound derived from it is enforced while inflating, so a small record cannot expand without limit; the storage cap bounds the compressed record. See `src/core/saveFormat.ts`, `encodeSave` and `decodeSave`, and `src/game/saveStorageRecord.ts`, `SAVE_RECORD_MAX_BYTES`.

Bump `INPUT_REPLAY_SCHEMA_VERSION` only when a field of `src/game/inputReplay.ts`, `ReplayWire`, other than `startSave` changes, because those fields are parsed before the starting save's identity is checked. That starting save's ordinary checks then refuse a replay whose simulation or content differs, so a simulation change needs no replay bump.

Change a generator's id in `defaultVersion` when its output for the same seed and options changes. The fingerprint refuses that change too, but the id is the part of identity that says saved columns now border other terrain, and a refusal names it.

Persist every future-affecting owner state with the change that introduces it. Entity projections are explicit and exhaustive so each new field gets a save decision and unset optional runtime fields cannot leak into canonical saves; see `src/core/zombies.ts`, `projectSnapshot`. Keep input, rendering and external playback out of the snapshot. Debug toggles are not saved, while world changes made with them are. Presentation changes preserve save identity only when their modules remain outside the simulation dependency graph; gameplay rules remain fingerprinted.

A saved scheduler system id that no registered system has is a reference that does not resolve, so `decodeSave` refuses it as an incompatible save the controller leaves untouched, not later as a crash in `src/core/scheduler.ts`, `Scheduler.restoreState`. The ids it accepts are `src/core/schedulerIds.ts`, `KNOWN_SCHEDULER_IDS`, a typed list kept beside the registration sites. Systems register through `Scheduler.register` in four files, `src/core/sim.ts`, `Simulation`, `src/core/longAction.ts`, `LongActions`, `src/game/survival.ts`, `Survival`, and `src/game/session.ts`, and two of them, `src/game/session.ts` and `src/core/longAction.ts`, are held by open PRs #1106, #1097, #1095 and #1072, which is why the list is not yet derived from the sites. `test/saveSchedulerIds.test.ts` fails when a registered system is missing from the list, so a new system cannot be left out silently. When the last of those four PRs merges or closes, replace the list with one derived from the registration sites, so that each site declares its id once, and delete this paragraph's exception.

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
