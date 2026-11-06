local h = import '../compound.libsonnet';
local box = h.box;
// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);

// One sock laid flat on its side, the leg `leg` long up the -z side and `w` across, the foot `foot` long running out
// along +x, its corner at (x, z) and its underside at y. Slots: sock, cuff, heel.
local sock(p, x, z, y, leg, foot, w, t) =
  local o(pts) = [[q[0] + z, q[1] + x] for q in pts];
  local k = w / 0.082;
  [
    h.prism(p + 'leg', 'sock', 'y', o([[-leg, 0], [-leg, w * 1.1], [0.001, w * 1.1], [0.001, 0]]), y, y + t),
    h.prism(p + 'foot', 'sock', 'y', o([[0, 0], [0, foot - 0.04 * k], [0.012 * k, foot - 0.012 * k], [w / 2, foot], [w - 0.012 * k, foot - 0.012 * k], [w, foot - 0.04 * k], [w, 0.03 * k], [w - 0.014 * k, 0.002], [w / 2, -0.008 * k], [0.012 * k, -0.006 * k]]), y, y + t),
    h.prism(p + 'cuff', 'cuff', 'y', o([[-leg, 0], [-leg, w * 1.1], [-leg + 0.03, w * 1.1], [-leg + 0.03, 0]]), y + t, y + t + 0.002),
    h.prism(p + 'heel', 'heel', 'y', o([[w * 0.42, 0.002], [w * 0.42, 0.03 * k], [w - 0.002, 0.03 * k], [w - 0.002, 0.026 * k], [w - 0.014 * k, 0.004], [w * 0.55, -0.004 * k]]), y + t, y + t + 0.002),
    h.prism(p + 'toe', 'heel', 'y', o([[0.002, foot - 0.044 * k], [w - 0.002, foot - 0.044 * k], [w - 0.002, foot - 0.04 * k], [w - 0.012 * k, foot - 0.014 * k], [w / 2, foot - 0.003], [0.012 * k, foot - 0.014 * k]]), y + t, y + t + 0.002),
  ];
// A pair of socks, one lying across the other.
local sockPair(leg, foot, w, t) = sock('a-', -0.1, -0.02, 0, leg, foot, w, t) + sock('b-', -0.055, 0.045, t + 0.001, leg, foot, w, t);

// One splint arm guard lying open side down, elbow end towards -z: a canvas shell curved across x, five steel splints
// riveted along it, leather binding at both ends and two buckled straps round it. Slots: canvas, splint, rivet,
// edge, strap, buckle.
local splintGuard(p, cx) =
  local outline = [[-0.075, -0.15], [0.075, -0.15], [0.056, 0.15], [-0.056, 0.15]];
  local y0 = 0, t = 0.006, r = 0.085, n = 8;
  local face(id, slot, a, b, w) = h.onCurvedFace(p + id, slot, outline, y0, t, r, a, b, w, cx);
  local top(x) = h.curvedTopAt(outline, y0, t, r, x);
  // A band across the shell at z, laid strip by strip so it follows the curve.
  local across(id, slot, z, half, w) = [
    face('%s-%d' % [id, i], slot, [-half + 2 * half * i / 6, z], [-half + 2 * half * (i + 1) / 6, z], w)
    for i in std.range(0, 5)
  ];
  local splintX = [-0.048, -0.024, 0, 0.024, 0.048];
  h.curvedPlate(p + 'shell', 'canvas', outline, y0, t, r, n, cx)
  + [face('splint-%d' % i, 'splint', [splintX[i] * (1 - 0.1), -0.13], [splintX[i] * (1 - 0.1), 0.13], 0.017) for i in std.range(0, 4)]
  + [
    box(p + 'rivet-%d-%d' % [i, j], 'rivet', [cx + splintX[i] * 0.9 - 0.003, top(splintX[i] * 0.9) + 0.001, z - 0.003], [cx + splintX[i] * 0.9 + 0.003, top(splintX[i] * 0.9) + 0.005, z + 0.003])
    for i in std.range(0, 4)
    for j in [0, 1, 2]
    for z in [[-0.115, 0, 0.115][j]]
  ]
  + across('edge-elbow', 'edge', -0.142, 0.072, 0.014)
  + across('edge-wrist', 'edge', 0.142, 0.054, 0.014)
  + std.flattenArrays([across('strap-%d' % k, 'strap', [-0.07, 0.07][k], [0.07, 0.06][k], 0.022) for k in [0, 1]])
  + [
    box(p + 'tail-%d' % k, 'strap', [cx + [0.07, 0.06][k], 0, [-0.07, 0.07][k] - 0.011], [cx + [0.07, 0.06][k] + 0.05, 0.004, [-0.07, 0.07][k] + 0.011])
    for k in [0, 1]
  ]
  + [
    box(p + 'buckle-%d' % k, 'buckle', [cx - [0.07, 0.06][k] - 0.012, 0, [-0.07, 0.07][k] - 0.014], [cx - [0.07, 0.06][k] + 0.002, 0.012, [-0.07, 0.07][k] + 0.014])
    for k in [0, 1]
  ];

