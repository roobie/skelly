---
read_if:
  - you distinguish intact vehicle disassembly from destructive salvage
  - you change the vehicle part model, build page or vehicle exports
  - you add a vehicle part, capability or vehicle blueprint to content
  - you start vehicle content, in-game vehicles or saved vehicle state
  - you derive vehicle behavior from its parts
  - you distinguish the visual spike from the settled vehicle slice design
  - you consider porting or adding a TypeScript spike vehicle
  - you change the crane truck or its lifting rule
  - you add a vehicle to the parked fleet, or change a family kit or shared vehicle part
  - you author an electric or hybrid configuration of a blueprint
  - you author a wreck blueprint or decide what one offers the player
  - you review a vehicle with its whole-vehicle render tools
---

# Vehicle spike: vehicles built from parts

The spike is a debug page for judging vehicle appearance and disassembly. Game content carries its vehicles on the content path; see `docs/vehicle-spike.md`, "The fleet from content". The workshop's Range Rover is static scenery; it does not imply vehicle simulation. The goal is in [DESIGN.md](../DESIGN.md#vehicles).

## Decided

- Keep the 4×4, pickup, sedan and motorbike in the part model. The sedan is the everyday car, because a mid-size family car is what a survivor most often finds.
- Vehicle noise comes mainly from the engine; chassis and hull may contribute.
- Use vehicle-owned fittings, one catalogue id per part type and positions stored on mirrored fittings.
- Keep sand paint with seeded wear and scratches where rendering cost allows.

## Catalogue, blueprints and vehicles

A blueprint is content; a vehicle instance owns its fitting state. This lets builds omit or change fittings without creating a second model, and lets two vehicles of one blueprint evolve independently. Part types have one catalogue identity so a removed part can remain the same type across vehicles. See `src/vehicles/model.ts`, `PartType`, `Blueprint`, `VehicleInstance` and `Fitting`.

Two authoring paths live side by side. Vehicles authored as TypeScript under `src/vehicles` stay as built: their looks were approved on that path, the spike page and furniture content show them (`src/vehicles/catalogue.ts`, `BLUEPRINTS`), and porting them without a vehicle feature to exercise them would shape the vehicle schema from spike needs that feature may discard. The spike and its TypeScript vehicles expire with the vehicle feature, so nothing ports. A content blueprint of the same class, such as the motorbike or the APC, is separate content authored on the content path, not a port. New vehicles use only the content path; see `packages/deadvox/docs/vehicle-spike.md`, "Export contract".

Support prevents floating assemblies during deliberate editing; see `src/vehicles/model.ts`, `addFitting` and `removeFitting`. Those editor refusal rules do not implement impact detachment. The game must cascade through unsupported dependents while preserving surviving items, as specified in `SLICE-6.md`, "Condition, appearance and attachment".

Seeded cosmetic wear permits visual variation without changing shape or implying functional damage. Keep detail bounded by mesh cost. See `src/vehicles/wear.ts`, `fittingWear` and `wearGrid`. The game's appearance belongs to the part through disassembly and refitting; the spike's vehicle paint is not a competing production ownership rule.

## Noise comes from the build

Vehicle noise is expressed as hearing radius so it can join Deadvox sound admission without a second unit system. The engine is the source; hull and silencer damp it. Because intensity falls with the square of distance, source radii add in quadrature; each fitted damper scales the total, so removing one never makes the vehicle quieter. See `src/content/base/senses.jsonnet`, `hearingRangeScale`, and `src/vehicles/model.ts`, `PartNoise` and `noiseRadius`. This rule lives only in the spike's part model: content parts gain noise with the engine noise of `SLICE-6.md`, "Cabin, cargo and driving".

## Proportions

The 4×4 follows a Range Rover Classic four-door; the pickup follows a Toyota Hilux N80 regular-cab long-bed 4WD; the sedan follows the mid-size class of the Ford Mondeo Mk3 saloon; the crane truck, the heavy-part hoist, follows a light cab-over truck of the Mitsubishi Fuso Canter class with a deck-mounted telescopic boom; the motorbike follows an early Honda CG125; the hatchback follows a Volkswagen Golf Mk4 five-door. The box van follows no single model: it takes the sizes common to European 3.5-tonne chassis cabs with a dry-freight box, because the commonest van a survivor finds is the class, and its in-game name stays generic. The chosen references keep prototypes recognizable without claiming manufacturer-exact geometry. The eight-wheeled APC takes the Stryker family as visual reference only; its content name stays generic, so no manufacturer or programme name enters content. Measurements live in `src/vehicles/rangeRover.ts`, `src/vehicles/pickup.ts`, `src/vehicles/boxVan.ts`, `src/vehicles/sedan.ts`, `src/vehicles/motorbike.ts`, `src/vehicles/apc.ts` and, for the hatchback and the crane truck, `packages/thing-authoring-tool/vehicle-parts.libsonnet`, `hb` and `ht`. A fleet vehicle's class and measures head its own `.spec.libsonnet` under `packages/thing-authoring-tool/vehicles`.

