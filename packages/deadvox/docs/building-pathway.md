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
answer without editing it. Validate checks only that the name resolves; the fit check
that reads the brief through it lands under #1928. Hand-drawn templates carry no brief:
they are the baseline a briefed building is compared with.

Validate resolves a brief's setting, settlement kinds and styles, and an assembly's
brief, with the other cross-reference checks; see
`packages/engine/src/core/buildingBriefs.ts`, `buildingBriefIssues`.

Briefs and settings are ordinary content sections, so they load into the runtime registry
like every other section, although no runtime code reads them. A validate-only home
would need a second content class and loader beside the one boundary every section
already passes; a few short rows in the bundle cost less than that machinery. See
`packages/engine/src/core/schema/files.ts`, `SECTION_DESCRIPTOR`.
