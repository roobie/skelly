local furniture = (import 'furniture.jsonnet').furniture;
local disorder = import 'aftermath.libsonnet';
local woodDoor = std.filter(function(f) f.id == 'wood_door', furniture)[0];
{
  items: [{
    id: 'gauntlet_police_armoury_key', name: 'Police armoury key', category: 'tool',
    weight: 10, size: [1, 1], key: { lock: 'gauntlet_police_armoury' },
    description: 'A small key stamped ARMOURY.',
    economy: { usage: ['Hunting'], tiers: ['Tier1'] },
  }],
  loot: [{
    id: 'gauntlet_police_office_key', rolls: [1, 1],
    entries: [{ item: 'gauntlet_police_armoury_key', weight: 1 }],
  }],
  furniture: disorder.furniture + [
    woodDoor + {
      id: 'gauntlet_cell_door', name: 'Cell door', color: '#626d70',
      shape: [
        { position: [0, 0, 0.35], size: [0.15, 4, 0.3] },
        { position: [1.85, 0, 0.35], size: [0.15, 4, 0.3] },
        { position: [0.6, 0, 0.4], size: [0.12, 4, 0.2] },
        { position: [1.25, 0, 0.4], size: [0.12, 4, 0.2] },
        { position: [0, 0.1, 0.35], size: [2, 0.15, 0.3] },
        { position: [0, 3.7, 0.35], size: [2, 0.15, 0.3] },
        { position: [1.5, 1.7, 0.3], size: [0.35, 0.4, 0.4] },
      ],
    },
  ],
}
