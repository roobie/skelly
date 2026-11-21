local site = import '../skelly.deadvox.scenario.holdout/holdout-site.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local pocket = { kind: 'pocket', parent: 'backpack', pocket: 0 };
{
  scenarios: [site.scenario(site.waveDay) + {
    id: 'holdout_condition_look',
    bounds: { x0: -40, z0: -40, x1: 40, z1: 40 },
    asks: [{ kind: 'place', id: 'shelter', template: site.shelter.id, at: [0, 0] }],
    guarantee: {},
    woodlands: [],
    anchors: [],
    eventRules: [],
  }],
  starts: [kit.fixture + {
    id: 'holdoutconditionlook',
    site: 'holdout_condition_look',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'backpack', item: 'hiking_backpack', destination: { kind: 'worn' } },
      { id: 'repairkit', item: 'repair_kit', condition: 1, destination: pocket },
      { id: 'scrap', item: 'scrap_metal', count: 12, destination: pocket },
    ],
  }],
}
