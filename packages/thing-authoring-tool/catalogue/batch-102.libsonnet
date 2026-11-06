local h = import '../compound.libsonnet';
local box = h.box;
// Which way a shoe at `xc` turns toward its partner: +1 for the left shoe, -1 for the right.
local inward(xc) = if xc < 0 then 1 else -1;
// One shoe standing with its toe on +z, centred on x = `xc`, its sole lifted `b.y0` off the floor. `b` holds length
// `l`, width `w`, sole `s`, heel block height `heel` above the sole, toe height `toe`, instep height `instep`, collar
// top `top`, opening length `shaft` along z from the heel and `laces`, the lace rungs up the opening's front (0 for a
// pull-on shoe). `split` parts the big toe from the rest, as tabi have. Slots: upper, toe, sole, collar, lining,
// laces.
local shoe(p, xc, b) =
  local y0 = std.get(b, 'y0', 0), heel = std.get(b, 'heel', 0.01), split = std.get(b, 'split', false);
  local z0 = -b.l / 2, zt = b.l / 2 - b.w / 2, zs = z0 + b.shaft, s = y0 + b.s, top = y0 + b.top;
  local shaftY = s + b.instep - 0.01, rise = top - 0.02 - (s + b.instep), cw = b.w * 0.46;
  local dir = inward(xc), big = [xc + dir * b.w * 0.33, zt + 0.012], rest = [xc - dir * b.w * 0.2, zt];
  // A domed toe cap of radius r at [x, z].
  local dome(id, slot, r, c, ht) = h.turned(id, slot, 'y', [[0, 0], [0, r], [ht * 0.6, r], [ht, r * 0.6], [ht, 0]], [c[0], s, c[1]]);
  [
    box(p + '-sole', 'sole', [xc - b.w / 2 - 0.004, y0, z0 - 0.004], [xc + b.w / 2 + 0.004, s, zt]),
    box(p + '-heel', 'sole', [xc - b.w / 2 - 0.004, y0, z0 - 0.006], [xc + b.w / 2 + 0.004, s + heel, z0 + 0.07]),
    h.prism(p + '-vamp', 'upper', 'x', [[s, z0], [s, zt], [s + b.toe, zt], [s + b.instep, zs], [s + b.instep, z0]], xc - b.w / 2, xc + b.w / 2),
    box(p + '-shaft', 'upper', [xc - cw, shaftY, z0 + 0.004], [xc + cw, top - 0.02, zs]),
    // The opening: a dark lining inside a collar ring.
    box(p + '-lining', 'lining', [xc - cw + 0.008, top - 0.02, z0 + 0.012], [xc + cw - 0.008, top - 0.012, zs - 0.008]),
    box(p + '-collar-back', 'collar', [xc - cw - 0.004, top - 0.02, z0], [xc + cw + 0.004, top, z0 + 0.012]),
    box(p + '-collar-front', 'collar', [xc - cw - 0.004, top - 0.02, zs - 0.008], [xc + cw + 0.004, top, zs + 0.004]),
    box(p + '-collar-left', 'collar', [xc - cw - 0.004, top - 0.02, z0 + 0.012], [xc - cw + 0.008, top, zs - 0.008]),
    box(p + '-collar-right', 'collar', [xc + cw - 0.008, top - 0.02, z0 + 0.012], [xc + cw + 0.004, top, zs - 0.008]),
  ] + (if split then [
    h.disc(p + '-sole-big', 'sole', b.w * 0.16 + 0.004, y0, s, big[0], big[1]),
    h.disc(p + '-sole-rest', 'sole', b.w * 0.27 + 0.004, y0, s, rest[0], rest[1]),
    dome(p + '-toe-big', 'toe', b.w * 0.16, big, b.toe),
    dome(p + '-toe-rest', 'toe', b.w * 0.27, rest, b.toe * 0.85),
  ] else [
    h.disc(p + '-sole-toe', 'sole', b.w / 2 + 0.004, y0, s, xc, zt),
    dome(p + '-toe', 'toe', b.w / 2, [xc, zt], b.toe),
  ]) + (if b.laces == 0 then [] else [
    box(p + '-tongue', 'upper', [xc - b.w * 0.2, shaftY, zs], [xc + b.w * 0.2, top + 0.008, zs + 0.006]),
  ] + [
    box('%s-lace-%d' % [p, i], 'laces', [xc - b.w * 0.3, s + b.instep + i * rise / std.max(1, b.laces - 1), zs + 0.006], [xc + b.w * 0.3, s + b.instep + i * rise / std.max(1, b.laces - 1) + 0.004, zs + 0.009])
    for i in std.range(0, b.laces - 1)
  ] + [
    // Lace rungs down the instep slope toward the toe.
    local zl = zs + f * (zt - zs) * 0.6, yl = s + b.instep + f * 0.6 * (b.toe - b.instep);
    box('%s-instep-lace-%d' % [p, i], 'laces', [xc - b.w * 0.28, yl - 0.004, zl - 0.004], [xc + b.w * 0.28, yl + 0.002, zl])
    for i in [0, 1]
    for f in [[0.35, 0.75][i]]
  ]);
