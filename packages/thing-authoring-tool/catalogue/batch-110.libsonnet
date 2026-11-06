local h = import '../compound.libsonnet';
local box = h.box;
// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);

// A strip of tape `w` wide lying across a flat face at height y, from [xa, za] to [xb, zb].
local tapeStrip(id, a, b, y, w=0.05) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  h.prism(id, 'tape', 'y', [[a[1] + nz, a[0] + nx], [b[1] + nz, b[0] + nx], [b[1] - nz, b[0] - nx], [a[1] - nz, a[0] - nx]], y, y + 0.002);

// A cardboard limb guard lying flat along z: a folded box tube with a darker corrugated edge showing at each open
// end and two bands of tape round it. Slots: board, edge, tape.
local limbGuard(p, cx, z0, z1, w, ht) = [
  box(p + 'tube', 'board', [cx - w / 2, 0, z0 + 0.006], [cx + w / 2, ht, z1 - 0.006]),
  box(p + 'end-a', 'edge', [cx - w / 2, 0, z0], [cx + w / 2, ht, z0 + 0.006]),
  box(p + 'end-b', 'edge', [cx - w / 2, 0, z1 - 0.006], [cx + w / 2, ht, z1]),
] + [
  box(p + 'tape-%d' % i, 'tape', [cx - w / 2 - 0.002, -0.0, z - 0.024], [cx + w / 2 + 0.002, ht + 0.002, z + 0.024])
  for i in [0, 1]
  for z in [z0 + (z1 - z0) * [0.25, 0.75][i]]
];

// A cardboard chest-and-back shell lying front up, neck towards -z: a flat back board under a front board curved
// across x, shoulder tape joining them and a corrugated edge round the neck. `w` across, `l` from neck to hem.
local cuirass(p, cz, w, l, y0) =
  local front = [[-w / 2 + 0.06, -l / 2 + 0.05], [w / 2 - 0.06, -l / 2 + 0.05], [w / 2, -l / 2 + 0.15], [w / 2, l / 2], [-w / 2, l / 2], [-w / 2, -l / 2 + 0.15]];
  local t = 0.012, r = 0.5;
  [
    h.prism(p + 'back', 'edge', 'y', [[q[1] + cz, q[0]] for q in front], y0, y0 + 0.008),
  ] + [
    sbox(p + 'back-shoulder-' + side, 'edge', [s * 0.09, y0, cz - l / 2], [s * (w / 2 - 0.06), y0 + 0.008, cz - l / 2 + 0.05])
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ]
  + h.curvedPlate(p + 'front', 'board', front, y0 + 0.008, t, r, 10, 0, cz)
  + [
    h.onCurvedFace(p + 'seam-%d' % i, 'tape', front, y0 + 0.008, t, r, [x, -l / 2 + 0.08], [x, l / 2 - 0.02], 0.045, 0, cz)
    for i in [0, 1, 2]
    for x in [[-w / 2 + 0.06, 0, w / 2 - 0.06][i]]
  ]
  + [
    h.onCurvedFace(p + 'band-%d-%d' % [i, j], 'tape', front, y0 + 0.008, t, r, [-w / 2 + w * j / 6, z], [-w / 2 + w * (j + 1) / 6, z], 0.045, 0, cz)
    for i in [0, 1]
    for z in [[-l * 0.1, l * 0.3][i]]
    for j in std.range(0, 5)
  ]
  + [
    sbox(p + 'shoulder-' + side, 'tape', [s * 0.09, y0 + 0.006, cz - l / 2 - 0.002], [s * (w / 2 - 0.06), y0 + 0.012, cz - l / 2 + 0.06])
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ];

// A cardboard crown standing on y: a band of `r` radius with `points` stepped triangular points, cut from one strip
// whose ends overlap at the back under a strip of tape. Slots: board, edge, tape.
local crown(r, ht, pointHt, points=8, wall=0.004, extension=0) =
  local span = 360 / points;
  local layers = 8;
  h.crescent('band', 'board', r - wall, r, 0, 360, 48, 0, ht)
  + h.crescent('rim', 'edge', r - wall - 0.001, r + 0.001, 0, 360, 48, 0, 0.004)
  + std.flattenArrays([
    h.crescent('point-%d-%d' % [i, k], 'board', r - wall, r, i * span + span * k / (2 * layers), (i + 1) * span - span * k / (2 * layers), 2, ht + pointHt * k / layers, ht + pointHt * (k + 1) / layers)
    for i in std.range(0, points - 1)
    for k in std.range(0, layers - 1)
  ])
  + h.crescent('seam', 'tape', r, r + 0.003, 180 - 5 - extension / 2, 180 + 5 + extension / 2, 4, 0.006, ht - 0.006)
  + (if extension > 0 then h.crescent('insert', 'edge', r - wall - 0.002, r - wall, 180 - extension / 2 - 4, 180 + extension / 2 + 4, 4, 0.002, ht - 0.002) else []);

