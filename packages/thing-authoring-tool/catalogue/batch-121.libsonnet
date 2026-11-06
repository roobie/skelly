local h = import '../compound.libsonnet';
local box = h.box;

// Gambesons and their padded companions, as found on a shelf: coats, vests and trousers folded on h.foldedGarment,
// `w` across x and `d` along z with the collar or waistband at the +z end (front) and the hem folded under at -z;
// mittens laid flat as a pair; the coif standing upright. Thick quilting shows as rows of half-sunk rolls.

// A flat convex outline of [x, z] points lying on a top face from y to y + t.
local flat(id, slot, pts, y, t=0.004) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y, y + t);

// A strip `w` wide lying on a top face at y, from [xa, za] to [xb, zb].
local strip(id, slot, a, b, y, w=0.012, t=0.004) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  flat(id, slot, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], y, t);

// Quilted channels: rolls of radius r running along z from z0 to z1, one every `pitch` from x0 to x1, sunk into a
// top face at y so each stands r * 0.6 proud.
local ribs(prefix, slot, x0, x1, pitch, z0, z1, y, r) =
  local n = std.floor((x1 - x0) / pitch + 1e-6);
  local off = (x1 - x0 - n * pitch) / 2;
  [
    h.turned('%s-%d' % [prefix, i], slot, 'z', [[0, 0], [0, r], [z1 - z0, r], [z1 - z0, 0]], [x0 + off + i * pitch, y - r * 0.4, z0])
    for i in std.range(0, n)
  ];

// A stand collar round the neck at (0, cz), open towards the hem.
local collar(prefix, slot, r, wd, y, ht, cz, gap=40) = h.crescent(prefix, slot, r, r + wd, -180 + gap, 180 - gap, 12, y, y + ht, 0, cz);

// Round buttons or toggles at x along each z in zs, on a face at y.
local buttons(prefix, slot, x, zs, y, r=0.007, t=0.005) = [
  h.disc('%s-%d' % [prefix, i], slot, r, y, y + t, x, zs[i])
  for i in std.range(0, std.length(zs) - 1)
];

// A sleeve folded down one side of a coat bundle at x: a quilted roll of radius r from the shoulder seam to the
// cuff at the hem end, ringed with stitched channels and bound at the cuff.
local sleeve(p, x, r, z0, z1, y) =
  local len = z1 - z0;
  [h.turned(p + 'roll', 'sleeve', 'z', [[0, 0], [0, r * 0.85], [0.01, r], [len, r], [len, 0]], [x, y, z0])]
  + [
    h.turned('%sring-%d' % [p, i], 'stitch', 'z', [[0, 0], [0, r + 0.002], [0.004, r + 0.002], [0.004, 0]], [x, y, z0 + 0.03 + i * 0.045])
    for i in std.range(0, std.floor((len - 0.05) / 0.045))
  ]
  + [h.turned(p + 'cuff', 'binding', 'z', [[0, 0], [0, r + 0.003], [0.016, r + 0.003], [0.016, 0]], [x, y, z0])];

// A long quilted gambeson folded in four: channel quilting down the body, a stand collar, toggles down the front
// opening and the sleeves folded along both sides, `sr` thick. Slots: cloth, quilt, sleeve, stitch, binding, toggle.
local coat(id, mass, sr, fin) =
  local w = 0.42, d = 0.38, ht = 0.1, cz = d / 2 - 0.075;
  local inner = w / 2 - 2 * sr - 0.006;
  h.compound(id, mass, h.foldedGarment(w, d, ht, 4)
                       + ribs('quilt', 'quilt', -inner, inner, 0.034, -d / 2, cz - 0.05, ht, 0.01)
                       + collar('collar', 'binding', 0.06, 0.03, ht, 0.03, cz)
                       + [box('placket', 'binding', [-0.016, ht, -d / 2], [0.016, ht + 0.01, cz - 0.055])]
                       + buttons('toggle', 'toggle', 0, [cz - 0.085, cz - 0.15, cz - 0.215, cz - 0.28], ht + 0.01, 0.008)
                       + sleeve('sleeve-l-', -w / 2 + sr + 0.004, sr, -d / 2 + 0.01, d / 2 - 0.04, ht)
                       + sleeve('sleeve-r-', w / 2 - sr - 0.004, sr, -d / 2 + 0.01, d / 2 - 0.04, ht), fin)
  + { voxelGrain: 0.004 };

