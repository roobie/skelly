---
read_if:
  - you add or change the neutral model schema or the material and physical-property model
  - you decide whether code belongs in the core or in one of the tools
---

# thing-core

The modeling core shared by the thing and gun authoring tools; see `things/README.md`, and
`things/WORK.md` for what it will own and when it gets code.

## Contract

- Math comes from the engine and is used, never reimplemented.
- Shapes, meshing and assembly belong to the engine; the core builds on them.
- Nothing here names a kind of thing, so any code that does belongs in a tool.
- Deadvox depends on this package for the model schema, so it stays free of rendering
  libraries and of assembly code.
