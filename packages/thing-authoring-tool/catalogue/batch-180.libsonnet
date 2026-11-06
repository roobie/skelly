local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;

// Torso armour laid flat, front up, neck towards -z, as batches 170 and 178 lay theirs; mail vests and padded or cloth
// tops are folded on a shelf instead, neck at +z, as batch 173 folds its mail.

local sbox = g.sbox;
// A flat convex outline of [x, z] points lying on y from y0 to y1.
local flat(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y0, y1);
local sides = [-1, 1];
local sideName(s) = if s < 0 then 'l' else 'r';

// A breastplate outline `w` across and `l` long, centred on [0, 0], its armholes cut away at the top corners.
local chestOutline(w, l, arm=0.13) = [
  [-w / 2 + 0.07, -l / 2], [w / 2 - 0.07, -l / 2], [w / 2, -l / 2 + arm], [w / 2 - 0.02, l / 2], [-w / 2 + 0.02, l / 2], [-w / 2, -l / 2 + arm],
];
// The same outline grown by `m` all round, for a backplate whose edge shows round the breast.
local backOutline(w, l, m, arm=0.13) = [
  [-w / 2 + 0.07 - m * 0.5, -l / 2 - m], [w / 2 - 0.07 + m * 0.5, -l / 2 - m], [w / 2 + m, -l / 2 + arm], [w / 2 - 0.02 + m, l / 2 + m], [-w / 2 + 0.02 - m, l / 2 + m], [-w / 2 - m, -l / 2 + arm],
];

// Rows of rings: ridges across x every `pitch` along z over a top face at y.
local ridges(p, slot, x0, x1, z0, z1, y, pitch=0.016) = [
  box('%s-%d' % [p, i], slot, [x0, y, z0 + pitch * i], [x1, y + 0.004, z0 + pitch * i + 0.008])
  for i in std.range(0, std.floor((z1 - z0 - 0.008) / pitch))
];

// Mirror armour: a leather jerkin laid front up with a large polished disc over the chest and a smaller one over the
// belly, each with a raised rim and a boss, framed by rectangular plates down the sides and across the shoulders,
// riveted on and buckled at the shoulders. Slots: leather, disc, rim, plate, rivet, strap, buckle.
local mirrorArmour() =
  local w = 0.42, l = 0.52, out = chestOutline(w, l);
  local yL = 0.008;
  local disc(p, r, x, z) = [
    h.dome(p, 'disc', r, 0.014, 0.004, 'y', [x, yL, z]),
    h.turned(p + '-rim', 'rim', 'y', [[0, r - 0.008], [0, r + 0.004], [0.008, r + 0.004], [0.008, r - 0.008], [0, r - 0.008]], [x, yL, z]),
    h.dome(p + '-boss', 'rim', r * 0.2, 0.012, 0.004, 'y', [x, yL + 0.012, z]),
  ] + [
    h.disc('%s-orn-%d' % [p, i], 'rim', 0.006, yL + 0.004, yL + 0.012, x + r * 0.62 * std.sin(i * std.pi / 4), z + r * 0.62 * std.cos(i * std.pi / 4))
    for i in std.range(0, 7)
  ];
  local plate(id, x0, z0, x1, z1) = [
    box(id, 'plate', [x0, yL, z0], [x1, yL + 0.004, z1]),
    h.disc(id + '-rv-a', 'rivet', 0.005, yL + 0.004, yL + 0.007, x0 + 0.012, z0 + 0.012),
    h.disc(id + '-rv-b', 'rivet', 0.005, yL + 0.004, yL + 0.007, x1 - 0.012, z1 - 0.012),
  ];
  [flat('jerkin', 'leather', out, 0, yL)]
  + disc('chest-disc', 0.105, 0, -0.07)
  + disc('belly-disc', 0.065, 0, 0.14)
  + std.flattenArrays([
    plate('side-%s-%d' % [sideName(s), i], std.min(s * 0.13, s * 0.195), -0.11 + i * 0.12, std.max(s * 0.13, s * 0.195), -0.11 + i * 0.12 + 0.11)
    for s in sides
    for i in [0, 1, 2]
  ])
  + std.flattenArrays([
    plate('belly-%s' % sideName(s), std.min(s * 0.075, s * 0.125), 0.08, std.max(s * 0.075, s * 0.125), 0.21)
    for s in sides
  ])
  + std.flattenArrays([
    plate('shoulder-%s' % sideName(s), std.min(s * 0.08, s * 0.135), -0.255, std.max(s * 0.08, s * 0.135), -0.185)
    for s in sides
  ])
  + std.flattenArrays([
    [
      sbox('shoulder-strap-' + sideName(s), 'strap', [s * 0.09, 0, -l / 2 - 0.07], [s * 0.125, yL + 0.006, -l / 2 + 0.01]),
      sbox('shoulder-buckle-' + sideName(s), 'buckle', [s * 0.085, yL + 0.004, -l / 2 + 0.005], [s * 0.13, yL + 0.01, -l / 2 + 0.025]),
      sbox('side-strap-' + sideName(s), 'strap', [s * (w / 2 - 0.01), 0, 0.03], [s * (w / 2 + 0.08), 0.004, 0.055]),
    ]
    for s in sides
  ]);

