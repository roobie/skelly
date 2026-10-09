---
read_if:
  - you change the shared assembly, fit, geometry, validation, export, or scene-rendering engine
  - you add a new consumer of the shared engine
  - "you change the engine/domain boundary for issue #509"
---

# Shared engine

Issue #509 establishes a shared boundary so consumers do not maintain parallel geometry and fit systems. The reason for keeping domain vocabulary outside the package is to let each consumer evolve its data and rules without coupling other consumers to its concepts. See `src/core/schema.ts`, `Domain`, and `src/core/designLoader.ts`, `DesignLoadInputs`.
