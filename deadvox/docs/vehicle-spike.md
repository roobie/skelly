---
read_if:
  - you change the vehicle spike page, its part model or its builds
  - you start a vehicle content schema, a vehicle editor or in-game vehicles
  - you add part condition, functional networks or removed parts as items to vehicles
  - you derive a vehicle stat from its parts, such as noise or mass
  - you change how paint wear is placed or drawn
  - you model a vehicle that isn't a car, such as a motorbike
---

# Vehicle spike: vehicles built from parts (r43)

A debug page for judging how vehicles look and come apart before any of them reach the
game. It is not in Deadvox's default entry point and the game loads none of it. Open
`/vehicle-spike.html` on the dev server. URL parameters pick the build and the camera
preset; see `src/debug/vehicleSpike.ts`, `BUILDS` and `VIEWS`. That file holds the scene
and the page state, `src/debug/vehicleSpikePanel.ts` the lit-html control panel (ADR 0001),
and `src/debug/vehicles/` the model. The goal these builds test is in
[DESIGN.md](../DESIGN.md#vehicles), "Vehicles".

## BR's rulings

Verbatim, with the question each answers (2026-10-06):

- **On r43-5's 4×4** (16:27): "the 4x4 is really frickin' cool! Nice job"
- **Is noise a derived stat, mainly the engine's?** (16:28): "yes, it's mainly a property of
  the engine, but the chassis/hull can factor in too"
- **Rebuild the pickup and the motorbike on the part model, or drop them?** (16:28): "yes,
  do it"
- **Is the 4×4's sand paint right?** (16:28): "sand is good! But maybe, if not too
  difficult, adding wear and scratches and stuf like that"

## Parts, fittings and builds

See `src/debug/vehicles/model.ts`, `PartType`, `Fitting` and `Vehicle`.

- **Part types stay content-shaped,** so a later content schema can adopt them without a
  rewrite: `voxels.ts`, `ShapeOp`.
- **Far-side fittings mirror their near-side type,** so a side-specific part is authored
  once: `Fitting.mirror`.
- **A build is a vehicle with fittings left off,** not a second model, so what holds for
  one build holds for the others: `rangeRover.ts`, `STRIPPED_REMOVED`.
- **Vehicles share a part type only where the part is the same at this grain,** so a fix
  lands everywhere it should and nowhere else: the pickup's imports from `rangeRover.ts`.
  The shared wheel is the 205R16 both 4WDs ran on; the other shared types differ on the
  real vehicles by less than a voxel.

## Support: nothing floats

`Fitting.supportedBy` names every fitting a part rests on. A part can't come off while
something rests on it, and can't go on before all its supports are on
(`dependentsOf`, `missingSupports`). The page refuses such a toggle and says why. r43-3
placed parts freely, with no relation between a roof panel and the posts under it, and
its roof panels read as floating slabs.

Only frame parts rest on nothing, so every other part hangs from the structure through
its supports. On the motorbike the frame is that root, and the fork and swingarm are the
only ways to the wheels, so the rule still refuses what a mechanic couldn't do.

`test/vehicleParts.test.ts` checks every vehicle's builds against these rules and against
physical sense (contact, overlap, ground). Those are properties, so the test needs no
update when a part is reshaped or a vehicle is added to its list.

## Noise comes from the build

BR's ruling above. See `model.ts`, `PartNoise` and `noiseRadius`; the values sit on the
part types.

- **The unit is Deadvox's hearing radius in metres:** a source is like a sound's
  `noise.radiusMetres` (`src/content/base/sounds.json`), and a damper scales it like a
  zombie sense's `hearingRangeScale` (`src/content/base/senses.json`). A vehicle's figure
  can then feed the noise system unchanged once vehicles are in the game. The spike only
  shows it.
- **The engine is the source, and the hull and silencer damp it.** Sources add in
  quadrature, because sound intensity falls with the square of distance, and each fitted
  damper scales the total. Taking a part off therefore never makes a vehicle quieter, and
  a motorbike, with no bonnet or floor around its engine, keeps more of its engine's
  noise than a car.

## Paint wear

BR's ruling above. See `src/debug/vehicles/wear.ts`, `fittingWear` and `wearGrid`, and
`vehicleSpike.ts`, `fittingMeshes`.

- **One amount per fitting,** spread around the vehicle's level by a hash of the fitting
  id. Wear is then per-fitting state, the seam the goal's condition can widen, and two
  vehicles of one type don't wear alike.
- **It goes where vehicles wear:** dirt low and around the wheels, scratches along exposed
  sides, chips on edges, and rust at seams, mostly low down. All of it is seeded by the
  fitting id, so a build wears the same way on every load.
- **Wear recolours paint and seam voxels into a few shades derived from the paint**
  (`wearPalette`), and never changes a shape. Few shades keep most of the greedy mesher's
  merges, and only a worn fitting gets its own geometry; an unworn one still shares its
  type's. A texture would need UVs and a material per fitting, which the vertex-coloured
  mesh avoids. Measured on the 4×4 in r43-6 (PR #310 has the figures): draw calls stayed
  the same, triangles grew by about half at the page's default wear and nearly doubled at
  full wear, and assembly took about a fifth longer.
- **At 20 m it reads as grime around the arches;** scratches and rust show up close. BR
  asked for it "if not too difficult", and this is the depth that cost allowed.

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

Each vehicle follows published dimensions, rounded to whole voxels in the shapes and
fittings of its file in `src/debug/vehicles/`:

- **4×4:** the Range Rover Classic four-door: length, width, height, wheelbase, track,
  wheel diameter, overhangs, and the waist and glass lines (sources:
  <https://en.wikipedia.org/wiki/Range_Rover_Classic> and the 1981 four-door blueprint at
  <https://getoutlines.com/blueprints/26562/1981-land-rover-range-rover-3.5-v8-4-door-suv-blueprints>).
- **Pickup:** the Toyota Hilux N80 regular cab, long bed, 4WD (sources:
  <https://www.pakwheels.com/new-cars/toyota/hilux/1988-1997>,
  <https://www.carsales.com.au/research/toyota/hilux/1989/no-badge>,
  <https://itstillruns.com/1989-toyota-4x4-truck-specs-7657039.html> and the N80
  elevations at <https://getoutlines.com/requests/3395/1992-toyota-hilux-v-4wd-drawings>).
  No source gives the regular cab's split between cab and bed. It is derived from the
  double cab drawing's front clip and a period two-door's door, so the bed length is an
  estimate.
- **Motorbike:** the early Honda CG125 (sources:
  <https://en.wikipedia.org/wiki/Honda_CG125>,
  <https://motodealers.co.uk/bikes/atlas-honda/cg125/2012/specs> and the scaled side view at
  <https://the-blueprints.com/vectordrawings/show/25351/honda_cg_125_ml_today>).
- **Hatchback:** round 3's model ported to the part model as it was, kept as a comparison.

## The motorbike: where the model stretched

BR's ruling above asked for it. Two wheels, no body shell and a frame that is the
structure needed no model change: the wheels are fittings on the centre plane with no
mirror, a layer holds whatever parts a vehicle has, and support works as described above.

- **One change: a rider position.** `PartType.rider` marks where a rider's hips sit on a
  part. The bike's seat carries it, and the page puts the bike's rider's-eye view there
  (`vehicleSpike.ts`, `riderView`) in place of a look into a cabin.
- **What the model can't express yet,** for the design review against the goal:
  - a lean: fittings only move and mirror, so the bike stands on its centre stand rather
    than leaning on a side stand;
  - steering: `Fitting.motion` turns a part about a fixed axis of the vehicle, not the
    fork's raked steering axis;
  - drive: nothing says which wheel is driven.

## Where the deferred model parts attach

None of these is built. Each has one place to go, so adding it doesn't reshape the
model:

- **Condition** (damage, missing bolts) is per fitting, not per type. It sits beside the
  set of installed fitting ids that the page keeps, keyed by fitting id. Paint wear is
  the first per-fitting state, derived from the fitting id rather than stored.
- **Functional networks** (fuel, power, coolant, drive) are declared on the part type, as
  what each type provides and needs. A network is satisfied by a path of installed
  fittings, much as support is a graph over fittings.
- **Removed parts as items:** a fitting that comes off becomes an item carrying its part
  type and condition. Fitting it again needs its supports, as now. The stripped build's
  wheels lying stacked on the floor are rendered from their part types this way
  (`looseObject` in `vehicleSpike.ts`).
- **Derived stats:** mass, centre of mass and noise come from the installed fittings
  (`measure`, `noiseRadius`), so handling and load would take the same route.
