---
id: deadvox::adr-0002-saves
description: Decision for exact, versioned, crash-safe local saves of the Deadvox simulation
tags: [deadvox, adr, saves, persistence, determinism]
created: 2026-09-28
status: accepted
---

# 2. Save the simulation, not the runtime

[[THIS is_grounded_by: ../../SLICE-1.md]]
[[THIS is_grounded_by: ../../DESIGN.md]]

**Status:** accepted (2026-09-28). BR's rulings are recorded under [Rulings](#rulings-2026-09-28).

## Context

Milestone 1.9 needs one local save slot, Continue/New world, autosave, and a CI
fixture that round-trips through the current build. This is not just serializing
a few counters: the game is a mutable simulation whose state is spread across
the scheduler, player physics, items, piles, block entities, and shamblers. A
restored session must not silently re-roll the world, duplicate a killed spawn,
lose an item, or advance a scheduler on a different tick boundary.

The save deliberately matches one exact game version rather than migrating
across deploys. BR's rationale (2026-09-28): code will churn heavily, there will
not be permanent players for some time, and playtesting is feature-focused—not
keeping one character alive for months. A playtester's save ceasing to load on
the next deploy is acceptable for these short, feature-focused sessions. Revisit
this tradeoff when players need to carry characters across releases; that would
be a hard fork.

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
  On `origin/deadvox/audio`, `play.ts` also holds `vocalNoiseId` and the current
  `vocalNoise`; these feed player sounds into zombie hearing. Its footstep clock
  and airborne peak only schedule footsteps/landing cues. Their content has
  `noise.enabled: false`, so they do not affect hearing. `GameAudio`'s
  `SoundPicker` state also matters: a suppressed event makes `playPlayerSound`
  return before it creates a vocal noise. Meshes, workers, interpolation,
  cursor, and Web Audio nodes are reconstructed, not persisted.

The save schema must include the live audio-branch state now, not defer it as a
future possibility: `vocalNoiseId` and active `vocalNoise` (id, position,
radius, expiry) affect zombie hearing; each zombie's `lastVocalNoiseId` prevents
reprocessing a heard event. Preserve those exactly. Save each zombie's
`soundRng` and `idleSoundTimer`, and the `SoundPicker` per-event RNG,
`lastVariant`, and `lastPlayedAt`, to preserve event selection/cooldowns; the
picker's cooldown also gates whether a vocal-noise stimulus is created. Player
footstep cadence (`footstepClock`) and `airbornePeakY` are presentation-only and
may be reset on load: footstep and hard-landing sounds have hearing disabled.
Worldgen noise and position-keyed site/loot randomness are stateless functions
of the recorded seed, worldgen version, content, and coordinates; one-shot loot
RNG is consumed at generation/death and its result is the saved item tree. There
is no global advancing simulation RNG. Each shambler's mutable behavior RNG
words are saved. Purely acoustic playback queues and Web Audio nodes are never
part of simulation state.

## Decision

### State boundary and exactness

Save a versioned **simulation snapshot** taken synchronously at a tick/frame
barrier, then encode and write that immutable copy in a worker. Store the
following state, using stable string IDs and item/entity IDs rather than object
references:

