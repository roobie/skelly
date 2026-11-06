// Items and blueprint for the security van; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/security_van.spec.libsonnet';
local part(suffix, name, size, capabilities) = kit.part('security_van_' + suffix, 'Security van ' + name, size, capabilities);
{
  items: van.items(kit, 'security_van', 'Security van', s) + [
    part('cab_plate', 'cab door plate', kit.pileSize, ['protection']),
    part('rear_door_bars', 'rear door bars', kit.pileSize, ['protection']),
    part('side_door_bars', 'side door bars', kit.pileSize, ['protection']),
    part('cash_chute', 'cash chute', [6, 5], ['storage']),
    part('roof_hatch', 'roof hatch', kit.pileSize, ['protection']),
  ],
  blueprint: {
    id: 'security_van',
    name: 'Security van',
    fittings: van.fittings(kit, 'security_van', s) + [
      kit.fitting('side_door_bars', 'security_van_side_door_bars', kit.origin, ['side_door']),
      kit.fitting('cash_chute', 'security_van_cash_chute', kit.origin, ['box']),
      kit.fitting('roof_hatch', 'security_van_roof_hatch', kit.origin, ['box']),
      // The strongroom, in from the rear doors across the box.
      kit.cargoSpace('strongroom', [-1.4, s.box.floor, 0], [26, 16, 20], 'load_floor'),
    ]
    + kit.pair('cab_plate', 'security_van_cab_plate', kit.origin, kit.on(paired=['front_door']))
    + kit.pair('rear_door_bars', 'security_van_rear_door_bars', kit.origin, kit.on(paired=['rear_door'])),
  },
}
