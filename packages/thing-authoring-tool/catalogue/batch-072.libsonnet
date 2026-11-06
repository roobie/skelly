local h = import '../compound.libsonnet';

// A short rod along x at height y and depth z.
local rodAt(id, slot, r, x0, x1, y, z) = h.rod(id, slot, r, x0, x1, y) + { origin: [x0, y, z] };
// A rod along z at height y and across x.
local rodZ(id, slot, r, z0, z1, x, y) = h.turned(id, slot, 'z', [[0, 0], [0, r], [z1 - z0, r], [z1 - z0, 0]], [x, y, z0]);
// A wire laid flat on y through the [x, z] points, `w` wide and `t` thick, one box per leg.
local wire(prefix, slot, pts, y, w=0.004, t=0.003) = [
  local a = pts[i], b = pts[i + 1];
  h.box('%s-%d' % [prefix, i], slot, [std.min(a[0], b[0]) - w / 2, y, std.min(a[1], b[1]) - w / 2], [std.max(a[0], b[0]) + w / 2, y + t, std.max(a[1], b[1]) + w / 2])
  for i in std.range(0, std.length(pts) - 2)
];
// A spring clamp lying flat with its jaws at -x: two jaws and a sleeve, `s` long.
local clamp(id, slot, x, z, s, y=0) = [
  h.box(id + '-jaw-a', slot, [x - s, y, z - s * 0.18], [x, y + s * 0.12, z - s * 0.03]),
  h.box(id + '-jaw-b', slot, [x - s, y, z + s * 0.03], [x, y + s * 0.12, z + s * 0.18]),
  h.box(id + '-sleeve', slot, [x - s * 0.55, y, z - s * 0.22], [x + s * 0.15, y + s * 0.2, z + s * 0.22]),
];

