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
Cartridge measurements are sourced under `cartridges/`; `src/gun/arFrames.ts`,
`AR_FRAME_BY_CALIBRE` applies `selectFrame` to curated AR designs.

The AR family is the frame-selection pilot. Frame dimensions may be derived
from a cartridge's sourced case length and head dimensions with explicit
clearances; receiver length and height may be estimated from published
specifications and photographs. Record the derivation or estimate with each
measure. BR's visual review is the acceptance check because public drawings do
not supply every frame dimension. Review one frame at a time, and wait for BR's
look to accept it before deriving another.

The small AR frame combines cartridge-derived action and magwell clearances
with receiver estimates, and supplies those dimensions to curated AR designs. `src/gun/templates.ts`, `ar`, keeps one bore choice until its
free-float and optic clearances support more. `src/gun/parts.ts`,
`ejectionPortWindow`, applies frame-sized ejection-port apertures only to the
AR receiver section; other action patterns retain their section-specific fit
rules. br-75 requires BR to accept the small frame before
additional AR frames are derived. The anti-materiel rifle retains its separate
cartridge-sizing path; the SVD remains tracked in #333.
