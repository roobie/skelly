local h = import '../compound.libsonnet';
local box = h.box;

// Legwear: trousers, shorts and skirts as found on a shelf or the floor. Folded legwear lies on h.foldedGarment,
// `w` across x and `d` along z, top face at `ht`, the waistband at +z (front) and the folded hems rolled over at
// -z. Skirts lie flat, waist at +z.

// A flat convex outline of [x, z] points lying on a top face from y to y + t.
local flat(id, slot, pts, y, t=0.004) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y, y + t);
// A strip `w` wide lying on a top face at y, from [xa, za] to [xb, zb].
local strip(id, slot, a, b, y, w=0.008, t=0.003) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  flat(id, slot, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], y, t);
local spread(a, b, n) = if n == 1 then [a] else [a + (b - a) * i / (n - 1) for i in std.range(0, n - 1)];
local sides = [['l', -1], ['r', 1]];

// Trousers or shorts folded once and laid front up: two legs split by a dark crotch line, a waistband, belt loops,
// a fly and front pocket openings. Options pick the details:
//   stripe     width of a side stripe down each outer edge (0 for none), slot stripe;
//   drawstring an elastic waist with a cord, no loops or fly, slot cord;
//   hemTrim    depth of a raised trim band across the folded hems (0 for none), slot trim;
//   fray       frayed hem threads across the folded hems, slot thread;
//   cargo      bellows pockets on each leg with flaps and press studs, slots pocket, flap;
//   knees      reinforcing patches over both knees, slot patch;
//   bands      `n` crosswise stripes over the top face and down the front of the rolled hem, slot stripe.
// Slots: cloth, band, seam, stitch, metal, and those the options name.
local trousers(o) =
  local c = {
    w: 0.38, d: 0.46, ht: 0.05, folds: 3, crotch: 0.2, band: 0.035,
    fly: true, pockets: true, loops: true, stripe: 0, drawstring: false, hemTrim: 0, fray: false,
    cargo: false, knees: false, bands: 0, hammerLoop: false,
  } + o;
  local w = c.w, d = c.d, ht = c.ht, top = d / 2, band = c.band, bot = -d / 2;
  h.foldedGarment(w, d, ht, c.folds)
  + [
    box('waistband', 'band', [-w / 2, ht, top - band], [w / 2, ht + 0.005, top]),
    box('crotch', 'seam', [-0.005, ht, bot + 0.004], [0.005, ht + 0.003, top - c.crotch]),
  ]
  + (if c.loops && !c.drawstring then [
       box('loop-%d' % i, 'band', [x - 0.006, ht + 0.005, top - band - 0.004], [x + 0.006, ht + 0.008, top + 0.001])
       for i in std.range(0, 3)
       for x in [[-w / 2 + 0.03, -0.07, 0.07, w / 2 - 0.03][i]]
     ] else [])
  + (if c.fly && !c.drawstring then [
       strip('fly', 'stitch', [0.02, top - band], [0.02, top - c.crotch + 0.04], ht, 0.004),
       strip('fly-curve', 'stitch', [0.02, top - c.crotch + 0.04], [0.004, top - c.crotch + 0.015], ht, 0.004),
       h.disc('button', 'metal', 0.008, ht + 0.005, ht + 0.009, 0, top - band / 2),
     ] else [])
  + (if c.pockets then [
       strip('pocket-' + s[0], 'stitch', [s[1] * (w / 2 - 0.1), top - band], [s[1] * w / 2, top - band - 0.09], ht, 0.005)
       for s in sides
     ] else [])
  + (if c.stripe > 0 then [
       box('stripe-' + s[0], 'stripe', [if s[1] < 0 then -w / 2 else w / 2 - c.stripe, ht, bot + 0.004], [if s[1] < 0 then -w / 2 + c.stripe else w / 2, ht + 0.003, top - band])
       for s in sides
     ] else [])
  + (if c.drawstring then [
       strip('cord-l', 'cord', [-0.012, top - band / 2], [-0.03, top - band - 0.09], ht + 0.005, 0.006, 0.005),
       strip('cord-r', 'cord', [0.012, top - band / 2], [0.035, top - band - 0.085], ht + 0.005, 0.006, 0.005),
       box('eyelets', 'metal', [-0.016, ht + 0.005, top - band / 2 - 0.004], [0.016, ht + 0.007, top - band / 2 + 0.004]),
     ] else [])
  // The trim wraps the rolled hem: a band on the top face and a front face down the roll.
  + (if c.hemTrim > 0 then [
       box('hem-trim-top', 'trim', [-w / 2 - 0.003, ht, bot - 0.003], [w / 2 + 0.003, ht + 0.008, bot + c.hemTrim]),
       box('hem-trim-front', 'trim', [-w / 2 - 0.003, 0, bot - 0.006], [w / 2 + 0.003, ht + 0.008, bot + 0.004]),
       box('hem-split', 'seam', [-0.004, ht + 0.008, bot - 0.003], [0.004, ht + 0.01, bot + c.hemTrim]),
     ] else [])
  + (if c.fray then [
       box('fray-%d' % i, 'thread', [x - 0.0025, ht - 0.006, bot - 0.012], [x + 0.0025, ht + 0.002, bot + 0.012])
       for i in std.range(0, 17)
       for x in [spread(-w / 2 + 0.01, w / 2 - 0.01, 18)[i]]
       if std.abs(x) > 0.012
     ] else [])
  + (if c.cargo then std.flattenArrays([
       local x = s[1] * (w / 4 + 0.01);
       [
         box('cargo-' + s[0], 'pocket', [x - 0.055, ht, bot + 0.03], [x + 0.055, ht + 0.014, bot + 0.15]),
         box('cargo-flap-' + s[0], 'flap', [x - 0.058, ht + 0.014, bot + 0.12], [x + 0.058, ht + 0.018, bot + 0.156]),
         h.disc('cargo-stud-' + s[0], 'metal', 0.005, ht + 0.018, ht + 0.021, x, bot + 0.132),
       ]
       for s in sides
     ]) else [])
  + (if c.knees then [
       box('knee-' + s[0], 'patch', [s[1] * w / 4 - 0.065, ht, -0.07], [s[1] * w / 4 + 0.065, ht + 0.005, 0.04])
       for s in sides
     ] + [
       box('knee-stitch-%s-%d' % [s[0], k], 'seam', [s[1] * w / 4 - 0.06, ht + 0.005, z - 0.0015], [s[1] * w / 4 + 0.06, ht + 0.0065, z + 0.0015])
       for s in sides
       for k in [0, 1]
       for z in [[-0.062, 0.032][k]]
     ] else [])
  + (if c.hammerLoop then [
       box('hammer-loop', 'band', [w / 2 - 0.04, ht + 0.003, -0.02], [w / 2 + 0.008, ht + 0.009, 0.0]),
       box('rule-pocket', 'pocket', [w / 2 - 0.05, ht, 0.02], [w / 2 - 0.005, ht + 0.008, 0.12]),
     ] else [])
  + (if c.bands > 0 then std.flattenArrays([
       local z = spread(bot + 0.02, top - band - 0.02, c.bands)[i];
       [box('band-%d' % i, 'stripe', [-w / 2, ht, z - 0.012], [w / 2, ht + 0.0025, z + 0.012])]
       for i in std.range(0, c.bands - 1)
     ]) + [
       box('band-front-%d' % k, 'stripe', [-w / 2, k * ht / c.folds + ht / c.folds * 0.3, bot - 0.002], [w / 2, k * ht / c.folds + ht / c.folds * 0.7, bot + 0.004])
       for k in std.range(0, c.folds - 1)
     ] else []);

