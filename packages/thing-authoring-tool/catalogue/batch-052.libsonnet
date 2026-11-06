local h = import '../compound.libsonnet';
local box = h.box, turned = h.turned, prism = h.prism, disc = h.disc;
// A blade on the z axis from radius r0 to r1 at angle a, `w0` wide at the root and `w1` at the tip, centred on (cx, cy).
local blade(id, slot, cx, cy, a, r0, r1, w0, w1, z0, z1) =
  local c = std.cos(a), s = std.sin(a), px = -s, py = c;
  local p(r, w) = [cx + c * r + px * w / 2, cy + s * r + py * w / 2];
  local q(r, w) = [cx + c * r - px * w / 2, cy + s * r - py * w / 2];
  prism(id, slot, 'z', [q(r0, w0), q(r1, w1), p(r1, w1), p(r0, w0)], z0, z1);
// A square steel strut standing from (x0, z0) at y0 to (x1, z1) at y1, as stacked short boxes.
local strut(prefix, slot, x0, z0, y0, x1, z1, y1, t, n) = [
  local f = (i + 0.5) / n, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f;
  box('%s-%d' % [prefix, i], slot, [x - t / 2, y0 + (y1 - y0) * i / n, z - t / 2], [x + t / 2, y0 + (y1 - y0) * (i + 1) / n, z + t / 2])
  for i in std.range(0, n - 1)
];
[
  // A small steel wind-driven grist mill, 1.5 m to the top of its rotor: a splayed four-leg tower over a
  // millstone housing and hopper, a six-blade rotor facing +z and a tail vane behind.
  local top = 1.05, hubY = 1.1, foot = 0.32, head = 0.08;
  h.compound('wind_mill', 87, std.flattenArrays([
    strut('leg-%d' % i, 'frame', sx * foot, sz * foot, 0, sx * head, sz * head, top, 0.04, 12)
    for i in std.range(0, 3)
    for sx in [if i % 2 == 0 then -1 else 1]
    for sz in [if i < 2 then -1 else 1]
  ]) + [
    // Cross braces at two heights.
    box('brace-low-front', 'frame', [-0.27, 0.30, 0.25], [0.27, 0.33, 0.28]),
    box('brace-low-back', 'frame', [-0.27, 0.30, -0.28], [0.27, 0.33, -0.25]),
    box('brace-low-left', 'frame', [-0.28, 0.30, -0.27], [-0.25, 0.33, 0.27]),
    box('brace-low-right', 'frame', [0.25, 0.30, -0.27], [0.28, 0.33, 0.27]),
    box('brace-mid-front', 'frame', [-0.18, 0.68, 0.16], [0.18, 0.71, 0.19]),
    box('brace-mid-back', 'frame', [-0.18, 0.68, -0.19], [0.18, 0.71, -0.16]),
    box('brace-mid-left', 'frame', [-0.19, 0.68, -0.18], [-0.16, 0.71, 0.18]),
    box('brace-mid-right', 'frame', [0.16, 0.68, -0.18], [0.19, 0.71, 0.18]),
    // Millstone housing and hopper on a deck between the legs, with the flour spout to the front.
    box('deck', 'deck', [-0.25, 0.33, -0.25], [0.25, 0.36, 0.25]),
    disc('housing', 'housing', 0.17, 0.36, 0.52),
    disc('housing-rim', 'frame', 0.18, 0.50, 0.53),
    turned('hopper', 'hopper', 'y', [[0, 0], [0, 0.05], [0.14, 0.15], [0.15, 0.15], [0.15, 0]], [0, 0.53, 0]),
    box('spout', 'housing', [-0.03, 0.40, 0.16], [0.03, 0.45, 0.26]),
    // Drive shaft up the middle to the head.
    turned('shaft', 'shaft', 'y', [[0, 0], [0, 0.015], [top - 0.68, 0.015], [top - 0.68, 0]], [0, 0.68, 0]),
    // Gearbox head on a turntable, the rotor axle toward +z.
    disc('turntable', 'frame', 0.1, top, top + 0.02),
    box('gearbox', 'gearbox', [-0.07, top + 0.02, -0.15], [0.07, top + 0.13, 0.10]),
    turned('axle', 'shaft', 'z', [[0, 0], [0, 0.02], [0.08, 0.02], [0.08, 0]], [0, hubY, 0.10]),
    turned('hub', 'hub', 'z', [[0, 0], [0, 0.06], [0.04, 0.06], [0.07, 0.03], [0.07, 0]], [0, hubY, 0.18]),
    // Tail boom and vane behind.
    box('tail-boom', 'frame', [-0.015, hubY - 0.015, -0.55], [0.015, hubY + 0.015, -0.15]),
    prism('vane', 'vane', 'x', [[hubY - 0.08, -0.55], [hubY - 0.04, -0.35], [hubY + 0.04, -0.35], [hubY + 0.20, -0.55]], -0.004, 0.004),
  ] + [
    blade('blade-%d' % i, 'blade', 0, hubY, i * std.pi / 3 + std.pi / 6, 0.05, 0.40, 0.06, 0.12, 0.20, 0.215)
    for i in std.range(0, 5)
  ], { frame: 'steel-galvanised', deck: 'steel-grey', housing: 'paint-green', hopper: 'steel-galvanised', shaft: 'steel-grey', gearbox: 'paint-green', hub: 'steel-grey', blade: 'paint-white', vane: 'paint-red' }) + { voxelGrain: 0.01 },

  // A compact point-and-shoot camera, 100 by 60 by 30 mm, its lens toward +z and screen on the back.
  h.compound('camera', 0.2, [
    box('body', 'body', [-0.050, 0, -0.015], [0.050, 0.060, 0.015]),
    box('grip', 'trim', [-0.050, 0.004, 0.015], [-0.034, 0.056, 0.019]),
    turned('lens-ring', 'trim', 'z', [[0, 0], [0, 0.019], [0.006, 0.019], [0.006, 0]], [0.012, 0.030, 0.015]),
    turned('lens-barrel', 'body', 'z', [[0, 0], [0, 0.016], [0.012, 0.015], [0.012, 0]], [0.012, 0.030, 0.021]),
    turned('lens', 'lens', 'z', [[0, 0], [0, 0.010], [0.002, 0.009], [0.002, 0]], [0.012, 0.030, 0.033]),
    box('flash', 'flash', [-0.032, 0.046, 0.015], [-0.014, 0.054, 0.017]),
    box('finder', 'lens', [0.032, 0.048, 0.015], [0.042, 0.054, 0.017]),
    disc('shutter', 'button', 0.005, 0.060, 0.064, 0.034, 0),
    disc('power', 'trim', 0.003, 0.060, 0.062, 0.018, 0),
    box('screen', 'screen', [-0.040, 0.008, -0.017], [0.022, 0.052, -0.015]),
    box('dial', 'trim', [0.030, 0.020, -0.017], [0.042, 0.040, -0.015]),
  ], { body: 'alu-bare', trim: 'plastic-charcoal', lens: 'glass-grey', flash: 'plastic-frosted', button: 'steel-stainless', screen: 'screen-black' }) + h.inHand('camera', 'body') + { voxelGrain: 0.002 },

  // A digital single-lens reflex camera, a 140 by 100 by 75 mm body with a 110 mm zoom lens toward +z,
  // the hand grip on the camera's right (-x), a prism hump and hot shoe on top.
  h.compound('camera_pro', 1.3, [
    box('body', 'body', [-0.070, 0, -0.035], [0.070, 0.080, 0.035]),
    box('grip', 'grip', [-0.070, 0, 0.035], [-0.040, 0.078, 0.055]),
    box('hump', 'body', [-0.022, 0.080, -0.032], [0.022, 0.100, 0.022]),
    prism('hump-face', 'body', 'x', [[0.080, 0.022], [0.080, 0.034], [0.100, 0.022]], -0.022, 0.022),
    box('shoe', 'metal', [-0.010, 0.100, -0.012], [0.010, 0.104, 0.010]),
    disc('mode-dial', 'trim', 0.012, 0.080, 0.090, 0.048, -0.008),
    disc('shutter', 'metal', 0.006, 0.078, 0.084, -0.055, 0.045),
    turned('mount', 'metal', 'z', [[0, 0], [0, 0.030], [0.005, 0.030], [0.005, 0]], [0.004, 0.042, 0.035]),
    turned('lens', 'lens', 'z', [[0, 0], [0, 0.034], [0.110, 0.034], [0.110, 0]], [0.004, 0.042, 0.040]),
    turned('zoom-ring', 'grip', 'z', [[0, 0], [0, 0.036], [0.035, 0.036], [0.035, 0]], [0.004, 0.042, 0.060]),
    turned('focus-ring', 'grip', 'z', [[0, 0], [0, 0.0355], [0.015, 0.0355], [0.015, 0]], [0.004, 0.042, 0.115]),
    turned('front-ring', 'trim', 'z', [[0, 0], [0, 0.036], [0.006, 0.036], [0.006, 0]], [0.004, 0.042, 0.144]),
    turned('glass', 'glass', 'z', [[0, 0], [0, 0.028], [0.002, 0.028], [0.002, 0]], [0.004, 0.042, 0.150]),
    box('screen', 'screen', [-0.045, 0.010, -0.037], [0.035, 0.065, -0.035]),
    box('eyecup', 'grip', [-0.012, 0.072, -0.044], [0.012, 0.094, -0.032]),
  ], { body: 'polymer-black', grip: 'rubber-black', metal: 'steel-stainless', trim: 'plastic-charcoal', lens: 'polymer-black', glass: 'glass-grey', screen: 'screen-black' }) + h.inHand('camera_pro', 'grip') + { voxelGrain: 0.004 },

  // A candy-bar mobile phone, 110 by 48 by 16 mm, lying screen up with its earpiece toward -z: a small
  // display above a twelve-key pad and a round navigation key, a stub antenna on top.
  h.compound('cell_phone', 0.079, [
    box('body', 'body', [-0.024, 0, -0.055], [0.024, 0.014, 0.055]),
    box('face', 'face', [-0.022, 0.014, -0.053], [0.022, 0.016, 0.053]),
    box('screen', 'screen', [-0.017, 0.016, -0.040], [0.017, 0.017, -0.010]),
    box('earpiece', 'key', [-0.006, 0.016, -0.050], [0.006, 0.017, -0.047]),
    disc('nav', 'nav', 0.007, 0.016, 0.018, 0, 0.001),
    box('soft-left', 'key', [-0.019, 0.016, -0.004], [-0.010, 0.0175, 0.002]),
    box('soft-right', 'key', [0.010, 0.016, -0.004], [0.019, 0.0175, 0.002]),
    turned('antenna', 'body', 'y', [[0, 0], [0, 0.004], [0.012, 0.0035], [0.012, 0]], [0.016, 0.004, -0.058]),
  ] + [
    box('key-%d-%d' % [c, r], 'key', [-0.019 + c * 0.0135, 0.016, 0.012 + r * 0.0095], [-0.010 + c * 0.0135, 0.0175, 0.019 + r * 0.0095])
    for c in std.range(0, 2)
    for r in std.range(0, 3)
  ], { body: 'plastic-charcoal', face: 'alu-bare', screen: 'lcd-green', key: 'plastic-grey', nav: 'steel-stainless' }) + { voxelGrain: 0.002 },

  // A handmade Yagi antenna on a 600 mm square wooden boom, pointing toward +x: a reflector, a split driven
  // element with its coax lead and four directors, copper rods running across z.
  local y = 0.012, el(id, slot, x, half) = turned(id, slot, 'z', [[0, 0], [0, 0.003], [2 * half, 0.003], [2 * half, 0]], [x, y, -half]);
  h.compound('directional_antenna', 0.26, [
    box('boom', 'boom', [-0.300, y - 0.010, -0.010], [0.300, y + 0.010, 0.010]),
    el('reflector', 'element', -0.270, 0.170),
    turned('driven-a', 'element', 'z', [[0, 0], [0, 0.003], [0.150, 0.003], [0.150, 0]], [-0.150, y, -0.160]),
    turned('driven-b', 'element', 'z', [[0, 0], [0, 0.003], [0.150, 0.003], [0.150, 0]], [-0.150, y, 0.010]),
    box('terminal', 'terminal', [-0.165, y + 0.010, -0.015], [-0.135, y + 0.016, 0.015]),
    turned('lead', 'lead', 'x', [[0, 0], [0, 0.003], [0.130, 0.003], [0.130, 0]], [-0.295, y + 0.013, 0.006]),
    el('director-a', 'element', -0.050, 0.145),
    el('director-b', 'element', 0.060, 0.140),
    el('director-c', 'element', 0.170, 0.135),
    el('director-d', 'element', 0.275, 0.130),
    box('clamp', 'terminal', [-0.240, y - 0.014, -0.014], [-0.200, y + 0.014, 0.014]),
  ], { boom: 'wood-pine', element: 'copper', terminal: 'plastic-black', lead: 'plastic-black' }) + { handling: h.gripOn('directional_antenna', 'boom') } + { voxelGrain: 0.002 },

  // A 158 by 115 by 8 mm e-ink tablet lying screen up, the wide bezel with page buttons toward -x.
  h.compound('eink_tablet_pc', 0.16, [
    box('back', 'back', [-0.079, 0, -0.0575], [0.079, 0.006, 0.0575]),
    box('bezel', 'bezel', [-0.078, 0.006, -0.0565], [0.078, 0.008, 0.0565]),
    box('screen', 'screen', [-0.058, 0.008, -0.050], [0.073, 0.0085, 0.050]),
    box('page-up', 'button', [-0.072, 0.008, -0.022], [-0.064, 0.009, -0.004]),
    box('page-down', 'button', [-0.072, 0.008, 0.004], [-0.064, 0.009, 0.022]),
    box('power', 'button', [0.040, 0.002, -0.0585], [0.055, 0.005, -0.0575]),
  ], { back: 'alu-bare', bezel: 'plastic-charcoal', screen: 'paper-white', button: 'plastic-grey' }) + { voxelGrain: 0.002 },

  // A hand-built port probe, 125 by 75 by 45 mm, lying face up: a rubber-bumpered box with a small display and
  // keys, a bank of plugs and sockets across its top end (-z) and down one side, and two flying leads.
  h.compound('electrohack', 0.28, [
    box('body', 'body', [-0.035, 0, -0.060], [0.035, 0.040, 0.060]),
    box('bumper-a', 'bumper', [-0.0375, 0, -0.0625], [0.0375, 0.042, -0.054]),
    box('bumper-b', 'bumper', [-0.0375, 0, 0.054], [0.0375, 0.042, 0.0625]),
    box('screen', 'screen', [-0.025, 0.040, -0.042], [0.025, 0.041, -0.010]),
    box('pcb', 'pcb', [-0.028, 0.040, 0.000], [0.028, 0.0405, 0.048]),
    box('lead-a', 'lead', [-0.030, 0.012, -0.090], [-0.024, 0.018, -0.0625]),
    box('lead-b', 'lead', [0.024, 0.012, -0.085], [0.030, 0.018, -0.0625]),
    box('clip-a', 'clip', [-0.032, 0.010, -0.105], [-0.022, 0.020, -0.090]),
    box('clip-b', 'clip', [0.022, 0.010, -0.100], [0.032, 0.020, -0.085]),
  ] + [
    box('key-%d-%d' % [c, r], 'key', [-0.022 + c * 0.016, 0.0405, 0.005 + r * 0.014], [-0.012 + c * 0.016, 0.043, 0.014 + r * 0.014])
    for c in std.range(0, 2)
    for r in std.range(0, 2)
  ] + [
    box('port-top-%d' % i, if i % 2 == 0 then 'port' else 'socket', [-0.018 + i * 0.012, 0.022, -0.068], [-0.010 + i * 0.012, 0.032, -0.0625])
    for i in std.range(0, 3)
  ] + [
    box('port-side-%d' % i, if i % 2 == 0 then 'socket' else 'port', [0.035, 0.012, -0.040 + i * 0.018], [0.041, 0.026, -0.030 + i * 0.018])
    for i in std.range(0, 4)
  ], { body: 'polymer-od-green', bumper: 'rubber-black', screen: 'lcd-green', pcb: 'circuit-green', key: 'plastic-grey', port: 'steel-stainless', socket: 'brass', lead: 'plastic-red', clip: 'plastic-black' }) + { voxelGrain: 0.002 },

  // A handheld field meter, 160 by 65 by 35 mm, lying face up with its sensor head toward -z: a rubber
  // boot, a display, a row of signal lamps and a selector knob.
  h.compound('emf_detector', 0.19, [
    box('body', 'body', [-0.0325, 0, -0.060], [0.0325, 0.035, 0.080]),
    box('boot-a', 'boot', [-0.034, 0, 0.066], [0.034, 0.036, 0.081]),
    box('boot-b', 'boot', [-0.034, 0, -0.061], [0.034, 0.036, -0.052]),
    turned('head', 'head', 'z', [[0, 0], [0, 0.020], [0.020, 0.024], [0.022, 0.024], [0.022, 0]], [0, 0.0175, -0.082]),
    box('screen', 'screen', [-0.022, 0.035, -0.040], [0.022, 0.036, -0.012]),
    disc('knob', 'knob', 0.010, 0.035, 0.042, 0, 0.012),
    box('knob-mark', 'lamp-red', [-0.001, 0.042, 0.004], [0.001, 0.043, 0.012]),
  ] + [
    box('lamp-%d' % i, if i < 2 then 'lamp-green' else if i < 4 then 'lamp-yellow' else 'lamp-red', [-0.022 + i * 0.009, 0.035, -0.054], [-0.016 + i * 0.009, 0.037, -0.048])
    for i in std.range(0, 4)
  ], { body: 'plastic-yellow', boot: 'rubber-black', head: 'plastic-charcoal', screen: 'lcd-green', knob: 'plastic-black', 'lamp-green': 'plastic-green', 'lamp-yellow': 'plastic-orange', 'lamp-red': 'plastic-red' }) + h.inHand('emf_detector', 'body') + { voxelGrain: 0.002 },
]
