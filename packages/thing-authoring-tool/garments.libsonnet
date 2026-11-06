// Shared garment builders for catalogue batches: folded jackets, shirts, dresses, skirts and aprons, flat-laid tops,
// quilting, gloves, hats, eyewear, mail curtains and socks. Each returns pieces for `h.compound`, as
// footwear.libsonnet does. Usage: `local g = import '../garments.libsonnet';` then
// `h.compound(id, mass, g.jacket({ w: 0.38, d: 0.34, ht: 0.07 }), finish)`. Options are objects merged over the
// builder's defaults, so a row names only what differs.
local h = import 'compound.libsonnet';
local box = h.box;
local rad(d) = d * std.pi / 180;
local sq(v) = v * v;

// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);
// A flat convex outline of [x, z] points lying on a top face from y to y + t.
local flat(id, slot, pts, y, t=0.004) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y, y + t);
// A strip `w` wide lying on a top face at y, from [xa, za] to [xb, zb].
local strip(id, slot, a, b, y, w=0.012, t=0.004) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  flat(id, slot, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], y, t);
// A band curved round [0, cz] at radius r, thick t, from angle a0 to a1 (0 points to +z), in segments whose bottom
// and top heights `y0(ang)` and `y1(ang)` follow the angle at each segment's middle.
local wrapBand(prefix, slot, r, t, a0, a1, steps, cz, y0, y1) = std.flattenArrays([
  local ang = a0 + (a1 - a0) * (i + 0.5) / steps;
  h.crescent('%s-%d' % [prefix, i], slot, r - t, r, a0 + (a1 - a0) * i / steps, a0 + (a1 - a0) * (i + 1) / steps, 1, y0(ang), y1(ang), 0, cz)
  for i in std.range(0, steps - 1)
]);
// The [x, z] point at `ang` degrees on a circle of radius r round [0, cz].
local onArc(r, ang, cz) = [r * std.sin(rad(ang)), cz + r * std.cos(rad(ang))];
// Round buttons at x along each z in zs, on a face at y.
local buttons(prefix, slot, x, zs, y, r=0.007, t=0.004) = [
  h.disc('%s-%d' % [prefix, i], slot, r, y, y + t, x, zs[i])
  for i in std.range(0, std.length(zs) - 1)
];
local spread(a, b, n) = if n == 1 then [a] else [a + (b - a) * i / (n - 1) for i in std.range(0, n - 1)];
local sgnPow(v, e) = (if v < 0 then -1 else 1) * std.pow(std.abs(v), e);
// Points of a superellipse `a` by `b` round [cx, cy], exponent p (2 an ellipse, higher squarer). With `half`, only
// the lower half, so the shape closes with a flat top.
local superellipse(a, b, p, n, half=false, cx=0, cy=0) =
  if half then [
    local t = std.pi + std.pi * i / n;
    [cx + a * sgnPow(std.cos(t), 2 / p), cy + b * sgnPow(std.sin(t), 2 / p)]
    for i in std.range(0, n)
  ] else [
    local t = 2 * std.pi * i / n;
    [cx + a * sgnPow(std.cos(t), 2 / p), cy + b * sgnPow(std.sin(t), 2 / p)]
    for i in std.range(0, n - 1)
  ];

// Quilting over a rectangle x0..x1 by z0..z1 on a top face at y. `style` 'channels' sinks rolls of radius `r` so each
// stands r * 0.6 proud, 'lines' lays flat stitch lines `w` wide, both one every `pitch` running along `along`;
// 'lattice' lays a diamond lattice of lines `pitch` apart.
local quilt(o) =
  local c = { style: 'channels', pitch: 0.034, along: 'z', r: 0.01, w: 0.006, t: 0.004, slot: 'quilt', prefix: 'quilt' } + o;
  local acrossLo = if c.along == 'z' then c.x0 else c.z0, acrossHi = if c.along == 'z' then c.x1 else c.z1;
  local lo = if c.along == 'z' then c.z0 else c.x0, hi = if c.along == 'z' then c.z1 else c.x1;
  local n = std.floor((acrossHi - acrossLo) / c.pitch + 1e-6);
  local at(i) = acrossLo + (acrossHi - acrossLo - n * c.pitch) / 2 + i * c.pitch;
  if c.style == 'channels' then [
    local v = at(i);
    h.turned('%s-%d' % [c.prefix, i], c.slot, c.along, [[0, 0], [0, c.r], [hi - lo, c.r], [hi - lo, 0]], if c.along == 'z' then [v, c.y - c.r * 0.4, lo] else [lo, c.y - c.r * 0.4, v])
    for i in std.range(0, n)
  ] else if c.style == 'lines' then [
    local v = at(i);
    if c.along == 'z' then box('%s-%d' % [c.prefix, i], c.slot, [v - c.w / 2, c.y, lo], [v + c.w / 2, c.y + c.t, hi])
    else box('%s-%d' % [c.prefix, i], c.slot, [lo, c.y, v - c.w / 2], [hi, c.y + c.t, v + c.w / 2])
    for i in std.range(0, n)
  ] else if c.style == 'lattice' then
    local m = std.ceil((c.x1 - c.x0 + c.z1 - c.z0) / c.pitch);
    // The part of the line z = sg * x + k inside the rectangle, as its x range.
    local span(sg, k) = { a: std.max(c.x0, if sg > 0 then c.z0 - k else k - c.z1), b: std.min(c.x1, if sg > 0 then c.z1 - k else k - c.z0) };
    [
      strip('%s-%d-%d' % [c.prefix, sg, i], c.slot, [sp.a, sg * sp.a + k], [sp.b, sg * sp.b + k], c.y, c.w, c.t)
      for sg in [1, -1]
      for i in std.range(1, m - 1)
      for k in [(if sg > 0 then c.z0 - c.x1 else c.z0 + c.x0) + i * c.pitch]
      for sp in [span(sg, k)]
      if sp.b - sp.a > 0.02
    ]
  else error 'quilt style is channels, lines or lattice';

