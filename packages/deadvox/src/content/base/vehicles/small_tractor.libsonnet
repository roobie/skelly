// Items and blueprint for the compact tractor. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/small_tractor.libsonnet`);
// everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/small_tractor.spec.libsonnet';
{
  items: [
    part('small_tractor_chassis', 'Compact tractor chassis', pile, ['structure']),
    part('small_tractor_bonnet', 'Compact tractor bonnet', pile, ['protection']),
    part('small_tractor_fender', 'Compact tractor fender', pile, ['protection']),
    part('small_tractor_footboard', 'Compact tractor footboard', pile, ['entry', 'structure']),
    part('small_tractor_roll_bar', 'Compact tractor roll bar', pile, ['structure', 'protection']),
    part('small_tractor_front_axle', 'Compact tractor front axle', pile, ['structure', 'steered']),
  ],
  blueprint: {
    id: 'small_tractor',
    name: 'Compact tractor',
    fittings: [
      fitting('chassis', 'small_tractor_chassis', origin),
      fitting('bonnet', 'small_tractor_bonnet', origin, ['chassis']),
      fitting('roll_bar', 'small_tractor_roll_bar', origin, ['chassis']),
      fitting('front_axle', 'small_tractor_front_axle', [s.frontAxle, 0, 0], ['chassis']),
      fitting('rear_axle', 'beam_axle_light', [s.rearAxle, s.rearHub - 0.37, 0], ['chassis']),
      fitting('engine', 'engine_i3_small', [0.85, 0.66, 0], ['chassis']),
      fitting('gearbox', 'gearbox_inline', [0.15, 0.5, 0], ['chassis']),
      fitting('radiator', 'radiator_small', [1.3, 0.72, 0], ['chassis']),
      fitting('fuel_tank', 'fuel_tank_car', [0.2, 1.1, 0], ['chassis']),
      fitting('exhaust', 'exhaust_stack_small', [0.85, 1.22, -0.18], ['bonnet']),
      fitting('hitch', 'tow_hitch', [s.rear - 0.04, 0.34, 0], ['chassis']),
      fitting('seat', 'pan_seat', [-0.56, s.deck + 0.06, 0], ['chassis']),
      fitting('steering_wheel', 'steering_wheel_raked', [0.075, 1.46, 0], ['chassis']),
      fitting('gear_lever', 'gear_lever', [-0.15, s.deck, 0.14], ['chassis']),
      fitting('beacon', 'beacon_amber', [s.barX, s.barTop, 0], ['roll_bar']),
    ]
    + pair('footboard', 'small_tractor_footboard', origin, on(['chassis']))
    + pair('rear_fender', 'small_tractor_fender', origin, on(['chassis']))
    + pair('front_wheel', 'wheel_6_50r16_ag', [s.frontAxle, s.frontHub, s.frontZ], on(['front_axle']))
    + pair('rear_wheel', 'wheel_11_2r24', [s.rearAxle, s.rearHub, s.rearZ], on(['rear_axle']))
    // On the dark roll bar, because the fender is as red as the lens.
    + pair('tail_lamp', 'tail_lamp_small', [s.barX - 0.07, 1.3, s.barZ], on(['roll_bar']))
    + kit.headlamps(s.nose, 0.98, 0.2, ['bonnet'])
    + kit.batteryBay('hatchback_battery_tray', [0.2, 0.92, 0], ['chassis']),
  },
}
