// Items and blueprint for the camper van; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/camper_van.spec.libsonnet';
{
  items: van.items(kit, 'camper_van', 'Camper van', s) + [
    kit.part('camper_van_pop_top', 'Camper van pop-top roof', kit.pileSize, ['protection']),
    kit.part('camper_van_kitchen', 'Camper van kitchen unit', kit.pileSize, ['storage']),
    kit.part('camper_van_curtains', 'Camper van curtains', [6, 2], []),
  ],
  blueprint: {
    id: 'camper_van',
    name: 'Camper van',
    fittings: van.fittings(kit, 'camper_van', s) + [
      kit.fitting('pop_top', 'camper_van_pop_top', kit.origin, ['shell']),
      kit.fitting('kitchen', 'camper_van_kitchen', kit.origin, ['floor']),
      kit.fitting('curtains', 'camper_van_curtains', kit.origin, ['shell']),
      kit.fitting('rear_bench', 'bench_seat_3', [-1.72, s.floor, 0], ['floor']),
    ],
  },
}
