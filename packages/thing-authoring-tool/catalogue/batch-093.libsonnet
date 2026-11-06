local h = import '../compound.libsonnet';
local box = h.box;
// A curved plate lying along x from x0 to x1, its crown up and its long edges on the floor: an arc of inner radius
// `r` and thickness `t` that spans `a` degrees either side of the top round an axis at height y and depth z, built
// from `n` flat facets because a prism must be convex.
local arc(id, slot, r, t, a, x0, x1, z, n=8, y=null) =
  local rad = a * std.pi / 180, yc = if y == null then -r * std.cos(rad) else y;
  [
    local th0 = -rad + 2 * rad * i / n, th1 = -rad + 2 * rad * (i + 1) / n;
    h.prism('%s-%d' % [id, i], slot, 'x', [
      [yc + r * std.cos(th0), z + r * std.sin(th0)],
      [yc + r * std.cos(th1), z + r * std.sin(th1)],
      [yc + (r + t) * std.cos(th1), z + (r + t) * std.sin(th1)],
      [yc + (r + t) * std.cos(th0), z + (r + t) * std.sin(th0)],
    ], x0, x1)
    for i in std.range(0, n - 1)
  ];
// A sleeve laid flat along x, `l` long from its shoulder at -x (w0 across) to its cuff at +x (w1 across), `t` thick
// from height y, centred on depth z.
local flatSleeve(id, slot, l, w0, w1, t, z, y=0) = [
  h.prism(id, slot, 'y', [[z - w0 / 2, -l / 2], [z + w0 / 2, -l / 2], [z + w1 / 2, l / 2], [z - w1 / 2, l / 2]], y, y + t),
];
// The part of a flat sleeve's outline between x0 and x1, inset by `m` at each edge, standing `t` proud from height y.
local sleevePatch(id, slot, l, w0, w1, x0, x1, m, y, t, z) =
  local w(x) = (w0 + (w1 - w0) * (x + l / 2) / l) / 2 - m;
  h.prism(id, slot, 'y', [[z - w(x0), x0], [z + w(x0), x0], [z + w(x1), x1], [z - w(x1), x1]], y, y + t);
// Rows of ridges across a flat sleeve: strips `w` wide every `pitch` along x, standing `t` proud.
local ridges(id, slot, l, w0, w1, y, z, pitch, w, t) =
  local n = std.floor(l / pitch);
  [
    local x = -l / 2 + pitch * (i + 0.5), half = (w0 + (w1 - w0) * (x + l / 2) / l) / 2 - 0.006;
    box('%s-%d' % [id, i], slot, [x - w / 2, y, z - half], [x + w / 2, y + t, z + half])
    for i in std.range(0, n - 1)
  ];
