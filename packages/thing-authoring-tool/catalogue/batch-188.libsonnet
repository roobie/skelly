local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;

// Undergarments as found on a shelf: wraps, corsets, garter belts and leg warmers laid flat, outside up, top at +z;
// long underwear folded, neck or waistband at +z.

// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);
// A flat convex outline of [x, z] points lying on a top face from y to y + t.
local flat(id, slot, pts, y, t=0.004) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y, y + t);
// A strip `w` wide lying on a top face at y, from [xa, za] to [xb, zb].
local strip(id, slot, a, b, y, w=0.012, t=0.004) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  flat(id, slot, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], y, t);
// A string through the points of `pts`, as strips from each point to the next.
local cord(prefix, slot, pts, y, w=0.006, t=0.003) = [
  strip('%s-%d' % [prefix, i], slot, pts[i], pts[i + 1], y, w, t)
  for i in std.range(0, std.length(pts) - 2)
];
// A tied bow at [x, z]: a knot and two loops either side of it along x.
local bow(prefix, slot, x, z, y, s=0.012, t=0.004) = [
  flat(prefix + '-loop-a', slot, [[x - 0.003, z], [x - s, z - s * 0.6], [x - s, z + s * 0.6]], y, t),
  flat(prefix + '-loop-b', slot, [[x + 0.003, z], [x + s, z - s * 0.6], [x + s, z + s * 0.6]], y, t),
  box(prefix + '-knot', slot, [x - 0.004, y, z - 0.004], [x + 0.004, y + t + 0.002, z + 0.004]),
];
local spread(a, b, n) = if n == 1 then [a] else [a + (b - a) * i / (n - 1) for i in std.range(0, n - 1)];

// A chest wrap half rolled up, as batch 187's wraps are: a roll `w` wide and `r` in radius lying across x at -z, its
// loose end `tail` long and `t` thick running out to +z with stitched patches on it as [x, z, w, l], and two tie
// thongs from the end, splayed apart. Slots: cloth, layer, patch, seam, tie.
local chestwrap(w, r, tail, t, patches) =
  local z0 = -tail / 2, z1 = z0 + tail;
  [
    h.turned('roll', 'cloth', 'x', [[0, 0], [0, r], [w, r], [w, 0]], [-w / 2, r, z0]),
    box('end', 'cloth', [-w / 2, 0, z0], [w / 2, t, z1]),
  ]
  // The turns of the roll showing at each end.
  + [
    h.tube('turn-%d-%d' % [s + 1, i], 'layer', r * f - 0.003, r * f, if s < 0 then -w / 2 - 0.002 else w / 2, if s < 0 then -w / 2 else w / 2 + 0.002, r, z0)
    for s in [-1, 1]
    for i in [0, 1, 2]
    for f in [[0.35, 0.62, 0.9][i]]
  ]
  + std.flattenArrays([
    local p = patches[n], x = p[0], z = p[1], pw = p[2], pl = p[3];
    [box('patch-%d' % n, 'patch', [x - pw / 2, t, z - pl / 2], [x + pw / 2, t + 0.002, z + pl / 2])]
    + [
      box('seam-%d-%d' % [n, k], 'seam', [x - pw / 2 + 0.004, t + 0.002, zz - 0.001], [x + pw / 2 - 0.004, t + 0.003, zz + 0.001])
      for k in [0, 1]
      for zz in [[z - pl / 2 + 0.005, z + pl / 2 - 0.005][k]]
    ]
    for n in std.range(0, std.length(patches) - 1)
  ])
  + std.flattenArrays([
    cord('tie-%d' % (s + 1), 'tie', [[s * w * 0.3, z1 - 0.01], [s * w * 0.36, z1 + 0.07], [s * w * 0.5, z1 + 0.12]], t, 0.012, 0.003)
    for s in [-1, 1]
  ]);

