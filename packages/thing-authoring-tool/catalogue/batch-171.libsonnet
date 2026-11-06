local h = import '../compound.libsonnet';
local box = h.box;

// Full suits of body armour, each laid out on the floor front up with the neck towards -z: a breastplate over the
// legs, an arm harness either side and the shoulder pieces at the top.

// h.curvedPlate with each strip filled down to the height of its outer edge, so neighbouring strips meet without a
// see-through step and the shell reads as one curved sheet. Tops match h.curvedTopAt.
local smoothPlate(prefix, slot, outline, y0, thick, r, n, cx=0, cz=0) =
  local x0 = std.foldl(function(a, p) std.min(a, p[0]), outline, 1e9);
  local x1 = std.foldl(function(a, p) std.max(a, p[0]), outline, -1e9);
  local half = std.max(-x0, x1), w = (x1 - x0) / n;
  local lift(x) = (half * half - x * x) / (2 * r);
  [
    local xa = x0 + i * w;
    local band = h.clipX(h.clipX(outline, xa, true), xa + w, false);
    local outer = if std.abs(xa) > std.abs(xa + w) then xa else xa + w;
    h.prism('%s-%d' % [prefix, i], slot, 'y', [[p[1] + cz, p[0] + cx] for p in band], y0 + lift(outer), y0 + lift(xa + w / 2) + thick)
    for i in std.range(0, n - 1)
  ];

// A strip `w` wide lying across a curved plate at local z, `half` either side of its middle, piece by piece so it
// follows the curve; each piece stands on the higher of its two ends so the shell never covers it.
local band(p, slot, outline, y0, t, r, cx, cz, z, half, w, n=6) = [
  local xa = -half + 2 * half * i / n, xb = -half + 2 * half * (i + 1) / n;
  local top = h.curvedTopAt(outline, y0, t, r, if xa < 0 && xb > 0 then 0 else std.min(std.abs(xa), std.abs(xb)));
  box('%s-%d' % [p, i], slot, [cx + xa, top - 0.004, cz + z - w / 2], [cx + xb, top + 0.002, cz + z + w / 2])
  for i in std.range(0, n - 1)
];

// A buckled strap round a plate: a band across it, its loose end running out on the floor to +x and a buckle at -x.
// `s` is -1 to run the tail out to -x instead, away from a neighbouring piece.
local strap(p, outline, y0, t, r, cx, cz, z, half, tail=0.05, s=1, w=0.022) =
  local xa = cx + s * half, xb = cx + s * (half + tail), xc = cx - s * (half + 0.012), xd = cx - s * (half - 0.002);
  band(p, 'strap', outline, y0, t, r, cx, cz, z, half, w)
  + [
    box(p + '-tail', 'strap', [std.min(xa, xb), 0, cz + z - w / 2], [std.max(xa, xb), 0.004, cz + z + w / 2]),
    box(p + '-buckle', 'buckle', [std.min(xc, xd), 0, cz + z - w / 2 - 0.003], [std.max(xc, xd), 0.012, cz + z + w / 2 + 0.003]),
  ];

// A pressed cop standing dome up at (cx, y, cz): radius r, height ht, with a rolled rim. Slots: plate, rim.
local cop(p, cx, cz, r, ht, y=0) = [
  h.turned(p + 'dome', 'plate', 'y', [[0, 0], [0, r], [ht * 0.3, r * 0.94], [ht * 0.6, r * 0.76], [ht * 0.85, r * 0.48], [ht, r * 0.12], [ht, 0]], [cx, y, cz]),
  h.turned(p + 'rim', 'rim', 'y', [[0, r - 0.004], [0, r + 0.003], [0.005, r + 0.003], [0.005, r - 0.004], [0, r - 0.004]], [cx, y, cz]),
];

// A calf-shaped greave outline, `len` long from the knee at -z to the ankle at +z.
local greaveOutline(len, knee, calf, ankle) = [
  [-knee / 2, -len / 2], [knee / 2, -len / 2], [calf / 2, -len / 6], [ankle / 2, len / 2], [-ankle / 2, len / 2], [-calf / 2, -len / 6],
];

