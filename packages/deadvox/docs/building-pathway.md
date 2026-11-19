---
read_if:
  - you design or curate a building type, or write a building brief
  - you add or change a world setting, or the settlement kinds a setting has
  - you change the brief schema, an assembly's `brief`, or how validate resolves briefs
  - you build or change the fit check between an assembly and its brief
  - you add or change a service, a furniture `serves`, a setting standard or a brief's tags
  - you want a worked example of a brief and the curated assembly that answers it
  - you set a house on a plot with outbuildings, or decide how often a site draws each variant
  - a building needs a door, window or fitting, and you decide whether it is shared or its own
  - you hang a door on a briefed building's walk, or decide what a doorway slot may hold
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
  because declared storeys are what the engine knows and checks.
- **`program`** keys are room names, each a standing anchor the answer must carry
  (`packages/engine/src/core/schema/templates.ts`, `KitAnchorSchema`), so a room is a place a
  body can stand and walk to from the entrance, not a label.
- a room's **`serves`** lists the services the house must provide for it; see `building-pathway.md`, "Services".

Validate resolves, but no fit rule reads, **`tags`**: names from the setting's tags, so
briefs can be sliced by culture and era.

Free text, read by the author and by BR on the contact sheet:

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
standard's settlement kind and services, and an assembly's brief, with the other
cross-reference checks, then runs the fit check below; see
`packages/engine/src/core/buildingBriefs.ts`, `buildingBriefIssues`.

## Services

A house is plausible when the things its people needed are there and can be reached: a
toilet, somewhere to wash, a stove. Checking that by eye on every variant does not scale, so
the requirement is written down and the fit check proves it; the rest of the furnishing is
still judged by eye.

A service is a content-named need, not an engine enum, so a setting from another era or
culture can add its own without engine changes. Furniture declares the services it provides
(`packages/engine/src/core/schema/furniture.ts`, `ServicesSchema`), and brief rooms and
setting standards require them. A service resolves when some furniture serves it, so a
requirement nothing can satisfy is an issue at the brief, not a fit failure at every answer.

A piece serves whatever its condition, because a damaged toilet still marks where the
toilet was, and the house's plausibility is about how it was built, not what became of it.

Beds declare no service, because their `rest` already says they are slept in
(`packages/engine/src/core/schema/furniture.ts`, `FurnitureSchema`).

Briefs and settings are ordinary content sections, so they load into the runtime registry
like every other section, although no runtime code reads them. A validate-only home
would need a second content class and loader beside the one boundary every section
already passes; a few short rows in the bundle cost less than that machinery. See
`packages/engine/src/core/schema/files.ts`, `SECTION_DESCRIPTOR`.

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
for every draw. Compiling every
combination of variants instead would multiply with each slot that offers a choice, past
what validate can afford for the larger assemblies.

Each issue names its rule, the assembly, the brief and the slot choice that breaks it, so
the author can find the variant without replaying draws. The rules, cheap ones first:

- **plot**: the footprint and settlement kinds go through admission's own test
  (`packages/engine/src/core/settlementPools.ts`, `eligibilityExclusion`), so passing the
  brief and being admitted to a lot of the plot's size cannot disagree.
- **storeys**: the count of declared `access.storeys`, because those are the storeys the
  engine knows. Whether they are well formed stays with the map kit check
  (`packages/engine/src/core/templateSpatial.ts`, `templateStoreyIssues`).
- **styles**: every style a piece can be built in, through any slot variant, seam or styled
  outer ref, must be in the brief's set, because a style decides materials and any variant
  can be drawn.
