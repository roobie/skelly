---
read_if:
  - you add a wear slot or change equipment attachment admission
  - you change special worn-equipment mechanisms, persistence or inventory presentation
---

# Content-owned wear slots

A slot addition must not require another engine, save or UI list edit. Content owns
its identity and presentation; code owns equipment mechanisms. The registry is the
single authority because parallel lists let a wearable equip but disappear from a
panel or fail to save. See `packages/engine/src/core/schema/wearSlots.ts`,
`WearSlotSchema`, and `packages/engine/src/core/schema/files.ts`, `SECTION_DESCRIPTOR`.

Attachment permission is not placement or protection. Items retain their authored
model transforms and visual coverage; body tuning retains damage coverage. A worn
item draws the children in its fitted-item slots with it, so check every child that
any of the host's fitted-item slots admits against the host's destination too:
changing a sling must not evade the same permission that its gun obeys. See
`packages/engine/src/core/wearSlotContent.ts`, `checkWearSlots`;
`packages/engine/src/core/magazine.ts`, `slotsReason`; and
`packages/engine/src/core/wornFigure.ts`, `wornFigureEntries`.

Special behavior uses optional capability providers rather than anatomical IDs.
Missing providers make those mechanics unavailable, not implicit defaults. Shared
body content owns the common attachment vocabulary; consumers depend on it, while
optional magic content owns its own extension. This direction keeps shared bodies
independent of the equipment that may use them. See
`packages/engine/src/core/capabilities.ts`, `CONTENT_CAPABILITIES`, and
`packages/mods/skelly.body/pack/manifest.jsonnet`.

Persistence checks occupancy, not whether the player can equip the item again.
Ruined armour and populated containers must survive a restore, while mismatched
occupants must fail before restored state is published. A save or replay lookup's
type requires the occupant with a slot name, so no lookup can check the name alone.
Valid content IDs must remain safe as dictionary keys rather than being narrowed to
hide inherited-property bugs. See `packages/engine/src/core/inventory.ts`,
`wornOccupancyIssue` and `validateInventoryTree`, and
`packages/engine/src/core/saveFormat.ts`, `SaveContentQuery` and `validateWornReferences`.

Inventory visibility and labels follow the registry. Additional self-view hiding
must not change world or mannequin views: attachment and camera policy answer
different questions. See `packages/presentation/src/ui/inventoryScreen.ts`,
`InventoryScreen.viewModel`, and `packages/presentation/src/render/playerFigure.ts`,
`PlayerMeshes.applySelfMask`. The ready-to-run review fixture is described in
`packages/deadvox/mods/skelly.deadvox.scenario.test-house.wear-slots-look/README.md`.
