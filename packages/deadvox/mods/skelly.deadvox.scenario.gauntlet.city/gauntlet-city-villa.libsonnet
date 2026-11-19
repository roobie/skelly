// The detached town house: a curated answer to the `detached_town_house` brief in
// `building-briefs.jsonnet`. Why a briefed building is built this way:
// `packages/deadvox/docs/building-pathway.md`, "Worked example: detached town house".
//
// Layer marks: ',' is reserved circulation, '.' owned air, '-' a hole that a slot fills,
// and every other mark claims its cell; `claims` reads ownership from the marks so a
// layer and its claims cannot disagree.
local context = { usage: ['Residential'], tier: 'Tier1' };
local palette = {
  '.': { role: 'opening', material: 'opening' },
  ',': { role: 'opening', material: 'opening' },
  '-': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'facade' },
  '=': { role: 'support', material: 'footing' },
  p: { role: 'interior_floor', material: 'floor' },
  g: { role: 'support', material: 'lawn' },
  k: { role: 'support', material: 'paving' },
  t: { role: 'trim', material: 'tall_grass' },
};
local claims(layers) = [
  [std.join('', [std.get({ '-': '.', ',': 'R', '.': 'A' }, mark, 'S') for mark in std.stringChars(row)]) for row in layer]
  for layer in layers
];
local piece(id, size, layers, extra={}) = {
  id: id, size: size, style: 'villa_brick', lootContext: context,
  palette: palette + extra, layers: layers, ownership: { layers: claims(layers) },
  anchors: {}, ports: [],
};
local only(id) = [{ ref: { kind: 'piece', id: id }, weight: 1 }];
local slot(id, at, size, choices) = { id: id, at: at, size: size, turn: 0, choices: choices };

// Ground: footing under the walls, planks inside, a lawn and a paved path in the front garden.
local garden = 'ggggggggkkgggggggg';
local footing = '.================.';
local boards = 'g=pppppppppppppp=g';
local edge = 'g================g';
local ground = [[garden, garden, garden, garden, edge, boards, boards, boards, boards, boards, boards, boards, boards, boards, boards, edge]];

// Front garden, the street side: the path to the front door is reserved, the rest is planting.
local path = '........,,........';
local open = '..................';
local lawn = [path, path, path, path];
local sky = [open, open, open, open];
local hedge = '.BBB.CCC,,DDD.EEE.';
local tufts = [
  'ttwtttt.,,.ttttwtt', 'tSSttwt.,,.tttTTtt', 'tSStttt.,,.wttTTtt', 'tttttwt.,,.tttttwt',
];
local tall = ['........,,........', '.SS.....,,....TT..', '.SS.....,,....TT..', '........,,........'];
local shrub = { furniture: 'gauntlet_yard_shrub' };
local gardens = [
  piece('gauntlet_villa_garden_lawn', [18, 7, 4], [lawn, lawn, lawn, lawn, sky, sky, sky]),
  piece('gauntlet_villa_garden_hedged', [18, 7, 4],
    [[hedge, hedge, path, path], [hedge, hedge, path, path], lawn, lawn, sky, sky, sky],
    { B: shrub, C: shrub, D: shrub, E: shrub }),
  piece('gauntlet_villa_garden_overgrown', [18, 7, 4], [tufts, tall, tall, lawn, sky, sky, sky],
    { S: { furniture: 'shrub_tall' }, T: { furniture: 'shrub_tall' }, w: { furniture: 'weed_tuft' } }),
];

// Ground storey: an open front room with the stair along its west wall, and a galley kitchen
// behind a partition with an open doorway. Window bays, the stair and the furnished zones are holes.
local frontDoor = '.#######,,#######.';
local frontDoorBays = '.#----##,,##----#.';
local frontBays = '.#----######----#.';
local wall = '.################.';
local backBays = '.###----####----#.';
local hall = '.#,,,,,,,,#,,---#.';
local hallThrough = '.#,,,,,,,,,,,---#.';
local stairFoot = '.#--,,,,,,,,,---#.';
local stairSide = '.#--,,,,,,#,,---#.';
local room = '.#------,,#,,---#.';
local roomBay = '.#------,,#,,----.';
local groundShell = [
  [frontDoor, hall, hallThrough, stairFoot, stairSide, room, room, room, room, room, room, wall],
] + [
  [frontDoorBays, hall, hallThrough, stairFoot, stairSide, roomBay, roomBay, roomBay, roomBay, room, room, backBays]
  for _ in std.range(1, 3)
] + [
  [frontBays, hall, hall, stairSide, stairSide, roomBay, roomBay, roomBay, roomBay, room, room, backBays]
  for _ in std.range(1, 2)
] + [
  [wall, hall, hall, stairSide, stairSide, room, room, room, room, room, room, wall],
];

