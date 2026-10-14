local rooms = import 'gauntlet-lab-rooms.libsonnet';
local room = rooms.mapPieces[0];
local openFloor = [
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSS...SSSSSSSS', 'SSSSSSS...SSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
];
local incomingFurnished = [
  'SSSSSSSRRRRSSSSSSS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS', 'SRSSSSRRRRRRRRRRRS',
  'SRSSSSRRRRRRRRRRRS', 'RRRRRRRRRRRRRRRRRR', 'RRRRRRR...RRRRRRRR', 'RRRRRRR...RRRRRRRR',
  'RRRRRRRRRRRSSSSRRR', 'SRRRRRRRRRRSSSSRRS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS',
  'SRRRRRRRRRRRRRRRRS', 'SSSSSSSRRRRSSSSSSS',
];
local incomingClearance = [
  'SSSSSSSRRRRSSSSSSS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS', 'SRAAAARRRRRRRRRRRS',
  'SRAAAARRRRRRRRRRRS', 'RRRRRRRRRRRRRRRRRR', 'RRRRRRR...RRRRRRRR', 'RRRRRRR...RRRRRRRR',
  'RRRRRRRRRRRAAAARRR', 'SRRRRRRRRRRAAAARRS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS',
  'SRRRRRRRRRRRRRRRRS', 'SSSSSSSRRRRSSSSSSS',
];
local incoming = room + {
  id: 'gauntlet_lab_room_incoming',
  ownership: { layers: [room.ownership.layers[0], incomingFurnished, incomingFurnished,
    incomingClearance, incomingClearance, incomingClearance, incomingClearance, incomingClearance] },
  anchors: { circulation: { kind: 'standing', at: [9, 1, 11] } },
};
local outgoingFloor = [
  'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp',
  'pppppppppppppppppp', 'pppppppppppppppppp', 'ppppppp...pppppppp', 'ppppppp...pppppppp',
  'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp',
  'pppppppppppppppppp', 'pppppppppppppppppp',
];
local outgoing = room + {
  id: 'gauntlet_lab_room_outgoing',
  layers: [outgoingFloor] + std.slice(room.layers, 1, 8, 1),
  ownership: { layers: [openFloor] + std.slice(room.ownership.layers, 1, 8, 1) },
  anchors: { circulation: { kind: 'standing', at: [9, 1, 11] } },
};
local shaft = {
  id: 'gauntlet_lab_descent_shaft', size: [3, 8, 2], style: room.style,
  lootContext: room.lootContext,
  palette: { '.': { role: 'opening', material: 'air' }, J: { furniture: 'ladder', facing: 'w' } },
  layers: [
    ['.J.', '.J.'], ['.J.', '.J.'], ['.J.', '.J.'], ['.J.', '.J.'],
    ['.J.', '.J.'], ['.J.', '.J.'], ['.J.', '.J.'], ['.J.', '.J.'],
  ],
  ownership: { layers: [
    ['RSR', 'RSR'], ['RSR', 'RSR'], ['RSR', 'RSR'], ['RSR', 'RSR'],
    ['RSR', 'RSR'], ['RSR', 'RSR'], ['RSR', 'RSR'], ['RSR', 'RSR'],
  ] },
  anchors: {}, ports: [],
};
{
  mapPieces: [incoming, outgoing, shaft, shaft + {
    id: 'gauntlet_lab_descent_hatched',
    palette: shaft.palette + { T: { furniture: 'roof_hatch', facing: 'w' } },
    layers: [shaft.layers[0], shaft.layers[1], shaft.layers[2], shaft.layers[3], shaft.layers[4], shaft.layers[5], shaft.layers[6], ['TTT', 'TTT']],
    ownership: { layers: [shaft.ownership.layers[0], shaft.ownership.layers[1], shaft.ownership.layers[2], shaft.ownership.layers[3], shaft.ownership.layers[4], shaft.ownership.layers[5], shaft.ownership.layers[6], ['SSS', 'SSS']] },
  }],
}
