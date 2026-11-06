local h = import '../compound.libsonnet';
local box = h.box;

// Scarves and a wimple as found on a shelf or the floor: folded square or folded along their length, the open ends
// and fringes towards +z, the rounded fold edges towards -z.

// Raised knit ribs running along z over a folded scarf's top face, `pitch` apart, with a row of tassels hanging
// from the +z ends.
local knitRibs(w, d, ht, pitch) =
  local n = std.floor(w / pitch);
  [
    box('rib-%d' % i, 'rib', [-w / 2 + pitch * (i + 0.25), ht, -d / 2 + 0.006], [-w / 2 + pitch * (i + 0.75), ht + 0.004, d / 2])
    for i in std.range(0, n - 1)
  ];
local tassels(w, d, ht, n, len) = [
  box('tassel-%d' % i, 'tassel', [-w / 2 + 0.008 + (w - 0.02) * i / (n - 1), ht - 0.008, d / 2], [-w / 2 + 0.012 + (w - 0.02) * i / (n - 1), ht - 0.004, d / 2 + len + 0.006 * (i % 2)])
  for i in std.range(0, n - 1)
];
// Two contrasting bands knitted across a scarf near its +z end, on the top face and down the front.
local knitBands(w, d, ht) = std.flattenArrays([
  [
    box('band-top-%d' % k, 'band', [-w / 2, ht, z0], [w / 2, ht + 0.002, z0 + 0.016]),
  ]
  for k in [0, 1]
  for z0 in [d / 2 - 0.05 + 0.028 * k]
]);

// Patchwork: a grid of cloth patches `cols` by `rows` laid over a folded scarf's top face, the finish slot cycling
// so no two neighbours match, plus a row of patches down the +z face.
local patchSlots = ['patch-a', 'patch-b', 'patch-c', 'patch-d'];
local patchwork(w, d, ht, cols, rows) =
  local pw = w / cols, pd = d / rows;
  [
    box('patch-%d-%d' % [i, j], patchSlots[(i + 2 * j) % 4], [-w / 2 + pw * i, ht, -d / 2 + pd * j], [-w / 2 + pw * (i + 1), ht + 0.004, -d / 2 + pd * (j + 1)])
    for i in std.range(0, cols - 1)
    for j in std.range(0, rows - 1)
  ] + [
    box('patch-front-%d' % i, patchSlots[(i + 2 * rows + 1) % 4], [-w / 2 + pw * i, 0, d / 2], [-w / 2 + pw * (i + 1), ht, d / 2 + 0.004])
    for i in std.range(0, cols - 1)
  ] + [
    // Dark seams between the patches on top.
    box('seam-x-%d' % i, 'seam', [-w / 2 + pw * i - 0.001, ht + 0.004, -d / 2], [-w / 2 + pw * i + 0.001, ht + 0.006, d / 2])
    for i in std.range(1, cols - 1)
  ] + [
    box('seam-z-%d' % j, 'seam', [-w / 2, ht + 0.004, -d / 2 + pd * j - 0.001], [w / 2, ht + 0.006, -d / 2 + pd * j + 0.001])
    for j in std.range(1, rows - 1)
  ];
local patchFinishes = { cloth: 'cloth-cream', 'patch-a': 'cloth-red', 'patch-b': 'cloth-blue', 'patch-c': 'cloth-yellow', 'patch-d': 'cloth-green', seam: 'cloth-brown' };

