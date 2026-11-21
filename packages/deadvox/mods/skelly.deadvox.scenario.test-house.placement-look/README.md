---
read_if:
  - you review placement picking: a spot's ghost, its refusal and its review's destination row
  - you review a placement recipe's two authored orders, spot-first and review-first
  - you review door boarding started from the door's hold ring
---

# Placement look

Open `/?start-mod=skelly.deadvox.scenario.test-house.placement-look#{debug:true}`.

The room is the build-kit look's shell with nothing built that picking builds: the doorway's leaf carries no boards,
the wall gap stays open and the window frame bare, while the tools, nails and planks stand beside the spawn and one
occupied spot (the shelf) refuses a ghost. Reachable stock at the builder's feet avoids searching containers
before the check. The start knows the fixture's quick recipes (`placement.jsonnet`, `work`) and the real construction
kit, so both orders can be driven as the player meets them. The real plank floor recipe exercises the authoring
default; see `packages/mods/skelly.basic-recipes/basic-recipes-construction.jsonnet`, `placementOrder`.

1. **Spot-first from the crafting tab:** select the quick plank wall in the crafting tab; its Start reads
   "Pick a spot" and closes the screen. Aim at the wall gap: the see-through wall stands at the aimed cell tinted
   valid, the prompt line names the build and the turn key. Aim at the shelf: the tint turns refused and the prompt
   line carries the engine's live reason, which hides with the interaction-hint setting. The use key on a valid spot
   pins it and opens the review, whose Start builds; the wall stands in the gap and the recipe needs reopening for
   another.
2. **Review-first from the crafting tab:** select the quick shelf; its review opens with a "Choose a spot" row and a
   refused Start. Choosing a spot enters picking; the ghost's front faces the builder and the turn key turns it. A
   confirmed free spot needs no existing piece's name beside "Change spot", and Start commits on the pinned spot alone.
3. **Boarding from the door's ring:** hold the use key on the doorway's leaf; its ring offers Board up. The ghost
   draws the boards on the face that faces the player, the turn key flips the face, and the refusal comes from the
   engine. Confirm, then Start, and the leaf carries its boards on the chosen side.
