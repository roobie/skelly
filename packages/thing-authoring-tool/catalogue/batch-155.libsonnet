local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;

// Trousers folded on a shelf, and masks and balaclavas standing upright as on a head form, face on +z.

// Folded trousers, after batch 153: a stack of `folds` cloth layers `w` across x and `d` along z, `ht` tall, each
// front edge rolled over at +z, the waistband along the back edge (-z). Slot: cloth.
local fold(w, d, ht, folds) =
  local t = ht / folds, r = t / 2;
  std.flattenArrays([
    local inset = (i % 2) * std.min(0.006, w * 0.03);
    [
      box('fold-%d' % i, 'cloth', [-w / 2 + inset, i * t, -d / 2], [w / 2 - inset, (i + 1) * t, d / 2 - r]),
      h.rod('edge-%d' % i, 'cloth', r, -w / 2 + inset, w / 2 - inset, i * t + r) + { origin: [-w / 2 + inset, i * t + r, d / 2 - r] },
    ]
    for i in std.range(0, folds - 1)
  ]);
// Options: `cargo` a bellows pocket { x, z, w, d } with a flapped press stud; `knee` a padded panel { z, d };
// `ties` a waist tie, its two ends trailing over the top face; `loops` belt loops and a button, else a drawcord.
// Slots: cloth, waistband, loop, button, seam, pocket, flap, stud, knee, cord.
local trousers(o) =
  local c = { w: 0.26, d: 0.34, ht: 0.06, folds: 4, band: 0.035, cargo: null, knee: null, loops: true } + o;
  local w = c.w, d = c.d, ht = c.ht, z0 = -d / 2;
  fold(w, d, ht, c.folds)
  + [box('waistband', 'waistband', [-w / 2, ht - 0.002, z0], [w / 2, ht + 0.004, z0 + c.band])]
  + (if c.loops then [
       box('loop-%d' % i, 'loop', [x - 0.005, ht + 0.004, z0 - 0.002], [x + 0.005, ht + 0.008, z0 + c.band + 0.004])
       for i in [0, 1, 2]
       for x in [[-w * 0.38, -w * 0.05, w * 0.3][i]]
     ] + [h.disc('button', 'button', 0.008, ht + 0.004, ht + 0.009, w * 0.42, z0 + c.band / 2)]
     else [
       box('cord', 'cord', [-0.006, ht + 0.004, z0 + c.band * 0.3], [0.006, ht + 0.008, z0 + c.band * 0.7]),
       g.strip('cord-end-a', 'cord', [-0.008, z0 + c.band * 0.6], [-0.04, z0 + c.band + 0.09], ht + 0.004, 0.007, 0.004),
       g.strip('cord-end-b', 'cord', [0.008, z0 + c.band * 0.6], [0.03, z0 + c.band + 0.08], ht + 0.004, 0.007, 0.004),
     ])
  + [box('seam', 'seam', [-0.003, ht, z0 + c.band], [0.003, ht + 0.002, d / 2 - 0.01])]
  + (if c.cargo == null then [] else
       local p = { flap: 0.035 } + c.cargo;
       [
         box('cargo', 'pocket', [p.x - p.w / 2, ht, p.z - p.d / 2], [p.x + p.w / 2, ht + 0.012, p.z + p.d / 2]),
         box('cargo-flap', 'flap', [p.x - p.w / 2 - 0.004, ht + 0.012, p.z - p.d / 2 - 0.004], [p.x + p.w / 2 + 0.004, ht + 0.016, p.z - p.d / 2 + p.flap]),
         h.disc('cargo-stud', 'stud', 0.006, ht + 0.016, ht + 0.02, p.x, p.z - p.d / 2 + p.flap - 0.01),
       ])
  + (if c.knee == null then [] else [
       box('knee-' + s, 'knee', [if s == 'l' then -w / 2 + 0.012 else 0.008, ht, c.knee.z - c.knee.d / 2], [if s == 'l' then -0.008 else w / 2 - 0.012, ht + 0.005, c.knee.z + c.knee.d / 2])
       for s in ['l', 'r']
     ]);
local folded(id, mass, o, extras, finish) = h.compound(id, mass, trousers(o) + extras, finish) + { voxelGrain: 0.004 };

