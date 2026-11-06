local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;

// Bags and one-piece suits as found on a shelf or the floor: duffels lying on their bottom along x, a small
// backpack standing with its front on +z, and suits folded flat with the neck at +z.

local sgnPow(v, e) = (if v < 0 then -1 else 1) * std.pow(std.abs(v), e);
// A squared oval `a` tall and `b` deep as [y, z] points round [cy, 0], for a duffel's cross-section along x.
local oval(a, b, cy, p=3, n=24) = [
  local t = 2 * std.pi * i / n;
  [cy + a * sgnPow(std.sin(t), 2 / p), b * sgnPow(std.cos(t), 2 / p)]
  for i in std.range(0, n - 1)
];

// A duffel bag `len` long along x, `ht` tall and `dp` deep, lying on its bottom: a squared tube with stiff end panels,
// a zip along the top, two webbing bands wrapping the body that rise into a pair of carry handles, D-rings on the
// end panels and the shoulder strap lying coiled in front. `pocket` adds a zipped pocket on the front face.
// Slots: body, end, zip, band, metal, strap, pocket.
local duffel(o) =
  local c = { len: 0.7, ht: 0.34, dp: 0.34, bandX: 0.12, pocket: null, t: 0.004 } + o;
  local a = c.ht / 2, b = c.dp / 2, L = c.len / 2, t = c.t;
  [
    h.prism('body', 'body', 'x', oval(a, b, a), -L + 0.01, L - 0.01),
    h.prism('end-l', 'end', 'x', oval(a + t, b + t, a), -L, -L + 0.012),
    h.prism('end-r', 'end', 'x', oval(a + t, b + t, a), L - 0.012, L),
    box('zip', 'zip', [-L + 0.03, c.ht - 0.002, -0.008], [L - 0.03, c.ht + 0.004, 0.008]),
    box('zip-pull', 'metal', [L * 0.45, c.ht + 0.004, -0.004], [L * 0.45 + 0.03, c.ht + 0.008, 0.004]),
  ] + std.flattenArrays([
    [
      h.prism('band-%d' % i, 'band', 'x', oval(a + t, b + t, a), x - 0.0175, x + 0.0175),
      box('post-a-%d' % i, 'band', [x - 0.0175, c.ht, 0.018], [x + 0.0175, c.ht + 0.055, 0.03]),
      box('post-b-%d' % i, 'band', [x - 0.0175, c.ht, -0.03], [x + 0.0175, c.ht + 0.055, -0.018]),
    ]
    for i in [0, 1]
    for x in [[-c.bandX, c.bandX][i]]
  ]) + [
    box('grip-a', 'band', [-c.bandX - 0.0175, c.ht + 0.045, 0.012], [c.bandX + 0.0175, c.ht + 0.062, 0.036]),
    box('grip-b', 'band', [-c.bandX - 0.0175, c.ht + 0.045, -0.036], [c.bandX + 0.0175, c.ht + 0.062, -0.012]),
    box('grip-wrap', 'strap', [-0.05, c.ht + 0.04, -0.04], [0.05, c.ht + 0.068, 0.04]),
  ] + std.flattenArrays([
    [
      box('d-ring-%d' % i, 'metal', [s * L - 0.003 + s * 0.003, c.ht * 0.7, -0.012], [s * L + 0.003 + s * 0.003, c.ht * 0.7 + 0.03, 0.012]),
    ]
    for i in [0, 1]
    for s in [[-1, 1][i]]
  ]) + h.strapLoop('strap', 'strap', c.len * 0.55, 0.03, 0.035, 0.004, 0, 0, b + 0.06)
  + (if c.pocket == null then [] else
       local p = c.pocket;
       [
         box('pocket', 'pocket', [-p.w / 2, c.ht * 0.2, b - 0.01], [p.w / 2, c.ht * 0.2 + p.ht, b + 0.022]),
         box('pocket-zip', 'zip', [-p.w / 2 + 0.01, c.ht * 0.2 + p.ht - 0.02, b + 0.022], [p.w / 2 - 0.01, c.ht * 0.2 + p.ht - 0.012, b + 0.026]),
       ]);

