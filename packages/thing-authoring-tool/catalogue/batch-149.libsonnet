local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;
local tube = h.tube;
local disc = h.disc;

// Leg armour and work trousers. Pairs of guards lie side by side along z, each leg running along x from the hip end at
// -x to the ankle end at +x, plates crown up as they rest on a floor. Trousers fold on h.foldedGarment with the
// waistband at +z; chaps lie flat, outside up, waist belt at +z.

// A curved plate lying along x from x0 to x1, crown up, long edges on the floor: an arc of inner radius `r` and
// thickness `t` spanning `a` degrees either side of the top round an axis at depth z, from `n` flat facets because a
// prism must be convex. `y` sets the axis height; by default the edges rest at y = 0.
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

// Two buckled straps over an arc plate of radius r and thickness t, at fractions `fs` of its length, their tails
// running out across the floor on the +z side.
local straps(id, r, t, a, x0, x1, z, fs=[0.2, 0.75], w=0.022) = std.flattenArrays([
  local xs = x0 + (x1 - x0) * f, yc = -r * std.cos(a * std.pi / 180), side = z + (r + t) * std.sin(a * std.pi / 180);
  arc('%s-strap-%d' % [id, f * 100], 'strap', r + t, 0.002, a, xs, xs + w, z, 8, yc) + [
    box('%s-tail-%d' % [id, f * 100], 'strap', [xs, 0, side], [xs + w, 0.003, side + 0.07]),
    box('%s-buckle-%d' % [id, f * 100], 'buckle', [xs - 0.002, 0, side], [xs + w + 0.002, 0.006, side + 0.012]),
  ]
  for f in fs
]);

// A plated leg guard lying crown up along x at depth z: a thigh plate from the hip end, a domed knee cop and a shin
// plate to the ankle, each strapped twice. `n` facets per plate; a crude guard takes few. Any part may be left off.
local plateLeg(p, z, o) =
  local c = { thigh: true, shin: true, knee: true, n: 8, tr: 0.08, sr: 0.065, a: 70, t: 0.003, x0: -0.3, x1: 0.3, rivets: false } + o;
  (if c.thigh then arc(p + 'thigh', 'plate', c.tr, c.t, c.a, c.x0, -0.05, z, c.n) + straps(p + 'thigh', c.tr, c.t, c.a, c.x0, -0.05, z) else [])
  + (if c.shin then arc(p + 'shin', 'plate', c.sr, c.t, c.a, if c.knee then 0.05 else c.x0, c.x1, z, c.n) + straps(p + 'shin', c.sr, c.t, c.a, if c.knee then 0.05 else c.x0, c.x1, z) else [])
  + (if c.knee then [
       h.dome(p + 'cop', 'plate', 0.065, 0.07, c.t, 'y', [0, 0, z], if c.n < 6 then 4 else 8),
       h.prism(p + 'wing', 'plate', 'y', [[z - 0.05, -0.055], [z - 0.05, 0.055], [z - 0.095, 0.035], [z - 0.095, -0.035]], 0, 0.004),
     ] else [])
  + (if c.rivets then [
       disc(p + 'rivet-%d' % i, 'rivet', 0.005, 0, 0.006 + c.t + c.tr * (1 - std.cos(c.a * std.pi / 180)) * 0.5, x, z + 0.045)
       for i in [0, 1]
       for x in [if i == 0 then c.x0 + 0.02 else c.x1 - 0.02]
     ] else []);

// Ridges across a flat panel tapering along x: strips `w` wide every `pitch` along x, standing `t` proud, to show
// rows of mail rings.
local ridges(id, slot, x0, x1, w0, w1, y, z, pitch, w, t) =
  local n = std.floor((x1 - x0) / pitch);
  [
    local x = x0 + pitch * (i + 0.5), half = (w0 + (w1 - w0) * (x - x0) / (x1 - x0)) / 2 - 0.004;
    box('%s-%d' % [id, i], slot, [x - w / 2, y, z - half], [x + w / 2, y + t, z + half])
    for i in std.range(0, n - 1)
  ];

