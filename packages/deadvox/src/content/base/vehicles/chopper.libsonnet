// Items and blueprint for the chopper. Its own parts fit at the origin (`packages/thing-authoring-tool/vehicles/chopper.libsonnet`).
// It has no door, so it stays parked scenery; the motorbike's centre stand holds it up under the rigid frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/chopper.spec.libsonnet';
{
  items: [
    part('chopper_frame', 'Chopper frame', pile, ['structure']),
    part('chopper_fork', 'Chopper long fork', pile, ['structure', 'steered']),
    part('chopper_front_wheel', 'Chopper front wheel', [8, 6], ['wheel']) + { vehicle+: { mount: 'chopper_front_wheel' } },
    part('chopper_rear_wheel', 'Chopper rear wheel', [7, 6], ['wheel']) + { vehicle+: { mount: 'chopper_rear_wheel' } },
    part('chopper_engine', 'Chopper vee-twin engine', [6, 6], ['power', 'driven']),
    part('chopper_exhaust', 'Chopper drag pipes', pile, []),
    part('chopper_rear_fender', 'Chopper rear fender', [8, 3], ['protection']),
    part('chopper_front_fender', 'Chopper front fender', [6, 2], ['protection']),
    part('chopper_tank', 'Chopper fuel tank', [4, 2], ['fuel']),
    part('chopper_saddle', 'Chopper saddle', [5, 3], []),
    part('chopper_sissy_bar', 'Chopper sissy bar', [9, 3], []),
    part('chopper_handlebar', 'Chopper tall bars', [9, 4], ['steered']),
    part('chopper_headlamp', 'Chopper headlamp', [2, 2], ['light', 'glazing']),
    part('chopper_foot_peg', 'Chopper foot peg', [2, 2], []),
  ],
  blueprint: {
    id: 'chopper',
    name: 'Chopper',
    fittings: [
      fitting('frame', 'chopper_frame', origin),
      fitting('engine', 'chopper_engine', origin, ['frame']),
      fitting('exhaust', 'chopper_exhaust', origin, ['engine', 'frame']),
      fitting('centre_stand', 'motorbike_centre_stand', origin, ['frame']),
      fitting('rear_wheel', 'chopper_rear_wheel', [s.rearAxle, s.rearHub, 0], ['frame']),
      fitting('fork', 'chopper_fork', origin, ['frame']),
      fitting('front_wheel', 'chopper_front_wheel', [s.frontAxle, s.frontHub, 0], ['fork']),
      fitting('front_fender', 'chopper_front_fender', origin, ['fork']),
      fitting('rear_fender', 'chopper_rear_fender', origin, ['frame']),
      fitting('tank', 'chopper_tank', origin, ['frame']),
      fitting('saddle', 'chopper_saddle', origin, ['frame']),
      fitting('sissy_bar', 'chopper_sissy_bar', origin, ['frame']),
      fitting('handlebar', 'chopper_handlebar', origin, ['fork']),
      fitting('headlamp', 'chopper_headlamp', origin, ['fork']),
      fitting('tail_lamp', 'tail_lamp_small', [-1.27, 0.5, 0], ['rear_fender']),
    ]
    + pair('foot_peg', 'chopper_foot_peg', origin, on(['frame'])),
  },
}
