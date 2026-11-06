// Items and blueprint for the crashed hatchback. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/crashed_hatchback.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/crashed_hatchback.spec.libsonnet';
{
  items: [
    part('crashed_hatchback_shell', 'Crash-bent hatchback shell', pile, ['structure', 'protection']),
    part('crashed_hatchback_crushed_nose', 'Crushed hatchback nose', pile, ['structure', 'protection']),
    part('crashed_hatchback_windscreen', 'Crazed hatchback windscreen', pile, ['protection']),
    part('crashed_hatchback_tailgate', 'Unbroken hatchback tailgate', pile, ['protection']),
    part('crashed_hatchback_tail_lamp', 'Crash-shaken tail lamp', [3, 3], ['protection']),
    part('crashed_hatchback_rear_bumper', 'Scuffed hatchback rear bumper', pile, ['protection']),
    part('crashed_hatchback_front_bumper', 'V-bent hatchback bumper', pile, ['protection']),
    part('crashed_hatchback_flat_wheel', 'Wheel with a flat tyre', [6, 6], ['structure']),
    part('crashed_hatchback_front_seat', 'Crash-shaken front seat', [6, 6], ['structure']),
    part('crashed_hatchback_rear_bench', 'Crash-shaken rear bench', pile, ['structure']),
    part('crashed_hatchback_dash', 'Pushed-in hatchback dashboard', pile, ['structure']),
    part('crashed_hatchback_engine', 'Rammed hatchback engine', [8, 6], ['structure']),
  ],
  blueprint: {
    id: 'crashed_hatchback',
    name: 'Crashed hatchback',
    fittings: [
      fitting('shell', 'crashed_hatchback_shell', origin),
      fitting('crushed_nose', 'crashed_hatchback_crushed_nose', origin, ['shell']),
      fitting('windscreen', 'crashed_hatchback_windscreen', origin, ['shell']),
      fitting('tailgate', 'crashed_hatchback_tailgate', origin, ['shell']),
      fitting('rear_bumper', 'crashed_hatchback_rear_bumper', origin, ['shell']),
      fitting('front_bumper', 'crashed_hatchback_front_bumper', origin, ['crushed_nose']),
      fitting('dash', 'crashed_hatchback_dash', origin, ['shell']),
      fitting('engine', 'crashed_hatchback_engine', [0.95, s.floor - 0.1, 0], ['crushed_nose']),
      fitting('rear_bench', 'crashed_hatchback_rear_bench', [-0.72, s.floor + 0.02, 0], ['shell']),
      fitting('front_wheel_near', 'crashed_hatchback_flat_wheel', [s.frontNear, s.axleY, s.wheelZ], ['crushed_nose']),
      fitting('front_wheel_far', 'crashed_hatchback_flat_wheel', [s.frontFar, s.axleY, -s.wheelZ], ['crushed_nose']) + { mirror: true },
    ]
    + pair('tail_lamp', 'crashed_hatchback_tail_lamp', origin, on(['shell']))
    + pair('front_seat', 'crashed_hatchback_front_seat', [-0.02, s.floor, 0.37], on(['shell']))
    + pair('rear_wheel', 'crashed_hatchback_flat_wheel', [s.rearAxle, s.axleY, s.wheelZ], on(['shell'])),
  },
}
