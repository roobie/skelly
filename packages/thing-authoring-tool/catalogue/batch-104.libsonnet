local h = import '../compound.libsonnet';
local f = import '../footwear.libsonnet';
local box = h.box;
// Socks lie flat as a pair, side by side along x, each an L seen from the side: the leg runs along z from its cuff at
// -z down to the heel, and the foot turns out along x to the side `s`, toes outward. Outlines are listed as [x, z] and
// swapped to the [z, x] a prism standing on y takes.
local zx(poly) = [[p[1], p[0]] for p in poly];
// A sock's foot: the band from z = 0 to z = w, heel at x = cx - s*w/2, toe `footL` out. Its leg is a plain box above.
local footOutline(cx, s, w, footL) =
  local bx = cx - s * w / 2, x(d) = bx + s * d;
  [
    [x(0), 0], [x(footL - 0.03), 0], [x(footL - 0.008), w * 0.22], [x(footL), w * 0.5], [x(footL - 0.01), w * 0.84],
    [x(footL - 0.032), w], [x(0.034), w], [x(0.01), w - 0.01], [x(0), w - 0.036],
  ];
// One flat sock `t` thick: body, a darker heel and toe patch standing just proud, and `stripes` bands across the cuff
// from its top edge. Slots: sock, heel, toe, cuff, stripe.
local sock(p, cx, s, w, legL, footL, t, cuff, stripes=[]) =
  local bx = cx - s * w / 2, x(d) = bx + s * d;
  [
    box(p + 'leg', 'sock', [cx - w / 2, 0, -legL], [cx + w / 2, t, 0.001]),
    h.prism(p + 'foot', 'sock', 'y', zx(footOutline(cx, s, w, footL)), 0, t),
    h.prism(p + 'heel', 'heel', 'y', zx([[x(0), w * 0.2], [x(0.05), w * 0.2], [x(0.05), w], [x(0.034), w], [x(0.01), w - 0.01], [x(0), w - 0.036]]), t, t + 0.001),
    h.prism(p + 'toe', 'toe', 'y', zx([[x(footL - 0.05), 0], [x(footL - 0.03), 0], [x(footL - 0.008), w * 0.22], [x(footL), w * 0.5], [x(footL - 0.01), w * 0.84], [x(footL - 0.032), w], [x(footL - 0.05), w]]), t, t + 0.001),
    box(p + 'cuff', 'cuff', [cx - w / 2 - 0.002, 0, -legL], [cx + w / 2 + 0.002, t + 0.002, -legL + cuff]),
  ] + [
    box(p + 'stripe-%d' % i, 'stripe', [cx - w / 2 - 0.002, t + 0.002, -legL + stripes[i]], [cx + w / 2 + 0.002, t + 0.003, -legL + stripes[i] + 0.008])
    for i in std.range(0, std.length(stripes) - 1)
  ];
// A flat pair, toes outward, the legs `gap` apart.
local sockPair(w, legL, footL, t, cuff, stripes=[], gap=0.03) = std.flattenArrays([
  sock(if s < 0 then 'l-' else 'r-', s * (w + gap) / 2, s, w, legL, footL, t, cuff, stripes)
  for s in [-1, 1]
]);
// A tabi lying sole down, toe to +z, the big toe split from the rest on the inner side and the ankle cuff laid flat
// behind the heel, four brass clasps along its outer edge. `s` is the side the foot lies on. Slots: cloth, cuff, clasp.
local tabi(p, cx, s) =
  local x(d) = cx - s * d;  // d > 0 runs to the inner side, where the big toe is.
  local piece(id, pts) = h.prism(p + id, 'cloth', 'y', zx([[x(q[0]), q[1]] for q in pts]), 0, 0.014);
  [
    piece('foot', [[-0.026, -0.125], [0.026, -0.125], [0.038, -0.1], [0.044, -0.03], [0.046, 0.06], [0.042, 0.09],
                   [-0.042, 0.09], [-0.046, 0.07], [-0.048, 0], [-0.042, -0.07], [-0.034, -0.11]]),
    piece('big-toe', [[0.042, 0.089], [0.038, 0.11], [0.026, 0.128], [0.014, 0.12], [0.01, 0.089]]),
    piece('toes', [[-0.002, 0.089], [-0.004, 0.112], [-0.018, 0.117], [-0.034, 0.105], [-0.042, 0.089]]),
    h.prism(p + 'cuff', 'cuff', 'y', zx([[x(-0.04), -0.23], [x(0.04), -0.23], [x(0.036), -0.11], [x(-0.036), -0.11]]), 0, 0.008),
  ] + [
    local ox = x(-0.04);
    box(p + 'clasp-%d' % i, 'clasp', [std.min(ox, ox - s * 0.006), 0.004, -0.218 + i * 0.026], [std.max(ox, ox - s * 0.006), 0.01, -0.206 + i * 0.026])
    for i in std.range(0, 3)
  ];
