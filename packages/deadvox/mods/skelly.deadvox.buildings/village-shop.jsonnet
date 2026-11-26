// A two-storey village shop with the shopkeeper's flat above; it answers the `village_shop` brief. The shop
// and the flat each have a front door on the road, and the flat's hall reaches the store room behind the
// shop, so one walk from the entrance proves every room. Why a briefed building is built this way:
// `packages/deadvox/docs/building-pathway.md`.
//
// Layer marks: '_' is reserved circulation, ',' leaves the cell to the terrain, '-' is a hole a slot fills,
// '.' is owned air and every other mark claims its cell, so a layer and its claims cannot disagree.
local context = { usage: ['Residential'], tier: 'Tier1' };
local palette = {
  '_': { role: 'opening', material: 'opening' },
  ',': { role: 'opening', material: 'opening' },
  '-': { role: 'opening', material: 'opening' },
  '.': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'facade' },
  F: { role: 'trim', material: 'fascia' },
  i: { role: 'interior_wall', material: 'partition' },
  '=': { role: 'support', material: 'footing' },
  p: { role: 'interior_floor', material: 'floor' },
  t: { role: 'interior_floor', material: 'shop_floor' },
  q: { role: 'interior_floor', material: 'store_floor' },
  r: { role: 'interior_floor', material: 'roof_deck' },
  c: { role: 'roof', material: 'roofing' },
  j: { role: 'support', material: 'joists' },
};
local claims(layers) = [
  [std.join('', [std.get({ '_': 'R', ',': '.', '-': '.', '.': 'A' }, mark, 'S') for mark in std.stringChars(row)]) for row in layer]
  for layer in layers
];
local piece(id, size, layers, things={}) = {
  id: id, size: size, style: 'village_shop_render', lootContext: context,
  palette: palette + things, layers: layers, ownership: { layers: claims(layers) },
  anchors: {}, ports: [],
};
local only(id) = [{ ref: { kind: 'piece', id: id }, weight: 1 }];
local slot(id, at, size, choices) = { id: id, at: at, size: size, turn: 0, choices: choices };
local chimney = { H: { furniture: 'chimney', fixed: true }, h: { furniture: 'chimney_top', fixed: true } };

local outside = ',,,,,,,,,,,,,,,,,,,,';
local ring = ',##################,';

// Ground course: footing under the walls and the porch, planks in the hall, tiles in the shop and
// concrete in the store room.
local base = piece('village_shop_base', [20, 1, 18], [[
  ',,,=========,,,,,,,,',
  ',==================,',
] + [',=pppp=ttttttttttt=,' for _ in std.range(2, 9)] + [
  ',=pppp=============,',
] + [',=pppp=qqqqqqqqqqq=,' for _ in std.range(11, 15)] + [
  ',==================,',
  outside,
]]);

// Ground storey. The flat's hall runs down the west side with the stair along the outer wall; the shop
// fills the street side to the east, the store room behind it. The hall's door into the store room joins
// the flat's walk to the shop's. A porch is reserved in front of both front doors. Doorways, windows,
// the stair and the furnished zones are holes.
local porch = ',,,_________,,,,,,,,';
local front = {
  door: ',###--###--########,',
  doorBay: ',###--###--#----###,',
  bay: ',###########----###,',
  fascia: ',######FFFFFFFFFFF#,',
};
local hall = ',#____i--__-------#,';
local hallBay = ',-____i--__-------#,';
local stairSide = ',#--__i--__-------#,';
local stairSideBay = ',#--__i--__--------,';
local counterAisle = ',#--__i--________-#,';
local counterAisleBay = ',#--__i--________--,';
local storeDoorway = ',#--__iiiiiiiii--i#,';
local storeWall = ',#--__iiiiiiiiiiii#,';
local storeFront = ',#--__i--------__-#,';
local hallDoorway = ',#--__-__________-#,';
local storeWalk = ',#--__i__________-#,';
local nook = ',#..__i--------__-#,';
local back = {
  door: ',##############--##,',
  doorBay: ',#######---####--##,',
  bay: ',#######---########,',
  wall: ring,
};
local groundRows(frontRow, hallRow, sideRow, aisleRow, partition, hallDoor, backRow, beamWalk=hall) =
  [porch, frontRow, hallRow, hallRow, hallRow, beamWalk, sideRow, sideRow, aisleRow, counterAisle, partition, storeFront,
   hallDoor, hallDoor, nook, nook, backRow, outside];
