local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;
local disc = h.disc;
// A plate bent round an axis along x, lying crown up from x0 to x1: `w` across z centred on z0, inner radius `r`,
// `t` thick, its long edges on the floor at y0. Built from `n` flat facets because a prism must be convex. A facet
// whose middle lies more than `w / 2 - cut` off centre ends short of x1 by that excess, which chamfers the +x corners
// into a shooter's cut. `slotOf(i)` names each facet's slot.
local curvedPlate(id, slotOf, w, r, t, x0, x1, cut=0, n=12, z0=0, y0=0) =
  local a = std.asin(w / 2 / r), yc = y0 - r * std.cos(a);
  [
    local th0 = -a + 2 * a * i / n, th1 = -a + 2 * a * (i + 1) / n,
          zm = r * std.sin((th0 + th1) / 2), over = std.max(0, std.abs(zm) - (w / 2 - cut));
    h.prism('%s-%d' % [id, i], slotOf(i), 'x', [
      [yc + r * std.cos(th0), z0 + r * std.sin(th0)],
      [yc + r * std.cos(th1), z0 + r * std.sin(th1)],
      [yc + (r + t) * std.cos(th1), z0 + (r + t) * std.sin(th1)],
      [yc + (r + t) * std.cos(th0), z0 + (r + t) * std.sin(th0)],
    ], x0, x1 - over)
    for i in std.range(0, n - 1)
  ];
// A band lying on the outside of a curvedPlate of the same w, r, t, from x0 to x1, `bt` thick: a strap, a binding
// or a rag wrapped across the plate. Pass the plate's cut and x1 as `cut` and `plateX1` to stop at its chamfer.
local plateBand(id, slot, w, r, t, x0, x1, bt, n=12, z0=0, y0=0, cut=0, plateX1=null) =
  local a = std.asin(w / 2 / r), yc = y0 - r * std.cos(a);
  [
    local th0 = -a + 2 * a * i / n, th1 = -a + 2 * a * (i + 1) / n,
          zm = r * std.sin((th0 + th1) / 2), over = std.max(0, std.abs(zm) - (w / 2 - cut)),
          end = if plateX1 == null then x1 else std.min(x1, plateX1 - over),
          start = if plateX1 == null then x0 else std.min(x0, end - (x1 - x0));
    h.prism('%s-%d' % [id, i], slot, 'x', [
      [yc + (r + t) * std.cos(th0), z0 + (r + t) * std.sin(th0)],
      [yc + (r + t) * std.cos(th1), z0 + (r + t) * std.sin(th1)],
      [yc + (r + t + bt) * std.cos(th1), z0 + (r + t + bt) * std.sin(th1)],
      [yc + (r + t + bt) * std.cos(th0), z0 + (r + t + bt) * std.sin(th0)],
    ], start, end)
    for i in std.range(0, n - 1)
  ];
// A flat hexagonal side plate lying on y0, `l` long along x and `w` across z, its pointed ends at ±x.
local hexPlate(id, slot, l, w, y0, y1, x=0, z=0) =
  h.prism(id, slot, 'y', [
    [z, x - l / 2],
    [z + w / 2, x - l / 2 + w * 0.3],
    [z + w / 2, x + l / 2 - w * 0.3],
    [z, x + l / 2],
    [z - w / 2, x + l / 2 - w * 0.3],
    [z - w / 2, x - l / 2 + w * 0.3],
  ], y0, y1);
// The bound edges and buckled straps of a survivor-forged ESAPI plate, 240 mm across, 300 mm long, bent round 350 mm.
local forgedEsapi =
  local w = 0.24, r = 0.35, t = 0.005, n = 12, cut = 0.06;
  curvedPlate('plate', function(i) if i == 0 || i == n - 1 then 'edge' else 'plate', w, r, t, -0.15, 0.15, cut, n)
  + plateBand('bind-tail', 'edge', w, r, t, -0.15, -0.135, 0.003, n)
  + plateBand('bind-head', 'edge', w, r, t, 0.135, 0.15, 0.003, n, cut=cut, plateX1=0.15)
  + std.flattenArrays([
    plateBand('strap-%d' % k, 'edge', w, r, t, x, x + 0.025, 0.003, n)
    + [box('buckle-%d' % k, 'buckle', [x - 0.003, 0.02, -0.03], [x + 0.028, 0.032, 0.0])]
    for k in [0, 1]
    for x in [[-0.08, 0.04][k]]
  ]);
