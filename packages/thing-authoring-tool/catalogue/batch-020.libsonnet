local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
local rod = h.rod;
// A flat ring standing on y, radii `r0` to `r1`, from `y0` to `y1`, centred at (x, z).
local ring(id, slot, r0, r1, y0, y1, x=0, z=0) = turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);
// A ring facing z, radii `r0` to `r1`, from `z0` to `z1`, centred at (x, y).
local hoop(id, slot, r0, r1, z0, z1, x, y) = turned(id, slot, 'z', [[0, r0], [0, r1], [z1 - z0, r1], [z1 - z0, r0], [0, r0]], [x, y, z0]);
[
  // A plastic pet tag, 38 mm by 22 mm and 2 mm thick, shaped like a bone, on a small split ring.
  h.compound('pet_tag', 0.0024, [
    box('bar', 'tag', [-0.013, 0, -0.006], [0.013, 0.002, 0.006]),
    disc('lobe-a', 'tag', 0.0055, 0, 0.002, -0.0135, -0.0055),
    disc('lobe-b', 'tag', 0.0055, 0, 0.002, -0.0135, 0.0055),
    disc('lobe-c', 'tag', 0.0055, 0, 0.002, 0.0135, -0.0055),
    disc('lobe-d', 'tag', 0.0055, 0, 0.002, 0.0135, 0.0055),
    box('name', 'print', [-0.009, 0.002, -0.003], [0.009, 0.0025, 0.003]),
    ring('ring', 'ring', 0.006, 0.008, 0, 0.002, -0.026, 0),
  ], { tag: 'plastic-red', print: 'paint-white', ring: 'metal-silver' })
  + { voxelGrain: 0.002 },

  // A down pillow rolled up for carrying, 400 mm long and 180 mm across, held by two webbing straps; its
  // ends show the rolled layers.
  h.compound('down_pillow', 0.66, [
    rod('roll', 'cover', 0.09, -0.2, 0.2, 0.09),
  ] + std.flattenArrays([
    [
      h.tube('layer-a-%d' % s, 'cover', 0.03, 0.05, x, x + 0.004, 0.09),
      h.tube('layer-b-%d' % s, 'shadow', 0.05, 0.07, x, x + 0.004, 0.09),
      disc('core-%d' % s, 'shadow', 0.03, 0, 0.004) + { axis: 'x', origin: [x, 0.09, 0] },
    ]
    for s in [0, 1]
    for x in [[-0.204, 0.2][s]]
  ]) + [
    h.tube('strap-%d' % i, 'strap', 0.09, 0.094, x - 0.012, x + 0.012, 0.09)
    for i in [0, 1]
    for x in [[-0.11, 0.11][i]]
  ] + [
    box('buckle', 'buckle', [0.1, 0.176, -0.016], [0.122, 0.186, 0.016]),
  ], { cover: 'cloth-white', shadow: 'cloth-cotton', strap: 'cloth-navy', buckle: 'plastic-black' })
  + { voxelGrain: 0.004 },

  // A small loose heap of parts pulled from circuit boards, about 45 mm by 35 mm: banded resistors, a can
  // capacitor, blue disc capacitors and black diodes, their wire legs clipped short.
  local resistor(id, x, z, along) =
    if along then [
      rod(id, 'resistor', 0.0025, x - 0.005, x + 0.005, 0.0025) + { origin: [x - 0.005, 0.0025, z] },
      rod(id + '-band', 'band', 0.0027, x - 0.001, x + 0.001, 0.0025) + { origin: [x - 0.001, 0.0025, z] },
      box(id + '-leg-a', 'leg', [x - 0.009, 0.002, z - 0.0005], [x - 0.005, 0.003, z + 0.0005]),
      box(id + '-leg-b', 'leg', [x + 0.005, 0.002, z - 0.0005], [x + 0.009, 0.003, z + 0.0005]),
    ] else [
      turned(id, 'resistor', 'z', [[0, 0], [0, 0.0025], [0.01, 0.0025], [0.01, 0]], [x, 0.0025, z - 0.005]),
      turned(id + '-band', 'band', 'z', [[0, 0], [0, 0.0027], [0.002, 0.0027], [0.002, 0]], [x, 0.0025, z - 0.001]),
      box(id + '-leg-a', 'leg', [x - 0.0005, 0.002, z - 0.009], [x + 0.0005, 0.003, z - 0.005]),
      box(id + '-leg-b', 'leg', [x - 0.0005, 0.002, z + 0.005], [x + 0.0005, 0.003, z + 0.009]),
    ];
  h.compound('e_scrap', 0.0029, resistor('r1', -0.008, -0.01, true) + resistor('r2', 0.012, 0.004, false) + resistor('r3', -0.01, 0.01, true) + [
    disc('can', 'can', 0.004, 0, 0.012, 0.004, -0.008),
    disc('can-top', 'cantop', 0.0035, 0.012, 0.0125, 0.004, -0.008),
    box('can-stripe', 'cantop', [0.0075, 0.001, -0.0095], [0.0085, 0.011, -0.0065]),
    turned('disc-a', 'ceramic', 'z', [[0, 0], [0, 0.004], [0.002, 0.004], [0.002, 0]], [-0.014, 0.004, -0.001]),
    turned('disc-b', 'ceramic', 'z', [[0, 0], [0, 0.0035], [0.002, 0.0035], [0.002, 0]], [0.016, 0.0035, -0.012]),
    rod('diode-a', 'diode', 0.0015, 0.0, 0.006, 0.0015) + { origin: [0.0, 0.0015, 0.013] },
    rod('diode-a-band', 'leg', 0.0016, 0.0, 0.001, 0.0015) + { origin: [0.005, 0.0015, 0.013] },
    box('diode-a-legs', 'leg', [-0.005, 0.001, 0.0125], [0.011, 0.002, 0.0135]),
    rod('diode-b', 'diode', 0.0015, 0.0, 0.006, 0.0045) + { origin: [-0.004, 0.0045, -0.001] },
    rod('diode-b-band', 'leg', 0.0016, 0.0, 0.001, 0.0045) + { origin: [-0.004, 0.0045, -0.001] },
  ], { resistor: 'paperboard-tan', band: 'paint-oxblood', leg: 'steel-stainless', can: 'plastic-blue', cantop: 'alu-bare', ceramic: 'paint-crane-yellow', diode: 'plastic-black' })
  + { voxelGrain: 0.002 },

  // A kettle heating element: a sheathed steel tube 8 mm thick bent into a flat loop 90 mm across, its two
  // legs running back 60 mm to a round mounting flange 50 mm across with a hex nut and two terminal pins.
  h.compound('heating_element', 0.22, [
    ring('loop', 'sheath', 0.037, 0.045, 0.021, 0.029, 0.11, 0),
    rod('leg-a', 'sheath', 0.004, 0.006, 0.072, 0.025) + { origin: [0.006, 0.025, -0.012] },
    rod('leg-b', 'sheath', 0.004, 0.006, 0.072, 0.025) + { origin: [0.006, 0.025, 0.012] },
    rod('flange', 'flange', 0.025, 0, 0.004, 0.025) + { origin: [0.002, 0.025, 0] },
    h.prism('nut', 'flange', 'x', [[0.025 + 0.016 * std.cos(k * std.pi / 3), 0.016 * std.sin(k * std.pi / 3)] for k in std.range(0, 5)], -0.008, 0.002),
    rod('pin-a', 'pin', 0.002, -0.026, -0.012, 0.025) + { origin: [-0.026, 0.025, -0.006] },
    rod('pin-b', 'pin', 0.002, -0.026, -0.012, 0.025) + { origin: [-0.026, 0.025, 0.006] },
    rod('insulator', 'insulator', 0.009, -0.016, -0.008, 0.025) + { origin: [-0.016, 0.025, 0] },
  ], { sheath: 'steel-stainless', flange: 'steel', pin: 'brass', insulator: 'ceramic-white' })
  + { voxelGrain: 0.002 },

  // An evaporator coil from a cooling unit, 500 mm long, 300 mm tall and 60 mm deep: two banks of copper tube
  // running back and forth through a stack of thin aluminium fins, bent round in U turns past galvanised end
  // plates.
  local rows = 8, pitch = 0.034, y0 = 0.03, zs = [-0.014, 0.014];
  // A half ring along z joining two tubes at its open side, built from convex quarters since a prism must be convex.
  local bend(id, x, y, r, side) = [
    local a0 = k * std.pi / 6, a1 = (k + 1) * std.pi / 6;
    h.prism('%s-%d-%d' % [id, k, zi], 'tube', 'z', [
      [x + side * (r - 0.005) * std.sin(a0), y + (r - 0.005) * std.cos(a0)],
      [x + side * (r + 0.005) * std.sin(a0), y + (r + 0.005) * std.cos(a0)],
      [x + side * (r + 0.005) * std.sin(a1), y + (r + 0.005) * std.cos(a1)],
      [x + side * (r - 0.005) * std.sin(a1), y + (r - 0.005) * std.cos(a1)],
    ], zs[zi] - 0.005, zs[zi] + 0.005)
    for k in std.range(0, 5)
    for zi in [0, 1]
  ];
  h.compound('evaporator_coil', 3, [
    rod('tube-%d-%d' % [i, j], 'tube', 0.005, -0.25, 0.25, y0 + i * pitch) + { origin: [-0.25, y0 + i * pitch, zs[j]] }
    for i in std.range(0, rows - 1)
    for j in [0, 1]
  ] + std.flattenArrays([
    bend('bend-%d' % i, if i % 2 == 0 then 0.25 else -0.25, y0 + (i + 0.5) * pitch, pitch / 2, if i % 2 == 0 then 1 else -1)
    for i in std.range(0, rows - 2)
  ]) + [
    box('plate-%d' % s, 'plate', [x - 0.002, 0, -0.03], [x + 0.002, 0.3, 0.03])
    for s in [0, 1]
    for x in [[-0.236, 0.236][s]]
  ] + [
    box('fin-%d' % i, 'fin', [-0.22 + i * 0.02, 0.006, -0.026], [-0.218 + i * 0.02, 0.294, 0.026])
    for i in std.range(0, 22)
  ] + [
    rod('stub-in', 'tube', 0.006, -0.29, -0.25, y0) + { origin: [-0.29, y0, zs[0]] },
    rod('stub-out', 'tube', 0.008, -0.29, -0.25, y0 + (rows - 1) * pitch) + { origin: [-0.29, y0 + (rows - 1) * pitch, zs[1]] },
  ], { tube: 'copper', fin: 'alu-bare', plate: 'steel-galvanised' })
  + { voxelGrain: 0.004 },

  // A desk fan 420 mm tall: a round weighted base 220 mm across, a short stem, a motor housing at the back and
  // three blades inside a wire guard 300 mm across, facing +z.
  local hubY = 0.27, gr = 0.15;
  local guards = [
    { id: 'front', dir: 1, r: [gr, 0.12, 0.085, 0.045, 0.012], z: [0.006, 0.016, 0.026, 0.032, 0.034] },
    { id: 'back', dir: -1, r: [gr, 0.11, 0.07, 0.03], z: [-0.006, -0.016, -0.024, -0.028] },
  ];
  h.compound('desk_fan', 1.3, [
    disc('base', 'body', 0.11, 0, 0.03, 0, 0.0),
    disc('base-top', 'body', 0.09, 0.03, 0.04, 0, 0.0),
    box('switch', 'switch', [-0.05, 0.03, 0.07], [0.05, 0.045, 0.09]),
    disc('stem', 'body', 0.016, 0.04, hubY - 0.05, 0, -0.02),
    box('yoke', 'body', [-0.02, hubY - 0.06, -0.04], [0.02, hubY - 0.02, 0.0]),
    turned('motor', 'body', 'z', [[0, 0], [0, 0.04], [0.02, 0.06], [0.09, 0.06], [0.11, 0.05], [0.11, 0]], [0, hubY, -0.14]),
    turned('spinner', 'hub', 'z', [[0, 0], [0, 0.028], [0.016, 0.024], [0.024, 0]], [0, hubY, 0.0]),
  ] + [
    local a = k * 2 * std.pi / 3, c = std.cos(a), s = std.sin(a), p = [-s, c];
    h.prism('blade-%d' % k, 'blade', 'z', [
      [c * 0.025 + p[0] * 0.012, hubY + s * 0.025 + p[1] * 0.012],
      [c * 0.025 - p[0] * 0.012, hubY + s * 0.025 - p[1] * 0.012],
      [c * 0.11 - p[0] * 0.04, hubY + s * 0.11 - p[1] * 0.04],
      [c * 0.135, hubY + s * 0.135],
      [c * 0.12 + p[0] * 0.035, hubY + s * 0.12 + p[1] * 0.035],
    ], -0.004 + k * 0.002, 0.0 + k * 0.002)
    for k in [0, 1, 2]
  ] + [
    hoop('rim', 'guard', gr - 0.004, gr, -0.008, 0.008, 0, hubY),
  ] + std.flattenArrays([
    // Each guard is a stepped dome: rings that draw in towards the middle, joined by spokes.
    local g = guards[side], n = std.length(g.r);
    [
      hoop('%s-ring-%d' % [g.id, i], 'guard', g.r[i] - 0.002, g.r[i], std.min(g.z[i], g.z[i] + g.dir * 0.004), std.max(g.z[i], g.z[i] + g.dir * 0.004), 0, hubY)
      for i in std.range(1, n - 2)
    ] + [
      local a = k * std.pi / 6 + side * std.pi / 12, c = std.cos(a), s = std.sin(a), w = 0.0012, r0 = g.r[i + 1], r1 = g.r[i];
      h.prism('%s-spoke-%d-%d' % [g.id, i, k], 'guard', 'z', [
        [c * r0 - s * w, hubY + s * r0 + c * w],
        [c * r0 + s * w, hubY + s * r0 - c * w],
        [c * r1 + s * w, hubY + s * r1 - c * w],
        [c * r1 - s * w, hubY + s * r1 + c * w],
      ], std.min(g.z[i], g.z[i + 1] + g.dir * 0.004), std.max(g.z[i], g.z[i + 1] + g.dir * 0.004))
      for i in std.range(0, n - 2)
      for k in std.range(0, 11)
    ]
    for side in [0, 1]
  ]) + [
    disc('badge', 'hub', 0.02, 0, 0.004) + { axis: 'z', origin: [0, hubY, 0.034] },
  ], { body: 'plastic-white', switch: 'plastic-grey', hub: 'plastic-blue', blade: 'plastic-clear-blue', guard: 'steel-stainless' })
  + { voxelGrain: 0.004 },

  // A portable hard drive, 118 mm by 80 mm and 18 mm thick, its long sides rounded, with a hand-written label on
  // top, a status light and a short cable coiled beside it.
  h.compound('evacuation_records_drive', 0.21, [
    box('core', 'shell', [-0.059, 0, -0.031], [0.059, 0.018, 0.031]),
    rod('side-a', 'shell', 0.009, -0.059, 0.059, 0.009) + { origin: [-0.059, 0.009, -0.031] },
    rod('side-b', 'shell', 0.009, -0.059, 0.059, 0.009) + { origin: [-0.059, 0.009, 0.031] },
    box('label', 'label', [-0.045, 0.018, -0.028], [0.03, 0.0185, 0.028]),
  ] + [
    box('line-%d' % i, 'ink', [-0.04, 0.0185, -0.02 + i * 0.012], [0.02 - (i % 2) * 0.015, 0.019, -0.018 + i * 0.012])
    for i in [0, 1, 2, 3]
  ] + [
    box('port', 'port', [0.059, 0.005, -0.006], [0.061, 0.011, 0.006]),
    box('light', 'light', [0.045, 0.018, 0.018], [0.05, 0.019, 0.024]),
    ring('coil', 'cable', 0.018, 0.022, 0, 0.004, 0.085, 0.01),
    box('lead', 'cable', [0.061, 0.0, -0.002], [0.07, 0.004, 0.002]),
  ], { shell: 'plastic-charcoal', label: 'paper-white', ink: 'paint-police-blue', port: 'alu-bare', light: 'lcd-green', cable: 'plastic-black' })
  + { voxelGrain: 0.002 },

  // An insulating fire brick, 230 mm by 114 mm by 64 mm, lying on its broad face, pale buff with a scorched patch
  // and a chipped corner.
  h.compound('fire_brick', 1.2, [
    box('brick', 'brick', [-0.115, 0, -0.057], [0.09, 0.064, 0.057]),
    h.prism('corner', 'brick', 'y', [[-0.057, 0.09], [0.057, 0.09], [0.057, 0.098], [0.033, 0.115], [-0.057, 0.115]], 0, 0.064),
    h.prism('chip-foot', 'brick', 'y', [[0.033, 0.115], [0.057, 0.098], [0.057, 0.115]], 0, 0.022),
    box('scorch-a', 'scorch', [-0.08, 0.064, -0.03], [-0.02, 0.065, 0.02]),
    box('scorch-b', 'scorch', [-0.03, 0.064, -0.045], [0.03, 0.065, -0.01]),
  ], { brick: 'paperboard-tan', scorch: 'cloth-charred' })
  + { voxelGrain: 0.004 },

  // A round glass fishbowl 260 mm across and 222 mm tall with a flared lip, filled with water over a bed of
  // gravel, a goldfish swimming in it.
  h.compound('fish_bowl', 8.5, [
    turned('bowl', 'glass', 'y', [
      [0, 0], [0, 0.07], [0.02, 0.1], [0.06, 0.125], [0.11, 0.13], [0.16, 0.118], [0.19, 0.095], [0.21, 0.075], [0.22, 0.08],
      [0.222, 0.08], [0.222, 0.074], [0.21, 0.07], [0.19, 0.089], [0.16, 0.112], [0.11, 0.124], [0.06, 0.119], [0.024, 0.095],
      [0.006, 0.066], [0.006, 0],
    ]),
    turned('water', 'water', 'y', [[0, 0], [0, 0.064], [0.018, 0.093], [0.054, 0.117], [0.104, 0.122], [0.154, 0.11], [0.164, 0.104], [0.164, 0]], [0, 0.006, 0]),
    turned('gravel', 'gravel', 'y', [[0, 0], [0, 0.064], [0.016, 0.088], [0.02, 0]], [0, 0.006, 0]),
    turned('fish', 'fish', 'x', [[0, 0], [0, 0.006], [0.01, 0.012], [0.03, 0.01], [0.04, 0.004], [0.04, 0]], [-0.02, 0.1, 0.03]),
    h.prism('tail', 'fish', 'z', [[0.02, 0.1], [0.036, 0.088], [0.036, 0.112]], 0.028, 0.032),
    h.prism('fin', 'fish', 'z', [[-0.008, 0.11], [0.006, 0.11], [-0.004, 0.118]], 0.028, 0.032),
    box('eye', 'eye', [-0.016, 0.102, 0.039], [-0.012, 0.106, 0.041]),
  ], { glass: 'glass-clear', water: 'plastic-clear-blue', gravel: 'stone-grey', fish: 'plastic-orange', eye: 'plastic-black' })
  + { voxelGrain: 0.004 },

  // A loose cut gemstone, a round brilliant 10 mm across and 7 mm deep, lying on its table with its point up.
  h.compound('garnet', 0.0009, [
    turned('stone', 'stone', 'y', [[0, 0], [0, 0.003], [0.0016, 0.005], [0.0024, 0.005], [0.007, 0]], [0.001, 0, 0.001]),
  ], { stone: 'gem-red' })
  + { voxelGrain: 0.002 },

  // A pair of dark teardrop lenses from a pair of sunglasses, each 56 mm wide and 47 mm tall and 2 mm thick,
  // lying side by side.
  local lens(side) = [[p[1], side * 0.032 + side * p[0]] for p in [
    [-0.027, -0.012], [-0.022, -0.02], [-0.008, -0.024], [0.016, -0.023], [0.027, -0.016], [0.028, 0.0], [0.02, 0.014],
    [0.006, 0.022], [-0.012, 0.023], [-0.024, 0.014], [-0.028, 0.002],
  ]];
  h.compound('tinted_lenses', 0.021, [
    h.prism('lens-a', 'lens', 'y', lens(-1), 0, 0.002),
    h.prism('lens-b', 'lens', 'y', lens(1), 0, 0.002),
  ], { lens: 'glass-grey' })
  + { voxelGrain: 0.002 },

  // A sheaf of letter-size ledger forms, 216 mm by 279 mm and 6 mm thick, a little out of square, held at the top
  // edge by a black binder clip, columns of figures on the top sheet.
  h.compound('accounting_records', 0.3, [
    box('sheets-%d' % i, if i == 2 then 'top' else 'paper', [-0.108 + i * 0.003 - 0.003, i * 0.002, -0.1395 + (i % 2) * 0.004], [0.108 + i * 0.003 - 0.003, (i + 1) * 0.002, 0.1395 + (i % 2) * 0.004])
    for i in [0, 1, 2]
  ] + [
    box('row-%d' % i, 'ink', [-0.09, 0.006, -0.1 + i * 0.012], [-0.09 + [0.18, 0.12, 0.16, 0.1, 0.17, 0.14][i % 6], 0.0065, -0.098 + i * 0.012])
    for i in std.range(0, 15)
  ] + [
    box('heading', 'heading', [-0.09, 0.006, -0.125], [0.02, 0.0065, -0.115]),
    box('clip', 'clip', [-0.025, -0.002, -0.143], [0.025, 0.008, -0.126]),
    box('clip-wire-a', 'wire', [-0.018, 0.008, -0.16], [-0.016, 0.01, -0.13]),
    box('clip-wire-b', 'wire', [0.016, 0.008, -0.16], [0.018, 0.01, -0.13]),
    box('clip-wire-c', 'wire', [-0.018, 0.008, -0.162], [0.018, 0.01, -0.16]),
  ], { paper: 'paper-white', top: 'paint-cream', ink: 'plastic-grey', heading: 'paint-oxblood', clip: 'plastic-black', wire: 'steel-stainless' })
  + { voxelGrain: 0.002 },

  // A glassy egg from a mutant spider-thing, a ball 46 mm across with a short drawn-out tip, shards of hard
  // glowing matter crowded at its centre.
  h.compound('glowing_egg', 0.06, [
    turned('shell', 'shell', 'y', [[0, 0], [0, 0.012], [0.006, 0.019], [0.016, 0.023], [0.028, 0.021], [0.036, 0.016], [0.042, 0.011], [0.047, 0.007], [0.052, 0.0045], [0.057, 0.0025], [0.059, 0]], [0.001, 0, 0.001]),
    disc('core', 'core', 0.012, 0.01, 0.03, 0.001, 0.001),
  ] + [
    // Shards long enough to break the shell, so the glow shows through it even where the glass reads opaque.
    local a = k * std.pi / 3, c = std.cos(a), s = std.sin(a), w = 0.003, l = 0.0245;
    h.prism('shard-%d' % k, 'shard', 'y', [[0.001 - c * w, 0.001 + s * w], [0.001 + c * w, 0.001 - s * w], [0.001 + s * l, 0.001 + c * l]], 0.012 + (k % 3) * 0.004, 0.02 + (k % 3) * 0.004)
    for k in std.range(0, 5)
  ], { shell: 'gem-clear', core: 'crystal-glow-violet', shard: 'crystal-glow-violet' })
  + { voxelGrain: 0.002 },

  // A strut of inner skeleton from a giant mutant insect, 280 mm long: a ridged, slightly tapering shaft of four
  // jointed segments, a knob at the root end and a two-pronged fork where muscles anchored.
  local segs = [0.0, 0.07, 0.135, 0.195];
  h.compound('endochitin', 0.043, [
    turned('seg-%d' % i, 'chitin', 'x', [[0, 0], [0, 0.011 - i * 0.0015], [0.01, 0.0095 - i * 0.0015], [0.055, 0.009 - i * 0.0015], [0.065, 0.0105 - i * 0.0015], [0.065, 0]], [-0.14 + segs[i], 0.013, (i % 2) * 0.004 - 0.002])
    for i in [0, 1, 2, 3]
  ] + [
    turned('joint-%d' % i, 'joint', 'x', [[0, 0], [0, 0.008 - i * 0.0015], [0.006, 0.008 - i * 0.0015], [0.006, 0]], [-0.14 + segs[i] + 0.064, 0.013, 0])
    for i in [0, 1, 2]
  ] + [
    turned('knob', 'chitin', 'x', [[0, 0], [0, 0.009], [0.008, 0.013], [0.018, 0.009], [0.018, 0]], [-0.158, 0.013, -0.002]),
    h.prism('prong-a', 'chitin', 'y', [[0.003, 0.11], [-0.003, 0.11], [-0.018, 0.145], [-0.012, 0.145]], 0.009, 0.017),
    h.prism('prong-b', 'chitin', 'y', [[-0.003, 0.11], [0.003, 0.11], [0.018, 0.145], [0.012, 0.145]], 0.009, 0.017),
  ] + [
    box('ridge-%d' % i, 'joint', [-0.135 + segs[i], 0.019 - i * 0.0015, -0.0015], [-0.09 + segs[i], 0.022 - i * 0.0015, 0.0015])
    for i in [0, 1, 2, 3]
  ], { chitin: 'leather-brown', joint: 'resin-honey' })
  + { voxelGrain: 0.002 },
]
