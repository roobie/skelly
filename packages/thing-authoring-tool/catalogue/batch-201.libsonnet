local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;
local pi = std.pi;

// Garments of a silvery, faintly iridescent wool, folded on a shelf with their collar or waistband at +z, and a
// steel arm harness laid out flat. The wool's odd sheen is the `cloth-shimmer` finish, its quilting picked out in
// violet so it reads as a cloth that changes colour with the light.

local spread(a, b, n) = [a + (b - a) * i / (n - 1) for i in std.range(0, n - 1)];

// A curved plate lying open side down along x from x0 to x1, its axis on the floor at z: an arc of radius r, t thick,
// spanning `span` radians either side of straight up, in n flat facets.
local shell(id, slot, x0, x1, r, t, z, n=8, span=pi / 2) = [
  local a = -span + 2 * span * i / n, b = -span + 2 * span * (i + 1) / n;
  h.prism('%s-%d' % [id, i], slot, 'x', [
    [r * std.cos(a), z + r * std.sin(a)],
    [(r + t) * std.cos(a), z + (r + t) * std.sin(a)],
    [(r + t) * std.cos(b), z + (r + t) * std.sin(b)],
    [r * std.cos(b), z + r * std.sin(b)],
  ], x0, x1)
  for i in std.range(0, n - 1)
];
// A plate tapering from radius r0 at x0 to r1 at x1, in `steps` sections.
local taper(id, slot, x0, x1, r0, r1, t, z, steps=3) = std.flattenArrays([
  shell('%s-%d' % [id, s], slot, x0 + (x1 - x0) * s / steps, x0 + (x1 - x0) * (s + 1) / steps, r0 + (r1 - r0) * (s + 0.5) / steps, t, z)
  for s in std.range(0, steps - 1)
]);
// A leather strap over a plate at x, `w` wide, its tails on the floor each side and a buckle on the +z tail.
local strap(id, x, w, r, z, tail) =
  shell(id + '-over', 'strap', x - w / 2, x + w / 2, r, 0.003, z) + [
    box(id + '-tail-a', 'strap', [x - w / 2, 0, z - r - tail], [x + w / 2, 0.003, z - r]),
    box(id + '-tail-b', 'strap', [x - w / 2, 0, z + r], [x + w / 2, 0.003, z + r + tail]),
    box(id + '-buckle', 'buckle', [x - w / 2 - 0.003, 0, z + r + tail * 0.4], [x + w / 2 + 0.003, 0.006, z + r + tail * 0.4 + 0.012]),
  ];
// A rounded elbow cop standing on the floor at (x, z), r across.
local cop(id, x, z, r) =
  h.turned(id, 'plate', 'y', [[0, 0], [0, r], [r * 0.4, r * 0.92], [r * 0.75, r * 0.65], [r * 0.95, r * 0.3], [r, 0]], [x, 0, z]);

local wool = {
  cloth: 'cloth-shimmer',
  collar: 'cloth-shimmer',
  front: 'cloth-shimmer',
  sleeve: 'cloth-shimmer',
  quilt: 'cloth-purple',
  stitch: 'cloth-purple',
  cuff: 'cloth-purple',
  tie: 'cloth-purple',
  button: 'metal-silver',
  lace: 'cloth-purple',
  glove: 'cloth-shimmer',
};

