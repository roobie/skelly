local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
local rod = h.rod;
// A thin ring of `n` flat convex segments about the `axis` through (a, b), radii `r0` to `r1`, from angle `a0` to
// `a1` in degrees, `start` to `end` along the axis: a bail, a strap or a chime band that a turned ring cannot leave
// open.
local arc(id, slot, axis, a, b, r0, r1, a0, a1, n, start, end) = [
  local t0 = std.pi / 180 * (a0 + (a1 - a0) * i / n), t1 = std.pi / 180 * (a0 + (a1 - a0) * (i + 1) / n);
  h.prism('%s-%d' % [id, i], slot, axis, [
    [a + r0 * std.cos(t0), b + r0 * std.sin(t0)],
    [a + r1 * std.cos(t0), b + r1 * std.sin(t0)],
    [a + r1 * std.cos(t1), b + r1 * std.sin(t1)],
    [a + r0 * std.cos(t1), b + r0 * std.sin(t1)],
  ], start, end)
  for i in std.range(0, n - 1)
];
// A flat ring standing on y from `y0` to `y1`, radii `r0` to `r1`. A turned profile is not closed for it, so one
// that leaves the axis must end where it starts or its inner wall is missing and the voxels fill the hole.
local ring(id, slot, r0, r1, y0, y1) = turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [0, y0, 0]);
// A ring on y with two hand holes cut through it at ±x, each `gap` degrees wide: a keg chime or a cylinder collar.
local handHoleRing(id, slot, r0, r1, y0, y1, gap, n) =
  arc(id + '-n', slot, 'y', 0, 0, r0, r1, gap / 2, 180 - gap / 2, n, y0, y1)
  + arc(id + '-s', slot, 'y', 0, 0, r0, r1, 180 + gap / 2, 360 - gap / 2, n, y0, y1);
