local h = import '../compound.libsonnet';
local box = h.box;
// One low shoe standing with its toe on +z, centred on x = `xc`, its sole bottom at `y0`. `b` holds length `l`,
// width `w`, sole `s`, heel lift `H` (0 for a flat shoe), and the upper's heights above the sole: `back` at the heel
// counter, `ball` across the ball of the foot and `toe` at the toe; `laces` counts lace rungs (0 for a slip-on).
// The heel seat runs to 30% of the length and the ball starts at 62%; a raised heel slopes the shank between.
// Slots: sole, heel, upper, toe, collar, lining, laces.
local shoe(p, xc, b, y0=0) =
  local z0 = -b.l / 2, zt = b.l / 2 - b.w / 2, zh = z0 + 0.3 * b.l, zb = z0 + 0.62 * b.l;
  local sw = b.w / 2 + 0.004, uw = b.w / 2 * 0.92, s = b.s, H = b.H;
  local seat = y0 + H + s, top = seat + b.back, ballTop = y0 + s + b.ball;
  (if H > 0 then [
     h.prism(p + '-heel', 'heel', 'x', [[y0, z0 + 0.02], [y0, z0 + 0.2 * b.l], [seat - s, z0 + 0.22 * b.l], [seat - s, z0]], xc - b.w * 0.3, xc + b.w * 0.3),
   ] else []) + [
    box(p + '-seat', 'sole', [xc - sw * 0.9, seat - s, z0 - 0.002], [xc + sw * 0.9, seat, zh]),
    h.prism(p + '-shank', 'sole', 'x', [[seat - s, zh], [seat, zh], [y0 + s, zb], [y0, zb]], xc - sw * 0.9, xc + sw * 0.9),
    box(p + '-fore', 'sole', [xc - sw, y0, zb], [xc + sw, y0 + s, zt]),
    h.disc(p + '-sole-toe', 'sole', sw, y0, y0 + s, xc, zt),
    box(p + '-rear', 'upper', [xc - uw, seat, z0], [xc + uw, top, zh]),
    h.prism(p + '-mid', 'upper', 'x', [[seat, zh], [y0 + s, zb], [ballTop, zb], [top, zh]], xc - uw, xc + uw),
    h.prism(p + '-vamp', 'upper', 'x', [[y0 + s, zb], [y0 + s, zt], [y0 + s + b.toe, zt], [ballTop, zb]], xc - uw, xc + uw),
    h.turned(p + '-toe', 'toe', 'y', [[0, 0], [0, b.w / 2], [b.toe * 0.6, b.w / 2], [b.toe, b.w * 0.3], [b.toe, 0]], [xc, y0 + s, zt]),
    // The opening: a dark lining inside a padded collar rim.
    box(p + '-lining', 'lining', [xc - uw + 0.008, top, z0 + 0.012], [xc + uw - 0.008, top + 0.002, zh - 0.004]),
    box(p + '-collar-back', 'collar', [xc - uw, top, z0], [xc + uw, top + 0.006, z0 + 0.012]),
    box(p + '-collar-left', 'collar', [xc - uw, top, z0 + 0.012], [xc - uw + 0.008, top + 0.006, zh]),
    box(p + '-collar-right', 'collar', [xc + uw - 0.008, top, z0 + 0.012], [xc + uw, top + 0.006, zh]),
  ] + [
    // Lace rungs down the instep slope.
    local f = (i + 0.5) / b.laces * 0.75, zl = zh + f * (zb - zh), yl = top + f * (ballTop - top);
    box('%s-lace-%d' % [p, i], 'laces', [xc - uw * 0.55, yl - 0.002, zl - 0.003], [xc + uw * 0.55, yl + 0.004, zl + 0.003])
    for i in std.range(0, b.laces - 1)
  ];
local pairX(w, gap) = w / 2 + 0.004 + gap / 2;
// A standing pair of shoes `gap` apart; `extra(p, xc)` adds each shoe's own pieces.
local shoePair(id, massKg, b, gap, finish, extra=function(p, xc) [], y0=0) =
  local xc = pairX(b.w, gap);
  h.compound(id, massKg, std.flattenArrays([
    shoe(p, x, b, y0) + extra(p, x)
    for p in ['left', 'right']
    for x in [if p == 'left' then -xc else xc]
  ]), { lining: 'paint-charcoal', heel: 'rubber-black' } + finish) + { voxelGrain: 0.004 };
// A convex foot-shaped outline `l` long and `w` wide centred on (xc, zc), as [z, x] points for a prism on y.
local footOutline(l, w, xc, zc=0) =
  local fr = [[-0.5, 0.55], [-0.45, 0.8], [-0.3, 0.88], [0.1, 0.97], [0.25, 1.0], [0.38, 0.9], [0.46, 0.65], [0.5, 0.3]];
  [[zc + f[0] * l, xc + f[1] * w / 2] for f in fr] + [[zc + f[0] * l, xc - f[1] * w / 2] for f in std.reverse(fr)];
