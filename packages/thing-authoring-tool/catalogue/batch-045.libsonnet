local h = import '../compound.libsonnet';
local box = h.box;
// A 2 by 4 board lying flat along x from 0 to `len`: 89 mm wide on z, 38 mm thick on y, with darker sawn end grain and
// a few grain streaks painted flush on its top face. Slots: board, end, grain.
local board(len, w=0.089, t=0.038) = [
  box('board', 'board', [0.003, 0, -w / 2], [len - 0.003, t, w / 2]),
  box('end-a', 'end', [0, 0, -w / 2], [0.003, t, w / 2]),
  box('end-b', 'end', [len - 0.003, 0, -w / 2], [len, t, w / 2]),
] + [
  box('grain-%d' % i, 'grain', [len * g[0], t - 0.002, g[2] - 0.002], [len * g[1], t + 0.0005, g[2] + 0.002])
  for i in std.range(0, 3)
  for g in [[[0.05, 0.62, -0.024], [0.3, 0.95, 0.008], [0.12, 0.45, 0.026], [0.55, 0.9, -0.012]][i]]
];
local boardFinish = { board: 'wood-pine', end: 'wood-birch', grain: 'wood-birch' };
local gripAt(id, solid, f) = h.gripOn(id, solid) + { fraction: [f, 0.5, 0.5] };
[
  // An 8 ft 2 by 4: 2440 by 89 by 38 mm.
  h.compound('plank_long', 4.2, board(2.44), boardFinish) + { handling: gripAt('plank_long', 'board', 0.08) },
  // A 2 ft 2 by 4: 610 by 89 by 38 mm.
  h.compound('plank_short', 1, board(0.61), boardFinish) + { handling: gripAt('plank_short', 'board', 0.2) },
  // A 300 mm offcut of 2 by 4 with two half-depth notches 50 mm wide sawn across its top face, for lap joints.
  local len = 0.3, w = 0.089, t = 0.038, d = 0.019;
  h.compound('notched_plank', 0.44, [
    box('base', 'board', [0.003, 0, -w / 2], [len - 0.003, d, w / 2]),
    box('end-a', 'end', [0, 0, -w / 2], [0.003, t, w / 2]),
    box('end-b', 'end', [len - 0.003, 0, -w / 2], [len, t, w / 2]),
    box('block-a', 'board', [0.003, d, -w / 2], [0.05, t, w / 2]),
    box('block-b', 'board', [0.1, d, -w / 2], [0.2, t, w / 2]),
    box('block-c', 'board', [0.25, d, -w / 2], [len - 0.003, t, w / 2]),
    box('notch-a', 'end', [0.05, d - 0.001, -w / 2], [0.1, d + 0.0005, w / 2]),
    box('notch-b', 'end', [0.2, d - 0.001, -w / 2], [0.25, d + 0.0005, w / 2]),
  ], boardFinish) + { voxelGrain: 0.004 },
  // A panel of three edge-glued boards, 1220 by 610 by 25 mm, lying flat, glue lines along x.
  local len = 1.22, w = 0.61, t = 0.025;
  h.compound('wood_panel', 9.4, [
    box('panel', 'board', [0.003, 0, -w / 2], [len - 0.003, t, w / 2]),
    box('end-a', 'end', [0, 0, -w / 2], [0.003, t, w / 2]),
    box('end-b', 'end', [len - 0.003, 0, -w / 2], [len, t, w / 2]),
  ] + [
    box('seam-%d' % i, 'seam', [0.003, t - 0.002, z - 0.002], [len - 0.003, t + 0.0005, z + 0.002])
    for i in [0, 1]
    for z in [[-w / 6, w / 6][i]]
  ] + [
    box('grain-%d' % i, 'grain', [len * g[0], t - 0.002, g[1] - 0.002], [len * g[2], t + 0.0005, g[1] + 0.002])
    for i in std.range(0, 3)
    for g in [[[0.1, -0.22, 0.7], [0.35, 0.02, 0.9], [0.05, 0.25, 0.5], [0.55, -0.15, 0.95]][i]]
  ], { board: 'wood-pine', end: 'wood-birch', seam: 'wood-oak', grain: 'wood-birch' }),
  // A press screw carved from one log, 1200 mm long: a 160 mm square head bored through for a turning bar, a plain
  // collar, then 900 mm of coarse thread 180 mm across the crests on a 120 mm core.
  local head = 0.16, pitch = 0.05, x0 = 0.25, n = 18;
  h.compound('giant_wood_screw', 16, [
    box('head', 'head', [0, 0.01, -head / 2], [head, 0.01 + head, head / 2]),
    box('bore-z', 'bore', [head / 2 - 0.022, 0.09 - 0.022, -head / 2 - 0.0005], [head / 2 + 0.022, 0.09 + 0.022, head / 2 + 0.0005]),
    box('bore-y', 'bore', [head / 2 - 0.022, 0.0095, -0.022], [head / 2 + 0.022, 0.0105 + head, 0.022]),
    h.turned('collar', 'body', 'x', [[0, 0], [0, 0.07], [x0 - head, 0.07], [x0 - head, 0]], [head, 0.09, 0]),
    h.turned('thread', 'body', 'x', [[0, 0], [0, 0.06]] + std.flattenArrays([
      [[i * pitch + 0.01, 0.09], [i * pitch + 0.02, 0.09], [(i + 1) * pitch, 0.06]]
      for i in std.range(0, n - 1)
    ]) + [[n * pitch, 0]], [x0, 0.09, 0]),
    h.turned('tip', 'body', 'x', [[0, 0], [0, 0.06], [0.05, 0.035], [0.05, 0]], [x0 + n * pitch, 0.09, 0]),
  ], { head: 'wood-oak', bore: 'coal-black', body: 'wood-oak' }),
  // A sawn length of trunk 1400 mm long and 220 mm across in bark, its cut ends showing rings round a dark pith, with
  // two lopped branch stubs.
  local r = 0.11, len = 1.4;
  h.compound('log', 23, [
    h.turned('trunk', 'bark', 'x', [[0, 0], [0, r * 0.97], [0.3, r], [0.9, r * 0.98], [len, r * 0.95], [len, 0]], [0, r, 0]),
  ] + std.flattenArrays([
    [
      h.turned('face-%d' % e, 'end', 'x', [[0, 0], [0, rr - 0.01], [0.002, rr - 0.01], [0.002, 0]], [x, r, 0]),
    ] + [
      h.tube('ring-%d-%d' % [e, k], 'ring', 0.02 + 0.025 * k, 0.024 + 0.025 * k, x - 0.0005, x + 0.0025, r, 0)
      for k in [0, 1, 2]
    ] + [
      h.turned('pith-%d' % e, 'ring', 'x', [[0, 0], [0, 0.008], [0.0025, 0.008], [0.0025, 0]], [x - 0.0005, r, 0]),
    ]
    for e in [0, 1]
    for x in [[-0.0015, len - 0.0005][e]]
    for rr in [[r * 0.97, r * 0.95][e]]
  ]) + [
    h.turned('stub-a', 'bark', 'y', [[0, 0], [0, 0.03], [0.05, 0.026], [0.05, 0]], [0.45, 2 * r - 0.02, 0.01]),
    h.turned('stub-a-cut', 'end', 'y', [[0, 0], [0, 0.022], [0.002, 0.022], [0.002, 0]], [0.45, 2 * r + 0.03, 0.01]),
    h.turned('stub-b', 'bark', 'z', [[0, 0], [0, 0.024], [0.045, 0.02], [0.045, 0]], [1.0, r + 0.02, r - 0.015]),
    h.turned('stub-b-cut', 'end', 'z', [[0, 0], [0, 0.017], [0.002, 0.017], [0.002, 0]], [1.0, r + 0.02, r + 0.03]),
  ], { bark: 'bark', end: 'wood-pine', ring: 'wood-oak' }),
  // A ten-foot hardwood pole, 3050 mm long and 40 mm across, tapering to 34 mm at the top, with a worn end.
  h.compound('long_pole', 2.2, [
    h.turned('pole', 'pole', 'x', [[0, 0], [0, 0.018], [0.006, 0.02], [3.0, 0.017], [3.05, 0.015], [3.05, 0]], [0, 0.02, 0]),
    h.turned('butt', 'end', 'x', [[0, 0], [0, 0.016], [0.002, 0.016], [0.002, 0]], [-0.0015, 0.02, 0]),
  ], { pole: 'wood-birch', end: 'wood-oak' }) + { handling: gripAt('long_pole', 'pole', 0.3) },
  // A shock-corded aluminium tent pole folded into a bundle of six 470 mm sections, 9.5 mm across, the joints
  // staggered so each section's ferrule shows, the cord peeping between the end sections.
  local r = 0.00475, len = 0.47, centres = h.hexPack(r + 0.0003, [3, 2, 1]);
  h.compound('tent_pole', 0.22, std.flattenArrays([
    local c = centres[i], off = (i % 2) * 0.012;
    [
      h.turned('section-%d' % i, 'tube', 'x', [[0, 0], [0, r], [len, r], [len, 0]], [-len / 2 + off, c.y, c.z]),
      h.turned('ferrule-%d' % i, 'ferrule', 'x', [[0, 0], [0, r + 0.0006], [0.03, r + 0.0006], [0.03, 0]], [-len / 2 + off + (if i % 2 == 0 then len - 0.03 else 0), c.y, c.z]),
    ]
    for i in std.range(0, std.length(centres) - 1)
  ]) + [
    h.turned('cord', 'cord', 'x', [[0, 0], [0, 0.0015], [0.016, 0.0015], [0.016, 0]], [-len / 2 - 0.008, centres[0].y + r, (centres[0].z + centres[1].z) / 2]),
    box('band-a', 'band', [-0.13, 0, centres[0].z - r - 0.0015], [-0.11, centres[5].y + r + 0.0015, centres[2].z + r + 0.0015]),
    box('band-b', 'band', [0.11, 0, centres[0].z - r - 0.0015], [0.13, centres[5].y + r + 0.0015, centres[2].z + r + 0.0015]),
  ], { tube: 'alu-bare', ferrule: 'steel-grey', cord: 'cord-cotton', band: 'webbing-black' }) + { voxelGrain: 0.002 },
  // A tanned hide folded fur side out, about 340 by 220 mm and 14 mm thick: a fold rolled along the back edge, two leg
  // tabs and a tail flap poking out, and the pale flesh side showing beneath.
  local t = 0.006, tab(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y0, y1);
  h.compound('tanned_pelt', 0.52, [
    tab('flesh', 'flesh', [[-0.17, -0.1], [0.17, -0.1], [0.165, 0.11], [-0.16, 0.12]], 0, t),
    tab('fur-lower', 'fur', [[-0.165, -0.095], [0.165, -0.095], [0.16, 0.105], [-0.155, 0.115]], t, 2 * t),
    tab('fur-upper', 'fur', [[-0.16, -0.1], [0.16, -0.1], [0.15, 0.1], [-0.15, 0.11]], 2 * t, 3 * t - 0.002),
    h.turned('fold', 'fur', 'x', [[0, 0], [0, t * 1.4], [0.32, t * 1.4], [0.32, 0]], [-0.16, t * 1.4, -0.1]),
    tab('leg-a', 'flesh', [[-0.15, 0.1], [-0.09, 0.105], [-0.11, 0.17], [-0.15, 0.165]], 0, t),
    tab('leg-a-fur', 'fur', [[-0.145, 0.1], [-0.095, 0.105], [-0.113, 0.162], [-0.145, 0.158]], t, t + 0.004),
    tab('leg-b', 'flesh', [[0.09, 0.105], [0.155, 0.1], [0.16, 0.16], [0.115, 0.17]], 0, t),
    tab('leg-b-fur', 'fur', [[0.095, 0.105], [0.15, 0.1], [0.153, 0.155], [0.118, 0.162]], t, t + 0.004),
    tab('tail', 'flesh', [[0.17, -0.02], [0.24, -0.005], [0.24, 0.02], [0.17, 0.04]], 0, t * 0.7),
    tab('tail-fur', 'fur', [[0.172, -0.012], [0.235, 0], [0.235, 0.015], [0.172, 0.032]], t * 0.7, t * 1.2),
  ], { fur: 'fur-brown', flesh: 'leather-tan' }) + { voxelGrain: 0.004 },
  // A loose lock of raw fleece about 160 by 90 mm and 60 mm high: crimped puffs bunched together, the tips drawn out.
  h.compound('wool_staple', 0.01, [
    h.ball('puff-%d' % i, if i >= 6 then 'tip' else 'wool', p[3], p[0], p[1], p[2], p[4])
    for i in std.range(0, 8)
    for p in [[
      [-0.03, 0.028, 0, 0.03, 0.9], [0.02, 0.03, -0.01, 0.032, 0.95], [0.045, 0.026, 0.018, 0.026, 0.9],
      [-0.005, 0.045, 0.012, 0.026, 0.8], [-0.05, 0.022, -0.02, 0.022, 0.9], [0.0, 0.022, 0.03, 0.022, 0.9],
      [0.075, 0.018, 0.0, 0.016, 0.9], [-0.072, 0.016, 0.01, 0.015, 0.9], [0.06, 0.044, -0.004, 0.012, 1],
    ][i]]
  ], { wool: 'cloth-cream', tip: 'fleece-pale' }) + { voxelGrain: 0.004 },
]
