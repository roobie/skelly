---
id: deadvox::adr-0002-saves
description: Decision for exact, versioned, crash-safe local saves of the Deadvox simulation
tags: [deadvox, adr, saves, persistence, determinism]
created: 2026-09-28
status: proposed
---

# 2. Save the simulation, not the runtime

[[THIS is_grounded_by: ../../SLICE-1.md]]
[[THIS is_grounded_by: ../../DESIGN.md]]

**Status:** proposed (2026-09-28).

## Context

Milestone 1.9 needs one local save slot, Continue/New world, autosave, and a CI
fixture that survives later updates. This is not just serializing a few counters:
the game is a mutable simulation whose state is spread across the scheduler,
player physics, items, piles, block entities, and shamblers. A restored session
must not silently re-roll the world, duplicate a killed spawn, lose an item, or
advance a scheduler on a different tick boundary.

The existing code provides useful foundations but no save API yet:

- `src/core/sim.ts`, `clock.ts`, `scheduler.ts`, `compression.ts`, and
  `events.ts` hold time, scheduler cursors, needs, compression and transient
  events. `Scheduler` tracks a `done` time and tick count per registered system;
  its current `time` alone is not enough to resume in the same order.
- `src/core/world.ts` stores sparse chunks; `Chunk.edited` distinguishes
  gameplay writes. `src/game/streamer.ts` regenerates unedited chunks from the
  seed and keeps edited chunks resident, but has no persistent diff index.
  `src/core/worldgen.ts`, `hamlet.ts`, `city.ts`, `site.ts`, and `loot.ts` make
  terrain, structures, furniture, zombie spawn points, and untouched loot
  deterministic from seed and position.
- `src/core/inventory.ts`, `items.ts`, and `handling.ts` contain nested item
  trees, hand/worn slots, piles, looted totals, monotonic item UIDs, and pending
  jobs. `ActionJob.apply` is a closure and cannot be serialized as-is.
- `src/core/blockEntities.ts` stores furniture/doors, contents, searched/open
  flags, and a monotonic UID. It indexes multi-cell entities by anchor and cell.
- `src/core/entities.ts` and `zombies.ts` hold zombie entity IDs and every
  behaviorally relevant AI/physics field. Each shambler has a behavior RNG;
  `ZombieSystem` also has a player-attack cooldown. `src/core/zombieSpawns.ts`
  keeps the session-lifetime set that prevents a killed shambler respawning when
  a generated column is visited again.
- `src/game/player.ts`, `rest.ts`, and `survival.ts` hold the player's body,
  needs, active rest/sleep action, light state, and real-time queue behavior.
  The game also has view-only state (meshes, workers, interpolation, cursor,
  audio nodes) that must be reconstructed, not persisted.

The current `main` baseline has no noise-ID allocator or per-shambler sound RNG;
its simulation events are interrupts, damage and death. Add any future
simulation-affecting noise sequence/RNG to the schema when that system lands.
Worldgen noise and position-keyed site/loot randomness are stateless functions
of the recorded seed, worldgen version, content, and coordinates; one-shot loot
RNG is consumed at generation/death and its result is the saved item tree. There
is no global advancing simulation RNG in this baseline. Each shambler's mutable
behavior RNG words are saved. The sound RNG, if separately introduced for each
shambler, is also saved to preserve its sequence; purely acoustic playback
queues and Web Audio nodes are never part of simulation state.

## Decision

### State boundary and exactness

Save a versioned **simulation snapshot** taken synchronously at a tick/frame
barrier, then encode and write that immutable copy in a worker. Store the
following state, using stable string IDs and item/entity IDs rather than object
references:

