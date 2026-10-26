---
read_if:
  - you add or change a cartridge's data file
  - you change the cartridge format, its sourcing rule or its consistency checks
  - you need a real cartridge dimension and where it was sourced
  - "you continue the source-first cartridge work tracked by issue #109"
---

# Cartridge data

Cartridge dimensions determine ammunition identity and physical fit, so retain their source and keep unsupported values unknown rather than filling them from memory. When standards disagree, keep the governing source distinct from alternatives instead of averaging them. Parsing, source checks and cartridge relations live in `src/ammo/parseCartridge.ts` and `src/ammo/rules.ts`, `checkRelations`.

Real dimensions are an exception for ammunition, not a change to Gungen's stylized firearm scale; see `PROJECT.md`, "Scale and ammunition". The JSON/Jsonnet source contract is shared across the repository; see `docs/jsonnet.md`.

Shotshell presentation may use explicit visual proxies where source data is absent, but those proxies do not become cartridge measurements; see `docs/shotshell-export.md`. The pump-action fit uses the sourced loaded envelope; see `docs/pump-action-export.md`.
