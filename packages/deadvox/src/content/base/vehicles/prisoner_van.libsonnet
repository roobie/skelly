// Items and blueprint for the prisoner van; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/prisoner_van.spec.libsonnet';
local part(suffix, name, capabilities) = kit.part('prisoner_van_' + suffix, 'Prisoner van ' + name, kit.pileSize, capabilities);
{
  items: van.items(kit, 'prisoner_van', 'Prisoner van', s) + [
    part('rear_bars', 'rear window bars', ['protection']),
    part('side_bars', 'side window bars', ['protection']),
    part('cab_cage', 'cab cage', ['structure', 'protection']),
    part('side_bench', 'side bench', ['seat']),
  ],
  blueprint: {
    id: 'prisoner_van',
    name: 'Prisoner van',
    fittings: van.fittings(kit, 'prisoner_van', s) + [
      kit.fitting('side_bars', 'prisoner_van_side_bars', kit.origin, ['shell']),
      kit.fitting('cab_cage', 'prisoner_van_cab_cage', kit.origin, ['floor']),
    ]
    + kit.pair('rear_bars', 'prisoner_van_rear_bars', kit.origin, kit.on(paired=['rear_door']))
    + kit.pair('side_bench', 'prisoner_van_side_bench', kit.origin, kit.on(['floor'])),
  },
}
