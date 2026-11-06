local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;
local rad(d) = d * std.pi / 180;
// A curved shell lying along x from `x0` to `x1`, outer radius `r`, `t` thick, spanning `deg` degrees of arc centred
// `c` degrees round from the top (180 centres it underneath), its axis at height `ya`. Prisms must be convex, so the
// arc is built from `n` quads.
local arc(id, slot, r, t, x0, x1, z, deg, ya, c=0, n=8) =
  local a = rad(deg), c0 = rad(c);
  local p(rr, th) = [ya + rr * std.cos(th), z + rr * std.sin(th)];
  [
    local th0 = c0 - a / 2 + a * i / n, th1 = c0 - a / 2 + a * (i + 1) / n;
    h.prism('%s-%d' % [id, i], slot, 'x', [p(r, th0), p(r, th1), p(r - t, th1), p(r - t, th0)], x0, x1)
    for i in std.range(0, n - 1)
  ];
// The axis height that rests an arc's lowest edge on the floor.
local rest(r, t, deg, c=0) =
  local k = std.min(std.cos(rad(c - deg / 2)), std.cos(rad(c + deg / 2)));
  if k > 0 then -(r - t) * k else -r * k;
// A shell resting on the floor, convex side up.
local shell(id, slot, r, t, x0, x1, z, deg, c=0, n=8) = arc(id, slot, r, t, x0, x1, z, deg, rest(r, t, deg, c), c, n);
// A shell tapering from radius r0 at x0 to r1 at x1 in `steps` slices, each resting on the floor.
local taper(id, slot, r0, r1, t, x0, x1, z, deg, steps=4) = std.flattenArrays([
  shell('%s-%d' % [id, i], slot, r0 + (r1 - r0) * (i + 0.5) / steps, t, x0 + (x1 - x0) * i / steps, x0 + (x1 - x0) * (i + 1) / steps, z, deg)
  for i in std.range(0, steps - 1)
]);
// A cord `w` wide tied round a resting shell of radius r at x, with two loose ends lying on the floor off the outer
// edge `side`. Slot tie.
local tie(id, r, t, x, z, deg, side, w=0.005, slot='tie') =
  local edge = z + side * r * std.sin(rad(std.min(deg, 180) / 2));
  arc(id, slot, r + 0.003, 0.003, x, x + w, z, deg, rest(r, t, deg))
  + [
    box(id + '-end-a', slot, [x - 0.004, 0, std.min(edge, edge + side * 0.06)], [x - 0.001, 0.003, std.max(edge, edge + side * 0.06)]),
    box(id + '-end-b', slot, [x + w + 0.001, 0, std.min(edge, edge + side * 0.045)], [x + w + 0.004, 0.003, std.max(edge, edge + side * 0.045)]),
  ];
// A rounded rectangle outline of [x, z] points, `a` by `b` half-sizes round [cx, cz], corners cut by `k`.
local rrect(cx, cz, a, b, k) = [
  [cx - a + k, cz - b], [cx + a - k, cz - b], [cx + a, cz - b + k], [cx + a, cz + b - k],
  [cx + a - k, cz + b], [cx - a + k, cz + b], [cx - a, cz + b - k], [cx - a, cz - b + k],
];

// One sheet-metal leg guard lying along x, hip end at x = 0, its outer side toward `side`: a hammered thigh plate and
// a shin plate with a bare gap at the knee, each with a rolled top edge and two cord ties. Slots: plate, tie.
local sheetGuard(p, z, side, shift) =
  shell(p + '-thigh', 'plate', 0.078, 0.003, 0.02, 0.26, z, 150)
  + shell(p + '-thigh-rim', 'plate', 0.081, 0.006, 0.02, 0.028, z, 150)
  + shell(p + '-shin', 'plate', 0.063, 0.003, 0.32, 0.58, z, 150)
  + shell(p + '-shin-rim', 'plate', 0.066, 0.006, 0.32, 0.328, z, 150)
  + tie(p + '-tie-a', 0.078, 0.003, 0.06 + shift, z, 150, side)
  + tie(p + '-tie-b', 0.078, 0.003, 0.2 + shift, z, 150, side)
  + tie(p + '-tie-c', 0.063, 0.003, 0.36 + shift, z, 150, side)
  + tie(p + '-tie-d', 0.063, 0.003, 0.52 + shift, z, 150, side);

