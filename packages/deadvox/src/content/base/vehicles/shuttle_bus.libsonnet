// Items and blueprint for the shuttle bus. Its panels and layout come from its spec through the bus body helper.
local kit = import '../vehicle-kit.libsonnet';
local bus = import 'packages/thing-authoring-tool/vehicles/bus-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/shuttle_bus.spec.libsonnet';
{
  items: bus.items(kit, 'shuttle_bus', 'Shuttle bus', s) + [
    kit.part('shuttle_bus_luggage_rack', 'Shuttle bus luggage rack', kit.pileSize, ['storage']),
    kit.part('shuttle_bus_roof_unit', 'Shuttle bus roof air unit', kit.pileSize, ['protection']),
  ],
  blueprint: {
    id: 'shuttle_bus',
    name: 'Shuttle bus',
    fittings: bus.fittings(kit, 'shuttle_bus', s) + [
      kit.fitting('pole_door_fwd', 'grab_pole_short', [2.2, s.floor, 0.45], ['shell']),
      kit.fitting('pole_door_aft', 'grab_pole_short', [0.85, s.floor, 0.45], ['shell']),
      kit.fitting('luggage_rack', 'shuttle_bus_luggage_rack', [s.rack.x, 0, 0], ['shell']),
      kit.fitting('roof_unit', 'shuttle_bus_roof_unit', kit.origin, ['shell']),
    ],
  },
}
