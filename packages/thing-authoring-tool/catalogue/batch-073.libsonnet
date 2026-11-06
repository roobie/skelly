local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
local rod = h.rod;
// A cylinder along z from `z0` to `z1`, its axis at (x, y).
local zrod(id, slot, r, z0, z1, x, y) = turned(id, slot, 'z', [[0, 0], [0, r], [z1 - z0, r], [z1 - z0, 0]], [x, y, z0]);
// A round rod from p0 to p1 ([x, y, z]) drawn as `n` short cylinders standing on y, for slanted tubes and leads.
local slant(id, slot, r, p0, p1, n) = [
  local t0 = i / n, t1 = (i + 1) / n;
  disc('%s-%d' % [id, i], slot, r, p0[1] + (p1[1] - p0[1]) * t0, p0[1] + (p1[1] - p0[1]) * t1 + 0.001, p0[0] + (p1[0] - p0[0]) * (t0 + t1) / 2, p0[2] + (p1[2] - p0[2]) * (t0 + t1) / 2)
  for i in std.range(0, n - 1)
];
// A lead lying flat on the bench: square sections `w` wide along a polyline of [x, z] points at height y.
local lead(id, slot, pts, w, y) = std.flattenArrays([
  local a = pts[i], b = pts[i + 1];
  [box('%s-%d' % [id, i], slot, [std.min(a[0], b[0]) - w / 2, y, std.min(a[1], b[1]) - w / 2], [std.max(a[0], b[0]) + w / 2, y + w, std.max(a[1], b[1]) + w / 2])]
  for i in std.range(0, std.length(pts) - 2)
]);
// A test probe lying along z with its tip at +z: a coloured grip with a finger guard and a steel point.
local probe(id, slot, x, z0, y=0.006) = [
  zrod(id + '-grip', slot, 0.005, z0, z0 + 0.1, x, y),
  zrod(id + '-guard', slot, 0.0075, z0 + 0.075, z0 + 0.08, x, y + 0.0015),
  zrod(id + '-tip', 'tip', 0.0012, z0 + 0.1, z0 + 0.125, x, y),
];
[
  // A compound microscope 340 mm tall on a cast base 140 mm by 190 mm: a back pillar and arm, a square stage with
  // slide clips over a condenser and lamp, a turret of three objectives and an upright eyepiece tube, front on +z.
  h.compound('microscope', 5, [
    box('base', 'body', [-0.07, 0, -0.1], [0.07, 0.03, 0.06]),
    disc('base-front', 'body', 0.07, 0, 0.03, 0, 0.06),
    disc('lamp', 'body', 0.022, 0.03, 0.06, 0, 0.02),
    disc('lamp-lens', 'glass', 0.016, 0.06, 0.064, 0, 0.02),
    box('pillar', 'body', [-0.025, 0.03, -0.1], [0.025, 0.26, -0.055]),
    box('arm', 'body', [-0.02, 0.24, -0.1], [0.02, 0.285, 0.0]),
    rod('coarse', 'knob', 0.02, -0.055, 0.055, 0.16) + { origin: [-0.055, 0.16, -0.075] },
    rod('fine', 'knob', 0.012, -0.065, 0.065, 0.16) + { origin: [-0.065, 0.16, -0.075] },
    box('stage-carrier', 'body', [-0.02, 0.12, -0.055], [0.02, 0.135, -0.035]),
    box('stage', 'stage', [-0.065, 0.135, -0.04], [0.065, 0.145, 0.085]),
    disc('condenser', 'body', 0.016, 0.1, 0.135, 0, 0.02),
    box('slide', 'glass', [-0.038, 0.145, 0.007], [0.038, 0.147, 0.033]),
    box('clip-a', 'clip', [-0.05, 0.145, 0.0], [-0.03, 0.149, 0.006]),
    box('clip-b', 'clip', [0.03, 0.145, 0.0], [0.05, 0.149, 0.006]),
    disc('turret', 'body', 0.032, 0.235, 0.255, 0, 0.02),
    disc('objective-a', 'objective', 0.009, 0.195, 0.236, 0, 0.042),
    disc('objective-a-band', 'band', 0.0095, 0.215, 0.22, 0, 0.042),
    disc('objective-b', 'objective', 0.008, 0.205, 0.236, -0.019, 0.009),
    disc('objective-c', 'objective', 0.007, 0.212, 0.236, 0.019, 0.009),
    disc('head', 'body', 0.025, 0.255, 0.285, 0, 0.02),
    disc('tube', 'body', 0.016, 0.285, 0.32, 0, 0.02),
    disc('eyepiece', 'knob', 0.013, 0.32, 0.34, 0, 0.02),
  ], { body: 'enamel-white', knob: 'plastic-black', stage: 'plastic-black', glass: 'glass-clear', clip: 'steel-stainless', objective: 'steel-stainless', band: 'paint-red' })
  + { voxelGrain: 0.004 },

  // A stereo dissecting microscope 330 mm tall: a flat base 200 mm by 240 mm with a round white stage plate, a
  // steel pillar at the back, a focus block with knobs, and a wide head with two eyepieces angled toward the user.
  h.compound('microscope_dissecting', 4, [
    box('base', 'base', [-0.1, 0, -0.13], [0.1, 0.035, 0.11]),
    disc('plate', 'plate', 0.05, 0.035, 0.039, 0, 0.03),
    box('clip-a', 'clip', [-0.06, 0.039, 0.0], [-0.03, 0.042, 0.008]),
    box('clip-b', 'clip', [0.03, 0.039, 0.0], [0.06, 0.042, 0.008]),
    disc('pillar', 'pillar', 0.013, 0.035, 0.3, 0, -0.1),
    box('focus', 'body', [-0.03, 0.17, -0.12], [0.03, 0.24, -0.07]),
    rod('knob', 'knob', 0.022, -0.055, 0.055, 0.2) + { origin: [-0.055, 0.2, -0.095] },
    box('carrier', 'body', [-0.022, 0.19, -0.07], [0.022, 0.225, -0.03]),
    box('head', 'body', [-0.055, 0.18, -0.035], [0.055, 0.24, 0.045]),
    rod('zoom', 'knob', 0.018, -0.07, 0.07, 0.215) + { origin: [-0.07, 0.215, 0.01] },
    disc('objective', 'body', 0.032, 0.16, 0.18, 0, 0.012),
    disc('objective-lens', 'glass', 0.026, 0.157, 0.16, 0, 0.012),
    box('prism-housing', 'body', [-0.045, 0.24, -0.025], [0.045, 0.265, 0.035]),
  ] + std.flattenArrays([
    slant('eyepiece-' + s, 'body', 0.016, [x, 0.262, 0.015], [x, 0.305, 0.05], 5)
    + [disc('cup-' + s, 'knob', 0.015, 0.302, 0.318, x, 0.054)]
    for s in ['l', 'r']
    for x in [if s == 'l' then -0.03 else 0.03]
  ]), { body: 'enamel-white', base: 'plastic-charcoal', knob: 'plastic-black', pillar: 'steel-stainless', plate: 'paint-white', clip: 'steel-stainless', glass: 'glass-clear' })
  + { voxelGrain: 0.004 },

  // A handheld digital multimeter 150 mm by 80 mm and 40 mm thick lying face up in a yellow rubber holster: a
  // display at the top, a rotary range dial, three probe sockets, and red and black probes on their leads.
  h.compound('multimeter', 0.34, [
    box('holster', 'holster', [-0.04, 0, -0.075], [0.04, 0.032, 0.075]),
    box('face', 'face', [-0.034, 0.032, -0.069], [0.034, 0.035, 0.069]),
    box('window', 'face', [-0.03, 0.035, 0.025], [0.03, 0.037, 0.062]),
    box('display', 'lcd', [-0.027, 0.037, 0.03], [0.027, 0.0375, 0.058]),
    box('digits', 'digit', [-0.02, 0.0375, 0.038], [0.02, 0.038, 0.05]),
    box('key-a', 'key', [-0.028, 0.035, 0.012], [-0.012, 0.038, 0.02]),
    box('key-b', 'key', [-0.008, 0.035, 0.012], [0.008, 0.038, 0.02]),
    box('key-c', 'key', [0.012, 0.035, 0.012], [0.028, 0.038, 0.02]),
    disc('dial-ring', 'key', 0.023, 0.035, 0.037, 0, -0.018),
    disc('dial', 'knob', 0.018, 0.037, 0.043, 0, -0.018),
    box('pointer', 'digit', [-0.003, 0.043, -0.018], [0.003, 0.045, 0.0]),
    disc('jack-a', 'jack', 0.004, 0.035, 0.037, -0.022, -0.056),
    disc('jack-b', 'jack', 0.004, 0.035, 0.037, 0, -0.056),
    disc('jack-c', 'jack-red', 0.004, 0.035, 0.037, 0.022, -0.056),
    disc('plug-a', 'lead-black', 0.005, 0.037, 0.05, 0, -0.056),
    disc('plug-b', 'lead-red', 0.005, 0.037, 0.05, 0.022, -0.056),
  ]
  + lead('lead-black', 'lead-black', [[0, -0.056], [0, -0.09], [0.06, -0.1], [0.06, -0.06]], 0.003, 0.0)
  + lead('lead-red', 'lead-red', [[0.022, -0.056], [0.022, -0.085], [0.08, -0.095], [0.08, -0.06]], 0.003, 0.004)
  + probe('probe-black', 'lead-black', 0.06, -0.06)
  + probe('probe-red', 'lead-red', 0.08, -0.06),
  { holster: 'plastic-yellow', face: 'plastic-charcoal', lcd: 'lcd-green', digit: 'plastic-black', key: 'plastic-grey', knob: 'plastic-black', jack: 'plastic-black', 'jack-red': 'plastic-red', 'lead-black': 'plastic-black', 'lead-red': 'plastic-red', tip: 'steel-stainless' })
  + { voxelGrain: 0.002 },

  // A bench analogue voltmeter 130 mm wide, 110 mm tall and 90 mm deep: a grey case with a white scale under a
  // clear window, a black needle, a zero screw and red and black binding posts, its two probes laid in front.
  h.compound('voltmeter', 0.29, [
    box('case', 'case', [-0.065, 0, -0.09], [0.065, 0.11, 0.0]),
    box('bezel', 'bezel', [-0.06, 0.035, 0.0], [0.06, 0.105, 0.004]),
    box('scale', 'scale', [-0.055, 0.04, 0.004], [0.055, 0.1, 0.005]),
    box('arc-a', 'needle', [-0.045, 0.085, 0.005], [-0.02, 0.087, 0.006]),
    box('arc-b', 'needle', [-0.02, 0.089, 0.005], [0.02, 0.091, 0.006]),
    box('arc-c', 'needle', [0.02, 0.085, 0.005], [0.045, 0.087, 0.006]),
  ] + [
    box('tick-%d' % i, 'needle', [-0.04 + i * 0.01 - 0.0007, 0.078 + 0.01 * (1 - std.abs(i - 4) / 4) * 0.4, 0.005], [-0.04 + i * 0.01 + 0.0007, 0.084 + 0.01 * (1 - std.abs(i - 4) / 4) * 0.4, 0.006])
    for i in std.range(0, 8)
  ] + [
    h.prism('needle', 'needle', 'z', [[0.0, 0.045], [0.002, 0.045], [0.022, 0.09], [0.02, 0.09]], 0.006, 0.007),
    zrod('pivot', 'needle', 0.004, 0.005, 0.009, 0, 0.045),
    zrod('zero', 'bezel', 0.004, 0.0, 0.004, 0, 0.022),
    zrod('post-black', 'post-black', 0.007, 0.0, 0.014, -0.035, 0.018),
    zrod('post-red', 'post-red', 0.007, 0.0, 0.014, 0.035, 0.018),
    box('foot-a', 'post-black', [-0.06, -0.0, -0.085], [-0.045, 0.004, -0.005]),
  ]
  + lead('lead-black', 'post-black', [[-0.035, 0.014], [-0.035, 0.03], [-0.02, 0.03]], 0.003, 0.0)
  + lead('lead-red', 'post-red', [[0.035, 0.014], [0.035, 0.03], [0.02, 0.03]], 0.003, 0.0)
  + probe('probe-black', 'post-black', -0.02, 0.025)
  + probe('probe-red', 'post-red', 0.02, 0.025),
  { case: 'plastic-grey', bezel: 'plastic-black', scale: 'paint-white', needle: 'plastic-black', 'post-black': 'plastic-black', 'post-red': 'plastic-red', tip: 'steel-stainless' })
  + { voxelGrain: 0.002 },

  // A benchtop microcentrifuge 200 mm across and 120 mm tall: a round white body with a domed lid and a clear
  // window over the rotor, a sloped control panel with a display and two keys at the front.
  h.compound('microcentrifuge', 1.7, [
    disc('body', 'body', 0.095, 0, 0.09, 0, -0.04),
    box('panel', 'body', [-0.06, 0, 0.04], [0.06, 0.06, 0.1]),
    h.prism('slope', 'body', 'x', [[0.06, 0.04], [0.06, 0.1], [0.085, 0.04]], -0.06, 0.06),
    box('display', 'lcd', [-0.04, 0.072, 0.056], [0.04, 0.08, 0.068]),
    box('key-a', 'key', [-0.03, 0.06, 0.078], [-0.006, 0.068, 0.09]),
    box('key-b', 'key-red', [0.006, 0.06, 0.078], [0.03, 0.068, 0.09]),
    turned('lid', 'lid', 'y', [[0, 0], [0, 0.093], [0.012, 0.09], [0.025, 0.07], [0.03, 0]], [0, 0.09, -0.04]),
    disc('rotor', 'rotor', 0.05, 0.115, 0.118, 0, -0.04),
    disc('window', 'window', 0.06, 0.118, 0.122, 0, -0.04),
    disc('hub', 'rotor', 0.01, 0.118, 0.124, 0, -0.04),
    box('latch', 'key', [-0.012, 0.075, 0.05], [0.012, 0.092, 0.058]),
    disc('foot-ring', 'rotor', 0.097, 0, 0.006, 0, -0.04),
  ], { body: 'plastic-white', lid: 'plastic-grey', lcd: 'lcd-green', key: 'plastic-grey', 'key-red': 'plastic-red', rotor: 'plastic-charcoal', window: 'plastic-clear' })
  + { voxelGrain: 0.002 },
  // A melting point apparatus 200 mm square and 150 mm tall: a steel hot plate base with a display and keys on its
  // front, and a dark heating housing on it with three capillary slots in the top and a round magnifier viewport
  // facing the user under a lamp hood.
  h.compound('melting_point', 3, [
    box('base', 'case', [-0.1, 0, -0.1], [0.1, 0.035, 0.1]),
    box('plate', 'plate', [-0.09, 0.035, -0.09], [0.09, 0.039, 0.09]),
    box('display', 'lcd', [-0.08, 0.01, 0.1], [-0.02, 0.026, 0.103]),
    box('key-a', 'key', [0.01, 0.012, 0.1], [0.028, 0.024, 0.105]),
    box('key-b', 'key', [0.036, 0.012, 0.1], [0.054, 0.024, 0.105]),
    box('key-c', 'key-red', [0.062, 0.012, 0.1], [0.08, 0.024, 0.105]),
    box('housing', 'housing', [-0.06, 0.039, -0.08], [0.06, 0.15, 0.02]),
    box('block', 'plate', [-0.045, 0.039, 0.02], [0.045, 0.085, 0.04]),
    zrod('viewport', 'housing', 0.028, 0.02, 0.05, 0, 0.11),
    zrod('lens-ring', 'ring', 0.023, 0.05, 0.055, 0, 0.11),
    zrod('lens', 'glass', 0.019, 0.05, 0.057, 0, 0.11),
    box('lamp', 'ring', [-0.05, 0.138, 0.02], [0.05, 0.148, 0.045]),
  ] + [
    box('slot-%d' % i, 'slot', [x - 0.0035, 0.15, -0.03], [x + 0.0035, 0.151, -0.012])
    for i in [0, 1, 2]
    for x in [-0.018 + 0.018 * i]
  ] + [
    disc('capillary', 'glass', 0.0015, 0.15, 0.19, 0.018, -0.021),
    disc('knob', 'key', 0.011, 0.15, 0.162, 0.038, -0.06),
  ], { case: 'plastic-grey', plate: 'steel-stainless', housing: 'paint-charcoal', lcd: 'lcd-green', key: 'plastic-black', 'key-red': 'plastic-red', ring: 'plastic-black', glass: 'glass-clear', slot: 'plastic-black' })
  + { voxelGrain: 0.004 },

  // A bench pH meter: a white case 160 mm wide and 140 mm deep with a sloped display face, a stand rod at its
  // side with an arm holding two glass electrodes in a small beaker, and a bottle of buffer solution behind.
  h.compound('ph_meter', 1.2, [
    box('case', 'case', [-0.08, 0, -0.05], [0.08, 0.035, 0.09]),
    h.prism('slope', 'case', 'x', [[0.035, -0.05], [0.035, 0.09], [0.065, -0.05]], -0.08, 0.08),
    box('display', 'lcd', [-0.06, 0.058, -0.03], [0.02, 0.066, 0.015]),
    box('digits', 'digit', [-0.05, 0.066, -0.02], [0.01, 0.067, 0.005]),
    box('key-a', 'key', [-0.06, 0.044, 0.04], [-0.035, 0.052, 0.055]),
    box('key-b', 'key', [-0.025, 0.044, 0.04], [0.0, 0.052, 0.055]),
    box('key-c', 'key-red', [0.01, 0.044, 0.04], [0.035, 0.052, 0.055]),
    box('stand-foot', 'stand', [-0.15, 0, -0.04], [-0.085, 0.008, 0.05]),
    disc('stand-rod', 'rod', 0.005, 0.008, 0.22, -0.135, -0.025),
    box('arm-clamp', 'stand', [-0.145, 0.17, -0.035], [-0.125, 0.19, -0.015]),
    box('arm', 'stand', [-0.125, 0.174, -0.03], [-0.09, 0.186, -0.02]),
    box('holder', 'stand', [-0.105, 0.17, 0.0], [-0.07, 0.19, 0.03]),
    box('holder-neck', 'stand', [-0.1, 0.174, -0.02], [-0.09, 0.186, 0.0]),
    disc('electrode-a', 'glass', 0.005, 0.03, 0.17, -0.096, 0.015),
    disc('electrode-a-cap', 'cap', 0.006, 0.19, 0.215, -0.096, 0.015),
    disc('electrode-b', 'glass', 0.004, 0.035, 0.17, -0.08, 0.015),
    disc('electrode-b-cap', 'cap', 0.005, 0.19, 0.21, -0.08, 0.015),
    turned('beaker', 'glass', 'y', [[0, 0], [0, 0.028], [0.07, 0.028], [0.07, 0.025], [0.004, 0.025], [0, 0]], [-0.088, 0.008, 0.015]),
    disc('sample', 'liquid', 0.024, 0.012, 0.05, -0.088, 0.015),
    disc('bottle', 'bottle', 0.02, 0, 0.08, 0.055, -0.075),
    disc('bottle-cap', 'cap-blue', 0.01, 0.08, 0.095, 0.055, -0.075),
  ], { case: 'plastic-white', lcd: 'lcd-green', digit: 'plastic-black', key: 'plastic-grey', 'key-red': 'plastic-red', stand: 'plastic-charcoal', rod: 'steel-stainless', glass: 'glass-clear', cap: 'plastic-black', liquid: 'water', bottle: 'plastic-frosted', 'cap-blue': 'plastic-blue' })
  + { voxelGrain: 0.004 },

  // A benchtop spectrophotometer 300 mm wide, 130 mm tall and 230 mm deep: a white case with a hinged
  // sample-compartment lid on top, and a low front deck holding a screen and keypad, a cuvette standing beside it.
  h.compound('spectrophotometer', 5, [
    box('case', 'case', [-0.15, 0, -0.13], [0.15, 0.12, 0.0]),
    box('deck', 'case', [-0.15, 0, 0.0], [0.15, 0.06, 0.1]),
    box('deck-top', 'panel', [-0.145, 0.06, 0.005], [0.145, 0.062, 0.095]),
    box('screen', 'screen', [-0.135, 0.062, 0.015], [-0.02, 0.066, 0.085]),
    box('screen-face', 'lcd', [-0.128, 0.066, 0.022], [-0.027, 0.067, 0.078]),
    box('lid', 'lid', [0.0, 0.12, -0.115], [0.13, 0.13, -0.01]),
    box('lid-pull', 'panel', [0.04, 0.13, -0.025], [0.09, 0.136, -0.01]),
    box('vent', 'panel', [-0.13, 0.12, -0.11], [-0.03, 0.122, -0.04]),
    box('cuvette', 'glass', [0.12, 0.062, 0.075], [0.132, 0.107, 0.087]),
    box('cuvette-fill', 'sample', [0.121, 0.062, 0.076], [0.131, 0.092, 0.086]),
  ] + [
    box('key-%d-%d' % [i, j], if i == 2 && j == 1 then 'key-green' else 'key', [0.005 + 0.03 * i, 0.062, 0.02 + 0.03 * j], [0.027 + 0.03 * i, 0.067, 0.042 + 0.03 * j])
    for i in [0, 1, 2]
    for j in [0, 1]
  ], { case: 'plastic-white', panel: 'plastic-grey', screen: 'plastic-charcoal', lcd: 'screen-black', lid: 'plastic-grey', key: 'plastic-white', 'key-green': 'plastic-green', glass: 'plastic-clear', sample: 'syrup-orange' })
  + { voxelGrain: 0.004 },

  // A plastic sextant 250 mm across lying on its side: a triangular frame with a graduated arc, a swinging index
  // arm with its mirror, a horizon mirror, two coloured shade glasses, a small telescope and a handle underneath.
  // A flat bar `w` wide lying on y from [x0, z0] to [x1, z1].
  local bar(id, slot, p0, p1, w, y0, y1) =
    local dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = std.sqrt(dx * dx + dz * dz), nx = -dz / l * w / 2, nz = dx / l * w / 2;
    h.prism(id, slot, 'y', [[p0[1] + nz, p0[0] + nx], [p1[1] + nz, p1[0] + nx], [p1[1] - nz, p1[0] - nx], [p0[1] - nz, p0[0] - nx]], y0, y1);
  local sextant = [
    bar('frame-a', 'frame', [0, 0], [0.19, -0.105], 0.016, 0.012, 0.018),
    bar('frame-b', 'frame', [0, 0], [0.19, 0.105], 0.016, 0.012, 0.018),
    bar('frame-c', 'frame', [0.1, -0.06], [0.1, 0.06], 0.014, 0.012, 0.018),
    bar('frame-d', 'frame', [0.02, 0.0], [0.19, 0.0], 0.012, 0.012, 0.018),
  ] + h.crescent('arc', 'arc', 0.195, 0.225, 60, 120, 8, 0.012, 0.019) + [
    bar('arm', 'arm', [0, 0], [0.23, 0.02], 0.012, 0.019, 0.023),
    box('index-mirror', 'mirror', [-0.012, 0.023, -0.016], [0.012, 0.045, -0.012]),
    box('horizon-mirror', 'mirror', [0.06, 0.018, 0.03], [0.064, 0.045, 0.055]),
    box('horizon-glass', 'glass', [0.06, 0.018, 0.055], [0.064, 0.045, 0.075]),
    box('shade-a', 'shade', [0.03, 0.018, -0.03], [0.034, 0.04, -0.012]),
    box('shade-b', 'shade-green', [0.038, 0.018, -0.03], [0.042, 0.04, -0.012]),
    box('vernier', 'arm', [0.215, 0.019, 0.01], [0.235, 0.024, 0.03]),
    box('handle', 'handle', [0.08, 0.0, -0.04], [0.12, 0.012, 0.04]),
  ] + [
    local c = std.cos(a), sn = std.sin(a);
    box('tick-%d' % i, 'tick', [std.min(0.2 * c, 0.22 * c) - 0.0008, 0.019, 0.21 * sn - 0.0008], [std.max(0.2 * c, 0.22 * c) + 0.0008, 0.0195, 0.21 * sn + 0.0008])
    for i in std.range(0, 10)
    for a in [(-30 + 6 * i) * std.pi / 180]
  ] + [
    rod('telescope', 'scope', 0.011, 0.02, 0.11, 0.032) + { origin: [0.02, 0.032, 0.07] },
    rod('eyepiece', 'handle', 0.008, 0.0, 0.02, 0.032) + { origin: [0.0, 0.032, 0.07] },
  ];
  h.compound('sextant', 0.71, sextant,
             { frame: 'plastic-black', arc: 'plastic-white', tick: 'plastic-black', arm: 'plastic-grey', mirror: 'mirror-silver', glass: 'glass-clear', shade: 'lens-smoke', 'shade-green': 'glass-lens-green', scope: 'plastic-charcoal', handle: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },

  // A low open cardboard tray, 120 mm by 80 mm with 25 mm walls, holding a jumble of ring stand clamps: a support
  // ring lying flat, a three-prong clamp with its boss head, a spare boss head and a wing nut, one jaw taped up.
  h.compound('stand_ring_clamps', 0.18, [
    box('floor', 'inside', [-0.06, 0, -0.04], [0.06, 0.003, 0.04]),
    box('wall-front', 'box', [-0.06, 0, 0.037], [0.06, 0.025, 0.04]),
    box('wall-back', 'box', [-0.06, 0, -0.04], [0.06, 0.025, -0.037]),
    box('wall-left', 'box', [-0.06, 0, -0.04], [-0.057, 0.025, 0.04]),
    box('wall-right', 'box', [0.057, 0, -0.04], [0.06, 0.025, 0.04]),
    turned('ring', 'steel', 'y', [[0, 0.029], [0, 0.035], [0.005, 0.035], [0.005, 0.029], [0, 0.029]], [-0.02, 0.003, 0.0]),
    rod('ring-arm', 'steel', 0.004, 0.012, 0.052, 0.007) + { origin: [0.012, 0.007, 0.0] },
    box('boss-a', 'boss', [0.03, 0.003, -0.035], [0.052, 0.025, -0.013]),
    zrod('boss-a-screw', 'steel', 0.003, -0.013, 0.0, 0.041, 0.014),
    box('boss-a-wing', 'steel', [0.033, 0.025, -0.026], [0.049, 0.029, -0.022]),
    rod('clamp-rod', 'steel', 0.004, -0.045, 0.02, 0.014) + { origin: [-0.045, 0.014, 0.02] },
    box('clamp-head', 'boss', [-0.055, 0.003, 0.008], [-0.04, 0.022, 0.034]),
    box('prong-a', 'jaw', [-0.055, 0.022, 0.01], [-0.045, 0.045, 0.016]),
    box('prong-b', 'jaw', [-0.055, 0.022, 0.024], [-0.045, 0.04, 0.03]),
    box('tape', 'tape', [-0.057, 0.03, 0.008], [-0.043, 0.037, 0.032]),
    box('boss-b', 'boss', [0.028, 0.003, 0.012], [0.05, 0.025, 0.034]),
    disc('wing-nut', 'steel', 0.004, 0.003, 0.012, 0.008, -0.03),
    box('wing-nut-wings', 'steel', [-0.002, 0.008, -0.032], [0.018, 0.012, -0.028]),
  ], { box: 'cardboard-corrugated', inside: 'paper-butcher', steel: 'steel-bright', boss: 'alu-bare', jaw: 'plastic-red', tape: 'tape-silver' })
  + { voxelGrain: 0.002 },
  // A makeshift nitrogen generator 1.5 m long on a welded angle-steel skid 400 mm wide: an air filter canister at
  // the intake, a tall drying column of salts, a long membrane module on saddles, a pressure gauge and an outlet
  // valve, joined by black hoses.
  h.compound('nitrogen_generator', 51, [
    box('rail-a', 'frame', [-0.75, 0, -0.2], [0.75, 0.04, -0.17]),
    box('rail-b', 'frame', [-0.75, 0, 0.17], [0.75, 0.04, 0.2]),
  ] + [
    box('cross-%d' % i, 'frame', [x - 0.02, 0.0, -0.17], [x + 0.02, 0.04, 0.17])
    for i in [0, 1, 2, 3]
    for x in [-0.73 + 0.486 * i]
  ] + [
    box('deck', 'deck', [-0.72, 0.04, -0.16], [0.72, 0.046, 0.16]),
    // The intake filter: a round canister on its side with a pleated face and a clamp band.
    rod('filter', 'filter', 0.11, -0.7, -0.52, 0.16) + { origin: [-0.7, 0.16, 0] },
    rod('filter-band', 'band', 0.114, -0.62, -0.6, 0.16) + { origin: [-0.62, 0.16, 0] },
    rod('filter-face', 'pleat', 0.09, -0.703, -0.7, 0.16) + { origin: [-0.703, 0.16, 0] },
    box('filter-foot', 'frame', [-0.66, 0.046, -0.06], [-0.56, 0.06, 0.06]),
  ] + [
    box('pleat-%d' % i, 'band', [-0.705, 0.08 + 0.02 * i, -0.08], [-0.703, 0.085 + 0.02 * i, 0.08])
    for i in std.range(0, 7)
  ] + [
    // The drying column: a steel cylinder of salts with domed ends and a sight strip.
    disc('dryer', 'dryer', 0.085, 0.07, 0.55, -0.32, 0),
    turned('dryer-top', 'dryer', 'y', [[0, 0], [0, 0.085], [0.03, 0.06], [0.04, 0]], [-0.32, 0.55, 0]),
    disc('dryer-ring', 'band', 0.088, 0.046, 0.07, -0.32, 0),
    box('dryer-sight', 'salt', [-0.335, 0.12, 0.08], [-0.305, 0.48, 0.087]),
    // The membrane module: a long white tube on two saddles, with end caps.
    rod('membrane', 'membrane', 0.06, -0.12, 0.5, 0.2) + { origin: [-0.12, 0.2, 0] },
    rod('cap-a', 'band', 0.066, -0.14, -0.12, 0.2) + { origin: [-0.14, 0.2, 0] },
    rod('cap-b', 'band', 0.066, 0.5, 0.52, 0.2) + { origin: [0.5, 0.2, 0] },
    box('saddle-a', 'frame', [-0.04, 0.046, -0.05], [0.0, 0.15, 0.05]),
    box('saddle-b', 'frame', [0.38, 0.046, -0.05], [0.42, 0.15, 0.05]),
    // Gauge and outlet valve on a short manifold.
    disc('manifold', 'brass', 0.015, 0.046, 0.2, 0.62, 0),
    zrod('gauge', 'band', 0.04, 0.0, 0.025, 0.62, 0.24),
    zrod('gauge-face', 'face', 0.034, 0.025, 0.028, 0.62, 0.24),
    box('gauge-needle', 'band', [0.618, 0.24, 0.028], [0.622, 0.268, 0.03]),
    disc('gauge-stem', 'brass', 0.008, 0.2, 0.205, 0.62, 0.0),
    rod('valve', 'brass', 0.014, 0.635, 0.7, 0.12) + { origin: [0.635, 0.12, 0] },
    disc('valve-handle', 'handle', 0.025, 0.134, 0.142, 0.67, 0),
    disc('valve-stem', 'brass', 0.004, 0.12, 0.134, 0.67, 0),
    // Hoses: filter to dryer foot, dryer top to membrane, membrane to manifold.
    rod('hose-a', 'hose', 0.014, -0.52, -0.4, 0.16) + { origin: [-0.52, 0.16, 0] },
    rod('hose-b', 'hose', 0.014, -0.32, -0.14, 0.6) + { origin: [-0.32, 0.6, 0] },
    disc('hose-c', 'hose', 0.014, 0.2, 0.6, -0.14, 0) + { origin: [-0.155, 0.2, 0] },
    rod('hose-d', 'hose', 0.012, 0.52, 0.62, 0.2) + { origin: [0.52, 0.2, 0] },
    rod('hose-e', 'hose', 0.012, -0.405, -0.32, 0.16) + { origin: [-0.405, 0.16, 0.0] },
  ], { frame: 'steel-grey', deck: 'steel-galvanised', filter: 'plastic-black', band: 'plastic-charcoal', pleat: 'paper-white', dryer: 'steel-bright', salt: 'salt-white', membrane: 'plastic-white', brass: 'brass', face: 'paint-white', handle: 'paint-red', hose: 'rubber-black' }),

  // A rotary evaporator 700 mm wide and 600 mm tall: a heated water bath on a grey base, a motor head on a tall
  // tower that tilts a round flask into the bath, a coiled glass condenser standing above, and a receiving flask.
  local tower = -0.22, flaskC = [0.0, 0.14, 0.0];
  h.compound('rotovap', 10, [
    box('base', 'body', [-0.3, 0, -0.18], [0.35, 0.05, 0.18]),
    box('bath-panel', 'panel', [0.06, 0.02, 0.18], [0.3, 0.045, 0.182]),
    box('bath-display', 'lcd', [0.09, 0.026, 0.182], [0.16, 0.04, 0.184]),
    turned('bath', 'bath', 'y', [[0, 0], [0, 0.13], [0.1, 0.13], [0.1, 0.122], [0.006, 0.122], [0.006, 0]], [0.05, 0.05, 0]),
    disc('bath-water', 'water', 0.12, 0.056, 0.13, 0.05, 0),
    box('tower', 'body', [tower - 0.04, 0.05, -0.04], [tower + 0.04, 0.58, 0.04]),
    box('tower-cap', 'panel', [tower - 0.045, 0.58, -0.045], [tower + 0.045, 0.6, 0.045]),
    box('motor', 'body', [tower + 0.04, 0.3, -0.06], [tower + 0.16, 0.42, 0.06]),
    box('motor-face', 'panel', [tower + 0.06, 0.32, 0.06], [tower + 0.14, 0.4, 0.062]),
    zrod('speed-knob', 'knob', 0.012, 0.062, 0.075, tower + 0.1, 0.36),
    zrod('lift', 'knob', 0.015, 0.04, 0.06, tower, 0.2),
  ]
  // The vapour duct runs from the motor head down to the rotating flask.
  + slant('duct', 'glass', 0.014, [tower + 0.14, 0.32, 0], [0.03, 0.17, 0], 8)
  + [
    h.ball('flask', 'glass', 0.07, 0.05, 0.14, 0, 0.9),
    h.ball('flask-fill', 'liquid', 0.05, 0.05, 0.12, 0, 0.8),
    disc('neck-clip', 'knob', 0.018, 0.2, 0.215, 0.025, 0),
  ]
  + slant('riser', 'glass', 0.014, [tower + 0.1, 0.42, 0], [tower + 0.1, 0.46, 0], 1)
  + [
    // The condenser: a tall glass jacket with a coil inside and two hose barbs.
    disc('condenser', 'glass', 0.03, 0.42, 0.66, tower + 0.1, 0),
    disc('condenser-cap', 'knob', 0.022, 0.66, 0.68, tower + 0.1, 0),
  ] + [
    disc('coil-%d' % i, 'coil', 0.024, 0.44 + 0.022 * i, 0.448 + 0.022 * i, tower + 0.1, 0)
    for i in std.range(0, 9)
  ] + [
    rod('barb-a', 'glass', 0.005, tower + 0.13, tower + 0.16, 0.48) + { origin: [tower + 0.13, 0.48, 0] },
    rod('barb-b', 'glass', 0.005, tower + 0.13, tower + 0.16, 0.62) + { origin: [tower + 0.13, 0.62, 0] },
    box('clamp', 'knob', [tower + 0.04, 0.55, -0.012], [tower + 0.075, 0.57, 0.012]),
    // Receiving flask hangs below the motor head on the near side of the tower.
    box('take-off', 'glass', [tower + 0.06, 0.24, 0.03], [tower + 0.075, 0.3, 0.045]),
    h.ball('receiver', 'glass', 0.05, tower + 0.068, 0.19, 0.06, 0.95),
    h.ball('receiver-fill', 'liquid', 0.032, tower + 0.068, 0.165, 0.06, 0.7),
    box('receiver-clip', 'knob', [tower + 0.055, 0.235, 0.05], [tower + 0.08, 0.245, 0.07]),
  ], { body: 'plastic-grey', panel: 'plastic-charcoal', lcd: 'lcd-green', bath: 'steel-stainless', water: 'water', knob: 'plastic-black', glass: 'glass-clear', liquid: 'syrup-orange', coil: 'plastic-frosted' })
  + { voxelGrain: 0.004 },

  // A teleport pad 300 mm square and 30 mm thick: an aluminium plate with a raised ring of emitter coils round a
  // glowing core, a solar cell panel in one corner and a tread grid across the stepping face.
  h.compound('telepad', 2.9, h.scaled([
    box('plate', 'plate', [-0.2, 0, -0.2], [0.2, 0.012, 0.2]),
    box('rim-a', 'rim', [-0.2, 0.012, -0.2], [0.2, 0.018, -0.19]),
    box('rim-b', 'rim', [-0.2, 0.012, 0.19], [0.2, 0.018, 0.2]),
    box('rim-c', 'rim', [-0.2, 0.012, -0.19], [-0.19, 0.018, 0.19]),
    box('rim-d', 'rim', [0.19, 0.012, -0.19], [0.2, 0.018, 0.19]),
    turned('ring', 'coil', 'y', [[0, 0.11], [0, 0.14], [0.018, 0.14], [0.018, 0.11], [0, 0.11]], [0, 0.012, 0]),
    turned('ring-inner', 'rim', 'y', [[0, 0.09], [0, 0.11], [0.01, 0.11], [0.01, 0.09], [0, 0.09]], [0, 0.012, 0]),
    disc('core', 'core', 0.07, 0.012, 0.022, 0, 0),
    disc('core-cap', 'rim', 0.02, 0.022, 0.03, 0, 0),
    box('solar', 'solar', [0.12, 0.012, 0.12], [0.185, 0.016, 0.185]),
    box('solar-line', 'rim', [0.15, 0.016, 0.12], [0.153, 0.017, 0.185]),
    box('trigger', 'rim', [-0.18, 0.012, 0.15], [-0.14, 0.02, 0.18]),
  ] + [
    box('node-%d' % i, 'rim', [0.125 * std.cos(a) - 0.012, 0.03, 0.125 * std.sin(a) - 0.012], [0.125 * std.cos(a) + 0.012, 0.04, 0.125 * std.sin(a) + 0.012])
    for i in std.range(0, 5)
    for a in [i * std.pi / 3]
  ], 0.75), { plate: 'alu-bare', rim: 'plastic-charcoal', coil: 'copper', core: 'crystal-glow-blue', solar: 'screen-black' })
  + { voxelGrain: 0.004 },

  // A handheld teleporter 220 mm long: a pistol grip under a grey body with a copper coil wound round a glowing
  // core, a forked emitter at the front and a red trigger button, lying along x with the emitter at +x.
  h.compound('teleporter', 1.1, [
    box('grip', 'grip', [-0.09, 0.0, -0.016], [-0.055, 0.075, 0.016]),
    rod('body', 'body', 0.03, -0.11, 0.06, 0.1) + { origin: [-0.11, 0.1, 0] },
    rod('core', 'core', 0.016, 0.06, 0.08, 0.1) + { origin: [-0.02, 0.1, 0] },
    rod('window', 'core', 0.018, -0.03, 0.03, 0.1) + { origin: [-0.03, 0.1, 0] },
    rod('cap', 'grip', 0.032, -0.12, -0.11, 0.1) + { origin: [-0.12, 0.1, 0] },
    box('fork-a', 'body', [0.06, 0.12, -0.008], [0.11, 0.13, 0.008]),
    box('fork-b', 'body', [0.06, 0.07, -0.008], [0.11, 0.08, 0.008]),
    rod('tip-a', 'core', 0.006, 0.105, 0.115, 0.125) + { origin: [0.105, 0.125, 0] },
    rod('tip-b', 'core', 0.006, 0.105, 0.115, 0.075) + { origin: [0.105, 0.075, 0] },
    box('button', 'button', [-0.06, 0.06, -0.005], [-0.048, 0.07, 0.005]),
    box('vent', 'grip', [-0.1, 0.128, -0.012], [-0.07, 0.132, 0.012]),
  ] + [
    rod('coil-%d' % i, 'coil', 0.034, x, x + 0.006, 0.1) + { origin: [x, 0.1, 0] }
    for i in std.range(0, 4)
    for x in [-0.025 + 0.013 * i]
  ], { grip: 'plastic-matte-black', body: 'alu-bare', core: 'crystal-glow-blue', coil: 'copper', button: 'plastic-red' })
  + { voxelGrain: 0.002 } + { handling: h.gripOn('teleporter', 'grip') },

  // A belt-driven rotary vacuum pump 480 mm long, 230 mm wide and 300 mm tall on a steel base plate: an electric
  // motor with a cooling fan cover, a cast pump block with an oil sight glass and inlet port, and a belt guard
  // over the pulleys at the back.
  h.compound('vac_pump', 45, [
    box('base', 'base', [-0.24, 0, -0.115], [0.24, 0.015, 0.115]),
    // Motor along x on the left.
    rod('motor', 'motor', 0.075, -0.22, -0.02, 0.1) + { origin: [-0.22, 0.1, 0.03] },
    rod('fan-cover', 'base', 0.07, -0.24, -0.22, 0.1) + { origin: [-0.24, 0.1, 0.03] },
    box('motor-foot', 'base', [-0.2, 0.015, -0.03], [-0.04, 0.035, 0.09]),
    box('junction', 'motor', [-0.15, 0.17, 0.0], [-0.09, 0.2, 0.06]),
  ] + [
    box('fin-%d' % i, 'base', [-0.21 + 0.03 * i, 0.172, 0.025], [-0.2 + 0.03 * i, 0.178, 0.035])
    for i in std.range(0, 5)
  ] + [
    // Pump block on the right, taller, with an oil reservoir and sight glass on its front.
    box('pump', 'pump', [0.0, 0.015, -0.06], [0.2, 0.2, 0.1]),
    box('reservoir', 'pump', [0.02, 0.015, 0.1], [0.18, 0.12, 0.115]),
    zrod('sight', 'oil', 0.018, 0.115, 0.118, 0.1, 0.065),
    zrod('sight-ring', 'base', 0.022, 0.113, 0.116, 0.1, 0.065),
    disc('inlet', 'brass', 0.018, 0.2, 0.25, 0.06, 0.02),
    disc('inlet-flange', 'brass', 0.026, 0.25, 0.258, 0.06, 0.02),
    disc('exhaust', 'base', 0.02, 0.2, 0.24, 0.15, 0.02),
    disc('oil-cap', 'oil-cap', 0.014, 0.2, 0.215, 0.15, 0.07),
    box('handle-post-a', 'base', [-0.1, 0.2, -0.04], [-0.09, 0.3, -0.03]),
    box('handle-post-b', 'base', [0.13, 0.2, -0.04], [0.14, 0.3, -0.03]),
    box('handle', 'base', [-0.1, 0.29, -0.045], [0.14, 0.305, -0.025]),
    // Belt guard: a deep box along the back covering both pulleys.
    box('guard', 'guard', [-0.21, 0.02, -0.115], [0.19, 0.2, -0.065]),
  ] + [
    box('guard-slot-%d' % i, 'base', [-0.17 + 0.06 * i, 0.06, -0.116], [-0.14 + 0.06 * i, 0.16, -0.115])
    for i in std.range(0, 5)
  ], { base: 'steel-parkerized', motor: 'paint-green', pump: 'steel-grey', guard: 'paint-green', oil: 'fuel-amber', brass: 'brass', 'oil-cap': 'plastic-black' })
  + { voxelGrain: 0.004 },
]
