// Items and blueprint for the muscle car. Its panels fit at the origin; everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/muscle_car.spec.libsonnet';
local door(id, name) = part(id, name, pile, ['entry', 'glazing', 'protection']);
{
  items: [
    part('muscle_car_shell', 'Muscle car body shell', pile, ['structure', 'protection', 'storage']),
    part('muscle_car_windscreen', 'Muscle car windscreen', pile, ['glazing']),
    part('muscle_car_boot_lid', 'Muscle car boot lid', pile, ['entry', 'protection']),
    part('muscle_car_bonnet', 'Muscle car bonnet', pile, ['protection']),
    part('muscle_car_front_wing', 'Muscle car front wing', pile, ['protection']),
    part('muscle_car_front_bumper', 'Muscle car front bumper', pile, ['protection']),
    part('muscle_car_rear_bumper', 'Muscle car rear bumper', pile, ['protection']),
    part('muscle_car_tail_lamp', 'Muscle car tail lamp', [3, 3], ['light']),
    part('muscle_car_dashboard', 'Muscle car dashboard', pile, ['structure']),
    door('muscle_car_front_door', 'Muscle car front door'),
  ],
  blueprint: {
    id: 'muscle_car',
    name: 'Muscle car',
    fittings: [
      fitting('shell', 'muscle_car_shell', origin),
      fitting('windscreen', 'muscle_car_windscreen', origin, ['shell']),
      fitting('boot_lid', 'muscle_car_boot_lid', origin, ['shell']),
      fitting('bonnet', 'muscle_car_bonnet', origin, ['shell']),
      fitting('front_bumper', 'muscle_car_front_bumper', origin, ['shell']),
      fitting('rear_bumper', 'muscle_car_rear_bumper', origin, ['shell']),
      fitting('dashboard', 'muscle_car_dashboard', origin, ['shell']),
      fitting('engine', 'engine_v8_petrol', [s.frontAxle - 0.3, 0.22, 0], ['shell']),
      fitting('gearbox', 'gearbox_inline', [s.cowl + 0.0, 0.2, 0], ['engine']),
      fitting('rear_axle', 'beam_axle_light', [s.rearAxle, -0.003, 0], ['shell']),
      fitting('prop_shaft', 'prop_shaft_short', [-0.38, 0.24, 0], ['gearbox', 'rear_axle']),
      fitting('radiator', 'radiator_car', [s.front - 0.3, 0.32, 0], ['shell']),
      fitting('fuel_tank', 'fuel_tank_car', [s.rearAxle - 0.5, 0.22, 0], ['shell']),
      fitting('steering_wheel', 'steering_wheel', [s.cowl - 0.4, s.waist - 0.2, -0.37], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [s.cowl - 0.4, 0.55, 0], ['dashboard']),
      fitting('rear_bench', 'bench_seat_2', [-0.6, s.floor, 0], ['shell']),
    ]
    + pair('front_wing', 'muscle_car_front_wing', origin, on(['shell']))
    + pair('front_door', 'muscle_car_front_door', origin, on(['shell']))
    + pair('tail_lamp', 'muscle_car_tail_lamp', origin, on(['shell']))
    + pair('exhaust', 'exhaust_small', [s.rear + 0.46, 0.2, 0.5], on(['engine', 'shell']))
    + pair('front_strut', 'front_strut', [s.frontAxle, 0.331, s.side - 0.12 - 0.05], on(['shell']))
    + pair('front_wheel', 'wheel_235_75r15', [s.frontAxle, 0.367, s.side - 0.12], on(paired=['front_strut']))
    + pair('rear_wheel', 'wheel_235_75r15', [s.rearAxle, 0.367, s.side - 0.12], on(['rear_axle']))
    + pair('front_seat', 'front_seat', [-0.02, s.floor, 0.37], on(['shell']))
    + pair('door_mirror', 'door_mirror', [s.cowl - 0.04, s.waist, s.side - 0.03], on(['shell']))
    + kit.headlamps(s.front - 0.07, 0.68, 0.7, ['front_bumper'])
    + kit.batteryBay('hatchback_battery_tray', [s.aPost + 0.25, 0.5, -0.44], ['shell']),
  },
}
