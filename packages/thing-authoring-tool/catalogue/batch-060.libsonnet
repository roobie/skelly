local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A flat arc in the x-y plane, `t` thick on z about `z`, from angle a0 to a1 (degrees, 0 on +x, 90 on +y) between
// radii r0 and r1 round (cx, cy), as convex quads.
local arc(prefix, slot, cx, cy, r0, r1, a0, a1, steps, t, z=0) = [
  local a = std.pi * (a0 + (a1 - a0) * i / steps) / 180;
  local b = std.pi * (a0 + (a1 - a0) * (i + 1) / steps) / 180;
  h.prism('%s-%d' % [prefix, i], slot, 'z', [
    [cx + r0 * std.cos(a), cy + r0 * std.sin(a)],
    [cx + r1 * std.cos(a), cy + r1 * std.sin(a)],
    [cx + r1 * std.cos(b), cy + r1 * std.sin(b)],
    [cx + r0 * std.cos(b), cy + r0 * std.sin(b)],
  ], z - t / 2, z + t / 2)
  for i in std.range(0, steps - 1)
];
// A wire bail standing over a lantern, `r` round, its ends at height `y`.
local bail(prefix, slot, r, y, w=0.004) = arc(prefix, slot, 0, y, r - w, r, 0, 180, 16, w);
// A pressure lantern's top from height `y`: posts either side of a glass globe `ht` tall and `r` round, under a vented
// hood and a bail. Slots: globe, frame, hood, bail.
local lanternTop(y, ht, r) = [
  turned('globe', 'globe', 'y', [[y, 0], [y, r], [y + ht, r], [y + ht, 0]]),
  box('post-l', 'frame', [-r - 0.004, y, -0.002], [-r - 0.001, y + ht, 0.002]),
  box('post-r', 'frame', [r + 0.001, y, -0.002], [r + 0.004, y + ht, 0.002]),
  turned('gallery', 'frame', 'y', [[y + ht, 0], [y + ht, r + 0.006], [y + ht + 0.006, r + 0.006], [y + ht + 0.006, 0]]),
  turned('hood', 'hood', 'y', [[y + ht + 0.006, 0], [y + ht + 0.006, r + 0.012], [y + ht + 0.012, r + 0.012], [y + ht + 0.03, 0.016], [y + ht + 0.03, 0]]),
  turned('vent', 'frame', 'y', [[y + ht + 0.03, 0], [y + ht + 0.03, 0.01], [y + ht + 0.04, 0.01], [y + ht + 0.04, 0]]),
] + bail('bail', 'bail', r + 0.012, y + ht + 0.012);
// A torch lying along x, lens at +x: a list of [x, radius] stations for its body.
local torchBody(id, slot, stations) = turned(id, slot, 'x', [[stations[0][0], 0]] + stations + [[stations[std.length(stations) - 1][0], 0]]);
[
  // A thin dinner taper, 15 cm tall and 13 mm across at the foot, narrowing to the wick.
  h.compound('small_candle', 0.014, [
    turned('wax', 'wax', 'y', [[0, 0], [0, 0.0065], [0.135, 0.0058], [0.145, 0.004], [0.148, 0]]),
    disc('wick', 'wick', 0.0008, 0.146, 0.152),
  ], { wax: 'wax-ivory', wick: 'cloth-charred' }) + h.inHand('small_candle', 'wax') + { voxelGrain: 0.002 },

  // A pocket diving torch, 10 cm long and 25 mm across: a knurled aluminium tube, a sealed tail cap and a
  // rubber-ringed head round the lens at +x.
  h.compound('mini_diving_flashlight', 0.072, [
    torchBody('tail', 'cap', [[0, 0.0105], [0.012, 0.0115], [0.016, 0.011]]),
    torchBody('tube', 'body', [[0.016, 0.0105], [0.07, 0.0105], [0.074, 0.0125]]),
    torchBody('grip-a', 'grip', [[0.026, 0.0112], [0.032, 0.0112]]),
    torchBody('grip-b', 'grip', [[0.038, 0.0112], [0.044, 0.0112]]),
    torchBody('grip-c', 'grip', [[0.050, 0.0112], [0.056, 0.0112]]),
    torchBody('head', 'body', [[0.074, 0.0125], [0.094, 0.0125]]),
    torchBody('o-ring', 'seal', [[0.092, 0.0132], [0.096, 0.0132]]),
    torchBody('bezel', 'bezel', [[0.096, 0.013], [0.1, 0.013]]),
    turned('lens', 'lens', 'x', [[0, 0], [0, 0.01], [0.0012, 0.01], [0.0012, 0]], [0.1, 0, 0]),
    box('lanyard', 'cap', [0.001, -0.004, -0.0125], [0.008, 0.004, -0.010]),
  ], { body: 'alu-anodized-black', grip: 'alu-bare', cap: 'plastic-black', seal: 'plastic-orange', bezel: 'alu-bare', lens: 'glass-clear' }) + {
    handling: h.gripOn('mini_diving_flashlight', 'tube'),
    voxelGrain: 0.002,
  },

  // A larger dive light, 13 cm long: a 4 cm plastic barrel with a rubber grip sleeve, a rotary power collar behind a
  // wide head, and a mounting lug underneath for a wrist strap.
  h.compound('variable_diving_flashlight', 0.22, [
    torchBody('tail', 'cap', [[0, 0.016], [0.004, 0.018], [0.014, 0.018]]),
    torchBody('barrel', 'body', [[0.014, 0.017], [0.08, 0.017]]),
    torchBody('sleeve', 'grip', [[0.022, 0.0185], [0.07, 0.0185]]),
    torchBody('collar', 'collar', [[0.08, 0.02], [0.094, 0.02]]),
    torchBody('head', 'body', [[0.094, 0.021], [0.12, 0.024], [0.126, 0.024]]),
    torchBody('bezel', 'cap', [[0.126, 0.0245], [0.13, 0.0245]]),
    turned('lens', 'lens', 'x', [[0, 0], [0, 0.02], [0.0015, 0.02], [0.0015, 0]], [0.13, 0, 0]),
    box('lug', 'cap', [0.03, -0.026, -0.006], [0.07, -0.016, 0.006]),
    box('mark', 'collar', [0.086, 0.019, -0.002], [0.09, 0.023, 0.002]),
  ], { body: 'plastic-yellow', grip: 'rubber-black', cap: 'plastic-black', collar: 'plastic-charcoal', lens: 'glass-clear' }) + {
    handling: h.gripOn('variable_diving_flashlight', 'barrel'),
    voxelGrain: 0.002,
  },

  // A battery camping lantern, 21 cm tall to the folded handle: a 11 cm base with the switch, a frosted
  // diffuser and a vented top cap.
  h.compound('electric_lantern', 0.45, [
    turned('base', 'body', 'y', [[0, 0], [0, 0.052], [0.006, 0.055], [0.05, 0.05], [0.058, 0.044], [0.058, 0]]),
    turned('diffuser', 'diffuser', 'y', [[0.058, 0], [0.058, 0.04], [0.14, 0.04], [0.14, 0]]),
    turned('cap', 'body', 'y', [[0.14, 0], [0.14, 0.046], [0.152, 0.046], [0.162, 0.03], [0.165, 0]]),
    disc('rib-a', 'body', 0.042, 0.08, 0.083),
    disc('rib-b', 'body', 0.042, 0.115, 0.118),
    box('post-l', 'body', [-0.042, 0.058, -0.003], [-0.038, 0.14, 0.003]),
    box('post-r', 'body', [0.038, 0.058, -0.003], [0.042, 0.14, 0.003]),
    box('switch', 'switch', [-0.012, 0.022, 0.05], [0.012, 0.036, 0.056]),
    box('hinge-l', 'handle', [-0.036, 0.162, -0.004], [-0.03, 0.172, 0.004]),
    box('hinge-r', 'handle', [0.03, 0.162, -0.004], [0.036, 0.172, 0.004]),
  ] + arc('handle', 'handle', 0, 0.172, 0.029, 0.036, 0, 180, 10, 0.008), {
    body: 'plastic-green', diffuser: 'plastic-frosted', switch: 'plastic-black', handle: 'plastic-black',
  }) + h.inHand('electric_lantern', 'base') + { voxelGrain: 0.004 },

  // A small pressure lantern burning white gas, 24 cm tall to the bail: a 10 cm fount with its pump and valve on the
  // front, a glass globe between two posts and a vented hood.
  h.compound('gasoline_lantern', 0.88, [
    turned('fount', 'fount', 'y', [[0, 0], [0, 0.048], [0.004, 0.05], [0.055, 0.05], [0.068, 0.04], [0.074, 0.02], [0.074, 0]]),
    turned('collar', 'frame', 'y', [[0.074, 0], [0.074, 0.024], [0.084, 0.024], [0.084, 0]]),
    turned('pump', 'brass', 'z', [[0, 0], [0, 0.006], [0.016, 0.006], [0.016, 0.009], [0.022, 0.009], [0.022, 0]], [0.018, 0.03, 0.045]),
    turned('valve', 'brass', 'z', [[0, 0], [0, 0.004], [0.012, 0.004], [0.012, 0.01], [0.016, 0.01], [0.016, 0]], [-0.012, 0.064, 0.03]),
    turned('filler', 'brass', 'y', [[0, 0], [0, 0.008], [0.008, 0.008], [0.008, 0]], [-0.03, 0.062, -0.012]),
  ] + lanternTop(0.084, 0.08, 0.034), {
    fount: 'paint-red', frame: 'steel-grey', brass: 'brass', globe: 'glass-clear', hood: 'paint-red', bail: 'steel-grey',
  }) + h.inHand('gasoline_lantern', 'fount') + { voxelGrain: 0.004 },

  // A propane lantern head, 20 cm tall to the bail, that screws onto a gas cylinder: a burner collar with its valve
  // knob and igniter button, a glass globe and a vented hood.
  h.compound('propane_lantern', 0.55, [
    turned('thread', 'brass', 'y', [[0, 0], [0, 0.011], [0.016, 0.011], [0.016, 0]]),
    turned('base', 'fount', 'y', [[0.016, 0], [0.016, 0.02], [0.022, 0.034], [0.046, 0.034], [0.05, 0.03], [0.05, 0]]),
    turned('valve', 'knob', 'z', [[0, 0], [0, 0.005], [0.012, 0.005], [0.012, 0.012], [0.02, 0.012], [0.02, 0]], [0, 0.032, 0.03]),
    box('igniter', 'knob', [0.024, 0.026, -0.008], [0.04, 0.04, 0.008]),
  ] + lanternTop(0.05, 0.075, 0.032), {
    fount: 'paint-green', frame: 'steel-grey', brass: 'brass', knob: 'plastic-black', globe: 'glass-clear', hood: 'paint-green', bail: 'steel-grey',
  }) + h.inHand('propane_lantern', 'base') + { voxelGrain: 0.004 },

  // A hand-held road flare, 30 cm long and 28 mm across: a red paper tube with a plastic cap over the striker at +x
  // and a plastic grip plug at the other end.
  h.compound('handflare', 0.12, [
    torchBody('plug', 'plug', [[0, 0.012], [0.03, 0.012], [0.03, 0.0145], [0.036, 0.0145]]),
    torchBody('tube', 'tube', [[0.036, 0.014], [0.27, 0.014]]),
    torchBody('band', 'label', [[0.12, 0.0143], [0.18, 0.0143]]),
    torchBody('cap', 'cap', [[0.262, 0.0155], [0.3, 0.0155]]),
    torchBody('striker', 'striker', [[0.3, 0.012], [0.302, 0.012]]),
  ], { plug: 'plastic-black', tube: 'paint-red', label: 'paper-white', cap: 'plastic-black', striker: 'paperboard-brown' }) + {
    handling: h.gripOn('handflare', 'plug'),
    voxelGrain: 0.002,
  },

  // A firefighter's right-angle light, switched on: a 16 cm upright polymer body with the round lens facing +z near
  // the top, a guarded push switch on top and a spring clip on the back.
  h.compound('heavy_flashlight', 0.54, [
    box('body', 'body', [-0.032, 0, -0.026], [0.032, 0.13, 0.026]),
    box('shoulder', 'body', [-0.034, 0.13, -0.028], [0.034, 0.152, 0.03]),
    box('guard-l', 'body', [-0.022, 0.152, -0.01], [-0.016, 0.16, 0.01]),
    box('guard-r', 'body', [0.016, 0.152, -0.01], [0.022, 0.16, 0.01]),
    box('switch', 'switch', [-0.012, 0.152, -0.008], [0.012, 0.157, 0.008]),
    turned('head', 'bezel', 'z', [[0, 0], [0, 0.026], [0.008, 0.026], [0.008, 0]], [0, 0.112, 0.026]),
    turned('lens', 'lens', 'z', [[0, 0], [0, 0.021], [0.009, 0.021], [0.009, 0]], [0, 0.112, 0.026]),
    box('grip-a', 'grip', [-0.034, 0.02, -0.02], [-0.032, 0.08, 0.02]),
    box('grip-b', 'grip', [0.032, 0.02, -0.02], [0.034, 0.08, 0.02]),
    box('clip', 'clip', [-0.012, 0.03, -0.031], [0.012, 0.14, -0.027]),
    box('clip-hinge', 'clip', [-0.014, 0.13, -0.031], [0.014, 0.145, -0.026]),
    box('battery-door', 'grip', [-0.026, 0.004, 0.026], [0.026, 0.04, 0.028]),
  ], { body: 'plastic-orange', switch: 'rubber-black', bezel: 'plastic-black', lens: 'crystal-glow-white', grip: 'rubber-black', clip: 'steel-grey' }) + h.inHand('heavy_flashlight', 'body') + { voxelGrain: 0.004 },

  // Eight metres of LED strip wound on a 9 cm reel with an open spoked front, the loose end hanging off with its plug.
  h.compound('lightstrip', 0.15, [
    turned('rim-front', 'reel', 'z', [[0, 0.041], [0, 0.045], [0.0015, 0.045], [0.0015, 0.041], [0, 0.041]], [0, 0.045, 0.005]),
    box('spoke-v', 'reel', [-0.003, 0.004, 0.005], [0.003, 0.086, 0.0065]),
    box('spoke-h', 'reel', [-0.041, 0.042, 0.005], [0.041, 0.048, 0.0065]),
    turned('flange-back', 'reel', 'z', [[0, 0], [0, 0.045], [0.0015, 0.045], [0.0015, 0]], [0, 0.045, -0.0065]),
    turned('hub', 'reel', 'z', [[0, 0.008], [0, 0.016], [0.0115, 0.016], [0.0115, 0.008], [0, 0.008]], [0, 0.045, -0.005]),
    turned('coil', 'strip', 'z', [[0, 0.016], [0, 0.036], [0.01, 0.036], [0.01, 0.016], [0, 0.016]], [0, 0.045, -0.005]),
  ] + [
    local a = 2 * std.pi * i / 16;
    box('led-%d' % i, 'led', [0.0365 * std.cos(a) - 0.002, 0.045 + 0.0365 * std.sin(a) - 0.002, -0.004], [0.0365 * std.cos(a) + 0.002, 0.045 + 0.0365 * std.sin(a) + 0.002, 0.004])
    for i in std.range(0, 15)
  ] + [
    box('tail', 'strip', [0.036, 0.0, -0.005], [0.075, 0.0012, 0.005]),
    box('tail-led-a', 'led', [0.05, 0.0012, -0.002], [0.054, 0.0025, 0.002]),
    box('tail-led-b', 'led', [0.064, 0.0012, -0.002], [0.068, 0.0025, 0.002]),
    box('tail-plug', 'plug', [0.075, 0.0, -0.006], [0.088, 0.006, 0.006]),
  ], { reel: 'plastic-black', strip: 'plastic-gloss-white', led: 'plastic-yellow', plug: 'plastic-black' }) + h.inHand('lightstrip', 'coil') + { voxelGrain: 0.002 },

  // A nine-branched candleholder for Hanukkah, 18 cm across and 18 cm tall: eight cups on four nested half-round
  // arms facing +z, and a raised ninth cup on the centre stem.
  local menorahArm(i) = arc('arm-%d' % i, 'metal', 0, 0.15, 0.021 * i - 0.0022, 0.021 * i + 0.0022, 180, 360, 4 + 3 * i, 0.0044);
  local cup(id, x, y) = turned(id, 'metal', 'y', [[0, 0], [0, 0.003], [0.004, 0.0065], [0.012, 0.0065], [0.012, 0]], [x, y, 0]);
  h.compound('menorah', 0.65, [
    turned('base', 'metal', 'y', [[0, 0], [0, 0.045], [0.006, 0.045], [0.012, 0.03], [0.022, 0.008], [0.022, 0]]),
    disc('stem', 'metal', 0.0045, 0.022, 0.17),
    disc('knop', 'metal', 0.008, 0.06, 0.066),
    cup('cup-centre', 0, 0.17),
  ] + std.flattenArrays([menorahArm(i) for i in std.range(1, 4)]) + [
    cup('cup-%s%d' % [if side < 0 then 'l' else 'r', i], side * 0.021 * i, 0.15)
    for i in std.range(1, 4)
    for side in [-1, 1]
  ], { metal: 'metal-silver' }) + h.inHand('menorah', 'base') + { voxelGrain: 0.002 },

  // A wheel-thrown clay oil lamp, 14 cm long: a round closed bowl 9 cm across with a sunken top and fill hole, a
  // nozzle to +z for the wick and a tab handle at the back.
  h.compound('oil_lamp_clay', 0.14, [
    turned('foot', 'clay', 'y', [[0, 0], [0, 0.028], [0.005, 0.028], [0.005, 0]]),
    turned('bowl', 'clay', 'y', [[0.005, 0], [0.005, 0.034], [0.012, 0.044], [0.024, 0.045], [0.032, 0.04], [0.034, 0.032], [0.034, 0]]),
    turned('discus', 'clay-dark', 'y', [[0, 0], [0, 0.026], [0.002, 0.026], [0.002, 0]], [0, 0.032, 0]),
    disc('fill-hole', 'hole', 0.006, 0.0335, 0.0345),
    h.prism('nozzle', 'clay', 'y', [[0.03, -0.016], [0.03, 0.016], [0.07, 0.013], [0.085, 0.009], [0.088, 0], [0.085, -0.009], [0.07, -0.013]], 0.012, 0.03),
    disc('wick-hole', 'hole', 0.005, 0.03, 0.031, 0, 0.074),
    disc('wick', 'wick', 0.0025, 0.031, 0.035, 0, 0.074),
    box('handle', 'clay', [-0.004, 0.012, -0.058], [0.004, 0.044, -0.04]),
    box('handle-top', 'clay', [-0.004, 0.036, -0.052], [0.004, 0.048, -0.034]),
  ], { clay: 'clay-terracotta', 'clay-dark': 'brick-buff', hole: 'coal-black', wick: 'cloth-charred' }) + h.inHand('oil_lamp_clay', 'bowl') + { voxelGrain: 0.002 },

  // An old brass acetylene lamp, 15 cm tall: a gas chamber below a water tank with its drip valve on top, a polished
  // reflector facing +z round the burner tip, and a hanging hook at the back.
  h.compound('oxylamp', 0.53, [
    turned('chamber', 'brass', 'y', [[0, 0], [0, 0.034], [0.004, 0.036], [0.066, 0.036], [0.07, 0.033], [0.07, 0]]),
    turned('joint', 'band', 'y', [[0.07, 0], [0.07, 0.038], [0.078, 0.038], [0.078, 0]]),
    turned('tank', 'brass', 'y', [[0.078, 0], [0.078, 0.034], [0.118, 0.034], [0.126, 0.022], [0.128, 0]]),
    disc('valve-stem', 'band', 0.003, 0.128, 0.138),
    box('valve-lever', 'band', [-0.016, 0.136, -0.003], [0.016, 0.141, 0.003]),
    turned('reflector', 'reflector', 'z', [[0, 0], [0, 0.012], [0.022, 0.045], [0.026, 0.047], [0.026, 0]], [0, 0.1, 0.03]),
    turned('reflector-face', 'mirror', 'z', [[0, 0], [0, 0.04], [0.0012, 0.04], [0.0012, 0]], [0, 0.1, 0.056]),
    turned('burner', 'band', 'z', [[0, 0], [0, 0.003], [0.012, 0.003], [0.012, 0.0045], [0.016, 0.0045], [0.016, 0]], [0, 0.1, 0.057]),
    box('hook-back', 'band', [-0.003, 0.06, -0.044], [0.003, 0.15, -0.04]),
    box('hook-top', 'band', [-0.003, 0.146, -0.04], [0.003, 0.15, -0.02]),
    box('hook-tip', 'band', [-0.003, 0.136, -0.024], [0.003, 0.15, -0.02]),
  ], { brass: 'brass', band: 'brass-dull', reflector: 'brass-polished', mirror: 'mirror-silver' }) + h.inHand('oxylamp', 'chamber') + { voxelGrain: 0.002 },

  // A clip-on book light, 13 cm long: a spring clip, a gooseneck arching over to +x and a small LED head facing down.
  h.compound('reading_light', 0.05, [
    box('jaw-low', 'body', [-0.06, 0, -0.01], [-0.01, 0.004, 0.01]),
    box('jaw-high', 'body', [-0.06, 0.012, -0.01], [-0.012, 0.017, 0.01]),
    box('spring', 'pad', [-0.062, 0.004, -0.008], [-0.054, 0.012, 0.008]),
    box('pad-low', 'pad', [-0.02, 0.004, -0.009], [-0.01, 0.0055, 0.009]),
    box('button', 'pad', [-0.045, 0.017, -0.004], [-0.037, 0.02, 0.004]),
  ] + arc('neck', 'neck', 0.02, 0.017, 0.047, 0.053, 60, 180, 14, 0.006) + [
    box('head', 'body', [0.032, 0.056, -0.013], [0.078, 0.066, 0.013]),
    box('led', 'led', [0.038, 0.054, -0.01], [0.074, 0.056, 0.01]),
  ], { body: 'plastic-black', pad: 'rubber-black', neck: 'alu-bare', led: 'plastic-frosted' }) + h.inHand('reading_light', 'jaw-high') + { voxelGrain: 0.002 },

  // A remote-controlled table lamp, 23 cm tall: a weighted round base, a slim aluminium stem and a white mushroom
  // shade with a frosted diffuser underneath.
  h.compound('smart_lamp', 0.6, [
    turned('base', 'body', 'y', [[0, 0], [0, 0.055], [0.01, 0.055], [0.016, 0.045], [0.016, 0]]),
    disc('status', 'status', 0.003, 0.016, 0.0175, 0, 0.03),
    disc('stem', 'stem', 0.006, 0.016, 0.175),
    disc('diffuser', 'diffuser', 0.058, 0.172, 0.176),
    turned('shade', 'body', 'y', [[0.176, 0], [0.176, 0.068], [0.184, 0.068], [0.205, 0.058], [0.222, 0.036], [0.23, 0.012], [0.231, 0]]),
  ], { body: 'plastic-gloss-white', stem: 'alu-bare', diffuser: 'plastic-frosted', status: 'plastic-clear-blue' }) + h.inHand('smart_lamp', 'base') + { voxelGrain: 0.004 },
]