// A mail legging laid flat along x at depth z, `w0` across at the thigh and `w1` at the ankle, ridged where its rows
// of rings lie. `full` adds a leather belt strap and an instep flap; otherwise the open back shows as bound edges
// with a zigzag lace.
local mailLeg(p, z, full) =
  local x0 = -0.4, x1 = 0.36, w0 = if full then 0.21 else 0.17, w1 = if full then 0.13 else 0.1, t = 0.008;
  [
    h.prism(p + 'mail', 'mail', 'y', [[z - w0 / 2, x0], [z + w0 / 2, x0], [z + w1 / 2, x1], [z - w1 / 2, x1]], 0, t),
  ]
  + ridges(p + 'rings', 'mail', x0, x1, w0, w1, t, z, 0.012, 0.006, 0.004)
  // Soft folds where the mail drapes as it lies.
  + [
    h.turned(p + 'fold-%d' % k, 'mail', 'x', [[0, 0], [0.04, 0.009], [x1 - x0 - 0.1, 0.008], [x1 - x0 - 0.04, 0]], [x0 + 0.02, t, z + k * (w1 / 2 - 0.02)])
    for k in [-1, 1]
  ]
  + (if full then [
       h.prism(p + 'instep', 'mail', 'y', [[z - w1 / 2, x1], [z + w1 / 2, x1], [z + w1 / 2 + 0.01, x1 + 0.08], [z - w1 / 2 - 0.01, x1 + 0.08]], 0, t),
       box(p + 'stirrup', 'strap', [x1 + 0.06, t, z - w1 / 2 - 0.02], [x1 + 0.08, t + 0.004, z + w1 / 2 + 0.02]),
       box(p + 'garter', 'strap', [x0 - 0.002, t, z - w0 / 2], [x0 + 0.03, t + 0.005, z + w0 / 2]),
       box(p + 'point', 'strap', [x0 - 0.12, 0, z - 0.012], [x0, 0.004, z + 0.012]),
       box(p + 'point-buckle', 'buckle', [x0 - 0.125, 0, z - 0.016], [x0 - 0.11, 0.007, z + 0.016]),
     ] else std.flattenArrays([
       [
         g.strip(p + 'edge-%d' % s, 'strap', [x0, z + s * (w0 / 2 - 0.006)], [x1, z + s * (w1 / 2 - 0.006)], t, 0.012, 0.004),
       ] + [
         local xa = x0 + 0.03 + i * 0.06, xb = xa + 0.03, za = z + s * ((w0 + (w1 - w0) * (xa - x0) / (x1 - x0)) / 2 + 0.008), zb = z + s * ((w0 + (w1 - w0) * (xb - x0) / (x1 - x0)) / 2 + 0.002);
         g.strip(p + 'lace-%d-%d' % [s, i], 'lace', [xa, za], [xb, zb], 0, 0.005, 0.004)
         for i in std.range(0, 11)
       ]
       for s in [-1, 1]
     ]));

// An arc lying along x round an axis at height yc and depth z, of inner radius r and thickness t, from angle th0 to
// th1 in degrees (0 points up, 90 to +z), in `n` facets because a prism must be convex.
local arcSpan(id, slot, r, t, th0, th1, x0, x1, yc, z, n) = [
  local a0 = (th0 + (th1 - th0) * i / n) * std.pi / 180, a1 = (th0 + (th1 - th0) * (i + 1) / n) * std.pi / 180;
  h.prism('%s-%d' % [id, i], slot, 'x', [
    [yc + r * std.cos(a0), z + r * std.sin(a0)],
    [yc + r * std.cos(a1), z + r * std.sin(a1)],
    [yc + (r + t) * std.cos(a1), z + (r + t) * std.sin(a1)],
    [yc + (r + t) * std.cos(a0), z + (r + t) * std.sin(a0)],
  ], x0, x1)
  for i in std.range(0, n - 1)
];

// A square of carpet rolled into an open tube lying along x, inner radius r0 and outer r1, its open back slit facing
// up and towards +z so the cut edges show pile over a jute backing, held by two tape bands.
local carpetRoll(id, r0, r1, x0, x1, z) =
  local gap = 50, th0 = 35 + gap / 2, th1 = 35 + 360 - gap / 2, back = 0.004;
  arcSpan(id, 'carpet', r0 + back, r1 - r0 - back, th0, th1, x0, x1, r1, z, 14)
  + arcSpan(id + '-backing', 'backing', r0, back, th0, th1, x0, x1, r1, z, 14)
  + std.flattenArrays([
    arcSpan(id + '-tape-%d' % i, 'tape', r1, 0.003, th0 - 4, th1 + 4, x, x + 0.035, r1, z, 14)
    for i in [0, 1]
    for x in [if i == 0 then x0 + 0.025 else x1 - 0.06]
  ]);

