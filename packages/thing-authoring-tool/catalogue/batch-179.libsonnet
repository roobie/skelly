local h = import '../compound.libsonnet';
local box = h.box;

// Torso armour, each piece laid on the floor front up with the neck towards -z, as the armour suits of earlier
// batches lie.

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

local sides = [['l', -1], ['r', 1]];

// A plate rectangle `w` across and `l` long centred on its middle.
local rect(w, l) = [[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2]];

// A cuirass outline, neck at z = -0.3 and hem at z = hem: a neck edge 220 mm wide, shoulders 400 mm across.
local torso(hem, half=0.2) = [[-0.11, -0.3], [0.11, -0.3], [half, -0.22], [half, hem], [-half, hem], [-half, -0.22]];

// A steel chestplate lying front up, 400 mm across and 600 mm from the neck to the foot of its tassets: a breastplate
// on a flat backplate, ridged down the middle with turned rims at the neck and arm holes, shoulder and side straps
// with buckles, lames at the waist, and optionally a plate over each upper arm (spaulders) and two tassets hanging
// over the thighs from the lowest lame.
// Options (o): t (plate thickness), lames (1-3), spaulder (lames per spaulder, 0 for none), tassets, plackart (a
// second plate riveted over the belly).
// Slots: plate, rim, strap, buckle, rivet.
local chestplate(o) =
  local t = o.t, lames = o.lames, sp = std.get(o, 'spaulder', 0);
  local y0 = 0.0, yb = 0.008, r = 0.3;
  local front = torso(0.06);
  local top(x) = h.curvedTopAt(front, yb, t, r, x);
  local face(id, slot, a, b, wd) = h.onCurvedFace(id, slot, front, yb, t, r, a, b, wd);
  local rivet(id, x, y, z) = box(id, 'rivet', [x - 0.004, y - 0.001, z - 0.004], [x + 0.004, y + 0.004, z + 0.004]);
  local lameEnd = 0.05 + lames * 0.045;
  [h.prism('back', 'plate', 'y', [[q[1], q[0] * 1.03] for q in front], y0, yb)]
  + smoothPlate('breast', 'plate', front, yb, t, r, 14)
  + [face('ridge', 'rim', [0, -0.27], [0, 0.05], 0.01)]
  + band('neck-rim', 'rim', front, yb, t, r, 0, 0, -0.29, 0.11, 0.02)
  + [face('arm-rim-' + s, 'rim', [sx * 0.12, -0.295], [sx * 0.197, -0.22], 0.012) for sd in sides for s in [sd[0]] for sx in [sd[1]]]
  // Shoulder straps from the backplate over the shoulder to a buckle on the breast, and two buckled side straps.
  + std.flattenArrays([
    [
      box('shoulder-strap-' + s, 'strap', [sx * 0.165 - 0.012, yb, -0.34], [sx * 0.165 + 0.012, top(0.165) + 0.002, -0.27]),
      box('shoulder-buckle-' + s, 'buckle', [sx * 0.165 - 0.016, top(0.165) - 0.002, -0.272], [sx * 0.165 + 0.016, top(0.165) + 0.006, -0.252]),
    ]
    + [
      face('side-strap-%s-%d' % [s, k], 'strap', [sx * 0.2, z], [sx * 0.15, z], 0.022)
      for k in [0, 1]
      for z in [[-0.12, -0.01][k]]
    ]
    + [
      box('side-buckle-%s-%d' % [s, k], 'buckle', [sx * 0.2 - 0.008, y0, z - 0.014], [sx * 0.2 + 0.008, y0 + 0.022, z + 0.014])
      for k in [0, 1]
      for z in [[-0.12, -0.01][k]]
    ]
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
  ])
  // Waist lames, each a little narrower and lower than the one above, riveted at both ends.
  + std.flattenArrays([
    local z0 = 0.05 + i * 0.045, half = 0.19 - i * 0.012, yl = yb - 0.002 - i * 0.003;
    local ol = [[-half, 0], [half, 0], [half, 0.055], [-half, 0.055]];
    smoothPlate('lame-%d' % i, 'plate', ol, yl, t, r, 10, 0, z0)
    + band('lame-edge-%d' % i, 'rim', ol, yl, t, r, 0, z0, 0.05, half - 0.004, 0.006)
    + [rivet('lame-rivet-%d-%s' % [i, s], sx * (half - 0.015), h.curvedTopAt(ol, yl, t, r, half - 0.015), z0 + 0.025) for sd in sides for s in [sd[0]] for sx in [sd[1]]]
    for i in std.range(0, lames - 1)
  ])
  // Tassets: two lames each, hanging from the lowest waist lame on a short strap.
  + (if std.get(o, 'tassets', false) then std.flattenArrays([
       [
         box('tasset-hanger-' + s, 'strap', [sx * 0.1 - 0.01, 0, lameEnd - 0.03], [sx * 0.1 + 0.01, 0.012, lameEnd + 0.02]),
       ]
       + std.flattenArrays([
         local ol = [[-0.08, 0], [0.08, 0], [0.075, 0.065], [-0.075, 0.065]], z0 = lameEnd + 0.01 + k * 0.055;
         smoothPlate('tasset-%s-%d' % [s, k], 'plate', ol, 0.004 - k * 0.002, t, 0.2, 8, sx * 0.1, z0)
         + band('tasset-edge-%s-%d' % [s, k], 'rim', ol, 0.004 - k * 0.002, t, 0.2, sx * 0.1, z0, 0.06, 0.07, 0.006)
         for k in [0, 1]
       ])
       for sd in sides
       for s in [sd[0]]
       for sx in [sd[1]]
     ]) else [])
  // Spaulders: lames arched across each upper arm, laid out beyond the shoulders.
  + (if sp > 0 then std.flattenArrays([
       local ol = rect(0.12, 0.05), z0 = -0.27 + k * 0.04;
       smoothPlate('spaulder-%s-%d' % [s, k], 'plate', ol, 0.012 - k * 0.004, t, 0.09, 8, sx * 0.27, z0)
       + band('spaulder-edge-%s-%d' % [s, k], 'rim', ol, 0.012 - k * 0.004, t, 0.09, sx * 0.27, z0, -0.022, 0.055, 0.006)
       for sd in sides
       for s in [sd[0]]
       for sx in [sd[1]]
       for k in std.range(0, sp - 1)
     ]) + [
       box('spaulder-strap-' + s, 'strap', [sx * 0.23 - 0.01, 0, -0.28], [sx * 0.23 + 0.01, 0.014, -0.24])
       for sd in sides
       for s in [sd[0]]
       for sx in [sd[1]]
     ] else [])
  + (if std.get(o, 'plackart', false) then
       local pl = [[-0.13, -0.08], [0.13, -0.08], [0.17, 0.0], [0.17, 0.06], [-0.17, 0.06], [-0.17, 0.0]];
       local yp = yb + (0.2 * 0.2 - 0.17 * 0.17) / (2 * r) + t;
       smoothPlate('plackart', 'plate', pl, yp, t, r, 12)
       + [
         rivet('plackart-rivet-%d' % i, c[0], h.curvedTopAt(pl, yp, t, r, c[0]), c[1])
         for i in std.range(0, 3)
         for c in [[[-0.1, -0.06], [0.1, -0.06], [-0.14, 0.04], [0.14, 0.04]][i]]
       ]
     else []);

