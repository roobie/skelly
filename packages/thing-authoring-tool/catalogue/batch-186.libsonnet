local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local flat = g.flat;
local strip = g.strip;

// Aprons, dresses, a hoodie and knit undergarments as found on a shelf: folded on h.foldedGarment, `w` across x and
// `d` along z, top face at `ht`, the neck or waistband at the +z end and the hem folded under at -z. The arm warmers
// and the belly band lie flat.

// A band wrapped across the bundle at z, over the top and down both sides: hems, cuffs and belts.
local bandX(id, slot, z, bw, w, ht, t=0.004) = [
  box(id + '-top', slot, [-w / 2 - t, ht, z - bw / 2], [w / 2 + t, ht + t, z + bw / 2]),
  box(id + '-left', slot, [-w / 2 - t, 0, z - bw / 2], [-w / 2, ht + t, z + bw / 2]),
  box(id + '-right', slot, [w / 2, 0, z - bw / 2], [w / 2 + t, ht + t, z + bw / 2]),
];

// A waist apron folded into a block: the waistband along the +z edge with its ties looped back across the top, and a
// row of `pockets` patch pockets (each split by a seam in slot `seam`) along the lower edge, `pd` deep.
local waistApron(o) =
  local c = { w: 0.24, d: 0.28, ht: 0.02, folds: 2, pockets: 2, pd: 0.09, t: 0.003 } + o;
  local w = c.w, d = c.d, ht = c.ht, t = c.t;
  local pw = (w - 0.03) / c.pockets;
  h.foldedGarment(w, d, ht, c.folds)
  + bandX('band', 'band', d / 2 - 0.016, 0.03, w, ht)
  + [
    strip('tie-l', 'band', [-w / 2 + 0.01, d / 2 - 0.03], [0.05, -0.02], ht + 0.004, 0.018, 0.004),
    strip('tie-r', 'band', [w / 2 - 0.01, d / 2 - 0.03], [-0.03, -0.05], ht + 0.008, 0.018, 0.004),
    box('pockets', 'pocket', [-w / 2 + 0.015, ht, -d / 2 + 0.02], [w / 2 - 0.015, ht + t, -d / 2 + 0.02 + c.pd]),
    box('pocket-hem', 'seam', [-w / 2 + 0.015, ht + t, -d / 2 + 0.012 + c.pd], [w / 2 - 0.015, ht + t + 0.002, -d / 2 + 0.02 + c.pd]),
  ] + [
    box('pocket-seam-%d' % i, 'seam', [-w / 2 + 0.015 + i * pw - 0.002, ht + t, -d / 2 + 0.02], [-w / 2 + 0.015 + i * pw + 0.002, ht + t + 0.002, -d / 2 + 0.02 + c.pd])
    for i in std.range(1, c.pockets - 1)
  ];

// A witch's dress folded flat on g.jacket: a dark scooped neckline, the sleeves folded in along both sides ending in
// pointed cuffs, and a row of `points` triangles cut into the hem; cuffs and points lie flat on the floor under the
// -z edge, so the hem reads as a ragged edge peeking out, the points alternating `pl` and two thirds of it long.
// Slots: cloth, sleeve, hole, trim, point.
local witchDress(o) =
  local c = { w: 0.3, d: 0.34, ht: 0.04, folds: 3, sw: 0.075, points: 4, pl: 0.06, cuffL: 0.09, neckR: 0.055 } + o;
  local w = c.w, d = c.d, ht = c.ht, cz = d / 2;
  g.jacket({ w: w, d: d, ht: ht, folds: c.folds, front: 'none', buttons: [], collar: null, sleeves: { kind: 'flat', w: c.sw, t: 0.006 } })
  + [flat('neck-hole', 'hole', [g.onArc(c.neckR, 90 + 180 * i / 10, cz) for i in std.range(0, 10)], ht - 0.001, 0.002)]
  + h.crescent('neck-trim', 'trim', c.neckR, c.neckR + 0.01, 90, 270, 10, ht, ht + 0.004, 0, cz)
  + [
    local x0 = s * (w / 2 - c.sw), x1 = s * w / 2, z = -d / 2 + 0.03;
    flat('cuff-%d' % (s + 1), 'point', if s < 0 then [[x0, z], [x1 - s * 0.01, z - c.cuffL], [x1, z]] else [[x0, z], [x1, z], [x1 - s * 0.01, z - c.cuffL]], 0, 0.004)
    for s in [-1, 1]
  ]
  + [
    local pw = (w - 2 * c.sw) / c.points, x0 = -w / 2 + c.sw + i * pw, l = if i % 2 == 0 then c.pl else c.pl * 2 / 3;
    flat('point-%d' % i, 'point', [[x0, -d / 2 + 0.01], [x0 + pw, -d / 2 + 0.01], [x0 + pw * (0.4 + 0.2 * (i % 2)), -d / 2 - l]], 0, 0.004)
    for i in std.range(0, c.points - 1)
  ]
  + bandX('hem', 'trim', -d / 2 + 0.03, 0.012, w - 2 * c.sw, ht, 0.003);

