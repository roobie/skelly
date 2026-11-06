local h = import '../compound.libsonnet';
local box = h.box;
// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);

// One splint guard lying open side down along z, centred on (cx, cz): a canvas shell `len` long, `w0` across at the
// -z end and `w1` at the +z end, curved across x with radius r, `n` steel splints riveted along it alternating with
// bare canvas, leather binding at both ends and a buckled strap round it at each z in `straps`.
// Slots: canvas, splint, rivet, edge, strap, buckle.
local splintGuard(p, cx, cz, len, w0, w1, r, n, straps) =
  local outline = [[-w0 / 2, -len / 2], [w0 / 2, -len / 2], [w1 / 2, len / 2], [-w1 / 2, len / 2]];
  local y0 = 0, t = 0.006;
  local face(id, slot, a, b, w) = h.onCurvedFace(p + id, slot, outline, y0, t, r, a, b, w, cx, cz);
  local top(x) = h.curvedTopAt(outline, y0, t, r, x);
  local half(z) = (w0 + (w1 - w0) * (z + len / 2) / len) / 2;
  local across(id, slot, z, w) = [
    face('%s-%d' % [id, i], slot, [-half(z) * 0.96 + 2 * half(z) * 0.96 * i / 6, z], [-half(z) * 0.96 + 2 * half(z) * 0.96 * (i + 1) / 6, z], w)
    for i in std.range(0, 5)
  ];
  // Splints fan with the taper, so each runs from its share of the wide end to its share of the narrow end.
  local share(i) = -0.8 + 1.6 * i / (n - 1);
  local sw = std.min(w0, w1) * 0.8 / (2 * n - 1);
  local rz = [-len / 2 + 0.03, len / 2 - 0.03];
  h.curvedPlate(p + 'shell', 'canvas', outline, y0, t, r, 8, cx, cz)
  + [face('splint-%d' % i, 'splint', [share(i) * half(-len / 2 + 0.014), -len / 2 + 0.014], [share(i) * half(len / 2 - 0.014), len / 2 - 0.014], sw) for i in std.range(0, n - 1)]
  + [
    local x = share(i) * half(z);
    box(p + 'rivet-%d-%d' % [i, j], 'rivet', [cx + x - 0.003, top(x) + 0.001, cz + z - 0.003], [cx + x + 0.003, top(x) + 0.005, cz + z + 0.003])
    for i in std.range(0, n - 1)
    for j in [0, 1]
    for z in [rz[j]]
  ]
  + across('edge-top', 'edge', -len / 2 + 0.007, 0.014)
  + across('edge-bottom', 'edge', len / 2 - 0.007, 0.014)
  + std.flattenArrays([across('strap-%d' % k, 'strap', straps[k], 0.022) for k in std.range(0, std.length(straps) - 1)])
  + std.flattenArrays([
    local z = straps[k], hw = half(z);
    [
      box(p + 'tail-%d' % k, 'strap', [cx + hw, 0, cz + z - 0.011], [cx + hw + 0.05, 0.004, cz + z + 0.011]),
      box(p + 'buckle-%d' % k, 'buckle', [cx - hw - 0.012, 0, cz + z - 0.014], [cx - hw + 0.002, 0.012, cz + z + 0.014]),
    ]
    for k in std.range(0, std.length(straps) - 1)
  ]);

// A pressed steel cop standing dome up on y at (cx, cz): radius r, height ht, a rolled rim and two leather straps
// running out to the sides. Slots: cop, rim, strap.
local cop(p, cx, cz, r, ht) = [
  h.turned(p + 'dome', 'cop', 'y', [[0, 0], [0, r], [ht * 0.3, r * 0.94], [ht * 0.6, r * 0.76], [ht * 0.85, r * 0.48], [ht, r * 0.12], [ht, 0]], [cx, 0, cz]),
  h.turned(p + 'rim', 'rim', 'y', [[0, r - 0.004], [0, r + 0.003], [0.005, r + 0.003], [0.005, r - 0.004], [0, r - 0.004]], [cx, 0, cz]),
  box(p + 'strap-a', 'strap', [cx - r - 0.03, 0, cz - r * 0.5 - 0.009], [cx + r + 0.03, 0.003, cz - r * 0.5 + 0.009]),
  box(p + 'strap-b', 'strap', [cx - r - 0.03, 0, cz + r * 0.5 - 0.009], [cx + r + 0.03, 0.003, cz + r * 0.5 + 0.009]),
];