| State | On disk | Reason / restoration rule |
| --- | --- | --- |
| Version and world identity | Exact `versionIdentity` plus its components: game build revision, save schema version, worldgen version, and ordered pack IDs/versions/canonical content hashes; seed; clock ratio/start; site and generation options | `versionIdentity` is SHA-256 of the canonical tuple of those four version components. Require exact equality before content lookup or restore; refuse mismatches with the save's identity and leave the record untouched. These select the same generation rules and registry mapping. View radius is a user setting, not world identity. |
| Clock/simulation | Simulation time, clock settings, needs, death cause/time, compression `c`/active/interruption, and each scheduler system's stable ID, `done` time and tick count | Preserve time, exact scheduler ordering and active rest behavior; do not save or restore god mode/noclip/build toggles (force them off on load). Debug interventions already made to the world remain in its saved state. Reject unknown system IDs rather than silently resetting their phase. |
| Player | Full body `pos`, `vel`, dimensions and `onGround`; yaw/pitch and walk toggle; needs; `Survival.lit` item UID (or absence); quickbar item UIDs | Position and velocity are saved even in mid-air. Input held keys, pointer lock, menu/cursor/focus are dropped; Continue always opens paused with inputs released. |
| Items | Recursive items including UID, type ID, count, condition, charges/on/made, pockets and grid placement; hands, worn slots, quickbar bindings, piles and looted totals; `ItemFactory.next` | Restore all items exactly, including empty bags, rotten-food timestamps and lights. Preserve monotonic UID allocation even when the highest-UID item was consumed. |
| Furniture/block entities | Anchor, type ID, size/facing, open/searched state and container pocket trees; `BlockEntities.nextUid` | Address entities by world anchor/type, not load-order-dependent object identity. Restore saved overrides when deterministic worldgen creates an anchor. |
| World edits | Only changed chunks, each with chunk coordinates, a palette of stable block content IDs, and RLE runs for changed cell offsets/IDs versus the versioned generated base | At the first write to a cell, journal its generated base ID; later writes update or remove the delta if the cell returns to base. Runtime block numbers are registry-order dependent. Store string IDs. Regenerate the base chunk, apply the diff, then rebuild meshes. Preserve explicit air edits. |
| Shamblers and spawn ledger | Every live entity ID and all future-affecting zombie fields (body, mode/timers/targets, health/cooldowns, motion and behavior RNG words); `ZombieSystem.playerAttackWait`; entity-store next ID; generated spawn keys already attempted, including killed shamblers; each zombie's `soundRng`, `idleSoundTimer`, and `lastVocalNoiseId` | Recreate current threats and prevent dead or previously considered site spawns from coming back. Sound RNG/timer preserve the ambient audio sequence; `lastVocalNoiseId` is required for exact hearing behavior. Reinitialize `renderPrevious` from current pose; it is interpolation only. |
| Player audio state | `vocalNoiseId`, active `vocalNoise` (id, position, radius, expiry), and per-event `SoundPicker` RNG/`lastVariant`/`lastPlayedAt`; omit `footstepClock` and `airbornePeakY` | Noise and the picker cooldown gate zombie hearing and must continue exactly. Footstep cadence and landing peak only schedule sounds whose content disables hearing, so reset them on load. |
| In-flight jobs | Do **not** serialize closures or partial queue jobs. The snapshot copy represents pending `HandlingQueue` jobs as canceled and clears its transient `searching` set; it must not cancel or mutate the live queue/set. | Jobs apply only on completion; a partial move/search/eat/door action has not mutated its target yet. On load, the player can retry; the live session continues its job with its original progress and timing. |
| Regenerated/runtime state | Drop unedited chunks, generated-column/dirty/in-flight mesh queues, worker state, event/audio playback queues after readers drain, render interpolation/feedback, footstep cadence and airborne peak, UI panels, held input, and pointer lock | These are derivable, frame-local, or external presentation state. Start paused, regenerate the visible ring, overlay saved diffs/entities, and drain events before taking a snapshot. |

A future system that adds a persistent counter, RNG stream, or state machine
must declare its save representation in the same change; “not currently in the
schema” is not permission to reset it on load. The current audio branch already
has an ID allocator and active noise stimulus, so both are included above;
queued acoustic playback remains disposable.

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

The exact version identity binds the worldgen and content rules to the save.
Worldgen determinism is required within that exact build and is exercised by the
save/load equivalence tests; old generator implementations are not retained for
cross-version restore. A different worldgen, schema, build revision, or content
hash is a different identity and is refused before any content lookup.

JSON numeric values use ECMAScript's shortest round-trip representation. Encode
negative zero with a reserved tagged value (JSON otherwise writes it as `0`);
reject NaN and infinities. A round-trip test must check `Object.is` for finite
edge values, signed zero, subnormal values, and all live numeric fields. IDs and
counters must be safe integers and range-checked. This keeps the v1 save
inspectable without reducing simulation doubles to Float32.

