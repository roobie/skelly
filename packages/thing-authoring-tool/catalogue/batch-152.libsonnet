local h = import '../compound.libsonnet';
local box = h.box;

// Legwear: trousers, shorts, skirts, kilts and waders as found on a shelf or the floor. Folded legwear lies on
// h.foldedGarment, `w` across x and `d` along z, top face at `ht`, the waistband at +z (front) and the folded hems
// rolled over at -z. Skirts and kilts lie flat, waist at +z.

// A flat convex outline of [x, z] points lying on a top face from y to y + t.
local flat(id, slot, pts, y, t=0.004) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y, y + t);
// A strip `w` wide lying on a top face at y, from [xa, za] to [xb, zb].
local strip(id, slot, a, b, y, w=0.008, t=0.003) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  flat(id, slot, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], y, t);
local spread(a, b, n) = if n == 1 then [a] else [a + (b - a) * i / (n - 1) for i in std.range(0, n - 1)];

// Trousers or shorts folded once at the knee and laid front up: the two legs side by side split by a dark crotch
// line, a waistband with belt loops, a fly and front pocket openings. Options pick the details. Slots: cloth, band,
// seam, stitch, metal, plus hole and thread for knee rips, stripe for side stripes, cord for a drawstring.
local trousers(o) =
  local c = {
    w: 0.38, d: 0.46, ht: 0.05, folds: 3, crotch: 0.2, band: 0.035,
    fly: 'zip', pockets: true, loops: true, rips: false, stripes: false, drawstring: false, kneeBands: false,
  } + o;
  local w = c.w, d = c.d, ht = c.ht, top = d / 2, band = c.band;
  h.foldedGarment(w, d, ht, c.folds)
  + [
    box('waistband', 'band', [-w / 2, ht, top - band], [w / 2, ht + 0.005, top]),
    box('crotch', 'seam', [-0.005, ht, -d / 2 + 0.004], [0.005, ht + 0.003, top - c.crotch]),
  ]
  + (if c.loops then [
       box('loop-%d' % i, 'band', [x - 0.006, ht + 0.005, top - band - 0.004], [x + 0.006, ht + 0.008, top + 0.001])
       for i in std.range(0, 3)
       for x in [[-w / 2 + 0.03, -0.07, 0.07, w / 2 - 0.03][i]]
     ] else [])
  + (if c.fly == 'zip' then [
       strip('fly', 'stitch', [0.02, top - band], [0.02, top - c.crotch + 0.04], ht, 0.004),
       strip('fly-curve', 'stitch', [0.02, top - c.crotch + 0.04], [0.004, top - c.crotch + 0.015], ht, 0.004),
       h.disc('button', 'metal', 0.008, ht + 0.005, ht + 0.009, 0, top - band / 2),
     ] else if c.fly == 'buttons' then [
       h.disc('fly-button-%d' % i, 'metal', 0.006, ht, ht + 0.005, 0.012, z)
       for i in std.range(0, 3)
       for z in [spread(top - band - 0.02, top - c.crotch + 0.025, 4)[i]]
     ] + [h.disc('button', 'metal', 0.007, ht + 0.005, ht + 0.009, 0.012, top - band / 2)]
     else [])
  + (if c.pockets then [
       strip('pocket-' + s, 'stitch', [sx * (w / 2 - 0.1), top - band], [sx * w / 2, top - band - 0.09], ht, 0.005)
       for s in ['l', 'r']
       for sx in [if s == 'l' then -1 else 1]
     ] else [])
  + (if c.rips then std.flattenArrays([
       [
         box('rip-%s' % s, 'hole', [sx * w / 4 - 0.04, ht, -0.035], [sx * w / 4 + 0.04, ht + 0.002, 0.025]),
       ] + [
         box('thread-%s-%d' % [s, i], 'thread', [sx * w / 4 - 0.042, ht + 0.002, z - 0.002], [sx * w / 4 + 0.042, ht + 0.004, z + 0.002])
         for i in std.range(0, 3)
         for z in [spread(-0.025, 0.015, 4)[i]]
       ]
       for s in ['l', 'r']
       for sx in [if s == 'l' then -1 else 1]
     ]) else [])
  + (if c.stripes then [
       box('stripe-' + s, 'stripe', [if s == 'l' then -w / 2 else w / 2 - 0.025, ht, -d / 2 + 0.004], [if s == 'l' then -w / 2 + 0.025 else w / 2, ht + 0.003, top - band])
       for s in ['l', 'r']
     ] else [])
  + (if c.drawstring then [
       strip('cord-l', 'cord', [-0.012, top - band / 2], [-0.03, top - band - 0.09], ht + 0.005, 0.006, 0.005),
       strip('cord-r', 'cord', [0.012, top - band / 2], [0.035, top - band - 0.085], ht + 0.005, 0.006, 0.005),
       box('eyelets', 'metal', [-0.016, ht + 0.005, top - band / 2 - 0.004], [0.016, ht + 0.007, top - band / 2 + 0.004]),
     ] else [])
  + (if c.kneeBands then std.flattenArrays([
       [
         box('knee-band-' + s, 'band', [if s == 'l' then -w / 2 else 0.006, ht, -d / 2 + 0.004], [if s == 'l' then -0.006 else w / 2, ht + 0.005, -d / 2 + 0.04]),
         h.disc('knee-button-' + s, 'metal', 0.006, ht + 0.005, ht + 0.009, if s == 'l' then -w / 2 + 0.025 else w / 2 - 0.025, -d / 2 + 0.022),
       ]
       for s in ['l', 'r']
     ]) else []);

