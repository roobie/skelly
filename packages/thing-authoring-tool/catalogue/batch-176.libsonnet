local h = import '../compound.libsonnet';
local f = import '../footwear.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;

// Swimming and diving gear as found on a shelf or the floor: a full-face mask and swim goggles standing upright,
// swimwear and a rash vest folded or laid flat, mail shark suits laid out flat, fins and dive boots as pairs.

local sgnPow(v, e) = (if v < 0 then -1 else 1) * std.pow(std.abs(v), e);
// Points of a superellipse `a` across x by `b` up y round [0, cy], exponent p, for prisms along z.
local oval(a, b, p, n, cy) = [
  local t = 2 * std.pi * i / n;
  [a * sgnPow(std.cos(t), 2 / p), cy + b * sgnPow(std.sin(t), 2 / p)]
  for i in std.range(0, n - 1)
];
// A ring between two ovals from z0 to z1, as convex quads.
local ovalRing(prefix, slot, inner, outer, z0, z1) = [
  local n = std.length(inner);
  h.prism('%s-%d' % [prefix, i], slot, 'z', [outer[i], outer[(i + 1) % n], inner[(i + 1) % n], inner[i]], z0, z1)
  for i in std.range(0, std.length(inner) - 1)
];

// A flat garment symmetric about x = 0, lying from y0 to y1, its outline given as [z, half-width] rows from one end to
// the other; each pair of rows makes a convex trapezoid, so the outline may curve in and out.
local sliced(prefix, slot, rows, y0, y1) = [
  local a = rows[i], b = rows[i + 1];
  h.prism('%s-%d' % [prefix, i], slot, 'y', [[a[0], -a[1]], [a[0], a[1]], [b[0], b[1]], [b[0], -b[1]]], y0, y1)
  for i in std.range(0, std.length(rows) - 2)
];

// Swim briefs laid flat, front up, waist at +z: the cut outline with a waistband and a tied drawcord. `rows` gives the
// outline; `panels` adds contrast side panels. Slots: cloth, band, cord, and panel.
local briefs(rows, panels=false) =
  local top = rows[0][0], half = rows[0][1], t = 0.008;
  sliced('cloth', 'cloth', rows, 0, t)
  + [
    box('waistband', 'band', [-half, t, top - 0.018], [half, t + 0.003, top]),
    g.strip('cord-l', 'cord', [-0.006, top - 0.008], [-0.025, top - 0.06], t + 0.003, 0.005, 0.004),
    g.strip('cord-r', 'cord', [0.006, top - 0.008], [0.03, top - 0.055], t + 0.003, 0.005, 0.004),
    box('knot', 'cord', [-0.01, t + 0.003, top - 0.014], [0.01, t + 0.009, top - 0.002]),
  ]
  + (if panels then [
       g.flat('panel-' + side, 'panel', [[s * rows[0][1], top - 0.018], [s * rows[2][1], rows[2][0]], [s * (rows[2][1] - 0.03), rows[2][0]], [s * (rows[0][1] - 0.04), top - 0.018]], t, 0.002)
       for side in ['l', 'r']
       for s in [if side == 'l' then -1 else 1]
     ] else []);

