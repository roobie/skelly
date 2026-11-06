// Items and blueprint for the touring bike. Its parts fit at the origin (`packages/thing-authoring-tool/vehicles/touring_bike.libsonnet`).
// It has no door, so it stays parked scenery.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/touring_bike.spec.libsonnet';
{
  items: [
    part('touring_bike_frame', 'Touring bike frame', pile, ['structure']),
    part('touring_bike_fork', 'Touring bike front fork', pile, ['structure', 'steered']),
    part('touring_bike_swingarm', 'Touring bike swingarm', pile, ['structure']),
    part('touring_bike_shock', 'Touring bike rear shock', [2, 4], []),
    part('touring_bike_wheel', 'Touring bike wheel', [6, 6], ['wheel']) + { vehicle+: { mount: 'touring_bike_wheel' } },
    // The gearbox is cast into the crankcase, so the engine is the driven part too.
    part('touring_bike_engine', 'Touring bike engine', [6, 5], ['power', 'driven']),
    part('touring_bike_exhaust', 'Touring bike exhaust', [12, 5], []),
    part('touring_bike_centre_stand', 'Touring bike centre stand', [5, 3], ['structure']),
    part('touring_bike_footrest', 'Touring bike footrest', [2, 1], []),
    part('touring_bike_pillion_footrest', 'Touring bike pillion footrest', [2, 2], []),
    part('touring_bike_front_mudguard', 'Touring bike front mudguard', [6, 3], ['protection']),
    part('touring_bike_rear_mudguard', 'Touring bike rear mudguard', [7, 3], ['protection']),
    part('touring_bike_tail_lamp', 'Touring bike tail lamp', [2, 2], ['light']),
    part('touring_bike_tank', 'Touring bike fuel tank', [5, 4], ['fuel']),
    part('touring_bike_seat', 'Touring bike saddle', [9, 3], []),
    part('touring_bike_side_cover', 'Touring bike side cover', [3, 2], ['protection']),
    part('touring_bike_fairing', 'Touring bike fairing', [7, 6], ['protection']),
    part('touring_bike_headlamp', 'Touring bike headlamp', [2, 2], ['light', 'glazing']),
    part('touring_bike_windscreen', 'Touring bike windscreen', [5, 3], ['glazing']),
    part('touring_bike_handlebar', 'Touring bike handlebar', [8, 2], ['steered']),
    part('touring_bike_lower_fairing', 'Touring bike lower fairing', [3, 3], ['protection']),
    part('touring_bike_pannier', 'Touring bike pannier', [5, 4], ['storage']),
    part('touring_bike_pannier_rack', 'Touring bike pannier rack', [5, 2], ['structure']),
    part('touring_bike_top_box', 'Touring bike top box', [4, 3], ['storage']),
    part('touring_bike_top_rack', 'Touring bike top rack', [3, 2], ['structure']),
  ],
  blueprint: {
    id: 'touring_bike',
    name: 'Touring bike',
    fittings: [
      fitting('frame', 'touring_bike_frame', origin),
      fitting('engine', 'touring_bike_engine', origin, ['frame']),
      fitting('centre_stand', 'touring_bike_centre_stand', origin, ['frame']),
      fitting('swingarm', 'touring_bike_swingarm', origin, ['frame']),
      fitting('shock', 'touring_bike_shock', origin, ['frame', 'swingarm']),
      fitting('rear_wheel', 'touring_bike_wheel', [s.rearAxle, s.hub, 0], ['swingarm']),
      fitting('fork', 'touring_bike_fork', origin, ['frame']),
      fitting('front_wheel', 'touring_bike_wheel', [s.frontAxle, s.hub, 0], ['fork']),
      fitting('front_mudguard', 'touring_bike_front_mudguard', origin, ['fork']),
      fitting('handlebar', 'touring_bike_handlebar', origin, ['fork']),
      fitting('tank', 'touring_bike_tank', origin, ['frame']),
      fitting('seat', 'touring_bike_seat', origin, ['frame']),
      fitting('rear_mudguard', 'touring_bike_rear_mudguard', origin, ['frame']),
      fitting('tail_lamp', 'touring_bike_tail_lamp', origin, ['frame']),
      fitting('fairing', 'touring_bike_fairing', origin, ['frame']),
      fitting('headlamp', 'touring_bike_headlamp', origin, ['fairing']),
      fitting('windscreen', 'touring_bike_windscreen', origin, ['fairing']),
      fitting('top_rack', 'touring_bike_top_rack', origin, ['frame']),
      fitting('top_box', 'touring_bike_top_box', origin, ['top_rack']),
    ]
    + pair('exhaust', 'touring_bike_exhaust', origin, on(['engine', 'frame']))
    + pair('footrest', 'touring_bike_footrest', origin, on(['engine']))
    + pair('pillion_footrest', 'touring_bike_pillion_footrest', origin, on(['frame']))
    + pair('side_cover', 'touring_bike_side_cover', origin, on(['frame']))
    + pair('lower_fairing', 'touring_bike_lower_fairing', origin, on(['frame', 'engine']))
    + pair('pannier_rack', 'touring_bike_pannier_rack', origin, on(['frame']))
    + pair('pannier', 'touring_bike_pannier', origin, on(paired=['pannier_rack'])),
  },
}