// A skirt laid flat, waist at +z: a trapezoid of doubled cloth `wt` wide at the waist and `wb` at the hem, `len`
// long, with pleat ridges fanning from waist to hem, a waistband and `stripes` bands near the hem. Slots: cloth,
// pleat, band, stripe.
local skirt(o) =
  local c = { wt: 0.34, wb: 0.5, len: 0.3, t: 0.012, pleats: 11, stripes: [0.03, 0.05], band: 0.03 } + o;
  local z1 = c.len / 2, z0 = -c.len / 2;
  local halfAt(z) = c.wb / 2 + (c.wt - c.wb) / 2 * (z - z0) / c.len;
  [
    flat('cloth', 'cloth', [[-c.wb / 2, z0], [c.wb / 2, z0], [c.wt / 2, z1], [-c.wt / 2, z1]], 0, c.t),
    box('waistband', 'band', [-c.wt / 2, c.t, z1 - c.band], [c.wt / 2, c.t + 0.004, z1]),
  ] + [
    local f = (i + 0.5) / c.pleats - 0.5;
    strip('pleat-%d' % i, 'pleat', [f * c.wt, z1 - c.band], [f * c.wb, z0 + 0.003], c.t, 0.006, 0.004)
    for i in std.range(0, c.pleats - 1)
  ] + [
    local zs = z0 + c.stripes[i];
    flat('stripe-%d' % i, 'stripe', [[-halfAt(zs - 0.006), zs - 0.006], [halfAt(zs - 0.006), zs - 0.006], [halfAt(zs + 0.006), zs + 0.006], [-halfAt(zs + 0.006), zs + 0.006]], c.t, 0.005)
    for i in std.range(0, std.length(c.stripes) - 1)
  ];

