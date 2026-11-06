local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;

// Body armour laid flat, front up, neck towards -z, as batches 170 and 172 lay their suits; the quilted cotton armour
// is folded on a shelf instead.

// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);
// A flat convex outline of [x, z] points lying on y from y0 to y1.
local flat(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y0, y1);
local sides = [-1, 1];
local sideName(s) = if s < 0 then 'l' else 'r';

// A breastplate outline `w` across and `l` long, centred on [0, 0], its armholes cut away at the top corners.
local chestOutline(w, l) = [
  [-w / 2 + 0.07, -l / 2], [w / 2 - 0.07, -l / 2], [w / 2, -l / 2 + 0.13], [w / 2 - 0.02, l / 2], [-w / 2 + 0.02, l / 2], [-w / 2, -l / 2 + 0.13],
];

// A steel chestplate laid front up over its backplate: a curved breastplate with a middle ridge and rolled neck and
// arm edges, buckled shoulder and side straps, fauld lames below it for the hips and a shoulder guard of arched
// lames against either shoulder. Options: t, plate thickness as drawn; lames, fauld lames; plackart, a second plate riveted over the belly;
// spaulder, shoulder guard half-width (1 lame below 0.07, 2 below 0.08, else 3). Slots: plate, back, ridge, rivet, strap, buckle.
local chestplate(o) =
  local c = { t: 0.008, lames: 2, plackart: false, spaulder: 0.07 } + o;
  local w = 0.4, l = 0.46, r = 0.3, t = c.t, y0 = 0.006;
  local out = chestOutline(w, l);
  local top(x) = h.curvedTopAt(out, y0, t, r, x);
  local onChest(id, slot, a, b, wd) = h.onCurvedFace(id, slot, out, y0, t, r, a, b, wd);
  // The backplate under the breast, a little wider so its edge shows round the sides.
  [flat('back', 'back', [[-w / 2 + 0.05, -l / 2 - 0.02], [w / 2 - 0.05, -l / 2 - 0.02], [w / 2 + 0.015, -l / 2 + 0.12], [w / 2 + 0.005, l / 2 - 0.01], [-w / 2 - 0.005, l / 2 - 0.01], [-w / 2 - 0.015, -l / 2 + 0.12]], 0, y0)]
  + h.curvedPlate('breast', 'plate', out, y0, t, r, 12)
  + [
    onChest('ridge', 'ridge', [0, -l / 2 + 0.03], [0, l / 2 - 0.02], 0.01),
    onChest('neck-roll', 'ridge', [-w / 2 + 0.08, -l / 2 + 0.008], [w / 2 - 0.08, -l / 2 + 0.008], 0.012),
    onChest('arm-roll-l', 'ridge', [-w / 2 + 0.065, -l / 2 + 0.01], [-w / 2 + 0.006, -l / 2 + 0.125], 0.012),
    onChest('arm-roll-r', 'ridge', [w / 2 - 0.065, -l / 2 + 0.01], [w / 2 - 0.006, -l / 2 + 0.125], 0.012),
  ]
  // Shoulder straps over from the backplate, buckled on the chest.
  + std.flattenArrays([
    [
      sbox('shoulder-strap-' + sideName(s), 'strap', [s * 0.1, 0, -l / 2 - 0.06], [s * 0.14, top(s * 0.12) + 0.003, -l / 2 + 0.06]),
      sbox('shoulder-buckle-' + sideName(s), 'buckle', [s * 0.095, top(s * 0.12), -l / 2 + 0.05], [s * 0.145, top(s * 0.12) + 0.007, -l / 2 + 0.07]),
    ]
    for s in sides
  ])
  // Side straps hanging loose off the backplate, a buckle on the breastplate's edge.
  + std.flattenArrays([
    [
      sbox('side-strap-' + sideName(s), 'strap', [s * (w / 2 - 0.01), 0, 0.02], [s * (w / 2 + 0.09), 0.004, 0.05]),
      sbox('side-buckle-' + sideName(s), 'buckle', [s * (w / 2 - 0.035), top(s * (w / 2 - 0.02)), 0.015], [s * (w / 2 - 0.005), top(s * (w / 2 - 0.02)) + 0.006, 0.055]),
    ]
    for s in sides
  ])
  + (if c.plackart then
       local po = [[-0.14, 0.02], [0.14, 0.02], [0.17, l / 2 - 0.005], [-0.17, l / 2 - 0.005]];
       h.curvedPlate('plackart', 'plate', po, top(0.17) - t - 0.003, 0.008, r, 10, 0, 0, w / 2)
       + [
         h.disc('plackart-rivet-%d' % i, 'rivet', 0.007, top(x) + 0.005, top(x) + 0.011, x, 0.035)
         for i in [0, 1, 2]
         for x in [[-0.11, 0, 0.11][i]]
       ]
     else [])
  // Fauld: lames below the breastplate for the hips, each overlapping the one below.
  + std.flattenArrays([
    local z0 = l / 2 - 0.01 + i * 0.04, hw = w / 2 - 0.03 + i * 0.01;
    h.curvedPlate('lame-%d' % i, 'plate', [[-hw, z0], [hw, z0], [hw, z0 + 0.05], [-hw, z0 + 0.05]], 0, t, r, 8)
    + [h.disc('lame-rivet-%d-%s' % [i, sideName(s)], 'rivet', 0.006, top(0.16) - y0 + 0.002, top(0.16) - y0 + 0.008, s * 0.16, z0 + 0.025) for s in sides]
    for i in std.range(0, c.lames - 1)
  ])
  // Shoulder guards: lames arched across each upper arm, set against the shoulder beside the neck, each overlapping
  // the one below, with a strap to the breastplate.
  + std.flattenArrays([
    local sw = c.spaulder * 1.9, ol = [[-sw / 2, -0.028], [sw / 2, -0.028], [sw / 2, 0.028], [-sw / 2, 0.028]];
    local cx = s * (w / 2 + sw / 2 - 0.012), z0 = -l / 2 + 0.03 + k * 0.042;
    h.smoothPlate('spaulder-%s-%d' % [sideName(s), k], 'plate', ol, 0.012 - k * 0.004, 0.006, 0.09, 8, cx, z0)
    + h.plateBand('spaulder-edge-%s-%d' % [sideName(s), k], 'ridge', ol, 0.012 - k * 0.004, 0.006, 0.09, cx, z0, 0.022, sw / 2 - 0.004, 0.006)
    for s in sides
    for k in std.range(0, if c.spaulder >= 0.08 then 2 else if c.spaulder >= 0.07 then 1 else 0)
  ])
  + [
    h.disc('spaulder-rivet-' + sideName(s), 'rivet', 0.007, 0.03, 0.036, s * (w / 2 + c.spaulder * 0.95 - 0.012), -l / 2 + 0.02)
    for s in sides
  ];

