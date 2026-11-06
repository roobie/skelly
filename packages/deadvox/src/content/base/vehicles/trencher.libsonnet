// Items and blueprint for the trencher. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/trencher.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/trencher.spec.libsonnet';
{
  items: [
    part('trencher_chassis', 'Trencher chassis', pile, ['structure']),
    part('trencher_track', 'Trencher rubber track', pile, ['wheel', 'driven', 'steered']),
    part('trencher_hood', 'Trencher engine hood', pile, ['protection']),
    part('trencher_platform', 'Trencher operator platform', pile, ['structure']),
    part('trencher_canopy', 'Trencher canopy', pile, ['protection', 'structure']),
    part('trencher_digging_boom', 'Trencher digging boom', pile, ['structure']),
    part('trencher_spoil_auger', 'Trencher spoil auger', pile, ['structure']),
    part('trencher_lift_ram', 'Trencher boom ram', [12, 3], []),
    part('trencher_backfill_blade', 'Trencher backfill blade', pile, ['structure']),
    part('trencher_step', 'Trencher side step', [9, 2], ['entry', 'structure']),
    part('trencher_step_hanger', 'Trencher step hanger', [8, 2], ['structure']),
    part('trencher_exhaust', 'Trencher exhaust pipe', [2, 6], []),
  ],
  blueprint: {
    id: 'trencher',
    name: 'Trencher',
    fittings: [
      fitting('chassis', 'trencher_chassis', origin),
      fitting('hood', 'trencher_hood', origin, ['chassis']),
      fitting('platform', 'trencher_platform', origin, ['chassis']),
      fitting('canopy', 'trencher_canopy', origin, ['platform']),
      fitting('digging_boom', 'trencher_digging_boom', origin, ['chassis']),
      fitting('spoil_auger', 'trencher_spoil_auger', origin, ['chassis']),
      fitting('backfill_blade', 'trencher_backfill_blade', origin, ['chassis']),
      fitting('engine', 'engine_i4_diesel', [0.82, s.deck, 0], ['chassis']),
      fitting('radiator', 'radiator_small', [1.38, s.deck + 0.1, 0], ['chassis']),
      fitting('fuel_tank', 'fuel_tank_car', [-0.1, 0.38, 0], ['chassis']),
      fitting('exhaust', 'trencher_exhaust', [0.5, s.hoodTop, -0.34], ['hood']),
      fitting('seat', 'front_seat', [-0.6, s.deck + 0.36, 0], ['platform']),
      fitting('steering_column', 'steering_column_short', [-0.21, 1.56, 0], ['platform']),
      fitting('steering_wheel', 'steering_wheel', [-0.28, 1.68, 0], ['steering_column']),
      fitting('travel_lever', 'gear_lever', [-0.08, 1.56, 0.26], ['platform']),
      fitting('beacon', 'beacon_amber', [-0.42, s.canopy, 0], ['canopy']),
    ]
    + pair('track', 'trencher_track', [0.1, 0, s.trackZ], on(['chassis']))
    + pair('lift_ram', 'trencher_lift_ram', origin, on(['chassis', 'digging_boom']))
    + pair('step_hanger', 'trencher_step_hanger', origin, on(['chassis']))
    + pair('step', 'trencher_step', origin, on(paired=['step_hanger']))
    + pair('tail_lamp', 'tail_lamp_small', [-1.03, 1.32, 0.56], on(['platform']))
    + kit.headlamps(s.hoodFront + 0.02, 1.34, 0.42, ['hood'])
    + kit.batteryBay('hatchback_battery_tray', [0.2, s.deck, 0.3], ['chassis']),
  },
}