// A small backpack standing on its bottom, front on +z: a body with a round-shouldered top, a zip running round
// it, a front pocket with its own zip, two shoulder straps down the back and a grab loop on top.
// Slots: body, pocket, zip, metal, strap.
local backpack(o) =
  local c = { w: 0.24, ht: 0.3, d: 0.11, r: 0.08 } + o;
  local w = c.w / 2, ht = c.ht, d = c.d / 2;
  local outline(grow, top) = [[-w - grow, 0], [w + grow, 0], [w + grow, top - c.r]] + [
    local t = std.pi * i / 8;
    [(w - c.r) * (if t < std.pi / 2 then 1 else -1) + (c.r + grow) * std.cos(t), top - c.r + (c.r + grow) * std.sin(t)]
    for i in std.range(1, 7)
  ] + [[-w - grow, top - c.r]];
  local pw = w * 0.75, pt = ht * 0.55;
  local pocket(grow) = [[-pw - grow, 0.03 - grow], [pw + grow, 0.03 - grow], [pw + grow, pt - 0.04], [pw - 0.04, pt + grow], [-pw + 0.04, pt + grow], [-pw - grow, pt - 0.04]];
  [
    h.prism('body', 'body', 'z', outline(0, ht), -d, d),
    h.prism('zip', 'zip', 'z', outline(0.003, ht), d * 0.4 - 0.004, d * 0.4 + 0.004),
    h.prism('pocket', 'pocket', 'z', pocket(0), d - 0.005, d + 0.035),
    h.prism('pocket-zip', 'zip', 'z', pocket(0.003), d + 0.022, d + 0.028),
    box('pull-a', 'metal', [w * 0.6, ht - 0.02, d * 0.4 - 0.003], [w * 0.6 + 0.008, ht + 0.012, d * 0.4 + 0.003]),
    box('pull-b', 'metal', [pw * 0.5, pt - 0.008, d + 0.022], [pw * 0.5 + 0.008, pt + 0.022, d + 0.028]),
    box('loop-a', 'strap', [-0.02, ht - 0.005, -d * 0.5], [-0.012, ht + 0.03, -d * 0.1]),
    box('loop-b', 'strap', [0.012, ht - 0.005, -d * 0.5], [0.02, ht + 0.03, -d * 0.1]),
    box('loop-top', 'strap', [-0.02, ht + 0.024, -d * 0.5], [0.02, ht + 0.032, -d * 0.1]),
  ] + std.flattenArrays([
    [
      box('strap-%d' % i, 'strap', [x - 0.022, 0.04, -d - 0.012], [x + 0.022, ht - 0.03, -d]),
      box('strap-top-%d' % i, 'strap', [x - 0.022, ht - 0.035, -d - 0.012], [x + 0.022, ht - 0.01, -d + 0.02]),
      box('strap-end-%d' % i, 'strap', [x - 0.012, 0, -d - 0.008], [x + 0.012, 0.045, -d]),
      box('buckle-%d' % i, 'metal', [x - 0.016, 0.04, -d - 0.016], [x + 0.016, 0.06, -d - 0.008]),
    ]
    for i in [0, 1]
    for x in [[-w * 0.5, w * 0.5][i]]
  ]);