// A quilted coat folded flat on g.jacket: channels down the body between the sleeves, a placket closed with ties,
// sleeves quilted in rings (`sleeveR` 0 for none, with bound armholes instead) and, for a long coat, its skirt
// folded back up over the hem end as a second quilted layer.
local coat(id, mass, w, d, ht, sleeveR, skirt) =
  local cz = d / 2 - 0.08, bodyX = w / 2 - (if sleeveR > 0 then 2 * sleeveR + 0.012 else 0.03);
  h.compound(id, mass, g.jacket({
                         w: w,
                         d: d,
                         ht: ht,
                         collar: { r: 0.055, wd: 0.016, ht: 0.018, gap: 30 },
                         buttons: [],
                         sleeves: if sleeveR > 0 then { kind: 'roll', r: sleeveR } else null,
                       })
                       + g.quilt({ style: 'lines', x0: -bodyX, x1: bodyX, z0: -d / 2 + skirt, z1: cz - 0.07, y: ht, pitch: 0.036, w: 0.009 })
                       + std.flattenArrays([
                         [
                           box('tie-%d' % i, 'tie', [-0.03, ht + 0.005, z - 0.003], [0.03, ht + 0.009, z + 0.003]),
                           box('tie-knot-%d' % i, 'tie', [-0.007, ht + 0.005, z - 0.007], [0.007, ht + 0.012, z + 0.007]),
                         ]
                         for i in std.range(0, 3)
                         for z in [spread(cz - 0.08, -d / 2 + skirt + 0.03, 4)[i]]
                       ])
                       + (if sleeveR > 0 then [] else
                            h.crescent('armhole-l', 'cuff', 0.045, 0.056, 0, 180, 8, ht, ht + 0.004, -w / 2, cz - 0.03)
                            + h.crescent('armhole-r', 'cuff', 0.045, 0.056, 180, 360, 8, ht, ht + 0.004, w / 2, cz - 0.03))
                       + (if skirt > 0 then [
                            box('skirt', 'cloth', [-w / 2 + 0.004, ht, -d / 2 - 0.004], [w / 2 - 0.004, ht + 0.012, -d / 2 + skirt]),
                            box('skirt-hem', 'cuff', [-w / 2 + 0.004, ht + 0.012, -d / 2 + skirt - 0.016], [w / 2 - 0.004, ht + 0.015, -d / 2 + skirt]),
                          ] + g.quilt({ style: 'lines', x0: -w / 2 + 0.02, x1: w / 2 - 0.02, z0: -d / 2, z1: -d / 2 + skirt - 0.02, y: ht + 0.012, pitch: 0.036, w: 0.009, prefix: 'skirt-quilt' })
                          else []),
             wool)
  + { voxelGrain: 0.004 };


