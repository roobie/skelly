// The lidded descent shaft that links the lab's storeys: a ladder column under a roof hatch in its top layer. The
// hatch is the lid the levels above and below leave to each other. `packages/deadvox/DESIGN.md`, "Gauntlet".
local context = { usage: [], tier: 'Tier1' };
local ladder = ['.J.', '.J.'];
local shaft = {
  id: 'gauntlet_lab_descent_hatched', size: [3, 8, 2], style: 'concrete_lab', lootContext: context,
  palette: { '.': { role: 'opening', material: 'air' }, J: { furniture: 'ladder', facing: 'w' }, T: { furniture: 'roof_hatch', facing: 'w' } },
  layers: [ladder for _ in std.range(1, 7)] + [['TTT', 'TTT']],
  ownership: { layers: [['RSR', 'RSR'] for _ in std.range(1, 7)] + [['SSS', 'SSS']] },
  anchors: {}, ports: [],
};
{
  shaft: shaft,
  mapPieces: [shaft],
}
