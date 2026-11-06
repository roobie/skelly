local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A curved strip of bark lying along x, `length` long, `width` across its curl and `thick` thick, built as
// `n` convex slats round an arc of depth `rise`, arching skin up with the outer skin in slot bark and the
// inner face in slot inner. `ragged` lists each slat's shortfall at the -x and +x ends, so the strip reads
// torn rather than sawn.
local barkStrip(length, width, thick, rise, n, ragged) =
  local r = (width * width / 4 + rise * rise) / (2 * rise), half = std.asin(width / 2 / r);
  local yz(a, rr) = [rr * std.cos(a) - (r - rise) + thick, rr * std.sin(a)];
  local skin = [r, r - thick * 0.7];
  local face = [skin[1], r - thick];
  std.flattenArrays([
    local a0 = -half + 2 * half * i / n, a1 = -half + 2 * half * (i + 1) / n;
    local x0 = -length / 2 + ragged[i % std.length(ragged)][0], x1 = length / 2 - ragged[i % std.length(ragged)][1];
    [
      h.prism('outer-%d' % i, 'bark', 'x', [yz(a0, skin[0]), yz(a1, skin[0]), yz(a1, skin[1]), yz(a0, skin[1])], x0, x1),
      h.prism('inner-%d' % i, 'inner', 'x', [yz(a0, face[0]), yz(a1, face[0]), yz(a1, face[1]), yz(a0, face[1])], x0, x1),
    ]
    for i in std.range(0, n - 1)
  ]);
