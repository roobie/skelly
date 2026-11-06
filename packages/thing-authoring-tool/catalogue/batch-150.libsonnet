local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;

// Leg wear and leg armour: trousers folded on a shelf, mail leggings and leg guards laid side by side as a pair,
// each leg running along z with its top (hip or knee) towards -z.

// A flat convex outline of [x, z] points lying on y from y0 to y1.
local flat(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y0, y1);

// Half the width at z of a leg tapering from w0 at z0 to w1 at z1.
local halfAt(w0, w1, z0, z1, z) = (w0 + (w1 - w0) * (z - z0) / (z1 - z0)) / 2;

// A tapered panel lying flat on y from y0 to y1, centred on x = cx, from z0 (w0 across) to z1 (w1 across).
local panel(id, slot, cx, z0, z1, w0, w1, y0, y1) =
  flat(id, slot, [[cx - w0 / 2, z0], [cx + w0 / 2, z0], [cx + w1 / 2, z1], [cx - w1 / 2, z1]], y0, y1);

// h.curvedPlate (a layer on a narrower plate passes that plate's half-width as `curveHalf`) with each strip filled down to the height of its outer edge, so neighbouring strips meet without
// a see-through step and the shell reads as one curved sheet. Tops match h.curvedTopAt, so h.onCurvedFace still
// lies on it.
local smoothPlate(prefix, slot, outline, y0, thick, r, n, cx=0, cz=0, curveHalf=null) =
  local x0 = std.foldl(function(a, p) std.min(a, p[0]), outline, 1e9);
  local x1 = std.foldl(function(a, p) std.max(a, p[0]), outline, -1e9);
  local half = if curveHalf == null then std.max(-x0, x1) else curveHalf, w = (x1 - x0) / n;
  local lift(x) = (half * half - x * x) / (2 * r);
  [
    local xa = x0 + i * w;
    local band = h.clipX(h.clipX(outline, xa, true), xa + w, false);
    local outer = if std.abs(xa) > std.abs(xa + w) then xa else xa + w;
    h.prism('%s-%d' % [prefix, i], slot, 'y', [[p[1] + cz, p[0] + cx] for p in band], y0 + lift(outer), y0 + lift(xa + w / 2) + thick)
    for i in std.range(0, n - 1)
  ];

// One mail legging laid flat, outside up, from the hip at z0 to the ankle at z1: a tapered sheet of mail ridged
// where its rows of rings lie, a leather band along the top with two points to tie it to a belt, and a strap
// under the instep at the ankle. Slots: mail, strap.
local mailLeg(p, cx, z0, z1, w0, w1) =
  local t = 0.008, pitch = 0.014, n = std.floor((z1 - z0 - 0.05) / pitch);
  [panel(p + 'sheet', 'mail', cx, z0, z1, w0, w1, 0, t)]
  + [
    local z = z0 + 0.045 + pitch * i, half = halfAt(w0, w1, z0, z1, z) - 0.006;
    box('%sring-%d' % [p, i], 'mail', [cx - half, t, z - 0.003], [cx + half, t + 0.004, z + 0.003])
    for i in std.range(0, n - 1)
  ]
  + [
    panel(p + 'band', 'strap', cx, z0 - 0.004, z0 + 0.035, w0 + 0.008, w0 + 0.004, 0, t + 0.004),
    box(p + 'point-a', 'strap', [cx - w0 / 4 - 0.006, 0, z0 - 0.09], [cx - w0 / 4 + 0.006, 0.004, z0]),
    box(p + 'point-b', 'strap', [cx + w0 / 4 - 0.006, 0, z0 - 0.09], [cx + w0 / 4 + 0.006, 0.004, z0]),
    box(p + 'stirrup', 'strap', [cx - w1 / 2 + 0.01, 0, z1 - 0.004], [cx + w1 / 2 - 0.01, 0.004, z1 + 0.06]),
  ];

