local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;
local rad(d) = d * std.pi / 180;

// Black dragonhide and dragonscale gear, in the finishes batch 198 gave its dragonhide boots, packs and gauntlets:
// hide in `hide-dragon-black` with red-brown `leather-chestnut` trim and bone buckles, scales in glossy `chitin-black`.

// The same pieces made k times larger, for the oversized sizes cut to fit strange bodies.
local scaled(pieces, k) = [
  p + (
    if p.kind == 'box' then { min: [v * k for v in p.min], max: [v * k for v in p.max] }
    else if p.kind == 'prism' then { profile: [[v * k for v in q] for q in p.profile], start: p.start * k, end: p.end * k }
    else { profile: [[v * k for v in q] for q in p.profile] } + (if std.objectHas(p, 'origin') then { origin: [v * k for v in p.origin] } else {})
  )
  for p in pieces
];

// ---- Gloves ----

// Hide gloves: short cuffs bound in red-brown leather, a red-brown knuckle strip and a bone-buttoned strap round each wrist.
local hideGlove = { t: 0.016, cuff: 0.06, flare: 0.054, binding: 'trim', knuckle: 'trim' };
local wristStrap(p, cx, s) = [
  g.sbox(p + 'strap', 'trim', [cx - 0.05, 0, -0.04], [cx + 0.05, 0.018, -0.026]),
  h.disc(p + 'button', 'button', 0.006, 0.018, 0.022, cx + s * 0.035, -0.033),
];
local hideGloves = g.glovePair(hideGlove, 0.07, wristStrap);
local hideGloveFinish = { glove: 'hide-dragon-black', cuff: 'hide-dragon-black', trim: 'leather-chestnut', button: 'bone' };
// Batch 198's dragonscale gauntlets, so the oversized pair matches them.
local scaleGlove = { t: 0.02, cuff: 0.11, flare: 0.07, mail: 'scale', binding: 'trim', knuckle: 'scale' };
local scaleGloveFinish = { glove: 'hide-dragon-black', cuff: 'hide-dragon-black', scale: 'chitin-black', trim: 'leather-chestnut' };

// ---- Helmets ----

// A helmet standing upright, front on +z: a turned skull of radius r with straight walls to yw and a dome hd high.
local skullPath(r, yw, hd) = [[0, 0], [0, r], [yw, r]] + [[yw + hd * std.sin(rad(90 * i / 8)), r * std.cos(rad(90 * i / 8))] for i in std.range(1, 8)];
local domeR(r, yw, hd, y) = if y <= yw then r else r * std.sqrt(std.max(0, 1 - std.pow((y - yw) / hd, 2)));
// A keel `out` proud of the dome from front to back, `w` thick, from angle a0 to a1 (90 is the crown).
local keel(id, slot, r, yw, hd, out, w, a0, a1, n=12) =
  h.prism(id, slot, 'x', [[yw + (hd + out) * std.sin(rad(a0 + (a1 - a0) * i / n)), (r + out) * std.cos(rad(a0 + (a1 - a0) * i / n))] for i in std.range(0, n)], -w / 2, w / 2);
// A boss on each side of the skull at height y: visor pivots and chin-strap rivets.
local bosses(prefix, slot, r, y, z, br) = [
  h.turned('%s-%d' % [prefix, s + 1], slot, 'x', [[0, 0], [0, br], [0.012, br], [0.012, 0]], [if s > 0 then r - 0.004 else -r - 0.008, y, z])
  for s in [-1, 1]
];
// Rows of overlapping scales round the skull from y0 up, each row a ring of separate curved tabs offset half a tab
// from the row below, leaving out the front `skip` degrees either side where a visor or face opening sits.
local scaleRows(prefix, r, yw, hd, y0, rows, step, skip) = std.flattenArrays([
  local y = y0 + j * step, rr = domeR(r, yw, hd, y + step);
  local n = std.max(8, std.floor(18 * rr / r)), da = 360 / n, off = (j % 2) * da / 2;
  std.flattenArrays([
    h.crescent('%s-%d-%d' % [prefix, j, k], 'scale', rr - 0.004, rr + 0.004 + (j % 2) * 0.002, a, a + da * 0.78, 1, y, y + step * 0.92)
    for k in std.range(0, n - 1)
    for a in [off + k * da]
    if std.abs(std.mod(a + da * 0.43 + 180, 360) - 180) > skip
  ])
  for j in std.range(0, rows - 1)
]);

