local h = import '../compound.libsonnet';
local box = h.box;
// A flat ellipse centred on [cx, cz] lying on y from y0 to y1, as a convex polygon of n sides.
local ellipse(id, slot, cx, cz, rx, rz, y0, y1, n=14) = h.prism(id, slot, 'y', [
  [cz + rz * std.cos(2 * std.pi * i / n), cx + rx * std.sin(2 * std.pi * i / n)]
  for i in std.range(0, n - 1)
], y0, y1);
// A cloak or cape folded on the floor, w wide, d deep and ht high, front on +z. Slot cloth.
local folded(w, d, ht, folds) = h.foldedGarment(w, d, ht, folds);
// A hood lying folded flat on the back half of a folded cloak's top, its opening towards the front showing a lining.
// Slots: hood, lining. Returns [pieces, z of the hood's front edge].
local hood(w, d, ht) =
  local cz = -d * 0.08, rx = w * 0.3, rz = d * 0.3;
  [
    ellipse('hood', 'hood', 0, cz, rx, rz, ht, ht + 0.012),
    h.prism('hood-tip', 'hood', 'y', [[cz - rz * 0.6, -rx * 0.55], [cz - rz * 0.6, rx * 0.55], [cz - rz * 1.3, 0]], ht, ht + 0.012),
    ellipse('hood-opening', 'lining', 0, cz + rz * 0.35, rx * 0.62, rz * 0.5, ht + 0.012, ht + 0.015),
  ];
local hoodFront(d) = -d * 0.08 + d * 0.3;
// Two tie cords from the neck running forward over the top and down the front face. Slot ties.
local ties(d, ht, z0, gap=0.025) = std.flattenArrays([
  [
    box('tie-top-%d' % i, 'ties', [x - 0.003, ht, z0], [x + 0.003, ht + 0.006, d / 2 + 0.005]),
    box('tie-drop-%d' % i, 'ties', [x - 0.003, ht * 0.25, d / 2], [x + 0.003, ht + 0.006, d / 2 + 0.005]),
  ]
  for i in [0, 1]
  for x in [[-gap, gap][i]]
]);
// A chained cloak clasp at the neck: two round bosses joined by a short chain. Slot clasp.
local clasp(z, y, r=0.012, gap=0.035) = [
  h.disc('clasp-a', 'clasp', r, y, y + 0.005, -gap, z),
  h.disc('clasp-b', 'clasp', r, y, y + 0.005, gap, z),
  box('clasp-chain', 'clasp', [-gap, y, z - 0.002], [gap, y + 0.004, z + 0.002]),
];
// A ring brooch with a pin across it. Slot clasp.
local brooch(z, y, r=0.022) =
  h.crescent('brooch', 'clasp', r * 0.7, r, 20, 340, 10, y, y + 0.004, 0, z)
  + [box('brooch-pin', 'clasp', [-r * 1.4, y + 0.004, z - 0.0015], [r * 1.4, y + 0.007, z + 0.0015])];
// A hooded cloak folded with its hood on top and a fastening at the neck.
local hoodedCloak(w, d, ht, folds, fastening) =
  folded(w, d, ht, folds) + hood(w, d, ht) + fastening(hoodFront(d), ht + 0.012);
