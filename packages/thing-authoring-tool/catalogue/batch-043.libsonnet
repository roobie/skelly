local h = import '../compound.libsonnet';
local box = h.box;
local disc = h.disc;
// An [x, z] outline as a prism lying flat on y from `y0` to `y1`.
local flat(id, slot, outline, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in outline], y0, y1);
// A roughly square cut of cloth `s` across: corners nudged off true so it reads as cut by hand.
local square(s, jog=0.004) = [[-s / 2, -s / 2 + jog], [s / 2 - jog, -s / 2], [s / 2, s / 2 - jog], [-s / 2 + jog, s / 2]];
// Running stitches along each edge of a square `s` across, `inset` in from the edge, standing on y.
local stitches(prefix, slot, s, inset, y, n=9) = [
  local a = -s / 2 + inset + (i + 0.2) * (s - 2 * inset) / n, b = a + 0.6 * (s - 2 * inset) / n;
  [
    box('%s-n-%d' % [prefix, i], slot, [a, y, -s / 2 + inset - 0.001], [b, y + 0.002, -s / 2 + inset + 0.001]),
    box('%s-s-%d' % [prefix, i], slot, [a, y, s / 2 - inset - 0.001], [b, y + 0.002, s / 2 - inset + 0.001]),
    box('%s-w-%d' % [prefix, i], slot, [-s / 2 + inset - 0.001, y, a], [-s / 2 + inset + 0.001, y + 0.002, b]),
    box('%s-e-%d' % [prefix, i], slot, [s / 2 - inset - 0.001, y, a], [s / 2 - inset + 0.001, y + 0.002, b]),
  ]
  for i in std.range(0, n - 1)
];
// Short loose threads poking out of the edges of a square `s` across, for a raw-cut patch.
local fray(prefix, slot, s, y0, y1) = [
  local t = -s / 2 + 0.012 + i * (s - 0.024) / 6;
  [
    box('%s-a-%d' % [prefix, i], slot, [t, y0, -s / 2 - 0.004], [t + 0.002, y1, -s / 2 + 0.002]),
    box('%s-b-%d' % [prefix, i], slot, [t + 0.006, y0, s / 2 - 0.002], [t + 0.008, y1, s / 2 + 0.004]),
    box('%s-c-%d' % [prefix, i], slot, [s / 2 - 0.002, y0, t + 0.003], [s / 2 + 0.004, y1, t + 0.005]),
  ]
  for i in std.range(0, 6)
];
// A hide rolled along x, `length` long and `r` across, tied with cord near each end. `layers` rings show the spiral
// at each end, alternating the outer (scraped) and inner side finishes; the free edge lies along the top.
local roll(id, massKg, length, r, layers, outer, inner, extra=[], extraFinish={}) =
  local half = length / 2;
  h.compound(id, massKg, [
    h.rod('core', 'inner', r * 0.25, -half - 0.006, half + 0.004, r),
  ] + [
    local r0 = r * (0.25 + 0.75 * i / layers), r1 = r * (0.25 + 0.75 * (i + 1) / layers), jog = [0.004, -0.003, 0.002, -0.005, 0.003][i % 5];
    h.tube('layer-%d' % i, if i % 2 == 0 then 'outer' else 'inner', r0, r1, -half + jog, half + jog * 0.5, r, 0)
    for i in std.range(0, layers - 1)
  ] + [
    box('edge', 'outer', [-half + 0.004, r * 1.7, -0.002], [half - 0.003, r * 1.7 + 0.004, r * 0.75]),
  ] + [
    h.tube('tie-%d' % i, 'tie', r, r + 0.003, x - 0.003, x + 0.003, r, 0)
    for i in [0, 1]
    for x in [[-half * 0.6, half * 0.6][i]]
  ] + extra, { outer: outer, inner: inner, tie: 'cord-cotton' } + extraFinish);
