---
read_if:
  - you export or change shotshell or cartridge models for Deadvox
  - you change a shotshell's visual proxies or its gameplay mass estimates
  - you interpret the closure proxy or omission of unsourced primer geometry
---

# Shotshell export

Metallic cartridges and shotshells share an exporter so model identity, units and Deadvox metadata do not drift by cartridge kind. See `src/gun/cartridgeExport.ts`, `exportCartridgeModels`.

Sourced cartridge values remain separate from visual proxies so a readable presentation cannot become a false manufacturer claim. An unspecified closure uses a conservative roll-crimp proxy at the sourced loaded envelope, leaving the source unknown; an unsourced primer is omitted rather than assigned invented dimensions. See `src/gun/shotshellGeometry.ts`, `UNKNOWN_CLOSURE_PROXY` and `shotshellGeometry`, and `cartridges/README.md`, "Cartridge data".

Deadvox's shell and spent-hull masses are gameplay estimates rather than sourced cartridge dimensions. They belong to the inventory items and must remain labelled as estimates; see `packages/deadvox/src/content/base/items-other.json`.
