---
read_if:
  - you change rifle cycle playback or exported action bindings
  - you change how rack and magazine jobs present on the held gun
  - you review the boundary between mechanical state, ejection and presentation
---

# Rifle cycle playback

A debug loadout initializes a fresh world; a restored game keeps its saved hands, so preview setup cannot overwrite player-owned inventory. The rifles are simulation items that fire chambered cartridges fed from the fitted magazine; see `src/debug/debugLoadout.ts`, `equipDebugLoadout`, and `DESIGN.md`, "Rifles".

Racking, changing and removing a magazine are ordinary handling actions. Their durations and cycle geometry come from the Gungen export; handling blocks firing, reduces movement and prevents sprinting. Automatic action motion is presentation on a mechanical cycle, not a cancellable manual queue job. See `src/game/firearmHandling.ts`, `FirearmMechanics`.

Held-clone bindings use exact exported node names from `parser.json.nodes` and `parser.associations`, not sanitized `Object3D.name` values; child paths bind each clone through its parent transform. Ground models and prepared prototypes do not animate. The AR carrier follows firing and hand strokes; its separate handle follows hand strokes only. The AK handle travels with its carrier. See `src/render/firearmModel.ts`, `magazineMotion`, and `src/render/handlingTurn.ts`, `handlingRotation`; the fitted-magazine look contract is in `DESIGN.md`, "Piles and item models".

The simulation scheduler owns chamber transitions and commits a spent case when the exported ejection point is crossed. The renderer cannot create a case or decide its admission time. Ejection uses the exported anchor and direction with the held firearm transform, not cosmetic camera motion. Flight, mass and case values are gameplay estimates, not measured firearm data.

Automatic cycles and pending fired cases survive a snapshot. Manual motion is omitted from the save copy without changing the live action; chamber contents remain saved. Case RNG is selected at shot admission, while case-item UID allocation occurs at ejection. The per-block case owner and recovery rationale are in `DESIGN.md`, "Spent cases per block". See `src/core/saveFormat.ts`, `wirePayloadSchema`, and `src/game/firearmHandling.ts`, `FirearmMechanics.ejectionDrop`.
