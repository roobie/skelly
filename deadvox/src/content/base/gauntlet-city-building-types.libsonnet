local police = import 'gauntlet-police.libsonnet';
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
local put(layer, z, x, text) = [
  if i == z
  then std.substr(layer[i], 0, x) + text + std.substr(layer[i], x + std.length(text), std.length(layer[i]))
  else layer[i]
  for i in std.range(0, std.length(layer) - 1)
];
// A shop front is a two-row sign band over the door plus type props in the yard rows (z < 2) in
// front of it; `fronts` holds [layer, z, x, text] overlays and `extra` the props' palette entries.
local shell(id, style, context, windows, extra={}, fronts=[]) =
  local base = [wall, wall, windows, windows, fascia, fascia, closed];
  local layers = [
    std.foldl(function(layer, f) if f[0] == y then put(layer, f[1], f[2], f[3]) else layer, fronts, base[y])
    for y in std.range(0, 6)
  ]; {
  id: id, size: [18, 7, 16], style: style, lootContext: context,
  palette: palette + { [key]: { role: 'trim', material: extra[key] } for key in std.objectFields(extra) },
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
  eligibility: { settlementKinds: ['city'] },
  id: id, size: [18, 9, 16], lootContext: context,
  slots: [
    slot('ground', 'gauntlet_city_ground', [0, 0, 0], [18, 1, 16]),
    slot('front', shellId, [0, 1, 0], [18, 7, 16]),
    slot('stockroom', roomId, [1, 1, 3], [14, 7, 12]),
    slot('roof', 'gauntlet_city_roof_sheet', [0, 8, 0], [18, 1, 16]) + {
      choices: [
        { ref: { kind: 'piece', id: 'gauntlet_city_roof_sheet' }, weight: 3 },
        { ref: { kind: 'piece', id: 'gauntlet_city_roof_slab' }, weight: 2 },
      ],
    },
  ],
  joins: [], ports: [],
  anchors: { entry: { kind: 'standing', at: [8, 1, 6] }, stock: { kind: 'standing', at: [8, 1, 12] } },
  access: { ground: 'floor_0', entrance: [8, 1, 6], storeys: [{ id: 'floor_0', floor: 1 }], stairs: [] },
};
local stoneSteps = { player: 'footstep_stone', shambler: 'shambler_step_stone' };
local signBlock(id, name, color, extra={}) =
  { id: id, name: name, color: color, solid: true, footsteps: stoneSteps, weatherable: false } + extra;
