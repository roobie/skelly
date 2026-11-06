local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;
// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);
// A flat convex outline of [x, z] points lying on a face from y to y + t.
local flat(id, slot, pts, y, t=0.004) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y, y + t);
// A strip `w` wide lying flat at y from [xa, za] to [xb, zb].
local strip(id, slot, a, b, y, w=0.012, t=0.003) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  flat(id, slot, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], y, t);
// A rectangle `w` across and `l` long centred on [cx, cz], turned `deg` degrees about y: scrap and tyre pieces set askew.
local skew(cx, cz, w, l, deg) =
  local a = deg * std.pi / 180, c = std.cos(a), s = std.sin(a);
  [[cx + p[0] * c - p[1] * s, cz + p[0] * s + p[1] * c] for p in [[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2]]];

// Every whole-body suit lies front up, neck towards -z, 1.3 m from collar to toe: the torso in the middle, an arm
// either side of it and the legs below. These are the centre lines and spans each suit builds on.
local L = {
  armX: 0.33, legX: 0.11,
  neck: -0.58, hem: 0.0,
  arm0: -0.56, arm1: -0.02,
  leg0: 0.12, leg1: 0.74,
};
local sides = [-1, 1];
local sideName(s) = if s < 0 then 'l' else 'r';

// The cloth or leather under-suit seen between plates: a torso panel, sleeves and legs, `t` thick. Slot `under`.
local underSuit(slot='under', t=0.006, torsoW=0.44, armW=0.14, legW=0.18, legEnd=L.leg1) =
  [
    flat('under-torso', slot, [[-torsoW / 2 + 0.07, L.neck], [torsoW / 2 - 0.07, L.neck], [torsoW / 2, L.neck + 0.06], [torsoW / 2, L.hem + 0.1], [-torsoW / 2, L.hem + 0.1], [-torsoW / 2, L.neck + 0.06]], 0, t),
  ]
  + [
    sbox('under-arm-' + sideName(s), slot, [s * (L.armX - armW / 2), 0, L.arm0], [s * (L.armX + armW / 2), t, L.arm1])
    for s in sides
  ]
  + [
    sbox('under-shoulder-' + sideName(s), slot, [s * (torsoW / 2 - 0.01), 0, L.arm0 + 0.01], [s * (L.armX - armW / 2 + 0.01), t, L.arm0 + 0.12])
    for s in sides
  ]
  + [
    sbox('under-leg-' + sideName(s), slot, [s * (L.legX - legW / 2), 0, L.hem + 0.08], [s * (L.legX + legW / 2), t, legEnd])
    for s in sides
  ];

