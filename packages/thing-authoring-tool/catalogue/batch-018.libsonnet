local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A hollow tube along x from `x0` to `x1`, its axis at (y, z).
local tube(id, slot, r0, r1, x0, x1, y, z) = turned(id, slot, 'x', [[0, r0], [0, r1], [x1 - x0, r1], [x1 - x0, r0], [0, r0]], [x0, y, z]);
// A band `w` wide round a bundle along x, centred at (x, y), from radius `r` to `r + t`.
local band(id, slot, r, t, w, x, y) = tube(id, slot, r, r + t, x - w / 2, x + w / 2, y, 0);
// Hex-packed centres for rods of radius `r`: rows of the given counts, bottom row on the floor.
local pack(r, rows) = std.flattenArrays([
  [
    { y: r + i * 2 * r * 0.866, z: (j - (rows[i] - 1) / 2) * 2 * r }
    for j in std.range(0, rows[i] - 1)
  ]
  for i in std.range(0, std.length(rows) - 1)
]);
// Ten pipes `length` long and `r` across, in rows of 3, 4 and 3, tied by two cords.
local pipes(id, massKg, length, r, wall, pipe) =
  local centres = pack(r, [3, 4, 3]), cy = r + 2 * r * 0.866, half = length / 2;
  h.compound(id, massKg, [
    tube('pipe-%d' % i, 'pipe', r - wall, r, -half + (i % 3) * 0.006 - 0.006, half + (i % 3) * 0.006 - 0.006, centres[i].y, centres[i].z)
    for i in std.range(0, 9)
  ] + [
    band('tie-%d' % i, 'tie', 4 * r * 1.02, 0.004, 0.01, x, cy)
    for i in [0, 1]
    for x in [[-half * 0.6, half * 0.6][i]]
  ], { pipe: pipe, tie: 'cord-olive' });
