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
local base = piece('rural_flat_house_base', [18, 1, 14], [[
  '.......====.......',
  '.================.',
  '.=pppppppppppppp=.',
  '.=pppppppppppppp=.',
  '.=pppppppppppppp=.',
  '.=pppppppppppppp=.',
  '.=pppppppppppppp=.',
  '.================.',
  '.=pppppppp=ttttt=.',
  '.=pppppppp=ttttt=.',
  '.=pppppppp=ttttt=.',
  '.=pppppppp=ttttt=.',
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
// street side; the bedroom and kitchen share the back. The back doorway is left
// unclaimed for the door slot.
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
    '.s........i.....s.',
    '.s........i.....s.',
    '.s........i.....s.',
    '.s........i.....s.',
    '.ssssssssssss..ss.',
    '..................',
  ],
] + [
  [
    '..................',
    '.##..##b..b#..###.',
    '.#..............#.',
    '.#..............#.',
    '..................',
    '..................',
    '.#..............#.',
    '.#ii..iiiiii..ii#.',
    '.#........i.....#.',
    '..........i.......',
    '..........i.......',
    '.#........i.....#.',
    '.####..######..##.',
    '..................',
  ]
  for _ in [2, 3]
] + [
  [
    '..................',
    '.##ff##b..b#ff###.',
    '.#..............#.',
    '.#..............#.',
    '.f..............f.',
    '.f..............f.',
    '.#..............#.',
    '.#ii..iiiiii..ii#.',
    '.#........i.....#.',
    '.f........i.....f.',
    '.f........i.....f.',
    '.#........i.....#.',
    '.####ff######..##.',
    '..................',
  ],
] + [
  [
    '..................',
    '.######bbbb######.',
    '.#..............#.',
    '.#..............#.',
    '.#..............#.',
    '.#..............#.',
    '.#..............#.',
    '.#iiiiiiiiiiiiii#.',
    '.#........i.....#.',
    '.#........i.....#.',
    '.#........i.....#.',
    '.#........i.....#.',
    '.################.',
    '..................',
  ]
  for _ in [5, 6]
], [
  [
    '.......RRRR.......',
    '.SSSSSSSRRSSSSSSS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SSSRRSSSSSSRRSSS.',
    '.SRRRRRRRRSRRRRRS.',
    '.SRRRRRRRRSRRRRRS.',
    '.SRRRRRRRRSRRRRRS.',
    '.SRRRRRRRRSRRRRRS.',
    '.SSSSSSSSSSSS..SS.',
    '..................',
  ],
] + [
  [
    '.......RRRR.......',
    '.SSAASSSRRSSAASSS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.ARRRRRRRRRRRRRRA.',
    '.ARRRRRRRRRRRRRRA.',
    '.SRRRRRRRRRRRRRRS.',
    '.SSSRRSSSSSSRRSSS.',
    '.SRRRRRRRRSRRRRRS.',
    '.ARRRRRRRRSRRRRRA.',
    '.ARRRRRRRRSRRRRRA.',
    '.SRRRRRRRRSRRRRRS.',
    '.SSSSAASSSSSS..SS.',
    '..................',
  ]
  for _ in [2, 3]
] + [
  [
    '.......RRRR.......',
    '.SSSSSSSRRSSSSSSS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SSSRRSSSSSSRRSSS.',
    '.SRRRRRRRRSRRRRRS.',
    '.SRRRRRRRRSRRRRRS.',
    '.SRRRRRRRRSRRRRRS.',
    '.SRRRRRRRRSRRRRRS.',
    '.SSSSSSSSSSSS..SS.',
    '..................',
  ],
] + [
  [
    '.......RRRR.......',
    '.SSSSSSSSSSSSSSSS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SRRRRRRRRRRRRRRS.',
    '.SSSSSSSSSSSSSSSS.',
    '.SRRRRRRRRSRRRRRS.',
    '.SRRRRRRRRSRRRRRS.',
    '.SRRRRRRRRSRRRRRS.',
    '.SRRRRRRRRSRRRRRS.',
    '.SSSSSSSSSSSSSSSS.',
    '..................',
  ]
  for _ in [5, 6]
]);
// The slab runs out to the assembly edge as the cornice; the parapet and its
// coping stand on the wall line as a full ring.
local roof = piece('rural_flat_house_roof', [18, 3, 14], [
  [
    'cccccccccccccccccc',
  ] + [
    'crrrrrrrrrrrrrrrrc'
    for _ in std.range(1, 12)
  ] + [
    'cccccccccccccccccc',
  ],
  [
    '..................',
    '.################.',
  ] + [
    '.#..............#.'
    for _ in std.range(2, 11)
  ] + [
    '.################.',
    '..................',
  ],
  [
    '..................',
    '.kkkkkkkkkkkkkkkk.',
  ] + [
    '.k..............k.'
    for _ in std.range(2, 11)
  ] + [
    '.kkkkkkkkkkkkkkkk.',
    '..................',
  ],
], [
  [
    'SSSSSSSSSSSSSSSSSS'
    for _ in std.range(0, 13)
  ],
] + [
  [
    '..................',
    '.SSSSSSSSSSSSSSSS.',
  ] + [
    '.SAAAAAAAAAAAAAAS.'
    for _ in std.range(2, 11)
  ] + [
    '.SSSSSSSSSSSSSSSS.',
    '..................',
  ]
  for _ in [8, 9]
]);
local backDoor(id, leaf, rows, claim) =
  piece(id, [2, 4, 1], [[rows] for _ in std.range(1, 4)], [[claim] for _ in std.range(1, 4)]) + { palette+: leaf };
local slot(id, at, size, choices) = { id: id, at: at, size: size, turn: 0, choices: choices };
local only(id) = [{ ref: { kind: 'piece', id: id }, weight: 1 }];
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
  ],
  mapAssemblies: [
    {
      id: 'rural_flat_roof_house',
      brief: 'rural_flat_roof_house',
      eligibility: { settlementKinds: ['rural'] },
      lootContext: context,
      size: [18, 10, 14],
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
        slot('roof', [0, 7, 0], [18, 3, 14], only('rural_flat_house_roof')),
      ],
      joins: [],
      anchors: {
        living_room: { kind: 'standing', at: [6, 1, 4] },
        bedroom: { kind: 'standing', at: [5, 1, 10] },
        kitchen: { kind: 'standing', at: [13, 1, 10] },
      },
      ports: [],
      access: { ground: 'ground', entrance: [9, 1, 2], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
    },
  ],
}
