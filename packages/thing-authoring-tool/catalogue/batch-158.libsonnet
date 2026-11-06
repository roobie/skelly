local h = import '../compound.libsonnet';
local box = h.box;

// Neckties, costume fangs and scarves as found on a shelf or the floor: ties laid flat or rolled, scarves folded,
// the cowl lying as a loop, front on +z.

local rad(a) = a * std.pi / 180;

// A flat piece lying on y from y0 to y1, outline given as [x, z] points.
local flat(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y0, y1);

// A point at radius r and angle a (degrees, 0 towards +z, positive towards +x) as [x, z].
local polar(r, a, cx=0, cz=0) = [cx + r * std.sin(rad(a)), cz + r * std.cos(rad(a))];

// A flat ring lying on y between radii r0 and r1.
local ringY(id, slot, r0, r1, y0, y1, x=0, z=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);

// Clip-on tie: blade half width along z, from the knot (z = -0.17) to the shoulders of the tip (z = 0.18).
local clipHw(z) = 0.02 + (0.0425 - 0.02) * (z + 0.17) / 0.35;

// Rolled necktie: a spiral of `turns` turns from r0 outwards, `t` thick per layer, its height rising from the narrow
// end at the centre to the wide end outside.
local coilTurns = 4, coilSteps = 20, coilR0 = 0.012, coilT = 0.006, coilH0 = 0.036, coilH1 = 0.08;
local coilR(i) = coilR0 + coilT * i / coilSteps;
local coilA(i) = 360 * i / coilSteps;
local coilN = coilTurns * coilSteps;

// Folded scarf: h.foldedGarment with a hem along its +z edge.
local foldedScarf(w, d, ht, folds) =
  h.foldedGarment(w, d, ht, folds)
  + [box('hem', 'hem', [-w / 2, ht, d / 2 - 0.012], [w / 2, ht + 0.003, d / 2])];

// Knit cowl: a soft tube looped flat, centre radius cowlR, tube half height cowlRy and half width cowlRr.
local cowlR = 0.1, cowlRy = 0.03, cowlRr = 0.042;
local cowlRibs = 32;

