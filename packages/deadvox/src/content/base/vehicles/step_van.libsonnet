// Items and blueprint for the step van; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/step_van.spec.libsonnet';
local part(suffix, name, capabilities) = kit.part('step_van_' + suffix, 'Step van ' + name, kit.pileSize, capabilities);
{
  items: van.items(kit, 'step_van', 'Step van', s) + [
    part('far_door_trim', 'far door trim', ['structure']),
  ],
  blueprint: {
    id: 'step_van',
    name: 'Step van',
    fittings: van.fittings(kit, 'step_van', s) + [
      kit.fitting('roof_vent', 'roof_vent', [-0.9, s.roof, 0], ['shell']),
      kit.fitting('far_door_trim', 'step_van_far_door_trim', kit.origin, ['shell']),
      kit.cargoSpace('load', [-1.0, s.floor, 0], [30, 20, 14], 'load_floor'),
    ]
    + kit.pair('door_step', 'door_step_walk_in', [s.bFront, 0.3, s.side], kit.on(['shell'])),
  },
}
