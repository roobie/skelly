local threat = import 'gauntlet-lab-threat.libsonnet';
local scale = 2;
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
  'Ww11wwwwwwwWlllllllllEElKllll00L####',
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
// Plan cells whose first sub-cell holds a threat marker; each stands on open floor and outside every dressing bay.
local markerCells = [
  [8, 17], [16, 18], [25, 28],
  [20, 15], [14, 16], [28, 18], [20, 22], [6, 17], [9, 20], [3, 12], [15, 12], [22, 6], [29, 8], [21, 4],
];
local context = { usage: ['Industrial'], tier: 'Tier1' };
// Finishes, heights, opening widths and furnishing choices belong together so a room can be retuned as a whole.
local rooms = {
  control_lobby: {
    tokens: ['l', 'L', '0', 'E', 'K', 'n', 'k', 'z'], wall: 'L', floor: 'l', band: '!',
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
      { id: 'equipment_stock', at: [10, 23], kit: 'locker', fixture: null, loot: 'gauntlet_lab_entry_margin', lootUsage: ['Military'] },
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
      { id: 'technical_spares', at: [22, 9], kit: 'cabinets', fixture: null, loot: 'hq_field_supplies', lootUsage: ['Military'] },
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
local roomList = [rooms[id] for id in std.objectFields(rooms)];
local byToken = { [token]: room for room in roomList for token in room.tokens };
local dressing = std.flattenArrays([[
  d + { room: room, rise: room.floorRise + std.get(d, 'rise', 0) } for d in room.dressing
] for room in roomList]);
local bayAt = function(c, x, z) if !std.member(std.stringChars('0123456789'), c) then [] else [d for d in dressing if x >= d.at[0] && x < d.at[0] + 2 && z >= d.at[1] && z < d.at[1] + 2];
local expand = function(cell) std.flattenArrays([
  [std.join('', [cell(plan[z][x], dx, dz, x, z) for x in std.range(0, std.length(plan[z]) - 1) for dx in std.range(0, scale - 1)]) for dz in std.range(0, scale - 1)]
  for z in std.range(0, std.length(plan) - 1)
]);
local size = [std.length(plan[0]) * scale, 8, std.length(plan) * scale];
local hatchCell = function(dx, dz, x, z) (x - 21) * scale + dx < 3 && (z - 19) * scale + dz >= 1 && (z - 19) * scale + dz < 3;
local aperture = function(c, dx, dz, x) (c == 'H' && (x - 4) * scale + dx < 12 && dz < 2) || (c == 'S' && (x - 29) * scale + dx < 3 && dz < 2);
local opening = function(room, c, dx, dz, x, z)
  local candidates = [o for o in room.openings if o.token == c && (if o.axis == 'x' then z >= o.at[1] && z < o.at[1] + std.get(o, 'depth', 1) else x == o.at[0])];
  if std.length(candidates) == 0 then null
  else local o = candidates[0];
    local along = if o.axis == 'x' then (x - o.at[0]) * scale + dx else (z - o.at[1]) * scale + dz;
    o + { clear: along >= std.get(o, 'offset', 0) && along < std.get(o, 'offset', 0) + o.width };
local wallGlyph = function(room, y) if y == 1 then room.band else room.wall;
local cell = function(c, y, dx, dz, x, z)
  if c == '#' then '#'
  else local room = byToken[c];
    local bay = bayAt(c, x, z);
    local o = opening(room, c, dx, dz, x, z);
    if y == 0 then (if aperture(c, dx, dz, x) then '.' else room.floor)
    else if c == 'E' && hatchCell(dx, dz, x, z) then '.'
    else if std.length(bay) > 0 then '.'
    else if c == room.wall then wallGlyph(room, y)
    else if y <= room.floorRise then room.floor
    else if y >= 8 - room.ceilingDrop then room.wall
    else if c == '|' then (if y <= 5 then '|' else room.wall)
    else if o != null then (if !o.clear || y > std.get(o, 'height', 4) then wallGlyph(room, y) else if c == 'D' then 'D' else '.')
    else if c == 'K' && y == 1 && dx == 0 && dz == 0 then 'K'
    else '.';
local floorHoles = expand(function(c, dx, dz, x, z) cell(c, 0, dx, dz, x, z));
local walls = function(y) expand(function(c, dx, dz, x, z) cell(c, y, dx, dz, x, z));
local claims = function(y) expand(function(c, dx, dz, x, z)
  local glyph = cell(c, y, dx, dz, x, z);
  if y == 0 then (if glyph == '.' then '.' else 'S')
  else if glyph != '.' && glyph != 'K' then 'S'
  else if c == 'K' then 'A'
  else if (c == 'E' && hatchCell(dx, dz, x, z)) || std.length(bayAt(c, x, z)) > 0 || (std.member(markerCells, [x, z]) && y == 1 && dx == 0 && dz == 0) then '.'
  else 'R');
local palette = { '.': { role: 'opening', material: 'air' }, '#': { role: 'shell', material: 'rock' }, '|': { role: 'shell', material: 'wire' },
  D: { furniture: 'gauntlet_lab_bulkhead', facing: 's', lock: { id: 'gauntlet_lab_entry_seal', locked: true } },
  K: { groundLoot: { kind: 'fixed', items: [{ item: 'gauntlet_lab_entry_card' }] } },
} + { [room.floor]: { role: 'interior_floor', material: room.finish.floor } for room in roomList }
  + { [room.wall]: { role: 'shell', material: room.finish.wall } for room in roomList }
  + { [room.band]: { role: 'shell', material: room.finish.base } for room in roomList };
local shell = {
  id: 'gauntlet_lab_entry_shell', size: size, style: 'concrete_lab', lootContext: context, palette: palette,
  layers: [floorHoles] + [walls(y) for y in std.range(1, 7)],
  ownership: { layers: [claims(y) for y in std.range(0, 7)] }, anchors: {}, ports: [],
};
local short = [['FFFF', 'FFFF', '....', '....'], ['FFFF', 'FFFF', '....', '....']];
local kits = {
  console: { furniture: { F: 'gauntlet_look_console' }, layers: short },
  bench: { furniture: { F: 'gauntlet_look_bench' }, layers: short },
  desk: { furniture: { F: 'desk' }, layers: [['FFF.', 'FFF.', '....', '....'], ['FFF.', 'FFF.', '....', '....']] },
  fallen_shelf: { furniture: { F: { id: 'shelf', tip: 'back' } }, layers: [['FF..', 'FF..', 'FF..', 'FF..']] },
  cabinets: { furniture: { A: 'police_file_cabinet', B: 'police_file_cabinet' }, layers: [['AABB', '....', '....', '....'] for _ in std.range(1, 4)] },
  arms: { furniture: { F: 'range_rack' }, layers: [['FF..', '....', '....', '....'] for _ in std.range(1, 4)] },
  locker: { furniture: { F: 'hq_weapon_cabinet' }, layers: [['FFF.', 'FFF.', '....', '....'] for _ in std.range(1, 5)] },
  pump: { furniture: { F: 'gauntlet_look_pump' }, layers: [['FFFF', 'FFFF', 'FFFF', '....'] for _ in std.range(1, 4)] },
  lift: { furniture: { F: 'gauntlet_lab_dead_lift' }, layers: [['FFFF', 'FFFF', '....', '....'] for _ in std.range(1, 5)] },
};
local empty = ['....', '....', '....', '....'];
local platform = ['pppp', 'pppp', 'pppp', 'pppp'];
local soffit = ['====', '====', '====', '===='];
local bay = function(d)
  local kit = kits[d.kit];
  local layers = [
    if y < d.rise then platform
    else if y >= 7 - d.room.ceilingDrop then soffit
    else if y - d.rise < std.length(kit.layers) then kit.layers[y - d.rise]
    else if d.fixture != null && y == 6 - d.room.ceilingDrop then ['LL..', '....', '....', '....']
    else empty
    for y in std.range(0, 6)
  ];
  {
    id: 'gauntlet_lab_entry_bay_' + d.id, size: [4, 7, 4], style: 'concrete_lab', lootContext: context,
    palette: { '.': { role: 'opening', material: 'air' }, p: { role: 'interior_floor', material: d.room.finish.floor }, '=': { role: 'shell', material: d.room.finish.wall },
      L: { furniture: if d.fixture == 'broken' then 'gauntlet_lab_fixture_broken' else 'gauntlet_lab_fixture' },
    } + { [glyph]: { furniture: if std.type(kit.furniture[glyph]) == 'object' then kit.furniture[glyph].id else kit.furniture[glyph],
                 loot: std.get(d, 'loot', 'd41_empty') }
                 + (if std.objectHas(d, 'lootUsage') then { lootUsage: d.lootUsage } else {})
                 + (if std.type(kit.furniture[glyph]) == 'object' then { tip: kit.furniture[glyph].tip } else {}) for glyph in std.objectFields(kit.furniture) },
    layers: layers,
    ownership: { layers: [[std.join('', [if c == '.' then 'A' else 'S' for c in std.stringChars(row)]) for row in layer] for layer in layers] },
    anchors: {}, ports: [],
  };
local slot = function(id, kind, ref, at, extent) { id: id, at: at, size: extent, turn: 0, choices: [{ ref: { kind: kind, id: ref }, weight: 1 }] };
local markers = [[c[0] * scale, 1, c[1] * scale] for c in markerCells];
assert std.all([std.length(row) == std.length(plan[0]) for row in plan]) : 'entry plan rows must have equal width: ' + std.toString([[z, std.length(plan[z])] for z in std.range(0, std.length(plan) - 1) if std.length(plan[z]) != std.length(plan[0])]);
{
  scale: scale, rooms: rooms, plan: plan, size: size,
  loop: { from: [21, 33, 37], through: [25, 33, 37], to: [19, 34, 25], cut: { min: [22, 33, 36], size: [2, 5, 2] } },
  standing: [22 * scale, 33, 18 * scale],
  hatch: [21 * scale, 40, 19 * scale + 1],
  port: { x: 24 * scale + 1, width: 4, height: 5 },
  shaft: { ladder: [29 * scale + 1, 25, 24 * scale], upper: [29 * scale, 33, 24 * scale + 1], lower: [29 * scale, 25, 24 * scale + 1] },
  stairAt: [4 * scale, 25, 5 * scale],
  stair: { upper: [4 * scale + 11, 33, 5 * scale + 1], lower: [4 * scale + 1, 25, 5 * scale + 1] },
  seal: { doors: [[5 * scale, 33, 10 * scale], [29 * scale, 33, 27 * scale]], key: [24 * scale, 33, 19 * scale], standing: [24 * scale, 33, 19 * scale + 1] },
  items: [{ id: 'gauntlet_lab_entry_card', name: 'Security keycard', category: 'tool', weight: 5, size: [1, 1], economy: { usage: ['Industrial'], tiers: ['Tier1'] }, model: 'folded_note', key: { lock: 'gauntlet_lab_entry_seal' } }],
  mapPieces: [shell, {
    id: 'gauntlet_lab_entry_cap', size: [size[0], 1, size[2]], style: shell.style, lootContext: context,
    palette: { p: { role: 'interior_floor', material: 'floor' }, '.': { role: 'opening', material: 'air' } },
    layers: [expand(function(c, dx, dz, x, z) if c == 'E' && hatchCell(dx, dz, x, z) then '.' else 'p')],
    ownership: { layers: [expand(function(c, dx, dz, x, z) if c == 'E' && hatchCell(dx, dz, x, z) then '.' else 'S')] }, anchors: {}, ports: [],
  }] + [bay(d) for d in dressing] + [{
    id: 'gauntlet_lab_entry_stair', size: [12, 8, 2], style: 'concrete_lab', lootContext: context,
    palette: { p: { role: 'interior_floor', material: 'floor' }, '.': { role: 'opening', material: 'air' } },
    layers: [
      ['..pppppppppp', '..pppppppppp'], ['...ppppppppp', '...ppppppppp'],
      ['....pppppppp', '....pppppppp'], ['.....ppppppp', '.....ppppppp'],
      ['......pppppp', '......pppppp'], ['.......ppppp', '.......ppppp'],
      ['........pppp', '........pppp'], ['.........ppp', '.........ppp'],
    ],
    ownership: { layers: [
      ['RRSSSSSSSSSS', 'RRSSSSSSSSSS'], ['RRRSSSSSSSSS', 'RRRSSSSSSSSS'],
      ['RRRRSSSSSSSS', 'RRRRSSSSSSSS'], ['RRRRRSSSSSSS', 'RRRRRSSSSSSS'],
      ['RRRRRRSSSSSS', 'RRRRRRSSSSSS'], ['RRRRRRRSSSSS', 'RRRRRRRSSSSS'],
      ['RRRRRRRRSSSS', 'RRRRRRRRSSSS'], ['RRRRRRRRRSSS', 'RRRRRRRRRSSS'],
    ] }, anchors: {}, ports: [],
  }],
  mapAssemblies: [{
    id: 'gauntlet_lab_level_entry', size: size, lootContext: context + { lowerTiers: true },
    slots: [slot('shell', 'piece', shell.id, [0, 0, 0], size)]
      + [slot(d.id, 'piece', 'gauntlet_lab_entry_bay_' + d.id, [d.at[0] * scale, 1, d.at[1] * scale], [4, 7, 4]) for d in dressing]
      + threat.markerSlots('entry', 'entry', markers),
    joins: [], ports: [], anchors: {},
  }],
  loot: [{ id: 'gauntlet_lab_entry_margin', rolls: [1, 2], entries: [
    { table: 'armoury_ammunition', weight: 2 }, { item: 'flashlight', weight: 1 }, { nothing: true, weight: 2 },
  ] }],
}
