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
- Shapes, meshing and assembly belong to the engine. Shape-derived physical properties belong
  above this core so consumers can read them without loading geometry; see
  `packages/thing-export/README.md`, "Physical model".
- Nothing here names a kind of thing, so any code that does belongs in a tool.
- Deadvox depends on this package for the model schema, so it stays free of rendering
  libraries and of assembly code.
- Each domain pack owns one named block on a model entry and validates it with its own
  schema. The envelope then names no kind of thing, nothing leaks between packs, and one
  entry can carry several packs' blocks without their names clashing. A field two packs
  both want is promoted into the envelope on purpose. The gun pack's block and the composed
  Deadvox schema are `packages/deadvox/src/core/schema.ts`, `GunModelSchema` and `ModelSchema`.
- Materials are one table, kept here as content: each material has a colour, a finish and a
  density, and packs add their own. Mass is derived from densities, so colour and density
  kept apart would drift; in one table every tool and the game read the same values, and a
  mod changes a material in one place. Baked asset appearance is not a second source of
  tuning: material references retain authoring shades while resolving the shared values;
  see `src/materials.ts`, `MaterialReferenceSchema`, and
  `packages/deadvox/src/render/modelMaterials.ts`, `applyModelMaterials`.
- Role assignments, physical assumptions and appearance profiles belong to the authoring
  domain, not to a material's identity. See `gungen/src/gun/physical.jsonnet`, `roles`, and
  `gungen/src/gun/appearance.jsonnet`, `profileFinishes`. This keeps the core free of
  thing-specific vocabulary while a material retains one definition.
- Physical parts are neutral so every kind of model shares one mass contract; see
  `src/schema.ts`, `ModelPartSchema`, and `src/mass.ts`, `modelMassKg`. A node association
  lets consumers distinguish baked geometry from separately owned child items without
  inspecting meshes. Counting both would count the same material twice; see
  `packages/deadvox/src/core/modelMass.ts`, `modelBodyMassKg`.

## Authored assets

A model without a shape source still needs explicit physical metadata, not a runtime
fallback to item weight or loaded mesh geometry. Single-body authoring uses the file origin
as an estimated physical reference; these are class estimates, not mesh-derived centres.
Unambiguous item authoring supplies the mass, and shared visual proxies or assets without
items require an explicit estimate. See
`packages/deadvox/src/content/base/authored-model-physics.libsonnet`, `estimates`.
The thing-family work on #509 replaces these estimates as families gain shape sources.
