local h = import '../compound.libsonnet';
local box = h.box;
local rad(deg) = deg * std.pi / 180;

// A closed ring turned about y from y0 to y1 between radii r0 and r1, centred on (x, z).
local ring(id, slot, r0, r1, y0, y1, x=0, z=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);

// A torus about y: a tube of radius `r` bent round a circle of radius `R` at height y. Off-axis, so the outline closes.
local torus(id, slot, R, r, y, n=10) =
  local pts = [[r * std.sin(2 * std.pi * i / n), R + r * std.cos(2 * std.pi * i / n)] for i in std.range(0, n - 1)];
  h.turned(id, slot, 'y', pts + [pts[0]], [0, y, 0]);

// A flat convex outline [[x, z]...] standing on y from y0 to y1.
local flat(id, slot, outline, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in outline], y0, y1);

// A half-oval bill reaching forward from radius `r` on the crown to `reach` at the front, `half` wide, for caps.
local bill(id, slot, r, reach, half, y0, y1, n=8) =
  flat(id, slot, [[r * 0.2, 0]] + [
    [half * std.cos(rad(180 * i / n)), r * 0.2 + (reach - r * 0.2) * std.sin(rad(180 * i / n))]
    for i in std.range(0, n)
  ], y0, y1);

// An arc band in the y-z plane about centre (cy, cz), radii r0..r1, from a0 to a1 degrees off straight up (+z
// forward), `w` wide across x: ridges over a crown and straps over the top of the head.
local arcX(prefix, slot, r0, r1, a0, a1, steps, w, cy=0, cz=0, cx=0) = [
  local t0 = rad(a0 + (a1 - a0) * i / steps), t1 = rad(a0 + (a1 - a0) * (i + 1) / steps);
  local p(r, t) = [cy + r * std.cos(t), cz + r * std.sin(t)];
  h.prism('%s-%d' % [prefix, i], slot, 'x', [p(r0, t0), p(r1, t0), p(r1, t1), p(r0, t1)], cx - w / 2, cx + w / 2)
  for i in std.range(0, steps - 1)
];

// The same arc in the x-y plane, across the head from side to side.
local arcZ(prefix, slot, r0, r1, a0, a1, steps, w, cy=0, cz=0) = [
  local t0 = rad(a0 + (a1 - a0) * i / steps), t1 = rad(a0 + (a1 - a0) * (i + 1) / steps);
  local p(r, t) = [r * std.sin(t), cy + r * std.cos(t)];
  h.prism('%s-%d' % [prefix, i], slot, 'z', [p(r0, t0), p(r1, t0), p(r1, t1), p(r0, t1)], cz - w / 2, cz + w / 2)
  for i in std.range(0, steps - 1)
];

// Vertical ribs of radius `r` round a circle of radius `R` from y0 to y1: pleats, knit ribbing, fur tufts.
local ribs(prefix, slot, n, R, r, y0, y1) = [
  h.disc('%s-%d' % [prefix, i], slot, r, y0, y1, R * std.sin(2 * std.pi * i / n), R * std.cos(2 * std.pi * i / n))
  for i in std.range(0, n - 1)
];

// A hard hat standing on its rim, peak on +z: a domed shell 200 mm across, a narrow rim, a peak and a raised ridge
// front to back with a lower rib either side. Slot: shell. Rises `y0` off the floor.
local hardHat(y0) =
  local a = 0.1, ht = 0.12, R = (a * a + ht * ht) / (2 * ht), c = ht - R;
  [
    h.dome('crown', 'shell', a, ht, 0.004, 'y', [0, y0, 0], 10),
    ring('rim', 'shell', 0.096, 0.11, y0, y0 + 0.01),
    bill('peak', 'shell', 0.1, 0.175, 0.095, y0 + 0.004, y0 + 0.012),
  ]
  + arcX('ridge', 'shell', R - 0.004, R + 0.01, -62, 62, 10, 0.018, y0 + c)
  + arcX('rib-l', 'shell', R - 0.004, R + 0.005, -55, 55, 10, 0.008, y0 + c, 0, -0.045)
  + arcX('rib-r', 'shell', R - 0.004, R + 0.005, -55, 55, 10, 0.008, y0 + c, 0, 0.045);

// A dried-plant leaf lying flat on the wreath at angle `t` round it, turned `tilt` off the ring's tangent.
local leaf(id, slot, R, t, tilt, l, w, y0) =
  local cx = R * std.sin(t), cz = R * std.cos(t), along = t + rad(90 + tilt);
  local ux = std.sin(along), uz = std.cos(along), vx = std.sin(along + std.pi / 2), vz = std.cos(along + std.pi / 2);
  flat(id, slot, [
    [cx - ux * l / 2, cz - uz * l / 2],
    [cx + vx * w / 2, cz + vz * w / 2],
    [cx + ux * l / 2, cz + uz * l / 2],
    [cx - vx * w / 2, cz - vz * w / 2],
  ], y0, y0 + 0.004);