// One mail half-legging laid back up, from the hip at z0 to the ankle at z1: two flanks of mail meeting down the
// middle of the calf, where leather edges pierced for a lace are drawn together by a cord in a zigzag, and a leather
// band at the top. Slots: mail, strap, lace.
local halfMailLeg(p, cx, z0, z1, w0, w1) =
  local t = 0.008, pitch = 0.014, n = std.floor((z1 - z0 - 0.05) / pitch), gap = 0.012, edge = 0.012;
  local zs = std.range(0, std.floor((z1 - z0 - 0.08) / 0.05) - 1);
  [panel(p + 'sheet', 'mail', cx, z0, z1, w0, w1, 0, t)]
  + std.flattenArrays([
    local z = z0 + 0.045 + pitch * i, half = halfAt(w0, w1, z0, z1, z) - 0.006;
    [
      box('%sring-l-%d' % [p, i], 'mail', [cx - half, t, z - 0.003], [cx - gap - edge, t + 0.004, z + 0.003]),
      box('%sring-r-%d' % [p, i], 'mail', [cx + gap + edge, t, z - 0.003], [cx + half, t + 0.004, z + 0.003]),
    ]
    for i in std.range(0, n - 1)
  ])
  + [
    box(p + 'gap', 'gap', [cx - gap, t, z0 + 0.035], [cx + gap, t + 0.001, z1]),
    box(p + 'edge-l', 'strap', [cx - gap - edge, t, z0 + 0.035], [cx - gap, t + 0.004, z1]),
    box(p + 'edge-r', 'strap', [cx + gap, t, z0 + 0.035], [cx + gap + edge, t + 0.004, z1]),
    panel(p + 'band', 'strap', cx, z0 - 0.004, z0 + 0.035, w0 + 0.008, w0 + 0.004, 0, t + 0.004),
  ]
  + [
    // The lace crosses from one edge to the other every 25 mm, so it zigzags down the calf.
    local za = z0 + 0.06 + 0.025 * i, xa = cx + (if i % 2 == 0 then -1 else 1) * (gap + edge / 2);
    flat('%slace-%d' % [p, i], 'lace', [[xa - 0.003, za], [xa + 0.003, za], [2 * cx - xa + 0.003, za + 0.025], [2 * cx - xa - 0.003, za + 0.025]], t + 0.004, t + 0.007)
    for i in std.range(0, std.floor((z1 - z0 - 0.09) / 0.025) - 1)
  ]
  + [box(p + 'lace-end', 'lace', [cx - 0.003, 0, z0 - 0.06], [cx + 0.003, t + 0.007, z0 + 0.06])];

// One tyre leg guard lying open side down from the thigh at -z to the ankle at +z, centred on x = cx: three thick
// curved chunks of tyre, their tread lugs up, butted end to end and wrapped in bands of grey tape at each joint and
// end, with a tape strip down the middle. Slots: tyre, tread, tape.
local tyreGuard(p, cx) =
  local t = 0.012;
  local chunks = [[-0.45, -0.22, 0.17, 0.15, 0.1], [-0.22, -0.1, 0.13, 0.12, 0.07], [-0.1, 0.22, 0.13, 0.1, 0.07]];
  std.flattenArrays([
    local c = chunks[k], z0 = c[0], z1 = c[1], w0 = c[2], w1 = c[3], r = c[4];
    local outline = [[-w0 / 2, z0], [w0 / 2, z0], [w1 / 2, z1], [-w1 / 2, z1]];
    local face(id, slot, a, b, w) = h.onCurvedFace('%s%d-%s' % [p, k, id], slot, outline, 0, t, r, a, b, w, cx);
    local half(z) = halfAt(w0, w1, z0, z1, z) - 0.004;
    local across(id, slot, z, w) = [
      face('%s-%d' % [id, i], slot, [-half(z) + 2 * half(z) * i / 6, z], [-half(z) + 2 * half(z) * (i + 1) / 6, z], w)
      for i in std.range(0, 5)
    ];
    smoothPlate('%s%d-shell' % [p, k], 'tyre', outline, 0, t, r, 10, cx)
    // Tread lugs in two staggered rows either side of the middle.
    + [
      face('lug-%d-%d' % [j, s], 'tread', [s * half(z) * 0.55 - 0.018, z], [s * half(z) * 0.55 + 0.018, z], 0.012)
      for j in std.range(0, std.floor((z1 - z0 - 0.06) / 0.03))
      for s in [-1, 1]
      for z in [z0 + 0.035 + j * 0.03 + (if s > 0 then 0.012 else 0)]
      if z < z1 - 0.03
    ]
    + across('tape-top', 'tape', z0 + 0.015, 0.03)
    + across('tape-foot', 'tape', z1 - 0.015, 0.03)
    + [face('tape-mid', 'tape', [0, z0 + 0.03], [0, z1 - 0.03], 0.03)]
    for k in [0, 1, 2]
  ]);

