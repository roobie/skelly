// Special research, the lab's deepest level and its destination: the objective stands at the chamber's north wall,
// over the specimen pit where the amalgam waits. `packages/deadvox/DESIGN.md`, "Gauntlet".
local level = import 'gauntlet-lab-level.libsonnet';
local research = import 'gauntlet-lab-research.libsonnet';
local threat = import 'gauntlet-lab-threat.libsonnet';
local scale = level.scale;
local base = 8;

local plan = [
  '####################################',
  '#########CCCCAAAAAAAAAAAAAAEEEEEEEE#',
  '#VVVVVVVVVuuuAa00aaaaaaa11aE22eeeeE#',
  '#VvvvvvvvVuuuAa00aaaaaaa11aE22eeeeE#',
  '#Vv88v99vVuuujaaaaaaaaaaaaaieeeeeeE#',
  '#Vv88v99vwuuujaaaaaaaaaaaaaieeeeeeE#',
  '#VvvvvvvvwuuuAaaaaaaaaaaaaaEeeeeeeE#',
  '#VvrrvvvvVuuuAaaaaaaaaaaaaaEeeeeeeE#',
  '#VvrrvvvvVuuuAaaaaaaaaaaaaaE33e44eE#',
  '#VvvvvvvvVuuuAaaaaaaaaaaaaaE33e44eE#',
  '#VVVVVVVVVuuuAaaaaaaaaaaaaaEeeeeeeE#',
  '#########CuuuMMMMMkkMMMMMMOOyyOOzzE#',
  '#PPPPPPPPPuuuMMMmmmmxxmmMMOooooObbB#',
  '#PpppppppPuuuMMmmmmmxxmmmMOoo55ObbB#',
  '#Pp66p77pPuuuMmmmmmmmmmmmmOoo55ObbB#',
  '#Pp66p77pguuuMmmmmmmmmmmmm|ooooObbB#',
  '#Ppppppppguuulmmmmmmmmmmmm|ooooObbB#',
  '#PpppppppPuuulmmmmmmmmmmmmBBBBBBbbB#',
  '#PpppppppPuuuMmmmmmmmmmmmmBttbbddbB#',
  '#PpppppppPuuuMmmmmmmmmmmmmBttbbddbB#',
  '#PPPPPPPPPuuuMmmmmmmmmmmmmBbbbbbbbB#',
  '#########CuuuMMmmmmmmmmmmMBbbbbbbbB#',
  '#########CuuuMMMmmmmmmmmMMBbbbbbbbB#',
  '#########CuuuSSSSSnnSSSSSSSbbbbbbbB#',
  '#########CuuuSssssssssssssShhbbbbbB#',
  '#########CuuuSssssssssssssShhbbbbbB#',
  '#########CuuufsssssssssssscbbbbbbbB#',
  '#########CuuufsssssssssssscbbbbbbbB#',
  '#########CuuuSssssssssssssSbbbbbbbB#',
  '#########CCCCSSSSSSSSSSSSSSbbbbbbbB#',
  '##########################BBBBBBBBB#',
  '####################################',
];

