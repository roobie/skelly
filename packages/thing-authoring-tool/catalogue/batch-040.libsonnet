local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';

// A single mattress lying flat, 1.9 m along x, 0.9 m along z and `ht` high, with piping round its top and bottom edges.
local mattress(ht) = [
  h.box('body', 'cover', [-0.95, 0.006, -0.45], [0.95, ht - 0.006, 0.45]),
] + std.flattenArrays([
  [
    h.box('pipe-front-%d' % i, 'piping', [-0.95, y, 0.444], [0.95, y + 0.012, 0.456]),
    h.box('pipe-back-%d' % i, 'piping', [-0.95, y, -0.456], [0.95, y + 0.012, -0.444]),
    h.box('pipe-left-%d' % i, 'piping', [-0.956, y, -0.456], [-0.944, y + 0.012, 0.456]),
    h.box('pipe-right-%d' % i, 'piping', [0.944, y, -0.456], [0.956, y + 0.012, 0.456]),
  ]
  for i in [0, 1]
  for y in [[0, ht - 0.012][i]]
]);

// One RC wheel lying on its side at (cx, cz): a 72 mm treaded tyre, 30 mm wide, on a five-spoke rim.
local wheel(n, cx, cz) =
  local spoke(i) =
    local a = (i * 72) * std.pi / 180;
    local c = std.cos(a), s = std.sin(a), w = 0.0035;
    local pt(r, side) = [cz + r * c - side * w * s, cx + r * s + side * w * c];
    h.prism('w%d-spoke-%d' % [n, i], 'rim', 'y', [pt(0.008, -1), pt(0.024, -1), pt(0.024, 1), pt(0.008, 1)], 0.024, 0.027);
  [
    h.turned('w%d-tyre' % n, 'tyre', 'y', [[0, 0.024], [0, 0.032], [0.003, 0.035], [0.027, 0.035], [0.030, 0.032], [0.030, 0.024], [0, 0.024]], [cx, 0, cz]),
    h.turned('w%d-rim' % n, 'rim', 'y', [[0.004, 0], [0.004, 0.0245], [0.022, 0.0245], [0.022, 0]], [cx, 0, cz]),
    h.turned('w%d-lip' % n, 'rim', 'y', [[0.022, 0.021], [0.022, 0.0245], [0.027, 0.0245], [0.027, 0.021], [0.022, 0.021]], [cx, 0, cz]),
    h.disc('w%d-hub' % n, 'hub', 0.009, 0.022, 0.031, cx, cz),
  ] + [spoke(i) for i in std.range(0, 4)]
  + std.flattenArrays([h.crescent('w%d-lug-%d' % [n, i], 'tyre', 0.034, 0.0375, i * 30, i * 30 + 14, 1, 0.005, 0.025, cx, cz) for i in std.range(0, 11)]);

// A cut-off piece of tyre tread, convex side up.
local chunkOutline = [[-0.125, -0.055], [0.118, -0.06], [0.125, 0.05], [-0.12, 0.058]];
local chunkR = 0.32;

// A coiled strip of tyre: quarter turns whose radius grows by `pitch` each turn, standing `w` high.
local coil(turns, r0, pitch, t, w) = std.flattenArrays([
  local r = r0 + pitch * q / 4;
  h.crescent('coil-%d' % q, 'strip', r, r + t, q * 90, q * 90 + 90, 4, 0, w)
  for q in std.range(0, turns * 4 - 1)
]);