// A kilt folded on a shelf, waist at +z: knife pleats as ridges along z over the -x half, the flat apron over the
// +x half with a fringed edge and a pin near its hem, and two strap-and-buckle closures at the waist. `tartan`
// lays crossing raised strips in the stripe and stripe2 slots; `pockets` adds flapped cargo pockets on the apron.
// Slots: cloth, pleat, band, strap, metal, fringe, stripe, stripe2, pocket, flap.
local kilt(o) =
  local c = { w: 0.32, d: 0.36, ht: 0.04, tartan: false, pockets: false, fringe: true, pin: true, pleats: 7 } + o;
  local w = c.w, d = c.d, ht = c.ht, top = d / 2;
  h.foldedGarment(w, d, ht, 2)
  + [
    box('waistband', 'band', [-w / 2, ht, top - 0.03], [w / 2, ht + 0.004, top]),
  ] + [
    local x = -w / 2 + 0.02 + i * (w / 2 - 0.03) / (c.pleats - 1);
    box('pleat-%d' % i, 'pleat', [x - 0.004, ht, -d / 2 + 0.012], [x + 0.004, ht + 0.006, top - 0.03])
    for i in std.range(0, c.pleats - 1)
  ] + std.flattenArrays([
    [
      box('strap-%d' % i, 'strap', [w / 2 - 0.075, ht + 0.004, z - 0.008], [w / 2 + 0.005, ht + 0.007, z + 0.008]),
      box('buckle-%d' % i, 'metal', [w / 2 - 0.09, ht + 0.004, z - 0.011], [w / 2 - 0.07, ht + 0.009, z + 0.011]),
    ]
    for i in [0, 1]
    for z in [[top - 0.015, top - 0.07][i]]
  ])
  + (if c.fringe then [
       box('fringe-%d' % i, 'fringe', [w / 2 - 0.004, ht - 0.006, z - 0.002], [w / 2 + 0.006, ht + 0.002, z + 0.002])
       for i in std.range(0, 15)
       for z in [spread(-d / 2 + 0.02, top - 0.1, 16)[i]]
     ] else [])
  + (if c.pin then [
       strip('pin', 'metal', [w / 2 - 0.05, -d / 2 + 0.07], [w / 2 - 0.035, -d / 2 + 0.13], ht, 0.004, 0.004),
       h.disc('pin-head', 'metal', 0.007, ht, ht + 0.006, w / 2 - 0.05, -d / 2 + 0.065),
     ] else [])
  + (if c.tartan then [
       box('tartan-x-%d' % i, 'stripe', [0.005, ht, z - 0.005], [w / 2 - 0.008, ht + 0.003, z + 0.005])
       for i in std.range(0, 3)
       for z in [spread(-d / 2 + 0.05, top - 0.07, 4)[i]]
     ] + [
       box('tartan-z-%d' % i, 'stripe2', [x - 0.004, ht + 0.0005, -d / 2 + 0.012], [x + 0.004, ht + 0.0035, top - 0.03])
       for i in std.range(0, 2)
       for x in [spread(0.035, w / 2 - 0.035, 3)[i]]
     ] + [
       box('tartan-thin-%d' % i, 'stripe2', [0.005, ht + 0.0005, z - 0.002], [w / 2 - 0.008, ht + 0.0035, z + 0.002])
       for i in std.range(0, 2)
       for z in [spread(-d / 2 + 0.09, top - 0.11, 3)[i]]
     ] else [])
  + (if c.pockets then std.flattenArrays([
       [
         box('pocket-%d' % i, 'pocket', [x - 0.045, ht, -0.09], [x + 0.045, ht + 0.012, 0.02]),
         box('flap-%d' % i, 'flap', [x - 0.048, ht + 0.012, -0.01], [x + 0.048, ht + 0.016, 0.024]),
         h.disc('snap-%d' % i, 'metal', 0.005, ht + 0.016, ht + 0.019, x, 0.0),
       ]
       for i in [0]
       for x in [w / 4 + 0.005]
     ]) + [
       box('loop-%d' % i, 'band', [x - 0.006, ht + 0.004, top - 0.034], [x + 0.006, ht + 0.007, top + 0.001])
       for i in std.range(0, 2)
       for x in [[-w / 2 + 0.03, -0.04, 0.05][i]]
     ] else []);

