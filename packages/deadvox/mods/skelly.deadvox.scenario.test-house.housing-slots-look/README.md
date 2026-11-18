---
read_if:
  - you review housing-slot state or need a staged housing to try a part transfer against
---

# Housing-slot look

Open `/?start-mod=skelly.deadvox.scenario.test-house.housing-slots-look#{debug:true}`.

The look stages state only. No approved interaction surface for housing slots exists, so it claims no playable look and
invents no plant screen; until one is approved, its evidence is core evidence, recorded by
`packages/deadvox/test/housingSlotsLook.test.ts`. The parts, blueprint and housings are this mod's own fixture content
(`housing-slots.jsonnet`), so the check exercises slot rules, not any production assembly. Two fixed housings stand at
different places so their untouched parts vary by placement alone; the spare fits the empty slot, the pocketed part fits
none, and the full bin refuses a removed part.
