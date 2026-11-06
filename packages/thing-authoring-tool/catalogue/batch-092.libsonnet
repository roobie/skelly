local h = import '../compound.libsonnet';
local box = h.box;
local tube = h.tube;
local disc = h.disc;
// A curved plate lying along x from x0 to x1, its crown up and its long edges on the floor: an arc of inner radius
// `r` and thickness `t` that spans `a` degrees either side of the top round an axis at height y and depth z, built
// from `n` flat facets because a prism must be convex.
local arc(id, slot, r, t, a, x0, x1, z, n=8, y=null) =
  local rad = a * std.pi / 180, yc = if y == null then -r * std.cos(rad) else y;
  [
    local th0 = -rad + 2 * rad * i / n, th1 = -rad + 2 * rad * (i + 1) / n;
    h.prism('%s-%d' % [id, i], slot, 'x', [
      [yc + r * std.cos(th0), z + r * std.sin(th0)],
      [yc + r * std.cos(th1), z + r * std.sin(th1)],
      [yc + (r + t) * std.cos(th1), z + (r + t) * std.sin(th1)],
      [yc + (r + t) * std.cos(th0), z + (r + t) * std.sin(th0)],
    ], x0, x1)
    for i in std.range(0, n - 1)
  ];
// A strap or tape band round a tube of outer radius r lying along x, `w` wide from x.
local band(id, slot, r, x, w, z, t=0.003) = tube(id, slot, r - 0.004, r + t, x, x + w, r, z);
// A sleeve laid flat along x, `l` long from its shoulder at -x (w0 across) to its cuff at +x (w1 across), `t` thick,
// centred on depth z. Two slanting facets give it a soft taper.
local flatSleeve(id, slot, l, w0, w1, t, z, x0=null) =
  local xs = if x0 == null then -l / 2 else x0;
  [
    h.prism(id, slot, 'y', [[z - w0 / 2, xs], [z + w0 / 2, xs], [z + w1 / 2, xs + l], [z - w1 / 2, xs + l]], 0, t),
  ];
// Rows of ridges across a flat sleeve: strips `w` wide along z every `pitch` along x, standing `t` proud.
local ridges(id, slot, l, w0, w1, y, z, pitch, w, t, x0=null) =
  local xs = if x0 == null then -l / 2 else x0, n = std.floor(l / pitch);
  [
    local x = xs + pitch * (i + 0.5), half = (w0 + (w1 - w0) * (x - xs) / l) / 2 - 0.006;
    box('%s-%d' % [id, i], slot, [x - w / 2, y, z - half], [x + w / 2, y + t, z + half])
    for i in std.range(0, n - 1)
  ];
// A square of carpet curled crown up along x from x0 to x1 into an open half-roll of inner radius r, its jute backing
// inside and its tail lying open on the floor at +z with rows of pile tufts, held by two strips of tape over the
// curl. Slots: carpet, backing, tape.
local carpetCurl(id, r, x0, x1, z) =
  local a = 120, yc = -r * std.cos(a * std.pi / 180), t = 0.01, edge = z + r * std.sin(a * std.pi / 180), flapW = 0.07;
  arc(id + '-back', 'backing', r, 0.003, a, x0, x1, z)
  + arc(id, 'carpet', r + 0.003, t, a, x0, x1, z, 8, yc)
  + [
    box(id + '-flap-back', 'backing', [x0, 0, edge], [x1, 0.003, edge + flapW]),
    box(id + '-flap', 'carpet', [x0, 0.003, edge], [x1, 0.003 + t, edge + flapW]),
  ] + [
    box('%s-tuft-%d' % [id, i], 'carpet', [x0 + 0.004, 0.003 + t, edge + 0.008 + i * 0.014], [x1 - 0.004, 0.005 + t, edge + 0.014 + i * 0.014])
    for i in std.range(0, 4)
  ] + std.flattenArrays([
    arc('%s-tape-%d' % [id, i], 'tape', r + 0.003 + t, 0.002, a, x, x + 0.03, z, 8, yc)
    for i in [0, 1]
    for x in [[x0 + 0.02, x1 - 0.05][i]]
  ]);
// A carpet armguard pair: per arm a curled forearm piece at +x and, when `upper`, a wider upper-arm piece at -x.
local carpetArm(z, upper) =
  carpetCurl('fore-%d' % z, 0.045, 0.01, 0.21, z * 0.09)
  + (if upper then carpetCurl('upper-%d' % z, 0.052, -0.23, -0.01, z * 0.09) else []);