// A knit tube laid flat, `w` across x and `d` along z, `t` thick, with ribbed bands `rb` deep at both open ends
// (along x) and knit ribs running along z. Slots: knit, rib.
local knitTube(prefix, cx, w0, w1, d, t, rb, ribPitch=0.012) =
  local half(z) = (w0 + (w1 - w0) * (d / 2 - z) / d) / 2;
  [
    flat(prefix + 'body', 'knit', [[cx - w0 / 2, d / 2], [cx + w0 / 2, d / 2], [cx + w1 / 2, -d / 2], [cx - w1 / 2, -d / 2]], 0, t),
    flat(prefix + 'rib-top', 'rib', [[cx - w0 / 2 - 0.002, d / 2], [cx + w0 / 2 + 0.002, d / 2], [cx + half(d / 2 - rb) + 0.002, d / 2 - rb], [cx - half(d / 2 - rb) - 0.002, d / 2 - rb]], 0, t + 0.002),
    flat(prefix + 'rib-bottom', 'rib', [[cx - half(-d / 2 + rb) - 0.002, -d / 2 + rb], [cx + half(-d / 2 + rb) + 0.002, -d / 2 + rb], [cx + w1 / 2 + 0.002, -d / 2], [cx - w1 / 2 - 0.002, -d / 2]], 0, t + 0.002),
  ] + [
    local f = (i + 0.5) / std.floor(w1 / ribPitch) - 0.5;
    strip('%srib-%d' % [prefix, i], 'rib', [cx + f * w0 * 0.92, d / 2 - rb], [cx + f * w1 * 0.92, -d / 2 + rb], t, 0.003, 0.002)
    for i in std.range(0, std.floor(w1 / ribPitch) - 1)
  ];

