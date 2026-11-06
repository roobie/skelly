// Items and blueprint for the burnt-out saloon. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/burnt_out_saloon.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/burnt_out_saloon.spec.libsonnet';
{
  items: [
    part('burnt_out_saloon_shell', 'Burnt saloon shell', pile, ['structure', 'protection']),
    part('burnt_out_saloon_bonnet', 'Warped saloon bonnet', pile, ['protection']),
    part('burnt_out_saloon_boot_lid', 'Warped saloon boot lid', pile, ['protection']),
    part('burnt_out_saloon_door', 'Burnt saloon door', pile, ['protection']),
    part('burnt_out_saloon_front_bumper', 'Sagging burnt bumper', pile, ['protection']),
    part('burnt_out_saloon_rear_bumper', 'Blistered burnt bumper', pile, ['protection']),
    part('burnt_out_saloon_rim', 'Bare burnt wheel rim', [6, 6], ['structure']),
    part('burnt_out_saloon_seat_frame', 'Burnt seat frame', [6, 6], ['structure']),
    part('burnt_out_saloon_bench_frame', 'Burnt bench frame', pile, ['structure']),
    part('burnt_out_saloon_dash_frame', 'Burnt dashboard frame', pile, ['structure']),
    part('burnt_out_saloon_engine', 'Burnt-out engine block', [8, 6], ['structure']),
  ],
  blueprint: {
    id: 'burnt_out_saloon',
    name: 'Burnt-out saloon',
    fittings: [
      fitting('shell', 'burnt_out_saloon_shell', origin),
      fitting('bonnet', 'burnt_out_saloon_bonnet', origin, ['shell']),
      fitting('boot_lid', 'burnt_out_saloon_boot_lid', origin, ['shell']),
      fitting('door', 'burnt_out_saloon_door', origin, ['shell']),
      fitting('front_bumper', 'burnt_out_saloon_front_bumper', origin, ['shell']),
      fitting('rear_bumper', 'burnt_out_saloon_rear_bumper', origin, ['shell']),
      fitting('dash_frame', 'burnt_out_saloon_dash_frame', origin, ['shell']),
      fitting('engine', 'burnt_out_saloon_engine', [s.frontAxle - 0.02, s.floor - 0.05, 0.02], ['shell']),
      fitting('rear_bench', 'burnt_out_saloon_bench_frame', [-0.72, s.floor, 0], ['shell']),
    ]
    + pair('front_seat_frame', 'burnt_out_saloon_seat_frame', [0.2, s.floor, 0.37], on(['shell']))
    + pair('front_rim', 'burnt_out_saloon_rim', [s.frontAxle, s.axleY, s.wheelZ], on(['shell']))
    + pair('rear_rim', 'burnt_out_saloon_rim', [s.rearAxle, s.axleY, s.wheelZ], on(['shell'])),
  },
}
