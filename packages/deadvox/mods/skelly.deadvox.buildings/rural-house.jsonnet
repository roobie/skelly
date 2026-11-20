// A one-storey rendered rural house with a flat concrete roof, a projecting
// cornice and a parapet ring. It answers the `rural_flat_roof_house` brief, and its
// modernised twin with an indoor WC answers `rural_flat_roof_house_wc`.
// The walls stand one block in from the assembly's edge so the cornice slab
// overhangs them inside the footprint that plot and lot checks measure.
// Every doorway is a doorway slot, so the fit check walks through its door; see
// `packages/deadvox/docs/building-pathway.md`, "Worked example: rural flat-roof house".
local context = { usage: ['Residential'], tier: 'Tier1' };
local style = 'rural_render';
local palette = {
  '.': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'facade' },
  b: { role: 'shell', material: 'entrance_bay' },
  s: { role: 'shell', material: 'plinth' },
  i: { role: 'interior_wall', material: 'partition' },
  f: { role: 'trim', material: 'window_head' },
  '=': { role: 'support', material: 'footing' },
  p: { role: 'interior_floor', material: 'floor' },
  t: { role: 'interior_floor', material: 'kitchen_floor' },
  r: { role: 'interior_floor', material: 'roof_slab' },
  u: { role: 'roof', material: 'roofing' },
  c: { role: 'trim', material: 'cornice' },
  k: { role: 'trim', material: 'coping' },
};
local piece(id, size, layers, ownership) = {
  id: id, size: size, style: style, lootContext: context, palette: palette,
  layers: layers, ownership: { layers: ownership }, anchors: {}, ports: [],
};
local chimney = {
  H: { furniture: 'chimney', fixed: true },
  h: { furniture: 'chimney_top', fixed: true },
};
// A furnished zone reads its claims from its marks, so its layers and ownership
// cannot disagree: '-' leaves a cell to the shell's reserved walk, '.' is owned
// air and every other mark is a piece of furniture.
local furnished(id, size, layers, things) = piece(id, size, layers, [
  [std.join('', [std.get({ '-': '.', '.': 'A' }, mark, 'S') for mark in std.stringChars(row)]) for row in layer]
  for layer in layers
]) + { palette+: { '-': { role: 'opening', material: 'opening' } } + things };
local base = piece('rural_flat_house_base', [18, 1, 14], [[
  '.......====.......',
  '.================.',
  '.=pppppppppppppp=.',
  '.=pppppppppppppp=.',
  '.=pppppppppppppp=.',
  '.=pppppppppppppp=.',
  '.=pppppppppppppp=.',
  '.================.',
  '.=ppppppp=tttttt=.',
  '.=ppppppp=tttttt=.',
  '.=ppppppp=tttttt=.',
  '.=ppppppp=tttttt=.',
  '.================.',
  '..................',
]], [[
  '.......SSSS.......',
  '.SSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSS.',
  '..................',
]]);
// Walls, partitions and openings, plinth course first. The front room spans the
// street side; the back rooms open off it through the partition. Window bays sit
// a metre above the floor, the sill height of a house, and stand a course taller
// than the doorways. The bays, the doorways and the furnished zones are left
// unclaimed for their slots; the walks from the porch to each doorway and into
// each room are reserved.
local porch = '.......RRRR.......';
local outside = '..................';
local closed = '.SSSSSSSSSSSSSSSS.';
local porchWalk = '.S......RR......S.';
local hallWalk = '.S......RRRRRR..S.';
local hallWalkBay = '........RRRRRR....';
local doorWalk = '.S..RRRRRR..RR..S.';
local doorWalkBay = '....RRRRRR..RR....';
// A row between the outer walls: `edge` on the wall line, `inside` across the house.
local row(edge, inside) = '.' + edge + inside + edge + '.';
// The back of the house is a plan of its own, so the houses share the front, the
// outer walls and the roof and differ in how the back is divided. A plan gives the
// row along the partition below the doorway heads, the rows of the back rooms,
// whose partitions run full height, and the claims of each.
local plans = {
  // A bedroom and a kitchen.
  twoRooms: {
    partition: 'ii..iiiiii..ii',
    rooms: '.......i......',
    partitionClaim: 'SS..SSSSSS..SS',
    roomClaims: ['..RR...S..RR..' for _ in std.range(8, 11)],
  },
  // The bedroom gives up a bed, the kitchen its table, for a WC between them.
  withWc: {
    partition: 'ii..ii..ii..ii',
    rooms: '.....i...i....',
    partitionClaim: 'SS..SS..SS..SS',
    roomClaims: ['..RR.SRR.SRR..', '..RR.SRR.SRR..', '..RR.S...SRR..', '..RR.S...SRR..'],
  },
};
local head = 'iiiiiiiiiiiiii';
local headClaim = 'SSSSSSSSSSSSSS';
local back(plan, wall, bay, inside) = [row(wall, inside)] + [row(bay, plan.rooms) for _ in std.range(8, 10)]
  + [row(wall, plan.rooms)];
