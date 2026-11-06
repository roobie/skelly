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
// A straight strand `w` wide from [x, y] point `a` to `b`, standing from z0 to z1.
local strand(id, slot, a, b, w, z0, z1) =
  local dx = b[0] - a[0], dy = b[1] - a[1], len = std.sqrt(dx * dx + dy * dy);
  local nx = -dy / len * w / 2, ny = dx / len * w / 2;
  h.prism(id, slot, 'z', [[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]], z0, z1);
// The same strand slanting across the zy plane, standing from x0 to x1.
local strandZ(id, slot, a, b, w, x0, x1) =
  local dz = b[0] - a[0], dy = b[1] - a[1], len = std.sqrt(dz * dz + dy * dy);
  local nz = -dy / len * w / 2, ny = dz / len * w / 2;
  h.prism(id, slot, 'x', [[a[1] + ny, a[0] + nz], [a[1] - ny, a[0] - nz], [b[1] - ny, b[0] - nz], [b[1] + ny, b[0] + nz]], x0, x1);
// A carved wooden torch standing on y from y0, `len` long, with a bound head and a flame on top. Slots: wood, band,
// head, flame.
local torch(prefix, x, y0, z, len, r=0.016) = [
  h.turned(prefix + '-shaft', 'wood', 'y', [[0, 0], [0, r * 0.75], [len * 0.6, r * 0.9], [len, r]], [x, y0, z]),
  h.turned(prefix + '-ring-a', 'band', 'y', [[0, 0], [0, r * 0.95], [0.006, r * 0.95], [0.006, 0]], [x, y0 + len * 0.3, z]),
  h.turned(prefix + '-ring-b', 'band', 'y', [[0, 0], [0, r * 1.0], [0.006, r * 1.0], [0.006, 0]], [x, y0 + len * 0.55, z]),
  h.turned(prefix + '-head', 'head', 'y', [[0, 0], [0, r * 1.3], [r * 3, r * 1.45], [r * 3.2, r * 1.2], [r * 3.2, 0]], [x, y0 + len, z]),
  h.turned(prefix + '-flame', 'flame', 'y', [[0, 0], [0, r * 1.15], [r * 1.5, r * 1.3], [r * 3.5, r * 0.8], [r * 5, r * 0.3], [r * 5.6, 0]], [x, y0 + len + r * 3.2, z]),
];
// A flat bar `w` wide and `t` deep lying at height y, from the column at [0, 0] out to radius `len` at angle `a`
// (radians from +x towards +z); a y prism's outline lists [z, x].
local spoke(id, slot, len, a, w, y, t) =
  local c = std.cos(a), s = std.sin(a), nx = -s * w / 2, nz = c * w / 2;
  h.prism(id, slot, 'y', [[nz, nx], [-nz, -nx], [len * s - nz, len * c - nx], [len * s + nz, len * c + nx]], y, y + t);
// One planet on its arm: a bar out from a collar on the column at height y, a short upright pin at its end and a ball
// of radius r on the pin.
local planet(prefix, slot, len, a, y, r) =
  local px = len * std.cos(a), pz = len * std.sin(a);
  [
    h.disc(prefix + '-collar', 'steel', 0.018, y - 0.004, y + 0.01),
    spoke(prefix + '-arm', 'steel', len, a, 0.008, y, 0.006),
    h.disc(prefix + '-pin', 'steel', 0.003, y + 0.006, y + 0.03, px, pz),
    ball(prefix, slot, r, px, y + 0.03 + r, pz),
  ];
