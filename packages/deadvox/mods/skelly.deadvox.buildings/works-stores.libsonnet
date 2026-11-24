// A works stores: a one-room brick shed under a flat slab, one door in the north end and racking round a central
// aisle. It answers the `works_stores` brief. The shell and the door are shared here; a scenario stocks the racking
// with its own piece and builds its answer with `answer`, so its supplies stay with their owner. Why a briefed
// building is built this way: `packages/deadvox/docs/building-pathway.md`, "Worked example: works stores".
//
// Layer marks: '_' is reserved circulation, ',' leaves the cell to the terrain, '-' is a hole a slot fills, '.' is
// owned air and every other mark claims its cell, so a layer and its claims cannot disagree.
local context = { usage: ['Industrial'], tier: 'Tier1' };
local style = 'works_brick';
local palette = {
  '_': { role: 'opening', material: 'opening' },
  ',': { role: 'opening', material: 'opening' },
  '-': { role: 'opening', material: 'opening' },
  '.': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'walls' },
  '=': { role: 'support', material: 'footing' },
  r: { role: 'interior_floor', material: 'roof_deck' },
  j: { role: 'support', material: 'joists' },
  c: { role: 'roof', material: 'roofing' },
};
local claims(layers) = [
  [std.join('', [std.get({ '_': 'R', ',': '.', '-': '.', '.': 'A' }, mark, 'S') for mark in std.stringChars(row)]) for row in layer]
  for layer in layers
];
local piece(id, size, layers, things={}) = {
  id: id, size: size, style: style, lootContext: context,
  palette: palette + things, layers: layers, ownership: { layers: claims(layers) },
  anchors: {}, ports: [],
};

// The footing runs under the apron in front of the door, so a body stands there; the walls rise through the roof
// slab and one felt course covers it. The slab is wider than concrete spans, so two steel joists under it bear on
// the front and back walls, either side of the aisle, and every slab cell is within its span of a joist or a wall.
// A clear course under the joists keeps the room from feeling cramped: the wall runs over the door as its lintel.
local apron = ',,,______,,,';
local shellLayers = [
  [',,,======,,,'] + ['============' for _ in std.range(1, 10)],
] + [
  [apron, '#####--#####'] + ['#----------#' for _ in std.range(2, 9)] + ['############']
  for _ in [1, 2, 3, 4]
] + [
  [',,,,,,,,,,,,', '############'] + ['#..........#' for _ in std.range(2, 9)] + ['############'],
  [',,,,,,,,,,,,', '############'] + ['#...j..j...#' for _ in std.range(2, 9)] + ['############'],
  [',,,,,,,,,,,,', '############'] + ['#rrrrrrrrrr#' for _ in std.range(2, 9)] + ['############'],
  [',,,,,,,,,,,,'] + ['cccccccccccc' for _ in std.range(1, 10)],
];
local shell = piece('works_stores_shell', [12, 9, 11], shellLayers);

// The door: a solid wooden leaf opening onto the apron, or the leaf gone.
local doors = [
  piece('works_stores_door', [2, 4, 1], [['DD'] for _ in std.range(1, 4)], {
    D: { furniture: 'wood_door', facing: 'n' },
  }),
  piece('works_stores_door_missing', [2, 4, 1], [['..'] for _ in std.range(1, 4)]) + { aftermath: ['broken'] },
];

local only(id) = [{ ref: { kind: 'piece', id: id }, weight: 1 }];
local slot(id, at, size, choices) = { id: id, at: at, size: size, turn: 0, choices: choices };
{
  style: style,
  context: context,
  mapStyles: [{
    id: style,
    bindings: {
      opening: { role: 'opening', block: 'air' },
      walls: { role: 'shell', block: 'brick' },
      footing: { role: 'support', block: 'concrete' },
      roof_deck: { role: 'interior_floor', block: 'concrete' },
      joists: { role: 'support', block: 'steel_joist' },
      roofing: { role: 'roof', block: 'bitumen_felt' },
    },
  }],
  mapPieces: [shell] + doors,
  // The racking fills the room inside the walls up to the clear course, [10, 4, 8] from the west wall and the front
  // wall, north at the door. It keeps the aisle from the door, columns 4 and 5, reserved its whole depth, and the anchors
  // stand on it.
  racking(id, layers, things):: piece(id, [10, 4, 8], layers, things),
  answer(id, racking):: {
    id: id,
    brief: 'works_stores',
    eligibility: { settlementKinds: ['rural'] },
    lootContext: context,
    size: [12, 9, 11],
    slots: [
      slot('shell', [0, 0, 0], [12, 9, 11], only(shell.id)),
      slot('door', [5, 1, 1], [2, 4, 1], [
        { ref: { kind: 'piece', id: doors[0].id }, weight: 4 },
        { ref: { kind: 'piece', id: doors[1].id }, weight: 1 },
      ]) + { doorway: true },
      slot('racking', [1, 1, 2], [10, 4, 8], only(racking)),
    ],
    joins: [],
    ports: [],
    anchors: {
      service_aisle: { kind: 'standing', at: [6, 1, 6] },
      stores_room: { kind: 'standing', at: [6, 1, 8] },
    },
    access: { ground: 'ground', entrance: [6, 1, 4], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
  },
}
