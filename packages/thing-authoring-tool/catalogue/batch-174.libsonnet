local f = import '../footwear.libsonnet';
local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;

// Suits as found on a shelf or the floor: mail and cloth suits folded flat, neck at +z, outside up.

// Rows of rings standing proud of a flat face at y, across x from x0 to x1, every `pitch` along z from z0 to z1.
local mailRows(prefix, x0, x1, z0, z1, y, pitch=0.014) = [
  box('%s-%d' % [prefix, i], 'mail', [x0, y, z0 + i * pitch], [x1, y + 0.004, z0 + i * pitch + 0.006])
  for i in std.range(0, std.floor((z1 - z0 - 0.006) / pitch))
];

// One leg of a one-piece suit folded up over the body, a panel `t` thick from the hem at z0 to the crotch at z1,
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

// Pieces moved by [dx, dy, dz]: boxes, turned solids and prisms standing on y or z.
local move(pieces, d) = [
  if p.kind == 'box' then p + { min: [p.min[k] + d[k] for k in [0, 1, 2]], max: [p.max[k] + d[k] for k in [0, 1, 2]] }
  else if p.kind == 'turned' then p + { origin: [std.get(p, 'origin', [0, 0, 0])[k] + d[k] for k in [0, 1, 2]] }
  else if p.axis == 'y' then p + { profile: [[q[0] + d[2], q[1] + d[0]] for q in p.profile], start: p.start + d[1], end: p.end + d[1] }
  else if p.axis == 'z' then p + { profile: [[q[0] + d[0], q[1] + d[1]] for q in p.profile], start: p.start + d[2], end: p.end + d[2] }
  else error 'move: prism on x'
  for p in pieces
];

// The legs of a one-piece cloth suit folded up over its lower half: two panels from the hem at z0 to the waist at
// z1, lying on y, with a pocket on each thigh. Slots: leg, pocket, flap.
local clothLegs(z0, z1, y, t, pocket=true) = std.flattenArrays([
  [legPanel('leg-%d' % (s + 1), 'leg', s * 0.085, z0, z1, 0.13, 0.16, y, t)]
  + (if pocket then [
       box('thigh-pocket-%d' % (s + 1), 'pocket', [s * 0.085 - 0.045, y + t, z1 - 0.13], [s * 0.085 + 0.045, y + t + 0.004, z1 - 0.03]),
       box('thigh-flap-%d' % (s + 1), 'flap', [s * 0.085 - 0.048, y + t + 0.004, z1 - 0.055], [s * 0.085 + 0.048, y + t + 0.008, z1 - 0.027]),
     ] else [])
  for s in [-1, 1]
]);

// A folded suit jacket on its folded trousers: the trousers stick out at the right and the hem end, a crease (or
// stripe) down the exposed leg; the jacket has lapels meeting in a V over a shirt front and tie, buttons, flapped
// hip pockets and a breast pocket. Slots: trousers, stripe, cloth, collar, front, button, pocket, flap, sleeve,
// shirt, tie, plus `extra` pieces.
local suitStack(o) =
  local c = { epaulettes: false, square: false } + o;
  local tw = 0.32, td = 0.42, tht = 0.04, w = 0.38, d = 0.36, ht = 0.05, cz = d / 2 - 0.09, vz = -0.04;
  local jd = [-0.03, tht, 0.03];
  [p + { id: 'trousers-' + p.id, slot: 'trousers' } for p in move(h.foldedGarment(tw, td, tht, 2), [0.04, 0, -0.02])]
  + [box('stripe', 'stripe', [0.04 + tw / 2 - 0.03, tht, -0.02 - td / 2], [0.04 + tw / 2 - 0.018, tht + 0.003, 0.0])]
  + move(
    g.jacket({ w: w, d: d, ht: ht, front: 'shawl', frontW: 0.04, frontT: 0.005, vz: vz, collar: { r: 0.06, wd: 0.022, ht: 0.012, gap: 50 }, buttons: [vz - 0.035, vz - 0.09], buttonR: 0.008, epaulettes: c.epaulettes, sleeves: { kind: 'flat', w: 0.085, t: 0.006 }, pockets: [{ x: 0.1, z: -0.12, w: 0.1, d: 0.05, flap: 0.025 }, { x: -0.1, z: 0.05, w: 0.08, d: 0.012, flap: 0, single: true }] })
    + [
      h.prism('shirt', 'shirt', 'y', [[cz - 0.02, -0.045], [cz - 0.02, 0.045], [vz + 0.01, 0]], ht, ht + 0.006),
      g.strip('tie', 'tie', [0, cz - 0.03], [0, vz + 0.015], ht + 0.006, 0.022, 0.004),
      box('tie-knot', 'tie', [-0.014, ht + 0.006, cz - 0.04], [0.014, ht + 0.012, cz - 0.016]),
    ]
    + (if c.square then [box('square', 'square', [-0.13, ht + 0.004, 0.055], [-0.09, ht + 0.009, 0.072])] else [])
    + c.extra,
    jd
  );

