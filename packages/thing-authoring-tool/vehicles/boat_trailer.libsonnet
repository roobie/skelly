local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'boat_trailer.spec.libsonnet';
local box = k.box;
local bothSides = k.bothSides;
// Plan outline of the hull at half beam `b`, near side from transom to stem, as [z, x] stations.
local stations(b, bow) = [[b * 0.85, s.transom], [b, -0.2], [b * 0.72, bow - 0.65], [0.04, bow]];
local yPrism(id, slot, y, profile) = { id: id, kind: 'prism', slot: slot, axis: 'y', start: y[0], end: y[1], profile: profile };
local solidLayer(id, slot, y, b, bow) =
  local near = stations(b, bow);
  yPrism(id, slot, y, [[-near[0][0], near[0][1]]] + near + [[-0.04, bow], [-near[2][0], near[2][1]], [-near[1][0], near[1][1]]]);
// A prism must be convex, so a hollow layer is one trapezoid per station pair on each side.
local wallLayer(id, slot, y, b, bow, t=0.05) =
  local near = stations(b, bow);
  std.flattenArrays([
    local a = near[i];
    local c = near[i + 1];
    [
      yPrism(id + '_near_' + i, slot, y, [[a[0], a[1]], [c[0], c[1]], [std.max(c[0] - t, 0), c[1]], [a[0] - t, a[1]]]),
      yPrism(id + '_far_' + i, slot, y, [[-a[0] + t, a[1]], [-std.max(c[0] - t, 0), c[1]], [-c[0], c[1]], [-a[0], a[1]]]),
    ]
    for i in std.range(0, 2)
  ]);
[
  k.compound('boat_trailer_chassis', 130, [
    box('rear_rail', 'frame', [s.rear - 0.04, s.frameLow, -0.55], [s.rear, s.frameHigh, 0.55]),
    box('axle_rail', 'frame', [s.axle - 0.04, s.frameLow, -0.5], [s.axle + 0.04, s.frameHigh, 0.5]),
    box('front_rail', 'frame', [s.front - 0.04, s.frameLow, -0.5], [s.front, s.frameHigh, 0.5]),
    box('winch_brace', 'frame', [s.winchX - 0.04, s.frameLow, -0.27], [s.winchX + 0.04, s.frameHigh, 0.27]),
  ] + bothSides([
    box('side_rail', 'frame', [s.rear, s.frameLow, 0.42], [s.front, s.frameHigh, 0.5]),
    box('spring', 'frame', [s.axle - 0.34, s.hub, 0.46], [s.axle + 0.34, s.frameLow, 0.5]),
    box('guard_bracket', 'frame', [s.axle - 0.24, s.frameLow, 0.5], [s.axle + 0.24, s.frameHigh, 0.6]),
  ]) + h.drawbar(s.front, 0.5, s.tip, [s.frameLow, s.frameHigh]), { frame: s.paint }),
  k.compound('boat_trailer_bunks', 14, [
    box('cross_rear', 'frame', [s.rear + 0.2, s.frameHigh, -0.42], [s.rear + 0.28, 0.56, 0.42]),
    box('cross_front', 'frame', [s.front - 0.2, s.frameHigh, -0.42], [s.front - 0.12, 0.56, 0.42]),
    box('keel_roller', 'roller', [1.16, s.frameHigh, -0.14], [1.24, 0.6, 0.14]),
    box('roller_brace', 'frame', [1.17, s.frameLow, -0.34], [1.23, s.frameHigh, 0.34]),
  ] + bothSides([
    box('bunk', 'carpet', [s.rear + 0.1, 0.56, 0.2], [s.front - 0.04, s.bunkTop, 0.3]),
  ]), { frame: s.paint, carpet: 'rubber-black', roller: 'plastic-black' }),
  k.compound('boat_trailer_winch_post', 12, [
    box('post', 'frame', [s.winchX - 0.04, s.frameHigh, -0.04], [s.winchX + 0.04, 1.08, 0.04]),
    box('winch', 'winch', [s.winchX - 0.02, 0.92, -0.1], [s.winchX + 0.1, 1.04, 0.1]),
    box('bow_stop', 'stop', [1.49, 0.84, -0.05], [s.winchX - 0.04, 0.92, 0.05]),
  ], { frame: s.paint, winch: 'paint-charcoal', stop: 'rubber-black' }),
  k.compound('boat_trailer_boat', 150, [
    box('keel', 'hull', [-1.5, 0.58, -0.03], [1.15, s.bunkTop, 0.03]),
    solidLayer('bottom_low', 'hull', [s.bunkTop, 0.68], 0.46, 1.3),
    solidLayer('bottom_high', 'hull', [0.68, 0.75], 0.56, 1.38),
    solidLayer('floor', 'floor', [0.75, 0.78125], 0.58, 1.42),
    box('transom', 'hull', [s.transom, 0.68, -0.58], [s.transom + 0.06, 1.1, 0.58]),
    box('thwart_rear', 'wood', [-0.95, 0.96, -0.57], [-0.75, 1.0, 0.57]),
    box('thwart_mid', 'wood', [0.25, 0.96, -0.5], [0.45, 1.0, 0.5]),
    yPrism('foredeck', 'wood', [1.08, 1.12], [[-0.45, 0.95], [0.45, 0.95], [0.03, 1.5], [-0.03, 1.5]]),
  ]
  // The stripe wall lies exactly under side_mid, which covers its top, and white lining stands behind it, so no blue shows inside the hull.
  + wallLayer('side_low', 'stripe', [0.74, 0.86], 0.66, 1.5)
  + wallLayer('side_low_lining', 'hull', [0.74, 0.86], 0.61, 1.46, 0.08)
  + wallLayer('side_mid', 'hull', [0.86, 0.98], 0.66, 1.5, 0.08)
  + wallLayer('side_high', 'hull', [0.98, 1.1], 0.7, 1.55, 0.08)
  + wallLayer('gunwale', 'wood', [1.1, 1.14], 0.72, 1.57, 0.07), {
    hull: 'paint-white', stripe: 'paint-drum-blue', floor: 'wood-pine', wood: 'wood-oak',
  }),
  k.compound('boat_trailer_outboard', 40, [
    box('clamp', 'cowl', [s.transom - 0.05, 0.98, -0.06], [s.transom, 1.1, 0.06]),
    box('powerhead', 'cowl', [s.transom - 0.36, 1.02, -0.11], [s.transom - 0.05, 1.3, 0.11]),
    box('leg', 'leg', [s.transom - 0.28, 0.5, -0.04], [s.transom - 0.16, 1.02, 0.04]),
    box('plate', 'leg', [s.transom - 0.34, 0.5, -0.08], [s.transom - 0.1, 0.54, 0.08]),
    box('gearcase', 'leg', [s.transom - 0.3, 0.42, -0.05], [s.transom - 0.14, 0.5, 0.05]),
    box('propeller', 'prop', [s.transom - 0.36, 0.38, -0.07], [s.transom - 0.3, 0.52, 0.07]),
  ], { cowl: 'paint-charcoal', leg: 'steel-grey', prop: 'alu-bare' }),
  h.mudguard('boat_trailer_mudguard', 3, s.axle, s.hub, 0.31, 0.34, [0.6, s.wheelZ + 0.11], 'steel-galvanised'),
]