// Chest waders laid flat on their back, bib at +z: a bib with a flapped chest pocket, a wading belt at the waist,
// two tapering legs with a gap between them, and rubber boots lying on their sides at the ends, toes turned out.
// The shoulder braces run off the top of the bib and lie on the floor. Slots: body, seam, pocket, strap, metal,
// belt, boot, sole.
local waders() =
  local t = 0.03;
  [
    flat('bib', 'body', [[-0.16, 0.3], [0.16, 0.3], [0.15, 0.62], [-0.15, 0.62]], 0, t * 0.8),
    flat('hips', 'body', [[-0.21, 0.06], [0.21, 0.06], [0.2, 0.32], [-0.2, 0.32]], 0, t),
    box('bib-hem', 'seam', [-0.15, t * 0.8, 0.605], [0.15, t * 0.8 + 0.002, 0.62]),
    box('pocket', 'pocket', [-0.09, t * 0.8, 0.4], [0.09, t * 0.8 + 0.01, 0.55]),
    box('pocket-flap', 'pocket', [-0.095, t * 0.8 + 0.01, 0.51], [0.095, t * 0.8 + 0.015, 0.56]),
    box('belt', 'belt', [-0.215, t, 0.27], [0.215, t + 0.005, 0.31]),
    box('belt-buckle', 'metal', [-0.03, t + 0.005, 0.265], [0.03, t + 0.011, 0.315]),
    box('crotch', 'seam', [-0.012, t, 0.02], [0.012, t + 0.002, 0.1]),
  ] + std.flattenArrays([
    [
      // Leg: wide at the hip, narrowing to the ankle, splayed a little outward.
      flat('leg-' + s, 'body', [[sx * 0.012, 0.08], [sx * 0.21, 0.08], [sx * 0.2, -0.44], [sx * 0.05, -0.44]], 0, t),
      strip('knee-' + s, 'seam', [sx * 0.03, -0.17], [sx * 0.2, -0.17], t, 0.006, 0.002),
      // Brace: from the bib top corner over the edge and out onto the floor, ending in a buckle.
      strip('brace-bib-' + s, 'strap', [sx * 0.12, 0.52], [sx * 0.13, 0.62], t * 0.8, 0.032, 0.004),
      box('brace-drop-' + s, 'strap', [sx * 0.13 - 0.016, 0, 0.62], [sx * 0.13 + 0.016, t * 0.8 + 0.004, 0.626]),
      strip('brace-floor-' + s, 'strap', [sx * 0.13, 0.62], [sx * 0.2, 0.84], 0, 0.032, 0.004),
      box('brace-buckle-' + s, 'metal', [sx * 0.2 - 0.024, 0, 0.82], [sx * 0.2 + 0.024, 0.012, 0.86]),
      // Boot shaft round the lower leg, lying flat-ish, with a rim where the leg goes in.
      box('boot-shaft-' + s, 'boot', [sx * 0.125 - 0.075, 0, -0.62], [sx * 0.125 + 0.075, 0.08, -0.42]),
      box('boot-rim-' + s, 'sole', [sx * 0.125 - 0.078, 0, -0.44], [sx * 0.125 + 0.078, 0.084, -0.42]),
      // Foot lying on its side: sole facing -z, toe turned out along x.
      box('boot-foot-' + s, 'boot', [std.min(sx * 0.05, sx * 0.26), 0, -0.7], [std.max(sx * 0.05, sx * 0.26), 0.1, -0.6]),
      h.turned('boot-toe-' + s, 'boot', 'x', [[0, 0], [0, 0.05], [sx * 0.025, 0.045], [sx * 0.045, 0.025], [sx * 0.05, 0]], [sx * 0.26, 0.05, -0.65]),
      box('boot-sole-' + s, 'sole', [std.min(sx * 0.04, sx * 0.3), 0, -0.725], [std.max(sx * 0.04, sx * 0.3), 0.104, -0.7]),
      box('boot-heel-' + s, 'sole', [std.min(sx * 0.04, sx * 0.12), 0, -0.745], [std.max(sx * 0.04, sx * 0.12), 0.104, -0.725]),
    ]
    for s in ['l', 'r']
    for sx in [if s == 'l' then -1 else 1]
  ]);

local denim = { cloth: 'cloth-denim', band: 'cloth-denim', seam: 'plastic-charcoal', stitch: 'cloth-orange', metal: 'brass-dull', hole: 'plastic-charcoal', thread: 'cloth-cream' };
local shortsFin(c, b) = { cloth: c, band: b, seam: 'plastic-charcoal', stitch: b, metal: 'steel-bright', stripe: 'cloth-white', cord: 'cloth-white' };
local cheer = { cloth: 'cloth-red', pleat: 'cloth-crimson', band: 'cloth-red', stripe: 'cloth-white' };

