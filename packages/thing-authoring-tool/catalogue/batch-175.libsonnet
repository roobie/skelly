local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;

// A riding suit folded on a shelf, neck at +z; swimwear laid flat, outside up, waist towards -z; a full-face diving
// mask standing on its chin, front on +z, straps trailing back.

local rad(d) = d * std.pi / 180;
local sq(v) = v * v;
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

// One leg of a one-piece suit folded up over the body, a panel `t` thick from the hem at z0 to the crotch at z1,
// `w0` across at the hem and `w1` at the top, centred on cx.
local legPanel(id, slot, cx, z0, z1, w0, w1, y, t) =
  h.prism(id, slot, 'y', [[z0, cx - w0 / 2], [z0, cx + w0 / 2], [z1, cx + w1 / 2], [z1, cx - w1 / 2]], y, y + t);

// A band curved round [0, cz] at radius r, thick t, from angle a0 to a1 (0 points to +z), in segments whose bottom
// and top heights `y0(ang)` and `y1(ang)` follow the angle at each segment's middle: mask shells and their rims.
local wrapBand(prefix, slot, r, t, a0, a1, steps, cz, y0, y1) = std.flattenArrays([
  local ang = a0 + (a1 - a0) * (i + 0.5) / steps;
  h.crescent('%s-%d' % [prefix, i], slot, r - t, r, a0 + (a1 - a0) * i / steps, a0 + (a1 - a0) * (i + 1) / steps, 1, y0(ang), y1(ang), 0, cz)
  for i in std.range(0, steps - 1)
]);
// The [x, z] point at angle `ang` degrees on a circle of radius r round [0, cz].
local onArc(r, ang, cz) = [r * std.sin(rad(ang)), cz + r * std.cos(rad(ang))];
// A face outline: the heights of an oval `S` degrees in half-width round its centre height c, b half-tall, squared
// off by exponent p.
local ovalK(a, S, p) = std.pow(std.max(0.02, 1 - std.pow(std.abs(a) / S, p)), 1 / p);
local ovalLow(a, S, c, b, p) = c - b * ovalK(a, S, p);
local ovalHigh(a, S, c, b, p) = c + b * ovalK(a, S, p);

// Points of a superellipse `a` across x by `b` up y round [0, cy], exponent p, for prisms along z.
local sgnPow(v, e) = (if v < 0 then -1 else 1) * std.pow(std.abs(v), e);
local oval(a, b, p, n, cy) = [
  local t = 2 * std.pi * i / n;
  [a * sgnPow(std.cos(t), 2 / p), cy + b * sgnPow(std.sin(t), 2 / p)]
  for i in std.range(0, n - 1)
];
// A ring between two ovals from z0 to z1, as convex quads.
local maskRing(prefix, slot, inner, outer, z0, z1) = [
  local n = std.length(inner);
  h.prism('%s-%d' % [prefix, i], slot, 'z', [outer[i], outer[(i + 1) % n], inner[(i + 1) % n], inner[i]], z0, z1)
  for i in std.range(0, std.length(inner) - 1)
];

// Bikini bottoms laid flat, waist at -z: a front panel narrowing to the crotch, a waistband, and at each hip a
// side tie or a plain string. `w` is the waist width, `crotch` the width at the crotch, `l` the front's length.
// Slots: cloth, band, tie.
local briefs(w, crotch, l, bandW, ties, hip=0.02) =
  local z0 = -l / 2, z1 = l / 2;
  [
    flat('front', 'cloth', [[-w / 2, z0], [w / 2, z0], [w / 2 - hip, z0 + 0.04], [crotch / 2, z1], [-crotch / 2, z1], [-w / 2 + hip, z0 + 0.04]], 0, 0.003),
    box('band', 'band', [-w / 2, 0.003, z0], [w / 2, 0.005, z0 + bandW]),
  ] + (if ties then std.flattenArrays([
         [sbox('tie-%d' % (s + 1), 'tie', [if s < 0 then -w / 2 - 0.05 else w / 2, 0, z0 + 0.002], [if s < 0 then -w / 2 else w / 2 + 0.05, 0.003, z0 + 0.008])]
         + bow('bow-%d' % (s + 1), 'tie', s * (w / 2 + 0.035), z0 + 0.005, 0.003)
         + cord('tail-%d' % (s + 1), 'tie', [[s * (w / 2 + 0.035), z0 + 0.008], [s * (w / 2 + 0.045), z0 + 0.06]], 0.003)
         for s in [-1, 1]
       ]) else []);