// The open-faced hide helmet: a black hide skull with a red-brown brow band, a raised red-brown keel, stitched side
// seams, a rolled lower edge and a bone-riveted chin strap. The face opening is drawn flush in the dark inside,
// framed in red-brown so it reads against the black hide.
local hideHelmet =
  local r = 0.1, yw = 0.15, hd = 0.11;
  [
    h.turned('skull', 'hide', 'y', skullPath(r, yw, hd)),
    keel('keel', 'trim', r, yw, hd, 0.008, 0.016, 15, 165),
    g.ring('brow', 'trim', r - 0.002, r + 0.005, 0.13, 0.15),
    g.ring('rim', 'trim', r - 0.002, r + 0.005, 0, 0.012),
  ]
  + g.wrapBand('face', 'inside', r + 0.003, 0.004, -50, 50, 10, 0, function(a) 0.012, function(a) 0.125 - 0.035 * std.pow(a / 50, 2))
  + g.wrapBand('face-edge-l', 'trim', r + 0.006, 0.004, -56, -50, 1, 0, function(a) 0.012, function(a) 0.13)
  + g.wrapBand('face-edge-r', 'trim', r + 0.006, 0.004, 50, 56, 1, 0, function(a) 0.012, function(a) 0.13)
  + std.flattenArrays([
    g.wrapBand('seam-%d' % i, 'trim', r + 0.003, 0.004, a - 2, a + 2, 1, 0, function(x) 0.012, function(x) 0.13)
    for i in [0, 1, 2]
    for a in [[110, 180, 250][i]]
  ])
  + bosses('rivet', 'button', r, 0.06, -0.01, 0.01)
  + [
    box('chin-strap-%d' % (s + 1), 'trim', [if s > 0 then r + 0.006 else -r - 0.012, -0.0, -0.022], [if s > 0 then r + 0.012 else -r - 0.006, 0.055, 0.002])
    for s in [-1, 1]
  ];
local hideHelmetFinish = { hide: 'hide-dragon-black', trim: 'leather-chestnut', inside: 'screen-black', button: 'bone' };

// A band of the lowered visor, as g.wrapBand draws it round the skull, swung up about the x axis through the visor
// pivots at height `pivotY` by `visorLift` degrees, so the raised visor stands over the brow and its sides stay on
// the pivot bosses. Built as thin slices along x, each a prism whose [y, z] outline is the turned cross-section.
local pivotY = 0.145, visorLift = 75;
local liftYZ(y, z) = local c = std.cos(rad(visorLift)), sn = std.sin(rad(visorLift));
  [pivotY + (y - pivotY) * c + z * sn, -(y - pivotY) * sn + z * c];
local raisedBand(prefix, slot, r, t, a0, a1, steps, y0, y1) = [
  local aa = a0 + (a1 - a0) * i / steps, ab = a0 + (a1 - a0) * (i + 1) / steps, am = (aa + ab) / 2;
  local zin = (r - t) * std.min(std.cos(rad(aa)), std.cos(rad(ab))), zout = r * std.max(std.cos(rad(aa)), std.cos(rad(ab)));
  local ya = y0(am), yb = y1(am);
  h.prism('%s-%d' % [prefix, i], slot, 'x', [liftYZ(ya, zin), liftYZ(ya, zout), liftYZ(yb, zout), liftYZ(yb, zin)], r * std.sin(rad(aa)), r * std.sin(rad(ab)))
  for i in std.range(0, steps - 1)
];

