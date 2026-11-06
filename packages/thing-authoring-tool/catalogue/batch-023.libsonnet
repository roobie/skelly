local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A die's pips: on each face a 4 mm square painted flush at (u, v) steps of 4 mm from the face centre.
local pipFaces = {
  '+y': { n: 1, at(u, v): [[u - 0.002, 0.014, v - 0.002], [u + 0.002, 0.016, v + 0.002]] },
  '-y': { n: 6, at(u, v): [[u - 0.002, 0, v - 0.002], [u + 0.002, 0.002, v + 0.002]] },
  '+z': { n: 2, at(u, v): [[u - 0.002, 0.008 + v - 0.002, 0.006], [u + 0.002, 0.008 + v + 0.002, 0.008]] },
  '-z': { n: 5, at(u, v): [[u - 0.002, 0.008 + v - 0.002, -0.008], [u + 0.002, 0.008 + v + 0.002, -0.006]] },
  '+x': { n: 3, at(u, v): [[0.006, 0.008 + v - 0.002, u - 0.002], [0.008, 0.008 + v + 0.002, u + 0.002]] },
  '-x': { n: 4, at(u, v): [[-0.008, 0.008 + v - 0.002, u - 0.002], [-0.006, 0.008 + v + 0.002, u + 0.002]] },
};
local pipLayout = {
  '1': [[0, 0]],
  '2': [[-1, -1], [1, 1]],
  '3': [[-1, -1], [0, 0], [1, 1]],
  '4': [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  '5': [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]],
  '6': [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};
[
  // A six-sided plastic die, 16 mm on a side, white with black pips; 1 on top, 2 to the front and 3 to the right.
  h.compound('plastic_six_dice', 0.0045, [
    box('cube', 'body', [-0.008, 0, -0.008], [0.008, 0.016, 0.008]),
  ] + [
    local f = pipFaces[face], p = pipLayout[std.toString(f.n)][i], c = f.at(p[0] * 0.004, p[1] * 0.004);
    box('pip-%s-%d' % [face, i], 'pip', c[0], c[1])
    for face in std.objectFields(pipFaces)
    for i in std.range(0, pipFaces[face].n - 1)
  ], { body: 'enamel-white', pip: 'plastic-black' })
  + h.inHand('plastic_six_dice', 'cube') + { voxelGrain: 0.002 },

  // A poppy seed head from a mutated plant, 47 mm tall and 28 mm across: a short cut stem, a round green pod and
  // a flat purple crown with eight ridges radiating from its centre.
  h.compound('poppy_bud', 0.006, [
    turned('pod', 'pod', 'y', [
      [0, 0], [0, 0.003], [0.014, 0.003], [0.016, 0.007], [0.021, 0.012], [0.029, 0.014], [0.036, 0.0125], [0.041, 0.008],
      [0.043, 0.006], [0.043, 0],
    ]),
    disc('crown', 'crown', 0.009, 0.043, 0.045),
  ] + [
    local a = i * std.pi / 4;
    h.prism('ridge-%d' % i, 'crown', 'y', [
      [0.0015 * std.cos(a + std.pi / 2), 0.0015 * std.sin(a + std.pi / 2)],
      [0.0095 * std.cos(a) + 0.0015 * std.cos(a + std.pi / 2), 0.0095 * std.sin(a) + 0.0015 * std.sin(a + std.pi / 2)],
      [0.0095 * std.cos(a) - 0.0015 * std.cos(a + std.pi / 2), 0.0095 * std.sin(a) - 0.0015 * std.sin(a + std.pi / 2)],
      [-0.0015 * std.cos(a + std.pi / 2), -0.0015 * std.sin(a + std.pi / 2)],
    ], 0.045, 0.047)
    for i in std.range(0, 7)
  ], { pod: 'leaf-green', crown: 'plant-purple' })
  + h.inHand('poppy_bud', 'pod') + { voxelGrain: 0.002 },

  // A small switching power converter, 150 mm wide, 60 mm tall and 100 mm deep: a bare aluminium case, a fan
  // behind a wire guard and a mains socket on the front, a printed label on top and three output leads out the
  // right side.
  h.compound('power_supply', 0.6, [
    box('case', 'case', [-0.075, 0, -0.05], [0.075, 0.06, 0.05]),
    turned('fan', 'fan', 'z', [[0, 0], [0, 0.025], [0.002, 0.025], [0.002, 0]], [-0.03, 0.03, 0.05]),
    turned('hub', 'guard', 'z', [[0, 0], [0, 0.008], [0.004, 0.008], [0.004, 0]], [-0.03, 0.03, 0.05]),
    turned('ring', 'guard', 'z', [[0, 0.016], [0, 0.019], [0.004, 0.019], [0.004, 0.016], [0, 0.016]], [-0.03, 0.03, 0.05]),
    box('guard-h', 'guard', [-0.056, 0.029, 0.05], [-0.004, 0.031, 0.054]),
    box('guard-v', 'guard', [-0.031, 0.004, 0.05], [-0.029, 0.056, 0.054]),
    box('socket', 'socket', [0.02, 0.016, 0.05], [0.05, 0.04, 0.056]),
    box('switch', 'switch', [0.056, 0.022, 0.05], [0.066, 0.036, 0.055]),
    box('label', 'label', [-0.05, 0.06, -0.03], [0.04, 0.061, 0.03]),
    box('gland', 'socket', [0.075, 0.022, -0.012], [0.08, 0.04, 0.012]),
  ] + [
    h.rod('lead-%d' % i, 'lead-%d' % i, 0.0025, 0.08, 0.12, 0) + { origin: [0.08, 0.031, -0.006 + i * 0.006] }
    for i in [0, 1, 2]
  ], { case: 'alu-bare', fan: 'plastic-black', guard: 'steel-bright', socket: 'plastic-black', switch: 'plastic-red', label: 'paper-white', 'lead-0': 'plastic-red', 'lead-1': 'plastic-black', 'lead-2': 'plastic-yellow' })
  + h.inHand('power_supply', 'case') + { voxelGrain: 0.004 },

  // A processor board, 150 by 110 mm: a green circuit board with a socketed processor under a steel lid in the
  // middle, memory and support chips round it, capacitors and a gold edge connector along the front.
  h.compound('processor', 0.095, [
    box('board', 'board', [-0.075, 0, -0.055], [0.075, 0.002, 0.055]),
    box('socket', 'socket', [-0.024, 0.002, -0.026], [0.024, 0.006, 0.022]),
    box('lid', 'lid', [-0.018, 0.006, -0.02], [0.018, 0.008, 0.016]),
    box('fingers', 'contact', [-0.06, 0, 0.049], [0.06, 0.0025, 0.055]),
    box('bridge', 'chip', [0.034, 0.002, -0.02], [0.056, 0.005, 0.002]),
    box('bios', 'chip', [-0.06, 0.002, 0.018], [-0.044, 0.004, 0.03]),
    box('header', 'socket', [-0.07, 0.002, -0.05], [-0.04, 0.01, -0.044]),
  ] + [
    box('chip-%d' % i, 'chip', [0.034 + (i % 2) * 0.014, 0.002, 0.014 + std.floor(i / 2) * 0.016], [0.044 + (i % 2) * 0.014, 0.004, 0.024 + std.floor(i / 2) * 0.016])
    for i in std.range(0, 3)
  ] + [
    disc('cap-%d' % i, 'capacitor', 0.003, 0.002, 0.012, -0.035 + (i % 3) * 0.008, -0.04 + std.floor(i / 3) * 0.008)
    for i in std.range(0, 5)
  ], { board: 'circuit-green', socket: 'plastic-gloss-white', lid: 'steel-stainless', contact: 'foil-gold', chip: 'plastic-black', capacitor: 'alu-bare' })
  + h.inHand('processor', 'board') + { voxelGrain: 0.002 },

  // A radio repeater module in a grey case 200 mm wide, 80 mm tall and 125 mm deep: a black front panel with
  // two carry handles, status lamps and a keyed data port, cooling fins on the back and two rubber whip antennas
  // 180 mm tall on top.
  h.compound('radio_repeater_mod', 1.6, [
    box('case', 'case', [-0.1, 0, -0.0625], [0.1, 0.08, 0.0575]),
    box('panel', 'panel', [-0.1, 0, 0.0575], [0.1, 0.08, 0.0625]),
    box('handle-l-top', 'handle', [-0.096, 0.064, 0.0625], [-0.088, 0.07, 0.078]),
    box('handle-l-bottom', 'handle', [-0.096, 0.01, 0.0625], [-0.088, 0.016, 0.078]),
    box('handle-l', 'handle', [-0.096, 0.01, 0.072], [-0.088, 0.07, 0.078]),
    box('handle-r-top', 'handle', [0.088, 0.064, 0.0625], [0.096, 0.07, 0.078]),
    box('handle-r-bottom', 'handle', [0.088, 0.01, 0.0625], [0.096, 0.016, 0.078]),
    box('handle-r', 'handle', [0.088, 0.01, 0.072], [0.096, 0.07, 0.078]),
    box('lamp-power', 'lamp-green', [-0.07, 0.056, 0.0625], [-0.064, 0.062, 0.065]),
    box('lamp-link', 'lamp-green', [-0.058, 0.056, 0.0625], [-0.052, 0.062, 0.065]),
    box('lamp-fault', 'lamp-red', [-0.046, 0.056, 0.0625], [-0.04, 0.062, 0.065]),
    box('label', 'label', [-0.072, 0.02, 0.0625], [-0.02, 0.044, 0.0635]),
    turned('port', 'connector', 'z', [[0, 0], [0, 0.011], [0.012, 0.011], [0.012, 0]], [0.04, 0.04, 0.0625]),
    turned('port-cap', 'handle', 'z', [[0, 0], [0, 0.007], [0.013, 0.007], [0.013, 0]], [0.04, 0.04, 0.0625]),
  ] + [
    box('fin-%d' % i, 'case', [-0.09 + i * 0.015, 0.006, -0.0745], [-0.086 + i * 0.015, 0.074, -0.0625])
    for i in std.range(0, 12)
  ] + std.flattenArrays([
    [
      disc('mount-%d' % i, 'connector', 0.008, 0.08, 0.094, x, -0.02),
      disc('antenna-%d' % i, 'antenna', 0.005, 0.094, 0.26, x, -0.02),
      disc('tip-%d' % i, 'antenna', 0.0065, 0.26, 0.268, x, -0.02),
    ]
    for i in [0, 1]
    for x in [[-0.07, 0.07][i]]
  ]), { case: 'alu-bare', panel: 'alu-anodized-black', handle: 'steel-stainless', 'lamp-green': 'gem-green', 'lamp-red': 'gem-red', label: 'paper-white', connector: 'brass-polished', antenna: 'rubber-black' })
  + { voxelGrain: 0.004 },

  // A 1.2 m length of narrow-gauge track: two light steel rails 600 mm apart, 64 mm tall with a worn bright head,
  // spiked to four timber sleepers 900 mm long, 150 mm wide and 60 mm thick.
  h.compound('railroad_track_small', 53, [
    box('sleeper-%d' % i, 'sleeper', [-0.525 + i * 0.35 - 0.075, 0, -0.45], [-0.525 + i * 0.35 + 0.075, 0.06, 0.45])
    for i in std.range(0, 3)
  ] + std.flattenArrays([
    [
      box('foot-%d' % r, 'rail', [-0.6, 0.06, z - 0.03], [0.6, 0.07, z + 0.03]),
      box('web-%d' % r, 'rail', [-0.6, 0.07, z - 0.005], [0.6, 0.106, z + 0.005]),
      box('head-%d' % r, 'rail', [-0.6, 0.106, z - 0.015], [0.6, 0.12, z + 0.015]),
      box('tread-%d' % r, 'tread', [-0.6, 0.12, z - 0.013], [0.6, 0.124, z + 0.013]),
    ]
    for r in [0, 1]
    for z in [[-0.3, 0.3][r]]
  ]) + [
    box('spike-%d-%d-%d' % [i, r, s], 'spike', [-0.525 + i * 0.35 - 0.01, 0.06, z + s * 0.04 - 0.008], [-0.525 + i * 0.35 + 0.01, 0.078, z + s * 0.04 + 0.008])
    for i in std.range(0, 3)
    for r in [0, 1]
    for s in [-1, 1]
    for z in [[-0.3, 0.3][r]]
  ], { sleeper: 'wood-walnut', rail: 'scrap-rusted', tread: 'steel-bright', spike: 'iron-dull' })
  + { voxelGrain: 0.006 },

  // A desktop memory stick, 133 mm long and 31 mm tall, lying flat: a green board with eight black chips, a
  // white label and a gold contact edge along the front.
  h.compound('ram_stick', 0.024, [
    box('board', 'board', [-0.0665, 0, -0.0155], [0.0665, 0.002, 0.0155]),
    box('contacts', 'contact', [-0.062, 0, 0.0115], [0.062, 0.0025, 0.0155]),
    box('label', 'label', [-0.03, 0.002, -0.014], [0.03, 0.0025, -0.006]),
  ] + [
    box('chip-%d' % i, 'chip', [-0.062 + i * 0.016, 0.002, -0.004], [-0.051 + i * 0.016, 0.0035, 0.009])
    for i in std.range(0, 7)
  ], { board: 'circuit-green', contact: 'foil-gold', label: 'paper-white', chip: 'plastic-black' })
  + h.inHand('ram_stick', 'board') + { voxelGrain: 0.002 },

  // A rusty reinforcing bar, 800 mm long and 16 mm across.
  h.compound('rebar', 1.1, [
    turned('bar', 'bar', 'x', [[0, 0], [0, 0.008], [0.8, 0.008], [0.8, 0]], [-0.4, 0.008, 0]),
  ], { bar: 'scrap-rusted' })
  + { handling: h.gripOn('rebar', 'bar'), voxelGrain: 0.002 },

  // A laboratory ring stand, 520 mm tall: a painted cast iron base 200 by 130 mm, a 12 mm steel rod standing at
  // its back and a 100 mm support ring on a clamp boss reaching out over the base.
  h.compound('stand_ring', 2.9, [
    box('base', 'base', [-0.1, 0, -0.065], [0.1, 0.012, 0.065]),
    disc('boss-foot', 'base', 0.012, 0.012, 0.022, -0.07, 0),
    disc('rod', 'rod', 0.006, 0.022, 0.52, -0.07, 0),
    disc('rod-cap', 'rod', 0.007, 0.52, 0.524, -0.07, 0),
    box('clamp', 'clamp', [-0.084, 0.3, -0.014], [-0.056, 0.326, 0.014]),
    turned('screw', 'rod', 'z', [[0, 0], [0, 0.003], [0.02, 0.003], [0.02, 0]], [-0.07, 0.313, 0.014]),
    turned('thumb', 'clamp', 'z', [[0, 0], [0, 0.008], [0.006, 0.008], [0.006, 0]], [-0.07, 0.313, 0.034]),
    h.rod('arm', 'rod', 0.004, -0.056, 0.0, 0.313),
    turned('ring', 'rod', 'y', [[0, 0.046], [0, 0.051], [0.006, 0.051], [0.006, 0.046], [0, 0.046]], [0.047, 0.31, 0]),
  ], { base: 'paint-oxblood', rod: 'steel-stainless', clamp: 'iron-dull' })
  + { voxelGrain: 0.004 },

  // A radio receiver module, 100 mm wide, 35 mm tall and 65 mm deep: a bare aluminium box with screwed end
  // plates, a gold antenna jack and a short rubber antenna on the front, a status lamp and a pin header behind.
  h.compound('receiver', 0.18, [
    box('case', 'case', [-0.048, 0, -0.0325], [0.048, 0.035, 0.0325]),
    box('end-l', 'plate', [-0.05, 0, -0.0325], [-0.048, 0.035, 0.0325]),
    box('end-r', 'plate', [0.048, 0, -0.0325], [0.05, 0.035, 0.0325]),
    turned('jack', 'jack', 'z', [[0, 0], [0, 0.004], [0.008, 0.004], [0.008, 0]], [0.028, 0.0175, 0.0325]),
    turned('antenna', 'antenna', 'z', [[0, 0], [0, 0.0055], [0.012, 0.0055], [0.016, 0.004], [0.06, 0.004], [0.062, 0]], [0.028, 0.0175, 0.0405]),
    box('lamp', 'lamp', [-0.03, 0.022, 0.0325], [-0.026, 0.026, 0.034]),
    box('label', 'label', [-0.035, 0.035, -0.022], [0.025, 0.0355, 0.022]),
    box('header', 'header', [-0.02, 0.008, -0.0385], [0.02, 0.016, -0.0325]),
  ] + [
    turned('screw-%d-%d' % [s, c], 'plate', 'x', [[0, 0], [0, 0.0025], [0.0015, 0.0025], [0.0015, 0]], [s * 0.05 + (if s < 0 then -0.0015 else 0), [0.007, 0.028][c], [-0.024, 0.024][c]])
    for s in [-1, 1]
    for c in [0, 1]
  ], { case: 'alu-bare', plate: 'steel-stainless', jack: 'brass-polished', antenna: 'rubber-black', lamp: 'gem-green', label: 'paper-white', header: 'plastic-black' })
  + h.inHand('receiver', 'case') + { voxelGrain: 0.002 },

  // A small refrigerant cylinder, 90 mm across and 220 mm tall: a white steel body on a foot ring with a
  // domed shoulder, a blue label band and a sealed brass valve under a black cap.
  h.compound('refrigerant_tank', 0.38, [
    turned('body', 'body', 'y', [
      [0, 0], [0, 0.042], [0.004, 0.042], [0.006, 0.045], [0.16, 0.045], [0.175, 0.04], [0.188, 0.027], [0.194, 0.012],
      [0.196, 0.012], [0.196, 0],
    ]),
    turned('band', 'band', 'y', [[0, 0.044], [0, 0.0455], [0.08, 0.0455], [0.08, 0.044], [0, 0.044]], [0, 0.04, 0]),
    turned('valve', 'valve', 'y', [[0, 0], [0, 0.009], [0.008, 0.009], [0.008, 0.007], [0.016, 0.007], [0.016, 0]], [0, 0.196, 0]),
    h.rod('port', 'valve', 0.004, 0.0, 0.016, 0.204),
    turned('cap', 'cap', 'y', [[0, 0], [0, 0.009], [0.01, 0.009], [0.01, 0]], [0, 0.212, 0]),
  ], { body: 'paint-white', band: 'paint-drum-blue', valve: 'brass-polished', cap: 'plastic-black' })
  + h.inHand('refrigerant_tank', 'body') + { voxelGrain: 0.004 },

  // A clear plastic card 84 by 54 mm with a chip and gold traces set in it, lying flat.
  h.compound('robofac_test_data', 0.006, [
    box('card', 'card', [-0.042, 0, -0.027], [0.042, 0.002, 0.027]),
    box('chip', 'chip', [-0.03, 0.0015, -0.012], [-0.012, 0.0025, 0.008]),
    box('pads', 'trace', [-0.028, 0.0015, -0.01], [-0.014, 0.0026, 0.006]),
  ] + [
    box('trace-%d' % i, 'trace', [-0.012, 0.0015, -0.01 + i * 0.006], [0.034 - i * 0.006, 0.0025, -0.008 + i * 0.006])
    for i in std.range(0, 3)
  ] + [
    box('trace-end-%d' % i, 'trace', [0.032 - i * 0.006, 0.0015, -0.01 + i * 0.006], [0.034 - i * 0.006, 0.0025, 0.02])
    for i in std.range(0, 3)
  ], { card: 'plastic-clear', chip: 'plastic-black', trace: 'foil-gold' })
  + h.inHand('robofac_test_data', 'card') + { voxelGrain: 0.002 },

  // A small tin of rubber cement, 64 mm across and 105 mm tall: a red printed can with a white label band and a
  // black screw cap that carries the brush.
  h.compound('rubber_cement', 0.25, [
    turned('can', 'can', 'y', [[0, 0], [0, 0.031], [0.002, 0.032], [0.07, 0.032], [0.08, 0.026], [0.084, 0.014], [0.084, 0]]),
    turned('label', 'label', 'y', [[0, 0.0315], [0, 0.0325], [0.04, 0.0325], [0.04, 0.0315], [0, 0.0315]], [0, 0.018, 0]),
    turned('cap', 'cap', 'y', [[0, 0], [0, 0.016], [0.018, 0.016], [0.021, 0.013], [0.021, 0]], [0, 0.084, 0]),
  ] + [
    local a = i * std.pi / 6;
    box('grip-%d' % i, 'cap', [0.0162 * std.cos(a) - 0.001, 0.086, 0.0162 * std.sin(a) - 0.001], [0.0162 * std.cos(a) + 0.001, 0.1, 0.0162 * std.sin(a) + 0.001])
    for i in std.range(0, 11)
  ], { can: 'paint-red', label: 'paint-white', cap: 'plastic-black' })
  + h.inHand('rubber_cement', 'can') + { voxelGrain: 0.002 },

  // A mound of rice grown over with white mould, 120 mm across and 35 mm tall, on a woven mat 150 mm square.
  h.compound('sake_koji_rice', 0.17, [
    box('cloth', 'cloth', [-0.075, 0, -0.075], [0.075, 0.002, 0.075]),
    turned('mound', 'rice', 'y', [[0, 0], [0, 0.06], [0.008, 0.056], [0.02, 0.044], [0.03, 0.026], [0.035, 0.008], [0.036, 0]], [0, 0.002, 0]),
  ] + [
    local p = [[0.02, 0.01, 0.026], [-0.025, 0.008, 0.024], [0.004, -0.03, 0.022], [-0.012, 0.022, 0.03], [0.036, -0.02, 0.016], [-0.04, -0.018, 0.014], [0.008, 0.006, 0.034]][i];
    turned('mould-%d' % i, 'mould', 'y', [[0, 0], [0, 0.009], [0.003, 0.007], [0.005, 0]], [p[0], p[2], p[1]])
    for i in std.range(0, 6)
  ], { cloth: 'straw-wicker', rice: 'paint-cream', mould: 'cloth-sage' })
  + { voxelGrain: 0.002 },

  // A clear acrylic block 55 mm on a side with a small black six-sided crystal cast into its centre.
  h.compound('sample_t_substrate', 0.18, [
    box('block', 'block', [-0.0275, 0, -0.0275], [0.0275, 0.055, 0.0275]),
    h.prism('crystal', 'crystal', 'y', [[0.007 * std.cos(i * std.pi / 3), 0.007 * std.sin(i * std.pi / 3)] for i in std.range(0, 5)], 0.016, 0.036),
    turned('tip', 'crystal', 'y', [[0, 0], [0, 0.007], [0.008, 0]], [0, 0.036, 0]),
  ], { block: 'plastic-clear', crystal: 'obsidian' })
  + h.inHand('sample_t_substrate', 'block') + { voxelGrain: 0.002 },

  // A gnarled tree root, 220 mm long and 32 mm across at its thick end, lying along x: reddish bark, a pale cut
  // face at the thick end and three side roots.
  h.compound('sassafras_root', 0.063, [
    turned('root', 'bark', 'x', [[0, 0], [0, 0.015], [0.03, 0.016], [0.06, 0.012], [0.1, 0.013], [0.14, 0.009], [0.18, 0.007], [0.21, 0.004], [0.22, 0]], [-0.11, 0.016, 0]),
    disc('cut', 'cut', 0.013, 0, 0.002) + { axis: 'x', origin: [-0.1115, 0.016, 0] },
  ] + [
    // A side root as a flat tapered strip in the xz plane, from (xa, za) on the main root to its tip (xb, zb).
    local r = [[-0.06, 0.01, -0.02, 0.06, 0.004], [-0.01, -0.01, 0.03, -0.055, 0.0035], [0.05, 0.008, 0.08, 0.045, 0.003]][i];
    local dx = r[2] - r[0], dz = r[3] - r[1], len = std.sqrt(dx * dx + dz * dz), nx = -dz / len, nz = dx / len;
    h.prism('side-%d' % i, 'bark', 'y', [
      [r[1] + nz * r[4], r[0] + nx * r[4]],
      [r[3] + nz * 0.001, r[2] + nx * 0.001],
      [r[3] - nz * 0.001, r[2] - nx * 0.001],
      [r[1] - nz * r[4], r[0] - nx * r[4]],
    ], 0.006, 0.006 + r[4] * 1.5)
    for i in std.range(0, 2)
  ], { bark: 'leather-chestnut', cut: 'wood-pine' })
  + h.inHand('sassafras_root', 'root') + { voxelGrain: 0.002 },
]
