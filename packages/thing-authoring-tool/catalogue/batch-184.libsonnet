local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;
local flat = g.flat;
local strip = g.strip;

// Shirts, tops and dresses as found on a shelf: folded on h.foldedGarment, `w` across x and `d` along z, top face at
// `ht`, neck at the +z end and the hem folded under at -z. Flat-packed lycra and the two flotation vests lie flat,
// outside up, front to +z.

// Short sleeves folded out from each shoulder, `reach` past the body, `len` along z from `z1` down; a hem band in
// slot `cuff` along the outer edge.
local shortSleeves(w, ht, z1, len, reach=0.035, cuff='sleeve', t=0.006) = std.flattenArrays([
  [
    g.sbox('sleeve-' + s, 'sleeve', [sg * (w / 2 - 0.03), ht * 0.4, z1 - len], [sg * (w / 2 + reach), ht + t, z1]),
    g.sbox('sleeve-hem-' + s, cuff, [sg * (w / 2 + reach - 0.012), ht * 0.4, z1 - len - 0.002], [sg * (w / 2 + reach + 0.002), ht + t + 0.002, z1 + 0.002]),
  ]
  for s in ['l', 'r']
  for sg in [if s == 'l' then -1 else 1]
]);

// A band wrapped across the bundle at z, over the top and down both sides: hems, trim and belts.
local bandX(id, slot, z, bw, w, ht, t=0.004) = [
  box(id + '-top', slot, [-w / 2 - t, ht, z - bw / 2], [w / 2 + t, ht + t, z + bw / 2]),
  box(id + '-left', slot, [-w / 2 - t, 0, z - bw / 2], [-w / 2, ht + t, z + bw / 2]),
  box(id + '-right', slot, [w / 2, 0, z - bw / 2], [w / 2 + t, ht + t, z + bw / 2]),
];

// The two armholes of a sleeveless top, cut into each side edge at z (slot hole) and bound round in slot `bind`.
local armholes(w, z, r, y, bind, bw=0.012) =
  h.crescent('armhole-l', 'hole', 0.004, r, 0, 180, 8, y, y + 0.002, -w / 2, z)
  + h.crescent('armhole-r', 'hole', 0.004, r, 180, 360, 8, y, y + 0.002, w / 2, z)
  + h.crescent('armhole-bind-l', bind, r, r + bw, 0, 180, 8, y, y + 0.005, -w / 2, z)
  + h.crescent('armhole-bind-r', bind, r, r + bw, 180, 360, 8, y, y + 0.005, w / 2, z);

// A scoop or round neck at [0, cz]: the shadowed opening (slot hole) and its rib binding.
local neck(r, cz, y, bind, bw=0.01) =
  h.crescent('neck-hole', 'hole', 0.004, r, 90, 270, 8, y, y + 0.002, 0, cz)
  + h.crescent('neck-bind', bind, r, r + bw, 90, 270, 8, y, y + 0.005, 0, cz);

// A V neck reaching down to vz from a mouth `half` wide at the +z edge: a dark triangle and two trim strips.
local vNeck(half, d, vz, y, bind, bw=0.012) = [
  flat('neck-hole', 'hole', [[-half, d / 2], [half, d / 2], [0, vz]], y, 0.002),
  strip('neck-bind-l', bind, [-half - bw / 2, d / 2], [0, vz - bw / 2], y, bw, 0.005),
  strip('neck-bind-r', bind, [half + bw / 2, d / 2], [0, vz - bw / 2], y, bw, 0.005),
];

// Ruffles: a row of small rolls along x at z, lying on y, for frills on aprons and hems.
local ruffle(prefix, slot, x0, x1, z, y, r=0.006, n=10) = [
  local step = (x1 - x0) / n;
  h.turned('%s-%d' % [prefix, i], slot, 'z', [[0, 0], [0, r], [r * 1.6, r], [r * 1.6, 0]], [x0 + step * (i + 0.5), y, z - r * 0.8])
  for i in std.range(0, n - 1)
];