// A curved lame lying along x from x0 to x1, crown up and its long edges on the floor: an arc of inner radius `r` and
// thickness `t` spanning `a` degrees either side of the top round an axis at depth z, from `n` flat facets because a
// prism must be convex. Its crown stands at y + r(1 - cos a) + t.
local lame(id, slot, r, t, a, x0, x1, z, y=0, n=6) =
  local rad = a * std.pi / 180, yc = y - r * std.cos(rad);
  [
    local th0 = -rad + 2 * rad * i / n, th1 = -rad + 2 * rad * (i + 1) / n;
    h.prism('%s-%d' % [id, i], slot, 'x', [
      [yc + r * std.cos(th0), z + r * std.sin(th0)],
      [yc + r * std.cos(th1), z + r * std.sin(th1)],
      [yc + (r + t) * std.cos(th1), z + (r + t) * std.sin(th1)],
      [yc + (r + t) * std.cos(th0), z + (r + t) * std.sin(th0)],
    ], x0, x1)
    for i in std.range(0, n - 1)
  ];
local crown(r, t, a, y=0) = y + r * (1 - std.cos(a * std.pi / 180)) + t;

// One shoulder guard lying crown up along x from the strap end at x0: four overlapping steel lames, each narrower
// and lower than the one before, a leather strap riveted along their crowns and a buckle tab at the strap end.
// Slots: lame, rivet, strap, buckle.
local shoulderGuard(p, x0, cz) =
  local rs = [0.085, 0.08, 0.075, 0.07], heights = [0.006, 0.004, 0.002, 0];
  std.flattenArrays([
    lame(p + 'lame-%d' % i, 'lame', rs[i], 0.003, 58, x0 + i * 0.034, x0 + i * 0.034 + 0.048, cz, heights[i])
    + [
      box(p + 'rivet-%d' % i, 'rivet', [x0 + i * 0.034 + 0.02, crown(rs[i], 0.003, 58, heights[i]) + 0.002, cz - 0.004], [x0 + i * 0.034 + 0.028, crown(rs[i], 0.003, 58, heights[i]) + 0.006, cz + 0.004]),
      box(p + 'strap-%d' % i, 'strap', [x0 + i * 0.034, crown(rs[i], 0.003, 58, heights[i]) - 0.001, cz - 0.011], [x0 + i * 0.034 + 0.048, crown(rs[i], 0.003, 58, heights[i]) + 0.002, cz + 0.011]),
    ]
    for i in std.range(0, 3)
  ])
  + [
    // The tab runs down from the top lame's crown to the floor, where its buckle lies.
    local c = crown(rs[0], 0.003, 58, heights[0]);
    h.prism(p + 'tab', 'strap', 'z', [[x0 + 0.012, c - 0.002], [x0 + 0.012, c + 0.002], [x0 - 0.05, 0.004], [x0 - 0.05, 0]], cz - 0.011, cz + 0.011),
    box(p + 'buckle', 'buckle', [x0 - 0.064, 0, cz - 0.014], [x0 - 0.05, 0.01, cz + 0.014]),
  ];

