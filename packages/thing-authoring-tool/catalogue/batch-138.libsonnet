local h = import '../compound.libsonnet';
// A box from any two opposite corners, for parts mirrored across x.
local box(id, slot, a, b) = h.box(id, slot, [std.min(a[i], b[i]) for i in [0, 1, 2]], [std.max(a[i], b[i]) for i in [0, 1, 2]]);

// A flat convex outline of [x, z] points lying on the floor from y0 to y1.
local flat(id, slot, outline, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in outline], y0, y1);

// A pistol holster lying on its side from y0 to y0 + t: its muzzle at `o` ([x, z]), its length running `L` along
// unit [x, z] direction `u` and the grip side opening toward `v`. The narrow sheath holds the barrel, the wider end
// takes the trigger guard, a darker rim edges the mouth and a thumb-break strap snaps across it.
// `s` scales its width for small pistols. Slots: body, trim, strap, stud.
local holster(prefix, o, u, v, L, t, y0=0, s=1) =
  local pt(a, b) = [o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b];
  local w0 = 0.032 * s, w1 = 0.042 * s, g = 0.072 * s;
  [
    flat(prefix + '-sheath', 'body', [pt(0, 0), pt(L, 0), pt(L, w1), pt(0, w0)], y0, y0 + t),
    flat(prefix + '-guard', 'body', [pt(0.5 * L, w0 + 0.004), pt(L, w1), pt(L, g), pt(0.68 * L, g)], y0, y0 + t),
    flat(prefix + '-toe', 'trim', [pt(-0.004, -0.002), pt(0.012, -0.002), pt(0.012, w0 + 0.001), pt(-0.004, w0 + 0.001)], y0, y0 + t + 0.002),
    flat(prefix + '-rim', 'trim', [pt(L - 0.01, -0.002), pt(L + 0.003, -0.002), pt(L + 0.003, g + 0.002), pt(L - 0.01, g + 0.002)], y0, y0 + t + 0.003),
    flat(prefix + '-strap', 'strap', [pt(L - 0.03, -0.006), pt(L - 0.012, -0.006), pt(L - 0.012, g + 0.008), pt(L - 0.03, g + 0.008)], y0 + t, y0 + t + 0.004),
  ] + (
    local c = pt(L - 0.021, g * 0.55);
    [h.disc(prefix + '-stud', 'stud', 0.005, y0 + t + 0.004, y0 + t + 0.007, c[0], c[1])]
  );

// A flat buckle frame lying at height y centred on [x, z], `w` across x and `d` along z.
local buckle(id, slot, x, z, w, d, y) = [
  box(id + '-a', slot, [x - w / 2, y, z - d / 2], [x + w / 2, y + 0.005, z - d / 2 + 0.005]),
  box(id + '-b', slot, [x - w / 2, y, z + d / 2 - 0.005], [x + w / 2, y + 0.005, z + d / 2]),
  box(id + '-c', slot, [x - w / 2, y, z - d / 2], [x - w / 2 + 0.005, y + 0.005, z + d / 2]),
  box(id + '-d', slot, [x + w / 2 - 0.005, y, z - d / 2], [x + w / 2, y + 0.005, z + d / 2]),
  box(id + '-bar', slot, [x - 0.0015, y, z - d / 2], [x + 0.0015, y + 0.006, z + d / 2]),
];

