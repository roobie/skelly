---
read_if:
  - you continue phase 4 of the things suite or decide whether it is complete
  - you migrate a hand-made Deadvox item model to the thing tool
  - you move a handling datum out of Deadvox content into the thing tool
---

# Remaining families

Working record for #509. Every item the original census listed has a row in
`packages/thing-authoring-tool/items.jsonnet`, and the recipe in
`packages/thing-authoring-tool/exports/deadvox.jsonnet` exports every row, so no family
is left to build in the order the census proposed. Compass keeps its dedicated held
display, so a ground model must not replace it; `work_in_progress` is a zero-mass crafting
placeholder, not a usable item family. Inventory pictures follow
`packages/deadvox/INTERFACE.md`, "Item pictures". Delete this phase task file when phase 4
merges.

## What holds

For every thing-tool row the GLB Deadvox loads is the one the recipe exports:
`test/things-deadvox-contract.test.mjs` checks the committed GLB and model entry against the
recipe output, and `packages/deadvox/src/content/base/models-items.jsonnet` takes its entries
from `packages/deadvox/src/content/base/things/index.json`. No GLB in `packages/deadvox/src/content/base/assets/models` is
unreferenced.

## Remaining: items needing a tool source

Deadvox models that no tool authors (not the thing tool, not gungen; mobgen writes no item
models). Each is a hand-made GLB with a hand-written entry in
`packages/deadvox/src/content/base/models-items.jsonnet`, and each needs a thing-tool row,
model and authored mass, replacing the hand-made file:

- Hand tools and parts: `hand_saw`, `screwdriver`, `pliers`, `wire_spool`, `small_spring`,
  `hinge_set`, `fastener_pack`, `flashlight_mount`, `scrap_foregrip`.
- Salvage and scrap: `glass_shards`, `glass_lens`, `glass_bulb`, `wood_offcut`,
  `rubber_strip`, `circuit_board`, `cloth_bundle`, `lamp_oil_bottle`.
- Light: `glowstick` (also drawn for `road_flare`).
- Broken appliances and electronics: `broken_toaster`, `table_fan`, `cracked_phone`,
  `broken_clock`, `electrical_repair_kit`, `sewing_kit`.
- Worn gear: `stab_vest`, `riot_helmet`, `riot_helmet_view` (the worn view, no item),
  `night_vision_goggles`.
- Paper: `paper_sheet`, `folded_note`, `notebook`, shared by the notes, maps and books.

`pliers` has no item using it, so check whether it is dead before authoring it.
`oil_lamp` reuses the tool-authored lamp GLB with its own grip and flame datums, so it needs
only the datum fix below.

## Remaining: items needing datum or model fixes

Deadvox overrides the tool's exported grip, hold, roll or anchors for these, so the datums
are not authored against the geometry (`things/WORK.md`, "Decisions"). Move each datum into
its tool row against a named solid and delete the override, in
`packages/deadvox/src/content/base/models-melee.jsonnet` and `models-items.jsonnet`:

- The melee set: `crowbar`, `hammer`, `sledgehammer`, `baseball_bat`, `kabar`,
  `kitchen_knife`, `machete`, `wrench`, `steel_pipe`; their strike, face, claw and edge
  anchors move too.
- `flashlight` (grip and lens anchor), `oil_lamp` (grip and flame anchor).

Tool rows with no handling datum that a player carries, and so take Deadvox's default hold:
`electrical_tape`, `sewing_thread`, `nylon_cord`, `fuse`, `bear_trap`, `scissor_jack`,
`bottle_jack`, `engine_hoist`, `dead_desk_lamp`. Rule whether the default hold suffices or each
needs a datum. Vehicle parts, `cargo_space` and `player_bust` are fitted or worn, not held,
and need none.
