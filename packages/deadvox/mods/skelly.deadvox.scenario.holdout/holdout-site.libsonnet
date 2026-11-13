local waves = import 'waves.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
local house = import 'holdout-house.libsonnet';
{
  waveDay: 24 * 3,
  debugWaveDay: 0.1,
  shelter: house,
  scenario(afterGameHours):: {
    id: 'holdout',
    kind: 'composedSite',
    outbreakAgeGameHours: 24 * 120,
    decalLimit: 48,
    body: 'player',
    compression: 'player',
    bounds: { x0: -500, z0: -500, x1: 500, z1: 500 },
    ground: 21,
    lootContext: context,
    settlementKind: 'rural',
    start: { ask: 'shelter' },
    placement: { apronMetres: 2, attempts: 1000 },
    asks: [{ kind: 'place', id: 'shelter', template: house.id }],
    guarantee: {},
    population: { authoredMarkers: false },
    anchors: [
      { id: 'north_road', kind: 'edge', minDistance: 100, clearOf: ['woodland', 'building'], spawnMarginMetres: 2, woodlandDensityFloor: 0.1 },
      { id: 'far_edge', kind: 'edge', minDistance: 250, clearOf: ['woodland', 'building'], spawnMarginMetres: 2, woodlandDensityFloor: 0.1 },
    ],
    eventRules: waves.rules(['north_road', 'far_edge'], first=afterGameHours, gap=24 * 5, count=50, escalation=[
      { actor: 'shambler', count: 8 },
      { actor: 'shambler', count: 12 },
      { actor: 'shambler', count: 16 },
    ]),
  },
  start: kit.common + { id: 'holdout', site: 'holdout' },
}