[
  // A dark green aramid tactical helmet standing on its rim, front on +z, 260 mm across and 165 mm tall: a full-cut
  // shell edged with black rubber trim, a small night-vision bracket on the brow, a slim accessory rail curving
  // along each side, hook-and-loop patches on the crown and back, and a four-point chin harness hanging loose to
  // the floor.
  local a = 0.125, ht = 0.15, y0 = 0.012, R = (a * a + ht * ht) / (2 * ht), c = ht - R;
  local rAt(y) = std.sqrt(std.max(0, R * R - std.pow(y - y0 - c, 2)));
  // The crown patch is a cap of the shell's own sphere, so it follows the curve.
  local pa = 0.05, ph = R - std.sqrt(R * R - pa * pa);
  // Rail segments follow the shell round at rail height.
  local ry = 0.066, rr = rAt(ry), zs = [-0.06, -0.02, 0.02, 0.06];
  local xAt(z) = std.sqrt(rr * rr - z * z);
  h.compound('tac_helmet', 0.95,
             [
               h.dome('shell', 'shell', a, ht, 0.008, 'y', [0, y0, 0], 10),
               h.turned('edge', 'trim', 'y', [[0, a - 0.009], [0, a + 0.003], [y0 + 0.004, a + 0.003], [y0 + 0.004, a - 0.009], [0, a - 0.009]]),
               // A small bracket on the brow where a night-vision mount clips in.
               box('shroud', 'fitting', [-0.018, 0.098, rAt(0.11) - 0.008], [0.018, 0.124, rAt(0.11) + 0.006]),
               box('shroud-lip', 'fitting', [-0.012, 0.09, rAt(0.1) - 0.004], [0.012, 0.1, rAt(0.1) + 0.012]),
               // Hook-and-loop patches on the crown and the back, and a battery pouch below the back patch.
               h.dome('patch-top', 'patch', pa, ph, 0.004, 'y', [0, y0 + ht - ph + 0.003, 0], 4),
               box('patch-back', 'patch', [-0.04, 0.08, -rAt(0.08) - 0.003], [0.04, 0.115, -rAt(0.08) + 0.01]),
               box('counterweight', 'fitting', [-0.032, 0.035, -rAt(0.035) - 0.012], [0.032, 0.062, -rAt(0.035) + 0.008]),
             ]
             + std.flattenArrays([
               [
                 // A slim rail curving along each side, and the harness hanging from its ends.
                 box('rail-%d-%d' % [s + 1, i], 'fitting', [s * (xAt(zs[i]) - 0.006), ry - 0.007, zs[i] - 0.021], [s * (xAt(zs[i]) + 0.006), ry + 0.007, zs[i] + 0.021])
                 for i in std.range(0, 3)
               ] + [
                 box('strap-%d-front' % (s + 1), 'strap', [s * (xAt(0.06) + 0.001), 0, 0.055], [s * (xAt(0.06) + 0.004), ry - 0.007, 0.072]),
                 box('strap-%d-back' % (s + 1), 'strap', [s * (xAt(0.06) + 0.001), 0, -0.072], [s * (xAt(0.06) + 0.004), ry - 0.007, -0.055]),
                 box('strap-%d-foot' % (s + 1), 'strap', [s * 0.07, 0, -0.065], [s * (xAt(0.06) + 0.004), 0.003, 0.072]),
               ]
               for s in [-1, 1]
             ])
             + [
               box('chin-cup', 'pad', [-0.05, 0, 0.05], [0.05, 0.008, 0.08]),
               box('buckle', 'fitting', [-0.07, 0, 0.055], [-0.05, 0.01, 0.075]),
             ],
             { shell: 'nylon-ranger-green', trim: 'plastic-matte-black', fitting: 'plastic-matte-black', strap: 'webbing-black', patch: 'hook-loop-grey', pad: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A leather rifle scabbard for the back, lying on its side, 950 mm long, 60 mm wide at the closed muzzle end and
  // 130 mm at the mouth where the receiver sits, 55 mm thick, with a stiff rim, stitched welts along both edges,
  // a hood strap over the mouth and two shoulder straps laid out beside it.
  local L = 0.95, t = 0.055;
  h.compound('back_holster', 0.7,
             [
               flat('sheath', 'body', [[-L / 2, -0.03], [0.1, -0.035], [0.1, 0.035], [-L / 2, 0.03]], 0, t),
               flat('mouth', 'body', [[0.1, -0.035], [L / 2, -0.065], [L / 2, 0.065], [0.1, 0.035]], 0, t),
               box('toe', 'trim', [-L / 2 - 0.004, 0, -0.032], [-L / 2 + 0.03, t + 0.002, 0.032]),
               box('rim', 'trim', [L / 2 - 0.02, 0, -0.068], [L / 2 + 0.003, t + 0.003, 0.068]),
               box('hood', 'trim', [L / 2 - 0.12, t, -0.05], [L / 2 + 0.003, t + 0.006, 0.05]),
               h.disc('hood-stud', 'buckle', 0.006, t + 0.006, t + 0.009, L / 2 - 0.1, 0),
               // Welts stitched along both edges.
               flat('welt-a', 'trim', [[-L / 2, 0.026], [0.1, 0.031], [0.1, 0.036], [-L / 2, 0.031]], t, t + 0.002),
               flat('welt-b', 'trim', [[-L / 2, -0.031], [0.1, -0.036], [0.1, -0.031], [-L / 2, -0.026]], t, t + 0.002),
               flat('welt-c', 'trim', [[0.1, 0.031], [L / 2 - 0.02, 0.06], [L / 2 - 0.02, 0.065], [0.1, 0.036]], t, t + 0.002),
               flat('welt-d', 'trim', [[0.1, -0.036], [L / 2 - 0.02, -0.065], [L / 2 - 0.02, -0.06], [0.1, -0.031]], t, t + 0.002),
             ]
             // Two straps from collars round the scabbard, laid out beside it on the floor to a buckle.
             + std.flattenArrays([
               [
                 box('collar-%d' % i, 'strap', [x - 0.015, -0.001, -0.04 - 0.024 * i], [x + 0.015, t + 0.004, 0.04 + 0.024 * i]),
               ]
               for i in [0, 1]
               for x in [[-0.2, 0.3][i]]
             ])
             + [
               box('strap-run', 'strap', [-0.32, 0, 0.14], [0.42, 0.003, 0.17]),
               box('strap-a', 'strap', [-0.215, 0, 0.04], [-0.185, 0.003, 0.17]),
               box('strap-b', 'strap', [0.285, 0, 0.06], [0.315, 0.003, 0.17]),
             ]
             + buckle('buckle', 'buckle', 0.05, 0.155, 0.045, 0.04, 0.003),
             { body: 'leather-brown', trim: 'leather-black', strap: 'leather-black', buckle: 'brass-dull' })
  + { voxelGrain: 0.004 },

  // A wide leather baldric laid flat in a closed loop, 1.6 m round and 70 mm wide, with six pistol holsters
  // 200 mm long hanging from it, three from each run with their muzzles pointing out, and a brass buckle on one
  // bend.
  local L = 0.2, r = 0.16, w = 0.07, t = 0.006;
  h.compound('baldric_holster', 0.98,
             h.strapLoop('sash', 'strap', 0.3, r, w, t)
             + std.flattenArrays([
               holster('holster-%d-%d' % [k, i], [x - 0.036, k * (r + L - 0.02)], [0, -k], [1, 0], L, 0.032, 0)
               for k in [-1, 1]
               for i in [0, 1, 2]
               for x in [-0.11 + 0.11 * i]
             ])
             + buckle('buckle', 'buckle', 0.15 + r, 0, 0.09, 0.06, t),
             { strap: 'leather-charcoal', body: 'leather-chestnut', trim: 'leather-black', stud: 'brass-dull', buckle: 'brass-dull' })
  + { voxelGrain: 0.004 },

  // A white elastic belly band lying in a closed ring, 1.1 m round and 100 mm wide, with a pistol pocket 200 mm
  // long and a spare magazine pocket sewn on its outside, and a hook-and-loop tab where it fastens.
  local r = 0.11, w = 0.1, t = 0.004;
  h.compound('bbholster', 0.18,
             h.strapLoop('band', 'band', 0.2, r, w, t)
             + holster('pocket', [-0.13, r - 0.036], [1, 0], [0, 1], 0.18, 0.026, t, 0.95)
             + [
               box('mag', 'pocket', [0.08, t, r - 0.04], [0.11, t + 0.018, r + 0.04]),
               box('mag-top', 'trim', [0.076, t, r - 0.042], [0.114, t + 0.02, r - 0.036]),
               box('tab', 'patch', [-0.08, t, -r - 0.045], [0.04, t + 0.004, -r + 0.045]),
             ],
             { band: 'cloth-cream', body: 'cloth-charcoal', pocket: 'cloth-charcoal', trim: 'webbing-black', strap: 'webbing-black', stud: 'plastic-matte-black', patch: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },

  // A tan elastic thigh band lying in a closed ring, 700 mm round and 90 mm wide, with a small pistol pocket 130 mm
  // long, a slim magazine sleeve and a knife-sized slip pocket sewn round its outside, and a hook-and-loop tab.
  local r = 0.08, w = 0.09, t = 0.004;
  h.compound('bholster', 0.12,
             h.strapLoop('band', 'band', 0.1, r, w, t)
             + holster('pocket', [-0.1, r - 0.03], [1, 0], [0, 1], 0.13, 0.022, t, 0.8)
             + [
               box('mag', 'pocket', [0.05, t, r - 0.035], [0.075, t + 0.014, r + 0.035]),
               box('slip', 'pocket', [-0.06, t, -r - 0.035], [-0.02, t + 0.008, -r + 0.035]),
               box('tab', 'patch', [0.01, t, -r - 0.04], [0.09, t + 0.004, -r + 0.04]),
             ],
             { band: 'cloth-khaki', body: 'cloth-brown', pocket: 'cloth-brown', trim: 'webbing-black', strap: 'cloth-brown', stud: 'plastic-matte-black', patch: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },

  // A leather ankle holster lying on its side as a short open cuff, 330 mm round and 70 mm wide, lined with dark fleece
  // that shows at both edges, with a small pistol holster 120 mm long and a thumb-break strap riding on top of it.
  local r = 0.0525, w = 0.07, t = 0.006;
  h.compound('bootstrap', 0.2,
             [
               h.tube('lining', 'lining', r - t - 0.004, r - t + 0.001, -w / 2 - 0.004, w / 2 + 0.004, r, 0),
               h.tube('band', 'band', r - t, r, -w / 2, w / 2, r, 0),
             ]
             + holster('holster', [-0.06, -0.022], [1, 0], [0, 1], 0.12, 0.026, 2 * r - 0.004, 0.8),
             { band: 'leather-tan', lining: 'cloth-charcoal', body: 'leather-brown', trim: 'leather-black', strap: 'leather-black', stud: 'brass-dull' })
  + { voxelGrain: 0.002 },

  // A cotton bow sling laid flat: a canvas shoulder strap 1.6 m round and 40 mm wide in a loop, a padded sleeve
  // 320 mm long at one end for the bow's lower limb and a shallow cup at the other for the upper limb, joined by a
  // cross strap with a buckle.
  local r = 0.14, w = 0.04, t = 0.004;
  h.compound('bow_sling', 0.51,
             h.strapLoop('strap', 'strap', 0.42, r, w, t)
             + [
               box('sleeve', 'body', [-0.48, 0, -0.06], [-0.2, 0.03, 0.06]),
               box('sleeve-mouth', 'trim', [-0.215, 0, -0.063], [-0.2, 0.033, 0.063]),
               box('sleeve-foot', 'trim', [-0.49, 0, -0.063], [-0.47, 0.033, 0.063]),
               box('cup', 'body', [0.24, 0, -0.06], [0.34, 0.028, 0.06]),
               box('cup-lip', 'trim', [0.24, 0, -0.063], [0.255, 0.032, 0.063]),
               box('cross', 'trim', [-0.2, 0, -0.012], [0.24, 0.005, 0.012]),
               box('pad', 'pad', [-0.12, t, r - 0.03], [0.12, t + 0.012, r + 0.03]),
             ]
             + buckle('buckle', 'buckle', 0.02, 0, 0.03, 0.035, 0.005),
             { strap: 'cloth-olive-drab', body: 'cloth-canvas', trim: 'cloth-brown', pad: 'cloth-khaki', buckle: 'steel-grey' })
  + { voxelGrain: 0.004 },
]