// A sleeveless gambeson folded in four: channel quilting, a stand collar, a toggled front and bound armholes cut
// into both sides at the shoulders. Slots: cloth, quilt, stitch, binding, toggle, hole.
local surcoat(id, mass, fin) =
  local w = 0.4, d = 0.36, ht = 0.09, cz = d / 2 - 0.07, az = d / 2 - 0.1, ar = 0.06;
  h.compound(id, mass, h.foldedGarment(w, d, ht, 4)
                       + ribs('quilt', 'quilt', -w / 2 + ar + 0.015, w / 2 - ar - 0.015, 0.034, -d / 2, cz - 0.05, ht, 0.01)
                       + ribs('quilt-side-l', 'quilt', -w / 2 + 0.018, -w / 2 + 0.05, 0.034, -d / 2, az - ar - 0.01, ht, 0.01)
                       + ribs('quilt-side-r', 'quilt', w / 2 - 0.05, w / 2 - 0.018, 0.034, -d / 2, az - ar - 0.01, ht, 0.01)
                       + collar('collar', 'binding', 0.06, 0.028, ht, 0.026, cz)
                       + [box('placket', 'binding', [-0.016, ht, -d / 2], [0.016, ht + 0.01, cz - 0.055])]
                       + buttons('toggle', 'toggle', 0, [cz - 0.085, cz - 0.15, cz - 0.215, cz - 0.27], ht + 0.01, 0.008)
                       + h.crescent('armhole-l', 'binding', ar, ar + 0.014, 0, 180, 8, ht, ht + 0.012, -w / 2, az)
                       + h.crescent('armhole-r', 'binding', ar, ar + 0.014, -180, 0, 8, ht, ht + 0.012, w / 2, az)
                       + h.crescent('hole-l', 'hole', 0.002, ar, 0, 180, 8, ht, ht + 0.004, -w / 2, az)
                       + h.crescent('hole-r', 'hole', 0.002, ar, -180, 0, 8, ht, ht + 0.004, w / 2, az), fin)
  + { voxelGrain: 0.004 };

// Quilted trousers folded lengthwise and in layers: channel quilting down the leg, a waistband at the +z end with a
// drawstring or lacing points, and a bound hem at the -z end. Slots: cloth, quilt, binding, cord.
local trousers(w, d, ht, folds, pitch, r) =
  h.foldedGarment(w, d, ht, folds)
  + ribs('quilt', 'quilt', -w / 2 + 0.02, w / 2 - 0.02, pitch, -d / 2 + 0.024, d / 2 - 0.05, ht, r)
  + [
    box('waistband', 'binding', [-w / 2, ht, d / 2 - 0.05], [w / 2, ht + 0.012, d / 2]),
    box('hem', 'binding', [-w / 2, ht, -d / 2], [w / 2, ht + 0.01, -d / 2 + 0.024]),
    box('fly', 'binding', [-w / 2 + 0.04, ht, d / 2 - 0.16], [-w / 2 + 0.065, ht + 0.01, d / 2 - 0.05]),
  ];

// A diamond lattice of stitched lines on a top face at y, inside x0..x1 by z0..z1, lines `gap` apart along x.
local lattice(prefix, slot, x0, x1, z0, z1, gap, y) =
  local n = std.ceil((x1 - x0 + z1 - z0) / gap);
  // The part of the line z = sg * x + c inside the rectangle, as its x range.
  local span(sg, c) = { a: std.max(x0, if sg > 0 then z0 - c else c - z1), b: std.min(x1, if sg > 0 then z1 - c else c - z0) };
  [
    strip('%s-%d-%d' % [prefix, sg, i], slot, [sp.a, sg * sp.a + c], [sp.b, sg * sp.b + c], y, 0.005, 0.003)
    for sg in [1, -1]
    for i in std.range(1, n - 1)
    for c in [(if sg > 0 then z0 - x1 else z0 + x0) + i * gap]
    for sp in [span(sg, c)]
    if sp.b - sp.a > 0.02
  ];