local groundShell = piece('village_shop_ground_shell', [20, 7, 18], [
  groundRows(front.door, hall, stairSide, counterAisle, storeDoorway, hallDoorway, back.door),
  groundRows(front.doorBay, hall, stairSide, counterAisle, storeDoorway, hallDoorway, back.door),
] + [
  groundRows(front.doorBay, hallBay, stairSideBay, counterAisleBay, storeDoorway, hallDoorway, back.doorBay)
  for _ in [3, 4]
] + [
  groundRows(front.bay, hallBay, stairSideBay, counterAisleBay, storeWall, storeWalk, back.bay),
  groundRows(front.bay, hall, stairSide, counterAisle, storeWall, storeWalk, back.wall),
  groundRows(front.fascia, hall, stairSide, counterAisle, storeWall, storeWalk, back.wall, ',#____i-----------#,'),
]);

// The stair rises one block a tread, south along the west wall, onto the upper floor.
local stair = piece('village_shop_stair', [2, 7, 8], [
  [if row < course then '__' else 'pp' for row in std.range(0, 7)]
  for course in std.range(0, 6)
]);

// The upper floor, open over the stair where a climbing body's head passes. The outer walls carry their
// own material through the slab, so a floor never shows as a stripe in a wall.
local deck = ',#pppppppppppppppp#,';
local well = ',#__pppppppppppppp#,';
local floor = piece('village_shop_floor', [20, 1, 18], [
  [outside, ring] + [deck for _ in std.range(2, 6)] + [well for _ in std.range(7, 12)]
  + [deck for _ in std.range(13, 15)] + [ring, outside],
]);

// Upper storey: the living room and the kitchen across the street side, the bathroom and the bedroom at
// the back, all off a landing and a passage from the stair head. The stairwell stays open to the head of
// the flight, and the living room walls it off.
local upper = {
  front: ',###---######---###,',
  rooms: ',#--------i-------#,',
  roomsBay: ',---------i-------#,',
  entries: ',#--__----i__-----#,',
  entriesBay: ',---__----i__-----#,',
  doorways: ',#__--iiiii--iiiii#,',
  partition: ',#__iiiiiiiiiiiiii#,',
  passage: ',#_____________...#,',
  backDoorways: ',#____i--iiii--iii#,',
  backPartition: ',#____iiiiiiiiiiii#,',
  backEntries: ',#____i__--i-__---#,',
  backEntriesBay: ',#____i__--i-__----,',
  backRooms: ',#____i----i------#,',
  backRoomsBay: ',#____i----i-------,',
  backBay: ',#######---##---###,',
};
local upperRows(frontRow, west, westEntries, partition, backPartition, east, eastBack, backRow) =
  [outside, frontRow, upper.rooms, west, west, westEntries, upper.entries, upper.entries, partition, upper.passage,
   upper.passage, backPartition, east, east, eastBack, upper.backRooms, backRow, outside];
local upperShell = piece('village_shop_upper_shell', [20, 7, 18], [
  upperRows(ring, upper.rooms, upper.entries, upper.doorways, upper.backDoorways,
    upper.backEntries, upper.backRooms, ring)
  for _ in [9, 10]
] + [
  upperRows(upper.front, upper.roomsBay, upper.entriesBay, upper.doorways, upper.backDoorways,
    upper.backEntriesBay, upper.backRoomsBay, upper.backBay)
  for _ in [11, 12]
] + [
  upperRows(upper.front, upper.roomsBay, upper.entriesBay, upper.partition, upper.backPartition,
    upper.backEntriesBay, upper.backRoomsBay, upper.backBay),
] + [
  upperRows(ring, upper.rooms, upper.entries, upper.partition, upper.backPartition,
    upper.backEntries, upper.backRooms, ring)
  for _ in [14, 15]
]);

// A flat roof (`packages/deadvox/docs/content.md`, "Authored structures and sites"): a concrete deck with
// the walls rising through it, one felt course over it, and the stove's chimney two courses above. The
// roof sheds its water to the back eave, where a gutter beside the felt runs east to the outlet over the
// downspout 'P' at the back corner.
local rainwater = {
  P: { furniture: 'downspout', facing: 's', fixed: true },
  G: { furniture: 'gutter', facing: 's', fixed: true },
  O: { furniture: 'gutter_outlet', facing: 's', fixed: true },
};
local roofRow(inner, edge, flue, eave=outside) = [
  if z == 0 then outside
  else if z == 17 then eave
  else if z == 1 || z == 16 then edge
  else if z == 7 then flue
  else inner
  for z in std.range(0, 17)
];
local roof = piece('village_shop_roof', [20, 4, 18], [
  roofRow(',#rrrrrrrrrrrrrrrr#,', ring, ',#rrrrrrrHrrrrrrrr#,', ',,,,,,,,,,,,,,,,,,P,'),
  roofRow(',cccccccccccccccccc,', ',cccccccccccccccccc,', ',cccccccccHcccccccc,', ',GGGGGGGGGGGGGGGGGO,'),
  roofRow(',..................,', ',..................,', ',.........H........,'),
  roofRow(',..................,', ',..................,', ',.........h........,'),
], chimney + rainwater);
// The downspout's run down the back wall to the ground.
local downspout = piece('village_shop_downspout', [1, 15, 1], [['P'] for _ in std.range(1, 15)], rainwater);

