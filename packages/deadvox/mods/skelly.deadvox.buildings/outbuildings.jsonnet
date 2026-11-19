// Yard outbuildings any house plot can set behind its house: an outhouse, a woodshed with its log pile, a well
// and a garage, plus the empty site the chicken coop will stand on. Box shapes of the setting's timber,
// blockwork and stone; each opens north, so a plot turns it to face its yard walk.
//
// Marks state their claims, so the layers and ownership cannot disagree: '_' is air reserved for the walk,
// ',' leaves the cell to the terrain, '.' is owned air and every other mark is owned.
local context = { usage: ['Residential'], tier: 'Tier1' };
local style = 'rural_outbuilding';
local palette = {
  '_': { role: 'opening', material: 'opening' },
  ',': { role: 'opening', material: 'opening' },
  '.': { role: 'opening', material: 'opening' },
  w: { role: 'shell', material: 'boarding' },
  m: { role: 'shell', material: 'blockwork' },
  c: { role: 'shell', material: 'curb' },
  p: { role: 'interior_floor', material: 'floor' },
  k: { role: 'support', material: 'slab' },
  l: { role: 'trim', material: 'lid' },
  r: { role: 'roof', material: 'sheet' },
};
local claim(mark) = std.get({ '_': 'R', ',': '.', '.': 'A' }, mark, 'S');
local piece(id, size, layers, things={}) = {
  id: id, size: size, style: style, lootContext: context, palette: palette + things, layers: layers,
  ownership: { layers: [[std.join('', std.map(claim, std.stringChars(row))) for row in layer] for layer in layers] },
  anchors: {}, ports: [],
};
// A plank privy over its pit: an open doorway, as bathroom doors wait on a walk that passes a door leaf, and the
// seat against the back wall facing it.
local outhouse = piece('outhouse', [4, 7, 4], [
  ['pppp', 'pppp', 'pppp', 'pppp'],
] + [
  ['w__w', 'wPPw', 'wPPw', 'wwww']
  for _ in [1, 2]
] + [
  ['w__w', 'w..w', 'w..w', 'wwww']
  for _ in [3, 4]
] + [
  ['wwww', 'w..w', 'w..w', 'wwww'],
  ['rrrr', 'rrrr', 'rrrr', 'rrrr'],
], { P: { furniture: 'privy_seat', fixed: true } });
// An open-fronted lean-to of boards under a sheet roof, logs stacked along its back wall.
local woodshed = piece('woodshed', [8, 6, 5], [
  ['pppppppp' for _ in std.range(1, 5)],
] + [
  ['w______w', 'w______w', 'wLLLMMMw', 'wLLLMMMw', 'wwwwwwww']
  for _ in [1, 2, 3]
] + [
  ['w______w', 'w______w', 'w......w', 'w......w', 'wwwwwwww'],
  ['rrrrrrrr' for _ in std.range(1, 5)],
], {
  L: { furniture: 'log_pile' },
  M: { furniture: 'log_pile' },
});
// A dug well: a stone curb under a plank lid, two posts carrying the winch beam and a small sheet roof.
local well = piece('well', [4, 7, 4], [
  ['cccc', 'cccc', 'cccc', 'cccc'],
  ['cccc', 'c..c', 'c..c', 'cccc'],
  ['cccc', 'cllc', 'cllc', 'cccc'],
] + [
  [',,,,', 'w,,w', ',,,,', ',,,,']
  for _ in [3, 4]
] + [
  [',,,,', 'wwww', ',,,,', ',,,,'],
  ['rrrr', 'rrrr', 'rrrr', 'rrrr'],
]);
// A single blockwork garage with its opening to the road, no door hung, and a shelf and a crate of odds and
// ends at the back.
local garageWalls(back) = ['m......m' for _ in std.range(0, 8)] + back + ['mmmmmmmm'];
local garage = piece('garage', [8, 7, 12], [
  ['kkkkkkkk' for _ in std.range(1, 12)],
] + [
  garageWalls(['m....xxm', 'mee..xxm'])
  for _ in [1, 2]
] + [
  garageWalls(['m......m', 'mee....m'])
  for _ in [3, 4]
] + [
  ['mmmmmmmm'] + garageWalls(['m......m', 'm......m'])[1:],
  ['rrrrrrrr' for _ in std.range(1, 12)],
], {
  e: { furniture: 'shelf', facing: 'n', loot: 'shelf' },
  x: { furniture: 'crate', loot: 'junk' },
});
// The chicken coop's site: claims nothing, so the yard shows through until the coop's model takes the slot.
local coopSite = piece('chicken_coop_site', [4, 4, 4], [[',,,,' for _ in std.range(1, 4)] for _ in std.range(1, 4)]);
{
  mapStyles: [{
    id: style,
    bindings: {
      opening: { role: 'opening', block: 'air' },
      boarding: { role: 'shell', block: 'plank_wall' },
      blockwork: { role: 'shell', block: 'concrete' },
      curb: { role: 'shell', block: 'dressed_stone' },
      floor: { role: 'interior_floor', block: 'plank_floor' },
      slab: { role: 'support', block: 'concrete' },
      lid: { role: 'trim', block: 'planks' },
      sheet: { role: 'roof', block: 'galvanized' },
      path: { role: 'support', block: 'dirt' },
    },
  }],
  mapPieces: [outhouse, woodshed, well, garage, coopSite],
}
