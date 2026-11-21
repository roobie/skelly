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
    // The kit's own shelf recipe's four planks: a cheaper twin would return more material than it consumes
    // (`checkMaterialCycles`).
    work('placement_look_shelf', { entity: 'shelf' }, 'review-first', 0.5, [plank(4), nails(8)]),
    work('placement_look_board', { doorBoarding: 'wood_door_boarding' }, 'spot-first', 0.5, [plank(1), nails(2)]),
  ],
}
