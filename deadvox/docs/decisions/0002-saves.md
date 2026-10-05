---
id: deadvox::adr-0002-saves
description: Decision for exact, versioned, crash-safe local saves of the Deadvox simulation
read_if:
  - you're changing persistent simulation state or restore guarantees
  - you're evaluating the save-format decision
tags: [deadvox, adr, saves, persistence, determinism]
created: 2026-09-28
status: accepted
---

# 2. Save the simulation, not the runtime

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
  `noise.enabled: false`, so they do not affect hearing. The session's
  `SoundPicker` state also matters: a cooldown-suppressed event makes `playPlayerSound`
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
part of simulation state. The session owns admission and the saved picker; it commits
hearing before emitting a selected sound to the void playback adapter. Missing assets,
locked/muted output and decode failures cannot veto that admission. Observational
`sound`/`noise` events are transient; the existing picker/vocal-noise save fields remain
authoritative. F4 deliberately changes the simulation fingerprint, not the save schema.

## Decision

### State boundary and exactness

Save a versioned **simulation snapshot** taken synchronously at a tick/frame
barrier, then encode and write that immutable copy in a worker. Store the
following state, using stable string IDs and item/entity IDs rather than object
references:

| State | On disk | Reason / restoration rule |
| --- | --- | --- |
| Version and world identity | Exact `versionIdentity` plus its components: simulation-source fingerprint; save schema version; deterministic generator versions (worldgen and, once firearms are introduced, gungen); ordered pack IDs/versions/canonical content hashes; diagnostic Git build revision; seed; clock ratio/start; site and generation options | `versionIdentity` is SHA-256 of the canonical tuple of the simulation fingerprint, schema, generator map and ordered pack identities. The Git build revision is stored alongside as diagnostic metadata, outside the digest and compatibility check. Require exact identity equality before content lookup or restore; refuse mismatches with the save's identity and leave the record untouched. These select the same generation rules and registry mapping. View radius is a user setting, not world identity. |
| Clock/simulation | Simulation time, clock settings, needs, death cause/time, compression `c`/active/interruption, and each scheduler system's stable ID, `done` time and tick count | Preserve time, exact scheduler ordering and active rest behavior; do not save or restore god mode/noclip/build toggles (force them off on load). Debug interventions already made to the world remain in its saved state. Reject unknown system IDs rather than silently resetting their phase. |
| Player | Full body `pos`, `vel`, dimensions and `onGround`; yaw/pitch and walk toggle; needs; `Survival.lit` item UID (or absence); quickbar item UIDs and their held-item return targets | Position and velocity are saved even in mid-air. Input held keys, pointer lock, menu/cursor/focus are dropped; Continue always opens paused with inputs released. The return target persists because a quickbar tap must still put a drawn item back where it came from after Continue. |
| Items | Recursive items including UID, type ID, count, condition, charges/on/made, pockets and grid placement; hands, worn slots, quickbar bindings, piles and looted totals; `ItemFactory.next` | Restore all items exactly, including empty bags, rotten-food timestamps and lights. Preserve monotonic UID allocation even when the highest-UID item was consumed. |
| Furniture/block entities | Anchor, type ID, size/facing, open/searched state and container pocket trees; `BlockEntities.nextUid` | Address entities by world anchor/type, not load-order-dependent object identity. Restore saved overrides when deterministic worldgen creates an anchor. |
| World edits | Only changed chunks, each with chunk coordinates, a palette of stable block content IDs, and RLE runs for changed cell offsets/IDs versus the versioned generated base | At the first write to a cell, journal its generated base ID; later writes update or remove the delta if the cell returns to base. Runtime block numbers are registry-order dependent. Store string IDs. Regenerate the base chunk, apply the diff, then rebuild meshes. Preserve explicit air edits. |
| Shamblers and spawn ledger | Every live entity ID and all future-affecting zombie fields (body, mode/timers/targets, health/cooldowns, motion and behavior RNG words), including each zombie's `dismemberRng` words (the severing rolls' own stream), `attackWindup` (seconds left in an in-flight attack's telegraph, 0 when not attacking) and `severed` (part names dismembered so far, e.g. `["upperArm.L"]` — cumulative, never shrinks); `ZombieSystem.playerAttackWait`; entity-store next ID; generated spawn keys already attempted, including killed shamblers; each zombie's `soundRng`, `idleSoundTimer`, and `lastVocalNoiseId` | Recreate current threats and prevent dead or previously considered site spawns from coming back. Sound RNG/timer preserve the ambient audio sequence; `lastVocalNoiseId` is required for exact hearing behavior. `attackWindup` must resume exactly so a save/load mid-windup neither skips nor replays the hit resolution. `severed` is the renderer's only source of truth for which limbs to hide (mobgen's `severedBoneSet` expands it) — a corpse's or debris's own render-only lifecycle state is never saved, only which parts were severed while the zombie was still alive. Reinitialize `renderPrevious` from current pose; it is interpolation only. |
| Player audio state | `vocalNoiseId`, active `vocalNoise` (id, position, radius, expiry), and per-event `SoundPicker` RNG/`lastVariant`/`lastPlayedAt`; omit `footstepClock` and `airbornePeakY` | Noise and the picker cooldown gate zombie hearing and must continue exactly. Footstep cadence and landing peak only schedule sounds whose content disables hearing, so reset them on load. |
| In-flight jobs | The live queue uses tagged data descriptors (`jobType` plus serializable parameters, elapsed time and duration), not closures. Step 1 converts the current handling jobs to this representation. The 1.9 snapshot omits pending descriptors and clears its transient `searching` set in the saved copy only; it must not cancel or mutate the live queue/set. | Descriptors leave room for later resumable long actions. In 1.9, jobs still apply only on completion; the saved target is untouched and the player can retry. The live session keeps its original job progress and timing. |
| Regenerated/runtime state | Drop unedited chunks, generated-column/dirty/in-flight mesh queues, worker state, event/audio playback queues after readers drain, render interpolation/feedback, footstep cadence and airborne peak, UI panels, held input, and pointer lock | These are derivable, frame-local, or external presentation state. Start paused, regenerate the visible ring, overlay saved diffs/entities, and drain events before taking a snapshot. |