// One sheet-metal greave lying along x, knee end at x = 0: a shin plate narrowing to the ankle and flaring over the
// instep, a rolled top edge and two cord ties. Slots: plate, tie.
local sheetGreave(p, z, side, shift) =
  shell(p + '-rim', 'plate', 0.069, 0.006, 0.0, 0.008, z, 190)
  + taper(p + '-shin', 'plate', 0.066, 0.05, 0.003, 0.0, 0.33, z, 190, 4)
  + taper(p + '-flare', 'plate', 0.05, 0.058, 0.003, 0.33, 0.37, z, 190, 2)
  + tie(p + '-tie-a', 0.064, 0.003, 0.05 + shift, z, 190, side)
  + tie(p + '-tie-b', 0.054, 0.003, 0.26 + shift, z, 190, side);

// One sheet-metal knee guard: a half-pipe 130 mm long lying along x with a hammered knee cop domed out of its crown,
// a felt pad lining it that shows past both ends, and two leather straps lying flat off each edge, the outer ones
// buckled. Slots: plate, hole, pad, tie, buckle.
local sheetKnee(p, z, side) =
  shell(p + '-cap', 'plate', 0.064, 0.003, -0.065, 0.065, z, 180)
  + shell(p + '-pad', 'pad', 0.061, 0.008, -0.071, 0.071, z, 176)
  + [h.dome(p + '-cop', 'plate', 0.034, 0.016, 0.003, 'y', [0, 0.06, z])]
  + std.flattenArrays([
    [
      box('%s-hole-%d' % [p, i], 'hole', [x - 0.004, 0.003, z + side * 0.06 - 0.003], [x + 0.004, 0.012, z + side * 0.06 + 0.003]),
      box('%s-hole-in-%d' % [p, i], 'hole', [x - 0.004, 0.003, z - side * 0.06 - 0.003], [x + 0.004, 0.012, z - side * 0.06 + 0.003]),
      box('%s-strap-%d' % [p, i], 'tie', [x - 0.008, 0, std.min(z + side * 0.064, z + side * 0.15)], [x + 0.008, 0.004, std.max(z + side * 0.064, z + side * 0.15)]),
      box('%s-buckle-%d' % [p, i], 'buckle', [x - 0.011, 0.004, std.min(z + side * 0.1, z + side * 0.114)], [x + 0.011, 0.008, std.max(z + side * 0.1, z + side * 0.114)]),
      box('%s-strap-in-%d' % [p, i], 'tie', [x - 0.008, 0, std.min(z - side * 0.064, z - side * 0.1)], [x + 0.008, 0.004, std.max(z - side * 0.064, z - side * 0.1)]),
    ]
    for i in [0, 1]
    for x in [[-0.04, 0.04][i]]
  ]);

// The sheet-metal skirt laid flat, outside up, waist to +z: four cut-down plates, each slightly curved and wider at
// the hem, hung by two leather tabs from a belt with a buckle. Slots: plate, rivet, belt, buckle.
local skirtPlate(i, xc) =
  local o = [[-0.058, -0.17], [0.058, -0.17], [0.055, 0.13], [-0.055, 0.13]];
  local y0 = 0.004, t = 0.004, r = 0.5;
  h.curvedPlate('plate-%d' % i, 'plate', o, y0, t, r, 5, xc)
  + std.flattenArrays([
    local ty = h.curvedTopAt(o, y0, t, r, dx);
    [
      box('tab-%d-%d' % [i, k], 'belt', [xc + dx - 0.009, ty, 0.1], [xc + dx + 0.009, ty + 0.004, 0.165]),
      box('rivet-%d-%d' % [i, k], 'rivet', [xc + dx - 0.004, ty + 0.004, 0.11], [xc + dx + 0.004, ty + 0.007, 0.118]),
    ]
    for k in [0, 1]
    for dx in [[-0.03, 0.03][k]]
  ]);
local skirt =
  std.flattenArrays([skirtPlate(i, [-0.18, -0.06, 0.06, 0.18][i]) for i in std.range(0, 3)])
  + [
    box('belt', 'belt', [-0.25, 0, 0.14], [0.25, 0.006, 0.18]),
    box('buckle', 'buckle', [0.24, 0, 0.135], [0.262, 0.009, 0.185]),
    box('buckle-bar', 'buckle', [0.247, 0.006, 0.142], [0.255, 0.01, 0.178]),
  ];

