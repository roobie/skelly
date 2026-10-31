---
read_if:
  - you author or change Deadvox content sources or their build pipeline
  - you change the test-house layout or its authored structures
  - you change content schemas, validation, registry merging, browser-mod identity or content-loading test fixtures
  - you integrate mod selection into the ordinary start flow
  - you add or change a bundled mod such as beginner mode, or how `?mods=` selects one
  - you add code that reads a content row by a fixed id
  - you change runtime escrow roles, severed-part item policy or world liveness tuning
  - you add or change a refusal, notice or option label that core code shows the player
  - you change recipe, skill, workstation or book content, content references, static reachability or disassembly-output contracts
  - you change item economy metadata, source contexts, loot selection, loot-point descriptions or fixed loot
  - you're authoring or changing authored sites or gauntlet lots, template geometry, palettes, site-generation tuning, time-windowed spawns, curated map kits, role styles or connector contracts
  - you author standing water, basins or lots over water
  - you're authoring or changing exterior door openings, lab-yard perimeters and dressing, or townhouse aftermath scenes (`packages/deadvox/docs/aftermath.md`)
  - you're authoring or changing furniture mounting, appearance, abandoned furniture placement, surface materials or procedural pattern tuning, assigning action noise, or need the isolated look probe
  - you model a thing or place one fallen, on its side or in another special pose
  - you author decals or scenario outbreak age
  - you author a scenario, its start-building rooms or ways down, or move scenario rules from code into content
  - you author graphics defaults, permitted player graphics choices, weathering profiles or site weathering-profile references
  - you author or change the day cycle, the sky looks or the weather fog tuning
  - you change the debug kit ownership view
  - you change settlement building eligibility, city collections, building door resistance or benchmark candidate admission
  - you author the police station's armoury or roof access
---

# Content sections and recipes

## Authoring source

Use the repository-wide authoring and conversion rule in `../../../docs/jsonnet.md`. The shared compiler produces the JSON consumed by `buildRegistry` in `src/core/content.ts`; validation and runtime references therefore meet at one boundary.

## Browser mod identity

Give each browser mod a required top-level `id`, independent of its delivery URL
or filename. Missing identities and repeat selections are refused so a renamed
upload or mirrored URL cannot silently admit the same mod twice. Identity is not a
definition-id collision rule; which mod may override another's definition is
`../../../docs/decisions/0007-typed-field-patches.md`, "Conflicts".
The intake shape and diagnostics belong to `src/game/browserMods.ts`, `readMod`
and `evaluateMods`. Bundled core-pack fragments remain content files rather than
independent mods; see `src/game/bundledContent.ts`, `buildBundledContent`.

The pre-start panel rejects invalid files whole and keeps their diagnostics visible.
An enabled invalid file blocks Start rather than silently starting a different world;
disabling it permits startup with the remaining content, including the base pack alone.
See `src/ui/modsPanel.ts`, `chooseMods`, and `src/game/browserMods.ts`, `evaluateMods`.
The intake byte limit belongs to trusted startup configuration in
`src/config/browser-mods.jsonnet`, not to a selected mod: admission must bound a file
before parsing or trusting its definitions.

Browser selections persist as one atomic IndexedDB record, including source text,
order and enabled state. An unavailable or failed store leaves the panel with no mods
loaded and a visible storage error, never a partially restored selection. See
`src/game/modStorage.ts`, `ModStorage`, and `src/ui/modsPanel.ts`, `chooseMods`.

Each admitted browser mod contributes its explicit identity, version and canonical
content hash to the save's ordered pack identity. An omitted mod version denotes the
initial version; changing content still changes its hash. Delivery names and JSON
object key order are not identity. Selection order is identity because later files
can override earlier definitions; disabled files are not admitted packs. Continue
refuses missing, changed, additional or reordered packs rather than resuming a world
under different definitions. See `src/game/browserMods.ts`, `evaluateMods`, and
`src/core/saveFormat.ts`, `currentSaveVersionIdentity` and `contentPackDifferences`.
The pack-list identity is the rule until #1395 moves identity to the evaluated
content, as `docs/decisions/0008-deterministic-world.md`, "Decision" rules.
Preserved-save notices name pack differences with the mod's own id, without its
internal browser namespace. Raw decoder diagnostics do not belong in that notice:
an ordinary game update is not a mod problem. See `src/ui/saveController.ts`,
`SaveController.inspectOtherNamespaces`, and `../INTERFACE.md`, "Text".
Mod selection must be integrated into the ordinary start flow alongside new-game and
Continue, using the same admission and save-identity checks rather than a separate
startup path. This is the implementation direction, not a claim that the integration
has landed; see `docs/decisions/0008-mod-authoring-tool.md`, "Testing, sharing and start flow".

## Bundled mods

A bundled mod ships with the game but is applied only when asked, with `?mods=` and
a comma-separated list of ids; `?mods=1` is the separate mods panel. Each one goes through
the same intake as a player mod, so an unknown id is refused at startup with the usual
diagnostics instead of being ignored. A bundled mod's Jsonnet source derives its compiled
rows from core content at build time, so its transformation remains beside its content.
See `src/config/bundled/beginner.jsonnet` and `src/game/bundledMods.ts`, `selectBundledMods`.

The game and the site launcher must offer the same mods, and the launcher is a static page
that cannot import game modules, so the list is one schema-checked content file rather than
two copies. The launcher is a developer entry point, so a missing or invalid list only hides
its control instead of breaking it. See `src/core/bundledModCatalogue.ts`,
`bundledModCatalogue`, and `site/launcher.js`, `loadBundledMods`.

Beginner mode (`?mods=beginner`) scales every hostile kind, not a list of ids. Its Jsonnet source
owns the damage, movement speed (wander and chase), detection and health factors. Detection
covers sight, night sight, the hearing multiplier (footsteps and noise alike) and light spotting,
the zombie stat `lightSightScale` that multiplies the range at which a carried or placed light is
spotted. Light is included so a beginner carrying a torch or flashlight at night does not draw
enemies from full range. The mode exists so a new player can learn the game against slower,
weaker enemies that notice less.

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

## Inventory action tunables and labels

