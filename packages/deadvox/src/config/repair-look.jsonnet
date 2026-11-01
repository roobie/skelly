local target = 'shelf';
local damageFraction = 0.5;
local furniture = [piece for piece in (import '../content/base/furniture.jsonnet').furniture if piece.id == target][0];
local recipe = 'debug_showroom_repair';
local stock = 'wooden_plank';
local mod = 'debug-repair-look';
{
  furniture: target,
  damageFraction: damageFraction,
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
        repair: { entity: target, skill: 'debug_repair', amount: furniture.breach.durability * damageFraction, perSkill: 0 },
        timeGameMinutes: 1,
        skills: {},
        qualities: {},
        components: [[{ item: stock, count: 1 }]],
      }],
    },
  },
}
