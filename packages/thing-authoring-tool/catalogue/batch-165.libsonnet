local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
// Slack leg straps lying flat on the floor behind an item whose back is at z0: one loop per strap, each `length`
// along x with round ends of centre radius r, the next strap lying over the last a little further back, with its
// buckle on the far run. Slots: `slot` and buckle.
local floorStraps(p, slot, n, z0, length, r, w, t, buckle=true, buckleSlot='buckle', cx=0) = std.flattenArrays([
  local cz = z0 - r - w / 2 - j * (w + 0.012), y = j * t;
  h.strapLoop('%s-%d' % [p, j], slot, length, r, w, t, y, cx, cz)
  + (if buckle then [box('%s-buckle-%d' % [p, j], buckleSlot, [cx + 0.002, y + t, cz - r - w / 2 - 0.003], [cx + 0.038, y + t + 0.008, cz - r + w / 2 + 0.003])] else [])
  for j in std.range(0, n - 1)
]);
// A flapped pouch standing on y, centred on x with its back at z0, `w` wide, `ht` tall, `d` deep, its flap wrapping
// the top and coming `flap` down the front. Ids carry `p` so several pouches fit one row. Slots: body, flap.
local pouchAt(p, x, z0, w, ht, d, flap, y0=0, t=0.003) = [
  box(p + '-body', 'body', [x - w / 2, y0, z0], [x + w / 2, y0 + ht, z0 + d]),
  box(p + '-flap-top', 'flap', [x - w / 2 - t, y0 + ht, z0], [x + w / 2 + t, y0 + ht + t, z0 + d + t]),
  box(p + '-flap-front', 'flap', [x - w / 2 - t, y0 + ht - flap, z0 + d], [x + w / 2 + t, y0 + ht, z0 + d + t]),
];
// Rows of PALS webbing across an upright face at z from x0 to x1, one row 25 mm tall every 38 mm from y0 up, cut into
// 38 mm channels so the loops read.
local pals(p, slot, x0, x1, y0, rows, z, t=0.004) = [
  box('%s-%d-%d' % [p, i, j], slot, [x0 + j * 0.038 + 0.002, y0 + i * 0.038, z], [x0 + (j + 1) * 0.038 - 0.002, y0 + i * 0.038 + 0.025, z + t])
  for i in std.range(0, rows - 1)
  for j in std.range(0, std.floor((x1 - x0) / 0.038 + 0.001) - 1)
];
// The same rows on an upright side face at x, running along z from z0 to z1; `dir` is +1 on the right side and -1 on
// the left.
local palsSide(p, slot, z0, z1, y0, rows, x, dir, t=0.004) = [
  box('%s-%d-%d' % [p, i, j], slot, [std.min(x, x + dir * t), y0 + i * 0.038, z0 + j * 0.038 + 0.002], [std.max(x, x + dir * t), y0 + i * 0.038 + 0.025, z0 + (j + 1) * 0.038 - 0.002])
  for i in std.range(0, rows - 1)
  for j in std.range(0, std.floor((z1 - z0) / 0.038 + 0.001) - 1)
];
// Two padded shoulder straps down the back face at z, `sx` either side of the middle and `w` wide, running from the
// top at y1 down to y0 + 0.1, where a webbing tail slants out to the bottom corner at y0.
local shoulderStraps(slot, sx, w, y0, y1, z, t=0.022) = std.flattenArrays([
  [
    box('shoulder-%d' % i, slot, [s * sx - w / 2, y0 + 0.1, z - t], [s * sx + w / 2, y1, z]),
    h.prism('tail-%d' % i, slot, 'z', [[s * sx - 0.0125, y0 + 0.1], [s * sx + 0.0125, y0 + 0.1], [s * (sx + 0.06) + 0.0125, y0], [s * (sx + 0.06) - 0.0125, y0]], z - 0.006, z),
  ]
  for i in [0, 1]
  for s in [[-1, 1][i]]
]);
// A MOLLE rucksack standing on its base, harness on -z and front on +z: a main body `w` wide, `ht` tall and `d` deep
// under an overhanging lid, PALS webbing across the front and down both sides, compression straps, a grab handle and
// padded shoulder straps. `o.front` adds a flapped front pouch, `o.side` a pouch on each side, `o.belt` a waist belt.
local rucksack(id, massKg, o) =
  local w = o.w, ht = o.ht, d = o.d, lid = o.lid;
  h.compound(id, massKg, [
    box('body', 'body', [-w / 2, 0, -d / 2], [w / 2, ht, d / 2]),
    box('base', 'trim', [-w / 2 - 0.003, 0, -d / 2 - 0.003], [w / 2 + 0.003, 0.03, d / 2 + 0.003]),
    box('back-pad', 'trim', [-w / 2 + 0.02, 0.04, -d / 2 - 0.012], [w / 2 - 0.02, ht - 0.03, -d / 2]),
    box('lid', 'flap', [-w / 2 - 0.006, ht, -d / 2 + 0.01], [w / 2 + 0.006, ht + lid, d / 2 + 0.012]),
    box('lid-front', 'flap', [-w / 2 - 0.006, ht - 0.05, d / 2], [w / 2 + 0.006, ht + lid, d / 2 + 0.012]),
    box('handle', 'webbing', [-0.04, ht + lid, -d / 2 + 0.02], [0.04, ht + lid + 0.02, -d / 2 + 0.035]),
  ] + std.flattenArrays([
    [
      box('lid-strap-%d' % i, 'webbing', [x - 0.0125, ht - 0.14, d / 2 + 0.012], [x + 0.0125, ht, d / 2 + 0.016]),
      box('lid-buckle-%d' % i, 'buckle', [x - 0.018, ht - 0.12, d / 2 + 0.016], [x + 0.018, ht - 0.085, d / 2 + 0.024]),
    ]
    for i in [0, 1]
    for x in [[-w * 0.28, w * 0.28][i]]
  ]) + pals('front-pals', 'webbing', -w / 2 + 0.02, w / 2 - 0.02, 0.05, o.rows, d / 2)
  + (if o.front then
       pouchAt('front-pouch', 0, d / 2 + 0.004, w * 0.62, ht * 0.32, 0.06, 0.05, 0.06)
       + pals('pouch-pals', 'webbing', -w * 0.31 + 0.01, w * 0.31 - 0.01, 0.075, 2, d / 2 + 0.064)
     else [])
  + std.flattenArrays([
    palsSide('side-pals-%d' % i, 'webbing', -d / 2 + 0.02, d / 2 - 0.02, 0.05, o.rows - 2, s * w / 2, s)
    + [
      box('compress-%d-%d' % [i, k], 'webbing', [std.min(s * w / 2, s * (w / 2 + 0.006)), y, -d / 2], [std.max(s * w / 2, s * (w / 2 + 0.006)), y + 0.025, d / 2])
      for k in [0, 1]
      for y in [[ht * 0.35, ht * 0.75][k]]
    ]
    + (if o.side then [
         box('side-pouch-%d' % i, 'body', [std.min(s * w / 2, s * (w / 2 + 0.07)), 0.04, -d * 0.3], [std.max(s * w / 2, s * (w / 2 + 0.07)), ht * 0.5, d * 0.3]),
         box('side-flap-%d' % i, 'flap', [std.min(s * w / 2, s * (w / 2 + 0.073)), ht * 0.5 - 0.04, -d * 0.3 - 0.003], [std.max(s * w / 2, s * (w / 2 + 0.073)), ht * 0.5 + 0.003, d * 0.3 + 0.003]),
         box('side-buckle-%d' % i, 'buckle', [std.min(s * (w / 2 + 0.073), s * (w / 2 + 0.08)), ht * 0.5 - 0.05, -0.018], [std.max(s * (w / 2 + 0.073), s * (w / 2 + 0.08)), ht * 0.5 - 0.015, 0.018]),
       ] else [])
    for i in [0, 1]
    for s in [[-1, 1][i]]
  ])
  + shoulderStraps('harness', w * 0.2, 0.065, 0.05, ht - 0.02, -d / 2 - 0.012)
  + (if o.belt then [
       box('belt-pad-l', 'harness', [-w / 2 - 0.12, 0.02, -d / 2 - 0.05], [-w / 2 + 0.06, 0.12, -d / 2 - 0.012]),
       box('belt-pad-r', 'harness', [w / 2 - 0.06, 0.02, -d / 2 - 0.05], [w / 2 + 0.12, 0.12, -d / 2 - 0.012]),
     ] else []), {
    body: o.cloth,
    flap: o.cloth,
    trim: o.trim,
    webbing: o.webbing,
    harness: o.webbing,
    buckle: 'plastic-matte-black',
  });
