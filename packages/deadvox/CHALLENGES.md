---
read_if:
  - you're assessing the risks or proof needed for the v1 scope
  - you're judging lighting arrival and edit transitions, residency limits or the frame-service gate
  - you're choosing when to tackle a simulation, performance or world-generation constraint
---

# Deadvox challenges

These challenges keep v1 playable as systems and content grow. The reasons and acceptance properties below guide the work; implementation details belong to code and tests. The design is in [DESIGN.md](DESIGN.md), and the v1 boundary is in [EPIC.md](EPIC.md).

## 1. Half-metre blocks

A finer grid increases storage and surface work sharply, but a larger grid loses the terrain detail the game needs. The measured scale decision is complete; keep performance headroom for later systems. Acceptance requires the 96 m default view at 60 fps, no more than 1% of frames over 18 ms in each benchmark phase, and no holes at sprint speed in Firefox on the portable reference-laptop class described in [DESIGN.md](DESIGN.md#performance-and-scale). The 96 m default leaves room for zombies, lighting and UI. The independent near-radius target remains 128 m at 60 fps, with meshing keeping up with walking. See `src/bench/run.ts`, `startBench`, and `src/render/chunks.ts`, `ChunkMeshes.cull`.

Homogeneous chunks collapse to one id. Palette packing is a proposed storage option, but its estimate is hypothetical, not the implemented representation; both address the sharp storage increase from a finer grid. Greedy meshing reduces surface work, while shader-based per-block colour variation lets adjacent faces merge. Add draw batching only when measurement identifies draw overhead as the bottleneck; fewer draw calls alone did not establish a speedup. Frustum culling stays because it costs nothing and hides no visible chunks; occlusion culling was rejected because GPU cost did not track chunk count, so inspect per-pixel cost first if GPU headroom is needed. See `src/core/chunk.ts`, `Chunk`, `src/core/storage.ts`, `storageStats`, and `src/bench/run.ts`, `startBench`.

## 2. View distance

Long sightlines matter, but full-detail voxels do not scale to distant towns. Slice 4b pairs near full-detail terrain with cheaper far terrain derived from world generation, then blends the boundary so distant settlements remain recognizable without consuming near-field budget.

## 3. Compressed time

Long actions must advance the world quickly without letting entities tunnel through obstacles or delaying an emitted interruption. Slow systems can use larger steps or closed-form updates; player physics and active enemies retain bounded steps. Background movement may approximate collision only within a bound that keeps interruptions timely. Reuse sky-visibility work until world geometry changes. Slice 1 introduced sleep/rest; Slice 2 extends compression to crafting. Tests must show interruptions are observed no later than the next simulation step.

## 4. Many zombies in a browser

Hundreds of fully active agents would compete with rendering and player simulation. The v1 acceptance target is 60 active zombies and 300 in the background tier, with simulation under 4 ms per frame. Use activity tiers: only nearby threats need detailed behavior; background threats can move in cheaper steps, while distant hordes remain abstract. Keep active attention selection unchanged when simplifying background movement. Grow data-oriented storage or move systems to a worker only when counts require it. Slice 3 develops background movement; abstract hordes remain Slice 4b work. Benchmark simulation cost separately from the complete rendered scene. See `src/bench/shamblers.ts`, `startShamblerBench`, and `packages/mobgen/src/cli/bench.ts`.

## 5. Inventory speed in real time

Inventory depth becomes tedious if every choice costs attention as well as handling time. Smart defaults, direct common actions, batch moves and visible destination/handling feedback should make looting a decision rather than a UI fight. Slice 1 is the playtest trigger; kitchen looting must take under 60 real seconds, including decisions. Judge the whole container looting flow, not only core handling time.

## 6. Content volume

A growing item and recipe catalogue needs reliable references and reachable ingredients, or depth becomes broken content. Keep schema, reference and reachability checks in CI; add systems before multiplying special cases. The validator grows with each slice, and crafting makes reachability checks necessary.

## 7. Saves and migration

A save spans edited terrain, nested items, world entities and clocks; silently restoring it under changed rules can produce a different world. Snapshot owned state, identify the simulation and content that interpret it, and refuse mismatches. Migration becomes required at v1.0 beta; until then, old-format migration is not supported. See [ADR 0002](docs/decisions/0002-saves.md).

## 8. Vehicles on voxels

Half-metre terrain steps exceed ordinary wheel clearance, and fast vehicles can cross thin obstacles between samples. Vehicle work needs traversable surfaces, collision that prevents tunnelling, and an arcade handling model before simulation detail. Slice 6 depends on drivable surfaces from Slice 4b.

## 9. Lighting

World-derived diffuse sky visibility makes site interiors darker without a template flag, but transport must remain consistent with edits, streaming and furniture. The existing mesh pool bounds worker capacity; moving transport there does not make main-thread snapshot, submission or atlas work free. Capped uncertainty avoids full-sky claims without blacking out every eligible open surface during cold discovery; current height certificates take precedence over uncertainty. Published lighting stays visible during edit revalidation so opening a dark room cannot expose the uncertainty cap. Delayed darkening and replacement brightness steps remain visual and latency risks to measure, while unsolved noncandidate geometry preserves its prior look. Limited GPU residency can over-darken a completed but nonresident room, so #569 requires a dense-camp first look and frame-service measurements rather than accepting a no-job or permanently dark-room result as fast. Carried-light rendering and simulation exposure remain separate authorities. See `DESIGN.md`, "Light", and `src/render/skylight.ts`, `Skylight`.

## 10. World generation across chunks

Buildings and roads span independently generated chunks. If chunks consult one another, generation order creates seams and nondeterminism. Region and settlement layers must be deterministic inputs owned above chunks; lots own their ground height and blend at their edges. Property tests should prove order-independent generation and seam-free borders.

## 11. Catch-up simulation

Unloaded areas use coarse or closed-form updates, while loaded areas tick normally. Divergence near the player makes time away behave differently from time present, and a player can compare a short absence with what they saw. Keep catch-up beside each system's tick and test that both paths agree within the system's stated tolerance while a region is in the block around the player; once it leaves the block the coarse model is canonical, and its tests check determinism, not agreement. The block's regions are simulated with the player's presence as an input. See [ADR 0008](docs/decisions/0008-deterministic-world.md). Needs and food begin in Slice 1; power and fire follow in Slice 5.

## 12. Browser limits

Storage eviction, hidden-tab suspension, pointer-lock differences and graphics support constrain a browser game. Keep simulation data independent from rendering and server headers; pause single-player when hidden and save on lifecycle transitions. Check supported browsers during each slice. WebGPU is outside v1.

## 13. Scope

“CDDA plus DayZ” is larger than a small team can ship without a hard boundary. Each slice must be playable, answer a playtest question and stay inside the v1 definition. Use the cut list deliberately when scope grows; do not start a feature without a question its playtest can answer.

## 14. Testing emergent systems

System interactions are difficult to reproduce manually. Seeded system-specific randomness and a headless core make small scenario tests deterministic; input recording makes playtest failures reproducible. Add scenario coverage from Slice 1 and replay from Slice 3. A playtest bug should become a failing scenario before its fix.
