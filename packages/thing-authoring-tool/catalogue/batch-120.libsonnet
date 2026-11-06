local h = import '../compound.libsonnet';
local box = h.box;

// Quilted padded armour: aketons, gambesons and arming pants folded on a shelf, coifs standing upright and arming
// mittens laid flat as a pair. Folded garments lie on h.foldedGarment, `w` across x and `d` along z, top face at
// `ht`, collar or waistband at the +z end (front). Quilting shows as raised stitch lines in the `stitch` slot.

// A flat convex outline of [x, z] points lying on a top face from y to y + t.
local flat(id, slot, pts, y, t=0.004) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y, y + t);

// Stitch lines running along z from z0 to z1 at each x in xs, on a face at y.
local quiltZ(prefix, xs, z0, z1, y, w=0.006) = [
  box('%s-%d' % [prefix, i], 'stitch', [xs[i] - w / 2, y, z0], [xs[i] + w / 2, y + 0.004, z1])
  for i in std.range(0, std.length(xs) - 1)
];

// Stitch lines running along x from x0 to x1 at each z in zs, on a face at y.
local quiltX(prefix, zs, x0, x1, y, w=0.006) = [
  box('%s-%d' % [prefix, i], 'stitch', [x0, y, zs[i] - w / 2], [x1, y + 0.004, zs[i] + w / 2])
  for i in std.range(0, std.length(zs) - 1)
];

// Evenly spaced positions from a to b, n of them, ends included.
local spread(a, b, n) = [a + (b - a) * i / (n - 1) for i in std.range(0, n - 1)];

// Round buttons at x along each z in zs, on a face at y.
local buttons(prefix, x, zs, y, r=0.008) = [
  h.disc('%s-%d' % [prefix, i], 'button', r, y, y + 0.005, x, zs[i])
  for i in std.range(0, std.length(zs) - 1)
];

// A quilted coat or vest folded flat. `sleeves` is 'full', 'thin' or 'none'; `long` folds the skirt of a greatcoat
// back up over the bundle as a second quilted layer across the hem end; `closure` is 'buttons' or 'ties'.
local coat(id, mass, w, d, ht, sleeves, long, closure, fin) =
  local cz = d / 2 - 0.07;
  local sw = if sleeves == 'full' then 0.085 else if sleeves == 'thin' then 0.05 else 0;
  local sh = if sleeves == 'full' then 0.02 else 0.01;
  local skirt = if long then 0.13 else 0;
  local bodyX = w / 2 - sw - 0.01;
  h.compound(id, mass, h.foldedGarment(w, d, ht, if long then 4 else 3)
                       // The body's quilting: channels running collar to hem between the sleeves.
                       + quiltZ('quilt', [x for x in spread(-bodyX + 0.02, bodyX - 0.02, 8) if std.abs(x) > 0.03], -d / 2 + skirt, cz - 0.06, ht)
                       + h.crescent('collar', 'trim', 0.05, 0.066, -150, 150, 12, ht, ht + 0.024, 0, cz)
                       + [box('placket', 'trim', [-0.016, ht, -d / 2 + skirt], [0.016, ht + 0.006, cz - 0.06])]
                       + (if closure == 'buttons' then
                            buttons('button', 0, spread(cz - 0.09, -d / 2 + skirt + 0.03, 5), ht + 0.006)
                          else std.flattenArrays([
                            [
                              box('tie-%d' % i, 'tie', [-0.035, ht + 0.006, z - 0.004], [0.035, ht + 0.01, z + 0.004]),
                              box('tie-knot-%d' % i, 'tie', [-0.008, ht + 0.006, z - 0.008], [0.008, ht + 0.014, z + 0.008]),
                            ]
                            for i in std.range(0, 3)
                            for z in [spread(cz - 0.09, -d / 2 + skirt + 0.03, 4)[i]]
                          ]))
                       // Sleeves folded in along each side, quilted in rings, a bound cuff at the hem end.
                       + (if sw == 0 then
                            // No sleeves: bound armholes at the shoulder corners.
                            h.crescent('armhole-l', 'trim', 0.05, 0.062, 0, 180, 8, ht, ht + 0.005, -w / 2, cz - 0.04)
                            + h.crescent('armhole-r', 'trim', 0.05, 0.062, 180, 360, 8, ht, ht + 0.005, w / 2, cz - 0.04)
                          else std.flattenArrays([
                            [
                              box('sleeve-' + s, 'cloth', [x0, ht, -d / 2 + skirt + 0.01], [x0 + sw, ht + sh, cz + 0.02]),
                              box('cuff-' + s, 'trim', [x0 - 0.002, ht, -d / 2 + skirt + 0.006], [x0 + sw + 0.002, ht + sh + 0.004, -d / 2 + skirt + 0.03]),
                            ] + quiltX('sleeve-quilt-' + s, spread(-d / 2 + skirt + 0.06, cz - 0.01, 6), x0, x0 + sw, ht + sh)
                            for s in ['l', 'r']
                            for x0 in [if s == 'l' then -w / 2 + 0.005 else w / 2 - 0.005 - sw]
                          ]))
                       // A greatcoat's long skirt folded back up over the hem end.
                       + (if long then [
                            box('skirt', 'cloth', [-w / 2 + 0.004, ht, -d / 2 - 0.004], [w / 2 - 0.004, ht + 0.016, -d / 2 + skirt]),
                            box('skirt-hem', 'trim', [-w / 2 + 0.004, ht + 0.016, -d / 2 + skirt - 0.02], [w / 2 - 0.004, ht + 0.02, -d / 2 + skirt]),
                          ] + quiltZ('skirt-quilt', spread(-w / 2 + 0.035, w / 2 - 0.035, 9), -d / 2, -d / 2 + skirt - 0.02, ht + 0.016)
                          else []),
             fin)
  + { voxelGrain: 0.004 };

