// Items and blueprint for the tank trailer. Its parts fit at the origin (`packages/thing-authoring-tool/vehicles/tank_trailer.libsonnet`);
// everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/tank_trailer.spec.libsonnet';
{
  items: [
    part('tank_trailer_chassis', 'Tank trailer chassis', pile, ['structure']),
    part('tank_trailer_saddle', 'Tank trailer saddle', pile, ['structure']),
    part('tank_trailer_barrel', 'Tank trailer barrel', pile, ['storage', 'structure']),
    part('tank_trailer_walkway', 'Tank trailer walkway', pile, ['structure']),
    part('tank_trailer_ladder', 'Tank trailer ladder', pile, []),
    part('tank_trailer_hose', 'Tank trailer hose', pile, []),
    part('tank_trailer_mudguard', 'Tank trailer mudguard', [9, 4], ['protection']),
  ],
  blueprint: {
    id: 'tank_trailer',
    name: 'Tank trailer',
    fittings: [
      fitting('chassis', 'tank_trailer_chassis', origin),
    ]
    + [fitting('saddle_' + i, 'tank_trailer_saddle', [s.saddles[i], 0, 0], ['chassis']) for i in std.range(0, std.length(s.saddles) - 1)]
    + [
      fitting('barrel', 'tank_trailer_barrel', origin, ['saddle_' + i for i in std.range(0, std.length(s.saddles) - 1)]),
      fitting('walkway', 'tank_trailer_walkway', origin, ['barrel']),
      fitting('ladder', 'tank_trailer_ladder', origin, ['barrel']),
      fitting('hose', 'tank_trailer_hose', origin, ['chassis']),
      fitting('axle', 'trailer_axle_van', [s.axle, s.hub - 0.37, 0], ['chassis']),
      fitting('coupling', 'trailer_coupling', [s.tip, s.frameLow, 0], ['chassis']),
      fitting('resting_leg', 'trailer_leg', [s.tip - 0.42, 0, 0.17], ['chassis']),
    ]
    + pair('wheel', 'wheel_225_75r16c', [s.axle, s.hub, s.wheelZ], on(['axle']))
    + pair('mudguard', 'tank_trailer_mudguard', origin, on(['chassis']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.08, 0.44, 0.68], on(['chassis'])),
  },
}