// Hoods and masks standing upright, after batch 140: turned about y from a [y, radius] profile.
local rAt(prof, y) =
  local segs = [[prof[i], prof[i + 1]] for i in std.range(0, std.length(prof) - 2) if prof[i][0] < prof[i + 1][0] && prof[i][0] <= y && y <= prof[i + 1][0]];
  if std.length(segs) == 0 then 0 else
    local a = segs[0][0], b = segs[0][1];
    a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
local spread(a, b, n) = [a + (b - a) * i / (n - 1) for i in std.range(0, n - 1)];
// A patch on the front of the head from x0 to x1 and y0 to y1, standing `proud` off the curve: zips, panels. It is
// cut into strips no wider than 6 mm, so each follows the curve rather than sinking under it.
local onFrontBox(prof, id, slot, x0, x1, y0, y1, proud) =
  local r = std.min(rAt(prof, y0), rAt(prof, y1)), xm = if x0 < 0 && x1 > 0 then 0 else std.min(std.abs(x0), std.abs(x1));
  box(id, slot, [x0, y0, 0.02], [x1, y1, std.sqrt(r * r - xm * xm) + proud]);
local onFront(prof, id, slot, x0, x1, y0, y1, proud=0.002) =
  local n = std.max(1, std.ceil((x1 - x0) / 0.006 - 1e-6)), sw = (x1 - x0) / n;
  [onFrontBox(prof, '%s-%d' % [id, i], slot, x0 + i * sw, x0 + (i + 1) * sw, y0, y1, proud) for i in std.range(0, n - 1)];
// An oval opening centred [0, y], `w` across half and `hh` tall half, as vertical strips in slot `slot`.
local opening(prof, id, slot, y, w, hh, proud=0.002, cx=0) =
  local sw = 0.006, n = std.floor(2 * w / sw);
  [
    local x0 = cx - n * sw / 2 + i * sw, xo = std.abs(x0 + sw / 2 - cx), fh = hh * std.sqrt(std.max(0.12, 1 - std.pow(xo / w, 2)));
    onFrontBox(prof, '%s-%d' % [id, i], slot, x0, x0 + sw, y - fh, y + fh, proud)
    for i in std.range(0, n - 1)
  ];
// A knit rib or band round the head at height y, broken at the front between -gap and +gap degrees.
local band(prof, id, slot, y, ht, gap=0) =
  local r = rAt(prof, y + ht / 2);
  h.crescent(id, slot, r - 0.006, r + 0.003, gap, 360 - gap, 16, y, y + ht);

// A balaclava laid flat [z, x]: the neck hem at -z, the crown at +z.
local balaclavaHead = [[-0.07, -0.098], [-0.07, 0.098], [0.04, 0.11], [0.1, 0.104], [0.135, 0.085], [0.155, 0.055],
                      [0.162, 0.02], [0.162, -0.02], [0.155, -0.055], [0.135, -0.085], [0.1, -0.104], [0.04, -0.11]];
local balaclavaNeck = [[-0.16, -0.084], [-0.16, 0.084], [-0.06, 0.09], [-0.06, -0.09]];
local shrink(pts, k, dz) = [[q[0] * k + dz, q[1] * k] for q in pts];
local oval(cz, rx, rz) = [[cz + rz * std.cos(2 * std.pi * i / 12), rx * std.sin(2 * std.pi * i / 12)] for i in std.range(0, 11)];

// A close leather mask that ends under the jaw.
local maskProfile = [[0, 0], [0, 0.082], [0.03, 0.084], [0.08, 0.092], [0.14, 0.098], [0.18, 0.097], [0.22, 0.087], [0.25, 0.064], [0.266, 0.034], [0.27, 0]];

// A folded bandana's outline [x, z]: a right triangle, its folded edge along +z.
local bandanaOutline = [[-0.195, 0.097], [0.195, 0.097], [0, -0.098]];

