// Gauntlet city doors: the door leaf as its own piece, owning exactly the
// opening it fills. The shell leaves that 2 × 4 × 1 slot unclaimed, so the
// building assembly delegates the doorway to this piece and a window bay
// cannot host it. The variants are alternatives for that one slot. See
// `deadvox/docs/content.md`, "Curated kits" and `deadvox/docs/aftermath.md`, "Door variants".
local context = { usage: ['Residential'], tier: 'Tier1' };
local leaf = std.filter(function(f) f.id == 'wood_door', (import 'furniture.jsonnet').furniture)[0];
local door(id, palette, rows, claim) = {
  id: id,
  size: [2, 4, 1], style: 'brick_townhouse',
  lootContext: context, palette: palette,
  layers: [[rows] for _ in std.range(1, 4)],
  ownership: { layers: [[claim] for _ in std.range(1, 4)] },
  anchors: {}, ports: [],
};
local variants = [
  { id: 'gauntlet_city_door_intact', weight: 6 },
  { id: 'gauntlet_city_door_missing', weight: 1 },
  { id: 'gauntlet_city_door_boarded_outside', weight: 2 },
];
{
  slot(at): {
    id: 'door', at: at, size: [2, 4, 1], turn: 0,
    choices: [{ ref: { kind: 'piece', id: variant.id }, weight: variant.weight } for variant in variants],
  },
  // Planks stand proud of the leaf on its front, the street side, so the leaf behind stays a
  // door and `barredFrom` keeps the street from opening it.
  furniture: [
    {
      [field]: leaf[field] for field in std.objectFields(leaf) if field != 'size'
    } + {
      id: 'gauntlet_door_boarded', name: 'Boarded wooden door', size: leaf.size,
      door: leaf.door + { barredFrom: 'front' },
      shape: [
        { position: [0, 0, 0.4], size: [2, 4, 0.6] },
        { position: [0, 0.6, 0], size: [2, 0.4, 0.4] },
        { position: [0, 1.8, 0], size: [2, 0.4, 0.4] },
        { position: [0, 3, 0], size: [2, 0.4, 0.4] },
      ],
    },
  ],
  mapPieces: [
    door('gauntlet_city_door_intact', { D: { furniture: 'wood_door' } }, 'DD', 'SS'),
    // The leaf is gone: an open doorway.
    door('gauntlet_city_door_missing', { '.': { role: 'opening', material: 'opening' } }, '..', 'AA'),
    door('gauntlet_city_door_boarded_outside', { D: { furniture: 'gauntlet_door_boarded' } }, 'DD', 'SS'),
  ],
}
