local kits = import 'gauntlet-city-kits.libsonnet';
local rooms = import 'gauntlet-start-rooms.libsonnet';
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
  W: { furniture: 'gauntlet_roof_parapet' },
};
local slot(id, piece, at, size) = {
  id: id, at: at, size: size, turn: 0,
  choices: [{ ref: { kind: 'piece', id: piece }, weight: 1 }],
};
local groundRow = '=========================================';
local ground = [
  groundRow, groundRow, groundRow, groundRow, groundRow, groundRow, groundRow, groundRow,
  groundRow, groundRow, groundRow, groundRow, groundRow, groundRow, groundRow, groundRow,
  groundRow, groundRow, groundRow, groundRow, groundRow, groundRow, groundRow, groundRow, groundRow, groundRow,
];
local closed = [
  '################################', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '################################',
];
local doorShell = ['#######..#######################'] + closed[1:];
local windows = [
  '###..######..######..#####..####', '#..............................#',
  '#...............................', '#...............................',
  '#..............................#', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '#..............................#',
  '#..............................#', '...............................#',
  '................................', '#...............................',
  '#..............................#', '#..............................#',
  '...............................#', '................................',
  '#...............................', '#..............................#',
  '#..............................#', '###..######..######..#####..####',
];
local deck = [
  '################################', '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#',
  '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#', '#rrr........rrrrrrrrrrrrrrrrrrr#',
  '#rrr........rrrrrrrrrrrrrrrrrrr#', '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#',
  '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#', '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#',
  '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#', '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#',
  '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#', '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#',
  '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#', '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#',
  '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#', '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#',
  '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#', '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#',
  '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#', '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#',
  '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#', '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#',
  '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#', '################################',
];
local rearDeck = deck[:3] + ['#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#', '#rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr#'] + deck[5:7]
                 + ['#rrr........rrrrrrrrrrrrrrrrrrr#', '#rrr........rrrrrrrrrrrrrrrrrrr#'] + deck[9:];
