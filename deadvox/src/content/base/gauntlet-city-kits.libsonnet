local variants = import 'gauntlet-city-variants.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
local doors = import 'gauntlet-city-doors.libsonnet';
local palette = {
  '.': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'facade' },
  '=': { role: 'support', material: 'footing' },
  p: { role: 'interior_floor', material: 'floor' },
  D: { furniture: 'wood_door' },
  H: { furniture: 'ladder', facing: 'e' },
  Z: { spawn: 'shambler', chance: 0.8 },
};
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
local doorWindows = [
  '..................', '..................', '####..#..#..####..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#H.', '#..............#H.',
  '#..............#..', '#..............#..', '#..............#..', '#####......#####..',
];
local doorWindowMask = [
  '..................', '..................', 'SSSSAAS..SAASSSSAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SSA', 'S..............SSA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'SSSSSAAAAAASSSSSAA',
];
local windows = [
  '..................', '..................', '####..####..####..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#H.', '#..............#H.',
  '#..............#..', '#..............#..', '#..............#..', '#####......#####..',
];
local windowClaims = [
  '..................', '..................', 'SSSSAASSSSAASSSSAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SSA', 'S..............SSA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'SSSSSAAAAAASSSSSAA',
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
local scenes = (import 'gauntlet-city-scenes.libsonnet')(palette, context);
local roomSlot = scenes.slot;
local lowerSlots = [
  slot('ground', 'gauntlet_city_ground', [0, 0, 0], [18, 1, 16]),
  slot('shell', 'gauntlet_city_shell', [0, 1, 0], [18, 7, 16]),
  doors.slot([7, 1, 2]),
  roomSlot('room', [1, 1, 3], 'lower'),
  slot('stairs', 'gauntlet_city_stairs_east', [1, 1, 5], [11, 8, 2]),
  slot('floor_shell', 'gauntlet_city_floor_shell', [0, 8, 0], [18, 1, 16]),
  slot('floor_inside', 'gauntlet_city_floor_lower', [1, 8, 3], [14, 1, 12]),
];
local roofDeck = function(id, material) {
  id: id, size: [18, 1, 16], style: 'brick_townhouse',
  lootContext: context, palette: palette + { r: { role: 'interior_floor', material: material } },
  layers: [[
    '..................', '..................', '################..', '#rrrrrrrrrrrrrr#..',
    '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..',
    '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..',
    '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..', '################..',
  ]],
  ownership: { layers: [[
    'AAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA',
    'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA',
    'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA',
    'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA',
  ]] },
  anchors: {}, ports: [],
};
local kit = {
  scenes: scenes,
  furniture: doors.furniture,
  loot: scenes.loot,
  mapPieces: doors.mapPieces + scenes.mapPieces + [
    {
      id: 'gauntlet_city_ground', size: [18, 1, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette, layers: [footing], ownership: { layers: [solid] },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_shell', size: [18, 7, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: [doorWall, doorWall, doorWindows, doorWindows, windows, closed, closed],
      ownership: { layers: [doorWallMask, doorWallMask, doorWindowMask, doorWindowMask, windowClaims, doorMask, doorMask] },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_upper_shell', size: [18, 7, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: [closed, closed, windows, windows, windows, closed, closed],
      ownership: { layers: [doorMask, doorMask, windowClaims, windowClaims, windowClaims, doorMask, doorMask] },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_floor_shell', size: [18, 1, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette, layers: [closed], ownership: { layers: [doorMask] },
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
    roofDeck('gauntlet_city_roof_sheet', 'roofing_sheet'),
    roofDeck('gauntlet_city_roof_slab', 'roofing_slab'),
  ],
  mapAssemblies: [
    {
      id: 'gauntlet_city_2', size: [18, 17, 16], lootContext: context,
      slots: lowerSlots + [
        slot('upper_shell', 'gauntlet_city_upper_shell', [0, 9, 0], [18, 7, 16]),
        roomSlot('upper_room', [1, 9, 3], 'room'),
        slot('roof', 'gauntlet_city_roof_sheet', [0, 16, 0], [18, 1, 16]),
      ],
      joins: [], ports: [],
      anchors: { entry: { kind: 'standing', at: [8, 1, 8] }, upper: { kind: 'standing', at: [11, 9, 6] } },
      access: { ground: 'floor_0', entrance: [8, 1, 8],
        storeys: [{ id: 'floor_0', floor: 1 }, { id: 'floor_1', floor: 9 }], stairs: [] },
    },
    {
      id: 'gauntlet_city_3', size: [18, 25, 16], lootContext: context,
      slots: lowerSlots + [
        slot('middle_shell', 'gauntlet_city_upper_shell', [0, 9, 0], [18, 7, 16]),
        roomSlot('middle_room', [1, 9, 3], 'middle'),
        slot('middle_stairs', 'gauntlet_city_stairs_west', [1, 9, 11], [11, 8, 2]),
        slot('middle_floor_shell', 'gauntlet_city_floor_shell', [0, 16, 0], [18, 1, 16]),
        slot('middle_floor_inside', 'gauntlet_city_floor_middle', [1, 16, 3], [14, 1, 12]),
        slot('upper_shell', 'gauntlet_city_upper_shell', [0, 17, 0], [18, 7, 16]),
        roomSlot('upper_room', [1, 17, 3], 'room'),
        slot('roof', 'gauntlet_city_roof_sheet', [0, 24, 0], [18, 1, 16]),
      ],
      joins: [], ports: [],
      anchors: { entry: { kind: 'standing', at: [8, 1, 8] },
        middle: { kind: 'standing', at: [11, 9, 6] }, upper: { kind: 'standing', at: [2, 17, 12] } },
      access: { ground: 'floor_0', entrance: [8, 1, 8], storeys: [
        { id: 'floor_0', floor: 1 }, { id: 'floor_1', floor: 9 }, { id: 'floor_2', floor: 17 },
      ], stairs: [] },
    }, {
    id: 'gauntlet_city_1', size: [18, 9, 16], lootContext: context,
    slots: [
      { id: 'ground', at: [0, 0, 0], size: [18, 1, 16], turn: 0,
        choices: [{ ref: { kind: 'piece', id: 'gauntlet_city_ground' }, weight: 1 }] },
      { id: 'shell', at: [0, 1, 0], size: [18, 7, 16], turn: 0,
        choices: [{ ref: { kind: 'piece', id: 'gauntlet_city_shell' }, weight: 1 }] },
      doors.slot([7, 1, 2]),
      scenes.slot('room', [1, 1, 3], 'room'),
      { id: 'roof', at: [0, 8, 0], size: [18, 1, 16], turn: 0,
        choices: [{ ref: { kind: 'piece', id: 'gauntlet_city_roof_sheet' }, weight: 1 }] },
    ],
    joins: [], ports: [],
    anchors: { entry: { kind: 'standing', at: [8, 1, 8] } },
    access: { ground: 'floor_0', entrance: [8, 1, 8], storeys: [{ id: 'floor_0', floor: 1 }], stairs: [] },
  }],
};
variants(kit)