Every vehicle's content name stays generic: a class reference guides shape, while a manufacturer or model name in game content would claim a specific car. The sedan has no separate frame, so its welded shell components are the roots its other parts rest on. Its door mirrors rest on the A-pillars, because a fitting does not follow the pose of a hinged fitting it rests on; see `src/vehicles/sedan.ts`, `mirror`.

A transport vehicle's crew space must fit a crouched player, from the rear ramp opening to the front, so walking inside can come later without a resize. The APC's compartment therefore leaves the player's crouched height and body width free, with margin; the sizes come from the player's own definitions, not from the blueprint. See `test/vehicleParts.test.ts`, "the APC troop compartment", which measures the TypeScript APC; no test holds the content APC to this.

A troop carrier stows its crew's kit and ammunition: without storage it reads as an empty shell. The APC therefore fits lockers, rifle racks, ammunition racks and an outside bin, none of them in the crouched walk's way. Storage is a part type's `storage` pockets, sized like a furniture container's; the items inside are cargo, never fittings. What a wreck's stowage holds is a loot decision, not a vehicle one. See `src/vehicles/model.ts`, `PartStorage`, and `test/vehicleParts.test.ts`, "the APC stowage".

The APC's hull is several frame fittings that stand in for one factory-welded assembly, because the spike's part model has no assembly grouping. Its add-on armour panels are fittings on the hull side, so protection comes off and goes on like any other part instead of becoming a hull property.

The pickup's regular-cab split is not published: its front clip follows the double-cab elevation and its door follows a period two-door, leaving bed length an estimate. The bike has no cabin, so its seat carries the rider viewpoint. References: [Range Rover Classic](https://en.wikipedia.org/wiki/Range_Rover_Classic), [1981 four-door elevation](https://getoutlines.com/blueprints/26562/1981-land-rover-range-rover-3.5-v8-4-door-suv-blueprints), [Hilux model range](https://www.pakwheels.com/new-cars/toyota/hilux/1988-1997), [1989 Hilux](https://www.carsales.com.au/research/toyota/hilux/1989/no-badge), [Hilux 4×4 specifications](https://itstillruns.com/1989-toyota-4x4-truck-specs-7657039.html), [N80 elevations](https://getoutlines.com/requests/3395/1992-toyota-hilux-v-4wd-drawings), [Mondeo Mk3](https://en.wikipedia.org/wiki/Ford_Mondeo_(second_generation)), [Mitsubishi Fuso Canter](https://en.wikipedia.org/wiki/Mitsubishi_Fuso_Canter), [Honda CG125](https://en.wikipedia.org/wiki/Honda_CG125), [CG125 specifications](https://motodealers.co.uk/bikes/atlas-honda/cg125/2012/specs), [scaled side view](https://the-blueprints.com/vectordrawings/show/25351/honda_cg_125_ml_today), [Stryker family](https://en.wikipedia.org/wiki/Stryker), [Golf Mk4](https://en.wikipedia.org/wiki/Volkswagen_Golf_Mk4) and [Golf Mk4 dimensions](https://www.carexpert.com.au/volkswagen/golf/2001/dimensions).

## The hatchback from content

The hatchback was rebuilt from a real car because the earlier one was too poor a reference to judge other profiles against. It keeps the earlier roles: a transport host and the common comparison reference. Its in-game name stays generic for the same reason as the sedan's.

A new vehicle starts on the content path, as thing-tool parts and a content blueprint, so what the game loads is authored once. The `.ts` part model holds spike concepts, not a production schema. The spike page loads a content build through the same loader as the game; see `src/debug/vehicleSpike.ts`, `assembleContentBuild`, and `src/core/vehicleBlueprint.ts`, `assembledVehicle`.

Parts alike across hosts are authored once and placed by each blueprint, so parts disassembled from one host fit another. The hatchback's own panels are pressed for its body, so they are authored where they sit on it and fit at the vehicle origin. Several body parts are made of pieces with different finishes, such as a door's skin, glass and trim; see `packages/thing-authoring-tool/src/families/compound.ts`. Glazing is see-through through a material finish's opacity; see `packages/thing-core/src/materials.ts`, `MaterialSchema`.

The body shell carries the mass of wiring, trim and sound deadening that no part models, so the fitted car weighs what the reference does at the kerb. Keeping that mass in the shell needs no extra parts or fittings to author; the cost, accepted, is that handling may feel less nose-heavy than the front-engined reference.

