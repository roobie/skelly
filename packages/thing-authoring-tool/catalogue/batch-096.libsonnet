local h = import '../compound.libsonnet';
local box = h.box;
// Rows of PALS webbing 25 mm tall on a face at height y, from x0 to x1, starting at z0 and stepping 38 mm towards +z.
local pals(id, x0, x1, y, z0, rows) = [
  box('%s-%d' % [id, i], 'pals', [x0, y, z0 + i * 0.038], [x1, y + 0.003, z0 + i * 0.038 + 0.025])
  for i in std.range(0, rows - 1)
];
// An oversized handmade armour vest lying flat, front up, neck towards -z: a front panel 560 mm wide and 620 mm long
// over a wider back panel, sewn from salvaged panels in two shades with seams between them, padded shoulder straps
// over the neck opening, a cummerbund wing 160 mm wide each side and a drag handle at the back's collar. `plated`
// sews ten plate pockets on: four on the front in a 2 by 2 block and one on each wing, a steel edge showing at each
// pocket's mouth; the back four lie underneath. Webbing runs across the front and both wings. Slots: cloth, patch,
// pals, pad, trim, pocket, plate.
local xlVest(plated) =
  local w = 0.56, l = 0.62, wing = 0.16, zn = -l / 2, zh = l / 2, ys = 0.022, yf = 0.046, yp = yf + 0.003,
        pk = if plated then 0.016 else 0, yw = yp + pk;
  [
    box('back', 'cloth', [-w / 2 - 0.015, 0, zn + 0.06], [w / 2 + 0.015, ys, zh]),
    box('front', 'cloth', [-w / 2, ys, zn + 0.09], [w / 2, yf, zh - 0.01]),
    box('handle', 'trim', [-0.06, ys, zn + 0.035], [0.06, ys + 0.014, zn + 0.06]),
  ]
  // Salvaged panels: a 3 by 3 patchwork in two shades with 8 mm seams.
  + [
    local x0 = -w / 2 + 0.01 + i * (w - 0.02) / 3, z0 = zn + 0.1 + j * (l - 0.12) / 3;
    box('panel-%d-%d' % [i, j], if (i + j) % 2 == 0 then 'cloth' else 'patch',
        [x0 + 0.004, yf, z0 + 0.004], [x0 + (w - 0.02) / 3 - 0.004, yp, z0 + (l - 0.12) / 3 - 0.004])
    for i in [0, 1, 2]
    for j in [0, 1, 2]
  ]
  + [
    box('strap-%d' % i, 'pad', [x - 0.04, 0, zn - 0.05], [x + 0.04, yf + 0.016, zn + 0.12])
    for i in [0, 1]
    for x in [[-0.14, 0.14][i]]
  ]
  + std.flattenArrays([
    [box('wing-%d' % i, 'cloth', [if s < 0 then -w / 2 - wing else w / 2, 0.006, -0.04], [if s < 0 then -w / 2 else w / 2 + wing, 0.02, zh - 0.05])]
    + (if plated then [
         box('wing-pocket-%d' % i, 'pocket', [if s < 0 then -w / 2 - wing + 0.015 else w / 2 + 0.015, 0.02, 0.0], [if s < 0 then -w / 2 - 0.015 else w / 2 + wing - 0.015, 0.034, zh - 0.07]),
         box('wing-plate-%d' % i, 'plate', [if s < 0 then -w / 2 - wing + 0.025 else w / 2 + 0.025, 0.022, -0.012], [if s < 0 then -w / 2 - 0.025 else w / 2 + wing - 0.025, 0.031, 0.0]),
       ] else [])
    + pals('wing-pals-%d' % i, if s < 0 then -w / 2 - wing + 0.02 else w / 2 + 0.02, if s < 0 then -w / 2 - 0.02 else w / 2 + wing - 0.02,
           if plated then 0.034 else 0.02, 0.06, 4)
    for i in [0, 1]
    for s in [[-1, 1][i]]
  ])
  + (if plated then std.flattenArrays([
       local x0 = [-w / 2 + 0.025, 0.01][i], x1 = [-0.01, w / 2 - 0.025][i], z0 = [zn + 0.14, 0.03][j], z1 = [0.0, zh - 0.04][j];
       [
         box('pocket-%d-%d' % [i, j], 'pocket', [x0, yp, z0], [x1, yw, z1]),
         box('plate-%d-%d' % [i, j], 'plate', [x0 + 0.012, yp + 0.002, z0 - 0.012], [x1 - 0.012, yw - 0.004, z0]),
       ]
       for i in [0, 1]
       for j in [0, 1]
     ]) else [])
  + pals('front-pals', -w / 2 + 0.04, w / 2 - 0.04, yw, 0.04, 6);
