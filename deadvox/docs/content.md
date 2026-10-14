---
read_if:
  - you change content schemas, validation, registry merging, or recipe/workstation data
  - you change item economy metadata, source contexts, loot selection or loot-point descriptions
  - you change skill content tuning or training rules
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
  - you're authoring or changing visual furniture shapes or container appearance
  - you need the procedure or isolated look probe for furniture refinement
  - you're assigning noise to opening a door
  - you change site-generation tuning or its content schema
  - you're authoring or changing Deadvox content sources or their build pipeline
  - you add code that reads a content row by a fixed id
  - you author or validate curated map kits, role styles or connector contracts
  - you change the debug kit ownership view
  - you author graphics defaults or permitted player graphics choices
---

# Content sections and recipes

## Authoring source

Use the repository-wide authoring and conversion rule in `../../docs/jsonnet.md`. The shared compiler produces the JSON consumed by `buildRegistry` in `src/core/content.ts`; validation and runtime references therefore meet at one boundary.

## Core-pack integrity

Reject removal of required rows when validating core or modded packs. Keeping this check at the pack-validation boundary lets focused tests and tools construct partial registries without accepting an incomplete playable pack. See `requiredContentIssues` in `src/core/content.ts` and `validate` in `src/cli/validate.ts`.

## Graphics policy

Graphics defaults and allowed ranges or options belong to the core mod so mods can tune
quality without changing engine mechanics. Reject an inverted range, a default outside
its range, or toggle choices that exclude their default. Require the core policy row at
playable-pack admission rather than inventing missing policy in a renderer. See
`src/content/base/graphics.jsonnet`, `src/core/graphics.ts`, `GraphicsOptionsSchema`, and
`src/core/content.ts`, `requiredContentIssues`.

## Weathering profiles

Weathering is a render-only content choice, not saved world state. Named profiles let sites share the shader while selecting their own material response; layouts without a profile use the shared default. See `WeatheringSchema` in `src/core/schema.ts` and `referenceIssues` in `src/core/content.ts`. `configFromUrl` in `src/game/config.ts` selects the site profile.

## Content test registries

Fixture builders should include only the content an assertion exercises. Use one validated full-pack registry read-only when a contract needs cross-file references or reachability, and copy each section a test changes. This keeps unrelated validation from dominating tests and prevents changes leaking between assertions. See the registry fixtures in `test/content.test.ts`, `test/audioGunshot.test.ts`, `test/disassembly.test.ts`, and `test/firearmSave.test.ts`. Unrelated contract fixtures may author common-supply metadata through `test/economyFixtures.ts`, `buildFixtureRegistry`; admission tests must use raw sources so the fixture builder cannot conceal missing metadata.

## Authored structures and sites

Keep exterior shells visually continuous around authored openings; doors and solid window frames remain deliberate gaps. Floor and roof courses meeting an exterior wall use that wall's material, so interior flooring does not appear as an exposed facade stripe. Interior flooring retains its authored material. Doors need clear space on both sides so a player can pass through. See `floorCourseWallGap` and `checkTemplateSpace` in `src/core/content.ts`, and `templateDoorIssues` in `src/core/templateSpatial.ts`.

Keep enclosed building roofs flush with their exterior wall footprint so the roof silhouette follows the shell instead of adding projecting eaves. Open forecourt canopies are separate structures, not building eaves. See `src/content/base/gauntlet-city-kits.libsonnet`, `gauntlet_city_roof`, and `src/game/testHouse.ts`, `testHouse`.

Fixed loot takes eligibility from its resolved authored source context, not a compiled placement's ID. Stacking changes that ID without changing the source's authority. Anchor usage overrides retain the resolved tier; fitted children meet the same context. See `placementLootIssues` in `src/core/placementLoot.ts` and its callers in `src/core/authoredLayout.ts` and `src/core/scenarioComposition.ts`.

Keep authored-site terrain and vegetation controls in base content rather than mixing generator settings into authored layouts. This keeps layout geometry about the authored place and generation settings about its terrain. See `siteGeneration` in `src/core/schema.ts`, `site-generation.json`, and `AuthoredSite` in `src/core/authoredSite.ts`.

Procedural surface pattern IDs are schema-checked; the shader implementation remains in code. All camouflage blocks share one palette and washout; distinct looks require a per-block shader lookup. World-anchored blotches avoid texture assets and repeated seams, while block-owned palette and washout keep the shared look tunable. See `BLOCK_PATTERNS` in `src/core/schema.ts` and `surfacePatterns.ts` in `src/render`.

Windowed template spawns use named game-clock boundaries. Keep their rule and reason in `DESIGN.md`, "Spawning"; see `PaletteThingSchema` in `src/core/schema.ts` and `SPAWN_TIMES` in `src/core/clock.ts`.

### Curated kits

A weighted alternative must preserve its consumer's spatial contract, not merely fit a
bounding box. Alternatives must not move promised endpoints, remove a climb connector,
or change body obstruction and support within reserved circulation. This permits a
certificate for the selected composition to cover every alternative without searching
combinations. Exclusive ownership prevents write order from changing a facade.
Structural material roles must agree with the style binding so interior flooring cannot
silently become shell treatment. See `src/core/schema.ts`, `MapPieceSchema` and
`MapAssemblySchema`, and `src/core/templates.ts`, `compileMapPiece`, `traversalContract`
and `compileAssembly`.

