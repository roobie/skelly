local h = import '../compound.libsonnet';
local box = h.box;
// A curved lame lying along x from x0 to x1, crown up and its long edges on the floor: an arc of inner radius `r` and
// thickness `t` spanning `a` degrees either side of the top round an axis at depth z, from `n` flat facets because a
// prism must be convex.
local lame(id, slot, r, t, a, x0, x1, z, y=0, n=6) =
  local rad = a * std.pi / 180, yc = y - r * std.cos(rad);
  [
    local th0 = -rad + 2 * rad * i / n, th1 = -rad + 2 * rad * (i + 1) / n;
    h.prism('%s-%d' % [id, i], slot, 'x', [
      [yc + r * std.cos(th0), z + r * std.sin(th0)],
      [yc + r * std.cos(th1), z + r * std.sin(th1)],
      [yc + (r + t) * std.cos(th1), z + (r + t) * std.sin(th1)],
      [yc + (r + t) * std.cos(th0), z + (r + t) * std.sin(th0)],
    ], x0, x1)
    for i in std.range(0, n - 1)
  ];
// One row of riveted plate on the canvas: a quilted band from xa to xb (outer x of the half, inner at the opening)
// at depth z0 to z1 on side s, standing proud of the cloth at y, with a rivet head every 28 mm along it.
local plateRow(id, s, xa, xb, z0, z1, y) =
  local n = std.max(1, std.floor((xb - xa - 0.012) / 0.028));
  local sx(x) = s * x;
  [box(id, 'cloth', [std.min(sx(xa), sx(xb)), y, z0], [std.max(sx(xa), sx(xb)), y + 0.004, z1])] + [
    local x = xa + 0.014 + (xb - xa - 0.028) * (if n == 1 then 0.5 else i / (n - 1));
    box('%s-r%d' % [id, i], 'rivet', [sx(x) - 0.004, y + 0.004, (z0 + z1) / 2 - 0.004], [sx(x) + 0.004, y + 0.008, (z0 + z1) / 2 + 0.004])
    for i in std.range(0, n - 1)
  ];
