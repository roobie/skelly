---
read_if:
  - you're changing the Gungen-to-Deadvox firearm model contract
  - you're changing mechanical firearm state or its presentation boundary
  - you're evaluating firearm attachment effects
tags: [deadvox, gungen, adr, firearms, export, feel]
---

# 6. Firearm handling across Gungen and Deadvox

[[THIS is_grounded_by: ../../EPIC.md]]
[[THIS is_grounded_by: ../../DESIGN.md]]
[[THIS is_grounded_by: ../../../../gungen/PROJECT.md]]

**Status:** accepted.

## Decision

Gungen owns firearm model and action data; Deadvox validates and consumes that export. The projects may evolve the format together because preserving old exports is not a goal. The contract keeps geometry, simulation state and handling connected, and requires Gungen to export models Deadvox validates and loads.

Mechanical state—cycle, ammunition and magazine contents—belongs to the simulation and must not depend on renderer timing. Animation, sound, muzzle flash, recoil display and flying cases are presentation. Cycle differences that change weapon behavior remain firearm data. Timelines and ballistic figures are gameplay estimates, not measured firearm specifications.

Spent cases are saved as a calibre-specific count on the block where they land. Deterministic scatter makes them recoverable without saving a physics body per shot. See `src/game/firearmHandling.ts`, `FirearmMechanics.ejectionDrop`, and `src/core/scatterPile.ts`, `spentCaseScatter`.

Fitted attachments remain separate item instances. Their exported appearance and authored geometry must not inherit the host firearm's finish; see `src/render/itemLook.ts`, `itemLook`, and `src/render/models.ts`, `ModelLibrary.part`. Gungen derives suppressor mass from geometry and material. Effects are authored by type; the shared muzzle rule accounts for weight and distance from the hands. Heat, smoke, accuracy loss and fouling remain deferred until their supporting systems exist.

The model contract is defined by Gungen's `gungen/src/gun/exportGlb.ts`, `exportGunGlb`, and Deadvox's `packages/deadvox/src/core/schema.ts`, `ModelSchema`. The acceptance check is that Deadvox validates and loads a Gungen export.

## Open questions

- Future independently coloured instances need instance-owned appearance data that survives saves under #502. Which items get variants and whether loot rolls colours or placement authors them remain open; the current per-item-type model lookup does not implement this direction.
- Whether physical recoil affects more than presentation remains open.
- Whether piles keep steel-cased and brass cases separate remains open.