// The dragonscale helmet: a closed skull covered in rows of scales, a crest of scale fins down the middle and a visor
// hinged on bone bosses at the temples. `raised` swings the visor up over the brow and bares the face opening;
// lowered, it covers the face but for a thin eye slit.
local scaleHelmet(raised) =
  local r = 0.104, yw = 0.16, hd = 0.115, vr = r + 0.014;
  [h.turned('skull', 'hide', 'y', skullPath(r, yw, hd))]
  + scaleRows('wall', r, yw, hd, 0.004, 9, 0.024, 64)
  + scaleRows('crown', r, yw, hd, 0.22, 2, 0.024, 0)
  + [
    local a = 30 + i * 22, y = yw + hd * std.sin(rad(a)), z = r * std.cos(rad(a));
    h.prism('fin-%d' % i, 'scale', 'x', [[y - 0.01, z + 0.03], [y + 0.04 - i * 0.004, z - 0.015], [y - 0.01, z - 0.03]], -0.004, 0.004)
    for i in [0, 1, 2, 3, 4, 5]
  ]
  + bosses('pivot', 'button', vr - 0.002, 0.145, 0, 0.016)
  + (if raised then
       g.wrapBand('face', 'inside', r + 0.003, 0.004, -50, 50, 10, 0, function(a) 0.02, function(a) 0.135)
       + raisedBand('visor', 'visor', vr + 0.008, 0.008, -64, 64, 14, function(a) 0.01, function(a) 0.168 - 0.01 * std.pow(a / 64, 2))
       + raisedBand('slit', 'inside', vr + 0.009, 0.002, -48, 48, 10, function(a) 0.114, function(a) 0.124)
       + raisedBand('slit-brow', 'trim', vr + 0.01, 0.004, -52, 52, 10, function(a) 0.124, function(a) 0.134)
       + raisedBand('slit-cheek', 'trim', vr + 0.01, 0.004, -52, 52, 10, function(a) 0.104, function(a) 0.114)
       + raisedBand('visor-edge', 'trim', vr + 0.009, 0.004, -64, 64, 14, function(a) 0.01, function(a) 0.02)
       + raisedBand('snout', 'visor', vr + 0.016, 0.01, -2.5, 2.5, 1, function(a) 0.01, function(a) 0.11)
     else
       g.wrapBand('visor', 'visor', vr, 0.008, -64, 64, 14, 0, function(a) 0.01, function(a) 0.168 - 0.01 * std.pow(a / 64, 2))
       + g.wrapBand('slit', 'inside', vr + 0.001, 0.002, -48, 48, 10, 0, function(a) 0.114, function(a) 0.124)
       + g.wrapBand('slit-brow', 'trim', vr + 0.002, 0.004, -52, 52, 10, 0, function(a) 0.124, function(a) 0.134)
       + g.wrapBand('slit-cheek', 'trim', vr + 0.002, 0.004, -52, 52, 10, 0, function(a) 0.104, function(a) 0.114)
       + g.wrapBand('visor-edge', 'trim', vr + 0.001, 0.004, -64, 64, 14, 0, function(a) 0.01, function(a) 0.02)
       + [
         box('snout', 'visor', [-0.005, 0.01, vr - 0.002], [0.005, 0.11, vr + 0.008]),
       ]
       + [
         local a = rad(s * 12 * k);
         h.turned('vent-%d-%d' % [s + 1, k], 'inside', 'z', [[0, 0], [0, 0.0035], [0.004, 0.0035], [0.004, 0]], [vr * std.sin(a), 0.05, vr * std.cos(a) - 0.001])
         for s in [-1, 1]
         for k in [1, 2, 3]
       ]);
local scaleHelmetFinish = { hide: 'leather-charcoal', scale: 'chitin-black', visor: 'chitin-black', trim: 'leather-chestnut', inside: 'screen-black', button: 'bone' };

// ---- Suits ----

// A whole suit laid out flat, front up, neck towards -z: a body panel, sleeves angled out from the shoulders and
// legs down to the ankles, with a red-brown collar, cuffs and belt and a bone buckle. `scales` covers it in rows of
// overlapping pointed scales; without them it is plain hide with red-brown pads at the shoulders, elbows and knees and
// a laced front. Slots: hide, trim, scale, buckle.
local quad(id, slot, c, u, n, sw, sl, y, t) =
  g.flat(id, slot, [
    [c[0] - n[0] * sw / 2 - u[0] * sl / 2, c[1] - n[1] * sw / 2 - u[1] * sl / 2],
    [c[0] + n[0] * sw / 2 - u[0] * sl / 2, c[1] + n[1] * sw / 2 - u[1] * sl / 2],
    [c[0] + n[0] * sw / 2 + u[0] * sl * 0.2, c[1] + n[1] * sw / 2 + u[1] * sl * 0.2],
    [c[0] + u[0] * sl / 2, c[1] + u[1] * sl / 2],
    [c[0] - n[0] * sw / 2 + u[0] * sl * 0.2, c[1] - n[1] * sw / 2 + u[1] * sl * 0.2],
  ], y, t);