// A bronze bell cuirass laid front up over its backplate: a curved breastplate with the chest and belly modelled in
// raised lines, a rolled rim round the neck and armholes, and a hem flaring out at the waist like a bell. Side pins
// and shoulder ties join it to the back. Slots: plate, back, rim, line, pin, tie.
local bellCuirass() =
  local r = 0.3, t = 0.006, y0 = 0.006;
  local out = [[-0.1, -0.24], [0.1, -0.24], [0.19, -0.12], [0.18, 0.19], [-0.18, 0.19], [-0.19, -0.12]];
  local onChest(id, slot, a, b, wd) = h.onCurvedFace(id, slot, out, y0, t, r, a, b, wd);
  // Two arcs below the chest and a belly line, as runs of short strips.
  local hemR = 0.22 * 0.22 / (2 * 0.19 * 0.19 / (2 * r));
  local hemOut = [[-0.18, 0.185], [0.18, 0.185], [0.22, 0.25], [-0.22, 0.25]];
  // The backplate filling the hollow under a shell, strip by strip up to the shell's underside, so breast and back
  // read as one closed body from the side.
  local fill(prefix, o, rr, n) =
    local xs = [p[0] for p in o], x0 = std.foldl(std.min, xs, 1e9), w = (std.foldl(std.max, xs, -1e9) - x0) / n;
    [
      local xa = x0 + i * w, band = h.clipX(h.clipX(o, xa, true), xa + w, false);
      h.prism('%s-%d' % [prefix, i], 'back', 'y', [[q[1], q[0]] for q in band], 0, std.max(y0, h.curvedTopAt(o, y0, t, rr, std.max(std.abs(xa), std.abs(xa + w))) - t + 0.001))
      for i in std.range(0, n - 1)
    ];
  local arc(p, s, pts) = [onChest('%s-%d' % [p, i], 'line', [s * pts[i][0], pts[i][1]], [s * pts[i + 1][0], pts[i + 1][1]], 0.008) for i in std.range(0, std.length(pts) - 2)];
  [flat('back', 'back', [[-0.11, -0.25], [0.11, -0.25], [0.2, -0.12], [0.19, 0.2], [-0.19, 0.2], [-0.2, -0.12]], 0, y0)]
  + h.smoothPlate('breast', 'plate', out, y0, t, r, 12)
  // The flared hem: a wider band below the waist, its crown level with the breast's and lifted where it turns out.
  + h.smoothPlate('hem', 'rim', hemOut, y0, t, hemR, 12)
  + fill('back-fill', out, r, 12) + fill('hem-fill', hemOut, hemR, 12)
  + [
    onChest('neck-rim', 'rim', [-0.095, -0.235], [0.095, -0.235], 0.014),
    onChest('arm-rim-l', 'rim', [-0.1, -0.23], [-0.185, -0.12], 0.014),
    onChest('arm-rim-r', 'rim', [0.1, -0.23], [0.185, -0.12], 0.014),
  ]
  + std.flattenArrays([
    arc('chest-' + sideName(s), s, [[0.015, -0.07], [0.07, -0.05], [0.12, -0.06], [0.16, -0.1]])
    + arc('belly-' + sideName(s), s, [[0.12, 0.0], [0.1, 0.08], [0.1, 0.16]])
    for s in sides
  ])
  + [onChest('navel', 'line', [0, 0.06], [0, 0.12], 0.008)]
  + [
    h.disc('side-pin-%s-%d' % [sideName(s), i], 'pin', 0.008, 0, h.curvedTopAt(out, y0, t, r, s * 0.18) + 0.004, s * 0.2, -0.05 + i * 0.12)
    for s in sides
    for i in [0, 1]
  ]
  + [sbox('shoulder-tie-' + sideName(s), 'tie', [s * 0.12, 0, -0.29], [s * 0.15, h.curvedTopAt(out, y0, t, r, s * 0.13) + 0.003, -0.2]) for s in sides];