// Rows of mail rings on a flat sheet lying on y from y0, from x0 to x1 and z0 to z1. Slot: mail.
local mailSheet(p, x0, x1, z0, z1, y0) =
  [box(p + '-sheet', 'mail', [x0, y0, z0], [x1, y0 + 0.006, z1])]
  + [
    box('%s-ring-%d' % [p, i], 'mail', [x0 + 0.004, y0 + 0.006, z0 + 0.006 + i * 0.012], [x1 - 0.004, y0 + 0.009, z0 + 0.011 + i * 0.012])
    for i in std.range(0, std.floor((z1 - z0 - 0.012) / 0.012))
  ];

// A plate suit laid out front up, neck at -z, 720 mm across the shoulder pieces and 880 mm from the pauldrons to the
// ankles. Under everything lie the leg harnesses (a curved plate over each thigh, a domed knee cop and a calf-shaped
// greave); on them sits the breastplate over a flat backplate, with a ridge down its middle, a turned rim at the neck
// and arm holes, and lames hanging below it at the waist; to either side an arm harness of two tubes with a cop at
// the elbow, and a domed pauldron with lames at each shoulder; every piece buckles on with leather straps.
// Options (o): lames (waist lames, 1-3), plackart (a second plate over the belly), mail (a mail skirt and mail
// under the arms), boss (a raised boss on the chest), orn (etched bands along the rims), rust (rust patches),
// tails (loose strap length), nomad (a black bodysuit under it all, gold aramid liner showing at the neck and a
// power module with a lit display at the side).
// Slots: plate, rim, strap, buckle, rivet, and mail, orn, rust, suit, liner, module, led as the options use them.
local plateSuit(o) =
  local lames = std.get(o, 'lames', 2), tails = std.get(o, 'tails', 0.05);
  local t = 0.005;
  // Legs, lying on the floor.
  local thigh = [[-0.09, -0.15], [0.09, -0.15], [0.07, 0.15], [-0.07, 0.15]];
  local shin = greaveOutline(0.26, 0.1, 0.13, 0.08);
  local legs = std.flattenArrays([
    smoothPlate(p + 'thigh', 'plate', thigh, 0, t, 0.09, 10, cx, 0.02)
    + strap(p + 'thigh-strap', thigh, 0, t, 0.09, cx, 0.02, -0.08, 0.085, tails, s)
    + cop(p + 'knee-', cx, 0.215, 0.055, 0.04)
    + smoothPlate(p + 'shin', 'plate', shin, 0, t, 0.07, 10, cx, 0.38)
    + strap(p + 'shin-strap-0', shin, 0, t, 0.07, cx, 0.38, -0.07, 0.063, tails, s)
    + strap(p + 'shin-strap-1', shin, 0, t, 0.07, cx, 0.38, 0.08, 0.045, tails, s)
    + [h.onCurvedFace(p + 'shin-rib', 'rim', shin, 0, t, 0.07, [0, -0.12], [0, 0.11], 0.008, cx, 0.38)]
    for p in ['leg-l-', 'leg-r-']
    for s in [if p == 'leg-l-' then -1 else 1]
    for cx in [s * 0.1]
  ]);
  // The cuirass, lying on the thighs.
  local y0 = 0.045, r = 0.3, w = 0.4;
  local front = [[-0.11, -0.3], [0.11, -0.3], [0.2, -0.22], [0.2, 0.06], [-0.2, 0.06], [-0.2, -0.22]];
  local face(id, slot, a, b, wd) = h.onCurvedFace(id, slot, front, y0 + 0.008, t, r, a, b, wd);
  local lameRows = [
    local z0 = 0.05 + i * 0.045, half = 0.19 - i * 0.012;
    local o2 = [[-half, 0], [half, 0], [half, 0.055], [-half, 0.055]];
    smoothPlate('lame-%d' % i, 'plate', o2, y0 + 0.004 - i * 0.003, t, r, 10, 0, z0)
    + band('lame-edge-%d' % i, 'rim', o2, y0 + 0.004 - i * 0.003, t, r, 0, z0, 0.05, half - 0.004, 0.006)
    for i in std.range(0, lames - 1)
  ];
  local cuirass =
    [h.prism('back', 'plate', 'y', [[q[1], q[0] * 1.03] for q in front], y0, y0 + 0.008)]
    + smoothPlate('breast', 'plate', front, y0 + 0.008, t, r, 14)
    + [face('ridge', 'rim', [0, -0.27], [0, 0.05], 0.01)]
    + band('neck-rim', if std.get(o, 'nomad', false) then 'liner' else 'rim', front, y0 + 0.008, t, r, 0, 0, -0.29, 0.11, 0.02)
    + [
      face('arm-rim-' + s, 'rim', [sx * 0.12, -0.295], [sx * 0.197, -0.22], 0.012)
      for s in ['l', 'r']
      for sx in [if s == 'l' then -1 else 1]
    ]
    + [
      face('side-strap-%s-%d' % [s, k], 'strap', [sx * 0.2, z], [sx * 0.15, z], 0.022)
      for s in ['l', 'r']
      for sx in [if s == 'l' then -1 else 1]
      for k in [0, 1]
      for z in [[-0.12, -0.01][k]]
    ]
    + [
      box('side-buckle-%s-%d' % [s, k], 'buckle', [sx * 0.2 - 0.008, y0, z - 0.014], [sx * 0.2 + 0.008, y0 + 0.022, z + 0.014])
      for s in ['l', 'r']
      for sx in [if s == 'l' then -1 else 1]
      for k in [0, 1]
      for z in [[-0.12, -0.01][k]]
    ]
    + std.flattenArrays(lameRows)
    + (if std.get(o, 'plackart', false) then
         local pl = [[-0.13, -0.08], [0.13, -0.08], [0.17, 0.0], [0.17, 0.06], [-0.17, 0.06], [-0.17, 0.0]];
         smoothPlate('plackart', 'plate', pl, y0 + 0.008 + (0.2 * 0.2 - 0.17 * 0.17) / (2 * r) + t, t, r, 12)
         + [
           local yy = h.curvedTopAt(pl, y0 + 0.008 + (0.2 * 0.2 - 0.17 * 0.17) / (2 * r) + t, t, r, x);
           box('plackart-rivet-%d' % i, 'rivet', [x - 0.004, yy - 0.001, z - 0.004], [x + 0.004, yy + 0.004, z + 0.004])
           for i in std.range(0, 3)
           for x in [[-0.1, 0.1, -0.14, 0.14][i]]
           for z in [[-0.06, -0.06, 0.04, 0.04][i]]
         ]
       else [])
    + (if std.get(o, 'boss', false) then [h.dome('boss', 'orn', 0.04, 0.025, 0.008, 'y', [0, h.curvedTopAt(front, y0 + 0.008, t, r, 0) - 0.006, -0.13])] else [])
    + (if std.get(o, 'orn', false) then
         band('orn-neck', 'orn', front, y0 + 0.008, t, r, 0, 0, -0.265, 0.11, 0.012)
         + band('orn-waist', 'orn', front, y0 + 0.008, t, r, 0, 0, 0.04, 0.19, 0.012)
         + [face('orn-v-' + s, 'orn', [sx * 0.03, -0.25], [sx * 0.14, 0.02], 0.01) for s in ['l', 'r'] for sx in [if s == 'l' then -1 else 1]]
       else [])
    + (if std.get(o, 'rust', false) then [
         face('rust-%d' % i, 'rust', [c[0], c[1]], [c[2], c[3]], c[4])
         for i in std.range(0, 4)
         for c in [[[-0.17, -0.18, -0.12, -0.12, 0.04], [0.06, -0.05, 0.15, 0.0, 0.05], [-0.08, 0.02, 0.0, 0.03, 0.03], [0.12, -0.24, 0.17, -0.2, 0.03], [-0.04, -0.2, 0.0, -0.17, 0.025]][i]]
       ] else [])
    + (if std.get(o, 'nomad', false) then [
         box('module', 'module', [0.08, h.curvedTopAt(front, y0 + 0.008, t, r, 0.14) - 0.002, -0.06], [0.17, h.curvedTopAt(front, y0 + 0.008, t, r, 0.08) + 0.012, 0.02]),
         box('led', 'led', [0.1, h.curvedTopAt(front, y0 + 0.008, t, r, 0.08) + 0.012, -0.05], [0.15, h.curvedTopAt(front, y0 + 0.008, t, r, 0.08) + 0.014, -0.025]),
         box('cable', 'module', [0.16, y0, -0.04], [0.24, y0 + 0.012, -0.03]),
       ] else []);
  // Arms beside the cuirass: an upper and a lower tube along z with a cop at the elbow.
  local ar = 0.04;
  local arms = std.flattenArrays([
    [
      h.turned(p + 'upper', 'plate', 'z', [[0, 0], [0, ar * 1.15], [0.17, ar], [0.17, 0]], [cx, ar, -0.2]),
      h.turned(p + 'lower', 'plate', 'z', [[0, 0], [0, ar * 0.95], [0.19, ar * 0.75], [0.19, 0]], [cx, ar, 0.0]),
      h.dome(p + 'elbow', 'plate', 0.05, 0.035, 0.006, 'y', [cx, ar + 0.004, -0.015]),
      h.turned(p + 'elbow-rim', 'rim', 'y', [[0, 0.046], [0, 0.053], [0.005, 0.053], [0.005, 0.046], [0, 0.046]], [cx, ar + 0.004, -0.015]),
    ]
    + [
      h.turned('%sstrap-%d' % [p, k], 'strap', 'z', [[0, 0], [0, ar * 1.2], [0.022, ar * 1.2], [0.022, 0]], [cx, ar, z])
      for k in [0, 1]
      for z in [[-0.13, 0.1][k]]
    ]
    // Pauldron: a dome over the shoulder with two lames below it towards the arm.
    + cop(p + 'pauldron-', cx, -0.29, 0.085, 0.06, 0.0)
    + [
      h.prism('%spauldron-lame-%d' % [p, k], 'plate', 'y', [[-0.24 + k * 0.03, cx - 0.07], [-0.24 + k * 0.03, cx + 0.07], [-0.205 + k * 0.03, cx + 0.065], [-0.205 + k * 0.03, cx - 0.065]], 0, 0.06 - k * 0.012)
      for k in [0, 1]
    ]
    for p in ['arm-l-', 'arm-r-']
    for cx in [if p == 'arm-l-' then -0.3 else 0.3]
  ]);
  local mail =
    if std.get(o, 'mail', false) then
      mailSheet('mail-skirt', -0.18, 0.18, 0.04 + lames * 0.045, 0.1 + lames * 0.045, y0 - 0.012)
      + mailSheet('mail-arm-l', -0.26, -0.19, -0.22, -0.12, 0.03)
      + mailSheet('mail-arm-r', 0.19, 0.26, -0.22, -0.12, 0.03)
    else [];
  local suit =
    if std.get(o, 'nomad', false) then [
      // The bodysuit lies under it all, folded, its black cloth showing between the pieces.
      box('suit-body', 'suit', [-0.23, 0, -0.32], [0.23, 0.004, 0.17]),
      box('suit-leg-l', 'suit', [-0.2, 0, 0.17], [-0.01, 0.004, 0.53]),
      box('suit-leg-r', 'suit', [0.01, 0, 0.17], [0.2, 0.004, 0.53]),
      box('suit-arm-l', 'suit', [-0.35, 0, -0.24], [-0.23, 0.004, 0.22]),
      box('suit-arm-r', 'suit', [0.23, 0, -0.24], [0.35, 0.004, 0.22]),
    ] else [];
  legs + cuirass + arms + mail + suit;

