---
read_if:
  - you check torch cuts on terrain cells by eye (#2046)
  - you change `packages/engine/src/core/cellCutting.ts`, `cellCutPlan`, or `packages/engine/src/core/longAction.ts`, `LongActions.beginCutting`
  - you change the fixture's joist run, slab, metal runs or timber post
---

# Torch cut look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.torch-cut-look#{debug:true}).

A concrete wall carries a steel joist run out over a concrete pad at eye height, and a concrete slab lies on the run.
The wall holds the run only through the joist end cell beside it, so cutting that cell drops the run and the slab.
The player starts south of that cell, outside the fall zone, facing it at noon, with a blowtorch in hand on a full
cartridge, a spare cartridge in the jeans, and every skill at its top level from the start kit. A chain-link run, a
galvanized wall and a plank post stand clear of the fall zone. The rules the look checks are under
`packages/deadvox/DESIGN.md`, "Cutting cells".

## Check

1. At the start the joist run and the slab stand out from the wall, held by it, and nothing has fallen.
2. Without moving, interact with the aimed joist end (`packages/mods/skelly.controls/controls.jsonnet`,
   "world.interact") and choose Cut. The torch strikes at a steady beat with its own sound, the cell cracks as it
   takes damage, and the cartridge fill drops strike by strike.
3. Stop the cut part way, save and reload: the cracks are as they were. Choose Cut again and it carries on from that
   damage rather than starting over.
4. Let the cut finish. The cut cell breaks and drops its yield as items, and the rest of the run and the slab drop
   straight down onto the pad as rubble with no warning beforehand. The player, outside the fall zone, is unharmed.
5. The chain-link run and the galvanized wall both offer Cut. The concrete wall and the plank post offer none: heat
   leaves masonry alone, and timber too until the torch chars it (#2046).
6. Cut until the cartridge runs dry: the cut stops and Cut says why. Swap in the spare cartridge and the cut carries on.