// Finishes, heights, opening widths and furnishing choices belong together so a room can be retuned as a whole.
local rooms = {
  // The stair hall, where level three's stair lands: an emergency post with triage leftovers against the walls.
  hall: {
    tokens: ['a', 'A', '0', '1', 'j'], wall: 'A', floor: 'a', band: '!',
    finish: { floor: 'floor', wall: 'concrete', base: 'metal' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'j', at: [13, 4], axis: 'z', width: 4 }],
    dressing: [
      { id: 'hall_exam', at: [15, 2], kit: 'exam', fixture: null },
      { id: 'hall_lockers', at: [24, 2], kit: 'lockers', fixture: 'working', loot: 'gauntlet_lab_special_margin' },
    ],
  },
  // The records vault, behind an open blast-door frame: its shelves stay mostly empty, and the staff notes are filed
  // in its card cabinet.
  vault: {
    tokens: ['v', 'V', '8', '9', 'r', 'w'], wall: 'V', floor: 'v', band: '*', bays: ['r'],
    finish: { floor: 'carpet', wall: 'plaster', base: 'dressed' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'w', at: [9, 5], axis: 'z', width: 4, height: 5 }],
    dressing: [
      { id: 'vault_archive_west', at: [3, 4], kit: 'archive', fixture: null },
      { id: 'vault_archive_east', at: [6, 4], kit: 'archive', fixture: null },
      { id: 'vault_files', at: [3, 7], kit: 'files', fixture: null, stock: [{ item: 'gauntlet_lab_special_notes' }] },
    ],
  },
  // The backup power node keeps the level's Industrial stock; its plant runs on the entry generator's grid.
  power: {
    tokens: ['p', 'P', '6', '7', 'g'], wall: 'P', floor: 'p', band: '&',
    finish: { floor: 'hazard', wall: 'concrete', base: 'metal' }, ceilingDrop: 1, floorRise: 0, lootUsage: ['Industrial'],
    openings: [{ token: 'g', at: [9, 15], axis: 'z', width: 4 }],
    dressing: [
      { id: 'power_pump', at: [3, 14], kit: 'pump', rise: 1, fixture: 'working' },
      { id: 'power_sterilizer', at: [6, 14], kit: 'sterilizer', fixture: null },
    ],
  },
  // Engineering A: precision benches and the experimental-arms locker.
  engineering_a: {
    tokens: ['e', 'E', '2', '3', '4', 'i', 'z'], wall: 'E', floor: 'e', band: '@',
    finish: { floor: 'tiles', wall: 'concrete', base: 'metal' }, ceilingDrop: 1, floorRise: 0, lootUsage: ['Industrial'],
    openings: [{ token: 'i', at: [27, 4], axis: 'z', width: 4 }, { token: 'z', at: [32, 11], axis: 'x', width: 4 }],
    dressing: [
      { id: 'engineering_a_console', at: [28, 2], kit: 'console', fixture: null },
      { id: 'engineering_a_bench', at: [28, 8], kit: 'bench', fixture: null },
      { id: 'engineering_a_locker', at: [31, 8], kit: 'locker', fixture: 'working', loot: 'gauntlet_lab_special_arms', lootUsage: ['Military'] },
    ],
  },
  // The observation room is a separate control room entered from engineering A alone; its wire window overlooks the
  // chamber away from that door.
  observation: {
    tokens: ['o', 'O', '5', 'y', '|'], wall: 'O', floor: 'o', band: '$',
    finish: { floor: 'floor', wall: 'plaster', base: 'metal' }, ceilingDrop: 1, floorRise: 0,
    openings: [{ token: 'y', at: [28, 11], axis: 'x', width: 4 }],
    dressing: [{ id: 'observation_console', at: [29, 13], kit: 'console', fixture: 'broken' }],
  },
  // The destination: a faceted round chamber at full height for the amalgam rising from its pit. The 'x' bay only
  // reserves the objective console's footprint against the north wall.
  chamber: {
    tokens: ['m', 'M', 'x', 'k', 'l', 'n'], wall: 'M', floor: 'm', band: '%', bays: ['x'],
    finish: { floor: 'hazard', wall: 'metal', base: 'hazard_wall' }, ceilingDrop: 0, floorRise: 0,
    openings: [
      { token: 'k', at: [18, 11], axis: 'x', width: 4 },
      { token: 'l', at: [13, 16], axis: 'z', width: 4 },
      { token: 'n', at: [18, 23], axis: 'x', width: 4 },
    ],
    dressing: [{ id: 'objective', at: [20, 12], kit: 'console', fixture: null }],
  },
  // Damaged engineering B carries the approach's weight: the deepest markers and the acid. Its north arm runs past
  // the observation room to engineering A.
  engineering_b: {
    tokens: ['b', 'B', 't', 'd', 'h'], wall: 'B', floor: 'b', band: '^', bays: ['t', 'd', 'h'],
    finish: { floor: 'tiles', wall: 'metal', base: 'hazard_wall' }, ceilingDrop: 1, floorRise: 0, lootUsage: ['Industrial'],
    openings: [],
    dressing: [
      { id: 'engineering_b_pump', at: [27, 18], kit: 'pump', rise: 1, fixture: 'broken' },
      { id: 'engineering_b_containment', at: [31, 18], kit: 'containment', fixture: 'broken' },
      { id: 'engineering_b_breached', at: [27, 24], kit: 'breached', fixture: 'broken' },
    ],
  },
  // The service room receives level three's shaft and opens toward engineering B; its landing stays clear.
  service: {
    tokens: ['s', 'S', 'c', 'f'], wall: 'S', floor: 's', band: ')',
    finish: { floor: 'floor', wall: 'concrete', base: 'metal' }, ceilingDrop: 1, floorRise: 0,
    openings: [
      { token: 'c', at: [26, 26], axis: 'z', width: 4 },
      { token: 'f', at: [13, 26], axis: 'z', width: 4 },
    ],
    dressing: [],
  },
  // The staff corridor, from the stair hall past the vault and power node to the service room.
  corridor: {
    tokens: ['u', 'C'], wall: 'C', floor: 'u', band: '(',
    finish: { floor: 'hazard', wall: 'concrete', base: 'metal' }, ceilingDrop: 1, floorRise: 0,
    openings: [], dressing: [],
  },
};

