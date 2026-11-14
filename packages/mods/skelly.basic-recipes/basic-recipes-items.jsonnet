// Disassembly recovers a rolled share of each part, rounded down.
local salvage = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
local yield(item, count) = { item: item, count: count, fractions: salvage, rounding: 'floor' };

local recipe(id, category, tags, result, count, minutes, skills, qualities, components) = {
  id: id,
  category: category,
  tags: tags,
  searchTerms: [],
  result: { item: result, count: count },
  timeGameMinutes: minutes,
  skills: skills,
  qualities: qualities,
  components: components,
};
local crafting = { crafting: 0 };
local mechanics = { mechanics: 0 };
local bench = { workstation: 'workbench' };

local repair(id, category, tags, item, skill, minutes, qualities, components) =
  recipe(id, category, tags, item, 1, minutes, { [skill]: 0 }, qualities, components) + {
    kind: 'repair',
    repair: { skill: skill, amount: 0.2, perSkill: 0.1 },
  };
// Terrain repair names a block; `amount` and `perSkill` are durability points of that block's material
// (`packages/mods/skelly.natural-world/block-materials.jsonnet`), never fractions as item repair uses.
local repairBlock(id, tags, block, item, amount, perSkill, minutes, components) =
  repair(id, 'repair_structures', tags, item, 'crafting', minutes, { repairing: 1 }, components) + {
    repair: { skill: 'crafting', amount: amount, perSkill: perSkill, block: block },
  };
local mendClothing(item, minutes, patch=[{ item: 'sewing_thread', count: 1 }]) = repair(
  'repair_' + item, 'repair_clothing', ['textile'], item, 'crafting', minutes, { sewing: 1 },
  [[{ item: 'cloth_strip', count: 1 }], patch],
);