// A dress folded long: a top with sleeves, a waist seam and the skirt below it. Slots: cloth, waist, and the
// jacket's slots used by the options.
local dress(w, d, ht, waistZ, o={}) =
  g.jacket({ w: w, d: d, ht: ht, front: 'none', buttons: [], collar: null } + o)
  + [box('waist-seam', 'waist', [-w / 2 - 0.002, ht, waistZ - 0.006], [w / 2 + 0.002, ht + 0.003, waistZ + 0.006])];

// A maid's dress folded long with a frilled white apron laid over the skirt, a white collar and white cuffs. Slots:
// cloth, sleeve, cuff, collar, apron, frill, bow, hole, waist.
local maidDress(id, mass, w, d, ht, finishCloth) =
  local cz = d / 2 - 0.05, waistZ = d / 2 - 0.15, top = ht + 0.006;
  h.compound(id, mass, dress(w, d, ht, waistZ, { sleeves: { kind: 'flat', w: 0.06, t: 0.006 } })
                       + neck(0.04, d / 2 - 0.005, ht, 'collar', 0.018)
                       + [
                         flat('collar-l', 'collar', [[-0.005, cz - 0.04], [-0.06, cz - 0.03], [-0.06, cz + 0.005], [-0.04, cz + 0.02]], ht, 0.005),
                         flat('collar-r', 'collar', [[0.005, cz - 0.04], [0.06, cz - 0.03], [0.06, cz + 0.005], [0.04, cz + 0.02]], ht, 0.005),
                         box('cuff-l', 'cuff', [-w / 2 - 0.002, ht, -d / 2 + 0.015], [-w / 2 + 0.062, top + 0.003, -d / 2 + 0.04]),
                         box('cuff-r', 'cuff', [w / 2 - 0.062, ht, -d / 2 + 0.015], [w / 2 + 0.002, top + 0.003, -d / 2 + 0.04]),
                         flat('apron', 'apron', [[-0.09, waistZ], [0.09, waistZ], [0.11, -d / 2 + 0.03], [-0.11, -d / 2 + 0.03]], top, 0.004),
                         flat('apron-bib', 'apron', [[-0.055, waistZ], [0.055, waistZ], [0.05, cz - 0.05], [-0.05, cz - 0.05]], ht, 0.004),
                         box('apron-band', 'apron', [-w / 2 - 0.004, 0, waistZ - 0.012], [w / 2 + 0.004, top + 0.004, waistZ + 0.012]),
                         flat('bow-l', 'bow', [[-0.012, waistZ], [-0.05, waistZ + 0.02], [-0.05, waistZ - 0.02]], top + 0.004, 0.008),
                         flat('bow-r', 'bow', [[0.012, waistZ], [0.05, waistZ + 0.02], [0.05, waistZ - 0.02]], top + 0.004, 0.008),
                         box('bow-knot', 'bow', [-0.013, top + 0.004, waistZ - 0.012], [0.013, top + 0.014, waistZ + 0.012]),
                       ]
                       + ruffle('frill', 'frill', -0.115, 0.115, -d / 2 + 0.03, top, 0.006, 12)
                       + [strip('frill-l', 'frill', [-0.112, -d / 2 + 0.035], [-0.093, waistZ - 0.012], top, 0.012, 0.006)]
                       + [strip('frill-r', 'frill', [0.112, -d / 2 + 0.035], [0.093, waistZ - 0.012], top, 0.012, 0.006)],
             { cloth: finishCloth, sleeve: finishCloth, waist: finishCloth, collar: 'cloth-bright-white', cuff: 'cloth-bright-white', apron: 'cloth-bright-white', frill: 'mesh-white', bow: 'cloth-bright-white', hole: 'cloth-charcoal' })
  + { voxelGrain: 0.004 };

