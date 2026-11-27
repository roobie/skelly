---
read_if:
  - you're importing the game runtime from another package
  - you're adding, removing or regrouping a runtime entry point
  - you're adding a test that needs runtime internals
  - you change terrain aperture clearance or actor collision shape dispatch
  - you change sunlight exposure or player-sense caching
---

# Engine

`@skelly/engine` is the game runtime that deadvox runs: simulation, world, items, bodies, sky, saves and vehicles,
and the game session, input and replay around them (`src/game`). It
holds no presentation code and no product content; the boundary and its reasons are in
`docs/decisions/0009-content-defined-products.md`, "Package boundaries".

## Entry points

Other packages import the runtime only through the curated entries that the `exports` field of `package.json` names, one
per domain.
An entry carries only what code outside the package uses, so the package's surface is chosen rather than every
file it holds. Files inside the package import each other by relative path, not through these entries: an entry
loads every module it re-exports, so going through one would load modules the importer does not use. See
`packages/deadvox/tools/runtimeClosure.ts`, `ownName`.

The `./internal/*` subpath is the test-only surface: it resolves only under the `skelly-test` export
condition, which the deadvox and presentation Vitest configs and the dev servers of deadvox's browser stages
enable, and which the product dev server and build never do. Tests outside the package need runtime internals
no entry carries; this surface serves them without growing the entries. See
`packages/deadvox/tools/runtimeEntries.ts`, `entryViolations`, for the check that keeps product code off it,
and `packages/deadvox/tools/runtimeClosure.ts`, `PRESENTATION_POLICY`, for the one that keeps presentation
off it.

## Terrain clearance

Terrain aperture clearance stays separate from actor shape dispatch: ordinary obstacle tests must not discover
furniture. General aperture lookup consumed about a third of the main thread because obstacle tests repeated
sorted furniture proximity queries, even for distant boxes with no windows. Obstacle count must not multiply
terrain discovery work: actor envelopes and fitted openings answer different collision questions. See
`src/core/physics.ts`, `PhysicsParams`, and `src/core/blockEntities.ts`, `BlockEntities.windowCollisionAt`.

Clearance margins belong to content rather than actor shape tuning, so authored near-fit tolerance can
change without changing physical mechanisms. See `src/core/apertureCollision.ts`, `apertureShapes`, and
`src/core/schema/furniture.ts`, `FurnitureSchema`.

## Sense caching

Sun exposure must stay exact after an edit without repeating sky scans for unrelated world activity or a
render frame boundary. See `src/core/lights.ts`, `SunExposureCache`, and `src/core/terrainRead.ts`, `ChunkSource`.

Player sense is shared only within an active actor step, including its spawn batch. A later scheduler
consumer or a command must read live inputs: the player, inventory, terrain or power state may have changed
between consumers even at the same simulation time. See `src/game/session.ts`, `createSession`.

## Tests

The tests here use fixtures only. A test that reads shipped content stays in deadvox and reaches the runtime
through the entries or the test-only surface.

The runtime compiles without DOM types; see `tsconfig.json`.
