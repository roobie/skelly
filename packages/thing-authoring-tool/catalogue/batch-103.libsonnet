local h = import '../compound.libsonnet';
local box = h.box;
// Footwear stands as a pair, toes to +z, side by side along x. Plan outlines are lists of [z, x] points, the order a
// prism standing on y takes them in.
//
// The plan outline of a foot `l` long and `w` across, heel at -z and toe at +z. `point` narrows the toe.
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
// The shaft's middle along z.
local shaftZ(b) = -b.l / 2 + b.rz + 0.008;
// Where the stepped upper's front edge reaches at share `u` of the way from sole to instep.
local zfront(b, u) = local zs = shaftZ(b) + b.rz * 0.6; zs + (b.l / 2 - zs) * std.sqrt(std.max(0, 1 - u * u));
// One shoe or boot on a foot `b.l` long and `b.w` across, centred at x = cx. Its sole is `b.t` thick, a heel adds
// `b.heel` under the back, the toe climbs in `b.layers` steps to the instep at `b.ankle`, and the shaft, an ellipse
// `b.rx` by `b.rz` at the back of the foot, rises to `b.top` with a collar `b.collar` deep. A shaft of `b.top` 0
// leaves a shell with no shaft, and `b.from` cuts away the foot behind that z. `b.laneSlots` gives the toe steps two
// alternating slots. Slots: sole, upper, shaft, collar, lining, and the toe slot named by `b.toeSlot`.
local boot(p, b, cx) =
  local l = b.l, w = b.w, t = b.t, n = b.layers;
  local whole = foot(l, w, std.get(b, 'point', 0));
  local outline = if std.objectHas(b, 'from') then h.clipX(whole, b.from, true) else whole;
  local layer(i) =
    local u = i / n;
    { y0: t + (b.ankle - t) * u, y1: t + (b.ankle - t) * (i + 1) / n, poly: place(h.clipX(outline, zfront(b, u), false), cx, 0, 1 - 0.12 * u) };
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
         h.prism(p + 'toe-%d' % i, b.toeSlot, 'y', place(h.clipX(h.clipX(outline, zfront(b, i / n), false), l * 0.2, true), cx, 0.003, 1.05 * (1 - 0.12 * i / n)), s.y0, s.y1 + 0.001)
         for i in std.range(0, std.max(0, std.floor(n * 0.6) - 1))
       ] else []) + (if b.top > 0 then [
         h.prism(p + 'shaft', 'shaft', 'y', place(ellipse(b.rx, b.rz), cx, shaftZ(b)), t, b.top - b.collar),
         h.prism(p + 'collar', 'collar', 'y', place(ellipse(b.rx + std.get(b, 'collarOut', 0.003), b.rz + std.get(b, 'collarOut', 0.003)), cx, shaftZ(b)), b.top - b.collar, b.top),
         h.prism(p + 'opening', 'lining', 'y', place(ellipse(b.rx * 0.72, b.rz * 0.72), cx, shaftZ(b)), b.top, b.top + 0.002),
       ] else []);
// Laces up a boot shaft's front from y0 to y1: a tongue strip with lace bars every `pitch`. Slots: tongue, lace.
local laces(p, b, cx, y0, y1, pitch=0.016) =
  local zf = shaftZ(b) + b.rz;
  [box(p + 'tongue', 'tongue', [cx - 0.016, y0, zf - 0.01], [cx + 0.016, y1, zf + 0.002])] + [
    box(p + 'lace-%d' % i, 'lace', [cx - 0.02, y0 + 0.006 + i * pitch, zf], [cx + 0.02, y0 + 0.009 + i * pitch, zf + 0.004])
    for i in std.range(0, std.floor((y1 - y0 - 0.01) / pitch))
  ];
