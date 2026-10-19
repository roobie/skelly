local threat = import 'gauntlet-lab-threat.libsonnet';
// Scale the authored plan, not its equipment or the stair's risers.
local scale = 2;
local plan = [
  '====================================',
  '=..................................=',
  '=..................................=',
  '=..................................=',
  '============..======..==============',
  '=...HHHHHH.=.......=...............=',
  '=..........=.BB....=......BB.......=',
  '=..........=.BB....=......BB.......=',
  '=..........=.......=...............=',
  '=..........=.......=...............=',
  '=====DD=====..======..==============',
  '=......BBBB........................=',
  '=......BBBB........................=',
  '=====..=========..======..==========',
  '=.............=....................=',
  '=..BB.........=.........BB.........=',
  '=..BB.........=.........BB.........=',
  '=.......m.....=....................=',
  '=.............=...........m........=',
  '=....................EE.K..........=',
  '=....................EE............=',
  '=====..=========..======..==========',
  '=.............=....................=',
  '=.............=............======..=',
  '=..BB.........=............=.SS.=..=',
  '=..BB.........=.........m..=....=..=',
  '=.............=............=....=..=',
  '=.............=............==DD==..=',
  '=.............=....................=',
  '=====..=========..======..==========',
  '=..................................=',
  '========================TT==========',
];
// Symbols describe ownership as well as geometry: bays, hatch entry, markers and the two floor apertures.
local expand = function(cell) std.flattenArrays([
  [std.join('', [cell(plan[z][x], dx, dz, x, z) for x in std.range(0, std.length(plan[z]) - 1) for dx in std.range(0, scale - 1)]) for dz in std.range(0, scale - 1)]
  for z in std.range(0, std.length(plan) - 1)
]);
local size = [std.length(plan[0]) * scale, 8, std.length(plan) * scale];
local context = { usage: ['Industrial'], tier: 'Tier1' };
local slot = function(id, kind, ref, at, extent) {
  id: id, at: at, size: extent, turn: 0, choices: [{ ref: { kind: kind, id: ref }, weight: 1 }],
};
// These are delegated equipment rectangles, never walking thresholds.
local bays = [
  { id: 'control_lobby', at: [24, 15], ref: 'console', broken: false },
  { id: 'waiting', at: [3, 15], ref: 'bench', broken: true },
  { id: 'security_post', at: [7, 11], ref: 'arms', broken: false },
  { id: 'security_control', at: [9, 11], ref: 'console', broken: false },
  { id: 'equipment_lockers', at: [3, 24], ref: 'locker', broken: false },
  { id: 'technical_corridor', at: [26, 6], ref: 'pump', broken: true },
  { id: 'freight_lift', at: [13, 6], ref: 'lift', broken: true },
];
local markers = [[8 * scale, 1, 17 * scale], [26 * scale, 1, 18 * scale], [24 * scale, 1, 25 * scale]];
local doorCell = function(dx, dz, x, z) (x - (if z == 10 then 5 else 29)) * scale + dx < 4 && dz < 2;
local portCell = function(dx, x) (x - 24) * scale + dx >= 1 && (x - 24) * scale + dx < 5;
local hatchCell = function(dx, dz, x, z) (x - 21) * scale + dx < 3 && (z - 19) * scale + dz >= 1 && (z - 19) * scale + dz < 3;
local walls = function(y) expand(function(c, dx, dz, x, z)
  if c == '=' || (c == 'T' && (!portCell(dx, x) || y > 5)) || (c == 'D' && (y > 5 || !doorCell(dx, dz, x, z))) then '='
  else if c == 'D' then 'D'
  else if c == 'K' && y == 1 && dx == 0 && dz == 0 then 'K'
  else '.');
local aperture = function(c, dx, dz, x) (c == 'H' && (x - 4) * scale + dx < 12 && dz < 2) || (c == 'S' && (x - 29) * scale + dx < 3 && dz < 2);
local floorHoles = expand(function(c, dx, dz, x, z) if aperture(c, dx, dz, x) then '.' else 'p');
local claims = function(y) expand(function(c, dx, dz, x, z)
  if c == '=' || c == 'D' || (c == 'T' && (!portCell(dx, x) || y > 5)) then 'S'
  else if c == 'K' then 'A'
  else if (c == 'B' && std.length([b for b in bays if (x - b.at[0]) * scale + dx >= 0 && (x - b.at[0]) * scale + dx < 4 && (z - b.at[1]) * scale + dz >= 0 && (z - b.at[1]) * scale + dz < 4]) > 0) || (c == 'E' && hatchCell(dx, dz, x, z)) || (c == 'm' && y == 1 && dx == 0 && dz == 0) then '.'
  else 'R');