// A plate suit laid out flat on an optional under-suit: a curved breastplate with a raised centre ridge and rolled
// neck, a fauld of overlapping lames, shoulder cops with lames, upper and lower arm plates around an elbow cop,
// thigh and shin plates around a knee cop, sabaton lames, and buckled straps. Options:
//   y       where the plates rest (the under-suit's thickness);
//   t       plate thickness as drawn;
//   lames   fauld lames under the breastplate;
//   cop     shoulder cop rim radius, and `copLames` lames hanging below it;
//   gorget  a collar plate over the neck;
//   mail    a mail skirt below the fauld and mail gussets at the armpits;
//   wings   side wings on the knee and elbow cops;
//   feet    sabaton lames at the toes;
//   ridge   a raised ridge down the breastplate.
// Slots: plate, edge, strap, buckle, and mail and ring when mail is on.
local plateSuit(o={}) =
  local c = { y: 0, t: 0.004, lames: 3, cop: 0.09, copLames: 2, gorget: false, mail: true, wings: true, feet: true, ridge: true, r: 0.35, legShift: 0.1 } + o;
  local y = c.y, t = c.t;
  local breast = [[-0.12, L.neck], [0.12, L.neck], [0.2, L.neck + 0.08], [0.2, L.hem - 0.08], [0.16, L.hem], [-0.16, L.hem], [-0.2, L.hem - 0.08], [-0.2, L.neck + 0.08]];
  local top = h.curvedTopAt(breast, y, t, c.r, 0);
  // A plate centred on x = cx from z0 to z1, `w` across, curved with radius r.
  local limbPlate(p, cx, z0, z1, w, r, taper=0.01) =
    h.curvedPlate(p, 'plate', [[-w / 2 + taper, z0], [w / 2 - taper, z0], [w / 2, z1], [-w / 2, z1]], y, t, r, 6, cx, 0)
    + [
      sbox(p + '-roll', 'edge', [cx - w / 2 + taper, y, z0], [cx + w / 2 - taper, h.curvedTopAt([[-w / 2, 0], [w / 2, 0]], y, t, r, 0) + 0.004, z0 + 0.008]),
    ];
  // A strap across a limb plate at z, with a buckle on the outer side s.
  local strapAt(p, cx, z, w, s, ht) = [
    sbox(p + '-strap', 'strap', [cx - w / 2 - 0.012, y, z - 0.01], [cx + w / 2 + 0.012, ht + 0.003, z + 0.01]),
    sbox(p + '-buckle', 'buckle', [cx + s * (w / 2 - 0.004), y, z - 0.014], [cx + s * (w / 2 + 0.018), ht + 0.006, z + 0.014]),
  ];
  local cop(id, cx, cz, a, ht) = [h.dome(id, 'plate', a, ht, t, 'y', [cx, y, cz])];
  h.curvedPlate('breast', 'plate', breast, y, t, c.r, 10)
  + [sbox('neck-roll', 'edge', [-0.12, y, L.neck - 0.004], [0.12, top - 0.02, L.neck + 0.012])]
  + (if c.ridge then [h.onCurvedFace('ridge', 'edge', breast, y, t, c.r, [0, L.neck + 0.02], [0, L.hem - 0.02], 0.012)] else [])
  + [
    h.onCurvedFace('rivet-%s-%d' % [sideName(s), i], 'buckle', breast, y, t, c.r, [s * 0.17, L.neck + 0.12 + i * 0.12], [s * 0.17, L.neck + 0.134 + i * 0.12], 0.012)
    for s in sides
    for i in [0, 1, 2, 3]
  ]
  + std.flattenArrays([
    h.curvedPlate('fauld-%d' % i, 'plate', [[-0.17 + i * 0.008, L.hem - 0.01 + i * 0.035], [0.17 - i * 0.008, L.hem - 0.01 + i * 0.035], [0.17 - i * 0.008, L.hem + 0.035 + i * 0.035], [-0.17 + i * 0.008, L.hem + 0.035 + i * 0.035]], y + 0.004 * (c.lames - i), t, c.r, 6)
    for i in std.range(0, c.lames - 1)
  ])
  + (if c.gorget then h.crescent('gorget', 'edge', 0.075, 0.125, -105, 105, 10, top - 0.03, top + 0.004, 0, L.neck - 0.04) else [])
  + (if c.mail then [
       box('mail-skirt', 'mail', [-0.19, 0, L.hem + 0.02 + c.lames * 0.035], [0.19, y + 0.006, L.hem + 0.11 + c.lames * 0.035]),
     ] + [
       box('mail-ring-%d' % i, 'ring', [-0.19, y + 0.006, L.hem + 0.03 + c.lames * 0.035 + i * 0.016], [0.19, y + 0.009, L.hem + 0.036 + c.lames * 0.035 + i * 0.016])
       for i in [0, 1, 2, 3, 4]
     ] + [
       sbox('mail-gusset-' + sideName(s), 'mail', [s * 0.19, 0, L.neck + 0.1], [s * (L.armX - 0.04), y + 0.008, L.neck + 0.2])
       for s in sides
     ] else [])
  + std.flattenArrays([
    local x = s * L.armX, p = 'arm-' + sideName(s);
    cop(p + '-cop', x, L.arm0 + 0.06, c.cop, c.cop * 0.55)
    + std.flattenArrays([
      h.curvedPlate('%s-lame-%d' % [p, i], 'plate', [[-c.cop + 0.01 * i, L.arm0 + 0.12 + i * 0.03], [c.cop - 0.01 * i, L.arm0 + 0.12 + i * 0.03], [c.cop - 0.01 * i - 0.005, L.arm0 + 0.16 + i * 0.03], [-c.cop + 0.01 * i + 0.005, L.arm0 + 0.16 + i * 0.03]], y + 0.006, t, 0.1, 5, x, 0)
      for i in std.range(0, c.copLames - 1)
    ])
    + limbPlate(p + '-upper', x, L.arm0 + 0.16 + c.copLames * 0.03, -0.26, 0.12, 0.08)
    + strapAt(p + '-upper', x, -0.3, 0.12, s, h.curvedTopAt([[-0.06, 0], [0.06, 0]], y, t, 0.08, 0))
    + cop(p + '-elbow', x, -0.215, 0.05, 0.035)
    + (if c.wings then [h.dome(p + '-elbow-wing', 'plate', 0.032, 0.012, t, 'y', [x + s * 0.05, y, -0.215])] else [])
    + limbPlate(p + '-fore', x, -0.18, L.arm1, 0.11, 0.075, -0.008)
    + strapAt(p + '-fore', x, -0.1, 0.11, s, h.curvedTopAt([[-0.055, 0], [0.055, 0]], y, t, 0.075, 0))
    for s in sides
  ])
  + std.flattenArrays([
    local x = s * L.legX, p = 'leg-' + sideName(s), d = c.legShift;
    local thighTop = h.curvedTopAt([[-0.085, 0], [0.085, 0]], y, t, 0.12, 0);
    limbPlate(p + '-thigh', x, L.leg0 + d, 0.37 + d, 0.17, 0.12, -0.01)
    + strapAt(p + '-thigh-a', x, 0.18 + d, 0.17, s, thighTop)
    + strapAt(p + '-thigh-b', x, 0.31 + d, 0.17, s, thighTop)
    + cop(p + '-knee', x, 0.41 + d, 0.06, 0.042)
    + (if c.wings then [h.dome(p + '-knee-wing', 'plate', 0.04, 0.014, t, 'y', [x + s * 0.065, y, 0.41 + d])] else [])
    + limbPlate(p + '-shin', x, 0.46 + d, L.leg1 - 0.06 + d, 0.13, 0.09, 0.015)
    + strapAt(p + '-shin', x, 0.6 + d, 0.13, s, h.curvedTopAt([[-0.065, 0], [0.065, 0]], y, t, 0.09, 0))
    + (if c.feet then [
         sbox('%s-sabaton-%d' % [p, i], 'plate', [x - 0.05 + i * 0.006, y + 0.012 - i * 0.003, L.leg1 - 0.06 + d + i * 0.03], [x + 0.05 - i * 0.006, y + 0.02 - i * 0.003, L.leg1 - 0.02 + d + i * 0.03])
         for i in [0, 1, 2]
       ] else [])
    for s in sides
  ]);

