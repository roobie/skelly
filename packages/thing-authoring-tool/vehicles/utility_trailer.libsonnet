local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'utility_trailer.spec.libsonnet';
local box = k.box;
local bothSides = k.bothSides;
local finish = { paint: s.paint, frame: 'paint-charcoal' };
[
  k.compound('utility_trailer_chassis', 165, [
    box('front_rail', 'frame', [s.front - 0.04, s.frameLow, -0.55], [s.front, s.frameHigh, 0.55]),
    box('mid_rail', 'frame', [s.axle - 0.04, s.frameLow, -0.55], [s.axle + 0.04, s.frameHigh, 0.55]),
    box('rear_rail', 'frame', [s.rear - 0.04, s.frameLow - 0.03, -0.62], [s.rear, s.frameHigh, 0.62]),
  ] + bothSides([
    box('side_rail', 'frame', [s.rear, s.frameLow, 0.47], [s.front, s.frameHigh, 0.55]),
    box('spring', 'frame', [s.axle - 0.34, s.hub, 0.5], [s.axle + 0.34, s.frameLow, 0.54]),
  ]) + h.drawbar(s.front, 0.5, s.tip, [s.frameLow, s.frameHigh]), finish),
  k.compound('utility_trailer_floor', 45, [
    box('deck', 'wood', [s.rear, s.frameHigh, -s.side], [s.front, s.deck, s.side]),
  ], { wood: 'wood-birch' }),
  k.compound('utility_trailer_side', 18, [
    box('skin', 'paint', [s.rear, s.deck, s.side - 0.04], [s.front, s.wall, s.side]),
    box('top_rail', 'paint', [s.rear, s.wall, s.side - 0.05], [s.front, s.wall + 0.04, s.side + 0.01]),
    box('rub_rail', 'paint', [s.rear, s.frameHigh - 0.02, s.side], [s.front, s.deck + 0.04, s.side + 0.02]),
    box('post_mid', 'paint', [s.axle + 0.3, s.deck, s.side], [s.axle + 0.36, s.wall, s.side + 0.02]),
    box('post_front', 'paint', [s.front - 0.08, s.deck, s.side], [s.front, s.wall, s.side + 0.02]),
    box('post_rear', 'paint', [s.rear, s.deck, s.side], [s.rear + 0.08, s.wall, s.side + 0.02]),
  ], { paint: s.paint }),
  k.compound('utility_trailer_headboard', 12, [
    box('skin', 'paint', [s.front - 0.04, s.deck, -s.side + 0.04], [s.front, s.wall, s.side - 0.04]),
    box('top_rail', 'paint', [s.front - 0.05, s.wall, -s.side], [s.front + 0.01, s.wall + 0.04, s.side]),
  ], { paint: s.paint }),
  // The tailgate drops about its lower edge.
  k.compound('utility_trailer_tailgate', 14, [
    box('skin', 'paint', [s.rear, s.deck, -s.side + 0.04], [s.rear + 0.04, s.wall, s.side - 0.04]),
    box('top_rail', 'paint', [s.rear - 0.01, s.wall - 0.04, -s.side + 0.04], [s.rear + 0.05, s.wall, s.side - 0.04]),
    box('stripe', 'frame', [s.rear - 0.01, s.deck + 0.14, -0.3], [s.rear, s.deck + 0.2, 0.3]),
  ], { paint: s.paint, frame: 'paint-charcoal' }, { hinge_a: ['skin', [0, 0, 0.2]], hinge_b: ['skin', [0, 0, 0.8]] }),
  h.mudguard('utility_trailer_mudguard', 3, s.axle, s.hub, 0.31, 0.34, [s.side, s.wheelZ + 0.11], s.paint),
]
