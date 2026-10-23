local room = (import 'gauntlet-lab-rooms.libsonnet').mapPieces[0];
local threat = import 'gauntlet-lab-threat.libsonnet';
// Layer 1 leaves each threat marker cell unclaimed for the marker piece to claim.
local punch = function(claims, marked=threat.cells) [
  std.join('', [if std.length([1 for c in marked if c[0] == x && c[2] == z]) > 0 then '.' else claims[z][x] for x in std.range(0, std.length(claims[z]) - 1)])
  for z in std.range(0, std.length(claims) - 1)
];
local walls = room.layers[3];
// The amalgam's body is taller than a storey, so the holding room's air continues three cells into the storey above under a solid cap.
local topWall = '==================';
local topAir = '=................=';
local topAirClaims = 'SAAAAAAAAAAAAAAAAS';
local topSolid = 'SSSSSSSSSSSSSSSSSS';
local topLayer = [topWall] + [topAir for _ in std.range(1, 12)] + [topWall];
local topLayerClaims = [topSolid] + [topAirClaims for _ in std.range(1, 12)] + [topSolid];
local capLayer = [topWall for _ in std.range(0, 13)];
local capClaims = [topSolid for _ in std.range(0, 13)];
local holdingTop = room + {
  id: 'gauntlet_lab_holding_top', size: [18, 4, 14], anchors: {}, ports: [],
  layers: [topLayer, topLayer, topLayer, capLayer],
  ownership: { layers: [topLayerClaims, topLayerClaims, topLayerClaims, capClaims] },
};
local bayClaims = [
  'SSSSSSSRRRRSSSSSSS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS', 'SR....RRRRRRRRRRRS',
  'SR....RRRRRRRRRRRS', 'RR....RRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRR',
  'RRRRRRRRRRR....RRR', 'SRRRRRRRRRR....RRS', 'SRRRRRRRRRR....RRS', 'SRRRRRRRRRRRRRRRRS',
  'SRRRRRRRRRRRRRRRRS', 'SSSSSSSRRRRSSSSSSS',
];
local incomingClaims = [
  'SSSSSSSRRRRSSSSSSS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS', 'SR....RRRRRRRRRRRS',
  'SR....RRRRRRRRRRRS', 'RR....RRRRRRRRRRRR', 'RRRRRRR...RRRRRRRR', 'RRRRRRR...RRRRRRRR',
  'RRRRRRRRRRR....RRR', 'SRRRRRRRRRR....RRS', 'SRRRRRRRRRR....RRS', 'SRRRRRRRRRRRRRRRRS',
  'SRRRRRRRRRRRRRRRRS', 'SSSSSSSRRRRSSSSSSS',
];
local incomingEastClaims = [
  'SSSSSSSRRRRSSSSSSS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS', 'SR....RRRRRRRRRRRS',
  'SR....RRRRRRRRRRRS', 'RR....RRRRRRRRRRRR', 'RRRRRRRR...RRRRRRR', 'RRRRRRRR...RRRRRRR',
  'RRRRRRRRRRR....RRR', 'SRRRRRRRRRR....RRS', 'SRRRRRRRRRR....RRS', 'SRRRRRRRRRRRRRRRRS',
  'SRRRRRRRRRRRRRRRRS', 'SSSSSSSRRRRSSSSSSS',
];
local incomingEastTop = [
  'SSSSSSSRRRRSSSSSSS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS', 'SRAAAARRRRRRRRRRRS',
  'SRAAAARRRRRRRRRRRS', 'RRRRRRRRRRRRRRRRRR', 'RRRRRRRR...RRRRRRR', 'RRRRRRRR...RRRRRRR',
  'RRRRRRRRRRRAAAARRR', 'SRRRRRRRRRRAAAARRS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS',
  'SRRRRRRRRRRRRRRRRS', 'SSSSSSSRRRRSSSSSSS',
];
local outgoingFloor = [
  'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp',
  'pppppppppppppppppp', 'pppppppppppppppppp', 'ppppppp...pppppppp', 'ppppppp...pppppppp',
  'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp',
  'pppppppppppppppppp', 'pppppppppppppppppp',
];
local outgoingClaims = [
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSS...SSSSSSSS', 'SSSSSSS...SSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
];
local outgoingEastFloor = [
  'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp',
  'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppp...ppppppp', 'pppppppp...ppppppp',
  'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp',
  'pppppppppppppppppp', 'pppppppppppppppppp',
];
local outgoingEastClaims = [
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSS...SSSSSSS', 'SSSSSSSS...SSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
];
local shell = room + { id: 'gauntlet_lab_shell', layers: [room.layers[0], walls, walls, walls, walls, walls, walls, walls],
  ownership: { layers: [room.ownership.layers[0], punch(bayClaims, threat.cells + [threat.centre]), bayClaims, bayClaims, bayClaims, bayClaims, room.ownership.layers[3], room.ownership.layers[3]] },
  anchors: { circulation: { kind: 'standing', at: [9, 1, 11] } }, ports: [],
};
local empty = ['....', '....', '....'];
local emptyClaims = ['AAAA', 'AAAA', 'AAAA'];
local two = ['FFFF', 'FFFF', '....'];
local twoClaims = ['SSSS', 'SSSS', 'AAAA'];
local three = ['FFFF', 'FFFF', 'FFFF'];
local threeClaims = ['SSSS', 'SSSS', 'SSSS'];
local equipment = function(id, furniture, layers, claims) {
  id: 'gauntlet_lab_equipment_' + id, size: [4, 5, 3], style: room.style, lootContext: room.lootContext,
  palette: { '.': { role: 'opening', material: 'air' }, F: { furniture: furniture } },
  layers: layers, ownership: { layers: claims }, anchors: {}, ports: [],
};
local slot = function(id, ref, at, size) { id: id, at: at, size: size, turn: 0, choices: [{ ref: { kind: 'piece', id: ref }, weight: 1 }] };
local furnished = function(id, shellId, first, second) {
  id: id, size: [18, 8, 14], lootContext: room.lootContext,
  slots: [slot('shell', shellId, [0, 0, 0], room.size),
    slot('north_equipment', 'gauntlet_lab_equipment_' + first, [2, 1, 3], [4, 5, 3]),
    slot('south_equipment', 'gauntlet_lab_equipment_' + second, [11, 1, 8], [4, 5, 3])],
  joins: [], ports: [], anchors: shell.anchors,
};
{
  room: furnished,
  mapPieces: [shell, holdingTop,
    shell + { id: 'gauntlet_lab_shell_stair_join', ownership: { layers: [room.ownership.layers[0]] + [[
      'SSSSSSSRRRRSSSSSSS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS', 'SR....RRRRRRRRRRRS',
      'SR....RRRRRRRRRRRS', 'RR....RRRRRRRRRRRR', 'RRRR............RR', 'RRRR............RR',
      'RRRRRRRRRRR....RRR', 'SRRRRRRRRRR....RRS', 'SRRRRRRRRRR....RRS', 'SRRRRRRRRRRRRRRRRS',
      'SRRRRRRRRRRRRRRRRS', 'SSSSSSSRRRRSSSSSSS',
    ] for _ in std.range(1, 5)] + [[
      'SSSSSSSRRRRSSSSSSS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS', 'SRAAAARRRRRRRRRRRS',
      'SRAAAARRRRRRRRRRRS', 'RRRRRRRRRRRRRRRRRR', 'RRRR............RR', 'RRRR............RR',
      'RRRRRRRRRRRAAAARRR', 'SRRRRRRRRRRAAAARRS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS',
      'SRRRRRRRRRRRRRRRRS', 'SSSSSSSRRRRSSSSSSS',
    ] for _ in std.range(6, 7)] } },
    shell + { id: 'gauntlet_lab_shell_incoming', ownership: { layers: [room.ownership.layers[0], punch(incomingClaims), incomingClaims, incomingClaims, incomingClaims, incomingClaims, (import 'gauntlet-lab-descents.libsonnet').mapPieces[0].ownership.layers[3], (import 'gauntlet-lab-descents.libsonnet').mapPieces[0].ownership.layers[3]] } },
    shell + { id: 'gauntlet_lab_shell_incoming_east', ownership: { layers: [room.ownership.layers[0], punch(incomingEastClaims), incomingEastClaims, incomingEastClaims, incomingEastClaims, incomingEastClaims, incomingEastTop, incomingEastTop] } },
    shell + { id: 'gauntlet_lab_shell_outgoing', layers: [outgoingFloor, walls, walls, walls, walls, walls, walls, walls], ownership: { layers: [outgoingClaims, punch(bayClaims), bayClaims, bayClaims, bayClaims, bayClaims, room.ownership.layers[3], room.ownership.layers[3]] } },
    shell + { id: 'gauntlet_lab_shell_outgoing_east', layers: [outgoingEastFloor, walls, walls, walls, walls, walls, walls, walls], ownership: { layers: [outgoingEastClaims, punch(bayClaims), bayClaims, bayClaims, bayClaims, bayClaims, room.ownership.layers[3], room.ownership.layers[3]] } },
    equipment('bench', 'gauntlet_look_bench', [two, two, ['C...', '....', '....'], empty, empty], [twoClaims, twoClaims, ['SAAA', 'AAAA', 'AAAA'], emptyClaims, emptyClaims]) + {
      palette+: { C: { furniture: 'battery_charger' } },
    },
    equipment('console', 'gauntlet_look_console', [two, two, empty, empty, empty], [twoClaims, twoClaims, emptyClaims, emptyClaims, emptyClaims]),
    equipment('archive', 'gauntlet_look_archive', [two, two, two, two, two], [twoClaims, twoClaims, twoClaims, twoClaims, twoClaims]),
    equipment('exam', 'gauntlet_look_exam', [two, two, empty, empty, empty], [twoClaims, twoClaims, emptyClaims, emptyClaims, emptyClaims]),
    equipment('cold_store', 'gauntlet_look_cold_store', [two, two, two, two, two], [twoClaims, twoClaims, twoClaims, twoClaims, twoClaims]),
    equipment('pump', 'gauntlet_look_pump', [three, three, three, three, empty], [threeClaims, threeClaims, threeClaims, threeClaims, emptyClaims]),
    equipment('culture', 'gauntlet_look_culture', [two, two, two, two, empty], [twoClaims, twoClaims, twoClaims, twoClaims, emptyClaims]),
    equipment('containment', 'gauntlet_look_containment_bay', [two, two, two, two, empty], [twoClaims, twoClaims, twoClaims, twoClaims, emptyClaims]),
    equipment('breach', 'gauntlet_look_breached_bay', [two, two, two, two, two], [twoClaims, twoClaims, twoClaims, twoClaims, twoClaims]),
    equipment('spill', 'gauntlet_look_spill', [three, empty, empty, empty, empty], [threeClaims, emptyClaims, emptyClaims, emptyClaims, emptyClaims]),
    equipment('objective', 'gauntlet_look_console', [two, two, ['.B..', '....', '....'], empty, empty], [twoClaims, twoClaims, ['ASAA', 'AAAA', 'AAAA'], emptyClaims, emptyClaims]) + {
      palette: { '.': { role: 'opening', material: 'air' }, F: { furniture: 'gauntlet_look_console' }, B: { furniture: 'gauntlet_button' } },
    },
  ],
}
