local h = import '../compound.libsonnet';
local box = h.box;
// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);
local zx(poly) = [[p[1], p[0]] for p in poly];
// A flat convex outline of [x, z] points lying on y from y0 to y1.
local flat(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', zx(pts), y0, y1);

// One glove lying back up on y = 0, fingers towards +z, thumb out to side s (-1 left, +1 right), centred on cx. The
// palm runs from z = 0 to l, the cuff from -cuffLen back to the wrist, widening to cuffW1. Slots: hand, cuff.
local gloveDefaults = { w: 0.09, l: 0.1, t: 0.022, fl: 1, ft: 0.017, cuffLen: 0.05, cuffW1: null, cuffT: 0.024 };
// Finger i counts from the index finger on the thumb side: its centre across the hand, length and width.
local finger(o, i) = { v: (1.5 - i) * o.w * 0.245, len: [0.078, 0.088, 0.082, 0.066][i] * o.fl, fw: o.w * 0.19 };
local glove(p, cx, s, opts) =
  local o = gloveDefaults + opts;
  local x(v) = cx + s * v;
  local w = o.w, l = o.l, k = o.w / 0.09;
  local w1 = if o.cuffW1 == null then w * 1.1 else o.cuffW1;
  [
    sbox(p + 'palm', 'hand', [x(-w / 2), 0, 0], [x(w / 2), o.t, l]),
    h.prism(p + 'cuff', 'cuff', 'y', [[-o.cuffLen, x(-w1 / 2)], [-o.cuffLen, x(w1 / 2)], [0.005, x(w / 2)], [0.005, x(-w / 2)]], 0, o.cuffT),
    h.prism(p + 'thumb', 'hand', 'y', [[pt[0], x(pt[1] * k)] for pt in [[0, 0.04], [0.035, 0.045], [0.09, 0.083], [0.076, 0.097], [0.012, 0.06]]], 0, o.ft),
  ] + [
    local f = finger(o, i);
    sbox(p + 'finger-%d' % i, 'hand', [x(f.v - f.fw / 2), 0, l - 0.002], [x(f.v + f.fw / 2), o.ft, l + f.len])
    for i in std.range(0, 3)
  ];
// Both gloves of a pair, thumbs out, `gap` either side of x = 0, with `extra(p, cx, s)` adding each glove's details.
local pair(opts, extra, gap) = std.flattenArrays([
  glove(ps[0], ps[1] * gap, ps[1], opts) + extra(ps[0], ps[1] * gap, ps[1])
  for ps in [['l-', -1], ['r-', 1]]
]);

// A red holiday glove: a plain cotton glove with a thick roll of white faux fur round the cuff. Slots: hand, cuff, fur.
local santaOpts = { w: 0.092, t: 0.02, ft: 0.016, cuffLen: 0.07, cuffW1: 0.12, cuffT: 0.02 };
local santa(p, cx, s) = [
  h.prism(p + 'fur', 'fur', 'y', [[-0.075, cx - 0.072], [-0.075, cx + 0.072], [-0.025, cx + 0.07], [-0.025, cx - 0.07]], 0, 0.03),
  h.prism(p + 'fur-top', 'fur', 'y', [[-0.07, cx - 0.066], [-0.07, cx + 0.066], [-0.03, cx + 0.064], [-0.03, cx - 0.064]], 0.03, 0.036),
];

// An army winter glove: a padded olive glove quilted across the back in raised channels, with a padded gauntlet cuff
// closed by a drawcord and toggle. Slots: hand, cuff, quilt, cord, toggle.
local armyOpts = { w: 0.1, t: 0.028, ft: 0.022, fl: 1.02, cuffLen: 0.1, cuffW1: 0.14, cuffT: 0.026 };
local army(p, cx, s) =
  local x(v) = cx + s * v;
  [
    sbox(p + 'quilt-%d' % i, 'quilt', [cx - 0.048, 0.028, 0.008 + i * 0.022], [cx + 0.048, 0.032, 0.012 + i * 0.022])
    for i in std.range(0, 3)
  ] + [
    local f = finger(gloveDefaults + armyOpts, i);
    sbox(p + 'finger-quilt-%d-%d' % [i, j], 'quilt', [x(f.v - f.fw / 2 + 0.001), 0.022, 0.12 + j * 0.026], [x(f.v + f.fw / 2 - 0.001), 0.025, 0.123 + j * 0.026])
    for i in std.range(0, 3)
    for j in std.range(0, std.floor((finger(gloveDefaults + armyOpts, i).len - 0.03) / 0.026))
  ] + [
    h.prism(p + 'hem', 'quilt', 'y', [[-0.1, cx - 0.07], [-0.1, cx + 0.07], [-0.088, cx + 0.068], [-0.088, cx - 0.068]], 0, 0.03),
    sbox(p + 'cord', 'cord', [cx - 0.07, 0.026, -0.095], [x(0.09), 0.03, -0.091]),
    sbox(p + 'toggle', 'toggle', [x(0.078), 0.024, -0.1], [x(0.09), 0.034, -0.086]),
    sbox(p + 'cord-tail', 'cord', [x(0.086), 0.024, -0.12], [x(0.09), 0.028, -0.1]),
    sbox(p + 'wrist-seam', 'quilt', [cx - 0.052, 0.024, -0.006], [cx + 0.052, 0.03, 0.004]),
  ];

// A long knit sleeve for a tentacle laid flat, cuff towards -z: a tube tapering from the open cuff to a closed, rounded
// tip, with knitted bands round it every so often. Slots: tube, cuff, band.
local tentacleSleeve(p, cx) =
  local t = 0.012, len = 0.74;
  local half(z) = 0.062 - 0.034 * (z / len);
  [
    flat(p + 'tube', 'tube', [[cx - half(0), 0], [cx + half(0), 0], [cx + half(len - 0.04), len - 0.04], [cx - half(len - 0.04), len - 0.04]], 0, t),
    flat(p + 'tip', 'tube', [[cx - half(len - 0.04), len - 0.041], [cx + half(len - 0.04), len - 0.041], [cx + 0.016, len - 0.012], [cx, len], [cx - 0.016, len - 0.012]], 0, t),
    flat(p + 'cuff', 'cuff', [[cx - half(0) - 0.002, 0], [cx + half(0) + 0.002, 0], [cx + half(0.06) + 0.002, 0.06], [cx - half(0.06) - 0.002, 0.06]], 0, t + 0.002),
  ] + [
    sbox(p + 'rib-%d' % i, 'tube', [cx - half(0) + 0.006 + i * 0.012, t + 0.002, 0.004], [cx - half(0) + 0.01 + i * 0.012, t + 0.004, 0.056])
    for i in std.range(0, 9)
  ] + [
    local z = 0.14 + i * 0.13;
    flat(p + 'band-%d' % i, 'band', [[cx - half(z) - 0.001, z], [cx + half(z) + 0.001, z], [cx + half(z + 0.03) + 0.001, z + 0.03], [cx - half(z + 0.03) - 0.001, z + 0.03]], 0, t + 0.002)
    for i in std.range(0, 3)
  ];

// A cowboy hat's brim curling up at the side sx (-1 or +1): wall segments following the brim's edge from radius r0 to
// r1, highest at the side and falling away towards front and back. Slot: felt.
local brimCurl(p, sx, r0, r1) =
  local n = 10, span = 60;
  [
    local a0 = (-span + 2 * span * i / n) * std.pi / 180, a1 = (-span + 2 * span * (i + 1) / n) * std.pi / 180;
    local am = (a0 + a1) / 2;
    local pt(r, a) = [sx * r * std.cos(a), r * std.sin(a)];
    flat('%s-%d' % [p, i], 'felt', [pt(r0, a0), pt(r1, a0), pt(r1, a1), pt(r0, a1)], 0.02, 0.036 + 0.04 * std.cos(am * 90 / span))
    for i in std.range(0, n - 1)
  ];

[
  // A pair of holiday gloves laid flat side by side, backs up, each 250 mm from fur cuff to fingertip and 92 mm across
  // the knuckles: bright red cotton with a thick roll of white faux fur round each cuff.
  h.compound('santa_gloves', 0.08, pair(santaOpts, santa, 0.082), { hand: 'cloth-red', cuff: 'cloth-red', fur: 'fur-pale' })
  + { voxelGrain: 0.004 },

  // A pair of padded army winter gloves laid flat side by side, backs up, each 300 mm from cuff to fingertip and
  // 100 mm across the knuckles: olive cotton quilted in channels over the back and fingers, with a gauntlet cuff
  // drawn in by a cord and toggle.
  h.compound('winter_gloves_army', 0.21, pair(armyOpts, army, 0.088), { hand: 'cloth-olive-drab', cuff: 'cloth-olive-drab', quilt: 'webbing-olive-dark', cord: 'plastic-matte-black', toggle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A pair of knitted cotton sleeves laid flat side by side, each 740 mm long, 124 mm wide at the ribbed cuff and
  // tapering to a closed, rounded tip, with knitted bands round them.
  h.compound('stockings_tent_arms', 0.15, tentacleSleeve('l-', -0.075) + tentacleSleeve('r-', 0.075), { tube: 'cloth-green', cuff: 'cloth-cream', band: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A ten-gallon hat standing on its brim: 440 mm across the brim, which curls up at the sides, and 190 mm tall to a
  // high crown with a crease down its top, wound with a dark band above the brim.
  h.compound('ten_gallon_hat', 0.5, [
    h.turned('brim', 'felt', 'y', [[0, 0], [0, 0.15], [0.012, 0.19], [0.03, 0.22], [0.036, 0.22], [0.02, 0.19], [0.008, 0.15], [0.008, 0]]),
    h.turned('crown', 'felt', 'y', [[0, 0], [0, 0.085], [0.06, 0.088], [0.13, 0.082], [0.145, 0.072], [0.152, 0.05], [0.152, 0]], [0, 0.008, 0]),
    h.turned('band', 'band', 'y', [[0, 0], [0, 0.0875], [0.03, 0.0875], [0.03, 0]], [0, 0.008, 0]),
    box('buckle', 'buckle', [0.08, 0.016, -0.012], [0.092, 0.03, 0.012]),
    h.turned('lobe-l', 'felt', 'z', [[0, 0], [0, 0.022], [0.03, 0.028], [0.11, 0.026], [0.14, 0.014], [0.14, 0]], [-0.034, 0.15, -0.072]),
    h.turned('lobe-r', 'felt', 'z', [[0, 0], [0, 0.022], [0.03, 0.028], [0.11, 0.026], [0.14, 0.014], [0.14, 0]], [0.034, 0.15, -0.072]),
  ] + brimCurl('curl-l', -1, 0.208, 0.224) + brimCurl('curl-r', 1, 0.208, 0.224), { felt: 'cloth-brown', band: 'leather-black', buckle: 'metal-silver' })
  + { voxelGrain: 0.004 },

  // A cotton bandana folded once corner to corner and laid flat: a triangle 540 mm along its fold and 270 mm deep,
  // red with a white border and a scatter of white print.
  h.compound('bandana_head', 0.052, [
    flat('cloth', 'cloth', [[-0.27, 0], [0.27, 0], [0, 0.27]], 0, 0.004),
    flat('border-a', 'print', [[-0.27, 0], [0.27, 0], [0.246, 0.014], [-0.246, 0.014]], 0.004, 0.006),
    flat('border-b', 'print', [[-0.27, 0], [-0.246, 0.014], [0, 0.25], [0, 0.27]], 0.004, 0.006),
    flat('border-c', 'print', [[0.27, 0], [0, 0.27], [0, 0.25], [0.246, 0.014]], 0.004, 0.006),
  ] + [
    local x = -0.18 + i * 0.045 + (j % 2) * 0.022, z = 0.03 + j * 0.04;
    h.disc('dot-%d-%d' % [i, j], 'print', 0.006, 0.004, 0.006, x, z)
    for j in std.range(0, 4)
    for i in std.range(0, 8)
    if std.abs(-0.18 + i * 0.045 + (j % 2) * 0.022) < 0.23 - (0.03 + j * 0.04)
  ], { cloth: 'cloth-red', print: 'cloth-bright-white' })
  + { voxelGrain: 0.002 },

  // A beret standing on its band: a soft round crown 270 mm across and 60 mm tall, swelling past a narrow leather
  // headband, with a short stalk at the centre of its top.
  h.compound('beret', 0.21, [
    h.turned('band', 'band', 'y', [[0, 0], [0, 0.093], [0.014, 0.093], [0.014, 0]]),
    h.turned('crown', 'cloth', 'y', [[0, 0], [0, 0.11], [0.012, 0.13], [0.024, 0.135], [0.034, 0.128], [0.042, 0.1], [0.046, 0.05], [0.046, 0]], [0.016, 0.012, 0]),
    h.disc('stalk', 'cloth', 0.004, 0.056, 0.066, 0.016),
  ], { cloth: 'cloth-navy', band: 'leather-black' })
  + { voxelGrain: 0.002 },
]
