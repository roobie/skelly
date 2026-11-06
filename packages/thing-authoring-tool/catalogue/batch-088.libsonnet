local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local tube = h.tube;
local disc = h.disc;
// A strap lying flat from (x0, z0) to (x1, z1), `w` wide, between heights y0 and y1.
local strap(id, slot, x0, z0, x1, z1, w, y0, y1) =
  local dx = x1 - x0, dz = z1 - z0, len = std.sqrt(dx * dx + dz * dz), nx = -dz / len * w / 2, nz = dx / len * w / 2;
  h.prism(id, slot, 'y', [[z0 + nz, x0 + nx], [z1 + nz, x1 + nx], [z1 - nz, x1 - nx], [z0 - nz, x0 - nx]], y0, y1);
// Rows of PALS webbing on a panel from x0 to x1 (x0 < x1) and down from z0, `rows` rows 25 mm wide every 38 mm, cut
// into 38 mm channels, standing on height y.
local molle(id, x0, x1, z0, rows, y) = [
  box('%s-%d-%d' % [id, i, j], 'webbing', [x0 + j * 0.038 + 0.002, y, z0 + i * 0.038], [x0 + (j + 1) * 0.038 - 0.002, y + 0.004, z0 + i * 0.038 + 0.025])
  for i in std.range(0, rows - 1)
  for j in std.range(0, std.floor((x1 - x0) / 0.038) - 1)
];
// A load-bearing vest laid flat, front up, neck at -z and hem at +z, open down the middle and closed by two buckles.
// `o`: w and l the flat size, t the padded thickness, rows of webbing per front panel, harness (shoulder and waist
// straps instead of a back panel), wings (a padded cummerbund each side), sling (a single-point sling across the
// chest), magnets (two breaching-gun magnets on the right side).
local vest(id, massKg, o) =
  local w = o.w, l = o.l, t = o.t, top = -0.08, panelEnd = if o.harness then 0.1 else l / 2, y = t + 0.004;
  h.compound(id, massKg, (
    if o.harness then [
      box('back-strap-l', 'body', [-0.15, 0, -l / 2], [-0.1, 0.004, l / 2 - 0.04]),
      box('back-strap-r', 'body', [0.1, 0, -l / 2], [0.15, 0.004, l / 2 - 0.04]),
      box('belt', 'body', [-w / 2, 0, l / 2 - 0.05], [w / 2, 0.008, l / 2]),
    ] + molle('belt-webbing', -w / 2 + 0.01, w / 2 - 0.01, l / 2 - 0.0375, 1, 0.008)
    else [
      box('back', 'body', [-w / 2, 0, top], [w / 2, 0.006, l / 2]),
      box('yoke', 'body', [-0.17, 0, -l / 2 + 0.06], [0.17, 0.006, top]),
    ]
  ) + [
    box('shoulder-l', 'body', [-0.17, 0.004, -l / 2], [-0.08, t, top + 0.01]),
    box('shoulder-r', 'body', [0.08, 0.004, -l / 2], [0.17, t, top + 0.01]),
    box('front-l', 'body', [-w / 2 + (if o.harness then 0.02 else 0), 0.004, top], [-0.012, t, panelEnd]),
    box('front-r', 'body', [0.012, 0.004, top], [w / 2 - (if o.harness then 0.02 else 0), t, panelEnd]),
    box('buckle-a', 'buckle', [-0.022, t, top + 0.04], [0.022, t + 0.008, top + 0.06]),
    box('buckle-b', 'buckle', [-0.022, t, panelEnd - 0.06], [0.022, t + 0.008, panelEnd - 0.04]),
  ] + molle('webbing-l', -w / 2 + 0.02, -0.03, top + 0.012, o.rows, t)
  + molle('webbing-r', 0.03, w / 2 - 0.02, top + 0.012, o.rows, t)
  + (
    if o.wings then [
      box('wing-l', 'body', [-w / 2 - 0.08, 0.002, 0.02], [-w / 2, t * 0.6, l / 2 - 0.02]),
      box('wing-r', 'body', [w / 2, 0.002, 0.02], [w / 2 + 0.08, t * 0.6, l / 2 - 0.02]),
      box('drag-handle', 'webbing', [-0.05, 0, -l / 2 - 0.03], [0.05, 0.014, -l / 2 + 0.03]),
    ] + molle('wing-webbing-l', -w / 2 - 0.078, -w / 2 - 0.002, 0.04, std.floor((l / 2 - 0.06) / 0.038), t * 0.6)
    + molle('wing-webbing-r', w / 2 + 0.002, w / 2 + 0.078, 0.04, std.floor((l / 2 - 0.06) / 0.038), t * 0.6)
    else []
  ) + (
    if o.sling then [
      box('sling-yoke', 'sling', [-0.17, y, -l / 2 + 0.05], [0.17, y + 0.006, -l / 2 + 0.08]),
      strap('sling-run', 'sling', -0.13, -l / 2 + 0.065, 0.14, l / 2 - 0.12, 0.03, y, y + 0.006),
      box('sling-hook', 'hook', [0.125, y, l / 2 - 0.12], [0.155, y + 0.014, l / 2 - 0.07]),
    ] else []
  ) + (
    if o.magnets then [
      box('magnet-chest', 'magnet', [0.08, y, top + 0.06], [0.16, y + 0.012, top + 0.1]),
      box('magnet-waist', 'magnet', [0.08, y, l / 2 - 0.07], [0.16, y + 0.012, l / 2 - 0.03]),
    ] else []
  ), { body: 'cloth-olive-drab', webbing: 'cord-olive', buckle: 'plastic-black', sling: 'polymer-black', hook: 'steel-grey', magnet: 'steel-grey' })
  + { voxelGrain: 0.004 };
