local h = import '../compound.libsonnet';
local box = h.box;
local disc = h.disc;
// Sheep shears lying flat along x, the bow spring at -x and the blades sprung open towards +x.
// Slots: bow, handle, blade, and grip when `grips` is set.
local sheepShears(grips) = h.crescent('bow', 'bow', 0.016, 0.024, 180, 360, 10, 0.002, 0.010) + [
  h.prism('handle-a', 'handle', 'y', [[0.016, 0], [0.024, 0], [0.020, 0.14], [0.010, 0.14]], 0, 0.012),
  h.prism('handle-b', 'handle', 'y', [[-0.024, 0], [-0.016, 0], [-0.010, 0.14], [-0.020, 0.14]], 0, 0.012),
  h.prism('blade-a', 'blade', 'y', [[-0.004, 0.13], [0.022, 0.13], [0.034, 0.31], [0.028, 0.31]], 0.004, 0.008),
  h.prism('blade-b', 'blade', 'y', [[-0.022, 0.13], [0.004, 0.13], [-0.028, 0.31], [-0.034, 0.31]], 0.008, 0.012),
] + (if grips then [
  h.prism('grip-a', 'grip', 'y', [[0.014, 0.03], [0.026, 0.03], [0.023, 0.12], [0.011, 0.12]], -0.002, 0.014),
  h.prism('grip-b', 'grip', 'y', [[-0.026, 0.03], [-0.014, 0.03], [-0.011, 0.12], [-0.023, 0.12]], -0.002, 0.014),
] else []);
// A portable transistor radio 190 mm wide, 115 mm tall and 50 mm deep, front on +z: speaker grille, tuning
// scale, two knobs, a top carry handle and a folded telescopic antenna. Without `tuner` the tuning knob is
// gone and only its bare shaft is left. Slots: body, grille, slot, scale, needle, knob, shaft, handle, antenna.
local radio(tuner) = [
  box('body', 'body', [-0.095, 0, -0.025], [0.095, 0.115, 0.025]),
  box('grille', 'grille', [-0.085, 0.012, 0.025], [-0.005, 0.098, 0.027]),
] + [
  box('slot-%d' % i, 'slot', [-0.080, 0.018 + i * 0.011, 0.027], [-0.010, 0.022 + i * 0.011, 0.029])
  for i in std.range(0, 6)
] + [
  box('scale', 'scale', [0.005, 0.066, 0.025], [0.085, 0.094, 0.027]),
  box('needle', 'needle', [0.040, 0.068, 0.027], [0.042, 0.092, 0.029]),
  h.turned('volume', 'knob', 'z', [[0, 0], [0, 0.009], [0.008, 0.009], [0.010, 0.007], [0.010, 0]], [0.025, 0.034, 0.025]),
  if tuner then
    h.turned('tuning', 'knob', 'z', [[0, 0], [0, 0.013], [0.009, 0.013], [0.011, 0.011], [0.011, 0]], [0.062, 0.034, 0.025])
  else
    h.turned('tuning-shaft', 'shaft', 'z', [[0, 0], [0, 0.003], [0.008, 0.003], [0.008, 0]], [0.062, 0.034, 0.025]),
  box('handle-post-a', 'handle', [-0.078, 0.115, -0.008], [-0.068, 0.132, 0.008]),
  box('handle-post-b', 'handle', [0.068, 0.115, -0.008], [0.078, 0.132, 0.008]),
  box('handle-bar', 'handle', [-0.078, 0.132, -0.008], [0.078, 0.140, 0.008]),
  h.rod('antenna', 'antenna', 0.003, -0.085, 0.080, 0.119) + { origin: [-0.085, 0.119, -0.018] },
  h.turned('antenna-pivot', 'antenna', 'y', [[0, 0], [0, 0.006], [0.008, 0.006], [0.008, 0]], [0.084, 0.115, -0.018]),
];
local radioFinish = {
  body: 'plastic-charcoal', grille: 'alu-bare', slot: 'plastic-black', scale: 'paper-white', needle: 'plastic-red',
  knob: 'alu-bare', shaft: 'steel-stainless', handle: 'plastic-black', antenna: 'steel-stainless',
};
// A glass leaf drawn standing on the soil: a thin upright triangle at (x, z), `ht` tall, leaning by `lean`.
local leaf(id, slot, x, z, ht, w, lean) =
  h.prism(id, slot, 'z', [[x - w / 2, 0.075], [x + w / 2, 0.075], [x + lean, 0.075 + ht]], z - 0.003, z + 0.003);
