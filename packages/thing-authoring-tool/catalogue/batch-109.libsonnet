local h = import '../compound.libsonnet';
local box = h.box;
// A flat convex plate lying on y, its outline given as [x, z] points.
local flat(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y0, y1);

// One splint guard lying open side down, wide end towards -z: a canvas shell curved across x, `len` long and `w0` to
// `w1` across, with `n` steel splints riveted along it, leather binding at both ends and buckled straps round it at
// each z in `straps`. Slots: canvas, splint, rivet, edge, strap, buckle.
local splintGuard(p, cx, len, w0, w1, n, r, straps) =
  local outline = [[-w0 / 2, -len / 2], [w0 / 2, -len / 2], [w1 / 2, len / 2], [-w1 / 2, len / 2]];
  local y0 = 0, t = 0.006;
  local face(id, slot, a, b, w) = h.onCurvedFace(p + id, slot, outline, y0, t, r, a, b, w, cx);
  local top(x) = h.curvedTopAt(outline, y0, t, r, x);
  local halfAt(z) = (w0 + (w1 - w0) * (z + len / 2) / len) / 2;
  // A band across the shell at z, laid strip by strip so it follows the curve.
  local across(id, slot, z, w) = [
    local half = halfAt(z) - 0.002;
    face('%s-%d' % [id, i], slot, [-half + 2 * half * i / 6, z], [-half + 2 * half * (i + 1) / 6, z], w)
    for i in std.range(0, 5)
  ];
  local splintX = [(i - (n - 1) / 2) * (w1 - 0.03) / (n - 1) for i in std.range(0, n - 1)];
  local rivetZ = [-len / 2 + 0.035, 0, len / 2 - 0.035];
  h.curvedPlate(p + 'shell', 'canvas', outline, y0, t, r, 8, cx)
  + [face('splint-%d' % i, 'splint', [splintX[i], -len / 2 + 0.02], [splintX[i], len / 2 - 0.02], 0.017) for i in std.range(0, n - 1)]
  + [
    box(p + 'rivet-%d-%d' % [i, j], 'rivet', [cx + splintX[i] - 0.003, top(splintX[i]) + 0.001, rivetZ[j] - 0.003], [cx + splintX[i] + 0.003, top(splintX[i]) + 0.005, rivetZ[j] + 0.003])
    for i in std.range(0, n - 1)
    for j in [0, 1, 2]
  ]
  + across('edge-top', 'edge', -len / 2 + 0.008, 0.014)
  + across('edge-foot', 'edge', len / 2 - 0.008, 0.014)
  + std.flattenArrays([across('strap-%d' % k, 'strap', straps[k], 0.022) for k in std.range(0, std.length(straps) - 1)])
  + [
    box(p + 'tail-%d' % k, 'strap', [cx + halfAt(straps[k]), 0, straps[k] - 0.011], [cx + halfAt(straps[k]) + 0.05, 0.004, straps[k] + 0.011])
    for k in std.range(0, std.length(straps) - 1)
  ]
  + [
    box(p + 'buckle-%d' % k, 'buckle', [cx - halfAt(straps[k]) - 0.012, 0, straps[k] - 0.014], [cx - halfAt(straps[k]) + 0.002, 0.012, straps[k] + 0.014])
    for k in std.range(0, std.length(straps) - 1)
  ];

