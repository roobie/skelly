---
read_if:
  - you're evaluating performance, simulation or lighting risks
  - you're deciding when a version 1 challenge needs proof
---

# deadvox — challenges

The hard problems between us and [version 1](EPIC.md), roughly in order of risk.
For each: why it's hard, what we plan to do, when we'll deal with it, and how
we'll know it's solved. Some of the numbers here are estimates; the ones marked
*measure* get checked before we rely on them.

Design context is in [DESIGN.md](DESIGN.md). Lessons from past problems, for
troubleshooting, are in [LESSONS.md](LESSONS.md).

## 1. Half-metre blocks

**Why it's hard.** Halving the block size gives 8× the blocks per volume, 4×
the surface faces, and 8× the memory for the same area. Rough numbers for
32³ chunks of 16-bit block ids:

- One chunk is 64 KiB.
- A 128 m view radius covers 17 × 17 columns × 8 chunks = 2,312 chunks, which
  is about **145 MiB** if every chunk is stored in full.
- The meshing workload rises by roughly 4× for flat ground, since a 16 m chunk
  top has 1,024 block faces instead of 256.

**Plan.**

- **Uniform chunks as a single value.** Most chunks are all air or all stone;
  only the surface band needs full storage. That takes the example above to
  roughly 700 stored chunks (about 44 MiB).
- **Palette-packed chunks.** Few chunks hold more than 16 block types, so 4 bits
  per block suffices. That's 16 KiB a chunk, and the total drops to around
  11 MiB.
- **Greedy meshing,** which merges adjacent coplanar faces into larger quads.
  Per-block colour jitter would stop faces merging, so the variation
  moves into the fragment shader as a hash of world position. Faces then merge
  whenever they share block type and AO.
- **Batched draws, if measurement shows draw overhead is the bottleneck.** The
  2026-09-26 reference run left render time unchanged despite one quarter of the
  draw calls; grouping chunks is not an established speedup.