// A bandolier folded in half and laid flat: two runs of strap `sw` wide side by side along x, `len` long, the fold
// rounded at -x and a buckle at +x where the two ends meet. The upper run carries `n` empty loops across it, each
// `loopW` wide and sized to a cartridge `cr` in radius. Slots: strap, loop, buckle.
local cartridgeStrap(len, sw, t, n, cr, loopW) =
  local gap = 0.006, zA = -gap / 2 - sw, zB = gap / 2, x0 = -len / 2, x1 = len / 2, pitch = (len - 0.12) / n;
  [
    box('run-a', 'strap', [x0, 0, zA], [x1 - 0.02, t, zA + sw]),
    box('run-b', 'strap', [x0, 0, zB], [x1, t, zB + sw]),
    h.disc('fold', 'strap', sw + gap / 2, 0, t, x0, 0),
    box('buckle', 'buckle', [x1 - 0.035, t, zA - 0.004], [x1 - 0.02, t + 0.005, zA + sw + 0.004]),
    box('tongue', 'strap', [x1 - 0.03, 0, zA + sw * 0.3], [x1 + 0.01, t * 0.9, zA + sw * 0.7]),
  ]
  + [
    local x = x0 + 0.08 + k * pitch, zc = zB + sw / 2, ri = cr + 0.0005, ro = cr + 0.004;
    h.turned('loop-%d' % k, 'loop', 'z', [[0, ri], [0, ro], [loopW, ro], [loopW, ri], [0, ri]], [x, t + ro - 0.001, zc - loopW / 2])
    for k in std.range(0, n - 1)
  ];
