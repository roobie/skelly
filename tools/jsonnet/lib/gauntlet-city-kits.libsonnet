local variants = import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-variants.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
local doors = import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-doors.libsonnet';
local palette = {
  '.': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'facade' },
  '=': { role: 'support', material: 'footing' },
  p: { role: 'interior_floor', material: 'floor' },
  D: { furniture: 'wood_door' },
  H: { furniture: 'ladder', facing: 'e' },
  P: { furniture: 'downspout', facing: 'e', fixed: true },
  Z: { spawn: 'shambler', chance: 0.8 },
};
// The roof drains to its open east eave, where the gutter runs either side of the ladder to a
// downspout down each corner of the east wall; every course a storey's walls or floor lays carries
// both pipes, so a house of any height drains to its footing.
local downspouts = [2, 15];
local piped(mark) = function(rows) [
  if std.member(downspouts, z) then std.substr(rows[z], 0, 16) + mark + std.substr(rows[z], 17, 1) else rows[z]
  for z in std.range(0, 15)
];
local footing = [
  '==================', '==================', '==================', '==================',
  '==================', '==================', '==================', '==================',
  '==================', '==================', '==================', '==================',
  '==================', '==================', '==================', '==================',
];
local solid = [
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
];
local doorWall = [
  '..................', '..................', '#######..#######..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#H.', '#..............#H.',
  '#..............#..', '#..............#..', '#..............#..', '################..',
];
local doorMask = [
  '..................', '..................', 'SSSSSSSSSSSSSSSSAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SSA', 'S..............SSA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'SSSSSSSSSSSSSSSSAA',
];
local doorWallMask = [
  '..................', '..................', 'SSSSSSS..SSSSSSSAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SSA', 'S..............SSA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'SSSSSSSSSSSSSSSSAA',
];
// Window bays are holes the shell leaves unclaimed, so each storey's window slots fill them.
local doorWindows = [
  '..................', '..................', '###...#..#...###..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#H.', '#..............#H.',
  '#..............#..', '#..............#..', '#..............#..', '#####......#####..',
];
local doorWindowMask = [
  '..................', '..................', 'SSS...S..S...SSSAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SSA', 'S..............SSA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'SSSSS......SSSSSAA',
];
local windows = [
  '..................', '..................', '###...####...###..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#H.', '#..............#H.',
  '#..............#..', '#..............#..', '#..............#..', '#####......#####..',
];
local windowClaims = [
  '..................', '..................', 'SSS...SSSS...SSSAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SSA', 'S..............SSA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'SSSSS......SSSSSAA',
];
local closed = [
  '..................', '..................', '################..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#H.', '#..............#H.',
  '#..............#..', '#..............#..', '#..............#..', '################..',
];
local lowerFloor = [
  'pppppppppppppp', 'pppppppppppppp', '...........ppp', '...........ppp',
  'pppppppppppppp', 'pppppppppppppp', 'pppppppppppppp', 'pppppppppppppp',
  'pppppppppppppp', 'pppppppppppppp', 'pppppppppppppp', 'pppppppppppppp',
];
local middleFloor = [
  'pppppppppppppp', 'pppppppppppppp', 'pppppppppppppp', 'pppppppppppppp',
  'pppppppppppppp', 'pppppppppppppp', 'pppppppppppppp', 'pppppppppppppp',
  '...........ppp', '...........ppp', 'pppppppppppppp', 'pppppppppppppp',
];
local lowerFloorClaims = [
  'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS', '...........SSS', '...........SSS',
  'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS',
];
local middleFloorClaims = [
  'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS',
  '...........SSS', '...........SSS', 'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS',
];
local slot = function(id, piece, at, size, turn=0) {
  id: id, at: at, size: size, turn: turn,
  choices: [{ ref: { kind: 'piece', id: piece }, weight: 1 }],
};
local casements = (import 'tools/jsonnet/lib/window-slots.libsonnet')(
  'gauntlet_city_window', { style: 'brick_townhouse', lootContext: context }, ['n', 's']);