// A pair of chaps laid flat, outside up: two leg panels along z, `top` across at the thigh and `bot` at the cuff,
// joined by a waist belt at +z. Chainsaw chaps add quilted protective layers and buckled leg straps on the outer edge;
// leather chaps add a whipstitched welt down the outer edge with a zip inside it.
local chaps(o) =
  local c = { top: 0.27, bot: 0.19, len: 0.82, gap: 0.03, t: 0.008, saw: false } + o;
  local z0 = -c.len / 2, z1 = c.len / 2 - 0.05;
  std.flattenArrays([
    local cx = s * (c.gap / 2 + c.top / 2), outer = s * (c.gap / 2 + c.top), inner = s * c.gap / 2;
    local edge(zz) = cx + s * (c.top / 2 - (c.top - c.bot) * (z1 - zz) / (z1 - z0));
    [
      g.flat('panel-%d' % s, 'panel', [[inner, z1], [outer, z1], [edge(z0), z0], [edge(z0) - s * c.bot, z0]], 0, c.t),
    ]
    + (if c.saw then g.quilt({ style: 'lines', along: 'z', x0: std.min(inner, edge(z0)) + 0.025, x1: std.max(inner, edge(z0)) - 0.025, z0: z0 + 0.03, z1: z1 - 0.03, y: c.t, pitch: 0.04, prefix: 'quilt-%d' % s, slot: 'stitch' }) + std.flattenArrays([
         [
           box('leg-strap-%d-%d' % [s, i], 'strap', [std.min(edge(zz), edge(zz) + s * 0.09), 0, zz - 0.0125], [std.max(edge(zz), edge(zz) + s * 0.09), 0.004, zz + 0.0125]),
           box('leg-buckle-%d-%d' % [s, i], 'buckle', [std.min(edge(zz) + s * 0.07, edge(zz) + s * 0.09), 0, zz - 0.018], [std.max(edge(zz) + s * 0.07, edge(zz) + s * 0.09), 0.008, zz + 0.018]),
         ]
         for i in std.range(0, 3)
         for zz in [z0 + 0.08 + i * (z1 - z0 - 0.16) / 3]
       ]) + [
         box('label-%d' % s, 'label', [cx - 0.04, c.t, z1 - 0.15], [cx + 0.04, c.t + 0.003, z1 - 0.09]),
       ]
       else [
         g.strip('welt-%d' % s, 'welt', [edge(z1) - s * 0.012, z1], [edge(z0) - s * 0.012, z0], c.t, 0.026, 0.002),
         g.strip('zip-%d' % s, 'zip', [edge(z1) - s * 0.06, z1], [edge(z0) - s * 0.06, z0], c.t, 0.008, 0.003),
       ] + [
         local zz = z0 + 0.04 + i * 0.05;
         g.strip('whip-%d-%d' % [s, i], 'lace', [edge(zz) - s * 0.03, zz], [edge(zz + 0.025) + s * 0.004, zz + 0.025], c.t + 0.002, 0.008, 0.004)
         for i in std.range(0, 14)
       ])
    for s in [-1, 1]
  ]) + [
    box('belt', 'belt', [-(c.gap / 2 + c.top) - 0.03, 0, z1], [c.gap / 2 + c.top + 0.03, 0.006, z1 + 0.04]),
    box('belt-buckle', 'buckle', [-0.03, 0.006, z1 - 0.004], [0.03, 0.012, z1 + 0.044]),
  ] + (if c.saw then [] else [
         g.strip('lace-%d' % i, 'lace', [-0.02, z1 - 0.01 - i * 0.025], [0.02, z1 - 0.035 - i * 0.025], 0.006, 0.005, 0.004)
         for i in [0, 1]
       ]);

// Folded trousers on h.foldedGarment, `w` across x and `d` along z, top face at `ht`: a waistband at +z with a fly.
local trousers(w, d, ht) = h.foldedGarment(w, d, ht, 3) + [
  box('waistband', 'trim', [-w / 2, ht, d / 2 - 0.045], [w / 2, ht + 0.007, d / 2 + 0.003]),
  box('fly', 'trim', [-0.012, ht, d / 2 - 0.17], [0.012, ht + 0.005, d / 2 - 0.045]),
];

