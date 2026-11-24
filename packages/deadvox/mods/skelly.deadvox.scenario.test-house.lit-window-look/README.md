---
read_if:
  - you check by eye that a window cover hides a lit lamp from a shambler outside
  - you change `packages/engine/src/core/agentPerception.ts`, `canSeeLight`, or `packages/engine/src/core/blockEntities.ts`, `lightBlockingBoxes`
  - you change the fixture's room, window, lamp or shambler
---

# Lit window look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.lit-window-look#{debug:true}).

At midnight a plank room stands on the test-house lot with one bare window in its north wall and a lamp lit on the
floor inside. The player starts in the yard facing the window, with a hammer in hand and the stock for every window
cover at their feet. A shambler stands in the yard in view of the window. The rule the look checks is under
`packages/deadvox/SLICE-5.md`, "Light stimulus".

## Check

1. At the start the shambler sees the lamp through the bare glass and walks to the window.
2. Fit wood boards over the window from the yard, then the sheet panel in their place. With either cover
   fitted the lamp is no longer seen from the yard, and a shambler that has lost sight of it is no longer drawn.
3. Take the cover off and hang the curtain from the room, entered by the door at the room's far end. The closed
   curtain hides the lamp as the boards did; drawn open it shows the lamp again.
4. Uncovered, the lamp lures again.
