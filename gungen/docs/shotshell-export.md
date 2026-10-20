---
read_if:
  - you export or change shotshell or cartridge models for Deadvox
  - you change a shotshell's visual proxies or its gameplay mass estimates
---

# Shotshell export

Metallic cartridges and shotshells share an exporter so model identity, units and Deadvox metadata do not drift by cartridge kind. See `src/gun/cartridgeExport.ts`, `exportCartridgeModels`.

Sourced cartridge values remain separate from visual proxies. When a closure or internal feature is not specified, a named proxy may complete the presentation, but it must not be written back as source data or presented as a manufacturer claim. The shared loaded/opened presentation is in `src/gun/shotshellGeometry.ts`, `shotshellGeometry`; `cartridges/README.md` explains the sourcing rule.

Deadvox's shell and spent-hull masses are gameplay estimates rather than sourced cartridge dimensions. They belong to the inventory items and must remain labelled as estimates; see `packages/deadvox/src/content/base/items-other.json`.