[
  // A pair of tempered steel leg guards laid side by side, crown up, each 600 mm from hip to ankle: a thigh plate
  // 250 mm long round an 80 mm radius, a domed knee cop 130 mm across with a side wing, a shin plate 250 mm long round
  // 65 mm, mail gussets at the knee and a mail fringe at the hip, each plate strapped twice.
  h.compound('qt_light_leg_guard', 3.1, std.flattenArrays([
    plateLeg(p, z, {})
    + [
      box(p + 'gusset-a', 'mail', [-0.06, 0, z + 0.05], [0.06, 0.008, z + 0.08]),
      box(p + 'gusset-b', 'mail', [-0.06, 0, z - 0.05], [0.06, 0.008, z - 0.03]),
      box(p + 'fringe', 'mail', [-0.33, 0, z - 0.065], [-0.295, 0.01, z + 0.065]),
    ]
    for p in ['l-', 'r-']
    for z in [if p == 'l-' then -0.11 else 0.11]
  ]), { plate: 'steel-heat-tint', mail: 'steel-mail', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of riot police leg guards laid side by side, crown up, each 400 mm long: a domed knee cup 130 mm across,
  // a moulded grey shin shell 260 mm long round a 55 mm radius with a black raised ridge, and a hinged black
  // instep guard, held on by two black hook-and-loop straps, the dark padding showing along its edges.
  h.compound('riot_leg_guards', 0.6, std.flattenArrays([
    [
      h.dome(p + 'knee', 'shell', 0.065, 0.055, 0.005, 'y', [-0.15, 0, z]),
      box(p + 'ridge', 'trim', [-0.08, 0.05, z - 0.006], [0.12, 0.058, z + 0.006]),
      box(p + 'hinge', 'hinge', [0.125, 0.025, z - 0.03], [0.14, 0.04, z + 0.03]),
      box(p + 'edge-a', 'pad', [-0.09, 0, z + 0.056], [0.13, 0.016, z + 0.068]),
      box(p + 'edge-b', 'pad', [-0.09, 0, z - 0.068], [0.13, 0.016, z - 0.056]),
    ]
    + arc(p + 'shin', 'shell', 0.055, 0.005, 80, -0.09, 0.13, z)
    + arc(p + 'instep', 'trim', 0.05, 0.004, 65, 0.14, 0.215, z)
    + std.flattenArrays([
      local yc = -0.055 * std.cos(80 * std.pi / 180), side = z + 0.06 * std.sin(80 * std.pi / 180);
      arc(p + 'strap-%d' % i, 'strap', 0.06, 0.002, 80, x, x + 0.03, z, 8, yc) + [
        box(p + 'tail-%d' % i, 'strap', [x, 0, side], [x + 0.03, 0.003, side + 0.08]),
        box(p + 'loop-%d' % i, 'hook', [x, 0.003, side + 0.02], [x + 0.03, 0.005, side + 0.075]),
      ]
      for i in [0, 1]
      for x in [if i == 0 then -0.06 else 0.07]
    ])
    for p in ['l-', 'r-']
    for z in [if p == 'l-' then -0.085 else 0.085]
  ]), { shell: 'plastic-grey', trim: 'plastic-matte-black', hinge: 'plastic-matte-black', pad: 'plastic-charcoal', strap: 'webbing-black', hook: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },

  // Firefighter's turnout trousers folded on a shelf, 400 mm by 360 mm and 90 mm tall: tan flame-resistant shell, two
  // reflective bands at the cuff end, a bellows cargo pocket, a black knee patch, and red braces folded over the top.
  h.compound('bunker_pants', 3.1, trousers(0.4, 0.36, 0.09) + [
    box('band-a', 'band', [-0.2, 0.09, -0.15], [0.2, 0.093, -0.125]),
    box('band-b', 'band', [-0.2, 0.09, -0.105], [0.2, 0.093, -0.08]),
    box('pocket', 'cloth', [0.04, 0.09, -0.05], [0.17, 0.106, 0.08]),
    box('pocket-flap', 'patch', [0.035, 0.106, 0.04], [0.175, 0.11, 0.085]),
    box('knee', 'patch', [-0.17, 0.09, -0.06], [-0.03, 0.095, 0.05]),
    box('hook', 'hardware', [-0.035, 0.097, 0.145], [-0.015, 0.102, 0.165]),
  ] + std.flattenArrays([
    [
      box('brace-%d' % s, 'brace', [s * 0.1 - 0.015, 0.097, -0.02], [s * 0.1 + 0.015, 0.101, 0.18]),
      box('brace-drop-%d' % s, 'brace', [s * 0.1 - 0.015, 0.0, 0.18], [s * 0.1 + 0.015, 0.101, 0.184]),
      box('brace-clip-%d' % s, 'hardware', [s * 0.1 - 0.018, 0.101, 0.0], [s * 0.1 + 0.018, 0.106, 0.025]),
    ]
    for s in [-1, 1]
  ]), { cloth: 'cloth-turnout', trim: 'cloth-turnout', band: 'reflective-yellow', patch: 'leather-black', brace: 'cloth-red', hardware: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // Grey canvas work trousers folded on a shelf, 300 mm by 400 mm and 60 mm tall, a raised layer of cotton padding
  // over the top face quilted on in diamond stitching a shade lighter than the cloth.
  h.compound('canvas_pants_padded', 1.3, trousers(0.3, 0.4, 0.06)
                                          + [box('padding', 'cloth', [-0.135, 0.06, -0.185], [0.135, 0.068, 0.135])]
                                          + g.quilt({ style: 'lattice', x0: -0.135, x1: 0.135, z0: -0.185, z1: 0.135, y: 0.068, pitch: 0.06, w: 0.004, t: 0.002, slot: 'stitch' }), { cloth: 'cloth-pants-grey', trim: 'cloth-canvas', stitch: 'felt-grey' })
  + { voxelGrain: 0.004 },

  // A pair of carpet greaves laid side by side: a square of carpet 300 mm long rolled into an open tube round each
  // shin, 128 mm across, its open back showing the pile and jute backing, held with two bands of duct tape.
  h.compound('carpet_greaves', 0.93, carpetRoll('l-shin', 0.05, 0.064, -0.15, 0.15, -0.075) + carpetRoll('r-shin', 0.05, 0.064, -0.15, 0.15, 0.075), { carpet: 'carpet-pile', backing: 'jute', tape: 'tape-grey' })
  + { voxelGrain: 0.004 },

  // A pair of carpet leg guards laid side by side: per leg an open carpet roll round the shin, 300 mm long and 128 mm
  // across, and a wider one round the thigh, 280 mm long and 170 mm across, each taped twice, open backs up.
  h.compound('carpet_legguards', 2.1, std.flattenArrays([
    carpetRoll(p + 'shin', 0.05, 0.064, 0.02, 0.32, z) + carpetRoll(p + 'thigh', 0.07, 0.085, -0.28, 0.0, z)
    for p in ['l-', 'r-']
    for z in [if p == 'l-' then -0.095 else 0.095]
  ]), { carpet: 'carpet-pile', backing: 'jute', tape: 'tape-grey' })
  + { voxelGrain: 0.004 },

  // A pair of hardened mail half-leggings laid flat side by side, 760 mm long, 170 mm across at the thigh and 100 mm
  // at the ankle, covering the front and sides only: leather-bound open edges with a zigzag lace each side.
  h.compound('ch_chainmail_half_legs', 4.7, mailLeg('l-', -0.12, false) + mailLeg('r-', 0.12, false), { mail: 'steel-mail-dark', strap: 'leather-brown', lace: 'leather-tan' })
  + { voxelGrain: 0.004 },

  // A pair of hardened mail leggings laid flat side by side, 840 mm from the belt point to the instep, 210 mm across
  // at the thigh and 130 mm at the ankle, with a leather garter and belt point at the top and a stirrup strap under
  // the open instep. The rusted junk leggings share this model.
  h.compound('ch_chainmail_legs', 6.7, mailLeg('l-', -0.13, true) + mailLeg('r-', 0.13, true), { mail: 'steel-mail-dark', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of crude hardened sheet steel leg guards laid side by side, crown up, each 600 mm from hip to ankle: a
  // thigh plate and a shin plate bent in few facets, a domed knee cop, rivets and buckled leather straps.
  h.compound('ch_legguard_metal_sheets', 3.3, std.flattenArrays([
    plateLeg(p, z, { n: 4, t: 0.004, rivets: true })
    for p in ['l-', 'r-']
    for z in [if p == 'l-' then -0.11 else 0.11]
  ]), { plate: 'steel-hardened', rivet: 'steel-bright', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of crude hardened sheet steel greaves laid side by side, crown up: a shin plate 320 mm long bent round a
  // 65 mm radius in four facets, riveted at the ends, with two buckled leather straps.
  h.compound('ch_legguard_metal_sheets_greaves', 1.6, std.flattenArrays([
    plateLeg(p, z, { n: 4, t: 0.004, thigh: false, knee: false, x0: -0.16, x1: 0.16, tr: 0.065, rivets: true })
    for p in ['l-', 'r-']
    for z in [if p == 'l-' then -0.09 else 0.09]
  ]), { plate: 'steel-hardened', rivet: 'steel-bright', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A hardened sheet steel skirt laid flat, outside up: five overlapping plates 300 mm long, each 110 mm across at
  // the belt and 130 mm at the hem with a rolled hem, riveted to a leather belt 500 mm long with a buckle.
  h.compound('ch_legguard_metal_sheets_hip', 2.6, std.flattenArrays([
    local x = i * 0.092, y0 = 0.004 * std.abs(i);
    h.curvedPlate('plate-%d' % (i + 2), 'plate', [[-0.055, 0.14], [-0.065, -0.16], [0.065, -0.16], [0.055, 0.14]], y0, 0.003, 0.3, 3, x, -0.02)
    + [
      disc('rivet-%d-%d' % [i + 2, k], 'rivet', 0.006, 0, y0 + 0.02, x + k * 0.03, 0.11)
      for k in [-1, 1]
    ] + [
      box('hem-%d' % (i + 2), 'plate', [x - 0.065, y0, -0.18], [x + 0.065, y0 + 0.012, -0.172]),
    ]
    for i in [0, -1, 1, -2, 2]
  ]) + [
    box('belt', 'belt', [-0.24, 0.0, 0.1], [0.24, 0.012, 0.14]),
    box('belt-tail', 'belt', [0.24, 0.0, 0.105], [0.27, 0.004, 0.135]),
    box('buckle', 'buckle', [-0.26, 0.0, 0.095], [-0.235, 0.016, 0.145]),
  ], { plate: 'steel-hardened', rivet: 'steel-bright', belt: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of hardened sheet steel knee guards standing dome up side by side, each a faceted cop 130 mm across and
  // 50 mm high with a wing on the outer side and a leather strap each way, 500 mm tip to tip.
  h.compound('ch_legguard_metal_sheets_knees', 0.71, std.flattenArrays([
    [
      h.dome(p + 'cop', 'plate', 0.065, 0.05, 0.004, 'y', [x, 0, 0], 4),
      h.prism(p + 'wing', 'plate', 'y', [[-0.045, x + s * 0.05], [-0.03, x + s * 0.09], [0.03, x + s * 0.09], [0.045, x + s * 0.05]], 0, 0.004),
      disc(p + 'rivet', 'rivet', 0.006, 0.045, 0.056, x, 0),
      box(p + 'strap-a', 'strap', [x - 0.012, 0, -0.25], [x + 0.012, 0.003, -0.06]),
      box(p + 'strap-b', 'strap', [x - 0.012, 0, 0.06], [x + 0.012, 0.003, 0.25]),
      box(p + 'buckle', 'buckle', [x - 0.016, 0, 0.2], [x + 0.016, 0.007, 0.212]),
    ]
    for p in ['l-', 'r-']
    for s in [if p == 'l-' then -1 else 1]
    for x in [s * 0.085]
  ]), { plate: 'steel-hardened', rivet: 'steel-bright', strap: 'leather-brown', buckle: 'steel' })
  + { voxelGrain: 0.004 },

  // A pair of orange chainsaw chaps laid flat, outside up, 820 mm long: two front panels 270 mm across at the thigh
  // and 190 mm at the cuff, quilted lengthwise through their cut-resistant layers, with four buckled leg straps each
  // and a webbing waist belt.
  h.compound('chaps_cut_resistant', 1.8, chaps({ saw: true, t: 0.012 }), { panel: 'cloth-orange', stitch: 'cloth-orange', strap: 'webbing-black', buckle: 'plastic-matte-black', belt: 'webbing-black', label: 'cloth-white' })
  + { voxelGrain: 0.004 },

  // A pair of black leather chaps laid flat, outside up, 820 mm long: two leg panels 270 mm across at the thigh and
  // 190 mm at the cuff, a tan-whipstitched welt and a zip down each outer edge, a buckled belt and a laced front.
  h.compound('chaps_leather', 2.3, chaps({ t: 0.006 }), { panel: 'leather-black', zip: 'steel-bright', welt: 'leather-charcoal', belt: 'leather-black', buckle: 'metal-silver', lace: 'leather-tan' })
  + { voxelGrain: 0.004 },
]
