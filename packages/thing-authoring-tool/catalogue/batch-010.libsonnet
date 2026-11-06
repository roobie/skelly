local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A regular slotted carton knocked down flat, lying on y: the two visible panels side by side along x
// (`length` + `width` of the built box), the flaps above and below them along z (half the `width` each), a
// slot between the flaps at the panel fold and a glue tab at -x. Every fold is drawn as a pale crease line.
local flatCarton(length, width, height, thickness, crease) =
  local x0 = -(length + width) / 2, x1 = (length + width) / 2, fold = x0 + length, z0 = height / 2, z1 = height / 2 + width / 2;
  [
    box('panels', 'board', [x0, 0, -z0], [x1, thickness, z0]),
    box('tab', 'board', [x0 - crease * 4, 0, -z0 + crease * 2], [x0, thickness, z0 - crease * 2]),
    box('crease-fold', 'crease', [fold - crease / 2, 0, -z0], [fold + crease / 2, thickness, z0]),
    box('crease-tab', 'crease', [x0, 0, -z0], [x0 + crease, thickness, z0]),
  ] + std.flattenArrays([
    [
      box('crease-%s' % side.id, 'crease', [x0, 0, side.z(z0 - crease, z0)[0]], [x1, thickness, side.z(z0 - crease, z0)[1]]),
      box('flap-%s-long' % side.id, 'board', [x0, 0, side.z(z0, z1)[0]], [fold - crease, thickness, side.z(z0, z1)[1]]),
      box('flap-%s-short' % side.id, 'board', [fold + crease, 0, side.z(z0, z1)[0]], [x1, thickness, side.z(z0, z1)[1]]),
    ]
    // Each side gives its z span from two distances off the centre line, low before high.
    for side in [{ id: 'top', z(a, b): [a, b] }, { id: 'foot', z(a, b): [-b, -a] }]
  ]);
