---
read_if:
  - you add or change the neutral model schema or the material and physical-property model
  - you decide whether code belongs in the core or in one of the tools
  - you add a domain pack's fields to the model entry
  - you change how a model refers to shared material content
  - you decide which item or assembly mass is authoritative
---

# thing-core

The modeling core shared by the thing and gun authoring tools. The neutral fields are
`src/schema.ts`, `NeutralModelSchema`; the material content is `src/materials.jsonnet`,
validated by `src/materials.ts`, `MaterialSchema`. See `things/README.md` for the boundary's
reasons and `things/WORK.md`, "Phases" for the remaining suite work.

## Contract

- Math comes from the engine and is used, never reimplemented.
- Shapes, meshing and assembly belong to the engine. Work that needs them, such as placing
  a part's geometric centre, belongs above this core; see
  `packages/thing-export/README.md`, "Physical model".
- Nothing here names a kind of thing, so any code that does belongs in a tool.
- Deadvox depends on this package for the model schema, so it stays free of rendering
  libraries and of assembly code.
- Each domain pack owns one named block on a model entry and validates it with its own
  schema. The envelope then names no kind of thing, nothing leaks between packs, and one
  entry can carry several packs' blocks without their names clashing. A field two packs
  both want is promoted into the envelope on purpose. The gun pack's block and the composed
  Deadvox schema are `packages/deadvox/src/core/schema.ts`, `GunModelSchema` and `ModelSchema`.
- Materials share one content table so tools and the game read the same appearance and a
  mod changes it in one place. Mass is authored, not inferred from material density or a
  drawn envelope: items can mix materials and hide complex internal shapes. See
  `things/README.md`, "Rules". Baked appearance is not a second tuning source; references
  retain authored shades while resolving shared values. See `src/materials.ts`,
  `MaterialReferenceSchema`, and `packages/deadvox/src/render/modelMaterials.ts`, `applyModelMaterials`.
- Part mass choices and appearance profiles belong to the authoring domain, not to a
  material's identity. See `gungen/src/gun/physical.jsonnet`, `partMasses`, and
  `gungen/src/gun/appearance.jsonnet`, `profileFinishes`.
- Atom models carry no competing mass; the item's authored weight is authoritative even
  when several atoms share a visual model. Assembly models carry authored part masses;
  see `src/schema.ts`, `ModelPartSchema`, and `src/mass.ts`, `modelMassKg`. Consumers must
  not count baked replaceable geometry and its child item twice; see
  `packages/deadvox/src/core/modelMass.ts`, `modelBodyMassKg`.
