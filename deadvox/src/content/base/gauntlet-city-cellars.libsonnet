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
  'AAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAA', 'SSSSSSSSSSSSSSSSAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'SSSSSSSSSSSSSSSSAA',
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
{
  mapPieces: [
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
