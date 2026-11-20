// Gauntlet city doors: the door leaf as its own piece, owning exactly the
// opening it fills. The shell leaves that 2 × 4 × 1 slot unclaimed, so the
// building assembly delegates the doorway to this piece and a window bay
// cannot host it. The variants are alternatives for that one doorway slot. See
// `packages/deadvox/docs/content.md`, "Curated kits" and `packages/deadvox/docs/aftermath.md`, "Door variants".
local context = { usage: ['Residential'], tier: 'Tier1' };
local door(id, palette, rows, claim) = {
  id: id,
  size: [2, 4, 1], style: 'brick_townhouse',
  lootContext: context, palette: palette,
  layers: [[rows] for _ in std.range(1, 4)],
  ownership: { layers: [[claim] for _ in std.range(1, 4)] },
  anchors: {}, ports: [],
};
local leaf = { furniture: 'wood_door' };
local variants = [
  { id: 'gauntlet_city_door_intact', weight: 6 },
  { id: 'gauntlet_city_door_missing', weight: 1 },
  { id: 'gauntlet_city_door_boarded', weight: 2 },
];
{
  slot(at): {
    id: 'door', at: at, size: [2, 4, 1], turn: 0, doorway: true,
    choices: [{ ref: { kind: 'piece', id: variant.id }, weight: variant.weight } for variant in variants],
  },
  mapPieces: [
    door('gauntlet_city_door_intact', { D: leaf }, 'DD', 'SS'),
    // The leaf is gone: an open doorway.
    door('gauntlet_city_door_missing', { '.': { role: 'opening', material: 'opening' } }, '..', 'AA'),
    // Boarded from the street: the leaf faces north, the side every placed house turns to the street.
    door('gauntlet_city_door_boarded', {
      D: leaf + { boarding: { type: 'wood_door_boarding', side: 'front' } },
    }, 'DD', 'SS'),
  ],
}