// Pointed scales in rows across a strip `w` wide from a to b lying on a face at y, tips towards b.
local scaleStrip(prefix, a, b, w, y, across) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz), u = [dx / len, dz / len], n = [-u[1], u[0]];
  local sw = w / across, sl = 0.04, step = 0.03;
  [
    local d = 0.02 + j * step, off = (if j % 2 == 0 then 0 else 0.5) - across / 2 + 0.5 + k;
    local c = [a[0] + u[0] * d + n[0] * off * sw, a[1] + u[1] * d + n[1] * off * sw];
    quad('%s-%d-%d' % [prefix, j, k], 'scale', c, u, n, sw * 0.96, sl, y + (j % 2) * 0.002, 0.004)
    for j in std.range(0, std.floor((len - 0.04) / step))
    for k in std.range(0, across - (if j % 2 == 0 then 1 else 2))
  ];
local suit(scales) =
  local t = 0.02;
  local sleeve(s) = [[s * 0.18, -0.56], [s * 0.44, -0.04]];
  local leg(s) = [[s * 0.1, -0.02], [s * 0.13, 0.72]];
  [
    g.flat('body', 'hide', [[-0.21, -0.6], [0.21, -0.6], [0.2, 0.03], [-0.2, 0.03]], 0, t),
    g.strip('belt', 'trim', [-0.2, -0.04], [0.2, -0.04], t, 0.045, 0.006),
    box('buckle', 'buckle', [-0.03, t + 0.006, -0.066], [0.03, t + 0.012, -0.014]),
  ]
  + h.crescent('collar', 'trim', 0.06, 0.09, -110, 110, 10, t, t + 0.01, 0, -0.545)
  + [h.disc('neck', 'inside', 0.06, t, t + 0.002, 0, -0.545)]
  + std.flattenArrays([
    local sl = sleeve(s), lg = leg(s), su = side == 'l';
    [
      g.strip('sleeve-' + side, 'hide', sl[0], sl[1], 0, 0.13, t * 0.9),
      g.strip('cuff-' + side, 'trim', [sl[1][0] - s * 0.02 * 0.45, sl[1][1] - 0.04], sl[1], t * 0.9, 0.14, 0.006),
      g.strip('leg-' + side, 'hide', lg[0], lg[1], 0, 0.17, t * 0.9),
      g.strip('ankle-' + side, 'trim', [lg[1][0] - s * 0.002, lg[1][1] - 0.045], lg[1], t * 0.9, 0.18, 0.006),
    ]
    + (if scales then
         scaleStrip('scale-arm-' + side, [s * 0.2, -0.53], [s * 0.42, -0.1], 0.12, t * 0.9, 3)
         + scaleStrip('scale-leg-' + side, [s * 0.1, 0.02], [s * 0.13, 0.66], 0.16, t * 0.9, 4)
       else [
         g.flat('shoulder-' + side, 'trim', [[s * 0.12, -0.6], [s * 0.22, -0.6], [s * 0.25, -0.5], [s * 0.15, -0.48]], t, 0.008),
         g.flat('elbow-' + side, 'trim', [[s * 0.28, -0.33], [s * 0.35, -0.36], [s * 0.38, -0.27], [s * 0.31, -0.24]], t * 0.9, 0.006),
         g.flat('knee-' + side, 'trim', [[s * 0.06, 0.3], [s * 0.15, 0.3], [s * 0.17, 0.4], [s * 0.07, 0.4]], t * 0.9, 0.008),
         g.strip('side-seam-' + side, 'trim', [s * 0.205, -0.5], [s * 0.198, -0.07], t, 0.008, 0.002),
       ])
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ])
  + (if scales then
       scaleStrip('scale-body', [0, -0.5], [0, -0.07], 0.38, t, 9)
       + [h.prism('gorget', 'scale', 'y', [[-0.6, -0.1], [-0.6, 0.1], [-0.5, 0.12], [-0.47, 0], [-0.5, -0.12]], t + 0.002, t + 0.008)]
     else
       [g.strip('placket', 'trim', [0, -0.5], [0, -0.07], t, 0.03, 0.004)]
       + [h.disc('toggle-%d' % i, 'buckle', 0.007, t + 0.004, t + 0.009, 0, -0.46 + i * 0.09) for i in [0, 1, 2, 3]]);
