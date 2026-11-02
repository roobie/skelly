---
read_if:
  - you locate or change a schema contract cited here
  - you add or change the neutral model schema or the material and physical-property model
  - you decide whether code belongs in the core or in one of the tools
  - you add a domain pack's fields to the model entry
  - you change how a model refers to shared material content
  - you decide which item or assembly mass is authoritative
  - you wrap a single authored part for the shared assembly path
---

# thing-core

The modeling core shared by the thing and gun authoring tools. The neutral fields are
`src/schema.ts`, `NeutralModelSchema`; the material content is `src/materials.jsonnet`,
validated by `src/materials.ts`, `MaterialSchema`. See `things/README.md` for the boundary's
reasons and `things/WORK.md`, "Phases" for the remaining suite work.

## Contract

- Math comes from the engine and is used, never reimplemented.
- Shapes, meshing and assembly solving belong to the engine. The wrapper does not build
  geometry or solve placement. Work that does, such as placing a part's geometric centre,
  belongs above this core; see
  `packages/thing-export/README.md`, "Physical model".
- Nothing here names a kind of thing, so any code that does belongs in a tool.
- Deadvox depends on this package for the model schema, so consuming that envelope never
  loads rendering or authoring geometry. The single-part helper wraps engine types rather
  than introducing a second assembly format; see `src/singlePart.ts`, `singlePart`.
- Each domain pack owns one named block on a model entry and validates it with its own
  schema. The envelope then names no kind of thing, nothing leaks between packs, and one
  entry can carry several packs' blocks without their names clashing. A field two packs
  both want is promoted into the envelope on purpose. The gun pack's block and the composed
  Deadvox schema are `packages/deadvox/src/core/schema/models.ts`, `GunModelSchema` and `ModelSchema`.
- Materials share one content table so tools and the game read the same appearance and a
  mod changes it in one place. Mass is authored, not inferred from material density or a
  drawn envelope: items can mix materials and hide complex internal shapes. See
  `things/README.md`, "Rules". Baked appearance is not a second tuning source; references
  retain authored shades while resolving shared values. See `src/materials.ts`,
  `MaterialReferenceSchema`, and `packages/deadvox/src/render/modelMaterials.ts`, `applyModelMaterials`.
- Part mass choices and appearance profiles belong to the authoring domain, not to a
  material's identity. See `packages/gun-authoring-tool/src/gun/catalogue.jsonnet`, `parts`, and
  `packages/gun-authoring-tool/src/gun/appearance.jsonnet`, `profileFinishes`.
- A model with parts carries authored part masses, including a thing-tool atom wrapped
  as one part; its consumer authors no competing item total. Without exported parts, an
  atom reads its item weight. This keeps one authority during the tool migration while
  thing-tool rows each own an item and can share geometry without sharing a mass. See
  `src/schema.ts`, `ModelPartSchema`; `src/mass.ts`, `modelMassKg`; and
  `things/WORK.md`, "Decisions". Consumers must not count baked replaceable geometry and
  its child item twice; see `packages/deadvox/src/core/modelMass.ts`, `modelBodyMassKg`.
- Baked collision and named anchors are neutral because any consumer that places a thing
  needs its solid extent and its attachment points, whatever kind of thing it is. A part's
  collision travels with its mass, so a consumer never pairs one export's boxes with
  another's mass. See `src/schema.ts`, `ModelBoxSchema` and `ModelPartSchema`.

Helper tests preserve the same dependency direction as production code: physical
conservation is checked above the core rather than importing the exporter into it. See
`test/singlePart.test.ts` and `test/things-deadvox-contract.test.mjs`.
