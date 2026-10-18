---
read_if:
  - you're running Deadvox or choosing its development entry point
  - you're changing project boundaries, content or save policy
  - you're checking the game's current limitations or supported workflow
---

# Deadvox

Deadvox is a browser-based survival game combining a large scavenged world with detailed items, bodies and crafting. Its simulation and authored content are project-owned; the renderer is three.js and the interface is HTML/CSS. The project's reasons are in [ADR 0005](docs/decisions/0005-own-voxel-engine.md).

**Play:** <https://roobie.github.io/skelly/deadvox/>. URL configuration is owned by `src/game/config.ts`, `configFromUrl`; benchmark configuration is owned by `src/bench/run.ts`, `benchRunFromUrl`.

## Project boundaries

- Static hosting with no game server. The simulation agrees bit for bit across browsers from version 1, so lockstep multiplayer can follow it; see [ADR 0008](docs/decisions/0008-deterministic-world.md).
- Content is data and can be extended with mods.
- Simulation state is plain data so it can pause, compress time, catch up and save.
- The UI stays outside `src/core`; Gungen exports firearm models that Deadvox validates and loads.
- Saves require matching simulation, content, generator and envelope identity. Migration is not supported before v1.0 beta; see [ADR 0002](docs/decisions/0002-saves.md).

## Development

From the repository root, use `npm run setup` once, then `npm --prefix deadvox run dev`, `npm --prefix deadvox test`, `npm --prefix deadvox run validate` or `npm --prefix deadvox run build`. The CPU-sensitive shambler budget is opt-in through `npm --prefix deadvox run bench:shambler-budget`.

The content contract is maintained by validation; authoring rules are in [docs/content.md](docs/content.md), and map guidance is in [maps/README.md](maps/README.md). Slice design and v1 scope are in [DESIGN.md](DESIGN.md) and [EPIC.md](EPIC.md).

## Known boundaries

Transparent blocks need a separate mesh path. Terrain generation still runs on the main thread. Furniture and many item models remain simplified; the authored item-look contract is in [DESIGN.md](DESIGN.md#piles-and-item-models). Pointer lock is desktop-only; touch controls are not supported. Save discovery, autosave and Continue exist.
