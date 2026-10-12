---
read_if:
  - you change door-lock content, interaction or save ownership
  - you use the `lock_test` first-look fixture
---

# Minimal door locks

A door's lock state belongs to its block entity and is saved with the door. A locked door cannot be open. Keys are ordinary items whose content declares the lock they fit; ids are global, and validation rejects invalid or ambiguous lock/key relationships. This is authored metadata, not a procedural placement-id scheme. See `src/core/blockEntities.ts`, `BlockEntities`, and `src/core/schema.ts`.

`world.interact` opens or closes a door. A carried matching key is activated on a closed door to lock or unlock it from either side. The action rechecks reach, key and state when queued and when completed. A locked door with prying support can be forced with the qualifying carried tool; prying destroys the padlock and leaves the door unlocked, making forced entry a one-way breach. See `src/game/play.ts`, `startPlay`, and `src/core/prying.ts`, `pryPlan`.

The `lock_test` site keeps its key beside the shed and the crowbar in the debug loadout; its key is outside the hamlet's found-material closure. The medical-hall pharmacy uses the same key-or-crowbar contract, with its key in the front counter. See `src/content/base/templates-medical.json` and `src/content/base/layouts-playtest.json`.

Picking, shambler bashing and hunting-cabin placement remain outside this minimal lock system. Save identity changes normally; no old-save migration path is provided.