// One glove lying back up, fingers towards +z, thumb out to side s, centred on cx: a canvas glove with a leather
// cuff, a grid of steel plates riveted over the back of the hand and a small plate on each finger joint.
// Slots: canvas, cuff, plate, rivet, buckle.
local glove(p, cx, s) =
  local x(v) = cx + s * v;
  local fingers = [[0.026, 0.078], [0.006, 0.088], [-0.014, 0.082], [-0.034, 0.066]];
  [
    sbox(p + 'palm', 'canvas', [x(-0.045), 0, -0.02], [x(0.045), 0.022, 0.09]),
    h.prism(p + 'cuff', 'cuff', 'y', [[-0.13, x(-0.06)], [-0.13, x(0.06)], [-0.02, x(0.047)], [-0.02, x(-0.047)]], 0, 0.024),
    h.prism(p + 'thumb', 'canvas', 'y', [[-0.01, x(0.04)], [0.03, x(0.045)], [0.085, x(0.085)], [0.07, x(0.1)], [0.005, x(0.06)]], 0, 0.018),
    sbox(p + 'strap', 'cuff', [x(-0.062), 0.024, -0.075], [x(0.062), 0.028, -0.057]),
    sbox(p + 'buckle', 'buckle', [x(0.05), 0.024, -0.079], [x(0.064), 0.032, -0.053]),
  ]
  + std.flattenArrays([
    local fx = fingers[i][0], fl = fingers[i][1];
    [sbox(p + 'finger-%d' % i, 'canvas', [x(fx - 0.0095), 0, 0.088], [x(fx + 0.0095), 0.017, 0.09 + fl])]
    + [
      sbox(p + 'finger-%d-plate-%d' % [i, k], 'plate', [x(fx - 0.008), 0.017, 0.094 + k * fl / 3], [x(fx + 0.008), 0.02, 0.094 + (k + 1) * fl / 3 - 0.006])
      for k in [0, 1, 2]
    ]
    for i in std.range(0, 3)
  ])
  + [
    sbox(p + 'plate-%d-%d' % [i, j], 'plate', [x(-0.042 + i * 0.029), 0.022, -0.012 + j * 0.033], [x(-0.042 + i * 0.029 + 0.026), 0.026, -0.012 + j * 0.033 + 0.03])
    for i in [0, 1, 2]
    for j in [0, 1, 2]
  ]
  + [
    sbox(p + 'rivet-%d-%d' % [i, j], 'rivet', [x(-0.032 + i * 0.029), 0.026, 0.0 + j * 0.033], [x(-0.026 + i * 0.029), 0.029, 0.006 + j * 0.033])
    for i in [0, 1, 2]
    for j in [0, 1, 2]
  ];

// One knee guard standing dome up: a steel cop over the kneecap with a curved lame above and below it to bend with
// the knee, and a heart-shaped wing on the outer side s. Slots: cop, rim, strap, lame.
local kneeGuard(p, cx, s) =
  cop(p, cx, 0, 0.05, 0.035)
  + h.curvedPlate(p + 'upper', 'lame', [[-0.048, -0.016], [0.048, -0.016], [0.048, 0.016], [-0.048, 0.016]], 0, 0.002, 0.07, 6, cx, -0.064)
  + h.curvedPlate(p + 'lower', 'lame', [[-0.042, -0.014], [0.042, -0.014], [0.042, 0.014], [-0.042, 0.014]], 0, 0.002, 0.07, 6, cx, 0.062)
  + [h.prism(p + 'wing', 'lame', 'y', [[-0.035, cx + s * 0.045], [-0.03, cx + s * 0.07], [0, cx + s * 0.082], [0.03, cx + s * 0.07], [0.035, cx + s * 0.045]], 0.004, 0.007)];

local splintFinishes(steel) = { canvas: 'cloth-canvas', splint: steel, rivet: steel, edge: 'leather-brown', strap: 'leather-brown', buckle: 'steel' };
// Each full leg guard: a thigh splint section, a knee cop and a shin splint section on one canvas line.
local legGuard(p, cx, s) =
  splintGuard(p + 'thigh-', cx, -0.215, 0.36, 0.2, 0.15, 0.1, 6, [-0.1, 0.08])
  + splintGuard(p + 'shin-', cx, 0.21, 0.34, 0.14, 0.1, 0.08, 5, [-0.08, 0.1])
  + [box(p + 'knee-backing', 'canvas', [cx - 0.07, 0, -0.04], [cx + 0.07, 0.006, 0.045])]
  + cop(p + 'knee-', cx, 0, 0.055, 0.04)
  + [h.prism(p + 'knee-wing', 'splint', 'y', [[-0.035, cx + s * 0.05], [-0.03, cx + s * 0.078], [0, cx + s * 0.09], [0.03, cx + s * 0.078], [0.035, cx + s * 0.05]], 0.006, 0.009)];
