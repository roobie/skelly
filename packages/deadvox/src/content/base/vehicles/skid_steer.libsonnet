// Items and blueprint for the skid-steer loader. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/skid_steer.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/skid_steer.spec.libsonnet';
{
  items: [
    part('skid_steer_frame', 'Skid-steer frame', pile, ['structure']),
    part('skid_steer_chain_case', 'Skid-steer chain case', pile, ['structure', 'driven', 'steered']),
    part('skid_steer_cage', 'Skid-steer operator cage', pile, ['structure', 'protection', 'glazing']),
    part('skid_steer_door', 'Skid-steer front door', pile, ['entry', 'glazing', 'protection']),
    part('skid_steer_engine_cover', 'Skid-steer engine cover', pile, ['protection']),
    part('skid_steer_tail_door', 'Skid-steer tail door', pile, ['protection']),
    part('skid_steer_lift_arms', 'Skid-steer lift arms', pile, ['structure']),
    part('skid_steer_bucket', 'Skid-steer bucket', pile, ['structure']),
    part('skid_steer_lift_ram', 'Skid-steer lift ram', [12, 3], []),
    part('skid_steer_tilt_ram', 'Skid-steer tilt ram', [6, 3], []),
    part('skid_steer_exhaust', 'Skid-steer exhaust pipe', [2, 4], []),
  ],
  blueprint: {
    id: 'skid_steer',
    name: 'Skid-steer loader',
    fittings: [
      fitting('frame', 'skid_steer_frame', origin),
      fitting('cage', 'skid_steer_cage', origin, ['frame']),
      fitting('door', 'skid_steer_door', origin, ['cage']),
      fitting('engine_cover', 'skid_steer_engine_cover', origin, ['frame']),
      fitting('tail_door', 'skid_steer_tail_door', origin, ['frame']),
      fitting('lift_arms', 'skid_steer_lift_arms', origin, ['frame']),
      fitting('bucket', 'skid_steer_bucket', origin, ['lift_arms']),
      fitting('engine', 'engine_i4_diesel', [-0.82, 0.5, 0], ['frame']),
      fitting('radiator', 'radiator_small', [-1.18, 0.6, 0], ['frame']),
      fitting('fuel_tank', 'fuel_tank_car', [-0.1, 0.42, 0], ['frame']),
      fitting('exhaust', 'skid_steer_exhaust', [-0.7, 1.42, -0.25], ['engine_cover']),
      fitting('seat', 'pan_seat', [0.0, s.floor + 0.2, 0], ['frame']),
      fitting('beacon', 'beacon_amber', [-0.1, s.roof + 0.05, 0], ['cage']),
    ]
    + pair('chain_case', 'skid_steer_chain_case', origin, on(['frame']))
    + pair('front_wheel', 'wheel_265_75r16', [s.frontAxle, s.hub, s.wheelZ], on(paired=['chain_case']))
    + pair('rear_wheel', 'wheel_265_75r16', [s.rearAxle, s.hub, s.wheelZ], on(paired=['chain_case']))
    + pair('lift_ram', 'skid_steer_lift_ram', origin, on(['frame', 'lift_arms']))
    + pair('tilt_ram', 'skid_steer_tilt_ram', origin, on(['lift_arms', 'bucket']))
    + pair('control', 'gear_lever', [0.34, s.floor + 0.34, 0.33], on(['frame']))
    + pair('work_lamp', 'work_lamp', [s.cageFront + 0.04, s.roof + 0.05, 0.34], on(['cage']))
    + pair('tail_lamp', 'tail_lamp_small', [-1.26, 1.06, 0.38], on(['engine_cover']))
    + kit.batteryBay('hatchback_battery_tray', [-0.55, 0.5, 0.3], ['frame']),
  },
}
