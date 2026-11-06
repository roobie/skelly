// Items and blueprint for the city bus. Its panels and layout come from its spec through the bus body helper.
local kit = import '../vehicle-kit.libsonnet';
local bus = import 'packages/thing-authoring-tool/vehicles/bus-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/city_bus.spec.libsonnet';
local fitting = kit.fitting;
local pole(id, x, z) = fitting(id, 'grab_pole', [x, s.floor, z], ['shell']);
{
  items: bus.items(kit, 'city_bus', 'City bus', s) + [
    kit.part('city_bus_ceiling_rail', 'Ceiling rail', kit.pileSize, ['structure']),
    kit.part('city_bus_roof_unit', 'Bus roof air unit', kit.pileSize, []),
  ],
  blueprint: {
    id: 'city_bus',
    name: 'City bus',
    fittings: bus.fittings(kit, 'city_bus', s) + [
      pole('pole_front', 3.9, 0.3),
      pole('pole_door_fwd', 1.6, 0.3),
      pole('pole_door_aft', 0.12, 0.3),
      pole('pole_stand_far', 1.02, -0.3),
      pole('pole_step', -0.58, -0.3),
      fitting('roof_unit', 'city_bus_roof_unit', [-2.6, s.roof, 0], ['shell']),
    ] + kit.pair('rail', 'city_bus_ceiling_rail', [0.95, 2.62, 0.3], kit.on(['shell'])),
  },
}