// Overalls folded with the bib turned down over the legs, waist at +z: a crotch seam, side buttons, a bib with a
// flapped pocket and pen slot, the shoulder straps lying down the bib with buckles at its corners, front pockets,
// a hammer loop and contrast stitching. Slots: cloth, bib, seam, stitch, strap, metal, pocket.
local overalls(o) =
  local c = { w: 0.38, d: 0.46, ht: 0.05 } + o;
  local w = c.w / 2, d = c.d / 2, ht = c.ht, top = d;
  local bw = 0.13, bz = top - 0.04, bl = 0.22;
  h.foldedGarment(c.w, c.d, ht, 3)
  + [
    box('waistband', 'cloth', [-w, ht, top - 0.035], [w, ht + 0.005, top]),
    box('crotch', 'seam', [-0.004, ht, -d + 0.004], [0.004, ht + 0.003, top - 0.2]),
    box('bib', 'bib', [-bw, ht + 0.005, bz - bl], [bw, ht + 0.011, bz]),
    box('bib-pocket', 'pocket', [-0.08, ht + 0.011, bz - bl + 0.03], [0.08, ht + 0.015, bz - bl + 0.13]),
    box('bib-flap', 'bib', [-0.083, ht + 0.015, bz - bl + 0.1], [0.083, ht + 0.019, bz - bl + 0.133]),
    box('pen-slot', 'stitch', [0.03, ht + 0.015, bz - bl + 0.03], [0.034, ht + 0.019, bz - bl + 0.1]),
    box('hammer-loop', 'cloth', [w - 0.03, ht, -d + 0.04], [w - 0.012, ht + 0.008, -d + 0.13]),
  ] + std.flattenArrays([
    [
      g.strip('strap-%d' % i, 'strap', [s * (bw - 0.02), bz - bl + 0.02], [s * (bw - 0.035), -d + 0.03], ht + 0.011, 0.035, 0.004),
      box('buckle-%d' % i, 'metal', [s * (bw - 0.02) - 0.022, ht + 0.015, bz - bl + 0.005], [s * (bw - 0.02) + 0.022, ht + 0.022, bz - bl + 0.04]),
      h.disc('bib-button-%d' % i, 'metal', 0.008, ht + 0.011, ht + 0.016, s * (bw - 0.02), bz - bl + 0.06),
      h.disc('side-button-%d' % i, 'metal', 0.008, ht + 0.005, ht + 0.01, s * (w - 0.02), top - 0.06),
      g.strip('side-stitch-%d' % i, 'stitch', [s * (w - 0.005), top - 0.035], [s * (w - 0.005), -d + 0.005], ht, 0.004, 0.003),
      g.strip('pocket-%d' % i, 'stitch', [s * (bw + 0.005), top - 0.035], [s * w, top - 0.13], ht + 0.005, 0.005, 0.003),
    ]
    for i in [0, 1]
    for s in [[-1, 1][i]]
  ]);

local clownSuit =
  local w = 0.38, d = 0.36, ht = 0.07, cz = d / 2 - 0.09;
  g.jacket({ w: w, d: d, ht: ht, collar: null, front: 'placket', frontW: 0.03, buttons: [], sleeves: { kind: 'flat', w: 0.08, t: 0.006 }, pockets: [{ x: 0.1, z: -0.09, w: 0.1, d: 0.09, flap: 0, single: true }] })
  + [box('half', 'half', [-w / 2, ht, -d / 2], [-0.015, ht + 0.008, d / 2])]
  + [
    // Pompom buttons down the front.
    h.turned('pompom-%d' % i, 'pompom', 'y', [[0, 0], [0, 0.015], [0.01, 0.019], [0.02, 0.015], [0.025, 0]], [0, ht + 0.005, cz - 0.135 - i * 0.065])
    for i in std.range(0, 2)
  ]
  + h.crescent('ruff-in', 'ruff', 0.05, 0.1, -180, 180, 16, ht, ht + 0.016, 0, cz)
  + [
    // Pleats of the ruff collar.
    local ang = 360 * i / 14, rr = 0.08;
    h.disc('ruff-pleat-%d' % i, 'ruffle', 0.016, ht + 0.016, ht + 0.026, rr * std.sin(ang * std.pi / 180), cz + rr * std.cos(ang * std.pi / 180))
    for i in std.range(0, 13)
  ]
  + [
    h.disc('dot-%d' % i, 'dot', 0.012, ht + 0.008, ht + 0.011, p[0], p[1])
    for i in std.range(0, 5)
    for p in [[[-0.12, 0.02], [-0.06, -0.05], [-0.12, -0.12], [0.07, 0.03], [0.13, -0.02], [0.06, 0.12]][i]]
  ];