// A bikini top laid flat, neck at -z: two triangle cups point up, a centre tie between them, a band string out to
// each side and a neck string from each point. `cw` is a cup's base width, `ch` its height. Slots: cloth, seam, tie.
local bra(cw, ch, ties) =
  local gap = 0.02, zb = ch / 2, zt = -ch / 2;
  std.flattenArrays([
    local cx = s * (gap / 2 + cw / 2);
    [
      flat('cup-%d' % (s + 1), 'cloth', [[cx - cw / 2, zb], [cx + cw / 2, zb], [cx, zt]], 0, 0.004),
      flat('pad-%d' % (s + 1), 'cloth', [[cx - cw / 2 + 0.012, zb - 0.006], [cx + cw / 2 - 0.012, zb - 0.006], [cx, zt + 0.02]], 0.004, 0.003),
      strip('seam-%d' % (s + 1), 'seam', [cx, zt + 0.01], [cx, zb - 0.004], 0.007, 0.003, 0.001),
      box('hem-%d' % (s + 1), 'tie', [cx - cw / 2, 0.004, zb - 0.006], [cx + cw / 2, 0.006, zb]),
    ]
    + cord('band-%d' % (s + 1), 'tie', [[s * (gap / 2 + cw), zb - 0.003], [s * (gap / 2 + cw + 0.09), zb - 0.003], [s * (gap / 2 + cw + 0.12), zb + 0.02]], 0)
    + cord('neck-%d' % (s + 1), 'tie', [[cx, zt], [cx + s * 0.01, zt - 0.06], [cx - s * 0.015, zt - 0.11]], 0)
    for s in [-1, 1]
  ])
  + [box('centre', 'tie', [-gap / 2 - 0.004, 0, zb - 0.012], [gap / 2 + 0.004, 0.006, zb - 0.002])]
  + (if ties then bow('centre-bow', 'tie', 0, zb - 0.007, 0.006, 0.009) else []);