// A quiver lying on its side along x, open mouth at -x so the iso view looks into it and closed base at +x,
// `length` long, from radius rm at the mouth to rb at the base, with a `wall` thick skin. Slot: body.
local quiverBody(length, rb, rm, wall) = turned('body', 'body', 'x', [
  [length, 0], [length, rb], [0, rm], [0, rm - wall], [length - wall, rb - wall], [length - wall, 0],
], [-length / 2, rm, 0]);
// A ring round a quiver body from x to x + w, matching its taper.
local band(id, slot, length, rb, rm, x, w, t) =
  local r = rm + (rb - rm) * (x + w / 2 + length / 2) / length;
  tube(id, slot, r - 0.004, r + t, x, x + w, rm, 0);
// A shoulder strap laid in a long loop on the floor beside a quiver at +z, its ends tied to the quiver.
local floorStrap(slot, length, rm, w) = [
  box('strap-run', slot, [-length * 0.4, 0, rm + 0.03], [length * 0.4, 0.004, rm + 0.03 + w]),
  box('strap-end-a', slot, [-length * 0.4, 0, 0], [-length * 0.4 + w, 0.004, rm + 0.03 + w]),
  box('strap-end-b', slot, [length * 0.4 - w, 0, 0], [length * 0.4, 0.004, rm + 0.03 + w]),
];
// A woven birch bark quiver: light bark strips round a dark core so the seams show, a wooden hoop at the mouth and
// rawhide lashing.
local birchQuiver(id, massKg, length, rb, rm, strapped) =
  local n = std.floor(length / 0.03);
  h.compound(id, massKg, [quiverBody(length, rb, rm, 0.004)] + [
    band('strip-%d' % i, 'strip', length, rb, rm, -length / 2 + i * 0.03 + 0.002, 0.026, 0.002)
    for i in std.range(0, n - 1)
  ] + [
    box('seam-top', 'seam', [-length / 2 + 0.01, rm + (rb + rm) / 2 - 0.004, -0.003], [length / 2 - 0.01, rm + (rb + rm) / 2 + 0.004, 0.003]),
    band('hoop', 'hoop', length, rb, rm, -length / 2, 0.012, 0.006),
    band('lash-a', 'lash', length, rb, rm, -length / 2 + 0.042, 0.008, 0.005),
    band('lash-b', 'lash', length, rb, rm, length / 2 - 0.068, 0.008, 0.005),
  ] + (if strapped then floorStrap('lash', length, rm, 0.025) else []),
  { body: 'bark', strip: 'cloth-cotton', seam: 'bark', hoop: 'wood-pine', lash: 'skin-rawhide' });