local bits = [
  [[-0.02, -0.012], [0.018, -0.016], [0.022, 0.0], [-0.012, 0.01]],
  [[-0.004, -0.004], [0.014, 0.006], [0.004, 0.022], [-0.016, 0.014]],
  [[0.006, -0.02], [0.024, -0.018], [0.02, 0.004], [0.01, -0.002]],
  [[-0.024, 0.004], [-0.006, 0.0], [-0.01, 0.018], [-0.022, 0.02]],
  [[-0.008, -0.02], [0.006, -0.014], [0.0, -0.004], [-0.014, -0.008]],
];
// A loose heap of offcuts lying on each other.
local scraps(id, massKg, finish) = h.compound(id, massKg, [
  flat('bit-%d' % i, 'cloth', bits[i], [0, 0.002, 0.002, 0.004, 0.002][i], [0, 0.002, 0.002, 0.004, 0.002][i] + 0.002)
  for i in std.range(0, std.length(bits) - 1)
], { cloth: finish }) + { voxelGrain: 0.002 };
[
  // A cured hide rolled up into a tight roll 200 mm long and 28 mm across, tied with cord near each end.
  roll('cured_hide', 0.098, 0.2, 0.014, 4, 'skin-rawhide', 'beeswax') + { voxelGrain: 0.002 },

  // A cured pelt rolled fur side in, 170 mm long and 60 mm across, tied with cord near each end; tufts of fur show
  // at both ends of the roll.
  roll('cured_pelt', 0.17, 0.17, 0.03, 5, 'skin-rawhide', 'fur-brown', [
    h.ball('tuft-%d' % i, 'fur', 0.006, [-0.088, 0.09][i % 2], 0.03 + [0.012, -0.01, 0.004, -0.016, 0.016, 0][i], [0.008, 0.012, -0.014, 0.002, -0.006, 0.016][i])
    for i in std.range(0, 5)
  ], { fur: 'fur-brown' }) + { voxelGrain: 0.002 },

  // A square of blue denim 150 mm across, hemmed with paler stitching round its edge.
  h.compound('denim_patch', 0.012, [flat('cloth', 'cloth', square(0.15), 0, 0.002)]
    + std.flattenArrays(stitches('stitch', 'stitch', 0.15, 0.008, 0.002)),
    { cloth: 'cloth-denim', stitch: 'cloth-denim-faded' }) + { voxelGrain: 0.002 },

  // A square of grey felt 150 mm across and about 2 mm thick, with clean cut edges.
  h.compound('felt_patch', 0.012, [flat('felt', 'felt', square(0.15, 0.002), 0, 0.002)], { felt: 'felt-grey' })
  + { voxelGrain: 0.002 },

  // A square of fur 150 mm across: a tan leather back with shaggy fur 6 mm deep lying over it.
  h.compound('fur', 0.053, [
    flat('back', 'back', square(0.15, 0.006), 0, 0.002),
    flat('fur', 'fur', square(0.144, 0.008), 0.002, 0.006),
  ] + [
    local jx = [0.003, -0.004, 0.001, 0.005, -0.002, -0.005, 0.004][(i * 3 + j) % 7], jz = [-0.003, 0.004, 0.0, -0.005, 0.002, 0.005, -0.001][(i * 5 + j) % 7];
    h.ball('tuft-%d-%d' % [i, j], 'fur', [0.006, 0.008, 0.007, 0.009, 0.0065][(i + 2 * j) % 5], -0.06 + i * 0.02 + (j % 2) * 0.01 + jx, 0.004, -0.06 + j * 0.02 + jz, [0.35, 0.5, 0.4, 0.55][(i + j) % 4])
    for i in std.range(0, 5)
    for j in std.range(0, 6)
  ], { back: 'leather-tan', fur: 'fur-brown' }) + { voxelGrain: 0.002 },

  // A loose wad of stuffing about 65 mm across and 30 mm high: shredded rags, dry grass and tufts of hair heaped
  // in one lumpy mound, with grass stalks poking out of it.
  local lumps = [
    [0, 0.012, 0, 0.034, 'rag', 0.4], [-0.016, 0.016, -0.008, 0.016, 'rag-shadow', 0.8], [0.014, 0.016, 0.006, 0.016, 'grass', 0.8],
    [0.026, 0.01, -0.012, 0.011, 'hair', 0.8], [-0.004, 0.022, 0.012, 0.013, 'rag', 0.8], [-0.026, 0.011, 0.014, 0.011, 'grass', 0.7],
    [0.004, 0.026, -0.008, 0.012, 'rag-shadow', 0.8], [0.024, 0.012, 0.018, 0.009, 'rag', 0.8], [-0.008, 0.03, 0.002, 0.009, 'hair', 0.9],
  ];
  h.compound('gambeson_batting', 0.013, h.scaled([
    h.ball('lump-%d' % i, lumps[i][4], lumps[i][3], lumps[i][0], lumps[i][1], lumps[i][2], lumps[i][5])
    for i in std.range(0, std.length(lumps) - 1)
  ] + [
    h.prism('straw-a', 'grass', 'z', [[-0.044, 0.008], [0.03, 0.03], [0.03, 0.032], [-0.044, 0.01]], -0.002, 0.0),
    h.prism('straw-b', 'grass', 'x', [[0.012, 0.034], [0.03, -0.03], [0.032, -0.03], [0.014, 0.034]], -0.004, -0.002),
    h.prism('straw-c', 'grass', 'z', [[0.04, 0.006], [-0.01, 0.034], [-0.01, 0.036], [0.04, 0.008]], 0.012, 0.014),
    box('thread-a', 'rag', [-0.032, 0.022, 0.006], [0.01, 0.024, 0.008]),
  ], 0.8), { rag: 'cloth-rag', 'rag-shadow': 'cloth-rag-shadow', grass: 'straw-pale', hair: 'fur-brown' }) + { voxelGrain: 0.002 },

  // A ball of coarse grass yarn 80 mm across, wound in several directions, with a loose end trailing off.
  h.compound('grass_yarn', 0.049, [
    h.ball('ball', 'yarn', 0.04, 0, 0.04, 0, 1, 14),
  ] + [
    local x = [-0.028, -0.014, 0, 0.014, 0.028][i], r = std.sqrt(0.0016 - x * x);
    h.tube('wrap-x-%d' % i, 'wind', r - 0.004, r + 0.0015, x - 0.0015, x + 0.0015, 0.04, 0)
    for i in std.range(0, 4)
  ] + [
    local z = [-0.02, 0, 0.02][i], r = std.sqrt(0.0016 - z * z);
    h.turned('wrap-z-%d' % i, 'wind', 'z', [[0, r - 0.004], [0, r + 0.0015], [0.003, r + 0.0015], [0.003, r - 0.004], [0, r - 0.004]], [0, 0.04, z - 0.0015])
    for i in std.range(0, 2)
  ] + [
    box('end-a', 'wind', [0.03, 0.002, 0.03], [0.07, 0.006, 0.034]),
    box('end-b', 'wind', [0.066, 0.002, 0.034], [0.07, 0.006, 0.06]),
  ], { yarn: 'straw-rope', wind: 'jute' }) + { voxelGrain: 0.002 },

  // A square of loosely woven golden Kevlar 150 mm across, its weave showing as raised threads and its raw edges fraying.
  h.compound('kevlar_patch', 0.008, [flat('cloth', 'cloth', square(0.15, 0.003), 0, 0.002)] + [
    box('weave-%d' % i, 'weave', [-0.07, 0.002, -0.07 + i * 0.0175], [0.07, 0.003, -0.068 + i * 0.0175])
    for i in std.range(0, 8)
  ] + [
    box('warp-%d' % i, 'weave', [-0.07 + i * 0.0175, 0.003, -0.07], [-0.068 + i * 0.0175, 0.004, 0.07])
    for i in std.range(0, 8)
  ] + std.flattenArrays(fray('fray', 'cloth', 0.15, 0, 0.002)), { cloth: 'aramid-gold', weave: 'aramid-gold' })
  + { voxelGrain: 0.002 },

  // A roughly square piece of brown leather about 150 mm across, its edges cut unevenly from a larger hide.
  h.compound('leather', 0.04, [
    flat('leather', 'leather', [
      [-0.074, -0.07], [-0.02, -0.077], [0.05, -0.073], [0.076, -0.066], [0.078, 0.02], [0.07, 0.074], [0.0, 0.078], [-0.07, 0.072], [-0.078, 0.0],
    ], 0, 0.002),
  ], { leather: 'leather-brown' }) + { voxelGrain: 0.002 },

  // A square of flame-resistant Nomex cloth 150 mm across, hemmed with matching stitching.
  h.compound('nomex', 0.005, [flat('cloth', 'cloth', square(0.15), 0, 0.002)]
    + std.flattenArrays(stitches('stitch', 'stitch', 0.15, 0.008, 0.002)),
    { cloth: 'knit-fr', stitch: 'cloth-turnout' }) + { voxelGrain: 0.002 },

  // A stiff panel of epoxy-set Kevlar 300 mm by 250 mm and 11 mm thick with rounded corners; the cut edge shows its
  // layers in amber resin.
  local corner(cx, cz, a0) = [[cx + 0.02 * std.cos(a0 + k * std.pi / 8), cz + 0.02 * std.sin(a0 + k * std.pi / 8)] for k in std.range(0, 4)];
  local outline = corner(0.13, 0.105, 0) + corner(-0.13, 0.105, std.pi / 2) + corner(-0.13, -0.105, std.pi) + corner(0.13, -0.105, 3 * std.pi / 2);
  h.compound('rigid_kevlar_plate', 1.6, [
    flat('plate', 'plate', outline, 0, 0.012),
  ] + [
    flat('layer-%d' % i, 'resin', [[p[0] * 1.004, p[1] * 1.004] for p in outline], y, y + 0.002)
    for i in std.range(0, 1)
    for y in [[0.003, 0.007][i]]
  ], { plate: 'aramid-gold', resin: 'resin-honey' }) + { voxelGrain: 0.004 },

  // A small heap of golden Kevlar offcuts, the largest about 40 mm long, lying loosely on each other.
  scraps('scrap_kevlar', 0.00067, 'aramid-gold'),

  // A small heap of Nomex offcuts, the largest about 40 mm long, lying loosely on each other.
  scraps('scrap_nomex', 0.00067, 'knit-fr'),

  // A waxed canvas sheet 610 mm by 305 mm laid flat, hemmed all round, with one corner turned back.
  h.compound('sheet_canvas', 0.071, [
    flat('sheet', 'canvas', [[-0.305, -0.1525], [0.305, -0.1525], [0.305, 0.1525], [-0.24, 0.1525], [-0.305, 0.0875]], 0, 0.002),
    flat('fold', 'hem', [[-0.305, 0.0875], [-0.24, 0.1525], [-0.24, 0.0875]], 0.002, 0.004),
    box('hem-n', 'hem', [-0.3, 0.002, -0.15], [0.3, 0.004, -0.144]),
    box('hem-s', 'hem', [-0.23, 0.002, 0.144], [0.3, 0.004, 0.15]),
    box('hem-e', 'hem', [0.294, 0.002, -0.144], [0.3, 0.004, 0.144]),
    box('hem-w', 'hem', [-0.3, 0.002, -0.144], [-0.294, 0.004, 0.08]),
  ], { canvas: 'cloth-canvas', hem: 'canvas-grey' }) + { voxelGrain: 0.002 },

  // A canvas sheet 610 mm by 305 mm laid flat, sewn from six odd panels in three shades with raised seams between them.
  local cols = [-0.305, -0.1, 0.09, 0.305];
  h.compound('sheet_canvas_patchwork', 0.069, [
    box('panel-%d-%d' % [i, j], 'panel-%d' % ((i + j) % 3), [cols[i], 0, [-0.1525, [0.02, -0.03, 0.04][i]][j]], [cols[i + 1], 0.002, [[0.02, -0.03, 0.04][i], 0.1525][j]])
    for i in std.range(0, 2)
    for j in std.range(0, 1)
  ] + [
    box('seam-x-%d' % i, 'seam', [cols[i] - 0.002, 0.002, -0.1525], [cols[i] + 0.002, 0.004, 0.1525])
    for i in [1, 2]
  ] + [
    box('seam-z-%d' % i, 'seam', [cols[i] + 0.002, 0.002, [0.02, -0.03, 0.04][i] - 0.002], [cols[i + 1] - 0.002, 0.004, [0.02, -0.03, 0.04][i] + 0.002])
    for i in std.range(0, 2)
  ], { 'panel-0': 'cloth-canvas', 'panel-1': 'canvas-grey', 'panel-2': 'cloth-khaki', seam: 'cord-cotton' }) + { voxelGrain: 0.002 },
]
