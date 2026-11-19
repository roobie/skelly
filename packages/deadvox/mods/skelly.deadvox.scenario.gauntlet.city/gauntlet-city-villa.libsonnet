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
  i: { role: 'interior_wall', material: 'partition' },
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

// Ground storey: an open front room with the stair along its west wall, and a kitchen behind a
// partition, its back end given to the boiler and fridge. Doorways, window bays, the stair and the
// furnished zones are holes; a bay sits a metre above its floor, the sill height of a house rather
// than a shopfront.
local frontDoor = '.#######--#######.';
local frontDoorBays = '.##---##--##---##.';
local frontBays = '.##---######---##.';
local wall = '.################.';
// The roof drains to its east eave, and the downspout 'P' comes down the back corner of the east wall.
local backWall = '.################P';
local backBays = '.####---#########P';
local downspout = { P: { furniture: 'downspout', facing: 'e', fixed: true } };
local hall = '.#,,,,,,,,i,,---#.';
local hallThrough = '.#,,,,,,,,-,,---#.';
local stairFoot = '.#--,,,,,,-,,---#.';
local stairSide = '.#--,,,,,,i,,---#.';
local room = '.#------,,i,,---#.';
local roomBay = '.#------,,i,,----.';
local roomBack = '.#------,,i-----#.';
local groundShell = [
  [frontDoor, hall, hallThrough, stairFoot, stairSide, room, room, room, room, roomBack, roomBack, backWall]
  for _ in std.range(1, 2)
] + [
  [frontDoorBays, hall, hallThrough, stairFoot, stairSide, room, roomBay, roomBay, roomBay, roomBack, roomBack, backBays]
  for _ in std.range(1, 2)
] + [
  [frontBays, hall, hall, stairSide, stairSide, room, roomBay, roomBay, roomBay, roomBack, roomBack, backBays],
] + [
  [wall, hall, hall, stairSide, stairSide, room, room, room, room, roomBack, roomBack, backWall]
  for _ in std.range(1, 2)
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

// The boiler's flue rises from its back corner of the kitchen through the slab, the back bedroom and
// the roof, one chimney course a cell, so its smoke leaves above the roof.
local chimney = { H: { furniture: 'chimney', fixed: true } };

// The upper floor, open over the stair where a climbing body's head passes. Walls carry their own
// material through the slab, so a floor never shows as a stripe in a wall.
local deck = '.#ppppppppippppp#.';
local well = '.#,,ppppppippppp#.';
local flueDeck = '.#ppppppppipppHp#.';
local floor = [[wall, deck, deck, deck, well, well, well, well, well, well, flueDeck, backWall]];

// Upper storey: a bathroom at the front of the landing, and two bedrooms off the landing. The
// bathroom's back wall bridges the stair well on a header, because the slab under it must stay open
// where a climbing body's head passes. Bays are the window rows; doorways are holes to head height
// under a lintel.
local upperBack = '.##########---###P';
local bathFront = '.#------i-------#.';
local bathMiddle = '.#--,,--i-------#.';
local bathMiddleBay = '.#--,,--i--------.';
local bathBack = '.#--,,iii-------#.';
local bathBackBay = '.#--,,iii--------.';
local overStair = '.#iiiii,,-------#.';
local overStairBay = '.#iiiii,,--------.';
local overStairDoorBay = '.#ii---,,--------.';
local overStairDoor = '.#ii---,,-------#.';
local landing = '.#,,,,i,,-------#.';
local landingDoor = '.#,,,,-,,-------#.';
local landingBay = '.#,,,,i,,--------.';
local landingDoorBay = '.#,,,,-,,--------.';
local partition = '.#,,,,iiiiiiiiii#.';
local upperShell = [
  [wall, bathFront, bathMiddle, bathBack, overStairDoor, landingDoor, partition, landing, landingDoor, landingDoor, landing, backWall]
  for _ in std.range(1, 2)
] + [
  [frontBays, bathFront, bathMiddleBay, bathBackBay, overStairDoorBay, landingDoor, partition, landingBay, landingDoorBay, landingDoorBay, landing, upperBack]
  for _ in std.range(1, 2)
] + [
  [frontBays, bathFront, bathMiddleBay, bathBackBay, overStairBay, landing, partition, landingBay, landingBay, landingBay, landing, upperBack],
] + [
  [wall, bathFront, bathMiddle, bathBack, overStair, landing, partition, landing, landing, landing, landing, backWall]
  for _ in std.range(1, 2)
];

// Flush roofs (`packages/deadvox/docs/content.md`, "Authored structures and sites"): a deck with
// one covering course over it, sheet metal, or felt with a waist-high parapet along the street and
// part of the west edge. The chimney stands two courses above the covering. Either roof sheds its water
// to the open east eave, where a gutter beside the covering runs back to the outlet over the downspout.
local roofDeck = '.#rrrrirrrrrrrrr#.';
local roofOverBath = '.#rrrrrrirrrrrrr#.';
local roofOverBathWall = '.#rrrriiirrrrrrr#.';
local roofOverStairWall = '.#iirrirrrrrrrrr#.';
local roofOverPartition = '.#rrrriiiiiiiiii#.';
local roofFlue = '.#rrrrirrrrrrrHr#.';
local roofLayer = [
  wall, roofOverBath, roofOverBath, roofOverBathWall, roofOverStairWall, roofDeck, roofOverPartition,
  roofDeck, roofDeck, roofDeck, roofFlue, backWall,
];
local cover = '.ccccccccccccccccG';
local coverFlue = '.cccccccccccccHccG';
local coverOutlet = '.ccccccccccccccccO';
local covering = [cover, cover, cover, cover, cover, cover, cover, cover, cover, cover, coverFlue, coverOutlet];
local stack = '..............H...';
local stackTop = '..............h...';
local roofAir(flue) = [open, open, open, open, open, open, open, open, open, open, flue, open];
local parapet(flue) = ['.WWWWWWWWWWWWWWWW.', '.W................', '.W................', '.W................', '.W................', '.W................', open, open, open, open, flue, open];
local roofPalette(roofing) = chimney + downspout + {
  h: { furniture: 'chimney_top', fixed: true },
  G: { furniture: 'gutter', facing: 'e', fixed: true },
  O: { furniture: 'gutter_outlet', facing: 'e', fixed: true },
  r: { role: 'interior_floor', material: 'roof_deck' },
  c: { role: 'roof', material: roofing },
};
local roofs = [
  piece('gauntlet_villa_roof_sheet', [18, 4, 12], [roofLayer, covering, roofAir(stack), roofAir(stackTop)],
    roofPalette('roofing_sheet')),
  piece('gauntlet_villa_roof_parapet', [18, 4, 12], [roofLayer, covering, parapet(stack), parapet(stackTop)],
    roofPalette('roofing_felt') + { W: { furniture: 'gauntlet_roof_parapet' } }),
];

// Windows: a casement in each bay, its glass whole or gone.
local panes = [
  { id: 'clear', furniture: 'clear_casement_window', weight: 3 },
  { id: 'broken', furniture: 'broken_casement_window', weight: 2 },
];
local faces = {
  n: { size: [3, 3, 1], rows: ['WWW'] },
  s: { size: [3, 3, 1], rows: ['WWW'] },
  e: { size: [1, 3, 3], rows: ['W', 'W', 'W'] },
};
local windowId(face, pane) = 'gauntlet_villa_window_' + face + '_' + pane.id;
local windows = [
  piece(windowId(face, pane), faces[face].size, [faces[face].rows for _ in std.range(1, 3)],
    { W: { furniture: pane.furniture, facing: face, fixed: true } })
  for face in std.objectFields(faces)
  for pane in panes
];
local window(id, at, face) = slot(id, at, faces[face].size,
  [{ ref: { kind: 'piece', id: windowId(face, pane) }, weight: pane.weight } for pane in panes]);

// Doors: a leaf hung in the doorway, or the leaf gone and the doorway open. The front door is
// solid wood facing the street; the inner ones are flimsy. A doorway in a north-south wall is one
// cell thick along x.
local spans = {
  ns: { size: [2, 4, 1], rows: ['DD'], open: ['..'] },
  ew: { size: [1, 4, 2], rows: ['D', 'D'], open: ['.', '.'] },
};
local leaves = {
  front: { span: 'ns', door: { furniture: 'wood_door', facing: 'n' } },
  inner_ns: { span: 'ns', door: { furniture: 'flimsy_wood_door', facing: 's' } },
  inner_ew: { span: 'ew', door: { furniture: 'flimsy_wood_door', facing: 'e' } },
};
local doorId(leaf) = 'gauntlet_villa_door_' + leaf;
local missingId(span) = doorId('missing_' + span);
local doors = [
  piece(doorId(leaf), spans[leaves[leaf].span].size, [spans[leaves[leaf].span].rows for _ in std.range(1, 4)],
    { D: leaves[leaf].door })
  for leaf in std.objectFields(leaves)
] + [
  piece(missingId(span), spans[span].size, [spans[span].open for _ in std.range(1, 4)])
  for span in std.objectFields(spans)
];
local doorway(id, at, leaf) = slot(id, at, spans[leaves[leaf].span].size, [
  { ref: { kind: 'piece', id: doorId(leaf) }, weight: 4 },
  { ref: { kind: 'piece', id: missingId(leaves[leaf].span) }, weight: 1 },
]) + { doorway: true };

// Furnished zones. Each variant claims the same zone, so the reserved circulation around it is
// the same whichever is drawn. Sanitary, kitchen and heating fittings are fixed, so a stripped or
// searched variant keeps them where they were plumbed in; radiators stand under the windows.
local air(width, depth) = [std.join('', ['.' for _ in std.range(1, width)]) for _ in std.range(1, depth)];
local radiator = { R: { furniture: 'panel_radiator', fixed: true } };
local living = [
  piece('gauntlet_villa_living_lounge', [4, 7, 6],
    [['....', 'bbbb', 'bbbb', 'aaaa', 'aaaa', '.RR.'], ['....', '....', '....', 'aaaa', 'aaaa', '.RR.']]
    + [air(4, 6) for _ in std.range(1, 5)],
    radiator + { a: { furniture: 'sofa' }, b: { furniture: 'rug' } }),
  piece('gauntlet_villa_living_ransacked', [4, 7, 6],
    [['dd..', 'dd..', '..ee', 'aaaa', 'aaaa', '.RR.'], ['dd..', 'dd..', '....', 'aaaa', 'aaaa', '.RR.']]
    + [air(4, 6) for _ in std.range(1, 5)],
    radiator + { a: { furniture: 'sofa' }, d: { furniture: 'crate', loot: 'junk' }, e: { furniture: 'chair', tip: 'left' } }),
];
// The kitchen runs from the street window to the back wall: the table under the window, the sink,
// counter and cooker along the outer wall, the fridge and the boiler at the back. The walkway from
// the doorway stays reserved circulation, so the zone leaves it unclaimed.
local kitchenBack = [['--...' for _ in std.range(1, 8)] + rows for rows in [
  ['ffJJJ', 'ffJJJ'],
  ['..JJJ', '..JJJ'],
  ['.....', '...H.'],
]];
local kitchenFittings = chimney + {
  A: { furniture: 'counter', facing: 'w', fixed: true },
  s: { furniture: 'kitchen_sink', facing: 'w', fixed: true },
  o: { furniture: 'cooker', facing: 'w', fixed: true },
  f: { furniture: 'fridge' },
  J: { furniture: 'solid_fuel_boiler', fixed: true },
  T: { furniture: 'kitchen_table' },
};
local kitchenWall(chairs, counter) = [
  ['--TTT', '--TTT', '--' + chairs + 'A', counter, '--..s', '--..s', '--..o', '--..o', 'ffJJJ', 'ffJJJ'],
];
local kitchen = [
  piece('gauntlet_villa_kitchen_fitted', [5, 7, 10],
    kitchenWall('cc', '--..A') + kitchenWall('cc', '--..A')
    + [kitchenBack[0], kitchenBack[0], kitchenBack[1], kitchenBack[1], kitchenBack[2]],
    kitchenFittings + {
      A+: { loot: 'gauntlet_home_kitchen' },
      c: { furniture: 'chair' },
    }),
  piece('gauntlet_villa_kitchen_stripped', [5, 7, 10],
    kitchenWall('..', '--eeA') + kitchenWall('..', '--..A')
    + [kitchenBack[0], kitchenBack[0], kitchenBack[1], kitchenBack[1], kitchenBack[2]],
    kitchenFittings + {
      A+: { loot: 'gauntlet_searched' },
      e: { furniture: 'chair', tip: 'left' },
    }),
];
// The bathroom: the toilet against the west wall with the cabinet over it, the washbasin under the
// street window, the shower in the alcove beside it and a radiator by the door.
local bathroomThings(cabinetLoot) = radiator + {
  W: { furniture: 'toilet', facing: 'e', fixed: true },
  b: { furniture: 'washbasin', facing: 's', fixed: true },
  S: { furniture: 'shower_tray', facing: 'w', fixed: true },
  C: { furniture: 'bathroom_cabinet', facing: 'e', loot: cabinetLoot },
};
local bathroomLayers = [
  ['WWbbSS', 'WW--SS', 'RR----'],
  ['WWbbSS', 'WW--SS', 'RR----'],
  ['....SS', 'C.--SS', '..----'],
  ['....SS', '..--SS', '..----'],
] + [['......', '..--..', '..----'] for _ in std.range(1, 3)];
local bathroom = [
  piece('gauntlet_villa_bathroom_kept', [6, 7, 3], bathroomLayers, bathroomThings('bathroom_cabinet')),
  piece('gauntlet_villa_bathroom_searched', [6, 7, 3], bathroomLayers, bathroomThings('gauntlet_searched')),
];
local bedroomThings = radiator + {
  b: { furniture: 'bed' },
  w: { furniture: 'wardrobe', facing: 's', loot: 'gauntlet_home_wardrobe' },
  x: { furniture: 'crate', loot: 'gauntlet_packed_bag' },
};
local frontBedroomThings = bedroomThings + { R+: { facing: 's' } };
local frontBedroom = [
  piece('gauntlet_villa_front_bedroom_made', [7, 7, 5],
    [['ww.RR..', '.....bb', '.....bb', '.....bb', '.....bb'], ['ww.RR..', '.......', '.......', '.......', '.......']]
    + [['ww.....', '.......', '.......', '.......', '.......'] for _ in std.range(1, 2)]
    + [air(7, 5) for _ in std.range(1, 3)],
    frontBedroomThings),
  piece('gauntlet_villa_front_bedroom_packed', [7, 7, 5],
    [['ww.RR..', '.....bb', '..xx.bb', '..xx.bb', '.....bb'], ['ww.RR..', '.......', '..xx...', '..xx...', '.......']]
    + [['ww.....', '.......', '.......', '.......', '.......'] for _ in std.range(1, 2)]
    + [air(7, 5) for _ in std.range(1, 3)],
    frontBedroomThings),
];
// The back bedroom keeps the chimney breast in its back corner beside the desk under the window.
local flue(rows) = rows[0:3] + [std.substr(rows[3], 0, 5) + 'H' + std.substr(rows[3], 6, 1)];
local backBedroom = [
  piece('gauntlet_villa_back_bedroom_made', [7, 7, 4],
    [flue(['bbww..R', 'bb.c..R', 'bbddd..', 'bbddd..']), flue(['..ww..R', '...c..R', '..ddd..', '..ddd..'])]
    + [flue(['..ww...', '.......', '.......', '.......']) for _ in std.range(1, 2)]
    + [flue(air(7, 4)) for _ in std.range(1, 3)],
    bedroomThings + chimney + {
      R+: { facing: 'w' },
      c: { furniture: 'chair', facing: 's' },
      d: { furniture: 'desk', loot: 'desk' },
    }),
  piece('gauntlet_villa_back_bedroom_searched', [7, 7, 4],
    [flue(['bbww..R', 'bb..ccR', 'bbxx...', 'bbxx...']), flue(['..ww..R', '......R', '..xx...', '..xx...'])]
    + [flue(['..ww...', '.......', '.......', '.......']) for _ in std.range(1, 2)]
    + [flue(air(7, 4)) for _ in std.range(1, 3)],
    bedroomThings + chimney + {
      R+: { facing: 'w' },
      w: { furniture: 'wardrobe', facing: 's', loot: 'gauntlet_searched' },
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
  partition: { role: 'interior_wall', block: 'plaster' },
  roof_deck: { role: 'interior_floor', block: 'concrete' },
  roofing_sheet: { role: 'roof', block: 'galvanized' },
  roofing_felt: { role: 'roof', block: 'bitumen_felt' },
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
    piece('gauntlet_villa_ground_shell', [18, 7, 12], groundShell, downspout),
    piece('gauntlet_villa_stair', [2, 7, 8], stair),
    piece('gauntlet_villa_floor', [18, 1, 12], floor, chimney + downspout),
    piece('gauntlet_villa_upper_shell', [18, 7, 12], upperShell, downspout),
  ] + gardens + roofs + windows + doors + living + kitchen + bathroom + frontBedroom + backBedroom,
  mapAssemblies: [{
    id: 'gauntlet_city_villa', brief: 'detached_town_house', lootContext: context,
    eligibility: { settlementKinds: ['city'] },
    size: [18, 20, 16],
    slots: [
      slot('ground', [0, 0, 0], [18, 1, 16], only('gauntlet_villa_ground')),
      slot('garden', [0, 1, 0], [18, 7, 4], choices(gardens)),
      slot('ground_shell', [0, 1, 4], [18, 7, 12], only('gauntlet_villa_ground_shell')),
      doorway('front_door', [8, 1, 4], 'front'),
      doorway('kitchen_door', [10, 1, 6], 'inner_ew'),
      slot('stair', [2, 1, 7], [2, 7, 8], only('gauntlet_villa_stair')),
      slot('living', [4, 1, 9], [4, 7, 6], choices(living)),
      slot('kitchen', [11, 1, 5], [5, 7, 10], choices(kitchen)),
      slot('floor', [0, 8, 4], [18, 1, 12], only('gauntlet_villa_floor')),
      slot('upper_shell', [0, 9, 4], [18, 7, 12], only('gauntlet_villa_upper_shell')),
      doorway('bathroom_door', [4, 9, 8], 'inner_ns'),
      doorway('front_bedroom_door', [6, 9, 8], 'inner_ew'),
      doorway('back_bedroom_door', [6, 9, 12], 'inner_ew'),
      slot('bathroom', [2, 9, 5], [6, 7, 3], choices(bathroom)),
      slot('front_bedroom', [9, 9, 5], [7, 7, 5], choices(frontBedroom)),
      slot('back_bedroom', [9, 9, 11], [7, 7, 4], choices(backBedroom)),
      slot('roof', [0, 16, 4], [18, 4, 12], [
        { ref: { kind: 'piece', id: 'gauntlet_villa_roof_sheet' }, weight: 3 },
        { ref: { kind: 'piece', id: 'gauntlet_villa_roof_parapet' }, weight: 2 },
      ]),
      window('ground_front_west', [3, 3, 4], 'n'),
      window('ground_front_east', [12, 3, 4], 'n'),
      window('ground_back_west', [5, 3, 15], 's'),
      window('ground_east', [16, 3, 10], 'e'),
      window('upper_front_west', [3, 11, 4], 'n'),
      window('upper_front_east', [12, 11, 4], 'n'),
      window('upper_back', [11, 11, 15], 's'),
      window('upper_east_front', [16, 11, 6], 'e'),
      window('upper_east_back', [16, 11, 11], 'e'),
    ],
    joins: [], ports: [],
    anchors: {
      living_room: { kind: 'standing', at: [9, 1, 11] },
      kitchen: { kind: 'standing', at: [12, 1, 10] },
      bathroom: { kind: 'standing', at: [5, 9, 7] },
      front_bedroom: { kind: 'standing', at: [8, 9, 9] },
      back_bedroom: { kind: 'standing', at: [8, 9, 12] },
    },
    access: { ground: 'ground_floor', entrance: [9, 1, 6], storeys: storeys, stairs: [] },
  }],
}
