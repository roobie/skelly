local h = import '../compound.libsonnet';
local box = h.box;
local pi = std.pi;
// A curved plate lying open side down along x from x0 to x1, its axis on the floor at z: an arc of a tube `r`
// inside and `t` thick spanning `span` radians each side of straight up, in `n` flat facets (few facets read as
// hammered sheet).
local shell(id, slot, x0, x1, r, t, z, n=8, span=pi / 2) = [
  local a = -span + 2 * span * i / n, b = -span + 2 * span * (i + 1) / n;
  h.prism('%s-%d' % [id, i], slot, 'x', [
    [r * std.cos(a), z + r * std.sin(a)],
    [(r + t) * std.cos(a), z + (r + t) * std.sin(a)],
    [(r + t) * std.cos(b), z + (r + t) * std.sin(b)],
    [r * std.cos(b), z + r * std.sin(b)],
  ], x0, x1)
  for i in std.range(0, n - 1)
];
// A plate that tapers from radius r0 at x0 to r1 at x1, in `steps` sections.
local taper(id, slot, x0, x1, r0, r1, t, z, steps=3, n=8) = std.flattenArrays([
  shell('%s-%d' % [id, s], slot, x0 + (x1 - x0) * s / steps, x0 + (x1 - x0) * (s + 1) / steps, r0 + (r1 - r0) * (s + 0.5) / steps, t, z, n)
  for s in std.range(0, steps - 1)
]);
// The same arc with its axis along z from z0 to z1 at x, from angle a0 to a1 (0 straight up, positive toward +x).
local shellZ(id, slot, z0, z1, r, t, x, a0, a1, n=8) = [
  local a = a0 + (a1 - a0) * i / n, b = a0 + (a1 - a0) * (i + 1) / n;
  h.prism('%s-%d' % [id, i], slot, 'z', [
    [x + r * std.sin(a), r * std.cos(a)],
    [x + (r + t) * std.sin(a), (r + t) * std.cos(a)],
    [x + (r + t) * std.sin(b), (r + t) * std.cos(b)],
    [x + r * std.sin(b), r * std.cos(b)],
  ], z0, z1)
  for i in std.range(0, n - 1)
];
// A strap across a plate at x, `w` wide: over the top of the arc and out on the floor each side by `tail`,
// with a buckle on the +z tail.
local strap(id, slot, buckleSlot, x, w, r, z, tail) =
  shell(id + '-over', slot, x - w / 2, x + w / 2, r, 0.003, z) + [
    box(id + '-tail-a', slot, [x - w / 2, 0, z - r - tail], [x + w / 2, 0.003, z - r]),
    box(id + '-tail-b', slot, [x - w / 2, 0, z + r], [x + w / 2, 0.003, z + r + tail]),
    box(id + '-buckle', buckleSlot, [x - w / 2 - 0.003, 0, z + r + tail * 0.4], [x + w / 2 + 0.003, 0.006, z + r + tail * 0.4 + 0.012]),
  ];
// A cord or rag band tied round a plate at x, `w` wide, standing `t` proud of it.
local band(id, slot, x, w, r, t, z) = shell(id, slot, x - w / 2, x + w / 2, r, t, z, 8, pi / 2);
// A sleeve laid flat along x from x0 (wrist, w0 wide) to x1 (upper arm, w1 wide), `t` thick, centred on z.
local sleeve(id, slot, x0, x1, w0, w1, t, z) =
  h.prism(id, slot, 'y', [[z - w0 / 2, x0], [z + w0 / 2, x0], [z + w1 / 2, x1], [z - w1 / 2, x1]], 0, t);
// A rounded elbow cop standing on the floor at (x, z), `r` across.
local cop(id, slot, x, z, r) =
  h.turned(id, slot, 'y', [[0, 0], [0, r], [r * 0.4, r * 0.92], [r * 0.75, r * 0.65], [r * 0.95, r * 0.3], [r, 0]], [x, 0, z]);
// A forearm plate, elbow cop and upper-arm plate in a row along x, wrist at -x, with two leather straps on each
// plate. `t` the plate thickness.
local fullArm(id, z, t) =
  taper(id + '-vambrace', 'plate', -0.3, -0.07, 0.04, 0.05, t, z)
  + [cop(id + '-cop', 'plate', 0, z, 0.055)]
  + shell(id + '-wing', 'plate', -0.03, 0.03, 0.055, t, z, 8, pi / 2)
  + taper(id + '-rerebrace', 'plate', 0.07, 0.29, 0.055, 0.06, t, z)
  + strap(id + '-strap-a', 'strap', 'buckle', -0.26, 0.018, 0.041 + t, z, 0.04)
  + strap(id + '-strap-b', 'strap', 'buckle', -0.12, 0.018, 0.048 + t, z, 0.04)
  + strap(id + '-strap-c', 'strap', 'buckle', 0.12, 0.018, 0.056 + t, z, 0.04)
  + strap(id + '-strap-d', 'strap', 'buckle', 0.25, 0.018, 0.06 + t, z, 0.04);
