// Items and blueprint for the lorry cab wreck. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/jackknifed_lorry_cab.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/jackknifed_lorry_cab.spec.libsonnet';
local shell = ['structure', 'protection'];
local frame = ['structure'];
local rearAt(x) = local p = s.at([x, s.hubY]); [p[0], p[1], s.wheelZ];
{
  items: [
    part('jackknifed_lorry_cab_chassis', 'Bent lorry chassis', pile, frame),
    part('jackknifed_lorry_cab_near_side', 'Crushed lorry door side', pile, shell),
    part('jackknifed_lorry_cab_far_side', 'Crushed lorry cab side', pile, shell),
    part('jackknifed_lorry_cab_roof', 'Crushed lorry roof', pile, shell),
    part('jackknifed_lorry_cab_back', 'Buckled sleeper back', pile, shell),
    part('jackknifed_lorry_cab_windscreen_frame', 'Crushed lorry windscreen frame', pile, shell),
    part('jackknifed_lorry_cab_nose', 'Crumpled lorry bonnet', pile, shell),
    part('jackknifed_lorry_cab_earth', 'Churned earth heap', pile, frame),
    part('jackknifed_lorry_cab_bumper', 'Torn lorry bumper', pile, shell),
    part('jackknifed_lorry_cab_near_door', 'Sprung lorry door', pile, shell),
    part('jackknifed_lorry_cab_stacks', 'Bent exhaust stacks', pile, frame),
    part('jackknifed_lorry_cab_fuel_tank', 'Dented lorry fuel tank', pile, frame),
    part('jackknifed_lorry_cab_seat_frames', 'Bare lorry seat frames', pile, frame),
    part('jackknifed_lorry_cab_dash', 'Crushed lorry dash', pile, frame),
    part('jackknifed_lorry_cab_rear_wheel', 'Shredded lorry twin wheel', pile, frame),
    part('jackknifed_lorry_cab_loose_wheel', 'Torn lorry front wheel', pile, frame),
    part('jackknifed_lorry_cab_jammed_wheel', 'Jammed lorry front wheel', pile, frame),
  ],
  blueprint: {
    id: 'jackknifed_lorry_cab',
    name: 'Jackknifed lorry cab',
    fittings: [
      fitting('chassis', 'jackknifed_lorry_cab_chassis', origin),
      fitting('near_side', 'jackknifed_lorry_cab_near_side', origin, ['chassis']),
      fitting('far_side', 'jackknifed_lorry_cab_far_side', origin, ['chassis']),
      fitting('back', 'jackknifed_lorry_cab_back', origin, ['chassis']),
      fitting('roof', 'jackknifed_lorry_cab_roof', origin, ['near_side', 'far_side', 'back']),
      fitting('windscreen_frame', 'jackknifed_lorry_cab_windscreen_frame', origin, ['chassis']),
      fitting('nose', 'jackknifed_lorry_cab_nose', origin, ['chassis']),
      fitting('earth', 'jackknifed_lorry_cab_earth', origin),
      fitting('bumper', 'jackknifed_lorry_cab_bumper', origin, ['earth']),
      fitting('near_door', 'jackknifed_lorry_cab_near_door', origin, ['near_side']),
      fitting('stacks', 'jackknifed_lorry_cab_stacks', origin, ['chassis']),
      fitting('fuel_tank', 'jackknifed_lorry_cab_fuel_tank', origin, ['chassis']),
      fitting('seat_frames', 'jackknifed_lorry_cab_seat_frames', origin, ['chassis']),
      fitting('dash', 'jackknifed_lorry_cab_dash', origin, ['chassis']),
      fitting('loose_wheel', 'jackknifed_lorry_cab_loose_wheel', [-0.35, 0, 2.5]),
      fitting('jammed_wheel', 'jackknifed_lorry_cab_jammed_wheel', [2.15, s.wheelR + 0.01, -1.42], ['chassis']),
    ]
    + pair('first_axle_wheel', 'jackknifed_lorry_cab_rear_wheel', rearAt(s.rearAxles[0]), on(['chassis']))
    + pair('last_axle_wheel', 'jackknifed_lorry_cab_rear_wheel', rearAt(s.rearAxles[1]), on(['chassis'])),
  },
}
