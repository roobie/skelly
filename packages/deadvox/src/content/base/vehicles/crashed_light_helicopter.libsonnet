// Items and blueprint for the crashed light helicopter, a partial wreck: its engine, gearbox, fuel tank and console are the healthy helicopter's parts. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/crashed_light_helicopter.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/crashed_light_helicopter.spec.libsonnet';
{
  items: [
    part('crashed_light_helicopter_belly', 'Crumpled helicopter belly', pile, ['structure', 'protection']),
    part('crashed_light_helicopter_rear_fairing', 'Scraped helicopter fairing', pile, ['structure', 'protection']),
    part('crashed_light_helicopter_canopy', 'Shattered bubble canopy', pile, ['glazing']),
    part('crashed_light_helicopter_canopy_frame', 'Bent canopy frame', pile, ['structure']),
    part('crashed_light_helicopter_door', 'Torn bubble door', pile, ['glazing', 'protection']),
    part('crashed_light_helicopter_tail_boom', 'Buckled helicopter tail boom', pile, ['structure']),
    part('crashed_light_helicopter_tail_surfaces', 'Bent helicopter tail fin', pile, ['structure']),
    part('crashed_light_helicopter_tail_rotor', 'Bent light tail rotor', pile, ['structure']),
    part('crashed_light_helicopter_main_rotor', 'Bent helicopter rotor', pile, ['structure']),
    part('crashed_light_helicopter_mast', 'Bent helicopter mast', [10, 3], ['structure']),
    part('crashed_light_helicopter_skids', 'Broken helicopter skids', pile, ['structure']),
    part('crashed_light_helicopter_seat_frame', 'Bent helicopter seat frame', [6, 6], ['structure']),
  ],
  blueprint: {
    id: 'crashed_light_helicopter',
    name: 'Crashed light helicopter',
    fittings: [
      fitting('belly', 'crashed_light_helicopter_belly', origin),
      fitting('rear_fairing', 'crashed_light_helicopter_rear_fairing', origin, ['belly']),
      fitting('skids', 'crashed_light_helicopter_skids', origin, ['belly']),
      fitting('door', 'crashed_light_helicopter_door', origin),
      fitting('canopy', 'crashed_light_helicopter_canopy', origin, ['belly', 'rear_fairing']),
      fitting('canopy_frame', 'crashed_light_helicopter_canopy_frame', origin, ['belly', 'rear_fairing']),
      fitting('tail_boom', 'crashed_light_helicopter_tail_boom', origin, ['rear_fairing']),
      fitting('tail_surfaces', 'crashed_light_helicopter_tail_surfaces', origin, ['tail_boom']),
      fitting('tail_rotor', 'crashed_light_helicopter_tail_rotor', origin, ['tail_boom']),
      fitting('main_gearbox', 'light_helicopter_main_gearbox', [0, s.mastFoot - 0.3, 0], ['rear_fairing']),
      fitting('mast', 'crashed_light_helicopter_mast', [0, s.mastFoot, 0], ['main_gearbox']),
      fitting('main_rotor', 'crashed_light_helicopter_main_rotor', origin, ['mast']),
      fitting('engine', 'light_helicopter_engine', [-0.62, 0.7, 0], ['rear_fairing']),
      fitting('fuel_tank', 'light_helicopter_fuel_tank', [-0.08, 0.45, 0], ['rear_fairing']),
      fitting('console', 'light_helicopter_console', [1.08, s.floor, 0], ['belly']),
    ]
    + pair('seat_frame', 'crashed_light_helicopter_seat_frame', [0.5, s.floor, 0.3], on(['belly'])),
  },
}