[
  // An oversized handmade armour vest lying flat, front up: a front panel 560 mm wide and 620 mm long sewn from
  // salvaged aramid panels in nylon, six rows of PALS webbing across it, cummerbund wings 160 mm wide with webbing.
  h.compound('xl_ballistic_vest', 4.3, xlVest(false), {
    cloth: 'nylon-coyote', patch: 'cloth-olive-drab', pals: 'webbing-olive-dark', pad: 'nylon-coyote', trim: 'plastic-matte-black',
  }) + { voxelGrain: 0.004 },

  // The same oversized vest with ten home-made mild steel plates sewn into pockets: four on the front, four on the
  // back and one on each wing, a steel edge showing at each pocket's mouth.
  h.compound('xl_ballistic_vest_lc', 10, xlVest(true), {
    cloth: 'nylon-coyote', patch: 'cloth-olive-drab', pals: 'webbing-olive-dark', pad: 'nylon-coyote', trim: 'plastic-matte-black',
    pocket: 'cloth-olive-drab', plate: 'steel-grey',
  }) + { voxelGrain: 0.004 },

  // An embroidered leather bandolier 1.3 m round, folded in half to 640 mm by 100 mm, with 28 empty loops for
  // pistol cartridges 9 mm across down its upper run and a stitched band of embroidery along the other.
  h.compound('bandolier_pistol', 0.27, cartridgeStrap(0.64, 0.045, 0.005, 28, 0.0048, 0.024) + [
    box('stitch-%d' % k, if k % 2 == 0 then 'stitch' else 'stitch-b', [-0.25 + k * 0.04, 0.005, -0.039], [-0.25 + k * 0.04 + 0.024, 0.007, -0.015])
    for k in std.range(0, 12)
  ], { strap: 'leather-brown', loop: 'skin-rawhide', buckle: 'brass-polished', stitch: 'cloth-red', 'stitch-b': 'metal-gold' })
  + { voxelGrain: 0.004 },

  // A plain leather bandolier 1.3 m round, folded in half to 640 mm by 110 mm, with 16 empty loops for
  // rifle cartridges 12 mm across down its upper run.
  h.compound('bandolier_rifle', 0.27, cartridgeStrap(0.64, 0.05, 0.005, 16, 0.006, 0.036),
    { strap: 'leather-brown', loop: 'skin-rawhide', buckle: 'brass-polished' })
  + { voxelGrain: 0.004 },

  // A leather cartridge belt 1.1 m long, folded in half to 560 mm by 120 mm, with 20 empty loops for
  // shotgun shells 20 mm across down its upper run.
  h.compound('bandolier_shotgun', 0.4, cartridgeStrap(0.56, 0.055, 0.005, 20, 0.0102, 0.04),
    { strap: 'leather-brown', loop: 'skin-rawhide', buckle: 'brass-polished' })
  + { voxelGrain: 0.004 },

  // A canvas wrist band 240 mm long and 55 mm wide laid flat, five loops for rifle cartridges 12 mm across sewn
  // across its middle, a hook and loop patch on top at one end and one underneath at the other.
  h.compound('bandolier_wrist', 0.015, [
    box('band', 'band', [-0.12, 0, -0.0275], [0.12, 0.003, 0.0275]),
    box('hook', 'hook', [0.08, 0.003, -0.024], [0.115, 0.005, 0.024]),
    box('fuzz', 'hook', [-0.115, -0.002, -0.024], [-0.08, 0, 0.024]),
  ] + [
    local x = -0.05 + k * 0.025, ri = 0.0065, ro = 0.009;
    h.turned('loop-%d' % k, 'loop', 'z', [[0, ri], [0, ro], [0.04, ro], [0.04, ri], [0, ri]], [x, 0.003 + ro - 0.001, -0.02])
    for k in std.range(0, 4)
  ], { band: 'cloth-canvas', loop: 'cloth-canvas', hook: 'hook-loop-grey' })
  + { voxelGrain: 0.002 },

  // A cotton bandolier laid flat: four magazine pockets 80 mm wide, 190 mm long and 28 mm thick sewn in a row, each
  // under a flap with a press stud, and its sling strap 30 mm wide laid out in a loop from both ends to a buckle.
  h.compound('cheap_ammo_pouch', 0.063, [
    box('panel', 'cloth', [-0.175, 0, -0.1], [0.175, 0.004, 0.1]),
  ] + std.flattenArrays([
    local x = -0.1305 + k * 0.087;
    [
      box('pocket-%d' % k, 'cloth', [x - 0.04, 0.004, -0.09], [x + 0.04, 0.028, 0.095]),
      box('flap-%d' % k, 'flap', [x - 0.042, 0.028, -0.092], [x + 0.042, 0.031, -0.035]),
      h.disc('stud-%d' % k, 'stud', 0.006, 0.031, 0.034, x, -0.045),
    ]
    for k in std.range(0, 3)
  ]) + [
    h.prism('sling-l', 'strap', 'y', [[-0.09, -0.175], [-0.09, -0.145], [-0.40, 0.015], [-0.40, -0.015]], 0, 0.003),
    h.prism('sling-r', 'strap', 'y', [[-0.09, 0.145], [-0.09, 0.175], [-0.40, 0.015], [-0.40, -0.015]], 0, 0.003),
    box('buckle', 'buckle', [-0.02, 0.003, -0.4], [0.02, 0.007, -0.385]),
  ], { cloth: 'cloth-olive-drab', flap: 'webbing-olive-dark', strap: 'cloth-olive-drab', stud: 'plastic-matte-black', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },
]
