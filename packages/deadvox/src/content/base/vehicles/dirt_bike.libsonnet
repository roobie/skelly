// Items and blueprint for the dirt bike. Its own parts fit at the origin (`packages/thing-authoring-tool/vehicles/dirt_bike.libsonnet`);
// the engine and footrests are the motorbike's, raised to its taller frame. It has no door, so it stays parked scenery.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/dirt_bike.spec.libsonnet';
local raised = [0, s.engineLift, 0];
{
  items: [
    part('dirt_bike_frame', 'Dirt bike frame', pile, ['structure']),
    part('dirt_bike_fork', 'Dirt bike front fork', pile, ['structure', 'steered']),
    part('dirt_bike_swingarm', 'Dirt bike swingarm', pile, ['structure']),
    part('dirt_bike_shock', 'Dirt bike rear shock', [3, 6], []),
    part('dirt_bike_front_wheel', 'Dirt bike front wheel', [8, 6], ['wheel']) + { vehicle+: { mount: 'dirt_bike_front_wheel' } },
    part('dirt_bike_rear_wheel', 'Dirt bike rear wheel', [7, 6], ['wheel']) + { vehicle+: { mount: 'dirt_bike_rear_wheel' } },
    part('dirt_bike_exhaust', 'Dirt bike exhaust', pile, []),
    part('dirt_bike_race_stand', 'Dirt bike race stand', [5, 3], ['structure']),
    part('dirt_bike_front_mudguard', 'Dirt bike front mudguard', [8, 3], ['protection']),
    part('dirt_bike_rear_mudguard', 'Dirt bike rear mudguard', [8, 3], ['protection']),
    part('dirt_bike_number_plate', 'Dirt bike number plate', [3, 4], ['light']),
    part('dirt_bike_handlebar', 'Dirt bike handlebar', [9, 2], ['steered']),
    part('dirt_bike_tank', 'Dirt bike fuel tank', [4, 3], ['fuel']),
    part('dirt_bike_seat', 'Dirt bike saddle', [10, 2], []),
    part('dirt_bike_side_panel', 'Dirt bike side panel', [6, 3], ['protection']),
  ],
  blueprint: {
    id: 'dirt_bike',
    name: 'Dirt bike',
    fittings: [
      fitting('frame', 'dirt_bike_frame', origin),
      fitting('engine', 'motorbike_engine', raised, ['frame']),
      fitting('exhaust', 'dirt_bike_exhaust', origin, ['engine', 'frame']),
      fitting('race_stand', 'dirt_bike_race_stand', origin, ['frame']),
      fitting('swingarm', 'dirt_bike_swingarm', origin, ['frame']),
      fitting('shock', 'dirt_bike_shock', origin, ['frame', 'swingarm']),
      fitting('rear_wheel', 'dirt_bike_rear_wheel', [s.rearAxle, s.rearHub, 0], ['swingarm']),
      fitting('fork', 'dirt_bike_fork', origin, ['frame']),
      fitting('front_wheel', 'dirt_bike_front_wheel', [s.frontAxle, s.frontHub, 0], ['fork']),
      fitting('front_mudguard', 'dirt_bike_front_mudguard', origin, ['fork']),
      fitting('number_plate', 'dirt_bike_number_plate', origin, ['fork']),
      fitting('handlebar', 'dirt_bike_handlebar', origin, ['fork']),
      fitting('tank', 'dirt_bike_tank', origin, ['frame']),
      fitting('seat', 'dirt_bike_seat', origin, ['frame']),
      fitting('rear_mudguard', 'dirt_bike_rear_mudguard', origin, ['frame']),
      fitting('tail_lamp', 'tail_lamp_small', [-1.14, 0.88, 0], ['rear_mudguard']),
    ]
    + pair('footrest', 'motorbike_footrest', raised, on(['engine']))
    + pair('side_panel', 'dirt_bike_side_panel', origin, on(['frame'])),
  },
}