// A flat plate lying on y from `y0` to `y1`, its convex outline given as [x, z] points; a y prism takes
// its profile as [z, x].
local plate(id, slot, xz, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in xz], y0, y1);
local tears = [[0.006, 0.0], [0.0, 0.012], [0.014, 0.004], [0.004, 0.0], [0.0, 0.018], [0.01, 0.006], [0.002, 0.002], [0.018, 0.01]];
local alderParts =
(
  local n = 10, segs = 6, len = 0.3, thick = 0.008;
  local aLo = -1.9, aHi = 2.75;
  // Radius tightens from the lower lip round to the upper one, so the roll reads as a curl, not a pipe.
  local rad(a) = 0.03 - 0.012 * (a - aLo) / (aHi - aLo);
  local cy = std.foldl(std.max, [rad(aLo + (aHi - aLo) * k / 20) * std.cos(aLo + (aHi - aLo) * k / 20) for k in std.range(0, 20)], 0);
  local yz(a, rr) = [cy - rr * std.cos(a), rr * std.sin(a)];
  local lo = [0.0, 0.25, 0.08, 0.4, 0.15, 0.3], hi = [0.2, 0.0, 0.35, 0.1, 0.28, 0.05];
  local x(s) = -len / 2 + len * s / segs;
  std.flattenArrays([
    local a0 = aLo + lo[s] + (aHi - hi[s] - aLo - lo[s]) * i / n, a1 = aLo + lo[s] + (aHi - hi[s] - aLo - lo[s]) * (i + 1) / n;
    local xa = if s == 0 then x(0) + tears[i % 8][0] else x(s), xb = if s == segs - 1 then x(segs) - tears[(i + 3) % 8][1] else x(s + 1);
    local ro0 = rad(a0), ro1 = rad(a1);
    [
      h.prism('outer-%d-%d' % [s, i], 'bark', 'x', [yz(a0, ro0), yz(a1, ro1), yz(a1, ro1 - thick * 0.6), yz(a0, ro0 - thick * 0.6)], xa, xb),
      h.prism('inner-%d-%d' % [s, i], 'inner', 'x', [yz(a0, ro0 - thick * 0.6), yz(a1, ro1 - thick * 0.6), yz(a1, ro1 - thick), yz(a0, ro0 - thick)], xa, xb),
    ]
    for s in std.range(0, segs - 1)
    for i in std.range(0, n - 1)
  ]) + [
    // Short dark lenticels across the grey skin.
    h.prism('lenticel-%d' % k, 'mark', 'x', [yz(1.5 + 0.45 * (k % 3), rad(1.5 + 0.45 * (k % 3)) + 0.0006), yz(1.65 + 0.45 * (k % 3), rad(1.65 + 0.45 * (k % 3)) + 0.0006), yz(1.65 + 0.45 * (k % 3), rad(1.65 + 0.45 * (k % 3)) - 0.001), yz(1.5 + 0.45 * (k % 3), rad(1.5 + 0.45 * (k % 3)) - 0.001)], -0.12 + 0.045 * k, -0.114 + 0.045 * k)
    for k in std.range(0, 5)
  ]
);
[
  // A thin copper aerial rod, 400 mm long and 5 mm across, with a brass threaded mounting foot at one end
  // and a small ball tip at the other, lying along x.
  h.compound('antenna', 0.072, [
    h.rod('foot', 'foot', 0.006, -0.2, -0.185, 0.006),
    h.rod('thread', 'foot', 0.004, -0.185, -0.17, 0.006),
    h.rod('shaft', 'rod', 0.0025, -0.17, 0.195, 0.006),
    turned('tip', 'rod', 'x', [[0, 0], [0, 0.0035], [0.005, 0.0035], [0.005, 0]], [0.195, 0.006, 0]),
  ], { foot: 'brass', rod: 'copper' })
  + { voxelGrain: 0.002 },

  // A small audio amplifier board, 80 by 60 mm on a 1.6 mm green board: a black amplifier chip bolted to
  // an aluminium heatsink, two electrolytic capacitors, a row of resistors, a volume pot and a screw
  // terminal block for the speaker wires.
  h.compound('amplifier', 0.058, [
    box('board', 'board', [-0.04, 0, -0.03], [0.04, 0.0016, 0.03]),
    box('sink-base', 'sink', [-0.036, 0.0016, -0.026], [-0.006, 0.006, 0.002]),
  ] + [
    box('fin-%d' % i, 'sink', [-0.036 + 0.006 * i, 0.006, -0.026], [-0.034 + 0.006 * i, 0.026, 0.002])
    for i in std.range(0, 5)
  ] + [
    box('chip', 'chip', [-0.03, 0.0016, 0.002], [-0.014, 0.012, 0.006]),
    box('chip-legs', 'pins', [-0.029, 0.0016, 0.006], [-0.015, 0.003, 0.012]),
    disc('cap-a', 'cap', 0.005, 0.0016, 0.018, 0.006, -0.018),
    disc('cap-a-top', 'cap-top', 0.0046, 0.018, 0.0186, 0.006, -0.018),
    disc('cap-b', 'cap', 0.004, 0.0016, 0.014, 0.018, -0.018),
    disc('cap-b-top', 'cap-top', 0.0036, 0.014, 0.0146, 0.018, -0.018),
    box('terminal', 'terminal', [0.026, 0.0016, -0.026], [0.038, 0.012, -0.006]),
    box('terminal-screws', 'pins', [0.028, 0.012, -0.024], [0.036, 0.013, -0.008]),
    box('pot', 'pot', [0.024, 0.0016, 0.008], [0.036, 0.01, 0.02]),
    h.disc('pot-shaft', 'pins', 0.003, 0.01, 0.022, 0.03, 0.014),
    disc('pot-knob', 'knob', 0.006, 0.016, 0.026, 0.03, 0.014),
  ] + [
    box('resistor-%d' % i, 'resistor', [0.002 + 0.004 * i, 0.0016, 0.01], [0.004 + 0.004 * i, 0.004, 0.022])
    for i in std.range(0, 3)
  ], {
    board: 'plastic-green',
    sink: 'alu-bare',
    chip: 'plastic-black',
    pins: 'steel-stainless',
    cap: 'plastic-blue',
    'cap-top': 'alu-bare',
    terminal: 'plastic-blue',
    pot: 'steel-grey',
    knob: 'plastic-black',
    resistor: 'paint-cream',
  })
  + { voxelGrain: 0.002 },

  // A fired clay building brick, 190 by 90 mm and 57 mm tall, with a shallow frog pressed into its top
  // face, lying flat.
  h.compound('brick', 1.8, [
    box('base', 'clay', [-0.095, 0, -0.045], [0.095, 0.045, 0.045]),
    box('rim-left', 'clay', [-0.095, 0.045, -0.045], [-0.06, 0.057, 0.045]),
    box('rim-right', 'clay', [0.06, 0.045, -0.045], [0.095, 0.057, 0.045]),
    box('rim-back', 'clay', [-0.06, 0.045, -0.045], [0.06, 0.057, -0.025]),
    box('rim-front', 'clay', [-0.06, 0.045, 0.025], [0.06, 0.057, 0.045]),
    box('frog', 'frog', [-0.06, 0.045, -0.025], [0.06, 0.047, 0.025]),
  ], { clay: 'clay-terracotta', frog: 'paint-terracotta' })
  + { voxelGrain: 0.004 },

  // A strip of alder bark peeled off a trunk, 300 mm long and about 100 mm across before it curled, 8 mm
  // thick: it has rolled into an open quill with its gap turned up and back, one lip curled tighter than
  // the other. The outer skin is grey-brown and the inner face shows the red-orange alder bark turns once
  // cut. Both long edges break off in uneven steps and both ends are torn.
  h.compound('alder_bark', 0.095, alderParts, { bark: 'bark', inner: 'copper', mark: 'paint-charcoal' })
  + { voxelGrain: 0.002 },

  // A sheet of birch bark, 300 mm long and 120 mm across its curl, about 4 mm thick: a chalky white outer
  // skin crossed by dark horizontal lenticels, and a tan inner face.
  h.compound('birchbark', 0.074, barkStrip(0.3, 0.12, 0.004, 0.022, 8, tears) + [
    box('lenticel-%d-%d' % [i, j], 'mark', [-0.13 + 0.04 * i + 0.012 * (j % 2), 0.0248 - 0.0006 * std.abs(j - 1), -0.016 + 0.014 * j], [-0.112 + 0.04 * i + 0.012 * (j % 2) - 0.004 * (i % 2), 0.0264, -0.0145 + 0.014 * j])
    for i in std.range(0, 6)
    for j in std.range(0, 2)
  ], { bark: 'enamel-white', inner: 'paperboard-tan', mark: 'paint-charcoal' })
  + { voxelGrain: 0.002 },

  // A loose steel blade blank, 500 mm long: a 380 mm blade 44 mm deep with a clipped point and a ground
  // bright edge, and a 120 mm flat tang with two rivet holes, lying flat on its side.
  h.compound('blade', 0.4, [
    plate('body', 'steel', [[-0.13, 0.022], [-0.13, -0.014], [0.25, -0.014], [0.18, 0.022]], 0, 0.003),
    plate('edge', 'edge', [[-0.12, -0.014], [-0.12, -0.022], [0.22, -0.022], [0.25, -0.014]], 0.0005, 0.0025),
    plate('tang', 'steel', [[-0.25, 0.01], [-0.25, -0.01], [-0.13, -0.012], [-0.13, 0.012]], 0, 0.003),
    disc('hole-a', 'hole', 0.003, 0.0026, 0.0032, -0.22, 0),
    disc('hole-b', 'hole', 0.003, 0.0026, 0.0032, -0.16, 0),
  ], { steel: 'steel', edge: 'steel-stainless', hole: 'paint-charcoal' })
  + { voxelGrain: 0.002 },
]
+ (
  // A scythe blade, 700 mm along its sweep, lying flat: a dark forged blade 75 mm deep at the heel curving
  // to a point, a raised spine rib along its back, a honed bright edge, and the upturned tang at the heel
  // that fits the snath.
  local n = 12, x0 = -0.33, x1 = 0.37, R = 0.8;
  local x(i) = x0 + (x1 - x0) * i / n;
  local spine(i) = -0.75 + std.sqrt(R * R - x(i) * x(i));
  local w(i) = 0.075 - 0.069 * std.pow(i / n, 1.3);
  local band(name, slot, lo, hi, y0, y1) = [
    plate('%s-%d' % [name, i], slot, [
      [x(i), spine(i) - w(i) * lo],
      [x(i), spine(i) - w(i) * hi],
      [x(i + 1), spine(i + 1) - w(i + 1) * hi],
      [x(i + 1), spine(i + 1) - w(i + 1) * lo],
    ], y0, y1)
    for i in std.range(0, n - 1)
  ];
  [
    h.compound('blade_scythe', 1.1, band('spine', 'spine', 0, 0.16, 0, 0.007)
      + band('body', 'blade', 0.16, 0.82, 0, 0.003)
      + band('edge', 'edge', 0.82, 1, 0.0005, 0.0022)
      + [
        box('heel', 'spine', [x0 - 0.03, 0, spine(0) - 0.05], [x0, 0.008, spine(0)]),
        box('tang', 'spine', [x0 - 0.03, 0.008, spine(0) - 0.03], [x0 - 0.01, 0.06, spine(0) - 0.012]),
        box('tang-lug', 'spine', [x0 - 0.034, 0.05, spine(0) - 0.034], [x0 - 0.006, 0.058, spine(0) - 0.008]),
      ], { spine: 'steel', blade: 'steel-blued', edge: 'steel-stainless' })
    + { voxelGrain: 0.002 },
  ]
)
+ (
  // Ten cut branches, 1300 mm long and 35 to 45 mm thick, packed three, four and three and tied with
  // cord in two places, lying along x. Their sawn ends show pale wood.
  local sticks = [
    [-0.044, 0.02, 0.020, 0.0, 0.02], [0.0, 0.022, 0.022, 0.03, 0.0], [0.044, 0.02, 0.020, 0.01, 0.04],
    [-0.066, 0.058, 0.019, 0.02, 0.0], [-0.022, 0.06, 0.022, 0.0, 0.03], [0.022, 0.06, 0.021, 0.04, 0.01], [0.066, 0.058, 0.018, 0.0, 0.0],
    [-0.042, 0.098, 0.020, 0.03, 0.02], [0.0, 0.1, 0.022, 0.0, 0.05], [0.042, 0.098, 0.019, 0.02, 0.0],
  ];
  local L = 0.65;
  [
    h.compound('bundle_branch', 6, std.flattenArrays([
      local s = sticks[k], a = -L + s[3], b = L - s[4], r = s[2];
      [
        turned('stick-%d' % k, 'bark', 'x', [[0, 0], [0, r], [b - a - 0.004, r], [b - a - 0.004, 0]], [a + 0.002, s[1], s[0]]),
        turned('end-a-%d' % k, 'wood', 'x', [[0, 0], [0, r * 0.9], [0.002, r * 0.9], [0.002, 0]], [a, s[1], s[0]]),
        turned('end-b-%d' % k, 'wood', 'x', [[0, 0], [0, r * 0.9], [0.002, r * 0.9], [0.002, 0]], [b - 0.002, s[1], s[0]]),
      ]
      for k in std.range(0, std.length(sticks) - 1)
    ]) + [
      turned('tie-%d' % i, 'cord', 'x', [[0, 0.086], [0, 0.092], [0.012, 0.092], [0.012, 0.086], [0, 0.086]], [[-0.42, 0.4][i], 0.06, 0])
      for i in [0, 1]
    ], { bark: 'wood-walnut', wood: 'wood-pine', cord: 'cord-olive' }),
  ]
)
+ [
  // A small glass jar of hide-and-bone glue, 50 mm across and 64 mm tall, filled with amber glue, a cork
  // stopper in its neck and a brown paper label round its middle.
  h.compound('bone_glue', 0.18, [
    turned('jar', 'glass', 'y', [[0, 0], [0, 0.025], [0.05, 0.025], [0.054, 0.016], [0.054, 0]]),
    disc('glue', 'glue', 0.022, 0.003, 0.042),
    turned('label', 'label', 'y', [[0, 0.025], [0, 0.0256], [0.03, 0.0256], [0.03, 0.025], [0, 0.025]], [0, 0.01, 0]),
    turned('cork', 'cork', 'y', [[0, 0], [0, 0.014], [0.012, 0.0155], [0.012, 0]], [0, 0.052, 0]),
  ], { glass: 'glass-clear', glue: 'resin-honey', label: 'paper-butcher', cork: 'cork' })
  + h.inHand('bone_glue', 'jar') + { voxelGrain: 0.002 },

  // A valve guitar amplifier head, 560 mm wide, 250 mm tall and 240 mm deep: a black covered cabinet on
  // rubber feet, a beige grille cloth under a brushed control panel with six knobs, an input jack, a power
  // switch and a red pilot lamp, steel corner caps and a strap handle on top.
  h.compound('amplifier_head', 14, [
    box('cabinet', 'cabinet', [-0.28, 0.01, -0.12], [0.28, 0.25, 0.115]),
    box('grille', 'grille', [-0.26, 0.03, 0.115], [0.26, 0.15, 0.118]),
    box('baffle', 'cabinet', [-0.28, 0.15, 0.115], [0.28, 0.16, 0.12]),
    box('panel', 'panel', [-0.27, 0.16, 0.115], [0.27, 0.235, 0.118]),
    box('lamp', 'lamp', [0.235, 0.19, 0.118], [0.25, 0.205, 0.126]),
    box('switch', 'pins', [0.205, 0.188, 0.118], [0.215, 0.208, 0.13]),
    turned('jack', 'pins', 'z', [[0, 0], [0, 0.007], [0.008, 0.007], [0.008, 0]], [-0.245, 0.1975, 0.118]),
    turned('handle-left', 'pins', 'y', [[0, 0], [0, 0.012], [0.008, 0.012], [0.008, 0]], [-0.1, 0.25, 0]),
    turned('handle-right', 'pins', 'y', [[0, 0], [0, 0.012], [0.008, 0.012], [0.008, 0]], [0.1, 0.25, 0]),
    box('handle', 'handle', [-0.11, 0.258, -0.016], [0.11, 0.272, 0.016]),
  ] + [
    turned('knob-%d' % i, 'knob', 'z', [[0, 0], [0, 0.011], [0.016, 0.009], [0.016, 0]], [-0.18 + 0.065 * i, 0.1975, 0.118])
    for i in std.range(0, 5)
  ] + [
    box('foot-%d-%d' % [i, j], 'foot', [[-0.26, 0.22][i], 0, [-0.1, 0.07][j]], [[-0.22, 0.26][i], 0.01, [-0.07, 0.1][j]])
    for i in [0, 1]
    for j in [0, 1]
  ] + [
    box('corner-%d-%d-%d' % [i, j, k], 'pins', [[-0.284, 0.25][i], [0.008, 0.222][j], [-0.124, 0.088][k]], [[-0.25, 0.284][i], [0.038, 0.254][j], [-0.092, 0.124][k]])
    for i in [0, 1]
    for j in [0, 1]
    for k in [0, 1]
  ], {
    cabinet: 'polymer-black',
    grille: 'cloth-canvas',
    panel: 'alu-bare',
    lamp: 'plastic-clear-red',
    pins: 'steel-stainless',
    handle: 'leather-brown',
    knob: 'plastic-black',
    foot: 'rubber-black',
  }),

  // A cardboard archery target box, 600 mm wide, 450 mm tall and 190 mm deep, standing on its long edge:
  // packed tight with cloth, its seams taped, and a painted target of five coloured rings on the front.
  h.compound('archery_target_box', 10, [
    box('carton', 'board', [-0.3, 0, -0.095], [0.3, 0.45, 0.095]),
    box('tape-top', 'tape', [-0.3, 0.442, -0.04], [0.3, 0.452, 0.04]),
    box('tape-left', 'tape', [-0.302, 0, -0.04], [-0.298, 0.45, 0.04]),
    box('tape-right', 'tape', [0.298, 0, -0.04], [0.302, 0.45, 0.04]),
    box('stuffing', 'cloth', [-0.1, 0.45, -0.07], [-0.04, 0.462, -0.045]),
    box('stuffing-b', 'cloth', [0.12, 0.45, 0.045], [0.16, 0.458, 0.07]),
  ] + [
    local r = [0.2, 0.16, 0.12, 0.08, 0.04, 0][i], r0 = [0.2, 0.16, 0.12, 0.08, 0.04, 0][i + 1];
    if r0 == 0 then turned('ring-%d' % i, 'ring-%d' % i, 'z', [[0, 0], [0, r], [0.002, r], [0.002, 0]], [0, 0.225, 0.095])
    else turned('ring-%d' % i, 'ring-%d' % i, 'z', [[0, r0], [0, r], [0.002, r], [0.002, r0], [0, r0]], [0, 0.225, 0.095])
    for i in std.range(0, 4)
  ], {
    board: 'paperboard-tan',
    tape: 'tape-tan',
    cloth: 'cloth-rag',
    'ring-0': 'paint-white',
    'ring-1': 'plastic-black',
    'ring-2': 'paint-drum-blue',
    'ring-3': 'paint-red',
    'ring-4': 'plastic-yellow',
  }),

  // A body pillow rolled up for carrying, 620 mm long and 320 mm across, lying along x: the printed cover
  // rolled round itself so its ends show the spiral, held by two navy webbing straps with steel buckles.
  h.compound('bodypillow', 1.7, [
    turned('roll', 'cover', 'x', [[0, 0], [0, 0.152], [0.01, 0.16], [0.6, 0.16], [0.61, 0.152], [0.61, 0]], [-0.305, 0.16, 0]),
  ] + [
    turned('spiral-%d-%d' % [e, k], 'print', 'x', [[0, 0.03 + 0.04 * k], [0, 0.044 + 0.04 * k], [0.003, 0.044 + 0.04 * k], [0.003, 0.03 + 0.04 * k], [0, 0.03 + 0.04 * k]], [[-0.307, 0.304][e], 0.16, 0])
    for e in [0, 1]
    for k in std.range(0, 2)
  ] + [
    turned('print-band', 'print', 'x', [[0, 0.16], [0, 0.161], [0.16, 0.161], [0.16, 0.16], [0, 0.16]], [-0.06, 0.16, 0]),
  ] + std.flattenArrays([
    [
      turned('strap-%d' % i, 'strap', 'x', [[0, 0.16], [0, 0.164], [0.03, 0.164], [0.03, 0.16], [0, 0.16]], [[-0.2, 0.17][i], 0.16, 0]),
      box('buckle-%d' % i, 'buckle', [[-0.2, 0.17][i] - 0.004, 0.318, -0.02], [[-0.2, 0.17][i] + 0.034, 0.328, 0.02]),
    ]
    for i in [0, 1]
  ]), { cover: 'cloth-cotton', print: 'plastic-pink', strap: 'cloth-navy', buckle: 'steel-stainless' }),
]
+ (
  // A withered bouquet in a paper wrap, 470 mm long, lying flat: a fan of dry stems tied with twine at the
  // narrow end, the brown paper wrap flattened under them, and drooping dried flower heads at the wide end
  // in faded red, cream and dusty pink, with a few curled leaves.
  local heads = [
    [0.15, 0.0, 0.03, 0.03, 'bloom-red'], [0.19, -0.045, 0.026, 0.024, 'bloom-cream'], [0.2, 0.05, 0.022, 0.026, 'bloom-pink'],
    [0.13, 0.06, 0.03, 0.022, 'bloom-red'], [0.13, -0.06, 0.026, 0.024, 'bloom-pink'], [0.22, 0.005, 0.03, 0.02, 'bloom-cream'],
    [0.09, -0.02, 0.05, 0.022, 'bloom-cream'], [0.095, 0.03, 0.055, 0.02, 'bloom-red'],
  ];
  [
    h.compound('bouquet', 0.19, [
      plate('wrap', 'wrap', [[-0.1, 0.022], [-0.1, -0.022], [0.16, -0.1], [0.16, 0.1]], 0, 0.016),
      plate('wrap-back', 'wrap', [[-0.04, 0.03], [-0.04, -0.03], [0.12, -0.09], [0.12, 0.09]], 0.016, 0.03),
      box('twine', 'twine', [-0.115, 0.004, -0.024], [-0.1, 0.034, 0.024]),
    ] + [
      h.prism('stem-%d' % k, 'stem', 'x', [[0.014 + 0.004 * (k % 2), -0.016 + 0.008 * k - 0.003], [0.014 + 0.004 * (k % 2), -0.016 + 0.008 * k + 0.003], [0.02 + 0.004 * (k % 2), -0.016 + 0.008 * k + 0.003], [0.02 + 0.004 * (k % 2), -0.016 + 0.008 * k - 0.003]], -0.245 + 0.012 * (k % 3), 0.1)
      for k in std.range(0, 4)
    ] + [
      local x = hd[0], z = hd[1], y = hd[2], r = hd[3];
      turned('head-%d' % i, hd[4], 'y', [[0, 0], [0, r * 0.6], [r * 0.4, r], [r * 1.1, r * 0.95], [r * 1.4, r * 0.5], [r * 1.5, 0]], [x, y - 0.02, z])
      for i in std.range(0, std.length(heads) - 1)
      for hd in [heads[i]]
    ] + [
      plate('leaf-%d' % i, 'stem', [[0.02 + 0.03 * i, [0.03, -0.03, 0.05][i]], [0.06 + 0.03 * i, [0.06, -0.075, 0.08][i]], [0.08 + 0.03 * i, [0.055, -0.07, 0.075][i]]], 0.03, 0.034)
      for i in [0, 1, 2]
    ], {
      wrap: 'paper-butcher',
      twine: 'cord-olive',
      stem: 'plant-dried',
      'bloom-red': 'paint-oxblood',
      'bloom-cream': 'wax-cream',
      'bloom-pink': 'cloth-shirt-faded',
    })
    + { voxelGrain: 0.004 },
  ]
)