City building pools may name an assembly instead of a literal template, but not both
under the same identity. An assembly owns its authored floor topology; stress-test
stacking cannot invent additional floors. Resolve alternatives independently for each
stable building location before requesting chunks: caching one selected assembly for a
whole pool would repeat the same furnishings across the city. See `src/core/cityPlan.ts`,
`buildCityPlan` and `templateCompiler`.

Bound authored volumes before allocating compilation buffers so a short metadata file
cannot request unbounded memory. See `src/core/schema.ts`, `KitSize`.

Whole-definition overrides revalidate retained consumers. Source provenance follows the
winning definition through nested placement so a conflict identifies the authors of both
claims rather than just the final block. See `src/core/content.ts`, `buildRegistry`, and
`src/core/mapKit.ts`, `mapKitIssues`.

Kit inspection stays in the development profile and reads compiled ownership and
provenance, including air claims. Reconstructing claims from visible blocks would hide
reserved voids and could blame the wrong nested source. See `src/debug/kitOverlay.ts`,
`KitOverlay` and `kitSlice`.

A route graph is intent, not body reachability. Admission uses reserved volume and known
support rather than assuming that unclaimed cells or terrain outside a piece are empty
or load-bearing. Climbing also requires a continuous body-clear connector with a
supported, braced exit that permits return. Ladder furniture owns its connector cells;
those cells are not reserved air, but do not excuse missing clearance around the body.
Use the same physical certificate for composed scenarios and kit publication so the two
boundaries cannot disagree about a usable climb. See `src/core/mapKit.ts`, `compileMapSite`,
`src/core/templateSpatial.ts`, `templateClimbCertificate` and `templateStandingRoute`,
and `src/core/climbCertificate.ts`, `climbCertificate`.

## Curated kits

Kit roles and delegated ownership keep authored structure separate from material choices and seeded assembly. Every alternative must preserve the slot's circulation and support contract so a visual or furnishing change cannot invalidate its route. See `src/core/templates.ts`, `resolveSlot`, and `src/core/mapKit.ts`, `mapKitIssues`.

### City building types

The city pool is authored, not inferred from item usage or building names. Each row names a template or kit assembly and owns its relative weight; an enabled fitting row is selected before its seeded kit slots resolve. A selected building that cannot fit the row tail falls back to the first enabled fitting row, preserving the existing packing rule. A zero weight disables a type without removing its geometry or loot definitions. See `src/core/schema.ts`, `ScenarioSchema`, and `src/core/cityPlan.ts`, `fillRow`.

Keep type geometry separate from the pool so changing prevalence never requires editing a building. Referenced assemblies, pieces, styles and loot tables remain independently overridable by id. See `src/content/base/scenarios.jsonnet` and `src/core/content.ts`, `buildRegistry`.

Residential buildings dominate the authored gauntlet mix; supply shops supplement them, while police equipment rooms and gun shops remain rare draws. Their civilian weapons use hunting eligibility rather than military admission, and empty outcomes keep an equipment room from promising a weapon. Medical tents provide treatment supplies rather than a guaranteed full kit. Existing source-context and nested-loot selection rules still own admission. See `src/content/base/gauntlet-city-building-types.libsonnet`, `src/content/base/gauntlet-city-medical.libsonnet`, and `src/core/loot.ts`, `lootTypeIssue`.

## Recipes

Recipe data names the result, inputs, skill and quality requirements, and optional workstation; `RecipeSchema` in `src/core/schema.ts` owns its shape and bounds. Keep alternative inputs bounded so validation cannot expand without limit.

Skill definitions own their effects and training activities. Quality requirements refer to qualities declared by loaded items or workstations, rather than a separate top-level content section. A reachable provider is a separate reachability requirement. See `SkillSchema`, `src/core/character.ts`, and `src/core/reach.ts`.

Validate recipe and component references against the effective ordered pack. Disassembly yields and salvage are authored for the item rather than inferred by reversing every recipe; see `planDisassembly` in `src/core/disassembly.ts` and `docs/crafting.md`.

The initial torch, candle, and repair-kit recipes consume whole solid items and do not consume their containers. A recipe using part of a liquid requires approval of the storage-to-volume mapping, saved partial use, and container-retention rules first. Old saves are refused rather than migrated in pre-alpha; see `SAVE_SCHEMA_VERSION` in `src/core/saveFormat.ts`.

## Static reachability

Content acceptance checks that authored world sources can provide declared item types through loot, crafting, disassembly, packages, teaching books, and fixed loot. It also checks required qualities and training sources. This catches content that validates structurally but cannot be reached in play; `npm run validate` reports the result without maintaining a second content list here. Type-source reachability does not prove that a particular authored container can be reached and looted. Fixed-loot tests use the same standing traversal as template validation; see `templateReachableStandingPositions` in `src/core/templateSpatial.ts` and `test/authoredFixedLoot.test.ts`.

