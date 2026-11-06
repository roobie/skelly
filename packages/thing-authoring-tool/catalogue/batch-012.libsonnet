local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A flat sealed ration pouch lying on y, `length` along x, with a printed panel on top. Slots: pouch, crimp, print.
local ration(length, width, thickness, printLength) =
  h.sachet(length, width, thickness) + [
    box('print', 'print', [-printLength / 2, thickness, -width * 0.3], [printLength / 2, thickness + 0.002, width * 0.3]),
  ];
// A gallon paint can's wire bail: ears on both sides at `earY`, the wire rising over the top to `topY`, with a
// grip at the middle. Slots: ear, bail, grip.
local bail(radius, earY, topY, wire, grip) = [
  box('ear-%s' % s.id, 'ear', [s.x0, earY - 0.012, -0.012], [s.x0 + 0.006, earY + 0.012, 0.012])
  for s in [{ id: 'left', x0: -radius - 0.006 }, { id: 'right', x0: radius }]
] + [
  box('bail-%s' % s.id, 'bail', [s.lo, earY, -wire / 2], [s.lo + wire, topY, wire / 2])
  for s in [{ id: 'left', lo: -radius - 0.006 }, { id: 'right', lo: radius + 0.006 - wire }]
] + [
  box('bail-top', 'bail', [-radius - 0.006, topY - wire, -wire / 2], [radius + 0.006, topY, wire / 2]),
  turned('grip', 'grip', 'x', [[0, 0], [0, 0.009], [grip, 0.009], [grip, 0]], [-grip / 2, topY - wire / 2, 0]),
];
[
  // A large animal's stomach cleaned and dried into a water skin, about 260 mm long and 160 mm across,
  // lying on its side with both openings twisted shut and tied off with cord.
  h.compound('large_stomach_sealed', 3, [
    turned('stomach', 'skin', 'x', [[0, 0], [0, 0.02], [0.02, 0.05], [0.06, 0.075], [0.13, 0.08], [0.19, 0.07], [0.23, 0.045], [0.25, 0.018], [0.25, 0]], [-0.125, 0.078, 0]),
    turned('neck-a', 'skin', 'x', [[0, 0], [0, 0.014], [0.03, 0.01], [0.04, 0.016], [0.04, 0]], [-0.165, 0.09, 0]),
    turned('neck-b', 'skin', 'x', [[0, 0], [0, 0.016], [0.01, 0.01], [0.035, 0.014], [0.035, 0]], [0.12, 0.085, 0]),
    turned('tie-a', 'cord', 'x', [[0, 0], [0, 0.015], [0.008, 0.015], [0.008, 0]], [-0.15, 0.09, 0]),
    turned('tie-b', 'cord', 'x', [[0, 0], [0, 0.015], [0.008, 0.015], [0.008, 0]], [0.135, 0.085, 0]),
    box('tie-end-a', 'cord', [-0.15, 0.03, 0.01], [-0.144, 0.09, 0.016]),
    box('tie-end-b', 'cord', [0.135, 0.04, -0.016], [0.141, 0.085, -0.01]),
  ], { skin: 'wax-cream', cord: 'cord-olive' })
  + { voxelGrain: 0.004 },

  // A plastic lunchbox, 210 mm long, 140 mm deep and 100 mm tall with its handle: a blue tub under a
  // blue lid, a white carry handle on the lid and white snap latches on both ends.
  h.compound('lunchbox', 0.4, [
    box('tub', 'shell', [-0.1, 0, -0.065], [0.1, 0.06, 0.065]),
    box('seam', 'trim', [-0.101, 0.06, -0.066], [0.101, 0.064, 0.066]),
    box('lid', 'shell', [-0.103, 0.064, -0.068], [0.103, 0.078, 0.068]),
    box('lid-top', 'shell', [-0.096, 0.078, -0.06], [0.096, 0.082, 0.06]),
    box('post-a', 'trim', [-0.05, 0.082, -0.008], [-0.04, 0.1, 0.008]),
    box('post-b', 'trim', [0.04, 0.082, -0.008], [0.05, 0.1, 0.008]),
    box('handle', 'trim', [-0.05, 0.092, -0.01], [0.05, 0.1, 0.01]),
    box('latch-a', 'trim', [-0.107, 0.04, -0.025], [-0.103, 0.076, 0.025]),
    box('latch-b', 'trim', [0.103, 0.04, -0.025], [0.107, 0.076, 0.025]),
  ], { shell: 'plastic-blue', trim: 'plastic-white' })
  + { voxelGrain: 0.004 },

  // A children's craft kit box lying flat, 320 mm long, 230 mm wide and 50 mm deep: a white printed lid
  // over a tan tray, the lid carrying a picture of coloured building parts and a red title band.
  h.compound('maker_kit_box', 0.27, [
    box('tray', 'board', [-0.156, 0, -0.111], [0.156, 0.044, 0.111]),
    box('lid', 'lid', [-0.16, 0.012, -0.115], [0.16, 0.05, 0.115]),
    box('title', 'red', [-0.15, 0.05, 0.07], [0.15, 0.052, 0.105]),
    box('picture', 'sky', [-0.13, 0.05, -0.1], [0.13, 0.052, 0.055]),
    box('part-a', 'red', [-0.1, 0.052, -0.07], [-0.04, 0.056, -0.03]),
    box('part-b', 'yellow', [-0.03, 0.052, -0.06], [0.05, 0.056, -0.04]),
    box('part-c', 'green', [0.06, 0.052, -0.08], [0.1, 0.056, 0.02]),
    box('part-d', 'yellow', [-0.08, 0.052, 0, ], [-0.02, 0.056, 0.04]),
    box('part-e', 'red', [0.0, 0.052, -0.01], [0.04, 0.056, 0.04]),
  ], { board: 'paperboard-tan', lid: 'paint-white', red: 'paint-red', sky: 'plastic-blue', yellow: 'plastic-yellow', green: 'plastic-green' })
  + { voxelGrain: 0.004 },

  // A 20 pound barbecue propane cylinder, 305 mm across and 460 mm tall: a white steel bottle on a foot
  // ring, a guard collar round a brass valve with a black handwheel at the top.
  h.compound('medium_propane_tank', 13, [
    turned('foot', 'steel', 'y', [[0, 0.13], [0, 0.14], [0.06, 0.14], [0.06, 0.13]]),
    turned('bottle', 'paint', 'y', [[0, 0], [0, 0.1], [0.03, 0.145], [0.06, 0.1525], [0.3, 0.1525], [0.34, 0.14], [0.37, 0.11], [0.39, 0.06], [0.395, 0]], [0, 0.03, 0]),
    turned('collar', 'paint', 'y', [[0, 0.1], [0, 0.11], [0.06, 0.11], [0.06, 0.1]], [0, 0.38, 0]),
    box('collar-hole-a', 'dark', [-0.05, 0.405, 0.098], [0.05, 0.43, 0.114]),
    box('collar-hole-b', 'dark', [-0.05, 0.405, -0.114], [0.05, 0.43, -0.098]),
    disc('valve', 'brass', 0.022, 0.42, 0.465),
    box('outlet', 'brass', [0.0, 0.435, -0.014], [0.065, 0.457, 0.014]),
    box('relief', 'brass', [-0.05, 0.44, -0.01], [0, 0.458, 0.01]),
    disc('stem', 'brass', 0.008, 0.465, 0.475),
    disc('wheel', 'wheel', 0.04, 0.475, 0.49),
  ], { paint: 'paint-white', steel: 'steel-grey', dark: 'paint-charcoal', brass: 'brass', wheel: 'plastic-black' })
  + { voxelGrain: 0.006 },

  // A sealed meal ration bag lying flat, 260 mm long, 150 mm wide and 40 mm thick: a heavy tan pouch
  // with crimped seals at both ends and a dark printed panel.
  h.compound('mre_package', 0.76, ration(0.26, 0.15, 0.04, 0.14), { pouch: 'polymer-fde', crimp: 'polymer-fde', print: 'paint-charcoal' })
  + { voxelGrain: 0.004 },

  // An entrée pouch from a meal ration lying flat, 190 mm long, 120 mm wide and 18 mm thick: a tan
  // foil-lined retort pouch with sealed ends and a dark printed panel.
  h.compound('mre_bag', 0.24, ration(0.19, 0.12, 0.018, 0.1), { pouch: 'polymer-fde', crimp: 'polymer-fde', print: 'paint-charcoal' })
  + { voxelGrain: 0.004 },

  // A side-dish pouch from a meal ration lying flat, 150 mm long, 90 mm wide and 12 mm thick, tan with
  // sealed ends and an olive printed panel.
  h.compound('mre_bag_small', 0.1, ration(0.15, 0.09, 0.012, 0.08), { pouch: 'polymer-fde', crimp: 'polymer-fde', print: 'paint-olive' })
  + { voxelGrain: 0.002 },

  // A dessert pouch from a meal ration lying flat, 120 mm long, 70 mm wide and 8 mm thick, tan with
  // sealed ends and a red printed panel.
  h.compound('mre_bag_dessert', 0.05, ration(0.12, 0.07, 0.008, 0.06), { pouch: 'polymer-fde', crimp: 'polymer-fde', print: 'paint-red' })
  + { voxelGrain: 0.002 },

  // A single-serve jam packet from a meal ration lying flat, 80 mm long, 45 mm wide and 6 mm thick, tan
  // with sealed ends and a purple-red printed panel.
  h.compound('mre_bag_jam', 0.018, ration(0.08, 0.045, 0.006, 0.04), { pouch: 'polymer-fde', crimp: 'polymer-fde', print: 'paint-oxblood' })
  + { voxelGrain: 0.002 },

  // A single-serve spread packet from a meal ration lying flat, 80 mm long, 45 mm wide and 6 mm thick,
  // tan with sealed ends and a brown printed panel.
  h.compound('mre_bag_spread', 0.018, ration(0.08, 0.045, 0.006, 0.04), { pouch: 'polymer-fde', crimp: 'polymer-fde', print: 'paperboard-brown' })
  + { voxelGrain: 0.002 },

  // An empty one-gallon plastic paint pail, 170 mm across and 190 mm tall, 210 mm with its handle up:
  // white with a raised lid rim, a blue label band and a black plastic bail with a grip.
  h.compound('paint_can_plastic', 0.2, [
    turned('pail', 'pail', 'y', [[0, 0], [0, 0.078], [0.17, 0.085], [0.17, 0]]),
    turned('rim', 'pail', 'y', [[0, 0], [0, 0.088], [0.016, 0.088], [0.016, 0]], [0, 0.17, 0]),
    turned('label', 'label', 'y', [[0, 0], [0, 0.082], [0.09, 0.086], [0.09, 0]], [0, 0.04, 0]),
  ] + bail(0.086, 0.165, 0.21, 0.004, 0.06), { pail: 'plastic-white', label: 'plastic-blue', ear: 'plastic-white', bail: 'plastic-black', grip: 'plastic-black' })
  + { voxelGrain: 0.004 },

  // An empty one-gallon steel paint can, 168 mm across and 190 mm tall, 210 mm with its handle up: bare
  // steel with rolled rims, a paper label band, and a wire bail with a wooden grip.
  h.compound('paint_can_steel', 0.46, [
    turned('can', 'steel', 'y', [[0, 0], [0, 0.082], [0.19, 0.082], [0.19, 0]]),
    turned('chime-foot', 'steel', 'y', [[0, 0], [0, 0.085], [0.008, 0.085], [0.008, 0]]),
    turned('chime-top', 'steel', 'y', [[0, 0], [0, 0.085], [0.01, 0.085], [0.01, 0]], [0, 0.18, 0]),
    disc('lid', 'lid', 0.07, 0.19, 0.192),
    turned('label', 'label', 'y', [[0, 0], [0, 0.0835], [0.12, 0.0835], [0.12, 0]], [0, 0.03, 0]),
  ] + bail(0.086, 0.15, 0.21, 0.004, 0.07), { steel: 'steel-grey', lid: 'alu-bare', label: 'paint-red', ear: 'steel-grey', bail: 'steel', grip: 'wood-pine' })
  + { voxelGrain: 0.004 },

  // A soft fabric pencil case lying on its side, 210 mm long, 90 mm wide and 70 mm tall: a navy pouch
  // with a black zip along its top and a metal pull with a fabric tab at one end.
  h.compound('pencil_case', 0.06, [
    h.prism('pouch', 'cloth', 'x', [[0, -0.04], [0, 0.04], [0.04, 0.045], [0.06, 0.03], [0.068, 0], [0.06, -0.03], [0.04, -0.045]], -0.1, 0.1),
    h.prism('end-a', 'cloth', 'x', [[0.004, -0.034], [0.004, 0.034], [0.04, 0.039], [0.056, 0.026], [0.062, 0], [0.056, -0.026], [0.04, -0.039]], -0.105, -0.1),
    h.prism('end-b', 'cloth', 'x', [[0.004, -0.034], [0.004, 0.034], [0.04, 0.039], [0.056, 0.026], [0.062, 0], [0.056, -0.026], [0.04, -0.039]], 0.1, 0.105),
    box('zip', 'zip', [-0.1, 0.066, -0.006], [0.1, 0.072, 0.006]),
    box('pull', 'metal', [0.07, 0.072, -0.005], [0.085, 0.076, 0.005]),
    box('pull-tab', 'tab', [0.085, 0.07, -0.006], [0.11, 0.074, 0.006]),
  ], { cloth: 'paint-police-blue', zip: 'plastic-black', metal: 'steel', tab: 'plastic-red' })
  + { voxelGrain: 0.004 },

  // A 90 mm glass Petri dish with its lid on, 96 mm across and 16 mm tall: a shallow dish under a
  // slightly wider lid, a white frosted writing patch on the lid.
  h.compound('petri_dish', 0.1, [
    turned('dish', 'glass', 'y', [[0, 0], [0, 0.045], [0.013, 0.045], [0.013, 0]]),
    turned('lid', 'glass', 'y', [[0, 0.046], [0, 0.048], [0.012, 0.048], [0.012, 0.046]], [0, 0.004, 0]),
    disc('lid-top', 'glass', 0.048, 0.014, 0.016),
    box('patch', 'patch', [0.01, 0.016, -0.012], [0.035, 0.0175, 0.012]),
  ], { glass: 'glass-clear', patch: 'plastic-frosted' })
  + { voxelGrain: 0.002 },

  // A seven-day plastic pill organiser, 150 mm long, 32 mm deep and 22 mm tall: a frosted strip of seven
  // compartments, each under its own coloured snap lid with a thumb tab at the front.
  h.compound('pillbox', 0.038, [
    box('strip', 'base', [-0.075, 0, -0.016], [0.075, 0.018, 0.016]),
    box('hinge', 'base', [-0.075, 0.016, -0.016], [0.075, 0.022, -0.012]),
  ] + std.flattenArrays([
    [
      box('lid-%d' % i, 'lid-%d' % i, [-0.075 + i * 0.0214 + 0.001, 0.018, -0.012], [-0.075 + (i + 1) * 0.0214 - 0.001, 0.022, 0.016]),
      box('tab-%d' % i, 'lid-%d' % i, [-0.075 + i * 0.0214 + 0.006, 0.014, 0.016], [-0.075 + (i + 1) * 0.0214 - 0.006, 0.022, 0.019]),
    ]
    for i in std.range(0, 6)
  ]), {
    base: 'plastic-frosted',
    'lid-0': 'plastic-red',
    'lid-1': 'plastic-orange',
    'lid-2': 'plastic-yellow',
    'lid-3': 'plastic-green',
    'lid-4': 'plastic-blue',
    'lid-5': 'plastic-pink',
    'lid-6': 'plastic-white',
  })
  + { voxelGrain: 0.002 },
]