### Format and exact version refusal

Use canonical UTF-8 JSON for the envelope, metadata, entities, items, and chunk
records; chunk records use a per-chunk string palette plus maximal RLE runs of
changed blocks. This keeps the current workload to edited chunks rather than
the 1,800 loaded render chunks at 96 m. Track per-cell deltas as edits happen
so snapshotting copies the delta journal instead of rescanning/regenerating
whole chunks. Do not serialize runtime block IDs or binary/Float32 simulation
numbers. Include a format magic, `schemaVersion`, `versionIdentity`,
monotonically increasing `generation`, exact payload byte length, and SHA-256
checksum over the canonical payload (checksum excluded from its own input).
Payloads over configured limits, unknown required fields, duplicate IDs,
invalid ranges, malformed RLE, or an identity mismatch are rejected before
restore.

The save's exact version identity is the SHA-256 of a canonical tuple containing
the game build revision, save schema version, worldgen version, and ordered
content-pack IDs/versions/canonical hashes; store the components as well as the
digest for diagnosis. Require an exact identity match before looking up any
content IDs. On mismatch, explain the save's build/version identity and refuse
the load; leave its bytes untouched and never upgrade or overwrite it. Under an
exact match, missing/renamed IDs indicate corruption or a violated build
contract and are rejected; there is no unknown-content preservation or ID
migration in v1. There are no `vN -> vN+1` functions or cross-version restore
path in 1.9.

CI's save round-trip fixture is generated by the current build, not retained as
an immutable historical save: generate a deterministic hamlet scenario with
edits, nested items, a searched container, and a killed shambler; write it with
the current serializer, load it with the current reader, and compare the exact
semantic state. This tests the format the build actually ships without
promising old-build compatibility. Separate equivalence scenarios cover
mid-air saves and active or interrupted rest. A version-mismatch refusal test
must verify both the clear refusal and byte-for-byte preservation of the save.

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

Each exact `versionIdentity` has its own logical one-slot save, stored as
internal A/B records in a version-keyed namespace. Under one exclusive
origin-wide Web Lock, read both generations in the current identity namespace,
validate them, write the inactive slot as generation+1, flush/close it, and only
then report success. In OPFS, truncate/write/flush the inactive file; in
IndexedDB, read both slots, select the next generation, and write the inactive
record in one read-write transaction. Continue reads only the current build's
namespace; it never adopts or overwrites another identity's records. On load,
validate length, schema, identity and SHA-256 for each slot and choose the
highest-generation valid record. If one is corrupt, warn but load the other. If
both fail, refuse Continue loudly, retain/export both records, and do not
create a blank world over them. If Web Locks is unavailable,
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
10-game-hour save is under 50 MiB and validates/loads in under 5 s, matching
`CHALLENGES.md`'s save targets.

### Continue, New world, and implementation plan

Continue is enabled only after one slot validates and its `versionIdentity`
exactly matches the running build; it restores a paused world, then rebuilds
derived renderer/streamer state. Keep save namespaces keyed by exact version
identity, each with its own A/B records. An incompatible save remains in its
original namespace and is never overwritten by Continue or New world in another
version, so it can be opened later with its matching build. New world asks
before replacing the current version's logical save and keeps its prior A/B
generation until the new world's first snapshot commits.

1. **Snapshot/restore without storage.** Add explicit state export/restore APIs
   for scheduler, simulation, world diffs, player, inventory, furniture,
   piles, zombie system and spawn ledger. Replace closure-only queued actions
   with a snapshot barrier that projects pending jobs as canceled in the saved
   copy only; never cancel or mutate the live queue. Done when a deterministic
   scenario fails if any future-affecting field is omitted and the N vs K/save/
   load/N−K deep-state equivalence test passes, including a mid-air player,
   active/interrupted rest, and vocal noise. An autosave during a handling job
   must not change that live job's outcome or timing; after restore, its target
   is untouched and the player may retry.