// A coat, jacket or robe folded flat on h.foldedGarment, `w` across x and `d` along z, its top face at `ht`, the
// collar centred `neck` back from the +z edge and the hem folded under at -z. Each detail is null or omitted to
// leave it off:
//   collar     a stand collar of inner radius r, `wd` wide and `ht` tall, open `gap` degrees each side of the front;
//   front      'placket' (a strip down the middle), 'lapels' (crossed wrap lapels), 'shawl' (a V shawl collar
//              meeting at z = vz) or 'none', `frontW` wide and `frontT` thick;
//   buttons    a count spread down the front, or a list of z;
//   pockets    patch pockets { x, z, w, d, flap (depth, 0 for none), snap, single }, mirrored to -x unless single;
//   epaulettes buttoned shoulder straps;
//   sleeves    { kind: 'flat', w, t } folded flat along both sides, or { kind: 'roll', r } quilted rolls ringed
//              with stitching and cuffed at the hem end;
//   hood       { w, l } folded flat behind the collar, its crown draped over the front edge;
//   belt       { z, w, t, lift, knot } wrapped round the bundle, `lift` above the top face, knotted with two ends.
// Slots: cloth, collar, front, button, pocket, flap, sleeve, stitch, cuff, hood, belt.
local jacket(o) =
  local c = {
    w: 0.38, d: 0.34, ht: 0.07, folds: 3, neck: 0.09,
    collar: { r: 0.07, wd: 0.028, ht: 0.022, gap: 35 },
    front: 'placket', frontW: 0.032, frontT: 0.005, vz: -0.04,
    buttons: 4, buttonR: 0.006,
    pockets: [], epaulettes: false, sleeves: null, hood: null, belt: null,
  } + o;
  local w = c.w, d = c.d, ht = c.ht, cz = d / 2 - c.neck;
  local cr = if c.collar == null then 0.05 else c.collar.r;
  local frontTop = cz - cr;
  local zs = if std.type(c.buttons) == 'array' then c.buttons else spread(cz - cr - 0.025, -d / 2 + 0.025, c.buttons);
  local sl = if c.sleeves == null then null else { kind: 'flat', w: 0.09, t: 0.006 } + c.sleeves;
  h.foldedGarment(w, d, ht, c.folds)
  + (if c.collar == null then [] else
       local k = { gap: 35 } + c.collar;
       h.crescent('collar', 'collar', k.r, k.r + k.wd, -180 + k.gap, 180 - k.gap, 12, ht, ht + k.ht, 0, cz))
  + (if c.front == 'placket' then [box('placket', 'front', [-c.frontW / 2, ht, -d / 2], [c.frontW / 2, ht + c.frontT, frontTop])]
     else if c.front == 'lapels' then [
       strip('lapel-under', 'front', [0.055, frontTop + 0.02], [-0.02, -d / 2 + 0.005], ht, c.frontW, c.frontT * 0.8),
       strip('lapel-over', 'front', [-0.055, frontTop + 0.02], [0.02, -d / 2 + 0.005], ht + c.frontT * 0.8, c.frontW, c.frontT),
     ]
     else if c.front == 'shawl' then [
       strip('shawl-l', 'front', [-cr - c.frontW / 2, d / 2], [0.005, c.vz], ht, c.frontW, c.frontT),
       strip('shawl-r', 'front', [cr + c.frontW / 2, d / 2], [-0.005, c.vz], ht, c.frontW, c.frontT),
     ]
     else [])
  + buttons('button', 'button', 0, zs, ht + c.frontT, c.buttonR)
  + std.flattenArrays([
    local p = { flap: 0.03, snap: false, single: false } + pk;
    [
      box('pocket-%d' % (i * 2 + m), 'pocket', [x - p.w / 2, ht, p.z - p.d / 2], [x + p.w / 2, ht + 0.004, p.z + p.d / 2]),
    ] + (if p.flap > 0 then [
           box('flap-%d' % (i * 2 + m), 'flap', [x - p.w / 2 - 0.003, ht + 0.004, p.z + p.d / 2 - p.flap], [x + p.w / 2 + 0.003, ht + 0.008, p.z + p.d / 2 + 0.003]),
         ] else [])
    + (if p.snap then [h.disc('pocket-snap-%d' % (i * 2 + m), 'button', 0.005, ht + 0.008, ht + 0.012, x, p.z + p.d / 2 - p.flap / 2)] else [])
    for i in std.range(0, std.length(c.pockets) - 1)
    for pk in [c.pockets[i]]
    for m in (if std.get(pk, 'single', false) then [0] else [0, 1])
    for x in [if m == 0 then pk.x else -pk.x]
  ])
  + (if c.epaulettes then std.flattenArrays([
       [
         strip('epaulette-%d' % (s + 1), 'flap', [s * (w / 2 - 0.005), cz + 0.02], [s * (cr + 0.015), cz + 0.035], ht, 0.03),
         h.disc('epaulette-button-%d' % (s + 1), 'button', c.buttonR, ht + 0.004, ht + 0.008, s * (cr + 0.03), cz + 0.034),
       ]
       for s in [-1, 1]
     ]) else [])
  + (if sl == null then []
     else if sl.kind == 'flat' then [
       box('sleeve-%d' % (s + 1), 'sleeve', [if s < 0 then -w / 2 else w / 2 - sl.w, ht, -d / 2 + 0.03], [if s < 0 then -w / 2 + sl.w else w / 2, ht + sl.t, d / 2 - 0.02])
       for s in [-1, 1]
     ]
     else std.flattenArrays([
       local x = s * (w / 2 - sl.r - 0.004), z0 = -d / 2 + 0.01, len = d / 2 - 0.04 - z0, p = 'sleeve-%d-' % (s + 1);
       [h.turned(p + 'roll', 'sleeve', 'z', [[0, 0], [0, sl.r * 0.85], [0.01, sl.r], [len, sl.r], [len, 0]], [x, ht, z0])]
       + [
         h.turned('%sring-%d' % [p, i], 'stitch', 'z', [[0, 0], [0, sl.r + 0.002], [0.004, sl.r + 0.002], [0.004, 0]], [x, ht, z0 + 0.03 + i * 0.045])
         for i in std.range(0, std.floor((len - 0.05) / 0.045))
       ]
       + [h.turned(p + 'cuff', 'cuff', 'z', [[0, 0], [0, sl.r + 0.003], [0.016, sl.r + 0.003], [0.016, 0]], [x, ht, z0])]
       for s in [-1, 1]
     ]))
  + (if c.hood == null then [] else
       local hw = c.hood.w, hl = c.hood.l, t = std.get(c.hood, 't', 0.012);
       [
         flat('hood', 'hood', [[-hw / 2, d / 2], [hw / 2, d / 2], [hw / 2 - 0.02, d / 2 - hl * 0.6], [0, d / 2 - hl], [-hw / 2 + 0.02, d / 2 - hl * 0.6]], ht, t),
         box('hood-drape', 'hood', [-hw / 2, ht * 0.35, d / 2], [hw / 2, ht + t, d / 2 + t]),
       ])
  + (if c.belt == null then [] else
       local b = { w: 0.035, t: 0.006, lift: 0, knot: true } + c.belt;
       local y = ht + b.lift;
       [
         box('belt-top', 'belt', [-w / 2 - b.t, y, b.z - b.w / 2], [w / 2 + b.t, y + b.t, b.z + b.w / 2]),
         box('belt-l', 'belt', [-w / 2 - b.t, 0, b.z - b.w / 2], [-w / 2, y + b.t, b.z + b.w / 2]),
         box('belt-r', 'belt', [w / 2, 0, b.z - b.w / 2], [w / 2 + b.t, y + b.t, b.z + b.w / 2]),
       ] + (if b.knot then [
              box('belt-knot', 'belt', [-b.w * 0.7, y + b.t, b.z - b.w * 0.6], [b.w * 0.7, y + b.t + b.w * 0.55, b.z + b.w * 0.6]),
              strip('belt-end-a', 'belt', [-b.w * 0.3, b.z - b.w * 0.5], [-b.w * 1.4, -d / 2 + 0.01], y + b.t, b.w, b.t),
              strip('belt-end-b', 'belt', [b.w * 0.3, b.z - b.w * 0.5], [b.w * 1.7, -d / 2 + 0.02], y + b.t, b.w, b.t),
            ] else []));