// A one-piece work suit folded flat, neck at +z, the legs folded up over its lower half: a zipped front, a collar,
// sleeves along the sides and flapped chest pockets. Slots: cloth, collar, front, pocket, flap, sleeve, leg, zip.
local coverall(o) =
  local c = { w: 0.36, d: 0.42, ht: 0.05, legT: 0.008, sleeveW: 0.08, collar: { r: 0.055, wd: 0.022, ht: 0.016, gap: 30 }, pockets: [{ x: 0.08, z: 0.06, w: 0.085, d: 0.075, flap: 0.025 }], legPockets: true } + o;
  local legTop = -0.02;
  g.jacket({ w: c.w, d: c.d, ht: c.ht, collar: c.collar, front: 'placket', frontW: 0.012, frontT: 0.003, buttons: [], sleeves: { kind: 'flat', w: c.sleeveW, t: 0.006 }, pockets: c.pockets })
  + clothLegs(-c.d / 2 + 0.01, legTop, c.ht, c.legT, c.legPockets)
  + [box('zip-pull', 'zip', [-0.006, c.ht + 0.003, c.d / 2 - 0.13], [0.006, c.ht + 0.007, c.d / 2 - 0.105])];

// A pair of attached boots standing on the bundle, toes to +z, moved by `d`. Slots: sole, upper, shaft, collar,
// lining.
local envBoot = { l: 0.28, w: 0.105, t: 0.022, layers: 5, ankle: 0.085, top: 0.19, rx: 0.046, rz: 0.058, collar: 0.012, collarOut: 0.004, toeSlot: 'upper' };

local mailFinish(m) = { mail: m, binding: 'leather-brown', hole: 'cloth-black', buckle: 'brass-dull' };