| State | On disk | Reason / restoration rule |
| --- | --- | --- |
| World identity | Save schema version; game/build revision; worldgen version; seed; clock ratio/start; site and generation options; ordered pack IDs, versions and canonical content hashes | These select the same generation rules and registry mapping. View radius is a user setting, not world identity. |
| Clock/simulation | Simulation time, clock settings, needs, death cause/time, god mode only for explicitly debug saves, compression `c`/active/interruption, and each scheduler system's stable ID, `done` time and tick count | Preserve time, exact scheduler ordering and active rest behavior; reject unknown system IDs rather than silently resetting their phase. |
| Player | Full body `pos`, `vel`, dimensions and `onGround`; yaw/pitch and walk toggle; needs; `Survival.lit` item UID (or absence); quickbar item UIDs | Position and velocity are saved even in mid-air. Input held keys, pointer lock, menu/cursor/focus are dropped; Continue always opens paused with inputs released. |
| Items | Recursive items including UID, type ID, count, condition, charges/on/made, pockets and grid placement; hands, worn slots, quickbar bindings, piles and looted totals; `ItemFactory.next` | Restore all items exactly, including empty bags, rotten-food timestamps and lights. Preserve monotonic UID allocation even when the highest-UID item was consumed. |
| Furniture/block entities | Anchor, type ID, size/facing, open/searched state and container pocket trees; `BlockEntities.nextUid` | Address entities by world anchor/type, not load-order-dependent object identity. Restore saved overrides when deterministic worldgen creates an anchor. |
| World edits | Only changed chunks, each with chunk coordinates, a palette of stable block content IDs, and RLE runs for changed cell offsets/IDs versus the versioned generated base | At the first write to a cell, journal its generated base ID; later writes update or remove the delta if the cell returns to base. Runtime block numbers are registry-order dependent. Store string IDs. Regenerate the base chunk, apply the diff, then rebuild meshes. Preserve explicit air edits. |
| Shamblers and spawn ledger | Every live entity ID and all future-affecting zombie fields (body, mode/timers/targets, health/cooldowns, motion and behavior RNG words); `ZombieSystem.playerAttackWait`; entity-store next ID; generated spawn keys already attempted, including killed shamblers; each independent sound RNG state if present | Recreate current threats and prevent dead or previously considered site spawns from coming back. Reinitialize `renderPrevious` from current pose; it is interpolation only. |
| In-flight jobs | Do **not** serialize closures or partial queue jobs. At the snapshot barrier cancel `HandlingQueue` jobs and clear the transient `searching` set. | Jobs apply only on completion; a partial move/search/eat/door action has not mutated its target yet. Canceling cannot duplicate or lose an item. Elapsed time remains elapsed; the player may retry. |
| Regenerated/runtime state | Drop unedited chunks, generated-column/dirty/in-flight mesh queues, worker state, event/audio queues after readers drain, render interpolation/feedback and gait phase, UI panels, held input, and pointer lock | These are derivable, frame-local, or external presentation state. Start paused, regenerate the visible ring, overlay saved diffs/entities, and drain events before taking a snapshot. |

A future system that adds a persistent counter, RNG stream, or state machine
must declare its save representation in the same change; “not currently in the
schema” is not permission to reset it on load. No noise ID exists in this
baseline; if noise events acquire IDs, persist the allocator and any queued
simulation events at the same barrier. Cosmetic audio events remain disposable.

The determinism contract is: for one game/content/worldgen build, from the same
snapshot and same subsequent deterministic input trace, N fixed simulation
steps without saving must deeply equal K steps, save/load, then N−K steps. Compare
the full runtime state at the end—not only a hash of fields selected by the
serializer—including the full generated world/chunk contents, entity/item trees
and allocators, scheduler cursors, RNG words, and player state. Add test-only
inspection/export APIs rather than letting the save serializer define what the
test considers “full state.” Use `assert.deepStrictEqual` (with explicit
number handling), not only a checksum. Save at a scheduler/frame barrier; record
all per-system cursors because recreating them from global time changes tick
ordering.

Worldgen version is a separate contract from save schema version. `worldgen-v1`
output is frozen by golden chunk fixtures over named seeds/coordinates. A later
generator must either keep the old generator available for old saves, or perform
an explicit, tested migration that materializes the old generated base before
switching versions. Never load an old world by silently applying current
worldgen to its seed. Content-dependent generation follows the same rule and
uses the recorded pack set/hashes.

JSON numeric values use ECMAScript's shortest round-trip representation. Encode
negative zero with a reserved tagged value (JSON otherwise writes it as `0`);
reject NaN and infinities. A round-trip test must check `Object.is` for finite
edge values, signed zero, subnormal values, and all live numeric fields. IDs and
counters must be safe integers and range-checked. This keeps the v1 save
inspectable without reducing simulation doubles to Float32.

### Format, IDs, and migrations

Use canonical UTF-8 JSON for the envelope, metadata, entities, items, and chunk
records in v1; chunk records use a per-chunk string palette plus maximal RLE
runs of changed blocks. This is inspectable and easy to migrate, and the
current workload stores only edited chunks, not the 1,800 loaded render chunks
at 96 m. Track per-cell deltas as edits happen so snapshotting copies the delta
journal instead of rescanning/regenerating whole chunks. Do not serialize runtime
block IDs or binary/Float32 simulation numbers. Include a format magic, `schemaVersion`, monotonically increasing
`generation`, exact payload byte length, and SHA-256 checksum over the canonical
payload (checksum excluded from its own input). Payloads over configured limits,
unknown required fields, duplicate IDs, invalid ranges, or malformed RLE are
rejected before restore.

