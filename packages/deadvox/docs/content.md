---
read_if:
  - you author or change Deadvox content sources, pack file names or their build pipeline
  - you author or change how a creature type's body falls when it dies
  - you change the test-house layout or its authored structures
  - you change content schemas, validation, registry merging, browser-mod identity or content-loading test fixtures
  - you integrate mod selection into the ordinary start flow
  - you add or change a bundled mod such as beginner mode, or how `?mods=` selects one
  - you add a required content capability or change how a mechanism selects its provider
  - you change runtime escrow roles, severed-part item policy or world liveness tuning
  - you add or change a refusal, notice or option label that core code shows the player
  - you change recipe, skill, workstation or book content, content references, static reachability or disassembly-output contracts
  - you change item economy metadata, source contexts, loot selection, loot-point descriptions or fixed loot, including authored liquid instance state
  - you're authoring or changing authored sites or gauntlet lots, template geometry, palettes, site-generation tuning, time-windowed spawns, curated map kits, role styles or connector contracts
  - you author standing water, basins or lots over water
  - you're authoring or changing exterior door openings, lab-yard perimeters and dressing, or townhouse aftermath scenes (`packages/deadvox/docs/aftermath.md`)
  - you're authoring or changing furniture mounting, appearance, abandoned furniture placement, surface materials or procedural pattern tuning, assigning action noise, or need the isolated look probe
  - you author vehicle furniture looks, street wreck variants or their collision and model-loading contracts
  - you model a thing or place one fallen, on its side or in another special pose
  - you author decals or scenario outbreak age
  - you author a scenario, composed asks, anchors, wave schedules or population policy, its start-building rooms or ways down, or move scenario rules from code into content
  - you author graphics defaults, permitted player graphics choices, weathering profiles or site weathering-profile references
  - you author or change the day cycle, the sky looks or the weather tuning (fog, cloudiness, rain)
  - you change the debug kit ownership view
  - you change settlement building eligibility, city collections, building door resistance or benchmark candidate admission
  - you change city terrain evaluation or authored lot paving
  - you author the police station's armoury or roof access
---

# Content sections and recipes

## Authoring source

Use the repository-wide authoring and conversion rule in `../../../docs/jsonnet.md`. The shared compiler produces the JSON consumed by `buildRegistry` in `packages/engine/src/core/content.ts`; validation and runtime references therefore meet at one boundary.

The enemy pack source is named for its role rather than a creature family, so adding
non-zombie enemies does not require renaming their content home. See
`mods/skelly.deadvox.actors/enemies.jsonnet` and `mods/skelly.deadvox.actors/pack/manifest.jsonnet`, `content`.

## Browser mod identity

Browser mods carry explicit pack metadata independently of their delivery URL or
filename, so a mirror or renamed upload cannot silently select one mod twice.
Their inline definitions pass through the bundled stack's dependency and entry-conflict
boundary, rather than gaining override rights from selection order. See
`packages/engine/src/game/browserMods.ts`, `readMod` and `evaluateMods`, and
`packages/engine/src/core/packAdmission.ts`, `admitPacks`.
Bundled fragments belong to their manifest's pack, not separate mods; see
`packages/engine/src/game/bundledContent.ts`, `createBundledContent`.

The pre-start panel rejects invalid files whole and keeps their diagnostics visible.
An enabled invalid file blocks Start rather than silently starting a different world;
disabling it permits startup with the remaining content, including the base pack alone.
See `packages/presentation/src/ui/modsPanel.ts`, `chooseMods`, and `packages/engine/src/game/browserMods.ts`, `evaluateMods`.
The intake byte limit belongs to trusted startup configuration in
`src/config/browser-mods.jsonnet`, not to a selected mod: admission must bound a file
before parsing or trusting its definitions. The product passes it to admission; see
`src/product/mods.ts`, `productModIntake`.

Browser selections persist as one atomic IndexedDB record, including source text,
order and enabled state. An unavailable or failed store leaves the panel with no mods
loaded and a visible storage error, never a partially restored selection. See
`packages/presentation/src/presentation/modStorage.ts`, `ModStorage`, and `packages/presentation/src/ui/modsPanel.ts`, `chooseMods`.

Admitted packs contribute separately to save identity, including their metadata and
canonical content. Delivery names and JSON object key order are not identity. Dependency
order determines the effective stack; selection order breaks ties between independent
packs and remains part of identity. Disabled files supply neither dependencies nor save
identity. Continue refuses pack differences rather than resuming under different
content. See `packages/engine/src/game/browserMods.ts`, `evaluateMods`, and
`packages/engine/src/core/saveFormat.ts`, `currentSaveVersionIdentity` and `contentPackDifferences`.
The pack-list identity is the rule until #1395 moves identity to the evaluated
content, as `docs/decisions/0008-deterministic-world.md`, "Decision" rules.
Preserved-save notices name pack differences with the mod's own id, without its
internal browser namespace. Raw decoder diagnostics do not belong in that notice:
an ordinary game update is not a mod problem. See `packages/presentation/src/ui/saveController.ts`,
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
A bundled mod's file name matches its mod id, so the file is found by id. See
`src/config/bundled/skelly.deadvox.beginner.jsonnet` and `packages/engine/src/game/bundledMods.ts`, `selectBundledMods`.
The same parameter names an opt-in folder mod, which joins through pack admission with its
closure rather than this intake; see `docs/pack-split.md`, "Debug mods".

The game and the site launcher must offer the same mods, and the launcher is a static page
that cannot import game modules, so the list is one schema-checked content file rather than
two copies. The launcher is a developer entry point, so a missing or invalid list only hides
its control instead of breaking it. It also lists every shipped opt-in folder mod by its id,
so a developer reaches each debug mod from the launcher; the build reads them from the
shipped packs, so a new debug mod shows without a list edit. Players therefore see debug
mods in the launcher too. See `packages/engine/src/core/bundledModCatalogue.ts`, `launcherModCatalogue`,
and `site/launcher.js`, `loadBundledMods`.

Beginner mode (`?mods=skelly.deadvox.beginner`) scales every hostile kind, not a list of ids. Light
spotting counts as detection, so a beginner carrying a torch or flashlight at night does not draw
enemies from full range. The mode exists so a new player can learn the game against slower,
weaker enemies that notice less. See `src/config/bundled/skelly.deadvox.beginner.jsonnet`, `factors`.

A save records each active bundled mod as a content pack in its version identity, so a
beginner-mode world is stored apart from a normal one. The URL alone decides the mode, because
no menu switch exists for it: a world loads only when started with the same `?mods=`. See
`packages/engine/src/core/saveFormat.ts`, `currentSaveVersionIdentity`.

## Core-pack integrity

Bundled packs use the common manifest contract so dependency ownership and deliberate
entry replacement survive extraction into topics. A missing dependency, cycle or
undeclared cross-pack override refuses the stack; filename order must never choose a
winner between packs. The tier grants no privilege. A pack owns its definitions and
names other packs' content only through declared dependencies, and core stays
independent of theme-owned content. See `packages/engine/src/core/packAdmission.ts`,
`PackManifestSchema` and `admitPacks`, and `packages/engine/src/game/bundledContent.ts`, `createBundledContent`.
Compiled JSON under a pack root must be declared, so an omitted manifest entry cannot
silently remove authored content from validation and the game. See
`tools/readBundledPacks.ts`, `readBundledPacks`.

Bundled asset keys combine pack identity and relative path so unrelated mods may
own equal filenames without choosing a winner. Content resolves files within its
owning pack; sharing content across packs requires a dependency rather than a flat
asset namespace. See `packages/presentation/src/presentation/bundledAssets.ts`, `bundledAssetFiles` and
`bundledAssetUrl`.

Each pack's identity covers its manifest and enumerated files, including exporter
models, so changing a model cannot leave its world's content identity unchanged.
Non-content JSON and binary assets contribute build-time digests rather than requiring
unused exporter payloads in the browser. See `tools/readBundledPacks.ts`, `bundledPackDefines`.
A bundle stamp certifies that exact pack input and the admission implementation;
a missing or stale stamp requires full reference checks rather than granting trust.
See `packages/engine/src/core/packAdmission.ts`, `packContentHash`, `packages/engine/src/core/bundleAdmission.ts`,
`BundleAdmission`, and `tools/stampBundle.ts`, `stampPacks`.