// Lorica segmentata lying front up, 640 mm across the shoulder guards and 560 mm from the collar to the lowest hoop:
// seven girth hoops of curved iron strip overlapping down the body, each closed at the front by a pair of brass
// hooks; above them a breast plate and a collar plate either side of the neck, joined by brass hinges; and four
// arched lames over each shoulder on two straps, all seated on one leather backing.
// Slots: plate, edge, fitting, strap.
local lorica() =
  local t = 0.003, r = 0.32;
  local hoops = [
    local z0 = -0.1 + i * 0.05, half = 0.2 - i * 0.006, yh = 0.004;
    local ol = rect(2 * half, 0.056);
    smoothPlate('hoop-%d' % i, 'plate', ol, yh, t, r, 12, 0, z0)
    + band('hoop-edge-%d' % i, 'edge', ol, yh, t, r, 0, z0, 0.026, half - 0.004, 0.004, 8)
    + [
      box('hoop-hook-%d-%s' % [i, s], 'fitting', [sx * 0.022 - 0.007, h.curvedTopAt(ol, yh, t, r, 0.02) - 0.002, z0 - 0.012], [sx * 0.022 + 0.007, h.curvedTopAt(ol, yh, t, r, 0.02) + 0.004, z0 + 0.012])
      for sd in sides
      for s in [sd[0]]
      for sx in [sd[1]]
    ]
    + [box('hoop-gap-%d' % i, 'strap', [-0.003, h.curvedTopAt(ol, yh, t, r, 0) - 0.001, z0 - 0.024], [0.003, h.curvedTopAt(ol, yh, t, r, 0) + 0.002, z0 + 0.024])]
    for i in std.range(0, 6)
  ];
  // Breast and collar plates: two pairs either side of the neck opening.
  local upper = std.flattenArrays([
    [
      h.prism('breast-' + s, 'plate', 'y', [[q[1], sx * q[0]] for q in [[0.03, -0.17], [0.2, -0.17], [0.2, -0.1], [0.03, -0.1]]], 0.004, 0.022),
      h.prism('collar-' + s, 'plate', 'y', [[q[1], sx * q[0]] for q in [[0.08, -0.29], [0.15, -0.29], [0.2, -0.22], [0.2, -0.16], [0.03, -0.16], [0.03, -0.2]]], 0.004, 0.026),
      box('breast-edge-' + s, 'edge', [std.min(sx * 0.03, sx * 0.2), 0.022, -0.106], [std.max(sx * 0.03, sx * 0.2), 0.025, -0.1]),
      box('collar-edge-' + s, 'edge', [std.min(sx * 0.03, sx * 0.08), 0.026, -0.205], [std.max(sx * 0.03, sx * 0.08), 0.029, -0.161]),
    ]
    + [
      box('hinge-%s-%d' % [s, k], 'fitting', [sx * x - 0.012, 0.022, -0.172], [sx * x + 0.012, 0.03, -0.148])
      for k in [0, 1]
      for x in [[0.07, 0.16][k]]
    ]
    + [box('buckle-' + s, 'fitting', [sx * 0.045 - 0.009, 0.022, -0.14], [sx * 0.045 + 0.009, 0.03, -0.12])]
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
  ]);
  // Shoulder guards: four arched lames over each shoulder, the top one overlapping the next, on two straps.
  local shoulders = std.flattenArrays([
    local ol = rect(0.13, 0.042), z0 = -0.285 + k * 0.036, ys = 0.004;
    smoothPlate('shoulder-%s-%d' % [s, k], 'plate', ol, ys, t, 0.08, 8, sx * 0.27, z0)
    + band('shoulder-edge-%s-%d' % [s, k], 'edge', ol, ys, t, 0.08, sx * 0.27, z0, 0.018, 0.06, 0.004)
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
    for k in std.range(0, 3)
  ]) + [
    box('shoulder-strap-%s-%d' % [s, k], 'strap', [sx * x - 0.009, 0, -0.3], [sx * x + 0.009, 0.004, -0.16])
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
    for k in [0, 1]
    for x in [[0.235, 0.305][k]]
  ];
  // One leather backing under the hoops and upper plates, so every plate seats on it at one height.
  local backing = [h.prism('backing', 'strap', 'y', [[-0.29, -0.19], [-0.29, 0.19], [0.25, 0.155], [0.25, -0.155]], 0, 0.004)];
  backing + std.flattenArrays(hoops) + upper + shoulders;

