// Items and blueprint for the city car. Its panels fit at the origin; everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/city_car.spec.libsonnet';
local door(id, name) = part(id, name, pile, ['entry', 'glazing', 'protection']);
{
  items: [
    part('city_car_shell', 'City car body shell', pile, ['structure', 'protection', 'storage']),
    part('city_car_windscreen', 'City car windscreen', pile, ['glazing']),
    part('city_car_tailgate', 'City car tailgate', pile, ['entry', 'glazing']),
    part('city_car_bonnet', 'City car bonnet', pile, ['protection']),
    part('city_car_front_wing', 'City car front wing', pile, ['protection']),
    part('city_car_front_bumper', 'City car front bumper', pile, ['protection']),
    part('city_car_rear_bumper', 'City car rear bumper', pile, ['protection']),
    part('city_car_tail_lamp', 'City car tail lamp', [3, 3], ['light']),
    part('city_car_dashboard', 'City car dashboard', pile, ['structure']),
    door('city_car_front_door', 'City car front door'),
  ],
  blueprint: {
    id: 'city_car',
    name: 'City car',
    fittings: [
      fitting('shell', 'city_car_shell', origin),
      fitting('windscreen', 'city_car_windscreen', origin, ['shell']),
      fitting('tailgate', 'city_car_tailgate', origin, ['shell']),
      fitting('bonnet', 'city_car_bonnet', origin, ['shell']),
      fitting('front_bumper', 'city_car_front_bumper', origin, ['shell']),
      fitting('rear_bumper', 'city_car_rear_bumper', origin, ['shell']),
      fitting('dashboard', 'city_car_dashboard', origin, ['shell']),
      fitting('engine', 'engine_i3_small', [s.frontAxle - 0.02, 0.3, 0], ['shell']),
      fitting('gearbox', 'gearbox_transaxle', [s.frontAxle - 0.02, 0.3, -0.36], ['engine']),
      fitting('radiator', 'radiator_small', [s.front - 0.3, 0.32, 0], ['shell']),
      fitting('fuel_tank', 'fuel_tank_car', [-0.62, s.sill, 0], ['shell']),
      fitting('exhaust', 'exhaust_small', [s.rear + 0.46, 0.2, 0.38], ['engine', 'shell']),
      fitting('rear_axle', 'twist_beam', [s.rearAxle, 0, 0], ['shell']),
      fitting('steering_wheel', 'steering_wheel', [s.cowl - 0.4, s.waist - 0.2, -0.37], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [s.cowl - 0.4, 0.55, 0], ['dashboard']),
      fitting('rear_bench', 'bench_seat_2', [-0.72, s.floor, 0], ['shell']),
    ]
    + pair('front_wing', 'city_car_front_wing', origin, on(['shell']))
    + pair('front_door', 'city_car_front_door', origin, on(['shell']))
    + pair('tail_lamp', 'city_car_tail_lamp', origin, on(['shell']))
    + pair('front_strut', 'front_strut', [s.frontAxle, 0.245, s.side - 0.085 - 0.05], on(['shell']))
    + pair('front_wheel', 'wheel_165_70r13', [s.frontAxle, 0.281, s.side - 0.085], on(paired=['front_strut']))
    + pair('rear_wheel', 'wheel_165_70r13', [s.rearAxle, 0.281, s.side - 0.085], on(['rear_axle']))
    + pair('front_seat', 'front_seat', [0, s.floor, 0.37], on(['shell']))
    + pair('door_mirror', 'door_mirror', [s.cowl - 0.04, s.waist, s.side - 0.03], on(['shell']))
    + kit.headlamps(s.front - 0.07, 0.62, 0.5, ['front_bumper'])
    + kit.batteryBay('hatchback_battery_tray', [s.aPost + 0.25, 0.5, -0.36], ['shell']),
  },
}
