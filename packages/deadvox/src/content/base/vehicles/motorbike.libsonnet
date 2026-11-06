// Items and blueprint for the motorbike. Its parts fit at the origin (`packages/thing-authoring-tool/vehicles/motorbike.libsonnet`).
// A bike has no door, so `packages/deadvox/test/vehicleExport.test.ts` would refuse a seat capability: it stays parked
// scenery, its saddle a plain part. A centre stand holds it upright because a fitting has no rotation to lean it.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/motorbike.spec.libsonnet';
{
  items: [
    part('motorbike_frame', 'Motorbike frame', pile, ['structure']),
    part('motorbike_fork', 'Motorbike front fork', pile, ['structure', 'steered']),
    part('motorbike_swingarm', 'Motorbike swingarm', pile, ['structure']),
    part('motorbike_shock', 'Motorbike rear shock', [2, 4], []),
    part('motorbike_wheel', 'Motorbike wheel', [6, 6], ['wheel']) + { vehicle+: { mount: 'motorbike_wheel' } },
    // The gearbox is cast into the crankcase, so the engine is the driven part too.
    part('motorbike_engine', 'Motorbike engine', [5, 5], ['power', 'driven']),
    part('motorbike_exhaust', 'Motorbike exhaust', [12, 5], []),
    part('motorbike_footrest', 'Motorbike footrest', [2, 1], []),
    part('motorbike_centre_stand', 'Motorbike centre stand', [3, 3], ['structure']),
    part('motorbike_front_mudguard', 'Motorbike front mudguard', [6, 3], ['protection']),
    part('motorbike_rear_mudguard', 'Motorbike rear mudguard', [7, 3], ['protection']),
    part('motorbike_headlamp', 'Motorbike headlamp', [2, 2], ['light', 'glazing']),
    part('motorbike_tail_lamp', 'Motorbike tail lamp', [2, 2], ['light']),
    part('motorbike_handlebar', 'Motorbike handlebar', [8, 2], ['steered']),
    part('motorbike_tank', 'Motorbike fuel tank', [5, 4], ['fuel']),
    part('motorbike_seat', 'Motorbike saddle', [7, 3], []),
    part('motorbike_side_cover', 'Motorbike side cover', [2, 2], ['protection']),
  ],
  blueprint: {
    id: 'motorbike',
    name: 'Motorbike',
    fittings: [
      fitting('frame', 'motorbike_frame', origin),
      fitting('engine', 'motorbike_engine', origin, ['frame']),
      fitting('exhaust', 'motorbike_exhaust', origin, ['engine', 'frame']),
      fitting('centre_stand', 'motorbike_centre_stand', origin, ['frame']),
      fitting('swingarm', 'motorbike_swingarm', origin, ['frame']),
      fitting('rear_wheel', 'motorbike_wheel', [s.rearAxle, s.hub, 0], ['swingarm']),
      fitting('fork', 'motorbike_fork', origin, ['frame']),
      fitting('front_wheel', 'motorbike_wheel', [s.frontAxle, s.hub, 0], ['fork']),
      fitting('front_mudguard', 'motorbike_front_mudguard', origin, ['fork']),
      fitting('headlamp', 'motorbike_headlamp', origin, ['fork']),
      fitting('handlebar', 'motorbike_handlebar', origin, ['fork']),
      fitting('tank', 'motorbike_tank', origin, ['frame']),
      fitting('seat', 'motorbike_seat', origin, ['frame']),
      fitting('rear_mudguard', 'motorbike_rear_mudguard', origin, ['frame']),
      fitting('tail_lamp', 'motorbike_tail_lamp', origin, ['frame']),
    ]
    + pair('footrest', 'motorbike_footrest', origin, on(['engine']))
    + pair('shock', 'motorbike_shock', origin, on(['frame', 'swingarm']))
    + pair('side_cover', 'motorbike_side_cover', origin, on(['frame'])),
  },
}
