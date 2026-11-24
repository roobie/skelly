---
read_if:
  - you check by eye that a window cover hides a lit lamp from a shambler outside
  - you change `packages/engine/src/core/agentPerception.ts`, `canSeeLight`, or `packages/engine/src/core/blockEntities.ts`, `lightBlockingBoxes`
  - you change the fixture's room, window, lamp or shambler
---

# Lit window look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.lit-window-look#{debug:true}).

At midnight a plank room stands on the test-house lot with one bare window in its west wall and a lamp lit on a
crate inside. The lamp starts unlit, because fitting a cover is timed work and a lit bare lamp would draw the
shambler before it finished. The player starts inside, beside the window, with a hammer in hand and a saw and the
stock for every window cover at their feet. A shambler stands in the yard facing the window, in line with the lamp;
the wall hides the player from it, so only the lamp can draw it. The rule the look checks is under
`packages/deadvox/SLICE-5.md`, "Light stimulus".

## Check

Each check starts from a fresh load, since a shambler that was drawn keeps its attention. Stay still while fitting
a cover: a walking player is heard through the wall.

1. Bare: light the lamp. The shambler sees it through the glass and walks to the window.
2. Boards: fit wood boards over the window, then light the lamp. The shambler is not drawn.
3. Panel: the same with the sheet panel.
4. Curtain: hang the curtain and keep it closed, then light the lamp. The shambler is not drawn. Draw the curtain
   open: the shambler is drawn to the lamp.
