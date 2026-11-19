---
read_if:
  - you design or curate a building type, or write a building brief
  - you add or change a world setting, or the settlement kinds a setting has
  - you change the brief schema, an assembly's `brief`, or how validate resolves briefs
  - you build or change the fit check between an assembly and its brief
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

Free text, read by the author and by BR on the contact sheet:

- the room purpose beside each `program` key, because what a room is for steers its
  furnishing but no check can judge it;
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

Validate resolves a brief's setting, settlement kinds and styles, and an assembly's
brief, with the other cross-reference checks, then runs the fit check below; see
`packages/engine/src/core/buildingBriefs.ts`, `buildingBriefIssues`.

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

What stays with BR's contact-sheet review:

- looks: the street face against `facade`, proportions, and how the materials read;
- the structural grid, since only slot positions and sizes modulo a module could be
  checked, which says little about the bay rhythm a viewer sees;
- cover and sightlines (`cover`);
- what each room is for, and whether its furnishing serves it;
- whether the street opening reads as the front door: the check proves a walk reaches the
  street edge, not that the door the facade shows is the one used;
- answers placed by layout sites rather than city plans, whose street side the layout
  decides: the entrance rule assumes the city plan's turn.

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
through an authored layout or a composed site naming it; the look fixture sets it beside
`small_house`, the hand-drawn baseline it is judged against. See
`mods/skelly.deadvox.scenario.buildings.rural-house-look/layouts.jsonnet`.
