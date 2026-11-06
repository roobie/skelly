local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// An open pot shell standing on y: radius `r` at the rim, `ht` tall, walls `t` thick, its floor `t` thick and its
// rim rolled out by `roll`. The profile ends on the axis, so the floor is solid.
local potShell(id, slot, r, ht, t, roll=0.003, base=0.008) = turned(id, slot, 'y', [
  [0, 0], [0, r - base], [base * 0.6, r - base * 0.15], [base, r], [ht - roll, r], [ht, r + roll], [ht, r - t],
  [t + base * 0.5, r - t], [t, r - t - base], [t, 0],
]);
// A loop handle riveted to the side of a pot at +x or -x (`side`), its grip `reach` out from the wall at height `y`.
local loopHandle(prefix, slot, side, r, y, reach, w=0.04, t=0.006) = [
  box(prefix + '-top', slot, [if side > 0 then r - 0.004 else -r - reach, y, -w / 2], [if side > 0 then r + reach else -r + 0.004, y + t, w / 2]),
  box(prefix + '-grip', slot, [if side > 0 then r + reach - t else -r - reach, y - 0.02, -w / 2], [if side > 0 then r + reach else -r - reach + t, y + t, w / 2]),
];
// A lid sitting on a rim of radius `r` at height `y`: a low dome with a knob on top.
local lid(prefix, slot, knobSlot, r, y, rise=0.02, knob=0.014) = [
  h.dome(prefix, slot, r + 0.004, rise, 0.004, 'y', [0, y, 0]),
  disc(prefix + '-stem', knobSlot, knob * 0.5, y + rise - 0.002, y + rise + 0.012),
  disc(prefix + '-knob', knobSlot, knob, y + rise + 0.01, y + rise + 0.022),
];
// A pot hammered out of one sheet: a lopsided shell with a crimped rim, hammer marks and a wire bail.
local makeshiftPot(id, massKg, metal, mark, t) = h.compound(id, massKg, [
  turned('shell', 'metal', 'y', [
    [0, 0], [0, 0.055], [0.012, 0.07], [0.03, 0.082], [0.06, 0.088], [0.075, 0.094], [0.075, 0.094 - t], [0.06, 0.088 - t],
    [0.03, 0.082 - t], [0.012 + t * 0.5, 0.07 - t], [t, 0.055 - t * 0.5], [t, 0],
  ]),
] + [
  // Crimps where the sheet was folded over at the rim, uneven in size.
  local a = i * std.pi / 4 + 0.2, w = [0.02, 0.03, 0.016, 0.026, 0.022, 0.03, 0.018, 0.024][i];
  h.prism('crimp-%d' % i, 'metal', 'y', [
    [std.sin(a) * 0.084 - std.cos(a) * w / 2, std.cos(a) * 0.084 + std.sin(a) * w / 2],
    [std.sin(a) * 0.084 + std.cos(a) * w / 2, std.cos(a) * 0.084 - std.sin(a) * w / 2],
    [std.sin(a) * 0.1 + std.cos(a) * w / 2, std.cos(a) * 0.1 - std.sin(a) * w / 2],
    [std.sin(a) * 0.1 - std.cos(a) * w / 2, std.cos(a) * 0.1 + std.sin(a) * w / 2],
  ], 0.068, 0.076)
  for i in std.range(0, 7)
] + [
  // Hammer marks on the outside, a shade darker.
  local a = [0.6, 1.9, 2.8, 4.0, 5.1, 3.4][i], y = [0.02, 0.045, 0.03, 0.05, 0.025, 0.06][i], rr = 0.068 + y * 0.28;
  box('mark-%d' % i, 'mark', [std.cos(a) * rr - 0.008, y - 0.006, std.sin(a) * rr - 0.008], [std.cos(a) * rr + 0.008, y + 0.006, std.sin(a) * rr + 0.008])
  for i in std.range(0, 5)
] + [
  h.rod('ear-a', 'metal', 0.006, 0.09, 0.104, 0.064),
  h.rod('ear-b', 'metal', 0.006, -0.104, -0.09, 0.064),
  box('bail-a', 'wire', [0.1, 0.064, -0.002], [0.104, 0.15, 0.002]),
  box('bail-b', 'wire', [-0.104, 0.064, -0.002], [-0.1, 0.15, 0.002]),
  box('bail-top', 'wire', [-0.104, 0.15, -0.002], [0.104, 0.154, 0.002]),
], { metal: metal, mark: mark, wire: 'steel-grey' }) + { voxelGrain: 0.004 };
[
  // A table knife 210 mm long lying flat: a 95 mm flat handle and a blunt, round-tipped blade 22 mm wide.
  h.compound('knife_butter', 0.093, [
    h.prism('handle', 'steel', 'y', [[-0.0075, 0], [0.0075, 0], [0.0085, 0.07], [0.006, 0.095], [-0.006, 0.095], [-0.0085, 0.07]], 0, 0.005),
    h.prism('bolster', 'steel', 'y', [[-0.006, 0.095], [0.006, 0.095], [0.0045, 0.105], [-0.0045, 0.105]], 0.001, 0.004),
    h.prism('blade', 'steel', 'y', [[-0.0045, 0.105], [0.0045, 0.105], [0.011, 0.125], [0.011, 0.196], [0.007, 0.206], [0, 0.21], [-0.007, 0.204], [-0.011, 0.19], [-0.011, 0.125]], 0.001, 0.003),
  ], { steel: 'steel-stainless' }) + {
    handling: h.gripOn('knife_butter', 'handle'),
    voxelGrain: 0.002,
  },

  // A cast-iron skillet 410 mm long: a pan 270 mm across the rim and 50 mm deep with two pour lips, a 140 mm handle
  // with a hanging hole and a helper lug opposite.
  h.compound('pan', 4.4, [
    turned('pan', 'iron', 'y', [[0, 0], [0, 0.118], [0.008, 0.128], [0.05, 0.135], [0.05, 0.128], [0.012, 0.118], [0.006, 0.112], [0.006, 0]]),
    h.prism('handle', 'iron', 'y', [[-0.015, 0.125], [0.015, 0.125], [0.012, 0.26], [0, 0.27], [-0.012, 0.26]], 0.034, 0.046),
    disc('hole', 'hole', 0.006, 0.0455, 0.047, 0.245, 0),
    h.prism('lug', 'iron', 'y', [[-0.03, -0.125], [-0.022, -0.16], [0.022, -0.16], [0.03, -0.125]], 0.04, 0.048),
  ], { iron: 'iron-cast', hole: 'coal-black' }) + {
    handling: h.gripOn('pan', 'handle'),
    voxelGrain: 0.004,
  },

  // A pizza wheel 230 mm long lying flat: a 130 mm moulded handle, a steel fork and a 100 mm cutting wheel.
  h.compound('pizza_cutter', 0.18, [
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.01], [0.01, 0.0125], [0.11, 0.0125], [0.125, 0.009], [0.13, 0.009], [0.13, 0]], [0, 0.0125, 0]),
    h.prism('fork', 'steel', 'y', [[-0.006, 0.128], [0.006, 0.128], [0.004, 0.18], [-0.004, 0.18]], 0.008, 0.012),
    disc('wheel', 'steel', 0.05, 0.004, 0.006, 0.18, 0),
    disc('hub', 'steel', 0.01, 0.002, 0.014, 0.18, 0),
  ], { handle: 'plastic-red', steel: 'steel-stainless' }) + {
    handling: h.gripOn('pizza_cutter', 'handle'),
    voxelGrain: 0.002,
  },

  // A child's bowl 120 mm across and 45 mm deep in bright plastic, with a non-slip ring under its foot.
  h.compound('plastic_bowl_kids', 0.065, [
    turned('bowl', 'bowl', 'y', [[0, 0], [0, 0.04], [0.012, 0.05], [0.03, 0.057], [0.045, 0.06], [0.045, 0.054], [0.03, 0.052], [0.014, 0.045], [0.006, 0.036], [0.006, 0]], [0, 0.002, 0]),
    turned('foot', 'foot', 'y', [[0, 0.03], [0, 0.04], [0.002, 0.04], [0.002, 0.03], [0, 0.03]]),
  ], { bowl: 'plastic-orange', foot: 'plastic-white' }) + { voxelGrain: 0.002 },

  // A plastic patio plate 260 mm across and 22 mm deep: a flat well and a wide sloping rim.
  h.compound('plastic_plate', 0.18, [
    turned('plate', 'plate', 'y', [[0, 0], [0, 0.09], [0.004, 0.095], [0.008, 0.1], [0.022, 0.13], [0.022, 0.124], [0.012, 0.1], [0.008, 0.095], [0.004, 0.09], [0.004, 0]]),
  ], { plate: 'plastic-blue' }) + { voxelGrain: 0.004 },

  // A bendy drinking straw 200 mm long and 6 mm across, its short end bent up after a ribbed elbow.
  h.compound('plastic_straw', 0.0005, [
    h.tube('long', 'straw', 0.0016, 0.003, -0.15, 0.02, 0.003),
  ] + [
    h.tube('rib-%d' % i, 'straw', 0.0016, 0.0036, 0.02 + i * 0.004, 0.022 + i * 0.004, 0.003)
    for i in std.range(0, 3)
  ] + [
    turned('short', 'straw', 'y', [[0, 0.0016], [0, 0.003], [0.04, 0.003], [0.04, 0.0016], [0, 0.0016]], [0.038, 0.003, 0]),
    h.rod('elbow', 'straw', 0.003, 0.034, 0.041, 0.003),
  ], { straw: 'plastic-red' }) + { voxelGrain: 0.002 },

  // A steel stock pot 190 mm across and 130 mm deep with two riveted loop handles and a domed lid.
  h.compound('pot', 1.6, [
    potShell('pot', 'steel', 0.095, 0.13, 0.004),
  ] + loopHandle('handle-a', 'steel', 1, 0.095, 0.1, 0.022) + loopHandle('handle-b', 'steel', -1, 0.095, 0.1, 0.022)
  + lid('lid', 'steel', 'knob', 0.095, 0.13), { steel: 'steel-stainless', knob: 'plastic-black' }) + { voxelGrain: 0.004 },

  // A 20 litre enamelled canner 360 mm across and 260 mm tall with a lid, two side handles and a wire jar rack whose
  // handles rest on the rim.
  h.compound('pot_canning', 4.9, [
    potShell('pot', 'enamel', 0.18, 0.26, 0.006, 0.004, 0.02),
  ] + loopHandle('handle-a', 'trim', 1, 0.18, 0.21, 0.04, 0.07, 0.01) + loopHandle('handle-b', 'trim', -1, 0.18, 0.21, 0.04, 0.07, 0.01)
  + lid('lid', 'enamel', 'trim', 0.18, 0.26, 0.04, 0.02) + [
    box('rack-a', 'rack', [0.12, 0.25, -0.05], [0.188, 0.258, -0.044]),
    box('rack-b', 'rack', [0.12, 0.25, 0.044], [0.188, 0.258, 0.05]),
    box('rack-c', 'rack', [-0.188, 0.25, -0.05], [-0.12, 0.258, -0.044]),
    box('rack-d', 'rack', [-0.188, 0.25, 0.044], [-0.12, 0.258, 0.05]),
  ], { enamel: 'paint-drum-blue', trim: 'plastic-black', rack: 'steel-galvanised' }) + { voxelGrain: 0.004 },

  // A tin-lined copper pot 180 mm across and 140 mm deep with two cast brass handles and a copper lid.
  h.compound('pot_copper', 2.4, [
    potShell('pot', 'copper', 0.09, 0.14, 0.004),
    turned('lining', 'tin', 'y', [[0.004, 0], [0.004, 0.084], [0.138, 0.084], [0.138, 0.08], [0.008, 0.08], [0.008, 0]]),
  ] + loopHandle('handle-a', 'brass', 1, 0.09, 0.11, 0.025, 0.035, 0.008) + loopHandle('handle-b', 'brass', -1, 0.09, 0.11, 0.025, 0.035, 0.008)
  + lid('lid', 'copper', 'brass', 0.09, 0.14, 0.018, 0.012), { copper: 'copper', tin: 'steel-grey', brass: 'brass' }) + { voxelGrain: 0.004 },

  // A pot hammered from a heavy steel sheet, 200 mm across the crimped rim and 75 mm deep, with a wire bail.
  makeshiftPot('pot_makeshift', 0.9, 'steel-grey', 'iron-dull', 0.008),

  // The same pot hammered from copper sheet.
  makeshiftPot('pot_makeshift_copper', 1, 'copper', 'verdigris', 0.004),

  // A hardwood rolling pin 460 mm long: a 300 mm barrel 64 mm across and a turned handle at each end.
  h.compound('rolling_pin', 0.7, [
    turned('barrel', 'wood', 'x', [[0, 0], [0, 0.028], [0.006, 0.032], [0.294, 0.032], [0.3, 0.028], [0.3, 0]], [-0.15, 0.032, 0]),
    turned('handle-a', 'wood', 'x', [[0, 0], [0, 0.014], [0.012, 0.017], [0.05, 0.016], [0.07, 0.012], [0.08, 0.008], [0.08, 0]], [-0.23, 0.032, 0]),
    turned('handle-b', 'wood', 'x', [[0, 0], [0, 0.008], [0.01, 0.012], [0.03, 0.016], [0.068, 0.017], [0.08, 0.014], [0.08, 0]], [0.15, 0.032, 0]),
  ], { wood: 'wood-birch' }) + {
    handling: h.gripOn('rolling_pin', 'handle-a'),
    voxelGrain: 0.004,
  },

  // A child's training cup 70 mm across and 115 mm tall to the spout: a body with two side grips and a snap-on lid
  // with a soft spout at the front (+z).
  h.compound('sippy_cup', 0.086, [
    turned('cup', 'cup', 'y', [[0, 0], [0, 0.03], [0.004, 0.033], [0.08, 0.036], [0.08, 0]]),
    turned('lid', 'lid', 'y', [[0, 0], [0, 0.038], [0.012, 0.038], [0.018, 0.03], [0.02, 0.022], [0.02, 0]], [0, 0.076, 0]),
    h.prism('spout', 'lid', 'x', [[0.09, -0.004], [0.09, 0.03], [0.113, 0.026], [0.113, 0.014]], -0.01, 0.01),
    box('grip-a', 'cup', [0.034, 0.025, -0.006], [0.05, 0.065, 0.006]),
    box('grip-b', 'cup', [-0.05, 0.025, -0.006], [-0.034, 0.065, 0.006]),
  ], { cup: 'plastic-blue', lid: 'plastic-white' }) + { voxelGrain: 0.002 },
] + [
  // A splatter screen 440 mm long lying flat: a 290 mm round of fine steel mesh in a rolled rim, two cross wires under
  // it and a long handle with a plastic grip.
  local r = 0.145, pitch = 0.012, n = std.floor(r / pitch);
  local half(c) = std.sqrt(std.max(0, r * r - c * c));
  h.compound('splatter_guard', 0.3, [
    box('wire-x-%d' % i, 'mesh', [-half(i * pitch), 0.002, i * pitch - 0.001], [half(i * pitch), 0.004, i * pitch + 0.001])
    for i in std.range(-n, n)
  ] + [
    box('wire-z-%d' % i, 'mesh', [i * pitch - 0.001, 0.004, -half(i * pitch)], [i * pitch + 0.001, 0.006, half(i * pitch)])
    for i in std.range(-n, n)
  ] + [
    turned('rim', 'steel', 'y', [[0, r - 0.004], [0, r + 0.004], [0.008, r + 0.004], [0.008, r - 0.004], [0, r - 0.004]]),
    box('cross-a', 'steel', [-r, 0, -0.002], [r, 0.002, 0.002]),
    box('cross-b', 'steel', [-0.002, 0, -r], [0.002, 0.002, r]),
    h.prism('shank', 'steel', 'y', [[-0.005, r - 0.002], [0.005, r - 0.002], [0.005, r + 0.06], [-0.005, r + 0.06]], 0, 0.004),
    turned('grip', 'grip', 'x', [[0, 0], [0, 0.009], [0.08, 0.011], [0.1, 0.008], [0.105, 0], [0, 0]], [r + 0.05, 0.008, 0]),
  ], { mesh: 'steel-stainless', steel: 'steel-stainless', grip: 'plastic-black' }) + {
    handling: h.gripOn('splatter_guard', 'grip'),
    voxelGrain: 0.002,
  },

  // A dessert spoon 190 mm long lying on its back: a flat handle widening to its end and an oval bowl 45 mm long.
  local oval(a, b, cx) = [[std.sin(i * std.pi / 8) * b, cx + std.cos(i * std.pi / 8) * a] for i in std.range(0, 15)];
  h.compound('spoon', 0.06, [
    h.prism('handle', 'steel', 'y', [[-0.007, 0], [0.007, 0], [0.012, 0.012], [0.01, 0.03], [-0.01, 0.03], [-0.012, 0.012]], 0.004, 0.006),
    h.prism('stem', 'steel', 'y', [[-0.01, 0.03], [0.01, 0.03], [0.003, 0.14], [-0.003, 0.14]], 0.004, 0.006),
    h.prism('neck', 'steel', 'y', [[-0.003, 0.138], [0.003, 0.138], [0.004, 0.148], [-0.004, 0.148]], 0.002, 0.005),
    h.prism('bowl-base', 'steel', 'y', oval(0.016, 0.01, 0.168), 0, 0.002),
    h.prism('bowl', 'steel', 'y', oval(0.022, 0.0165, 0.168), 0.002, 0.004),
    h.prism('bowl-well', 'well', 'y', oval(0.017, 0.012, 0.168), 0.004, 0.0042),
  ], { steel: 'steel-stainless', well: 'steel-mirror' }) + {
    handling: h.gripOn('spoon', 'handle'),
    voxelGrain: 0.002,
  },
]