This boundary covers bundled packs and inline mod definitions, not local or remote
folder fetchers. HTTPS/origin enforcement, binary provenance and atomic cleanup belong
to folder intake under `docs/decisions/0008-mod-authoring-tool.md`, "Build plan".
No URL-folder support is implied by sharing the manifest schema.

Require zero validation issues, not merely a constructed registry: broken files can
be discarded during registry construction. Required-row checks stay at playable-pack
validation so focused tools and tests can construct partial registries without admitting
an incomplete game. See `packages/engine/src/core/content.ts`, `buildRegistry` and
`requiredContentIssues`, and `src/cli/validate.ts`, `validate`.
CLI fragment arguments exercise content validation; they do not admit folder mods.

## Graphics policy

Graphics defaults and allowed ranges or options belong to the core mod so mods can tune
quality without changing engine mechanics. Reject an inverted range, a default outside
its range, or toggle choices that exclude their default. Require the core policy row at
playable-pack admission rather than inventing missing policy in a renderer. See
`packages/mods/skelly.graphics/graphics.jsonnet`, `packages/engine/src/core/graphics.ts`, `GraphicsOptionsSchema`, and
`packages/engine/src/core/content.ts`, `requiredContentIssues`.

## Inventory action tunables and labels

Inventory action timing and throw shape are tuning of the player's inventory row, and
the label of an item action is player-facing text in the core ui row.
Keeping them in content lets a mod retune or reword them without a code change. The schema
requires every field, so a pack that omits one fails validation instead of silently
inheriting a code default. Readers take the values from the registry. See
`packages/engine/src/core/schema/inventory.ts`, `InventoryTuningSchema` and `UiTuningSchema`, and `packages/engine/src/core/reach.ts`,
`reachTuning`.

## Core text

