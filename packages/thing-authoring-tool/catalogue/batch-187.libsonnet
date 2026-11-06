local h = import '../compound.libsonnet';
local box = h.box;

// Underwear and wraps laid flat, outside up: tops and pants with the waist or neck towards -z, wraps half rolled up
// with the loose end lying towards +z.

// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);
// A flat convex outline of [x, z] points lying on a top face from y to y + t.
local flat(id, slot, pts, y, t=0.003) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y, y + t);
// A strip `w` wide lying on a top face at y, from [xa, za] to [xb, zb].
local strip(id, slot, a, b, y, w=0.01, t=0.003) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  flat(id, slot, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], y, t);
// A cord through the points of `pts`, as strips from each point to the next.
local cord(prefix, slot, pts, y, w=0.006, t=0.003) = [
  strip('%s-%d' % [prefix, i], slot, pts[i], pts[i + 1], y, w, t)
  for i in std.range(0, std.length(pts) - 2)
];

// A cloth wrap half rolled up: a roll `w` wide and `r` in radius lying across x at -z, and its loose end `tail`
// long and `t` thick running out to +z, finished by two tie strips. `patches` lie on the loose end as [x, z, w, l]
// with a stitched border when `stitched`; `tufts` sets ragged pelt edges along the loose end. Slots: cloth, layer,
// patch, stitch, tie.
local wrap(w, r, tail, t, patches=[], stitched=false, tufts=false) =
  local z0 = -tail / 2, z1 = z0 + tail;
  [
    h.turned('roll', 'cloth', 'x', [[0, 0], [0, r], [w, r], [w, 0]], [-w / 2, r, z0]),
    box('end', 'cloth', [-w / 2, 0, z0], [w / 2, t, z1]),
  ]
  // The turns of the roll showing at each end.
  + [
    h.tube('turn-%d-%d' % [s + 1, i], 'layer', r * f - 0.003, r * f, if s < 0 then -w / 2 - 0.002 else w / 2, if s < 0 then -w / 2 else w / 2 + 0.002, r, z0)
    for s in [-1, 1]
    for i in [0, 1, 2]
    for f in [[0.35, 0.62, 0.9][i]]
  ]
  + std.flattenArrays([
    local p = patches[n], x = p[0], z = p[1], pw = p[2], pl = p[3];
    [box('patch-%d' % n, 'patch', [x - pw / 2, t, z - pl / 2], [x + pw / 2, t + 0.002, z + pl / 2])]
    + (if stitched then [
         box('stitch-%d-%d' % [n, j], 'stitch', [x - pw / 2 + 0.004, t + 0.002, zz - 0.001], [x + pw / 2 - 0.004, t + 0.003, zz + 0.001])
         for j in [0, 1]
         for zz in [[z - pl / 2 + 0.005, z + pl / 2 - 0.005][j]]
       ] + [
         box('stitch-side-%d-%d' % [n, j], 'stitch', [xx - 0.001, t + 0.002, z - pl / 2 + 0.005], [xx + 0.001, t + 0.003, z + pl / 2 - 0.005])
         for j in [0, 1]
         for xx in [[x - pw / 2 + 0.005, x + pw / 2 - 0.005][j]]
       ] else [])
    for n in std.range(0, std.length(patches) - 1)
  ])
  // Ragged pelt edges: uneven tufts along both sides of the loose end.
  + (if tufts then [
       local dz = tail / 7, zz = z0 + r + i * (tail - r) / 7, out = [0.008, 0.014, 0.006, 0.012, 0.01, 0.016, 0.007][i];
       sbox('tuft-%d-%d' % [s + 1, i], 'cloth', [s * w / 2, 0, zz], [s * (w / 2 + out), t * 0.8, zz + dz * 0.6])
       for s in [-1, 1]
       for i in std.range(0, 6)
     ] else [])
  // Two tie strips from the end, splayed apart.
  + std.flattenArrays([
    cord('tie-%d' % (s + 1), 'tie', [[s * w * 0.3, z1 - 0.01], [s * w * 0.36, z1 + 0.07], [s * w * 0.5, z1 + 0.12]], t, 0.016, 0.003)
    for s in [-1, 1]
  ]);

