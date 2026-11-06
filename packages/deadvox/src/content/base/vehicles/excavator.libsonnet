// Items and blueprint for the excavator. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/excavator.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/excavator.spec.libsonnet';
{
  items: [
    part('excavator_carbody', 'Excavator undercarriage', pile, ['structure']),
    part('excavator_track', 'Excavator track', pile, ['wheel', 'driven', 'steered', 'structure']),
    part('excavator_house', 'Excavator upper house', pile, ['structure', 'protection']),
    part('excavator_counterweight', 'Excavator counterweight', pile, ['structure']),
    part('excavator_cab', 'Excavator cab', pile, ['structure', 'protection', 'glazing']),
    part('excavator_cab_door', 'Excavator cab door', pile, ['entry', 'glazing', 'protection']),
    part('excavator_windscreen', 'Excavator windscreen', pile, ['glazing']),
    part('excavator_boom', 'Excavator boom', pile, ['structure']),
    part('excavator_arm', 'Excavator arm', pile, ['structure']),
    part('excavator_bucket', 'Excavator bucket', pile, ['structure']),
    part('excavator_boom_ram', 'Excavator boom ram', [12, 3], []),
    part('excavator_arm_ram', 'Excavator arm ram', [12, 3], []),
    part('excavator_bucket_ram', 'Excavator bucket ram', [12, 3], []),
    part('excavator_exhaust', 'Excavator exhaust pipe', [2, 5], []),
  ],
  blueprint: {
    id: 'excavator',
    name: 'Excavator',
    fittings: [
      fitting('carbody', 'excavator_carbody', origin),
      fitting('house', 'excavator_house', origin, ['carbody']),
      fitting('counterweight', 'excavator_counterweight', origin, ['house']),
      fitting('cab', 'excavator_cab', origin, ['house']),
      fitting('cab_door', 'excavator_cab_door', origin, ['cab']),
      fitting('windscreen', 'excavator_windscreen', origin, ['cab']),
      fitting('boom', 'excavator_boom', origin, ['house']),
      fitting('arm', 'excavator_arm', origin, ['boom']),
      fitting('bucket', 'excavator_bucket', origin, ['arm']),
      fitting('arm_ram', 'excavator_arm_ram', origin, ['boom', 'arm']),
      fitting('bucket_ram', 'excavator_bucket_ram', origin, ['arm', 'bucket']),
      fitting('engine', 'engine_i6_diesel', [-1.05, s.deck, 0], ['house']),
      fitting('radiator', 'radiator_van', [-0.45, s.deck + 0.05, 0.55], ['house']),
      fitting('fuel_tank', 'fuel_tank_truck', [0.5, s.deck, 0.8], ['house']),
      fitting('exhaust', 'excavator_exhaust', [-1.3, s.hoodTop, -0.7], ['house']),
      fitting('seat', 'front_seat', [0.15, s.deck + 0.2, -0.78], ['cab']),
      fitting('beacon', 'beacon_amber', [-0.1, s.cabRoof + 0.03, -0.78], ['cab']),
      fitting('work_lamp', 'work_lamp', [s.cabFront + 0.02, s.cabRoof - 0.2, -0.78], ['cab']),
      fitting('control_inner', 'gear_lever', [0.52, s.deck + 0.52, -0.56], ['cab']),
      fitting('control_outer', 'gear_lever', [0.52, s.deck + 0.52, -1.0], ['cab']),
      fitting('tail_lamp_near', 'tail_lamp_small', [-2.2, 1.5, 0.9], ['counterweight']),
      fitting('tail_lamp_far', 'tail_lamp_small', [-2.2, 1.5, -0.9], ['counterweight']),
    ]
    + pair('track', 'excavator_track', [0, 0, s.trackZ], on(['carbody']))
    + pair('boom_ram', 'excavator_boom_ram', origin, on(['house', 'boom']))
    + kit.batteryBay('hatchback_battery_tray', [-0.05, s.deck, 0.7], ['house']),
  },
}