What core says to the player, its refusals, notices and option labels, is mod content
like any other text (#393, #456), so a mod can reword or translate it without a code
change. It lives in the core ui row, in its own file so other text tables can grow beside
it without touching the same lines. See `packages/mods/skelly.ui/ui-core-text.libsonnet`.

- **Read by key.** Code names each message by a stable key and never compares or matches
  wording, so rewording a message cannot change what the game does. A rule that treats
  some refusals specially, such as hiding the obvious ones from the item options, lists
  keys, and a refusal another rule reacts to carries its key beside its text. See
  `packages/engine/src/core/coreText.ts`, `coreMessage` and `coreRefusal`, and `packages/engine/src/core/options.ts`,
  `OBVIOUS`.
- **Required, with named slots.** One table of keys and slots drives both the schema and
  the lookup's type, so a key code asks for and content lacks fails validation, not play.
  A template names the values code fills in, such as `{item}`, and validation rejects one
  that drops or invents a slot. See `packages/engine/src/core/coreText.ts`, `CORE_MESSAGE_SLOTS`, and
  `packages/engine/src/core/schema/ui.ts`, `slottedTable`.
- **Owner rows.** The knockout refusal sits in the body row beside the bleeding refusal,
  because the body that owns the state words its refusal and needs no registry. The
  simulation takes the registry so its long actions can word theirs, and it words the
  death cause that the body and needs report as a key. See `packages/engine/src/core/body.ts`,
  `Body.actionRefusal` and `Body.advance`, and `packages/engine/src/core/sim.ts`, `SimOptions`.
  A zombie type words its own cause, article included, because only the phrase knows
  its article. See `packages/engine/src/core/schema/actors.ts`, `ActorSchema`.

Internal invariant reasons that only a code defect can produce, such as a missing action
owner, stay in code: no player meets them, and content would only hide the defect. So do
the reasons that check saves, placed loot and fitted-item slots against content, since
they report broken data to a developer, and play only offers fits that already pass them
(`packages/engine/src/core/magazine.ts`, `slotsReason`).

## Handling range

The range uses ordinary authored templates and building rows rather than a separate
geometry mechanism, so its grading, vegetation clearing and admission share the same
owner as other evaluation fixtures. Stagger targets laterally so nearer boards do not
hide farther ones from the firing line. See `mods/skelly.deadvox.scenario.test-house.debug/test-house-range.libsonnet`
and `docs/test-house.md`, "Normal and debug additions".

## Weathering profiles

Weathering is a render-only content choice, not saved world state. Named profiles let sites share the shader while selecting their own material response; layouts without a profile use the shared default. See `packages/engine/src/core/schema/weathering.ts`, `WeatheringSchema`; `packages/engine/src/core/content.ts`, `referenceIssues`; and `packages/engine/src/game/config.ts`, `configFromUrl`.

## Day cycle

One required row owns how the day reads, sun and sky and fog together, and how long a game day lasts in play, so a mod that changes the latitude, the mood or the pace of the day needs no engine code. A new session takes the pace from content; a save keeps the pace it was saved with, and restoring it under different content is refused rather than silently retimed. Every field is required, with no code default and no fallback, so a pack that omits one fails to load rather than playing under a hidden look. Looks are keyed by solar phase so an author edits a phase, not an index, and colours are hex that authors can read.

Where each look sits in its phase is content too, because it is timing tuning a pack may want, such as a longer deep night. The schema, not code, keeps the blend's invariant: keys run in cycle order and each sits strictly later than the one before, and the last stays short of the first a cycle later (the blend wraps from one to the other), and a violation is rejected with the field named, never clamped or reordered. Each look also carries its sky dome, blended with the rest of the look, so which sky shows when is a value, not a code switch: a flat background is a look whose zenith and horizon glow equal its fog colour, with no physical weight, clouds, stars, moon or sun. Each kind of cloud's shape does not change over the day, so it sits once on the row beside the weather tuning, and the layered kind's layer count is capped because every layer costs texture fetches for every sky pixel, so the cap is a cost bound. The dome's other fixed shape (the gradient's elevation bands, the star density, the shape of the sun and moon, the moon's face, the sun heights over which the moon and stars wash out, and the cloud light) sits beside it; the physical sky's exposure, the moon, the sun and the gradient colours are keyed per look. The sun and its glow are painted, and the physical sky only takes over once the sun is high, because near the horizon the model's light falls away too steeply and swings through green and cyan, and the sky stays out of bloom so nothing else can supply the glow. Where the main light comes from sits on the row as well: the lowest it may come from and the moon brightness at which it comes wholly from the moon's side, because how shadows lie at twilight and how quickly the light swings to the moon are look tuning. The sky's reflection on models sits on the row too: its strength, its cube face size and how far the drawn sky must move before it is redrawn, because how closely the reflection tracks twilight against how often it costs a bake is tuning a pack may weigh differently. How looks blend stays in code, as mechanism shared by every pack (`packages/engine/src/core/sky.ts`, `skyAt`). Tests take the cycle from base content through `test/dayPhaseFixture.ts` and never restate it. See `packages/engine/src/core/schema.ts`, `DayCycleSchema`, for what the row holds, and `packages/engine/src/core/weather.ts`, `skyInWeather`.

Weather sits on the same row because how fog, cloud and rain change the sky is mood a pack may want to change, while how a level applies stays in code. Overcast and rain only close or dim, so no tuning can push a value out of range or brighten the sky. One share dims every light painted on the dome, the sun, the moon and the stars alike, because the layered deck lets part of what lies behind it through even at full cover, so a bright disc would still shine through a raining sky, and a cover that hides one of them hides the others as much. The main light keeps its side under cover, the moon's by night as the sun's by day, and dims by the state's main light share. Overcast and rain dim the ambient light as well as the main light, because the ambient light lights the cloud deck as well as the ground: kept at its fair-weather strength, the deck stands brighter than the greyed fog below it and the ground barely darkens. The deck share of each cloud layer takes the main light only up to a lower cap than the tops do, because with one light for every cloud a closing cover reads as a flat sheet with no sunlit tops; a light already under the deck's cap lights deck and tops alike, so when a pack tunes its overcast light under that cap, the weather tuning alone sets how dark an overcast is. The looks' own clouds are fair weather, at a cloudiness the row sets and sessions start at, because a cloudless sky should be rare; below it the clouds thin to none, so cloudiness 0 is a clear sky. Rain brings at least its own level of overcast above fair weather, because rain does not fall from a clear sky, and its own tuning applies on top. Each weather state names the kind of cloud it shows, because real skies change kind with the weather: broken heaped cloud on a cloudy day, a spread deck under overcast and rain. The kind is a value blended like the rest of the state, so the weather moves between kinds without a pop and a pack can give any state either kind; the cloudy state's cloudiness sits on the row with its tuning, and the schema keeps the states in rising order. Weather moves the values the dome already reads, never its shader, so changing it rebuilds nothing; the sky's reflection on models follows it like any other change in the drawn sky.

## Footstep and vocal-noise tuning

Footstep and vocal-noise tuning is a property of the player's body, so it lives in the player's sense row beside the other hearing tunables and a mod that changes the body needs no engine code. Every field is required, with no code default, so a pack that omits one fails to load. See `packages/engine/src/core/schema/senses.ts`, `SenseSchema`.

Two nearby values stay out of the sense tuning on purpose. The stride-phase origin is mechanism: it aligns the first footfall with the shared gait phase that presentation and aim wobble also read, so a pack tuning spacing never needs it (`packages/engine/src/core/footsteps.ts`, `initialFootstepClock`). The hit-flinch duration is the length of the figure's built flinch, so a second copy in content could disagree with the animation it must match (`packages/engine/src/core/actorPose.ts`, `actorHitFlinchDuration`). Tests take the row from `test/senseFixture.ts`, `BASE_SENSE_TUNING`, and never restate it.

## Death falls

Each actor type's content selects how its body falls, in death and in a downed collapse alike, because one body type cannot fall well every way: a fused mass of bodies collapses badly as a physics corpse. The selection, its admitted values and its rejection of a baked fall without a baked figure to play: `packages/engine/src/core/schema/actors.ts`, `ActorSchema`; `packages/engine/src/core/content.ts`, `actorFigureFileIssues`; and `packages/presentation/src/render/mobActors.ts`, `startRagdoll`.

## Content test registries

Fixture builders should include only the content an assertion exercises. Use one validated full-pack registry read-only when a contract needs cross-file references or reachability, and copy each section a test changes. This keeps unrelated validation from dominating tests and prevents changes leaking between assertions. See the registry fixtures in `test/content.test.ts`, `test/audioGunshot.test.ts`, `test/disassembly.test.ts`, and `test/firearmSave.test.ts`. Unrelated contract fixtures may author required metadata through `test/economyFixtures.ts`, `buildFixtureRegistry`. It adds no scarcity rows, so a fixture that rolls loot authors its own, because admitting items by default would conceal the missing-row rule. Admission tests must use raw sources so the fixture builder cannot conceal missing metadata.

Transport tests check the fetched payload and stream limits rather than rebuilding the
playable pack at each asynchronous step. Admission and malformed-JSON rejection belong
to `test/browserMods.test.ts`; keeping that owner avoids load-sensitive transport timeouts.

## Authored structures and sites

Keep exterior shells visually continuous around authored openings; doors and solid window frames remain deliberate gaps. Floor and roof courses meeting an exterior wall use that wall's material, so interior flooring does not appear as an exposed facade stripe. Interior flooring retains its authored material. Doors need clear space on both sides so a player can pass through. See `floorCourseWallGap` and `checkTemplateSpace` in `packages/engine/src/core/content.ts`, and `templateDoorIssues` in `packages/engine/src/core/templateSpatial.ts`.

Keep enclosed building roofs flush with their exterior wall footprint so the roof silhouette follows the shell instead of adding projecting eaves. City roofs are a mixture of two treatments, chosen per building by a weighted content choice, never by a building id in code:

- A sheet-metal roof is a plain galvanized deck.
- A semi-walled concrete roof is a concrete deck with waist-high wall segments along some edges, never a full ring.

Non-wood decks keep wooden flooring from reading as a wooden roof on masonry walls. The mix makes the skyline varied and plausible; keep ladder landings and roof routes open. Open forecourt canopies are separate structures, not building eaves. See `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-decor.libsonnet`, `roofs`, and `tools/jsonnet/lib/gauntlet-city-kits.libsonnet`, `roofDeck`.

The test house is authored content rather than a code-built exception, so the same layout and template mechanisms serve mods and evaluation scenes. See `mods/skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet`, `layouts`, and `docs/test-house.md`, "Content ownership".

Scenario lead references may carry fixed loot on their template's furniture anchors, so a portable clue uses the same surface or container machinery as other items. Lead admission requires readable furniture or a readable fixed item; the route certificate still proves independent access around solid supports. Surface loot and discovery share furniture-top positioning so an observation identifies the pile actually offered by inventory, rather than the support's corner. See `packages/engine/src/core/furnitureSurface.ts`, `furnitureSurfacePosition`. Unknown placement kinds fail schema validation instead of selecting a fallback. See `packages/engine/src/core/schema/layouts.ts`, `FixedLootItem`; `packages/engine/src/core/scenarioComposition.ts`, `extraTemplateIssues`; and `packages/engine/src/core/scenarioCertificate.ts`, `lead`.

Fixed stock may author liquid instance state so test-house looks can begin with a
crafted recovery source and deliberately filled or empty vessels, without runtime
fixture injection. It shares ordinary items' liquid representation and instance
validation, so stock cannot admit unknown liquids or contents an instance cannot
hold. Authored provenance also requires a recoverable type with liquid recovery
for every operation it supports: selecting another recovery operation must not
turn valid stock into an inventory-planning failure. Unrecoverable records are
refused because they cannot serve the recovery look. This is a narrow authoring
capability, not permission to embed saved item trees.
See `packages/engine/src/core/schema/layouts.ts`, `FixedLootItem`; `packages/engine/src/core/placementLoot.ts`,
`fixedItemIssue`; `packages/engine/src/core/loot.ts`, `fixedItems`; and `packages/engine/src/core/inventory.ts`,
`Inventory.createRolled`.

Fixed loot takes eligibility from its resolved authored source context, not a compiled placement's ID. Stacking changes that ID without changing the source's authority. Point overrides keep a special supply local to its anchor rather than retagging the building; fitted children meet the same resolved context. See `placementLootIssues` in `packages/engine/src/core/placementLoot.ts` and its callers in `packages/engine/src/core/authoredLayout.ts` and `packages/engine/src/core/scenarioComposition.ts`.

Keep authored-site terrain and vegetation controls in base content rather than mixing generator settings into authored layouts. This keeps layout geometry about the authored place and generation settings about its terrain. See `packages/engine/src/core/schema/siteGeneration.ts`, `SiteGenerationSchema`, and `packages/engine/src/core/authoredSite.ts`, `AuthoredSite`.

Terrain shape and the tree and forest tunables are required `siteGeneration` fields (see `packages/engine/src/core/schema/siteGeneration.ts`, `siteGeneration`) with no code default, so a mod can reshape the landscape and woods without touching logic and a missing value fails validation instead of silently using a stale one. Code receives the terrain values as one explicit shape (`terrainShapeOf` in `packages/engine/src/core/sitePalette.ts`) rather than reading module constants, so every caller names the world it generates. Geometry, such as tree crowns and placement jitter, and bench-only mechanism values stay in code because they are not tuning a mod should change.

Every site kind shares one block palette so a block choice has a single content home. Unknown names must fail validation instead of selecting a runtime fallback; see `packages/engine/src/core/sitePalette.ts`, `sitePalette`, and `packages/engine/src/core/content.ts`, `checkSiteGeneration`. Optional benchmark geometry belongs with its independent consumer rather than required site-generation content; see `packages/deadvox/docs/content.md`, "City building types".

A site's standing water is authored as layout water rows, its hollows as `basin` terrain primitives, and a lot meant to stand in water says `overWater`; see `packages/engine/src/core/schema/layouts.ts`, `SiteLayoutSchema` and `TerrainPrimitive`, and the rules and reasons in `DESIGN.md`, "Water". A row's level is the water's top face, not a block's lower face like `ground`, because the author sets the plane a swimmer floats at. Its polygon only bounds where water may stand, as a woodland polygon bounds trees: the terrain decides the shoreline, so draw the polygon loosely around the basin and shape the shore with the basin's falloff. Generation fills with the palette's water block, which must be a `liquid` block; see `packages/engine/src/core/content.ts`, `checkSiteGeneration`. The debug scene with a lake is `mods/skelly.deadvox.scenario.water/layouts-water.jsonnet`, `lake_demo`.

World-anchored surface patterns avoid texture assets and repeated seams; palette and washout remain content-owned so shared looks stay tunable. See `packages/engine/src/core/schema/blocks.ts`, `BLOCK_PATTERNS`, and `packages/presentation/src/render/surfacePatterns.ts`, `camoShaderConfig` and `SURFACE_PATTERN_GLSL`.

Windowed template spawns use named game-clock boundaries. Keep their rule and reason in `DESIGN.md`, "Spawning"; see `packages/engine/src/core/schema/templates.ts`, `PaletteThingSchema`, and `packages/engine/src/core/clock.ts`, `resolveSpawnTime`, which gives the names their times from the day cycle content.

A map piece makes a cell a spawn point through a palette `spawn` entry with an optional `chance`; a 1x1x1 marker piece is air that claims its cell and carries one such entry. A slot offers weighted marker pieces, and its pick, drawn once when the assembly compiles, decides the zombie type, while `chance` rolls per world. Lab threat varies by overriding the slot choices; see `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-lab-threat.libsonnet`, `markerPiece`.

An item's floor pad is either authored as part of the item's design (a water tank's concrete foundation is a block in its template) or takes the ground beneath it through a palette `ground` entry, which stamps nothing so the surface the site put there shows. A pad never restates a site's surface block, because a surface then has two homes and the patch returns when the site's surface changes or an item lands on a different one. See `packages/engine/src/core/templates.ts`, `stampPlacement`, and `test/streetCars.test.ts`.

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
`packages/engine/src/core/schema/templates.ts`, `MapPieceSchema` and `MapAssemblySchema`; `packages/engine/src/core/templates.ts`,
`compileMapPiece`, `traversalContract` and `compileAssembly`; and `packages/engine/src/core/mapKit.ts`,
`mapKitIssues` and `reservedStanding`.

A sealed port is a geometric join, not a passage: it must sit on its face and inside the
piece so siblings align, but it claims no mouth or body clearance because nothing
traverses it. See `packages/engine/src/core/mapKit.ts`, `portIssues`.

City building pools may name an assembly instead of a literal template, but not both
under the same identity. An assembly owns its authored floor topology; stress-test
stacking cannot invent additional floors. Resolve alternatives independently for each
stable building location before requesting chunks: caching one selected assembly for a
whole pool would repeat the same furnishings across the city. A literal template has no
alternatives, so one compiled buffer per storey count serves every building that uses
it; only assemblies resolve per location. See `packages/engine/src/core/cityPlan.ts`, `buildCityPlan`
and `templateCompiler`.

A slot may take its alternatives from a map pool instead of inline choices, so a mod
changes one weight with a small pool override rather than re-authoring the assembly.
Pool-sourced alternatives must preserve the same spatial contract as inline ones.
Slot pools name pieces or assemblies and cannot carry city quotas: a single slot has
no per-site count to satisfy. City pools name templates or assemblies instead. See
`packages/engine/src/core/schema/templates.ts`, `KitSlotSchema`, `PoolRefSchema` and `MapPoolSchema`;
`packages/engine/src/core/templates.ts`, `kitSlotChoices` and `resolveSlot`; and `packages/engine/src/core/mapKit.ts`,
`mapKitIssues`.

A ref may carry a style, inherited by every piece beneath it so floor and roof edges
share the facade treatment. Styles and pool rows can change the mix without new piece
ids. Unknown styles fail validation and slot compilation retains the slot path.
City template refs cannot carry styles because literal templates have no role palette;
slot piece and assembly refs can. See `packages/engine/src/core/schema/layouts.ts`, `KitRefSchema`;
`packages/engine/src/core/templates.ts`, `compileKitRef`; and `packages/engine/src/core/cityPlan.ts`, `cityPoolIssues`.

Decoration must stay outside reserved roof and street circulation:
tuning its frequency must not seal a ladder landing or entrance. The cellar street
course keeps the street-side `=` footing solid so the yard and entrance stand on it, and
leaves the interior to the floor piece (`gauntlet_city_floor_lower`, `floor_inside`
slot) and the stair owners; only the stair hole belongs to the stairs. See
`mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-variants.libsonnet`, `dressed`;
`mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-decor.libsonnet`, `rooftop`;
`mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-yards.libsonnet`, `yard`; and
`mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-cellars.libsonnet`, `street`. A route may pass through
an unlocked door but never through a wall, a window or furniture. The fixture mod in `test/fixtures/jsonnet/concrete-style-mod.jsonnet`
exercises the ordinary whole-definition style override boundary.

City placement honours the authored ground storey so a cellar stays underground
rather than lifting the building above the street. Ordinary buildings and the service
campus share this alignment rule; see `packages/engine/src/core/cityPlan.ts`, `groundedY`.

Bound authored volumes before allocating compilation buffers so a short metadata file
cannot request unbounded memory. See `packages/engine/src/core/schema/templates.ts`, `KitSize`.

Whole-definition overrides revalidate retained consumers. Source provenance follows the
winning definition through nested placement so a conflict identifies the authors of both
claims rather than just the final block. See `packages/engine/src/core/content.ts`, `buildRegistry`, and
`packages/engine/src/core/mapKit.ts`, `mapKitIssues`.

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
boundaries cannot disagree about a usable climb. See `packages/engine/src/core/mapKit.ts`, `compileMapSite`,
`packages/engine/src/core/templateSpatial.ts`, `templateClimbCertificate` and `templateStandingRoute`,
and `packages/engine/src/core/climbCertificate.ts`, `climbCertificate`.

An exterior wall door is a delegated piece, not a hole baked into the shell: the shell
leaves the doorway slot unclaimed and the assembly names a door slot whose choices own exactly
the opening they fill. The slot's size binds the door's own size, so a window-sized hole
cannot host a door. A door must be its own opening, not a leaf standing in a larger
window hole. See `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-doors.libsonnet`, `slot`,
`packages/engine/src/core/templates.ts`, `compileAssembly`, `test/cityKitPlan.test.ts`, "gauntlet door openings",
and `packages/deadvox/docs/aftermath.md`, "Door variants".

### City building types

Flimsy and burglary-safe doors are content choices per building, so a building's intended resistance need not change the forcing mechanism. See `packages/mods/skelly.structures/structures-furniture.jsonnet`, `woodDoor`, and `packages/engine/src/core/schema/furniture.ts`, `FurnitureSchema`.

An authored collection owns prevalence and guarantees; each building owns its fit. Keeping those policies separate lets a mod tune prevalence without changing geometry and prevents collection membership from forcing an unsuitable building into a settlement. Eligibility uses content-named settlement kinds, not engine enums, and reuses the building's authored footprint for plot fit rather than maintaining a second size that can disagree with its geometry. Templates and assemblies follow the same admission rule. See `packages/engine/src/core/schema/templates.ts`, `BuildingEligibilitySchema`, `TemplateSchema`, `MapAssemblySchema` and `MapPoolSchema`, `packages/engine/src/core/settlementPools.ts`, `eligibilityExclusion`, and `packages/engine/src/core/cityPlan.ts`, `cityGridOf`.

Filtering must not hide an ineffective addition: a collection entry excluded for every consumer is a load error naming the collection, building and reasons. A consumer with no eligible weighted candidates also fails at load. A shared collection may legitimately serve different kinds or plot sizes, provided each entry serves at least one consumer. Quotas apply to admitted entries; impossible guarantees fail loudly, and recovery stays bounded and deterministic rather than searching layouts. See `packages/engine/src/core/cityPlan.ts`, `settlementCollectionIssues`, `cityPoolIssues`, `chooseBuilding` and `buildCityPlan`.

The stress-test benchmark owns an independent named pool so playable-world edits cannot silently change its workload. Benchmark definitions are optional scenario content, not required capabilities or playable reachability sources: a stack without a benchmark can still validate. See `mods/skelly.deadvox.scenario.benchmark-city/benchmark-city.jsonnet`, `cityBenchmarks` and `mapPools`; `packages/engine/src/core/cityPlan.ts`, `benchmarkCityGrid`; and `packages/engine/src/core/content.ts`, `requiredContentIssues`. Classification follows `docs/pack-split.md`, "Classification rule".

Pools and eligibility remain static content so they can become inputs to an expression selector without competing with it. There is no separate selector language here. Additive mod admission waits for the typed merge mechanism in `docs/decisions/0007-typed-field-patches.md`, "Decision"; collection ownership does not imply that list additions are already implemented.

Special buildings must read as plausible places, not generic rooms distinguished only by hidden loot. The police armoury's furniture and secured door must communicate weapon and ammunition storage, so its door is the steel armoury leaf that only a cutting tool forces and the roof key is the way in. Every station copy carries the armoury, so its room, key and stock belong to the base station: a scenario overlay matching room strings can silently stop matching after a layout edit. A reward that need not suit its host still belongs to the gauntlet instance (see `DESIGN.md`, "Gauntlet"). Masonry gives the civic building its character; wooden furnishings do not imply timber construction. See `mods/skelly.deadvox.rural-sites/rural-police.jsonnet`, `templates`, `furniture` and `loot`; `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-authored-sites.libsonnet`, `policeMain` and `compound`; and `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-layout.libsonnet`, `lots`.

Loose furniture in abandoned buildings and yards should suggest abrupt flight rather than tidy occupation. Keep disorder inside authored furnishing bays, outside reserved circulation, so seeded variation cannot obstruct doors or room access. Use content-owned weighted poses instead of a runtime physics simulation: the existing kit selector provides location-stable variation. A pose belongs to the placement, not the model (see "Furniture visual shapes"). Tipped chairs are not seats. Townhouse rooms follow the scene rules in `packages/deadvox/docs/aftermath.md`, "Scene slots". See `mods/skelly.deadvox.scenario.gauntlet.city/aftermath.libsonnet`, `poses`, `pieces` and `slot`, and `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-authored-sites.libsonnet`, `furnished`.

The lab's surface enclosure follows the underground footprint rather than just the service building, so the slab reads as one abandoned compound. Keep the apron and named perimeter crossings usable so fencing does not obscure the way down or turn the yard into a trap. Lot and service-yard openings share the same reach-and-sweep certificate so an alternate entrance cannot hide a blocked crossing. See `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-lab-yard.libsonnet`, `slots` and `routes`, and `packages/engine/src/core/cityLots.ts`, `perimeterRouteIssues`.

Authored lots separate the arrangement from the building draw: a designed street and yard should not move when a seed changes its houses. Empty reservations protect intentional open ground, and pool guarantees must fit the actual lot footprints rather than borrowing capacity from another row. Fixed service placement keeps a designed destination on its intended approach. A validation pass shares immutable leaf compilation so a compound's nested assemblies do not repeatedly pay for the same authored geometry; a later admission must still see registry edits. See `packages/engine/src/core/mapKit.ts`, `mapKitIssues`. Off-rhythm paving belongs to the same plan as stamping, so the walked alleys cannot disagree with the arrangement. See `packages/engine/src/core/cityLots.ts`, `placeCityLots` and `cityLotIssues`; `packages/engine/src/core/cityPlan.ts`, `buildCityPlan`; and `packages/engine/src/core/terrainEvaluator.ts`, `createCitySurface`.

Keep geometry, collection and consumer independently overridable so a prevalence edit need not restate a building or a scenario. See `mods/skelly.deadvox.scenario.gauntlet.city/scenarios.jsonnet`, `mapPools`, and `packages/engine/src/core/content.ts`, `buildRegistry`.

Supply shops supplement the houses, while police and gun supplies remain scarce. A building rolls from its place theme, so tables are shared per theme and source contexts tell themes and roles apart; selection rules own admission, so a row a context rejects drops out instead of leaking a weapon into the wrong place. A promised supply must be usable and must not hang on a roll: what the run needs is fixed stock on the instance rather than room loot, so the lab stays winnable (see `DESIGN.md`, "Gauntlet"), and a promised rifle comes with a fitting magazine and enough of its calibre to fight a room. Rifle supplies are Military-only and also roll outside the armoury, because a single cabinet would make the whole supply one find; `packages/deadvox/test/gauntletLoot.test.ts`, "gauntlet loot reachability", guards that the promised rifles stay supplied. Each lab level rolls every tier up to its depth, keeping the lower ones, so a deeper level is worth its risk; an assembly hands its tier range to the pieces inside it, because a flattened building would otherwise give every storey one tier. The deepest tier stays empty until #1128 accepts its first item, and an empty tier rolls nothing. A headquarters holds a garrison because one with none reads as an empty set; `packages/deadvox/test/gauntletHqThreat.test.ts` guards it. Threat marker and rifle ammunition amounts stay provisional until BR tunes them in play. See `mods/skelly.deadvox.loot/loot-armoury.jsonnet`, `armoury_cabinet` and `hq_field_supplies`; `mods/skelly.deadvox.crisis-hq/crisis-hq.jsonnet`, `markers`; `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-lab-entry.libsonnet`, `markerCells`; `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-lab-special.libsonnet`, `range`; `mods/skelly.deadvox.loot/medical-stock.jsonnet`, `loot`; `mods/skelly.deadvox.scenario.gauntlet.city/scenarios.jsonnet`, `composition`; `packages/engine/src/core/loot.ts`, `LootContextSchema` and `economyEligible`; and `packages/engine/src/core/templates.ts`, `compileAssembly`. `packages/deadvox/test/gauntletLabTiers.test.ts`, "gauntlet lab loot tiers by depth", guards the tier-by-depth property.

Every shop shows a street cue that no house carries, and no two shop types share one, so a player walking the street can tell a shop from a house, and one kind of shop from another, before entering. The cue is built from blocks that only shop fronts use, on the street face and in the yard in front of it. A cue prop must never narrow what a standing player or shambler can walk: the yard cells in front of a door keep full standing headroom, so a prop that hangs over the yard goes above the standing body, not at head height. The rule is data-only, with no code special cases per shop type. See `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-building-types.libsonnet`, `shell`, and `test/cityKitPlan.test.ts`, "gauntlet shop fronts".

The secret house is a cellar house with one more storey under the cellar, reached by a ladder through a floor hatch. Its pool row carries a quota of exactly one, because a secret is special only while it is rare; a city that cannot fit it fails loudly rather than dropping it. Quota rows take their lots in authored order without a seed, so the secret house and the gun store stand in the same lot every seed. The fixed lot is accepted because it keeps the engine unchanged, rather than adding a seeded lot per quota row. What that leaves open: once found, the secret is found for every later run, so its note, hatch and reward reward a first visit only, and changing the pool's authored lots is the only way to move it. See `packages/engine/src/core/cityLots.ts`, `matchQuotas`. The note upstairs hints that something lies deeper without giving directions, so finding the hatch stays the player's discovery. The sealed room is furnished as a prepper's bunker, with a bed and a wardrobe beside the stash and a little more floor than a stash alone needs, so it reads as a room someone built to wait out the end rather than a hidden locker. A rug lies over the hatch in every choice of the room above it, so the way down is hidden until the player lifts the rug; tarps lie elsewhere, in some city yards, so a cover is not always a tell. A rug is a cover, which `packages/deadvox/DESIGN.md`, "Moving furniture", defines. The sealed room holds one brute shambler so the reward is guarded rather than free. It is not an acid zombie, because acid zombies stay a lab threat and a city house would blur that. What the brute shambler is belongs to `packages/deadvox/DESIGN.md`, "Types are data". The room is not certified as a resource: the reward is a bonus, not a promise, so it is fixed stock on the room's furniture outside `composition.resources` and no route proof depends on it. Its wardrobe rolls ordinary wardrobe loot, which is part of the same bonus: the room lies below every storey the house declares, so the building's loot promise does not cover it. The stock is police-calibre ammunition only, keeping the stash within the scarcity police supplies already set; the footlocker also holds the game's only blowtorch, with one gas cartridge fitted. Palette stock is checked like any fixed loot: a container item needs a container and the building's source context must admit it. See `mods/skelly.deadvox.scenario.gauntlet.city/scenarios.jsonnet`, `mapPools`; `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-variants.libsonnet`, `secretHouse`; `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-cellars.libsonnet`, `reward`; and `packages/engine/src/core/placementLoot.ts`, `pieceItemIssues`.

### City perimeter

The perimeter must stay closed across streets as well as blocks, because a street gap
would become an escape. Its dressing must face inward without opening a way through;
notice text follows
`INTERFACE.md`, "Text". Wear and rubble make the enclosure belong to the abandoned place,
but passable breaches belong to the interior sites, not the containment wall. Bounds
hold the designed points of interest and filler housing rather than reserving a band
of city for later expansion. Ordinary physics owns jumping; no out-top prediction is
an admission condition. See `packages/engine/src/core/cityPlan.ts`, `cityPerimeter`, `perimeterGaps`
and `perimeterIssues`; `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-layout.libsonnet`, `bounds`; and
`mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-perimeter.libsonnet`, `templates`.

## Scenarios

A scenario is mod content: a mod must be able to express a scenario like the gauntlet in
Jsonnet without a code edit. The scenario row must supply the values, such as counts,
chances, densities, thresholds and authored placements, and must select code-owned
mechanisms, as `../../../PILLARS.md`, "Content forward compatibility" requires. Code keeps
what a mod cannot safely or usefully restate: the body route oracle, the physical climb
and reach certificates, spawn admission with its saved ledger, and the scenario run's win
state. See `packages/engine/src/core/schema/scenarios.ts`, `ScenarioSchema`; `packages/engine/src/core/climbCertificate.ts`,
`climbCertificate`; and `packages/engine/src/core/actorSpawns.ts`, `ActorSpawner`.

- **Kind.** The row's `kind` selects the site mechanism through a dispatch table that owns
  its keys. A new scenario of an existing kind is content alone; a new kind is a code
  mechanism, because how a site is built and proved is geometry, not data. See
  `packages/engine/src/core/scenarioKinds.ts`, `SCENARIO_KINDS`; and `packages/engine/src/game/worldSetup.ts`,
  `SCENARIO_SITES`.
- **Composed sites.** Incremental asks compile to the authored layout so placement can grow
  without a second terrain renderer. Per-ask random streams keep later additions from
  moving earlier placements. Supply redundancy is a load-time count, not a per-seed
  distance certificate; distance curves express preferences rather than bands. Curves
  interpolate linearly between knots and have zero density beyond their knot range,
  so authors control both the preference and its finite support without an implicit
  extrapolation policy adding unwanted distant placements. Directly
  named templates without eligibility are an author's explicit admission, while declared
  eligibility still constrains the inherited settlement kind. The start reservation owns
  the start building and its apron rather than overlapping it with another reservation.
  Anchors are authored rules, not engine-selected arrival kinds; independent anchor and
  wave streams keep arrivals reproducible without coupling them to runtime event timing.
  Wave expansion belongs in Jsonnet so the clock and escalation remain moddable while
  the session consumes only resolved cells. Composed population admits template markers
  explicitly; city street pressure has no meaning without city streets and is not part of
  that contract. See `packages/engine/src/core/composeLayout.ts`, `composeLayout`,
  `composedSiteIssues` and `guaranteeIssues`;
  `packages/engine/src/core/schema/scenarios.ts`, `ComposedSiteSchema`; and
  `mods/skelly.deadvox.scenario.holdout/waves.libsonnet`, `rules`.
- **City route proof.** The assembled city's code proves that its routes are open, and the row
  supplies the proof's counts and thresholds, such as how many leads a player may miss
  while one stays reachable. The proof's shape is physics a mod cannot safely restate, while
  how forgiving a scenario is belongs to its design. The lead redundancy sits with the
  leads, beside what it counts. Only leads reached by different routes count toward it,
  because two leads behind one blocked street fail together and would overstate how
  forgiving the scenario is. See `packages/engine/src/core/scenarioCertificate.ts`, `scenarioCertificate`.
- **City start.** The tallest roof opens the run with an overview and a descent. Ways down
  trade speed against safety or noise, so leaving the roof is a choice. The start
  building is a condo block repurposed during the outbreak. It needs enough room and
  something on every storey to make it interesting, rather than just a staircase.
  The start row carries this placement, not the scenario row, so another start can bring
  its own building and ways down to the same city. See
  `mods/skelly.deadvox.scenario.gauntlet.start/gauntlet-start.libsonnet`, `placement`, and
  `mods/skelly.deadvox.scenario.gauntlet.start/gauntlet-start-rooms.libsonnet`, `slots`.
  Collapsed floors are extra risky shortcuts, not registered descents, so the start
  check never certifies an interior fall to meet the minimum.
  The route proof starts at the roof because rolled furnishings can block
  the foot of a way down. Redundant ways down prevent one obstruction from forcing a
  single exit. A way down counts even when it can injure or kill, because choosing the
  risk is part of the descent; its foot need not be kept clear. See
  `packages/engine/src/core/scenarioStart.ts`, `scenarioStartIssues`; `packages/engine/src/core/startIssues.ts`,
  `startIssues`; `packages/engine/src/core/cityPlan.ts`, `buildCityPlan`; and
  `packages/engine/src/core/scenarioCertificate.ts`, `scenarioCertificate`.
- **Street approach.** The street a kind's proof enters its site from is an authored
  anchor, not derived from the site, so a scenario can approach from another side and
  stay the same kind. Under a rooftop start the anchor need not sit at the foot of a way
  down.
- **Placement.** Clues belong in named buildings and landmarks belong to the designed
  approach, so their meaning agrees with the arrangement the player sees from the roof.
  Local standing poses make readable access part of admission rather than an assumption
  about empty street corners. Code proves the composed route because authored placement
  alone cannot protect it from furnishings or later stamping. See
  `packages/engine/src/core/scenarioComposition.ts`, `composeScenario`, and
  `packages/engine/src/core/scenarioCertificate.ts`, `scenarioCertificate`.
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

Keep alternative recipe inputs bounded so validation cannot expand without limit; see `packages/engine/src/core/schema/recipes.ts`, `RecipeSchema`.

Skill definitions own their effects and training activities. Quality requirements refer to qualities declared by loaded items or workstations, rather than a separate top-level content section. A reachable provider is a separate reachability requirement. See `packages/engine/src/core/schema/skills.ts`, `SkillSchema`; `packages/engine/src/core/character.ts`, `Character`; and `packages/engine/src/core/reach.ts`, `bindReach`.

Validate recipe and component references against the effective ordered pack. Disassembly yields and salvage are authored for the item rather than inferred by reversing every recipe; see `planDisassembly` in `packages/engine/src/core/disassembly.ts` and `docs/crafting.md`.

The initial torch, candle, and repair-kit recipes consume whole solid items and do not consume their containers. A recipe using part of a liquid requires approval of the storage-to-volume mapping, saved partial use, and container-retention rules first. Old saves are refused rather than migrated before v1.0 beta (#1023); see `docs/decisions/0002-saves.md`, "Compatibility".

## Static reachability

Content acceptance checks that authored world sources can provide declared item types through loot, map-kit alternatives, crafting, disassembly, packages, teaching books, fixed loot, and firing output. It also checks required qualities and training sources. This catches content that validates structurally but cannot be reached in play; `npm run validate` reports the result without maintaining a second content list here. Type-source reachability does not prove that a particular authored container can be reached and looted. Fixed-loot tests use the same standing traversal as template validation; see `templateReachableStandingPositions` in `packages/engine/src/core/templateSpatial.ts` and `test/authoredFixedLoot.test.ts`.

Reachability is a type-source contract, not a quantity, seed, or whole-game solver. A site can lack item types the whole game has, so `tools/site-never-spawn-report.mjs`, `report`, compares site and whole-stack sources with the same selected start's roots rather than gating each site. A recipe cycle without a found source cannot make itself reachable. Knowledge from a skill must be grounded just like knowledge from a book, because a dead unlock must stay red. An authored skill level grants only that level; a reachable practice source makes higher levels attainable for this static check. Training ceilings and non-crafting practice are outside this contract. Level-zero unlocks are starting knowledge and need no practice source. Disassembly assumes the required skill is attainable, unlike recipe requirements and positive-level unlocks, which need reachable practice. Showcase and demo layouts are fixtures, not sources for playable-world reachability. See `packages/engine/src/core/reachability.ts`, `checkReachability` and `reachableKnowledgeAndSkills`, and `packages/engine/src/core/schema/layouts.ts`, `SiteLayoutSchema.demo`.

Acquired-content totals follow authored policy rather than identity so adding a debug fixture or creature part needs no checker edit: they count the items a scarcity row lists without `notLoot`, so an item with no row stays out of them. See `packages/engine/src/core/loot.ts`, `ItemScarcitySchema`, and `packages/engine/src/core/reachability.ts`, `checkReachability`. Escrow and severed-part policy also belong to content; see `packages/engine/src/core/schema/items.ts`, `ItemSchema.workInProgress`, and `packages/engine/src/core/schema/actors.ts`, `ActorSchema.severedItems`. World liveness must not follow creature identity; see `packages/engine/src/core/schema/siteGeneration.ts`, `SiteGenerationSchema.activeActorRadiusMetres`, and `packages/engine/src/core/actorSystem.ts`, `ActorSystem.tierAt`. Reachability remains separate from runtime progression, crafting and disassembly. Diagnostics need source-file provenance so a broken effective definition can be traced to its authoring source.

## Loot economy descriptions

Scarcity lives in the product's `itemEconomy` section, keyed by item id, not on item rows: what an object is belongs to the theme tier, while how scarce it is belongs to the product or scenario using it. Keeping rows apart from the item fragments means moving a definition to a shared topic does not carry its scarcity along. Deadvox's rows for core and theme items live in `skelly.deadvox.loot` with the loot tables, so one mod owns both what spawns and how scarce it is; a separate scarcity mod would let loot validate alone yet spawn nothing. A row naming an unloaded item is an error, so a product's or scenario's own items take their rows from the mod that loads them. See `packages/engine/src/core/loot.ts`, `ItemScarcitySchema`; `packages/engine/src/core/content.ts`, `checkItemEconomyRows`; and `mods/skelly.deadvox.loot/item-economy.jsonnet`, `itemEconomy`.

An item with no row never spawns randomly, and hand placement still admits it. A fitted child goes through the same admission, so a child with no row also keeps its host out of random loot. This is the named exception in `PILLARS.md`, "Content forward compatibility". Template and layout source contexts are not part of this section.

Separate item admission from table weights and world placement. Exact tier membership and intersecting usage keep a shared supply eligible without making every military-usable item military-only. An explicitly empty row also means no random admission, rather than a wildcard. Police-only items and the strong analgesics narrow the same way, to the Police and Medical usages, because a tag every item carries filters nothing. See `packages/engine/src/core/loot.ts`, `ItemEconomySchema`, `economyEligible`, and `militaryOnlyEconomy`.

A special point must not retag a whole building. Anchor usage and exact-tier choices keep its supply local, and placement overrides let an instance specialize it without copying the template. See `packages/engine/src/core/schema/templates.ts`, `PaletteThingSchema` and `FixedLootOverride`; `packages/engine/src/core/authoredPlacement.ts`, `placementOf`; and `packages/engine/src/core/site.ts`, `lootSourcesOf`. Native content metadata is an explicit authoring choice with unknown-row assertions, not a runtime default; see `tools/jsonnet/lib/economy.libsonnet`, `authorEconomy` and `context`.

An item too large to turn up in ordinary loot, such as the engine hoist, is listed non-spawnable, so no loot context admits it. Authored placement and loot admission are separate questions: a loot table or roll refuses such an item, while a scenario or site that places it by hand is admitted, because the author chose it and no dice did. Placement still refuses an unknown item, one fitted with a child outside both rules, and a spawnable item outside its source context. See `tools/jsonnet/lib/economy.libsonnet`, `notSpawnable`, and `packages/engine/src/core/loot.ts`, `lootTypeIssue` and `placedTypeIssue`.

Keep empty source descriptions so a dynamic event can address any source without regenerating geometry; world loot itself rolls once per chunk column (`packages/deadvox/DESIGN.md`, "Loot"). Source identity must include the building, local vertical anchor and destination channel, never traversal order or a generated template name; independent random streams then remain stable when another source is visited first. See `packages/engine/src/core/loot.ts`, `lootSpawnPoint`, `lootPointsByColumn`, and `lootPointStream`.

Fixture descriptions keep showcase stock from defining production eligibility. They may include demonstration items without changing their scarcity rows; ordinary pools must still reject those types. See `packages/engine/src/core/authoredSite.ts`, `AuthoredSite`, and `packages/engine/src/core/loot.ts`, `selectLootType`.

## Furniture visual shapes

Procedural `appearance` detail must not change occupied cells or expose hidden contents, so refining how a fixture reads cannot change gameplay. A `shape` is the exception: it is both what is drawn and what blocks (see "Furniture solidity" below).

Wall mounting is an explicit content contract because text alone cannot distinguish a hung plaque from a freestanding board. Reject unsupported mount kinds and missing hosts rather than rendering an apparently attached object in empty space. Keep plaque dimensions and board legs in content shapes instead of renderer guesses. See `packages/engine/src/core/schema/furniture.ts`, `FurnitureSchema`; `packages/engine/src/core/content.ts`, `checkPaletteThing`; and `mods/skelly.deadvox.scenario.playtest/furniture-playtest.jsonnet`, `plaque`.

A heap of mixed materials is one shape with a colour per box, not several pieces of furniture: it must stay a single container with one pick target, and the colours are content so a new heap needs no code. See `packages/engine/src/core/schema/furniture.ts`, `FurnitureShapeBoxSchema`, and `mods/skelly.deadvox.buildings/furniture-workshop.jsonnet`, `workshop_scrap_pile`.

Container appearance belongs to its definition rather than an ID switch or a guess from dimensions: similarly sized furniture can serve different purposes. Its kind names how the piece opens, and every piece that opens that way shares the kind, so a new container picks an existing kind and only a new way of opening adds one; a kind for one piece would be an ID switch moved into content. Keep procedural detail inside the cell envelope so handles do not promise reach outside the pickable fixture. Definition-owned appearance also keeps empty and unsearched containers visually indistinguishable. See `packages/engine/src/core/schema/furniture.ts`, `FurnitureSchema`; `packages/presentation/src/render/furnitureDetail.ts`, `furnitureDetail`; and `packages/presentation/src/render/furniture.ts`, `FurnitureMeshes`.

Vehicle furniture uses either a catalogue blueprint with body paint and dirt, or a content blueprint whose fittings author their finishes. Unknown references fail validation rather than falling back. Content looks use model-library parts and restage as models load; their collision must match the fitted parts that render. See `packages/engine/src/core/content.ts`, `checkFurnitureVehicle`; `packages/engine/src/core/vehicleShapeSolid.ts`, `contentVehicleCells`; and `packages/presentation/src/render/workshopVehicle.ts`, `contentDisplay`.

The gauntlet's street pool crosses cars with strip sets to avoid one repeated prop. Keep one definition per combination so saves and rendering need no per-placement look state. Cross those axes into a map pool rather than a kit slot pool, because a slot pool compiles every choice. Keep the intact strip set as a variant so not every car is stripped. See `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city.libsonnet`, `cars`; and `packages/engine/src/core/cityPlan.ts`, `streetPropChoices`.

A piece with a front is placed with its `facing` pointing into the room or toward its open side, never at the wall it stands against: a front pressed to a wall hides the detail that tells the player what the fixture is and reads as a placement mistake. An omitted `facing` means north, so a piece against a north wall must say so. Props with no front (crates, fences, shrubs) need no facing.

Model each thing once, upright, as it stands in use. A fallen, tipped, overturned or on-its-side piece is that same model in a pose of its placement, never a separate definition. A model built in a special pose is a second copy of the thing whose detail is worked out again for the new orientation and drifts from the original, so a separately modelled fallen wardrobe can show its doors on its top face. One model keeps detail, loot, collision and interaction in one place, and any pose costs no new modelling. See `packages/engine/src/core/schema/templates.ts`, `PaletteThingSchema`, and `packages/engine/src/core/templates.ts`, `compileMarkers`.

Merge detail into the fixture's existing draw object and cache geometry between state changes. Shared vertex-coloured Lambert shading preserves the scene's lighting and fog without texture assets, material groups, or another rendering pass. This favours recognizable silhouettes and panel relief over fine surface realism while frame cost is a concern (#680). See `packages/presentation/src/render/furniture.ts`, `FurnitureMeshes`.

### Refining a fixture

Survey the fixture's real-world construction and its authored role before choosing detail. Identify the recognizable silhouette, front, panels and opening hardware without inspecting hidden loot; recognition should help a player understand the fixture, not reveal its search state.

Choose the structural appearance in content through `packages/engine/src/core/schema/furniture.ts`, `FurnitureSchema`, rather than a renderer ID exception. Follow `../../../docs/jsonnet.md`, "Jsonnet authoring", for the source boundary. Derive procedural parts from the definition's dimensions in `packages/presentation/src/render/furnitureDetail.ts`, `furnitureDetail`, so the same construction works for differently sized definitions. Keep front relief within the occupied envelope and check rotated facings: protruding decoration would advertise interaction space the picker cannot reach.

Use `packages/deadvox/tools/furniture-detail-probe.mjs` to inspect the definitions with appearance or door detail together in an isolated lit scene, each intact beside its look at every damage step its material authors, so a material's steps can be judged on the furniture that wears them; a door stands once more open, so its detail is seen to swing with it. The tool starts its own development server and takes a screenshot destination as its argument, then optionally the pieces to narrow to; its compare flag stands the plain block each piece drew before its detail at the head of its row, so a look review sees what the detail bought. Its draw report separates geometry cost from the rest of the game. Compare the screenshot for recognition and the report for the single-draw-per-fixture budget, then inspect the actual game lighting before requesting look approval. An isolated screenshot cannot establish in-world readability or real-GPU performance.

Keep the cache, facing and envelope evidence in `test/furnitureDetail.test.ts`, and follow the tiered checks in `../../../AGENTS.md`, "Before pushing: tiered checks". Do not pin content counts, colours or triangle totals: those may change while the one-object and interaction-envelope contracts remain. The agent workflow is `docs/furniture-detail-skill.md`.

### Door detail

Doorway leaves and hatches show how they open through their own `door.detail`, not an `appearance` kind: an appearance kind draws a fixed body from the definition's size, while a door's panel is posed per placement, swinging on its hinge or standing up on a hatch's hinge edge. A detail names raised fields, strap hinges on the hinge edge and a handle by the free edge, so a player can tell a door, which side it hangs on and where to take hold of it. Looks are named by how a door is built in `tools/jsonnet/lib/door-detail.libsonnet`; a door picks one and overrides only what its size or build needs, so no renderer code knows a door id. Both faces carry the same detail, because either face of a leaf may be the one a player meets.

The detail replaces the plain panel inside the hinge group, so it swings with the leaf, and a doorway stays one draw. Geometry is cached per definition and panel size, so opening, closing and further copies build nothing. A shut hatch sits down in its frame so its ring and hinges stay within its cells; an open leaf or hatch reaches past them anyway. A body door keeps the handle drawn on its body and takes no detail. A shaped leaf's shape is its look: the detail is optional there, and the lab bulkhead carries its hinges in its shape because its panel lies inside its slab. A decal attached to a detailed door sits on the raised field, not the panel under it. See `packages/engine/src/core/schema/furniture.ts`, `DoorDetailSchema`; `packages/presentation/src/render/doorDetail.ts`, `doorDetail`; `packages/presentation/src/render/furniture.ts`, `FurnitureMeshes`; and `test/doorDetail.test.ts`, "door detail".

## Furniture solidity

A solid shaped piece blocks by its drawn shape, not its whole box: render and collision share one source, so a player can go where a piece looks open, between a loading frame's legs or under its roof, and is stopped where it looks solid. A block counts as solid when the shape fills enough of it; that fraction is content, set once in `tools/jsonnet/lib/furniture-shape.libsonnet`, `solidFill`, so a pack tunes it in one place. Movement, sky light and solid bricks read these collision blocks. Picking has its own mask from every shaped piece, including a non-solid container, so aiming at empty space cannot select it or hide items dropped in its cells; it does not change movement or light. Both masks are whole blocks: finer collision and picking start with #960, which is planned together with #221, so movement, sight and picking are reworked once, for one shared grain. Placing, settling, covering and the "nothing falls on a body" check still take the whole box. A load check refuses a solid piece whose shape blocks nothing and names it. See `packages/engine/src/core/shapeSolid.ts`, `shapeBlocks`, and `packages/engine/src/core/blockEntities.ts`, `BlockEntities.hasPartAt`.

Pieces without a drawn shape keep the whole box: doors and hatches (an open door's blocks would have to follow its swing), procedural `appearance` pieces and plain boxes (the box is the look).

Open:

- **What may stand in a piece's open blocks.** Placing takes the whole box, so nothing can be set under a table or on a frame's open floor; decided with movable furniture (#758).

A corpse that is a loot container is non-solid, because a body the player must path around only gets in the way. Walkers, zombies included, cross its cells, and sight passes through it as through any non-solid furniture. It stays pickable and searchable where its drawn blocks are. Its `shape` stays low, because a full one-block box would hide dropped items, thrown items, spent cases and acid puddles settling on the floor inside it. See `packages/engine/src/core/schema/furniture.ts`, `FurnitureSchema`; `packages/engine/src/core/furniturePick.ts`, `firstPickCell`; and `test/furniture.test.ts`, "picks a non-solid container only where its low shape is drawn".

## Authored decals

Decals are presentation-only surface marks, not furniture or blocks. They cannot change
collision, sight, searching or saves: their placements derive from content. They share
scene lighting so darkness hides them and carried light reveals them. Authored marks
are needed for beats furniture cannot carry, such as a blood trail leading into a room.
Keep them sparse rather than covering every surface.

Scenario content owns time since the outbreak because different scenarios may be days,
months or years afterward. The gauntlet authors months, so blood reads dried rather
than fresh. Definitions own the ageing response instead of a renderer-wide age default.
See `packages/engine/src/core/schema/templates.ts`, `DecalSchema`, and `packages/engine/src/core/schema/scenarios.ts`,
`ScenarioSchema`; the closed kind dispatch
is `packages/engine/src/core/decalKinds.ts`, `DECAL_KINDS`.

Templates and kit pieces own surface placements independently of occupied cells. A door
attachment names its ordinary upright door anchor so the mark follows that panel without
owning door state. Size, palette, stroke geometry, seeded variants and ageing live in
`mods/skelly.deadvox.scenario.gauntlet.city/decals.libsonnet`; the scenario owns the count cap, and validation
reports a service template whose decals exceed it so the renderer never truncates the
marks authors placed first (`scenarioPlanIssues` in `packages/engine/src/core/cityPlan.ts`). See
`packages/engine/src/core/templates.ts`, `placedDecals`, and `packages/presentation/src/render/decals.ts`, `AuthoredDecals`.
The renderer batches authored marks and shares stain noise with body blood. Use
the hash `decals:false` in a review URL to compare without the marks; it does not alter the world.
For hardware review use `tools/decal-probe.mjs` with matching posed head and main
URLs and an evidence directory. Exclusive paired trials distinguish decal cost from
whole-scene variation; screenshots also need operator judgment.

## Furniture action noise

Give a furniture action explicit noise only when it should expose the player; ordinary doors and containers stay quiet. Keep the sound's hearing radius with the event, and reject a selected event that cannot alert. See `FurnitureSchema` and the noise checks in `packages/engine/src/core/content.ts`. Door-action registration lives in `packages/engine/src/game/doorAction.ts`; rummage handling lives in `packages/engine/src/game/session.ts`.
