local h = import '../compound.libsonnet';
local box = h.box;
// A pistol holster standing on its toe, its broad face on +z, centred at x = `ox` and z = `oz`: a sheath `len` tall
// and `sw` across, leaning `cant` towards +x at the toe, with a bulge `gw` proud on +x over its top `gh` for the
// trigger guard, cut `cut` below the throat at the front. `thumb` adds a snapped thumb-break loop over the mouth,
// `loop` a belt loop that tall on the back. Slots: body, trim, mouth, strap, stud, loop.
local holster(p, len, sw, t, gw, gh, cut, cant, thumb, loop, ox=0, oz=0, oy=0) =
  local zf = oz + t / 2, zb = oz - t / 2;
  [
    h.prism(p + '-sheath', 'body', 'z', [
      [ox - sw / 2 + cant + 0.006, oy],
      [ox + sw / 2 + cant - 0.006, oy],
      [ox + sw / 2 + cant, oy + 0.012],
      [ox + sw / 2, oy + len],
      [ox - sw / 2, oy + len],
      [ox - sw / 2 + cant, oy + 0.012],
    ], zb, zf),
    h.prism(p + '-guard', 'body', 'z', [
      [ox + sw / 2 - 0.002, oy + len - gh],
      [ox + sw / 2 + gw, oy + len - gh * 0.45],
      [ox + sw / 2 + gw, oy + len - cut],
      [ox + sw / 2 - 0.002, oy + len - cut],
    ], oz - t * 0.4, oz + t * 0.4),
    box(p + '-toe', 'trim', [ox - sw / 2 + cant + 0.002, oy, zb - 0.001], [ox + sw / 2 + cant - 0.002, oy + 0.012, zf + 0.001]),
    box(p + '-rim', 'trim', [ox - sw / 2 - 0.001, oy + len - 0.008, zb - 0.001], [ox + sw / 2 + 0.001, oy + len, zf + 0.001]),
    box(p + '-mouth', 'mouth', [ox - sw / 2 + 0.004, oy + len - 0.004, zb + 0.004], [ox + sw / 2 - 0.004, oy + len + 0.001, zf - 0.004]),
  ]
  + (if thumb then [
       box(p + '-break-back', 'strap', [ox - 0.009, oy + len - 0.01, zb - 0.004], [ox + 0.009, oy + len + 0.032, zb]),
       box(p + '-break-top', 'strap', [ox - 0.009, oy + len + 0.028, zb - 0.004], [ox + 0.009, oy + len + 0.032, zf + 0.004]),
       box(p + '-break-front', 'strap', [ox - 0.01, oy + len - 0.03, zf], [ox + 0.01, oy + len + 0.032, zf + 0.004]),
       h.stud(p + '-break-stud', 'stud', ox, oy + len - 0.018, zf + 0.004, 0.006, 0.004),
     ] else [])
  + (if loop > 0 then [
       box(p + '-loop', 'loop', [ox - 0.026, oy + len - loop, zb - 0.014], [ox + 0.026, oy + len - 0.006, zb - 0.009]),
       box(p + '-loop-top', 'loop', [ox - 0.026, oy + len - 0.014, zb - 0.014], [ox + 0.026, oy + len - 0.006, zb]),
       box(p + '-loop-foot', 'loop', [ox - 0.026, oy + len - loop, zb - 0.014], [ox + 0.026, oy + len - loop + 0.008, zb]),
     ] else []);
// A pistol holster lying on its side, broad face up, its length along z: the mouth at z = `z0` and the toe `len`
// towards `dir` (+1 or -1), centred at x = `cx`, `t` thick, with a trigger-guard bulge `gw` proud on -x over `gh`
// behind the mouth. Slots: body, trim, mouth.
local lyingHolster(p, len, sw, t, gw, gh, cx, z0, dir) =
  local z(a) = z0 + dir * a;
  [
    h.prism(p + '-sheath', 'body', 'y', [
      [z(0), cx - sw / 2], [z(0), cx + sw / 2], [z(len - 0.012), cx + sw / 2],
      [z(len), cx + sw / 2 - 0.006], [z(len), cx - sw / 2 + 0.006], [z(len - 0.012), cx - sw / 2],
    ], 0, t),
    h.prism(p + '-guard', 'body', 'y', [
      [z(0.01), cx - sw / 2 + 0.002], [z(0.01), cx - sw / 2 - gw], [z(gh * 0.55), cx - sw / 2 - gw], [z(gh), cx - sw / 2 + 0.002],
    ], 0, t * 0.8),
    box(p + '-toe', 'trim', [cx - sw / 2 - 0.001, 0, std.min(z(len), z(len - 0.012))], [cx + sw / 2 + 0.001, t + 0.001, std.max(z(len), z(len - 0.012))]),
    box(p + '-rim', 'trim', [cx - sw / 2 - 0.001, 0, std.min(z(0), z(0.008))], [cx + sw / 2 + 0.001, t + 0.001, std.max(z(0), z(0.008))]),
    box(p + '-mouth', 'mouth', [cx - sw / 2 + 0.004, 0.004, std.min(z(-0.001), z(0.004))], [cx + sw / 2 - 0.004, t - 0.004, std.max(z(-0.001), z(0.004))]),
  ];
