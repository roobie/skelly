---
read_if:
  - you check by eye that a window cover hides a lit lamp from a shambler outside
  - you change `packages/engine/src/core/agentPerception.ts`, `canSeeLight`, or `packages/engine/src/core/blockEntities.ts`, `lightBlockingBoxes`
  - you change the fixture's room, window, lamp or shambler
---

# Lit window look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.lit-window-look#{debug:true}).

At midnight a plank room stands on the test-house lot with one bare window in its west wall and a lamp lit on a
crate inside. The player starts inside, beside the window, with a hammer in hand and the stock for every window
cover at their feet. A shambler stands in the yard facing the window, in line with the lamp; the wall hides the
player from it, so only the lamp can draw it. The rule the look checks is under `packages/deadvox/SLICE-5.md`,
"Light stimulus".

## Check

1. At the start the shambler sees the lamp through the bare glass and walks to the window.
2. Stay still while fitting a cover: a walking player is heard through the wall. Fit wood boards over the window,
   then the sheet panel in their place. With either cover fitted the lamp is no longer seen from the yard.
3. A shambler that already walked to the window keeps its attention on where it last saw the lamp. To see a
   cover hide the lamp, reload the start and fit the cover before the shambler has moved.
4. Take the cover off and hang the curtain. The closed curtain hides the lamp as the boards did; drawn open it
   shows the lamp again.