// One paper leg guard lying along x: three shells of stacked paper sheets, each a little shorter than the one under
// it, bound with bands of duct tape and two tape ties. Slots: paper, tape.
local paperGuard(p, z, side, shift) =
  shell(p + '-layer-a', 'paper', 0.07, 0.004, 0.0, 0.47, z, 160)
  + shell(p + '-layer-b', 'paper', 0.074, 0.004, 0.015, 0.455, z, 160)
  + shell(p + '-layer-c', 'paper', 0.078, 0.004, 0.03, 0.44, z, 160)
  + std.flattenArrays([
    tie('%s-tape-%d' % [p, i], 0.078, 0.012, x, z, 160, side, 0.045, 'tape')
    for i in [0, 1, 2]
    for x in [[0.04, 0.2, 0.36][i] + shift]
  ]);

// One scrap leg guard lying along x: four mismatched pieces of sheet, each a different curve, set a little askew and
// overlapping, strung together by cords. Slots: scrap-a, scrap-b, scrap-c, tie.
local scrapGuard(p, z, side, shift) =
  shell(p + '-a', 'scrap-a', 0.082, 0.003, 0.0, 0.16, z, 130, 12 * side)
  + shell(p + '-b', 'scrap-b', 0.077, 0.004, 0.13, 0.28, z, 110, -8 * side)
  + shell(p + '-c', 'scrap-c', 0.066, 0.003, 0.31, 0.45, z, 140, 6 * side)
  + shell(p + '-d', 'scrap-a', 0.062, 0.004, 0.43, 0.58, z, 115, -14 * side)
  + tie(p + '-tie-a', 0.086, 0.003, 0.05 + shift, z, 150, side)
  + tie(p + '-tie-b', 0.081, 0.003, 0.2 + shift, z, 150, side)
  + tie(p + '-tie-c', 0.07, 0.003, 0.38 + shift, z, 150, side)
  + tie(p + '-tie-d', 0.066, 0.003, 0.52 + shift, z, 150, side);

// One tyre leg guard lying along x: three thick chunks of tyre tread, ridged across, strung together by cords.
// Slots: rubber, tread, tie.
local tyreChunk(id, r, x0, x1, z) =
  shell(id, 'rubber', r, 0.014, x0, x1, z, 120)
  + std.flattenArrays([
    shell('%s-lug-%d' % [id, i], 'tread', r + 0.009, 0.01, x0 + 0.008 + i * 0.03, x0 + 0.022 + i * 0.03, z, 110)
    for i in std.range(0, std.floor((x1 - x0 - 0.03) / 0.03))
  ]);
local tyreGuard(p, z, side, shift) =
  tyreChunk(p + '-thigh', 0.09, 0.0, 0.24, z)
  + tyreChunk(p + '-knee', 0.08, 0.255, 0.335, z)
  + tyreChunk(p + '-shin', 0.074, 0.35, 0.58, z)
  + tie(p + '-tie-a', 0.095, 0.003, 0.11 + shift, z, 120, side)
  + tie(p + '-tie-b', 0.085, 0.003, 0.29 + shift, z, 120, side)
  + tie(p + '-tie-c', 0.079, 0.003, 0.46 + shift, z, 120, side);

// One mail legging laid flat along x, hip end at x = 0: a tapering sheet of mail with raised ring rows, a leather
// band at the hip with two straps that buckle to a belt, and a stirrup strap under the foot at the ankle end.
// Slots: mail, ring, strap, buckle.
local mailLegging(p, z) =
  local half(x) = 0.1 - 0.045 * x / 0.78;
  [g.flat(p + '-sheet', 'mail', [[0, z - half(0)], [0.78, z - half(0.78)], [0.78, z + half(0.78)], [0, z + half(0)]], 0, 0.01)]
  + [
    box('%s-row-%d' % [p, i], 'ring', [x, 0.01, z - half(x) + 0.004], [x + 0.005, 0.013, z + half(x) - 0.004])
    for i in std.range(0, 30)
    for x in [0.045 + i * 0.023]
  ]
  + [
    box(p + '-band', 'strap', [0, 0.01, z - half(0)], [0.03, 0.014, z + half(0)]),
    box(p + '-strap-a', 'strap', [-0.16, 0, z - 0.06], [0.01, 0.004, z - 0.04]),
    box(p + '-strap-b', 'strap', [-0.16, 0, z + 0.04], [0.01, 0.004, z + 0.06]),
    box(p + '-buckle-a', 'buckle', [-0.17, 0, z - 0.064], [-0.155, 0.007, z - 0.036]),
    box(p + '-buckle-b', 'buckle', [-0.17, 0, z + 0.036], [-0.155, 0.007, z + 0.064]),
    box(p + '-stirrup-a', 'strap', [0.78, 0, z - half(0.78)], [0.86, 0.004, z - half(0.78) + 0.016]),
    box(p + '-stirrup-b', 'strap', [0.78, 0, z + half(0.78) - 0.016], [0.86, 0.004, z + half(0.78)]),
    box(p + '-stirrup-c', 'strap', [0.86, 0, z - half(0.78)], [0.876, 0.004, z + half(0.78)]),
  ];