// The specimen pit sunk below the chamber floor: a rock base and rim, a hazard floor, two storeys of reserved air for
// the amalgam's whole body with a ladder back to the rim in the north-west corner, and a top layer that owns the hole
// the shell leaves over it. The rim stays unclaimed on that top layer, where the shell owns the chamber floor. One
// cell of the `marked` row stays unclaimed for the amalgam's marker piece.
local pitPiece = {
  local rock = '##################',
  local floor = '#HHHHHHHHHHHHHHHH#',
  local air = '#................#',
  local rungs = '#JJ..............#',
  local open = '..................',
  local solid = 'SSSSSSSSSSSSSSSSSS',
  local held = 'SRRRRRRRRRRRRRRRRS',
  local climb = 'SSSRRRRRRRRRRRRRRS',
  local marked = 'SRRRRRRRR.RRRRRRRS',
  local hole = '.RRRRRRRRRRRRRRRR.',
  id: 'gauntlet_lab_special_pit', size: [18, 5, 16], style: 'concrete_lab', lootContext: { usage: [], tier: 'Tier1' },
  palette: {
    '#': { role: 'shell', material: 'rock' }, H: { role: 'interior_floor', material: 'hazard' },
    '.': { role: 'opening', material: 'air' }, J: { furniture: 'ladder', facing: 's' },
  },
  layers: [
    [rock, rock, rock, rock, rock, rock, rock, rock, rock, rock, rock, rock, rock, rock, rock, rock],
    [rock, floor, floor, floor, floor, floor, floor, floor, floor, floor, floor, floor, floor, floor, floor, rock],
    [rock, rungs, air, air, air, air, air, air, air, air, air, air, air, air, air, rock],
    [rock, rungs, air, air, air, air, air, air, air, air, air, air, air, air, air, rock],
    [open, open, open, open, open, open, open, open, open, open, open, open, open, open, open, open],
  ],
  ownership: { layers: [
    [solid, solid, solid, solid, solid, solid, solid, solid, solid, solid, solid, solid, solid, solid, solid, solid],
    [solid, solid, solid, solid, solid, solid, solid, solid, solid, solid, solid, solid, solid, solid, solid, solid],
    [solid, climb, held, held, held, held, held, held, marked, held, held, held, held, held, held, solid],
    [solid, climb, held, held, held, held, held, held, held, held, held, held, held, held, held, solid],
    [open, hole, hole, hole, hole, hole, hole, hole, hole, hole, hole, hole, hole, hole, hole, open],
  ] },
  anchors: {}, ports: [],
};
// Where the pit piece stands in the level's frame; its top layer is the level's floor, so the shell's floor hole
// matches the pit's interior. The marker and ladder cells are the ones its layers mark.
local pitAt = [31, base - 4, 27];
local pit = { at: [pitAt[0] + 1, pitAt[2] + 1], size: [16, 14] };
local amalgamMarker = [pitAt[0] + 9, pitAt[1] + 2, pitAt[2] + 8];
local ladderAt = [pitAt[0] + 1, pitAt[1] + 2, pitAt[2] + 1];