Runtime ownership follows the same boundary: inventory roots (hands, worn items,
piles and furniture) and their pocket trees own Item instances. Quickbar bindings
and the selected light store non-owning UIDs and resolve through the inventory's
canonical live lookup; a removed live binding becomes empty before serialization.
The quickbar's captured source is a target, not another item owner: see
`src/core/inventory.ts`, `Inventory.quickbarOrigin` and `Inventory.snapshotState`,
and `src/core/saveFormat.ts`, `SAVE_SCHEMA_VERSION`. Its schema and source
fingerprint change together because the return behavior must survive a restore.
The synchronous snapshot barrier checks that every emitted quickbar/light UID is
still owned. Restore refuses a dangling saved UID rather than silently repairing
it. Full consumption, including a container subtree, and whole-stack merging end
an item's lifetime; transfers and partial consumption do not. Future crafting and
take-apart actions must consume through this same inventory ownership boundary.

A future system that adds a persistent counter, RNG stream, or state machine
must declare its save representation in the same change; “not currently in the
schema” is not permission to reset it on load. The current audio branch already
has an ID allocator and active noise stimulus, so both are included above;
queued acoustic playback remains disposable.

### World and character boundary

BR ruled (2026-09-28): “a save is a world and a character, because you can't
world-hop; it's committed to that world, and the world is the foundational
state.” The world is the save root; its character is nested under it with
separate stable `worldId` and `characterId` keys. A character belongs to exactly
one world and cannot be detached, transferred or imported into another save.
Save export/import copies the whole world-and-character record together.
Whether a new character may later enter that same world after death remains an
open question for BR; 1.9 stores one active character per world.

