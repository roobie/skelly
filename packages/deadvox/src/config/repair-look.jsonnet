local target = 'crate';
local recipe = 'debug_crate_repair';
local stock = 'wooden_plank';
local mod = 'debug-repair-look';
{
  furniture: target,
  damageFraction: 0.5,
  recipe: recipe,
  mod: {
    id: mod,
    data: {
      id: mod,
      skills: [{ id: 'debug_repair', name: 'Debug repair', startingRecipes: [recipe] }],
      recipes: [{
        id: recipe,
        category: 'fixtures',
        tags: [],
        searchTerms: [],
        kind: 'repair',
        result: { item: stock, count: 1 },
        repair: { entity: target, skill: 'debug_repair', amount: 1, perSkill: 0 },
        timeGameMinutes: 1,
        skills: {},
        qualities: {},
        components: [[{ item: stock, count: 1 }]],
      }],
    },
  },
}
