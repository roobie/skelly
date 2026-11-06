local h = import '../compound.libsonnet';
local box = h.box;
// A flat ring lying on the floor, centred at (x, z), from radius r0 to r1 and `t` thick.
local ringFlat(id, slot, r0, r1, t, x, y, z) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [t, r1], [t, r0], [0, r0]], [x, y, z]);
// One boot standing with its toe on +z, centred on x = `xc`. `b` holds length `l`, width `w`, sole `s`, toe height
// `toe`, instep height `instep`, shaft top `top` and shaft depth `shaft` along z, and `laces`, the lace rungs on the
// shaft front (0 for a pull-on boot). Slots: upper, toe, sole, collar, lining, laces.
local boot(p, xc, b) =
  local z0 = -b.l / 2, zt = b.l / 2 - b.w / 2, zs = z0 + b.shaft, s = b.s, top = b.top;
  local shaftY = s + b.instep - 0.01, rise = top - 0.02 - (s + b.instep);
  [
    box(p + '-sole', 'sole', [xc - b.w / 2 - 0.004, 0, z0 - 0.004], [xc + b.w / 2 + 0.004, s, zt]),
    h.disc(p + '-sole-toe', 'sole', b.w / 2 + 0.004, 0, s, xc, zt),
    box(p + '-heel', 'sole', [xc - b.w / 2 - 0.004, 0, z0 - 0.006], [xc + b.w / 2 + 0.004, s + 0.01, z0 + 0.07]),
    h.prism(p + '-vamp', 'upper', 'x', [[s, z0], [s, zt], [s + b.toe, zt], [s + b.instep, zs], [s + b.instep, z0]], xc - b.w / 2, xc + b.w / 2),
    h.turned(p + '-toe', 'toe', 'y', [[0, 0], [0, b.w / 2], [b.toe * 0.6, b.w / 2], [b.toe, b.w * 0.3], [b.toe, 0]], [xc, s, zt]),
    box(p + '-shaft', 'upper', [xc - b.w * 0.46, shaftY, z0 + 0.004], [xc + b.w * 0.46, top - 0.02, zs]),
    // The opening: a dark lining inside a padded collar ring.
    box(p + '-lining', 'lining', [xc - b.w * 0.46 + 0.008, top - 0.02, z0 + 0.012], [xc + b.w * 0.46 - 0.008, top - 0.012, zs - 0.008]),
    box(p + '-collar-back', 'collar', [xc - b.w * 0.46 - 0.004, top - 0.02, z0], [xc + b.w * 0.46 + 0.004, top, z0 + 0.012]),
    box(p + '-collar-front', 'collar', [xc - b.w * 0.46 - 0.004, top - 0.02, zs - 0.008], [xc + b.w * 0.46 + 0.004, top, zs + 0.004]),
    box(p + '-collar-left', 'collar', [xc - b.w * 0.46 - 0.004, top - 0.02, z0 + 0.012], [xc - b.w * 0.46 + 0.008, top, zs - 0.008]),
    box(p + '-collar-right', 'collar', [xc + b.w * 0.46 - 0.008, top - 0.02, z0 + 0.012], [xc + b.w * 0.46 + 0.004, top, zs - 0.008]),
  ] + (if b.laces == 0 then [] else [
    box(p + '-tongue', 'upper', [xc - b.w * 0.2, shaftY, zs], [xc + b.w * 0.2, top + 0.012, zs + 0.006]),
  ] + [
    box('%s-lace-%d' % [p, i], 'laces', [xc - b.w * 0.3, s + b.instep + i * rise / (b.laces - 1), zs + 0.006], [xc + b.w * 0.3, s + b.instep + i * rise / (b.laces - 1) + 0.004, zs + 0.009])
    for i in std.range(0, b.laces - 1)
  ] + [
    // Lace rungs down the instep slope toward the toe.
    local zl = zs + f * (zt - zs) * 0.6, yl = s + b.instep + f * 0.6 * (b.toe - b.instep);
    box('%s-instep-lace-%d' % [p, i], 'laces', [xc - b.w * 0.28, yl - 0.004, zl - 0.004], [xc + b.w * 0.28, yl + 0.002, zl])
    for i in [0, 1]
    for f in [[0.35, 0.75][i]]
  ]);