[
  // A full suit of mild steel mail folded to 380 mm by 460 mm and 60 mm tall, about 160 mm with its coif: a long
  // mail shirt with sleeves, the legs folded up over the body under a leather belt, and the attached coif standing
  // at the neck with its face opening forward.
  h.compound('lc_chainmail_suit', 16, mailBundle({ d: 0.46, legs: true, coif: true }), mailFinish('steel-mail'))
  + { voxelGrain: 0.004 },

  // A medium steel mail hauberk folded to 380 mm by 420 mm and 60 mm tall: a long mail shirt with sleeves along
  // its sides, a leather-bound neck and a split skirt.
  h.compound('mc_chainmail_hauberk', 12, mailBundle({ d: 0.42, slit: true }), mailFinish('steel-mail-dark'))
  + { voxelGrain: 0.004 },

  // A medium steel mail jumpsuit folded to 380 mm by 440 mm and 60 mm tall: sleeves along the sides and the legs
  // folded up over the body under a leather belt, with a leather-bound neck.
  h.compound('mc_chainmail_jumpsuit', 14, mailBundle({ d: 0.44, legs: true }), mailFinish('steel-mail-dark'))
  + { voxelGrain: 0.004 },

  // A sleeveless medium steel mail jumpsuit folded to 380 mm by 420 mm and 60 mm tall: leather-bound armholes at
  // the shoulders and the legs folded up over the body under a leather belt.
  h.compound('mc_chainmail_sjumpsuit', 13, mailBundle({ d: 0.42, sleeves: false, armholes: true, legs: true }), mailFinish('steel-mail-dark'))
  + { voxelGrain: 0.004 },
  // A sage-green flight suit folded to 360 mm by 420 mm and 50 mm tall, legs folded up: a zipped front, a flat
  // collar, flapped chest pockets with a name tape over one, a flag patch and a
  // pen pocket on the left sleeve, a round unit patch on the right, and flapped thigh pockets.
  h.compound('mil_flight_suit', 0.94, coverall({})
    + [
      box('name-tape', 'tape', [-0.125, 0.054, 0.115], [-0.035, 0.057, 0.132]),
      h.disc('unit-patch', 'patch', 0.024, 0.056, 0.062, 0.14, 0.08),
      box('flag', 'flag', [-0.175, 0.056, 0.09], [-0.115, 0.06, 0.13]),
      box('flag-canton', 'flagb', [-0.175, 0.06, 0.112], [-0.15, 0.062, 0.13]),
      box('pen-pocket', 'pocket', [-0.17, 0.056, -0.02], [-0.125, 0.06, 0.06]),
      box('pen-pocket-slots', 'tape', [-0.17, 0.06, 0.05], [-0.125, 0.062, 0.056]),
    ], {
    cloth: 'cloth-ucp',
    collar: 'cloth-ucp',
    front: 'plastic-charcoal',
    pocket: 'cloth-ucp',
    flap: 'nylon-ranger-green',
    sleeve: 'cloth-ucp',
    leg: 'cloth-ucp',
    zip: 'steel-bright',
    tape: 'nylon-black',
    patch: 'cloth-yellow',
    flag: 'cloth-crimson',
    flagb: 'cloth-navy',
  }) + { voxelGrain: 0.004 },

  // A thin flame-resistant knit body suit folded to 300 mm by 320 mm and 30 mm tall, legs folded up: a mock neck, a
  // light front zip, sleeves along the sides and ribbed cuffs at the wrists and ankles.
  h.compound('nomex_suit', 0.41, coverall({ w: 0.3, d: 0.32, ht: 0.03, legT: 0.006, sleeveW: 0.065, collar: { r: 0.042, wd: 0.014, ht: 0.018, gap: 14 }, pockets: [], legPockets: false })
    + [
      box('cuff-%d' % (s + 1), 'rib', [s * 0.15 - (if s < 0 then 0 else 0.065), 0.03, -0.13], [s * 0.15 + (if s < 0 then 0.065 else 0), 0.039, -0.1])
      for s in [-1, 1]
    ] + [
      box('ankle-%d' % (s + 1), 'rib', [s * 0.085 - 0.066, 0.03, -0.155], [s * 0.085 + 0.066, 0.039, -0.125])
      for s in [-1, 1]
    ], {
    cloth: 'knit-fr',
    collar: 'knit-fr',
    front: 'plastic-charcoal',
    sleeve: 'knit-fr',
    leg: 'knit-fr',
    zip: 'steel-bright',
    rib: 'webbing-olive-dark',
  }) + { voxelGrain: 0.004 },

  // A dress uniform folded on a shelf: a navy jacket 380 mm by 360 mm on folded trousers 320 mm by 420 mm, 90 mm
  // tall in all. Gold buttons, shoulder boards with rank bars, rows of ribbons and two medals over the left breast,
  // a white shirt front and black tie in the lapels' V, and a gold stripe down the trouser leg.
  h.compound('officer_uniform', 1.3, suitStack({
    epaulettes: true,
    extra: [
      box('ribbon-%d-%d' % [r, k], 'ribbon%d' % ((r + k) % 3), [-0.15 + k * 0.024, 0.056, 0.072 + r * 0.012], [-0.127 + k * 0.024, 0.06, 0.083 + r * 0.012])
      for r in [0, 1, 2]
      for k in [0, 1, 2]
    ] + std.flattenArrays([
      [
        box('medal-ribbon-%d' % k, 'ribbon%d' % k, [-0.15 + k * 0.035, 0.056, 0.0], [-0.135 + k * 0.035, 0.06, 0.04]),
        h.disc('medal-%d' % k, 'button', 0.011, 0.06, 0.064, -0.1425 + k * 0.035, -0.006),
      ]
      for k in [0, 1]
    ]) + [
      box('rank-%d-%d' % [s + 1, k], 'button', [s * 0.13 - 0.004 + k * 0.012, 0.059, 0.115], [s * 0.13 + 0.002 + k * 0.012, 0.062, 0.135])
      for s in [-1, 1]
      for k in [0, 1]
    ],
  }), {
    trousers: 'cloth-navy',
    stripe: 'cloth-yellow',
    cloth: 'cloth-navy',
    collar: 'cloth-navy',
    front: 'cloth-navy',
    button: 'metal-gold',
    pocket: 'cloth-navy',
    flap: 'cloth-navy',
    sleeve: 'cloth-navy',
    shirt: 'cloth-cream',
    tie: 'cloth-black',
    ribbon0: 'cloth-crimson',
    ribbon1: 'cloth-blue',
    ribbon2: 'cloth-green',
  }) + { voxelGrain: 0.004 },

  // A sealed environmental suit folded to 460 mm by 440 mm and 80 mm tall, legs folded up, with its attached boots
  // standing on the bundle and its attached gloves lying on the sleeves: brown cloth with blue shoulders, a ring neck
  // seal, a storm-flapped zip, a white seal on each upper arm and a flapped chest pocket.
  h.compound('robofac_enviro_suit', 3.9, coverall({ w: 0.46, d: 0.44, ht: 0.08, legT: 0.01, sleeveW: 0.095, collar: { r: 0.06, wd: 0.026, ht: 0.03, gap: 0 }, pockets: [{ x: 0.1, z: 0.03, w: 0.09, d: 0.08, flap: 0.03, single: true }], legPockets: false })
    + [
      box('yoke', 'yoke', [-0.23, 0.08, 0.13], [0.23, 0.083, 0.22]),
      box('storm-flap', 'yoke', [-0.022, 0.08, -0.02], [0.022, 0.085, 0.07]),
    ] + std.flattenArrays([
      [
        h.disc('seal-%d' % (s + 1), 'seal', 0.03, 0.086, 0.09, s * 0.1825, 0.15),
        box('sleeve-yoke-%d' % (s + 1), 'yoke', [if s < 0 then -0.23 else 0.135, 0.086, 0.12], [if s < 0 then -0.135 else 0.23, 0.0875, 0.2]),
      ]
      for s in [-1, 1]
    ])
    + move(f.pair(envBoot, 0.03, function(p, cx) [f.band(p + 'band', 'collar', envBoot, cx, 0.17, 0.19)]), [0, 0.09, -0.07])
    + move(g.glove('gl-', -0.1825, 1, { t: 0.014 }) + g.glove('gr-', 0.1825, -1, { t: 0.014 }), [0, 0.086, -0.14]), {
    cloth: 'cloth-brown',
    collar: 'vinyl-black',
    front: 'plastic-charcoal',
    pocket: 'cloth-brown',
    flap: 'cloth-blue',
    sleeve: 'cloth-brown',
    leg: 'cloth-brown',
    zip: 'steel-bright',
    yoke: 'cloth-blue',
    seal: 'cloth-bright-white',
    sole: 'vinyl-black',
    upper: 'vinyl-black',
    shaft: 'vinyl-black',
    lining: 'cloth-charcoal',
    glove: 'vinyl-black',
    cuff: 'cloth-brown',
  }) + { voxelGrain: 0.004 },

  // The same sealed suit worn down: its top half rolled to the waist and the sleeves knotted round it, folded to
  // 420 mm by 380 mm and 70 mm tall with the roll across the back, the knotted sleeves and their gloves hanging over
  // the front edge, and the boots standing on the bundle.
  h.compound('robofac_enviro_suit_casual', 3.3, [p + { slot: 'leg' } for p in h.foldedGarment(0.42, 0.38, 0.07, 3)]
    + [
      h.turned('roll', 'yoke', 'x', [[0, 0], [0, 0.04], [0.42, 0.04], [0.42, 0]], [-0.21, 0.11, -0.15]),
      box('roll-seal-l', 'seal', [-0.2, 0.1, -0.11], [-0.15, 0.13, -0.106]),
      box('knot', 'sleeve', [-0.035, 0.035, 0.19], [0.035, 0.1, 0.215]),
      box('sleeve-l', 'sleeve', [-0.16, 0.0, 0.19], [-0.035, 0.07, 0.205]),
      box('sleeve-r', 'sleeve', [0.035, 0.0, 0.19], [0.16, 0.07, 0.205]),
      box('waist-l', 'sleeve', [-0.21, 0.07, 0.15], [-0.035, 0.078, 0.2]),
      box('waist-r', 'sleeve', [0.035, 0.07, 0.15], [0.21, 0.078, 0.2]),
    ]
    + move(f.pair(envBoot, 0.03, function(p, cx) [f.band(p + 'band', 'collar', envBoot, cx, 0.17, 0.19)]), [0, 0.07, -0.0])
    + move(g.glove('gl-', -0.1, -1, { t: 0.014 }) + g.glove('gr-', 0.1, 1, { t: 0.014 }), [0, 0, 0.27]), {
    leg: 'cloth-brown',
    yoke: 'cloth-blue',
    seal: 'cloth-bright-white',
    sleeve: 'cloth-brown',
    sole: 'vinyl-black',
    upper: 'vinyl-black',
    shaft: 'vinyl-black',
    collar: 'vinyl-black',
    lining: 'cloth-charcoal',
    glove: 'vinyl-black',
    cuff: 'cloth-brown',
  }) + { voxelGrain: 0.004 },

  // A two-piece business suit folded on a shelf: a charcoal jacket 380 mm by 360 mm on folded trousers 320 mm by
  // 420 mm, 90 mm tall in all, the jacket's lapels meeting over a cream shirt front and a red tie, a pocket square in
  // the breast pocket, two buttons and flapped hip pockets.
  h.compound('suit', 1.2, suitStack({ square: true, extra: [] }), {
    trousers: 'cloth-charcoal',
    stripe: 'cloth-charcoal',
    cloth: 'cloth-charcoal',
    collar: 'cloth-charcoal',
    front: 'cloth-charcoal',
    button: 'plastic-matte-black',
    pocket: 'cloth-charcoal',
    flap: 'cloth-charcoal',
    sleeve: 'cloth-charcoal',
    shirt: 'cloth-cream',
    tie: 'cloth-crimson',
    square: 'cloth-cream',
  }) + { voxelGrain: 0.004 },
]
