// Gauntlet townhouse scenes: what a room looks like once its people have gone. A room slot
// is a weighted choice of scene pieces; each scene is a list of furniture placements and
// shambler markers that the library turns into one piece per level. See
// `packages/deadvox/docs/aftermath.md`, "Scene slots".
function(palette, context)
local base = (import 'packages/mods/skelly.structures/structures-furniture.jsonnet').furniture + (import 'packages/deadvox/mods/skelly.deadvox.buildings/furniture.jsonnet').furniture + (import 'aftermath.libsonnet').furniture;
local sizes = { [f.id]: f.size for f in base };
local rows = import 'tools/jsonnet/lib/loot-rows.libsonnet';
local item = rows.item, nothing = rows.nothing;
local furnitureLoot = {
  kitchen_cupboard: 'kitchen_cupboard', counter: 'kitchen_cupboard', fridge: 'fridge', wardrobe: 'wardrobe',
  desk: 'desk', shelf: 'shelf', crate: 'junk',
};
local at(furniture, x, z, facing='n', loot=std.get(furnitureLoot, furniture, null), fixed=false, tip=null) =
  { furniture: furniture, x: x, z: z, facing: facing, loot: loot, fixed: fixed, tip: tip };
local shambler(x, z) = { x: x, z: z, spawn: true };
// Placements stay in two bands, rows 6-7 and rows 10-11, west of the service corner. Rows 4-5 are the
// lane a body walks between the entry anchor, the stair landings, the street door and the kitchen, so
// they stay clear.
local scenes = [
  {
    id: 'meal', beats: 1, weight: 3,
    things: [
      at('kitchen_cupboard', 0, 11, loot='gauntlet_home_kitchen', fixed=true),
      at('desk', 2, 6), at('chair', 1, 6, 'e'), at('chair', 5, 7),
    ],
  },
  {
    id: 'packed', beats: 1, weight: 3, only: ['lower', 'cellar', 'ground', 'room'],
    things: [
      at('wardrobe', 0, 11, loot='gauntlet_home_wardrobe'), at('bed', 4, 10, 'e'),
      at('crate', 2, 10, loot='gauntlet_packed_bag'), at('crate', 6, 6, loot='gauntlet_packed_bag'),
    ],
  },
  {
    id: 'failed_barricade', beats: 1, weight: 2, aftermath: ['messy'],
    things: [
      at('wardrobe', 3, 6, 'e', tip='back'), at('shelf', 3, 10, tip='left'), at('chair', 1, 6, tip='back'),
      at('chair', 7, 6, 'e', tip='left'), at('crate', 0, 10),
    ],
    shamblers: [shambler(12, 5), shambler(1, 5)],
  },
  {
    id: 'held_out', beats: 1, weight: 2, only: ['ground', 'room'],
    things: [
      at('wardrobe', 5, 6, 'w'), at('shelf', 3, 6, 'w'), at('bed', 0, 10, 'e'),
      at('crate', 4, 10, loot='gauntlet_home_kitchen'),
    ],
  },
  {
    id: 'searched', beats: 0, weight: 2, aftermath: ['messy'],
    things: [
      at('wardrobe', 0, 11, loot='gauntlet_searched', tip='left'), at('shelf', 4, 10, 'e', tip='back'),
      at('crate', 6, 6, tip='top'), at('desk', 2, 6, loot='gauntlet_searched'),
      at('chair', 5, 6, 'e', tip='left'),
    ],
  },
  {
    id: 'calm', beats: 0, weight: 2,
    things: [at('crate', 0, 10), at('kitchen_cupboard', 6, 11, fixed=true), at('chair', 6, 6, 's')],
  },
];
assert std.all([scene.beats <= 1 for scene in scenes]) : 'a room holds at most one beat';
// Cells another slot owns on a level, which no scene offered there may touch: { rows, columns }, each
// [first, last]. A stairwell cuts the back band off on the middle storey and the front band off on
// the lower one and the cellar, so a scene whose loot sits in the back band (`only`) is offered where
// that band can be walked. The storey a body enters by gives its back east corner to the kitchen and
// bathroom, `lower` under a stair and `ground` under the roof, and the cellar gives the same corner to
// its boiler, shelves and drain (`gauntlet-city-services.libsonnet`).
local stairsLower = { rows: [2, 3], columns: [0, 10] };
local stairsMiddle = { rows: [8, 9], columns: [0, 10] };
local backCorner = { rows: [6, 11], columns: [8, 13] };
local carves = {
  lower: [stairsLower, backCorner], cellar: [stairsLower, backCorner], middle: [stairsMiddle], ground: [backCorner],
  room: [],
};
local within(range, value) = value >= range[0] && value <= range[1];
local carved(level, x, z) = std.length([1 for c in carves[level] if within(c.rows, z) && within(c.columns, x)]) > 0;
local extent(thing) =
  local s = sizes[thing.furniture];
  local tipped = if thing.tip == 'back' || thing.tip == 'front' then [s[0], s[2], s[1]]
                 else if thing.tip == 'left' || thing.tip == 'right' then [s[1], s[0], s[2]]
                 else s;
  if thing.facing == 'e' || thing.facing == 'w' then [tipped[2], tipped[1], tipped[0]] else tipped;
local covers(thing, x, y, z) =
  local e = extent(thing);
  x >= thing.x && x < thing.x + e[0] && y < e[1] && z >= thing.z && z < thing.z + e[2];
