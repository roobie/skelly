local context = { usage: [], tier: 'Tier1' };
local palette = {
  '.': { ground: true }, f: 'chain_link', a: 'asphalt', G: 'tall_grass', h: 'hedge',
  s: { furniture: 'shrub_small' }, i: { furniture: 'creeper_strip' }, w: { furniture: 'weed_tuft' },
  T: { furniture: 'substation_transformer', facing: 's' },
  R: { furniture: 'substation_disconnector', facing: 's' },
  p: { furniture: 'substation_pole' },
  V: { furniture: 'gauntlet_car_wreck_0_0_intact' },
};
local apron = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.................aaaaaa.',
  '................aaaaaaa.',
  '................aaaaaaa.',
  '..................aaaa..',
];
local fenced = [
  'ffffffffffffffffffffffff',
  'f......................f',
  'f...RRR................f',
  'f........TTTTTT........f',
  'f........TTTTTT........f',
  'f........TTTTTT........f',
  'f........TTTTTT........f',
  'f........TTTTTT........f',
  'f......................f',
  'f......................f',
  'fffffffffffffffffff...ff',
];
local grown = [
  'ffffffffffffffffffffffff',
  'f........iiiiii....GGGGf',
  'f...RRR..........GGGGGGf',
  'f........TTTTTT........f',
  'f.ss.....TTTTTT.....hhhf',
  'f.ss.....TTTTTT.....hhhf',
  'f........TTTTTT........f',
  'f........TTTTTT........f',
  'fGGGGG...........w..w..f',
  'fGGGG..............w..wf',
  'fffffffffffffffffff...ff',
];
local grownUpper = [
  'ffffffffffffffffffffffff',
  'f........iiiiii........f',
  'f...RRR................f',
  'f........TTTTTT........f',
  'f........TTTTTT.....hhhf',
  'f........TTTTTT.....hhhf',
  'f........TTTTTT........f',
  'f........TTTTTT........f',
  'f......................f',
  'f......................f',
  'fffffffffffffffffff...ff',
];
local equipment = [
  '........................',
  '........................',
  '....RRR.................',
  '.........TTTTTT.........',
  '.........TTTTTT.........',
  '.........TTTTTT.........',
  '.........TTTTTT.........',
  '.........TTTTTT.........',
  '........................',
  '........................',
  '........................',
];
local tall = [
  '........................',
  '........................',
  '........................',
  '.........TTTTTT.........',
  '.........TTTTTT.........',
  '.........TTTTTT.........',
  '.........TTTTTT.........',
  '.........TTTTTT.........',
  '........................',
  '........................',
  '........................',
];
local post = ['pp', 'pp'];
local bay = ['VVVV', 'VVVV', 'VVVV', 'VVVV', 'VVVV', 'VVVV', 'VVVV', 'VVVV', 'VVVV'];
local clear = ['....', '....', '....', '....', '....', '....', '....', '....', '....'];
{
  templates: [
    {
      id: 'rural_substation_yard', size: [24, 8, 11], lootContext: context,
      palette: palette,
      layers: [apron, grown, grownUpper, fenced, fenced, equipment, tall, tall],
    },
    {
      id: 'rural_substation_pole', size: [2, 21, 2], lootContext: context,
      palette: palette,
      layers: [['..', '..']] + [post for layer in std.range(1, 20)],
    },
    {
      id: 'rural_substation_van_spot', size: [4, 5, 9], lootContext: context,
      palette: palette,
      layers: [clear, bay, bay, bay, bay],
    },
  ],
  buildings: [
    { template: 'rural_substation_yard', position: [50, 21, 57.5], rotation: 0 },
    { template: 'rural_substation_pole', position: [48, 21, 59.5], rotation: 0 },
    { template: 'rural_substation_van_spot', position: [63, 21, 57.5], rotation: 0 },
  ],
}
