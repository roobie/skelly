local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;

// Shirts, sweaters, dresses and gowns folded on a shelf: each lies on `g.jacket` or `h.foldedGarment`, `w` across x
// and `d` along z, its top face at `ht`, the neck at the +z end and the hem folded under at the -z end.

// Trim lying across the top face along the hem end and turned down over the hem fold, `wd` deep.
local hemTrim(id, slot, w, d, ht, wd, t=0.006) = [
  box(id + '-top', slot, [-w / 2 - t, ht, -d / 2 - t], [w / 2 + t, ht + t, -d / 2 + wd]),
  box(id + '-face', slot, [-w / 2 - t, 0, -d / 2 - t], [w / 2 + t, ht + t, -d / 2]),
];

// Cuffs across the hem end of both flat sleeves, which lie `sw` wide along the sides.
local cuffs(id, slot, w, d, ht, sw, wd, t=0.006) = [
  box('%s-%d' % [id, s + 1], slot, [if s < 0 then -w / 2 - 0.002 else w / 2 - sw - 0.002, ht, -d / 2 + 0.03], [if s < 0 then -w / 2 + sw + 0.002 else w / 2 + 0.002, ht + t + 0.004, -d / 2 + 0.03 + wd])
  for s in [-1, 1]
];

// A ruffle of rounded scallops lying in a row across the hem end, past the fold edge.
local ruffle(prefix, slot, w, d, ht, r, n) = [
  h.disc('%s-%d' % [prefix, i], slot, r, ht * 0.15, ht + 0.004, -w / 2 + r + i * (w - 2 * r) / (n - 1), -d / 2 + r * 0.2)
  for i in std.range(0, n - 1)
];

// Laces crossing down the front from the neck, `n` crossings `pitch` apart, starting at z0.
local lacing(prefix, slot, z0, n, pitch, half, y) = std.flattenArrays([
  [
    g.strip('%s-%d-a' % [prefix, i], slot, [-half, z0 - i * pitch], [half, z0 - (i + 1) * pitch], y, 0.006, 0.003),
    g.strip('%s-%d-b' % [prefix, i], slot, [half, z0 - i * pitch], [-half, z0 - (i + 1) * pitch], y + 0.003, 0.006, 0.003),
  ]
  for i in std.range(0, n - 1)
]);

// A bow lying on the top face at [x, z]: two triangular loops and a knot.
local bow(prefix, slot, x, z, y, s) = [
  g.flat(prefix + '-l', slot, [[x - 0.006, z], [x - s, z + s * 0.6], [x - s, z - s * 0.6]], y, 0.006),
  g.flat(prefix + '-r', slot, [[x + 0.006, z], [x + s, z - s * 0.6], [x + s, z + s * 0.6]], y, 0.006),
  g.strip(prefix + '-tail-l', slot, [x - 0.004, z], [x - s * 0.5, z - s * 1.4], y, 0.008, 0.004),
  g.strip(prefix + '-tail-r', slot, [x + 0.004, z], [x + s * 0.5, z - s * 1.4], y, 0.008, 0.004),
  box(prefix + '-knot', slot, [x - 0.008, y, z - 0.008], [x + 0.008, y + 0.01, z + 0.008]),
];

// Raised ribs running along z from z0 to z1, spaced across x0..x1, for knitted bands.
local ribsZ(prefix, slot, x0, x1, n, z0, z1, y) = [
  box('%s-%d' % [prefix, i], slot, [x0 + (x1 - x0) * i / (n - 1) - 0.002, y, z0], [x0 + (x1 - x0) * i / (n - 1) + 0.002, y + 0.003, z1])
  for i in std.range(0, n - 1)
];

// A tassel of knotted cords hanging over a side of the bundle at [x, z], s = -1 or +1 for the side, spread on the
// floor beyond it.
local tassel(prefix, slot, x, z, s, ht) = [
  box(prefix + '-knot', slot, [x - 0.008, ht, z - 0.008], [x + 0.008, ht + 0.01, z + 0.008]),
  box(prefix + '-drop', slot, [if s < 0 then x - 0.012 - 0.004 else x + 0.004, 0, z - 0.006], [if s < 0 then x - 0.004 else x + 0.016, ht + 0.004, z + 0.006]),
] + [
  g.strip('%s-cord-%d' % [prefix, i], slot, [x + s * 0.01, z + (i - 1.5) * 0.005], [x + s * 0.07, z + (i - 1.5) * 0.012], 0, 0.004, 0.004)
  for i in std.range(0, 3)
];