[
  // A pair of mild steel splint vambraces laid side by side, open side down, each 120 mm from the forearm end to the
  // wrist and 110 mm across: canvas shells with four riveted steel splints alternating with bare canvas, leather
  // binding and one buckled strap. The high steel pair shares this model with its own splint finish.
  h.compound('lc_vambrace_brigandine', 0.43, splintGuard('l-', -0.075, 0, 0.12, 0.11, 0.095, 0.07, 4, [0]) + splintGuard('r-', 0.075, 0, 0.12, 0.11, 0.095, 0.07, 4, [0]), splintFinishes('steel-bright'))
  + { voxelGrain: 0.004 },

  // A pair of mild steel brigandine gloves laid flat side by side, backs up, each 250 mm from cuff to fingertip and
  // 100 mm across the knuckles: canvas gloves with leather cuffs, nine riveted steel plates over the back of the
  // hand and a plate on each finger joint. The medium steel pair shares this model.
  h.compound('lc_brigandine_hands', 0.69, glove('l-', -0.07, -1) + glove('r-', 0.07, 1), { canvas: 'cloth-canvas', cuff: 'leather-brown', plate: 'steel-bright', rivet: 'steel-bright', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of thin mild steel elbow guards standing dome up side by side, each a 90 mm cop 30 mm high with a rolled
  // rim, a fan-shaped wing on the outer side and two leather straps. The medium steel pair shares this model.
  h.compound('lc_elbow_guards', 0.4, std.flattenArrays([
    cop(p, cx, 0, 0.045, 0.03)
    // A fan-shaped wing on the outer side guards the inside of the elbow joint.
    + [h.prism(p + 'wing', 'cop', 'y', [[-0.03, cx + s * 0.04], [-0.034, cx + s * 0.062], [0, cx + s * 0.075], [0.034, cx + s * 0.062], [0.03, cx + s * 0.04]], 0.006, 0.009)]
    for p in ['l-', 'r-']
    for s in [if p == 'l-' then -1 else 1]
    for cx in [s * 0.085]
  ]), { cop: 'steel-bright', rim: 'steel-bright', strap: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A pair of thin mild steel knee guards standing dome up side by side, each a 100 mm cop 35 mm high with a lame
  // above and below and a wing on the outer side, 200 mm from the top lame to the bottom one.
  h.compound('lc_knee_guards', 0.7, kneeGuard('l-', -0.1, -1) + kneeGuard('r-', 0.1, 1), { cop: 'steel-bright', rim: 'steel-bright', lame: 'steel-bright', strap: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A pair of mild steel shoulder guards lying crown up side by side, each four overlapping lames 150 mm across and
  // 150 mm from the strap end to the lowest lame, with a buckle tab to strap them to a brigandine's shoulders.
  h.compound('lc_shoulder_guards', 1.2, shoulderGuard('l-', -0.07, -0.085) + shoulderGuard('r-', -0.07, 0.085), { lame: 'steel-bright', rivet: 'steel-bright', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of mild steel splint greaves laid side by side, open side down, each 340 mm from knee to ankle, 140 mm
  // across at the calf and 100 mm at the ankle: canvas shells with five riveted splints and two buckled straps. The
  // medium steel pair shares this model.
  h.compound('lc_greaves_brigandine', 1.3, splintGuard('l-', -0.1, 0, 0.34, 0.14, 0.1, 0.08, 5, [-0.08, 0.1]) + splintGuard('r-', 0.1, 0, 0.34, 0.14, 0.1, 0.08, 5, [-0.08, 0.1]), splintFinishes('steel-bright'))
  + { voxelGrain: 0.004 },

  // A pair of mild steel splint leg guards laid side by side, open side down, each 780 mm from hip to ankle: a
  // splinted thigh section 200 mm across at the top, a steel knee cop with a side wing and a splinted shin section,
  // each section with two buckled straps. The other steels share this model with their own splint finish.
  h.compound('legguard_lc_brigandine', 4.2, legGuard('l-', -0.13, -1) + legGuard('r-', 0.13, 1), splintFinishes('steel-bright') + { cop: 'steel-bright', rim: 'steel-bright' })
  + { voxelGrain: 0.004 },
]
