---
read_if:
  - you design or curate a building type, or write a building brief
  - you add or change a world setting, or the settlement kinds a setting has
  - you change the brief schema, an assembly's `brief`, or the registry versus validate boundary for briefs
  - you iterate on one building and validate after each try
  - one change makes validate report many missing references, and you look for the root
  - you give a house type a cellar twin, or tune how often a site draws it
  - you copy layers between pieces, or wonder what a layer mark claims
  - you place a briefed building in a look fixture's layout
  - you declare or turn a building's front edge, or wonder which edge its entrance must reach
  - you give a building's door a local way from the road, or change how trails and steps are placed
  - you build or change the fit check between an assembly and its brief
  - a briefed building's slab, floor or roof must hold under the support rule
  - you review the pavilion, village shop or boarded-house support fixtures
  - you choose a floor's material, or a block's look against its material
  - you add or change a service, a furniture `serves`, a setting standard or a brief's tags
  - you want a worked example of a brief and the curated assembly that answers it
  - you set a house on a plot with outbuildings, or decide how often a site draws each variant
  - a building needs a door, window or fitting, and you decide whether it is shared or its own
  - you hang a door on a briefed building's walk, or decide what a doorway slot may hold
  - you brief a building that is not a home, such as a works stores or a plant hall, or give machinery a service
  - a scenario stocks a shared building with its own supplies, or decides where that building's kit lives
---

# Building pathway

A curated building should fit the game world, not just stand up. So the product of
authoring is not a house but a way to define one: constraints first, as content that
validate can read, then curated kit pieces and assemblies that answer them (curation
rules: `docs/decisions/0005-curated-map-kits.md`, "Decision"). One brief can have many
answers, and a mod can add answers without touching the brief.

## World settings

Region and era have one home, a world setting, so briefs name it instead of each
restating where and when the world is. Its region, era and building culture are free
text: they steer the author choosing references and BR judging the result, and no check
can read taste. See `packages/engine/src/core/schema/buildingBriefs.ts`, `WorldSettingSchema`,
and `mods/skelly.deadvox.buildings/world-settings.jsonnet`.

Settlement kinds are content-named, not engine enums (`packages/deadvox/docs/content.md`,
"City building types"), and nothing else declares them, so a setting lists the kinds it
has. That gives a brief's kinds something to resolve against inside its own pack's
dependencies. Resolving against the scenarios that place kinds would make a brief valid
in one stack and broken in a smaller one, and a broken reference drops the whole file
(`packages/engine/src/core/content.ts`, `buildRegistry`). Settings live in the buildings
pack because every pack that ships buildings depends on it.

A setting also names the culture and era tags its briefs draw from, each with its meaning,
so that buildings can be sliced by culture and era, and a misspelt tag is an issue rather
than a slice of one. Tags are content for the same reason kinds are: a setting from another
place and time brings its own.

A setting's standards say what every house of a settlement kind needs, so a requirement that
holds for a whole kind of place is written once, not repeated in every brief. A standard
applies to an answer whose brief stands in that kind and whose loot usage
(`packages/engine/src/core/loot.ts`, `UsageTagSchema`) includes the standard's, so a works
on a town lot is not held to a home's needs; usage is the engine's own word for what a
building is used as. See `packages/engine/src/core/schema/buildingBriefs.ts`,
`ServiceStandardSchema`.

## Brief

A brief references facts the engine already owns rather than restating them, so a change
to those facts cannot leave a brief silently describing something else. Every field has a
consumer: the fit check reads it, or it is free text for the author and BR's review. A field
with neither is cut. See `packages/engine/src/core/schema/buildingBriefs.ts`,
`BuildingBriefSchema`.

The fit check reads:

- **`setting`** names the world setting, so the brief's settlement kinds resolve.
- **`eligibility`** takes the shape an assembly's eligibility takes
  (`packages/engine/src/core/schema/templates.ts`, `BuildingEligibilitySchema`), so the
  check compares like with like: an answer must be admitted where the brief is meant to stand.
- **`plot`** is the envelope admission fits a footprint into
  (`packages/engine/src/core/settlementPools.ts`, `eligibilityExclusion`), so passing the
  brief and being admitted to a lot of that size cannot disagree.
- **`styles`** are map style ids (`packages/engine/src/core/schema/templates.ts`,
  `MapStyleSchema`), because a style is what decides materials; every slot choice and
  style an answer can build in must be among them.
- **`storeys`** is a range over the storeys an answer declares in `access.storeys`
  (`packages/engine/src/core/schema/templates.ts`, `TemplateAccessSchema`), not a height,
  because declared storeys are what the engine knows and checks. Cellar storeys are left out
  of the count, so a house over a cellar answers the brief its cellarless twin answers.
