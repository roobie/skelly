local item(id, name) = {
  id: id,
  name: name,
  workInProgress: false,
  notLoot: false,
  economy: { usage: [], tiers: [] },
  category: 'material',
  weight: 1,
  size: [1, 1],
};
local disassembly = {
  timeGameMinutes: 1,
  skill: 'crafting',
  yields: [{ item: 'rag', count: 1, fractions: [0.5, 1], rounding: 'floor' }],
};
{
  skills: [{ id: 'crafting', name: 'Crafting', training: { craftingTierOffset: 1 } }],
  recipeCategories: [{ id: 'fixture_category', label: 'Fixture', order: 0 }],
  items: [
    item('fixture_unfound', 'Unfound') + { disassembly: disassembly },
    item('fixture_result', 'Result') + { disassembly: disassembly },
    item('rag', 'Rag'),
  ],
  recipes: [{
    id: 'torch',
    category: 'fixture_category',
    tags: [],
    searchTerms: [],
    result: { item: 'fixture_result', count: 1 },
    timeGameMinutes: 1,
    skills: {},
    qualities: {},
    components: [[{ item: 'fixture_unfound', count: 1 }]],
  }],
}
