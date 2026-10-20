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
  '..................', '..................', '......==========..', '......==========..',
  '......==========..', '......==========..', '......==========..', '......==========..',
  '......==========..', '......==========..', '......==========..', '......==========..',
  '..................', '..................', '..................', '..................',
];
local slabClaims = [
  '..................', '..................', '......SSSSSSSSSS..', '......SSSSSSSSSS..',
  '......SSSSSSSSSS..', '......SSSSSSSSSS..', '......SSSSSSSSSS..', '......SSSSSSSSSS..',
  '......SSSSSSSSSS..', '......SSSSSSSSSS..', '......SSSSSSSSSS..', '......SSSSSSSSSS..',
  '..................', '..................', '..................', '..................',
];
local roomFloor = [
  '..................', '..................', '......==========..', '......=bb....J.=..',
  '......=bb....J.=..', '......=bb......=..', '......=bb......=..', '......=.....Z..=..',
  '......=........=..', '......=........=..', '......=WW..LL..=..', '......==========..',
  '..................', '..................', '..................', '..................',
];
local roomLocker = [
  '..................', '..................', '......==========..', '......=......J.=..',
  '......=......J.=..', '......=........=..', '......=........=..', '......=........=..',
  '......=........=..', '......=........=..', '......=WW......=..', '......==========..',
  '..................', '..................', '..................', '..................',
];
local roomWardrobe = [
  '..................', '..................', '......==========..', '......=......J.=..',
  '......=......J.=..', '......=........=..', '......=........=..', '......=........=..',
  '......=........=..', '......=........=..', '......=WW......=..', '......==========..',
  '..................', '..................', '..................', '..................',
];
local roomFloorClaims = [
  '..................', '..................', '......SSSSSSSSSS..', '......SSSRRRRSRS..',
  '......SSSRRRRSRS..', '......SSSRRRRRRS..', '......SSSRRRRRRS..', '......SRRRRRRRRS..',
  '......SRRRRRRRRS..', '......SRRRRRRRRS..', '......SSSRRSSRRS..', '......SSSSSSSSSS..',
  '..................', '..................', '..................', '..................',
];
local roomLockerClaims = [
  '..................', '..................', '......SSSSSSSSSS..', '......SRRRRRRSRS..',
  '......SRRRRRRSRS..', '......SRRRRRRRRS..', '......SRRRRRRRRS..', '......SRRRRRRRRS..',
  '......SRRRRRRRRS..', '......SRRRRRRRRS..', '......SSSRRRRRRS..', '......SSSSSSSSSS..',
  '..................', '..................', '..................', '..................',
];
local roomWardrobeClaims = [
  '..................', '..................', '......SSSSSSSSSS..', '......SRRRRRRSRS..',
  '......SRRRRRRSRS..', '......SRRRRRRRRS..', '......SRRRRRRRRS..', '......SRRRRRRRRS..',
  '......SRRRRRRRRS..', '......SRRRRRRRRS..', '......SSSRRRRRRS..', '......SSSSSSSSSS..',
  '..................', '..................', '..................', '..................',
];
local room = [
  '..................', '..................', '......==========..', '......=......J.=..',
  '......=......J.=..', '......=........=..', '......=........=..', '......=........=..',
  '......=........=..', '......=........=..', '......=........=..', '......==========..',
  '..................', '..................', '..................', '..................',
];
local roomClaims = [
  '..................', '..................', '......SSSSSSSSSS..', '......SRRRRRRSRS..',
  '......SRRRRRRSRS..', '......SRRRRRRRRS..', '......SRRRRRRRRS..', '......SRRRRRRRRS..',
  '......SRRRRRRRRS..', '......SRRRRRRRRS..', '......SRRRRRRRRS..', '......SSSSSSSSSS..',
  '..................', '..................', '..................', '..................',
];
// The owner's stash holds the game's only blowtorch, with one cartridge fitted.
local reward = [
  { item: 'blowtorch', count: 1, fitted: { canister: 'gas_canister' } },
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
        b: { furniture: 'bed', facing: 's' },
        J: { furniture: 'ladder', facing: 'w' },
        Z: { spawn: 'brute_shambler' },
        L: { furniture: 'footlocker', loot: 'd41_empty', items: reward },
        W: { furniture: 'wardrobe', facing: 'n', loot: 'wardrobe' },
      },
      layers: [slab, roomFloor, roomLocker, roomLocker, roomWardrobe, room],
      ownership: { layers: [slabClaims, roomFloorClaims, roomLockerClaims, roomLockerClaims, roomWardrobeClaims, roomClaims] },
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