// A convex oval outline of [x, z] points, `a` by `b` half-sizes round [cx, cz], from `n` points.
local oval(cx, cz, a, b, n=16) = [[cx + a * std.cos(2 * std.pi * i / n), cz + b * std.sin(2 * std.pi * i / n)] for i in std.range(0, n - 1)];
// A rounded rectangle outline of [x, z] points, `a` by `b` half-sizes round [cx, cz], corners cut by `k`.
local rrect(cx, cz, a, b, k) = [
  [cx - a + k, cz - b], [cx + a - k, cz - b], [cx + a, cz - b + k], [cx + a, cz + b - k],
  [cx + a - k, cz + b], [cx - a + k, cz + b], [cx - a, cz + b - k], [cx - a, cz - b + k],
];

// A pair of jeans folded in half lengthwise and laid on a shelf, waistband at +z and hem at -z, so one leg's front
// shows: belt loops, a button, a fly seam and a slanted pocket mouth with rivets, then down the leg three patches of
// faded denim sewn on, a riveted steel sheet over the thigh, a flat oval plastic pad over the knee and a smaller
// riveted sheet over the shin, and a turned-up hem. Slots: cloth, seam, patch, pad, sheet, rivet, loop.
local armouredJeans(id, mass, sheet) =
  local w = 0.26, d = 0.42, ht = 0.05, zb = d / 2, cx = 0.015;
  local plate(n, cz, a, b) = [
    g.flat(n + '-patch', 'patch', rrect(cx, cz, a + 0.01, b + 0.01, 0.014), ht, 0.004),
    g.flat(n + '-sheet', 'sheet', rrect(cx, cz, a, b, 0.01), ht + 0.004, 0.004),
  ] + [
    box('%s-rivet-%d' % [n, i], 'rivet', [cx + c[0] - 0.004, ht + 0.008, cz + c[1] - 0.004], [cx + c[0] + 0.004, ht + 0.012, cz + c[1] + 0.004])
    for i in std.range(0, 3)
    for c in [[[-a + 0.012, -b + 0.012], [a - 0.012, -b + 0.012], [-a + 0.012, b - 0.012], [a - 0.012, b - 0.012]][i]]
  ];
  h.compound(id, mass, h.foldedGarment(w, d, ht, 4) + [
    box('waistband', 'cloth', [-w / 2, ht, zb - 0.04], [w / 2, ht + 0.006, zb + 0.002]),
    box('waistband-seam', 'seam', [-w / 2, ht + 0.006, zb - 0.036], [w / 2, ht + 0.008, zb - 0.032]),
    h.disc('button', 'rivet', 0.009, ht + 0.006, ht + 0.011, -w / 2 + 0.03, zb - 0.02),
    g.strip('fly', 'seam', [-w / 2 + 0.045, zb - 0.04], [-w / 2 + 0.045, zb - 0.12], ht, 0.004, 0.002),
    g.strip('fly-curve', 'seam', [-w / 2 + 0.045, zb - 0.12], [-w / 2 + 0.012, zb - 0.145], ht, 0.004, 0.002),
    g.strip('pocket', 'seam', [w / 2 - 0.09, zb - 0.04], [w / 2, zb - 0.1], ht, 0.008, 0.003),
    box('pocket-rivet', 'rivet', [w / 2 - 0.096, ht, zb - 0.05], [w / 2 - 0.086, ht + 0.005, zb - 0.04]),
    box('outseam', 'seam', [w / 2 - 0.008, ht, -zb + 0.03], [w / 2 - 0.004, ht + 0.002, zb - 0.04]),
    box('inseam', 'seam', [-w / 2 + 0.004, ht, -zb + 0.03], [-w / 2 + 0.008, ht + 0.002, zb - 0.15]),
    box('hem', 'patch', [-w / 2, ht, -zb + 0.002], [w / 2, ht + 0.006, -zb + 0.03]),
  ] + [
    box('loop-%d' % i, 'loop', [x - 0.006, ht + 0.006, zb - 0.044], [x + 0.006, ht + 0.01, zb + 0.002])
    for i in std.range(0, 2)
    for x in [[-0.07, 0.03, 0.11][i]]
  ]
  + plate('thigh', 0.03, 0.058, 0.045)
  + [
    g.flat('knee-patch', 'patch', oval(cx, -0.07, 0.068, 0.05), ht, 0.004),
    g.flat('knee-pad', 'pad', oval(cx, -0.07, 0.056, 0.04), ht + 0.004, 0.006),
    g.flat('knee-crown', 'pad', oval(cx, -0.07, 0.036, 0.024), ht + 0.01, 0.004),
  ]
  + plate('shin', -0.15, 0.05, 0.03), { cloth: 'cloth-denim', seam: 'brass-dull', patch: 'cloth-denim-faded', pad: 'plastic-charcoal', sheet: sheet, rivet: 'brass-dull', loop: 'cloth-denim' })
  + { voxelGrain: 0.004 };

