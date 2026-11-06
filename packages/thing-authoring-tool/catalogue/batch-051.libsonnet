local h = import '../compound.libsonnet';
local box = h.box;
local disc = h.disc;
local rod = h.rod;
// A flat bar `w` wide from [x, y] point `a` to `b`, from z0 to z1: braces, levers and legs at an angle in the xy plane.
local barZ(id, slot, a, b, w, z0, z1) =
  local dx = b[0] - a[0], dy = b[1] - a[1], len = std.sqrt(dx * dx + dy * dy), nx = -dy / len * w / 2, ny = dx / len * w / 2;
  h.prism(id, slot, 'z', [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], z0, z1);
// The same bar in the xz plane between [x, z] points, from y0 to y1.
local barY(id, slot, a, b, w, y0, y1) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz), nx = -dz / len * w / 2, nz = dx / len * w / 2;
  h.prism(id, slot, 'y', [[a[1] + nz, a[0] + nx], [b[1] + nz, b[0] + nx], [b[1] - nz, b[0] - nx], [a[1] - nz, a[0] - nx]], y0, y1);
// A ring facing z, radii r0 to r1, from z0 to z1, centred at (x, y).
local hoop(id, slot, r0, r1, z0, z1, x, y) = h.turned(id, slot, 'z', [[0, r0], [0, r1], [z1 - z0, r1], [z1 - z0, r0], [0, r0]], [x, y, z0]);
// A bar running out from (cx, cy) at `deg` degrees from r0 to r1, `w` wide, from z0 to z1: spokes and paddles.
local radial(id, slot, r0, r1, w, deg, z0, z1, cx, cy) =
  local a = deg * std.pi / 180, c = std.cos(a), s = std.sin(a);
  barZ(id, slot, [cx + r0 * c, cy + r0 * s], [cx + r1 * c, cy + r1 * s], w, z0, z1);
// A sheet rolled along x, `len` long and `r` round, its ends showing the rolled layers, tied with `ties` bands.
local roll(len, r, ties, sheet, shadow, tie) = [
  rod('roll', 'sheet', r, -len / 2, len / 2, r),
] + std.flattenArrays([
  [
    h.tube('layer-a-%d' % s, 'shadow', r * 0.3, r * 0.42, x, x + 0.003, r),
    h.tube('layer-b-%d' % s, 'shadow', r * 0.62, r * 0.72, x, x + 0.003, r),
    h.tube('layer-c-%d' % s, 'shadow', r * 0.88, r * 0.94, x, x + 0.003, r),
  ]
  for s in [0, 1]
  for x in [[-len / 2 - 0.003, len / 2][s]]
]) + [
  h.tube('tie-%d' % i, 'tie', r, r + 0.003, x - 0.006, x + 0.006, r)
  for i in std.range(0, std.length(ties) - 1)
  for x in [ties[i] * len / 2]
];
// A wire grate lying flat, `l` along x and `w` along z, at height y: a rod frame with bars across every `gap`.
local grate(prefix, l, w, y, gap) = [
  box(prefix + '-front', 'frame', [-l / 2, y, w / 2 - 0.008], [l / 2, y + 0.008, w / 2]),
  box(prefix + '-back', 'frame', [-l / 2, y, -w / 2], [l / 2, y + 0.008, -w / 2 + 0.008]),
  box(prefix + '-left', 'frame', [-l / 2, y, -w / 2], [-l / 2 + 0.008, y + 0.008, w / 2]),
  box(prefix + '-right', 'frame', [l / 2 - 0.008, y, -w / 2], [l / 2, y + 0.008, w / 2]),
] + [
  box('%s-bar-%d' % [prefix, i], 'wire', [x - 0.002, y + 0.002, -w / 2 + 0.008], [x + 0.002, y + 0.006, w / 2 - 0.008])
  for i in std.range(1, std.floor(l / gap) - 1)
  for x in [-l / 2 + i * gap]
];
// An S-hook in the xy plane hanging from (x, y), 4 mm stock, `ht` tall, at depth z.
// An S-hook of 4 mm wire hung over a bar along x at (y, z) of radius `r`: the top curl wraps the bar, the shank
// drops in front of whatever lies below it and the bottom curl turns open towards +z, at height `foot`.
local hangHook(id, x, y, z, r, foot) =
  local top = r + 0.004;
  local path = [[y + top * std.sin(a), z + top * std.cos(a)] for a in [std.pi * d / 180 for d in [160, 120, 90, 60, 30, 0, -30]]]
    + [[foot + 0.03, z + 0.034], [foot + 0.012, z + 0.036]]
    + [[foot + 0.012 - 0.012 * std.cos(a), z + 0.048 - 0.012 * std.sin(a)] for a in [std.pi * d / 180 for d in [30, 60, 90, 120, 150, 180, 210]]];
  [
    local a = path[i];
    local b = path[i + 1];
    local q = [a[0] + (b[0] - a[0]) * k / 4, a[1] + (b[1] - a[1]) * k / 4];
    box('%s-%d-%d' % [id, i, k], 'hook', [x - 0.002, q[0] - 0.002, q[1] - 0.002], [x + 0.002, q[0] + 0.002, q[1] + 0.002])
    for i in std.range(0, std.length(path) - 2)
    for k in std.range(0, 3)
  ];