// A one-piece swimsuit laid flat, front up, shoulder straps at +z: the body cut high at the legs, a scooped neckline
// painted on the front, straps, and contrast trim round the leg openings and under the bust. Slots: cloth, strap,
// band, lining.
local swimsuit() =
  local t = 0.008;
  local leg = [[-0.3, 0.04], [-0.28, 0.042], [-0.25, 0.055], [-0.22, 0.08], [-0.19, 0.12], [-0.165, 0.15]];
  sliced('cloth', 'cloth', leg + [[-0.12, 0.152], [-0.06, 0.14], [0.02, 0.125], [0.1, 0.14], [0.16, 0.15], [0.2, 0.13]], 0, t)
  + [
    g.strip('leg-trim-%s-%d' % [side, i], 'band', [s * leg[i][1], leg[i][0]], [s * leg[i + 1][1], leg[i + 1][0]], t, 0.008, 0.002)
    for i in std.range(0, std.length(leg) - 2)
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ]
  + [
    // The shoulder straps folded back down flat over the front.
    g.strip('strap-l', 'strap', [-0.105, 0.2], [-0.095, 0.1], t, 0.018, 0.003),
    g.strip('strap-r', 'strap', [0.105, 0.2], [0.095, 0.1], t, 0.018, 0.003),
    g.flat('band', 'band', [[-0.135, 0.07], [0.135, 0.07], [0.14, 0.09], [-0.14, 0.09]], t, 0.002),
  ]
  + h.crescent('neck', 'lining', 0.004, 0.07, 95, 265, 8, t, t + 0.002, 0, 0.2)
  // A flag printed across the body below the band: white stripes on the red, and a navy canton with white stars.
  + [
    box('flag-stripe-%d' % i, 'stripe', [-0.118, t, -0.13 + i * 0.036], [0.118, t + 0.001, -0.112 + i * 0.036])
    for i in std.range(0, 5)
  ]
  + [box('flag-canton', 'canton', [-0.118, t, -0.004], [-0.01, t + 0.002, 0.066])]
  + [
    box('flag-star-%d-%d' % [i, j], 'star', [-0.108 + i * 0.02, t + 0.002, 0.004 + j * 0.016], [-0.102 + i * 0.02, t + 0.003, 0.01 + j * 0.016])
    for i in std.range(0, 4)
    for j in std.range(0, 3)
  ];

// A one-piece mail shark suit laid out flat, front up, hood at -z: hood, body, arms ending in mail mitts and legs
// ending in mail socks, each limb ringed with raised rows of links. `bonds` adds copper bonding braids down every
// limb, joined at the chest, and a grounding lead with a clip. Slots: mail, row, collar, and braid and clip.
local sharkSuit(bonds=false) =
  local t = 0.01;
  local limb(prefix, a, b, w) =
    local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
    local px = -dz / len * w / 2, pz = dx / len * w / 2, n = std.floor(len / 0.035);
    [g.strip(prefix, 'mail', a, b, 0, w, t)]
    + [
      local c = [a[0] + dx * (k + 0.5) / n, a[1] + dz * (k + 0.5) / n];
      g.strip('%s-row-%d' % [prefix, k], 'row', [c[0] - px, c[1] - pz], [c[0] + px, c[1] + pz], t, 0.008, 0.003)
      for k in std.range(0, n - 1)
    ];
  local body = [[-0.57, 0.2], [-0.5, 0.22], [-0.3, 0.2], [-0.12, 0.17], [0.02, 0.19]];
  sliced('body', 'mail', body, 0, t)
  + [box('body-row-%d' % k, 'row', [-0.18, t, -0.54 + k * 0.035], [0.18, t + 0.003, -0.532 + k * 0.035]) for k in std.range(0, 15)]
  + [
    g.flat('hood', 'mail', [g.onArc(0.11, 360 * i / 12, -0.68) for i in std.range(0, 11)], 0, t),
    g.flat('face', 'collar', [g.onArc(0.06, 360 * i / 12, -0.67) for i in std.range(0, 11)], t, 0.002),
  ]
  + h.crescent('collar', 'collar', 0.06, 0.085, -90, 90, 8, 0, t + 0.004, 0, -0.62)
  + std.flattenArrays([
    limb('arm-' + side, [s * 0.2, -0.52], [s * 0.42, -0.08], 0.11)
    + [g.strip('mitt-' + side, 'mail', [s * 0.43, -0.07], [s * 0.47, 0.1], 0, 0.1, t)]
    + limb('leg-' + side, [s * 0.1, 0.0], [s * 0.15, 0.8], 0.15)
    + [g.strip('foot-' + side, 'mail', [s * 0.15, 0.79], [s * 0.18, 1.04], 0, 0.11, t)]
    + (if bonds then [
         g.strip('arm-braid-' + side, 'braid', [s * 0.18, -0.45], [s * 0.43, 0.05], t + 0.003, 0.012, 0.004),
         g.strip('leg-braid-' + side, 'braid', [s * 0.07, -0.1], [s * 0.15, 0.95], t + 0.003, 0.012, 0.004),
       ] else [])
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ])
  + (if bonds then [
       box('chest-braid', 'braid', [-0.19, t + 0.003, -0.46], [0.19, t + 0.007, -0.448]),
       box('waist-braid', 'braid', [-0.19, t + 0.003, -0.11], [0.19, t + 0.007, -0.098]),
       g.strip('lead', 'braid', [0.19, -0.1], [0.36, 0.22], 0, 0.01, 0.006),
       box('clip', 'clip', [0.34, 0, 0.21], [0.38, 0.016, 0.27]),
     ] else []);

