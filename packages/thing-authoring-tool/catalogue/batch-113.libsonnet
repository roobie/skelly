local h = import '../compound.libsonnet';
local box = h.box;
// Coats and robes folded on a shelf: each is `h.foldedGarment` with its collar or folded hood at the back (-z) and
// its front closure running towards the hem at +z on top.

// A flat patch pocket on the top face at `top`, from x0 to x1 and z0 to z1, with a flap `flap` deep across its
// back edge when `flap` is above zero. Slots: pocket, flap.
local pocket(id, x0, x1, z0, z1, top, t=0.004, flap=0) =
  [box(id, 'pocket', [x0, top, z0], [x1, top + t, z1])]
  + (if flap > 0 then [box(id + '-flap', 'flap', [x0 - 0.003, top + t, z0], [x1 + 0.003, top + t + 0.003, z0 + flap])] else []);
// A row of round buttons standing on the top face at x, from z0 to z1. Slot: button.
local buttons(prefix, x, z0, z1, n, top, r=0.007) = [
  h.disc('%s-%d' % [prefix, i], 'button', r, top, top + 0.004, x, z0 + (z1 - z0) * i / (n - 1))
  for i in std.range(0, n - 1)
];
// A hood folded down flat on the top face, its crown at the back: a rounded panel `w` across, from z0 to z1 and
// `t` thick, with its face opening outlined by a rim of slot `rim` along its front edge. Slots: hood, rim.
local hood(w, z0, z1, top, t, rimT=0.008) =
  local hw = w / 2, d = z1 - z0;
  [
    h.prism('hood', 'hood', 'y', [
      [z0, -hw * 0.6], [z0 + d * 0.3, -hw], [z1, -hw], [z1, hw], [z0 + d * 0.3, hw], [z0, hw * 0.6],
    ], top, top + t),
    h.turned('hood-rim', 'rim', 'x', [[0, 0], [0, rimT], [w, rimT], [w, 0]], [-hw, top + t * 0.6, z1 - rimT * 0.5]),
  ];
// A collar rolled along the back edge on top of a garment `w` across. Slot: collar.
local collar(w, z, top, r) = h.turned('collar', 'collar', 'x', [[0, 0], [0, r], [w, r], [w, 0]], [-w / 2, top + r * 0.4, z]);
// Raised seams or quilting ridges across x at the given z. Slot given.
local ridges(prefix, slot, x0, x1, zs, top, t=0.003, w=0.006) = [
  box('%s-%d' % [prefix, i], slot, [x0, top, zs[i] - w / 2], [x1, top + t, zs[i] + w / 2])
  for i in std.range(0, std.length(zs) - 1)
];