// A diagonal strap lying flat on the floor from [xa, za] to [xb, zb], `w` wide and `t` thick.
local strapFlat(id, slot, a, b, w, t, y0=0) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz), nx = -dz / len * w / 2, nz = dx / len * w / 2;
  h.prism(id, slot, 'y', [[a[1] + nz, a[0] + nx], [b[1] + nz, b[0] + nx], [b[1] - nz, b[0] - nx], [a[1] - nz, a[0] - nx]], y0, y0 + t);
// A buckle frame lying flat round a strap's end at x = x0 on a strap centred at z = cz: an open rectangle `bw` along
// x and `bh` across z, bar `b` thick, with its tongue lying across the strap. Slot buckle.
local buckleFrame(prefix, x0, bw, bh, b, y0, y1, cz) = [
  box(prefix + '-left', 'buckle', [x0 - bw, y0, cz - bh / 2], [x0 - bw + b, y1, cz + bh / 2]),
  box(prefix + '-right', 'buckle', [x0 - b, y0, cz - bh / 2], [x0, y1, cz + bh / 2]),
  box(prefix + '-front', 'buckle', [x0 - bw, y0, cz + bh / 2 - b], [x0, y1, cz + bh / 2]),
  box(prefix + '-back', 'buckle', [x0 - bw, y0, cz - bh / 2], [x0, y1, cz - bh / 2 + b]),
  box(prefix + '-tongue', 'buckle', [x0 - bw + b, y1 - 0.002, cz - 0.002], [x0 + 0.004, y1, cz + 0.002]),
];
// A belt `len` long, `w` wide and `t` thick laid flat in a U, outside up: the buckle run along +z and the tip run
// along -z, both ending at x = -run / 2, joined by a bend at +x with `gap` between the runs. Slots: strap, keeper,
// buckle, hole.
local beltRun(len, w, gap) = (len - std.pi * (gap / 2 + w / 2)) / 2;
local beltU(len, w, t, holes, bw, bh, b, gap=0.04) =
  local run = beltRun(len, w, gap), x0 = -run / 2, x1 = run / 2, zu = gap / 2 + w / 2, tip = w / 2;
  [
    box('run-buckle', 'strap', [x0, 0, gap / 2], [x1, t, gap / 2 + w]),
    box('run-tip', 'strap', [x0 + tip, 0, -gap / 2 - w], [x1, t, -gap / 2]),
    h.prism('tip', 'strap', 'y', [[-zu - w / 2, x0 + tip], [-zu + w / 2, x0 + tip], [-zu + w * 0.25, x0 + tip * 0.25], [-zu - w * 0.25, x0 + tip * 0.25]], 0, t),
    box('keeper', 'keeper', [x0 + bw + 0.006, 0, zu - w / 2 - 0.002], [x0 + bw + 0.018, t + 0.002, zu + w / 2 + 0.002]),
  ] + h.crescent('bend', 'strap', gap / 2, gap / 2 + w, 0, 180, 12, 0, t, x1, 0)
  + buckleFrame('buckle', x0 + bw * 0.25, bw, bh, b, 0, t + 0.004, zu) + [
    h.disc('hole-%d' % i, 'hole', 0.0025, t, t + 0.0005, x0 + 0.1 + i * 0.025, -zu)
    for i in std.range(0, holes - 1)
  ];