// A brigandine laid flat, outside up, neck towards -z, opening down the front at x = 0. Each front half is canvas
// over rows of steel plates riveted through it; three buckled straps close the opening. `coat` adds a split skirt of
// plates below the waist; `shoulders` adds a guard of four overlapping steel lames hanging from each shoulder.
// Slots: cloth, rivet, leather, buckle, guard.
local brigandine(coat, shoulders) =
  local yt = 0.03, hem = if coat then 0.54 else 0.24;
  // Half-front chest outline [z, x] for side +x: neck cut on the inside, armhole on the outside.
  local chest = [[-0.08, 0.005], [-0.08, 0.215], [-0.17, 0.195], [-0.26, 0.15], [-0.26, 0.08], [-0.15, 0.005]];
  local halfWidth(z) = if z < 0.24 then 0.225 else 0.225 + 0.05 * (z - 0.24) / 0.3;
  std.flattenArrays([
    [
      h.prism('chest-%d' % i, 'cloth', 'y', [[p[0], s * p[1]] for p in chest], 0, yt),
      box('body-%d' % i, 'cloth', [std.min(s * 0.005, s * 0.225), 0, -0.08], [std.max(s * 0.005, s * 0.225), yt, 0.24]),
      box('hem-%d' % i, 'leather', [std.min(s * 0.005, s * 0.227), 0, 0.232], [std.max(s * 0.005, s * 0.227), yt + 0.003, 0.242]),
      box('strap-%d' % i, 'leather', [std.min(s * 0.09, s * 0.14), yt, -0.262], [std.max(s * 0.09, s * 0.14), yt + 0.004, -0.17]),
    ]
    + (if coat then [
         h.prism('skirt-%d' % i, 'cloth', 'y', [[0.24, s * 0.005], [0.24, s * 0.225], [0.54, s * 0.275], [0.54, s * 0.005]], 0, yt - 0.008),
         h.prism('skirt-hem-%d' % i, 'leather', 'y', [[0.53, s * 0.005], [0.53, s * 0.273], [0.542, s * 0.277], [0.542, s * 0.005]], 0, yt - 0.005),
       ] else [])
    // Chest rows narrow towards the armhole and neck; body rows run the full half.
    + plateRow('chest-a-%d' % i, s, 0.03, 0.2, -0.125, -0.085, yt)
    + plateRow('chest-b-%d' % i, s, 0.07, 0.16, -0.17, -0.13, yt)
    + std.flattenArrays([
      plateRow('row-%d-%d' % [i, k], s, 0.012, 0.218, -0.075 + k * 0.044, -0.075 + k * 0.044 + 0.04, yt)
      for k in std.range(0, 6)
    ])
    + (if coat then std.flattenArrays([
         local z0 = 0.25 + k * 0.046;
         plateRow('skirt-row-%d-%d' % [i, k], s, 0.012, halfWidth(z0 + 0.04) - 0.006, z0, z0 + 0.042, yt - 0.008)
         for k in std.range(0, 5)
       ]) else [])
    + (if shoulders then lame('guard-%d-0' % i, 'guard', 0.085, 0.003, 58, s * 0.2 - (if s < 0 then 0.05 else 0), s * 0.2 + (if s < 0 then 0 else 0.05), -0.16, 0.006)
                         + lame('guard-%d-1' % i, 'guard', 0.08, 0.003, 58, s * 0.24 - (if s < 0 then 0.045 else 0), s * 0.24 + (if s < 0 then 0 else 0.045), -0.16, 0.003)
                         + lame('guard-%d-2' % i, 'guard', 0.075, 0.003, 58, s * 0.277 - (if s < 0 then 0.04 else 0), s * 0.277 + (if s < 0 then 0 else 0.04), -0.16, 0)
                         + lame('guard-%d-3' % i, 'guard', 0.07, 0.003, 58, s * 0.31 - (if s < 0 then 0.035 else 0), s * 0.31 + (if s < 0 then 0 else 0.035), -0.16, 0)
                         + [box('guard-strap-%d' % i, 'leather', [std.min(s * 0.15, s * 0.215), yt, -0.175], [std.max(s * 0.15, s * 0.215), yt + 0.004, -0.145])]
       else [])
    for i in [0, 1]
    for s in [[-1, 1][i]]
  ]) + [
    // The back panel shows through the neck opening, cut higher than the front.
    box('back-neck', 'cloth', [-0.09, 0, -0.27], [0.09, 0.016, -0.14]),
    box('back-binding', 'leather', [-0.09, 0, -0.278], [0.09, 0.018, -0.268]),
  ] + std.flattenArrays([
    [
      box('close-%d' % k, 'leather', [-0.05, yt + 0.004, z - 0.009], [0.05, yt + 0.008, z + 0.009]),
      box('buckle-%d' % k, 'buckle', [0.03, yt + 0.004, z - 0.013], [0.042, yt + 0.012, z + 0.013]),
    ]
    for k in std.range(0, 2)
    for z in [[-0.05, 0.05, 0.15][k]]
  ]);
local finishes(shoulders) = { cloth: 'cloth-canvas', rivet: 'steel-bright', leather: 'leather-brown', buckle: 'brass-dull' }
                            + (if shoulders then { guard: 'steel-bright' } else {});
[
  // A mild steel brigandine laid flat, outside up: a canvas vest 450 mm across and 500 mm from collar to hem, rows of
  // plates riveted inside it so the outside shows quilted bands studded with rivet heads, leather-bound, and closed
  // down the front with three buckled straps.
  h.compound('lc_brigandine', 4.7, brigandine(false, false), finishes(false)) + { voxelGrain: 0.004 },

  // The same brigandine vest with a guard of four overlapping curved steel lames, 150 mm front to back, strapped to
  // each shoulder and spread out to the sides, 730 mm across in all.
  h.compound('lc_brigandine_shoulders', 5.5, brigandine(false, true), finishes(true)) + { voxelGrain: 0.004 },

  // A mild steel brigandine coat laid flat: the vest's body, 450 mm across, carried on into a skirt split at the
  // front and flaring to 550 mm at the hem, 800 mm from collar to hem, riveted plates all the way down.
  h.compound('lc_coat_brigandine', 7.3, brigandine(true, false), finishes(false)) + { voxelGrain: 0.004 },

  // The brigandine coat with a four-lame steel guard strapped to each shoulder, 730 mm across and 800 mm long.
  h.compound('lc_coat_brigandine_shoulders', 8, brigandine(true, true), finishes(true)) + { voxelGrain: 0.004 },
]
