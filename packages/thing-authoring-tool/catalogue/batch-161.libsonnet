local h = import '../compound.libsonnet';
local box = h.box;

// Wool scarves, a prayer shawl and throat guards as found on a shelf or the floor: scarves and the shawl folded,
// throat guards standing on their lower edge as a collar open at the back, front on +z.

local rad(a) = a * std.pi / 180;

// A point at radius r and angle a (degrees, 0 towards +z, positive towards +x) as [x, z].
local polar(r, a) = [r * std.sin(rad(a)), r * std.cos(rad(a))];

// One upright wall segment of a collar between angles a0 and a1, radii r0 to r1, from y0 to y1.
local seg(id, slot, r0, r1, a0, a1, y0, y1) =
  h.prism(id, slot, 'y', [[q[1], q[0]] for q in [polar(r1, a0), polar(r1, a1), polar(r0, a1), polar(r0, a0)]], y0, y1);

// A collar wall from a0 to a1 in `steps` segments; `bottom(a)` gives the lower edge at the segment's middle angle,
// so a bib can drop lower at the front.
local wall(prefix, slot, r0, r1, a0, a1, steps, bottom, y1) = [
  local b0 = a0 + (a1 - a0) * i / steps, b1 = a0 + (a1 - a0) * (i + 1) / steps;
  seg('%s-%d' % [prefix, i], slot, r0, r1, b0, b1, bottom((b0 + b1) / 2), y1)
  for i in std.range(0, steps - 1)
];

// Folded scarf: a fold stack with knitted rib lines along x on top and a fringe hanging off its +z edge.
local scarf(w, d, ht, folds, ribs, stripes, fringe) =
  h.foldedGarment(w, d, ht, folds)
  + [
    box('rib-%d' % i, 'rib', [-w / 2 + 0.008, ht, -d / 2 + 0.012 + (d - 0.024) * i / (ribs - 1)], [w / 2 - 0.008, ht + 0.002, -d / 2 + 0.016 + (d - 0.024) * i / (ribs - 1)])
    for i in std.range(0, ribs - 1)
  ]
  + [
    box('stripe-%d' % i, 'stripe', [s - 0.009, ht, -d / 2 + 0.004], [s + 0.009, ht + 0.003, d / 2])
    for i in std.range(0, std.length(stripes) - 1)
    for s in [stripes[i]]
  ]
  + [
    box('fringe-%d' % i, 'fringe', [-w / 2 + 0.01 + (w - 0.024) * i / (fringe - 1), 0.002, d / 2], [-w / 2 + 0.014 + (w - 0.024) * i / (fringe - 1), 0.006, d / 2 + 0.03 + 0.006 * (i % 3)])
    for i in std.range(0, fringe - 1)
  ];

// Prayer shawl tassel: a knot at the front corner of the folded stack (top at ht), a cord dropping over the edge,
// and thin strands fanning out across the floor in front of it.
local tassel(id, x, z, ht) = [
  box(id + '-knot', 'tassel', [x - 0.006, ht - 0.006, z - 0.004], [x + 0.006, ht + 0.004, z + 0.006]),
  box(id + '-drop', 'tassel', [x - 0.004, 0, z + 0.002], [x + 0.004, ht - 0.004, z + 0.008]),
] + [
  local ang = rad(-40 + 16 * k), len = 0.07 + 0.012 * (k % 3);
  local dx = std.sin(ang), dz = std.cos(ang), nx = -dz * 0.0013, nz = dx * 0.0013;
  local x0 = x, z0 = z + 0.006, x1 = x + dx * len, z1 = z0 + dz * len;
  h.prism('%s-strand-%d' % [id, k], 'tassel', 'y', [[z0 + nz, x0 + nx], [z1 + nz, x1 + nx], [z1 - nz, x1 - nx], [z0 - nz, x0 - nx]], 0, 0.002)
  for k in std.range(0, 5)
];

// Hockey-style throat guard: a padded band open at the back with a bib dropping at the front.
local guardR0 = 0.058, guardR1 = 0.066;
local guardBottom(a) = if std.abs(a) < 50 then 0.045 * std.abs(a) / 50 else 0.045;