// Laces down a low shoe's instep: `count` bars sitting on the stepped upper, from the shaft front toward the toe, and
// a tongue standing up out of the opening. Slots: tongue, lace.
local instepLaces(p, b, cx, count, span=0.3) =
  local n = b.layers;
  [
    box(p + 'tongue', 'tongue', [cx - 0.018, b.ankle - 0.01, shaftZ(b) + b.rz - 0.012], [cx + 0.018, b.top + 0.012, shaftZ(b) + b.rz + 0.004]),
  ] + [
    local u = 0.94 - span * i / std.max(1, count - 1);
    local z = zfront(b, u) - 0.006;
    local y = b.t + (b.ankle - b.t) * std.ceil(u * n) / n + 0.001;
    box(p + 'lace-%d' % i, 'lace', [cx - b.w * 0.24, y, z - 0.005], [cx + b.w * 0.24, y + 0.004, z])
    for i in std.range(0, count - 1)
  ];
// A band round the shaft from y0 to y1, standing `out` proud: straps, rims and trim.
local band(p, slot, b, cx, y0, y1, out=0.003) = h.prism(p, slot, 'y', place(ellipse(b.rx + out, b.rz + out), cx, shaftZ(b)), y0, y1);
// Two shoes `gap` apart, each with `extra(prefix, cx)` added.
local pair(b, gap, extra=function(p, cx) []) = std.flattenArrays([
  local cx = s * (b.w / 2 + gap / 2) * 1.06;
  local p = if s < 0 then 'l-' else 'r-';
  boot(p, b, cx) + extra(p, cx)
  for s in [-1, 1]
]);
// Pieces moved up by `dy`, for a boot carried on wheels.
local lift(pieces, dy) = [
  if pc.kind == 'box' then pc { min: [pc.min[0], pc.min[1] + dy, pc.min[2]], max: [pc.max[0], pc.max[1] + dy, pc.max[2]] }
  else if pc.kind == 'turned' then pc { origin: local o = std.get(pc, 'origin', [0, 0, 0]); [o[0], o[1] + dy, o[2]] }
  else if pc.axis == 'y' then pc { start: pc.start + dy, end: pc.end + dy }
  else if pc.axis == 'x' then pc { profile: [[q[0] + dy, q[1]] for q in pc.profile] }
  else pc { profile: [[q[0], q[1] + dy] for q in pc.profile] }
  for pc in pieces
];
// A wheel of radius `r` and width `wd` turning on an axle along x, centred at (x, z) and resting on y = y0, with a hub.
// Slots: wheel, hub.
local wheel(p, x, z, r, wd, y0=0) = [
  h.turned(p, 'wheel', 'x', [[0, 0], [0, r], [wd, r], [wd, 0]], [x - wd / 2, y0 + r, z]),
  h.turned(p + '-hub', 'hub', 'x', [[0, 0], [0, r * 0.45], [wd + 0.004, r * 0.45], [wd + 0.004, 0]], [x - wd / 2 - 0.002, y0 + r, z]),
];
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
// One sock laid flat on its side, the leg up the -z side and the foot running out along +x, its corner at (x, z) and
// its underside at y. Slots: sock, cuff, heel.
local sock(p, x, z, y, t=0.005) =
  local o(pts) = [[q[0] + z, q[1] + x] for q in pts];
  [
    h.prism(p + 'leg', 'sock', 'y', o([[-0.2, 0], [-0.2, 0.09], [0.001, 0.09], [0.001, 0]]), y, y + t),
    h.prism(p + 'foot', 'sock', 'y', o([[0, 0], [0, 0.2], [0.012, 0.228], [0.04, 0.24], [0.068, 0.228], [0.082, 0.2], [0.082, 0.03], [0.068, 0.002], [0.04, -0.008], [0.012, -0.006]]), y, y + t),
    h.prism(p + 'cuff', 'cuff', 'y', o([[-0.2, 0], [-0.2, 0.09], [-0.165, 0.09], [-0.165, 0]]), y + t, y + t + 0.002),
    h.prism(p + 'heel', 'heel', 'y', o([[0.035, 0.002], [0.035, 0.035], [0.08, 0.035], [0.08, 0.03], [0.068, 0.004], [0.045, -0.004]]), y + t, y + t + 0.002),
    h.prism(p + 'toe', 'heel', 'y', o([[0.002, 0.195], [0.082, 0.195], [0.082, 0.2], [0.068, 0.226], [0.04, 0.238], [0.012, 0.226]]), y + t, y + t + 0.002),
  ];