// Rows of PALS webbing across a flat panel facing up: strips 25 mm wide along x from x0 to x1, one every 38 mm
// along z from z0 for `rows` rows, lying on height y.
local pals(id, x0, x1, y, z0, rows) = [
  box('%s-%d' % [id, i], 'pals', [x0, y, z0 + i * 0.038], [x1, y + 0.003, z0 + i * 0.038 + 0.025])
  for i in std.range(0, rows - 1)
];
// A plate carrier lying flat, front up, neck towards -z. The back panel lies under the front; shoulder straps join
// them over the neck opening; a cummerbund wing spreads to each side. `w` and `l` size the front panel, `wing` the
// reach of each cummerbund, `rows` the PALS rows down the front and `sidePlates` adds a plate pocket to each wing.
// Slots: cloth, pocket, pals, trim.
local carrier(w, l, wing, rows, sidePlates) =
  local zn = -l / 2, zh = l / 2, ys = 0.024, yf = 0.05;
  [
    box('back', 'cloth', [-w / 2 - 0.01, 0, zn + 0.06], [w / 2 + 0.01, ys, zh]),
    box('front', 'cloth', [-w / 2, ys, zn + 0.08], [w / 2, yf, zh - 0.01]),
    box('plate', 'pocket', [-w / 2 + 0.03, yf, zn + 0.1], [w / 2 - 0.03, yf + 0.008, zh - 0.04]),
  ] + [
    box('wing-%d' % i, 'cloth', [if s < 0 then -w / 2 - wing else w / 2, 0.006, -0.02], [if s < 0 then -w / 2 else w / 2 + wing, 0.018, zh - 0.04])
    for i in [0, 1]
    for s in [[-1, 1][i]]
  ] + std.flattenArrays([
    pals('wing-pals-%d' % i, if s < 0 then -w / 2 - wing + 0.02 else w / 2 + 0.02, if s < 0 then -w / 2 - 0.02 else w / 2 + wing - 0.02, if sidePlates then 0.03 else 0.018, 0.0, 3)
    for i in [0, 1]
    for s in [[-1, 1][i]]
  ]) + (
    if sidePlates then [
      box('side-plate-%d' % i, 'pocket', [if s < 0 then -w / 2 - wing * 0.8 else w / 2 + wing * 0.2, 0.018, 0.005], [if s < 0 then -w / 2 - wing * 0.2 else w / 2 + wing * 0.8, 0.03, zh - 0.06])
      for i in [0, 1]
      for s in [[-1, 1][i]]
    ] else []
  ) + pals('front-pals', -w / 2 + 0.035, w / 2 - 0.035, yf + 0.008, zh - 0.04 - rows * 0.038, rows) + [
    box('handle', 'trim', [-0.05, ys, zn + 0.035], [0.05, ys + 0.012, zn + 0.06]),
  ];
