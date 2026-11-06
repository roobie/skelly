local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/burnt_out_van.spec.libsonnet';
{
  items: [
    part('burnt_out_van_chassis', 'Rusted van chassis', pile, ['structure']),
    part('burnt_out_van_shell', 'Burnt van shell', pile, ['structure', 'protection']),
    part('burnt_out_van_bonnet', 'Sprung van bonnet', pile, ['protection']),
    part('burnt_out_van_cab_door_hanging', 'Hanging van cab door', pile, ['protection']),
    part('burnt_out_van_cab_door', 'Burnt van cab door', pile, ['protection']),
    part('burnt_out_van_sliding_door', 'Fallen van sliding door', pile, ['protection']),
    part('burnt_out_van_rear_door', 'Burnt van rear door', pile, ['protection']),
    part('burnt_out_van_rear_door_hanging', 'Hanging van rear door', pile, ['protection']),
    part('burnt_out_van_bumper', 'Bent van bumper beam', pile, ['structure']),
    part('burnt_out_van_engine', 'Burnt van engine', pile, ['structure']),
    part('burnt_out_van_dash', 'Burnt van dash frame', pile, ['structure']),
    part('burnt_out_van_seat_frame', 'Burnt van seat frame', [6, 6], ['structure']),
    part('burnt_out_van_rim', 'Bare van rim', [6, 6], ['structure']),
  ],
  blueprint: {
    id: 'burnt_out_van',
    name: 'Burnt-out van',
    fittings: [
      fitting('chassis', 'burnt_out_van_chassis', origin, ['rim_front_near', 'rim_front_far', 'rim_rear_near', 'rim_rear_far']),
      fitting('shell', 'burnt_out_van_shell', origin, ['chassis']),
      fitting('bonnet', 'burnt_out_van_bonnet', origin, ['shell']),
      fitting('cab_door_near', 'burnt_out_van_cab_door_hanging', origin, ['shell']),
      fitting('cab_door_far', 'burnt_out_van_cab_door', origin, ['shell']),
      fitting('sliding_door', 'burnt_out_van_sliding_door', origin),
      fitting('rear_door_far', 'burnt_out_van_rear_door', origin, ['shell']),
      fitting('rear_door_near', 'burnt_out_van_rear_door_hanging', origin, ['shell']),
      fitting('bumper', 'burnt_out_van_bumper', origin, ['shell']),
      fitting('engine', 'burnt_out_van_engine', origin, ['chassis']),
      fitting('dash', 'burnt_out_van_dash', origin, ['shell']),
    ]
    + pair('seat_frame', 'burnt_out_van_seat_frame', [0.75, s.floor, 0.5], on(['shell']))
    + pair('rim_front', 'burnt_out_van_rim', [s.frontAxle, s.rimRadius, s.wheelZ], on())
    + pair('rim_rear', 'burnt_out_van_rim', [s.rearAxle, s.rimRadius, s.wheelZ], on()),
  },
}
