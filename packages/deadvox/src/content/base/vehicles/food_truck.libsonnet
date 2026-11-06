// Items and blueprint for the food truck; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/food_truck.spec.libsonnet';
local part(suffix, name, capabilities) = kit.part('food_truck_' + suffix, 'Food truck ' + name, kit.pileSize, capabilities);
{
  items: van.items(kit, 'food_truck', 'Food truck', s) + [
    part('counter', 'counter', ['structure']),
    part('awning', 'awning', ['structure']),
    part('kitchen', 'kitchen', ['storage']),
    part('flue', 'flue', ['structure']),
  ],
  blueprint: {
    id: 'food_truck',
    name: 'Food truck',
    fittings: van.fittings(kit, 'food_truck', s) + [
      kit.fitting('counter', 'food_truck_counter', kit.origin, ['shell']),
      kit.fitting('awning', 'food_truck_awning', kit.origin, ['shell']),
      kit.fitting('kitchen', 'food_truck_kitchen', kit.origin, ['load_floor']),
      kit.fitting('flue', 'food_truck_flue', kit.origin, ['shell']),
    ]
    + kit.pair('door_step', 'door_step_walk_in', [s.bFront, 0.3, s.side], kit.on(['shell'])),
  },
}
