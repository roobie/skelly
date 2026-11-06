local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'livestock_trailer.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local finish = { paint: s.paint, slat: s.slat, frame: s.frame };
local posts = [-1.9, -1.0, -0.1, 0.8, 1.64];
[
  k.compound('livestock_trailer_chassis', 300, [
    box('rear_rail', 'frame', [s.rear - 0.04, s.frameLow, -s.side], [s.rear + 0.06, s.frameHigh, s.side]),
    box('front_rail', 'frame', [s.front - 0.06, s.frameLow, -s.side], [s.front + 0.04, s.frameHigh, s.side]),
  ]
  + [box('cross_' + i, 'frame', [-1.2 + 0.8 * i - 0.04, s.frameLow, -s.side], [-1.2 + 0.8 * i + 0.04, s.frameHigh, s.side]) for i in std.range(0, 3)]
  + bothSides([
    box('main_rail', 'frame', [s.rear, s.frameLow, 0.5], [s.front, s.frameHigh, 0.6]),
    box('sill', 'frame', [s.rear, s.frameLow, s.skin - 0.03], [s.front, s.frameHigh, s.side]),
  ] + [
    box('spring_' + i, 'frame', [s.axles[i] - 0.26, s.frameLow - 0.025, 0.5], [s.axles[i] + 0.26, s.frameLow, 0.56])
    for i in [0, 1]
  ])
  + h.drawbar(s.front + 0.04, 0.6, s.tip, [s.frameLow, s.frameLow + 0.1]),
  finish),
  k.compound('livestock_trailer_floor', 110, [
    box('boards', 'wood', [s.rear, s.frameHigh, -s.skin], [s.front - 0.04, s.floor - 0.02, s.skin]),
    box('mat', 'mat', [s.rear, s.floor - 0.02, -s.skin], [s.front - 0.04, s.floor, s.skin]),
  ], { wood: 'wood-oak', mat: 'rubber-black' }),
  k.compound('livestock_trailer_side', 70, [
    box('kick', 'paint', [s.rear, s.frameHigh, s.skin], [s.front, s.kickTop, s.side]),
    box('kick_cap', 'frame', [s.rear, s.kickTop, s.skin], [s.front, s.slats[0][0], s.side]),
    box('top_rail', 'paint', [s.rear, s.railLow, s.skin], [s.front, s.eave, s.side]),
  ]
  + [box('slat_' + i, 'slat', [s.rear, s.slats[i][0], s.skin], [s.front, s.slats[i][1], s.side]) for i in std.range(0, std.length(s.slats) - 1)]
  + [box('post_' + i, 'frame', [posts[i], s.frameHigh, s.side], [posts[i] + 0.06, s.eave, s.side + 0.02]) for i in std.range(0, std.length(posts) - 1)],
  finish),
  k.compound('livestock_trailer_headboard', 40, [
    box('kick', 'paint', [s.front - 0.04, s.frameHigh, -s.skin], [s.front, s.kickTop, s.skin]),
    box('kick_cap', 'frame', [s.front - 0.04, s.kickTop, -s.skin], [s.front, s.slats[0][0], s.skin]),
    box('top_rail', 'paint', [s.front - 0.04, s.railLow, -s.skin], [s.front, s.eave, s.skin]),
    box('post', 'frame', [s.front, s.frameHigh, -0.03], [s.front + 0.02, s.eave, 0.03]),
  ]
  + [box('slat_' + i, 'slat', [s.front - 0.04, s.slats[i][0], -s.skin], [s.front, s.slats[i][1], s.skin]) for i in std.range(0, std.length(s.slats) - 1)],
  finish),
  k.compound('livestock_trailer_roof', 45, [
    box('sheet', 'roof', [s.rear - 0.06, s.eave, -s.side - 0.03], [s.front + 0.06, s.roof, s.side + 0.03]),
  ] + [box('rib_' + i, 'roof', [-1.5 + 0.6 * i - 0.02, s.roof, -s.side], [-1.5 + 0.6 * i + 0.02, s.roof + 0.02, s.side]) for i in std.range(0, 5)],
  { roof: 'steel-galvanised' }),
  // The ramp drops about its lower edge, as the horse box's does.
  k.compound('livestock_trailer_ramp', 70, [
    box('skin', 'paint', [s.rear - 0.05, s.frameHigh, -s.side], [s.rear, s.rampTop, s.side]),
    box('catch', 'frame', [s.rear - 0.08, s.rampTop - 0.14, -0.3], [s.rear - 0.05, s.rampTop - 0.08, 0.3]),
  ] + [box('batten_' + i, 'frame', [s.rear - 0.07, s.frameHigh + 0.12 + 0.2 * i, -s.side + 0.1], [s.rear - 0.05, s.frameHigh + 0.15 + 0.2 * i, s.side - 0.1]) for i in std.range(0, 3)]
  + bothSides([box('spring_arm', 'frame', [s.rear - 0.08, s.frameHigh, s.side - 0.1], [s.rear - 0.05, s.rampTop - 0.08, s.side - 0.04])]),
  finish, { hinge_a: ['skin', [0.5, 0, 0.1]], hinge_b: ['skin', [0.5, 0, 0.9]] }),
  k.compound('livestock_trailer_top_gate', 15, [
    box('slat', 'slat', [s.rear - 0.04, s.slats[4][0], -s.side], [s.rear, s.slats[4][1], s.side]),
    box('rail', 'paint', [s.rear - 0.04, s.railLow, -s.side], [s.rear, s.eave, s.side]),
    box('post', 'frame', [s.rear - 0.04, s.rampTop, -0.03], [s.rear, s.eave, 0.03]),
  ] + bothSides([
    box('post_side', 'frame', [s.rear - 0.04, s.rampTop, s.side - 0.06], [s.rear, s.eave, s.side]),
  ]), finish),
  k.compound('livestock_trailer_mudguard', 11, [
    box('tread', 'frame', [s.axles[0] - 0.36, 0.68, s.side], [s.axles[1] + 0.36, 0.71, s.wheelZ + 0.11]),
    prism('rear_end', 'frame', [[s.axles[0] - 0.46, 0.34], [s.axles[0] - 0.42, 0.34], [s.axles[0] - 0.34, 0.68], [s.axles[0] - 0.36, 0.71]], [s.side, s.wheelZ + 0.11]),
    prism('front_end', 'frame', [[s.axles[1] + 0.42, 0.34], [s.axles[1] + 0.46, 0.34], [s.axles[1] + 0.36, 0.71], [s.axles[1] + 0.34, 0.68]], [s.side, s.wheelZ + 0.11]),
  ], finish),
]
