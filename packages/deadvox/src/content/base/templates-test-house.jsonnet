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
  k: 'concrete', w: { furniture: 'workbench', fixed: true }, n: { furniture: 'grinding_wheel', fixed: true },
  e: { furniture: 'shelf', facing: 's' }, E: { furniture: 'shelf', facing: 's' },
  o: { furniture: 'crate' }, q: { furniture: 'crate' },
  // The engine hoist never spawns as loot, so it stands on the floor by the bays by placement.
  j: { groundLoot: { kind: 'fixed', items: [{ item: 'engine_hoist' }] } },
  I: { furniture: 'gauntlet_lab_fixture', fixed: true }, Y: { furniture: 'ladder', facing: 'w' },
};
// The garage's back wall is z 0 and its two bay doors open south onto one shared floor, kept clear for driving
// out; the repair stock stands along the back wall and the crates beside the east bay. Strip lights hang under
// the roof over both bays and the bench, on the house supply, and a ladder climbs the doorless west wall.
local garageFloor = [
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
];
local garageStock = [
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'b..............eeEEeewww.nn..b', 'b....................www.nn..b',
  'b............................b', 'b............................b',
  'b....................oo......b', 'b....................oo......b',
  'b....................qq......b', 'b....................qq......b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b',
  'bb........bb........bbbbbbbbbb',
];
// The floor storey of the stock layers, with the hoist standing between the bays and the shelves. Ground loot needs
// the floor under it, so the storey above carries no mark.
local garageStockFloor = [
  if i == 4 then 'b...........j................b' else garageStock[i]
  for i in std.range(0, std.length(garageStock) - 1)
];
local garageShelves = [
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'b..............eeEEee........b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b',
  'bb........bb........bbbbbbbbbb',
];
local garageShelfWindows = [
  'bbbb....bbbbbb....bbbbb....bbb',
  'b..............eeEEee........b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b',
  'bb........bb........bbbbbbbbbb',
];
local garageWindows = [
  'bbbb....bbbbbb....bbbbb....bbb',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b',
  'bb........bb........bbbbbbbbbb',
];
local garageLintel = [
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b',
  'bbddddddddbbddddddddbbbbbbbbbb',
];
local garageLights = [
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'b............................b', 'b............................b',
  'b............................b', 'b......................II....b',
  'b....II........II............b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b', 'b............................b',
  'b....II........II............b', 'b............................b',
  'b............................b', 'b............................b',
  'b............................b',
  'bbddddddddbbddddddddbbbbbbbbbb',
];
local garageRoof = [
  'gggggggggggggggggggggggggggggg', 'gggggggggggggggggggggggggggggg', 'gggggggggggggggggggggggggggggg',
  'gggggggggggggggggggggggggggggg', 'gggggggggggggggggggggggggggggg', 'gggggggggggggggggggggggggggggg',
  'gggggggggggggggggggggggggggggg', 'gggggggggggggggggggggggggggggg', 'gggggggggggggggggggggggggggggg',
  'gggggggggggggggggggggggggggggg', 'gggggggggggggggggggggggggggggg', 'gggggggggggggggggggggggggggggg',
  'gggggggggggggggggggggggggggggg', 'gggggggggggggggggggggggggggggg', 'gggggggggggggggggggggggggggggg',
  'gggggggggggggggggggggggggggggg', 'gggggggggggggggggggggggggggggg',
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
// The showroom pavilion: an open-sided timber deck under a roof. The layout's slot row stands on the deck and the
// default spawn in front of it, beside the charging corner's crates and charger (`docs/test-house.md`, "Normal and debug
// additions"). The spawn's row runs east off the deck along the path to the house door, and the deck's south-east stays
// open toward the garden gate.
local pavilionPosts = [
  'p......p.......p', '................', '................', '................', '................',
  '................', '................', '................', '................', 'p......p.......p',
];
local pavilionCharging(charger) = [
  'p......p.......p', '................', '.............KK.', '.............KK' + charger, '................',
  '................', '................', '................', '................', 'p......p.......p',
];
local pavilionSolidRows(block) = [std.join('', [block for _ in std.range(1, 16)]) for _ in std.range(1, 10)];
local templates = [
  {
    id: 'test_house_showroom', size: [16, 9, 10],
    layers: [pavilionSolidRows('d'), pavilionSolidRows('p'), pavilionCharging('X'), pavilionCharging('.'),
      pavilionPosts, pavilionPosts, pavilionPosts, pavilionPosts, pavilionSolidRows('r')],
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
    id: 'test_house_garage', size: [30, 9, 17],
    layers: [garageFloor, garageStockFloor, garageStock, garageShelves, garageShelfWindows,
      garageWindows, garageLintel, garageLights, garageRoof],
  },
  {
    // Against the garage's west wall, up to its roof layer, so the climb ends with the feet on the roof.
    id: 'test_house_garage_ladder', size: [1, 9, 2],
    layers: [['k', 'k'], ['Y', 'Y'], ['Y', 'Y'], ['Y', 'Y'], ['Y', 'Y'], ['Y', 'Y'], ['Y', 'Y'], ['Y', 'Y'], ['Y', 'Y']],
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
