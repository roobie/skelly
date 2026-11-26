---
read_if:
  - you inspect the Holdout plant, workshop office or workshop parts store support frames by eye
  - you change the roofs, steel joists or bearing walls in these templates
---

# Holdout workshop support look

Open `/?start-mod=skelly.deadvox.scenario.test-house.holdout-workshop-support-look#{debug:true}`.

The fixture starts at noon beside the Holdout power plant, workshop office and workshop parts store with every skill at its top level.

## Check by eye and by play

- Look up inside each building: steel joists sit directly below the roof and run between its bearing walls.
- Walk through each doorway and around the furnishings: the joists are above the usable room and the entrance remains clear.
- Check that all three roofs remain intact while the building is loaded.

`packages/deadvox/test/buildingSupport.test.ts`, "reports support and rural eligibility for every Holdout admission candidate", proves that the templates hold on natural ground.