// A crude suit of hammered sheet metal laid out flat, front up, 1200 mm from the shoulders to the ankles and 780 mm
// across: a front sheet bent across the chest over a flat back sheet, laced at the shoulders and held by two belts
// buckled round the waist; a bent shoulder sheet and two half-pipe arm sheets either side; two half-pipe sheets for
// each leg below; leather straps knotted round the limb sheets, and dark hammer dents across every sheet.
// Options (o): heavy (a second, smaller sheet bolted over the chest), mail (mail covering the gaps at the shoulders,
// elbows, hips and knees).
// Slots: sheet, dent, strap, buckle, bolt, mail.
local sheetSuit(o) =
  local t = 0.004;
  local half(p, cx, cz, w, l, r) =
    local ol = [[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2 * 0.9, l / 2], [-w / 2 * 0.9, l / 2]];
    smoothPlate(p, 'sheet', ol, 0, t, r, 8, cx, cz)
    + [
      h.onCurvedFace('%s-dent-%d' % [p, i], 'dent', ol, 0, t, r, [d[0] * w, d[1] * l], [d[0] * w + 0.02, d[1] * l + 0.015], 0.012, cx, cz)
      for i in [0, 1]
      for d in [[[-0.2, -0.25], [0.1, 0.2]][i]]
    ];
  local tie(p, cx, cz, w) = [
    box(p + '-band', 'strap', [cx - w / 2 - 0.004, 0, cz - 0.012], [cx + w / 2 + 0.004, w * 0.42, cz + 0.012]),
    box(p + '-knot', 'strap', [cx + w / 2 - 0.004, 0, cz - 0.02], [cx + w / 2 + 0.02, 0.03, cz + 0.02]),
    box(p + '-end', 'strap', [cx + w / 2 + 0.02, 0, cz - 0.01], [cx + w / 2 + 0.08, 0.004, cz + 0.006]),
  ];
  // The cuirass: neck at z = -0.55.
  local y0 = 0.0, r = 0.6;
  local front = [[-0.13, -0.55], [0.13, -0.55], [0.22, -0.46], [0.22, -0.06], [-0.22, -0.06], [-0.22, -0.46]];
  local frontTop(x) = h.curvedTopAt(front, y0 + 0.006, t, r, x);
  local chest = [[-0.15, -0.48], [0.15, -0.48], [0.17, -0.42], [0.17, -0.22], [-0.17, -0.22], [-0.17, -0.42]];
  local chestY = y0 + 0.006 + t + (0.22 * 0.22 - 0.17 * 0.17) / (2 * r);
  [h.prism('back', 'sheet', 'y', [[q[1], q[0] * 1.04] for q in front], y0, y0 + 0.006)]
  + smoothPlate('front', 'sheet', front, y0 + 0.006, t, r, 12)
  + [
    h.onCurvedFace('front-dent-%d' % i, 'dent', front, y0 + 0.006, t, r, [d[0], d[1]], [d[0] + 0.03, d[1] + 0.02], 0.016)
    for i in std.range(0, 4)
    for d in [[[-0.15, -0.4], [0.08, -0.3], [-0.05, -0.18], [0.14, -0.12], [-0.17, -0.1]][i]]
  ]
  // Two belts round the waist with their buckles at the front, and laces through punched holes at each shoulder.
  + std.flattenArrays([
    band('belt-%d' % k, 'strap', front, y0 + 0.006, t, r, 0, 0, z, 0.22, 0.035, 8)
    + [
      box('belt-%d-buckle' % k, 'buckle', [0.04, frontTop(0.06), z - 0.024], [0.09, frontTop(0.06) + 0.008, z + 0.024]),
      box('belt-%d-tail' % k, 'strap', [0.22, 0, z - 0.017], [0.3, 0.004, z + 0.017]),
    ]
    for k in [0, 1]
    for z in [[-0.2, -0.11][k]]
  ])
  + [
    h.onCurvedFace('lace-%s-%d' % [sd, k], 'strap', front, y0 + 0.006, t, r, [sx * (0.13 + k * 0.03), -0.56], [sx * (0.15 + k * 0.03), -0.5], 0.008)
    for sd in ['l', 'r']
    for sx in [if sd == 'l' then -1 else 1]
    for k in [0, 1]
  ]
  + (if std.get(o, 'heavy', false) then
       smoothPlate('chest', 'sheet', chest, chestY, t, r, 10)
       + [
         local yy = h.curvedTopAt(chest, chestY, t, r, c[0]);
         box('chest-bolt-%d' % i, 'bolt', [c[0] - 0.006, yy - 0.001, c[1] - 0.006], [c[0] + 0.006, yy + 0.006, c[1] + 0.006])
         for i in std.range(0, 5)
         for c in [[[-0.13, -0.45], [0.13, -0.45], [-0.15, -0.34], [0.15, -0.34], [-0.15, -0.25], [0.15, -0.25]][i]]
       ]
     else [])
  // Shoulders and arms either side.
  + std.flattenArrays([
    half(p + 'shoulder', cx, -0.5, 0.18, 0.14, 0.12)
    + half(p + 'upper', cx, -0.3, 0.13, 0.22, 0.07)
    + half(p + 'lower', cx, -0.05, 0.12, 0.22, 0.06)
    + tie(p + 'upper-tie', cx, -0.3, 0.13)
    + tie(p + 'lower-tie', cx, -0.05, 0.12)
    for p in ['arm-l-', 'arm-r-']
    for cx in [if p == 'arm-l-' then -0.32 else 0.32]
  ])
  // Legs below.
  + std.flattenArrays([
    half(p + 'thigh', cx, 0.12, 0.18, 0.3, 0.09)
    + half(p + 'shin', cx, 0.47, 0.14, 0.32, 0.07)
    + tie(p + 'thigh-tie-0', cx, 0.04, 0.18)
    + tie(p + 'thigh-tie-1', cx, 0.2, 0.17)
    + tie(p + 'shin-tie-0', cx, 0.4, 0.14)
    + tie(p + 'shin-tie-1', cx, 0.56, 0.13)
    for p in ['leg-l-', 'leg-r-']
    for cx in [if p == 'leg-l-' then -0.11 else 0.11]
  ])
  + (if std.get(o, 'mail', false) then
       std.flattenArrays([
         mailSheet('mail-shoulder-' + sd, sx * 0.23 - 0.03, sx * 0.23 + 0.03, -0.52, -0.38, 0)
         + mailSheet('mail-elbow-' + sd, sx * 0.32 - 0.05, sx * 0.32 + 0.05, -0.2, -0.15, 0)
         + mailSheet('mail-knee-' + sd, sx * 0.11 - 0.07, sx * 0.11 + 0.07, 0.26, 0.32, 0)
         for sd in ['l', 'r']
         for sx in [if sd == 'l' then -1 else 1]
       ])
       + mailSheet('mail-hip', -0.21, 0.21, -0.07, 0.0, 0)
     else []);

