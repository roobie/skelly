local lab = import 'gauntlet-lab.libsonnet';
local yard = import 'gauntlet-lab-yard.libsonnet';
local circulation = import 'gauntlet-lab-circulation.libsonnet';
local rooms = import 'gauntlet-lab-rooms.libsonnet';
local context = { usage: ['Industrial', 'Medical'], tier: 'Tier1' };
local decals = import 'decals.libsonnet';
local palette = { '.': { role: 'opening', material: 'air' }, '#': { role: 'shell', material: 'brick' }, R: { role: 'shell', material: 'galvanized' }, D: { furniture: 'wood_door', facing: 'n' } };
local doorway = ['###########DD###########', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '###########DD###########'];
local doorwayClaims = ['SSSSSSSSSSSSSSSSSSSSSSSS', 'SRRRRRRRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRRRRRRRS', 'SSSSSSSSSSSSSSSSSSSSSSSS'];
local walls = ['########################', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '#......................#', '########################'];
local roof = ['RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRRRR'];
local roofClaims = ['SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS'];
local hatchFloor = [circulation.mapPieces[1].layers[0][0], circulation.mapPieces[1].layers[0][1], 'pppppppppppppppppppppppppppppppppppppppppp...ppppppppppppppppppppppppppp', 'pppppppppppppppppppppppppppppppppppppppppp...ppppppppppppppppppppppppppp', circulation.mapPieces[1].layers[0][4]];
local hatchFloorClaims = [circulation.mapPieces[1].ownership.layers[0][0], circulation.mapPieces[1].ownership.layers[0][1], 'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS...SSSSSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS...SSSSSSSSSSSSSSSSSSSSSSSSSSS', circulation.mapPieces[1].ownership.layers[0][4]];
local floorPiece = function(piece) piece + { id: piece.id + '_surface_floor', size: [piece.size[0], 1, piece.size[2]], layers: [piece.layers[0]], ownership: { layers: [piece.ownership.layers[0]] }, anchors: {}, ports: [] };
local apronAir = ['.......', '.......', '.......', '.......'];
local apronClaims = ['RRRRRRR', 'RRRRRRR', 'RRRRRRR', 'RRRRRRR'];
local slot = function(id, kind, ref, at, size) { id: id, at: at, size: size, turn: 0, choices: [{ ref: { kind: kind, id: ref }, weight: 1 }] };
local small = function(id, size, furniture, layers, claims, facing='n') {
  id: id, size: size, style: 'service_brick', lootContext: context, palette: { F: { furniture: furniture, facing: facing } }, layers: layers,
  ownership: { layers: claims }, anchors: {}, ports: [],
};
local scavenger = small('gauntlet_service_scavenger', [4, 1, 2], 'gauntlet_dead_scavenger', [['FFFF', 'FFFF']], [['SSSS', 'SSSS']]) + {
  palette: { F: { furniture: 'gauntlet_dead_scavenger', facing: 'n', loot: 'gauntlet_scavenger_pockets' } },
};
// Others who came for the lab before the player lie by its hatch: see `DESIGN.md`, "Gauntlet".
local scavengers = [[36, 41, 47], [45, 41, 44], [49, 41, 39]];
{
  furniture: [{
    id: 'gauntlet_dead_scavenger', name: 'Dead scavenger', size: [4, 1, 2], color: '#4d5048', solid: false,
    shape: [
      { position: [0.2, 0, 0.5], size: [1.2, 0.15, 0.4] },
      { position: [0.2, 0, 1.1], size: [1.2, 0.15, 0.4] },
      { position: [1.4, 0, 0.45], size: [1.5, 0.25, 1.1] },
      { position: [2.9, 0, 0.65], size: [0.5, 0.25, 0.7] },
    ],
    container: { pockets: [{ grid: [6, 4], handlingSimSeconds: 1.2 }] },
  }],
  loot: [{ id: 'gauntlet_scavenger_pockets', rolls: [1, 2], entries: [
    { item: 'cartridge_357_h_magnum', weight: 2, count: [1, 3] },
    { item: 'bandage', weight: 2 },
    { item: 'aa_battery', weight: 1, count: [1, 2] },
    { item: 'lighter', weight: 1 },
    { item: 'chocolate_bar', weight: 1 },
    { table: 'junk', weight: 1 },
    { nothing: true, weight: 2 },
  ] }],
  mapPieces: [scavenger] + [floorPiece(p) for p in circulation.mapPieces if p.id != 'gauntlet_lab_entry_cross'] + [floorPiece(rooms.mapPieces[0]) + { id: 'gauntlet_service_room_floor', anchors: {}, ports: [] },
    floorPiece(circulation.mapPieces[1]) + { id: 'gauntlet_service_hatch_floor', layers: [hatchFloor], ownership: { layers: [hatchFloorClaims] } },
    { id: 'gauntlet_service_apron', size: [7, 8, 4], style: 'service_brick', lootContext: context,
      palette: { '.': { role: 'opening', material: 'air' } },
      layers: [apronAir, apronAir, apronAir, apronAir, apronAir, apronAir, apronAir, apronAir],
      ownership: { layers: [apronClaims, apronClaims, apronClaims, apronClaims, apronClaims, apronClaims, apronClaims, apronClaims] }, anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_service_shell', size: [24, 8, 14], style: 'service_brick', lootContext: context, palette: palette,
      decals: [
        decals.blood([12, 0, -2.5], 0.1),
        decals.blood([11.7, 0, -1.2], -0.2),
        decals.blood([12.1, 0, 0.5], 0.25),
        decals.blood([11.8, 0, 2], -0.1),
        decals.blood([12.3, 0, 3.5], 0.3),
        decals.searched([12, 2.4, 0.44]) + { door: [11, 0, 0] },
      ],
      layers: [doorway, doorway, doorway, doorway, walls, walls, walls, roof],
      ownership: { layers: [doorwayClaims, doorwayClaims, doorwayClaims, doorwayClaims, doorwayClaims, doorwayClaims, doorwayClaims, roofClaims] }, anchors: {}, ports: [],
    },
    small('gauntlet_service_exhaust', [4, 8, 2], 'gauntlet_look_exhaust', [['FFFF', 'FFFF'], ['FFFF', 'FFFF'], ['FFFF', 'FFFF'], ['FFFF', 'FFFF'], ['FFFF', 'FFFF'], ['FFFF', 'FFFF'], ['FFFF', 'FFFF'], ['FFFF', 'FFFF']], [['SSSS', 'SSSS'], ['SSSS', 'SSSS'], ['SSSS', 'SSSS'], ['SSSS', 'SSSS'], ['SSSS', 'SSSS'], ['SSSS', 'SSSS'], ['SSSS', 'SSSS'], ['SSSS', 'SSSS']]),
    small('gauntlet_service_memo', [2, 2, 2], 'crate', [['FF', 'FF'], ['FF', 'FF']], [['SS', 'SS'], ['SS', 'SS']]) + { palette: { F: { furniture: 'crate', facing: 'n', loot: 'd41_empty' } } },
    small('gauntlet_service_bench', [4, 2, 2], 'gauntlet_look_bench', [['FFFF', 'FFFF'], ['FFFF', 'FFFF']], [['SSSS', 'SSSS'], ['SSSS', 'SSSS']]),
    small('gauntlet_service_hatch', [3, 1, 2], 'roof_hatch', [['FFF', 'FFF']], [['SSS', 'SSS']], 'w'),
    {
      id: 'gauntlet_service_ladder', size: [3, 7, 2], style: 'service_brick', lootContext: context,
      palette: { '.': { role: 'opening', material: 'air' }, H: { furniture: 'ladder', facing: 'w' } },
      layers: [['.H.', '.H.'], ['.H.', '.H.'], ['.H.', '.H.'], ['.H.', '.H.'], ['.H.', '.H.'], ['.H.', '.H.'], ['.H.', '.H.']],
      ownership: { layers: [['RSR', 'RSR'], ['RSR', 'RSR'], ['RSR', 'RSR'], ['RSR', 'RSR'], ['RSR', 'RSR'], ['RSR', 'RSR'], ['RSR', 'RSR']] }, anchors: {}, ports: [],
    },
  ] + yard.mapPieces,
  mapAssemblies: [{
    id: 'gauntlet_service', size: [72, 49, 64], lootContext: context,
    slots: [
      slot('lab', 'assembly', 'gauntlet_lab', [0, 0, 0], [72, 40, 64]),
      slot('entry_ladder', 'piece', 'gauntlet_service_ladder', [42, 33, 39], [3, 7, 2]),
      slot('hatch', 'piece', 'gauntlet_service_hatch', [42, 40, 39], [3, 1, 2]),
      slot('apron', 'piece', 'gauntlet_service_apron', [41, 41, 38], [7, 8, 4]),
      slot('service_shell', 'piece', 'gauntlet_service_shell', [24, 41, 24], [24, 8, 14]),
      slot('exhausts', 'piece', 'gauntlet_service_exhaust', [28, 41, 38], [4, 8, 2]),
      slot('memo', 'piece', 'gauntlet_service_memo', [39, 41, 38], [2, 2, 2]),
      slot('resource_bench', 'piece', 'gauntlet_service_bench', [33, 41, 42], [4, 2, 2]),
    ] + [slot(s.id + '_floor', 'piece', if s.id == 'cross_south' then 'gauntlet_service_hatch_floor' else s.choices[0].ref.id + '_surface_floor', [s.at[0], 40, s.at[2]], [s.size[0], 1, s.size[2]]) for s in circulation.slots] + [
      slot('north_west_floor', 'piece', 'gauntlet_service_room_floor', [4, 40, 4], [18, 1, 14]),
      slot('north_middle_floor', 'piece', 'gauntlet_service_room_floor', [27, 40, 4], [18, 1, 14]),
      slot('north_east_floor', 'piece', 'gauntlet_service_room_floor', [50, 40, 4], [18, 1, 14]),
      slot('middle_west_floor', 'piece', 'gauntlet_service_room_floor', [4, 40, 23], [18, 1, 14]),
      slot('middle_middle_floor', 'piece', 'gauntlet_service_room_floor', [27, 40, 23], [18, 1, 14]),
      slot('middle_east_floor', 'piece', 'gauntlet_service_room_floor', [50, 40, 23], [18, 1, 14]),
      slot('south_west_floor', 'piece', 'gauntlet_service_room_floor', [4, 40, 42], [18, 1, 14]),
      slot('south_middle_floor', 'piece', 'gauntlet_service_room_floor', [27, 40, 42], [18, 1, 14]),
      slot('south_east_floor', 'piece', 'gauntlet_service_room_floor', [50, 40, 42], [18, 1, 14]),
    ] + [slot('scavenger_' + i, 'piece', scavenger.id, scavengers[i], scavenger.size) for i in std.range(0, std.length(scavengers) - 1)]
    + yard.slots, joins: [], ports: [], anchors: {},
    access: { ground: 'ground', entrance: [36, 41, 26], storeys: [{ id: 'ground', floor: 41 }], stairs: [] },
  }],
}