// A standing pair of shoes `gap` apart; `extra(p, xc)` adds each shoe's own pieces.
local shoePair(id, massKg, b, gap, finish, extra=function(p, xc) []) =
  local xc = b.w / 2 + 0.004 + gap / 2;
  h.compound(id, massKg, shoe('left', -xc, b) + extra('left', -xc) + shoe('right', xc, b) + extra('right', xc), { lining: 'paint-charcoal' } + finish);
// Each shoe of a pair `w` wide and `gap` apart: its prefix and centre x.
local pairOf(w, gap, f) = std.flattenArrays([f(p, (if p == 'left' then -1 else 1) * (w / 2 + gap / 2)) for p in ['left', 'right']]);
// A strap buckle standing proud of a shoe's outer side at height y and depth z.
local sideBuckle(id, xc, w, y, z) =
  local side = -inward(xc), x = xc + side * (w * 0.46 + 0.004);
  [
    box(id + '-frame', 'buckle', [std.min(x, x + side * 0.006), y - 0.012, z - 0.01], [std.max(x, x + side * 0.006), y + 0.012, z + 0.01]),
  ];
// A strap `t` thick wrapped round a shoe's shaft at height y0 to y1, centred on xc, cw half wide, from z0 to z1.
local wrapStrap(id, slot, xc, cw, y0, y1, z0, z1, t=0.004) = [
  box(id + '-front', slot, [xc - cw - t, y0, z1], [xc + cw + t, y1, z1 + t]),
  box(id + '-back', slot, [xc - cw - t, y0, z0 - t], [xc + cw + t, y1, z0]),
  box(id + '-left', slot, [xc - cw - t, y0, z0], [xc - cw, y1, z1]),
  box(id + '-right', slot, [xc + cw, y0, z0], [xc + cw + t, y1, z1]),
];
// A sabaton over a shoe that is not there: lames stepping down from the ankle to a toe cap, side plates and a heel
// cup, strapped under the instep. Slots: plate, toe, strap, buckle.
local sabaton(p, xc) =
  local w = 0.11, l = 0.28, z0 = -l / 2, n = 6;
  local lame(i) =
    local zl = -0.045 + i * 0.024, yt = 0.125 - i * 0.012;
    [
      box('%s-lame-%d-top' % [p, i], 'plate', [xc - w * 0.3, yt - 0.004, zl], [xc + w * 0.3, yt, zl + 0.03]),
      box('%s-lame-%d-left' % [p, i], 'plate', [xc - w / 2, yt - 0.02, zl], [xc - w * 0.3, yt - 0.008, zl + 0.03]),
      box('%s-lame-%d-right' % [p, i], 'plate', [xc + w * 0.3, yt - 0.02, zl], [xc + w / 2, yt - 0.008, zl + 0.03]),
      box('%s-lame-%d-shoulder-left' % [p, i], 'plate', [xc - w * 0.4, yt - 0.01, zl], [xc - w * 0.28, yt - 0.002, zl + 0.03]),
      box('%s-lame-%d-shoulder-right' % [p, i], 'plate', [xc + w * 0.28, yt - 0.01, zl], [xc + w * 0.4, yt - 0.002, zl + 0.03]),
      box('%s-lame-%d-side-left' % [p, i], 'plate', [xc - w / 2, 0.012, zl], [xc - w / 2 + 0.004, yt - 0.016, zl + 0.03]),
      box('%s-lame-%d-side-right' % [p, i], 'plate', [xc + w / 2 - 0.004, 0.012, zl], [xc + w / 2, yt - 0.016, zl + 0.03]),
    ];
  // The lames, each overlapping the next toward the toe.
  std.flattenArrays([lame(i) for i in std.range(0, n - 1)]) + [
    // A pointed toe cap riding over the last lame.
    h.prism(p + '-toe-top', 'toe', 'x', [[0.05, 0.095], [0.012, l / 2 + 0.01], [0.012, 0.095]], xc - w * 0.42, xc + w * 0.42),
    h.prism(p + '-toe-left', 'toe', 'y', [[0.095, xc - w / 2], [l / 2 + 0.01, xc - 0.004], [l / 2 + 0.01, xc + 0.004], [0.095, xc - w * 0.42]], 0.012, 0.05),
    h.prism(p + '-toe-right', 'toe', 'y', [[0.095, xc + w * 0.42], [l / 2 + 0.01, xc - 0.004], [l / 2 + 0.01, xc + 0.004], [0.095, xc + w / 2]], 0.012, 0.05),
    // The heel cup and ankle plate.
    box(p + '-heel-back', 'plate', [xc - w * 0.4, 0.012, z0 - 0.004], [xc + w * 0.4, 0.1, z0]),
    box(p + '-heel-left', 'plate', [xc - w / 2, 0.012, z0], [xc - w / 2 + 0.004, 0.09, -0.045]),
    box(p + '-heel-right', 'plate', [xc + w / 2 - 0.004, 0.012, z0], [xc + w / 2, 0.09, -0.045]),
  ] + wrapStrap(p + '-ankle', 'plate', xc, w * 0.42, 0.1, 0.14, z0, -0.05) + [
    box(p + '-inside', 'lining', [xc - w * 0.42, 0.012, z0], [xc + w * 0.42, 0.1, -0.05]),
    // The strap passing under the arch, buckled on the outer side.
    box(p + '-strap-under', 'strap', [xc - w / 2 - 0.004, 0, -0.01], [xc + w / 2 + 0.004, 0.006, 0.015]),
    box(p + '-strap-left', 'strap', [xc - w / 2 - 0.004, 0.006, -0.01], [xc - w / 2, 0.06, 0.015]),
    box(p + '-strap-right', 'strap', [xc + w / 2, 0.006, -0.01], [xc + w / 2 + 0.004, 0.06, 0.015]),
    box(p + '-heel-strap', 'strap', [xc - w / 2 - 0.004, 0, z0 + 0.01], [xc + w / 2 + 0.004, 0.012, z0 + 0.035]),
  ] + sideBuckle(p + '-buckle', xc, w, 0.04, 0.0025);