local suitFinish = { hide: 'hide-dragon-black', trim: 'leather-chestnut', scale: 'chitin-black', buckle: 'bone', inside: 'screen-black' };
// Under the scales the hide is charcoal, so the black scales stand out from it.
local scaleSuitFinish = suitFinish { hide: 'leather-charcoal' };

[
  // The oversized pair of batch 198's dragonscale gauntlets, 360 mm from cuff to fingertip, laid flat side by side,
  // backs up: hide gloves scaled over the backs and fingers, with wide flared cuffs.
  h.compound('gauntlets_xlblack_dragon_scale', 0.63, scaled(g.glovePair(scaleGlove, 0.085), 1.2), scaleGloveFinish)
  + { voxelGrain: 0.004 },

  // A pair of black dragonhide gloves laid flat side by side, backs up, 250 mm from cuff to fingertip, with a
  // red-brown knuckle strip and a bone-buttoned wrist strap.
  h.compound('gloves_black_dragon_hide', 0.27, hideGloves, hideGloveFinish)
  + { voxelGrain: 0.004 },

  // The oversized dragonhide gloves, 300 mm from cuff to fingertip.
  h.compound('gloves_xlblack_dragon_hide', 0.46, scaled(hideGloves, 1.2), hideGloveFinish)
  + { voxelGrain: 0.004 },

  // An open-faced black dragonhide helmet 270 mm tall and 200 mm across the skull, standing upright.
  h.compound('helmet_black_dragon_hide', 0.92, hideHelmet, hideHelmetFinish)
  + { voxelGrain: 0.004 },

  // A closed black dragonscale helmet 300 mm tall to its crest and 240 mm across the visor, its visor down.
  h.compound('helmet_black_dragon_scale', 1.4, scaleHelmet(false), scaleHelmetFinish)
  + { voxelGrain: 0.004 },

  // The same helmet with its visor swung up over the brow, 300 mm tall.
  h.compound('helmet_black_dragon_scale_raised', 1.6, scaleHelmet(true), scaleHelmetFinish)
  + { voxelGrain: 0.004 },

  // The oversized dragonhide helmet, 320 mm tall and 240 mm across the skull.
  h.compound('helmet_xlblack_dragon_hide', 1.6, scaled(hideHelmet, 1.2), hideHelmetFinish)
  + { voxelGrain: 0.004 },

  // The oversized dragonscale helmet, 365 mm tall to its crest, visor down.
  h.compound('helmet_xlblack_dragon_scale', 2.4, scaled(scaleHelmet(false), 1.2), scaleHelmetFinish)
  + { voxelGrain: 0.004 },

  // The oversized dragonscale helmet with its visor raised.
  h.compound('helmet_xlblack_dragon_scale_raised', 1.8, scaled(scaleHelmet(true), 1.2), scaleHelmetFinish)
  + { voxelGrain: 0.004 },

  // A one-piece black dragonhide suit laid out flat, 1390 mm from collar to ankle and 1020 mm across the sleeves.
  h.compound('suit_black_dragon_hide', 4.5, suit(false), suitFinish),

  // The black dragonscale suit laid out flat, the same cut covered in rows of overlapping scales.
  h.compound('suit_black_dragon_scale', 6, suit(true), scaleSuitFinish),

  // The oversized dragonhide suit, 1670 mm from collar to ankle.
  h.compound('suit_xlblack_dragon_hide', 6, scaled(suit(false), 1.2), suitFinish),

  // The oversized dragonscale suit, 1670 mm from collar to ankle.
  h.compound('suit_xlblack_dragon_scale', 8, scaled(suit(true), 1.2), scaleSuitFinish),
]
