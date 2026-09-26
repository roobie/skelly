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
  makes a noise that interrupts it, U toggles a pretend danger that makes
  compression unsafe, and K takes 25 health (four presses show the death screen).
- `?bench=1` runs the milestone 1.0 benchmark; `?bench=report` shows its last
  results. `&time=HH:MM` runs it at that time of day instead of noon. See
  [SLICE-1.md](SLICE-1.md#running-it).
- `?site=city` replaces the hamlet with a stress-test city about 400 m across,
  and `&storeys=N` (up to 20) makes its buildings 1 to N storeys tall. It works
  in the game (with furniture) and in the benchmark (`?bench=1&site=city`,
  without furniture). It's for measuring what a town costs, not for playing:
  upper storeys have no stairs.

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
| Culling | The camera's far plane is where the fog ends (`render/sky.ts`): fog and clipping both go by view depth, and at the fog's end a surface is exactly the background colour, so nothing past it can show. By day that's 0.95 of the view radius; at night it's a half to a third, and most chunks are skipped. Chunk meshes are culled against their tight bounding boxes (`ChunkMeshes.cull` in `render/chunks.ts`, run from the scene's `onBeforeRender`) rather than three.js's spheres. Stars and a moon (Slice 4) will have to draw without fog, past the far plane |
| UI | Plain HTML/CSS over the canvas (`src/ui`). No framework yet; pick one when screens get stateful |
| Meshing | Greedy meshing with per-vertex AO (`core/mesher.ts`): faces with the same block and AO merge into larger quads. Built in Web Workers; buffers are transferred, not shared. Per-block colour variation is computed in the chunk shader (`render/chunks.ts`) |
| Scale | 0.5 m blocks (`BLOCK_SIZE` in `core/scale.ts`, chosen in milestone 1.0). Player sizes, speeds, terrain and structures are defined in metres; the voxel grid and physics work in blocks, and the scene is scaled to metres. The benchmark can build other block sizes to compare |
| Chunks | 32³ blocks of runtime block ids, y-major. A chunk where every block is the same stores a single id. The world spans −48 m to +80 m, 8 chunks tall. Unedited chunk data far out of range is dropped and regenerated from the seed when needed |
| Simulation | `core/sim.ts` ties together the clock (`core/clock.ts`, 1:8), the fixed-step scheduler (`core/scheduler.ts`), the compression controller (`core/compression.ts`), the event queue (`core/events.ts`) and pause. Systems register a rate; under compression slow systems take bigger steps up to their `maxStep` instead of more ticks, and every tick is followed by an interruption check. The player's physics is a 60 Hz system whose step never grows; needs tick at 1 Hz and grow to 30 s steps. The pause card (Esc) pauses the simulation; the inventory doesn't |
| Randomness | Worldgen uses stateless hashed noise. Systems draw from their own seeded stream (`Rng.stream(seed, systemId)`, sfc32), never `Math.random` |
| Entities | Behind the `EntityStore` interface (`core/entities.ts`); a Map of plain objects for now |
| Survival | `core/needs.ts`: calories, hydration and fatigue change per game hour; health is one pool that comes back while needs are met and drains while starving or parched; stamina is spent sprinting and recovered by the second. `stepNeeds` advances exactly from one threshold to the next, so a step of hours (compressed time, catch-up) lands where ticking every second would. Health at 0 ends the simulation with a cause (`Simulation.dead`); `hurt` takes health from outside. Food rots on the clock (`core/food.ts`): an item's age is the calendar minus when it was made, so rotting keeps no state. A light's charge drains in closed form while it's on (`core/lights.ts`); swapping a battery gives back the old one if it had charge left. `game/survival.ts` uses what's in your hands (quickbar key again, or U in the inventory): eating and drinking are short actions, a light switches on and off, a battery goes into the light you hold, and a dead light takes a spare from your pockets. Only a light in your hands shines: a spot light at the held item's lens (`render/flashlight.ts`). `ui/death.ts` shows the cause, the time survived and what you took from furniture, and "New world" reloads with the next seed |
| Items | Instances (`core/items.ts`) with a uid, count, condition and one grid per pocket. Items take w × h cells and rotate; identical, stateless items stack up to their type's limit. `core/inventory.ts` holds the hands, worn items and piles (an 8 × 6 grid per block of floor), plans moves (fit, reach, reasons) and works out handling times; `core/handling.ts` queues moves, which happen when their time is up and are checked again then. The queue runs as a 20 Hz system and pauses while time is compressed |
| Inventory screen | `ui/inventoryScreen.ts`, plain DOM: pockets and piles drawn as grids, pointer-based drag and drop with a preview of the cells, R to rotate while dragging, keys for the common moves, and a details panel that lists every place an item can go with its time or the reason it can't. The quickbar and handling progress are in `ui/hud.ts` |
| Time of day | `core/sky.ts` interpolates keyframes (night, dawn, day, dusk) for the sky colour, sun or moon light, ambient light and fog; `render/sky.ts` applies them each frame. The benchmark stays in daylight |
| Terrain | Seeded value-noise heightmap in metres, generated one column at a time on the main thread |
| Structures | Boxes in metres, applied in order and rasterized for the block size (`core/structure.ts`). The benchmark's test house is built this way |
| Templates | ASCII layers in half-metre blocks (`core/templates.ts`). A template is compiled once against the registry: each cell gets a block id, and furniture marks become pieces anchored at their lowest corner. A placement turns it by quarter turns and stamps whatever part falls inside a chunk |
| The hamlet | `core/hamlet.ts`, the game's world near spawn (the benchmark keeps the test house): an asphalt road with five buildings on lots beside it, on the flattest site within 160 m of the origin. Lots and the road are flattened and blended into the ground by a `Surface` that worldgen applies per column; buildings are stamped per chunk; furniture comes with its column, with loot rolled from a stream keyed by its position (`core/loot.ts`). All of it is a pure function of the seed and position, so chunks can generate in any order |
| Stress-test city | `core/city.ts`: a flat grid of streets around the origin, each city block holding two back-to-back rows of the hamlet's templates, stacked to 1–N storeys (`stackTemplate` in `core/templates.ts`). Buildings are indexed by the chunk columns they overlap, so stamping and furniture look only at their own column. The hamlet and the city share the `Site` interface (`core/site.ts`) |
| Block entities | `core/blockEntities.ts`: furniture and doors, each anchored at its lowest corner with every cell pointing back at it. Closed doors and solid furniture count as solid for physics and ray casts. A container shows its contents once searched (1–3 s by size); `core/inventory.ts` treats its pockets as another place items can be, within 2 m. They're drawn as boxes in their colour, and doors as panels that swing inward (`render/furniture.ts`). E opens and closes the door or searches the container in the crosshair; searching and doors are timed actions in the handling queue. Entities stay in memory once added, so a column that generates again doesn't duplicate them |
| Streaming | A chunk is meshed only when all 8 neighbouring columns exist, so borders never need a second pass |
| Assets and credits | `content/base/assets/manifest.json` lists where each asset file came from; `core/assets.ts` checks it (CC0 and CC BY only, and CC BY needs an author and a link, each file listed once) and, given the pack's files, that every file under `assets/` comes from a listed source and every listed file exists. The start and pause card's Credits link shows `ui/credits.ts`, drawn from it. `npm run validate` checks the base manifest, and any `manifest.json` passed to it, against the files in its pack |
| Item models | glTF binaries in the pack, named by a `models` entry (file, `grip`, `anchors`) that an item points at with `model`. The validator checks the id, and that the file exists next to the content file that names it. `render/models.ts` loads them with `GLTFLoader` and prepares each twice: lying on the ground, and held at its grip pointing forward. In piles (`render/piles.ts`) an item with a model lies at its place in the pile's grid, turned as it lies there (`core/pileLayout.ts`); the rest form the bundle. In your hands (`render/hands.ts`) items are drawn after the world in their own scene with the depth cleared, so they never clip into walls, with lights copied from the sky; an item without a model is a plain box sized from its cells. A model that hasn't loaded, or can't, falls back the same way and is reported with the content errors |
| Content | JSON in `src/content/base`, with sections for blocks, items, furniture, loot tables, templates, zombie types and models. Valibot schemas (`core/schema.ts`) check each file and give the TypeScript types; `core/content.ts` merges files in order and then checks references between them. An override keeps the block's runtime id. A file with any issue, including a broken reference, is skipped whole |
| Units | Weight in grams, volume in millilitres, item length in millimetres |
| Tests | Vitest, on the core, plus the render code that has logic of its own (culling, model forms) |
| Lint/format | Biome, repo-wide (`biome.jsonc`): every stable rule on. See the static-analysis pillar in the root README |
| CI | `.github/workflows/deadvox.yml`: typecheck, tests, content validation, build |
| Hosting | GitHub Pages via `.github/workflows/pages.yml`, published under `/deadvox/` |

## Layout

```
src/
  core/        pure logic: coords, scale, chunk, world, worldgen, structure, templates, hamlet, storage,
               mesher, raycast, physics, content and schema, assets, items, inventory, handling,
               block entities, loot; the simulation core: sim, clock, scheduler, compression, events,
               random, entities, needs, sky
  content/     JSON content packs (base/): blocks, items, furniture, loot, templates, zombies;
               assets/manifest.json lists where each asset file came from (URL, author, licence)
  worker/      mesh worker + message types
  render/      three.js chunk meshes, sky and lights, piles, furniture
  game/        engine setup, play mode, streaming, player controller, input, test house,
               starting loadout, move targets, build mode
  bench/       milestone 1.0 benchmark: runner, stats, results page
  ui/          inventory screen, quickbar and handling HUD, credits, CSS
  cli/         content validator (npm run validate -- mod/*.json)
  main.ts      picks play, benchmark or results page from the URL
test/          Vitest specs for core, and content and manifest fixtures (fixtures/content/, fixtures/assets/)
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
  column. Move it to the workers when worldgen grows (towns, a region map).
- Fatigue only rises: sleep arrives in 1.8. The status is numbers in the HUD
  for now. Only food, drink, lights and batteries can be used.
- A light that's switched on shines only from your hands; put away, it goes off.
- The death screen's "time survived" is game time; its looting summary counts
  items taken out of furniture, not ones picked up from the ground.
- The base pack has no models yet: the flashlight's file ("Torch" from
  OpenGameArt) is still to be added (see SLICE-1.md, 1.5.5), so every item is a
  bundle in a pile and a box in your hands. Furniture is plain boxes.
- A pile's bundle is drawn over the middle of its block, so it can overlap items
  with models lying in the same pile.
- Zombie types name a `model`, but it isn't checked against the `models` section
  yet; shamblers are box figures in 1.7.
- The hamlet's templates are drawn in half-metre blocks, so only the game's
  block size has it; the benchmark's other sizes use the test house.
- An open door doesn't block movement anywhere; its swung panel is only drawn.
- Shamblers' spawn marks in templates are left as air; nothing spawns yet (1.7).
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