A body panel is larger than a floor pile, so panels stay capped at the pile's whole size; see `src/content/base/vehicle-kit.libsonnet`, `pileSize`. The cap costs nothing until a carrying design gives oversized parts their own carry class.

Real dimensions stay, and the only seated check is entry: every vehicle with a seat has a door or hatch at least as wide as the player. Whether the player figure fits a seat waits until a seated pose exists, because without the pose any fit test would measure the standing figure. See `test/vehicleExport.test.ts`. A bike has no door or hatch, so that check keeps its saddle a plain part without the `seat` capability until `SLICE-6.md`, "Motorbike driving and stand/lean behaviour".

## The crane truck from content

The crane truck is on the content path because heavy recovery depends on it, and building it from authored parts lets its parts be disassembled and fitted like any other vehicle's. It shares the parts that fit across hosts, such as the battery, headlamps, steering wheel and gear lever, and keeps its own road wheel, because a light truck's wheel does not fit a car.

Every part is its own item, so the first loop's welded assemblies do not apply to the crane truck, because each of its parts breaks, wears and is disassembled on its own. The cost, accepted, is a long fitting list.

The boom is telescopic, with its extension a separate part, even though that carries the most debt: a sliding stage sets the vocabulary for vehicle motion early, before other moving parts need it.

The crane has one fixed rated load, carried by its lifting part, because a fixed rating carries the least debt; a chart over reach can replace it when lifting needs one. See `src/core/schema.ts`, `ratedLoadKg`.

The rating is the heaviest load the crane lifts with the hook at the boom's working reach, not a lifting moment, because a moment read as a load would let a light truck lift more than it weighs.

A vehicle that lifts must have a stabiliser fitted, because the stabilisers are a precondition for lifting, not a factor on the rating. A reduced rating with stabilisers stowed stays open.

The rear wheels are single, which adds no debt; twinned wheel parts serve the heavier trucks (`src/content/base/vehicles/shared-parts.libsonnet`, `wheel_twin_225_75r16c`). The load bed is a flat deck, so the crane sets a part down from either side or the rear without dropping sides in the way.

## The fleet from content

Fleet breadth fills the world's roster on the export contract; it does not widen the first loop, whose hosts are in `SLICE-6.md`, "The smallest useful loop". A fleet vehicle is parked content: fitting work needs a service site its blueprint authors (`src/core/inventory.ts`, `vehiclePlacementRefusal`), and it reaches a world only through a layout's placement. Each joins play when those land for it and the driving rounds in `SLICE-6.md`, "Reviewable build order", reach it. A parked helicopter or trailer implies no flight or towing.

A vehicle owns its own files so parallel authors never touch a shared one: shape rows under `packages/thing-authoring-tool/vehicles`, items and blueprint under `src/content/base/vehicles`, and a `.spec.libsonnet` both sides import so a fitting and the panel it places read one measure. Jsonnet imports must be literal, so `tools/vehicle-index.mjs`, `rowFiles`, generates the lists read by `src/content/base/vehicles.jsonnet`, `fleet`, and `packages/thing-authoring-tool/exports/deadvox.jsonnet`, `vehicleParts`. Its `--hold` option lets a landing leave out a vehicle still being authored. `fleet` joins the first hosts, whose blueprints stay in that file with their rows in `packages/thing-authoring-tool/vehicle-parts.libsonnet`.

A family kit shares how a pressing is made, never the part: rows stay per vehicle because each is pressed for its own machine, so a kit saves authoring without implying that a pressing fits across vehicles. See `packages/thing-authoring-tool/vehicles/kit.libsonnet`, `compound`; `packages/thing-authoring-tool/vehicles/machine-kit.libsonnet`, `arc`; `packages/thing-authoring-tool/vehicles/military-kit.libsonnet`, `truckRows`; `packages/thing-authoring-tool/vehicles/helicopter-kit.libsonnet`, `loft`; and, for the inward lean of a car's glass and roof and its chamfered arches, `packages/thing-authoring-tool/vehicles/car-shape.libsonnet`, `band`. A shared part is the reverse: one item many blueprints place, so a part recovered from one vehicle can fit another. See `packages/thing-authoring-tool/vehicles/shared.libsonnet` and `src/content/base/vehicles/shared-parts.libsonnet`.

An electric or hybrid vehicle is a configuration of a blueprint, not a second kind of vehicle: `src/content/base/vehicle-powertrain.libsonnet`, `electric` and `hybrid`, derive it from a base blueprint's fittings, so the drive differs only by which parts are fitted, for the reason under `docs/vehicle-spike.md`, "Export contract". No vehicle-wide powertrain field exists to outlive those parts. The helper stays out of the `vehicles` folder because every file there is indexed as a vehicle.

