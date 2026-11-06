local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
local rod = h.rod;
// A thin ring of `n` flat convex segments about the `axis` through (a, b), radii `r0` to `r1`, from angle `a0` to
// `a1` in degrees, `start` to `end` along the axis: a handle or a collar that a turned ring cannot leave open.
local arc(id, slot, axis, a, b, r0, r1, a0, a1, n, start, end) = [
  local t0 = std.pi / 180 * (a0 + (a1 - a0) * i / n), t1 = std.pi / 180 * (a0 + (a1 - a0) * (i + 1) / n);
  h.prism('%s-%d' % [id, i], slot, axis, [
    [a + r0 * std.cos(t0), b + r0 * std.sin(t0)],
    [a + r1 * std.cos(t0), b + r1 * std.sin(t0)],
    [a + r1 * std.cos(t1), b + r1 * std.sin(t1)],
    [a + r0 * std.cos(t1), b + r0 * std.sin(t1)],
  ], start, end)
  for i in std.range(0, n - 1)
];
// A flat ring standing on y from `y0` to `y1`, radii `r0` to `r1`; its outline ends where it starts so the hole stays open.
local ring(id, slot, r0, r1, y0, y1) = turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [0, y0, 0]);
// A ring on y with two hand holes cut through it at ±x, each `gap` degrees wide: a cylinder collar.
local handHoleRing(id, slot, r0, r1, y0, y1, gap, n) =
  arc(id + '-n', slot, 'y', 0, 0, r0, r1, gap / 2, 180 - gap / 2, n, y0, y1)
  + arc(id + '-s', slot, 'y', 0, 0, r0, r1, 180 + gap / 2, 360 - gap / 2, n, y0, y1);
// A wheel lying in the x-y plane facing +z, centred at (x, y) and starting at depth `z`, for a printed picture.
local face(id, slot, radius, x, y, z, depth=0.004) = turned(id, slot, 'z', [[0, 0], [0, radius], [depth, radius], [depth, 0]], [x, y, z]);
// A toy or kit carton standing on its long edge, 300 mm long, 150 mm tall and 80 mm deep, with a printed
// background panel on its front at +z and a white text strip along its top. `picture` pieces sit on the panel.
local carton(id, massKg, picture, finish) =
  h.compound(id, massKg, [
    box('carton', 'carton', [-0.15, 0, -0.04], [0.15, 0.15, 0.04]),
    box('panel', 'panel', [-0.136, 0.012, 0.04], [0.136, 0.13, 0.044]),
    box('strip', 'strip', [-0.12, 0.15, -0.024], [0.12, 0.152, 0.024]),
    box('strip-side', 'strip', [0.15, 0.03, -0.03], [0.152, 0.12, 0.03]),
  ] + picture, finish) + { voxelGrain: 0.004 };