// Windows: a hinged shopfront window over the display, casements elsewhere.
local windowSlots = import 'tools/jsonnet/lib/window-slots.libsonnet';
local windowBase = { style: 'village_shop_render', lootContext: context };
local casements = windowSlots('village_shop_window', windowBase, ['n', 's', 'e', 'w']);
local shopfront = windowSlots('village_shop_shopfront', windowBase, ['n'], 'hinged');
local windows = casements.mapPieces + shopfront.mapPieces;
local window = casements.slot;

// Doors: a leaf hung in the doorway, or the leaf gone and the doorway open. The street and yard doors are
// solid wood facing out; the inner ones are flimsy. A doorway in a north-south wall is one cell thick
// along x.
local spans = {
  ns: { size: [2, 4, 1], rows: ['DD'], open: ['..'] },
  ew: { size: [1, 4, 2], rows: ['D', 'D'], open: ['.', '.'] },
};
local leaves = {
  front: { span: 'ns', door: { furniture: 'wood_door', facing: 'n' } },
  back: { span: 'ns', door: { furniture: 'wood_door', facing: 's' } },
  inner_ns: { span: 'ns', door: { furniture: 'flimsy_wood_door', facing: 's' } },
  inner_ew: { span: 'ew', door: { furniture: 'flimsy_wood_door', facing: 'e' } },
};
local doorId(leaf) = 'village_shop_door_' + leaf;
local missingId(span) = doorId('missing_' + span);
local doors = [
  piece(doorId(leaf), spans[leaves[leaf].span].size, [spans[leaves[leaf].span].rows for _ in std.range(1, 4)],
    { D: leaves[leaf].door })
  for leaf in std.objectFields(leaves)
] + [
  piece(missingId(span), spans[span].size, [spans[span].open for _ in std.range(1, 4)]) + { aftermath: ['broken'] }
  for span in std.objectFields(spans)
];
local doorway(id, at, leaf) = slot(id, at, spans[leaves[leaf].span].size, [
  { ref: { kind: 'piece', id: doorId(leaf) }, weight: 4 },
  { ref: { kind: 'piece', id: missingId(leaves[leaf].span) }, weight: 1 },
]) + { doorway: true };

