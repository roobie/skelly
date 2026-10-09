---
read_if:
  - you change content schemas, validation, registry merging, or recipe/workstation data
  - "you change skill content tuning or training rules"
  - you're authoring or changing base template geometry or palettes
  - you change content references, static reachability, or disassembly-output contracts
  - you change how content-loading tests build their registry fixtures
  - you change recipe, workstation or book reachability contracts
  - you author weathering profiles or site weathering-profile references
  - you change static reachability checks
  - you author or validate time-windowed template spawns
  - you're authoring or changing playtest fixed loot
  - you're assigning noise to a furniture action
  - you're authoring base surface materials or procedural pattern tuning
  - you're assigning noise to opening a door
  - you change site-generation tuning or its content schema
---

# Content sections and recipes

The single section descriptor in `src/core/schema.ts` owns native Valibot schemas,
labels and registration order. `CONTENT_SECTIONS`/`CONTENT_SECTION_KEYS` supply
file validation, ordinary registry maps and merging, and CLI section counts.
The content schema is derived from the descriptor; the checked metadata mapping
also fails typecheck if someone independently adds a schema section without an
entry. Blocks keep explicit numeric IDs and reserved AIR handling. Model/sound
origin tables remain explicit. File order, overrides and diagnostic order remain
unchanged. See `npm run validate` for the exhaustive current section/count list,
not a second hand-maintained section table here.

## Weathering profiles

Weathering is a render-only content choice rather than saved world state. `WeatheringSchema` in `src/core/schema.ts` validates named profiles, and `referenceIssues` in `src/core/content.ts` checks a layout's optional profile reference; layouts without one use the shared default in `src/game/config.ts`, `configFromUrl`. This lets sites share the shader while mod content changes the age and material response that BR can compare in the debug scene.

## Content test registries

For d121, keep fixture-only template checks on a registry containing the
content those assertions exercise; full-pack cases retain the base definitions
when their contract depends on cross-file merging or references. This avoids
rechecking unrelated base content while preserving those integration checks;
see `test/content.test.ts`, `templateBase`, and `test/authoredSite.test.ts`,
`registry`.

## Exterior shell continuity

An authored floor course cut into an exterior wall reads as an unfinished recess. Keep the shell visually continuous while doors and solid window frames remain authored openings. See `src/core/content.ts`, `floorCourseWallGap`.

## Site-generation tuning

`siteGeneration` definitions in `src/core/schema.ts` keep authored-site terrain and vegetation controls in base content rather than mixing generator settings into `layouts-playtest.json`. `src/content/base/site-generation.json` supplies the authored-site profile consumed by `src/core/authoredSite.ts`, `AuthoredSite`; tune that profile to balance natural variation against playable structures and routes.

## Recipe format (Slice 2.2)

`recipes` is a list of definitions: `id`, `result: { item, count }`, positive
`time` in **game minutes**, `skills` and `qualities` maps, `components` as groups
of `{ item, count }` alternatives, and optional `workstation` (an id or null).
Counts are positive whole items; each component group has at least one alternative.
Skill requirements are whole levels bounded by `SKILL_LEVEL_MIN` and
`SKILL_LEVEL_MAX` from `src/core/character.ts`; `src/core/schema.ts`, `SkillLevel`,
validates recipe requirements. Quality requirements are levels 1–5, matching
unchanged item `ToolSchema` levels. A recipe may have at most
**1,024 combinations**, inclusive: the product of its group lengths. Validation
uses exact integer multiplication and reports the count when refusing a file.

- Skill definitions own effect tuning and training activities. An activity grants either fixed practice or practice per simulation second; a tiered activity stops at its declared tier and discards excess, while an untiered activity trains to ordinary level 10. Inventory Management uses untiered fixed practice after completed ordinary transfers, box unpacking and furniture searches; refused, cancelled or failed actions award none. The same handling effect scales those actions; at level 0 its factor is 1, so each takes its base time. `src/core/inventory.ts`, `Inventory.scaleHandlingTime`, supplies the shared factor. The starting practice amount is first-look tuning, not an approved value. Character progression is saved as defined in 2.5.
- Quality IDs are keys declared by loaded items' `tool.qualities` (including
  mod keys) or furniture `workstation.qualities`, not a new top-level section.
  A missing declaration is an error. Whether a reachable item or placed
  workstation supplies the quality is the separate 2.3 acceptance check.
- Furniture workstation metadata owns its station ID, qualities, and work-time
  bonus. Plain furniture IDs are not workstation IDs. `reach()` in
  `src/core/reach.ts` exposes nearby stations, and `planCraft()` in
  `src/core/crafting.ts` uses their qualities and bonus for a named station.
- Result, every alternative item, skill, quality and workstation references are
  checked after ordered merging. Broken files are removed whole, including their
  skills/recipes/items, and references are checked again as before.

Procedural surface pattern IDs are validated with `BLOCK_PATTERNS` in
`src/core/schema.ts`; the shader implementation lives in
`src/render/surfacePatterns.ts`. Woodland camouflage's palette and washout
are block fields in `src/content/base/blocks.json`, alongside the pattern assignment
to `camo_woodland`. Keeping blotches anchored in world coordinates avoids texture
assets and repeated seams; the tunable palette and washout live on the block.
All camo blocks share one palette and washout; distinct looks need per-block shader lookup.

Template spawn palette entries can specify `window: {from, to?}`.
`src/core/schema.ts`, `PaletteThingSchema`, validates the field; named game-clock
boundaries live in `src/core/clock.ts`, `SPAWN_TIMES`. See `DESIGN.md`,
"Spawning", for the rule and its reason.

