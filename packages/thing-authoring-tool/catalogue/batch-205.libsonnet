local h = import '../compound.libsonnet';
local box = h.box;
// A hexagonal column on `axis` ('y' or 'x') from `a0` to `a1`, radius `r`, with a pointed tip `tip` long at `a1`;
// [u, v] is its centre across the axis: [x, z] standing on y, [y, z] lying on x.
local column(prefix, slot, axis, r, a0, a1, tip, u, v) =
  local hex = [[v + r * std.sin(std.pi * i / 3), u + r * std.cos(std.pi * i / 3)] for i in std.range(0, 5)];
  [
    if axis == 'y' then h.prism(prefix, slot, 'y', hex, a0, a1)
    else h.prism(prefix, slot, 'x', [[p[1], p[0]] for p in hex], a0, a1),
    h.turned(prefix + '-tip', slot, axis, [[0, 0], [0, r * 0.9], [tip, 0]], if axis == 'y' then [u, a1, v] else [a1, u, v]),
  ];
// A double-pointed shard standing on y, `l` long and `r` across, its middle at [x, y, z].
local shard(id, slot, l, r, x, y, z) = h.turned(id, slot, 'y', [[0, 0], [l * 0.4, r], [l, 0]], [x, y - l * 0.4, z]);
// A lump of stone `w` across and `ht` tall, standing on y at [x, y, z]: an irregular five-sided block with a peaked top.
local lump(id, slot, w, ht, x, y, z) = [
  h.prism(id, slot, 'y', [[z - w * 0.5, x - w * 0.2], [z - w * 0.1, x + w * 0.45], [z + w * 0.45, x + w * 0.3], [z + w * 0.4, x - w * 0.35], [z - w * 0.15, x - w * 0.5]], y, y + ht * 0.6),
  h.turned(id + '-top', slot, 'y', [[0, 0], [0, w * 0.4], [ht * 0.4, w * 0.08], [ht * 0.4, 0]], [x, y + ht * 0.6, z]),
];
[
  // A desk focusing rig 250 mm tall: a round steel foot and a three-pronged claw holding a milky white crystal cluster
  // 50 mm across, with a dozen loose crystal splinters hanging in the air round its top.
  h.compound('telepathic_focusing_tool', 3.5, [
    h.disc('foot', 'steel', 0.07, 0, 0.014),
    h.disc('foot-step', 'steel', 0.05, 0.014, 0.024),
    h.disc('stem', 'steel', 0.016, 0.024, 0.06),
    h.disc('cup', 'steel', 0.034, 0.06, 0.072),
    h.tube('band', 'steel', 0.03, 0.036, -0.006, 0.006, 0.0, 0.0) + { axis: 'y', origin: [0, 0.12, 0] },
  ] + std.flattenArrays([
    local a = 2 * std.pi * i / 3, c = std.cos(a), s = std.sin(a);
    [
      box('prong-%d' % i, 'steel', [0.036 * c - 0.005, 0.06, 0.036 * s - 0.005], [0.036 * c + 0.005, 0.15, 0.036 * s + 0.005]),
      box('claw-%d' % i, 'steel', [0.028 * c - 0.005, 0.15, 0.028 * s - 0.005], [0.028 * c + 0.005, 0.162, 0.028 * s + 0.005]),
    ]
    for i in std.range(0, 2)
  ]) + column('core', 'crystal', 'y', 0.024, 0.072, 0.17, 0.045, 0, 0)
  + column('core-b', 'crystal', 'y', 0.012, 0.072, 0.15, 0.03, 0.016, 0.014)
  + column('core-c', 'crystal', 'y', 0.011, 0.072, 0.14, 0.025, -0.017, 0.012)
  + [
    local a = 2 * std.pi * i / 9 + 0.3, rr = 0.05 + 0.012 * (i % 3);
    shard('shard-%d' % i, 'shard', 0.016 + 0.004 * (i % 3), 0.004, rr * std.cos(a), 0.17 + 0.03 * ((i * 4) % 9) / 9, rr * std.sin(a))
    for i in std.range(0, 8)
  ] + [
    local a = 2 * std.pi * i / 7 + 1.1, rr = 0.03 + 0.02 * (i % 2);
    box('dust-%d' % i, 'shard', [rr * std.cos(a) - 0.002, 0.225 + 0.006 * (i % 3), rr * std.sin(a) - 0.002], [rr * std.cos(a) + 0.002, 0.229 + 0.006 * (i % 3), rr * std.sin(a) + 0.002])
    for i in std.range(0, 6)
  ], {
    steel: 'steel-grey',
    crystal: 'pearl',
    shard: 'gem-clear',
  }) + h.inHand('telepathic_focusing_tool', 'foot') + { voxelGrain: 0.004 },

  // A household flashlight 140 mm long, lying on its side with its head at +x: a plastic tail cap and grip, an
  // aluminium body with a glass window showing a blue crystal rod inside, a flared aluminium head and a crystal lens.
  h.compound('pyrokinetic_flashlight', 0.17, [
    h.rod('tail', 'plastic', 0.014, -0.07, -0.058, 0.02),
    h.rod('grip', 'plastic', 0.0135, -0.058, -0.02, 0.02),
    h.rod('body', 'alu', 0.0125, -0.02, 0.026, 0.02),
    { id: 'head', slot: 'alu', kind: 'turned', axis: 'x', profile: [[0, 0], [0, 0.0125], [0.026, 0.02], [0.03, 0.02], [0.03, 0]], origin: [0.026, 0.02, 0] },
    h.tube('bezel', 'plastic', 0.0165, 0.0205, 0.056, 0.066, 0.02),
    h.rod('lens', 'lens', 0.0168, 0.06, 0.068, 0.02),
    h.rod('core', 'crystal', 0.006, 0.066, 0.07, 0.02),
    box('window', 'glass', [-0.016, 0.03, -0.006], [0.02, 0.0335, 0.006]),
    box('rod', 'crystal', [-0.012, 0.0325, -0.003], [0.016, 0.034, 0.003]),
  ] + [
    box('rib-%d' % i, 'rib', [-0.054 + i * 0.008, 0.006, -0.0142], [-0.05 + i * 0.008, 0.034, 0.0142])
    for i in std.range(0, 3)
  ] + [
    box('switch', 'switch', [0.0, 0.0315, 0.009], [0.012, 0.0345, 0.0135]),
  ], {
    plastic: 'plastic-charcoal',
    rib: 'rubber-black',
    alu: 'alu-bare',
    lens: 'crystal-glow-blue',
    crystal: 'crystal-glow-blue',
    glass: 'glass-clear',
    switch: 'rubber-black',
  }) + h.inHand('pyrokinetic_flashlight', 'body') + { voxelGrain: 0.002 },

  // A camp lantern 110 mm across and 170 mm tall to its handle: a plastic base, an aluminium canister with its domed lid
  // shut on a hinge at the back, a thin line of blue light leaking under the lid, and a wire bail handle.
  h.compound('pyrokinetic_lamp', 0.5, [
    h.disc('base', 'plastic', 0.055, 0, 0.024),
    h.disc('foot', 'rubber', 0.05, -0.0, 0.004),
    h.disc('can', 'alu', 0.05, 0.024, 0.122),
    h.disc('glow', 'crystal', 0.051, 0.12, 0.127),
    h.turned('lid', 'alu', 'y', [[0, 0], [0, 0.052], [0.008, 0.052], [0.02, 0.036], [0.026, 0.016], [0.026, 0]], [0, 0.127, 0]),
    box('hinge', 'steel', [-0.012, 0.118, -0.058], [0.012, 0.132, -0.05]),
    box('latch', 'steel', [-0.006, 0.112, 0.05], [0.006, 0.134, 0.056]),
    box('lug-l', 'steel', [-0.058, 0.1, -0.006], [-0.05, 0.13, 0.006]),
    box('lug-r', 'steel', [0.05, 0.1, -0.006], [0.058, 0.13, 0.006]),
    box('bail-l', 'steel', [-0.058, 0.13, -0.002], [-0.054, 0.165, 0.002]),
    box('bail-r', 'steel', [0.054, 0.13, -0.002], [0.058, 0.165, 0.002]),
    box('bail-top', 'steel', [-0.058, 0.165, -0.002], [0.058, 0.169, 0.002]),
    box('grip', 'plastic', [-0.024, 0.163, -0.006], [0.024, 0.171, 0.006]),
    box('panel', 'plastic', [-0.016, 0.006, 0.052], [0.016, 0.02, 0.056]),
    box('knob', 'steel', [-0.004, 0.009, 0.056], [0.004, 0.017, 0.06]),
  ] + [
    h.tube('rib-%d' % i, 'rib', 0.049, 0.052, -0.002, 0.002, 0, 0) + { axis: 'y', origin: [0, 0.045 + i * 0.03, 0] }
    for i in std.range(0, 2)
  ], {
    plastic: 'plastic-charcoal',
    rubber: 'rubber-black',
    alu: 'alu-bare',
    rib: 'steel-grey',
    crystal: 'crystal-glow-blue',
    steel: 'steel-grey',
  }) + h.inHand('pyrokinetic_lamp', 'can') + { voxelGrain: 0.004 },

  // A standing floor lamp 1.7 m tall: a weighted steel base 300 mm across, a steel pole with a white plastic collar
  // and a cone shade 400 mm across, a blue crystal rod hanging in its socket under the shade, and a power cord running
  // off the base to a loose plug.
  h.compound('standing_pyrokinetic_lamp', 6, [
    h.turned('base', 'steel', 'y', [[0, 0], [0, 0.15], [0.012, 0.15], [0.03, 0.08], [0.03, 0]], [0, 0, 0]),
    h.disc('foot-pad', 'rubber', 0.145, -0.0, 0.004),
    h.disc('pole', 'steel', 0.011, 0.03, 1.52),
    h.disc('collar', 'plastic', 0.016, 0.9, 0.96),
    h.disc('switch', 'switch', 0.006, 0.93, 0.945, 0.0, 0.016),
    h.disc('socket', 'plastic', 0.024, 1.5, 1.56),
    h.turned('shade', 'shade', 'y', [[0, 0.2], [0.2, 0.08], [0.2, 0.074], [0, 0.194], [0, 0.2]], [0, 1.5, 0]),
    h.disc('cap', 'shade', 0.08, 1.7, 1.706),
  ] + column('bulb', 'crystal', 'y', 0.014, 1.44, 1.5, 0.004, 0, 0) + [
    h.turned('bulb-end', 'crystal', 'y', [[0, 0], [0.03, 0.013], [0.03, 0]], [0, 1.41, 0]),
    box('cord', 'cord', [0.03, 0.0, -0.003], [0.38, 0.006, 0.003]),
    box('cord-b', 'cord', [0.374, 0.0, 0.003], [0.38, 0.006, 0.12]),
    box('plug', 'plug', [0.364, 0.0, 0.12], [0.39, 0.018, 0.15]),
    box('prong-a', 'prong', [0.37, 0.006, 0.15], [0.373, 0.012, 0.166]),
    box('prong-b', 'prong', [0.381, 0.006, 0.15], [0.384, 0.012, 0.166]),
  ], {
    steel: 'steel-grey',
    rubber: 'rubber-black',
    plastic: 'plastic-white',
    switch: 'plastic-matte-black',
    shade: 'plastic-white',
    crystal: 'crystal-glow-blue',
    cord: 'plastic-matte-black',
    plug: 'plastic-white',
    prong: 'brass-polished',
  }) + h.inHand('standing_pyrokinetic_lamp', 'pole'),

  // A lump of something like black glass 70 mm across, three swollen lobes run together with an oily sheen and
  // violet flecks sunk in its skin.
  h.compound('chaos_stone', 0.3, [
    h.turned('lobe-a', 'body', 'y', [[0, 0], [0, 0.016], [0.012, 0.026], [0.028, 0.028], [0.042, 0.02], [0.05, 0.008], [0.052, 0]], [-0.008, 0, 0]),
    h.turned('lobe-b', 'body', 'x', [[0, 0], [0.006, 0.014], [0.018, 0.02], [0.03, 0.018], [0.04, 0.01], [0.044, 0]], [0.0, 0.022, 0.006]),
    h.turned('lobe-c', 'body', 'z', [[0, 0], [0.008, 0.012], [0.02, 0.016], [0.03, 0.012], [0.036, 0]], [-0.024, 0.026, -0.006]),
    h.turned('sheen-a', 'sheen', 'y', [[0, 0], [0, 0.014], [0.006, 0.01], [0.008, 0]], [-0.01, 0.046, 0.002]),
    h.turned('sheen-b', 'sheen', 'x', [[0, 0], [0.006, 0.008], [0.01, 0]], [0.038, 0.024, 0.006]),
    h.turned('sheen-c', 'sheen', 'z', [[0, 0], [0.004, 0.009], [0.008, 0]], [-0.012, 0.022, 0.024]),
    box('fleck-a', 'fleck', [-0.032, 0.03, 0.006], [-0.028, 0.034, 0.012]),
    box('fleck-b', 'fleck', [0.012, 0.028, 0.012], [0.016, 0.032, 0.016]),
    box('fleck-c', 'fleck', [0.02, 0.018, -0.022], [0.026, 0.022, -0.018]),
    box('fleck-d', 'fleck', [-0.004, 0.044, -0.014], [0.0, 0.048, -0.01]),
  ], {
    body: 'void-black',
    sheen: 'iridescent',
    fleck: 'crystal-glow-violet',
  }) + h.inHand('chaos_stone', 'lobe-a') + { voxelGrain: 0.002 },

  // A stepped grey pyramid 260 mm square and 240 mm tall on a steel plate, a blue crystal column in a steel collar on
  // its peak, a sight tube of teal fluid across its front, and four lumps of dark glassy stone set round its foot,
  // 400 mm across them.
  h.compound('psionic_transporter_beacon', 6, [
    box('plate', 'steel', [-0.14, 0, -0.14], [0.14, 0.016, 0.14]),
  ] + [
    local hw = 0.13 - i * 0.0055;
    box('step-%d' % i, 'shell', [-hw, 0.016 + i * 0.01, -hw], [hw, 0.026 + i * 0.01, hw])
    for i in std.range(0, 21)
  ] + [
    h.disc('collar', 'steel', 0.022, 0.236, 0.256),
  ] + column('crystal', 'crystal', 'y', 0.016, 0.256, 0.33, 0.04, 0, 0) + [
    box('bracket-l', 'steel', [-0.09, 0.016, 0.13], [-0.08, 0.05, 0.15]),
    box('bracket-r', 'steel', [0.08, 0.016, 0.13], [0.09, 0.05, 0.15]),
    h.tube('sight', 'glass', 0.009, 0.011, -0.08, 0.08, 0.036, 0.142),
    h.rod('fluid', 'fluid', 0.0088, -0.08, 0.08, 0.036) + { origin: [-0.08, 0.036, 0.142] },
    box('panel', 'panel', [-0.05, 0.06, 0.12], [0.05, 0.1, 0.128]),
    box('led', 'crystal', [-0.04, 0.074, 0.128], [-0.03, 0.084, 0.13]),
  ] + lump('rock-a', 'rock', 0.07, 0.11, -0.16, 0, -0.12)
  + lump('rock-b', 'rock', 0.06, 0.08, 0.165, 0, -0.1)
  + lump('rock-c', 'rock', 0.055, 0.09, 0.15, 0, 0.13)
  + lump('rock-d', 'rock', 0.065, 0.07, -0.16, 0, 0.11), {
    steel: 'steel-grey',
    shell: 'plastic-charcoal',
    crystal: 'crystal-glow-blue',
    glass: 'glass-clear',
    fluid: 'jelly-teal',
    panel: 'plastic-matte-black',
    rock: 'chitin-black',
  }) + h.inHand('psionic_transporter_beacon', 'plate') + { voxelGrain: 0.004 },

  // A chunky handset 100 by 55 by 30 mm lying on its back, top end at +x: a dark plastic case on a steel frame, a small
  // blank screen, a keypad and a teal fluid window, with a blue crystal rod 50 mm long sticking out of its top end
  // like a stubby antenna.
  h.compound('psionic_transporter_remote', 0.33, [
    box('frame', 'steel', [-0.05, 0, -0.0275], [0.05, 0.006, 0.0275]),
    box('case', 'case', [-0.049, 0.006, -0.026], [0.049, 0.03, 0.026]),
    box('bezel', 'bezel', [0.008, 0.03, -0.02], [0.044, 0.032, 0.02]),
    box('screen', 'screen', [0.012, 0.032, -0.016], [0.04, 0.033, 0.016]),
    box('window', 'glass', [-0.006, 0.03, -0.02], [0.002, 0.032, 0.02]),
    box('fluid', 'fluid', [-0.005, 0.0305, -0.018], [0.001, 0.0315, 0.006]),
    box('grille', 'bezel', [-0.046, 0.03, -0.014], [-0.04, 0.0315, 0.014]),
    box('collar', 'steel', [0.049, 0.008, -0.01], [0.056, 0.028, 0.01]),
  ] + [
    box('key-%d-%d' % [r, c], 'key', [-0.036 + r * 0.01, 0.03, -0.017 + c * 0.012], [-0.03 + r * 0.01, 0.033, -0.009 + c * 0.012])
    for r in std.range(0, 2)
    for c in std.range(0, 2)
  ] + column('antenna', 'crystal', 'x', 0.007, 0.056, 0.092, 0.008, 0.018, 0), {
    steel: 'steel-grey',
    case: 'plastic-charcoal',
    bezel: 'plastic-matte-black',
    screen: 'screen-black',
    glass: 'glass-clear',
    fluid: 'jelly-teal',
    key: 'rubber-black',
    crystal: 'crystal-glow-blue',
  }) + h.inHand('psionic_transporter_remote', 'case') + { voxelGrain: 0.002 },
]