// Small white stars in rows on the flag's blue field, each a cross of two boxes at height y.
local star(id, x, z, y, s=0.009) = [
  box(id + '-a', 'star', [x - s, y, z - s * 0.35], [x + s, y + 0.002, z + s * 0.35]),
  box(id + '-b', 'star', [x - s * 0.35, y, z - s], [x + s * 0.35, y + 0.002, z + s]),
];

[
  // A full set of cardboard armour laid out flat, front up, 1170 mm from collar to ankle and 700 mm across: a curved
  // chest-and-back shell taped at the shoulders and sides, two arm tubes beside it and two leg tubes below it, all
  // folded from corrugated board and banded with grey tape.
  h.compound('armor_cardboard', 2,
             cuirass('body-', -0.29, 0.44, 0.58, 0)
             + limbGuard('arm-l-', -0.31, -0.55, -0.05, 0.13, 0.1)
             + limbGuard('arm-r-', 0.31, -0.55, -0.05, 0.13, 0.1)
             + limbGuard('leg-l-', -0.11, 0.02, 0.62, 0.17, 0.12)
             + limbGuard('leg-r-', 0.11, 0.02, 0.62, 0.17, 0.12),
             { board: 'paperboard-tan', edge: 'paperboard-brown', tape: 'tape-grey' })
  + { voxelGrain: 0.006 },

  // A cardboard cuirass lying front up, 600 mm from the neck to the hem and 460 mm across: a front board curved
  // across the chest over a flat back board, joined by tape at the shoulders, with taped seams and bands across the
  // front where the layers are glued.
  h.compound('armor_cardboard_cuirass', 0.7, cuirass('', 0, 0.46, 0.6, 0), { board: 'paperboard-tan', edge: 'paperboard-brown', tape: 'tape-grey' })
  + { voxelGrain: 0.004 },

  // A hand-cut cardboard badge lying face up, 80 mm tall and 66 mm across: a shield shape with a darker cut edge,
  // marker lettering that shrinks along each line, and a brass safety pin on the back.
  h.compound('badge_cardboard', 0.006, [
    h.prism('rim', 'edge', 'y', [[-0.04, -0.033], [-0.04, 0.033], [0.018, 0.033], [0.04, 0], [0.018, -0.033]], 0, 0.003),
    h.prism('face', 'board', 'y', [[-0.037, -0.03], [-0.037, 0.03], [0.016, 0.03], [0.035, 0], [0.016, -0.03]], 0.003, 0.004),
    box('pin-bar', 'pin', [-0.022, -0.002, -0.025], [0.022, 0, -0.022]),
    box('pin-head', 'pin', [-0.026, -0.003, -0.027], [-0.02, 0, -0.02]),
  ] + [
    box('letter-%d-%d' % [i, j], 'ink', [x0 + j * 0.0105 * s, 0.004, z0 - 0.0035 * s], [x0 + j * 0.0105 * s + 0.007 * s, 0.0048, z0 + 0.0035 * s])
    for i in [0, 1, 2]
    for z0 in [[-0.02, -0.006, 0.008][i]]
    for x0 in [-0.024]
    for j in std.range(0, [5, 6, 4][i] - 1)
    for s in [std.max(0.35, 1 - j * 0.14)]
  ], { board: 'paperboard-tan', edge: 'paperboard-brown', ink: 'cloth-black', pin: 'brass-polished' })
  + { voxelGrain: 0.002 },

  // A cardboard crown standing upright, 190 mm across and 110 mm tall: a 60 mm band with eight cut points, its
  // ends overlapping at the back under a strip of tape.
  h.compound('cardboard_crown', 0.03, crown(0.095, 0.06, 0.05), { board: 'paperboard-tan', edge: 'paperboard-brown', tape: 'tape-grey' })
  + { voxelGrain: 0.002 },

  // The same crown let out to fit over a hat, 220 mm across: a darker strip of board taped in at the back widens the
  // band, so the seam tape is long.
  h.compound('cardboard_crown_loose', 0.04, crown(0.11, 0.06, 0.05, 8, 0.004, 24), { board: 'paperboard-tan', edge: 'paperboard-brown', tape: 'tape-grey' })
  + { voxelGrain: 0.002 },

  // A cardboard great helm standing upright, face on +z, 330 mm tall and 260 mm across: a flat-topped drum of
  // board with a flat face plate, a dark eye slit under a brow band, breathing holes low on the right, a taped cross
  // on the face and over the crown, and the foil lining showing at the bottom edge.
  h.compound('helmet_cardboard', 0.64, [
    h.turned('shell', 'board', 'y', [[0, 0], [0, 0.128], [0.29, 0.128], [0.315, 0.112], [0.33, 0.07], [0.332, 0]]),
    { id: 'lining', slot: 'lining', kind: 'turned', axis: 'y', profile: [[0, 0.118], [0, 0.13], [0.012, 0.13], [0.012, 0.118], [0, 0.118]], origin: [0, -0.004, 0] },
    box('face', 'board', [-0.105, 0, 0], [0.105, 0.29, 0.134]),
    box('slit-l', 'slit', [-0.095, 0.2, 0.134], [-0.014, 0.214, 0.136]),
    box('slit-r', 'slit', [0.014, 0.2, 0.134], [0.095, 0.214, 0.136]),
    box('brow', 'edge', [-0.105, 0.214, 0.134], [0.105, 0.23, 0.142]),
    box('cross-v', 'tape', [-0.014, 0.012, 0.134], [0.014, 0.2, 0.136]),
    box('cross-h', 'tape', [-0.105, 0.13, 0.134], [0.105, 0.158, 0.136]),
    box('crown-tape-x', 'tape', [-0.105, 0.33, -0.022], [0.105, 0.334, 0.022]),
    box('crown-tape-z', 'tape', [-0.022, 0.33, -0.105], [0.022, 0.334, 0.105]),
  ] + [
    box('hole-%d-%d' % [i, j], 'slit', [0.035 + j * 0.018, 0.04 + i * 0.018, 0.134], [0.045 + j * 0.018, 0.05 + i * 0.018, 0.136])
    for i in [0, 1, 2]
    for j in [0, 1, 2]
    if i + j < 4
  ], { board: 'paperboard-tan', edge: 'paperboard-brown', tape: 'tape-grey', slit: 'screen-black', lining: 'alu-bare' })
  + { voxelGrain: 0.004 },

  // A large flag folded into a thick triangle, 560 mm along the long edge and 280 mm deep: the blue field with
  // white stars on top, red and white stripes showing along the long edge where the last fold tucks in.
  h.compound('american_flag', 0.8, [
    h.prism('field', 'field', 'y', [[-0.14, -0.28], [-0.14, 0.28], [0.14, 0]], 0, 0.04),
  ] + [
    h.prism('stripe-%d' % i, ['stripe-red', 'stripe-white'][i % 2], 'y', [[z0, -0.25 + i * 0.002], [z0, 0.25 - i * 0.002], [z0 + 0.0055, 0.25 - i * 0.002], [z0 + 0.0055, -0.25 + i * 0.002]], 0.004, 0.04)
    for i in std.range(0, 3)
    for z0 in [-0.162 + i * 0.0055]
  ] + std.flattenArrays([
    star('star-%d-%d' % [i, j], (j - (n - 1) / 2) * 0.055, z, 0.04)
    for i in std.range(0, 4)
    for z in [-0.11 + i * 0.048]
    for n in [std.floor((2 * (0.14 - z) - 0.07) / 0.055) + 1]
    for j in std.range(0, n - 1)
  ]), { field: 'cloth-navy', star: 'cloth-white', 'stripe-red': 'cloth-red', 'stripe-white': 'cloth-white' })
  + { voxelGrain: 0.004 },

  // A long crimson cape folded flat, 400 mm by 320 mm and 70 mm tall in four layers, with its standing collar
  // folded on top and two ribbon ties hanging over the front edge.
  h.compound('cape_catholic', 1.9, h.foldedGarment(0.4, 0.32, 0.064, 4) + [
    box('collar', 'collar', [-0.13, 0.064, -0.14], [0.13, 0.072, -0.08]),
    box('collar-fold', 'collar', [-0.13, 0.072, -0.14], [0.13, 0.076, -0.125]),
    box('tie-l', 'tie', [-0.04, 0.064, -0.08], [-0.028, 0.068, 0.165]),
    box('tie-r', 'tie', [0.028, 0.064, -0.08], [0.04, 0.068, 0.165]),
    box('tie-l-drop', 'tie', [-0.04, 0.02, 0.16], [-0.028, 0.068, 0.165]),
    box('tie-r-drop', 'tie', [0.028, 0.03, 0.16], [0.04, 0.068, 0.165]),
  ], { cloth: 'cloth-red', collar: 'cloth-red', tie: 'velvet-red' })
  + { voxelGrain: 0.004 },
]
