local kits = import 'gauntlet-city-kits.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
local storeys = [1, 9, 17, 25, 33];
local roofY = 40;
local palette = {
  '.': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'facade' },
  '=': { role: 'support', material: 'footing' },
  r: { role: 'interior_floor', material: 'roofing_slab' },
  H: { furniture: 'ladder', facing: 'e' },
  T: { furniture: 'gauntlet_start_hatch' },
};
local slot = function(id, piece, at, size) {
  id: id, at: at, size: size, turn: 0,
  choices: [{ ref: { kind: 'piece', id: piece }, weight: 1 }],
};
local ground = [
  '=========================', '=========================', '=========================', '=========================',
  '=========================', '=========================', '=========================', '=========================',
  '=========================', '=========================', '=========================', '=========================',
  '=========================', '=========================', '=========================', '=========================',
];
local groundClaims = [
  'SSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSS',
];
local shell = [
  '..................', '..................', '#######..#######..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '################..',
];
local shellClaims = [
  'RRRRRRRRRRRRRRRR..', 'RRRRRRRRRRRRRRRR..', 'SSSSSSS..SSSSSSS..', 'S..............S..',
  'S..............S..', 'S..............S..', 'S..............S..', 'S..............S..',
  'S..............S..', 'S..............S..', 'S..............S..', 'S..............S..',
  'S..............S..', 'S..............S..', 'S..............S..', 'SSSSSSSSSSSSSSSS..',
];
local lintel = [
  '..................', '..................', '################..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '#..............#..',
  '#..............#..', '#..............#..', '#..............#..', '################..',
];
local lintelClaims = [
  'RRRRRRRRRRRRRRRR..', 'RRRRRRRRRRRRRRRR..', 'SSSSSSSSSSSSSSSS..', 'S..............S..',
  'S..............S..', 'S..............S..', 'S..............S..', 'S..............S..',
  'S..............S..', 'S..............S..', 'S..............S..', 'S..............S..',
  'S..............S..', 'S..............S..', 'S..............S..', 'SSSSSSSSSSSSSSSS..',
];
local roof = [
  '..................', '..................', '################..', '#rrrrrrrrrrrrrr#..',
  '#rrrrrrrrrrrrrr#..', '#rrr........rrr#..', '#rrr........rrr#..', '#rrrrrrrrrrrrrr#..',
  '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..',
  '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..', '################..',
];
local roofClaims = [
  'RRRRRRRRRRRRRRRR..', 'RRRRRRRRRRRRRRRR..', 'SSSSSSSSSSSSSSSS..', 'SSSSSSSSSSSSSSSS..',
  'SSSSSSSSSSSSSSSS..', 'SSSS........SSSS..', 'SSSS........SSSS..', 'SSSSSSSSSSSSSSSS..',
  'SSSSSSSSSSSSSSSS..', 'SSSSSSSSSSSSSSSS..', 'SSSSSSSSSSSSSSSS..', 'SSSSSSSSSSSSSSSS..',
  'SSSSSSSSSSSSSSSS..', 'SSSSSSSSSSSSSSSS..', 'SSSSSSSSSSSSSSSS..', 'SSSSSSSSSSSSSSSS..',
];
local cap = [
  '...................', '...................', '...................', '...................',
  '...................', '...................', '...................', '...................',
  '...................', '...................', '...................', '...................',
  '...................', '...................', '...................', '...................',
];
local capClaims = [
  'RRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRR',
];
local roomAir = [
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '..............',
];
local roomClaims = [
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', '...........RRR', '...........RRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', '...........RRR', '...........RRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR',
];
local corridor = ['...........', '...........'];
local corridorClaims = ['RRRRRRRRRRR', 'RRRRRRRRRRR'];
local rearRoof = roof[:5] + ['#rrrrrrrrrrrrrr#..', '#rrrrrrrrrrrrrr#..'] + roof[7:9] + ['#rrr........rrr#..', '#rrr........rrr#..'] + roof[11:];
local rearClaims = roofClaims[:5] + ['SSSSSSSSSSSSSSSS..', 'SSSSSSSSSSSSSSSS..'] + roofClaims[7:9] + ['SSSS........SSSS..', 'SSSS........SSSS..'] + roofClaims[11:];
local leftAir = [
  '......', '......', '......', '......', '......', '......', '......', '......',
  '......', '......', '......', '......', '......', '......', '......', '......',
];
local leftClaims = [
  'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR',
  'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR',
];
local marginGround = ['==', '==', '==', '==', '==', '==', '==', '==', '==', '==', '==', '==', '==', '==', '==', '=='];
local marginSolid = ['SS', 'SS', 'SS', 'SS', 'SS', 'SS', 'SS', 'SS', 'SS', 'SS', 'SS', 'SS', 'SS', 'SS', 'SS', 'SS'];
local marginAir = ['..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..'];
local marginReserved = ['RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR'];
local shaft = ['...', '.H.', '.H.', '...'];
local shaftClaims = ['RRR', 'RSR', 'RSR', 'RRR'];
local piece = function(id, size, layers, claims) {
  id: id, size: size, style: 'brick_townhouse', lootContext: context,
  palette: palette, layers: layers, ownership: { layers: claims }, anchors: {}, ports: [],
};
local roofDeck = std.filter(function(p) p.id == 'gauntlet_city_roof_slab', kits.mapPieces)[0];
local stairs = std.filter(function(p) p.id == 'gauntlet_city_stairs_east', kits.mapPieces)[0];
{
  start: {
    template: 'gauntlet_start', cell: [0, 0], spawn: [14, roofY + 1, 11], minimumOpenDescents: 2,
    descents: [
      { kind: 'ladder', ladder: [23, 1, 10], upper: [20, roofY + 1, 11], lower: [25, 1, 11] },
      { kind: 'stairs', hatch: [10, roofY, 5], upper: [18, roofY + 1, 6], lower: [14, 1, 1] },
      { kind: 'drop', upper: [6, roofY + 1, 8], edge: [5, roofY + 1, 8], landing: [5, 3, 8], lower: [5, 1, 14] },
    ],
  },
  furniture: [{
    id: 'gauntlet_start_hatch', name: 'Roof hatch', size: [6, 1, 2], color: '#8d969a',
    door: { handlingSimSeconds: 0.8, hatch: true },
  }],
  mapPieces: [
    piece('gauntlet_start_ground', [25, 1, 16], [ground], [groundClaims]),
    piece('gauntlet_start_margin', [2, 13, 16],
      [marginGround, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir],
      [marginSolid, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved]),
    piece('gauntlet_start_margin_air', [2, 8, 16],
      [marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir],
      [marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved]),
    piece('gauntlet_start_shell', [18, 7, 16],
      [shell, shell, shell, shell, lintel, lintel, lintel],
      [shellClaims, shellClaims, shellClaims, shellClaims, lintelClaims, lintelClaims, lintelClaims]),
    roofDeck + { id: 'gauntlet_start_roof', layers: [roof], ownership: { layers: [roofClaims] } },
    roofDeck + { id: 'gauntlet_start_floor_rear', layers: [rearRoof], ownership: { layers: [rearClaims] } },
    piece('gauntlet_start_stair_opening', [6, 1, 2], [['......', '......']], [['RRRRRR', 'RRRRRR']]),
    piece('gauntlet_start_room_air', [14, 7, 12],
      [roomAir, roomAir, roomAir, roomAir, roomAir, roomAir, roomAir],
      [roomClaims, roomClaims, roomClaims, roomClaims, roomClaims, roomClaims, roomClaims]),
    piece('gauntlet_start_corridor_air', [11, 7, 2],
      [corridor, corridor, corridor, corridor, corridor, corridor, corridor],
      [corridorClaims, corridorClaims, corridorClaims, corridorClaims, corridorClaims, corridorClaims, corridorClaims]),
    piece('gauntlet_start_awning_top_air', [6, 2, 16], [leftAir, leftAir], [leftClaims, leftClaims]),
    stairs + { id: 'gauntlet_start_stairs', ownership: { layers: stairs.ownership.layers[:7] + [['.........SS', '.........SS']] } },
    piece('gauntlet_start_roof_air', [19, 4, 16], [cap, cap, cap, cap], [capClaims, capClaims, capClaims, capClaims]),
    piece('gauntlet_start_awning_air', [6, 10, 16],
      [leftAir, leftAir, leftAir, leftAir, leftAir, leftAir, leftAir, leftAir, leftAir, leftAir],
      [leftClaims, leftClaims, leftClaims, leftClaims, leftClaims, leftClaims, leftClaims, leftClaims, leftClaims, leftClaims]),
    piece('gauntlet_start_ladder', [3, 8, 4],
      [shaft, shaft, shaft, shaft, shaft, shaft, shaft, shaft],
      [shaftClaims, shaftClaims, shaftClaims, shaftClaims, shaftClaims, shaftClaims, shaftClaims, shaftClaims]),
    piece('gauntlet_start_hatch', [6, 1, 2], [['TTTTTT', 'TTTTTT']], [['SSSSSS', 'SSSSSS']]),
    piece('gauntlet_start_awning', [6, 2, 10], [
      ['======', '======', '======', '======', '======', '======', '======', '======', '......', '......'],
      ['======', '======', '======', '======', '======', '======', '======', '......', '......', '......'],
    ], [
      ['SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'RRRRRR', 'RRRRRR'],
      ['SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'RRRRRR', 'RRRRRR', 'RRRRRR'],
    ]),
  ],
  mapAssemblies: [{
    id: 'gauntlet_start', size: [27, roofY + 5, 16], lootContext: context,
    slots: [
      slot('ground', 'gauntlet_start_ground', [0, 0, 0], [25, 1, 16]),
      slot('margin', 'gauntlet_start_margin', [25, 0, 0], [2, 13, 16]),
      slot('door', 'gauntlet_city_door_intact', [13, 1, 2], [2, 4, 1]),
      slot('roof_air', 'gauntlet_start_roof_air', [6, roofY + 1, 0], [19, 4, 16]),
      slot('hatch', 'gauntlet_start_hatch', [10, roofY, 5], [6, 1, 2]),
      slot('awning', 'gauntlet_start_awning', [0, 1, 5], [6, 2, 10]),
      slot('awning_top_air', 'gauntlet_start_awning_top_air', [0, 43, 0], [6, 2, 16]),
    ] + std.flattenArrays([
      [
        slot('shell_' + floor, 'gauntlet_start_shell', [6, floor, 0], [18, 7, 16]),
        slot('room_' + floor, 'gauntlet_start_room_air', [7, floor, 3], [14, 7, 12]),
        slot('stairs_' + floor, 'gauntlet_start_stairs', [7, floor, if floor == 9 || floor == 25 then 9 else 5], [11, 8, 2]),
        slot('corridor_' + floor, 'gauntlet_start_corridor_air', [7, floor, if floor == 9 || floor == 25 then 5 else 9], [11, 7, 2]),
        slot('deck_' + floor, if floor == 9 || floor == 25 then 'gauntlet_start_floor_rear' else 'gauntlet_start_roof', [6, floor + 7, 0], [18, 1, 16]),
        slot('ladder_' + floor, 'gauntlet_start_ladder', [22, floor, 9], [3, 8, 4]),
      ] for floor in storeys
    ]) + [
      slot('stair_opening_' + floor, 'gauntlet_start_stair_opening', [10, floor + 7, if floor == 9 || floor == 25 then 9 else 5], [6, 1, 2])
      for floor in [1, 9, 17, 25]
    ] + [
      slot('margin_air_' + floor, 'gauntlet_start_margin_air', [25, floor, 0], [2, 8, 16])
      for floor in [13, 21, 29, 37]
    ] + [
      slot('awning_air_' + floor, 'gauntlet_start_awning_air', [0, floor, 0], [6, 10, 16])
      for floor in [3, 13, 23, 33]
    ],
    joins: [], ports: [], anchors: {},
    access: {
      ground: 'storey_1', entrance: [14, 1, 1],
      storeys: [{ id: 'storey_' + floor, floor: floor } for floor in storeys], stairs: [],
    },
  }],
}