// Bronze scale armour lying front up, 400 mm across the body and 600 mm from the neck to the foot of its hanging
// strips: overlapping rows of small bronze scales on a leather backing, each row staggered half a scale; a bronze
// band at the neck and arm holes, scaled flaps over the shoulders, and a skirt of leather strips tipped in bronze at
// the hem. A few scales are torn away where it was struck. Slots: backing, scale, edge, strip, tip, scar.
local scaleArmour() =
  local front = torso(0.1);
  local halfAt(z) = if z < -0.22 then 0.11 + (0.2 - 0.11) * (z + 0.3) / 0.08 else 0.2;
  local sw = 0.034, sl = 0.04;
  local missing = { '3-2': true, '4-3': true, '7-8': true, '9-5': true };
  local rows = std.flattenArrays([
    local z0 = -0.285 + i * 0.03, off = if i % 2 == 0 then 0 else sw / 2;
    local half = halfAt(z0 + sl / 2) - 0.004, n = std.floor(2 * half / sw);
    local x0 = -n * sw / 2 + (if i % 2 == 0 then 0 else sw / 4);
    [
      local xa = std.max(-half, x0 + j * sw), xb = std.min(half, x0 + (j + 1) * sw - 0.003);
      box('scale-%d-%d' % [i, j], if std.objectHas(missing, '%d-%d' % [i, j]) then 'scar' else 'scale', [xa, 0.008 + (12 - i) * 0.0015, z0], [xb, 0.012 + (12 - i) * 0.0015, z0 + sl])
      for j in std.range(0, n - 1)
    ]
    for i in std.range(0, 12)
  ]);
  [h.prism('backing', 'backing', 'y', [[q[1], q[0]] for q in front], 0, 0.008)]
  + rows
  + [box('neck-band', 'edge', [-0.11, 0.03, -0.31], [0.11, 0.036, -0.29])]
  + [
    h.prism('arm-band-' + s, 'edge', 'y', [[q[1], sx * q[0]] for q in [[0.11, -0.31], [0.12, -0.31], [0.21, -0.225], [0.2, -0.215]]], 0.026, 0.032)
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
  ]
  // Shoulder flaps beyond the arm holes, scaled in three rows.
  + std.flattenArrays([
    [box('flap-' + s, 'backing', [std.min(sx * 0.21, sx * 0.33), 0, -0.3], [std.max(sx * 0.21, sx * 0.33), 0.006, -0.17])]
    + [
      box('flap-scale-%s-%d-%d' % [s, k, j], 'scale', [std.min(sx * (0.214 + j * 0.029), sx * (0.24 + j * 0.029)), 0.006 + (3 - k) * 0.0015, -0.296 + k * 0.042], [std.max(sx * (0.214 + j * 0.029), sx * (0.24 + j * 0.029)), 0.01 + (3 - k) * 0.0015, -0.256 + k * 0.042])
      for k in [0, 1, 2]
      for j in [0, 1, 2, 3]
    ]
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
  ])
  // Hanging leather strips below the hem, each tipped in bronze.
  + std.flattenArrays([
    local x = -0.18 + j * 0.04;
    [
      box('strip-%d' % j, 'strip', [x - 0.016, 0, 0.09], [x + 0.016, 0.006, 0.28]),
      box('strip-tip-%d' % j, 'tip', [x - 0.016, 0.006, 0.255], [x + 0.016, 0.009, 0.28]),
    ]
    for j in std.range(0, 9)
  ]);

