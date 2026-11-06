local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
local rod = h.rod;
// A flat sheet lying on y, `l` along x and `w` along z, `t` thick: the face in `face`, a band `e` wide along each
// edge in `edge` so the sheet's rim reads, and a maker's sticker in one corner.
local sheet(l, w, t, e, face, edge) = [
  box('face', face, [-l / 2 + e, 0, -w / 2 + e], [l / 2 - e, t, w / 2 - e]),
  box('edge-front', edge, [-l / 2, 0, w / 2 - e], [l / 2, t, w / 2]),
  box('edge-back', edge, [-l / 2, 0, -w / 2], [l / 2, t, -w / 2 + e]),
  box('edge-left', edge, [-l / 2, 0, -w / 2 + e], [-l / 2 + e, t, w / 2 - e]),
  box('edge-right', edge, [l / 2 - e, 0, -w / 2 + e], [l / 2, t, w / 2 - e]),
];
// An arc of wire in the x-y plane at z, centred at (0, cy), radius r, from angle a0 to a1 (0 is +x), as convex quads.
local arc(prefix, slot, r, t, cy, a0, a1, n, z) = [
  local b0 = a0 + (a1 - a0) * k / n, b1 = a0 + (a1 - a0) * (k + 1) / n;
  h.prism('%s-%d' % [prefix, k], slot, 'z', [
    [(r - t) * std.cos(b0), cy + (r - t) * std.sin(b0)],
    [(r + t) * std.cos(b0), cy + (r + t) * std.sin(b0)],
    [(r + t) * std.cos(b1), cy + (r + t) * std.sin(b1)],
    [(r - t) * std.cos(b1), cy + (r - t) * std.sin(b1)],
  ], z - t, z + t)
  for k in std.range(0, n - 1)
];
[
  // A small glass bottle of mercury, 32 mm across and 62 mm tall with a black screw cap: 30 mL of the metal
  // fills its lower part, under a white warning label.
  h.compound('mercury', 0.35, [
    turned('bottle', 'glass', 'y', [[0, 0], [0, 0.016], [0.002, 0.016], [0.044, 0.016], [0.05, 0.009], [0.052, 0.0085], [0.052, 0]]),
    disc('metal', 'metal', 0.0145, 0.003, 0.038),
    disc('cap', 'cap', 0.0105, 0.051, 0.063),
    disc('cap-top', 'captop', 0.0095, 0.063, 0.064),
    h.tube('label', 'label', 0.016, 0.0166, 0, 0.026) + { axis: 'y', origin: [0, 0.012, 0] },
    box('label-mark', 'mark', [-0.006, 0.017, 0.0164], [0.006, 0.033, 0.0172]),
  ], { glass: 'glass-clear', metal: 'mirror-silver', cap: 'plastic-black', captop: 'plastic-charcoal', label: 'paper-white', mark: 'paint-red' })
  + { voxelGrain: 0.002 },

  // A sheet of window glass, 1220 mm by 915 mm and 2.4 mm thick, lying flat, its green-tinged edges showing and a
  // maker's sticker in one corner.
  h.compound('glass_sheet', 6.7, sheet(1.22, 0.915, 0.0024, 0.006, 'glass', 'edge') + [
    box('sticker', 'sticker', [0.5, 0.0024, 0.34], [0.58, 0.0034, 0.4]),
  ], { glass: 'glass-clear', edge: 'syrup-green', sticker: 'paper-white' })
  + { voxelGrain: 0.004 },

  // A pane of bullet-resistant glass, 305 mm square and 57 mm thick: layers of glass and clear plastic bonded
  // together, held in a steel channel frame whose lips cover 12 mm of each face.
  local s = 0.305, t = 0.057, lip = 0.012, wall = 0.004;
  h.compound('reinforced_glass_pane', 15, [
    box('core', 'glass', [-s / 2 + wall, 0, -s / 2 + wall], [s / 2 - wall, t, s / 2 - wall]),
  ] + [
    box('layer-%d' % i, 'interlayer', [-s / 2 + wall, y, -s / 2 + wall], [s / 2 - wall, y + 0.002, s / 2 - wall])
    for i in [0, 1, 2]
    for y in [[0.014, 0.028, 0.042][i]]
  ] + [
    box('frame-front', 'frame', [-s / 2, 0, s / 2 - wall], [s / 2, t, s / 2]),
    box('frame-back', 'frame', [-s / 2, 0, -s / 2], [s / 2, t, -s / 2 + wall]),
    box('frame-left', 'frame', [-s / 2, 0, -s / 2 + wall], [-s / 2 + wall, t, s / 2 - wall]),
    box('frame-right', 'frame', [s / 2 - wall, 0, -s / 2 + wall], [s / 2, t, s / 2 - wall]),
  ] + std.flattenArrays([
    [
      box('lip-%s-front' % f, 'frame', [-s / 2, y, s / 2 - lip], [s / 2, y + 0.003, s / 2]),
      box('lip-%s-back' % f, 'frame', [-s / 2, y, -s / 2], [s / 2, y + 0.003, -s / 2 + lip]),
      box('lip-%s-left' % f, 'frame', [-s / 2, y, -s / 2 + lip], [-s / 2 + lip, y + 0.003, s / 2 - lip]),
      box('lip-%s-right' % f, 'frame', [s / 2 - lip, y, -s / 2 + lip], [s / 2, y + 0.003, s / 2 - lip]),
    ]
    for f in ['top', 'bottom']
    for y in [if f == 'top' then t else 0]
  ]), { glass: 'glass-clear', interlayer: 'plastic-frosted', frame: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A sheet of bullet-resistant glass, 1220 mm by 915 mm and 19 mm thick, lying flat: laminated glass edged all
  // round with a steel strip, a stencilled rating stripe along the front edge.
  h.compound('reinforced_glass_sheet', 57, sheet(1.22, 0.915, 0.019, 0.02, 'glass', 'frame') + [
    box('layer-%d' % i, 'interlayer', [-0.6, y, -0.4375], [0.6, y + 0.002, 0.4375])
    for i in [0, 1]
    for y in [[0.006, 0.012][i]]
  ] + [
    box('stripe', 'stripe', [-0.3, 0.019, 0.4], [0.3, 0.02, 0.45]),
  ], { glass: 'glass-clear', interlayer: 'plastic-frosted', frame: 'steel-grey', stripe: 'paint-crane-yellow' })
  + { voxelGrain: 0.004 },

  // A sheet of tempered safety glass, 1220 mm by 965 mm and 6 mm thick, lying flat, with the etched maker's mark
  // tempered glass carries in one corner.
  h.compound('tempered_glass_sheet', 18, sheet(1.22, 0.965, 0.006, 0.006, 'glass', 'edge') + [
    box('mark', 'mark', [0.52, 0.006, 0.4], [0.58, 0.007, 0.44]),
  ], { glass: 'glass-clear', edge: 'syrup-green', mark: 'plastic-frosted' })
  + { voxelGrain: 0.004 },

  // A gallon can of paint, 168 mm across and 192 mm tall: a steel can with rolled rims, a pressed lid, a wire bail
  // with a plastic grip, a wide label band in the paint's colour and a run of paint down the front from the rim.
  local r = 0.084, ht = 0.192;
  h.compound('paint_red', 4.6, [
    disc('body', 'can', r - 0.002, 0.004, ht - 0.004),
    turned('chime-bottom', 'can', 'y', [[0, 0], [0, r], [0.004, r], [0.004, 0]]),
    turned('chime-top', 'can', 'y', [[0, 0.07], [0, r], [0.006, r], [0.006, 0.07], [0, 0.07]], [0, ht - 0.006, 0]),
    disc('lid', 'lid', 0.07, ht - 0.006, ht - 0.002),
    turned('lid-ring', 'can', 'y', [[0, 0.06], [0, 0.07], [0.003, 0.07], [0.003, 0.06], [0, 0.06]], [0, ht - 0.002, 0]),
    h.tube('label', 'paint', r - 0.002, r + 0.0005, 0, 0.11) + { axis: 'y', origin: [0, 0.04, 0] },
    box('label-panel', 'panel', [-0.03, 0.07, r - 0.002], [0.03, 0.12, r + 0.002]),
    box('drip', 'paint', [0.034, 0.15, r - 0.008], [0.044, ht, r + 0.001]),
    box('drip-top', 'paint', [0.03, ht - 0.002, 0.06], [0.05, ht + 0.001, r]),
    box('ear-left', 'can', [-r - 0.004, 0.15, -0.008], [-r + 0.002, 0.166, 0.008]),
    box('ear-right', 'can', [r - 0.002, 0.15, -0.008], [r + 0.004, 0.166, 0.008]),
  ] + arc('bail', 'bail', r + 0.002, 0.0015, 0.158, 0, std.pi, 12, 0) + [
    rod('grip', 'grip', 0.007, -0.03, 0.03, 0.158 + r + 0.002),
  ], { can: 'steel-stainless', lid: 'steel-grey', paint: 'paint-red', panel: 'paper-white', bail: 'steel-bright', grip: 'plastic-black' })
  + { voxelGrain: 0.004 },

  // A door viewer, 14 mm across and 48 mm long, lying on its side: a brass barrel with a wide domed lens flange at
  // one end and a slotted eyepiece flange that screws in from the other.
  h.compound('peephole', 0.04, [
    rod('barrel', 'brass', 0.0065, -0.02, 0.022, 0.0105),
    rod('flange', 'brass', 0.0105, 0.018, 0.022, 0.0105),
    turned('lens', 'lens', 'x', [[0, 0], [0, 0.0065], [0.002, 0.0055], [0.003, 0.0035], [0.0035, 0]], [0.022, 0.0105, 0]),
    rod('sleeve', 'sleeve', 0.0075, -0.026, -0.006, 0.0105),
    rod('eyepiece', 'sleeve', 0.0095, -0.028, -0.024, 0.0105),
    box('slot-a', 'slot', [-0.0282, 0.0105 - 0.0008, -0.0085], [-0.0275, 0.0105 + 0.0008, -0.004]),
    box('slot-b', 'slot', [-0.0282, 0.0105 - 0.0008, 0.004], [-0.0275, 0.0105 + 0.0008, 0.0085]),
    rod('eye-glass', 'lens', 0.004, -0.0286, -0.0278, 0.0105),
  ], { brass: 'brass-polished', sleeve: 'brass-dull', lens: 'glass-clear', slot: 'plastic-black' })
  + { voxelGrain: 0.002 },

  // A roll of insect screen, 300 mm wide and 66 mm across, wound on a card core: its loose end lies a little
  // way out in front and a strip of tape holds the roll.
  h.compound('screen_mesh', 0.16, [
    rod('roll', 'mesh', 0.033, -0.15, 0.15, 0.033),
  ] + [
    h.tube('wind-%d-%d' % [s, i], 'shade', 0.012 + i * 0.008, 0.016 + i * 0.008, x, x + 0.002, 0.033)
    for s in [0, 1]
    for i in [0, 1, 2]
    for x in [[-0.1505, 0.1485][s]]
  ] + [
    h.tube('core-%d' % s, 'core', 0.009, 0.012, x, x + 0.004, 0.033)
    for s in [0, 1]
    for x in [[-0.152, 0.148][s]]
  ] + [
    box('tail', 'mesh', [-0.15, 0, 0.02], [0.15, 0.002, 0.09]),
    h.tube('tape', 'tape', 0.033, 0.0345, -0.012, 0.012, 0.033),
  ], { mesh: 'mesh-black', shade: 'plastic-charcoal', core: 'paperboard-tan', tape: 'tape-tan' })
  + { voxelGrain: 0.002 },
]
