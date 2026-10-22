local level = import 'gauntlet-lab-level.libsonnet';
local scale = level.scale;
// Same glyph rules as level one: lowercase interiors, capital walls, digits (or a room's `bay` token) delegate dressing bays.
// The stair hall and the shaft room sit where level one's stair and shaft land; the ways down leave from the
// centre (stair) and the north-east (kept grid shaft), each behind a bulkhead.
local plan = [
  '####################################',
  '###################OOOOOOOOVVVVVV###',
  'AAAAAAAAAAAAFFFFFFFFoooooooVvvvvV###',
  'Aaaaaaaaaaabff22f22Fo33ooooVvvvvV###',
  'Aaaaaaaaaaabff22f22Fo33ooooVvvvvV###',
  'AaaaaaaaaaaAf22ff22Foooo33oVvvvvVBBB',
  'AaaaaaaaaaaAf22ff22Foooo33oVvvvvV??B',
  'AaaaaaaaaaaAfffffffFoooooooVvvvvV??B',
  'AAiiAAAAAAAAFFFFlFFFOOOOOOtVVDDVVzzB',
  'HhhhhhhhhhhhhHqqqq|44q44qQccccccBzzB',
  'Hhhhh11hhhhhhjqqqq|44q44quccccccSzzB',
  'Hhhhh11hhhhhhHqqqqqqqqqqqQccRRRRRRRR',
  'HhhhhhhhhhhhhHQQQQQQDDQQQQccRr88r88R',
  'HhhhhhhhhhhhhHEeeeeeeeeeeEccRr88r88R',
  'Hhh11hh11hhhhHEeeeeeeeeeeEccJrrrrrrR',
  'Hhh11hh11hhhhHEeeeeeeeeeeEccRr88r88R',
  'HhhhhhhhhhhhhHEeeeeeeeeeeEccRr88r88R',
  'Hhh11hh11hhhhHEEEEEEEEEEEEccRrrrrrrR',
  'Hhh11hh11hhhhHm55mmmM6666WccRRRRRRRR',
  'Hhhhhhhhhhhhhym55mmmM6666WccGgg9999G',
  'HhhhhhhhhhhhhHm55mmmMwwwwWccLgg9999G',
  'HhhhhhhhhhhhhHm55mmmMwwwwWccGggggggG',
  'HhhhhhhhhhhhhHMMMkMMMWWYWWccGGGGGGGG',
  'HhhhhhhhhhhhhH77nnnnnnnnnNccPssssU##',
  'HhhhhhhhhhhhhH77nnnnnnnnnNccPssssU##',
  'HhhhhhhhhhhhhH77nn77n77nnNccPssssU##',
  'HhhhhhhhhhhhhH77nn77n77nnIccUssssU##',
  'HhhhhhhhhhhhhHnnnn77nnnnnIccUUUUUU##',
  'HHHHHHHHHHHHHHnnnn77nnnnnNccTxx00X##',
  '#############NNNNNNNNNNNNNCCXxx00X##',
  '############################XXXXXX##',
  '####################################',
];
// Offices in carpet and plaster, the director in planks and dressed stone, canteen and WCs in tiles, stores and
// archive in concrete: the level should not read as level one again.
local rooms = {
  stair_hall: {
    tokens: ['a', 'A', 'b', 'i'], wall: 'A', floor: 'a', band: '!',
    finish: { floor: 'floor', wall: 'concrete', base: 'dressed' }, ceilingDrop: 0, floorRise: 0,
    openings: [{ token: 'b', at: [11, 3], axis: 'z', width: 4 }, { token: 'i', at: [2, 8], axis: 'x', width: 4 }],
    dressing: [],
  },
  staff_office: {
    tokens: ['f', 'F', '2', 'l'], wall: 'F', floor: 'f', band: '@',
    finish: { floor: 'carpet', wall: 'plaster', base: 'plaster' }, ceilingDrop: 1, floorRise: 0, lootUsage: ['Residential'],
    openings: [{ token: 'l', at: [16, 8], axis: 'x', width: 2 }],
    dressing: [
      { id: 'staff_desk_north', at: [14, 3], kit: 'desk', fixture: 'working', loot: 'gauntlet_lab_administration_office' },
      { id: 'staff_desk_south', at: [13, 5], kit: 'desk', fixture: null },
      { id: 'staff_cabinets_north', at: [17, 3], kit: 'cabinets', fixture: null },
      { id: 'staff_cabinets_south', at: [17, 5], kit: 'cabinets', fixture: 'broken' },
    ],
  },
  director: {
    tokens: ['o', 'O', '3', 't'], wall: 'O', floor: 'o', band: '$',
    finish: { floor: 'planks', wall: 'dressed', base: 'dressed' }, ceilingDrop: 1, floorRise: 0, lootUsage: ['Residential'],
    openings: [{ token: 't', at: [26, 8], axis: 'x', width: 2 }],
    dressing: [
      { id: 'director_desk', at: [21, 3], kit: 'desk', fixture: 'working', loot: 'gauntlet_lab_administration_office' },
      { id: 'director_cabinets', at: [24, 5], kit: 'cabinets', fixture: null },
    ],
  },
  shaft_down: {
    tokens: ['v', 'V'], wall: 'V', floor: 'v', band: '*',
    finish: { floor: 'floor', wall: 'metal', base: 'hazard_wall' }, ceilingDrop: 0, floorRise: 0, openings: [], dressing: [],
  },
  checkpoint: {
    tokens: ['q', 'Q', '4', 'u', '|'], wall: 'Q', floor: 'q', band: '&',
    finish: { floor: 'tiles', wall: 'plaster', base: 'hazard_wall' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'u', at: [25, 10], axis: 'z', width: 2 }],
    dressing: [
      { id: 'checkpoint_console', at: [19, 9], kit: 'console', fixture: 'broken' },
      { id: 'checkpoint_desk', at: [22, 9], kit: 'desk', fixture: 'working' },
    ],
  },
  stair_down: {
    tokens: ['e', 'E'], wall: 'E', floor: 'e', band: '(',
    finish: { floor: 'hazard', wall: 'concrete', base: 'metal' }, ceilingDrop: 0, floorRise: 0, openings: [], dressing: [],
  },
  briefing: {
    tokens: ['h', 'H', '1', 'j', 'y'], wall: 'H', floor: 'h', band: '^',
    finish: { floor: 'carpet', wall: 'dressed', base: 'plaster' }, ceilingDrop: 0, floorRise: 0,
    openings: [{ token: 'j', at: [13, 10], axis: 'z', width: 2 }, { token: 'y', at: [13, 19], axis: 'z', width: 2 }],
    dressing: [
      { id: 'briefing_lectern', at: [5, 10], kit: 'desk', rise: 1, fixture: 'working' },
      { id: 'briefing_rows_front_west', at: [3, 14], kit: 'bench', fixture: 'broken' },
      { id: 'briefing_rows_front_east', at: [7, 14], kit: 'bench', fixture: null },
      { id: 'briefing_rows_back_west', at: [3, 17], kit: 'bench', fixture: null },
      { id: 'briefing_rows_back_east', at: [7, 17], kit: 'bench', fixture: 'working' },
    ],
  },
  meeting: {
    tokens: ['m', 'M', '5', 'k'], wall: 'M', floor: 'm', band: '%',
    finish: { floor: 'carpet', wall: 'plaster', base: 'dressed' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'k', at: [17, 22], axis: 'x', width: 2 }],
    dressing: [
      { id: 'meeting_table', at: [15, 18], kit: 'desk', fixture: 'broken' },
      { id: 'meeting_benches', at: [15, 20], kit: 'bench', fixture: null },
    ],
  },
  wc: {
    tokens: ['w', 'W', '6', 'Y'], wall: 'W', floor: 'w', band: '~',
    finish: { floor: 'tiles', wall: 'concrete', base: 'metal' }, ceilingDrop: 2, floorRise: 0,
    openings: [{ token: 'Y', at: [23, 22], axis: 'x', width: 2 }],
    dressing: [
      { id: 'wc_west', at: [21, 18], kit: 'wc', fixture: 'broken' },
      { id: 'wc_east', at: [23, 18], kit: 'wc', fixture: null },
    ],
  },
  canteen: {
    tokens: ['n', 'N', '7', 'I'], wall: 'N', floor: 'n', band: '+',
    finish: { floor: 'tiles', wall: 'plaster', base: 'dressed' }, ceilingDrop: 1, floorRise: 0, lootUsage: ['Residential'],
    // The door sits south of the shaft room's opening so the two don't face across the corridor.
    openings: [{ token: 'I', at: [25, 26], axis: 'z', width: 4 }],
    dressing: [
      { id: 'canteen_fridge', at: [14, 23], kit: 'fridge', fixture: 'broken', loot: 'gauntlet_lab_administration_canteen' },
      { id: 'canteen_cupboards', at: [14, 25], kit: 'kitchen', fixture: null, loot: 'gauntlet_lab_administration_canteen' },
      { id: 'canteen_table_west', at: [18, 25], kit: 'desk', fixture: 'working' },
      { id: 'canteen_table_east', at: [21, 25], kit: 'desk', fixture: null },
      { id: 'canteen_bench', at: [18, 27], kit: 'bench', fixture: null },
    ],
  },
  corridor: {
    tokens: ['c', 'C'], wall: 'C', floor: 'c', band: ')',
    finish: { floor: 'floor', wall: 'plaster', base: 'concrete' }, ceilingDrop: 2, floorRise: 0, openings: [], dressing: [],
  },
  archive: {
    tokens: ['r', 'R', '8', 'J'], wall: 'R', floor: 'r', band: '<',
    finish: { floor: 'floor', wall: 'concrete', base: 'metal' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'J', at: [28, 14], axis: 'z', width: 2 }],
    dressing: [
      { id: 'archive_row_north_west', at: [30, 12], kit: 'archive', fixture: 'working' },
      { id: 'archive_row_north_east', at: [33, 12], kit: 'archive', fixture: null },
      { id: 'archive_row_south_west', at: [30, 15], kit: 'fallen_shelf', fixture: null },
      { id: 'archive_row_south_east', at: [33, 15], kit: 'archive', fixture: 'broken' },
    ],
  },
  store_east: {
    tokens: ['g', 'G', '9', 'L'], wall: 'G', floor: 'g', band: '>',
    finish: { floor: 'floor', wall: 'metal', base: 'concrete' }, ceilingDrop: 2, floorRise: 0, lootUsage: ['Industrial'],
    openings: [{ token: 'L', at: [28, 20], axis: 'z', width: 2 }],
    dressing: [
      { id: 'store_east_shelves_west', at: [31, 19], kit: 'shelves', fixture: null, loot: 'gauntlet_lab_administration_store' },
      { id: 'store_east_shelves_east', at: [33, 19], kit: 'shelves', fixture: 'broken' },
    ],
  },
  store_south: {
    tokens: ['x', 'X', '0', 'T'], wall: 'X', floor: 'x', band: '[',
    finish: { floor: 'floor', wall: 'metal', base: 'concrete' }, ceilingDrop: 2, floorRise: 0, lootUsage: ['Industrial'],
    openings: [{ token: 'T', at: [28, 28], axis: 'z', width: 2 }],
    dressing: [{ id: 'store_south_shelves', at: [31, 28], kit: 'shelves', fixture: 'working', loot: 'gauntlet_lab_administration_store' }],
  },
  // The breaker's place until d509 wires it: a dead panel in a hazard-marked room off the corridor's blind end, found
  // by exploring rather than passed on the route.
  plant: {
    tokens: ['z', 'B', '?', 'S'], wall: 'B', floor: 'z', band: '}', bay: '?',
    finish: { floor: 'hazard', wall: 'metal', base: 'hazard_wall' }, ceilingDrop: 2, floorRise: 0,
    openings: [{ token: 'S', at: [32, 10], axis: 'z', width: 2 }],
    dressing: [{ id: 'plant_panel', at: [33, 6], kit: 'console', fixture: null }],
  },
  shaft_arrival: {
    tokens: ['s', 'U', 'P'], wall: 'U', floor: 's', band: ']',
    finish: { floor: 'floor', wall: 'concrete', base: 'hazard_wall' }, ceilingDrop: 0, floorRise: 0,
    // Kept shaft's landing stands on a block corner at the room's west edge, so the corridor opening spans it.
    openings: [{ token: 'P', at: [28, 23], axis: 'z', width: 6 }],
    dressing: [],
  },
  bulkhead: {
    tokens: ['D'], wall: 'Z', floor: 'd', band: ';',
    finish: { floor: 'hazard', wall: 'concrete', base: 'metal' }, ceilingDrop: 0, floorRise: 0,
    openings: [{ token: 'D', at: [20, 12], axis: 'x', width: 4, height: 5 }, { token: 'D', at: [29, 8], axis: 'x', width: 4, height: 5 }], dressing: [],
  },
};
local base = 24;
// Blocks the arriving and departing pieces own, from level one's stair and shaft and from the stair and kept shaft below.
local arrivals = [{ at: [4 * scale, 5 * scale], size: [12, 2] }, { at: [29 * scale, 24 * scale], size: [3, 2] }];
local stairAt = [31, base - 7, 29];
local shaftLid = { at: [29 * scale, 5 * scale], size: [3, 2] };
// The briefing hall is double height: its south end sinks a storey into the grid's south-west room slot, as the holding
// room rises into the storey above it. The well's walls stay whole so the grid cannot reach the hall, and its floor steps
// down a block at a time so a player can climb back out. Level three's rebuild must leave this slot to the well.
local well = { id: 'gauntlet_lab_administration_well', at: [4, base - self.size[1], 42], size: [18, 8, 14] };
local wellGlyph = function(x, y, z)
  if x == 0 || x == well.size[0] - 1 || z == 0 || z == well.size[2] - 1 then '='
  else if y <= std.max(0, well.size[1] - z) then 'p'
  else '.';
