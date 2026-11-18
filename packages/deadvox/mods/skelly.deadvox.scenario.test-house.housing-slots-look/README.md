---
read_if:
  - you review housing-slot state or need a staged housing to try a part transfer against
  - you review part-gated plant modules or need a failed and a working module on one bus
---

# Housing-slot look

Open `/?start-mod=skelly.deadvox.scenario.test-house.housing-slots-look#{debug:true}`.

No approved interaction surface for housing slots exists, so the look claims no playable part transfer and invents no
plant screen; until one is approved, the transfer evidence is core evidence, recorded by
`packages/deadvox/test/housingSlotsLook.test.ts`. The parts, blueprints, housings and modules are this mod's own fixture
content (`housing-slots.jsonnet`), so the checks exercise slot and gate rules, not any production assembly.

Two fixed housings stand at different places so their untouched parts vary by placement alone; the spare fits the empty
slot, the pocketed part fits none, and the full bin refuses a removed part.

Two plant modules share one bus with an ordinary electric lamp, and the site keeps only the showroom deck, because a
site is one grid and the house's own supply would light the lamp without them. The failed module has no core, its
authored critical failure; the working module's seeded core is above its minimum, and either module alone lights the
lamp. The core in the jeans is the failed module's spare. Check in order:

1. Failed versus working: the lamp is lit. Switch the working module off with the ordinary use control; the lamp goes
   dark although the failed module stays switched on.
2. Supply after fitting: with the core fitted into the failed module, the lamp lights again with the working module
   still off.
3. Reload: after save and Continue, the lamp stays lit and the core stays fitted.

Step 1 is playable. Steps 2 and 3 need a fit, so they are core evidence until a housing surface exists.
