---
read_if:
  - you change the vehicle spike page, its part model or its builds
  - you start a vehicle content schema, a vehicle editor or in-game vehicles
  - you add part condition, functional networks or removed parts as items to vehicles
  - you derive a vehicle stat from its parts, such as noise or mass
  - you change how paint wear is placed or drawn
  - you model a vehicle that isn't a car, such as a motorbike
  - you change what a vehicle owns, or how part types are named, coloured and shared
  - you pick up a deferred vehicle item or one of BR's open vehicle decisions
---

# Vehicle spike: vehicles built from parts (r43)

A debug page for judging how vehicles look and come apart before they enter game content.
It is not in Deadvox's default entry point; the workshop uses its Range Rover blueprint as
static display scenery and runs no vehicle simulation. d124-5 builds the workshop voxel grid
on first use of `src/render/workshopVehicle.ts`, `workshopCar`, so runs that never draw the
workshop do not pay for its display mesh. Open `/vehicle-spike.html` on the dev server. URL
parameters pick the build and the camera preset; see `src/debug/vehicleSpike.ts`, `BUILDS` and
`VIEWS`. That file holds the scene
and the page state, `src/debug/vehicleSpikePanel.ts` the lit-html control panel (ADR 0001),
and `src/vehicles/` the model. The goal these builds test is in
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
- **Make the design review's three model changes now, in this PR?** (18:07): "310 as
  recommended". A one-pass design review of the spike against the vehicle goal found the
  part model sound but a vehicle's state shaped for a customizer. The lead recommended its
  change-now set (vehicles that own their fittings, one id per part type across one
  catalogue, mirrored fittings stored at their own position), and BR approved it.

## Catalogue, blueprints and vehicles

See `src/vehicles/model.ts`, `PartType`, `Blueprint`, `VehicleInstance` and
`Fitting`.

