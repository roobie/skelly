---
read_if:
  - you continue phase 4 of the things suite or review its packaged-goods family
---

# Remaining families

Working census for #509, from compiled core-pack item rows and model references in
`packages/deadvox/src/content/base/`, not the issue's historical count. Rows with no
model reference are listed below; no referenced model was missing. Items with shared
existing models are not missing models. Delete this phase task file when phase 4 merges.

## First family: packaged goods and containers

Chosen because boxes and revolved vessels cover the most missing items without new
engine primitives. Wearables need soft silhouettes; keys and lights need more varied
builders. Each package still owns its source row, finish and mass.

Implemented in g76-1: `canned_beans`, `canned_soup`, `crackers`, `chocolate_bar`,
`soda_can`, `water_bottle`, `juice_carton`, `ammo_can`, `jerry_can`, `gas_canister`,
`shotshell_box`, `cartridge_box_308_h_winchester`, `cartridge_box_5_d_56x45`,
`cartridge_box_7_d_62x39`, `cartridge_box_357_h_magnum`.

## Families left, in suggested order

- Turned, revolved and coiled stock: `aa_battery`, `duct_tape`, `nails`, `stick`, `wax`.
- Flat stock and sheets: `scrap_metal`, `wooden_plank`, `field_patch`.
- Small tools, lights and keys: `camp_armoury_key`, `camp_hq_safe_key`, `dad_cabin_key`,
  `pharmacy_key`, `shed_key`, `gauntlet_police_armoury_key`, `headlamp`, `torch`,
  `candle`, `lighter`, `matches`.
- Hand tools: `blowtorch`, `can_opener`.
- Appliance and electronics housings: `portable_radio`.
- Kits: `repair_kit`.
- Medical and repair supplies: `bandage`, `antiseptic`, `antibiotics`, `painkillers`,
  `codeine`, `morphine`, `rag`.
- Wearables and bags: `weapon_sling`, `baseball_cap`, `jeans`, `rubber_boots`,
  `cargo_pants`, `hoodie`, `jacket`, `utility_vest`, `fanny_pack`, `school_backpack`,
  `hiking_backpack`.
- One-offs: `apple`, `frag_grenade`, `shambler_torso`, `shambler_head`,
  `shambler_left_arm`, `shambler_right_arm`, `shambler_left_leg`, `shambler_right_leg`.

Books and notes and firearm-adjacent mounts have no missing references in this census;
mount source migration stays with the gun tool. Existing non-tool-authored GLBs still
need source migration in phase 4 even when they are not missing models.

## Deliberately not forced

`compass` keeps its dedicated held display; a ground model must not replace it.
`work_in_progress` is a zero-mass crafting placeholder, not a usable item family.
Inventory pictures follow `packages/deadvox/INTERFACE.md`, "Item pictures", and are
outside this family's models.
