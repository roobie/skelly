// Items and blueprint for the light helicopter. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/light_helicopter.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/light_helicopter.spec.libsonnet';
{
  items: [
    part('light_helicopter_belly', 'Light helicopter belly', pile, ['structure', 'protection']),
    part('light_helicopter_rear_fairing', 'Light helicopter rear fairing', pile, ['structure', 'protection']),
    part('light_helicopter_canopy', 'Light helicopter bubble canopy', pile, ['glazing']),
    part('light_helicopter_canopy_frame', 'Light helicopter canopy frame', pile, ['structure']),
    part('light_helicopter_door', 'Light helicopter door', pile, ['entry', 'glazing', 'protection']),
    part('light_helicopter_tail_boom', 'Light helicopter tail boom', pile, ['structure']),
    part('light_helicopter_tail_surfaces', 'Light helicopter tail fin', pile, ['structure']),
    part('light_helicopter_tail_rotor', 'Light helicopter tail rotor', pile, ['structure']),
    part('light_helicopter_main_rotor', 'Light helicopter main rotor', pile, ['structure']),
    part('light_helicopter_mast', 'Light helicopter mast', [10, 3], ['structure']),
    part('light_helicopter_main_gearbox', 'Light helicopter main gearbox', [5, 5], ['structure']),
    part('light_helicopter_engine', 'Light helicopter piston engine', [8, 6], ['power']),
    part('light_helicopter_fuel_tank', 'Light helicopter fuel tank', [9, 5], ['fuel']),
    part('light_helicopter_skids', 'Light helicopter skids', pile, ['structure']),
    part('light_helicopter_seat', 'Light helicopter seat', [6, 6], ['seat']),
    part('light_helicopter_console', 'Light helicopter instrument console', [8, 6], ['structure']),
    part('light_helicopter_beacon', 'Light helicopter beacon', [2, 2], ['light']),
    part('light_helicopter_landing_lamp', 'Light helicopter landing lamp', [3, 2], ['light']),
  ],
  blueprint: {
    id: 'light_helicopter',
    name: 'Light helicopter',
    fittings: [
      fitting('belly', 'light_helicopter_belly', origin),
      fitting('rear_fairing', 'light_helicopter_rear_fairing', origin, ['belly']),
      fitting('skids', 'light_helicopter_skids', origin, ['belly']),
      fitting('canopy', 'light_helicopter_canopy', origin, ['belly', 'rear_fairing']),
      fitting('canopy_frame', 'light_helicopter_canopy_frame', origin, ['belly', 'rear_fairing']),
      fitting('tail_boom', 'light_helicopter_tail_boom', origin, ['rear_fairing']),
      fitting('tail_surfaces', 'light_helicopter_tail_surfaces', origin, ['tail_boom']),
      fitting('tail_rotor', 'light_helicopter_tail_rotor', [s.tailRotor.x, s.tailRotor.y, s.tailRotor.z], ['tail_boom']),
      fitting('main_gearbox', 'light_helicopter_main_gearbox', [0, s.mastFoot - 0.3, 0], ['rear_fairing']),
      fitting('mast', 'light_helicopter_mast', [0, s.mastFoot, 0], ['main_gearbox']),
      fitting('main_rotor', 'light_helicopter_main_rotor', [0, s.hub, 0], ['mast']),
      fitting('engine', 'light_helicopter_engine', [-0.62, 1.15, 0], ['rear_fairing']),
      fitting('fuel_tank', 'light_helicopter_fuel_tank', [-0.08, 0.9, 0], ['rear_fairing']),
      fitting('console', 'light_helicopter_console', [1.32, s.floor, 0], ['belly']),
      fitting('cyclic', 'control_stick', [1.0, s.floor, 0], ['belly']),
      fitting('beacon', 'light_helicopter_beacon', [-4.28, 2.3, 0], ['tail_surfaces']),
      fitting('landing_lamp', 'light_helicopter_landing_lamp', [2.05, 0.9, 0], ['belly']),
    ]
    + pair('door', 'light_helicopter_door', origin, on(['belly', 'canopy_frame']))
    + pair('seat', 'light_helicopter_seat', [0.64, s.floor, 0.3], on(['belly'])),
  },
}
