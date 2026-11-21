local plank(count) = [{ item: 'wooden_plank', count: count }];
local nails(count) = [{ item: 'nails', count: count }];
// Quick fixture twins of the kit's placement recipes, so a browser stage or a by-play look finishes a build in
// seconds; each names its review order the way the kit's rows do (`placementReviewOrder` on every placement recipe).
local work(id, result, order, minutes, components) = {
  id: id,
  category: 'fixtures',
  tags: ['wood'],
  searchTerms: ['build', 'fortify'],
  result: result + { count: 1 },
  placementReviewOrder: order,
  timeGameMinutes: minutes,
  skills: {},
  qualities: {},
  components: components,
};
{
  recipes: [
    work('placement_look_wall', { block: 'plank_wall' }, 'spot-first', 0.5, [plank(1), nails(2)]),
  ] + [
    // Keep the real recipes' identity and requirements so the look offers no tool-free shelf twin, but finishes
    // its by-play checks without waiting.
    recipe + { timeGameMinutes: 0.5 }
    for recipe in (import 'packages/mods/skelly.basic-recipes/basic-recipes-construction.jsonnet').recipes
    if std.member(['board_up_door', 'build_wood_shelf'], recipe.id)
  ],
}