// A strap `w` wide standing from y0 to y1 along the plan segment from [xa, za] to [xb, zb].
local strip(id, slot, a, b, w, y0, y1) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz), nx = -dz / len * w / 2, nz = dx / len * w / 2;
  h.prism(id, slot, 'y', [[a[1] + nz, a[0] + nx], [b[1] + nz, b[0] + nx], [b[1] - nz, b[0] - nx], [a[1] - nz, a[0] - nx]], y0, y1);
// A thong: a post at [xc, zp] and two straps arching from its top, `ht` above y0, down to the sides of the foot at
// zs, half-spread `xs`, each strap a run of three steps.
local thong(p, xc, zp, zs, xs, w, y0, ht) = [
  h.disc(p + '-post', 'strap', w * 0.6, y0, y0 + ht, xc, zp),
] + [
  local a = [xc + side * xs * i / 3, zp + (zs - zp) * i / 3], b = [xc + side * xs * (i + 1) / 3, zp + (zs - zp) * (i + 1) / 3];
  strip('%s-strap-%d-%d' % [p, side, i], 'strap', a, b, w, y0 + ht * (2 - i) / 3, y0 + ht * (3 - i) / 3 + 0.002)
  for side in [-1, 1]
  for i in [0, 1, 2]
];
// A pair of flip-flops: a foam sole `s` thick under a footbed `bed` thick, and a thong strap `sw` wide and `ht` high.
local flipFlops(id, massKg, l, w, s, bed, sw, ht, finish) =
  local xc = pairX(w, 0.02);
  h.compound(id, massKg, std.flattenArrays([
    [
      h.prism(p + '-sole', 'sole', 'y', footOutline(l, w, x), 0, s),
      h.prism(p + '-bed', 'bed', 'y', footOutline(l - 0.008, w - 0.008, x), s, s + bed),
    ] + thong(p, x, 0.3 * l, -0.05 * l, 0.4 * w, sw, s + bed, ht)
    for p in ['left', 'right']
    for x in [if p == 'left' then -xc else xc]
  ]), finish) + { voxelGrain: 0.004 };
// A pair of foot wraps lying flat side by side: each a cloth square folded into a pad `w` wide and `l` long, its
// two layers `t` thick each, tied across with a cord; `tufts` adds rows of fur tufts on top. Slots: cloth, cord, fur.
local footWraps(id, massKg, w, l, t, finish, tufts=false) =
  local xc = w / 2 + 0.01;
  h.compound(id, massKg, std.flattenArrays([
    [
      box(p + '-under', 'cloth', [x - w / 2, 0, -l / 2], [x + w / 2, t, l / 2]),
      box(p + '-fold', 'cloth', [x - w / 2 + 0.006, t, -l / 2 + 0.012], [x + w / 2 - 0.004, 2 * t, l / 2 - 0.004]),
      // One corner folded back over the pad.
      h.prism(p + '-corner', 'cloth', 'y', [[l / 2 - 0.004, x - w / 2 + 0.006], [l / 2 - 0.004, x + 0.02], [l / 2 - 0.07, x - w / 2 + 0.006]], 2 * t, 3 * t),
      box(p + '-cord', 'cord', [x - w / 2 - 0.002, 0, -0.004], [x + w / 2 + 0.002, 2 * t + 0.003, 0.004]),
      box(p + '-cord-end-a', 'cord', [x + 0.01, 2 * t, 0.004], [x + 0.016, 2 * t + 0.003, 0.07]),
      box(p + '-cord-end-b', 'cord', [x - 0.02, 2 * t, -0.08], [x - 0.014, 2 * t + 0.003, -0.004]),
    ] + (if tufts then [
           // Staggered tufts of pile, every other row shifted half a step.
           local tx = x - w / 2 + 0.012 + i * 0.026 + (j % 2) * 0.013, tz = -l / 2 + 0.02 + j * 0.03, ts = 0.012 + ((i + j) % 3) * 0.003;
           box('%s-tuft-%d-%d' % [p, i, j], 'fur', [tx, 2 * t, tz], [tx + ts, 2 * t + 0.004 + ((i * 2 + j) % 3) * 0.002, tz + ts])
           for i in std.range(0, std.floor((w - 0.04) / 0.026))
           for j in std.range(0, std.floor((l - 0.04) / 0.03))
           if std.abs(-l / 2 + 0.02 + j * 0.03 + 0.007) > 0.016
         ] else [])
    for p in ['left', 'right']
    for x in [if p == 'left' then -xc else xc]
  ]), finish) + { voxelGrain: 0.004 };
