// Gauntlet townhouse scenes: what a room looks like once its people have gone. A room slot
// is a weighted choice of scene pieces; each scene is a list of furniture placements and
// shambler markers that the library turns into one piece per level. See
// `deadvox/docs/aftermath.md`, "Scene slots".
function(palette, context)
local base = (import 'furniture.jsonnet').furniture + (import 'aftermath.libsonnet').furniture;
local sizes = { [f.id]: f.size for f in base };
local item(id, weight, count=null, condition=null) =
  { item: id, weight: weight }
  + (if count == null then {} else { count: count })
  + (if condition == null then {} else { condition: condition });
local nothing(weight) = { nothing: true, weight: weight };
local at(furniture, x, z, facing='n', loot=null, fixed=false) =
  { furniture: furniture, x: x, z: z, facing: facing, loot: loot, fixed: fixed };
local shambler(x, z) = { x: x, z: z, spawn: true };
// Placements stay in two bands, rows 6-7 and rows 10-11. Rows 4-5 are the lane a body walks between
// the entry anchor, the stair landings and the street door, so they stay clear.
local scenes = [
  {
    id: 'meal', beats: 1, weight: 3,
    things: [
      at('kitchen_cupboard', 0, 11, loot='gauntlet_home_kitchen', fixed=true),
      at('desk', 2, 6), at('chair', 1, 6, 'e'), at('chair', 5, 7),
    ],
  },
  {
    id: 'packed', beats: 1, weight: 3, only: ['lower', 'room'],
    things: [
      at('wardrobe', 0, 11, loot='gauntlet_home_wardrobe'), at('bed', 8, 10, 'e'),
      at('crate', 5, 10, loot='gauntlet_packed_bag'), at('crate', 12, 10, loot='gauntlet_packed_bag'),
    ],
  },
  {
    id: 'failed_barricade', beats: 1, weight: 2,
    things: [
      at('wardrobe_fallen', 3, 6, 'e'), at('shelf_on_side', 7, 6), at('chair_on_back', 1, 6),
      at('chair_on_side', 9, 7), at('crate', 12, 10),
    ],
    shamblers: [shambler(12, 7), shambler(1, 5)],
  },
  {
    id: 'held_out', beats: 1, weight: 2, only: ['room'],
    things: [
      at('wardrobe', 5, 6, 'w'), at('shelf', 3, 6, 'w'), at('bed', 0, 10, 'e'),
      at('crate', 8, 10, loot='gauntlet_home_kitchen'),
    ],
  },
  {
    id: 'searched', beats: 0, weight: 2,
    things: [
      at('wardrobe_on_side', 0, 11, loot='gauntlet_searched'), at('shelf_fallen', 6, 10, 'e'),
      at('crate_overturned', 11, 10), at('desk', 2, 6, loot='gauntlet_searched'),
      at('chair_on_side', 8, 6),
    ],
  },
  {
    id: 'calm', beats: 0, weight: 2,
    things: [at('crate', 0, 10), at('kitchen_cupboard', 12, 11, fixed=true), at('chair', 6, 6, 's')],
  },
];
assert std.all([scene.beats <= 1 for scene in scenes]) : 'a room holds at most one beat';
// Cells the stairs own, which no scene may touch: [first row, last row, last column]. A stairwell
// cuts the back band off on the middle storey and the front band off on the lower one, so a scene
// whose loot sits in the back band (`only`) is offered where that band can be walked.
local carves = { lower: [2, 3, 10], middle: [8, 9, 10], room: null };
local extent(thing) =
  local s = sizes[thing.furniture];
  if thing.facing == 'e' || thing.facing == 'w' then [s[2], s[1], s[0]] else s;
local covers(thing, x, y, z) =
  local e = extent(thing);
  x >= thing.x && x < thing.x + e[0] && y < e[1] && z >= thing.z && z < thing.z + e[2];
local marked(things, x, z) = std.length([1 for thing in things if covers(thing, x, 0, z)]) > 0;
local carved(level, x, z) = carves[level] != null && z >= carves[level][0] && z <= carves[level][1] && x <= carves[level][2];
local chars = std.stringChars('abcdefghijklmnoqrstuvwxy');
local offered(level) = [scene for scene in scenes if !std.objectHas(scene, 'only') || std.member(scene.only, level)];
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
                    + (if thing.fixed then { fixed: true } else {})
                    + (if std.objectHas(thing, 'items') then { items: thing.items } else {})
      for thing in things
    },
    layers: grid(cell),
    ownership: { layers: grid(claim) },
    anchors: {}, ports: [],
  };
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
        item('matches', 2), item('bandage', 2), item('painkillers', 1), item('flashlight', 1, condition=[0.5, 1]),
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
