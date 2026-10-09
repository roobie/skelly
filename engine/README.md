---
read_if:
  - you change the shared assembly, fit, geometry, validation, export, or scene-rendering engine
  - you add a new consumer of the shared engine
  - "you change the engine/domain boundary for issue #509"
---

# Shared engine

The engine is a shared library for tools that assemble authored shapes and check how their parts fit. It exists so the item-authoring tool and Gungen can share one engine rather than maintaining parallel geometry and fit systems; see issue #509 and `src/core/schema.ts`, `Domain`.

The target boundary is to keep firearm and domain names out of this package. Consumers provide their own domain data and rules; the engine owns reusable mechanisms, while each tool owns its vocabulary and specialization. For g60, move the firearm names still here—calibre params and selection, design calibre validation, and the GLB generator brand—behind Gungen adapters.
