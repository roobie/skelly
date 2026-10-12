---
read_if:
  - you're changing persistent simulation state, save identity or restore guarantees
  - you're changing the save envelope or deciding whether its schema number changes
  - you're changing when the game autosaves
tags: [deadvox, adr, saves, persistence, determinism]
---

# 2. Save the simulation, not the runtime

[[THIS is_grounded_by: ../../DESIGN.md]]

**Status:** accepted.

## Decision

A save is an exact snapshot of one world and its bound character. Compare simulation fingerprint, save envelope schema, deterministic generator versions and ordered content identities before resolving saved references through content. A Git revision is diagnostic, not identity. Exactness lets a restored scheduler, random stream and action continue as if save and load had not changed the simulation. Generator identity also protects saved chunk edits from being applied over different terrain.

Bump `SAVE_SCHEMA_VERSION` only when the save envelope changes: the fields or layout that `decodeSave` must read before comparing identity. The simulation fingerprint already identifies changes to the payload; the envelope number remains necessary to parse and diagnose incompatible records. Bumping it for every simulation or payload change adds manual version churn without identifying another incompatibility. Apply the same rule to `INPUT_REPLAY_SCHEMA_VERSION`: bump it when the replay envelope changes, not merely when simulation state changes. Replay embeds a starting save, whose ordinary identity checks reject incompatible simulation and content. See `src/game/inputReplay.ts`, `INPUT_REPLAY_SCHEMA_VERSION`.

Persist every future-affecting owner state with the change that introduces it. Entity projections are explicit and exhaustive so each new field gets a save decision and unset optional runtime fields cannot leak into canonical saves; see `src/core/zombies.ts`, `projectSnapshot`. Keep input, rendering and external playback out of the snapshot. Debug toggles are not saved, while world changes made with them are. Presentation changes preserve save identity only when their modules remain outside the simulation dependency graph; gameplay rules remain fingerprinted.

Write snapshots through crash-safe A/B records. Disk work is asynchronous; a failed write leaves the previous valid record available. A back/forward-cache transition does not require another save: a frozen page can hold the origin lock, so the last committed generation remains the recovery point. These safeguards reduce corruption risk but are not backups.

After death, do not offer a death-bearing world for Continue. Mark death before the asynchronous final write so an unfinished write cannot revive the survivor; clear that marker only after another world's snapshot completes. Whether a new character may enter the same world after death remains an open decision for BR.

Autosave checkpoints count simulated play time, not wall-clock time or game hours. Pausing therefore does not advance the interval, and changing the clock ratio does not change its cadence. Saves before sleep, on `visibilitychange` and on `pagehide` cover the time between periodic checkpoints.

## Compatibility

Cross-version restore and migration are not supported before v1.0 beta. A changed simulation, schema, generator or content identity is a different world, not an implicit upgrade. Preserve and refuse mismatched records; before the compatibility milestone, BR chooses between selecting a matching build and migrating old saves.

The save boundary lets mutable simulation state resume exactly while the running version rebuilds browser storage, rendering and input. See `src/core/saveState.ts`, `snapshotSession`, and `src/core/saveFormat.ts`, `decodeSave` and `SAVE_SCHEMA_VERSION`.
