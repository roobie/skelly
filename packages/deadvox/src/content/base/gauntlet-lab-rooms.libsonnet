local context = { usage: [], tier: 'Tier1' };
local floor = [
  'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp',
  'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp',
  'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp', 'pppppppppppppppppp',
  'pppppppppppppppppp', 'pppppppppppppppppp',
];
local floorClaims = [
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSS',
];
local walls = [
  '=======....=======', '=................=', '=................=', '=................=',
  '=................=', '..................', '..................', '..................',
  '..................', '=................=', '=................=', '=................=',
  '=................=', '=======....=======',
];
local furnished = [
  '=======....=======', '=................=', '=................=', '=.FFFF...........=',
  '=.FFFF...........=', '..................', '..................', '..................',
  '...........FFFF...', '=..........FFFF..=', '=................=', '=................=',
  '=................=', '=======....=======',
];
local furnishedClaims = [
  'SSSSSSSRRRRSSSSSSS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS', 'SRSSSSRRRRRRRRRRRS',
  'SRSSSSRRRRRRRRRRRS', 'RRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRSSSSRRR', 'SRRRRRRRRRRSSSSRRS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS',
  'SRRRRRRRRRRRRRRRRS', 'SSSSSSSRRRRSSSSSSS',
];
local bayClearance = [
  'SSSSSSSRRRRSSSSSSS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS', 'SRAAAARRRRRRRRRRRS',
  'SRAAAARRRRRRRRRRRS', 'RRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRAAAARRR', 'SRRRRRRRRRRAAAARRS', 'SRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRS',
  'SRRRRRRRRRRRRRRRRS', 'SSSSSSSRRRRSSSSSSS',
];
local room = {
  id: 'gauntlet_lab_room_benches', size: [18, 8, 14], style: 'concrete_lab',
  lootContext: context,
  palette: {
    '=': { role: 'shell', material: 'concrete' },
    p: { role: 'interior_floor', material: 'floor' },
    '.': { role: 'opening', material: 'air' },
    F: { furniture: 'gauntlet_look_bench' },
  },
  layers: [floor, furnished, furnished, walls, walls, walls, walls, walls],
  ownership: { layers: [floorClaims, furnishedClaims, furnishedClaims,
    bayClearance, bayClearance, bayClearance, bayClearance, bayClearance] },
  anchors: { circulation: { kind: 'standing', at: [9, 1, 7] } },
  ports: [
    { id: 'north', type: 'lab_room', facing: 'n', at: [9, 1, 0], aperture: [4, 4], traversal: 'walk',
      standing: [9, 1, 2], clearance: { min: [7, 1, 0], size: [4, 4, 4] } },
    { id: 'south', type: 'lab_room', facing: 's', at: [9, 1, 14], aperture: [4, 4], traversal: 'walk',
      standing: [9, 1, 12], clearance: { min: [7, 1, 10], size: [4, 4, 4] } },
    { id: 'west', type: 'lab_room', facing: 'w', at: [0, 1, 7], aperture: [4, 4], traversal: 'walk',
      standing: [1, 1, 7], clearance: { min: [0, 1, 5], size: [2, 4, 4] } },
    { id: 'east', type: 'lab_room', facing: 'e', at: [18, 1, 7], aperture: [4, 4], traversal: 'walk',
      standing: [17, 1, 7], clearance: { min: [16, 1, 5], size: [2, 4, 4] } },
  ],
};
{
  mapStyles: [{
    id: 'concrete_lab', bindings: {
      concrete: { role: 'shell', block: 'concrete' }, floor: { role: 'interior_floor', block: 'concrete' },
      plaster: { role: 'shell', block: 'plaster' }, metal: { role: 'shell', block: 'galvanized' },
      dressed: { role: 'shell', block: 'dressed_stone' }, rock: { role: 'shell', block: 'rock' },
      hazard_wall: { role: 'shell', block: 'hazard_yellow' }, wire: { role: 'shell', block: 'chain_link' },
      tiles: { role: 'interior_floor', block: 'tiles' }, carpet: { role: 'interior_floor', block: 'carpet' },
      hazard: { role: 'interior_floor', block: 'hazard_yellow' }, planks: { role: 'interior_floor', block: 'planks' },
      air: { role: 'opening', block: 'air' },
    },
  }],
  mapPieces: [room, room + {
    id: 'gauntlet_lab_room_consoles', palette: room.palette + { F: { furniture: 'gauntlet_look_console' } },
  }],
}
