// A long-wheelbase body with two doors, a raised blind rear with landau bars and a railed deck where the rear bench would be.
local kit = import '../vehicle-kit.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/hearse.spec.libsonnet';
(import 'luxury_saloon.libsonnet').carOn('hearse', 'Hearse', s, {
  drop: ['rear_bench'],
  over: {
    engine: { part: 'engine_v6_petrol' },
    fuel_tank: { at: [s.rearAxle + 0.75, s.sill, 0] },
  },
  fittings: [
    kit.fitting('coach', 'hearse_coach', kit.origin, ['shell']),
    kit.fitting('curtains', 'hearse_curtains', kit.origin, ['shell']),
    kit.fitting('grille', 'hearse_grille', kit.origin, ['bonnet']),
    kit.fitting('deck', 'hearse_deck', kit.origin, ['shell']),
    kit.fitting('partition', 'hearse_partition', kit.origin, ['shell']),
    kit.fitting('brightwork', 'hearse_brightwork', kit.origin, ['shell']),
  ],
  items: [
    kit.part('hearse_coach', 'Hearse rear body and landau bars', kit.pileSize, ['structure', 'protection']),
    kit.part('hearse_curtains', 'Hearse curtains', kit.pileSize, []),
    kit.part('hearse_grille', 'Hearse grille', kit.pileSize, ['protection']),
    kit.part('hearse_deck', 'Hearse deck', kit.pileSize, ['structure', 'load_floor']),
    kit.part('hearse_partition', 'Hearse partition and rails', kit.pileSize, ['structure']),
    kit.part('hearse_brightwork', 'Hearse brightwork', kit.pileSize, []),
  ],
})