// One arming mitten lying back up, centred on x = cx, cuff at -z: a thick padded mitt with channel quilting, a thumb
// on side `s` (+1 towards +x) and a bound cuff. Slots: cloth, quilt, binding.
local mitten(p, cx, s) =
  local t = 0.045;
  local body = [[-0.062, -0.06], [0.062, -0.06], [0.064, 0.1], [0.052, 0.14], [0.026, 0.162], [-0.026, 0.162], [-0.052, 0.14], [-0.064, 0.1]];
  local thumb = [[0.05, -0.02], [0.08, -0.005], [0.1, 0.03], [0.1, 0.06], [0.085, 0.075], [0.06, 0.06], [0.05, 0.04]];
  [
    flat(p + 'mitt', 'cloth', [[cx + q[0], q[1]] for q in body], 0, t),
    flat(p + 'thumb', 'cloth', [[cx + s * q[0], q[1]] for q in thumb], 0, t * 0.7),
    box(p + 'cuff', 'binding', [cx - 0.068, 0, -0.15], [cx + 0.068, t + 0.006, -0.06]),
    box(p + 'cuff-edge', 'stitch', [cx - 0.07, 0, -0.156], [cx + 0.07, t + 0.008, -0.146]),
  ]
  + ribs(p + 'quilt', 'quilt', cx - 0.048, cx + 0.048, 0.024, -0.056, 0.13, t, 0.008);

// An oval patch on the front of the coif's head, centred 155 mm up: vertical strips of the oval, each standing
// `lift` proud of the head's 100 mm round where the strip meets it, so the patch follows the curve.
local faceOval(prefix, slot, a, b, lift) =
  local n = 10, R = 0.1;
  [
    local xa = -a + 2 * a * i / n, xb = xa + 2 * a / n, xm = (xa + xb) / 2, xo = std.max(std.abs(xa), std.abs(xb));
    local hh = b * std.sqrt(std.max(0.04, 1 - (xm / a) * (xm / a)));
    box('%s-%d' % [prefix, i], slot, [xa, 0.155 - hh, 0.04], [xb, 0.155 + hh, std.sqrt(R * R - xo * xo) + lift])
    for i in std.range(0, n - 1)
  ];