// A riot chest guard lying front up, 640 mm across the arm guards and 700 mm from the collar to the foot of the thigh
// guards: a padded back panel under a moulded plastic chest shell with webbing rows and a pale band where the
// lettering goes; a curved guard for each upper arm joined at the shoulder, and a curved guard for each thigh hung
// from the hem on a strap; hook-and-loop straps at the sides. Slots: shell, pad, webbing, band, strap.
local riotChest() =
  local t = 0.006, r = 0.32, yb = 0.012;
  local front = torso(0.08);
  local face(id, slot, a, b, wd) = h.onCurvedFace(id, slot, front, yb, t, r, a, b, wd);
  [h.prism('back', 'pad', 'y', [[q[1], q[0] * 1.04] for q in torso(0.1)], 0, yb)]
  + smoothPlate('chest', 'shell', front, yb, t, r, 14)
  + band('collar', 'pad', front, yb, t, r, 0, 0, -0.29, 0.11, 0.02)
  + band('lettering', 'band', front, yb, t, r, 0, 0, -0.2, 0.16, 0.05, 8)
  + std.flattenArrays([band('web-%d' % i, 'webbing', front, yb, t, r, 0, 0, -0.12 + i * 0.045, 0.17, 0.025, 8) for i in [0, 1, 2]])
  + [
    face('side-strap-%s-%d' % [s, k], 'strap', [sx * 0.2, z], [sx * 0.14, z], 0.04)
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
    for k in [0, 1]
    for z in [[-0.1, 0.02][k]]
  ]
  // Upper arm guards laid out beyond the shoulders.
  + std.flattenArrays([
    local ol = [[-0.055, -0.3], [0.055, -0.3], [0.05, -0.1], [-0.05, -0.1]];
    smoothPlate('arm-' + s, 'shell', ol, 0.004, t, 0.07, 8, sx * 0.27, 0)
    + band('arm-rim-' + s, 'pad', ol, 0.004, t, 0.07, sx * 0.27, 0, -0.105, 0.05, 0.012)
    + [
      box('arm-joint-' + s, 'strap', [std.min(sx * 0.19, sx * 0.23), 0.004, -0.29], [std.max(sx * 0.19, sx * 0.23), 0.016, -0.25]),
      box('arm-strap-' + s, 'strap', [std.min(sx * 0.21, sx * 0.34), 0, -0.17], [std.max(sx * 0.21, sx * 0.34), 0.004 + 0.006 + 0.055 * 0.055 / 0.14 + 0.002, -0.14]),
    ]
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
  ])
  // Thigh guards hung below the hem.
  + std.flattenArrays([
    local ol = [[-0.08, 0.13], [0.08, 0.13], [0.07, 0.4], [-0.07, 0.4]];
    smoothPlate('thigh-' + s, 'shell', ol, 0.002, t, 0.12, 8, sx * 0.1, 0)
    + band('thigh-rim-' + s, 'pad', ol, 0.002, t, 0.12, sx * 0.1, 0, 0.395, 0.065, 0.01)
    + [
      box('thigh-hanger-' + s, 'strap', [sx * 0.1 - 0.015, 0, 0.07], [sx * 0.1 + 0.015, 0.03, 0.15]),
      box('thigh-strap-' + s, 'strap', [std.min(sx * 0.0, sx * 0.21), 0, 0.3], [std.max(sx * 0.0, sx * 0.21), 0.002 + 0.006 + 0.08 * 0.08 / 0.24 + 0.002, 0.33]),
    ]
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
  ]);