// A straw sandal lying sole down, toe to +z: a woven oval sole ridged across, a rope thong rising from the toe, two
// side loops each side and one at the heel, and the long ties laid back along both sides. Slots: sole, weave, rope.
local sandal(p, cx) =
  local l = 0.24, w = 0.085, t = 0.012;
  [
    h.prism(p + 'sole', 'sole', 'y', f.place(f.foot(l, w), cx, 0, 0.92, 1), 0, t),
  ] + [
    box(p + 'weave-%d' % i, 'weave', [cx - w * 0.4, t, -l / 2 + 0.018 + i * 0.016], [cx + w * 0.4, t + 0.003, -l / 2 + 0.024 + i * 0.016])
    for i in std.range(0, 12)
  ] + [
    box(p + 'thong', 'rope', [cx - 0.004, t, l / 2 - 0.05], [cx + 0.004, t + 0.022, l / 2 - 0.04]),
    box(p + 'thong-top', 'rope', [cx - 0.004, t + 0.018, l / 2 - 0.05], [cx + 0.004, t + 0.024, l / 2 - 0.004]),
    box(p + 'heel-loop', 'rope', [cx - 0.022, t, -l / 2 + 0.002], [cx + 0.022, t + 0.02, -l / 2 + 0.01]),
  ] + std.flattenArrays([
    [
      box(p + 'loop-%d-%d' % [i, k], 'rope', [cx + s * w * 0.44 - 0.004, t, z - 0.012], [cx + s * w * 0.44 + 0.004, t + 0.018, z + 0.012]),
    ]
    for k in [0, 1]
    for s in [[-1, 1][k]]
    for i in [0, 1]
    for z in [[-0.02, 0.04][i]]
  ]) + [
    box(p + 'tie-%d' % k, 'rope', [cx + s * w * 0.62 - 0.003, 0, -l / 2 - 0.06], [cx + s * w * 0.62 + 0.003, 0.006, l / 2 - 0.03])
    for k in [0, 1]
    for s in [[-1, 1][k]]
  ];
// A tube laid flat along z from its cuff at z0, `w` wide narrowing to a round tip `w * 0.55` wide at z0 + len, ringed
// with stripes. Slots: sock, cuff, stripe.
local tentacleTube(p, cx, z0, len, w, t) =
  local tip = w * 0.55 / 2;
  [
    h.prism(p + 'tube', 'sock', 'y', zx([
      [cx - w / 2, z0], [cx + w / 2, z0], [cx + tip, z0 + len - tip], [cx + tip * 0.7, z0 + len - tip * 0.3],
      [cx, z0 + len], [cx - tip * 0.7, z0 + len - tip * 0.3], [cx - tip, z0 + len - tip],
    ]), 0, t),
    box(p + 'cuff', 'cuff', [cx - w / 2 - 0.002, 0, z0], [cx + w / 2 + 0.002, t + 0.002, z0 + 0.04]),
  ] + [
    local zz = z0 + 0.1 + i * 0.12, half = w / 2 - (w / 2 - tip) * (zz - z0) / (len - tip);
    box(p + 'stripe-%d' % i, 'stripe', [cx - half, t, zz], [cx + half, t + 0.001, zz + 0.03])
    for i in std.range(0, 4)
  ];