// One joint guard lying convex side up, top towards -z: a domed steel cup over the joint, a curved lame above and below
// it, a round wing on the outer side (`side` = -1 or 1) and a leather strap behind each lame with a buckle, all at
// scale `s` (1 is a knee guard about 200 mm long). Slots: plate, rivet, strap, buckle.
local cop(p, cx, s, side) =
  local lame(id, z0, z1, w0, w1) = h.curvedPlate(p + id, 'plate', [[-w0 / 2, z0], [w0 / 2, z0], [w1 / 2, z1], [-w1 / 2, z1]], 0.004, 0.002, 0.07 * s, 6, cx);
  local wing = [[0.03, -0.035], [0.06, -0.045], [0.085, -0.03], [0.095, 0], [0.085, 0.03], [0.06, 0.045], [0.03, 0.035]];
  lame('lame-top', -0.1 * s, -0.04 * s, 0.075 * s, 0.1 * s)
  + lame('lame-foot', 0.04 * s, 0.095 * s, 0.1 * s, 0.07 * s)
  + [
    h.turned(p + 'dome', 'plate', 'y', [[0, 0], [0, 0.056 * s], [0.012 * s, 0.052 * s], [0.024 * s, 0.04 * s], [0.032 * s, 0.022 * s], [0.035 * s, 0]], [cx, 0.008, 0]),
    flat(p + 'wing', 'plate', [[cx + side * q[0] * s, q[1] * s] for q in wing], 0.006, 0.009),
    h.disc(p + 'boss', 'rivet', 0.006 * s, 0.008 + 0.034 * s, 0.008 + 0.038 * s, cx, 0),
  ]
  + [
    box(p + 'rivet-%d' % i, 'rivet', [cx + q[0] * s - 0.003, 0.008 + q[2] * s, q[1] * s - 0.003], [cx + q[0] * s + 0.003, 0.012 + q[2] * s, q[1] * s + 0.003])
    for i in std.range(0, 5)
    for q in [[[-0.03, -0.07, 0.016], [0.03, -0.07, 0.016], [-0.035, 0.07, 0.016], [0.035, 0.07, 0.016], [side * 0.075, -0.012, 0], [side * 0.075, 0.012, 0]][i]]
  ]
  + std.flattenArrays([
    [
      box(p + 'strap-%d' % k, 'strap', [cx - 0.11 * s, 0, z - 0.01 * s], [cx + 0.11 * s, 0.003, z + 0.01 * s]),
      box(p + 'buckle-%d' % k, 'buckle', [cx - side * 0.11 * s - 0.008, 0, z - 0.013 * s], [cx - side * 0.11 * s + 0.008, 0.008, z + 0.013 * s]),
    ]
    for k in [0, 1]
    for z in [[-0.075 * s, 0.07 * s][k]]
  ]);

// An arc lying along z from z0 to z1, crown up round an axis at height yc: inner radius `r`, thickness `t`, spanning
// `a` degrees either side of the top, from `n` flat facets because a prism must be convex.
local arcZ(id, slot, r, t, a, z0, z1, cx, yc, n=8) =
  local rad = a * std.pi / 180;
  [
    local th0 = -rad + 2 * rad * i / n, th1 = -rad + 2 * rad * (i + 1) / n;
    h.prism('%s-%d' % [id, i], slot, 'z', [
      [cx + r * std.sin(th0), yc + r * std.cos(th0)],
      [cx + r * std.sin(th1), yc + r * std.cos(th1)],
      [cx + (r + t) * std.sin(th1), yc + (r + t) * std.cos(th1)],
      [cx + (r + t) * std.sin(th0), yc + (r + t) * std.cos(th0)],
    ], z0, z1)
    for i in std.range(0, n - 1)
  ];