// A paper cuirass lying front up, 460 mm across and 600 mm from the shoulders to the hem: a back panel and a front
// panel, each a grid of thick stacked paper blocks (old books and catalogues) with their page edges showing, bound
// together by bands of silver duct tape round the waist and chest and over the shoulders.
// Slots: cover, pages, tape.
local bookPlate() =
  local block(p, x0, x1, z0, z1, y0, ht) = [
    box(p + '-pages', 'pages', [x0, y0, z0], [x1, y0 + ht, z1]),
    box(p + '-cover', 'cover', [x0 - 0.002, y0 + ht, z0 - 0.002], [x1 + 0.002, y0 + ht + 0.004, z1 + 0.002]),
  ];
  local panel(p, y0, ht) = std.flattenArrays([
    block('%s-%d-%d' % [p, i, j], -0.22 + j * 0.225, -0.005 + j * 0.225, -0.3 + i * 0.2, -0.105 + i * 0.2, y0, ht)
    for i in [0, 1, 2]
    for j in [0, 1]
  ]);
  local yTop = 0.03 + 0.004 + 0.032 + 0.004;
  panel('back', 0, 0.03)
  + panel('front', 0.034, 0.032)
  + [
    box('tape-band-%d' % k, 'tape', [-0.232, 0, z - 0.024], [0.232, yTop + 0.002, z + 0.024])
    for k in [0, 1, 2]
    for z in [[-0.21, -0.005, 0.2][k]]
  ]
  + [
    box('tape-shoulder-' + s, 'tape', [sx * 0.13 - 0.024, 0, -0.33], [sx * 0.13 + 0.024, yTop + 0.002, -0.1])
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
  ]
  + [box('tape-tail', 'tape', [0.232, 0, -0.03], [0.3, 0.002, 0.018])];

