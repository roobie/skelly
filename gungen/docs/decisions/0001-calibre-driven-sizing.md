---
read_if:
  - you're changing cartridge data or firearm sizing
  - you're changing how a design selects a family frame
  - you're evaluating cartridge and human-scale geometry boundaries
tags: [gungen, adr, calibre, cartridges, frames, templates, sizing]
---

# 1. Calibre-driven sizing

[[THIS is_grounded_by: ../../PROJECT.md]]
[[THIS is_grounded_by: ../../cartridges/README.md]]
[[THIS relates_to: ../../../deadvox/docs/decisions/0006-firearm-handling.md]]

**Status:** accepted.

## Decision

A design starts with a sourced cartridge. Each family orders its discrete
frames by explicit rank, so the smallest eligible frame is unambiguous. Select
the lowest-ranked frame that fits the cartridge; pin a larger frame only when a
real case requires it. A cartridge that fits no frame is a validation error,
not an invitation to scale continuously or choose a larger envelope by default.
This separates cartridge fit from platform identity and human ergonomics.

The selected frame supplies the action and receiver envelope; cartridge-specific
geometry supplies the chamber, bore and ammunition. Magazine capacity, size and
profile are separate choices within the frame, so one frame can take several
magazines. Hand- and body-contact dimensions remain human-sized, while their
attachment, reach and placement follow the frame—for example, a charging-handle
shaft must reach a larger carrier.

Frame eligibility is dimensional, not a claim that cartridges or components are
interchangeable. A .300 BLK and a 5.56 AR can share the small frame without
sharing their chamber or bore. The family template keeps its recognizable
layout across frames by placing features relative to each frame's dimensions,
so every frame reads as that family. Other parts may default from the frame
while remaining adjustable: barrel, handguard, muzzle device and ring height,
because ergonomics do not scale with cartridge size.

`MagazineBands` remains in `src/gun/parts.ts` for families without frame data.
A family leaves it when its designs use frame-based magwells and magazines.
Cartridge sources and design selection are cued by `cartridges/` and
`src/gun/actionFrame.ts`, `selectFrame`.

The AR family is the frame-selection pilot. Add new families or frames only
when their cartridge fit and platform dimensions are represented by the
family's data; the SVD remains tracked in #333. The anti-materiel rifle keeps
its own cartridge sizing until its frame data is added. Real AR frame dimensions
stay blocked until BR rules on their source in br-75; g52 owns that work after
the ruling, so no frame values are invented ahead of it.
