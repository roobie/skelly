// Items and blueprint for the classic small car. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/classic_small_car.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/classic_small_car.spec.libsonnet';
local name(label) = 'Classic small car ' + label;
{
  items: [
    part('classic_small_car_shell', name('body shell'), pile, ['structure', 'protection', 'storage']),
    part('classic_small_car_front_wing', name('front wing'), pile, ['protection']),
    part('classic_small_car_windscreen', name('windscreen'), pile, ['glazing']),
    part('classic_small_car_door', name('door'), pile, ['entry', 'glazing', 'protection']),
    part('classic_small_car_bonnet', name('bonnet'), pile, ['protection']),
    part('classic_small_car_grille', name('grille'), [6, 6], ['protection']),
    part('classic_small_car_boot_lid', name('boot lid'), pile, ['entry', 'protection']),
    part('classic_small_car_front_bumper', name('front bumper'), pile, ['protection']),
    part('classic_small_car_rear_bumper', name('rear bumper'), pile, ['protection']),
    part('classic_small_car_dashboard', name('dashboard'), pile, ['structure']),
    part('classic_small_car_front_axle', name('front axle'), pile, ['structure', 'steered']),
    part('classic_small_car_rear_axle', name('rear axle'), pile, ['structure']),
  ],
  blueprint: {
    id: 'classic_small_car',
    name: 'Classic small car',
    fittings: [
      fitting('shell', 'classic_small_car_shell', origin),
      fitting('windscreen', 'classic_small_car_windscreen', origin, ['shell']),
      fitting('bonnet', 'classic_small_car_bonnet', origin, ['shell']),
      fitting('grille', 'classic_small_car_grille', origin, ['bonnet']),
      fitting('boot_lid', 'classic_small_car_boot_lid', origin, ['shell']),
      fitting('front_bumper', 'classic_small_car_front_bumper', origin, ['shell']),
      fitting('rear_bumper', 'classic_small_car_rear_bumper', origin, ['shell']),
      fitting('dashboard', 'classic_small_car_dashboard', origin, ['shell']),
      fitting('front_axle', 'classic_small_car_front_axle', origin, ['shell']),
      fitting('rear_axle', 'classic_small_car_rear_axle', origin, ['shell']),
      fitting('engine', 'engine_i3_small', [s.frontAxle + 0.05, 0.3, 0], ['shell']),
      fitting('gearbox', 'gearbox_transaxle', [s.frontAxle - 0.02, 0.32, -0.3], ['engine']),
      fitting('radiator', 'radiator_small', [1.58, 0.34, 0], ['shell']),
      fitting('fuel_tank', 'fuel_tank_car', [-1.55, 0.42, 0], ['shell']),
      fitting('exhaust', 'exhaust_small', [s.rear + 0.46, 0.17, 0.28], ['engine', 'shell']),
      fitting('steering_wheel', 'steering_wheel', [0.48, 0.66, -0.26], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [0.45, s.floor, 0], ['shell']),
      fitting('front_bench', 'bench_seat_low', [0.12, s.floor, 0], ['shell']),
      fitting('rear_bench', 'bench_seat_low', [-0.72, s.floor, 0], ['shell']),
    ]
    + pair('front_wing', 'classic_small_car_front_wing', origin, on(['shell']))
    + pair('door', 'classic_small_car_door', origin, on(['shell']))
    + pair('headlamp', 'headlamp_round', [1.5, 0.575, 0.62], on(['bonnet']))
    + pair('front_wheel', 'wheel_165_70r13', [s.frontAxle, s.hub, s.wheelZ], on(['front_axle']))
    + pair('rear_wheel', 'wheel_165_70r13', [s.rearAxle, s.hub, s.wheelZ], on(['rear_axle']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear + 0.06, 0.58, 0.44], on(['shell']))
    + pair('door_mirror', 'door_mirror_bright', [0.76, s.waist, s.body - 0.02], on(['shell']))
    + kit.batteryBay('hatchback_battery_tray', [1.3, 0.56, 0.28], ['shell']),
  },
}
