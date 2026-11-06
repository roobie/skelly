local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'car_trailer.spec.libsonnet';
local box = k.box;
local bothSides = k.bothSides;
local finish = { paint: s.paint, frame: s.frame };
[
  k.compound('car_trailer_chassis', 340, [
    box('rear_rail', 'frame', [s.rear - 0.04, s.frameLow, -s.side], [s.rear, s.frameHigh, s.side]),
    box('front_rail', 'frame', [s.front, s.frameLow, -0.55], [s.front + 0.04, s.frameHigh, 0.55]),
  ]
  + [box('cross_' + i, 'frame', [-2.0 + 0.8 * i - 0.04, s.frameLow, -0.55], [-2.0 + 0.8 * i + 0.04, s.frameHigh, 0.55]) for i in std.range(0, 4)]
  + bothSides([
    box('main_rail', 'frame', [s.rear, s.frameLow, 0.45], [s.front, s.frameHigh, 0.55]),
  ] + [
    box('spring_' + i, 'frame', [s.axles[i] - 0.2, s.hub + 0.05, 0.47], [s.axles[i] + 0.2, s.frameLow, 0.53])
    for i in [0, 1]
  ])
  + h.drawbar(s.front + 0.04, 0.5, s.tip, [s.frameLow, s.frameHigh]),
  finish),
  // Cargo stands on a load floor's highest face, so every piece here tops out at the deck. A cargo cell must lie inside one
  // box, so the joins between boards and track fall on the 0.1 m cell lines.
  k.compound('car_trailer_deck', 120, [
    box('boards', 'wood', [s.rear, s.deckLow, -0.6], [s.front, s.deck, 0.6]),
  ] + bothSides([
    box('rub_rail', 'paint', [s.rear, s.deckLow - 0.04, s.side - 0.02], [s.front, s.deck, s.side + 0.02]),
    box('track', 'paint', [s.rear, s.deckLow, 0.6], [1.1, s.deck, s.side - 0.02]),
    box('front_boards', 'wood', [1.1, s.deckLow, 0.6], [s.front, s.deck, s.side - 0.02]),
  ]), { wood: 'wood-oak', paint: s.paint }),
  // Stowed flat beside the main rail under the deck, running forward from the rear rail and stopping short of the wheels.
  k.compound('car_trailer_ramp', 30, [
    box('tread', 'ramp', [s.rear, s.rampLow, s.rampInner], [s.rear + s.rampLength, s.rampLow + 0.06, s.rampOuter]),
  ] + [
    local x = s.rear + s.rampLength * (i + 1) / 6;
    box('cleat_' + i, 'ramp', [x - 0.02, s.rampLow - 0.02, s.rampInner], [x + 0.02, s.rampLow, s.rampOuter])
    for i in std.range(0, 4)
  ], { ramp: s.ramp }),
  k.compound('car_trailer_wheel_stop', 30, [
    box('bar', 'frame', [1.1, s.deck, -s.side + 0.1], [1.26, s.deck + 0.16, s.side - 0.1]),
  ], finish),
  k.compound('car_trailer_headboard', 32, [
    box('top', 'paint', [1.48, 1.22, -0.5], [1.56, 1.3, 0.5]),
    box('winch_bar', 'paint', [1.48, 0.86, -0.5], [1.56, 0.92, 0.5]),
    box('winch', 'frame', [1.34, 0.92, -0.14], [1.56, 1.1, 0.14]),
  ] + bothSides([
    box('post', 'paint', [1.48, s.deck, 0.44], [1.56, 1.3, 0.5]),
  ]), finish),
]
