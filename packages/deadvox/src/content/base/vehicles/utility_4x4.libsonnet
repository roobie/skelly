// Items and blueprint for the armoured utility vehicle. Its panels fit at the origin; everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/utility_4x4.spec.libsonnet';
local wheel = 'utility_4x4_wheel';
{
  items: [
    part(wheel, 'Utility 4x4 wheel', [6, 6], ['wheel']) + { vehicle+: { mount: wheel } },
    part('utility_4x4_frame', 'Utility 4x4 frame', pile, ['structure']),
    part('utility_4x4_hull', 'Utility 4x4 hull', pile, ['structure', 'protection']),
    part('utility_4x4_hood', 'Utility 4x4 hood', pile, ['protection']),
    part('utility_4x4_face', 'Utility 4x4 nose panel', pile, ['protection']),
    part('utility_4x4_guard', 'Utility 4x4 brush guard', pile, ['protection']),
    part('utility_4x4_front_door', 'Utility 4x4 front door', pile, ['entry', 'glazing', 'protection']),
    part('utility_4x4_rear_door', 'Utility 4x4 rear door', pile, ['entry', 'glazing', 'protection']),
    part('utility_4x4_windscreen', 'Utility 4x4 windscreen', pile, ['glazing']),
    part('utility_4x4_dashboard', 'Utility 4x4 dashboard', pile, ['structure']),
    part('utility_4x4_hatch', 'Utility 4x4 roof hatch', pile, ['protection']),
    part('utility_4x4_steering_box', 'Utility 4x4 steering box', [5, 3], ['steered']),
  ],
  blueprint: {
    id: 'utility_4x4',
    name: 'Armoured utility 4x4',
    fittings: [
      fitting('frame', 'utility_4x4_frame', origin),
      fitting('hull', 'utility_4x4_hull', origin, ['frame']),
      fitting('hood', 'utility_4x4_hood', origin, ['hull']),
      fitting('face', 'utility_4x4_face', origin, ['frame']),
      fitting('guard', 'utility_4x4_guard', origin, ['frame']),
      fitting('windscreen', 'utility_4x4_windscreen', origin, ['hull']),
      fitting('dashboard', 'utility_4x4_dashboard', origin, ['hull']),
      fitting('hatch', 'utility_4x4_hatch', origin, ['hull']),
      fitting('steering_box', 'utility_4x4_steering_box', origin, ['frame']),
      fitting('front_axle', 'beam_axle_van', [s.frontAxle, s.hub - 0.37, 0], ['frame']),
      fitting('rear_axle', 'beam_axle_van', [s.rearAxle, s.hub - 0.37, 0], ['frame']),
      fitting('engine', 'engine_i4_diesel', [1.3, 0.5, 0], ['frame']),
      fitting('gearbox', 'gearbox_inline', [0.74, 0.5, 0], ['engine']),
      fitting('prop_shaft', 'prop_shaft_long', [-0.4, 0.42, 0], ['gearbox', 'rear_axle']),
      fitting('radiator', 'radiator_van', [2.14, 0.56, 0], ['frame']),
      fitting('fuel_tank', 'fuel_tank_car', [-2.0, 0.42, 0], ['frame']),
      fitting('exhaust', 'exhaust_car', [-1.92, 0.36, 0.55], ['engine', 'frame']),
      fitting('tow_hitch', 'tow_hitch', [s.rear - 0.07, 0.5, 0], ['frame']),
      fitting('steering_wheel', 'steering_wheel', [s.cabFront - 0.23, s.waist + 0.13, -0.51], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [0.46, s.floor + 0.26, 0], ['hull']),
    ]
    + pair('front_wheel', wheel, [s.frontAxle, s.hub, s.wheelZ], on(['front_axle']))
    + pair('rear_wheel', wheel, [s.rearAxle, s.hub, s.wheelZ], on(['rear_axle']))
    + pair('front_door', 'utility_4x4_front_door', origin, on(['hull']))
    + pair('rear_door', 'utility_4x4_rear_door', origin, on(['hull']))
    + pair('front_seat', 'front_seat', [0.24, s.floor, 0.52], on(['hull']))
    + pair('rear_seat', 'front_seat', [-0.54, s.floor, 0.52], on(['hull']))
    + pair('mirror', 'door_mirror', [s.cabFront - 0.02, s.waist + 0.12, s.skin], on(['hull']))
    + pair('headlamp', 'headlamp_large', [s.nose - 0.02, 0.8, 0.8], on(['face']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.02, 0.92, 0.9], on(['hull']))
    + kit.batteryBay('hatchback_battery_tray', [1.9, 0.92, 0.42], ['hull']),
  },
}
