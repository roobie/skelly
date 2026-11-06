local t = import 'truck-cab.libsonnet';
local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local box = k.box;
local prism = k.prism;
local s = import 'car_transporter.spec.libsonnet';
local finish = { paint: s.paint, deck: 'alu-bare', frame: 'paint-charcoal', steel: 'steel-galvanised', dark: 'plastic-black', reflect: 'reflective-yellow' };
local thick = s.upperTop - s.upperBottom;
local trackIn = 0.48;
local crossXs = [-3.9 + i * 1.2 for i in std.range(0, 6)];
local postXs = [3.34, 1.0, -1.3, -3.6];
// A sloped run of the upper deck between two points on its top surface.
local slope(id, a, b, z) = prism(id, 'deck', [[a[0], a[1] - thick], [b[0], b[1] - thick], [b[0], b[1]], [a[0], a[1]]], z);
local slopeTail(id, a, b, z) = prism(id, 'deck', [[b[0], b[1] - thick], [a[0], a[1] - thick], [a[0], a[1]], [b[0], b[1]]], z);
local rise = (s.headTip[1] - s.upperTop) / (s.headTip[0] - s.upperFront);
local fall = (s.upperTop - s.tailTip[1]) / (s.upperRear - s.tailTip[0]);
local headAt(f) = [s.upperFront + f * (s.headTip[0] - s.upperFront), s.upperTop + f * (s.headTip[1] - s.upperTop)];
local tailAt(f) = [s.upperRear + f * (s.tailTip[0] - s.upperRear), s.upperTop + f * (s.tailTip[1] - s.upperTop)];
t.rows('car_transporter', s) + [
  k.compound('car_transporter_lower_deck', 1200, [
    box('plate', 'deck', [s.rear, s.lowerBottom, -s.deckSide], [s.lowerFront, s.lowerTop, s.deckSide]),
    box('cross_rear', 'frame', [-5.4, s.railTop, -0.46], [-5.2, s.lowerBottom, 0.46]),
  ] + k.bothSides([
    box('runner', 'frame', [s.rear + 0.1, s.railTop, 0.3], [s.lowerFront, s.lowerBottom, 0.44]),
  ]), finish),
  // Bars stay below the wheel tracks, because the cargo face is this part's highest point.
  k.compound('car_transporter_upper_deck', 1100, k.bothSides([
    box('track', 'deck', [s.upperRear, s.upperBottom, trackIn], [s.upperFront, s.upperTop, s.deckSide]),
  ]) + [
    box('cross_' + i, 'frame', [crossXs[i] - 0.05, s.upperBottom - 0.06, -s.deckSide], [crossXs[i] + 0.05, s.upperBottom + 0.03, s.deckSide])
    for i in std.range(0, std.length(crossXs) - 1)
  ], finish),
  k.compound('car_transporter_head_rack', 170, [
    slope('track_near', [s.upperFront, s.upperTop], s.headTip, [trackIn, s.deckSide]),
    slope('track_far', [s.upperFront, s.upperTop], s.headTip, [-s.deckSide, -trackIn]),
    box('nose_bar', 'frame', [s.headTip[0] - 0.12, s.headTip[1] - 0.2, -s.deckSide], [s.headTip[0], s.headTip[1] - 0.06, s.deckSide]),
    box('root_bar', 'frame', [s.upperFront - 0.08, s.upperBottom - 0.0, -0.5], [s.upperFront + 0.16, s.upperTop, 0.5]),
  ] + [
    box('bar_' + f, 'frame', [headAt(f / 10)[0] - 0.05, headAt(f / 10)[1] - 0.09, -0.5], [headAt(f / 10)[0] + 0.05, headAt(f / 10)[1] - 0.01, 0.5])
    for f in [3, 6]
  ] + k.bothSides([
    m.bar('strut', 'frame', [3.4, s.upperBottom], [headAt(0.65)[0], headAt(0.65)[1] - thick], 0.06, [s.postIn, s.deckSide]),
  ]), finish),
  k.compound('car_transporter_tail_slope', 130, [
    slopeTail('track_near', [s.upperRear, s.upperTop], s.tailTip, [trackIn, s.deckSide]),
    slopeTail('track_far', [s.upperRear, s.upperTop], s.tailTip, [-s.deckSide, -trackIn]),
    box('root_bar', 'frame', [s.upperRear - 0.16, s.upperBottom - 0.04, -0.5], [s.upperRear + 0.08, s.upperTop - 0.03, 0.5]),
    box('tip_bar', 'frame', [s.tailTip[0], s.tailTip[1] - 0.16, -0.5], [s.tailTip[0] + 0.14, s.tailTip[1] - 0.02, 0.5]),
  ], finish),
  k.compound('car_transporter_deck_posts', 700, k.bothSides(std.flattenArrays([
    [
      box('post_' + i, 'paint', [postXs[i] - 0.07, s.lowerBottom, s.postIn], [postXs[i] + 0.07, s.upperBottom, s.postOut]),
    ]
    for i in std.range(0, std.length(postXs) - 1)
  ]) + [
    box('tail_post', 'paint', [-5.28, s.lowerBottom, s.postIn], [-5.14, tailAt(0.68)[1] - thick + 0.03, s.postOut]),
    m.bar('ram', 'steel', [-2.5, s.lowerTop], [-1.36, s.upperBottom], 0.1, [s.postIn + 0.02, s.postOut - 0.02]),
    m.bar('tail_brace', 'frame', [-4.9, s.lowerTop], [-3.66, s.upperBottom], 0.09, [s.postIn + 0.02, s.postOut - 0.02]),
    m.bar('front_brace', 'frame', [3.28, s.lowerTop], [1.06, s.upperBottom], 0.07, [s.postIn + 0.02, s.postOut - 0.02]),
    box('top_rail', 'paint', [s.upperRear, s.upperTop, s.deckSide - 0.03], [s.upperFront, s.upperTop + 0.1, s.deckSide + 0.03]),
    box('rail_stand_a', 'paint', [-4.28, s.upperBottom, s.deckSide], [-4.16, s.upperTop + 0.1, s.postOut]),
    box('rail_stand_b', 'paint', [3.38, s.upperBottom, s.deckSide], [3.5, s.upperTop + 0.1, s.postOut]),
    box('deck_edge', 'reflect', [s.rear, s.lowerBottom + 0.01, s.deckSide], [s.lowerFront, s.lowerTop - 0.01, s.postOut]),
  ]), finish),
  k.compound('car_transporter_ramp', 60, [
    box('plate', 'steel', [-5.6, s.lowerBottom, 0.55], [-5.5, s.tailTip[1] - 0.1, 1.1]),
    box('rib_in', 'frame', [-5.64, s.lowerBottom, 0.55], [-5.6, s.tailTip[1] - 0.1, 0.62]),
    box('rib_out', 'frame', [-5.64, s.lowerBottom, 1.03], [-5.6, s.tailTip[1] - 0.1, 1.1]),
  ], finish),
  k.compound('car_transporter_side_guard', 45, k.bothSides([
    box('rail_low', 'frame', [-1.9, 0.68, s.postOut - 0.05], [2.0, 0.76, s.postOut]),
    box('rail_high', 'frame', [-1.9, 0.92, s.postOut - 0.05], [2.0, 1.0, s.postOut]),
    box('hanger_a', 'frame', [-1.82, 0.68, s.postOut - 0.06], [-1.74, s.lowerBottom, s.postOut - 0.02]),
    box('hanger_b', 'frame', [0.0, 0.68, s.postOut - 0.06], [0.08, s.lowerBottom, s.postOut - 0.02]),
    box('hanger_c', 'frame', [1.82, 0.68, s.postOut - 0.06], [1.9, s.lowerBottom, s.postOut - 0.02]),
  ]), finish),
]