// A shell lying open side down on y0, curved across x with radius r, its convex [x, z] outline centred on (cx, cz).
// `band` lays a strip across it at local z, `half` either side of the middle, strip by strip so it follows the
// curve; `strap` adds a band with its tail running out on the floor to +x and a buckle at the -x edge.
local shell(p, slot, outline, y0, t, r, cx, cz) = smoothPlate(p + 'shell', slot, outline, y0, t, r, 12, cx, cz);
// Each piece of a band stands on the higher of its two ends, so the shell's strips never cover it.
local band(p, id, slot, outline, y0, t, r, cx, cz, z, half, w) = [
  local xa = -half + 2 * half * i / 6, xb = -half + 2 * half * (i + 1) / 6;
  local top = h.curvedTopAt(outline, y0, t, r, if xa < 0 && xb > 0 then 0 else std.min(std.abs(xa), std.abs(xb)));
  box('%s%s-%d' % [p, id, i], slot, [cx + xa, top - 0.004, cz + z - w / 2], [cx + xb, top + 0.002, cz + z + w / 2])
  for i in std.range(0, 5)
];
local strap(p, id, outline, y0, t, r, cx, cz, z, half, w=0.022) =
  band(p, id, 'strap', outline, y0, t, r, cx, cz, z, half, w)
  + [
    box(p + id + '-tail', 'strap', [cx + half, 0, cz + z - w / 2], [cx + half + 0.05, 0.004, cz + z + w / 2]),
    box(p + id + '-buckle', 'buckle', [cx - half - 0.012, 0, cz + z - w / 2 - 0.003], [cx - half + 0.002, 0.012, cz + z + w / 2 + 0.003]),
  ];