[
  // A one-piece leather riding suit folded to 440 mm by 460 mm and 70 mm tall, legs folded up over its lower half:
  // black leather with a white yoke and red stripes down the sleeves and legs, a zipped front with a stand collar,
  // hard pads stitched in over the shoulders, elbows and knees, and stretch panels at the knees.
  local w = 0.44, d = 0.46, ht = 0.07, legT = 0.012, legTop = -0.02;
  h.compound('touring_suit', 5.5, g.jacket({ w: w, d: d, ht: ht, collar: { r: 0.06, wd: 0.022, ht: 0.03, gap: 30 }, front: 'placket', frontW: 0.014, frontT: 0.004, buttons: [], sleeves: { kind: 'flat', w: 0.1, t: 0.012 } })
                                  + [
                                    box('yoke', 'yoke', [-w / 2 + 0.1, ht, 0.12], [w / 2 - 0.1, ht + 0.003, d / 2 - 0.02]),
                                    box('zip-pull', 'zip', [-0.006, ht + 0.004, d / 2 - 0.12], [0.006, ht + 0.008, d / 2 - 0.095]),
                                  ]
                                  + std.flattenArrays([
                                    local sx = s * (w / 2 - 0.05), lx = s * 0.085;
                                    [
                                      // Sleeves: a stripe the length, a shoulder pad and an elbow pad.
                                      box('sleeve-stripe-%d' % (s + 1), 'stripe', [sx - 0.008, ht + 0.012, -d / 2 + 0.03], [sx + 0.008, ht + 0.014, d / 2 - 0.02]),
                                      box('shoulder-pad-%d' % (s + 1), 'pad', [sx - 0.04, ht + 0.012, 0.11], [sx + 0.04, ht + 0.026, 0.2]),
                                      box('elbow-pad-%d' % (s + 1), 'pad', [sx - 0.035, ht + 0.012, -0.06], [sx + 0.035, ht + 0.024, 0.02]),
                                      // Legs: folded up over the body with a knee pad, a ribbed stretch panel and a stripe.
                                      legPanel('leg-%d' % (s + 1), 'leg', lx, -d / 2 + 0.01, legTop, 0.13, 0.16, ht, legT),
                                      sbox('leg-stripe-%d' % (s + 1), 'stripe', [lx + s * 0.06, ht + legT, -d / 2 + 0.012], [lx + s * 0.07, ht + legT + 0.002, legTop - 0.005]),
                                      box('knee-pad-%d' % (s + 1), 'pad', [lx - 0.04, ht + legT, -0.14], [lx + 0.04, ht + legT + 0.014, -0.06]),
                                    ]
                                    + [
                                      box('knee-rib-%d-%d' % [s + 1, i], 'rib', [lx - 0.045, ht + legT, -0.05 + i * 0.008], [lx + 0.045, ht + legT + 0.004, -0.046 + i * 0.008])
                                      for i in [0, 1, 2]
                                    ]
                                    for s in [-1, 1]
                                  ]), {
    cloth: 'leather-black',
    collar: 'leather-black',
    front: 'plastic-charcoal',
    sleeve: 'leather-black',
    leg: 'leather-black',
    yoke: 'leather-white',
    stripe: 'leather-red',
    pad: 'plastic-charcoal',
    rib: 'cloth-charcoal',
    zip: 'steel-bright',
  }) + { voxelGrain: 0.004 },

  // Lycra bikini bottoms laid flat, 300 mm across the waist with ties and 160 mm long: a front panel narrowing to the
  // crotch, a waistband, and a tie knotted in a bow at each hip.
  h.compound('bikini_bottom', 0.021, briefs(0.26, 0.07, 0.16, 0.012, true), { cloth: 'cloth-blue', band: 'cloth-blue', tie: 'cloth-bright-white' })
  + { voxelGrain: 0.002 },

  // Lycra thong bottoms laid flat, 300 mm across the waist string and 130 mm long: a small triangle front narrowing to
  // a string at the crotch, on a thin string waistband.
  h.compound('bikini_bottom_short', 0.0081, briefs(0.12, 0.012, 0.11, 0.008, false, 0)
                                           + [box('waist-string', 'tie', [-0.15, 0, -0.06], [0.15, 0.003, -0.054])]
                                           + cord('back-string', 'tie', [[0, 0.054], [0, 0.075]], 0), { cloth: 'cloth-red', band: 'cloth-red', tie: 'cloth-red' })
  + { voxelGrain: 0.002 },

  // A lycra bikini top laid flat, 380 mm across its band strings and 200 mm tall with its neck strings: two
  // triangle cups 120 mm across, lightly padded, joined by a tied centre, with band and neck strings.
  h.compound('bikini_top', 0.022, bra(0.12, 0.12, true), { cloth: 'cloth-blue', seam: 'cloth-navy', tie: 'cloth-bright-white' })
  + { voxelGrain: 0.002 },

  // A small lycra bikini top laid flat, 300 mm across its strings: two small triangle cups 80 mm across on thin
  // strings.
  h.compound('bikini_top_short', 0.011, bra(0.08, 0.08, false), { cloth: 'cloth-red', seam: 'cloth-crimson', tie: 'cloth-red' })
  + { voxelGrain: 0.002 },

  // A full-face diving mask standing on its chin, 200 mm across and 230 mm tall: a clear domed visor over the whole
  // face in an oval face-port frame, a black rubber skirt behind it, a moulded adapter port on the chin for a tank hose
  // or filter cartridge with an orange cap, a purge valve below it, and a slack four-strap spider harness lying on the
  // floor behind.
  local cy = 0.115, a = 0.1, bb = 0.11, zf = 0.0;
  local strapY = 0.0;
  h.compound('divemask_full_modular', 0.59,
             // Rubber skirt flaring back from the frame, then the hard face-port frame round the visor.
             maskRing('skirt', 'seal', oval(a - 0.016, bb - 0.016, 3, 28, cy), oval(a, bb, 3, 28, cy), zf - 0.07, zf - 0.02)
             + maskRing('frame', 'frame', oval(a - 0.016, bb - 0.016, 3, 28, cy), oval(a - 0.006, bb - 0.006, 3, 28, cy), zf - 0.02, zf)
             + [
               h.prism('visor-0', 'visor', 'z', oval(a - 0.016, bb - 0.016, 3, 28, cy), zf - 0.02, zf + 0.012),
               h.prism('visor-1', 'visor', 'z', oval(a - 0.03, bb - 0.032, 3, 28, cy + 0.005), zf + 0.012, zf + 0.026),
               h.prism('visor-2', 'visor', 'z', oval(a - 0.05, bb - 0.055, 3, 28, cy + 0.01), zf + 0.026, zf + 0.036),
               // The mouth cup's rim pressed against the visor's lower half.
               box('cup-rim', 'cup', [-0.04, 0.035, zf + 0.012], [0.04, 0.042, zf + 0.02]),
               // Adapter port on the chin, its cap, and the purge valve beneath.
               h.turned('port', 'frame', 'z', [[0, 0], [0, 0.026], [0.03, 0.024], [0.03, 0]], [0, 0.03, zf]),
               h.turned('port-cap', 'cap', 'z', [[0, 0], [0, 0.028], [0.012, 0.028], [0.012, 0]], [0, 0.03, zf + 0.03]),
               h.disc('purge', 'cap', 0.012, 0.0, 0.006, 0, zf + 0.012),
             ]
             // Buckles on the frame's sides and top where the straps start.
             + [
               local x = s * (a - 0.003);
               sbox('buckle-%d-%d' % [s + 1, j], 'cap', [x - 0.006, y - 0.012, zf - 0.03], [x + 0.006, y + 0.012, zf - 0.008])
               for s in [-1, 1]
               for j in [0, 1]
               for y in [[cy - 0.06, cy + 0.04][j]]
             ]
             + [box('buckle-top', 'cap', [-0.012, cy + bb - 0.006, zf - 0.03], [0.012, cy + bb + 0.006, zf - 0.008])]
             // The straps drop from the buckles down the skirt and lie slack on the floor, meeting at a back pad.
             + std.flattenArrays([
               local x = s * (a - 0.003);
               [
                 sbox('drop-%d-%d' % [s + 1, j], 'strap', [x - s * 0.004, 0, zf - 0.075], [x + s * 0.004, y, zf - 0.065]),
               ]
               + cord('strap-%d-%d' % [s + 1, j], 'strap', [[x, zf - 0.07], [s * (0.13 - 0.03 * j), zf - 0.13 - 0.03 * j], [s * (0.08 - 0.03 * j), zf - 0.2 + 0.01 * j], [s * 0.028, zf - 0.215]], strapY, 0.016, 0.003)
               for s in [-1, 1]
               for j in [0, 1]
               for y in [[cy - 0.06, cy + 0.04][j]]
             ])
             + [sbox('drop-top', 'strap', [-0.008, 0, zf - 0.075], [0.008, cy + bb, zf - 0.065])]
             + cord('strap-top', 'strap', [[0, zf - 0.07], [0.012, zf - 0.13], [0, zf - 0.2]], strapY, 0.016, 0.003)
             + [flat('pad', 'strap', [[-0.035, zf - 0.19], [0.035, zf - 0.19], [0.045, zf - 0.215], [0.035, zf - 0.24], [-0.035, zf - 0.24], [-0.045, zf - 0.215]], strapY + 0.001, 0.005)],
             {
               visor: 'plastic-clear',
               seal: 'vinyl-black',
               frame: 'plastic-charcoal',
               cup: 'plastic-frosted',
               cap: 'plastic-orange',
               strap: 'vinyl-black',
             }) + { voxelGrain: 0.004 },
]