// A swim fin lying flat, toe to +z: a closed rubber foot pocket and a blade running on from it, ribbed at the edges
// with a channel down the middle. Slots: sole, upper, blade, rail.
local fin(p, cx) =
  local b = { l: 0.27, w: 0.1, t: 0.012, layers: 4, ankle: 0.07, top: 0, rx: 0.04, rz: 0.05, collar: 0 };
  f.boot(p, b, cx)
  + [
    h.prism(p + 'blade', 'blade', 'y', [[0.05, cx - 0.052], [0.05, cx + 0.052], [0.5, cx + 0.1], [0.53, cx + 0.06], [0.54, cx], [0.53, cx - 0.06], [0.5, cx - 0.1]], 0.003, 0.009),
    g.strip(p + 'rail-l', 'rail', [cx - 0.052, 0.05], [cx - 0.098, 0.5], 0.009, 0.01, 0.006),
    g.strip(p + 'rail-r', 'rail', [cx + 0.052, 0.05], [cx + 0.098, 0.5], 0.009, 0.01, 0.006),
    box(p + 'channel', 'rail', [cx - 0.004, 0.009, 0.14], [cx + 0.004, 0.012, 0.48]),
  ];

// A pair of neoprene dive socks lying flat side by side, both toes to +x, a gap between them along z: each a leg
// running back to its cuff at -z and a foot running along x, with a split between the big toe and the rest and a thin
// rubber sole along its underside edge. Slots: sock, heel, toe, cuff, sole, split.
local diveSocks =
  local c = { w: 0.085, legL: 0.1, footL: 0.25, t: 0.012, cuff: 0.02, gap: 0.03 };
  local w = c.w, t = c.t, footL = c.footL, legL = c.legL, cx = -footL / 2 + w / 2;
  local x(dd) = cx - w / 2 + dd;
  local zx(poly, dz) = [[q[1] + dz, q[0]] for q in poly];
  std.flattenArrays([
    [
      box(p + 'leg', 'sock', [cx - w / 2, 0, dz - legL], [cx + w / 2, t, dz + 0.001]),
      h.prism(p + 'foot', 'sock', 'y', zx([
        [x(0), 0], [x(footL - 0.03), 0], [x(footL - 0.008), w * 0.22], [x(footL), w * 0.5], [x(footL - 0.01), w * 0.84],
        [x(footL - 0.032), w], [x(0.034), w], [x(0.01), w - 0.01], [x(0), w - 0.036],
      ], dz), 0, t),
      h.prism(p + 'heel', 'heel', 'y', zx([[x(0), w * 0.2], [x(0.05), w * 0.2], [x(0.05), w], [x(0.034), w], [x(0.01), w - 0.01], [x(0), w - 0.036]], dz), t, t + 0.001),
      h.prism(p + 'toe', 'toe', 'y', zx([[x(footL - 0.05), 0], [x(footL - 0.03), 0], [x(footL - 0.008), w * 0.22], [x(footL), w * 0.5], [x(footL - 0.01), w * 0.84], [x(footL - 0.032), w], [x(footL - 0.05), w]], dz), t, t + 0.001),
      box(p + 'cuff', 'cuff', [cx - w / 2 - 0.002, 0, dz - legL], [cx + w / 2 + 0.002, t + 0.002, dz - legL + c.cuff]),
      g.sbox(p + 'sole', 'sole', [x(0.02), 0, dz + w - 0.006], [x(footL - 0.03), t + 0.002, dz + w + 0.002]),
      g.sbox(p + 'split', 'split', [x(footL - 0.05), t, dz + w * 0.45 - 0.002], [x(footL + 0.001), t + 0.003, dz + w * 0.45 + 0.002]),
    ]
    for p in ['l-', 'r-']
    for dz in [if p == 'l-' then (legL + c.gap) / 2 else -(w + c.gap) / 2 - (legL - w) / 2 - w]
  ]);