// One bondage mask. With `zipped`, the eye and mouth zips are closed over leather; otherwise they gape open.
// Slots: leather, opening, zip, lace, eyelet, seam.
local mask(id, zipped) =
  local p = maskProfile;
  local slit(n, cx, y, w, hh) =
    (if zipped then opening(p, n + '-closed', 'seam', y, w, hh * 0.35, 0.003, cx) else opening(p, n, 'opening', y, w, hh, 0.003, cx))
    + onFront(p, n + '-zip-top', 'zip', cx - w - 0.004, cx + w + 0.004, y + (if zipped then -0.002 else hh), y + (if zipped then 0.003 else hh + 0.005), 0.005)
    + (if zipped then [] else onFront(p, n + '-zip-bottom', 'zip', cx - w - 0.004, cx + w + 0.004, y - hh - 0.005, y - hh, 0.005))
    + onFront(p, n + '-pull', 'zip', cx + w + 0.002, cx + w + 0.01, y - 0.014, y + 0.002, 0.008);
  h.compound(id, 0.35, [h.turned('head', 'leather', 'y', p)]
                       + slit('eye-l', -0.033, 0.185, 0.022, 0.009)
                       + slit('eye-r', 0.033, 0.185, 0.022, 0.009)
                       + slit('mouth', 0, 0.115, 0.03, 0.01)
                       + onFront(p, 'nose', 'seam', -0.003, 0.003, 0.135, 0.175, 0.004)
                       + std.flattenArrays([onFront(p, 'nostril-' + s, 'opening', x - 0.003, x + 0.003, 0.14, 0.146, 0.005) for s in ['l', 'r'] for x in [if s == 'l' then -0.008 else 0.008]])
                       // Lacing up the back of the head: eyelets either side of a gap, laced across.
                       + [
                         local r = rAt(p, y);
                         box('eyelet-%s-%d' % [s, i], 'eyelet', [x - 0.004, y - 0.004, -r - 0.004], [x + 0.004, y + 0.004, -r + 0.01])
                         for i in std.range(0, 6)
                         for y in [0.02 + i * 0.03]
                         for s in ['l', 'r']
                         for x in [if s == 'l' then -0.016 else 0.016]
                       ]
                       + [
                         local r = rAt(p, y);
                         box('lace-%d' % i, 'lace', [-0.018, y - 0.002, -r - 0.003], [0.018, y + 0.002, -r + 0.01])
                         for i in std.range(0, 6)
                         for y in [0.02 + i * 0.03]
                       ]
                       + band(p, 'neck-seam', 'seam', 0.004, 0.006),
             { leather: 'leather-charcoal', opening: 'screen-black', zip: 'metal-silver', lace: 'leather-black', eyelet: 'metal-silver', seam: 'leather-black' })
  + { voxelGrain: 0.004 };

