---
read_if:
  - you review the plant instruments' mounting, readability, light or fault labels
  - you change the instrument look or its daylight and dark-room fixtures
  - you author a retained ruined housing in a showroom
---

# Plant-instrument look

Open the [gallery](/?start-mod=skelly.deadvox.scenario.test-house.plant-instruments-look#{debug:true}) or the
[dark booth](/?start-mod=skelly.deadvox.scenario.test-house.plant-instruments-dark-look#{debug:true}).

Use the HUD toggle for an unobstructed view. These starts isolate instrument readability from the restoration loop.
The gallery starts within reach of its
faulted housing so opening inventory exposes the fault label without arranging a repair. Its detail must also be
reachable by keyboard focus. The separate booth removes daylight as a substitute for the RUN lens's own emission.
The browser projection check is `packages/deadvox/test/browser/plant-instruments.ts`, `plantInstrumentFixtureProof`.

Mounting is a proposal for BR's visual judgement, not an approved housing shape. Geometry and calibration belong in
`packages/mods/skelly.electric-power/plant-instruments.libsonnet`, `offset` and `dial`; the fixture housings belong in
`instruments.jsonnet`, `furniture`. This separation keeps a mounting revision out of renderer code.

The showroom's full-wear specimen represents a retained standing ruin, not a fresh destruction event. It must keep
healthy internals so shell damage cannot masquerade as slot failure. See `packages/engine/src/core/inventory.ts`,
`Inventory.furnishSpawn`, and `packages/deadvox/test/plantInstruments.test.ts`, which checks that this initial state
neither ruins nor materialises its baseline parts. Ordinary seeded furniture wear still excludes full ruin.