// A sleeve of plastic sheath plates on a neoprene sleeve: a raised plate with bevelled sides from x0 to x1,
// `w` wide, standing on height y.
local sheath(id, slot, x0, x1, w, y, z) =
  h.prism(id, slot, 'x', [[y, z - w / 2], [y, z + w / 2], [y + 0.006, z + w / 2 - 0.012], [y + 0.01, z], [y + 0.006, z - w / 2 + 0.012]], x0, x1);
[
  // A pair of improvised arm guards, each three pine slats 230 mm long, 35 mm wide and 12 mm thick laid side by
  // side and tied with two rag bands and string.
  h.compound('plank_arm_guard', 0.24, std.flattenArrays([
    [
      box('slat-%d-%d' % [g, s], 'wood', [-0.115 + (s % 2) * 0.006, 0, z + (s - 1) * 0.036 - 0.0175], [0.115 - (1 - s % 2) * 0.008, 0.012, z + (s - 1) * 0.036 + 0.0175])
      for s in [0, 1, 2]
    ] + [
      box('rag-%d-%d' % [g, b], 'rag', [x - 0.016, -0.0, z - 0.058], [x + 0.016, 0.016, z + 0.058])
      for b in [0, 1]
      for x in [[-0.065, 0.065][b]]
    ] + [
      box('string-%d-%d' % [g, b], 'string', [x - 0.002, 0.016, z - 0.05], [x + 0.002, 0.019, z + 0.05])
      for b in [0, 1]
      for x in [[-0.065, 0.065][b]]
    ] + [
      box('rag-end-%d' % g, 'rag', [-0.081, 0, z + 0.058], [-0.049, 0.004, z + 0.09]),
    ]
    for g in [0, 1]
    for z in [[-0.065, 0.065][g]]
  ]), { wood: 'wood-pine', rag: 'cloth-rag', string: 'cord-olive' })
  + { voxelGrain: 0.004 },

  // A pair of bronze vambraces lying open side down, each 260 mm long, 80 mm across at the wrist and 100 mm at the
  // elbow, lined with leather that shows at both ends, with two leather straps and bronze buckles.
  h.compound('armguard_bronze', 1, std.flattenArrays([
    taper('shell-%d' % g, 'bronze', -0.13, 0.13, 0.04, 0.05, 0.005, z)
    + taper('lining-%d' % g, 'leather', -0.136, 0.136, 0.035, 0.045, 0.005, z)
    + [box('ridge-%d' % g, 'bronze', [-0.13, 0.042, z - 0.004], [0.13, 0.05, z + 0.004])]
    + strap('strap-a-%d' % g, 'leather', 'bronze', -0.08, 0.02, 0.047, z, 0.03)
    + strap('strap-b-%d' % g, 'leather', 'bronze', 0.08, 0.02, 0.054, z, 0.03)
    for g in [0, 1]
    for z in [[-0.09, 0.09][g]]
  ]), { bronze: 'brass-polished', leather: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A pair of cut-resistant sleeves laid flat, each 450 mm long, 70 mm wide at the wrist and 110 mm at the top,
  // with knit cuffs and a thumb loop past the wrist.
  h.compound('armguard_cut_resistant', 0.1, std.flattenArrays([
    [
      sleeve('sleeve-%d' % g, 'fabric', -0.21, 0.24, 0.07, 0.11, 0.008, z),
      sleeve('cuff-top-%d' % g, 'cuff', 0.21, 0.24, 0.104, 0.11, 0.01, z),
      sleeve('cuff-wrist-%d' % g, 'cuff', -0.21, -0.19, 0.07, 0.073, 0.01, z),
      box('loop-a-%d' % g, 'cuff', [-0.24, 0, z - 0.02], [-0.21, 0.006, z - 0.012]),
      box('loop-b-%d' % g, 'cuff', [-0.24, 0, z + 0.012], [-0.21, 0.006, z + 0.02]),
      box('loop-end-%d' % g, 'cuff', [-0.248, 0, z - 0.02], [-0.24, 0.006, z + 0.02]),
    ] + [
      box('seam-%d' % g, 'cuff', [-0.19, 0.008, z - 0.002], [0.21, 0.009, z + 0.002]),
    ]
    for g in [0, 1]
    for z in [[-0.065, 0.065][g]]
  ]), { fabric: 'cloth-khaki', cuff: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A pair of hard arm guards laid flat: neoprene sleeves 350 mm long, 80 mm wide at the wrist and 110 mm at the
  // top, each with a moulded plastic forearm sheath and elbow cap and two hook-and-loop straps.
  h.compound('armguard_hard', 0.28, std.flattenArrays([
    [
      sleeve('sleeve-%d' % g, 'neoprene', -0.17, 0.18, 0.08, 0.11, 0.008, z),
      sheath('fore-%d' % g, 'plate', -0.15, 0.02, 0.07, 0.008, z),
      sheath('elbow-%d' % g, 'plate', 0.035, 0.11, 0.085, 0.008, z),
      box('strap-a-%d' % g, 'strap', [-0.12, 0, z - 0.06], [-0.1, 0.012, z + 0.07]),
      box('strap-b-%d' % g, 'strap', [0.13, 0, z - 0.065], [0.15, 0.012, z + 0.075]),
    ]
    for g in [0, 1]
    for z in [[-0.07, 0.07][g]]
  ]), { neoprene: 'neoprene-black', plate: 'plastic-grey', strap: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A pair of stiff leather arm guards lying open side down, each 300 mm long, 80 mm across at the wrist and
  // 110 mm at the top, split along the top and laced shut across the split with rawhide, knotted at the top end.
  h.compound('armguard_larmor', 0.3, std.flattenArrays([
    std.flattenArrays([
      local r = 0.04 + 0.015 * (k + 0.5) / 3, x0 = -0.15 + k * 0.1;
      [
        local sg = if side == 'l' then -1 else 1, a = sg * (0.14 + (pi / 2 - 0.14) * i / 5), b = sg * (0.14 + (pi / 2 - 0.14) * (i + 1) / 5);
        h.prism('shell-%d-%d-%s-%d' % [g, k, side, i], 'leather', 'x', [
          [r * std.cos(a), z + r * std.sin(a)],
          [(r + 0.005) * std.cos(a), z + (r + 0.005) * std.sin(a)],
          [(r + 0.005) * std.cos(b), z + (r + 0.005) * std.sin(b)],
          [r * std.cos(b), z + r * std.sin(b)],
        ], x0, x0 + 0.1)
        for side in ['l', 'r']
        for i in std.range(0, 4)
      ]
      for k in [0, 1, 2]
    ]) + [
      local r = 0.04 + 0.015 * (std.floor((x + 0.15) / 0.1) + 0.5) / 3;
      box('lace-%d-%d' % [g, i], 'lace', [x - 0.003, r + 0.001, z - 0.012], [x + 0.003, r + 0.007, z + 0.012])
      for i in std.range(0, 4)
      for x in [-0.12 + i * 0.06]
    ] + [
      box('lace-knot-%d' % g, 'lace', [0.128, 0.0525 + 0.004, z - 0.005], [0.14, 0.0525 + 0.01, z + 0.005]),
    ]
    for g in [0, 1]
    for z in [[-0.075, 0.075][g]]
  ]), { leather: 'leather-brown', lace: 'skin-rawhide' })
  + { voxelGrain: 0.004 },

  // A pair of steel arm guards laid side by side, each a forearm plate, an elbow cop and an upper-arm plate in a
  // row 600 mm long, 80 to 120 mm across, held by four buckled leather straps.
  h.compound('armguard_lightplate', 2.5, fullArm('a', -0.1, 0.004) + fullArm('b', 0.1, 0.004),
             { plate: 'steel-grey', strap: 'leather-brown', buckle: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A pair of arm guards hammered from sheet steel, each a forearm plate 220 mm long and an upper-arm plate 200 mm
  // long with a gap at the elbow, in a few flat facets, riveted to black leather straps.
  h.compound('armguard_metal', 2.1, std.flattenArrays([
    taper('fore-%d' % g, 'steel', -0.27, -0.05, 0.04, 0.05, 0.004, z, 2, 4)
    + taper('upper-%d' % g, 'steel', 0.01, 0.21, 0.055, 0.06, 0.004, z, 2, 4)
    + strap('strap-a-%d' % g, 'strap', 'rivet', -0.21, 0.02, 0.048, z, 0.03)
    + strap('strap-b-%d' % g, 'strap', 'rivet', -0.1, 0.02, 0.056, z, 0.03)
    + strap('strap-c-%d' % g, 'strap', 'rivet', 0.06, 0.02, 0.062, z, 0.03)
    + strap('strap-d-%d' % g, 'strap', 'rivet', 0.17, 0.02, 0.066, z, 0.03)
    for g in [0, 1]
    for z in [[-0.1, 0.1][g]]
  ]), { steel: 'steel', strap: 'leather-black', rivet: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A pair of forearm bracers hammered from sheet steel, each 230 mm long, 80 mm across at the wrist and 100 mm at
  // the elbow, in a few flat facets, with two leather straps.
  h.compound('armguard_metal_sheets_bracer', 1, std.flattenArrays([
    taper('shell-%d' % g, 'steel', -0.115, 0.115, 0.04, 0.05, 0.004, z, 2, 4)
    + strap('strap-a-%d' % g, 'strap', 'rivet', -0.07, 0.02, 0.046, z, 0.03)
    + strap('strap-b-%d' % g, 'strap', 'rivet', 0.07, 0.02, 0.054, z, 0.03)
    for g in [0, 1]
    for z in [[-0.09, 0.09][g]]
  ]), { steel: 'steel', strap: 'leather-brown', rivet: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A pair of elbow guards, each a half-cylinder of sheet steel 120 mm long and 110 mm across, with a long strap
  // laid out each side to tie round the arm.
  h.compound('armguard_metal_sheets_elbows', 0.54, std.flattenArrays([
    shell('shell-%d' % g, 'steel', x - 0.06, x + 0.06, 0.055, 0.003, 0, 4)
    + strap('strap-a-%d' % g, 'strap', 'rivet', x - 0.03, 0.016, 0.058, 0, 0.17)
    + strap('strap-b-%d' % g, 'strap', 'rivet', x + 0.03, 0.016, 0.058, 0, 0.17)
    for g in [0, 1]
    for x in [[-0.08, 0.08][g]]
  ]), { steel: 'steel', strap: 'leather-brown', rivet: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A pair of sheet steel pauldrons, each a half-cylinder 170 mm front to back and 160 mm across over the
  // shoulder, a second plate riveted over its outer edge and two straps trailing from it.
  h.compound('armguard_metal_sheets_shoulders', 1.3, std.flattenArrays([
    shellZ('top-%d' % g, 'steel', -0.085, 0.085, 0.08, 0.003, x, -pi / 2, pi / 2, 5)
    + shellZ('under-%d' % g, 'steel', -0.075, 0.075, 0.083, 0.003, x, if s > 0 then 0.55 else -pi / 2, if s > 0 then pi / 2 else -0.55, 3)
    + [
      box('rivet-%d-%d' % [g, i], 'rivet', [x + s * 0.068 - 0.004, 0.05, -0.06 + i * 0.06 - 0.004], [x + s * 0.068 + 0.004, 0.058, -0.06 + i * 0.06 + 0.004])
      for i in [0, 1, 2]
    ] + [
      box('strap-a-%d' % g, 'strap', [x - s * 0.08 - 0.01, 0, -0.25], [x - s * 0.08 + 0.01, 0.003, -0.085]),
      box('strap-b-%d' % g, 'strap', [x - s * 0.08 - 0.01, 0, 0.085], [x - s * 0.08 + 0.01, 0.003, 0.25]),
      box('buckle-%d' % g, 'rivet', [x - s * 0.08 - 0.013, 0, 0.2], [x - s * 0.08 + 0.013, 0.006, 0.212]),
    ]
    for g in [0, 1]
    for s in [[-1, 1][g]]
    for x in [s * 0.12]
  ]), { steel: 'steel', strap: 'leather-brown', rivet: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A pair of improvised arm guards, each a stack of paper sheets 240 mm long, 100 mm wide and 12 mm thick bound
  // with three bands of duct tape.
  h.compound('armguard_paper', 0.23, std.flattenArrays([
    [
      box('sheets-%d-%d' % [g, i], if i % 2 == 1 then 'paper' else 'edge', [-0.12 + (i % 3) * 0.002, i * 0.002, z - 0.05 + (i % 2) * 0.002], [0.12 - (i % 2) * 0.003, (i + 1) * 0.002, z + 0.05])
      for i in std.range(0, 5)
    ] + [
      box('tape-%d-%d' % [g, b], 'tape', [x - 0.024, 0, z - 0.052], [x + 0.024, 0.014, z + 0.052])
      for b in [0, 1, 2]
      for x in [-0.08 + b * 0.08]
    ]
    for g in [0, 1]
    for z in [[-0.06, 0.06][g]]
  ]), { paper: 'paper-white', edge: 'cloth-cotton', tape: 'tape-grey' })
  + { voxelGrain: 0.004 },

  // A pair of scrap arm guards, each two mismatched steel scraps, 140 and 150 mm long and bent round the arm,
  // overlapping on a cotton rag lining, with a smaller patch and three string ties.
  h.compound('armguard_scrap', 0.8, std.flattenArrays([
    taper('lining-%d' % g, 'cloth', -0.17, 0.15, 0.034, 0.04, 0.003, z, 2, 6)
    + shell('fore-%d' % g, 'rust', -0.15, -0.01, 0.043, 0.004, z, 3)
    + shell('upper-%d' % g, 'galv', -0.02, 0.13, 0.05, 0.004, z, 4)
    + shell('patch-%d' % g, 'rust', 0.02, 0.07, 0.054, 0.003, z, 2, 0.6)
    + band('tie-a-%d' % g, 'string', -0.12, 0.004, 0.047, 0.003, z)
    + band('tie-b-%d' % g, 'string', -0.005, 0.004, 0.054, 0.004, z)
    + band('tie-c-%d' % g, 'string', 0.1, 0.004, 0.054, 0.003, z)
    for g in [0, 1]
    for z in [[-0.09, 0.09][g]]
  ]), { cloth: 'cloth-rag', rust: 'scrap-rusted', galv: 'steel-galvanised', string: 'cord-olive' })
  + { voxelGrain: 0.004 },

  // A pair of soft neoprene sleeves laid flat, each 380 mm long, 75 mm wide at the wrist and 105 mm at the top,
  // with a grey seam down the side and light grey bound cuffs.
  h.compound('armguard_soft', 0.15, std.flattenArrays([
    [
      sleeve('sleeve-%d' % g, 'neoprene', -0.19, 0.19, 0.075, 0.105, 0.008, z),
      sleeve('cuff-top-%d' % g, 'cuff', 0.165, 0.19, 0.101, 0.105, 0.01, z),
      sleeve('cuff-wrist-%d' % g, 'cuff', -0.19, -0.17, 0.075, 0.077, 0.01, z),
      box('seam-%d' % g, 'seam', [-0.17, 0.008, z + 0.025], [0.165, 0.009, z + 0.029]),
    ]
    for g in [0, 1]
    for z in [[-0.065, 0.065][g]]
  ]), { neoprene: 'neoprene-black', cuff: 'cloth-heather-grey', seam: 'felt-grey' })
  + { voxelGrain: 0.004 },

  // A pair of arm guards cut from tyre tread, each three curved chunks 100 mm long and 12 mm thick with tread
  // blocks on the outside, strung together with cord.
  h.compound('armguard_tire', 0.6, std.flattenArrays([
    std.flattenArrays([
      shell('chunk-%d-%d' % [g, c], 'rubber', x - 0.05, x + 0.05, 0.05, 0.012, z, 4)
      + [
        box('tread-%d-%d-%d' % [g, c, k], 'rubber', [x - 0.045 + k * 0.025, 0.06, z - 0.02], [x - 0.045 + k * 0.025 + 0.014, 0.068, z + 0.02])
        for k in [0, 1, 2, 3]
      ]
      for c in [0, 1, 2]
      for x in [-0.11 + c * 0.11]
    ]) + band('cord-a-%d' % g, 'cord', -0.055, 0.008, 0.062, 0.002, z)
    + band('cord-b-%d' % g, 'cord', 0.055, 0.008, 0.062, 0.002, z)
    + [box('cord-run-%d' % g, 'cord', [-0.16, 0.0, z + 0.062], [0.16, 0.004, z + 0.066])]
    for g in [0, 1]
    for z in [[-0.08, 0.08][g]]
  ]), { rubber: 'rubber-black', cord: 'cord-olive' })
  + { voxelGrain: 0.004 },

  // One hardened steel arm guard for one arm, a forearm plate, elbow cop and upper-arm plate in a row 600 mm long,
  // with bands of riveted mail across both elbow joints and buckled leather straps.
  h.compound('armor_ch_armguard', 3, fullArm('arm', 0, 0.005) + std.flattenArrays([
    shell('mail-%d-%d' % [k, i], 'mail', x0 + i * 0.006, x0 + i * 0.006 + 0.006, 0.05 + (i % 2) * 0.003, 0.003, 0, 8, 1.3)
    for k in [0, 1]
    for x0 in [[-0.078, 0.032][k]]
    for i in std.range(0, 7)
  ]), { plate: 'steel-blued', strap: 'leather-brown', buckle: 'steel-grey', mail: 'steel-grey' })
  + { voxelGrain: 0.004 },
]
