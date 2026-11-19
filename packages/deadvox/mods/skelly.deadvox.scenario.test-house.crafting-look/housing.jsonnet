// A fixture housing, so the take-apart review's parts path runs on fixture content rather than a production assembly.
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local itemPolicy = import 'tools/jsonnet/lib/item-policy.libsonnet';
breach.breaking(itemPolicy.itemPack({
  items: [{ id: 'craft_look_panel', name: 'Panel look', category: 'material', size: [1, 1], weight: 200 }],
  partBlueprints: [{
    id: 'craft_look_housing',
    // Worn below the top band, so the part row's blip differs from an intact piece's; instant and needing no tool
    // or skill, so its Start commits from the spawn with nothing else in reach.
    slots: [{
      id: 'panel',
      accepts: ['craft_look_panel'],
      initial: { item: 'craft_look_panel', condition: [0.4, 0.6] },
      service: { timeGameMinutes: 0 },
    }],
  }],
  furniture: [{
    id: 'craft_look_housing', name: 'Housing look', size: [1, 1, 1], color: '#6f7a80', material: 'steel',
    takeApart: { parts: 'craft_look_housing' },
  }],
}))
