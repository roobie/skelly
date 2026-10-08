---
read_if:
  - you're changing the Gungen-to-Deadvox firearm model contract
  - you're changing firearm cycle state, ammunition, magazines or spent cases
  - you're evaluating firearm attachment effects
tags: [deadvox, gungen, adr, firearms, export, feel]
---

# 6. Firearm handling across Gungen and Deadvox

[[THIS is_grounded_by: ../../EPIC.md]]
[[THIS is_grounded_by: ../../DESIGN.md]]
[[THIS is_grounded_by: ../../../gungen/PROJECT.md]]

**Status:** accepted.

## Decision

Gungen owns firearm model and action data; Deadvox validates and consumes that
export. The two projects may evolve the format together because preserving old
exports is not a goal. The contract exists so the geometry, firearm state and
handling in play stay connected, and so Gungen exports a model Deadvox can load.

The firearm's mechanical state belongs to the simulation. Its cycle, ammunition,
magazine contents and saved case counts must not depend on renderer timing.
Animation, sound, muzzle flash, recoil display and flying cases are presentation.
Cycle differences such as hold-open behavior remain firearm data because they
change how the weapon behaves and feels. Cycle timelines are estimates checked
by eye in slow motion, not measured timing constants.

Spent cases are saved as a calibre-specific count on the block where each case
lands. A deterministic scatter represents that count visually. This gives cases
as recoverable world items without saving a separate physics body for every
shot, and keeps a case with the place it actually landed. See
`src/game/firearmHandling.ts`, `FirearmMechanics.ejectionDrop`, and
`src/core/scatterPile.ts`, `spentCaseScatter`.

Fitted attachments affect the firearm through their authored geometry and
properties. Gungen derives suppressor mass from geometry and material. The only
hand-set suppressor effect is each type's recoil reduction, which follows trapped
gas; the improvised type is less effective. One shared muzzle rule uses weight
multiplied by distance from the hands to slow raising and swinging, add sway and
slow recovery between shots. Each type has noise reduction and wear. Condition
falls per shot, so suppression falls with condition; the improvised type wears
quickly and eventually breaks. The unresolved AK muzzle-device host is tracked
by #364. Heat, smoke, improvised-suppressor
accuracy loss and fouling remain deferred in #367 because they depend on broader
physical, ballistic or maintenance systems.

The current model contract is defined by Gungen's
`gungen/src/gun/exportGlb.ts`, `exportGunGlb`, and Deadvox's
`src/core/schema.ts`, `ModelSchema`. The acceptance check is an exported model
that Deadvox validates and loads.

## Open questions

- Whether physical recoil should affect more than presentation remains open.
- Whether piles keep steel-cased and brass cases separate remains open.
