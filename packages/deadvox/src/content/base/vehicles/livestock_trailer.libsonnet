// Items and blueprint for the livestock trailer. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/livestock_trailer.libsonnet`);
// everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/livestock_trailer.spec.libsonnet';
local axleIds = std.range(0, std.length(s.axles) - 1);
{
  items: [
    part('livestock_trailer_chassis', 'Livestock trailer chassis', pile, ['structure']),
    part('livestock_trailer_floor', 'Livestock trailer floor', pile, ['structure', 'load_floor']),
    part('livestock_trailer_side', 'Livestock trailer slatted side', pile, ['structure', 'protection']),
    part('livestock_trailer_headboard', 'Livestock trailer slatted front', pile, ['structure', 'protection']),
    part('livestock_trailer_roof', 'Livestock trailer roof', pile, ['protection']),
    part('livestock_trailer_ramp', 'Livestock trailer ramp', pile, ['entry', 'protection']),
    part('livestock_trailer_top_gate', 'Livestock trailer top gate', pile, ['protection']),
    part('livestock_trailer_mudguard', 'Livestock trailer mudguard', pile, ['protection']),
  ],
  blueprint: {
    id: 'livestock_trailer',
    name: 'Livestock trailer',
    fittings: [
      fitting('chassis', 'livestock_trailer_chassis', origin),
      fitting('floor', 'livestock_trailer_floor', origin, ['chassis']),
      fitting('headboard', 'livestock_trailer_headboard', origin, ['floor']),
      fitting('ramp', 'livestock_trailer_ramp', origin, ['floor']),
      fitting('coupling', 'trailer_coupling', [s.tip, s.frameLow, 0], ['chassis']),
      fitting('jockey_wheel', 'trailer_jockey_wheel', [s.tip - 0.42, 0, 0.2], ['chassis']),
      kit.cargoSpace('pen', [-0.1, s.floor, 0], [32, 12, 14], 'floor'),
    ]
    + pair('side', 'livestock_trailer_side', origin, on(['floor']))
    + [
      fitting('roof', 'livestock_trailer_roof', origin, ['side_near', 'side_far', 'headboard']),
      fitting('top_gate', 'livestock_trailer_top_gate', origin, ['roof']),
    ]
    + [fitting('axle_' + i, 'trailer_axle_van', [s.axles[i], s.hub - 0.37, 0], ['chassis']) for i in axleIds]
    + std.flattenArrays([pair('wheel_' + i, 'wheel_185r14', [s.axles[i], s.hub, s.wheelZ], on(['axle_' + i])) for i in axleIds])
    + pair('mudguard', 'livestock_trailer_mudguard', origin, on(['chassis']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.04, s.frameLow, 0.66], on(['chassis']))
    + pair('marker', 'marker_lamp', [s.front + 0.02, s.railLow, 0.7], on(['headboard'])),
  },
}