// A hammered sheet steel plate for one arm with two leather straps buckled round its open side, lying crown up
// along x. Strap tails run out across the floor on the +z side.
local platedArm(id, r, a, x0, x1, z) =
  arc(id, 'plate', r, 0.003, a, x0, x1, z)
  + arc(id + '-roll', 'plate', r, 0.007, a, x1 - 0.008, x1, z, 8, -r * std.cos(a * std.pi / 180))
  + std.flattenArrays([
    local xs = x0 + (x1 - x0) * f;
    arc('%s-strap-%d' % [id, f * 100], 'strap', r + 0.003, 0.002, a, xs, xs + 0.022, z, 8, -r * std.cos(a * std.pi / 180)) + [
      box('%s-tail-%d' % [id, f * 100], 'strap', [xs, 0, z + r * 0.9], [xs + 0.022, 0.003, z + r * 0.9 + 0.07]),
      box('%s-buckle-%d' % [id, f * 100], 'buckle', [xs - 0.002, 0, z + r * 0.9], [xs + 0.024, 0.006, z + r * 0.9 + 0.012]),
    ]
    for f in [0.2, 0.7]
  ]);
// A domed elbow cop standing on the floor at (x, z), `r` across, with a riveted side wing at -x.
local cop(id, x, z, r, ht) = [
  h.turned(id, 'plate', 'y', [[0, 0], [0, r], [ht * 0.35, r * 0.93], [ht * 0.75, r * 0.65], [ht, r * 0.2], [ht, 0]], [x, 0, z]),
  h.prism(id + '-wing', 'plate', 'y', [[z - r * 0.7, x - r * 0.5], [z + r * 0.7, x - r * 0.5], [z + r * 0.45, x - r * 1.5], [z - r * 0.45, x - r * 1.5]], 0, 0.004),
  disc(id + '-rivet-a', 'rivet', 0.005, 0.004, 0.007, x - r * 1.2, z - r * 0.3),
  disc(id + '-rivet-b', 'rivet', 0.005, 0.004, 0.007, x - r * 1.2, z + r * 0.3),
];
// A tapered gambeson or padded sleeve, quilted across in ridges, with the laces that tie it to a shirt at its
// shoulder end.
local quiltedSleeve(id, l, w0, w1, t, z, pitch) =
  flatSleeve(id, 'cloth', l, w0, w1, t, z)
  + ridges(id + '-quilt', 'quilt', l, w0, w1, t, z, pitch, pitch * 0.55, 0.006)
  + [
    box(id + '-lace-%d' % i, 'lace', [-l / 2 - 0.06, 0, z + (i - 0.5) * w0 * 0.5 - 0.003], [-l / 2, 0.004, z + (i - 0.5) * w0 * 0.5 + 0.003])
    for i in [0, 1]
  ];
// A heavy quilted sleeve lying on its side along x, its padding holding it round: a tube `r` across with a quilted
// ridge every `pitch`, a bound cuff at +x and laces at the shoulder end. Slots: quilt, binding, lace.
local quiltedTube(id, l, r, z, pitch) =
  local n = std.floor((l - 0.03) / pitch), x0 = -l / 2, bump = 0.006, inner = r - 0.012;
  [
    h.turned(id, 'quilt', 'x', [[0, inner], [0, r]] + std.flattenArrays([
      [[pitch * i + pitch * 0.15, r + bump], [pitch * i + pitch * 0.85, r + bump], [pitch * (i + 1), r]]
      for i in std.range(0, n - 1)
    ]) + [[l - 0.03, r], [l - 0.03, inner], [0, inner]], [x0, r + bump, z]),
    tube(id + '-cuff', 'binding', inner, r + 0.002, x0 + l - 0.03, x0 + l, r + bump, z),
  ] + [
    box(id + '-lace-%d' % i, 'lace', [x0 - 0.06, 0, z + (i - 0.5) * r - 0.003], [x0 + 0.01, 0.004, z + (i - 0.5) * r + 0.003])
    for i in [0, 1]
  ];
