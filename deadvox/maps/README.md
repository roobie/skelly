---
read_if:
  - you're authoring or exporting a Deadvox site in Tiled
  - you're changing authored-site fixed loot or playtest-map scope
  - you're extending the workshop route or its multiple approaches
  - you're authoring time-windowed Tiled spawn markers
  - you're drawing playtest beat areas or marking key fixed loot
  - you're authoring or reviewing the playtest military compound and its routes
---

# Authored sites

Maps edited in Tiled are authored as `.tmj` and have no sibling `.tmj.jsonnet`. Tiled saves the `.tmj`; `npm run content:compile` would overwrite edits if that file were generated. Use `.tmj.jsonnet` only for maps not edited in Tiled: compilation generates their `.tmj`, which must not be opened for editing in Tiled. `tools/jsonnet/compile.mjs`, `SOURCE_ROOTS` selects `.tmj.jsonnet` sources and `outputPath` maps them to generated `.tmj`; this mapping does not guard against pairing a Tiled-edited map with Jsonnet. Tiled-edited `.tmj` maps describe site-scale terrain, routes, building placements and spawns; `maps/extensions/deadvox.mjs`, `exportLayout`, turns them into content layouts, and `npm run validate` checks the exported file against the merged content registry. Format the exported JSON with Biome before validation so Tiled output also satisfies the repository's formatting check. Keep the authored map and its exported layout together; interiors stay reusable ASCII templates. Review the extension before trusting it in Tiled.

The playtest map links the shelter, Mike's place, medical site and military compound as distinct beats. A vehicle-width road runs from the camp's guarded north double gate to the medical compound, giving vehicles access to the site. It stops short of the south fence, where the narrower trail bridges the gap because the compound's fences, hall and Dad's cabin leave no room to extend the road. The camp's southern breach remains an alternate way in, so its perimeter is defended without making the site a dead end.

For #181 beat 4, Mike's place supports the light route without noise; quiet requires a noisy yard search for the suppressor's missing input, and the medical site's second night tests the trade. The dead radio remains story-only. Keep the Tiled source and exported layout paired while reusable interiors remain separate templates. See `maps/playtest.tmj`, `Full-width dirt road from the medical compound to the north double gate`, `Dirt track from house through hamlet and cabins to the medical compound`, and `Track spur to Mike's place`; `maps/extensions/deadvox.mjs`, `exportLayout`; `test/authoredFixedLoot.test.ts`, `routes through the north double gate while keeping the south wall breach open`; and `../SLICE-3.md` for beat-4 choices.

`lone-house.tmj` / `layouts.json` remains the small authored-site pipeline sample. `hunting_cabins.tmj` / `layouts-cabins.json` remains the terrain-and-cabin sample (`cabins_demo`). Keeping these examples separate lets them continue to demonstrate narrow editor/runtime contracts without turning them into alternate versions of the playtest progression.

## Military compound

The north pen makes the second gate a real threshold instead of a panel one can walk around; the breached southern wall preserves an alternate approach. The uneven wall tops carry the abandoned-site motif. See `src/content/base/camp.json`, `camp_gate_return` and `camp_gate_damaged`, and `test/campGate.test.ts`, `keeps the placed north entrance passable through gate 2 and blocks bypasses around its closed leaf`.

## Fixed loot

A building layout can place fixed items at template-local furniture anchors. The `placement` field puts an item in a visible pile on top of its anchor; otherwise the item goes into the anchor's container. An anchor used only for surface items does not need a container. Visible placement does not bypass military sourcing: a military-only item must be placed in a template marked military, while container loot needs a military table. `Inventory.furnish` supplies fixed items before seeded filler so progression and craft ingredients are not crowded out. Fixed items regenerate from the site and seed; the existing inventory save owns looted state. See `src/core/schema.ts`, `FixedLootItem`; `src/core/authoredLayout.ts`, `fixedLootIssues`; `src/core/authoredSite.ts`, `AuthoredSite.furnitureIn`; and `src/core/inventory.ts`, `Inventory.furnish`.

The scenario start belongs to its layout so a playtest begins at the authored beat's time; `src/game/config.ts`, `configFromUrl`, still lets an explicit `time` parameter override it.

## Playtest beats and key loot

Rectangle `beat` objects mark each beat's area by a `beat` id, and `maps/extensions/deadvox.mjs`, `exportLayout`, writes them into the layout's `beats`. A fixed-loot item's `key` flag marks what the beat hinges on. Both are observation only: the playtest metrics read them through `src/core/authoredSite.ts`, `AuthoredSite.playtestMarks`, and the simulation never does, so redrawing an area or marking an item cannot change play. What the metrics record is in `docs/playtest-run.md`, "What the metrics export records".

## Time-windowed spawns

Tiled shambler markers use `window_from` and optional `window_to`; `maps/extensions/deadvox.mjs`, `exportLayout`, writes them into the spawn `window`. Named game-clock boundaries live in `src/core/clock.ts`, `SPAWN_TIMES`. See `DESIGN.md`, "Spawning", for the rule and its reason.
