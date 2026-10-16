---
read_if:
  - you author or change Deadvox content sources or their build pipeline
  - you change content schemas, validation, registry merging, browser-mod identity or content-loading test fixtures
  - you add or change a bundled mod such as beginner mode, or how `?mods=` selects one
  - you add code that reads a content row by a fixed id
  - you change recipe, skill, workstation or book content, content references, static reachability or disassembly-output contracts
  - you change item economy metadata, source contexts, loot selection, loot-point descriptions or fixed loot
  - you're authoring or changing authored sites, template geometry, palettes, site-generation tuning, time-windowed spawns, curated map kits, role styles or connector contracts
  - you're authoring or changing exterior door openings, or townhouse aftermath scenes (`deadvox/docs/aftermath.md`)
  - you're authoring or changing furniture appearance, abandoned furniture placement, surface materials or procedural pattern tuning, assigning action noise, or need the isolated look probe
  - you author graphics defaults, permitted player graphics choices, weathering profiles or site weathering-profile references
  - you change the debug kit ownership view
---

# Content sections and recipes

## Authoring source

Use the repository-wide authoring and conversion rule in `../../docs/jsonnet.md`. The shared compiler produces the JSON consumed by `buildRegistry` in `src/core/content.ts`; validation and runtime references therefore meet at one boundary.

## Browser mod identity

Give each browser mod a required top-level `id`, independent of its delivery URL
or filename. Missing identities and repeat selections are refused so a renamed
upload or mirrored URL cannot silently admit the same mod twice. Different mods
may override the same definitions; identity is not a definition-id collision rule.
The intake shape and diagnostics belong to `src/game/browserMods.ts`, `readMod`
and `evaluateMods`. Bundled core-pack fragments remain content files rather than
independent mods; see `src/game/bundledContent.ts`, `buildBundledContent`.

## Bundled mods

A bundled mod ships with the game but is applied only when asked, with `?mods=` and
a comma-separated list of ids; `?mods=1` is the separate mods panel. Each one goes through
the same intake as a player mod, so an unknown id is refused at startup with the usual
diagnostics instead of being ignored. A bundled mod is derived from the base sources when
it is selected, never written out as a second set of numbers, so it follows base tuning.
That derivation is the seam player mods lack: they replace whole rows and cannot scale a
base value. See `src/game/bundledMods.ts`, `selectBundledMods`.

Beginner mode (`?mods=beginner`) scales every hostile kind, not a list of ids. Damage, movement
speed (wander and chase), detection and health each have one factor, `BEGINNER_FACTORS`.
Detection covers sight, night sight, the hearing multiplier (footsteps and noise alike) and
light spotting, the zombie stat `lightSightScale` that multiplies the range at which a carried
or placed light is spotted. Light is included so a beginner carrying a torch or flashlight at
night does not draw enemies from full range. The mode exists so a new player can learn the
game against slower, weaker enemies that notice less.

A save records each active bundled mod as a content pack in its version identity, so a
beginner-mode world is stored apart from a normal one. The URL alone decides the mode, because
no menu switch exists for it: a world loads only when started with the same `?mods=`. See
`src/core/saveFormat.ts`, `currentSaveVersionIdentity`.

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

Every site kind shares one block palette in the same entry, so a block choice has a single content home. Hamlet-only choices (hedge and the template pools) sit apart in its `hamlet` field. Code reads them through `sitePalette` in `src/core/sitePalette.ts`; names that resolve to nothing are validation errors (`checkSiteGeneration` in `src/core/content.ts`), never a runtime fallback. The one exception is `benchmarkCityGrid` in `src/core/cityPlan.ts`, which has no registry and keeps the hamlet template list in `HAMLET_TEMPLATES` in `src/core/hamlet.ts` until the city sweep under #393 reads it from content.

Procedural surface pattern IDs are schema-checked; the shader implementation remains in code. All camouflage blocks share one palette and washout; distinct looks require a per-block shader lookup. World-anchored blotches avoid texture assets and repeated seams, while block-owned palette and washout keep the shared look tunable. See `BLOCK_PATTERNS` in `src/core/schema.ts` and `surfacePatterns.ts` in `src/render`.

Windowed template spawns use named game-clock boundaries. Keep their rule and reason in `DESIGN.md`, "Spawning"; see `PaletteThingSchema` in `src/core/schema.ts` and `SPAWN_TIMES` in `src/core/clock.ts`.

A map piece makes a cell a spawn point through a palette `spawn` entry with an optional `chance`; a 1x1x1 marker piece is air that claims its cell and carries one such entry. A slot offers weighted marker pieces, and its pick, drawn once when the assembly compiles, decides the zombie type, while `chance` rolls per world. Lab threat varies by overriding the slot choices; see `src/content/base/gauntlet-lab-threat.libsonnet`, `markerPiece`.