// A lamellar panel of `rows` lacquered lames `w` across, top edge at z0, each lame `lh` deep overlapping the next,
// with lace columns down it. Slots: lame, lace.
local lamellar(p, cx, z0, w, rows, lh, y, laces=6) =
  [
    box('%s-lame-%d' % [p, i], 'lame', [cx - w / 2, y + 0.004 * (rows - i), z0 + i * lh * 0.8], [cx + w / 2, y + 0.004 * (rows - i) + 0.006, z0 + i * lh * 0.8 + lh])
    for i in std.range(0, rows - 1)
  ]
  + [
    box('%s-lace-%d' % [p, j], 'lace', [cx - w / 2 + (j + 0.5) * w / laces - 0.004, y + 0.004 * rows + 0.006, z0], [cx - w / 2 + (j + 0.5) * w / laces + 0.004, y + 0.004 * rows + 0.009, z0 + (rows - 1) * lh * 0.8 + lh])
    for j in std.range(0, laces - 1)
  ]
  + [
    box('%s-cross-%d' % [p, i], 'lace', [cx - w / 2, y + 0.004 * (rows - i) + 0.006, z0 + i * lh * 0.8 + lh * 0.3], [cx + w / 2, y + 0.004 * (rows - i) + 0.008, z0 + i * lh * 0.8 + lh * 0.42])
    for i in std.range(0, rows - 1)
  ];

local plateFinish(plate, edge=null) = {
  plate: plate,
  edge: if edge == null then plate else edge,
  strap: 'leather-tan',
  buckle: 'brass-dull',
  mail: 'steel-mail',
  ring: 'steel-mail-dark',
};

// The tempered suits share one layout and change plate thickness, cop size and the extra pieces.
local qtSuit(o) = plateSuit(o);


// Folded mail garments, after batch 174's mail bundle: neck at +z, outside up.
// Rows of rings standing proud of a flat face at y, across x from x0 to x1, every `pitch` along z from z0 to z1.
local mailRows(prefix, x0, x1, z0, z1, y, pitch=0.014) = [
  box('%s-%d' % [prefix, i], 'mail', [x0, y, z0 + i * pitch], [x1, y + 0.004, z0 + i * pitch + 0.006])
  for i in std.range(0, std.floor((z1 - z0 - 0.006) / pitch))
];

// One leg of a one-piece suit folded up over the body, a panel `t` thick from the hem at z0 to the crotch at z1,
// `w0` across at the hem and `w1` at the top, centred on cx. Slot as given.
// `w0` across at the hem and `w1` at the top, centred on cx. Slot as given.
local legPanel(id, slot, cx, z0, z1, w0, w1, y, t) =
  h.prism(id, slot, 'y', [[z0, cx - w0 / 2], [z0, cx + w0 / 2], [z1, cx + w1 / 2], [z1, cx - w1 / 2]], y, y + t);