local bondageSuit =
  local w = 0.34, d = 0.34, ht = 0.05, cz = d / 2 - 0.08;
  g.jacket({ w: w, d: d, ht: ht, neck: 0.08, collar: { r: 0.055, wd: 0.02, ht: 0.03, gap: 10 }, front: 'placket', frontW: 0.008, frontT: 0.004, buttons: [], sleeves: { kind: 'flat', w: 0.075, t: 0.006 } })
  + [
    // Zips running every which way.
    g.strip('zip-%d' % i, 'zip', z[0], z[1], ht + 0.004, 0.007, 0.003)
    for i in std.range(0, 4)
    for z in [[[[-0.13, 0.12], [-0.03, 0.02]], [[0.13, 0.1], [0.03, -0.02]], [[-0.1, -0.03], [-0.03, -0.15]], [[0.1, -0.05], [0.04, -0.15]], [[-0.14, -0.13], [-0.07, -0.16]]][i]]
  ]
  + [
    box('pull-%d' % i, 'metal', [p[0] - 0.005, ht + 0.007, p[1] - 0.008], [p[0] + 0.005, ht + 0.01, p[1] + 0.008])
    for i in std.range(0, 4)
    for p in [[[-0.03, 0.02], [0.03, -0.02], [-0.03, -0.15], [0.04, -0.15], [-0.07, -0.16]][i]]
  ]
  + [
    box('zip-front-pull', 'metal', [-0.005, ht + 0.004, cz - 0.075], [0.005, ht + 0.008, cz - 0.055]),
    h.turned('collar-ring', 'metal', 'z', [[0, 0.012], [0, 0.016], [0.004, 0.016], [0.004, 0.012], [0, 0.012]], [0, ht + 0.03, cz + 0.055]),
    box('strap-a', 'strap', [-w / 2 - 0.006, 0, -0.05], [w / 2 + 0.006, ht + 0.007, -0.03]),
    box('buckle-a', 'metal', [0.05, ht + 0.007, -0.054], [0.075, ht + 0.012, -0.026]),
  ];

local bodysuit =
  local w = 0.3, d = 0.28, ht = 0.03;
  g.jacket({ w: w, d: d, ht: ht, neck: 0.07, collar: { r: 0.045, wd: 0.014, ht: 0.018, gap: 12 }, front: 'placket', frontW: 0.006, frontT: 0.003, buttons: [], sleeves: { kind: 'flat', w: 0.06, t: 0.004 } })
  + [
    box('zip-pull', 'zip', [-0.005, ht + 0.003, 0.02], [0.005, ht + 0.006, 0.04]),
    box('stripe-l', 'stripe', [-w / 2 + 0.06, ht, -d / 2], [-w / 2 + 0.072, ht + 0.003, d / 2]),
    box('stripe-r', 'stripe', [w / 2 - 0.072, ht, -d / 2], [w / 2 - 0.06, ht + 0.003, d / 2]),
    // The stirrup feet folded up over the hem.
    box('foot-l', 'foot', [-0.1, ht, -d / 2 + 0.002], [-0.03, ht + 0.008, -d / 2 + 0.07]),
    box('foot-r', 'foot', [0.03, ht, -d / 2 + 0.002], [0.1, ht + 0.008, -d / 2 + 0.07]),
  ];