// A shoulder strap pad lying over the neck opening at x, from the back panel's top edge to the front's.
local strap(id, x, l) = box(id, 'pad', [x - 0.035, 0, -l / 2 - 0.05], [x + 0.035, 0.058, -l / 2 + 0.1]);
[
  // A pair of medium steel mail sleeves laid flat side by side, 560 mm long, 170 mm across at the shoulder and
  // 110 mm at the wrist, ridged where the rows of rings lie, joined at the shoulders by a leather strap.
  h.compound('mc_chainmail_arms', 4.5, std.flattenArrays([
    flatSleeve('sleeve-%d' % s, 'mail', 0.56, 0.17, 0.11, 0.008, s * 0.1)
    + ridges('rings-%d' % s, 'mail', 0.56, 0.17, 0.11, 0.008, s * 0.1, 0.012, 0.006, 0.004)
    + [h.prism('cuff-%d' % s, 'mail', 'y', [[s * 0.1 - 0.058, 0.25], [s * 0.1 + 0.058, 0.25], [s * 0.1 + 0.055, 0.28], [s * 0.1 - 0.055, 0.28]], 0, 0.014)]
    for s in [-1, 1]
  ]) + [
    box('strap', 'strap', [-0.27, 0.008, -0.13], [-0.24, 0.012, 0.13]),
    box('strap-buckle', 'buckle', [-0.272, 0.008, -0.01], [-0.238, 0.016, 0.01]),
  ], { mail: 'steel-grey', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of sleeves cut from a heavy cotton shirt, laid flat side by side, 560 mm long, 180 mm across at the
  // shoulder and 120 mm at the cuff, each with a leather panel stitched over the upper arm and one over the forearm,
  // bare cloth left at the elbow, and a cord tying the two together at the shoulders.
  h.compound('survivor_adhoc_leather_sleeves', 0.4, std.flattenArrays([
    flatSleeve('sleeve-%d' % s, 'cloth', 0.56, 0.18, 0.12, 0.01, s * 0.105)
    + [
      sleevePatch('upper-%d' % s, 'leather', 0.56, 0.18, 0.12, -0.26, -0.05, 0.012, 0.01, 0.005, s * 0.105),
      sleevePatch('fore-%d' % s, 'leather', 0.56, 0.18, 0.12, 0.04, 0.25, 0.01, 0.01, 0.005, s * 0.105),
    ] + [
      sleevePatch('stitch-%d-%d' % [s, i], 'stitch', 0.56, 0.18, 0.12, x, x + 0.004, 0.016, 0.015, 0.002, s * 0.105)
      for i in std.range(0, 3)
      for x in [[-0.255, -0.06, 0.045, 0.24][i]]
    ] + [
      box('cuff-%d' % s, 'cloth', [0.265, 0.01, s * 0.105 - 0.058], [0.28, 0.014, s * 0.105 + 0.058]),
    ]
    for s in [-1, 1]
  ]) + [
    box('cord', 'stitch', [-0.29, 0.01, -0.14], [-0.282, 0.016, 0.14]),
    box('cord-end-a', 'stitch', [-0.33, 0.0, -0.01], [-0.282, 0.005, -0.004]),
    box('cord-end-b', 'stitch', [-0.32, 0.0, 0.004], [-0.282, 0.005, 0.01]),
  ], { cloth: 'cloth-canvas', leather: 'leather-brown', stitch: 'skin-rawhide' })
  + { voxelGrain: 0.004 },

  // A pair of light leather archery vambraces laid side by side, crown up: each a stiff curved guard 220 mm long
  // round an 45 mm radius, with a rolled edge at the wrist and three buckled straps trailing to one side.
  h.compound('vambrace_larmor', 0.2, std.flattenArrays([
    arc('guard-%d' % s, 'leather', 0.045, 0.004, 70, -0.11, 0.11, s * 0.09)
    + arc('wrist-%d' % s, 'edge', 0.045, 0.007, 70, 0.1, 0.11, s * 0.09, 8, -0.045 * std.cos(70 * std.pi / 180))
    + arc('elbow-%d' % s, 'edge', 0.045, 0.007, 70, -0.11, -0.1, s * 0.09, 8, -0.045 * std.cos(70 * std.pi / 180))
    + std.flattenArrays([
      arc('strap-%d-%d' % [s, i], 'strap', 0.049, 0.002, 70, x, x + 0.016, s * 0.09, 8, -0.045 * std.cos(70 * std.pi / 180)) + [
        box('tail-%d-%d' % [s, i], 'strap', [x, 0, s * 0.09 + 0.042], [x + 0.016, 0.003, s * 0.09 + 0.075]),
        box('buckle-%d-%d' % [s, i], 'buckle', [x - 0.002, 0, s * 0.09 + 0.042], [x + 0.018, 0.006, s * 0.09 + 0.052]),
      ]
      for i in std.range(0, 2)
      for x in [-0.085 + i * 0.07]
    ])
    for s in [-1, 1]
  ]), { leather: 'leather-brown', edge: 'leather-black', strap: 'leather-black', buckle: 'brass' })
  + { voxelGrain: 0.004 },

  // A plate carrier lying flat, front up: a front panel 360 mm wide and 460 mm long over the back panel, a plate
  // pocket bulging under five rows of PALS webbing, padded shoulder straps over the neck opening, a drag handle on
  // the back's collar and a cummerbund wing 140 mm wide on each side carrying a side plate pocket.
  h.compound('ballistic_vest_esapi', 2.3, carrier(0.36, 0.46, 0.14, 5, true) + [
    strap('strap-l', -0.11, 0.46),
    strap('strap-r', 0.11, 0.46),
  ], { cloth: 'nylon-coyote', pocket: 'nylon-coyote', pals: 'webbing-olive-dark', pad: 'nylon-coyote', trim: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A heavy plate carrier lying flat, front up: a front panel 380 mm wide and 480 mm long over the back panel, its
  // plate pocket under six rows of PALS webbing, a raised collar round the neck opening, a red quick-release tab at
  // the chest, side plate pockets on wide cummerbund wings and a lower back guard hanging out below the hem.
  h.compound('ballistic_vest_heavy', 3, carrier(0.38, 0.48, 0.15, 6, true) + [
    strap('strap-l', -0.12, 0.48),
    strap('strap-r', 0.12, 0.48),
    box('collar-back', 'pad', [-0.16, 0.0, -0.33], [0.16, 0.07, -0.29]),
    box('collar-l', 'pad', [-0.16, 0.0, -0.33], [-0.12, 0.07, -0.13]),
    box('collar-r', 'pad', [0.12, 0.0, -0.33], [0.16, 0.07, -0.13]),
    box('lower-back', 'cloth', [-0.15, 0.0, 0.24], [0.15, 0.02, 0.36]),
    box('lower-back-hem', 'trim', [-0.15, 0.0, 0.352], [0.15, 0.022, 0.36]),
    box('release', 'release', [-0.025, 0.061, -0.11], [0.025, 0.07, -0.085]),
    box('release-cable', 'trim', [-0.004, 0.058, -0.17], [0.004, 0.064, -0.11]),
  ], { cloth: 'cloth-olive-drab', pocket: 'cloth-olive-drab', pals: 'webbing-olive-dark', pad: 'cloth-olive-drab', trim: 'plastic-matte-black', release: 'plastic-red' })
  + { voxelGrain: 0.004 },

  // A light plate carrier lying flat, front up: a front panel 280 mm wide and 340 mm long over the back panel, with
  // three rows of PALS webbing, thin shoulder straps, and an elastic cummerbund wing on each side with two rifle
  // magazines' worth of tall pockets.
  h.compound('ballistic_vest_light', 1.5, carrier(0.28, 0.34, 0.12, 3, false) + [
    strap('strap-l', -0.08, 0.34),
    strap('strap-r', 0.08, 0.34),
  ] + [
    box('mag-%d-%d' % [i, k], 'mag', [x - 0.016, 0.018, 0.0], [x + 0.016, 0.05, 0.12])
    for i in [0, 1]
    for k in [0, 1]
    for x in [[[-0.14 - 0.03, -0.14 - 0.075], [0.14 + 0.03, 0.14 + 0.075]][i][k]]
  ], { cloth: 'cloth-black', pocket: 'cloth-black', pals: 'webbing-black', pad: 'cloth-black', trim: 'plastic-charcoal', mag: 'webbing-black' })
  + { voxelGrain: 0.004 },

  // The same light plate carrier, 280 mm wide and 340 mm long, with plain cummerbund wings, a radio pouch 70 mm
  // wide and 130 mm tall standing on its left shoulder strap and a small steel hook on the chest for a glow stick.
  h.compound('ballistic_vest_light_operator', 1.5, carrier(0.28, 0.34, 0.12, 3, false) + [
    strap('strap-l', -0.08, 0.34),
    strap('strap-r', 0.08, 0.34),
    box('radio', 'pouch', [-0.115, 0.058, -0.24], [-0.045, 0.1, -0.11]),
    box('radio-flap', 'flap', [-0.117, 0.1, -0.242], [-0.043, 0.104, -0.19]),
    box('radio-antenna', 'trim', [-0.105, 0.1, -0.24], [-0.099, 0.106, -0.24 + 0.05]),
    box('hook-base', 'hook', [0.04, 0.058, -0.06], [0.052, 0.062, -0.04]),
    box('hook-post', 'hook', [0.043, 0.062, -0.05], [0.049, 0.078, -0.044]),
    box('hook-tip', 'hook', [0.043, 0.074, -0.065], [0.049, 0.078, -0.05]),
  ], { cloth: 'nylon-coyote', pocket: 'nylon-coyote', pals: 'webbing-olive-dark', pad: 'nylon-coyote', trim: 'plastic-matte-black', pouch: 'webbing-olive-dark', flap: 'nylon-coyote', hook: 'steel' })
  + { voxelGrain: 0.004 },
]
