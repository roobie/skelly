local target = 'crate';
local recipe = 'debug_crate_repair';
local stock = 'wooden_plank';
{
  furniture: target,
  damageFraction: 0.5,
  recipe: recipe,
  mod: {
    id: 'debug-repair-look',
    data: {
      id: 'debug-repair-look',
      skills: [{ id: 'debug_repair', name: 'Debug repair', startingRecipes: [recipe] }],
      recipes: [{
        id: recipe,
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