local backClaim(plan, bay, inside) = [row('S', inside)] + [row(bay, plan.roomClaims[z - 8]) for z in std.range(8, 10)]
  + [row('S', plan.roomClaims[3])];
local shell(id, plan) = piece(id, [18, 6, 14], [
  [
    '..................',
    '.sssssss..sssssss.',
    '.s..............s.',
    '.s..............s.',
    '.s..............s.',
    '.s..............s.',
    '.s..............s.',
  ] + back(plan, 's', 's', plan.partition) + [
    '.ssssssssssss..ss.',
    '..................',
  ],
  [
    '..................',
    '.######b..b######.',
    '.#..............#.',
    '.#..............#.',
    '.#..............#.',
    '.#..............#.',
    '.#..............#.',
  ] + back(plan, '#', '#', plan.partition) + [
    '.############..##.',
    '..................',
  ],
] + [
  [
    '..................',
    '.##...#b..b#...##.',
    '.#..............#.',
    '..................',
    '..................',
    '..................',
    '.#..............#.',
  ] + back(plan, '#', '.', plan.partition) + [
    '.###...######..##.',
    '..................',
  ]
  for _ in [3, 4]
] + [
  [
    '..................',
    '.##...#bbbb#...##.',
    '.#..............#.',
    '..................',
    '..................',
    '..................',
    '.#..............#.',
  ] + back(plan, '#', '.', head) + [
    '.###...##########.',
    '..................',
  ],
  [
    '..................',
    '.##fff#bbbb#fff##.',
    '.#..............#.',
    '.f..............f.',
    '.f..............f.',
    '.f..............f.',
    '.#..............#.',
  ] + back(plan, '#', 'f', head) + [
    '.###fff##########.',
    '..................',
  ],
], [
  [porch, '.SSSSSSS..SSSSSSS.', porchWalk, hallWalk, hallWalk, doorWalk, doorWalk]
  + backClaim(plan, 'S', plan.partitionClaim) + ['.SSSSSSSSSSSS..SS.', outside]
  for _ in [1, 2]
] + [
  [porch, '.SS...SS..SS...SS.', porchWalk, hallWalkBay, hallWalkBay, doorWalkBay, doorWalk]
  + backClaim(plan, '.', plan.partitionClaim) + ['.SSS...SSSSSS..SS.', outside]
  for _ in [3, 4]
] + [
  [porch, '.SS...SSSSSS...SS.', porchWalk, hallWalkBay, hallWalkBay, doorWalkBay, doorWalk]
  + backClaim(plan, '.', headClaim) + ['.SSS...SSSSSSSSSS.', outside],
  [porch, closed, porchWalk, hallWalk, hallWalk, doorWalk, doorWalk]
  + backClaim(plan, 'S', headClaim) + [closed, outside],
]);
// The slab runs out to the assembly edge as the cornice; the parapet and its
// coping stand on the wall line as a full ring, the roofing course laid inside it
// on the slab. The stove's chimney rises through the slab and one course above
// the coping, so its smoke clears the parapet. The parapet ring holds the roof's
// water, so it leaves through a scupper at the back corner of the east parapet into
// a rainwater head, and its downspout passes the cornice through a notch on its way
// down the wall.
local at(x, z) = function(rows, mark) [
  if row == z then std.substr(rows[row], 0, x) + mark + std.substr(rows[row], x + 1, 17 - x) else rows[row]
  for row in std.range(0, std.length(rows) - 1)
];
local withFlue = at(10, 6);
local withOutlet = at(17, 12);
local rainwater = {
  P: { furniture: 'downspout', facing: 'e', fixed: true },
  Q: { furniture: 'rainwater_head', facing: 'e', fixed: true },
};
local fill(mark) = std.join('', [mark for _ in std.range(1, 14)]);
local ring(edge, inside) = [outside, '.' + edge + '.'] + ['.%s%s%s.' % [edge[0], fill(inside), edge[0]] for _ in std.range(2, 11)]
  + ['.' + edge + '.', outside];