(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  items: [
    {
      id: 'wooden_plank',
      name: 'Wooden plank',
      category: 'material',
      model: 'wooden_plank',
      size: [2, 4],
      disassembly: { timeGameMinutes: 4, skill: 'crafting', yields: [yield('stick', 2)] },
    },
    {
      id: 'door_bar',
      name: 'Door bar',
      category: 'tool',
      weight: 3000,
      size: [1, 6],
      twoHanded: true,
      description: 'A length of timber that drops across a shut door and bars it from the other side.',
      doorBar: { setSimSeconds: 3, liftSimSeconds: 2, look: { color: '#7a5532', thickness: 0.09 } },
      disassembly: { timeGameMinutes: 5, skill: 'crafting', yields: [yield('wooden_plank', 2)] },
    },
    {
      id: 'hand_saw',
      name: 'Hand saw',
      category: 'tool',
      size: [2, 6],
      model: 'hand_saw',
      tool: { qualities: { sawing: 1 } },
      salvageTimeGameMinutes: 5,
      salvage: [{ item: 'scrap_metal', count: 1 }, { item: 'wooden_plank', count: 1 }],
    },
  ],
  recipes: [
    recipe('rag_to_cloth_strip', 'materials', ['textile'], 'cloth_strip', 2, 4, crafting, { cutting: 1 }, [[{ item: 'rag', count: 1 }]]),
    recipe('sew_cloth_strip', 'materials', ['textile'], 'rag', 1, 10, crafting, { sewing: 1 }, [
      [{ item: 'cloth_strip', count: 3 }],
      [{ item: 'sewing_thread', count: 1 }],
    ]),
    recipe('make_rope', 'materials', ['textile'], 'rope', 1, 4, crafting, {}, [[{ item: 'cloth_strip', count: 4 }]]),
    recipe('trim_wood_offcut', 'materials', ['wood'], 'wood_offcut', 2, 5, crafting, { sawing: 1 }, [[{ item: 'wooden_plank', count: 1 }]]) + bench,
    recipe('make_sewing_kit', 'tools', ['textile'], 'sewing_kit', 1, 12, crafting, { cutting: 1 }, [
      [{ item: 'sewing_thread', count: 1 }],
      [{ item: 'cloth_strip', count: 1 }],
      [{ item: 'fastener_pack', count: 1 }],
    ]),
    recipe('make_sewing_repair_kit', 'tools', ['textile'], 'sewing_repair_kit', 1, 15, crafting, { sewing: 1 }, [
      [{ item: 'sewing_thread', count: 1 }],
      [{ item: 'cloth_strip', count: 2 }],
      [{ item: 'duct_tape', count: 1 }],
    ]),
    recipe('make_wire_strippers', 'tools', ['metal', 'electrical'], 'wire_strippers', 1, 18, mechanics, { hammering: 1 }, [
      [{ item: 'scrap_metal', count: 1 }],
      [{ item: 'rubber_strip', count: 1 }],
      [{ item: 'fastener_pack', count: 1 }],
    ]) + bench,
    recipe('assemble_fastener_pack', 'materials', ['metal'], 'fastener_pack', 2, 6, crafting, { hammering: 1 }, [
      [{ item: 'nails', count: 5 }],
      [{ item: 'scrap_metal', count: 1 }],
    ]),
    repair('repair_hammer', 'repair_tools', ['metal'], 'hammer', 'mechanics', 12, { repairing: 1 }, [
      [{ item: 'scrap_metal', count: 1 }],
      [{ item: 'duct_tape', count: 1 }],
    ]),
    mendClothing('jeans', 10),
    mendClothing('cargo_pants', 12),
    mendClothing('hoodie', 12),
    mendClothing('jacket', 15),
    mendClothing('utility_vest', 15),
    mendClothing('stab_vest', 15),
    repair('repair_riot_helmet', 'repair_clothing', [], 'riot_helmet', 'crafting', 15, {}, [[{ item: 'duct_tape', count: 1 }]]),
    mendClothing('hiking_backpack', 16, patch=[{ item: 'nylon_cord', count: 1 }]),
    mendClothing('fanny_pack', 10),
    recipe('make_bandage', 'supplies', ['textile'], 'bandage', 1, 5, crafting, {}, [[{ item: 'cloth_strip', count: 2 }]]),
    recipe('make_taped_armour', 'supplies', ['textile'], 'taped_armour', 1, 30, crafting, {}, [
      [{ item: 'paperback', count: 4 }],
      [{ item: 'duct_tape', count: 2 }],
    ]),
    recipe('repair_kit', 'tools', ['metal', 'textile'], 'repair_kit', 1, 30, { crafting: 1 }, { hammering: 1 }, [
      [{ item: 'scrap_metal', count: 2 }],
      [{ item: 'duct_tape', count: 1 }],
      [{ item: 'rag', count: 2 }],
    ]),
    repair('repair_crowbar', 'repair_tools', ['metal'], 'crowbar', 'crafting', 15, { repairing: 1 }, [
      [{ item: 'scrap_metal', count: 1 }],
      [{ item: 'duct_tape', count: 1 }],
    ]),
    repairBlock('repair_brick', ['metal'], 'brick', 'scrap_metal', 60, 30, 20, [[{ item: 'scrap_metal', count: 1 }]]),
    repairBlock('repair_planks', ['wood'], 'planks', 'wooden_plank', 20, 10, 15, [[{ item: 'wooden_plank', count: 1 }]]),
    recipe('sawn_plank', 'materials', ['wood'], 'wooden_plank', 1, 4, crafting, { sawing: 1 }, [[{ item: 'stick', count: 2 }]]) + bench + { searchTerms: ['saw'] },
    recipe('door_bar', 'fixtures', ['wood'], 'door_bar', 1, 10, crafting, { sawing: 1 }, [[{ item: 'wooden_plank', count: 2 }]]) + bench,
  ] + (import 'tools/jsonnet/lib/sharpen-recipes.libsonnet').sharpenRecipes(
    (import 'packages/mods/skelly.hand-tools/hand-tools-items.jsonnet').items,
  ),
})
