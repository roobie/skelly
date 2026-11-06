local h = import '../compound.libsonnet';
local box = h.box;
// Footwear stands as a pair, toes to +z, side by side along x. Plan outlines are lists of [z, x] points, the order a
// prism standing on y takes them in.
//
// The plan outline of a foot `l` long and `w` across, heel at -z and toe at +z. `point` narrows the toe for a
// pointed boot.
local foot(l, w, point=0) = [
  [-l / 2, -w * 0.28], [-l / 2, w * 0.28],
  [-l * 0.42, w * 0.44], [-l * 0.2, w * 0.48], [l * 0.12, w / 2], [l * 0.3, w * 0.46],
  [l * 0.42, w * (0.34 - point * 0.12)], [l / 2, w * (0.14 - point * 0.1)],
  [l / 2, -w * (0.14 - point * 0.1)], [l * 0.42, -w * (0.34 - point * 0.12)],
  [l * 0.3, -w * 0.46], [l * 0.12, -w / 2], [-l * 0.2, -w * 0.48], [-l * 0.42, -w * 0.44],
];
// An outline scaled across x by `sx` and along z by `sz` about its middle, then moved to (cx, cz).
local place(poly, cx, cz, sx=1, sz=1) = [[p[0] * sz + cz, p[1] * sx + cx] for p in poly];
// An ellipse `rx` across x and `rz` along z, in 14 points.
local ellipse(rx, rz) = [[rz * std.cos(2 * std.pi * i / 14), rx * std.sin(2 * std.pi * i / 14)] for i in std.range(0, 13)];
// One boot on a foot `b.l` long and `b.w` across, centred at x = cx. Its sole is `b.t` thick, a heel adds `b.heel`
// under the back, the toe climbs in `b.layers` steps to the instep at `b.ankle`, and the shaft, an ellipse `b.rx` by
// `b.rz` at the back of the foot, rises to `b.top` with a collar `b.collar` deep. A shaft of `b.top` 0 leaves a low
// shell with no shaft, and `b.from` cuts away the foot behind that z, for a shell over the front of the foot.
// `b.laneSlots` gives the toe steps two alternating slots, for lames. Slots: sole, upper, shaft, collar, lining, and
// the toe slot named by `b.toeSlot`.
local boot(p, b, cx) =
  local l = b.l, w = b.w, t = b.t, n = b.layers;
  local sc = -l / 2 + b.rz + 0.008;
  local zs = sc + b.rz * 0.6;
  local whole = foot(l, w, std.get(b, 'point', 0));
  local outline = if std.objectHas(b, 'from') then h.clipX(whole, b.from, true) else whole;
  local zfront(u) = zs + (l / 2 - zs) * std.sqrt(std.max(0, 1 - u * u));
  local layer(i) =
    local u = i / n;
    local y0 = t + (b.ankle - t) * u;
    local y1 = t + (b.ankle - t) * (i + 1) / n;
    local shrink = 1 - 0.12 * u;
    local clipped = h.clipX(outline, zfront(u), false);
    { y0: y0, y1: y1, poly: place(clipped, cx, 0, shrink) };
  local heel = std.get(b, 'heel', 0);
  [
    h.prism(p + 'sole', 'sole', 'y', place(outline, cx, 0, 1.06, 1.03), 0, t),
  ] + (if heel > 0 then [
         h.prism(p + 'heel', 'sole', 'y', place(h.clipX(outline, -l * 0.24, false), cx, -0.004, 0.86, 1), t, t + heel),
       ] else []) + [
    local s = layer(i);
    h.prism(p + 'vamp-%d' % i, if std.objectHas(b, 'laneSlots') then b.laneSlots[i % 2] else 'upper', 'y', s.poly, s.y0, s.y1 + 0.001)
    for i in std.range(0, n - 1)
  ] + (if std.objectHas(b, 'toeSlot') then [
         local s = layer(i);
         h.prism(p + 'toe-%d' % i, b.toeSlot, 'y', place(h.clipX(h.clipX(outline, zfront(i / n), false), l * 0.2, true), cx, 0.003, 1.05 * (1 - 0.12 * i / n)), s.y0, s.y1 + 0.001)
         for i in std.range(0, std.max(0, std.floor(n * 0.6) - 1))
       ] else []) + (if b.top > 0 then [
         h.prism(p + 'shaft', 'shaft', 'y', place(ellipse(b.rx, b.rz), cx, sc), t, b.top - b.collar),
         h.prism(p + 'collar', 'collar', 'y', place(ellipse(b.rx + std.get(b, 'collarOut', 0.003), b.rz + std.get(b, 'collarOut', 0.003)), cx, sc), b.top - b.collar, b.top),
         h.prism(p + 'opening', 'lining', 'y', place(ellipse(b.rx * 0.72, b.rz * 0.72), cx, sc), b.top, b.top + 0.002),
       ] else []);
