// Items and blueprint for the high-roof van; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/high_roof_van.spec.libsonnet';
{
  items: van.items(kit, 'high_roof_van', 'High-roof van', s),
  blueprint: {
    id: 'high_roof_van',
    name: 'High-roof van',
    fittings: van.fittings(kit, 'high_roof_van', s) + [
      // Stand-up height between the wheel tubs, from the rear doors to the bulkhead.
      kit.cargoSpace('cargo', [-1.55, s.floor, 0], [29, 20, 14], 'load_floor'),
    ],
  },
}
