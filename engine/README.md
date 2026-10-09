---
read_if:
  - you change the shared assembly, fit, geometry, validation, export, or scene-rendering engine
  - you add a new consumer of the shared engine
  - "you change the engine/domain boundary for issue #509"
---

# Shared engine

Issue #509 establishes a shared boundary so consumers do not maintain parallel geometry and fit systems. The reason for keeping domain vocabulary outside the package is to let each consumer evolve its data and rules without coupling other consumers to its concepts.

The variant selector in `src/core/template.ts`, `Template.variant` and `Template.variantParams`, maps consumer choices onto generic part parameters without naming the domain's data. Domain policy stays in `src/core/designLoader.ts`, `DesignLoadInputs.validateDesign`, so each consumer can check its resolved designs without importing domain rules into the engine. Export identity is supplied through `src/core/design.ts`, `GlbExportInput.generator` and `GlbExportInput.metadataNamespace`, keeping consumer branding and metadata namespaces outside the shared package.
