local context = { usage: ['Medical'], tier: 'Tier1' };
local palette = {
  '.': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'canvas' },
  T: { role: 'trim', material: 'cross' },
  B: { furniture: 'bed' }, M: { furniture: 'crate', loot: 'gauntlet_medical_stock' },
};
local base = [
  '##...##', '#.....#', '#.....#', '#.....#', '#BB...#', '#BB...#',
  '#BB...#', '#BB...#', '#.....#', '#..MM.#', '#..MM.#', '#######',
];
local supply = [
  '##...##', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#',
  '#.....#', '#.....#', '#.....#', '#..MM.#', '#..MM.#', '#######',
];
local wall = [
  '##...##', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#',
  '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######',
];
local posts(layer) = ['#T...T#'] + std.slice(layer, 1, null, 1);
local crossWide = [
  'TTTTTTT', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#',
  '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######',
];
local crossStem = [
  '###T###', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#',
  '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######',
];
local claim(layer) = [std.join('', [if c == '.' then 'R' else 'S' for c in std.stringChars(row)]) for row in layer];
local layers = [posts(base), posts(supply), posts(wall), posts(wall), crossWide, crossStem];
local full = [
  '#######', '#######', '#######', '#######', '#######', '#######',
  '#######', '#######', '#######', '#######', '#######', '#######',
];
local ridge = [
  '..###..', '..###..', '..###..', '..###..', '..###..', '..###..',
  '..###..', '..###..', '..###..', '..###..', '..###..', '..###..',
];
local apron = [
  '..................', '..................', '..................', '..................',
  '..................', '..................', '..................', '..................',
  '..................', '..................', '..................', '..................',
  '..................', '..................', '..................', '..................',
];
local apronClaims = [
  'RRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRR', 'R.......RR.......R',
  'R.......RR.......R', 'R.......RR.......R', 'R.......RR.......R', 'R.......RR.......R',
  'R.......RR.......R', 'R.......RR.......R', 'R.......RR.......R', 'R.......RR.......R',
  'R.......RR.......R', 'R.......RR.......R', 'R.......RR.......R', 'RRRRRRRRRRRRRRRRRR',
];
local piece(id, size, layers, claims) = {
  id: id, size: size, style: 'gauntlet_canvas', lootContext: context,
  palette: palette, layers: layers, ownership: { layers: claims }, anchors: {}, ports: [],
};
local slot(id, piece, at, size, turn=0) = {
  id: id, at: at, size: size, turn: turn,
  choices: [{ ref: { kind: 'piece', id: piece }, weight: 1 }],
};
{
  blocks: [{ id: 'gauntlet_canvas', name: 'Tent canvas', color: '#d9d2b7', solid: true, weatherable: false }],
  mapStyles: [{ id: 'gauntlet_canvas', bindings: {
    canvas: { role: 'shell', block: 'gauntlet_canvas' },
    cross: { role: 'trim', block: 'shop_red' }, opening: { role: 'opening', block: 'air' },
  } }],
  mapPieces: [
    piece('gauntlet_triage_tent', [7, 6, 12], layers, [claim(layer) for layer in layers]),
    piece('gauntlet_tent_roof', [7, 2, 12], [full, ridge], [claim(full), claim(ridge)]),
    piece('gauntlet_triage_apron', [18, 8, 16],
      [apron, apron, apron, apron, apron, apron, apron, apron],
      [apronClaims, apronClaims, apronClaims, apronClaims, apronClaims, apronClaims, apronClaims, apronClaims]),
  ],
  mapAssemblies: [{
    id: 'gauntlet_medical_site', size: [18, 9, 16], lootContext: context,
    eligibility: { settlementKinds: ['city'] },
    slots: [
      slot('ground', 'gauntlet_city_ground', [0, 0, 0], [18, 1, 16]),
      slot('apron', 'gauntlet_triage_apron', [0, 1, 0], [18, 8, 16]),
      slot('west_tent', 'gauntlet_triage_tent', [1, 1, 3], [7, 6, 12]),
      slot('east_tent', 'gauntlet_triage_tent', [10, 1, 3], [7, 6, 12]),
      slot('west_roof', 'gauntlet_tent_roof', [1, 7, 3], [7, 2, 12]),
      slot('east_roof', 'gauntlet_tent_roof', [10, 7, 3], [7, 2, 12]),
    ], joins: [], ports: [],
    anchors: {
      entry: { kind: 'standing', at: [9, 1, 2] },
      west: { kind: 'standing', at: [5, 1, 11] }, east: { kind: 'standing', at: [14, 1, 11] },
    },
    access: { ground: 'floor_0', entrance: [9, 1, 2], storeys: [{ id: 'floor_0', floor: 1 }], stairs: [] },
  }],
  loot: [{ id: 'gauntlet_medical_stock', rolls: [1, 3], entries: [
    { item: 'bandage', weight: 4, count: [1, 2] }, { item: 'antiseptic', weight: 2 },
    { item: 'antibiotics', weight: 1 }, { table: 'medical_filler', weight: 2 }, { nothing: true, weight: 3 },
  ] }],
}