// A high-heeled pump with its toe on +z: a sole sloping from a heel `hh` high down to the ball, a stiletto heel, a
// closed toe and low sides. Slots: upper, sole, heel, insole.
local pump(p, xc) =
  local l = 0.24, w = 0.075, hh = 0.085, z0 = -l / 2, zb = z0 + 0.14, zt = l / 2 - w / 2, t = 0.006;
  local ys(z) = if z >= zb then 0.008 else 0.008 + (zb - z) / (zb - z0) * (hh - 0.008);
  local zv = zb - 0.035;
  [
    h.prism(p + '-arch', 'sole', 'x', [[hh, z0], [ys(zb), zb], [ys(zb) + t, zb], [hh + t, z0]], xc - w / 2, xc + w / 2),
    box(p + '-ball', 'sole', [xc - w / 2, 0, zb], [xc + w / 2, 0.008, zt]),
    h.disc(p + '-ball-toe', 'sole', w / 2, 0, 0.008, xc, zt),
    // The insole showing inside the open back.
    h.prism(p + '-insole', 'insole', 'x', [[hh + t, z0 + 0.004], [ys(zv) + t, zv], [ys(zv) + t + 0.002, zv], [hh + t + 0.002, z0 + 0.004]], xc - w / 2 + 0.003, xc + w / 2 - 0.003),
    // The stiletto, wider where it meets the sole, with a black cap.
    box(p + '-heel-top', 'heel', [xc - 0.01, hh - 0.02, z0], [xc + 0.01, hh, z0 + 0.026]),
    box(p + '-heel-post', 'heel', [xc - 0.006, 0.006, z0 + 0.004], [xc + 0.006, hh - 0.02, z0 + 0.018]),
    box(p + '-heel-cap', 'sole', [xc - 0.006, 0, z0 + 0.004], [xc + 0.006, 0.006, z0 + 0.018]),
    // The vamp over the toes and the low quarters round the heel.
    h.prism(p + '-vamp', 'upper', 'x', [[ys(zv), zv], [0.008, zb], [0.008, zt], [0.036, zt], [ys(zv) + 0.034, zv]], xc - w / 2, xc + w / 2),
    h.turned(p + '-toe', 'upper', 'y', [[0, 0], [0, w / 2], [0.016, w / 2], [0.028, w * 0.3], [0.028, 0]], [xc, 0.008, zt]),
    h.prism(p + '-quarter-left', 'upper', 'x', [[hh + t, z0], [ys(zv) + t, zv], [ys(zv) + 0.03, zv], [hh + 0.045, z0]], xc - w / 2, xc - w / 2 + 0.004),
    h.prism(p + '-quarter-right', 'upper', 'x', [[hh + t, z0], [ys(zv) + t, zv], [ys(zv) + 0.03, zv], [hh + 0.045, z0]], xc + w / 2 - 0.004, xc + w / 2),
    box(p + '-counter', 'upper', [xc - w / 2, hh + t, z0 - 0.004], [xc + w / 2, hh + 0.05, z0]),
  ];
