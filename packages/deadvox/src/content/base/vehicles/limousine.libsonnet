// A stretched saloon with a fixed section between its doors and a seat facing the rear bench.
local kit = import '../vehicle-kit.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/limousine.spec.libsonnet';
(import 'luxury_saloon.libsonnet').carOn('limousine', 'Limousine', s, {
  over: {
    engine: { part: 'engine_v8_petrol', at: [s.frontAxle - 0.02, 0.2, 0] },
    gearbox: { part: 'gearbox_inline', at: [s.frontAxle - 0.7, 0.26, 0] },
    exhaust: { part: 'exhaust_long', at: [s.rear + 0.56, 0.2, 0.42] },
    rear_bench: { at: [-1.55, s.floor, 0] },
    front_seat_near: { at: [1.05, s.floor, 0.37] },
    front_seat_far: { at: [1.05, s.floor, -0.37] },
  },
  fittings: [
    kit.fitting('stretch', 'limousine_stretch', kit.origin, ['shell']),
    kit.fitting('grille', 'luxury_saloon_grille', [0.65, -0.0225, 0], ['bonnet']),
    kit.fitting('brightwork', 'limousine_brightwork', kit.origin, ['shell']),
    kit.fitting('facing_seat', 'limousine_facing_seat', kit.origin, ['shell']),
  ],
  items: [
    kit.part('limousine_stretch', 'Limousine stretch section', kit.pileSize, ['protection', 'glazing']),
    kit.part('limousine_brightwork', 'Limousine brightwork', kit.pileSize, []),
    kit.part('limousine_facing_seat', 'Limousine facing seat', kit.pileSize, ['seat']),
  ],
})