local shell = {
  id: 'gauntlet_lab_entry_shell', size: size, style: 'concrete_lab', lootContext: context,
  palette: {
    p: { role: 'interior_floor', material: 'floor' }, '=': { role: 'shell', material: 'concrete' }, '.': { role: 'opening', material: 'air' },
    D: { furniture: 'gauntlet_lab_bulkhead', facing: 's', lock: { id: 'gauntlet_lab_entry_seal', locked: true } },
    K: { groundLoot: { kind: 'fixed', items: [{ item: 'gauntlet_lab_entry_card' }] } },
  },
  layers: [floorHoles] + [walls(y) for y in std.range(1, 7)],
  ownership: { layers: [[std.strReplace(row, 'p', 'S') for row in floorHoles], claims(1), claims(2), claims(3), claims(4), claims(5), claims(6), claims(7)] },
  anchors: {}, ports: [],
};
local bay = function(id, furniture, body, claims, loot=null) {
  id: 'gauntlet_lab_entry_bay_' + id, size: [4, 7, 4], style: 'concrete_lab', lootContext: context,
  palette: { '.': { role: 'opening', material: 'air' }, F: { furniture: furniture } + (if loot == null then {} else { loot: loot }) },
  layers: body + [[ '....', '....', '....', '....' ] for _ in std.range(std.length(body), 6)],
  ownership: { layers: claims + [[ 'AAAA', 'AAAA', 'AAAA', 'AAAA' ] for _ in std.range(std.length(claims), 6)] },
  anchors: {}, ports: [],
};
local short = [['FFFF', 'FFFF', '....', '....'], ['FFFF', 'FFFF', '....', '....']];
local shortClaims = [['SSSS', 'SSSS', 'AAAA', 'AAAA'], ['SSSS', 'SSSS', 'AAAA', 'AAAA']];
local tall = [['FFFF', 'FFFF', '....', '....'] for _ in std.range(1, 5)];
local tallClaims = [['SSSS', 'SSSS', 'AAAA', 'AAAA'] for _ in std.range(1, 5)];
{
  scale: scale,
  size: size,
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
    palette: shell.palette,
    layers: [expand(function(c, dx, dz, x, z) if c == 'E' && hatchCell(dx, dz, x, z) then '.' else 'p')],
    ownership: { layers: [expand(function(c, dx, dz, x, z) if c == 'E' && hatchCell(dx, dz, x, z) then '.' else 'S')] },
    anchors: {}, ports: [],
  }] + [
    local furnished = {
      console: bay('console', 'gauntlet_look_console', short, shortClaims),
      bench: bay('bench', 'gauntlet_look_bench', short, shortClaims),
      arms: bay('arms', 'range_rack', [['FF..', '....', '....', '....'] for _ in std.range(1, 4)], [['SSAA', 'AAAA', 'AAAA', 'AAAA'] for _ in std.range(1, 4)], 'gauntlet_police_sidearms'),
      locker: bay('locker', 'hq_weapon_cabinet', [['FFF.', 'FFF.', '....', '....'] for _ in std.range(1, 5)], [['SSSA', 'SSSA', 'AAAA', 'AAAA'] for _ in std.range(1, 5)], 'gauntlet_lab_entry_margin'),
      pump: bay('pump', 'gauntlet_look_pump', [['FFFF', 'FFFF', 'FFFF', '....'] for _ in std.range(1, 4)], [['SSSS', 'SSSS', 'SSSS', 'AAAA'] for _ in std.range(1, 4)]),
      lift: bay('lift', 'gauntlet_lab_dead_lift', tall, tallClaims),
    }[b.ref];
    furnished + {
      id: 'gauntlet_lab_entry_bay_' + b.id,
      palette: furnished.palette + { L: { furniture: if b.broken then 'gauntlet_lab_fixture_broken' else 'gauntlet_lab_fixture' } },
      layers: furnished.layers[:6] + [['LL..', '....', '....', '....']],
      ownership: { layers: furnished.ownership.layers[:6] + [['SSAA', 'AAAA', 'AAAA', 'AAAA']] },
    }
    for b in bays
  ] + [
    {
      id: 'gauntlet_lab_entry_stair', size: [12, 8, 2], style: 'concrete_lab', lootContext: context,
      palette: shell.palette,
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
    },
  ],
  mapAssemblies: [{
    id: 'gauntlet_lab_level_entry', size: size, lootContext: context,
    slots: [slot('shell', 'piece', shell.id, [0, 0, 0], size)]
      + [slot(b.id, 'piece', 'gauntlet_lab_entry_bay_' + b.id, [b.at[0] * scale, 1, b.at[1] * scale], [4, 7, 4]) for b in bays]
      + threat.markerSlots('entry', 'entry', markers),
    joins: [], ports: [], anchors: {},
  }],
  loot: [{ id: 'gauntlet_lab_entry_margin', rolls: [1, 2], entries: [
    { table: 'gauntlet_police_ammunition', weight: 2 }, { item: 'flashlight', weight: 1 }, { nothing: true, weight: 2 },
  ] }],
}
