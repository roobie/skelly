// Items and blueprint for the road crane, outriggers stowed and boom laid along the carrier. Its cab and chassis come from `packages/thing-authoring-tool/vehicles/truck-cab.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = t.spec(import 'packages/thing-authoring-tool/vehicles/mobile_crane.spec.libsonnet');
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local truck = 'mobile_crane';
{
  items: t.items(kit, truck, 'Mobile crane', s) + [
    part('mobile_crane_deck', 'Mobile crane carrier deck', pile, ['structure']),
    part('mobile_crane_outrigger', 'Mobile crane outrigger', pile, ['structure', 'stabiliser']),
    part('mobile_crane_lockers', 'Mobile crane carrier lockers', pile, ['storage']),
    part('mobile_crane_slew_ring', 'Mobile crane slew ring', pile, ['structure']),
    part('mobile_crane_turret', 'Mobile crane turret', pile, ['structure']),
    part('mobile_crane_counterweight', 'Mobile crane counterweight', pile, ['structure']),
    part('mobile_crane_power_cowl', 'Mobile crane power unit cowl', pile, ['protection']),
    part('mobile_crane_operator_cab', 'Mobile crane operator cab', pile, ['protection']),
    part('mobile_crane_operator_glass', 'Mobile crane operator cab glass', pile, ['glazing']),
    part('mobile_crane_winch', 'Mobile crane hoist winch', pile, ['structure']),
    part('mobile_crane_boom_base', 'Mobile crane boom base', pile, ['structure', 'lift']) + { vehicle+: { ratedLoadKg: 30000 } },
    part('mobile_crane_boom_stage_1', 'Mobile crane boom first stage', pile, ['structure']),
    part('mobile_crane_boom_stage_2', 'Mobile crane boom second stage', pile, ['structure']),
    part('mobile_crane_boom_stage_3', 'Mobile crane boom head stage', pile, ['structure']),
    part('mobile_crane_derrick_ram', 'Mobile crane derrick ram', pile, ['structure']),
    part('mobile_crane_boom_rest', 'Mobile crane boom rest', pile, ['structure']),
    part('mobile_crane_hook_block', 'Mobile crane hook block', pile, []),
  ],
  blueprint: {
    id: truck,
    name: 'Mobile crane',
    fittings: t.fittings(kit, truck, s) + [
      fitting('front_axle_2', s.frontAxlePart, [s.secondAxle, s.frontAxleY, 0], ['chassis']),
      fitting('deck', 'mobile_crane_deck', origin, ['chassis']),
      fitting('lockers', 'mobile_crane_lockers', origin, ['deck']),
      fitting('slew_ring', 'mobile_crane_slew_ring', origin, ['deck']),
      fitting('turret', 'mobile_crane_turret', origin, ['slew_ring']),
      fitting('counterweight', 'mobile_crane_counterweight', origin, ['turret']),
      fitting('power_cowl', 'mobile_crane_power_cowl', origin, ['turret']),
      fitting('operator_cab', 'mobile_crane_operator_cab', origin, ['turret']),
      fitting('operator_glass', 'mobile_crane_operator_glass', origin, ['operator_cab']),
      fitting('winch', 'mobile_crane_winch', origin, ['counterweight']),
      fitting('boom_base', 'mobile_crane_boom_base', origin, ['turret']),
      fitting('boom_stage_1', 'mobile_crane_boom_stage_1', origin, ['boom_base']),
      fitting('boom_stage_2', 'mobile_crane_boom_stage_2', origin, ['boom_stage_1']),
      fitting('boom_stage_3', 'mobile_crane_boom_stage_3', origin, ['boom_stage_2']),
      fitting('derrick_ram', 'mobile_crane_derrick_ram', origin, ['turret']),
      fitting('boom_rest', 'mobile_crane_boom_rest', origin, ['deck']),
      fitting('hook_block', 'mobile_crane_hook_block', origin, ['boom_stage_3', 'front_bumper']),
    ]
    + pair('second_front_wheel', s.wheel, [s.secondAxle, s.r, s.frontZ], on(['front_axle_2']))
    + pair('front_outrigger', 'mobile_crane_outrigger', [s.frontRiggerX, 0, 0], on(['deck']))
    + pair('rear_outrigger', 'mobile_crane_outrigger', [s.rearRiggerX, 0, 0], on(['deck']))
    + pair('cab_beacon', 'beacon_amber', [s.face - s.lean - 0.6, s.roof + 0.15, 0.9], on(['cab'])),
  },
}
