// Items and blueprint for the log trailer. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/log_trailer.libsonnet`);
// everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/log_trailer.spec.libsonnet';
local bolsterIds = std.range(0, std.length(s.bolsters) - 1);
local axleIds = std.range(0, std.length(s.axles) - 1);
{
  items: [
    part('log_trailer_chassis', 'Log trailer chassis', pile, ['structure']),
    part('log_trailer_floor', 'Log trailer bed', pile, ['structure', 'load_floor']),
    part('log_trailer_bolster', 'Log trailer bolster', pile, ['structure']),
    part('log_trailer_stake', 'Log trailer stake', pile, ['structure']),
    part('log_trailer_headboard', 'Log trailer headboard', pile, ['protection']),
    part('log_trailer_mudguard', 'Log trailer mudguards', pile, ['protection']),
  ],
  blueprint: {
    id: 'log_trailer',
    name: 'Log trailer',
    fittings: [
      fitting('chassis', 'log_trailer_chassis', origin),
      fitting('floor', 'log_trailer_floor', origin, ['bolster_' + i for i in bolsterIds]),
      fitting('headboard', 'log_trailer_headboard', origin, ['chassis']),
      kit.cargoSpace('bed_cargo', [-0.4, s.deck, 0], [72, 14, 6], 'floor'),
    ]
    + [fitting('bolster_' + i, 'log_trailer_bolster', [s.bolsters[i], 0, 0], ['chassis']) for i in bolsterIds]
    + [fitting('axle_' + i, 'trailer_axle_truck', [s.axles[i], s.hub - 0.52, 0], ['chassis']) for i in axleIds]
    + std.flattenArrays([pair('stake_' + i, 'log_trailer_stake', [s.bolsters[i], s.deck, s.stakeZ], on(['bolster_' + i])) for i in bolsterIds])
    + std.flattenArrays([pair('wheel_' + i, 'wheel_8r19_5', [s.axles[i], s.hub, s.wheelZ], on(['axle_' + i])) for i in axleIds])
    + pair('resting_leg', 'trailer_leg', [4.4, 0, 0.31], on(['chassis']))
    + pair('mudguard', 'log_trailer_mudguard', origin, on(['chassis']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.03, s.frameLow + 0.02, 0.9], on(['chassis'])),
  },
}
