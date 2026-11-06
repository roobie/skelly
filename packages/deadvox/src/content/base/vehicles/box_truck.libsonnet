// Items and blueprint for the box truck. Its cab and chassis come from `packages/thing-authoring-tool/vehicles/truck-cab.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/box_truck.spec.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local boxId = 'box_truck';
{
  items: t.items(kit, boxId, 'Box truck', s) + [
    part('box_truck_box_floor', 'Box truck load floor', pile, ['structure', 'load_floor']),
    part('box_truck_box_side', 'Box truck side wall', pile, ['protection']),
    part('box_truck_box_front', 'Box truck front wall', pile, ['protection']),
    part('box_truck_box_roof', 'Box truck box roof', pile, ['protection']),
    part('box_truck_rear_door', 'Box truck rear door', pile, ['entry', 'protection']),
  ],
  blueprint: {
    id: boxId,
    name: 'Box truck',
    fittings: t.fittings(kit, boxId, s) + [
      fitting('box_floor', 'box_truck_box_floor', origin, ['chassis']),
      fitting('box_front', 'box_truck_box_front', origin, ['box_floor']),
      fitting('box_roof', 'box_truck_box_roof', origin, ['box_front', 'box_side_near', 'box_side_far']),
      kit.cargoSpace('box_cargo', [-0.95, s.boxFloorTop, 0], [53, 20, 22], 'box_floor'),
    ]
    + pair('box_side', 'box_truck_box_side', origin, on(['box_floor']))
    + pair('rear_door', 'box_truck_rear_door', origin, on(['box_floor'])),
  },
}