// A sleeveless mail vest folded on a shelf, neck at +z: a heavy pile ridged where its rows of rings lie, the armholes
// bound in leather and two leather straps across the shoulders to spread the weight. With `rust`, rust patches over
// the rings. Slots: mail, binding, strap, buckle, rust.
local mailVest(o) =
  local c = { w: 0.38, d: 0.3, ht: 0.06, rust: false } + o;
  local w = c.w, d = c.d, ht = c.ht, cz = d / 2 - 0.075;
  [p { slot: 'mail' } for p in h.foldedGarment(w, d, ht, 3)]
  + ridges('rings', 'mail', -w / 2 + 0.008, w / 2 - 0.008, -d / 2 + 0.012, d / 2 - 0.006, ht)
  + h.crescent('neck', 'binding', 0.06, 0.076, -180, 180, 16, ht, ht + 0.007, 0, cz)
  + std.flattenArrays([
    h.crescent('armhole-' + sideName(s), 'binding', 0.05, 0.064, if s > 0 then 180 else 0, if s > 0 then 360 else 180, 10, ht, ht + 0.007, s * w / 2, d / 2 - 0.1)
    for s in sides
  ])
  + std.flattenArrays([
    [
      sbox('strap-' + sideName(s), 'strap', [s * 0.085, ht + 0.004, -d / 2 - 0.004], [s * 0.115, ht + 0.01, d / 2 + 0.004]),
      sbox('strap-drop-' + sideName(s), 'strap', [s * 0.085, ht * 0.3, d / 2], [s * 0.115, ht + 0.01, d / 2 + 0.006]),
      sbox('strap-buckle-' + sideName(s), 'buckle', [s * 0.08, ht + 0.01, -0.02], [s * 0.12, ht + 0.015, 0.0]),
    ]
    for s in sides
  ])
  + (if c.rust then [
       box('rust-a', 'rust', [-0.15, ht + 0.004, -0.11], [-0.06, ht + 0.006, -0.04]),
       box('rust-b', 'rust', [0.03, ht + 0.004, -0.13], [0.13, ht + 0.006, -0.08]),
       box('rust-c', 'rust', [0.12, ht + 0.004, 0.0], [0.17, ht + 0.006, 0.07]),
       box('rust-d', 'rust', [-0.17, ht * 0.2, -d / 2 - 0.002], [-0.08, ht * 0.7, -d / 2 + 0.004]),
       box('rust-e', 'rust', [0.04, ht * 0.4, -d / 2 - 0.002], [0.14, ht * 0.9, -d / 2 + 0.004]),
     ] else []);

