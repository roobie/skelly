local h = import '../compound.libsonnet';
local box = h.box;

// Masks, veils and a fake beard as they are found loose: rigid masks standing upright on their chin edge, front on
// +z, straps trailing back; cloth veils, a tied shirt and the beard laid flat, outside up.

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
// An ellipse of half-widths a (x) and b (z) round [cx, cz] lying flat from y to y + t.
local ellipse(id, slot, a, b, cx, cz, y, t, n=16) =
  flat(id, slot, [[cx + a * std.cos(2 * std.pi * i / n), cz + b * std.sin(2 * std.pi * i / n)] for i in std.range(0, n - 1)], y, t);

// A band curved round [0, cz] at radius r, thick t, from angle a0 to a1 (0 points to +z), in segments whose bottom
// and top heights `y0(ang)` and `y1(ang)` follow the angle at each segment's middle: mask shells and their rims.
local wrapBand(prefix, slot, r, t, a0, a1, steps, cz, y0, y1) = std.flattenArrays([
  local ang = a0 + (a1 - a0) * (i + 0.5) / steps;
  h.crescent('%s-%d' % [prefix, i], slot, r - t, r, a0 + (a1 - a0) * i / steps, a0 + (a1 - a0) * (i + 1) / steps, 1, y0(ang), y1(ang), 0, cz)
  for i in std.range(0, steps - 1)
]);
// The [x, z] point at angle `ang` degrees on a circle of radius r round [0, cz].
local onArc(r, ang, cz) = [r * std.sin(rad(ang)), cz + r * std.cos(rad(ang))];
// A patch painted flush on a shell of radius r round [0, cz]: angles a0 to a1, heights y0 to y1. Pieces only add,
// so openings (eyes, mouths, breathing holes) are painted in a dark finish.
local patch(id, slot, r, cz, a0, a1, y0, y1, steps=1) =
  wrapBand(id, slot, r + 0.0015, 0.003, a0, a1, steps, cz, function(a) y0, function(a) y1);

// A face outline on a shell: the heights of an oval `S` degrees in half-width round its centre height c, b half-tall,
// squared off by exponent p. The bottom and top heights at angle a.
local ovalK(a, S, p) = std.pow(std.max(0.02, 1 - std.pow(std.abs(a) / S, p)), 1 / p);
local ovalLow(a, S, c, b, p) = c - b * ovalK(a, S, p);
local ovalHigh(a, S, c, b, p) = c + b * ovalK(a, S, p);

// A full-face shell standing on its chin, front on +z: radius r, half-span `span` degrees, an oval `c` ± `b` tall.
// Slot: shell.
local faceShell(r, span, c, b, p, t=0.004, steps=24) =
  wrapBand('shell', 'shell', r, t, -span, span, steps, -r, function(a) ovalLow(a, span + 6, c, b, p), function(a) ovalHigh(a, span + 6, c, b, p));
// Slack straps: each leaves the shell's side edge, slants down to the floor and lies flat as a loop behind the mask,
// the higher strap reaching further back and further out. `ys` are the heights where they leave the shell.
local backStraps(r, span, c, ys, reach, w=0.02, t=0.003) =
  local tt = std.max(t, 0.004);
  local p = onArc(r - 0.002, span - 2, -r);
  local xo(j) = p[0] + j * (w + 0.004), zf(j) = p[1] - std.max(0.3 * ys[j], 1.5 * w), back(j) = -reach - j * (w + 0.012);
  std.flattenArrays([
    [
      h.prism('strap-%d-%d' % [s + 1, j], 'strap', 'x', [[ys[j] + w / 2, p[1]], [ys[j] - w / 2, p[1]], [0, zf(j) + w], [0, zf(j)]],
              std.min(s * xo(j), s * (xo(j) - tt)), std.max(s * xo(j), s * (xo(j) - tt))),
      sbox('strap-floor-%d-%d' % [s + 1, j], 'strap', [s * (xo(j) - w), 0, back(j)], [s * xo(j), tt, zf(j) + w]),
    ]
    for s in [-1, 1]
    for j in std.range(0, std.length(ys) - 1)
  ]) + [
    box('strap-back-%d' % j, 'strap', [-xo(j), 0, back(j)], [xo(j), tt, back(j) + w])
    for j in std.range(0, std.length(ys) - 1)
  ];