A wreck's ruin is pressed into the shape of parts made for that wreck, which lets it look as ruined as it needs. A total wreck is made only of those, because it holds nothing to recover and is sawn down into scrap. A partial wreck also fits ordinary parts of its healthy vehicle where they could plausibly survive. The schema has no wreck kind, so the authoring alone decides which a wreck is. The rule and its deferrals are in `SLICE-6.md`, "The smallest useful loop" and `SLICE-6.md`, "Deferred work and its trigger".

A part sheet cannot show whether panels meet, so a vehicle is judged whole: `tools/vehicle-look.mjs`, `combine`, renders a blueprint from its exported parts, and its `--rows` option does so before the rows join content. `tools/vehicle-gallery.mjs`, `readVehicle`, gathers those renders and any written review into one page so a fleet can be watched as it is authored.

## Grain and shape

The part grid preserves fitting placement; subdivided voxels let the model express thin structure, wheel arches, seats and controls. Mesh cost is per part type, so fitting instances can share geometry. Keep the voxel engine project's control; a finer grain must not render one object per voxel. See `src/vehicles/model.ts`, `PART_CELL` and `VOXELS_PER_CELL`.

## From the spike to the game

The settled scope and dependency order are in `SLICE-6.md`, "Reviewable build order"; further directions and their issue triggers are in `SLICE-6.md`, "Deferred work and its trigger". The spike remains a visual instrument, not the authority for production item ownership, damage, saves or physics.

VAT assembles thing-tool-authored parts and exports baked geometry. That boundary lets the game load validated content without evaluating authoring shapes. Shared exported per-part mass and centre of mass replace a parallel vehicle physical authority; see `things/WORK.md`, "Decisions". Cargo remains items within fitted storage rather than becoming fittings itself.

The first loop builds from factory structures, uses welded assemblies as player-facing units, and shares unhanded parts across compatible hosts. Independent appearance and event-driven condition keep recovered-part state without scheduled maintenance. The shared item condition vocabulary avoids a meaning change when a part comes off. Heavy recovery uses a drivable hoist vehicle, so it exercises the same build and ownership rules rather than a separate equipment model.

## Export contract

A vehicle part is an item whose exported model carries per-part mass, centre of mass, baked collision and named datums, so disassembly, inventory and fitting share one identity and the game never evaluates authoring shapes. A blueprint is content that names parts by item id and places each fitting in the vehicle frame, so a mod adds a compatible part or host with data alone. See `src/core/schema.ts`, `VehicleBlueprintSchema`, and `src/content/base/vehicle-kit.libsonnet`, `fitting`.

Capabilities are a closed vocabulary because each one needs game code to mean anything; content naming another is refused rather than ignored. Each capability carries only the numbers the game code that reads it needs, added when that reader lands. See `src/core/schema.ts`, `VEHICLE_CAPABILITIES`.

Driven and steered belong to the part type, not the fitting. Converting a vehicle's drive then means swapping a part, which is also a gameplay hook: finding a driven axle.

A frame, tray or mount that other fittings rest on names the `structure` capability. Marking structure explicitly lets code tell it apart from a part whose capabilities were forgotten, so an empty list can later be refused as an authoring mistake. A door or hatch a player gets in through names `entry`; its hinge is the axis through its `hinge_a` and `hinge_b` datums. A road wheel, the part a vehicle rolls on, names `wheel`.

Left and right parts are one item, mirrored by the slot, so one inventory item fits either side; a handed part therefore cannot refuse the wrong side. Part collision is one axis-aligned box per solid until parked collision adopts the convex hulls chosen in `docs/decisions/0010-parked-vehicle-shape-tier.md`, "Decision"; the move is cheap because the schema slot is already per part. Attachment points get an optional direction and fittings a rotation the first time a fitting must align; the change only adds fields. Until then a leaning or crashed pose is pressed into the part's own rows.

Validation refuses a part or build the game could not load soundly, so the content file that authors it is dropped whole like any other broken content. See `src/core/vehicleBlueprint.ts`, `vehicleContentIssues`, and `test/vehicleExport.test.ts`, `refusals`. Loading takes mass and centre only from the export; a mirrored fitting reflects its centre, collision and datums across z about its position, so a far-side twin needs no second export. See `src/core/vehicleBlueprint.ts`, `placeFitting`.

Hand-written Jsonnet stays the blueprint source, so the contract does not wait on an editor: VAT saves a download to merge by hand (`packages/vehicle-authoring-tool/README.md`, "Save is a download to hand-merge"), its production launch is #323, and it must write the same shape.