// Furnished zones; '-' leaves a cell to the shell's reserved walk. The shop keeps shelves along its
// walls, a chilled cabinet by the counter aisle and the counter across the east side, the shopkeeper's
// side behind it; the store room keeps shelves along the shop wall and crates of stock by the back door.
local air(width) = std.join('', ['.' for _ in std.range(1, width)]);
local shop = piece('village_shop_shop', [11, 7, 8], [
  ['e.--......h', 'e.--......h', 'f.--......k', 'f.--.j....k', 'g.--.AABBCC', 'g.--.......', 'FF--------.', 'FF--------.']
  for _ in [1, 2]
] + [
  ['e.--......h', 'e.--......h', 'f.--......k', 'f.--.j....k', 'g.--.......', 'g.--.......', 'FF--------.', 'FF--------.']
  for _ in [3, 4]
] + [
  ['..--.......', '..--.......', '..--.......', '..--.j.....', '..--.......', '..--.......', '..--------.', '..--------.']
  for _ in [5, 6]
] + [
  ['..--.......', '..--.......', '..--.......', 'jjjjjjjjjjj', '..--.......', '..--.......', '..--------.', '..--------.']
], {
  e: { furniture: 'shelf', facing: 'e', loot: 'snacks' },
  f: { furniture: 'shelf', facing: 'e', loot: 'kitchen_cupboard' },
  g: { furniture: 'shelf', facing: 'e', loot: 'snacks' },
  h: { furniture: 'shelf', facing: 'w', loot: 'shelf' },
  k: { furniture: 'shelf', facing: 'w', loot: 'kitchen_cupboard' },
  A: { furniture: 'counter', facing: 'n', loot: 'junk' },
  B: { furniture: 'counter', facing: 'n', loot: 'snacks' },
  C: { furniture: 'counter', facing: 'n', loot: 'junk' },
  F: { furniture: 'fridge', facing: 'e', loot: 'fridge' },
});
local store = piece('village_shop_store', [11, 7, 5], [
  ['eeffgghh--.', '----------.', '----------.', 'xxyyzz..--k', 'xxyyzz..--k']
  for _ in [1, 2]
] + [
  ['eeffgghh--.', '----------.', '----------.', '........--k', '........--k']
  for _ in [3, 4]
] + [
  [air(8) + '--.', '----------.', '----------.', air(8) + '--.', air(8) + '--.']
  for _ in [5, 6, 7]
], {
  e: { furniture: 'shelf', facing: 's', loot: 'kitchen_cupboard' },
  f: { furniture: 'shelf', facing: 's', loot: 'snacks' },
  g: { furniture: 'shelf', facing: 's', loot: 'kitchen_cupboard' },
  h: { furniture: 'shelf', facing: 's', loot: 'shelf' },
  k: { furniture: 'shelf', facing: 'w', loot: 'shelf' },
  x: { furniture: 'crate', loot: 'snacks' },
  y: { furniture: 'crate', loot: 'junk' },
  z: { furniture: 'crate', loot: 'kitchen_cupboard' },
});
// The flat's front room: a sofa under the street window and a wood stove against the passage wall, its
// chimney going up behind it to the roof. Its back corner walls off the stairwell.
local living = piece('village_shop_living', [8, 7, 6], [
  ['aaaa....', 'aaaa....', '........', 'e.--....', 'e.--..OO', 'ii--..OO']
  for _ in [1, 2]
] + [
  ['........', '........', '........', 'e.--....', 'e.--..OO', 'ii--..OO'],
  ['........', '........', '........', 'e.--....', 'e.--....', 'ii--...H'],
] + [
  ['........', '........', '........', '..--....', '..--....', 'ii--...H']
  for _ in [5, 6]
] + [
  ['........', '........', 'jjjjjjjj', '..--....', '..--....', 'ii--...H']
], chimney + {
  a: { furniture: 'sofa', facing: 's' },
  e: { furniture: 'shelf', facing: 'e', loot: 'shelf' },
  O: { furniture: 'wood_stove', fixed: true },
});
// The kitchen over the shop front: the table under the street window, the fridge beside it, and the
// counter, sink and cooker along the east wall.
local kitchen = piece('village_shop_kitchen', [7, 7, 6], [
  ['FFTTT.A', 'FFTTT.A', '...c..n', '--....n', '--....o', '--....o']
  for _ in [1, 2]
] + [
  ['FF.....', 'FF.....', '.......', '--.....', '--.....', '--.....']
  for _ in [3, 4]
] + [
  ['.......', '.......', '.......', '--.....', '--.....', '--.....']
  for _ in [5, 6]
] + [
  ['.......', '.......', 'jjjjjjj', '--.....', '--.....', '--.....']
], {
  F: { furniture: 'fridge', facing: 's', loot: 'fridge' },
  T: { furniture: 'kitchen_table' },
  c: { furniture: 'chair', facing: 'n' },
  A: { furniture: 'counter', facing: 'w', fixed: true, loot: 'kitchen_cupboard' },
  n: { furniture: 'kitchen_sink', facing: 'w', fixed: true },
  o: { furniture: 'cooker', facing: 'w', fixed: true },
});
// The bathroom: a shower and the toilet along the bedroom wall, the washbasin under the back window.
local bathroom = piece('village_shop_bathroom', [4, 7, 4], [
  ['--SS', '--SS', '..WW', 'bbWW']
  for _ in [1, 2]
] + [
  ['--SS', '--SS', '....', '....']
  for _ in [3, 4]
] + [
  ['--..', '--..', '....', '....']
  for _ in [5, 6, 7]
], {
  S: { furniture: 'shower_tray', facing: 'w', fixed: true },
  W: { furniture: 'toilet', facing: 'w', fixed: true },
  b: { furniture: 'washbasin', facing: 'n', fixed: true },
});
local bedroom = piece('village_shop_bedroom', [6, 7, 4], [
  ['e--.BB', 'e--.BB', '....BB', 'ww..BB'],
] + [
  ['e--...', 'e--...', '......', 'ww....']
  for _ in [2, 3, 4]
] + [
  ['.--...', '.--...', '......', '......']
  for _ in [5, 6, 7]
], {
  B: { furniture: 'bed' },
  e: { furniture: 'shelf', facing: 'e', loot: 'shelf' },
  w: { furniture: 'wardrobe', facing: 'n', loot: 'wardrobe' },
});