[
  // A 50 gallon glass aquarium, 920 mm long, 530 mm tall and 460 mm deep, its glass panes set in a black
  // plastic foot frame and a black top rim with a centre brace.
  h.compound('aquarium_medium', 35, [
    box('foot', 'trim', [-0.46, 0, -0.23], [0.46, 0.03, 0.23]),
    box('pane-front', 'glass', [-0.45, 0.03, 0.21], [0.45, 0.5, 0.22]),
    box('pane-back', 'glass', [-0.45, 0.03, -0.22], [0.45, 0.5, -0.21]),
    box('pane-left', 'glass', [-0.45, 0.03, -0.21], [-0.44, 0.5, 0.21]),
    box('pane-right', 'glass', [0.44, 0.03, -0.21], [0.45, 0.5, 0.21]),
    box('rim-front', 'trim', [-0.46, 0.5, 0.2], [0.46, 0.53, 0.23]),
    box('rim-back', 'trim', [-0.46, 0.5, -0.23], [0.46, 0.53, -0.2]),
    box('rim-left', 'trim', [-0.46, 0.5, -0.2], [-0.43, 0.53, 0.2]),
    box('rim-right', 'trim', [0.43, 0.5, -0.2], [0.46, 0.53, 0.2]),
    box('brace', 'trim', [-0.03, 0.51, -0.2], [0.03, 0.53, 0.2]),
  ], { glass: 'glass-clear', trim: 'plastic-black' }),

  // A freshly glued 50 gallon aquarium, 900 mm long, 510 mm tall and 440 mm deep: bare glass panes on a
  // glass floor with no frame yet, white silicone beads in every corner and masking tape strapping the
  // corners while the silicone cures.
  h.compound('aquarium_medium_drying', 44, [
    box('floor', 'glass', [-0.45, 0, -0.22], [0.45, 0.01, 0.22]),
    box('pane-front', 'glass', [-0.45, 0.01, 0.21], [0.45, 0.51, 0.22]),
    box('pane-back', 'glass', [-0.45, 0.01, -0.22], [0.45, 0.51, -0.21]),
    box('pane-left', 'glass', [-0.45, 0.01, -0.21], [-0.44, 0.51, 0.21]),
    box('pane-right', 'glass', [0.44, 0.01, -0.21], [0.45, 0.51, 0.21]),
  ] + [
    box('bead-%s' % c.id, 'silicone', [c.x - 0.01, 0.01, c.z - 0.01], [c.x + 0.01, 0.5, c.z + 0.01])
    for c in [{ id: 'fl', x: -0.43, z: 0.2 }, { id: 'fr', x: 0.43, z: 0.2 }, { id: 'bl', x: -0.43, z: -0.2 }, { id: 'br', x: 0.43, z: -0.2 }]
  ] + [
    box('bead-floor-front', 'silicone', [-0.43, 0.01, 0.19], [0.43, 0.02, 0.21]),
    box('bead-floor-back', 'silicone', [-0.43, 0.01, -0.21], [0.43, 0.02, -0.19]),
    box('bead-floor-left', 'silicone', [-0.44, 0.01, -0.19], [-0.42, 0.02, 0.19]),
    box('bead-floor-right', 'silicone', [0.42, 0.01, -0.19], [0.44, 0.02, 0.19]),
  ] + [
    // Tape wraps every corner: a strip on the long pane and one round onto the end pane.
    box('tape-%s-%s-%d-%s' % [c.id, side.id, i, part.id], 'tape', part.min, part.max)
    for c in [{ id: 'left', inner: -0.39, outer: -0.46, end: -0.45 }, { id: 'right', inner: 0.39, outer: 0.46, end: 0.45 }]
    for side in [{ id: 'front', s: 1 }, { id: 'back', s: -1 }]
    for i in [0, 1]
    for y in [[0.12, 0.34][i]]
    for part in [
      { id: 'long', min: [std.min(c.inner, c.outer), y, std.min(0.22 * side.s, 0.23 * side.s)], max: [std.max(c.inner, c.outer), y + 0.05, std.max(0.22 * side.s, 0.23 * side.s)] },
      { id: 'end', min: [std.min(c.end, c.outer), y, std.min(0.16 * side.s, 0.22 * side.s)], max: [std.max(c.end, c.outer), y + 0.05, std.max(0.16 * side.s, 0.22 * side.s)] },
    ]
  ], { glass: 'glass-clear', silicone: 'plastic-white', tape: 'paint-cream' }),

  // A large canvas sack, 420 mm wide, 290 mm deep and 560 mm tall, standing slumped and flattened with
  // its neck gathered and tied with an olive cord, the tied-off cloth flaring above the tie.
  h.compound('bag_canvas', 0.6, [
    h.prism('sack', 'canvas', 'z', [[-0.19, 0], [0.19, 0], [0.21, 0.04], [0.2, 0.27], [0.15, 0.37], [0.05, 0.43], [-0.05, 0.43], [-0.15, 0.37], [-0.2, 0.27], [-0.21, 0.04]], -0.1, 0.1),
    turned('belly', 'canvas', 'y', [[0, 0], [0, 0.12], [0.03, 0.145], [0.2, 0.145], [0.32, 0.11], [0.42, 0.05], [0.43, 0]]),
    turned('neck', 'canvas', 'y', [[0, 0], [0, 0.06], [0.03, 0.035], [0.05, 0.03], [0.05, 0]], [0, 0.42, 0]),
    turned('tuft', 'canvas', 'y', [[0, 0], [0, 0.03], [0.03, 0.06], [0.07, 0.08], [0.08, 0.05], [0.08, 0]], [0, 0.47, 0]),
    box('frill-a', 'canvas', [0.03, 0.52, -0.02], [0.09, 0.56, 0.02]),
    box('frill-b', 'canvas', [-0.08, 0.52, -0.01], [-0.03, 0.55, 0.03]),
    box('frill-c', 'canvas', [-0.02, 0.52, 0.04], [0.02, 0.57, 0.08]),
    turned('tie', 'cord', 'y', [[0, 0], [0, 0.038], [0.016, 0.038], [0.016, 0]], [0, 0.46, 0]),
    box('tie-end-a', 'cord', [0.032, 0.39, 0.03], [0.04, 0.47, 0.038]),
    box('tie-end-b', 'cord', [0.02, 0.4, 0.036], [0.028, 0.47, 0.044]),
  ], { canvas: 'cloth-canvas', cord: 'cord-olive' })
  + { voxelGrain: 0.004 },

  // A thin white carrier bag standing open, 280 mm wide and 400 mm tall with its handles, with a U cut
  // between two looped handles and a red printed panel on the front.
  h.compound('bag_plastic', 0.008, [
    h.prism('body', 'bag', 'z', [[-0.13, 0], [0.13, 0], [0.139, 0.25], [-0.139, 0.25]], -0.04, 0.04),
    h.prism('shoulder-right', 'bag', 'z', [[0.05, 0.25], [0.139, 0.25], [0.14, 0.28], [0.07, 0.28]], -0.03, 0.03),
    h.prism('shoulder-left', 'bag', 'z', [[-0.139, 0.25], [-0.05, 0.25], [-0.07, 0.28], [-0.14, 0.28]], -0.03, 0.03),
    box('handle-right-outer', 'bag', [0.12, 0.28, -0.008], [0.14, 0.4, 0.008]),
    box('handle-right-inner', 'bag', [0.07, 0.28, -0.008], [0.09, 0.4, 0.008]),
    box('handle-right-top', 'bag', [0.07, 0.38, -0.008], [0.14, 0.4, 0.008]),
    box('handle-left-outer', 'bag', [-0.14, 0.28, -0.008], [-0.12, 0.4, 0.008]),
    box('handle-left-inner', 'bag', [-0.09, 0.28, -0.008], [-0.07, 0.4, 0.008]),
    box('handle-left-top', 'bag', [-0.14, 0.38, -0.008], [-0.07, 0.4, 0.008]),
  ] + [
    box('print', 'print', [-0.06, 0.08, 0.04], [0.06, 0.18, 0.044]),
  ], { bag: 'plastic-white', print: 'plastic-red' })
  + { voxelGrain: 0.004 },

  // A 500 ml plastic water bottle, 66 mm across and 184 mm tall, pale blue-clear with a wraparound
  // label, grip ribs above it and a white screw cap on a neck ring.
  h.compound('bottle_plastic', 0.52, [
    turned('bottle', 'bottle', 'y', [[0, 0], [0, 0.028], [0.006, 0.033], [0.125, 0.033], [0.15, 0.024], [0.163, 0.0135], [0.168, 0.0135], [0.168, 0]]),
    turned('rib-a', 'bottle', 'y', [[0, 0], [0, 0.0345], [0.004, 0.0345], [0.004, 0]], [0, 0.112, 0]),
    turned('rib-b', 'bottle', 'y', [[0, 0], [0, 0.0345], [0.004, 0.0345], [0.004, 0]], [0, 0.02, 0]),
    turned('label', 'label', 'y', [[0, 0], [0, 0.0345], [0.06, 0.0345], [0.06, 0]], [0, 0.044, 0]),
    disc('neck-ring', 'cap', 0.017, 0.162, 0.165),
    turned('cap', 'cap', 'y', [[0, 0], [0, 0.0155], [0.015, 0.0155], [0.016, 0.014], [0.016, 0]], [0, 0.166, 0]),
  ], { bottle: 'plastic-clear-blue', label: 'plastic-blue', cap: 'plastic-white' })
  + h.inHand('bottle_plastic', 'bottle') + { voxelGrain: 0.004 },

  // An empty pharmacy prescription bottle, 50 mm across and 104 mm tall, amber with a white paper label
  // and a wide white ribbed push-and-turn cap.
  h.compound('bottle_plastic_pill_prescription', 0.015, [
    turned('bottle', 'bottle', 'y', [[0, 0], [0, 0.022], [0.002, 0.024], [0.086, 0.024], [0.086, 0]]),
    turned('label', 'label', 'y', [[0, 0], [0, 0.0244], [0.05, 0.0244], [0.05, 0]], [0, 0.016, 0]),
    turned('cap', 'cap', 'y', [[0, 0], [0, 0.026], [0.016, 0.026], [0.018, 0.024], [0.018, 0]], [0, 0.086, 0]),
  ] + [
    box('grip-%d' % i, 'cap', [0.0255 * std.cos(i * std.pi / 6) - 0.0015, 0.088, 0.0255 * std.sin(i * std.pi / 6) - 0.0015], [0.0255 * std.cos(i * std.pi / 6) + 0.0015, 0.102, 0.0255 * std.sin(i * std.pi / 6) + 0.0015])
    for i in std.range(0, 11)
  ], { bottle: 'plastic-amber', label: 'paper-white', cap: 'plastic-white' })
  + h.inHand('bottle_plastic_pill_prescription', 'bottle') + { voxelGrain: 0.002 },

  // A knocked-down large shipping carton lying flat, 1.5 m by 1.2 m and 10 mm thick: an 800 by 700 by
  // 500 mm box with its flaps above and below the panels and a glue tab at one end.
  h.compound('box_large_folded', 3.7, flatCarton(0.8, 0.7, 0.5, 0.01, 0.01), { board: 'paperboard-tan', crease: 'paperboard-brown' }),

  // A knocked-down shipping carton lying flat, 800 mm by 700 mm and 10 mm thick: a 450 by 350 by 350 mm
  // box with its flaps above and below the panels and a glue tab at one end.
  h.compound('box_medium_folded', 0.55, flatCarton(0.45, 0.35, 0.35, 0.01, 0.01), { board: 'paperboard-tan', crease: 'paperboard-brown' }),

  // A knocked-down long carton lying flat, 2.2 m by 800 mm and 10 mm thick: a 1.8 m by 400 by 400 mm
  // box for long things, with its flaps above and below the panels and a glue tab at one end.
  h.compound('box_oversize_folded', 3.6, flatCarton(1.8, 0.4, 0.4, 0.01, 0.01), { board: 'paperboard-tan', crease: 'paperboard-brown' }),

  // A knocked-down small carton lying flat, 300 mm by 240 mm and 8 mm thick: a 180 by 120 by 120 mm box
  // with its flaps above and below the panels and a glue tab at one end.
  h.compound('box_small_folded', 0.06, flatCarton(0.18, 0.12, 0.12, 0.008, 0.004), { board: 'paperboard-tan', crease: 'paperboard-brown' })
  + { voxelGrain: 0.004 },

  // A black hard plastic handgun case lying flat, 516 mm long, 330 mm deep and 104 mm tall: a ribbed lid
  // over a lid seam, a rubber carry handle and two grey latches on the front edge, and hinges on the back.
  h.compound('box_pistol', 2.4, [
    box('base', 'shell', [-0.256, 0, -0.164], [0.256, 0.048, 0.164]),
    box('seam', 'seam', [-0.252, 0.048, -0.16], [0.252, 0.052, 0.16]),
    box('lid', 'shell', [-0.256, 0.052, -0.164], [0.256, 0.096, 0.164]),
    box('rib-a', 'shell', [-0.22, 0.096, -0.13], [0.22, 0.104, -0.11]),
    box('rib-b', 'shell', [-0.22, 0.096, 0.11], [0.22, 0.104, 0.13]),
    box('rib-c', 'shell', [-0.22, 0.096, -0.01], [0.22, 0.104, 0.01]),
    box('lip-front', 'shell', [-0.256, 0.04, 0.164], [0.256, 0.06, 0.172]),
    box('post-a', 'handle', [-0.07, 0.036, 0.172], [-0.05, 0.06, 0.2]),
    box('post-b', 'handle', [0.05, 0.036, 0.172], [0.07, 0.06, 0.2]),
    box('grip', 'handle', [-0.07, 0.036, 0.2], [0.07, 0.06, 0.216]),
    box('latch-a', 'latch', [-0.19, 0.03, 0.172], [-0.13, 0.072, 0.18]),
    box('latch-b', 'latch', [0.13, 0.03, 0.172], [0.19, 0.072, 0.18]),
    box('hinge-a', 'latch', [-0.18, 0.04, -0.172], [-0.1, 0.06, -0.164]),
    box('hinge-b', 'latch', [0.1, 0.04, -0.172], [0.18, 0.06, -0.164]),
  ], { shell: 'polymer-black', seam: 'plastic-grey', handle: 'rubber-black', latch: 'plastic-grey' })
  + { voxelGrain: 0.004 },

  // A small closed cardboard box, 210 mm long, 120 mm wide and 92 mm tall, its top flaps meeting under a
  // strip of tan packing tape that runs down both ends, with a white shipping label.
  h.compound('box_small', 0.07, [
    box('body', 'board', [-0.104, 0, -0.06], [0.104, 0.088, 0.06]),
    box('flap-a', 'board', [-0.104, 0.088, -0.06], [0.104, 0.092, -0.002]),
    box('flap-b', 'board', [-0.104, 0.088, 0.002], [0.104, 0.092, 0.06]),
    box('tape-top', 'tape', [-0.104, 0.092, -0.024], [0.104, 0.096, 0.024]),
    box('tape-end-a', 'tape', [-0.108, 0.04, -0.024], [-0.104, 0.096, 0.024]),
    box('tape-end-b', 'tape', [0.104, 0.04, -0.024], [0.108, 0.096, 0.024]),
    box('label', 'label', [0.036, 0.092, 0.03], [0.096, 0.094, 0.056]),
  ], { board: 'paperboard-tan', tape: 'paperboard-brown', label: 'paper-white' })
  + h.inHand('box_small', 'body') + { voxelGrain: 0.004 },

  // A small grey steel box, 210 mm long, 128 mm wide and 98 mm tall, with a lipped hinged lid, a folding
  // handle on the lid, a hasp on the front and a hinge along the back.
  h.compound('box_small_metal', 1.4, [
    box('body', 'steel', [-0.104, 0, -0.06], [0.104, 0.07, 0.06]),
    box('lid', 'steel', [-0.106, 0.07, -0.062], [0.106, 0.09, 0.062]),
    box('lid-top', 'steel', [-0.1, 0.09, -0.056], [0.1, 0.094, 0.056]),
    box('handle-grip', 'handle', [-0.04, 0.094, -0.004], [0.04, 0.098, 0.004]),
    box('handle-mount-a', 'handle', [-0.048, 0.094, -0.008], [-0.036, 0.098, 0.008]),
    box('handle-mount-b', 'handle', [0.036, 0.094, -0.008], [0.048, 0.098, 0.008]),
    box('hasp', 'handle', [-0.012, 0.05, 0.06], [0.012, 0.084, 0.064]),
    box('staple', 'handle', [-0.004, 0.056, 0.064], [0.004, 0.064, 0.07]),
    box('hinge', 'handle', [-0.09, 0.064, -0.066], [0.09, 0.076, -0.06]),
  ], { steel: 'steel-grey', handle: 'steel' })
  + h.inHand('box_small_metal', 'body') + { voxelGrain: 0.002 },

  // A small walnut keepsake box, 220 mm long, 140 mm wide and 104 mm tall, with an overhanging lid, a pale
  // birch panel inlaid in the lid, brass hinges at the back, a brass clasp at the front and four low feet.
  h.compound('box_small_wood', 0.71, [
    box('body', 'wood', [-0.106, 0.008, -0.066], [0.106, 0.076, 0.066]),
    box('lid', 'wood', [-0.11, 0.076, -0.07], [0.11, 0.1, 0.07]),
    box('lid-cap', 'wood', [-0.1, 0.1, -0.06], [0.1, 0.104, 0.06]),
    box('inlay', 'inlay', [-0.07, 0.1, -0.036], [0.07, 0.106, 0.036]),
    box('clasp', 'brass', [-0.01, 0.06, 0.066], [0.01, 0.088, 0.072]),
    box('hinge-a', 'brass', [-0.08, 0.068, -0.072], [-0.05, 0.084, -0.066]),
    box('hinge-b', 'brass', [0.05, 0.068, -0.072], [0.08, 0.084, -0.066]),
  ] + [
    box('foot-%d' % i, 'wood', [f[0] - 0.014, 0, f[1] - 0.014], [f[0] + 0.014, 0.008, f[1] + 0.014])
    for i in [0, 1, 2, 3]
    for f in [[[-0.09, -0.05], [0.09, -0.05], [-0.09, 0.05], [0.09, 0.05]][i]]
  ], { wood: 'wood-walnut', inlay: 'wood-birch', brass: 'brass' })
  + h.inHand('box_small_wood', 'body') + { voxelGrain: 0.004 },

  // A small printed snack carton, 120 mm tall, 90 mm wide and 50 mm deep, red with a cream window panel on
  // the front, a yellow band near the foot and a tuck flap seam across the top.
  h.compound('box_snack', 0.12, [
    box('body', 'print', [-0.045, 0, -0.025], [0.045, 0.118, 0.025]),
    box('tuck', 'print', [-0.045, 0.118, -0.025], [0.045, 0.12, 0.025]),
    box('tuck-edge', 'flap', [-0.045, 0.11, 0.025], [0.045, 0.118, 0.026]),
    box('panel', 'panel', [-0.032, 0.04, 0.025], [0.032, 0.096, 0.027]),
    box('band', 'band', [-0.045, 0.012, 0.025], [0.045, 0.026, 0.027]),
  ], { print: 'paint-red', flap: 'paperboard-tan', panel: 'paint-cream', band: 'plastic-yellow' })
  + h.inHand('box_snack', 'body') + { voxelGrain: 0.002 },
]