- **doorways**: every alternative of a doorway slot leaves the doorway passable; see
  [Doorways](#doorways).
- **entrance**: a body walking from the entrance through reserved circulation and doorways
  must reach the ground storey's north edge, because a city plan turns each building so that
  its north edge at turn 0 faces the street (`packages/engine/src/core/cityPlan.ts`,
  `fillRow` and `SIDES`). It is the footprint-edge test every template passes, narrowed to
  the street side and to cells no variant can block
  (`packages/engine/src/core/templateSpatial.ts`, `templateEntranceEdges`).
- **program**: each room is a standing anchor that a body can walk to from the entrance,
  so a room is a place, not a label. The walk is the reserved-circulation proof map sites'
  walking routes use, widened by the doorways (`packages/engine/src/core/templateSpatial.ts`,
  `templateStandingRouteBeside`).
- **services**: every service the brief's rooms and the setting's applicable standards
  require has a serving piece that a body walking from the entrance can stand beside, in
  every draw (`packages/engine/src/core/buildingBriefs.ts`, `variantReach`). A real kitchen
  reserves no floor in front of its cooker and sink, so the walk may leave reserved
  circulation for the open floor that the fixture's own variant leaves free in its slot's
  cells. Each variant is walked on its own, because floor one variant leaves open another may
  fill, and a walk over the floor every variant leaves somewhere would pass a fixture that
  some draw boxes in. The walk keeps to the fixture's own slot because another slot's
  variant could stand in the way; any cell another slot's furniture covers or stands on in
  any of its variants is never free, and a door outside a doorway slot is never free, since
  nothing proves a draw leaves it open. Doorway cells are always free.
  Furniture is the one thing variants may change, so a draw keeps a service when a piece it
  always places serves it, or when one of its slots keeps it in every alternative. That proof
  is sound but not complete: it may fail a fixture a body could reach, never pass one it
  cannot, and two slots that between them always place a service fail it, so a required
  fixture belongs to one slot's variants.

What stays with BR's contact-sheet review:

- looks: the street face against `facade`, proportions, and how the materials read;
- the structural grid, since only slot positions and sizes modulo a module could be
  checked, which says little about the bay rhythm a viewer sees;
- cover and sightlines (`cover`);
- what each room is for, the furnishing beyond its required services, and which room a
  required fixture stands in: the services rule proves a fixture is reachable in the house,
  because rooms have no extent the check could test membership against;
- whether the street opening reads as the front door: the check proves a walk reaches the
  street edge, not that the door the facade shows is the one used;
- answers placed by layout sites rather than city plans, whose street side the layout
  decides: the entrance rule assumes the city plan's turn.

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
when its leaf is boarded or barred, when it holds any other furniture or a solid block, or
when it leaves a cell unclaimed, which another slot could build into. A closed alternative's
cells still count for the walks, so its fault is reported once, as the doorway it is, and
not again as every walk it cuts.

A locked leaf passes. The fit check proves how the house was built, not what has become of
it, as a damaged fixture still serves its service. A lock is the door in its working use,
and a key or forcing opens it. Boards take the doorway out of use, and that is the line BR
drew: a missing door passes, a boarded or blocked one does not.

## Shared pieces

A building hangs the doors, windows and fittings a shared pack already ships before it
defines its own. A private copy stops following the shared piece when that piece is tuned,
so two houses would break, sound and open differently for no reason a player can see, and
every later building would repeat the copy. When nothing shared fits, the missing piece is
added to the shared pack, so the next building finds it there; a building defines only the
parts its own design needs. See `packages/mods/skelly.structures/windows.jsonnet`, `casement`.

## Worked example: detached town house

The detached town house proves the pathway end to end: a brief written from references,
and one curated answer that validate admits. See
`mods/skelly.deadvox.scenario.gauntlet.city/building-briefs.jsonnet`, `detached_town_house`,
and `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-villa.libsonnet`.

- **The plot is a city lot.** The brief's plot is the size of the gauntlet city's lots, so
  an answer that passes the plot rule fits any of them. An eight by six metre house on that
  lot leaves small rooms; a larger brief needs a larger lot.
- **Both brief styles are placed by name.** The fit check only proves styles that some pool,
  slot, layout or ask places, so the look fixture's site names the answer once per style; a
  style the brief allows but nothing places would pass unproven. The fixture is an opt-in
  pack, and validate checks every opt-in on top of the defaults, so a building that only a
  fixture places is proven as one in a city pool is; see `src/cli/validate.ts`, `validate`.
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
  (`docs/jsonnet.md`, "Curated map features").
- **Seen only through its look fixture.** The house stands in no city pool, so the one place
  it appears is the look fixture's own street, which sets both styles side by side, fronts to
  the street; see `mods/skelly.deadvox.scenario.buildings.town-house-look/layouts.jsonnet`
  and `docs/content.md`, "Curated kits". Its city-only eligibility does not bar that: admission
  tests a pool lot or an ask, while a layout building stands where its author puts it
  (`packages/engine/src/core/authoredLayout.ts`, `authoredLayoutIssues`).

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
baseline it is judged against; see
`mods/skelly.deadvox.scenario.buildings.rural-house-look/layouts.jsonnet`.

**The entrance rule's turn.** Holdout and the look fixture turn the house by their own
rules, not by a city plan's, so its north edge facing the road is the author's placement
there, not something the fit check proves.

## Worked example: rural plot

The rural flat-roof house stands on a plot with its yard's outbuildings, because a country
house without its privy, woodshed and well is not what the setting's villages looked like.
See `mods/skelly.deadvox.buildings/rural-plot.jsonnet` and
`mods/skelly.deadvox.buildings/outbuildings.jsonnet`.

**The outhouse is the toilet.** Indoor toilets are mostly a town comfort in the setting, so
about nine rural houses in ten have an outhouse instead. The setting's standards require no
toilet outside the city, so the plot's brief asks for one itself: a `privy` room serving
`toilet`, which puts the outhouse under the program and services rules like any room.

**Prevalence lives in a pool.** The slot contract keeps a slot's claim equal across its
alternatives (`packages/engine/src/core/templates.ts`, `resolveSlot`), so a slot cannot hold
an outhouse in one draw and bare ground in the next. Each combination of outhouse and garage
is its own plot assembly from one constructor, and the `rural_plots` pool owns how often each
is drawn. The plots without an outhouse answer a brief without the privy room, so each brief
states the fit its plots must prove. Holdout asks for the pool, not a plot; see
`mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `rural_plot`.

**The house is a nested slot.** The plot places the house assembly whole, so the house keeps
its own fit against its own brief, and the plot's brief restates the house's rooms because
the fit check reads only the plot's anchors.

**A trodden path is the walk.** The program and services rules walk reserved air from the
entrance, so a dirt path claimed as support under reserved air joins the porch to every
outbuilding; the yard around it stays the terrain's.

**Outbuildings are shared.** The outbuildings are box-shape pieces in the buildings pack every
house pack already depends on, so the next plot reuses them rather than drawing its own; the
log pile is shared furniture beside the other fittings.

**Always there or drawn.** The well, the woodshed and the coop's site stand on every plot,
since nearly every yard had them; the outhouse and the garage vary with the pool.

**The coop waits for its model.** The chicken coop will be an authored model that BR
approves, so its slot claims nothing and the yard shows through until then.

**The outhouse has a door.** The outhouse is a small assembly, so its doorway slot travels
with it to any plot ([Doorways](#doorways)). Its seat fills the floor behind the door, which
leaves no reserved cell inside to stand in, so the privy's anchor stands on the path at the
door, and the services walk crosses the doorway to the seat.

**The plots without an outhouse have no toilet.** Their tenth stands for the houses with an
indoor bathroom, which waits on a bathroom variant of the house; whether that share stays
without one is BR's call.

**Seen through its look fixture.** Every plot the pool can draw stands along one road, so one
walk compares them; see `mods/skelly.deadvox.scenario.buildings.rural-plot-look/layouts.jsonnet`.