// Shirts, tops, dresses and aprons folded on a shelf lie on h.foldedGarment, `w` across x and `d` along z, top face
// at `ht`, neck at the +z end and the hem folded under at -z.

// A band wrapped across the bundle at z, `bw` wide, over the top and down both sides: hems, trim and belts.
local bandX(id, slot, z, bw, w, ht, t=0.004) = [
  box(id + '-top', slot, [-w / 2 - t, ht, z - bw / 2], [w / 2 + t, ht + t, z + bw / 2]),
  box(id + '-left', slot, [-w / 2 - t, 0, z - bw / 2], [-w / 2, ht + t, z + bw / 2]),
  box(id + '-right', slot, [w / 2, 0, z - bw / 2], [w / 2 + t, ht + t, z + bw / 2]),
];
// Short sleeves folded out from each shoulder, `reach` past the body, `len` along z from `z1` down, with a hem band in
// slot `cuff` along the outer edge. Slot sleeve.
local shortSleeves(w, ht, z1, len, reach=0.035, cuff='sleeve', t=0.006) = std.flattenArrays([
  [
    sbox('sleeve-' + s, 'sleeve', [sg * (w / 2 - 0.03), ht * 0.4, z1 - len], [sg * (w / 2 + reach), ht + t, z1]),
    sbox('sleeve-hem-' + s, cuff, [sg * (w / 2 + reach - 0.012), ht * 0.4, z1 - len - 0.002], [sg * (w / 2 + reach + 0.002), ht + t + 0.002, z1 + 0.002]),
  ]
  for s in ['l', 'r']
  for sg in [if s == 'l' then -1 else 1]
]);
// A scoop or round neck centred at [0, cz] on a face at y: the shadowed opening (slot hole) and its binding in `bind`.
local roundNeck(r, cz, y, bind, bw=0.01) =
  h.crescent('neck-hole', 'hole', 0.004, r, 90, 270, 8, y, y + 0.002, 0, cz)
  + h.crescent('neck-bind', bind, r, r + bw, 90, 270, 8, y, y + 0.005, 0, cz);
// A V neck reaching down to vz from a mouth `half` wide at the +z edge (d / 2): a dark triangle (slot hole) and two
// trim strips in `bind`.
local vNeck(half, d, vz, y, bind, bw=0.012) = [
  flat('neck-hole', 'hole', [[-half, d / 2], [half, d / 2], [0, vz]], y, 0.002),
  strip('neck-bind-l', bind, [-half - bw / 2, d / 2], [0, vz - bw / 2], y, bw, 0.005),
  strip('neck-bind-r', bind, [half + bw / 2, d / 2], [0, vz - bw / 2], y, bw, 0.005),
];
// A short-sleeved shirt folded: T-shirts, jerseys and blouses. `neck` is 'round' (radius neckR) or 'v' (mouth `half`
// wide, down to `vz`), bound in slot `trim`; sleeves `sleeveLen` along z reach `reach` past the body, hemmed in `trim`.
// Slots: cloth, sleeve, hole, trim.
local tee(o={}) =
  local c = { w: 0.3, d: 0.28, ht: 0.03, folds: 3, neck: 'round', neckR: 0.045, half: 0.04, vz: null, sleeveLen: 0.09, reach: 0.035 } + o;
  local w = c.w, d = c.d, ht = c.ht;
  h.foldedGarment(w, d, ht, c.folds)
  + (if c.neck == 'v' then vNeck(c.half, d, if c.vz == null then d / 2 - 0.07 else c.vz, ht, 'trim')
     else if c.neck == 'round' then roundNeck(c.neckR, d / 2 - 0.005, ht, 'trim')
     else error 'tee neck is round or v')
  + shortSleeves(w, ht, d / 2 - 0.02, c.sleeveLen, c.reach, 'trim');

