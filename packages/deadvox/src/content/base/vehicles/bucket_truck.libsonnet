// Items and blueprint for the bucket truck, its boom shown stowed. Its cab and chassis come from `packages/thing-authoring-tool/vehicles/truck-cab.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = t.spec(import 'packages/thing-authoring-tool/vehicles/bucket_truck.spec.libsonnet');
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local truck = 'bucket_truck';
{
  items: t.items(kit, truck, 'Bucket truck', s) + [
    part('bucket_truck_subframe', 'Bucket truck deck', pile, ['structure']),
    part('bucket_truck_locker', 'Bucket truck locker body', pile, ['storage', 'protection']),
    part('bucket_truck_turret', 'Bucket truck boom turret', pile, ['structure']),
    part('bucket_truck_lower_boom', 'Bucket truck lower boom', pile, ['structure']),
    part('bucket_truck_cradle', 'Bucket truck boom cradle', pile, ['structure']),
    part('bucket_truck_knuckle', 'Bucket truck boom knuckle', pile, ['structure']),
    part('bucket_truck_insulated_boom', 'Bucket truck insulated boom', pile, ['structure']),
    part('bucket_truck_basket', 'Bucket truck basket', pile, ['protection']),
    part('bucket_truck_basket_rest', 'Bucket truck basket rest', pile, ['structure']),
    part('bucket_truck_jack', 'Bucket truck rear jack', pile, ['structure']),
    part('bucket_truck_cone', 'Bucket truck traffic cone', [2, 3], []),
  ],
  blueprint: {
    id: truck,
    name: 'Bucket truck',
    fittings: t.fittings(kit, truck, s) + [
      fitting('subframe', 'bucket_truck_subframe', origin, ['chassis']),
      fitting('turret', 'bucket_truck_turret', origin, ['subframe']),
      fitting('lower_boom', 'bucket_truck_lower_boom', origin, ['turret']),
      fitting('cradle', 'bucket_truck_cradle', origin, ['subframe']),
      fitting('knuckle', 'bucket_truck_knuckle', origin, ['lower_boom']),
      fitting('insulated_boom', 'bucket_truck_insulated_boom', origin, ['knuckle']),
      fitting('basket', 'bucket_truck_basket', origin, ['insulated_boom']),
      fitting('basket_rest', 'bucket_truck_basket_rest', origin, ['subframe']),
      fitting('cab_beacon', 'beacon_amber', [s.face - s.lean - 0.6, s.roof + 0.15, 0], ['cab']),
      fitting('cone_a', 'bucket_truck_cone', [-0.5, s.deckTop, 0.45], ['subframe']),
      fitting('cone_b', 'bucket_truck_cone', [-0.1, s.deckTop, 0.45], ['subframe']),
    ] + pair('locker', 'bucket_truck_locker', origin, on(['subframe']))
    + pair('jack', 'bucket_truck_jack', origin, on(['subframe'])),
  },
}
