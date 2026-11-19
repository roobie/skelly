---
read_if:
  - you design or curate a building type, or write a building brief
  - you add or change a world setting, or the settlement kinds a setting has
  - you change the brief schema, an assembly's `brief`, or how validate resolves briefs
  - you build or change the fit check between an assembly and its brief
  - you add or change a service, a furniture `serves`, a setting standard or a brief's tags
  - you want a worked example of a brief and the curated assembly that answers it
  - a building needs a door, window or fitting, and you decide whether it is shared or its own
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
The geometric rules compile once per style and walk only reserved circulation, because the
slot contract keeps reserved cells, solid support, anchors and the furniture standing in
reserved cells equal across a slot's variants (`packages/engine/src/core/templates.ts`,
`resolveSlot`). A walk proven on one draw therefore holds for every draw. Compiling every
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
- **entrance**: a body walking from the entrance through reserved circulation must reach
  the ground storey's north edge, because a city plan turns each building so that its north
  edge at turn 0 faces the street (`packages/engine/src/core/cityPlan.ts`, `fillRow` and
  `SIDES`). It is the footprint-edge test every template passes, narrowed to the street
  side and to cells no variant can block
  (`packages/engine/src/core/templateSpatial.ts`, `templateEntranceEdges`). A doorway a
  variant can board shut is outside that proof, so the street approach must be reserved.
- **program**: each room is a standing anchor that a body can walk to from the entrance,
  so a room is a place, not a label. The walk is the reserved-circulation proof map sites'
  walking routes use (`packages/engine/src/core/templateSpatial.ts`,
  `templateStandingRoute`).
- **services**: every service the brief's rooms and the setting's applicable standards
  require has a serving piece that a body walking from the entrance through reserved
  circulation can stand beside, in every draw
  (`packages/engine/src/core/templateSpatial.ts`, `templateReachesBeside`). Furniture is
  the one thing variants may change, so this rule reads each variant's furniture rather than
  one draw's: a draw keeps a service when a piece it always places serves it, or when one of
  its slots keeps it in every alternative. That proof is sound but not complete: two slots
  that between them always place a service fail it, so a required fixture belongs to one
  slot's variants. The reserved walk it stands beside is the one-draw proof above.

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
  pack, which the default validate run leaves out, so its styles are proven when its files
  are named to validate.
- **The street walk has no door leaf.** A door is furniture, and furniture claims its cell,
  so a door cell cannot be reserved (`packages/engine/src/core/templateOwnership.ts`,
  `compileOwnership`). The entrance and program rules walk reserved cells only, so every
  room of a briefed answer is joined to the street through open doorways. The front door is
  an open doorway for that reason; whether a house may stand without a door to shut is BR's
  call.
- **Every variable part is a slot of the same claim.** Garden, furnished rooms, windows and
  roof each offer variants that claim the same cells and leave reserved circulation alone, so
  one compile proves every draw (`packages/engine/src/core/templates.ts`, `resolveSlot`).
  Furniture stands outside reserved cells, where variants may differ freely.
- **The roof parapet is furniture.** The flush-roof rule's waist-high wall on some edges is
  drawn as parapet furniture, not blocks, so the walled and the bare roof keep the same block
  solidity and stay variants of one slot.
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

**Open doorways on the routes.** The entrance and program rules walk reserved air only,
and a door leaf is owned furniture, so no leaf can stand between the street and any program
room. The porch and the inner doorways are open; the one leaf is the back door, off every
route. Whether a front without a door to close plays well stays with the cover review.

**Walls one block in.** The cornice slab runs one block past the walls on every side, and
the walls stand one block in from the assembly's edge, so the overhang lies inside the size
that plot and lot checks measure; see `docs/content.md`, "Authored structures and sites".

**Material variety as style.** The boarded entrance bay is a second style over the same
shell piece, not a second piece, because a style changes blocks and nothing else, so the
slot contract holds by construction. Both styles are in the brief, since any draw may use
either. The back door is its own slot, so its leaf can be missing without touching the
shell's ownership.

**Placed by a site, not a city.** No city plan runs rural, so the house reaches the world
through a site that names it: Holdout's composed site asks for it, and its eligibility
passes the same admission test a city lot applies. The look fixture sets it beside
`small_house`, the hand-drawn baseline it is judged against. See
`mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `flat_roof_house`, and
`mods/skelly.deadvox.scenario.buildings.rural-house-look/layouts.jsonnet`.

**The entrance rule's turn.** Holdout and the look fixture turn the house by their own
rules, not by a city plan's, so its north edge facing the road is the author's placement
there, not something the fit check proves.
