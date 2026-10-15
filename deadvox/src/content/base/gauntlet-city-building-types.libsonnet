local residential = { usage: ['Residential'], tier: 'Tier1' };
local hunting = { usage: ['Hunting'], tier: 'Tier1' };
local industrial = { usage: ['Industrial'], tier: 'Tier1' };
local palette = {
  '.': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'facade' },
  T: { role: 'trim', material: 'sign' },
  D: { furniture: 'wood_door' },
};
local wall = [
  '..................', '..................', '#######DD#######..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '################..',
];
local shopWindows = [
  '..................', '..................', '###...#DD#...###..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '################..',
];
local policeWindows = [
  '..................', '..................', '###..##DD##..###..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '################..',
];
local fascia = [
  '..................', '..................', '#TTTTTTTTTTTTTT#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '################..',
];
local closed = [
  '..................', '..................', '################..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '################..',
];
local empty = [
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '..............',
];
local claim(layer, emptyClaim) = [
  std.join('', [if c == '.' then emptyClaim else 'S' for c in std.stringChars(row)])
  for row in layer
];
local shellClaim(layer) = [
  std.join('', [
    if z >= 3 && z <= 14 && x >= 1 && x <= 14 then '.'
    else if layer[z][x] == '.' then 'A' else 'S'
    for x in std.range(0, 17)
  ]) for z in std.range(0, 15)
];
local shell(id, style, context, windows) =
  local layers = [wall, wall, windows, windows, closed, fascia, closed]; {
  id: id, size: [18, 7, 16], style: style, lootContext: context, palette: palette,
  layers: layers,
  ownership: { layers: [shellClaim(layer) for layer in layers] },
  anchors: {}, ports: [],
};
local room(id, context, rows, tall, furnishings, upper=empty, style='brick_townhouse') =
  local layers = [rows, rows, tall, tall, upper, upper, empty]; {
  id: id, size: [14, 7, 12], style: style, lootContext: context,
  palette: { [key]: palette[key] for key in std.objectFields(palette) if key != 'T' } + furnishings,
  layers: layers,
  ownership: { layers: [claim(layer, 'R') for layer in layers] },
  anchors: {}, ports: [],
};
local policeRows = [
  '..............', '..............', '.CCC..........', '.CCC..........',
  '..............', '..............', '..............', '######DD######',
  '..............', '.GG.......AA..', '..........AA..', '..............',
];
local policeTall = [
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '######DD######',
  '..............', '.GG...........', '..............', '..............',
];
local policeUpper = [
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '##############',
  '..............', '..............', '..............', '..............',
];
local shopRows = [
  '..............', '..............', '.CC...........', '..............',
  '...SS....SS...', '...SS....SS...', '..............', '..............',
  '..............', '.GG.......AA..', '..........AA..', '..............',
];
local shopTall = [
  '..............', '..............', '..............', '..............',
  '...SS....SS...', '...SS....SS...', '..............', '..............',
  '..............', '.GG...........', '..............', '..............',
];
local stock = function(table) { furniture: 'shelf', loot: table };
local box = function(table) { furniture: 'crate', loot: table };
local slot(id, piece, at, size, turn=0) = {
  id: id, at: at, size: size, turn: turn,
  choices: [{ ref: { kind: 'piece', id: piece }, weight: 1 }],
};
local building(id, context, shellId, roomId) = {
  id: id, size: [18, 9, 16], lootContext: context,
  slots: [
    slot('ground', 'gauntlet_city_ground', [0, 0, 0], [18, 1, 16]),
    slot('front', shellId, [0, 1, 0], [18, 7, 16]),
    slot('stockroom', roomId, [1, 1, 3], [14, 7, 12]),
    slot('roof', 'gauntlet_city_roof', [0, 8, 0], [18, 1, 16]),
  ],
  joins: [], ports: [],
  anchors: { entry: { kind: 'standing', at: [8, 1, 6] }, stock: { kind: 'standing', at: [8, 1, 12] } },
  access: { ground: 'floor_0', entrance: [8, 1, 6], storeys: [{ id: 'floor_0', floor: 1 }], stairs: [] },
};
{
  mapStyles: [
    { id: 'gauntlet_police', bindings: {
      facade: { role: 'shell', block: 'brick' }, opening: { role: 'opening', block: 'air' },
      sign: { role: 'trim', block: 'siding_blue' },
    } },
    { id: 'gauntlet_food_shop', bindings: {
      facade: { role: 'shell', block: 'brick' }, opening: { role: 'opening', block: 'air' },
      sign: { role: 'trim', block: 'plaster' },
    } },
    { id: 'gauntlet_gun_shop', bindings: {
      facade: { role: 'shell', block: 'brick' }, opening: { role: 'opening', block: 'air' },
      sign: { role: 'trim', block: 'siding_red' },
    } },
    { id: 'gauntlet_hardware_shop', bindings: {
      facade: { role: 'shell', block: 'brick' }, opening: { role: 'opening', block: 'air' },
      sign: { role: 'trim', block: 'hazard_yellow' },
    } },
  ],
  mapPieces: [
    shell('gauntlet_police_front', 'gauntlet_police', hunting, policeWindows),
    shell('gauntlet_food_front', 'gauntlet_food_shop', residential, shopWindows),
    shell('gauntlet_gun_front', 'gauntlet_gun_shop', hunting, shopWindows),
    shell('gauntlet_hardware_front', 'gauntlet_hardware_shop', industrial, shopWindows),
    room('gauntlet_police_rooms', hunting, policeRows, policeTall, {
      C: { furniture: 'desk', loot: 'gauntlet_police_gear' },
      G: { furniture: 'range_rack', loot: 'gauntlet_civilian_guns' },
      A: box('gauntlet_ammunition'),
    }, policeUpper, 'gauntlet_police'),
    room('gauntlet_food_aisles', residential, shopRows, shopTall, {
      C: { furniture: 'counter', loot: 'gauntlet_food_stock' },
      S: stock('gauntlet_food_stock'), G: stock('gauntlet_food_stock'), A: box('gauntlet_food_stock'),
    }),
    room('gauntlet_gun_sales', hunting, shopRows, shopTall, {
      C: { furniture: 'counter', loot: 'gauntlet_police_gear' },
      S: stock('gauntlet_ammunition'), G: { furniture: 'range_rack', loot: 'gauntlet_civilian_guns' },
      A: box('gauntlet_ammunition'),
    }),
    room('gauntlet_hardware_aisles', industrial, shopRows, shopTall, {
      C: { furniture: 'counter', loot: 'hardware_store_stock' },
      S: stock('hardware_store_stock'), G: stock('hardware_store_stock'), A: box('hardware_store_stock'),
    }),
  ],
  mapAssemblies: [
    building('gauntlet_police_station', hunting, 'gauntlet_police_front', 'gauntlet_police_rooms'),
    building('gauntlet_food_store', residential, 'gauntlet_food_front', 'gauntlet_food_aisles'),
    building('gauntlet_gun_store', hunting, 'gauntlet_gun_front', 'gauntlet_gun_sales'),
    building('gauntlet_hardware_store', industrial, 'gauntlet_hardware_front', 'gauntlet_hardware_aisles'),
  ],
  loot: [
    { id: 'gauntlet_food_stock', rolls: [1, 3], entries: [
      { item: 'canned_beans', weight: 4 }, { item: 'canned_soup', weight: 3 },
      { item: 'crackers', weight: 3 }, { item: 'water_bottle', weight: 2 }, { nothing: true, weight: 4 },
    ] },
    { id: 'gauntlet_civilian_guns', rolls: [1, 1], entries: [
      { item: 'pump_shotgun', weight: 1, condition: [0.4, 0.8] }, { nothing: true, weight: 2 },
    ] },
    { id: 'gauntlet_ammunition', rolls: [1, 2], entries: [
      { item: 'shell_12_gauge_00_buck', weight: 3, count: [2, 5] },
      { item: 'shotshell_box', weight: 1 }, { nothing: true, weight: 4 },
    ] },
    { id: 'gauntlet_police_gear', rolls: [1, 2], entries: [
      { item: 'utility_vest', weight: 2, condition: [0.4, 0.8] },
      { item: 'flashlight', weight: 2 }, { item: 'portable_radio', weight: 1 },
      { item: 'bandage', weight: 1 }, { nothing: true, weight: 4 },
    ] },
  ],
}