// A painted triangle on a shell, built in `n` level slices: centred at angle ac, base half-width w degrees at
// height yb, narrowing to a point at yt (above or below). rAt(y) gives the shell radius at each height, so a round
// shell keeps the paint on its face.
local triangle(id, slot, rAt, cz, ac, w, yb, yt, n=4) = std.flattenArrays([
  local ya = yb + (yt - yb) * i / n, yz = yb + (yt - yb) * (i + 1) / n, hw = w * (1 - (i + 0.5) / n);
  patch('%s-%d' % [id, i], slot, std.max(rAt(ya), rAt(yz)), cz, ac - hw, ac + hw, std.min(ya, yz), std.max(ya, yz))
  for i in std.range(0, n - 1)
]);

[
  // A white cotton face veil folded flat, 200 mm by 160 mm and 14 mm thick: a square of cloth gathered on a
  // drawn channel along its top edge (at -z), a rolled hem along the bottom edge (at +z) with a row of small white
  // beads hanging from it, and a tie trailing from each end of the channel.
  h.compound('face_veil', 0.095, h.foldedGarment(0.2, 0.16, 0.012, 2) + [
    box('hem', 'hem', [-0.1, 0.012, 0.068], [0.1, 0.015, 0.08]),
    box('channel', 'hem', [-0.1, 0.012, -0.08], [0.1, 0.014, -0.06]),
    box('tie-l', 'tie', [-0.096, 0.004, -0.15], [-0.088, 0.008, -0.07]),
    box('tie-r', 'tie', [0.088, 0.004, -0.15], [0.096, 0.008, -0.07]),
    box('tie-l-end', 'tie', [-0.11, 0.004, -0.17], [-0.09, 0.008, -0.15]),
    box('tie-r-end', 'tie', [0.09, 0.004, -0.17], [0.11, 0.008, -0.15]),
  ] + [
    // Gathers: puckered ridges across the channel.
    box('gather-%d' % i, 'hem', [-0.094 + 0.0145 * i, 0.014, -0.082], [-0.094 + 0.0145 * i + 0.007, 0.018, -0.058])
    for i in std.range(0, 13)
  ] + [
    h.disc('bead-%d' % i, 'bead', 0.0045, 0, 0.008, -0.09 + 0.015 * i, 0.086)
    for i in std.range(0, 12)
  ], { cloth: 'cloth-bright-white', hem: 'cloth-bright-white', tie: 'cord-cotton', bead: 'pearl' })
  + { voxelGrain: 0.002 },

  // A fencing mask standing on its bib, 230 mm across and 330 mm tall: a dark steel mesh cage curving round the face,
  // bound with a white padded edge, a white quilted bib below the chin and a sprung tongue arching back over the
  // crown to hold it on.
  local r = 0.105, cz = -r, span = 72, c = 0.2, b = 0.125;
  h.compound('fencing_mask', 0.32, faceShell(r, span, c, b, 2.6, 0.004, 24)
                                    // Mesh wires: raised rings round the cage and uprights across it.
                                    + std.flattenArrays([
                                      wrapBand('wire-%d' % i, 'wire', r + 0.002, 0.003, -span + 4, span - 4, 20, cz, function(a) y, function(a) y + 0.003)
                                      for i in std.range(0, 7)
                                      for y in [0.12 + 0.022 * i]
                                    ])
                                    // The padded white edge round the cage.
                                    + std.flattenArrays([
                                      wrapBand('edge-%d' % (s + 1), 'pad', r + 0.004, 0.012, std.min(s * (span - 6), s * (span + 2)), std.max(s * (span - 6), s * (span + 2)), 2, cz, function(a) 0.07, function(a) ovalHigh(span - 4, span + 6, c, b, 2.6) + 0.004)
                                      for s in [-1, 1]
                                    ])
                                    + wrapBand('crown-edge', 'pad', r + 0.004, 0.012, -span, span, 20, cz, function(a) ovalHigh(a, span + 6, c, b, 2.6) - 0.012, function(a) ovalHigh(a, span + 6, c, b, 2.6) + 0.002)
                                    // The bib hanging below the chin, wider than the cage, with quilting lines.
                                    + wrapBand('bib', 'bib', r + 0.012, 0.012, -span - 14, span + 14, 24, cz, function(a) 0.002 * sq(a / 20), function(a) 0.095)
                                    + std.flattenArrays([
                                      wrapBand('quilt-%d' % i, 'pad', r + 0.014, 0.003, -span - 10, span + 10, 20, cz, function(a) y, function(a) y + 0.003)
                                      for i in std.range(0, 1)
                                      for y in [0.035 + 0.03 * i]
                                    ])
                                    // The sprung tongue: a padded strap arching from the top of the cage back over the crown.
                                    + [
                                      local th0 = rad(10 + 15 * i), th1 = rad(10 + 15 * (i + 1));
                                      local oy = 0.21, oz = cz + 0.06;
                                      local pt(r, th) = [oy + r * 1.08 * std.cos(th), oz - r * std.sin(th)];
                                      h.prism('tongue-%d' % i, 'pad', 'x', [pt(0.114, th0), pt(0.126, th0), pt(0.126, th1), pt(0.114, th1)], -0.025, 0.025)
                                      for i in std.range(0, 9)
                                    ]
                                    + [box('tongue-root', 'pad', [-0.025, 0.318, -0.07], [0.025, 0.333, 0.0])],
             { shell: 'mesh-black', wire: 'steel-grey', pad: 'cloth-bright-white', bib: 'cloth-bright-white' })
  + { voxelGrain: 0.004 },

  // A ballistic face mask standing on its chin, 200 mm across and 250 mm tall: a black moulded shell covering the
  // whole face, a raised brow ridge over two smoked eye ports, a nose ridge, grilled breathing slots at the mouth and
  // a webbing harness running back from the sides.
  local r = 0.095, cz = -r, span = 76, c = 0.125, b = 0.125;
  h.compound('mask_bal', 0.25, faceShell(r, span, c, b, 2.4, 0.006, 24)
                                + wrapBand('rim', 'trim', r + 0.002, 0.008, -span, span, 24, cz, function(a) ovalLow(a, span + 6, c, b, 2.4), function(a) ovalLow(a, span + 6, c, b, 2.4) + 0.008)
                                + wrapBand('brow', 'trim', r + 0.008, 0.01, -48, 48, 12, cz, function(a) 0.178 - 0.008 * sq(a / 48), function(a) 0.192 - 0.008 * sq(a / 48))
                                + patch('eye-l', 'lens', r, cz, -44, -10, 0.14, 0.172, 4)
                                + patch('eye-r', 'lens', r, cz, 10, 44, 0.14, 0.172, 4)
                                + wrapBand('nose', 'trim', r + 0.009, 0.012, -5, 5, 2, cz, function(a) 0.085, function(a) 0.175)
                                + [
                                  sbox('vent-%d' % i, 'vent', [onArc(r, a, cz)[0] - 0.003, 0.035, onArc(r, a, cz)[1] - 0.004], [onArc(r, a, cz)[0] + 0.003, 0.065, onArc(r, a, cz)[1] + 0.0015])
                                  for i in std.range(0, 5)
                                  for a in [-25 + 10 * i]
                                ]
                                + backStraps(r, span, c, [0.07, 0.17], 0.16, 0.025),
             { shell: 'plastic-matte-black', trim: 'plastic-charcoal', lens: 'lens-smoke', vent: 'screen-black', strap: 'webbing-black' })
  + { voxelGrain: 0.004 },

  // A white cotton dust mask standing on its lower edge, 160 mm across and 105 mm tall: a pleated cloth cup over the
  // mouth and nose, a soft metal strip across the bridge of the nose and two elastic straps looping back.
  local r = 0.072, cz = -r, span = 66;
  h.compound('mask_dust', 0.008, faceShell(r, span, 0.052, 0.052, 2.2, 0.004, 20)
                                 + std.flattenArrays([
                                   wrapBand('pleat-%d' % i, 'cloth', r + 0.003, 0.004, -span + 10, span - 10, 16, cz, function(a) y, function(a) y + 0.005)
                                   for i in std.range(0, 2)
                                   for y in [0.03 + 0.022 * i]
                                 ])
                                 + wrapBand('nose', 'nose', r + 0.0025, 0.003, -22, 22, 6, cz, function(a) 0.09 - 0.008 * sq(a / 22), function(a) 0.098 - 0.008 * sq(a / 22))
                                 + backStraps(r, span, 0.052, [0.03, 0.075], 0.11, 0.006),
             { shell: 'cloth-cream', cloth: 'cloth-cream', nose: 'foil-alu', strap: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A white goalie's mask standing on its chin, 200 mm across and 250 mm tall: a moulded plastic shell with two eye
  // holes, a ridge down the nose, rows of breathing holes over the cheeks and mouth, and three elastic straps.
  local r = 0.095, cz = -r, span = 74, c = 0.125, b = 0.125;
  h.compound('mask_hockey', 0.2, faceShell(r, span, c, b, 2.2, 0.005, 24)
                                   + patch('eye-l', 'hole', r, cz, -42, -12, 0.145, 0.172, 4)
                                   + patch('eye-r', 'hole', r, cz, 12, 42, 0.145, 0.172, 4)
                                   + wrapBand('nose', 'ridge', r + 0.006, 0.01, -5, 5, 2, cz, function(a) 0.075, function(a) 0.205)
                                   + wrapBand('chin', 'ridge', r + 0.004, 0.008, -26, 26, 8, cz, function(a) ovalLow(a, span + 6, c, b, 2.2) + 0.004, function(a) ovalLow(a, span + 6, c, b, 2.2) + 0.014)
                                   + std.flattenArrays([
                                     patch('hole-%d-%d' % [j, i], 'hole', r, cz, a - 2.5, a + 2.5, y, y + 0.009)
                                     for j in std.range(0, 3)
                                     for i in std.range(0, 3)
                                     for y in [[0.04, 0.065, 0.09, 0.115][j]]
                                     for a in [[-36, -20, 20, 36][i] * (if j == 0 then 0.6 else 1)]
                                   ])
                                   + std.flattenArrays([
                                     patch('brow-hole-%d' % i, 'hole', r, cz, a - 2.5, a + 2.5, 0.198, 0.207)
                                     for i in std.range(0, 3)
                                     for a in [-24 + 16 * i]
                                   ])
                                   + backStraps(r, span, c, [0.08, 0.17], 0.15, 0.015),
             { shell: 'enamel-white', ridge: 'enamel-white', hole: 'plastic-matte-black', strap: 'webbing-black' })
  + { voxelGrain: 0.004 },

  // A beaked leather mask standing upright, 190 mm across, 230 mm tall and 290 mm from strap to beak tip: a stitched
  // leather face with two round glass eyes in brass rims and a long curved beak, buckled on with two straps.
  local r = 0.095, cz = -r, span = 80;
  local beak = [
    // [z from, z to, radius from, radius to, height from, height to]
    [-0.02, 0.06, 0.05, 0.04, 0.095, 0.085],
    [0.06, 0.13, 0.04, 0.026, 0.085, 0.07],
    [0.13, 0.19, 0.026, 0.004, 0.07, 0.045],
  ];
  h.compound('mask_plague', 0.35, faceShell(r, span, 0.12, 0.11, 2.6, 0.005, 24)
                                  + [
                                    h.turned('beak-%d' % i, 'leather', 'z', [[0, 0], [0, beak[i][2]], [beak[i][1] - beak[i][0], beak[i][3]], [beak[i][1] - beak[i][0], 0]], [0, beak[i][4], beak[i][0]])
                                    for i in std.range(0, 2)
                                  ]
                                  + [
                                    // The seam running along the top of the beak.
                                    box('seam-%d' % i, 'seam', [-0.002, beak[i][4] + beak[i][2] - 0.004, beak[i][0]], [0.002, beak[i][4] + beak[i][2] + 0.001, beak[i][1]])
                                    for i in std.range(0, 1)
                                  ]
                                  + std.flattenArrays([
                                    [
                                      h.turned('rim-%d' % (s + 1), 'rim', 'z', [[0, 0], [0, 0.024], [0.014, 0.024], [0.014, 0]], [s * 0.042, 0.158, -0.02]),
                                      h.turned('lens-%d' % (s + 1), 'lens', 'z', [[0, 0], [0, 0.018], [0.016, 0.016], [0.018, 0]], [s * 0.042, 0.158, -0.02]),
                                    ]
                                    for s in [-1, 1]
                                  ])
                                  + wrapBand('stitch', 'seam', r + 0.002, 0.003, -span + 4, span - 4, 20, cz, function(a) ovalHigh(a, span + 6, 0.12, 0.11, 2.6) - 0.012, function(a) ovalHigh(a, span + 6, 0.12, 0.11, 2.6) - 0.008)
                                  + backStraps(r, span, 0.12, [0.1, 0.18], 0.1, 0.02),
             { shell: 'leather-black', leather: 'leather-black', seam: 'leather-tan', rim: 'brass-polished', lens: 'lens-smoke', strap: 'leather-tan' })
  + { voxelGrain: 0.004 },

  // A cotton T-shirt knotted into a mask, laid flat, 300 mm across and 440 mm long: the shirt's body creased where
  // it was pulled over the head, its ribbed neck band stretched into a wide eye opening, and its two sleeves pulled
  // round and tied in a knot behind.
  h.compound('mask_rioter', 0.22, [
    flat('body', 'cloth', [[-0.15, -0.09], [0.15, -0.09], [0.15, 0.2], [-0.15, 0.2]], 0, 0.012),
    flat('shoulder-l', 'cloth', [[-0.15, -0.09], [-0.06, -0.12], [-0.06, -0.09]], 0, 0.012),
    flat('shoulder-r', 'cloth', [[0.06, -0.12], [0.15, -0.09], [0.06, -0.09]], 0, 0.012),
    ellipse('neck-band', 'hem', 0.1, 0.045, 0, -0.04, 0.012, 0.005, 20),
    ellipse('opening', 'opening', 0.085, 0.032, 0, -0.04, 0.012, 0.007, 20),
    box('hem', 'hem', [-0.15, 0.012, 0.188], [0.15, 0.015, 0.2]),
    strip('crease-1', 'crease', [-0.13, 0.03], [-0.03, 0.17], 0.012, 0.012, 0.005),
    strip('crease-2', 'crease', [0.13, 0.03], [0.04, 0.16], 0.012, 0.012, 0.005),
    strip('crease-3', 'crease', [-0.1, 0.1], [0.1, 0.12], 0.012, 0.01, 0.004),
    strip('sleeve-l', 'cloth', [-0.12, -0.1], [-0.025, -0.215], 0, 0.06, 0.014),
    strip('sleeve-r', 'cloth', [0.12, -0.1], [0.025, -0.215], 0, 0.06, 0.014),
    strip('cuff-l', 'hem', [-0.056, -0.163], [-0.025, -0.215], 0.014, 0.06, 0.002),
    strip('cuff-r', 'hem', [0.056, -0.163], [0.025, -0.215], 0.014, 0.06, 0.002),
    ellipse('knot', 'cloth', 0.035, 0.028, 0, -0.225, 0, 0.026),
    strip('end-l', 'cloth', [-0.01, -0.24], [-0.05, -0.31], 0, 0.035, 0.01),
    strip('end-r', 'cloth', [0.01, -0.24], [0.05, -0.31], 0, 0.035, 0.01),
  ], { cloth: 'cloth-navy', opening: 'cloth-black', hem: 'cloth-charcoal', crease: 'cloth-navy' })
  + { voxelGrain: 0.004 },

  // A white plastic skull mask standing on its chin, 180 mm across and 240 mm tall: a thin moulded shell shaped as a
  // grinning skull, with deep black eye sockets, a nose hole, a row of teeth and an elastic cord behind.
  local r = 0.09, cz = -r, span = 74, c = 0.12, b = 0.12;
  h.compound('mask_skull', 0.098, faceShell(r, span, c, b, 2.0, 0.003, 24)
                                 + patch('eye-l', 'hole', r, cz, -42, -10, 0.13, 0.172, 4)
                                 + patch('eye-r', 'hole', r, cz, 10, 42, 0.13, 0.172, 4)
                                 + triangle('nose', 'hole', function(y) r, cz, 0, 8, 0.088, 0.118, 3)
                                 + wrapBand('cheek-l', 'bone', r + 0.006, 0.008, -54, -26, 4, cz, function(a) 0.09, function(a) 0.12)
                                 + wrapBand('cheek-r', 'bone', r + 0.006, 0.008, 26, 54, 4, cz, function(a) 0.09, function(a) 0.12)
                                 + patch('mouth', 'hole', r, cz, -30, 30, 0.04, 0.078, 8)
                                 + [
                                   local a0 = -27 + 6 * i;
                                   wrapBand('tooth-%d' % i, 'tooth', r + 0.004, 0.003, a0, a0 + 4.6, 1, cz, function(a) 0.044, function(a) 0.074)[0]
                                   for i in std.range(0, 9)
                                 ]
                                 + backStraps(r, span, c, [0.15], 0.11, 0.004),
             { shell: 'bone', bone: 'bone', hole: 'plastic-matte-black', tooth: 'enamel-white', strap: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A plastic pumpkin mask that pulls down over the head, 270 mm across and 240 mm tall: an orange lobed shell with
  // triangle eyes, a triangle nose and a jagged grin cut through it, and a green stalk on top.
  local a = 0.135, cy = 0.115, bh = 0.115, lobes = 10, d = 0.078;
  local rAt(y) = a * std.sqrt(std.max(0, 1 - sq((y - cy) / bh)));
  local half(rr) = [[0, 0]] + [[cy - bh * std.cos(rad(180 * i / 12)), rr * std.sin(rad(180 * i / 12))] for i in std.range(0, 12)];
  h.compound('pumpkin_mask', 0.32, [
    h.turned('core', 'shell', 'y', half(a - 0.02)),
    h.disc('stalk', 'stalk', 0.014, 2 * bh - 0.01, 2 * bh + 0.02, 0, 0),
    box('stalk-tip', 'stalk', [-0.01, 2 * bh + 0.012, -0.01], [0.022, 2 * bh + 0.026, 0.01]),
  ] + [
    // Bulging lobes round the shell; the grooves between them are the pumpkin's ribs.
    h.turned('lobe-%d' % i, 'shell', 'y', half(a - d), [d * std.sin(rad(360 * i / lobes)), 0, d * std.cos(rad(360 * i / lobes))])
    for i in std.range(0, lobes - 1)
  ]
    + triangle('eye-l', 'face', rAt, 0, -32, 11, 0.125, 0.17, 4)
    + triangle('eye-r', 'face', rAt, 0, 32, 11, 0.125, 0.17, 4)
    + triangle('nose', 'face', rAt, 0, 0, 6, 0.098, 0.122, 3)
    + std.flattenArrays([
      patch('grin-%d' % i, 'face', std.max(rAt(0.05), rAt(0.085)), 0, -36 + 9 * i, -36 + 9 * (i + 1), 0.05 + (if i % 2 == 0 then 0 else 0.008), 0.085 - (if i % 2 == 0 then 0.01 else 0), 2)
      for i in std.range(0, 7)
    ]),
             { shell: 'plastic-orange', stalk: 'leaf-green', face: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A fake white beard laid flat, 200 mm across and 230 mm long: a fluffy beard hanging to a point, a curled grey-white
  // moustache over a mouth hole, sideburns up to the ears and an elastic cord across the top.
  h.compound('santa_beard', 0.13, [
    flat('upper', 'beard', [[-0.1, -0.07], [0.1, -0.07], [0.09, 0.04], [-0.09, 0.04]], 0, 0.02),
    flat('lower', 'beard', [[-0.09, 0.04], [0.09, 0.04], [0.06, 0.11], [0, 0.16], [-0.06, 0.11]], 0, 0.02),
    flat('burn-l', 'beard', [[-0.1, -0.07], [-0.06, -0.07], [-0.065, -0.11], [-0.095, -0.11]], 0, 0.016),
    flat('burn-r', 'beard', [[0.06, -0.07], [0.1, -0.07], [0.095, -0.11], [0.065, -0.11]], 0, 0.016),
    ellipse('mouth', 'mouth', 0.03, 0.012, 0, 0.002, 0.02, 0.002),
    box('cord', 'cord', [-0.1, 0.006, -0.112], [0.1, 0.01, -0.106]),
  ] + [
    ellipse('tache-%d' % (s + 1), 'tache', 0.035, 0.014, s * 0.032, -0.036, 0.02, 0.008)
    for s in [-1, 1]
  ] + [
    ellipse('curl-%d' % (s + 1), 'tache', 0.012, 0.012, s * 0.068, -0.03, 0.02, 0.01, 10)
    for s in [-1, 1]
  ] + [
    // Fluffy tufts over the beard.
    ellipse('tuft-%d' % i, 'beard', 0.018, 0.016, p[0], p[1], 0.02, 0.007, 10)
    for i in std.range(0, 9)
    for p in [[[-0.07, 0.01], [-0.035, 0.025], [0, 0.03], [0.035, 0.025], [0.07, 0.01], [-0.05, 0.065], [0, 0.07], [0.05, 0.065], [-0.022, 0.11], [0.022, 0.11]][i]]
  ], { beard: 'cloth-bright-white', tache: 'plastic-bag', mouth: 'cloth-charcoal', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },
]
