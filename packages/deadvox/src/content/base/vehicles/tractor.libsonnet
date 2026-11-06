// Items and blueprint for the tractor. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/tractor.libsonnet`);
// everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/tractor.spec.libsonnet';
{
  items: [
    part('tractor_chassis', 'Tractor chassis', pile, ['structure']),
    part('tractor_bonnet', 'Tractor bonnet', pile, ['protection']),
    part('tractor_fender', 'Tractor rear fender', pile, ['protection']),
    part('tractor_cab', 'Tractor cab', pile, ['structure', 'protection']),
    part('tractor_cab_door', 'Tractor cab door', pile, ['entry', 'glazing', 'protection']),
    part('tractor_windscreen', 'Tractor windscreen', pile, ['glazing']),
    part('tractor_rear_window', 'Tractor rear window', pile, ['glazing']),
    part('tractor_front_pivot', 'Tractor front axle pivot', [4, 4], ['structure', 'steered']),
    part('tractor_front_weight', 'Tractor front weight', [9, 4], ['structure']),
  ],
  blueprint: {
    id: 'tractor',
    name: 'Tractor',
    fittings: [
      fitting('chassis', 'tractor_chassis', origin),
      fitting('bonnet', 'tractor_bonnet', origin, ['chassis']),
      fitting('cab', 'tractor_cab', origin, ['chassis']),
      fitting('windscreen', 'tractor_windscreen', origin, ['cab']),
      fitting('rear_window', 'tractor_rear_window', origin, ['cab']),
      fitting('front_pivot', 'tractor_front_pivot', origin, ['chassis']),
      fitting('front_axle', 'beam_axle_light', [s.frontAxle, 0, 0], ['front_pivot']),
      fitting('rear_axle', 'beam_axle_truck', [s.rearAxle, s.rearHub - 0.52, 0], ['chassis']),
      fitting('front_weight', 'tractor_front_weight', origin, ['chassis']),
      fitting('engine', 'engine_i6_diesel', [0.92, 0.74, 0], ['chassis']),
      fitting('gearbox', 'gearbox_heavy', [-0.2, 0.5, 0], ['chassis']),
      fitting('radiator', 'radiator_van', [1.55, 0.9, 0], ['chassis']),
      fitting('fuel_tank', 'fuel_tank_car', [0.22, 1.32, 0], ['chassis']),
      fitting('exhaust', 'exhaust_stack_small', [1.2, 1.54, -0.22], ['bonnet']),
      fitting('hitch', 'tow_hitch', [-1.78, 0.5, 0], ['chassis']),
      fitting('seat', 'front_seat', [-0.72, s.deck + 0.05, 0], ['cab']),
      fitting('steering_wheel', 'steering_wheel_raked', [s.cabFront - 0.33, 1.74, 0], ['cab']),
      fitting('gear_lever', 'gear_lever', [s.cabFront - 0.42, s.deck + 0.05, 0.28], ['cab']),
      fitting('beacon', 'beacon_amber', [-0.72, s.roof + 0.1, 0], ['cab']),
    ]
    + pair('rear_fender', 'tractor_fender', origin, on(['chassis']))
    + pair('cab_door', 'tractor_cab_door', origin, on(['cab']))
    + pair('front_wheel', 'wheel_6_50r16_ag', [s.frontAxle, s.frontHub, s.frontZ], on(['front_axle']))
    + pair('rear_wheel', 'wheel_16_9r30', [s.rearAxle, s.rearHub, s.rearZ], on(['rear_axle']))
    + pair('tail_lamp', 'tail_lamp_small', [-1.98, 1.1, 0.9], on(paired=['rear_fender']))
    + pair('mirror', 'door_mirror', [s.cabFront - 0.02, 2.2, s.cabSide], on(['cab']))
    + kit.headlamps(s.nose - 0.02, 1.2, 0.3, ['bonnet'])
    + kit.batteryBay('hatchback_battery_tray', [0.22, 1.1, 0], ['chassis']),
  },
}