local frontStyle(id, bindings) = { id: id, bindings: {
  facade: { role: 'shell', block: 'brick' }, opening: { role: 'opening', block: 'air' },
} + bindings };
local yard(block) = { role: 'trim', block: block };
{
  items: police.items,
  furniture: police.furniture,
  blocks: [
    signBlock('shop_blue', 'Shop paint (police blue)', '#2a5ad6'),
    signBlock('shop_green', 'Shop paint (grocer green)', '#3f9e4a'),
    signBlock('shop_orange', 'Shop paint (gun-shop orange)', '#e07b1a'),
    signBlock('shop_yellow', 'Shop paint (hardware yellow)', '#f2c200'),
    signBlock('shop_red', 'Shop paint (medical red)', '#d0312d'),
    signBlock('shop_white', 'Shop paint (awning white)', '#f0ede4'),
    signBlock('shop_produce', 'Produce crates', '#a8c840'),
    signBlock('shop_grille', 'Shopfront grille', '#2b2d30', { opaque: false }),
  ],
  mapStyles: [
    frontStyle('gauntlet_food_shop', {
      sign: yard('shop_green'), awning_a: yard('shop_green'), awning_b: yard('shop_white'),
      produce: yard('shop_produce'),
    }),
    frontStyle('gauntlet_gun_shop', { sign: yard('shop_orange'), grille: yard('shop_grille'), bags: yard('sandbag') }),
    frontStyle('gauntlet_hardware_shop', {
      sign: yard('shop_yellow'), pipes: yard('galvanized'), lumber: yard('planks'),
    }),
  ],
  mapPieces: [
    shell('gauntlet_food_front', 'gauntlet_food_shop', residential, shopWindows, { a: 'awning_a', b: 'awning_b', p: 'produce' }, [
      [4, 0, 1, 'ababababababab'], [4, 1, 1, 'ababababababab'],
      [0, 1, 2, 'pp'], [0, 1, 12, 'pp'], [1, 1, 2, 'p'], [1, 1, 13, 'p'],
    ]),
    shell('gauntlet_gun_front', 'gauntlet_gun_shop', hunting, shopWindows, { k: 'grille', s: 'bags' }, [
      [2, 2, 0, '###kkk#DD#kkk###'], [3, 2, 0, '###kkk#DD#kkk###'],
      [0, 1, 1, 'sssss'], [0, 1, 12, 'sssss'], [1, 1, 1, 'ss'], [1, 1, 15, 'ss'],
    ]),
    shell('gauntlet_hardware_front', 'gauntlet_hardware_shop', industrial, shopWindows, { q: 'pipes', p: 'lumber' }, [
      [0, 1, 2, 'qq'], [1, 1, 2, 'qq'], [2, 1, 2, 'qq'],
      [0, 1, 12, 'pppp'], [1, 1, 12, 'pppp'],
    ]),
    room('gauntlet_food_aisles', residential, shopRows, shopTall, {
      C: { furniture: 'counter', fixed: true, loot: 'gauntlet_food_stock' },
      S: stock('gauntlet_food_stock'), G: stock('gauntlet_food_stock'), A: box('gauntlet_food_stock'),
    }),
    room('gauntlet_gun_sales', hunting, shopRows, shopTall, {
      C: { furniture: 'counter', fixed: true, loot: 'equipment_locker' },
      S: stock('gauntlet_ammunition'), G: { furniture: 'range_rack', loot: 'gauntlet_civilian_guns' },
      A: box('gauntlet_ammunition'),
    }),
    room('gauntlet_hardware_aisles', industrial, shopRows, shopTall, {
      C: { furniture: 'counter', fixed: true, loot: 'hardware_store_stock' },
      S: stock('hardware_store_stock'), G: stock('hardware_store_stock'), A: box('hardware_store_stock'),
    }),
  ],
  mapAssemblies: [
    building('gauntlet_food_store', residential, 'gauntlet_food_front', 'gauntlet_food_aisles'),
    building('gauntlet_gun_store', hunting, 'gauntlet_gun_front', 'gauntlet_gun_sales'),
    building('gauntlet_hardware_store', industrial, 'gauntlet_hardware_front', 'gauntlet_hardware_aisles'),
  ],
  loot: police.loot + [
    { id: 'gauntlet_food_stock', rolls: [1, 3], entries: [
      { item: 'canned_beans', weight: 4 }, { item: 'canned_soup', weight: 3 },
      { item: 'crackers', weight: 3 }, { item: 'water_bottle', weight: 2 }, { nothing: true, weight: 4 },
    ] },
    { id: 'gauntlet_civilian_guns', rolls: [1, 1], entries: [
      { item: 'pump_shotgun', weight: 1, condition: [0.4, 0.8] },
      { item: 'revolver_357', weight: 1, condition: [0.4, 0.8] }, { nothing: true, weight: 2 },
    ] },
    { id: 'gauntlet_ammunition', rolls: [1, 2], entries: [
      { item: 'cartridge_357_h_magnum', weight: 2, count: [2, 6] },
      { item: 'cartridge_box_357_h_magnum', weight: 1 },
      { item: 'shell_12_gauge_00_buck', weight: 3, count: [2, 5] },
      { item: 'shotshell_box', weight: 1 }, { nothing: true, weight: 4 },
    ] },
    // Armed-stock role tables, shared by the station, the HQ and the armed rooms: each source's
    // context decides which rows it admits, so the station never rolls the rifle rows the HQ does.
    { id: 'armoury_arms', rolls: [1, 1], entries: [
      { item: 'revolver_357', weight: 2, condition: [0.5, 0.9] },
      { item: 'pump_shotgun', weight: 1, condition: [0.5, 0.9] },
      { item: 'rifle_assault', weight: 1, condition: [0.5, 0.9] },
      { item: 'rifle_ak', weight: 1, condition: [0.5, 0.9] }, { nothing: true, weight: 1 },
    ] },
    { id: 'armoury_ammunition', rolls: [1, 2], entries: [
      { item: 'cartridge_357_h_magnum', weight: 3, count: [3, 12] },
      { item: 'cartridge_box_357_h_magnum', weight: 2 },
      { item: 'shotshell_box', weight: 1 },
      { item: 'cartridge_5_d_56x45', weight: 2, count: [5, 20] },
      { item: 'cartridge_box_5_d_56x45', weight: 1 },
      { item: 'cartridge_7_d_62x39', weight: 2, count: [5, 20] },
      { item: 'cartridge_box_7_d_62x39', weight: 1 }, { nothing: true, weight: 2 },
    ] },
    { id: 'armoury_cabinet', rolls: [2, 3], entries: [
      { table: 'armoury_arms', weight: 1 }, { table: 'armoury_ammunition', weight: 2 },
    ] },
    { id: 'equipment_locker', rolls: [1, 2], entries: [
      { item: 'utility_vest', weight: 2, condition: [0.4, 0.8] },
      { item: 'flashlight', weight: 2 }, { item: 'portable_radio', weight: 1 },
      { item: 'bandage', weight: 1 }, { nothing: true, weight: 4 },
    ] },
  ],
}
