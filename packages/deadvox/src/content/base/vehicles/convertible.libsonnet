// A coupe's layout on an open body, with the hood folded on the deck behind its rear bench.
local kit = import '../vehicle-kit.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/convertible.spec.libsonnet';
(import 'luxury_saloon.libsonnet').carOn('convertible', 'Convertible', s, {
  over: {
    engine: { at: [s.frontAxle - 0.02, 0.2, 0] },
    rear_bench: { part: 'bench_seat_3', at: [-0.6, s.floor, 0] },
    steering_wheel: { at: [s.cowl - 0.4, s.waist - 0.16, -0.37] },
    front_seat_near: { part: 'sports_car_bucket_seat', at: [-0.02, s.floor, 0.37] },
    front_seat_far: { part: 'sports_car_bucket_seat', at: [-0.02, s.floor, -0.37] },
    headlamp_near: { at: [s.front - 0.07, 0.56, 0.62] },
    headlamp_far: { at: [s.front - 0.07, 0.56, -0.62] },
  },
  fittings: [
    kit.fitting('folded_hood', 'convertible_folded_hood', kit.origin, ['shell']),
  ],
  items: [
    kit.part('convertible_folded_hood', 'Folded convertible hood', kit.pileSize, ['protection']),
  ],
})