[
  // A galvanised steel pail, 250 mm across the rim and 220 mm tall, tapering to its foot, with a rolled
  // rim, riveted ears and a wire bail standing up over it.
  h.compound('bucket', 1.2, [
    turned('pail', 'steel', 'y', [[0, 0], [0, 0.1], [0.006, 0.1], [0.22, 0.122], [0.22, 0.119], [0.008, 0.097], [0.008, 0]]),
    ring('rim', 'steel', 0.118, 0.127, 0.213, 0.222),
    box('ear-left', 'ear', [-0.127, 0.17, -0.014], [-0.115, 0.205, 0.014]),
    box('ear-right', 'ear', [0.115, 0.17, -0.014], [0.127, 0.205, 0.014]),
  ] + arc('bail', 'bail', 'z', 0, 0.19, 0.127, 0.132, 0, 180, 18, -0.003, 0.003), {
    steel: 'steel-grey',
    ear: 'steel-stainless',
    bail: 'steel-parkerized',
  }) + { voxelGrain: 0.002 },

  // A 5 gallon orange plastic bucket, 300 mm across the rim and 365 mm tall, its upper wall ringed with
  // stiffening ribs, a wire bail with a black plastic grip standing up over it.
  h.compound('bucket_5gal', 0.99, [
    turned('pail', 'plastic', 'y', [[0, 0], [0, 0.128], [0.008, 0.13], [0.365, 0.15], [0.365, 0.146], [0.01, 0.126], [0.01, 0]]),
    ring('rim', 'plastic', 0.144, 0.158, 0.35, 0.365),
    ring('rib-a', 'plastic', 0.144, 0.156, 0.315, 0.323),
    ring('rib-b', 'plastic', 0.142, 0.154, 0.285, 0.293),
    ring('foot', 'plastic', 0.122, 0.132, 0, 0.012),
    box('lug-left', 'plastic', [-0.162, 0.31, -0.016], [-0.146, 0.345, 0.016]),
    box('lug-right', 'plastic', [0.146, 0.31, -0.016], [0.162, 0.345, 0.016]),
    rod('grip', 'grip', 0.012, -0.05, 0.05, 0.491),
  ] + arc('bail', 'bail', 'z', 0, 0.33, 0.158, 0.163, 0, 180, 20, -0.003, 0.003), {
    plastic: 'plastic-orange',
    bail: 'steel-grey',
    grip: 'plastic-black',
  }) + { voxelGrain: 0.004 },

  // A bucket carved from one hardwood log section, 260 mm across and 240 mm tall, its thick wall left
  // rough, with two ears rising from the rim and a carved crossbar handle between them.
  h.compound('bucket_wood', 2.1, [
    turned('pail', 'wood', 'y', [[0, 0], [0, 0.12], [0.24, 0.13], [0.24, 0.105], [0.035, 0.097], [0.035, 0]]),
    box('ear-left', 'handle', [-0.13, 0.22, -0.025], [-0.1, 0.35, 0.025]),
    box('ear-right', 'handle', [0.1, 0.22, -0.025], [0.13, 0.35, 0.025]),
    rod('crossbar', 'handle', 0.016, -0.12, 0.12, 0.325),
  ], { wood: 'wood-pine', handle: 'wood-walnut' }),

  // A 355 ml aluminium drink can, 66 mm across and 122 mm tall, necked at the top, with a printed band
  // and a ring-pull tab on its lid.
  h.compound('can_drink', 0.37, [
    turned('can', 'can', 'y', [[0, 0], [0, 0.026], [0.006, 0.033], [0.106, 0.033], [0.116, 0.027], [0.12, 0.027], [0.12, 0]]),
    ring('lip', 'can', 0.024, 0.0275, 0.119, 0.122),
    turned('band', 'print', 'y', [[0, 0], [0, 0.0334], [0.07, 0.0334], [0.07, 0]], [0, 0.025, 0]),
    box('tab', 'tab', [-0.012, 0.12, -0.005], [0.006, 0.122, 0.005]),
  ], { can: 'alu-bare', print: 'paint-red', tab: 'steel-stainless' }) + h.inHand('can_drink', 'can') + { voxelGrain: 0.002 },

  // An empty cardboard core, 42 mm across and 100 mm long, lying on its side.
  h.compound('cardboard_roll', 0.001, [
    turned('tube', 'board', 'x', [[0, 0.0185], [0, 0.021], [0.1, 0.021], [0.1, 0.0185], [0, 0.0185]], [-0.05, 0.021, 0]),
  ], { board: 'paperboard-tan' }) + { voxelGrain: 0.002 },

  // A hand-thrown clay beaker, 95 mm across the lip and 120 mm tall, with a thick wall swelling to a
  // rounded lip and a turned foot.
  h.compound('clay_cup', 0.2, [
    turned('cup', 'clay', 'y', [[0, 0], [0, 0.036], [0.012, 0.038], [0.08, 0.045], [0.114, 0.047], [0.12, 0.045], [0.12, 0.04], [0.11, 0.04], [0.016, 0.031], [0.016, 0]]),
    ring('foot', 'clay', 0.028, 0.039, 0, 0.008),
  ], { clay: 'clay-terracotta' }) + h.inHand('clay_cup', 'cup') + { voxelGrain: 0.004 },

  // A sealed condom in its square foil wrapper, 55 mm a side and 4 mm thick, the rolled ring pressing up
  // through the foil and a crimped seal round all four edges.
  h.compound('condom', 0.0027, [
    box('wrapper', 'foil', [-0.0245, 0, -0.0245], [0.0245, 0.0024, 0.0245]),
    box('crimp-a', 'crimp', [-0.0275, 0.0006, -0.0275], [-0.0245, 0.0018, 0.0275]),
    box('crimp-b', 'crimp', [0.0245, 0.0006, -0.0275], [0.0275, 0.0018, 0.0275]),
    box('crimp-c', 'crimp', [-0.0245, 0.0006, -0.0275], [0.0245, 0.0018, -0.0245]),
    box('crimp-d', 'crimp', [-0.0245, 0.0006, 0.0245], [0.0245, 0.0018, 0.0275]),
    ring('ring', 'ring', 0.011, 0.016, 0.0024, 0.0042),
    disc('tip', 'ring', 0.005, 0.0024, 0.0036),
  ], { foil: 'foil-gold', crimp: 'foil-gold', ring: 'brass' }) + { voxelGrain: 0.002 },

  // A cup folded from kitchen foil, about 80 mm across and 55 mm tall, its wall creased in vertical
  // folds and its lip turned over.
  h.compound('cup_foil', 0.003, [
    turned('cup', 'foil', 'y', [[0, 0], [0, 0.028], [0.005, 0.031], [0.05, 0.037], [0.05, 0.035], [0.006, 0.029], [0.002, 0]]),
    ring('lip', 'foil', 0.034, 0.04, 0.049, 0.055),
  ] + [
    local t = 2 * std.pi * i / 7, r = 0.037;
    box('fold-%d' % i, 'foil', [r * std.cos(t) - 0.004, 0.004 + 0.004 * (i % 3), r * std.sin(t) - 0.004], [r * std.cos(t) + 0.004, 0.05, r * std.sin(t) + 0.004])
    for i in std.range(0, 6)
  ], { foil: 'alu-bare' }) + h.inHand('cup_foil', 'cup') + { voxelGrain: 0.002 },

  // A thin vacuum-formed white cup, 80 mm across the rim and 95 mm tall, tapering to its base, with a
  // rolled rim and a stacking step near the foot.
  h.compound('cup_plastic', 0.0029, [
    turned('cup', 'plastic', 'y', [[0, 0], [0, 0.028], [0.095, 0.039], [0.095, 0.037], [0.002, 0.026], [0.002, 0]]),
    ring('rim', 'plastic', 0.037, 0.041, 0.092, 0.096),
    ring('step', 'plastic', 0.029, 0.0315, 0.016, 0.02),
  ], { plastic: 'plastic-white' }) + h.inHand('cup_plastic', 'cup') + { voxelGrain: 0.002 },

  // A coyote-brown fabric trauma kit pouch, 180 mm wide, 130 mm tall and 80 mm deep: a clamshell zipped
  // round its edge with two red pull tabs, a white patch with a red cross on the front and webbing straps
  // on the back.
  h.compound('ifak_pouch', 0.45, [
    h.prism('pouch', 'cloth', 'z', [[-0.08, 0], [0.08, 0], [0.09, 0.012], [0.09, 0.118], [0.08, 0.13], [-0.08, 0.13], [-0.09, 0.118], [-0.09, 0.012]], -0.04, 0.04),
    h.prism('zip', 'zip', 'z', [[-0.08, 0.004], [0.08, 0.004], [0.092, 0.014], [0.092, 0.118], [0.08, 0.132], [-0.08, 0.132], [-0.092, 0.118], [-0.092, 0.014]], -0.003, 0.003),
    box('pull-left', 'pull', [-0.05, 0.13, -0.004], [-0.04, 0.148, 0.004]),
    box('pull-right', 'pull', [0.04, 0.13, -0.004], [0.05, 0.148, 0.004]),
    box('patch', 'patch', [-0.03, 0.035, 0.04], [0.03, 0.095, 0.043]),
    box('cross-a', 'cross', [-0.02, 0.057, 0.043], [0.02, 0.073, 0.045]),
    box('cross-b', 'cross', [-0.008, 0.045, 0.043], [0.008, 0.085, 0.045]),
    box('strap-a', 'strap', [-0.09, 0.03, -0.045], [0.09, 0.055, -0.04]),
    box('strap-b', 'strap', [-0.09, 0.075, -0.045], [0.09, 0.1, -0.04]),
  ], { cloth: 'cloth-canvas', zip: 'paint-charcoal', pull: 'plastic-red', patch: 'cloth-cotton', cross: 'paint-red', strap: 'cord-olive' })
  + { voxelGrain: 0.004 },

  // A vacuum-sealed police first aid pack lying flat, 110 mm by 75 mm and 10 mm thick: a black pouch
  // drawn tight over a bandage roll, with welded ends and a white label carrying a red cross.
  h.compound('ipok', 0.031, h.sachet(0.11, 0.075, 0.008) + [
    rod('roll', 'pouch', 0.006, -0.04, 0.03, 0.006),
    box('label', 'label', [-0.03, 0.008, -0.03], [0.03, 0.009, 0.0]),
    box('cross-a', 'cross', [-0.012, 0.009, -0.0185], [0.012, 0.0095, -0.0115]),
    box('cross-b', 'cross', [-0.0035, 0.009, -0.027], [0.0035, 0.0095, -0.003]),
  ], { pouch: 'plastic-black', crimp: 'plastic-black', label: 'paper-white', cross: 'paint-red' })
  + { voxelGrain: 0.002 },

  // A half-litre glass canning jar, 84 mm across and 127 mm tall, with a threaded neck under a steel
  // screw band and a gold flat lid.
  h.compound('jar_glass_sealed', 0.42, [
    turned('jar', 'glass', 'y', [[0, 0], [0, 0.038], [0.004, 0.042], [0.092, 0.042], [0.104, 0.036], [0.112, 0.034], [0.112, 0.031], [0.104, 0.032], [0.092, 0.039], [0.006, 0.039], [0.006, 0]]),
    ring('thread', 'glass', 0.031, 0.0355, 0.104, 0.108),
    ring('band', 'band', 0.031, 0.0375, 0.109, 0.125),
    disc('lid', 'lid', 0.031, 0.121, 0.124),
    ring('band-top', 'band', 0.026, 0.0375, 0.124, 0.127),
  ], { glass: 'glass-clear', band: 'steel-grey', lid: 'foil-gold' })
  + h.inHand('jar_glass_sealed', 'jar') + { voxelGrain: 0.004 },

  // A red 10 litre plastic fuel can, 250 mm long, 160 mm deep and 330 mm tall: a sloped shoulder with a
  // capped spout, a carry handle moulded over the top and raised panels on both flanks.
  h.compound('jerrycan', 1, [
    h.prism('body', 'plastic', 'z', [[-0.125, 0], [0.125, 0], [0.125, 0.25], [0.085, 0.29], [-0.125, 0.29]], -0.08, 0.08),
    h.prism('panel-front', 'plastic', 'z', [[-0.1, 0.03], [0.1, 0.03], [0.1, 0.23], [-0.1, 0.23]], 0.08, 0.086),
    h.prism('panel-back', 'plastic', 'z', [[-0.1, 0.03], [0.1, 0.03], [0.1, 0.23], [-0.1, 0.23]], -0.086, -0.08),
    box('post-a', 'plastic', [-0.11, 0.29, -0.016], [-0.09, 0.315, 0.016]),
    box('post-b', 'plastic', [0.0, 0.29, -0.016], [0.02, 0.315, 0.016]),
    box('handle', 'plastic', [-0.11, 0.315, -0.016], [0.02, 0.335, 0.016]),
    disc('neck', 'plastic', 0.02, 0.27, 0.3, 0.095, 0),
    disc('cap', 'cap', 0.025, 0.3, 0.33, 0.095, 0),
  ], { plastic: 'plastic-red', cap: 'plastic-black' }) + { voxelGrain: 0.004 },

  // A 50 litre aluminium beer keg, 400 mm across and 530 mm tall: a ribbed barrel between a skirt below
  // and a chime above with two hand holes, the spear valve in the middle of the top.
  h.compound('keg', 63, [
    turned('barrel', 'alu', 'y', [[0.04, 0], [0.04, 0.17], [0.07, 0.195], [0.46, 0.195], [0.48, 0.16], [0.485, 0.04], [0.485, 0]]),
    ring('rib-a', 'alu', 0.19, 0.205, 0.15, 0.17),
    ring('rib-b', 'alu', 0.19, 0.205, 0.35, 0.37),
    ring('skirt', 'alu', 0.18, 0.192, 0, 0.08),
    ring('chime-foot', 'alu', 0.18, 0.192, 0.46, 0.485),
    ring('chime-top', 'alu', 0.18, 0.192, 0.515, 0.53),
    disc('valve', 'valve', 0.03, 0.47, 0.5),
    disc('valve-collar', 'valve', 0.04, 0.47, 0.48),
  ] + handHoleRing('chime', 'alu', 0.18, 0.192, 0.485, 0.515, 40, 8), { alu: 'alu-bare', valve: 'steel-stainless' }),

  // A 100 pound propane cylinder, 370 mm across and 1170 mm tall, painted white: a foot ring, rounded
  // heads, and a collar with two hand holes guarding a brass valve and its black handwheel.
  h.compound('large_propane_tank', 77, [
    turned('shell', 'paint', 'y', [[0.05, 0]] + [
      local t = std.pi / 2 * i / 6;
      [0.14 - 0.09 * std.cos(t), 0.185 * std.sin(t)]
      for i in std.range(1, 6)
    ] + [
      local t = std.pi / 2 * i / 6;
      [0.95 + 0.09 * std.sin(t), 0.185 * std.cos(t)]
      for i in std.range(0, 6)
    ]),
    ring('foot', 'paint', 0.16, 0.172, 0, 0.09),
    ring('collar-foot', 'paint', 0.12, 0.13, 1.0, 1.07),
    ring('collar-top', 'paint', 0.12, 0.13, 1.135, 1.17),
    disc('valve', 'valve', 0.02, 1.03, 1.1),
    box('valve-outlet', 'valve', [0.02, 1.06, -0.01], [0.05, 1.08, 0.01]),
    disc('wheel', 'wheel', 0.04, 1.1, 1.115),
  ] + handHoleRing('collar', 'paint', 0.12, 0.13, 1.07, 1.135, 50, 6), { paint: 'paint-white', valve: 'brass', wheel: 'plastic-black' }),
]
