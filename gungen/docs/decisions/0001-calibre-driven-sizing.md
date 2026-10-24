---
read_if:
  - you're changing cartridge data or firearm sizing
  - you're changing how a design selects a family frame
  - you're evaluating cartridge and human-scale geometry boundaries
tags: [gungen, adr, calibre, cartridges, frames, templates, sizing]
---

# 1. Calibre-driven sizing

## Context

Sizing a firearm directly from a cartridge would distort parts whose dimensions come from the human hand or shoulder. Cartridge fit and platform identity are related, but they are not the same question.

## Decision

A design selects the lowest-ranked frame that fits its sourced cartridge. A larger frame is an explicit platform choice, not a default escape from a failed fit; no continuous scaling is implied. This keeps cartridge clearance separate from firearm identity and human ergonomics.

Frame eligibility is dimensional, not an interchangeability claim. Cartridge-specific chamber and ammunition geometry remain distinct from the firearm frame, while hand- and body-contact dimensions remain human-scaled and are positioned relative to that frame.

Derive one frame at a time and wait for BR to accept each before deriving the next. Where public specifications do not define a frame envelope, those dimensions remain estimates and require visual review. Every frame shares one clearance method, and each frame's receiver estimates and cyclic rate are content, so a frame is tuned without a code change; see `src/gun/arFrames.jsonnet`, `derivations`, and `src/gun/arFrames.jsonnet`, `frames`. The cyclic rate follows the frame because a larger frame's longer carrier stroke cannot complete within a smaller frame's cycle. A catalogue item fixes its own frame rather than inheriting it, so connected parts must name the same frame; see `src/gun/rules.ts`, `actionFrameMatch`.

A frame's receiver and its magazine are measured from a reference photo BR chooses, scaled by a length the source publishes for the rifle pictured, because a photo of another rifle gave a receiver that read wrong on the model. Where the page is bent, lengths run along the rifle's outline and a second published length checks the scale. A measure a side photo cannot show, such as a magazine's width, is derived from the frame instead and says so. Each frame names the magazine its well takes, so a design in the frame's calibre seats it; see `src/gun/arFrames.jsonnet`, `frames`, and `src/gun/magazines.jsonnet`, `profiles`.

The `ar` template keeps one bore choice until free-float and optic clearances support more, because the large bore under a clamped handguard overlaps the front sight; revisit that restriction through #447 (`src/gun/templates.ts`, `ar`). Cartridge-derived measures and frame selection are specified by `src/gun/actionFrame.ts`, `selectFrame`, and `src/gun/arFrames.ts`, `AR_FRAME_BY_CALIBRE`; sourced cartridge values are documented in `cartridges/README.md`.
