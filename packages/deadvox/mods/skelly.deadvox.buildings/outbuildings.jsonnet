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
  b: { role: 'support', material: 'lintel' },
  d: { role: 'support', material: 'path' },
  l: { role: 'trim', material: 'lid' },
  r: { role: 'roof', material: 'sheet' },
};
local claim(mark) = std.get({ '_': 'R', ',': '.', '.': 'A' }, mark, 'S');
local piece(id, size, layers, things={}) = {
  id: id, size: size, style: style, lootContext: context, palette: palette + things, layers: layers,
  ownership: { layers: [[std.join('', std.map(claim, std.stringChars(row))) for row in layer] for layer in layers] },
  anchors: {}, ports: [],
};
// A plank privy over its pit: the seat against the back wall, facing a doorway left to the outhouse's door slot. The
// seat leaves no reserved cell inside, so a trodden stoop before the door carries the entrance and the privy's room.
local outhouseShell = piece('outhouse_shell', [4, 7, 6], [
  ['dddd', 'dddd', 'pppp', 'pppp', 'pppp', 'pppp'],
] + [
  ['____', '____', 'w,,w', 'wPPw', 'wPPw', 'wwww']
  for _ in [1, 2]
] + [
  ['____', '____', 'w,,w', 'w..w', 'w..w', 'wwww']
  for _ in [3, 4]
] + [
  [',,,,', ',,,,', 'wwww', 'w..w', 'w..w', 'wwww'],
  [',,,,', ',,,,', 'rrrr', 'rrrr', 'rrrr', 'rrrr'],
], { P: { furniture: 'privy_seat', fixed: true } });
// The privy door: a flimsy plank leaf opening onto the yard, or the leaf gone.
local outhouseDoor(id, rows, things) = piece(id, [2, 4, 1], [[rows] for _ in std.range(1, 4)], things);
local outhouseDoors = [
  outhouseDoor('outhouse_door', 'DD', { D: { furniture: 'flimsy_wood_door', facing: 'n' } }),
  outhouseDoor('outhouse_door_missing', '..', {}) + { aftermath: ['broken'] },
];
local only(kind, id) = [{ ref: { kind: kind, id: id }, weight: 1 }];
local outhouse = {
  id: 'outhouse', brief: 'rural_privy', eligibility: { settlementKinds: ['rural'] }, lootContext: context,
  size: [4, 7, 6],
  slots: [
    { id: 'shell', at: [0, 0, 0], size: [4, 7, 6], turn: 0, choices: only('piece', 'outhouse_shell') },
    {
      id: 'door', at: [1, 1, 2], size: [2, 4, 1], turn: 0, doorway: true, choices: [
        { ref: { kind: 'piece', id: 'outhouse_door' }, weight: 4 },
        { ref: { kind: 'piece', id: 'outhouse_door_missing' }, weight: 1 },
      ],
    },
  ],
  joins: [], ports: [],
  anchors: { toilet: { kind: 'standing', at: [2, 1, 1] } },
  access: { ground: 'ground', entrance: [2, 1, 1], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
};
// An open-fronted lean-to of boards under a sheet roof, logs stacked along its back wall.
local woodshedShell = piece('woodshed_shell', [8, 6, 5], [
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
local woodshed = {
  id: 'rural_woodshed', brief: 'rural_woodshed', eligibility: { settlementKinds: ['rural'] }, lootContext: context,
  size: [8, 6, 5],
  slots: [{ id: 'shell', at: [0, 0, 0], size: [8, 6, 5], turn: 0, choices: only('piece', 'woodshed_shell') }],
  joins: [], ports: [],
  anchors: { woodshed: { kind: 'standing', at: [4, 1, 1] } },
  access: { ground: 'ground', entrance: [3, 1, 1], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
};
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
// ends at the back. The bay is reserved up to the lintel, so the walk from the opening reaches both. The opening is
// wider than blockwork spans, so a steel lintel carries the course over it.
local garageWalls(bay, back) = ['m' + bay + 'm' for _ in std.range(0, 8)] + back + ['mmmmmmmm'];
local garageShell = piece('garage_shell', [8, 7, 12], [
  ['kkkkkkkk' for _ in std.range(1, 12)],
] + [
  garageWalls('______', ['m____xxm', 'mee__xxm'])
  for _ in [1, 2]
] + [
  garageWalls('______', ['m______m', 'mee____m'])
  for _ in [3, 4]
] + [
  ['mbbbbbbm'] + garageWalls('......', ['m......m', 'm......m'])[1:],
  ['rrrrrrrr' for _ in std.range(1, 12)],
], {
  e: { furniture: 'shelf', facing: 'n', loot: 'shelf' },
  x: { furniture: 'crate', loot: 'junk' },
});
local garage = {
  id: 'rural_garage', brief: 'rural_garage', eligibility: { settlementKinds: ['rural'] }, lootContext: context,
  size: [8, 7, 12],
  slots: [{ id: 'shell', at: [0, 0, 0], size: [8, 7, 12], turn: 0, choices: only('piece', 'garage_shell') }],
  joins: [], ports: [],
  anchors: { garage: { kind: 'standing', at: [3, 1, 6] } },
  access: { ground: 'ground', entrance: [3, 1, 1], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
};
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
      lintel: { role: 'support', block: 'steel_joist' },
      lid: { role: 'trim', block: 'planks' },
      sheet: { role: 'roof', block: 'galvanized' },
      path: { role: 'support', block: 'dirt' },
    },
  }],
  mapPieces: [outhouseShell, woodshedShell, well, garageShell, coopSite] + outhouseDoors,
  mapAssemblies: [outhouse, woodshed, garage],
}