// Quilted arming pants folded in a long bundle: the legs laid one on the other, channels running their length,
// a waistband at the +z end with lacing points hanging over the front edge, and bound cuffs at the -z end.
local pants(id, mass, fin) =
  local w = 0.26, d = 0.42, ht = 0.045;
  h.compound(id, mass, h.foldedGarment(w, d, ht, 3)
                       + quiltZ('quilt', spread(-w / 2 + 0.03, w / 2 - 0.03, 7), -d / 2 + 0.035, d / 2 - 0.05, ht)
                       + [
                         box('waistband', 'trim', [-w / 2, ht, d / 2 - 0.05], [w / 2, ht + 0.007, d / 2 + 0.003]),
                         box('cuff', 'trim', [-w / 2, ht, -d / 2], [w / 2, ht + 0.006, -d / 2 + 0.035]),
                         box('fly', 'trim', [-0.012, ht, d / 2 - 0.17], [0.012, ht + 0.006, d / 2 - 0.05]),
                         box('inseam', 'stitch', [-0.004, ht, -d / 2 + 0.035], [0.004, ht + 0.006, -0.02]),
                       ]
                       + std.flattenArrays([
                         [
                           box('point-' + i, 'tie', [x - 0.004, ht + 0.007, d / 2 - 0.035], [x + 0.004, ht + 0.011, d / 2 + 0.006]),
                           box('point-end-' + i, 'tie', [x - 0.004, ht - 0.03, d / 2 + 0.003], [x + 0.004, ht + 0.011, d / 2 + 0.007]),
                         ]
                         for i in std.range(0, 3)
                         for x in [spread(-0.09, 0.09, 4)[i]]
                       ]),
             fin)
  + { voxelGrain: 0.004 };