World state is region-keyed: `world.regions[(regionX, regionZ)]` follows
`DESIGN.md`'s 512 × 512 m region map; chunk diffs, block entities, piles and
individual shamblers remain chunk/area records nested beneath their region.
This hierarchy is chosen now so the save envelope does not need a Slice 4
redesign. Slice 4 revisits the exact area/region partition as the region map and
abstract hordes are implemented.

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

The exact version identity binds simulation code, worldgen, gungen and content
rules to the save. Worldgen determinism is required under that source fingerprint
and is exercised by the save/load equivalence tests; old generator
implementations are not retained for cross-version restore. A different
simulation fingerprint, generator version (including gungen), schema, or content
hash is a different identity and is refused before any content lookup. A Git
revision change alone is diagnostic and does not invalidate a save.

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
the simulation-source fingerprint, save schema version, deterministic
generator-version map (including gungen once firearms are introduced), and
ordered content-pack IDs/versions/canonical hashes; store these components and
the diagnostic Git revision alongside the digest. The fingerprint is computed
from a canonical, path-sorted list of relative source paths and per-file SHA-256
hashes, with line endings normalized. It walks Vite-resolved runtime imports
from these entry points: `src/core/sim.ts` (clock, scheduler and needs),
`src/core/worldgen.ts` (deterministic generation), `src/core/saveState.ts`,
`src/core/saveFormat.ts`, and `src/core/storage.ts` (in-memory chunk storage statistics; browser save backends
are runtime-only), `src/core/soundPicker.ts` (persisted sound selection
state), `src/game/player.ts` (movement/body rules), `src/game/rest.ts` and
`src/game/survival.ts` (stateful controllers), `src/game/streamer.ts` (world
regeneration and overlays), `src/game/config.ts` (world creation options and
site/seed parameters), `src/game/worldSetup.ts` (content registry, collision,
site construction, generated world, streaming and spawn), `src/game/quickbar.ts`
(stateful selection), `src/game/session.ts` (the DOM-free simulation wiring that the
game and the snapshot tests share: simulation, shamblers, player, inventory, rest,
survival, handling queue and `snapshot()`), and `src/game/play.ts` (gameplay
wiring/actions).
`play.ts` reaches `worldSetup.ts` at runtime for the spawn-to-body conversion,
and reaches `src/game/aim.ts` for furniture and melee targeting independently
of camera feedback roll. Vite recomputes the fingerprint for source create,
update, and delete events and reloads when it changes. Base content remains
separately identified by its canonical content-pack hash.

World construction now lives in `worldSetup.ts`; it has no static runtime
imports of Three.js or renderer modules. `engine.ts` injects a `ChunkMeshes`
instance through a type-only contract and retains WebGL, camera, light, mesh and
resize setup. The sole rendering runtime edge is the explicitly allowlisted
mesher worker URL. Because the gameplay graph does not enter `engine.ts`,
Three.js version changes and renderer-only edits there do not invalidate saves.
`src/game/engine.ts` is an explicit renderer-only exclusion. It constructs the
world setup for the app, while `play.ts` imports `playerStartFromWorld` from
`worldSetup.ts` at runtime; the setup module and its world-generation graph are
therefore fingerprinted without traversing Three.js. Type-only imports are
erased; `src/core/site.ts`'s runtime helpers are reached through the city/hamlet
builders, and config logic has its own entry.

The excluded runtime import edges reached from non-excluded simulation modules
are pinned by `test/simulationFingerprint.test.ts`. Rendering helpers within those
excluded subtrees are justified here as well:

- `src/game/saveStorage.ts`, `src/game/saveStorageRecord.ts`,
  `src/game/saveStorageProtocol.ts`, and `src/worker/save.worker.ts`: browser
  persistence, A/B slot framing and disk I/O
  only. Save bytes are already bound to the simulation by `versionIdentity`;
  changing OPFS/IndexedDB mechanics must not invalidate a save.
