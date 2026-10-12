---
read_if:
  - you change the vehicle part model, build page or vehicle exports
  - you start vehicle content, in-game vehicles or saved vehicle state
  - you derive vehicle behavior from its parts
  - you pick up an open vehicle design question
---

# Vehicle spike: vehicles built from parts

The spike is a debug page for judging vehicle appearance and disassembly before vehicles enter game content. The workshop's Range Rover is static scenery; it does not imply vehicle simulation. The goal is in [DESIGN.md](../DESIGN.md#vehicles).

## Decided

- Keep the 4×4, pickup and motorbike in the part model.
- Vehicle noise comes mainly from the engine; chassis and hull may contribute.
- Use vehicle-owned fittings, one catalogue id per part type and positions stored on mirrored fittings.
- Keep sand paint with seeded wear and scratches where rendering cost allows.

## Catalogue, blueprints and vehicles

A blueprint is content; a vehicle instance owns its fitting state. This lets builds omit or change fittings without creating a second model, and lets two vehicles of one blueprint evolve independently. Part types have one catalogue identity so a removed part can remain the same type across vehicles. See `src/vehicles/model.ts`, `PartType`, `Blueprint`, `VehicleInstance` and `Fitting`.

A part cannot be removed while another fitting depends on it, or installed before its supports exist. Support is the structural boundary that prevents floating assemblies. Keep part definitions content-shaped so a future schema can adopt them without rewriting the model. Shared part types are appropriate where the part serves the same role across builds.

Paint is vehicle-owned; non-paint material colors belong to the part type. Wear is per fitting and seeded by vehicle/fitting identity so it remains stable across loads without altering shape. Keep detail bounded by mesh cost. See `src/vehicles/wear.ts`, `fittingWear` and `wearGrid`.

## Noise comes from the build

Vehicle noise is expressed as hearing radius so it can join Deadvox sound admission without a second unit system. The engine is the source; hull and silencer damp it. Because intensity falls with the square of distance, source radii add in quadrature; each fitted damper scales the total, so removing one never makes the vehicle quieter. See `src/content/base/senses.jsonnet`, `hearingRangeScale`, and `src/vehicles/model.ts`, `PartNoise` and `noiseRadius`.

## Proportions

The 4×4 follows a Range Rover Classic four-door; the pickup follows a Toyota Hilux N80 regular-cab long-bed 4WD; the motorbike follows an early Honda CG125. The hatchback remains a comparison port so other vehicle profiles can be judged against a common reference. The chosen references keep prototypes recognizable without claiming manufacturer-exact geometry. Measurements live in `src/vehicles/rangeRover.ts`, `src/vehicles/pickup.ts` and `src/vehicles/motorbike.ts`.

The pickup's regular-cab split is not published: its front clip follows the double-cab elevation and its door follows a period two-door, leaving bed length an estimate. The bike has no cabin, so its seat carries the rider viewpoint. References: [Range Rover Classic](https://en.wikipedia.org/wiki/Range_Rover_Classic), [1981 four-door elevation](https://getoutlines.com/blueprints/26562/1981-land-rover-range-rover-3.5-v8-4-door-suv-blueprints), [Hilux model range](https://www.pakwheels.com/new-cars/toyota/hilux/1988-1997), [1989 Hilux](https://www.carsales.com.au/research/toyota/hilux/1989/no-badge), [Hilux 4×4 specifications](https://itstillruns.com/1989-toyota-4x4-truck-specs-7657039.html), [N80 elevations](https://getoutlines.com/requests/3395/1992-toyota-hilux-v-4wd-drawings), [Honda CG125](https://en.wikipedia.org/wiki/Honda_CG125), [CG125 specifications](https://motodealers.co.uk/bikes/atlas-honda/cg125/2012/specs), and [scaled side view](https://the-blueprints.com/vectordrawings/show/25351/honda_cg_125_ml_today).

## Grain and shape

The part grid preserves fitting placement; subdivided voxels let the model express thin structure, wheel arches, seats and controls. Mesh cost is per part type, so fitting instances can share geometry. Keep the voxel engine project's control; a finer grain must not render one object per voxel. See `src/vehicles/model.ts`, `PART_CELL` and `VOXELS_PER_CELL`.

## Deferred, each with its trigger

- Placement rules and quarter-turn orientations: when a player or editor can place a part. Supports remain stored choices; contact only proposes candidates.
- `needs`/`provides` on part types: when a part can fit more than one host.
- Motion axes, steering and driven-wheel identity: when steering or drive is implemented.
- Part condition, attachment, joints and consequences for supported parts: when collision can damage parts or fitting takes tools and time.
- Per-fitting paint and a removable-part item: when parts become inventory items.
- Parked vehicle save representation: when vehicles enter saves.
- Baked meshes and distance LOD: when several vehicles share an in-game view.
- Content schema and pack validation: after the source of truth for shape authoring is chosen.
- Cargo as stored items rather than fittings: when vehicle storage exists.

Derived mass, center of mass, noise and later handling/power/fuel should follow fitted parts rather than duplicate vehicle totals.

## Open decisions for BR

1. How far designers should support building unforeseen vehicles.
2. Whether welded structure is one player-facing part or many.
3. Whether paint wear and condition are separate.
4. Whether items and fitted parts share condition terms.
5. Whether near-side parts can fit the far side.
6. Where part voxel shapes are authored as content.
7. How heavy parts move once removed.
