// Gauntlet city doors: the door leaf as its own piece, owning exactly the
// opening it fills. The shell leaves that 2 × 4 × 1 slot unclaimed, so the
// building assembly delegates the doorway to this piece and a window bay
// cannot host it. See `deadvox/docs/content.md`, "Curated kits".
local context = { usage: ['Residential'], tier: 'Tier1' };
local palette = {
  D: { furniture: 'wood_door' },
};
{
  mapPieces: [{
    id: 'gauntlet_city_door',
    size: [2, 4, 1], style: 'brick_townhouse',
    lootContext: context, palette: palette,
    layers: [['DD'], ['DD'], ['DD'], ['DD']],
    ownership: { layers: [['SS'], ['SS'], ['SS'], ['SS']] },
    anchors: {}, ports: [],
  }],
}
