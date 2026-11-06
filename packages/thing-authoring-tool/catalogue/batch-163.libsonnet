local h = import '../compound.libsonnet';
local box = h.box;
// A backpack standing on its base, front on +z and harness on -z: a body `w` wide, `ht` tall and `d` deep, a front
// pocket, padded back, two shoulder straps and a grab handle. Options: `round` gives a rounded top, `lid` a top lid
// coming `lid` down the front, `side` side pockets that deep, `hip` a hip belt, `pals` rows of webbing on the front
// pocket, `cinch` side compression straps at those heights, above any side pocket. Slots: body, pocket, back, strap, trim, webbing.
local pack(o) =
  local w = o.w, ht = o.ht, d = o.d;
  local round = std.get(o, 'round', true);
  local r = if round then d / 2 else 0;
  local pw = std.get(o, 'pw', w * 0.8), ph = std.get(o, 'ph', ht * 0.4), pd = std.get(o, 'pd', d * 0.18);
  local py = ht * 0.08;
  local side = std.get(o, 'side', 0);
  local lid = std.get(o, 'lid', 0);
  local sx = w * 0.22, sw = std.max(0.05, w * 0.15), pad = 0.012;
  [
    box('body', 'body', [-w / 2, 0, -d / 2], [w / 2, ht - r, d / 2]),
    box('pocket', 'pocket', [-pw / 2, py, d / 2], [pw / 2, py + ph, d / 2 + pd]),
    box('pocket-zip', 'trim', [-pw / 2 + 0.01, py + ph - 0.012, d / 2 + pd], [pw / 2 - 0.01, py + ph - 0.006, d / 2 + pd + 0.003]),
    box('pocket-pull', 'trim', [pw / 4, py + ph - 0.035, d / 2 + pd], [pw / 4 + 0.012, py + ph - 0.006, d / 2 + pd + 0.005]),
    box('back-pad', 'back', [-w / 2 + 0.02, ht * 0.08, -d / 2 - pad], [w / 2 - 0.02, ht * 0.85, -d / 2]),
    box('handle', 'strap', [-0.04, ht - 0.005, if round then -0.0125 else -d / 2 + 0.01], [0.04, ht + 0.02, if round then 0.0125 else -d / 2 + 0.035]),
  ]
  + (if round then [h.rod('top', 'body', r, -w / 2, w / 2, ht - r)] else [])
  + std.flattenArrays([
    [
      box('shoulder-%d' % i, 'strap', [x - sw / 2, ht * 0.3, -d / 2 - pad - 0.025], [x + sw / 2, ht * 0.9, -d / 2 - pad]),
      box('tail-%d' % i, 'trim', [x * 1.6 - 0.0125, 0.01, -d / 2 - 0.004], [x * 1.6 + 0.0125, ht * 0.3, -d / 2]),
      box('buckle-%d' % i, 'trim', [x - 0.02, ht * 0.28, -d / 2 - pad - 0.03], [x + 0.02, ht * 0.32, -d / 2 - pad - 0.022]),
    ]
    for i in [0, 1]
    for x in [[-sx, sx][i]]
  ])
  + (if lid > 0 then [
       box('lid-top', 'pocket', [-w / 2 - 0.006, ht, -d / 2], [w / 2 + 0.006, ht + 0.05, d / 2 + 0.008]),
       box('lid-front', 'pocket', [-w / 2 - 0.006, ht - lid, d / 2], [w / 2 + 0.006, ht + 0.05, d / 2 + 0.008]),
     ] + [
       box('lid-strap-%d' % i, 'trim', [x - 0.0125, ht * 0.62, d / 2], [x + 0.0125, ht - lid + 0.03, d / 2 + 0.008])
       for i in [0, 1]
       for x in [[-w * 0.3, w * 0.3][i]]
     ] else [])
  + (if side > 0 then [
       box('side-%d' % i, 'pocket', [if i == 0 then -w / 2 - side else w / 2, 0.02, -d * 0.35], [if i == 0 then -w / 2 else w / 2 + side, 0.02 + ht * 0.35, d * 0.35])
       for i in [0, 1]
     ] else [])
  + std.flattenArrays([
    [
      box('cinch-%d-%d' % [i, j], 'trim', [if i == 0 then -w / 2 - 0.004 else w / 2, y, -d / 2 + 0.01], [if i == 0 then -w / 2 else w / 2 + 0.004, y + 0.025, d / 2 - 0.01]),
      box('cinch-buckle-%d-%d' % [i, j], 'strap', [if i == 0 then -w / 2 - 0.01 else w / 2, y - 0.005, d * 0.1], [if i == 0 then -w / 2 else w / 2 + 0.01, y + 0.03, d * 0.1 + 0.035]),
    ]
    for i in [0, 1]
    for j in std.range(0, std.length(std.get(o, 'cinch', [])) - 1)
    for y in [o.cinch[j]]
  ])
  + (if std.get(o, 'hip', false) then [
       box('hip-belt', 'strap', [-w / 2 - 0.09, ht * 0.03, -d / 2 - 0.06], [w / 2 + 0.09, ht * 0.03 + 0.1, -d / 2 - pad]),
       box('hip-buckle', 'trim', [-0.03, ht * 0.03 + 0.03, -d / 2 - 0.068], [0.03, ht * 0.03 + 0.07, -d / 2 - 0.06]),
     ] else [])
  + (if std.get(o, 'pals', 0) > 0 then h.webbing('pals', 'webbing', -pw / 2, pw / 2, [py + 0.03 + k * 0.05 for k in std.range(0, o.pals - 1)], d / 2 + pd) else []);