// A corset laid flat, back up, top at +z: two halves of boned leather `t` thick, an hourglass `ht` tall whose half
// widths at the hem, waist and top are `hw`, the waist `waistZ` above the hem. The back edges are `gap` apart over a
// darker modesty panel, laced through grommets in crossing laces, tied in a bow at the waist with tails `tail` long.
// Slots: cloth, bone, binding, grommet, lace, panel.
local corset(ht, hw, waistZ, gap, tail, t=0.012) =
  local z0 = -ht / 2, z1 = ht / 2, zw = z0 + waistZ;
  local width(z) = if z < zw then hw[1] + (hw[0] - hw[1]) * std.pow((zw - z) / (zw - z0), 1.6) else hw[1] + (hw[2] - hw[1]) * std.pow((z - zw) / (z1 - zw), 1.6);
  local zs = [z0 + (zw - z0) * i / 4 for i in [0, 1, 2, 3]] + [zw + (z1 - zw) * i / 5 for i in [0, 1, 2, 3, 4, 5]];
  local eyes = spread(z0 + 0.02, z1 - 0.02, std.floor((ht - 0.04) / 0.024) + 1);
  local ex = gap / 2 + 0.008;
  std.flattenArrays([
    [
      flat('half-%d-%d' % [s + 1, i], 'cloth', [[s * gap / 2, zs[i]], [s * width(zs[i]), zs[i]], [s * width(zs[i + 1]), zs[i + 1]], [s * gap / 2, zs[i + 1]]], 0, t)
      for i in std.range(0, std.length(zs) - 2)
    ]
    + [
      sbox('bone-%d-%d' % [s + 1, j], 'bone', [s * x - 0.003, t, z0 + 0.012], [s * x + 0.003, t + 0.003, z1 - 0.012])
      for j in [0, 1, 2]
      for x in [[gap / 2 + 0.035, gap / 2 + 0.075, gap / 2 + 0.115][j]]
    ]
    + [
      sbox('lace-panel-%d' % (s + 1), 'binding', [s * gap / 2, t, z0], [s * (gap / 2 + 0.016), t + 0.002, z1]),
    ]
    + [
      h.disc('grommet-%d-%d' % [s + 1, i], 'grommet', 0.0035, t + 0.002, t + 0.004, s * ex, eyes[i])
      for i in std.range(0, std.length(eyes) - 1)
    ]
    for s in [-1, 1]
  ])
  + [
    flat('hem-binding-%d' % (s + 1), 'binding', [[s * gap / 2, z0], [s * hw[0], z0], [s * hw[0], z0 + 0.008], [s * gap / 2, z0 + 0.008]], t, 0.002)
    for s in [-1, 1]
  ]
  + [
    flat('top-binding-%d' % (s + 1), 'binding', [[s * gap / 2, z1 - 0.008], [s * hw[2], z1 - 0.008], [s * hw[2], z1], [s * gap / 2, z1]], t, 0.002)
    for s in [-1, 1]
  ]
  + (if gap > 0.012 then [box('modesty', 'panel', [-gap / 2 - 0.005, t / 2 - 0.002, z0 + 0.004], [gap / 2 + 0.005, t / 2, z1 - 0.004])] else [])
  // Crossing laces between successive grommet pairs.
  + std.flattenArrays([
    [strip('lace-%d' % i, 'lace', [-ex, eyes[i]], [ex, eyes[i + 1]], t + 0.004, 0.004, 0.002)]
    + [strip('lace-x-%d' % i, 'lace', [ex, eyes[i]], [-ex, eyes[i + 1]], t + 0.006, 0.004, 0.002)]
    for i in std.range(0, std.length(eyes) - 2)
  ])
  + bow('bow', 'lace', 0, zw, t + 0.008, 0.016)
  + cord('tail-l', 'lace', [[-0.004, zw - 0.004], [-0.012, zw - tail * 0.6], [-0.03, zw - tail]], t + 0.008, 0.005, 0.002)
  + cord('tail-r', 'lace', [[0.004, zw - 0.004], [0.016, zw - tail * 0.55], [0.03, zw - tail * 0.95]], t + 0.008, 0.005, 0.002);

