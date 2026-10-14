local decor = import 'gauntlet-city-decor.libsonnet';
local cellars = import 'gauntlet-city-cellars.libsonnet';
local yards = import 'gauntlet-city-yards.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
local palette = {
  '.': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'facade' },
  '=': { role: 'support', material: 'footing' },
  p: { role: 'interior_floor', material: 'floor' },
  D: { furniture: 'wood_door' },
  H: { furniture: 'ladder', facing: 'e' },
  F: { furniture: 'crate' },
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
  '..................', '..................', '#######DD#######..', '#..............#..',
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
local doorWindows = [
  '..................', '..................', '#####..DD..#####..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#H.', '#..............#H.',
  '#..............#..', '#..............#..', '#..............#..', '#####......#####..',
];
local doorWindowMask = [
  '..................', '..................', 'SSSSSAASSAASSSSSAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'S..............SAA',
  'S..............SAA', 'S..............SAA', 'S..............SSA', 'S..............SSA',
  'S..............SAA', 'S..............SAA', 'S..............SAA', 'SSSSSAAAAAASSSSSAA',
];
local windows = [
  '..................', '..................', '#####......#####..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#H.', '#..............#H.',
  '#..............#..', '#..............#..', '#..............#..', '#####......#####..',
];
local windowClaims = [
  '..................', '..................', 'SSSSSAAAAAASSSSSAA', 'S..............SAA',
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
local empty = [
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '..............',
];
local furnished = [
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '..............',
  '..............', '..............', 'FF..........Z.', 'FF............',
];
local furnishedUpper = [
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '..............',
  '..............', '..............', 'FF............', 'FF............',
];
local reserved = [
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'AARRRRRRRRRRRR', 'AARRRRRRRRRRRR',
];
local furnishedClaims = [
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'SSRRRRRRRRRRRR', 'SSRRRRRRRRRRRR',
];
local room = {
  id: 'gauntlet_city_room_crates', size: [14, 7, 12], style: 'brick_townhouse',
  lootContext: context, palette: palette,
  layers: [furnished, furnishedUpper, empty, empty, empty, empty, empty],
  ownership: { layers: [furnishedClaims, furnishedClaims, reserved, reserved, reserved, reserved, reserved] },
  anchors: {}, ports: [],
};
local lowerClaims = [
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', '...........RRR', '...........RRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'SSRRRRRRRRRRRR', 'SSRRRRRRRRRRRR',
];
local middleClaims = [
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR',
  '...........RRR', '...........RRR', 'SSRRRRRRRRRRRR', 'SSRRRRRRRRRRRR',
];
local lowerAir = [
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', '...........RRR', '...........RRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'AARRRRRRRRRRRR', 'AARRRRRRRRRRRR',
];
local middleAir = [
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR',
  '...........RRR', '...........RRR', 'AARRRRRRRRRRRR', 'AARRRRRRRRRRRR',
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
local roomSlot = function(id, at, level) {
  id: id, at: at, size: [14, 7, 12], turn: 0,
  choices: [
    { ref: { kind: 'piece', id: 'gauntlet_city_' + level + '_crates' }, weight: 1 },
    { ref: { kind: 'piece', id: 'gauntlet_city_' + level + '_cupboards' }, weight: 1 },
  ],
};
local lowerSlots = [
  slot('ground', 'gauntlet_city_ground', [0, 0, 0], [18, 1, 16]),
  slot('shell', 'gauntlet_city_shell', [0, 1, 0], [18, 7, 16]),
  roomSlot('room', [1, 1, 3], 'lower'),
  slot('stairs', 'gauntlet_city_stairs_east', [1, 1, 5], [11, 8, 2]),
  slot('floor_shell', 'gauntlet_city_floor_shell', [0, 8, 0], [18, 1, 16]),
  slot('floor_inside', 'gauntlet_city_floor_lower', [1, 8, 3], [14, 1, 12]),
];
local kit = {
  mapPieces: [
    {
      id: 'gauntlet_city_ground', size: [18, 1, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette, layers: [footing], ownership: { layers: [solid] },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_city_shell', size: [18, 7, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: [doorWall, doorWall, doorWindows, doorWindows, windows, closed, closed],
      ownership: { layers: [doorMask, doorMask, doorWindowMask, doorWindowMask, windowClaims, doorMask, doorMask] },
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
        ['.......pppp', '.......pppp'], ['.......pppp', '.......pppp'],
        ['........ppp', '........ppp'], ['.........pp', '.........pp'],
      ],
      ownership: { layers: [
        ['RRSSSSSSSSS', 'RRSSSSSSSSS'], ['RRRSSSSSSSS', 'RRRSSSSSSSS'],
        ['RRRRSSSSSSS', 'RRRRSSSSSSS'], ['RRRRRSSSSSS', 'RRRRRSSSSSS'],
        ['RRRRRRRSSSS', 'RRRRRRRSSSS'], ['RRRRRRRSSSS', 'RRRRRRRSSSS'],
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
    room + { id: 'gauntlet_city_lower_crates', ownership: {
      layers: [lowerClaims, lowerClaims, lowerAir, lowerAir, lowerAir, lowerAir, lowerAir],
    } },
    room + { id: 'gauntlet_city_lower_cupboards', palette: palette + { F: { furniture: 'kitchen_cupboard' } },
      ownership: { layers: [lowerClaims, lowerClaims, lowerAir, lowerAir, lowerAir, lowerAir, lowerAir] } },
    room + { id: 'gauntlet_city_middle_crates', ownership: {
      layers: [middleClaims, middleClaims, middleAir, middleAir, middleAir, middleAir, middleAir],
    } },
    room + { id: 'gauntlet_city_middle_cupboards', palette: palette + { F: { furniture: 'kitchen_cupboard' } },
      ownership: { layers: [middleClaims, middleClaims, middleAir, middleAir, middleAir, middleAir, middleAir] } },
    room,
    room + {
      id: 'gauntlet_city_room_cupboards', palette: palette + { F: { furniture: 'kitchen_cupboard' } },
    },
    {
      id: 'gauntlet_city_roof', size: [18, 1, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: [[
        '..................', '..................', '################..', '#pppppppppppppp#..',
        '#pppppppppppppp#..', '#pppppppppppppp#..', '#pppppppppppppp#..', '#pppppppppppppp#..',
        '#pppppppppppppp#..', '#pppppppppppppp#..', '#pppppppppppppp#..', '#pppppppppppppp#..',
        '#pppppppppppppp#..', '#pppppppppppppp#..', '#pppppppppppppp#..', '################..',
      ]],
      ownership: { layers: [[
        'AAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA',
        'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA',
        'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA',
        'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA',
      ]] },
      anchors: {}, ports: [],
    },
  ],
  mapAssemblies: [
    {
      id: 'gauntlet_city_2', size: [18, 17, 16], lootContext: context,
      slots: lowerSlots + [
        slot('upper_shell', 'gauntlet_city_upper_shell', [0, 9, 0], [18, 7, 16]),
        roomSlot('upper_room', [1, 9, 3], 'room'),
        slot('roof', 'gauntlet_city_roof', [0, 16, 0], [18, 1, 16]),
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
        slot('roof', 'gauntlet_city_roof', [0, 24, 0], [18, 1, 16]),
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
      { id: 'room', at: [1, 1, 3], size: [14, 7, 12], turn: 0,
        choices: [
          { ref: { kind: 'piece', id: 'gauntlet_city_room_crates' }, weight: 1 },
          { ref: { kind: 'piece', id: 'gauntlet_city_room_cupboards' }, weight: 1 },
        ] },
      { id: 'roof', at: [0, 8, 0], size: [18, 1, 16], turn: 0,
        choices: [{ ref: { kind: 'piece', id: 'gauntlet_city_roof' }, weight: 1 }] },
    ],
    joins: [], ports: [],
    anchors: { entry: { kind: 'standing', at: [8, 1, 8] } },
    access: { ground: 'floor_0', entrance: [8, 1, 8], storeys: [{ id: 'floor_0', floor: 1 }], stairs: [] },
  }],
};
local cellar = std.filter(function(building) building.id == 'gauntlet_city_2', kit.mapAssemblies)[0];
local buildings = kit.mapAssemblies + [cellar + {
  id: 'gauntlet_city_cellar',
  slots: [
    if part.id == 'shell' then part + { choices: [{ ref: { kind: 'piece', id: 'gauntlet_city_cellar_shell' }, weight: 1 }] }
    else if part.id == 'upper_shell' then part + { choices: [{ ref: { kind: 'piece', id: 'gauntlet_city_shell' }, weight: 1 }] }
    else if part.id == 'floor_shell' then part + { choices: [{ ref: { kind: 'piece', id: 'gauntlet_city_street_course' }, weight: 1 }] }
    else part
    for part in cellar.slots
  ],
  anchors: { entry: { kind: 'standing', at: [8, 9, 8] }, cellar: { kind: 'standing', at: [8, 1, 8] } },
  access: cellar.access + { ground: 'floor_1', entrance: [8, 9, 8] },
}];
local pieces = kit.mapPieces + cellars.mapPieces;
local facadePieces = ['gauntlet_city_shell', 'gauntlet_city_upper_shell', 'gauntlet_city_floor_shell', 'gauntlet_city_roof', 'gauntlet_city_cellar_shell', 'gauntlet_city_street_course'];
local ground = function(building) std.filter(function(storey) storey.id == building.access.ground, building.access.storeys)[0].floor;
local dressed = function(building, concrete) building + {
  id: building.id + (if concrete then '_concrete' else '_brick'),
  size: [building.size[0], building.size[1] + 4, building.size[2]],
  slots: [
    if part.id == 'roof' then part + {
      size: [18, 5, 16],
      choices: [{ ref: { kind: 'assembly', id: 'gauntlet_city_roof_fitted' + (if concrete then '_concrete' else '') }, weight: 1 }],
    } else if concrete then part + {
      choices: [choice + {
        ref: choice.ref + { id: choice.ref.id + (if std.member(facadePieces, choice.ref.id) then '_concrete' else '') },
      } for choice in part.choices],
    } else part
    for part in building.slots
  ] + [yards.slot + { at: [0, ground(building), 0] }],
  anchors: building.anchors + { street: { kind: 'standing', at: [8, ground(building), 1] } },
};
{
  furniture: decor.furniture + yards.furniture,
  mapPieces: pieces + [
    piece + { id: piece.id + '_concrete', style: 'concrete_townhouse' }
    for piece in pieces if std.member(facadePieces, piece.id)
  ] + decor.mapPieces + yards.mapPieces,
  mapAssemblies: decor.mapAssemblies + [
    dressed(building, concrete) for building in buildings for concrete in [false, true]
  ] + [
    building + {
      size: dressed(building, false).size,
      anchors: dressed(building, false).anchors,
      slots: [{ id: 'style', at: [0, 0, 0], size: dressed(building, false).size, turn: 0,
        choices: [
          { ref: { kind: 'assembly', id: building.id + '_brick' }, weight: 3 },
          { ref: { kind: 'assembly', id: building.id + '_concrete' }, weight: 1 },
        ] }],
    } for building in buildings
  ],
}