[
  // A pair of carpet arm guards: per arm a square of carpet rolled round the forearm, 200 mm long and 104 mm across,
  // and a wider one, 220 mm long and 120 mm across, round the upper arm, all held with duct tape, laid side by side.
  h.compound('carpet_armguards', 0.7, carpetArm(-1, true) + carpetArm(1, true), { carpet: 'carpet-pile', backing: 'jute', tape: 'tape-grey' })
  + { voxelGrain: 0.004 },

  // A pair of carpet bracers: a square of carpet rolled round each forearm, 200 mm long and 104 mm across, held with
  // duct tape, laid side by side.
  h.compound('carpet_bracers', 0.3, carpetArm(-1, false) + carpetArm(1, false), { carpet: 'carpet-pile', backing: 'jute', tape: 'tape-grey' })
  + { voxelGrain: 0.004 },

  // A pair of sheet steel arm guards laid side by side: per arm a forearm plate 220 mm long round a 50 mm radius, an
  // upper-arm plate 210 mm long round 60 mm, an elbow cop between them riveted to both, and leather straps.
  h.compound('ch_armguard_metal', 2.5, std.flattenArrays([
    platedArm('upper-%d' % s, 0.06, 75, -0.25, -0.04, s * 0.11)
    + platedArm('fore-%d' % s, 0.05, 75, 0.04, 0.26, s * 0.11)
    + [
      disc('cop-rivet-%d' % s, 'rivet', 0.006, 0.065, 0.07, 0, s * 0.11),
    ] + arc('cop-%d' % s, 'plate', 0.066, 0.004, 80, -0.05, 0.05, s * 0.11, 10) + [
      h.turned('cop-boss-%d' % s, 'plate', 'y', [[0, 0], [0, 0.03], [0.008, 0.024], [0.012, 0]], [0, 0.055, s * 0.11]),
    ]
    for s in [-1, 1]
  ]), { plate: 'steel-grey', strap: 'leather-brown', buckle: 'steel', rivet: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of sheet steel bracers laid side by side: a forearm plate 220 mm long curled round a 50 mm radius with a
  // rolled wrist edge and two leather straps.
  h.compound('ch_armguard_metal_sheets_bracer', 0.8, std.flattenArrays([
    platedArm('fore-%d' % s, 0.05, 75, -0.11, 0.11, s * 0.09)
    for s in [-1, 1]
  ]), { plate: 'steel-grey', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of sheet steel elbow cops, each a dome 110 mm across and 45 mm tall with a riveted side wing and a leather
  // strap each way, 500 mm tip to tip, laid side by side.
  h.compound('ch_armguard_metal_sheets_elbows', 0.6, std.flattenArrays([
    cop('cop-%d' % s, s * 0.08 + 0.03, 0, 0.055, 0.045) + [
      box('strap-a-%d' % s, 'strap', [s * 0.08 + 0.015, 0, -0.25], [s * 0.08 + 0.045, 0.003, -0.05]),
      box('strap-b-%d' % s, 'strap', [s * 0.08 + 0.015, 0, 0.05], [s * 0.08 + 0.045, 0.003, 0.25]),
      box('buckle-%d' % s, 'buckle', [s * 0.08 + 0.012, 0, 0.2], [s * 0.08 + 0.048, 0.006, 0.212]),
    ]
    for s in [-1, 1]
  ]), { plate: 'steel-grey', strap: 'leather-brown', buckle: 'steel', rivet: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of sheet steel pauldrons laid side by side, crown up: per shoulder a cap 190 mm across and four
  // overlapping lames stepping down the upper arm, 260 mm long in all, with a leather strap off the crown.
  h.compound('ch_armguard_metal_sheets_shoulders', 1.7, std.flattenArrays([
    arc('cap-%d' % s, 'plate', 0.095, 0.003, 70, -0.14, -0.05, s * 0.12)
    + arc('rim-%d' % s, 'plate', 0.095, 0.008, 70, -0.14, -0.13, s * 0.12, 8, -0.095 * std.cos(70 * std.pi / 180)) + std.flattenArrays([
      arc('lame-%d-%d' % [s, i], 'plate', 0.095 - i * 0.008, 0.003, 70 - i * 3, -0.06 + i * 0.045, -0.06 + i * 0.045 + 0.055, s * 0.12, 8, -(0.095 - i * 0.008) * std.cos((70 - i * 3) * std.pi / 180) - i * 0.003)
      for i in std.range(0, 3)
    ]) + [

      box('strap-%d' % s, 'strap', [-0.26, 0, s * 0.12 - 0.015], [-0.15, 0.003, s * 0.12 + 0.015]),
      box('strap-drop-%d' % s, 'strap', [-0.15, 0, s * 0.12 - 0.015], [-0.147, 0.073, s * 0.12 + 0.015]),
      box('strap-over-%d' % s, 'strap', [-0.15, 0.07, s * 0.12 - 0.015], [-0.07, 0.073, s * 0.12 + 0.015]),
      box('buckle-%d' % s, 'buckle', [-0.25, 0, s * 0.12 - 0.018], [-0.238, 0.006, s * 0.12 + 0.018]),
    ]
    for s in [-1, 1]
  ]), { plate: 'steel-grey', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of chainmail sleeves laid flat side by side, 560 mm long, 170 mm across at the shoulder and 110 mm at the
  // wrist, ridged where the rows of rings lie, joined at the shoulders by a leather strap.
  h.compound('chainmail_sleeves', 4.5, std.flattenArrays([
    flatSleeve('sleeve-%d' % s, 'mail', 0.56, 0.17, 0.11, 0.008, s * 0.1)
    + ridges('rings-%d' % s, 'mail', 0.56, 0.17, 0.11, 0.008, s * 0.1, 0.012, 0.006, 0.004)
    + [h.prism('cuff-%d' % s, 'mail', 'y', [[s * 0.1 - 0.058, 0.25], [s * 0.1 + 0.058, 0.25], [s * 0.1 + 0.055, 0.28], [s * 0.1 - 0.055, 0.28]], 0, 0.014)]
    for s in [-1, 1]
  ]) + [
    box('strap', 'strap', [-0.27, 0.008, -0.13], [-0.24, 0.012, 0.13]),
    box('strap-buckle', 'buckle', [-0.272, 0.008, -0.01], [-0.238, 0.016, 0.01]),
  ], { mail: 'steel-grey', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of padded cotton sleeves laid flat side by side, 560 mm long, 180 mm across at the shoulder and 120 mm at
  // the cuff, with rag padding stitched on in rows.
  h.compound('cloth_arms_padded', 0.29, std.flattenArrays([
    quiltedSleeve('sleeve-%d' % s, 0.56, 0.18, 0.12, 0.012, s * 0.105, 0.07)
    for s in [-1, 1]
  ]), { cloth: 'cloth-cotton', quilt: 'cloth-rag', lace: 'cloth-white' })
  + { voxelGrain: 0.004 },

  // A pair of elbow pads laid side by side: each a fabric sleeve 120 mm long and 100 mm across with a moulded
  // plastic cap 90 mm across on top.
  h.compound('elbow_pads', 0.18, std.flattenArrays([
    [
      tube('sleeve-%d' % s, 'cloth', 0.038, 0.048, -0.06, 0.06, 0.048, s * 0.065),
      tube('hem-a-%d' % s, 'hem', 0.04, 0.05, -0.06, -0.052, 0.048, s * 0.065),
      tube('hem-b-%d' % s, 'hem', 0.04, 0.05, 0.052, 0.06, 0.048, s * 0.065),
      h.turned('cap-dome-%d' % s, 'cap', 'y', [[0, 0], [0, 0.03], [0.008, 0.026], [0.014, 0.016], [0.016, 0]], [0, 0.1, s * 0.065]),
    ] + arc('cap-%d' % s, 'cap', 0.048, 0.008, 55, -0.045, 0.045, s * 0.065, 8, 0.048)
    for s in [-1, 1]
  ]), { cloth: 'cloth-charcoal', hem: 'webbing-black', cap: 'plastic-grey' })
  + { voxelGrain: 0.004 },

  // A pair of gambeson sleeves lying side by side, each 580 mm long and padded so thick it keeps its round, 120 mm
  // across, quilted in rings, with laces at the shoulder to tie it to a gambeson.
  h.compound('gambeson_sleeve', 1, std.flattenArrays([
    quiltedTube('sleeve-%d' % s, 0.58, 0.055, s * 0.07, 0.045)
    for s in [-1, 1]
  ]), { quilt: 'cloth-canvas', binding: 'cloth-rag-shadow', lace: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A pair of tyre arm guards laid side by side: per arm a curved chunk of tread 200 mm long round the forearm and
  // one 220 mm long round the upper arm, wound with duct tape.
  h.compound('improvised_armguard_tire', 1.2, std.flattenArrays([
    arc('fore-%d' % s, 'rubber', 0.05, 0.01, 110, 0.01, 0.21, s * 0.1)
    + arc('upper-%d' % s, 'rubber', 0.058, 0.01, 110, -0.23, -0.01, s * 0.1)
    + std.flattenArrays([
      arc('tread-%d-%d' % [s, i], 'rubber', 0.068, 0.007, 40, -0.225 + i * 0.03, -0.225 + i * 0.03 + 0.016, s * 0.1, 4, -0.058 * std.cos(110 * std.pi / 180))
      for i in std.range(0, 6)
    ] + [
      arc('tread-f-%d-%d' % [s, i], 'rubber', 0.06, 0.007, 40, 0.015 + i * 0.03, 0.015 + i * 0.03 + 0.016, s * 0.1, 4, -0.05 * std.cos(110 * std.pi / 180))
      for i in std.range(0, 5)
    ])
    + std.flattenArrays([
      arc('tape-%d-%d' % [s, i], 'tape', p[0] + 0.017, 0.002, 112, p[1], p[1] + 0.035, s * 0.1, 8, -p[0] * std.cos(110 * std.pi / 180))
      for i in std.range(0, 3)
      for p in [[[0.058, -0.21], [0.058, -0.07], [0.05, 0.025], [0.05, 0.16]][i]]
    ])
    for s in [-1, 1]
  ]), { rubber: 'rubber-black', tape: 'tape-grey' })
  + { voxelGrain: 0.004 },
]