// A lamellar panel: `rows` rows of small plates `pw` across and `ph` tall, centred on x = cx with its top edge at z0,
// each row overlapping the one below and laced across. `skip(i, j)` leaves out plates, as at the neck. Slots: lame, lace.
local lamellarPanel(p, cx, z0, cols, rows, pw, ph, skip=function(i, j) false) =
  local step = ph * 0.7, x0 = cx - cols * pw / 2;
  [
    local y = 0.004 * (rows - i);
    box('%s-%d-%d' % [p, i, j], 'lame', [x0 + j * pw + 0.001, y, z0 + i * step], [x0 + (j + 1) * pw - 0.001, y + 0.004, z0 + i * step + ph])
    for i in std.range(0, rows - 1)
    for j in std.range(0, cols - 1)
    if !skip(i, j)
  ]
  + [
    local y = 0.004 * (rows - i) + 0.004, js = [j for j in std.range(0, cols - 1) if !skip(i, j)];
    box('%s-lace-%d-%d' % [p, i, k], 'lace', [x0 + js[k] * pw, y, z0 + i * step + ph * 0.2], [x0 + (js[k] + 1) * pw, y + 0.002, z0 + i * step + ph * 0.3])
    for i in std.range(0, rows - 1)
    for k in std.range(0, std.length([j for j in std.range(0, cols - 1) if !skip(i, j)]) - 1)
  ];

// A lamellar cuirass laid front up: a body of laced plate rows with the neck open between two shoulder runs, a
// shoulder guard of shorter rows either side, and with `skirt` two hanging panels over the thighs. Slots: lame, lace,
// edge.
local lamellarCuirass(skirt) =
  local cols = 14, pw = 0.03, rows = 9, ph = 0.075;
  local neck(i, j) = i < 2 && j >= 4 && j <= 9;
  local bodyEnd = -0.27 + (rows - 1) * ph * 0.7 + ph;
  lamellarPanel('body', 0, -0.27, cols, rows, pw, ph, neck)
  // Leather binding along the bottom edge and round the neck.
  + [box('hem-edge', 'edge', [-cols * pw / 2, 0.004, bodyEnd - 0.012], [cols * pw / 2, 0.01, bodyEnd])]
  + [box('neck-edge', 'edge', [-0.06, 0.012, -0.27 + 2 * ph * 0.7 - 0.006], [0.06, 0.016, -0.27 + 2 * ph * 0.7 + 0.004])]
  + std.flattenArrays([
    lamellarPanel('shoulder-' + sideName(s), s * 0.3, -0.25, 5, 4, 0.028, 0.065)
    + [sbox('shoulder-lace-' + sideName(s), 'edge', [s * 0.21, 0.004, -0.24], [s * 0.235, 0.008, -0.2])]
    for s in sides
  ])
  + (if skirt then std.flattenArrays([
       lamellarPanel('skirt-' + sideName(s), s * 0.105, bodyEnd - 0.01, 7, 4, 0.03, 0.07)
       for s in sides
     ]) else []);

