// Items and blueprint for the semi-trailer. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/semi_trailer.libsonnet`);
// everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/semi_trailer.spec.libsonnet';
local axleIds = std.range(0, std.length(s.axles) - 1);
{
  items: [
    part('semi_trailer_chassis', 'Semi-trailer chassis', pile, ['structure']),
    part('semi_trailer_floor', 'Semi-trailer floor', pile, ['structure', 'load_floor']),
    part('semi_trailer_side', 'Semi-trailer side wall', pile, ['protection']),
    part('semi_trailer_roof', 'Semi-trailer roof', pile, ['protection']),
    part('semi_trailer_front_wall', 'Semi-trailer front wall', pile, ['protection']),
    part('semi_trailer_rear_door', 'Semi-trailer rear door', pile, ['protection']),
    part('semi_trailer_kingpin', 'Kingpin plate', [12, 6], ['structure']),
    part('semi_trailer_landing_leg', 'Landing leg', pile, ['structure', 'stabiliser']),
    part('semi_trailer_side_guard', 'Semi-trailer side guard', pile, ['protection']),
    part('semi_trailer_mudguard', 'Semi-trailer mudguards', pile, ['protection']),
    part('semi_trailer_underrun', 'Semi-trailer underrun bar', pile, ['protection']),
  ],
  blueprint: {
    id: 'semi_trailer',
    name: 'Semi-trailer',
    fittings: [
      fitting('chassis', 'semi_trailer_chassis', origin),
      fitting('floor', 'semi_trailer_floor', origin, ['chassis']),
      fitting('roof', 'semi_trailer_roof', origin, ['side_near', 'side_far']),
      fitting('front_wall', 'semi_trailer_front_wall', origin, ['floor']),
      fitting('kingpin', 'semi_trailer_kingpin', origin, ['chassis']),
      fitting('underrun', 'semi_trailer_underrun', origin, ['chassis']),
      kit.cargoSpace('box_cargo', [0, s.floor, 0], [134, 20, 24], 'floor'),
    ]
    + [fitting('axle_' + i, 'trailer_axle_truck', [s.axles[i], s.hub - 0.52, 0], ['chassis']) for i in axleIds]
    + pair('side', 'semi_trailer_side', origin, on(['floor']))
    + pair('rear_door', 'semi_trailer_rear_door', origin, on(paired=['side']))
    + pair('landing_leg', 'semi_trailer_landing_leg', [s.legX, 0, s.legZ], on(['chassis']))
    + pair('side_guard', 'semi_trailer_side_guard', origin, on(['chassis']))
    + pair('mudguard', 'semi_trailer_mudguard', origin, on(['chassis']))
    + std.flattenArrays([pair('wheel_' + i, 'wheel_295_80r22_5', [s.axles[i], s.hub, s.wheelZ], on(['axle_' + i])) for i in axleIds])
    + pair('tail_lamp_outer', 'tail_lamp_small', [s.rear - 0.03, 1.14, 1.0], on(['chassis']))
    + pair('tail_lamp_inner', 'tail_lamp_small', [s.rear - 0.03, 1.14, 0.75], on(['chassis']))
    + pair('roof_lamp', 'marker_lamp', [s.front + 0.03, s.roof - 0.14, 1.1], on(['front_wall']))
    + std.flattenArrays([pair('side_lamp_' + i, 'marker_lamp', [-5.4 + 3.6 * i, 1.31, s.side + 0.06], on(paired=['side'])) for i in std.range(0, 3)]),
  },
}
