local h = import '../compound.libsonnet';
local box = h.box;
// A ball of radius `r` turned about y, its centre at [x, y, z]; `squash` scales its height.
local ball(id, slot, r, x, y, z, squash=1, steps=8) =
  local pts = [
    local a = std.pi * i / steps;
    [r * squash * (1 - std.cos(a)), r * std.sin(a)]
    for i in std.range(0, steps)
  ];
  h.turned(id, slot, 'y', [[0, 0]] + pts[1:std.length(pts) - 1] + [[2 * r * squash, 0]], [x, y - r * squash, z]);
// A straight strand `w` wide from [x, y] point `a` to `b`, standing from z0 to z1: strings, cables and struts that run
// at a slant across the xy plane.
local strand(id, slot, a, b, w, z0, z1) =
  local dx = b[0] - a[0], dy = b[1] - a[1], len = std.sqrt(dx * dx + dy * dy);
  local nx = -dy / len * w / 2, ny = dx / len * w / 2;
  h.prism(id, slot, 'z', [[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]], z0, z1);
// A toothed wheel facing +z: a disc of radius `r` from z0 to z1 with `n` square teeth round its rim.
local gear(prefix, slot, r, n, x, y, z0, z1) =
  [h.turned(prefix, slot, 'z', [[0, 0], [0, r], [z1 - z0, r], [z1 - z0, 0]], [x, y, z0])] + [
    local a = 2 * std.pi * i / n, t = r * 0.18;
    local cx = x + (r + t / 2) * std.cos(a), cy = y + (r + t / 2) * std.sin(a);
    box('%s-tooth-%d' % [prefix, i], slot, [cx - t / 2, cy - t / 2, z0], [cx + t / 2, cy + t / 2, z1])
    for i in std.range(0, n - 1)
  ];
