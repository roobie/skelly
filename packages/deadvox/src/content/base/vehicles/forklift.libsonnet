// Items and blueprint for the forklift. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/forklift.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/forklift.spec.libsonnet';
{
  items: [
    part('forklift_chassis', 'Forklift chassis', pile, ['structure']),
    part('forklift_body', 'Forklift body', pile, ['protection', 'structure']),
    part('forklift_counterweight', 'Forklift counterweight', pile, ['structure', 'stabiliser']),
    part('forklift_guard', 'Forklift overhead guard', pile, ['protection', 'structure']),
    part('forklift_mast', 'Forklift mast', pile, ['structure', 'lift']) + { vehicle+: { ratedLoadKg: 2500 } },
    part('forklift_carriage', 'Forklift carriage', pile, ['structure']),
    part('forklift_fork', 'Fork tine', [12, 2], ['structure']),
    part('forklift_drive_wheel', 'Forklift drive wheel', [6, 6], ['wheel']),
    part('forklift_drive_axle', 'Forklift drive axle', [12, 4], ['structure', 'driven']),
    part('forklift_steer_axle', 'Forklift steer axle', [12, 3], ['structure', 'steered']),
    part('forklift_step', 'Forklift side step', [8, 2], ['entry', 'structure']),
    part('forklift_tail_pipe', 'Forklift tail pipe', [2, 7], []),
  ],
  blueprint: {
    id: 'forklift',
    name: 'Forklift',
    fittings: [
      fitting('chassis', 'forklift_chassis', origin),
      fitting('body', 'forklift_body', origin, ['chassis']),
      fitting('counterweight', 'forklift_counterweight', origin, ['chassis']),
      fitting('guard', 'forklift_guard', origin, ['body', 'counterweight']),
      fitting('mast', 'forklift_mast', origin, ['chassis']),
      fitting('carriage', 'forklift_carriage', origin, ['mast']),
      fitting('drive_axle', 'forklift_drive_axle', [s.frontAxle, s.frontHub, 0], ['chassis']),
      fitting('steer_axle', 'forklift_steer_axle', [s.rearAxle, s.rearHub, 0], ['chassis']),
      fitting('engine', 'engine_i4_diesel', [-0.22, 0.38, 0], ['chassis']),
      fitting('gearbox', 'gearbox_transaxle', [0.55, 0.2, 0], ['chassis']),
      fitting('radiator', 'radiator_small', [-0.56, 0.62, 0], ['chassis']),
      fitting('fuel_tank', 'fuel_tank_car', [0.0, 0.26, 0], ['chassis']),
      fitting('tail_pipe', 'forklift_tail_pipe', [-1.02, 1.1, -0.42], ['counterweight']),
      fitting('seat', 'pan_seat', [-0.18, s.cover, 0], ['body']),
      fitting('steering_wheel', 'steering_wheel', [0.44, 1.37, 0], ['body']),
      fitting('gear_lever', 'gear_lever', [0.8, 1.3, -0.2], ['body']),
      fitting('step', 'forklift_step', origin, ['body']),
      fitting('beacon', 'beacon_amber', [-0.5, s.roof, 0], ['guard']),
    ]
    + pair('fork', 'forklift_fork', origin, on(['carriage']))
    + pair('drive_wheel', 'forklift_drive_wheel', [s.frontAxle, s.frontHub, s.frontZ], on(['drive_axle']))
    + pair('steer_wheel', 'wheel_165_70r13', [s.rearAxle, s.rearHub, s.rearZ], on(['steer_axle']))
    + pair('tail_lamp', 'tail_lamp_small', [-1.26, 0.82, 0.44], on(['counterweight']))
    + pair('work_lamp', 'work_lamp', [0.69, 1.72, 0.42], on(['guard']))
    + kit.batteryBay('hatchback_battery_tray', [-0.4, 0.64, 0.46], ['chassis']),
  },
}
