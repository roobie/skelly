---
read_if:
  - you inspect the rural cellar support frame or its walking clearance
---

# Rural cellar support look

This fixture makes the cellar frame inspectable without travelling to a house or
finding a light. See `layouts.jsonnet`, `ruralCellarSupportLook`, and `starts.jsonnet`,
`ruralcellarsupportlook`.

## Check by eye and by play

Open `/?start-mod=skelly.deadvox.scenario.buildings.rural-cellar-support-look#{debug:true}`.
The start faces the frame with a lit lamp already in hand.

- Look up: each longitudinal joist should bear directly on its own pillar. The
  crosshead should join the joists against the ceiling, with no lower crosshead
  or gap above it.
- Walk around the pillars and back to the cellar door. Check that the stair and
  the route to the plant fittings remain clear, and that the fittings are reachable.

The fixture covers visual and movement review. The structural and authored-route
contracts are checked separately by `packages/deadvox/test/buildingSupport.test.ts`
and deadvox validation; a good-looking frame alone is not proof of support.