local diveBoot = { l: 0.29, w: 0.105, t: 0.022, layers: 5, ankle: 0.085, top: 0.19, rx: 0.05, rz: 0.06, collar: 0.02, collarOut: 0.004, toeSlot: 'toecap' };

[
  // Full-face diving mask standing on its chin, front on +z: 190 mm tall, 170 mm across and 110 mm deep, a domed clear
  // visor in a coloured frame and a black rubber skirt, an empty regulator port at the mouth and a four-strap harness
  // behind.
  h.compound('divemask_full_scuba_notready', 0.6,
             ovalRing('skirt', 'skirt', oval(0.068, 0.078, 3, 24, 0.095), oval(0.085, 0.095, 3, 24, 0.095), -0.06, -0.02)
             + ovalRing('frame', 'frame', oval(0.068, 0.078, 3, 24, 0.095), oval(0.078, 0.088, 3, 24, 0.095), -0.02, 0.0)
             + [
               h.prism('visor-0', 'visor', 'z', oval(0.068, 0.078, 3, 24, 0.1), -0.02, 0.012),
               h.prism('visor-1', 'visor', 'z', oval(0.058, 0.066, 3, 24, 0.105), 0.012, 0.03),
               h.prism('visor-2', 'visor', 'z', oval(0.042, 0.048, 3, 24, 0.11), 0.03, 0.04),
               box('nose-bar', 'frame', [-0.07, 0.07, 0.0], [0.07, 0.078, 0.014]),
               h.turned('port', 'port', 'z', [[0, 0.012], [0, 0.024], [0.03, 0.022], [0.03, 0.012], [0, 0.012]], [0, 0.04, 0.0]),
               h.turned('port-throat', 'throat', 'z', [[0, 0], [0, 0.012], [0.026, 0.012], [0.026, 0]], [0, 0.04, 0.002]),
             ]
             + g.wrapBand('strap-top', 'strap', 0.09, 0.003, 100, 260, 14, -0.045, function(a) 0.15, function(a) 0.168)
             + g.wrapBand('strap-low', 'strap', 0.09, 0.003, 100, 260, 14, -0.045, function(a) 0.05, function(a) 0.068)
             + [box('strap-pad', 'strap', [-0.03, 0.04, -0.143], [0.03, 0.18, -0.135])],
             { skirt: 'rubber-black', frame: 'plastic-yellow', visor: 'plastic-clear', port: 'rubber-black', throat: 'screen-black', strap: 'rubber-black' })
  + { voxelGrain: 0.004 },

  // One-piece swimsuit laid flat, 500 mm from crotch to shoulders and 300 mm across the hips, printed with a striped
  // flag and starred canton, its shoulder straps folded down over the front.
  h.compound('flag_swimsuit', 0.24, swimsuit(), { cloth: 'lycra-red', strap: 'lycra-red', band: 'lycra-black', lining: 'cloth-crimson', stripe: 'cloth-bright-white', canton: 'cloth-navy', star: 'cloth-bright-white' })
  + { voxelGrain: 0.004 },

  // Swim goggles standing on their cups, front on +z: two 40 mm cups on a nose bridge, 120 mm across, the silicone
  // strap looped behind.
  h.compound('goggles_swim', 0.03, g.eyewear({ kind: 'goggles', rIn: 0.015, rOut: 0.02, depth: 0.016, gap: 0.014, strapW: 0.008 }),
             { cup: 'plastic-clear-blue', rim: 'rubber-black', lens: 'lens-smoke', bridge: 'rubber-black', strap: 'plastic-blue' })
  + { voxelGrain: 0.002 },

  // Long-sleeved rash vest folded on a shelf, 300 mm by 300 mm and 40 mm tall, contrast sleeves and a chest panel.
  h.compound('rashguard', 0.38,
             g.jacket({ w: 0.3, d: 0.3, ht: 0.04, front: 'none', buttons: 0, collar: { r: 0.055, wd: 0.016, ht: 0.01, gap: 30 }, sleeves: { kind: 'flat', w: 0.07, t: 0.005 } })
             + [box('panel', 'panel', [-0.08, 0.04, -0.06], [0.08, 0.043, 0.0])],
             { cloth: 'lycra-black', collar: 'lycra-blue', sleeve: 'lycra-blue', panel: 'lycra-blue' })
  + { voxelGrain: 0.004 },

  // Mail shark suit laid out flat, 1.8 m from hood to toes and 950 mm across the arms.
  h.compound('shark_suit', 9.1, sharkSuit(), { mail: 'steel-mail', row: 'steel-mail-dark', collar: 'cloth-black' })
  + { voxelGrain: 0.006 },

  // The same suit with copper bonding braids down every limb and a grounding lead ending in a clip.
  h.compound('shark_suit_faraday', 10, sharkSuit(true), { mail: 'steel-mail', row: 'steel-mail-dark', collar: 'cloth-black', braid: 'copper', clip: 'steel-bright' })
  + { voxelGrain: 0.006 },

  // Black racing briefs laid flat, 300 mm across the waist and 150 mm deep.
  h.compound('speedo', 0.052, briefs([[0.075, 0.15], [0.05, 0.145], [0.025, 0.115], [0.0, 0.08], [-0.03, 0.05], [-0.075, 0.038]]),
             { cloth: 'lycra-black', band: 'lycra-black', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // Blue swim briefs laid flat, 320 mm across the waist and 170 mm deep, fuller at the sides, with contrast panels.
  h.compound('swim_briefs', 0.07, briefs([[0.085, 0.16], [0.05, 0.158], [0.02, 0.13], [-0.01, 0.09], [-0.045, 0.055], [-0.085, 0.042]], true),
             { cloth: 'lycra-blue', band: 'cloth-navy', cord: 'cord-cotton', panel: 'cloth-navy' })
  + { voxelGrain: 0.004 },

  // Swim cap standing on its rim, 190 mm across and 120 mm tall, with a rolled edge.
  h.compound('swim_cap', 0.091,
             g.hat({ crown: { r: 0.095, ht: 0.12, p: 2.2, hollow: 0.003 } })
             + [g.ring('roll', 'roll', 0.092, 0.098, 0, 0.008)],
             { crown: 'cloth-yellow', roll: 'cloth-yellow' })
  + { voxelGrain: 0.004 },

  // Swim fins lying flat as a pair, each 600 mm long: a closed foot pocket and a blade 200 mm wide at the tip.
  h.compound('swim_fins', 1.6, fin('l-', -0.115) + fin('r-', 0.115),
             { sole: 'rubber-black', upper: 'rubber-black', blade: 'rubber-yellow', rail: 'rubber-black' })
  + { voxelGrain: 0.004 },

  // Swimming trunks folded on a shelf, 300 mm by 280 mm and 45 mm tall: an elastic waistband with a tied drawcord, a
  // mesh liner showing at the waist and stripes down the sides.
  h.compound('trunks', 0.36,
             h.foldedGarment(0.3, 0.28, 0.045, 3)
             + [
               box('waistband', 'band', [-0.15, 0.045, 0.1], [0.15, 0.05, 0.14]),
               box('liner', 'liner', [-0.145, 0.045, 0.14], [0.145, 0.049, 0.146]),
               box('crotch', 'seam', [-0.004, 0.045, -0.136], [0.004, 0.048, -0.02]),
               box('stripe-l', 'stripe', [-0.15, 0.045, -0.136], [-0.13, 0.048, 0.1]),
               box('stripe-r', 'stripe', [0.13, 0.045, -0.136], [0.15, 0.048, 0.1]),
               g.strip('cord-l', 'cord', [-0.01, 0.12], [-0.03, 0.04], 0.05, 0.006, 0.005),
               g.strip('cord-r', 'cord', [0.01, 0.12], [0.035, 0.045], 0.05, 0.006, 0.005),
             ],
             { cloth: 'cloth-green', band: 'cloth-navy', liner: 'mesh-white', seam: 'cloth-navy', stripe: 'cloth-cream', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // Full wetsuit folded on a shelf, 380 mm by 320 mm and 100 mm tall: black neoprene with blue side panels and collar,
  // a grey chest zip, grey knee pads, the sleeves folded along the sides behind grey flatlock seams and the blue zip
  // leash laid straight down beside the zip.
  h.compound('wetsuit', 2.5,
             g.jacket({ w: 0.38, d: 0.32, ht: 0.1, folds: 4, front: 'placket', frontW: 0.012, buttons: 0, collar: { r: 0.06, wd: 0.022, ht: 0.018, gap: 25 }, sleeves: { kind: 'flat', w: 0.08, t: 0.006 } })
             + [
               box('panel-l', 'panel', [-0.1, 0.1, -0.14], [-0.07, 0.103, 0.0]),
               box('panel-r', 'panel', [0.07, 0.1, -0.14], [0.1, 0.103, 0.0]),
               box('knee-l', 'pad', [-0.065, 0.1, -0.15], [-0.015, 0.104, -0.09]),
               box('knee-r', 'pad', [0.015, 0.1, -0.15], [0.065, 0.104, -0.09]),
               box('leash', 'leash', [0.012, 0.1, -0.13], [0.02, 0.104, 0.0]),
               // Grey flatlock seams along the sleeve folds and across the shoulders.
               box('sleeve-seam-l', 'seam', [-0.115, 0.1, -0.15], [-0.107, 0.103, 0.15]),
               box('sleeve-seam-r', 'seam', [0.107, 0.1, -0.15], [0.115, 0.103, 0.15]),
               box('yoke-seam', 'seam', [-0.107, 0.1, 0.1], [-0.07, 0.103, 0.108]),
               box('yoke-seam-r', 'seam', [0.07, 0.1, 0.1], [0.107, 0.103, 0.108]),
             ],
             { cloth: 'neoprene-black', collar: 'cloth-blue', front: 'canvas-grey', sleeve: 'neoprene-black', panel: 'cloth-blue', pad: 'canvas-grey', leash: 'cloth-blue', seam: 'canvas-grey' })
  + { voxelGrain: 0.004 },

  // Neoprene split-toe dive socks lying flat side by side, both pointing the same way, each 250 mm heel to toe and
  // 100 mm up the leg.
  h.compound('wetsuit_booties', 0.3, diveSocks,
             { sock: 'neoprene-black', heel: 'cloth-charcoal', toe: 'cloth-charcoal', cuff: 'cloth-blue', sole: 'rubber-black', split: 'rubber-black' })
  + { voxelGrain: 0.004 },

  // Thick neoprene dive boots standing as a pair, each 290 mm long and 190 mm tall, on hard rubber soles with a side zip.
  h.compound('wetsuit_booties_thick', 1.2,
             f.pair(diveBoot, 0.03, function(p, cx)
               local s = if p == 'l-' then 1 else -1;
               [
                 g.sbox(p + 'zip', 'zip', [cx + s * diveBoot.rx, diveBoot.t + 0.01, f.shaftZ(diveBoot) - 0.006], [cx + s * (diveBoot.rx + 0.004), diveBoot.top - diveBoot.collar, f.shaftZ(diveBoot) + 0.006]),
                 f.band(p + 'strap', 'strap', diveBoot, cx, 0.1, 0.12, 0.004),
               ]),
             { sole: 'rubber-black', upper: 'neoprene-black', shaft: 'neoprene-black', collar: 'cloth-blue', lining: 'cloth-charcoal', toecap: 'rubber-black', zip: 'plastic-matte-black', strap: 'rubber-black' })
  + { voxelGrain: 0.004 },

  // Neoprene dive gloves lying flat as a pair, backs up, each 250 mm long with a bound cuff.
  h.compound('wetsuit_gloves', 0.2,
             g.glovePair({ t: 0.012, cuff: 0.07, flare: 0.05, binding: 'binding', knuckle: 'knuckle' }),
             { glove: 'neoprene-black', cuff: 'neoprene-black', binding: 'cloth-blue', knuckle: 'rubber-black' })
  + { voxelGrain: 0.004 },
]
