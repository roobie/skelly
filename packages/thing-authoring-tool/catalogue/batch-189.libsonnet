local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;
local flat = g.flat;
local strip = g.strip;

// Base layers as found on a shelf or the floor. Shirts are folded on h.foldedGarment, `w` across x and `d` along z,
// top face at `ht`, neck at the +z end. Bras, shorts, tights and the unitard lie flat, outside up, waist or neck at +z.

// A scoop or round neck at [0, cz]: the shadowed opening (slot hole) and its binding.
local neck(r, cz, y, bind, bw=0.01) =
  h.crescent('neck-hole', 'hole', 0.004, r, 90, 270, 8, y, y + 0.002, 0, cz)
  + h.crescent('neck-bind', bind, r, r + bw, 90, 270, 8, y, y + 0.005, 0, cz);

// The two armholes of a sleeveless top, cut into each side edge at z (slot hole) and bound round in slot `bind`.
local armholes(w, z, r, y, bind, bw=0.01) =
  h.crescent('armhole-l', 'hole', 0.004, r, 0, 180, 8, y, y + 0.002, -w / 2, z)
  + h.crescent('armhole-r', 'hole', 0.004, r, 180, 360, 8, y, y + 0.002, w / 2, z)
  + h.crescent('armhole-bind-l', bind, r, r + bw, 0, 180, 8, y, y + 0.005, -w / 2, z)
  + h.crescent('armhole-bind-r', bind, r, r + bw, 180, 360, 8, y, y + 0.005, w / 2, z);

// A V neck reaching down to vz from a mouth `half` wide at the +z edge: a dark triangle and two binding strips.
local vNeck(half, d, vz, y, bind, bw=0.01) = [
  flat('neck-hole', 'hole', [[-half, d / 2], [half, d / 2], [0, vz]], y, 0.002),
  strip('neck-bind-l', bind, [-half - bw / 2, d / 2], [0, vz - bw / 2], y, bw, 0.005),
  strip('neck-bind-r', bind, [half + bw / 2, d / 2], [0, vz - bw / 2], y, bw, 0.005),
];

// Short sleeves folded out from each shoulder, `reach` past the body, `len` along z from `z1` down.
local shortSleeves(w, ht, z1, len, reach=0.03, t=0.005) = [
  g.sbox('sleeve-' + s, 'sleeve', [sg * (w / 2 - 0.03), ht * 0.4, z1 - len], [sg * (w / 2 + reach), ht + t, z1])
  for s in ['l', 'r']
  for sg in [if s == 'l' then -1 else 1]
];

// A long-sleeved stretch top folded: a raised mock collar, sleeves folded down each side with ribbed cuffs, and
// flatlock seams (slot seam) down the sides. Slots: cloth, sleeve, collar, cuff, seam.
local stretchTop(id, mass, w, d, ht, collarHt, seams, finishes) =
  h.compound(id, mass, g.jacket({ w: w, d: d, ht: ht, folds: 2, neck: 0.06, front: 'none', buttons: 0, collar: { r: 0.045, wd: 0.012, ht: collarHt, gap: 0 }, sleeves: { kind: 'flat', w: 0.06, t: 0.005 } })
                       + [
                         box('cuff-l', 'cuff', [-w / 2 - 0.002, ht, -d / 2 + 0.03], [-w / 2 + 0.062, ht + 0.008, -d / 2 + 0.055]),
                         box('cuff-r', 'cuff', [w / 2 - 0.062, ht, -d / 2 + 0.03], [w / 2 + 0.002, ht + 0.008, -d / 2 + 0.055]),
                       ]
                       + [
                         strip('seam-%d' % i, 'seam', [x, d / 2 - 0.03], [x * 0.8, -d / 2 + 0.01], ht, 0.008, 0.003)
                         for i in std.range(0, std.length(seams) - 1)
                         for x in [seams[i]]
                       ],
             finishes)
  + { voxelGrain: 0.004 };