local ringClaim(inside) = [outside, closed] + ['.S%sS.' % fill(inside) for _ in std.range(2, 11)] + [closed, outside];
local roof = piece('rural_flat_house_roof', [18, 4, 14], [
  withOutlet(withFlue(['cccccccccccccccccc'] + ['crrrrrrrrrrrrrrrrc' for _ in std.range(1, 12)] + ['cccccccccccccccccc'], 'H'), 'P'),
  withOutlet(withFlue(ring('################', 'u'), 'H'), 'Q'),
  withFlue(ring('kkkkkkkkkkkkkkkk', '.'), 'H'),
  withFlue([outside for _ in std.range(0, 13)], 'h'),
], [
  ['SSSSSSSSSSSSSSSSSS' for _ in std.range(0, 13)],
  withOutlet(withFlue(ringClaim('S'), 'S'), 'S'),
  withFlue(ringClaim('A'), 'S'),
  withFlue([outside for _ in std.range(0, 13)], 'S'),
]) + { palette+: chimney + rainwater };
// The downspout's run down the wall, to the ground beside the back corner.
local downspout = piece('rural_flat_house_downspout', [1, 6, 1], [['P'] for _ in std.range(1, 6)],
  [['S'] for _ in std.range(1, 6)]) + { palette+: rainwater };
