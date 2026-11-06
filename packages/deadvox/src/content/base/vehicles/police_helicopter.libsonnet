// Items and blueprint for the police helicopter. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/police_helicopter.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/police_helicopter.spec.libsonnet';
{
  items: [
    part('police_helicopter_belly', 'Police helicopter belly', pile, ['structure', 'protection']),
    part('police_helicopter_rear_fairing', 'Police helicopter rear fairing', pile, ['structure', 'protection']),
    part('police_helicopter_nose_cap', 'Police helicopter nose cap', [8, 6], ['protection']),
    part('police_helicopter_windscreen', 'Police helicopter windscreen', pile, ['glazing']),
    part('police_helicopter_roof', 'Police helicopter cabin roof', pile, ['structure', 'protection']),
    part('police_helicopter_front_door', 'Police helicopter front door', pile, ['entry', 'glazing', 'protection']),
    part('police_helicopter_rear_door', 'Police helicopter rear door', pile, ['entry', 'glazing', 'protection']),
    part('police_helicopter_engine_cowl', 'Police helicopter engine cowl', pile, ['protection']),
    part('police_helicopter_tail_boom', 'Police helicopter tail boom', pile, ['structure']),
    part('police_helicopter_tail_surfaces', 'Police helicopter tail fin', pile, ['structure']),
    part('police_helicopter_tail_rotor', 'Police helicopter tail rotor', pile, ['structure']),
    part('police_helicopter_main_rotor', 'Police helicopter main rotor', pile, ['structure']),
    part('police_helicopter_mast', 'Police helicopter mast', [10, 3], ['structure']),
    part('police_helicopter_main_gearbox', 'Police helicopter main gearbox', [5, 5], ['structure']),
    part('police_helicopter_turbine', 'Police helicopter turbine', [11, 6], ['power']),
    part('police_helicopter_fuel_tank', 'Police helicopter fuel tank', [10, 6], ['fuel']),
    part('police_helicopter_skids', 'Police helicopter skids', pile, ['structure']),
    part('police_helicopter_seat', 'Police helicopter front seat', [6, 6], ['seat']),
    part('police_helicopter_rear_bench', 'Police helicopter rear bench', pile, ['seat']),
    part('police_helicopter_console', 'Police helicopter instrument console', [10, 6], ['structure']),
    part('police_helicopter_searchlight', 'Police helicopter searchlight', [6, 6], ['light']),
    part('police_helicopter_beacon', 'Police helicopter beacon', [2, 2], ['light']),
    part('police_helicopter_landing_lamp', 'Police helicopter landing lamp', [3, 2], ['light']),
  ],
  blueprint: {
    id: 'police_helicopter',
    name: 'Police helicopter',
    fittings: [
      fitting('belly', 'police_helicopter_belly', origin),
      fitting('rear_fairing', 'police_helicopter_rear_fairing', origin, ['belly']),
      fitting('skids', 'police_helicopter_skids', origin, ['belly']),
      fitting('nose_cap', 'police_helicopter_nose_cap', origin, ['belly']),
      fitting('windscreen', 'police_helicopter_windscreen', origin, ['belly', 'roof']),
      fitting('roof', 'police_helicopter_roof', origin, ['rear_fairing']),
      fitting('engine_cowl', 'police_helicopter_engine_cowl', origin, ['roof', 'rear_fairing']),
      fitting('tail_boom', 'police_helicopter_tail_boom', origin, ['rear_fairing']),
      fitting('tail_surfaces', 'police_helicopter_tail_surfaces', origin, ['tail_boom']),
      fitting('tail_rotor', 'police_helicopter_tail_rotor', [s.tailRotor.x, s.tailRotor.y, s.tailRotor.z], ['tail_boom']),
      fitting('main_gearbox', 'police_helicopter_main_gearbox', [0, s.mastFoot - 0.36, 0], ['roof']),
      fitting('mast', 'police_helicopter_mast', [0, s.mastFoot, 0], ['main_gearbox']),
      fitting('main_rotor', 'police_helicopter_main_rotor', [0, s.hub, 0], ['mast']),
      fitting('turbine', 'police_helicopter_turbine', [-1.3, 2.38, 0], ['rear_fairing']),
      fitting('fuel_tank', 'police_helicopter_fuel_tank', [-0.85, 1.05, 0], ['rear_fairing']),
      fitting('console', 'police_helicopter_console', [1.72, s.floor, 0], ['belly']),
      fitting('cyclic', 'control_stick', [1.36, s.floor, 0], ['belly']),
      fitting('rear_bench', 'police_helicopter_rear_bench', [0.05, s.floor, 0], ['belly']),
      fitting('searchlight', 'police_helicopter_searchlight', [1.45, 0.3, 0.52], ['belly']),
      fitting('tail_beacon', 'police_helicopter_beacon', [-6.35, 2.95, 0], ['tail_surfaces']),
      fitting('cowl_beacon', 'police_helicopter_beacon', [-1.5, 2.72, 0], ['engine_cowl']),
      fitting('landing_lamp', 'police_helicopter_landing_lamp', [2.44, 1.0, 0], ['nose_cap']),
    ]
    + pair('front_door', 'police_helicopter_front_door', origin, on(['belly', 'roof']))
    + pair('rear_door', 'police_helicopter_rear_door', origin, on(['belly', 'roof']))
    + pair('seat', 'police_helicopter_seat', [1.05, s.floor, 0.38], on(['belly'])),
  },
}
