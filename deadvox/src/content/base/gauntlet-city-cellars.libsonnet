local context = { usage: ['Residential'], tier: 'Tier1' };
local palette = {
  '.': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'facade' },
  '=': { role: 'support', material: 'footing' },
};
local walls = [
  '..................', '..................', '################..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '################..',
];
local wallClaims = [
  '..................', '..................', 'SSSSSSSSSSSSSSSS..', 'S..............S..',
  'S..............S..', 'S..............S..', 'S..............S..', 'S..............S..',
  'S..............S..', 'S..............S..', 'S..............S..', 'S..............S..',
  'S..............S..', 'S..............S..', 'S..............S..', 'SSSSSSSSSSSSSSSS..',
];
local street = [
  '==================', '==================', '################==', '#..............#==',
  '#..............#==', '#..............#==', '#..............#==', '#..............#==',
  '#..............#==', '#..............#==', '#..............#==', '#..............#==',
  '#..............#==', '#..............#==', '#..............#==', '################==',
];
local streetClaims = [
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'S..............SSS',
  'S..............SSS', 'S..............SSS', 'S..............SSS', 'S..............SSS',
  'S..............SSS', 'S..............SSS', 'S..............SSS', 'S..............SSS',
  'S..............SSS', 'S..............SSS', 'S..............SSS', 'SSSSSSSSSSSSSSSSSS',
];
// The secret house's cellar floor has a hatch in its front corner, outside every lower scene's
// furniture bands; the sub-cellar below is one slab and a walled room with the ladder under it.
// The buried room has no facade, so its walls are footing like the slab.
local hatchFloor = [
  '==================', '==================', '==================', '============TTT===',
  '============TTT===', '==================', '==================', '==================',
  '==================', '==================', '==================', '==================',
  '==================', '==================', '==================', '==================',
];
local solid = [
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
];
local slab = [
  '..................', '..................', '........========..', '........========..',
  '........========..', '........========..', '........========..', '........========..',
  '........========..', '........========..', '..................', '..................',
  '..................', '..................', '..................', '..................',
];
local slabClaims = [
  '..................', '..................', '........SSSSSSSS..', '........SSSSSSSS..',
  '........SSSSSSSS..', '........SSSSSSSS..', '........SSSSSSSS..', '........SSSSSSSS..',
  '........SSSSSSSS..', '........SSSSSSSS..', '..................', '..................',
  '..................', '..................', '..................', '..................',
];
local roomFloor = [
  '..................', '..................', '........========..', '........=....J.=..',
  '........=....J.=..', '........=......=..', '........=.Z....=..', '........=......=..',
  '........=LL....=..', '........========..', '..................', '..................',
  '..................', '..................', '..................', '..................',
];
local roomLocker = [
  '..................', '..................', '........========..', '........=....J.=..',
  '........=....J.=..', '........=......=..', '........=......=..', '........=......=..',
  '........=LL....=..', '........========..', '..................', '..................',
  '..................', '..................', '..................', '..................',
];
local roomLockerClaims = [
  '..................', '..................', '........SSSSSSSS..', '........SRRRRSRS..',
  '........SRRRRSRS..', '........SRRRRRRS..', '........SRRRRRRS..', '........SRRRRRRS..',
  '........SSSRRRRS..', '........SSSSSSSS..', '..................', '..................',
  '..................', '..................', '..................', '..................',
];
local room = [
  '..................', '..................', '........========..', '........=....J.=..',
  '........=....J.=..', '........=......=..', '........=......=..', '........=......=..',
  '........=......=..', '........========..', '..................', '..................',
  '..................', '..................', '..................', '..................',
];
local roomClaims = [
  '..................', '..................', '........SSSSSSSS..', '........SRRRRSRS..',
  '........SRRRRSRS..', '........SRRRRRRS..', '........SRRRRRRS..', '........SRRRRRRS..',
  '........SRRRRRRS..', '........SSSSSSSS..', '..................', '..................',
  '..................', '..................', '..................', '..................',
];
// The owner's stash: d483's blowtorch is one more entry here.
local reward = [
  { item: 'cartridge_box_357_h_magnum', count: 2 },
  { item: 'shotshell_box', count: 1 },
];
{
  mapPieces: [
    {
      id: 'gauntlet_city_secret_floor', size: [18, 1, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette + { T: { furniture: 'roof_hatch', facing: 'w' } },
      layers: [hatchFloor], ownership: { layers: [solid] }, anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_sub_cellar', size: [18, 6, 16], style: 'brick_townhouse',
      lootContext: context,
      palette: palette + {
        J: { furniture: 'ladder', facing: 'w' },
        Z: { spawn: 'acid_zombie' },
        L: { furniture: 'footlocker', loot: 'd41_empty', items: reward },
      },
      layers: [slab, roomFloor, roomLocker, room, room, room],
      ownership: { layers: [slabClaims, roomLockerClaims, roomLockerClaims, roomClaims, roomClaims, roomClaims] },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_cellar_shell', size: [18, 7, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: [walls, walls, walls, walls, walls, walls, walls],
      ownership: { layers: [wallClaims, wallClaims, wallClaims, wallClaims, wallClaims, wallClaims, wallClaims] },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_street_course', size: [18, 1, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: [street], ownership: { layers: [streetClaims] }, anchors: {}, ports: [],
    },
  ],
}