// A pair of socks, one lying across the other.
local sockPair = sock('a-', -0.12, -0.02, 0) + sock('b-', -0.09, 0.02, 0.006);

local motorcycle = { l: 0.3, w: 0.108, t: 0.02, heel: 0.01, layers: 6, ankle: 0.09, top: 0.33, rx: 0.05, rz: 0.062, collar: 0.02, collarOut: 0.004, toeSlot: 'toe' };
local sabaton(l) = { l: l, w: 0.112, t: 0.004, layers: 7, ankle: 0.1, top: 0, rx: 0.05, rz: 0.06, collar: 0, from: -l * 0.08, laneSlots: ['plate', 'edge'] };
local sheet = { l: 0.3, w: 0.116, t: 0.004, layers: 3, ankle: 0.095, top: 0, rx: 0.05, rz: 0.06, collar: 0, from: -0.02, laneSlots: ['plate', 'edge'] };
local skate = { l: 0.28, w: 0.105, t: 0.014, layers: 5, ankle: 0.095, top: 0.24, rx: 0.05, rz: 0.062, collar: 0.04, collarOut: 0.006, toeSlot: 'shell' };
local quad = { l: 0.27, w: 0.1, t: 0.014, heel: 0.012, layers: 5, ankle: 0.085, top: 0.19, rx: 0.046, rz: 0.058, collar: 0.016, collarOut: 0.004 };
local sneaker = { l: 0.28, w: 0.1, t: 0.026, layers: 5, ankle: 0.072, top: 0.09, rx: 0.042, rz: 0.052, collar: 0.016, collarOut: 0.005 };
local lowShoe = { l: 0.28, w: 0.098, t: 0.014, heel: 0.008, layers: 5, ankle: 0.07, top: 0.08, rx: 0.042, rz: 0.052, collar: 0.008, collarOut: 0.002 };
local bark = { l: 0.27, w: 0.104, t: 0.01, layers: 6, ankle: 0.07, top: 0.075, rx: 0.044, rz: 0.054, collar: 0.012, collarOut: 0.004, laneSlots: ['upper', 'weave'] };
local slipper = { l: 0.27, w: 0.104, t: 0.012, layers: 4, ankle: 0.06, top: 0.065, rx: 0.044, rz: 0.054, collar: 0.016, collarOut: 0.006 };
[
  // A pair of black motorcycle boots, 300 mm long and 330 mm tall: armoured cloth uppers on a lugged sole, a hard shin
  // plate down each front, three buckled straps up the outer side, and a steel slider on the toe.
  h.compound('motorcycle_boots', 2.7, pair(motorcycle, 0.03, function(p, cx)
    local zf = shaftZ(motorcycle) + motorcycle.rz, s = if cx < 0 then -1 else 1;
    [
      box(p + 'shin', 'plate', [cx - 0.034, 0.1, zf - 0.012], [cx + 0.034, 0.3, zf + 0.008]),
      box(p + 'shin-rib', 'plate', [cx - 0.008, 0.11, zf + 0.008], [cx + 0.008, 0.29, zf + 0.012]),
      box(p + 'heel-cup', 'plate', [cx - 0.052, 0.03, -0.155], [cx + 0.052, 0.09, -0.135]),
      box(p + 'slider', 'slider', [cx + s * 0.05 - 0.006, 0.026, 0.06], [cx + s * 0.05 + 0.006, 0.05, 0.12]),
    ] + std.flattenArrays([
      [
        band(p + 'strap-%d' % i, 'strap', motorcycle, cx, y, y + 0.016, 0.004),
        box(p + 'buckle-%d' % i, 'buckle', [cx + s * (motorcycle.rx + 0.002) - 0.006, y - 0.003, shaftZ(motorcycle) - 0.014], [cx + s * (motorcycle.rx + 0.002) + 0.008, y + 0.019, shaftZ(motorcycle) + 0.014]),
      ]
      for i in std.range(0, 2)
      for y in [0.12 + i * 0.07]
    ])
  ), { sole: 'rubber-black', upper: 'cloth-black', shaft: 'cloth-black', toe: 'leather-black', collar: 'leather-black', lining: 'paint-charcoal', plate: 'plastic-charcoal', slider: 'steel-grey', strap: 'webbing-black', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of flame-resistant socks laid flat, one across the other, each 290 mm from cuff to heel and 240 mm from
  // heel to toe, in navy knit with a grey ribbed cuff, heel and toe.
  h.compound('fire_resistant_socks', 0.08, sockPair, { sock: 'cloth-navy', cuff: 'felt-grey', heel: 'felt-grey' })
  + { voxelGrain: 0.004 },

  // A pair of tempered steel mail chausses laid flat, 300 mm from the tie at the top of the leg to the heel, each foot
  // turning out 200 mm to the side, the rows of rings showing as ridges.
  h.compound('tempered_mail_chausses', 3.1, std.flattenArrays([
    chausse(if s < 0 then 'l-' else 'r-', s, s * 0.075, 0.2, 0.12, 0.2, 0.1, 0.01, 0.005)
    for s in [-1, 1]
  ]), { mail: 'steel-mail', ring: 'steel-heat-tint', tie: 'leather-black' })
  + { voxelGrain: 0.004 },

  // A single tempered steel sabaton, 280 mm long and 100 mm tall: seven overlapping lames stepping down from the ankle
  // over the instep to a rounded toe cap, open behind, held on by a strap under the arch and a buckled heel strap.
  h.compound('tempered_sabaton', 1.4, boot('', sabaton(0.28), 0) + sabatonStraps('', sabaton(0.28), 0),
    { sole: 'leather-black', plate: 'steel-heat-tint', edge: 'steel', strap: 'leather-black', buckle: 'steel-grey', lining: 'paint-charcoal' })
  + { voxelGrain: 0.004 },

  // A pair of inline skates, 290 mm long and 340 mm tall: a hard plastic shell boot with a padded liner showing at
  // the cuff and two buckles, on a metal frame carrying four 76 mm wheels in a line.
  h.compound('inline_skates', 2.9, std.flattenArrays([
    local cx = s * 0.07, p = if s < 0 then 'l-' else 'r-';
    lift(boot(p, skate, cx) + [
      box(p + 'buckle-cuff', 'buckle', [cx - 0.02, 0.2, shaftZ(skate) + skate.rz + 0.004], [cx + 0.02, 0.215, shaftZ(skate) + skate.rz + 0.01]),
      box(p + 'strap-instep', 'strap', [cx - skate.w * 0.47, 0.06, 0.0], [cx + skate.w * 0.47, 0.105, 0.022]),
      box(p + 'buckle-instep', 'buckle', [cx - 0.015, 0.1, 0.004], [cx + 0.015, 0.108, 0.02]),
    ], 0.1) + [
      box(p + 'rail-l', 'frame', [cx - 0.017, 0.045, -0.15], [cx - 0.011, 0.1, 0.15]),
      box(p + 'rail-r', 'frame', [cx + 0.011, 0.045, -0.15], [cx + 0.017, 0.1, 0.15]),
      box(p + 'mount-heel', 'frame', [cx - 0.017, 0.09, -0.13], [cx + 0.017, 0.1, -0.08]),
      box(p + 'mount-toe', 'frame', [cx - 0.017, 0.09, 0.07], [cx + 0.017, 0.1, 0.12]),
    ] + std.flattenArrays([
      wheel('%swheel-%d' % [p, i], cx, -0.117 + i * 0.078, 0.038, 0.022)
      for i in std.range(0, 3)
    ])
    for s in [-1, 1]
  ]), { sole: 'plastic-charcoal', upper: 'plastic-charcoal', shell: 'plastic-black', shaft: 'cloth-black', collar: 'plastic-black', lining: 'paint-charcoal', strap: 'plastic-black', buckle: 'alu-bare', frame: 'alu-bare', wheel: 'plastic-clear-blue', hub: 'plastic-white' })
  + { voxelGrain: 0.004 },

  // A pair of sneakers with a wheel tucked into each heel, 280 mm long and 90 mm tall: black uppers with white laces
  // on a thick white sole, the wheel's grey cap showing flush in the back of the heel.
  h.compound('heel_wheel_sneakers', 1.3, pair(sneaker, 0.03, function(p, cx)
    instepLaces(p, sneaker, cx, 4) + [
      h.turned(p + 'wheel-cap', 'hub', 'z', [[0, 0], [0, 0.015], [0.004, 0.015], [0.004, 0]], [cx, 0.016, -0.149]),
      box(p + 'stripe', 'stripe', [cx - sneaker.w * 0.5, 0.034, -0.08], [cx + sneaker.w * 0.5, 0.044, 0.06]),
    ]
  ), { sole: 'plastic-white', upper: 'cloth-black', shaft: 'cloth-black', collar: 'cloth-black', lining: 'paint-charcoal', tongue: 'cloth-black', lace: 'cloth-white', hub: 'plastic-grey', stripe: 'cloth-red' })
  + { voxelGrain: 0.004 },

  // The same sneakers with the heel wheels pushed out, each a 40 mm wheel standing below the sole so the toes lift.
  h.compound('heel_wheel_sneakers_out', 1.5, std.flattenArrays([
    local cx = s * (sneaker.w / 2 + 0.015) * 1.06, p = if s < 0 then 'l-' else 'r-';
    lift(boot(p, sneaker, cx) + instepLaces(p, sneaker, cx, 4) + [
      box(p + 'stripe', 'stripe', [cx - sneaker.w * 0.5, 0.034, -0.08], [cx + sneaker.w * 0.5, 0.044, 0.06]),
    ], 0.012) + wheel(p + 'wheel', cx, -0.1, 0.02, 0.022)
    for s in [-1, 1]
  ]), { sole: 'plastic-white', upper: 'cloth-black', shaft: 'cloth-black', collar: 'cloth-black', lining: 'paint-charcoal', tongue: 'cloth-black', lace: 'cloth-white', wheel: 'plastic-grey', hub: 'steel', stripe: 'cloth-red' })
  + { voxelGrain: 0.004 },

  // A pair of old-fashioned roller skates, 270 mm long and 260 mm tall: laced brown leather boots bolted to steel
  // plates, each on two axles with a pair of 56 mm steel wheels and a rubber toe stop.
  h.compound('roller_skates', 3, std.flattenArrays([
    local cx = s * 0.075, p = if s < 0 then 'l-' else 'r-';
    lift(boot(p, quad, cx) + laces(p, quad, cx, 0.07, 0.18), 0.068) + [
      box(p + 'plate', 'frame', [cx - 0.03, 0.058, -0.12], [cx + 0.03, 0.068, 0.12]),
      box(p + 'truck-back', 'frame', [cx - 0.02, 0.04, -0.1], [cx + 0.02, 0.058, -0.07]),
      box(p + 'truck-front', 'frame', [cx - 0.02, 0.04, 0.07], [cx + 0.02, 0.058, 0.1]),
      h.turned(p + 'toe-stop', 'stop', 'y', [[0, 0], [0, 0.017], [0.04, 0.02], [0.04, 0]], [cx, 0.03, 0.135]),
    ] + std.flattenArrays([
      wheel('%swheel-%d-%d' % [p, i, k], cx + [-1, 1][k] * 0.036, [-0.085, 0.085][i], 0.028, 0.026)
      for i in [0, 1]
      for k in [0, 1]
    ])
    for s in [-1, 1]
  ]), { sole: 'leather-brown', upper: 'leather-brown', shaft: 'leather-brown', collar: 'leather-black', lining: 'paint-charcoal', tongue: 'leather-brown', lace: 'paint-cream', frame: 'steel', wheel: 'steel-grey', hub: 'steel', stop: 'rubber-black' })
  + { voxelGrain: 0.004 },

  // A pair of sheet metal sabatons, 300 mm long and 95 mm tall: three bent plates riveted over the front of each foot,
  // open behind, strapped on under the arch and round the heel.
  h.compound('sheet_metal_sabatons', 1.4, pair(sheet, 0.03, function(p, cx)
    sabatonStraps(p, sheet, cx) + [
      h.turned(p + 'rivet-%d' % i, 'rivet', 'x', [[0, 0], [0, 0.005], [0.004, 0.003], [0.004, 0]], [cx + s * (sheet.w * 0.53) - (if s < 0 then 0.004 else 0), 0.016 + (i % 2) * 0.03, 0.04 - (i % 2) * 0.03])
      for i in [0, 1, 2, 3]
      for s in [if i < 2 then -1 else 1]
    ]
  ), { sole: 'leather-brown', plate: 'steel', edge: 'steel-grey', strap: 'leather-brown', buckle: 'steel', rivet: 'steel-galvanised', lining: 'paint-charcoal' })
  + { voxelGrain: 0.004 },

  // A pair of low shoes plaited from strips of birch bark, 270 mm long and 75 mm tall, the strips crossing over the
  // instep, with the dark inner bark showing at the opening.
  h.compound('birch_bark_shoes', 0.4, pair(bark, 0.03, function(p, cx)
    [
      box('%sstrip-%d' % [p, i], 'strip', [cx - bark.w * 0.4 + i * bark.w * 0.2, 0.01, -0.02], [cx - bark.w * 0.4 + i * bark.w * 0.2 + 0.014, 0.072, 0.1])
      for i in std.range(0, 4)
    ]
  ), { sole: 'bark', upper: 'bark-birch', weave: 'paperboard-tan', strip: 'bark-birch', shaft: 'bark-birch', collar: 'paperboard-tan', lining: 'bark' })
  + { voxelGrain: 0.004 },

  // A pair of bowling shoes, 280 mm long and 80 mm tall: cream leather with a red toe and heel, white laces and a thin
  // smooth leather sole.
  h.compound('bowling_shoes', 0.99, pair(lowShoe + { toeSlot: 'toe' }, 0.03, function(p, cx)
    instepLaces(p, lowShoe, cx, 4)
  ), { sole: 'leather-brown', upper: 'paint-cream', toe: 'paint-oxblood', shaft: 'paint-oxblood', collar: 'paint-oxblood', lining: 'paint-charcoal', tongue: 'paint-cream', lace: 'cloth-white' })
  + { voxelGrain: 0.004 },

  // A pair of denim sneakers, 280 mm long and 90 mm tall: denim uppers and tongue, a white rubber sole wrapping the
  // toe, and white laces.
  h.compound('denim_sneakers', 0.8, pair(sneaker + { toeSlot: 'toe' }, 0.03, function(p, cx)
    instepLaces(p, sneaker, cx, 4)
  ), { sole: 'plastic-white', upper: 'cloth-denim', toe: 'plastic-white', shaft: 'cloth-denim', collar: 'cloth-denim', lining: 'paint-charcoal', tongue: 'cloth-denim', lace: 'cloth-white' })
  + { voxelGrain: 0.004 },

  // A pair of soft slippers, 270 mm long and 65 mm tall: navy cotton uppers on a thin grey felt sole, with a plush
  // grey trim round the opening.
  h.compound('slippers', 0.35, pair(slipper, 0.03), { sole: 'felt-grey', upper: 'cloth-navy', shaft: 'cloth-navy', collar: 'felt-grey', lining: 'wool-grey' })
  + { voxelGrain: 0.004 },

  // A pair of steel-toed sneakers, 254 mm long and 90 mm tall: black leather uppers with a swollen charcoal cap over
  // the toe, a grey sole, and black laces.
  h.compound('steel_toe_sneakers', 1.4, pair(sneaker + { l: 0.254, toeSlot: 'toe' }, 0.03, function(p, cx)
    instepLaces(p, sneaker + { l: 0.254 }, cx, 4)
  ), { sole: 'plastic-grey', upper: 'leather-black', toe: 'plastic-charcoal', shaft: 'leather-black', collar: 'plastic-charcoal', lining: 'paint-charcoal', tongue: 'leather-black', lace: 'webbing-black' })
  + { voxelGrain: 0.004 },

  // A pair of plain white cotton socks laid flat, one across the other, each 290 mm from cuff to heel and 240 mm from
  // heel to toe, with a grey heel and toe.
  h.compound('socks', 0.07, sockPair, { sock: 'cloth-white', cuff: 'cloth-white', heel: 'felt-grey' })
  + { voxelGrain: 0.004 },
]
