---
read_if:
  - you're authoring or exporting a Deadvox site in Tiled
  - you change economy contexts or exporter ownership for authored sites
  - you're changing fixed loot, playtest beats or spawn markers
  - you're reviewing the military compound's routes
---

# Authored sites

Tiled-edited maps are authored `.tmj` files; do not pair them with generated `.tmj.jsonnet` sources, because content compilation can overwrite edits. Use Jsonnet map sources only when the `.tmj` is generated rather than edited in Tiled. The exporter turns Tiled site data into content layouts; keep the authored map and exported layout together, while reusable interiors remain ASCII templates. See `tools/jsonnet/compile.mjs`, `SOURCE_ROOTS`, and `maps/extensions/deadvox.mjs`, `exportLayout`.

The playtest route treats the shelter, Mike's place, medical site and military compound as distinct beats. The vehicle-width road reaches the compound's north gate; the narrower trail covers the remaining gap, while the south breach remains an alternate approach. Keep these approaches legible without making the compound a dead end. See `maps/playtest.tmj` and `test/authoredFixedLoot.test.ts`, "routes through the north double gate while keeping the south wall breach open".

Keep exported layouts outside the Jsonnet output manifest so the Tiled exporter remains their only writer. Author the fallback context on the map and export a building context only when it has an explicit override: otherwise template usage must inherit the site's tier. Author tier exceptions on the building rather than manufacturing them from template defaults in the exporter. See `maps/extensions/deadvox.mjs`, `exportLayout` and `addBuilding`, and `src/core/authoredPlacement.ts`, `placementOf`.

## Fixed loot

A layout can place fixed items on a furniture anchor or inside its container. Surface placement makes authored gear visible; military-only items still require military sourcing. Fixed loot supplies placement, quantity and fitted-item choices, while item definitions own other state; validation applies the runtime slot rules to fitted items. Fixed items precede seeded filler so authored progression and craft ingredients are not crowded out. Fixed loot regenerates from the authored site and seed; inventory saves own looted state. See `src/core/authoredLayout.ts`, `fixedLootIssues`, and `src/core/inventory.ts`, `Inventory.furnish`.

The layout owns the playtest start time, with an explicit URL time taking precedence. Beat rectangles and key-item markers feed observation metrics only; they do not affect simulation. See `src/core/authoredSite.ts`, `AuthoredSite.playtestMarks`, and `src/game/config.ts`, `configFromUrl`.

Time-windowed spawn markers use named game-clock boundaries. Horde markers place grouped threats at a standing point; the FOB west-wall horde makes noisy armoury entry consequential while the east-wall crouch passage remains a quiet route. See `maps/extensions/deadvox.mjs`, `addHorde`, and `src/core/authoredSite.ts`, `AuthoredSite.hordesIn`.

Keep `lone-house.tmj` and `hunting_cabins.tmj` as separate pipeline examples; neither is an alternate playtest progression.
