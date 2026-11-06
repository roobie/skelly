// Items and blueprint for the street sweeper. Its cab and chassis come from `packages/thing-authoring-tool/vehicles/truck-cab.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = t.spec(import 'packages/thing-authoring-tool/vehicles/street_sweeper.spec.libsonnet');
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local truck = 'street_sweeper';
{
  items: t.items(kit, truck, 'Street sweeper', s) + [
    part('street_sweeper_subframe', 'Street sweeper subframe', pile, ['structure']),
    part('street_sweeper_hopper', 'Street sweeper hopper', pile, ['storage', 'structure']),
    part('street_sweeper_rear_door', 'Street sweeper hopper door', pile, ['structure']),
    part('street_sweeper_water_tank', 'Street sweeper water tank', pile, ['storage']),
    part('street_sweeper_fan_housing', 'Street sweeper fan housing', pile, ['structure']),
    part('street_sweeper_gutter_brush', 'Street sweeper gutter brush', [8, 6], ['structure']),
    part('street_sweeper_main_broom', 'Street sweeper main broom', [12, 4], ['structure']),
    part('street_sweeper_suction', 'Street sweeper suction hose', [6, 10], ['structure']),
  ],
  blueprint: {
    id: truck,
    name: 'Street sweeper',
    fittings: t.fittings(kit, truck, s) + [
      fitting('subframe', 'street_sweeper_subframe', origin, ['chassis']),
      fitting('hopper', 'street_sweeper_hopper', origin, ['subframe']),
      fitting('rear_door', 'street_sweeper_rear_door', origin, ['hopper']),
      fitting('water_tank', 'street_sweeper_water_tank', origin, ['subframe']),
      fitting('fan_housing', 'street_sweeper_fan_housing', origin, ['water_tank']),
      fitting('main_broom', 'street_sweeper_main_broom', origin, ['chassis']),
      fitting('suction', 'street_sweeper_suction', origin, ['hopper']),
    ] + pair('gutter_brush', 'street_sweeper_gutter_brush', origin, on(['chassis']))
    + pair('cab_beacon', 'beacon_amber', [s.face - s.lean - 0.6, s.roof + 0.15, 0.5], on(['cab']))
    + pair('rear_beacon', 'beacon_amber', [-2.3, s.bodyTop - 0.04, 0.72], on(['hopper'])),
  },
}
