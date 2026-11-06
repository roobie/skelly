local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'horse_box.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local f = s.front;
local door = [s.doorRear, s.doorFront, s.doorLow, s.doorTop];
local ventHeight = 0.28125;
local slats = 4;
local wall(z, railZ, openings) =
  h.wall('panel', 'paint', [s.rear, s.front], [s.frameHigh, s.eave], z, openings)
  + [
    box('rub_rail_rear', 'frame', [s.rear, s.rubRail - 0.03, railZ[0]], [if std.length(openings) > 0 then s.doorRear else s.front, s.rubRail + 0.03, railZ[1]]),
  ]
  + (if std.length(openings) > 0 then [box('rub_rail_front', 'frame', [s.doorFront, s.rubRail - 0.03, railZ[0]], [s.front, s.rubRail + 0.03, railZ[1]])] else []);
local finish = { paint: s.paint, frame: s.frame };
[
  k.compound('horse_box_chassis', 340, [
    box('rear_rail', 'frame', [s.rear - 0.08, s.frameLow, -s.side], [s.rear + 0.06, s.frameHigh, s.side]),
    box('front_rail', 'frame', [s.noseTip - 0.06, s.frameLow, -s.side], [s.noseTip, s.frameHigh, s.side]),
  ]
  + [box('cross_' + i, 'frame', [-1.2 + 0.8 * i - 0.04, s.frameLow, -s.side], [-1.2 + 0.8 * i + 0.04, s.frameHigh, s.side]) for i in std.range(0, 3)]
  + bothSides([
    box('main_rail', 'frame', [s.rear, s.frameLow, 0.5], [s.noseTip, s.frameHigh, 0.6]),
    box('sill', 'frame', [s.rear, s.frameLow, s.skin - 0.03], [s.noseTip, s.frameHigh, s.side]),
  ] + std.flattenArrays([[
    box('spring_' + i, 'frame', [s.axles[i] - 0.26, s.frameLow - 0.025, 0.5], [s.axles[i] + 0.26, s.frameLow, 0.56]),
  ] for i in [0, 1]]))
  + h.drawbar(s.noseTip, 0.62, s.tip, [s.frameLow, s.frameLow + 0.1]),
  { frame: s.frame }),
  k.compound('horse_box_floor', 120, [
    box('boards', 'wood', [s.rear, s.frameHigh, -s.skin], [s.front, s.floor - 0.02, s.skin]),
    box('mat', 'mat', [s.rear, s.floor - 0.02, -s.skin], [s.front, s.floor, s.skin]),
  ], { wood: 'wood-oak', mat: 'rubber-black' }),
  k.compound('horse_box_wall_door', 140, wall([s.skin, s.side], [s.side, s.side + 0.02], [door]), finish),
  k.compound('horse_box_wall_plain', 160, wall([-s.side, -s.skin], [-s.side - 0.02, -s.side], []), finish),
  k.compound('horse_box_door', 18, [
    box('skin', 'paint', [s.doorRear + 0.02, s.doorLow + 0.02, s.skin + 0.01], [s.doorFront - 0.02, s.doorTop - 0.02, s.side]),
    box('rub_rail', 'frame', [s.doorRear + 0.02, s.rubRail - 0.03, s.side], [s.doorFront - 0.02, s.rubRail + 0.03, s.side + 0.02]),
    box('handle', 'frame', [s.doorRear + 0.05, 1.2, s.side], [s.doorRear + 0.17, 1.24, s.side + 0.03]),
    box('strap_low', 'frame', [s.doorFront - 0.3, s.doorLow + 0.4, s.side], [s.doorFront - 0.02, s.doorLow + 0.44, s.side + 0.02]),
    box('strap_high', 'frame', [s.doorFront - 0.3, s.doorTop - 0.32, s.side], [s.doorFront - 0.02, s.doorTop - 0.28, s.side + 0.02]),
  ], finish, { hinge_a: ['skin', [1, 0.2, 1]], hinge_b: ['skin', [1, 0.8, 1]] }),
  // Fitted at its lower rear corner, high on the wall where a horse's head does not reach it.
  k.compound('horse_box_vent', 3, [
    box('plate', 'frame', [0, 0, s.side - 0.02], [s.ventWidth, ventHeight, s.side + 0.02]),
  ] + [
    box('slat_' + i, 'slat', [0.03125, 0.03125 + 0.0625 * i, s.side + 0.02], [s.ventWidth - 0.03125, 0.0625 + 0.0625 * i, s.side + 0.05])
    for i in std.range(0, slats - 1)
  ], { frame: s.frame, slat: 'steel-grey' }),
  k.compound('horse_box_roof', 80, [
    { id: 'shell', kind: 'prism', slot: 'paint', axis: 'x', start: s.rear - 0.04, end: f + 0.1,
      profile: [[s.eave, -s.side - 0.02], [s.eave + 0.06, -s.side + 0.02], [s.roof, -s.side + 0.18], [s.roof, s.side - 0.18], [s.eave + 0.06, s.side - 0.02], [s.eave, s.side + 0.02]] },
  ], { paint: s.paint }),
  k.compound('horse_box_nose', 70, [
    prism('slab', 'paint', [[f, s.frameHigh], [s.noseFace, s.frameHigh], [s.noseFace, s.noseRake], [f + 0.1, s.eave], [f, s.eave]], [-s.side, s.side]),
    box('rub_rail_front', 'frame', [s.noseFace - 0.02, s.rubRail - 0.03, -s.side - 0.02], [s.noseFace + 0.02, s.rubRail + 0.03, s.side + 0.02]),
  ] + bothSides([
    box('rub_rail', 'frame', [f, s.rubRail - 0.03, s.side], [s.noseFace, s.rubRail + 0.03, s.side + 0.02]),
    box('vent_plate', 'frame', [s.noseFace, s.ventLow - 0.14, 0.14], [s.noseFace + 0.02, s.ventLow + ventHeight - 0.14, 0.66]),
  ] + [
    box('vent_slat_' + i, 'slat', [s.noseFace + 0.02, s.ventLow - 0.14 + 0.03125 + 0.0625 * i, 0.17], [s.noseFace + 0.05, s.ventLow - 0.14 + 0.0625 + 0.0625 * i, 0.63])
    for i in std.range(0, slats - 1)
  ]), finish + { slat: 'steel-grey' }),
  // Lowered about its foot, so the horses walk up its battens.
  k.compound('horse_box_ramp', 90, [
    box('skin', 'paint', [s.rear - 0.05, s.frameHigh, -s.side], [s.rear, s.rampTop, s.side]),
    box('catch', 'frame', [s.rear - 0.08, s.rampTop - 0.14, -0.3], [s.rear - 0.05, s.rampTop - 0.08, 0.3]),
  ] + [box('batten_' + i, 'frame', [s.rear - 0.07, s.frameHigh + 0.12 + 0.2 * i, -s.side + 0.1], [s.rear - 0.05, s.frameHigh + 0.15 + 0.2 * i, s.side - 0.1]) for i in std.range(0, 6)]
  + bothSides([box('spring_arm', 'frame', [s.rear - 0.08, s.frameHigh, s.side - 0.1], [s.rear - 0.05, s.rampTop - 0.08, s.side - 0.04])]),
  finish, { hinge_a: ['skin', [0.5, 0, 0.1]], hinge_b: ['skin', [0.5, 0, 0.9]] }),
  // The upper doors close above the ramp and meet on the centre line.
  k.compound('horse_box_top_door', 14, [
    box('skin', 'paint', [s.rear - 0.04, s.rampTop, 0.01], [s.rear, s.eave, s.side]),
    box('louvre_a', 'frame', [s.rear - 0.05, s.rampTop + 0.16, 0.2], [s.rear - 0.04, s.rampTop + 0.19, s.side - 0.12]),
    box('louvre_b', 'frame', [s.rear - 0.05, s.rampTop + 0.24, 0.2], [s.rear - 0.04, s.rampTop + 0.27, s.side - 0.12]),
    box('hinge_top', 'frame', [s.rear - 0.06, s.eave - 0.08, s.side - 0.2], [s.rear - 0.04, s.eave - 0.04, s.side]),
    box('hinge_low', 'frame', [s.rear - 0.06, s.rampTop + 0.05, s.side - 0.2], [s.rear - 0.04, s.rampTop + 0.09, s.side]),
  ], finish, { hinge_a: ['skin', [0.5, 0.1, 1]], hinge_b: ['skin', [0.5, 0.9, 1]] }),
  // Hangs clear of the floor from its front post, so it swings aside for loading.
  k.compound('horse_box_partition', 28, [
    box('post', 'frame', [0.96, s.floor, -0.03], [1.02, s.eave, 0.03]),
    box('panel', 'pad', [-1.5, s.floor + 0.25, -0.02], [0.96, s.floor + 1.3, 0.02]),
    box('top_bar', 'frame', [-1.5, s.floor + 1.3, -0.025], [0.96, s.floor + 1.34, 0.025]),
  ], { frame: 'steel-galvanised', pad: 'rubber-black' }),
  k.compound('horse_box_breast_bar', 8, [
    box('bar', 'pad', [0.96, s.floor + 1.0, -s.skin], [1.02, s.floor + 1.06, s.skin]),
  ], { pad: 'plastic-black' }),
  // A flat tread over both wheels, closing down at each end to the frame.
  k.compound('horse_box_mudguard', 11, [
    box('tread', 'frame', [s.axles[0] - 0.36, 0.68, s.side], [s.axles[1] + 0.36, 0.71, s.wheelZ + 0.11]),
    prism('rear_end', 'frame', [[s.axles[0] - 0.46, 0.34], [s.axles[0] - 0.42, 0.34], [s.axles[0] - 0.34, 0.68], [s.axles[0] - 0.36, 0.71]], [s.side, s.wheelZ + 0.11]),
    prism('front_end', 'frame', [[s.axles[1] + 0.42, 0.34], [s.axles[1] + 0.46, 0.34], [s.axles[1] + 0.36, 0.71], [s.axles[1] + 0.34, 0.68]], [s.side, s.wheelZ + 0.11]),
  ], { frame: s.frame }),
]