- **`program`** keys are room names, each a standing anchor the answer must carry
  (`packages/engine/src/core/schema/templates.ts`, `KitAnchorSchema`), so a room is a place a
  body can stand and walk to from the entrance, not a label. A **`cellar`** room is asked only
  of an answer that declares a storey below its ground storey, and stands on such a storey, so
  one brief answers every height of a type and a twist that adds a cellar adds its rooms
  without a new brief. So the first cellar of a house type starts in its brief: only a cellar
  room asks the fit check to reach the cellar and serve it, so a twin whose brief has none
  passes with its cellar unproven ([Cellar twins](#cellar-twins)).
- a room's **`serves`** lists the services the house must provide for it; see [Services](#services).

Validate resolves, but no fit rule reads, **`tags`**: names from the setting's tags, so
briefs can be sliced by culture and era.

Free text, read by the author and by BR on the contact sheet (`docs/building-sheet.md`),
which renders an assembly on the site of the look fixture start that places it:

- each room's **`purpose`**, because what a room is for steers its furnishing but no check
  can judge it;
- **`references`**, the real-world buildings the type is drawn from, because curation
  starts from references rather than invention;
- **`facade`**, the intended street face, which the contact sheet is judged against;
- **`cover`**, cover and sightlines, which stay BR's review: no static check can say
  whether a building plays well.

Briefs live beside the kits that answer them, so their styles resolve inside that pack's
dependencies; see `mods/skelly.deadvox.buildings/building-briefs.jsonnet` and
`mods/skelly.deadvox.scenario.gauntlet.city/building-briefs.jsonnet`.

An assembly names the brief it answers (`packages/engine/src/core/schema/templates.ts`,
`MapAssemblySchema`), not the reverse, so many buildings answer one brief and a mod adds an
answer without editing it. Hand-drawn templates carry no brief: they are the baseline a
briefed building is compared with.

Validate resolves a brief's setting, tags, settlement kinds, styles and services, a
standard's settlement kind and services, and an assembly's brief, then runs the fit check
below; see `packages/engine/src/core/buildingBriefs.ts`, `buildingBriefIssues`. Nothing the
game reads depends on a brief, so only validate runs these checks; see `docs/content.md`,
"Pack integrity".

Briefs and settings are ordinary content sections, so they load into the runtime registry
like every other section, although no runtime code reads them. A validate-only home
would need a second content class and loader beside the one boundary every section
already passes; a few short rows in the bundle cost less than that machinery. See
`packages/engine/src/core/schema/files.ts`, `SECTION_DESCRIPTOR`.

## Services

A building is plausible when the things its people needed are there and can be reached: a
toilet, somewhere to wash, a stove in a house; shelving in a stores. Checking that by eye on
every variant does not scale, so the requirement is written down and the fit check proves it;
the rest of the furnishing is still judged by eye.

A service is a content-named need, not an engine enum, so a setting from another era or
culture, or another product, can add its own without engine changes. Furniture declares the
services it provides (`packages/engine/src/core/schema/furniture.ts`, `ServicesSchema`), and
brief rooms and setting standards require them. A service resolves when some furniture serves
it, so a requirement nothing can satisfy is an issue at the brief, not a fit failure at every
answer. The services a brief can ask for are the ones shared furniture already serves, so a
brief is written against them; see `packages/mods/skelly.structures/structures-fixtures.jsonnet`
and `packages/mods/skelly.structures/structures-furniture.jsonnet`, `serves`.

A service means one thing: a fitting that serves it stands where a body walking in can reach
it. It never means the fitting works, holds stock or is connected, because the fit check
proves how a building was built, not what became of it or what runs in it. So a piece serves
whatever its condition: a damaged toilet still marks where the toilet was. The furniture that
does the job owns the label, and the label names the job, never a piece: shelves and crates
serve `storage` because stock is kept on and in them, while a wardrobe or a kitchen cupboard,
which has a container too, does not; a container is a fact of the piece, not the job a room
asks of it. Installed machinery joins the same way, with no second
mechanism: a generator that serves `generation` lets a plant hall's brief ask for a reachable
generator, and a broken one still passes, since whether it produces is the plant's
restoration, proved by its own owners (`test/partService.test.ts`).

Beds declare no service, because their `rest` already says they are slept in
(`packages/engine/src/core/schema/furniture.ts`, `FurnitureSchema`).

## Fit check

Validate proves that an assembly answers the brief it names, so the world constraints are
checked rather than eyeballed, and the contact sheet is left with what no check can read.
See `packages/engine/src/core/buildingBriefs.ts`, `buildingBriefIssues`.

A fit must hold for whatever a seed draws, so the check covers every alternative an answer
can be built as: every slot variant, and every style an outer pool or slot places it in.
Styles and pieces are read from the slot tree without compiling, so every variant is seen.
The entrance and program rules compile once per style and walk only reserved circulation
and doorways, because the slot contract keeps reserved cells, solid support, anchors and the
furniture standing in reserved cells equal across a slot's variants
(`packages/engine/src/core/templates.ts`, `resolveSlot`), and the doorway contract keeps
every doorway passable ([Doorways](#doorways)). A walk proven on one draw therefore holds
for every draw. Compiling every combination of variants instead would multiply with each
slot that offers a choice, past what validate can afford for the larger assemblies.

Each issue names its rule, the assembly, the brief and the slot choice that breaks it, so
the author can find the variant without replaying draws. The rules, cheap ones first:

- **plot**: the footprint and settlement kinds go through admission's own test, which fits the
  footprint the building takes with its declared front to the street, as a city row turns it
  (`packages/engine/src/core/settlementPools.ts`, `eligibilityExclusion` and `frontFacingTurn`);
  an authored lot admits at its own authored turn instead. Passing the brief and street-row
  admission of the plot's size cannot disagree; a lot that stands the building at another turn
  can still refuse it.
- **storeys**: the count of declared `access.storeys` from the ground storey up, because those
  are the storeys the engine knows, and a cellar is asked for by the brief's cellar rooms.
  Whether they are well formed stays with the map kit check
  (`packages/engine/src/core/templateSpatial.ts`, `templateStoreyIssues`).
- **styles**: every style a piece can be built in, through any slot variant, seam or styled
  outer ref, must be in the brief's set, because a style decides materials and any variant
  can be drawn.
- **doorways**: every alternative of a doorway slot leaves the doorway passable; see
  [Doorways](#doorways).
- **entrance**: a body walking from the entrance through reserved circulation and doorways
  must reach an opening on the building's declared front edge, because a city plan turns
  each building so that edge, not north, faces the street
  (`packages/engine/src/core/cityPlan.ts`, `fillRow` and `frontTurn`). The building's own
  `access.front` declares the edge; absent means north. One authority: the building owns
  its front, and neither a site nor a placement declares a competing one; placement only
  turns the declared front where it turned north before. The rule holds in the building's
  own frame, so it survives any turn a placement gives it. It is the footprint-edge test
  every template passes, narrowed to the front edge and to cells no variant can block
  (`packages/engine/src/core/templateSpatial.ts`, `templateEntranceEdges`). The walk
  proves the entrance opens on the front edge, not that a road reaches it: the local way
  below is what carries a body from the road.
- **approach**: the building type declares, on its own `access.approach`, whether its door
  gets a local way from the lot's road connection and of which kind, because what makes
  sense differs per type: a country house trods a dirt trail, a door on a slope needs
  steps, a door that meets the road needs nothing. `kind: 'trail'` rides the terrain's
  tracks, `kind: 'steps'` shapes the ground into half-metre treads rising to the door's
  own floor, and the `surface` and `widthMetres` are the type's content
  (`packages/engine/src/core/schema/templates.ts`, `ApproachSchema`). The way attaches at
  the front-edge opening the entrance walk reaches
  (`packages/engine/src/core/templateSpatial.ts`, `templateFrontOpening`) and runs to the
  first road along the front, placed by the lot and terrain path that already places the
  building — no parallel mechanism (`packages/engine/src/core/lotApproach.ts`,
  `layoutApproaches` and `cityLotWays`). No way is drawn where the door meets the road,
  where the front reaches no road, or where another building stands between, and validate
  rejects an approach whose surface no block provides or whose entrance reaches no
  front-edge opening.
- **program**: each room is a standing anchor that a body can walk to from the entrance,
  so a room is a place, not a label. The walk is the reserved-circulation proof map sites'
  walking routes use, widened by the doorways (`packages/engine/src/core/templateSpatial.ts`,
  `templateStandingRouteBeside`). Cellar rooms and their services count only for an answer
  with a cellar storey (`packages/engine/src/core/buildingBriefs.ts`, `carriedRooms`).
- **services**: every service the brief's rooms and the setting's applicable standards
  require has a serving piece that a body walking from the entrance can stand beside, in
  every draw (`packages/engine/src/core/buildingBriefs.ts`, `variantReach`). A piece hung from
  the ceiling counts from beneath instead, with only open cells between it and a body's head,
  because a light is used from under it, not beside it. A real kitchen
  reserves no floor in front of its cooker and sink, so the walk may leave reserved
  circulation for the open floor that the fixture's own variant leaves free in its slot's
  cells. Each variant is walked on its own, because floor one variant leaves open another may
  fill, and a walk over the floor every variant leaves somewhere would pass a fixture that
  some draw boxes in. The walk keeps to the fixture's own slot because another slot's
  variant could stand in the way; any cell another slot's furniture covers or stands on in
  any of its variants is never free, and a door outside a doorway slot is never free, since
  nothing proves a draw leaves it open. Doorway cells are always free. The fit check runs
  for every pack selection validate checks, so its cost must follow the distinct geometry, not the number of
  variants: each variant's walk extends one shared walk only where its own cells or
  furniture could change it (`packages/engine/src/core/templateSpatial.ts`,
  `templateDrawReaches`).
  Furniture is the one thing variants may change, so a draw keeps a service when a piece it
  always places serves it, or when one of its slots keeps it in every alternative. That proof
  is sound but not complete: it may fail a fixture a body could reach, never pass one it
  cannot, and two slots that between them always place a service fail it, so a required
  fixture belongs to one slot's variants.

One rule is proved by a test beside validate rather than by validate itself:

- **support**: an intact briefed building, set whole on natural ground, holds under the support
  rule, because support and collapse let any cell held up only by luck fall in a later cascade,
  so a building that stands only until something nearby breaks is not intact. The test stamps
  each answer as placement does and asks the production rule about every solid cell
  (`test/buildingSupport.test.ts`; `packages/engine/src/core/structureSupport.ts`,
  `createSupport`). The support rule reads only whether a block is solid and how far its
  material spans. A slot's alternatives must agree on which cells are solid
  (`packages/engine/src/core/templates.ts`, `resolveSlot`) but not on how far their materials
  span, so one draw proves nothing for the others. The test
  gives each solid cell the least span any alternative builds there, walking every alternative
  as the services rule does; a shorter span never lets more cells hold, so when that weakest
  building holds, every variant does. The proof is sound but not complete: it may fail a
  building whose weak cells no one draw combines, never pass one a draw drops. A style changes
  the blocks, so the test builds each style the answer is placed in, as the styles rule finds
  them. A slab or floor wider than its material spans needs
  something under it that stands, such as a wall, a column or a beam; a beam beside it in the
  same course does not, because a run only reaches a cell that stands, not one held sideways.
  A material's span is how far the real thing reaches, and a block's look is separate from its
  material. A modern storey floor is a reinforced-concrete slab that spans wall to wall, so it
  holds a room without columns or joists; its block may wear floorboards or bare concrete over
  that material. Honest material values keep one support rule, where props the real building
  lacks would bend the plan to a span it does not have.
  An answer known not to hold yet is skipped by name, citing the issue that tracks it. A skipped
  answer that holds, or that no pack declares, fails the test, so a skip ends with its fix.

What stays with BR's contact-sheet review:

- looks: the street face against `facade`, proportions, and how the materials read;
- the structural grid, since only slot positions and sizes modulo a module could be
  checked, which says little about the bay rhythm a viewer sees;
- cover and sightlines (`cover`);
- what each room is for, the furnishing beyond its required services, and which room a
  required fixture stands in: the services rule proves a fixture is reachable in the house,
  because rooms have no extent the check could test membership against;
- whether the street opening reads as the front door: the check proves a walk reaches the
  declared front edge, not that the door the facade shows is the one used;
- answers placed by layout sites rather than city plans, whose rotation the layout author
  chooses: the entrance rule reads the declared front in the building's own frame and says
  nothing about which way a layout turns that front.

## Doorways

A door is furniture, and furniture claims its cell, so a door cell cannot be reserved
(`packages/engine/src/core/templateOwnership.ts`, `compileOwnership`). Walking reserved
cells alone, the fit check would join every room to the street through open doorways, and
no briefed house could have a door to shut. So a slot may declare itself a `doorway`; the
fit check then holds every alternative of that slot to keeping the way through it, and
the walks cross its cells (`packages/engine/src/core/schema/templates.ts`, `KitSlotSchema`,
and `packages/engine/src/core/buildingBriefs.ts`, `doorwayBlock`). The declaration sits on
the slot, not the door, because the slot is what a draw varies: the proof is about every
alternative, not one leaf.

A run-down house may have lost a door or had one broken in, so a doorway may hold a leaf
or nothing, and either keeps the way open. A broken leaf is a state of play, not of
content, and it stands open (`DESIGN.md`, "Breach by strength"), so content draws a broken
door as the missing alternative. An alternative closes the way, and is a doorways issue,
when it holds any furniture but a door leaf, when it holds a solid block, or when it leaves
a cell unclaimed, which another slot could build into. A closed alternative's cells still
count for the walks, so its fault is reported once, as the doorway it is, and not again as
every walk it cuts.

A locked or boarded leaf passes. The fit check proves how the house was built, not what has
become of it, as a damaged fixture still serves its service. A lock is the door in its
working use, and a key or forcing opens it. Boards are state on a real leaf, and blows
break that leaf open with its boards on (`docs/aftermath.md`, "Door variants"), so boarding
makes the way cost time and noise without closing it, and a boarded house can still answer
a brief. Furniture or a wall in the doorway leaves no such way through.

## Shared pieces

A building hangs the doors, windows and fittings a shared pack already ships before it
defines its own. A private copy stops following the shared piece when that piece is tuned,
so two houses would break, sound and open differently for no reason a player can see, and
every later building would repeat the copy. When nothing shared fits, the missing piece is
added to the shared pack, so the next building finds it there; a building defines only the
parts its own design needs. Doors, windows and fittings are furniture, so what a building
defines is the small piece that places one in its wall, sized to the opening and facing its
side, while the leaf, glass or fixture stays shared. See
`packages/mods/skelly.structures/windows.jsonnet`, `casement`, and
`packages/mods/skelly.structures/structures-fixtures.jsonnet`, `toilet`.

Window bays repeat that small piece in every house, so one helper builds them: a building
names its bays and the wall each faces, and every bay draws the same shared window whole,
broken or boarded over. The piece takes its size from the window, so a bay cannot disagree with
the glass it holds, and the boarded window's reasons live with the door variants'
(`docs/aftermath.md`, "Window variants"). See `tools/jsonnet/lib/window-slots.libsonnet`. A townhouse storey's walls are an
assembly that carries its own bays, so a house that moves or swaps a storey's walls, as the
cellar houses do, keeps its windows with them; see
`mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-variants.libsonnet`, `withCellar`.

## Cellar twins

A house over a cellar is a twin of its type, built from the cellarless house and answering
the same brief, so a cellar is a find within a type rather than a type of its own, and the
twin cannot drift from its house. The townhouses and the rural houses each build theirs; see
`mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-variants.libsonnet`, `withCellar`,
and `mods/skelly.deadvox.buildings/rural-house.jsonnet`, `withCellar`. A twin must:

- **Have a cellar room in its brief** before the twin is built, or the fit check never walks
  the cellar ([Brief](#brief)).
- **Raise every part above the footing by the cellar's depth**, so each storey keeps its
  layout, door, windows and services, and every slot keeps its place against the others. The
  depth is the fitted corner's height and the ceiling over it, so every briefed cellar takes
  the shared corner whole; see `tools/jsonnet/lib/cellar-plant.libsonnet`.
- **Stand the cellar on a footing and keep a floor over it.** Anchors need solid support, so
  the cellar needs a floor at the bottom, either the house's ground slot left in place or a
  footing of the cellar walls' own, and the street storey still needs a floor to stand on, over
  the cellar.
- **Raise the anchors and the entrance with the parts.** Left behind, they would stand in the
  cellar or its walls, and the entrance rule walks only the ground storey.
- **Declare the cellar as the lowest storey and keep `access.ground` on the street storey.** The
  fit check counts storeys from the ground storey up and takes any declared storey below it as a
  cellar (`packages/engine/src/core/buildingBriefs.ts`, `cellarFloors`), and placement sets the
  ground storey at the site's ground (`packages/engine/src/core/authoredPlacement.ts`,
  `placementOf`), so the twin stands at its house's street level with the cellar sunk below.
- **Add a standing anchor named for the brief's cellar room** on the cellar floor, because a
  room is an anchor the program walk reaches from the entrance.
- **Reach the cellar from the walk**, by a stair inside or an area stair from a yard, through
  reserved circulation and doorways, since the walks cross nothing else. Which one depends on
  the plot: a house that fills its lot has no yard for an area stair.

A twin's pool rows take their weight out of its house's rows, so the type's share of the
street, and of each storey count, holds while cellars become common enough to find. Each pool
states its own share beside its rows.

## Iterating on a building

While iterating on one building, name its pack to validate with `--pack`, so each try pays for
that selection alone rather than every opt-in; see `src/cli/validate.ts`, `validate`, and
`docs/pack-split.md`, "Layers".

A fit fault, such as a standing anchor without room to stand, a door without clearance or a port
whose mouth is blocked, is an authoring check: validate reports it at its own path and the file
stays loaded; see `docs/content.md`, "Pack integrity". A fault the registry build finds, such
as a reference that does not resolve, a piece or assembly that does not compile (a nesting cycle,
a seam that cannot mate) or stock naming an unknown item, drops that whole file
(`packages/engine/src/core/content.ts`, `buildRegistry`). Every building, piece and style the file
defined then goes missing at once, so validate reports the one fault many times over: each brief
style, pool row, ask or nested slot elsewhere that named one of them fails as a missing reference.
The root is the issue whose path points into a definition of the dropped file itself, rather than
at an id it cannot find. Fix that one and validate again before reading the rest.

## Worked example: detached town house

The detached town house proves the pathway end to end: a brief written from references,
and one curated answer that validate admits. See
`mods/skelly.deadvox.scenario.gauntlet.city/building-briefs.jsonnet`, `detached_town_house`,
and `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-villa.libsonnet`.

- **The plot is a city lot.** The brief's plot is the size of the gauntlet city's lots, so
  an answer that passes the plot rule fits any of them. A detached house with a front garden
  on that lot has small rooms; a larger brief needs a larger lot.
- **Both brief styles are placed by name.** The fit check only proves styles that some pool,
  slot, layout or ask places, so the city pool and the look fixture's site each name the
  answer once per style; a style the brief allows but nothing places would pass unproven.
  The fixture is an opt-in pack, and validate checks every opt-in on top of the defaults, so
  its placements are proven as the pool's are; see `src/cli/validate.ts`, `validate`.
- **A villa is the exception on a city street.** The gauntlet city is a terraced inner
  district, so the townhouses stay its common case and a detached house with a front garden
  is a find among them, not the street's pattern. Its pool rows weigh it low against the
  townhouse rows, still enough that a player meets it in most runs; see
  `mods/skelly.deadvox.scenario.gauntlet.city/scenarios.jsonnet`, `mapPools`.
- **The street is a standing place.** The garden path at the gate is a `street` anchor, as
  each townhouse's front step is, so the city route check walks from the street through the
  front doorway and back for every draw; see `test/cityKitRoutes.test.ts`.
- **Every doorway is a doorway slot.** The front door, the kitchen, the bathroom and both
  bedrooms each hang a leaf that may be gone, so the walks cross them
  ([Doorways](#doorways)).
- **Every variable part is a slot of the same claim.** Garden, furnished rooms, windows and
  roof each offer variants that claim the same cells and leave reserved circulation alone, so
  one compile proves every draw (`packages/engine/src/core/templates.ts`, `resolveSlot`).
  Furniture stands outside reserved cells, where variants may differ freely.
- **The roof parapet is furniture.** The flush-roof rule's waist-high wall on some edges is
  drawn as parapet furniture, not blocks, so the walled and the bare roof keep the same block
  solidity and stay variants of one slot.
- **The roof is covered.** Outer walls and partitions rise through the roof deck, so a
  covering course over the deck hides their tops and the roof reads as one surface; see
  `docs/content.md`, "Authored structures and sites". The covering is part of the roof
  piece, so each roof variant chooses its own under the same claim.
- **Ownership comes from the layer marks.** Each mark also states its claim, so a piece's
  literal layers and its ownership cannot disagree, and the curated geometry stays literal
  (`docs/jsonnet.md`, "Curated map features"). The claims are the engine's
  (`packages/engine/src/core/schema/templates.ts`, `OwnershipSchema`), but the marks are keys
  of a piece's own palette, so a file picks marks that read well in its plans and maps them to
  claims in a helper beside them. The same mark can claim differently in two files, or in two
  helpers of one file, and a mark can mean another claim than the claim spelt with the same
  character, so read the helper and its comment before copying layers into another piece.
- **Compared through its look fixture.** The city scatters the house among other buildings,
  so the look fixture's own street sets both styles side by side, fronts to the street, for
  one walk to compare them; see
  `mods/skelly.deadvox.scenario.buildings.town-house-look/layouts.jsonnet` and
  `docs/content.md`, "Curated kits". Its city-only eligibility does not bar that: admission
  tests a pool lot or an ask, while a layout building stands where its author puts it
  (`packages/engine/src/core/authoredLayout.ts`, `authoredLayoutIssues`). A layout places
  buildings in metres while pieces and assemblies count half-metre blocks
  (`packages/engine/src/core/schema/layouts.ts`, `LayoutBuilding`, and
  `packages/engine/src/core/scale.ts`, `BLOCK_SIZE`), and it sets a building's ground storey
  at the height given, so a cellar twin goes at its house's height
  (`packages/engine/src/core/authoredPlacement.ts`, `placementOf`).

## Worked example: city townhouse

The city townhouses answer one brief across their heights, with or without a cellar, so the
city pool's commonest building meets the same rules as the villa. See
`mods/skelly.deadvox.scenario.gauntlet.city/building-briefs.jsonnet`, `city_townhouse`, and
`mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-services.libsonnet`.

- **One brief, every height.** The brief's storey range spans the one-, two- and three-storey
  kinds, and each kind has a twin over a cellar, so a twist that adds a storey or a cellar
  answers the same brief rather than a new one.
- **The cellar stair shares the stairwell.** Each kind's twin is built as
  [Cellar twins](#cellar-twins) says. The cellar flight climbs under the house flight in one
  stairwell, because every other band of the plan is a room, the lane or the services; the
  house flight over it is open treads, so a body on the cellar flight keeps its headroom. Where
  no house flight rises, the stairwell stays reserved air. Each height draws its twin as a
  share of its own rows; see `mods/skelly.deadvox.scenario.gauntlet.city/scenarios.jsonnet`,
  `mapPools`.
- **The services sit on the storey a body enters by.** Kitchen and bathroom are fixed slots in
  the back east corner of that storey, so the walk from the street door reaches them in every
  kind; over a cellar they rise with the street storey. The room scenes keep out of
  that corner, which their own check guards, so no scene's furniture blocks the walk to a
  fixture.
- **A cellar keeps the house's plant and stores.** The brief's cellar room asks its services
  of every cellar twin. Its fitted corner is a fixed slot under the kitchen, which the cellar's
  scenes leave free as the storey above leaves the kitchen's, and the rest of the cellar
  stays a scene slot, so a twist can furnish it without touching the plant. The corner and
  its stores' table are shared with every briefed cellar, so a cellar reads the same in town
  and country; see `tools/jsonnet/lib/cellar-plant.libsonnet`. The shelves draw from a cellar
  table of their own, because a cellar holds what a house puts by, not what its kitchen
  cupboard does. The secret house inherits the corner, which stays clear of its hatch.
- **The bathroom door is a doorway slot.** It is the house's one closed room, so its leaf may
  be gone like the street door's ([Doorways](#doorways)).
- **The roof drains on its open side.** A gutter runs along the eave the ladder stands on and
  a downspout drops each corner of that wall; every storey's walls carry the pipe, so a house
  of any height drains to its footing. The walled roof stays felt, as the semi-walled rule
  says.
- **The secret cellar house answers no brief.** It is the scenario's one-off stash, placed
  once and in brick only, not a pathway building.
- **Seen through its look fixture.** The fixture's two streets set every kind in each style,
  fronts to the street, so the fit check proves both styles of each and one walk compares
  them; see `mods/skelly.deadvox.scenario.buildings.townhouse-look/layouts.jsonnet`.

## Worked example: rural flat-roof house

A one-storey rendered house on a country road, answering its own brief; see
`mods/skelly.deadvox.buildings/building-briefs.jsonnet`, `rural_flat_roof_house`, and
`mods/skelly.deadvox.buildings/rural-house.jsonnet`. It shows where the pathway bends
the design, so the next author meets those bends on purpose.

**Brief before kit.** The references come first and the brief's styles, storeys and
program are written from them, because the fit check holds the kit to the brief, not the
other way round. The setting's building culture already names flat roofs behind parapets,
so the house needs no new setting.

**One storey.** The references are low houses, and one declared storey keeps every program
room on the ground floor the entrance walk starts from.

**A cellar from the yard.** Each house has a cellar twin ([Cellar twins](#cellar-twins)),
entered by an area stair sunk along the back wall, not through the floor, because the
references reach a country cellar from the yard. The walk from the porch crosses the kitchen
to the back door and down the stair, so the kitchen keeps that lane clear in every house. Its
fitted corner and stores are the town cellar's, shared rather than copied; see
`tools/jsonnet/lib/cellar-plant.libsonnet`. The cellar door, room and corner are slots, so a
twist can restock the cellar or reach it another way.

**Doors on the routes.** Every doorway is a doorway slot ([Doorways](#doorways)): solid
wood at the front and back, flimsy leaves inside, any of them possibly gone. The entrance
stands one row inside the front door, because an entrance needs a reserved body and the
doorway's cells belong to its slot.

**Walls one block in.** The cornice slab runs one block past the walls on every side, and
the walls stand one block in from the assembly's edge, so the overhang lies inside the size
that plot and lot checks measure; see `docs/content.md`, "Authored structures and sites".

**Covering inside the parapet.** The roofing course lies inside the parapet ring, on the
slab, so the cornice and parapet keep the facade's line while the roof gets the same
covering as any briefed roof.

**Material variety as style.** The boarded entrance bay is a second style over the same
shell piece, not a second piece, because a style changes blocks and nothing else, so the
slot contract holds by construction. Both styles are in the brief, since any draw may use
either. Each door is its own slot, so its leaf can be missing without touching the
shell's ownership.

**Placed by a site, not a city.** No city plan runs rural, so the house reaches the world
through a site, on its plot (below), and its eligibility passes the same admission test a
city lot applies. The look fixture sets the bare house beside `small_house`, the hand-drawn
baseline it is judged against, and each house's cellar twin behind them; see
`mods/skelly.deadvox.scenario.buildings.rural-house-look/layouts.jsonnet`.

**The entrance rule's turn.** Holdout and the look fixture turn the house by their own
rules, not by a city plan's, so which way its declared front faces the road is the
author's placement there, not something the fit check proves: the rule only holds the
entrance to the front edge in the house's own frame, whatever turn a placement gives it.

## Worked example: rural plot

The rural flat-roof house stands on a plot with its yard's outbuildings, because a country
house without its privy, woodshed and well is not what the setting's villages looked like.
See `mods/skelly.deadvox.buildings/rural-plot.jsonnet` and
`mods/skelly.deadvox.buildings/outbuildings.jsonnet`.

**Every plot has a toilet.** Indoor toilets are mostly a town comfort in the setting, so
about nine rural houses in ten have an outhouse instead. The tenth is a house modernised
with an indoor WC, because a household with neither is not one the setting's villages had.
Every plot answers one brief, and its `toilet` room serving `toilet` holds each plot to
one, the privy or the WC, under the program and services rules like any room. The
requirement belongs to the plot's brief, not to a rural standard: a standard holds every
residential answer standing in its kind, so it would also fail the bare house and the
cottage, whose toilet, where they have one, is the privy their plot sets beside them.

**Prevalence lives in a pool.** The slot contract keeps a slot's claim equal across its
alternatives (`packages/engine/src/core/templates.ts`, `resolveSlot`), so a slot cannot hold
an outhouse in one draw and bare ground in the next. Each combination of outhouse and garage
is its own plot assembly from one constructor, and the `rural_plots` pool owns how often each
is drawn. A plot without an outhouse sets the WC house in place of the bare one, so one brief
states the fit every plot must prove. Holdout asks for the pool, not a plot; see
`mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `rural_plot`.

**The WC house is its own assembly.** The WC is a room its brief requires, and a slot keeps
its claims and the anchors over them equal across its alternatives, so a variant could not
add the room in only some draws. The WC house is a second assembly from the house's
constructor with its own brief, sharing the front, the outer walls and the roof and
differing in how the back is divided: the bedroom gives up a bed and the kitchen its table
for a WC between them, behind its own doorway slot. See
`mods/skelly.deadvox.buildings/rural-house.jsonnet`, `plans`.

**The house is a nested slot.** The plot places the house assembly whole, so the house keeps
its own fit against its own brief, and the plot's brief restates the house's rooms because
the fit check reads only the plot's anchors.

**A trodden path is the walk.** The program and services rules walk reserved air from the
entrance, so a dirt path claimed as support under reserved air joins the porch to every
outbuilding; the yard around it stays the terrain's.

**Outbuildings answer their own briefs.** The garage, the woodshed and the privy are assemblies
in the buildings pack every house pack already depends on, each answering a brief of its own
(`mods/skelly.deadvox.buildings/building-briefs.jsonnet`, `rural_garage`, `rural_woodshed` and
`rural_privy`), so any yard can set one and its fit is proven where it is defined, not only
inside this plot, whose brief reads only the plot's own anchors. The woodshed's room asks for
`firewood`, which the log pile serves, rather than `storage`: the pile is the fuel stock itself,
not a place stock is kept on or in, and a later fuel or heat consumer can read the fuel by its own
name ([Services](#services)). The well and the coop's site stay plain pieces, with no room a body
uses.

**Always there or drawn.** The well, the woodshed and the coop's site stand on every plot,
since nearly every yard had them; the outhouse, the garage and the cellar vary with the pool.
Each kind of plot has a twin whose house stands over a cellar, drawn as a share of that kind's
rows, so the mix of yards holds ([Cellar twins](#cellar-twins)). The plot's brief carries the
cellar room for the same reason the house's does.

**The coop waits for its model.** The chicken coop will be an authored model that BR
approves, so its slot claims nothing and the yard shows through until then.

**The privy brings its stoop.** The privy's doorway slot travels with it to any yard
([Doorways](#doorways)). Its seat fills the floor behind the door, which leaves no reserved
cell inside to stand in, so the privy carries a trodden stoop before its door, where its
entrance and its toilet room stand, and the services walk crosses the doorway to the seat. A
yard that sets it ends its path at the stoop rather than under it.

**Seen through its look fixture.** Every plot the pool can draw stands along two roads, each
plot's cellar twin behind it, so one walk compares them; see `mods/skelly.deadvox.scenario.buildings.rural-plot-look/layouts.jsonnet`.

## Worked example: works stores

A one-room brick stores beside a works, answering its own brief; see
`mods/skelly.deadvox.buildings/building-briefs.jsonnet`, `works_stores`, and
`mods/skelly.deadvox.buildings/works-stores.libsonnet`. Holdout's plant stores are its first
answer; see `mods/skelly.deadvox.scenario.holdout/holdout-plant.libsonnet`, `stores`.

**A stores is its own brief.** A plant hall and its stores have different programs, a machine
room and a racked store, so each gets its own brief and changes to one stay local; a shared
hall brief would prove neither was a plant or a stores.

**The brief knows no scenario.** Its rooms are the racked floor and the aisle to it, and its one
service is `storage` ([Services](#services)), so any scenario's stores can answer it. What the
racks hold is the answer's, not the brief's: a fit check cannot prove that a stock repairs
anything, and the brief would otherwise carry one scenario's machinery into every other.

**The kit is shared, the stock is the scenario's.** The buildings pack ships the brief, the
shell, the door and the constructor; a scenario adds its answer by racking the room with its
own piece, so its supplies keep the owners and the exact pieces they had, and the next works
reuses the shell rather than drawing one. Holdout's racking keeps its spares, its inputs and
tools and its crate of spares where they were, on the same furniture with the same loot.

**Usage is the answer's.** The answer is looted as Industrial, so the setting's standards for
homes do not apply to it ([World settings](#world-settings)); the brief has no usage of its own,
because standards read the answer's.

**The slab bears on steel joists.** The room is wider than a concrete slab spans, so two steel
joists under the slab run from the front wall to the back wall, either side of the aisle, as in
a works store of the period, and every slab cell is within its span of a joist or a wall
([Fit check](#fit-check), support). The joists span the shorter way, within what steel spans,
and they keep above the racking, clear of the aisle and the racks.

**Headroom above the racking.** A room racked up to its joists reads as cramped, so the shell
keeps a clear course between the racks and the joists; see
`mods/skelly.deadvox.buildings/works-stores.libsonnet`, `shellLayers`.

**North front.** The door opens north, so the entrance rule holds as it does for a city
building; Holdout turns the stores by its own placement, so which way the door faces there is
the look fixture's to show, not something the fit check proves.

**Seen through its look fixture.** Holdout's stores stand beside the hand-drawn stores they
replaced, both stocked with their doors the same way, and the player starts inside the new
stores' door under the joists, so one look shows the support and a step outside compares them; see
`mods/skelly.deadvox.scenario.holdout.stores-look/layouts.jsonnet`.

## Worked example: village shop

A two-storey village shop with the shopkeeper's flat above, built from box-shape pieces:
each slot fills a box of the assembly with a literal piece, and the slot tree is the whole
building. See `mods/skelly.deadvox.buildings/building-briefs.jsonnet`, `village_shop`, and
`mods/skelly.deadvox.buildings/village-shop.jsonnet`.

**One entrance reaches both halves.** The shop and the flat each have a door on the road,
but the fit check walks from one entrance, so the flat's hall opens into the store room
behind the shop. Without that door the shop's rooms would be unreachable to the proof even
though a player could walk in from the street.

**The stair is reserved air over treads.** The walks climb one block a step through
reserved air, as a body does, so block treads with reserved air above them carry the proof
upstairs with no declared flight. A climbing body's head passes the upper floor long before
its feet reach it, and the body spans more than one tread as it steps up, so the upper floor
and the wall over the stair stay open over most of the run, not only above the top tread; see `packages/engine/src/core/templateSpatial.ts`, `canMove`, and
`packages/engine/src/core/stairFlight.ts`, `STAIR_BODY_HEIGHT`. The detached town house's
stair is the same; see `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-villa.libsonnet`.

**Bearing below the decks.** The floor over the shop and the flat's roof need a plausible
load path, not a higher material span to excuse unsupported centres. The sales floor stays open
rather than gaining a dividing wall, and circulation and furnishing keep their headroom; see
`mods/skelly.deadvox.buildings/village-shop.jsonnet`, `shop`, `living` and `kitchen`.

**The shopfront is the shared hinged window.** A shop reads from the road by its broad
display window and the fascia board over it, so the street face says shop without a sign
model; the shared pack's hinged window is shopfront sized, and the fascia is trim in the
shell.

**A shop is still a home to loot.** The engine's loot usage has no retail kind
(`packages/engine/src/core/loot.ts`, `UsageTagSchema`), so the shop is looted as a
residence and its stock comes from the loot tables its shelves name. Setting standards
key on usage, so a retail usage would also decide which standards a shop meets; that
waits on a usage the engine does not have.

**The counter is the kitchen counter.** No shared shop counter exists yet, so the shop
uses the kitchen counter, which reads close enough on the sheet; a shop counter belongs in
the shared pack when a model is drawn for it ([Shared pieces](#shared-pieces)).

**Seen through its look fixtures.** No settlement pool names `village_shop`, so its look
fixtures are the only places it appears: `skelly.deadvox.scenario.buildings.village-shop-look`
and `skelly.deadvox.scenario.buildings.misc-support-look`. The dedicated fixture compares it
with the hand-drawn baseline; see
`mods/skelly.deadvox.scenario.buildings.village-shop-look/layouts.jsonnet`.

## Support comparison fixtures

Condition and boarding checks must not depend on an unsupported shell: a later collapse would
hide the condition or the door and window response the fixture exists to show. The pavilion's
condition variants therefore share one bearing frame, while the boarded-door and boarded-window
houses share a calm room's frame without changing their selected leaves or panes; see
`mods/skelly.deadvox.scenario.buildings.assembly-condition-look/buildings.jsonnet`, `shell`, and
`tools/jsonnet/lib/boarded-look-support.libsonnet`.

The combined support look puts the pavilion beside the shop so bearing can be judged without
setting up another world; see `mods/skelly.deadvox.scenario.buildings.misc-support-look/layouts.jsonnet`.