// A dress or skirt folded long. A dress takes `neck` { r } scooped into the top layer at the +z end (slot lining,
// flush, with a `trim` binding), and optionally jacket `sleeves` and a seam at `waistZ` (slot waist); a skirt sets
// `neck: null` and takes a `waistband` { w } across the +z end (slot waist). Slots: cloth, and those used.
local dress(o={}) =
  local c = { w: 0.28, d: 0.34, ht: 0.04, folds: 4, neck: { r: 0.06 }, sleeves: null, waistZ: null, waistband: null } + o;
  local w = c.w, d = c.d, ht = c.ht, cz = d / 2;
  local top = ht + (if c.sleeves == null then 0 else std.get(c.sleeves, 't', 0.006));
  (if c.sleeves == null then h.foldedGarment(w, d, ht, c.folds)
   else jacket({ w: w, d: d, ht: ht, folds: c.folds, front: 'none', buttons: [], collar: null, sleeves: c.sleeves }))
  + (if c.neck == null then [] else
       [flat('neckline', 'lining', [onArc(c.neck.r, 90 + 180 * i / 10, cz) for i in std.range(0, 10)], ht - 0.001, 0.002)]
       + h.crescent('neck-trim', 'trim', c.neck.r, c.neck.r + 0.01, 90, 270, 10, ht, ht + 0.003, 0, cz))
  + (if c.waistZ == null then [] else [box('waist-seam', 'waist', [-w / 2 - 0.002, ht, c.waistZ - 0.006], [w / 2 + 0.002, ht + 0.003, c.waistZ + 0.006])])
  + (if c.waistband == null then [] else bandX('waistband', 'waist', d / 2 - c.waistband.w / 2, c.waistband.w, w, top, 0.004));

// An apron folded into a block with its bib lying on top: the bib tapering towards the neck, the neck strap looped
// over the front edge, the waist ties crossed down the skirt and a patch pocket split in two near the hem. `t` is
// the cloth thickness; `rivets` adds rivets at the pocket's corners and `buckle` one on the neck strap (slot rivet).
// Slots: cloth, bib, binding, strap, pocket, rivet.
local apron(o={}) =
  local c = { w: 0.26, d: 0.32, ht: 0.024, folds: 2, t: 0.004, rivets: false, buckle: false } + o;
  local w = c.w, d = c.d, ht = c.ht, t = c.t;
  local bz0 = -0.035, bz1 = 0.085;
  h.foldedGarment(w, d, ht, c.folds) + [
    flat('bib', 'bib', [[-0.105, bz0], [0.105, bz0], [0.07, bz1], [-0.07, bz1]], ht, t),
    flat('bib-hem', 'binding', [[-0.07, bz1 - 0.008], [0.07, bz1 - 0.008], [0.07, bz1], [-0.07, bz1]], ht + t, 0.002),
  ] + h.crescent('neck', 'strap', 0.058, 0.07, -90, 90, 10, ht + t, ht + t + 0.004, 0, bz1 - 0.004) + [
    strip('tie-l', 'strap', [-0.105, bz0 + 0.006], [0.07, -d / 2 + 0.012], ht + t, 0.014, 0.004),
    strip('tie-r', 'strap', [0.105, bz0 + 0.006], [-0.05, -d / 2 + 0.02], ht + t + 0.004, 0.014, 0.004),
    box('pocket', 'pocket', [-0.085, ht, -d / 2 + 0.02], [0.085, ht + t, -0.055]),
    box('pocket-seam', 'binding', [-0.002, ht + t, -d / 2 + 0.02], [0.002, ht + t + 0.002, -0.055]),
    box('pocket-hem', 'binding', [-0.085, ht + t, -0.063], [0.085, ht + t + 0.002, -0.055]),
  ] + (if c.rivets then [
         h.disc('rivet-%d-%d' % [i, j], 'rivet', 0.004, ht + t, ht + t + 0.003, [-0.08, 0, 0.08][i], [-d / 2 + 0.026, -0.061][j])
         for i in [0, 1, 2]
         for j in [0, 1]
       ] else [])
  + (if c.buckle then [box('buckle', 'rivet', [0.072, ht + t + 0.004, bz1 + 0.026], [0.09, ht + t + 0.008, bz1 + 0.044])] else []);

// A tapered strip lying on a top face at y from point a to point b ([x, z]), w0 wide at a and w1 at b: sleeves laid
// out flat, straps and long bones.
local taper(id, slot, a, b, w0, w1, y, t) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len, nz = dx / len;
  flat(id, slot, [
    [a[0] + nx * w0 / 2, a[1] + nz * w0 / 2],
    [b[0] + nx * w1 / 2, b[1] + nz * w1 / 2],
    [b[0] - nx * w1 / 2, b[1] - nz * w1 / 2],
    [a[0] - nx * w0 / 2, a[1] - nz * w0 / 2],
  ], y, t);
// A top laid out flat, front up, collar towards +z: a body `w` across and `l` long, `t` thick, its shoulders sloping
// in to a neck notch `neckW` wide and `neckD` deep where the back panel's inside shows (slot lining). A sleeveless
// top cuts armholes `armIn` in from each side and `armD` deep below the shoulder; optional sleeves { l, w0, w1, ang }
// lie angled `ang` degrees out from straight down, from the shoulder. Slots: cloth, lining, sleeve.
local flatTop(o={}) =
  local c = { w: 0.44, l: 0.6, t: 0.008, sh: 0.06, neckW: 0.075, neckD: 0.06, armIn: 0, armD: 0.16, sleeves: null } + o;
  local w = c.w, l = c.l, t = c.t, top = l / 2 - c.neckD, sw = w / 2 - c.armIn;
  [
    flat('body', 'cloth', [[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, top - c.armD], [-w / 2, top - c.armD]], 0, t),
    flat('chest', 'cloth', [[-sw, top - c.armD - 0.01], [sw, top - c.armD - 0.01], [sw, top], [-sw, top]], 0, t),
    flat('lining', 'lining', [[-c.neckW, top], [c.neckW, top], [c.neckW, l / 2 - 0.004], [-c.neckW, l / 2 - 0.004]], 0, t * 0.5),
  ] + [
    flat('shoulder-%d' % (s + 1), 'cloth', [[s * c.neckW, top], [s * sw, top], [s * (sw - 0.02), top + c.neckD - c.sh * 0.5], [s * (c.neckW + 0.02), l / 2], [s * c.neckW, l / 2]], 0, t)
    for s in [-1, 1]
  ] + (if c.armIn > 0 then [
         flat('armhole-%d' % (s + 1), 'cloth', [[s * sw, top - c.armD - 0.01], [s * (sw + c.armIn), top - c.armD - 0.01], [s * (sw + c.armIn), top - c.armD + 0.004], [s * sw, top - c.armD + c.armIn * 1.2]], 0, t)
         for s in [-1, 1]
       ] else [])
  + (if c.sleeves == null then [] else
       local sl = c.sleeves;
       [
         local a = [s * (w / 2 - 0.03), top - sl.w0 / 2 + 0.02];
         local b = [a[0] + s * sl.l * std.sin(rad(sl.ang)), a[1] - sl.l * std.cos(rad(sl.ang))];
         taper('sleeve-%d' % (s + 1), 'sleeve', a, b, sl.w0, sl.w1, 0, t)
         for s in [-1, 1]
       ]);

