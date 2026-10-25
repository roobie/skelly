local kit = import 'authored-site-kit.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
local palette = {
  '.': 'air', G: { ground: true }, s: 'stone', b: 'brick', p: 'planks', t: 'tiles',
  r: 'roof', a: 'plaster', B: 'siding_blue',
  g: 'galvanized', m: 'cobblestone_mossy', h: 'hazard_yellow', d: 'dressed_stone',
  U: { furniture: 'fuel_generator', fixed: true }, V: { furniture: 'storage_battery', fixed: true },
  J: { furniture: 'main_breaker', fixed: true }, S: { furniture: 'solar_panel', fixed: true },
  L: { furniture: 'electric_lamp', fixed: true }, X: { furniture: 'battery_charger', fixed: true },
  F: { furniture: 'fridge', fixed: true }, C: { furniture: 'kitchen_cupboard' },
  H: { furniture: 'chair' }, W: { furniture: 'wardrobe', facing: 'w' },
  D: { furniture: 'bed' }, T: { furniture: 'wood_stove', fixed: true },
  A: { furniture: 'sofa' },
  v: { furniture: 'shelf', facing: 's', items: [
    { item: 'sample_note', count: 1, placement: 'surface' },
    { item: 'field_manual', count: 1, placement: 'surface' },
  ] },
  Q: { furniture: 'crate', loot: 'sample_note_loot' }, N: { furniture: 'sample_sign' }, O: { furniture: 'wardrobe', facing: 'n' },
  K: { furniture: 'crate', items: [
    { item: 'rechargeable_aa_battery', count: 1, charge: 0.25, placement: 'surface' },
    { item: 'flashlight', count: 1, charge: 0, placement: 'surface' },
    { item: 'oil_lamp', count: 1, placement: 'surface' },
    { item: 'lamp_oil', count: 1, placement: 'surface' },
  ] },
  Z: { furniture: 'crate', items: [
    { item: 'sample_note', count: 1, placement: 'surface' },
    { item: 'regional_map', count: 1, placement: 'surface' },
    { item: 'flashlight', count: 1, charge: 1, placement: 'surface' },
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
// Kitchen north-west, bedroom north-east, lounge along the south window. The west entrance keeps the
// showroom route, and the timber flight keeps headroom through the terrace opening.
local foundation = [
  'GGGGGGGGGGGGGGGGGGGGGGG', 'ppppppppppppppppppppGGG',
  'ptttttttttppppppppppGGG', 'ptttttttttppppppppppGGG',
  'ptttttttttppppppppppGGG', 'ptttttttttppppppppppGGG',
  'ptttttttttppppppppppGGG', 'ptttttttttppppppppppGGG',
  'ppppppppppppppppppppGGG', 'ppppppppppppppppppppGGG',
  'ppppppppppppppppppppGGG', 'ppppppppppppppppppppGGG',
  'ppppppppppppppppppppGGG', 'ppppppppppppppppppppGGG',
  'ppppppppppppppppppppGGG',
];
local lower = [
  '.......................', 'bbbbbbbbbbbbbbbbbbbb...',
  'a.CC......a.pppppp.a...', 'a.........a.pppppp.a...',
  'a.FF......a........a...', 'a.FF......a....DD..a...',
  'aL........aL...DD.Wa...', '...............DD.Wa...',
  '...............DD..a...', 'aaaaaaa...a..aaaaaaa...',
  'a........H.........a...', 'a.vv...TT...AAAA...a...',
  'aL.....TT...AAAA...a...', 'a..................a...',
  'bbbbbbbbbbbbbbbbbbbb...',
];
local middle = [
  '.......................', 'bbbbbbbbbbbbbbbbbbbb...',
  'a.CC......a..ppppp.a...', 'a.........a..ppppp.a...',
  'a.FF......a........a...', 'a.FF......a........a...',
  'aL........aL......Wa...', '..................Wa...',
  '...................a...', 'aaaaaaa...a..aaaaaaa...',
  'a........H.........a...', 'a.vv...TT...AAAA...a...',
  'aL.....TT...AAAA...a...', 'a..................a...',
  'aa................aa...',
];
local windowLower = [
  '.......................', 'bbbb..bbbbbbbb..bbbb...',
  'a.........a...pppp.a...', 'a.........a...pppp.a...',
  'a.FF......a........a...', 'a.FF......a........a...',
  'aL........aL......Wa...', '..................Wa...',
  '...................a...', 'aaaaaaa...a..aaaaaaa...',
  'a..................a...', 'a.vv...TT..........a...',
  'aL.....TT..........a...', 'a..................a...',
  'aa................aa...',
];
local windowUpper = [
  '.......................', 'bbbb..bbbbbbbb..bbbb...',
  'a.........a....ppp.a...', 'a.........a....ppp.a...',
  'a.FF......a........a...', 'a.FF......a........a...',
  'a.........a.......Wa...', '..................Wa...',
  '...................a...', 'aaaaaaa...a..aaaaaaa...',
  'a..................a...', 'a.vv...g...........a...',
  'a..................a...', 'a..................a...',
  'aa................aa...',
];
local upperLower = [
  '.......................', 'bbbbbbbbbbbbbbbbbbbb...',
  'a.........a.....pp.a...', 'a.........a.....pp.a...',
  'a.........a........a...', 'a.........a........a...',
  'a.........a........a...', 'a..................a...',
  'a..................a...', 'aaaaaaa...a..aaaaaaa...',
  'a..................a...', 'a......g...........a...',
  'a..................a...', 'a..................a...',
  'aaaaaaaaaaaaaaaaaaaa...',
];
local upperUpper = [
  '.......................', 'bbbbbbbbbbbbbbbbbbbb...',
  'a.........a......p.a...', 'a.........a......p.a...',
  'a.........a........a...', 'a.........a........a...',
  'a.........a........a...', 'a..................a...',
  'a..................a...', 'aaaaaaa...a..aaaaaaa...',
  'a..................a...', 'a......g...........a...',
  'a..................a...', 'a..................a...',
  'aaaaaaaaaaaaaaaaaaaa...',
];
local ceiling = [
  '.......................', 'rrrrrrrrrrrrrrrrrrrr...',
  'rrrrrrrrrrrr......rr...', 'rrrrrrrrrrrr......rr...',
  'rrrrrrrrrrrrrrrrrrrr...', 'rrrrrrrrrrrrrrrrrrrr...',
  'rrrrrrrrrrrrrrrrrrrr...', 'rrrrrrrrrrrrrrrrrrrr...',
  'rrrrrrrrrrrrrrrrrrrr...', 'rrrrrrrrrrrrrrrrrrrr...',
  'rrrrrrrrrrrrrrrrrrrr...', 'rrrrrrrgrrrrrrrrrrrr...',
  'rrrrrrrrrrrrrrrrrrrr...', 'rrrrrrrrrrrrrrrrrrrr...',
  'rrrrrrrrrrrrrrrrrrrr...',
];
local terrace = [
  '.......................', 'pppppppppppppppppppp...',
  'p..................p...', 'p..................p...',
  'p..................p...', 'p..................p...',
  'p..................p...', 'p..................p...',
  'p..................p...', 'p..................p...',
  'p..................p...', 'p......g...........p...',
  'p..................p...', 'p..................p...',
  'pppppppppppppppppppp...',
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
    id: 'test_house_home', size: [23, 9, 15],
    layers: [foundation, lower, middle, windowLower, windowUpper,
      upperLower, upperUpper, ceiling, terrace],
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
      ['sssssssssssssssh..hsssssssssssss'],
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
  { id: 'test_house_path', size: [14, 1, 2], layers: [['dddddddddddddd', 'dddddddddddddd']] },
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
    // Reading needs light, so the papers and the lamp wait at the end of a windowless zigzag that no sky reaches.
    id: 'test_house_reading_booth', size: [8, 7, 12],
    local maze = ['bbbbb..b', 'b......b', 'b......b', 'b..bbbbb', 'b......b', 'b......b', 'bbbbb..b', 'b......b', 'b......b'],
    local walls = maze + ['b......b', 'b......b', 'bbbbbbbb'],
    local crates = maze + ['b.ZZ...b', 'b.ZZ...b', 'bbbbbbbb'],
    layers: [
      ['kkkkkkkk' for _ in std.range(1, 12)],
      crates, crates, walls, walls, walls,
      ['bbbbbbbb' for _ in std.range(1, 12)],
    ],
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