// A storey's walls with a casement in each bay, so a house that swaps a storey's walls swaps its
// windows with them.
local shell = function(id, walls) {
  id: id, size: [18, 7, 16], lootContext: context,
  slots: [
    slot('walls', walls, [0, 0, 0], [18, 7, 16]),
    casements.slot('front_west', [3, 2, 2], 'n'),
    casements.slot('front_east', [10, 2, 2], 'n'),
    casements.slot('back_west', [5, 2, 15], 's'),
    casements.slot('back_east', [8, 2, 15], 's'),
  ],
  joins: [], ports: [], anchors: {},
};
local shellSlot = function(id, shellId, at) slot(id, shellId, at, [18, 7, 16]) + {
  choices: [{ ref: { kind: 'assembly', id: shellId }, weight: 1 }],
};
local scenes = (import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-scenes.libsonnet')(palette, context);
local services = import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-city-services.libsonnet';
local roomSlot = scenes.slot;
local lowerSlots = [
  slot('ground', 'gauntlet_city_ground', [0, 0, 0], [18, 1, 16]),
  shellSlot('shell', 'gauntlet_city_shell', [0, 1, 0]),
  doors.slot([7, 1, 2]),
  roomSlot('room', [1, 1, 3], 'lower'),
  slot('stairs', 'gauntlet_city_stairs_east', [1, 1, 5], [11, 8, 2]),
  slot('floor_shell', 'gauntlet_city_floor_shell', [0, 8, 0], [18, 1, 16]),
  slot('floor_inside', 'gauntlet_city_floor_lower', [1, 8, 3], [14, 1, 12]),
] + services.slots(1);
// The walls rise through the deck, so one covering course over both hides their tops. Over a
// townhouse shell, its roof ladder and downspouts rise through the deck course too, so the ladder's
// top stays a step below the covering, and the gutter lies beside the covering, clear of the ladder.
local roofDeck = function(id, covering, townhouse)
  local rung(z) = townhouse && (z == 10 || z == 11);
  local pipe(z) = townhouse && std.member(downspouts, z);
  local gutter(z) = townhouse && !rung(z);
  local street(z) = z < 2;
  local deckRow(z) = (if z == 2 || z == 15 then '################' else '#dddddddddddddd#')
                     + (if rung(z) then 'H.' else if pipe(z) then 'P.' else '..');
  local coverRow(z) = 'rrrrrrrrrrrrrrrr' + (if pipe(z) then 'O.' else if gutter(z) then 'G.' else '..');
  local claimRow(z, fitted) = if street(z) then 'AAAAAAAAAAAAAAAAAA' else 'SSSSSSSSSSSSSSSS' + (if fitted then 'SA' else 'AA');
  {
    id: id, size: [18, 2, 16], style: 'brick_townhouse',
    lootContext: context,
    palette: palette + {
      d: { role: 'interior_floor', material: 'roof_deck' },
      r: { role: 'roof', material: covering },
      G: { furniture: 'gutter', facing: 'e', fixed: true },
      O: { furniture: 'gutter_outlet', facing: 'e', fixed: true },
    },
    layers: [
      [if street(z) then '..................' else deckRow(z) for z in std.range(0, 15)],
      [if street(z) then '..................' else coverRow(z) for z in std.range(0, 15)],
    ],
    ownership: { layers: [
      [claimRow(z, rung(z) || pipe(z)) for z in std.range(0, 15)],
      [claimRow(z, gutter(z)) for z in std.range(0, 15)],
    ] },
    anchors: {}, ports: [],
  };
local kit = {
  scenes: scenes,
  services: services,
  loot: scenes.loot + services.loot,
  shells: [
    shell('gauntlet_city_shell', 'gauntlet_city_shell_walls'),
    shell('gauntlet_city_upper_shell', 'gauntlet_city_upper_shell_walls'),
  ],
  mapPieces: doors.mapPieces + scenes.mapPieces + services.mapPieces + casements.mapPieces + [
    {
      id: 'gauntlet_city_ground', size: [18, 1, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette, layers: [footing], ownership: { layers: [solid] },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_shell_walls', size: [18, 7, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: std.map(piped('P'), [doorWall, doorWall, doorWindows, doorWindows, windows, closed, closed]),
      ownership: { layers: std.map(piped('S'), [doorWallMask, doorWallMask, doorWindowMask, doorWindowMask, windowClaims, doorMask, doorMask]) },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_upper_shell_walls', size: [18, 7, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: std.map(piped('P'), [closed, closed, windows, windows, windows, closed, closed]),
      ownership: { layers: std.map(piped('S'), [doorMask, doorMask, windowClaims, windowClaims, windowClaims, doorMask, doorMask]) },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_floor_shell', size: [18, 1, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: [piped('P')(closed)], ownership: { layers: [piped('S')(doorMask)] },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_floor_lower', size: [14, 1, 12], style: 'brick_townhouse',
      lootContext: context, palette: palette, layers: [lowerFloor], ownership: { layers: [lowerFloorClaims] },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_floor_middle', size: [14, 1, 12], style: 'brick_townhouse',
      lootContext: context, palette: palette, layers: [middleFloor], ownership: { layers: [middleFloorClaims] },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_stairs_east', size: [11, 8, 2], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: [
        ['..ppppppppp', '..ppppppppp'], ['...pppppppp', '...pppppppp'],
        ['....ppppppp', '....ppppppp'], ['.....pppppp', '.....pppppp'],
        ['......ppppp', '......ppppp'], ['.......pppp', '.......pppp'],
        ['........ppp', '........ppp'], ['.........pp', '.........pp'],
      ],
      ownership: { layers: [
        ['RRSSSSSSSSS', 'RRSSSSSSSSS'], ['RRRSSSSSSSS', 'RRRSSSSSSSS'],
        ['RRRRSSSSSSS', 'RRRRSSSSSSS'], ['RRRRRSSSSSS', 'RRRRRSSSSSS'],
        ['RRRRRRSSSSS', 'RRRRRRSSSSS'], ['RRRRRRRSSSS', 'RRRRRRRSSSS'],
        ['RRRRRRRRSSS', 'RRRRRRRRSSS'], ['RRRRRRRRRSS', 'RRRRRRRRRSS'],
      ] },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_stairs_west', size: [11, 8, 2], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: [
        ['ppppppppp..', 'ppppppppp..'], ['pppppppp...', 'pppppppp...'],
        ['ppppppp....', 'ppppppp....'], ['pppppp.....', 'pppppp.....'],
        ['ppppp......', 'ppppp......'], ['pppp.......', 'pppp.......'],
        ['ppp........', 'ppp........'], ['pp.........', 'pp.........'],
      ],
      ownership: { layers: [
        ['SSSSSSSSSRR', 'SSSSSSSSSRR'], ['SSSSSSSSRRR', 'SSSSSSSSRRR'],
        ['SSSSSSSRRRR', 'SSSSSSSRRRR'], ['SSSSSSRRRRR', 'SSSSSSRRRRR'],
        ['SSSSSRRRRRR', 'SSSSSRRRRRR'], ['SSSSRRRRRRR', 'SSSSRRRRRRR'],
        ['SSSRRRRRRRR', 'SSSRRRRRRRR'], ['SSRRRRRRRRR', 'SSRRRRRRRRR'],
      ] },
      anchors: {}, ports: [],
    },
    roofDeck('gauntlet_city_roof_sheet', 'roofing_sheet', true),
    roofDeck('gauntlet_city_roof_slab', 'roofing_felt', true),
    roofDeck('gauntlet_city_store_roof_sheet', 'roofing_sheet', false),
    roofDeck('gauntlet_city_store_roof_slab', 'roofing_felt', false),
  ],
  mapAssemblies: [
    {
      id: 'gauntlet_city_2', size: [18, 18, 16], lootContext: context,
      slots: lowerSlots + [
        shellSlot('upper_shell', 'gauntlet_city_upper_shell', [0, 9, 0]),
        roomSlot('upper_room', [1, 9, 3], 'room'),
        slot('roof', 'gauntlet_city_roof_sheet', [0, 16, 0], [18, 2, 16]),
      ],
      joins: [], ports: [],
      anchors: services.anchors(1) + { entry: { kind: 'standing', at: [8, 1, 8] }, upper: { kind: 'standing', at: [11, 9, 6] } },
      access: { ground: 'floor_0', entrance: [8, 1, 8],
        storeys: [{ id: 'floor_0', floor: 1 }, { id: 'floor_1', floor: 9 }], stairs: [] },
    },
    {
      id: 'gauntlet_city_3', size: [18, 26, 16], lootContext: context,
      slots: lowerSlots + [
        shellSlot('middle_shell', 'gauntlet_city_upper_shell', [0, 9, 0]),
        roomSlot('middle_room', [1, 9, 3], 'middle'),
        slot('middle_stairs', 'gauntlet_city_stairs_west', [1, 9, 11], [11, 8, 2]),
        slot('middle_floor_shell', 'gauntlet_city_floor_shell', [0, 16, 0], [18, 1, 16]),
        slot('middle_floor_inside', 'gauntlet_city_floor_middle', [1, 16, 3], [14, 1, 12]),
        shellSlot('upper_shell', 'gauntlet_city_upper_shell', [0, 17, 0]),
        roomSlot('upper_room', [1, 17, 3], 'room'),
        slot('roof', 'gauntlet_city_roof_sheet', [0, 24, 0], [18, 2, 16]),
      ],
      joins: [], ports: [],
      anchors: services.anchors(1) + { entry: { kind: 'standing', at: [8, 1, 8] },
        middle: { kind: 'standing', at: [11, 9, 6] }, upper: { kind: 'standing', at: [2, 17, 12] } },
      access: { ground: 'floor_0', entrance: [8, 1, 8], storeys: [
        { id: 'floor_0', floor: 1 }, { id: 'floor_1', floor: 9 }, { id: 'floor_2', floor: 17 },
      ], stairs: [] },
    }, {
    id: 'gauntlet_city_1', size: [18, 10, 16], lootContext: context,
    slots: [
      { id: 'ground', at: [0, 0, 0], size: [18, 1, 16], turn: 0,
        choices: [{ ref: { kind: 'piece', id: 'gauntlet_city_ground' }, weight: 1 }] },
      shellSlot('shell', 'gauntlet_city_shell', [0, 1, 0]),
      doors.slot([7, 1, 2]),
      scenes.slot('room', [1, 1, 3], 'ground'),
      { id: 'roof', at: [0, 8, 0], size: [18, 2, 16], turn: 0,
        choices: [{ ref: { kind: 'piece', id: 'gauntlet_city_roof_sheet' }, weight: 1 }] },
    ] + services.slots(1),
    joins: [], ports: [],
    anchors: services.anchors(1) + { entry: { kind: 'standing', at: [8, 1, 8] } },
    access: { ground: 'floor_0', entrance: [8, 1, 8], storeys: [{ id: 'floor_0', floor: 1 }], stairs: [] },
  }],
};
variants(kit)
