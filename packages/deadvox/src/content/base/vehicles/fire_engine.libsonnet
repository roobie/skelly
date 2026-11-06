// Items and blueprint for the fire engine. Its cab and chassis come from `packages/thing-authoring-tool/vehicles/truck-cab.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = t.spec(import 'packages/thing-authoring-tool/vehicles/fire_engine.spec.libsonnet');
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local truck = 'fire_engine';
{
  items: t.items(kit, truck, 'Fire engine', s) + [
    part('fire_engine_body', 'Fire engine locker body', pile, ['structure', 'storage']),
    part('fire_engine_cab_stripe', 'Fire engine cab stripe', pile, []),
    part('fire_engine_water_tank', 'Fire engine water tank', pile, ['storage']),
    part('fire_engine_lockers', 'Fire engine locker shutters', pile, ['protection']),
    part('fire_engine_roof_ladder', 'Fire engine roof ladder', pile, []),
    part('fire_engine_gantry', 'Fire engine ladder gantry', pile, ['structure']),
    part('fire_engine_pump_panel', 'Fire engine pump panel', pile, []),
    part('fire_engine_hose_reel', 'Fire engine hose reels', pile, []),
    part('fire_engine_rear_step', 'Fire engine rear step', pile, []),
  ],
  blueprint: {
    id: truck,
    name: 'Fire engine',
    fittings: t.fittings(kit, truck, s) + [
      fitting('body', 'fire_engine_body', origin, ['chassis']),
      fitting('cab_stripe', 'fire_engine_cab_stripe', origin, ['cab']),
      fitting('water_tank', 'fire_engine_water_tank', origin, ['body']),
      fitting('gantry', 'fire_engine_gantry', origin, ['body']),
      fitting('roof_ladder', 'fire_engine_roof_ladder', origin, ['gantry']),
      fitting('pump_panel', 'fire_engine_pump_panel', origin, ['body']),
      fitting('hose_reel', 'fire_engine_hose_reel', origin, ['body']),
      fitting('rear_step', 'fire_engine_rear_step', origin, ['chassis']),
      fitting('crew_bench', 'bench_seat_3', [1.32, s.floor, 0], ['cab']),
    ] + pair('lockers', 'fire_engine_lockers', origin, on(['body']))
    + pair('cab_beacon', 'beacon_blue', [s.face - s.lean - 0.45, s.roof + 0.11, 0.9], on(['cab']))
    + pair('rear_beacon', 'beacon_blue', [s.bodyRear + 0.2, s.bodyTop, 0.95], on(['body'])),
  },
}
