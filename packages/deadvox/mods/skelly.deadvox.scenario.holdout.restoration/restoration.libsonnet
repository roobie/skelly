local site = import '../skelly.deadvox.scenario.holdout/holdout-site.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Holdout's own plant and stores with nothing else: the player starts in the plant and the stores stand a short walk
// away, so a check spends its time on the restoration, not on the trip or the waves.
{
  scenario: site.scenario(site.waveDay) + {
    id: 'holdout_restoration',
    bounds: { x0: -120, z0: -120, x1: 120, z1: 120 },
    start: { ask: 'power_plant' },
    asks: [
      { kind: 'place', id: 'power_plant', template: site.plant.plant.id },
      {
        kind: 'place', id: 'plant_stores', template: site.plant.stores.id, supplies: ['plant_spares'],
        distance: { from: 'power_plant', curve: [[0, 0], [15, 1], [30, 1], [40, 0]] },
      },
    ],
    guarantee: { plant_spares: 1 },
    // Hidden, so the look has no waves.
    anchors:: [],
    eventRules:: [],
  },
  start(id, carried):: kit.fixture + kit.notSiteDefault + {
    id: id,
    site: 'holdout_restoration',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: carried,
  },
}