local marked(things, x, z) = std.length([1 for thing in things if covers(thing, x, 0, z)]) > 0;
local chars = std.stringChars('abcdefghijklmnoqrstuvwxy');
local offered(level) = [scene for scene in scenes if !std.objectHas(scene, 'only') || std.member(scene.only, level)];
local touches(level, scene) = [
  [x, z]
  for x in std.range(0, 13)
  for z in std.range(0, 11)
  if carved(level, x, z) && (marked(scene.things, x, z) || std.length([1 for s in std.get(scene, 'shamblers', []) if s.x == x && s.z == z]) > 0)
];
local trespasses = [
  '%s on %s at %s' % [scene.id, level, touches(level, scene)]
  for level in std.objectFields(carves)
  for scene in offered(level)
  if std.length(touches(level, scene)) > 0
];
assert trespasses == [] : 'scenes touch cells another slot owns: ' + std.join('; ', trespasses);
local piece(level, scene, choices=offered(level), suffix='') =
  local things = std.mapWithIndex(function(i, thing) thing + { char: chars[i] }, scene.things);
  local shamblers = std.get(scene, 'shamblers', []);
  // Cells any choice furnishes are air for the others, so a slot's choices claim the same footprint.
  local union = std.flattenArrays([other.things for other in choices]);
  local cell(x, y, z) =
    local hit = [thing for thing in things if covers(thing, x, y, z)];
    if std.length(hit) > 0 then hit[0].char
    else if y == 0 && std.length([1 for s in shamblers if s.x == x && s.z == z]) > 0 then 'Z'
    else '.';
  local claim(x, y, z) =
    if carved(level, x, z) then '.'
    else if std.length([1 for thing in things if covers(thing, x, y, z)]) > 0 then 'S'
    else if marked(union, x, z) then 'A'
    else 'R';
  local grid(f) = [[std.join('', [f(x, y, z) for x in std.range(0, 13)]) for z in std.range(0, 11)] for y in std.range(0, 6)];
  {
    id: 'gauntlet_city_' + level + '_' + scene.id + suffix, size: [14, 7, 12], style: 'brick_townhouse',
    lootContext: context,
    palette: palette + {
      [thing.char]: { furniture: thing.furniture }
                    + (if thing.facing == 'n' then {} else { facing: thing.facing })
                    + (if thing.loot == null then {} else { loot: thing.loot })
                    + (if thing.tip == null then {} else { tip: thing.tip })
                    + (if thing.fixed then { fixed: true } else {})
                    + (if std.objectHas(thing, 'items') then { items: thing.items } else {})
      for thing in things
    },
    layers: grid(cell),
    ownership: { layers: grid(claim) },
    anchors: {}, ports: [],
    // Hidden, so the building beat cap can count it without the engine seeing it.
    beats:: scene.beats,
  } + (if std.objectHas(scene, 'aftermath') then { aftermath: scene.aftermath } else {});
// One house's own copy of a level's scenes, each changed by `amend`; `keep` picks the scenes it can change.
local variant(level, suffix, keep, amend) =
  local choices = [amend(scene) for scene in offered(level) if keep(scene)];
  {
    mapPieces: [piece(level, scene, choices, suffix) for scene in choices],
    slot(id, position): {
      id: id, at: position, size: [14, 7, 12], turn: 0,
      choices: [
        { ref: { kind: 'piece', id: 'gauntlet_city_' + level + '_' + scene.id + suffix }, weight: scene.weight }
        for scene in choices
      ],
    },
  };
local hasDesk(scene) = std.length([1 for thing in scene.things if thing.furniture == 'desk']) > 0;
{
  mapPieces: [piece(level, scene) for level in std.objectFields(carves) for scene in offered(level)],
  // The room's scenes that have a desk, with `items` lying on it.
  onDesk(level, suffix, items): variant(level, suffix, hasDesk, function(scene) scene + {
    things: [if thing.furniture == 'desk' then thing + { items: items } else thing for thing in scene.things],
  }),
  // Every scene of the level, with `furniture` lying at (x, z).
  // The level's scenes that hold no beat, for a room whose house already holds the building cap.
  quiet(level, suffix): variant(level, suffix, function(scene) scene.beats == 0, function(scene) scene),
  lying(level, suffix, furniture, x, z): variant(level, suffix, function(scene) true, function(scene) scene + {
    things: scene.things + [at(furniture, x, z)],
  }),
  slot(id, position, level): {
    id: id, at: position, size: [14, 7, 12], turn: 0,
    choices: [
      { ref: { kind: 'piece', id: 'gauntlet_city_' + level + '_' + scene.id }, weight: scene.weight }
      for scene in offered(level)
    ],
  },
  loot: [
    {
      id: 'gauntlet_home_kitchen', rolls: [1, 3],
      entries: [
        item('canned_beans', 4, count=[1, 2]), item('canned_soup', 4, count=[1, 2]), item('crackers', 3),
        item('water_bottle', 2), item('apple', 2), item('can_opener', 1), nothing(3),
      ],
    },
    {
      id: 'gauntlet_home_wardrobe', rolls: [1, 2],
      entries: [
        item('jeans', 3, condition=[0.5, 1]), item('hoodie', 3, condition=[0.5, 1]),
        item('jacket', 2, condition=[0.5, 1]), item('fanny_pack', 1, condition=[0.5, 1]),
        item('school_backpack', 1, condition=[0.6, 1]), nothing(4),
      ],
    },
    {
      id: 'gauntlet_packed_bag', rolls: [1, 3],
      entries: [
        item('canned_beans', 3), item('crackers', 3), item('water_bottle', 3), item('lighter', 1),
        item('matches', 2), item('bandage', 1), item('painkillers', 1), item('flashlight', 1, condition=[0.5, 1]),
        item('aa_battery', 2, count=[1, 4]), item('duct_tape', 1), nothing(2),
      ],
    },
    {
      id: 'gauntlet_searched', rolls: [1, 2],
      entries: [
        item('rag', 1), item('crackers', 1), item('matches', 1), item('aa_battery', 1), nothing(14),
      ],
    },
  ],
}