// A skirt laid flat, waist at +z: a trapezoid of doubled cloth `wt` wide at the waist and `wb` at the hem, `len`
// long, with `pleats` ridges fanning from waist to hem, a waistband and bands near the hem at `stripes` (distances
// from the hem). Options: `seam` adds a front centre seam with top-stitching, slot stitch; `fly` a zip from the
// waist, slot metal; `pocket` a small patch pocket on the right hip, slot pocket; `slit` a dark slit up from the hem.
// Slots: cloth, pleat, band, stripe and those the options name.
local skirt(o) =
  local c = {
    wt: 0.34, wb: 0.5, len: 0.3, t: 0.012, pleats: 0, stripes: [], band: 0.03,
    seam: false, fly: false, pocket: false, slit: false, buttons: 0,
  } + o;
  local z1 = c.len / 2, z0 = -c.len / 2, top = c.t + 0.004;
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
  ]
  + (if c.seam then [
       strip('seam', 'stitch', [0, z1 - c.band], [0, z0 + 0.004], c.t, 0.004),
       strip('hem-stitch', 'stitch', [-halfAt(z0 + 0.012) + 0.006, z0 + 0.012], [halfAt(z0 + 0.012) - 0.006, z0 + 0.012], c.t, 0.004),
     ] else [])
  + (if c.fly then [
       strip('fly', 'stitch', [0.016, z1 - c.band], [0.016, z1 - c.band - 0.1], c.t, 0.004),
       strip('fly-curve', 'stitch', [0.016, z1 - c.band - 0.1], [0.002, z1 - c.band - 0.12], c.t, 0.004),
       h.disc('button', 'metal', 0.008, top, top + 0.004, 0, z1 - c.band / 2),
     ] else [])
  + [
    h.disc('button-%d' % i, 'metal', 0.006, c.t, c.t + 0.004, 0.0, z)
    for i in std.range(0, c.buttons - 1)
    for z in [spread(z1 - c.band - 0.03, z0 + 0.05, c.buttons)[i]]
  ]
  + (if c.pocket then [
       box('pocket', 'pocket', [c.wt / 2 - 0.1, c.t, z1 - c.band - 0.1], [c.wt / 2 - 0.03, c.t + 0.004, z1 - c.band - 0.02]),
     ] else [])
  + (if c.slit then [
       flat('slit', 'seam', [[0.06, z0], [0.07, z0], [0.067, z0 + 0.1], [0.063, z0 + 0.1]], c.t, 0.002),
     ] else []);

