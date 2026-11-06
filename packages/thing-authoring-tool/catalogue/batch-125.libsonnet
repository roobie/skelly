local h = import '../compound.libsonnet';
local box = h.box;
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);
local zx(poly) = [[p[1], p[0]] for p in poly];
// A flat convex outline of [x, z] points lying on y from y0 to y1.
local flat(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', zx(pts), y0, y1);

// Gloves lie flat as a pair, backs up, fingers towards +z, each centred on cx with its thumb out to side s (-1 left,
// +1 right); x(v) mirrors a local offset onto that side. Every glove is a palm, four fingers, a thumb and a cuff
// running back to -z; the rows below add mail, plates and knit over that hand.
local fingerSpots = [[0.026, 0.07], [0.006, 0.08], [-0.014, 0.074], [-0.034, 0.058]];

// The bare hand `t` thick: palm, fingers scaled by `fl`, a thumb, and a cuff `cuffL` long flaring to half-width
// `cuffHalf`. Slots: palm (palm and thumb), finger, cuff.
local hand(p, cx, s, t, fl=1, cuffL=0.07, cuffHalf=0.05) =
  local x(v) = cx + s * v;
  [
    sbox(p + 'palm', 'palm', [x(-0.045), 0, -0.016], [x(0.045), t, 0.09]),
    flat(p + 'cuff', 'cuff', [[x(-cuffHalf), -0.015 - cuffL], [x(cuffHalf), -0.015 - cuffL], [x(0.046), -0.015], [x(-0.046), -0.015]], 0, t * 0.9),
    flat(p + 'thumb', 'palm', [[x(0.04), -0.01], [x(0.045), 0.03], [x(0.08), 0.08], [x(0.095), 0.066], [x(0.06), 0.005]], 0, t * 0.85),
  ] + [
    local fx = fingerSpots[i][0], len = fingerSpots[i][1] * fl;
    sbox(p + 'finger-%d' % i, 'finger', [x(fx - 0.0095), 0, 0.088], [x(fx + 0.0095), t * 0.85, 0.09 + len])
    for i in std.range(0, 3)
  ];

// Rows of mail rings standing proud of a face at y, across x from x0 to x1 and every `pitch` along z from z0 to z1.
local ringRows(prefix, x0, x1, z0, z1, y, pitch=0.008) = [
  box('%s-%d' % [prefix, i], 'ring', [std.min(x0, x1), y, z0 + i * pitch], [std.max(x0, x1), y + 0.002, z0 + i * pitch + 0.004])
  for i in std.range(0, std.floor((z1 - z0) / pitch))
];

// Mail rings over every finger and the thumb of one glove: the finger tops at y.
local fingerRings(p, cx, s, y, fl=1) = std.flattenArrays([
  local fx = fingerSpots[i][0], len = fingerSpots[i][1] * fl;
  ringRows(p + 'finger-%d-ring' % i, cx + s * (fx - 0.0085), cx + s * (fx + 0.0085), 0.092, 0.084 + len, y)
  for i in std.range(0, 3)
]);

// A mail glove: the whole hand in mail, rows of rings across the back, every finger and the cuff, and a leather
// binding round the cuff's edge. Slots: palm, finger, cuff, ring, binding.
local mailGlove(p, cx, s) =
  local t = 0.014, x(v) = cx + s * v;
  hand(p, cx, s, t, 1, 0.075, 0.056)
  + ringRows(p + 'back-ring', x(-0.043), x(0.043), -0.012, 0.084, t)
  + ringRows(p + 'cuff-ring', x(-0.046), x(0.046), -0.08, -0.02, t * 0.9)
  + fingerRings(p, cx, s, t * 0.85)
  + [sbox(p + 'binding', 'binding', [x(-0.058), 0, -0.094], [x(0.058), t + 0.002, -0.084])];

// The base height that seats a plate of half-width `half` curved with radius `r` so its crown sits just on a face
// at y: the plate's edges wrap down the sides of the hand.
local seat(y, half, r) = y - half * half / (2 * r) + 0.001;

// A riveted plate over the back of the hand and a flared plate over the wrist, both curved across x and seated on
// the glove's back at y, with a ridge over the knuckles. Slots: plate, rivet.
local backPlates(p, cx, s, y, knuckle=true) =
  local back = [[-0.046, -0.004], [0.046, -0.004], [0.044, 0.07], [-0.044, 0.07]];
  local cuff = [[-0.062, -0.1], [0.062, -0.1], [0.05, -0.012], [-0.05, -0.012]];
  local yb = seat(y, 0.046, 0.08), yw = seat(y - 0.002, 0.062, 0.14);
  local top = h.curvedTopAt(back, yb, 0.003, 0.08, 0);
  local wristTop = h.curvedTopAt(cuff, yw, 0.003, 0.14, 0.045);
  h.curvedPlate(p + 'back', 'plate', back, yb, 0.003, 0.08, 6, cx)
  + h.curvedPlate(p + 'wrist', 'plate', cuff, yw, 0.003, 0.14, 6, cx)
  + (if knuckle then [box(p + 'knuckle', 'plate', [cx - 0.044, top - 0.002, 0.062], [cx + 0.044, top + 0.006, 0.076])] else [])
  + [
    local rx = [-0.034, 0.034, -0.034, 0.034][i];
    h.disc(p + 'rivet-%d' % i, 'rivet', 0.0035, h.curvedTopAt(back, yb, 0.003, 0.08, rx) - 0.002, h.curvedTopAt(back, yb, 0.003, 0.08, rx) + 0.002, cx + rx, [0.004, 0.004, 0.05, 0.05][i])
    for i in std.range(0, 3)
  ]
  + [
    h.disc(p + 'wrist-rivet-%d' % i, 'rivet', 0.0035, wristTop - 0.002, wristTop + 0.002, cx + [-0.045, 0.045][i], -0.06)
    for i in std.range(0, 1)
  ];

// A demi-gauntlet: a leather glove with mail over the fingers and thumb, a riveted plate over the back of the hand
// and a flared plate over the wrist. Slots: palm, finger, cuff, ring, plate, rivet.
local demiGauntlet(p, cx, s) =
  local t = 0.016;
  hand(p, cx, s, t, 1, 0.09, 0.062)
  + fingerRings(p, cx, s, t * 0.85)
  + backPlates(p, cx, s, t);

// A mitten gauntlet: a leather mitt whose finger end is mail under four overlapping steel lames and a rounded tip
// plate, with the back and wrist plates of the demi-gauntlet and a mail thumb. Slots: palm, finger, cuff, ring,
// plate, rivet.
local mittenGauntlet(p, cx, s) =
  local t = 0.018, x(v) = cx + s * v;
  local mitt = [[-0.048, 0.08], [0.048, 0.08], [0.05, 0.13], [0.036, 0.162], [0, 0.172], [-0.036, 0.162], [-0.05, 0.13]];
  [
    sbox(p + 'palm', 'palm', [x(-0.045), 0, -0.016], [x(0.045), t, 0.09]),
    flat(p + 'mitt', 'finger', [[cx + q[0], q[1]] for q in mitt], 0, t),
    flat(p + 'cuff', 'cuff', [[x(-0.062), -0.105], [x(0.062), -0.105], [x(0.046), -0.015], [x(-0.046), -0.015]], 0, t * 0.9),
    flat(p + 'thumb', 'finger', [[x(0.04), -0.01], [x(0.045), 0.03], [x(0.08), 0.08], [x(0.095), 0.066], [x(0.06), 0.005]], 0, t * 0.85),
  ]
  + ringRows(p + 'thumb-ring-a', x(0.05), x(0.07), 0.01, 0.034, t * 0.85)
  + ringRows(p + 'thumb-ring-b', x(0.066), x(0.084), 0.042, 0.066, t * 0.85)
  + backPlates(p, cx, s, t, false)
  + std.flattenArrays([
    local z0 = 0.064 + i * 0.022;
    h.curvedPlate(p + 'lame-%d' % i, 'plate', [[-0.049, z0], [0.049, z0], [0.049, z0 + 0.028], [-0.049, z0 + 0.028]], seat(t + 0.001 + i * 0.002, 0.049, 0.08), 0.003, 0.08, 6, cx)
    for i in std.range(0, 3)
  ])
  + h.curvedPlate(p + 'tip', 'plate', [[-0.046, 0.15], [0.046, 0.15], [0.034, 0.168], [0, 0.176], [-0.034, 0.168]], seat(t + 0.009, 0.049, 0.08), 0.003, 0.08, 6, cx, 0, 0.049)
  + [
    local yl = h.curvedTopAt([[-0.049, 0], [0.049, 0]], seat(t + 0.001 + i * 0.002, 0.049, 0.08), 0.003, 0.08, 0.042);
    h.disc(p + 'lame-rivet-%d' % i, 'rivet', 0.003, yl - 0.002, yl + 0.002, cx + s * 0.042, 0.076 + i * 0.022)
    for i in std.range(0, 3)
  ];

// An improvised sheet-metal mitten gauntlet for one hand: a padded canvas mitten lying flat, back up, with three
// curved sheet plates seated on its back, a wrist plate under the lower edge of the hand plate, which in turn sits
// under the finger plate, and cord bindings wrapped round mitten and plate. Slots: mitt, cuff, plate, edge, cord.
local sheetGuard(p, cx, s) =
  local t = 0.02, r = 0.1, th = 0.003, x(v) = cx + s * v;
  local mitt = [[-0.05, -0.02], [0.05, -0.02], [0.052, 0.13], [0.036, 0.162], [0, 0.17], [-0.036, 0.162], [-0.052, 0.13]];
  local wristPlate = [[-0.054, -0.1], [0.054, -0.1], [0.046, -0.008], [-0.046, -0.008]];
  local handPlate = [[-0.046, -0.016], [0.046, -0.016], [0.046, 0.084], [-0.046, 0.084]];
  local fingerPlate = [[-0.046, 0.078], [0.046, 0.078], [0.046, 0.128], [0.032, 0.156], [0, 0.164], [-0.032, 0.156], [-0.046, 0.128]];
  local yw = seat(t - 0.002, 0.054, r), yh = seat(t + th - 0.001, 0.046, r), yf = seat(t + 2 * th - 0.002, 0.046, r);
  // A cord wrapped round the mitten and a plate at z: a strip over the curve and drops down both sides to the floor.
  local cord(id, outline, y0, half, z) =
    local n = 6, w = 2 * half / n;
    [
      h.onCurvedFace('%s%s-%d' % [p, id, i], 'cord', outline, y0, th, r, [-half + i * w, z], [-half + (i + 1) * w, z], 0.006, cx)
      for i in std.range(0, n - 1)
    ] + [
      sbox(p + id + '-side-a', 'cord', [cx - half - 0.004, 0, z - 0.003], [cx - half + 0.002, y0 + th + 0.002, z + 0.003]),
      sbox(p + id + '-side-b', 'cord', [cx + half - 0.002, 0, z - 0.003], [cx + half + 0.004, y0 + th + 0.002, z + 0.003]),
    ];
  [
    flat(p + 'mitt', 'mitt', [[cx + q[0], q[1]] for q in mitt], 0, t),
    flat(p + 'thumb', 'mitt', [[x(0.04), -0.01], [x(0.075), 0.02], [x(0.088), 0.058], [x(0.072), 0.07], [x(0.045), 0.045]], 0, t - 0.006),
    flat(p + 'cuff', 'cuff', [[x(-0.056), -0.11], [x(0.056), -0.11], [x(0.05), -0.015], [x(-0.05), -0.015]], 0, t - 0.003),
  ]
  + h.curvedPlate(p + 'wrist-plate', 'plate', wristPlate, yw, th, r, 8, cx)
  + h.curvedPlate(p + 'hand-plate', 'plate', handPlate, yh, th, r, 8, cx)
  + h.curvedPlate(p + 'finger-plate', 'plate', fingerPlate, yf, th, r, 8, cx, 0, 0.046)
  + [
    h.onCurvedFace(p + 'edge-%d' % i, 'edge', handPlate, yh, th, r, [-0.042, [-0.012, 0.08][i]], [0.042, [-0.012, 0.08][i]], 0.003, cx)
    for i in std.range(0, 1)
  ]
  + cord('cord-wrist', wristPlate, yw, 0.054, -0.07)
  + cord('cord-hand', handPlate, yh, 0.046, 0.03)
  + cord('cord-finger', fingerPlate, yf, 0.046, 0.12);

// A long evening glove: slender fingers and a sleeve reaching past the elbow, gathered into soft folds along the
// forearm. Slots: palm, finger, cuff, fold.
local longGlove(p, cx, s) =
  local t = 0.008, x(v) = cx + s * v;
  local slim = [
    [0.022, 0.072], [0.005, 0.082], [-0.012, 0.076], [-0.028, 0.06],
  ];
  [
    sbox(p + 'palm', 'palm', [x(-0.038), 0, -0.016], [x(0.038), t, 0.09]),
    flat(p + 'thumb', 'palm', [[x(0.034), -0.01], [x(0.038), 0.03], [x(0.07), 0.08], [x(0.082), 0.07], [x(0.05), 0.005]], 0, t * 0.9),
    flat(p + 'sleeve', 'cuff', [[x(-0.05), -0.4], [x(0.05), -0.4], [x(0.034), -0.015], [x(-0.034), -0.015]], 0, t),
  ] + [
    local fx = slim[i][0], len = slim[i][1];
    sbox(p + 'finger-%d' % i, 'finger', [x(fx - 0.0075), 0, 0.088], [x(fx + 0.0075), t * 0.9, 0.09 + len])
    for i in std.range(0, 3)
  ] + [
    local z = -0.07 - i * 0.05, w = 0.036 + i * 0.0025;
    sbox(p + 'fold-%d' % i, 'fold', [x(-w), t, z], [x(w), t + 0.003, z + 0.008])
    for i in std.range(0, 5)
  ];

// A knitted wool mitten: the mitt, thumb and a ribbed cuff, with a coloured band knitted across the back. Slots:
// palm, finger, cuff, rib, band.
local woolMitten(p, cx, s) =
  local t = 0.022, x(v) = cx + s * v;
  [
    flat(p + 'mitt', 'palm', [[x(-0.05), -0.02], [x(0.05), -0.02], [x(0.052), 0.1], [x(0.036), 0.138], [cx, 0.148], [x(-0.036), 0.138], [x(-0.052), 0.1]], 0, t),
    flat(p + 'thumb', 'palm', [[x(0.04), -0.01], [x(0.075), 0.02], [x(0.088), 0.058], [x(0.072), 0.07], [x(0.045), 0.045]], 0, t - 0.006),
    sbox(p + 'cuff', 'cuff', [x(-0.046), 0, -0.09], [x(0.046), t - 0.002, -0.018]),
    sbox(p + 'band', 'band', [x(-0.05), t, 0.03], [x(0.05), t + 0.002, 0.05]),
  ] + [
    sbox(p + 'rib-%d' % i, 'rib', [x(-0.044 + i * 0.011), t - 0.002, -0.09], [x(-0.039 + i * 0.011), t + 0.001, -0.02])
    for i in std.range(0, 8)
  ];

// A snug knit glove with a ribbed knit cuff and seams down the back of each finger. Slots: palm, finger, cuff, seam.
local knitGlove(p, cx, s) =
  local t = 0.008, x(v) = cx + s * v;
  hand(p, cx, s, t, 1, 0.06, 0.044)
  + [
    sbox(p + 'rib-%d' % i, 'seam', [x(-0.042 + i * 0.012), t * 0.9, -0.075], [x(-0.038 + i * 0.012), t * 0.9 + 0.002, -0.02])
    for i in std.range(0, 7)
  ] + [
    local fx = fingerSpots[i][0];
    sbox(p + 'seam-%d' % i, 'seam', [x(fx - 0.001), t * 0.85, 0.06], [x(fx + 0.001), t * 0.85 + 0.0015, 0.09 + fingerSpots[i][1] - 0.008])
    for i in std.range(0, 3)
  ];

// A sock worn as a mitt, lying flat: a plain knit tube with a heel, a toe closed over the fingers, a slit cut for the
// thumb and a row of holes poked through by the fingertips. Slots: sock, heel, hole.
local sockMitt(p, cx, s) =
  local t = 0.01, w = 0.09, x(v) = cx + s * v;
  [
    sbox(p + 'leg', 'sock', [x(-w / 2), 0, -0.22], [x(w / 2), t, 0.0]),
    flat(p + 'foot', 'sock', [[x(-w / 2), 0], [x(w / 2), 0], [x(w / 2), 0.13], [x(0.03), 0.158], [cx, 0.162], [x(-0.03), 0.158], [x(-w / 2), 0.13]], 0, t),
    flat(p + 'heel', 'heel', [[x(-w / 2), -0.05], [x(w / 2), -0.05], [x(w / 2), 0.0], [x(-w / 2), 0.0]], t, t + 0.001),
    flat(p + 'toe', 'heel', [[x(-w / 2), 0.13], [x(w / 2), 0.13], [x(0.03), 0.158], [cx, 0.162], [x(-0.03), 0.158]], t, t + 0.001),
    sbox(p + 'cuff', 'heel', [x(-w / 2 - 0.002), 0, -0.22], [x(w / 2 + 0.002), t + 0.002, -0.19]),
    sbox(p + 'thumb-slit', 'hole', [x(0.03), t, 0.02], [x(0.045), t + 0.0015, 0.06]),
  ] + [
    h.disc(p + 'hole-%d' % i, 'hole', 0.007, t, t + 0.0015, x([-0.03, -0.01, 0.01, 0.03][i]), 0.12)
    for i in std.range(0, 3)
  ];

local pair(fn, gap) = fn('l-', -gap, -1) + fn('r-', gap, 1);

[
  // A pair of mild steel mail gloves laid flat side by side, backs up, each 245 mm from cuff to fingertip and 90 mm
  // across the knuckles: the whole hand and cuff in riveted rings, the cuff bound in leather.
  h.compound('lc_chainmail_hands', 1.8, pair(mailGlove, 0.068), { palm: 'steel-mail', finger: 'steel-mail', cuff: 'steel-mail', ring: 'steel-bright', binding: 'leather-brown' })
  + { voxelGrain: 0.002 },

  // A pair of mild steel demi-gauntlets laid flat, backs up, each 260 mm from cuff to fingertip: leather gloves with
  // mail fingers, a riveted plate over the back of the hand with a knuckle ridge and a flared wrist plate.
  h.compound('lc_demi_gaunt', 1.6, pair(demiGauntlet, 0.07), { palm: 'leather-brown', finger: 'steel-mail', cuff: 'leather-brown', ring: 'steel-bright', plate: 'steel-bright', rivet: 'brass-dull' })
  + { voxelGrain: 0.002 },

  // A pair of mild steel mitten gauntlets laid flat, backs up, each 280 mm from cuff to fingertip: leather mitts with
  // mail fingers covered by four overlapping lames and a rounded tip plate, a back plate and a flared wrist plate.
  h.compound('lc_mitten_gaunt', 2.5, pair(mittenGauntlet, 0.07), { palm: 'leather-brown', finger: 'steel-mail', cuff: 'leather-brown', ring: 'steel-bright', plate: 'steel-bright', rivet: 'brass-dull' })
  + { voxelGrain: 0.002 },

  // A pair of white cotton evening gloves laid flat, each 570 mm from the top of the sleeve to the fingertip and 76 mm
  // across the hand, gathered in soft folds along the forearm.
  h.compound('long_glove_white', 0.06, pair(longGlove, 0.06), { palm: 'cloth-bright-white', finger: 'cloth-bright-white', cuff: 'cloth-bright-white', fold: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A pair of improvised sheet-steel mitten gauntlets laid flat, backs up, each 280 mm from cuff to tip: padded
  // canvas mittens with a wrist, a hand and a finger plate overlapping down the back, bound on with cord.
  h.compound('mitten_gaunt_metal_sheets', 1.5, pair(sheetGuard, 0.075), { mitt: 'cloth-khaki', cuff: 'leather-brown', plate: 'steel-galvanised', edge: 'steel-grey', cord: 'cord-cotton' })
  + { voxelGrain: 0.002 },

  // A pair of knitted wool mittens laid flat, each 240 mm from cuff to tip and 100 mm across: thick grey mitts with a
  // red band across the back and a ribbed cuff.
  h.compound('mittens', 0.13, pair(woolMitten, 0.072), { palm: 'wool-grey', cuff: 'wool-grey', rib: 'cloth-charcoal', band: 'cloth-red' })
  + { voxelGrain: 0.002 },

  // A pair of thin flame-resistant knit gloves laid flat, each 240 mm from cuff to fingertip, with ribbed knit cuffs.
  h.compound('nomex_gloves', 0.05, pair(knitGlove, 0.066), { palm: 'knit-fr', finger: 'knit-fr', cuff: 'knit-fr', seam: 'cloth-charcoal' })
  + { voxelGrain: 0.002 },

  // A pair of flame-resistant socks worn as mitts, laid flat, each 380 mm long and 90 mm wide, with finger holes poked
  // through the toe and a slit for the thumb.
  h.compound('nomex_sockmitts', 0.08, pair(sockMitt, 0.06), { sock: 'knit-fr', heel: 'cloth-charcoal', hole: 'cloth-black' })
  + { voxelGrain: 0.004 },
]
