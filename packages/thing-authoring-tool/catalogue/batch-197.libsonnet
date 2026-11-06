local h = import '../compound.libsonnet';
local box = h.box;
// A ball of radius `r` turned about y, its centre at [x, y, z]; `squash` scales its height.
local ball(id, slot, r, x, y, z, squash=1, steps=8) =
  local pts = [
    local a = std.pi * i / steps;
    [r * squash * (1 - std.cos(a)), r * std.sin(a)]
    for i in std.range(0, steps)
  ];
  h.turned(id, slot, 'y', [[0, 0]] + pts[1:std.length(pts) - 1] + [[2 * r * squash, 0]], [x, y - r * squash, z]);
// One upright plate of the forge's shell, a sector of a ring from angle `a0` to `a1` (radians from +z towards +x),
// radii `r0` to `r1`, standing from `y0` to `y1`.
local shellPlate(id, slot, r0, r1, a0, a1, y0, y1) =
  local p(r, a) = [r * std.sin(a), r * std.cos(a)];
  h.prism(id, slot, 'y', [p(r0, a0), p(r1, a0), p(r1, a1), p(r0, a1)], y0, y1);
local plates = 8;
[
  // A squat round forge 300 mm across and 230 mm tall: a cast cement bowl clad in eight plates of black spider shell,
  // with a fire grate and a bed of coals inside, an air pipe out of its right side and two carry handles.
  h.compound('demon_forge', 11, [
    h.turned('bowl', 'cement', 'y', [[0, 0], [0, 0.125], [0.2, 0.125], [0.2, 0.095], [0.05, 0.085], [0.05, 0]], [0, 0.03, 0]),
    h.turned('rim', 'shell', 'y', [[0, 0.092], [0, 0.142], [0.014, 0.142], [0.014, 0.092], [0, 0.092]], [0, 0.23, 0]),
    h.turned('base', 'shell', 'y', [[0, 0], [0, 0.135], [0.03, 0.14], [0.03, 0]], [0, 0, 0]),
  ] + [
    local a = 2 * std.pi * i / plates;
    shellPlate('plate-%d' % i, 'shell', 0.124, 0.138, a + 0.06, a + 2 * std.pi / plates - 0.06, 0.03, 0.23)
    for i in std.range(0, plates - 1)
  ] + [
    local a = 2 * std.pi * i / plates;
    shellPlate('seam-%d' % i, 'seam', 0.124, 0.134, a - 0.06, a + 0.06, 0.03, 0.23)
    for i in std.range(0, plates - 1)
  ] + [
    box('grate-%d' % i, 'iron', [-0.088, 0.13, -0.06 + 0.03 * i - 0.004], [0.088, 0.138, -0.06 + 0.03 * i + 0.004])
    for i in std.range(0, 4)
  ] + [
    ball('coal-%d' % i, if i % 3 == 0 then 'ember' else 'coal', 0.018, c[0], 0.152, c[1], 0.7)
    for i in std.range(0, 7)
    for c in [[[-0.05, -0.03], [0.0, -0.05], [0.05, -0.02], [-0.03, 0.03], [0.03, 0.04], [0.0, 0.0], [0.06, 0.04], [-0.06, 0.02]][i]]
  ] + [
    h.tube('pipe', 'iron', 0.012, 0.02, 0.13, 0.22, 0.08, 0),
    h.tube('pipe-mouth', 'iron', 0.018, 0.03, 0.22, 0.235, 0.08, 0),
  ] + std.flattenArrays([
    local n = side[0], s = side[1];
    [
      box('handle-%s-a' % n, 'iron', [-0.05, 0.17, std.min(s * 0.134, s * 0.17)], [-0.042, 0.182, std.max(s * 0.134, s * 0.17)]),
      box('handle-%s-b' % n, 'iron', [0.042, 0.17, std.min(s * 0.134, s * 0.17)], [0.05, 0.182, std.max(s * 0.134, s * 0.17)]),
      box('handle-%s-grip' % n, 'iron', [-0.05, 0.17, (if s > 0 then 0.162 else -0.17)], [0.05, 0.182, (if s > 0 then 0.17 else -0.162)]),
    ]
    for side in [['front', 1], ['back', -1]]
  ]) + [
    box('rune-%d' % i, 'rune', [-0.03 + 0.024 * i, 0.12 + 0.02 * (i % 2), 0.1375], [-0.022 + 0.024 * i, 0.15 + 0.02 * (i % 2), 0.141])
    for i in [0, 1, 2]
  ], {
    cement: 'stone-grey',
    shell: 'chitin-black',
    seam: 'lacquer-red',
    iron: 'iron-dull',
    coal: 'plastic-charcoal',
    ember: 'glow-flame',
    rune: 'crystal-glow-blue',
  }) + { handling: h.gripOn('demon_forge', 'handle-front-grip') } + { voxelGrain: 0.004 },

  // A stiff paper sack 110 mm wide, 70 mm deep and 190 mm tall, its top rolled down twice over about a litre of grey
  // mortar, with a red band round its middle printed with a pale blue rune.
  h.compound('fireproof_mortar', 2, [
    box('sack', 'paper', [-0.055, 0, -0.035], [0.055, 0.16, 0.035]),
    box('base-fold', 'paper', [-0.057, 0, -0.037], [0.057, 0.012, 0.037]),
    box('roll-a', 'paper', [-0.056, 0.16, -0.02], [0.056, 0.176, 0.02]),
    box('roll-b', 'paper', [-0.056, 0.172, -0.012], [0.056, 0.19, 0.016]),
    box('band', 'band', [-0.0555, 0.06, -0.0355], [0.0555, 0.11, 0.0355]),
    box('rune-stem', 'rune', [-0.003, 0.068, 0.0355], [0.003, 0.102, 0.038]),
    box('rune-bar', 'rune', [-0.014, 0.082, 0.0355], [0.014, 0.088, 0.038]),
    box('rune-hook', 'rune', [0.008, 0.088, 0.0355], [0.014, 0.1, 0.038]),
    box('spill', 'mortar', [-0.03, 0.19, -0.008], [0.02, 0.193, 0.01]),
  ], { paper: 'paper-butcher', band: 'cloth-crimson', rune: 'crystal-glow-blue', mortar: 'stone-grey' }) + h.inHand('fireproof_mortar', 'sack') + { voxelGrain: 0.004 },

  // A loose cluster of crimped wool about 150 mm long, 90 mm wide and 70 mm high, pale and faintly shimmering, its
  // locks ending in lighter tips.
  h.compound('parabolan_wool_staple', 0.01, [
    ball('tuft-%d' % i, 'wool', t[3], t[0], t[1], t[2], 0.8)
    for i in std.range(0, 7)
    for t in [[[-0.045, 0.03, 0.0, 0.03], [-0.005, 0.034, 0.008, 0.034], [0.04, 0.03, -0.005, 0.03], [0.02, 0.05, 0.02, 0.022], [-0.03, 0.05, -0.02, 0.022], [0.06, 0.022, 0.02, 0.02], [-0.06, 0.022, 0.025, 0.018], [0.0, 0.026, -0.03, 0.022]][i]]
  ] + [
    ball('tip-%d' % i, 'tip', 0.013, t[0], t[1], t[2], 0.8)
    for i in std.range(0, 5)
    for t in [[[-0.075, 0.03, -0.005], [0.072, 0.028, 0.0], [0.03, 0.068, 0.012], [-0.025, 0.07, -0.01], [0.005, 0.02, 0.045], [-0.05, 0.016, 0.042]][i]]
  ], { wool: 'fur-pale', tip: 'feather-white' }) + h.inHand('parabolan_wool_staple', 'tuft-1') + { voxelGrain: 0.004 },
]