// A mail garment folded flat, 380 mm wide and `d` deep, neck at +z: a leather-bound neck, rows of rings across the
// body, and as asked mail sleeves along the sides, armholes for a sleeveless cut, the two legs folded up over the
// body with a belt across the waist, a split hem, and a coif lying at the neck. Slots: mail, binding, hole, buckle.
local mailBundle(o) =
  local c = { d: 0.4, sleeves: true, legs: false, armholes: false, slit: false, coif: false } + o;
  local w = 0.38, d = c.d, ht = 0.06, cz = d / 2 - 0.08, sw = 0.075, st = 0.01;
  local inner = if c.sleeves then w / 2 - sw - 0.004 else w / 2 - 0.01;
  local lt = 0.012, ly = ht + 0.004, legTop = if c.coif then 0 else 0.04;
  [p + { slot: 'mail' } for p in h.foldedGarment(w, d, ht, 3)]
  + mailRows('row', -inner, inner, -d / 2 + 0.008, cz - 0.075, ht)
  + (if c.coif then [] else
       h.crescent('neck', 'binding', 0.045, 0.062, -180, 180, 16, ht, ht + 0.006, 0, cz)
       + [h.disc('neck-hole', 'hole', 0.045, ht, ht + 0.002, 0, cz)])
  + (if c.sleeves then std.flattenArrays([
       [box('sleeve-%d' % (s + 1), 'mail', [if s < 0 then -w / 2 else w / 2 - sw, ht, -d / 2 + 0.04], [if s < 0 then -w / 2 + sw else w / 2, ht + st, cz + 0.03])]
       + mailRows('sleeve-%d-row' % (s + 1), if s < 0 then -w / 2 + 0.004 else w / 2 - sw + 0.004, if s < 0 then -w / 2 + sw - 0.004 else w / 2 - 0.004, -d / 2 + 0.046, cz + 0.024, ht + st)
       + [box('cuff-%d' % (s + 1), 'binding', [if s < 0 then -w / 2 else w / 2 - sw, ht, -d / 2 + 0.034], [if s < 0 then -w / 2 + sw else w / 2, ht + st + 0.003, -d / 2 + 0.046])]
       for s in [-1, 1]
     ]) else [])
  + (if c.armholes then std.flattenArrays([
       h.crescent('armhole-%d' % (s + 1), 'hole', 0.002, 0.045, if s < 0 then 0 else 180, if s < 0 then 180 else 360, 8, ht, ht + 0.0045, s * w / 2, cz - 0.03)
       + h.crescent('armhole-bind-%d' % (s + 1), 'binding', 0.045, 0.058, if s < 0 then 0 else 180, if s < 0 then 180 else 360, 8, ht, ht + 0.006, s * w / 2, cz - 0.03)
       for s in [-1, 1]
     ]) else [])
  + (if c.slit then [box('slit', 'hole', [-0.006, ht, -d / 2], [0.006, ht + 0.0045, -d / 2 + 0.11])] else [])
  + (if c.legs then std.flattenArrays([
       [legPanel('leg-%d' % (s + 1), 'mail', s * 0.088, -d / 2 + 0.01, legTop, 0.13, 0.16, ly, lt)]
       + mailRows('leg-%d-row' % (s + 1), s * 0.088 - 0.06, s * 0.088 + 0.06, -d / 2 + 0.016, legTop - 0.008, ly + lt)
       + [box('leg-hem-%d' % (s + 1), 'binding', [s * 0.088 - 0.066, ly, -d / 2 + 0.004], [s * 0.088 + 0.066, ly + lt + 0.004, -d / 2 + 0.016])]
       for s in [-1, 1]
     ]) + [
       box('belt-top', 'binding', [-w / 2 - 0.005, ht + 0.004, legTop], [w / 2 + 0.005, ht + 0.022, legTop + 0.032]),
       box('belt-l', 'binding', [-w / 2 - 0.005, 0, legTop], [-w / 2, ht + 0.022, legTop + 0.032]),
       box('belt-r', 'binding', [w / 2, 0, legTop], [w / 2 + 0.005, ht + 0.022, legTop + 0.032]),
       box('buckle', 'buckle', [-0.022, ht + 0.022, legTop - 0.003], [0.022, ht + 0.028, legTop + 0.035]),
     ] else [])
  + (if c.coif then [
       h.dome('coif', 'mail', 0.105, 0.1, 0.008, 'y', [0, ht, cz - 0.01]),
       h.turned('coif-face', 'hole', 'z', [[0, 0], [0, 0.04], [0.012, 0.04], [0.012, 0]], [0, ht + 0.05, cz + 0.068]),
       h.turned('coif-face-rim', 'binding', 'z', [[0, 0.04], [0, 0.05], [0.01, 0.05], [0.01, 0.04], [0, 0.04]], [0, ht + 0.05, cz + 0.064]),
     ] + [
       h.turned('coif-ring-%d' % i, 'mail', 'y', [[0, 0], [0, r], [0.004, r], [0.004, 0]], [0, ht + y, cz - 0.01])
       for i in std.range(0, 4)
       for y in [0.012 + i * 0.018]
       for r in [std.sqrt(std.max(0, 0.1053 * 0.1053 - std.pow(y - (0.1 - 0.1053), 2))) + 0.003]
     ] else []);

