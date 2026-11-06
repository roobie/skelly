// Items and blueprint for the estate. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/estate.libsonnet`);
// everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/estate.spec.libsonnet';
local door(id, name) = part(id, name, pile, ['entry', 'glazing', 'protection']);
{
  items: [
    part('estate_shell', 'Estate body shell', pile, ['structure', 'protection', 'storage']),
    part('estate_windscreen', 'Estate windscreen', pile, ['glazing']),
    part('estate_tailgate', 'Estate tailgate', pile, ['entry', 'glazing']),
    part('estate_bonnet', 'Estate bonnet', pile, ['protection']),
    part('estate_front_wing', 'Estate front wing', pile, ['protection']),
    part('estate_front_bumper', 'Estate front bumper', pile, ['protection']),
    part('estate_rear_bumper', 'Estate rear bumper', pile, ['protection']),
    part('estate_tail_lamp', 'Estate tail lamp', [3, 3], ['light']),
    part('estate_dashboard', 'Estate dashboard', pile, ['structure']),
    door('estate_front_door', 'Estate front door'),
    door('estate_rear_door', 'Estate rear door'),
  ],
  blueprint: {
    id: 'estate',
    name: 'Estate',
    fittings: [
      fitting('shell', 'estate_shell', origin),
      fitting('windscreen', 'estate_windscreen', origin, ['shell']),
      fitting('tailgate', 'estate_tailgate', origin, ['shell']),
      fitting('bonnet', 'estate_bonnet', origin, ['shell']),
      fitting('front_bumper', 'estate_front_bumper', origin, ['shell']),
      fitting('rear_bumper', 'estate_rear_bumper', origin, ['shell']),
      fitting('dashboard', 'estate_dashboard', origin, ['shell']),
      fitting('engine', 'engine_i4_petrol', [s.frontAxle - 0.02, 0.32, 0], ['shell']),
      fitting('gearbox', 'gearbox_transaxle', [s.frontAxle - 0.02, 0.3, -0.42], ['engine']),
      fitting('radiator', 'radiator_car', [s.front - 0.3, 0.32, 0], ['shell']),
      fitting('fuel_tank', 'fuel_tank_car', [-0.72, s.sill, 0], ['shell']),
      fitting('exhaust', 'exhaust_car', [s.rear + 0.46, 0.2, 0.42], ['engine', 'shell']),
      fitting('rear_axle', 'twist_beam', [s.rearAxle, 0, 0], ['shell']),
      fitting('steering_wheel', 'steering_wheel', [s.cowl - 0.4, 0.78, -0.37], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [s.cowl - 0.4, 0.55, 0], ['dashboard']),
      fitting('rear_bench', 'bench_seat_3', [-0.55, s.floor, 0], ['shell']),
    ]
    + pair('front_wing', 'estate_front_wing', origin, on(['shell']))
    + pair('front_door', 'estate_front_door', origin, on(['shell']))
    + pair('rear_door', 'estate_rear_door', origin, on(['shell']))
    + pair('tail_lamp', 'estate_tail_lamp', origin, on(['shell']))
    + pair('front_strut', 'front_strut', [s.frontAxle, 0.28, 0.75], on(['shell']))
    + pair('front_wheel', 'wheel_205_55r16', [s.frontAxle, 0.316, 0.8], on(paired=['front_strut']))
    + pair('rear_wheel', 'wheel_205_55r16', [s.rearAxle, 0.316, 0.8], on(['rear_axle']))
    + pair('front_seat', 'front_seat', [0.05, s.floor, 0.37], on(['shell']))
    + pair('door_mirror', 'door_mirror', [s.cowl - 0.04, s.waist, s.side - 0.03], on(['shell']))
    + kit.headlamps(s.front - 0.07, 0.66, 0.62, ['front_bumper'])
    + kit.batteryBay('hatchback_battery_tray', [s.aPost + 0.25, 0.5, -0.44], ['shell']),
  },
}
