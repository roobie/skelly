local context = { usage: [], tier: 'Tier1' };
local palette = {
  '.': { ground: true }, f: 'chain_link', a: 'asphalt',
  s: { furniture: 'shrub_small' }, i: { furniture: 'creeper_strip' }, w: { furniture: 'weed_tuft' },
  T: { furniture: 'substation_transformer', facing: 's' },
  R: { furniture: 'substation_disconnector', facing: 's' },
  p: { furniture: 'substation_pole' },
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
  'f........iiiiii........f',
  'f...RRR................f',
  'f........TTTTTT........f',
  'f.ss.....TTTTTT........f',
  'f.ss.....TTTTTT........f',
  'f........TTTTTT........f',
  'f........TTTTTT........f',
  'f................w..w..f',
  'f..................w..wf',
  'fffffffffffffffffff...ff',
];
local grownUpper = [
  'ffffffffffffffffffffffff',
  'f........iiiiii........f',
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
  ],
  buildings: [
    { template: 'rural_substation_yard', position: [50, 21, 57.5], rotation: 0 },
    { template: 'rural_substation_pole', position: [48, 21, 59.5], rotation: 0 },
  ],
}