local built = level.build({
  id: 'special', base: base, plan: plan, rooms: rooms,
  context: { usage: ['Industrial', 'Medical'], tier: 'Tier1' },
  // The deepest level rolls the whole ladder of tiers.
  range: { tier: 'Tier4', lowerTiers: true },
  // Level three's stair and kept shaft hang into this level.
  through: [
    { at: [research.stairAt[0], research.stairAt[2]], size: [level.stair.size[0], level.stair.size[2]] },
    { at: [research.shaft.ladder[0] - 1, research.shaft.ladder[2]], size: [3, 2] },
  ],
  holes: [pit],
  // The last four cells, in damaged engineering B, hold the acid; the rest roll the special-research rows. None lies
  // in the chamber, which is the amalgam's.
  markers: [[c[0] * scale + 1, 1, c[1] * scale + 1] for c in [
    [25, 9], [11, 12], [11, 20], [6, 7], [5, 16], [29, 5], [32, 6], [33, 14], [7, 18], [21, 28],
    [28, 20], [32, 21], [29, 26], [27, 29],
  ]],
});

local slot = function(id, ref, at, size) { id: id, at: at, size: size, turn: 0, choices: [{ ref: { kind: 'piece', id: ref }, weight: 1 }] };
local shell = built.mapPieces[0];
// The level's frame is two storeys tall: the built shell sits on rock that the pit is sunk into, and the builder's slots are
// rebased up to it. The objective console replaces the bay that reserved its footprint.
local rebase = function(s) s + { at: [s.at[0], base + s.at[1], s.at[2]] };
local assembly = {
  id: 'gauntlet_lab_level_special', size: [72, 2 * base, 64],
  lootContext: { usage: ['Industrial', 'Medical'], tier: 'Tier4', lowerTiers: true },
  slots: [
    slot('shell', shell.id, [0, base, 0], shell.size),
    slot('pit', pitPiece.id, pitAt, pitPiece.size),
  ] + [rebase(s) for s in built.mapAssembly.slots if s.id != 'shell' && s.id != 'objective'] + [
    threat.amalgamSlot('special', amalgamMarker),
    slot('objective', 'gauntlet_lab_equipment_objective', [40, base + 1, 24], [4, 5, 4]),
  ],
  joins: [], ports: [], anchors: {},
};

{
  size: assembly.size,
  // Cut the service room's door into engineering B: the service room still reaches engineering A through the corridor
  // and stair hall.
  loop: { from: [40, base + 1, 53], through: [58, base + 1, 53], to: [60, base + 1, 14], cut: { min: [52, base + 1, 52], size: [2, 5, 4] } },
  standing: [46, base + 1, 12],
  objective: [41, base + 3, 24],
  objectiveFace: [41, base + 1, 27],
  // Where the amalgam spawns and the climb out of its pit, in the level's blocks.
  amalgam: { marker: amalgamMarker, pit: pit, climb: { ladder: ladderAt, upper: [34, base + 1, 27], lower: [33, ladderAt[1], 30] } },
  fixedLoot: built.stock,
  items: [{
    id: 'gauntlet_lab_special_notes', name: 'Staff notes', category: 'note', weight: 5, size: [1, 1],
    model: 'paper_sheet', economy: { usage: ['Medical'], tiers: ['Tier1'] },
    readable: { title: 'Staff notes', text: |||
      Requisition 9-12 came back unsigned again. Security won't counter-sign another feeding schedule without the director, and the director hasn't answered the intercom since Thursday.

      It was six subjects in March. It is one now, and it still flinches at the hose. Feeding is suspended. Let the pit go quiet.

      Whoever keeps opening the floor at night: the schedule is the only part of this we still control.
    ||| },
  }],
  mapPieces: [pitPiece] + [p for p in built.mapPieces if p.id != 'gauntlet_lab_special_bay_objective'],
  mapAssemblies: [assembly],
  // Margin loot as on the levels above, and the experimental-arms locker's own table, which no other source shares.
  loot: [
    { id: 'gauntlet_lab_special_margin', rolls: [1, 1], entries: [
      { table: 'gauntlet_medical_stock', weight: 3 }, { item: 'bandage', weight: 2 }, { item: 'antiseptic', weight: 1 },
      { item: 'rubber_boots', weight: 1 }, { nothing: true, weight: 6 },
    ] },
    { id: 'gauntlet_lab_special_arms', rolls: [1, 2], entries: [
      { item: 'cartridge_5_d_56x45', weight: 2, count: [6, 14] }, { item: 'cartridge_7_d_62x39', weight: 2, count: [6, 14] },
      { item: 'magazine_stanag_30', weight: 1, condition: [0.4, 0.8] }, { item: 'magazine_akm_30', weight: 1, condition: [0.4, 0.8] },
      { nothing: true, weight: 3 },
    ] },
  ],
}