// A hiking sandal with its toe on +z: a thick treaded sole, a leather footbed, straps over the toes and instep, an
// ankle strap with a buckle and a heel strap. Slots: sole, footbed, strap, buckle.
local sandal(p, xc) =
  local l = 0.28, w = 0.1, z0 = -l / 2, zt = l / 2 - w / 2, s = 0.026, side = -inward(xc);
  local arch(id, z, y, d) = [
    box(id + '-top', 'strap', [xc - w / 2 - 0.004, y, z], [xc + w / 2 + 0.004, y + 0.006, z + d]),
    box(id + '-left', 'strap', [xc - w / 2 - 0.004, s, z], [xc - w / 2, y, z + d]),
    box(id + '-right', 'strap', [xc + w / 2, s, z], [xc + w / 2 + 0.004, y, z + d]),
  ];
  [
    box(p + '-sole', 'sole', [xc - w / 2, 0, z0], [xc + w / 2, s - 0.006, zt]),
    h.disc(p + '-sole-toe', 'sole', w / 2, 0, s - 0.006, xc, zt),
    box(p + '-footbed', 'footbed', [xc - w / 2, s - 0.006, z0], [xc + w / 2, s, zt]),
    h.disc(p + '-footbed-toe', 'footbed', w / 2, s - 0.006, s, xc, zt),
  ] + [
    // Tread lugs standing proud along the sole's sides.
    box('%s-lug-%d-%d' % [p, i, j], 'sole', [xc + [-1, 1][j] * (w / 2) - 0.003, 0, z0 + 0.01 + i * 0.04], [xc + [-1, 1][j] * (w / 2) + 0.003, 0.012, z0 + 0.03 + i * 0.04])
    for i in std.range(0, 5)
    for j in [0, 1]
  ] + arch(p + '-toe-strap', zt - 0.03, s + 0.026, 0.025)
  + arch(p + '-instep-strap', -0.01, s + 0.05, 0.03)
  + arch(p + '-ankle-strap', z0 + 0.035, s + 0.065, 0.022) + [
    box(p + '-heel-strap', 'strap', [xc - w / 2 + 0.004, s, z0 - 0.004], [xc + w / 2 - 0.004, s + 0.06, z0]),
    box(p + '-heel-left', 'strap', [xc - w / 2 - 0.004, s + 0.04, z0 - 0.004], [xc - w / 2, s + 0.065, z0 + 0.035]),
    box(p + '-heel-right', 'strap', [xc + w / 2, s + 0.04, z0 - 0.004], [xc + w / 2 + 0.004, s + 0.065, z0 + 0.035]),
    box(p + '-buckle', 'buckle', [std.min(xc + side * (w / 2 + 0.004), xc + side * (w / 2 + 0.009)), s + 0.052, z0 + 0.035], [std.max(xc + side * (w / 2 + 0.004), xc + side * (w / 2 + 0.009)), s + 0.075, z0 + 0.06]),
  ];