// A hard chest guard laid front up: a moulded plastic chest plate over a neoprene vest, three belly plates below it,
// a shaped shoulder cap against either shoulder and webbing straps buckled round the sides. Slots: plate, pad, strap, buckle, vent.
local hardGuard() =
  local w = 0.36, l = 0.3, r = 0.28, t = 0.008, y0 = 0.012, cz = -0.08;
  local out = chestOutline(w, l, 0.1);
  local top(x) = h.curvedTopAt(out, y0, t, r, x);
  local cap = [[-0.05, -0.05], [0.05, -0.05], [0.055, 0.02], [0.035, 0.055], [-0.035, 0.055], [-0.055, 0.02]];
  [flat('vest', 'pad', backOutline(w, 0.52, 0.02, 0.1), 0, y0)]
  + h.curvedPlate('chest', 'plate', out, y0, t, r, 10, 0, cz)
  + [
    h.onCurvedFace('vent-%s-%d' % [sideName(s), i], 'vent', out, y0, t, r, [s * 0.05, -0.08 + i * 0.03], [s * 0.12, -0.08 + i * 0.03], 0.01, 0, cz)
    for s in sides
    for i in [0, 1, 2]
  ]
  + std.flattenArrays([
    local z0 = cz + l / 2 + 0.008 + i * 0.058, hw = w / 2 - 0.035 - i * 0.012;
    h.curvedPlate('belly-%d' % i, 'plate', [[-hw, z0], [hw, z0], [hw, z0 + 0.05], [-hw, z0 + 0.05]], y0, 0.007, r, 8, 0, 0, w / 2)
    for i in [0, 1, 2]
  ])
  + std.flattenArrays([
    [
      sbox('cap-strap-' + sideName(s), 'strap', [s * (w / 2 - 0.03), 0.012, -0.235], [s * (w / 2 + 0.0), 0.02, -0.215]),
    ]
    // A shaped shoulder cap against each shoulder, arched across the arm, its edge picked out in the vent finish.
    + h.smoothPlate('cap-' + sideName(s), 'plate', cap, 0.012, 0.007, 0.07, 8, s * (w / 2 + 0.03), -0.225)
    + h.plateBand('cap-edge-' + sideName(s), 'vent', cap, 0.012, 0.007, 0.07, s * (w / 2 + 0.03), -0.225, 0.045, 0.048, 0.008)
    + [
      sbox('side-strap-' + sideName(s), 'strap', [s * (w / 2 + 0.01), 0, 0.03], [s * (w / 2 + 0.11), 0.004, 0.058]),
      sbox('side-buckle-' + sideName(s), 'buckle', [s * (w / 2 + 0.07), 0.004, 0.026], [s * (w / 2 + 0.095), 0.012, 0.062]),
    ]
    for s in sides
  ]);

// Sheet metal chest guard laid front up: a shallow hammered front sheet over a wider back sheet, riveted to leather
// belts across the front and over the shoulders. Options: l, sheet length (a short one for the half-height light
// guard); double, a second sheet over the first; belts, z of the cross belts. Slots: sheet, rivet, strap, dent.
local sheetGuard(o) =
  local c = { w: 0.44, l: 0.52, double: false, belts: [-0.12, 0.08], arm: 0.13 } + o;
  local w = c.w, l = c.l, r = 0.9, t = 0.008, y0 = 0.006;
  local out = chestOutline(w, l, c.arm);
  local top0(x) = h.curvedTopAt(out, y0, t, r, x);
  local lift = if c.double then 0.008 else 0;
  local top(x) = top0(x) + lift;
  local inner = [[-w / 2 + 0.05, -l / 2 + 0.06], [w / 2 - 0.05, -l / 2 + 0.06], [w / 2 - 0.04, l / 2 - 0.02], [-w / 2 + 0.04, l / 2 - 0.02]];
  [flat('back', 'sheet', backOutline(w, l, 0.025, c.arm), 0, y0)]
  + h.curvedPlate('front', 'sheet', out, y0, t, r, 6)
  + (if c.double then h.curvedPlate('front-over', 'sheet', inner, top0(w / 2 - 0.05) - t - 0.0, 0.008, r, 6, 0, 0, w / 2) else [])
  // Hammer marks: shallow dents scattered over the front sheet.
  + [
    local p = [[-0.12, -0.08], [0.06, -0.15], [0.14, 0.04], [-0.05, 0.12], [-0.15, 0.17], [0.1, 0.18]][i];
    h.disc('dent-%d' % i, 'dent', 0.014, top(p[0]) - 0.002, top(p[0]) + 0.0005, p[0], p[1] * l / 0.52)
    for i in std.range(0, 5)
  ]
  + std.flattenArrays([
    local z = c.belts[i];
    [sbox('belt-%d' % i, 'strap', [-w / 2 - 0.08, 0, z], [w / 2 + 0.08, top(0) + 0.004, z + 0.035])]
    + [h.disc('belt-%d-rivet-%d' % [i, j], 'rivet', 0.006, top(0) + 0.004, top(0) + 0.009, -0.15 + j * 0.1, z + 0.0175) for j in [0, 1, 2, 3]]
    for i in std.range(0, std.length(c.belts) - 1)
  ])
  + std.flattenArrays([
    [
      sbox('shoulder-belt-' + sideName(s), 'strap', [s * 0.09, 0, -l / 2 - 0.08], [s * 0.125, top(s * 0.11) + 0.004, -l / 2 + 0.07]),
      h.disc('shoulder-rivet-' + sideName(s), 'rivet', 0.006, top(s * 0.11) + 0.004, top(s * 0.11) + 0.009, s * 0.1075, -l / 2 + 0.045),
    ]
    for s in sides
  ]);

