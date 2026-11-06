// Items and blueprint for the coupe. Its panels fit at the origin; everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/coupe.spec.libsonnet';
local door(id, name) = part(id, name, pile, ['entry', 'glazing', 'protection']);
{
  items: [
    part('coupe_shell', 'Coupe body shell', pile, ['structure', 'protection', 'storage']),
    part('coupe_windscreen', 'Coupe windscreen', pile, ['glazing']),
    part('coupe_boot_lid', 'Coupe boot lid', pile, ['entry', 'protection']),
    part('coupe_bonnet', 'Coupe bonnet', pile, ['protection']),
    part('coupe_front_wing', 'Coupe front wing', pile, ['protection']),
    part('coupe_front_bumper', 'Coupe front bumper', pile, ['protection']),
    part('coupe_rear_bumper', 'Coupe rear bumper', pile, ['protection']),
    part('coupe_tail_lamp', 'Coupe tail lamp', [3, 3], ['light']),
    part('coupe_dashboard', 'Coupe dashboard', pile, ['structure']),
    door('coupe_front_door', 'Coupe front door'),
  ],
  blueprint: {
    id: 'coupe',
    name: 'Coupe',
    fittings: [
      fitting('shell', 'coupe_shell', origin),
      fitting('windscreen', 'coupe_windscreen', origin, ['shell']),
      fitting('boot_lid', 'coupe_boot_lid', origin, ['shell']),
      fitting('bonnet', 'coupe_bonnet', origin, ['shell']),
      fitting('front_bumper', 'coupe_front_bumper', origin, ['shell']),
      fitting('rear_bumper', 'coupe_rear_bumper', origin, ['shell']),
      fitting('dashboard', 'coupe_dashboard', origin, ['shell']),
      fitting('engine', 'engine_i4_petrol', [s.frontAxle - 0.02, 0.2, 0], ['shell']),
      fitting('gearbox', 'gearbox_transaxle', [s.frontAxle - 0.02, 0.3, -0.36], ['engine']),
      fitting('radiator', 'radiator_car', [s.front - 0.3, 0.32, 0], ['shell']),
      fitting('fuel_tank', 'fuel_tank_car', [s.rearAxle + 0.65, s.sill, 0], ['shell']),
      fitting('exhaust', 'exhaust_small', [s.rear + 0.46, 0.2, 0.42], ['engine', 'shell']),
      fitting('rear_axle', 'twist_beam', [s.rearAxle, 0, 0], ['shell']),
      fitting('steering_wheel', 'steering_wheel', [s.cowl - 0.4, s.waist - 0.16, -0.37], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [s.cowl - 0.4, 0.55, 0], ['dashboard']),
      fitting('rear_bench', 'bench_seat_2', [-0.6, s.floor, 0], ['shell']),
    ]
    + pair('front_wing', 'coupe_front_wing', origin, on(['shell']))
    + pair('front_door', 'coupe_front_door', origin, on(['shell']))
    + pair('tail_lamp', 'coupe_tail_lamp', origin, on(['shell']))
    + pair('front_strut', 'front_strut', [s.frontAxle, 0.28, s.side - 0.105 - 0.05], on(['shell']))
    + pair('front_wheel', 'wheel_205_55r16', [s.frontAxle, 0.316, s.side - 0.105], on(paired=['front_strut']))
    + pair('rear_wheel', 'wheel_205_55r16', [s.rearAxle, 0.316, s.side - 0.105], on(['rear_axle']))
    + pair('front_seat', 'front_seat', [-0.02, s.floor, 0.37], on(['shell']))
    + pair('door_mirror', 'door_mirror', [s.cowl - 0.04, s.waist, s.side - 0.03], on(['shell']))
    + kit.headlamps(s.front - 0.07, 0.56, 0.62, ['front_bumper'])
    + kit.batteryBay('hatchback_battery_tray', [s.aPost + 0.25, 0.5, -0.44], ['shell']),
  },
}
