---
read_if:
  - you change the vehicle spike page, its part model or its builds
  - you start a vehicle content schema, a vehicle editor or in-game vehicles
  - you add part condition, functional networks or removed parts as items to vehicles
---

# Vehicle spike: vehicles built from parts (r43)

A debug page for judging how vehicles look and come apart before any of them reach the
game. It is not in Deadvox's default entry point and the game loads none of it. Open
`/vehicle-spike.html` on the dev server. URL parameters pick the build and the camera
preset; see `src/debug/vehicleSpike.ts`, `BUILDS` and `VIEWS`. That file holds the scene
and the page state, `src/debug/vehicleSpikePanel.ts` the lit-html control panel (ADR 0001),
and `src/debug/vehicles/` the model.

## Parts, fittings and builds

See `src/debug/vehicles/model.ts`, `PartType`, `Fitting` and `Vehicle`.

- A **part type** is immutable and content-shaped: a list of voxel shape ops (`ShapeOp`
  in `voxels.ts`) that would serialise to JSON unchanged, so a later content schema can
  adopt it without a rewrite. Palette names such as `paint` let one type take each
  vehicle's colours.
- A **fitting** places one part type on one vehicle. The far-side fitting of a pair
  mirrors the near-side type (`mirror`), so each side-specific part is authored once.
- A **build** is a vehicle with some fittings left off. The stripped 4×4 is the same
  vehicle as the complete one minus `STRIPPED_REMOVED` (`rangeRover.ts`), not a second
  model, so anything learned on one holds for the other.

## Support: nothing floats

`Fitting.supportedBy` names every fitting a part rests on. A part can't come off while
something rests on it, and can't go on before all its supports are on
(`dependentsOf`, `missingSupports`). The page refuses such a toggle and says why. r43-3
placed parts freely, with no relation between a roof panel and the posts under it, and
its roof panels read as floating slabs.

`test/vehicleParts.test.ts` checks the builds against these rules and against physical
sense (contact, overlap, ground). Those are properties, so the test needs no update when a
part is reshaped.

## Grain

Two grids, see `model.ts`, `PART_CELL` and `VOXELS_PER_CELL`:

- **Part cells** keep the darker_yet fitting spike's 4×4 addressing per world block; the
  schematic draws on this grid.
- **Voxels** subdivide each cell, so pillars, the gap around a wheel inside its arch,
  and round lamps can be thinner than a cell. r43-3 chose this grain over Mobgen's
  coarser voxel so that seats, the steering wheel and the dashboard read inside the
  shell. r43-5 kept it and built the 4×4's thinnest parts a few voxels thick.

Cost is per part type, not per voxel: each type is meshed once per side and every
fitting of it reuses that geometry (`voxels.ts`, `meshGrid`; `vehicleSpike.ts`,
`partMeshes`). In r43-2, drawing one voxel at a time made the software-rendered preview
unresponsive at a finer grain.

## Proportions

The 4×4 follows the published dimensions of the Range Rover Classic four-door:
length, width, height, wheelbase, track, wheel diameter, overhangs, and the waist and
glass lines (sources: <https://en.wikipedia.org/wiki/Range_Rover_Classic> and the 1981
four-door blueprint at
<https://getoutlines.com/blueprints/26562/1981-land-rover-range-rover-3.5-v8-4-door-suv-blueprints>),
each rounded to whole voxels in the shapes and fittings of `rangeRover.ts`. The hatchback
is round 3's model ported to the part model as it was, kept as a comparison.

## Where the deferred model parts attach

None of these is built. Each has one place to go, so adding it doesn't reshape the
model:

- **Condition** (wear, damage, missing bolts) is per fitting, not per type. It sits
  beside the set of installed fitting ids that the page keeps, keyed by fitting id.
- **Functional networks** (fuel, power, coolant, drive) are declared on the part type, as
  what each type provides and needs. A network is satisfied by a path of installed
  fittings, much as support is a graph over fittings.
- **Removed parts as items:** a fitting that comes off becomes an item carrying its part
  type and condition. Fitting it again needs its supports, as now. The stripped build's
  wheels lying stacked on the floor are rendered from their part types this way
  (`looseObject` in `vehicleSpike.ts`).
- **Mass and centre of mass** already come from installed fittings (`measure`), so
  derived stats such as load or noise would take the same route.