// Gloves lie flat as a pair, backs up, fingers to +z, each centred on cx with its thumb out to side s (-1 left at -x,
// +1 right). Finger columns are [x offset at the knuckle, length, splay]; the splay fans each finger out by that share
// of its length so the fingers stand apart in the tiles.
local fingerCols = [[0.028, 0.074, 0.12], [0.009, 0.084, 0.04], [-0.01, 0.078, -0.05], [-0.029, 0.062, -0.14]];
local knuckleZ = 0.088;
// A strip `w` wide along finger i, from share a to share b of its length, lying from y0 to y1: lames, pads, bands.
local onFinger(id, slot, cx, s, i, a, b, w, y0, y1) =
  local fx = fingerCols[i][0], fl = fingerCols[i][1], sp = fingerCols[i][2];
  local at(k) = [knuckleZ + k * fl, cx + s * (fx + sp * k * fl)];
  local p0 = at(a), p1 = at(b);
  h.prism(id, slot, 'y', [[p0[0], p0[1] - w / 2], [p0[0], p0[1] + w / 2], [p1[0], p1[1] + w / 2], [p1[0], p1[1] - w / 2]], y0, y1);
local gloveDefaults = {
  t: 0.016, cuff: 0.06, flare: 0.052, reach: 1, mitten: false, fingerW: 0.017,
  fingerSlot: 'glove', thumbSlot: 'glove',
  knuckle: null, heel: null, binding: null, ribs: 0, mail: null, plate: null,
};
// One glove: the hand `t` thick, a cuff `cuff` long flaring to half-width `flare`, fingers cut to share `reach` of
// their length (fingerless below 1) or one mitten, and optional details, each named by the slot it takes:
// `knuckle` and `heel` leather strips, `binding` round the cuff's mouth, `ribs` (a count) of knit across the cuff,
// `mail` ring rows over the back and fingers, `plate` a riveted plate curved over the back (rivets in slot rivet).
// Slots: glove, cuff, and those named by fingerSlot, thumbSlot and the details.
local glove(p, cx, s, o={}) =
  local c = gloveDefaults + o;
  local x(v) = cx + s * v;
  local f = c.reach, t = c.t;
  local back = [[-0.047, -0.014], [0.047, -0.014], [0.047, 0.084], [-0.047, 0.084]];
  [
    sbox(p + 'palm', 'glove', [x(-0.045), 0, -0.02], [x(0.045), t, 0.09]),
    h.prism(p + 'cuff', 'cuff', 'y', [[-0.015 - c.cuff, x(-c.flare)], [-0.015 - c.cuff, x(c.flare)], [-0.015, x(0.046)], [-0.015, x(-0.046)]], 0, t * 0.9),
    h.prism(p + 'thumb', c.thumbSlot, 'y', [[-0.01, x(0.04)], [0.03, x(0.045)], [0.03 + f * 0.055, x(0.045 + f * 0.04)], [0.005 + f * 0.065, x(0.06 + f * 0.04)], [0.005, x(0.06)]], 0, t * 0.9),
  ]
  + (if c.mitten then [
       h.prism(p + 'mitten', c.fingerSlot, 'y', [[0.086, x(-0.045)], [0.086, x(0.045)], [0.15, x(0.046)], [0.172, x(0.03)], [0.178, x(0)], [0.17, x(-0.03)], [0.15, x(-0.045)]], 0, t * 0.9),
     ] else [
       onFinger(p + 'finger-%d' % i, c.fingerSlot, cx, s, i, -0.01, f, c.fingerW, 0, t * 0.85)
       for i in std.range(0, 3)
     ])
  + (if c.knuckle == null then [] else [sbox(p + 'knuckle', c.knuckle, [x(-0.046), t, 0.07], [x(0.046), t + 0.003, 0.09])])
  + (if c.heel == null then [] else [sbox(p + 'heel', c.heel, [x(-0.046), t, -0.02], [x(0.046), t + 0.003, -0.008])])
  + (if c.binding == null then [] else [sbox(p + 'binding', c.binding, [x(-c.flare - 0.002), 0, -0.018 - c.cuff], [x(c.flare + 0.002), t * 0.9 + 0.002, -0.01 - c.cuff])])
  + [
    local z0 = -0.01 - c.cuff, z1 = -0.02, step = (z1 - z0) / c.ribs;
    box(p + 'rib-%d' % i, 'cuff', [cx - c.flare + 0.002, t * 0.9, z0 + step * i], [cx + c.flare - 0.002, t * 0.9 + 0.003, z0 + step * (i + 0.5)])
    for i in std.range(0, c.ribs - 1)
  ]
  + (if c.mail == null then [] else [
       sbox(p + 'row-%d' % i, c.mail, [x(-0.046), t, -0.016 + i * 0.012], [x(0.046), t + 0.002, -0.01 + i * 0.012])
       for i in std.range(0, 8)
     ] + (if c.mitten then [] else [
            local step = 0.012 / fingerCols[i][1];
            onFinger(p + 'finger-%d-row-%d' % [i, k], c.mail, cx, s, i, 0.04 + k * step, 0.04 + k * step + step / 2, c.fingerW + 0.002, t * 0.85, t * 0.85 + 0.002)
            for i in std.range(0, 3)
            for k in std.range(0, std.floor(fingerCols[i][1] * f / 0.012) - 1)
          ]))
  + (if c.plate == null then [] else
       h.curvedPlate(p + 'plate', c.plate, back, t, 0.003, 0.08, 6, cx)
       + [
         local v = [-0.036, 0.036][i % 2], zz = [-0.004, 0.074][std.floor(i / 2)], top = h.curvedTopAt(back, t, 0.003, 0.08, v);
         sbox(p + 'rivet-%d' % i, 'rivet', [x(v - 0.003), top, zz - 0.003], [x(v + 0.003), top + 0.003, zz + 0.003])
         for i in [0, 1, 2, 3]
       ]);
