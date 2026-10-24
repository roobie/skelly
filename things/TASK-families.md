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

## Turned, revolved and coiled stock

Done: `aa_battery`, `duct_tape`, `nails`, `stick` and `wax` each have a tool-authored
row, GLB and model entry, with authored mass and handling datums, in
`packages/thing-authoring-tool/materials.libsonnet`.

## Families left

None by census: every item the census listed has a row in
`packages/thing-authoring-tool/items.jsonnet`, and the recipe exports every row. What phase 4
still owes is the check that each tool-authored GLB replaced its old model and that each
family's handling datums are authored against the geometry.

Books and notes and firearm-adjacent mounts have no missing references in this census;
mount source migration stays with the gun tool. Existing non-tool-authored GLBs still
need source migration in phase 4 even when they are not missing models.

## Deliberately not forced

`compass` keeps its dedicated held display; a ground model must not replace it.
`work_in_progress` is a zero-mass crafting placeholder, not a usable item family.
Inventory pictures follow `packages/deadvox/INTERFACE.md`, "Item pictures", and are
outside this family's models.
