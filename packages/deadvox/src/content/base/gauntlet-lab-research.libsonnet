local level = import 'gauntlet-lab-level.libsonnet';
local administration = import 'gauntlet-lab-administration.libsonnet';
local scale = level.scale;
// Same glyph rules as levels one and two. The staff side (stair hall, shaft room, rest room, WCs, changing room) lies
// north and west of the light well's hub; the labs and equipment rooms lie past the changing room and south of the hub.
// The stair down leaves north of the hub behind the decontamination lobby, the kept shaft south behind the cold lab.
// The south-west cells are level two's briefing well (`voids`).
local plan = [
  '####################################',
  '#BBBBBBBBB#############TTTTTT#######',
  '#B00b0000B#############T9999SSSSSS##',
  '#B00b0000B###VVVVVVVVVVV9999yssssS##',
  '#BbbbbbbbB###VvvvvvvvvvVttttSssssS##',
  '#B00bb00bB###VvvvvvvvvvVTTTTxssssS##',
  '#B00bb00bB###VvvvvvvvvvV88rrSssssS##',
  '#BbbbbbbbB###VVVVDDVVVVV88rrSssssS##',
  '#NNNJNNNNGGGGG##Lll7777LRRRpSSSoSSH#',
  '#Nnnn11nnGgggG##Lll7777LhhhhhhhhhhH#',
  '#N11n11nnzgggG##LllllllmhhhhhhhhhhH#',
  '#N11nnnnnGgggG##LllllllmhhhW|||WhhH#',
  '#EEEEEMEEG33gGAAAAAAAAAAhhh|wwwWhhH#',
  '#E22eeeeeG33gAaaaaaaaaaihhh|www/hhH#',
  '#E22eeeeeG33gAaaaaaaaaaAhhh|wwwWhhH#',
  '#EeeeeeeeG33gkaaaaaaaaaAhhhW|||WhhH#',
  '#E22e22eeIgggGaaaaaaaaajhhhhhhhhhhH#',
  '#E22e22eeCCCCCCCCCCCCAAAhhhhhhhhhhH#',
  '#Eee22eeeOc444444cccUUUUXUFFFFFFFFH#',
  '#Eee22eeeOc444444cccPuuuuuFff66ffF##',
  '#EEEEEEEEEccccccccccPuuuuuFff66ffF##',
  '###########CCCCCCDDCC5555uYffffffF##',
  '###############QqqqqQ5555uFff66ffF##',
  '###############QqqqqUUUUUUFff66ffF##',
  '###############QqqqqQ#####FffffffF##',
  '###############QqqqqQ#####Fff66ffF##',
  '###############QQQQQQ#####Fff66ffF##',
  '##########################FFFFFFFF##',
  '####################################',
  '####################################',
  '####################################',
  '####################################',
];
// Labs in tiles, staff rooms in carpet and plaster, equipment in concrete, the lobby and vestibule hazard-marked:
// the level should not read as level one or two again.
local rooms = {
  stair_hall: {
    tokens: ['a', 'A', 'i', 'j'], wall: 'A', floor: 'a', band: '!',
    finish: { floor: 'tiles', wall: 'dressed', base: 'metal' }, ceilingDrop: 0, floorRise: 0,
    // Two doors to the hub, so the staff side reaches it without the changing room.
    openings: [{ token: 'i', at: [23, 13], axis: 'z', width: 2 }, { token: 'j', at: [23, 16], axis: 'z', width: 2 }],
    dressing: [],
  },
  shaft_arrival: {
    tokens: ['s', 'S', 'o', 'x'], wall: 'S', floor: 's', band: '@',
    finish: { floor: 'floor', wall: 'concrete', base: 'hazard_wall' }, ceilingDrop: 0, floorRise: 0,
    // Level two's shaft lands on a block corner at the west wall, so a niche there gives the body room.
    openings: [{ token: 'o', at: [31, 8], axis: 'x', width: 2 }, { token: 'x', at: [28, 5], axis: 'z', width: 2 }],
    dressing: [],
  },
  rest: {
    tokens: ['r', 'R', '8', 'p'], wall: 'R', floor: 'r', band: '$',
    finish: { floor: 'carpet', wall: 'plaster', base: 'dressed' }, ceilingDrop: 1, floorRise: 0, lootUsage: ['Residential'],
    openings: [{ token: 'p', at: [27, 8], axis: 'x', width: 2 }],
    dressing: [{ id: 'rest_lounge', at: [24, 6], kit: 'lounge', fixture: 'working', loot: 'gauntlet_lab_research_margin' }],
  },
  wc: {
    tokens: ['t', 'T', '9', 'y'], wall: 'T', floor: 't', band: '%',
    finish: { floor: 'tiles', wall: 'plaster', base: 'dressed' }, ceilingDrop: 2, floorRise: 0,
    openings: [{ token: 'y', at: [28, 3], axis: 'z', width: 2 }],
    dressing: [
      { id: 'wc_west', at: [24, 2], kit: 'wc', fixture: null },
      { id: 'wc_east', at: [26, 2], kit: 'wc', fixture: 'broken' },
    ],
  },
  hub: {
    tokens: ['h', 'H'], wall: 'H', floor: 'h', band: '^',
    finish: { floor: 'floor', wall: 'plaster', base: 'metal' }, ceilingDrop: 0, floorRise: 0, openings: [], dressing: [],
  },
  // The landmark: a capped riser room, full height and walled, with wire panels so the hub sees in and nothing on its floor.
  well: {
    tokens: ['w', 'W', '|', '/'], wall: 'W', floor: 'w', band: '&',
    finish: { floor: 'hazard', wall: 'metal', base: 'hazard_wall' }, ceilingDrop: 0, floorRise: 0,
    openings: [{ token: '/', at: [31, 13], axis: 'z', width: 2 }],
    dressing: [],
  },
  changing: {
    tokens: ['g', 'G', '3', 'k', 'z', 'I'], wall: 'G', floor: 'g', band: ')',
    finish: { floor: 'tiles', wall: 'concrete', base: 'dressed' }, ceilingDrop: 2, floorRise: 0,
    openings: [
      { token: 'k', at: [13, 15], axis: 'z', width: 2 }, { token: 'z', at: [9, 10], axis: 'z', width: 2 },
      { token: 'I', at: [9, 16], axis: 'z', width: 2 },
    ],
    dressing: [
      { id: 'changing_lockers', at: [10, 12], kit: 'lockers', fixture: 'working', loot: 'gauntlet_lab_research_margin' },
      { id: 'changing_bench', at: [10, 14], kit: 'bench', fixture: null },
    ],
  },
  lobby: {
    tokens: ['l', 'L', '7', 'm'], wall: 'L', floor: 'l', band: '*',
    finish: { floor: 'hazard', wall: 'metal', base: 'hazard_wall' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'm', at: [23, 10], axis: 'z', width: 4 }],
    dressing: [
      { id: 'lobby_basins', at: [19, 8], kit: 'basins', fixture: 'working' },
      { id: 'lobby_lockers', at: [21, 8], kit: 'lockers', fixture: 'broken', loot: 'gauntlet_lab_research_margin' },
    ],
  },
  vestibule: {
    tokens: ['v', 'V'], wall: 'V', floor: 'v', band: '(',
    finish: { floor: 'hazard', wall: 'concrete', base: 'metal' }, ceilingDrop: 1, floorRise: 0, openings: [], dressing: [],
  },
  // The breached lab is the level's densest threat room and lies off the main route; the card is in a dead researcher's
  // pockets here (`packages/deadvox/DESIGN.md`, "Gauntlet").
  lab_breached: {
    tokens: ['b', 'B', '0'], wall: 'B', floor: 'b', band: '+',
    finish: { floor: 'tiles', wall: 'metal', base: 'hazard_wall' }, ceilingDrop: 0, floorRise: 0, lootUsage: ['Medical'],
    openings: [],
    dressing: [
      { id: 'breached_bay', at: [2, 2], kit: 'breached', fixture: 'broken' },
      { id: 'breached_containment', at: [5, 2], kit: 'containment', fixture: 'broken' },
      { id: 'breached_researcher', at: [7, 2], kit: 'body', fixture: null },
      { id: 'breached_spill', at: [2, 5], kit: 'spill', fixture: 'working' },
      { id: 'breached_shelf', at: [6, 5], kit: 'fallen_shelf', fixture: 'broken' },
    ],
  },
  equip_north: {
    tokens: ['n', 'N', '1', 'J', 'M'], wall: 'N', floor: 'n', band: '~',
    finish: { floor: 'floor', wall: 'concrete', base: 'metal' }, ceilingDrop: 1, floorRise: 0, lootUsage: ['Industrial'],
    openings: [{ token: 'J', at: [4, 8], axis: 'x', width: 2 }, { token: 'M', at: [6, 12], axis: 'x', width: 2 }],
    dressing: [
      // The plant stands on a one-block plinth.
      { id: 'equip_north_pump', at: [2, 10], kit: 'pump', rise: 1, fixture: 'working' },
      { id: 'equip_north_cabinet', at: [5, 9], kit: 'sterilizer', fixture: null, loot: 'gauntlet_lab_research_margin' },
    ],
  },
  lab_exam: {
    tokens: ['e', 'E', '2', 'O'], wall: 'E', floor: 'e', band: '<',
    finish: { floor: 'tiles', wall: 'plaster', base: 'metal' }, ceilingDrop: 0, floorRise: 0, lootUsage: ['Medical'],
    openings: [{ token: 'O', at: [9, 18], axis: 'z', width: 4 }],
    dressing: [
      { id: 'exam_slab_north', at: [2, 13], kit: 'exam', fixture: 'working' },
      { id: 'exam_couch', at: [2, 16], kit: 'couch', fixture: null },
      { id: 'exam_slab_south', at: [5, 16], kit: 'exam', fixture: 'broken' },
      { id: 'exam_files', at: [4, 18], kit: 'files', fixture: null },
    ],
  },
  lab_cold: {
    tokens: ['c', 'C', '4', 'P'], wall: 'C', floor: 'c', band: '>',
    finish: { floor: 'tiles', wall: 'metal', base: 'plaster' }, ceilingDrop: 0, floorRise: 0, lootUsage: ['Medical'],
    openings: [{ token: 'P', at: [20, 19], axis: 'z', width: 4 }],
    dressing: [
      { id: 'cold_bank_west', at: [11, 18], kit: 'cold_store', fixture: 'broken' },
      { id: 'cold_bank_east', at: [13, 18], kit: 'cold_store', fixture: 'working' },
      { id: 'cold_files', at: [15, 18], kit: 'files', fixture: null },
    ],
  },
  shaft_down: {
    tokens: ['q', 'Q'], wall: 'Q', floor: 'q', band: '[',
    finish: { floor: 'floor', wall: 'metal', base: 'hazard_wall' }, ceilingDrop: 0, floorRise: 0, openings: [], dressing: [],
  },
  equip_south: {
    tokens: ['u', 'U', '5', 'X', 'Y'], wall: 'U', floor: 'u', band: ']',
    finish: { floor: 'floor', wall: 'concrete', base: 'hazard_wall' }, ceilingDrop: 1, floorRise: 0, lootUsage: ['Industrial'],
    openings: [{ token: 'X', at: [24, 18], axis: 'x', width: 2 }, { token: 'Y', at: [26, 21], axis: 'z', width: 2 }],
    dressing: [
      { id: 'equip_south_pump', at: [21, 21], kit: 'pump', rise: 1, fixture: 'broken' },
      { id: 'equip_south_cabinet', at: [23, 21], kit: 'sterilizer', fixture: 'working', loot: 'gauntlet_lab_research_margin' },
    ],
  },
  lab_culture: {
    tokens: ['f', 'F', '6'], wall: 'F', floor: 'f', band: '{',
    finish: { floor: 'tiles', wall: 'plaster', base: 'dressed' }, ceilingDrop: 0, floorRise: 0, lootUsage: ['Medical'],
    openings: [],
    dressing: [
      { id: 'culture_north', at: [29, 19], kit: 'culture', fixture: 'working' },
      { id: 'culture_bench', at: [29, 22], kit: 'bench', fixture: null },
      { id: 'culture_south', at: [29, 25], kit: 'culture', fixture: 'broken' },
    ],
  },
  bulkhead: {
    tokens: ['D'], wall: 'Z', floor: 'd', band: ';',
    finish: { floor: 'hazard', wall: 'concrete', base: 'metal' }, ceilingDrop: 0, floorRise: 0,
    openings: [{ token: 'D', at: [17, 7], axis: 'x', width: 4, height: 5 }, { token: 'D', at: [17, 21], axis: 'x', width: 4, height: 5 }], dressing: [],
  },
};
local base = 16;
local stairAt = [31, base - 7, 10];
local shaftLid = { at: [34, 48], size: [3, 2] };
local built = level.build({
  id: 'research', base: base, plan: plan, rooms: rooms, context: { usage: ['Industrial', 'Medical'], tier: 'Tier1' },
  range: { tier: 'Tier3', lowerTiers: true },
  lock: 'gauntlet_lab_research_seal', cardItem: 'gauntlet_lab_research_card',
  card: { container: 'breached_researcher' },
  // Level two's stair and kept shaft hang into this level.
  through: [
    { at: [administration.stairAt[0], administration.stairAt[2]], size: [level.stair.size[0], level.stair.size[2]] },
    { at: administration.shaftLid.at, size: administration.shaftLid.size },
  ],
  holes: [{ at: [stairAt[0], stairAt[2]], size: [level.stair.size[0], level.stair.size[2]] }, shaftLid],
  voids: [{ at: [administration.well.at[0], administration.well.at[2]], size: [administration.well.size[0], administration.well.size[2]] }],
  // The breached lab and the hub carry most cells; the stair hall and the staff rooms stay quiet.
  markers: [[c[0] * scale + 1, 1, c[1] * scale + 1] for c in [
    [4, 4], [8, 6], [5, 7], [25, 14], [32, 10], [29, 17], [27, 24], [31, 20], [7, 14], [12, 20], [25, 20], [7, 10], [18, 10],
  ]],
});
{
  rooms: rooms, plan: plan, size: built.size,
  // Round the changing room's door to the stair hall: cut it and the hub, the south equipment room and the cold lab
  // still reach the exam lab.
  loop: { from: [29, base + 1, 31], through: [25, base + 1, 31], to: [12, base + 1, 29], cut: { min: [26, base + 1, 30], size: [2, 5, 2] } },
  standing: [24 * scale + 1, base + 1, 9 * scale + 1],
  // The stair is turned, so it rises westward and its foot lands at the east end of the join below.
  stairAt: stairAt,
  stair: { upper: [stairAt[0] + 1, base + 1, stairAt[2] + 1], lower: [stairAt[0] + 11, stairAt[1], stairAt[2] + 1] },
  shaft: { ladder: [shaftLid.at[0] + 1, base - 7, shaftLid.at[1]], upper: [shaftLid.at[0], base + 1, shaftLid.at[1] + 1], lower: [shaftLid.at[0], base - 7, shaftLid.at[1] + 1] },
  seal: { doors: [[17 * scale, base + 1, 7 * scale], [17 * scale, base + 1, 21 * scale]] } + built.cardSeal,
  fixedLoot: built.cardStock,
  items: [{ id: 'gauntlet_lab_research_card', notLoot: true, name: 'Research keycard', category: 'tool', size: [1, 1], economy: { usage: [], tiers: [] }, model: 'gauntlet_lab_entry_card', key: { lock: 'gauntlet_lab_research_seal' } }],
  mapPieces: built.mapPieces,
  mapAssemblies: [built.mapAssembly],
  // Margin loot only, as on level one: medical supplies and protective gear, kept thin.
  loot: [
    { id: 'gauntlet_lab_research_margin', rolls: [1, 1], entries: [
      { table: 'gauntlet_medical_stock', weight: 3 }, { item: 'bandage', weight: 2 }, { item: 'antiseptic', weight: 1 },
      { item: 'rubber_boots', weight: 1 }, { nothing: true, weight: 6 },
    ] },
  ],
}