[
  // A pair of black football boots, each 300 mm long and 105 mm wide, low-cut and laced, a white stripe down each
  // side and a moulded white sole standing on 12 mm studs.
  shoePair('cleats', 1, { l: 0.3, w: 0.105, s: 0.012, H: 0, back: 0.065, ball: 0.05, toe: 0.035, laces: 5 }, 0.02, {
    upper: 'leather-black',
    toe: 'leather-black',
    sole: 'plastic-white',
    collar: 'leather-black',
    laces: 'cloth-white',
    stripe: 'paint-white',
    studs: 'plastic-black',
  }, function(p, xc) [
    h.prism('%s-stripe-%d' % [p, side], 'stripe', 'x', [[0.024, -0.06], [0.024, -0.04], [0.08, -0.08], [0.08, -0.1]], xc + side * 0.0483 - 0.002, xc + side * 0.0483 + 0.002)
    for side in [-1, 1]
  ] + [
    h.disc('%s-stud-%d' % [p, i], 'studs', 0.007, 0, 0.012, xc + [-0.03, 0.03, -0.03, 0.03, 0, -0.02, 0.02, -0.025, 0.025][i], [0.09, 0.09, 0.03, 0.03, 0.12, -0.08, -0.08, -0.13, -0.13][i])
    for i in std.range(0, 8)
  ], 0.012),

  // A pair of carved wooden clogs, each 300 mm long, 110 mm wide and 95 mm tall, closed at the heel, with the toe
  // tip turned up.
  shoePair('clogs', 1.1, { l: 0.3, w: 0.11, s: 0.02, H: 0, back: 0.072, ball: 0.068, toe: 0.05, laces: 0 }, 0.02, {
    upper: 'wood-birch',
    toe: 'wood-birch',
    sole: 'wood-birch',
    collar: 'wood-birch',
    lining: 'wood-walnut',
  }, function(p, xc) [
    h.prism(p + '-tip', 'toe', 'x', [[0.02, 0.15], [0.02, 0.157], [0.06, 0.163], [0.075, 0.158], [0.07, 0.145]], xc - 0.02, xc + 0.02),
  ]),

  // A pair of red clown shoes, each 450 mm long and 150 mm wide, with a great rounded bulb over the toes, white
  // soles and yellow laces.
  shoePair('clownshoes', 2, { l: 0.45, w: 0.15, s: 0.02, H: 0, back: 0.07, ball: 0.06, toe: 0.05, laces: 4 }, 0.02, {
    upper: 'paint-red',
    toe: 'paint-red',
    bulb: 'paint-red',
    sole: 'paint-white',
    collar: 'paint-white',
    laces: 'plastic-yellow',
  }, function(p, xc) [
    h.turned(p + '-bulb', 'bulb', 'y', [[0, 0], [0, 0.082], [0.03, 0.084], [0.06, 0.07], [0.08, 0.04], [0.088, 0]], [xc, 0.02, 0.13]),
  ]),

  // A pair of black dance shoes, each 270 mm long and 85 mm wide, laced, on a thin suede sole and a flared 50 mm heel.
  shoePair('dance_shoes', 0.6, { l: 0.27, w: 0.085, s: 0.006, H: 0.05, back: 0.05, ball: 0.042, toe: 0.028, laces: 3 }, 0.02, {
    upper: 'leather-black',
    toe: 'leather-black',
    sole: 'paperboard-brown',
    heel: 'leather-black',
    collar: 'leather-black',
    laces: 'cloth-black',
    lining: 'paperboard-tan',
  }),

  // A pair of black leather lace-up dress shoes, each 300 mm long and 100 mm wide, on a tan leather sole with a 22 mm
  // heel.
  shoePair('dress_shoes', 0.95, { l: 0.3, w: 0.1, s: 0.012, H: 0.022, back: 0.058, ball: 0.048, toe: 0.032, laces: 4 }, 0.02, {
    upper: 'leather-black',
    toe: 'leather-black',
    sole: 'leather-brown',
    heel: 'rubber-black',
    collar: 'leather-black',
    laces: 'cloth-black',
    lining: 'paperboard-tan',
  }),

  // A pair of navy canvas espadrilles, each 270 mm long and 95 mm wide, slip-on, on a 20 mm sole of coiled jute rope.
  shoePair('espadrilles', 0.64, { l: 0.27, w: 0.095, s: 0.02, H: 0, back: 0.04, ball: 0.04, toe: 0.028, laces: 0 }, 0.02, {
    upper: 'cloth-navy',
    toe: 'cloth-navy',
    sole: 'straw-wicker',
    collar: 'cloth-navy',
    rope: 'paperboard-brown',
  }, function(p, xc) [
    box('%s-rope-%d' % [p, i], 'rope', [xc - 0.0535, 0.004 + i * 0.006, -0.139], [xc + 0.0535, 0.006 + i * 0.006, 0.087])
    for i in [0, 1, 2]
  ]),

  // A pair of cheap foam flip-flops, each 260 mm long and 95 mm wide, a blue sole under a grey footbed and a black
  // thong strap.
  flipFlops('flip_flops', 0.2, 0.26, 0.095, 0.01, 0.004, 0.008, 0.018, { sole: 'plastic-blue', bed: 'plastic-grey', strap: 'rubber-black' }),

  // A pair of upmarket flip-flops, each 270 mm long and 100 mm wide, a thick black rubber sole under a tan leather
  // footbed and wide brown leather straps.
  flipFlops('flip_flops_exp', 0.5, 0.27, 0.1, 0.016, 0.006, 0.014, 0.022, { sole: 'rubber-black', bed: 'paperboard-tan', strap: 'leather-brown' }),

  // A pair of armoured overboots for bomb disposal, each 340 mm long, 130 mm wide and 165 mm tall: an olive flame-
  // proof cloth shell on a thick sole, a rigid plate over the toes and instep and two hook-and-loop straps.
  shoePair('foot_protectors_eod', 3.2, { l: 0.34, w: 0.13, s: 0.025, H: 0, back: 0.13, ball: 0.085, toe: 0.06, laces: 0 }, 0.02, {
    upper: 'cloth-olive-drab',
    toe: 'polymer-od-green',
    sole: 'rubber-black',
    collar: 'webbing-olive-dark',
    plate: 'polymer-od-green',
    strap: 'webbing-black',
  }, function(p, xc) [
    h.prism(p + '-plate-instep', 'plate', 'x', [[0.155, -0.068], [0.11, 0.041], [0.122, 0.041], [0.167, -0.068]], xc - 0.052, xc + 0.052),
    h.prism(p + '-plate-toe', 'plate', 'x', [[0.11, 0.041], [0.085, 0.105], [0.097, 0.105], [0.122, 0.041]], xc - 0.052, xc + 0.052),
  ] + [
    box('%s-strap-%d' % [p, i], 'strap', [xc - 0.064, 0.025, z - 0.012], [xc + 0.064, [0.162, 0.162][i], z + 0.012])
    for i in [0, 1]
    for z in [[-0.13, -0.085][i]]
  ]),

  // A pair of cotton rags, each folded to a pad 120 mm wide and 220 mm long, tied with a strip of the same rag.
  footWraps('footrags', 0.079, 0.12, 0.22, 0.004, { cloth: 'cloth-rag', cord: 'cloth-rag-shadow' }),

  // A pair of pale faux-fur pads, each 130 mm wide and 230 mm long, tied with cord, the pile in shaggy tufts.
  footWraps('footrags_faux_fur', 0.19, 0.13, 0.23, 0.008, { cloth: 'cloth-white', fur: 'cloth-white', cord: 'cord-olive' }, true),

  // A pair of brown pelt pads, each 130 mm wide and 230 mm long, tied with rawhide thong, the fur in tufts.
  footWraps('footrags_fur', 0.2, 0.13, 0.23, 0.008, { cloth: 'fur-brown', fur: 'fur-brown', cord: 'skin-rawhide' }, true),

  // A pair of leather patches, each folded to a pad 120 mm wide and 220 mm long, tied with a leather thong.
  footWraps('footrags_leather', 0.24, 0.12, 0.22, 0.004, { cloth: 'leather-brown', cord: 'leather-black' }),

  // A pair of grey felt patches, each folded to a pad 120 mm wide and 220 mm long, tied with cord.
  footWraps('footrags_wool', 0.098, 0.12, 0.22, 0.005, { cloth: 'felt-grey', cord: 'cord-olive' }),

  // A pair of wooden geta, each board 240 mm long, 100 mm wide and 17 mm thick on two 45 mm teeth, with a padded
  // cloth thong.
  h.compound('geta', 0.51, std.flattenArrays([
    [
      h.prism(p + '-board', 'wood', 'y', [[-0.12, x - 0.042], [-0.112, x - 0.05], [0.112, x - 0.05], [0.12, x - 0.042], [0.12, x + 0.042], [0.112, x + 0.05], [-0.112, x + 0.05], [-0.12, x + 0.042]], 0.045, 0.062),
      box(p + '-tooth-front', 'wood', [x - 0.05, 0, 0.055], [x + 0.05, 0.045, 0.075]),
      box(p + '-tooth-back', 'wood', [x - 0.05, 0, -0.085], [x + 0.05, 0.045, -0.065]),
    ] + thong(p, x, 0.07, -0.03, 0.048, 0.012, 0.062, 0.028)
    for p in ['left', 'right']
    for x in [if p == 'left' then -0.06 else 0.06]
  ]), { wood: 'wood-pine', strap: 'cloth-red' }) + { voxelGrain: 0.004 },
]