// A carpet cuirass folded at the shoulders and lying front up, 520 mm across and 600 mm from the shoulder fold to
// the hem: a rectangle of thick carpet doubled over with a head hole at the fold, its cut edges bound, and a cord
// tied round the waist with a knot and loose ends. Slots: carpet, binding, cord, hole.
local carpetCuirass() =
  local yb = 0.014, yf = 0.028, w = 0.26;
  [
    box('back', 'carpet', [-w - 0.008, 0, -0.3], [w + 0.008, yb, 0.31]),
    // The front layer around the head hole, built from convex pieces.
    box('front-low', 'carpet', [-w, yb, -0.19], [w, yf, 0.3]),
    box('front-left', 'carpet', [-w, yb, -0.3], [-0.1, yf, -0.19]),
    box('front-right', 'carpet', [0.1, yb, -0.3], [w, yf, -0.19]),
    // The head hole: the back layer's dark underside showing through.
    box('hole', 'hole', [-0.1, yb, -0.3], [0.1, yb + 0.002, -0.19]),
    box('hem-binding', 'binding', [-w, yf, 0.285], [w, yf + 0.003, 0.3]),
  ]
  + [
    box('side-binding-' + s, 'binding', [std.min(sx * w, sx * (w - 0.015)), yf, -0.3], [std.max(sx * w, sx * (w - 0.015)), yf + 0.003, 0.3])
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
  ]
  // Waist cord round both layers, knotted on the right with two loose ends.
  + [
    box('cord', 'cord', [-w - 0.012, 0, 0.09], [w + 0.012, yf + 0.008, 0.102]),
    box('knot', 'cord', [0.12, yf, 0.08], [0.15, yf + 0.016, 0.112]),
    box('cord-end-0', 'cord', [0.13, yf, 0.112], [0.142, yf + 0.008, 0.21]),
    box('cord-end-1', 'cord', [0.145, yf, 0.112], [0.157, yf + 0.008, 0.19]),
  ];

// A sleeveless mail vest lying front up, 480 mm across and 620 mm from the shoulders to the hem: a mail body with
// broad mail shoulders either side of the neck, rows of rings across it, and leather straps over each shoulder that
// buckle to a leather band round the waist to spread the weight. Slots: mail, ring, strap, buckle.
local mailVest() =
  local y0 = 0, yt = 0.008;
  local sheet(p, x0, x1, z0, z1) =
    [box(p, 'mail', [x0, y0, z0], [x1, yt, z1])]
    + [
      box('%s-ring-%d' % [p, i], 'ring', [x0 + 0.004, yt, z0 + 0.006 + i * 0.012], [x1 - 0.004, yt + 0.003, z0 + 0.01 + i * 0.012])
      for i in std.range(0, std.floor((z1 - z0 - 0.012) / 0.012))
    ];
  sheet('body', -0.24, 0.24, -0.1, 0.3)
  + std.flattenArrays([
    sheet('shoulder-' + s, std.min(sx * 0.09, sx * 0.2), std.max(sx * 0.09, sx * 0.2), -0.32, -0.1)
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
  ])
  + [box('waist-band', 'strap', [-0.245, yt, 0.12], [0.245, yt + 0.006, 0.15])]
  + std.flattenArrays([
    [
      box('shoulder-strap-' + s, 'strap', [sx * 0.145 - 0.011, yt, -0.33], [sx * 0.145 + 0.011, yt + 0.006, 0.12]),
      box('strap-buckle-' + s, 'buckle', [sx * 0.145 - 0.015, yt + 0.004, 0.1], [sx * 0.145 + 0.015, yt + 0.01, 0.118]),
    ]
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
  ])
  + [box('waist-buckle', 'buckle', [-0.02, yt + 0.004, 0.115], [0.02, yt + 0.012, 0.155])];