local wellLayer = function(y, glyph) [std.join('', [glyph(wellGlyph(x, y, z)) for x in std.range(0, well.size[0] - 1)]) for z in std.range(0, well.size[2] - 1)];
local wellPiece = {
  id: well.id, size: well.size, style: 'concrete_lab', lootContext: { usage: ['Industrial'], tier: 'Tier1' },
  palette: { '=': { role: 'shell', material: rooms.briefing.finish.wall }, p: { role: 'interior_floor', material: rooms.briefing.finish.floor },
    '.': { role: 'opening', material: 'air' } },
  layers: [wellLayer(y, function(g) g) for y in std.range(0, well.size[1] - 1)],
  ownership: { layers: [wellLayer(y, function(g) if g == '.' then 'A' else 'S') for y in std.range(0, well.size[1] - 1)] },
  anchors: {}, ports: [],
};
local built = level.build({
  id: 'administration', base: base, plan: plan, rooms: rooms, context: { usage: ['Industrial'], tier: 'Tier1' },
  lock: 'gauntlet_lab_administration_seal', cardItem: 'gauntlet_lab_administration_card',
  card: { container: 'director_desk' },
  through: arrivals,
  holes: [
    { at: [stairAt[0], stairAt[2]], size: [level.stair.size[0], level.stair.size[2]] }, shaftLid,
    { at: [well.at[0] + 1, well.at[2] + 1], size: [well.size[0] - 2, well.size[2] - 2] },
  ],
  // The briefing hall is the crowd room and the corridor carries the rest between the rooms; the stair hall stays quiet.
  // A spawn body reaches one block west and north of its marker, so each marker sits one block into its cell.
  markers: [[c[0] * scale + 1, 1, c[1] * scale + 1] for c in [
    [10, 12], [4, 19], [10, 20], [12, 25], [11, 17], [22, 23], [16, 27], [18, 19], [26, 17], [32, 14], [14, 7],
    [26, 13], [27, 25], [22, 6],
  ]],
});
{
  rooms: rooms, plan: plan, size: built.size,
  loop: { from: [5, 25, 13], through: [5, 25, 19], to: [31, 25, 21], cut: { min: [4, 25, 16], size: [4, 5, 2] } },
  standing: [6 * scale, base + 1, 20 * scale],
  stairAt: stairAt,
  well: well,
  stair: { upper: [stairAt[0] + 11, base + 1, stairAt[2] + 1], lower: [stairAt[0] + 1, stairAt[1], stairAt[2] + 1] },
  seal: { doors: [[20 * scale, base + 1, 12 * scale], [29 * scale, base + 1, 8 * scale]] } + built.cardSeal,
  fixedLoot: built.cardStock,
  items: [{ id: 'gauntlet_lab_administration_card', name: 'Clearance keycard', category: 'tool', weight: 5, size: [1, 1], economy: { usage: rooms.director.lootUsage, tiers: ['Tier1'] }, model: 'folded_note', key: { lock: 'gauntlet_lab_administration_seal' } }],
  mapPieces: built.mapPieces + [wellPiece],
  mapAssemblies: [built.mapAssembly],
  // Each room rolls what it was used for, kept as thin as the lab's other margins; offices hold desk clutter, not paper,
  // because the level carries no readables until the destination round.
  loot: [
    { id: 'gauntlet_lab_administration_canteen', rolls: [1, 1], entries: [
      { table: 'gauntlet_food_stock', weight: 3 }, { item: 'water_bottle', weight: 2 }, { item: 'soda_can', weight: 1 },
      { item: 'juice_carton', weight: 1 }, { item: 'chocolate_bar', weight: 1 }, { nothing: true, weight: 8 },
    ] },
    { id: 'gauntlet_lab_administration_store', rolls: [1, 1], entries: [
      { item: 'flashlight', weight: 1 }, { item: 'aa_battery', weight: 2 }, { item: 'duct_tape', weight: 1 }, { item: 'glowstick', weight: 1 },
      { table: 'gauntlet_medical_stock', weight: 1 }, { nothing: true, weight: 8 },
    ] },
    { id: 'gauntlet_lab_administration_office', rolls: [1, 1], entries: [
      { item: 'aa_battery', weight: 1 }, { item: 'lighter', weight: 1 }, { item: 'electrical_tape', weight: 1 }, { item: 'painkillers', weight: 1 },
      { item: 'cracked_phone', weight: 1 }, { nothing: true, weight: 5 },
    ] },
  ],
}
