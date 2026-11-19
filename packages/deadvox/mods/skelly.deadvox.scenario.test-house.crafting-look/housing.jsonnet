// A fixture housing, so the take-apart review's parts path runs on fixture content rather than a production assembly.
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local itemPolicy = import 'tools/jsonnet/lib/item-policy.libsonnet';
breach.breaking(itemPolicy.itemPack({
  items: [
    { id: 'craft_look_panel', name: 'Panel look', category: 'material', size: [1, 1], weight: 200 },
    { id: 'craft_look_cover', name: 'Cover look', category: 'material', size: [1, 1], weight: 200 },
  ],
  partBlueprints: [{
    id: 'craft_look_housing',
    // Worn below the top band, so a part row's blip differs from an intact piece's. Neither service needs a tool or
    // skill, so both commit from the spawn with nothing else in reach. The panel is instant; the cover takes a few
    // compressed seconds, so the look can pause it and continue it from the piece's ring.
    slots: [
      {
        id: 'panel',
        accepts: ['craft_look_panel'],
        initial: { item: 'craft_look_panel', condition: [0.4, 0.6] },
        service: { timeGameMinutes: 0 },
      },
      {
        id: 'cover',
        accepts: ['craft_look_cover'],
        initial: { item: 'craft_look_cover', condition: [0.4, 0.6] },
        service: { timeGameMinutes: 2 },
      },
    ],
  }],
  furniture: [{
    id: 'craft_look_housing', name: 'Housing look', size: [1, 1, 1], color: '#6f7a80', material: 'steel',
    takeApart: { parts: 'craft_look_housing' },
  }],
}))