// A calf-shaped greave outline, `len` long from the knee at -z to the ankle at +z, widest (`calf`) a third of the way
// down, `knee` across at the top and `ankle` at the foot.
local greaveOutline(len, knee, calf, ankle) = [
  [-knee / 2, -len / 2], [knee / 2, -len / 2], [calf / 2, -len / 6], [ankle / 2, len / 2], [-ankle / 2, len / 2], [-calf / 2, -len / 6],
];

// A pressed cop standing dome up on y at (cx, cz): radius r, height ht and a rolled rim. Slots: cop, rim.
local cop(p, cx, cz, r, ht, y=0) = [
  h.turned(p + 'dome', 'cop', 'y', [[0, 0], [0, r], [ht * 0.3, r * 0.94], [ht * 0.6, r * 0.76], [ht * 0.85, r * 0.48], [ht, r * 0.12], [ht, 0]], [cx, y, cz]),
  h.turned(p + 'rim', 'rim', 'y', [[0, r - 0.004], [0, r + 0.003], [0.005, r + 0.003], [0.005, r - 0.004], [0, r - 0.004]], [cx, y, cz]),
];

// One sculpted greave lying open side down along z, centred on (cx, cz): a metal shell over a leather lining that
// shows as a rim round its edge, a raised rib down the shin, and lining stitches along both sides.
// Slots: shell, lining, rib, stitch.
local greave(p, cx, cz, len, knee, calf, ankle, r) =
  local o = greaveOutline(len, knee, calf, ankle);
  local lining = greaveOutline(len + 0.012, knee + 0.012, calf + 0.012, ankle + 0.012);
  local y0 = 0.011, t = 0.003;
  // The lining follows the shell's curve, so its wider edge drops to the floor just outside the shell's.
  smoothPlate(p + 'lining', 'lining', lining, 0.007, 0.004, r, 12, cx, cz, std.max(knee, calf) / 2)
  + shell(p, 'shell', o, y0, t, r, cx, cz)
  + [h.onCurvedFace(p + 'rib', 'rib', o, y0, t, r, [0, -len / 2 + 0.03], [0, len / 2 - 0.02], 0.008, cx, cz)]
  + [
    local z = -len / 2 + 0.03 + (len - 0.06) * i / 7;
    local half = if z < -len / 6 then knee / 2 + (calf - knee) / 2 * (z + len / 2) / (len / 3) else calf / 2 + (ankle - calf) / 2 * (z + len / 6) / (2 * len / 3);
    local x = s * (half - 0.008);
    box('%sstitch-%d-%d' % [p, i, (s + 1) / 2], 'stitch', [cx + x - 0.002, h.curvedTopAt(o, y0, t, r, x) - 0.001, cz + z - 0.002], [cx + x + 0.002, h.curvedTopAt(o, y0, t, r, x) + 0.002, cz + z + 0.002])
    for i in std.range(0, 7)
    for s in [-1, 1]
  ];

// One laminar legging lying open side down from the thigh at -z to the shin at +z, centred on x = cx: n curved lames
// each overlapping the one below it, narrowing down the leg, riveted to two leather straps running its length, with a
// domed cop over the knee. Slots: lame, rivet, strap, cop, rim.
local laminarLeg(p, cx, n, z0, pitch, w0, w1, r) =
  local lameLen = pitch + 0.016;
  local knee = std.floor(n / 2);
  std.flattenArrays([
    local z = z0 + i * pitch, w = w0 + (w1 - w0) * i / (n - 1);
    local o = [[-w / 2, 0], [w / 2, 0], [w / 2, lameLen], [-w / 2, lameLen]];
    local y0 = (n - 1 - i) * 0.0015;
    smoothPlate('%slame-%d' % [p, i], 'lame', o, y0, 0.003, r, 12, cx, z)
    + band(p, 'edge-%d' % i, 'rim', o, y0, 0.003, r, cx, z, lameLen - 0.004, w / 2 - 0.003, 0.005)
    + [
      local x = s * w * 0.28;
      box('%srivet-%d-%d' % [p, i, (s + 1) / 2], 'rivet', [cx + x - 0.003, h.curvedTopAt(o, y0, 0.003, r, x), z + lameLen / 2 - 0.003], [cx + x + 0.003, h.curvedTopAt(o, y0, 0.003, r, x) + 0.004, z + lameLen / 2 + 0.003])
      for s in [-1, 1]
    ]
    for i in std.range(0, n - 1)
    if i != knee
  ])
  + cop(p + 'knee-', cx, z0 + knee * pitch + lameLen / 2, 0.06, 0.04, 0.002)
  + [
    box(p + 'tie-' + s, 'strap', [cx + s * 0.07 - 0.008, 0, z0 - 0.07], [cx + s * 0.07 + 0.008, 0.004, z0 + 0.004])
    for s in [-1, 1]
  ];