// A short black and red dress with a mandarin collar, red trim and a red waist tie knotted at the side with its ends
// hanging straight, sleeved or sleeveless. Slots: cloth, sleeve, collar, trim, tie, waist, hole, bind.
local ninjaDress(id, mass, ht, sleeved) =
  local w = 0.3, d = 0.34, cz = d / 2 - 0.07, waistZ = d / 2 - 0.15;
  local top = ht + (if sleeved then 0.006 else 0);
  h.compound(id, mass, dress(w, d, ht, waistZ, if sleeved then { sleeves: { kind: 'flat', w: 0.06, t: 0.006 } } else {})
                       + (if sleeved then [
                            box('cuff-l', 'trim', [-w / 2 - 0.002, ht, -d / 2 + 0.015], [-w / 2 + 0.062, top + 0.003, -d / 2 + 0.035]),
                            box('cuff-r', 'trim', [w / 2 - 0.062, ht, -d / 2 + 0.015], [w / 2 + 0.002, top + 0.003, -d / 2 + 0.035]),
                          ] else armholes(w, d / 2 - 0.08, 0.05, ht, 'trim'))
                       + h.crescent('collar', 'collar', 0.045, 0.06, -150, 150, 12, ht, ht + 0.016, 0, cz)
                       + [
                         strip('wrap-edge', 'trim', [-0.045, cz - 0.03], [0.07, waistZ + 0.01], ht, 0.012, 0.004),
                       ]
                       + bandX('hem', 'trim', -d / 2 + 0.03, 0.025, w, ht, 0.004)
                       + [
                         box('tie-knot', 'tie', [-0.105, top, waistZ - 0.014], [-0.077, top + 0.008, waistZ + 0.014]),
                         strip('tie-a', 'tie', [-0.099, waistZ - 0.012], [-0.101, waistZ - 0.12], top, 0.01, 0.004),
                         strip('tie-b', 'tie', [-0.083, waistZ - 0.012], [-0.077, waistZ - 0.1], top, 0.01, 0.004),
                       ],
             { cloth: 'cloth-black', sleeve: 'cloth-black', waist: 'cloth-red', collar: 'cloth-red', trim: 'cloth-red', tie: 'cloth-red', hole: 'cloth-charcoal' })
  + { voxelGrain: 0.004 };