// A one-piece plate cuirass laid front up over its backplate. Options: t, plate thickness; ridge, a middle ridge;
// edgeRivets, a row of rivets round the edge; scales, shoulder straps faced with small metal scales; rim, a rolled rim.
// dents, hammer marks. Slots: plate, back, rim, ridge, rivet, strap, scale, lining, dent.
local cuirass(o) =
  local c = { w: 0.4, l: 0.46, t: 0.01, r: 0.45, ridge: true, edgeRivets: false, scales: false, rim: true, lining: false, dents: false } + o;
  local w = c.w, l = c.l, t = c.t, r = c.r, y0 = 0.006;
  local out = chestOutline(w, l);
  local top(x) = h.curvedTopAt(out, y0, t, r, x);
  local onChest(id, slot, a, b, wd) = h.onCurvedFace(id, slot, out, y0, t, r, a, b, wd);
  [flat('back', 'back', backOutline(w, l, 0.012), 0, y0)]
  + h.curvedPlate('breast', 'plate', out, y0, t, r, 16)
  + (if c.dents then [
       local p = [[-0.11, -0.1], [0.08, -0.13], [0.13, 0.05], [-0.06, 0.1], [0.02, 0.17]][i];
       onChest('dent-%d' % i, 'dent', [p[0] - 0.012, p[1]], [p[0] + 0.012, p[1]], 0.022)
       for i in std.range(0, 4)
     ] else [])
  + (if c.ridge then [onChest('ridge', 'ridge', [0, -l / 2 + 0.03], [0, l / 2 - 0.02], 0.01)] else [])
  + (if c.rim then [
       onChest('neck-rim', 'rim', [-w / 2 + 0.08, -l / 2 + 0.008], [w / 2 - 0.08, -l / 2 + 0.008], 0.012),
       onChest('arm-rim-l', 'rim', [-w / 2 + 0.065, -l / 2 + 0.01], [-w / 2 + 0.006, -l / 2 + 0.125], 0.012),
       onChest('arm-rim-r', 'rim', [w / 2 - 0.065, -l / 2 + 0.01], [w / 2 - 0.006, -l / 2 + 0.125], 0.012),
       onChest('waist-rim', 'rim', [-w / 2 + 0.03, l / 2 - 0.008], [w / 2 - 0.03, l / 2 - 0.008], 0.012),
     ] else [])
  // A lining edge showing past the waist, red cloth on a cavalry cuirass.
  + (if c.lining then [flat('lining', 'lining', [[-w / 2 + 0.03, l / 2 - 0.01], [w / 2 - 0.03, l / 2 - 0.01], [w / 2 - 0.03, l / 2 + 0.018], [-w / 2 + 0.03, l / 2 + 0.018]], 0, y0 + 0.002)] else [])
  + (if c.edgeRivets then [
       local p = [[-w / 2 + 0.09, -l / 2 + 0.025], [-0.06, -l / 2 + 0.025], [0.06, -l / 2 + 0.025], [w / 2 - 0.09, -l / 2 + 0.025], [-w / 2 + 0.035, -0.03], [w / 2 - 0.035, -0.03], [-w / 2 + 0.035, 0.08], [w / 2 - 0.035, 0.08], [-w / 2 + 0.05, l / 2 - 0.03], [-0.07, l / 2 - 0.03], [0.07, l / 2 - 0.03], [w / 2 - 0.05, l / 2 - 0.03]][i];
       h.disc('edge-rivet-%d' % i, 'rivet', 0.007, top(p[0]) - 0.001, top(p[0]) + 0.005, p[0], p[1])
       for i in std.range(0, 11)
     ] else [])
  + std.flattenArrays([
    [
      sbox('shoulder-strap-' + sideName(s), 'strap', [s * 0.095, 0, -l / 2 - 0.07], [s * 0.14, 0.004, -l / 2 + 0.002]),
      onChest('shoulder-strap-on-' + sideName(s), 'strap', [s * 0.1175, -l / 2 + 0.002], [s * 0.1175, -l / 2 + 0.06], 0.045),
    ]
    + (if c.scales then [
         sbox('shoulder-scale-%s-%d' % [sideName(s), i], 'scale', [s * 0.09, 0.004, -l / 2 - 0.068 + i * 0.014], [s * 0.145, 0.009, -l / 2 - 0.068 + i * 0.014 + 0.016])
         for i in [0, 1, 2, 3]
       ] else [])
    + [sbox('side-strap-' + sideName(s), 'strap', [s * (w / 2 - 0.01), 0, 0.02], [s * (w / 2 + 0.09), 0.004, 0.05])]
    for s in sides
  ]);

