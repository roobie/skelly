---
read_if:
  - you change the shared assembly, fit, geometry, validation or export engine
  - you add a new consumer of the shared engine
  - you change where the shared engine's tests live or what its boundary test enforces
  - you defer or implement revolute PartMotion
  - "you change the engine/domain boundary for issue #509"
---

# Shared engine

Consumers should share geometry and fit mechanisms without sharing domain policy. Keeping domain vocabulary outside the engine lets each consumer evolve its own data and rules independently.

`src/assembly/template.ts`, `Template.variantParams` maps consumer choices to generic part parameters. Domain validation stays in `src/assembly/designLoader.ts`, `DesignLoadInputs.validateDesign`. Export identity remains caller-owned through `src/export/exportTypes.ts`, `GlbExportInput.generator` and `GlbExportInput.metadataNamespace`.

Assemblies are graphs rather than trees because one part may need to fit against multiple neighbours, as a handguard can meet both receiver and barrel. Preserving that loop lets validation expose a closure mismatch instead of silently dropping a connection; see `src/assembly/resolve.ts`, `resolve`.

Source is split into layers, each importing only itself and the ones before it: `src/foundation`, `src/shapes`, `src/assembly`, then `src/export`. The three.js scene lives above the engine, in `packages/tool-ui/src/scene.ts`, `buildLayers`. A layer that needs a higher one's type is a sign the type belongs lower; the order is `packages/engine/test/engineImportBoundary.test.ts`, `engineLayers`.

The engine owns its boundary test, `packages/engine/test/engineImportBoundary.test.ts`, "engine import boundary", because the layers and the domain-neutral names are its rules, and a check kept beside the code it guards cannot drift from it. The same test enforces the import edges of every package under `packages/`, so a package that reaches gungen, or deadvox that reaches the engine, fails here. The engine's contract test is `packages/engine/test/engineContracts.test.ts`; gun-facing contracts stay in `gungen/test/m3Contracts.test.ts`, which exercises the engine as a consumer.

A motion may turn about a local pivot before translating so consumers can describe coupled rotation and travel without putting domain-specific action phases in the engine. See `src/assembly/schema.ts`, `PartMotion`, and `src/assembly/motion.ts`, `motionTransform`. FAL handle fold remains deferred under #648.
