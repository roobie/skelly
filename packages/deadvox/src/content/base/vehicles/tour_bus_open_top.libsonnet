// Items and blueprint for the open-top tour bus. Its stairs, stair rail and upper floor are the double decker's parts.
local kit = import '../vehicle-kit.libsonnet';
local bus = import 'packages/thing-authoring-tool/vehicles/bus-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/tour_bus_open_top.spec.libsonnet';
local fitting = kit.fitting;
{
  items: bus.items(kit, 'tour_bus_open_top', 'Open-top tour bus', s) + [
    kit.part('tour_bus_open_top_deck_rail', 'Open-top tour bus deck rail', kit.pileSize, ['structure']),
    kit.part('tour_bus_open_top_deflector', 'Open-top tour bus wind deflector', kit.pileSize, ['glazing']),
  ],
  blueprint: {
    id: 'tour_bus_open_top',
    name: 'Open-top tour bus',
    fittings: bus.fittings(kit, 'tour_bus_open_top', s) + [
      fitting('upper_floor', 'double_decker_upper_floor', kit.origin, ['shell']),
      fitting('stairs', 'double_decker_stairs', kit.origin, ['shell']),
      fitting('stair_rail', 'double_decker_stair_rail', [0, s.upperDeck, s.stairWell.z], ['upper_floor']),
      fitting('pole_door', 'grab_pole_short', [3.42, s.floor, s.stairs.inner + 0.025], ['shell']),
      fitting('pole_stairs', 'grab_pole_short', [1.58, s.floor, s.stairs.inner + 0.025], ['shell']),
      fitting('deck_rail', 'tour_bus_open_top_deck_rail', kit.origin, ['shell']),
      fitting('deflector', 'tour_bus_open_top_deflector', kit.origin, ['shell']),
    ],
  },
}
