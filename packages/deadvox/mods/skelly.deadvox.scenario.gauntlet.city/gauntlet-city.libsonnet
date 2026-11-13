// Street wrecks are skelly-assets cars placed by content blueprints (`packages/mods/skelly.ground-vehicles/
// vehicles.jsonnet`), each placement choosing a car model and a set of stripped parts from the pools below by
// the world seed. Each car names its own strip vocabulary, because its parts are its blueprint's fittings.
local decals = import 'decals.libsonnet';
local vehicles = import 'packages/mods/skelly.ground-vehicles/vehicles.libsonnet';

local saloonDoors = ['front_door_near', 'front_door_far', 'rear_door_near', 'rear_door_far'];
local saloonWheels = ['front_wheel_near', 'front_wheel_far', 'rear_wheel_near', 'rear_wheel_far'];
local saloonFront = ['bonnet', 'front_wing_near', 'front_wing_far', 'headlamp_near', 'headlamp_far'];
local muscleDoors = ['front_door_near', 'front_door_far'];
local muscleFront = ['bonnet', 'front_wing_near', 'front_wing_far', 'headlamp_near', 'headlamp_far'];
local hatchDoors = ['front_door_near', 'front_door_far', 'rear_door_near', 'rear_door_far'];
local hatchFront = ['bonnet', 'front_wing_near', 'front_wing_far', 'headlamp_near', 'headlamp_far'];
local boxSides = ['box_side_near', 'box_side_far'];

// The wreck strips: what each leaves on the street. `shell` takes everything a wrecker would pull, leaving the
// body standing on its wheels' worth of shell; a van has no doors to take, so its strips take its box.
local strips(car) =
  if car == 'police_car' then [
    { id: 'intact', name: 'Police car', removed: [] },
    { id: 'doors', name: 'Stripped police car', removed: saloonDoors },
    { id: 'wheels', name: 'Stripped police car', removed: saloonWheels },
    { id: 'front', name: 'Stripped police car', removed: saloonFront + ['front_bumper', 'rear_bumper'] },
    { id: 'rear', name: 'Stripped police car', removed: ['front_bumper', 'rear_bumper', 'rear_wheel_near', 'rear_wheel_far'] },
    { id: 'shell', name: 'Wrecked police car', removed: saloonDoors + saloonWheels + saloonFront + ['front_bumper', 'rear_bumper', 'engine', 'battery', 'light_bar', 'push_bar', 'beacon_near', 'beacon_far'] },
  ]
  else if car == 'taxi' then [
    { id: 'intact', name: 'Taxi', removed: [] },
    { id: 'doors', name: 'Stripped taxi', removed: saloonDoors },
    { id: 'wheels', name: 'Stripped taxi', removed: saloonWheels },
    { id: 'front', name: 'Stripped taxi', removed: saloonFront + ['front_bumper', 'rear_bumper'] },
    { id: 'rear', name: 'Stripped taxi', removed: ['front_bumper', 'rear_bumper', 'rear_wheel_near', 'rear_wheel_far'] },
    { id: 'shell', name: 'Wrecked taxi', removed: saloonDoors + saloonWheels + saloonFront + ['front_bumper', 'rear_bumper', 'engine', 'battery', 'roof_sign', 'side_band'] },
  ]
  else if car == 'muscle_car' then [
    { id: 'intact', name: 'Muscle car', removed: [] },
    { id: 'doors', name: 'Stripped muscle car', removed: muscleDoors },
    { id: 'wheels', name: 'Stripped muscle car', removed: saloonWheels },
    { id: 'front', name: 'Stripped muscle car', removed: muscleFront + ['front_bumper', 'rear_bumper'] },
    { id: 'rear', name: 'Stripped muscle car', removed: ['front_bumper', 'rear_bumper', 'rear_wheel_near', 'rear_wheel_far'] },
    { id: 'shell', name: 'Wrecked muscle car', removed: muscleDoors + saloonWheels + muscleFront + ['front_bumper', 'rear_bumper', 'engine', 'battery'] },
  ]
  else if car == 'hatchback' then [
    { id: 'intact', name: 'Hatchback', removed: [] },
    { id: 'doors', name: 'Stripped hatchback', removed: hatchDoors },
    { id: 'wheels', name: 'Stripped hatchback', removed: saloonWheels },
    { id: 'front', name: 'Stripped hatchback', removed: hatchFront + ['front_bumper', 'rear_bumper'] },
    { id: 'rear', name: 'Stripped hatchback', removed: ['tailgate', 'front_bumper', 'rear_bumper', 'rear_wheel_near', 'rear_wheel_far'] },
    { id: 'shell', name: 'Wrecked hatchback', removed: hatchDoors + saloonWheels + hatchFront + ['tailgate', 'front_bumper', 'rear_bumper', 'engine', 'battery'] },
  ]
  else [
    { id: 'intact', name: 'Box van', removed: [] },
    { id: 'sides', name: 'Stripped box van', removed: boxSides },
    { id: 'front', name: 'Stripped box van', removed: ['box_front'] + boxSides },
    { id: 'roof', name: 'Stripped box van', removed: ['box_roof'] + boxSides },
    { id: 'shell', name: 'Wrecked box van', removed: ['box_front', 'box_roof'] + boxSides },
  ];

// The cars the streets hold, with the piece size each fits in: a saloon or a muscle car is a touch over four
// and a half metres, a hatchback under it, and a van half a metre taller.
local cars = [
  { id: 'police_car', size: [4, 4, 10] },
  { id: 'taxi', size: [4, 4, 10] },
  { id: 'muscle_car', size: [4, 4, 10] },
  { id: 'hatchback', size: [4, 4, 9] },
  { id: 'box_van', size: [5, 7, 11] },
];
local variants = [
  {
    id: 'gauntlet_car_wreck_%s_%s' % [car.id, strip.id],
    name: strip.name,
    size: car.size,
    vehicle: vehicles { blueprint: car.id, removed: strip.removed },
  }
  for car in cars
  for strip in strips(car.id)
];
{
  furniture: [
    { id: variant.id, name: variant.name, size: variant.size, color: '#5b605c', vehicle: variant.vehicle }
    for variant in variants
  ],
  templates: [{
    id: variant.id, size: [variant.size[0], variant.size[1] + 1, variant.size[2]],
    lootContext: { usage: [], tier: 'Tier1' },
    decals: [decals.scorch([3.6, 1, 3])],
    palette: { '=': { ground: true }, W: { furniture: variant.id, facing: 'n' } },
    layers: [
      [std.repeat('=', variant.size[0]) for x in std.range(1, variant.size[2])],
    ] + [
      [std.repeat('W', variant.size[0]) for x in std.range(1, variant.size[2])]
      for y in std.range(1, variant.size[1])
    ],
  } for variant in variants],
  mapPools: [{
    id: 'gauntlet_street_cars',
    choices: [{ ref: { kind: 'template', id: variant.id }, weight: 1 } for variant in variants],
  }],
}
