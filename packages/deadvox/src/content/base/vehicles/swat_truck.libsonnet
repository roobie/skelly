// Items and blueprint for the SWAT truck. Its cab and chassis come from `packages/thing-authoring-tool/vehicles/truck-cab.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/swat_truck.spec.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
{
  items: t.items(kit, 'swat_truck', 'SWAT truck', s) + [
    part('swat_truck_body_floor', 'SWAT truck body floor', pile, ['structure']),
    part('swat_truck_body_side', 'SWAT truck armoured side', pile, ['protection']),
    part('swat_truck_body_glass', 'SWAT truck slit windows', pile, ['glazing']),
    part('swat_truck_body_front', 'SWAT truck bulkhead', pile, ['protection']),
    part('swat_truck_body_roof', 'SWAT truck armoured roof', pile, ['protection']),
    part('swat_truck_rear_door', 'SWAT truck rear door', pile, ['entry', 'glazing', 'protection']),
    part('swat_truck_rear_step', 'SWAT truck rear step', pile, []),
    part('swat_truck_engine_guard', 'SWAT truck engine guard', pile, ['protection']),
    part('swat_truck_windscreen_guard', 'SWAT truck windscreen guard', pile, ['protection']),
    part('swat_truck_door_guard', 'SWAT truck door window guard', pile, ['protection']),
    part('swat_truck_ram', 'SWAT truck ram bar', pile, ['protection']),
  ],
  blueprint: {
    id: 'swat_truck',
    name: 'SWAT truck',
    fittings: t.fittings(kit, 'swat_truck', s) + [
      fitting('body_floor', 'swat_truck_body_floor', origin, ['chassis']),
      fitting('body_glass', 'swat_truck_body_glass', origin, ['body_side_near', 'body_side_far']),
      fitting('body_front', 'swat_truck_body_front', origin, ['body_floor']),
      fitting('body_roof', 'swat_truck_body_roof', origin, ['body_front', 'body_side_near', 'body_side_far']),
      fitting('rear_step', 'swat_truck_rear_step', origin, ['chassis']),
      fitting('engine_guard', 'swat_truck_engine_guard', origin, ['chassis']),
      fitting('ram', 'swat_truck_ram', origin, ['chassis']),
      fitting('windscreen_guard', 'swat_truck_windscreen_guard', origin, ['cab']),
    ]
    + pair('door_guard', 'swat_truck_door_guard', origin, on(paired=['door']))
    + pair('body_side', 'swat_truck_body_side', origin, on(['body_floor']))
    + pair('rear_door', 'swat_truck_rear_door', origin, on(['body_floor']))
    + pair('roof_beacon', 'beacon_blue', [-0.55, s.body.top + 0.05, 0.85], on(['body_roof']))
    + pair('crew_bench', 'crew_bench', [s.benchX, s.body.floorTop, s.benchZ], on(['body_floor'])),
  },
}
