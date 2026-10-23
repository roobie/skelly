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
  Q: { furniture: 'crate', loot: 'sample_note_loot' }, N: { furniture: 'sample_sign' },
  K: { furniture: 'crate', items: [
    { item: 'rechargeable_aa_battery', count: 1, charge: 0.25, placement: 'surface' },
    { item: 'flashlight', count: 1, charge: 0, placement: 'surface' },
  ] },
  k: 'concrete', w: { furniture: 'workbench', fixed: true }, n: { furniture: 'grinding_wheel', fixed: true },
  e: { furniture: 'shelf', facing: 's' }, E: { furniture: 'shelf', facing: 's' },
  o: { furniture: 'crate' }, O: { furniture: 'crate' },
};
// The garage is drawn from cell rules rather than literal rows: two wide bays share one open floor, so the door
// openings, the lintel and the furniture are each stated once. The back wall is z 0 and the doors open south.
local garage = {
  width: 30, depth: 17, wallTop: 7,
  doors: [[2, 9], [12, 19]], doorTop: 5,
  windows: [[4, 7], [14, 17], [23, 26]], windowRows: [4, 5],
  furniture: [
    { char: 'e', x: [15, 16], z: [1, 1], y: [1, 4] }, { char: 'E', x: [17, 18], z: [1, 1], y: [1, 4] },
    { char: 'e', x: [19, 20], z: [1, 1], y: [1, 4] },
    { char: 'w', x: [21, 23], z: [1, 2], y: [1, 2] }, { char: 'n', x: [25, 26], z: [1, 2], y: [1, 2] },
    { char: 'o', x: [21, 22], z: [5, 6], y: [1, 2] }, { char: 'O', x: [21, 22], z: [7, 8], y: [1, 2] },
  ],
};
local within(value, range) = value >= range[0] && value <= range[1];
local garageCell(x, y, z) =
  local wall = x == 0 || x == garage.width - 1 || z == 0 || z == garage.depth - 1;
  local door = z == garage.depth - 1 && std.length([d for d in garage.doors if within(x, d)]) > 0;
  local window = z == 0 && std.member(garage.windowRows, y) && std.length([w for w in garage.windows if within(x, w)]) > 0;
  local pieces = [p.char for p in garage.furniture if within(x, p.x) && within(z, p.z) && within(y, p.y)];
  if y == 0 then 'k'
  else if y > garage.wallTop then 'g'
  else if wall then (if door && y <= garage.doorTop || window then '.' else if door then 'd' else 'b')
  else if std.length(pieces) > 0 then pieces[0]
  else '.';
local garageLayers = [
  [std.join('', [garageCell(x, y, z) for x in std.range(0, garage.width - 1)]) for z in std.range(0, garage.depth - 1)]
  for y in std.range(0, garage.wallTop + 1)
];
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
  {
    id: 'test_house_garage', size: [garage.width, garage.wallTop + 2, garage.depth],
    layers: garageLayers,
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