// A full mail suit folded on a shelf, 420 mm by 360 mm and 90 mm tall: rows of dark tempered rings over a black
// stretch bodysuit that shows at the collar, the cuffs and the edges, a gold aramid panel at the chest, a strap
// harness across the top, and a slim power module with its display lit.
// Slots: cloth, mail, trim, liner, strap, module, led.
local mailSuit() =
  local w = 0.42, d = 0.36, ht = 0.09;
  local folds = h.foldedGarment(w, d, ht, 4);
  [f + { slot: if f.id == 'fold-3' || f.id == 'edge-3' then 'mail' else 'cloth' } for f in folds]
  // Ring rows, each a line of short links offset from the row before, so the weave shows.
  + [
    local z = -d / 2 + 0.02 + i * 0.016, x = -w / 2 + 0.012 + j * 0.03 + (i % 2) * 0.015;
    box('ring-%d-%d' % [i, j], 'mail', [x, ht, z], [x + 0.022, ht + 0.006, z + 0.008])
    for i in std.range(0, std.floor((d - 0.04) / 0.016))
    for j in std.range(0, 12)
    if -w / 2 + 0.012 + j * 0.03 + (i % 2) * 0.015 + 0.022 < w / 2 - 0.01
  ]
  + [
    // The sleeves folded in along both sides, their stretch cuffs at the hem.
    box('sleeve-l', 'mail', [-w / 2 + 0.01, ht + 0.006, -d / 2 + 0.06], [-w / 2 + 0.09, ht + 0.016, d / 2 - 0.05]),
    box('sleeve-r', 'mail', [w / 2 - 0.09, ht + 0.006, -d / 2 + 0.06], [w / 2 - 0.01, ht + 0.016, d / 2 - 0.05]),
    box('cuff-l', 'trim', [-w / 2 + 0.01, ht + 0.006, -d / 2 + 0.03], [-w / 2 + 0.09, ht + 0.016, -d / 2 + 0.06]),
    box('cuff-r', 'trim', [w / 2 - 0.09, ht + 0.006, -d / 2 + 0.03], [w / 2 - 0.01, ht + 0.016, -d / 2 + 0.06]),
    // The collar at +z, with the aramid liner showing inside it.
    box('collar', 'trim', [-0.09, ht, d / 2 - 0.05], [0.09, ht + 0.016, d / 2 + 0.004]),
    box('liner', 'liner', [-0.07, ht + 0.016, d / 2 - 0.04], [0.07, ht + 0.018, d / 2 - 0.01]),
    box('strap-a', 'strap', [-0.11, ht + 0.006, -d / 2 + 0.02], [-0.09, ht + 0.01, d / 2 - 0.05]),
    box('strap-b', 'strap', [0.09, ht + 0.006, -d / 2 + 0.02], [0.11, ht + 0.01, d / 2 - 0.05]),
    box('module', 'module', [0.02, ht + 0.006, 0.0], [0.08, ht + 0.022, 0.08]),
    box('led', 'led', [0.03, ht + 0.022, 0.015], [0.07, ht + 0.024, 0.05]),
  ];