// One shoulder guard lying crown up, collar edge towards -z: an arched leather backing with its edges on the floor,
// a narrow cap plate at the collar and three lames widening down the arm riveted to it, the odd lames lapping over
// their neighbours, and two leather points running from the collar to the floor for lacing it to a brigandine.
// Slots: backing, plate, rivet, strap.
local spaulder(p, cx) =
  local r = 0.09, yc = -r * std.cos(62 * std.pi / 180);
  local rows = [[-0.095, -0.035], [-0.045, 0.01], [0.0, 0.055], [0.045, 0.1]];
  // Even lames lie on the backing; odd ones ride one plate higher so they lap over both neighbours.
  local rIn(i) = r + 0.003 + (i % 2) * 0.003;
  arcZ(p + 'backing', 'backing', r, 0.003, 62, -0.1, 0.105, cx, yc)
  + std.flattenArrays([arcZ('%slame-%d' % [p, i], 'plate', rIn(i), 0.003, [44, 50, 55, 60][i], rows[i][0], rows[i][1], cx, yc) for i in std.range(0, 3)])
  + [
    local ang = sx * 40 * std.pi / 180, z = (rows[i][0] + rows[i][1]) / 2 + 0.008, rr = rIn(i) + 0.003;
    box('%srivet-%d-%d' % [p, i, sx + 1], 'rivet', [cx + rr * std.sin(ang) - 0.003, yc + rr * std.cos(ang) - 0.001, z - 0.003], [cx + rr * std.sin(ang) + 0.003, yc + rr * std.cos(ang) + 0.004, z + 0.003])
    for i in std.range(0, 3)
    for sx in [-1, 0, 1]
  ]
  + [
    local y = yc + std.sqrt((r + 0.003) * (r + 0.003) - x * x);
    h.prism('%spoint-%d' % [p, k], 'strap', 'x', [[y - 0.003, -0.1], [y + 0.001, -0.1], [0.004, -0.15], [0, -0.15]], cx + x - 0.006, cx + x + 0.006)
    for k in [0, 1]
    for x in [[-0.025, 0.025][k]]
  ];

// One glove lying back up, fingers towards -z, thumb on side `side`: a canvas glove with a curved steel plate over
// the back of the hand, two riveted plates down each finger and the thumb, and a cuff closed by a strap and buckle.
// Slots: canvas, plate, rivet, strap, buckle.
local glove(p, cx, side) =
  local fingers = [[-0.03, 0.088, 0.017], [-0.01, 0.1, 0.018], [0.01, 0.095, 0.018], [0.03, 0.075, 0.016]];
  local fx(f) = cx + side * f[0];
  local thumbPlates = [
    [[0.045, 0.02], [0.068, 0.0], [0.072, -0.015], [0.048, 0.0]],
    [[0.07, -0.02], [0.082, -0.038], [0.07, -0.046], [0.06, -0.025]],
  ];
  [
    box(p + 'palm', 'canvas', [cx - 0.042, 0, -0.04], [cx + 0.042, 0.022, 0.055]),
    box(p + 'cuff', 'canvas', [cx - 0.05, 0, 0.055], [cx + 0.05, 0.026, 0.13]),
    flat(p + 'thumb', 'canvas', [[cx + side * 0.038, 0.035], [cx + side * 0.06, 0.02], [cx + side * 0.085, -0.03], [cx + side * 0.075, -0.05], [cx + side * 0.058, -0.045], [cx + side * 0.038, -0.01]], 0, 0.018),
    box(p + 'cuff-strap', 'strap', [cx - 0.052, 0.026, 0.09], [cx + 0.052, 0.029, 0.11]),
    box(p + 'cuff-buckle', 'buckle', [cx - side * 0.05 - 0.008, 0.02, 0.087], [cx - side * 0.05 + 0.008, 0.032, 0.113]),
  ]
  + h.curvedPlate(p + 'back', 'plate', [[-0.04, -0.035], [0.04, -0.035], [0.042, 0.045], [-0.042, 0.045]], 0.022, 0.003, 0.08, 6, cx)
  + [
    box(p + 'finger-%d' % i, 'canvas', [fx(fingers[i]) - fingers[i][2] / 2, 0, -0.04 - fingers[i][1]], [fx(fingers[i]) + fingers[i][2] / 2, 0.016, -0.038])
    for i in std.range(0, 3)
  ]
  + [
    local f = fingers[i];
    local z0 = -0.042 - f[1] * (0.05 + 0.5 * j), z1 = -0.042 - f[1] * (0.45 + 0.5 * j);
    box('%sfplate-%d-%d' % [p, i, j], 'plate', [fx(f) - f[2] / 2 + 0.001, 0.016, z1], [fx(f) + f[2] / 2 - 0.001, 0.019, z0])
    for i in std.range(0, 3)
    for j in [0, 1]
  ]
  + [
    flat(p + 'tplate-%d' % j, 'plate', [[cx + side * q[0], q[1]] for q in thumbPlates[j]], 0.018, 0.021)
    for j in [0, 1]
  ]
  + [
    box('%srivet-%d' % [p, i], 'rivet', [cx + q[0] - 0.0025, 0.025 + q[2], q[1] - 0.0025], [cx + q[0] + 0.0025, 0.029 + q[2], q[1] + 0.0025])
    for i in std.range(0, 3)
    for q in [[[-0.03, -0.028, 0], [0.03, -0.028, 0], [-0.032, 0.038, 0], [0.032, 0.038, 0]][i]]
  ];

