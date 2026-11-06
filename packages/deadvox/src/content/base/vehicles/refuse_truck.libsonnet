// Items and blueprint for the refuse truck. Its cab and chassis come from `packages/thing-authoring-tool/vehicles/truck-cab.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = t.spec(import 'packages/thing-authoring-tool/vehicles/refuse_truck.spec.libsonnet');
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local truck = 'refuse_truck';
{
  items: t.items(kit, truck, 'Refuse truck', s) + [
    part('refuse_truck_subframe', 'Refuse truck subframe', pile, ['structure']),
    part('refuse_truck_body', 'Refuse truck compactor body', pile, ['storage', 'structure']),
    part('refuse_truck_hopper', 'Refuse truck hopper', pile, ['structure']),
    part('refuse_truck_packer', 'Refuse truck packer blade', pile, []),
    part('refuse_truck_bin_lift', 'Refuse truck bin lift', pile, []),
    part('refuse_truck_rear_step', 'Refuse truck rear steps', pile, []),
    part('refuse_truck_side_guard', 'Refuse truck side guards', pile, ['protection']),
  ],
  blueprint: {
    id: truck,
    name: 'Refuse truck',
    fittings: t.fittings(kit, truck, s) + [
      fitting('subframe', 'refuse_truck_subframe', origin, ['chassis']),
      fitting('body', 'refuse_truck_body', origin, ['subframe']),
      fitting('hopper', 'refuse_truck_hopper', origin, ['body']),
      fitting('packer', 'refuse_truck_packer', origin, ['hopper']),
      fitting('bin_lift', 'refuse_truck_bin_lift', origin, ['hopper']),
      fitting('rear_step', 'refuse_truck_rear_step', origin, ['chassis']),
      fitting('side_guard', 'refuse_truck_side_guard', origin, ['chassis']),
      fitting('cab_beacon', 'beacon_amber', [s.face - s.lean - 0.6, s.roof + 0.15, 0], ['cab']),
    ] + pair('rear_beacon', 'beacon_amber', [s.bodyRear + 0.1, s.bodyRiseRear - 0.12, 0.95], on(['body']))
    + pair('high_lamp', 'tail_lamp_tall', [s.hopperRear - 0.01, s.hopperSill + 0.05, 1.2], on(['hopper'])),
  },
}