// A small daypack's finishes per cloth.
local daypack = { w: 0.3, ht: 0.42, d: 0.15, cinch: [] };
[
  // A small nylon daypack 300 mm wide, 420 mm tall and 150 mm deep with a rounded top, a zipped front pocket and
  // two shoulder straps.
  h.compound('backpack', 0.54, pack(daypack), {
    body: 'cloth-navy',
    pocket: 'cloth-navy',
    back: 'nylon-black',
    strap: 'nylon-black',
    trim: 'plastic-matte-black',
    webbing: 'nylon-black',
  }) + { voxelGrain: 0.004 },

  // A joke backpack 750 mm wide, 1.15 m tall and 400 mm deep, a daypack blown up to nearly a person's height, with
  // oversized zip pulls and side pockets.
  h.compound('backpack_giant', 1.9, pack({ w: 0.75, ht: 1.15, d: 0.4, side: 0.08, cinch: [] }) + [
    box('giant-pull', 'trim', [-0.2, 0.44, 0.272], [-0.16, 0.54, 0.29]),
  ], {
    body: 'cloth-yellow',
    pocket: 'nylon-red',
    back: 'cloth-blue',
    strap: 'cloth-blue',
    trim: 'plastic-matte-black',
    webbing: 'cloth-blue',
  }),

  // A hunting pack 380 mm wide, 720 mm tall and 260 mm deep with a top lid, side pockets, side compression straps,
  // a padded hip belt and two lashing straps under the base for a bedroll or game bag.
  h.compound('backpack_hunting', 1.7, pack({ w: 0.38, ht: 0.72, d: 0.26, round: false, lid: 0.16, side: 0.06, hip: true, cinch: [0.3, 0.48] }) + [
    box('lash-%d' % i, 'trim', [x - 0.0125, 0, 0.13], [x + 0.0125, 0.06, 0.2])
    for i in [0, 1]
    for x in [[-0.12, 0.12][i]]
  ], {
    body: 'nylon-coyote',
    pocket: 'cloth-brown',
    back: 'nylon-black',
    strap: 'cloth-brown',
    trim: 'plastic-matte-black',
    webbing: 'cloth-brown',
  }),

  // A large squared tactical pack 360 mm wide, 600 mm tall and 250 mm deep, its front pocket under four rows of
  // attachment webbing, with compression straps and a hip belt.
  h.compound('backpack_tactical_large', 2.3, pack({ w: 0.36, ht: 0.6, d: 0.25, round: false, ph: 0.3, pd: 0.06, pals: 4, hip: true, cinch: [0.2, 0.42] }), {
    body: 'cloth-olive-drab',
    pocket: 'cloth-olive-drab',
    back: 'webbing-olive-dark',
    strap: 'webbing-olive-dark',
    trim: 'plastic-matte-black',
    webbing: 'webbing-olive-dark',
  }),

  // A high-volume leather rucksack 420 mm wide, 820 mm tall and 300 mm deep with a deep lid, side pockets, three
  // rows of compression straps and a hip belt.
  h.compound('bigback', 6.7, pack({ w: 0.42, ht: 0.82, d: 0.3, round: false, lid: 0.2, side: 0.07, hip: true, cinch: [0.34, 0.5, 0.66] }), {
    body: 'leather-brown',
    pocket: 'leather-chestnut',
    back: 'leather-black',
    strap: 'leather-black',
    trim: 'brass-dull',
    webbing: 'leather-black',
  }),

  // A flat nylon wallet pouch 120 mm by 90 mm and 15 mm thick, zipped across its top, sewn on an ankle band 300 mm
  // long and 60 mm wide with a hook-and-loop patch at one end, laid flat.
  h.compound('ankle_wallet_pouch', 0.052, [
    box('band', 'band', [-0.15, 0, -0.03], [0.15, 0.003, 0.03]),
    box('patch', 'patch', [0.1, 0.003, -0.028], [0.148, 0.005, 0.028]),
    box('pouch', 'pouch', [-0.06, 0.003, -0.045], [0.06, 0.018, 0.045]),
    box('zip', 'zip', [-0.055, 0.018, 0.03], [0.055, 0.0195, 0.034]),
    box('pull', 'zip', [0.035, 0.018, 0.034], [0.042, 0.02, 0.046]),
  ], { band: 'cloth-charcoal', patch: 'hook-loop-grey', pouch: 'nylon-black', zip: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },

  // An armband pouch laid flat: a canvas pouch 120 mm by 90 mm and 35 mm deep with a flap, on a webbing strap
  // 400 mm long and 40 mm wide with a plastic side-release buckle.
  h.compound('armrig', 0.1, [
    box('band', 'band', [-0.2, 0, -0.02], [0.17, 0.003, 0.02]),
    box('buckle-a', 'buckle', [0.17, 0, -0.024], [0.19, 0.008, 0.024]),
    box('buckle-b', 'buckle', [0.19, 0.001, -0.016], [0.2, 0.006, 0.016]),
    box('pouch', 'pouch', [-0.06, 0.003, -0.045], [0.06, 0.035, 0.045]),
    box('flap-top', 'flap', [-0.062, 0.035, -0.047], [0.062, 0.038, 0.047]),
    box('flap-front', 'flap', [-0.062, 0.012, 0.045], [0.062, 0.038, 0.048]),
    box('flap-patch', 'buckle', [-0.015, 0.016, 0.048], [0.015, 0.03, 0.05]),
  ], { band: 'webbing-black', buckle: 'plastic-matte-black', pouch: 'cloth-canvas', flap: 'cloth-canvas' })
  + { voxelGrain: 0.004 },

  // An L-shaped pack frame 500 mm wide and 1 m tall of squared timber with a load shelf 320 mm deep at its foot,
  // three cross rails, two leather load straps across its face and leather shoulder straps behind.
  h.compound('bigframe_pack', 5.5, [
    box('upright-%d' % i, 'frame', [x - 0.022, 0, -0.022], [x + 0.022, 1.0, 0.022])
    for i in [0, 1]
    for x in [[-0.23, 0.23][i]]
  ] + [
    box('rail-%d' % i, 'frame', [-0.208, y, -0.018], [0.208, y + 0.04, 0.018])
    for i in [0, 1, 2]
    for y in [[0.3, 0.6, 0.9][i]]
  ] + [
    box('shelf', 'frame', [-0.25, 0, 0.022], [0.25, 0.03, 0.32]),
    box('shelf-lip', 'frame', [-0.25, 0.03, 0.3], [0.25, 0.06, 0.32]),
  ] + [
    h.prism('brace-%d' % i, 'frame', 'x', [[0.03, 0.022], [0.03, 0.2], [0.05, 0.2], [0.24, 0.022]], x - 0.015, x + 0.015)
    for i in [0, 1]
    for x in [[-0.23, 0.23][i]]
  ] + [
    box('load-strap-%d' % i, 'strap', [-0.26, y, 0.022], [0.26, y + 0.04, 0.028])
    for i in [0, 1]
    for y in [[0.42, 0.72][i]]
  ] + [
    box('buckle-%d' % i, 'buckle', [0.12, y - 0.005, 0.028], [0.16, y + 0.045, 0.034])
    for i in [0, 1]
    for y in [[0.42, 0.72][i]]
  ] + std.flattenArrays([
    [
      box('shoulder-%d' % i, 'strap', [x - 0.03, 0.4, -0.05], [x + 0.03, 0.95, -0.022]),
      box('shoulder-foot-%d' % i, 'strap', [x - 0.02, 0.32, -0.03], [x + 0.02, 0.4, -0.022]),
    ]
    for i in [0, 1]
    for x in [[-0.11, 0.11][i]]
  ]), { frame: 'wood-pine', strap: 'leather-brown', buckle: 'iron-dull' }),

  // A trapper's pack 460 mm wide, 820 mm tall and 340 mm deep: waxed canvas stretched round a pole frame whose
  // corner posts stand proud, gathered at the top by a drawstring, with canvas shoulder straps behind.
  h.compound('bigtrapper_pack', 3.5, [
    box('body', 'cloth', [-0.22, 0.03, -0.16], [0.22, 0.72, 0.16]),
    h.prism('shoulder-in', 'cloth', 'x', [[0.72, -0.16], [0.72, 0.16], [0.8, 0.1], [0.8, -0.1]], -0.22, 0.22),
    h.prism('gather', 'cloth', 'z', [[-0.22, 0.72], [0.22, 0.72], [0.12, 0.8], [-0.12, 0.8]], -0.1, 0.1),
    box('neck', 'cloth', [-0.1, 0.8, -0.07], [0.1, 0.86, 0.07]),
    box('cord-ring', 'cord', [-0.105, 0.81, -0.075], [0.105, 0.822, 0.075]),
    box('cord-tail-a', 'cord', [0.02, 0.6, 0.075], [0.028, 0.82, 0.083]),
    box('cord-tail-b', 'cord', [0.04, 0.63, 0.075], [0.048, 0.82, 0.083]),
    box('toggle', 'frame', [0.015, 0.6, 0.083], [0.055, 0.615, 0.093]),
  ] + [
    box('post-%d-%d' % [i, j], 'frame', [x - 0.018, 0, z - 0.018], [x + 0.018, 0.74, z + 0.018])
    for i in [0, 1]
    for j in [0, 1]
    for x in [[-0.22, 0.22][i]]
    for z in [[-0.16, 0.16][j]]
  ] + [
    box('foot-rail-%d' % j, 'frame', [-0.22, 0, z - 0.016], [0.22, 0.03, z + 0.016])
    for j in [0, 1]
    for z in [[-0.16, 0.16][j]]
  ] + [
    box('shoulder-%d' % i, 'strap', [x - 0.03, 0.25, -0.2], [x + 0.03, 0.7, -0.178])
    for i in [0, 1]
    for x in [[-0.1, 0.1][i]]
  ], { cloth: 'canvas-grey', cord: 'cord-cotton', frame: 'wood-oak', strap: 'cloth-canvas' }),

  // A bindle lying on the ground: a cotton cloth 250 mm across tied into a bundle on the end of a stick 1 m long,
  // whose other end rests on the floor.
  h.compound('bindle', 0.88, [
    { id: 'bundle', slot: 'cloth', kind: 'turned', axis: 'y', profile: [[0, 0], [0, 0.07], [0.03, 0.115], [0.09, 0.13], [0.15, 0.11], [0.2, 0.05], [0.21, 0]], origin: [0.36, 0, 0] },
    box('knot', 'cloth', [0.33, 0.2, -0.03], [0.39, 0.24, 0.03]),
    h.prism('ear-a', 'cloth', 'z', [[0.33, 0.22], [0.36, 0.24], [0.3, 0.29], [0.28, 0.27]], -0.015, 0.015),
    h.prism('ear-b', 'cloth', 'z', [[0.36, 0.24], [0.39, 0.22], [0.44, 0.27], [0.42, 0.29]], -0.015, 0.015),
    h.prism('stick', 'stick', 'z', [[-0.6, 0], [-0.6, 0.024], [0.45, 0.255], [0.45, 0.231]], -0.012, 0.012),
  ], { cloth: 'cloth-red', stick: 'wood-oak' })
  + { handling: h.gripOn('bindle', 'stick') },

  // A leather book strap laid flat: two straps 25 mm wide crossed under a stiff leather carrying handle 120 mm long,
  // one buckled into a loop 300 mm long and 160 mm across, the other into a loop 200 mm long and 120 mm across.
  h.compound('bookstrap', 0.13, h.strapLoop('long', 'strap', 0.14, 0.08, 0.025, 0.004, 0) + [
    box('cross-left', 'strap', [-0.1, 0.004, -0.06], [-0.075, 0.008, 0.06]),
    box('cross-right', 'strap', [0.075, 0.004, -0.06], [0.1, 0.008, 0.06]),
    box('cross-near', 'strap', [-0.1, 0.004, 0.0475], [0.1, 0.008, 0.0725]),
    box('cross-far', 'strap', [-0.1, 0.004, -0.0725], [0.1, 0.008, -0.0475]),
    box('buckle', 'buckle', [-0.02, 0.004, 0.068], [0.01, 0.009, 0.1]),
    box('buckle-2', 'buckle', [0.07, 0.008, -0.015], [0.105, 0.013, 0.015]),
    box('handle-plate', 'handle', [-0.06, 0.008, -0.015], [0.06, 0.012, 0.015]),
    box('handle-post-a', 'handle', [-0.06, 0.012, -0.012], [-0.045, 0.03, 0.012]),
    box('handle-post-b', 'handle', [0.045, 0.012, -0.012], [0.06, 0.03, 0.012]),
    h.rod('handle-grip', 'handle', 0.01, -0.06, 0.06, 0.035),
  ], { strap: 'leather-tan', buckle: 'brass-dull', handle: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A wooden box 320 mm wide, 380 mm tall and 200 mm deep made into a pack: plank sides with corner battens, a
  // hinged lid with a hasp, and two rope loops tied to its back for shoulder straps.
  h.compound('boxpack', 3.5, [
    box('box', 'wood', [-0.16, 0, -0.1], [0.16, 0.37, 0.1]),
    box('lid', 'wood', [-0.165, 0.37, -0.105], [0.165, 0.39, 0.105]),
    box('hasp', 'iron', [-0.015, 0.33, 0.1], [0.015, 0.385, 0.104]),
    box('hinge-a', 'iron', [-0.12, 0.35, -0.104], [-0.08, 0.385, -0.1]),
    box('hinge-b', 'iron', [0.08, 0.35, -0.104], [0.12, 0.385, -0.1]),
  ] + [
    box('seam-%d' % i, 'batten', [-0.16, y, 0.1], [0.16, y + 0.004, 0.102])
    for i in [0, 1]
    for y in [[0.12, 0.245][i]]
  ] + [
    box('batten-%d-%d' % [i, j], 'batten', [x - 0.012, 0, z - 0.012], [x + 0.012, 0.37, z + 0.012])
    for i in [0, 1]
    for j in [0, 1]
    for x in [[-0.155, 0.155][i]]
    for z in [[-0.095, 0.095][j]]
  ] + std.flattenArrays([
    [
      box('rope-%d' % i, 'rope', [x - 0.008, 0.04, -0.15], [x + 0.008, 0.33, -0.134]),
      box('rope-top-%d' % i, 'rope', [x - 0.008, 0.33, -0.15], [x + 0.008, 0.346, -0.1]),
      box('rope-foot-%d' % i, 'rope', [x - 0.008, 0.024, -0.15], [x + 0.008, 0.04, -0.1]),
      box('knot-%d' % i, 'rope', [x - 0.016, 0.32, -0.12], [x + 0.016, 0.355, -0.1]),
    ]
    for i in [0, 1]
    for x in [[-0.09, 0.09][i]]
  ]), { wood: 'wood-pine', batten: 'wood-oak', iron: 'iron-dull', rope: 'jute' }),

  // A hard-shell briefcase 460 mm long, 340 mm tall and 110 mm thick standing on its long edge: two shells meeting at
  // a raised seam, a carrying handle on top, two latches and four feet.
  h.compound('briefcase', 1.9, [
    box('shell', 'shell', [-0.23, 0.006, -0.055], [0.23, 0.346, 0.055]),
    box('seam-top', 'seam', [-0.232, 0.344, -0.006], [0.232, 0.349, 0.006]),
    box('seam-left', 'seam', [-0.233, 0.006, -0.006], [-0.228, 0.349, 0.006]),
    box('seam-right', 'seam', [0.228, 0.006, -0.006], [0.233, 0.349, 0.006]),
    box('handle-post-a', 'handle', [-0.07, 0.346, -0.012], [-0.052, 0.366, 0.012]),
    box('handle-post-b', 'handle', [0.052, 0.346, -0.012], [0.07, 0.366, 0.012]),
    h.rod('handle-grip', 'handle', 0.012, -0.07, 0.07, 0.374),
  ] + [
    box('latch-%d' % i, 'metal', [x - 0.018, 0.322, 0.04], [x + 0.018, 0.35, 0.059])
    for i in [0, 1]
    for x in [[-0.15, 0.15][i]]
  ] + [
    box('foot-%d' % i, 'handle', [x - 0.012, 0, -0.03], [x + 0.012, 0.006, 0.03])
    for i in [0, 1]
    for x in [[-0.18, 0.18][i]]
  ], { shell: 'plastic-charcoal', seam: 'steel-grey', handle: 'plastic-black', metal: 'metal-silver' })
  + { handling: h.gripOn('briefcase', 'handle-grip') },
]
