---
read_if:
  - you review housing-slot state or need a staged housing to try a part transfer against
  - you review part-gated plant modules or need a failed and a working module on one bus
  - you review what a ruined housing does with its parts, open or with no room for its drops
  - you need a module whose seeded failure is restored by timed part service
---

# Housing-slot look

Open `/?start-mod=skelly.deadvox.scenario.test-house.housing-slots-look#{debug:true}`.

Hold on a piece and choose Work on to open its part service review, where every fit and remove starts.
`packages/deadvox/test/housingSlotsLook.test.ts` records the same staging as core evidence. The parts, blueprints,
housings and modules are this mod's own fixture content (`housing-slots.jsonnet`), so the checks exercise slot and gate
rules, not any production assembly; the Holdout restoration looks check the production module
(`packages/deadvox/mods/skelly.deadvox.scenario.holdout.restoration/README.md`).

Two fixed housings stand at different places so their untouched parts vary by placement alone; the spare fits the empty
slot, the pocketed part fits none, and the full bin refuses a removed part.

Two plant modules share one bus with an ordinary electric lamp, and the site keeps only the showroom deck, because a
site is one grid and the house's own supply would light the lamp without them. The failed module has no core, its
authored critical failure; the working module's seeded core is above its minimum, and either module alone lights the
lamp. The casing and winding in the jeans craft a core, the spare for either module's failed core, so the spare is
obtained rather than handed over. Check in order:

1. Failed versus working: the lamp is lit. Switch the working module off with the ordinary use control; the lamp goes
   dark although the failed module stays switched on.
2. Supply after fitting: craft the core, then fit it into the failed module through its review; the lamp lights again
   with the working module still off.
3. Reload: after save and Continue, the lamp stays lit and the core stays fitted.

Two more modules on the same bus start switched off, worn to one blow from ruin, each holding a healthy core and a
frame that fills a whole pile. The open one has free floor around it; kerbs fill every floor cell beside the blocked
one, so its core has nowhere to land beside the frame. The bat in hand deals the final blow. Check in order:

1. Retained piece, no generation: switch the working module off and the blocked module on; the lamp is lit. Strike the
   blocked module: it stays standing at full damage with its parts, and the lamp goes dark while its switch stays on.
2. Recoverable piles: strike the open module; it falls to piles holding its frame and core.

The serviced module on the same bus starts switched on but dark: the seed fails one of its two critical cores, so the
lamp checks above read as before. Its cores need the screwdriver in the hoodie and a crafting skill the start grants, and
take time; its cover is instant and nothing requires it, so the same review and Start covers a zero-time job.
`packages/deadvox/test/partService.test.ts` records the restoration loop as core evidence.
