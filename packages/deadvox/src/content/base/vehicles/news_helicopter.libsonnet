// Items and blueprint for the news helicopter. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/news_helicopter.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/news_helicopter.spec.libsonnet';
{
  items: [
    part('news_helicopter_belly', 'News helicopter belly', pile, ['structure', 'protection']),
    part('news_helicopter_rear_fairing', 'News helicopter rear fairing', pile, ['structure', 'protection']),
    part('news_helicopter_nose_cap', 'News helicopter nose cap', [8, 6], ['protection']),
    part('news_helicopter_windscreen', 'News helicopter windscreen', pile, ['glazing']),
    part('news_helicopter_roof', 'News helicopter cabin roof', pile, ['structure', 'protection']),
    part('news_helicopter_front_door', 'News helicopter front door', pile, ['entry', 'glazing', 'protection']),
    part('news_helicopter_rear_door', 'News helicopter rear door', pile, ['entry', 'glazing', 'protection']),
    part('news_helicopter_engine_cowl', 'News helicopter engine cowl', pile, ['protection']),
    part('news_helicopter_tail_boom', 'News helicopter tail boom', pile, ['structure']),
    part('news_helicopter_tail_surfaces', 'News helicopter tail fin', pile, ['structure']),
    part('news_helicopter_tail_rotor', 'News helicopter tail rotor', pile, ['structure']),
    part('news_helicopter_main_rotor', 'News helicopter main rotor', pile, ['structure']),
    part('news_helicopter_mast', 'News helicopter mast', [10, 3], ['structure']),
    part('news_helicopter_main_gearbox', 'News helicopter main gearbox', [5, 5], ['structure']),
    part('news_helicopter_turbine', 'News helicopter turbine', [10, 5], ['power']),
    part('news_helicopter_fuel_tank', 'News helicopter fuel tank', [9, 6], ['fuel']),
    part('news_helicopter_skids', 'News helicopter skids', pile, ['structure']),
    part('news_helicopter_seat', 'News helicopter front seat', [6, 6], ['seat']),
    part('news_helicopter_rear_bench', 'News helicopter rear bench', [12, 6], ['seat']),
    part('news_helicopter_console', 'News helicopter instrument console', [8, 6], ['structure']),
    part('news_helicopter_camera_ball', 'News helicopter camera ball', [5, 5], ['structure']),
    part('news_helicopter_downlink_dome', 'News helicopter downlink dome', [4, 4], ['structure']),
    part('news_helicopter_beacon', 'News helicopter beacon', [2, 2], ['light']),
    part('news_helicopter_landing_lamp', 'News helicopter landing lamp', [3, 2], ['light']),
  ],
  blueprint: {
    id: 'news_helicopter',
    name: 'News helicopter',
    fittings: [
      fitting('belly', 'news_helicopter_belly', origin),
      fitting('rear_fairing', 'news_helicopter_rear_fairing', origin, ['belly']),
      fitting('skids', 'news_helicopter_skids', origin, ['belly']),
      fitting('nose_cap', 'news_helicopter_nose_cap', origin, ['belly']),
      fitting('windscreen', 'news_helicopter_windscreen', origin, ['belly', 'roof']),
      fitting('roof', 'news_helicopter_roof', origin, ['rear_fairing']),
      fitting('engine_cowl', 'news_helicopter_engine_cowl', origin, ['roof', 'rear_fairing']),
      fitting('tail_boom', 'news_helicopter_tail_boom', origin, ['rear_fairing']),
      fitting('tail_surfaces', 'news_helicopter_tail_surfaces', origin, ['tail_boom']),
      fitting('tail_rotor', 'news_helicopter_tail_rotor', [s.tailRotor.x, s.tailRotor.y, s.tailRotor.z], ['tail_boom']),
      fitting('main_gearbox', 'news_helicopter_main_gearbox', [0, s.mastFoot - 0.36, 0], ['roof']),
      fitting('mast', 'news_helicopter_mast', [0, s.mastFoot, 0], ['main_gearbox']),
      fitting('main_rotor', 'news_helicopter_main_rotor', [0, s.hub, 0], ['mast']),
      fitting('turbine', 'news_helicopter_turbine', [-0.95, 2.22, 0], ['rear_fairing']),
      fitting('fuel_tank', 'news_helicopter_fuel_tank', [-0.75, 1.15, 0], ['rear_fairing']),
      fitting('console', 'news_helicopter_console', [1.62, s.floor, 0], ['belly']),
      fitting('cyclic', 'control_stick', [1.28, s.floor, 0], ['belly']),
      fitting('rear_bench', 'news_helicopter_rear_bench', [-0.02, s.floor, 0], ['belly']),
      fitting('camera_ball', 'news_helicopter_camera_ball', [2.16, 0.32, 0], ['belly']),
      fitting('downlink_dome', 'news_helicopter_downlink_dome', [-1.05, 0.68, 0], ['rear_fairing']),
      fitting('beacon', 'news_helicopter_beacon', [-5.68, 2.72, 0], ['tail_surfaces']),
      fitting('landing_lamp', 'news_helicopter_landing_lamp', [2.34, 1.0, 0], ['nose_cap']),
    ]
    + pair('front_door', 'news_helicopter_front_door', origin, on(['belly', 'roof']))
    + pair('rear_door', 'news_helicopter_rear_door', origin, on(['belly', 'roof']))
    + pair('seat', 'news_helicopter_seat', [1.0, s.floor, 0.32], on(['belly'])),
  },
}