// Both gloves `gap` either side of x = 0, with `extra(p, cx, s)` adding each glove's own details. `scale` in the
// options makes the whole pair, gap and extras included, that many times larger for oversized cuts.
local glovePair(o={}, gap=0.07, extra=function(p, cx, s) []) =
  local pair = glove('l-', -gap, -1, o) + extra('l-', -gap, -1) + glove('r-', gap, 1, o) + extra('r-', gap, 1);
  local k = std.get(o, 'scale', 1);
  if k == 1 then pair else h.scaled(pair, k);

// Hats stand upright on their band, face to +z. A crown is turned on y: a superellipse of radius `r` and height `ht`
// with exponent `p` (2 round, higher squarer), or an explicit outside `path` of [y, r] points from the band up to the
// axis. `hollow` (a wall thickness) returns the path down the inside so the hat is open underneath.
local crown(o) =
  local c = { id: 'crown', slot: 'crown', p: 2.5, y0: 0, path: null, hollow: null, steps: 10 } + o;
  local path = if c.path != null then c.path else [[0, c.r]] + [
    [c.ht * std.pow(std.sin(rad(90 * i / c.steps)), 2 / c.p), c.r * std.pow(std.cos(rad(90 * i / c.steps)), 2 / c.p)]
    for i in std.range(1, c.steps)
  ];
  local n = std.length(path);
  local inside = if c.hollow == null then [] else [
    local q = path[n - 1 - i];
    [q[0] - c.hollow, std.max(0, q[1] - (if q[1] == 0 then 0 else c.hollow))]
    for i in std.range(0, n - 1)
  ];
  if c.hollow == null then [h.turned(c.id, c.slot, 'y', [[0, 0]] + path, [0, c.y0, 0])]
  else [h.turned(c.id, c.slot, 'y', path + inside + [path[0]], [0, c.y0, 0])];
// A brim turned on y from radius r0 (0 for a disc under the crown) to r1, `t` thick, its outer half rising `lift`
// (negative droops) to the edge. Slot brim.
local brim(o) =
  local c = { id: 'brim', slot: 'brim', r0: 0, t: 0.006, y0: 0, lift: 0 } + o;
  local rm = c.r0 + (c.r1 - c.r0) * std.get(c, 'flat', 0.5);
  local ring = [[0, c.r0], [0, rm], [c.lift, c.r1], [c.lift + c.t, c.r1], [c.t, rm], [c.t, c.r0]];
  [h.turned(c.id, c.slot, 'y', if c.r0 > 0 then ring + [ring[0]] else ring, [0, c.y0, 0])];
// A peak reaching forward from the band at radius r to `reach` at the front, `half` wide across x, swept `span`
// degrees either side of the front. Slot visor.
local visor(o) =
  local c = { id: 'visor', slot: 'visor', span: 72, steps: 10, y0: 0.016, t: 0.006 } + o;
  local ang(i) = rad(-c.span + 2 * c.span * i / c.steps);
  local inner(i) = [c.r * std.sin(ang(i)), c.r * std.cos(ang(i))];
  local outer(i) = [c.half * std.sin(ang(i)), c.reach * std.cos(ang(i))];
  [
    h.prism('%s-%d' % [c.id, i], c.slot, 'y', [[q[1], q[0]] for q in [outer(i), outer(i + 1), inner(i + 1), inner(i)]], c.y0, c.y0 + c.t)
    for i in std.range(0, c.steps - 1)
  ];
// A closed ring on y between radii r0 and r1 from y0 to y1: hat bands, sweatbands, rolled edges.
local ring(id, slot, r0, r1, y0, y1) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [0, y0, 0]);
// A whole hat: `crown` options, and optional `brim`, `visor` and `band` ({ r, y0, ht }, slot band) options, `seams`
// (a count of radial seams down a crown's top at height `seamY`) and `button` (a top button at height `buttonY`).
local hat(o) =
  local c = { brim: null, visor: null, band: null, seams: 0, seamR: null, seamY: null, button: false, buttonY: null } + o;
  crown(c.crown)
  + (if c.brim == null then [] else brim(c.brim))
  + (if c.visor == null then [] else visor(c.visor))
  + (if c.band == null then [] else [ring('band', 'band', c.band.r - 0.002, c.band.r + std.get(c.band, 't', 0.002), c.band.y0, c.band.y0 + c.band.ht)])
  + [
    local a = rad(360 * i / c.seams + 22.5), sn = std.sin(a), cs = std.cos(a), r1 = c.seamR, w = 0.003;
    h.prism('seam-%d' % i, 'seam', 'y', [[0, 0], [r1 * cs - w * sn, r1 * sn + w * cs], [r1 * cs + w * sn, r1 * sn - w * cs]], c.seamY, c.seamY + 0.003)
    for i in std.range(0, c.seams - 1)
  ]
  + (if c.button then [h.disc('button', 'button', 0.008, c.buttonY, c.buttonY + 0.006)] else []);

