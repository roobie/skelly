---
read_if:
  - you add or change the neutral model schema or the material and physical-property model
  - you decide whether code belongs in the core or in one of the tools
  - you add a domain pack's fields to the model entry
---

# thing-core

The modeling core shared by the thing and gun authoring tools; see `things/README.md`, and
`things/WORK.md` for when it gets code.

## Contract

- Math comes from the engine and is used, never reimplemented.
- Shapes, meshing and assembly belong to the engine. Work that needs them, such as deriving
  mass from shape volumes, belongs in the export package, not here.
- Nothing here names a kind of thing, so any code that does belongs in a tool.
- Deadvox depends on this package for the model schema, so it stays free of rendering
  libraries and of assembly code.
- Each domain pack owns one named block on a model entry and validates it with its own
  schema. The envelope then names no kind of thing, nothing leaks between packs, and one
  entry can carry several packs' blocks without their names clashing. A field two packs
  both want is promoted into the envelope on purpose.
- Materials are one table, kept here as content: each material has a colour, a finish and a
  density, and packs add their own. Mass is derived from densities, so colour and density
  kept apart would drift; in one table every tool and the game read the same values, and a
  mod changes a material in one place.
