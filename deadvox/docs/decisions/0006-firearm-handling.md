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
change how the weapon behaves and feels.

Spent cases are saved as a calibre-specific count on the block where each case
lands. A deterministic scatter represents that count visually. This gives cases
as recoverable world items without saving a separate physics body for every
shot, and keeps a case with the place it actually landed. See
`src/game/firearmHandling.ts`, `FirearmMechanics.ejectionDrop`, and
`src/render/spentCaseScatter.ts`, `spentCaseScatter`.

Fitted attachments affect the firearm through their authored geometry and
properties. Suppressor mass contributes to handling; gas reduction, sound
reduction and wear distinguish suppressor types without hard-coding values in
the model contract. The unresolved AK muzzle-device host is tracked by #364.
Heat, smoke, improvised-suppressor accuracy loss and fouling remain deferred in
#367 because they depend on broader physical, ballistic or maintenance systems.

The current model contract is defined by Gungen's `src/gun/exportGlb.ts`,
`exportGunGlb`, and Deadvox's `src/core/schema.ts`, `ModelSchema`. The acceptance
check is an exported model that Deadvox validates and loads.
