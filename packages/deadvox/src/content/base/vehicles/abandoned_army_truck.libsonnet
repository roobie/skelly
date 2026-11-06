// Items and blueprint for the abandoned army truck. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/abandoned_army_truck.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/abandoned_army_truck.spec.libsonnet';
local shell = ['structure', 'protection'];
local frame = ['structure'];
local panel(id, name) = part('abandoned_army_truck_' + id, name, pile, shell);
local fixed(id, row, supports) = fitting(id, 'abandoned_army_truck_' + row, origin, supports);
local wheel(id, x) = pair(id, 'abandoned_army_truck_wheel', [x, s.hubY, s.wheelZ], on(['chassis']));
{
  items: [
    part('abandoned_army_truck_chassis', 'Rusted army truck chassis', pile, frame),
    part('abandoned_army_truck_engine', 'Seized army truck engine', pile, frame),
    panel('bonnet', 'Rusted army truck bonnet'),
    panel('bonnet_flap', 'Sprung army truck bonnet flap'),
    panel('grille', 'Rusted army truck grille'),
    panel('wings', 'Rusted army truck wings'),
    panel('bumper', 'Sagging army truck bumper'),
    panel('near_side', 'Rusted army truck door side'),
    panel('far_side', 'Rusted army truck cab side'),
    panel('cab_roof', 'Dented army truck cab roof'),
    panel('cab_back', 'Rusted army truck cab back'),
    panel('screen_frame', 'Empty army truck windscreen frame'),
    panel('near_door', 'Sprung army truck door'),
    part('abandoned_army_truck_seat_frames', 'Bare army truck seat frames', pile, frame),
    part('abandoned_army_truck_dash', 'Rusted army truck dash', pile, frame),
    panel('bed_floor', 'Rotted army truck bed floor'),
    panel('bed_near', 'Rotted near bed side'),
    panel('bed_far', 'Rotted far bed side'),
    panel('headboard', 'Rotted bed headboard'),
    panel('tailgate', 'Dropped army truck tailgate'),
    part('abandoned_army_truck_hoops', 'Bare canvas hoops', pile, frame),
    part('abandoned_army_truck_canvas', 'Rotted canvas scraps', pile, frame),
    part('abandoned_army_truck_wheel', 'Flat army truck wheel', pile, frame),
  ],
  blueprint: {
    id: 'abandoned_army_truck',
    name: 'Abandoned army truck',
    fittings: [
      fixed('chassis', 'chassis', []),
      fixed('engine', 'engine', ['chassis']),
      fixed('bonnet', 'bonnet', ['chassis']),
      fixed('bonnet_flap', 'bonnet_flap', ['bonnet']),
      fixed('grille', 'grille', ['chassis']),
      fixed('wings', 'wings', ['chassis']),
      fixed('bumper', 'bumper', ['chassis']),
      fixed('near_side', 'near_side', ['chassis']),
      fixed('far_side', 'far_side', ['chassis']),
      fixed('cab_back', 'cab_back', ['chassis']),
      fixed('screen_frame', 'screen_frame', ['chassis']),
      fixed('cab_roof', 'cab_roof', ['near_side', 'far_side', 'cab_back', 'screen_frame']),
      fixed('near_door', 'near_door', ['near_side']),
      fixed('seat_frames', 'seat_frames', ['chassis']),
      fixed('dash', 'dash', ['chassis']),
      fixed('bed_floor', 'bed_floor', ['chassis']),
      fixed('bed_near', 'bed_near', ['bed_floor']),
      fixed('bed_far', 'bed_far', ['bed_floor']),
      fixed('headboard', 'headboard', ['bed_floor']),
      fixed('tailgate', 'tailgate', ['bed_floor']),
      fixed('hoops', 'hoops', ['bed_near', 'bed_far']),
      fixed('canvas', 'canvas', ['hoops']),
    ]
    + wheel('front_wheel', s.frontAxle)
    + wheel('middle_wheel', s.rearAxles[0])
    + wheel('rear_wheel', s.rearAxles[1]),
  },
}
