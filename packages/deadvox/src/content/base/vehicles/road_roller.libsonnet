// Items and blueprint for the road roller. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/road_roller.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/road_roller.spec.libsonnet';
{
  items: [
    part('road_roller_drum', 'Roller drum', pile, ['wheel', 'driven']),
    part('road_roller_front_yoke', 'Roller front yoke', pile, ['structure', 'steered']),
    part('road_roller_rear_yoke', 'Roller rear yoke', pile, ['structure']),
    part('road_roller_platform', 'Roller operator platform', pile, ['structure']),
    part('road_roller_engine_hood', 'Roller engine hood', pile, ['protection']),
    part('road_roller_water_tank', 'Roller water tank', pile, ['storage']),
    part('road_roller_canopy', 'Roller canopy', pile, ['protection', 'structure']),
    part('road_roller_step', 'Roller side step', [9, 2], ['entry', 'structure']),
    part('road_roller_step_hanger', 'Roller step hanger', [8, 2], ['structure']),
    part('road_roller_exhaust', 'Roller exhaust pipe', [2, 5], []),
  ],
  blueprint: {
    id: 'road_roller',
    name: 'Road roller',
    fittings: [
      fitting('platform', 'road_roller_platform', origin),
      fitting('front_yoke', 'road_roller_front_yoke', origin, ['platform']),
      fitting('rear_yoke', 'road_roller_rear_yoke', origin, ['platform']),
      fitting('front_drum', 'road_roller_drum', [s.frontAxle, s.drumRadius, 0], ['front_yoke']),
      fitting('rear_drum', 'road_roller_drum', [s.rearAxle, s.drumRadius, 0], ['rear_yoke']),
      fitting('engine_hood', 'road_roller_engine_hood', origin, ['rear_yoke']),
      fitting('water_tank', 'road_roller_water_tank', origin, ['front_yoke']),
      fitting('canopy', 'road_roller_canopy', origin, ['platform', 'engine_hood']),
      fitting('engine', 'engine_i3_small', [-1.3, 1.28, 0], ['rear_yoke']),
      fitting('radiator', 'radiator_small', [-1.86, 1.34, 0], ['rear_yoke']),
      fitting('fuel_tank', 'fuel_tank_car', [-0.9, 0.76, 0], ['platform']),
      fitting('exhaust', 'road_roller_exhaust', [-1.1, s.hoodTop, -0.34], ['engine_hood']),
      fitting('seat', 'front_seat', [-0.1, s.deck + 0.26, 0], ['platform']),
      fitting('steering_column', 'steering_column_short', [0.37, 1.56, 0], ['platform']),
      fitting('steering_wheel', 'steering_wheel', [0.3, 1.66, 0], ['steering_column']),
      fitting('travel_lever', 'gear_lever', [0.48, 1.56, 0.2], ['platform']),
      fitting('beacon', 'beacon_amber', [0, s.canopy, 0], ['canopy']),
    ]
    + pair('step_hanger', 'road_roller_step_hanger', origin, on(['platform']))
    + pair('step', 'road_roller_step', origin, on(paired=['step_hanger']))
    + pair('tail_lamp', 'tail_lamp_small', [-2.02, 1.42, 0.5], on(['engine_hood']))
    + kit.headlamps(2.02, 1.4, 0.46, ['water_tank'])
    + kit.batteryBay('hatchback_battery_tray', [-1.08, 1.28, 0.42], ['rear_yoke']),
  },
}