// One half of a brigandine's front or the whole back, lying flat, neck towards -z and hem towards +z: a shoulder
// strap and a body cut away under the arm, as convex prisms. `s` picks the side, `x0` the edge at the centre.
local vestHalf(p, slot, s, x0, y0, y1, grow=0) = [
  h.prism(p + 'shoulder', slot, 'y', [[-0.28 - grow, s * 0.07], [-0.28 - grow, s * (0.15 + grow)], [-0.12, s * (0.17 + grow)], [-0.12, s * 0.07]], y0, y1),
  h.prism(p + 'body', slot, 'y', [[-0.1, s * x0], [-0.12, s * 0.07], [-0.12, s * (0.17 + grow)], [-0.08, s * (0.23 + grow)], [0.28 + grow, s * (0.23 + grow)], [0.28 + grow, s * x0]], y0, y1),
];
// Rivet heads on one front half, in rows over the hidden plates.
local vestRivets(p, s, y) = [
  box(p + 'rivet-%d-%d' % [i, j], 'rivet', [s * (0.025 + j * 0.03) - 0.004, y, -0.06 + i * 0.034 - 0.004], [s * (0.025 + j * 0.03) + 0.004, y + 0.004, -0.06 + i * 0.034 + 0.004])
  for i in std.range(0, 9)
  for j in std.range(0, 6)
] + [
  box(p + 'shoulder-rivet-%d-%d' % [i, j], 'rivet', [s * (0.09 + j * 0.04) - 0.004, y, -0.26 + i * 0.04 - 0.004], [s * (0.09 + j * 0.04) + 0.004, y + 0.004, -0.26 + i * 0.04 + 0.004])
  for i in std.range(0, 3)
  for j in [0, 1]
];

local splintGuards = splintGuard('l-', -0.085) + splintGuard('r-', 0.085);
local splintFinishes(steel) = { canvas: 'cloth-canvas', splint: steel, rivet: steel, edge: 'leather-brown', strap: 'leather-brown', buckle: 'steel' };
[
  // A pair of children's cotton socks laid flat, one across the other, each 150 mm from cuff to heel and 170 mm
  // from heel to toe.
  h.compound('xssocks', 0.033, sockPair(0.15, 0.17, 0.064, 0.004), { sock: 'cloth-white', cuff: 'cloth-white', heel: 'felt-grey' })
  + { voxelGrain: 0.004 },

  // A pair of children's wool socks laid flat, thicker than the cotton pair, 150 mm from cuff to heel and 170 mm from
  // heel to toe.
  h.compound('xssocks_wool', 0.051, sockPair(0.15, 0.17, 0.068, 0.006), { sock: 'wool-grey', cuff: 'felt-grey', heel: 'cloth-brown' })
  + { voxelGrain: 0.004 },

  // A pair of mild steel splint arm guards laid side by side, open side down, each 300 mm from elbow to wrist and
  // 150 mm across at the elbow: canvas shells with five riveted steel splints, leather binding and two buckled straps.
  // The other steels share this model with their own splint finish.
  h.compound('armguard_lc_brigandine', 1.9, splintGuards, splintFinishes('steel-bright'))
  + { voxelGrain: 0.004 },

  // A hardened steel brigandine laid flat, front up, 600 mm from the shoulder to the hem and 460 mm across: a canvas
  // vest with rows of dark rivet heads holding the plates inside, opening down the front and closed with three
  // buckled straps, with side straps at the waist.
  h.compound('armor_ch_brigandine', 4.1, std.flattenArrays([
    vestHalf('back-' + side + '-', 'canvas', s, 0, 0, 0.012, 0.004) + vestHalf('front-' + side + '-', 'canvas', s, 0.004, 0.012, 0.028) + vestRivets(side + '-', s, 0.028)
    + [
      sbox(side + '-hem', 'edge', [s * 0.004, 0.028, 0.266], [s * 0.23, 0.031, 0.28]),
      sbox(side + '-side-strap-0', 'strap', [s * 0.23, 0.004, 0.08], [s * 0.29, 0.008, 0.1]),
      sbox(side + '-side-strap-1', 'strap', [s * 0.23, 0.004, 0.2], [s * 0.29, 0.008, 0.22]),
    ]
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ]) + std.flattenArrays([
    [
      box('front-strap-%d' % i, 'strap', [-0.05, 0.028, z - 0.01], [0.035, 0.032, z + 0.01]),
      box('front-buckle-%d' % i, 'buckle', [0.03, 0.028, z - 0.013], [0.044, 0.036, z + 0.013]),
    ]
    for i in [0, 1, 2]
    for z in [[-0.03, 0.08, 0.19][i]]
  ]), { canvas: 'cloth-canvas', rivet: 'steel-parkerized', edge: 'leather-brown', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },
]