[
  // A leather pouch 160 mm wide, 140 mm tall and 50 mm deep, stitched from mismatched scraps with rawhide, closed by
  // a flap and a bone toggle, with a leather loop on its back for a belt.
  h.compound('leather_pouch', 0.12, [
    box('body', 'body', [-0.08, 0, -0.025], [0.08, 0.14, 0.025]),
    box('patch-a', 'patch', [-0.08, 0, 0.025], [0.005, 0.085, 0.027]),
    box('patch-b', 'scrap', [0.005, 0.02, 0.025], [0.08, 0.1, 0.027]),
    box('flap-top', 'flap', [-0.083, 0.14, -0.025], [0.083, 0.143, 0.028]),
    box('flap-front', 'flap', [-0.083, 0.08, 0.027], [0.083, 0.143, 0.03]),
    box('loop', 'patch', [-0.025, 0.03, -0.03], [0.025, 0.13, -0.025]),
    h.stud('toggle', 'toggle', 0, 0.09, 0.03, 0.008, 0.008),
  ] + [
    box('stitch-v-%d' % i, 'lace', [0.003, 0.006 + i * 0.016, 0.027], [0.007, 0.014 + i * 0.016, 0.029])
    for i in std.range(0, 4)
  ] + [
    box('stitch-h-%d' % i, 'lace', [-0.075 + i * 0.016, 0.083, 0.027], [-0.067 + i * 0.016, 0.087, 0.029])
    for i in std.range(0, 4)
  ] + [
    box('stitch-f-%d' % i, 'lace', [-0.075 + i * 0.016, 0.083, 0.03], [-0.067 + i * 0.016, 0.087, 0.032])
    for i in std.range(0, 9)
  ], { body: 'leather-brown', patch: 'leather-chestnut', scrap: 'leather-tan', flap: 'leather-brown', lace: 'skin-rawhide', toggle: 'bone' })
  + { voxelGrain: 0.004 },

  // A canvas drop-leg bag 200 mm wide, 250 mm tall and 90 mm deep with a buckled flap, a zipped front pocket, a
  // hanger strap rising to a belt loop, and two thigh straps lying slack in loops on the floor behind it.
  h.compound('leg_bag', 0.21, pouchAt('bag', 0, -0.045, 0.2, 0.25, 0.09, 0.09) + [
    box('pocket', 'pocket', [-0.08, 0.03, 0.045], [0.08, 0.13, 0.065]),
    box('zip', 'zip', [-0.07, 0.115, 0.065], [0.07, 0.121, 0.067]),
    box('zip-pull', 'zip', [0.055, 0.1, 0.065], [0.063, 0.121, 0.069]),
    box('flap-strap-l', 'strap', [-0.07, 0.15, 0.048], [-0.045, 0.21, 0.052]),
    box('flap-strap-r', 'strap', [0.045, 0.15, 0.048], [0.07, 0.21, 0.052]),
    box('buckle-l', 'buckle', [-0.074, 0.15, 0.052], [-0.041, 0.175, 0.058]),
    box('buckle-r', 'buckle', [0.041, 0.15, 0.052], [0.074, 0.175, 0.058]),
    box('hanger', 'strap', [-0.02, 0.2, -0.05], [0.02, 0.36, -0.045]),
    box('belt-loop', 'strap', [-0.025, 0.31, -0.06], [0.025, 0.36, -0.05]),
  ] + floorStraps('thigh', 'strap', 2, -0.045, 0.12, 0.07, 0.03, 0.004), { body: 'cloth-canvas', flap: 'cloth-canvas', pocket: 'cloth-khaki', zip: 'steel-grey', strap: 'cloth-olive-drab', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A small canvas purse 150 mm wide, 110 mm tall and 35 mm deep with a zipped top and a slip pocket on its front,
  // on two buckled leg straps lying slack in loops on the floor behind it.
  h.compound('leg_small_bag', 0.18, [
    box('body', 'body', [-0.075, 0, -0.0175], [0.075, 0.11, 0.0175]),
    box('zip', 'zip', [-0.073, 0.11, -0.003], [0.073, 0.114, 0.003]),
    box('zip-pull', 'zip', [0.05, 0.1, 0.0175], [0.058, 0.114, 0.021]),
    box('slip-pocket', 'pocket', [-0.065, 0.008, 0.0175], [0.065, 0.07, 0.022]),
    box('pocket-hem', 'strap', [-0.065, 0.064, 0.022], [0.065, 0.07, 0.024]),
  ] + floorStraps('leg', 'strap', 2, -0.0175, 0.1, 0.06, 0.02, 0.004), { body: 'cloth-navy', zip: 'steel-grey', pocket: 'cloth-navy', strap: 'webbing-black', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A nylon drop-leg pouch 140 mm wide, 180 mm tall and 60 mm deep with a hook-and-loop flap, two rows of webbing
  // on its front, a hanger strap to the belt and two buckled thigh straps lying slack in loops on the floor behind it.
  h.compound('legrig', 0.13, pouchAt('pouch', 0, -0.03, 0.14, 0.18, 0.06, 0.06) + [
    box('flap-tab', 'tab', [-0.03, 0.125, 0.033], [0.03, 0.14, 0.036]),
  ] + pals('front-pals', 'strap', -0.057, 0.057, 0.03, 2, 0.03) + [
    box('hanger', 'strap', [-0.02, 0.15, -0.035], [0.02, 0.32, -0.031]),
    box('hanger-buckle', 'buckle', [-0.024, 0.24, -0.039], [0.024, 0.27, -0.031]),
    box('belt-loop', 'strap', [-0.025, 0.28, -0.045], [0.025, 0.32, -0.035]),
  ] + floorStraps('thigh', 'strap', 2, -0.03, 0.11, 0.065, 0.025, 0.004), { body: 'cloth-olive-drab', flap: 'cloth-olive-drab', tab: 'hook-loop-grey', strap: 'webbing-olive-dark', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A pair of zipped nylon dive pouches, each 110 mm wide, 160 mm tall and 50 mm deep with blue piping, each on a black
  // neoprene thigh band lying slack in a loop on the floor behind it.
  h.compound('legrig_wetsuit', 0.49, std.flattenArrays([
    [
      box('pouch-%d' % i, 'body', [x - 0.055, 0, -0.025], [x + 0.055, 0.16, 0.025]),
      box('piping-%d' % i, 'trim', [x - 0.057, 0.15, -0.027], [x + 0.057, 0.162, 0.027]),
      box('zip-%d' % i, 'zip', [x - 0.05, 0.13, 0.025], [x + 0.05, 0.135, 0.027]),
      box('pull-%d' % i, 'trim', [x + 0.03, 0.112, 0.025], [x + 0.038, 0.135, 0.029]),
      box('drain-%d' % i, 'mesh', [x - 0.04, 0.01, 0.025], [x + 0.04, 0.035, 0.027]),
    ] + floorStraps('band-%d' % i, 'band', 1, -0.025, 0.04, 0.05, 0.045, 0.006, buckleSlot='trim', cx=x)
    for i in [0, 1]
    for x in [[-0.1, 0.1][i]]
  ]), { body: 'nylon-black', trim: 'cloth-blue', zip: 'steel-grey', mesh: 'mesh-black', band: 'rubber-black' })
  + { voxelGrain: 0.004 },

  // A canvas longarm bag lying on its side, 1.1 m long and 260 mm across, zipped along its top and round one end,
  // with leather end caps, two wrap-round carry handles and a shoulder strap laid out in front of it.
  local len = 1.1, r = 0.13;
  h.compound('long_duffelbag', 1, [
    h.rod('body', 'body', r, -len / 2 + 0.02, len / 2 - 0.02, r),
    h.rod('cap-l', 'trim', r - 0.008, -len / 2, -len / 2 + 0.02, r),
    h.rod('cap-r', 'trim', r - 0.008, len / 2 - 0.02, len / 2, r),
    box('zip', 'zip', [-len / 2 + 0.06, 2 * r - 0.004, -0.004], [len / 2 - 0.02, 2 * r + 0.002, 0.004]),
    box('zip-end', 'zip', [len / 2 - 0.003, r, -0.004], [len / 2 + 0.002, 2 * r - 0.03, 0.004]),
    box('zip-pull', 'trim', [0.2, 2 * r - 0.002, 0.004], [0.225, 2 * r + 0.006, 0.012]),
    box('pocket', 'trim', [-0.3, 0.04, r - 0.02], [0.05, 0.2, r + 0.008]),
  ] + std.flattenArrays([
    [
      h.tube('wrap-%d' % i, 'trim', r - 0.004, r + 0.004, x - 0.02, x + 0.02, r, 0),
      box('handle-%d' % i, 'trim', [x - 0.02, 2 * r + 0.004, -0.04], [x + 0.02, 2 * r + 0.012, 0.04]),
    ]
    for i in [0, 1]
    for x in [[-0.1, 0.1][i]]
  ]) + [
    box('strap', 'strap', [-0.45, 0, r + 0.04], [0.45, 0.004, r + 0.08]),
    box('strap-end-l', 'strap', [-0.47, 0, r - 0.02], [-0.43, 0.004, r + 0.08]),
    box('strap-end-r', 'strap', [0.43, 0, r - 0.02], [0.47, 0.004, r + 0.08]),
    box('strap-pad', 'trim', [-0.1, 0.004, r + 0.035], [0.1, 0.014, r + 0.085]),
    box('clip-l', 'zip', [-0.47, 0.004, r - 0.02], [-0.43, 0.012, r]),
    box('clip-r', 'zip', [0.43, 0.004, r - 0.02], [0.47, 0.012, r]),
  ], { body: 'cloth-canvas', trim: 'leather-brown', zip: 'steel-grey', strap: 'cloth-khaki' }),

  // A pair of denim trousers made into a knapsack, standing 300 mm tall: the seat sewn shut and gathered at the
  // waistband with string, each leg turned up behind as a shoulder strap and tied off through a belt loop.
  h.compound('makeshift_knapsack', 0.46, [
    box('seat', 'body', [-0.16, 0.02, -0.07], [0.16, 0.27, 0.07]),
    box('seat-bottom', 'body', [-0.15, 0, -0.06], [0.15, 0.02, 0.06]),
    box('waistband', 'band', [-0.155, 0.27, -0.065], [0.155, 0.31, 0.065]),
    box('fly', 'band', [-0.006, 0.12, 0.07], [0.006, 0.27, 0.073]),
    box('button', 'zip', [-0.008, 0.28, 0.065], [0.008, 0.296, 0.069]),
    box('pocket-l', 'band', [-0.14, 0.17, 0.07], [-0.06, 0.2, 0.073]),
    box('pocket-r', 'band', [0.06, 0.17, 0.07], [0.14, 0.2, 0.073]),
    box('drawstring', 'cord', [-0.157, 0.285, -0.067], [0.157, 0.293, 0.067]),
    box('knot', 'cord', [-0.02, 0.28, 0.067], [0.02, 0.3, 0.075]),
  ] + std.flattenArrays([
    [
      box('leg-foot-%d' % i, 'leg', [x - 0.05, 0, -0.12], [x + 0.05, 0.03, -0.07]),
      box('leg-%d' % i, 'leg', [x - 0.05, 0.03, -0.12], [x + 0.05, 0.3, -0.085]),
      box('belt-loop-%d' % i, 'band', [x - 0.012, 0.27, -0.072], [x + 0.012, 0.31, -0.065]),
      box('cuff-%d' % i, 'leg', [x - 0.04, 0.3, -0.11], [x + 0.04, 0.33, -0.065]),
      box('tie-%d' % i, 'cord', [x - 0.042, 0.305, -0.112], [x + 0.042, 0.313, -0.063]),
    ]
    for i in [0, 1]
    for x in [[-0.1, 0.1][i]]
  ]), { body: 'cloth-denim', leg: 'cloth-denim-faded', band: 'cloth-denim-faded', zip: 'brass', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A bed sheet knotted into a bundle 350 mm long and 210 mm across, its twisted ends knotted on top and
  // the long twisted loop that goes over the shoulder lying flat round it.
  h.compound('makeshift_sling', 0.75, [
    turned('bundle', 'body', 'x', [[0, 0], [0, 0.03], [0.04, 0.08], [0.1, 0.105], [0.25, 0.105], [0.31, 0.08], [0.35, 0.03], [0.35, 0]], [-0.175, 0.105, 0]),
    box('fold-a', 'fold', [-0.12, 0.14, 0.05], [0.1, 0.15, 0.085]),
    box('fold-b', 'fold', [-0.06, 0.07, 0.09], [0.14, 0.08, 0.105]),
    box('knot', 'strap', [-0.04, 0.19, -0.04], [0.04, 0.24, 0.04]),
    box('knot-ear-l', 'strap', [-0.08, 0.195, -0.02], [-0.04, 0.23, 0.02]),
    box('knot-ear-r', 'strap', [0.04, 0.195, -0.02], [0.09, 0.225, 0.02]),
    h.prism('twist-l', 'strap', 'z', [[-0.08, 0.2], [-0.04, 0.23], [-0.2, 0.02], [-0.24, 0.0]], -0.02, 0.02),
    h.prism('twist-r', 'strap', 'z', [[0.04, 0.225], [0.09, 0.2], [0.24, 0.0], [0.2, 0.02]], -0.02, 0.02),
  ] + h.strapLoop('loop', 'strap', 0.45, 0.17, 0.045, 0.02, 0, 0, 0), { body: 'cloth-cream', fold: 'cloth-white', strap: 'cloth-white' }),

  // A nylon messenger bag 380 mm wide, 290 mm tall and 110 mm deep under a full flap held by two buckled straps,
  // with a padded shoulder strap lying in a U on the floor behind it.
  h.compound('mbag', 0.38, [
    box('body', 'body', [-0.19, 0, -0.055], [0.19, 0.29, 0.055]),
    box('flap-top', 'flap', [-0.193, 0.29, -0.058], [0.193, 0.294, 0.059]),
    box('flap-front', 'flap', [-0.193, 0.06, 0.055], [0.193, 0.294, 0.059]),
    box('flap-binding', 'trim', [-0.193, 0.056, 0.055], [0.193, 0.064, 0.061]),
    box('reflective', 'reflect', [-0.193, 0.2, 0.059], [0.193, 0.212, 0.061]),
    box('gusset-l', 'trim', [-0.193, 0, -0.04], [-0.19, 0.29, 0.04]),
    box('gusset-r', 'trim', [0.19, 0, -0.04], [0.193, 0.29, 0.04]),
    box('handle', 'strap', [-0.05, 0.294, -0.03], [0.05, 0.31, -0.015]),
  ] + std.flattenArrays([
    [
      box('flap-strap-%d' % i, 'strap', [x - 0.0125, 0.03, 0.059], [x + 0.0125, 0.14, 0.063]),
      box('buckle-%d' % i, 'buckle', [x - 0.02, 0.055, 0.063], [x + 0.02, 0.09, 0.071]),
    ]
    for i in [0, 1]
    for x in [[-0.11, 0.11][i]]
  ]) + [
    box('strap-l', 'strap', [-0.2, 0, -0.42], [-0.16, 0.004, -0.055]),
    box('strap-r', 'strap', [0.16, 0, -0.42], [0.2, 0.004, -0.055]),
    box('strap-back', 'strap', [-0.2, 0, -0.46], [0.2, 0.004, -0.42]),
    box('strap-pad', 'trim', [-0.13, 0.004, -0.465], [0.13, 0.016, -0.415]),
    box('strap-slider', 'buckle', [-0.205, 0.004, -0.3], [-0.155, 0.012, -0.27]),
  ], { body: 'cloth-charcoal', flap: 'cloth-charcoal', trim: 'nylon-black', reflect: 'reflective-yellow', strap: 'webbing-black', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A large MOLLE rucksack 380 mm wide, 600 mm tall and 280 mm deep with a lid, webbing on its front and sides, a
  // pouch on each side, padded shoulder straps and a hip belt.
  rucksack('molle_large_rucksack', 1.3, {
    w: 0.38, ht: 0.6, d: 0.28, lid: 0.08, rows: 9, front: false, side: true, belt: true,
    cloth: 'cloth-olive-drab', trim: 'webbing-olive-dark', webbing: 'webbing-olive-dark',
  }),

  // A medium MOLLE rucksack 340 mm wide, 500 mm tall and 230 mm deep with a lid, webbing on its front and sides, a
  // flapped front pouch and padded shoulder straps.
  rucksack('molle_medium_rucksack', 1, {
    w: 0.34, ht: 0.5, d: 0.23, lid: 0.07, rows: 8, front: true, side: false, belt: false,
    cloth: 'nylon-coyote', trim: 'cloth-khaki', webbing: 'cloth-khaki',
  }),

  // A MOLLE assault pack 300 mm wide, 440 mm tall and 200 mm deep with a lid, webbing on its front and sides, a
  // flapped front pouch and padded shoulder straps.
  rucksack('molle_pack', 0.75, {
    w: 0.3, ht: 0.44, d: 0.2, lid: 0.05, rows: 7, front: true, side: false, belt: false,
    cloth: 'nylon-ranger-green', trim: 'webbing-olive-dark', webbing: 'webbing-olive-dark',
  }),

  // A string net bag 320 mm wide and 420 mm long lying slumped on the floor, knotted in a 32 mm mesh that bulges
  // 60 mm over its flat underside, with a drawcord through its mouth and the two cotton straps that carry it running
  // down its sides to its bottom corners.
  local w = 0.32, l = 0.416, step = 0.032, t = 0.004, nx = 10, nz = 13;
  local bulge(x, z) = 0.06 * std.sin(std.pi * (x + w / 2) / w) * std.sin(std.pi * (z + l / 2) / l);
  h.compound('net_backpack', 0.14, [
    box('under-x-%d' % j, 'net', [-w / 2, 0, -l / 2 + j * step], [w / 2, t, -l / 2 + j * step + t])
    for j in std.range(1, nz - 1)
  ] + [
    box('under-z-%d' % i, 'net', [-w / 2 + i * step, 0, -l / 2], [-w / 2 + i * step + t, t, l / 2])
    for i in std.range(1, nx - 1)
  ] + [
    local x0 = -w / 2 + i * step, z = -l / 2 + j * step, y = bulge(x0 + step / 2, z);
    box('top-x-%d-%d' % [i, j], 'net', [x0, y, z], [x0 + step + t, y + t, z + t])
    for i in std.range(0, nx - 1)
    for j in std.range(1, nz - 1)
  ] + [
    local x = -w / 2 + i * step, z0 = -l / 2 + j * step, y = bulge(x, z0 + step / 2);
    box('top-z-%d-%d' % [i, j], 'net', [x, y, z0], [x + t, y + t, z0 + step + t])
    for i in std.range(1, nx - 1)
    for j in std.range(0, nz - 1)
  ] + [
    box('hem', 'strap', [-w / 2, 0, -l / 2], [w / 2, 0.012, -l / 2 + 0.025]),
    box('bottom-seam', 'net', [-w / 2, 0, l / 2 - 0.006], [w / 2, 0.012, l / 2]),
    box('strap-l', 'strap', [-w / 2 - 0.03, 0, -l / 2], [-w / 2, 0.006, l / 2]),
    box('strap-r', 'strap', [w / 2, 0, -l / 2], [w / 2 + 0.03, 0.006, l / 2]),
    box('corner-l', 'strap', [-w / 2 - 0.03, 0, l / 2 - 0.03], [-w / 2 + 0.03, 0.014, l / 2]),
    box('corner-r', 'strap', [w / 2 - 0.03, 0, l / 2 - 0.03], [w / 2 + 0.03, 0.014, l / 2]),
    box('drawcord-l', 'cord', [-0.07, 0, -l / 2 - 0.08], [-0.064, 0.006, -l / 2]),
    box('drawcord-r', 'cord', [0.064, 0, -l / 2 - 0.08], [0.07, 0.006, -l / 2]),
    box('cord-lock', 'cord', [-0.075, 0, -l / 2 - 0.1], [0.075, 0.01, -l / 2 - 0.08]),
  ], { net: 'cord-cotton', strap: 'cloth-cream', cord: 'cord-cotton' })
  + { voxelGrain: 0.004, handling: { part: 'net_backpack', solid: 'hem', fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 } },

  // A nylon pet carrier backpack 330 mm wide, 420 mm tall and 270 mm deep with a clear domed window on its front
  // ringed by air holes, mesh vents on both sides, a top handle and padded shoulder straps.
  h.compound('petpack', 0.77, [
    box('body', 'body', [-0.165, 0, -0.135], [0.165, 0.42, 0.135]),
    box('base', 'trim', [-0.168, 0, -0.138], [0.168, 0.025, 0.138]),
    box('rim-top', 'trim', [-0.168, 0.41, -0.138], [0.168, 0.425, 0.138]),
    box('back-pad', 'trim', [-0.13, 0.04, -0.15], [0.13, 0.39, -0.135]),
    turned('window-rim', 'trim', 'z', [[0, 0.11], [0, 0.125], [0.01, 0.125], [0.01, 0.11], [0, 0.11]], [0, 0.23, 0.135]),
    h.dome('window', 'window', 0.11, 0.06, 0.004, 'z', [0, 0.23, 0.135]),
    box('handle', 'trim', [-0.06, 0.425, -0.015], [0.06, 0.445, 0.015]),
    box('zip-top', 'zip', [-0.15, 0.425, 0.06], [0.15, 0.429, 0.066]),
    box('vent-l', 'mesh', [-0.168, 0.12, -0.08], [-0.165, 0.34, 0.08]),
    box('vent-r', 'mesh', [0.165, 0.12, -0.08], [0.168, 0.34, 0.08]),
  ] + [
    h.turned('hole-%d' % i, 'hole', 'z', [[0, 0], [0, 0.006], [0.003, 0.006], [0.003, 0]], [0.145 * std.cos(a), 0.23 + 0.145 * std.sin(a), 0.135])
    for i in std.range(0, 11)
    for a in [i * std.pi / 6]
  ] + shoulderStraps('trim', 0.07, 0.06, 0.04, 0.4, -0.15), {
    body: 'cloth-blue', trim: 'nylon-black', window: 'plastic-clear', zip: 'steel-grey', mesh: 'mesh-black', hole: 'plastic-black',
  })
  + { voxelGrain: 0.004 },
]