[
  // A small gym bag, 340 mm long and 180 mm by 180 mm across: a little polyester duffel with an end-to-end zip,
  // two webbing carry handles and a shoulder strap.
  h.compound('duffelbag_gym_xxs', 0.55, duffel({ len: 0.34, ht: 0.18, dp: 0.18, bandX: 0.07, pocket: { w: 0.16, ht: 0.08 } }), {
    body: 'cloth-blue',
    end: 'nylon-black',
    zip: 'plastic-matte-black',
    band: 'webbing-black',
    metal: 'steel-bright',
    strap: 'webbing-black',
    pocket: 'nylon-black',
  }) + { voxelGrain: 0.004 },

  // A large polyester duffel 700 mm long and 340 mm by 340 mm across, with a zipped front pocket.
  h.compound('duffelbag_l_poly', 1.4, duffel({ len: 0.7, ht: 0.34, dp: 0.34, bandX: 0.13, pocket: { w: 0.3, ht: 0.14 } }), {
    body: 'cloth-navy',
    end: 'cloth-charcoal',
    zip: 'plastic-matte-black',
    band: 'webbing-black',
    metal: 'steel-bright',
    strap: 'webbing-black',
    pocket: 'cloth-charcoal',
  }),

  // A big nylon duffel 900 mm long and 400 mm by 400 mm across, the plain kit-bag sort.
  h.compound('duffelbag_xl_nylon', 1.5, duffel({ len: 0.9, ht: 0.4, dp: 0.4, bandX: 0.16 }), {
    body: 'nylon-ranger-green',
    end: 'webbing-olive-dark',
    zip: 'plastic-matte-black',
    band: 'webbing-olive-dark',
    metal: 'plastic-matte-black',
    strap: 'webbing-olive-dark',
  }),

  // A child's backpack 240 mm wide, 300 mm tall and 110 mm deep, with a zipped front pocket and two shoulder straps.
  h.compound('backpack_small', 0.35, backpack({}), {
    body: 'nylon-red',
    pocket: 'cloth-yellow',
    zip: 'plastic-matte-black',
    metal: 'plastic-matte-black',
    strap: 'webbing-black',
  }) + { voxelGrain: 0.004 },

  // A full-body stretch suit folded to 300 mm by 280 mm and 30 mm tall: a mock neck, a front zip, sleeves folded
  // along the sides, black side stripes and the foot ends folded up over the hem.
  h.compound('bodysuit_lycra', 0.44, bodysuit, {
    cloth: 'cloth-purple',
    collar: 'cloth-purple',
    front: 'plastic-matte-black',
    sleeve: 'cloth-purple',
    zip: 'steel-bright',
    stripe: 'nylon-black',
    foot: 'cloth-purple',
  }) + { voxelGrain: 0.004 },

  // A black leather catsuit folded to 340 mm by 340 mm and 50 mm tall, a ring at the collar and zips running in
  // odd directions over it, one buckled strap round the bundle.
  h.compound('bondage_suit', 2.5, bondageSuit, {
    cloth: 'leather-black',
    collar: 'leather-black',
    front: 'steel-bright',
    sleeve: 'leather-black',
    zip: 'steel-bright',
    metal: 'steel-bright',
    strap: 'leather-charcoal',
  }) + { voxelGrain: 0.004 },

  // A clown suit folded to 380 mm by 360 mm and 70 mm tall: half yellow, half red, polka dots, pompom buttons, a
  // white ruff collar and a big patch pocket.
  h.compound('clown_suit', 1.7, clownSuit, {
    cloth: 'cloth-yellow',
    half: 'cloth-red',
    front: 'cloth-blue',
    sleeve: 'cloth-yellow',
    pocket: 'cloth-blue',
    pompom: 'cloth-orange',
    ruff: 'cloth-cream',
    ruffle: 'cloth-cream',
    dot: 'cloth-green',
  }),

  // Denim bib overalls folded with the bib turned down over the legs, 380 mm by 460 mm and 55 mm tall: shoulder
  // straps with brass buckles, a bib pocket with a pen slot, side buttons and a hammer loop.
  h.compound('denim_overalls', 1.6, overalls({}), {
    cloth: 'cloth-denim',
    bib: 'cloth-denim',
    seam: 'plastic-charcoal',
    stitch: 'cloth-saffron',
    strap: 'cloth-denim-faded',
    metal: 'brass-dull',
    pocket: 'cloth-denim-faded',
  }) + { voxelGrain: 0.004 },
]
