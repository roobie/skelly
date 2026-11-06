local h = import '../compound.libsonnet';
local box = h.box;

// A flat strip `w` wide and `t` thick lying on y from [xa, za] to [xb, zb]: lapels, plackets, seams.
local strip(id, slot, a, b, y, w, t=0.003) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  h.prism(id, slot, 'y', [[a[1] + nz, a[0] + nx], [b[1] + nz, b[0] + nx], [b[1] - nz, b[0] - nx], [a[1] - nz, a[0] - nx]], y, y + t);

// A flat ellipse centred on [cx, cz] lying on y from y0 to y1, as a convex polygon of n sides.
local ellipse(id, slot, cx, cz, rx, rz, y0, y1, n=14) = h.prism(id, slot, 'y', [
  [cz + rz * std.cos(2 * std.pi * i / n), cx + rx * std.sin(2 * std.pi * i / n)]
  for i in std.range(0, n - 1)
], y0, y1);

// A garment folded on the floor, w wide, d deep and ht high, its folded edge at -z and its front opening on +z.
local folded(w, d, ht, folds) = h.foldedGarment(w, d, ht, folds);

// The collar of a folded garment: a band round the back half of the neck, centred near the back edge, on top.
local collar(prefix, slot, d, y, r, band, t=0.004) =
  h.crescent(prefix, slot, r, r + band, 90, 270, 8, y, y + t, 0, -d / 2 + r + band + 0.01);

// A sash or belt wrapped round a folded stack across z, over the top and down both sides. Slot `slot`.
local wrap(prefix, slot, w, ht, z, bw, t=0.005) = [
  box(prefix + '-top', slot, [-w / 2 - t, ht, z - bw / 2], [w / 2 + t, ht + t, z + bw / 2]),
  box(prefix + '-l', slot, [-w / 2 - t, 0, z - bw / 2], [-w / 2, ht + t, z + bw / 2]),
  box(prefix + '-r', slot, [w / 2, 0, z - bw / 2], [w / 2 + t, ht + t, z + bw / 2]),
];

// Two belt or sash ends hanging from a knot on top down over the front edge. Slot `slot`.
local hangingEnds(prefix, slot, x, y, d, bw, t=0.005, z=0) = [
  box(prefix + '-knot', slot, [x - bw * 0.7, y, z - bw * 0.6], [x + bw * 0.7, y + t * 2, z + bw * 0.6]),
  box(prefix + '-end-a', slot, [x - bw * 0.9, y, z + bw * 0.6], [x - bw * 0.1, y + t, d / 2 + t]),
  box(prefix + '-end-b', slot, [x + bw * 0.1, y, z + bw * 0.6], [x + bw * 0.9, y + t, d / 2 + t]),
  box(prefix + '-drop-a', slot, [x - bw * 0.9, y * 0.2, d / 2], [x - bw * 0.1, y + t, d / 2 + t]),
  box(prefix + '-drop-b', slot, [x + bw * 0.1, y * 0.35, d / 2], [x + bw * 0.9, y + t, d / 2 + t]),
];

// A hood lying folded flat on the back half of the top, its opening towards the front showing a lining.
// Slots: hood, lining.
local hood(w, d, ht) =
  local cz = -d * 0.08, rx = w * 0.3, rz = d * 0.3;
  [
    ellipse('hood', 'hood', 0, cz, rx, rz, ht, ht + 0.012),
    h.prism('hood-tip', 'hood', 'y', [[cz - rz * 0.6, -rx * 0.55], [cz - rz * 0.6, rx * 0.55], [cz - rz * 1.3, 0]], ht, ht + 0.012),
    ellipse('hood-opening', 'lining', 0, cz + rz * 0.35, rx * 0.62, rz * 0.5, ht + 0.012, ht + 0.015),
  ];

// A martial arts jacket folded with its thick lapel band crossing left over right from the collar to the hem.
// Slots: cloth, lapel.
local giJacket(w, d, ht, folds, lapelW, lapelT) =
  local zc = -d / 2 + 0.03;
  folded(w, d, ht, folds)
  + collar('collar', 'lapel', d, ht, 0.045, lapelW * 0.8, lapelT)
  + [
    strip('lapel-under', 'lapel', [0.055, zc + 0.04], [-0.01, d / 2 - 0.005], ht, lapelW, lapelT * 0.8),
    strip('lapel-over', 'lapel', [-0.055, zc + 0.04], [0.02, d / 2 - 0.005], ht + lapelT * 0.8, lapelW, lapelT),
  ];