[
  // A foam life vest laid flat, front up, 500 mm wide and 560 mm long with 60 mm thick panels: two front panels of
  // ribbed foam either side of the opening, a thick collar roll across the back of the neck, the armholes, and three
  // black straps with buckles across the front.
  local w = 0.5, d = 0.56, t = 0.06, gap = 0.012, z0 = -d / 2, z1 = d / 2 - 0.1;
  h.compound('flotation_vest', 0.64, [
    box('back', 'shell', [-w / 2 + 0.02, 0, z0 + 0.01], [w / 2 - 0.02, 0.02, d / 2 - 0.04]),
    h.turned('collar', 'shell', 'x', [[0, 0], [0, 0.04], [0.26, 0.04], [0.26, 0]], [-0.13, 0.04, d / 2 - 0.05]),
    flat('opening', 'hole', [[-gap, z0], [gap, z0], [0.06, z1 + 0.02], [-0.06, z1 + 0.02]], 0.02, 0.002),
  ] + std.flattenArrays([
    local sg = if s == 'l' then -1 else 1;
    [
      g.sbox('panel-' + s, 'shell', [sg * gap, 0.01, z0], [sg * (w / 2 - 0.025), t - 0.008, z1]),
      g.sbox('shoulder-' + s, 'shell', [sg * 0.08, 0.01, z1 - 0.02], [sg * 0.16, t - 0.016, d / 2 - 0.06]),
      g.sbox('armhole-' + s, 'hole', [sg * (w / 2 - 0.07), t - 0.008, z1 - 0.14], [sg * (w / 2 - 0.025), t - 0.006, z1 - 0.02]),
    ] + [
      h.turned('rib-%s-%d' % [s, i], 'shell', 'z', [[0, 0], [0, 0.012], [z1 - z0 - 0.17, 0.012], [z1 - z0 - 0.17, 0]], [sg * (gap + 0.03 + i * 0.05), t - 0.012, z0 + 0.01])
      for i in std.range(0, 3)
    ]
    for s in ['l', 'r']
  ]) + std.flattenArrays([
    [
      box('strap-%d' % i, 'strap', [-w / 2 + 0.02, t - 0.004, z], [w / 2 - 0.02, t, z + 0.025]),
      box('buckle-%d' % i, 'buckle', [-0.025, t, z - 0.004], [0.025, t + 0.008, z + 0.029]),
    ]
    for i in std.range(0, 2)
    for z in [z0 + 0.04 + i * 0.1]
  ]) + [
    box('label', 'label', [-0.16, t - 0.006, 0.02], [-0.07, t - 0.002, 0.07]),
  ], { shell: 'cloth-safety-orange', hole: 'cloth-charcoal', strap: 'webbing-black', buckle: 'plastic-matte-black', label: 'reflective-yellow' })
  + { voxelGrain: 0.004 },

  // A makeshift float laid flat, front up, about 360 mm by 500 mm and 120 mm tall: four inflated hides, each tied shut
  // at the neck and bound round with two leather bands, lashed in two rows onto a flat rawhide harness with flat
  // shoulder straps and a tie belt.
  local skins = [[-0.1, -0.12], [0.1, -0.12], [-0.1, 0.1], [0.1, 0.1]];
  h.compound('flotation_vest_makeshift', 0.8, [
    box('harness', 'harness', [-0.18, 0.0, -0.24], [0.18, 0.004, 0.2]),
  ] + [
    h.turned('skin-%d' % i, 'skin', 'z', [[0, 0], [0.015, 0.035], [0.05, 0.055], [0.12, 0.058], [0.17, 0.045], [0.19, 0.02], [0.195, 0]], [skins[i][0], 0.058, skins[i][1] - 0.1])
    for i in std.range(0, 3)
  ] + [
    h.turned('neck-%d' % i, 'cord', 'z', [[0, 0], [0, 0.012], [0.016, 0.012], [0.016, 0]], [skins[i][0], 0.058, skins[i][1] + 0.09])
    for i in std.range(0, 3)
  ] + [
    h.turned('spout-%d' % i, 'skin', 'z', [[0, 0], [0, 0.009], [0.02, 0.011], [0.02, 0]], [skins[i][0], 0.058, skins[i][1] + 0.105])
    for i in std.range(0, 3)
  ] + [
    h.turned('band-%d-%d' % [i, j], 'strap', 'z', [[0, 0.05], [0, 0.06], [0.014, 0.06], [0.014, 0.05]], [skins[i][0], 0.058, skins[i][1] - 0.1 + [0.045, 0.125][j]])
    for i in std.range(0, 3)
    for j in [0, 1]
  ] + [
    strip('shoulder-l', 'strap', [-0.08, 0.2], [-0.11, 0.3], 0.0, 0.03, 0.006),
    strip('shoulder-r', 'strap', [0.08, 0.2], [0.11, 0.3], 0.0, 0.03, 0.006),
    strip('belt', 'strap', [-0.18, -0.22], [0.18, -0.22], 0.0, 0.03, 0.006),
    strip('tie-a', 'strap', [0.18, -0.22], [0.24, -0.25], 0.0, 0.016, 0.006),
    strip('tie-b', 'strap', [-0.18, -0.22], [-0.24, -0.24], 0.0, 0.016, 0.006),
  ], { skin: 'skin-rawhide', harness: 'skin-rawhide', strap: 'leather-tan', cord: 'skin-rawhide' })
  + { voxelGrain: 0.004 },

  // A cotton halter top laid flat, about 260 mm wide and 240 mm long: a short body under two cups that rise to a
  // halter neck tie, with ties trailing from the neck and a tie-back at the hem.
  h.compound('halter_top', 0.094, [
    flat('body', 'cloth', [[-0.13, -0.12], [0.13, -0.12], [0.12, 0.0], [-0.12, 0.0]], 0, 0.008),
    flat('cup-l', 'cloth', [[-0.12, 0.0], [-0.005, 0.0], [-0.03, 0.09], [-0.06, 0.095]], 0, 0.01),
    flat('cup-r', 'cloth', [[0.005, 0.0], [0.12, 0.0], [0.06, 0.095], [0.03, 0.09]], 0, 0.01),
    strip('seam-l', 'trim', [-0.115, 0.0], [-0.01, 0.0], 0.01, 0.008, 0.003),
    strip('seam-r', 'trim', [0.01, 0.0], [0.115, 0.0], 0.01, 0.008, 0.003),
    strip('gather', 'trim', [0, -0.004], [0, 0.03], 0.01, 0.01, 0.004),
    strip('strap-l', 'trim', [-0.045, 0.09], [-0.015, 0.14], 0.0, 0.012, 0.006),
    strip('strap-r', 'trim', [0.045, 0.09], [0.015, 0.14], 0.0, 0.012, 0.006),
    box('knot', 'trim', [-0.014, 0.0, 0.132], [0.014, 0.012, 0.152]),
    strip('tie-a', 'trim', [-0.004, 0.15], [-0.03, 0.2], 0.0, 0.01, 0.005),
    strip('tie-b', 'trim', [0.004, 0.15], [0.035, 0.195], 0.0, 0.01, 0.005),
    strip('hem', 'trim', [-0.13, -0.115], [0.13, -0.115], 0.008, 0.012, 0.003),
    strip('back-tie-a', 'trim', [-0.13, -0.11], [-0.17, -0.14], 0.0, 0.01, 0.005),
    strip('back-tie-b', 'trim', [0.13, -0.11], [0.17, -0.135], 0.0, 0.01, 0.005),
  ], { cloth: 'cloth-yellow', trim: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A cropped hoodie folded, 320 mm by 230 mm and 50 mm tall: the hood folded down over the neck, a kangaroo pocket,
  // drawcords, the sleeves folded in along the sides with ribbed cuffs, and a ribbed hem band that stops short.
  local w = 0.32, d = 0.23, ht = 0.05;
  h.compound('hoodie_cropped', 0.62, g.jacket({ w: w, d: d, ht: ht, front: 'none', buttons: [], collar: null, neck: 0.06, sleeves: { kind: 'flat', w: 0.07, t: 0.007 }, hood: { w: 0.18, l: 0.1, t: 0.012 } })
                                      + [
                                        box('cuff-l', 'cuff', [-w / 2 - 0.002, ht, -d / 2 + 0.03], [-w / 2 + 0.072, ht + 0.011, -d / 2 + 0.05]),
                                        box('cuff-r', 'cuff', [w / 2 - 0.072, ht, -d / 2 + 0.03], [w / 2 + 0.002, ht + 0.011, -d / 2 + 0.05]),
                                        flat('pocket', 'pocket', [[-0.06, -d / 2 + 0.03], [0.06, -d / 2 + 0.03], [0.045, -0.0], [-0.045, -0.0]], ht, 0.004),
                                        strip('cord-l', 'cord', [-0.03, d / 2 - 0.1], [-0.035, 0.0], ht + 0.012, 0.005, 0.004),
                                        strip('cord-r', 'cord', [0.03, d / 2 - 0.1], [0.035, 0.005], ht + 0.012, 0.005, 0.004),
                                      ]
                                      + bandX('hem', 'cuff', -d / 2 + 0.012, 0.022, w, ht, 0.004),
             { cloth: 'cloth-purple', sleeve: 'cloth-purple', hood: 'cloth-purple', cuff: 'cloth-charcoal', pocket: 'cloth-purple', cord: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A sports jersey folded, 300 mm by 280 mm and 30 mm tall: a white V neck, short sleeves with white stripes at the
  // hem, white side panels and a big white number seven on the chest.
  local w = 0.3, d = 0.28, ht = 0.03;
  h.compound('jersey', 0.2, h.foldedGarment(w, d, ht, 3)
                             + vNeck(0.04, d, d / 2 - 0.07, ht, 'trim')
                             + shortSleeves(w, ht, d / 2 - 0.02, 0.09, 0.035, 'trim')
                             + [
                               box('side-l', 'trim', [-w / 2, ht, -d / 2], [-w / 2 + 0.02, ht + 0.003, d / 2 - 0.12]),
                               box('side-r', 'trim', [w / 2 - 0.02, ht, -d / 2], [w / 2, ht + 0.003, d / 2 - 0.12]),
                               strip('number-top', 'trim', [-0.045, 0.03], [0.045, 0.03], ht, 0.022, 0.004),
                               strip('number-stem', 'trim', [-0.035, 0.03], [0.02, -0.1], ht, 0.024, 0.004),
                             ],
             { cloth: 'lycra-blue', sleeve: 'lycra-blue', trim: 'cloth-bright-white', hole: 'cloth-navy' })
  + { voxelGrain: 0.004 },

  // A leotard laid flat, about 260 mm wide and 380 mm long: thin shoulder straps, a scoop neck, the body narrowing to
  // a high-cut crotch, and its leg openings bound in a contrasting trim.
  h.compound('leotard', 0.091, [
    flat('body', 'cloth', [[-0.1, 0.1], [0.1, 0.1], [0.095, -0.04], [-0.095, -0.04]], 0, 0.008),
    flat('hips', 'cloth', [[-0.095, -0.04], [0.095, -0.04], [0.025, -0.17], [-0.025, -0.17]], 0, 0.008),
    box('crotch', 'cloth', [-0.025, 0, -0.19], [0.025, 0.008, -0.17]),
    flat('chest-l', 'cloth', [[-0.1, 0.1], [-0.04, 0.1], [-0.06, 0.15], [-0.085, 0.15]], 0, 0.008),
    flat('chest-r', 'cloth', [[0.04, 0.1], [0.1, 0.1], [0.085, 0.15], [0.06, 0.15]], 0, 0.008),
    strip('strap-l', 'cloth', [-0.074, 0.145], [-0.06, 0.19], 0, 0.014, 0.006),
    strip('strap-r', 'cloth', [0.074, 0.145], [0.06, 0.19], 0, 0.014, 0.006),
    strip('leg-l', 'trim', [-0.097, -0.035], [-0.027, -0.175], 0.008, 0.008, 0.003),
    strip('leg-r', 'trim', [0.097, -0.035], [0.027, -0.175], 0.008, 0.008, 0.003),
  ] + h.crescent('neck', 'trim', 0.05, 0.058, 90, 270, 8, 0.008, 0.011, 0, 0.152), { cloth: 'lycra-red', trim: 'lycra-black' })
  + { voxelGrain: 0.004 },

  // A long-sleeved cotton shirt folded, 300 mm by 300 mm and 40 mm tall: a turned-down collar, a buttoned placket,
  // the sleeves folded in along the sides with buttoned cuffs, and one chest pocket.
  local w = 0.3, d = 0.3, ht = 0.04;
  h.compound('longshirt', 0.3, g.jacket({ w: w, d: d, ht: ht, neck: 0.06, collar: { r: 0.045, wd: 0.022, ht: 0.01, gap: 40 }, frontW: 0.026, buttons: 5, buttonR: 0.005, sleeves: { kind: 'flat', w: 0.065, t: 0.006 }, pockets: [{ x: -0.07, z: 0.0, w: 0.07, d: 0.075, flap: 0, single: true }] })
                                 + [
                                   box('cuff-l', 'cuff', [-w / 2 - 0.002, ht, -d / 2 + 0.03], [-w / 2 + 0.067, ht + 0.009, -d / 2 + 0.06]),
                                   box('cuff-r', 'cuff', [w / 2 - 0.067, ht, -d / 2 + 0.03], [w / 2 + 0.002, ht + 0.009, -d / 2 + 0.06]),
                                 ]
                                 + g.buttons('cuff-button-l', 'button', -w / 2 + 0.033, [-d / 2 + 0.045], ht + 0.009, 0.005)
                                 + g.buttons('cuff-button-r', 'button', w / 2 - 0.033, [-d / 2 + 0.045], ht + 0.009, 0.005),
             { cloth: 'cloth-green', collar: 'cloth-green', front: 'cloth-green', sleeve: 'cloth-green', cuff: 'cloth-green', pocket: 'cloth-green', button: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A blue maid's dress folded long, 320 mm by 400 mm and 50 mm tall, with its frilled white apron, collar and cuffs.
  maidDress('maid_dress', 0.7, 0.32, 0.4, 0.05, 'cloth-blue'),

  // The short black version, folded smaller: 300 mm by 320 mm and 35 mm tall.
  maidDress('maid_dress_short', 0.45, 0.3, 0.32, 0.035, 'cloth-black'),

  // A short off-white costume dress folded, 300 mm by 340 mm and 30 mm tall, printed with crossing bandage wraps and
  // with torn wrap ends hanging off the hem.
  local w = 0.3, d = 0.34, ht = 0.03, top = ht + 0.006;
  h.compound('mummy_dress', 0.4, dress(w, d, ht, d / 2 - 0.15, { sleeves: { kind: 'flat', w: 0.06, t: 0.006 } })
                                  + neck(0.04, d / 2 - 0.005, ht, 'wrap', 0.012)
                                  + [
                                    strip('wrap-%d' % i, 'wrap', [-w / 2, 0.12 - i * 0.07], [w / 2, 0.15 - i * 0.07 - (i % 2) * 0.05], top, 0.02, 0.003)
                                    for i in std.range(0, 3)
                                  ]
                                  + [
                                    strip('wrap-x-%d' % i, 'wrap', [-0.09 + i * 0.1, d / 2 - 0.06], [-0.03 + i * 0.1, -d / 2 + 0.02], ht + 0.003, 0.016, 0.003)
                                    for i in std.range(0, 1)
                                  ]
                                  + [
                                    strip('tatter-%d' % i, 'wrap', [-0.1 + i * 0.07, -d / 2 + 0.01], [-0.11 + i * 0.07 + (i % 2) * 0.03, -d / 2 - 0.035 - (i % 2) * 0.015], 0.0, 0.012, 0.003)
                                    for i in std.range(0, 3)
                                  ],
             { cloth: 'cloth-cream', sleeve: 'cloth-cream', waist: 'cloth-rag', wrap: 'cloth-rag', hole: 'cloth-rag-shadow' })
  + { voxelGrain: 0.004 },

  // A short black dress folded, 300 mm by 340 mm and 40 mm tall: sleeves folded along the sides with red cuffs, a red
  // mandarin collar and wrap edge, a red hem band and a red waist tie with straight hanging ends.
  ninjaDress('ninja_dress', 0.63, 0.04, true),

  // The sleeveless cut of the same dress, its armholes bound in red.
  ninjaDress('ninja_dress_sleeveless', 0.59, 0.04, false),

  // A cotton polo shirt folded, 300 mm by 290 mm and 35 mm tall: a flat knit collar, a three-button placket, short
  // sleeves with ribbed bands and a small embroidered logo.
  local w = 0.3, d = 0.29, ht = 0.035;
  h.compound('polo_shirt', 0.25, g.jacket({ w: w, d: d, ht: ht, neck: 0.06, collar: { r: 0.042, wd: 0.026, ht: 0.008, gap: 30 }, frontW: 0.024, buttons: [0.04, 0.015, -0.01], buttonR: 0.005 })
                                  + [box('placket-end', 'front', [-0.012, ht, -0.02], [0.012, ht + 0.005, -0.012])]
                                  + shortSleeves(w, ht, d / 2 - 0.02, 0.085, 0.035, 'collar')
                                  + [box('logo', 'logo', [0.06, ht, 0.02], [0.085, ht + 0.004, 0.04])],
             { cloth: 'cloth-navy', collar: 'cloth-navy', front: 'cloth-navy', sleeve: 'cloth-navy', button: 'cloth-cream', logo: 'cloth-red' })
  + { voxelGrain: 0.004 },

  // A light blue work shirt folded, 300 mm by 300 mm and 40 mm tall: a pointed collar, a buttoned placket, two flapped
  // chest pockets with buttons, an embroidered patch on the left sleeve and short sleeves.
  local w = 0.3, d = 0.3, ht = 0.04;
  h.compound('postman_shirt', 0.3, g.jacket({ w: w, d: d, ht: ht, neck: 0.06, collar: { r: 0.045, wd: 0.022, ht: 0.01, gap: 40 }, frontW: 0.026, buttons: 5, buttonR: 0.005, pockets: [{ x: 0.07, z: 0.0, w: 0.07, d: 0.08, flap: 0.025, snap: true }] })
                                     + shortSleeves(w, ht, d / 2 - 0.02, 0.09, 0.035)
                                     + [
                                       box('patch', 'patch', [-w / 2 - 0.03, ht + 0.006, d / 2 - 0.09], [-w / 2 + 0.005, ht + 0.01, d / 2 - 0.05]),
                                       box('patch-eagle', 'mark', [-w / 2 - 0.02, ht + 0.01, d / 2 - 0.08], [-w / 2 - 0.005, ht + 0.012, d / 2 - 0.06]),
                                     ],
             { cloth: 'cloth-denim-faded', collar: 'cloth-denim-faded', front: 'cloth-denim-faded', sleeve: 'cloth-denim-faded', pocket: 'cloth-denim-faded', flap: 'cloth-denim-faded', button: 'cloth-cream', patch: 'cloth-navy', mark: 'cloth-white' })
  + { voxelGrain: 0.004 },

  // A red velvet-look party dress folded, 320 mm by 360 mm and 60 mm tall: white faux fur on the collar, the cuffs of
  // the sleeves folded at the sides and round the hem, and a black belt with a gold buckle at the waist.
  local w = 0.32, d = 0.36, ht = 0.06, waistZ = d / 2 - 0.15;
  h.compound('santa_dress', 1.2, dress(w, d, ht, waistZ, { sleeves: { kind: 'flat', w: 0.065, t: 0.008 } })
                                 + [
                                   h.turned('collar', 'fur', 'x', [[0, 0], [0, 0.018], [0.16, 0.018], [0.16, 0]], [-0.08, ht + 0.008, d / 2 - 0.025]),
                                   box('cuff-l', 'fur', [-w / 2 - 0.003, ht, -d / 2 + 0.015], [-w / 2 + 0.068, ht + 0.018, -d / 2 + 0.05]),
                                   box('cuff-r', 'fur', [w / 2 - 0.068, ht, -d / 2 + 0.015], [w / 2 + 0.003, ht + 0.018, -d / 2 + 0.05]),
                                   box('belt-buckle', 'buckle', [-0.03, ht + 0.01, waistZ - 0.022], [0.03, ht + 0.016, waistZ + 0.022]),
                                   box('belt-hole', 'belt', [-0.018, ht + 0.011, waistZ - 0.011], [0.018, ht + 0.017, waistZ + 0.011]),
                                 ]
                                 + bandX('hem-fur', 'fur', -d / 2 + 0.075, 0.04, w, ht + 0.008, 0.012)
                                 + bandX('belt', 'belt', waistZ, 0.03, w, ht + 0.004, 0.005),
             { cloth: 'cloth-red', sleeve: 'cloth-red', waist: 'cloth-red', fur: 'fur-pale', belt: 'leather-black', buckle: 'metal-gold' })
  + { voxelGrain: 0.004 },
]