// Furnishing: most houses have no indoor toilet, as in a country house of the
// setting, whose privy stands in the yard. The front room is warmed by a wood stove
// against the kitchen wall, its chimney going up behind it; a sofa faces it from
// under the street window. Two beds share the back bedroom with a wardrobe and a
// shelf, and the kitchen keeps a table, a sink under its window and a cooker by the
// back door.
local living = furnished('rural_flat_house_living', [14, 6, 5], [
  ['.aaaa.--ee....', '.aaaa.------..', '......------..', '..------OO--xx', '..------OO--xx'],
  ['.aaaa.--ee....', '.aaaa.------..', '......------..', '..------OO--xx', '..------OO--xx'],
  ['......--ee....', '......------..', '......------..', '..------OO--..', '..------OO--..'],
  ['......--ee....', '......------..', '......------..', '..------..--..', '..------H.--..'],
] + [
  ['......--......', '......------..', '......------..', '..------..--..', '..------H.--..']
  for _ in [5, 6]
], chimney + {
  a: { furniture: 'sofa', facing: 's' },
  e: { furniture: 'shelf', facing: 's', loot: 'shelf' },
  O: { furniture: 'wood_stove', fixed: true },
  x: { furniture: 'crate', loot: 'junk' },
});
local bedroom = furnished('rural_flat_house_bedroom', [7, 6, 4], [
  ['BB--BBw', 'BB--BBw', 'BB--BBe', 'BB--BBe'],
] + [
  ['..--..w', '..--..w', '..--..e', '..--..e']
  for _ in [2, 3, 4]
] + [
  ['..--...', '..--...', '..--...', '..--...']
  for _ in [5, 6]
], {
  B: { furniture: 'bed' },
  w: { furniture: 'wardrobe', facing: 'w', loot: 'wardrobe' },
  e: { furniture: 'shelf', facing: 'w', loot: 'shelf' },
});
local kitchen = furnished('rural_flat_house_kitchen', [6, 6, 4], [
  ['TT--.n', 'TT--.n', 'TT--.o', 'CC--.o']
  for _ in [1, 2]
] + [
  ['..--..', '..--..', '..--..', '..--..']
  for _ in [3, 4, 5, 6]
], {
  T: { furniture: 'kitchen_table', facing: 'e' },
  C: { furniture: 'chair' },
  n: { furniture: 'kitchen_sink', facing: 'w', fixed: true },
  o: { furniture: 'cooker', facing: 'w', fixed: true },
});
// The modernised house's back: one bed and the wardrobe, a WC with its toilet and
// washbasin against the kitchen partition, and a kitchen of sink and cooker alone.
local wcBedroom = furnished('rural_flat_house_wc_bedroom', [5, 6, 4], [
  ['BB--w', 'BB--w', 'BB--.', 'BB--.'],
] + [
  ['..--w', '..--w', '..--.', '..--.']
  for _ in [2, 3, 4]
] + [
  ['..--.', '..--.', '..--.', '..--.']
  for _ in [5, 6]
], {
  B: { furniture: 'bed' },
  w: { furniture: 'wardrobe', facing: 'w', loot: 'wardrobe' },
});
local wc = furnished('rural_flat_house_wc', [3, 6, 4], [
  ['--b', '--b', '.WW', '.WW']
  for _ in [1, 2]
] + [
  ['--.', '--.', '...', '...']
  for _ in [3, 4, 5, 6]
], {
  W: { furniture: 'toilet', facing: 'w', fixed: true },
  b: { furniture: 'washbasin', facing: 'w', fixed: true },
});
local wcKitchen = furnished('rural_flat_house_wc_kitchen', [4, 6, 4], [
  ['--.n', '--.n', '--.o', '--.o']
  for _ in [1, 2]
] + [
  ['--..', '--..', '--..', '--..']
  for _ in [3, 4, 5, 6]
], {
  n: { furniture: 'kitchen_sink', facing: 'w', fixed: true },
  o: { furniture: 'cooker', facing: 'w', fixed: true },
});
// Doors: a leaf hung in the doorway, or the leaf gone and the doorway open. The
// outer doors are solid wood facing out of the house; the inner ones are flimsy.
local door(id, leaf, rows, claim) =
  piece(id, [2, 4, 1], [[rows] for _ in std.range(1, 4)], [[claim] for _ in std.range(1, 4)]) + { palette+: leaf };
local leaves = {
  front: { furniture: 'wood_door', facing: 'n' },
  back: { furniture: 'wood_door', facing: 's' },
  inner: { furniture: 'flimsy_wood_door', facing: 's' },
};
local doorId(leaf) = 'rural_flat_house_door_' + leaf;
local doors = [door(doorId(leaf), { D: leaves[leaf] }, 'DD', 'SS') for leaf in std.objectFields(leaves)]
  + [door(doorId('missing'), {}, '..', 'AA') + { aftermath: ['broken'] }];
local slot(id, at, size, choices) = { id: id, at: at, size: size, turn: 0, choices: choices };
local only(id) = [{ ref: { kind: 'piece', id: id }, weight: 1 }];
local doorway(id, at, leaf) = slot(id, at, [2, 4, 1], [
  { ref: { kind: 'piece', id: doorId(leaf) }, weight: 4 },
  { ref: { kind: 'piece', id: doorId('missing') }, weight: 1 },
]) + { doorway: true };
local windows = (import 'tools/jsonnet/lib/window-slots.libsonnet')(
  'rural_flat_house_window', { style: style, lootContext: context }, ['n', 's', 'e', 'w']);
