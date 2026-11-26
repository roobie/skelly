---
read_if:
  - you inspect the Holdout plant or workshop support frames and working clearances by eye
  - you change the roofs, steel joists or bearing walls in these templates
---

# Holdout workshop support look

Open `/?start-mod=skelly.deadvox.scenario.test-house.holdout-workshop-support-look#{debug:true}`.

The fixture starts at noon beside the Holdout power plant and workshop buildings with every skill at its top level.

## Check by eye and by play

- Look up inside each building: steel joists sit above standing height, directly below the roof, and bear on walls or columns.
- In the workshop hall, inspect the deck on beams on four columns; walk the working bay around the lift and cars, crossing behind the lift through the rear service opening. Check access to both crates and the lengthwise pit.
- In the plant hall, find the two brick piers that bear the joists; walk from the double door around them to the generator and lamp.
- Walk through each doorway and around the furnishings: the joists leave standing headroom and the entrance remains clear.
- Check that every roof remains intact while the buildings are loaded.

`packages/deadvox/test/buildingSupport.test.ts`, "reports support and rural eligibility for every Holdout admission candidate", proves that the templates hold on natural ground.
