// Items and blueprint for the air ambulance. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/air_ambulance.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/air_ambulance.spec.libsonnet';
{
  items: [
    part('air_ambulance_belly', 'Air ambulance belly', pile, ['structure', 'protection']),
    part('air_ambulance_cabin_floor', 'Air ambulance cabin floor', pile, ['structure', 'load_floor']),
    part('air_ambulance_nose_cap', 'Air ambulance nose cap', [9, 6], ['protection']),
    part('air_ambulance_windscreen', 'Air ambulance windscreen', pile, ['glazing']),
    part('air_ambulance_roof', 'Air ambulance cabin roof', pile, ['structure', 'protection']),
    part('air_ambulance_cabin_rear', 'Air ambulance rear cabin', pile, ['structure', 'protection', 'glazing']),
    part('air_ambulance_front_door', 'Air ambulance cockpit door', pile, ['entry', 'glazing', 'protection']),
    part('air_ambulance_sliding_door', 'Air ambulance sliding door', pile, ['entry', 'glazing', 'protection']),
    part('air_ambulance_door_track', 'Air ambulance door track', [10, 2], ['structure']),
    part('air_ambulance_clamshell_door', 'Air ambulance clamshell door', pile, ['entry', 'protection']),
    part('air_ambulance_engine_cowl', 'Air ambulance engine cowl', pile, ['protection']),
    part('air_ambulance_tail_boom', 'Air ambulance tail boom', pile, ['structure']),
    part('air_ambulance_tail_surfaces', 'Air ambulance tail fin', pile, ['structure']),
    part('air_ambulance_tail_rotor', 'Air ambulance tail rotor', pile, ['structure']),
    part('air_ambulance_main_rotor', 'Air ambulance main rotor', pile, ['structure']),
    part('air_ambulance_mast', 'Air ambulance mast', [9, 3], ['structure']),
    part('air_ambulance_main_gearbox', 'Air ambulance main gearbox', [6, 5], ['structure']),
    part('air_ambulance_turbine', 'Air ambulance turbine', [10, 5], ['power']),
    part('air_ambulance_fuel_tank', 'Air ambulance fuel tank', pile, ['fuel']),
    part('air_ambulance_skids', 'Air ambulance skids', pile, ['structure']),
    part('air_ambulance_seat', 'Air ambulance cockpit seat', [6, 6], ['seat']),
    part('air_ambulance_locker', 'Air ambulance medical locker', [10, 6], ['storage']),
    part('air_ambulance_console', 'Air ambulance instrument console', [11, 6], ['structure']),
    part('air_ambulance_beacon', 'Air ambulance beacon', [2, 2], ['light']),
    part('air_ambulance_landing_lamp', 'Air ambulance landing lamp', [3, 2], ['light']),
  ],
  blueprint: {
    id: 'air_ambulance',
    name: 'Air ambulance',
    fittings: [
      fitting('belly', 'air_ambulance_belly', origin),
      fitting('cabin_floor', 'air_ambulance_cabin_floor', origin, ['belly']),
      fitting('skids', 'air_ambulance_skids', origin, ['belly']),
      fitting('nose_cap', 'air_ambulance_nose_cap', origin, ['belly']),
      fitting('cabin_rear', 'air_ambulance_cabin_rear', origin, ['belly']),
      fitting('roof', 'air_ambulance_roof', origin, ['cabin_rear']),
      fitting('windscreen', 'air_ambulance_windscreen', origin, ['belly', 'roof']),
      fitting('engine_cowl', 'air_ambulance_engine_cowl', origin, ['roof', 'cabin_rear']),
      fitting('tail_boom', 'air_ambulance_tail_boom', origin, ['cabin_rear']),
      fitting('tail_surfaces', 'air_ambulance_tail_surfaces', origin, ['tail_boom']),
      fitting('tail_rotor', 'air_ambulance_tail_rotor', [s.tailRotor.x, s.tailRotor.y, s.tailRotor.z], ['tail_boom']),
      fitting('main_gearbox', 'air_ambulance_main_gearbox', [0, s.mastFoot - 0.36, 0], ['roof']),
      fitting('mast', 'air_ambulance_mast', [0, s.mastFoot, 0], ['main_gearbox']),
      fitting('main_rotor', 'air_ambulance_main_rotor', [0, s.hub, 0], ['mast']),
      fitting('fuel_tank', 'air_ambulance_fuel_tank', [0, 0.56, 0], ['belly']),
      fitting('console', 'air_ambulance_console', [2.02, 0.92, 0], ['belly']),
      fitting('cyclic', 'control_stick', [1.6, s.floor, 0], ['belly']),
      fitting('stretcher', 'stretcher', [-0.7, s.floor, -0.36], ['cabin_floor']),
      fitting('locker', 'air_ambulance_locker', [0.72, s.floor, -0.36], ['cabin_floor']),
      fitting('attendant_seat', 'attendant_seat', [0.3, s.floor, 0.42], ['cabin_floor']),
      kit.cargoSpace('kit_bay', [-1.4, s.floor, 0.3], [8, 8, 4], 'cabin_floor'),
      fitting('tail_beacon', 'air_ambulance_beacon', [-6.98, 3.25, 0], ['tail_surfaces']),
      fitting('cowl_beacon', 'air_ambulance_beacon', [-1.5, 2.9, 0], ['engine_cowl']),
      fitting('landing_lamp', 'air_ambulance_landing_lamp', [2.69, 1.05, 0], ['nose_cap']),
    ]
    + pair('turbine', 'air_ambulance_turbine', [-1.1, 2.56, 0.22], on(['roof']))
    + pair('front_door', 'air_ambulance_front_door', origin, on(['belly', 'roof']))
    + pair('sliding_door', 'air_ambulance_sliding_door', origin, on(['roof']))
    + pair('door_track', 'air_ambulance_door_track', origin, on(['belly']))
    + pair('clamshell_door', 'air_ambulance_clamshell_door', origin, on(['cabin_rear']))
    + pair('seat', 'air_ambulance_seat', [1.28, s.floor, 0.4], on(['belly'])),
  },
}
