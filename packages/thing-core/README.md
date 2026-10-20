---
read_if:
  - you add or change the neutral model schema or the material and physical-property model
  - you decide whether code belongs in the core or in one of the tools
  - you add a domain pack's fields to the model entry
  - you change how a model refers to shared material content
---

# thing-core

The modeling core shared by the thing and gun authoring tools. The neutral fields are
`src/schema.ts`, `NeutralModelSchema`; the material content is `src/materials.jsonnet`,
validated by `src/materials.ts`, `MaterialSchema`. See `things/README.md` for the boundary's
reasons and `things/WORK.md`, "Phases" for the remaining suite work.

## Contract

- Math comes from the engine and is used, never reimplemented.
- Shapes, meshing and assembly belong to the engine. Work that needs them, such as placing a
  part's centre of mass, belongs in the export package, not here.
- Nothing here names a kind of thing, so any code that does belongs in a tool.
- Deadvox depends on this package for the model schema, so it stays free of rendering
  libraries and of assembly code.
- Each domain pack owns one named block on a model entry and validates it with its own
  schema. The envelope then names no kind of thing, nothing leaks between packs, and one
  entry can carry several packs' blocks without their names clashing. A field two packs
  both want is promoted into the envelope on purpose. The gun pack's block and the composed
  Deadvox schema are `packages/deadvox/src/core/schema.ts`, `GunModelSchema` and `ModelSchema`.
- Materials are one table, kept here as content: each material has a colour, a finish and,
  until g73 lands, a density, and packs add their own. Until g73 lands, mass is still derived
  from densities, so colour and density kept apart would drift. In one table every tool and
  the game read the same values, and a mod changes a material in one place. Once g73 lands,
  mass is authored, not derived from material density; see `things/README.md`, "Rules".
  Baked asset appearance is not a second source of tuning: material references retain authoring shades while resolving the shared values;
  see `src/materials.ts`, `MaterialReferenceSchema`, and
  `packages/deadvox/src/render/modelMaterials.ts`, `applyModelMaterials`.
- Role assignments and appearance profiles belong to the authoring domain, not to a
  material's identity. See `gungen/src/gun/appearance.jsonnet` for the gun policy. This
  keeps the core free of thing-specific vocabulary while a material retains one definition.