### Curated kits

A weighted alternative must preserve its consumer's spatial contract, not merely fit a
bounding box. Alternatives must not move promised endpoints, remove a climb connector,
or change body obstruction and support within reserved circulation. This permits a
certificate for the selected composition to cover every alternative without searching
combinations. Exclusive ownership prevents write order from changing a facade.
Structural material roles must agree with the style binding so interior flooring cannot
silently become shell treatment, and structural roles must bind solid blocks because
standing anchors, port landings and climb certificates read support from block solidity.
A non-solid shell would pass ownership yet fail the support-dependent proofs (standing, landings, climbs) later. See
`src/core/schema.ts`, `MapPieceSchema` and `MapAssemblySchema`; `src/core/templates.ts`,
`compileMapPiece`, `traversalContract` and `compileAssembly`; and `src/core/mapKit.ts`,
`mapKitIssues` and `reservedStanding`.

A sealed port is a geometric join, not a passage: it must sit on its face and inside the
piece so siblings align, but it claims no mouth or body clearance because nothing
traverses it. See `src/core/mapKit.ts`, `portIssues`.

City building pools may name an assembly instead of a literal template, but not both
under the same identity. An assembly owns its authored floor topology; stress-test
stacking cannot invent additional floors. Resolve alternatives independently for each
stable building location before requesting chunks: caching one selected assembly for a
whole pool would repeat the same furnishings across the city. A literal template has no
alternatives, so one compiled buffer per storey count serves every building that uses
it; only assemblies resolve per location. See `src/core/cityPlan.ts`, `buildCityPlan`
and `templateCompiler`.

A slot may take its alternatives from a map pool instead of inline choices, so a mod
changes one weight with a small pool override rather than re-authoring the assembly.
Pool-sourced alternatives must preserve the same spatial contract as inline ones.
Slot pools name pieces or assemblies and cannot carry city quotas: a single slot has
no per-site count to satisfy. City pools name templates or assemblies instead. See
`src/core/schema.ts`, `KitSlotSchema`, `PoolRefSchema` and `MapPoolSchema`;
`src/core/templates.ts`, `kitSlotChoices` and `resolveSlot`; and `src/core/mapKit.ts`,
`mapKitIssues`.

A ref may carry a style, inherited by every piece beneath it so floor and roof edges
share the facade treatment. Styles and pool rows can change the mix without new piece
ids. Unknown styles fail validation and slot compilation retains the slot path.
City template refs cannot carry styles because literal templates have no role palette;
slot piece and assembly refs can. See `src/core/schema.ts`, `KitRefSchema`;
`src/core/templates.ts`, `compileKitRef`; and `src/core/cityPlan.ts`, `cityPoolIssues`.

Decoration must stay outside reserved roof and street circulation:
tuning its frequency must not seal a ladder landing or entrance. The cellar street
course keeps the street-side `=` footing solid so the yard and entrance stand on it, and
leaves the interior to the floor piece (`gauntlet_city_floor_lower`, `floor_inside`
slot) and the stair owners; only the stair hole belongs to the stairs. See
`src/content/base/gauntlet-city-variants.libsonnet`, `dressed`;
`src/content/base/gauntlet-city-decor.libsonnet`, `rooftop`;
`src/content/base/gauntlet-city-yards.libsonnet`, `yard`; and
`src/content/base/gauntlet-city-cellars.libsonnet`, `street`. A route may pass through
an unlocked door but never through a wall, a window or furniture. The fixture mod in `test/fixtures/jsonnet/concrete-style-mod.jsonnet`
exercises the ordinary whole-definition style override boundary.

City placement honours the authored ground storey so a cellar stays underground
rather than lifting the building above the street. Ordinary buildings and the service
campus share this alignment rule; see `src/core/cityPlan.ts`, `groundedY`.

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

A route graph is intent, not body reachability. Standing anchors promise usable circulation without defeating a lock; use a point anchor for a secured room's inspection target instead. Admission uses reserved volume and known
support rather than assuming that unclaimed cells or terrain outside a piece are empty
or load-bearing. Climbing also requires a continuous body-clear connector with a
supported, braced exit that permits return. Ladder furniture owns its connector cells;
those cells are not reserved air, but do not excuse missing clearance around the body.
Use the same physical certificate for composed scenarios and kit publication so the two
boundaries cannot disagree about a usable climb. See `src/core/mapKit.ts`, `compileMapSite`,
`src/core/templateSpatial.ts`, `templateClimbCertificate` and `templateStandingRoute`,
and `src/core/climbCertificate.ts`, `climbCertificate`.