// A hammered sheet-metal chest guard lying front up: a front sheet bent across the chest over a flat back sheet,
// laced at the shoulders and held by belts buckled at the front, with dark hammer dents across it.
// Options (o): hem (z of the lower edge; the neck is at -0.3), belts (z of each belt), heavy (a second sheet bolted
// over the chest). Slots: sheet, dent, strap, buckle, bolt.
local sheetGuard(o) =
  local t = 0.004, yb = 0.006, r = 0.5, hem = o.hem, half = std.get(o, 'half', 0.22);
  local front = torso(hem, half);
  local top(x) = h.curvedTopAt(front, yb, t, r, x);
  local dents = [[-0.15, -0.2], [0.08, -0.12], [-0.05, 0.0], [0.13, 0.1], [-0.16, 0.18], [0.02, 0.25], [0.12, -0.22]];
  local chest = [[-0.15, -0.24], [0.15, -0.24], [0.17, -0.19], [0.17, 0.0], [-0.17, 0.0], [-0.17, -0.19]];
  local chestY = yb + t + (half * half - 0.17 * 0.17) / (2 * r);
  [h.prism('back', 'sheet', 'y', [[q[1], q[0] * 1.04] for q in front], 0, yb)]
  + smoothPlate('front', 'sheet', front, yb, t, r, 12)
  + [
    h.onCurvedFace('dent-%d' % i, 'dent', front, yb, t, r, d, [d[0] + 0.03, d[1] + 0.02], 0.016)
    for i in std.range(0, std.length(dents) - 1)
    for d in [dents[i]]
    if d[1] + 0.03 < hem
  ]
  + std.flattenArrays([
    band('belt-%d' % k, 'strap', front, yb, t, r, 0, 0, o.belts[k], half, 0.035, 8)
    + [
      box('belt-%d-buckle' % k, 'buckle', [0.04, top(0.06), o.belts[k] - 0.024], [0.09, top(0.06) + 0.008, o.belts[k] + 0.024]),
      box('belt-%d-tail' % k, 'strap', [half, 0, o.belts[k] - 0.017], [half + 0.08, 0.004, o.belts[k] + 0.017]),
    ]
    for k in std.range(0, std.length(o.belts) - 1)
  ])
  + [
    h.onCurvedFace('lace-%s-%d' % [s, k], 'strap', front, yb, t, r, [sx * (0.13 + k * 0.03), -0.31], [sx * (0.15 + k * 0.03), -0.25], 0.008)
    for sd in sides
    for s in [sd[0]]
    for sx in [sd[1]]
    for k in [0, 1]
  ]
  + (if std.get(o, 'heavy', false) then
       smoothPlate('chest', 'sheet', chest, chestY, t, r, 10)
       + [
         local yy = h.curvedTopAt(chest, chestY, t, r, c[0]);
         box('chest-bolt-%d' % i, 'bolt', [c[0] - 0.006, yy - 0.001, c[1] - 0.006], [c[0] + 0.006, yy + 0.006, c[1] + 0.006])
         for i in std.range(0, 5)
         for c in [[[-0.13, -0.21], [0.13, -0.21], [-0.15, -0.11], [0.15, -0.11], [-0.15, -0.02], [0.15, -0.02]][i]]
       ]
     else []);

local steelFinish(steel) = { plate: steel, rim: steel, strap: 'leather-brown', buckle: 'steel', rivet: 'steel' };