// The rune-engine's steel case, 400 mm wide, 250 mm tall and 200 mm deep, with a porthole on its front onto the
// rune pebble, coils and cables on top and a geared drum on its right side. `core` is the pebble's slot.
local runeEngine = [
  box('case', 'steel', [-0.2, 0.0, -0.1], [0.2, 0.25, 0.1]),
  box('lid-seam', 'trim', [-0.202, 0.226, -0.102], [0.202, 0.232, 0.102]),
  h.turned('port-rim', 'trim', 'z', [[0, 0.05], [0, 0.068], [0.008, 0.068], [0.008, 0.05], [0, 0.05]], [-0.06, 0.12, 0.1]),
  h.turned('port-glass', 'glass', 'z', [[0, 0], [0, 0.05], [0.004, 0.05], [0.004, 0]], [-0.06, 0.12, 0.1]),
  ball('core', 'core', 0.03, -0.06, 0.12, 0.1, 0.8),
  box('core-mark-a', 'rune', [-0.066, 0.1, 0.13], [-0.054, 0.14, 0.134]),
  box('core-mark-b', 'rune', [-0.08, 0.114, 0.13], [-0.04, 0.126, 0.134]),
  // Runes inscribed round the port and along the case's front.
  box('rune-row-top', 'rune', [-0.18, 0.205, 0.1], [0.18, 0.211, 0.104]),
  box('rune-row-low', 'rune', [-0.18, 0.026, 0.1], [0.18, 0.032, 0.104]),
] + [
  box('glyph-%d' % i, 'rune', [0.04 + 0.04 * i, 0.07 + 0.02 * (i % 2), 0.1], [0.052 + 0.04 * i, 0.17 - 0.02 * (i % 2), 0.104])
  for i in [0, 1, 2]
] + [
  box('glyph-bar-%d' % i, 'rune', [0.03 + 0.04 * i, 0.114, 0.1], [0.062 + 0.04 * i, 0.122, 0.104])
  for i in [0, 1, 2]
] + [
  // Two electromagnet coils standing on the lid, wound in copper on dark cores.
  h.disc('coil-a', 'copper', 0.032, 0.25, 0.31, -0.12, -0.03),
  h.disc('coil-a-cap', 'dark', 0.036, 0.31, 0.318, -0.12, -0.03),
  h.disc('coil-b', 'copper', 0.032, 0.25, 0.31, -0.03, -0.03),
  h.disc('coil-b-cap', 'dark', 0.036, 0.31, 0.318, -0.03, -0.03),
  // A carry handle.
  box('handle-left', 'dark', [0.06, 0.25, -0.012], [0.072, 0.29, 0.012]),
  box('handle-right', 'dark', [0.148, 0.25, -0.012], [0.16, 0.29, 0.012]),
  box('handle-grip', 'dark', [0.06, 0.29, -0.014], [0.16, 0.304, 0.014]),
  // Cables looping from the coils over the case's front edge into the side.
  strand('cable-a', 'cable', [-0.12, 0.318], [-0.075, 0.33], 0.01, 0.03, 0.042),
  strand('cable-b', 'cable', [-0.075, 0.33], [-0.03, 0.318], 0.01, 0.03, 0.042),
  box('cable-c', 'cable', [-0.03, 0.25, 0.06], [0.04, 0.26, 0.072]),
  strand('cable-d', 'cable', [0.04, 0.26], [0.2, 0.2], 0.012, 0.06, 0.072),
] + [
  // A geared drum turning on the right side of the case.
  h.turned('drum', 'trim', 'x', [[0, 0], [0, 0.05], [0.02, 0.05], [0.02, 0]], [0.2, 0.12, -0.02]),
] + [
  local a = 2 * std.pi * i / 12, r = 0.054;
  box('drum-tooth-%d' % i, 'trim', [0.2, 0.12 + r * std.sin(a) - 0.006, -0.02 + r * std.cos(a) - 0.006], [0.218, 0.12 + r * std.sin(a) + 0.006, -0.02 + r * std.cos(a) + 0.006])
  for i in std.range(0, 11)
] + [
  h.turned('drum-hub', 'copper', 'x', [[0, 0], [0, 0.014], [0.03, 0.014], [0.03, 0]], [0.2, 0.12, -0.02]),
  // Feet.
  box('foot-a', 'dark', [-0.19, -0.01, -0.09], [-0.15, 0.0, 0.09]),
  box('foot-b', 'dark', [0.15, -0.01, -0.09], [0.19, 0.0, 0.09]),
];
[
  // A squat cast-iron oil lamp 220 mm across its two spouts, 100 mm wide and 70 mm tall, with a wick in each spout, a
  // ring handle at the back and a glowing rune on its belly.
  h.compound('twin_spout_rune_lamp', 2.3, [
    h.disc('foot', 'iron', 0.032, 0, 0.008),
    h.turned('body', 'iron', 'y', [[0, 0], [0, 0.03], [0.012, 0.048], [0.028, 0.05], [0.04, 0.04], [0.046, 0.02], [0.046, 0]], [0, 0.008, 0]),
    h.disc('filler', 'iron', 0.014, 0.054, 0.062),
    h.disc('filler-cap', 'trim', 0.009, 0.062, 0.068),
    h.turned('spout-right', 'iron', 'x', [[0, 0], [0, 0.013], [0.07, 0.007], [0.07, 0]], [0.04, 0.036, 0]),
    h.turned('spout-left', 'iron', 'x', [[0, 0], [0, 0.007], [0.07, 0.013], [0.07, 0]], [-0.11, 0.036, 0]),
    h.disc('wick-right', 'wick', 0.004, 0.04, 0.054, 0.104),
    h.disc('wick-left', 'wick', 0.004, 0.04, 0.054, -0.104),
    // Ring handle at the back.
    box('handle-top', 'iron', [-0.006, 0.044, -0.074], [0.006, 0.05, -0.04]),
    box('handle-back', 'iron', [-0.006, 0.02, -0.08], [0.006, 0.05, -0.074]),
    box('handle-low', 'iron', [-0.006, 0.02, -0.074], [0.006, 0.026, -0.044]),
    // A carved band round the shoulder and a rune of bars and chevrons on the front.
    h.turned('band', 'rune', 'y', [[0, 0.047], [0, 0.0505], [0.004, 0.0505], [0.004, 0.047], [0, 0.047]], [0, 0.036, 0]),
    box('rune-stem', 'rune', [-0.003, 0.012, 0.042], [0.003, 0.034, 0.05]),
    strand('rune-arm-left', 'rune', [-0.003, 0.03], [-0.016, 0.018], 0.005, 0.038, 0.048),
    strand('rune-arm-right', 'rune', [0.003, 0.03], [0.016, 0.018], 0.005, 0.038, 0.048),
    box('rune-foot', 'rune', [-0.012, 0.012, 0.04], [0.012, 0.016, 0.046]),
  ], { iron: 'iron-cast', trim: 'brass-dull', wick: 'cord-cotton', rune: 'crystal-glow-blue' }) + { handling: h.gripOn('twin_spout_rune_lamp', 'handle-back') } + { voxelGrain: 0.002 },

  // A square frame of wooden sticks 150 mm on a side and 14 mm deep, strung corner to corner with taut cord that
  // holds a rune-marked pebble in the middle; a bowed stick across the top keeps the strings under tension.
  h.compound('strung_rune_frame', 0.12, [
    box('stick-top', 'wood', [-0.075, 0.136, -0.006], [0.075, 0.148, 0.006]),
    box('stick-low', 'wood', [-0.075, 0.0, -0.006], [0.075, 0.012, 0.006]),
    box('stick-left', 'wood', [-0.075, 0.0, -0.006], [-0.063, 0.148, 0.006]),
    box('stick-right', 'wood', [0.063, 0.0, -0.006], [0.075, 0.148, 0.006]),
    strand('bow-left', 'wood', [-0.07, 0.148], [0.0, 0.17], 0.008, -0.004, 0.004),
    strand('bow-right', 'wood', [0.0, 0.17], [0.07, 0.148], 0.008, -0.004, 0.004),
    strand('string-a', 'cord', [-0.063, 0.012], [0.063, 0.136], 0.003, -0.002, 0.002),
    strand('string-b', 'cord', [-0.063, 0.136], [0.063, 0.012], 0.003, -0.002, 0.002),
    box('string-c', 'cord', [-0.0015, 0.012, -0.002], [0.0015, 0.136, 0.002]),
    box('string-d', 'cord', [-0.063, 0.0725, -0.002], [0.063, 0.0755, 0.002]),
    box('string-bow', 'cord', [-0.0015, 0.148, -0.002], [0.0015, 0.168, 0.002]),
  ] + [
    // Cord whipped round each corner.
    box('whip-%d' % i, 'cord', [c[0] - 0.009, c[1] - 0.009, -0.008], [c[0] + 0.009, c[1] + 0.009, 0.008])
    for i in [0, 1, 2, 3]
    for c in [[[-0.069, 0.006], [0.069, 0.006], [-0.069, 0.142], [0.069, 0.142]][i]]
  ] + [
    ball('pebble', 'stone', 0.016, 0, 0.074, 0, 0.85),
    box('rune-stem', 'rune', [-0.002, 0.064, 0.012], [0.002, 0.086, 0.016]),
    box('rune-bar', 'rune', [-0.008, 0.074, 0.012], [0.008, 0.078, 0.016]),
  ], { wood: 'wood-birch', cord: 'cord-cotton', stone: 'stone-grey', rune: 'crystal-glow-violet' }) + h.inHand('strung_rune_frame', 'stick-low') + { voxelGrain: 0.002 },

  // A round brass clockwork case 104 mm across and 50 mm deep on two feet, glazed on its front over a train of gears
  // and a caged rune crystal, with a wind-up key standing from its top.
  h.compound('clockwork_rune_case', 0.6, [
    h.turned('rim', 'brass', 'z', [[0, 0.044], [0, 0.052], [0.05, 0.052], [0.05, 0.044], [0, 0.044]], [0, 0.058, -0.026]),
    h.turned('back', 'brass', 'z', [[0, 0], [0, 0.046], [0.004, 0.046], [0.004, 0]], [0, 0.058, -0.026]),
    h.turned('glass', 'glass', 'z', [[0, 0], [0, 0.046], [0.004, 0.046], [0.004, 0]], [0, 0.058, 0.02]),
    h.turned('bezel', 'brass', 'z', [[0, 0.042], [0, 0.052], [0.004, 0.052], [0.004, 0.042], [0, 0.042]], [0, 0.058, 0.022]),
  ] + gear('gear-a', 'gear', 0.017, 12, -0.02, 0.07, 0.008, 0.024)
  + gear('gear-b', 'steel', 0.011, 9, 0.022, 0.078, 0.004, 0.024)
  + gear('gear-c', 'gear', 0.013, 10, 0.012, 0.036, 0.006, 0.024)
  + gear('gear-d', 'steel', 0.008, 8, -0.024, 0.036, 0.004, 0.024) + [
    // The rune crystal in the middle, held in a brass cage.
    h.turned('rune-crystal', 'rune', 'z', [[0, 0], [0, 0.011], [0.018, 0.011], [0.018, 0]], [0, 0.058, 0.006]),
    h.turned('cage-ring', 'brass', 'z', [[0, 0.011], [0, 0.014], [0.018, 0.014], [0.018, 0.011], [0, 0.011]], [0, 0.058, 0.006]),
    box('cage-a', 'brass', [-0.011, 0.057, 0.02], [0.011, 0.059, 0.024]),
    box('cage-b', 'brass', [-0.001, 0.047, 0.02], [0.001, 0.069, 0.024]),
    // Wind-up key on top.
    h.disc('key-stem', 'brass', 0.004, 0.108, 0.124),
    box('key-bow', 'brass', [-0.016, 0.122, -0.003], [0.016, 0.136, 0.003]),
    box('foot-left', 'brass', [-0.04, 0.0, -0.016], [-0.026, 0.01, 0.016]),
    box('foot-right', 'brass', [0.026, 0.0, -0.016], [0.04, 0.01, 0.016]),
  ], { brass: 'brass-polished', glass: 'glass-clear', gear: 'brass-dull', steel: 'steel-bright', rune: 'crystal-glow-violet' }) + h.inHand('clockwork_rune_case', 'rim') + { voxelGrain: 0.002 },

  // A fired clay tablet 160 mm long, 110 mm wide and 26 mm thick, lying flat, with a raised border and a rune of
  // circuit-like lines glazed into its face.
  h.compound('rune_clay_tablet', 1.1, [
    box('slab', 'clay', [-0.08, 0.0, -0.055], [0.08, 0.026, 0.055]),
    box('border-front', 'clay', [-0.074, 0.026, 0.044], [0.074, 0.03, 0.05]),
    box('border-back', 'clay', [-0.074, 0.026, -0.05], [0.074, 0.03, -0.044]),
    box('border-left', 'clay', [-0.074, 0.026, -0.05], [-0.068, 0.03, 0.05]),
    box('border-right', 'clay', [0.068, 0.026, -0.05], [0.074, 0.03, 0.05]),
    // The rune: a ring with a spine through it and three branching traces, each ending in a dot.
    h.turned('rune-ring', 'rune', 'y', [[0, 0.016], [0, 0.022], [0.003, 0.022], [0.003, 0.016], [0, 0.016]], [0, 0.026, 0]),
    box('rune-spine', 'rune', [-0.003, 0.026, -0.036], [0.003, 0.029, 0.036]),
    box('trace-a', 'rune', [0.022, 0.026, -0.003], [0.052, 0.029, 0.003]),
    box('trace-a-up', 'rune', [0.046, 0.026, -0.03], [0.052, 0.029, 0.003]),
    box('trace-b', 'rune', [-0.052, 0.026, 0.012], [-0.022, 0.029, 0.018]),
    box('trace-b-down', 'rune', [-0.052, 0.026, 0.012], [-0.046, 0.029, 0.034]),
    box('trace-c', 'rune', [-0.05, 0.026, -0.026], [-0.018, 0.029, -0.02]),
    h.disc('dot-a', 'rune', 0.005, 0.026, 0.03, 0.049, -0.032),
    h.disc('dot-b', 'rune', 0.005, 0.026, 0.03, -0.049, 0.036),
    h.disc('dot-c', 'rune', 0.005, 0.026, 0.03, -0.052, -0.023),
  ], { clay: 'clay-terracotta', rune: 'gem-aquamarine' }) + h.inHand('rune_clay_tablet', 'slab') + { voxelGrain: 0.002 },

  // A rune-inscribed steel engine case 400 mm wide, 320 mm tall to its coil caps and 200 mm deep, with its rune
  // pebble dim behind the porthole while it is switched off.
  h.compound('rune_engine_case', 20, runeEngine, {
    steel: 'steel-grey',
    trim: 'steel-blued',
    glass: 'glass-clear',
    core: 'gem-aquamarine',
    rune: 'brass-dull',
    copper: 'copper',
    dark: 'plastic-matte-black',
    cable: 'rubber-black',
  }) + { handling: h.gripOn('rune_engine_case', 'handle-grip') } + { voxelGrain: 0.008 },

  // A rough stone egg 200 mm long and 150 mm across, lying on its side, knobbled and speckled like a field rock, with
  // a thin warm seam where the shell will split.
  h.compound('rock_egg', 5.2, [
    h.turned('shell', 'stone', 'x', [[0, 0], [0.01, 0.036], [0.03, 0.056], [0.06, 0.07], [0.1, 0.075], [0.14, 0.068], [0.17, 0.05], [0.19, 0.028], [0.2, 0]], [-0.1, 0.075, 0]),
    ball('knob-a', 'stone', 0.022, -0.02, 0.136, 0.03, 0.6),
    ball('knob-b', 'dark', 0.018, 0.04, 0.12, -0.044, 0.6),
    ball('knob-c', 'stone', 0.016, -0.05, 0.08, 0.056),
    ball('knob-d', 'dark', 0.014, 0.05, 0.06, 0.056),
    box('speck-a', 'dark', [-0.03, 0.14, -0.02], [-0.02, 0.148, -0.01]),
    box('speck-b', 'dark', [0.02, 0.142, 0.01], [0.03, 0.15, 0.02]),
    box('speck-c', 'dark', [-0.07, 0.11, 0.03], [-0.062, 0.12, 0.04]),
    strand('seam-a', 'seam', [-0.04, 0.148], [0.0, 0.142], 0.004, -0.004, 0.004),
    strand('seam-b', 'seam', [0.0, 0.142], [0.03, 0.15], 0.004, -0.004, 0.004),
    strand('seam-c', 'seam', [0.03, 0.15], [0.06, 0.136], 0.004, -0.004, 0.004),
  ], { stone: 'stone-grey', dark: 'stone-whet', seam: 'resin-honey' }) + { handling: h.gripOn('rock_egg', 'shell') } + { voxelGrain: 0.004 },

  // A heart of golden metal 130 mm tall, 110 mm across its two upper lobes and 80 mm deep, with two short pipe stubs
  // on top, a dark seam band round it and a violet crystal set in its front.
  h.compound('golem_heart', 1.6, [
    h.turned('point', 'metal', 'y', [[0, 0], [0.01, 0.014], [0.04, 0.032], [0.07, 0.042], [0.09, 0.04], [0.09, 0]], [0, 0.0, 0]),
    ball('lobe-left', 'metal', 0.034, -0.022, 0.09, 0, 0.9),
    ball('lobe-right', 'metal', 0.034, 0.022, 0.09, 0, 0.9),
    h.turned('seam', 'band', 'y', [[0, 0.036], [0, 0.0445], [0.006, 0.0445], [0.006, 0.036], [0, 0.036]], [0, 0.056, 0]),
    h.disc('pipe-left', 'band', 0.012, 0.11, 0.132, -0.016, -0.006),
    h.disc('pipe-left-rim', 'metal', 0.014, 0.128, 0.134, -0.016, -0.006),
    h.disc('pipe-right', 'band', 0.009, 0.108, 0.126, 0.024, 0.008),
    h.disc('pipe-right-rim', 'metal', 0.011, 0.122, 0.128, 0.024, 0.008),
    h.turned('gem-rim', 'band', 'z', [[0, 0.012], [0, 0.017], [0.006, 0.017], [0.006, 0.012], [0, 0.012]], [0, 0.074, 0.036]),
    h.turned('gem', 'crystal', 'z', [[0, 0], [0, 0.012], [0.008, 0.009], [0.011, 0]], [0, 0.074, 0.036]),
  ], { metal: 'bronze-polished', band: 'steel-blued', crystal: 'crystal-glow-violet' }) + { handling: h.gripOn('golem_heart', 'point') } + { voxelGrain: 0.004 },
]
