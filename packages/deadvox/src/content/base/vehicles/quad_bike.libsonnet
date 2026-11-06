// Items and blueprint for the quad bike. Its parts fit at the origin (`packages/thing-authoring-tool/vehicles/quad_bike.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/quad_bike.spec.libsonnet';
{
  items: [
    part('quad_bike_frame', 'Quad bike frame', pile, ['structure']),
    part('quad_bike_front_arm', 'Quad bike front arm', [6, 4], ['structure', 'steered']),
    part('quad_bike_swing_arm', 'Quad bike swing arm', pile, ['structure', 'driven']),
    part('quad_bike_front_fenders', 'Quad bike front fenders', pile, ['protection']),
    part('quad_bike_rear_fenders', 'Quad bike rear fenders', pile, ['protection']),
    part('quad_bike_front_rack', 'Quad bike front rack', [6, 6], ['structure']),
    part('quad_bike_rear_rack', 'Quad bike rear rack', [6, 6], ['structure']),
    part('quad_bike_seat', 'Quad bike seat', [8, 4], ['seat']),
    part('quad_bike_tank', 'Quad bike fuel tank', [6, 4], ['fuel']),
    part('quad_bike_engine', 'Quad bike engine', [6, 6], ['power']),
    part('quad_bike_exhaust', 'Quad bike exhaust', [12, 3], []),
    part('quad_bike_handlebar', 'Quad bike handlebar', [8, 5], ['steered']),
    part('quad_bike_wheel', 'Quad bike wheel', [6, 6], ['wheel']),
    part('quad_bike_headlamp', 'Quad bike headlamp', [2, 2], ['light', 'glazing']),
    part('quad_bike_footboard', 'Quad bike footboard', [8, 2], ['entry', 'structure']),
  ],
  blueprint: {
    id: 'quad_bike',
    name: 'Quad bike',
    fittings: [
      fitting('frame', 'quad_bike_frame', origin),
      fitting('swing_arm', 'quad_bike_swing_arm', origin, ['frame']),
      fitting('front_fenders', 'quad_bike_front_fenders', origin, ['frame']),
      fitting('rear_fenders', 'quad_bike_rear_fenders', origin, ['frame']),
      fitting('front_rack', 'quad_bike_front_rack', origin, ['frame']),
      fitting('rear_rack', 'quad_bike_rear_rack', origin, ['frame']),
      fitting('seat', 'quad_bike_seat', origin, ['frame']),
      fitting('tank', 'quad_bike_tank', origin, ['frame']),
      fitting('engine', 'quad_bike_engine', origin, ['frame']),
      fitting('exhaust', 'quad_bike_exhaust', origin, ['engine']),
      fitting('handlebar', 'quad_bike_handlebar', origin, ['frame']),
      fitting('battery', 'car_battery', [-0.38, 0.56, 0], ['frame']),
    ]
    + pair('footboard', 'quad_bike_footboard', origin, on(['frame']))
    + pair('front_arm', 'quad_bike_front_arm', origin, on(['frame']))
    + pair('front_wheel', 'quad_bike_wheel', [s.frontAxle, s.hub, s.wheelZ], on(paired=['front_arm']))
    + pair('rear_wheel', 'quad_bike_wheel', [s.rearAxle, s.hub, s.wheelZ], on(['swing_arm']))
    + pair('tail_lamp', 'tail_lamp_small', [-1.0, 0.6, 0.12], on(['rear_fenders']))
    + pair('headlamp', 'quad_bike_headlamp', [1.0, 0.62, 0.11], on(['front_fenders'])),
  },
}
