---
read_if:
  - you change revolver firing, cylinder ownership, reload gestures or presentation
  - you tune revolver handling, ammunition or loot
  - you extend revolvers with speedloaders or compatible cartridges
---

# Revolvers

## Handling choices

Double action is the default; optional hammer cocking trades handling time for a steadier single-action shot. This preserves the real action's useful choice without forcing a separate weapon mode. A dry strike still advances the cylinder: partial loads must have an observable firing order. See `src/game/firearmHandling.ts`, `FirearmMechanics`, and `src/game/revolverHandling.ts`, `RevolverHandling`.

A double-action shot leaves when the hammer falls, so it takes the body's aim and readiness at that moment, not at the press: a turn during the pull carries the shot, and a gun lowered or sprinted with before the strike does not fire. The session builds that input from the same pose as every other shot. See `src/game/session.ts`, `firearmShotInput`.

A normal top-up preserves live cartridges and picks out cases individually. Deliberate dumping ejects both, because discarding live ammunition must be a distinct choice rather than an unavoidable cost of topping up. Release finishes the current step and closes the crane; cancelling a job keeps only previously completed steps. The queue owns completion, so cancellation cannot consume a half-inserted cartridge. An interrupted close leaves the crane open. See `src/game/reloadInput.ts`, `ReloadInput`, and `CONTROLS.md`, "Settled controls".

Speedloaders are follow-up work, not part of loose-round loading. Separating them keeps the cylinder's ownership and interruptions reviewable before another ammunition container is introduced.

The revolver is one-handed with one-hand aim, leaving the off hand available rather than treating a handgun as a long gun. Loading a round requires that the hand not wielding the gun is free, because that hand carries the round to the chamber. Its reach and the visible round share the loading job's progress; ordinary stance posing must not overwrite the reach. See `src/game/revolverHandling.ts`, `RevolverHandling`, and `src/render/actorAnimator.ts`, `ActorAnimator`. Existing grip, bore and sight transforms own aiming; moving parts do not change shot admission. See `src/core/heldPose.ts`, `heldFirearmTransform`.

Only the authored calibre is accepted. Per-chamber cartridge types remain explicit so future compatible ammunition can use the same owner without inventing a second chamber representation. Compatibility needs its own content rule before another calibre can be loaded.

The export contract and playable handling are separate changes: validating geometry first prevents gameplay from depending on guessed pivots or duplicate model measurements. See `packages/gun-authoring-tool/src/gun/revolverExport.ts`, `revolverMetadata`, and `src/render/firearmModel.ts`, `poseRevolverParts`.

## Ownership and persistence

A cylinder is the only ammunition owner in a revolver. It never mirrors its aligned cartridge into a linear chamber or tube. Loading starts after the aligned chamber, because a double-action pull advances before striking; loading must not silently rotate simulation alignment. Cocking advances once, while the cocked strike does not. See `src/core/firearmState.ts`, `CylinderState`, and `src/game/revolverHandling.ts`, `RevolverHandling`.

Each completed shot leaves its case in the same chamber. Ejections become item-owned pending landings before presentation receives the effect, so saving or hiding the model cannot duplicate ammunition. Snapshots deeply copy cylinders. The last shot time is firearm state and is saved, so a save between two shots keeps the recovery gate. Content-coupled restore checks the exported chamber count and cartridge calibre; structural decoding rejects open, cocked cylinders and competing owners. See `src/core/items.ts`, `assertAmmunition`, and `src/core/saveFormat.ts`, `wirePayloadSchema`.

## Content and presentation

Handling times, dispersion, recoil and loot weights belong to content so mods can change feel without editing mechanics. The police armoury and gun store are ordinary sources; rare residential wardrobe finds make the gun part of a formerly inhabited world rather than exclusively institutional equipment. See `src/content/base/items-revolver.jsonnet`, `items`, `src/content/base/gauntlet-city-building-types.libsonnet`, `loot`, and `src/content/base/loot.jsonnet`, `loot`.

The crane carries the cylinder and ejector even though the GLB nodes are flat. Loading and picking may display a different chamber angle without changing the saved alignment. Each frame starts from the exported rest transform to avoid accumulated rotation. See `src/render/firearmModel.ts`, `poseRevolverParts`.

Loaded rounds share the gun's file frame, including its grip offset, because chamber seats are exported in that frame rather than the outer hand-placement wrapper. See `src/render/actorAnimator.ts`, `ActorAnimator.cylinderRoundGroup`, and `test/revolverPose.test.ts`.

The loading fist shares the cartridge's frame rather than following the forearm's bend: an elbow-driven palm rotation makes a gun-local cartridge offset cut through the hand's face. Content places the round at the fist's forward edge so it protrudes toward the chamber instead of showing only its base through the palm. See `src/render/actorAnimator.ts`, `ActorAnimator`, and `src/content/base/items-revolver.jsonnet`, `loadPose`.

The shot and handling come from a real snub revolver: a .38 Special J-frame recorded near the gun, rather than this .357. A .38 may sound quieter, so gain and pitch stay in content and a tweak after listening is a content edit. A handling the takes don't hold falls back to a general click library. See `src/content/base/sounds-revolver.jsonnet`, `sounds`.
