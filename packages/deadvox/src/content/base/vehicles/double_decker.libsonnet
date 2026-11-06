// Items and blueprint for the double decker. Its panels and layout come from its spec through the bus body helper.
local kit = import '../vehicle-kit.libsonnet';
local bus = import 'packages/thing-authoring-tool/vehicles/bus-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/double_decker.spec.libsonnet';
local fitting = kit.fitting;
{
  items: bus.items(kit, 'double_decker', 'Double decker', s) + [
    kit.part('double_decker_stairs', 'Double decker stairs', kit.pileSize, ['structure']),
    kit.part('double_decker_stair_rail', 'Stair rail', kit.pileSize, ['structure']),
  ],
  blueprint: {
    id: 'double_decker',
    name: 'Double decker',
    fittings: bus.fittings(kit, 'double_decker', s) + [
      fitting('stairs', 'double_decker_stairs', kit.origin, ['shell']),
      fitting('stair_rail', 'double_decker_stair_rail', [0, s.decks[1].floor, s.stairWell.z], ['upper_floor']),
      fitting('pole_door', 'grab_pole_short', [3.42, s.floor, s.stairs.inner + 0.025], ['shell']),
      fitting('pole_stairs', 'grab_pole_short', [1.58, s.floor, s.stairs.inner + 0.025], ['shell']),
    ],
  },
}