[
  // Black cotton trousers folded, 260 mm by 340 mm and 40 mm tall: no pockets, a tied waist with its ends trailing,
  // and the calf ties hanging loose off the folded hems.
  folded('trousers_ninja', 0.49, { w: 0.26, d: 0.34, ht: 0.04, folds: 3, loops: false }, [
    g.strip('calf-tie-%d' % i, 'cord', [x, 0.15], [x + 0.02, 0.24], 0.04, 0.008, 0.004)
    for i in [0, 1]
    for x in [[-0.07, 0.06][i]]
  ] + [
    box('calf-tie-drop-%d' % i, 'cord', [x - 0.004, 0, 0.17], [x + 0.004, 0.04, 0.178])
    for i in [0, 1]
    for x in [[-0.07, 0.06][i]]
  ], { cloth: 'cloth-charcoal', waistband: 'cloth-black', seam: 'cloth-black', cord: 'cloth-black' }),

  // Padded army winter trousers folded thick, 290 mm by 360 mm and 90 mm tall: quilted channels across the seat,
  // belt loops, a bellows cargo pocket and padded knee panels.
  folded('winter_pants_army', 1.3, { w: 0.29, d: 0.36, ht: 0.09, folds: 4, cargo: { x: 0.065, z: -0.03, w: 0.11, d: 0.12 }, knee: { z: 0.12, d: 0.07 } },
         g.quilt({ style: 'lines', along: 'x', x0: -0.14, x1: 0.14, z0: -0.135, z1: 0.07, y: 0.09, pitch: 0.04 }), {
    cloth: 'nylon-ranger-green',
    waistband: 'webbing-olive-dark',
    loop: 'webbing-olive-dark',
    button: 'plastic-matte-black',
    seam: 'webbing-olive-dark',
    pocket: 'nylon-ranger-green',
    flap: 'webbing-olive-dark',
    stud: 'plastic-matte-black',
    knee: 'webbing-olive-dark',
    quilt: 'webbing-olive-dark',
  }),

  // White martial arts trousers folded thin, 250 mm by 330 mm and 24 mm tall: a drawcord waist and nothing else.
  folded('zubon_gi', 0.28, { w: 0.25, d: 0.33, ht: 0.024, folds: 2, loops: false }, [],
         { cloth: 'cloth-bright-white', waistband: 'cloth-cream', seam: 'cloth-cream', cord: 'cloth-cream' }),

  // A knit balaclava laid flat on its back, 220 mm across the head and 320 mm from the neck hem at -z to the crown at +z: two
  // layers of knit with a soft raised top, a dark face opening ringed in rib, the ribbed neck tube with its hem turned
  // back, and a crease where the neck meets the head.
  h.compound('balclava', 0.13, [
    h.prism('back', 'knit', 'y', balaclavaHead, 0, 0.007),
    h.prism('front', 'knit', 'y', shrink(balaclavaHead, 0.92, 0.004), 0.007, 0.013),
    h.prism('neck-back', 'knit', 'y', balaclavaNeck, 0, 0.007),
    h.prism('neck-front', 'knit', 'y', shrink(balaclavaNeck, 0.93, -0.004), 0.007, 0.013),
    h.prism('rim', 'rib', 'y', oval(0.055, 0.068, 0.05), 0.013, 0.016),
    h.prism('face', 'face', 'y', oval(0.055, 0.056, 0.039), 0.016, 0.0175),
    h.prism('crease', 'rib', 'y', [[-0.072, -0.095], [-0.072, 0.095], [-0.064, 0.095], [-0.064, -0.095]], 0.013, 0.0145),
    h.prism('cuff', 'rib', 'y', [[-0.16, -0.085], [-0.16, 0.085], [-0.12, 0.087], [-0.12, -0.087]], 0.007, 0.016),
  ] + [
    g.strip('rib-%d' % i, 'knit', [-0.082, -0.157 + 0.0075 * i], [0.082, -0.157 + 0.0075 * i], 0.016, 0.0025, 0.0012)
    for i in std.range(1, 4)
  ] + [
    g.strip('neck-rib-%d' % i, 'rib', [-0.08, -0.112 + 0.01 * i], [0.08, -0.112 + 0.01 * i], 0.013, 0.003, 0.001)
    for i in std.range(0, 3)
  ], { knit: 'cloth-olive-drab', rib: 'webbing-olive-dark', face: 'screen-black' })
  + { voxelGrain: 0.002 },

  // A cotton bandana folded corner to corner twice and laid flat, 390 mm along the folded edge at +z and 195 mm
  // deep: the fold rolled over, a white border inset from the hemmed edges and a scatter of white motifs on red.
  h.compound('bandana', 0.056, [
    h.prism('cloth', 'cloth', 'y', [[p[1], p[0]] for p in bandanaOutline], 0, 0.006),
    h.rod('fold', 'cloth', 0.004, -0.19, 0.19, 0.004) + { origin: [-0.19, 0.004, 0.093] },
    g.strip('border-l', 'print', [-0.155, 0.075], [0, -0.075], 0.006, 0.005, 0.001),
    g.strip('border-r', 'print', [0.155, 0.075], [0, -0.075], 0.006, 0.005, 0.001),
  ] + [
    h.disc('motif-%d' % i, 'print', 0.007, 0.006, 0.007, m[0], m[1])
    for i in std.range(0, 5)
    for m in [[[-0.09, 0.06], [0, 0.06], [0.09, 0.06], [-0.045, 0.015], [0.045, 0.015], [0, -0.03]][i]]
  ], { cloth: 'cloth-red', print: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A black leather mask standing upright, 200 mm across and 270 mm tall: zipped eye slits and mouth gaping open at
  // +z, a seam down the nose, and lacing with steel eyelets up the back of the head.
  mask('bondage_mask', false),

  // The same mask with its eye and mouth zips drawn shut, leaving only the nose holes.
  mask('bondage_mask_zipped', true),
]
