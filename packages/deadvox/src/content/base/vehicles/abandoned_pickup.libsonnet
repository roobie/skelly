// Items and blueprint for the abandoned pickup. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/abandoned_pickup.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/abandoned_pickup.spec.libsonnet';
{
  items: [
    part('abandoned_pickup_cab', 'Rusted pickup cab', pile, ['structure', 'protection']),
    part('abandoned_pickup_bonnet', 'Rusted pickup bonnet', pile, ['protection']),
    part('abandoned_pickup_door', 'Rusted pickup door', pile, ['protection']),
    part('abandoned_pickup_bed', 'Rusted pickup bed', pile, ['structure', 'protection']),
    part('abandoned_pickup_frame', 'Rusted pickup ladder frame', pile, ['structure']),
    part('abandoned_pickup_axle', 'Bare pickup axle', pile, ['structure']),
    part('abandoned_pickup_block_stack', 'Stack of concrete blocks', [6, 6], ['structure']),
    part('abandoned_pickup_bench_frame', 'Rotted bench frame', pile, ['structure']),
  ],
  blueprint: {
    id: 'abandoned_pickup',
    name: 'Abandoned pickup',
    fittings: [
      fitting('front_axle', 'abandoned_pickup_axle', [s.frontAxle, s.axleY, 0], ['front_stack_near', 'front_stack_far']),
      fitting('rear_axle', 'abandoned_pickup_axle', [s.rearAxle, s.axleY, 0], ['rear_stack_near', 'rear_stack_far']),
      fitting('frame', 'abandoned_pickup_frame', origin, ['front_axle', 'rear_axle']),
      fitting('cab', 'abandoned_pickup_cab', origin, ['frame']),
      fitting('bed', 'abandoned_pickup_bed', origin, ['frame']),
      fitting('bonnet', 'abandoned_pickup_bonnet', origin, ['cab']),
      fitting('door', 'abandoned_pickup_door', origin, ['cab']),
      fitting('bench_frame', 'abandoned_pickup_bench_frame', [0.42, s.floor, 0], ['cab']),
    ]
    + pair('front_stack', 'abandoned_pickup_block_stack', [s.frontAxle, 0, s.stackZ], on())
    + pair('rear_stack', 'abandoned_pickup_block_stack', [s.rearAxle, 0, s.stackZ], on()),
  },
}