[
  // A steel arm harness for one arm laid out flat, 560 mm from wrist to shoulder: a forearm plate 110 mm across at the
  // elbow, a rounded elbow cop with a side wing and an upper-arm plate, each held by buckled leather straps, and a row
  // of runes etched dark along the forearm plate.
  h.compound('steel_bracer', 1.5,
             taper('vambrace', 'plate', -0.27, -0.07, 0.04, 0.05, 0.002, 0)
             + [cop('cop', 0, 0, 0.055)]
             + shell('wing', 'plate', -0.03, 0.03, 0.055, 0.002, 0)
             + taper('rerebrace', 'plate', 0.07, 0.29, 0.055, 0.06, 0.002, 0)
             + strap('strap-a', -0.23, 0.018, 0.043, 0, 0.035)
             + strap('strap-b', -0.11, 0.018, 0.05, 0, 0.035)
             + strap('strap-c', 0.12, 0.018, 0.058, 0, 0.035)
             + strap('strap-d', 0.25, 0.018, 0.062, 0, 0.035)
             + [
               box('rune-%d' % i, 'rune', [x - 0.006, 0.044, -0.004 + (i % 2) * 0.002], [x + 0.006, 0.048, 0.004 + (i % 2) * 0.002])
               for i in std.range(0, 4)
               for x in [-0.205 + i * 0.022]
             ] + [
               box('rune-bar-%d' % i, 'rune', [x - 0.0015, 0.044, -0.01], [x + 0.0015, 0.048, 0.01])
               for i in std.range(0, 4)
               for x in [-0.194 + i * 0.022]
             ],
             { plate: 'steel-grey', strap: 'leather-brown', buckle: 'steel-bright', rune: 'steel-blued' })
  + { voxelGrain: 0.004 },

  // A pair of quilted wool arming mittens laid flat, backs up, each 270 mm from cuff to fingertip: thick mitts with a
  // long flared cuff bound at its mouth and quilted in lines along the back.
  h.compound('gambeson_gloves_parabolan', 0.4,
             g.glovePair({ mitten: true, t: 0.026, cuff: 0.1, flare: 0.064, binding: 'trim', fingerSlot: 'glove', thumbSlot: 'glove' }, 0.08,
                         function(p, cx, s) [
                           box(p + 'quilt-%d' % i, 'quilt', [cx - 0.0025 + v, 0.026, -0.005], [cx + 0.0025 + v, 0.03, 0.15])
                           for i in std.range(0, 3)
                           for v in [[-0.03, -0.01, 0.01, 0.03][i]]
                         ] + [
                           box(p + 'cuff-quilt-%d' % i, 'quilt', [cx - 0.0025 + v, 0.0234, -0.105], [cx + 0.0025 + v, 0.0274, -0.025])
                           for i in std.range(0, 2)
                           for v in [[-0.035, 0, 0.035][i]]
                         ]),
             wool + { cuff: 'cloth-shimmer', trim: 'cloth-purple' })
  + { voxelGrain: 0.004 },

  // Quilted wool arming pants folded in a long bundle, 260 mm by 420 mm and 40 mm tall: the waistband at the far end
  // with a fly below it and four lacing points lying over it and hanging down its edge, channels down each leg, and
  // the legs parted by a dark split from the crotch to their two bound cuffs at the near edge.
  local w = 0.26, d = 0.42, ht = 0.04, crotch = -0.02;
  h.compound('gambeson_pants_parabolan', 1.2, h.foldedGarment(w, d, ht, 3)
                                                + g.quilt({ style: 'lines', x0: -w / 2 + 0.02, x1: w / 2 - 0.02, z0: -d / 2 + 0.06, z1: d / 2 - 0.04, y: ht, pitch: 0.036, w: 0.009 })
                                                + [
                                                  box('waistband', 'cuff', [-w / 2, ht, -d / 2 - 0.003], [w / 2, ht + 0.007, -d / 2 + 0.05]),
                                                  box('fly', 'cuff', [-0.012, ht, -d / 2 + 0.05], [0.012, ht + 0.007, crotch]),
                                                  box('split', 'split', [-0.007, ht, crotch], [0.007, ht + 0.009, d / 2 + 0.001]),
                                                  box('split-face', 'split', [-0.007, 0, d / 2], [0.007, ht + 0.009, d / 2 + 0.002]),
                                                ]
                                                + [
                                                  box('cuff-%d' % k, 'cuff', [if k < 0 then -w / 2 - 0.002 else 0.007, -0.0, d / 2 - 0.035], [if k < 0 then -0.007 else w / 2 + 0.002, ht + 0.007, d / 2 + 0.003])
                                                  for k in [-1, 1]
                                                ]
                                                + std.flattenArrays([
                                                  [
                                                    box('point-%d' % i, 'tie', [x - 0.004, ht + 0.007, -d / 2 - 0.006], [x + 0.004, ht + 0.011, -d / 2 + 0.06 + 0.012 * (i % 2)]),
                                                    box('point-end-%d' % i, 'tie', [x - 0.004, ht - 0.026, -d / 2 - 0.007], [x + 0.004, ht + 0.011, -d / 2 - 0.003]),
                                                  ]
                                                  for i in std.range(0, 3)
                                                  for x in [spread(-0.1, 0.1, 4)[i]]
                                                ]), wool { split: 'velvet-black' })
  + { voxelGrain: 0.004 },

  // A quilted wool greatcoat folded flat, 400 mm by 380 mm and 60 mm tall: a stand collar, a front closed with
  // tied laces, sleeves quilted in rings along both sides, and its long skirt folded back up over the hem end.
  coat('gambeson_parabolan', 2.5, 0.4, 0.38, 0.06, 0.022, 0.1),

  // The same greatcoat with thin sleeves, folded the same way.
  coat('gambeson_parabolan_thinsleeved', 2.2, 0.38, 0.38, 0.058, 0.014, 0.1),

  // The same long quilted coat without sleeves, its armholes bound in violet.
  coat('gambeson_parabolan_vest', 1.9, 0.36, 0.38, 0.055, 0, 0.1),

  // A loose wool blouse folded flat, 300 mm by 300 mm and 30 mm tall: a ruffled collar, a deep slit neck laced
  // across with a cord, wide sleeves folded along the sides and ruffled cuffs at the hem end.
  local w = 0.3, d = 0.3, ht = 0.03, cz = d / 2 - 0.08;
  h.compound('parabolan_blouse', 0.71, g.jacket({ w: w, d: d, ht: ht, folds: 2, collar: { r: 0.05, wd: 0.016, ht: 0.012, gap: 25 }, front: 'none', buttons: [], sleeves: { kind: 'flat', w: 0.085, t: 0.008 } })
                                       + [
                                         box('slit', 'opening', [-0.006, ht, cz - 0.15], [0.006, ht + 0.001, cz - 0.045]),
                                       ]
                                       + [
                                         g.strip('lace-%d' % i, 'lace', [-0.016, z], [0.016, z - 0.018], ht + 0.001, 0.003, 0.003)
                                         for i in std.range(0, 3)
                                         for z in [cz - 0.05 - i * 0.025]
                                       ]
                                       + [
                                         g.strip('lace-back-%d' % i, 'lace', [0.016, z], [-0.016, z - 0.018], ht + 0.001, 0.003, 0.003)
                                         for i in std.range(0, 3)
                                         for z in [cz - 0.05 - i * 0.025]
                                       ]
                                       + [
                                         g.strip('lace-end-%d' % i, 'lace', [s * 0.004, cz - 0.15], [s * 0.02, cz - 0.2], ht, 0.004, 0.003)
                                         for i in [0, 1]
                                         for s in [[-1, 1][i]]
                                       ]
                                       + std.flattenArrays([
                                         [
                                           box('ruffle-%d-%d' % [s + 1, k], 'cuff', [x0, ht + 0.008, -d / 2 + 0.03 + k * 0.012], [x0 + 0.085, ht + 0.014, -d / 2 + 0.036 + k * 0.012])
                                           for k in [0, 1, 2]
                                         ]
                                         for s in [-1, 1]
                                         for x0 in [if s < 0 then -w / 2 else w / 2 - 0.085]
                                       ]),
             wool + { opening: 'cloth-charcoal', cuff: 'cloth-shimmer', collar: 'cloth-shimmer' })
  + { voxelGrain: 0.004 },

  // Wool knee breeches folded flat, 240 mm by 340 mm and 30 mm tall: a deep waistband, a buttoned fall flap at the
  // front, the legs gathered into buttoned knee bands at the hem end, and no pockets.
  local w = 0.24, d = 0.34, ht = 0.03;
  h.compound('parabolan_breeches', 0.45, h.foldedGarment(w, d, ht, 3)
                                          + [
                                            box('waistband', 'cuff', [-w / 2, ht, d / 2 - 0.045], [w / 2, ht + 0.005, d / 2 + 0.002]),
                                            box('fall', 'cloth', [-0.06, ht, d / 2 - 0.14], [0.06, ht + 0.004, d / 2 - 0.045]),
                                            box('inseam', 'stitch', [-0.003, ht, -d / 2 + 0.04], [0.003, ht + 0.003, d / 2 - 0.14]),
                                            box('knee-band', 'cuff', [-w / 2, ht, -d / 2], [w / 2, ht + 0.005, -d / 2 + 0.035]),
                                          ]
                                          + g.buttons('fall-button', 'button', -0.045, [d / 2 - 0.07, d / 2 - 0.11], ht + 0.004, 0.006)
                                          + g.buttons('fall-button-r', 'button', 0.045, [d / 2 - 0.07, d / 2 - 0.11], ht + 0.004, 0.006)
                                          + g.buttons('waist-button', 'button', 0, [d / 2 - 0.022], ht + 0.005, 0.007)
                                          + [
                                            h.disc('knee-button-%d' % i, 'button', 0.005, ht + 0.005, ht + 0.009, x, -d / 2 + 0.018)
                                            for i in [0, 1, 2, 3]
                                            for x in [[-0.1, -0.08, 0.08, 0.1][i]]
                                          ], wool)
  + { voxelGrain: 0.004 },
]
