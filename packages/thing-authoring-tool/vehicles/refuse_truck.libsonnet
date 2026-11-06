local t = import 'truck-cab.libsonnet';
local k = import 'kit.libsonnet';
local box = k.box;
local prism = k.prism;
local s = import 'refuse_truck.spec.libsonnet';
local finish = { paint: s.paint, frame: 'paint-charcoal', steel: 'steel-grey', dark: 'plastic-black', hivis: 'plastic-hivis', reflect: 'reflective-yellow', rust: 'scrap-rusted' };
local layer(name, z, drop) = prism(name, 'paint', [[s.bodyRear, s.bodyLow], [s.bodyFront, s.bodyLow], [s.bodyFront, s.bodyRise - drop], [s.bodyRear, s.bodyRiseRear - drop]], [-z, z]);
local ribs = [s.bodyRear + 0.45 + i * (s.bodyFront - s.bodyRear - 0.9) / 5 for i in std.range(0, 5)];
local posts = [2.7, 1.4, 0.1, -0.7];
local hood = [[s.hopperRear, s.hopperLintel], [s.bodyRear - 0.2, s.hopperLintel], [s.bodyRear, s.bodyRiseRear - 0.1], [s.bodyRear - 0.6, s.bodyRiseRear - 0.15], [s.hopperRear, s.hopperLintel + 0.05]];
t.rows('refuse_truck', s) + [
  k.compound('refuse_truck_subframe', 460, k.bothSides([
    box('runner', 'frame', [s.bodyRear - 1.4, s.railTop, 0.34], [s.bodyFront, s.bodyLow, 0.46]),
  ]), finish),
  k.compound('refuse_truck_body', 3200, [
    layer('wall', 1.24, 0.45),
    layer('shoulder', 1.18, 0.25),
    layer('crown', 1.04, 0.1),
    layer('ridge', 0.8, 0),
  ] + k.bothSides([
    box('reflector', 'reflect', [s.bodyRear, s.bodyLow + 0.04, 1.24], [s.bodyFront, s.bodyLow + 0.14, 1.246]),
    box('sill', 'frame', [s.bodyRear, s.bodyLow - 0.06, 1.12], [s.bodyFront, s.bodyLow, 1.24]),
  ] + [
    box('rib_' + i, 'paint', [ribs[i] - 0.05, s.bodyLow + 0.14, 1.24], [ribs[i] + 0.05, s.bodyRise - 0.47, 1.25])
    for i in std.range(0, 5)
  ]), finish),
  k.compound('refuse_truck_hopper', 1500, [
    prism('hood', 'paint', hood, [-s.cheekIn, s.cheekIn]),
    prism('bowl', 'rust', [[s.hopperRear + 0.45, 0.95], [s.bodyRear, 0.95], [s.bodyRear, 1.3], [s.hopperRear, s.hopperSill], [s.hopperRear, s.hopperSill - 0.05]], [-s.cheekIn, s.cheekIn]),
    box('lip', 'steel', [s.hopperRear - 0.03, s.hopperSill - 0.1, -s.cheekIn], [s.hopperRear + 0.06, s.hopperSill + 0.01, s.cheekIn]),
    box('lintel', 'hivis', [s.hopperRear - 0.02, s.hopperLintel - 0.04, -s.cheekIn], [s.hopperRear + 0.08, s.hopperLintel + 0.05, s.cheekIn]),
    box('back', 'dark', [s.bodyRear - 0.5, 1.2, -s.cheekIn], [s.bodyRear, s.hopperLintel, s.cheekIn]),
  ] + k.bothSides([
    prism('cheek', 'paint', [[s.hopperRear + 0.45, 0.95], [s.bodyRear, 0.95], [s.bodyRear, s.bodyRiseRear - 0.1], [s.bodyRear - 0.6, s.bodyRiseRear - 0.15], [s.hopperRear, s.hopperLintel + 0.05], [s.hopperRear, s.hopperSill - 0.05]], [s.cheekIn, 1.24]),
    box('rear_hivis', 'hivis', [s.hopperRear - 0.01, s.hopperSill, s.cheekIn], [s.hopperRear, s.hopperLintel, 1.24]),
    box('cheek_reflector', 'reflect', [s.hopperRear + 0.2, s.bodyLow + 0.04, 1.24], [s.bodyRear, s.bodyLow + 0.14, 1.246]),
    box('grab', 'dark', [s.hopperRear - 0.05, s.hopperSill + 0.05, 1.125], [s.hopperRear - 0.02, s.hopperLintel, 1.155]),
    box('grab_low', 'dark', [s.hopperRear - 0.02, s.hopperSill + 0.05, 1.125], [s.hopperRear, s.hopperSill + 0.08, 1.155]),
    box('grab_high', 'dark', [s.hopperRear - 0.02, s.hopperLintel - 0.03, 1.125], [s.hopperRear, s.hopperLintel, 1.155]),
  ]), finish),
  k.compound('refuse_truck_packer', 420, [
    prism('blade', 'steel', [[s.bodyRear - 1.0, 1.55], [s.bodyRear - 0.55, 1.45], [s.bodyRear - 0.5, s.hopperLintel + 0.02], [s.bodyRear - 0.72, s.hopperLintel + 0.02]], [-1.08, 1.08]),
  ], finish),
  k.compound('refuse_truck_bin_lift', 240, [
    box('bar', 'steel', [s.hopperRear - 0.12, 1.2, -0.82], [s.hopperRear - 0.04, 1.28, 0.82]),
    box('comb', 'dark', [s.hopperRear - 0.14, 1.36, -0.82], [s.hopperRear - 0.1, 1.44, 0.82]),
  ] + k.bothSides([
    box('arm', 'steel', [s.hopperRear - 0.1, 1.0, 0.68], [s.hopperRear + 0.08, s.hopperSill - 0.08, 0.8]),
  ]), finish),
  k.compound('refuse_truck_rear_step', 50, k.bothSides([
    box('tread', 'steel', [s.rear - 0.06, 0.7, 0.84], [s.hopperRear + 0.3, 0.74, 1.18]),
    box('hanger', 'frame', [s.hopperRear + 0.1, 0.74, 0.92], [s.hopperRear + 0.2, 0.95, 1.1]),
  ]), finish),
  k.compound('refuse_truck_side_guard', 45, k.bothSides([
    box('rail_high', 'steel', [-0.7, 1.08, 1.21], [2.85, 1.15, 1.235]),
    box('rail_low', 'steel', [-0.7, 0.76, 1.21], [2.85, 0.83, 1.235]),
  ] + [
    box('post_' + i, 'frame', [posts[i] - 0.03, 0.76, 1.19], [posts[i] + 0.03, s.bodyLow - 0.05, 1.21])
    for i in std.range(0, 3)
  ]), finish),
]
