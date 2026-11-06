// Items and blueprint for the saloon. Its panels fit at the origin; everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/saloon.spec.libsonnet';
local door(id, name) = part(id, name, pile, ['entry', 'glazing', 'protection']);
{
  items: [
    part('saloon_shell', 'Saloon body shell', pile, ['structure', 'protection', 'storage']),
    part('saloon_windscreen', 'Saloon windscreen', pile, ['glazing']),
    part('saloon_boot_lid', 'Saloon boot lid', pile, ['entry', 'protection']),
    part('saloon_bonnet', 'Saloon bonnet', pile, ['protection']),
    part('saloon_front_wing', 'Saloon front wing', pile, ['protection']),
    part('saloon_front_bumper', 'Saloon front bumper', pile, ['protection']),
    part('saloon_rear_bumper', 'Saloon rear bumper', pile, ['protection']),
    part('saloon_tail_lamp', 'Saloon tail lamp', [3, 3], ['light']),
    part('saloon_dashboard', 'Saloon dashboard', pile, ['structure']),
    door('saloon_front_door', 'Saloon front door'),
    door('saloon_rear_door', 'Saloon rear door'),
  ],
  blueprint: {
    id: 'saloon',
    name: 'Saloon',
    fittings: [
      fitting('shell', 'saloon_shell', origin),
      fitting('windscreen', 'saloon_windscreen', origin, ['shell']),
      fitting('boot_lid', 'saloon_boot_lid', origin, ['shell']),
      fitting('bonnet', 'saloon_bonnet', origin, ['shell']),
      fitting('front_bumper', 'saloon_front_bumper', origin, ['shell']),
      fitting('rear_bumper', 'saloon_rear_bumper', origin, ['shell']),
      fitting('dashboard', 'saloon_dashboard', origin, ['shell']),
      fitting('engine', 'engine_i4_petrol', [s.frontAxle - 0.02, 0.28, 0], ['shell']),
      fitting('gearbox', 'gearbox_transaxle', [s.frontAxle - 0.02, 0.3, -0.36], ['engine']),
      fitting('radiator', 'radiator_car', [s.front - 0.3, 0.32, 0], ['shell']),
      fitting('fuel_tank', 'fuel_tank_car', [s.rearAxle + 0.65, s.sill, 0], ['shell']),
      fitting('exhaust', 'exhaust_car', [s.rear + 0.46, 0.2, 0.42], ['engine', 'shell']),
      fitting('rear_axle', 'twist_beam', [s.rearAxle, 0, 0], ['shell']),
      fitting('steering_wheel', 'steering_wheel', [s.cowl - 0.4, s.waist - 0.2, -0.37], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [s.cowl - 0.4, 0.55, 0], ['dashboard']),
      fitting('rear_bench', 'bench_seat_3', [-0.55, s.floor, 0], ['shell']),
    ]
    + pair('front_wing', 'saloon_front_wing', origin, on(['shell']))
    + pair('front_door', 'saloon_front_door', origin, on(['shell']))
    + pair('rear_door', 'saloon_rear_door', origin, on(['shell']))
    + pair('tail_lamp', 'saloon_tail_lamp', origin, on(['shell']))
    + pair('front_strut', 'front_strut', [s.frontAxle, 0.28, s.side - 0.105 - 0.05], on(['shell']))
    + pair('front_wheel', 'wheel_205_55r16', [s.frontAxle, 0.316, s.side - 0.105], on(paired=['front_strut']))
    + pair('rear_wheel', 'wheel_205_55r16', [s.rearAxle, 0.316, s.side - 0.105], on(['rear_axle']))
    + pair('front_seat', 'front_seat', [0.05, s.floor, 0.37], on(['shell']))
    + pair('door_mirror', 'door_mirror', [s.cowl - 0.04, s.waist, s.side - 0.03], on(['shell']))
    + kit.headlamps(s.front - 0.07, 0.66, 0.62, ['front_bumper'])
    + kit.batteryBay('hatchback_battery_tray', [s.aPost + 0.25, 0.5, -0.44], ['shell']),
  },
}