[
  // A pair of wool arming mittens laid flat side by side, backs up, each 310 mm from cuff to fingertip and 130 mm
  // across: a thick channel-quilted mitt and thumb with a deep bound cuff.
  h.compound('gambeson_gloves_wool', 0.9, mitten('l-', -0.08, -1) + mitten('r-', 0.08, 1),
             { cloth: 'wool-grey', quilt: 'wool-grey', binding: 'leather-brown', stitch: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A padded cotton coif standing upright, 300 mm tall and 290 mm across its shoulder cape: a hood quilted in
  // vertical channels round the head, a wide oval face opening bound in brown, and a bound hem round the cape.
  h.compound('gambeson_hood', 0.51, [
    h.turned('hood', 'cloth', 'y', [[0, 0], [0, 0.145], [0.018, 0.142], [0.05, 0.118], [0.08, 0.092], [0.1, 0.094], [0.16, 0.1], [0.21, 0.097], [0.245, 0.084], [0.272, 0.06], [0.292, 0.03], [0.3, 0]]),
    h.turned('hem', 'binding', 'y', [[0, 0], [0, 0.149], [0.014, 0.146], [0.014, 0]]),
    h.turned('neck-seam', 'stitch', 'y', [[0, 0], [0, 0.097], [0.006, 0.097], [0.006, 0]], [0, 0.085, 0]),
  ] + [
    // Vertical channels round the head every 20 degrees, clear of the face opening at the front (+z).
    local a = th * std.pi / 180, c = std.cos(a), sn = std.sin(a);
    local pt(r, u) = [r * c - u * sn, r * sn + u * c];
    h.prism('channel-%d' % th, 'stitch', 'y', [pt(0.092, -0.003), pt(0.102, -0.003), pt(0.102, 0.003), pt(0.092, 0.003)], 0.1, 0.215)
    for th in [50, 70, 90, 110, 130, 150, 170, 190, 210, 230, 250, 270, 290, 310]
  ] + faceOval('face-edge', 'binding', 0.07, 0.066, 0.002) + faceOval('face', 'hole', 0.056, 0.052, 0.004), { cloth: 'cloth-cream', stitch: 'cloth-khaki', binding: 'cloth-brown', hole: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A long nylon gambeson folded in four, 420 mm by 380 mm and 100 mm tall: dense channel quilting, a stand collar,
  // toggles down the front and thick quilted sleeves folded along both sides. The wool coat shares this model.
  coat('gambeson_nylon', 3.5, 0.034, { cloth: 'nylon-coyote', quilt: 'nylon-coyote', sleeve: 'nylon-coyote', stitch: 'webbing-black', binding: 'webbing-black', toggle: 'brass-dull' }),

  // The same long nylon gambeson with thin sleeves, folded to 420 mm by 380 mm and 100 mm tall: the sleeves fold to
  // slim rolls along the sides. The thin-sleeved wool coat shares this model.
  coat('gambeson_nylon_thinsleeved', 3.2, 0.018, { cloth: 'nylon-coyote', quilt: 'nylon-coyote', sleeve: 'nylon-coyote', stitch: 'webbing-black', binding: 'webbing-black', toggle: 'brass-dull' }),

  // A sleeveless nylon gambeson folded in four, 400 mm by 360 mm and 90 mm tall: channel quilting, a stand collar,
  // toggles down the front and bound armholes at both shoulders. The sleeveless wool coat shares this model.
  surcoat('gambeson_nylon_vest', 2.5, { cloth: 'nylon-coyote', quilt: 'nylon-coyote', stitch: 'webbing-black', binding: 'webbing-black', toggle: 'brass-dull', hole: 'cloth-charcoal' }),

  // A crude padded cotton gambeson vest folded in four, 400 mm by 360 mm and 100 mm tall: stuffed thick and quilted in
  // a coarse diamond lattice, a plain bound neck, bound armholes and a leather thong laced across the front opening.
  local w = 0.4, d = 0.36, ht = 0.1, cz = d / 2 - 0.07, az = d / 2 - 0.1, ar = 0.06;
  h.compound('gambeson_vest', 2.6, h.foldedGarment(w, d, ht, 4)
  + lattice('lattice', 'stitch', -w / 2 + 0.008, w / 2 - 0.008, -d / 2 + 0.006, cz - 0.07, 0.085, ht)
  + collar('neck', 'binding', 0.06, 0.016, ht, 0.008, cz, 30)
  + h.crescent('armhole-l', 'binding', ar, ar + 0.014, 0, 180, 8, ht, ht + 0.01, -w / 2, az)
  + h.crescent('armhole-r', 'binding', ar, ar + 0.014, -180, 0, 8, ht, ht + 0.01, w / 2, az)
  + h.crescent('hole-l', 'hole', 0.002, ar, 0, 180, 8, ht, ht + 0.004, -w / 2, az)
  + h.crescent('hole-r', 'hole', 0.002, ar, -180, 0, 8, ht, ht + 0.004, w / 2, az)
  + [box('opening', 'hole', [-0.006, ht, -d / 2], [0.006, ht + 0.004, cz - 0.06])]
  + buttons('eyelet-l', 'binding', -0.022, [cz - 0.08, cz - 0.13, cz - 0.18, cz - 0.23, cz - 0.28], ht, 0.006, 0.006)
  + buttons('eyelet-r', 'binding', 0.022, [cz - 0.08, cz - 0.13, cz - 0.18, cz - 0.23, cz - 0.28], ht, 0.006, 0.006)
  + [
    strip('lace-%d' % i, 'lace', [-0.022, cz - 0.08 - i * 0.05], [0.022, cz - 0.13 - i * 0.05], ht + 0.006, 0.006, 0.003)
    for i in std.range(0, 3)
  ] + [
    strip('lace-x-%d' % i, 'lace', [0.022, cz - 0.08 - i * 0.05], [-0.022, cz - 0.13 - i * 0.05], ht + 0.006, 0.006, 0.003)
    for i in std.range(0, 3)
  ] + [
    strip('lace-end-a', 'lace', [-0.022, cz - 0.28], [-0.05, -d / 2 + 0.008], ht + 0.006, 0.006, 0.003),
    strip('lace-end-b', 'lace', [0.022, cz - 0.28], [0.03, -d / 2 + 0.008], ht + 0.006, 0.006, 0.003),
  ], { cloth: 'cloth-cream', stitch: 'cloth-khaki', binding: 'cloth-brown', hole: 'cloth-charcoal', lace: 'leather-tan' })
  + { voxelGrain: 0.004 },

  // Padded cotton arming trousers folded lengthwise in three, 280 mm by 420 mm and 60 mm tall: channel quilting down
  // the leg, a bound waistband with a drawstring tied at the front, a fly seam and a bound hem.
  local w = 0.28, d = 0.42, ht = 0.06;
  h.compound('gambeson_pants', 1.4, trousers(w, d, ht, 3, 0.03, 0.008) + [
    strip('cord-a', 'cord', [0.0, d / 2 - 0.025], [-0.03, d / 2 - 0.12], ht + 0.012, 0.009, 0.005),
    strip('cord-b', 'cord', [0.0, d / 2 - 0.025], [0.025, d / 2 - 0.11], ht + 0.012, 0.009, 0.005),
    box('cord-knot', 'cord', [-0.008, ht + 0.012, d / 2 - 0.033], [0.008, ht + 0.02, d / 2 - 0.017]),
  ], { cloth: 'cloth-cream', quilt: 'cloth-cream', binding: 'cloth-khaki', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // Heavy canvas arming trousers folded lengthwise in four, 320 mm by 440 mm and 110 mm tall: thick channel quilting
  // down the leg, a padded knee panel, a leather-bound waistband with pairs of lacing points to tie them to a
  // gambeson, and a leather-bound hem. The nylon and wool trousers share this model.
  local w = 0.32, d = 0.44, ht = 0.11;
  h.compound('gambeson_pants_canvas', 3.2, trousers(w, d, ht, 4, 0.04, 0.012) + [
    flat('knee', 'quilt', [[-0.1, -0.02], [-0.07, -0.06], [0.07, -0.06], [0.1, -0.02], [0.1, 0.04], [0.07, 0.08], [-0.07, 0.08], [-0.1, 0.04]], ht + 0.004, 0.012),
    strip('knee-stitch-a', 'stitch', [-0.085, -0.045], [0.085, 0.065], ht + 0.016, 0.005, 0.002),
    strip('knee-stitch-b', 'stitch', [0.085, -0.045], [-0.085, 0.065], ht + 0.016, 0.005, 0.002),
  ] + std.flattenArrays([
    [
      box('point-%d-a' % i, 'point', [x - 0.016, ht + 0.012, d / 2 - 0.03], [x - 0.004, ht + 0.018, d / 2 + 0.03]),
      box('point-%d-b' % i, 'point', [x + 0.004, ht + 0.012, d / 2 - 0.03], [x + 0.016, ht + 0.018, d / 2 + 0.03]),
    ]
    for i in std.range(0, 3)
    for x in [-0.12 + i * 0.08]
  ]), { cloth: 'cloth-canvas', quilt: 'cloth-canvas', binding: 'leather-brown', stitch: 'leather-brown', point: 'leather-tan' })
  + { voxelGrain: 0.004 },
]
