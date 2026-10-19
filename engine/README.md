---
read_if:
  - you change the shared assembly, fit, geometry, validation, export, or scene-rendering engine
  - you add a new consumer of the shared engine
  - you change where the shared engine's consumer contract is tested
  - you defer or implement revolute PartMotion
  - "you change the engine/domain boundary for issue #509"
---

# Shared engine

Consumers should share geometry and fit mechanisms without sharing domain policy. Keeping domain vocabulary outside the engine lets each consumer evolve its own data and rules independently.

`src/assembly/template.ts`, `Template.variantParams` maps consumer choices to generic part parameters. Domain validation stays in `src/assembly/designLoader.ts`, `DesignLoadInputs.validateDesign`. Export identity remains caller-owned through `src/export/exportTypes.ts`, `GlbExportInput.generator` and `GlbExportInput.metadataNamespace`.

Assemblies are graphs rather than trees because one part may need to fit against multiple neighbours, as a handguard can meet both receiver and barrel. Preserving that loop lets validation expose a closure mismatch instead of silently dropping a connection; see `src/assembly/resolve.ts`, `resolve`.

Engine's consumer-facing checks live in Gungen's test suite because exercising the shared package through its consumer verifies the boundary in use. The import and domain-neutrality guard is `gungen/test/engineImportBoundary.test.ts`, "engine import boundary".

A motion may turn about a local pivot before translating so consumers can describe coupled rotation and travel without putting domain-specific action phases in the engine. See `src/assembly/schema.ts`, `PartMotion`, and `src/assembly/motion.ts`, `motionTransform`. FAL handle fold remains deferred under #648.
