// Items and blueprint for the boat trailer. Its parts fit at the origin (`packages/thing-authoring-tool/vehicles/boat_trailer.libsonnet`);
// everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/boat_trailer.spec.libsonnet';
{
  items: [
    part('boat_trailer_chassis', 'Boat trailer chassis', pile, ['structure']),
    part('boat_trailer_bunks', 'Boat trailer bunks', pile, ['structure']),
    part('boat_trailer_winch_post', 'Boat trailer winch post', [6, 3], ['structure']),
    part('boat_trailer_boat', 'Small open boat', pile, ['structure']),
    part('boat_trailer_outboard', 'Outboard motor', [5, 3], []),
    part('boat_trailer_mudguard', 'Boat trailer mudguard', [8, 4], ['protection']),
  ],
  blueprint: {
    id: 'boat_trailer',
    name: 'Boat trailer',
    fittings: [
      fitting('chassis', 'boat_trailer_chassis', origin),
      fitting('bunks', 'boat_trailer_bunks', origin, ['chassis']),
      fitting('winch_post', 'boat_trailer_winch_post', origin, ['chassis']),
      fitting('boat', 'boat_trailer_boat', origin, ['bunks']),
      fitting('outboard', 'boat_trailer_outboard', origin, ['boat']),
      fitting('axle', 'trailer_axle_light', [s.axle, s.hub - 0.37, 0], ['chassis']),
      fitting('coupling', 'trailer_coupling', [s.tip, s.frameLow, 0], ['chassis']),
      fitting('jockey_wheel', 'trailer_jockey_wheel', [s.tip - 0.42, 0, 0.117], ['chassis']),
    ]
    + pair('mudguard', 'boat_trailer_mudguard', origin, on(['chassis']))
    + pair('wheel', 'wheel_165_70r13', [s.axle, s.hub, s.wheelZ], on(['axle']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.04, s.frameLow - 0.05, 0.46], on(['chassis'])),
  },
}