[
  // A racerback sports bra laid flat, 260 mm across and 250 mm from band to the strap junction: a thin elastic
  // underband, a smooth body curving in to the underarms, two moulded cups with a centre gore, a bound scoop neck and
  // wide straps meeting behind in a racer tab.
  // The body is built from convex pieces: the lower body up to the underarms, then each strap as quads between its
  // outer edge and the neckline.
  local lower = [[0.128, -0.086], [0.127, -0.05], [0.122, -0.015], [0.112, 0.015], [0.096, 0.042]];
  local outer = [[0.096, 0.042], [0.076, 0.068], [0.056, 0.097], [0.038, 0.125], [0.024, 0.148]];
  local inner = [[0.046, 0.042], [0.044, 0.07], [0.034, 0.099], [0.018, 0.126], [0, 0.148]];
  local neckLine = [[-0.046, 0.042]] + inner[0:4];
  h.compound('sports_bra', 0.086, [
    flat('body', 'cloth', lower + std.reverse([[-p[0], p[1]] for p in lower]), 0, 0.008),
    flat('band', 'band', [[-0.13, -0.1], [0.13, -0.1], [0.13, -0.084], [-0.13, -0.084]], 0, 0.009),
    h.dome('cup-l', 'cloth', 0.048, 0.01, 0.004, 'y', [-0.056, 0.006, -0.036]),
    h.dome('cup-r', 'cloth', 0.048, 0.01, 0.004, 'y', [0.056, 0.006, -0.036]),
    strip('gore', 'band', [0, -0.084], [0, 0.036], 0.008, 0.01, 0.003),
    flat('racer', 'band', [[-0.03, 0.128], [0.03, 0.128], [0.02, 0.15], [-0.02, 0.15]], 0.008, 0.003),
  ] + [
    flat('strap-%d-%d' % [k + 1, n], 'cloth', [[k * outer[n][0], outer[n][1]], [k * outer[n + 1][0], outer[n + 1][1]], [k * inner[n + 1][0], inner[n + 1][1]], [k * inner[n][0], inner[n][1]]], 0, 0.008)
    for k in [-1, 1]
    for n in [0, 1, 2, 3]
  ] + std.flattenArrays([
    [
      strip('neck-bind-%d-%d' % [k + 1, n], 'band', [k * neckLine[n][0], neckLine[n][1] + 0.003], [k * neckLine[n + 1][0], neckLine[n + 1][1] + 0.003], 0.008, 0.006, 0.003)
      for n in std.range(0, std.length(neckLine) - 2)
    ]
    for k in [-1, 1]
  ]), { cloth: 'cloth-heather-grey', band: 'lycra-black' })
  + { voxelGrain: 0.002 },

  // A cotton tank top folded, 240 mm by 280 mm and 20 mm tall: a deep scoop neck, wide-cut armholes with ribbed
  // binding and no sleeves.
  local w = 0.24, d = 0.28, ht = 0.02;
  h.compound('tank_top', 0.19, h.foldedGarment(w, d, ht, 2)
                               + neck(0.055, d / 2, ht, 'bind')
                               + armholes(w, d / 2 - 0.045, 0.04, ht, 'bind')
                               + [box('hem', 'bind', [-w / 2, ht, -d / 2 + 0.004], [w / 2, ht + 0.003, -d / 2 + 0.016])],
             { cloth: 'cloth-heather-grey', bind: 'cloth-heather-grey', hole: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A thermal undershirt folded, 280 mm by 290 mm and 22 mm tall: thin charcoal stretch knit with a black mock collar,
  // long sleeves folded in with grey ribbed cuffs, and grey flatlock seams.
  stretchTop('thermal_shirt', 0.2, 0.28, 0.29, 0.022, 0.012, [-0.09, 0.09],
             { cloth: 'cloth-charcoal', sleeve: 'cloth-charcoal', collar: 'lycra-black', cuff: 'lycra-grey', seam: 'lycra-grey' }),

  // A pair of cotton tights laid flat, 220 mm across the hips and 660 mm long unstretched: an elastic waistband, a
  // reinforced panty top with a gusset, two legs tapering to the ankle and the feet turned out with darker toes and
  // heels.
  h.compound('tights', 0.099, [
    flat('waistband', 'band', [[-0.1, 0.3], [0.1, 0.3], [0.1, 0.33], [-0.1, 0.33]], 0, 0.006),
    flat('panty', 'panty', [[-0.1, 0.3], [0.1, 0.3], [0.105, 0.17], [-0.105, 0.17]], 0, 0.004),
    flat('gusset', 'band', [[-0.018, 0.2], [0.018, 0.2], [0.0, 0.17]], 0.004, 0.002),
    flat('leg-l', 'cloth', [[-0.105, 0.17], [-0.004, 0.17], [-0.03, -0.27], [-0.075, -0.27]], 0, 0.004),
    flat('leg-r', 'cloth', [[0.004, 0.17], [0.105, 0.17], [0.075, -0.27], [0.03, -0.27]], 0, 0.004),
    flat('foot-l', 'cloth', [[-0.075, -0.27], [-0.03, -0.27], [-0.05, -0.31], [-0.14, -0.315], [-0.14, -0.28]], 0, 0.004),
    flat('foot-r', 'cloth', [[0.03, -0.27], [0.075, -0.27], [0.14, -0.28], [0.14, -0.315], [0.05, -0.31]], 0, 0.004),
    flat('toe-l', 'band', [[-0.14, -0.315], [-0.115, -0.314], [-0.115, -0.281], [-0.14, -0.28]], 0.004, 0.002),
    flat('toe-r', 'band', [[0.115, -0.314], [0.14, -0.315], [0.14, -0.28], [0.115, -0.281]], 0.004, 0.002),
    flat('heel-l', 'band', [[-0.075, -0.27], [-0.05, -0.27], [-0.05, -0.305], [-0.075, -0.3]], 0.004, 0.002),
    flat('heel-r', 'band', [[0.05, -0.27], [0.075, -0.27], [0.075, -0.3], [0.05, -0.305]], 0.004, 0.002),
  ], { cloth: 'cloth-black', panty: 'cloth-black', band: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A long-sleeved compression top folded, 280 mm by 290 mm and 22 mm tall: blue stretch knit with black panels down
  // the sides and along the sleeves, a crew collar and black cuffs.
  stretchTop('compression_top', 0.2, 0.28, 0.29, 0.022, 0.005, [-0.1, -0.08, 0.08, 0.1],
             { cloth: 'lycra-blue', sleeve: 'lycra-blue', collar: 'lycra-black', cuff: 'lycra-black', seam: 'lycra-black' }),

  // A pair of compression shorts laid flat, 250 mm across and 270 mm long: a wide grey elastic waistband, short close
  // legs with grey bound hems and grey flatlock seams.
  h.compound('compression_shorts', 0.093, [
    flat('waistband', 'band', [[-0.12, 0.1], [0.12, 0.1], [0.12, 0.145], [-0.12, 0.145]], 0, 0.008),
    flat('body', 'cloth', [[-0.12, 0.1], [0.12, 0.1], [0.125, 0.0], [-0.125, 0.0]], 0, 0.006),
    flat('leg-l', 'cloth', [[-0.125, 0.0], [-0.004, 0.0], [-0.012, -0.12], [-0.13, -0.11]], 0, 0.006),
    flat('leg-r', 'cloth', [[0.004, 0.0], [0.125, 0.0], [0.13, -0.11], [0.012, -0.12]], 0, 0.006),
    strip('hem-l', 'hem', [-0.13, -0.105], [-0.012, -0.115], 0.006, 0.012, 0.003),
    strip('hem-r', 'hem', [0.13, -0.105], [0.012, -0.115], 0.006, 0.012, 0.003),
    strip('seam', 'hem', [0, 0.1], [0, 0.0], 0.006, 0.006, 0.002),
    strip('seam-l', 'hem', [-0.07, 0.03], [-0.07, -0.11], 0.006, 0.006, 0.002),
    strip('seam-r', 'hem', [0.07, 0.03], [0.07, -0.11], 0.006, 0.006, 0.002),
  ], { cloth: 'lycra-black', band: 'cloth-heather-grey', hem: 'lycra-grey' })
  + { voxelGrain: 0.004 },

  // A white cotton undershirt folded, 270 mm by 280 mm and 22 mm tall: a V neck, short sleeves folded out and a
  // plain hem.
  local w = 0.27, d = 0.28, ht = 0.022;
  h.compound('undershirt', 0.15, h.foldedGarment(w, d, ht, 2)
                                + vNeck(0.04, d, d / 2 - 0.075, ht, 'bind')
                                + shortSleeves(w, ht, d / 2 - 0.02, 0.085)
                                + [box('hem', 'bind', [-w / 2, ht, -d / 2 + 0.004], [w / 2, ht + 0.003, -d / 2 + 0.016])],
             { cloth: 'cloth-bright-white', sleeve: 'cloth-bright-white', bind: 'cloth-cream', hole: 'cloth-heather-grey' })
  + { voxelGrain: 0.004 },

  // A unitard laid flat, 200 mm across and 800 mm long unstretched: a sleeveless crew-necked top running straight into
  // full-length legs, bound at the neck, armholes and ankles.
  h.compound('unitard', 0.09, [
    flat('body', 'cloth', [[-0.1, -0.05], [0.1, -0.05], [0.1, 0.2], [-0.1, 0.2]], 0, 0.005),
    flat('chest', 'cloth', [[-0.1, 0.2], [0.1, 0.2], [0.055, 0.27], [-0.055, 0.27]], 0, 0.005),
    flat('shoulders', 'cloth', [[-0.055, 0.27], [0.055, 0.27], [0.055, 0.34], [-0.055, 0.34]], 0, 0.005),
    flat('leg-l', 'cloth', [[-0.1, -0.05], [-0.004, -0.05], [-0.025, -0.46], [-0.07, -0.46]], 0, 0.005),
    flat('leg-r', 'cloth', [[0.004, -0.05], [0.1, -0.05], [0.07, -0.46], [0.025, -0.46]], 0, 0.005),
    flat('gusset', 'cloth', [[-0.004, -0.05], [0.004, -0.05], [0.0, -0.06]], 0, 0.005),
    strip('arm-l-a', 'bind', [-0.1, 0.2], [-0.055, 0.27], 0.005, 0.008, 0.003),
    strip('arm-l-b', 'bind', [-0.055, 0.27], [-0.055, 0.34], 0.005, 0.008, 0.003),
    strip('arm-r-a', 'bind', [0.1, 0.2], [0.055, 0.27], 0.005, 0.008, 0.003),
    strip('arm-r-b', 'bind', [0.055, 0.27], [0.055, 0.34], 0.005, 0.008, 0.003),
    strip('ankle-l', 'bind', [-0.07, -0.455], [-0.025, -0.455], 0.005, 0.01, 0.003),
    strip('ankle-r', 'bind', [0.025, -0.455], [0.07, -0.455], 0.005, 0.01, 0.003),
  ] + neck(0.045, 0.34, 0.005, 'bind', 0.008), { cloth: 'cloth-purple', bind: 'lycra-black', hole: 'void-black' })
  + { voxelGrain: 0.004 },
]