// A grass skirt laid flat, waist at +z: a twisted cord along the waist no wider than the skirt, its tie ends lying
// down along the sides, and a dense fringe of dried grass blades in two overlapping layers flat on the floor, hanging
// from it to a ragged hem and fanning out a little. Slots: cord, grass, grass2.
local grassSkirt(w, len, n) =
  local z1 = len / 2, z0 = -len / 2;
  [
    h.rod('cord', 'cord', 0.006, -w / 2, w / 2, 0.006) + { origin: [-w / 2, 0.006, z1 - 0.008] },
    strip('tie-l', 'cord', [-w / 2 + 0.004, z1 - 0.01], [-w / 2 - 0.03, z1 - 0.12], 0, 0.008, 0.006),
    strip('tie-r', 'cord', [w / 2 - 0.004, z1 - 0.01], [w / 2 + 0.03, z1 - 0.13], 0, 0.008, 0.006),
  ] + [
    local f = i / (n - 1) - 0.5, ragged = [0, 0.03, 0.012, 0.045, 0.02, 0.008, 0.036][i % 7];
    strip('blade-%d' % i, if i % 3 == 1 then 'grass2' else 'grass', [f * (w - 0.012), z1 - 0.01], [f * (w - 0.012) * 1.25, z0 + ragged], (i % 2) * 0.003, 0.012, 0.003)
    for i in std.range(0, n - 1)
  ];