[
  // A bench-mounted lever shear for sheet metal: a cast frame on a 300 by 240 mm foot plate, a 200 mm blade pair and a
  // 0.9 m lever raised to cut, about 0.95 m along the lever.
  h.compound('beverly_shear', 39, [
    box('foot', 'frame', [-0.15, 0, -0.12], [0.15, 0.02, 0.12]),
  ] + [
    disc('bolt-%d' % i, 'bolt', 0.009, 0.02, 0.026, [-0.12, 0.12][i % 2], [-0.09, 0.09][std.floor(i / 2)])
    for i in std.range(0, 3)
  ] + [
    h.prism('body', 'frame', 'z', [[-0.1, 0.02], [0.1, 0.02], [0.08, 0.2], [-0.08, 0.24]], -0.04, 0.04),
    box('jaw', 'frame', [-0.1, 0.2, -0.04], [0.12, 0.25, 0.04]),
    box('lower-blade', 'blade', [-0.08, 0.25, 0.03], [0.14, 0.26, 0.045]),
    h.prism('upper-blade', 'blade', 'z', [[-0.09, 0.262], [0.14, 0.262], [0.14, 0.285], [-0.09, 0.33]], 0.045, 0.058),
    h.prism('arm', 'lever', 'z', [[-0.11, 0.29], [0.02, 0.29], [0.02, 0.33], [-0.11, 0.36]], 0.058, 0.07),
    h.turned('pivot', 'bolt', 'z', [[0, 0], [0, 0.016], [0.13, 0.016], [0.13, 0]], [-0.08, 0.3, -0.05]),
    barZ('lever', 'lever', [-0.07, 0.33], [0.5, 0.95], 0.03, 0.058, 0.074),
    h.turned('grip', 'grip', 'z', [[0, 0], [0, 0.018], [0.12, 0.018], [0.12, 0]], [0.5, 0.95, 0.006]),
    h.prism('hold-down', 'frame', 'z', [[0.04, 0.26], [0.12, 0.26], [0.12, 0.31], [0.07, 0.31]], -0.04, 0.03),
  ], { frame: 'paint-olive', bolt: 'steel-grey', blade: 'steel-bright', lever: 'steel-grey', grip: 'rubber-black' }),

  // A steel fire bowl 550 mm across and 160 mm deep on three legs, its rim 440 mm off the ground, with a bar grate in
  // the bottom.
  h.compound('brazier', 18, [
    h.turned('bowl', 'bowl', 'y', [[0, 0], [0, 0.12], [0.12, 0.25], [0.16, 0.275], [0.166, 0.275], [0.166, 0.262], [0.126, 0.238], [0.008, 0.112], [0.008, 0]], [0, 0.28, 0]),
  ] + [
    h.turned('leg-%d' % i, 'leg', 'y', [[0, 0], [0, 0.012], [0.33, 0.012], [0.33, 0]], [0.2 * std.sin(a), 0, 0.2 * std.cos(a)])
    for i in std.range(0, 2)
    for a in [i * 2 * std.pi / 3]
  ] + [
    disc('foot-%d' % i, 'leg', 0.03, 0, 0.008, 0.2 * std.sin(a), 0.2 * std.cos(a))
    for i in std.range(0, 2)
    for a in [i * 2 * std.pi / 3]
  ] + [
    h.turned('brace', 'leg', 'y', [[0, 0.19], [0, 0.208], [0.012, 0.208], [0.012, 0.19], [0, 0.19]], [0, 0.1, 0]),
  ] + [
    box('grate-%d' % i, 'grate', [-0.15, 0.3, z - 0.005], [0.15, 0.31, z + 0.005])
    for i in std.range(0, 4)
    for z in [-0.1 + i * 0.05]
  ] + [
    hoop('handle-%d' % i, 'leg', 0.025, 0.033, -0.006, 0.006, x, 0.43)
    for i in [0, 1]
    for x in [[-0.3, 0.3][i]]
  ], { bowl: 'iron-dull', leg: 'steel-parkerized', grate: 'steel-grey' }),

  // A folding chair folded flat and standing on its feet: 450 mm wide, 880 mm tall and 70 mm deep, a grey moulded
  // seat and back on a tubular steel frame, the seat folded up against the front legs.
  h.compound('chair_folding', 5.1, [
    rod('upright-l', 'frame', 0.011, 0, 0.88, 0) + { axis: 'y', origin: [-0.2, 0, 0], profile: [[0, 0], [0, 0.011], [0.88, 0.011], [0.88, 0]] },
    rod('upright-r', 'frame', 0.011, 0, 0.88, 0) + { axis: 'y', origin: [0.2, 0, 0], profile: [[0, 0], [0, 0.011], [0.88, 0.011], [0.88, 0]] },
    rod('top-rail', 'frame', 0.011, -0.2, 0.2, 0.875),
    rod('rear-l', 'frame', 0.01, 0, 0.62, 0) + { axis: 'y', origin: [-0.18, 0, -0.026], profile: [[0, 0], [0, 0.01], [0.62, 0.01], [0.62, 0]] },
    rod('rear-r', 'frame', 0.01, 0, 0.62, 0) + { axis: 'y', origin: [0.18, 0, -0.026], profile: [[0, 0], [0, 0.01], [0.62, 0.01], [0.62, 0]] },
    rod('rear-rail', 'frame', 0.009, -0.18, 0.18, 0.12) + { origin: [-0.18, 0.12, -0.026] },
    rod('front-rail', 'frame', 0.009, -0.2, 0.2, 0.1) + { origin: [-0.2, 0.1, 0] },
    box('back', 'panel', [-0.19, 0.6, -0.012], [0.19, 0.86, 0.012]),
    box('hand-hole', 'hole', [-0.06, 0.79, 0.012], [0.06, 0.82, 0.0125]),
    box('seat', 'panel', [-0.19, 0.24, 0.012], [0.19, 0.62, 0.032]),
    box('seat-lip', 'panel', [-0.19, 0.6, 0.012], [0.19, 0.62, 0.04]),
    rod('hinge', 'frame', 0.008, -0.2, 0.2, 0.25) + { origin: [-0.2, 0.25, 0.02] },
  ] + [
    disc('foot-%d' % i, 'foot', 0.014, 0, 0.012, [-0.2, 0.2, -0.18, 0.18][i], [0, 0, -0.026, -0.026][i])
    for i in std.range(0, 3)
  ], { frame: 'steel-grey', panel: 'plastic-grey', foot: 'rubber-black', hole: 'plastic-charcoal' }),

  // A foot-cranked barrel churn: a staved oak barrel 340 mm long and 240 mm across, lying in a two-ended stand
  // 460 mm tall, with a crank at one end and a treadle bar along the floor.
  local cy = 0.32;
  h.compound('churn', 13, [
    h.turned('barrel', 'barrel', 'x', [[0, 0], [0, 0.1], [0.06, 0.115], [0.17, 0.122], [0.28, 0.115], [0.34, 0.1], [0.34, 0]], [-0.17, cy, 0]),
  ] + [
    h.tube('hoop-%d' % i, 'hoop', 0.1, 0.124, x - 0.008, x + 0.008, cy)
    for i in std.range(0, 3)
    for x in [[-0.15, -0.06, 0.06, 0.15][i]]
  ] + [
    box('hatch', 'hatch', [-0.04, cy + 0.112, -0.05], [0.04, cy + 0.13, 0.05]),
    box('hatch-latch', 'hoop', [-0.006, cy + 0.12, -0.06], [0.006, cy + 0.134, 0.06]),
  ] + std.flattenArrays([
    [
      barZ('leg-%d-a' % s, 'stand', [x - 0.0, 0], [x, cy + 0.03], 0.04, -0.15, -0.12),
      barZ('leg-%d-b' % s, 'stand', [x, 0], [x, cy + 0.03], 0.04, 0.12, 0.15),
      box('foot-%d' % s, 'stand', [x - 0.025, 0, -0.17], [x + 0.025, 0.04, 0.17]),
      box('cross-%d' % s, 'stand', [x - 0.02, cy - 0.03, -0.15], [x + 0.02, cy + 0.0, 0.15]),
    ]
    for s in [0, 1]
    for x in [[-0.21, 0.21][s]]
  ]) + [
    rod('axle', 'iron', 0.01, -0.24, 0.27, cy),
    box('crank', 'iron', [0.27, cy - 0.01, -0.01], [0.285, cy + 0.01, 0.18]),
    h.turned('crank-grip', 'stand', 'x', [[0, 0], [0, 0.014], [0.09, 0.014], [0.09, 0]], [0.285, cy, 0.17]),
    barY('treadle', 'stand', [-0.19, 0.2], [0.3, 0.2], 0.08, 0.04, 0.065),
    box('pitman', 'iron', [0.288, 0.065, 0.164], [0.3, cy, 0.176]),
  ], { barrel: 'wood-oak', hoop: 'iron-dull', hatch: 'wood-pine', stand: 'wood-pine', iron: 'iron-dull' }),

  // A folding army cot folded for carrying: 1 m long, 220 mm wide and 150 mm tall, the olive canvas bed folded
  // between two aluminium side rails, the legs folded under and two straps round it.
  h.compound('cot', 7, [
    box('canvas', 'canvas', [-0.48, 0.035, -0.085], [0.48, 0.135, 0.085]),
    rod('rail-a', 'rail', 0.016, -0.5, 0.5, 0.12) + { origin: [-0.5, 0.12, -0.095] },
    rod('rail-b', 'rail', 0.016, -0.5, 0.5, 0.12) + { origin: [-0.5, 0.12, 0.095] },
    rod('rail-c', 'rail', 0.014, -0.48, 0.48, 0.05) + { origin: [-0.48, 0.05, -0.095] },
    rod('rail-d', 'rail', 0.014, -0.48, 0.48, 0.05) + { origin: [-0.48, 0.05, 0.095] },
  ] + [
    h.turned('end-%d' % i, 'rail', 'z', [[0, 0], [0, 0.014], [0.19, 0.014], [0.19, 0]], [x, 0.12, -0.095])
    for i in [0, 1]
    for x in [[-0.49, 0.49][i]]
  ] + [
    h.turned('leg-%d' % i, 'leg', 'z', [[0, 0], [0, 0.012], [0.21, 0.012], [0.21, 0]], [x, 0.016, -0.105])
    for i in std.range(0, 2)
    for x in [[-0.4, 0, 0.4][i]]
  ] + std.flattenArrays([
    [
      box('strap-%d-top' % i, 'strap', [x - 0.0125, 0.136, -0.112], [x + 0.0125, 0.14, 0.112]),
      box('strap-%d-front' % i, 'strap', [x - 0.0125, 0.03, 0.111], [x + 0.0125, 0.14, 0.115]),
      box('strap-%d-back' % i, 'strap', [x - 0.0125, 0.03, -0.115], [x + 0.0125, 0.14, -0.111]),
      box('buckle-%d' % i, 'buckle', [x - 0.016, 0.07, 0.115], [x + 0.016, 0.1, 0.12]),
    ]
    for i in [0, 1]
    for x in [[-0.25, 0.25][i]]
  ]), { canvas: 'cloth-olive-drab', rail: 'alu-bare', leg: 'alu-bare', strap: 'webbing-olive-dark', buckle: 'plastic-matte-black' }),

  // A wooden deck chair folded flat: three nested beech frames 1.2 m long and 550 mm wide, 80 mm thick, with a
  // blue and white striped canvas sling on top.
  h.compound('deck_chair', 6.1, std.flattenArrays([
    [
      box('frame-%d-l' % i, 'wood', [x0, y, -w / 2], [x1, y + 0.025, -w / 2 + 0.035]),
      box('frame-%d-r' % i, 'wood', [x0, y, w / 2 - 0.035], [x1, y + 0.025, w / 2]),
      box('frame-%d-end-a' % i, 'wood', [x0, y, -w / 2], [x0 + 0.03, y + 0.025, w / 2]),
      box('frame-%d-end-b' % i, 'wood', [x1 - 0.03, y, -w / 2], [x1, y + 0.025, w / 2]),
    ]
    for i in std.range(0, 2)
    for f in [[[-0.6, 0.6, 0.55], [-0.52, 0.48, 0.47], [-0.58, 0.2, 0.39]][i]]
    for x0 in [f[0]]
    for x1 in [f[1]]
    for w in [f[2]]
    for y in [i * 0.025]
  ]) + [
    box('rest-bar', 'wood', [0.3, 0.025, -0.24], [0.33, 0.05, 0.24]),
    rod('pivot-a', 'pin', 0.006, -0.01, 0.01, 0.04) + { axis: 'z', origin: [0.1, 0.04, -0.3], profile: [[0, 0], [0, 0.006], [0.6, 0.006], [0.6, 0]] },
    box('sling', 'canvas', [-0.5, 0.075, -0.17], [0.46, 0.079, 0.17]),
  ] + [
    box('stripe-%d' % i, 'stripe', [-0.5, 0.079, z - 0.025], [0.46, 0.081, z + 0.025])
    for i in std.range(0, 2)
    for z in [-0.11 + i * 0.11]
  ], { wood: 'wood-birch', pin: 'steel-grey', canvas: 'cloth-blue', stripe: 'cloth-cream' }),

  // A woven grass mat rolled up for carrying: 900 mm long and 100 mm across, tied with two cords.
  h.compound('fiber_mat', 0.85, roll(0.9, 0.05, [-0.6, 0.6], 'sheet', 'shadow', 'tie') + [
    h.tube('weave-%d' % i, 'weave', 0.05, 0.0515, x - 0.01, x + 0.01, 0.05)
    for i in std.range(0, 7)
    for x in [-0.42 + i * 0.12]
  ], { sheet: 'straw-pale', shadow: 'plant-dried', tie: 'jute', weave: 'straw-wicker' }) + { voxelGrain: 0.004 },

  // A big leather sheet rolled up for carrying: 700 mm long and 100 mm across, tied with two rawhide thongs.
  h.compound('leather_tarp', 3, roll(0.7, 0.05, [-0.6, 0.6], 'sheet', 'shadow', 'tie') + [
    box('edge', 'sheet', [-0.35, 0.0, 0.035], [0.35, 0.012, 0.09]),
  ], { sheet: 'leather-brown', shadow: 'leather-tan', tie: 'skin-rawhide' }) + { voxelGrain: 0.004 },

  // A floor-standing manual tyre changer: three bolted feet 1.1 m across, a 0.75 m post under a wheel table 360 mm
  // across with a spindle and clamp lugs, a bead-breaker lever 0.75 m long on a side post, a mounting bar and a
  // foot pump.
  h.compound('manual_tire_changer', 46, [
    box('foot-a', 'frame', [-0.55, 0, -0.04], [0.45, 0.06, 0.04]),
    barY('foot-b', 'frame', [0, 0], [0.22, 0.42], 0.08, 0, 0.06),
    barY('foot-c', 'frame', [0, 0], [0.22, -0.42], 0.08, 0, 0.06),
    disc('post', 'frame', 0.04, 0.06, 0.72),
    disc('table', 'table', 0.18, 0.72, 0.75),
    disc('spindle', 'steel', 0.02, 0.75, 0.97),
    h.turned('cone', 'steel', 'y', [[0, 0], [0, 0.06], [0.05, 0.022], [0.05, 0]], [0, 0.8, 0]),
  ] + [
    box('lug-%d' % i, 'steel', [0.12 * std.sin(a) - 0.02, 0.75, 0.12 * std.cos(a) - 0.02], [0.12 * std.sin(a) + 0.02, 0.79, 0.12 * std.cos(a) + 0.02])
    for i in std.range(0, 2)
    for a in [i * 2 * std.pi / 3 + std.pi / 3]
  ] + [
    box('side-post', 'frame', [-0.52, 0.06, -0.03], [-0.46, 0.5, 0.03]),
    barZ('breaker', 'frame', [-0.49, 0.48], [-0.12, 1.08], 0.04, 0.03, 0.06),
    h.turned('breaker-grip', 'grip', 'z', [[0, 0], [0, 0.02], [0.12, 0.02], [0.12, 0]], [-0.12, 1.08, -0.03]),
    barZ('breaker-link', 'steel', [-0.38, 0.66], [-0.3, 0.3], 0.02, 0.035, 0.055),
    box('bead-shoe', 'steel', [-0.34, 0.26, 0.02], [-0.26, 0.31, 0.07]),
    rod('mount-bar', 'steel', 0.012, -0.05, 0.75, 0.98),
    box('mount-head', 'steel', [0.72, 0.95, -0.025], [0.8, 0.99, 0.025]),
    box('pump', 'pump', [0.15, 0.06, 0.18], [0.27, 0.2, 0.28]),
    barZ('pump-pedal', 'grip', [0.15, 0.2], [0.33, 0.24], 0.02, 0.19, 0.27),
    h.turned('hose', 'grip', 'z', [[0, 0], [0, 0.008], [0.3, 0.008], [0.3, 0]], [0.12, 0.008, -0.12]),
  ], { frame: 'paint-red', table: 'steel-grey', steel: 'steel-bright', grip: 'rubber-black', pump: 'paint-charcoal' }),

  // A steel butchering rack folded for carrying: three 600 mm legs and a crossbar strapped together, with three
  // open S-hooks hung over the bar and a short chain coiled on the ground in front.
  h.compound('metal_butcher_rack', 2.8, [
    h.tube('leg-%d' % i, 'tube', 0.0, 0.011, -0.3, 0.3, p.y, p.z)
    for i in std.range(0, 2)
    for p in [h.hexPack(0.0125, [2, 1])[i]]
  ] + [
    rod('crossbar', 'tube', 0.011, -0.28, 0.28, 0.06) + { origin: [-0.28, 0.062, -0.004] },
    box('bracket-a', 'steel', [-0.3, 0.0, -0.02], [-0.27, 0.075, 0.02]),
    box('bracket-b', 'steel', [0.27, 0.0, -0.02], [0.3, 0.075, 0.02]),
  ] + [
    h.tube('strap-%d' % i, 'strap', 0.034, 0.038, x - 0.0125, x + 0.0125, 0.034)
    for i in [0, 1]
    for x in [[-0.16, 0.16][i]]
  ] + hangHook('hook-a', -0.07, 0.062, -0.004, 0.011, 0.0) + hangHook('hook-b', 0.0, 0.062, -0.004, 0.011, 0.0)
  + hangHook('hook-c', 0.07, 0.062, -0.004, 0.011, 0.0) + [
    local a = 2 * std.pi * i / 9;
    local x = -0.2 + 0.028 * std.cos(a);
    local z = 0.075 + 0.028 * std.sin(a);
    if i % 2 == 0 then
      h.turned('chain-%d' % i, 'chain', 'y', [[0, 0.006], [0, 0.0095], [0.004, 0.0095], [0.004, 0.006], [0, 0.006]], [x, 0, z])
    else
      h.turned('chain-%d' % i, 'chain', 'x', [[0, 0.006], [0, 0.0095], [0.004, 0.0095], [0.004, 0.006], [0, 0.006]], [x - 0.002, 0.0095, z])
    for i in std.range(0, 8)
  ] + [
    h.turned('cap-%d' % i, 'cap', 'x', [[0, 0], [0, 0.012], [0.006, 0.012], [0.006, 0]], [x, p.y, p.z])
    for i in std.range(0, 5)
    for p in [h.hexPack(0.0125, [2, 1])[i % 3]]
    for x in [if i < 3 then -0.306 else 0.3]
  ], { tube: 'steel-galvanised', steel: 'steel-grey', strap: 'webbing-black', hook: 'steel-bright', chain: 'steel-grey', cap: 'rubber-black' }) + { voxelGrain: 0.002 },

  // A steel smoking rack folded flat: three wire shelves 900 by 400 mm stacked 70 mm deep, its four legs and top
  // hook laid on top.
  h.compound('metal_smoking_rack', 5.8,
    grate('shelf-a', 0.9, 0.4, 0, 0.04) + grate('shelf-b', 0.9, 0.4, 0.016, 0.04) + grate('shelf-c', 0.9, 0.4, 0.032, 0.04)
    + [
      box('spacer-%d' % i, 'frame', [x - 0.006, 0.008, z - 0.006], [x + 0.006, 0.04, z + 0.006])
      for i in std.range(0, 3)
      for x in [[-0.44, 0.44][i % 2]]
      for z in [[-0.19, 0.19][std.floor(i / 2)]]
    ] + [
      rod('leg-%d' % i, 'leg', 0.008, -0.42, 0.42, 0.05) + { origin: [-0.42, 0.05, z] }
      for i in std.range(0, 3)
      for z in [-0.12 + i * 0.08]
    ] + [
      box('band-%d' % i, 'strap', [x - 0.0125, -0.003, -0.203], [x + 0.0125, 0.062, 0.203])
      for i in [0, 1]
      for x in [[-0.3, 0.3][i]]
    ] + [
      box('hanger', 'hook', [-0.06, 0.058, 0.15], [0.06, 0.064, 0.16]),
      box('hanger-hook', 'hook', [0.054, 0.058, 0.12], [0.06, 0.064, 0.16]),
    ], { frame: 'steel-grey', wire: 'steel-bright', leg: 'steel-grey', strap: 'webbing-black', hook: 'steel-grey' }),

  // A folding camp stove folded into a flat steel case 320 by 210 mm and 45 mm thick: hinged side panels, a slotted
  // fire grate on top, a carry handle and a short chimney pipe clipped along one side.
  h.compound('portable_stove', 3.5, [
    box('case', 'steel', [-0.16, 0, -0.105], [0.16, 0.04, 0.105]),
    box('lid-edge', 'seam', [-0.16, 0.02, -0.106], [0.16, 0.022, 0.106]),
  ] + [
    box('slot-%d' % i, 'slot', [x - 0.004, 0.04, -0.06], [x + 0.004, 0.041, 0.06])
    for i in std.range(0, 9)
    for x in [-0.11 + i * 0.022]
  ] + [
    h.turned('knuckle-%d' % i, 'seam', 'x', [[0, 0], [0, 0.004], [0.06, 0.004], [0.06, 0]], [x, 0.02, 0.108])
    for i in [0, 1]
    for x in [[-0.12, 0.06][i]]
  ] + [
    box('handle-a', 'handle', [-0.05, 0.016, -0.125], [-0.04, 0.026, -0.105]),
    box('handle-b', 'handle', [0.04, 0.016, -0.125], [0.05, 0.026, -0.105]),
    box('handle-grip', 'handle', [-0.05, 0.016, -0.135], [0.05, 0.026, -0.125]),
    box('latch', 'handle', [0.155, 0.012, -0.015], [0.165, 0.03, 0.015]),
    rod('chimney', 'pipe', 0.016, -0.15, 0.15, 0.056) + { origin: [-0.15, 0.056, 0.08] },
    h.tube('chimney-clip-a', 'handle', 0.016, 0.018, -0.1, -0.09, 0.056, 0.08),
    h.tube('chimney-clip-b', 'handle', 0.016, 0.018, 0.09, 0.1, 0.056, 0.08),
  ], { steel: 'steel-stainless', seam: 'steel-grey', slot: 'coal-black', handle: 'steel-parkerized', pipe: 'steel-galvanised' }) + { voxelGrain: 0.004 },

  // A wooden oil press 1.8 m tall: two oak posts on a bed 1.2 m long, a heavy head beam carrying a 120 mm wooden
  // screw, a follower block over a slatted press basket in a drip tray, and a 1.6 m capstan bar through the screw head.
  h.compound('screw_press_tool', 200, [
    box('sill-a', 'oak', [-0.6, 0, -0.32], [-0.48, 0.1, 0.32]),
    box('sill-b', 'oak', [0.48, 0, -0.32], [0.6, 0.1, 0.32]),
    box('bed', 'oak', [-0.6, 0.1, -0.25], [0.6, 0.28, 0.25]),
    box('post-a', 'oak', [-0.5, 0.28, -0.07], [-0.36, 1.45, 0.07]),
    box('post-b', 'oak', [0.36, 0.28, -0.07], [0.5, 1.45, 0.07]),
    box('head', 'oak', [-0.58, 1.25, -0.1], [0.58, 1.5, 0.1]),
    box('wedge-a', 'pine', [-0.6, 1.3, -0.03], [-0.52, 1.44, 0.03]),
    box('wedge-b', 'pine', [0.52, 1.3, -0.03], [0.6, 1.44, 0.03]),
    box('tray', 'pine', [-0.3, 0.28, -0.22], [0.3, 0.32, 0.22]),
    box('spout', 'pine', [-0.04, 0.29, 0.22], [0.04, 0.31, 0.3]),
  ] + [
    box('slat-%d' % i, 'slat', [0.2 * std.sin(a) - 0.018, 0.32, 0.2 * std.cos(a) - 0.018], [0.2 * std.sin(a) + 0.018, 0.62, 0.2 * std.cos(a) + 0.018])
    for i in std.range(0, 11)
    for a in [i * std.pi / 6]
  ] + [
    h.turned('basket-hoop-%d' % i, 'iron', 'y', [[0, 0.2], [0, 0.222], [0.025, 0.222], [0.025, 0.2], [0, 0.2]], [0, y, 0])
    for i in [0, 1]
    for y in [[0.36, 0.56][i]]
  ] + [
    disc('follower', 'oak', 0.19, 0.62, 0.72),
    disc('screw', 'screw', 0.06, 0.72, 1.72),
  ] + [
    disc('thread-%d' % i, 'screw', 0.072, y, y + 0.02)
    for i in std.range(0, 13)
    for y in [0.76 + i * 0.045]
  ] + [
    disc('screw-head', 'oak', 0.1, 1.6, 1.74),
    h.turned('capstan', 'pine', 'z', [[0, 0], [0, 0.025], [1.6, 0.025], [1.6, 0]], [0, 1.67, -0.8]),
  ], { oak: 'wood-oak', pine: 'wood-pine', slat: 'wood-pine', iron: 'iron-dull', screw: 'wood-walnut' }),

  // A steel camp table folded into a flat slab 900 by 500 mm and 35 mm thick: a slatted top, the folded leg frames
  // showing along the sides, two latches and a carry handle at the front.
  h.compound('tourist_table', 9, [
    box('top', 'top', [-0.45, 0.012, -0.25], [0.45, 0.035, 0.25]),
  ] + [
    box('groove-%d' % i, 'groove', [-0.44, 0.035, z - 0.002], [0.44, 0.0355, z + 0.002])
    for i in std.range(0, 6)
    for z in [-0.18 + i * 0.06]
  ] + [
    box('fold-seam', 'groove', [-0.002, 0.012, -0.25], [0.002, 0.036, 0.25]),
    box('skirt', 'top', [-0.45, 0, -0.25], [0.45, 0.012, -0.23]),
    box('skirt-front', 'top', [-0.45, 0, 0.23], [0.45, 0.012, 0.25]),
  ] + [
    rod('leg-%d' % i, 'leg', 0.0095, -0.4, 0.4, 0.0095) + { origin: [-0.4, 0.0095, z] }
    for i in std.range(0, 3)
    for z in [[-0.2, -0.17, 0.17, 0.2][i]]
  ] + [
    box('latch-%d' % i, 'latch', [x - 0.02, 0.008, 0.25], [x + 0.02, 0.03, 0.257])
    for i in [0, 1]
    for x in [[-0.3, 0.3][i]]
  ] + [
    box('handle-a', 'latch', [-0.07, 0.014, 0.25], [-0.06, 0.024, 0.28]),
    box('handle-b', 'latch', [0.06, 0.014, 0.25], [0.07, 0.024, 0.28]),
    box('handle-grip', 'handle', [-0.07, 0.012, 0.28], [0.07, 0.026, 0.295]),
  ], { top: 'steel-galvanised', groove: 'plastic-charcoal', leg: 'steel-grey', latch: 'steel-parkerized', handle: 'plastic-matte-black' }),

  // A small water mill: a paddle wheel 1.24 m across and 260 mm wide on an oak axle, turning a pair of 500 mm millstones
  // in a plank housing behind it with a grain hopper on top.
  local wy = 0.64, wr = 0.6;
  h.compound('water_mill', 140, [
    hoop('rim-a', 'rim', wr - 0.05, wr, 0.1, 0.13, 0, wy),
    hoop('rim-b', 'rim', wr - 0.05, wr, -0.13, -0.1, 0, wy),
    h.turned('hub', 'axle', 'z', [[0, 0], [0, 0.09], [0.26, 0.09], [0.26, 0]], [0, wy, -0.13]),
    h.turned('axle', 'axle', 'z', [[0, 0], [0, 0.045], [0.82, 0.045], [0.82, 0]], [0, wy, -0.7]),
  ] + std.flattenArrays([
    [
      radial('spoke-%d-a' % i, 'rim', 0.08, wr - 0.04, 0.04, i * 45, 0.1, 0.13, 0, wy),
      radial('spoke-%d-b' % i, 'rim', 0.08, wr - 0.04, 0.04, i * 45, -0.13, -0.1, 0, wy),
    ]
    for i in std.range(0, 7)
  ]) + [
    radial('paddle-%d' % i, 'paddle', wr - 0.16, wr + 0.02, 0.025, i * 22.5 + 11.25, -0.12, 0.12, 0, wy)
    for i in std.range(0, 15)
  ] + [
    box('post-front', 'frame', [-0.05, 0, 0.14], [0.05, wy - 0.05, 0.2]),
    box('bearing-front', 'frame', [-0.07, wy - 0.07, 0.13], [0.07, wy - 0.04, 0.2]),
    box('sill', 'frame', [-0.65, 0, 0.14], [0.65, 0.06, 0.2]),
    box('housing', 'plank', [-0.32, 0, -0.85], [0.32, 0.72, -0.22]),
  ] + [
    box('board-%d' % i, 'frame', [-0.322, y, -0.852], [0.322, y + 0.012, -0.218])
    for i in std.range(0, 3)
    for y in [0.12 + i * 0.16]
  ] + [
    disc('stone-bed', 'stone', 0.25, 0.72, 0.8, 0, -0.535),
    disc('stone-runner', 'stone', 0.24, 0.8, 0.88, 0, -0.535),
    h.turned('hopper', 'plank', 'y', [[0, 0.04], [0.22, 0.2], [0.22, 0], [0, 0]], [0, 0.9, -0.535]),
    disc('hopper-leg', 'frame', 0.03, 0.88, 0.9, 0, -0.535),
    box('chute', 'plank', [0.24, 0.66, -0.58], [0.4, 0.7, -0.49]),
  ], { rim: 'wood-oak', paddle: 'wood-pine', axle: 'wood-walnut', frame: 'wood-oak', plank: 'wood-pine', stone: 'stone-grey' }),
]