- `src/core/sky.ts`, `src/core/mood.ts` and `src/core/weather.ts`, now used within
  `src/render/playView.ts`: rendered sky, look/mood defaults and fogginess only.
  Include daylight/weather and save their state when they become simulation inputs.
- `src/game/damageFeedback.ts`, now used within `src/render/playView.ts`: vignette
  and camera-roll animation only. Gameplay targeting still uses fingerprinted
  `src/game/aim.ts` with input pitch/yaw, never the feedback-rolled camera.
- `src/game/engine.ts`: WebGL renderer, camera, lights, `ChunkMeshes`, and resize
  setup only. Its `Engine` interface extends `WorldSetup`, but gameplay imports
  that contract type-only; `engine.ts` is not a simulation entry, so Three.js and
  render-only edits do not invalidate saves.
- `src/core/mesher.ts` and `src/core/pileLayout.ts`: render-worker mesh generation
  and pile mesh placement only; neither changes world, inventory, or save state.
- `src/core/meshInput.ts`, `src/core/shell.ts` and `src/core/occlusion.ts`: what the
  mesher reads from the world (the padded and wide block arrays copied out of
  chunks, the surface-pattern ids) and the wide ambient occlusion's maths. Reached
  from `world.ts` (which repeats the occlusion radius as `MESH_REACH`, checked
  equal by a test, so it need not import `occlusion.ts`), `streamer.ts` and
  `worldSetup.ts`; they only feed meshing.
- `src/core/sideButton.ts`, imported by `src/game/play.ts`: which pointer events
  count as the Mouse 5 side button and the de-duplication of one press; what the
  button does is in the fingerprinted `src/core/lights.ts` and `play.ts`.
- `src/render/playView.ts`: owned mesh/model construction, read-only camera/player/
  actor interpolation, held items, sky/lighting, mood drawing, warm-up and pagehide
  disposal of pile/case instance resources. It does not advance the session or select
  actions. Shared prepared-model geometry/material lifetime stays with the model library.
  Its rendering helpers remain under the existing `src/render` exclusion.
- `src/render/playFrames.ts`: recursive RAF wiring passes timestamps unchanged and
  stops when the fingerprinted caller returns false. Elapsed-time clamp, pause/freeze,
  input sampling, simulation stepping, death and save/observer hooks remain in `play.ts`.
  `src/render/frameTimes.ts` and `src/render/meleePose.ts` are also presentation-only.
- `src/ui/audioOptions.ts`: output volume controls only. `src/game/audio.ts` is
  also excluded: WebAudio output/voice allocation cannot veto session admission.
  The session and saved picker remain fingerprinted because they create vocal-noise state.
- `src/ui/credits.ts`, `src/ui/gameCursor.ts`: static credits and cursor DOM.
- `src/ui/death.ts`: death summary and a new-world navigation callback; it does
  not mutate or restore the current world's saved simulation.
- `src/ui/hud.ts`, `src/ui/hudOptions.ts`, `src/ui/playHud.ts`, `src/ui/playReadout.ts`:
  HUD/status/prompt/debug-readout projections, DOM rendering, byte estimates and visibility only. The new play HUD consumes readonly
  data, not a session or input controller. Target acquisition/action selection stay
  in `play.ts`; the hint only describes an already selected target. Quickbar cache
  refresh stays in `play.ts`, and stateful `src/game/quickbar.ts` remains fingerprinted.
  The A5 canary proves HUD wording alone preserves the fingerprint; changing the
  gameplay interaction reach still changes it. This extraction deliberately changes
  simulation identity once; there is no save schema change or migration.
