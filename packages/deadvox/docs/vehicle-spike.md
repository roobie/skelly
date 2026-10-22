---
read_if:
  - you change the vehicle part model, build page or vehicle exports
  - you add a vehicle part, capability or vehicle blueprint to content
  - you start vehicle content, in-game vehicles or saved vehicle state
  - you derive vehicle behavior from its parts
  - you distinguish the visual spike from the settled vehicle slice design
---

# Vehicle spike: vehicles built from parts

The spike is a debug page for judging vehicle appearance and disassembly before vehicles enter game content. The workshop's Range Rover is static scenery; it does not imply vehicle simulation. The goal is in [DESIGN.md](../DESIGN.md#vehicles).

## Decided

- Keep the 4×4, pickup, sedan and motorbike in the part model. The sedan is the everyday car, because a mid-size family car is what a survivor most often finds.
- Vehicle noise comes mainly from the engine; chassis and hull may contribute.
- Use vehicle-owned fittings, one catalogue id per part type and positions stored on mirrored fittings.
- Keep sand paint with seeded wear and scratches where rendering cost allows.

## Catalogue, blueprints and vehicles

A blueprint is content; a vehicle instance owns its fitting state. This lets builds omit or change fittings without creating a second model, and lets two vehicles of one blueprint evolve independently. Part types have one catalogue identity so a removed part can remain the same type across vehicles. See `src/vehicles/model.ts`, `PartType`, `Blueprint`, `VehicleInstance` and `Fitting`.

Support prevents floating assemblies during deliberate editing; see `src/vehicles/model.ts`, `addFitting` and `removeFitting`. Those editor refusal rules do not implement impact detachment. The game must cascade through unsupported dependents while preserving surviving items, as specified in `SLICE-6.md`, "Condition, appearance and attachment".

Seeded cosmetic wear permits visual variation without changing shape or implying functional damage. Keep detail bounded by mesh cost. See `src/vehicles/wear.ts`, `fittingWear` and `wearGrid`. The game's appearance belongs to the part through salvage and refitting; the spike's vehicle paint is not a competing production ownership rule.

## Noise comes from the build

Vehicle noise is expressed as hearing radius so it can join Deadvox sound admission without a second unit system. The engine is the source; hull and silencer damp it. Because intensity falls with the square of distance, source radii add in quadrature; each fitted damper scales the total, so removing one never makes the vehicle quieter. See `src/content/base/senses.jsonnet`, `hearingRangeScale`, and `src/vehicles/model.ts`, `PartNoise` and `noiseRadius`.

## Proportions

The 4×4 follows a Range Rover Classic four-door; the pickup follows a Toyota Hilux N80 regular-cab long-bed 4WD; the sedan follows the mid-size class of the Ford Mondeo Mk3 saloon; the motorbike follows an early Honda CG125. The hatchback remains a comparison port so other vehicle profiles can be judged against a common reference. The chosen references keep prototypes recognizable without claiming manufacturer-exact geometry. Measurements live in `src/vehicles/rangeRover.ts`, `src/vehicles/pickup.ts`, `src/vehicles/sedan.ts` and `src/vehicles/motorbike.ts`.

The sedan's content name stays generic: a class reference guides shape, while a manufacturer or model name in game content would claim a specific car. It has no separate frame, so its welded shell components are the roots its other parts rest on. Its door mirrors rest on the A-pillars, because a fitting does not follow the pose of a hinged fitting it rests on; see `src/vehicles/sedan.ts`, `mirror`.

The pickup's regular-cab split is not published: its front clip follows the double-cab elevation and its door follows a period two-door, leaving bed length an estimate. The bike has no cabin, so its seat carries the rider viewpoint. References: [Range Rover Classic](https://en.wikipedia.org/wiki/Range_Rover_Classic), [1981 four-door elevation](https://getoutlines.com/blueprints/26562/1981-land-rover-range-rover-3.5-v8-4-door-suv-blueprints), [Hilux model range](https://www.pakwheels.com/new-cars/toyota/hilux/1988-1997), [1989 Hilux](https://www.carsales.com.au/research/toyota/hilux/1989/no-badge), [Hilux 4×4 specifications](https://itstillruns.com/1989-toyota-4x4-truck-specs-7657039.html), [N80 elevations](https://getoutlines.com/requests/3395/1992-toyota-hilux-v-4wd-drawings), [Mondeo Mk3](https://en.wikipedia.org/wiki/Ford_Mondeo_(second_generation)), [Honda CG125](https://en.wikipedia.org/wiki/Honda_CG125), [CG125 specifications](https://motodealers.co.uk/bikes/atlas-honda/cg125/2012/specs), and [scaled side view](https://the-blueprints.com/vectordrawings/show/25351/honda_cg_125_ml_today).

## Grain and shape

The part grid preserves fitting placement; subdivided voxels let the model express thin structure, wheel arches, seats and controls. Mesh cost is per part type, so fitting instances can share geometry. Keep the voxel engine project's control; a finer grain must not render one object per voxel. See `src/vehicles/model.ts`, `PART_CELL` and `VOXELS_PER_CELL`.

## From the spike to the game

The settled scope and dependency order are in `SLICE-6.md`, "Reviewable build order"; further directions and their issue triggers are in `SLICE-6.md`, "Deferred work and its trigger". The spike remains a visual instrument, not the authority for production item ownership, damage, saves or physics.

VAT assembles thing-tool-authored parts and exports baked geometry. That boundary lets the game load validated content without evaluating authoring shapes. Shared exported per-part mass and centre of mass replace a parallel vehicle physical authority; see `things/WORK.md`, "Decisions". Cargo remains items within fitted storage rather than becoming fittings itself.

The first loop builds from factory structures, uses welded assemblies as player-facing units, and shares unhanded parts across compatible hosts. Independent appearance and event-driven condition keep salvage history without scheduled maintenance. The shared item condition vocabulary avoids a meaning change when a part comes off. Heavy recovery uses a drivable hoist vehicle, so it exercises the same build and ownership rules rather than a separate equipment model.

## Export contract

A vehicle part is an item whose exported model carries per-part mass, centre of mass, baked collision and named datums, so salvage, inventory and fitting share one identity and the game never evaluates authoring shapes. A blueprint is content that names parts by item id and places each fitting in the vehicle frame, so a mod adds a compatible part or host with data alone. See `src/core/schema.ts`, `VehicleBlueprintSchema`, and `src/content/base/vehicles.jsonnet`.

Capabilities are a closed vocabulary because each one needs game code to mean anything; content naming another is refused rather than ignored. See `src/core/schema.ts`, `VEHICLE_CAPABILITIES`.

Validation refuses a part whose export lacks part masses or baked collision, a fitting that names no vehicle part, and supports that are absent or cyclic, so the content file that authors them is dropped whole like any other broken content. See `src/core/vehicleBlueprint.ts`, `vehicleContentIssues`. Loading takes mass and centre only from the export; a mirrored fitting reflects its centre, collision and datums across z about its position, so a far-side twin needs no second export. See `src/core/vehicleBlueprint.ts`, `placeFitting`.

Until VAT ships in #323, blueprints are authored as content rather than exported by a tool, so the contract does not wait on an editor; whether content stays the blueprint authority once VAT exists awaits BR's ruling, due with #323.