// A tied stack of cloth patches `l` by `w`, `layers` thick, drawn in alternating finishes, tied once each way.
local patches(id, massKg, l, w, layers, layer, finishes) = h.compound(id, massKg, [
  box('layer-%d' % i, 'layer-%d' % (i % std.length(finishes)), [-l / 2 + (i % 3) * 0.004 - 0.004, i * layer, -w / 2 + ((i + 1) % 3) * 0.004 - 0.004], [l / 2 + (i % 3) * 0.004 - 0.004, (i + 1) * layer, w / 2 + ((i + 1) % 3) * 0.004 - 0.004])
  for i in std.range(0, layers - 1)
] + [
  box('tie-long-top', 'tie', [-l / 2 - 0.006, layers * layer, -0.003], [l / 2 + 0.006, layers * layer + 0.002, 0.003]),
  box('tie-long-a', 'tie', [-l / 2 - 0.006, 0, -0.003], [-l / 2 - 0.004, layers * layer + 0.002, 0.003]),
  box('tie-long-b', 'tie', [l / 2 + 0.004, 0, -0.003], [l / 2 + 0.006, layers * layer + 0.002, 0.003]),
  box('tie-cross-top', 'tie', [-0.003, layers * layer, -w / 2 - 0.006], [0.003, layers * layer + 0.002, w / 2 + 0.006]),
  box('tie-cross-a', 'tie', [-0.003, 0, -w / 2 - 0.006], [0.003, layers * layer + 0.002, -w / 2 - 0.004]),
  box('tie-cross-b', 'tie', [-0.003, 0, w / 2 + 0.004], [0.003, layers * layer + 0.002, w / 2 + 0.006]),
  disc('knot', 'tie', 0.008, layers * layer + 0.002, layers * layer + 0.008),
], { ['layer-%d' % i]: finishes[i] for i in std.range(0, std.length(finishes) - 1) } + { tie: 'cord-olive' });
[
  // Five long sticks, each about 2.6 m long and 50 to 60 mm across, laid three under two and lashed with cord
  // near each end and in the middle.
  local sticks = [
    { r: 0.028, y: 0.028, z: -0.056, x0: -1.3 },
    { r: 0.025, y: 0.025, z: 0, x0: -1.26 },
    { r: 0.027, y: 0.027, z: 0.054, x0: -1.33 },
    { r: 0.026, y: 0.073, z: -0.028, x0: -1.28 },
    { r: 0.024, y: 0.072, z: 0.026, x0: -1.31 },
  ];
  h.compound('bundle_branch_long', 7.8, [
    turned('stick-%d' % i, 'bark', 'x', [[0, 0], [0, sticks[i].r], [2.6, sticks[i].r * 0.75], [2.6, 0]], [sticks[i].x0, sticks[i].y, sticks[i].z])
    for i in std.range(0, 4)
  ] + [
    disc('cut-%d' % i, 'cut', sticks[i].r * 0.85, 0, 0.003) + { axis: 'x', origin: [sticks[i].x0 - 0.002, sticks[i].y, sticks[i].z] }
    for i in std.range(0, 4)
  ] + [
    band('lash-%d' % i, 'cord', 0.083, 0.006, 0.024, x, 0.052)
    for i in [0, 1, 2]
    for x in [[-0.95, 0, 0.95][i]]
  ], { bark: 'bark', cut: 'wood-pine', cord: 'cord-olive' })
  + { voxelGrain: 0.006 },

  // Ten copper water pipes, 600 mm long and 22 mm across, packed three, four and three and tied with cord.
  pipes('bundle_copper_pipe', 3, 0.6, 0.011, 0.002, 'copper') + { voxelGrain: 0.002 },

  // Ten steel pipes, 600 mm long and 21 mm across, packed three, four and three and tied with cord.
  pipes('bundle_pipe', 7.2, 0.6, 0.0105, 0.003, 'steel-grey') + { voxelGrain: 0.002 },

  // Ten steel reinforcing bars, 800 mm long and 16 mm across, packed three, four and three and twisted
  // together with tie wire at each end.
  local centres = pack(0.008, [3, 4, 3]);
  h.compound('bundle_rebar', 11, [
    turned('bar-%d' % i, 'bar', 'x', [[0, 0], [0, 0.008], [0.8, 0.008], [0.8, 0]], [-0.412 + (i % 4) * 0.008, centres[i].y, centres[i].z])
    for i in std.range(0, 9)
  ] + [
    band('wire-%d' % i, 'wire', 0.0325, 0.002, 0.008, x, 0.0218)
    for i in [0, 1]
    for x in [[-0.3, 0.3][i]]
  ], { bar: 'scrap-rusted', wire: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // Five wooden javelins, 1.4 m long and 24 mm across with fire-hardened points, laid three under two and
  // lashed with cord in two places.
  local shafts = [
    { y: 0.012, z: -0.024, x0: -0.7 },
    { y: 0.012, z: 0, x0: -0.68 },
    { y: 0.012, z: 0.024, x0: -0.72 },
    { y: 0.0328, z: -0.012, x0: -0.69 },
    { y: 0.0328, z: 0.012, x0: -0.71 },
  ];
  h.compound('bundle_javelin', 1.2, [
    turned('shaft-%d' % i, 'shaft', 'x', [[0, 0], [0, 0.011], [1.2, 0.012], [1.2, 0]], [shafts[i].x0, shafts[i].y, shafts[i].z])
    for i in std.range(0, 4)
  ] + [
    turned('point-%d' % i, 'point', 'x', [[0, 0], [0, 0.012], [0.2, 0.002], [0.2, 0]], [shafts[i].x0 + 1.2, shafts[i].y, shafts[i].z])
    for i in std.range(0, 4)
  ] + [
    band('lash-%d' % i, 'cord', 0.037, 0.004, 0.02, x, 0.022)
    for i in [0, 1]
    for x in [[-0.4, 0.3][i]]
  ], { shaft: 'wood-pine', point: 'wood-walnut', cord: 'cord-olive' })
  + { voxelGrain: 0.004 },

  // Ten sawn construction planks, 1220 mm long, 89 mm wide and 38 mm thick, stacked two wide and five high and
  // held by two steel straps.
  h.compound('bundle_plank', 21, [
    box('plank-%d-%d' % [i, j], if (i + j) % 2 == 0 then 'pine' else 'birch', [-0.61 + ((i * 2 + j) % 3) * 0.01 - 0.01, i * 0.038, -0.09 + j * 0.09], [0.61 + ((i * 2 + j) % 3) * 0.01 - 0.01, (i + 1) * 0.038 - 0.001, -0.001 + j * 0.09])
    for i in std.range(0, 4)
    for j in [0, 1]
  ] + std.flattenArrays([
    [
      box('strap-top-%d' % s, 'strap', [x - 0.016, 0.19, -0.092], [x + 0.016, 0.192, 0.09]),
      box('strap-bottom-%d' % s, 'strap', [x - 0.016, -0.002, -0.092], [x + 0.016, 0, 0.09]),
      box('strap-front-%d' % s, 'strap', [x - 0.016, -0.002, -0.094], [x + 0.016, 0.192, -0.092]),
      box('strap-back-%d' % s, 'strap', [x - 0.016, -0.002, 0.09], [x + 0.016, 0.192, 0.092]),
      box('seal-%d' % s, 'strap', [x - 0.025, 0.192, -0.02], [x + 0.025, 0.196, 0.02]),
    ]
    for s in [0, 1]
    for x in [[-0.4, 0.4][s]]
  ]), { pine: 'wood-pine', birch: 'wood-birch', strap: 'steel-galvanised' })
  + { voxelGrain: 0.004 },

  // Twenty-five cotton sheets folded small, a stack 200 mm by 150 mm and 40 mm tall, tied once each way.
  patches('bundle_cotton', 0.44, 0.2, 0.15, 10, 0.004, ['cloth-cotton', 'paper-white']) + { voxelGrain: 0.002 },

  // A hundred cotton rags folded into a stack 160 mm by 110 mm and 32 mm tall, tied once each way.
  patches('bundle_rag', 0.21, 0.16, 0.11, 8, 0.004, ['cloth-rag', 'cloth-rag-shadow', 'cloth-shirt-faded']) + { voxelGrain: 0.002 },

  // Fifty leather patches in a stack 140 mm by 100 mm and 40 mm tall, tied once each way.
  patches('bundle_leather', 0.46, 0.14, 0.1, 10, 0.004, ['leather-brown', 'skin-rawhide']) + { voxelGrain: 0.002 },

  // Fifty synthetic fabric patches in assorted colours, a stack 100 mm by 80 mm and 24 mm tall, tied once each way.
  patches('bundle_nylon', 0.071, 0.1, 0.08, 6, 0.004, ['cloth-navy', 'cloth-olive-drab', 'plastic-charcoal', 'nylon-red']) + { voxelGrain: 0.002 },

  // A hundred felt patches in a stack 140 mm by 110 mm and 60 mm tall, tied once each way.
  patches('bundle_wool', 0.29, 0.14, 0.11, 10, 0.006, ['cloth-pants-grey', 'cloth-canvas']) + { voxelGrain: 0.002 },

  // A brass candlestick, 280 mm tall: a stepped round foot 110 mm across, a turned stem with three knops, a wide
  // drip pan and a deep socket for the candle.
  h.compound('candlestick', 0.97, [
    turned('body', 'brass', 'y', [
      [0, 0], [0, 0.055], [0.006, 0.055], [0.012, 0.048], [0.018, 0.03], [0.03, 0.016], [0.06, 0.011], [0.075, 0.019],
      [0.088, 0.011], [0.165, 0.009], [0.178, 0.016], [0.19, 0.009], [0.236, 0.01], [0.244, 0.04], [0.25, 0.04],
      [0.254, 0.017], [0.28, 0.017], [0.28, 0.012], [0.258, 0.012], [0.258, 0],
    ]),
  ], { brass: 'brass' })
  + { voxelGrain: 0.002 },

  // An empty steel canister, 58 mm across and 110 mm tall, open at the top: olive paint outside, bare steel inside
  // and on the rolled rims, with a yellow band near the top.
  h.compound('canister_empty', 0.071, [
    turned('can', 'steel', 'y', [[0, 0], [0, 0.0275], [0.11, 0.0275], [0.11, 0.0235], [0.002, 0.0235], [0.002, 0]]),
    turned('paint', 'paint', 'y', [[0, 0.0275], [0, 0.029], [0.094, 0.029], [0.094, 0.0275], [0, 0.0275]], [0, 0.006, 0]),
    turned('band', 'band', 'y', [[0, 0.0275], [0, 0.0292], [0.008, 0.0292], [0.008, 0.0275], [0, 0.0275]], [0, 0.08, 0]),
    turned('rim-top', 'steel', 'y', [[0, 0.0235], [0, 0.031], [0.004, 0.031], [0.004, 0.0235], [0, 0.0235]], [0, 0.106, 0]),
    turned('rim-foot', 'steel', 'y', [[0, 0.02], [0, 0.031], [0.006, 0.031], [0.006, 0.02], [0, 0.02]]),
    disc('floor', 'floor', 0.0235, 0.002, 0.004),
  ], { steel: 'steel', floor: 'steel-stainless', paint: 'paint-olive', band: 'paint-crane-yellow' })
  + { voxelGrain: 0.002 },

  // A whole cannabis plant pulled up and laid on its side, 600 mm from root to tip: a woody stalk with a small
  // root ball, fan leaves of five to seven narrow leaflets at each node, and a dense flowering top.
  local leaflets(id, cx, cz, y, angle, n, length) = [
    local a = angle + (k - (n - 1) / 2) * 0.45, l = length * (1 - std.abs(k - (n - 1) / 2) * 0.22), w = l * 0.12;
    local d = [std.cos(a), std.sin(a)], p = [-std.sin(a), std.cos(a)];
    h.prism('%s-%d' % [id, k], 'leaf', 'y', [
      [cz, cx],
      [cz + d[1] * l * 0.4 + p[1] * w, cx + d[0] * l * 0.4 + p[0] * w],
      [cz + d[1] * l, cx + d[0] * l],
      [cz + d[1] * l * 0.4 - p[1] * w, cx + d[0] * l * 0.4 - p[0] * w],
    ], y, y + 0.004)
    for k in std.range(0, n - 1)
  ];
  local nodes = [
    { x: -0.12, side: 1, n: 7, l: 0.13, y: 0.004 },
    { x: -0.12, side: -1, n: 7, l: 0.12, y: 0.008 },
    { x: 0.0, side: 1, n: 7, l: 0.12, y: 0.012 },
    { x: 0.0, side: -1, n: 5, l: 0.11, y: 0.004 },
    { x: 0.1, side: 1, n: 5, l: 0.1, y: 0.008 },
    { x: 0.1, side: -1, n: 5, l: 0.09, y: 0.012 },
  ];
  h.compound('cannabis_plant', 0.16, [
    turned('stalk', 'stalk', 'x', [[0, 0], [0, 0.009], [0.3, 0.007], [0.5, 0.004], [0.5, 0]], [-0.24, 0.012, 0]),
    turned('root', 'root', 'x', [[0, 0], [0, 0.006], [0.03, 0.03], [0.06, 0.012], [0.06, 0]], [-0.3, 0.03, 0]),
  ] + std.flattenArrays([
    local node = nodes[i], cz = node.side * 0.03, a = node.side * 1.15 + 0.35;
    [h.prism('stem-%d' % i, 'stalk', 'y', [[0, node.x - 0.003], [0, node.x + 0.003], [cz, node.x + 0.006 + 0.012], [cz, node.x + 0.012]], 0.008, 0.014)]
    + leaflets('leaf-%d' % i, node.x + 0.015, cz, 0.016 + node.y, a, node.n, node.l)
    for i in std.range(0, std.length(nodes) - 1)
  ]) + [
    turned('cola-%d' % i, 'bud', 'x', [[0, 0], [0, b.r * 0.6], [b.l * 0.4, b.r], [b.l, b.r * 0.5], [b.l, 0]], [b.x, 0.026, b.z])
    for i in [0, 1, 2, 3, 4]
    for b in [[{ x: 0.16, z: 0, r: 0.018, l: 0.04 }, { x: 0.19, z: 0.004, r: 0.024, l: 0.04 }, { x: 0.22, z: -0.004, r: 0.022, l: 0.04 }, { x: 0.25, z: 0.003, r: 0.018, l: 0.035 }, { x: 0.275, z: 0, r: 0.011, l: 0.03 }][i]]
  ] + [
    h.prism('sugar-%d' % i, 'leaf', 'y', [[0, x], [0.03 * s, x + 0.02], [0.01 * s, x + 0.035]], 0.03, 0.034)
    for i in [0, 1, 2, 3]
    for x in [[0.18, 0.21, 0.24, 0.27][i]]
    for s in [[1, -1, 1, -1][i]]
  ], { stalk: 'plant-dried', root: 'paperboard-brown', leaf: 'plastic-green', bud: 'paint-olive' })
  + { voxelGrain: 0.004 },

  // A shop cash register, 360 mm wide, 360 mm deep and 300 mm tall: a cash drawer in the base with a lock and a
  // finger pull, a raked keypad of number and function keys, a receipt printer with paper showing at its slot, and
  // a small display on a post facing both clerk and customer.
  local slope(z) = 0.13 + (0.18 - z) * 0.07 / 0.22;
  h.compound('cash_register', 8.2, [
    box('base', 'body', [-0.18, 0.005, -0.18], [0.18, 0.1, 0.18]),
    box('foot', 'trim', [-0.17, 0, -0.17], [0.17, 0.005, 0.17]),
    box('drawer', 'drawer', [-0.17, 0.012, 0.18], [0.17, 0.092, 0.184]),
    box('pull', 'trim', [-0.06, 0.02, 0.184], [0.06, 0.03, 0.186]),
    disc('lock', 'metal', 0.007, 0, 0.004) + { axis: 'z', origin: [0.13, 0.07, 0.184] },
    h.prism('deck', 'body', 'x', [[0.1, 0.18], [0.1, -0.18], [0.2, -0.18], [0.2, -0.04], [0.13, 0.18]], -0.18, 0.09),
  ] + [
    box('key-%d-%d' % [i, j], if i == 5 && j == 0 then 'total' else if i >= 4 then 'fn' else 'key', [-0.165 + i * 0.04, slope(z) - 0.01, z - 0.013], [-0.14 + i * 0.04, slope(z - 0.013) + 0.005, z + 0.013])
    for i in std.range(0, 5)
    for j in std.range(0, 4)
    for z in [0.155 - j * 0.042]
  ] + [
    box('printer', 'body', [0.09, 0.1, -0.18], [0.18, 0.2, 0.12]),
    box('printer-lid', 'trim', [0.095, 0.2, -0.17], [0.175, 0.204, 0.05]),
    box('slot', 'trim', [0.1, 0.18, 0.12], [0.17, 0.188, 0.124]),
    h.prism('receipt', 'paper', 'x', [[0.184, 0.122], [0.184, 0.119], [0.24, 0.135], [0.24, 0.138]], 0.105, 0.165),
    box('post', 'trim', [-0.06, 0.2, -0.15], [-0.02, 0.26, -0.13]),
    box('display', 'body', [-0.1, 0.26, -0.165], [0.02, 0.3, -0.115]),
    box('screen-front', 'screen', [-0.092, 0.268, -0.115], [0.012, 0.292, -0.112]),
    box('screen-back', 'screen', [-0.092, 0.268, -0.168], [0.012, 0.292, -0.165]),
  ], {
    body: 'plastic-charcoal',
    trim: 'plastic-black',
    drawer: 'plastic-grey',
    metal: 'steel-stainless',
    key: 'plastic-white',
    fn: 'plastic-grey',
    total: 'plastic-red',
    paper: 'paper-white',
    screen: 'glass-lens-green',
  })
  + { voxelGrain: 0.004 },
]
