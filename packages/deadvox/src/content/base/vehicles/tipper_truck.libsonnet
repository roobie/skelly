// Items and blueprint for the tipper truck, its body shown lowered. Its cab and chassis come from `packages/thing-authoring-tool/vehicles/truck-cab.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/tipper_truck.spec.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local truck = 'tipper_truck';
{
  items: t.items(kit, truck, 'Tipper truck', s) + [
    part('tipper_truck_subframe', 'Tipper truck subframe', pile, ['structure']),
    part('tipper_truck_tub_floor', 'Tipper truck tub floor', pile, ['structure', 'load_floor']),
    part('tipper_truck_tub_side', 'Tipper truck tub side', pile, ['protection']),
    part('tipper_truck_tub_front', 'Tipper truck tub front and canopy', pile, ['protection']),
    part('tipper_truck_tailgate', 'Tipper truck tailgate', pile, ['protection']),
    part('tipper_truck_tip_ram', 'Tipper truck tipping ram', pile, []),
  ],
  blueprint: {
    id: truck,
    name: 'Tipper truck',
    fittings: t.fittings(kit, truck, s) + [
      fitting('subframe', 'tipper_truck_subframe', origin, ['chassis']),
      fitting('tub_floor', 'tipper_truck_tub_floor', origin, ['subframe']),
      fitting('tub_front', 'tipper_truck_tub_front', origin, ['tub_floor']),
      fitting('tailgate', 'tipper_truck_tailgate', origin, ['tub_floor']),
      fitting('tip_ram', 'tipper_truck_tip_ram', origin, ['chassis', 'tub_front']),
      kit.cargoSpace('tub_cargo', [-1.0, s.tubFloorTop, 0], [54, 12, 22], 'tub_floor'),
    ] + pair('tub_side', 'tipper_truck_tub_side', origin, on(['tub_floor'])),
  },
}
