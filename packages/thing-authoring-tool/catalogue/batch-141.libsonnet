local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
local deg = std.pi / 180;
// A flat ring standing on y, `t` thick, from radius `r0` to `r1`, its centre at (x, y0, z).
local washer(id, slot, r0, r1, t, x, y0, z) = turned(id, slot, 'y', [[0, r0], [0, r1], [t, r1], [t, r0], [0, r0]], [x, y0, z]);
// A cut stone of radius `r` and height `ht` sitting table up on y0 at (x, z).
local stone(id, slot, r, ht, x, y0, z) = turned(id, slot, 'y', [[0, 0], [0, r], [ht * 0.45, r], [ht, r * 0.55], [ht, 0]], [x, y0, z]);
// An [x, z] outline as the [z, x] points a prism on y takes.
local onY(points) = [[p[1], p[0]] for p in points];
// One radial slice of an upright ring of radius r0 to r1 round (cx, cz), between angles a0 and a1 from +z, standing
// from y0 to y1.
local arcPanel(id, slot, r0, r1, a0, a1, y0, y1, cx=0, cz=0) = h.prism(id, slot, 'y', onY([
  [cx + r0 * std.sin(a0), cz + r0 * std.cos(a0)],
  [cx + r1 * std.sin(a0), cz + r1 * std.cos(a0)],
  [cx + r1 * std.sin(a1), cz + r1 * std.cos(a1)],
  [cx + r0 * std.sin(a1), cz + r0 * std.cos(a1)],
]), y0, y1);
// A star-shaped [x, z] outline lying on y from y0 to y1, as a fan of triangles from `c`, since prisms must be convex.
local fan(id, slot, points, y0, y1, c=null) =
  local n = std.length(points);
  local mid = if c == null then [std.sum([p[0] for p in points]) / n, std.sum([p[1] for p in points]) / n] else c;
  [h.prism('%s-%d' % [id, i], slot, 'y', onY([mid, points[i], points[(i + 1) % n]]), y0, y1) for i in std.range(0, n - 1)];
// A star of `n` points from radius `ro` to `ri`, lying on y from y0 to y1, one point toward -z.
local star(id, slot, n, ro, ri, y0, y1) = fan(id, slot, [
  local r = if k % 2 == 0 then ro else ri, a = std.pi + k * std.pi / n;
  [r * std.sin(a), r * std.cos(a)]
  for k in std.range(0, 2 * n - 1)
], y0, y1, [0, 0]);
// The tips of that star, for balls on the points.
local starTips(n, ro) = [[ro * std.sin(std.pi + 2 * k * std.pi / n), ro * std.cos(std.pi + 2 * k * std.pi / n)] for k in std.range(0, n - 1)];
// A police shield lying face up, its crown toward -z, `s` its scale on a 60 mm by 70 mm outline.
local shield(s) = [[p[0] * s, p[1] * s] for p in [
  [0, -0.035], [0.008, -0.031], [0.016, -0.034], [0.024, -0.031], [0.030, -0.024], [0.028, -0.010], [0.030, 0.004],
  [0.026, 0.018], [0.016, 0.028], [0, 0.035], [-0.016, 0.028], [-0.026, 0.018], [-0.030, 0.004], [-0.028, -0.010],
  [-0.030, -0.024], [-0.024, -0.031], [-0.016, -0.034], [-0.008, -0.031],
]];
// Lines of lettering on a face at y, `w` wide each, centred on x, at the given z.
local letters(prefix, slot, ws, zs, y, ht=0.002) = [
  box('%s-%d' % [prefix, i], slot, [-ws[i] / 2, y, zs[i] - ht / 2], [ws[i] / 2, y + 0.001, zs[i] + ht / 2])
  for i in std.range(0, std.length(zs) - 1)
];
// One wing lying flat, `s` 1 for the right and -1 for the left, its root at the middle and its shoulder toward -z.
local wing(s) =
  local m(points) = onY([[s * p[0], p[1]] for p in points]);
  local p = if s > 0 then 'r-' else 'l-';
  local edge = [[0.06, -0.15], [0.14, -0.21], [0.22, -0.24], [0.30, -0.24], [0.35, -0.20]];
  local tips = [[0.07, 0.10], [0.12, 0.18], [0.18, 0.22], [0.24, 0.22], [0.30, 0.16], [0.35, 0.06], [0.38, -0.06]];
  fan(p + 'down', 'down', [[s * q[0], q[1]] for q in [
      [0.02, -0.10], [0.06, -0.15], [0.14, -0.21], [0.22, -0.24], [0.30, -0.24], [0.36, -0.20], [0.37, -0.12], [0.32, 0.02],
      [0.24, 0.10], [0.14, 0.12], [0.06, 0.06], [0.02, -0.02],
    ]], 0, 0.012, [s * 0.18, -0.08])
  + [
    // Long flight feathers fanning from the shoulder edge, each a broad blade with a rounded tip.
    local b = edge[std.min(4, std.floor(i * 5 / 7))], t = tips[i];
    local dx = t[0] - b[0], dz = t[1] - b[1], l = std.sqrt(dx * dx + dz * dz), nx = -dz / l * 0.028, nz = dx / l * 0.028;
    local at(f, k) = [b[0] + dx * f + nx * k, b[1] + dz * f + nz * k];
    h.prism(p + 'feather-%d' % i, 'feather', 'y', m([b, at(0.3, 0.8), at(0.75, 1), at(0.95, 0.5), t, at(0.95, -0.5), at(0.75, -1), at(0.3, -0.8)]),
            0.012, 0.018 + (i % 2) * 0.004)
    for i in std.range(0, 6)
  ] + [
    // A row of short coverts along the shoulder.
    local x = 0.08 + i * 0.05, z = -0.17 - std.min(i, 3) * 0.015;
    h.prism(p + 'covert-%d' % i, 'covert', 'y', m([
      [x - 0.025, z - 0.02], [x + 0.025, z - 0.02], [x + 0.02, z + 0.04], [x, z + 0.06], [x - 0.02, z + 0.04],
    ]), 0.024, 0.030)
    for i in std.range(0, 5)
  ];
