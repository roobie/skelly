// Items and blueprint for the cube van; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/cube_van.spec.libsonnet';
local part(suffix, name, capabilities) = kit.part('cube_van_' + suffix, 'Cube van ' + name, kit.pileSize, capabilities);
{
  items: van.items(kit, 'cube_van', 'Cube van', s) + [
    part('peak', 'box peak', ['structure', 'protection']),
  ],
  blueprint: {
    id: 'cube_van',
    name: 'Cube van',
    fittings: van.fittings(kit, 'cube_van', s) + [
      kit.fitting('peak', 'cube_van_peak', kit.origin, ['box']),
      kit.cargoSpace('load', [-1.8, s.box.floor, 0], [28, 20, 20], 'load_floor'),
    ],
  },
}
