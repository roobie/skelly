local h = import '../compound.libsonnet';
local box = h.box;

// An arch of `n` quads in the x-y plane, centre (cx, cy), radii r0 to r1, from angle a0 to a1 in degrees (0 is +x,
// 90 is up), `z0` to `z1` thick: bag handles, a basket bail, a sling strap.
local arch(prefix, slot, cx, cy, r0, r1, a0, a1, n, z0, z1) =
  local p(r, i) = local a = (a0 + (a1 - a0) * i / n) * std.pi / 180; [cx + r * std.cos(a), cy + r * std.sin(a)];
  [
    h.prism('%s-%d' % [prefix, i], slot, 'z', [p(r1, i), p(r1, i + 1), p(r0, i + 1), p(r0, i)], z0, z1)
    for i in std.range(0, n - 1)
  ];

// A soft long-gun case lying on the floor, butt end at -x, tapering toward the muzzle end at +x, outside face up.
// `pockets` lists accessory pocket centres along x; `handle` adds a carry handle at the balance point. A shoulder
// strap lies alongside on the near (+z) side, clipped to rings at both ends. Slots: case, trim, pocket, strap, metal.
local rifleCase(id, massKg, L, W, T, pockets, handle, finish) = h.compound(id, massKg, [
  h.prism('case', 'case', 'y', [[-W / 2, -L / 2], [W / 2, -L / 2], [W * 0.36, L / 2], [-W * 0.36, L / 2]], 0, T),
  h.prism('crown', 'case', 'y', [[-W / 2 + 0.02, -L / 2 + 0.02], [W / 2 - 0.02, -L / 2 + 0.02], [W * 0.36 - 0.02, L / 2 - 0.02], [-W * 0.36 + 0.02, L / 2 - 0.02]], T, T + 0.012),
  // Edge binding round the zip.
  box('bind-butt', 'trim', [-L / 2 - 0.004, 0, -W / 2 - 0.002], [-L / 2 + 0.004, T + 0.004, W / 2 + 0.002]),
  box('bind-muzzle', 'trim', [L / 2 - 0.004, 0, -W * 0.36 - 0.002], [L / 2 + 0.004, T + 0.004, W * 0.36 + 0.002]),
  h.prism('bind-near', 'trim', 'y', [[W / 2 - 0.004, -L / 2], [W / 2 + 0.003, -L / 2], [W * 0.36 + 0.003, L / 2], [W * 0.36 - 0.004, L / 2]], T * 0.45, T * 0.6),
  h.prism('bind-far', 'trim', 'y', [[-W / 2 - 0.003, -L / 2], [-W / 2 + 0.004, -L / 2], [-W * 0.36 + 0.004, L / 2], [-W * 0.36 - 0.003, L / 2]], T * 0.45, T * 0.6),
  // Strap rings and the strap lying beside the case.
  box('ring-butt', 'metal', [-L / 2 + 0.03, T * 0.3, W / 2 - 0.01], [-L / 2 + 0.06, T * 0.6, W / 2 + 0.012]),
  box('ring-muzzle', 'metal', [L / 2 - 0.08, T * 0.3, W * 0.36 - 0.006], [L / 2 - 0.05, T * 0.6, W * 0.36 + 0.016]),
  box('strap', 'strap', [-L / 2 + 0.06, 0, W / 2 + 0.03], [L / 2 - 0.08, 0.004, W / 2 + 0.068]),
  box('strap-pad', 'strap', [-0.12, 0, W / 2 + 0.02], [0.12, 0.012, W / 2 + 0.078]),
  box('strap-end-butt', 'strap', [-L / 2 + 0.04, 0, W / 2 + 0.008], [-L / 2 + 0.06, 0.004, W / 2 + 0.068]),
  box('strap-end-muzzle', 'strap', [L / 2 - 0.08, 0, W * 0.36 + 0.012], [L / 2 - 0.06, 0.004, W / 2 + 0.068]),
  box('clip-butt', 'metal', [-L / 2 + 0.06, 0, W / 2 + 0.03], [-L / 2 + 0.09, 0.01, W / 2 + 0.068]),
  box('clip-muzzle', 'metal', [L / 2 - 0.11, 0, W / 2 + 0.03], [L / 2 - 0.08, 0.01, W / 2 + 0.068]),
  box('buckle', 'metal', [0.2, 0, W / 2 + 0.026], [0.235, 0.008, W / 2 + 0.072]),
] + std.flattenArrays([
  [
    box('pocket-%d' % i, 'pocket', [pockets[i] - 0.11, T + 0.012, -W * 0.3], [pockets[i] + 0.11, T + 0.032, W * 0.3]),
    box('pocket-flap-%d' % i, 'trim', [pockets[i] + 0.06, T + 0.032, -W * 0.3 - 0.003], [pockets[i] + 0.112, T + 0.036, W * 0.3 + 0.003]),
    box('pocket-tab-%d' % i, 'strap', [pockets[i] + 0.04, T + 0.036, -0.012], [pockets[i] + 0.1, T + 0.04, 0.012]),
  ]
  for i in std.range(0, std.length(pockets) - 1)
]) + (if handle then [
  box('handle-grip', 'strap', [0.02, T + 0.03, -0.018], [0.16, T + 0.042, 0.018]),
  box('handle-post-a', 'strap', [0.02, T + 0.012, -0.018], [0.035, T + 0.042, 0.018]),
  box('handle-post-b', 'strap', [0.145, T + 0.012, -0.018], [0.16, T + 0.042, 0.018]),
] else []), finish);

