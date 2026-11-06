// Items and blueprint for the police car. Its panels fit at the origin; everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/police_car.spec.libsonnet';
local door(id, name) = part(id, name, pile, ['entry', 'glazing', 'protection']);
{
  items: [
    part('police_car_shell', 'Police car body shell', pile, ['structure', 'protection', 'storage']),
    part('police_car_windscreen', 'Police car windscreen', pile, ['glazing']),
    part('police_car_boot_lid', 'Police car boot lid', pile, ['entry', 'protection']),
    part('police_car_bonnet', 'Police car bonnet', pile, ['protection']),
    part('police_car_front_wing', 'Police car front wing', pile, ['protection']),
    part('police_car_front_bumper', 'Police car front bumper', pile, ['protection']),
    part('police_car_rear_bumper', 'Police car rear bumper', pile, ['protection']),
    part('police_car_tail_lamp', 'Police car tail lamp', [3, 3], ['light']),
    part('police_car_dashboard', 'Police car dashboard', pile, ['structure']),
    door('police_car_front_door', 'Police car front door'),
    door('police_car_rear_door', 'Police car rear door'),
    part('police_car_light_bar', 'Police car light bar', pile, ['structure']),
    part('police_car_push_bar', 'Police car push bar', pile, ['protection']),
  ],
  blueprint: {
    id: 'police_car',
    name: 'Police car',
    fittings: [
      fitting('shell', 'police_car_shell', origin),
      fitting('windscreen', 'police_car_windscreen', origin, ['shell']),
      fitting('boot_lid', 'police_car_boot_lid', origin, ['shell']),
      fitting('bonnet', 'police_car_bonnet', origin, ['shell']),
      fitting('front_bumper', 'police_car_front_bumper', origin, ['shell']),
      fitting('rear_bumper', 'police_car_rear_bumper', origin, ['shell']),
      fitting('dashboard', 'police_car_dashboard', origin, ['shell']),
      fitting('engine', 'engine_i4_petrol', [s.frontAxle - 0.02, 0.28, 0], ['shell']),
      fitting('gearbox', 'gearbox_transaxle', [s.frontAxle - 0.02, 0.3, -0.36], ['engine']),
      fitting('radiator', 'radiator_car', [s.front - 0.3, 0.32, 0], ['shell']),
      fitting('fuel_tank', 'fuel_tank_car', [s.rearAxle + 0.65, s.sill, 0], ['shell']),
      fitting('exhaust', 'exhaust_car', [s.rear + 0.46, 0.2, 0.42], ['engine', 'shell']),
      fitting('rear_axle', 'twist_beam', [s.rearAxle, 0, 0], ['shell']),
      fitting('steering_wheel', 'steering_wheel', [s.cowl - 0.4, s.waist - 0.2, -0.37], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [s.cowl - 0.4, 0.55, 0], ['dashboard']),
      fitting('rear_bench', 'bench_seat_3', [-0.55, s.floor, 0], ['shell']),
      fitting('light_bar', 'police_car_light_bar', origin, ['shell']),
      fitting('push_bar', 'police_car_push_bar', origin, ['front_bumper']),
    ]
    + pair('front_wing', 'police_car_front_wing', origin, on(['shell']))
    + pair('front_door', 'police_car_front_door', origin, on(['shell']))
    + pair('rear_door', 'police_car_rear_door', origin, on(['shell']))
    + pair('tail_lamp', 'police_car_tail_lamp', origin, on(['shell']))
    + pair('beacon', 'beacon_blue', [-0.4, s.roof + 0.12, 0.34], on(['light_bar']))
    + pair('front_strut', 'front_strut', [s.frontAxle, 0.28, s.side - 0.105 - 0.05], on(['shell']))
    + pair('front_wheel', 'wheel_205_55r16', [s.frontAxle, 0.316, s.side - 0.105], on(paired=['front_strut']))
    + pair('rear_wheel', 'wheel_205_55r16', [s.rearAxle, 0.316, s.side - 0.105], on(['rear_axle']))
    + pair('front_seat', 'front_seat', [0.05, s.floor, 0.37], on(['shell']))
    + pair('door_mirror', 'door_mirror', [s.cowl - 0.04, s.waist, s.side - 0.03], on(['shell']))
    + kit.headlamps(s.front - 0.07, 0.66, 0.62, ['front_bumper'])
    + kit.batteryBay('hatchback_battery_tray', [s.aPost + 0.25, 0.5, -0.44], ['shell']),
  },
}