// A plastic shopping bag flattened round a foot and knotted at the ankle: the bag laid flat with its gathered
// handles knotted at -z. Slots: bag, knot, print.
local bagSock(p, cx) = [
  h.prism(p + 'bag', 'bag', 'y', zx([[cx - 0.07, -0.08], [cx + 0.07, -0.08], [cx + 0.1, 0.0], [cx + 0.11, 0.2], [cx + 0.09, 0.24], [cx - 0.09, 0.24], [cx - 0.11, 0.2], [cx - 0.1, 0.0]]), 0, 0.006),
  h.prism(p + 'neck', 'bag', 'y', zx([[cx - 0.025, -0.13], [cx + 0.025, -0.13], [cx + 0.07, -0.08], [cx - 0.07, -0.08]]), 0, 0.005),
  h.disc(p + 'knot', 'knot', 0.018, 0, 0.016, cx, -0.13),
  box(p + 'ear-a', 'knot', [cx - 0.045, 0, -0.17], [cx - 0.012, 0.006, -0.135]),
  box(p + 'ear-b', 'knot', [cx + 0.012, 0, -0.165], [cx + 0.05, 0.006, -0.14]),
  box(p + 'print', 'print', [cx - 0.05, 0.006, 0.06], [cx + 0.05, 0.007, 0.14]),
  box(p + 'fold-a', 'knot', [cx - 0.1, 0.006, 0.02], [cx + 0.1, 0.008, 0.026]),
];
local thighHigh = { l: 0.28, w: 0.096, t: 0.012, heel: 0.05, layers: 6, ankle: 0.08, top: 0.66, rx: 0.048, rz: 0.06, collar: 0.03, collarOut: 0.004 };
local toecap = { l: 0.29, w: 0.11, t: 0.012, layers: 5, ankle: 0.07, top: 0, rx: 0.05, rz: 0.06, collar: 0, from: 0.02, toeSlot: 'steel' };
[
  // A pair of white cotton ankle socks laid flat, 230 mm from heel to toe with a 50 mm cuff above the heel, a grey
  // heel and toe and a ribbed band at the top.
  h.compound('socks_ankle', 0.045, sockPair(0.08, 0.05, 0.23, 0.005, 0.02),
    { sock: 'cloth-white', heel: 'felt-grey', toe: 'felt-grey', cuff: 'cloth-cotton', stripe: 'felt-grey' })
  + { voxelGrain: 0.004 },

  // A pair of plastic shopping bags flattened out, each 200 mm across and 400 mm long with its handles knotted where
  // it closed round the ankle.
  h.compound('socks_bag', 0.012, bagSock('l-', -0.12) + bagSock('r-', 0.12),
    { bag: 'plastic-white', knot: 'plastic-frosted', print: 'plastic-blue' })
  + { voxelGrain: 0.004 },

  // A pair of thin white crew socks laid flat, 230 mm heel to toe with a 150 mm leg, two red stripes round the cuff.
  h.compound('socks_bowling', 0.039, sockPair(0.08, 0.15, 0.23, 0.003, 0.03, [0.034, 0.05]),
    { sock: 'cloth-white', heel: 'cloth-white', toe: 'cloth-white', cuff: 'cloth-white', stripe: 'cloth-red' })
  + { voxelGrain: 0.004 },

  // A pair of thick grey wool crew socks laid flat, 240 mm heel to toe with a 170 mm leg, a cream heel and toe and a
  // red stripe below a ribbed cuff.
  h.compound('socks_wool', 0.15, sockPair(0.09, 0.17, 0.24, 0.012, 0.035, [0.045]),
    { sock: 'wool-grey', heel: 'paint-cream', toe: 'paint-cream', cuff: 'wool-grey', stripe: 'cloth-red' })
  + { voxelGrain: 0.004 },

  // A pair of black cotton over-the-knee stockings laid flat, 230 mm heel to toe with a 600 mm leg and a wide grey
  // band at the top.
  h.compound('stockings', 0.14, sockPair(0.085, 0.6, 0.23, 0.005, 0.05, [0.06]),
    { sock: 'cloth-black', heel: 'cloth-black', toe: 'cloth-black', cuff: 'felt-grey', stripe: 'felt-grey' })
  + { voxelGrain: 0.004 },

  // Six long cotton tubes laid flat side by side, each 750 mm long and 110 mm wide at its ribbed cuff, tapering to a
  // round closed tip and ringed with five pale stripes.
  h.compound('tentacle_stockings', 0.45, std.flattenArrays([
    tentacleTube('t%d-' % i, (i - 2.5) * 0.125, -0.375, 0.75, 0.11, 0.008)
    for i in std.range(0, 5)
  ]), { sock: 'cloth-green', cuff: 'cloth-white', stripe: 'cloth-white' })
  + { voxelGrain: 0.004 },

  // A pair of straw rope sandals lying sole down, 240 mm long and 85 mm across, the woven soles ridged across, rope
  // loops along the sides and the long ties laid out beside them.
  h.compound('straw_sandals', 0.12, sandal('l-', -0.07) + sandal('r-', 0.07),
    { sole: 'straw-wicker', weave: 'paperboard-tan', rope: 'paperboard-tan' })
  + { voxelGrain: 0.004 },

  // A pair of black split-toe socks lying sole down, 250 mm long, each ankle cuff laid flat behind the heel and closed
  // by four brass clasps.
  h.compound('tabi', 0.1, tabi('l-', -0.055, -1) + tabi('r-', 0.055, 1),
    { cloth: 'cloth-black', cuff: 'cloth-black', clasp: 'brass-dull' })
  + { voxelGrain: 0.004 },

  // A pair of black leather boots that reach past the knee, 280 mm long and 660 mm tall, on a stacked 50 mm heel,
  // the shaft widening above the knee seam, with a zip up the inner side and a band at the top.
  h.compound('thigh_high_boots', 1.8, f.pair(thighHigh, 0.03, function(p, cx) [
    f.band(p + 'thigh', 'shaft', thighHigh, cx, 0.4, 0.63, 0.006),
    f.band(p + 'knee', 'collar', thighHigh, cx, 0.39, 0.4, 0.008),
    box(p + 'zip', 'zip', [if cx < 0 then cx + thighHigh.rx - 0.002 else cx - thighHigh.rx - 0.003, 0.04, f.shaftZ(thighHigh) - 0.005], [if cx < 0 then cx + thighHigh.rx + 0.003 else cx - thighHigh.rx + 0.002, 0.62, f.shaftZ(thighHigh) + 0.005]),
  ]), { sole: 'rubber-black', upper: 'leather-black', shaft: 'leather-black', collar: 'leather-black', lining: 'paint-charcoal', zip: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of rubber overshoes standing, each a 170 mm shell over the front of a 290 mm foot with a steel cap over
  // the toes, its heel strap lying slack behind.
  h.compound('toecaps', 0.88, f.pair(toecap, 0.03, function(p, cx) [
    box(p + 'hollow', 'lining', [cx - toecap.w * 0.36, toecap.t, toecap.from - 0.002], [cx + toecap.w * 0.36, toecap.ankle * 0.75, toecap.from + 0.004]),
    box(p + 'heel-strap', 'strap', [cx - toecap.w * 0.48, 0, -toecap.l / 2], [cx + toecap.w * 0.48, 0.006, -toecap.l / 2 + 0.006]),
    box(p + 'heel-strap-l', 'strap', [cx - toecap.w * 0.48, 0, -toecap.l / 2], [cx - toecap.w * 0.48 + 0.006, 0.006, toecap.from + 0.01]),
    box(p + 'heel-strap-r', 'strap', [cx + toecap.w * 0.48 - 0.006, 0, -toecap.l / 2], [cx + toecap.w * 0.48, 0.006, toecap.from + 0.01]),
    box(p + 'buckle', 'buckle', [cx + toecap.w * 0.48, 0.026, toecap.from - 0.02], [cx + toecap.w * 0.48 + 0.004, 0.048, toecap.from - 0.004]),
  ]), { sole: 'rubber-black', upper: 'rubber-black', steel: 'steel-grey', lining: 'paint-charcoal', strap: 'rubber-black', buckle: 'steel' })
  + { voxelGrain: 0.004 },
]