// The stair rises one block a tread, south along the west wall, onto the upper floor.
local stair = [
  ['pp', 'pp', 'pp', 'pp', 'pp', 'pp', 'pp', 'pp'],
  [',,', 'pp', 'pp', 'pp', 'pp', 'pp', 'pp', 'pp'],
  [',,', ',,', 'pp', 'pp', 'pp', 'pp', 'pp', 'pp'],
  [',,', ',,', ',,', 'pp', 'pp', 'pp', 'pp', 'pp'],
  [',,', ',,', ',,', ',,', 'pp', 'pp', 'pp', 'pp'],
  [',,', ',,', ',,', ',,', ',,', 'pp', 'pp', 'pp'],
  [',,', ',,', ',,', ',,', ',,', ',,', 'pp', 'pp'],
];

// The upper floor, open over the stair where a climbing body's head passes. Walls carry their own
// material through the slab, so a floor never shows as a stripe in a wall.
local deck = '.#pppppppp#ppppp#.';
local well = '.#,,pppppp#ppppp#.';
local floor = [[wall, deck, deck, deck, well, well, well, well, well, well, deck, wall]];

// Upper storey: a landing and corridor along the west, two bedrooms off it through open doorways.
local upperBack = '.##########----##.';
local landing = '.#,,,,#,,-------#.';
local landingDoor = '.#,,,,,,,-------#.';
local landingBay = '.#,,,,#,,--------.';
local landingDoorBay = '.#,,,,,,,--------.';
local partition = '.#,,,,###########.';
local upperShell = [
  [wall, landing, landingDoor, landingDoor, landing, partition, landing, landingDoor, landingDoor, landing, landing, wall],
] + [
  [frontBays, landingBay, landingDoorBay, landingDoorBay, landingBay, partition, landing, landingDoorBay, landingDoorBay, landingBay, landingBay, upperBack]
  for _ in std.range(1, 3)
] + [
  [frontBays, landingBay, landingBay, landingBay, landingBay, partition, landing, landingBay, landingBay, landingBay, landingBay, upperBack]
  for _ in std.range(1, 2)
] + [
  [wall, landing, landing, landing, landing, partition, landing, landing, landing, landing, landing, wall],
];

// Flush roofs (`packages/deadvox/docs/content.md`, "Authored structures and sites"): a sheet deck,
// or a slab deck with a waist-high parapet along the street and part of the west edge.
local roofDeck = '.#rrrr#rrrrrrrrr#.';
local roofOverPartition = '.#rrrr###########.';
local roofLayer = [wall, roofDeck, roofDeck, roofDeck, roofDeck, roofOverPartition, roofDeck, roofDeck, roofDeck, roofDeck, roofDeck, wall];
local roofAir = [open, open, open, open, open, open, open, open, open, open, open, open];
local parapet = ['.WWWWWWWWWWWWWWWW.', '.W................', '.W................', '.W................', '.W................', '.W................', open, open, open, open, open, open];
local roofs = [
  piece('gauntlet_villa_roof_sheet', [18, 3, 12], [roofLayer, roofAir, roofAir],
    { r: { role: 'interior_floor', material: 'roofing_sheet' } }),
  piece('gauntlet_villa_roof_parapet', [18, 3, 12], [roofLayer, parapet, parapet],
    { r: { role: 'interior_floor', material: 'roofing_slab' }, W: { furniture: 'gauntlet_roof_parapet' } }),
];

// Windows: a hinged window in each bay, its glass whole or gone.
local panes = [{ id: 'clear', furniture: 'clear_hinged_window', weight: 3 }, { id: 'broken', furniture: 'broken_hinged_window', weight: 2 }];
local faces = {
  n: { size: [4, 5, 1], rows: ['WWWW'] },
  s: { size: [4, 5, 1], rows: ['WWWW'] },
  e: { size: [1, 5, 4], rows: ['W', 'W', 'W', 'W'] },
};
local windowId(face, pane) = 'gauntlet_villa_window_' + face + '_' + pane.id;
local windows = [
  piece(windowId(face, pane), faces[face].size, [faces[face].rows for _ in std.range(1, 5)],
    { W: { furniture: pane.furniture, facing: face, fixed: true } })
  for face in std.objectFields(faces)
  for pane in panes
];
local window(id, at, face) = slot(id, at, faces[face].size,
  [{ ref: { kind: 'piece', id: windowId(face, pane) }, weight: pane.weight } for pane in panes]);