[
  // A square ice-cream tub, 190 mm across the lip and 166 mm tall with its lid, white with a blue printed band
  // and a plastic carry handle standing up over the lid.
  h.compound('plastic_bucket', 0.31, [
    box('foot', 'tub', [-0.082, 0, -0.082], [0.082, 0.012, 0.082]),
    box('tub', 'tub', [-0.088, 0.012, -0.088], [0.088, 0.14, 0.088]),
    box('lip', 'tub', [-0.095, 0.14, -0.095], [0.095, 0.15, 0.095]),
    box('lid', 'lid', [-0.097, 0.15, -0.097], [0.097, 0.16, 0.097]),
    box('lid-panel', 'lid', [-0.078, 0.16, -0.078], [0.078, 0.166, 0.078]),
    box('band-front', 'band', [-0.088, 0.04, 0.088], [0.088, 0.11, 0.092]),
    box('band-back', 'band', [-0.088, 0.04, -0.092], [0.088, 0.11, -0.088]),
    box('band-left', 'band', [-0.092, 0.04, -0.088], [-0.088, 0.11, 0.088]),
    box('band-right', 'band', [0.088, 0.04, -0.088], [0.092, 0.11, 0.088]),
    box('ear-left', 'tub', [-0.1, 0.112, -0.012], [-0.088, 0.136, 0.012]),
    box('ear-right', 'tub', [0.088, 0.112, -0.012], [0.1, 0.136, 0.012]),
  ] + arc('handle', 'handle', 'z', 0, 0.124, 0.1, 0.108, 0, 180, 16, -0.006, 0.006), {
    tub: 'plastic-white',
    lid: 'plastic-white',
    band: 'plastic-blue',
    handle: 'plastic-white',
  }) + { voxelGrain: 0.004 },

  // A small steel gas cylinder, 40 mm across and 120 mm tall, with a domed shoulder, a printed band and a
  // black plastic valve head with a side outlet and a knob.
  h.compound('pressurized_canister', 0.25, [
    turned('shell', 'steel', 'y', [[0, 0], [0, 0.017], [0.004, 0.02], [0.088, 0.02], [0.096, 0.017], [0.102, 0.01], [0.104, 0.006], [0.104, 0]]),
    ring('band', 'band', 0.019, 0.021, 0.03, 0.07),
    disc('valve', 'valve', 0.01, 0.102, 0.114),
    box('outlet', 'valve', [0.008, 0.104, -0.004], [0.018, 0.112, 0.004]),
    disc('knob', 'valve', 0.007, 0.114, 0.12),
  ], { steel: 'steel-grey', band: 'paint-white', valve: 'plastic-black' })
  + h.inHand('pressurized_canister', 'shell') + { voxelGrain: 0.002 },

  // A toy radio-controlled car carton, 300 by 150 by 80 mm, with a red car on a blue printed panel and a
  // little black remote control with its aerial printed beside it.
  carton('rc_car_box', 0.6, [
    box('car-body', 'car', [-0.11, 0.04, 0.044], [0.05, 0.072, 0.048]),
    box('car-cabin', 'car', [-0.07, 0.072, 0.044], [0.02, 0.1, 0.048]),
    box('car-window', 'window', [-0.062, 0.076, 0.048], [0.012, 0.094, 0.052]),
    box('car-spoiler', 'car', [-0.11, 0.072, 0.044], [-0.096, 0.086, 0.048]),
    face('wheel-rear', 'tyre', 0.018, -0.08, 0.04, 0.048),
    face('wheel-front', 'tyre', 0.018, 0.024, 0.04, 0.048),
    face('hub-rear', 'window', 0.007, -0.08, 0.04, 0.052),
    face('hub-front', 'window', 0.007, 0.024, 0.04, 0.052),
    box('remote', 'tyre', [0.072, 0.03, 0.044], [0.116, 0.07, 0.048]),
    box('remote-stick', 'window', [0.08, 0.045, 0.048], [0.088, 0.06, 0.052]),
    box('remote-aerial', 'tyre', [0.106, 0.07, 0.044], [0.11, 0.118, 0.048]),
  ], { carton: 'plastic-yellow', panel: 'plastic-blue', strip: 'paint-white', car: 'plastic-red', window: 'paint-white', tyre: 'plastic-black' }),

  // A standard shot glass, 48 mm across the rim and 58 mm tall, tapering to a thick heavy base.
  h.compound('shot_glass', 0.071, [
    turned('glass', 'glass', 'y', [[0, 0], [0, 0.02], [0.058, 0.024], [0.058, 0.0205], [0.014, 0.017], [0.014, 0]]),
  ], { glass: 'glass-clear' })
  + h.inHand('shot_glass', 'glass') + { voxelGrain: 0.002 },

  // A camping propane cylinder, 116 mm across and 300 mm tall, green steel with a yellow printed band, a
  // domed top and a brass valve.
  h.compound('small_propane_tank', 0.98, [
    turned('tank', 'paint', 'y', [[0, 0], [0, 0.052], [0.006, 0.058], [0.22, 0.058]] + [
      local t = std.pi / 2 * i / 6;
      [0.22 + 0.042 * std.sin(t), 0.014 + 0.044 * std.cos(t)]
      for i in std.range(1, 6)
    ] + [[0.262, 0]]),
    ring('band', 'band', 0.056, 0.061, 0.06, 0.17),
    disc('valve', 'valve', 0.012, 0.258, 0.284),
    disc('valve-top', 'valve', 0.009, 0.284, 0.3),
  ], { paint: 'plastic-green', band: 'plastic-yellow', valve: 'brass' })
  + h.inHand('small_propane_tank', 'tank') + { voxelGrain: 0.004 },

  // A single-use squeeze tube, 30 mm long and 10 mm across, lying down: a crimped tail, a white body
  // narrowing to a short nozzle and a red cap.
  h.compound('small_squeeze_tube', 0.0012, [
    box('crimp', 'tube', [-0.015, 0.004, -0.006], [-0.008, 0.006, 0.006]),
    turned('body', 'tube', 'x', [[0, 0], [0, 0.002], [0.006, 0.005], [0.016, 0.005], [0.018, 0.003], [0.018, 0]], [-0.01, 0.005, 0]),
    rod('nozzle', 'tube', 0.002, 0.008, 0.011, 0.005),
    rod('cap', 'cap', 0.0035, 0.011, 0.015, 0.005),
  ], { tube: 'plastic-white', cap: 'plastic-red' })
  + { voxelGrain: 0.002 },

  // A 10.1 ounce caulk cartridge lying down, 50 mm across and 265 mm long: a white tube with a blue printed
  // label, a tapered shoulder and a long cut nozzle, the black follower plate showing at the open back.
  h.compound('squeeze_tube', 0.42, [
    rod('tube', 'tube', 0.025, -0.105, 0.1, 0.025),
    rod('label', 'label', 0.0265, -0.07, 0.07, 0.025),
    rod('follower', 'follower', 0.021, -0.107, -0.103, 0.025),
    turned('shoulder', 'tube', 'x', [[0, 0], [0, 0.025], [0.012, 0.012], [0.012, 0]], [0.1, 0.025, 0]),
    turned('nozzle', 'tube', 'x', [[0, 0], [0, 0.007], [0.05, 0.003], [0.05, 0]], [0.112, 0.025, 0]),
  ], { tube: 'plastic-white', label: 'plastic-blue', follower: 'plastic-black' })
  + { voxelGrain: 0.004 },

  // A clear acrylic leaflet stand, 220 mm wide, 300 mm tall and 140 mm deep: a leaning back panel on a flat
  // base with a front pocket, one cream leaflet still standing in it.
  h.compound('stand_flyer', 0.6, [
    box('base', 'acrylic', [-0.11, 0, -0.07], [0.11, 0.006, 0.07]),
    h.prism('back', 'acrylic', 'x', [[0.006, -0.056], [0.006, -0.06], [0.3, -0.1], [0.3, -0.096]], -0.11, 0.11),
    h.prism('front', 'acrylic', 'x', [[0.006, 0.024], [0.006, 0.02], [0.13, 0.002], [0.13, 0.006]], -0.11, 0.11),
    h.prism('side-left', 'acrylic', 'x', [[0.006, -0.056], [0.006, 0.02], [0.12, 0.004], [0.12, -0.072]], -0.11, -0.106),
    h.prism('side-right', 'acrylic', 'x', [[0.006, -0.056], [0.006, 0.02], [0.12, 0.004], [0.12, -0.072]], 0.106, 0.11),
    h.prism('leaflet', 'leaflet', 'x', [[0.006, -0.05], [0.006, -0.046], [0.2, -0.072], [0.2, -0.076]], -0.1, 0.1),
  ], { acrylic: 'plastic-clear', leaflet: 'paint-cream' })
  + { voxelGrain: 0.004 },

  // A science kit carton, 300 by 150 by 80 mm, with two children and a spoked flywheel engine printed on a
  // cream panel.
  carton('stirling_kit_box', 0.5, [
    face('head-a', 'skin', 0.012, -0.1, 0.098, 0.044),
    box('body-a', 'shirt-a', [-0.114, 0.036, 0.044], [-0.086, 0.084, 0.048]),
    box('arm-a', 'shirt-a', [-0.086, 0.064, 0.044], [-0.05, 0.072, 0.048]),
    face('head-b', 'skin', 0.012, 0.1, 0.098, 0.044),
    box('body-b', 'shirt-b', [0.086, 0.036, 0.044], [0.114, 0.084, 0.048]),
    box('arm-b', 'shirt-b', [0.05, 0.064, 0.044], [0.086, 0.072, 0.048]),
    box('engine-base', 'engine', [-0.044, 0.024, 0.044], [0.044, 0.034, 0.048]),
    box('engine-cylinder', 'engine', [0.008, 0.034, 0.044], [0.03, 0.074, 0.048]),
    turned('flywheel', 'wheel', 'z', [[0, 0.026], [0, 0.032], [0.004, 0.032], [0.004, 0.026], [0, 0.026]], [-0.016, 0.07, 0.044]),
    box('spoke-a', 'wheel', [-0.044, 0.068, 0.044], [0.012, 0.072, 0.048]),
    box('spoke-b', 'wheel', [-0.018, 0.042, 0.044], [-0.014, 0.098, 0.048]),
    box('crank', 'engine', [-0.016, 0.066, 0.048], [0.02, 0.072, 0.052]),
  ], { carton: 'plastic-green', panel: 'paint-cream', strip: 'paint-white', skin: 'paint-terracotta', 'shirt-a': 'plastic-orange', 'shirt-b': 'plastic-blue', engine: 'brass', wheel: 'steel-grey' }),

  // A cleaned animal stomach lying on its side, 210 mm long and 140 mm across, swollen with water, its neck
  // gathered and tied off with a cord whose ends hang loose.
  h.compound('stomach_sealed', 1.7, [
    turned('stomach', 'gut', 'x', [[0, 0], [0, 0.035], [0.02, 0.058], [0.06, 0.07], [0.11, 0.066], [0.15, 0.046], [0.17, 0.022], [0.18, 0.012], [0.18, 0]], [-0.11, 0.07, 0]),
    turned('tie', 'cord', 'x', [[0, 0], [0, 0.015], [0.008, 0.015], [0.008, 0]], [0.066, 0.07, 0]),
    turned('tuft', 'gut', 'x', [[0, 0], [0, 0.011], [0.014, 0.02], [0.026, 0.016], [0.026, 0]], [0.074, 0.07, 0]),
    box('cord-end-a', 'cord', [0.066, 0.02, 0.012], [0.072, 0.07, 0.018]),
    box('cord-end-b', 'cord', [0.06, 0.03, 0.004], [0.066, 0.06, 0.01]),
  ], { gut: 'wax-cream', cord: 'cord-olive' })
  + { voxelGrain: 0.004 },
]
+ (
  // A 100 litre whiskey barrel standing on end, 490 mm across the bilge and 720 mm tall: bellied oak staves
  // standing proud of recessed heads, four dark steel hoops and a bung in its side.
  local height = 0.72, head = 0.2, belly = 0.045;
  local r(y) = head + belly * std.sin(std.pi * y / height);
  local hoop(id, y0, y1) = ring(id, 'hoop', std.min(r(y0), r(y1)) - 0.01, std.max(r(y0), r(y1)) + 0.006, y0, y1);
  [
    h.compound('wooden_barrel', 30, [
      turned('staves', 'wood', 'y', [[0.016, 0], [0.016, 0.18], [0, 0.18]] + [
        [height * i / 12, r(height * i / 12)]
        for i in std.range(0, 12)
      ] + [[height, 0.18], [height - 0.016, 0.18], [height - 0.016, 0]]),
      hoop('hoop-foot', 0.02, 0.06),
      hoop('hoop-low', 0.17, 0.21),
      hoop('hoop-high', 0.51, 0.55),
      hoop('hoop-top', 0.66, 0.7),
      turned('bung', 'bung', 'z', [[0, 0], [0, 0.022], [0.014, 0.022], [0.014, 0]], [0, height / 2, r(height / 2) - 0.008]),
    ], { wood: 'wood-pine', hoop: 'steel', bung: 'wood-walnut' }),
  ]
)
+ [
  // A sheet of butcher paper, 240 mm square, folded once in half and lying loose with its top half lifted.
  h.compound('wrapper', 0.0048, [
    box('sheet', 'paper', [-0.12, 0, -0.06], [0.12, 0.002, 0.06]),
    h.prism('flap', 'paper', 'x', [[0.002, -0.06], [0.004, -0.06], [0.024, 0.056], [0.022, 0.056]], -0.12, 0.12),
    rod('fold', 'paper', 0.003, -0.12, 0.12, 0.003) + { origin: [-0.12, 0.003, -0.06] },
  ], { paper: 'paperboard-tan' })
  + { voxelGrain: 0.002 },

  // A torn-off sheet of kitchen foil, 300 mm square, lying loosely crumpled with crinkle ridges across it.
  h.compound('wrapper_foil', 0.004, [
    box('sheet', 'foil', [-0.15, 0, -0.15], [0.15, 0.002, 0.15]),
  ] + [
    h.prism('crease-x-%d' % i, 'foil', 'x', [[0.002, z - 0.012], [0.002, z + 0.012], [0.008, z]], -0.15, 0.15)
    for i in [0, 1, 2]
    for z in [[-0.09, 0.01, 0.1][i]]
  ] + [
    h.prism('crease-z-%d' % i, 'foil', 'z', [[x - 0.01, 0.002], [x + 0.01, 0.002], [x, 0.006]], -0.15, 0.15)
    for i in [0, 1]
    for x in [[-0.05, 0.07][i]]
  ] + [
    h.prism('corner', 'foil', 'z', [[0.11, 0.002], [0.15, 0.002], [0.15, 0.03]], 0.1, 0.15),
  ], { foil: 'alu-bare' })
  + { voxelGrain: 0.002 },

  // A roll of kitchen foil lying down, 300 mm long and 56 mm across, its cardboard core showing at both ends
  // and a loose tail of foil unrolled across the floor in front of it.
  h.compound('wrapper_foil_roll', 0.36, [
    turned('core', 'core', 'x', [[0, 0.016], [0, 0.02], [0.3, 0.02], [0.3, 0.016], [0, 0.016]], [-0.15, 0.028, 0]),
    turned('foil', 'foil', 'x', [[0, 0.02], [0, 0.028], [0.29, 0.028], [0.29, 0.02], [0, 0.02]], [-0.145, 0.028, 0]),
    box('tail', 'foil', [-0.145, 0, 0], [0.145, 0.002, 0.08]),
  ], { core: 'paperboard-brown', foil: 'alu-bare' })
  + { voxelGrain: 0.002 },

  // A 420 pound propane cylinder standing upright, 600 mm across and 1220 mm tall: a white steel shell with
  // domed ends on a foot ring, a collar with two hand holes guarding a brass valve and a black handwheel.
  h.compound('xl_propane_tank', 160, [
    turned('shell', 'paint', 'y', [[0.08, 0]] + [
      local t = std.pi / 2 * i / 6;
      [0.2 - 0.12 * std.cos(t), 0.3 * std.sin(t)]
      for i in std.range(1, 6)
    ] + [
      local t = std.pi / 2 * i / 6;
      [1.0 + 0.12 * std.sin(t), 0.3 * std.cos(t)]
      for i in std.range(0, 6)
    ]),
    ring('foot', 'paint', 0.24, 0.255, 0, 0.12),
    ring('collar-foot', 'paint', 0.16, 0.172, 1.07, 1.12),
    ring('collar-top', 'paint', 0.16, 0.172, 1.19, 1.22),
    disc('valve', 'valve', 0.03, 1.1, 1.17),
    box('valve-outlet', 'valve', [0.03, 1.13, -0.012], [0.07, 1.15, 0.012]),
    disc('wheel', 'wheel', 0.055, 1.17, 1.185),
  ] + handHoleRing('collar', 'paint', 0.16, 0.172, 1.12, 1.19, 50, 8), { paint: 'paint-white', valve: 'brass', wheel: 'plastic-black' }),
]