// A knit tube flattened on a shelf, `w` across, `t` thick and `l` long along z, centred on x: cuffs ribbed at both
// ends and gathers across the slouched middle. Slots: cloth, cuff, rib.
local knitTube(p, x, w, t, l, cuff=0.04, gathers=5) =
  [
    box(p + 'tube', 'cloth', [x - w / 2, 0, -l / 2 + cuff], [x + w / 2, t, l / 2 - cuff]),
    box(p + 'cuff-lo', 'cuff', [x - w / 2 - 0.003, 0, -l / 2], [x + w / 2 + 0.003, t + 0.002, -l / 2 + cuff]),
    box(p + 'cuff-hi', 'cuff', [x - w / 2 - 0.003, 0, l / 2 - cuff], [x + w / 2 + 0.003, t + 0.002, l / 2]),
  ]
  + [
    box(p + 'rib-%d-%d' % [e, i], 'rib', [rx - 0.002, t + 0.002, (if e == 0 then -l / 2 else l / 2 - cuff) + 0.003], [rx + 0.002, t + 0.004, (if e == 0 then -l / 2 + cuff else l / 2) - 0.003])
    for e in [0, 1]
    for i in std.range(0, std.floor(w / 0.012) - 1)
    for rx in [x - w / 2 + 0.006 + i * 0.012]
  ]
  + [
    box(p + 'gather-%d' % i, 'cloth', [x - w / 2 - 0.002, t, z - 0.005], [x + w / 2 + 0.002, t + 0.004, z + 0.005])
    for i in std.range(0, gathers - 1)
    for z in [-l / 2 + cuff + (l - 2 * cuff) * (i + 0.5) / gathers]
  ];

// A shaggy fur sleeve laid flat, `w0` across at the foot end (-z) and `w1` at the top, `t` thick and `l` long, with
// broad low mounds of pile over its face and rawhide ties wrapped flat round it at each z in `ties`,
// down both sides to the floor, their ends lying on the floor out to +x. Slots: fur, tuft, tie.
local furSleeve(p, x, w0, w1, t, l, ties) =
  local wAt(z) = w0 + (w1 - w0) * (z + l / 2) / l;
  [flat(p + 'body', 'fur', [[x - w0 / 2, -l / 2], [x + w0 / 2, -l / 2], [x + w1 / 2, l / 2], [x - w1 / 2, l / 2]], 0, t)]
  // Pile: broad, low overlapping mounds of fur over the face, three across, staggered down the sleeve and kept
  // inside its outline.
  + [
    local wz = wAt(zz), r = std.min(w0, w1) * 0.2;
    h.ball(p + 'pile-%d-%d' % [zi, xi], 'tuft', r, x + (xi - 1) * wz * 0.3 + 0.008 * (zi % 2 * 2 - 1), t, zz, 0.15, 8)
    for zi in std.range(0, std.floor((l - 0.07) / 0.035))
    for xi in [0, 1, 2]
    for zz in [-l / 2 + 0.035 + zi * 0.035]
  ]
  + std.flattenArrays([
    local wz = wAt(ties[i]);
    [
      box(p + 'tie-%d' % i, 'tie', [x - wz / 2 - 0.004, t, ties[i] - 0.005], [x + wz / 2 + 0.004, t + 0.006, ties[i] + 0.005]),
      box(p + 'tie-side-l-%d' % i, 'tie', [x - wz / 2 - 0.004, 0, ties[i] - 0.005], [x - wz / 2, t, ties[i] + 0.005]),
      box(p + 'tie-side-r-%d' % i, 'tie', [x + wz / 2, 0, ties[i] - 0.005], [x + wz / 2 + 0.004, t, ties[i] + 0.005]),
    ]
    + cord(p + 'tie-end-%d' % i, 'tie', [[x + wz / 2 + 0.002, ties[i]], [x + wz / 2 + 0.03, ties[i] - 0.015], [x + wz / 2 + 0.04, ties[i] - 0.04]], 0, 0.006, 0.003)
    for i in std.range(0, std.length(ties) - 1)
  ]);