// Scrap armour laid front up: irregular metal or rubber pieces in overlapping rows on a cloth backing, each pierced at
// its corners and tied to its neighbours with string. `pieces` lists [x, z, half-width, half-height, slot]. Slots: the
// pieces' own, backing, string.
local tiedPieces(pieces, backing) =
  [flat('backing', backing, chestOutline(0.38, 0.42, 0.11), 0, 0.004)]
  + std.flattenArrays([
    local p = pieces[i], x = p[0], z = p[1], a = p[2], b = p[3], y0 = 0.004 + (i % 2) * 0.004, ht = std.get({ tread: 0.012 }, p[4], 0.004);
    // A slightly skewed quad so no two pieces look cut by machine.
    local k = 0.008 * ((i * 7 % 5) - 2);
    [flat('piece-%d' % i, p[4], [[x - a + k, z - b], [x + a, z - b - k], [x + a - k, z + b], [x - a, z + b + k]], y0, y0 + ht)]
    + (if p[4] == 'tread' then [
         box('lug-%d-%d' % [i, j], 'lug', [x - a + 0.012, y0 + ht, z - b + 0.01 + j * (2 * b - 0.02) / 3], [x + a - 0.012, y0 + ht + 0.005, z - b + 0.01 + j * (2 * b - 0.02) / 3 + (2 * b - 0.02) / 6])
         for j in [0, 1, 2]
       ] else [])
    for i in std.range(0, std.length(pieces) - 1)
  ]);
// Strings tied across the seams between pieces, lying on top at height y.
local strings(pts, y) = [
  local a = pts[i][0], b = pts[i][1];
  g.strip('string-%d' % i, 'string', a, b, y, 0.005, 0.003)
  for i in std.range(0, std.length(pts) - 1)
];
local scrapPieces = [
  [-0.09, -0.15, 0.06, 0.05, 'metal-a'], [0.09, -0.15, 0.06, 0.05, 'metal-b'],
  [-0.13, -0.05, 0.05, 0.05, 'metal-c'], [0.0, -0.05, 0.07, 0.055, 'metal-b'], [0.13, -0.05, 0.05, 0.05, 'metal-a'],
  [-0.12, 0.06, 0.06, 0.055, 'metal-b'], [0.01, 0.06, 0.06, 0.06, 'metal-c'], [0.13, 0.06, 0.05, 0.055, 'metal-d'],
  [-0.08, 0.16, 0.07, 0.045, 'metal-d'], [0.08, 0.16, 0.07, 0.045, 'metal-a'],
];
local tirePieces = [
  [-0.085, -0.15, 0.065, 0.05, 'tread'], [0.085, -0.15, 0.065, 0.05, 'tread'],
  [-0.12, -0.04, 0.06, 0.055, 'tread'], [0.0, -0.045, 0.055, 0.06, 'tread'], [0.12, -0.04, 0.06, 0.055, 'tread'],
  [-0.11, 0.075, 0.065, 0.055, 'tread'], [0.03, 0.075, 0.07, 0.055, 'tread'],
  [-0.06, 0.17, 0.08, 0.04, 'tread'], [0.1, 0.17, 0.06, 0.04, 'tread'],
];
local scrapStrings(y) = strings([
  [[-0.03, -0.17], [0.03, -0.13]], [[-0.03, -0.13], [0.03, -0.17]],
  [[-0.1, -0.11], [-0.08, -0.08]], [[0.1, -0.11], [0.08, -0.08]],
  [[-0.08, 0.0], [-0.05, 0.03]], [[0.08, 0.0], [0.05, 0.03]],
  [[-0.08, 0.12], [-0.05, 0.1]], [[0.07, 0.12], [0.09, 0.1]],
  [[-0.2, -0.2], [-0.16, -0.1]], [[0.2, -0.2], [0.16, -0.1]],
], y);