local recordsDeck = deck[:16] + [
  '#rrr...rrrrrrrrrrrrrrrrrrrrrrrr#', '#rrr...rrrrrrrrrrrrrrrrrrrrrrrr#', '#rrr...rrrrrrrrrrrrrrrrrrrrrrrr#',
] + deck[19:];
local kitchenDeck = deck[:14] + [
  '#rrrrrrrrrrrrrrrrrrrrrrrr...rrr#', '#rrrrrrrrrrrrrrrrrrrrrrrr...rrr#', '#rrrrrrrrrrrrrrrrrrrrrrrr...rrr#',
] + deck[17:];
local skylightDeck = deck[:15] + [
  '#rrrrrrrrrrrrrrrrrrrrr...rrrrrr#', '#rrrrrrrrrrrrrrrrrrrrr...rrrrrr#', '#rrrrrrrrrrrrrrrrrrrrr...rrrrrr#',
] + deck[18:];
local capRow = '...................................';
local cap = [
  capRow, capRow, capRow, capRow, capRow, capRow, capRow, capRow,
  capRow, capRow, capRow, capRow, capRow, capRow, capRow, capRow,
  capRow, capRow, capRow, capRow, capRow, capRow, capRow, capRow, capRow, capRow,
];
local capClaims = [
  'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR',
  'R..............................RRRR', 'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRRRRRRRRRR....RRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR....RRRRRRR',
  'RRRRRRRRRRRRRRRRRRRRRRRR....RRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR....RRRRRRR',
  'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRR..RRR..RRRRRRRRRRRRRRR', 'RRRRRRRRRRRRR..RRR..RRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRR..RRR..RRRRRRRRRRRRRRR', 'RRRRRRRRRRRRR..RRR..RRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR', 'RR....RRRRRRRRRRRRRRRRRRRRRRRRRRRRR',
  'RR....RR....RRRRRRRRRRRRRR....RRRRR', 'RR....RR....RRRRRRRRRRRRRR....RRRRR',
  'RR....RR....RRRRRRRRRRRRRR....RRRRR', 'RRRRRRRR....RRRRRRRRRRRRRR....RRRRR',
  'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR', 'R..............................RRRR',
];
local roomAir = [
  '..............', '..............', '..............', '..............',
  '..............', '..............', '..............', '..............',
];
local roomClaims = [
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', '...........RRR', '...........RRR',
  'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', '...........RRR', '...........RRR',
];
local corridor = ['...........', '...........'];
local corridorClaims = ['RRRRRRRRRRR', 'RRRRRRRRRRR'];
local leftAir = [
  '......', '......', '......', '......', '......', '......', '......', '......',
  '......', '......', '......', '......', '......', '......', '......', '......',
  '......', '......', '......', '......', '......', '......', '......', '......', '......', '......',
];
local leftClaims = [
  'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR',
  'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR',
  'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR',
];
local marginGround = [
  '==', '==', '==', '==', '==', '==', '==', '==', '==', '==', '==', '==', '==',
  '==', '==', '==', '==', '==', '==', '==', '==', '==', '==', '==', '==', '==',
];
local marginAir = [
  '..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..',
  '..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..', '..',
];
local marginReserved = [
  'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR',
  'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR', 'RR',
];
local shaft = ['...', '.H.', '.H.', '...'];
local shaftClaims = ['RRR', 'RSR', 'RSR', 'RRR'];
local structuralClaims(layer) = [std.join('', [if c == '.' then '.' else 'S' for c in std.stringChars(row)]) for row in layer];
local piece(id, size, layers, claims) = {
  id: id, size: size, style: 'brick_townhouse', lootContext: context,
  palette: palette, layers: layers, ownership: { layers: claims }, anchors: {}, ports: [],
};
local deckPiece(id, layer) = piece(id, [32, 1, 24], [layer], [structuralClaims(layer)]);
local stairs = std.filter(function(p) p.id == 'gauntlet_city_stairs_east', kits.mapPieces)[0];
{
  loot: rooms.loot,
  start: {
    template: 'gauntlet_start', cell: [0, 0], spawn: [22, roofY + 1, 4], minimumOpenDescents: 2,
    descents: [
      { kind: 'ladder', ladder: [39, 1, 10], upper: [36, roofY + 1, 11], lower: [41, 1, 11] },
      { kind: 'stairs', hatch: [10, roofY, 5], upper: [18, roofY + 1, 6], lower: [14, 1, 1] },
      { kind: 'drop', upper: [6, roofY + 1, 8], edge: [5, roofY + 1, 8], landing: [5, 3, 8], lower: [5, 1, 14] },
    ],
    // The range's revolver crate, beside its ammunition.
    fixedLoot: [{ at: [35, 17, 6], items: [{ item: 'revolver_357', condition: 0.7, key: true }] }],
  },
  furniture: [{
    id: 'gauntlet_start_hatch', name: 'Roof hatch', size: [6, 1, 2], color: '#8d969a',
    breach: { minimumStrength: 9, durability: 300 },
    door: { material: 'steel', methods: {}, handlingSimSeconds: 0.8, hatch: true },
  }],
  mapPieces: [
    piece('gauntlet_start_ground', [41, 1, 26], [ground], [structuralClaims(ground)]),
    piece('gauntlet_start_margin', [2, 13, 26],
      [marginGround, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir],
      [structuralClaims(marginGround), marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved]),
    piece('gauntlet_start_margin_air', [2, 8, 26],
      [marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir, marginAir],
      [marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved, marginReserved]),
    piece('gauntlet_start_front_air', [32, 7, 2],
      [['................................', '................................'] for y in std.range(0, 6)],
      [['RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR'] for y in std.range(0, 6)]),
    piece('gauntlet_start_shell_ground', [32, 7, 24],
      [doorShell, doorShell, doorShell, doorShell, closed, closed, closed],
      [structuralClaims(layer) for layer in [doorShell, doorShell, doorShell, doorShell, closed, closed, closed]]),
    piece('gauntlet_start_shell', [32, 7, 24],
      [closed, closed, windows, windows, windows, closed, closed],
      [structuralClaims(layer) for layer in [closed, closed, windows, windows, windows, closed, closed]]),
    deckPiece('gauntlet_start_roof', skylightDeck),
    deckPiece('gauntlet_start_floor_rear', rearDeck),
    deckPiece('gauntlet_start_floor_records', recordsDeck),
    deckPiece('gauntlet_start_floor_kitchen', kitchenDeck),
    piece('gauntlet_start_stair_opening', [6, 1, 2], [['......', '......']], [['RRRRRR', 'RRRRRR']]),
    piece('gauntlet_start_room_air', [14, 7, 8],
      [roomAir, roomAir, roomAir, roomAir, roomAir, roomAir, roomAir],
      [roomClaims, roomClaims, roomClaims, roomClaims, roomClaims, roomClaims, roomClaims]),
    piece('gauntlet_start_room_air_crate', [14, 7, 8],
      [roomAir, roomAir, roomAir, roomAir, roomAir, roomAir, roomAir],
      [['RRRRRRRRRRRR..', 'RRRRRRRRRRRR..'] + roomClaims[2:] for y in std.range(0, 6)]),
    piece('gauntlet_start_parapet_west', [14, 2, 1],
      [['WWWWWWWWWWWWWW'], ['WWWWWWWWWWWWWW']], [['SSSSSSSSSSSSSS'], ['SSSSSSSSSSSSSS']]),
    piece('gauntlet_start_parapet_lookout', [3, 2, 1],
      [['==='], ['...']], [['SSS'], ['RRR']]),
    piece('gauntlet_start_parapet_east', [13, 2, 1],
      [['WWWWWWWWWWWWW'], ['WWWWWWWWWWWWW']], [['SSSSSSSSSSSSS'], ['SSSSSSSSSSSSS']]),
    piece('gauntlet_start_parapet', [30, 2, 1],
      [['WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW'], ['WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW']],
      [['SSSSSSSSSSSSSSSSSSSSSSSSSSSSSS'], ['SSSSSSSSSSSSSSSSSSSSSSSSSSSSSS']]),
    piece('gauntlet_start_corridor_air', [11, 7, 2],
      [corridor, corridor, corridor, corridor, corridor, corridor, corridor],
      [corridorClaims, corridorClaims, corridorClaims, corridorClaims, corridorClaims, corridorClaims, corridorClaims]),
    piece('gauntlet_start_awning_top_air', [6, 2, 26], [leftAir, leftAir], [leftClaims, leftClaims]),
    stairs + { id: 'gauntlet_start_stairs', ownership: { layers: stairs.ownership.layers[:7] + [['.........SS', '.........SS']] } },
    piece('gauntlet_start_roof_air', [35, 4, 26], [cap, cap, cap, cap], [capClaims, capClaims, capClaims, capClaims]),
    piece('gauntlet_start_awning_air', [6, 10, 26],
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
  ] + rooms.mapPieces,
  mapAssemblies: [{
    id: 'gauntlet_start', size: [43, roofY + 5, 26], lootContext: context,
    slots: [
      slot('ground', 'gauntlet_start_ground', [0, 0, 0], [41, 1, 26]),
      slot('margin', 'gauntlet_start_margin', [41, 0, 0], [2, 13, 26]),
      slot('door', 'gauntlet_city_door_intact', [13, 1, 2], [2, 4, 1]),
      slot('roof_air', 'gauntlet_start_roof_air', [6, roofY + 1, 0], [35, 4, 26]),
      slot('hatch', 'gauntlet_start_hatch', [10, roofY, 5], [6, 1, 2]),
      slot('awning', 'gauntlet_start_awning', [0, 1, 5], [6, 2, 10]),
      slot('awning_top_air', 'gauntlet_start_awning_top_air', [0, 43, 0], [6, 2, 26]),
      slot('roof_parapet_n_west', 'gauntlet_start_parapet_west', [7, 41, 2], [14, 2, 1]),
      slot('roof_parapet_n_lookout', 'gauntlet_start_parapet_lookout', [21, 41, 2], [3, 2, 1]),
      slot('roof_parapet_n_east', 'gauntlet_start_parapet_east', [24, 41, 2], [13, 2, 1]),
      slot('roof_parapet_s', 'gauntlet_start_parapet', [7, 41, 25], [30, 2, 1]),
      slot('roof_vent_ne', 'gauntlet_roof_vent', [30, 41, 4], [4, 4, 4]),
      slot('roof_ac_sw', 'gauntlet_roof_ac', [8, 41, 19], [4, 4, 4]),
      slot('roof_ac_s', 'gauntlet_roof_ac', [14, 41, 20], [4, 4, 4]),
      slot('roof_vent_se', 'gauntlet_roof_vent', [32, 41, 20], [4, 4, 4]),
    ] + std.flattenArrays([
      [
        slot('front_air_' + floor, 'gauntlet_start_front_air', [6, floor, 0], [32, 7, 2]),
        slot('shell_' + floor, if floor == 1 then 'gauntlet_start_shell_ground' else 'gauntlet_start_shell', [6, floor, 2], [32, 7, 24]),
        slot('room_' + floor, if floor == 17 then 'gauntlet_start_room_air_crate' else 'gauntlet_start_room_air', [7, floor, 3], [14, 7, 8]),
        slot('stairs_' + floor, 'gauntlet_start_stairs', [7, floor, if floor == 9 || floor == 25 then 9 else 5], [11, 8, 2]),
        slot('corridor_' + floor, 'gauntlet_start_corridor_air', [7, floor, if floor == 9 || floor == 25 then 5 else 9], [11, 7, 2]),
        slot('deck_' + floor,
          if floor == 1 then 'gauntlet_start_floor_records' else if floor == 17 then 'gauntlet_start_floor_kitchen'
          else if floor == 33 then 'gauntlet_start_roof' else 'gauntlet_start_floor_rear',
          [6, floor + 7, 2], [32, 1, 24]),
        slot('ladder_' + floor, 'gauntlet_start_ladder', [38, floor, 9], [3, 8, 4]),
      ] for floor in storeys
    ]) + [
      slot('stair_opening_' + floor, 'gauntlet_start_stair_opening', [10, floor + 7, if floor == 9 || floor == 25 then 9 else 5], [6, 1, 2])
      for floor in [1, 9, 17, 25]
    ] + [
      slot('margin_air_' + floor, 'gauntlet_start_margin_air', [41, floor, 0], [2, 8, 26])
      for floor in [13, 21, 29, 37]
    ] + [
      slot('awning_air_' + floor, 'gauntlet_start_awning_air', [0, floor, 0], [6, 10, 26])
      for floor in [3, 13, 23, 33]
    ] + rooms.slots,
    joins: [], ports: [], anchors: {},
    access: {
      ground: 'storey_1', entrance: [14, 1, 1],
      storeys: [{ id: 'storey_' + floor, floor: floor } for floor in storeys], stairs: [],
    },
  }],
}