- `src/ui/menuPointer.ts`: the pointer-lock menu cursor and the forwarding of locked
  pointer and click events to the element under it. It reads only the input's
  lock and cursor state and the DOM, never simulation state; what the inventory
  does with a forwarded event stays in the fingerprinted `inventoryScreen.ts`.
  Browser pointer fixes (such as Firefox's pinned `clientX/Y`) live here so they
  don't invalidate saves.
- `src/ui/menuState.ts`: a pure derivation of the menu, inventory/debug, pointer-lock
  and death flags into menu-pointer, overlay visibility and pause presentation.
  `play.ts` supplies the inputs and applies the returned pause flag; this helper
  reads no simulation state. Keep the state acquisition and application in the
  fingerprinted `play.ts`.
- `src/ui/rest.ts`: read-only rendering of `RestAction` and simulation clock;
  rest/stop input handling and state transitions live in fingerprinted game
  modules.

The integration test recursively enumerates all source modules under
`src/core/` and `src/game/`; every module must be in the fingerprint graph, match
an explicit `SIMULATION_EXCLUSIONS` rule with the justification above, or have
an individual non-runtime rule in the test. The only current non-runtime rules
are `src/core/buildRevision.ts` (test/build diagnostic helper) and
`src/game/debugInterface.ts` (erased type-only contracts). This prevents a new
runtime file reachable only through a type-only edge from silently escaping the
fingerprint; the test fails with each unclassified module's path. The test
first failed with `city.ts`, `collision.ts`, `hamlet.ts`, `site.ts`, `engine.ts`,
`testHouse.ts`, and `worldSetup.ts` unclassified when the world-setup edge and
its renderer exclusion were removed. `src/ui/inventoryScreen.ts` is deliberately
not excluded: it routes pointer and key actions into inventory and handling mutations.
`src/game/audio.ts` is excluded because playback is one-way: the simulation owns
admission, seeded selection and hearing-relevant vocal noise. The debug subtree has no reached runtime import
edges (the play module's debug interfaces are type-only). The graph walker
follows static/dynamic imports and star re-exports, fails closed for unresolved,
virtual, out-of-root, and unclassified dependencies, and rejects unrecognized
`require()`/glob discovery. Its explicit dependency allowlist is limited to the
base-content globs (`../content/base/*.json` and
`../content/base/assets/audio/**/*.ogg`, both covered by the canonical
content-pack hash) and known presentation asset extensions. The sole
`import.meta.url` worker reference is `src/game/streamer.ts`'s
`../worker/mesh.worker.ts`; it only builds presentation meshes, so it is
explicitly allowlisted and the integration test confirms the worker is not in
the simulation source set. Any newly reached excluded edge fails the pinned
integration test and requires an explicit compatibility decision. Tests and
docs are never part of the runtime graph.

Require an exact identity match before looking up any content IDs. On mismatch,
explain both the save's diagnostic build revision and its simulation fingerprint
and refuse the load; leave its bytes untouched and never upgrade or overwrite
it. Under an exact match, missing/renamed IDs indicate corruption or a violated
build contract and are rejected; there is no unknown-content preservation or ID
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

### Upcoming state (EPIC.md slices)

BR's framing (2026-09-28) is that strict version checks let the team handle
future save challenges as their systems arrive. This table records the known
state ownership and explicit revisit point; it does not design those later
systems now.

| Slice | Upcoming state | Save representation / revisit |
| --- | --- | --- |
| 1 — Loot run | Current clock, needs, character body/inventory, edited chunks, furniture, piles, shamblers, spawn ledger, audio hearing state | Covered by the state table above. Step 1 converts queued handling jobs from closures to tagged descriptors (`jobType` + serializable parameters and progress); 1.9 omits them from the snapshot copy, so current jobs are still canceled on load. |
| 2 — Craft and mend | Crafting, repair, disassembly and reading as long actions; skills/XP; recipe discovery; in-progress craft holding components | Revisit the exact job parameters, component escrow, skill IDs/XP and discovered-recipe IDs at Slice 2. Put progression under the character record and use the tagged job descriptor so later jobs can resume; no Slice 2 state is guessed into the 1.9 schema. |
| 3 — Flesh and noise | Body parts/wounds; firearms, ammo, magazines/reloading; wall-attenuated noise; smell trail; zombie LOD tiers/hordes; light as a sense | Revisit schemas at Slice 3. Wounds and bodily conditions (including limp, illness and pain from `INTERFACE.md`) belong to the character. Persist a gun assembly generated from its gungen template and seed as item state, and include the gungen generator version in `versionIdentity`; ammo/magazines use the item tree. Active noise/smell stimuli and hordes are simulation state under the world/region; wall occlusion and light fields are derived from saved geometry and sources. Ready/block stance is held-input state and resets to unready on load; transient bodily cue animation/cooldowns reset, while their wound/condition causes persist. |
| 4 — The region | Region map, towns/sites, weather/temperature, voxel light, abstract hordes and catch-up | The world is already keyed by 512 m region, with chunk/area records nested within it. Revisit the exact region metadata, catch-up cursors and persistent horde representation at Slice 4; deterministic unmodified terrain regenerates under the matching version. |
| 5 — Holding ground | Construction, locks, barricades, generators, batteries, electricity, fire/smoke | Constructed blocks remain chunk diffs; doors/machines remain block entities in their region. Revisit power-network state, fuel/charge, fire/smoke timers and away-catch-up state at Slice 5; derived graphs/light are rebuilt. |
| 6 — Wheels | Vehicle grids, installed parts, fuel, battery, driving, damage and repair | Revisit at Slice 6: vehicles are persistent world entities keyed by stable vehicle ID under their region, with their part/item state and dynamic physics state; exact component fields wait for the vehicle implementation. |
| 7 — Cordon and labs | Tier 2/3 sites, underground labs, special zombies/evolution, hazard zones, lore | Revisit at Slice 7: generated sites remain version-bound world data; discovered lore belongs to the character and mutable hazards/evolution to world-region state. Exact fields wait for the systems. |
| 8 — Version 1 | Migration and compatibility hardening | The version picker/migration decision is a hard fork. EPIC's “Old saves migrate” exit criterion remains a version 1 obligation, not a 1.9 feature; resolve the strict-version interim policy before the v1 exit. |

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
is copied into a save. At decision time there was no save implementation measurement. For a
hamlet session with a player inventory, five buildings and the current two
spawn points, the snapshot was estimated below 1 MiB and below 1 ms p95 main-
thread time when only dirty chunks and dynamic state are copied; encoding and
disk I/O are worker work. This estimate was not a result. Keep a hard
instrumented target of at most 1 ms p95 snapshot time at 96 m (and no frame over
16.7 ms); if measurement misses, reduce the snapshot surface or copy incrementally
at barriers, never move serialization/disk work onto the frame. The snapshot p95
is measured in-game with the F4 snapshot controls in `src/debug/index.ts`,
`measureSnapshot`. CI checks a ten-game-hour
save below 5 MiB and decode/restore under 1 s on `ubuntu-latest`; these are
runner-bound save budgets, not general device targets. On 2026-10-02 BR measured
the reference-laptop batch-mean throughput in Firefox: 50 batches of 128 captures
(6,400 total), observed minimum timer tick 1 ms, calibration 27 ms, batch-mean
p50 0.203 ms/capture and p95 0.219 ms/capture. These percentiles are of
per-batch means (batch time divided by 128), not individual per-capture timings,
and do not demonstrate the ≤1 ms per-frame snapshot target. That run did not
record an individual-capture tail. The F4 measurement now reports an individual
per-capture p95 and max separately. It uses the known browser quantum `r`
(Firefox 1 ms, Chromium 0.1 ms); the observed minimum tick is a cross-check, not
the error bound. Since each timestamp error is `< r`, a duration read as `k` has
a strict upper bound `< k + 2r`. Its state guard compares endpoints only and
reports net state equality, not per-capture purity.

On 2026-10-02 at about 19:32–19:33 BR reran build `80644d1` on the reference
laptop:

```text
Firefox: Snapshot: 50 batches × 128 captures/batch (6400 timed captures); batch-mean throughput p50 0.273 ms/capture, p95 0.445 ms/capture; individual tail n=6400: observed p95 1.000 ms, max 2.000 ms; at observed r=1.000 ms, true p95 <2.000 ms and max <3.000 ms; calibration 32.000 ms; net state unchanged across measurement
Chromium: Snapshot: 50 batches × 128 captures/batch (6400 timed captures); batch-mean throughput p50 0.184 ms/capture, p95 0.266 ms/capture; individual tail n=6400: observed p95 0.200 ms, max 0.500 ms; at observed r=0.100 ms, true p95 <0.300 ms and max <0.600 ms; calibration 32.800 ms; net state unchanged across measurement
```

Recomputed from BR's unchanged observed p95/max using the known browser-profile
quantum and the jitter-safe `+2r` bound (not output by build `80644d1`): Firefox
true p95 <3.000 ms and max <4.000 ms; Chromium true p95 <0.400 ms and max
<0.700 ms.

Chromium's recomputed individual-capture bound (true p95 <0.4 ms, max <0.7 ms)
shows the ≤1 ms per-frame p95 target is met on the reference laptop. Firefox's
1 ms timer only bounds its p95 at <3 ms, consistent with that result but not
conclusive on its own.

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
   with tagged data descriptors (`jobType` plus serializable parameters, elapsed
   time and duration), then make the snapshot barrier project pending
   descriptors as canceled in the saved copy only; never cancel or mutate the
   live queue. Done when a deterministic
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
   save-size/load-time checks. Done when CI checks the 10-hour <5 MiB and <1 s
   decode/restore limits on `ubuntu-latest` and the current-build round trip
   passes. The ≤1 ms individual per-capture p95 target is assessed in-game via
   the F4 individual-tail observation (`src/debug/index.ts`, `measureSnapshot`),
   not by batch-mean throughput, the Node benchmark, or a CI gate.

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
- Compatibility is intentionally strict: changing simulation source, schema,
  worldgen, any deterministic generator (including gungen), or content identity
  prevents loading that save. Only edits confined to explicitly excluded
  presentation modules (plus tests, docs, and unrelated commits) leave the
  fingerprint unchanged. UI or presentation code co-located in fingerprinted
  modules—such as `play.ts`, `inventoryScreen.ts`, or `game/audio.ts`—
  conservatively invalidates saves too; compatibility follows the module graph,
  not semantic line-level classification. Version-keyed storage preserves
  incompatible records rather than silently applying new rules. Revisit when
  characters need to persist across releases; version selection or migration
  would then be a hard fork.
- Save frame time and size are estimates until the implementation benchmark
  proves them. The stated targets are gates, not claimed measurements.

## Rulings (2026-09-28)

BR accepted the recommendations for debug saves and `pagehide`, and ruled on
strict version identity and the world/character boundary:

1. **Debug saves:** keep god mode/noclip/build toggles outside the save contract
   and force them off on load; world changes already made remain saved.
2. **`pagehide`:** do not block for a worker flush. Treat it as best-effort and
   rely on periodic A/B checkpoints.
3. **Versions:** require an exact version match and refuse mismatches without
   modifying the save. Future version selection and migration are a hard fork,
   not part of 1.9.
4. **World and character:** a save is one world plus its character; the world is
   root state and the character is bound to exactly that world, never moved
   between saves. A new character entering that same world after death remains
   undecided.
5. **Simulation fingerprint (saves.2b, 2026-09-28):** use a source-graph hash
   instead of the Git revision as the compatibility component. A hand-bumped
   SemVer was rejected because a forgotten bump silently accepts saves under
   changed simulation rules. Keep the Git revision beside the digest only as
   diagnostic metadata. The Vite-resolved source graph closes both known gaps:
   newly imported untracked files are included, and builds without Git still
   produce source-specific identities instead of sharing a `development`
   version. Content-pack hashes remain a separate exact identity component.

[[THIS contradicts: ../../EPIC.md]]

Strict version checks apply through the hard fork; migration remains a version 1
obligation under EPIC's “Old saves migrate” exit criterion. This ADR defers that
obligation, it does not waive it.

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