// A top of two hide cups laid flat, neck at -z: each cup a rounded triangle `cw` across and `ch` tall, `t` thick, on
// a backing a little larger, laced together at the centre and tied with thongs round the back and neck. Slots:
// cup, backing, lace, stitch.
local hideTop(cw, ch, t, stitched) =
  local gap = 0.03, zb = ch / 2, zt = -ch / 2;
  local cupPts(cx, inset) = [
    [cx - cw / 2 + inset, zb - inset],
    [cx + cw / 2 - inset, zb - inset],
    [cx + cw * 0.38 - inset, zb - ch * 0.4],
    [cx + cw * 0.08, zt + inset],
    [cx - cw * 0.08, zt + inset],
    [cx - cw * 0.38 + inset, zb - ch * 0.4],
  ];
  std.flattenArrays([
    local cx = s * (gap / 2 + cw / 2);
    [
      flat('backing-%d' % (s + 1), 'backing', cupPts(cx, -0.004), 0, 0.002),
      flat('cup-%d' % (s + 1), 'cup', cupPts(cx, 0), 0.002, t),
    ]
    + (if stitched then [
         strip('stitch-%d-%d' % [s + 1, i], 'stitch', cupPts(cx, 0.008)[i], cupPts(cx, 0.008)[(i + 1) % 6], 0.002 + t, 0.002, 0.001)
         for i in std.range(0, 5)
       ] else [])
    // The thong round the back from the outer corner, and the neck thong from the point.
    + cord('band-%d' % (s + 1), 'lace', [[s * (gap / 2 + cw), zb - 0.006], [s * (gap / 2 + cw + 0.08), zb], [s * (gap / 2 + cw + 0.13), zb + 0.03]], 0)
    + cord('neck-%d' % (s + 1), 'lace', [[cx, zt], [cx + s * 0.015, zt - 0.06], [cx - s * 0.01, zt - 0.11]], 0)
    for s in [-1, 1]
  ])
  // Criss-cross lacing across the centre gap.
  + [
    strip('cross-%d-%d' % [i, j], 'lace', [-gap / 2 - 0.008, zb - 0.01 - i * 0.025 - (if j == 0 then 0 else 0.02)], [gap / 2 + 0.008, zb - 0.01 - i * 0.025 - (if j == 0 then 0.02 else 0)], 0.002 + t, 0.005, 0.002)
    for i in [0, 1]
    for j in [0, 1]
  ];

// A tied bow at [x, z]: a knot and two loops either side of it along x.
local bow(prefix, slot, x, z, y, s=0.01, t=0.003) = [
  flat(prefix + '-loop-a', slot, [[x - 0.002, z], [x - s, z - s * 0.6], [x - s, z + s * 0.6]], y, t),
  flat(prefix + '-loop-b', slot, [[x + 0.002, z], [x + s, z - s * 0.6], [x + s, z + s * 0.6]], y, t),
  box(prefix + '-knot', slot, [x - 0.003, y, z - 0.003], [x + 0.003, y + t + 0.001, z + 0.003]),
];

