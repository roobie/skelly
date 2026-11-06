// Items and blueprint for the ice cream van; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/ice_cream_van.spec.libsonnet';
local part(suffix, name, capabilities) = kit.part('ice_cream_van_' + suffix, 'Ice cream van ' + name, kit.pileSize, capabilities);
{
  items: van.items(kit, 'ice_cream_van', 'Ice cream van', s) + [
    part('serving_hatch', 'serving hatch', ['structure']),
    part('roof_cone', 'roof cone', ['structure']),
    part('freezer', 'freezer', ['storage']),
  ],
  blueprint: {
    id: 'ice_cream_van',
    name: 'Ice cream van',
    fittings: van.fittings(kit, 'ice_cream_van', s) + [
      kit.fitting('serving_hatch', 'ice_cream_van_serving_hatch', kit.origin, ['box']),
      kit.fitting('roof_cone', 'ice_cream_van_roof_cone', kit.origin, ['box']),
      kit.fitting('freezer', 'ice_cream_van_freezer', kit.origin, ['load_floor']),
    ],
  },
}
