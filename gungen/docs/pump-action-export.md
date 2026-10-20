---
read_if:
  - you change the pump shotgun design, its tube capacity or its loading port
  - you change the hand-driven action data a pump exports to Deadvox
  - you decide whether to add an automatic-shotgun handle
  - you re-export or inspect the pump shotgun model
---

# Hunting-cabin pump: action and export

The pump's cycle is hand-driven, so its export declares the hand timeline without inventing automatic fire rate or spring return. Timing is a visual model, not a claim about real mechanical forces; see `src/gun/cycle.ts`, `PUMP_HAND_TIMING`, and `pumpCycleMotion`.

The sourced loaded-shell envelope governs action travel and tube capacity because those depend on a closed, loaded shell rather than an opened casing. Conservative grid rounding protects that fit without claiming the source describes a particular crimp. Unspecified tube internals and follower allowances remain model estimates; see `src/gun/pumpShell.ts`, `PUMP_ACTION_TRAVEL_U`, and `src/gun/tubeCapacity.ts`, `tubeMagazineCapacity`. Tube capacity is mechanically derived from shell fit, while matching forend length to tube coverage remains a separate visual decision tracked in #457.

The integral capacity record is shape-neutral so both a pump tube and a rifle well can describe singly loaded ammunition without pretending to be detachable magazines; see `src/gun/exportGlb.ts`, `DeadvoxModelEntry`, and `bolt-action-export.md`.

Deadvox owns playable firearm handling. Gungen exports only the data needed to describe the hand-driven action and its geometry; it does not imply that exported ammunition is already consumed or that the model simulates loading and firing. The maintained export and preparation contracts are exercised by `test/pumpExport.test.ts` and Deadvox's firearm-model tests. If automatic shotguns are added, they use an AK-like stick/paddle handle; pump shotguns stay handle-free, as tracked by #649.

The curated design carries its own calibre, so exporting its model does not require a separate calibre override. The generated entry replaces the pump's entry in `packages/deadvox/src/content/base/models-firearms.json`; the asset credits point to the curated project design. See `designs/archetype-pump-shotgun.json` and `test/gungen-deadvox-contract.test.mjs`.

The barrel's muzzle exports as a smoothbore muzzle slot: only devices built for smoothbores certify there. See `attachments.md`, "Muzzle devices".
