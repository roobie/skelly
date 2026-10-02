---
id: gungen::adr-0001-calibre-driven-sizing
description: Decision that a gun design starts from its cartridge, which picks a discrete action frame that sizes the action, barrel and magazine, while the family look and human-scale parts stay put
tags: [gungen, adr, calibre, cartridges, frames, templates, sizing]
created: 2026-10-02
status: proposed
---

# 1. Calibre-driven sizing: the cartridge picks the frame

[[THIS is_grounded_by: ../../PROJECT.md]]
[[THIS is_grounded_by: ../../cartridges/README.md]]
[[THIS relates_to: ../../../deadvox/docs/decisions/0003-firearm-handling.md]]

**Status:** proposed (2026-10-02). BR's rulings so far are recorded under [Rulings](#rulings-2026-10-02).

## Context

In real guns, a platform's look and its size are separate things. An HK416 (5.56×45) and an HK417 (7.62×51) read as the same rifle, but the bolt carrier and receiver, the barrel, and the magazine and magwell are sized for different cartridges. An AR-pattern .338 Lapua Magnum DMR is bigger again and still reads as an AR. The size follows the calibre; the look follows the family.

What gungen does today:

- **The shared receiver is a fixed length** (16u; 1u = 11.5 mm, `src/gun/units.ts#GUN_UNITS`), whatever the gun fires.
- **Magazines pick a length from bands** per profile (`src/gun/parts.ts`, `MagazineBands`: `standard` 6/10/16u, `stanag-curved` 6/10/15.75u, AK-74 and AKM curved), not from a cartridge.
- **One exception, the anti-materiel rifle**, is sized from its cartridge: its receiver and magazine follow the .50 BMG case (`src/gun/antiMateriel/heavyReceiver.ts`, `heavyMagazine.ts`, `cartridge.ts`). That's the pattern this decision generalises.
- **Sourced cartridge data** exists for 7.62×39 (`cartridges/7.62x39.json`, #112) with its parser and rules (`src/ammo/`). g34 adds 5.56×45 and builds round profiles and magazine columns from the data (deadvox ADR 0003).

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

Inside the frame's envelope, the **cartridge itself** drives the cartridge-specific geometry: the chamber, bore and inner barrel extension, and the round and column geometry (g34's round profile and magazine column).

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

Each needs sourced cartridge data and frame dimensions with a source or a stated estimate, the same standard as `cartridges/`. **Prerequisite:** the g34 spec asks for sourced 5.56×45 data, but it hasn't arrived yet (only `cartridges/7.62x39.json` exists); the pilot is gated on it, and 7.62×51 and .338 LM are new. Missing data is never invented.

## Rulings (2026-10-02)

1. **The design starts with the calibre** (BR: "Yes, I'd say it starts with the caliber").
2. **Scale beyond the action, but adjustably.** Parts beyond the action, barrel and magazine scale "somewhat", and stay adjustable: there's no hard line, e.g. "free-floating barrels on bipod mounted firearms don't really need a handguard at all".
3. **AK later, with the SVD.** The AK family gets the same treatment, tied to an SVD archetype BR wants modelled. **Deferred**: this decision must not block it, but no AK frames are planned now.

## Consequences

- **Ordering:** after g34 (round profiles and magazine columns from cartridge data), because magwells and magazines come from those. g35's cycle travel should then come from the frame's action length instead of a per-gun number.
- **Deadvox:** gets `calibre` in the export (ADR 0003, g34), so a 7.62 AR differs in game data as well as in looks.
- **Existing designs and export compatibility:** the curated AR designs take the small frame through their default cartridge (5.56×45). The boundary:
  - The unenriched (legacy) export path keeps byte-identical GLBs and model entries, tested on full bytes as in g29's 52-export A/B.
  - An enriched export (with `calibre`, as g34's CLI does with an explicit opt-in) may add only the documented optional fields. Its GLBs and existing field values stay identical.
  - No existing consumer is opted into new metadata silently.
- **The anti-materiel rifle:** its bespoke cartridge sizing becomes one family's frame data when convenient; until then it stays as it is.
- **Bands retire gradually:** magazine bands remain for families without frames; a family moves off them when it gets frames.
- **Tests (#120):**
  - The frame is a derived outcome, not a generation axis. So the covering array spans family × cartridge × the adjustable choices (magazine, barrel, handguard), and the frame selector gets its own targeted cases: an exact-boundary fit, the first cartridge that needs the next frame, no fit, a single-frame family, and incomparable envelopes resolved by rank.
  - Fail-before canaries for "cartridge too long for its frame" and "derived dimension edited by hand".
  - Full products behind `GUNGEN_SWEEPS`.

## Open questions

- Frame dimensions for the large and magnum AR frames: which sources (manufacturer drawings, mil-specs) and how much estimation is acceptable.
- Whether a design may pin a larger frame than its cartridge needs (e.g. a 6.5 Creedmoor in an AR-10 is the default anyway; a 5.56 in an AR-10 frame is rare). Proposed: no, until a real case asks for it.
- How the SVD and AK frames relate (shared long-stroke family, or separate families).
