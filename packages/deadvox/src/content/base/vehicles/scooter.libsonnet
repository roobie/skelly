// Items and blueprint for the scooter. Its parts fit at the origin (`packages/thing-authoring-tool/vehicles/scooter.libsonnet`).
// Like the motorbike it has no door, so it stays parked scenery with no seat capability.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/scooter.spec.libsonnet';
{
  items: [
    part('scooter_frame', 'Scooter frame', pile, ['structure']),
    part('scooter_cowl', 'Scooter rear cowl', pile, ['protection']),
    part('scooter_leg_shield', 'Scooter leg shield', pile, ['protection']),
    part('scooter_floorboard', 'Scooter floorboard', pile, ['structure']),
    // The gearbox is cast into the belt case, so the engine is the driven part too.
    part('scooter_engine', 'Scooter engine', pile, ['power', 'driven']),
    part('scooter_exhaust', 'Scooter exhaust', [7, 2], []),
    part('scooter_fork', 'Scooter front fork', pile, ['structure', 'steered']),
    part('scooter_wheel', 'Scooter wheel', [5, 5], ['wheel']) + { vehicle+: { mount: 'scooter_wheel' } },
    part('scooter_front_mudguard', 'Scooter front mudguard', [6, 3], ['protection']),
    part('scooter_handlebar', 'Scooter handlebar', [8, 3], ['steered']),
    part('scooter_headlamp', 'Scooter headlamp', [2, 2], ['light', 'glazing']),
    part('scooter_seat', 'Scooter saddle', [7, 4], []),
    part('scooter_fuel_tank', 'Scooter fuel tank', [2, 2], ['fuel']),
  ],
  blueprint: {
    id: 'scooter',
    name: 'Scooter',
    fittings: [
      fitting('frame', 'scooter_frame', origin),
      fitting('floorboard', 'scooter_floorboard', origin, ['frame']),
      fitting('leg_shield', 'scooter_leg_shield', origin, ['frame']),
      fitting('cowl', 'scooter_cowl', origin, ['frame']),
      fitting('seat', 'scooter_seat', origin, ['cowl']),
      fitting('fuel_tank', 'scooter_fuel_tank', origin, ['frame']),
      fitting('engine', 'scooter_engine', origin, ['frame']),
      fitting('exhaust', 'scooter_exhaust', origin, ['engine']),
      fitting('rear_wheel', 'scooter_wheel', [s.rearAxle, s.hub, 0], ['engine']),
      fitting('fork', 'scooter_fork', origin, ['frame']),
      fitting('front_wheel', 'scooter_wheel', [s.frontAxle, s.hub, 0], ['fork']),
      fitting('front_mudguard', 'scooter_front_mudguard', origin, ['fork']),
      fitting('handlebar', 'scooter_handlebar', origin, ['fork']),
      fitting('headlamp', 'scooter_headlamp', origin, ['handlebar']),
      fitting('centre_stand', 'motorbike_centre_stand', [0.125, 0, 0], ['frame']),
      fitting('tail_lamp', 'tail_lamp_small', [-0.89, 0.53, 0], ['cowl']),
    ],
  },
}