Keep schema migrations as pure `vN -> vN+1` functions. Migrate in memory, run
all validation, and only then commit to the inactive slot; never overwrite the
last readable old save with a failed migration. A save from a newer unsupported
version is refused with an explanation and left intact. Record pack identity,
version and canonical content hash. A renamed ID needs an explicit migration
mapping. If an item ID is missing, preserve it as an inert unknown-item record
with its original ID and complete opaque payload (count, condition, charge,
contents, placement); never drop or merge it. Apply the same preserve-or-refuse
rule to unknown block/furniture/zombie IDs. If a required pack/worldgen version
is absent, refuse playable restore and offer recovery/export rather than
silently replacing its content.

Golden saves are immutable historical fixtures. CI loads every supported
fixture through every required migration and checks its expected semantic state.
Regenerate a **new current-version** golden only for an intentional format or
content/worldgen change, never to make a broken migration pass; retain old
fixtures and migration coverage. The v1 golden is made from a deterministic
hamlet scenario with edits, nested items, a searched container and a killed
shambler. Separate equivalence scenarios cover mid-air saves and active or
interrupted rest.

### Storage, browsers, and recovery

Use an origin-private file system (OPFS) dedicated worker and
`FileSystemSyncAccessHandle` when runtime feature detection confirms that the
complete path works. The synchronous handle is worker-only; the main thread
never waits on disk. As of 2026-09-28, MDN Browser Compat Data records OPFS
`getDirectory()` in Chrome 86, Firefox 111 and Safari 15.2, and
`createSyncAccessHandle()` in Chrome 102, Firefox 111 and Safari 15.2. Web Locks
are recorded from Chrome 69, Firefox 96 and Safari 15.4. These are minimum
reported versions, not a reason to UA-sniff: feature-test the APIs and fall
back on runtime failures. The deployed game is HTTPS, satisfying secure-context
requirements. Sources: [OPFS API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system),
[`createSyncAccessHandle`](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle),
[FileSystemFileHandle BCD](https://github.com/mdn/browser-compat-data/blob/main/api/FileSystemFileHandle.json),
[StorageManager BCD](https://github.com/mdn/browser-compat-data/blob/main/api/StorageManager.json),
[Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API),
[LockManager BCD](https://github.com/mdn/browser-compat-data/blob/main/api/LockManager.json).

If OPFS or sync handles are unavailable or fail, use IndexedDB for both slots
and their atomic commits; do not mix a half-written OPFS slot with an IDB
transaction. Use the same payload and checksum on both backends. Request
`navigator.storage.persist()` and report whether it was granted; check
`navigator.storage.estimate()` before a large commit. Persistent storage is
still not a backup and may be cleared by the user/profile. Quota or I/O failure
must leave the previous valid slot intact and surface a visible error; offer
save export/import as recovery rather than silently starting over.

The logical one-slot save is stored as internal A/B records. Under one exclusive
origin-wide Web Lock, read both generations, validate them, write the inactive
slot as generation+1, flush/close it, and only then report success. In OPFS,
truncate/write/flush the inactive file; in IndexedDB, read both slots, select
the next generation, and write the inactive record in one read-write
transaction. On load, validate length, schema and SHA-256 for each
slot and choose the highest-generation valid record. If one is corrupt, warn
but load the other. If both fail, refuse Continue loudly, retain/export both
records, and do not create a blank world over them. If Web Locks is unavailable,
use the IndexedDB-only atomic read/write transaction path; do not pretend
BroadcastChannel alone is a lock. Web Locks cover same-origin tabs, not another
browser profile or device.

### Snapshot timing and frame budget

Autosave every 2 in-game hours, on `visibilitychange` to hidden and best-effort
`pagehide`, and before starting sleep/rest compression. Take the immutable
snapshot synchronously at the next simulation barrier, then transfer its own
buffers (never detach live `Chunk` arrays) to a dedicated worker for RLE,
canonical encoding, checksum and storage. Coalesce triggers while a write is in
flight; the newest generation follows the current write under the same lock.
`pagehide` is best effort—browser termination is not guaranteed to wait for a
new async write—so periodic autosave and A/B recovery remain the durability
mechanism. Before sleep, capture the pre-compression state before beginning the
long action; later autosaves preserve the active `RestAction` and compression
state.

The measured reference-laptop budget at 96 m is 16.7 ms/frame; existing main-
thread work p95 is 3 ms looking, 4 ms jogging and 10 ms sprinting. The benchmark
has 1,800 loaded render chunks and 19.4 MiB of in-memory chunk data, but neither
is copied into a save. There is no save implementation measurement yet. For a
hamlet session with a player inventory, five buildings and the current two
spawn points, the snapshot is estimated below 1 MiB and below 1 ms p95 main-
thread time when only dirty chunks and dynamic state are copied; encoding and
disk I/O are worker work. This is an estimate, not a result. Keep a hard
instrumented target of at most 1 ms p95 snapshot time at 96 m (and no frame over
16.7 ms); if measurement misses, reduce the snapshot surface or copy incrementally
at barriers, never move serialization/disk work onto the frame. CI also checks a
10-game-hour save is under 50 MiB and loads/migrates in under 5 s, matching
`CHALLENGES.md`'s save targets.

### Continue, New world, and implementation plan

Continue is enabled only after one slot validates and migrations complete; it
restores a paused world, then rebuilds derived renderer/streamer state. New
world asks before replacing the logical save. Keep the old A/B generation until
the new world's first snapshot is committed, so a crash during world creation
cannot destroy the previous run.

1. **Snapshot/restore without storage.** Add explicit state export/restore APIs
   for scheduler, simulation, world diffs, player, inventory, furniture,
   piles, zombie system and spawn ledger. Replace closure-only queued actions
   with a snapshot barrier that safely cancels them. Done when a deterministic
   scenario fails if any future-affecting field is omitted and the N vs K/save/
   load/N−K deep-state equivalence test passes, including a mid-air player and
   active/interrupted rest.
2. **Format and migrations.** Implement canonical JSON, validators, stable IDs,
   unknown-content preservation, `worldgen-v1`, and schema migration dispatch.
   Done when number round trips are `Object.is`-exact, malformed/unknown
   payloads refuse loudly, ID renames use explicit maps, and the immutable v1
   golden loads with exact state.
3. **Storage layer.** Implement worker-side OPFS A/B writes, SHA-256 and flush;
   feature-detected IndexedDB path; Web Lock; persist/quota reporting; corruption
   and truncation corpus. Done when kill-at-each-write-stage tests always load
   the old or new complete generation, never a partial one, on both backends
   and in two-tab contention tests.
4. **Autosave and title screen.** Add 2-game-hour, hidden/pagehide and
   pre-sleep triggers; Continue/New world and explicit errors/recovery. Done
   when browser tests cover each trigger, refresh/resume, both backends, and a
   failed storage write leaves Continue on the previous valid generation.
5. **Golden CI and budget.** Keep immutable old fixtures and migration tests;
   add save-size/load-time checks and a hamlet snapshot-frame benchmark. Done
   when CI checks the 10-hour <50 MiB and <5 s limits, the 1 ms p95 snapshot
   bound is demonstrated on the reference laptop, and every historical golden
   still migrates.

## Consequences

- Exact resume requires explicit state contracts in systems that currently hide
  state in private fields (scheduler cursors, entity allocators, zombie spawn
  ledger). Adding a stateful system also adds a save/migration obligation.
- The snapshot boundary intentionally cancels partially completed handling
  actions; they have not applied yet, so inventory/world outcomes remain safe,
  but the elapsed handling progress is lost. Player mid-air state and active
  rest/compression are preserved rather than teleported or reset.
- JSON is inspectable and migration-friendly; RLE chunk diffs keep ordinary
  saves small. Checksums detect damage, not malicious tampering. A/B slots and
  persistence requests reduce corruption/eviction risk but are not backups.
- Worldgen compatibility is a long-lived obligation: changing generation
  algorithms requires retaining old code or an explicit materializing
  migration. The format does not silently trade old-world correctness for the
  convenience of using latest worldgen.
- Save frame time and size are estimates until the implementation benchmark
  proves them. The stated targets are gates, not claimed measurements.

## Open questions for BR

1. Should a save made under `?debug=1` preserve debug-only god mode/noclip/build
   toggles? **Recommendation:** keep debug worlds outside the player-save
   contract and force those toggles off on load; debug interventions already
   made to world state remain saved.
2. Should pagehide attempt to block for the worker's final flush? **Recommendation:**
   no; browsers do not guarantee async work survives page teardown, so use the
   already-built snapshot best-effort and rely on periodic A/B checkpoints.
3. Is retaining old worldgen code acceptable when a later generator changes?
   **Recommendation:** yes for supported saves; otherwise an explicit,
   tested materializing migration is required before releasing that generator.

## Grounding and browser facts

Code sources are linked in Context and the state table. The compatibility minima
above were checked 2026-09-28 in MDN Browser Compat Data at
[`FileSystemFileHandle.json`](https://github.com/mdn/browser-compat-data/blob/main/api/FileSystemFileHandle.json),
[`StorageManager.json`](https://github.com/mdn/browser-compat-data/blob/main/api/StorageManager.json),
and [`LockManager.json`](https://github.com/mdn/browser-compat-data/blob/main/api/LockManager.json).