local window = windows.slot;
local rendered = {
  facade: { role: 'shell', block: 'plaster' },
  entrance_bay: { role: 'shell', block: 'plaster' },
  plinth: { role: 'shell', block: 'dressed_stone' },
  partition: { role: 'interior_wall', block: 'plaster' },
  window_head: { role: 'trim', block: 'window_frame' },
  footing: { role: 'support', block: 'concrete' },
  floor: { role: 'interior_floor', block: 'planks' },
  kitchen_floor: { role: 'interior_floor', block: 'tiles' },
  roof_slab: { role: 'interior_floor', block: 'concrete' },
  roofing: { role: 'roof', block: 'bitumen_felt' },
  cornice: { role: 'trim', block: 'concrete' },
  coping: { role: 'trim', block: 'concrete' },
  opening: { role: 'opening', block: 'air' },
};
local room(id, at, furnishing) = slot(id, at, furnishing.size, only(furnishing.id));
// A house of `shellId`: the shared front room, outer doors, windows and roof, with
// `back`, the slots its back plan divides, and the anchors of the rooms it adds.
local house(id, shellId, back, anchors) = {
  id: id,
  brief: id,
  eligibility: { settlementKinds: ['rural'] },
  lootContext: context,
  size: [18, 11, 14],
  slots: [
    slot('base', [0, 0, 0], [18, 1, 14], only('rural_flat_house_base')),
    // The entrance bay is rendered like the walls or clad in boards.
    slot('shell', [0, 1, 0], [18, 6, 14], [
      { ref: { kind: 'piece', id: shellId }, weight: 1 },
      { ref: { kind: 'piece', id: shellId, style: 'rural_render_boarded' }, weight: 1 },
    ]),
    doorway('front_door', [8, 1, 1], 'front'),
    doorway('back_door', [13, 1, 12], 'back'),
    doorway('bedroom_door', [4, 1, 7], 'inner'),
    doorway('kitchen_door', [12, 1, 7], 'inner'),
    room('living', [2, 1, 2], living),
  ] + back + [
    window('front_west', [3, 3, 1], 'n'),
    window('front_east', [12, 3, 1], 'n'),
    window('back', [4, 3, 12], 's'),
    window('west_front', [1, 3, 3], 'w'),
    window('west_back', [1, 3, 8], 'w'),
    window('east_front', [16, 3, 3], 'e'),
    window('east_back', [16, 3, 8], 'e'),
    slot('downspout', [17, 1, 12], [1, 6, 1], only('rural_flat_house_downspout')),
    slot('roof', [0, 7, 0], [18, 4, 14], only('rural_flat_house_roof')),
  ],
  joins: [],
  anchors: {
    living_room: { kind: 'standing', at: [7, 1, 6] },
    bedroom: { kind: 'standing', at: [5, 1, 10] },
    kitchen: { kind: 'standing', at: [13, 1, 10] },
  } + anchors,
  ports: [],
  access: { ground: 'ground', entrance: [9, 1, 3], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
};
{
  mapStyles: [
    { id: style, bindings: rendered },
    { id: 'rural_render_boarded', aftermath: ['boarded'], bindings: rendered { entrance_bay: { role: 'shell', block: 'plank_wall' } } },
  ],
  mapPieces: [
    base,
    shell('rural_flat_house_shell', plans.twoRooms),
    shell('rural_flat_house_wc_shell', plans.withWc),
    roof,
    downspout,
    living,
    bedroom,
    kitchen,
    wcBedroom,
    wc,
    wcKitchen,
  ] + doors + windows.mapPieces,
  // The house, and the modernised house with its WC, each answering its own brief.
  mapAssemblies: [
    house('rural_flat_roof_house', 'rural_flat_house_shell', [
      room('bedroom', [2, 1, 8], bedroom),
      room('kitchen', [10, 1, 8], kitchen),
    ], {}),
    house('rural_flat_roof_house_wc', 'rural_flat_house_wc_shell', [
      room('bedroom', [2, 1, 8], wcBedroom),
      room('wc', [8, 1, 8], wc),
      room('kitchen', [12, 1, 8], wcKitchen),
      doorway('wc_door', [8, 1, 7], 'inner'),
    ], { wc: { kind: 'standing', at: [9, 1, 9] } }),
  ],
}
