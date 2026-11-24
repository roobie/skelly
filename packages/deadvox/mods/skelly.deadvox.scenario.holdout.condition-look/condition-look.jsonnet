local site = import '../skelly.deadvox.scenario.holdout/holdout-site.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local pocket = { kind: 'pocket', parent: 'backpack', pocket: 0 };
{
  layouts: [{
    id: 'holdout_condition_look', demo: true, lootContext: { usage: ['Residential'], tier: 'Tier1' },
    bounds: { x0: -8, z0: -8, x1: 38, z1: 25 }, ground: 21, terrain: [], tracks: [],
    buildings: [
      { template: site.shelter.id, position: [0, 21, 0], rotation: 0 },
      { template: 'rural_plot_privy', position: [18, 21, 0], rotation: 0 },
    ],
    player: { position: [-2, 21.5, 3], bearing: 90 }, actors: [], woodlands: [],
  }],
  starts: [kit.fixture + {
    id: 'holdoutconditionlook',
    site: 'holdout_condition_look',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'backpack', item: 'hiking_backpack', destination: { kind: 'worn' } },
      { id: 'repairkit', item: 'repair_kit', condition: 1, destination: pocket },
      { id: 'scrap', item: 'scrap_metal', count: 12, destination: pocket },
      { id: 'planks', item: 'wooden_plank', count: 2, destination: pocket },
    ],
  }],
}