2. **Format and version refusal.** Implement canonical JSON, validators, stable
   IDs, and exact `versionIdentity` matching; do not implement migrations or
   unknown-content preservation. Done when number round trips are
   `Object.is`-exact, malformed payloads refuse loudly, and a version-mismatch
   test proves refusal occurs before content lookup and leaves the save bytes
   unchanged.
3. **Storage layer.** Implement worker-side OPFS A/B writes, SHA-256 and flush;
   feature-detected IndexedDB path; Web Lock; persist/quota reporting; corruption
   and truncation corpus. Done when kill-at-each-write-stage tests always load
   the old or new complete generation, never a partial one, on both backends
   and in two-tab contention tests.
4. **Autosave and title screen.** Add 2-game-hour, hidden/pagehide and
   pre-sleep triggers; Continue/New world and explicit errors/recovery. Done
   when browser tests cover each trigger, refresh/resume, both backends, and a
   failed storage write leaves Continue on the previous valid generation.
5. **Round-trip CI and budget.** Generate a deterministic save with the current
   build in CI and require the same build to read it back exactly; add
   save-size/load-time checks and a hamlet snapshot-frame benchmark. Done when CI
   checks the 10-hour <50 MiB and <5 s limits, the 1 ms p95 snapshot bound is
   demonstrated on the reference laptop, and the current-build round trip
   passes.

## Consequences

- Exact resume requires explicit state contracts in systems that currently hide
  state in private fields (scheduler cursors, entity allocators, zombie spawn
  ledger). Adding a stateful system also adds a save-contract obligation within
  this exact version.
- A save omits partially completed handling actions; their targets have not
  been applied, so the restored player may retry and loses the saved job's
  elapsed progress. This is a projection in the immutable snapshot only: taking
  an autosave never cancels or changes the live job's outcome or timing. Player
  mid-air state and active rest/compression are preserved rather than teleported
  or reset.
- JSON is inspectable; RLE chunk diffs keep ordinary saves small. Checksums
  detect damage, not malicious tampering. A/B slots and
  persistence requests reduce corruption/eviction risk but are not backups.
- Compatibility is intentionally strict: changing the build, schema, worldgen,
  or content identity prevents loading that save in the changed version. Thus a
  playtester's save stops loading on the next deploy; this is acceptable while
  sessions are short and feature-focused, and permanent players are not yet the
  product. Version-keyed storage preserves it for a matching build rather than
  silently applying new rules. Revisit when characters need to persist across
  releases; version selection or migration would then be a hard fork.
- Save frame time and size are estimates until the implementation benchmark
  proves them. The stated targets are gates, not claimed measurements.

## Rulings (2026-09-28)

BR accepted the recommendations for debug saves and `pagehide`, and ruled for
strict version identity:

1. **Debug saves:** keep god mode/noclip/build toggles outside the save contract
   and force them off on load; world changes already made remain saved.
2. **`pagehide`:** do not block for a worker flush. Treat it as best-effort and
   rely on periodic A/B checkpoints.
3. **Versions:** require an exact version match and refuse mismatches without
   modifying the save. Future version selection and migration are a hard fork,
   not part of 1.9.

## Future work (out of scope for 1.9)

A version picker may launch a specifically selected game build (for example,
versioned deploy paths on Pages) so an old save can be played with its matching
version. Schema/worldgen/content migrations may be considered later as a hard
fork; 1.9 neither implements nor promises them.

## Grounding and browser facts

Code sources are linked in Context and the state table. The compatibility minima
above were checked 2026-09-28 in MDN Browser Compat Data at
[`FileSystemFileHandle.json`](https://github.com/mdn/browser-compat-data/blob/main/api/FileSystemFileHandle.json),
[`StorageManager.json`](https://github.com/mdn/browser-compat-data/blob/main/api/StorageManager.json),
and [`LockManager.json`](https://github.com/mdn/browser-compat-data/blob/main/api/LockManager.json).
