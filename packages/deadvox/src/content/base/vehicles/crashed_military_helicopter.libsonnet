// Items and blueprint for the crashed military helicopter, a partial wreck: its gearbox and thrown wheel are the healthy helicopter's parts. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/crashed_military_helicopter.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/crashed_military_helicopter.spec.libsonnet';
{
  items: [
    part('crashed_military_helicopter_fuselage', 'Burnt helicopter fuselage', pile, ['structure', 'protection']),
    part('crashed_military_helicopter_windscreen', 'Cracked helicopter windscreen', pile, ['glazing']),
    part('crashed_military_helicopter_cowling', 'Burnt helicopter cowling', pile, ['structure', 'protection']),
    part('crashed_military_helicopter_engine', 'Burnt helicopter turbine', pile, ['power']),
    part('crashed_military_helicopter_mast', 'Scorched helicopter mast', [10, 3], ['structure']),
    part('crashed_military_helicopter_main_rotor', 'Broken helicopter rotor', pile, ['structure']),
    part('crashed_military_helicopter_snapped_blade', 'Snapped rotor blade', pile, ['structure']),
    part('crashed_military_helicopter_tail_boom', 'Broken helicopter tail boom', pile, ['structure']),
    part('crashed_military_helicopter_tail_rotor', 'Bent helicopter tail rotor', pile, ['structure']),
    part('crashed_military_helicopter_cabin_door', 'Torn helicopter cabin door', pile, ['protection']),
    part('crashed_military_helicopter_console', 'Burnt helicopter console', [8, 6], ['structure']),
    part('crashed_military_helicopter_seat_frame', 'Burnt helicopter seat frame', [6, 6], ['structure']),
    part('crashed_military_helicopter_main_wheel', 'Scorched helicopter main wheel', kit.pileSize, ['wheel']),
    part('crashed_military_helicopter_gear_strut', 'Collapsed helicopter gear strut', [8, 3], ['structure']),
  ],
  blueprint: {
    id: 'crashed_military_helicopter',
    name: 'Crashed military helicopter',
    fittings: [
      fitting('fuselage', 'crashed_military_helicopter_fuselage', origin),
      fitting('windscreen', 'crashed_military_helicopter_windscreen', origin, ['fuselage']),
      fitting('cowling', 'crashed_military_helicopter_cowling', origin, ['fuselage']),
      fitting('main_gearbox', 'military_transport_helicopter_main_gearbox', [0, 2.0, 0], ['fuselage']),
      fitting('mast', 'crashed_military_helicopter_mast', [0, s.mastFoot, 0], ['main_gearbox']),
      fitting('main_rotor', 'crashed_military_helicopter_main_rotor', origin, ['mast']),
      fitting('snapped_blade', 'crashed_military_helicopter_snapped_blade', origin),
      fitting('tail_boom', 'crashed_military_helicopter_tail_boom', origin),
      fitting('tail_rotor', 'crashed_military_helicopter_tail_rotor', origin, ['tail_boom']),
      fitting('cabin_door', 'crashed_military_helicopter_cabin_door', origin),
      fitting('console', 'crashed_military_helicopter_console', origin, ['fuselage']),
      fitting('gear_strut', 'crashed_military_helicopter_gear_strut', origin, ['fuselage']),
      fitting('main_wheel', 'crashed_military_helicopter_main_wheel', [0.17, 0.38, 1.68], ['gear_strut']),
      fitting('loose_wheel', 'military_transport_helicopter_main_wheel', [1.6, 0.4375, -2.9]),
    ]
    + pair('engine', 'crashed_military_helicopter_engine', [-0.75, s.enginesY, s.enginesZ], on(['fuselage']))
    + pair('seat_frame', 'crashed_military_helicopter_seat_frame', [2.15, s.deck + 0.18, 0.55], on(['fuselage'])),
  },
}
