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

A frame and its design are traced from a side photo BR chooses of an identified rifle, the method the AK uses (`PROJECT.md`, "Design and variants"): the model's outline is drawn over the photo, registered on the bore and the receiver's front face and scaled by a length published for that rifle, and each part is checked against the photo and corrected before the next. Reading one or two measures off a photo left the parts around them unchecked, and the result looked wrong beside the real gun. A second published or standard length checks the scale. The photo and overlays stay outside the repository and the content cites the public URL. A measure a side photo cannot show, such as a magazine's width, is derived from the frame and says so, and a traced value a build rule cannot meet takes the nearest one it can and says by how much. Each frame names the magazine its well takes, so a design in the frame's calibre seats it. The traced receiver, lower, free-float rail and magazine are content; see `src/gun/arFrames.jsonnet`, `frames`, and `src/gun/magazines.jsonnet`, `profiles`.

The `ar` template keeps one bore choice until free-float and optic clearances support more, because the large bore under a clamped handguard overlaps the front sight; revisit that restriction through #447 (`src/gun/templates.ts`, `ar`). Cartridge-derived measures and frame selection are specified by `src/gun/actionFrame.ts`, `selectFrame`, and `src/gun/arFrames.ts`, `AR_FRAME_BY_CALIBRE`; sourced cartridge values are documented in `cartridges/README.md`.
