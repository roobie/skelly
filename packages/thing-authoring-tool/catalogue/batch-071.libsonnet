local h = import '../compound.libsonnet';

// A pipe flange: a short wide disc along x at `x`, centred on [y, z].
local flangeX(id, x, y, z, r) = h.turned(id, 'flange', 'x', [[0, 0], [0, r], [0.024, r], [0.024, 0]], [x - 0.012, y, z]);
// A dial gauge on a stem standing on y, face to the front.
local gauge(id, x, y, z) = [
  h.disc(id + '-stem', 'flange', 0.008, y, y + 0.06, x, z),
  h.turned(id + '-dial', 'flange', 'z', [[0, 0], [0, 0.045], [0.03, 0.045], [0.03, 0]], [x, y + 0.1, z - 0.015]),
  h.disc(id + '-face', 'gauge', 0.038, 0, 0.032) + { axis: 'z', origin: [x, y + 0.1, z - 0.016] },
];

[
  // A galvanised steel rain funnel 0.5 m across the rim and 0.43 m tall, standing on its 60 mm spout, a coarse
  // strainer down in its throat and a hanging tab on the rim.
  h.compound('metal_funnel', 1.5, [
    h.turned('cone', 'cone', 'y', [[0, 0.03], [0.08, 0.03], [0.4, 0.25], [0.42, 0.255], [0.42, 0.247], [0.4, 0.243], [0.082, 0.026], [0, 0.026], [0, 0.03]]),
    h.turned('rim', 'rim', 'y', [[0, 0.246], [0, 0.26], [0.014, 0.26], [0.014, 0.246], [0, 0.246]], [0, 0.414, 0]),
    h.turned('spout-band', 'rim', 'y', [[0, 0.025], [0, 0.034], [0.012, 0.034], [0.012, 0.025], [0, 0.025]]),
    h.disc('strainer', 'strainer', 0.05, 0.12, 0.123),
    h.box('tab', 'rim', [0.255, 0.4, -0.02], [0.3, 0.428, 0.02]),
  ], { cone: 'steel-galvanised', rim: 'steel-grey', strainer: 'mesh-black' }),
  // A blue tarpaulin rolled to 0.9 m by 0.13 m and tied with cord, four 1.2 m poles bound alongside it.
  h.compound('tarp_raincatcher', 6.4, [
    h.rod('roll', 'tarp', 0.062, -0.45, 0.45, 0.062),
    h.box('edge', 'edge', [-0.45, 0.06, 0.058], [0.45, 0.1, 0.064]),
  ] + [
    h.turned('grommet-%d' % i, 'grommet', 'z', [[0, 0.004], [0, 0.009], [0.004, 0.009], [0.004, 0.004], [0, 0.004]], [-0.4 + i * 0.2, 0.08, 0.063])
    for i in std.range(0, 4)
  ] + [
    h.rod('pole-%d' % i, 'pole', 0.013, -0.6, 0.6, [0.013, 0.013, 0.037][i]) + { origin: [-0.6, [0.013, 0.013, 0.037][i], [0.077, 0.103, 0.09][i]] }
    for i in std.range(0, 2)
  ] + [
    h.rod('pole-3', 'pole', 0.012, -0.58, 0.62, 0.012) + { origin: [-0.58, 0.012, 0.129] },
    h.turned('tie-a', 'cord', 'x', [[0, 0], [0, 0.066], [0.012, 0.066], [0.012, 0]], [-0.3, 0.062, 0]),
    h.turned('tie-b', 'cord', 'x', [[0, 0], [0, 0.066], [0.012, 0.066], [0.012, 0]], [0.29, 0.062, 0]),
    h.box('lash-a', 'cord', [-0.3, 0, 0.06], [-0.288, 0.052, 0.144]),
    h.box('lash-b', 'cord', [0.29, 0, 0.06], [0.302, 0.052, 0.144]),
    h.turned('hank', 'cord', 'y', [[0, 0.02], [0, 0.04], [0.016, 0.04], [0.016, 0.02], [0, 0.02]], [0.1, 0.122, -0.01]),
  ], { tarp: 'plastic-blue', edge: 'plastic-blue', grommet: 'alu-bare', pole: 'bark', cord: 'cord-cotton' }),
  // A small triple-beam balance 0.32 m long: a cast base, a 140 mm pan on the left, three graduated beams with
  // brass riders running right to a pointer and zero mark.
  h.compound('balance_small', 2, [
    h.prism('base', 'base', 'y', [[-0.05, -0.16], [0.05, -0.16], [0.05, 0.16], [-0.05, 0.16]], 0, 0.02),
    h.box('pillar', 'base', [-0.055, 0.02, -0.012], [-0.03, 0.075, 0.012]),
    h.box('stand', 'base', [0.15, 0.02, -0.012], [0.17, 0.06, 0.012]),
    h.disc('pan-post', 'pan', 0.006, 0.02, 0.06, -0.1, 0),
    h.turned('pan', 'pan', 'y', [[0, 0], [0, 0.066], [0.006, 0.07], [0.008, 0.07], [0.008, 0]], [-0.1, 0.06, 0]),
    h.box('mark', 'mark', [0.172, 0.055, -0.004], [0.176, 0.085, 0.004]),
  ] + std.flattenArrays([
    [
      h.box('beam-%d' % i, 'beam', [-0.06, 0.06, -0.018 + i * 0.014], [0.17, 0.074, -0.012 + i * 0.014]),
      h.box('rider-%d' % i, 'rider', [[-0.01, 0.05, 0.11][i], 0.074, -0.02 + i * 0.014], [[0.0, 0.058, 0.116][i], 0.082, -0.01 + i * 0.014]),
    ]
    for i in std.range(0, 2)
  ]) + [
    h.box('pointer', 'beam', [0.17, 0.064, -0.002], [0.19, 0.07, 0.002]),
  ] + [
    h.box('tick-%d' % k, 'mark', [-0.05 + k * 0.02, 0.074, 0.018], [-0.048 + k * 0.02, 0.0755, 0.022])
    for k in std.range(0, 10)
  ], { base: 'paint-charcoal', pan: 'steel-stainless', beam: 'steel-stainless', rider: 'brass', mark: 'plastic-black' }) + {
    voxelGrain: 0.002,
  },
  // A pocket aneroid barometer in a plastic case 64 mm across and 14 mm deep, standing on its rim with its dial
  // to the front and a hanging lug on top.
  h.compound('barometer', 0.07, [
    h.turned('case', 'case', 'z', [[0, 0], [0, 0.032], [0.012, 0.032], [0.014, 0.03], [0.014, 0]], [0, 0.032, 0]),
    h.disc('face', 'face', 0.026, 0, 0.0145) + { axis: 'z', origin: [0, 0.032, 0.001] },
    h.turned('lug', 'case', 'z', [[0, 0.003], [0, 0.007], [0.006, 0.007], [0.006, 0.003], [0, 0.003]], [0, 0.066, 0.004]),
    h.box('needle', 'needle', [-0.0012, 0.03, 0.0155], [0.0012, 0.054, 0.0175]),
    h.disc('hub', 'needle', 0.002, 0, 0.003) + { axis: 'z', origin: [0, 0.032, 0.0155] },
    h.box('band-rain', 'band', [-0.022, 0.016, 0.0155], [-0.012, 0.022, 0.0165]),
    h.box('band-fair', 'band-fair', [0.012, 0.016, 0.0155], [0.022, 0.022, 0.0165]),
  ] + [
    local a = std.pi * (0.75 + 1.5 * k / 10);
    h.box('tick-%d' % k, 'tick', [0.021 * std.cos(a) - 0.001, 0.032 + 0.021 * std.sin(a) - 0.001, 0.0155], [0.021 * std.cos(a) + 0.001, 0.032 + 0.021 * std.sin(a) + 0.001, 0.0165])
    for k in std.range(0, 10)
  ], { case: 'plastic-charcoal', face: 'plastic-gloss-white', needle: 'paint-red', tick: 'plastic-black', band: 'plastic-blue', 'band-fair': 'plastic-yellow' }) + {
    voxelGrain: 0.002,
  },
  // A sealed steel canister 60 mm across and 100 mm tall: a bolted lid, a hazard band with black chevrons and a
  // narrow sight glass showing something green inside.
  h.compound('canister_goo', 0.36, [
    h.turned('body', 'body', 'y', [[0, 0], [0, 0.028], [0.003, 0.03], [0.088, 0.03], [0.088, 0]]),
    h.turned('lid', 'lid', 'y', [[0, 0], [0, 0.032], [0.006, 0.032], [0.008, 0.026], [0.012, 0.012], [0.016, 0.01], [0.016, 0]], [0, 0.088, 0]),
    h.turned('band', 'band', 'y', [[0, 0], [0, 0.0305], [0.024, 0.0305], [0.024, 0]], [0, 0.05, 0]),
    h.box('window', 'window', [-0.005, 0.014, 0.027], [0.005, 0.044, 0.0312]),
    h.box('window-frame', 'lid', [-0.007, 0.012, 0.026], [0.007, 0.046, 0.0306]),
  ] + [
    local a = 2 * std.pi * k / 8;
    h.disc('bolt-%d' % k, 'bolt', 0.0025, 0.094, 0.097, 0.026 * std.cos(a), 0.026 * std.sin(a))
    for k in std.range(0, 7)
  ] + [
    local a = 2 * std.pi * k / 10;
    h.box('chevron-%d' % k, 'stripe', [0.031 * std.cos(a) - 0.003, 0.05, 0.031 * std.sin(a) - 0.003], [0.031 * std.cos(a) + 0.003, 0.074, 0.031 * std.sin(a) + 0.003])
    for k in std.range(0, 9)
    if k != 2
  ], { body: 'steel-stainless', lid: 'steel-grey', band: 'plastic-hivis', stripe: 'plastic-black', bolt: 'steel-blued', window: 'jelly-teal' }) + {
    voxelGrain: 0.002,
  },
  // A 3 m skid of reactor plumbing 0.9 m wide and 1.1 m tall: two electric compressors, three thick-walled pipe runs
  // on posts with flanged joints and gauges, open flanges at +x to meet the reactor, and a control cabinet wired to
  // the compressors.
  h.compound('ammonia_machine_pipework', 1200, [
    h.box('rail-a', 'skid', [-1.5, 0, -0.45], [1.5, 0.1, -0.38]),
    h.box('rail-b', 'skid', [-1.5, 0, 0.38], [1.5, 0.1, 0.45]),
  ] + [
    h.box('cross-%d' % i, 'skid', [x - 0.04, 0.02, -0.38], [x + 0.04, 0.08, 0.38])
    for i in std.range(0, 3)
    for x in [[-1.4, -0.5, 0.4, 1.4][i]]
  ] + std.flattenArrays([
    [
      h.box('post-%d-a' % i, 'skid', [x - 0.03, 0.1, -0.42], [x + 0.03, 0.95, -0.36]),
      h.box('post-%d-b' % i, 'skid', [x - 0.03, 0.1, 0.36], [x + 0.03, 0.95, 0.42]),
      h.box('yoke-%d' % i, 'skid', [x - 0.03, 0.95, -0.42], [x + 0.03, 1.0, 0.42]),
    ]
    for i in std.range(0, 2)
    for x in [[-1.3, 0.1, 1.3][i]]
  ]) + [
    h.rod('pipe-%d' % i, 'pipe', 0.05, -1.45, 1.5, [0.9, 0.78, 0.9][i]) + { origin: [-1.45, [0.9, 0.78, 0.9][i], [-0.24, 0, 0.24][i]] }
    for i in std.range(0, 2)
  ] + [
    flangeX('flange-%d-%d' % [i, j], [-0.6, 0.7, 1.49][j], [0.9, 0.78, 0.9][i], [-0.24, 0, 0.24][i], 0.08)
    for i in std.range(0, 2)
    for j in std.range(0, 2)
  ] + std.flattenArrays([
    [
      h.rod('motor-%d' % k, 'motor', 0.14, x - 0.38, x - 0.06, 0.26) + { origin: [x - 0.38, 0.26, 0.05] },
      h.box('compressor-%d' % k, 'compressor', [x - 0.06, 0.1, -0.12], [x + 0.2, 0.44, 0.22]),
      h.box('head-%d' % k, 'compressor', [x - 0.02, 0.44, -0.08], [x + 0.16, 0.52, 0.18]),
    ] + [
      h.box('fin-%d-%d' % [k, f], 'flange', [x - 0.02, 0.52 + f * 0.022, -0.09], [x + 0.16, 0.53 + f * 0.022, 0.19])
      for f in std.range(0, 2)
    ] + [
      h.disc('riser-%d' % k, 'pipe', 0.035, 0.52, 0.78, x + 0.07, 0),
      h.box('foot-%d' % k, 'skid', [x - 0.4, 0.1, -0.13], [x + 0.22, 0.12, 0.23]),
    ]
    for k in std.range(0, 1)
    for x in [[-0.95, -0.05][k]]
  ]) + gauge('gauge-a', -0.25, 0.95, 0.24) + gauge('gauge-b', 1.0, 0.95, -0.24) + [
    h.box('cabinet', 'cabinet', [0.7, 0.1, 0.12], [1.15, 0.7, 0.36]),
    h.box('screen', 'screen', [0.78, 0.5, 0.36], [0.95, 0.62, 0.37]),
    h.box('switch', 'switch', [1.02, 0.5, 0.36], [1.08, 0.6, 0.38]),
    h.box('cable-a', 'cable', [-0.9, 0.12, 0.26], [0.7, 0.15, 0.29]),
    h.box('cable-b', 'cable', [-0.9, 0.12, 0.2], [-0.87, 0.2, 0.29]),
    h.box('cable-c', 'cable', [0.0, 0.12, 0.2], [0.03, 0.2, 0.29]),
    h.box('conduit', 'cable', [0.9, 0.7, 0.2], [0.94, 1.0, 0.24]),
  ], {
    skid: 'paint-crane-yellow',
    pipe: 'steel-grey',
    flange: 'steel-bright',
    motor: 'paint-charcoal',
    compressor: 'paint-drum-blue',
    cabinet: 'enamel-white',
    screen: 'lcd-green',
    switch: 'paint-red',
    cable: 'plastic-black',
    gauge: 'plastic-gloss-white',
  }),
  // A salvaged ammonia reactor 2.9 m tall: a 0.7 m steel pressure vessel with domed heads on four legs over a skid,
  // banded with an electric heating jacket, a relief valve and gauge on top, flanged inlet and outlet at +x and a
  // power cabinet bolted to the skid.
  h.compound('ammonia_machine_reactor', 580, [
    h.box('skid-a', 'skid', [-0.65, 0, -0.65], [0.65, 0.1, -0.57]),
    h.box('skid-b', 'skid', [-0.65, 0, 0.57], [0.65, 0.1, 0.65]),
    h.box('skid-c', 'skid', [-0.65, 0, -0.57], [-0.57, 0.1, 0.57]),
    h.box('skid-d', 'skid', [0.57, 0, -0.57], [0.65, 0.1, 0.57]),
    h.box('plate', 'skid', [-0.57, 0.04, -0.57], [0.57, 0.06, 0.57]),
  ] + [
    h.box('leg-%d' % i, 'leg', [sx * 0.3 - 0.04, 0.06, sz * 0.3 - 0.04], [sx * 0.3 + 0.04, 0.72, sz * 0.3 + 0.04])
    for i in std.range(0, 3)
    for sx in [[-1, 1, -1, 1][i]]
    for sz in [[-1, -1, 1, 1][i]]
  ] + [
    h.turned('bottom', 'vessel', 'y', [[0, 0], [0, 0.06], [0.08, 0.22], [0.14, 0.3], [0.2, 0.35], [0.2, 0]], [0, 0.5, 0]),
    h.disc('shell', 'vessel', 0.35, 0.7, 2.4),
    h.turned('top', 'vessel', 'y', [[0, 0], [0, 0.35], [0.06, 0.3], [0.14, 0.22], [0.2, 0.06], [0.2, 0]], [0, 2.4, 0]),
    h.disc('drain', 'pipe', 0.03, 0.4, 0.5),
    h.disc('nozzle', 'pipe', 0.05, 2.6, 2.72),
    h.disc('nozzle-flange', 'flange', 0.08, 2.72, 2.75),
    h.disc('valve', 'valve', 0.035, 2.75, 2.88),
    h.disc('valve-cap', 'valve', 0.05, 2.88, 2.9),
    h.disc('well', 'pipe', 0.015, 2.5, 2.78, -0.15, 0.1),
  ] + [
    h.turned('jacket-%d' % k, 'jacket', 'y', [[0, 0], [0, 0.365], [0.32, 0.365], [0.32, 0]], [0, 0.8 + k * 0.4, 0])
    for k in std.range(0, 3)
  ] + gauge('gauge', 0.15, 2.52, 0.0) + [
    h.rod('inlet', 'pipe', 0.05, 0.3, 0.62, 2.1) + { origin: [0.3, 2.1, 0] },
    flangeX('inlet-flange', 0.62, 2.1, 0, 0.09),
    h.rod('outlet', 'pipe', 0.05, 0.3, 0.62, 1.0) + { origin: [0.3, 1.0, 0] },
    flangeX('outlet-flange', 0.62, 1.0, 0, 0.09),
    h.box('cabinet', 'cabinet', [-0.62, 0.1, 0.36], [-0.2, 0.9, 0.62]),
    h.box('screen', 'screen', [-0.55, 0.65, 0.62], [-0.38, 0.78, 0.63]),
    h.box('switch', 'switch', [-0.32, 0.65, 0.62], [-0.26, 0.75, 0.64]),
    h.box('warning', 'warning', [-0.12, 1.5, 0.35], [0.12, 1.7, 0.375]),
    h.box('conduit-a', 'cable', [-0.42, 0.9, 0.4], [-0.38, 1.0, 0.44]),
    h.box('conduit-b', 'cable', [-0.42, 0.96, 0.25], [-0.38, 1.0, 0.44]),
  ], {
    skid: 'paint-crane-yellow',
    leg: 'steel-grey',
    vessel: 'steel-grey',
    jacket: 'alu-bare',
    pipe: 'steel-stainless',
    flange: 'steel-bright',
    valve: 'paint-red',
    cabinet: 'enamel-white',
    screen: 'lcd-green',
    switch: 'paint-red',
    warning: 'plastic-hivis',
    cable: 'plastic-black',
    gauge: 'plastic-gloss-white',
  }),
  // An aluminium field case 0.44 m by 0.32 m and 0.14 m deep opened with its lid up behind, its foam holding a small
  // digital balance, a spectrophotometer, a melting point block, a pH meter and probe, a cuvette rack and a stack
  // of chromatography paper.
  h.compound('analytical_set_basic', 7, [
    h.box('floor', 'case', [-0.22, 0, -0.16], [0.22, 0.01, 0.16]),
    h.box('wall-front', 'case', [-0.22, 0, 0.15], [0.22, 0.12, 0.16]),
    h.box('wall-back', 'case', [-0.22, 0, -0.16], [0.22, 0.12, -0.15]),
    h.box('wall-left', 'case', [-0.22, 0, -0.16], [-0.21, 0.12, 0.16]),
    h.box('wall-right', 'case', [0.21, 0, -0.16], [0.22, 0.12, 0.16]),
    h.box('rim-front', 'trim', [-0.222, 0.115, 0.148], [0.222, 0.125, 0.162]),
    h.box('rim-left', 'trim', [-0.222, 0.115, -0.162], [-0.208, 0.125, 0.162]),
    h.box('rim-right', 'trim', [0.208, 0.115, -0.162], [0.222, 0.125, 0.162]),
    h.box('foam', 'foam', [-0.21, 0.01, -0.15], [0.21, 0.07, 0.15]),
    h.box('lid', 'case', [-0.22, 0.12, -0.2], [0.22, 0.44, -0.16]),
    h.box('lid-foam', 'foam', [-0.21, 0.13, -0.165], [0.21, 0.43, -0.155]),
    h.box('handle', 'trim', [-0.06, 0.04, 0.16], [0.06, 0.06, 0.18]),
    h.box('latch-a', 'trim', [-0.16, 0.08, 0.16], [-0.12, 0.125, 0.168]),
    h.box('latch-b', 'trim', [0.12, 0.08, 0.16], [0.16, 0.125, 0.168]),
    h.box('hinge', 'trim', [-0.2, 0.11, -0.168], [0.2, 0.13, -0.155]),
    // Balance at back left.
    h.box('balance', 'instrument', [-0.2, 0.06, -0.14], [-0.06, 0.1, -0.02]),
    h.disc('balance-pan', 'steel', 0.045, 0.1, 0.104, -0.13, -0.08),
    h.box('balance-screen', 'screen', [-0.17, 0.09, -0.021], [-0.09, 0.098, -0.019]),
    // Spectrophotometer at back right.
    h.box('spectro', 'device', [-0.02, 0.06, -0.14], [0.2, 0.13, -0.02]),
    h.box('spectro-lid', 'instrument', [0.1, 0.13, -0.12], [0.18, 0.136, -0.06]),
    h.box('spectro-screen', 'screen', [0.0, 0.08, -0.021], [0.08, 0.12, -0.018]),
    h.box('spectro-keys', 'keys', [0.1, 0.075, -0.021], [0.18, 0.11, -0.018]),
    // Melting point block, front left.
    h.box('melt', 'instrument', [-0.2, 0.06, 0.0], [-0.1, 0.12, 0.13]),
    h.disc('melt-glass', 'glass', 0.012, 0.12, 0.128, -0.15, 0.04),
    h.rod('thermometer', 'glass', 0.004, -0.2, 0.0, 0.124) + { origin: [-0.2, 0.124, 0.1] },
    // pH meter and probe, front middle.
    h.box('ph', 'device', [-0.08, 0.06, 0.0], [-0.02, 0.085, 0.13]),
    h.box('ph-screen', 'screen', [-0.07, 0.085, 0.02], [-0.03, 0.087, 0.06]),
    h.disc('ph-probe', 'device', 0.007, 0.06, 0.075, 0.0, 0.0) + { axis: 'z', origin: [0.005, 0.07, 0.0], profile: [[0, 0], [0, 0.007], [0.13, 0.007], [0.13, 0]] },
    // Cuvette rack and paper stack, front right.
    h.box('rack', 'instrument', [0.03, 0.06, 0.02], [0.13, 0.08, 0.06]),
  ] + [
    h.box('cuvette-%d' % i, 'cuvette', [0.036 + i * 0.016, 0.08, 0.034], [0.046 + i * 0.016, 0.115, 0.046])
    for i in std.range(0, 5)
  ] + [
    h.box('paper', 'paper', [0.08, 0.06, 0.07], [0.2, 0.075, 0.14]),
  ], {
    case: 'alu-bare',
    trim: 'plastic-matte-black',
    foam: 'neoprene-black',
    instrument: 'plastic-gloss-white',
    device: 'plastic-grey',
    steel: 'steel-stainless',
    screen: 'lcd-green',
    keys: 'plastic-charcoal',
    glass: 'plastic-clear',
    cuvette: 'plastic-frosted',
    paper: 'paper-white',
  }) + {
    voxelGrain: 0.004,
  },
]
