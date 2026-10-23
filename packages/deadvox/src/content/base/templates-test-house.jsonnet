local kit = import 'authored-site-kit.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
local palette = {
  '.': 'air', G: { ground: true }, s: 'stone', b: 'brick', p: 'planks', t: 'tiles',
  f: 'fabric', r: 'roof', a: 'plaster', R: 'siding_red', B: 'siding_blue',
  g: 'galvanized', m: 'cobblestone_mossy', h: 'hazard_yellow', d: 'dressed_stone',
  U: { furniture: 'fuel_generator', fixed: true }, V: { furniture: 'storage_battery', fixed: true },
  J: { furniture: 'main_breaker', fixed: true }, S: { furniture: 'solar_panel', fixed: true },
  L: { furniture: 'electric_lamp', fixed: true }, X: { furniture: 'battery_charger', fixed: true },
  F: { furniture: 'fridge', fixed: true }, C: { furniture: 'kitchen_cupboard' },
  H: { furniture: 'chair' }, W: { furniture: 'wardrobe', facing: 'w' },
  Q: { furniture: 'crate', loot: 'sample_note_loot' }, N: { furniture: 'sample_sign' }, O: { furniture: 'wardrobe', facing: 'n' },
  K: { furniture: 'crate', items: [
    { item: 'rechargeable_aa_battery', count: 1, charge: 0.25, placement: 'surface' },
    { item: 'flashlight', count: 1, charge: 0, placement: 'surface' },
  ] },
};
local foundation = [
  'GGGGGGGGGGGGGGGGGGGGGGG',
  'ppppppppppppppppppppGGG',
  'ptttttttttppppppppppGGG', 'ptttttttttppppppppppGGG',
  'ptttttttttppppppppppGGG', 'ptttttttttppppppppppGGG',
  'ptttttttttppppppppppGGG', 'ptttttttttppppppppppGGG',
  'ptttttttttppppppppppGGG', 'ptttttttttppppppppppGGG',
  'ptttttttttppppppppppGGG', 'ptttttttttppppppppppGGG',
  'ptttttttttppppppppppGGG', 'ptttttttttppppppppppGGG',
  'ppppppppppppppppppppGGG',
];
local lower = [
  '.......................',
  'ssssssssssssssssssss...',
  's.tttttt..a.pppppp.s...', 's.tttttt..a.pppppp.s...',
  's.........a.......Ws...', 's.........a.......Ws...',
  'sL........aL.......s...',
  '............H......s...', '...................s...',
  's.........a........s...',
  's....ppp..a....ffffs...', 's....ppp..a....ffffsss.',
  's.FF......a....ffffsss.', 's.FF..CC..a....ffffsss.',
  'ssssssssssssssssssss...',
];
local middle = [
  'RRRRRRRRRRBBBBBBBBBB...',
  'bbbbbbbbbbbbbbbbbbbb...',
  'b.tttttt..a..ppppp.b...', 'b.tttttt..a..ppppp.b...',
  'b.........a.......Wb...', 'b.........a.......Wb...',
  'bL........aL.......b...',
  '............H......b...', '...................b...',
  'b.........a........b...',
  'b....ppp..a........b...', 'b....ppp..a........bss.',
  'b.FF......a........bss.', 'b.FF..CC..a........bss.',
  'bbbbbbbbbbbbbbbbbbbb...',
];
local windowLower = [
  'RRRR..RRRRBBBBBBBBBB...',
  'bbbb..bbbbbbbbbbbbbb...',
  'b.........a...pppp.b...', 'b.........a...pppp.b...',
  'b.........a.......Wb...', 'b.........a.......Wb...',
  'bL........aL.......b...',
  '.......................', '.......................',
  'b.........a........b...',
  'b.........a........b...', 'b.........a........bss.',
  'b.FF......a........bss.', 'b.FF......a........bss.',
  'bbbb..bbbbbbbb..bbbb...',
];
local windowUpper = [
  'RRRR..RRRRBBBBBBBBBB...',
  'bbbb..bbbbbbbbbbbbbb...',
  'b.........a....ppp.b...', 'b.........a....ppp.b...',
  'b.........a.......Wb...', 'b.........a.......Wb...',
  'b.........a........b...',
  '.......................', '.......................',
  'b.........a........b...',
  'b.........a........b...', 'b.........a........bss.',
  'b.FF......a........bss.', 'b.FF......a........bss.',
  'bbbb..bbbbbbbb..bbbb...',
];
local upperLower = [
  'RRRRRRRRRRBBBBBBBBBB...',
  'bbbbbbbbbbbbbbbbbbbb...',
  'b.........a.....pp.b...', 'b.........a.....pp.b...',
  'b.........a........b...', 'b.........a........b...',
  'b.........a........b...', 'b.........a........b...',
  'b.........a........b...', 'b.........a........b...',
  'b.........a........b...', 'b.........a........bss.',
  'b.........a........bss.', 'b.........a........bss.',
  'bbbbbbbbbbbbbbbbbbbb...',
];
local upperUpper = [
  'RRRRRRRRRRBBBBBBBBBB...',
  'bbbbbbbbbbbbbbbbbbbb...',
  'b.........a......p.b...', 'b.........a......p.b...',
  'b.........a........b...', 'b.........a........b...',
  'b.........a........b...', 'b.........a........b...',
  'b.........a........b...', 'b.........a........b...',
  'b.........a........b...', 'b.........a........bss.',
  'b.........a........bss.', 'b.........a........bss.',
  'bbbbbbbbbbbbbbbbbbbb...',
];
local ceiling = [
  '.......................',
  'rrrrrrrrrrrrrrrrrrrr...',
  'rrrrrrrrrrrr......rr...', 'rrrrrrrrrrrr......rr...',
  'rrrrrrrrrrrrrrrrrrrr...', 'rrrrrrrrrrrrrrrrrrrr...',
  'rrrrrrrrrrrrrrrrrrrr...', 'rrrrrrrrrrrrrrrrrrrr...',
  'rrrrrrrrrrrrrrrrrrrr...', 'rrrrrrrrrrrrrrrrrrrr...',
  'rrrrrrrrrrrrrrrrrrrr...', 'rrrrrrrrrrrrrrrrrrrrss.',
  'rrrrrrrrrrrrrrrrrrrrss.', 'rrrrrrrrrrrrrrrrrrrrss.',
  'rrrrrrrrrrrrrrrrrrrr...',
];
local chimney = [
  '.......................', '.......................', '.......................',
  '.......................', '.......................', '.......................',
  '.......................', '.......................', '.......................',
  '.......................', '.......................', '....................ss.',
  '....................ss.', '....................ss.', '.......................',
];
local cap = [
  '.......................', '.......................', '.......................',
  '.......................', '.......................', '.......................',
  '.......................', '.......................', '.......................',
  '.......................', '...................dddd', '...................dddd',
  '...................dddd', '...................dddd', '...................dddd',
];
local templates = [
  {
    id: 'test_house_charging', size: [3, 3, 3],
    layers: [
      ['GGG', 'GGG', 'GGG'],
      ['...', 'KK.', 'KKX'],
      ['...', 'KK.', 'KK.'],
    ],
  },
  {
    id: 'test_house_home', size: [23, 11, 15],
    layers: [foundation, lower, middle, windowLower, windowUpper,
      upperLower, upperUpper, ceiling, chimney, chimney, cap],
  },
  {
    id: 'test_house_shed', size: [6, 8, 5],
    layers: [
      ['pppppp', 'pppppp', 'pppppp', 'pppppp', 'pppppp'],
      ['BBBBBB', 'BUUVJB', 'BUU..B', 'B....B', 'BB..BB'],
      ['BBBBBB', 'BUUVJB', 'BUU..B', 'B....B', 'BB..BB'],
      ['BBBBBB', 'B....B', 'B....B', 'B....B', 'BB..BB'],
      ['BBBBBB', 'B....B', 'B....B', 'B....B', 'BB..BB'],
      ['BBBBBB', 'B....B', 'B....B', 'B....B', 'BBBBBB'],
      ['gggggg', 'gggggg', 'gggggg', 'gggggg', 'gggggg'],
      ['......', '.SSSS.', '.SSSS.', '......', '......'],
    ],
  },
  {
    id: 'test_house_garden_wall', size: [32, 3, 1],
    layers: [
      ['GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG'],
      ['ssssssssssssssss..ssssssssssssss'],
      ['mmmmmmmmmmmmmmmh..hmmmmmmmmmmmmm'],
    ],
  },
  { id: 'test_house_path', size: [14, 1, 2], layers: [['ssssssssssssss', 'ssssssssssssss']] },
  { id: 'test_house_step', size: [2, 1, 4], layers: [['dd', 'dd', 'dd', 'dd']] },
  {
    id: 'test_house_outdoor_stock', size: [2, 3, 2],
    layers: [['GG', 'GG'], ['QQ', 'QQ'], ['QQ', 'QQ']],
  },
  {
    id: 'test_house_sign', size: [2, 4, 1],
    layers: [['GG'], ['NN'], ['NN'], ['NN']],
  },
  {
    id: 'test_house_loose_wardrobe', size: [2, 5, 1],
    layers: [['GG'], ['OO'], ['OO'], ['OO'], ['OO']],
  },
];
{
  templates: [
    local used = std.join('', std.flattenArrays(raw.layers));
    local template = raw + {
      palette: { [char]: palette[char] for char in std.objectFields(palette) if std.length(std.findSubstr(char, used)) > 0 },
      lootContext: context,
    };
    template + { ownership: kit.piece(template).ownership }
    for raw in templates
  ],
}
