---
read_if:
  - you change door-lock content, interaction or save ownership
  - you inspect the lock_test first-look fixture
---

# Minimal door locks

A template palette entry can give one door an initial lock state:

```json
"D": {
  "furniture": "wood_door",
  "facing": "n",
  "lock": { "id": "test_shed", "locked": true }
}
```

An ordinary item definition names the id it fits with
`"key": { "lock": "test_shed" }`. Keys have no separate instance payload or
inventory. BlockEntities owns the door's lock state, clones authored metadata,
and saves it alongside `open`; a locked door cannot be open.

Ids are global/authored, not scoped per placement. Content validation rejects
invalid ids, locks on non-door furniture, doors whose lock has no key, and keys naming no actual door.
Authored-site validation rejects repeated lock ids across doors, building
placements, and storeys. Unused palette declarations do not create usable locks.
This is intentionally not a procedural placement-id scheme. Explicit bedroom
and cellar storeys use the same palette metadata, with no floor-specific lock
field: compiled pieces retain the lock while placement lowers cellar geometry.
Use distinct palette characters and ids for independently keyed doors.

## Interaction

- `world.interact` opens/closes doors. A locked door with prying tuning starts
  a pry when a qualifying tool is carried; other locked doors remain locked.
  See `src/game/play.ts`, `startPlay`, and `src/core/prying.ts`, `pryPlan`.
- Wield the matching key and activate it on a closed door to lock/unlock it,
  from either side, in the door's handling time. The door must be in reach.
- A missing held key says **Hold the key in your hands**; a wrong key says
  **The key doesn't fit**. An open door says **Close the door first**.
- Door prompts show the key's activation verb and any refusal when a held key
  targets its door. Open/close is admitted by F's target pick; lock/unlock also
  checks reach, key and state at enqueue and completion. Locking/unlocking is silent.

The authored `lock_test` site has a locked shed with its key in the small box
beside the front step. Use `?site=lock_test&debug=1` for a preview. The debug
loadout includes the crowbar; the key remains outside the hamlet's found-material
closure.

The crowbar is a costly fallback so a key left on a corpse does not strand the
player; its strikes use the existing sound and zombie-hearing path. BR answered
#309 at 19:31, “it's destroyed”: prying destroys the padlock and leaves the door
unlocked, making forced entry a one-way breach. See `src/core/prying.ts`,
`pryPlan`, and `src/core/blockEntities.ts`, `BlockEntities.breakLock`.

## Medical hall pharmacy

BR ruled for d122-6, “to keep it simple, we'll go for 1:(b), 2:front counter”
(2026-10-07 11:13). The pharmacy door uses the existing #309 key-or-crowbar lock
contract, and the matching key is fixed in the medical hall's front counter;
`src/content/base/templates-medical.json` and
`src/content/base/layouts-playtest.json` own those placements. The pharmacy stays
reachable with its key or by forcing the existing padlock.

Picking, shambler bashing, and the hunting-cabin map placement remain outside
this minimal pull-forward. Save identity changes normally; there is no old-save
migration or compatibility path.