local leather = {
  body: 'leather-brown',
  trim: 'leather-chestnut',
  mouth: 'leather-black',
  strap: 'leather-chestnut',
  stud: 'brass-dull',
  loop: 'leather-chestnut',
};
local nylon = {
  body: 'nylon-black',
  trim: 'webbing-black',
  mouth: 'plastic-matte-black',
  strap: 'webbing-black',
  stud: 'plastic-matte-black',
  loop: 'webbing-black',
};
[
  // A brown leather belt holster 180 mm tall, 60 mm across at the trigger guard and 32 mm thick, with a thumb-break
  // strap snapped over the mouth and a belt loop on its back.
  h.compound('holster', 0.21, holster('holster', 0.18, 0.036, 0.032, 0.03, 0.08, 0.012, 0.004, true, 0.08), leather)
  + { voxelGrain: 0.004 },

  // A tan leather fast-draw holster 150 mm tall, raked forward 30 mm at the toe, open-topped and cut low over the
  // trigger guard so the gun clears it at once, with a steel tension screw and a belt loop on its back.
  h.compound('fast_draw_holster', 0.17, holster('fd', 0.15, 0.036, 0.03, 0.03, 0.095, 0.03, 0.03, false, 0.07) + [
    h.stud('fd-screw', 'stud', 0.004, 0.1, 0.015, 0.005, 0.003),
  ], leather { body: 'leather-tan', stud: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // A chestnut leather holster 260 mm tall for a long-barrelled handgun, hung from a belt shank 90 mm above its
  // mouth, with a thumb break and a leg strap wrapped round the sheath above its toe, lying in a closed, buckled loop
  // on the floor behind it.
  h.compound('large_holster', 0.45, holster('xl', 0.26, 0.042, 0.04, 0.032, 0.09, 0.015, 0.006, true, 0) + [
    box('shank', 'loop', [-0.028, 0.14, -0.026], [0.028, 0.35, -0.02]),
    box('shank-top', 'loop', [-0.028, 0.344, -0.04], [0.028, 0.35, -0.02]),
    box('shank-fold', 'loop', [-0.028, 0.29, -0.04], [0.028, 0.35, -0.034]),
    h.stud('shank-rivet', 'stud', 0, 0.3, -0.02, 0.005, 0.003),
    box('leg-tab', 'loop', [-0.015, 0, -0.026], [0.015, 0.05, -0.02]),
    box('leg-band', 'loop', [-0.026, 0.026, -0.022], [0.032, 0.05, 0.022]),
    box('leg-front', 'loop', [-0.07, 0, -0.046], [0.07, 0.004, -0.02]),
    box('leg-back', 'loop', [-0.07, 0, -0.16], [0.07, 0.004, -0.135]),
    box('leg-left', 'loop', [-0.07, 0, -0.16], [-0.045, 0.004, -0.02]),
    box('leg-right', 'loop', [0.045, 0, -0.16], [0.07, 0.004, -0.02]),
  ] + buckleFrame('leg-buckle', 0.08, 0.03, 0.035, 0.005, 0, 0.008, -0.075 + 0.0), leather { body: 'leather-chestnut', trim: 'leather-brown', strap: 'leather-brown', loop: 'leather-brown', buckle: 'brass-dull' })
  + { voxelGrain: 0.004 },

  // Two brown leather holsters 180 mm tall side by side, 85 mm apart, each with its own thumb break, sewn to a
  // shared back strap with a belt loop behind each.
  h.compound('double_holster', 0.46, holster('left', 0.18, 0.036, 0.032, 0.03, 0.08, 0.012, 0.004, true, 0.08, -0.045)
    + holster('right', 0.18, 0.036, 0.032, 0.03, 0.08, 0.012, 0.004, true, 0.08, 0.04) + [
    box('bridge', 'loop', [-0.07, 0.11, -0.022], [0.065, 0.15, -0.016]),
  ], leather)
  + { voxelGrain: 0.004 },

  // Two charcoal nylon holsters 180 mm tall with black webbing trim, the outer one riding 44 mm in front of the inner
  // one and 30 mm lower on a stitched spacer strap, each with a thumb break, and a belt loop behind the inner one.
  h.compound('double_holster_tandem', 0.22, holster('inner', 0.18, 0.036, 0.032, 0.03, 0.08, 0.012, 0.004, true, 0.08, 0, 0, 0.03)
    + holster('outer', 0.18, 0.036, 0.032, 0.03, 0.08, 0.012, 0.004, true, 0, -0.018, 0.044, 0) + [
    box('spacer', 'loop', [-0.03, 0.09, 0.016], [0.012, 0.16, 0.028]),
    box('spacer-band', 'trim', [-0.031, 0.12, 0.014], [0.013, 0.13, 0.03]),
  ], nylon { body: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A brown leather shoulder holster laid flat, 640 mm across: two shoulder loops of 25 mm strap meeting at a
  // diamond patch behind the neck, a holster 190 mm long lying across the left loop's end and a twin magazine pouch
  // with snapped flaps on the right.
  h.compound('shoulder_holster', 0.48, [
    h.prism('patch', 'trim', 'y', [[-0.09, 0], [-0.05, -0.04], [-0.01, 0], [-0.05, 0.04]], 0.004, 0.008),
  ] + std.flattenArrays([
    [
      strapFlat('loop-%d-a' % i, 'strap', [0, -0.05], [s * 0.14, 0.08], 0.025, 0.004),
      strapFlat('loop-%d-b' % i, 'strap', [s * 0.14, 0.08], [s * 0.25, 0.0], 0.025, 0.004),
      strapFlat('loop-%d-c' % i, 'strap', [s * 0.25, -0.03], [s * 0.14, -0.15], 0.025, 0.004),
      strapFlat('loop-%d-d' % i, 'strap', [s * 0.14, -0.15], [0, -0.05], 0.025, 0.004),
    ]
    for i in [0, 1]
    for s in [[-1, 1][i]]
  ]) + lyingHolster('gun', 0.19, 0.036, 0.03, 0.026, 0.08, -0.28, 0.07, -1) + [
    box('gun-break', 'strap', [-0.302, 0.03, 0.035], [-0.258, 0.034, 0.053]),
    h.disc('gun-break-stud', 'stud', 0.006, 0.034, 0.037, -0.266, 0.044),
    box('mag-a', 'body', [0.25, 0, -0.07], [0.29, 0.026, 0.05]),
    box('mag-b', 'body', [0.294, 0, -0.07], [0.334, 0.026, 0.05]),
    box('mag-flap-a', 'strap', [0.249, 0.026, 0.0], [0.291, 0.03, 0.052]),
    box('mag-flap-b', 'strap', [0.293, 0.026, 0.0], [0.335, 0.03, 0.052]),
    h.disc('mag-stud-a', 'stud', 0.005, 0.03, 0.033, 0.27, 0.03),
    h.disc('mag-stud-b', 'stud', 0.005, 0.03, 0.033, 0.314, 0.03),
  ], leather)
  + { voxelGrain: 0.004 },

  // A black nylon single-point sling laid flat: a body loop 1.3 m round of 32 mm webbing with a sliding adjuster,
  // and a 200 mm lead with a padded bungee section ending in a steel swivel snap hook.
  h.compound('single_point_sling', 0.19, h.strapLoop('loop', 'strap', 0.42, 0.14, 0.032, 0.003)
    + [
      box('adjuster', 'buckle', [-0.04, 0, 0.12], [-0.01, 0.009, 0.16]),
      box('adjuster-bar', 'buckle', [-0.027, 0.009, 0.118], [-0.023, 0.011, 0.162]),
      box('lead', 'strap', [0.35, 0, -0.016], [0.42, 0.003, 0.016]),
      h.tube('bungee', 'bungee', 0, 0.014, 0.42, 0.52, 0.014, 0),
      box('lead-end', 'strap', [0.52, 0, -0.012], [0.55, 0.004, 0.012]),
      h.disc('swivel', 'hook', 0.012, 0, 0.01, 0.565, 0),
      box('hook-shank', 'hook', [0.575, 0, -0.005], [0.62, 0.008, 0.005]),
      box('hook-jaw', 'hook', [0.605, 0, 0.005], [0.62, 0.008, 0.02]),
      box('hook-gate', 'hook', [0.585, 0.002, 0.014], [0.607, 0.006, 0.019]),
      box('join', 'buckle', [0.33, 0, -0.02], [0.36, 0.008, 0.02]),
    ], { strap: 'webbing-black', buckle: 'plastic-matte-black', bungee: 'cloth-charcoal', hook: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A western gun belt 1.1 m long and 65 mm wide in brown leather, laid in a U with a brass buckle, a row of
  // cartridge loops along the back of the tip run and a holster 200 mm long hanging from a slotted drop loop on the
  // buckle run, its mouth at the belt and a leather hammer thong lying across it.
  h.compound('western_gun_belt', 0.95, beltU(1.1, 0.065, 0.005, 4, 0.05, 0.075, 0.008) + [
    box('cartridge-loop-%d' % i, 'loop', [-0.03 + i * 0.016, 0.005, -0.098], [-0.03 + i * 0.016 + 0.011, 0.013, -0.028])
    for i in std.range(0, 13)
  ] + [
    box('drop-loop', 'loop', [0.12, 0.005, 0.016], [0.19, 0.009, 0.109]),
  ] + lyingHolster('gun', 0.2, 0.036, 0.03, 0.026, 0.08, 0.155, 0.11, 1) + [
    box('thong', 'strap', [0.12, 0.03, 0.14], [0.19, 0.033, 0.148]),
  ], leather { stud: 'brass-dull', keeper: 'leather-chestnut', buckle: 'brass-dull', hole: 'leather-black' })
  + { voxelGrain: 0.004 },
]
