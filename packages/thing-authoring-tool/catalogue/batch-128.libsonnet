local h = import '../compound.libsonnet';
local box = h.box;

// Hats, caps and headscarves as found on a shelf: hats and caps standing upright on their band, the face at +z;
// scarves and veils folded flat; the frilled headpiece and ear pads laid flat.

local rad(d) = d * std.pi / 180;

// A solid crown turned on y: a superellipse of radius `r` and height `ht`, exponent `p` (2 round, higher squarer),
// standing on y0.
local crown(id, slot, r, ht, p, y0=0, x=0, z=0, n=10) =
  h.turned(id, slot, 'y', [[0, 0], [0, r]] + [
    [ht * std.pow(std.sin(rad(90 * i / n)), 2 / p), r * std.pow(std.cos(rad(90 * i / n)), 2 / p)]
    for i in std.range(1, n)
  ], [x, y0, z]);
// That crown's radius at height y above its base.
local crownR(r, ht, p, y) = r * std.pow(std.max(0, 1 - std.pow(std.min(1, y / ht), p)), 1 / p);

// A turned ring on y from radius r0 to r1 and height y0 to y1.
local ring(id, slot, r0, r1, y0, y1, x=0, z=0) =
  h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);

// A flat band lying on y from y0 to y1 between a circle of radius rIn and an ellipse of half-widths rx (across x)
// and rz (along z), over bearings a0 to a1 (0 faces +z), as convex quads: visors, brims, ear flaps. rIn may be an
// [x, z] pair of half-widths for an elliptical inner edge.
local sector(prefix, slot, rIn, rx, rz, a0, a1, steps, y0, y1) =
  local ang(i) = rad(a0 + (a1 - a0) * i / steps);
  local ri = if std.type(rIn) == 'array' then rIn else [rIn, rIn];
  local inner(i) = [ri[0] * std.sin(ang(i)), ri[1] * std.cos(ang(i))];
  local outer(i) = [rx * std.sin(ang(i)), rz * std.cos(ang(i))];
  [
    h.prism('%s-%d' % [prefix, i], slot, 'y', [[q[1], q[0]] for q in [outer(i), outer(i + 1), inner(i + 1), inner(i)]], y0, y1)
    for i in std.range(0, steps - 1)
  ];

// Thin upright ribs standing proud of a round wall, `n` of them `w` degrees wide: knit ribbing, panel seams.
local ribs(prefix, slot, r0, r1, n, w, y0, y1, offset=0) = std.flattenArrays([
  sector('%s-%d' % [prefix, i], slot, r0, r1, r1, offset + 360 * i / n, offset + 360 * i / n + w, 1, y0, y1)
  for i in std.range(0, n - 1)
]);

// Radial seams lying on a flat top at height y, from radius r0 to r1, `n` of them.
local seams(prefix, slot, r0, r1, n, y, w=0.003) = [
  local a = rad(360 * i / n + 22.5);
  local s = std.sin(a), c = std.cos(a);
  h.prism('%s-%d' % [prefix, i], slot, 'y', [
    [r0 * c - w * s, r0 * s + w * c], [r1 * c - w * s, r1 * s + w * c],
    [r1 * c + w * s, r1 * s - w * c], [r0 * c + w * s, r0 * s - w * c],
  ], y, y + 0.003)
  for i in std.range(0, n - 1)
];

// A cone tip lying along +x from x0, base radius r, length l, at height y: a drooping tip, a pompom stalk.
local coneX(id, slot, r, l, x0, y, z=0) = h.turned(id, slot, 'x', [[0, 0], [0, r], [l, 0]], [x0, y, z]);
// A ball of radius r centred at [x, y, z].
local ball(id, slot, r, x, y, z, n=8) = h.turned(id, slot, 'y', [[0, 0]] + [
  [r - r * std.cos(rad(180 * i / n)), r * std.sin(rad(180 * i / n))]
  for i in std.range(0, n)
], [x, y - r, z]);

// A folded square of thin cloth with a rolled hem along its front edge, for scarves and veils.
local foldedScarf(w, d, ht, folds) =
  h.foldedGarment(w, d, ht, folds)
  + [box('hem', 'hem', [-w / 2, ht, d / 2 - 0.012], [w / 2, ht + 0.003, d / 2])];