// One mail half-legging lying back up along x: mail wrapping the front and sides, open down the back where a lace
// zigzags across the gap, a leather tie band at the hip. Slots: mail, ring, lace, strap.
local halfLegging(p, z) =
  local rAt(x) = 0.072 - 0.024 * x / 0.74, steps = 8, len = 0.74, deg = 270;
  local ya(x) = rAt(x);
  local edge(x, s) = [ya(x) + rAt(x) * std.cos(rad(45)), z + s * rAt(x) * std.sin(rad(45))];
  std.flattenArrays([
    local x0 = len * i / steps, x1 = len * (i + 1) / steps, r = rAt((x0 + x1) / 2);
    arc('%s-mail-%d' % [p, i], 'mail', r, 0.005, x0, x1, z, deg, r, 180, 9)
    for i in std.range(0, steps - 1)
  ])
  + std.flattenArrays([
    local r = rAt(x) + 0.002;
    arc('%s-row-%d' % [p, i], 'ring', r, 0.003, x, x + 0.005, z, deg, rAt(x), 180, 9)
    for i in std.range(0, 24)
    for x in [0.05 + i * 0.027]
  ])
  + [
    local xa = 0.03 + i * 0.06, xb = xa + 0.06, s = if i % 2 == 0 then 1 else -1;
    local a = edge(xa, -s), b = edge(xb, s);
    h.prism('%s-lace-%d' % [p, i], 'lace', 'y', [[a[1] - 0.004, xa], [b[1] - 0.004, xb], [b[1] + 0.004, xb], [a[1] + 0.004, xa]], std.min(a[0], b[0]) - 0.002, std.max(a[0], b[0]) + 0.002)
    for i in std.range(0, 10)
  ]
  + arc(p + '-band', 'strap', rAt(0) + 0.004, 0.005, 0, 0.03, z, deg, rAt(0), 180, 12);

// Folded trousers on h.foldedGarment, `w` across x and `d` along z, top face at `ht`: a waistband with belt loops and
// a button along the +z edge and slanted front pocket mouths below it. Slots: cloth, band, loop, button, pocket.
local trousers(w, d, ht, folds) =
  local y = ht, zb = d / 2;
  h.foldedGarment(w, d, ht, folds)
  + [
    box('band', 'band', [-w / 2, y, zb - 0.04], [w / 2, y + 0.004, zb]),
    box('button', 'button', [-0.008, y + 0.004, zb - 0.028], [0.008, y + 0.008, zb - 0.012]),
  ]
  + [
    box('loop-%d' % i, 'loop', [x - 0.006, y + 0.004, zb - 0.044], [x + 0.006, y + 0.008, zb + 0.002])
    for i in [0, 1, 2, 3]
    for x in [[-0.15, -0.06, 0.06, 0.15][i] * w / 0.38]
  ]
  + [
    g.strip('pocket-' + s, 'pocket', [s * 0.13 * w / 0.38, zb - 0.045], [s * 0.07 * w / 0.38, zb - 0.1], y, 0.008, 0.003)
    for s in [-1, 1]
  ];

// A raised pad on a top face at y: a rounded block `a` by `b` half-sizes round [cx, cz], `t` thick, with `ribs`
// ridges across it. Slots: pad (or `slot`), and rib for the ridges.
local pad(id, cx, cz, a, b, y, t, ribs=0, slot='pad') =
  [g.flat(id, slot, rrect(cx, cz, a, b, std.min(a, b) * 0.4), y, t)]
  + [
    box('%s-rib-%d' % [id, i], 'rib', [cx - a * 0.75, y + t, cz - b + (i + 1) * 2 * b / (ribs + 1) - 0.003], [cx + a * 0.75, y + t + 0.003, cz - b + (i + 1) * 2 * b / (ribs + 1) + 0.003])
    for i in std.range(0, ribs - 1)
  ];

