// Items and blueprint for the flatbed truck. Its cab and chassis come from `packages/thing-authoring-tool/vehicles/truck-cab.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/flatbed_truck.spec.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local origin = kit.origin;
local pile = kit.pileSize;
local truck = 'flatbed_truck';
{
  items: t.items(kit, truck, 'Flatbed truck', s) + [
    part('flatbed_truck_deck', 'Flatbed truck deck', pile, ['structure', 'load_floor']),
    part('flatbed_truck_headboard', 'Flatbed truck headboard', pile, ['protection']),
    part('flatbed_truck_toolbox', 'Flatbed truck toolbox', [10, 5], ['storage']),
  ],
  blueprint: {
    id: truck,
    name: 'Flatbed truck',
    fittings: t.fittings(kit, truck, s) + [
      fitting('deck', 'flatbed_truck_deck', origin, ['chassis']),
      fitting('headboard', 'flatbed_truck_headboard', origin, ['deck']),
      fitting('toolbox', 'flatbed_truck_toolbox', [-0.55, 0.62, 1.0], ['deck']),
      kit.cargoSpace('deck_cargo', [-1.1, s.deckTop, 0], [68, 12, 24], 'deck'),
    ],
  },
}
