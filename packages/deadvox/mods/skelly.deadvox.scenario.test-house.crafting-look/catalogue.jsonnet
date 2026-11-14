local sample(i) = 'craft_look_result_' + i;
local indices = std.range(1, 3072);
{
  items: [
    { id: 'craft_look_fibre', name: 'Look fibre', category: 'material', size: [1, 1], weight: 1 },
    { id: 'craft_look_wood', name: 'Look wood', category: 'material', size: [1, 1], weight: 1 },
  ] + [
    { id: sample(i), name: std.format('Catalogue sample %04d', i), category: 'material', size: [1, 1], weight: 1 }
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
      id: sample(i), category: 'craft_look_category_' + (i % 24),
      tags: ['craft_look_tag_' + (i % 16)], searchTerms: ['synthetic', 'sample ' + i],
      result: { item: sample(i), count: 1 }, timeGameMinutes: 1, skills: {},
      qualities: if i == 2 then { craft_look_press: 1 } else {},
      components: [
        [{ item: 'craft_look_fibre', count: 1 }, { item: 'craft_look_wood', count: 1 }],
        [{ item: 'craft_look_fibre', count: 1 }],
        [{ liquid: 'lamp_fuel', volumeMicrolitres: 10000 }],
      ],
    }
    for i in indices
  ],
}