// A grid of stitched seams over the top of a patched robe: `nx` by `nz` patches inside a border band.
// Slots: seam, border.
local patchwork(w, d, ht, nx, nz, border) =
  [
    box('border-back', 'border', [-w / 2, ht, -d / 2 + 0.01], [w / 2, ht + 0.002, -d / 2 + 0.01 + border]),
    box('border-front', 'border', [-w / 2, ht, d / 2 - border], [w / 2, ht + 0.002, d / 2]),
    box('border-l', 'border', [-w / 2, ht, -d / 2 + 0.01], [-w / 2 + border, ht + 0.002, d / 2]),
    box('border-r', 'border', [w / 2 - border, ht, -d / 2 + 0.01], [w / 2, ht + 0.002, d / 2]),
  ] + [
    box('seam-x-%d' % i, 'seam', [x - 0.002, ht, -d / 2 + 0.01 + border], [x + 0.002, ht + 0.003, d / 2 - border])
    for i in std.range(1, nx - 1)
    for x in [-w / 2 + border + (w - 2 * border) * i / nx]
  ] + [
    box('seam-z-%d-%d' % [i, j], 'seam', [x0, ht, z - 0.002], [x0 + (w - 2 * border) / nx, ht + 0.003, z + 0.002])
    for i in std.range(0, nx - 1)
    for x0 in [-w / 2 + border + (w - 2 * border) * i / nx]
    for j in std.range(1, nz - 1)
    for z in [-d / 2 + 0.01 + border + (d - 0.01 - 2 * border) * (j + (if i % 2 == 0 then 0 else 0.4)) / nz]
    if z < d / 2 - border - 0.01
  ];

