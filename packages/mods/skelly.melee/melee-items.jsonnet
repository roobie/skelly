// Disassembly recovers a rolled share of each part, rounded down.
local salvage = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
local yield(item, count) = { item: item, count: count, fractions: salvage, rounding: 'floor' };
local disassembly(timeGameMinutes, yields) = { timeGameMinutes: timeGameMinutes, skill: 'crafting', yields: yields };

local weapon = import 'tools/jsonnet/lib/melee-weapon.libsonnet';
local melee = weapon.melee;
local lightSwing = weapon.lightSwing;
local heavySwing = weapon.heavySwing;
local metalRing = weapon.metalRing;

local repair(item, tag, minutes, qualities, components) = {
  id: 'repair_' + item,
  category: 'repair_tools',
  tags: [tag],
  searchTerms: [],
  kind: 'repair',
  result: { item: item, count: 1 },
  repair: { skill: 'mechanics', amount: 0.2, perSkill: 0.1 },
  timeGameMinutes: minutes,
  skills: { mechanics: 0 },
  qualities: qualities,
  components: components,
};
local patched = [[{ item: 'scrap_metal', count: 1 }], [{ item: 'duct_tape', count: 1 }]];

local items = [
  {
    id: 'kabar',
    name: 'Kabar',
    category: 'tool',
    size: [1, 3],
    model: 'kabar',
    tool: { qualities: { cutting: 2, opening: 1 } },
    weapon: melee('cut', 'swing', damage=9, reach=0.3, cooldownSimSeconds=0.55, stamina=3.5, impulse=4, wearPerHit=0.025) + lightSwing,
  },
  {
    id: 'machete',
    name: 'Machete',
    category: 'tool',
    size: [1, 6],
    model: 'machete',
    tool: { qualities: { cutting: 2, opening: 1 } },
    weapon: melee('cut', 'swing', damage=11, reach=0.45, cooldownSimSeconds=0.75, stamina=5, impulse=4.5, wearPerHit=0.02) + lightSwing,
  },
  {
    id: 'baseball_bat',
    name: 'Baseball bat',
    category: 'weapon',
    size: [1, 9],
    model: 'baseball_bat',
    twoHanded: true,
    weapon: melee('blunt', 'swing', damage=15, reach=0.8, cooldownSimSeconds=1.2, stamina=9, impulse=10, wearPerHit=0.01) + heavySwing,
  },
  {
    id: 'steel_pipe',
    name: 'Steel pipe',
    category: 'weapon',
    size: [1, 10],
    model: 'steel_pipe',
    weapon: melee('blunt', 'swing', damage=13, reach=0.6, cooldownSimSeconds=1.2, stamina=9, impulse=8, wearPerHit=0.015) + heavySwing + metalRing,
  },
  {
    id: 'nail_bat',
    name: 'Nail bat',
    category: 'weapon',
    size: [1, 9],
    model: 'baseball_bat',
    twoHanded: true,
    description: 'A baseball bat reinforced with nails.',
    disassembly: disassembly(10, [yield('baseball_bat', 1), yield('nails', 6)]),
    weapon: melee('pierce', 'swing', damage=17, reach=0.8, cooldownSimSeconds=1.3, stamina=10, impulse=9, wearPerHit=0.015) + heavySwing,
  },
  {
    id: 'spear',
    name: 'Sharpened spear',
    category: 'weapon',
    size: [1, 10],
    model: 'steel_pipe',
    twoHanded: true,
    description: 'A sharpened wooden shaft bound at the tip.',
    disassembly: disassembly(8, [yield('stick', 1), yield('nylon_cord', 1)]),
    weapon: melee('pierce', 'thrust', damage=14, reach=1.1, cooldownSimSeconds=1, stamina=7, impulse=6, wearPerHit=0.02) + lightSwing,
  },
];

local classIds = [meleeClass.id for meleeClass in (import 'packages/mods/skelly.melee-classes/melee-classes.jsonnet').meleeClasses];
assert std.all([std.member(classIds, item.weapon.melee.type) for item in items])
       : 'every melee weapon must name a melee class in the shared mod';

(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  skills: [
    {
      id: 'melee_combat',
      capability: 'meleeCombat',
      name: 'Melee Combat (MC)',
      curve: import 'tools/jsonnet/lib/skill-curve.libsonnet',
      training: {
        activities: {
          block: { practice: 0.2, tier: 5 },
          hit: { practice: 1, tier: 5 },
        },
      },
      combat: {
        melee: {
          blockChanceRange: 0.45,
          blockChanceHalfLifeLevels: 4,
          mitigationRange: 0.55,
          mitigationHalfLifeLevels: 3,
          staminaCostFloor: 0.35,
          staminaCostHalfLifeLevels: 3,
        },
      },
    },
  ],
  items: items,
  recipes: [
    repair('machete', 'metal', 15, { repairing: 1 }, patched),
    repair('kabar', 'metal', 12, { repairing: 1 }, patched),
    repair('baseball_bat', 'wood', 14, { repairing: 1, hammering: 1 }, [
      [{ item: 'wood_offcut', count: 1 }],
      [{ item: 'duct_tape', count: 1 }],
    ]),
    repair('steel_pipe', 'metal', 14, { repairing: 1 }, patched),
    {
      id: 'make_nail_bat',
      category: 'tools',
      tags: ['wood', 'metal'],
      searchTerms: [],
      result: { item: 'nail_bat', count: 1 },
      timeGameMinutes: 15,
      skills: { crafting: 0 },
      qualities: { hammering: 1 },
      components: [
        [{ item: 'baseball_bat', count: 1 }],
        [{ item: 'nails', count: 12 }],
      ],
    },
    {
      id: 'make_spear',
      category: 'tools',
      tags: ['wood', 'textile'],
      searchTerms: [],
      result: { item: 'spear', count: 1 },
      timeGameMinutes: 20,
      skills: { crafting: 0 },
      qualities: {},
      components: [
        [{ item: 'stick', count: 1 }, { item: 'wooden_plank', count: 1 }],
        [{ item: 'kitchen_knife', count: 1 }, { item: 'glass_shards', count: 2 }],
        [{ item: 'nylon_cord', count: 1 }, { item: 'duct_tape', count: 1 }],
      ],
    },
  ] + (import 'tools/jsonnet/lib/sharpen-recipes.libsonnet').sharpenRecipes(items),
})
