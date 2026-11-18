---
read_if:
  - you add a vehicle part, capability or vehicle blueprint to content
  - you change vehicle exports, the content vehicle loader or saved vehicle state
  - you start the vehicle slice proper, such as driving, wheel roll, moving parts, wear or vehicle rendering
  - you derive vehicle behavior from its parts, such as noise, mass or storage
  - you build or save a vehicle with no blueprint
  - you change the crane truck, its lifting rule or the troop carrier's crew space or stowage
  - you pick a real vehicle as the reference for a new one
---

# Content vehicles

Vehicles are content: a part is an item with an exported model, and a blueprint places parts. The design goal and its
rules are in [DESIGN.md](../DESIGN.md#vehicles); the first playable scope is in [SLICE-6.md](../SLICE-6.md). This doc holds the
content rules, and the lessons a TypeScript prototype taught that the vehicle slice proper starts from.

## Decided

- The saloon is the everyday car, because a mid-size family car is what a survivor most often finds.
- Vehicle noise comes mainly from the engine; chassis and hull may contribute.
- A build owns its fittings, each part type has one item id, and a mirrored fitting stores its own position.

## One vehicle model

The content model is the only vehicle model, and no vehicle is authored in code. Two code paths that model one concept
drift apart, and a vehicle written in code is a second copy of a look the assets release already holds as a released
assembly. New vehicles use the content path; see `packages/deadvox/docs/vehicles.md`, "Export contract". Features content lacks, such as part noise, a
rider point and paint wear, are added to content when a reader needs them.

A blueprint is content; a build owns its fitting state. That lets a build omit or change fittings without a second
model, and lets two vehicles of one blueprint change independently. A part type is an item, so a removed part stays the
same type across vehicles. See `packages/engine/src/core/schema/items.ts`, `VehicleBlueprintSchema`, and
`packages/engine/src/core/vehicleInstances.ts`, `VehicleBuild`.

A build's blueprint is optional: an instance stands on its own sites and fittings, and geometry, collision, service and
site names never read the blueprint. A blueprint is where a factory build starts and what names it, not part of what
the build is; how builds and sites are named is in `DESIGN.md`, "Names". One model with an optional blueprint keeps
scratch-built frames, the #322 follow-up in `SLICE-6.md`, "Deferred work and its trigger", open.

Support keeps editing from leaving parts floating: a part something rests on cannot come off, and a part cannot go on
before its supports. Those are editing refusals, not impact detachment, which must cascade through unsupported
dependents while keeping surviving items, as `SLICE-6.md`, "Condition, appearance and attachment", specifies. See
`packages/engine/src/core/vehicleBlueprint.ts`, `supportProblems`, and `packages/engine/src/core/inventory.ts`,
`Inventory.vehiclePlacementRefusal`.

## Export contract

A vehicle part is an item whose exported model carries per-part mass, centre of mass, baked collision and named datums,
so disassembly, inventory and fitting share one identity and the game never evaluates authoring shapes. A blueprint is
content that names parts by item id and places each fitting in the shared model frame
(`packages/skelly-assets/docs/decisions/0002-model-frame.md`, "Decision"), so a mod adds a compatible part or host with
data alone and imported placements need no turn. See `packages/engine/src/core/schema/items.ts`,
`VehicleBlueprintSchema`, and `packages/mods/skelly.ground-vehicles/vehicles.jsonnet`.

Capabilities are a closed vocabulary because each one needs game code to mean anything; content naming another is
refused rather than ignored. Each capability carries only the numbers the game code that reads it needs, added when
that reader lands. See `packages/engine/src/core/schema/items.ts`, `VEHICLE_CAPABILITIES`.

Driven and steered belong to the part type, not the fitting. Converting a vehicle's drive then means swapping a part,
which is also a gameplay hook: finding a driven axle.

A frame, tray or mount that other fittings rest on names the `structure` capability. Marking structure explicitly lets
code tell it apart from a part whose capabilities were forgotten, so an empty list can later be refused as an authoring
mistake. A door or hatch a player gets in through names `entry`; how it opens is its `motion`, which is independent of
`entry`: a bonnet moves without it, and an open cart has it without moving. A road wheel, the part a vehicle rolls on,
names `wheel`.

A wheel, sprocket or idler marks its fitting `spin`, which turns it about its axle as the vehicle travels. Spin belongs
to the fitting rather than the part, because a spare wheel stowed on a rack does not roll, and it is no exported
motion, because it has no stop to open to. A tracked vehicle's track band does not spin, because its links would have
to scroll around the wheels rather than turn about one axle. Each spinning part turns at the rate that keeps its rim at
the vehicle's ground speed, so a large wheel turns slower than a small one beside it. Its radius is the axle's height
above the part's lowest collision point in the export, so a reshaped wheel needs no second number to stay in step, and
validation refuses a spinning part whose collision does not reach below its axle. See
`packages/engine/src/core/schema/items.ts`, `VehicleFittingSchema`, and `packages/engine/src/core/vehicleBlueprint.ts`,
`rollingRadius`.

Left and right parts are one item, mirrored by the slot, so one inventory item fits either side; a handed part therefore
cannot refuse the wrong side. Part collision is one axis-aligned box per solid until the physics solver needs a convex
hull per solid; the move is cheap because the schema slot is already per part. Attachment points get an optional
direction and fittings a rotation the first time a fitting must align; the change only adds fields.

Validation refuses a part whose export lacks part masses or baked collision, a fitting that names no vehicle part,
supports that are absent or cyclic, a lifting part without a rated load or a rated load on any other part, and a lifting
vehicle without a stabiliser, so the content file that authors them is dropped whole like any other broken content. See
`packages/engine/src/core/vehicleBlueprint.ts`, `vehicleContentIssues`. Loading takes mass and centre only from the
export; a mirrored fitting reflects its centre, collision and datums across x about its position, so a far-side twin
needs no second export. See `packages/engine/src/core/vehicleBlueprint.ts`, `placeFitting`.

Until VAT ships in #323, hand-written content blueprints stand in for its output, so the contract does not wait on an
editor. VAT must write the same shape.

## Proportions

Each vehicle follows a real reference at its published dimensions, so sizes are a dependable yardstick, while its
in-game name stays generic, because a manufacturer or model name in content would claim a specific vehicle. The
references keep vehicles recognizable without claiming manufacturer-exact geometry:

- the 4×4: a Range Rover Classic four-door;
- the pickup: a Toyota Hilux N80 regular-cab long-bed 4WD, whose regular-cab split is not published, so its front clip
  follows the double-cab elevation, its door a period two-door, and its bed length is an estimate;
- the saloon: the mid-size class of the Ford Mondeo Mk3;
- the hatchback: a Volkswagen Golf Mk4 five-door;
- the crane truck: a light cab-over truck of the Mitsubishi Fuso Canter class with a deck-mounted telescopic boom;
- the motorbike: an early Honda CG125; it has no cabin, so its seat carries the rider viewpoint;
- the box van: no single model, but the sizes common to European 3.5-tonne chassis cabs with a dry-freight box, because
  the commonest van a survivor finds is the class;
- the eight-wheeled troop carrier: the Stryker family, as visual reference only.

Measurements live with the part models in `packages/skelly-assets/models/vehicles/` and, for the hatchback and the
crane truck, `packages/skelly-assets/models/vehicle-parts.libsonnet`, `hb` and `ht`. References:
[Range Rover Classic](https://en.wikipedia.org/wiki/Range_Rover_Classic),
[1981 four-door elevation](https://getoutlines.com/blueprints/26562/1981-land-rover-range-rover-3.5-v8-4-door-suv-blueprints),
[Hilux model range](https://www.pakwheels.com/new-cars/toyota/hilux/1988-1997),
[1989 Hilux](https://www.carsales.com.au/research/toyota/hilux/1989/no-badge),
[Hilux 4×4 specifications](https://itstillruns.com/1989-toyota-4x4-truck-specs-7657039.html),
[N80 elevations](https://getoutlines.com/requests/3395/1992-toyota-hilux-v-4wd-drawings),
[Mondeo Mk3](https://en.wikipedia.org/wiki/Ford_Mondeo_(second_generation)),
[Mitsubishi Fuso Canter](https://en.wikipedia.org/wiki/Mitsubishi_Fuso_Canter),
[Honda CG125](https://en.wikipedia.org/wiki/Honda_CG125),
[CG125 specifications](https://motodealers.co.uk/bikes/atlas-honda/cg125/2012/specs),
[scaled side view](https://the-blueprints.com/vectordrawings/show/25351/honda_cg_125_ml_today),
[Stryker family](https://en.wikipedia.org/wiki/Stryker), [Golf Mk4](https://en.wikipedia.org/wiki/Volkswagen_Golf_Mk4)
and [Golf Mk4 dimensions](https://www.carexpert.com.au/volkswagen/golf/2001/dimensions).

A car without a separate frame, such as the saloon, has welded shell components as the roots its other parts rest on.

A transport vehicle's crew space must fit a crouched player, from the rear ramp opening to the driver's station, so
walking inside can come later without a resize. The sizes come from the player's own definitions, not from the
blueprint. See `test/troopCarrier.test.ts`, "the troop carrier’s compartment".

A troop carrier stows its crew's kit and ammunition: without storage it reads as an empty shell. Its lockers, rifle
racks, ammunition rack and outside bin stand clear of the crouched walk. A storage part with a fixed inside, such as a
rack or a locker, carries an authored item container, because its design sets that inside; cargo space is room marked
out on a load floor and sized by the floor, which would bend a rack into a floor-area shape it is not. A rack of slots
is a list pocket with a count limit, like a board stack, so it takes up to one item a slot whatever the item's size.
Items inside are cargo, never fittings, and what a wreck's stowage holds is a loot decision, not a vehicle one. See
`packages/mods/skelly.ground-vehicles/troop-carrier.jsonnet`, `rifleRack` and `bin`, and
`test/troopCarrier.test.ts`, "the troop carrier’s stowage". The troop carrier has its own content file because its
racks read the firearms pack and no other vehicle does, so loading the other vehicles needs nothing from that pack.

The troop carrier's hull is several frame fittings that stand in for one factory-welded assembly, because fittings
have no assembly grouping yet. Its add-on armour plates are fittings on the hull side, so protection comes off and goes
on like any other part instead of becoming a hull property.

## The hatchback from content

The hatchback follows a real car because it is the common comparison reference other profiles are judged against, as
well as a transport host. Its in-game name stays generic, as every vehicle's does.

A new vehicle starts on the content path, as thing-tool parts and a content blueprint, so none is authored twice. Parts
alike across hosts are authored once and placed by each blueprint, so parts disassembled from one host fit another. The
hatchback's own panels are pressed for its body, so they are authored where they sit on it and fit at the vehicle
origin. Several body parts are made of pieces with different finishes, such as a door's skin, glass and trim; see
`packages/skelly-assets/tools/packages/thing-authoring-tool/src/families/compound.ts`. Glazing is see-through through a
material finish's opacity; see `packages/skelly-assets/tools/packages/thing-core/src/materials.ts`, `MaterialSchema`.

The body shell carries the mass of wiring, trim and sound deadening that no part models, so the fitted car weighs what
the reference does at the kerb. Keeping that mass in the shell needs no extra parts or fittings to author; the cost,
accepted, is that handling may feel less nose-heavy than the front-engined reference.

A body panel is larger than a floor pile, so panels stay capped at the pile's whole size; see
`packages/mods/skelly.ground-vehicles/vehicles.jsonnet`, `pileSize`. The cap costs nothing until a carrying design gives
oversized parts their own carry class.

Real dimensions stay, and the only seated check is entry: every vehicle with a seat has a door or hatch at least as wide
as the player. Whether the player figure fits a seat waits until a seated pose exists, because without the pose any fit
test would measure the standing figure. See `test/vehicleExport.test.ts`.

## The crane truck from content

The crane truck is on the content path because heavy recovery depends on it, and building it from authored parts lets
its parts be disassembled and fitted like any other vehicle's. It shares the parts that fit across hosts, such as the
battery, headlamps, steering wheel and gear lever, and keeps its own road wheel, because a light truck's wheel does not
fit a car.

Every part is its own item, so the first loop's welded assemblies do not apply to the crane truck, because each of its
parts breaks, wears and is disassembled on its own. The cost, accepted, is a long fitting list.

The boom is telescopic, with its extension a separate part, even though that carries the most debt: a sliding stage sets
the vocabulary for vehicle motion early, before other moving parts need it.

The crane has one fixed rated load, carried by its lifting part, because a fixed rating carries the least debt; a chart
over reach can replace it when lifting needs one. See `packages/engine/src/core/schema/items.ts`, `ratedLoadKg`.

The rating is the heaviest load the crane lifts with the hook at the boom's working reach, not a lifting moment, because
a moment read as a load would let a light truck lift more than it weighs.

A vehicle that lifts must have a stabiliser fitted, because the stabilisers are a precondition for lifting, not a factor
on the rating. A reduced rating with stabilisers stowed stays open.

The rear wheels are single, which adds no debt; a twinned wheel part can come when a heavier truck needs one. The load
bed is a flat deck, so the crane sets a part down from either side or the rear without dropping sides in the way.

## Lessons for the vehicle slice

A TypeScript prototype of voxel vehicles came before the content path. These are its lessons that still hold.

### Noise comes from the build

Vehicle noise is a hearing radius, so it joins sound admission without a second unit system; see
`packages/mods/skelly.senses/senses.jsonnet`, `hearingRangeScale`. The engine is the source; hull and silencer damp it.
Intensity falls with the square of distance, so source radii add in quadrature, and each fitted damper scales the
total, so taking one off never makes the vehicle quieter.

### Seeded wear

Cosmetic wear seeded from the vehicle's and the fitting's identity looks the same on every visit and differs between
two vehicles of one blueprint, without storing anything. Wear changes only finishes, never shape, so it implies no
functional damage, and the part keeps its look through disassembly and refitting. The cost is that a worn fitting can
no longer share its part type's mesh, so wear detail stays bounded by mesh cost.

### Moving parts carry what rests on them

A fitting resting on a part that moves, such as a door mirror on a door, must follow that part's pose, or it hangs in
the air when the door opens. A part's carriers come from its supports, and that walk needs a guard against cycles.
Until the renderer carries dependents, a fitting goes on a part that does not move, as the saloon's mirrors rest on
the A-pillars.

### Wheels turn at their own rate

One spin rate shared by every wheel made a large wheel's rim outrun a small one's. A spinning part turns by distance
travelled over its own rolling radius, the same radius validation reads.

### Mirroring

A far-side twin stores its own reflected position, so mirroring reflects only the shape and needs no vehicle width.
Mirroring also reverses a hinge's swing and moves its pivot to the other side; a loose mirrored part is centred on its
own bounds, or it sinks into its near twin.

### Rendering and caches

Meshing a sparse part should visit only occupied cells and their neighbours: probing a whole bounding volume for every
face direction and pass made empty space the largest startup cost. Keep a face's material as data and colour it
afterwards, so one mesh serves every paint and look; meshing each look stalled frames for up to a second. Key every
mesh cache on every input that changes the result: a cache keyed on body colour alone gave two paints the same seams.
Never do per-voxel work while loading the registry; it pushed test workers past their time limit.

### Judging a vehicle by eye

A vehicle is judged against a person, so an inspection view shows a player-sized figure beside every build, scaled with
it. Numbered camera presets, a view chosen from the URL, an interior view that opens the doors and redraws only on
demand let a reviewer repeat a check. An interior view must not frame a fixture, such as a lift column, in front of what
it shows. A new motion field ships with the code that reads it; otherwise parts silently stay shut.