[
  // A clip-on necktie laid flat, 450 mm long and 85 mm across at the blade: a pre-tied knot with a steel clip behind
  // it, the blue blade striped diagonally in silver and cut to a point.
  h.compound('tie_clipon', 0.045, [
    flat('blade', 'cloth', [[-0.02, -0.17], [0.02, -0.17], [0.0425, 0.18], [0, 0.222], [-0.0425, 0.18]], 0, 0.004),
    flat('knot', 'cloth', [[-0.023, -0.222], [0.023, -0.222], [0.017, -0.168], [-0.017, -0.168]], 0, 0.012),
    box('clip', 'clip', [-0.016, 0.004, -0.238], [0.016, 0.007, -0.205]),
    box('clip-tab', 'clip', [-0.006, 0.006, -0.242], [0.006, 0.009, -0.234]),
  ] + [
    local a = -0.16 + 0.045 * i, d = 0.035, s = 0.009;
    flat('stripe-%d' % i, 'stripe', [[-clipHw(a), a], [clipHw(a + d), a + d], [clipHw(a + d + s), a + d + s], [-clipHw(a + s), a + s]], 0.004, 0.006)
    for i in std.range(0, 6)
  ] + [
    flat('knot-stripe-%d' % i, 'stripe', [[-0.02, -0.215 + 0.018 * i], [0.02, -0.205 + 0.018 * i], [0.019, -0.199 + 0.018 * i], [-0.021, -0.209 + 0.018 * i]], 0.012, 0.014)
    for i in std.range(0, 1)
  ], { cloth: 'cloth-blue', stripe: 'cloth-shimmer', clip: 'metal-silver' })
  + { voxelGrain: 0.002 },

  // A green silk-look necktie rolled up as it is stored, 100 mm across and 80 mm tall: the narrow end coiled at the
  // centre, the turns rising to the wide blade outside with gold stripes slanting round it, and the pointed end of the
  // blade unrolled to lie out flat on the floor.
  h.compound('tie_necktie', 0.06, [
    local f = (i + 0.5) / coilN;
    h.prism('coil-%d' % i, 'cloth', 'y', [[q[1], q[0]] for q in [polar(coilR(i), coilA(i)), polar(coilR(i + 1), coilA(i + 1)), polar(coilR(i + 1) + coilT, coilA(i + 1)), polar(coilR(i) + coilT, coilA(i))]], 0, coilH0 + (coilH1 - coilH0) * f)
    for i in std.range(0, coilN - 1)
  ] + [
    local r = coilR(coilN);
    flat('tip', 'cloth', [[0, r], [0.07, r], [0.105, r + coilH1 / 2], [0.07, r + coilH1], [0, r + coilH1]], 0, 0.004),
  ] + [
    // Stripes slanting round the outer turn, as a diagonal stripe shows on a rolled tie.
    local i0 = coilN - coilSteps + i, f = i / coilSteps;
    local yc = 0.006 + 0.02 * j + 0.02 * f, hi = coilH0 + (coilH1 - coilH0) * (i0 + 0.5) / coilN;
    h.prism('stripe-%d-%d' % [j, i], 'stripe', 'y', [[q[1], q[0]] for q in [polar(coilR(i0) + coilT, coilA(i0)), polar(coilR(i0 + 1) + coilT, coilA(i0 + 1)), polar(coilR(i0 + 1) + coilT + 0.0015, coilA(i0 + 1)), polar(coilR(i0) + coilT + 0.0015, coilA(i0))]], yc - 0.003, std.min(yc + 0.003, hi))
    for j in std.range(0, 3)
    for i in std.range(0, coilSteps - 1)
    if 0.006 + 0.02 * j + 0.02 * i / coilSteps + 0.004 < coilH0 + (coilH1 - coilH0) * (coilN - coilSteps + i + 0.5) / coilN
  ] + [
    // The same stripes across the flat tip.
    local r = coilR(coilN), x = 0.012 + 0.022 * j;
    h.prism('tip-stripe-%d' % j, 'stripe', 'y', [[q[1], q[0]] for q in [[x, r + 0.004], [x + 0.006, r + 0.004], [x + 0.026, r + coilH1 - 0.004], [x + 0.02, r + coilH1 - 0.004]]], 0.004, 0.0055)
    for j in std.range(0, 2)
  ], { cloth: 'cloth-green', stripe: 'brass-dull' })
  + { voxelGrain: 0.002 },

  // A skinny necktie folded in half and laid flat, 710 mm long: the 50 mm blade and the 30 mm tail side by side,
  // joined at the fold, black checked in white with pointed tips.
  h.compound('tie_skinny', 0.04, [
    flat('blade', 'cloth', [[-0.055, -0.34], [-0.005, -0.34], [-0.005, 0.32], [-0.03, 0.345], [-0.055, 0.32]], 0, 0.004),
    flat('tail', 'cloth', [[0.005, -0.34], [0.035, -0.34], [0.035, 0.29], [0.02, 0.305], [0.005, 0.29]], 0, 0.004),
    box('fold', 'cloth', [-0.055, 0, -0.362], [0.035, 0.006, -0.336]),
  ] + [
    box('check-b-%d-%d' % [i, j], 'check', [-0.055 + 0.01 * j, 0.004, -0.33 + 0.01 * i], [-0.045 + 0.01 * j, 0.006, -0.32 + 0.01 * i])
    for i in std.range(0, 64)
    for j in std.range(0, 4)
    if (i + j) % 2 == 0
  ] + [
    box('check-t-%d-%d' % [i, j], 'check', [0.005 + 0.01 * j, 0.004, -0.33 + 0.01 * i], [0.015 + 0.01 * j, 0.006, -0.32 + 0.01 * i])
    for i in std.range(0, 61)
    for j in std.range(0, 2)
    if (i + j) % 2 == 0
  ], { cloth: 'cloth-black', check: 'cloth-bright-white' })
  + { voxelGrain: 0.002 },

  // A set of plastic vampire fangs lying gum down, 56 mm across, 48 mm deep and 26 mm tall: a pink horseshoe of gum
  // carrying a row of white teeth, with two long pointed canines.
  h.compound('vampire_fangs', 0.007,
             h.crescent('gum', 'gum', 0.015, 0.027, -105, 105, 14, 0, 0.009)
             + [
               local a = [-92, -76, -60, -48, -22, -8, 8, 22, 48, 60, 76, 92][k];
               local p = polar(0.021, a);
               h.turned('tooth-%d' % k, 'tooth', 'y', [[0, 0], [0, 0.0027], [0.004, 0.0027], [0.0065, 0.002], [0.007, 0]], [p[0], 0.008, p[1]])
               for k in std.range(0, 11)
             ]
             + [
               local p = polar(0.021, a);
               h.turned('fang-%d' % (if a < 0 then 0 else 1), 'tooth', 'y', [[0, 0], [0, 0.0034], [0.005, 0.0032], [0.013, 0.0018], [0.019, 0]], [p[0], 0.008, p[1]])
               for a in [-36, 36]
             ],
             { gum: 'plastic-pink', tooth: 'bone' })
  + { voxelGrain: 0.002 },

  // A white wedding veil laid loosely folded, 280 mm by 220 mm and 20 mm tall with its comb: a thin double layer of
  // fine net falling in soft folds from the comb, edged with scalloped lace, a silver comb studded with pearls
  // gathering it at the top.
  h.compound('veil_wedding', 0.1, [
    flat('net', 'cloth', [[-0.06, -0.075], [0.06, -0.075], [0.14, 0.1], [-0.14, 0.1]], 0, 0.003),
  ] + [
    // Soft folds fanning out from the comb to the hem.
    local xa = -0.045 + 0.015 * i, xb = -0.12 + 0.04 * i;
    h.prism('fold-%d' % i, 'cloth', 'y', [[q[1], q[0]] for q in [[xa - 0.004, -0.06], [xa + 0.004, -0.06], [xb + 0.011, 0.1], [xb - 0.011, 0.1]]], 0.003, 0.003 + 0.004 + 0.006 * (i % 2))
    for i in std.range(0, 6)
  ] + [
    h.disc('lace-%d' % i, 'lace', 0.0085, 0, 0.004, -0.13 + 0.0163 * i, 0.101)
    for i in std.range(0, 16)
  ] + [
    box('comb-bar', 'comb', [-0.06, 0.003, -0.09], [0.06, 0.012, -0.074]),
  ] + [
    box('comb-tooth-%d' % i, 'comb', [-0.057 + 0.0074 * i, 0.003, -0.074], [-0.055 + 0.0074 * i, 0.006, -0.05])
    for i in std.range(0, 15)
  ] + [
    h.disc('pearl-%d' % i, 'pearl', 0.0035, 0.012, 0.017, -0.048 + 0.012 * i, -0.082)
    for i in std.range(0, 8)
  ], { cloth: 'mesh-white', lace: 'lace-white', comb: 'metal-silver', pearl: 'pearl' })
  + { voxelGrain: 0.002 },

  // A chunky knit cowl lying flat as a loop, 285 mm across and 64 mm tall: a soft oatmeal wool tube ribbed all the way
  // round.
  h.compound('cowl_wool', 0.54, [
    h.turned('tube', 'cloth', 'y', [
      [cowlRy + cowlRy * std.cos(rad(a)), cowlR + cowlRr * std.sin(rad(a))]
      for a in [k * 24 for k in std.range(0, 15)] + [0]
    ], [0, 0, 0]),
  ] + std.flattenArrays([
    local a0 = 360 * k / cowlRibs, a1 = a0 + 360 / cowlRibs * 0.55;
    local band(id, y0, y1, w) = h.prism(id, 'rib', 'y', [[q[1], q[0]] for q in [polar(cowlR + w, a0), polar(cowlR + w, a1), polar(cowlR - w, a1), polar(cowlR - w, a0)]], y0, y1);
    [
      band('rib-%d-a' % k, 0.003, 0.016, cowlRr * 0.8 + 0.002),
      band('rib-%d-b' % k, 0.012, 0.048, cowlRr + 0.003),
      band('rib-%d-c' % k, 0.044, 0.061, cowlRr * 0.8 + 0.002),
    ]
    for k in std.range(0, cowlRibs - 1)
  ]), { cloth: 'jute', rib: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A keffiyeh of woven dry grass folded square, 300 mm across and 34 mm tall with its cords: a crisscross of
  // darker grass strands over the weave, a ragged fringe along the front edge and a doubled cord ring on top.
  h.compound('grass_keffiyeh', 0.35, h.foldedGarment(0.3, 0.3, 0.024, 4) + [
    box('weave-x-%d' % i, 'strand', [-0.15, 0.024, -0.135 + 0.03 * i], [0.15, 0.026, -0.129 + 0.03 * i])
    for i in std.range(0, 9)
  ] + [
    box('weave-z-%d' % i, 'strand', [-0.135 + 0.03 * i, 0.024, -0.147], [-0.129 + 0.03 * i, 0.026, 0.15])
    for i in std.range(0, 9)
  ] + [
    box('fringe-%d' % i, 'strand', [-0.145 + 0.0125 * i, 0, 0.15], [-0.141 + 0.0125 * i, 0.004, 0.172 + 0.006 * (i % 3)])
    for i in std.range(0, 23)
  ] + [
    ringY('cord-a', 'cord', 0.078, 0.087, 0.026, 0.032),
    ringY('cord-b', 'cord', 0.082, 0.091, 0.032, 0.038, 0.004, 0.003),
  ], { cloth: 'straw-wicker', strand: 'plant-dried', cord: 'jute' })
  + { voxelGrain: 0.004 },

  // A crimson cotton headscarf folded square, 240 mm by 220 mm and 23 mm tall: a cream border woven in along its
  // top edges and a short knotted fringe hanging from the front.
  h.compound('headscarf', 0.1, foldedScarf(0.24, 0.22, 0.02, 3) + [
    box('border-l', 'hem', [-0.12, 0.02, -0.11], [-0.108, 0.023, 0.11]),
    box('border-r', 'hem', [0.108, 0.02, -0.11], [0.12, 0.023, 0.11]),
    box('border-back', 'hem', [-0.12, 0.02, -0.11], [0.12, 0.023, -0.098]),
  ] + [
    box('fringe-%d' % i, 'fringe', [-0.112 + 0.012 * i, 0.002, 0.11], [-0.108 + 0.012 * i, 0.006, 0.13])
    for i in std.range(0, 18)
  ], { cloth: 'cloth-crimson', hem: 'cloth-cream', fringe: 'cloth-crimson' })
  + { voxelGrain: 0.004 },
]