[
  // A black cassock folded flat, 360 mm by 300 mm and 60 mm tall: the long row of small buttons down the front, a
  // standing collar along the back with a white collar tab in front of it.
  local top = 0.06;
  h.compound('cassock', 1.5,
    h.foldedGarment(0.36, 0.3, top, 4)
    + buttons('button', 0, -0.1, 0.14, 13, top, 0.005)
    + [
      box('collar', 'collar', [-0.12, top, -0.15], [0.12, top + 0.012, -0.12]),
      box('tab', 'tab', [-0.02, top, -0.12], [0.02, top + 0.01, -0.112]),
      box('placket', 'collar', [-0.012, top, -0.12], [0.012, top + 0.002, 0.15]),
    ],
    { cloth: 'cloth-black', collar: 'cloth-black', tab: 'cloth-cream', button: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },

  // A garish pink faux fur coat folded, 380 mm by 320 mm and 60 mm tall, its fluffy shawl collar rolled along the
  // back, two small patch pockets and a short cotton-lined front edge with toggles.
  local top = 0.06;
  h.compound('coat_faux_fur', 1.4,
    h.foldedGarment(0.38, 0.32, top, 3)
    + [collar(0.3, -0.13, top, 0.022)]
    + pocket('pocket-l', -0.16, -0.06, 0.04, 0.13, top, 0.006)
    + pocket('pocket-r', 0.06, 0.16, 0.04, 0.13, top, 0.006)
    + [box('edge', 'lining', [-0.012, top, -0.1], [0.012, top + 0.003, 0.16])]
    + buttons('toggle', 0, -0.06, 0.1, 3, top, 0.008),
    { cloth: 'petal-pink', collar: 'petal-pink', pocket: 'petal-pink', lining: 'cloth-cream', button: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },

  // A brown fur coat folded, 380 mm by 320 mm and 60 mm tall, its deep fur collar rolled along the back, two small
  // pockets and three dark buttons down the front.
  local top = 0.06;
  h.compound('coat_fur', 1.5,
    h.foldedGarment(0.38, 0.32, top, 3)
    + [collar(0.32, -0.13, top, 0.026)]
    + pocket('pocket-l', -0.16, -0.06, 0.04, 0.13, top, 0.006)
    + pocket('pocket-r', 0.06, 0.16, 0.04, 0.13, top, 0.006)
    + [box('edge', 'lining', [-0.01, top, -0.1], [0.01, top + 0.003, 0.16])]
    + buttons('button', 0, -0.06, 0.1, 3, top, 0.009),
    { cloth: 'fur-brown', collar: 'fur-brown', pocket: 'fur-brown', lining: 'leather-brown', button: 'leather-black' })
  + { voxelGrain: 0.004 },

  // A gutskin parka folded thin, 300 mm by 240 mm and 30 mm tall: pale translucent strips of split gut sewn in
  // bands across the body, the hood folded down on top with a sinew-bound rim.
  local top = 0.03;
  h.compound('coat_gut', 0.5,
    h.foldedGarment(0.3, 0.24, top, 3)
    + ridges('seam', 'seam', -0.15, 0.15, [-0.06, -0.02, 0.02, 0.06, 0.1], top, 0.002, 0.004)
    + hood(0.2, -0.12, -0.0, top + 0.002, 0.008, 0.006),
    { cloth: 'skin-rawhide', seam: 'leather-brown', hood: 'skin-rawhide', rim: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A white lab coat folded, 340 mm by 280 mm and 30 mm tall: notched lapels either side of the buttoned front,
  // two big hip pockets and a breast pocket with a clear pocket protector holding two pens.
  local top = 0.03;
  h.compound('coat_lab', 0.69,
    h.foldedGarment(0.34, 0.28, top, 3)
    + [
      h.prism('lapel-l', 'lapel', 'y', [[-0.14, -0.1], [-0.14, -0.012], [0.0, -0.012]], top, top + 0.004),
      h.prism('lapel-r', 'lapel', 'y', [[-0.14, 0.012], [-0.14, 0.1], [0.0, 0.012]], top, top + 0.004),
    ]
    + buttons('button', 0, 0.02, 0.12, 3, top, 0.006)
    + pocket('hip-l', -0.15, -0.05, 0.05, 0.13, top)
    + pocket('hip-r', 0.05, 0.15, 0.05, 0.13, top)
    + pocket('breast', 0.04, 0.11, -0.07, -0.01, top)
    + [
      box('protector', 'protector', [0.05, top + 0.004, -0.075], [0.1, top + 0.008, -0.04]),
      h.turned('pen-a', 'pen', 'z', [[0, 0], [0, 0.0045], [0.05, 0.0045], [0.05, 0]], [0.062, top + 0.012, -0.1]),
      h.turned('pen-b', 'pen-b', 'z', [[0, 0], [0, 0.0045], [0.05, 0.0045], [0.05, 0]], [0.085, top + 0.012, -0.1]),
    ],
    { cloth: 'cloth-cream', lapel: 'cloth-cream', pocket: 'cloth-cream', button: 'plastic-clear', protector: 'plastic-clear', pen: 'plastic-blue', 'pen-b': 'plastic-red' })
  + { voxelGrain: 0.004 },

  // A yellow vinyl rain coat folded, 320 mm by 260 mm and 25 mm tall: the hood folded down on top, two very large
  // flapped pockets and snap studs down the front.
  local top = 0.025;
  h.compound('coat_rain', 0.87,
    h.foldedGarment(0.32, 0.26, top, 3)
    + hood(0.2, -0.13, -0.02, top, 0.01)
    + pocket('pocket-l', -0.155, -0.035, 0.0, 0.12, top, 0.004, 0.035)
    + pocket('pocket-r', 0.035, 0.155, 0.0, 0.12, top, 0.004, 0.035)
    + buttons('snap', 0, 0.0, 0.12, 4, top, 0.006),
    { cloth: 'plastic-yellow', hood: 'plastic-yellow', rim: 'plastic-yellow', pocket: 'plastic-yellow', flap: 'plastic-yellow', button: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A navy padded winter coat folded, 380 mm by 320 mm and 65 mm tall: quilted baffles across the body, the hood
  // folded down on top with a fur-trimmed rim, a zip down the front and two deep pockets.
  local top = 0.065;
  h.compound('coat_winter', 2,
    h.foldedGarment(0.38, 0.32, top, 3)
    + ridges('baffle', 'baffle', -0.19, 0.19, [0.0, 0.05, 0.1, 0.15], top, 0.006, 0.012)
    + hood(0.24, -0.15, -0.02, top, 0.014, 0.014)
    + [box('zip', 'zip', [-0.005, top, -0.02], [0.005, top + 0.008, 0.16])]
    + pocket('pocket-l', -0.16, -0.06, 0.02, 0.12, top + 0.006, 0.004, 0.02)
    + pocket('pocket-r', 0.06, 0.16, 0.02, 0.12, top + 0.006, 0.004, 0.02),
    { cloth: 'cloth-navy', baffle: 'cloth-navy', hood: 'cloth-navy', rim: 'fur-brown', zip: 'plastic-matte-black', pocket: 'cloth-navy', flap: 'cloth-navy' })
  + { voxelGrain: 0.004 },

  // A canvas duster folded, 380 mm by 320 mm and 60 mm tall: the shoulder cape lying over the back half, a collar
  // rolled along the back, a row of buttons and two flapped hip pockets.
  local top = 0.06;
  h.compound('duster', 1.8,
    h.foldedGarment(0.38, 0.32, top, 5)
    + [h.prism('cape', 'cape', 'y', [[-0.16, -0.19], [-0.16, 0.19], [-0.02, 0.19], [0.02, 0.12], [0.02, -0.12], [-0.02, -0.19]], top, top + 0.006)]
    + [collar(0.24, -0.14, top + 0.006, 0.014)]
    + buttons('button', 0, 0.04, 0.14, 3, top, 0.007)
    + pocket('pocket-l', -0.17, -0.06, 0.05, 0.14, top, 0.004, 0.03)
    + pocket('pocket-r', 0.06, 0.17, 0.05, 0.14, top, 0.004, 0.03),
    { cloth: 'cloth-canvas', cape: 'cloth-canvas', collar: 'cloth-canvas', button: 'leather-brown', pocket: 'cloth-canvas', flap: 'cloth-canvas' })
  + { voxelGrain: 0.004 },

  // A pale faux fur duster folded thick, 420 mm by 360 mm and 80 mm tall: a deep shawl collar rolled along the back,
  // cotton-lined front edges and two flapped pockets with toggles.
  local top = 0.08;
  h.compound('duster_faux_fur', 2.4,
    h.foldedGarment(0.42, 0.36, top, 5)
    + [collar(0.34, -0.15, top, 0.028)]
    + [box('edge', 'lining', [-0.014, top, -0.11], [0.014, top + 0.003, 0.18])]
    + pocket('pocket-l', -0.19, -0.07, 0.06, 0.16, top, 0.006, 0.03)
    + pocket('pocket-r', 0.07, 0.19, 0.06, 0.16, top, 0.006, 0.03)
    + buttons('toggle', 0, -0.06, 0.12, 4, top, 0.008),
    { cloth: 'fur-pale', collar: 'fur-pale', lining: 'cloth-khaki', pocket: 'fur-pale', flap: 'fur-pale', button: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A brown fur duster folded thick, 420 mm by 360 mm and 80 mm tall: a deep fur collar rolled along the back,
  // leather-bound front edges and two flapped pockets.
  local top = 0.08;
  h.compound('duster_fur', 2.4,
    h.foldedGarment(0.42, 0.36, top, 5)
    + [collar(0.36, -0.15, top, 0.032)]
    + [box('edge', 'lining', [-0.012, top, -0.11], [0.012, top + 0.003, 0.18])]
    + pocket('pocket-l', -0.19, -0.07, 0.06, 0.16, top, 0.006, 0.03)
    + pocket('pocket-r', 0.07, 0.19, 0.06, 0.16, top, 0.006, 0.03)
    + buttons('button', 0, -0.04, 0.12, 4, top, 0.009),
    { cloth: 'fur-brown', collar: 'fur-brown', lining: 'leather-black', pocket: 'fur-brown', flap: 'fur-brown', button: 'leather-black' })
  + { voxelGrain: 0.004 },

  // A brown leather duster folded, 400 mm by 340 mm and 60 mm tall: the shoulder cape over the back half, a wide
  // collar rolled along the back, brass-studded front and two flapped pockets.
  local top = 0.06;
  h.compound('duster_leather', 2.6,
    h.foldedGarment(0.4, 0.34, top, 5)
    + [h.prism('cape', 'cape', 'y', [[-0.17, -0.2], [-0.17, 0.2], [-0.03, 0.2], [0.01, 0.13], [0.01, -0.13], [-0.03, -0.2]], top, top + 0.006)]
    + [collar(0.26, -0.15, top + 0.006, 0.016)]
    + buttons('button', 0, 0.03, 0.15, 4, top, 0.007)
    + pocket('pocket-l', -0.18, -0.06, 0.05, 0.15, top, 0.004, 0.03)
    + pocket('pocket-r', 0.06, 0.18, 0.05, 0.15, top, 0.004, 0.03),
    { cloth: 'leather-brown', cape: 'leather-brown', collar: 'leather-brown', button: 'brass-dull', pocket: 'leather-brown', flap: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A white hooded ghost robe folded small, 260 mm by 200 mm and 12 mm tall, the pointed hood folded down on top.
  local top = 0.012;
  h.compound('ghost_robe', 0.5,
    h.foldedGarment(0.26, 0.2, top, 3)
    + hood(0.16, -0.1, 0.02, top, 0.006, 0.006),
    { cloth: 'cloth-cream', hood: 'cloth-cream', rim: 'cloth-white' })
  + { voxelGrain: 0.002 },

  // A white bed sheet folded flat, 300 mm by 240 mm and 20 mm tall, the top fold showing the two eye holes cut
  // through it.
  local top = 0.02;
  h.compound('ghost_robe_sheet', 0.6,
    h.foldedGarment(0.3, 0.24, top, 4)
    + [
      h.turned('eye-l', 'hole', 'y', [[0, 0], [0, 0.016], [0.001, 0.016], [0.001, 0]], [-0.045, top - 0.0008, -0.01]),
      h.turned('eye-r', 'hole', 'y', [[0, 0], [0, 0.016], [0.001, 0.016], [0.001, 0]], [0.045, top - 0.0008, -0.01]),
    ],
    { cloth: 'cloth-cream', hole: 'cloth-black' })
  + { voxelGrain: 0.002 },

  // A grey wool greatcoat folded, 400 mm by 340 mm and 70 mm tall: a wide turned-down collar along the back, two rows
  // of brass buttons on the double-breasted front and two flapped hip pockets.
  local top = 0.07;
  h.compound('greatcoat', 2.3,
    h.foldedGarment(0.4, 0.34, top, 5)
    + [
      h.prism('lapel-l', 'collar', 'y', [[-0.16, -0.15], [-0.16, -0.02], [-0.06, -0.06]], top, top + 0.006),
      h.prism('lapel-r', 'collar', 'y', [[-0.16, 0.02], [-0.16, 0.15], [-0.06, 0.06]], top, top + 0.006),
      collar(0.3, -0.155, top, 0.016),
    ]
    + buttons('button-l', -0.05, -0.03, 0.15, 4, top, 0.01)
    + buttons('button-r', 0.05, -0.03, 0.15, 4, top, 0.01)
    + pocket('pocket-l', -0.19, -0.09, 0.07, 0.15, top, 0.004, 0.03)
    + pocket('pocket-r', 0.09, 0.19, 0.07, 0.15, top, 0.004, 0.03),
    { cloth: 'wool-grey', collar: 'wool-grey', button: 'brass-dull', pocket: 'wool-grey', flap: 'wool-grey' })
  + { voxelGrain: 0.004 },

  // A black hooded reaper robe folded small, 260 mm by 200 mm and 14 mm tall: the deep hood folded down on top with
  // its dark mesh face cover, and a grey cord tie laid across.
  local top = 0.014;
  h.compound('grim_reaper_robe', 0.6,
    h.foldedGarment(0.26, 0.2, top, 3)
    + hood(0.18, -0.1, 0.03, top, 0.006, 0.006)
    + [
      box('mask', 'mask', [-0.04, top + 0.006, -0.03], [0.04, top + 0.008, 0.026]),
      box('cord', 'cord', [-0.13, top, 0.06], [0.13, top + 0.004, 0.068]),
    ],
    { cloth: 'cloth-black', hood: 'cloth-black', rim: 'plastic-charcoal', mask: 'plastic-charcoal', cord: 'wool-grey' })
  + { voxelGrain: 0.002 },
]