[
  // A long cotton bistro apron that hangs to the shins, about 700 mm square opened out, folded to 240 mm by 280 mm
  // and 20 mm tall: a cream waistband with its long ties looped back across the top, and two patch pockets at the
  // hem.
  h.compound('waist_apron_long', 0.21, waistApron({ w: 0.24, d: 0.28, ht: 0.02, folds: 3 }),
             { cloth: 'cloth-black', band: 'cloth-cream', pocket: 'cloth-black', seam: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A short cotton server's apron, about 500 mm wide and 300 mm deep opened out, folded in half to 250 mm by 150 mm
  // and 8 mm thin: a navy waistband with its ties looped back over the top and a row of three pockets.
  h.compound('waist_apron_short', 0.089, waistApron({ w: 0.25, d: 0.15, ht: 0.008, folds: 2, pockets: 3, pd: 0.06 }),
             { cloth: 'cloth-cream', band: 'cloth-navy', pocket: 'cloth-cream', seam: 'cloth-navy' })
  + { voxelGrain: 0.004 },

  // A black cotton witch's dress with full sleeves, folded to 300 mm by 340 mm and 40 mm tall: purple neck and hem
  // trim, pointed cuffs hanging past the hem and a jagged hem of four points.
  h.compound('witch_dress', 0.6, witchDress({ pl: 0.035, cuffL: 0.05 }),
             { cloth: 'cloth-black', sleeve: 'cloth-black', hole: 'void-black', trim: 'cloth-purple', point: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A floor-length black witch's dress folded in a thick bundle, 320 mm by 360 mm and 60 mm tall: purple trim, long
  // pointed cuffs, a jagged hem of four long points, and a round purple drawstring pouch for small bottles sewn at the
  // hip and lying on top, its gathered neck towards the collar.
  local w = 0.32, d = 0.36, ht = 0.06, px = 0.05, pz = -0.06;
  h.compound('witch_dress_long', 1, witchDress({ w: w, d: d, ht: ht, folds: 5, sw: 0.075, points: 4, pl: 0.045, cuffL: 0.065, neckR: 0.055 }) + [
    h.ball('pouch', 'pouch', 0.045, px, ht + 0.02, pz, 0.45),
    turned('pouch-neck', 'pouch', 'z', [[0, 0], [0, 0.013], [0.022, 0.013], [0.032, 0.022], [0.035, 0.022], [0.035, 0]], [px, ht + 0.02, pz + 0.032]),
    turned('pouch-cord', 'cord', 'z', [[0, 0.012], [0, 0.016], [0.006, 0.016], [0.006, 0.012], [0, 0.012]], [px, ht + 0.02, pz + 0.048]),
    strip('pouch-tie-l', 'cord', [px - 0.012, pz + 0.052], [px - 0.035, pz + 0.11], ht, 0.005, 0.004),
    strip('pouch-tie-r', 'cord', [px + 0.012, pz + 0.052], [px + 0.02, pz + 0.115], ht, 0.005, 0.004),
  ], { cloth: 'cloth-black', sleeve: 'cloth-black', hole: 'void-black', trim: 'cloth-purple', point: 'cloth-black', pouch: 'cloth-purple', cord: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A short purple witch's dress folded small, 280 mm by 260 mm and 30 mm tall: black trim, short pointed cuffs and
  // a jagged hem of three points.
  h.compound('witch_dress_short', 0.34, witchDress({ w: 0.28, d: 0.26, ht: 0.03, folds: 3, sw: 0.065, points: 3, pl: 0.03, cuffL: 0.04, neckR: 0.05 }),
             { cloth: 'cloth-purple', sleeve: 'cloth-purple', hole: 'void-black', trim: 'cloth-black', point: 'cloth-purple' })
  + { voxelGrain: 0.004 },

  // A wool pullover hoodie folded, 360 mm by 320 mm and 60 mm tall: the hood folded down over the neck with its
  // drawcords, a kangaroo pocket, the sleeves folded in along the sides with ribbed cuffs, and a ribbed hem band.
  local w = 0.36, d = 0.32, ht = 0.06;
  h.compound('wool_hoodie', 1.1, g.jacket({ w: w, d: d, ht: ht, front: 'none', buttons: [], collar: null, neck: 0.07, sleeves: { kind: 'flat', w: 0.08, t: 0.008 }, hood: { w: 0.2, l: 0.12, t: 0.014 } })
                                  + [
                                    box('cuff-l', 'cuff', [-w / 2 - 0.002, ht, -d / 2 + 0.03], [-w / 2 + 0.082, ht + 0.012, -d / 2 + 0.055]),
                                    box('cuff-r', 'cuff', [w / 2 - 0.082, ht, -d / 2 + 0.03], [w / 2 + 0.002, ht + 0.012, -d / 2 + 0.055]),
                                    flat('pocket', 'pocket', [[-0.075, -d / 2 + 0.035], [0.075, -d / 2 + 0.035], [0.055, -0.01], [-0.055, -0.01]], ht, 0.005),
                                    strip('pocket-edge-l', 'cuff', [-0.075, -d / 2 + 0.035], [-0.055, -0.01], ht + 0.005, 0.008, 0.002),
                                    strip('pocket-edge-r', 'cuff', [0.075, -d / 2 + 0.035], [0.055, -0.01], ht + 0.005, 0.008, 0.002),
                                    strip('cord-l', 'cord', [-0.035, d / 2 - 0.11], [-0.04, 0.0], ht + 0.014, 0.005, 0.004),
                                    strip('cord-r', 'cord', [0.035, d / 2 - 0.11], [0.04, 0.005], ht + 0.014, 0.005, 0.004),
                                  ]
                                  + bandX('hem', 'cuff', -d / 2 + 0.014, 0.026, w - 0.16, ht, 0.004),
             { cloth: 'knit-wool', sleeve: 'knit-wool', hood: 'knit-wool', cuff: 'wool-grey', pocket: 'knit-wool', cord: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A pair of cotton arm warmers laid flat side by side, each a knit tube 380 mm long tapering from 100 mm at the
  // upper arm to 75 mm at the wrist, ribbed at both ends.
  h.compound('arm_warmers', 0.08, knitTube('l-', -0.06, 0.1, 0.075, 0.38, 0.006, 0.03) + knitTube('r-', 0.06, 0.1, 0.075, 0.38, 0.006, 0.03),
             { knit: 'cloth-heather-grey', rib: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A wool belly band laid flat, a knit tube 300 mm wide and 220 mm tall pressed flat to 14 mm: rounded folds down
  // both sides, fine knit ribs along its height, and a soft rolled welt at the top and bottom edges.
  local w = 0.3, d = 0.22, t = 0.014, r = t / 2;
  h.compound('bellyband', 0.16, [
    box('body', 'knit', [-w / 2 + r, 0, -d / 2 + r], [w / 2 - r, t, d / 2 - r]),
  ] + [
    turned('fold-%d' % (s + 1), 'knit', 'z', [[0, 0], [0, r], [d - 2 * r, r], [d - 2 * r, 0]], [s * (w / 2 - r), r, -d / 2 + r])
    for s in [-1, 1]
  ] + [
    turned('welt-%d' % (s + 1), 'rib', 'x', [[0, 0], [0, r + 0.002], [w - 2 * r, r + 0.002], [w - 2 * r, 0]], [-w / 2 + r, r + 0.002, s * (d / 2 - r)])
    for s in [-1, 1]
  ] + [
    local x = -w / 2 + 0.014 + i * 0.008;
    box('rib-%d' % i, 'knit', [x, t, -d / 2 + 0.016], [x + 0.004, t + 0.002, d / 2 - 0.016])
    for i in std.range(0, std.floor((w - 0.028) / 0.008) - 1)
  ], { knit: 'knit-wool', rib: 'knit-wool' })
  + { voxelGrain: 0.002 },
]
