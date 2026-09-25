# deadvox — singleplayer voxel survival

A browser-based, singleplayer survival game in the spirit of DayZ (a large open
world, scavenging, zombies, staying alive) with the simulation depth of
Cataclysm: DDA (detailed items, bodies, crafting). The graphics are blocky voxels.

This file describes the code as it is. The game's design and roadmap are in
[DESIGN.md](DESIGN.md) and [EPIC.md](EPIC.md).

**Play:** <https://roobie.github.io/skelly/deadvox/>. URL parameters:

- `?seed=N` picks a world.
- `?radius=N` sets the view distance in metres (default 96; the start card offers
  64, 96 and 128).
- `?debug=1` enables debug keys (I: simulate an interruption while waiting);
  `&time=22` starts the clock at 22:00.
- `?bench=1` runs the milestone 1.0 benchmark; `?bench=report` shows its last
  results. See [SLICE-1.md](SLICE-1.md#running-it).

## Aim

- Depth over graphics: the game is mostly simulation and UI, so both must be
  easy to grow.
- Content is data. Blocks and items (and later recipes, body parts, loot
  tables, zombie types) are JSON. Mods are more JSON files applied after the
  base pack.
- Singleplayer only. No server, no netcode. The simulation can pause, speed
  up, and catch up areas the player left.
- Runs from a static site (GitHub Pages). No backend.

### Non-goals (for now)

- Multiplayer.
- Realistic graphics. Colour, per-vertex ambient occlusion and fog carry the look.

## Decisions

| Decision | Choice |
| --- | --- |
| Language | TypeScript (strict), same toolchain as gungen |
| Core | Pure library in `src/core`: no DOM or three.js imports, so it runs in tests, workers and Node |
| Rendering | three.js, in `src/render` |
| UI | Plain HTML/CSS over the canvas (`src/ui`). No framework yet; pick one when screens get stateful |
| Meshing | Greedy meshing with per-vertex AO (`core/mesher.ts`): faces with the same block and AO merge into larger quads. Built in Web Workers; buffers are transferred, not shared. Per-block colour variation is computed in the chunk shader (`render/chunks.ts`) |
| Scale | 0.5 m blocks (`BLOCK_SIZE` in `core/scale.ts`, chosen in milestone 1.0). Player sizes, speeds, terrain and structures are defined in metres; the voxel grid and physics work in blocks, and the scene is scaled to metres. The benchmark can build other block sizes to compare |
| Chunks | 32³ blocks of runtime block ids, y-major. A chunk where every block is the same stores a single id. The world spans −48 m to +80 m, 8 chunks tall. Unedited chunk data far out of range is dropped and regenerated from the seed when needed |
| Simulation | `core/sim/simulation.ts`: a clock (8 game seconds per simulation second), a scheduler with fixed-step systems (player physics, 60 Hz) and coarse systems (one step per frame of all accumulated time), and time compression up to 30×. Esc pauses; the inventory doesn't |
| Sky | Colour, sun and ambient light by time of day (`core/sim/sky.ts`), applied each frame |
| Terrain | Seeded value-noise heightmap in metres, generated one column at a time on the main thread |
| Structures | Boxes in metres, applied in order and rasterized for the block size (`core/structure.ts`). The only structure so far is the test house next to spawn |
| Streaming | A chunk is meshed only when all 8 neighbouring columns exist, so borders never need a second pass |
| Content | JSON in `src/content/base`, validated (`core/content.ts`) and merged in order. An override keeps the block's runtime id. A file with any issue is skipped whole |
| Units | Weight in grams, volume in millilitres |
| Tests | Vitest, on the core only |
| Lint/format | Biome, repo-wide (`biome.jsonc`): every stable rule on. See the static-analysis pillar in the root README |
| CI | `.github/workflows/deadvox.yml`: typecheck, tests, content validation, build |
| Hosting | GitHub Pages via `.github/workflows/pages.yml`, published under `/deadvox/` |

## Layout

```
src/
  core/        pure logic: coords, scale, chunk, world, worldgen, structure, storage, mesher,
               raycast, physics, content, inventory
  core/sim/    simulation: clock, sky, scheduler, compression, events, entities
  content/     JSON content packs (base/)
  worker/      mesh worker + message types
  render/      three.js chunk meshes
  game/        engine setup, play mode, streaming, player controller, input, test house
  bench/       milestone 1.0 benchmark: runner, stats, results page
  ui/          HUD/inventory DOM + CSS
  cli/         content validator (npm run validate -- mod/*.json)
  main.ts      picks play, benchmark or results page from the URL
test/          Vitest specs for core
```

## Running

```
npm install
npm run dev        # http://localhost:5173
npm test
npm run validate   # base content; add paths to validate a mod on top
```

## Known limits of the scaffold

- All blocks render as opaque cubes. `solid: false` only affects collision.
  Transparent blocks (water, glass, leaves) need a second mesh pass.
- Terrain is generated on the main thread. It costs about one frame hitch per
  column. Move it to the workers when worldgen grows (roads, towns, buildings).
- Nothing is saved yet, and edited chunks stay in memory until saves exist
  (milestone 1.9).
- Pointer lock only works on desktop. There are no touch controls.

## Design and roadmap

- [DESIGN.md](DESIGN.md): the core design (pillars, scale, time, items,
  crafting, zombies, bases, vehicles, world, tone).
- [EPIC.md](EPIC.md): what version 1 is, and the slices that get there.
- [CHALLENGES.md](CHALLENGES.md): the hard problems and how we plan to tackle
  them.
- [SLICE-1.md](SLICE-1.md): the first playable deliverable ("The loot run").