[
  // A leather chest wrap half rolled, 150 mm wide: a roll 90 mm across, its 280 mm loose end of stitched-on leather
  // patches, and two thong ties from the end.
  h.compound('chestwrap_leather', 0.47, chestwrap(0.15, 0.045, 0.28, 0.006, [[-0.035, 0.0, 0.06, 0.07], [0.035, 0.08, 0.06, 0.06]]),
             { cloth: 'leather-tan', layer: 'leather-chestnut', patch: 'leather-chestnut', seam: 'cord-cotton', tie: 'skin-rawhide' })
  + { voxelGrain: 0.004 },

  // A leather corset laid flat, back up, 470 mm across the flattened top and 360 mm tall: boned black leather from
  // the bust down over the hips, laced tight up the back through steel grommets and tied at the waist.
  h.compound('corset', 0.74, corset(0.36, [0.225, 0.18, 0.215], 0.15, 0.004, 0.08), { cloth: 'leather-black', bone: 'leather-charcoal', binding: 'leather-charcoal', grommet: 'steel-bright', lace: 'silk-cord-crimson', panel: 'leather-charcoal' })
  + { voxelGrain: 0.004 },

  // The same corset with its back lacing let out: the halves 60 mm apart over the modesty panel and long lace tails.
  h.compound('corset_loose', 0.67, corset(0.36, [0.225, 0.18, 0.215], 0.15, 0.06, 0.16), { cloth: 'leather-black', bone: 'leather-charcoal', binding: 'leather-charcoal', grommet: 'steel-bright', lace: 'silk-cord-crimson', panel: 'leather-charcoal' })
  + { voxelGrain: 0.004 },
  // A leather waist corset laid flat, back up, 420 mm across the flattened hem and 240 mm tall: boned black leather
  // from under the bust to the hips, laced tight up the back and tied at the waist.
  h.compound('corset_waist', 0.4, corset(0.24, [0.21, 0.175, 0.195], 0.11, 0.004, 0.07, 0.01), { cloth: 'leather-black', bone: 'leather-charcoal', binding: 'leather-charcoal', grommet: 'steel-bright', lace: 'silk-cord-crimson', panel: 'leather-charcoal' })
  + { voxelGrain: 0.004 },

  // The same waist corset with its lacing let out: the halves 50 mm apart over the modesty panel and long lace tails.
  h.compound('corset_waist_loose', 0.37, corset(0.24, [0.21, 0.175, 0.195], 0.11, 0.05, 0.14, 0.01), { cloth: 'leather-black', bone: 'leather-charcoal', binding: 'leather-charcoal', grommet: 'steel-bright', lace: 'silk-cord-crimson', panel: 'leather-charcoal' })
  + { voxelGrain: 0.004 },

  // A cotton garter belt laid flat, 320 mm across and 280 mm long with its straps: a shaped black waistband with lace
  // along both edges and a small bow at the front, hook-and-eye ends, and four elastic suspender straps with steel
  // sliders and clips with rubber buttons.
  h.compound('garter_belt', 0.097,
             [
               flat('band-%d' % (s + 1), 'cloth', [[0, 0.04], [s * 0.15, 0.06], [s * 0.15, -0.0], [0, -0.03]], 0, 0.003)
               for s in [-1, 1]
             ]
             + [
               strip('lace-top-%d' % (s + 1), 'lace', [0, 0.046], [s * 0.15, 0.066], 0, 0.014, 0.002)
               for s in [-1, 1]
             ]
             + [
               strip('lace-hem-%d' % (s + 1), 'lace', [0, -0.036], [s * 0.15, -0.006], 0, 0.014, 0.002)
               for s in [-1, 1]
             ]
             + [sbox('hooks-%d' % (s + 1), 'clip', [s * 0.15, 0.003, -0.002], [s * 0.142, 0.005, 0.058]) for s in [-1, 1]]
             + bow('bow', 'trim', 0, 0.035, 0.003, 0.01)
             + std.flattenArrays([
               local top = [x, -0.03 + std.abs(x) * 0.18], foot = [x * 1.15, -0.22];
               [strip('strap-%d' % i, 'strap', top, foot, 0.001, 0.012, 0.002)]
               + [sbox('slider-%d' % i, 'clip', [x * 1.08 - 0.008, 0.003, -0.13], [x * 1.08 + 0.008, 0.006, -0.12])]
               + [sbox('clip-%d' % i, 'clip', [x * 1.15 - 0.007, 0.001, -0.245], [x * 1.15 + 0.007, 0.005, -0.215])]
               + [h.disc('button-%d' % i, 'trim', 0.004, 0.005, 0.007, x * 1.15, -0.236)]
               for i in [0, 1, 2, 3]
               for x in [[-0.12, -0.05, 0.05, 0.12][i]]
             ]),
             { cloth: 'cloth-black', lace: 'mesh-black', strap: 'cloth-black', clip: 'steel-bright', trim: 'petal-pink' })
  + { voxelGrain: 0.002 },

  // A pair of knit cotton leg warmers laid flat side by side, 280 mm across and 420 mm long: slouchy tubes 110 mm
  // across with ribbed cuffs at both ends and two stripes round each.
  h.compound('leg_warmers', 0.15,
             std.flattenArrays([
               knitTube('%s-' % n, x, 0.11, 0.012, 0.42)
               + [box('%s-stripe-%d' % [n, i], 'stripe', [x - 0.057, 0.012, z - 0.012], [x + 0.057, 0.0145, z + 0.012]) for i in [0, 1] for z in [[0.1, -0.1][i]]]
               for n in ['l', 'r']
               for x in [if n == 'l' then -0.065 else 0.065]
             ]),
             { cloth: 'petal-pink', cuff: 'petal-pink', rib: 'cloth-crimson', stripe: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A pair of fur leggings laid flat side by side, 400 mm across with their ties and 440 mm long: shaggy sleeves of
  // fur-on hide 160 mm across at the top narrowing to 130 mm at the ankle, each tied on with three rawhide thongs.
  h.compound('leg_warmers_f', 0.72,
             std.flattenArrays([
               furSleeve('%s-' % n, x, 0.13, 0.16, 0.03, 0.44, [-0.17, 0.0, 0.17])
               for n in ['l', 'r']
               for x in [if n == 'l' then -0.1 else 0.1]
             ]),
             { fur: 'fur-brown', tuft: 'fur-brown', tie: 'skin-rawhide' })
  + { voxelGrain: 0.004 },

  // A pair of fur cuffs for hooves laid flat side by side, 440 mm across with their ties and 220 mm long: short
  // shaggy sleeves of fur-on hide that flare from 140 mm at the top to 190 mm round the hoof, tied on above the
  // fetlock with a rawhide thong.
  h.compound('leg_warmers_xlf', 0.45,
             std.flattenArrays([
               furSleeve('%s-' % n, x, 0.19, 0.14, 0.035, 0.22, [0.07])
               for n in ['l', 'r']
               for x in [if n == 'l' then -0.13 else 0.13]
             ]),
             { fur: 'fur-pale', tuft: 'fur-pale', tie: 'skin-rawhide' })
  + { voxelGrain: 0.004 },

  // Cotton long underwear bottoms folded on a shelf, 280 mm by 300 mm and 36 mm tall, waistband at +z: waffle knit
  // with a covered elastic waistband, a fly seam down the front and the ribbed ankle cuffs folded up over the top.
  local w = 0.28, d = 0.3, ht = 0.036;
  h.compound('long_underpants', 0.25,
             h.foldedGarment(w, d, ht, 3)
             + g.quilt({ style: 'lattice', x0: -w / 2 + 0.01, x1: w / 2 - 0.01, z0: -d / 2 + 0.01, z1: d / 2 - 0.05, y: ht, pitch: 0.03, w: 0.003, t: 0.002 })
             + [
               box('waistband', 'band', [-w / 2, ht, d / 2 - 0.04], [w / 2, ht + 0.006, d / 2]),
               box('fly', 'seam', [-0.012, ht + 0.002, d / 2 - 0.15], [0.012, ht + 0.004, d / 2 - 0.04]),
             ]
             + std.flattenArrays([
               [box('cuff-%d' % (s + 1), 'cuff', [s * 0.07 - 0.045, ht + 0.002, -d / 2 + 0.01], [s * 0.07 + 0.045, ht + 0.008, -d / 2 + 0.06])]
               + [box('cuff-rib-%d-%d' % [s + 1, i], 'seam', [s * 0.07 - 0.04 + i * 0.01 - 0.0015, ht + 0.008, -d / 2 + 0.014], [s * 0.07 - 0.04 + i * 0.01 + 0.0015, ht + 0.009, -d / 2 + 0.056]) for i in std.range(0, 8)]
               for s in [-1, 1]
             ]),
             { cloth: 'cloth-cream', quilt: 'knit-wool', band: 'cloth-cream', seam: 'knit-wool', cuff: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A cotton long underwear top folded on a shelf, 300 mm by 320 mm and 36 mm tall, neck at +z: waffle knit with a
  // ribbed crew neck, a short three-button placket and the sleeves folded down both sides to ribbed cuffs.
  local w = 0.3, d = 0.32, ht = 0.036;
  h.compound('long_undertop', 0.3,
             g.jacket({ w: w, d: d, ht: ht, neck: 0.075, collar: { r: 0.06, wd: 0.014, ht: 0.006, gap: 0 }, front: 'none', buttons: [], sleeves: { kind: 'flat', w: 0.07, t: 0.006 } })
             + g.quilt({ style: 'lattice', x0: -w / 2 + 0.075, x1: w / 2 - 0.075, z0: -d / 2 + 0.01, z1: d / 2 - 0.15, y: ht, pitch: 0.03, w: 0.003, t: 0.002 })
             + [box('placket', 'front', [-0.012, ht, d / 2 - 0.23], [0.012, ht + 0.004, d / 2 - 0.15])]
             + [h.disc('button-%d' % i, 'button', 0.005, ht + 0.004, ht + 0.007, 0, d / 2 - 0.165 - i * 0.025) for i in [0, 1, 2]]
             + [sbox('cuff-%d' % (s + 1), 'cuff', [s * w / 2, ht + 0.006, -d / 2 + 0.03], [s * (w / 2 - 0.07), ht + 0.01, -d / 2 + 0.07]) for s in [-1, 1]],
             { cloth: 'cloth-cream', collar: 'knit-wool', sleeve: 'cloth-cream', quilt: 'knit-wool', front: 'knit-wool', button: 'pearl', cuff: 'knit-wool' })
  + { voxelGrain: 0.004 },

  // A cotton sleeveless underwear top folded on a shelf, 280 mm by 300 mm and 30 mm tall, neck at +z: a fine-ribbed
  // grey vest with a scoop neck and narrow shoulder straps, the armholes cut in at both sides.
  local w = 0.28, d = 0.3, ht = 0.03;
  h.compound('long_undertop_sleeveless', 0.2,
             h.foldedGarment(w, d, ht, 3)
             + h.crescent('neck', 'trim', 0.07, 0.082, 90, 270, 10, ht, ht + 0.003, 0, d / 2)
             + h.crescent('neck-hole', 'hole', 0.001, 0.07, 90, 270, 10, ht, ht + 0.001, 0, d / 2)
             + std.flattenArrays([
               h.crescent('arm-%d' % (s + 1), 'trim', 0.05, 0.06, if s < 0 then 10 else 190, if s < 0 then 170 else 350, 8, ht, ht + 0.003, s * w / 2, d / 2 - 0.09)
               for s in [-1, 1]
             ])
             + [box('rib-%d' % i, 'rib', [x - 0.0015, ht, -d / 2 + 0.01], [x + 0.0015, ht + 0.002, d / 2 - 0.16]) for i in std.range(0, 11) for x in [-0.077 + i * 0.014]],
             { cloth: 'cloth-heather-grey', trim: 'cloth-cream', hole: 'cloth-charcoal', rib: 'felt-grey' })
  + { voxelGrain: 0.004 },

  // Cotton panties laid flat, 300 mm across the waist and 200 mm long, waist at -z: a full front panel narrowing to the
  // crotch, an elastic waistband, picot trim round the leg openings and a small bow at the front.
  local w = 0.3, crotch = 0.08, l = 0.2, z0 = -l / 2, z1 = l / 2, zc = z0 + 0.14;
  local hw(z) = if z >= zc then crotch / 2 else crotch / 2 + (w / 2 - crotch / 2) * std.pow((zc - z) / (zc - z0), 0.55);
  local zs = [z0 + (zc - z0) * i / 6 for i in std.range(0, 6)];
  h.compound('panties', 0.027,
             [
               flat('front-%d' % i, 'cloth', [[-hw(zs[i]), zs[i]], [hw(zs[i]), zs[i]], [hw(zs[i + 1]), zs[i + 1]], [-hw(zs[i + 1]), zs[i + 1]]], 0, 0.003)
               for i in std.range(0, 5)
             ]
             + [
               flat('gusset', 'cloth', [[-crotch / 2, zc], [crotch / 2, zc], [crotch / 2, z1], [-crotch / 2, z1]], 0, 0.003),
               box('band', 'band', [-w / 2, 0.003, z0], [w / 2, 0.005, z0 + 0.016]),
               box('gusset-seam', 'trim', [-crotch / 2, 0.003, z1 - 0.03], [crotch / 2, 0.004, z1 - 0.027]),
             ]
             + [
               strip('leg-trim-%d-%d' % [s + 1, i], 'trim', [s * hw(zs[i]), zs[i]], [s * hw(zs[i + 1]), zs[i + 1]], 0.003, 0.006, 0.0015)
               for s in [-1, 1]
               for i in std.range(1, 5)
             ]
             + [box('leg-trim-gusset-%d' % (s + 1), 'trim', [s * crotch / 2 - 0.003, 0.003, zc], [s * crotch / 2 + 0.003, 0.0045, z1]) for s in [-1, 1]]
             + bow('bow', 'trim', 0, z0 + 0.026, 0.005, 0.008),
             { cloth: 'cloth-cream', band: 'petal-pink', trim: 'petal-pink' })
  + { voxelGrain: 0.002 },
]
