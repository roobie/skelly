---
read_if:
  - you're changing the Gungen-to-Deadvox firearm model contract
  - you're changing mechanical firearm state or its presentation boundary
  - you're evaluating firearm attachment effects
  - you're changing firearm hold poses or their anatomical reach
  - you're changing first-person/world pose ownership
tags: [deadvox, gungen, adr, firearms, export, feel]
---

# 6. Firearm handling across Gungen and Deadvox

[[THIS is_grounded_by: ../../EPIC.md]]
[[THIS is_grounded_by: ../../DESIGN.md]]
[[THIS is_grounded_by: ../../../../packages/gun-authoring-tool/PROJECT.md]]

**Status:** accepted.

## Decision

Gungen owns firearm model and action data; Deadvox validates and consumes that export. The projects may evolve the format together because preserving old exports is not a goal. The contract keeps geometry, simulation state and handling connected, and requires Gungen to export models Deadvox validates and loads.

Mechanical state—cycle, ammunition and magazine contents—belongs to the simulation and must not depend on renderer timing. Animation, sound, muzzle flash, recoil display and flying cases are presentation. Cycle differences that change weapon behavior remain firearm data. Timelines and ballistic figures are gameplay estimates, not measured firearm specifications.

Trigger selection is content, independent of the mechanical cycle: a self-loading action does not imply held-trigger fire. Semi-automatic pulls use input edges, while the simulation's cycle still prevents overlapping shots; absent selection retains automatic cadence for existing cycling guns. See `src/core/schema.ts`, `ActionSchema`, `src/game/firearmTrigger.ts`, `FirearmTrigger`, and `src/game/firearmHandling.ts`, `FirearmMechanics`.

A pistol needs two palm contacts without a shoulder seat: treating its grip as a long-gun stock turns the muzzle away from aim. Hip follows a compressed ready technique, with elbows down, forearms forward and a level muzzle; ADS carries the gun on the eye-aligned sight line within fixed arm reach. Contacts sit on the grip rather than beside the slide, so closed fingers wrap the front strap and the support hand cups the firing hand. Both holds must fit fixed anatomy, not stretched arms or wider joint limits. An authored elbow bend hint uses the existing solver's bend-side input: an outward-only hint can fold a compressed forearm back toward the chest rather than forward from the elbow. See `src/core/heldPose.ts`, `heldFirearmTransform`, and `src/render/heldPresentation.ts`, `HeldPresentation.solve`.

The world actor owns the final solve. First person observes that body; the optical adapter consumes its cached joints rather than solving another pose. An observer or camera-clearance offset must not move anatomical shoulders. Content separates physical standoff from viewing distance: a pitch curve brings the pistol closer along its sight line to preserve fixed arm reach, while the shared ADS camera fit supplies bounded, wall-guarded framing. See `src/render/heldViews.ts`, `createHeldViews`; `src/render/heldPresentation.ts`, `HeldPresentation.copyPose`; `src/core/heldPose.ts`, `heldAdsStandoffMetres`; and `src/core/adsView.ts`, `adsCameraEye` and `guardAdsCamera`.

Slide-racking uses the shared support-hand path with an authored contact and an approach before slide movement, so the slide cannot leave before the hand reaches it. See `src/render/actorAnimator.ts`, `ActorAnimator`.

Spent cases are saved as a calibre-specific count on the block where they land. Deterministic scatter makes them recoverable without saving a physics body per shot. See `src/game/firearmHandling.ts`, `FirearmMechanics.ejectionDrop`, and `src/core/scatterPile.ts`, `spentCaseScatter`.

Fitted attachments remain separate item instances. Their exported appearance and authored geometry must not inherit the host firearm's finish; see `src/render/itemLook.ts`, `itemLook`, and `src/render/models.ts`, `ModelLibrary.part`. Gungen derives suppressor mass from geometry and material. Effects are authored by type; the shared muzzle rule accounts for weight and distance from the hands. Heat, smoke, accuracy loss and fouling remain deferred until their supporting systems exist.

The model contract is defined by Gungen's `packages/gun-authoring-tool/src/gun/exportGlb.ts`, `exportGunGlb`, and Deadvox's `packages/deadvox/src/core/schema.ts`, `ModelSchema`. The acceptance check is that Deadvox validates and loads a Gungen export.

## Open questions

- Future independently coloured instances need instance-owned appearance data that survives saves under #502. Which items get variants and whether loot rolls colours or placement authors them remain open; the current per-item-type model lookup does not implement this direction.
- Whether physical recoil affects more than presentation remains open.
- Whether piles keep steel-cased and brass cases separate remains open.