// Fur hat crown, for the fur hat and its faux-fur variant: a tall round drum of pile 210 mm across with tufted sides and
// a cloth top set in. Slots: fur, top.
local furHat = [
  h.turned('pile', 'fur', 'y', [[0, 0], [0, 0.098], [0.008, 0.104], [0.12, 0.11], [0.132, 0.104], [0.138, 0.09], [0.128, 0.084], [0.128, 0]]),
  h.turned('top', 'top', 'y', [[0, 0], [0, 0.09], [0.008, 0.088], [0.014, 0.06], [0.016, 0]], [0, 0.126, 0]),
] + ribs('tuft', 'fur', 22, 0.104, 0.008, 0.01, 0.128);

[
  // A wool beret lying crown up, 250 mm across and 50 mm high: a full soft crown over a leather-bound headband, with
  // a short stalk at the centre.
  h.compound('beret_wool', 0.091, [
    h.turned('crown', 'wool', 'y', [[0, 0], [0, 0.088], [0.006, 0.104], [0.018, 0.124], [0.03, 0.125], [0.04, 0.11], [0.047, 0.07], [0.05, 0]]),
    ring('band', 'band', 0.084, 0.093, 0, 0.009),
    h.disc('stalk', 'wool', 0.005, 0.048, 0.062),
  ], { wool: 'cloth-crimson', band: 'leather-black' })
  + { voxelGrain: 0.004 },

  // A bowler hat standing on its brim, 280 mm across and 135 mm tall: a hard round crown, a ribbon band and a narrow
  // brim curled up at the edge.
  h.compound('bowhat', 0.14, [
    h.turned('crown', 'felt', 'y', [[0, 0], [0, 0.084], [0.06, 0.088], [0.1, 0.082], [0.12, 0.066], [0.131, 0.04], [0.135, 0]]),
    h.turned('brim', 'felt', 'y', [[0, 0.08], [0, 0.128], [0.008, 0.138], [0.02, 0.142], [0.022, 0.136], [0.012, 0.128], [0.006, 0.08], [0, 0.08]]),
    ring('band', 'band', 0.084, 0.0895, 0.006, 0.032),
  ], { felt: 'cloth-charcoal', band: 'satin-black' })
  + { voxelGrain: 0.004 },

  // A chaplet lying flat, 220 mm across: a ring of twisted dried stems 24 mm thick, set with leaves and a few dried
  // flowers.
  h.compound('chaplet', 0.047, [
    torus('stems', 'stem', 0.098, 0.012, 0.012),
  ] + [
    leaf('leaf-%d' % i, 'leaf', 0.098 + (if i % 2 == 0 then 0.01 else -0.01), 2 * std.pi * i / 20, if i % 2 == 0 then 25 else -25, 0.04, 0.016, 0.016 + (i % 2) * 0.004)
    for i in std.range(0, 19)
  ] + [
    h.disc('flower-%d' % i, 'flower', 0.009, 0.02, 0.028, 0.098 * std.sin(2 * std.pi * (i + 0.25) / 5), 0.098 * std.cos(2 * std.pi * (i + 0.25) / 5))
    for i in std.range(0, 4)
  ], { stem: 'plant-dried', leaf: 'leaf-green', flower: 'petal-dried' })
  + { voxelGrain: 0.004 },

  // A leather cowboy hat standing on its brim, 380 mm across and 150 mm tall: a tall crown creased down the middle of
  // the top, a band with a silver concho at the front, and a wide brim rolled up at the edge.
  h.compound('cowboy_hat', 0.32, [
    h.turned('crown', 'leather', 'y', [[0, 0], [0, 0.086], [0.1, 0.082], [0.122, 0.074], [0.13, 0.058], [0.112, 0.036], [0.09, 0.012], [0.088, 0]], [0, 0.018, 0]),
    h.turned('brim', 'leather', 'y', [[0, 0.08], [0, 0.15], [0.02, 0.178], [0.054, 0.19], [0.058, 0.184], [0.026, 0.168], [0.008, 0.15], [0.006, 0.08], [0, 0.08]], [0, 0.012, 0]),
    ring('band', 'band', 0.084, 0.0895, 0.022, 0.042),
    h.turned('concho', 'concho', 'z', [[0, 0], [0, 0.012], [0.003, 0.01], [0.005, 0]], [0, 0.032, 0.088]),
  ], { leather: 'leather-chestnut', band: 'leather-black', concho: 'metal-silver' })
  + { voxelGrain: 0.004 },

  // A drinking hat standing upright, face on +z, 330 mm across: a cotton headband with a strap over the top, a small
  // plastic bottle wired upright at each side and a hose from each bottle running down the front to a mouthpiece.
  h.compound('drinking_hat', 0.92, [
    ring('band', 'band', 0.092, 0.099, 0, 0.04),
  ]
  + arcZ('strap', 'band', 0.092, 0.099, -90, 90, 10, 0.03, 0.02)
  + std.flattenArrays([
    [
      h.turned('bottle-' + side, 'bottle', 'y', [[0, 0], [0, 0.034], [0.12, 0.034], [0.14, 0.014], [0.15, 0.014], [0.15, 0]], [s * 0.135, 0.01, 0]),
      h.disc('cap-' + side, 'cap', 0.016, 0.16, 0.172, s * 0.135, 0),
      box('wire-lo-' + side, 'wire', [std.min(s * 0.098, s * 0.135), 0.018, -0.003], [std.max(s * 0.098, s * 0.135), 0.022, 0.003]),
      box('wire-hi-' + side, 'wire', [std.min(s * 0.098, s * 0.135), 0.1, -0.003], [std.max(s * 0.098, s * 0.135), 0.104, 0.003]),
      ring('cord-' + side, 'cord', 0.033, 0.038, 0.058, 0.066, s * 0.135, 0),
      h.turned('hose-run-' + side, 'hose', 'z', [[0, 0], [0, 0.005], [0.12, 0.005], [0.12, 0]], [s * 0.135, 0.168, 0]),
      h.disc('hose-drop-' + side, 'hose', 0.005, 0.01, 0.173, s * 0.135, 0.12),
    ]
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ]) + [
    h.rod('hose-join', 'hose', 0.005, -0.135, 0.135, 0.012) + { origin: [-0.135, 0.012, 0.12] },
    h.disc('mouthpiece', 'cap', 0.009, 0.004, 0.03, 0, 0.12),
  ], { band: 'cloth-khaki', bottle: 'plastic-clear-blue', cap: 'plastic-white', wire: 'steel-bright', cord: 'cord-cotton', hose: 'rubber-black' })
  + { voxelGrain: 0.004 },

  // A lacquered eboshi standing upright, front on +z, 255 mm tall and 180 mm across: a tall cap tapering to a narrow
  // top whose tip folds forward, with a cord to tie it under the chin.
  h.compound('eboshi', 0.17, [
    h.turned('cap', 'lacquer', 'y', [[0, 0], [0, 0.09], [0.08, 0.088], [0.16, 0.074], [0.215, 0.05], [0.245, 0.026], [0.255, 0]]),
    box('fold', 'lacquer', [-0.024, 0.236, 0.0], [0.024, 0.252, 0.06]),
    box('fold-tip', 'lacquer', [-0.02, 0.222, 0.05], [0.02, 0.242, 0.066]),
    ring('rim', 'cord', 0.089, 0.093, 0, 0.006),
    box('cord-l', 'cord', [-0.094, 0, -0.004], [-0.088, 0.03, 0.004]),
    box('cord-r', 'cord', [0.088, 0, -0.004], [0.094, 0.03, 0.004]),
  ], { lacquer: 'leather-patent', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A boonie hat standing on its brim, 320 mm across and 110 mm tall: a soft round crown with a loop band for
  // foliage and a vent eyelet each side, and a stitched brim drooping all round.
  h.compound('hat_boonie', 0.1, [
    h.turned('crown', 'cloth', 'y', [[0, 0], [0, 0.09], [0.072, 0.088], [0.084, 0.078], [0.09, 0]], [0, 0.02, 0]),
    h.turned('brim', 'cloth', 'y', [[0.026, 0.086], [0.032, 0.086], [0.006, 0.158], [0, 0.158], [0.026, 0.086]]),
    ring('stitch-1', 'stitch', 0.11, 0.113, 0.0205, 0.0225),
    ring('stitch-2', 'stitch', 0.132, 0.135, 0.0125, 0.0145),
    ring('loop-band', 'band', 0.088, 0.092, 0.038, 0.062),
    h.rod('eyelets', 'eyelet', 0.005, -0.091, 0.091, 0.082),
  ] + [
    box('loop-%d' % i, 'band', [0.092 * std.sin(2 * std.pi * i / 8) - 0.006, 0.036, 0.092 * std.cos(2 * std.pi * i / 8) - 0.006], [0.092 * std.sin(2 * std.pi * i / 8) + 0.006, 0.064, 0.092 * std.cos(2 * std.pi * i / 8) + 0.006])
    for i in std.range(0, 7)
  ], { cloth: 'cloth-olive-drab', stitch: 'webbing-olive-dark', band: 'webbing-olive-dark', eyelet: 'brass-dull' })
  + { voxelGrain: 0.004 },

  // A chef's toque standing upright, 240 mm tall: a plain band 50 mm deep under a tall pleated body that puffs out
  // at the top.
  h.compound('hat_chef', 0.08, [
    ring('band', 'band', 0.08, 0.096, 0, 0.05),
    h.turned('body', 'cloth', 'y', [[0, 0], [0, 0.094], [0.12, 0.104], [0.165, 0.11], [0.18, 0.106], [0.19, 0.08], [0.192, 0]], [0, 0.048, 0]),
  ] + ribs('pleat', 'cloth', 18, 0.1, 0.007, 0.05, 0.2), { band: 'cloth-cream', cloth: 'cloth-bright-white' })
  + { voxelGrain: 0.004 },

  // A snug cotton knit hat standing upright, 180 mm tall: a rounded crown over a ribbed cuff turned up at the brow.
  h.compound('hat_cotton', 0.08, [
    h.turned('crown', 'knit', 'y', [[0, 0], [0, 0.085], [0.1, 0.085], [0.148, 0.066], [0.172, 0.036], [0.18, 0]]),
    ring('cuff', 'cuff', 0.084, 0.092, 0, 0.05),
  ] + ribs('rib', 'cuff', 30, 0.092, 0.0035, 0, 0.05), { knit: 'cloth-red', cuff: 'cloth-red' })
  + { voxelGrain: 0.004 },

  // A fur hat standing upright, 220 mm across and 140 mm tall: a deep round drum of tufted pelt with a cloth top
  // set in.
  h.compound('hat_fur', 0.46, furHat, { fur: 'fur-brown', top: 'velvet-red' })
  + { voxelGrain: 0.004 },

  // A patrol cap standing on its bill, front on +z, 260 mm long and 95 mm tall: a straight-sided crown with a flat
  // top and a stiff short bill.
  h.compound('hat_field', 0.11, [
    h.turned('crown', 'cloth', 'y', [[0, 0], [0, 0.09], [0.088, 0.096], [0.095, 0.094], [0.096, 0]], [0, 0.004, 0]),
    bill('bill', 'cloth', 0.09, 0.165, 0.088, 0, 0.007),
    ring('seam', 'seam', 0.096, 0.098, 0.088, 0.094),
  ], { cloth: 'cloth-ucp', seam: 'webbing-olive-dark' })
  + { voxelGrain: 0.004 },

  // A flat golf cap standing upright, front on +z, 240 mm long and 70 mm tall: a wedge of cloth, highest at the back,
  // that slopes forward over a short stiff bill and is held down to it by a snap.
  h.compound('hat_golf', 0.088, [
    bill('bill', 'cloth', 0.09, 0.15, 0.084, 0, 0.007),
  ] + [
    h.prism('body-' + part[0], 'cloth', 'x', [[q[0] * part[3], q[1] * part[3]] for q in [[0, -0.088], [0, 0.09], [0.035, 0.125], [0.07, -0.02], [0.06, -0.075], [0.035, -0.092]]], part[1], part[2])
    for part in [['m', -0.05, 0.05, 1], ['l1', -0.075, -0.05, 0.94], ['r1', 0.05, 0.075, 0.94], ['l2', -0.088, -0.075, 0.82], ['r2', 0.075, 0.088, 0.82]]
  ] + [
    h.turned('snap', 'snap', 'y', [[0, 0], [0, 0.007], [0.004, 0.006], [0.006, 0]], [0, 0.035, 0.11]),
  ], { cloth: 'cloth-brown', snap: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A hard hat standing on its rim, peak on +z, 280 mm long and 135 mm tall: a domed shell with a raised ridge and a
  // rib either side, a narrow rim and a short peak.
  h.compound('hat_hard', 0.33, hardHat(0), { shell: 'plastic-yellow' })
  + { voxelGrain: 0.004 },

  // The hard hat with a cloth sun shade, 380 mm across: the shade buttons to the rim and lies spread on the floor
  // round the back and sides, where it hangs over the neck and ears when worn.
  h.compound('hat_hard_hooded', 0.36, hardHat(0.004)
    + h.crescent('shade', 'shade', 0.104, 0.19, 75, 285, 14, 0, 0.004)
    + [
      h.disc('button-%d' % i, 'button', 0.006, 0.004, 0.016, 0.112 * std.sin(rad(a)), 0.112 * std.cos(rad(a)))
      for i in std.range(0, 4)
      for a in [[90, 135, 180, 225, 270][i]]
    ], { shell: 'plastic-white', shade: 'cloth-khaki', button: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },
]