[
  // A structured leather handbag 280 mm wide at the base, 190 mm tall and 100 mm deep, its top narrower, with a
  // front flap and gold clasp, two rolled handles and gold feet.
  h.compound('purse', 0.31, [
    h.prism('body', 'body', 'z', [[-0.14, 0.006], [0.14, 0.006], [0.115, 0.19], [-0.115, 0.19]], -0.05, 0.05),
    h.prism('flap', 'flap', 'z', [[-0.122, 0.11], [0.122, 0.11], [0.117, 0.192], [-0.117, 0.192]], 0.05, 0.055),
    box('flap-top', 'flap', [-0.117, 0.19, -0.02], [0.117, 0.195, 0.055]),
    box('clasp', 'metal', [-0.016, 0.1, 0.053], [0.016, 0.126, 0.06]),
    box('clasp-bar', 'metal', [-0.006, 0.126, 0.054], [0.006, 0.14, 0.058]),
  ] + arch('handle-front', 'flap', 0, 0.19, 0.068, 0.078, 0, 180, 8, 0.02, 0.03)
  + arch('handle-back', 'body', 0, 0.19, 0.068, 0.078, 0, 180, 8, -0.03, -0.02) + [
    box('tab-fl', 'metal', [-0.078, 0.185, 0.018], [-0.066, 0.196, 0.032]),
    box('tab-fr', 'metal', [0.066, 0.185, 0.018], [0.078, 0.196, 0.032]),
    box('tab-bl', 'metal', [-0.078, 0.185, -0.032], [-0.066, 0.196, -0.018]),
    box('tab-br', 'metal', [0.066, 0.185, -0.032], [0.078, 0.196, -0.018]),
  ] + [
    h.disc('foot-%d' % i, 'metal', 0.006, 0, 0.006, x, z)
    for i in std.range(0, 3)
    for x in [if i % 2 == 0 then -0.11 else 0.11]
    for z in [if i < 2 then -0.035 else 0.035]
  ], { body: 'leather-oxblood', flap: 'leather-oxblood', metal: 'metal-gold' })
  + { voxelGrain: 0.004 },

  // A makeshift rag pouch: a sack of sewn scraps 190 mm across and 230 mm tall, drawn shut with a cord under a
  // frilled mouth, with mismatched patches and a cloth shoulder strap lying in a loop behind it.
  h.compound('ragpouch', 0.15, [
    h.turned('sack', 'cloth', 'y', [[0, 0], [0, 0.07], [0.02, 0.09], [0.12, 0.095], [0.165, 0.06], [0.185, 0.026], [0.195, 0.026], [0.21, 0.04], [0.225, 0.05], [0.228, 0]]),
    h.turned('draw', 'cord', 'y', [[0, 0], [0, 0.03], [0.012, 0.03], [0.012, 0]], [0, 0.183, 0]),
    box('tie-a', 'cord', [0.0, 0.14, 0.024], [0.006, 0.19, 0.03]),
    box('tie-b', 'cord', [0.012, 0.15, 0.022], [0.018, 0.19, 0.028]),
    box('patch-a', 'patch-a', [-0.055, 0.05, 0.072], [0.01, 0.11, 0.096]),
    box('patch-b', 'patch-b', [0.02, 0.09, 0.07], [0.07, 0.14, 0.094]),
    box('patch-c', 'patch-b', [-0.096, 0.07, -0.03], [-0.07, 0.12, 0.02]),
    box('seam', 'cord', [-0.003, 0.012, 0.09], [0.003, 0.05, 0.097]),
  ] + h.strapLoop('strap', 'strap', 0.22, 0.05, 0.03, 0.004, 0, 0, -0.16), {
    cloth: 'cloth-brown', cord: 'cord-cotton', 'patch-a': 'cloth-khaki', 'patch-b': 'cloth-cream', strap: 'cloth-khaki',
  }) + { voxelGrain: 0.004 },

  // A padded canvas rifle case 1.12 m long, 280 mm wide at the butt and 70 mm thick, with one accessory pocket, a
  // carry handle and a shoulder strap.
  rifleCase('rifle_case_soft', 0.56, 1.12, 0.28, 0.06, [-0.3], true, {
    case: 'cloth-olive-drab', trim: 'webbing-olive-dark', pocket: 'cloth-olive-drab', strap: 'webbing-black', metal: 'plastic-matte-black',
  }),

  // A padded canvas case for two rifles, 1.16 m long, 340 mm wide and 100 mm thick, with three accessory pockets
  // in a row and a shoulder strap.
  rifleCase('rifle_case_soft_2', 0.7, 1.16, 0.34, 0.09, [-0.36, -0.1, 0.16], false, {
    case: 'cloth-khaki', trim: 'webbing-black', pocket: 'cloth-khaki', strap: 'webbing-black', metal: 'plastic-matte-black',
  }),

  // A leather rifle case 1.12 m long, 280 mm wide and 70 mm thick, with one pocket, a handle and a strap.
  rifleCase('rifle_case_soft_leather', 1.6, 1.12, 0.28, 0.06, [-0.3], true, {
    case: 'leather-tan', trim: 'leather-chestnut', pocket: 'leather-tan', strap: 'leather-chestnut', metal: 'brass-dull',
  }),

  // A leather case for two rifles, 1.16 m long, 340 mm wide and 100 mm thick, with three pockets and a strap.
  rifleCase('rifle_case_soft_leather_2', 2.1, 1.16, 0.34, 0.09, [-0.36, -0.1, 0.16], false, {
    case: 'leather-chestnut', trim: 'leather-black', pocket: 'leather-chestnut', strap: 'leather-black', metal: 'brass-dull',
  }),

  // An extra-long leather rifle case 1.34 m long, 280 mm wide and 70 mm thick, for long-barrelled rifles.
  rifleCase('rifle_case_xl_soft_leather', 1.7, 1.34, 0.28, 0.06, [-0.4], true, {
    case: 'leather-oxblood', trim: 'leather-black', pocket: 'leather-oxblood', strap: 'leather-black', metal: 'brass-dull',
  }),

  // About 6 m of 12 mm cotton rope laid in three turns about 460 mm across, tied off with a sliding knot whose
  // tail hangs loose; lying flat on the floor.
  h.compound('rope_loop', 0.23,
    h.crescent('turn-a', 'rope', 0.216, 0.228, 0, 360, 20, 0, 0.012)
    + h.crescent('turn-b', 'rope', 0.204, 0.216, 0, 360, 20, 0.004, 0.016, 0.01, 0.006)
    + h.crescent('turn-c', 'rope', 0.196, 0.208, 0, 360, 20, 0.008, 0.02, -0.008, 0.012)
    + [
      h.turned('knot', 'knot', 'z', [[0, 0], [0, 0.018], [0.02, 0.024], [0.045, 0.022], [0.06, 0.012], [0.06, 0]], [0.0, 0.012, 0.19]),
      box('wrap-a', 'rope', [-0.026, 0.0, 0.205], [0.026, 0.03, 0.213]),
      box('wrap-b', 'rope', [-0.026, 0.0, 0.222], [0.026, 0.03, 0.23]),
      box('tail', 'rope', [0.01, 0, 0.25], [0.022, 0.012, 0.34]),
      box('tail-end', 'knot', [0.008, 0, 0.34], [0.024, 0.016, 0.356]),
    ], { rope: 'cord-cotton', knot: 'jute' }) + { voxelGrain: 0.004 },

  // A large military rucksack 420 mm wide, 700 mm tall and 300 mm deep, standing, front on +z: a lid over the
  // top, a front pocket with webbing rows, two side pockets, compression straps, and padded shoulder straps
  // and a hip belt behind.
  h.compound('rucksack', 1.3, [
    box('body', 'body', [-0.2, 0, -0.13], [0.2, 0.62, 0.13]),
    box('lid', 'body', [-0.21, 0.6, -0.14], [0.21, 0.7, 0.15]),
    box('lid-front', 'body', [-0.2, 0.55, 0.13], [0.2, 0.62, 0.155]),
    box('front-pocket', 'body', [-0.15, 0.06, 0.13], [0.15, 0.38, 0.19]),
    box('side-pocket-l', 'body', [-0.25, 0.05, -0.09], [-0.2, 0.32, 0.09]),
    box('side-pocket-r', 'body', [0.2, 0.05, -0.09], [0.25, 0.32, 0.09]),
    box('lid-strap-l', 'webbing', [-0.1, 0.36, 0.152], [-0.075, 0.6, 0.158]),
    box('lid-strap-r', 'webbing', [0.075, 0.36, 0.152], [0.1, 0.6, 0.158]),
    box('buckle-l', 'buckle', [-0.104, 0.4, 0.156], [-0.071, 0.43, 0.164]),
    box('buckle-r', 'buckle', [0.071, 0.4, 0.156], [0.104, 0.43, 0.164]),
    box('comp-l-a', 'webbing', [-0.254, 0.42, -0.1], [-0.2, 0.445, 0.1]),
    box('comp-r-a', 'webbing', [0.2, 0.42, -0.1], [0.254, 0.445, 0.1]),
    box('comp-l-b', 'webbing', [-0.256, 0.2, -0.1], [-0.25, 0.225, 0.1]),
    box('comp-r-b', 'webbing', [0.25, 0.2, -0.1], [0.256, 0.225, 0.1]),
    box('haul-loop', 'webbing', [-0.04, 0.7, -0.13], [0.04, 0.725, -0.1]),
    box('shoulder-l', 'pad', [-0.12, 0.14, -0.17], [-0.05, 0.6, -0.13]),
    box('shoulder-r', 'pad', [0.05, 0.14, -0.17], [0.12, 0.6, -0.13]),
    box('back-pad', 'pad', [-0.16, 0.08, -0.145], [0.16, 0.5, -0.13]),
    box('hip-belt', 'pad', [-0.26, 0.03, -0.2], [0.26, 0.11, -0.13]),
    box('hip-buckle', 'buckle', [-0.02, 0.05, -0.21], [0.02, 0.09, -0.195]),
  ] + h.webbing('pals', 'webbing', -0.14, 0.14, [0.14, 0.2, 0.26], 0.19), {
    body: 'cloth-olive-drab', webbing: 'webbing-olive-dark', buckle: 'plastic-matte-black', pad: 'webbing-olive-dark',
  }),

  // A slim running pack 240 mm wide, 420 mm tall and 80 mm deep, rounded at the top, with a stretch mesh pocket,
  // reflective strips and a crossing bungee on the front, and wide vest straps behind joined by a chest strap.
  h.compound('runner_bag', 0.43, [
    h.prism('body', 'body', 'z', [[-0.12, 0], [0.12, 0], [0.12, 0.32], [0.09, 0.39], [0.04, 0.42], [-0.04, 0.42], [-0.09, 0.39], [-0.12, 0.32]], -0.04, 0.04),
    h.prism('mesh', 'mesh', 'z', [[-0.1, 0.02], [0.1, 0.02], [0.1, 0.2], [-0.1, 0.2]], 0.04, 0.055),
    box('mesh-hem', 'trim', [-0.1, 0.195, 0.04], [0.1, 0.205, 0.058]),
    box('stripe-l', 'reflective', [-0.115, 0.22, 0.04], [-0.105, 0.36, 0.044]),
    box('stripe-r', 'reflective', [0.105, 0.22, 0.04], [0.115, 0.36, 0.044]),
    h.prism('bungee-a', 'trim', 'z', [[-0.08, 0.23], [-0.07, 0.23], [0.08, 0.35], [0.07, 0.35]], 0.04, 0.046),
    h.prism('bungee-b', 'trim', 'z', [[0.07, 0.23], [0.08, 0.23], [-0.07, 0.35], [-0.08, 0.35]], 0.046, 0.05),
    box('strap-l', 'trim', [-0.12, 0.08, -0.06], [-0.05, 0.4, -0.04]),
    box('strap-r', 'trim', [0.05, 0.08, -0.06], [0.12, 0.4, -0.04]),
    box('chest-strap', 'trim', [-0.06, 0.28, -0.064], [0.06, 0.295, -0.058]),
    box('chest-clip', 'reflective', [-0.012, 0.276, -0.068], [0.012, 0.3, -0.06]),
    box('bottle-pocket-l', 'mesh', [-0.115, 0.22, -0.068], [-0.06, 0.36, -0.06]),
  ], { body: 'cloth-blue', mesh: 'mesh-black', trim: 'nylon-black', reflective: 'reflective-yellow' })
  + { voxelGrain: 0.004 },

  // A single-strap sling pack: a teardrop 240 mm wide, 420 mm tall and 120 mm deep, a zipped front pocket and a
  // padded strap arching from its top to its lower corner behind.
  h.compound('slingpack', 0.4, [
    h.prism('body', 'body', 'z', [[-0.1, 0], [0.1, 0], [0.12, 0.06], [0.11, 0.2], [0.07, 0.33], [0.02, 0.4], [-0.02, 0.4], [-0.06, 0.34], [-0.1, 0.2], [-0.12, 0.06]], -0.06, 0.06),
    h.prism('pocket', 'pocket', 'z', [[-0.085, 0.03], [0.085, 0.03], [0.095, 0.08], [0.085, 0.2], [-0.085, 0.2], [-0.095, 0.08]], 0.06, 0.085),
    box('pocket-zip', 'trim', [-0.08, 0.195, 0.06], [0.08, 0.203, 0.088]),
    box('pull', 'trim', [0.06, 0.17, 0.085], [0.07, 0.195, 0.09]),
    box('grab', 'trim', [-0.02, 0.4, -0.012], [0.02, 0.42, 0.012]),
    box('base', 'trim', [-0.1, 0, -0.061], [0.1, 0.012, 0.061]),
  ] + arch('strap', 'strap', 0.0, 0.2, 0.2, 0.235, -45, 90, 9, -0.08, -0.064) + [
    box('strap-buckle', 'buckle', [0.13, 0.04, -0.084], [0.16, 0.07, -0.062]),
  ], { body: 'nylon-black', pocket: 'cloth-charcoal', trim: 'webbing-black', strap: 'cloth-charcoal', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A handmade straw basket 300 mm across at the rim and 190 mm deep, with woven bands, a rolled rim and a
  // tall bail handle.
  h.compound('straw_basket', 0.35, [
    h.turned('basket', 'straw', 'y', [[0, 0], [0, 0.12], [0.19, 0.15], [0.19, 0.14], [0.012, 0.11], [0.012, 0]]),
    h.turned('rim', 'band', 'y', [[0, 0.138], [0, 0.156], [0.016, 0.156], [0.016, 0.138], [0, 0.138]], [0, 0.18, 0]),
    h.turned('band-a', 'band', 'y', [[0, 0.121], [0, 0.126], [0.014, 0.1282], [0.014, 0.123], [0, 0.121]], [0, 0.03, 0]),
    h.turned('band-b', 'band', 'y', [[0, 0.1335], [0, 0.1395], [0.014, 0.1415], [0.014, 0.1355], [0, 0.1335]], [0, 0.11, 0]),
    h.turned('base-ring', 'band', 'y', [[0, 0.1], [0, 0.122], [0.008, 0.122], [0.008, 0.1], [0, 0.1]]),
  ] + arch('bail', 'band', 0, 0.17, 0.135, 0.152, 0, 180, 12, -0.012, 0.012) + [
    box('lash-l', 'straw', [-0.158, 0.15, -0.016], [-0.128, 0.19, 0.016]),
    box('lash-r', 'straw', [0.128, 0.15, -0.016], [0.158, 0.19, 0.016]),
  ], { straw: 'straw-wicker', band: 'straw-pale' }) + { voxelGrain: 0.004 },

  // A large hard-shell suitcase 500 mm wide, 800 mm tall with its wheels and 300 mm deep, front on +z: ribbed
  // shells meeting at a zipped seam, four spinner wheels, a retracted pull handle and carry handles on top and
  // side.
  h.compound('suitcase_l', 4.6, [
    box('shell-front', 'shell', [-0.25, 0.04, 0.005], [0.25, 0.78, 0.15]),
    box('shell-back', 'shell', [-0.25, 0.04, -0.15], [0.25, 0.78, -0.005]),
    box('seam', 'trim', [-0.253, 0.037, -0.006], [0.253, 0.783, 0.006]),
    box('handle-well', 'trim', [-0.14, 0.775, -0.135], [0.14, 0.785, -0.085]),
    box('pull-grip', 'trim', [-0.13, 0.8, -0.125], [0.13, 0.82, -0.095]),
    box('pull-post-l', 'metal', [-0.12, 0.78, -0.118], [-0.1, 0.8, -0.102]),
    box('pull-post-r', 'metal', [0.1, 0.78, -0.118], [0.12, 0.8, -0.102]),
    box('top-grip', 'trim', [-0.08, 0.79, 0.035], [0.08, 0.805, 0.065]),
    box('top-post-l', 'trim', [-0.08, 0.78, 0.035], [-0.065, 0.79, 0.065]),
    box('top-post-r', 'trim', [0.065, 0.78, 0.035], [0.08, 0.79, 0.065]),
    box('side-grip', 'trim', [0.25, 0.36, -0.015], [0.265, 0.5, 0.015]),
    box('lock', 'metal', [0.15, 0.6, -0.008], [0.2, 0.64, 0.009]),
  ] + [
    box('rib-%d' % i, 'shell', [x - 0.02, 0.1, 0.15], [x + 0.02, 0.72, 0.158])
    for i in std.range(0, 3)
    for x in [-0.15 + i * 0.1]
  ] + std.flattenArrays([
    [
      box('wheel-housing-%d' % i, 'trim', [x - 0.03, 0.03, z - 0.03], [x + 0.03, 0.05, z + 0.03]),
      h.turned('wheel-%d' % i, 'wheel', 'x', [[0, 0], [0, 0.022], [0.028, 0.022], [0.028, 0]], [x - 0.014, 0.022, z]),
    ]
    for i in std.range(0, 3)
    for x in [if i % 2 == 0 then -0.21 else 0.21]
    for z in [if i < 2 then -0.11 else 0.11]
  ]), { shell: 'plastic-blue', trim: 'plastic-matte-black', metal: 'steel-grey', wheel: 'rubber-black' }),

  // A soft fabric suitcase 400 mm wide, 600 mm tall with its wheels and 220 mm deep, front on +z: a zipped front
  // pocket, piped edges, two wheels and feet, a retracted pull handle and a top carry handle.
  h.compound('suitcase_m', 1.6, [
    box('body', 'body', [-0.2, 0.03, -0.11], [0.2, 0.58, 0.11]),
    box('pocket', 'body', [-0.17, 0.08, 0.11], [0.17, 0.5, 0.14]),
    box('pocket-zip-top', 'trim', [-0.17, 0.495, 0.11], [0.17, 0.505, 0.143]),
    box('pocket-zip-l', 'trim', [-0.175, 0.08, 0.11], [-0.165, 0.505, 0.143]),
    box('pocket-zip-r', 'trim', [0.165, 0.08, 0.11], [0.175, 0.505, 0.143]),
    box('pipe-fl', 'trim', [-0.205, 0.03, 0.105], [-0.195, 0.585, 0.115]),
    box('pipe-fr', 'trim', [0.195, 0.03, 0.105], [0.205, 0.585, 0.115]),
    box('pipe-top', 'trim', [-0.205, 0.575, 0.105], [0.205, 0.585, 0.115]),
    box('pull-housing', 'trim', [-0.11, 0.1, -0.13], [0.11, 0.58, -0.11]),
    box('pull-grip', 'trim', [-0.12, 0.6, -0.13], [0.12, 0.62, -0.105]),
    box('pull-post-l', 'metal', [-0.11, 0.58, -0.124], [-0.095, 0.6, -0.11]),
    box('pull-post-r', 'metal', [0.095, 0.58, -0.124], [0.11, 0.6, -0.11]),
    box('top-grip', 'trim', [-0.07, 0.59, 0.0], [0.07, 0.6, 0.03]),
    box('top-post-l', 'trim', [-0.07, 0.58, 0.0], [-0.055, 0.59, 0.03]),
    box('top-post-r', 'trim', [0.055, 0.58, 0.0], [0.07, 0.59, 0.03]),
    box('foot-l', 'trim', [-0.17, 0, 0.06], [-0.12, 0.03, 0.09]),
    box('foot-r', 'trim', [0.12, 0, 0.06], [0.17, 0.03, 0.09]),
    box('wheel-guard-l', 'trim', [-0.205, 0.0, -0.115], [-0.15, 0.07, -0.06]),
    box('wheel-guard-r', 'trim', [0.15, 0.0, -0.115], [0.205, 0.07, -0.06]),
    h.turned('wheel-l', 'wheel', 'x', [[0, 0], [0, 0.03], [0.024, 0.03], [0.024, 0]], [-0.212, 0.03, -0.085]),
    h.turned('wheel-r', 'wheel', 'x', [[0, 0], [0, 0.03], [0.024, 0.03], [0.024, 0]], [0.188, 0.03, -0.085]),
  ], { body: 'cloth-navy', trim: 'plastic-matte-black', metal: 'steel-grey', wheel: 'rubber-black' }),
]