An exterior wall door is a delegated piece, not a hole baked into the shell: the shell
leaves the doorway slot unclaimed and the assembly names a door slot whose choices own exactly
the opening they fill. The slot's size binds the door's own size, so a window-sized hole
cannot host a door. A door must be its own opening, not a leaf standing in a larger
window hole. See `src/content/base/gauntlet-city-doors.libsonnet`, `slot`,
`src/core/templates.ts`, `compileAssembly`, `test/cityKitPlan.test.ts`, "gauntlet door openings",
and `deadvox/docs/aftermath.md`, "Door variants".

### City building types

The city pool is authored, not inferred from item usage or building names. Keep prevalence and guarantees in the scenario's named pool so a mod can tune them without changing geometry. Quotas guarantee specialty buildings; residential prevalence comes from weights alone. An impossible quota must fail loudly rather than silently omit a required building. Quota recovery stays bounded and deterministic rather than searching layouts. See `src/core/schema.ts`, `MapPoolSchema` and `PoolRefSchema`, and `src/core/cityPlan.ts`, `cityGridOf`, `cityPoolIssues`, `fillRow` and `buildCityPlan`.

Special buildings must be deliberately designed and curated as plausible places, not generic rooms with different loot. Room function, furnishings, circulation and supplies must agree: a police station needs public reception, working desks, holding cells and a small secured armoury. The gauntlet requires exactly one police station. Its structure should read as a municipal masonry building, not a timber house; wooden furniture and door leaves do not imply wooden partitions or ceilings. See `src/content/base/gauntlet-city-police.libsonnet`, `piece`; `src/content/base/gauntlet-city-building-types.libsonnet`, `mapAssemblies`; and `src/content/base/scenarios.jsonnet`, `mapPools`.

Loose furniture in abandoned buildings should suggest abrupt flight rather than tidy occupation. Keep disorder inside authored furnishing bays, outside reserved circulation, so seeded variation cannot obstruct doors or room access. Use content-owned weighted poses instead of a runtime physics simulation: the existing kit selector provides location-stable variation, and bounded furniture definitions keep appearance and collision together. Tipped chairs are not seats. Townhouse rooms follow the scene rules in `deadvox/docs/aftermath.md`, "Scene slots". See `src/content/base/aftermath.libsonnet`, `poses`, `pieces` and `slot`, and `src/content/base/gauntlet-city-police.libsonnet`, `chairSlots`.

Keep type geometry separate from the pool, and the pool separate from the scenario, so changing prevalence never requires editing a building or restating the scenario: a mod changes one building's weight by overriding the pool by id. Referenced assemblies, pieces, styles and loot tables remain independently overridable by id. See `src/content/base/scenarios.jsonnet` and `src/core/content.ts`, `buildRegistry`.

Supply shops supplement the houses, while police stations and gun shops remain scarce. Their civilian weapons use hunting eligibility rather than military admission, and empty outcomes keep an equipment room from promising a weapon. Medical tents provide treatment supplies rather than a guaranteed full kit. Existing source-context and nested-loot selection rules still own admission. See `src/content/base/gauntlet-city-building-types.libsonnet`, `src/content/base/gauntlet-city-medical.libsonnet`, and `src/core/loot.ts`, `lootTypeIssue`.

Every shop shows a street cue that no house carries, and no two shop types share one, so a player walking the street can tell a shop from a house, and one kind of shop from another, before entering. The cue is built from blocks that only shop fronts use, on the street face and in the yard in front of it. A cue prop must never narrow what a standing player or shambler can walk: the yard cells in front of a door keep full standing headroom, so a prop that hangs over the yard goes above the standing body, not at head height. The rule is data-only, with no code special cases per shop type. See `src/content/base/gauntlet-city-building-types.libsonnet`, `shell`, and `test/cityKitPlan.test.ts`, "gauntlet shop fronts".

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

Use `deadvox/tools/furniture-detail-probe.mjs` to inspect the appearance-bearing definitions together in an isolated lit scene. The tool starts its own development server and takes a screenshot destination as its argument; its draw report separates geometry cost from the rest of the game. Compare the screenshot for recognition and the report for the single-draw-per-fixture budget, then inspect the actual game lighting before requesting look approval. An isolated screenshot cannot establish in-world readability or real-GPU performance.

Keep the cache, facing and envelope evidence in `test/furnitureDetail.test.ts`, and follow the tiered checks in `../../AGENTS.md`, "Before pushing: tiered checks". Do not pin content counts, colours or triangle totals: those may change while the one-object and interaction-envelope contracts remain. The agent workflow is `docs/furniture-detail-skill.md`.

## Furniture action noise

Give a furniture action explicit noise only when it should expose the player; ordinary doors and containers stay quiet. Keep the sound's hearing radius with the event, and reject a selected event that cannot alert. See `FurnitureSchema` and the noise checks in `src/core/content.ts`. Door-action registration lives in `src/game/doorAction.ts`; rummage handling lives in `src/game/session.ts`.