// A coif standing upright as on a shelf: a padded hood over the crown with a flared curtain resting on the
// shoulders, the face opening at +z bound with a rolled rim, quilted in rings, and a chin strap.
local coif(id, mass, fin) =
  // Face opening: centred at height fy, half height fh(x) at x; R is the hood's radius at the face.
  local fy = 0.185, R = 0.098;
  local fh(x) = 0.06 * std.sqrt(std.max(0.1, 1 - std.pow(std.abs(x) / 0.066, 2)));
  h.compound(id, mass, [
    h.turned('hood', 'cloth', 'y', [[0, 0], [0, 0.165], [0.025, 0.162], [0.075, 0.125], [0.115, 0.098], [0.2, 0.1], [0.245, 0.093], [0.28, 0.07], [0.302, 0.035], [0.308, 0]]),
  ] + [
    // The face opening as dark strips standing just proud of the hood's curve, bound by a rolled rim.
    h.prism('face-%d' % i, 'face', 'z', [[x0, fy - fh(xo)], [x0 + 0.012, fy - fh(xo)], [x0 + 0.012, fy + fh(xo)], [x0, fy + fh(xo)]], 0.03, std.sqrt(R * R - xi * xi) + 0.002)
    for i in std.range(0, 9)
    for x0 in [-0.06 + i * 0.012]
    for xo in [std.max(std.abs(x0), std.abs(x0 + 0.012))]
    for xi in [if x0 < 0 && x0 + 0.012 > 0 then 0 else std.min(std.abs(x0), std.abs(x0 + 0.012))]
  ] + [
    box('rim-%d' % i, 'trim', [x - 0.006, fy - fh(x) - 0.012, 0.03], [x + 0.006, fy + fh(x) + 0.012, std.sqrt(R * R - std.pow(std.abs(x) - 0.006, 2)) + 0.006])
    for i in std.range(0, 1)
    for x in [[-0.066, 0.066][i]]
  ] + [
    box('rim-%s-%d' % [e, i], 'trim', [x0, fy + sgn * fh(x0 + 0.006) - 0.008, 0.03], [x0 + 0.012, fy + sgn * fh(x0 + 0.006) + 0.008, std.sqrt(R * R - xi * xi) + 0.006])
    for e in ['top', 'bottom']
    for sgn in [if e == 'top' then 1 else -1]
    for i in std.range(0, 9)
    for x0 in [-0.06 + i * 0.012]
    for xi in [if x0 < 0 && x0 + 0.012 > 0 then 0 else std.min(std.abs(x0), std.abs(x0 + 0.012))]
  ] + [
    h.turned('ring-%d' % i, 'stitch', 'y', [[0, 0], [0, r + 0.003], [0.006, r + 0.003], [0.006, 0]], [0, y, 0])
    for i in std.range(0, 3)
    for y in [[0.03, 0.055, 0.08, 0.105][i]]
    for r in [[0.159, 0.14, 0.12, 0.1][i]]
  ] + [
    box('strap', 'trim', [-0.06, 0.115, 0.09], [0.06, 0.135, 0.104]),
    h.disc('strap-button', 'button', 0.009, 0.12, 0.13, 0.05, 0.1),
  ], fin)
  + { voxelGrain: 0.004 };

// One arming mitten lying back up, fingers towards +z, thumb out to side s (-1 left, +1 right), centred on cx: a
// thick quilted mitt with a flared gauntlet cuff bound at its edge.
local mitten(p, cx, s) =
  local t = 0.03;
  [
    flat(p + 'mitt', 'cloth', [[cx - 0.05, -0.02], [cx + 0.05, -0.02], [cx + 0.052, 0.1], [cx + 0.035, 0.135], [cx, 0.145], [cx - 0.035, 0.135], [cx - 0.052, 0.1]], 0, t),
    flat(p + 'cuff', 'cloth', [[cx - 0.07, -0.14], [cx + 0.07, -0.14], [cx + 0.05, -0.02], [cx - 0.05, -0.02]], 0, t - 0.004),
    flat(p + 'thumb', 'cloth', [[cx + s * 0.04, -0.01], [cx + s * 0.075, 0.02], [cx + s * 0.085, 0.055], [cx + s * 0.07, 0.065], [cx + s * 0.045, 0.045]], 0, t - 0.008),
    box(p + 'binding', 'trim', [cx - 0.071, 0, -0.142], [cx + 0.071, t - 0.002, -0.125]),
    box(p + 'wrist', 'trim', [cx - 0.052, 0, -0.03], [cx + 0.052, t + 0.003, -0.015]),
  ] + quiltZ(p + 'quilt', [cx - 0.03, cx - 0.01, cx + 0.01, cx + 0.03], -0.01, 0.12, t, 0.005)
  + quiltZ(p + 'cuff-quilt', [cx - 0.04, cx, cx + 0.04], -0.12, -0.035, t - 0.004, 0.005);