[
  // A cotton keffiyeh folded square, 260 mm across and 35 mm tall with its pattern: white cloth woven with a black
  // net pattern, black border stripes round the top and a knotted fringe along the front.
  h.compound('keffiyeh', 0.29, h.foldedGarment(0.26, 0.26, 0.03, 5) + [
    box('net-x-%d' % i, 'pattern', [-0.1, 0.03, -0.1 + 0.02 * i], [0.1, 0.032, -0.096 + 0.02 * i])
    for i in std.range(0, 10)
  ] + [
    box('net-z-%d' % i, 'pattern', [-0.1 + 0.02 * i, 0.03, -0.1], [-0.096 + 0.02 * i, 0.032, 0.104])
    for i in std.range(0, 10)
  ] + [
    box('border-l', 'pattern', [-0.124, 0.03, -0.124], [-0.112, 0.034, 0.13]),
    box('border-r', 'pattern', [0.112, 0.03, -0.124], [0.124, 0.034, 0.13]),
    box('border-back', 'pattern', [-0.124, 0.03, -0.124], [0.124, 0.034, -0.112]),
    box('border-front', 'pattern', [-0.124, 0.03, 0.112], [0.124, 0.034, 0.124]),
  ] + [
    box('fringe-%d' % i, if i % 2 == 0 then 'pattern' else 'fringe', [-0.124 + 0.012 * i, 0.022, 0.13], [-0.118 + 0.012 * i, 0.028, 0.15 + 0.006 * (i % 3)])
    for i in std.range(0, 20)
  ], { cloth: 'cloth-cream', pattern: 'cloth-black', fringe: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A knitted cotton scarf about 1.5 m long folded into a stack, 180 mm across, 240 mm deep and 50 mm tall: ribbed
  // red knit with two cream bands near the end and a row of tassels hanging out at the front.
  h.compound('knit_scarf', 0.25, h.foldedGarment(0.18, 0.24, 0.046, 4)
                                  + knitRibs(0.18, 0.24, 0.046, 0.016)
                                  + knitBands(0.18, 0.24, 0.05)
                                  + tassels(0.18, 0.24, 0.046, 12, 0.035),
             { cloth: 'cloth-red', rib: 'cloth-red', band: 'cloth-cream', tassel: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A knitted cotton scarf about 2.5 m long folded into a deeper stack, 200 mm across, 300 mm deep and 76 mm tall:
  // ribbed grey knit with two navy bands near the end and navy tassels at the front.
  h.compound('long_knit_scarf', 0.45, h.foldedGarment(0.2, 0.3, 0.072, 6)
                                       + knitRibs(0.2, 0.3, 0.072, 0.016)
                                       + knitBands(0.2, 0.3, 0.076)
                                       + tassels(0.2, 0.3, 0.072, 14, 0.04),
             { cloth: 'wool-grey', rib: 'wool-grey', band: 'cloth-navy', tassel: 'cloth-navy' })
  + { voxelGrain: 0.004 },

  // A light scarf sewn from cotton scraps, folded into a stack 180 mm across, 200 mm deep and 24 mm tall: square
  // patches of red, blue, yellow and green with dark seams between them.
  h.compound('patchwork_scarf', 0.13, h.foldedGarment(0.18, 0.2, 0.02, 3) + patchwork(0.18, 0.2, 0.02, 4, 4), patchFinishes)
  + { voxelGrain: 0.004 },

  // A longer patchwork scarf folded into a stack 220 mm across, 260 mm deep and 34 mm tall: more and smaller patches.
  h.compound('long_patchwork_scarf', 0.22, h.foldedGarment(0.22, 0.26, 0.03, 5) + patchwork(0.22, 0.26, 0.03, 5, 6), patchFinishes)
  + { voxelGrain: 0.004 },

  // A nun's wimple folded flat, 220 mm across, 180 mm deep and 22 mm tall: the white linen headwrap folded in two,
  // with the black veil folded over its back half and a white band showing along the front.
  h.compound('nun_wimple', 0.15, h.foldedGarment(0.22, 0.18, 0.012, 2) + [
    box('veil', 'veil', [-0.11, 0.012, -0.09], [0.11, 0.02, 0.02]),
    h.turned('veil-fold', 'veil', 'x', [[0, 0], [0, 0.005], [0.22, 0.005], [0.22, 0]], [-0.11, 0.015, -0.09]),
    box('veil-hem', 'hem', [-0.11, 0.02, 0.008], [0.11, 0.022, 0.02]),
    box('band', 'band', [-0.11, 0.012, 0.05], [0.11, 0.016, 0.07]),
  ], { cloth: 'cloth-bright-white', veil: 'cloth-black', hem: 'cloth-charcoal', band: 'cloth-cream' })
  + { voxelGrain: 0.004 },
]