// A pipe quiver: a steel pipe `length` long and `r` across with a cap on its base end at +x, so the iso view looks
// into its open end.
local pipe(id, slot, length, r, x0, y, z) = [
  tube(id, slot, r - 0.003, r, x0, x0 + length, y, z),
  turned(id + '-cap', 'cap', 'x', [[0, 0], [0, r + 0.002], [0.016, r + 0.002], [0.016, 0]], [x0 + length - 0.01, y, z]),
];
[
  // A heavy load-bearing vest laid flat, 540 mm wide with a padded cummerbund each side and 580 mm long, rows of
  // webbing down both front panels, a single-point sling across the chest and two steel magnets on the right side.
  vest('heavy_load_bearing_vest_breacher', 2.2, { w: 0.54, l: 0.58, t: 0.024, rows: 9, harness: false, wings: true, sling: true, magnets: true }),

  // The same heavy vest with its sling and no magnets.
  vest('heavy_load_bearing_vest_sling', 1.7, { w: 0.54, l: 0.58, t: 0.024, rows: 9, harness: false, wings: true, sling: true, magnets: false }),

  // A light harness laid flat, 440 mm wide and 520 mm long: shoulder straps, a short chest panel with three rows of
  // webbing each side and a webbing belt, with two straps down the back.
  vest('light_load_bearing_vest', 0.5, { w: 0.44, l: 0.52, t: 0.01, rows: 3, harness: true, wings: false, sling: false, magnets: false }),

  // A load-bearing vest laid flat, 480 mm wide and 540 mm long, with webbing down both front panels.
  vest('load_bearing_vest', 0.9, { w: 0.48, l: 0.54, t: 0.016, rows: 8, harness: false, wings: false, sling: false, magnets: false }),

  // The same vest with a single-point sling across the chest.
  vest('load_bearing_vest_sling', 1.1, { w: 0.48, l: 0.54, t: 0.016, rows: 8, harness: false, wings: false, sling: true, magnets: false }),

  // An open leather bag for javelins lying on its side, 800 mm long, 120 mm across at the sewn-shut base flaring to
  // 200 mm at the rolled mouth, laced up one side, with a shoulder strap laid beside it.
  local length = 0.8, rb = 0.06, rm = 0.1;
  h.compound('javelin_bag', 0.6, [
    quiverBody(length, rb, rm, 0.004),
    band('hem', 'hem', length, rb, rm, -length / 2, 0.025, 0.006),
    band('base-tie', 'lace', length, rb, rm, length / 2 - 0.04, 0.01, 0.004),
  ] + [
    local x = -length / 2 + 0.05 + i * 0.06, r = rm + (rb - rm) * (x + 0.004 + length / 2) / length;
    box('lace-%d' % i, 'lace', [x, rm + r - 0.004, -0.012], [x + 0.008, rm + r + 0.004, 0.012])
    for i in std.range(0, 11)
  ] + floorStrap('strap', length, rm, 0.035),
  { body: 'leather-brown', hem: 'leather-black', lace: 'skin-rawhide', strap: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A small nylon pouch for one pistol magazine, 70 mm wide, 120 mm tall and 28 mm deep, standing with its flap
  // forward and its ankle strap closed in a loop 110 mm across behind it.
  h.compound('legpouch', 0.049, [
    box('pouch', 'body', [-0.035, 0, 0], [0.035, 0.11, 0.028]),
    box('flap', 'body', [-0.037, 0.08, 0.028], [0.037, 0.12, 0.032]),
    box('flap-top', 'body', [-0.037, 0.11, -0.002], [0.037, 0.12, 0.032]),
    box('tab', 'tab', [-0.025, 0.088, 0.032], [0.025, 0.1, 0.035]),
    turned('strap', 'strap', 'y', [[0, 0.051], [0, 0.055], [0.035, 0.055], [0.035, 0.051], [0, 0.051]], [0, 0.03, -0.054]),
  ], { body: 'cloth-olive-drab', tab: 'plastic-black', strap: 'polymer-black' })
  + { voxelGrain: 0.002 },

  // A nylon thigh pouch for two magazines, 100 mm wide, 160 mm tall and 35 mm deep, standing with two flaps forward
  // and two thigh straps closed in loops 170 mm across behind it.
  h.compound('legpouch_large', 0.083, [
    box('pouch', 'body', [-0.05, 0, 0], [0.05, 0.15, 0.035]),
    box('divider', 'tab', [-0.002, 0, 0.035], [0.002, 0.12, 0.037]),
  ] + std.flattenArrays([
    [
      box('flap-%d' % s, 'body', [s * 0.051 - 0.025 - 0.024, 0.11, 0.035], [s * 0.051 - 0.025 + 0.024, 0.16, 0.039]),
      box('tab-%d' % s, 'tab', [s * 0.051 - 0.025 - 0.018, 0.118, 0.039], [s * 0.051 - 0.025 + 0.018, 0.13, 0.042]),
    ]
    for s in [0, 1]
  ]) + [
    box('flap-top', 'body', [-0.05, 0.15, -0.002], [0.05, 0.16, 0.035]),
    turned('strap-low', 'strap', 'y', [[0, 0.081], [0, 0.085], [0.03, 0.085], [0.03, 0.081], [0, 0.081]], [0, 0.015, -0.084]),
    turned('strap-high', 'strap', 'y', [[0, 0.081], [0, 0.085], [0.03, 0.085], [0.03, 0.081], [0, 0.081]], [0, 0.1, -0.084]),
  ], { body: 'cloth-olive-drab', tab: 'plastic-black', strap: 'polymer-black' })
  + { voxelGrain: 0.004 },

  // A nylon quiver lying on its side, 520 mm long and 80 mm across, with a stiffened black rim, a drawcord lock and
  // two webbing straps on its back for clipping to a vest.
  local length = 0.52, r = 0.04;
  h.compound('nylon_quiver', 0.15, [
    quiverBody(length, r, r, 0.003),
    band('rim', 'trim', length, r, r, -length / 2, 0.02, 0.004),
    band('base', 'trim', length, r, r, length / 2 - 0.015, 0.015, 0.003),
    box('cord-lock', 'trim', [-length / 2 + 0.02, 2 * r, -0.008], [-length / 2 + 0.035, 2 * r + 0.012, 0.008]),
  ] + [
    box('molle-%d' % i, 'trim', [x, r - 0.012, -r - 0.004], [x + 0.025, r + 0.012, -r + 0.004])
    for i in [0, 1]
    for x in [[-0.15, 0.08][i]]
  ], { body: 'cloth-olive-drab', trim: 'polymer-black' })
  + { voxelGrain: 0.002 },

  // A steel conduit pipe made into a quiver, lying on its side: 500 mm long and 44 mm across with a screwed cap on
  // its base end and a leather belt loop held by two hose clamps.
  local length = 0.5, r = 0.022;
  h.compound('pipe_quiver', 0.41, pipe('pipe', 'pipe', length, r, -length / 2, r + 0.002, 0) + [
    tube('clamp-a', 'clamp', r, r + 0.003, -0.1, -0.088, r + 0.002, 0),
    tube('clamp-b', 'clamp', r, r + 0.003, 0.1, 0.112, r + 0.002, 0),
    box('loop', 'loop', [-0.12, 2 * r + 0.002, -0.015], [0.13, 2 * r + 0.012, 0.015]),
  ], { pipe: 'steel-grey', cap: 'steel-galvanised', clamp: 'steel-galvanised', loop: 'leather-brown' })
  + { voxelGrain: 0.002 },

  // Three 44 mm steel pipes 600 mm long bound into one back quiver with two hose clamps, each capped at its base,
  // lying on its side with a webbing shoulder strap beside it.
  local length = 0.6, r = 0.022, centres = h.hexPack(r, [2, 1]), cy = (2 * r + 2.732 * r) / 3;
  h.compound('pipe_quiver_large', 1.2, std.flattenArrays([
    pipe('pipe-%d' % i, 'pipe', length, r, -length / 2 + i * 0.01 - 0.01, centres[i].y, centres[i].z)
    for i in [0, 1, 2]
  ]) + [
    tube('clamp-%d' % i, 'clamp', 2.155 * r, 2.155 * r + 0.003, x, x + 0.014, cy, 0)
    for i in [0, 1]
    for x in [[-0.18, 0.16][i]]
  ] + floorStrap('strap', length, 2.2 * r, 0.035), { pipe: 'steel-grey', cap: 'steel-galvanised', clamp: 'steel-galvanised', strap: 'cloth-olive-drab' })
  + { voxelGrain: 0.002 },

  // A stitched leather belt quiver lying on its side, 480 mm long, 70 mm across at its capped base and 90 mm at the
  // mouth, with a dark rolled rim and a belt loop near the mouth.
  local length = 0.48, rb = 0.035, rm = 0.045;
  h.compound('quiver', 0.3, [
    quiverBody(length, rb, rm, 0.003),
    band('rim', 'trim', length, rb, rm, -length / 2, 0.016, 0.004),
    band('base', 'trim', length, rb, rm, length / 2 - 0.02, 0.02, 0.003),
    box('belt-loop', 'trim', [-0.14, 2 * rm - 0.004, -0.022], [-0.08, 2 * rm + 0.006, 0.022]),
  ], { body: 'leather-brown', trim: 'leather-black' })
  + { voxelGrain: 0.002 },

  // A belt quiver woven from birch bark strips, lying on its side, 480 mm long, 80 mm across at the base and 90 mm
  // at the mouth, with a wooden hoop round the mouth and two rawhide lashings.
  birchQuiver('quiver_birchbark', 0.15, 0.48, 0.04, 0.045, false) + { voxelGrain: 0.002 },

  // A large leather back quiver lying on its side, 720 mm long, 110 mm across at the base and 140 mm at the mouth,
  // with steel bands at mouth, middle and base and a shoulder strap laid beside it.
  local length = 0.72, rb = 0.055, rm = 0.07;
  h.compound('quiver_large', 0.51, [
    quiverBody(length, rb, rm, 0.004),
    band('band-mouth', 'trim', length, rb, rm, -length / 2, 0.02, 0.003),
    band('band-middle', 'trim', length, rb, rm, -0.01, 0.02, 0.003),
    band('band-base', 'trim', length, rb, rm, length / 2 - 0.02, 0.02, 0.003),
  ] + floorStrap('strap', length, rm, 0.035), { body: 'leather-brown', trim: 'steel-grey', strap: 'leather-black' })
  + { voxelGrain: 0.004 },

  // A large back quiver woven from birch bark strips, lying on its side, 720 mm long, 120 mm across at the base and
  // 140 mm at the mouth, with a wooden hoop, rawhide lashings and a rawhide shoulder strap laid beside it.
  birchQuiver('quiver_large_birchbark', 0.3, 0.72, 0.06, 0.07, true) + { voxelGrain: 0.004 },
]
