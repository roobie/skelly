// Items and blueprint for the suv. Its panels fit at the origin; everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/suv.spec.libsonnet';
local door(id, name) = part(id, name, pile, ['entry', 'glazing', 'protection']);
{
  items: [
    part('suv_shell', 'SUV body shell', pile, ['structure', 'protection', 'storage']),
    part('suv_windscreen', 'SUV windscreen', pile, ['glazing']),
    part('suv_tailgate', 'SUV tailgate', pile, ['entry', 'glazing']),
    part('suv_bonnet', 'SUV bonnet', pile, ['protection']),
    part('suv_front_wing', 'SUV front wing', pile, ['protection']),
    part('suv_front_bumper', 'SUV front bumper', pile, ['protection']),
    part('suv_rear_bumper', 'SUV rear bumper', pile, ['protection']),
    part('suv_tail_lamp', 'SUV tail lamp', [3, 3], ['light']),
    part('suv_dashboard', 'SUV dashboard', pile, ['structure']),
    door('suv_front_door', 'SUV front door'),
    door('suv_rear_door', 'SUV rear door'),
    part('suv_arch_flare', 'SUV arch flare', pile, ['protection']),
    part('suv_side_step', 'SUV side step', pile, ['structure']),
    part('suv_roof_rails', 'SUV roof rails', pile, ['structure']),
  ],
  blueprint: {
    id: 'suv',
    name: 'SUV',
    fittings: [
      fitting('shell', 'suv_shell', origin),
      fitting('windscreen', 'suv_windscreen', origin, ['shell']),
      fitting('tailgate', 'suv_tailgate', origin, ['shell']),
      fitting('bonnet', 'suv_bonnet', origin, ['shell']),
      fitting('front_bumper', 'suv_front_bumper', origin, ['shell']),
      fitting('rear_bumper', 'suv_rear_bumper', origin, ['shell']),
      fitting('dashboard', 'suv_dashboard', origin, ['shell']),
      fitting('engine', 'engine_v6_petrol', [1.35, 0.45, 0], ['shell']),
      fitting('gearbox', 'gearbox_inline', [0.79, 0.42, 0], ['engine']),
      fitting('rear_axle', 'beam_axle_light', [s.rearAxle, 0.032, 0], ['shell']),
      fitting('prop_shaft', 'prop_shaft_short', [-0.48, 0.42, 0], ['gearbox', 'rear_axle']),
      fitting('radiator', 'radiator_van', [s.front - 0.3, 0.48, 0], ['shell']),
      fitting('fuel_tank', 'fuel_tank_van', [s.rearAxle - 0.55, 0.34, -0.06], ['shell']),
      fitting('steering_wheel', 'steering_wheel', [s.cowl - 0.4, s.waist - 0.2, -0.37], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [s.cowl - 0.4, 0.75, 0], ['dashboard']),
      fitting('rear_bench', 'bench_seat_3', [-0.72, s.floor, 0], ['shell']),
      fitting('roof_rails', 'suv_roof_rails', origin, ['shell']),
      fitting('spare_wheel', 'spare_wheel_carrier', [s.rear + 0.05, 1.15, 0], ['tailgate']),
      fitting('front_axle', 'beam_axle_light', [s.frontAxle, 0.032, 0], ['shell']),
      fitting('front_prop_shaft', 'prop_shaft_short', [1.05, 0.42, 0], ['gearbox', 'front_axle']),
      fitting('exhaust', 'exhaust_long', [s.rear + 0.58, 0.34, 0.5], ['engine', 'shell']),
      fitting('tow_hitch', 'tow_hitch', [s.rear + 0.02, 0.35, 0], ['shell']),
    ]
    + pair('front_wing', 'suv_front_wing', origin, on(['shell']))
    + pair('front_door', 'suv_front_door', origin, on(['shell']))
    + pair('rear_door', 'suv_rear_door', origin, on(['shell']))
    + pair('tail_lamp', 'suv_tail_lamp', origin, on(['shell']))
    + pair('arch_flare', 'suv_arch_flare', origin, on(['shell']))
    + pair('side_step', 'suv_side_step', origin, on(['shell']))
    + pair('front_strut', 'front_strut', [s.frontAxle, 0.366, s.side - 0.1325 - 0.05], on(['shell']))
    + pair('front_wheel', 'wheel_265_75r16', [s.frontAxle, 0.402, s.side - 0.1325], on(paired=['front_strut']))
    + pair('rear_wheel', 'wheel_265_75r16', [s.rearAxle, 0.402, s.side - 0.1325], on(['rear_axle']))
    + pair('front_seat', 'front_seat', [0.05, s.floor, 0.37], on(['shell']))
    + pair('door_mirror', 'door_mirror', [s.cowl - 0.04, s.waist, s.side - 0.03], on(['shell']))
    + kit.headlamps(s.front - 0.07, 0.95, 0.62, ['front_bumper'])
    + kit.batteryBay('hatchback_battery_tray', [s.aPost + 0.25, 0.7, -0.44], ['shell']),
  },
}
