local k = import 'kit.libsonnet';
local box = k.box;
local prism = k.prism;
local s = import 'limousine.spec.libsonnet';
local windowTop = s.roof - 0.03;
local midPost = -0.2;
local shape = (import 'car-shape.libsonnet')(s);
local rect(from, to, top) = [[from, s.waist], [to, s.waist], [to, top], [from, top]];
local pane(id, from, to) = shape.side(id, 'glass', rect(from, to, windowTop), [s.skin + 0.01 - 2 * shape.grain, s.skin + 0.01]);
local post(id, from) = shape.side(id, 'paint', rect(from, from + 0.1, s.roof - 0.02), [s.skin - 0.02, s.glassOut + 0.02]);
(import 'car-body.libsonnet')('limousine', s) + [
  k.compound('limousine_stretch', 180, k.bothSides([
    box('skin', 'paint', [s.rearDoorFront, s.floor, s.skin], [s.bRear, s.waist, s.side]),
    box('liner', 'trim', [s.rearDoorFront, s.floor + 0.02, s.skin - 0.03], [s.bRear, s.waist - 0.02, s.skin]),
  ] + post('rear_post', s.rearDoorFront) + post('mid_post', midPost) + pane('rear_pane', s.rearDoorFront + 0.1, midPost) + pane('front_pane', midPost + 0.1, s.bRear)), { paint: s.paint, trim: 'plastic-black', glass: s.sideGlass }),
  k.compound('limousine_brightwork', 3, k.bothSides([
    box('rear_belt', 'bright', [s.rearDoorArch, s.waist - 0.03125, s.side - 0.03125], [s.bRear, s.waist + 0.03125, s.side + 0.03125]),
    box('front_belt', 'bright', [s.bFront, s.waist - 0.03125, s.side - 0.03125], [s.cowl, s.waist + 0.03125, s.side + 0.03125]),
  ]), { bright: 'steel-stainless' }),
  k.compound('limousine_facing_seat', 22, [
    box('base', 'frame', [-0.1, s.floor, -0.7], [0.4, s.floor + 0.14, 0.7]),
    box('cushion', 'cloth', [-0.12, s.floor + 0.14, -0.7], [0.42, s.floor + 0.26, 0.7]),
    k.prism('back', 'cloth', [[0.31, s.floor + 0.24], [0.42, s.floor + 0.24], [0.5, s.floor + 0.86], [0.39, s.floor + 0.86]], [-0.7, 0.7]),
  ], { frame: 'steel-grey', cloth: 'leather-black' }),
]