[
  // A slender carved wooden wand 380 mm long, 16 mm across at its butt, tapering to a 6 mm tip, with a pale crystal
  // set into a brass collar at its butt end.
  h.compound('crystal_butt_wand', 0.09, [
    h.turned('shaft', 'wood', 'x', [[0, 0], [0, 0.008], [0.12, 0.0075], [0.34, 0.003], [0.35, 0]], [-0.16, 0.012, 0]),
    h.turned('grip', 'grip', 'x', [[0, 0], [0, 0.0088], [0.09, 0.0084], [0.09, 0]], [-0.15, 0.012, 0]),
    h.turned('collar', 'brass', 'x', [[0, 0], [0, 0.0095], [0.014, 0.0095], [0.014, 0]], [-0.17, 0.012, 0]),
    h.turned('crystal', 'crystal', 'x', [[0, 0], [0.006, 0.008], [0.02, 0.008], [0.02, 0]], [-0.19, 0.012, 0]),
    h.turned('band-a', 'brass', 'x', [[0, 0], [0, 0.0072], [0.004, 0.0072], [0.004, 0]], [-0.05, 0.012, 0]),
    h.turned('band-b', 'brass', 'x', [[0, 0], [0, 0.0058], [0.004, 0.0058], [0.004, 0]], [0.04, 0.012, 0]),
  ], { wood: 'wood-walnut', grip: 'leather-brown', brass: 'brass-dull', crystal: 'crystal-glow-blue' }) + { handling: h.gripOn('crystal_butt_wand', 'grip') } + { voxelGrain: 0.002 },

  // A wall sconce: an oak back plate 120 mm wide and 300 mm tall bound with iron straps, an iron arm reaching 120 mm
  // out to a cup that holds a carved wooden torch, burning on top, 600 mm tall overall. Front on +z.
  h.compound('everburning_wall_sconce', 2.3, [
    box('plate', 'oak', [-0.06, 0.1, -0.02], [0.06, 0.4, 0.0]),
    box('strap-top', 'iron', [-0.064, 0.36, -0.022], [0.064, 0.376, 0.003]),
    box('strap-low', 'iron', [-0.064, 0.124, -0.022], [0.064, 0.14, 0.003]),
    h.disc('nail-top', 'iron', 0.006, 0.362, 0.374, 0, 0.004),
    h.disc('nail-low', 'iron', 0.006, 0.126, 0.138, 0, 0.004),
    box('arm', 'iron', [-0.008, 0.16, 0.0], [0.008, 0.176, 0.13]),
    strandZ('brace', 'iron', [0.0, 0.26], [0.1, 0.17], 0.012, -0.006, 0.006),
    h.turned('cup', 'iron', 'y', [[0, 0.0], [0, 0.016], [0.06, 0.026], [0.06, 0.02], [0.004, 0.0]], [0, 0.14, 0.12]),
  ] + torch('torch', 0, 0.12, 0.12, 0.4, 0.018), {
    oak: 'wood-oak',
    iron: 'iron-dull',
    wood: 'wood-walnut',
    band: 'brass-dull',
    head: 'cloth-charred',
    flame: 'glow-flame',
  }) + { handling: h.gripOn('everburning_wall_sconce', 'plate') } + { voxelGrain: 0.004 },

  // A parabolan felt patch: a small square of iridescent felt 50 by 40 mm and 3 mm thick, with a frayed corner.
  h.compound('iridescent_felt_patch', 0.003, [
    box('felt', 'felt', [-0.025, 0.0, -0.02], [0.025, 0.003, 0.02]),
    box('fray-a', 'felt', [0.025, 0.0, 0.006], [0.029, 0.002, 0.012]),
    box('fray-b', 'felt', [-0.012, 0.0, 0.02], [-0.004, 0.002, 0.024]),
    box('stitch', 'stitch', [-0.022, 0.003, -0.017], [0.022, 0.0035, -0.015]),
  ] + [
    // Diagonal bands where the sheen shifts hue, teal and violet in turn, clipped to the patch.
    local x0 = -0.03 + 0.014 * i;
    h.prism('sheen-%d' % i, if i % 2 == 0 then 'sheen-a' else 'sheen-b', 'y', [[-0.0135, std.max(-0.025, x0)], [-0.0135, std.min(0.025, x0 + 0.008)], [0.0135, std.min(0.025, x0 + 0.02)], [0.0135, std.max(-0.025, x0 + 0.012)]], 0.003, 0.0034)
    for i in std.range(0, 3)
  ], { felt: 'iridescent', stitch: 'cord-cotton', 'sheen-a': 'jelly-teal', 'sheen-b': 'cloth-purple' }) + h.inHand('iridescent_felt_patch', 'felt') + { voxelGrain: 0.002 },

  // A handful of glowing mushroom strips: six slim strips cut from a bioluminescent cap, each about 90 mm long, 14 mm
  // wide and 6 mm thick, with the cap's skin along one edge, heaped loosely about 100 by 70 mm and 20 mm tall.
  h.compound('glowing_mushroom_strips', 0.055, std.flattenArrays([
    local s = [[-0.03, 0.0, 0.0], [-0.012, 0.0, 0.002], [0.006, 0.0, -0.002], [0.024, 0.0, 0.0], [-0.02, 0.007, 0.004], [0.014, 0.007, -0.004]][i];
    local z0 = s[0], y = s[1], tilt = s[2];
    [
      strand('strip-%d' % i, 'flesh', [-0.045, y + 0.003 - tilt], [0.045, y + 0.003 + tilt], 0.006, z0, z0 + 0.011),
      strand('skin-%d' % i, 'skin', [-0.045, y + 0.003 - tilt], [0.045, y + 0.003 + tilt], 0.006, z0 + 0.011, z0 + 0.014),
      strand('glow-%d' % i, 'glow', [-0.04, y + 0.0065 - tilt * 0.9], [0.04, y + 0.0065 + tilt * 0.9], 0.002, z0 + 0.004, z0 + 0.008),
    ]
    for i in std.range(0, 5)
  ]), { flesh: 'jelly-pale', skin: 'jelly-teal', glow: 'crystal-glow-blue' }) + h.inHand('glowing_mushroom_strips', 'strip-1') + { voxelGrain: 0.002 },

  // Three pure white moss capsules, each a round horn tube 60 mm long and 16 mm across with a blunt closed tip and a
  // plug of green moss in its open end, tied together in a bundle with a twine band.
  h.compound('horn_moss_capsules', 0.03, std.flattenArrays([
    local c = h.hexPack(0.008, [2, 1])[i];
    [
      h.turned('horn-%d' % i, 'capsule', 'x', [[0, 0], [0, 0.008], [0.044, 0.008], [0.054, 0.0055], [0.058, 0.002], [0.058, 0]], [-0.028, c.y, c.z]),
      h.turned('moss-%d' % i, 'moss', 'x', [[0, 0], [0, 0.0062], [0.005, 0.0068], [0.005, 0]], [-0.031, c.y, c.z]),
    ]
    for i in [0, 1, 2]
  ]) + [
    h.tube('tie', 'tie', 0.017, 0.0185, -0.008, -0.002, 0.008 + 0.016 * 0.866 / 3, 0),
  ], { capsule: 'enamel-white', moss: 'leaf-green', tie: 'jute' }) + h.inHand('horn_moss_capsules', 'horn-0') + { voxelGrain: 0.002 },
  // A chair grown from one gnarled piece of wood, 500 mm wide, 520 mm deep and 950 mm tall, its seat 450 mm up. Its
  // legs lean and kink, flaring into roots at the floor, and twisting branches knot together between the back posts.
  // Front on +z.
  h.compound('gnarled_grown_chair', 14, [
    // Front legs kink outwards, then lean back in.
    strand('leg-fl-low', 'wood', [-0.22, 0.0], [-0.19, 0.22], 0.05, 0.15, 0.2),
    strand('leg-fl-high', 'wood', [-0.19, 0.22], [-0.2, 0.43], 0.045, 0.16, 0.2),
    strand('leg-fr-low', 'wood', [0.22, 0.0], [0.18, 0.2], 0.05, 0.16, 0.21),
    strand('leg-fr-high', 'wood', [0.18, 0.2], [0.2, 0.43], 0.045, 0.165, 0.205),
    // Back legs run on up as the back posts, bowing backwards.
    strandZ('post-l-low', 'wood', [-0.23, 0.0], [-0.19, 0.44], 0.05, -0.235, -0.185),
    strandZ('post-l-high', 'wood', [-0.19, 0.44], [-0.23, 0.92], 0.045, -0.225, -0.18),
    strandZ('post-r-low', 'wood', [-0.22, 0.0], [-0.19, 0.44], 0.05, 0.185, 0.235),
    strandZ('post-r-high', 'wood', [-0.19, 0.44], [-0.24, 0.9], 0.045, 0.18, 0.225),
    // Root flares at each foot.
    box('root-fl', 'bark', [-0.26, 0.0, 0.14], [-0.18, 0.025, 0.23]),
    box('root-fr', 'bark', [0.18, 0.0, 0.14], [0.27, 0.025, 0.22]),
    box('root-bl', 'bark', [-0.25, 0.0, -0.26], [-0.17, 0.025, -0.19]),
    box('root-br', 'bark', [0.17, 0.0, -0.25], [0.25, 0.025, -0.18]),
    // The seat, thick and slightly dished, with a knotted rim.
    box('seat', 'wood', [-0.23, 0.42, -0.22], [0.23, 0.46, 0.22]),
    box('seat-lip', 'wood', [-0.24, 0.43, 0.2], [0.24, 0.47, 0.24]),
    box('knot-seat', 'bark', [0.1, 0.46, 0.05], [0.14, 0.468, 0.09]),
    // Twisted stretchers between the legs.
    strand('stretch-front', 'wood', [-0.2, 0.14], [0.2, 0.17], 0.028, 0.17, 0.195),
    strandZ('stretch-left', 'wood', [-0.2, 0.18], [0.18, 0.12], 0.026, -0.22, -0.195),
    strandZ('stretch-right', 'wood', [-0.2, 0.12], [0.18, 0.18], 0.026, 0.195, 0.22),
    // Crest: a gnarled bough bridging the post tops.
    strand('crest-l', 'wood', [-0.23, 0.9], [0.0, 0.95], 0.05, -0.25, -0.2),
    strand('crest-r', 'wood', [0.0, 0.95], [0.23, 0.89], 0.05, -0.25, -0.2),
    // Branches twisting between the posts, crossing in a knot.
    strand('branch-a', 'wood', [-0.19, 0.5], [0.18, 0.86], 0.03, -0.225, -0.2),
    strand('branch-b', 'wood', [0.19, 0.52], [-0.19, 0.84], 0.03, -0.22, -0.195),
    strand('branch-c', 'wood', [-0.19, 0.6], [0.0, 0.48], 0.024, -0.215, -0.195),
    strand('branch-d', 'wood', [0.0, 0.48], [0.19, 0.62], 0.024, -0.215, -0.195),
    box('knot-back', 'bark', [-0.035, 0.65, -0.235], [0.035, 0.72, -0.19]),
    box('knot-post', 'bark', [-0.235, 0.7, -0.24], [-0.19, 0.75, -0.2]),
  ], { wood: 'wood-oak', bark: 'bark' }) + { handling: h.gripOn('gnarled_grown_chair', 'crest-l') } + { voxelGrain: 0.01 },

  // A homemade standing candelabra 1.5 m tall: a heavy oak post on a crossed foot, with two crossed arms near the top
  // holding four carved wooden torches round a fifth in the middle, each burning. The arms span 800 mm.
  h.compound('everburning_torch_candelabra', 49, [
    box('foot-x', 'oak', [-0.35, 0.0, -0.06], [0.35, 0.1, 0.06]),
    box('foot-z', 'oak', [-0.06, 0.0, -0.35], [0.06, 0.1, 0.35]),
    box('post', 'oak', [-0.06, 0.1, -0.06], [0.06, 0.94, 0.06]),
    box('collar-low', 'iron', [-0.068, 0.1, -0.068], [0.068, 0.14, 0.068]),
    box('collar-high', 'iron', [-0.068, 0.86, -0.068], [0.068, 0.9, 0.068]),
    strand('brace-xl', 'oak', [-0.06, 0.1], [-0.25, 0.0], 0.05, -0.025, 0.025),
    strand('brace-xr', 'oak', [0.06, 0.1], [0.25, 0.0], 0.05, -0.025, 0.025),
    box('arm-x', 'oak', [-0.4, 0.9, -0.035], [0.4, 0.96, 0.035]),
    box('arm-z', 'oak', [-0.035, 0.9, -0.4], [0.035, 0.96, 0.4]),
    strand('strut-xl', 'iron', [-0.06, 0.74], [-0.3, 0.9], 0.02, -0.012, 0.012),
    strand('strut-xr', 'iron', [0.06, 0.74], [0.3, 0.9], 0.02, -0.012, 0.012),
    strandZ('strut-zb', 'iron', [-0.06, 0.74], [-0.3, 0.9], 0.02, -0.012, 0.012),
    strandZ('strut-zf', 'iron', [0.06, 0.74], [0.3, 0.9], 0.02, -0.012, 0.012),
  ] + std.flattenArrays([
    local p = [[0, 0], [-0.36, 0], [0.36, 0], [0, -0.36], [0, 0.36]][i];
    [h.turned('cup-%d' % i, 'iron', 'y', [[0, 0], [0, 0.03], [0.05, 0.038], [0.05, 0]], [p[0], 0.96, p[1]])]
    + torch('torch-%d' % i, p[0], 0.98, p[1], 0.36, 0.018)
    for i in std.range(0, 4)
  ]), {
    oak: 'wood-oak',
    iron: 'iron-dull',
    wood: 'wood-walnut',
    band: 'brass-dull',
    head: 'cloth-charred',
    flame: 'glow-flame',
  }) + { handling: h.gripOn('everburning_torch_candelabra', 'post') } + { voxelGrain: 0.01 },

  // A tabletop orrery 800 mm across its longest arm: a turned walnut plinth 360 mm across and 80 mm tall with a brass
  // gear plate and a side crank, a steel column 450 mm tall carrying a brass sun on top, and six planets on arms of
  // different reach and height round it, one with a ring.
  h.compound('orrery', 14, [
    h.turned('plinth', 'wood', 'y', [[0, 0], [0, 0.18], [0.015, 0.18], [0.02, 0.165], [0.07, 0.16], [0.08, 0.15], [0.08, 0]], [0, 0, 0]),
    h.disc('plate', 'brass', 0.13, 0.08, 0.086),
    h.disc('gear-big', 'gear', 0.06, 0.086, 0.094, 0.04, 0.03),
    h.disc('gear-small', 'gear', 0.035, 0.086, 0.096, -0.06, -0.04),
    h.disc('gear-hub-a', 'steel', 0.012, 0.094, 0.1, 0.04, 0.03),
    h.disc('gear-hub-b', 'steel', 0.008, 0.096, 0.102, -0.06, -0.04),
    h.rod('crank-shaft', 'steel', 0.006, 0.16, 0.22, 0.045),
    box('crank-arm', 'steel', [0.214, 0.03, -0.006], [0.226, 0.1, 0.006]),
    h.rod('crank-knob', 'wood', 0.01, 0.226, 0.26, 0.094),
    h.disc('column', 'steel', 0.012, 0.086, 0.45),
    ball('sun', 'sun', 0.05, 0, 0.5, 0),
  ]
  + planet('mercury', 'steel', 0.09, 0.4, 0.17, 0.012)
  + planet('venus', 'brass', 0.14, 2.1, 0.21, 0.018)
  + planet('earth', 'blue', 0.2, 3.6, 0.25, 0.02)
  + planet('mars', 'red', 0.26, 5.0, 0.29, 0.016)
  + planet('jupiter', 'copper', 0.32, 1.1, 0.33, 0.036)
  + planet('saturn', 'gold', 0.4, 2.9, 0.37, 0.028) + [
    h.turned('saturn-ring', 'brass', 'y', [[0, 0.034], [0, 0.05], [0.004, 0.05], [0.004, 0.034], [0, 0.034]], [0.4 * std.cos(2.9), 0.37 + 0.03 + 0.028 - 0.002, 0.4 * std.sin(2.9)]),
  ], {
    wood: 'wood-walnut',
    brass: 'brass-polished',
    gear: 'brass-dull',
    steel: 'steel-blued',
    sun: 'metal-gold',
    blue: 'paint-police-blue',
    red: 'paint-terracotta',
    copper: 'copper',
    gold: 'bronze-polished',
  }) + { handling: h.gripOn('orrery', 'plinth') } + { voxelGrain: 0.004 },
]