[
  // A long knitted wool scarf folded in a stack, 270 mm by 180 mm and 52 mm tall (about 2.4 m by 280 mm
  // unfolded): navy with two cream stripes across the top fold and a fringe hanging from the front edge.
  h.compound('scarf_wool_long', 0.35, scarf(0.27, 0.18, 0.048, 4, 9, [-0.08, 0.08], 18),
             { cloth: 'cloth-navy', rib: 'cloth-navy', stripe: 'cloth-cream', fringe: 'cloth-navy' })
  + { voxelGrain: 0.004 },

  // A plain wool scarf folded in a stack, 200 mm by 140 mm and 38 mm tall (about 1.5 m by 200 mm unfolded): grey
  // knit with darker rib lines and a short fringe.
  h.compound('scarf_wool', 0.14, scarf(0.2, 0.14, 0.034, 3, 7, [], 13),
             { cloth: 'wool-grey', rib: 'plastic-charcoal', stripe: 'wool-grey', fringe: 'wool-grey' })
  + { voxelGrain: 0.004 },

  // A wool prayer shawl folded square, 300 mm by 230 mm and 35 mm tall (about 1.8 m by 1.4 m unfolded): cream wool
  // with black bands near each end, a silver-woven neckband along the back and knotted white fringes hanging from the front corners onto the floor.
  h.compound('tallit_gadol', 0.3, h.foldedGarment(0.3, 0.23, 0.03, 4) + [
    box('band-%d-%d' % [s, k], 'band', [s * (0.1 + 0.018 * k) - 0.006, 0.03, -0.112], [s * (0.1 + 0.018 * k) + 0.006, 0.033, 0.115])
    for s in [-1, 1]
    for k in [0, 1, 2]
  ] + [
    box('atara', 'atara', [-0.11, 0.03, -0.113], [0.11, 0.035, -0.078]),
  ] + tassel('tassel-l', -0.135, 0.115, 0.03) + tassel('tassel-r', 0.135, 0.115, 0.03),
  { cloth: 'cloth-cream', band: 'cloth-black', atara: 'cloth-shimmer', tassel: 'cloth-bright-white' })
  + { voxelGrain: 0.002 },

  // A sports throat guard standing on its edge, 132 mm across and 90 mm tall: a padded nylon band 8 mm thick, open at
  // the back where a hook-and-loop tab closes it, with a rounded bib dropping 45 mm lower at the front over the
  // throat, bound along its edges.
  h.compound('throat_guard', 0.041,
             wall('band', 'cloth', guardR0, guardR1, -150, 150, 30, guardBottom, 0.09)
             + wall('bind-top', 'binding', guardR0 - 0.001, guardR1 + 0.001, -150, 150, 30, function(a) 0.085, 0.09)
             + [
               local b0 = -150 + 10 * i, b1 = b0 + 10, y = guardBottom(b0 + 5);
               seg('bind-low-%d' % i, 'binding', guardR0 - 0.001, guardR1 + 0.001, b0, b1, y, y + 0.005)
               for i in std.range(0, 29)
             ]
             + wall('hook', 'hook', guardR1, guardR1 + 0.003, 118, 148, 4, function(a) 0.05, 0.08)
             + wall('loop', 'hook', guardR0 - 0.003, guardR0, -148, -118, 4, function(a) 0.05, 0.08),
             { cloth: 'nylon-black', binding: 'cloth-charcoal', hook: 'hook-loop-grey' })
  + { voxelGrain: 0.002 },

  // A mercenary throat guard standing on its edge, 176 mm across and 112 mm tall: a ballistic collar 14 mm thick in a
  // coyote nylon cover, open at the back with hook-and-loop tabs, its throat flap dropping 52 mm at the front; the
  // black nylon guard sewn inside shows above the collar's top edge.
  h.compound('throat_guard_ballistic', 0.3,
             wall('collar', 'cover', 0.072, 0.086, -145, 145, 29, function(a) if std.abs(a) < 55 then 0.052 * std.abs(a) / 55 else 0.052, 0.1)
             + wall('inner', 'inner', 0.064, 0.072, -150, 150, 30, function(a) 0.05, 0.112)
             + wall('seam-top', 'seam', 0.071, 0.087, -145, 145, 29, function(a) 0.096, 0.1)
             + wall('flap-patch', 'hook', 0.086, 0.088, -22, 22, 6, function(a) 0.022, 0.07)
             + wall('hook', 'hook', 0.086, 0.089, 118, 143, 4, function(a) 0.062, 0.09)
             + wall('loop', 'hook', 0.061, 0.064, -148, -122, 4, function(a) 0.058, 0.1),
             { cover: 'nylon-coyote', inner: 'nylon-black', seam: 'webbing-olive-dark', hook: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },

  // A fencing gorget standing on its lower edge, 290 mm across and 170 mm tall: a stiff collar of rubber under black
  // nylon, open at the back, flaring at the front into a broad bib sloping smoothly down over the collarbones and upper chest, with short
  // flaps over the sides of the nape and red binding round every edge.
  h.compound('gorget_fencing', 0.26,
             wall('collar', 'cover', 0.064, 0.076, -160, 160, 32, function(a) 0.1, 0.17)
             + std.flattenArrays([
               // Fine steps, finer than the voxel grain, so the bib reads as one smooth slope from the collar.
               local r = 0.076 + 0.0032 * (k + 1), span = 70 + 2.4 * (k + 1);
               wall('bib-%d' % k, 'cover', 0.064, r, -span, span, 10, function(a) 0.1 - 0.005 * (k + 1), 0.1 - 0.005 * k)
               for k in std.range(0, 19)
             ])
             + wall('nape-l', 'cover', 0.074, 0.088, 112, 160, 7, function(a) 0.075, 0.1)
             + wall('nape-r', 'cover', 0.074, 0.088, -160, -112, 7, function(a) 0.075, 0.1)
             + wall('bind-top', 'binding', 0.063, 0.077, -160, 160, 32, function(a) 0.164, 0.17)
             + wall('bind-bib', 'binding', 0.136, 0.142, -118, 118, 20, function(a) 0, 0.006)
             + wall('bind-nape-l', 'binding', 0.073, 0.089, 112, 160, 7, function(a) 0.075, 0.08)
             + wall('bind-nape-r', 'binding', 0.073, 0.089, -160, -112, 7, function(a) 0.075, 0.08)
             + wall('hook', 'hook', 0.061, 0.064, -158, -130, 4, function(a) 0.11, 0.16),
             { cover: 'nylon-black', binding: 'cloth-red', hook: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },
]