local materials(facade, fascia) = {
  facade: { role: 'shell', block: facade },
  joists: { role: 'support', block: 'steel_joist' },
  fascia: { role: 'trim', block: fascia },
  partition: { role: 'interior_wall', block: 'plaster' },
  footing: { role: 'support', block: 'concrete' },
  floor: { role: 'interior_floor', block: 'planks' },
  shop_floor: { role: 'interior_floor', block: 'tiles' },
  store_floor: { role: 'interior_floor', block: 'concrete' },
  roof_deck: { role: 'interior_floor', block: 'concrete' },
  roofing: { role: 'roof', block: 'bitumen_felt' },
  opening: { role: 'opening', block: 'air' },
};
{
  mapStyles: [
    { id: 'village_shop_render', bindings: materials('plaster', 'plank_wall') },
    { id: 'village_shop_brick', bindings: materials('brick', 'planks') },
  ],
  mapPieces: [base, groundShell, stair, floor, upperShell, roof, downspout, shop, store, living, kitchen, bathroom, bedroom]
    + windows + doors,
  mapAssemblies: [{
    id: 'village_shop',
    brief: 'village_shop',
    eligibility: { settlementKinds: ['rural'] },
    lootContext: context,
    size: [20, 20, 18],
    slots: [
      slot('base', [0, 0, 0], [20, 1, 18], only('village_shop_base')),
      slot('ground_shell', [0, 1, 0], [20, 7, 18], only('village_shop_ground_shell')),
      doorway('flat_door', [4, 1, 1], 'front'),
      doorway('shop_door', [9, 1, 1], 'front'),
      doorway('counter_door', [15, 1, 10], 'inner_ns'),
      doorway('hall_door', [6, 1, 12], 'inner_ew'),
      doorway('back_door', [15, 1, 16], 'back'),
      slot('stair', [2, 1, 6], [2, 7, 8], only('village_shop_stair')),
      slot('shop', [7, 1, 2], [11, 7, 8], only('village_shop_shop')),
      slot('store', [7, 1, 11], [11, 7, 5], only('village_shop_store')),
      shopfront.slot('shopfront', [12, 2, 1], 'n'),
      window('hall', [1, 3, 2], 'w'),
      window('shop_east', [18, 3, 6], 'e'),
      window('store_back', [8, 3, 16], 's'),
      slot('floor', [0, 8, 0], [20, 1, 18], only('village_shop_floor')),
      slot('upper_shell', [0, 9, 0], [20, 7, 18], only('village_shop_upper_shell')),
      doorway('living_door', [4, 9, 8], 'inner_ns'),
      doorway('kitchen_door', [11, 9, 8], 'inner_ns'),
      doorway('bathroom_door', [7, 9, 11], 'inner_ns'),
      doorway('bedroom_door', [13, 9, 11], 'inner_ns'),
      slot('living', [2, 9, 2], [8, 7, 6], only('village_shop_living')),
      slot('kitchen', [11, 9, 2], [7, 7, 6], only('village_shop_kitchen')),
      slot('bathroom', [7, 9, 12], [4, 7, 4], only('village_shop_bathroom')),
      slot('bedroom', [12, 9, 12], [6, 7, 4], only('village_shop_bedroom')),
      window('living_front', [4, 11, 1], 'n'),
      window('kitchen_front', [13, 11, 1], 'n'),
      window('living_west', [1, 11, 3], 'w'),
      window('bathroom_back', [8, 11, 16], 's'),
      window('bedroom_back', [13, 11, 16], 's'),
      window('bedroom_east', [18, 11, 12], 'e'),
      slot('downspout', [18, 1, 17], [1, 15, 1], only('village_shop_downspout')),
      slot('roof', [0, 16, 0], [20, 4, 18], only('village_shop_roof')),
    ],
    joins: [],
    ports: [],
    anchors: {
      shop: { kind: 'standing', at: [10, 1, 5] },
      store_room: { kind: 'standing', at: [11, 1, 13] },
      living_room: { kind: 'standing', at: [5, 9, 6] },
      kitchen: { kind: 'standing', at: [12, 9, 6] },
      bathroom: { kind: 'standing', at: [8, 9, 13] },
      bedroom: { kind: 'standing', at: [14, 9, 13] },
    },
    access: {
      ground: 'ground',
      entrance: [4, 1, 3],
      storeys: [{ id: 'ground', floor: 1 }, { id: 'upper', floor: 9 }],
      stairs: [],
    },
  }],
}