// Gem and metal of the root reference for the jewellery rows; the variants swap them through `finishes`.
local jewel = { metal: 'metal-gold', gem: 'gem-purple' };
[
  // A dental grill: caps for the six upper front teeth, 44 mm across the arch and 10 mm tall, joined in one piece of
  // gold with a small stone set in the face of each cap, standing on its biting edge with its face on +z.
  local R = 0.022, cz = -0.010, a(i) = (-50 + i * 20) * deg, da = 9 * deg;
  h.compound('dental_grill', 0.025, [
    arcPanel('cap-%d' % i, 'metal', R - 0.003, R, a(i) - da, a(i) + da, if i == 0 || i == 5 then 0.002 else 0, 0.012, 0, cz)
    for i in std.range(0, 5)
  ] + [
    arcPanel('stone-%d' % i, 'gem', R, R + 0.002, a(i) - 3.5 * deg, a(i) + 3.5 * deg, 0.004, 0.008, 0, cz)
    for i in std.range(0, 5)
  ], jewel)
  + { voxelGrain: 0.002 },

  // A rigid bangle 66 mm across and 6 mm deep lying flat, ten small stones set round its top face.
  h.compound('gem_bracelet', 0.04, [
    washer('band', 'metal', 0.029, 0.033, 0.006, 0, 0, 0),
  ] + [
    stone('stone-%d' % i, 'gem', 0.0025, 0.003, 0.031 * std.sin(i * 36 * deg), 0.006, 0.031 * std.cos(i * 36 * deg))
    for i in std.range(0, 9)
  ], jewel)
  + { voxelGrain: 0.002 },

  // A pair of small hoop earrings lying flat side by side, each a 16 mm hoop with a 7 mm stone hanging from it.
  h.compound('gem_earrings', 0.004, std.flattenArrays([
    [
      washer('hoop-%d' % i, 'metal', 0.006, 0.008, 0.002, x, 0, -0.006),
      box('bail-%d' % i, 'metal', [x - 0.001, 0, 0.002], [x + 0.001, 0.002, 0.005]),
      disc('setting-%d' % i, 'metal', 0.004, 0, 0.002, x, 0.008),
      stone('stone-%d' % i, 'gem', 0.0035, 0.003, x, 0.002, 0.008),
    ]
    for i in [0, 1]
    for x in [[-0.012, 0.012][i]]
  ]), jewel)
  + { voxelGrain: 0.002 },

  // A 450 mm chain necklace laid in a ring 140 mm across, an 18 mm stone pendant on a bail at its front.
  h.compound('gem_pendant_necklace', 0.045, [
    washer('chain', 'metal', 0.068, 0.070, 0.002, 0, 0, 0),
    box('bail', 'metal', [-0.0015, 0, 0.069], [0.0015, 0.003, 0.075]),
    disc('setting', 'metal', 0.009, 0, 0.003, 0, 0.083),
    stone('stone', 'gem', 0.007, 0.004, 0, 0.003, 0.083),
  ], jewel)
  + { voxelGrain: 0.002 },

  // A finger ring 21 mm across and 4 mm wide standing on its edge, a 7 mm stone in a cup setting on top.
  h.compound('gem_ring', 0.006, [
    turned('band', 'metal', 'z', [[0, 0.0085], [0, 0.0105], [0.004, 0.0105], [0.004, 0.0085], [0, 0.0085]], [0, 0.0105, -0.002]),
    disc('setting', 'metal', 0.004, 0.0195, 0.023),
    stone('stone', 'gem', 0.0035, 0.004, 0, 0.023, 0),
  ], jewel)
  + { voxelGrain: 0.002 },

  // A tiara standing upright with its front on +z: a band 150 mm across curved round the back of the head, rising
  // from 12 mm at the ends to a 47 mm peak at the front, set with stones across the front.
  local R = 0.075, n = 19, a(k) = (-95 + k * 190 / n) * deg, top(t) = 0.012 + 0.035 * std.pow(std.cos(t), 6);
  h.compound('gem_tiara', 0.29, [
    arcPanel('band-%d' % k, 'metal', R - 0.002, R, a(k), a(k + 1), 0, top((a(k) + a(k + 1)) / 2))
    for k in std.range(0, n - 1)
  ] + [
    arcPanel('rim-%d' % k, 'metal', R - 0.003, R + 0.001, a(k), a(k + 1), 0, 0.004)
    for k in std.range(0, n - 1)
  ] + [
    local t = [-36, -18, 0, 18, 36][i] * deg, ht = top(t);
    arcPanel('stone-%d' % i, 'gem', R, R + 0.002, t - (if i == 2 then 3 else 2) * deg, t + (if i == 2 then 3 else 2) * deg,
             ht - (if i == 2 then 0.016 else 0.010), ht - 0.004)
    for i in std.range(0, 4)
  ] + [
    local t = (-60 + i * 15) * deg;
    arcPanel('chip-%d' % i, 'gem', R, R + 0.002, t - 1.5 * deg, t + 1.5 * deg, 0.005, 0.008)
    for i in std.range(0, 8)
  ], jewel)
  + { voxelGrain: 0.002 },

  // A costume halo: a white plastic headband 150 mm across standing on its tips, two wires rising from it to a
  // shiny gold ring 150 mm across and 12 mm thick held 145 mm up.
  local n = 12, a(k) = (15 + k * 150 / n) * deg;
  h.compound('angel_halo_headband', 0.03, [
    h.prism('band-%d' % k, 'band', 'z', [
      [0.070 * std.cos(a(k)), 0.070 * std.sin(a(k))], [0.074 * std.cos(a(k)), 0.074 * std.sin(a(k))],
      [0.074 * std.cos(a(k + 1)), 0.074 * std.sin(a(k + 1))], [0.070 * std.cos(a(k + 1)), 0.070 * std.sin(a(k + 1))],
    ], -0.006, 0.006)
    for k in std.range(0, n - 1)
  ] + [
    box('wire-%d' % i, 'wire', [x - 0.001, 0.025, -0.001], [x + 0.001, 0.140, 0.001])
    for i in [0, 1]
    for x in [[-0.064, 0.064][i]]
  ] + [
    turned('halo', 'halo', 'y', [[0.006 - 0.006 * std.cos(t * 30 * deg), 0.069 + 0.006 * std.sin(t * 30 * deg)] for t in std.range(0, 12)], [0, 0.139, 0]),
  ], { band: 'plastic-white', wire: 'metal-silver', halo: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // A pair of costume wings laid flat, back up, 760 mm from tip to tip and 500 mm deep: layered white feathers on a
  // padded base, joined at the middle by a plate carrying two elastic shoulder loops.
  h.compound('angel_wings', 0.27, wing(1) + wing(-1) + [
    box('plate', 'strap', [-0.04, 0, -0.12], [0.04, 0.016, 0.02]),
    box('loop-l', 'strap', [-0.035, 0.016, -0.11], [-0.02, 0.022, 0.01]),
    box('loop-r', 'strap', [0.02, 0.016, -0.11], [0.035, 0.022, 0.01]),
  ], { down: 'fur-pale', feather: 'feather-white', covert: 'feather-white', strap: 'cloth-bright-white' })
  + { voxelGrain: 0.004 },

  // A six-pointed deputy's star 64 mm across, ball-tipped, with a raised round seal and a ring of lettering, lying
  // face up; a pin runs across the back.
  h.compound('badge_deputy', 0.032, [
    ] + star('star', 'metal', 6, 0.030, 0.015, 0.002, 0.004) + [
    disc('seal', 'metal', 0.011, 0.004, 0.006),
    washer('lettering', 'ink', 0.0115, 0.0135, 0.001, 0, 0.004, 0),
    box('pin', 'pin', [-0.012, 0, -0.001], [0.012, 0.002, 0.001]),
  ] + [
    disc('tip-%d' % k, 'metal', 0.0035, 0.002, 0.005, t[0], t[1])
    for k in std.range(0, 5)
    for t in [starTips(6, 0.031)[k]]
  ], { metal: 'steel-grey', ink: 'plastic-black', pin: 'steel-bright' })
  + { voxelGrain: 0.002 },

  // A detective's gold shield 60 mm wide and 70 mm tall lying face up, its crown toward -z, clipped in a black leather
  // holder that shows round its edge: a polished rim, a blue enamel seal, a lettered panel above and a number plate
  // below, a pin across the back.
  h.compound('badge_detective', 0.1, [
    ] + fan('holder', 'leather', shield(1.18), 0.002, 0.004, [0, 0])
    + fan('rim', 'rim', shield(1), 0.004, 0.006, [0, 0])
    + fan('shield', 'metal', shield(0.88), 0.006, 0.007, [0, 0]) + [
    disc('seal', 'rim', 0.012, 0.007, 0.009, 0, 0.002),
    disc('enamel', 'enamel', 0.009, 0.009, 0.010, 0, 0.002),
    box('panel', 'rim', [-0.018, 0.007, -0.024], [0.018, 0.008, -0.014]),
    box('plate', 'rim', [-0.012, 0.007, 0.017], [0.012, 0.009, 0.024]),
    box('pin', 'pin', [-0.012, 0, -0.001], [0.012, 0.002, 0.001]),
  ] + letters('word', 'ink', [0.030], [-0.019], 0.008) + letters('number', 'ink', [0.016], [0.0205], 0.009),
  { leather: 'leather-black', rim: 'brass-polished', metal: 'metal-gold', enamel: 'plastic-blue', ink: 'bronze', pin: 'steel-bright' })
  + { voxelGrain: 0.002 },

  // A plastic name tag 76 by 25 mm lying face up: a blue band over a white face with two lines of print, a clip
  // behind.
  h.compound('badge_doctor', 0.01, [
    box('tag', 'face', [-0.038, 0.002, -0.0125], [0.038, 0.004, 0.0125]),
    box('band', 'band', [-0.038, 0.004, -0.0125], [0.038, 0.005, -0.005]),
    box('clip', 'clip', [-0.010, 0, -0.010], [0.010, 0.002, 0.008]),
  ] + letters('name', 'ink', [0.050, 0.034], [0.0, 0.007], 0.004, 0.003),
  { face: 'plastic-white', band: 'plastic-blue', clip: 'steel-bright', ink: 'plastic-black' })
  + { voxelGrain: 0.002 },

  // A federal agent's gold shield 56 by 70 mm lying face up, an eagle with spread wings on its crown toward -z and
  // a raised seal with a standing figure in its centre, a pin across the back.
  h.compound('badge_federal', 0.07, [
    ] + fan('shield', 'metal', shield(0.92), 0.002, 0.004, [0, 0]) + [
  ] + fan('eagle', 'metal', [
      [0, -0.044], [0.005, -0.040], [0.022, -0.046], [0.018, -0.036], [0.006, -0.032], [-0.006, -0.032], [-0.018, -0.036],
      [-0.022, -0.046], [-0.005, -0.040],
    ], 0.002, 0.005, [0, -0.037]) + [
    disc('seal', 'seal', 0.013, 0.004, 0.006, 0, 0.002),
    washer('ring', 'metal', 0.010, 0.013, 0.001, 0, 0.006, 0.002),
    box('figure', 'metal', [-0.002, 0.006, -0.006], [0.002, 0.008, 0.008]),
    box('scales', 'metal', [-0.006, 0.006, -0.004], [0.006, 0.007, -0.002]),
    box('pin', 'pin', [-0.012, 0, -0.001], [0.012, 0.002, 0.001]),
  ] + letters('word', 'ink', [0.034, 0.024], [-0.022, 0.024], 0.004),
  { metal: 'metal-gold', seal: 'brass-dull', ink: 'plastic-matte-black', pin: 'steel-bright' })
  + { voxelGrain: 0.002 },

  // A plastic star badge 70 mm across lying face up, five points, a red band of print across it, a pin behind.
  h.compound('badge_kids_star', 0.0061, [
    ] + star('star', 'star', 5, 0.035, 0.015, 0.002, 0.005) + [
    box('band', 'band', [-0.020, 0.005, -0.004], [0.020, 0.006, 0.006]),
    box('pin', 'pin', [-0.012, 0, -0.001], [0.012, 0.002, 0.001]),
  ] + letters('word', 'ink', [0.030], [0.001], 0.006),
  { star: 'plastic-yellow', band: 'plastic-red', ink: 'plastic-white', pin: 'steel-bright' })
  + { voxelGrain: 0.002 },

  // A marshal's five-pointed star inside a ring, 62 mm across, all bright silver, lying face up with a pin behind:
  // the star stands proud of the ring, and fine engraved letters run round the ring.
  h.compound('badge_marshal', 0.06, [
    washer('ring', 'metal', 0.024, 0.031, 0.002, 0, 0.002, 0),
    ] + star('star', 'metal', 5, 0.025, 0.011, 0.002, 0.008) + [
    disc('seal', 'seal', 0.008, 0.008, 0.010),
    box('pin', 'pin', [-0.012, 0, -0.001], [0.012, 0.002, 0.001]),
  ] + [
    local a = (k * 72 + (j - 2) * 8) * deg;
    arcPanel('letter-%d-%d' % [k, j], 'engraving', 0.0265, 0.0285, a - 2 * deg, a + 2 * deg, 0.004, 0.0045)
    for k in std.range(0, 4)
    for j in std.range(0, 4)
  ], { metal: 'metal-silver', seal: 'mirror-silver', engraving: 'steel-grey', pin: 'steel-bright' })
  + { voxelGrain: 0.002 },

  // A tactical team's shield 60 by 70 mm lying face up, crown toward -z: a bright silver rim round a blackened
  // field, a gold star at its crown and a silver ribbon of lettering across its lower half, a pin across the back.
  h.compound('badge_swat', 0.085, [
    ] + fan('rim', 'metal', shield(1), 0.002, 0.004, [0, 0])
    + fan('field', 'field', shield(0.84), 0.004, 0.005, [0, 0])
    + fan('emblem', 'emblem', [
      local r = if k % 2 == 0 then 0.013 else 0.0065, a = std.pi + k * std.pi / 5;
      [r * std.sin(a), -0.010 + r * std.cos(a)]
      for k in std.range(0, 9)
    ], 0.005, 0.007, [0, -0.010]) + [
    box('bar', 'metal', [-0.024, 0.005, 0.006], [0.024, 0.007, 0.016]),
    box('pin', 'pin', [-0.012, 0, -0.001], [0.012, 0.002, 0.001]),
  ] + [
    box('letter-%d' % i, 'ink', [-0.017 + i * 0.009, 0.007, 0.009], [-0.011 + i * 0.009, 0.008, 0.013])
    for i in std.range(0, 3)
  ],
  { metal: 'metal-silver', field: 'steel-parkerized', emblem: 'metal-gold', ink: 'plastic-black', pin: 'steel-bright' })
  + { voxelGrain: 0.002 },
]
