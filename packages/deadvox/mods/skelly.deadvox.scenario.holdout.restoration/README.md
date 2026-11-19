---
read_if:
  - you review restoring Holdout's power plant by part service, by eye and by play
  - you need Holdout's plant and stores staged without the trip or the waves
---

# Holdout restoration looks

Both looks place Holdout's own power plant and stores, so the checks exercise the production module, spares and
recipes rather than fixture content. Waves are off and the stores stand a short walk from the plant, so the time goes
to the restoration. The player starts inside the plant beside the turbo-generator and the lamp it feeds. The seed fails
one of the module's critical parts; which one depends on the seed, so each check reads the failed slot from the review.

## Mechanical check

Open `/?start-mod=skelly.deadvox.scenario.holdout.restoration-look#{debug:true}`.

The backpack holds a spare for every part the seed can fail and the tools every service needs.

1. Failed module: the lamp beside the module is dark.
2. Restore: hold on the module and choose Work on. A worn brush set or governor linkage comes out first: Start its
   remove, and it lands at your feet. Then fit the backpack's spare into the empty slot and Start. A timed fit (brushes
   or governor) can be stopped partway: the lamp stays dark and the part is not fitted until the job is continued from
   the module's ring and finishes. When it finishes, the lamp lights.
3. Maintenance outage: through the review, Start removing the bearing oiler and stop partway. The lamp goes dark
   although every part is still fitted. Continue from the ring: the oiler lands at your feet and the lamp stays dark.
   Pick it up and fit it back; the lamp lights.
4. Zero-time service: through the review, Start removing the field fuse. It lands at your feet at once, with no job,
   and the lamp goes dark. Pick it up and fit it through the same review and Start; the lamp lights at once.
5. Reload: save and Continue. The lamp stays lit and the review shows every part fitted.

## Supply-route check

Open `/?start-mod=skelly.deadvox.scenario.holdout.restoration-route-look#{debug:true}`.

The player starts empty-handed, as in Holdout, so the spare and the tools come from the stores.

1. Failed module: the lamp is dark, and the review refuses the failed slot's service for want of a spare or a tool.
2. Supply: leave by the door and find the small brick stores nearby. One shelf holds a spare of each failure part, the
   other the inputs for another and the tools.
3. Craft, optionally: under Plant parts, make the failed slot's spare from the inputs.
4. Restore: return to the module, remove the worn part if there is one, and fit the spare; the lamp lights.