[
  // A corn broom 1.4 m overall: a 1.0 m pine handle 25 mm thick and a 0.4 m straw head fanning to 0.3 m.
  h.compound('broom', 1.8, [
    h.rod('handle', 'handle', 0.0125, 0, 1.02, 0),
    h.turned('cap', 'cap', 'x', [[0, 0], [0, 0.009], [0.012, 0.0125], [0.012, 0]], [-0.012, 0, 0]),
    h.prism('head', 'straw', 'y', [[-0.035, 1.0], [0.035, 1.0], [0.15, 1.4], [-0.15, 1.4]], -0.022, 0.022),
    h.box('ferrule', 'ferrule', [1.0, -0.024, -0.038], [1.035, 0.024, 0.038]),
    h.box('stitch-a', 'stitch', [1.09, -0.025, -0.067], [1.1, 0.025, 0.067]),
    h.box('stitch-b', 'stitch', [1.15, -0.025, -0.084], [1.16, 0.025, 0.084]),
  ], { handle: 'wood-pine', cap: 'plastic-red', straw: 'straw-pale', ferrule: 'steel-galvanised', stitch: 'cloth-red' }) + {
    handling: h.gripOn('broom', 'handle'),
  },
  // A single down-filled mattress, 1.9 m by 0.9 m and 0.18 m deep, quilted in puffed channels across its width.
  h.compound('down_mattress', 4.7,
    mattress(0.17)
    + g.quilt({ style: 'channels', along: 'z', pitch: 0.095, r: 0.022, x0: -0.92, x1: 0.92, z0: -0.43, z1: 0.43, y: 0.17 }),
    { cover: 'cloth-cream', piping: 'cloth-heather-grey', quilt: 'cloth-cream' }),
  // A single sprung mattress, 1.9 m by 0.9 m and 0.18 m deep, striped ticking with tufts and side vents.
  h.compound('mattress', 18,
    mattress(0.18)
    + [h.box('stripe-%d' % i, 'stripe', [-0.94, 0.174, -0.42 + i * 0.07], [0.94, 0.176, -0.405 + i * 0.07]) for i in std.range(0, 12)]
    + [h.disc('tuft-%d-%d' % [i, j], 'tuft', 0.012, 0.174, 0.18, -0.75 + i * 0.25, -0.3 + j * 0.3) for i in std.range(0, 6) for j in std.range(0, 2)]
    + [h.disc('vent-%d' % i, 'vent', 0.008, 0.07, 0.11, s * 0.6, 0.452) for i in [0, 1] for s in [[-1, 1][i]]],
    { cover: 'cloth-cream', piping: 'cloth-navy', stripe: 'cloth-blue', tuft: 'cloth-navy', vent: 'steel-grey' }),
  // Four 72 mm RC buggy wheels lying two by two, 0.15 m square.
  h.compound('radio_car_wheel', 0.15,
    wheel(0, -0.038, -0.038) + wheel(1, 0.038, -0.038) + wheel(2, -0.038, 0.038) + wheel(3, 0.038, 0.038),
    { tyre: 'rubber-tread', rim: 'steel-bright', hub: 'plastic-matte-black' }) + { voxelGrain: 0.002 },
  // A 250 mm piece cut from a tyre tread, 115 mm wide and 40 mm deep with its lugs.
  h.compound('rubber_tire_chunk', 0.9,
    h.curvedPlate('carcass', 'carcass', chunkOutline, 0, 0.022, chunkR, 8)
    + std.flattenArrays([
      h.curvedPlate('lug-%d-%d' % [i, j], 'tread', [[x, z], [x + 0.022, z], [x + 0.022, z + 0.040], [x, z + 0.040]], 0.020, 0.012, chunkR, 1, curveHalf=0.125)
      for i in std.range(0, 6)
      for j in [0, 1]
      for x in [-0.113 + i * 0.033 + j * 0.012]
      for z in [[-0.048, 0.006][j]]
    ]),
    { carcass: 'rubber-offblack', tread: 'rubber-tread' }) + { voxelGrain: 0.004 },
  // A strip cut from a tyre, 140 mm wide and 16 mm thick, curled in two and a half turns 0.4 m across.
  h.compound('rubber_tire_strip', 6.5,
    coil(2.5, 0.1, 0.04, 0.016, 0.14) + [h.box('tail', 'strip', [-0.16, 0, -0.206], [0, 0.14, -0.19])],
    { strip: 'rubber-tread' }),
  // A fist-sized stone 80 mm long with one knapped edge.
  h.compound('sharp_rock', 0.56, [
    h.prism('body', 'stone', 'z', [[-0.04, 0.012], [-0.025, 0], [0.01, 0], [0.03, 0.01], [0.022, 0.04], [-0.01, 0.05], [-0.035, 0.038]], -0.024, 0.022),
    h.ball('round', 'stone', 0.03, -0.008, 0.024, 0, 0.8),
    h.prism('edge', 'edge', 'y', [[-0.02, 0.015], [0.018, 0.015], [0.0, 0.04]], 0.008, 0.034),
    h.prism('flake', 'edge', 'y', [[-0.012, 0.02], [0.01, 0.022], [-0.002, 0.034]], 0.034, 0.04),
  ], { stone: 'stone-grey', edge: 'stone-whet' }) + h.inHand('sharp_rock', 'round') + { voxelGrain: 0.002 },
  // A collapsible stock for an underbarrel grenade launcher, 0.26 m closed: a mount, twin steel rods and a butt plate.
  h.compound('ugl_buttstock', 0.32, [
    h.box('mount', 'body', [0, 0.005, -0.022], [0.06, 0.055, 0.022]),
    h.box('latch', 'latch', [0.02, 0.055, -0.008], [0.04, 0.062, 0.008]),
    h.turned('rod-a', 'rod', 'x', [[0, 0], [0, 0.006], [0.2, 0.006], [0.2, 0]], [0.05, 0.03, -0.014]),
    h.turned('rod-b', 'rod', 'x', [[0, 0], [0, 0.006], [0.2, 0.006], [0.2, 0]], [0.05, 0.03, 0.014]),
    h.box('butt', 'body', [0.24, 0, -0.024], [0.256, 0.11, 0.024]),
    h.box('pad', 'pad', [0.256, 0, -0.024], [0.264, 0.11, 0.024]),
    h.box('cheek', 'body', [0.17, 0.045, -0.02], [0.24, 0.06, 0.02]),
  ], { body: 'polymer-black', latch: 'steel-parkerized', rod: 'steel-parkerized', pad: 'rubber-black' }) + { voxelGrain: 0.004 },
  // A giant wasp's stinger, 150 mm: a lumpy, flattened venom sac on a short neck, a brown
  // sheath and a tapering black lance barbed on both edges.
  h.compound('wasp_sting', 0.036, [
    h.ball('sac-a', 'flesh', 0.014, 0.012, 0.016, 0, 0.6),
    h.ball('sac-b', 'flesh', 0.010, 0.004, 0.019, 0.008, 0.7),
    h.ball('sac-c', 'flesh', 0.010, 0.017, 0.014, -0.008, 0.6),
    h.ball('sac-d', 'flesh', 0.008, 0.002, 0.016, -0.006, 0.8),
    h.turned('neck', 'flesh', 'x', [[0, 0], [0, 0.005], [0.012, 0.0045], [0.012, 0]], [0.022, 0.02, 0]),
    h.turned('sheath', 'sheath', 'x', [[0, 0], [0, 0.012], [0.03, 0.009], [0.03, 0]], [0.032, 0.02, 0]),
    h.turned('lance', 'lance', 'x', [[0, 0], [0, 0.008], [0.06, 0.005], [0.088, 0], ], [0.062, 0.02, 0]),
  ] + [
    h.prism('barb-%d-%d' % [i, s], 'lance', 'z', [[x, 0.02 + s * r], [x - 0.010, 0.02 + s * (r + 0.004)], [x - 0.007, 0.02 + s * (r - 0.001)]], -0.0025, 0.0025)
    for i in std.range(0, 3)
    for s in [-1, 1]
    for x in [0.1 + i * 0.012]
    for r in [0.008 - (x - 0.062) * 0.003 / 0.06]
  ], { flesh: 'flesh-membrane', sheath: 'chitin-brown', lance: 'chitin-black' }) + {
    handling: h.gripOn('wasp_sting', 'sheath'),
    voxelGrain: 0.002,
  },
  // A broken block of paraffin wax about 100 by 60 by 45 mm.
  h.compound('wax_paraffin', 0.2, [
    h.prism('block', 'wax', 'z', [[-0.05, 0], [0.045, 0], [0.05, 0.02], [0.032, 0.042], [-0.02, 0.046], [-0.05, 0.034]], -0.03, 0.026),
    h.prism('lump', 'wax', 'z', [[-0.04, 0.045], [0.02, 0.045], [0.0, 0.055], [-0.035, 0.052]], -0.02, 0.012),
  ], { wax: 'wax-ivory' }) + { voxelGrain: 0.002 },
]