// A vest laid flat, outside up, `t` thick with its neck at -z and its hem at +z: a body 480 mm across from the hem to
// the armholes, narrowing to 340 mm at the shoulders, two shoulder straps either side of the neck, and a side strap
// out from each side with a hook and loop tab. Slots: shell, strap, tab.
local flatVest(t) = [
  h.prism('body', 'shell', 'y', [[0.26, -0.21], [0.26, 0.21], [0.23, 0.24], [-0.05, 0.24], [-0.05, -0.24], [0.23, -0.24]], 0, t),
  h.prism('chest', 'shell', 'y', [[-0.05, -0.24], [-0.05, 0.24], [-0.17, 0.17], [-0.17, -0.17]], 0, t),
  box('shoulder-l', 'shell', [-0.17, 0, -0.3], [-0.08, t * 0.9, -0.17]),
  box('shoulder-r', 'shell', [0.08, 0, -0.3], [0.17, t * 0.9, -0.17]),
] + std.flattenArrays([
  [
    box('side-%d' % s, 'strap', [if s < 0 then -0.34 else 0.24, 0, 0.02], [if s < 0 then -0.24 else 0.34, 0.006, 0.2]),
    box('side-tab-%d' % s, 'tab', [if s < 0 then -0.34 else 0.3, 0.006, 0.03], [if s < 0 then -0.3 else 0.34, 0.009, 0.19]),
  ]
  for s in [-1, 1]
]);
// A flat pocket on a face at height y: a panel from (x0, z0) to (x1, z1), `t` proud, under a flap across its neck
// end with a press stud. Slots: pocket, flap, stud.
local flatPocket(id, x0, x1, z0, z1, y, t, flapDepth) = [
  box(id, 'pocket', [x0, y, z0], [x1, y + t, z1]),
  box(id + '-flap', 'flap', [x0 - 0.004, y + t, z0 - 0.006], [x1 + 0.004, y + t + 0.005, z0 + flapDepth]),
  disc(id + '-stud', 'stud', 0.007, y + t + 0.005, y + t + 0.009, (x0 + x1) / 2, z0 + flapDepth - 0.012),
];
[
  // A survivor-forged mild steel ESAPI plate, 300 mm long and 240 mm across with a shooter's cut, bent round a 350 mm
  // radius, its edges bound in nylon and two nylon straps buckled across it.
  h.compound('lc_esapi_plate', 2.2, forgedEsapi, { plate: 'steel-grey', edge: 'cloth-olive-drab', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A scrap steel ESAPI plate, 300 mm long and 240 mm across, bent in three creases, its corners hacked off and its
  // edges and middle wrapped in rags.
  local w = 0.24;
  h.compound('scrap_esapi_plate', 1.1,
    curvedPlate('plate', function(i) 'plate', w, 0.3, 0.004, -0.15, 0.15, 0.09, 4)
    + std.flattenArrays([
      plateBand('wrap-%d' % i, if i % 2 == 0 then 'rag' else 'rag-dark', w, 0.3, 0.004, [-0.13, -0.02, 0.07][i], [-0.13, -0.02, 0.07][i] + 0.035, 0.006, 4)
      for i in [0, 1, 2]
    ])
    + [
      box('edge-a', 'rag', [-0.15, 0, -w / 2 - 0.006], [0.12, 0.01, -w / 2 + 0.008]),
      box('edge-b', 'rag-dark', [-0.15, 0, w / 2 - 0.008], [0.12, 0.01, w / 2 + 0.006]),
    ], { plate: 'scrap-rusted', rag: 'cloth-rag', 'rag-dark': 'cloth-rag-shadow' })
  + { voxelGrain: 0.004 },

  // A survivor-forged mild steel ESBI side plate: a hexagon 200 mm long and 150 mm across, 6 mm thick, on a nylon pad
  // that shows round its edge, with one nylon strap across.
  h.compound('lc_esbi_plate', 1, [
    hexPlate('pad', 'pad', 0.21, 0.16, 0, 0.005),
    hexPlate('plate', 'plate', 0.2, 0.15, 0.005, 0.011),
    box('strap', 'pad', [-0.015, 0.011, -0.082], [0.015, 0.014, 0.082]),
    box('buckle', 'buckle', [-0.018, 0.014, 0.03], [0.018, 0.02, 0.05]),
  ], { plate: 'steel-grey', pad: 'cloth-olive-drab', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A scrap steel ESBI side plate: a rusted hexagon 200 mm long, 150 mm across and 3 mm thick, rag wrapped at both
  // ends and round the middle.
  h.compound('scrap_esbi_plate', 0.38,
    [hexPlate('plate', 'plate', 0.2, 0.15, 0, 0.004)]
    + [
      box('wrap-%d' % i, if i % 2 == 0 then 'rag' else 'rag-dark', [[-0.075, -0.015, 0.045][i], 0, [-0.05, -0.079, -0.05][i]], [[-0.045, 0.015, 0.075][i], 0.01, [0.05, 0.079, 0.05][i]])
      for i in [0, 1, 2]
    ], { plate: 'scrap-rusted', rag: 'cloth-rag', 'rag-dark': 'cloth-rag-shadow' })
  + { voxelGrain: 0.004 },

  // A commercial hard steel plate, 300 mm long and 250 mm across with a shooter's cut, bent round a 300 mm radius,
  // with a black rubber guard round its edges.
  local w = 0.25, r = 0.3, t = 0.007, n = 12, cut = 0.065;
  h.compound('steel_ballistic_plate', 3.7,
    curvedPlate('plate', function(i) if i == 0 || i == n - 1 then 'edge' else 'plate', w, r, t, -0.15, 0.15, cut, n)
    + plateBand('guard-tail', 'edge', w, r, t, -0.15, -0.14, 0.003, n)
    + plateBand('guard-head', 'edge', w, r, t, 0.14, 0.15, 0.003, n, cut=cut, plateX1=0.15),
    { plate: 'steel-parkerized', edge: 'rubber-black' })
  + { voxelGrain: 0.004 },
  // A soft stab panel: a rounded black nylon slab 160 mm long, 120 mm across and 14 mm thick, stepped in at its seam,
  // with a white care label in one corner.
  h.compound('stab_plate', 0.15, [
    h.prism('panel', 'cover', 'y', [[-0.06, -0.064], [-0.044, -0.08], [0.044, -0.08], [0.06, -0.064], [0.06, 0.064], [0.044, 0.08], [-0.044, 0.08], [-0.06, 0.064]], 0, 0.01),
    h.prism('top', 'cover', 'y', [[-0.054, -0.06], [-0.04, -0.074], [0.04, -0.074], [0.054, -0.06], [0.054, 0.06], [0.04, 0.074], [-0.04, 0.074], [-0.054, 0.06]], 0.01, 0.014),
    box('label', 'label', [0.04, 0.014, 0.024], [0.064, 0.016, 0.046]),
  ], { cover: 'cloth-black', label: 'cloth-white' })
  + { voxelGrain: 0.004 },

  // A soft armour vest laid flat, front up: a navy carrier 480 mm across and 560 mm from shoulder to hem, 30 mm thick
  // with its aramid panels, black elastic side straps and a flapped pocket on the front for a trauma or stab insert.
  h.compound('soft_3a_vest', 1.6,
    flatVest(0.03) + flatPocket('insert', -0.09, 0.09, 0.02, 0.22, 0.03, 0.006, 0.035),
    { shell: 'cloth-navy', strap: 'webbing-black', tab: 'plastic-charcoal', pocket: 'cloth-navy', flap: 'webbing-black', stud: 'plastic-matte-black' })
  + { voxelGrain: 0.006 },

  // A hard armour vest laid flat, front up: an olive drab carrier 480 mm across and 560 mm from shoulder to hem,
  // 35 mm thick with its aramid panels, padded shoulders, buckled side straps and a large flapped pocket on the front
  // for a 250 mm by 300 mm hard plate; the matching back pocket is underneath.
  h.compound('level_3_vest', 1.9,
    flatVest(0.035)
    + flatPocket('plate', -0.135, 0.135, -0.11, 0.23, 0.035, 0.014, 0.05)
    + [
      box('pad-l', 'pad', [-0.165, 0.0315, -0.29], [-0.085, 0.042, -0.18]),
      box('pad-r', 'pad', [0.085, 0.0315, -0.29], [0.165, 0.042, -0.18]),
      box('buckle-l', 'stud', [-0.3, 0.009, 0.09], [-0.27, 0.016, 0.13]),
      box('buckle-r', 'stud', [0.27, 0.009, 0.09], [0.3, 0.016, 0.13]),
    ],
    { shell: 'cloth-olive-drab', strap: 'webbing-olive-dark', tab: 'webbing-olive-dark', pocket: 'cloth-olive-drab', flap: 'webbing-olive-dark', pad: 'webbing-olive-dark', stud: 'plastic-matte-black' })
  + { voxelGrain: 0.006 },

  // A pair of ballistic shoulder protectors laid side by side: each a padded nylon shield 200 mm long, 170 mm across
  // and 22 mm thick, a darker seam round its edge, with a webbing tab 70 mm long off its top and two press studs that
  // fix it under a vest's shoulder.
  h.compound('iotv_shoulder_plate', 0.6, std.flattenArrays([
    local z = s * 0.095;
    [
      h.prism('pad-%d' % s, 'seam', 'y', [[z - 0.085, -0.07], [z - 0.06, -0.1], [z + 0.06, -0.1], [z + 0.085, -0.07], [z + 0.075, 0.06], [z + 0.04, 0.1], [z - 0.04, 0.1], [z - 0.075, 0.06]], 0, 0.016),
      h.prism('face-%d' % s, 'pad', 'y', [[z - 0.078, -0.068], [z - 0.056, -0.094], [z + 0.056, -0.094], [z + 0.078, -0.068], [z + 0.068, 0.058], [z + 0.036, 0.093], [z - 0.036, 0.093], [z - 0.068, 0.058]], 0.016, 0.022),
      box('tab-%d' % s, 'tab', [-0.17, 0, z - 0.025], [-0.095, 0.004, z + 0.025]),
      box('hook-%d' % s, 'hook', [-0.165, 0.004, z - 0.022], [-0.125, 0.006, z + 0.022]),
      disc('snap-a-%d' % s, 'stud', 0.006, 0.022, 0.026, -0.075, z - 0.04),
      disc('snap-b-%d' % s, 'stud', 0.006, 0.022, 0.026, -0.075, z + 0.04),
    ]
    for s in [-1, 1]
  ]), { pad: 'nylon-coyote', seam: 'webbing-olive-dark', tab: 'webbing-olive-dark', hook: 'plastic-charcoal', stud: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // An EOD jacket folded: a stiff olive drab bundle 440 mm across, 380 mm deep and 110 mm tall in four stepped
  // folds, its tall padded neck guard standing round the collar, both quilted sleeves rolled down the sides and a
  // flapped pocket for a large plate on the chest, the seams piped in black.
  local top = 0.11, w = 0.44, d = 0.38;
  h.compound('jacket_eod', 15,
    g.jacket({
      w: w, d: d, ht: top, folds: 4, neck: 0.1,
      collar: { r: 0.085, wd: 0.04, ht: 0.065, gap: 40 },
      front: 'none', buttons: [],
      sleeves: { kind: 'roll', r: 0.038 },
    })
    + flatPocket('plate', -0.1, 0.1, -0.175, -0.02, top, 0.018, 0.045)
    + [
      box('piping-hem', 'seam', [-w / 2, top, -d / 2 + 0.012], [w / 2, top + 0.004, -d / 2 + 0.02]),
    ] + h.crescent('neck-rim', 'seam', 0.113, 0.125, -140, 140, 12, top + 0.065, top + 0.071, 0, d / 2 - 0.1) + [
      box('piping-fold-%d-%d' % [i, e], 'seam', [-w / 2 - 0.002, i * top / 4 - 0.002, e * d / 2 - 0.004], [w / 2 + 0.002, i * top / 4 + 0.002, e * d / 2 + 0.002])
      for i in std.range(1, 3)
      for e in [-1, 1]
    ] + [
      box('piping-side-%d-%d' % [i, s], 'seam', [s * w / 2 - 0.003, i * top / 4 - 0.002, -d / 2 + 0.01], [s * w / 2 + 0.003, i * top / 4 + 0.002, d / 2])
      for i in std.range(1, 3)
      for s in [-1, 1]
    ],
    { cloth: 'cloth-olive-drab', collar: 'cloth-olive-drab', sleeve: 'cloth-olive-drab', stitch: 'webbing-black', cuff: 'webbing-olive-dark', seam: 'webbing-black', pocket: 'cloth-olive-drab', flap: 'webbing-olive-dark', stud: 'plastic-matte-black' })
  + { voxelGrain: 0.006 },

  // A tactical EOD jacket folded: a coyote bundle 420 mm across, 360 mm deep and 100 mm tall with a black zip down
  // the front, a low padded collar along the back and the flapped deltoid pockets of both folded sleeves on top.
  local top = 0.1;
  h.compound('jacket_eod_light', 5,
    h.foldedGarment(0.42, 0.36, top, 3)
    + flatPocket('deltoid-l', -0.19, -0.07, -0.1, 0.07, top, 0.014, 0.04)
    + flatPocket('deltoid-r', 0.07, 0.19, -0.1, 0.07, top, 0.014, 0.04)
    + [
      box('zip', 'zip', [-0.008, top, -0.17], [0.008, top + 0.004, 0.18]),
      h.turned('collar', 'cloth', 'x', [[0, 0], [0, 0.022], [0.38, 0.022], [0.38, 0]], [-0.19, top + 0.004, -0.158]),
    ],
    { cloth: 'nylon-coyote', pocket: 'nylon-coyote', flap: 'webbing-olive-dark', stud: 'plastic-matte-black', zip: 'plastic-matte-black' })
  + { voxelGrain: 0.006 },
]