[
  // A pair of sheet-metal leg guards 600 mm from hip to ankle, each a hammered thigh plate and shin plate of 3 mm
  // sheet tied on with cord, laid side by side.
  h.compound('leg_guards_sheet_metal', 2.2, sheetGuard('left', -0.09, -1, 0) + sheetGuard('right', 0.09, 1, 0.03), {
    plate: 'steel-bright',
    tie: 'cord-cotton',
  }) + { voxelGrain: 0.004 },

  // A pair of sheet-metal greaves 370 mm from knee to instep, laid side by side.
  h.compound('greaves_sheet_metal', 1.6, sheetGreave('left', -0.085, -1, 0) + sheetGreave('right', 0.085, 1, 0.03), {
    plate: 'steel-bright',
    tie: 'cord-cotton',
  }) + { voxelGrain: 0.004 },

  // A skirt of four cut-down steel sheets 300 mm long hung from a leather belt 500 mm long, laid flat.
  h.compound('skirt_sheet_metal', 2, skirt, {
    plate: 'steel-bright',
    rivet: 'steel-grey',
    belt: 'leather-brown',
    buckle: 'steel',
  }) + { voxelGrain: 0.004 },

  // A pair of sheet-metal knee guards, each a felt-lined half-pipe 130 mm long and 130 mm across with a domed knee
  // cop, leather straps lying flat off both edges; 500 mm across the pair.
  h.compound('knee_guards_sheet_metal', 0.79, sheetKnee('left', -0.1, -1) + sheetKnee('right', 0.1, 1), {
    plate: 'steel-bright',
    hole: 'plastic-matte-black',
    pad: 'felt-grey',
    tie: 'leather-brown',
    buckle: 'steel-grey',
  }) + { voxelGrain: 0.004 },

  // A pair of paper leg guards 470 mm long, each three curved layers of stacked paper bound with duct tape.
  h.compound('leg_guards_paper', 0.59, paperGuard('left', -0.09, -1, 0) + paperGuard('right', 0.09, 1, 0.03), {
    paper: 'paper-white',
    tape: 'tape-grey',
  }) + { voxelGrain: 0.004 },

  // A pair of scrap leg guards 580 mm long, mismatched pieces of sheet strung together with cord.
  h.compound('leg_guards_scrap', 2.1, scrapGuard('left', -0.095, -1, 0) + scrapGuard('right', 0.095, 1, 0.03), {
    'scrap-a': 'scrap-rusted',
    'scrap-b': 'steel-galvanised',
    'scrap-c': 'steel-bright',
    tie: 'cord-cotton',
  }) + { voxelGrain: 0.004 },

  // A pair of tyre leg guards 580 mm long, three thick chunks of tread on each strung together with cord.
  h.compound('leg_guards_tyre', 3, tyreGuard('left', -0.1, -1, 0) + tyreGuard('right', 0.1, 1, 0.03), {
    rubber: 'rubber-black',
    tread: 'plastic-charcoal',
    tie: 'cord-cotton',
  }) + { voxelGrain: 0.004 },

  // A pair of mail leggings 780 mm from hip to ankle, laid flat side by side, with hip straps and stirrups.
  h.compound('chainmail_leggings', 6, mailLegging('left', -0.105) + mailLegging('right', 0.105), {
    mail: 'steel-mail',
    ring: 'steel-mail-dark',
    strap: 'leather-brown',
    buckle: 'steel',
  }) + { voxelGrain: 0.004 },

  // A pair of mail half-leggings 740 mm long lying back up, the open backs laced across.
  h.compound('chainmail_half_leggings', 4.5, halfLegging('left', -0.085) + halfLegging('right', 0.085), {
    mail: 'steel-mail',
    ring: 'steel-mail-dark',
    lace: 'cord-cotton',
    strap: 'leather-brown',
  }) + { voxelGrain: 0.004 },

  // Motorcycle jeans folded to 380 by 320 mm, 60 mm thick, a ribbed knee pad and a hip pad sewn in, orange stitching.
  h.compound('motorcycle_jeans', 1.4, trousers(0.38, 0.32, 0.06, 3)
    + pad('knee', 0.05, -0.075, 0.065, 0.055, 0.06, 0.008, 3)
    + pad('hip', -0.12, -0.02, 0.045, 0.04, 0.06, 0.006)
    + [box('seam-%d' % i, 'stitch', [-0.19, 0.06, z], [0.19, 0.0625, z + 0.003]) for i in [0, 1] for z in [[-0.155, 0.03][i]]], {
    cloth: 'cloth-denim',
    band: 'cloth-denim',
    loop: 'cloth-denim',
    button: 'brass-dull',
    pocket: 'cloth-navy',
    pad: 'plastic-charcoal',
    rib: 'plastic-matte-black',
    stitch: 'cloth-orange',
  }) + { voxelGrain: 0.004 },

  // Canvas trousers folded to 380 by 320 mm, 60 mm thick, with leather panels sewn over the thigh and shin.
  h.compound('leather_padded_pants', 1.2, trousers(0.38, 0.32, 0.06, 3)
    + pad('thigh', 0.02, 0.0, 0.13, 0.045, 0.06, 0.004)
    + pad('shin', 0.02, -0.11, 0.12, 0.04, 0.06, 0.004), {
    cloth: 'cloth-canvas',
    band: 'cloth-canvas',
    loop: 'cloth-canvas',
    button: 'steel',
    pocket: 'cloth-brown',
    pad: 'leather-brown',
    rib: 'leather-brown',
  }) + { voxelGrain: 0.004 },

  // Bomb-disposal trousers folded to 440 by 380 mm, 140 mm thick with padding: quilted panels, a hard knee plate
  // with hook-and-loop strips, and braces laid over the top.
  h.compound('eod_trousers', 6.9, trousers(0.44, 0.38, 0.14, 3)
    + g.quilt({ style: 'channels', x0: -0.2, x1: 0.2, z0: -0.17, z1: 0.1, y: 0.14, r: 0.012, pitch: 0.04 })
    + h.curvedPlate('knee', 'plate', rrect(0, 0, 0.085, 0.07, 0.03), 0.142, 0.012, 0.25, 6, 0.06, -0.06)
    + [box('hook-%d' % i, 'hook', [0.06 - 0.07, 0.165, z], [0.06 + 0.07, 0.169, z + 0.012]) for i in [0, 1] for z in [[-0.115, 0.0][i]]]
    + std.flattenArrays([
      [
        box('brace-' + k, 'brace', [x - 0.0125, 0.144, 0.0], [x + 0.0125, 0.148, 0.235]),
        box('brace-buckle-' + k, 'buckle', [x - 0.016, 0.148, 0.12], [x + 0.016, 0.153, 0.14]),
      ]
      for k in ['l', 'r']
      for x in [{ l: -0.13, r: -0.08 }[k]]
    ]), {
    cloth: 'cloth-olive-drab',
    band: 'cloth-olive-drab',
    loop: 'cloth-olive-drab',
    button: 'plastic-matte-black',
    pocket: 'webbing-olive-dark',
    quilt: 'cloth-olive-drab',
    plate: 'plastic-charcoal',
    hook: 'hook-loop-grey',
    brace: 'webbing-black',
    buckle: 'plastic-matte-black',
  }) + { voxelGrain: 0.004 },

  // Lighter bomb-disposal trousers folded to 400 by 340 mm, 90 mm thick: stitched padding, a knee pad, a flapped
  // thigh pocket and hook-and-loop panels.
  h.compound('eod_trousers_light', 3.2, trousers(0.4, 0.34, 0.09, 3)
    + g.quilt({ style: 'lines', x0: -0.19, x1: 0.19, z0: -0.16, z1: 0.09, y: 0.09, pitch: 0.05 })
    + pad('knee', 0.07, -0.08, 0.06, 0.05, 0.094, 0.01, 2)
    + pad('cargo', -0.1, -0.04, 0.06, 0.07, 0.094, 0.012, 0, 'cargo')
    + [
      box('pocket-flap', 'flap', [-0.165, 0.106, 0.0], [-0.035, 0.11, 0.035]),
      box('hook-a', 'hook', [0.02, 0.094, 0.0], [0.13, 0.098, 0.03]),
    ], {
    cloth: 'nylon-coyote',
    band: 'nylon-coyote',
    loop: 'nylon-coyote',
    button: 'plastic-matte-black',
    pocket: 'webbing-black',
    quilt: 'polymer-fde',
    pad: 'plastic-charcoal',
    rib: 'plastic-matte-black',
    cargo: 'nylon-coyote',
    flap: 'polymer-fde',
    hook: 'hook-loop-grey',
  }) + { voxelGrain: 0.004 },
]