[
  // A light nylon jacket folded to 300 mm by 240 mm and 36 mm high: the hood rolled into the collar at the back,
  // a black zip running from the collar down the middle and over the front edge, and an elastic hem band.
  h.compound('jacket_windbreaker', 0.3, folded(0.3, 0.24, 0.036, 3) + [
    h.turned('hood-roll', 'hood', 'x', [[0, 0], [0, 0.014], [0.2, 0.014], [0.2, 0]], [-0.1, 0.036 + 0.01, -0.09]),
    box('zip', 'zip', [-0.004, 0.036, -0.075], [0.004, 0.039, 0.122]),
    box('zip-drop', 'zip', [-0.004, 0.004, 0.12], [0.004, 0.039, 0.123]),
    box('zip-pull', 'zip', [-0.004, 0.035, 0.123], [0.004, 0.039, 0.135]),
    box('zip-pull-tab', 'zip', [-0.006, 0.039, -0.07], [0.006, 0.042, -0.05]),
    box('hem', 'hem', [-0.15, 0.036, 0.1], [0.15, 0.038, 0.12]),
  ], { cloth: 'nylon-red', hood: 'nylon-red', zip: 'plastic-matte-black', hem: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },

  // A heavy cotton judo jacket folded to 300 mm by 240 mm and 50 mm high in four folds, its thick quilted lapel
  // crossing left over right, with the trousers folded inside and a white belt tied round the bundle.
  h.compound('judo_gi', 0.89, giJacket(0.3, 0.24, 0.05, 4, 0.04, 0.008)
    + wrap('belt', 'belt', 0.3, 0.05, 0.06, 0.04, 0.006)
    + hangingEnds('belt', 'belt', 0.08, 0.056, 0.24, 0.04, 0.006, 0.06), {
    cloth: 'cloth-cream',
    lapel: 'cloth-white',
    belt: 'cloth-white',
  })
  + { voxelGrain: 0.004 },

  // A light cotton karate uniform folded to 300 mm by 240 mm and 40 mm high in three folds: a narrow lapel crossing
  // left over right, the trousers folded inside and a black belt tied round the bundle.
  h.compound('karate_gi', 0.69, giJacket(0.3, 0.24, 0.04, 3, 0.025, 0.004)
    + wrap('belt', 'belt', 0.3, 0.04, 0.05, 0.04, 0.005)
    + hangingEnds('belt', 'belt', 0.08, 0.045, 0.24, 0.04, 0.005, 0.05), {
    cloth: 'cloth-cream',
    lapel: 'cloth-white',
    belt: 'cloth-black',
  })
  + { voxelGrain: 0.004 },

  // A thin cotton training jacket alone, without trousers or belt, folded to 280 mm by 220 mm and 24 mm high with
  // a narrow lapel crossing left over right.
  h.compound('keikogi', 0.34, giJacket(0.28, 0.22, 0.024, 2, 0.022, 0.004), {
    cloth: 'cloth-cream',
    lapel: 'cloth-white',
  })
  + { voxelGrain: 0.004 },

  // A layered Shinto hunting robe folded to 420 mm by 320 mm and 80 mm high: the wide sleeves folded back over each
  // side of the top, cords threaded through their cuffs ending in tassels, a round collar fastened at one shoulder,
  // and the crimson under-robe showing along the front edge.
  h.compound('kariginu', 2.7, folded(0.42, 0.32, 0.08, 4) + [
    box('sleeve-l', 'sleeve', [-0.21, 0.08, -0.15], [-0.07, 0.092, 0.15]),
    box('sleeve-r', 'sleeve', [0.07, 0.08, -0.15], [0.21, 0.092, 0.15]),
    box('cord-l', 'cord', [-0.208, 0.092, -0.14], [-0.2, 0.097, 0.15]),
    box('cord-r', 'cord', [0.2, 0.092, -0.14], [0.208, 0.097, 0.15]),
    box('tassel-l', 'cord', [-0.21, 0.02, 0.15], [-0.198, 0.097, 0.165]),
    box('tassel-r', 'cord', [0.198, 0.03, 0.15], [0.21, 0.097, 0.165]),
    box('under-robe', 'under', [-0.2, 0.004, 0.16], [0.2, 0.03, 0.163]),
    h.disc('collar-knot', 'cord', 0.009, 0.08, 0.092, -0.055, -0.1),
  ] + collar('collar', 'cloth', 0.32, 0.08, 0.045, 0.02, 0.008), {
    cloth: 'cloth-cream',
    sleeve: 'cloth-cream',
    cord: 'cloth-crimson',
    under: 'cloth-crimson',
  })
  + { voxelGrain: 0.004 },

  // A saffron robe folded to 380 mm by 300 mm and 70 mm high, its top showing the field of stitched patches in
  // staggered rows inside a plain border, the way the cloth is pieced from many strips.
  h.compound('kasaya', 1.8, folded(0.38, 0.3, 0.07, 4) + patchwork(0.38, 0.3, 0.07, 5, 3, 0.025), {
    cloth: 'cloth-orange',
    seam: 'cloth-brown',
    border: 'cloth-yellow',
  })
  + { voxelGrain: 0.004 },

  // A cotton robe folded lengthwise to 400 mm by 250 mm and 50 mm high, its pale collar band running down the
  // folded front, and a red sash folded flat across the middle.
  h.compound('kimono', 1.2, folded(0.4, 0.25, 0.05, 4) + [
    strip('collar-band', 'collar', [-0.17, -0.08], [0.17, 0.08], 0.05, 0.03, 0.004),
    box('sash', 'sash', [-0.11, 0.05, -0.04], [0.11, 0.064, 0.04]),
    box('sash-fold', 'sash', [-0.11, 0.064, -0.04], [-0.03, 0.07, 0.04]),
  ], { cloth: 'cloth-navy', collar: 'cloth-cream', sash: 'cloth-red' })
  + { voxelGrain: 0.004 },

  // A plain white cotton robe folded to 320 mm by 260 mm and 50 mm high: a stand collar at the back, a row of small
  // buttons down the front, and its white belt with a silver buckle wrapped round the bundle.
  h.compound('kittel', 1, folded(0.32, 0.26, 0.05, 4)
    + collar('collar', 'cloth', 0.26, 0.05, 0.04, 0.016, 0.008)
    + wrap('belt', 'belt', 0.32, 0.05, 0.07, 0.035)
    + [
      box('placket', 'placket', [-0.012, 0.05, -0.07], [0.012, 0.052, 0.13]),
      box('buckle', 'buckle', [-0.03, 0.054, 0.05], [0.03, 0.06, 0.09]),
      box('buckle-bar', 'belt', [-0.018, 0.06, 0.06], [0.018, 0.061, 0.08]),
    ] + [
      h.disc('button-%d' % i, 'buttons', 0.005, 0.052, 0.055, 0, z)
      for i in [0, 1, 2]
      for z in [[-0.045, -0.005, 0.11][i]]
    ], {
    cloth: 'cloth-cream',
    placket: 'cloth-cream',
    belt: 'cloth-white',
    buckle: 'metal-silver',
    buttons: 'cloth-white',
  })
  + { voxelGrain: 0.004 },

  // A heavy black leather riding jacket folded to 360 mm by 280 mm and 80 mm high in three folds: wide lapels
  // studded down at the collar, a steel zip running slant from the left shoulder to the right hip, a belt with a
  // steel buckle across the waist, and epaulettes at the shoulders.
  h.compound('jacket_motorcycle', 2.4, folded(0.36, 0.28, 0.08, 3)
    + collar('collar', 'leather', 0.28, 0.08, 0.04, 0.022, 0.008)
    + [
      strip('lapel-l', 'leather', [-0.05, -0.08], [-0.13, 0.0], 0.08, 0.05, 0.006),
      strip('lapel-r', 'leather', [0.05, -0.08], [0.11, -0.01], 0.08, 0.045, 0.006),
      strip('zip', 'zip', [-0.06, -0.06], [0.08, 0.13], 0.086, 0.014, 0.003),
      box('zip-pull', 'zip', [0.072, 0.085, 0.125], [0.088, 0.09, 0.15]),
      box('belt', 'belt', [-0.18, 0.08, 0.1], [0.18, 0.086, 0.13]),
      box('buckle', 'zip', [-0.13, 0.086, 0.094], [-0.09, 0.091, 0.136]),
      box('epaulette-l', 'leather', [-0.17, 0.08, -0.13], [-0.13, 0.086, -0.03]),
      box('epaulette-r', 'leather', [0.13, 0.08, -0.13], [0.17, 0.086, -0.03]),
    ] + [
      h.disc('stud-%d' % i, 'zip', 0.005, 0.086, 0.09, x, z)
      for i in [0, 1, 2, 3]
      for x in [[-0.12, 0.1, -0.15, 0.15][i]]
      for z in [[-0.005, -0.015, -0.115, -0.115][i]]
    ], {
    cloth: 'leather-black',
    leather: 'leather-black',
    zip: 'metal-silver',
    belt: 'leather-black',
  })
  + { voxelGrain: 0.004 },

  // A black habit folded to 340 mm by 260 mm and 50 mm high, its white collar folded flat on top at the back, a
  // black veil folded over the middle, and a knotted cord belt wrapped round the bundle.
  h.compound('nun_habit', 1.1, folded(0.34, 0.26, 0.05, 4)
    + collar('collar', 'collar', 0.26, 0.05, 0.035, 0.03, 0.004)
    + [
      box('veil', 'cloth', [-0.12, 0.05, -0.02], [0.12, 0.062, 0.1]),
      box('veil-band', 'collar', [-0.12, 0.05, -0.028], [0.12, 0.064, -0.02]),
    ]
    + wrap('cord', 'cord', 0.34, 0.05, 0.11, 0.012, 0.006)
    + hangingEnds('cord', 'cord', -0.1, 0.056, 0.26, 0.012, 0.006, 0.11), {
    cloth: 'cloth-black',
    collar: 'cloth-cream',
    cord: 'plastic-charcoal',
  })
  + { voxelGrain: 0.004 },

  // A heavy navy wool coat folded to 360 mm by 280 mm and 80 mm high: broad lapels from the collar, two rows of
  // three dark buttons down the double-breasted front, and slanted flaps over the deep hip pockets.
  h.compound('peacoat', 1.9, folded(0.36, 0.28, 0.08, 3)
    + collar('collar', 'cloth', 0.28, 0.08, 0.04, 0.024, 0.01)
    + [
      strip('lapel-l', 'lapel', [-0.045, -0.08], [-0.1, 0.0], 0.08, 0.055, 0.006),
      strip('lapel-r', 'lapel', [0.045, -0.08], [0.1, 0.0], 0.08, 0.055, 0.006),
      strip('pocket-l', 'lapel', [-0.16, 0.085], [-0.09, 0.075], 0.08, 0.024, 0.004),
      strip('pocket-r', 'lapel', [0.09, 0.075], [0.16, 0.085], 0.08, 0.024, 0.004),
    ] + [
      h.disc('button-%d-%d' % [i, j], 'buttons', 0.009, 0.08, 0.086, x, z)
      for i in [0, 1]
      for x in [[-0.04, 0.04][i]]
      for j in [0, 1, 2]
      for z in [0.0 + j * 0.045]
    ], {
    cloth: 'cloth-navy',
    lapel: 'cloth-navy',
    buttons: 'plastic-matte-black',
  })
  + { voxelGrain: 0.004 },

  // A dark ankle-length robe folded to 340 mm by 270 mm and 55 mm high, its hood lying folded on top and a broad
  // leather belt with a brass buckle wrapped round the bundle.
  h.compound('plaguedoctor_robe', 1.3, folded(0.34, 0.27, 0.055, 4) + hood(0.34, 0.27, 0.055)
    + wrap('belt', 'belt', 0.34, 0.055, 0.1, 0.035, 0.006)
    + [box('buckle', 'buckle', [0.05, 0.061, 0.08], [0.09, 0.066, 0.12])], {
    cloth: 'cloth-black',
    hood: 'cloth-black',
    lining: 'plastic-charcoal',
    belt: 'leather-brown',
    buckle: 'brass-dull',
  })
  + { voxelGrain: 0.004 },

  // A loose brown cotton robe folded to 340 mm by 260 mm and 45 mm high: a wide shawl collar curving round the
  // back of the neck, two patch pockets showing on the front, and its sash tied round the bundle.
  h.compound('robe', 1, folded(0.34, 0.26, 0.045, 3)
    + collar('collar', 'trim', 0.26, 0.045, 0.04, 0.03, 0.006)
    + [
      strip('collar-l', 'trim', [-0.06, -0.06], [-0.035, 0.12], 0.045, 0.03, 0.006),
      strip('collar-r', 'trim', [0.06, -0.06], [0.035, 0.12], 0.045, 0.03, 0.006),
      box('pocket-l', 'trim', [-0.15, 0.045, 0.02], [-0.09, 0.048, 0.1]),
      box('pocket-r', 'trim', [0.09, 0.045, 0.02], [0.15, 0.048, 0.1]),
    ]
    + wrap('sash', 'sash', 0.34, 0.045, -0.01, 0.03)
    + hangingEnds('sash', 'sash', 0.0, 0.05, 0.26, 0.03, 0.005, -0.01), {
    cloth: 'cloth-brown',
    trim: 'suede-brown',
    sash: 'cloth-brown',
  })
  + { voxelGrain: 0.004 },

  // A long hooded robe of deep blue folded to 330 mm by 260 mm and 45 mm high: the hood on top lined in shimmering
  // cloth, gold stars and a crescent moon scattered over the folds, and a gold cord tied round the bundle.
  h.compound('robe_wizard', 0.97, folded(0.33, 0.26, 0.045, 3) + hood(0.33, 0.26, 0.045)
    + wrap('cord', 'gold', 0.33, 0.045, 0.1, 0.008, 0.005)
    + h.crescent('moon', 'gold', 0.016, 0.028, 200, 340, 6, 0.045, 0.048, 0.12, 0.06)
    + std.flattenArrays([
      [
        box('star-%d-a' % i, 'gold', [x - 0.014, 0.045, z - 0.004], [x + 0.014, 0.048, z + 0.004]),
        box('star-%d-b' % i, 'gold', [x - 0.004, 0.045, z - 0.014], [x + 0.004, 0.048, z + 0.014]),
      ]
      for i in std.range(0, 4)
      for x in [[-0.14, -0.12, 0.13, -0.05, 0.05][i]]
      for z in [[-0.08, 0.06, -0.09, 0.115, 0.12][i]]
    ]), {
    cloth: 'cloth-navy',
    hood: 'cloth-navy',
    lining: 'cloth-shimmer',
    gold: 'metal-gold',
  })
  + { voxelGrain: 0.004 },

  // A double-layered outer robe of maroon cotton folded to 340 mm by 260 mm and 40 mm high, its top showing the
  // stitched patches pieced in staggered rows inside a plain border, and a cord loop at one corner for fastening.
  h.compound('samghati', 0.82, folded(0.34, 0.26, 0.04, 3) + patchwork(0.34, 0.26, 0.04, 5, 3, 0.022)
    + h.crescent('loop', 'loop', 0.008, 0.013, 0, 360, 10, 0.042, 0.046, -0.14, -0.09), {
    cloth: 'cloth-crimson',
    seam: 'leather-oxblood',
    border: 'velvet-red',
    loop: 'cord-cotton',
  })
  + { voxelGrain: 0.004 },
]