// The shaft's middle along z and its front face, for laces, straps and trim.
local shaftZ(b) = -b.l / 2 + b.rz + 0.008;
// Laces up the shaft's front from y0 to y1: a tongue strip with crossed lace bars every `pitch`. Slots: tongue, lace.
local laces(p, b, cx, y0, y1, pitch=0.016) =
  local zf = shaftZ(b) + b.rz;
  [box(p + 'tongue', 'tongue', [cx - 0.016, y0, zf - 0.01], [cx + 0.016, y1, zf + 0.002])] + [
    box(p + 'lace-%d' % i, 'lace', [cx - 0.02, y0 + 0.006 + i * pitch, zf], [cx + 0.02, y0 + 0.009 + i * pitch, zf + 0.004])
    for i in std.range(0, std.floor((y1 - y0 - 0.01) / pitch))
  ];
// A band round the shaft from y0 to y1, standing `out` proud: straps, rims and trim. Slot as given.
local band(p, slot, b, cx, y0, y1, out=0.003) = h.prism(p, slot, 'y', place(ellipse(b.rx + out, b.rz + out), cx, shaftZ(b)), y0, y1);
// Two boots `gap` apart, each with `extra(prefix, cx)` added.
local pair(b, gap, extra=function(p, cx) []) = std.flattenArrays([
  local cx = s * (b.w / 2 + gap / 2) * 1.06;
  local p = if s < 0 then 'l-' else 'r-';
  boot(p, b, cx) + extra(p, cx)
  for s in [-1, 1]
]);
// A mail chausse laid flat: a leg `legL` long along -z and a foot turning out along x to the side `s`, ridged across
// with rows of rings. Slots: mail, ring, tie.
local chausse(p, s, cx, legL, legW, footL, footW, t, ridge) =
  local footX1 = cx + s * (legW / 2 + footL);
  [
    box(p + 'leg', 'mail', [cx - legW / 2, 0, -legL], [cx + legW / 2, t, footW]),
    h.prism(p + 'foot', 'mail', 'y', [[0, cx], [footW, cx], [footW * 0.85, footX1 - s * 0.03], [footW * 0.5, footX1], [footW * 0.12, footX1 - s * 0.03], [0, footX1 - s * 0.06]], 0, t),
  ] + [
    box(p + 'row-%d' % i, if i % 3 == 0 then 'ring' else 'mail', [cx - legW / 2 + 0.004, t, -legL + 0.01 + i * 0.016], [cx + legW / 2 - 0.004, t + ridge, -legL + 0.016 + i * 0.016])
    for i in std.range(0, std.floor((legL + footW - 0.03) / 0.016))
  ] + [
    box(p + 'toe-row-%d' % i, if i % 3 == 0 then 'ring' else 'mail', [cx + s * (legW / 2 + 0.01 + i * 0.016) - 0.003, t, 0.008], [cx + s * (legW / 2 + 0.01 + i * 0.016) + 0.003, t + ridge, footW - 0.008])
    for i in std.range(0, std.floor((footL - 0.05) / 0.016))
  ] + [
    box(p + 'tie', 'tie', [cx - legW / 2 - 0.02, t, -legL + 0.012], [cx + legW / 2 + 0.02, t + 0.004, -legL + 0.02]),
  ];