local nylon = { cloth: 'nylon-ranger-green', stitch: 'cloth-black', trim: 'cloth-black', tie: 'cloth-black', button: 'plastic-matte-black', face: 'cloth-black' };
local wool = { cloth: 'wool-grey', stitch: 'cloth-charcoal', trim: 'cloth-charcoal', tie: 'leather-brown', button: 'wood-walnut', face: 'cloth-black' };
local canvas = { cloth: 'cloth-canvas', stitch: 'cloth-brown', trim: 'cloth-brown', tie: 'leather-brown', button: 'wood-walnut', face: 'cloth-black' };
local cotton = { cloth: 'cloth-cream', stitch: 'cloth-khaki', trim: 'cloth-khaki', tie: 'cord-cotton', button: 'wood-walnut', face: 'cloth-black' };

[
  // A green nylon coif standing upright, 330 mm across the shoulder curtain and 310 mm tall: a padded hood with a
  // bound face opening, quilted rings round the curtain and a buttoned chin strap.
  coif('aketon_hood_nylon', 0.62, nylon),

  // The same coif in grey layered wool, heavier.
  coif('aketon_hood_wool', 0.62, wool),

  // A green nylon aketon folded flat, 360 mm by 320 mm and 60 mm tall: quilted channels down the body, a stand
  // collar, a button front, and quilted sleeves folded in along both sides.
  coat('aketon_nylon', 1.5, 0.36, 0.32, 0.06, 'full', false, 'buttons', nylon),

  // A green nylon aketon vest folded flat, 340 mm by 320 mm and 55 mm tall: the same quilted body with bound
  // armholes and no sleeves.
  coat('aketon_nylon_vest', 1.1, 0.34, 0.32, 0.055, 'none', false, 'buttons', nylon),

  // Canvas arming pants folded in a long bundle, 260 mm by 420 mm and 45 mm tall, with lacing points at the waist.
  pants('aketon_pants_canvas', 1.2, canvas),

  // Green nylon arming pants, folded the same way.
  pants('aketon_pants_nylon', 0.9, nylon),

  // Grey quilted wool arming pants, folded the same way.
  pants('aketon_pants_wool', 1.2, wool),

  // A grey quilted wool aketon folded flat, 360 mm by 320 mm and 65 mm tall, wooden buttons down the front.
  coat('aketon_wool', 2.2, 0.36, 0.32, 0.065, 'full', false, 'buttons', wool),

  // A grey quilted wool aketon vest folded flat, 340 mm by 320 mm and 60 mm tall, no sleeves.
  coat('aketon_wool_vest', 1.5, 0.34, 0.32, 0.06, 'none', false, 'buttons', wool),

  // A cream cotton gambeson folded flat, 420 mm by 380 mm and 90 mm tall: a long greatcoat, its quilted skirt folded
  // back up over the hem end, thick quilted sleeves, a stand collar and a front closed with tied laces.
  coat('gambeson', 3.5, 0.42, 0.38, 0.09, 'full', true, 'ties', cotton),

  // A canvas gambeson folded the same way.
  coat('gambeson_canvas', 3.8, 0.42, 0.38, 0.09, 'full', true, 'ties', canvas),

  // A canvas gambeson with thinner sleeves, folded the same way.
  coat('gambeson_canvas_thinsleeved', 3.3, 0.42, 0.38, 0.085, 'thin', true, 'ties', canvas),

  // A sleeveless canvas gambeson folded the same way, armholes bound in brown.
  coat('gambeson_canvas_vest', 2.8, 0.4, 0.38, 0.08, 'none', true, 'ties', canvas),

  // A pair of canvas arming mittens laid flat side by side, backs up, each 285 mm from cuff to fingertip: thick
  // quilted mitts with flared gauntlet cuffs.
  h.compound('gambeson_gloves_canvas', 0.4, mitten('l-', -0.075, -1) + mitten('r-', 0.075, 1), canvas)
  + { voxelGrain: 0.004 },

  // The same mittens in green nylon.
  h.compound('gambeson_gloves_nylon', 0.32, mitten('l-', -0.075, -1) + mitten('r-', 0.075, 1), nylon)
  + { voxelGrain: 0.004 },
]
