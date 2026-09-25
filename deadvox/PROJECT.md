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
- `?time=HH:MM` sets the time of day at the start (default 19:30).
- `?debug=1` turns on debug keys: B toggles build mode (break and place blocks,
  1–9 to choose), T starts or stops compressed time (a stand-in for resting), N
  makes a noise that interrupts it, and U toggles a pretend danger that makes
  compression unsafe.
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
| Simulation | `core/sim.ts` ties together the clock (`core/clock.ts`, 1:8), the fixed-step scheduler (`core/scheduler.ts`), the compression controller (`core/compression.ts`), the event queue (`core/events.ts`) and pause. Systems register a rate; under compression slow systems take bigger steps up to their `maxStep` instead of more ticks, and every tick is followed by an interruption check. The player's physics is a 60 Hz system whose step never grows; needs tick at 1 Hz and grow to 30 s steps. The pause card (Esc) pauses the simulation; the inventory doesn't |
| Randomness | Worldgen uses stateless hashed noise. Systems draw from their own seeded stream (`Rng.stream(seed, systemId)`, sfc32), never `Math.random` |
| Entities | Behind the `EntityStore` interface (`core/entities.ts`); a Map of plain objects for now |
| Items | Instances (`core/items.ts`) with a uid, count, condition and one grid per pocket. Items take w × h cells and rotate; identical, stateless items stack up to their type's limit. `core/inventory.ts` holds the hands, worn items and piles (an 8 × 6 grid per block of floor), plans moves (fit, reach, reasons) and works out handling times; `core/handling.ts` queues moves, which happen when their time is up and are checked again then. The queue runs as a 20 Hz system and pauses while time is compressed |
| Inventory screen | `ui/inventoryScreen.ts`, plain DOM: pockets and piles drawn as grids, pointer-based drag and drop with a preview of the cells, R to rotate while dragging, keys for the common moves, and a details panel that lists every place an item can go with its time or the reason it can't. The quickbar and handling progress are in `ui/hud.ts` |
| Time of day | `core/sky.ts` interpolates keyframes (night, dawn, day, dusk) for the sky colour, sun or moon light, ambient light and fog; `render/sky.ts` applies them each frame. The benchmark stays in daylight |
| Terrain | Seeded value-noise heightmap in metres, generated one column at a time on the main thread |
| Structures | Boxes in metres, applied in order and rasterized for the block size (`core/structure.ts`). The only structure so far is the test house next to spawn |
| Streaming | A chunk is meshed only when all 8 neighbouring columns exist, so borders never need a second pass |
| Content | JSON in `src/content/base`, with sections for blocks, items, furniture, loot tables, templates and zombie types. Valibot schemas (`core/schema.ts`) check each file and give the TypeScript types; `core/content.ts` merges files in order and then checks references between them. An override keeps the block's runtime id. A file with any issue, including a broken reference, is skipped whole |
| Units | Weight in grams, volume in millilitres, item length in millimetres |
| Tests | Vitest, on the core only |
| Lint/format | Biome, repo-wide (`biome.jsonc`): every stable rule on. See the static-analysis pillar in the root README |
| CI | `.github/workflows/deadvox.yml`: typecheck, tests, content validation, build |
| Hosting | GitHub Pages via `.github/workflows/pages.yml`, published under `/deadvox/` |

## Layout

```
src/
  core/        pure logic: coords, scale, chunk, world, worldgen, structure, storage, mesher,
               raycast, physics, content and schema, items, inventory, handling; the simulation core: sim, clock,
               scheduler, compression, events, random, entities, needs, sky
  content/     JSON content packs (base/): blocks, items, furniture, loot, templates, zombies
  worker/      mesh worker + message types
  render/      three.js chunk meshes, sky and lights, piles
  game/        engine setup, play mode, streaming, player controller, input, test house,
               starting loadout, move targets, build mode
  bench/       milestone 1.0 benchmark: runner, stats, results page
  ui/          inventory screen, quickbar and handling HUD, CSS
  cli/         content validator (npm run validate -- mod/*.json)
  main.ts      picks play, benchmark or results page from the URL
test/          Vitest specs for core, and content fixtures (fixtures/content/)
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
- Needs only run down: eating, drinking and sleep arrive in 1.6 and 1.8. Nights
  are dark with no flashlight until 1.6. Items can be held but not used yet.
- Furniture has no contents yet (1.5): the only loot is the pile by the spawn
  point.
- Items in piles render as one generic bundle per block of floor.
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
