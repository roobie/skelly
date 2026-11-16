local planks(count) = [{ item: 'wooden_plank', count: count }];
local nails(count) = [{ item: 'nails', count: count }];
local work(id, result, minutes, components) = {
  id: id,
  category: 'fixtures',
  tags: ['wood'],
  searchTerms: ['build', 'fortify'],
  result: result + { count: 1 },
  timeGameMinutes: minutes,
  skills: { crafting: 0 },
  qualities: { hammering: 1, sawing: 1 },
  components: components,
};
local repair(id, target, minutes) = work(id, { item: 'wooden_plank' }, minutes, [planks(1), nails(2)]) + {
  category: 'repair_structures',
  kind: 'repair',
  qualities: { repairing: 1 },
  repair: target + { skill: 'crafting', amount: 20, perSkill: 10 },
};
{
  recipes: [
    work('build_plank_wall', { block: 'plank_wall' }, 10, [planks(2), nails(4)]),
    work('build_plank_floor', { block: 'plank_floor' }, 5, [planks(1), nails(2)]),
    work('build_wood_door', { entity: 'improvised_wood_door' }, 30, [
      planks(6), nails(12), [{ item: 'hinge_set', count: 1 }],
    ]),
    work('build_wood_shelf', { entity: 'shelf' }, 30, [planks(4), nails(12)]),
    work('board_up_door', { doorBoarding: 'wood_door_boarding' }, 20, [planks(3), nails(12)]),
    repair('repair_plank_wall', { block: 'plank_wall' }, 15),
    repair('repair_plank_floor', { block: 'plank_floor' }, 15),
    repair('repair_improvised_wood_door', { entity: 'improvised_wood_door' }, 15),
    repair('repair_wood_shelf', { entity: 'shelf' }, 15),
  ],
}