[
  // A heavy cotton cloak 1.4 m long folded to 320 mm by 260 mm and 50 mm high, its hood lying on top and two cord
  // ties at the neck.
  h.compound('cloak', 1, hoodedCloak(0.32, 0.26, 0.05, 4, function(z, y) ties(0.26, 0.05, z - 0.01)), {
    cloth: 'cloth-canvas',
    hood: 'cloth-canvas',
    lining: 'cloth-cotton',
    ties: 'cord-cotton',
  })
  + { voxelGrain: 0.004 },

  // A thin black cotton cloak folded to 300 mm by 240 mm and 30 mm high, hood on top and narrow black ties.
  h.compound('cloak_black', 0.6, hoodedCloak(0.3, 0.24, 0.03, 3, function(z, y) ties(0.24, 0.03, z - 0.01, 0.02)), {
    cloth: 'cloth-black',
    hood: 'cloth-black',
    lining: 'plastic-charcoal',
    ties: 'plastic-charcoal',
  })
  + { voxelGrain: 0.004 },

  // A heavy denim cloak folded to 330 mm by 270 mm and 55 mm high, hood on top, closed at the neck by two steel
  // press studs on the front.
  h.compound('cloak_denim', 1.2, hoodedCloak(0.33, 0.27, 0.055, 4, function(z, y) [])
    + [h.stud('stud-%d' % i, 'clasp', [-0.05, 0.05][i], 0.055 * 0.875, 0.135, 0.007) for i in [0, 1]], {
    cloth: 'cloth-denim',
    hood: 'cloth-denim',
    lining: 'cloth-cream',
    clasp: 'metal-silver',
  })
  + { voxelGrain: 0.004 },

  // A fur cloak folded to 340 mm by 280 mm and 60 mm high, fur side out, with a thick ruff of paler fur round the
  // neck and a bronze chained clasp.
  h.compound('cloak_fur', 1.1, folded(0.34, 0.28, 0.06, 3)
    + h.crescent('ruff', 'ruff', 0.05, 0.095, 95, 265, 8, 0.06, 0.085, 0, 0.01)
    + clasp(0.05, 0.06), {
    cloth: 'fur-brown',
    ruff: 'fur-pale',
    clasp: 'bronze',
  })
  + { voxelGrain: 0.004 },

  // A leather cloak folded to 330 mm by 270 mm and 50 mm high, hood on top and a brass chained clasp at the neck.
  h.compound('cloak_leather', 3.1, hoodedCloak(0.33, 0.27, 0.05, 3, function(z, y) clasp(z + 0.005, y - 0.012)), {
    cloth: 'leather-brown',
    hood: 'leather-brown',
    lining: 'suede-brown',
    clasp: 'brass-dull',
  })
  + { voxelGrain: 0.004 },

  // A reversible hooded cloak folded to 300 mm by 250 mm and 35 mm high, black outside and red inside, the red
  // showing in the hood's opening, with a silver chained clasp. The red-side-out variant swaps the finishes.
  h.compound('cloak_vampire', 0.8, hoodedCloak(0.3, 0.25, 0.035, 3, function(z, y) clasp(z + 0.005, y - 0.012, 0.01, 0.03)), {
    cloth: 'cloth-black',
    hood: 'cloth-black',
    lining: 'velvet-red',
    clasp: 'metal-silver',
  })
  + { voxelGrain: 0.004 },

  // A wool cloak folded to 330 mm by 270 mm and 55 mm high, hood on top, pinned at the neck by a ring brooch.
  h.compound('cloak_wool', 1.2, hoodedCloak(0.33, 0.27, 0.055, 4, function(z, y) brooch(z + 0.01, y - 0.012)), {
    cloth: 'wool-grey',
    hood: 'wool-grey',
    lining: 'felt-grey',
    clasp: 'metal-silver',
  })
  + { voxelGrain: 0.004 },

  // A long hooded cotton robe folded to 320 mm by 260 mm and 40 mm high, hood on top and a rope belt tied round
  // the folded robe, its tasselled ends hanging down the front.
  h.compound('hooded_robe', 0.83, hoodedCloak(0.32, 0.26, 0.04, 3, function(z, y) []) + [
    box('belt-top', 'belt', [-0.165, 0.052, 0.07], [0.165, 0.06, 0.078]),
    box('belt-left', 'belt', [-0.168, 0, 0.07], [-0.16, 0.06, 0.078]),
    box('belt-right', 'belt', [0.16, 0, 0.07], [0.168, 0.06, 0.078]),
    box('belt-knot', 'belt', [0.06, 0.052, 0.064], [0.08, 0.066, 0.084]),
    box('belt-end-a', 'belt', [0.062, 0.006, 0.13], [0.068, 0.06, 0.136]),
    box('belt-end-b', 'belt', [0.074, 0.006, 0.13], [0.08, 0.06, 0.136]),
    box('belt-run-a', 'belt', [0.062, 0.054, 0.078], [0.068, 0.06, 0.136]),
    box('belt-run-b', 'belt', [0.074, 0.054, 0.078], [0.08, 0.06, 0.136]),
    box('tassel-a', 'belt', [0.059, 0, 0.13], [0.071, 0.012, 0.142]),
    box('tassel-b', 'belt', [0.071, 0, 0.13], [0.083, 0.012, 0.142]),
  ], {
    cloth: 'cloth-brown',
    hood: 'cloth-brown',
    lining: 'cloth-cream',
    belt: 'cord-cotton',
  })
  + { voxelGrain: 0.004 },

  // A red cotton mascot's cape folded to 320 mm by 260 mm and 45 mm high, a yellow trim on each fold's front edge,
  // a round yellow-and-red emblem on top and yellow ties at a stiff collar.
  h.compound('mascot_cape', 0.88, folded(0.32, 0.26, 0.045, 3)
    + [box('trim-%d' % i, 'trim', [-0.16, i * 0.015 + 0.003, 0.13], [0.16, i * 0.015 + 0.009, 0.133]) for i in std.range(0, 2)]
    + [
      box('collar', 'trim', [-0.11, 0.045, -0.125], [0.11, 0.058, -0.1]),
      ellipse('emblem', 'trim', 0, 0.01, 0.07, 0.07, 0.045, 0.048, 20),
      ellipse('emblem-field', 'emblem', 0, 0.01, 0.055, 0.055, 0.048, 0.05, 20),
      ellipse('emblem-dot', 'trim', 0, 0.01, 0.022, 0.022, 0.05, 0.052, 12),
    ]
    + ties(0.26, 0.045, -0.1, 0.06), {
    cloth: 'cloth-red',
    trim: 'cloth-yellow',
    emblem: 'paint-red',
    ties: 'cloth-yellow',
  })
  + { voxelGrain: 0.004 },

  // A heavy cape of metal-fibre cloth folded to 320 mm by 260 mm and 40 mm high, its top split diagonally into a
  // black field and a silver field with a pale full moon at the centre, and a silver chained clasp at the collar.
  h.compound('heraldic_cape', 1.5, folded(0.32, 0.26, 0.04, 3) + [
    h.prism('field', 'field', 'y', [[-0.1225, -0.158], [-0.1225, 0.158], [0.128, -0.158]], 0.04, 0.042),
    ellipse('moon', 'moon', 0, 0.0, 0.045, 0.045, 0.042, 0.045, 20),
    box('collar', 'cloth', [-0.1, 0.04, -0.125], [0.1, 0.052, -0.105]),
  ] + clasp(-0.098, 0.052, 0.01, 0.06), {
    cloth: 'cloth-black',
    field: 'metal-silver',
    moon: 'cloth-cream',
    clasp: 'metal-silver',
  })
  + { voxelGrain: 0.004 },

  // A traditional straw rain cape 850 mm long laid flat, 450 mm across the shoulders and 750 mm across the hem,
  // built of three overlapping tiers of thatch with a straw-rope collar and ties; the neck is at the back (-z).
  h.compound('straw_cape', 1.1, std.flattenArrays([
    local z0 = [0.0, -0.22, -0.425][i], z1 = [0.425, 0.15, -0.08][i], y0 = i * 0.012;
    local wAt(z) = 0.225 + (0.375 - 0.225) * (z + 0.425) / 0.85;
    [
      h.prism('tier-%d' % i, 'thatch', 'y', [[z0, -wAt(z0)], [z0, wAt(z0)], [z1, wAt(z1)], [z1, -wAt(z1)]], y0, y0 + 0.02),
    ] + [
      box('strand-%d-%d' % [i, j], 'strand', [x - 0.004, y0 + 0.02, z0 + 0.03], [x + 0.004, y0 + 0.025, z1])
      for j in std.range(0, 12)
      for x in [(j - 6) * wAt(z0) / 7]
    ]
    for i in [0, 1, 2]
  ]) + [
    box('collar', 'rope', [-0.25, 0.044, -0.43], [0.25, 0.058, -0.405]),
    box('tie-a', 'rope', [-0.32, 0.044, -0.425], [-0.25, 0.05, -0.415]),
    box('tie-b', 'rope', [0.25, 0.044, -0.425], [0.32, 0.05, -0.415]),
  ], {
    thatch: 'straw-wicker',
    strand: 'straw-rope',
    rope: 'jute',
  })
  + { voxelGrain: 0.008 },

  // A rain poncho folded into its own flat packet 140 mm by 100 mm and 18 mm thick, held by a paper band.
  h.compound('rain_poncho', 0.2, folded(0.14, 0.1, 0.018, 3) + [
    box('band', 'band', [-0.025, -0.0005, -0.0505], [0.025, 0.0185, 0.0505]),
  ], {
    cloth: 'cloth-yellow',
    band: 'paper-white',
  })
  + { voxelGrain: 0.002 },

  // A primitive cloak of dried grass 700 mm long laid flat: grass bundles twined into a cord collar 600 mm wide,
  // a short upper layer over a long lower layer, the neck at the back (-z).
  h.compound('grass_cloak', 0.61, [
    box('mat', 'grass', [-0.27, 0, -0.33], [0.27, 0.006, 0.34]),
  ] + [
    box('long-%d' % j, 'grass', [x - 0.009, 0.006, -0.3], [x + 0.009, 0.014, 0.3 + 0.045 * std.abs(std.sin(j * 1.7))])
    for j in std.range(0, 19)
    for x in [-0.28 + j * 0.0295]
  ] + [
    box('short-%d' % j, 'grass-dry', [x - 0.009, 0.014, -0.32], [x + 0.009, 0.022, -0.06 + 0.04 * std.abs(std.sin(j * 2.3))])
    for j in std.range(0, 17)
    for x in [-0.27 + j * 0.0318]
  ] + [
    box('collar', 'cord', [-0.31, 0.014, -0.35], [0.31, 0.03, -0.325]),
    box('twine-%d' % 0, 'cord', [-0.29, 0.022, -0.06], [0.29, 0.026, -0.052]),
    box('twine-%d' % 1, 'cord', [-0.29, 0.014, 0.12], [0.29, 0.018, 0.128]),
  ], {
    grass: 'plant-dried',
    'grass-dry': 'straw-wicker',
    cord: 'straw-rope',
  })
  + { voxelGrain: 0.008 },

  // A large heavy-duty flag folded to 300 mm by 220 mm and 50 mm high, its folds showing bands of red, white and
  // navy, a navy canton with white stars on top, and a canvas heading down one side with two brass grommets and a
  // halyard rope tied through them, its tail ending in a wooden toggle.
  h.compound('national_flag', 0.8, [
    p + { slot: ['red', 'white', 'navy', 'red'][std.parseInt(std.split(p.id, '-')[1])] }
    for p in folded(0.3, 0.22, 0.05, 4)
  ] + [
    box('canton', 'navy', [-0.15, 0.05, -0.1025], [0.0, 0.052, 0.02]),
    box('heading', 'heading', [-0.165, 0, -0.11], [-0.148, 0.054, 0.11]),
  ] + [
    h.disc('star-%d-%d' % [i, j], 'white', 0.005, 0.052, 0.054, -0.13 + i * 0.03, -0.085 + j * 0.03)
    for i in std.range(0, 4)
    for j in std.range(0, 3)
  ] + [
    h.turned('grommet-%d' % i, 'grommet', 'x', [[0, 0.004], [0, 0.009], [0.019, 0.009], [0.019, 0.004], [0, 0.004]], [-0.1665, 0.03, z])
    for i in [0, 1]
    for z in [[-0.08, 0.08][i]]
  ] + [
    box('rope', 'rope', [-0.175, 0.026, -0.085], [-0.168, 0.034, 0.14]),
    h.rod('toggle', 'toggle', 0.006, -0.19, -0.155, 0.03) + { origin: [-0.19, 0.03, 0.145] },
  ], {
    red: 'cloth-red',
    white: 'cloth-white',
    navy: 'cloth-navy',
    heading: 'cloth-canvas',
    grommet: 'brass-polished',
    rope: 'cord-cotton',
    toggle: 'wood-oak',
  })
  + { voxelGrain: 0.004 },
]
