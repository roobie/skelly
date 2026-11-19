// A one-storey rendered rural house with a flat concrete roof, a projecting
// cornice and a parapet ring; it answers the `rural_flat_roof_house` brief.
// The walls stand one block in from the assembly's edge so the cornice slab
// overhangs them inside the footprint that plot and lot checks measure.
// Doorways on the walk from the street to each room are open: the fit check
// walks reserved air only, and a door leaf is owned furniture, so only the
// back door, off every program route, has a leaf. See
// `packages/deadvox/docs/building-pathway.md`, "Worked example: rural flat-roof house".
local context = { usage: ['Residential'], tier: 'Tier1' };
local style = 'rural_render';
local palette = {
  '.': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'facade' },
  b: { role: 'shell', material: 'entrance_bay' },
  s: { role: 'shell', material: 'plinth' },
  i: { role: 'shell', material: 'partition' },
  f: { role: 'trim', material: 'window_head' },
  '=': { role: 'support', material: 'footing' },
  p: { role: 'interior_floor', material: 'floor' },
  t: { role: 'interior_floor', material: 'kitchen_floor' },
  r: { role: 'interior_floor', material: 'roof_slab' },
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
// street side; the bedroom and kitchen share the back. Window bays sit a metre
// above the floor, the sill height of a house, and stand a course taller than
// the doorways. The bays, the back doorway and the furnished zones are left
// unclaimed for their slots; the walks from the porch to each doorway and into
// each room are reserved.
local porch = '.......RRRR.......';
local outside = '..................';
local closed = '.SSSSSSSSSSSSSSSS.';
local doorways = '.SSSRRSSSSSSRRSSS.';
local porchWalk = '.S......RR......S.';
local hallWalk = '.S......RRRRRR..S.';
local hallWalkBay = '........RRRRRR....';
local doorWalk = '.S..RRRRRR..RR..S.';
local doorWalkBay = '....RRRRRR..RR....';
local backWalk = '.S..RR...S..RR..S.';
local backWalkBay = '....RR...S..RR....';
local shell = piece('rural_flat_house_shell', [18, 6, 14], [
  [
    '..................',
    '.sssssss..sssssss.',
    '.s..............s.',
    '.s..............s.',
    '.s..............s.',
    '.s..............s.',
    '.s..............s.',
    '.sii..iiiiii..iis.',
    '.s.......i......s.',
    '.s.......i......s.',
    '.s.......i......s.',
    '.s.......i......s.',
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
    '.#ii..iiiiii..ii#.',
    '.#.......i......#.',
    '.#.......i......#.',
    '.#.......i......#.',
    '.#.......i......#.',
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
    '.#ii..iiiiii..ii#.',
    '.........i........',
    '.........i........',
    '.........i........',
    '.#.......i......#.',
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
    '.#iiiiiiiiiiiiii#.',
    '.........i........',
    '.........i........',
    '.........i........',
    '.#.......i......#.',
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
    '.#iiiiiiiiiiiiii#.',
    '.f.......i......f.',
    '.f.......i......f.',
    '.f.......i......f.',
    '.#.......i......#.',
    '.###fff##########.',
    '..................',
  ],
], [
  [porch, '.SSSSSSSRRSSSSSSS.', porchWalk, hallWalk, hallWalk, doorWalk, doorWalk, doorways]
  + [backWalk for _ in std.range(1, 4)] + ['.SSSSSSSSSSSS..SS.', outside]
  for _ in [1, 2]
] + [
  [porch, '.SS...SSRRSS...SS.', porchWalk, hallWalkBay, hallWalkBay, doorWalkBay, doorWalk, doorways]
  + [backWalkBay for _ in std.range(1, 3)] + [backWalk, '.SSS...SSSSSS..SS.', outside]
  for _ in [3, 4]
] + [
  [porch, '.SS...SSSSSS...SS.', porchWalk, hallWalkBay, hallWalkBay, doorWalkBay, doorWalk, closed]
  + [backWalkBay for _ in std.range(1, 3)] + [backWalk, '.SSS...SSSSSSSSSS.', outside],
  [porch, closed, porchWalk, hallWalk, hallWalk, doorWalk, doorWalk, closed]
  + [backWalk for _ in std.range(1, 4)] + [closed, outside],
]);
// The slab runs out to the assembly edge as the cornice; the parapet and its
// coping stand on the wall line as a full ring. The stove's chimney rises through
// the slab and one course above the coping, so its smoke clears the parapet.
local flueRow = 6;
local withFlue(rows, mark) = [
  if z == flueRow then std.substr(rows[z], 0, 10) + mark + std.substr(rows[z], 11, 7) else rows[z]
  for z in std.range(0, std.length(rows) - 1)
];
local ring(edge) = [outside, '.' + edge + '.'] + ['.%s..............%s.' % [edge[0], edge[0]] for _ in std.range(2, 11)]
  + ['.' + edge + '.', outside];
local ringClaim = [outside, closed] + ['.SAAAAAAAAAAAAAAS.' for _ in std.range(2, 11)] + [closed, outside];
local roof = piece('rural_flat_house_roof', [18, 4, 14], [
  withFlue(['cccccccccccccccccc'] + ['crrrrrrrrrrrrrrrrc' for _ in std.range(1, 12)] + ['cccccccccccccccccc'], 'H'),
  withFlue(ring('################'), 'H'),
  withFlue(ring('kkkkkkkkkkkkkkkk'), 'H'),
  withFlue([outside for _ in std.range(0, 13)], 'h'),
], [
  ['SSSSSSSSSSSSSSSSSS' for _ in std.range(0, 13)],
  withFlue(ringClaim, 'S'),
  withFlue(ringClaim, 'S'),
  withFlue([outside for _ in std.range(0, 13)], 'S'),
]) + { palette+: chimney };
// Furnishing: no indoor toilet, as in a country house of the setting, whose privy
// stands in the yard. The front room is warmed by a wood stove against the kitchen
// wall, its chimney going up behind it; a sofa faces it from under the street
// window. Two beds share the back bedroom with a wardrobe and a shelf, and the
// kitchen keeps a table, a sink under its window and a cooker by the back door.
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
local backDoor(id, leaf, rows, claim) =
  piece(id, [2, 4, 1], [[rows] for _ in std.range(1, 4)], [[claim] for _ in std.range(1, 4)]) + { palette+: leaf };
