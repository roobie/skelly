local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A rod of radius `r` along `axis` from `a0` to `a1`, its other two coordinates fixed by `origin` (the axis entry ignored).
local rodOn(id, slot, axis, r, a0, a1, origin) =
  local o = if axis == 'x' then [a0, origin[1], origin[2]] else if axis == 'y' then [origin[0], a0, origin[2]] else [origin[0], origin[1], a0];
  turned(id, slot, axis, [[0, 0], [0, r], [a1 - a0, r], [a1 - a0, 0]], o);
// A ring on y from `y0` to `y1`, radii `r0` to `r1`, centred at (x, z).
local ringY(id, slot, r0, r1, y0, y1, x=0, z=0) = turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);
// A seam strip running up a cone's outside at +x from (r0, y0) to (r1, y1), as `n` short steps.
local coneSeam(prefix, slot, r0, y0, r1, y1, n, w=0.004, t=0.002) = [
  local f0 = i / n, f1 = (i + 1) / n;
  local rm = r0 + (r1 - r0) * f1;
  box('%s-%d' % [prefix, i], slot, [rm - 0.003, y0 + (y1 - y0) * f0, -w / 2], [rm + t, y0 + (y1 - y0) * f1, w / 2])
  for i in std.range(0, n - 1)
];
[
  // A steel-cased radio receiver module, 90 by 55 mm and 28 mm tall, with a short wire aerial and two leads
  // ending in clips, for wiring a radio trigger into a device.
  h.compound('radio_mod', 0.17, [
    box('case', 'case', [-0.045, 0, -0.0275], [0.045, 0.026, 0.0275]),
    box('lid', 'lid', [-0.043, 0.026, -0.0255], [0.043, 0.028, 0.0255]),
    box('label', 'label', [-0.022, 0.028, -0.014], [0.018, 0.03, 0.014]),
  ] + [
    disc('screw-%d' % i, 'screw', 0.0025, 0.028, 0.03, [-0.038, 0.038][i % 2], [-0.019, 0.019][std.floor(i / 2)])
    for i in std.range(0, 3)
  ] + [
    h.stud('led', 'led', 0.03, 0.014, 0.0275, 0.003, 0.003),
    box('terminal', 'terminal', [-0.035, 0.006, 0.0275], [-0.01, 0.018, 0.031]),
    rodOn('aerial-base', 'base', 'x', 0.004, 0.045, 0.054, [0, 0.016, 0]),
    rodOn('aerial', 'aerial', 'x', 0.0015, 0.054, 0.125, [0, 0.016, 0]),
    rodOn('lead-red', 'lead-red', 'x', 0.0015, -0.1, -0.045, [0, 0.008, 0.01]),
    rodOn('lead-black', 'lead-black', 'x', 0.0015, -0.095, -0.045, [0, 0.008, -0.01]),
    box('clip-red', 'lead-red', [-0.125, 0.003, 0.004], [-0.1, 0.013, 0.016]),
    box('clip-black', 'lead-black', [-0.12, 0.003, -0.016], [-0.095, 0.013, -0.004]),
  ], {
    case: 'steel-grey', lid: 'steel-bright', label: 'plastic-white', screw: 'steel-blued', led: 'plastic-red',
    terminal: 'circuit-green', base: 'plastic-black', aerial: 'steel-bright', 'lead-red': 'plastic-red', 'lead-black': 'plastic-black',
  }) + h.inHand('radio_mod', 'case') + { voxelGrain: 0.002 },

  // A toy car's handheld radio transmitter, 160 by 110 mm and 40 mm thick, face up: one steering stick on the left,
  // four coloured buttons on the right, a power switch and a telescopic aerial, half drawn out, behind.
  h.compound('radiocontrol', 0.34, [
    box('body', 'body', [-0.08, 0, -0.055], [0.08, 0.04, 0.055]),
    box('face', 'face', [-0.075, 0.04, -0.05], [0.075, 0.042, 0.05]),
    box('grip-left', 'body', [-0.08, -0.012, 0.02], [-0.05, 0, 0.055]),
    box('grip-right', 'body', [0.05, -0.012, 0.02], [0.08, 0, 0.055]),
    disc('gimbal', 'gimbal', 0.018, 0.042, 0.046, -0.04, -0.005),
    disc('stick', 'stick', 0.003, 0.046, 0.07, -0.04, -0.005),
    h.ball('knob', 'knob', 0.007, -0.04, 0.072, -0.005),
    disc('button-red', 'button-red', 0.007, 0.042, 0.047, 0.03, -0.022),
    disc('button-yellow', 'button-yellow', 0.007, 0.042, 0.047, 0.055, -0.005),
    disc('button-green', 'button-green', 0.007, 0.042, 0.047, 0.03, 0.012),
    disc('button-blue', 'button-blue', 0.007, 0.042, 0.047, 0.005, -0.005),
    box('switch-plate', 'switch', [-0.012, 0.042, 0.03], [0.012, 0.044, 0.042]),
    box('switch', 'button-red', [-0.008, 0.044, 0.033], [-0.002, 0.048, 0.039]),
    box('label', 'label', [-0.03, 0.042, -0.046], [0.03, 0.044, -0.036]),
    rodOn('aerial-base', 'base', 'z', 0.005, -0.068, -0.055, [0.06, 0.03, 0]),
    rodOn('aerial', 'aerial', 'z', 0.003, -0.15, -0.068, [0.06, 0.03, 0]),
    h.ball('aerial-tip', 'base', 0.004, 0.06, 0.03, -0.15),
  ], {
    body: 'plastic-black', face: 'plastic-charcoal', gimbal: 'plastic-grey', stick: 'steel-bright', knob: 'rubber-black',
    'button-red': 'plastic-red', 'button-yellow': 'plastic-yellow', 'button-green': 'plastic-green', 'button-blue': 'plastic-blue',
    switch: 'steel-grey', label: 'plastic-white', base: 'plastic-black', aerial: 'steel-bright',
  }) + h.inHand('radiocontrol', 'body') + { voxelGrain: 0.002 },

  // A rugged handheld controller for a real vehicle, 200 by 130 mm and 50 mm thick, face up: a screen, two rows of
  // toggle switches, a drive stick, yellow corner bumpers and a stubby rubber aerial out of the back.
  h.compound('remotevehcontrol', 0.79, [
    box('body', 'body', [-0.1, 0, -0.065], [0.1, 0.045, 0.065]),
    box('face', 'face', [-0.094, 0.045, -0.059], [0.094, 0.047, 0.059]),
  ] + [
    box('bumper-%d' % i, 'bumper', [[-0.104, 0.08][i % 2], -0.002, [-0.069, 0.045][std.floor(i / 2)]], [[-0.08, 0.104][i % 2], 0.049, [-0.045, 0.069][std.floor(i / 2)]])
    for i in std.range(0, 3)
  ] + [
    box('bezel', 'bezel', [-0.075, 0.047, -0.052], [0.005, 0.049, -0.008]),
    box('screen', 'screen', [-0.07, 0.049, -0.048], [0, 0.0502, -0.012]),
    disc('gimbal', 'bezel', 0.02, 0.047, 0.051, 0.05, -0.03),
    disc('stick', 'lever', 0.004, 0.051, 0.075, 0.05, -0.03),
    h.ball('knob', 'knob', 0.008, 0.05, 0.077, -0.03),
  ] + std.flattenArrays([
    local x = -0.07 + (i % 5) * 0.03, z = [0.012, 0.042][std.floor(i / 5)];
    [
      disc('toggle-base-%d' % i, 'bezel', 0.005, 0.047, 0.05, x, z),
      rodOn('toggle-%d' % i, 'lever', 'y', 0.0015, 0.05, 0.064, [x, 0, z]),
      box('toggle-label-%d' % i, 'label', [x - 0.009, 0.047, z + 0.008], [x + 0.009, 0.049, z + 0.012]),
    ]
    for i in std.range(0, 9)
  ]) + [
    h.stud('led', 'led', 0.07, 0.025, 0.065, 0.004, 0.003),
    rodOn('aerial', 'aerial', 'z', 0.006, -0.135, -0.065, [-0.07, 0.025, 0]),
    h.ball('aerial-tip', 'aerial', 0.006, -0.07, 0.025, -0.135),
  ], {
    body: 'plastic-grey', face: 'plastic-charcoal', bumper: 'plastic-hivis', bezel: 'plastic-black', screen: 'screen-black',
    lever: 'steel-bright', knob: 'rubber-black', label: 'plastic-white', led: 'plastic-green', aerial: 'rubber-black',
  }) + h.inHand('remotevehcontrol', 'body') + { voxelGrain: 0.002 },

  // A handheld two-way radio standing upright, 58 mm wide, 35 mm deep and 125 mm tall without its 85 mm rubber
  // aerial, front on +z: a speaker grille and small display on the front, a channel knob on top, a push-to-talk
  // key on the left side and an aluminium-backed battery pack with a belt clip behind.
  h.compound('two_way_radio', 0.23, [
    box('body', 'body', [-0.029, 0, -0.012], [0.029, 0.125, 0.0175]),
    box('battery', 'battery', [-0.027, 0.004, -0.019], [0.027, 0.085, -0.012]),
    box('clip', 'clip', [-0.012, 0.03, -0.024], [0.012, 0.09, -0.019]),
    box('display', 'display', [-0.018, 0.088, 0.0175], [0.018, 0.106, 0.019]),
  ] + [
    box('grille-%d' % i, 'grille', [-0.02, 0.03 + i * 0.008, 0.0175], [0.02, 0.034 + i * 0.008, 0.019])
    for i in std.range(0, 5)
  ] + [
    box('keypad', 'grille', [-0.016, 0.008, 0.0175], [0.016, 0.022, 0.019]),
    box('ptt', 'ptt', [-0.033, 0.06, -0.006], [-0.029, 0.095, 0.01]),
    disc('aerial-base', 'aerial', 0.007, 0.125, 0.135, -0.014, 0),
    disc('aerial', 'aerial', 0.0045, 0.135, 0.21, -0.014, 0),
    h.ball('aerial-tip', 'aerial', 0.005, -0.014, 0.21, 0),
    disc('knob', 'knob', 0.007, 0.125, 0.14, 0.014, 0),
    h.stud('led', 'led', 0.016, 0.118, 0.0175, 0.0025, 0.002),
  ], {
    body: 'plastic-black', battery: 'alu-bare', clip: 'plastic-charcoal', display: 'lcd-green', grille: 'plastic-charcoal',
    ptt: 'rubber-black', aerial: 'rubber-black', knob: 'alu-anodized-black', led: 'plastic-red',
  }) + h.inHand('two_way_radio', 'body') + { voxelGrain: 0.002 },

  // A cone of birch bark rolled from one sheet, 100 mm across the mouth and 100 mm tall, the overlap pinned by a
  // split twig near the rim.
  h.compound('birchbark_funnel', 0.01, [
    turned('cone', 'bark', 'y', [[0, 0.004], [0, 0.008], [0.1, 0.05], [0.1, 0.046], [0.003, 0.004], [0, 0.004]]),
  ] + coneSeam('seam', 'seam', 0.008, 0.002, 0.05, 0.1, 14, 0.012, 0.002) + [
    rodOn('pin', 'pin', 'z', 0.0018, -0.016, 0.016, [0.05, 0.082, 0]),
  ], { bark: 'bark-birch', seam: 'bark', pin: 'wood-walnut' }) + h.inHand('birchbark_funnel', 'cone') + { voxelGrain: 0.002 },

  // A moulded plastic kitchen funnel, 150 mm across the rim and 142 mm tall with a 22 mm spout and a hanging tab.
  h.compound('funnel', 0.03, [
    turned('funnel', 'plastic', 'y', [[0, 0.008], [0, 0.011], [0.05, 0.011], [0.13, 0.075], [0.142, 0.075], [0.142, 0.071], [0.132, 0.071], [0.052, 0.008], [0, 0.008]]),
    box('tab', 'plastic', [0.072, 0.136, -0.009], [0.092, 0.142, 0.009]),
    ringY('tab-ring', 'plastic', 0.004, 0.011, 0.136, 0.142, 0.092, 0),
  ], { plastic: 'plastic-orange' }) + h.inHand('funnel', 'funnel') + { voxelGrain: 0.002 },

  // A small funnel of stitched leather, 100 mm across the mouth and 110 mm tall, with a rolled rim, a short spout,
  // a stitched side seam and a thong loop for hanging.
  h.compound('leather_funnel', 0.021, [
    turned('cone', 'leather', 'y', [[0, 0.006], [0, 0.009], [0.03, 0.009], [0.104, 0.05], [0.104, 0.046], [0.032, 0.006], [0, 0.006]]),
    ringY('rim', 'rim', 0.045, 0.053, 0.102, 0.11),
  ] + coneSeam('seam', 'seam', 0.009, 0.03, 0.05, 0.102, 12, 0.006, 0.002) + [
    box('stitch-%d' % i, 'stitch', [0.009 + i * 0.0068 + 0.0026, 0.036 + i * 0.012, -0.004], [0.009 + i * 0.0068 + 0.0046, 0.038 + i * 0.012, 0.004])
    for i in std.range(0, 5)
  ] + [
    turned('thong', 'thong', 'z', [[0, 0.008], [0, 0.011], [0.003, 0.011], [0.003, 0.008], [0, 0.008]], [-0.058, 0.106, -0.0015]),
  ], { leather: 'leather-brown', rim: 'leather-chestnut', seam: 'leather-chestnut', stitch: 'cord-cotton', thong: 'leather-tan' }) + h.inHand('leather_funnel', 'cone') + { voxelGrain: 0.002 },

  // The top of a 2 L plastic drinks bottle cut off and turned neck down, 100 mm across and 100 mm tall, its cut edge
  // bound with a band of duct tape.
  h.compound('makeshift_funnel', 0.015, [
    turned('bottle', 'plastic', 'y', [[0, 0.011], [0, 0.0135], [0.02, 0.0135], [0.035, 0.022], [0.065, 0.045], [0.08, 0.05], [0.1, 0.05], [0.1, 0.048], [0.08, 0.048], [0.065, 0.043], [0.035, 0.02], [0.02, 0.011], [0, 0.011]]),
    ringY('collar', 'plastic', 0.012, 0.0175, 0.02, 0.023),
  ] + [
    ringY('thread-%d' % i, 'plastic', 0.012, 0.015, 0.004 + i * 0.005, 0.006 + i * 0.005)
    for i in std.range(0, 2)
  ] + [
    ringY('tape', 'tape', 0.047, 0.052, 0.085, 0.1),
  ], { plastic: 'plastic-clear', tape: 'tape-silver' }) + h.inHand('makeshift_funnel', 'bottle') + { voxelGrain: 0.002 },
]