// A moulded leather cuirass laid front up: a curved chest plate with raised chest lobes and a stitched edge, laced at
// the sides to its backplate, and three layered flaps over each shoulder. Slots: leather, back, edge, lace.
local leatherCuirass() =
  local w = 0.4, l = 0.46, r = 0.33, t = 0.01, y0 = 0.006;
  local out = chestOutline(w, l);
  local onChest(id, slot, a, b, wd) = h.onCurvedFace(id, slot, out, y0, t, r, a, b, wd);
  [flat('back', 'back', [[-w / 2 + 0.05, -l / 2 - 0.015], [w / 2 - 0.05, -l / 2 - 0.015], [w / 2 + 0.015, -l / 2 + 0.12], [w / 2 + 0.005, l / 2 + 0.01], [-w / 2 - 0.005, l / 2 + 0.01], [-w / 2 - 0.015, -l / 2 + 0.12]], 0, y0)]
  + h.curvedPlate('chest', 'leather', out, y0, t, r, 12)
  + [
    onChest('edge-top', 'edge', [-w / 2 + 0.08, -l / 2 + 0.008], [w / 2 - 0.08, -l / 2 + 0.008], 0.014),
    onChest('edge-foot', 'edge', [-w / 2 + 0.03, l / 2 - 0.008], [w / 2 - 0.03, l / 2 - 0.008], 0.014),
    onChest('edge-l', 'edge', [-w / 2 + 0.01, -l / 2 + 0.14], [-w / 2 + 0.025, l / 2 - 0.01], 0.014),
    onChest('edge-r', 'edge', [w / 2 - 0.01, -l / 2 + 0.14], [w / 2 - 0.025, l / 2 - 0.01], 0.014),
  ]
  + [
    onChest('pec-%s-%d' % [sideName(s), i], 'leather', [s * 0.025, -0.1 + i * 0.02], [s * (0.15 - i * 0.015), -0.09 + i * 0.02], 0.02)
    for s in sides
    for i in [0, 1, 2, 3]
  ]
  // Side lacing: crossed thongs over the gap between breast and back.
  + [
    local z = -0.05 + i * 0.05;
    flat('side-lace-%s-%d' % [sideName(s), i], 'lace', [[s * (w / 2 - 0.02), z], [s * (w / 2 - 0.012), z], [s * (w / 2 + 0.018), z + 0.03], [s * (w / 2 + 0.01), z + 0.03]], 0.004, 0.009)
    for s in sides
    for i in [0, 1, 2, 3]
  ]
  // Shoulder guards: three overlapping flaps hung from each armhole, the top one bound.
  + std.flattenArrays([
    [
      flat('flap-%s-%d' % [sideName(s), k], 'leather', [[s * (w / 2 - 0.03), z], [s * (w / 2 + 0.13), z], [s * (w / 2 + 0.12), z + 0.075], [s * (w / 2 - 0.02), z + 0.075]], k * 0.006, k * 0.006 + 0.008)
      for k in [0, 1, 2]
      for z in [-l / 2 + 0.01 + (2 - k) * 0.05]
    ]
    + [sbox('flap-edge-' + sideName(s), 'edge', [s * (w / 2 - 0.03), 0.02, -l / 2 + 0.073], [s * (w / 2 + 0.13), 0.024, -l / 2 + 0.085])]
    + [h.disc('flap-stud-%s-%d' % [sideName(s), i], 'lace', 0.007, 0.02, 0.026, s * (w / 2 + 0.01 + i * 0.05), -l / 2 + 0.04) for i in [0, 1, 2]]
    for s in sides
  ]);

