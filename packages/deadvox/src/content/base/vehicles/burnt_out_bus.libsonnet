// Items and blueprint for the burnt-out bus. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/burnt_out_bus.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/burnt_out_bus.spec.libsonnet';
local shell = ['structure', 'protection'];
local frame = ['structure'];
{
  items: [
    part('burnt_out_bus_floor', 'Burnt bus chassis', pile, shell),
    part('burnt_out_bus_near_side', 'Burnt bus door side', pile, shell),
    part('burnt_out_bus_far_side', 'Burnt bus blind side', pile, shell),
    part('burnt_out_bus_roof', 'Collapsed bus roof', pile, shell),
    part('burnt_out_bus_roof_unit', 'Burnt bus roof unit', pile, frame),
    part('burnt_out_bus_front', 'Burnt bus front panel', pile, shell),
    part('burnt_out_bus_rear', 'Burnt bus rear panel', pile, shell),
    part('burnt_out_bus_engine', 'Burnt bus engine', pile, frame),
    part('burnt_out_bus_hatch', 'Sprung bus engine hatch', pile, shell),
    part('burnt_out_bus_bumper', 'Sagging bus bumper', pile, shell),
    part('burnt_out_bus_mirror', 'Bent bus mirror arm', [10, 3], frame),
    part('burnt_out_bus_stanchions', 'Bent bus grab poles', pile, frame),
    part('burnt_out_bus_dash', 'Burnt bus dash', pile, frame),
    part('burnt_out_bus_seat_frame', 'Bare bus seat frame', pile, frame),
    part('burnt_out_bus_driver_frame', 'Bare bus driver seat frame', [8, 6], frame),
    part('burnt_out_bus_rim', 'Burnt bus rim', pile, frame),
    part('burnt_out_bus_dual_rim', 'Burnt bus dual rim', pile, frame),
    part('burnt_out_bus_sprung_door', 'Sprung bus door frame', pile, shell),
    part('burnt_out_bus_fallen_door', 'Fallen bus door frame', pile, shell),
  ],
  blueprint: {
    id: 'burnt_out_bus',
    name: 'Burnt-out bus',
    fittings: [
      fitting('floor', 'burnt_out_bus_floor', origin),
      fitting('near_side', 'burnt_out_bus_near_side', origin, ['floor']),
      fitting('far_side', 'burnt_out_bus_far_side', origin, ['floor']),
      fitting('front', 'burnt_out_bus_front', origin, ['floor']),
      fitting('rear', 'burnt_out_bus_rear', origin, ['floor']),
      fitting('roof', 'burnt_out_bus_roof', origin, ['near_side', 'far_side']),
      fitting('roof_unit', 'burnt_out_bus_roof_unit', origin, ['roof']),
      fitting('engine', 'burnt_out_bus_engine', origin, ['floor']),
      fitting('hatch', 'burnt_out_bus_hatch', origin, ['rear']),
      fitting('bumper', 'burnt_out_bus_bumper', origin, ['front']),
      fitting('mirror', 'burnt_out_bus_mirror', origin, ['near_side']),
      fitting('stanchions', 'burnt_out_bus_stanchions', origin, ['floor']),
      fitting('dash', 'burnt_out_bus_dash', origin, ['floor']),
      fitting('driver_frame', 'burnt_out_bus_driver_frame', [s.driver.x, s.driver.y, s.driver.z], ['floor']),
      fitting('sprung_door', 'burnt_out_bus_sprung_door', origin, ['near_side']),
      fitting('fallen_door', 'burnt_out_bus_fallen_door', origin),
    ]
    + pair('front_rim', 'burnt_out_bus_rim', [s.frontAxle, s.hubY, s.wheelZ], on(['floor']))
    + pair('rear_rim', 'burnt_out_bus_dual_rim', [s.rearAxle, s.hubY, s.wheelZ], on(['floor']))
    + std.flattenArrays([
      pair('seat_' + i, 'burnt_out_bus_seat_frame', [s.seats[i].x, s.seats[i].y, 0.72], on(['floor']))
      for i in std.range(0, std.length(s.seats) - 1)
    ]),
  },
}
