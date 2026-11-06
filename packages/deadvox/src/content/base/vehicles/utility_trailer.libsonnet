// Items and blueprint for the utility trailer. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/utility_trailer.libsonnet`);
// everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/utility_trailer.spec.libsonnet';
{
  items: [
    part('utility_trailer_chassis', 'Utility trailer chassis', pile, ['structure']),
    part('utility_trailer_floor', 'Utility trailer floor', pile, ['structure', 'load_floor']),
    part('utility_trailer_side', 'Utility trailer side', pile, ['protection']),
    part('utility_trailer_headboard', 'Utility trailer headboard', pile, ['protection']),
    part('utility_trailer_tailgate', 'Utility trailer tailgate', pile, ['protection']),
    part('utility_trailer_mudguard', 'Utility trailer mudguard', [8, 4], ['protection']),
  ],
  blueprint: {
    id: 'utility_trailer',
    name: 'Utility trailer',
    fittings: [
      fitting('chassis', 'utility_trailer_chassis', origin),
      fitting('floor', 'utility_trailer_floor', origin, ['chassis']),
      fitting('headboard', 'utility_trailer_headboard', origin, ['floor']),
      fitting('tailgate', 'utility_trailer_tailgate', origin, ['floor']),
      fitting('axle', 'trailer_axle_light', [s.axle, s.hub - 0.37, 0], ['chassis']),
      fitting('coupling', 'trailer_coupling', [s.tip, s.frameLow, 0], ['chassis']),
      fitting('jockey_wheel', 'trailer_jockey_wheel', [s.tip - 0.42, 0, 0.17], ['chassis']),
      kit.cargoSpace('box_cargo', [0, s.deck, 0], [20, 4, 10], 'floor'),
    ]
    + pair('side', 'utility_trailer_side', origin, on(['floor']))
    + pair('mudguard', 'utility_trailer_mudguard', origin, on(paired=['side']))
    + pair('wheel', 'wheel_165_70r13', [s.axle, s.hub, s.wheelZ], on(['axle']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.04, s.frameLow - 0.05, 0.46], on(['chassis']))
    + pair('marker', 'marker_lamp', [s.front + 0.03, s.wall - 0.1, 0.46], on(['headboard'])),
  },
}