- **A vehicle owns its fittings,** made from a blueprint and changed one fitting at a time:
  `newInstance`, `removeFitting`, `addFitting`. A state that is only a subset of a
  designer's fitting list can do no more than customize that list. It can't hold a part
  the designer didn't list, a part moved, or a part from another vehicle, and the goal is
  a builder ([DESIGN.md](../DESIGN.md#vehicles), point 1). Two vehicles of one blueprint
  then change independently, and saves, items and damage have one place to build on.
- **A blueprint is content, a vehicle is state:** `Blueprint`. A build is a vehicle made
  without some of its blueprint's fittings, not a second model, so what holds for one build
  holds for the others: `rangeRover.ts`, `STRIPPED_REMOVED`. A part outside the factory
  build is fitted, not switched on: `hatchback.ts`, `HATCHBACK_ADD_ONS`.
- **One catalogue, one id per part type,** so a part taken off as an item names the same
  type whatever vehicle it came from: `catalogue.ts`, `CATALOGUE`; `model.ts`,
  `catalogueOf`. A type drawn to fit one model's body takes that model's name
  (`authoring.ts`, `metaFor`). The ids stay plain, because "Content and modding" in
  DESIGN.md namespaces ids by pack only where they would clash, and these are all one
  pack's.
- **Colours that aren't paint are one table, and paint belongs to the vehicle,** so a part
  looks the same on any vehicle and a loose part draws from its type and a paint, with no
  vehicle (the part keeping its own paint is deferred below, under the `vehiclePart` item):
  `materials.ts`, `MATERIALS`; `model.ts`, `Paint`; `vehicleSpike.ts`, `looseObject`.
- **A mirrored fitting stores its own position, and `mirror` only reflects its shape,** so
  a far-side part is authored once, its position needs no vehicle width, and a rotation can
  join `mirror` later without changing what `at` means: `authoring.ts`, `pairAcross`.
- **Part types stay content-shaped,** so a later content schema can adopt them without a
  rewrite: `voxels.ts`, `ShapeOp`.
- **Vehicles share a part type where one serves both at this grain,** so a fix lands
  everywhere it should: the 205R16 wheel both 4WDs ran on, and one crossmember, battery,
  steering wheel and lever for both builds. The pickup's frame rails are spaced to take the
  4×4's crossmember. See the pickup's imports from `rangeRover.ts`.

## Support: nothing floats

`Fitting.supportedBy` names every fitting a part rests on. A part can't come off while
something rests on it, and can't go on before all its supports are on
(`removeFitting`, `addFitting`). The page refuses such a toggle and says why. r43-3
placed parts freely, with no relation between a roof panel and the posts under it, and
its roof panels read as floating slabs.

Only frame parts rest on nothing, so every other part hangs from the structure through
its supports. On the motorbike the frame is that root, and the fork and swingarm are the
only ways to the wheels, so the rule still refuses what a mechanic couldn't do.

`test/vehicleParts.test.ts` checks every blueprint's builds against these rules and
against physical sense (contact, overlap, ground). Those are properties, so the test needs
no update when a part is reshaped or a blueprint is added to its list.

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
  damper scales the total. Taking a damper off therefore never makes a vehicle quieter, and
  a motorbike, with no bonnet or floor around its engine, keeps more of its engine's
  noise than a car.

## Paint wear

BR's ruling above. See `src/vehicles/wear.ts`, `fittingWear` and `wearGrid`, and
`vehicleSpike.ts`, `fittingMeshes`.

- **One amount per fitting,** spread around the vehicle's level by a hash of the vehicle
  and the fitting (`wearKey`). Wear is then per-fitting state, the seam the goal's
  condition can widen, and two vehicles of one blueprint don't wear alike.
- **It goes where vehicles wear, seeded by the vehicle and the fitting,** so a vehicle
  wears the same way on every load: `wornMaterial`.
- **Wear recolours paint and seam voxels into a few shades derived from the paint, plus
  rust** (`wearPalette`), and never changes a shape. Few shades keep most of the greedy mesher's
  merges, and only a worn fitting gets its own geometry; an unworn one still shares its
  type's. A texture would need UVs and a material per fitting, which the vertex-coloured
  mesh avoids. Measured on the 4×4 in r43-6: draw calls stayed
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

Cost is per part type, not per voxel: each type is meshed once per side and paint, and
every unworn fitting of it reuses that geometry (`voxels.ts`, `meshGrid`;
`vehicleSpike.ts`, `partMeshes`). In r43-2, drawing one voxel at a time made the software-rendered preview
unresponsive at a finer grain.

## Proportions

Each vehicle follows published dimensions, rounded to whole voxels in the shapes and
fittings of its file in `src/vehicles/`:

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
- **What the model can't express yet** (steering and drive are deferred below):
  - a lean: fittings only move and mirror, so the bike stands on its centre stand rather
    than leaning on a side stand;
  - steering: `Fitting.motion` turns a part about a fixed axis of the vehicle, not the
    fork's raked steering axis;
  - drive: nothing says which wheel is driven.

## Deferred, each with its trigger

None of these is built, and each waits for the event that needs it:

- **Fitting rules in the model** (the overlap, contact and ground checks that
  `test/vehicleParts.test.ts` makes), and **quarter-turn orientations** beside `mirror`:
  when a player or an editor can place a part. Supports stay stored data: contact proposes
  candidates, the fitter chooses, and `supportedBy` keeps the choice.
- **`needs` and `provides` on part types:** when the first part can go on more than one
  host, such as a bull bar, a roof rack or a plate.
- **Motion and its axis on the part type, with `steerable` and `driven`:** in the round
  that adds steering or drive.
- **Condition, attachment and joints on the vehicle's fitting:** when collisions damage
  parts, or when fitting a part takes tools and time.
- **What happens to the parts resting on a support that damage removes:** when collisions
  damage parts.
- **Per-fitting paint, and the `vehiclePart` item** that a removed part becomes, carrying
  its type and condition: when parts become items.
- **Parked vehicles that stay blueprint references** until something changes them: when
  vehicles enter the save.
- **A baked mesh per parked vehicle, and a distance level of detail:** when several
  vehicles share a view in the game.
- **The content schema, pack loading and validation of the baked voxel grids:** after
  BR chooses the source of truth below. The workshop's TypeScript blueprint reference is an
  interim placement based on the spike. It does not establish the vehicle-content source of truth.
- **Cargo as items in storage rather than fittings** (the 4×4's spare wheel is a fitting):
  when storage is built.

Derived stats take one route: mass, centre of mass and noise come from the fitted parts
(`measure`, `noiseRadius`), and handling, power and fuel would too.

## Open decisions for BR

Questions the design review raised for BR to decide, by topic:

1. **Reach of building:** how far "build things the designers didn't foresee" goes.
2. **Welded structure:** whether a factory car's welded structure is one thing to the
   player or separate parts.
3. **Weathering vs condition:** whether paint wear and condition are two values.
4. **One condition ladder:** whether items and fitted parts share one set of condition
   words.
5. **Handedness:** whether a near-side part fits the far side.
6. **Source of truth for shapes:** where a part's voxel shape is authored for content.
7. **Moving heavy parts:** how a part such as an engine moves once it is an item.