// Pants laid flat, waist at -z: a waist `w` across, a seat down to the crotch at `rise`, and then either a pouch
// narrowing to `crotch` across at `l` (briefs), or two legs to a hem at `l`, `hem` across each and splayed `flare`
// outward. A waistband `band` deep sits on top, and each leg or leg opening gets a hem strip. Slots: cloth, band,
// hem.
local pants(w, rise, l, band, legs, crotch=0.08, hem=0.15, flare=0, t=0.003) =
  local z0 = -l / 2, zr = z0 + rise, z1 = l / 2;
  (if legs then [
     box('seat', 'cloth', [-w / 2, 0, z0], [w / 2, t, zr]),
   ] + std.flattenArrays([
     local outer = s * (w / 2 + flare), inner = s * (w / 2 + flare - hem);
     [
       flat('leg-%d' % (s + 1), 'cloth', [[0, zr], [s * w / 2, zr], [outer, z1], [inner, z1]], 0, t),
       strip('leg-hem-%d' % (s + 1), 'hem', [inner, z1 - 0.004], [outer, z1 - 0.004], t, 0.008, 0.002),
     ]
     for s in [-1, 1]
   ]) else [
     flat('body', 'cloth', [[-w / 2, z0], [w / 2, z0], [w / 2, zr], [crotch / 2, z1], [-crotch / 2, z1], [-w / 2, zr]], 0, t),
   ] + [
     strip('leg-hem-%d' % (s + 1), 'hem', [s * (w / 2 - 0.003), zr], [s * (crotch / 2 - 0.002), z1 - 0.003], t, 0.007, 0.002)
     for s in [-1, 1]
   ])
  + [box('band', 'band', [-w / 2, t, z0], [w / 2, t + 0.003, z0 + band])];

// A bra laid flat, cups up, neck at -z: two moulded cups `r` in rim radius on an underband with hook and eye tabs
// at its ends, a centre gore, lace along the top of each cup, and straps with sliders lying out towards -z. Slots:
// cup, band, trim, strap, hook.
local braFlat(r, depth) =
  local cx = r + 0.008, bz = r * 0.75;
  std.flattenArrays([
    [
      h.dome('cup-%d' % (s + 1), 'cup', r, depth, 0.003, 'y', [s * cx, 0.002, 0]),
      sbox('wing-%d' % (s + 1), 'band', [s * cx, 0, bz - 0.006], [s * (cx + r + 0.11), 0.003, bz + 0.02]),
      sbox('tab-%d' % (s + 1), if s < 0 then 'hook' else 'band', [s * (cx + r + 0.11), 0, bz - 0.004], [s * (cx + r + 0.13), 0.004, bz + 0.018]),
    ]
    + h.crescent('lace-%d' % (s + 1), 'trim', r - 0.002, r + 0.006, 95, 265, 8, 0.002, 0.005, s * cx, 0)
    + cord('strap-%d' % (s + 1), 'strap', [[s * cx, -r + 0.004], [s * (cx + 0.01), -r - 0.08], [s * (cx + 0.05), -r - 0.16]], 0, 0.012, 0.002)
    + [sbox('slider-%d' % (s + 1), 'hook', [s * (cx + 0.004), 0.002, -r - 0.07], [s * (cx + 0.024), 0.004, -r - 0.062])]
    for s in [-1, 1]
  ])
  + [
    box('gore', 'band', [-0.012, 0, -0.01], [0.012, 0.003, bz + 0.02]),
    box('under', 'band', [-cx, 0, bz - 0.006], [cx, 0.003, bz + 0.02]),
  ]
  + bow('gore-bow', 'trim', 0, -0.006, 0.003, 0.006, 0.002);