// A standing pair of boots `gap` apart; `extra(p, xc)` adds each boot's own pieces.
local bootPair(id, massKg, b, gap, finish, extra=function(p, xc) []) =
  local xc = b.w / 2 + 0.004 + gap / 2;
  h.compound(id, massKg, boot('left', -xc, b) + extra('left', -xc) + boot('right', xc, b) + extra('right', xc), { lining: 'paint-charcoal' } + finish);
// A belt laid flat and straight, outside up, `len` along x and `w` across z, with its buckle at +x.
local beltStrap(len, w, t=0.004) = [
  box('strap', 'strap', [-len / 2, 0, -w / 2], [len / 2, t, w / 2]),
];
[
  // A leather work belt 1.05 m long and 50 mm wide laid flat, with two stitched tool pouches 160 mm wide and 200 mm
  // deep, a steel hammer ring and three small tool loops.
  h.compound('tool_belt', 0.68, beltStrap(1.05, 0.05, 0.005) + [
    box('buckle-bar', 'buckle', [0.5, 0.005, -0.03], [0.508, 0.012, 0.03]),
    box('buckle-top', 'buckle', [0.5, 0.005, 0.026], [0.54, 0.012, 0.032]),
    box('buckle-bottom', 'buckle', [0.5, 0.005, -0.032], [0.54, 0.012, -0.026]),
    box('buckle-end', 'buckle', [0.532, 0.005, -0.032], [0.54, 0.012, 0.032]),
  ] + std.flattenArrays([
    [
      box('pouch-%d' % i, 'pouch', [x - 0.08, 0.005, -0.03], [x + 0.08, 0.045, 0.17]),
      box('pocket-%d' % i, 'pocket', [x - 0.07, 0.045, 0.06], [x + 0.07, 0.058, 0.16]),
      box('welt-%d' % i, 'strap', [x - 0.08, 0.045, -0.03], [x + 0.08, 0.05, -0.018]),
      h.turned('driver-%d' % i, 'handle', 'z', [[0, 0], [0, 0.012], [0.08, 0.012], [0.08, 0]], [x - 0.04, 0.03, -0.09]),
      box('pliers-%d-a' % i, 'handle', [x + 0.02, 0.03, -0.09], [x + 0.032, 0.045, 0.0]),
      box('pliers-%d-b' % i, 'handle', [x + 0.045, 0.03, -0.09], [x + 0.057, 0.045, 0.0]),
    ]
    for i in [0, 1]
    for x in [[-0.26, 0.2][i]]
  ]) + [
    box('hammer-tab', 'strap', [-0.05, 0.005, 0.02], [-0.02, 0.009, 0.07]),
    ringFlat('hammer-ring', 'buckle', 0.024, 0.03, 0.006, -0.035, 0.005, 0.095),
  ] + [
    box('loop-%d' % i, 'strap', [x - 0.012, 0.005, -0.028], [x + 0.012, 0.02, 0.028])
    for i in [0, 1, 2]
    for x in [[0.35, 0.4, 0.45][i]]
  ], { strap: 'leather-brown', pouch: 'leather-brown', pocket: 'leather-black', buckle: 'steel-grey', handle: 'plastic-yellow' })
  + { voxelGrain: 0.004 },

  // A 2-inch nylon webbing belt 1.1 m long and 50 mm wide laid flat, its outer face sewn into a row of attachment
  // channels, with a steel quick-release buckle at one end.
  h.compound('webbing_belt', 0.32, beltStrap(1.1, 0.05, 0.004) + [
    box('channel-%d' % i, 'webbing', [-0.5 + i * 0.038, 0.004, -0.024], [-0.5 + i * 0.038 + 0.032, 0.007, 0.024])
    for i in std.range(0, 24)
  ] + [
    box('buckle-male', 'buckle', [0.55, 0, -0.028], [0.585, 0.012, 0.028]),
    box('buckle-female', 'buckle', [0.585, 0, -0.032], [0.615, 0.014, 0.032]),
    box('buckle-gate', 'buckle', [0.595, 0.014, -0.02], [0.61, 0.018, 0.02]),
    box('keeper', 'webbing', [-0.53, 0.004, -0.026], [-0.515, 0.009, 0.026]),
  ], { strap: 'cloth-olive-drab', webbing: 'webbing-olive-dark', buckle: 'steel-parkerized' })
  + { voxelGrain: 0.004 },

  // A pair of sandals woven from cord, each sole 260 mm long and 95 mm wide, with a cord strap over the toes and a
  // heel loop.
  h.compound('bastsandals', 0.076, std.flattenArrays([
    [
      box(p + '-sole', 'sole', [xc - 0.0475, 0, -0.13], [xc + 0.0475, 0.008, 0.08]),
      h.disc(p + '-sole-toe', 'sole', 0.0475, 0, 0.008, xc, 0.08),
    ] + [
      box('%s-weave-%d' % [p, i], 'weave', [xc - 0.044, 0.008, -0.12 + i * 0.03], [xc + 0.044, 0.01, -0.108 + i * 0.03])
      for i in std.range(0, 6)
    ] + [
      box(p + '-toe-strap', 'strap', [xc - 0.05, 0.03, 0.04], [xc + 0.05, 0.036, 0.055]),
      box(p + '-toe-post-l', 'strap', [xc - 0.05, 0.008, 0.04], [xc - 0.044, 0.036, 0.055]),
      box(p + '-toe-post-r', 'strap', [xc + 0.044, 0.008, 0.04], [xc + 0.05, 0.036, 0.055]),
      box(p + '-ankle-l', 'strap', [xc - 0.05, 0.008, -0.1], [xc - 0.044, 0.05, -0.088]),
      box(p + '-ankle-r', 'strap', [xc + 0.044, 0.008, -0.1], [xc + 0.05, 0.05, -0.088]),
      box(p + '-heel-cord-l', 'strap', [xc - 0.05, 0.044, -0.136], [xc - 0.044, 0.05, -0.088]),
      box(p + '-heel-cord-r', 'strap', [xc + 0.044, 0.044, -0.136], [xc + 0.05, 0.05, -0.088]),
      box(p + '-heel-back', 'strap', [xc - 0.05, 0.03, -0.136], [xc + 0.05, 0.05, -0.13]),
    ]
    for p in ['left', 'right']
    for xc in [if p == 'left' then -0.055 else 0.055]
  ]), { sole: 'straw-wicker', weave: 'plant-dried', strap: 'cord-olive' })
  + { voxelGrain: 0.004 },

  // A pair of brown leather work boots, each 300 mm long, 105 mm wide and 170 mm tall, laced to the top.
  bootPair('boots', 1, { l: 0.3, w: 0.105, s: 0.022, toe: 0.06, instep: 0.085, top: 0.17, shaft: 0.12, laces: 4 }, 0.02, {
    upper: 'leather-brown',
    toe: 'leather-brown',
    sole: 'rubber-black',
    collar: 'paperboard-brown',
    laces: 'paperboard-tan',
  }) + { voxelGrain: 0.004 },

  // The same work boots, 190 mm tall, studded all over with small carved bones and a bone ring at each collar.
  bootPair('boots_bone', 1.2, { l: 0.3, w: 0.105, s: 0.022, toe: 0.06, instep: 0.085, top: 0.19, shaft: 0.12, laces: 4 }, 0.03, {
    upper: 'leather-black',
    toe: 'leather-black',
    sole: 'rubber-black',
    collar: 'body-bone',
    laces: 'leather-brown',
    bone: 'body-bone',
  }, function(p, xc) [
    box('%s-bone-side-%d-%d' % [p, side, i], 'bone', [xc + side * 0.0483 - 0.005, 0.105 + (i % 3) * 0.024, -0.145 + std.floor(i / 3) * 0.05], [xc + side * 0.0483 + 0.005, 0.121 + (i % 3) * 0.024, -0.133 + std.floor(i / 3) * 0.05])
    for side in [-1, 1]
    for i in std.range(0, 5)
  ] + [
    box('%s-bone-vamp-%d-%d' % [p, side, i], 'bone', [xc + side * 0.0525 - 0.005, 0.03, -0.11 + i * 0.045], [xc + side * 0.0525 + 0.005, 0.055, -0.098 + i * 0.045])
    for side in [-1, 1]
    for i in std.range(0, 3)
  ] + [
    box(p + '-bone-heel', 'bone', [xc - 0.03, 0.04, -0.158], [xc + 0.03, 0.05, -0.15]),
  ]) + { voxelGrain: 0.004 },

  // A pair of black rubber firefighter's boots, each 310 mm long, 110 mm wide and 380 mm tall, pull-on, with a
  // reflective band, a steel toe cap and pull loops at the top.
  bootPair('boots_bunker', 2.1, { l: 0.31, w: 0.11, s: 0.025, toe: 0.065, instep: 0.09, top: 0.38, shaft: 0.14, laces: 0 }, 0.02, {
    upper: 'rubber-black',
    toe: 'steel-grey',
    sole: 'paint-oxblood',
    collar: 'rubber-black',
    band: 'paint-crane-yellow',
  }, function(p, xc) [
    box(p + '-band', 'band', [xc - 0.0546, 0.2, -0.159], [xc + 0.0546, 0.225, -0.011]),
    box(p + '-loop-l', 'collar', [xc - 0.0546, 0.36, -0.1], [xc - 0.05, 0.41, -0.07]),
    box(p + '-loop-r', 'collar', [xc + 0.05, 0.36, -0.1], [xc + 0.0546, 0.41, -0.07]),
  ]) + { voxelGrain: 0.004 },

  // A pair of boots 300 mm long, 105 mm wide and 220 mm tall, sheathed in overlapping bands of insect shell.
  bootPair('boots_chitin', 1.7, { l: 0.3, w: 0.105, s: 0.022, toe: 0.065, instep: 0.09, top: 0.22, shaft: 0.13, laces: 0 }, 0.03, {
    upper: 'leather-black',
    toe: 'paint-oxblood',
    sole: 'paint-oxblood',
    collar: 'paint-oxblood',
    shell: 'paint-oxblood',
  }, function(p, xc) [
    box('%s-band-%d' % [p, i], 'shell', [xc - 0.052, 0.115 + i * 0.03, -0.155], [xc + 0.052, 0.137 + i * 0.03, -0.015])
    for i in std.range(0, 2)
  ] + [
    h.prism(p + '-shin', 'shell', 'x', [[0.1, -0.02], [0.215, -0.02], [0.215, -0.008], [0.12, 0.0]], xc - 0.035, xc + 0.035),
    h.prism(p + '-vamp-plate', 'shell', 'x', [[0.108, -0.02], [0.12, -0.02], [0.1, 0.085], [0.088, 0.085]], xc - 0.05, xc + 0.05),
  ]) + { voxelGrain: 0.004 },

  // A pair of coyote-tan combat boots, each 300 mm long, 105 mm wide and 220 mm tall, with a black lugged sole, a
  // reinforced toe and heel and laces to the top.
  bootPair('boots_combat', 1.1, { l: 0.3, w: 0.105, s: 0.026, toe: 0.06, instep: 0.085, top: 0.22, shaft: 0.12, laces: 6 }, 0.02, {
    upper: 'nylon-coyote',
    toe: 'polymer-fde',
    sole: 'rubber-black',
    collar: 'polymer-fde',
    laces: 'webbing-black',
  }, function(p, xc) [
    box(p + '-heel-cup', 'collar', [xc - 0.0525, 0.026, -0.152], [xc + 0.0525, 0.07, -0.12]),
  ]) + { voxelGrain: 0.004 },
]
