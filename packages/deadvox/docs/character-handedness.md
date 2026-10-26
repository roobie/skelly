---
read_if:
  - changing character creation, restoration or dominant-hand policy
  - changing inventory work admission or physical hand slots
  - changing held-item placement or gameplay ejection
---

# Character handedness

Handedness is character identity, not an origin-local preference. Continue must restore the saved actor rather than consulting creation settings. Before the compatibility milestone, malformed or older saves are rejected rather than assigned an invented identity. See `src/core/character.ts`, `CharacterState`, and `src/core/saveFormat.ts`, `progression`.

Hand slots remain physical so inventory moves, saved action snapshots and fist alternation keep their meaning. `dominantSide` and `offSide` resolve actor roles without changing tree order. Two-handed work reserves the other physical slot; it does not create a second owner for the work item. See `src/core/craftWork.ts`, `craftActionHooks`, and `src/core/inventory.ts`, `Inventory.beginWork`.

Input intents describe dominant/off-hand use, but an explicit physical selection is never redirected to another item. An empty slot reserved by a two-handed item is not a free fist. A fresh fist sequence starts with the dominant arm, then alternates physical arms; a restored sequence keeps its saved next arm, so Continue cannot repeat the last attack. See `src/game/primaryAction.ts`, `selectPrimaryAction`, and `src/core/playerCombat.ts`, `PlayerCombat` constructor, `beginMeleeSwing` and `restoreState`.

Spatial placement follows the occupied physical slot, not actor preference. Only the placement is mirrored; model transforms, anchors and authored ejection directions stay mechanical. The support hand preserves the firearm's authored frame. See `src/core/heldPose.ts`, `heldGripOffset`, and `src/render/actorAnimator.ts`, `ActorAnimator`.

A new actor is constructed only at accepted launch, after content and engine readiness. The accepting gesture must unlock audio and request pointer lock without waiting for shader warm-up; refused initialization leaves saved generations untouched. Continue restores saved identity and does not apply creation preferences. Title help remains available before an actor exists. See `src/ui/saveController.ts`, `SaveController.setNewWorldLauncher`, and `src/game/play.ts`, `startPlay`.