[
  // Quilted cotton armour laid out flat, front up, collar towards +z, 480 mm across and 600 mm long: a sleeveless vest
  // 40 mm thick, cotton stuffing quilted in a diamond lattice between two layers, with deep armholes, a neck notch
  // showing the inside, and its neck, armholes and hem bound in leather.
  local av = { w: 0.48, l: 0.6, t: 0.04, neckW: 0.08, neckD: 0.08, armIn: 0.08, armD: 0.19 };
  local avTop = av.l / 2 - av.neckD, avArm = av.w / 2 - av.armIn;
  h.compound('armor_aztec', 4,
             g.flatTop(av)
             + g.quilt({ style: 'lattice', pitch: 0.06, w: 0.008, x0: -avArm + 0.01, x1: avArm - 0.01, z0: -av.l / 2 + 0.03, z1: avTop - 0.01, y: av.t })
             + [
               box('hem-binding', 'binding', [-av.w / 2, 0, -av.l / 2 - 0.004], [av.w / 2, av.t + 0.004, -av.l / 2 + 0.014]),
               box('neck-binding', 'binding', [-av.neckW, av.t, avTop - 0.012], [av.neckW, av.t + 0.004, avTop]),
             ]
             + std.flattenArrays([
               [
                 box('armhole-binding-' + sideName(s), 'binding', [s * avArm - 0.007, av.t, avTop - av.armD], [s * avArm + 0.007, av.t + 0.004, avTop]),
                 box('neck-side-binding-' + sideName(s), 'binding', [s * av.neckW - 0.007, av.t * 0.5, avTop], [s * av.neckW + 0.007, av.t + 0.004, av.l / 2]),
               ]
               for s in sides
             ]),
             { cloth: 'cloth-cream', lining: 'cloth-khaki', quilt: 'cloth-khaki', binding: 'leather-tan' })
  + { voxelGrain: 0.004 },

  // A 4 mm mild steel chestplate laid flat, 460 mm from neck to waist and 600 mm with its fauld: breast over back,
  // two fauld lames for the hips and a guard laid beside each shoulder.
  h.compound('armor_lc_chestplate', 22, chestplate({}), { plate: 'steel-bright', back: 'steel-bright', ridge: 'steel-bright', rivet: 'steel-grey', strap: 'leather-tan', buckle: 'brass-dull' })
  + { voxelGrain: 0.006 },

  // The 2 mm light chestplate: a thinner breast, one fauld lame and smaller shoulder guards.
  h.compound('armor_lc_light_chestplate', 16, chestplate({ t: 0.005, lames: 1, spaulder: 0.06 }), { plate: 'steel-bright', back: 'steel-bright', ridge: 'steel-bright', rivet: 'steel-grey', strap: 'leather-tan', buckle: 'brass-dull' })
  + { voxelGrain: 0.006 },

  // The 6 mm heavy chestplate: a thick breast with a plackart riveted over the belly, three lames, broad guards.
  h.compound('armor_lc_heavy_chestplate', 35, chestplate({ t: 0.012, lames: 3, plackart: true, spaulder: 0.085 }), { plate: 'steel-bright', back: 'steel-bright', ridge: 'steel-bright', rivet: 'steel-grey', strap: 'leather-tan', buckle: 'brass-dull' })
  + { voxelGrain: 0.006 },

  // A bronze bell cuirass laid flat, 500 mm from neck to the flared hem and 440 mm across it.
  h.compound('armor_cuirass', 6, bellCuirass(), { plate: 'bronze-polished', back: 'bronze', rim: 'bronze-polished', line: 'bronze', pin: 'bronze', tie: 'leather-tan' })
  + { voxelGrain: 0.006 },

  // A leather lamellar cuirass laid flat, 560 mm from neck to hem and 680 mm across its shoulder guards.
  h.compound('armor_lamellar', 4, lamellarCuirass(false), { lame: 'leather-chestnut', lace: 'leather-tan', edge: 'leather-oxblood' })
  + { voxelGrain: 0.004 },

  // A mild steel lamellar cuirass laid flat, 760 mm from neck to the hem of its thigh panels.
  h.compound('armor_lamellar_lc', 12, lamellarCuirass(true), { lame: 'steel-bright', lace: 'leather-oxblood', edge: 'leather-black' })
  + { voxelGrain: 0.004 },

  // A moulded leather cuirass laid flat, 460 mm from neck to waist and 660 mm across its shoulder guards.
  h.compound('armor_larmor_chest', 2.6, leatherCuirass(), { leather: 'leather-chestnut', back: 'leather-chestnut', edge: 'leather-black', lace: 'leather-tan' })
  + { voxelGrain: 0.006 },
]