[
  // A glass terrarium 500 mm long, 320 mm tall and 300 mm deep in a black frame, on a bed of soil planted
  // with purple and green leaves, with a giant firefly 170 mm long clinging to a twig inside, its
  // tail glowing, and a mesh lid with a wire carry handle.
  h.compound('firefly_terrarium', 17, [
    box('base', 'frame', [-0.25, 0, -0.15], [0.25, 0.025, 0.15]),
    box('rim-front', 'frame', [-0.25, 0.300, 0.138], [0.25, 0.318, 0.15]),
    box('rim-back', 'frame', [-0.25, 0.300, -0.15], [0.25, 0.318, -0.138]),
    box('rim-left', 'frame', [-0.25, 0.300, -0.138], [-0.238, 0.318, 0.138]),
    box('rim-right', 'frame', [0.238, 0.300, -0.138], [0.25, 0.318, 0.138]),
  ] + [
    box('post-%d-%d' % [i, j], 'frame', [sx * 0.25 - (if sx > 0 then 0.012 else 0), 0.025, sz * 0.15 - (if sz > 0 then 0.012 else 0)], [sx * 0.25 + (if sx > 0 then 0 else 0.012), 0.300, sz * 0.15 + (if sz > 0 then 0 else 0.012)])
    for i in [0, 1]
    for j in [0, 1]
    for sx in [[-1, 1][i]]
    for sz in [[-1, 1][j]]
  ] + [
    box('glass-front', 'glass', [-0.238, 0.025, 0.138], [0.238, 0.300, 0.144]),
    box('glass-back', 'glass', [-0.238, 0.025, -0.144], [0.238, 0.300, -0.138]),
    box('glass-left', 'glass', [-0.244, 0.025, -0.138], [-0.238, 0.300, 0.138]),
    box('glass-right', 'glass', [0.238, 0.025, -0.138], [0.244, 0.300, 0.138]),
    box('soil', 'soil', [-0.238, 0.025, -0.138], [0.238, 0.075, 0.138]),
    h.ball('stone', 'stone', 0.035, 0.15, 0.065, 0.06, 0.6),
    leaf('leaf-a', 'mutant', -0.17, -0.06, 0.20, 0.05, 0.03),
    leaf('leaf-b', 'mutant', -0.13, -0.09, 0.17, 0.04, -0.04),
    leaf('leaf-c', 'leaf', -0.20, 0.02, 0.12, 0.04, 0.02),
    leaf('leaf-d', 'mutant', 0.19, -0.08, 0.18, 0.05, -0.03),
    leaf('leaf-e', 'leaf', 0.13, -0.10, 0.13, 0.04, 0.03),
    leaf('leaf-f', 'mutant', -0.05, -0.11, 0.21, 0.05, 0.02),
    h.prism('twig', 'twig', 'z', [[-0.16, 0.075], [-0.14, 0.075], [0.13, 0.195], [0.12, 0.205]], -0.008, 0.008),
    h.ball('head', 'chitin', 0.018, 0.058, 0.186, 0.0),
    h.turned('thorax', 'chitin', 'x', [[0, 0], [0, 0.018], [0.015, 0.026], [0.034, 0.024], [0.040, 0]], [0.004, 0.190, 0]),
    h.turned('tail', 'glow', 'x', [[0, 0], [0, 0.020], [0.025, 0.034], [0.070, 0.032], [0.090, 0.018], [0.095, 0]], [-0.088, 0.190, 0]),
    h.prism('wing-a', 'wing', 'y', [[0.002, 0.040], [0.034, 0.036], [0.040, -0.070], [0.010, -0.070]], 0.222, 0.228),
    h.prism('wing-b', 'wing', 'y', [[-0.034, 0.036], [-0.002, 0.040], [-0.010, -0.070], [-0.040, -0.070]], 0.222, 0.228),
    box('mesh-lid', 'mesh', [-0.238, 0.312, -0.138], [0.238, 0.316, 0.138]),
    box('handle-post-a', 'handle', [-0.085, 0.318, -0.004], [-0.077, 0.360, 0.004]),
    box('handle-post-b', 'handle', [0.077, 0.318, -0.004], [0.085, 0.360, 0.004]),
    box('handle-bar', 'handle', [-0.085, 0.360, -0.006], [0.085, 0.370, 0.006]),
  ] + [
    box('leg-%d-%d' % [i, s], 'chitin', [-0.010 + i * 0.020, 0.140, s * 0.018 - 0.003], [-0.004 + i * 0.020, 0.172, s * 0.018 + 0.003])
    for i in [0, 1, 2]
    for s in [-1, 1]
  ], {
    frame: 'plastic-black', glass: 'glass-clear', soil: 'bark', stone: 'stone-grey', mutant: 'plant-purple',
    leaf: 'leaf-green', twig: 'wood-walnut', chitin: 'chitin-black', glow: 'crystal-glow-white', wing: 'chitin-brown',
    mesh: 'mesh-black', handle: 'steel-bright',
  }) + { voxelGrain: 0.004 },

  // Hand-forged sheep shears 310 mm long: two leaf-shaped blades sprung open by a bow of the same steel.
  h.compound('forged_shears', 0.43, sheepShears(false),
             { bow: 'iron-dull', handle: 'iron-dull', blade: 'steel-bright' }) + {
    handling: h.gripOn('forged_shears', 'handle-a'),
    voxelGrain: 0.002,
  },

  // A western saddle 580 mm long and 450 mm across the skirts, with a horn, a raised cantle, a wool pad
  // beneath, stirrups on leathers each side and a bridle with its bit laid coiled on the seat.
  h.compound('horse_tack', 15, [
    box('pad', 'pad', [-0.20, 0.200, -0.31], [0.20, 0.218, 0.29]),
    h.prism('skirt-left', 'skirt', 'x', [[0.06, -0.25], [0.06, 0.20], [0.30, 0.23], [0.30, -0.28]], -0.19, -0.17),
    h.prism('skirt-right', 'skirt', 'x', [[0.06, -0.25], [0.06, 0.20], [0.30, 0.23], [0.30, -0.28]], 0.17, 0.19),
    h.prism('tree', 'skirt', 'x', [[0.218, -0.27], [0.218, 0.25], [0.285, 0.26], [0.30, -0.28]], -0.17, 0.17),
    h.prism('seat', 'seat', 'x', [[0.28, -0.20], [0.28, 0.15], [0.31, 0.13], [0.305, -0.18]], -0.14, 0.14),
    h.prism('fork', 'seat', 'x', [[0.28, 0.12], [0.28, 0.25], [0.36, 0.21], [0.36, 0.14]], -0.11, 0.11),
    h.prism('cantle', 'seat', 'x', [[0.28, -0.29], [0.28, -0.17], [0.37, -0.24], [0.40, -0.29]], -0.15, 0.15),
    h.turned('horn', 'horn', 'y', [[0, 0], [0, 0.020], [0.060, 0.018], [0.064, 0.040], [0.076, 0.040], [0.078, 0]], [0, 0.34, 0.175]),
  ] + std.flattenArrays([
    [
      box('leather-%d' % i, 'leather', [s * 0.19 - (if s < 0 then 0.012 else 0), 0.10, 0.00], [s * 0.19 + (if s > 0 then 0.012 else 0), 0.29, 0.06]),
      box('tread-%d' % i, 'stirrup', [s * 0.19 - (if s < 0 then 0.09 else 0), 0, -0.005], [s * 0.19 + (if s > 0 then 0.09 else 0), 0.016, 0.065]),
      box('side-out-%d' % i, 'stirrup', [s * 0.27 - (if s < 0 then 0.012 else 0), 0, 0.02], [s * 0.27 + (if s > 0 then 0.012 else 0), 0.12, 0.04]),
      box('side-in-%d' % i, 'stirrup', [s * 0.19 - (if s < 0 then 0.012 else 0), 0, 0.02], [s * 0.19 + (if s > 0 then 0.012 else 0), 0.12, 0.04]),
      box('bar-%d' % i, 'stirrup', [s * 0.19 - (if s < 0 then 0.09 else 0), 0.105, 0.015], [s * 0.19 + (if s > 0 then 0.09 else 0), 0.12, 0.045]),
      box('cinch-%d' % i, 'cinch', [s * 0.19 - (if s < 0 then 0.008 else 0), 0.02, -0.08], [s * 0.19 + (if s > 0 then 0.008 else 0), 0.20, -0.04]),
      h.turned('cinch-ring-%d' % i, 'bit', 'x', [[0, 0.022], [0, 0.030], [0.006, 0.030], [0.006, 0.022], [0, 0.022]], [s * 0.19 + (if s > 0 then 0.008 else -0.014), 0.10, -0.06]),
    ]
    for i in [0, 1]
    for s in [[-1, 1][i]]
  ]) + h.strapLoop('bridle', 'bridle', 0.10, 0.045, 0.016, 0.005, 0.305, 0, -0.03) + [
    h.rod('bit', 'bit', 0.005, -0.065, 0.065, 0.315) + { origin: [-0.065, 0.315, 0.035] },
    h.turned('bit-ring-a', 'bit', 'x', [[0, 0.016], [0, 0.022], [0.005, 0.022], [0.005, 0.016], [0, 0.016]], [-0.070, 0.322, 0.035]),
    h.turned('bit-ring-b', 'bit', 'x', [[0, 0.016], [0, 0.022], [0.005, 0.022], [0.005, 0.016], [0, 0.016]], [0.065, 0.322, 0.035]),
    box('rein', 'bridle', [-0.008, 0.18, 0.250], [0.008, 0.37, 0.258]),
  ], {
    pad: 'cloth-navy', skirt: 'leather-tan', seat: 'leather-chestnut', horn: 'leather-chestnut',
    leather: 'leather-chestnut', stirrup: 'wood-oak', cinch: 'cord-cotton', bridle: 'leather-brown', bit: 'steel-stainless',
  }) + { voxelGrain: 0.006 },

  // A portable platform scale for a horse or a cow: a 1960 by 720 mm galvanised steel deck 100 mm tall on
  // four rubber feet, under a ribbed rubber mat, with its readout lying on the mat on a short cable and a
  // carry handle at each end.
  h.compound('livestock_scale', 57, [
    box('deck', 'deck', [-0.96, 0.024, -0.36], [0.96, 0.088, 0.36]),
    box('mat', 'mat', [-0.94, 0.088, -0.34], [0.94, 0.096, 0.34]),
  ] + [
    box('rib-%d' % i, 'mat', [-0.90 + i * 0.12, 0.096, -0.33], [-0.88 + i * 0.12, 0.104, 0.33])
    for i in std.range(0, 15)
  ] + [
    disc('foot-%d-%d' % [i, j], 'foot', 0.04, 0, 0.024, [-0.88, 0.88][i], [-0.29, 0.29][j])
    for i in [0, 1]
    for j in [0, 1]
  ] + [
    box('handle-%d' % i, 'handle', [[-0.98, 0.96][i], 0.040, -0.12], [[-0.96, 0.98][i], 0.072, 0.12])
    for i in [0, 1]
  ] + [
    box('readout', 'readout', [-0.80, 0.104, 0.10], [-0.60, 0.160, 0.24]),
    box('display', 'display', [-0.78, 0.160, 0.14], [-0.62, 0.164, 0.22]),
    box('key-a', 'key', [-0.76, 0.160, 0.115], [-0.73, 0.166, 0.13]),
    box('key-b', 'key', [-0.71, 0.160, 0.115], [-0.68, 0.166, 0.13]),
    box('key-c', 'key', [-0.66, 0.160, 0.115], [-0.63, 0.166, 0.13]),
    box('cable', 'cable', [-0.94, 0.096, 0.165], [-0.80, 0.106, 0.175]),
  ], {
    deck: 'steel-galvanised', mat: 'rubber-black', foot: 'rubber-offblack', handle: 'steel-grey',
    readout: 'plastic-white', display: 'lcd-green', key: 'plastic-blue', cable: 'plastic-black',
  }) + { voxelGrain: 0.008 },

  // Sheep shears 310 mm long like the forged pair, with plastic sleeves over the handles.
  h.compound('shears', 0.47, sheepShears(true),
             { bow: 'steel-bright', handle: 'steel-bright', blade: 'steel-stainless', grip: 'plastic-red' }) + {
    handling: h.gripOn('shears', 'grip-a'),
    voxelGrain: 0.002,
  },

  // The portable radio below with its tuning knob pulled off and a bodged board, a copper coil, an aluminium
  // plate and loose wires taped to its back, some wires led over the top to the front.
  h.compound('balthazar_radio', 1, radio(false) + [
    box('plate', 'plate', [-0.075, 0.012, -0.030], [0.060, 0.100, -0.025]),
    box('board', 'board', [-0.065, 0.028, -0.034], [0.000, 0.088, -0.030]),
    box('chip-a', 'chip', [-0.055, 0.040, -0.038], [-0.035, 0.052, -0.034]),
    box('chip-b', 'chip', [-0.030, 0.062, -0.038], [-0.012, 0.078, -0.034]),
    h.turned('coil', 'coil', 'z', [[0, 0.010], [0, 0.017], [0.010, 0.017], [0.010, 0.010], [0, 0.010]], [0.030, 0.058, -0.040]),
    box('tape', 'tape', [0.086, -0.002, -0.036], [0.094, 0.117, 0.027]),
    box('wire-red-back', 'wire-red', [-0.020, 0.088, -0.036], [-0.016, 0.119, -0.032]),
    box('wire-red-top', 'wire-red', [-0.020, 0.115, -0.036], [-0.016, 0.119, 0.020]),
    box('wire-red-front', 'wire-red', [-0.020, 0.100, 0.020], [-0.016, 0.119, 0.029]),
    box('wire-yellow-back', 'wire-yellow', [0.008, 0.060, -0.036], [0.012, 0.119, -0.032]),
    box('wire-yellow-top', 'wire-yellow', [0.008, 0.115, -0.036], [0.012, 0.119, 0.012]),
    box('wire-yellow-side', 'wire-yellow', [0.095, 0.020, -0.010], [0.099, 0.070, -0.006]),
    box('wire-yellow-loop', 'wire-yellow', [0.012, 0.115, 0.008], [0.050, 0.119, 0.012]),
  ], radioFinish + {
    plate: 'alu-bare', board: 'circuit-green', chip: 'plastic-black', coil: 'copper', tape: 'tape-grey',
    'wire-red': 'plastic-red', 'wire-yellow': 'plastic-yellow',
  }) + h.inHand('balthazar_radio', 'body') + { voxelGrain: 0.002 },

  // A portable transistor radio 190 mm wide, 115 mm tall and 50 mm deep with a carry handle.
  h.compound('radio', 0.51, radio(true), radioFinish) + h.inHand('radio', 'body') + { voxelGrain: 0.002 },

  // A remote-controlled toy truck 310 mm long and 190 mm wide over its fat tyres, front on +z, with a red
  // shell, dark windows, bumpers and a whip antenna at the back.
  h.compound('radio_car', 1.2, [
    box('chassis', 'chassis', [-0.05, 0.024, -0.13], [0.05, 0.040, 0.13]),
    box('body', 'shell', [-0.07, 0.040, -0.14], [0.07, 0.074, 0.14]),
    h.prism('cabin', 'window', 'x', [[0.074, -0.075], [0.074, 0.065], [0.110, 0.030], [0.110, -0.055]], -0.056, 0.056),
    box('roof', 'shell', [-0.058, 0.110, -0.058], [0.058, 0.118, 0.032]),
    box('bumper-front', 'chassis', [-0.065, 0.030, 0.14], [0.065, 0.056, 0.155]),
    box('bumper-rear', 'chassis', [-0.065, 0.030, -0.155], [0.065, 0.056, -0.14]),
    box('lamp-a', 'lamp', [-0.058, 0.056, 0.14], [-0.036, 0.068, 0.143]),
    box('lamp-b', 'lamp', [0.036, 0.056, 0.14], [0.058, 0.068, 0.143]),
    h.turned('antenna', 'antenna', 'y', [[0, 0], [0, 0.0025], [0.17, 0.0025], [0.17, 0]], [0.05, 0.074, -0.12]),
  ] + std.flattenArrays([
    [
      h.turned('tyre-%d-%d' % [i, j], 'tyre', 'x', [[0, 0], [0, 0.036], [0.003, 0.040], [0.033, 0.040], [0.036, 0.036], [0.036, 0]], [[-0.093, 0.057][i], 0.040, z]),
      h.turned('hub-%d-%d' % [i, j], 'hub', 'x', [[0, 0], [0, 0.022], [0.003, 0.022], [0.003, 0]], [[-0.095, 0.092][i], 0.040, z]),
      box('arch-%d-%d' % [i, j], 'shell', [[-0.095, 0.05][i], 0.074, z - 0.05], [[-0.05, 0.095][i], 0.084, z + 0.05]),
    ]
    for i in [0, 1]
    for j in [0, 1]
    for z in [[-0.092, 0.092][j]]
  ]), {
    chassis: 'plastic-black', shell: 'plastic-red', window: 'screen-black', lamp: 'plastic-white',
    antenna: 'plastic-black', tyre: 'rubber-tread', hub: 'alu-bare',
  }) + { voxelGrain: 0.002 },
]