[
  // Fencing breeches folded on a shelf, 280 mm by 360 mm and 40 mm tall: white knee-length breeches with a padded
  // front panel, a waistband at +z with braces folded down over the top, and knee cuffs closed by a strap at -z.
  local w = 0.28, d = 0.36, ht = 0.04;
  h.compound('fencing_pants', 0.79, h.foldedGarment(w, d, ht, 3) + [
    box('waistband', 'trim', [-w / 2, ht, d / 2 - 0.04], [w / 2, ht + 0.006, d / 2 + 0.002]),
    box('pad', 'pad', [-w / 2 + 0.03, ht, -d / 2 + 0.06], [w / 2 - 0.03, ht + 0.008, d / 2 - 0.06]),
    box('cuff', 'trim', [-w / 2, ht, -d / 2], [w / 2, ht + 0.006, -d / 2 + 0.03]),
    box('cuff-strap', 'strap', [-w / 2 - 0.004, ht + 0.006, -d / 2 + 0.008], [w / 2 + 0.004, ht + 0.009, -d / 2 + 0.022]),
    box('cuff-buckle', 'buckle', [w / 2 - 0.02, ht + 0.006, -d / 2 + 0.004], [w / 2 - 0.006, ht + 0.012, -d / 2 + 0.026]),
    box('fly', 'trim', [w / 2 - 0.05, ht + 0.008, -0.02], [w / 2 - 0.04, ht + 0.012, d / 2 - 0.04]),
  ] + [
    // Braces run from the waistband down over the folded legs.
    box('brace-' + i, 'brace', [x - 0.012, ht + 0.008, -0.05], [x + 0.012, ht + 0.011, d / 2 + 0.004])
    for i in [0, 1]
    for x in [[-0.07, 0.07][i]]
  ], { cloth: 'cloth-bright-white', trim: 'cloth-bright-white', pad: 'cloth-cream', strap: 'cloth-bright-white', buckle: 'steel', brace: 'webbing-black' })
  + { voxelGrain: 0.004 },

  // A pair of knee pads laid side by side, cup up: each an oval foam pad 190 mm long and 120 mm across, curved to
  // the knee, with a moulded plastic cup 130 mm long over it and two elastic straps across, each with its tail lying
  // out to one side and a buckle at the other.
  h.compound('knee_pads', 0.23, std.flattenArrays([
    local back = oval(0, 0, 0.06, 0.095), cup = oval(0, 0, 0.044, 0.052);
    local r = 0.075, t = 0.012, cupY = h.curvedTopAt(back, 0, t, r, 0.044) - 0.002;
    smoothPlate(p + 'pad', 'pad', back, 0, t, r, 12, cx, cz)
    + smoothPlate(p + 'cup', 'cup', cup, cupY, 0.006, 0.055, 10, cx, cz)
    + [h.onCurvedFace(p + 'cup-rib', 'rib', cup, cupY, 0.006, 0.055, [0, -0.04], [0, 0.04], 0.008, cx, cz)]
    + std.flattenArrays([strap(p, 'strap-%d' % k, back, 0, t, r, cx, cz, [-0.07, 0.07][k], 0.04, 0.02) for k in [0, 1]])
    for p in ['l-', 'r-']
    for cx in [if p == 'l-' then -0.1 else 0.1]
    for cz in [if p == 'l-' then -0.015 else 0.015]
  ]), { pad: 'cloth-charcoal', cup: 'plastic-grey', rib: 'plastic-charcoal', strap: 'webbing-black', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A pair of mild steel mail leggings laid flat side by side, outside up, each 860 mm from hip to ankle, 240 mm
  // across at the thigh and 130 mm at the ankle, with a leather band and two tie points at the top and a strap under
  // the instep. The high steel pair shares this model with darker rings.
  h.compound('lc_chainmail_legs', 6.3, mailLeg('l-', -0.14, -0.43, 0.43, 0.24, 0.13) + mailLeg('r-', 0.14, -0.43, 0.43, 0.24, 0.13), { mail: 'steel-mail', strap: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A pair of mild steel mail half-leggings laid flat side by side, back up, each 820 mm from hip to ankle, 260 mm
  // across at the thigh and 150 mm at the ankle: the mail wraps the front and sides and closes down the back of the
  // leg with a leather lace in a zigzag. The high steel pair shares this model with darker rings.
  h.compound('lc_chainmail_half_legs', 4.9, halfMailLeg('l-', -0.15, -0.41, 0.41, 0.26, 0.15) + halfMailLeg('r-', 0.15, -0.41, 0.41, 0.26, 0.15), { mail: 'steel-mail', strap: 'leather-brown', lace: 'leather-tan', gap: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A pair of improvised tyre leg guards laid side by side, open side down, each 670 mm from thigh to ankle: three
  // thick curved chunks of tyre, tread up, 170 mm across at the thigh, butted end to end and bound in grey tape.
  h.compound('improvised_legguard_tire', 2.9, tyreGuard('l-', -0.11) + tyreGuard('r-', 0.11), { tyre: 'rubber-black', tread: 'rubber-black', tape: 'tape-grey' })
  + { voxelGrain: 0.004 },

  // Armoured jeans folded on a shelf, 300 mm by 400 mm and 50 mm tall: blue denim with a hard plastic cup over each
  // knee and riveted mild steel sheets over the thighs and shins. The hardened pair shares this model.
  armouredJeans('jeans_mod', 1.5, 'steel-bright'),
  // A pair of bronze greaves laid side by side, open side down, each 400 mm from knee to ankle, 150 mm across at the
  // calf and 90 mm at the ankle: a sculpted shell with a rib down the shin over a leather lining stitched along both
  // sides. The iron pair shares this model with its own metal finish.
  h.compound('legguard_bronze', 3, greave('l-', -0.1, 0, 0.4, 0.12, 0.15, 0.09, 0.07) + greave('r-', 0.1, 0, 0.4, 0.12, 0.15, 0.09, 0.07), { shell: 'bronze', rib: 'bronze', lining: 'leather-brown', stitch: 'leather-tan' })
  + { voxelGrain: 0.004 },

  // A pair of hard leg guards laid side by side, open side down, each 520 mm from knee to ankle: a moulded white
  // shin shell on a black neoprene backing, a domed knee cup above it and two hook-and-loop straps.
  h.compound('legguard_hard', 1.1, std.flattenArrays([
    local o = greaveOutline(0.34, 0.12, 0.14, 0.09);
    greave(p, cx, 0.07, 0.34, 0.12, 0.14, 0.09, 0.07)
    + cop(p + 'knee-', cx, -0.17, 0.065, 0.04)
    + [h.disc(p + 'knee-pad', 'lining', 0.072, 0, 0.004, cx, -0.17)]
    + std.flattenArrays([strap(p, 'strap-%d' % k, o, 0.011, 0.003, 0.07, cx, 0.07, [-0.09, 0.11][k], 0.058, 0.03) for k in [0, 1]])
    for p in ['l-', 'r-']
    for cx in [if p == 'l-' then -0.1 else 0.1]
  ]), { shell: 'plastic-white', rib: 'plastic-white', lining: 'cloth-black', stitch: 'cloth-black', cop: 'plastic-white', rim: 'plastic-grey', strap: 'webbing-black', buckle: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },

  // A pair of leather leg guards laid side by side, open side down, each 420 mm from knee to ankle and 160 mm across
  // at the calf: a moulded shell of thick leather, stitched round its edge, with three buckled straps.
  h.compound('legguard_larmor', 1.2, std.flattenArrays([
    local o = greaveOutline(0.42, 0.13, 0.16, 0.1);
    greave(p, cx, 0, 0.42, 0.13, 0.16, 0.1, 0.075)
    + std.flattenArrays([strap(p, 'strap-%d' % k, o, 0.011, 0.003, 0.075, cx, 0, [-0.15, 0, 0.15][k], [0.065, 0.075, 0.06][k]) for k in [0, 1, 2]])
    for p in ['l-', 'r-']
    for cx in [if p == 'l-' then -0.11 else 0.11]
  ]), { shell: 'leather-brown', rib: 'leather-brown', lining: 'leather-chestnut', stitch: 'leather-tan', strap: 'leather-chestnut', buckle: 'brass-dull' })
  + { voxelGrain: 0.004 },

  // A pair of steel leg harnesses laid side by side, open side down, each 740 mm from hip to ankle: a curved thigh
  // plate, a domed knee cop with a side wing and a calf-shaped greave, each plate with two buckled leather straps.
  h.compound('legguard_lightplate', 5.1, std.flattenArrays([
    local thigh = [[-0.1, -0.13], [0.1, -0.13], [0.075, 0.13], [-0.075, 0.13]];
    local shin = greaveOutline(0.36, 0.11, 0.14, 0.09);
    shell(p + 'thigh-', 'shell', thigh, 0, 0.003, 0.09, cx, -0.3)
    + std.flattenArrays([strap(p, 'thigh-strap-%d' % k, thigh, 0, 0.003, 0.09, cx, -0.3, [-0.07, 0.07][k], [0.095, 0.08][k]) for k in [0, 1]])
    + cop(p + 'knee-', cx, -0.12, 0.055, 0.04)
    + [flat(p + 'wing', 'cop', [[cx + s * 0.05, -0.155], [cx + s * 0.078, -0.15], [cx + s * 0.09, -0.12], [cx + s * 0.078, -0.09], [cx + s * 0.05, -0.085]], 0.004, 0.007)]
    + shell(p + 'shin-', 'shell', shin, 0, 0.003, 0.07, cx, 0.12)
    + std.flattenArrays([strap(p, 'shin-strap-%d' % k, shin, 0, 0.003, 0.07, cx, 0.12, [-0.1, 0.1][k], [0.066, 0.05][k]) for k in [0, 1]])
    for p in ['l-', 'r-']
    for s in [if p == 'l-' then -1 else 1]
    for cx in [s * 0.12]
  ]), { shell: 'steel-bright', cop: 'steel-bright', rim: 'steel-bright', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of bronze laminar leggings laid side by side, open side down, each 780 mm from thigh to shin: twelve
  // curved lames, 220 mm across at the thigh and 130 mm at the shin, each overlapping the one below and riveted to
  // leather straps behind, a domed cop over the knee and two ties at the top.
  h.compound('leggings_thessalonian', 6.1, laminarLeg('l-', -0.125, 13, -0.4, 0.06, 0.22, 0.13, 0.1) + laminarLeg('r-', 0.125, 13, -0.4, 0.06, 0.22, 0.13, 0.1), { lame: 'bronze', rim: 'brass-polished', rivet: 'brass-polished', cop: 'bronze', strap: 'leather-brown' })
  + { voxelGrain: 0.004 },
]