// Football shoulder pads laid front up: an arched shell over each shoulder with a smaller epaulette over its outer
// edge, the front panels either side of a laced gap below the neck and a back panel above it, padding showing at the
// edges. Slots: shell, pad, lace, strap.
local shoulderPads() =
  local arch = [[-0.11, -0.095], [0.11, -0.095], [0.11, 0.095], [-0.11, 0.095]];
  local epaulette = [[-0.065, -0.068], [0.065, -0.068], [0.065, 0.068], [-0.065, 0.068]];
  [
    flat('pad-front-' + sideName(s), 'pad', [[s * 0.02, -0.02], [s * 0.2, -0.02], [s * 0.19, 0.2], [s * 0.025, 0.21]], 0, 0.02)
    for s in sides
  ]
  + [flat('pad-back', 'pad', [[-0.19, -0.32], [0.19, -0.32], [0.21, -0.13], [-0.21, -0.13]], 0, 0.02)]
  + std.flattenArrays([
    h.curvedPlate('front-' + sideName(s), 'shell', [[s * 0.03, 0.0], [s * 0.18, 0.0], [s * 0.17, 0.19], [s * 0.035, 0.2]], 0.02, 0.006, 0.3, 6, 0, 0, 0.2)
    for s in sides
  ])
  + h.curvedPlate('back', 'shell', [[-0.18, -0.31], [0.18, -0.31], [0.2, -0.15], [-0.2, -0.15]], 0.02, 0.006, 0.3, 8)
  + h.crescent('neck', 'pad', 0.075, 0.1, -95, 95, 12, 0.02, 0.05, 0, -0.08)
  + std.flattenArrays([
    [
      sbox('arm-strap-' + sideName(s), 'strap', [s * 0.06, 0.0, 0.22], [s * 0.1, 0.006, 0.32]),
    ]
    // The shoulder arch bridging the front and back panels, and the epaulette lying over its outer end, each a domed
    // shell with a foam rim showing along its front and back edges.
    + h.smoothPlate('arch-' + sideName(s), 'shell', arch, 0.026, 0.008, 0.16, 10, s * 0.15, -0.065)
    + std.flattenArrays([
      h.plateBand('arch-rim-%s-%d' % [sideName(s), j], 'pad', arch, 0.026, 0.008, 0.16, s * 0.15, -0.065, [-0.088, 0.088][j], 0.105, 0.012, 8)
      for j in [0, 1]
    ])
    + h.smoothPlate('epaulette-' + sideName(s), 'shell', epaulette, 0.05, 0.007, 0.09, 8, s * 0.255, -0.065)
    + std.flattenArrays([
      h.plateBand('epaulette-rim-%s-%d' % [sideName(s), j], 'pad', epaulette, 0.05, 0.007, 0.09, s * 0.255, -0.065, [-0.062, 0.062][j], 0.06, 0.01, 6)
      for j in [0, 1]
    ])
    for s in sides
  ])
  + [
    g.strip('lace-%d' % i, 'lace', [-0.04, 0.03 + i * 0.045], [0.04, 0.05 + i * 0.045], 0.045 - i * 0.004 + 0.0, 0.006, 0.003)
    for i in [0, 1, 2, 3]
  ];

// Patches sewn over a folded top: [x, z, w, d, slot] rectangles on the top face at y.
local patches(list, y) = [
  local p = list[i];
  box('patch-%d' % i, p[4], [p[0] - p[2] / 2, y, p[1] - p[3] / 2], [p[0] + p[2] / 2, y + 0.005 + 0.002 * (i % 2), p[1] + p[3] / 2])
  for i in std.range(0, std.length(list) - 1)
];

