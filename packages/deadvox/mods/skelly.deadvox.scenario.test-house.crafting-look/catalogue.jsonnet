local sample(i) = 'craft_look_result_' + i;
local indices = std.range(1, 3072);
{
  items: [
    { id: 'craft_look_fibre', workInProgress: false, name: 'Fibre look', category: 'material', size: [1, 1], weight: 1 },
    { id: 'craft_look_wood', workInProgress: false, name: 'Wood look', category: 'material', size: [1, 1], weight: 1 },
  ] + [
    { id: sample(i), workInProgress: false, name: std.format('%04d Catalogue sample', i), category: 'material', size: [2, 2], weight: 1 }
    for i in indices
  ],
  recipeCategories: [{ id: 'craft_look', label: 'Catalogue look', order: 0 }] + [
    { id: 'craft_look_category_' + i, label: 'Branch ' + i, parent: 'craft_look', order: i }
    for i in std.range(0, 23)
  ],
  recipeTags: [
    { id: 'craft_look_tag_' + i, label: 'Tag ' + i, searchTerms: ['facet ' + i] }
    for i in std.range(0, 15)
  ],
  recipes: [
    {
      id: 'craft_look_chair_repair', kind: 'repair', category: 'craft_look', tags: [], searchTerms: [],
      result: { item: 'craft_look_wood', count: 1 },
      repair: { entity: 'chair', skill: 'crafting', amount: 0.5, perSkill: 0 },
      timeGameMinutes: 5, skills: {}, qualities: {},
      components: [[{ item: 'craft_look_wood', count: 2 }, { item: 'craft_look_fibre', count: 1 }]],
    },
  ] + [
    {
      id: sample(i), category: 'craft_look_category_' + (i % 24),
      tags: ['craft_look_tag_' + (i % 16)], searchTerms: ['synthetic', 'sample ' + i],
      result: { item: sample(i), count: 1 }, timeGameMinutes: 1, skills: {},
      qualities: if i == 2 then { opening: 5 } else {},
      components: [
        [{ item: 'craft_look_fibre', count: 1 }, { item: 'craft_look_wood', count: 1 }],
        [{ item: 'craft_look_fibre', count: 1 }],
        [{ liquid: 'lamp_fuel', volumeMicrolitres: 10000 }],
      ],
    }
    for i in indices
  ],
}
