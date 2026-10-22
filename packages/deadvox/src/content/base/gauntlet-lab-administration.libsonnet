local level = import 'gauntlet-lab-level.libsonnet';
local scale = level.scale;
// Same glyph rules as level one: lowercase interiors, capital walls, digits delegate dressing bays.
// The stair hall and the shaft room sit where level one's stair and shaft land; the ways down leave from the
// centre (stair) and the north-east (kept grid shaft), each behind a bulkhead.
local plan = [
  '####################################',
  '###################OOOOOOOOVVVVVV###',
  'AAAAAAAAAAAAFFFFFFFFoooooooVvvvvV###',
  'Aaaaaaaaaaabff22f22Fo33ooooVvvvvV###',
  'Aaaaaaaaaaabff22f22Fo33ooooVvvvvV###',
  'AaaaaaaaaaaAf22ff22Foooo33oVvvvvV###',
  'AaaaaaaaaaaAf22ff22Foooo33oVvvvvV###',
  'AaaaaaaaaaaAfffffffFoooooooVvvvvV###',
  'AAiiAAAAAAAAFFFFlFFFOOOOOOtVVDDVV###',
  'HhhhhhhhhhhhhHqqqq|44q44qQccccccC###',
  'Hhhhh11hhhhhhjqqqq|44q44quccccccC###',
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
  'HhhhhhhhhhhhhH77nnnnnnnnnIccPssssU##',
  'HhhhhhhhhhhhhH77nn77n77nnIccPssssU##',
  'HhhhhhhhhhhhhH77nn77n77nnNccUssssU##',
  'HhhhhhhhhhhhhHnnnn77nnnnnNccUUUUUU##',
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
    finish: { floor: 'carpet', wall: 'plaster', base: 'plaster' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'l', at: [16, 8], axis: 'x', width: 2 }],
    dressing: [],
  },
  director: {
    tokens: ['o', 'O', '3', 't'], wall: 'O', floor: 'o', band: '$',
    finish: { floor: 'planks', wall: 'dressed', base: 'dressed' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 't', at: [26, 8], axis: 'x', width: 2 }],
    dressing: [],
  },
  shaft_down: {
    tokens: ['v', 'V'], wall: 'V', floor: 'v', band: '*',
    finish: { floor: 'floor', wall: 'metal', base: 'hazard_wall' }, ceilingDrop: 0, floorRise: 0, openings: [], dressing: [],
  },
  checkpoint: {
    tokens: ['q', 'Q', '4', 'u', '|'], wall: 'Q', floor: 'q', band: '&',
    finish: { floor: 'tiles', wall: 'plaster', base: 'hazard_wall' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'u', at: [25, 10], axis: 'z', width: 2 }],
    dressing: [],
  },
  stair_down: {
    tokens: ['e', 'E'], wall: 'E', floor: 'e', band: '(',
    finish: { floor: 'hazard', wall: 'concrete', base: 'metal' }, ceilingDrop: 0, floorRise: 0, openings: [], dressing: [],
  },
  briefing: {
    tokens: ['h', 'H', '1', 'j', 'y'], wall: 'H', floor: 'h', band: '^',
    finish: { floor: 'carpet', wall: 'dressed', base: 'plaster' }, ceilingDrop: 0, floorRise: 0,
    openings: [{ token: 'j', at: [13, 10], axis: 'z', width: 2 }, { token: 'y', at: [13, 19], axis: 'z', width: 2 }],
    dressing: [],
  },
  meeting: {
    tokens: ['m', 'M', '5', 'k'], wall: 'M', floor: 'm', band: '%',
    finish: { floor: 'carpet', wall: 'plaster', base: 'dressed' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'k', at: [17, 22], axis: 'x', width: 2 }],
    dressing: [],
  },
  wc: {
    tokens: ['w', 'W', '6', 'Y'], wall: 'W', floor: 'w', band: '~',
    finish: { floor: 'tiles', wall: 'concrete', base: 'metal' }, ceilingDrop: 2, floorRise: 0,
    openings: [{ token: 'Y', at: [23, 22], axis: 'x', width: 2 }],
    dressing: [],
  },
  canteen: {
    tokens: ['n', 'N', '7', 'I'], wall: 'N', floor: 'n', band: '+',
    finish: { floor: 'tiles', wall: 'plaster', base: 'dressed' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'I', at: [25, 24], axis: 'z', width: 4 }],
    dressing: [],
  },
  corridor: {
    tokens: ['c', 'C'], wall: 'C', floor: 'c', band: ')',
    finish: { floor: 'floor', wall: 'plaster', base: 'concrete' }, ceilingDrop: 2, floorRise: 0, openings: [], dressing: [],
  },
  archive: {
    tokens: ['r', 'R', '8', 'J'], wall: 'R', floor: 'r', band: '<',
    finish: { floor: 'floor', wall: 'concrete', base: 'metal' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'J', at: [28, 14], axis: 'z', width: 2 }],
    dressing: [],
  },
  store_east: {
    tokens: ['g', 'G', '9', 'L'], wall: 'G', floor: 'g', band: '>',
    finish: { floor: 'floor', wall: 'metal', base: 'concrete' }, ceilingDrop: 2, floorRise: 0,
    openings: [{ token: 'L', at: [28, 20], axis: 'z', width: 2 }],
    dressing: [],
  },
  store_south: {
    tokens: ['x', 'X', '0', 'T'], wall: 'X', floor: 'x', band: '[',
    finish: { floor: 'floor', wall: 'metal', base: 'concrete' }, ceilingDrop: 2, floorRise: 0,
    openings: [{ token: 'T', at: [28, 28], axis: 'z', width: 2 }],
    dressing: [],
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
local built = level.build({
  id: 'administration', base: base, plan: plan, rooms: rooms, context: { usage: ['Industrial'], tier: 'Tier1' },
  lock: 'gauntlet_lab_administration_seal', cardItem: 'gauntlet_lab_administration_card',
  card: { at: [22, 6] },
  through: arrivals,
  holes: [{ at: [stairAt[0], stairAt[2]], size: [level.stair.size[0], level.stair.size[2]] }, shaftLid],
  markers: [],
});
{
  rooms: rooms, plan: plan, size: built.size,
  standing: [6 * scale, base + 1, 24 * scale],
  stairAt: stairAt,
  stair: { upper: [stairAt[0] + 11, base + 1, stairAt[2] + 1], lower: [stairAt[0] + 1, stairAt[1], stairAt[2] + 1] },
  seal: { doors: [[20 * scale, base + 1, 12 * scale], [29 * scale, base + 1, 8 * scale]], key: built.key, standing: built.keyStanding },
  items: [{ id: 'gauntlet_lab_administration_card', name: 'Clearance keycard', category: 'tool', weight: 5, size: [1, 1], economy: { usage: ['Industrial'], tiers: ['Tier1'] }, model: 'folded_note', key: { lock: 'gauntlet_lab_administration_seal' } }],
  mapPieces: built.mapPieces,
  mapAssemblies: [built.mapAssembly],
}
