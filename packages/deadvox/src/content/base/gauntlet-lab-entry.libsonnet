local level = import 'gauntlet-lab-level.libsonnet';
local scale = level.scale;
// Lowercase cells are room interiors; capitals are their walls. Digits delegate dressing bays.
// Rock closes unused excavation instead of turning it into perimeter circulation.
local plan = [
  '####################################',
  '###################TTTTTTTTTTTT#####',
  '###########FFFFFFFFTttttttttttT#####',
  '###########FfffffffTttttttttttT#####',
  'RRRRRRRRRRRFfffffffTttttttttttT#####',
  'RrrrHHHHHHrFfffffffTttttttttttT#####',
  'RrrrrrrrrrrFf55ffffatttttt44ttT#####',
  'RrrrrrrrrrrFf55ffffTtttttt44ttT#####',
  'RrrrrrrrrrrFfffffffTttttttttttT#####',
  'RrrrrrrrrrrFfffffffTtt66ttttttT#####',
  'RRRRRDD||||FFFbFFFFTtt66ttttttT#####',
  'Ccccc::2233ccccccccTttttttttttT#####',
  'Ccccccc2233cccccccchttttttttttT#####',
  'WWWWiWWWWWWWCCCCCkCTTTTTjjTTTTT#####',
  'WwwwwwwwwwwWlllllllllllllllllllL####',
  'Www11ww11wwWllllllllllll00ll00lL####',
  'Www11ww11wwWlllll00lllll00ll00lL####',
  'WwwwwwwwmwwWlllll00llllllllllllL####',
  'Ww11wwwwwwwyllllnllllllllllllllL####',
  'Ww11wwwwwwwWlllllllllEEllllll00L####',
  'WwwwwwwwwwwWll00lllllEEllllll00L####',
  'WWWWWWWWvWWWll00lllllllllllllllL####',
  'QQQQQQQQvQQQQQlllllllllllllllllL####',
  'Qeeeeeeeee77eQ' + 'LLLLLLzLLLLLL' + 'UUUUUU###',
  'Qee88ee88e77eqgggggggggggggUsSSsU###',
  'Qee88ee88eeeeQgggggggggggggUssssU###',
  'QeeeeeeeeeeeeugggggggggggggUssssU###',
  'QQQQQQQQQQQQQQgggggggggggggUUDDUU###',
  '##############GGGGGGGg99ogggggggG###',
  '####################Gg99gggg99ggG###',
  '####################Gggggggg99ggG###',
  '####################GGGG===GGGGGG###',
];
// Finishes, heights, opening widths and furnishing choices belong together so a room can be retuned as a whole.
local rooms = {
  control_lobby: {
    tokens: ['l', 'L', '0', 'E', 'n', 'k', 'z'], wall: 'L', floor: 'l', band: '!',
    finish: { floor: 'tiles', wall: 'plaster', base: 'plaster' }, ceilingDrop: 0, floorRise: 0,
    openings: [{ token: 'k', at: [17, 13], axis: 'x', width: 2 }, { token: 'z', at: [20, 23], axis: 'x', width: 2 }],
    dressing: [
      { id: 'lobby_console_dais', at: [24, 15], kit: 'console', rise: 1, fixture: 'working' },
      { id: 'lobby_desk', at: [17, 16], kit: 'desk', fixture: null },
      { id: 'lobby_bench', at: [28, 15], kit: 'bench', fixture: 'working' },
      { id: 'lobby_fallen_shelf', at: [29, 19], kit: 'fallen_shelf', fixture: null },
      { id: 'lobby_reception', at: [14, 20], kit: 'desk', fixture: null },
    ],
  },
  waiting: {
    tokens: ['w', 'W', '1', 'm', 'i', 'y', 'v'], wall: 'W', floor: 'w', band: '@',
    finish: { floor: 'carpet', wall: 'plaster', base: 'dressed' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'i', at: [4, 13], axis: 'x', width: 2 }, { token: 'y', at: [11, 18], axis: 'z', width: 2 }, { token: 'v', at: [8, 21], axis: 'x', width: 2, depth: 2 }],
    dressing: [
      { id: 'waiting_front', at: [3, 15], kit: 'bench', fixture: 'broken' },
      { id: 'waiting_back', at: [7, 15], kit: 'bench', fixture: null },
      { id: 'waiting_side', at: [2, 18], kit: 'bench', fixture: null },
    ],
  },
  security_post: {
    tokens: ['p', 'P', '2', '3', '|'], wall: 'P', floor: 'p', band: '$',
    finish: { floor: 'hazard', wall: 'plaster', base: 'metal' }, ceilingDrop: 1, floorRise: 1, openings: [],
    dressing: [
      { id: 'security_arms', at: [7, 11], kit: 'arms', fixture: null, loot: 'armoury_arms' },
      { id: 'security_control', at: [9, 11], kit: 'console', fixture: 'working' },
    ],
  },
  equipment_lockers: {
    tokens: ['e', 'Q', '7', '8', 'q', 'u'], wall: 'Q', floor: 'e', band: '%',
    finish: { floor: 'floor', wall: 'concrete', base: 'metal' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'q', at: [13, 24], axis: 'z', width: 2 }, { token: 'u', at: [13, 26], axis: 'z', width: 2 }],
    dressing: [
      { id: 'equipment_stock', at: [10, 23], kit: 'locker', fixture: null, loot: 'gauntlet_lab_entry_margin' },
      { id: 'equipment_cabinets_west', at: [3, 24], kit: 'cabinets', fixture: 'working' },
      { id: 'equipment_cabinets_east', at: [7, 24], kit: 'cabinets', fixture: null },
    ],
  },
  technical_room: {
    tokens: ['t', 'T', '4', '6', 'h', 'j'], wall: 'T', floor: 't', band: '&',
    finish: { floor: 'floor', wall: 'metal', base: 'plaster' }, ceilingDrop: 2, floorRise: 0,
    openings: [{ token: 'h', at: [19, 12], axis: 'z', width: 2 }, { token: 'j', at: [24, 13], axis: 'x', width: 3 }],
    dressing: [
      { id: 'technical_pump', at: [26, 6], kit: 'pump', fixture: 'broken' },
      { id: 'technical_spares', at: [22, 9], kit: 'cabinets', fixture: null },
    ],
  },
  freight_lift: {
    tokens: ['f', 'F', '5', 'a', 'b'], wall: 'F', floor: 'f', band: '(',
    finish: { floor: 'floor', wall: 'metal', base: 'hazard_wall' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'a', at: [19, 6], axis: 'z', width: 2 }, { token: 'b', at: [14, 10], axis: 'x', width: 2 }],
    dressing: [{ id: 'freight_lift', at: [13, 6], kit: 'lift', fixture: 'broken' }],
  },
  corridor: {
    tokens: ['c', 'C'], wall: 'C', floor: 'c', band: ')',
    finish: { floor: 'floor', wall: 'concrete', base: 'concrete' }, ceilingDrop: 2, floorRise: 0, openings: [], dressing: [],
  },
  stair: {
    tokens: ['r', 'R', 'H'], wall: 'R', floor: 'r', band: '*',
    finish: { floor: 'floor', wall: 'dressed', base: 'dressed' }, ceilingDrop: 0, floorRise: 0, openings: [], dressing: [],
  },
  shaft: {
    tokens: ['s', 'U', 'S'], wall: 'U', floor: 's', band: '+',
    finish: { floor: 'floor', wall: 'concrete', base: 'hazard_wall' }, ceilingDrop: 0, floorRise: 0, openings: [], dressing: [],
  },
  sewer_guard: {
    tokens: ['g', 'G', '9', 'o', '='], wall: 'G', floor: 'g', band: ',',
    finish: { floor: 'tiles', wall: 'concrete', base: 'concrete' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: '=', at: [24, 31], axis: 'x', width: 4, offset: 1, height: 5 }],
    dressing: [
      { id: 'guard_bench', at: [22, 28], kit: 'bench', fixture: null },
      { id: 'guard_desk', at: [28, 29], kit: 'desk', fixture: 'working' },
    ],
  },
  bulkhead: {
    tokens: ['D', ':'], wall: 'V', floor: 'b', band: ';',
    finish: { floor: 'hazard', wall: 'concrete', base: 'metal' }, ceilingDrop: 0, floorRise: 0,
    openings: [{ token: 'D', at: [5, 10], axis: 'x', width: 4, height: 5 }, { token: 'D', at: [29, 27], axis: 'x', width: 4, height: 5 }], dressing: [],
  },
};
local base = 32;
local hatch = { at: [21 * scale, 19 * scale + 1], size: [3, 2] };
local built = level.build({
  id: 'entry', base: base, plan: plan, rooms: rooms, context: { usage: ['Industrial'], tier: 'Tier1' },
  lock: 'gauntlet_lab_entry_seal', cardItem: 'gauntlet_lab_entry_card',
  card: { at: [24, 19] },
  through: [hatch],
  holes: [{ at: [4 * scale, 5 * scale], size: [12, 2] }, { at: [29 * scale, 24 * scale], size: [3, 2] }],
  markers: [[8 * scale, 1, 17 * scale], [16 * scale, 1, 18 * scale], [24 * scale, 1, 28 * scale]],
});
local size = built.size;
{
  rooms: rooms, plan: plan, size: size,
  loop: { from: [21, 33, 37], through: [25, 33, 37], to: [19, 34, 25], cut: { min: [22, 33, 36], size: [2, 5, 2] } },
  standing: [22 * scale, base + 1, 18 * scale],
  hatch: [21 * scale, base + 8, 19 * scale + 1],
  port: { x: 24 * scale + 1, width: 4, height: 5 },
  shaft: { ladder: [29 * scale + 1, base - 7, 24 * scale], upper: [29 * scale, base + 1, 24 * scale + 1], lower: [29 * scale, base - 7, 24 * scale + 1] },
  stairAt: [4 * scale, base - 7, 5 * scale],
  stair: { upper: [4 * scale + 11, base + 1, 5 * scale + 1], lower: [4 * scale + 1, base - 7, 5 * scale + 1] },
  seal: { doors: [[5 * scale, base + 1, 10 * scale], [29 * scale, base + 1, 27 * scale]], key: built.key, standing: built.keyStanding },
  items: [{ id: 'gauntlet_lab_entry_card', name: 'Security keycard', category: 'tool', weight: 5, size: [1, 1], economy: { usage: ['Industrial'], tiers: ['Tier1'] }, model: 'folded_note', key: { lock: 'gauntlet_lab_entry_seal' } }],
  mapPieces: built.mapPieces + [{
    id: 'gauntlet_lab_entry_cap', size: [size[0], 1, size[2]], style: 'concrete_lab', lootContext: { usage: ['Industrial'], tier: 'Tier1' },
    palette: { p: { role: 'interior_floor', material: 'floor' }, '.': { role: 'opening', material: 'air' } },
    layers: [built.expand(function(c, dx, dz, x, z) if built.through(dx, dz, x, z) then '.' else 'p')],
    ownership: { layers: [built.expand(function(c, dx, dz, x, z) if built.through(dx, dz, x, z) then '.' else 'S')] }, anchors: {}, ports: [],
  }],
  mapAssemblies: [built.mapAssembly],
  loot: [{ id: 'gauntlet_lab_entry_margin', rolls: [1, 2], entries: [
    { table: 'armoury_ammunition', weight: 2 }, { item: 'flashlight', weight: 1 }, { nothing: true, weight: 2 },
  ] }],
}