[
  // Navy police breeches folded at the knee, 360 mm by 460 mm and 46 mm tall: belt loops, a zip fly, front pocket
  // openings and a narrow gold stripe down each outer seam.
  h.compound('police_breeches', 1.1, trousers({ w: 0.36, ht: 0.046, stripe: 0.012 }), {
    cloth: 'cloth-navy',
    band: 'cloth-navy',
    seam: 'plastic-charcoal',
    stitch: 'cloth-charcoal',
    metal: 'steel-bright',
    stripe: 'cloth-saffron',
  }) + { voxelGrain: 0.004 },

  // Navy mail carrier shorts folded once, 360 mm by 280 mm and 30 mm tall: belt loops, zip fly, front pockets and
  // a thin red stripe down each side.
  h.compound('postman_shorts', 0.43, trousers({ w: 0.36, d: 0.28, ht: 0.03, folds: 2, crotch: 0.16, stripe: 0.01 }), {
    cloth: 'cloth-navy',
    band: 'cloth-navy',
    seam: 'plastic-charcoal',
    stitch: 'cloth-charcoal',
    metal: 'steel-bright',
    stripe: 'cloth-red',
  }) + { voxelGrain: 0.004 },

  // Red costume trousers folded at the knee, 400 mm by 460 mm and 60 mm tall: an elastic drawstring waist, two
  // deep front pockets and thick white faux-fur cuffs wrapped round the folded hems.
  h.compound('santa_pants', 1.6, trousers({ w: 0.4, ht: 0.06, drawstring: true, hemTrim: 0.05, band: 0.045 }), {
    cloth: 'cloth-red',
    band: 'cloth-red',
    seam: 'cloth-crimson',
    stitch: 'cloth-crimson',
    metal: 'cloth-crimson',
    cord: 'cloth-cream',
    trim: 'fur-pale',
  }) + { voxelGrain: 0.004 },

  // Red costume shorts folded once, 360 mm by 260 mm and 28 mm tall: a drawstring waist and narrow white cuffs.
  h.compound('santa_shorts', 0.42, trousers({ w: 0.36, d: 0.26, ht: 0.028, folds: 2, crotch: 0.15, drawstring: true, pockets: false, hemTrim: 0.025 }), {
    cloth: 'cloth-red',
    band: 'cloth-red',
    seam: 'cloth-crimson',
    stitch: 'cloth-crimson',
    metal: 'cloth-crimson',
    cord: 'cloth-cream',
    trim: 'cloth-cream',
  }) + { voxelGrain: 0.004 },

  // Plain khaki shorts folded once, 360 mm by 280 mm and 28 mm tall: belt loops, zip fly and front pockets.
  h.compound('shorts', 0.4, trousers({ w: 0.36, d: 0.28, ht: 0.028, folds: 2, crotch: 0.16 }), {
    cloth: 'cloth-khaki',
    band: 'cloth-khaki',
    seam: 'cloth-brown',
    stitch: 'cloth-brown',
    metal: 'brass-dull',
  }) + { voxelGrain: 0.004 },

  // Olive cargo shorts folded once, 380 mm by 340 mm and 34 mm tall: a flapped bellows pocket on each leg.
  h.compound('shorts_cargo', 0.4, trousers({ w: 0.38, d: 0.34, ht: 0.034, folds: 2, crotch: 0.17, cargo: true }), {
    cloth: 'cloth-olive-drab',
    band: 'cloth-olive-drab',
    seam: 'plastic-charcoal',
    stitch: 'webbing-olive-dark',
    metal: 'plastic-matte-black',
    pocket: 'cloth-olive-drab',
    flap: 'webbing-olive-dark',
  }) + { voxelGrain: 0.004 },

  // Cut-off denim shorts folded once, 370 mm by 260 mm and 30 mm tall: orange top-stitching, a brass button and
  // white threads frayed out of the cut hems.
  h.compound('shorts_denim', 0.41, trousers({ w: 0.37, d: 0.26, ht: 0.03, folds: 2, crotch: 0.15, fray: true }), {
    cloth: 'cloth-denim',
    band: 'cloth-denim',
    seam: 'plastic-charcoal',
    stitch: 'cloth-orange',
    metal: 'brass-dull',
    thread: 'cloth-cream',
  }) + { voxelGrain: 0.004 },

  // A short cotton skirt laid flat, 340 mm across the waist, 440 mm across the hem and 260 mm long: a few soft
  // gathers and one small patch pocket on the hip.
  h.compound('skirt', 0.19, skirt({ wb: 0.44, len: 0.26, pleats: 5, pocket: true }), {
    cloth: 'cloth-green',
    pleat: 'leaf-green',
    band: 'cloth-green',
    pocket: 'leaf-green',
  }) + { voxelGrain: 0.004 },

  // A costume schoolgirl skirt laid flat, 340 mm across the waist, 480 mm across the hem and 260 mm long: navy
  // knife pleats all round and two white bands near the hem.
  h.compound('skirt_bostonchan', 0.21, skirt({ wb: 0.48, len: 0.26, pleats: 13, stripes: [0.025, 0.045] }), {
    cloth: 'cloth-navy',
    pleat: 'cloth-charcoal',
    band: 'cloth-navy',
    stripe: 'cloth-cream',
  }) + { voxelGrain: 0.004 },

  // A denim skirt laid flat, 340 mm across the waist, 420 mm across the hem and 400 mm long: an orange-stitched
  // front seam and hem, a zip fly with a brass button and a patch pocket.
  h.compound('skirt_denim', 0.27, skirt({ wb: 0.42, len: 0.4, seam: true, fly: true, pocket: true }), {
    cloth: 'cloth-denim',
    band: 'cloth-denim',
    stitch: 'cloth-orange',
    metal: 'brass-dull',
    pocket: 'cloth-denim-faded',
  }) + { voxelGrain: 0.004 },

  // A grass skirt laid flat, 360 mm across the waist and 400 mm long: a twisted cord with its tie ends lying down
  // the sides and a dense, overlapping fringe of dried grass blades with a ragged hem.
  h.compound('skirt_grass', 0.25, grassSkirt(0.36, 0.4, 55), {
    cord: 'straw-rope',
    grass: 'plant-dried',
    grass2: 'straw-wicker',
  }) + { voxelGrain: 0.004 },

  // A black leather miniskirt laid flat, 320 mm across the waist, 380 mm across the hem and 220 mm long: a zip
  // fly, a centre seam and a short slit up from the hem.
  h.compound('skirt_leather', 0.19, skirt({ wt: 0.32, wb: 0.38, len: 0.22, t: 0.008, seam: true, fly: true, slit: true }), {
    cloth: 'leather-black',
    band: 'leather-black',
    stitch: 'leather-charcoal',
    metal: 'steel-bright',
    seam: 'plastic-charcoal',
  }) + { voxelGrain: 0.004 },

  // An ankle-length cotton skirt, 800 mm long, folded in half at the knee and laid flat: 340 mm across the waist,
  // 520 mm across the fold and 420 mm long, soft gathers running down to the fold and the trim band of the hem
  // showing where it is folded back.
  h.compound('skirt_long', 0.64, skirt({ wb: 0.52, len: 0.42, t: 0.024, pleats: 9, stripes: [0.03], band: 0.04 }), {
    cloth: 'cloth-brown',
    pleat: 'suede-brown',
    band: 'cloth-brown',
    stripe: 'cloth-cream',
  }) + { voxelGrain: 0.004 },

  // Cotton trousers with broad black and white crosswise stripes, folded at the knee, 380 mm by 460 mm and 48 mm
  // tall, the stripes running over the top and round the rolled hems.
  h.compound('striped_pants', 0.5, trousers({ ht: 0.048, bands: 9, pockets: false }), {
    cloth: 'cloth-cream',
    band: 'cloth-black',
    seam: 'plastic-charcoal',
    stitch: 'cloth-charcoal',
    metal: 'steel-bright',
    stripe: 'cloth-black',
  }) + { voxelGrain: 0.004 },

  // Grey canvas work trousers folded at the knee, 400 mm by 460 mm and 60 mm tall: double-layer knee patches, a
  // hammer loop and a rule pocket on the right leg, belt loops and a zip fly.
  h.compound('technician_pants_gray', 1.6, trousers({ w: 0.4, ht: 0.06, knees: true, hammerLoop: true }), {
    cloth: 'wool-grey',
    band: 'wool-grey',
    seam: 'plastic-charcoal',
    stitch: 'plastic-charcoal',
    metal: 'steel-bright',
    patch: 'cloth-charcoal',
    pocket: 'cloth-charcoal',
  }) + { voxelGrain: 0.004 },
]