**When.** The measured block-size decision is complete; its feel rationale is
in [DESIGN.md](DESIGN.md#scale-and-units). This challenge remains relevant as
later features spend the same performance budget.

**How we'll know.** On the [reference laptop](DESIGN.md#reference-hardware) in
Firefox, 0.5 m blocks at 96 m meet the frame budget: 60 fps, at most 1% of
frames over 18 ms in every
benchmark phase, and no holes at sprint speed. The 96 m default leaves room for
zombies, lighting and UI. See `src/bench/run.ts`, `startBench`. The challenge's own
target is unchanged: a 128 m near radius runs at 60 fps, with meshing keeping up
with walking speed.

The 2026-09-26 decision keeps culling, which costs nothing and hides no visible
chunks, and rejects occlusion culling because GPU time did not track chunk count;
if a later milestone needs GPU headroom, inspect per-pixel cost first (pixel
ratio, antialiasing, chunk shader). The cull is in `src/render/chunks.ts`,
`ChunkMeshes.cull`.

## 2. View distance

**Why it's hard.** DayZ is about long sightlines: seeing a town on the horizon,
or a figure on a ridge. Full-detail voxels at 0.5 m stop being affordable at
roughly 128 m.

**Plan.**

- **Near:** full-detail chunks out to 96–128 m.
- **Far:** terrain rings drawn straight from the worldgen height function and
  the region map, not from voxels. Heightmap tiles get coarser with distance;
  buildings become box silhouettes from the settlement data. It's cheap because
  it never builds voxels.
- **Blend:** fog and far meshes that fade in, so there's no visible edge.

**When.** Slice 4, together with the region map.

**How we'll know.** Towns are recognisable at 500 m, and the fps budget from
section 1 still holds.

## 3. Compressed time

**Why it's hard.** During a long action the whole simulation runs up to 30×
faster. Running every system 30 times per frame is too expensive. Making each
step 30 times larger breaks physics (entities skip through walls) and can miss
an interruption (a runner covers 30 m between two checks).

**Plan.**

- **Danger and compression:** unowned compression (such as the debug skip) is
  admitted only while safe. Long actions fast-forward despite nearby or aware
  hostiles; a real interrupt event, such as a hit or critical need, still
  ends the action. The player is responsible for making the area safe before
  starting. In `src/core/sim.ts`, `Simulation.compress`
  retains the safety check for unowned compression; `Simulation.compressLongAction`
  does not apply it to long actions.
- **Bigger steps, not more ticks,** for slow systems (needs, fire, power), and
  closed-form updates where they exist.
- **Background entities** use the beeline movement brain from d84, taking
  larger, cheaper steps with approximate collision; attention selection is
  unchanged. Each step is capped so the fastest entity moves at most about 2 m
  per step. That bounds how late an interruption can be, independently of any
  navigation-field approach.
- **Interruption checks every step,** and they drop straight back to 1× before
  the next step runs.
- **Readability:** a clock that spins visibly, a progress bar, and an edge
  effect on screen. The Continue/Stop prompt is the only UI during compression.

**When.** The mechanism is in Slice 1 (sleep and rest); Slice 2 extends it to
crafting.

**How we'll know.** In simulation tests, no interruption is ever more than one
step late. Playtesters understand what happened when they were woken.

## 4. Many zombies in a browser

**Why it's hard.** Hordes are central, but pathfinding, perception and physics
for hundreds of entities on the main thread will cost frame rate. The block
grid also changes during play (doors, barricades, broken walls), which
invalidates cached paths.

**Plan.**

- **Level-of-detail tiers** (see [DESIGN.md](DESIGN.md#zombies)). v1 targets:
  60 active zombies, 300 in the background tier, and thousands as abstract
  hordes.
- **Beeline steering, not flow fields.** d84 makes active zombies beeline; the
  existing attention selection is unchanged. 3.9 gives the background tier the
  same movement in larger, cheap steps, with the per-step cap above.
- **Structure-of-arrays storage in a worker** once the counts need it. The
  `EntityStore` abstraction in `src/core/entities.ts` keeps a storage change from
  altering system APIs.
- **Instanced rendering,** no allocations per tick, and pooled objects.

**When.** Basics in Slice 1 (a handful of shamblers); hordes and cheap
background beelines in Slice 3. Abstract hordes remain Slice 4 work.

**How we'll know.** 60 active and 300 background zombies at 60 fps on the
reference laptop, with the simulation under 4 ms a frame. *Measure.* A
reference-laptop run with 100 detailed shamblers reached 60 fps, but the zombie
tick used 11 ms p95 and
1% of frames exceeded 18 ms. That limited headroom is why active simulation
needs a strict cap and cheaper tiers.
`src/bench/shamblers-cpu.mjs` isolates simulation cost from rendering, while
`src/bench/shamblers.ts`, `startShamblerBench`, records browser frame, tier
tick, actor-sync and render-submit costs. Compare the isolated simulation
cost with this gate; use the browser run to judge the full scene.

## 5. Inventory speed in real time

**Why it's hard.** The inventory is the game's core minigame, but depth plus
real-time handling can easily become tedious. CDDA-style detail at DayZ pace
needs a very fast UI.

**Plan.**

- **Smart defaults:** "take" puts the item in the best pocket. Common actions
  are one key.
- **Batch actions:** take all food, take all of this type, repeat the last move,
  and queued transfers.
- **Clear information:** every pocket shows its handling time, and dragging an
  item highlights where it fits, so choosing a pocket is a visible decision
  rather than a hidden penalty.
- **Measure it.** The playtest build logs how long looting takes: real seconds
  per container, and the split between handling time and UI time.

**When.** Slice 1. It's a key playtest question.

**How we'll know.** Looting a kitchen takes under 60 real seconds, including
the decisions. Playtesters talk about which pocket to use, not about fighting
the UI.

## 6. Content volume

**Why it's hard.** CDDA's depth comes from thousands of items and recipes built
up over more than a decade. The v1 targets ([EPIC.md](EPIC.md)) are much
smaller but still large for a small team. Content that's wrong (broken
references, unreachable recipes, useless items) erodes depth.

**Plan.**

- **One schema and one validator for every content type,** including
  cross-reference checks (a recipe points at an item that exists) and
  reachability checks (every component can be found in loot or crafted), run
  in CI.
- **Tools:**
  - an in-game content browser and debug spawner
  - a template preview in the debug viewer
  - generated content docs (tables of items, recipes and loot)
- **Systems before content:** qualities, components and loot tables let one
  new item join many recipes without editing each of them.

**When.** The validator grows with every slice. The reachability check comes
with crafting in Slice 2.

**How we'll know.** Adding an item takes one JSON entry and turns up in loot and
recipes without code changes. CI catches every broken reference.

## 7. Saves and migration

**Why it's hard.** Saves hold edited voxels (8× more at 0.5 m), item instances
nested inside pockets, block entities, zombies and the clock. They have to
survive game updates, content that's been renamed, and removed mods, all in
browser storage that the browser can evict.

**Plan.**

- **Chunk diffs only,** stored as a string palette plus run-length encoding.
  Anything unchanged regenerates from the seed.
- **Versioning:**
  - a save version number, with a migration function per version step
  - the save records which packs (and versions) it was made with
  - ids that no longer exist become "unknown" placeholders and are never
    silently dropped
- **Durable storage:** OPFS (the browser's private file system), with
  IndexedDB as a fallback. Call `navigator.storage.persist()`, and offer save
  export and import as a file.
- **Golden saves in CI:** saves from earlier versions are kept as fixtures and
  must load and migrate.

**When.** Slice 1 (first format, and the golden-save test from day one).

**How we'll know.** A 10-hour save is under 50 MB and loads in under 5 s. Every
old golden save still loads.

## 8. Vehicles on voxels

**Why it's hard.** Terrain rises in 0.5 m steps, but car wheels (about 0.35 m
radius) can't climb 0.5 m. At speed, a vehicle can tunnel through thin walls.
The world also changes under the vehicle.

**Plan.**

- **Driveable surfaces:** roads are generated flat and smooth. In worldgen,
  terrain gets slab and ramp shapes (from DESIGN's shape set) so slopes become
  ramps, not stairs.
- **Wheels see smoothed ground:** wheel ray casts hit a smoothed surface where
  a single-block step counts as a slope; two blocks is a wall.
- **Collision:** colliders built on the fly from the blocks around the vehicle,
  with substeps or continuous collision at speed. Rapier may provide voxel
  collider shapes in recent versions; verify before relying on it.
- **Arcade handling first,** with damage to parts. Simulation-style handling
  only if playtests ask for it.

**When.** Slice 6, after the driveable surfaces arrive with worldgen in Slice 4.

**How we'll know.** You can drive between two towns on roads and cross open
terrain slowly. No tunnelling at 100 km/h in tests.

## 9. Lighting

**Why it's hard.** Dark interiors and dark nights make the game, and hot
zombies are light sources that move. Spreading light through the block grid
costs 8× more at 0.5 m, and it has to update when blocks change and as light
sources move.

**Plan.**

- **Two light values per block,** 4 bits each: sunlight and block light.
- **Spread and removal** by breadth-first flood fill, in the worker next to
  meshing. Light values feed the vertex colours.
- **Moving lights** (flashlight, hot zombies, muzzle flashes) are real three.js
  lights, limited to the nearest few, not voxel light updates.

**When.** Until voxel light arrives in Slice 4, interiors use sky light and
are no darker than outdoors. This temporary limit and the boundary for carried
lights are in [DESIGN.md](DESIGN.md#light). Voxel light comes with Slice 4.

**How we'll know.** Interiors are dark at noon, and placing a lamp relights a
room within one frame of the mesh update.

## 10. Worldgen across chunks

**Why it's hard.** Buildings, roads and labs span many chunks, but chunks
generate independently, in any order, in workers. Placing a structure also
means reshaping terrain (flat lots, basements) consistently on both sides of a
chunk border.

**Plan.**

- **Layered generation** (see [DESIGN.md](DESIGN.md#generating-the-world-in-layers)).
  The region and settlement layers are deterministic and cached per region.
  Chunks only read from them, never from each other.
- **Lots own their terrain:** a lot sets its ground height, and the terrain
  blends toward it at the lot's edges.
- **Worldgen in workers** once towns exist, sharing the pure-core code with
  the tests.

**When.** Slice 1 has one hamlet near spawn, with lots flattened; Slice 4 has
the full region map.

**How we'll know.** Generating chunks in any order gives the same world
(property test). No seams at chunk borders.

## 11. Catch-up simulation

**Why it's hard.** Unloaded areas are caught up in closed form or in coarse
steps, while loaded areas tick normally. If the two disagree, the world is
inconsistent: a battery would last longer when you're away.

**Plan.**

- Every system with a catch-up path gets a **property test**: N ticks of the
  live simulation must match the catch-up result within a tolerance.
- Catch-up code lives next to the tick code in the same module.

**When.** Slice 1 (needs and food decay); Slice 5 (power and fire).

**How we'll know.** The property tests pass for every system that has a
catch-up path.

## 12. Browser limits

**Why it's hard.** The game runs in a tab:

- Memory limits vary by browser (Safari is strictest).
- Storage can be evicted.
- A hidden tab stops animation frames.
- GitHub Pages can't set the COOP/COEP headers that `SharedArrayBuffer` needs.
- Pointer lock has quirks.
- Rendering is WebGL2 only for now.

**Plan.**

- **Memory:** a budget per system, shown in the debug overlay. Test on Safari
  early.
- **Hidden tab:** pause the simulation when the tab is hidden (it's
  singleplayer) and autosave on `visibilitychange`.
- **Threads:** transfer buffers between workers instead of sharing them; use
  `coi-serviceworker` only if sharing turns out to be needed.
- **Keyboard layouts:** keys are read from `event.code` (already the case), so
  bindings work on any layout.
- **WebGPU** only after v1.

**When.** Continuously; each slice's playtest covers Chrome, Firefox and
Safari.

**How we'll know.** Every slice is playable on the current version of all three
browsers.

## 13. Scope

**Why it's hard.** "CDDA plus DayZ" describes two games, each with years of
content and systems. The biggest risk is never shipping.

**Plan.**

- **Vertical slices,** each playable and deployed to Pages, with a playtest
  before the next one starts.
- **A fixed v1 definition** with content caps ([EPIC.md](EPIC.md)), and a cut
  list decided in advance.
- **Systems before content, and one general system before many special
  cases.** No feature enters a slice without a playtest question it answers.

**How we'll know.** Every slice ships within its planned scope, or the cut list
is used on purpose.

## 14. Testing emergent systems

**Why it's hard.** Bugs in systemic games come from interactions: a door, a
noise target and a horde. They're hard to reproduce by hand.

**Plan.**

- **Determinism:** seeded random streams per system, and the pure core runs
  headless in Node.
- **Scenario tests:** build a small world, run N ticks, and assert on the
  outcome (for example: "a shambler reaches the player through an open door
  but not a closed one").
- **Input recording:** record a session's inputs, replay it, and compare state
  hashes. Playtest bug reports then come with a replay.
- **Debug tools:** time controls, spawning, a reveal view (zombies, sounds,
  paths) and a state inspector.

**When.** Scenario tests from Slice 1; input recording in Slice 3.

**How we'll know.** Every playtest bug becomes a failing scenario test before
it's fixed.
