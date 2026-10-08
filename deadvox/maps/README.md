---
read_if:
  - you're authoring or exporting a Deadvox site in Tiled
  - you're changing authored-site fixed loot or playtest-map scope
  - you're authoring or reviewing the playtest military compound and its routes
  - you're authoring time-windowed Tiled spawn markers
---

# Authored sites

Tiled `.tmj` files describe site-scale terrain, routes, building placements and spawns; interiors stay reusable ASCII templates. `maps/extensions/deadvox.mjs`, `exportLayout`, turns one map into a content layout, and `npm run validate` checks the exported file against the merged content registry. Format the exported JSON with Biome before validation so Tiled output also satisfies the repository's formatting check. Keep the authored source and its committed JSON together. Review the extension before trusting it in Tiled.

The playtest scenario is authored in `maps/playtest.tmj` and exported to `src/content/base/layouts-playtest.json`. Its route includes the workshop, medical site and military camp; reusable interiors remain in their template content files. `maps/extensions/deadvox.mjs`, `exportLayout`, reads the Tiled source and all template packs.

## Military compound

The compound has an operable northern gate and a named southern breach route so its perimeter can read as a defence without sealing foot access. The breach is authored as a route in `maps/playtest.tmj`; `src/content/base/camp.json`, `camp_wall_run` and `camp_gate`, defines the walls and gate. `test/authoredFixedLoot.test.ts` checks the gate opening and route across the breach. New structures follow the project's dilapidation direction starting with the camp walls in #385; retrofits to existing structures are tracked in #396.

`lone-house.tmj` / `layouts.json` remains the small authored-site pipeline sample. `hunting_cabins.tmj` / `layouts-cabins.json` remains the terrain-and-cabin sample (`cabins_demo`). Keeping these examples separate lets them continue to demonstrate narrow editor/runtime contracts without turning them into alternate versions of the playtest progression.

## Fixed loot

`SiteLayoutDef` in `src/core/schema.ts` gives a building placement fixed items at a template-local container anchor. `src/core/authoredSite.ts`, `AuthoredSite.furnitureIn`, combines those with the container's ordinary seeded table, and `src/core/loot.ts`, `fixedItems`, preserves item stack limits. Fixed items are supplied first to `src/core/inventory.ts`, `Inventory.furnish`: progression and craft ingredients therefore cannot be crowded out by seed-owned filler, while the remaining capacity still receives its normal deterministic roll. The fixed source regenerates from site and seed; looted state remains owned by the existing inventory save.

The contract records item, count and optional condition, not a second generic item-state format. The beats' named contents already belong to item definitions and construction defaults: `shotshell_box` owns its unpacking, `src/core/items.ts`, `ItemFactory.create`, makes a pump shotgun empty, and an unpowered flashlight needs no inserted battery. This keeps authored placement separate from the state and behavior each item already owns.

The scenario start belongs to its layout so a playtest begins at the authored beat's time; `src/game/config.ts`, `configFromUrl`, still lets an explicit `time` parameter override it.

## Time-windowed spawns

Tiled shambler markers use `window_from` and optional `window_to`; `maps/extensions/deadvox.mjs`, `exportLayout`, writes them into the spawn `window`. Named game-clock boundaries live in `src/core/clock.ts`, `SPAWN_TIMES`. See `DESIGN.md`, "Spawning", for the rule and its reason.