[
  // Hardened steel mirror armour laid flat, 520 mm from neck to waist and 600 mm across its side straps: a 210 mm
  // polished disc over the chest and a 130 mm one over the belly, rectangular plates round them, on a leather jerkin.
  h.compound('ch_mirror_armor', 5, mirrorArmour(), { leather: 'leather-chestnut', disc: 'mirror-silver', rim: 'brass-dull', plate: 'steel-hardened', rivet: 'brass-dull', strap: 'leather-black', buckle: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // A rusty sleeveless mail vest folded on a shelf, 380 mm by 300 mm and 60 mm tall.
  h.compound('chainmail_junk_vest', 5.6, mailVest({ rust: true }), { mail: 'steel-mail', binding: 'leather-tan', strap: 'leather-tan', buckle: 'iron-dull', rust: 'rust-red' })
  + { voxelGrain: 0.004 },

  // A hard plastic chest guard laid flat, 560 mm from the shoulder caps to the lowest belly plate and 580 mm across the side straps.
  h.compound('chestguard_hard', 0.79, hardGuard(), { plate: 'uhmw-white', pad: 'neoprene-black', strap: 'webbing-black', buckle: 'plastic-matte-black', vent: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },

  // Two hammered steel sheets laid flat, 570 mm from neck to waist and 600 mm across the riveted belts.
  h.compound('chestguard_metal_sheets', 9.6, sheetGuard({}), { sheet: 'steel-bright', rivet: 'steel-grey', strap: 'leather-tan', dent: 'steel-grey' })
  + { voxelGrain: 0.006 },

  // The same with a second sheet laid over the first and riveted through, 750 mm from the shoulder belts to the waist.
  h.compound('chestguard_metal_sheets_heavy', 15, sheetGuard({ l: 0.6, double: true, belts: [-0.14, 0.02, 0.17] }), { sheet: 'steel-bright', rivet: 'steel-grey', strap: 'leather-tan', dent: 'steel-grey' })
  + { voxelGrain: 0.006 },

  // One sheet cut in half for the upper chest, laid flat over its half back sheet: 300 mm long, 600 mm across the belt.
  h.compound('chestguard_metal_sheets_light', 5.3, sheetGuard({ l: 0.28, arm: 0.1, belts: [0.04] }), { sheet: 'steel-bright', rivet: 'steel-grey', strap: 'leather-tan', dent: 'steel-grey' })
  + { voxelGrain: 0.006 },

  // A padded sweatshirt folded on a shelf, 380 mm by 330 mm and 80 mm tall, patched in odd cloth.
  h.compound('cloth_shirt_padded', 1.2,
             g.jacket({ w: 0.38, d: 0.33, ht: 0.08, folds: 4, front: 'none', buttons: [], collar: { r: 0.06, wd: 0.018, ht: 0.012, gap: 0 }, sleeves: { kind: 'flat', w: 0.085, t: 0.008 } })
             + patches([[-0.06, -0.07, 0.1, 0.09, 'patch-a'], [0.06, -0.05, 0.09, 0.1, 'patch-b'], [0.0, -0.135, 0.13, 0.04, 'patch-c'], [-0.15, 0.02, 0.06, 0.12, 'patch-b'], [0.15, -0.06, 0.06, 0.1, 'patch-a'], [0.15, 0.08, 0.06, 0.07, 'patch-c']], 0.08)
             + [box('hem-rib', 'cuff', [-0.19, 0.0, -0.18], [0.19, 0.08, -0.165])],
             { cloth: 'wool-grey', collar: 'cloth-charcoal', sleeve: 'wool-grey', cuff: 'cloth-charcoal', 'patch-a': 'cloth-khaki', 'patch-b': 'cloth-denim', 'patch-c': 'cloth-red' })
  + { voxelGrain: 0.004 },

  // A padded sleeveless shirt folded on a shelf, 360 mm by 320 mm and 60 mm tall, a patchwork of mismatched cloth.
  h.compound('cloth_vest_padded', 0.69,
             g.jacket({ w: 0.36, d: 0.32, ht: 0.06, folds: 3, front: 'none', buttons: [], collar: null })
             + h.crescent('neck', 'binding', 0.065, 0.08, -180, 180, 16, 0.06, 0.066, 0, 0.07)
             + std.flattenArrays([h.crescent('armhole-' + sideName(s), 'binding', 0.05, 0.064, if s > 0 then 180 else 0, if s > 0 then 360 else 180, 10, 0.06, 0.066, s * 0.18, 0.06) for s in sides])
             + patches([[-0.08, -0.09, 0.12, 0.1, 'patch-a'], [0.06, -0.1, 0.11, 0.09, 'patch-b'], [-0.08, 0.0, 0.08, 0.06, 'patch-c'], [0.07, -0.01, 0.09, 0.08, 'patch-d'], [0.0, -0.145, 0.2, 0.025, 'patch-c']], 0.06),
             { cloth: 'cloth-khaki', binding: 'cloth-charcoal', 'patch-a': 'cloth-blue', 'patch-b': 'cloth-red', 'patch-c': 'cloth-green', 'patch-d': 'cloth-yellow' })
  + { voxelGrain: 0.004 },

  // A plain one-piece bronze cuirass laid flat, 480 mm from neck to waist and 600 mm across its side straps.
  h.compound('cuirass_bronze', 8, cuirass({ w: 0.42, l: 0.48, ridge: false, dents: true }), { plate: 'bronze', back: 'bronze', rim: 'bronze-polished', ridge: 'bronze', rivet: 'bronze', strap: 'leather-tan', scale: 'bronze', lining: 'leather-tan', dent: 'verdigris' })
  + { voxelGrain: 0.006 },

  // A steel cavalry cuirass laid flat, 460 mm from neck to waist: breast over back, brass rivets round the edge, brass
  // scales on the shoulder straps and the red lining showing at the waist.
  h.compound('cuirass_lightplate', 7.5, cuirass({ edgeRivets: true, scales: true, lining: true }), { plate: 'steel-grey', back: 'steel-grey', rim: 'steel-grey', ridge: 'steel-grey', rivet: 'brass-polished', strap: 'leather-black', scale: 'brass-polished', lining: 'cloth-crimson', dent: 'steel-grey' })
  + { voxelGrain: 0.006 },

  // A scrap cuirass laid flat, 400 mm from neck to hem: odd metal pieces tied to each other and a cloth backing.
  h.compound('cuirass_scrap', 3.4, tiedPieces(scrapPieces, 'backing') + scrapStrings(0.0125), { backing: 'cloth-khaki', 'metal-a': 'steel-bright', 'metal-b': 'iron-dull', 'metal-c': 'steel-galvanised', 'metal-d': 'rust-red', string: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A tyre cuirass laid flat, 400 mm from neck to hem: tread-faced chunks of tyre tied to each other with string.
  h.compound('cuirass_tire', 4, tiedPieces(tirePieces, 'backing') + scrapStrings(0.026), { backing: 'cloth-khaki', tread: 'rubber-offblack', lug: 'rubber-tread', string: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A fencing jacket folded back up on a shelf, 380 mm by 340 mm and 60 mm tall: a stand collar, the zip down the back
  // off to one side, and the strap that passes between the legs draped over the hem.
  h.compound('fencing_jacket', 0.81,
             g.jacket({ w: 0.38, d: 0.34, ht: 0.06, front: 'none', buttons: [], collar: { r: 0.06, wd: 0.016, ht: 0.018, gap: 0 }, sleeves: { kind: 'flat', w: 0.085, t: 0.006 } })
             + [
               box('zip', 'zip', [0.035, 0.06, -0.17], [0.047, 0.065, 0.03]),
               box('zip-pull', 'zip', [0.032, 0.065, 0.005], [0.05, 0.069, 0.025]),
               box('crotch-strap', 'cloth', [-0.035, 0.06, -0.2], [0.035, 0.066, -0.11]),
               box('crotch-strap-drop', 'cloth', [-0.035, 0.0, -0.176], [0.035, 0.066, -0.17]),
               h.disc('strap-snap', 'zip', 0.008, 0.066, 0.07, 0, -0.19),
             ],
             { cloth: 'cloth-bright-white', collar: 'cloth-bright-white', sleeve: 'cloth-bright-white', zip: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },

  // Football shoulder pads laid flat, 640 mm from back panel to the arm straps and 640 mm across the epaulettes.
  h.compound('football_armor', 1.8, shoulderPads(), { shell: 'enamel-white', pad: 'foam-eva', lace: 'cord-cotton', strap: 'webbing-black' })
  + { voxelGrain: 0.006 },

  // A high steel sleeveless mail vest folded on a shelf, 380 mm by 300 mm and 60 mm tall.
  h.compound('hc_chainmail_vest', 8.5, mailVest({}), { mail: 'steel-mail-dark', binding: 'leather-black', strap: 'leather-black', buckle: 'steel-bright' })
  + { voxelGrain: 0.004 },
]
