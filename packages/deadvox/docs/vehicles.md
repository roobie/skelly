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
rules are in [DESIGN.md](../DESIGN.md#vehicles); the first playable scope is in [SLICE-6.md](../SLICE-6.md). This doc
holds the reasons behind the content rules, and the lessons the vehicle slice proper starts from.

## Decided

- The saloon is the everyday car, because a mid-size family car is what a survivor most often finds.
- Vehicle noise comes mainly from the engine; chassis and hull may contribute.
- A build owns its fittings, each part type has one item id, and a mirrored fitting stores its own position.

## One vehicle model

The content model is the only vehicle model, and no vehicle is authored in code. Two code paths that model one concept
drift apart, and a vehicle written in code is a second copy of a look the assets release already holds. Features
content lacks, such as part noise, a rider point and paint wear, are added to content when a reader needs them.

A build owns its fitting state, so a build can omit or change fittings without a second model, and two vehicles of one
blueprint change independently. A part type is an item, so a removed part stays the same type across vehicles. See
`packages/engine/src/core/vehicleInstances.ts`, `VehicleBuild`.

A build's blueprint is optional: it is where a factory build starts and what names it, not part of what the build is,
so nothing about the build's shape, collision, service or site names reads it. That keeps scratch-built frames, the
#322 follow-up in `SLICE-6.md`, "Deferred work and its trigger", open. How builds and sites are named is in
`DESIGN.md`, "Names".

Support keeps editing from leaving parts floating. Those refusals are editing rules, not impact detachment, which must
cascade through unsupported dependents while keeping surviving items, as
`SLICE-6.md`, "Condition, appearance and attachment", specifies. See `packages/engine/src/core/vehicleBlueprint.ts`, `supportProblems`, and
`packages/engine/src/core/inventory.ts`, `Inventory.vehiclePlacementRefusal`.

## Export contract

A vehicle part's exported model carries its physics, so disassembly, inventory and fitting share one identity and the
game never evaluates authoring shapes. A blueprint names parts by item id in the shared model frame
(`packages/skelly-assets/docs/decisions/0002-model-frame.md`, "Decision"), so a mod adds a compatible part or host with
data alone. See `packages/engine/src/core/schema/items.ts`, `VehicleBlueprintSchema`.

Capabilities are a closed vocabulary because each one needs game code to mean anything, so content naming another is
refused rather than ignored. A capability carries only the numbers its reader needs, added when that reader lands. See
`packages/engine/src/core/schema/items.ts`, `VEHICLE_CAPABILITIES`.

Driven and steered belong to the part type, not the fitting, so converting a vehicle's drive means swapping a part,
which is also a gameplay hook: finding a driven axle.

Structure is marked explicitly so code can tell a supporting part from one whose capabilities were forgotten, and an
empty list can later be refused as an authoring mistake. Getting in and moving are separate: a bonnet moves without
being a way in, and an open cart is a way in without moving.

Spin belongs to the fitting rather than the part, because a spare wheel stowed on a rack does not roll, and it is no
exported motion, because it has no stop to open to. A track band does not spin, because its links scroll around the
wheels rather than turn about one axle. A spinning part's radius comes from its exported collision, so a reshaped wheel
needs no second number to stay in step. See `packages/engine/src/core/vehicleBlueprint.ts`, `rollingRadius`.

Left and right parts are one item, mirrored by the slot, so one inventory item fits either side; a handed part therefore
cannot refuse the wrong side. Part collision stays one axis-aligned box per solid until the physics solver needs a
convex hull, which is cheap to add because the schema slot is already per part. Attachment points get a direction and
fittings a rotation the first time a fitting must align; the change only adds fields.

Broken vehicle content is refused like any other broken content, dropping the file that authors it, so a half-valid
vehicle never loads; see `packages/engine/src/core/vehicleBlueprint.ts`, `vehicleContentIssues`. Mass and centre come
only from the export, so there is one physical authority, and a far-side twin needs no second export; see
`packages/engine/src/core/vehicleBlueprint.ts`, `placeFitting`.

Until VAT ships in #323, hand-written content blueprints stand in for its output, so the contract does not wait on an
editor. VAT must write the same shape.

## Proportions

Each vehicle follows a real reference at its published dimensions, so sizes are a dependable yardstick, while its
in-game name stays generic, because a manufacturer or model name in content would claim a specific vehicle. Where a
reference publishes no dimension, the vehicle takes the nearest published one and says it is an estimate. The
references:

- the 4×4: a Range Rover Classic four-door;
- the pickup: a Toyota Hilux N80 regular-cab long-bed 4WD;
- the saloon: the mid-size class of the Ford Mondeo Mk3;
- the hatchback: a Volkswagen Golf Mk4 five-door;
- the crane truck: a light cab-over truck of the Mitsubishi Fuso Canter class with a deck-mounted telescopic boom;
- the motorbike: an early Honda CG125;
- the box van: no single model, but the sizes common to European 3.5-tonne chassis cabs with a dry-freight box, because
  the commonest van a survivor finds is the class;
- the eight-wheeled troop carrier: the Stryker family, as visual reference only.

Sources: [Range Rover Classic](https://en.wikipedia.org/wiki/Range_Rover_Classic),
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

A transport vehicle's crew space must fit a crouched player from the rear opening to the driver's station, so walking
inside can come later without a resize. The sizes come from the player's own definitions, not from the blueprint. See
`test/troopCarrier.test.ts`, "the troop carrier’s compartment".

A troop carrier stows its crew's kit and ammunition, because without storage it reads as an empty shell, and its stowage
stands clear of the crouched walk. A storage part with a fixed inside, such as a rack or a locker, carries an authored
item container, because its design sets that inside; cargo space is sized by the load floor it is marked out on, which
would bend a rack into a floor-area shape it is not. A rack of slots takes up to one item a slot whatever the item's
size, as a board stack does. Items inside are cargo, never fittings, and what a wreck's stowage holds is a loot
decision, not a vehicle one. The troop carrier has its own content file because its racks depend on the firearms pack
and no other vehicle does, so loading the other vehicles needs nothing from that pack. See
`packages/mods/skelly.ground-vehicles/troop-carrier.jsonnet`, `rifleRack`, and
`test/troopCarrier.test.ts`, "the troop carrier’s stowage".

The troop carrier's hull is several fittings standing in for one factory-welded assembly, because fittings have no
assembly grouping yet. Its armour plates are fittings, so protection comes off and goes on like any other part instead
of becoming a hull property.

## The hatchback from content

The hatchback follows a real car because it is the common comparison reference other profiles are judged against.

A new vehicle starts on the content path, so none is authored twice. Parts alike across hosts are authored once, so a
part disassembled from one host fits another; a host's own panels are pressed for its body, so they are authored where
they sit on it. Glazing is see-through through its finish rather than a separate mechanism; see
`packages/skelly-assets/tools/packages/thing-core/src/materials.ts`, `MaterialSchema`.

The body shell carries the mass of wiring, trim and sound deadening that no part models, so the fitted car weighs what
the reference does at the kerb without extra parts to author. The cost, accepted, is that handling may feel less
nose-heavy than the front-engined reference.

A body panel is larger than a floor pile, so panels stay capped at the pile's size; see
`packages/mods/skelly.ground-vehicles/vehicles.jsonnet`, `pileSize`. The cap costs nothing until a carrying design gives
oversized parts their own carry class.

The only seated check is entry, because whether the player fits a seat waits on a seated pose; without one, any fit
test would measure the standing figure. See `test/vehicleExport.test.ts`.

## The crane truck from content

The crane truck is on the content path because heavy recovery depends on it, so its parts are disassembled and fitted
like any other vehicle's. It shares parts that fit across hosts, and keeps its own road wheel, because a light truck's
wheel does not fit a car.

Every part is its own item, because each breaks, wears and is disassembled on its own. The cost, accepted, is a long
fitting list.

The boom is telescopic, with its extension a separate part, even though that carries the most debt: a sliding stage sets
the vocabulary for vehicle motion early, before other moving parts need it.

The crane has one fixed rated load, because a fixed rating carries the least debt; a chart over reach can replace it
when lifting needs one. See `packages/engine/src/core/schema/items.ts`, `ratedLoadKg`. The rating is a load at the
boom's working reach, not a lifting moment, because a moment read as a load would let a light truck lift more than it
weighs.

A vehicle that lifts must have a stabiliser fitted, because stabilisers are a precondition for lifting, not a factor on
the rating. A reduced rating with stabilisers stowed stays open.

The rear wheels are single, which adds no debt; a twinned wheel part can come when a heavier truck needs one. The load
bed is a flat deck, so the crane sets a part down from either side or the rear.

## Lessons for the vehicle slice

### Noise comes from the build

Vehicle noise is a hearing radius, so it joins sound admission without a second unit system; see
`packages/mods/skelly.senses/senses.jsonnet`, `hearingRangeScale`. Intensity falls with the square of distance, so
source radii add in quadrature, and each fitted damper scales the total, so taking one off never makes the vehicle
quieter.

### Seeded wear

Cosmetic wear seeded from the vehicle's and the fitting's identity is repeatable and differs between two vehicles of
one blueprint without storing anything. Wear changes only finishes, never shape, so it implies no functional damage, and
the part keeps its look through disassembly and refitting. A worn fitting can no longer share its part type's mesh, so
wear detail stays bounded by mesh cost.

### Moving parts carry what rests on them

A fitting resting on a part that moves, such as a mirror on a door, must follow that part's pose, or it hangs in the air
when the door opens. Carriers come from supports, and that walk needs a guard against cycles. A fitting carried this
way rests on that one part alone, because a fitting held by a door and the body both would be torn between them;
content and saved builds refuse it by one rule, so a save cannot hold a build content could not (`vehiclePose.ts`,
`carriedIssues`).

A pose is read off thing-core's `posePoint` as one rigid move rather than re-deriving hinges and slides, so the game
cannot pose a part differently from the content tools that validated it (`motionPose`). Rendering applies the pose
around the placed model and keys the pose into the build's render signature, so opening a door rebuilds that vehicle
alone (`render/vehicles.ts`, `VehicleMeshes`). A part stands at rest or at its stop and nothing between, because only
the saved state is simulated and easing it there is presentation for later. Collision, picking and occupancy stay at the built pose for now: they
are cell-grained and shared with sight, light and sound, and moving them is its own change.

### Opening parts

A part that moves says in content how it opens: its handling time, its sounds and the verbs its label uses
(`schema/items.ts`, `vehicle.opening`). A family of parts shares one (`skelly.ground-vehicles/vehicles.libsonnet`,
`opens`), because a car door, a bonnet and an armoured hatch differ in feel while every car door feels alike; validation
pairs it with motion both ways, so a part that moves can always be worked and a still one never offers to.

Whether a part stands open is kept on its fitting, through the same rebuild as any fitted change, so the vehicle's
revision moves and every derived projection follows (`VehicleInstances.setOpen`). A tap of the use key opens or shuts
it and a hold inspects, as a building's door taps open while its other options wait in the menu (`play.ts`,
`vehiclePartPayload`). Handling is replanned when it completes, and its outcome is heard and refused through the door's
own `heardSwing`, so the two families of opening cannot drift apart (`game/vehiclePartAction.ts`). A parked vehicle
has no locks and nothing that blocks a door shutting, so reach and the part still being fitted are all that refuse.

### Wheels turn at their own rate

Each spinning part needs its own rolling radius, because wheels of different sizes on one vehicle cover the same ground
at different turn rates; the radius validation reads is the one rendering should turn by.

### Mirroring

A far-side twin stores its own reflected position, so mirroring reflects only the shape and needs no vehicle width.
Mirroring also reverses a hinge's swing and moves its pivot, and a loose mirrored part is placed by its own bounds,
because its near twin's would put the two in one place.

### Rendering and caches

Sparse work should scale with occupied cells, not with a part's bounding volume, because most of a vehicle's volume is
empty. A face's material stays data and is coloured afterwards, so one mesh serves every paint and look. Every input
that changes a cached result belongs in its key. Registry loading does no per-voxel work, because load time is paid by
every test and every start.

### Judging a vehicle by eye

A vehicle is judged against a person, so an inspection view shows a player-sized figure beside every build, scaled with
it. Camera presets and a view chosen from the URL let a reviewer repeat a check, and an interior view must not frame a
fixture in front of what it shows. A new motion field ships with the code that reads it, because otherwise parts
silently stay shut.