[
  // A full suit of plate armour laid out flat, front up, 1.4 m from collar to toe and 800 mm across: a curved
  // breastplate with a centre ridge over a three-lame fauld and a mail skirt, shoulder cops with two lames, arm and
  // leg plates around domed elbow and knee cops, sabaton lames and buckled leather straps. Tempered steel shows its
  // heat tint.
  h.compound('armor_qt_plate', 25, qtSuit({}), plateFinish('steel-heat-tint'))
  + { voxelGrain: 0.006 },

  // The light suit on the same layout: thin plates, small shoulder cops with one lame, no wings on the cops and
  // no sabatons, still over a mail skirt and gussets.
  h.compound('armor_qt_lightplate', 18, qtSuit({ t: 0.003, cop: 0.075, copLames: 1, lames: 2, wings: false, feet: false }), plateFinish('steel-heat-tint'))
  + { voxelGrain: 0.006 },

  // The heavy suit on the same layout: thick plates, a gorget over the neck, broad shoulder cops with three lames,
  // a four-lame fauld and winged cops.
  h.compound('armor_qt_heavyplate', 39, qtSuit({ t: 0.006, cop: 0.105, copLames: 3, lames: 4, gorget: true }), plateFinish('steel-heat-tint'))
  + { voxelGrain: 0.006 },

  // Plate armour over a fitted black bodysuit, laid out flat, 1.3 m from collar to toe: the tempered plate suit
  // resting on the bodysuit, which shows between the plates and at the cuffs, with ribbed vent panels down the
  // flanks and a cooling line running down each arm and leg.
  h.compound('armor_nomad_plate', 26,
             underSuit('under', 0.008, 0.46, 0.15, 0.19, L.leg1 + 0.12)
             + qtSuit({ y: 0.008, mail: true })
             + [
               box('vent-%s-%d' % [sideName(s), i], 'vent', [s * 0.2 - 0.012, 0.008, L.neck + 0.2 + i * 0.022], [s * 0.2 + 0.012, 0.016, L.neck + 0.212 + i * 0.022])
               for s in sides
               for i in std.range(0, 7)
             ]
             + [
               sbox('line-arm-' + sideName(s), 'vent', [s * (L.armX + 0.064), 0.008, L.arm0 + 0.12], [s * (L.armX + 0.072), 0.014, L.arm1])
               for s in sides
             ]
             + [
               sbox('line-leg-' + sideName(s), 'vent', [s * (L.legX + 0.088), 0.008, L.leg0], [s * (L.legX + 0.094), 0.014, L.leg1 + 0.12])
               for s in sides
             ],
             plateFinish('steel-heat-tint') + { under: 'nylon-black', vent: 'plastic-charcoal' })
  + { voxelGrain: 0.006 },

  // A leather armour suit laid out flat, 1.3 m from collar to toe: a thick leather torso, sleeves and leggings
  // with steel plates riveted where blows land, two on the chest, one on each upper arm, forearm, thigh and shin,
  // and a plate over each knee.
  h.compound('armor_plarmor', 12,
             underSuit('leather', 0.01, 0.46, 0.15, 0.19)
             + [
               sbox('chest-plate-' + sideName(s), 'plate', [s * 0.03, 0.01, L.neck + 0.1], [s * 0.18, 0.016, L.neck + 0.3])
               for s in sides
             ]
             + [box('belly-plate', 'plate', [-0.15, 0.01, L.neck + 0.34], [0.15, 0.016, L.neck + 0.5])]
             + std.flattenArrays([
               [
                 sbox('%s-plate' % p, 'plate', [s * L.armX - 0.055, 0.01, z0], [s * L.armX + 0.055, 0.016, z1]),
               ] + [
                 h.disc('%s-rivet-%d' % [p, i], 'rivet', 0.006, 0.016, 0.02, s * L.armX + [-0.04, 0.04][i % 2], [z0 + 0.015, z1 - 0.015][std.floor(i / 2)])
                 for i in [0, 1, 2, 3]
               ]
               for s in sides
               for seg in [['upper', -0.5, -0.3], ['fore', -0.2, -0.05]]
               for p in ['arm-%s-%s' % [sideName(s), seg[0]]]
               for z0 in [seg[1]]
               for z1 in [seg[2]]
             ])
             + std.flattenArrays([
               [
                 sbox('%s-plate' % p, 'plate', [s * L.legX - w / 2, 0.01, z0], [s * L.legX + w / 2, 0.016, z1]),
               ] + [
                 h.disc('%s-rivet-%d' % [p, i], 'rivet', 0.006, 0.016, 0.02, s * L.legX + [-w / 2 + 0.015, w / 2 - 0.015][i % 2], [z0 + 0.015, z1 - 0.015][std.floor(i / 2)])
                 for i in [0, 1, 2, 3]
               ]
               for s in sides
               for seg in [['thigh', 0.14, 0.34, 0.14], ['knee', 0.37, 0.45, 0.1], ['shin', 0.48, 0.7, 0.12]]
               for p in ['leg-%s-%s' % [sideName(s), seg[0]]]
               for z0 in [seg[1]]
               for z1 in [seg[2]]
               for w in [seg[3]]
             ])
             + [
               h.disc('chest-rivet-%s-%d' % [sideName(s), i], 'rivet', 0.006, 0.016, 0.02, s * [0.045, 0.165][i % 2], L.neck + [0.115, 0.285][std.floor(i / 2)])
               for s in sides
               for i in [0, 1, 2, 3]
             ]
             + [box('lace-' + i, 'lace', [-0.006, 0.01, L.neck + 0.04 + i * 0.05], [0.006, 0.014, L.neck + 0.07 + i * 0.05]) for i in std.range(0, 9)]
             + [box('belt', 'lace', [-0.23, 0.01, L.hem + 0.02], [0.23, 0.016, L.hem + 0.06]), box('belt-buckle', 'rivet', [-0.025, 0.016, L.hem + 0.015], [0.025, 0.02, L.hem + 0.065])],
             { leather: 'leather-chestnut', plate: 'steel-grey', rivet: 'steel-bright', lace: 'leather-black' })
  + { voxelGrain: 0.006 },

  // A riot suit laid out flat, 1.4 m from collar to toe: black moulded plastic chest and limb shells with grey
  // padding along their edges, domed knee and elbow cups, foot guards, hook-and-loop straps, webbing rows across
  // the chest and a pale lettering band across it.
  h.compound('armor_riot', 3,
             plateSuit({ t: 0.006, lames: 2, cop: 0.095, copLames: 1, mail: false, feet: false, ridge: false, r: 0.3 })
             + h.webbingFlat('webbing', 'strap', -0.15, 0.15, [L.neck + 0.2, L.neck + 0.245, L.neck + 0.29], h.curvedTopAt([[-0.2, 0], [0.2, 0]], 0, 0.006, 0.3, 0.15))
             + [box('band', 'band', [-0.13, h.curvedTopAt([[-0.2, 0], [0.2, 0]], 0, 0.006, 0.3, 0.13), L.neck + 0.36], [0.13, h.curvedTopAt([[-0.2, 0], [0.2, 0]], 0, 0.006, 0.3, 0) + 0.002, L.neck + 0.4])]
             + std.flattenArrays([
               [h.dome('foot-' + sideName(s), 'plate', 0.06, 0.035, 0.006, 'y', [s * L.legX, 0, L.leg1 + 0.12])]
               + [sbox('foot-strap-' + sideName(s), 'strap', [s * L.legX - 0.07, 0, L.leg1 + 0.11], [s * L.legX + 0.07, 0.04, L.leg1 + 0.13])]
               for s in sides
             ]),
             { plate: 'plastic-matte-black', edge: 'plastic-charcoal', strap: 'hook-loop-grey', buckle: 'plastic-charcoal', band: 'felt-grey' })
  + { voxelGrain: 0.006 },

  // A lacquered lamellar armour laid out flat, 1.3 m from collar to toe: the box cuirass of six laced rows of
  // black lames, a broad laced shoulder board either side, four laced skirt panels hanging below, cloth sleeves set
  // with small iron plates and ending in hand guards, and shin guards of iron splints.
  h.compound('armor_samurai', 12,
             lamellar('do', 0, L.neck, 0.4, 7, 0.1, 0, 8)
             + [box('do-rim', 'gilt', [-0.2, 0.034, L.neck - 0.006], [0.2, 0.04, L.neck + 0.02])]
             + std.flattenArrays([
               lamellar('sode-' + sideName(s), s * L.armX, L.arm0, 0.2, 6, 0.06, 0.006, 5)
               + [box('sode-%s-top' % sideName(s), 'gilt', [s * L.armX - 0.1, 0.03, L.arm0 - 0.008], [s * L.armX + 0.1, 0.038, L.arm0 + 0.012])]
               for s in sides
             ])
             + std.flattenArrays([
               [sbox('kote-' + sideName(s), 'sleeve', [s * L.armX - 0.065, 0, L.arm0 + 0.2], [s * L.armX + 0.065, 0.006, L.arm1])]
               + [
                 sbox('kote-%s-plate-%d' % [sideName(s), i], 'iron', [s * L.armX - 0.03, 0.006, L.arm0 + 0.26 + i * 0.05], [s * L.armX + 0.03, 0.01, L.arm0 + 0.29 + i * 0.05])
                 for i in std.range(0, 4)
               ]
               + [sbox('tekko-' + sideName(s), 'iron', [s * L.armX - 0.05, 0.006, L.arm1 - 0.02], [s * L.armX + 0.05, 0.012, L.arm1 + 0.06])]
               for s in sides
             ])
             + std.flattenArrays([
               lamellar('kusazuri-%d' % i, [-0.15, -0.05, 0.05, 0.15][i], L.hem + 0.06, 0.09, 5, 0.06, 0.004 * (i % 2), 3)
               for i in [0, 1, 2, 3]
             ])
             + std.flattenArrays([
               [sbox('suneate-' + sideName(s), 'sleeve', [s * L.legX - 0.07, 0, 0.42], [s * L.legX + 0.07, 0.006, 0.72])]
               + [
                 sbox('suneate-%s-splint-%d' % [sideName(s), i], 'iron', [s * L.legX - 0.06 + i * 0.03, 0.006, 0.44], [s * L.legX - 0.04 + i * 0.03, 0.012, 0.68])
                 for i in std.range(0, 4)
               ]
               + [sbox('suneate-%s-tie-%d' % [sideName(s), i], 'lace', [s * L.legX - 0.075, 0.012, z], [s * L.legX + 0.075, 0.015, z + 0.012]) for i in [0, 1] for z in [[0.47, 0.64][i]]]
               for s in sides
             ]),
             { lame: 'lacquer-black', lace: 'cloth-crimson', gilt: 'brass-polished', sleeve: 'cloth-navy', iron: 'iron-dull' })
  + { voxelGrain: 0.006 },

  // A scrap-metal suit laid out flat, 1.3 m from collar to toe: cotton wraps cut to a torso, sleeves and leggings,
  // with mismatched pieces of sheet steel, some rusted and some galvanised, set askew over them and tied on with
  // string.
  h.compound('armor_scrapsuit', 9.7,
             underSuit('cloth', 0.006, 0.44, 0.14, 0.18)
             + [
               flat('scrap-%d' % i, ['steel', 'rust', 'zinc'][i % 3], skew(p[0], p[1], p[2], p[3], p[4]), 0.006 + 0.003 * (i % 2), 0.004)
               for i in std.range(0, 15)
               for p in [[
                 [-0.09, L.neck + 0.14, 0.15, 0.16, 8],
                 [0.09, L.neck + 0.16, 0.14, 0.18, -6],
                 [-0.07, L.neck + 0.36, 0.17, 0.14, -4],
                 [0.1, L.neck + 0.38, 0.12, 0.15, 10],
                 [-L.armX, -0.44, 0.12, 0.16, 5],
                 [L.armX, -0.46, 0.12, 0.15, -9],
                 [-L.armX, -0.16, 0.11, 0.14, -7],
                 [L.armX, -0.14, 0.12, 0.13, 6],
                 [-L.legX, 0.22, 0.16, 0.18, -5],
                 [L.legX, 0.2, 0.15, 0.17, 7],
                 [-L.legX, 0.42, 0.12, 0.1, 12],
                 [L.legX, 0.43, 0.13, 0.09, -10],
                 [-L.legX, 0.6, 0.14, 0.17, 4],
                 [L.legX, 0.62, 0.13, 0.16, -6],
                 [0, L.neck + 0.52, 0.3, 0.07, 2],
                 [0, L.neck + 0.03, 0.14, 0.05, -3],
               ][i]]
             ]
             + [
               box('tie-%d' % i, 'string', [p[0] - p[1] / 2 - 0.01, 0.006, p[2] - 0.002], [p[0] + p[1] / 2 + 0.01, 0.015, p[2] + 0.002])
               for i in std.range(0, 13)
               for p in [[
                 [-0.09, 0.17, L.neck + 0.14],
                 [0.09, 0.16, L.neck + 0.16],
                 [-0.07, 0.19, L.neck + 0.36],
                 [0.1, 0.14, L.neck + 0.38],
                 [-L.armX, 0.15, -0.44],
                 [L.armX, 0.15, -0.46],
                 [-L.armX, 0.14, -0.16],
                 [L.armX, 0.15, -0.14],
                 [-L.legX, 0.19, 0.22],
                 [L.legX, 0.19, 0.2],
                 [-L.legX, 0.15, 0.42],
                 [L.legX, 0.16, 0.43],
                 [-L.legX, 0.17, 0.6],
                 [L.legX, 0.16, 0.62],
               ][i]]
             ],
             { cloth: 'canvas-grey', steel: 'steel-bright', rust: 'rust-red', zinc: 'steel-galvanised', string: 'cord-cotton' })
  + { voxelGrain: 0.006 },

  // A tyre-rubber suit laid out flat, 1.3 m from collar to toe: curved chunks cut from tyres, chevron tread up, over
  // the chest, back, arms and legs, strung together with string at their corners.
  h.compound('armor_tiresuit', 10,
             std.flattenArrays([
               local x = p[0], z0 = p[1], z1 = p[2], w = p[3], r = p[4];
               local outline = [[-w / 2, z0], [w / 2, z0], [w / 2, z1], [-w / 2, z1]];
               h.curvedPlate('chunk-%d' % i, 'rubber', outline, 0, 0.014, r, 6, x, 0)
               + [
                 // Tread blocks in a chevron, split down the middle of the strip, as cut from a tyre's crown.
                 h.onCurvedFace('chunk-%d-lug-%d-%d' % [i, j, k], 'lug', outline, 0, 0.014, r, [k * (w / 2 - 0.012), z0 + 0.02 + j * 0.035], [k * 0.008, z0 + 0.034 + j * 0.035], 0.014, x, 0)
                 for j in std.range(0, std.floor((z1 - z0 - 0.04) / 0.035))
                 for k in [-1, 1]
               ]
               for i in std.range(0, 9)
               for p in [[
                 [0, L.neck, L.neck + 0.28, 0.36, 0.3],
                 [0, L.neck + 0.3, L.hem + 0.02, 0.34, 0.3],
                 [-L.armX, L.arm0, -0.3, 0.14, 0.1],
                 [L.armX, L.arm0, -0.3, 0.14, 0.1],
                 [-L.armX, -0.27, L.arm1, 0.12, 0.09],
                 [L.armX, -0.27, L.arm1, 0.12, 0.09],
                 [-L.legX, L.leg0 - 0.04, 0.4, 0.17, 0.12],
                 [L.legX, L.leg0 - 0.04, 0.4, 0.17, 0.12],
                 [-L.legX, 0.43, L.leg1, 0.14, 0.1],
                 [L.legX, 0.43, L.leg1, 0.14, 0.1],
               ][i]]
             ])
             + [
               strip('string-%d' % i, 'string', [p[0], p[1]], [p[2], p[3]], 0.004, 0.006, 0.006)
               for i in std.range(0, 9)
               for p in [[
                 [-0.17, L.neck + 0.04, -L.armX + 0.06, L.arm0 + 0.03],
                 [0.17, L.neck + 0.04, L.armX - 0.06, L.arm0 + 0.03],
                 [-0.1, L.neck + 0.27, -0.1, L.neck + 0.31],
                 [0.1, L.neck + 0.27, 0.1, L.neck + 0.31],
                 [-L.armX, -0.31, -L.armX, -0.26],
                 [L.armX, -0.31, L.armX, -0.26],
                 [-0.1, L.hem + 0.01, -L.legX, L.leg0 - 0.03],
                 [0.1, L.hem + 0.01, L.legX, L.leg0 - 0.03],
                 [-L.legX, 0.39, -L.legX, 0.44],
                 [L.legX, 0.39, L.legX, 0.44],
               ][i]]
             ],
             { rubber: 'rubber-black', lug: 'rubber-tread', string: 'cord-cotton' })
  + { voxelGrain: 0.006 },

  // A beekeeper's coverall folded square, 360 mm by 300 mm and 80 mm thick: white cotton, a zipped front, a
  // stand collar, a flapped chest pocket, the sleeves folded in along the sides, and the elastic ankle straps with
  // their hook-and-loop tabs laid over the top.
  h.compound('beekeeping_suit', 0.91,
             g.jacket({ w: 0.36, d: 0.3, ht: 0.08, folds: 3, front: 'placket', frontW: 0.022, buttons: 0, pockets: [{ x: 0.09, z: -0.07, w: 0.08, d: 0.09, flap: 0.03, single: true }], sleeves: { kind: 'flat', w: 0.07, t: 0.006 } })
             + [
               box('zip', 'zip', [-0.004, 0.085, -0.15], [0.004, 0.088, 0.0]),
               box('zip-pull', 'zip', [-0.007, 0.085, -0.01], [0.007, 0.09, 0.01]),
             ]
             + std.flattenArrays([
               [
                 box('ankle-strap-%d' % i, 'strap', [-0.14 + i * 0.05, 0.08, -0.13], [-0.12 + i * 0.05, 0.085, -0.04]),
                 box('ankle-tab-%d' % i, 'tab', [-0.143 + i * 0.05, 0.085, -0.065], [-0.117 + i * 0.05, 0.088, -0.04]),
               ]
               for i in [0, 1]
             ]),
             { cloth: 'cloth-bright-white', collar: 'cloth-bright-white', front: 'cloth-cream', button: 'cloth-cream', pocket: 'cloth-cream', flap: 'cloth-cream', sleeve: 'cloth-bright-white', zip: 'plastic-charcoal', strap: 'cloth-cream', tab: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },

  // A dog-handler's bite suit folded into a thick bundle, 460 mm by 380 mm and 160 mm tall: denim outer quilted in
  // raised channels over the padding strips, a stand collar, a zipped front, the padded sleeves rolled along both
  // sides with stitched rings and aramid-bound cuffs.
  h.compound('bite_suit', 6,
             g.jacket({ w: 0.46, d: 0.38, ht: 0.16, folds: 4, front: 'placket', frontW: 0.04, frontT: 0.008, buttons: 0, collar: { r: 0.08, wd: 0.04, ht: 0.035, gap: 30 }, sleeves: { kind: 'roll', r: 0.055 } })
             + g.quilt({ style: 'channels', x0: -0.12, x1: 0.12, z0: -0.17, z1: 0.04, y: 0.16, pitch: 0.045, r: 0.014 }),
             { cloth: 'cloth-denim', collar: 'aramid-gold', front: 'cloth-denim-faded', button: 'cloth-denim-faded', sleeve: 'cloth-denim', stitch: 'cloth-denim-faded', cuff: 'aramid-gold', quilt: 'cloth-denim-faded' })
  + { voxelGrain: 0.006 },

  // A case-hardened mail hauberk folded to 380 mm by 420 mm and 60 mm tall: a long mail shirt of dark rings with
  // sleeves along its sides, a leather-bound neck and a split skirt.
  h.compound('ch_chainmail_hauberk', 12, mailBundle({ d: 0.42, slit: true }), { mail: 'steel-mail-dark', binding: 'leather-black', hole: 'cloth-black', buckle: 'brass-dull' })
  + { voxelGrain: 0.004 },

  // A case-hardened mail jumpsuit folded to 380 mm by 440 mm and 60 mm tall: sleeves along the sides and the legs
  // folded up over the body under a leather belt, with a leather-bound neck.
  h.compound('ch_chainmail_jumpsuit', 14, mailBundle({ d: 0.44, legs: true }), { mail: 'steel-mail-dark', binding: 'leather-black', hole: 'cloth-black', buckle: 'brass-dull' })
  + { voxelGrain: 0.004 },
]
