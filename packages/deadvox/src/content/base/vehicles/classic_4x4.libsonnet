// Items and blueprint for the classic 4x4. Its panels fit at the origin; everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/classic_4x4.spec.libsonnet';
{
  items: [
    part('classic_4x4_shell', 'Classic 4x4 body shell', pile, ['structure', 'protection', 'storage']),
    part('classic_4x4_windscreen', 'Classic 4x4 windscreen', pile, ['glazing']),
    part('classic_4x4_tailgate', 'Classic 4x4 tailgate', pile, ['entry', 'glazing']),
    part('classic_4x4_bonnet', 'Classic 4x4 bonnet', pile, ['protection']),
    part('classic_4x4_front_wing', 'Classic 4x4 front wing', pile, ['protection']),
    part('classic_4x4_front_bumper', 'Classic 4x4 front bumper', pile, ['protection']),
    part('classic_4x4_rear_bumper', 'Classic 4x4 rear bumper', pile, ['protection']),
    part('classic_4x4_tail_lamp', 'Classic 4x4 tail lamp', [3, 3], ['light']),
    part('classic_4x4_dashboard', 'Classic 4x4 dashboard', pile, ['structure']),
    part('classic_4x4_front_door', 'Classic 4x4 door', pile, ['entry', 'glazing', 'protection']),
  ],
  blueprint: {
    id: 'classic_4x4',
    name: 'Classic 4x4',
    fittings: [
      fitting('shell', 'classic_4x4_shell', origin),
      fitting('windscreen', 'classic_4x4_windscreen', origin, ['shell']),
      fitting('tailgate', 'classic_4x4_tailgate', origin, ['shell']),
      fitting('bonnet', 'classic_4x4_bonnet', origin, ['shell']),
      fitting('front_bumper', 'classic_4x4_front_bumper', origin, ['shell']),
      fitting('rear_bumper', 'classic_4x4_rear_bumper', origin, ['shell']),
      fitting('dashboard', 'classic_4x4_dashboard', origin, ['shell']),
      fitting('engine', 'engine_v8_petrol', [1.25, 0.49, 0], ['shell']),
      fitting('gearbox', 'gearbox_inline', [0.63, 0.45, 0], ['engine']),
      fitting('front_axle', 'beam_axle_light', [s.frontAxle, s.hub - 0.37, 0], ['shell']),
      fitting('rear_axle', 'beam_axle_light', [s.rearAxle, s.hub - 0.37, 0], ['shell']),
      fitting('prop_shaft', 'prop_shaft_short', [-0.5, 0.33, 0], ['gearbox', 'rear_axle']),
      fitting('front_prop_shaft', 'prop_shaft_short', [0.74, 0.33, 0], ['gearbox', 'front_axle']),
      fitting('radiator', 'radiator_van', [s.front - 0.3, 0.5, 0], ['shell']),
      fitting('fuel_tank', 'fuel_tank_van', [s.rear + 0.42, 0.36, -0.16], ['shell']),
      fitting('exhaust', 'exhaust_car', [s.rear + 0.42, 0.27, 0.42], ['engine', 'shell']),
      fitting('steering_wheel', 'steering_wheel', [s.cowl - 0.4, s.waist - 0.2, -0.37], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [s.cowl - 0.4, 0.77, 0], ['dashboard']),
      fitting('rear_bench', 'bench_seat_3', [-1.0, 0.7, 0], ['shell']),
      fitting('spare_wheel', 'spare_wheel_carrier', [s.rear + 0.05, 1.2, 0], ['tailgate']),
      fitting('tow_hitch', 'tow_hitch', [s.rear + 0.02, 0.37, 0], ['shell']),
    ]
    + pair('front_wing', 'classic_4x4_front_wing', origin, on(['shell']))
    + pair('front_door', 'classic_4x4_front_door', origin, on(['shell']))
    + pair('tail_lamp', 'classic_4x4_tail_lamp', origin, on(['shell']))
    + pair('front_strut', 'front_strut', [s.frontAxle, s.hub, s.wheelZ - 0.05], on(['shell']))
    + pair('front_wheel', 'wheel_265_75r16', [s.frontAxle, s.hub, s.wheelZ], on(paired=['front_strut']))
    + pair('rear_wheel', 'wheel_265_75r16', [s.rearAxle, s.hub, s.wheelZ], on(['rear_axle']))
    + pair('front_seat', 'front_seat', [-0.05, s.floor, 0.37], on(['shell']))
    + pair('door_mirror', 'door_mirror', [s.cowl - 0.04, s.waist, s.side - 0.03], on(['shell']))
    + pair('headlamp', 'headlamp_round', [s.front - 0.035, 0.76, 0.6], on(['front_bumper']))
    + kit.batteryBay('hatchback_battery_tray', [s.aPost + 0.25, 0.72, -0.44], ['shell']),
  },
}