[
  // A red wool hunting cap standing on its band, 190 mm across and 120 mm tall: a round crown checked with dark
  // bands, a short stiff peak at the front and ear flaps folded up round the sides and back.
  h.compound('hunting_cap', 0.14, [
    crown('crown', 'cloth', 0.094, 0.115, 2.4),
  ] + [
    ring('check-%d' % i, 'check', crownR(0.094, 0.115, 2.4, y + 0.008) - 0.003, crownR(0.094, 0.115, 2.4, y) + 0.002, y, y + 0.008)
    for i in std.range(0, 2)
    for y in [[0.055, 0.075, 0.093][i]]
  ] + ribs('check-v', 'check', 0.09, 0.096, 12, 4, 0.04, 0.075)
    + sector('peak', 'cloth', 0.088, 0.096, 0.165, -70, 70, 10, 0.018, 0.026)
    + sector('flap-l', 'cloth', 0.093, 0.106, 0.106, 50, 160, 8, 0.008, 0.052)
    + sector('flap-r', 'cloth', 0.093, 0.106, 0.106, 200, 310, 8, 0.008, 0.052)
    + ribs('flap-check', 'check', 0.104, 0.108, 12, 5, 0.008, 0.052, 2)
    + [
      ring('flap-band', 'check', 0.102, 0.108, 0.026, 0.034),
      // The ties that hold the flaps up, knotted over the crown.
      box('tie', 'tie', [-0.004, 0.112, -0.03], [0.004, 0.118, 0.03]),
      box('tie-knot', 'tie', [-0.008, 0.112, -0.008], [0.008, 0.122, 0.008]),
    ], { cloth: 'cloth-red', check: 'cloth-black', tie: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A grey wool knit hat standing upright, 190 mm across and 200 mm tall: a soft rounded crown over a deep ribbed
  // cuff turned up round the brow.
  h.compound('knit_hat', 0.2, [
    crown('crown', 'knit', 0.086, 0.2, 2.2),
    ring('cuff', 'cuff', 0.084, 0.093, 0, 0.06),
    ring('cuff-roll', 'cuff', 0.08, 0.091, 0.06, 0.066),
  ] + ribs('rib', 'cuff', 0.09, 0.097, 36, 5, 0, 0.06)
    + [
      ring('course-%d' % i, 'knit', crownR(0.086, 0.2, 2.2, y + 0.004) - 0.003, crownR(0.086, 0.2, 2.2, y) + 0.002, y, y + 0.004)
      for i in std.range(0, 5)
      for y in [0.08 + 0.018 * i]
    ], { knit: 'wool-grey', cuff: 'felt-grey' })
  + { voxelGrain: 0.004 },

  // A green-grey cotton utility cap standing on its band, 250 mm across the top and 260 mm from back to peak, 110
  // mm tall: a crown flaring up to a flat eight-cornered top, its seams running to each corner, and a cloth peak.
  h.compound('eight_point_cap', 0.15, [
    h.turned('crown', 'cloth', 'y', [[0, 0], [0, 0.088], [0.09, 0.106], [0.09, 0]]),
    h.prism('top', 'cloth', 'y', [
      [0.122 * std.cos(rad(45 * i + 22.5)), 0.122 * std.sin(rad(45 * i + 22.5))]
      for i in std.range(0, 7)
    ], 0.09, 0.104),
    ring('band', 'band', 0.087, 0.092, 0, 0.032),
  ] + seams('seam', 'seam', 0.01, 0.118, 8, 0.104)
    + sector('peak', 'cloth', 0.085, 0.094, 0.16, -70, 70, 10, 0.02, 0.028)
    + sector('peak-edge', 'seam', [0.089, 0.152], 0.094, 0.162, -66, 66, 10, 0.028, 0.03),
    { cloth: 'cloth-ucp', band: 'cloth-ucp', seam: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A brown wool newsboy cap standing on its band, 250 mm across and 260 mm from back to peak, 95 mm tall: a full,
  // slouching crown of eight panels drawn to a cloth button, overhanging a short stiff peak.
  h.compound('newsboy_cap', 0.14, [
    ring('band', 'band', 0.086, 0.092, 0, 0.03),
    h.turned('crown', 'cloth', 'y', [[0, 0], [0, 0.09], [0.025, 0.118], [0.045, 0.126], [0.06, 0.12], [0.068, 0.095], [0.07, 0.075], [0.073, 0.03], [0.074, 0]], [0, 0.025, 0.012]),
    h.disc('button', 'button', 0.012, 0.098, 0.106, 0, 0.012),
  ] + seams('seam', 'seam', 0.014, 0.075, 8, 0.096, 0.0025)
    + sector('peak', 'cloth', 0.08, 0.09, 0.15, -65, 65, 10, 0.022, 0.03),
    { cloth: 'cloth-brown', band: 'cloth-brown', seam: 'cloth-charcoal', button: 'cloth-brown' })
  + { voxelGrain: 0.004 },

  // A pair of padded cotton ear pads laid flat, 280 mm across with their cord: two round pads 90 mm wide and 25 mm
  // thick, a cord running between them and a loose tie trailing from each.
  h.compound('ear_pads', 0.054, [
    h.disc('pad-l', 'pad', 0.045, 0, 0.022, -0.09, 0),
    h.disc('pad-r', 'pad', 0.045, 0, 0.022, 0.09, 0),
    ring('rim-l', 'rim', 0.04, 0.047, 0, 0.024, -0.09, 0),
    ring('rim-r', 'rim', 0.04, 0.047, 0, 0.024, 0.09, 0),
    h.disc('stitch-l', 'rim', 0.02, 0.022, 0.024, -0.09, 0),
    h.disc('stitch-r', 'rim', 0.02, 0.022, 0.024, 0.09, 0),
    box('cord', 'cord', [-0.05, 0.008, -0.02], [0.05, 0.012, -0.016]),
    box('cord-back', 'cord', [-0.05, 0.008, -0.035], [0.05, 0.012, -0.031]),
    box('tie-l2', 'cord', [-0.15, 0.002, 0.01], [-0.132, 0.006, 0.014]),
    box('tie-r2', 'cord', [0.132, 0.002, 0.01], [0.15, 0.006, 0.014]),
  ], { pad: 'cloth-charcoal', rim: 'cloth-black', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // An orange felt sombrero resting on its brim, 600 mm across and 260 mm tall: a broad brim rolled up at the edge
  // and a tall tapering crown, both worked with rings of white and yellow stitching, a cord chin strap across the brim.
  h.compound('sombrero', 0.9, [
    h.turned('hat', 'felt', 'y', [
      [0, 0], [0, 0.25], [0.025, 0.28], [0.06, 0.298], [0.072, 0.3], [0.066, 0.29], [0.03, 0.266], [0.016, 0.24], [0.014, 0.12],
      [0.03, 0.1], [0.2, 0.074], [0.24, 0.055], [0.255, 0.03], [0.26, 0],
    ]),
  ] + [
    ring('brim-stitch-%d' % i, ['white', 'yellow'][i % 2], r, r + 0.008, 0.014, 0.019)
    for i in std.range(0, 2)
    for r in [[0.145, 0.175, 0.205][i]]
  ] + [
    ring('crown-stitch-%d' % i, ['yellow', 'white'][i % 2], 0.0, 0.1 - 0.026 * (y - 0.03) / 0.17 + 0.003, y, y + 0.01)
    for i in std.range(0, 2)
    for y in [[0.06, 0.11, 0.16][i]]
  ] + [
    box('strap', 'strap', [-0.004, 0.012, 0.1], [0.004, 0.022, 0.235]),
    box('strap-2', 'strap', [0.02, 0.012, 0.1], [0.028, 0.022, 0.225]),
  ], { felt: 'cloth-orange', white: 'cloth-cream', yellow: 'cloth-yellow', strap: 'cord-cotton' }),

  // A navy cotton headscarf folded square, 220 mm by 200 mm and 25 mm tall, a hemmed edge on top and a pin through
  // the corner.
  h.compound('hijab', 0.13, foldedScarf(0.22, 0.2, 0.025, 4) + [
    box('pin', 'pin', [0.06, 0.028, 0.06], [0.1, 0.031, 0.063]),
    h.disc('pin-head', 'pin', 0.005, 0.026, 0.034, 0.058, 0.0615),
  ], { cloth: 'cloth-navy', hem: 'cloth-navy', pin: 'metal-silver' })
  + { voxelGrain: 0.004 },

  // A black cotton skullcap resting on its rim, 150 mm across and 32 mm tall: a shallow round dome with a band of
  // white stitching near the rim.
  h.compound('kippah', 0.054, [
    crown('dome', 'cloth', 0.075, 0.032, 1.8),
    ring('band', 'stitch', crownR(0.075, 0.032, 1.8, 0.012) - 0.003, crownR(0.075, 0.032, 1.8, 0.006) + 0.0015, 0.006, 0.012),
  ] + ribs('mark', 'stitch', crownR(0.075, 0.032, 1.8, 0.02) - 0.002, crownR(0.075, 0.032, 1.8, 0.016) + 0.0015, 12, 6, 0.014, 0.018),
    { cloth: 'cloth-black', stitch: 'cloth-cream' })
  + { voxelGrain: 0.002 },

  // A cream cotton cap standing on its rim, 180 mm across and 90 mm tall: a straight brimless band rounded over a
  // flat top, embroidered in a yellow band of diamonds round the side.
  h.compound('kufi_cap', 0.091, [
    h.turned('cap', 'cloth', 'y', [[0, 0], [0, 0.088], [0.07, 0.088], [0.082, 0.082], [0.088, 0.07], [0.09, 0]]),
    ring('emb-top', 'emb', 0.086, 0.09, 0.05, 0.054),
    ring('emb-bottom', 'emb', 0.086, 0.09, 0.012, 0.016),
  ] + ribs('emb', 'emb', 0.086, 0.09, 24, 5, 0.022, 0.044, 0)
    + h.crescent('top-ring', 'emb', 0.045, 0.05, 0, 360, 16, 0.09, 0.093),
    { cloth: 'cloth-cream', emb: 'cloth-yellow' })
  + { voxelGrain: 0.004 },

  // A white frilled headpiece laid flat, 200 mm across and 70 mm deep: a stiff crescent band edged with a pleated
  // ruffle, a black ribbon threaded along it and ribbon ties trailing from each end.
  h.compound('frilled_headpiece', 0.0088,
             h.crescent('band', 'cloth', 0.065, 0.085, -80, 80, 12, 0, 0.008, 0, -0.04)
             + [
               h.prism('frill-%d' % i, 'frill', 'y', [[q[1], q[0]] for q in [
                 [0.085 * std.sin(rad(a)), 0.085 * std.cos(rad(a)) - 0.04],
                 [0.108 * std.sin(rad(a + 4)), 0.108 * std.cos(rad(a + 4)) - 0.04],
                 [0.085 * std.sin(rad(a + 8)), 0.085 * std.cos(rad(a + 8)) - 0.04],
               ]], 0.002, 0.006 + 0.003 * (i % 2))
               for i in std.range(0, 19)
               for a in [-80 + 8 * i]
             ]
             + h.crescent('ribbon', 'ribbon', 0.072, 0.079, -78, 78, 12, 0.008, 0.011, 0, -0.04)
             + [
               box('tie-l', 'ribbon', [-0.11, 0, -0.032], [-0.066, 0.003, -0.024]),
               box('tie-r', 'ribbon', [0.066, 0, -0.032], [0.11, 0.003, -0.024]),
               box('bow', 'ribbon', [-0.012, 0.011, 0.034], [0.012, 0.016, 0.044]),
             ],
             { cloth: 'cloth-bright-white', frill: 'cloth-bright-white', ribbon: 'satin-black' })
  + { voxelGrain: 0.002 },

  // A black cotton face veil folded flat, 220 mm by 200 mm and 22 mm tall: the eye slit's bound edges showing on the
  // top fold and two long ties trailing from the back corners.
  h.compound('niqab', 0.11, foldedScarf(0.22, 0.2, 0.022, 3) + [
    box('slit-top', 'trim', [-0.08, 0.022, 0.03], [0.08, 0.025, 0.036]),
    box('slit-bottom', 'trim', [-0.08, 0.022, 0.01], [0.08, 0.025, 0.016]),
    box('slit', 'slit', [-0.075, 0.022, 0.016], [0.075, 0.023, 0.03]),
    box('tie-l', 'trim', [-0.1, 0.002, -0.17], [-0.092, 0.006, -0.1]),
    box('tie-r', 'trim', [0.092, 0.002, -0.17], [0.1, 0.006, -0.1]),
  ], { cloth: 'cloth-black', hem: 'cloth-black', trim: 'cloth-charcoal', slit: 'satin-black' })
  + { voxelGrain: 0.004 },

  // A black cotton pointed hat resting on its brim, 400 mm across and 360 mm tall: a broad flat brim and a tall cone
  // whose tip leans over, a purple band with a brass buckle round its base.
  h.compound('pointed_hat', 0.15, [
    h.turned('brim', 'cloth', 'y', [[0, 0], [0, 0.2], [0.006, 0.2], [0.012, 0.19], [0.012, 0]]),
    h.turned('cone-1', 'cloth', 'y', [[0, 0], [0, 0.092], [0.12, 0.066], [0.12, 0]], [0, 0.012, 0]),
    h.turned('cone-2', 'cloth', 'y', [[0, 0], [0, 0.066], [0.1, 0.042], [0.1, 0]], [0.012, 0.132, 0]),
    h.turned('cone-3', 'cloth', 'y', [[0, 0], [0, 0.042], [0.07, 0.024], [0.07, 0]], [0.035, 0.232, 0]),
    coneX('tip', 'cloth', 0.024, 0.09, 0.05, 0.31),
    ring('band', 'band', 0.0, 0.094, 0.012, 0.04),
    box('buckle', 'buckle', [-0.018, 0.016, 0.088], [0.018, 0.038, 0.097]),
    box('buckle-hole', 'band', [-0.011, 0.022, 0.094], [0.011, 0.032, 0.098]),
  ], { cloth: 'cloth-charcoal', band: 'cloth-purple', buckle: 'brass-dull' }),

  // A grey felted cotton porkpie hat resting on its brim, 270 mm across and 95 mm tall: a short flat-topped crown
  // with a round channel pressed into its top, a black ribbon band and a narrow brim turned up all round.
  h.compound('porkpie_hat', 0.18, [
    h.turned('brim', 'cloth', 'y', [[0, 0], [0, 0.128], [0.014, 0.135], [0.02, 0.135], [0.012, 0.124], [0.008, 0.1], [0.008, 0]]),
    h.turned('crown', 'cloth', 'y', [
      [0, 0], [0, 0.092], [0.082, 0.09], [0.088, 0.086], [0.088, 0.078],
      [0.074, 0.072], [0.074, 0.062], [0.084, 0.058], [0.084, 0],
    ], [0, 0.008, 0]),
    ring('band', 'band', 0.0, 0.094, 0.008, 0.032),
    box('bow', 'band', [0.088, 0.014, -0.012], [0.098, 0.03, 0.012]),
  ], { cloth: 'felt-grey', band: 'satin-black' })
  + { voxelGrain: 0.004 },

  // A blue-grey cotton mail carrier's peaked cap standing on its band, 240 mm across and 270 mm from back to peak,
  // 105 mm tall: a broad flat top over a stiff band, a sewn eagle badge on the front above a glossy plastic peak, and
  // a strap across the band.
  h.compound('mail_carrier_cap', 0.15, [
    ring('band', 'band', 0.0, 0.09, 0, 0.05),
    h.turned('crown', 'cloth', 'y', [[0, 0], [0, 0.088], [0.035, 0.112], [0.045, 0.12], [0.055, 0.118], [0.057, 0]], [0, 0.045, -0.006]),
    h.disc('top-seam', 'seam', 0.112, 0.1, 0.1035, 0, -0.006),
  ] + sector('peak', 'peak', 0.085, 0.092, 0.16, -72, 72, 10, 0.016, 0.022)
    + sector('peak-2', 'peak', 0.085, 0.09, 0.14, -66, 66, 10, 0.022, 0.026)
    + sector('badge', 'badge', 0.088, 0.095, 0.095, -13, 13, 3, 0.031, 0.05)
    + sector('badge-eagle', 'eagle', 0.093, 0.097, 0.097, -7, 7, 2, 0.035, 0.046)
    + sector('strap', 'peak', 0.089, 0.094, 0.094, -70, 70, 10, 0.022, 0.029)
    + [
      h.turned('button-l', 'button', 'x', [[0, 0], [0, 0.005], [0.005, 0.004], [0.005, 0]], [0.089, 0.025, 0.03]),
      h.turned('button-r', 'button', 'x', [[0, 0], [0, 0.004], [0.005, 0.005], [0.005, 0]], [-0.094, 0.025, 0.03]),
    ],
    { cloth: 'cloth-blue', band: 'cloth-navy', seam: 'cloth-navy', peak: 'vinyl-black', badge: 'cloth-cream', eagle: 'cloth-navy', button: 'metal-silver' })
  + { voxelGrain: 0.004 },

  // A red cotton holiday hat standing on its trim, 220 mm across and 220 mm tall: a soft cone flopping over to one
  // side above a thick band of white faux fur, a fur pompom on its tip.
  h.compound('santa_hat', 0.19, [
    ring('trim', 'fur', 0.08, 0.104, 0, 0.055),
    ring('trim-roll', 'fur', 0.075, 0.098, 0.055, 0.064),
    h.turned('cone', 'cloth', 'y', [[0, 0], [0, 0.092], [0.06, 0.08], [0.12, 0.05], [0.16, 0.028], [0.16, 0]], [0, 0.05, 0]),
    coneX('tip', 'cloth', 0.036, 0.14, 0.0, 0.178),
    // The tip's last stretch hangs down beside the cone, narrowing to the pompom.
    h.turned('droop', 'cloth', 'y', [[0, 0], [0, 0.011], [0.07, 0.022], [0.07, 0]], [0.12, 0.105, 0]),
    ball('pompom', 'fur', 0.03, 0.12, 0.09, 0),
  ], { cloth: 'cloth-red', fur: 'fur-pale' })
  + { voxelGrain: 0.004 },
]