[
  // An antarvasa, the monastic wrap skirt: a rectangle of saffron cotton about 2 m by 1 m, folded to 340 mm by
  // 280 mm and 30 mm tall, sewn from strips laid out like paddy fields, with its cloth belt laid across the top.
  h.compound('antarvasa', 0.45, h.foldedGarment(0.34, 0.28, 0.03, 3) + [
    box('seam-x-%d' % i, 'seam', [-0.17, 0.03, z - 0.003], [0.17, 0.033, z + 0.003])
    for i in [0, 1]
    for z in [[-0.04, 0.05][i]]
  ] + [
    box('seam-z-%d' % i, 'seam', [x - 0.003, 0.03, -0.13], [x + 0.003, 0.033, 0.14])
    for i in std.range(0, 3)
    for x in [spread(-0.12, 0.12, 4)[i]]
  ] + [
    box('border', 'seam', [-0.17, 0.03, 0.12], [0.17, 0.034, 0.14]),
    strip('belt', 'belt', [-0.15, -0.1], [0.13, -0.01], 0.034, 0.025, 0.005),
    strip('belt-end', 'belt', [0.13, -0.01], [0.09, 0.07], 0.034, 0.025, 0.005),
  ], { cloth: 'cloth-orange', seam: 'cloth-yellow', belt: 'cloth-brown' }) + { voxelGrain: 0.004 },

  // Mesh basketball shorts folded once, 360 mm by 300 mm and 30 mm tall: knee-length legs, a wide elastic
  // waistband with a white drawstring, and a white stripe down each side.
  h.compound('b_shorts', 0.31, trousers({ w: 0.36, d: 0.3, ht: 0.03, folds: 2, crotch: 0.17, band: 0.045, fly: 'none', pockets: false, loops: false, stripes: true, drawstring: true }), shortsFin('cloth-navy', 'cloth-navy')) + { voxelGrain: 0.004 },

  // Cotton breeches folded at the knee, 340 mm by 400 mm and 45 mm tall: baggy legs ending in buttoned knee bands,
  // a buttoned fly, no pockets.
  h.compound('breeches', 0.69, trousers({ w: 0.34, d: 0.4, ht: 0.045, crotch: 0.2, fly: 'buttons', pockets: false, loops: false, kneeBands: true }),
             { cloth: 'cloth-khaki', band: 'cloth-brown', seam: 'plastic-charcoal', stitch: 'cloth-brown', metal: 'brass-dull' }) + { voxelGrain: 0.004 },

  // A red pleated cheerleader skirt laid flat, 340 mm across the waist, 500 mm across the hem and 300 mm long,
  // with two white bands near the hem.
  h.compound('cheerleader_skirt', 0.2, skirt({}), cheer) + { voxelGrain: 0.004 },

  // The short cheerleader skirt laid flat: 340 mm across the waist, 440 mm across the hem and 200 mm long, one
  // white band near the hem.
  h.compound('cheerleader_skirt_short', 0.15, skirt({ wb: 0.44, len: 0.2, pleats: 9, stripes: [0.025] }), cheer) + { voxelGrain: 0.004 },

  // Chest waders laid flat on their back, 620 mm wide across the turned-out boots, 1.6 m from boot heel to brace
  // buckle and 100 mm tall: olive PVC legs with a gap between them, a bib with a flapped chest pocket, a wading belt,
  // braces lying on the floor past the bib, and black rubber boots lying on their sides.
  h.compound('fishing_waders', 2.3, waders(), {
    body: 'nylon-ranger-green',
    seam: 'plastic-charcoal',
    pocket: 'cloth-olive-drab',
    strap: 'webbing-black',
    metal: 'plastic-matte-black',
    belt: 'webbing-black',
    boot: 'rubber-black',
    sole: 'plastic-charcoal',
  }),

  // Cotton short shorts folded flat, 300 mm by 200 mm and 20 mm tall, with a zip fly and front pockets.
  h.compound('hot_pants', 0.18, trousers({ w: 0.3, d: 0.2, ht: 0.02, folds: 2, crotch: 0.12, band: 0.03 }), denim) + { voxelGrain: 0.004 },

  // Fur short shorts folded flat, 300 mm by 200 mm and 26 mm tall: the same cut in thick pale fur with a
  // leather waistband.
  h.compound('hot_pants_fur', 0.22, trousers({ w: 0.3, d: 0.2, ht: 0.026, folds: 2, crotch: 0.12, band: 0.03, pockets: false }),
             { cloth: 'fur-brown', band: 'leather-tan', seam: 'plastic-charcoal', stitch: 'leather-tan', metal: 'brass-dull' }) + { voxelGrain: 0.004 },

  // Black leather short shorts folded flat, 300 mm by 200 mm and 20 mm tall.
  h.compound('hot_pants_leather', 0.35, trousers({ w: 0.3, d: 0.2, ht: 0.02, folds: 2, crotch: 0.12, band: 0.03 }),
             { cloth: 'leather-black', band: 'leather-black', seam: 'plastic-charcoal', stitch: 'plastic-charcoal', metal: 'steel-bright' }) + { voxelGrain: 0.004 },

  // Jeans folded at the knee, 380 mm by 460 mm and 50 mm tall, both knees torn open with white threads across.
  h.compound('jeans_ripped', 0.7, trousers({ rips: true }), denim) + { voxelGrain: 0.004 },

  // Dark skinny jeans folded at the knee, 320 mm by 480 mm and 36 mm tall, front pockets only.
  h.compound('jeans_skinny', 0.77, trousers({ w: 0.32, d: 0.48, ht: 0.036, crotch: 0.17 }), denim + { cloth: 'cloth-navy', band: 'cloth-navy' }) + { voxelGrain: 0.004 },

  // Heavy faded jeans folded at the knee, 390 mm by 460 mm and 58 mm tall, with brass buttons and a wide band.
  h.compound('jeans_vintage', 0.9, trousers({ w: 0.39, ht: 0.058, band: 0.042 }), denim + { cloth: 'cloth-blue', band: 'cloth-denim' }) + { voxelGrain: 0.004 },

  // A wool kilt folded in half, 320 mm by 360 mm and 40 mm tall: green with crossing navy and red tartan strips on
  // the apron, a fringed apron edge, knife pleats over the other half, leather buckle straps and a kilt pin.
  h.compound('kilt', 0.7, kilt({ tartan: true }), {
    cloth: 'cloth-green',
    pleat: 'cloth-green',
    band: 'cloth-green',
    strap: 'leather-black',
    metal: 'steel-bright',
    fringe: 'cloth-green',
    stripe: 'cloth-navy',
    stripe2: 'cloth-red',
  }) + { voxelGrain: 0.004 },

  // A black leather kilt folded in half, 320 mm by 360 mm and 44 mm tall: stiff pleats, a plain apron edge and
  // steel buckles.
  h.compound('kilt_leather', 1.5, kilt({ ht: 0.044, fringe: false, pin: false }), {
    cloth: 'leather-black',
    pleat: 'leather-charcoal',
    band: 'leather-black',
    strap: 'leather-charcoal',
    metal: 'steel-bright',
  }) + { voxelGrain: 0.004 },

  // A khaki canvas utility kilt folded in half, 320 mm by 360 mm and 44 mm tall: pleats, belt loops and a
  // flapped cargo pocket on the apron.
  h.compound('kilt_utility', 0.77, kilt({ ht: 0.044, fringe: false, pin: false, pockets: true }), {
    cloth: 'cloth-khaki',
    pleat: 'cloth-khaki',
    band: 'cloth-khaki',
    strap: 'webbing-black',
    metal: 'steel-bright',
    pocket: 'cloth-khaki',
    flap: 'cloth-brown',
  }) + { voxelGrain: 0.004 },
]