local hiking = { l: 0.29, w: 0.105, t: 0.022, layers: 6, ankle: 0.085, top: 0.17, rx: 0.046, rz: 0.058, collar: 0.022, collarOut: 0.006, toeSlot: 'rand' };
local western = { l: 0.3, w: 0.095, t: 0.012, heel: 0.03, point: 1, layers: 6, ankle: 0.08, top: 0.32, rx: 0.044, rz: 0.06, collar: 0.006, collarOut: 0.001 };
local larmor = { l: 0.29, w: 0.108, t: 0.016, heel: 0.01, layers: 6, ankle: 0.09, top: 0.25, rx: 0.05, rz: 0.06, collar: 0.016, toeSlot: 'plate' };
local plated = { l: 0.3, w: 0.112, t: 0.016, heel: 0.012, layers: 7, ankle: 0.1, top: 0.27, rx: 0.052, rz: 0.062, collar: 0.014, collarOut: 0.005, laneSlots: ['plate', 'edge'] };
local scrap = { l: 0.29, w: 0.11, t: 0.014, layers: 5, ankle: 0.085, top: 0.2, rx: 0.05, rz: 0.06, collar: 0.02, collarOut: 0.004, toeSlot: 'scrap' };
local work = { l: 0.29, w: 0.108, t: 0.024, heel: 0.006, layers: 6, ankle: 0.085, top: 0.18, rx: 0.048, rz: 0.058, collar: 0.02, collarOut: 0.005, toeSlot: 'toecap' };
local sabaton(l) = { l: l, w: 0.112, t: 0.004, layers: 7, ankle: 0.1, top: 0, rx: 0.05, rz: 0.06, collar: 0, from: -l * 0.08, laneSlots: ['plate', 'edge'] };
local sheet = { l: 0.3, w: 0.116, t: 0.004, layers: 3, ankle: 0.095, top: 0, rx: 0.05, rz: 0.06, collar: 0, from: -0.02, laneSlots: ['plate', 'edge'] };
// The straps that hold a sabaton over a shoe, one under the arch and one round the back of the heel, and the dark
// hollow showing at its open back. Slots: strap, buckle, lining.
local sabatonStraps(p, b, cx) = [
  box(p + 'hollow', 'lining', [cx - b.w * 0.36, b.t, b.from - 0.002], [cx + b.w * 0.36, b.ankle * 0.75, b.from + 0.004]),
  box(p + 'arch-strap', 'strap', [cx - b.w * 0.56, -0.002, -0.01], [cx + b.w * 0.56, 0.006, 0.012]),
  box(p + 'heel-strap', 'strap', [cx - b.w * 0.5, 0.03, -b.l / 2], [cx + b.w * 0.5, 0.045, -b.l / 2 + 0.006]),
  box(p + 'heel-strap-l', 'strap', [cx - b.w * 0.5, 0.03, -b.l / 2], [cx - b.w * 0.5 + 0.006, 0.045, b.from + 0.01]),
  box(p + 'heel-strap-r', 'strap', [cx + b.w * 0.5 - 0.006, 0.03, -b.l / 2], [cx + b.w * 0.5, 0.045, b.from + 0.01]),
  box(p + 'buckle', 'buckle', [cx + b.w * 0.5, 0.028, b.from - 0.02], [cx + b.w * 0.5 + 0.004, 0.047, b.from - 0.004]),
];
local winter = { l: 0.31, w: 0.118, t: 0.028, layers: 5, ankle: 0.1, top: 0.26, rx: 0.054, rz: 0.066, collar: 0.03, collarOut: 0.008, toeSlot: 'shell' };
[
  // A pair of denim boots, mid-calf, 280 mm long and 230 mm tall, the uppers of stitched denim over a rubber sole with
  // a short heel, a brown leather band round the top and a zip up the inner side.
  h.compound('boots_denim', 1.2, pair(
    { l: 0.28, w: 0.1, t: 0.014, heel: 0.012, layers: 6, ankle: 0.08, top: 0.23, rx: 0.045, rz: 0.056, collar: 0.018 }, 0.03,
    function(p, cx) [
      box(p + 'zip', 'zip', [if cx < 0 then cx + 0.044 else cx - 0.048, 0.03, shaftZ({ l: 0.28, rz: 0.056 }) - 0.006], [if cx < 0 then cx + 0.048 else cx - 0.044, 0.21, shaftZ({ l: 0.28, rz: 0.056 }) + 0.006]),
      band(p + 'seam', 'collar', { rx: 0.045, rz: 0.056, l: 0.28 }, cx, 0.1, 0.106, 0.002),
    ]
  ), { sole: 'rubber-black', upper: 'cloth-denim', shaft: 'cloth-denim', collar: 'leather-brown', lining: 'paint-charcoal', zip: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of faux fur boots, 300 mm long and 280 mm tall: a soft cloth foot on a thick grey sole under a tall shaggy
  // pale shaft, its top turned out in a deep fur cuff, with a cord tie at the ankle.
  h.compound('boots_faux_fur', 1, pair(
    { l: 0.3, w: 0.115, t: 0.022, layers: 5, ankle: 0.09, top: 0.28, rx: 0.056, rz: 0.066, collar: 0.06, collarOut: 0.012 }, 0.03,
    function(p, cx) [
      band(p + 'tie', 'tie', { rx: 0.056, rz: 0.066, l: 0.3 }, cx, 0.1, 0.106, 0.003),
      h.disc(p + 'bobble-a', 'tie', 0.009, 0.112, 0.13, cx - 0.012, shaftZ({ l: 0.3, rz: 0.066 }) + 0.075),
      h.disc(p + 'bobble-b', 'tie', 0.009, 0.104, 0.122, cx + 0.012, shaftZ({ l: 0.3, rz: 0.066 }) + 0.075),
    ]
  ), { sole: 'plastic-grey', upper: 'cloth-khaki', shaft: 'wool-grey', collar: 'cloth-white', lining: 'felt-grey', tie: 'cloth-khaki' })
  + { voxelGrain: 0.004 },

  // A pair of fur-lined leather boots, 300 mm long and 280 mm tall: brown leather uppers on a rubber sole, the fur
  // lining turned down over the top in a thick cuff and showing at the opening, laced through two leather thongs.
  h.compound('boots_fur', 1.3, pair(
    { l: 0.3, w: 0.112, t: 0.018, layers: 6, ankle: 0.09, top: 0.27, rx: 0.052, rz: 0.064, collar: 0.055, collarOut: 0.012 }, 0.03,
    function(p, cx) [
      band(p + 'thong-a', 'thong', { rx: 0.052, rz: 0.064, l: 0.3 }, cx, 0.11, 0.116),
      band(p + 'thong-b', 'thong', { rx: 0.052, rz: 0.064, l: 0.3 }, cx, 0.16, 0.166),
    ]
  ), { sole: 'rubber-black', upper: 'leather-brown', shaft: 'leather-brown', collar: 'fur-brown', lining: 'fur-brown', thong: 'skin-rawhide' })
  + { voxelGrain: 0.004 },

  // A pair of leather hiking boots, 290 mm long and 170 mm tall at the padded ankle collar, laced up the front on a
  // deep lugged sole whose rubber rand wraps the toe.
  h.compound('boots_hiking', 0.81, pair(hiking, 0.03, function(p, cx)
    laces(p, hiking, cx, 0.07, 0.15)
  ), { sole: 'rubber-black', upper: 'leather-brown', shaft: 'leather-brown', collar: 'cloth-khaki', lining: 'paint-charcoal', rand: 'plastic-charcoal', tongue: 'cloth-khaki', lace: 'nylon-red' })
  + { voxelGrain: 0.004 },
  // A pair of leather armour boots, 290 mm long and 250 mm tall: black leather uppers with a moulded brown hardened
  // leather cap over the toe and a plate down the shin, buckled on with three rawhide straps.
  h.compound('leather_armour_boots', 2.2, pair(larmor, 0.03, function(p, cx)
    local zf = shaftZ(larmor) + larmor.rz;
    [
      box(p + 'shin', 'plate', [cx - 0.034, 0.09, zf - 0.012], [cx + 0.034, 0.235, zf + 0.007]),
      box(p + 'shin-ridge', 'plate', [cx - 0.008, 0.095, zf + 0.007], [cx + 0.008, 0.23, zf + 0.011]),
    ] + std.flattenArrays([
      [
        band(p + 'strap-%d' % i, 'strap', larmor, cx, y, y + 0.014, 0.004),
        box(p + 'buckle-%d' % i, 'buckle', [cx + (if cx < 0 then -1 else 1) * larmor.rx - 0.006, y - 0.002, shaftZ(larmor) - 0.01], [cx + (if cx < 0 then -1 else 1) * larmor.rx + 0.01, y + 0.016, shaftZ(larmor) + 0.012]),
      ]
      for i in std.range(0, 2)
      for y in [0.11 + i * 0.045]
    ])
  ), { sole: 'leather-brown', upper: 'leather-black', shaft: 'leather-black', collar: 'leather-brown', lining: 'paint-charcoal', plate: 'leather-brown', strap: 'skin-rawhide', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of armoured boots, 300 mm long and 270 mm tall: a steel greave closed round the shin, overlapping steel
  // lames stepping down over the instep to the toe, a leather strap with a buckle, and a padded rim at the top.
  h.compound('armoured_boots', 5.5, pair(plated, 0.03, function(p, cx)
    local zf = shaftZ(plated) + plated.rz;
    [
      band(p + 'greave-rim', 'edge', plated, cx, 0.1, 0.11, 0.004),
      band(p + 'strap', 'strap', plated, cx, 0.17, 0.186, 0.005),
      box(p + 'buckle', 'buckle', [cx - 0.01, 0.166, zf + 0.004], [cx + 0.01, 0.19, zf + 0.009]),
      box(p + 'ridge', 'edge', [cx - 0.005, 0.11, zf], [cx + 0.005, 0.255, zf + 0.006]),
    ] + [
      h.turned(p + 'rivet-%d' % i, 'buckle', 'x', [[0, 0], [0, 0.005], [0.004, 0.003], [0.004, 0]], [cx + s * (plated.w * 0.47) - (if s < 0 then 0.004 else 0), 0.07 + (i % 2) * 0.025, 0.02])
      for i in [0, 1, 2, 3]
      for s in [if i < 2 then -1 else 1]
    ]
  ), { sole: 'leather-black', upper: 'steel', shaft: 'steel', collar: 'leather-brown', lining: 'paint-charcoal', plate: 'steel', edge: 'steel-grey', strap: 'leather-brown', buckle: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A pair of scrap boots, 290 mm long and 200 mm tall: cloth wrapped round and round a foot and shin and bound with
  // rag strips, with rusty metal scraps lashed over the toe, the shin and the outer ankle.
  h.compound('boots_scrap', 2.1, pair(scrap, 0.03, function(p, cx)
    local zf = shaftZ(scrap) + scrap.rz, s = if cx < 0 then -1 else 1;
    [
      band(p + 'wrap-%d' % i, 'wrap', scrap, cx, 0.03 + i * 0.034, 0.042 + i * 0.034, 0.003)
      for i in std.range(0, 4)
    ] + [
      box(p + 'shin', 'scrap', [cx - 0.032, 0.085, zf - 0.008], [cx + 0.028, 0.185, zf + 0.006]),
      box(p + 'shin-bolt', 'bolt', [cx - 0.004, 0.17, zf + 0.006], [cx + 0.004, 0.178, zf + 0.009]),
      box(p + 'ankle', 'patch', [cx + s * scrap.rx - 0.006, 0.03, shaftZ(scrap) - 0.03], [cx + s * scrap.rx + 0.008, 0.09, shaftZ(scrap) + 0.026]),
      box(p + 'shin-tie', 'wrap', [cx - 0.036, 0.13, zf - 0.008], [cx + 0.032, 0.14, zf + 0.009]),
    ]
  ), { sole: 'rubber-black', upper: 'cloth-rag', shaft: 'cloth-rag', collar: 'cloth-rag-shadow', lining: 'paint-charcoal', wrap: 'cloth-rag-shadow', scrap: 'scrap-rusted', patch: 'steel-grey', bolt: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of steel-toed work boots, 290 mm long and 180 mm tall: tan leather uppers on a thick black sole, a darker
  // leather cap over the swollen steel toe, a padded collar and laces up the front.
  h.compound('steel_toe_boots', 2, pair(work, 0.03, function(p, cx)
    laces(p, work, cx, 0.075, 0.165)
  ), { sole: 'plastic-charcoal', upper: 'polymer-fde', shaft: 'polymer-fde', collar: 'leather-brown', lining: 'paint-charcoal', toecap: 'leather-brown', tongue: 'polymer-fde', lace: 'leather-black' })
  + { voxelGrain: 0.004 },

  // A pair of western boots, 300 mm long and 320 mm tall: a narrow pointed brown toe on a leather sole with a stacked
  // 30 mm heel, a tall black shaft stitched in cream chevrons, and a pull tab either side of the top.
  h.compound('boots_western', 1.3, pair(western, 0.03, function(p, cx)
    local zf = shaftZ(western) + western.rz;
    [
      box(p + 'tab-%d' % i, 'collar', [cx + s * western.rx - 0.003, western.top - 0.02, shaftZ(western) - 0.012], [cx + s * western.rx + 0.004, western.top + 0.022, shaftZ(western) + 0.012])
      for i in [0, 1]
      for s in [[-1, 1][i]]
    ] + [
      h.prism(p + 'stitch-%d-%d' % [k, i], 'stitch', 'z', [[cx + s * 0.003, y], [cx + s * 0.03, y + 0.03], [cx + s * 0.03, y + 0.036], [cx + s * 0.003, y + 0.006]], zf - 0.004, zf + 0.002)
      for k in [0, 1, 2]
      for y in [0.14 + k * 0.05]
      for i in [0, 1]
      for s in [[-1, 1][i]]
    ]
  ), { sole: 'wood-walnut', upper: 'leather-brown', shaft: 'leather-black', collar: 'leather-brown', lining: 'paint-charcoal', stitch: 'paint-cream' })
  + { voxelGrain: 0.004 },

  // A pair of winter boots, 310 mm long and 260 mm tall: a black rubber shell over the foot on a thick cleated sole,
  // a khaki nylon shaft laced up the front, and a deep grey wool lining rolled over the top.
  h.compound('boots_winter', 2.7, pair(winter, 0.03, function(p, cx)
    laces(p, winter, cx, 0.1, 0.22, 0.02) + [band(p + 'shell', 'shell', winter, cx, winter.t, 0.075, 0.004)]
  ), { sole: 'plastic-charcoal', upper: 'rubber-black', shaft: 'cloth-khaki', collar: 'wool-grey', lining: 'wool-grey', shell: 'rubber-black', tongue: 'cloth-khaki', lace: 'leather-black' })
  + { voxelGrain: 0.004 },

  // A pair of hardened steel mail chausses laid flat, 300 mm from the tie at the top of the leg to the heel, each
  // foot turning out 200 mm to the side, the rows of rings showing as ridges.
  h.compound('hardened_mail_chausses', 3.1, std.flattenArrays([
    chausse(if s < 0 then 'l-' else 'r-', s, s * 0.075, 0.2, 0.12, 0.2, 0.1, 0.01, 0.005)
    for s in [-1, 1]
  ]), { mail: 'steel-hardened', ring: 'steel-mail', tie: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A single hardened steel sabaton, 280 mm long and 100 mm tall: seven overlapping lames stepping down from the
  // ankle over the instep to a rounded toe cap, open behind and under the heel, held on by a strap under the arch and
  // a buckled strap round the back of the heel.
  h.compound('hardened_sabaton', 1.4, boot('', sabaton(0.28), 0) + sabatonStraps('', sabaton(0.28), 0),
    { sole: 'leather-brown', plate: 'steel-hardened', edge: 'steel-grey', strap: 'leather-brown', buckle: 'steel', lining: 'paint-charcoal' })
  + { voxelGrain: 0.004 },

  // A pair of hardened sheet metal sabatons, 300 mm long and 95 mm tall: three thick bent steel plates riveted over the
  // front of each foot, open behind, strapped on under the arch and round the heel.
  h.compound('hardened_sheet_sabatons', 1.5, pair(sheet, 0.03, function(p, cx)
    sabatonStraps(p, sheet, cx) + [
      h.turned(p + 'rivet-%d' % i, 'rivet', 'x', [[0, 0], [0, 0.005], [0.004, 0.003], [0.004, 0]], [cx + s * (sheet.w * 0.53) - (if s < 0 then 0.004 else 0), 0.016 + (i % 2) * 0.03, 0.04 - (i % 2) * 0.03])
      for i in [0, 1, 2, 3]
      for s in [if i < 2 then -1 else 1]
    ]
  ), { sole: 'leather-brown', plate: 'steel-hardened', edge: 'steel-parkerized', strap: 'leather-brown', buckle: 'steel', rivet: 'steel', lining: 'paint-charcoal' })
  + { voxelGrain: 0.004 },

  // A pair of rusty mail chausses laid flat, 300 mm from the tie at the top of the leg to the heel, each foot turning
  // out 200 mm to the side, with a leather sole patch stitched under each foot.
  h.compound('rusty_mail_chausses', 3.2, std.flattenArrays([
    chausse(if s < 0 then 'l-' else 'r-', s, s * 0.075, 0.2, 0.12, 0.2, 0.1, 0.01, 0.005) + [
      h.prism((if s < 0 then 'l-' else 'r-') + 'sole', 'tie', 'y', [[0.015, s * 0.075], [0.085, s * 0.075], [0.075, s * 0.28], [0.025, s * 0.28]], 0.015, 0.019),
    ]
    for s in [-1, 1]
  ]), { mail: 'steel-mail', ring: 'scrap-rusted', tie: 'leather-brown' })
  + { voxelGrain: 0.004 },
]
