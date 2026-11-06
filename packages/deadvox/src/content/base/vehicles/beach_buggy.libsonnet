// Items and blueprint for the beach buggy. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/beach_buggy.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/beach_buggy.spec.libsonnet';
{
  items: [
    part('beach_buggy_frame', 'Beach buggy tube frame', pile, ['structure']),
    part('beach_buggy_tub', 'Beach buggy tub', pile, ['structure', 'protection']),
    part('beach_buggy_roll_bar', 'Beach buggy roll bar', pile, ['structure', 'protection']),
    part('beach_buggy_windscreen', 'Beach buggy windscreen', pile, ['glazing']),
    part('beach_buggy_dashboard', 'Beach buggy dashboard', pile, ['structure']),
    part('beach_buggy_front_axle', 'Beach buggy front axle', pile, ['structure', 'steered']),
    part('beach_buggy_rear_axle', 'Beach buggy rear axle', pile, ['structure', 'driven']),
    part('beach_buggy_step', 'Beach buggy side step', [8, 2], ['entry', 'structure']),
    part('beach_buggy_exhaust', 'Beach buggy exhaust', pile, []),
    part('beach_buggy_seat', 'Beach buggy seat', [5, 10], ['seat']),
    part('beach_buggy_headlamp', 'Beach buggy headlamp', [3, 3], ['light']),
    part('beach_buggy_front_wheel', 'Wheel 155/80 R13', [6, 6], ['wheel']),
    part('beach_buggy_rear_wheel', 'Wheel 320/60 R15', pile, ['wheel']),
  ],
  blueprint: {
    id: 'beach_buggy',
    name: 'Beach buggy',
    fittings: [
      fitting('frame', 'beach_buggy_frame', origin),
      fitting('tub', 'beach_buggy_tub', origin, ['frame']),
      fitting('roll_bar', 'beach_buggy_roll_bar', origin, ['frame']),
      fitting('windscreen', 'beach_buggy_windscreen', origin, ['tub']),
      fitting('dashboard', 'beach_buggy_dashboard', origin, ['tub']),
      fitting('front_axle', 'beach_buggy_front_axle', origin, ['frame']),
      fitting('rear_axle', 'beach_buggy_rear_axle', origin, ['frame']),
      fitting('engine', 'engine_i4_petrol', [-1.12, 0.32, 0], ['frame']),
      fitting('gearbox', 'gearbox_transaxle', [s.rearAxle + 0.28, 0.3, 0], ['engine']),
      fitting('fuel_tank', 'fuel_tank_car', [-0.72, 0.36, 0], ['frame']),
      fitting('exhaust', 'beach_buggy_exhaust', origin, ['engine']),
      fitting('steering_wheel', 'steering_wheel', [0.26, 0.69, -0.26], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [0.22, s.floor, 0], ['tub']),
    ]
    + pair('step', 'beach_buggy_step', origin, on(['frame']))
    + pair('front_seat', 'beach_buggy_seat', [-0.05, s.floor, 0.26], on(['tub']))
    + pair('front_wheel', 'beach_buggy_front_wheel', [s.frontAxle, s.frontHub, s.frontWheelZ], on(['front_axle']))
    + pair('rear_wheel', 'beach_buggy_rear_wheel', [s.rearAxle, s.rearHub, s.rearWheelZ], on(['rear_axle']))
    + pair('headlamp', 'beach_buggy_headlamp', origin, on(['tub']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.02, 0.45, 0.44], on(['frame']))
    + kit.batteryBay('hatchback_battery_tray', [-0.72, 0.3, 0.2], ['frame']),
  },
}
