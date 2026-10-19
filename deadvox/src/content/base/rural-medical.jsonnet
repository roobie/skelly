local medical = { usage: ['Medical'], tier: 'Tier1' };
local floor = [
  'kkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkk',
  'kkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkk',
  'kkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkk',
  'kkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkk',
];
local furnished = [
  '#####################', '#......#......#.....#', '#.WWW..#......#MM...#', '#.WWW..#F.....#LL...#',
  '#...c..#BB....#...bb#', '#......#BB....O...bbE', '#......#BB....O...bbE', '#......#BB....#...bb#',
  '#AA....#......#.....#', '#......#......#.SC..#', '#......###..###.....#', '#......O.......O..TT#',
  '#......O.......O..TT#', '#########DD##########',
];
local low = [
  '#####################', '#......#......#.....#', '#.WWW..#......#MM...#', '#.WWW..#F.....#LL...#',
  '#...c..#......#.....#', '#......#......O.....E', '#......#......O.....E', '#......#......#.....#',
  '#AA....#......#.....#', '#......#......#.SC..#', '#......###..###.....#', '#......O.......O..TT#',
  '#......O.......O..TT#', '#########DD##########',
];
local upper = [
  '##===####===####===##', '#......#......#.....#', '#......#......#MM...#', '#......#......#LL...#',
  '#......#......#.....#', '#......#......O.....E', '#......#......O.....E', '#......#......#.....#',
  '#......#......#.....#', '#......#......#.....#', '#......###..###.....#', '#......O.......O....#',
  '#......O.......O....#', '#########DD##########',
];
local walls = [
  '##...####...####...##', '#......#......#.....#', '#......#......#.....#', '#......#......#LL...#',
  '#......#......#.....#', '#......#......O.....E', '#......#......O.....E', '#......#......#.....#',
  '#......#......#.....#', '#......#......#.....#', '#......###..###.....#', '#......O.......O....#',
  '#......O.......O....#', '#########DD##########',
];
local lintel = [
  '#####################', '#......#......#.....#', '#......#......#.....#', '#......#......#.....#',
  '#......#......#.....#', '#......#......#.....#', '#......#......#.....#', '#......#......#.....#',
  '#......#......#.....#', '#......#......#.....#', '#......###..###.....#', '#......#.......#....#',
  '#......#.......#....#', '#####################',
];
local roof = [
  '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^',
  '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^',
  '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^',
  '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^',
];
local ridge = [
  '.....................', '.....................', '.....................', '.....................',
  '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^',
  '^^^^^^^^^^^^^^^^^^^^^', '^^^^^^^^^^^^^^^^^^^^^', '.....................', '.....................',
  '.....................', '.....................',
];
local yardGround = [
  'ggggggggggggggggggggg', 'ggggggggggggggggggggg', 'ggggggggggggggggggggg', 'ggggggggggggggggggggg',
  'ggggggggggggggggggggg', 'ggggggggggggggggggggg', 'ggggggggggggggggggggg', 'ggggggggggggggggggggg',
  'ggggggggggggggggggggg', 'ggggggggggggggggggggg', 'ggggggggggggggggggggg', 'ggggggggggggggggggggg',
  'ggggggggggggggggggggg', 'ggggggggggggggggggggg', 'ggggggggrrrrrgggggggg', 'ggggggggrrrrrgddddddg',
  'ggggggggrrrrrgddddddg', 'ggggggggrrrrrgddddddg', 'ggggggggrrrrrgddddddg', 'ggggggggrrrrrgddddddg',
  'ggggggggrrrrrgddddddg', 'ggggggggrrrrrgddddddg', 'ggggggggrrrrrgddddddg', 'ggggggggggggggggggggg',
];
local yardFurniture = [
  '.....................', '.....................', '.....................', '.....................',
  '.....................', '.....................', '.....................', '.....................',
  '.....................', '.....................', '.....................', '.....................',
  '.....................', '.....................', '.....................', '.....................',
  '.....................', '.....................', '.....................', '.....................',
  '.BBBB............NN..', '.BBBB............NN..', '.....................', '.....................',
];
local yardUpper = [
  '.....................', '.....................', '.....................', '.....................',
  '.....................', '.....................', '.....................', '.....................',
  '.....................', '.....................', '.....................', '.....................',
  '.....................', '.....................', '.....................', '.....................',
  '.....................', '.....................', '.....................', '.....................',
  '.................NN..', '.................NN..', '.....................', '.....................',
];
{
  templates: [
    {
      id: 'rural_medical_post', size: [21, 8, 14], lootContext: medical,
      palette: {
        '.': 'air', '#': 'brick', '=': 'window_frame', k: 'concrete', '^': 'roof',
        D: { furniture: 'wood_door' }, O: { furniture: 'wood_door', facing: 'e' }, E: { furniture: 'station_emergency_door', facing: 'e' },
        W: { furniture: 'desk', loot: 'medical_filler' }, c: { furniture: 'chair' }, B: { furniture: 'medical_examination_couch' }, b: { furniture: 'bed' },
        F: { furniture: 'medical_folding_screen' }, M: { furniture: 'medical_cabinet', loot: 'medical_filler' }, L: { furniture: 'shelf', loot: 'medical_filler' },
        A: { furniture: 'station_washbasin', facing: 's' }, S: { furniture: 'medical_steam_sterilizer' }, C: { furniture: 'medical_card_file' }, T: { furniture: 'station_toilet', facing: 's' },
      },
      layers: [floor, furnished, low, upper, walls, lintel, roof, ridge],
      access: { ground: 'ground', entrance: [9, 1, 12], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
    },
    {
      id: 'rural_medical_grounds', size: [21, 3, 24], lootContext: medical,
      palette: { '.': 'air', g: { ground: true }, r: 'dirt', d: 'dirt', B: { furniture: 'medical_bike_rack' }, N: { furniture: 'medical_bin_enclosure' } },
      layers: [yardGround, yardFurniture, yardUpper],
    },
  ],
  layouts: [{
    id: 'rural_medical_post_demo', demo: true, lootContext: medical,
    bounds: { x0: 32, z0: 32, x1: 96, z1: 96 }, ground: 21, terrain: [],
    buildings: [
      { template: 'rural_medical_post', position: [52, 21, 52], rotation: 0 },
      { template: 'rural_medical_grounds', position: [52, 21, 59], rotation: 0 },
    ],
    player: { position: [57, 21.5, 65], bearing: 0 }, shamblers: [], woodlands: [],
    tracks: [{ points: [[57, 82], [57, 59]], width: 2.5, surface: 'dirt' }],
  }],
}