[
  // Long red dress with white faux-fur trim, folded, 360 mm by 420 mm and 80 mm tall.
  local w = 0.36, d = 0.42, ht = 0.08;
  h.compound('santa_dress_long', 2,
             g.jacket({ w: w, d: d, ht: ht, front: 'none', buttons: 0, collar: { r: 0.065, wd: 0.03, ht: 0.016, gap: 25 }, sleeves: { kind: 'flat', w: 0.08, t: 0.006 }, belt: { z: 0.02, w: 0.04, knot: false } })
             + hemTrim('hem', 'fur', w, d, ht, 0.05, 0.01)
             + cuffs('cuff', 'fur', w, d, ht, 0.08, 0.045, 0.01)
             + [box('buckle', 'buckle', [-0.03, ht + 0.006, 0.0], [0.03, ht + 0.012, 0.04])],
             { cloth: 'cloth-red', sleeve: 'cloth-red', collar: 'fur-pale', fur: 'fur-pale', belt: 'leather-black', buckle: 'metal-gold' })
  + { voxelGrain: 0.004 },

  // Short sleeveless red dress with white faux-fur trim, folded, 320 mm by 320 mm and 50 mm tall.
  local w = 0.32, d = 0.32, ht = 0.05;
  h.compound('santa_dress_short', 0.81,
             g.jacket({ w: w, d: d, ht: ht, front: 'none', buttons: 0, collar: { r: 0.06, wd: 0.026, ht: 0.012, gap: 40 } })
             + hemTrim('hem', 'fur', w, d, ht, 0.045, 0.01)
             + [
               box('arm-trim-%d' % (s + 1), 'fur', [if s < 0 then -w / 2 - 0.006 else w / 2 - 0.035, 0.02, d / 2 - 0.12], [if s < 0 then -w / 2 + 0.035 else w / 2 + 0.006, ht + 0.01, d / 2 - 0.02])
               for s in [-1, 1]
             ],
             { cloth: 'cloth-red', collar: 'fur-pale', fur: 'fur-pale' })
  + { voxelGrain: 0.004 },

  // Bulky short-sleeved shirt woven from dried grass, folded, 360 mm by 360 mm and 90 mm tall, a ragged fringe at the hem.
  local w = 0.36, d = 0.36, ht = 0.09;
  h.compound('shirt_straw', 0.91,
             g.jacket({ w: w, d: d, ht: ht, front: 'none', buttons: 0, collar: { r: 0.065, wd: 0.02, ht: 0.01, gap: 30 }, sleeves: { kind: 'flat', w: 0.1, t: 0.01 } })
             + [
               box('weave-%d-%d' % [i, k], 'weave', [x0, y, z], [x1, y + 0.005, z + 0.012])
               for i in std.range(0, 5)
               for z in [-d / 2 + 0.03 + i * 0.032]
               for k in std.range(0, 2)
               for x0 in [[-w / 2 + 0.002, -w / 2 + 0.1, w / 2 - 0.1][k]]
               for x1 in [[-w / 2 + 0.1, w / 2 - 0.1, w / 2 - 0.002][k]]
               for y in [if k == 1 then ht else ht + 0.01]
             ]
             + [
               box('fringe-%d' % i, 'fringe', [x - 0.007, 0.01, -d / 2 - 0.02 - (i % 3) * 0.012], [x + 0.007, 0.02 + (i % 2) * 0.012, -d / 2 + 0.01])
               for i in std.range(0, 13)
               for x in [-w / 2 + 0.02 + i * (w - 0.04) / 13]
             ],
             { cloth: 'straw-pale', sleeve: 'straw-pale', collar: 'jute', weave: 'jute', fringe: 'straw-pale' })
  + { voxelGrain: 0.004 },

  // Long black dress with full sleeves, a high red collar, red cuffs and red embroidery laced down the front, folded,
  // 360 mm by 420 mm and 70 mm tall.
  local w = 0.36, d = 0.42, ht = 0.07;
  h.compound('sinister_dress', 1,
             g.jacket({ w: w, d: d, ht: ht, front: 'none', buttons: 0, collar: { r: 0.06, wd: 0.022, ht: 0.03, gap: 20 }, sleeves: { kind: 'flat', w: 0.08, t: 0.006 } })
             + cuffs('cuff', 'trim', w, d, ht, 0.08, 0.04)
             + lacing('lace', 'trim', d / 2 - 0.16, 5, 0.035, 0.03, ht)
             + [
               g.strip('embroidery-%d' % (s + 1), 'trim', [s * 0.06, d / 2 - 0.12], [s * 0.035, -d / 2 + 0.04], ht, 0.008, 0.003)
               for s in [-1, 1]
             ]
             + hemTrim('hem', 'trim', w, d, ht, 0.02, 0.004),
             { cloth: 'cloth-black', sleeve: 'cloth-black', collar: 'cloth-crimson', trim: 'cloth-crimson' })
  + { voxelGrain: 0.004 },

  // Short red dress in a doll-like gothic cut: black ruffled hem, black cuffs and a black bow at the chest, folded,
  // 320 mm by 300 mm and 55 mm tall.
  local w = 0.32, d = 0.3, ht = 0.055;
  h.compound('sinister_dress_short', 0.88,
             g.jacket({ w: w, d: d, ht: ht, front: 'none', buttons: 0, collar: { r: 0.055, wd: 0.022, ht: 0.012, gap: 30 }, sleeves: { kind: 'flat', w: 0.075, t: 0.006 } })
             + cuffs('cuff', 'trim', w, d, ht, 0.075, 0.03)
             + ruffle('ruffle', 'trim', w, d, ht, 0.016, 10)
             + bow('bow', 'trim', 0, d / 2 - 0.175, ht + 0.003, 0.035)
             + [box('placket', 'trim', [-0.01, ht, -d / 2 + 0.04], [0.01, ht + 0.003, d / 2 - 0.16])],
             { cloth: 'cloth-red', sleeve: 'cloth-red', collar: 'cloth-black', trim: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // Heavy red gown with black sleeves, a black laced bodice, a high collar and a ruffled hem, folded, 420 mm by 460 mm
  // and 130 mm tall.
  local w = 0.42, d = 0.46, ht = 0.13;
  h.compound('sinister_gown', 3.8,
             g.jacket({ w: w, d: d, ht: ht, folds: 4, front: 'none', buttons: 0, collar: { r: 0.065, wd: 0.025, ht: 0.035, gap: 20 }, sleeves: { kind: 'flat', w: 0.095, t: 0.008 } })
             + [g.flat('bodice', 'trim', [[-0.09, d / 2 - 0.16], [0.09, d / 2 - 0.16], [0.06, d / 2 - 0.33], [0, d / 2 - 0.36], [-0.06, d / 2 - 0.33]], ht, 0.004)]
             + lacing('lace', 'lace', d / 2 - 0.175, 5, 0.03, 0.03, ht + 0.004)
             + ruffle('ruffle', 'trim', w, d, ht, 0.02, 11)
             + cuffs('cuff', 'lace', w, d, ht, 0.095, 0.04, 0.008),
             { cloth: 'cloth-crimson', sleeve: 'cloth-black', collar: 'cloth-black', trim: 'cloth-black', lace: 'cloth-red' })
  + { voxelGrain: 0.004 },

  // Light sleeveless yellow cotton dress with shoulder straps and a cream sash, folded, 300 mm by 320 mm and 30 mm tall.
  local w = 0.3, d = 0.32, ht = 0.03;
  h.compound('sundress', 0.4,
             h.foldedGarment(w, d, ht, 2)
             + h.crescent('neck', 'lining', 0.004, 0.06, 100, 260, 8, ht, ht + 0.002, 0, d / 2)
             + [
               g.strip('strap-%d' % (s + 1), 'strap', [s * 0.075, d / 2 - 0.05], [s * 0.065, d / 2 + 0.004], ht, 0.018, 0.004)
               for s in [-1, 1]
             ]
             + [box('sash', 'sash', [-w / 2 - 0.004, ht, -0.01], [w / 2 + 0.004, ht + 0.004, 0.02])]
             + bow('bow', 'sash', 0.08, 0.005, ht + 0.004, 0.025)
             + [
               h.disc('dot-%d-%d' % [i, j], 'dot', 0.006, ht, ht + 0.002, -0.11 + i * 0.055 + (j % 2) * 0.027, -0.13 + j * 0.05)
               for i in std.range(0, 4)
               for j in std.range(0, 2)
             ],
             { cloth: 'cloth-yellow', lining: 'cloth-cream', strap: 'cloth-yellow', sash: 'cloth-cream', dot: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // Cream wool sweater with cable knitting down the front and ribbed neck, cuffs and hem, folded, 340 mm by 340 mm and
  // 70 mm tall.
  local w = 0.34, d = 0.34, ht = 0.07;
  h.compound('sweater', 0.7,
             g.jacket({ w: w, d: d, ht: ht, front: 'none', buttons: 0, collar: { r: 0.06, wd: 0.022, ht: 0.012, gap: 0 }, sleeves: { kind: 'flat', w: 0.085, t: 0.008 } })
             + hemTrim('hem', 'rib', w, d, ht, 0.035, 0.006)
             + ribsZ('hem-rib', 'rib', -w / 2 + 0.01, w / 2 - 0.01, 22, -d / 2 + 0.002, -d / 2 + 0.035, ht + 0.006)
             + cuffs('cuff', 'rib', w, d, ht, 0.085, 0.035)
             + std.flattenArrays([
               [
                 g.strip('cable-%d-%d-a' % [c, k], 'cable', [x - 0.01, d / 2 - 0.165 - k * 0.04], [x + 0.01, d / 2 - 0.205 - k * 0.04], ht, 0.01, 0.005),
                 g.strip('cable-%d-%d-b' % [c, k], 'cable', [x + 0.01, d / 2 - 0.165 - k * 0.04], [x - 0.01, d / 2 - 0.205 - k * 0.04], ht + 0.003, 0.01, 0.005),
               ]
               for c in std.range(0, 2)
               for x in [(c - 1) * 0.06]
               for k in std.range(0, 2)
             ]),
             { cloth: 'cloth-cream', sleeve: 'cloth-cream', collar: 'cloth-cream', rib: 'cloth-cream', cable: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // Thick grey cotton sweatshirt with a ribbed neck, cuffs and waistband and a darker V at the collar, folded,
  // 360 mm by 340 mm and 80 mm tall.
  local w = 0.36, d = 0.34, ht = 0.08;
  h.compound('sweatshirt', 0.6,
             g.jacket({ w: w, d: d, ht: ht, front: 'none', buttons: 0, collar: { r: 0.06, wd: 0.02, ht: 0.01, gap: 0 }, sleeves: { kind: 'flat', w: 0.09, t: 0.008 } })
             + hemTrim('hem', 'rib', w, d, ht, 0.045, 0.006)
             + cuffs('cuff', 'rib', w, d, ht, 0.09, 0.045)
             + [g.flat('v-insert', 'trim', [[-0.03, d / 2 - 0.168], [0.03, d / 2 - 0.168], [0, d / 2 - 0.225]], ht, 0.004)],
             { cloth: 'canvas-grey', sleeve: 'canvas-grey', collar: 'cloth-charcoal', rib: 'cloth-charcoal', trim: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // White cotton undershirt with a knotted fringe of cords at each of its four corners, folded, 280 mm by 300 mm and
  // 30 mm tall.
  local w = 0.28, d = 0.3, ht = 0.03;
  h.compound('tallit_katan', 0.12,
             h.foldedGarment(w, d, ht, 2)
             + h.crescent('neck', 'lining', 0.004, 0.055, 95, 265, 8, ht, ht + 0.002, 0, d / 2)
             + [box('stripe', 'stripe', [-w / 2, ht, -d / 2 + 0.03], [w / 2, ht + 0.002, -d / 2 + 0.045])]
             + std.flattenArrays([
               tassel('tassel-%d-%d' % [s + 1, zi], 'cord', s * (w / 2 - 0.012), z, s, ht)
               for s in [-1, 1]
               for zi in [0, 1]
               for z in [if zi == 0 then -d / 2 + 0.015 else d / 2 - 0.08]
             ]),
             { cloth: 'cloth-cream', lining: 'cloth-bright-white', stripe: 'cloth-navy', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // Grey canvas work t-shirt with one chest pocket, folded, 300 mm by 300 mm and 35 mm tall.
  local w = 0.3, d = 0.3, ht = 0.035;
  h.compound('technician_shirt_gray', 0.3,
             g.jacket({ w: w, d: d, ht: ht, folds: 2, front: 'none', buttons: 0, collar: { r: 0.055, wd: 0.015, ht: 0.006, gap: 0 }, sleeves: { kind: 'flat', w: 0.07, t: 0.005 }, pockets: [{ x: -0.065, z: -0.04, w: 0.07, d: 0.08, flap: 0, single: true }] })
             + [box('pocket-pen', 'pen', [-0.085, ht + 0.004, -0.01], [-0.077, ht + 0.012, 0.02])],
             { cloth: 'canvas-grey', sleeve: 'canvas-grey', collar: 'cloth-charcoal', pocket: 'canvas-grey', pen: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // Plain blue cotton t-shirt, folded, 280 mm by 280 mm and 25 mm tall.
  local w = 0.28, d = 0.28, ht = 0.025;
  h.compound('tshirt', 0.18,
             g.jacket({ w: w, d: d, ht: ht, folds: 2, front: 'none', buttons: 0, collar: { r: 0.05, wd: 0.012, ht: 0.004, gap: 0 }, sleeves: { kind: 'flat', w: 0.065, t: 0.004 } }),
             { cloth: 'cloth-blue', sleeve: 'cloth-blue', collar: 'cloth-navy' })
  + { voxelGrain: 0.004 },

  // Purple cotton crop top, the body cut short, folded, 260 mm by 180 mm and 20 mm tall.
  local w = 0.26, d = 0.18, ht = 0.02;
  h.compound('tshirt_cropped', 0.12,
             g.jacket({ w: w, d: d, ht: ht, folds: 2, neck: 0.075, front: 'none', buttons: 0, collar: { r: 0.05, wd: 0.012, ht: 0.004, gap: 0 }, sleeves: { kind: 'flat', w: 0.06, t: 0.004 } })
             + [box('hem', 'collar', [-w / 2 + 0.06, ht, -d / 2 + 0.004], [w / 2 - 0.06, ht + 0.003, -d / 2 + 0.016])],
             { cloth: 'cloth-purple', sleeve: 'cloth-purple', collar: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // Saffron monk's upper robe folded into a flat bundle, 320 mm by 240 mm and 40 mm tall, its pieced panels marked by
  // raised seams.
  local w = 0.32, d = 0.24, ht = 0.04;
  h.compound('uttarasanga', 0.43,
             h.foldedGarment(w, d, ht, 3)
             + [
               box('seam-x-%d' % i, 'seam', [x - 0.004, ht, -d / 2 + 0.006], [x + 0.004, ht + 0.003, d / 2 - 0.004])
               for i in std.range(0, 4)
               for x in [-w / 2 + 0.015 + i * (w - 0.03) / 4]
             ]
             + [
               box('seam-z-%d' % i, 'seam', [-w / 2 + 0.012, ht, z - 0.004], [w / 2 - 0.012, ht + 0.003, z + 0.004])
               for i in std.range(0, 2)
               for z in [-d / 2 + 0.015 + i * (d - 0.03) / 2]
             ]
             + [box('rib-%d' % i, 'seam', [x - 0.002, ht, -0.04], [x + 0.002, ht + 0.003, 0.04]) for i in std.range(0, 3) for x in [-w / 2 + 0.015 + (i + 0.5) * (w - 0.03) / 4]],
             { cloth: 'cloth-saffron', seam: 'cloth-orange' })
  + { voxelGrain: 0.004 },

  // Thick brown leather vest with a snap front and two flapped pockets, folded once, 380 mm by 360 mm and 40 mm tall.
  local w = 0.38, d = 0.36, ht = 0.04;
  h.compound('vest_leather', 1.2,
             g.jacket({ w: w, d: d, ht: ht, folds: 2, front: 'placket', buttons: 4, buttonR: 0.007, collar: null, pockets: [{ x: 0.09, z: -0.07, w: 0.08, d: 0.06, flap: 0.025, snap: true }] })
             + [g.flat('neck', 'lining', [[-0.07, d / 2], [0.07, d / 2], [0, d / 2 - 0.14]], ht, 0.002)]
             + [
               g.strip('neck-edge-%d' % (s + 1), 'edge', [s * 0.075, d / 2], [s * 0.004, d / 2 - 0.15], ht, 0.012, 0.004)
               for s in [-1, 1]
             ]
             + h.crescent('armhole-l', 'lining', 0.004, 0.05, 0, 180, 8, ht, ht + 0.002, -w / 2, d / 2 - 0.1)
             + h.crescent('armhole-r', 'lining', 0.004, 0.05, 180, 360, 8, ht, ht + 0.002, w / 2, d / 2 - 0.1),
             { cloth: 'leather-chestnut', front: 'leather-chestnut', edge: 'leather-chestnut', button: 'steel-bright', pocket: 'leather-chestnut', flap: 'leather-chestnut', lining: 'cloth-black' })
  + { voxelGrain: 0.004 },
]
