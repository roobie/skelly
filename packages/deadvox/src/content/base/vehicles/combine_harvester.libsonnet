// Items and blueprint for the combine harvester. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/combine_harvester.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/combine_harvester.spec.libsonnet';
{
  items: [
    part('combine_harvester_body', 'Combine body', pile, ['structure', 'protection']),
    part('combine_harvester_cab', 'Combine cab', pile, ['structure', 'protection', 'glazing']),
    part('combine_harvester_cab_door', 'Combine cab door', pile, ['entry', 'glazing', 'protection']),
    part('combine_harvester_windscreen', 'Combine windscreen', pile, ['glazing']),
    part('combine_harvester_grain_tank', 'Combine grain tank', pile, ['structure', 'storage']),
    part('combine_harvester_grain_floor', 'Combine grain tank floor', pile, ['structure', 'load_floor']),
    part('combine_harvester_unloading_auger', 'Combine unloading auger', pile, ['structure']),
    part('combine_harvester_feeder', 'Combine feeder housing', pile, ['structure']),
    part('combine_harvester_header', 'Combine grain header', pile, ['structure']),
    part('combine_harvester_reel', 'Combine header reel', pile, ['structure']),
    part('combine_harvester_front_axle', 'Combine drive axle', pile, ['structure', 'driven']),
    part('combine_harvester_rear_axle', 'Combine steering axle', pile, ['structure', 'steered']),
    part('combine_harvester_ladder', 'Combine cab ladder', pile, ['structure']),
    part('combine_harvester_straw_chopper', 'Combine straw chopper', pile, ['structure']),
  ],
  blueprint: {
    id: 'combine_harvester',
    name: 'Combine harvester',
    fittings: [
      fitting('body', 'combine_harvester_body', origin),
      fitting('cab', 'combine_harvester_cab', origin, ['body']),
      fitting('cab_door', 'combine_harvester_cab_door', origin, ['cab']),
      fitting('windscreen', 'combine_harvester_windscreen', origin, ['cab']),
      fitting('grain_tank', 'combine_harvester_grain_tank', origin, ['body']),
      fitting('grain_floor', 'combine_harvester_grain_floor', origin, ['body']),
      fitting('unloading_auger', 'combine_harvester_unloading_auger', origin, ['grain_tank', 'body']),
      fitting('feeder', 'combine_harvester_feeder', origin, ['body']),
      fitting('header', 'combine_harvester_header', origin, ['feeder']),
      fitting('reel', 'combine_harvester_reel', origin, ['header']),
      fitting('front_axle', 'combine_harvester_front_axle', origin, ['body']),
      fitting('rear_axle', 'combine_harvester_rear_axle', origin, ['body']),
      fitting('ladder', 'combine_harvester_ladder', origin, ['body']),
      fitting('straw_chopper', 'combine_harvester_straw_chopper', origin, ['body']),
      fitting('engine', 'engine_i6_heavy_diesel', [-2.9, 1.72, 0], ['body']),
      fitting('gearbox', 'gearbox_heavy', [-1.7, 1.3, 0], ['body']),
      fitting('radiator', 'radiator_truck', [-3.6, 1.72, 0], ['body']),
      fitting('fuel_tank', 'fuel_tank_truck', [-0.3, 1.5, 0], ['body']),
      fitting('exhaust', 'exhaust_stack', [-2.6, 1.55, -0.6], ['body']),
      fitting('seat', 'front_seat', [s.cabRear + 0.56, s.cabFloor + 0.04, 0], ['cab']),
      fitting('steering_column', 'steering_column_short', [s.cabFront - 0.4, 2.86, 0], ['cab']),
      fitting('steering_wheel', 'steering_wheel', [s.cabFront - 0.48, 2.98, 0], ['steering_column']),
      fitting('control', 'gear_lever', [s.cabRear + 0.74, s.cabFloor + 0.04, 0.46], ['cab']),
      fitting('beacon', 'beacon_amber', [s.cabRear + 0.1, s.cabRoof, 0], ['cab']),
      kit.cargoSpace('grain_cargo', [-0.35, s.tankFloorTop, 0], [23, 6, 18], 'grain_floor'),
    ]
    + pair('front_wheel', 'wheel_16_9r30', [s.frontAxle, s.frontHub, s.frontZ], on(['front_axle']))
    + pair('rear_wheel', 'wheel_295_80r22_5', [s.rearAxle, s.rearHub, s.rearZ], on(['rear_axle']))
    + pair('tail_lamp', 'tail_lamp_small', [s.bodyRear - 0.03, 2.4, 0.8], on(['body']))
    + pair('work_lamp', 'work_lamp', [s.cabFront + 0.2, s.cabRoof - 0.26, 0.5], on(['cab']))
    + pair('mirror', 'door_mirror', [s.cabFront, 3.2, s.cabSide + 0.02], on(['cab']))
    + kit.batteryBay('truck_battery_tray', [-1.0, 1.0, 0.6], ['body']),
  },
}
