// Items and blueprint for the panel van; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/panel_van.spec.libsonnet';
{
  // The panel van's battery siblings close their grille with the panel.
  items: van.items(kit, 'panel_van', 'Panel van', s) + [kit.part('electric_van_grille_panel', 'Electric van grille panel', [8, 3], ['protection'])],
  blueprint: {
    id: 'panel_van',
    name: 'Panel van',
    fittings: van.fittings(kit, 'panel_van', s) + [
      // Between the wheel tubs, from the rear doors to the bulkhead.
      kit.cargoSpace('cargo', [-1.25, s.floor, 0], [23, 16, 14], 'load_floor'),
    ],
  },
}