// Furnished zones. Each variant claims the same zone, so the reserved circulation around it is
// the same whichever is drawn.
local air(width, depth) = [std.join('', ['.' for _ in std.range(1, width)]) for _ in std.range(1, depth)];
local living = [
  piece('gauntlet_villa_living_lounge', [4, 7, 6],
    [['....', 'bbbb', 'bbbb', '....', 'aaaa', 'aaaa'], ['....', '....', '....', '....', 'aaaa', 'aaaa']]
    + [air(4, 6) for _ in std.range(1, 5)],
    { a: { furniture: 'sofa' }, b: { furniture: 'rug' } }),
  piece('gauntlet_villa_living_ransacked', [4, 7, 6],
    [['cc..', 'ccdd', 'ccdd', 'cc..', 'aaaa', 'aaaa'], ['....', '..dd', '..dd', '....', 'aaaa', 'aaaa']]
    + [air(4, 6) for _ in std.range(1, 5)],
    { a: { furniture: 'sofa' }, c: { furniture: 'shelf', tip: 'back', loot: 'shelf' }, d: { furniture: 'crate', loot: 'junk' } }),
];
local kitchen = [
  piece('gauntlet_villa_kitchen_fitted', [3, 7, 10],
    [
      ['..a', '..a', '..b', '..b', '..c', '..c', '..f', '..f', '.ee', '.ee'],
      ['..a', '..a', '..b', '..b', '..c', '..c', '..f', '..f', '.ee', '.ee'],
      ['...', '...', '...', '...', '...', '...', '...', '...', '.ee', '.ee'],
    ] + [air(3, 10) for _ in std.range(1, 4)],
    {
      a: { furniture: 'counter', facing: 'w', loot: 'kitchen_cupboard', fixed: true },
      b: { furniture: 'counter', facing: 'w', loot: 'kitchen_cupboard', fixed: true },
      c: { furniture: 'kitchen_cupboard', facing: 'w', loot: 'gauntlet_home_kitchen', fixed: true },
      f: { furniture: 'kitchen_cupboard', facing: 'w', loot: 'kitchen_cupboard', fixed: true },
      e: { furniture: 'wood_stove', facing: 'w' },
    }),
  piece('gauntlet_villa_kitchen_stripped', [3, 7, 10],
    [
      ['..a', '..a', '...', '...', '..c', '..c', 'ee.', '...', '.dd', '.dd'],
      ['..a', '..a', '...', '...', '..c', '..c', '...', '...', '.dd', '.dd'],
    ] + [air(3, 10) for _ in std.range(1, 5)],
    {
      a: { furniture: 'counter', facing: 'w', loot: 'gauntlet_searched', fixed: true },
      c: { furniture: 'kitchen_cupboard', facing: 'w', loot: 'gauntlet_searched', fixed: true },
      d: { furniture: 'crate', loot: 'junk' },
      e: { furniture: 'chair', tip: 'left' },
    }),
];
local bedroomThings = {
  b: { furniture: 'bed' },
  w: { furniture: 'wardrobe', facing: 's', loot: 'gauntlet_home_wardrobe' },
  x: { furniture: 'crate', loot: 'gauntlet_packed_bag' },
};
local frontBedroom = [
  piece('gauntlet_villa_front_bedroom_made', [7, 7, 4],
    [['ww...bb', '.....bb', '.....bb', '.....bb']]
    + [['ww.....', '.......', '.......', '.......'] for _ in std.range(1, 3)]
    + [air(7, 4) for _ in std.range(1, 3)],
    bedroomThings),
  piece('gauntlet_villa_front_bedroom_packed', [7, 7, 4],
    [['wwxx.bb', '..xx.bb', '.....bb', '.....bb'], ['wwxx...', '..xx...', '.......', '.......']]
    + [['ww.....', '.......', '.......', '.......'] for _ in std.range(1, 2)]
    + [air(7, 4) for _ in std.range(1, 3)],
    bedroomThings),
];
local backBedroom = [
  piece('gauntlet_villa_back_bedroom_made', [7, 7, 5],
    [['..ddd..', '..dddbb', '.....bb', '.....bb', 'ww...bb'], ['..ddd..', '..ddd..', '.......', '.......', 'ww.....']]
    + [['.......', '.......', '.......', '.......', 'ww.....'] for _ in std.range(1, 2)]
    + [air(7, 5) for _ in std.range(1, 3)],
    bedroomThings + { w: { furniture: 'wardrobe', loot: 'gauntlet_home_wardrobe' }, d: { furniture: 'desk', loot: 'desk' } }),
  piece('gauntlet_villa_back_bedroom_searched', [7, 7, 5],
    [['..cc...', '.....bb', '.....bb', '..xx.bb', 'wwxx.bb'], ['.......', '.......', '.......', '..xx...', 'wwxx...']]
    + [['.......', '.......', '.......', '.......', 'ww.....'] for _ in std.range(1, 2)]
    + [air(7, 5) for _ in std.range(1, 3)],
    bedroomThings + {
      w: { furniture: 'wardrobe', loot: 'gauntlet_searched' },
      x: { furniture: 'crate', loot: 'gauntlet_searched' },
      c: { furniture: 'chair', tip: 'left' },
    }),
];
local choices(pieces) = [{ ref: { kind: 'piece', id: p.id }, weight: 1 } for p in pieces];
local storeys = [{ id: 'ground_floor', floor: 1 }, { id: 'upper_floor', floor: 9 }];
local materials(facade) = {
  facade: { role: 'shell', block: facade },
  floor: { role: 'interior_floor', block: 'planks' },
  footing: { role: 'support', block: 'concrete' },
  lawn: { role: 'support', block: 'grass' },
  paving: { role: 'support', block: 'concrete' },
  roofing_sheet: { role: 'interior_floor', block: 'galvanized' },
  roofing_slab: { role: 'interior_floor', block: 'concrete' },
  tall_grass: { role: 'trim', block: 'tall_grass' },
  opening: { role: 'opening', block: 'air' },
};
{
  mapStyles: [
    { id: 'villa_brick', bindings: materials('brick') },
    { id: 'villa_rendered', bindings: materials('plaster') },
  ],
  mapPieces: [
    piece('gauntlet_villa_ground', [18, 1, 16], ground),
    piece('gauntlet_villa_ground_shell', [18, 7, 12], groundShell),
    piece('gauntlet_villa_stair', [2, 7, 8], stair),
    piece('gauntlet_villa_floor', [18, 1, 12], floor),
    piece('gauntlet_villa_upper_shell', [18, 7, 12], upperShell),
  ] + gardens + roofs + windows + living + kitchen + frontBedroom + backBedroom,
  mapAssemblies: [{
    id: 'gauntlet_city_villa', brief: 'detached_town_house', lootContext: context,
    eligibility: { settlementKinds: ['city'] },
    size: [18, 19, 16],
    slots: [
      slot('ground', [0, 0, 0], [18, 1, 16], only('gauntlet_villa_ground')),
      slot('garden', [0, 1, 0], [18, 7, 4], choices(gardens)),
      slot('ground_shell', [0, 1, 4], [18, 7, 12], only('gauntlet_villa_ground_shell')),
      slot('stair', [2, 1, 7], [2, 7, 8], only('gauntlet_villa_stair')),
      slot('living', [4, 1, 9], [4, 7, 6], choices(living)),
      slot('kitchen', [13, 1, 5], [3, 7, 10], choices(kitchen)),
      slot('floor', [0, 8, 4], [18, 1, 12], only('gauntlet_villa_floor')),
      slot('upper_shell', [0, 9, 4], [18, 7, 12], only('gauntlet_villa_upper_shell')),
      slot('front_bedroom', [9, 9, 5], [7, 7, 4], choices(frontBedroom)),
      slot('back_bedroom', [9, 9, 10], [7, 7, 5], choices(backBedroom)),
      slot('roof', [0, 16, 4], [18, 3, 12], [
        { ref: { kind: 'piece', id: 'gauntlet_villa_roof_sheet' }, weight: 3 },
        { ref: { kind: 'piece', id: 'gauntlet_villa_roof_parapet' }, weight: 2 },
      ]),
      window('ground_front_west', [2, 2, 4], 'n'),
      window('ground_front_east', [12, 2, 4], 'n'),
      window('ground_back_west', [4, 2, 15], 's'),
      window('ground_back_east', [12, 2, 15], 's'),
      window('ground_east', [16, 2, 9], 'e'),
      window('upper_front_west', [2, 10, 4], 'n'),
      window('upper_front_east', [12, 10, 4], 'n'),
      window('upper_back', [11, 10, 15], 's'),
      window('upper_east_front', [16, 10, 5], 'e'),
      window('upper_east_back', [16, 10, 11], 'e'),
    ],
    joins: [], ports: [],
    anchors: {
      living_room: { kind: 'standing', at: [9, 1, 11] },
      kitchen: { kind: 'standing', at: [12, 1, 10] },
      front_bedroom: { kind: 'standing', at: [8, 9, 7] },
      back_bedroom: { kind: 'standing', at: [8, 9, 12] },
    },
    access: { ground: 'ground_floor', entrance: [9, 1, 6], storeys: storeys, stairs: [] },
  }],
}
