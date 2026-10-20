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

Surface placement makes authored gear visible without bypassing source economy eligibility or the ordinary slot rules for fitted items. Keep authored progression and craft ingredients ahead of seeded filler so incidental loot cannot crowd them out. Regeneration must not replace inventory's authority over already looted state. Authored layouts and seeded scenario placements share fixed-loot admission and assembly rather than defining different item rules. See `src/core/placementLoot.ts`, `placementLootIssues`; `src/core/loot.ts`, `rollLoot`; and `src/core/inventory.ts`, `Inventory.furnish`.

The playtest gives the player a sidearm and its ammunition early, as two separate finds in different containers of the first house on the route from spawn. See `src/content/base/layouts-playtest.json` and `test/authoredFixedLoot.test.ts`, "gives the starting house a revolver and its ammo box in separate containers".

The layout owns the playtest start time, with an explicit URL time taking precedence. Beat rectangles and key-item markers feed observation metrics only; they do not affect simulation. See `src/core/authoredSite.ts`, `AuthoredSite.playtestMarks`, and `src/game/config.ts`, `configFromUrl`.

Time-windowed spawn markers use named game-clock boundaries. Horde markers place grouped threats at a standing point; the FOB west-wall horde makes noisy armoury entry consequential while the east-wall crouch passage remains a quiet route. See `maps/extensions/deadvox.mjs`, `addHorde`, and `src/core/authoredSite.ts`, `AuthoredSite.hordesIn`.

Keep `lone-house.tmj` and `hunting_cabins.tmj` as separate pipeline examples; neither is an alternate playtest progression.
