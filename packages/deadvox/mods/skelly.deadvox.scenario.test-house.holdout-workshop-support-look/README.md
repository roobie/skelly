---
read_if:
  - you inspect the Holdout plant, workshop office or workshop parts store support frames by eye
  - you change the roofs, steel joists or bearing walls in these templates
---

# Holdout workshop support look

Open `/?start-mod=skelly.deadvox.scenario.test-house.holdout-workshop-support-look#{debug:true}`.

The fixture starts at noon beside the Holdout power plant, workshop office and workshop parts store with every skill at its top level.

## Check by eye and by play

- Look up inside each building: steel joists sit above standing height, directly below the roof, and run between its bearing walls.
- In the plant hall, find the two brick piers that bear the joists; walk from the double door around them to the generator and lamp.
- Walk through each doorway and around the furnishings: the joists leave standing headroom and the entrance remains clear.
- Check that all three roofs remain intact while the building is loaded.

`packages/deadvox/test/buildingSupport.test.ts`, "reports support and rural eligibility for every Holdout admission candidate", proves that the templates hold on natural ground.
