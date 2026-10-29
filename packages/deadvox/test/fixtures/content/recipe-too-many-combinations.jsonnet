{
  recipeCategories: [{ id: 'fixture_category', label: 'Fixture', order: 0 }],
  recipes: [{
    id: 'fixture_too_many_combinations',
    category: 'fixture_category',
    tags: [],
    searchTerms: [],
    result: { item: 'rag', count: 1 },
    timeGameMinutes: 1,
    skills: {},
    qualities: {},
    components: [
      [{ item: 'rag', count: 1 }, { item: 'nails', count: 1 }]
      for group in std.range(1, 11)
    ],
  }],
}