[
  // A cotton rag belly wrap half rolled, 180 mm wide: a roll 70 mm across and a 260 mm loose end of mismatched rag
  // strips with two tie ends.
  h.compound('bellywrap', 0.12, wrap(0.18, 0.035, 0.26, 0.004, [[-0.04, 0.02, 0.07, 0.06], [0.05, 0.08, 0.06, 0.05]]), {
    cloth: 'canvas-grey',
    layer: 'cloth-cream',
    patch: 'cloth-khaki',
    stitch: 'cord-cotton',
    tie: 'cloth-cream',
  }) + { voxelGrain: 0.004 },

  // A fur belly wrap half rolled, 200 mm wide: a thick roll 110 mm across of brown pelts, a 260 mm loose end with
  // ragged pelt edges, and rawhide ties.
  h.compound('bellywrap_fur', 0.4, wrap(0.2, 0.055, 0.26, 0.014, [[0.0, 0.05, 0.12, 0.08]], false, true), {
    cloth: 'fur-brown',
    layer: 'skin-rawhide',
    patch: 'fur-pale',
    stitch: 'skin-rawhide',
    tie: 'skin-rawhide',
  }) + { voxelGrain: 0.004 },

  // A leather belly wrap half rolled, 190 mm wide: a roll 90 mm across and a 260 mm loose end of stitched-on
  // leather patches, with thong ties.
  h.compound('bellywrap_leather', 0.59, wrap(0.19, 0.045, 0.26, 0.006, [[-0.045, -0.01, 0.07, 0.07], [0.045, 0.05, 0.07, 0.07], [-0.03, 0.09, 0.08, 0.05]], true), {
    cloth: 'leather-tan',
    layer: 'leather-chestnut',
    patch: 'leather-chestnut',
    stitch: 'cord-cotton',
    tie: 'skin-rawhide',
  }) + { voxelGrain: 0.004 },

  // A felted wool belly wrap half rolled, 180 mm wide: a roll 80 mm across and a 260 mm loose end of grey felt with
  // brown felt patches stitched on.
  h.compound('bellywrap_wool', 0.16, wrap(0.18, 0.04, 0.26, 0.006, [[-0.04, 0.0, 0.07, 0.06], [0.04, 0.07, 0.06, 0.06]], true), {
    cloth: 'felt-grey',
    layer: 'wool-grey',
    patch: 'felt-brown',
    stitch: 'cord-cotton',
    tie: 'felt-brown',
  }) + { voxelGrain: 0.004 },

  // A cotton rag chest wrap half rolled, 140 mm wide: a roll 70 mm across and a 280 mm loose end of pale rag strips
  // with a darker patch and two tie ends.
  h.compound('chestwrap', 0.092, wrap(0.14, 0.035, 0.28, 0.004, [[0.02, 0.04, 0.06, 0.05]]), {
    cloth: 'cloth-cream',
    layer: 'canvas-grey',
    patch: 'canvas-grey',
    stitch: 'cord-cotton',
    tie: 'cloth-cream',
  }) + { voxelGrain: 0.004 },

  // A fur chest wrap half rolled, 160 mm wide: a roll 90 mm across of pale pelt, a 260 mm loose end with ragged
  // edges and a darker patch, and rawhide ties.
  h.compound('chestwrap_fur', 0.22, wrap(0.16, 0.045, 0.26, 0.01, [[0.0, 0.05, 0.08, 0.07]], false, true), {
    cloth: 'fur-pale',
    layer: 'skin-rawhide',
    patch: 'fur-brown',
    stitch: 'skin-rawhide',
    tie: 'skin-rawhide',
  }) + { voxelGrain: 0.004 },

  // A fur bikini top laid flat, 450 mm across its thongs: two rounded triangle cups of brown pelt 130 mm across on a
  // rawhide backing, laced across the centre, with thongs round the back and neck.
  h.compound('bikini_top_fur', 0.1, hideTop(0.13, 0.12, 0.008, false), {
    cup: 'fur-brown',
    backing: 'skin-rawhide',
    lace: 'skin-rawhide',
    stitch: 'cord-cotton',
  }) + { voxelGrain: 0.002 },

  // A leather bikini top laid flat, 450 mm across its thongs: two rounded triangle cups of tan leather 130 mm across
  // with stitched edges, laced across the centre, with thongs round the back and neck.
  h.compound('bikini_top_leather', 0.08, hideTop(0.13, 0.12, 0.003, true), {
    cup: 'leather-tan',
    backing: 'leather-chestnut',
    lace: 'leather-chestnut',
    stitch: 'cord-cotton',
  }) + { voxelGrain: 0.002 },

  // A chest binder laid flat, neck at -z, 300 mm across and 360 mm long with its straps: a short stretch tank
  // ending above the waist, wide shoulder straps, a doubled compression panel across the front with its seams
  // showing, and a hem band.
  h.compound('binder_top', 0.13, [
    flat('body', 'cloth', [[-0.12, -0.08], [0.12, -0.08], [0.15, -0.02], [0.15, 0.13], [-0.15, 0.13], [-0.15, -0.02]], 0, 0.003),
    box('panel', 'panel', [-0.13, 0.003, -0.05], [0.13, 0.005, 0.1]),
    box('hem', 'hem', [-0.15, 0.003, 0.11], [0.15, 0.005, 0.13]),
    box('seam-mid', 'seam', [-0.001, 0.005, -0.05], [0.001, 0.006, 0.1]),
  ] + std.flattenArrays([
    [
      sbox('strap-%d' % (s + 1), 'cloth', [s * 0.06, 0, -0.23], [s * 0.11, 0.003, -0.08]),
      sbox('strap-seam-%d' % (s + 1), 'seam', [s * 0.06, 0.003, -0.21], [s * 0.11, 0.004, -0.205]),
      sbox('panel-seam-%d' % (s + 1), 'seam', [s * 0.128, 0.005, -0.05], [s * 0.13, 0.006, 0.1]),
      sbox('neck-%d' % (s + 1), 'hem', [s * 0.0, 0.003, -0.08], [s * 0.06, 0.004, -0.072]),
    ]
    for s in [-1, 1]
  ]), {
    cloth: 'cloth-cream',
    panel: 'latex-pale',
    hem: 'cloth-heather-grey',
    seam: 'cloth-heather-grey',
  }) + { voxelGrain: 0.002 },

  // Cotton boxer briefs laid flat, waist at -z, 320 mm across and 280 mm long: a fitted seat, close legs, a wide
  // elastic waistband and leg cuffs in light grey, and the front pouch's curved seams.
  h.compound('boxer_briefs', 0.07, pants(0.32, 0.12, 0.28, 0.035, true, hem=0.15, flare=0.0)
                                    + cord('pouch-a', 'seam', [[-0.045, -0.095], [-0.05, -0.04], [-0.02, 0.0], [0, 0.005]], 0.003, 0.004, 0.001)
                                    + cord('pouch-b', 'seam', [[0.045, -0.095], [0.05, -0.04], [0.02, 0.0], [0, 0.005]], 0.003, 0.004, 0.001)
                                    + [
                                      box('cuff-%d' % (s + 1), 'hem', [if s < 0 then -0.16 else 0.01, 0.003, 0.124], [if s < 0 then -0.01 else 0.16, 0.005, 0.14])
                                      for s in [-1, 1]
                                    ], {
    cloth: 'cloth-charcoal',
    band: 'cloth-white',
    hem: 'cloth-white',
    seam: 'cloth-heather-grey',
  }) + { voxelGrain: 0.002 },

  // Cotton boxer shorts laid flat, waist at -z, 380 mm across the legs, split to the crotch, and 300 mm long: loose flared legs, a
  // gathered waistband, a button fly, and a woven check shown as raised stripes.
  h.compound('boxer_shorts', 0.08, pants(0.34, 0.13, 0.3, 0.03, true, hem=0.17, flare=0.02)
                                    + [
                                      sbox('stripe-x-%d-%d' % [i, s + 1], 'stripe', [s * (if i == 0 then 0 else 0.024), 0.003, -0.1 + i * 0.06], [s * 0.183, 0.0035, -0.092 + i * 0.06])
                                      for i in std.range(0, 3)
                                      for s in [-1, 1]
                                    ]
                                    + [
                                      box('stripe-z-%d' % i, 'stripe', [x - 0.004, 0.003, -0.12], [x + 0.004, 0.0035, 0.14])
                                      for i in std.range(0, 3)
                                      for x in [[-0.13, -0.065, 0.065, 0.13][i]]
                                    ]
                                    + [
                                      box('gather-%d' % i, 'hem', [-0.165 + i * 0.03, 0.006, -0.15], [-0.16 + i * 0.03, 0.007, -0.12])
                                      for i in std.range(0, 11)
                                    ]
                                    + [
                                      box('fly', 'hem', [-0.003, 0.003, -0.12], [0.003, 0.005, -0.03]),
                                      h.disc('button', 'button', 0.005, 0.005, 0.007, 0, -0.08),
                                    ], {
    cloth: 'cloth-shirt-blue',
    band: 'cloth-shirt-blue',
    hem: 'cloth-navy',
    stripe: 'cloth-navy',
    button: 'plastic-gloss-white',
  }) + { voxelGrain: 0.002 },

  // Cotton boy shorts laid flat, waist at -z, 300 mm across and 190 mm long: short close legs cut straight across,
  // a soft cream waistband, narrow lace trim along each leg, and a small bow at the front.
  h.compound('boy_shorts', 0.044, pants(0.3, 0.11, 0.19, 0.022, true, hem=0.14, flare=0.005)
                                  + [
                                    box('lace-%d' % (s + 1), 'trim', [if s < 0 then -0.155 else 0.0, 0.003, 0.087], [if s < 0 then 0.0 else 0.155, 0.0045, 0.095])
                                    for s in [-1, 1]
                                  ]
                                  + bow('bow', 'trim', 0, -0.082, 0.006, 0.008, 0.002), {
    cloth: 'cloth-purple',
    band: 'cloth-cream',
    hem: 'cloth-purple',
    trim: 'lace-white',
  }) + { voxelGrain: 0.002 },

  // A cotton bra laid flat, cups up, 540 mm across its band and 290 mm long with its straps: two moulded cups
  // 130 mm across on an underband, lace along the cup tops, a small bow at the centre, hook and eye tabs and
  // adjustable straps.
  h.compound('bra', 0.051, braFlat(0.065, 0.035), {
    cup: 'cloth-cream',
    band: 'cloth-cream',
    trim: 'mesh-white',
    strap: 'cloth-cream',
    hook: 'steel-bright',
  }) + { voxelGrain: 0.002 },

  // Cotton briefs laid flat, waist at -z, 320 mm across and 220 mm long: a pouch narrowing to the crotch, elastic
  // leg openings, a contrasting waistband, and a Y-shaped front opening.
  h.compound('briefs', 0.043, pants(0.32, 0.06, 0.22, 0.03, false, crotch=0.09)
                              + cord('fly-a', 'seam', [[-0.04, -0.08], [0, -0.01]], 0.003, 0.005, 0.001)
                              + cord('fly-b', 'seam', [[0.04, -0.08], [0, -0.01]], 0.003, 0.005, 0.001)
                              + cord('fly-c', 'seam', [[0, -0.01], [0, 0.05]], 0.003, 0.005, 0.001), {
    cloth: 'cloth-bright-white',
    band: 'cloth-navy',
    hem: 'cloth-bright-white',
    seam: 'cloth-heather-grey',
  }) + { voxelGrain: 0.002 },

  // A cotton camisole laid flat, neck at -z, 360 mm across the hem and 560 mm long with its straps: a light body
  // flaring a little to the hem, a straight neckline edged in lace with a small bow, thin shoulder straps and a
  // lace hem.
  h.compound('camisole', 0.067, [
    flat('body', 'cloth', [[-0.15, -0.17], [0.15, -0.17], [0.18, 0.25], [-0.18, 0.25]], 0, 0.002),
    box('neck-lace', 'trim', [-0.15, 0.002, -0.17], [0.15, 0.0035, -0.155]),
    flat('hem-lace', 'trim', [[-0.18, 0.232], [0.18, 0.232], [0.181, 0.25], [-0.181, 0.25]], 0.002, 0.0015),
  ] + std.flattenArrays([
    cord('strap-%d' % (s + 1), 'strap', [[s * 0.11, -0.168], [s * 0.1, -0.25], [s * 0.08, -0.31]], 0, 0.008, 0.002)
    for s in [-1, 1]
  ]) + bow('bow', 'trim', 0, -0.15, 0.0035, 0.008, 0.002), {
    cloth: 'cloth-sage',
    trim: 'mesh-white',
    strap: 'cloth-sage',
  }) + { voxelGrain: 0.002 },
]