The initial torch, candle and repair-kit recipes consume whole solid items only.
There are **no millilitre components, partial liquid use, pouring/mixing, new item
storage or save format**. No container is consumed by these recipes. Before any
later recipe uses part of a liquid, its stored quantity-to-ml mapping, saved
partial use and container retention must be approved. Torch/candle result
metadata has no light or burning component yet; those mechanics belong to 2.9.
Slice 2.2 introduced recipes as data only. Slice 2.5 adds crafting, progression,
and book knowledge; `src/core/saveFormat.ts`, `SAVE_SCHEMA_VERSION`, and the simulation
fingerprint require old saves to be refused rather than migrated during pre-alpha.

## Static reachability (Slice 2.3)

`npm run validate` checks the effective merged pack using `HAMLET_TEMPLATES`
and building templates in unmarked authored layouts. It compiles their placed
furniture rather than treating every palette declaration or template as placed.
Placement loot overrides replace furniture loot. Nested tables contribute only
with positive possible rolls/item counts (weights are already strictly positive
by schema). Zombie loot comes from positive-chance markers in the hamlet template
set that can fit the population cap, accounting for shuffled north templates,
and roadside wanderers only when a slot can remain.

For #311, a globally reachable item type does not prove that its authored
container can be looted. `test/authoredFixedLoot.test.ts` uses
`templateReachableStandingPositions` with `templateSpatialIssues` to check the
playtest's containers against the same standing traversal as template validation,
not a second test-owned walker.

For 2.10, store and garage stock stays in template palette loot overrides rather
than position-specific runtime code. `worldSources()` in
`src/core/reachability.ts` follows compiled pieces from `HAMLET_TEMPLATES` in
`src/core/hamlet.ts`, so moving furniture keeps its loot source with the placed
lot.

For #346, `SiteLayoutSchema.demo` marks fixture and showcase layouts that are
not sources in the starting-world reachability report. `worldSources()` roots
loot from hamlet templates and unmarked authored layouts; for authored sites it
includes both placed building containers and fixed loot. This leaves #181's
military camp eligible to ground d114's reachability requirement without letting
first-look fixtures add their stock to the content world.

For d65's `hardware_store` and `garage`, `window_frame` remains solid; the
authored opening around each frame supplies the sightline without adding a
translucent-block rule. See `src/content/base/templates.json`, `hardware_store`
and `garage`.

The least component fixed point starts at found types. A result enters only when
at least one alternative per component group is reachable; unseeded recipe cycles
add nothing. Content acceptance reports **every declared alternative** that is
neither found nor craftable. It is a type closure, not a quantity/consumption,
particular-seed or whole-game solver. For #346, `addUnpackedContents` in
`src/core/reachability.ts` also makes reachable package contents available,
including packages nested inside other packages. The closure extends through
actual disassembly and salvage outputs via `addDisassemblyOutputs` in
`src/core/reachability.ts`; yield counts come from `disassemblyOutputs` in
`src/core/disassembly.ts`, so zero-count yields add no reachable type.
Self-yields are refused to prevent no-op take-apart; see
`src/core/content.ts`, `checkDisassembly`.

Disassembly closure assumes top skill is reachable: nothing checks whether a
disassembly skill has a practice source. The skill-source check covers recipe
requirements only; see `src/core/reachability.ts`, `addDisassemblyOutputs` and
`skillIssues`.

Tools are a separate hard check: a second loot-seeded fixed point requires both
components and sufficient tool-quality levels before adding a result. A recipe
cannot bootstrap its own quality, directly or through another tool-dependent
recipe. Independently found or grounded crafted providers are valid.

Knowledge is a hard source check: the explicit starting recipes and recipes
listed by reachable teaching books are the only knowledge sources. An unknown
recipe fails at `.knowledge`, and its result cannot ground another recipe's
components or tool quality. `src/core/reachability.ts`, `checkReachability`,
closes reachable practice sources before accepting positive skill requirements
and hard-checks workstation placement and quality. A recipe that cannot be
learned and completed from reachable sources cannot bootstrap its own skill.
`src/core/schema.ts`, `BookSchema`, owns book teaching data; the `paperback` has
no book component and remains inert.

`CONTENT_COUNT_EXCLUSIONS` in `src/core/reachability.ts` keeps runtime escrow and
the project's debug/case/body-part policy out of acquired-content totals.
`npm run validate` reports the effective component and tool closures, content
count, and any unreachable content; do not copy its counts or content lists into
this document. Content growth beyond the crafting/books milestone remains with
Slice 2.11. Reachability issues use the winning recipe's merge origin, preserving
source file and index through ordered overrides and removal.

`src/core/character.ts`, `Character`, owns live practice and knowledge;
`src/core/reachability.ts`, `checkReachability`, independently proves that their
sources are available from placed loot. The component/tool closures include
calculated disassembly yields at top skill; the separate recipe skill-source
check must prove that reachable practice sources can raise a recipe's required skill. Reachability
stores no closure or runtime state; progression, crafting and disassembly remain
separate owners.

## Furniture action noise

Give a furniture action an explicit noise only when it should expose the player; ordinary doors and containers stay quiet. The sound owns its hearing radius, and validation rejects a selected event that cannot alert. See `src/core/schema.ts`, `FurnitureSchema`; `src/core/content.ts`, `checkDoorOpenNoise` and `checkSearchNoise`; `src/game/doorAction.ts`, `registerDoorAction`; and `src/game/session.ts`, `search`.
