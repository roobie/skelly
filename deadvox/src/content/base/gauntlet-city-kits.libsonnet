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
  'AAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAA', 'SSSSSSSSSSSSSSSSAA', 'S..............SAA',
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
  'AAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAA', 'SSSSSAASSAASSSSSAA', 'S..............SAA',
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
  'AAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAA', 'SSSSSAAAAAASSSSSAA', 'S..............SAA',
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
{
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
    room,
    room + {
      id: 'gauntlet_city_room_cupboards', palette: palette + { F: { furniture: 'kitchen_cupboard' } },
    },
    {
      id: 'gauntlet_city_roof', size: [18, 1, 16], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: [[
        'pppppppppppppppp..', 'pppppppppppppppp..', '################..', '#pppppppppppppp#..',
        '#pppppppppppppp#..', '#pppppppppppppp#..', '#pppppppppppppp#..', '#pppppppppppppp#..',
        '#pppppppppppppp#..', '#pppppppppppppp#..', '#pppppppppppppp#..', '#pppppppppppppp#..',
        '#pppppppppppppp#..', '#pppppppppppppp#..', '#pppppppppppppp#..', '################..',
      ]],
      ownership: { layers: [[
        'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA',
        'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA',
        'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA',
        'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA', 'SSSSSSSSSSSSSSSSAA',
      ]] },
      anchors: {}, ports: [],
    },
  ],
  mapAssemblies: [{
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
}