Inventory action timing and throw shape are tuning of the player's inventory row, and
the label of an item action is player-facing text in the core ui row.
Keeping them in content lets a mod retune or reword them without a code change. The schema
requires every field, so a pack that omits one fails validation instead of silently
inheriting a code default. Readers take the values from the registry. See
`src/core/schema.ts`, `InventoryTuningSchema` and `UiTuningSchema`, and `src/core/reach.ts`,
`reachTuning`.

## Core text

What core says to the player, its refusals, notices and option labels, is mod content
like any other text (#393, #456), so a mod can reword or translate it without a code
change. It lives in the core ui row, in its own file so other text tables can grow beside
it without touching the same lines. See `src/content/base/ui-core-text.libsonnet`.

- **Read by key.** Code names each message by a stable key and never compares or matches
  wording, so rewording a message cannot change what the game does. A rule that treats
  some refusals specially, such as hiding the obvious ones from the item options, lists
  keys, and a refusal another rule reacts to carries its key beside its text. See
  `src/core/coreText.ts`, `coreMessage` and `coreRefusal`, and `src/core/options.ts`,
  `OBVIOUS`.
- **Required, with named slots.** One table of keys and slots drives both the schema and
  the lookup's type, so a key code asks for and content lacks fails validation, not play.
  A template names the values code fills in, such as `{item}`, and validation rejects one
  that drops or invents a slot. See `src/core/coreText.ts`, `CORE_MESSAGE_SLOTS`, and
  `src/core/schema.ts`, `slottedTable`.
- **Owner rows.** The knockout refusal sits in the body row beside the bleeding refusal,
  because the body that owns the state words its refusal and needs no registry. The
  simulation takes the registry so its long actions can word theirs, and it words the
  death cause that the body and needs report as a key. See `src/core/body.ts`,
  `Body.actionRefusal` and `Body.advance`, and `src/core/sim.ts`, `SimOptions`.
  A zombie type words its own cause, article included, because only the phrase knows
  its article. See `src/core/schema.ts`, `ZombieSchema`.

Internal invariant reasons that only a code defect can produce, such as a missing action
owner, stay in code: no player meets them, and content would only hide the defect. So do
the reasons that check saves, placed loot and fitted-item slots against content, since
they report broken data to a developer, and play only offers fits that already pass them
(`src/core/magazine.ts`, `slotsReason`).

## Handling range

The layout of the test range is content, so a mod can lay out its own range. The schema
requires every field, with no code default. Each target carries its own lateral placement
because fire runs down the lane: targets in line hide the farther ones, so validation
rejects a layout where any target is hidden from the firing line, or sits outside the lane,
rather than clamping it silently. See `src/core/schema.ts`, `HandlingRangeSchema`, and
`src/core/rangeLayout.ts`, `handlingRangeIssues`.

## Weathering profiles

Weathering is a render-only content choice, not saved world state. Named profiles let sites share the shader while selecting their own material response; layouts without a profile use the shared default. See `WeatheringSchema` in `src/core/schema.ts` and `referenceIssues` in `src/core/content.ts`. `configFromUrl` in `src/game/config.ts` selects the site profile.

## Day cycle

One required row owns how the day reads, sun and sky and fog together, and how long a game day lasts in play, so a mod that changes the latitude, the mood or the pace of the day needs no engine code. A new session takes the pace from content; a save keeps the pace it was saved with, and restoring it under different content is refused rather than silently retimed. Every field is required, with no code default and no fallback, so a pack that omits one fails to load rather than playing under a hidden look. Looks are keyed by solar phase so an author edits a phase, not an index, and colours are hex that authors can read.

Where each look sits in its phase is content too, because it is timing tuning a pack may want, such as a longer deep night. The schema, not code, keeps the blend's invariant: keys run in cycle order and each sits strictly later than the one before, and the last stays short of the first a cycle later (the blend wraps from one to the other), and a violation is rejected with the field named, never clamped or reordered. How looks blend stays in code, as mechanism shared by every pack (`src/core/sky.ts`, `skyAt`). Tests take the cycle from base content through `test/dayPhaseFixture.ts` and never restate it. See `src/core/schema.ts`, `DayCycleSchema`, for what the row holds, and `src/core/weather.ts`, `skyInWeather`.

## Footstep and vocal-noise tuning

Footstep and vocal-noise tuning is a property of the player's body, so it lives in the player's sense row beside the other hearing tunables and a mod that changes the body needs no engine code. Every field is required, with no code default, so a pack that omits one fails to load. See `src/core/schema.ts`, `SenseSchema`.

Two nearby constants stay in code on purpose. The stride-phase origin is mechanism: it aligns the first footfall with the shared gait phase that presentation and aim wobble also read, so a pack tuning spacing never needs it (`src/core/footsteps.ts`, `initialFootstepClock`). The hit-flinch duration is the length of mobgen's flinch clip, so a second copy in content could disagree with the animation it must match (`src/core/zombiePose.ts`, `HIT_FLINCH_DURATION`). Tests take the row from `test/senseFixture.ts`, `BASE_SENSE_TUNING`, and never restate it.

## Content test registries

Fixture builders should include only the content an assertion exercises. Use one validated full-pack registry read-only when a contract needs cross-file references or reachability, and copy each section a test changes. This keeps unrelated validation from dominating tests and prevents changes leaking between assertions. See the registry fixtures in `test/content.test.ts`, `test/audioGunshot.test.ts`, `test/disassembly.test.ts`, and `test/firearmSave.test.ts`. Unrelated contract fixtures may author common-supply metadata through `test/economyFixtures.ts`, `buildFixtureRegistry`; admission tests must use raw sources so the fixture builder cannot conceal missing metadata.

Transport tests check the fetched payload and stream limits rather than rebuilding the
playable pack at each asynchronous step. Admission and malformed-JSON rejection belong
to `test/browserMods.test.ts`; keeping that owner avoids load-sensitive transport timeouts.

## Authored structures and sites

Keep exterior shells visually continuous around authored openings; doors and solid window frames remain deliberate gaps. Floor and roof courses meeting an exterior wall use that wall's material, so interior flooring does not appear as an exposed facade stripe. Interior flooring retains its authored material. Doors need clear space on both sides so a player can pass through. See `floorCourseWallGap` and `checkTemplateSpace` in `src/core/content.ts`, and `templateDoorIssues` in `src/core/templateSpatial.ts`.

Keep enclosed building roofs flush with their exterior wall footprint so the roof silhouette follows the shell instead of adding projecting eaves. City roofs are a mixture of two treatments, chosen per building by a weighted content choice, never by a building id in code:

- A sheet-metal roof is a plain galvanized deck.
- A semi-walled concrete roof is a concrete deck with waist-high wall segments along some edges, never a full ring.

Non-wood decks keep wooden flooring from reading as a wooden roof on masonry walls. The mix makes the skyline varied and plausible; keep ladder landings and roof routes open. Open forecourt canopies are separate structures, not building eaves. See `src/content/base/gauntlet-city-decor.libsonnet`, `roofs`, and `src/content/base/gauntlet-city-kits.libsonnet`, `roofDeck`.

The test house is authored content rather than a code-built exception, so the same layout and template mechanisms serve mods and evaluation scenes. See `src/content/base/layouts-test-house.jsonnet`, `layouts`, and `docs/test-house.md`, "Content ownership".

Scenario lead references may carry fixed loot on their template's furniture anchors, so a portable clue uses the same surface or container machinery as other items. Lead admission requires readable furniture or a readable fixed item; the route certificate still proves independent access around solid supports. Surface loot and discovery share furniture-top positioning so an observation identifies the pile actually offered by inventory, rather than the support's corner. See `src/core/furnitureSurface.ts`, `furnitureSurfacePosition`. Unknown placement kinds fail schema validation instead of selecting a fallback. See `src/core/schema.ts`, `FixedLootItem`; `src/core/scenarioComposition.ts`, `extraTemplateIssues`; and `src/core/scenarioCertificate.ts`, `lead`.

Fixed loot takes eligibility from its resolved authored source context, not a compiled placement's ID. Stacking changes that ID without changing the source's authority. Point overrides keep a special supply local to its anchor rather than retagging the building; fitted children meet the same resolved context. See `placementLootIssues` in `src/core/placementLoot.ts` and its callers in `src/core/authoredLayout.ts` and `src/core/scenarioComposition.ts`.

Keep authored-site terrain and vegetation controls in base content rather than mixing generator settings into authored layouts. This keeps layout geometry about the authored place and generation settings about its terrain. See `siteGeneration` in `src/core/schema.ts`, `site-generation.json`, and `AuthoredSite` in `src/core/authoredSite.ts`.

Terrain shape and the tree and forest tunables are required `siteGeneration` fields (see `src/core/schema.ts`, `siteGeneration`) with no code default, so a mod can reshape the landscape and woods without touching logic and a missing value fails validation instead of silently using a stale one. Code receives the terrain values as one explicit shape (`terrainShapeOf` in `src/core/sitePalette.ts`) rather than reading module constants, so every caller names the world it generates. Geometry, such as tree crowns and placement jitter, and bench-only mechanism values stay in code because they are not tuning a mod should change.

Every site kind shares one block palette so a block choice has a single content home. Unknown names must fail validation instead of selecting a runtime fallback; see `src/core/sitePalette.ts`, `sitePalette`, and `src/core/content.ts`, `checkSiteGeneration`. Optional benchmark geometry belongs with its independent consumer rather than required site-generation content; see `packages/deadvox/docs/content.md`, "City building types".

A site's standing water is authored as layout water rows, its hollows as `basin` terrain primitives, and a lot meant to stand in water says `overWater`; see `src/core/schema.ts`, `SiteLayoutSchema` and `TerrainPrimitive`, and the rules and reasons in `DESIGN.md`, "Water". A row's level is the water's top face, not a block's lower face like `ground`, because the author sets the plane a swimmer floats at. Its polygon only bounds where water may stand, as a woodland polygon bounds trees: the terrain decides the shoreline, so draw the polygon loosely around the basin and shape the shore with the basin's falloff. Generation fills with the palette's water block, which must be a `liquid` block; see `src/core/content.ts`, `checkSiteGeneration`. The debug scene with a lake is `src/content/base/layouts-water.jsonnet`, `lake_demo`.

Procedural surface pattern IDs are schema-checked; the shader implementation remains in code. All camouflage blocks share one palette and washout; distinct looks require a per-block shader lookup. World-anchored blotches avoid texture assets and repeated seams, while block-owned palette and washout keep the shared look tunable. See `BLOCK_PATTERNS` in `src/core/schema.ts` and `surfacePatterns.ts` in `src/render`.

Windowed template spawns use named game-clock boundaries. Keep their rule and reason in `DESIGN.md`, "Spawning"; see `PaletteThingSchema` in `src/core/schema.ts` and `resolveSpawnTime` in `src/core/clock.ts`, which gives the names their times from the day cycle content.

A map piece makes a cell a spawn point through a palette `spawn` entry with an optional `chance`; a 1x1x1 marker piece is air that claims its cell and carries one such entry. A slot offers weighted marker pieces, and its pick, drawn once when the assembly compiles, decides the zombie type, while `chance` rolls per world. Lab threat varies by overriding the slot choices; see `src/content/base/gauntlet-lab-threat.libsonnet`, `markerPiece`.

An item's floor pad is either authored as part of the item's design (a water tank's concrete foundation is a block in its template) or takes the ground beneath it through a palette `ground` entry, which stamps nothing so the surface the site put there shows. A pad never restates a site's surface block, because a surface then has two homes and the patch returns when the site's surface changes or an item lands on a different one. See `src/core/templates.ts`, `stampPlacement`, and `test/streetCars.test.ts`.

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
and `packages/deadvox/docs/aftermath.md`, "Door variants".

### City building types

Flimsy and burglary-safe doors are content choices per building, so a building's intended resistance need not change the forcing mechanism. See `src/content/base/furniture.jsonnet`, `woodDoor`, and `src/core/schema.ts`, `FurnitureSchema`.

An authored collection owns prevalence and guarantees; each building owns its fit. Keeping those policies separate lets a mod tune prevalence without changing geometry and prevents collection membership from forcing an unsuitable building into a settlement. Eligibility uses content-named settlement kinds, not engine enums, and reuses the building's authored footprint for plot fit rather than maintaining a second size that can disagree with its geometry. Templates and assemblies follow the same admission rule. See `src/core/schema.ts`, `BuildingEligibilitySchema`, `TemplateSchema`, `MapAssemblySchema` and `MapPoolSchema`, `src/core/settlementPools.ts`, `eligibilityExclusion`, and `src/core/cityPlan.ts`, `cityGridOf`.

Filtering must not hide an ineffective addition: a collection entry excluded for every consumer is a load error naming the collection, building and reasons. A consumer with no eligible weighted candidates also fails at load. A shared collection may legitimately serve different kinds or plot sizes, provided each entry serves at least one consumer. Quotas apply to admitted entries; impossible guarantees fail loudly, and recovery stays bounded and deterministic rather than searching layouts. See `src/core/cityPlan.ts`, `settlementCollectionIssues`, `cityPoolIssues`, `chooseBuilding` and `buildCityPlan`.

The stress-test benchmark owns an independent named pool so playable-world edits cannot silently change its workload. Benchmark definitions are optional scenario content, not core requirements or playable reachability sources; a stack without a benchmark can still validate. See `src/content/base/benchmark-city.jsonnet`, `cityBenchmarks` and `mapPools`, `src/core/cityPlan.ts`, `benchmarkCityGrid`, and `src/core/content.ts`, `REQUIRED_CORE_CONTENT`. Classification follows `docs/pack-split.md`, "Classification rule".

Pools and eligibility remain static content so they can become inputs to an expression selector without competing with it. There is no separate selector language here. Additive mod admission waits for the typed merge mechanism in `docs/decisions/0007-typed-field-patches.md`, "Decision"; collection ownership does not imply that list additions are already implemented.

Special buildings must read as plausible places, not generic rooms distinguished only by hidden loot. The police armoury's furniture and secured door must communicate weapon and ammunition storage, so its door is the steel armoury leaf that only a cutting tool forces and the roof key is the way in. Every station copy carries the armoury, so its room, key and stock belong to the base station: a scenario overlay matching room strings can silently stop matching after a layout edit. A reward that need not suit its host still belongs to the gauntlet instance (see `DESIGN.md`, "Gauntlet"). Masonry gives the civic building its character; wooden furnishings do not imply timber construction. See `src/content/base/rural-police.jsonnet`, `templates`, `furniture` and `loot`; `src/content/base/gauntlet-authored-sites.libsonnet`, `policeMain` and `compound`; and `src/content/base/gauntlet-layout.libsonnet`, `lots`.

Loose furniture in abandoned buildings and yards should suggest abrupt flight rather than tidy occupation. Keep disorder inside authored furnishing bays, outside reserved circulation, so seeded variation cannot obstruct doors or room access. Use content-owned weighted poses instead of a runtime physics simulation: the existing kit selector provides location-stable variation. A pose belongs to the placement, not the model (see "Furniture visual shapes"). Tipped chairs are not seats. Townhouse rooms follow the scene rules in `packages/deadvox/docs/aftermath.md`, "Scene slots". See `src/content/base/aftermath.libsonnet`, `poses`, `pieces` and `slot`, and `src/content/base/gauntlet-authored-sites.libsonnet`, `furnished`.

The lab's surface enclosure follows the underground footprint rather than just the service building, so the slab reads as one abandoned compound. Keep the apron and named perimeter crossings usable so fencing does not obscure the way down or turn the yard into a trap. Lot and service-yard openings share the same reach-and-sweep certificate so an alternate entrance cannot hide a blocked crossing. See `src/content/base/gauntlet-lab-yard.libsonnet`, `slots` and `routes`, and `src/core/cityLots.ts`, `perimeterRouteIssues`.

Authored lots separate the arrangement from the building draw: a designed street and yard should not move when a seed changes its houses. Empty reservations protect intentional open ground, and pool guarantees must fit the actual lot footprints rather than borrowing capacity from another row. Fixed service placement keeps a designed destination on its intended approach. A validation pass shares immutable leaf compilation so a compound's nested assemblies do not repeatedly pay for the same authored geometry; a later admission must still see registry edits. See `src/core/mapKit.ts`, `mapKitIssues`. Off-rhythm paving belongs to the same plan as stamping, so the walked alleys cannot disagree with the arrangement. See `src/core/cityLots.ts`, `placeCityLots` and `cityLotIssues`; `src/core/cityPlan.ts`, `buildCityPlan`; and `src/core/citySite.ts`, `surface`.

Keep geometry, collection and consumer independently overridable so a prevalence edit need not restate a building or a scenario. See `src/content/base/scenarios.jsonnet`, `mapPools`, and `src/core/content.ts`, `buildRegistry`.

Supply shops supplement the houses, while police and gun supplies remain scarce. A building rolls from its place theme, so tables are shared per theme and source contexts tell themes and roles apart; selection rules own admission, so a row a context rejects drops out instead of leaking a weapon into the wrong place. A promised supply must be usable and must not hang on a roll: what the run needs is fixed stock on the instance rather than room loot, so the lab stays winnable (see `DESIGN.md`, "Gauntlet"), and a promised rifle comes with a fitting magazine and enough of its calibre to fight a room. Rifle supplies are Military-only and also roll outside the armoury, because a single cabinet would make the whole supply one find; `packages/deadvox/test/gauntletLoot.test.ts`, "gauntlet loot reachability", guards that the promised rifles stay supplied. Each lab level rolls every tier up to its depth, keeping the lower ones, so a deeper level is worth its risk; an assembly hands its tier range to the pieces inside it, because a flattened building would otherwise give every storey one tier. The deepest tier stays empty until #1128 accepts its first item, and an empty tier rolls nothing. A headquarters holds a garrison because one with none reads as an empty set; `packages/deadvox/test/gauntletHqThreat.test.ts` guards it. Threat marker and rifle ammunition amounts stay provisional until BR tunes them in play. See `src/content/base/gauntlet-city-building-types.libsonnet`, `armoury_cabinet` and `hq_field_supplies`; `src/content/base/crisis-hq.jsonnet`, `markers`; `src/content/base/gauntlet-lab-entry.libsonnet`, `markerCells`; `src/content/base/gauntlet-lab-special.libsonnet`, `range`; `src/content/base/gauntlet-medical.libsonnet`, `loot`; `src/content/base/scenarios.jsonnet`, `composition`; `src/core/loot.ts`, `LootContextSchema` and `economyEligible`; and `src/core/templates.ts`, `compileAssembly`. `packages/deadvox/test/gauntletLabTiers.test.ts`, "gauntlet lab loot tiers by depth", guards the tier-by-depth property.

Every shop shows a street cue that no house carries, and no two shop types share one, so a player walking the street can tell a shop from a house, and one kind of shop from another, before entering. The cue is built from blocks that only shop fronts use, on the street face and in the yard in front of it. A cue prop must never narrow what a standing player or shambler can walk: the yard cells in front of a door keep full standing headroom, so a prop that hangs over the yard goes above the standing body, not at head height. The rule is data-only, with no code special cases per shop type. See `src/content/base/gauntlet-city-building-types.libsonnet`, `shell`, and `test/cityKitPlan.test.ts`, "gauntlet shop fronts".

The secret house is a cellar house with one more storey under the cellar, reached by a ladder through a floor hatch. Its pool row carries a quota of exactly one, because a secret is special only while it is rare; a city that cannot fit it fails loudly rather than dropping it. Quota rows take their lots in authored order without a seed, so the secret house and the gun store stand in the same lot every seed. The fixed lot is accepted because it keeps the engine unchanged, rather than adding a seeded lot per quota row. What that leaves open: once found, the secret is found for every later run, so its note, hatch and reward reward a first visit only, and changing the pool's authored lots is the only way to move it. See `src/core/cityLots.ts`, `matchQuotas`. The note upstairs hints that something lies deeper without giving directions, so finding the hatch stays the player's discovery. The sealed room is furnished as a prepper's bunker, with a bed and a wardrobe beside the stash and a little more floor than a stash alone needs, so it reads as a room someone built to wait out the end rather than a hidden locker. A rug lies over the hatch in every choice of the room above it, so the way down is hidden until the player lifts the rug; tarps lie elsewhere, in some city yards, so a cover is not always a tell. A rug is a cover, which `packages/deadvox/DESIGN.md`, "Moving furniture", defines. The sealed room holds one brute shambler so the reward is guarded rather than free. It is not an acid zombie, because acid zombies stay a lab threat and a city house would blur that. What the brute shambler is belongs to `packages/deadvox/DESIGN.md`, "Types are data". The room is not certified as a resource: the reward is a bonus, not a promise, so it is fixed stock on the room's furniture outside `composition.resources` and no route proof depends on it. Its wardrobe rolls ordinary wardrobe loot, which is part of the same bonus: the room lies below every storey the house declares, so the building's loot promise does not cover it. The stock is police-calibre ammunition only, keeping the stash within the scarcity police supplies already set; the footlocker also holds the game's only blowtorch, with one gas cartridge fitted. Palette stock is checked like any fixed loot: a container item needs a container and the building's source context must admit it. See `src/content/base/scenarios.jsonnet`, `mapPools`; `src/content/base/gauntlet-city-variants.libsonnet`, `secretHouse`; `src/content/base/gauntlet-city-cellars.libsonnet`, `reward`; and `src/core/placementLoot.ts`, `pieceItemIssues`.

### City perimeter

The perimeter must stay closed across streets as well as blocks, because a street gap
would become an escape. Its dressing must face inward without opening a way through;
notice text follows
`INTERFACE.md`, "Text". Wear and rubble make the enclosure belong to the abandoned place,
but passable breaches belong to the interior sites, not the containment wall. Bounds
hold the designed points of interest and filler housing rather than reserving a band
of city for later expansion. Ordinary physics owns jumping; no out-top prediction is
an admission condition. See `src/core/cityPlan.ts`, `cityPerimeter`, `perimeterGaps`
and `perimeterIssues`; `src/content/base/gauntlet-layout.libsonnet`, `bounds`; and
`src/content/base/gauntlet-city-perimeter.libsonnet`, `templates`.

## Scenarios

A scenario is mod content: a mod must be able to express a scenario like the gauntlet in
Jsonnet without a code edit. The scenario row must supply the values, such as counts,
chances, densities, thresholds and authored placements, and must select code-owned
mechanisms, as `../../../PILLARS.md`, "Content forward compatibility" requires. Code keeps
what a mod cannot safely or usefully restate: the body route oracle, the physical climb
and reach certificates, spawn admission with its saved ledger, and the scenario run's win
state. See `src/core/schema.ts`, `ScenarioSchema`; `src/core/climbCertificate.ts`,
`climbCertificate`; and `src/core/zombieSpawns.ts`, `ZombieSpawner`.

- **Kind.** The row's `kind` selects the site mechanism through a dispatch table that owns
  its keys. A new scenario of an existing kind is content alone; a new kind is a code
  mechanism, because how a site is built and proved is geometry, not data. See
  `src/core/scenarioKinds.ts`, `SCENARIO_KINDS`; and `src/game/worldSetup.ts`,
  `SCENARIO_SITES`.
- **Route proof.** Each kind's code proves that its own routes are open, and the row
  supplies the proof's counts and thresholds, such as how many leads a player may miss
  while one stays reachable. The proof's shape is physics a mod cannot safely restate, while
  how forgiving a scenario is belongs to its design. The lead redundancy sits with the
  leads, beside what it counts. Only leads reached by different routes count toward it,
  because two leads behind one blocked street fail together and would overstate how
  forgiving the scenario is. See `src/core/scenarioCertificate.ts`, `scenarioCertificate`.
- **Start.** The tallest roof opens the run with an overview and a descent. Ways down
  trade speed against safety or noise, so leaving the roof is a choice. The start
  building is a condo block repurposed during the outbreak. It needs enough room and
  something on every storey to make it interesting, rather than just a staircase.
  See `src/content/base/gauntlet-start.libsonnet`, `start`, and
  `src/content/base/gauntlet-start-rooms.libsonnet`, `slots`.
  Collapsed floors are extra risky shortcuts, not registered descents, so the start
  check never certifies an interior fall to meet the minimum.
  The route proof starts at the roof because rolled furnishings can block
  the foot of a way down. Redundant ways down prevent one obstruction from forcing a
  single exit. A way down counts even when it can injure or kill, because choosing the
  risk is part of the descent; its foot need not be kept clear. See
  `src/core/scenarioStart.ts`, `scenarioStartIssues`; `src/core/cityPlan.ts`,
  `buildCityPlan`; and
  `src/core/scenarioCertificate.ts`, `scenarioCertificate`.
- **Street approach.** The street a kind's proof enters its site from is an authored
  anchor, not derived from the site, so a scenario can approach from another side and
  stay the same kind. Under a rooftop start the anchor need not sit at the foot of a way
  down.
- **Placement.** Clues belong in named buildings and landmarks belong to the designed
  approach, so their meaning agrees with the arrangement the player sees from the roof.
  Local standing poses make readable access part of admission rather than an assumption
  about empty street corners. Code proves the composed route because authored placement
  alone cannot protect it from furnishings or later stamping. See
  `src/core/scenarioComposition.ts`, `composeScenario`, and
  `src/core/scenarioCertificate.ts`, `scenarioCertificate`.
- **Goal text.** The words the goal shows when it refuses live in a shared core-pack text
  table (#456), not on the scenario row. Player-facing wording belongs to the mod, and the
  same line copied to every place that shows it is debt. For that reason the refusals the
  goal shares with other actions move to the table in the same #393 step as the goal's
  own, rather than waiting for #456's wider sweep and leaving a second copy behind.

The remaining gauntlet sweep under #393 covers street approach, lead redundancy and
goal refusal text; those boundaries still need content
ownership so a mod can express the scenario without a code edit.

A scenario adds no mission runtime: its goal is ordinary interaction with furniture whose
definition carries `scenarioGoal`, under the rules in `../DESIGN.md`, "Gauntlet". Rules
beyond data, such as triggers, timed events and conditional consequences, wait for the CEL
rules of `../../../docs/decisions/0004-content-language.md`, "Decision", to run in the engine
(#313), so no scenario grows a private rule language first.

## Recipes

Recipe data names the result, inputs, skill and quality requirements, and optional workstation; `RecipeSchema` in `src/core/schema.ts` owns its shape and bounds. Keep alternative inputs bounded so validation cannot expand without limit.

Skill definitions own their effects and training activities. Quality requirements refer to qualities declared by loaded items or workstations, rather than a separate top-level content section. A reachable provider is a separate reachability requirement. See `SkillSchema`, `src/core/character.ts`, and `src/core/reach.ts`.

Validate recipe and component references against the effective ordered pack. Disassembly yields and salvage are authored for the item rather than inferred by reversing every recipe; see `planDisassembly` in `src/core/disassembly.ts` and `docs/crafting.md`.

The initial torch, candle, and repair-kit recipes consume whole solid items and do not consume their containers. A recipe using part of a liquid requires approval of the storage-to-volume mapping, saved partial use, and container-retention rules first. Old saves are refused rather than migrated before v1.0 beta (#1023); see `docs/decisions/0002-saves.md`, "Compatibility".

## Static reachability

Content acceptance checks that authored world sources can provide declared item types through loot, map-kit alternatives, crafting, disassembly, packages, teaching books, fixed loot, and firing output. It also checks required qualities and training sources. This catches content that validates structurally but cannot be reached in play; `npm run validate` reports the result without maintaining a second content list here. Type-source reachability does not prove that a particular authored container can be reached and looted. Fixed-loot tests use the same standing traversal as template validation; see `templateReachableStandingPositions` in `src/core/templateSpatial.ts` and `test/authoredFixedLoot.test.ts`.

Reachability is a type-source contract, not a quantity, seed, or whole-game solver. A site can lack item types the whole game has, so `npm run report:never-spawn -- <site-id>` provides an on-demand per-site report rather than a gate. A recipe cycle without a found source cannot make itself reachable. Knowledge from a skill must be grounded just like knowledge from a book, because a dead unlock must stay red. A reachable skill counts as reachable at every level, the same test recipe requirements use; training ceilings and non-crafting practice are outside this contract. Level-zero unlocks are starting knowledge and need no practice source. Disassembly assumes the required skill is attainable, unlike recipe requirements and positive-level unlocks, which need reachable practice. Showcase and demo layouts are fixtures, not sources for playable-world reachability. See `src/core/reachability.ts`, `checkReachability` and `reachableKnowledgeAndSkills`, and `src/core/schema.ts`, `SiteLayoutSchema.demo`.

Acquired-content totals exclude types by their authored policy, not their identity, so adding a debug fixture or a creature part needs no checker edit. See `ItemSchema.notLoot` in `src/core/schema.ts` and `checkReachability` in `src/core/reachability.ts`. Runtime escrow selects its definition through `ItemSchema.workInProgress`; exactly one definition must own that role. Creature kinds own their severed-region item policy through `ZombieSchema.severedItems`, including an explicit null for a region that leaves nothing. World liveness belongs to site-generation tuning, not creature identity; see `SiteGenerationSchema.activeZombieRadiusMetres` in `src/core/schema.ts` and `ZombieSystem.tierAt` in `src/core/zombies.ts`. Reachability stores no runtime state; progression, crafting, and disassembly remain separate owners. Winning-override diagnostics retain source-file provenance so a broken effective definition can be traced to its authoring source.

## Loot economy descriptions

Separate item admission from table weights and world placement. Exact tier membership and intersecting usage keep a shared supply eligible without making every military-usable item military-only. Explicit empty metadata means no random admission, rather than a wildcard. Police-only items and the strong analgesics narrow the same way, to the Police and Medical usages, because a tag every item carries filters nothing. See `src/core/loot.ts`, `ItemEconomySchema`, `economyEligible`, and `militaryOnlyEconomy`.

A special point must not retag a whole building. Anchor usage and exact-tier choices keep its supply local, and placement overrides let an instance specialize it without copying the template. See `src/core/schema.ts`, `PaletteThingSchema` and `FixedLootOverride`; `src/core/authoredPlacement.ts`, `placementOf`; and `src/core/site.ts`, `lootSourcesOf`. Native content metadata is an explicit authoring choice with unknown-row assertions, not a runtime default; see `src/content/base/economy.libsonnet`, `authorItem` and `context`.

An item too large to turn up in ordinary loot, such as the engine hoist, is listed non-spawnable, so no loot context admits it. Authored placement and loot admission are separate questions: a loot table or roll refuses such an item, while a scenario or site that places it by hand is admitted, because the author chose it and no dice did. Placement still refuses an unknown item, one fitted with a child outside both rules, and a spawnable item outside its source context. See `src/content/base/economy.libsonnet`, `notSpawnable`, and `src/core/loot.ts`, `lootTypeIssue` and `placedTypeIssue`.

Keep empty source descriptions so a dynamic event can address any source without regenerating geometry; world loot itself rolls once per chunk column (`packages/deadvox/DESIGN.md`, "Loot"). Source identity must include the building, local vertical anchor and destination channel, never traversal order or a generated template name; independent random streams then remain stable when another source is visited first. See `src/core/loot.ts`, `lootSpawnPoint`, `lootPointsByColumn`, and `lootPointStream`.

Fixture descriptions keep showcase stock from defining production eligibility. They may include demonstration items without changing their economy metadata; ordinary pools must still reject those types. See `src/core/authoredSite.ts`, `AuthoredSite`, `src/game/worldSetup.ts`, `DebugTestHouseSite`, and `src/core/loot.ts`, `selectLootType`.

## Furniture visual shapes

Procedural `appearance` detail must not change occupied cells or expose hidden contents, so refining how a fixture reads cannot change gameplay. A `shape` is the exception: it is both what is drawn and what blocks (see "Furniture solidity" below).

Wall mounting is an explicit content contract because text alone cannot distinguish a hung plaque from a freestanding board. Reject unsupported mount kinds and missing hosts rather than rendering an apparently attached object in empty space. Keep plaque dimensions and board legs in content shapes instead of renderer guesses. See `src/core/schema.ts`, `FurnitureSchema`; `src/core/content.ts`, `checkPaletteThing`; and `src/content/base/furniture-playtest.jsonnet`, `plaque`.

A heap of mixed materials is one shape with a colour per box, not several pieces of furniture: it must stay a single container with one pick target, and the colours are content so a new heap needs no code. See `src/core/schema.ts`, `FurnitureShapeBoxSchema`, and `src/content/base/furniture-playtest.jsonnet`, `workshop_scrap_pile`.

Container appearance belongs to its definition rather than an ID switch or a guess from dimensions: similarly sized furniture can serve different purposes. Its kind names how the piece opens, and every piece that opens that way shares the kind, so a new container picks an existing kind and only a new way of opening adds one; a kind for one piece would be an ID switch moved into content. Keep procedural detail inside the cell envelope so handles do not promise reach outside the pickable fixture. Definition-owned appearance also keeps empty and unsearched containers visually indistinguishable. See `src/core/schema.ts`, `FurnitureSchema`; `src/render/furnitureDetail.ts`, `furnitureDetail`; and `src/render/furniture.ts`, `FurnitureMeshes`.

A vehicle shown as furniture names its blueprint, body colour, dirt level and absent parts in the definition's `vehicle`, not in an ID switch; unknown values fail validation with no fallback. The gauntlet's street wrecks are procedural variants because identical cars made the streets read as one repeated prop. Colours, dirt levels and stripped-part sets are lists in one content source, crossed there into one definition and template per combination, and `streetProps` names a map pool of those templates so each placement draws from the world seed. Enumerating the product keeps a car's look in its definition, so the renderer and saves carry no per-placement state. A map pool has no size cap, so a new axis or value is a content edit; a kit slot pool compiles every choice, so cross axes into a street prop pool, not a slot pool. One strip set strips nothing, so some street cars are intact, because an intact car is kept as one variant of the street-car pool. A colour or dirt value adds no meshing work, because looks that share a blueprint and strip set share one mesh and differ only in vertex colours. A standing display is meshed off the main thread because a new blueprint or strip set would otherwise stall the frame that first sees it, so the car may appear a moment after its piece does. A carried piece is measured the moment it is built to centre and size it in the hands, so it takes the synchronous path instead. See `src/render/vehicleShapes.ts`, `VehicleShapes`; and `src/render/furniture.ts`, `pieceMesh`. See `src/core/schema.ts`, `FurnitureSchema` and `MapPoolSchema`; `src/content/base/gauntlet-city.libsonnet`; `src/core/cityPlan.ts`, `streetPropChoices`; `src/render/workshopVehicle.ts`, `vehicleModel`; and `test/streetCars.test.ts`, "street car procedural variants".

A piece with a front is placed with its `facing` pointing into the room or toward its open side, never at the wall it stands against: a front pressed to a wall hides the detail that tells the player what the fixture is and reads as a placement mistake. An omitted `facing` means north, so a piece against a north wall must say so. Props with no front (crates, fences, shrubs) need no facing.

Model each thing once, upright, as it stands in use. A fallen, tipped, overturned or on-its-side piece is that same model in a pose of its placement, never a separate definition. A model built in a special pose is a second copy of the thing whose detail is worked out again for the new orientation and drifts from the original, so a separately modelled fallen wardrobe can show its doors on its top face. One model keeps detail, loot, collision and interaction in one place, and any pose costs no new modelling. See `src/core/schema.ts`, `PaletteThingSchema`, and `src/core/templates.ts`, `compileMarkers`.

Merge detail into the fixture's existing draw object and cache geometry between state changes. Shared vertex-coloured Lambert shading preserves the scene's lighting and fog without texture assets, material groups, or another rendering pass. This favours recognizable silhouettes and panel relief over fine surface realism while frame cost is a concern (#680). See `src/render/furniture.ts`, `FurnitureMeshes`.

### Refining a fixture

Survey the fixture's real-world construction and its authored role before choosing detail. Identify the recognizable silhouette, front, panels and opening hardware without inspecting hidden loot; recognition should help a player understand the fixture, not reveal its search state.

Choose the structural appearance in content through `src/core/schema.ts`, `FurnitureSchema`, rather than a renderer ID exception. Follow `../../../docs/jsonnet.md`, "Jsonnet authoring", for the source boundary. Derive procedural parts from the definition's dimensions in `src/render/furnitureDetail.ts`, `furnitureDetail`, so the same construction works for differently sized definitions. Keep front relief within the occupied envelope and check rotated facings: protruding decoration would advertise interaction space the picker cannot reach.

Use `packages/deadvox/tools/furniture-detail-probe.mjs` to inspect the definitions with appearance or door detail together in an isolated lit scene, each intact beside its look at every damage step its material authors, so a material's steps can be judged on the furniture that wears them; a door stands once more open, so its detail is seen to swing with it. The tool starts its own development server and takes a screenshot destination as its argument, then optionally the pieces to narrow to; its compare flag stands the plain block each piece drew before its detail at the head of its row, so a look review sees what the detail bought. Its draw report separates geometry cost from the rest of the game. Compare the screenshot for recognition and the report for the single-draw-per-fixture budget, then inspect the actual game lighting before requesting look approval. An isolated screenshot cannot establish in-world readability or real-GPU performance.

Keep the cache, facing and envelope evidence in `test/furnitureDetail.test.ts`, and follow the tiered checks in `../../../AGENTS.md`, "Before pushing: tiered checks". Do not pin content counts, colours or triangle totals: those may change while the one-object and interaction-envelope contracts remain. The agent workflow is `docs/furniture-detail-skill.md`.

### Door detail

Doorway leaves and hatches show how they open through their own `door.detail`, not an `appearance` kind: an appearance kind draws a fixed body from the definition's size, while a door's panel is posed per placement, swinging on its hinge or standing up on a hatch's hinge edge. A detail names raised fields, strap hinges on the hinge edge and a handle by the free edge, so a player can tell a door, which side it hangs on and where to take hold of it. Looks are named by how a door is built in `src/content/base/door-detail.libsonnet`; a door picks one and overrides only what its size or build needs, so no renderer code knows a door id. Both faces carry the same detail, because either face of a leaf may be the one a player meets.

The detail replaces the plain panel inside the hinge group, so it swings with the leaf, and a doorway stays one draw. Geometry is cached per definition and panel size, so opening, closing and further copies build nothing. A shut hatch sits down in its frame so its ring and hinges stay within its cells; an open leaf or hatch reaches past them anyway. A body door keeps the handle drawn on its body and takes no detail. A shaped leaf's shape is its look: the detail is optional there, and the lab bulkhead carries its hinges in its shape because its panel lies inside its slab. A decal attached to a detailed door sits on the raised field, not the panel under it. See `src/core/schema.ts`, `DoorDetailSchema`; `src/render/doorDetail.ts`, `doorDetail`; `src/render/furniture.ts`, `FurnitureMeshes`; and `test/doorDetail.test.ts`, "door detail".

## Furniture solidity

A solid shaped piece blocks by its drawn shape, not its whole box: render and collision share one source, so a player can go where a piece looks open, between a loading frame's legs or under its roof, and is stopped where it looks solid. A block counts as solid when the shape fills enough of it; that fraction is content, set once in `src/content/base/furniture-shape.libsonnet`, `solidFill`, so a pack tunes it in one place. Movement, sky light and solid bricks read these collision blocks. Picking has its own mask from every shaped piece, including a non-solid container, so aiming at empty space cannot select it or hide items dropped in its cells; it does not change movement or light. Both masks are whole blocks: finer collision and picking start with #960, which is planned together with #221, so movement, sight and picking are reworked once, for one shared grain. Placing, settling, covering and the "nothing falls on a body" check still take the whole box. A load check refuses a solid piece whose shape blocks nothing and names it. See `src/core/shapeSolid.ts`, `shapeBlocks`, and `src/core/blockEntities.ts`, `BlockEntities.hasPartAt`.

Pieces without a drawn shape keep the whole box: doors and hatches (an open door's blocks would have to follow its swing), procedural `appearance` pieces and plain boxes (the box is the look).

Open:

- **What may stand in a piece's open blocks.** Placing takes the whole box, so nothing can be set under a table or on a frame's open floor; decided with movable furniture (#758).

A corpse that is a loot container is non-solid, because a body the player must path around only gets in the way. Walkers, zombies included, cross its cells, and sight passes through it as through any non-solid furniture. It stays pickable and searchable where its drawn blocks are. Its `shape` stays low, because a full one-block box would hide dropped items, thrown items, spent cases and acid puddles settling on the floor inside it. See `src/core/schema.ts`, `FurnitureSchema`; `src/core/furniturePick.ts`, `firstPickCell`; and `test/furniture.test.ts`, "picks a non-solid container only where its low shape is drawn".

## Authored decals

Decals are presentation-only surface marks, not furniture or blocks. They cannot change
collision, sight, searching or saves: their placements derive from content. They share
scene lighting so darkness hides them and carried light reveals them. Authored marks
are needed for beats furniture cannot carry, such as a blood trail leading into a room.
Keep them sparse rather than covering every surface.

Scenario content owns time since the outbreak because different scenarios may be days,
months or years afterward. The gauntlet authors months, so blood reads dried rather
than fresh. Definitions own the ageing response instead of a renderer-wide age default.
See `src/core/schema.ts`, `DecalSchema` and `ScenarioSchema`; the closed kind dispatch
is `src/core/decalKinds.ts`, `DECAL_KINDS`.

Templates and kit pieces own surface placements independently of occupied cells. A door
attachment names its ordinary upright door anchor so the mark follows that panel without
owning door state. Size, palette, stroke geometry, seeded variants and ageing live in
`src/content/base/decals.libsonnet`; the scenario owns the count cap, and validation
reports a service template whose decals exceed it so the renderer never truncates the
marks authors placed first (`scenarioPlanIssues` in `src/core/cityPlan.ts`). See
`src/core/templates.ts`, `placedDecals`, and `src/render/decals.ts`, `AuthoredDecals`.
The renderer batches authored marks and shares stain noise with body blood. Use
`decals=0` in a review URL to compare without the marks; it does not alter the world.
For hardware review use `tools/decal-probe.mjs` with matching posed head and main
URLs and an evidence directory. Exclusive paired trials distinguish decal cost from
whole-scene variation; screenshots also need operator judgment.

## Furniture action noise

Give a furniture action explicit noise only when it should expose the player; ordinary doors and containers stay quiet. Keep the sound's hearing radius with the event, and reject a selected event that cannot alert. See `FurnitureSchema` and the noise checks in `src/core/content.ts`. Door-action registration lives in `src/game/doorAction.ts`; rummage handling lives in `src/game/session.ts`.