[
  // Lorica segmentata, 640 mm across the shoulder guards and 600 mm long laid flat.
  h.compound('armor_lorica', 9, lorica(), {
    plate: 'iron-dull', edge: 'steel-grey', fitting: 'brass-polished', strap: 'leather-brown',
  })
  + { voxelGrain: 0.004 },

  // Medium steel chestplate, 4 mm plate: 580 mm across the spaulders and 600 mm from the neck to the tassets.
  h.compound('armor_mc_chestplate', 20, chestplate({ t: 0.004, lames: 2, spaulder: 2, tassets: true }), steelFinish('steel-grey'))
  + { voxelGrain: 0.004 },

  // Medium steel heavy chestplate, 6 mm plate with a plackart and three lames.
  h.compound('armor_mc_heavy_chestplate', 33, chestplate({ t: 0.006, lames: 3, spaulder: 3, tassets: true, plackart: true }), steelFinish('steel-grey'))
  + { voxelGrain: 0.004 },

  // Medium steel light chestplate, 2 mm plate: breastplate and one lame, 400 mm across and 400 mm long.
  h.compound('armor_mc_light_chestplate', 9, chestplate({ t: 0.003, lames: 1 }), steelFinish('steel-grey'))
  + { voxelGrain: 0.004 },

  h.compound('armor_qt_chestplate', 20, chestplate({ t: 0.004, lames: 2, spaulder: 2, tassets: true }), steelFinish('steel-heat-tint'))
  + { voxelGrain: 0.004 },

  h.compound('armor_qt_heavy_chestplate', 33, chestplate({ t: 0.006, lames: 3, spaulder: 3, tassets: true, plackart: true }), steelFinish('steel-heat-tint'))
  + { voxelGrain: 0.004 },

  h.compound('armor_qt_light_chestplate', 9, chestplate({ t: 0.003, lames: 1 }), steelFinish('steel-heat-tint'))
  + { voxelGrain: 0.004 },

  // Riot chest guard with arm and thigh guards, 640 mm across and 700 mm long laid flat.
  h.compound('armor_riot_torso', 1.2, riotChest(), {
    shell: 'plastic-matte-black', pad: 'plastic-charcoal', webbing: 'webbing-black', band: 'cloth-cream', strap: 'hook-loop-grey',
  })
  + { voxelGrain: 0.004 },

  // Bronze scale armour, 660 mm across the shoulder flaps and 590 mm long.
  h.compound('armor_thessalonian', 7.7, scaleArmour(), {
    backing: 'leather-brown', scale: 'bronze-polished', edge: 'bronze', strip: 'leather-chestnut', tip: 'bronze', scar: 'leather-brown',
  })
  + { voxelGrain: 0.004 },

  // Paper-block cuirass, 460 mm across and 630 mm long.
  h.compound('bookplate', 9.2, bookPlate(), { cover: 'paper-butcher', pages: 'paper-white', tape: 'tape-silver' })
  + { voxelGrain: 0.004 },

  // Carpet cuirass folded at the shoulders, 540 mm across and 610 mm long.
  h.compound('carpet_cuirass', 2.5, carpetCuirass(), { carpet: 'carpet-pile', binding: 'cloth-brown', cord: 'cord-cotton', hole: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },

  // Hardened mail vest, 490 mm across and 630 mm long laid flat.
  h.compound('ch_chainmail_vest', 4.5, mailVest(), { mail: 'steel-mail-dark', ring: 'steel-mail', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // Hardened sheet-metal chest guard, 460 mm across and 650 mm from the neck to the hem.
  h.compound('ch_chestguard_metal_sheets', 12, sheetGuard({ hem: 0.35, belts: [0.05, 0.2] }), {
    sheet: 'steel-hardened', dent: 'steel-grey', strap: 'leather-brown', buckle: 'steel', bolt: 'steel',
  })
  + { voxelGrain: 0.004 },

  h.compound('ch_chestguard_metal_sheets_heavy', 33, sheetGuard({ hem: 0.35, belts: [0.05, 0.2], heavy: true }), {
    sheet: 'steel-hardened', dent: 'steel-grey', strap: 'leather-brown', buckle: 'steel', bolt: 'steel',
  })
  + { voxelGrain: 0.004 },

  // Light guard over the upper chest only, 440 mm across and 380 mm from the neck to the lower edge.
  h.compound('ch_chestguard_metal_sheets_light', 6, sheetGuard({ hem: 0.08, belts: [0.03], half: 0.21 }), {
    sheet: 'steel-hardened', dent: 'steel-grey', strap: 'leather-brown', buckle: 'steel', bolt: 'steel',
  })
  + { voxelGrain: 0.004 },
]