local steelFinishes(steel) = { plate: steel, rivet: steel, strap: 'leather-brown', buckle: 'steel', backing: 'leather-brown' };
local splintFinishes(steel) = { canvas: 'cloth-canvas', splint: steel, rivet: steel, edge: 'leather-brown', strap: 'leather-brown', buckle: 'steel' };
[
  // A pair of medium steel knee guards laid side by side, convex side up, each 200 mm from top to foot and 190 mm
  // across the wing: a domed cup over the knee, a curved lame above and below, a round wing on the outer side and two
  // buckled leather straps. The tempered pair shares this model with its own steel finish.
  h.compound('mc_knee_guards', 1.5, cop('l-', -0.125, 1, -1) + cop('r-', 0.125, 1, 1), steelFinishes('steel-grey'))
  + { voxelGrain: 0.004 },

  // A pair of medium steel shoulder guards laid side by side, convex side up, each 200 mm from collar to arm and
  // 160 mm across: a cap plate and three overlapping lames riveted to an arched leather backing, with two leather
  // lacing points at the collar.
  // The tempered pair shares this model with its own steel finish.
  h.compound('mc_shoulder_guards', 1.4, spaulder('l-', -0.1) + spaulder('r-', 0.1), steelFinishes('steel-grey'))
  + { voxelGrain: 0.004 },

  // A pair of medium steel splint vambraces laid side by side, open side down, each 280 mm from elbow to wrist and
  // 140 mm across at the elbow: canvas shells with five riveted steel splints, leather binding and two buckled straps.
  // The tempered pair shares this model with its own splint finish.
  h.compound('mc_vambrace_brigandine', 1.7, splintGuard('l-', -0.08, 0.28, 0.14, 0.105, 5, 0.08, [-0.065, 0.065]) + splintGuard('r-', 0.08, 0.28, 0.14, 0.105, 5, 0.08, [-0.065, 0.065]), splintFinishes('steel-grey'))
  + { voxelGrain: 0.004 },

  // A pair of tempered steel brigandine gloves laid side by side, back up, each 240 mm from cuff to fingertip: canvas
  // gloves with a curved steel plate over the back of the hand, two plates down each finger and the thumb, and a
  // buckled cuff strap.
  h.compound('qt_brigandine_hands', 0.52, glove('l-', -0.1, 1) + glove('r-', 0.1, -1), { canvas: 'cloth-canvas' } + steelFinishes('steel-heat-tint'))
  + { voxelGrain: 0.004 },

  // A pair of tempered steel elbow guards laid side by side, convex side up, each 150 mm from top to foot: a domed cup
  // over the elbow, a curved lame above and below, a round wing on the outer side and two buckled leather straps.
  h.compound('qt_elbow_guards', 0.8, cop('l-', -0.095, 0.75, -1) + cop('r-', 0.095, 0.75, 1), steelFinishes('steel-heat-tint'))
  + { voxelGrain: 0.004 },

  // A pair of tempered steel splint greaves laid side by side, open side down, each 380 mm from knee to ankle and
  // 160 mm across at the calf: canvas shells with six riveted steel splints, leather binding and three buckled straps.
  h.compound('qt_greaves_brigandine', 2.5, splintGuard('l-', -0.095, 0.38, 0.16, 0.115, 6, 0.09, [-0.13, 0, 0.13]) + splintGuard('r-', 0.095, 0.38, 0.16, 0.115, 6, 0.09, [-0.13, 0, 0.13]), splintFinishes('steel-heat-tint'))
  + { voxelGrain: 0.004 },
]