// Eyewear stands on its lower rims, front on +z, temples folded behind. `kind` picks the shape:
//   'spectacles' two superellipse lenses `a` by `b` (exponent p) in rims `rim` wide, `gap` apart; `half` flat-tops
//                them, and `pads`, `bifocal`, `brow` and `shields` add details. Slots: frame, lens, temple, pad,
//                segment, shield.
//   'wrap'       one wrap lens of radius R round the face, `span` degrees each side, `ht` tall, a brow bar over it;
//                `open` lays the temples straight back. Slots: lens, frame, temple.
//   'goggles'    two round cups of radii rIn to rOut and `depth`, `gap` apart, joined by a bridge, a strap `strapW`
//                wide looped behind; `vents` adds vent slots. Slots: cup, rim, lens, bridge, strap.
local spectacles(c) =
  local a = c.a, b = c.b, rim = c.rim, d = c.depth;
  local ly = b + rim, cx = c.gap / 2 + a + rim, outer = cx + a + rim;
  local hy = if c.half then ly - c.templeH - 0.002 else ly + 0.25 * b;
  local eye(side, s) =
    local inn = superellipse(a, b, c.p, c.n, c.half, s * cx, ly), out = superellipse(a + rim, b + rim, c.p, c.n, c.half, s * cx, ly), m = std.length(inn);
    [h.prism('lens-' + side, 'lens', 'z', inn, d / 2 - 0.001, d / 2 + 0.001)]
    + [
      h.prism('rim-%s-%d' % [side, i], 'frame', 'z', [out[i], out[(i + 1) % m], inn[(i + 1) % m], inn[i]], 0, d)
      for i in std.range(0, (if c.half then m - 2 else m - 1))
    ]
    + (if c.half then [sbox('top-' + side, 'frame', [s * (cx - a - rim), ly, 0], [s * (cx + a + rim), ly + rim, d])] else [])
    + (if c.bifocal then [h.prism('segment-' + side, 'segment', 'z', superellipse(0.012, 0.008, 2, 12, true, s * (cx - 0.003), ly - 0.3 * b), d / 2 + 0.001, d / 2 + 0.003)] else []);
  local tY0 = hy, tY1 = hy + c.templeH;
  local temple(side, s, z0) =
    local z1 = z0 - c.templeW, x0 = s * (outer + 0.002), x1 = x0 - s * c.templeLen;
    [
      sbox('hinge-' + side, 'frame', [s * (outer - 0.003), tY0 - 0.002, z1], [s * (outer + 0.004), tY1 + 0.002, d]),
      sbox('temple-' + side, 'temple', [x0, tY0, z0], [x1 + s * 0.02, tY1, z1]),
      h.prism('tip-' + side, 'temple', 'z', [[x1 + s * 0.022, tY1], [x1 + s * 0.016, tY1], [x1, tY0 - c.tipDrop], [x1 + s * 0.006, tY0 - c.tipDrop]], z1, z0),
    ]
    + (if c.shields then [sbox('shield-' + side, 'shield', [s * (outer + 0.001), ly - 0.6 * b, z1 - 0.002], [s * (outer + 0.003), ly + 0.8 * b, 0])] else []);
  eye('l', -1) + eye('r', 1)
  + (if c.half then [] else [sbox('bridge', 'frame', [-(c.gap / 2 + 0.001), ly + 0.3 * b, 0], [c.gap / 2 + 0.001, ly + 0.3 * b + 0.004, d])])
  + (if c.brow then [sbox('brow', 'frame', [-outer, ly + 0.7 * b, 0], [outer, ly + b + rim, d + 0.002])] else [])
  + (if c.pads then [
       sbox('pad-' + side, 'pad', [s * (c.gap / 2 - 0.001), ly - 0.35 * b, -0.006], [s * (c.gap / 2 + 0.004), ly + 0.1 * b, 0])
       for side in ['l', 'r']
       for s in [if side == 'l' then -1 else 1]
     ] else [])
  + temple('r', 1, -0.004)
  + temple('l', -1, -0.004 - c.templeW - 0.002);
local wrapLens(c) =
  local R = c.R, span = c.span, ht = c.ht, cz = -R;
  local lo(ang) = if std.abs(ang) < 9 then 0.016 else 0.004 + 0.008 * sq(ang / span);
  local hi(ang) = ht - 0.01 * sq(ang / span);
  local ex = R * std.sin(rad(span)), ez = cz + R * std.cos(rad(span));
  wrapBand('lens', 'lens', R, 0.002, -span, span, 24, cz, lo, hi)
  + wrapBand('brow', 'frame', R + 0.001, 0.005, -span - 2, span + 2, 24, cz, hi, function(ang) hi(ang) + 0.006)
  + wrapBand('nose', 'frame', R - 0.001, 0.004, -9, 9, 4, cz, function(ang) 0.012, function(ang) 0.016)
  + std.flattenArrays([
    local s = if side == 'l' then -1 else 1;
    [sbox('hinge-' + side, 'frame', [s * (ex - 0.004), ht - 0.014, ez - 0.012], [s * (ex + 0.002), ht + 0.004, ez + 0.004])]
    + (if c.open then [
         sbox('temple-' + side, 'temple', [s * ex, ht - 0.01, ez - c.templeLen], [s * (ex - 0.006), ht - 0.002, ez - 0.012]),
       ] else [
         sbox('temple-' + side, 'temple', [s * ex, ht - 0.01, ez - 0.012 - (if side == 'r' then 0 else 0.008)], [s * (ex - c.templeLen), ht - 0.002, ez - 0.018 - (if side == 'r' then 0 else 0.008)]),
       ])
    for side in ['l', 'r']
  ]);
local goggles(c) =
  local rIn = c.rIn, rOut = c.rOut, depth = c.depth, strapW = c.strapW;
  local cx = c.gap / 2 + rOut + 0.003, y = rOut + 0.003;
  std.flattenArrays([
    local s = if side == 'l' then -1 else 1;
    [
      h.turned('cup-' + side, 'cup', 'z', [[0, rOut - 0.003], [0, rOut + 0.003], [depth - 0.004, rOut], [depth - 0.004, rIn], [0, rIn - 0.003], [0, rOut - 0.003]], [s * cx, y, -depth]),
      h.turned('rim-' + side, 'rim', 'z', [[0, rIn - 0.002], [0, rOut + 0.002], [0.006, rOut + 0.002], [0.006, rIn - 0.002], [0, rIn - 0.002]], [s * cx, y, -0.006]),
      h.turned('lens-' + side, 'lens', 'z', [[0, 0], [0, rIn], [0.002, rIn], [0.002, 0]], [s * cx, y, -0.004]),
      sbox('lug-' + side, 'rim', [s * (cx + rOut - 0.002), y - strapW / 2, -depth + 0.002], [s * (cx + rOut + 0.006), y + strapW / 2, -depth + 0.012]),
    ]
    + (if c.vents then [
         sbox('vent-%s-%d' % [side, k], 'rim', [s * cx - 0.004, y + (k * 2 - 1) * (rOut + 0.001), -depth + 0.006], [s * cx + 0.004, y + (k * 2 - 1) * (rOut + 0.001) + 0.002, -depth + 0.012])
         for k in [0, 1]
       ] else [])
    for side in ['l', 'r']
  ])
  + [sbox('bridge', 'bridge', [-(cx - rOut + 0.002), y - 0.003, -0.012], [cx - rOut + 0.002, y + 0.003, -0.006])]
  + wrapBand('strap', 'strap', cx + rOut + 0.006, 0.003, 90, 270, 18, -depth + 0.006, function(ang) y - strapW / 2, function(ang) y + strapW / 2);
