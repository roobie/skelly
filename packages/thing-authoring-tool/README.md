---
read_if:
  - you author or export a non-gun item
  - you inspect the thing tool's viewer or its assembly boundary
  - you change a tool item's mass, finish or geometry
---

# Thing authoring tool

Each item has an authored row so mass has one home even when geometry builders are reused.
A single part takes the core wrapper and can gain parts without changing the export or
preview contract. See `src/catalogue.ts`, `buildItem`, and `items.jsonnet`.

Geometry and appearance are separate so changing a finish cannot change fit. Families
select mechanisms while content owns dimensions, material choices and authored masses;
unsupported selections are errors rather than substitutes. See `src/catalogue.ts`,
`loadCatalogue`, and `src/families/`.

Handling datums refer to a named solid rather than duplicate its dimensions, so resizing
a handle or moving its part also moves the hand. Pose corrections stay authored beside
the geometry because the consumer's held frame need not match the tool's upright frame.
See `src/catalogue.ts`, `buildItem`, and `packages.libsonnet`. Attachment datums, exported
as named anchors, use the same solid reference for the same reason: a vehicle part's mount
follows its geometry. See `vehicle-parts.libsonnet`.

Equipment uses family-specific construction rather than a generic box so silhouettes and
exposed working parts remain useful identification cues at play distance. Repair trays show
their contents because a closed case would hide the distinction between metal repair and
clothing repair; folded continuous webbing keeps a sling's ground footprint practical without
making it look like a rigid rod. See `src/families/equipment.ts`, `repairKit`, `webbingSling`
and `pliers`, and `equipment.libsonnet`.

The preview draws the same engine report the exporter consumes, so visual inspection is
not a second model implementation. See `src/main.ts` and `packages/tool-ui/src/scene.ts`,
`buildLayers`. The page is `index.html`; the deployed viewer path is `/thing-authoring-tool/`.

The recipe is the consumption boundary, not a list inferred from item relationships.
It exports every catalogue row, so a new row cannot be left out by a hand-kept list, and
renames only the older rows deadvox already knows by another id.
Separate recipes keep tools independent while shared validation and file writing prevent
parallel formats; see `exports/deadvox.jsonnet`, `src/exports.ts`, `loadThingRecipe`, and
`packages/thing-export/README.md`, "Recipe ownership". The root refresh command is owned by
`tools/refresh-deadvox.mjs`.

Inventory atoms may retain a runtime item weight rather than exported part masses:
a vessel containing a serving must not gain the serving's mass twice, and visual
primitives are not inventory parts. Every row authors its `exportMass` choice, with no
helper default, so copying a helper cannot silently switch which mass is the authority.
That choice follows each item into its recipe; disagreement is refused rather than silently choosing an
authority. Geometry and authoring-preview physical properties do not change with
that export choice. See `src/catalogue.ts`, `ItemSchema`, `src/exports.ts`,
`exportItem` and `loadThingRecipe`, and `cans.libsonnet`, `shellMassKg` and `items`.

The tool has no item states, so a bear trap has one model, lying open as it is set. A
sprung look also needs deadvox's ground look to choose a model by item state, so it is
deferred to #107's trap readability review; see `packages/deadvox/src/render/piles.ts`,
`drawModels`.
