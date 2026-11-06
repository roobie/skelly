local h = import '../compound.libsonnet';
// A kite-shaped petal lying flat on y: from `d0` to `d1` out along angle `a` (degrees) from the centre, `w` wide at
// its widest, between heights y0 and y1.
local petal(id, slot, a, d0, d1, w, y0, y1) =
  local r = a * std.pi / 180, c = std.cos(r), s = std.sin(r), m = d0 + (d1 - d0) * 0.55;
  h.prism(id, slot, 'y', [
    [d0 * s, d0 * c],
    [m * s + w / 2 * c, m * c - w / 2 * s],
    [d1 * s, d1 * c],
    [m * s - w / 2 * c, m * c + w / 2 * s],
  ], y0, y1);
// A metal ingot, 120 by 70 mm at the foot and 30 mm high, drawn as six 5 mm layers that narrow by 2 mm a side as they
// rise, with a raised maker's rune on the top face.
local ingot(id, massKg, metal, rune) = h.compound(id, massKg, [
  h.box('layer-%d' % k, 'metal', [-0.06 + 0.002 * k, 0.005 * k, -0.035 + 0.002 * k], [0.06 - 0.002 * k, 0.005 * (k + 1), 0.035 - 0.002 * k])
  for k in std.range(0, 5)
] + [
  h.box('rune-stem', 'rune', [-0.003, 0.03, -0.014], [0.003, 0.0315, 0.014]),
  h.box('rune-bar-a', 'rune', [-0.014, 0.03, 0.004], [0.014, 0.0315, 0.009]),
  h.box('rune-bar-b', 'rune', [-0.010, 0.03, -0.012], [0.003, 0.0315, -0.007]),
], { metal: metal, rune: rune }) + { voxelGrain: 0.002 };
[
  // A furled white bloom on a short stem, 75 mm long and 14 mm across, lying along x: petals curled tight into a
  // rod around a pinch of yellow pollen that shows at the open tip.
  h.compound('kampuch', 0.0028, [
    h.rod('stem', 'stem', 0.002, -0.035, -0.004, 0.007),
    h.turned('sepal', 'stem', 'x', [[0, 0], [0, 0.0035], [0.006, 0.006], [0.008, 0]], [-0.006, 0.007, 0]),
    h.turned('bloom', 'petal', 'x', [[0, 0], [0, 0.005], [0.011, 0.007], [0.011, 0.0055], [0.022, 0.0072], [0.022, 0.0058], [0.034, 0.0068], [0.034, 0]], [0, 0.007, 0]),
    h.turned('lip', 'petal', 'x', [[0, 0.003], [0, 0.0045], [0.004, 0.007], [0.006, 0.007], [0.006, 0.003], [0, 0.003]], [0.034, 0.007, 0]),
    h.turned('pollen', 'pollen', 'x', [[0, 0], [0, 0.0035], [0.008, 0.0025], [0.009, 0]], [0.034, 0.007, 0]),
  ], { stem: 'leaf-green', petal: 'cloth-bright-white', pollen: 'cloth-yellow' }) + { voxelGrain: 0.002 },
  // A hand-sized sheaf, 110 mm long, lying along x: five dark leaves fanned at one end, a tangle of pale bitter roots
  // at the other, bound in the middle with a twine wrap.
  h.compound('olieribos', 0.015, [
    petal('leaf-%d' % k, 'leaf', -20 + 10 * k, 0.002, 0.06 - 0.004 * std.abs(k - 2), 0.016, 0.002 * (k % 2), 0.002 * (k % 2) + 0.002)
    for k in std.range(0, 4)
  ] + [
    h.rod('stalk-%d' % k, 'stalk', 0.002, -0.025, 0.004, 0.003) + { origin: [-0.025, 0.003, -0.006 + 0.004 * k] }
    for k in std.range(0, 3)
  ] + [
    h.prism('root-%d' % k, 'root', 'y', [[-0.003 + 0.003 * k, -0.025], [-0.002 + 0.003 * k, -0.025], [-0.012 + 0.009 * k, -0.05], [-0.013 + 0.009 * k, -0.05]], 0.001, 0.0035)
    for k in std.range(0, 3)
  ] + [
    h.turned('tie', 'tie', 'x', [[0, 0], [0, 0.0065], [0.008, 0.0065], [0.008, 0]], [-0.018, 0.0035, 0]),
  ], { leaf: 'plant-purple', stalk: 'plant-dried', root: 'bark-birch', tie: 'jute' }) + { voxelGrain: 0.002 },
  // A flower head 96 mm across on a stub of stem, lying face up: forty petals set in a golden-angle spiral that wind
  // inward and climb as they go, so each ring repeats the one outside it at a smaller scale, around a glowing heart.
  h.compound('platonic_flower', 0.048, [
    local f = 1 - i / 40;
    petal('petal-%d' % i, if i < 14 then 'outer' else if i < 28 then 'inner' else 'core', i * 137.508,
          0.002 + 0.006 * f, 0.008 + 0.040 * std.sqrt(f), 0.008 + 0.016 * std.sqrt(f), 0.012 + 0.012 * (1 - f), 0.015 + 0.014 * (1 - f))
    for i in std.range(0, 39)
  ] + [
    h.disc('heart', 'heart', 0.006, 0.02, 0.031),
    h.disc('cup', 'stem', 0.012, 0.004, 0.014),
    h.disc('stem', 'stem', 0.004, 0, 0.006),
  ], { outer: 'petal-pink', inner: 'plastic-pink', core: 'lycra-red', heart: 'crystal-glow-violet', stem: 'leaf-green' }) + { voxelGrain: 0.002 },
  // Blacksmith's ingots, 120 by 70 by 30 mm, of three odd metals.
  ingot('crimsonite_ingot', 1.6, 'metal-crimson', 'rust-red'),
  ingot('mithril_ingot', 0.9, 'mithril', 'mirror-silver'),
  ingot('orichalcum_ingot', 1.7, 'orichalcum', 'bronze'),
  // A round-bellied cauldron 360 mm high and 360 mm across the belly, raised on three clawed feet: a dull black body
  // dressed in glossy chitin bands, with a flared lip and a ring handle at each shoulder.
  h.compound('cauldron_demon_chitin', 12, [
    h.turned('body', 'body', 'y', [
      [0, 0], [0, 0.08], [0.03, 0.135], [0.09, 0.172], [0.15, 0.18], [0.21, 0.165], [0.26, 0.125], [0.29, 0.112],
      [0.30, 0.13], [0.31, 0.13], [0.31, 0.12], [0.30, 0.104], [0.26, 0.117], [0.21, 0.157], [0.15, 0.172], [0.09, 0.164],
      [0.03, 0.127], [0.008, 0.075], [0.008, 0],
    ], [0, 0.05, 0]),
    h.turned('band-a', 'chitin', 'y', [[0, 0.17], [0, 0.184], [0.025, 0.184], [0.025, 0.17], [0, 0.17]], [0, 0.18, 0]),
    h.turned('band-b', 'chitin', 'y', [[0, 0.14], [0, 0.153], [0.02, 0.15], [0.02, 0.135], [0, 0.14]], [0, 0.29, 0]),
    h.turned('band-c', 'chitin', 'y', [[0, 0.11], [0, 0.149], [0.02, 0.164], [0.02, 0.12], [0, 0.11]], [0, 0.08, 0]),
    h.turned('lip', 'chitin', 'y', [[0, 0.118], [0, 0.135], [0.012, 0.135], [0.012, 0.118], [0, 0.118]], [0, 0.35, 0]),
  ] + [
    local a = 2 * std.pi * k / 3;
    h.turned('foot-%d' % k, 'chitin', 'y', [[0, 0], [0, 0.005], [0.04, 0.016], [0.07, 0.02], [0.07, 0]], [0.11 * std.cos(a), 0, 0.11 * std.sin(a)])
    for k in std.range(0, 2)
  ] + [
    h.turned('handle-%d' % k, 'chitin', 'z', [[0, 0.022], [0, 0.034], [0.012, 0.034], [0.012, 0.022], [0, 0.022]], [(2 * k - 1) * 0.175, 0.28, -0.006])
    for k in std.range(0, 1)
  ], { body: 'void-black', chitin: 'chitin-black' }) + { voxelGrain: 0.004 },
  // A tall alchemist's stockpot, 300 mm across and 300 mm high under a domed lid with a knob, a loop handle each side
  // and a band of raised runes round its middle.
  h.compound('cauldron_orichalcum', 3.4, [
    h.turned('pot', 'pot', 'y', [[0, 0], [0, 0.145], [0.006, 0.15], [0.29, 0.15], [0.295, 0.155], [0.3, 0.155], [0.3, 0.147], [0.004, 0.147], [0.004, 0]]),
    h.dome('lid', 'pot', 0.153, 0.03, 0.002, 'y', [0, 0.3, 0]),
    h.turned('knob', 'pot', 'y', [[0, 0], [0, 0.008], [0.012, 0.008], [0.016, 0.018], [0.024, 0.018], [0.024, 0]], [0, 0.326, 0]),
    h.turned('rune-band', 'pot', 'y', [[0, 0.149], [0, 0.152], [0.006, 0.152], [0.006, 0.149], [0, 0.149]], [0, 0.11, 0]),
    h.turned('rune-band-b', 'pot', 'y', [[0, 0.149], [0, 0.152], [0.006, 0.152], [0.006, 0.149], [0, 0.149]], [0, 0.17, 0]),
  ] + [
    local a = 2 * std.pi * k / 12, c = std.cos(a), s = std.sin(a);
    h.prism('rune-%d' % k, 'rune', 'y', [
      [0.149 * s - 0.008 * c, 0.149 * c + 0.008 * s],
      [0.149 * s + 0.008 * c, 0.149 * c - 0.008 * s],
      [0.156 * s + 0.008 * c, 0.156 * c - 0.008 * s],
      [0.156 * s - 0.008 * c, 0.156 * c + 0.008 * s],
    ], 0.12 + 0.012 * (k % 2), 0.16 - 0.012 * ((k + 1) % 2))
    for k in std.range(0, 11)
  ] + std.flattenArrays([
    [
      h.box('handle-%d-top' % k, 'handle', [std.min(sx * 0.148, sx * 0.185), 0.25, -0.03], [std.max(sx * 0.148, sx * 0.185), 0.262, 0.03]),
      h.box('handle-%d-lip' % k, 'handle', [std.min(sx * 0.175, sx * 0.185), 0.232, -0.03], [std.max(sx * 0.175, sx * 0.185), 0.262, 0.03]),
    ]
    for k in [0, 1]
    for sx in [2 * k - 1]
  ]), { pot: 'orichalcum', rune: 'crystal-glow-blue', handle: 'bronze' }) + { voxelGrain: 0.004 },
]
