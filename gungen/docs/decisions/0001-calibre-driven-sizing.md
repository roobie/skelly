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
[[THIS relates_to: ../../deadvox/docs/decisions/0006-firearm-handling.md]]

**Status:** accepted.

## Decision

A design starts with a sourced cartridge. The cartridge selects the smallest
eligible discrete frame in its firearm family; a frame supplies the action and
receiver envelope, while cartridge-specific geometry supplies the chamber,
bore and ammunition. Frame eligibility is dimensional, not a claim that
cartridges or components are interchangeable.

The family template keeps its recognizable layout across frames. Action and
receiver dimensions follow the selected frame, while hand- and body-contact
parts remain human-sized because ergonomics do not scale with cartridge size.
Other parts may default from the frame while remaining adjustable.

This separates three concerns that would otherwise drift together: cartridge
fit, platform identity and human ergonomics. Cartridge sources and design
selection are cued by `cartridges/` and `src/gun/actionFrame.ts`, `selectFrame`.

The AR family is the frame-selection pilot. Add new families or frames only
when their cartridge fit and platform dimensions are represented by the
family's data; the SVD remains tracked in #333. Real AR frame dimensions stay
blocked on BR's sourcing rule in br-75; g52 owns that work after the ruling, so
no frame values are invented ahead of it.
