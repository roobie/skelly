local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local prism = h.prism;
// A flat strip in the xz plane from [xa, za] to [xb, zb], `w` wide, between heights y0 and y1.
local strip(id, slot, a, b, w, y0, y1) =
  local dx = b[0] - a[0];
  local dz = b[1] - a[1];
  local len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2;
  local nz = dx / len * w / 2;
  prism(id, slot, 'y', [[a[1] + nz, a[0] + nx], [b[1] + nz, b[0] + nx], [b[1] - nz, b[0] - nx], [a[1] - nz, a[0] - nx]], y0, y1);
// A thin cord in the xy plane from [xa, ya] to [xb, yb], `w` thick, centred on z.
local cord(id, slot, a, b, w, z=0) =
  local dx = b[0] - a[0];
  local dy = b[1] - a[1];
  local len = std.sqrt(dx * dx + dy * dy);
  local nx = -dy / len * w / 2;
  local ny = dx / len * w / 2;
  prism(id, slot, 'z', [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], z - w / 2, z + w / 2);
// A punched-tin ember carrier, 70 mm across and 72 mm tall with its lid on, a wire bail over the top. `hole` paints
// the air holes: dark while it is cold, glowing while an ember smoulders inside.
local emberCarrier(id, hole) = h.compound(id, 0.2, [
  turned('can', 'tin', 'y', [[0, 0], [0, 0.034], [0.003, 0.035], [0.060, 0.035], [0.060, 0]]),
  turned('lid', 'tin', 'y', [[0.058, 0], [0.058, 0.0365], [0.072, 0.0365], [0.072, 0]]),
  turned('rim', 'rim', 'y', [[0.058, 0.0345], [0.058, 0.0375], [0.062, 0.0375], [0.062, 0.0345], [0.058, 0.0345]]),
  box('bail-left', 'bail', [-0.039, 0.040, -0.002], [-0.037, 0.090, 0.002]),
  box('bail-right', 'bail', [0.037, 0.040, -0.002], [0.039, 0.090, 0.002]),
  box('bail-top', 'bail', [-0.039, 0.088, -0.002], [0.039, 0.090, 0.002]),
  box('lug-left', 'bail', [-0.039, 0.036, -0.004], [-0.034, 0.044, 0.004]),
  box('lug-right', 'bail', [0.034, 0.036, -0.004], [0.039, 0.044, 0.004]),
] + [
  // Two rings of punched holes round the wall, painted flush on the surface.
  local a = (i * 30 + r * 15) * std.pi / 180;
  box('hole-%d-%d' % [r, i], 'hole', [0.034 * std.sin(a) - 0.003, 0.016 + r * 0.022, 0.034 * std.cos(a) - 0.003], [0.034 * std.sin(a) + 0.003, 0.022 + r * 0.022, 0.034 * std.cos(a) + 0.003])
  for r in [0, 1]
  for i in std.range(0, 11)
] + [
  h.disc('top-hole-%d' % i, 'hole', 0.003, 0.0705, 0.0725, 0.018 * std.cos(i * std.pi / 3), 0.018 * std.sin(i * std.pi / 3))
  for i in std.range(0, 5)
] + [h.disc('top-hole-c', 'hole', 0.003, 0.0705, 0.0725)], { tin: 'steel-galvanised', rim: 'steel-grey', bail: 'steel-bright', hole: hole }) + { voxelGrain: 0.002 };
[
  // A home-made firestarter, 115 mm long: a tape-wrapped stick grip with two steel leads that end in a small
  // wire coil, glowing when the bare tails are touched to a battery.
  h.compound('crude_firestarter', 0.031, [
    h.rod('grip', 'grip', 0.007, 0, 0.060, 0.007),
    box('lead-a', 'lead', [-0.020, 0.0055, 0.002], [0.098, 0.0085, 0.005]),
    box('lead-b', 'lead', [-0.020, 0.0055, -0.005], [0.098, 0.0085, -0.002]),
    box('bridge', 'coil', [0.094, 0.004, -0.006], [0.098, 0.010, 0.006]),
  ] + [
    h.tube('coil-%d' % i, 'coil', 0.002, 0.0045, 0.098 + i * 0.004, 0.100 + i * 0.004, 0.007, 0)
    for i in std.range(0, 4)
  ] + [
    h.rod('coil-core', 'coil', 0.0015, 0.098, 0.116, 0.007)
  ] + [
    box('tape-end-a', 'tape', [0.002, 0.0, -0.0075], [0.010, 0.014, 0.0075]),
    box('tape-end-b', 'tape', [0.050, 0.0, -0.0075], [0.058, 0.014, 0.0075]),
  ], { grip: 'wood-pine', lead: 'steel-bright', coil: 'steel-heat-tint', tape: 'tape-grey' }) + { handling: h.gripOn('crude_firestarter', 'grip') } + { voxelGrain: 0.002 },

  // A rechargeable arc lighter, 34 by 13 mm and 58 mm tall, its flip lid tipped back to show the two electrodes;
  // 69 mm with the lid shut.
  h.compound('electric_lighter', 0.044, [
    box('body', 'case', [-0.017, 0, -0.0065], [0.017, 0.056, 0.0065]),
    box('collar', 'trim', [-0.017, 0.056, -0.0065], [0.017, 0.058, 0.0065]),
    box('head', 'head', [-0.012, 0.058, -0.004], [0.012, 0.064, 0.004]),
    box('electrode-a', 'electrode', [-0.008, 0.064, -0.001], [-0.004, 0.070, 0.001]),
    box('electrode-b', 'electrode', [0.004, 0.064, -0.001], [0.008, 0.070, 0.001]),
    box('lid', 'case', [-0.017, 0.056, -0.0185], [0.017, 0.072, -0.0065]),
    box('hinge', 'trim', [-0.015, 0.054, -0.0085], [0.015, 0.058, -0.0065]),
    box('button', 'trim', [-0.006, 0.030, 0.0065], [0.006, 0.042, 0.0075]),
    box('led', 'led', [-0.002, 0.020, 0.0065], [0.002, 0.022, 0.0075]),
    box('port', 'port', [-0.005, 0.0, -0.0015], [0.005, 0.001, 0.0015]),
  ], { case: 'steel-grey', trim: 'plastic-black', head: 'ceramic-white', electrode: 'steel-stainless', led: 'crystal-glow-blue', port: 'plastic-black' }) + h.inHand('electric_lighter', 'body') + { voxelGrain: 0.002 },

  // A bow drill set up to use: a 240 mm notched hearth board, a 200 mm spindle standing in its socket, a palm
  // block on top and a 450 mm curved bow with its cord taking a turn round the spindle.
  h.compound('fire_drill', 0.19, [
    box('hearth', 'board', [-0.12, 0, -0.025], [0.12, 0.016, 0.025]),
    box('notch', 'char', [-0.066, 0.002, 0.012], [-0.054, 0.0165, 0.0255]),
    h.disc('socket-b', 'char', 0.010, 0.0155, 0.0165, 0.040, 0),
    h.disc('socket-c', 'char', 0.010, 0.0155, 0.0165, 0.080, 0),
    h.disc('spindle', 'spindle', 0.009, 0.016, 0.216, -0.060, 0),
    turned('block', 'board', 'y', [[0, 0], [0, 0.028], [0.018, 0.024], [0.026, 0]], [-0.060, 0.216, 0]),
    strip('cord-a', 'cord', [-0.300, 0.040], [-0.060, 0.0095], 0.003, 0.098, 0.102),
    strip('cord-b', 'cord', [-0.060, 0.0095], [0.150, 0.040], 0.003, 0.098, 0.102),
  ] + [
    local x0 = -0.300 + i * 0.075;
    local x1 = x0 + 0.075;
    local z(x) = 0.040 + 0.045 * std.sin(std.pi * (x + 0.300) / 0.450);
    strip('bow-%d' % i, 'bow', [x0, z(x0)], [x1, z(x1)], 0.014, 0.093, 0.107)
    for i in std.range(0, 5)
  ], { board: 'wood-pine', char: 'coal-black', spindle: 'wood-birch', bow: 'bark', cord: 'cord-cotton' }) + { handling: h.gripOn('fire_drill', 'bow-1') } + { voxelGrain: 0.002 },

  // A pump drill standing on its hearth board: a 500 mm shaft through a 140 mm stone flywheel, a 400 mm
  // crossbar riding on the shaft and a cord from the shaft top to each end of the bar.
  h.compound('fire_drill_large', 1.4, [
    box('hearth', 'board', [-0.10, 0, -0.03], [0.10, 0.016, 0.03]),
    h.disc('socket', 'char', 0.011, 0.0155, 0.0165, 0.050, 0),
    box('notch', 'char', [-0.006, 0.002, 0.018], [0.006, 0.0165, 0.0305]),
    h.disc('shaft', 'shaft', 0.010, 0.016, 0.500),
    h.disc('flywheel', 'stone', 0.070, 0.090, 0.120),
    box('crossbar', 'bar', [-0.200, 0.300, -0.013], [0.200, 0.318, 0.013]),
    h.disc('hub', 'bar', 0.020, 0.296, 0.322),
    cord('cord-a', 'cord', [0, 0.495], [-0.190, 0.318], 0.003),
    cord('cord-b', 'cord', [0, 0.495], [0.190, 0.318], 0.003),
    h.disc('cap', 'bar', 0.012, 0.495, 0.505),
  ], { board: 'wood-pine', char: 'coal-black', shaft: 'wood-birch', stone: 'stone-grey', bar: 'wood-oak', cord: 'cord-cotton' }) + { handling: h.gripOn('fire_drill_large', 'crossbar') } + { voxelGrain: 0.004 },

  // A hardwood fire piston, 200 mm long: a 30 mm bore cylinder with the piston drawn a little way out by its
  // knob, and a small lidded tinder pot beside it.
  h.compound('fire_piston', 0.078, [
    turned('cylinder', 'wood', 'x', [[0, 0], [0, 0.012], [0.004, 0.015], [0.140, 0.015], [0.140, 0]], [0, 0.015, 0]),
    turned('ferrule', 'ferrule', 'x', [[0, 0], [0, 0.0155], [0.008, 0.0155], [0.008, 0]], [0.130, 0.015, 0]),
    h.rod('piston', 'rod', 0.008, 0.140, 0.162, 0.015),
    turned('knob', 'wood', 'x', [[0, 0], [0, 0.012], [0.008, 0.017], [0.034, 0.017], [0.038, 0.010], [0.038, 0]], [0.162, 0.015, 0]),
    h.disc('pot', 'pot', 0.011, 0, 0.028, 0.070, 0.036),
    h.disc('pot-lid', 'wood', 0.0115, 0.028, 0.034, 0.070, 0.036),
  ], { wood: 'wood-walnut', ferrule: 'cord-cotton', rod: 'wood-birch', pot: 'bone' }) + { handling: h.gripOn('fire_piston', 'cylinder') } + { voxelGrain: 0.002 },

  // A C-shaped steel striker, 80 by 30 mm, beside a fist-sized flint knapped to a working edge.
  h.compound('flint_steel', 0.16, [
    box('bar', 'steel', [-0.040, 0, -0.016], [0.040, 0.006, -0.008]),
    box('arm-a', 'steel', [-0.040, 0, -0.016], [-0.032, 0.006, 0.006]),
    box('arm-b', 'steel', [0.032, 0, -0.016], [0.040, 0.006, 0.006]),
    box('curl-a', 'steel', [-0.032, 0, -0.002], [-0.022, 0.006, 0.006]),
    box('curl-b', 'steel', [0.022, 0, -0.002], [0.032, 0.006, 0.006]),
    prism('flint', 'flint', 'y', [[0.020, -0.030], [0.016, 0.004], [0.030, 0.026], [0.050, 0.020], [0.058, -0.004], [0.046, -0.028]], 0, 0.018),
    prism('flint-top', 'flint', 'y', [[0.026, -0.020], [0.024, 0.004], [0.034, 0.016], [0.046, 0.012], [0.050, -0.006], [0.042, -0.020]], 0.018, 0.026),
    prism('cortex', 'cortex', 'y', [[0.050, -0.020], [0.056, -0.004], [0.050, 0.012], [0.046, -0.004]], 0, 0.012),
  ], { steel: 'steel-heat-tint', flint: 'obsidian', cortex: 'chalk-white' }) + { handling: h.gripOn('flint_steel', 'bar') } + { voxelGrain: 0.002 },

  // A rough ground glass lens, 56 mm across and 12 mm thick at the middle.
  h.compound('lens_crude', 0.036, [
    turned('lens', 'glass', 'y', [[0, 0], [0.002, 0.018], [0.004, 0.025], [0.006, 0.028], [0.008, 0.025], [0.010, 0.018], [0.012, 0]]),
  ], { glass: 'glass-grey' }) + { voxelGrain: 0.002 },

  // A reading magnifier: a 90 mm glass lens in a black rim on a 120 mm handle, lying flat; 240 mm overall.
  h.compound('magnifying_glass', 0.17, [
    turned('lens', 'glass', 'y', [[0, 0], [0, 0.045], [0.008, 0.045], [0.008, 0]], [0, 0.002, 0]),
    turned('rim', 'rim', 'y', [[0, 0.044], [0, 0.051], [0.012, 0.051], [0.012, 0.044], [0, 0.044]]),
    box('neck', 'rim', [0.049, 0.001, -0.009], [0.066, 0.011, 0.009]),
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.009], [0.010, 0.012], [0.100, 0.013], [0.112, 0.010], [0.120, 0]], [0.064, 0.006, 0]),
  ], { glass: 'glass-clear', rim: 'plastic-black', handle: 'wood-walnut' }) + { handling: h.gripOn('magnifying_glass', 'handle') } + { voxelGrain: 0.002 },

  // A flip-top petrol lighter, 38 by 13 mm and 36 mm tall, the lid swung open on its side hinge to show the
  // windproof chimney and striker wheel.
  h.compound('ref_lighter', 0.057, [
    box('case', 'case', [-0.019, 0, -0.0065], [0.019, 0.036, 0.0065]),
    box('chimney', 'chimney', [-0.016, 0.036, -0.0055], [0.008, 0.054, 0.0055]),
  ] + [
    box('vent-%d-%s' % [i, s[0]], 'vent', [-0.014 + i * 0.006, 0.040, s[1]], [-0.011 + i * 0.006, 0.050, s[2]])
    for i in std.range(0, 3)
    for s in [['f', 0.0055, 0.0060], ['b', -0.0060, -0.0055]]
  ] + [
    box('wick', 'wick', [-0.006, 0.054, -0.002], [-0.002, 0.058, 0.002]),
    turned('wheel', 'wheel', 'z', [[0, 0], [0, 0.0045], [0.008, 0.0045], [0.008, 0]], [0.012, 0.052, -0.004]),
    box('wheel-post', 'chimney', [0.009, 0.036, -0.004], [0.016, 0.050, 0.004]),
    box('lid-top', 'case', [0.032, 0.036, -0.0065], [0.034, 0.074, 0.0065]),
    box('lid-front', 'case', [0.019, 0.036, 0.0045], [0.034, 0.074, 0.0065]),
    box('lid-back', 'case', [0.019, 0.036, -0.0065], [0.034, 0.074, -0.0045]),
    box('lid-end', 'case', [0.019, 0.072, -0.0065], [0.034, 0.074, 0.0065]),
    box('hinge', 'chimney', [0.018, 0.033, -0.003], [0.022, 0.039, 0.003]),
  ], { case: 'alu-bare', chimney: 'steel-stainless', vent: 'plastic-black', wick: 'cloth-cream', wheel: 'steel-grey' }) + h.inHand('ref_lighter', 'case') + { voxelGrain: 0.002 },

  // A refillable butane torch lighter, 150 mm tall: a grip that takes a butane can through its base, a head with
  // a short nozzle pointing forward, a red trigger and a side safety slide.
  h.compound('ref_lighter_butane', 0.25, [
    box('grip', 'body', [-0.018, 0.006, -0.022], [0.018, 0.110, 0.022]),
    h.disc('can-base', 'can', 0.017, 0, 0.006),
    box('head', 'head', [-0.020, 0.110, -0.026], [0.020, 0.140, 0.024]),
    turned('nozzle', 'nozzle', 'z', [[0, 0], [0, 0.010], [0.036, 0.009], [0.044, 0.007], [0.044, 0]], [0, 0.125, 0.024]),
    turned('nozzle-ring', 'head', 'z', [[0, 0], [0, 0.0115], [0.004, 0.0115], [0.004, 0]], [0, 0.125, 0.024]),
    box('trigger', 'trigger', [-0.008, 0.074, 0.022], [0.008, 0.104, 0.032]),
    box('guard', 'head', [-0.010, 0.064, 0.022], [0.010, 0.070, 0.036]),
    box('safety', 'safety', [0.018, 0.112, -0.004], [0.022, 0.124, 0.010]),
    box('gas-knob', 'safety', [-0.022, 0.116, -0.012], [-0.020, 0.132, 0.004]),
  ], { body: 'plastic-black', can: 'paint-red', head: 'alu-bare', nozzle: 'steel-stainless', trigger: 'plastic-red', safety: 'plastic-grey' }) + h.inHand('ref_lighter_butane', 'grip') + { voxelGrain: 0.002 },

  // A disposable mini lighter, 18 by 10 mm and 47 mm tall.
  h.item('small_lighter', 'lighter', 0.011, { width: 0.018, height: 0.040, depth: 0.010, capHeight: 0.007 }, { body: 'plastic-clear-pink', cap: 'steel-grey', wheel: 'steel-grey' }) + h.inHand('small_lighter', 'body') + { voxelGrain: 0.002 },

  // One storm match, 70 mm long: a square stick with a long thick head of striking compound and a bright tip.
  h.compound('survival_match', 0.001, [
    box('stick', 'stick', [0, 0, -0.002], [0.070, 0.004, 0.002]),
    h.rod('head', 'head', 0.0045, 0.035, 0.066, 0.002),
    turned('tip', 'tip', 'x', [[0, 0], [0, 0.0045], [0.003, 0.004], [0.006, 0]], [0.066, 0.002, 0]),
  ], { stick: 'wood-pine', head: 'brick-buff', tip: 'paint-red' }) + { handling: h.gripOn('survival_match', 'stick') } + { voxelGrain: 0.002 },

  emberCarrier('tinderbox', 'coal-black'),
  emberCarrier('tinderbox_on', 'glow-flame'),
]