Reachability is a type-source contract, not a quantity, seed, or whole-game solver. A recipe cycle without a found source cannot make itself reachable. Disassembly reachability assumes the required skill is attainable, while recipe requirements must have a reachable practice source; workstation qualities must be placed and reachable. Showcase and demo layouts are fixtures, not sources for playable-world reachability. Preserve these distinctions when changing the checker. See `checkReachability` and its source-closure helpers in `src/core/reachability.ts`, and `SiteLayoutSchema.demo` in `src/core/schema.ts`.

Debug fixtures, runtime escrow, spent cases, and body-part policy stay out of acquired-content totals. Keep their exclusions with `CONTENT_COUNT_EXCLUSIONS` in `src/core/reachability.ts`. Reachability stores no runtime state; progression, crafting, and disassembly remain separate owners. Winning-override diagnostics retain source-file provenance so a broken effective definition can be traced to its authoring source.

## Loot economy descriptions

Separate item admission from table weights and world placement. Exact tier membership and intersecting usage keep a shared supply eligible without making every military-usable item military-only. Explicit empty metadata means no random admission, rather than a wildcard. See `src/core/loot.ts`, `ItemEconomySchema`, `economyEligible`, and `militaryOnlyEconomy`.

Templates own procedural defaults. Authored building contexts override them; when that override is absent, the site's tier combines with template usage. Anchor overrides replace usage without changing the resolved tier. See `src/core/authoredPlacement.ts`, `placementOf`, and `src/core/site.ts`, `lootSourcesOf`. Native content metadata is an explicit authoring choice with unknown-row assertions, not a runtime default; see `src/content/base/economy.libsonnet`, `authorItem` and `context`.

Keep empty source descriptions so future refill work need not regenerate geometry. Source identity must include the building, local vertical anchor and destination channel, never traversal order or a generated template name; independent random streams then remain stable when another source is visited first. See `src/core/loot.ts`, `lootSpawnPoint`, `lootPointsByColumn`, and `lootPointStream`.

Debug descriptions are fixture-scoped so showcase stock cannot define production eligibility. Explicit fixture stock may include demonstration items without changing their economy metadata. The world selector still rejects those types in ordinary pools; see `src/game/worldSetup.ts`, `fixtureLootSource`, and `src/core/loot.ts`, `selectLootType`.

## Furniture visual shapes

Visual furniture detail must not change occupied cells or expose hidden contents. Collision, rest, search, and line of sight keep their existing authorities, so a visual refinement cannot change gameplay.

Container appearance belongs to its definition rather than an ID switch or a guess from dimensions: similarly sized furniture can serve different purposes. Keep procedural detail inside the cell envelope so handles do not promise reach outside the pickable fixture. Definition-owned appearance also keeps empty and unsearched containers visually indistinguishable. See `src/core/schema.ts`, `FurnitureSchema`; `src/render/furnitureDetail.ts`, `furnitureDetail`; and `src/render/furniture.ts`, `FurnitureMeshes`.

Merge detail into the fixture's existing draw object and cache geometry between state changes. Shared vertex-coloured Lambert shading preserves the scene's lighting and fog without texture assets, material groups, or another rendering pass. This favours recognizable silhouettes and panel relief over fine surface realism while frame cost is a concern (#680). See `src/render/furniture.ts`, `FurnitureMeshes`.

### Refining a fixture

Survey the fixture's real-world construction and its authored role before choosing detail. Identify the recognizable silhouette, front, panels and opening hardware without inspecting hidden loot; recognition should help a player understand the fixture, not reveal its search state.

Choose the structural appearance in content through `src/core/schema.ts`, `FurnitureSchema`, rather than a renderer ID exception. Follow `../../docs/jsonnet.md`, "Jsonnet authoring", for the source boundary. Derive procedural parts from the definition's dimensions in `src/render/furnitureDetail.ts`, `furnitureDetail`, so the same construction works for differently sized definitions. Keep front relief within the occupied envelope and check rotated facings: protruding decoration would advertise interaction space the picker cannot reach.

Use `tools/furniture-detail-probe.mjs` to inspect the appearance-bearing definitions together in an isolated lit scene. The tool starts its own development server and takes a screenshot destination as its argument; its draw report separates geometry cost from the rest of the game. Compare the screenshot for recognition and the report for the single-draw-per-fixture budget, then inspect the actual game lighting before requesting look approval. An isolated screenshot cannot establish in-world readability or real-GPU performance.

Keep the cache, facing and envelope evidence in `test/furnitureDetail.test.ts`, and follow the tiered checks in `../../AGENTS.md`, "Before pushing: tiered checks". Do not pin content counts, colours or triangle totals: those may change while the one-object and interaction-envelope contracts remain. The agent workflow is `docs/furniture-detail-skill.md`.

## Furniture action noise

Give a furniture action explicit noise only when it should expose the player; ordinary doors and containers stay quiet. Keep the sound's hearing radius with the event, and reject a selected event that cannot alert. See `FurnitureSchema` and the noise checks in `src/core/content.ts`. Door-action registration lives in `src/game/doorAction.ts`; rummage handling lives in `src/game/session.ts`.