local eyewear(o) =
  local kind = std.get(o, 'kind', 'spectacles');
  if kind == 'spectacles' then spectacles({
    a: 0.025, b: 0.018, p: 2.6, rim: 0.004, gap: 0.018, depth: 0.004, n: 28, half: false,
    templeLen: 0.13, templeW: 0.004, templeH: 0.004, pads: false, bifocal: false, brow: false, shields: false, tipDrop: 0.012,
  } + o)
  else if kind == 'wrap' then wrapLens({ R: 0.085, span: 58, ht: 0.044, open: false, templeLen: 0.125 } + o)
  else if kind == 'goggles' then goggles({ rIn: 0.019, rOut: 0.025, depth: 0.03, gap: 0.016, strapW: 0.016, vents: false } + o)
  else error 'eyewear kind is spectacles, wrap or goggles';

// A mail curtain laid out flat as found off the helmet: a crescent of rings between radii r0 and r1 round [0, cz], open
// at the back between a1 and a0 + 360 degrees, `rows` raised ring rows running round it, a leather band along the inner
// edge pierced with `holes` lacing holes, and with `ties` two thongs at the open back. Slots: mail, band, hole.
local mailCurtain(o) =
  local c = { a0: -150, a1: 150, cz: -0.02, rows: 8, holes: 13, ties: true, steps: 30 } + o;
  local r0 = c.r0, r1 = c.r1, a0 = c.a0, a1 = c.a1, cz = c.cz;
  h.crescent('mail', 'mail', r0, r1, a0, a1, c.steps, 0, 0.004, 0, cz)
  + std.flattenArrays([
    h.crescent('row-%d' % i, 'mail', rr - 0.003, rr + 0.003, a0 + 2, a1 - 2, c.steps, 0.004, 0.007, 0, cz)
    for i in std.range(0, c.rows - 1)
    for rr in [r0 + 0.035 + (r1 - r0 - 0.045) * i / std.max(1, c.rows - 1)]
  ])
  + h.crescent('band', 'band', r0 - 0.006, r0 + 0.022, a0 - 4, a1 + 4, c.steps, 0, 0.008, 0, cz)
  + [
    local p = onArc(r0 + 0.008, a, cz);
    h.disc('hole-%d' % i, 'hole', 0.004, 0.008, 0.0095, p[0], p[1])
    for i in std.range(0, c.holes - 1)
    for a in [a0 + 4 + (a1 - a0 - 8) * i / (c.holes - 1)]
  ]
  + (if c.ties then [
       local p = onArc(r0 + 0.008, s * (a1 + 2), cz);
       sbox('tie-%d' % (s + 1), 'band', [p[0] - 0.003, 0, p[1]], [p[0] + 0.003, 0.009, p[1] - 0.09])
       for s in [-1, 1]
     ] else []);

// Socks lie flat as a pair, side by side along x, each an L seen from above: the leg runs along z from its cuff at
// -legL to the heel at 0, and the foot turns out `footL` along x, toes outward. `stripes` lists bands across the leg
// by their distance from the cuff's edge. Slots: sock, heel, toe, cuff, stripe.
local zx(poly) = [[p[1], p[0]] for p in poly];
local sock(p, cx, s, c) =
  local w = c.w, t = c.t, footL = c.footL, legL = c.legL;
  local x(dd) = cx - s * w / 2 + s * dd;
  [
    box(p + 'leg', 'sock', [cx - w / 2, 0, -legL], [cx + w / 2, t, 0.001]),
    h.prism(p + 'foot', 'sock', 'y', zx([
      [x(0), 0], [x(footL - 0.03), 0], [x(footL - 0.008), w * 0.22], [x(footL), w * 0.5], [x(footL - 0.01), w * 0.84],
      [x(footL - 0.032), w], [x(0.034), w], [x(0.01), w - 0.01], [x(0), w - 0.036],
    ]), 0, t),
    h.prism(p + 'heel', 'heel', 'y', zx([[x(0), w * 0.2], [x(0.05), w * 0.2], [x(0.05), w], [x(0.034), w], [x(0.01), w - 0.01], [x(0), w - 0.036]]), t, t + 0.001),
    h.prism(p + 'toe', 'toe', 'y', zx([[x(footL - 0.05), 0], [x(footL - 0.03), 0], [x(footL - 0.008), w * 0.22], [x(footL), w * 0.5], [x(footL - 0.01), w * 0.84], [x(footL - 0.032), w], [x(footL - 0.05), w]]), t, t + 0.001),
    box(p + 'cuff', 'cuff', [cx - w / 2 - 0.002, 0, -legL], [cx + w / 2 + 0.002, t + 0.002, -legL + c.cuff]),
  ] + [
    box(p + 'stripe-%d' % i, 'stripe', [cx - w / 2 - 0.002, t + 0.002, -legL + c.stripes[i]], [cx + w / 2 + 0.002, t + 0.003, -legL + c.stripes[i] + 0.008])
    for i in std.range(0, std.length(c.stripes) - 1)
  ];
local sockPair(o) =
  local c = { w: 0.09, legL: 0.17, footL: 0.24, t: 0.012, cuff: 0.035, stripes: [], gap: 0.03 } + o;
  sock('l-', -(c.w + c.gap) / 2, -1, c) + sock('r-', (c.w + c.gap) / 2, 1, c);

{
  sbox: sbox,
  flat: flat,
  strip: strip,
  wrapBand: wrapBand,
  onArc: onArc,
  buttons: buttons,
  jacket: jacket,
  quilt: quilt,
  bandX: bandX,
  shortSleeves: shortSleeves,
  roundNeck: roundNeck,
  vNeck: vNeck,
  tee: tee,
  dress: dress,
  apron: apron,
  taper: taper,
  flatTop: flatTop,
  glove: glove,
  glovePair: glovePair,
  onFinger: onFinger,
  hat: hat,
  crown: crown,
  brim: brim,
  visor: visor,
  ring: ring,
  eyewear: eyewear,
  mailCurtain: mailCurtain,
  sockPair: sockPair,
}
