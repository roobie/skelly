// Items and blueprint for the car trailer. Its parts fit at the origin (`packages/thing-authoring-tool/vehicles/car_trailer.libsonnet`);
// everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/car_trailer.spec.libsonnet';
local axleIds = std.range(0, std.length(s.axles) - 1);
{
  items: [
    part('car_trailer_chassis', 'Car trailer chassis', pile, ['structure']),
    part('car_trailer_deck', 'Car trailer deck', pile, ['structure', 'load_floor']),
    part('car_trailer_ramp', 'Car trailer ramp', pile, ['structure']),
    part('car_trailer_wheel_stop', 'Car trailer wheel stop', pile, ['structure']),
    part('car_trailer_headboard', 'Car trailer headboard', pile, ['structure']),
  ],
  blueprint: {
    id: 'car_trailer',
    name: 'Car trailer',
    fittings: [
      fitting('chassis', 'car_trailer_chassis', origin),
      fitting('deck', 'car_trailer_deck', origin, ['chassis']),
      fitting('wheel_stop', 'car_trailer_wheel_stop', origin, ['deck']),
      fitting('headboard', 'car_trailer_headboard', origin, ['deck']),
      fitting('coupling', 'trailer_coupling', [s.tip, s.frameLow, 0], ['chassis']),
      fitting('jockey_wheel', 'trailer_jockey_wheel', [s.tip - 0.42, 0, 0.17], ['chassis']),
      kit.cargoSpace('car_bay', [-0.8, s.deck, 0], [36, 14, 18], 'deck'),
    ]
    + [fitting('axle_' + i, 'trailer_axle_light', [s.axles[i], s.hub - 0.37, 0], ['chassis']) for i in axleIds]
    + std.flattenArrays([pair('wheel_' + i, 'wheel_145r10', [s.axles[i], s.hub, s.wheelZ], on(['axle_' + i])) for i in axleIds])
    + pair('ramp', 'car_trailer_ramp', origin, on(['deck']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.04, s.frameLow, 0.8], on(['chassis']))
    + pair('marker', 'marker_lamp', [1.56, 1.2, 0.47], on(['headboard'])),
  },
}