[
  // A clear plastic box 112 by 46 mm and 50 mm tall, its lid hinged up behind, holding two rows of seven
  // square cuvettes 12.5 mm across and 45 mm tall in a white rack, a printed label on the front.
  h.compound('cuvettes', 0.066, [
    h.box('rack', 'rack', [-0.056, 0, -0.023], [0.056, 0.018, 0.023]),
    h.box('lid', 'box', [-0.056, 0, -0.03], [0.056, 0.05, -0.027]),
    h.box('hinge', 'box', [-0.056, 0, -0.027], [0.056, 0.004, -0.023]),
    h.box('label', 'label', [-0.03, 0.004, 0.023], [0.03, 0.014, 0.0245]),
    h.box('label-band', 'band', [-0.03, 0.004, 0.0235], [-0.022, 0.014, 0.025]),
  ] + std.flattenArrays([
    [
      h.box('cuvette-%d-%d' % [r, c], 'cuvette', [x - 0.00625, 0.004, z - 0.00625], [x + 0.00625, 0.045, z + 0.00625]),
      h.box('grip-%d-%d' % [r, c], 'grip', [x - 0.0065, 0.038, z - 0.0065], [x + 0.0065, 0.045, z + 0.0065]),
    ]
    for r in std.range(0, 1)
    for c in std.range(0, 6)
    for x in [-0.048 + c * 0.016]
    for z in [-0.009 + r * 0.018]
  ]), { rack: 'plastic-white', box: 'plastic-clear', label: 'paper-white', band: 'plastic-blue', cuvette: 'plastic-clear', grip: 'plastic-frosted' }) + {
    voxelGrain: 0.002,
  },
  // A pair of electrodes, a copper plate and a steel plate 30 by 60 mm, held 20 mm apart in a black bar, with
  // red and black leads 0.2 m long running to two battery clamps, all laid flat.
  h.compound('electrolysis_kit', 0.21, [
    h.box('bar', 'bar', [-0.11, 0, -0.035], [-0.095, 0.012, 0.035]),
    h.box('plate-a', 'anode', [-0.17, 0, -0.03], [-0.11, 0.002, -0.004]),
    h.box('plate-b', 'cathode', [-0.17, 0, 0.004], [-0.11, 0.002, 0.03]),
    h.disc('post-a', 'post', 0.004, 0.012, 0.02, -0.102, -0.017),
    h.disc('post-b', 'post', 0.004, 0.012, 0.02, -0.102, 0.017),
  ] + wire('lead-a', 'lead-red', [[-0.102, -0.017], [-0.06, -0.04], [0.02, -0.05], [0.06, -0.03]], 0)
  + wire('lead-b', 'lead-black', [[-0.102, 0.017], [-0.05, 0.04], [0.03, 0.045], [0.06, 0.03]], 0)
  + clamp('clamp-a', 'clamp-red', 0.11, -0.03, 0.05)
  + clamp('clamp-b', 'clamp-black', 0.11, 0.03, 0.05)
  + [
    h.box('bite-a', 'jaw', [0.11 - 0.05, 0.002, -0.034], [0.11 - 0.035, 0.008, -0.026]),
    h.box('bite-b', 'jaw', [0.11 - 0.05, 0.002, 0.026], [0.11 - 0.035, 0.008, 0.034]),
  ], { bar: 'plastic-black', anode: 'copper', cathode: 'steel-stainless', post: 'brass', 'lead-red': 'plastic-red', 'lead-black': 'plastic-black', 'clamp-red': 'plastic-red', 'clamp-black': 'plastic-black', jaw: 'copper' }) + {
    voxelGrain: 0.002,
  },
  // An equilateral glass prism 30 mm on a side and 50 mm long, lying on one face.
  h.compound('glass_prism', 0.049, [
    h.prism('prism', 'glass', 'x', [[0, -0.015], [0, 0.015], [0.026, 0]], -0.025, 0.025),
  ], { glass: 'glass-clear' }) + {
    voxelGrain: 0.002,
  },
  // A heavy desk thermometer of solid glass: a column 150 mm tall and 40 by 24 mm on a 70 mm foot, a mercury
  // thread rising from a bulb in front of a white scale.
  h.compound('glass_thermometer', 0.4, [
    h.disc('foot', 'glass', 0.035, 0, 0.018),
    h.box('column', 'glass', [-0.02, 0.018, -0.012], [0.02, 0.15, 0.012]),
    h.prism('cap', 'glass', 'x', [[0.15, -0.012], [0.15, 0.012], [0.16, 0]], -0.02, 0.02),
    h.box('scale', 'scale', [-0.012, 0.035, 0.012], [0.012, 0.14, 0.0125]),
    h.box('thread', 'mercury', [-0.002, 0.03, 0.0125], [0.002, 0.11, 0.015]),
    h.turned('bulb', 'mercury', 'z', [[0, 0], [0, 0.0045], [0.002, 0.0045], [0.002, 0]], [0, 0.03, 0.0125]),
  ] + [
    h.box('tick-%d' % k, 'tick', [-0.01, 0.04 + k * 0.01, 0.0125], [if k % 2 == 0 then -0.003 else -0.005, 0.0412 + k * 0.01, 0.0135])
    for k in std.range(0, 9)
  ], { glass: 'glass-clear', scale: 'paper-white', mercury: 'metal-silver', tick: 'plastic-black' }) + {
    voxelGrain: 0.002,
  },
  // A plain glass tube 100 mm long and 12 mm across, open at both ends, lying along x.
  h.compound('glass_tube_small', 0.005, [
    h.tube('tube', 'glass', 0.0035, 0.006, -0.05, 0.05, 0.006),
  ], { glass: 'glass-clear' }) + {
    voxelGrain: 0.002,
  },
  // A dial hygrometer 46 mm across and 14 mm deep in a white case, standing on a small foot with its dial to
  // the front: a needle over dry, comfortable and wet bands.
  h.compound('hygrometer', 0.019, [
    h.turned('case', 'case', 'z', [[0, 0], [0, 0.023], [0.011, 0.023], [0.013, 0.021], [0.013, 0]], [0, 0.027, -0.007]),
    h.disc('face', 'face', 0.019, 0, 0.0135) + { axis: 'z', origin: [0, 0.027, -0.0065] },
    h.box('foot', 'case', [-0.012, 0, -0.008], [0.012, 0.005, 0.006]),
    h.box('band-dry', 'band-dry', [-0.016, 0.03, 0.0072], [-0.008, 0.038, 0.0082]),
    h.box('band-ok', 'band-ok', [-0.005, 0.036, 0.0072], [0.005, 0.042, 0.0082]),
    h.box('band-wet', 'band-wet', [0.008, 0.03, 0.0072], [0.016, 0.038, 0.0082]),
    h.box('needle', 'needle', [-0.001, 0.027, 0.0082], [0.001, 0.043, 0.0098]),
    h.disc('hub', 'needle', 0.002, 0, 0.003) + { axis: 'z', origin: [0, 0.027, 0.0072] },
  ] + [
    local a = std.pi * (0.85 - 0.7 * k / 8);
    h.box('tick-%d' % k, 'needle', [0.017 * std.cos(a) - 0.0008, 0.027 + 0.017 * std.sin(a) - 0.0008, 0.007], [0.017 * std.cos(a) + 0.0008, 0.027 + 0.017 * std.sin(a) + 0.0008, 0.0078])
    for k in std.range(0, 8)
  ], { case: 'plastic-blue', face: 'paper-white', needle: 'plastic-black', 'band-dry': 'plastic-orange', 'band-ok': 'plastic-green', 'band-wet': 'plastic-blue' }) + {
    voxelGrain: 0.002,
  },
  // A handheld light meter 140 by 66 mm and 28 mm deep lying face up: a yellow body, a dark face with a
  // display and four buttons, and a white diffuser dome over the sensor at the far end.
  h.compound('lux_meter', 0.12, [
    h.box('body', 'body', [-0.07, 0, -0.033], [0.07, 0.024, 0.033]),
    h.box('face', 'face', [-0.062, 0.024, -0.027], [0.04, 0.026, 0.027]),
    h.box('screen', 'screen', [-0.005, 0.026, -0.02], [0.034, 0.027, 0.02]),
    h.disc('sensor-ring', 'face', 0.017, 0.024, 0.028, 0.052, 0),
    h.dome('sensor', 'sensor', 0.014, 0.01, 0.004, 'y', [0.052, 0.028, 0]),
  ] + [
    h.box('button-%d' % k, 'button', [-0.05 + (k % 2) * 0.022, 0.026, -0.016 + std.floor(k / 2) * 0.02], [-0.036 + (k % 2) * 0.022, 0.029, -0.008 + std.floor(k / 2) * 0.02])
    for k in std.range(0, 3)
  ], { body: 'plastic-yellow', face: 'plastic-charcoal', screen: 'lcd-green', sensor: 'plastic-frosted', button: 'plastic-black' }) + {
    voxelGrain: 0.002,
  },
  // A round card box of filter paper discs 125 mm across: the base 22 mm deep filled with white discs, the lid
  // lying beside it with a coloured grade band round its rim.
  h.compound('filter_paper_qualitative', 0.15, [
    h.turned('box', 'box', 'y', [[0, 0], [0, 0.0625], [0.022, 0.0625], [0.022, 0.0605], [0.002, 0.0605], [0.002, 0]], [-0.066, 0, 0]),
    h.disc('papers', 'paper', 0.058, 0.002, 0.019, -0.066, 0),
    h.disc('lid', 'box', 0.064, 0, 0.012, 0.066, 0),
    h.turned('band', 'band', 'y', [[0, 0.064], [0, 0.0645], [0.008, 0.0645], [0.008, 0.064], [0, 0.064]], [0.066, 0.002, 0]),
    h.disc('label', 'label', 0.035, 0.012, 0.0125, 0.066, 0),
    h.box('label-stripe', 'band', [0.04, 0.0125, -0.005], [0.092, 0.013, 0.005]),
  ], { box: 'paperboard-tan', paper: 'paper-white', band: 'plastic-red', label: 'paper-white' }) + {
    voxelGrain: 0.002,
  },
  // A wall hygroscope on a flat walnut board 120 mm wide, 400 mm tall and 20 mm deep, front on +z: a round
  // dial at the top, a wide glazed window below showing a dark stretched hair running down past a scale to a
  // coiled spring, and a hanging ring.
  h.compound('hygroscope', 0.8, [
    h.box('board', 'case', [-0.06, 0, -0.01], [0.06, 0.4, 0.01]),
    h.turned('ring', 'brass', 'z', [[0, 0.006], [0, 0.011], [0.004, 0.011], [0.004, 0.006], [0, 0.006]], [0, 0.41, -0.002]),
    h.turned('bezel', 'brass', 'z', [[0, 0], [0, 0.048], [0.006, 0.048], [0.006, 0]], [0, 0.335, 0.01]),
    h.disc('dial', 'dial', 0.042, 0, 0.0065) + { axis: 'z', origin: [0, 0.335, 0.01] },
    h.box('needle', 'needle', [-0.0015, 0.335, 0.0165], [0.0015, 0.372, 0.019]),
    h.disc('hub', 'brass', 0.004, 0, 0.004) + { axis: 'z', origin: [0, 0.335, 0.0165] },
    h.box('window-frame', 'brass', [-0.05, 0.02, 0.01], [0.05, 0.27, 0.012]),
    h.box('window', 'back', [-0.046, 0.024, 0.01], [0.046, 0.266, 0.0125]),
    h.box('hair', 'hair', [-0.002, 0.09, 0.0125], [0.002, 0.25, 0.015]),
    h.disc('pulley', 'brass', 0.008, 0, 0.003) + { axis: 'z', origin: [0, 0.252, 0.0125] },
    h.box('scale', 'dial', [0.012, 0.1, 0.0125], [0.036, 0.24, 0.0135]),
    h.box('hook', 'spring', [-0.004, 0.04, 0.0125], [0.004, 0.046, 0.016]),
  ] + [
    local a = std.pi * (0.85 - 0.7 * k / 10);
    h.box('tick-%d' % k, 'needle', [0.034 * std.cos(a) - 0.0012, 0.335 + 0.034 * std.sin(a) - 0.0012, 0.0165], [0.034 * std.cos(a) + 0.0012, 0.335 + 0.034 * std.sin(a) + 0.0012, 0.0175])
    for k in std.range(0, 10)
  ] + [
    h.box('scale-tick-%d' % k, 'needle', [0.012, 0.105 + 0.013 * k, 0.0135], [0.024 + 0.006 * (k % 2), 0.107 + 0.013 * k, 0.0145])
    for k in std.range(0, 10)
  ] + [
    h.box('coil-%d' % k, 'spring', [-0.008, 0.048 + 0.0085 * k, 0.0125], [0.008, 0.052 + 0.0085 * k, 0.017])
    for k in std.range(0, 4)
  ], { case: 'wood-walnut', brass: 'brass', dial: 'paper-white', needle: 'plastic-black', back: 'paint-cream', hair: 'plastic-black', spring: 'steel-blued' }) + {
    voxelGrain: 0.004,
  },
  // A glass pyrolysis lamp 460 mm long: a 25 mm pipe with ground joints at both ends and a 100 mm bulb in the
  // middle holding a heating coil, a white plastic socket on top of the bulb with its cable, resting on two
  // plastic cradles.
  h.compound('ketene_lamp', 0.6, [
    rodAt('pipe', 'glass', 0.0125, -0.23, 0.23, 0.06, 0),
    rodAt('joint-a', 'joint', 0.015, -0.23, -0.19, 0.06, 0),
    rodAt('joint-b', 'joint', 0.015, 0.19, 0.23, 0.06, 0),
    h.ball('bulb', 'glass', 0.05, 0, 0.06, 0),
    rodAt('coil', 'coil', 0.016, -0.03, 0.03, 0.06, 0),
    h.disc('neck', 'glass', 0.016, 0.1, 0.12),
    h.disc('socket', 'socket', 0.02, 0.12, 0.15),
    h.disc('socket-cap', 'socket', 0.014, 0.15, 0.158),
    h.box('cable-a', 'cable', [0, 0.15, -0.004], [0.074, 0.158, 0.004]),
    h.box('cable-b', 'cable', [0.066, 0.15, -0.004], [0.074, 0.158, 0.038]),
    h.box('cable-c', 'cable', [0.066, 0, 0.03], [0.074, 0.158, 0.038]),
    h.box('cable-d', 'cable', [0.066, 0, 0.03], [0.12, 0.008, 0.038]),
    h.box('plug', 'socket', [0.12, 0, 0.02], [0.17, 0.024, 0.048]),
    h.box('pin-a', 'pin', [0.17, 0.008, 0.026], [0.186, 0.012, 0.03]),
    h.box('pin-b', 'pin', [0.17, 0.008, 0.038], [0.186, 0.012, 0.042]),
  ] + [
    h.prism('cradle-%d' % i, 'socket', 'x', [[0, -0.03], [0, 0.03], [0.05, 0.018], [0.05, -0.018]], x - 0.01, x + 0.01)
    for i in std.range(0, 1)
    for x in [[-0.15, 0.15][i]]
  ], { glass: 'glass-clear', joint: 'plastic-frosted', coil: 'copper', socket: 'plastic-white', cable: 'plastic-black', pin: 'brass' }) + {
    voxelGrain: 0.004,
  },
  // A tabletop Stirling engine 220 by 120 mm and 150 mm tall on a steel base: a horizontal glass displacer
  // cylinder over a spirit burner, a brass power cylinder beside it, and a spoked flywheel 110 mm across.
  h.compound('engineering_engine_kit', 3.5, [
    h.box('base', 'base', [-0.11, 0, -0.06], [0.11, 0.015, 0.06]),
    h.box('pillar-a', 'frame', [-0.09, 0.015, -0.006], [-0.08, 0.075, 0.006]),
    h.box('pillar-b', 'frame', [-0.005, 0.015, -0.006], [0.005, 0.075, 0.006]),
    rodAt('cylinder', 'glass', 0.022, -0.1, 0.0, 0.075, 0),
    rodAt('hot-cap', 'frame', 0.023, -0.104, -0.096, 0.075, 0),
    rodAt('cold-flange', 'frame', 0.026, -0.002, 0.008, 0.075, 0),
    rodAt('displacer', 'displacer', 0.016, -0.085, -0.02, 0.075, 0),
    h.disc('burner', 'burner', 0.02, 0.015, 0.035, -0.06, 0),
    h.disc('wick', 'wick', 0.003, 0.035, 0.045, -0.06, 0),
    h.disc('power-cyl', 'brass', 0.014, 0.015, 0.09, 0.03, -0.025),
    h.box('upright', 'frame', [0.07, 0.015, -0.006], [0.08, 0.1, 0.006]),
    rodZ('axle', 'frame', 0.004, -0.04, 0.04, 0.075, 0.1),
    h.box('rod-a', 'frame', [0.028, 0.09, -0.028], [0.075, 0.098, -0.022]),
    h.box('rod-b', 'frame', [0.008, 0.075, -0.004], [0.075, 0.081, 0.004]),
    h.turned('rim', 'wheel', 'z', [[0, 0.046], [0, 0.055], [0.008, 0.055], [0.008, 0.046], [0, 0.046]], [0.075, 0.1, 0.03]),
    h.disc('hubw', 'wheel', 0.01, 0, 0.01) + { axis: 'z', origin: [0.075, 0.1, 0.029] },
  ] + [
    local a = std.pi * k / 3;
    h.box('spoke-%d' % k, 'wheel', [0.075 + 0.028 * std.cos(a) - 0.004, 0.1 + 0.028 * std.sin(a) - 0.004, 0.031], [0.075 + 0.028 * std.cos(a) + 0.004, 0.1 + 0.028 * std.sin(a) + 0.004, 0.036])
    for k in std.range(0, 5)
  ] + [
    local a = std.pi * k / 3;
    h.box('spoke-in-%d' % k, 'wheel', [0.075 + 0.016 * std.cos(a) - 0.004, 0.1 + 0.016 * std.sin(a) - 0.004, 0.031], [0.075 + 0.016 * std.cos(a) + 0.004, 0.1 + 0.016 * std.sin(a) + 0.004, 0.036])
    for k in std.range(0, 5)
  ] + [
    local a = std.pi * k / 3;
    h.box('spoke-out-%d' % k, 'wheel', [0.075 + 0.04 * std.cos(a) - 0.004, 0.1 + 0.04 * std.sin(a) - 0.004, 0.031], [0.075 + 0.04 * std.cos(a) + 0.004, 0.1 + 0.04 * std.sin(a) + 0.004, 0.036])
    for k in std.range(0, 5)
  ], { base: 'paint-charcoal', frame: 'steel-stainless', glass: 'glass-clear', displacer: 'steel-grey', burner: 'glass-clear', wick: 'cord-cotton', brass: 'brass', wheel: 'brass-polished' }) + {
    voxelGrain: 0.002,
  },
  // A STEM building case 240 by 150 mm and 50 mm deep, open with its lid hinged up behind: six compartments of
  // gears, perforated beams, hydraulic syringes with tubing, wheels, connector pegs and a stack of blueprints.
  h.compound('engineering_makerspace_kit', 0.6, [
    h.box('floor', 'case', [-0.12, 0, -0.075], [0.12, 0.006, 0.075]),
    h.box('wall-front', 'case', [-0.12, 0, 0.071], [0.12, 0.05, 0.075]),
    h.box('wall-back', 'case', [-0.12, 0, -0.075], [0.12, 0.05, -0.071]),
    h.box('wall-left', 'case', [-0.12, 0, -0.075], [-0.116, 0.05, 0.075]),
    h.box('wall-right', 'case', [0.116, 0, -0.075], [0.12, 0.05, 0.075]),
    h.box('div-x-a', 'divider', [-0.042, 0.006, -0.071], [-0.038, 0.044, 0.071]),
    h.box('div-x-b', 'divider', [0.038, 0.006, -0.071], [0.042, 0.044, 0.071]),
    h.box('div-z', 'divider', [-0.116, 0.006, -0.002], [0.116, 0.044, 0.002]),
    h.box('lid', 'lid', [-0.12, 0.05, -0.08], [0.12, 0.2, -0.075]),
    h.box('handle', 'divider', [-0.03, 0.17, -0.087], [0.03, 0.18, -0.08]),
    h.box('latch-a', 'latch', [-0.08, 0.036, 0.075], [-0.06, 0.05, 0.079]),
    h.box('latch-b', 'latch', [0.06, 0.036, 0.075], [0.08, 0.05, 0.079]),
    // Gears, back left.
    h.disc('gear-a', 'gear-red', 0.024, 0.006, 0.014, -0.085, -0.038),
    h.disc('gear-b', 'gear-yellow', 0.014, 0.014, 0.022, -0.07, -0.03),
    h.disc('gear-c', 'gear-yellow', 0.012, 0.006, 0.016, -0.06, -0.055),
    h.disc('gear-axle', 'peg', 0.003, 0.006, 0.028, -0.085, -0.038),
  ] + [
    local a = 2 * std.pi * k / 12;
    h.box('tooth-%d' % k, 'gear-red', [-0.085 + 0.026 * std.cos(a) - 0.003, 0.006, -0.038 + 0.026 * std.sin(a) - 0.003], [-0.085 + 0.026 * std.cos(a) + 0.003, 0.014, -0.038 + 0.026 * std.sin(a) + 0.003])
    for k in std.range(0, 11)
  ] + std.flattenArrays([
    // Perforated beams, back middle.
    [h.box('beam-%d' % i, 'beam', [-0.034, 0.006 + i * 0.006, -0.062 + i * 0.014], [0.034, 0.012 + i * 0.006, -0.052 + i * 0.014])]
    + [
      h.box('hole-%d-%d' % [i, j], 'hole', [-0.03 + j * 0.0095, 0.012 + i * 0.006, -0.059 + i * 0.014], [-0.026 + j * 0.0095, 0.0125 + i * 0.006, -0.055 + i * 0.014])
      for j in std.range(0, 6)
    ]
    for i in std.range(0, 3)
  ]) + [
    // Hydraulic syringes and tubing, back right.
    rodAt('syringe-a', 'syringe', 0.008, 0.05, 0.1, 0.014, -0.05),
    rodAt('plunger-a', 'plunger', 0.006, 0.1, 0.11, 0.014, -0.05),
    rodAt('syringe-b', 'syringe', 0.008, 0.05, 0.1, 0.014, -0.022),
    rodAt('plunger-b', 'plunger', 0.006, 0.1, 0.11, 0.014, -0.022),
    h.box('tubing-a', 'tubing', [0.044, 0.006, -0.054], [0.05, 0.012, -0.018]),
    h.box('tubing-b', 'tubing', [0.044, 0.006, -0.012], [0.11, 0.012, -0.006]),
    // Wheels, front left.
    h.turned('tyre-a', 'tyre', 'y', [[0, 0.01], [0, 0.02], [0.012, 0.02], [0.012, 0.01], [0, 0.01]], [-0.09, 0.006, 0.035]),
    h.disc('hub-a', 'hub', 0.01, 0.006, 0.016, -0.09, 0.035),
    h.turned('tyre-b', 'tyre', 'y', [[0, 0.01], [0, 0.02], [0.012, 0.02], [0.012, 0.01], [0, 0.01]], [-0.064, 0.018, 0.04]),
    h.disc('hub-b', 'hub', 0.01, 0.018, 0.028, -0.064, 0.04),
  ] + [
    // Connector pegs, front middle.
    h.box('peg-%d' % k, ['peg', 'gear-red', 'beam'][k % 3], [-0.03 + (k % 5) * 0.013, 0.006 + std.floor(k / 10) * 0.006, 0.01 + std.floor(k / 5) % 2 * 0.026], [-0.022 + (k % 5) * 0.013, 0.012 + std.floor(k / 10) * 0.006, 0.03 + std.floor(k / 5) % 2 * 0.026])
    for k in std.range(0, 14)
  ] + [
    // Blueprints, front right.
    h.box('prints', 'print', [0.046, 0.006, 0.006], [0.112, 0.018, 0.068]),
    h.box('print-top', 'print-line', [0.052, 0.018, 0.016], [0.104, 0.019, 0.02]),
    h.box('print-mid', 'print-line', [0.052, 0.018, 0.03], [0.09, 0.019, 0.034]),
    h.box('print-low', 'print-line', [0.07, 0.018, 0.044], [0.076, 0.019, 0.06]),
  ], {
    case: 'plastic-grey',
    lid: 'plastic-frosted',
    divider: 'plastic-charcoal',
    latch: 'plastic-orange',
    'gear-red': 'plastic-red',
    'gear-yellow': 'plastic-yellow',
    peg: 'plastic-green',
    beam: 'plastic-blue',
    hole: 'plastic-black',
    syringe: 'plastic-clear',
    plunger: 'plastic-white',
    tubing: 'plastic-clear-blue',
    tyre: 'rubber-black',
    hub: 'plastic-white',
    print: 'paint-police-blue',
    'print-line': 'paper-white',
  }) + {
    voxelGrain: 0.002,
  },
  // A grey storage tub 280 by 190 mm and 80 mm tall with an orange-latched lid, and on it a small two-wheeled
  // robot built from the kit, facing +z: a white controller brick with a screen, two wheels, orange frame
  // beams, a rear caster and a pair of ultrasonic eyes on the front.
  h.compound('engineering_robotics_kit', 2, [
    h.box('tub', 'tub', [-0.14, 0, -0.095], [0.14, 0.07, 0.095]),
    h.box('tub-lid', 'tub-lid', [-0.144, 0.07, -0.099], [0.144, 0.08, 0.099]),
    h.box('latch-a', 'latch', [-0.144, 0.055, -0.03], [-0.14, 0.08, 0.03]),
    h.box('latch-b', 'latch', [0.14, 0.055, -0.03], [0.144, 0.08, 0.03]),
    h.box('tub-label', 'label', [-0.06, 0.02, 0.095], [0.06, 0.05, 0.097]),
    h.box('label-band', 'beam', [-0.06, 0.02, 0.0965], [-0.04, 0.05, 0.098]),
    // Robot, standing on the lid.
    h.box('frame', 'beam', [-0.045, 0.098, -0.04], [0.045, 0.106, 0.045]),
    h.box('brick', 'brick', [-0.035, 0.106, -0.035], [0.035, 0.146, 0.03]),
    h.box('screen', 'screen', [-0.022, 0.146, -0.02], [0.022, 0.147, 0.008]),
    h.box('button', 'button', [-0.006, 0.146, 0.014], [0.006, 0.149, 0.024]),
    h.box('motor-a', 'motor', [-0.05, 0.09, -0.012], [-0.03, 0.11, 0.022]),
    h.box('motor-b', 'motor', [0.03, 0.09, -0.012], [0.05, 0.11, 0.022]),
    rodAt('wheel-a', 'tyre', 0.028, -0.066, -0.052, 0.108, 0.005),
    rodAt('wheel-b', 'tyre', 0.028, 0.052, 0.066, 0.108, 0.005),
    rodAt('wheel-hub-a', 'hub', 0.012, -0.068, -0.064, 0.108, 0.005),
    rodAt('wheel-hub-b', 'hub', 0.012, 0.064, 0.068, 0.108, 0.005),
    h.ball('caster', 'hub', 0.009, 0, 0.089, -0.032),
    h.box('caster-mount', 'beam', [-0.008, 0.094, -0.04], [0.008, 0.1, -0.024]),
    h.box('sensor', 'motor', [-0.026, 0.106, 0.045], [0.026, 0.124, 0.052]),
    rodZ('eye-a', 'eye', 0.008, 0.052, 0.062, -0.013, 0.115),
    rodZ('eye-b', 'eye', 0.008, 0.052, 0.062, 0.013, 0.115),
    h.box('wire', 'wire', [-0.003, 0.124, 0.03], [0.003, 0.13, 0.05]),
  ], {
    tub: 'plastic-grey',
    'tub-lid': 'plastic-charcoal',
    latch: 'plastic-orange',
    label: 'paper-white',
    beam: 'plastic-orange',
    brick: 'plastic-white',
    screen: 'screen-black',
    button: 'plastic-red',
    motor: 'plastic-charcoal',
    tyre: 'rubber-black',
    hub: 'plastic-grey',
    eye: 'steel-stainless',
    wire: 'plastic-black',
  }) + {
    voxelGrain: 0.002,
  },
  // A makeshift water electrolyser 1 m tall: a bolted steel tank 600 by 360 mm and 400 mm deep on an angle-iron
  // stand, red and black terminals on its lid, a filler cap, and two clear bubbler columns on risers that
  // separate the hydrogen and oxygen streams into their outlet hoses.
  h.compound('electrolyzer_makeshift', 89, [
    h.box('tank', 'tank', [-0.3, 0.1, -0.18], [0.3, 0.5, 0.18]),
    h.box('lid', 'lid', [-0.31, 0.5, -0.19], [0.31, 0.52, 0.19]),
    h.box('seam', 'lid', [-0.302, 0.3, -0.182], [0.302, 0.31, 0.182]),
    h.box('label', 'label', [-0.12, 0.2, 0.18], [0.12, 0.27, 0.182]),
    h.box('label-stripe', 'terminal-red', [-0.12, 0.25, 0.181], [0.12, 0.262, 0.183]),
    h.disc('cap', 'cap', 0.03, 0.52, 0.55, 0, -0.1),
    h.disc('term-a', 'terminal-red', 0.016, 0.52, 0.56, -0.08, 0.1),
    h.disc('term-b', 'terminal-black', 0.016, 0.52, 0.56, 0.08, 0.1),
    h.box('cable-a', 'terminal-red', [-0.088, 0.52, 0.1], [-0.072, 0.53, 0.2]),
    h.box('cable-a-down', 'terminal-red', [-0.088, 0.2, 0.19], [-0.072, 0.53, 0.205]),
    h.box('cable-b', 'terminal-black', [0.072, 0.52, 0.1], [0.088, 0.53, 0.2]),
    h.box('cable-b-down', 'terminal-black', [0.072, 0.0, 0.19], [0.088, 0.53, 0.205]),
    h.box('cable-a-floor', 'terminal-red', [-0.088, 0.0, 0.19], [-0.072, 0.2, 0.205]),
    h.box('gauge-stem', 'cap', [0.12, 0.52, -0.11], [0.13, 0.58, -0.1]),
    h.turned('gauge', 'cap', 'z', [[0, 0], [0, 0.035], [0.02, 0.035], [0.02, 0]], [0.125, 0.615, -0.115]),
    h.disc('gauge-face', 'label', 0.03, 0, 0.0205) + { axis: 'z', origin: [0.125, 0.615, -0.115] },
  ] + std.flattenArrays([
    [
      h.box('leg-%d-%d' % [i, j], 'stand', [x - 0.025, 0, z - 0.025], [x + 0.025, 0.1, z + 0.025]),
    ]
    for i in std.range(0, 1)
    for j in std.range(0, 1)
    for x in [[-0.28, 0.28][i]]
    for z in [[-0.16, 0.16][j]]
  ]) + [
    h.box('rail-a', 'stand', [-0.32, 0.08, -0.2], [0.32, 0.1, -0.16]),
    h.box('rail-b', 'stand', [-0.32, 0.08, 0.16], [0.32, 0.1, 0.2]),
  ] + [
    h.disc('bolt-%d' % k, 'bolt', 0.008, 0.52, 0.528, -0.29 + k * 0.0725, -0.175)
    for k in std.range(0, 8)
  ] + [
    h.disc('bolt-f-%d' % k, 'bolt', 0.008, 0.52, 0.528, -0.29 + k * 0.0725, 0.175)
    for k in std.range(0, 8)
  ] + std.flattenArrays([
    [
      h.disc('riser-%d' % i, 'cap', 0.012, 0.52, 0.62, x, 0),
      h.disc('column-%d' % i, 'column', 0.055, 0.62, 0.95, x, 0),
      h.disc('water-%d' % i, 'water', 0.056, 0.62, 0.8, x, 0),
      h.disc('column-cap-%d' % i, 'cap', 0.06, 0.95, 0.975, x, 0),
      h.disc('column-base-%d' % i, 'cap', 0.06, 0.6, 0.625, x, 0),
      h.disc('outlet-%d' % i, 'cap', 0.008, 0.975, 1.0, x, 0),
      h.box('tag-%d' % i, ['terminal-red', 'tag-blue'][i], [x - 0.03, 0.85, 0.055], [x + 0.03, 0.88, 0.058]),
      h.box('hose-%d' % i, 'hose', [x - 0.007, 0.985, -0.007], [x + 0.007, 0.997, 0.0] + [0] * 0) + { max: [x + 0.007, 0.997, 0.007] },
      h.box('hose-out-%d' % i, 'hose', [std.min(x, x * 1.45) - 0.007, 0.985, -0.007], [std.max(x, x * 1.45) + 0.007, 0.997, 0.007]),
      h.box('hose-down-%d' % i, 'hose', [x * 1.45 - 0.007, 0.53, -0.007], [x * 1.45 + 0.007, 0.997, 0.007]),
    ]
    for i in std.range(0, 1)
    for x in [[-0.2, 0.2][i]]
  ]), {
    tank: 'steel-grey',
    lid: 'steel-bright',
    stand: 'paint-charcoal',
    label: 'paper-white',
    cap: 'steel-stainless',
    bolt: 'steel-blued',
    'terminal-red': 'plastic-red',
    'terminal-black': 'plastic-black',
    'tag-blue': 'plastic-blue',
    column: 'plastic-clear',
    water: 'water',
    hose: 'plastic-clear-blue',
  }) + {
    voxelGrain: 0.008,
  },
  // A lab cracking reactor taken down and strapped to a 1.2 by 1.0 m pallet: the main reactor column in a
  // 1 m section with flanged ends, a long riser pipe, a cyclone separator with its cone, a bundle of short
  // flanged pipe spools, and the controller cabinet, about 0.75 m high in all.
  h.compound('catalytic_cracking_reactor', 350, [
    h.box('deck', 'pallet', [-0.6, 0.1, -0.5], [0.6, 0.125, 0.5]),
  ] + [
    h.box('runner-%d' % i, 'pallet', [-0.6, 0, z - 0.05], [0.6, 0.1, z + 0.05])
    for i in std.range(0, 2)
    for z in [[-0.45, 0, 0.45][i]]
  ] + [
    // Reactor column section.
    rodAt('column', 'vessel', 0.2, -0.5, 0.5, 0.33, -0.25),
    rodAt('column-flange-a', 'flange', 0.24, -0.52, -0.48, 0.33, -0.25),
    rodAt('column-flange-b', 'flange', 0.24, 0.48, 0.52, 0.33, -0.25),
    rodAt('column-nozzle', 'flange', 0.05, -0.1, 0.0, 0.53, -0.25) + { axis: 'y', profile: [[0, 0], [0, 0.05], [0.06, 0.05], [0.06, 0]], origin: [-0.05, 0.52, -0.25] },
    rodAt('column-band-a', 'strap', 0.205, -0.25, -0.2, 0.33, -0.25),
    rodAt('column-band-b', 'strap', 0.205, 0.2, 0.25, 0.33, -0.25),
    // Riser pipe.
    rodAt('riser', 'vessel', 0.075, -0.55, 0.45, 0.2, 0.08),
    rodAt('riser-flange-a', 'flange', 0.11, -0.57, -0.53, 0.2, 0.08),
    rodAt('riser-flange-b', 'flange', 0.11, 0.43, 0.47, 0.2, 0.08),
    // Cyclone with its cone toward +x.
    h.turned('cyclone', 'vessel', 'x', [[0, 0], [0, 0.13], [0.3, 0.13], [0.5, 0.03], [0.56, 0.03], [0.56, 0]], [-0.4, 0.255, 0.33]),
    rodAt('cyclone-flange', 'flange', 0.15, -0.42, -0.38, 0.255, 0.33),
  ] + [
    // Pipe spools, stacked on the riser side.
    rodAt('spool-%d' % k, 'flange', 0.04, 0.0, 0.36, 0.3 + p.y, 0.08 + p.z)
    for k in std.range(0, 2)
    for p in [h.hexPack(0.04, [2, 1])[k]]
  ] + [
    // Controller cabinet on the front right.
    h.box('cabinet', 'cabinet', [0.15, 0.125, 0.2], [0.55, 0.45, 0.48]),
    h.box('cabinet-door', 'door', [0.17, 0.145, 0.48], [0.53, 0.43, 0.49]),
    h.box('cabinet-screen', 'screen', [0.22, 0.32, 0.49], [0.34, 0.4, 0.495]),
    h.box('cabinet-tag', 'tag', [0.38, 0.33, 0.49], [0.5, 0.39, 0.495]),
    h.box('cabinet-handle', 'flange', [0.49, 0.2, 0.49], [0.505, 0.3, 0.5]),
    // Straps over the load.
    h.box('strap-a', 'strap', [-0.32, 0.535, -0.5], [-0.28, 0.54, 0.5]),
    h.box('strap-b', 'strap', [0.28, 0.535, -0.5], [0.32, 0.54, 0.2]),
    h.box('strap-a-front', 'strap', [-0.32, 0.1, 0.5], [-0.28, 0.54, 0.505]),
    h.box('strap-a-back', 'strap', [-0.32, 0.1, -0.505], [-0.28, 0.54, -0.5]),
    h.box('strap-b-back', 'strap', [0.28, 0.1, -0.505], [0.32, 0.54, -0.5]),
    h.box('buckle', 'buckle', [-0.33, 0.3, 0.505], [-0.27, 0.36, 0.515]),
  ], {
    pallet: 'wood-pine',
    vessel: 'steel-grey',
    flange: 'steel-bright',
    strap: 'nylon-coyote',
    buckle: 'steel-blued',
    cabinet: 'paint-cream',
    door: 'paint-cream',
    screen: 'screen-black',
    tag: 'paint-red',
  }) + {
    voxelGrain: 0.02,
  },
]