[
  // Junk ornamental plate armour laid out front up, 720 mm across and 880 mm from shoulders to ankles: a showpiece
  // suit of cheap iron, its rims etched with brass-coloured bands, a raised boss on the chest, rust eating through in
  // patches and long tattered leather strap ends trailing from every buckle.
  h.compound('armor_junk_plate', 25, plateSuit({ lames: 3, boss: true, orn: true, rust: true, tails: 0.12 }), {
    plate: 'iron-dull', rim: 'iron-dull', strap: 'leather-tan', buckle: 'brass-dull', rivet: 'brass-dull', orn: 'brass-dull', rust: 'rust-red',
  })
  + { voxelGrain: 0.004 },

  // Leather body armour laid out front up, the same cut as the plate suits: a moulded hardened-leather breast over a
  // flat back, waist lames, cops and tubes for the arms, shaped thigh and shin pieces, all edged in black.
  h.compound('armor_larmor', 4, plateSuit({ lames: 2 }), {
    plate: 'leather-chestnut', rim: 'leather-black', strap: 'leather-black', buckle: 'brass-dull', rivet: 'brass-dull',
  })
  + { voxelGrain: 0.004 },

  // Mild steel light plate armour laid out front up: one waist lame and mail under the arms and below the waist.
  h.compound('armor_lc_lightplate', 27, plateSuit({ lames: 1, mail: true }), {
    plate: 'steel-bright', rim: 'steel-bright', strap: 'leather-brown', buckle: 'steel', rivet: 'steel', mail: 'steel-mail',
  })
  + { voxelGrain: 0.004 },

  // Mild steel plate armour laid out front up: two waist lames and mail under the arms and below the waist.
  h.compound('armor_lc_plate', 27, plateSuit({ lames: 2, mail: true }), {
    plate: 'steel-bright', rim: 'steel-bright', strap: 'leather-brown', buckle: 'steel', rivet: 'steel', mail: 'steel-mail',
  })
  + { voxelGrain: 0.004 },

  // Mild steel heavy plate armour laid out front up: a riveted plackart doubling the belly, three waist lames and
  // mail under the arms and below the waist.
  h.compound('armor_lc_heavyplate', 29, plateSuit({ lames: 3, mail: true, plackart: true }), {
    plate: 'steel-bright', rim: 'steel-bright', strap: 'leather-brown', buckle: 'steel', rivet: 'steel', mail: 'steel-mail',
  })
  + { voxelGrain: 0.004 },

  // Nomad light plate armour, powered, laid out front up: tempered plate with one waist lame and dark mail, over a
  // folded black bodysuit, gold aramid liner at the neck and a power module on the right side with its display lit.
  h.compound('armor_nomad_lightplate_on', 26, plateSuit({ lames: 1, mail: true, nomad: true }), {
    plate: 'steel-heat-tint', rim: 'steel-heat-tint', strap: 'webbing-black', buckle: 'plastic-matte-black', rivet: 'steel', mail: 'steel-mail-dark',
    suit: 'cloth-black', liner: 'aramid-gold', module: 'plastic-charcoal', led: 'lcd-green',
  })
  + { voxelGrain: 0.004 },

  // Nomad heavy plate armour, powered: as the light suit with a riveted plackart and three waist lames.
  h.compound('armor_nomad_heavyplate_on', 28, plateSuit({ lames: 3, mail: true, nomad: true, plackart: true }), {
    plate: 'steel-heat-tint', rim: 'steel-heat-tint', strap: 'webbing-black', buckle: 'plastic-matte-black', rivet: 'steel', mail: 'steel-mail-dark',
    suit: 'cloth-black', liner: 'aramid-gold', module: 'plastic-charcoal', led: 'lcd-green',
  })
  + { voxelGrain: 0.004 },

  // Sheet metal armour laid out front up, 1200 mm from shoulders to ankles: hammered sheets tied on with straps and
  // belts.
  h.compound('armor_metal_sheets', 27, sheetSuit({}), {
    sheet: 'steel-bright', dent: 'steel-grey', strap: 'leather-brown', buckle: 'steel', bolt: 'steel', mail: 'steel-mail',
  })
  + { voxelGrain: 0.006 },

  // Heavy sheet metal armour: as the sheet metal suit with a second sheet bolted over the chest.
  h.compound('armor_metal_sheets_heavy', 30, sheetSuit({ heavy: true }), {
    sheet: 'steel-bright', dent: 'steel-grey', strap: 'leather-brown', buckle: 'steel', bolt: 'steel', mail: 'steel-mail',
  })
  + { voxelGrain: 0.006 },

  // Junkyard plate armour: the sheet metal suit with mail covering the gaps at the shoulders, elbows, hips and knees.
  h.compound('armor_metal_sheets_chain', 29, sheetSuit({ mail: true }), {
    sheet: 'steel-bright', dent: 'steel-grey', strap: 'leather-brown', buckle: 'steel', bolt: 'steel', mail: 'steel-mail',
  })
  + { voxelGrain: 0.006 },

  // Heavy junkyard plate armour: mail at the gaps and a second sheet bolted over the chest.
  h.compound('armor_metal_sheets_chain_heavy', 31, sheetSuit({ mail: true, heavy: true }), {
    sheet: 'steel-bright', dent: 'steel-grey', strap: 'leather-brown', buckle: 'steel', bolt: 'steel', mail: 'steel-mail',
  })
  + { voxelGrain: 0.006 },

  // Nomad mail suit, powered, folded on a shelf: 420 mm by 360 mm and 90 mm tall.
  h.compound('armor_nomad_chainmail_on', 10, mailSuit(), {
    cloth: 'cloth-black', mail: 'steel-mail-dark', trim: 'cloth-black', liner: 'aramid-gold', strap: 'webbing-black', module: 'plastic-charcoal', led: 'lcd-green',
  })
  + { voxelGrain: 0.004 },
]