// A tall boot's calf: a wider shaft over the leg from y0 to y1, with a band at the top. Slot upper and collar.
local calf(p, xc, w, y0, y1, z0, z1) = [
  box(p + '-calf', 'upper', [xc - w * 0.5, y0, z0 - 0.004], [xc + w * 0.5, y1 - 0.02, z1 + 0.006]),
];
local knee = { l: 0.29, w: 0.1, s: 0.022, heel: 0.03, toe: 0.055, instep: 0.085, top: 0.42, shaft: 0.13, laces: 0 };
[
  // A pair of golf shoes, each 290 mm long and 100 mm wide, in white leather with a brown toe cap and saddle, laced,
  // their soles standing on short spikes.
  shoePair('golf_shoes', 1, { l: 0.29, w: 0.1, s: 0.02, y0: 0.006, toe: 0.05, instep: 0.068, top: 0.104, shaft: 0.13, laces: 3 }, 0.02, {
    upper: 'paint-white',
    toe: 'leather-brown',
    sole: 'leather-black',
    collar: 'leather-brown',
    laces: 'paint-white',
    saddle: 'leather-brown',
    spike: 'steel-grey',
  }, function(p, xc) [
    box(p + '-saddle-%s' % side, 'saddle', [xc + [-1, 1][i] * 0.05 - 0.002, 0.026, -0.03], [xc + [-1, 1][i] * 0.05 + 0.002, 0.09, 0.02])
    for i in [0, 1]
    for side in [['left', 'right'][i]]
  ] + [
    h.disc('%s-spike-%d-%d' % [p, i, j], 'spike', 0.006, 0, 0.006, xc + [-0.03, 0.03][j], -0.12 + i * 0.07)
    for i in std.range(0, 3)
    for j in [0, 1]
  ]) + { voxelGrain: 0.004 },

  // A pair of mail booties, each 280 mm long, 105 mm wide and 160 mm tall, slumped soft with no stiff sole, a turned
  // cuff and a leather tie round each ankle. The steel grades ride on finishes maps.
  shoePair('chainmail_chausses', 2, { l: 0.28, w: 0.105, s: 0.004, heel: 0.002, toe: 0.045, instep: 0.07, top: 0.16, shaft: 0.13, laces: 0 }, 0.02, {
    upper: 'steel-mail',
    toe: 'steel-mail',
    sole: 'steel-mail',
    collar: 'steel-mail',
    tie: 'leather-brown',
  }, function(p, xc) [
    box(p + '-cuff', 'collar', [xc - 0.052, 0.12, -0.144], [xc + 0.052, 0.14, -0.004]),
  ] + std.flattenArrays([
    // Rows of rings standing proud round the ankle.
    wrapStrap('%s-row-%d' % [p, i], 'upper', xc, 0.0483, 0.068 + i * 0.016, 0.076 + i * 0.016, -0.136, -0.011)
    for i in std.range(0, 2)
  ]) + [
    box(p + '-tie', 'tie', [xc - 0.054, 0.1, -0.146], [xc + 0.054, 0.108, -0.002]),
    box(p + '-tie-end', 'tie', [xc - 0.004, 0.06, -0.006], [xc + 0.004, 0.104, 0.0]),
  ]) + { voxelGrain: 0.004 },

  // A pair of steel sabatons, each 280 mm long and 110 mm wide: six lames stepping down the instep to a pointed toe
  // cap, a heel cup and ankle plate, and a leather strap under the arch. The steel grades ride on finishes maps.
  h.compound('sabaton', 1.3, pairOf(0.11, 0.03, sabaton), {
    plate: 'steel-grey',
    toe: 'steel-grey',
    lining: 'leather-brown',
    strap: 'leather-brown',
    buckle: 'brass-dull',
  }) + { voxelGrain: 0.004 },

  // A pair of high-heeled pumps, each 240 mm long and 75 mm wide, on 85 mm stiletto heels, in glossy red leather.
  h.compound('heels', 0.5, pairOf(0.075, 0.03, pump), {
    upper: 'paint-red',
    sole: 'leather-black',
    heel: 'leather-black',
    insole: 'leather-brown',
  }) + { voxelGrain: 0.004 },

  // A pair of split-toe work boots in thin black leather, each 270 mm long, 95 mm wide and 200 mm tall, closed down
  // the inner side by a row of small brass clasps.
  shoePair('jikatabi', 0.8, { l: 0.27, w: 0.095, s: 0.008, heel: 0.004, toe: 0.04, instep: 0.065, top: 0.2, shaft: 0.12, laces: 0, split: true }, 0.03, {
    upper: 'leather-black',
    toe: 'leather-black',
    sole: 'rubber-black',
    collar: 'leather-black',
    clasp: 'brass',
  }, function(p, xc) [
    local x = xc + inward(xc) * 0.0477;
    box('%s-clasp-%d' % [p, i], 'clasp', [x - 0.003, 0.08 + i * 0.022, -0.1], [x + 0.003, 0.088 + i * 0.022, -0.075])
    for i in std.range(0, 4)
  ]) + { voxelGrain: 0.004 },

  // A pair of split-toe canvas shoes, each 270 mm long, 95 mm wide and 110 mm tall, on thick treaded rubber soles,
  // laced up the front.
  shoePair('jikatabi_sneakers', 0.8, { l: 0.27, w: 0.095, s: 0.018, heel: 0.006, toe: 0.04, instep: 0.065, top: 0.11, shaft: 0.12, laces: 2, split: true }, 0.03, {
    upper: 'cloth-navy',
    toe: 'cloth-navy',
    sole: 'rubber-black',
    collar: 'rubber-black',
    laces: 'cloth-white',
  }) + { voxelGrain: 0.004 },

  // A pair of brown leather boots pulled up to the knee, each 290 mm long, 100 mm wide and 420 mm tall, with a block
  // heel and a zip down the inner side.
  shoePair('knee_high_boots', 1.8, knee, 0.03, {
    upper: 'leather-brown',
    toe: 'leather-brown',
    sole: 'leather-black',
    collar: 'leather-brown',
    zip: 'metal-silver',
  }, function(p, xc) calf(p, xc, 0.1, 0.2, 0.42, -0.141, -0.015) + [
    local x = xc + inward(xc) * 0.05;
    box(p + '-zip', 'zip', [x - 0.002, 0.06, -0.08], [x + 0.002, 0.39, -0.072]),
  ]) + { voxelGrain: 0.004 },

  // A pair of leather hiking sandals, each 280 mm long and 100 mm wide, on 26 mm treaded rubber soles, with straps
  // over the toes, instep and ankle, a buckle on the ankle strap and a heel strap.
  h.compound('leathersandals', 0.9, pairOf(0.1, 0.03, sandal), {
    sole: 'rubber-black',
    footbed: 'leather-brown',
    strap: 'leather-brown',
    buckle: 'brass-dull',
  }) + { voxelGrain: 0.004 },

  // A pair of red canvas low-top tennis shoes, each 280 mm long and 95 mm wide, with white rubber soles and toe caps
  // and white laces.
  shoePair('lowtops', 0.8, { l: 0.28, w: 0.095, s: 0.022, heel: 0.004, toe: 0.04, instep: 0.06, top: 0.096, shaft: 0.12, laces: 3 }, 0.02, {
    upper: 'cloth-red',
    toe: 'paint-white',
    sole: 'paint-white',
    collar: 'cloth-red',
    laces: 'cloth-white',
  }) + { voxelGrain: 0.004 },

  // A pair of soft leather moccasins, each 270 mm long and 95 mm wide, with a gathered U-shaped panel over the toes, a
  // fur cuff and a lace tie round the ankle.
  shoePair('mocassins', 0.5, { l: 0.27, w: 0.095, s: 0.005, heel: 0.002, toe: 0.038, instep: 0.06, top: 0.09, shaft: 0.12, laces: 0 }, 0.02, {
    upper: 'leather-brown',
    toe: 'leather-brown',
    sole: 'leather-brown',
    collar: 'fur-brown',
    panel: 'skin-rawhide',
    tie: 'cord-olive',
  }, function(p, xc) [
    h.prism(p + '-panel', 'panel', 'x', [[0.055, 0.0], [0.04, 0.09], [0.048, 0.09], [0.067, 0.0]], xc - 0.032, xc + 0.032),
    h.disc(p + '-panel-toe', 'panel', 0.032, 0.035, 0.044, xc, 0.088),
    box(p + '-tie-front', 'tie', [xc - 0.03, 0.062, -0.001], [xc + 0.03, 0.066, 0.004]),
    box(p + '-tie-end', 'tie', [xc + 0.03, 0.04, -0.001], [xc + 0.034, 0.066, 0.004]),
  ]) + { voxelGrain: 0.004 },

  // A pair of black leather motorcycle police boots, each 290 mm long, 100 mm wide and 420 mm tall, on thick lugged
  // soles, with a buckled strap over the instep and another round the top of the calf.
  shoePair('motor_police_boots', 2.5, knee + { s: 0.028 }, 0.03, {
    upper: 'leather-black',
    toe: 'leather-black',
    sole: 'rubber-black',
    collar: 'leather-black',
    strap: 'leather-black',
    buckle: 'metal-silver',
  }, function(p, xc) calf(p, xc, 0.1, 0.2, 0.42, -0.141, -0.015) + [
    // The instep strap over the vamp.
    h.prism(p + '-instep-strap', 'strap', 'x', [[0.08, -0.02], [0.098, -0.02], [0.118, -0.045], [0.1, -0.045]], xc - 0.054, xc + 0.054),
  ] + wrapStrap(p + '-top-strap', 'strap', xc, 0.05, 0.36, 0.385, -0.141, -0.009)
  + sideBuckle(p + '-instep-buckle', xc, 0.115, 0.1, -0.03)
  + sideBuckle(p + '-top-buckle', xc, 0.115, 0.372, -0.075)) + { voxelGrain: 0.004 },
]
