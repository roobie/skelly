---
id: gungen::adr-0001-calibre-driven-sizing
description: Decision that a gun design starts from its cartridge, which picks a discrete action frame that sizes the action, barrel and magazine, while the family look and human-scale parts stay put
tags: [gungen, adr, calibre, cartridges, frames, templates, sizing]
read_if:
  - changing cartridge data or firearm sizing
  - implementing or reviewing family frames and selectors
created: 2026-10-02
status: accepted
---

# 1. Calibre-driven sizing: the cartridge picks the frame

[[THIS is_grounded_by: ../../PROJECT.md]]
[[THIS is_grounded_by: ../../cartridges/README.md]]
[[THIS relates_to: ../../../deadvox/docs/decisions/0003-firearm-handling.md]]

**Status:** accepted.

## Context

A platform's family look and action size are separate. Cartridges with different overall lengths and head diameters can share a recognizable family layout while requiring different action and receiver envelopes. Cartridge dimensions therefore choose a discrete family frame; the family template preserves the look.

## Decision

### 1. A design starts from its cartridge

The cartridge is a design parameter, chosen first. Everything below follows from it. Cartridges come from the sourced data in `cartridges/` (one JSON per cartridge, under the #109 source rules); a design can't name a cartridge that has no data.

### 2. The cartridge picks a discrete frame

Real platforms come in a few frame sizes, and a cartridge goes in the smallest frame that fits it: .300 BLK runs in an AR-15, 6.5 Creedmoor in an AR-10. So gungen models **frames as data, per family**, not a continuous scale.

A frame is an **action and receiver envelope with its interfaces**, not a cartridge:

- It declares the largest cartridge it takes (maximum overall length and maximum case head diameter) and the envelope that follows: carrier or bolt length and travel, receiver length and height, ejection port length, the magwell opening, and the outer envelope of the barrel extension and breech.
- **Frame fit is a dimensional eligibility rule** (the cartridge fits the envelope), not a claim that real ammunition, bolts or chambers interchange: a .300 BLK and a 5.56 AR share the small frame but not their chamber or bore.
- A family's frames are **ordered by an explicit rank**, so "smallest" and "largest" are never ambiguous, even if two envelopes are incomparable dimension by dimension.
- The cartridge's frame is **derived** (the lowest-ranked frame of the family that fits), never a separate setting, so frame and cartridge can't disagree. A cartridge that fits no frame of the family is a validation error naming the largest frame and the cartridge's measures. A family with one frame either fits or refuses.

Inside the frame's envelope, the **cartridge itself** drives the cartridge-specific geometry: the chamber, bore and inner barrel extension, and the round and magazine-column geometry.

### 3. What follows the cartridge, what defaults from it, what stays human-sized

| Kind | Parts | Rule |
| --- | --- | --- |
| **Derived** from the frame | action (carrier/bolt, travel), receiver length and height, ejection port, magwell opening, outer barrel-extension/breech envelope | Fixed by the cartridge's frame; not user parameters. |
| **Derived** from the cartridge | chamber, bore, inner barrel extension, round and column geometry | Fixed by the cartridge, within the frame's envelope. |
| **Chosen** within the frame | magazine capacity, size and profile (from the cartridge's column, fitting the magwell) | A separate, adjustable choice: one frame takes several magazines. |
| **Defaults from** the calibre | barrel length and profile (heavier for bigger cartridges), handguard length (follows the barrel), muzzle device size, optic ring height (from the receiver height) | Defaults scale with the frame, but stay adjustable. A handguard may be shorter than the barrel or absent (e.g. a bipod rifle with a free-floating barrel). |
| **Fixed** to the human | the hand- and body-contact dimensions of the grip, trigger, trigger guard, safety, charging-handle paddle or knob, stock and cheek rest, and sling loops | These sizes never follow the calibre; much of why a 417 still reads as an AR. Their **attachment, reach and placement** do follow the frame: a charging handle's shaft must reach the bigger carrier, and a sling point sits where the bigger platform puts it. |

### 4. The template keeps the family look

A family template (AR, later AK) places its features (forward assist, ejection port cover, delta ring, buffer tube) **relative to the frame's dimensions**, not at fixed coordinates, so every frame of the family reads as that family. Proportions between features may differ between frames when the real guns do.

### 5. Pilot: the AR, three frames

The first implementation is the AR family with three frames:

| Frame | Example cartridge | Real-world reference |
| --- | --- | --- |
| small (AR-15) | 5.56×45 | M4, HK416 |
| large (AR-10) | 7.62×51 | SR-25, HK417 |
| magnum | .338 Lapua Magnum | proprietary AR-pattern rifles, e.g. the side-charging Noreen Bad News .338 LM; there is no standardised magnum AR frame |

Each needs sourced cartridge data and frame dimensions with a source or a clearly stated estimate. `cartridges/5.56x45.json` cites NATO AOP-4172 and marks C.I.P. .223 Rem values as visual-profile proxies, not chamber-interchangeability data. The 7.62×51 and .338 Lapua Magnum entries cite their C.I.P. sheets; the 7.62×51 entry makes no NATO chamber-interchangeability claim. Unsourced cartridge dimensions remain null.

### 6. Family scope and adjustable parts

The design starts with the calibre. Parts beyond the action, barrel and magazine scale with the frame as defaults but remain adjustable; for example, a free-floating bipod rifle may omit its handguard. AK frames and the SVD remain deferred under #333.

A design always uses the lowest-ranked frame that fits its cartridge. It cannot pin a larger frame unless a real case establishes that need.

## Consequences

- From g51-3, curated AR designs derive the small frame from their default 5.56×45 cartridge.
- Export bytes may change; no compatibility path is added solely to preserve prior bytes. Gungen exports must still produce models that deadvox validates and loads. An export diff is review evidence, not a gate.
- The anti-materiel rifle keeps its bespoke cartridge sizing until its frame data is convenient to add.
- Magazine bands remain for families not yet fully represented by frame data; a family leaves them when its designs use frame-based magwells and magazines.
- From g51-3, frame selection stays out of the generation axis; covering arrays span family, cartridge and adjustable choices. Targeted selector cases cover boundary fit, next-frame fit, no fit, one-frame families and incomparable envelopes.
- Canaries protect against a cartridge exceeding its frame and hand-editing derived dimensions. Full products stay behind `GUNGEN_SWEEPS`.

## Open question

- Frame-dimension sourcing and estimation method; use the ruling recorded for br-75 before adding real AR frame dimensions.
