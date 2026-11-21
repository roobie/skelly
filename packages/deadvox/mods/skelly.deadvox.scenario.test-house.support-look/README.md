---
read_if:
  - you check structure support, rubble landing and its cascade by eye (#1332)
  - you change `packages/engine/src/core/structureSupport.ts`, `createSupport`, or `packages/engine/src/core/terrainStrike.ts`, `cascadeSupport`
  - you change the fixture's post, beam run or floor
---

# Support look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.support-look#{debug:true}).

A free-standing plank post stands on a concrete pad at noon. At its top, just above eye height, a short plank beam
runs east and a short plank floor runs south toward the player, both held only by the post. The player starts south
of the post, facing it, with a sledgehammer in hand and every skill at its top level from the start kit. The first
aim meets the post's eye-height cell, below both runs. The rule the look checks is under
`packages/deadvox/SLICE-5.md`, "Support".

## Check

1. At the start the beam run and the floor stand in the air off the post's top, held by it, and nothing has
   fallen.
2. Without turning, break the aimed post cell: swing the sledgehammer at it until it breaks, or toggle the debug
   build tool and use its destroy key on it (`packages/mods/skelly.controls/controls.jsonnet`, "debug.build-toggle",
   and `packages/mods/skelly.controls/controls.jsonnet`, "debug.build-destroy").
3. Stop swinging when the post breaks: its top drops into the gap as rubble, onto the standing stub. The beam
   run and floor drop straight down onto the pad as rubble, leaving their old positions empty. The drop is instant,
   not animated; rubble must not hang in the air. Stop before another swing hits the landed rubble.
4. The post cells below the gap stay standing on the pad, and the pad and the lot are unchanged.
5. Save, reload and look again: the rubble and the standing stub are as they were.
