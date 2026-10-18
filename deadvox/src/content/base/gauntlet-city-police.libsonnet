local furniture = (import 'furniture.jsonnet').furniture;
local disorder = import 'aftermath.libsonnet';
local woodDoor = std.filter(function(f) f.id == 'wood_door', furniture)[0];
local empty = [
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '..............',
];
local floor = [
  '....qq...#CCC.', '.RR.qq...#CCC.', '.RR......O..qq', '.RR......O..qq',
  '######DD######', 'qq.......L....', 'qq.......L....', 'BBEE#BBEE#GG..',
  'bb..#bb..#GG..', 'bb..#bb..#AA..', 'bb..#bb..#AA..', 'bb..#bb..#..SS',
];
local low = [
  '....qq...#CCC.', '.RR.qq...#CCC.', '.RR......O..qq', '.RR......O..qq',
  '######DD######', 'qq.......L....', 'qq.......L....', 'BBEE#BBEE#GG..',
  '....#....#GG..', '....#....#AA..', '....#....#AA..', '....#....#..SS',
];
local tall = [
  '.........#....', '.........#....', '.........O....', '.........O....',
  '######DD######', '.........L....', '.........L....', 'BBEE#BBEE#GG..',
  '....#....#GG..', '....#....#....', '....#....#....', '....#....#..SS',
];
local upper = [
  '.........#....', '.........#....', '.........#....', '.........#....',
  '##############', '.........#....', '.........#....', '##########....',
  '....#....#....', '....#....#....', '....#....#....', '....#....#....',
];
local claims(layer) = [
  std.join('', [if c == 'q' then '.' else if c == '.' then 'R' else 'S' for c in std.stringChars(row)])
  for row in layer
];
local panel = {
  id: 'gauntlet_cell_bars', name: 'Cell bars', size: [1, 4, 1], color: '#626d70',
  shape: [
    { position: [0.1, 0, 0.4], size: [0.12, 4, 0.2] },
    { position: [0.7, 0, 0.4], size: [0.12, 4, 0.2] },
    { position: [0, 0.1, 0.4], size: [1, 0.15, 0.2] },
    { position: [0, 3.7, 0.4], size: [1, 0.15, 0.2] },
  ],
};
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
  chairPieces: disorder.pieces('gauntlet_police_chair', 'gauntlet_police', { usage: ['Hunting'], tier: 'Tier1' }),
  chairSlots: [
    disorder.slot('reception_chair', 'gauntlet_police_chair', [5, 1, 3], disorder.poses[:2]),
    disorder.slot('office_chair', 'gauntlet_police_chair', [13, 1, 5], disorder.poses[2:]),
    disorder.slot('displaced_chair', 'gauntlet_police_chair', [1, 1, 8]),
  ],
  furniture: disorder.furniture + [
    panel,
    woodDoor + {
      id: 'gauntlet_cell_door', name: 'Cell door', color: panel.color,
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
  piece: {
    id: 'gauntlet_police_rooms', size: [14, 7, 12], style: 'gauntlet_police',
    lootContext: { usage: ['Hunting'], tier: 'Tier1' },
    palette: {
      '.': { role: 'opening', material: 'opening' },
      q: { role: 'opening', material: 'opening' },
      '#': { role: 'shell', material: 'partition' },
      D: { furniture: 'wood_door' },
      O: { furniture: 'wood_door', facing: 'e' },
      L: { furniture: 'wood_door', facing: 'e', lock: { id: 'gauntlet_police_armoury', locked: true } },
      R: { furniture: 'desk', facing: 'e', loot: 'desk' },
      C: { furniture: 'desk', facing: 's', loot: 'gauntlet_police_office_key' },
      B: { furniture: 'gauntlet_cell_bars' },
      E: { furniture: 'gauntlet_cell_door' },
      b: { furniture: 'bed' },
      G: { furniture: 'range_rack', loot: 'gauntlet_police_sidearms' },
      A: { furniture: 'crate', loot: 'gauntlet_police_ammunition' },
      S: { furniture: 'shelf', loot: 'gauntlet_police_gear' },
    },
    layers: [floor, low, tall, tall, upper, upper, upper],
    ownership: { layers: [claims(layer) for layer in [floor, low, tall, tall, upper, upper, upper]] },
    anchors: {}, ports: [],
  },
}