local slot(id, at, size, choices) = { id: id, at: at, size: size, turn: 0, choices: choices };
local only(id) = [{ ref: { kind: 'piece', id: id }, weight: 1 }];
// Windows: the shared casement in each bay, its glass whole or gone.
local panes = [
  { id: 'clear', furniture: 'clear_casement_window', weight: 3 },
  { id: 'broken', furniture: 'broken_casement_window', weight: 2 },
];
local faces = {
  n: { size: [3, 3, 1], rows: ['WWW'], claim: ['SSS'] },
  s: { size: [3, 3, 1], rows: ['WWW'], claim: ['SSS'] },
  e: { size: [1, 3, 3], rows: ['W', 'W', 'W'], claim: ['S', 'S', 'S'] },
  w: { size: [1, 3, 3], rows: ['W', 'W', 'W'], claim: ['S', 'S', 'S'] },
};
local windowId(face, pane) = 'rural_flat_house_window_' + face + '_' + pane.id;
local windows = [
  piece(windowId(face, pane), faces[face].size, [faces[face].rows for _ in std.range(1, 3)],
    [faces[face].claim for _ in std.range(1, 3)])
  + { palette+: { W: { furniture: pane.furniture, facing: face, fixed: true } } }
  for face in std.objectFields(faces)
  for pane in panes
];
local window(id, at, face) = slot(id, at, faces[face].size,
  [{ ref: { kind: 'piece', id: windowId(face, pane) }, weight: pane.weight } for pane in panes]);
local rendered = {
  facade: { role: 'shell', block: 'plaster' },
  entrance_bay: { role: 'shell', block: 'plaster' },
  plinth: { role: 'shell', block: 'dressed_stone' },
  partition: { role: 'shell', block: 'plaster' },
  window_head: { role: 'trim', block: 'window_frame' },
  footing: { role: 'support', block: 'concrete' },
  floor: { role: 'interior_floor', block: 'planks' },
  kitchen_floor: { role: 'interior_floor', block: 'tiles' },
  roof_slab: { role: 'interior_floor', block: 'concrete' },
  cornice: { role: 'trim', block: 'concrete' },
  coping: { role: 'trim', block: 'concrete' },
  opening: { role: 'opening', block: 'air' },
};
{
  mapStyles: [
    { id: style, bindings: rendered },
    { id: 'rural_render_boarded', bindings: rendered { entrance_bay: { role: 'shell', block: 'plank_wall' } } },
  ],
  mapPieces: [
    base,
    shell,
    roof,
    backDoor('rural_flat_house_door_intact', { D: { furniture: 'wood_door', facing: 's' } }, 'DD', 'SS'),
    // The leaf is gone: an open doorway.
    backDoor('rural_flat_house_door_missing', {}, '..', 'AA'),
    living,
    bedroom,
    kitchen,
  ] + windows,
  mapAssemblies: [
    {
      id: 'rural_flat_roof_house',
      brief: 'rural_flat_roof_house',
      eligibility: { settlementKinds: ['rural'] },
      lootContext: context,
      size: [18, 11, 14],
      slots: [
        slot('base', [0, 0, 0], [18, 1, 14], only('rural_flat_house_base')),
        // The entrance bay is rendered like the walls or clad in boards.
        slot('shell', [0, 1, 0], [18, 6, 14], [
          { ref: { kind: 'piece', id: 'rural_flat_house_shell' }, weight: 1 },
          { ref: { kind: 'piece', id: 'rural_flat_house_shell', style: 'rural_render_boarded' }, weight: 1 },
        ]),
        slot('back_door', [13, 1, 12], [2, 4, 1], [
          { ref: { kind: 'piece', id: 'rural_flat_house_door_intact' }, weight: 4 },
          { ref: { kind: 'piece', id: 'rural_flat_house_door_missing' }, weight: 1 },
        ]),
        slot('living', [2, 1, 2], [14, 6, 5], only('rural_flat_house_living')),
        slot('bedroom', [2, 1, 8], [7, 6, 4], only('rural_flat_house_bedroom')),
        slot('kitchen', [10, 1, 8], [6, 6, 4], only('rural_flat_house_kitchen')),
        window('front_west', [3, 3, 1], 'n'),
        window('front_east', [12, 3, 1], 'n'),
        window('back', [4, 3, 12], 's'),
        window('west_front', [1, 3, 3], 'w'),
        window('west_back', [1, 3, 8], 'w'),
        window('east_front', [16, 3, 3], 'e'),
        window('east_back', [16, 3, 8], 'e'),
        slot('roof', [0, 7, 0], [18, 4, 14], only('rural_flat_house_roof')),
      ],
      joins: [],
      anchors: {
        living_room: { kind: 'standing', at: [7, 1, 6] },
        bedroom: { kind: 'standing', at: [5, 1, 10] },
        kitchen: { kind: 'standing', at: [13, 1, 10] },
      },
      ports: [],
      access: { ground: 'ground', entrance: [9, 1, 2], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
    },
  ],
}
