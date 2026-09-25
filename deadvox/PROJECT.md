# deadvox — singleplayer voxel survival

A browser-based, singleplayer survival game in the spirit of DayZ (a large open
world, scavenging, zombies, staying alive) with the simulation depth of
Cataclysm: DDA (detailed items, bodies, crafting). The graphics are blocky voxels.

**Play:** <https://roobie.github.io/skelly/deadvox/> (`?seed=N` picks a world,
`?radius=N` sets the view distance in chunks).

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
| Meshing | Culled faces with per-vertex AO (`core/mesher.ts`), run in Web Workers. Buffers are transferred, not shared |
| Chunks | 32³ blocks, `Uint16Array` of runtime block ids, y-major. World is 4 chunks tall (`MIN_CY..MAX_CY`) |
| Terrain | Seeded value-noise heightmap, generated one column at a time on the main thread |
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
  core/        pure logic: coords, chunk, world, worldgen, mesher, raycast, physics, content, inventory
  content/     JSON content packs (base/)
  worker/      mesh worker + message types
  render/      three.js chunk meshes
  game/        streaming, player controller, input
  ui/          HUD/inventory DOM + CSS
  cli/         content validator (npm run validate -- mod/*.json)
  main.ts      wires it all together
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
- Nothing is saved yet.
- Pointer lock only works on desktop. There are no touch controls.

## Next steps

1. **Saves.** Store edited chunks in OPFS (IndexedDB as a fallback), plus
   player state, and call `navigator.storage.persist()`. Save chunks with a
   per-chunk palette of *string* block ids, because runtime ids depend on which
   content is loaded. Offer save export and import.
2. **Time and simulation tick.** Separate a game clock from frame time: hunger,
   thirst, day and night. Add catch-up ticks for unloaded areas.
3. **Body and health model.** CDDA-style body parts with wounds, bleeding and
   infection, all as data. The HTML UI is where this pays off.
4. **Items in the world.** Loot containers, pickups, nested containers with
   volume limits.
5. **Towns.** Roads, buildings and loot tables in worldgen, using the asphalt,
   concrete and planks blocks.
6. **Zombies.** Entities, pathfinding on the voxel grid (in a worker),
   hearing and sight.
7. **Mods at runtime.** Load extra JSON packs from URLs or local folders (File
   System Access API) through the same `buildRegistry` path.
8. **Weapons.** gungen assemblies are good candidates for in-game guns.