+ (
  // Four gas bladders cut from a large mutant animal, each 46 to 54 mm across, joined by a knot of dark
  // tissue and torn vessels, a dark vein round each, lying in a heap 110 mm long.
  local bladders = [[-0.03, 0.025, -0.012, 0.025], [0.022, 0.024, -0.02, 0.024], [0.0, 0.023, 0.03, 0.023], [-0.004, 0.058, 0.0, 0.027]];
  local ball(id, slot, x, y, z, r) = turned(id, slot, 'y', [[0, 0], [0, r * 0.6], [r * 0.3, r * 0.92], [r, r], [r * 1.7, r * 0.92], [r * 2, r * 0.5], [r * 2, 0]], [x, y - r, z]);
  [
    h.compound('ballast', 0.28, [
      ball('bladder-%d' % i, 'bladder', b[0], b[1], b[2], b[3])
      for i in std.range(0, std.length(bladders) - 1)
      for b in [bladders[i]]
    ] + [
      ball('knot', 'tissue', -0.002, 0.03, 0.0, 0.016),
    ] + [
      turned('vein-%d' % i, 'tissue', 'y', [[0, b[3]], [0, b[3] + 0.0015], [0.003, b[3] + 0.0015], [0.003, b[3]], [0, b[3]]], [b[0], b[1] - 0.0015, b[2]])
      for i in std.range(0, std.length(bladders) - 1)
      for b in [bladders[i]]
    ] + [
      h.rod('vessel-a', 'vessel', 0.004, -0.07, -0.02, 0.012),
      turned('vessel-b', 'vessel', 'z', [[0, 0], [0, 0.0035], [0.04, 0.003], [0.04, 0]], [0.004, 0.008, -0.06]),
    ], { bladder: 'jelly-pale', tissue: 'body-gore', vessel: 'body-gore' })
    + { voxelGrain: 0.002 },
  ]
)
+ [
  // A large unopened flower bud from a mutant plant, lying along x: a pointed deep pink-purple bud 110 mm
  // long and 56 mm across, cupped in five green sepals at its swollen base, on a short cut stem.
  h.compound('biollante_bud', 0.12, [
    turned('bud', 'petal', 'x', [[0, 0], [0, 0.022], [0.02, 0.028], [0.05, 0.026], [0.08, 0.016], [0.1, 0.006], [0.11, 0]], [-0.04, 0.028, 0]),
    turned('base', 'sepal', 'x', [[0, 0], [0, 0.008], [0.012, 0.02], [0.02, 0.024], [0.02, 0]], [-0.06, 0.028, 0]),
    h.rod('stem', 'stem', 0.005, -0.1, -0.06, 0.028),
  ] + [
    local a = 2 * std.pi * k / 5, c = std.cos(a), s = std.sin(a);
    h.prism('sepal-%d' % k, 'sepal', 'x', [
      [0.028 + 0.025 * c - 0.007 * s, 0.025 * s + 0.007 * c],
      [0.028 + 0.025 * c + 0.007 * s, 0.025 * s - 0.007 * c],
      [0.028 + 0.03 * c + 0.007 * s, 0.03 * s - 0.007 * c],
      [0.028 + 0.03 * c - 0.007 * s, 0.03 * s + 0.007 * c],
    ], -0.044, -0.004)
    for k in std.range(0, 4)
  ], { petal: 'plastic-pink', sepal: 'paint-green', stem: 'plant-dried' })
  + { voxelGrain: 0.002 },
]
