local h = import '../compound.libsonnet';
local box = h.box;
local rad(d) = d * std.pi / 180;

// A ball of radius r centred on [x, y, z], turned about y.
local ball(id, slot, r, x, y, z, steps=6) = h.turned(id, slot, 'y', [
  [r - r * std.cos(std.pi * i / steps), r * std.sin(std.pi * i / steps)]
  for i in std.range(0, steps)
], [x, y - r, z]);
// A flat ring lying on y from y0 to y1 between radii r0 and r1, round [cx, cz].
local ring(id, slot, r0, r1, y0, y1, cx=0, cz=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [cx, y0, cz]);
// A chain lying flat round [cx, cz] at radius r over [a0, a1] degrees (0 points to +z): `n` links that alternate
// lying flat and standing on edge, so the chain reads as links rather than a wire.
local chain(prefix, slot, r, n, a0=0, a1=360, cx=0, cz=0, w=0.002) = std.flattenArrays([
  local s = a0 + (a1 - a0) * i / n, e = a0 + (a1 - a0) * (i + 1) / n;
  if i % 2 == 0 then
    h.crescent('%s-%d' % [prefix, i], slot, r - w, r + w, s, e, 1, 0, 0.002, cx, cz)
  else
    h.crescent('%s-%d' % [prefix, i], slot, r - w / 2, r + w / 2, s, e, 1, 0, 0.004, cx, cz)
  for i in std.range(0, n - 1)
]);
// The [x, z] point at `ang` degrees on a circle of radius r round [cx, cz].
local onArc(r, ang, cx=0, cz=0) = [cx + r * std.sin(rad(ang)), cz + r * std.cos(rad(ang))];
// A flat convex polygon of [x, z] points lying on y from y0 to y1.
local flat(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y0, y1);
// An oval outline of `n` points, half-axes a along x and b along z, round [cx, cz].
local oval(a, b, n=16, cx=0, cz=0) = [[cx + a * std.cos(2 * std.pi * i / n), cz + b * std.sin(2 * std.pi * i / n)] for i in std.range(0, n - 1)];
// A small flower charm lying flat at [x, z]: five round petals round a centre bead.
local flower(prefix, slot, x, z, y0=0.002) =
  [ball(prefix + '-heart', 'heart', 0.002, x, y0 + 0.002, z)]
  + [
    local p = onArc(0.0042, i * 72 + 36, x, z);
    h.disc('%s-petal-%d' % [prefix, i], slot, 0.003, y0, y0 + 0.002, p[0], p[1])
    for i in std.range(0, 4)
  ];

[
  // A cotton anklet laid out in a loop 90 mm across: a pale twisted cord strung with seven small plastic flower
  // charms, each about 14 mm across, in pink, yellow, blue, orange and white, with a knotted tie at the back.
  h.compound('flower_anklet', 0.0025,
             [ring('cord', 'cord', 0.043, 0.046, 0, 0.002)]
             + [box('knot', 'cord', [-0.004, 0, -0.048], [0.004, 0.004, -0.04])]
             + std.flattenArrays([
               local p = onArc(0.0445, -105 + i * 35);
               flower('flower-%d' % i, ['petal-pink', 'petal-yellow', 'petal-blue', 'petal-orange', 'petal-white'][i % 5], p[0], p[1])
               for i in std.range(0, 6)
             ]),
             {
               cord: 'cord-cotton',
               heart: 'plastic-yellow',
               'petal-pink': 'plastic-pink',
               'petal-yellow': 'plastic-orange',
               'petal-blue': 'plastic-blue',
               'petal-orange': 'plastic-red',
               'petal-white': 'plastic-white',
             })
  + { voxelGrain: 0.002 },

  // A costume headband standing on its ends, front on +z: a black plastic band 150 mm across arching 140 mm high,
  // with two furry brown triangular cat ears 55 mm tall standing on its crown, each with a pale inner ear.
  h.compound('fur_cat_ears', 0.025,
             std.flattenArrays([
               local a0 = -110 + 220 * i / 22, a1 = -110 + 220 * (i + 1) / 22;
               local p(r, a) = [r * std.sin(rad(a)), 0.065 + r * std.cos(rad(a))];
               [h.prism('band-%d' % i, 'band', 'z', [p(0.07, a0), p(0.07, a1), p(0.075, a1), p(0.075, a0)], -0.006, 0.006)]
               for i in std.range(0, 21)
             ])
             + std.flattenArrays([
               local c = [s * 0.075 * std.sin(rad(35)), 0.065 + 0.075 * std.cos(rad(35)) - 0.004];
               local tip = [c[0] + s * 0.012, c[1] + 0.055];
               [
                 h.prism('ear-' + side, 'fur', 'z', [[c[0] - 0.028, c[1] - 0.006 * s], [c[0] + 0.028, c[1] + 0.006 * s], tip], -0.008, 0.008),
                 h.prism('inner-' + side, 'inner', 'z', [[c[0] - 0.016, c[1] + 0.004 - 0.003 * s], [c[0] + 0.016, c[1] + 0.004 + 0.003 * s], [tip[0] - s * 0.003, tip[1] - 0.016]], 0.008, 0.01),
               ]
               for side in ['l', 'r']
               for s in [if side == 'l' then -1 else 1]
             ]),
             { band: 'plastic-black', fur: 'fur-brown', inner: 'fur-pale' })
  + { voxelGrain: 0.002 },

  // A costume tail 600 mm long lying in an S-curve: a furry tawny tube 50 mm thick at the root tapering to a pale tip,
  // with a black plastic belt clip at the root end.
  h.compound('fur_cat_tail', 0.1,
             [
               local t = i / 39;
               local x = -0.25 + 0.5 * t, z = 0.07 * std.sin(2 * std.pi * t * 1.1);
               local r = 0.024 - 0.01 * t;
               ball('fur-%d' % i, if i >= 34 then 'tip' else 'fur', r, x, r, z)
               for i in std.range(0, 39)
             ]
             + [
               box('clip', 'clip', [-0.3, 0.008, -0.012], [-0.262, 0.03, 0.012]),
               box('clip-tongue', 'clip', [-0.3, 0.03, -0.01], [-0.27, 0.036, 0.01]),
             ],
             { fur: 'fur-brown', tip: 'fur-pale', clip: 'plastic-black' })
  + { voxelGrain: 0.004 },

  // A costume collar laid in a ring 120 mm across: a band of white fur 25 mm wide and 20 mm thick, with a small brass
  // bell on a ring at the front and a black snap fastening at the back.
  h.compound('fur_collar', 0.02,
             [ring('band', 'fur', 0.048, 0.062, 0, 0.02)]
             + [
               box('snap', 'snap', [-0.008, 0.008, -0.066], [0.008, 0.022, -0.058]),
               ring('bell-ring', 'bell', 0.002, 0.004, 0.008, 0.012, 0, 0.066),
               ball('bell', 'bell', 0.008, 0, 0.008, 0.076),
               box('bell-slot', 'slit', [-0.004, 0.0105, 0.082], [0.004, 0.0125, 0.0845]),
             ],
             { fur: 'fur-pale', bell: 'metal-gold', snap: 'plastic-black', slit: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },

  // A fine chain anklet laid out in a loop 90 mm across, with a round spring clasp and a short tag at its ends.
  h.compound('gold_anklet', 0.004,
             chain('link', 'chain', 0.045, 40, 8, 352)
             + [
               ball('clasp', 'chain', 0.003, -0.006, 0.003, -0.044),
               box('tag', 'chain', [0.004, 0, -0.047], [0.01, 0.002, -0.043]),
             ],
             { chain: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // A handful of hair beads standing loose in a heap 60 mm across: twelve gold tube beads 10 mm thick and 6 to 10 mm
  // long, each with a 4 mm hole through for a lock of hair, some ridged round the middle and some plain.
  h.compound('gold_hair_beads', 0.01,
             [
               local p = [[-0.018, -0.01, 0], [-0.006, -0.014, 30], [0.008, -0.012, -20], [0.02, -0.006, 70], [-0.016, 0.004, 90],
                          [-0.002, 0.0, 10], [0.012, 0.004, -60], [0.022, 0.012, 15], [-0.012, 0.016, -35], [0.002, 0.018, 50],
                          [0.012, 0.022, 0], [-0.022, 0.022, 60]][i];
               local len = [0.008, 0.006, 0.01, 0.008][i % 4];
               local ridge = i % 3 == 0;
               h.turned('bead-%d' % i, 'bead', 'y',
                        if ridge then [[0, 0.002], [0, 0.0045], [len * 0.3, 0.0045], [len * 0.3, 0.0055], [len * 0.7, 0.0055], [len * 0.7, 0.0045], [len, 0.0045], [len, 0.002], [0, 0.002]]
                        else [[0, 0.002], [0, 0.005], [len, 0.005], [len, 0.002], [0, 0.002]],
                        [p[0] * 1.2, 0, p[1] * 1.2])
               for i in std.range(0, 11)
             ],
             { bead: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // A captive-bead lip ring lying flat, 14 mm across: a hoop of 2 mm wire with a 4 mm bead held in its opening.
  h.compound('gold_lip_ring_loop', 0.0025,
             h.crescent('hoop', 'ring', 0.005, 0.007, 20, 340, 18, 0, 0.002)
             + [ball('bead', 'ring', 0.0025, 0, 0.002, 0.0065)],
             { ring: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // A lip stud standing on its back, 12 mm tall: a flat 6 mm disc back, a short post and a 6 mm ball screwed on top.
  h.compound('gold_lip_ring_stud', 0.003,
             [
               h.disc('back', 'stud', 0.0035, 0, 0.002, 0.001, 0.001),
               h.disc('post', 'stud', 0.001, 0.002, 0.006, 0.001, 0.001),
               ball('ball', 'stud', 0.0028, 0.001, 0.009, 0.001),
             ],
             { stud: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // A seamless nose hoop lying flat, 11 mm across, of fine wire with a narrow gap where it opens to go in.
  h.compound('gold_nose_ring_loop', 0.0005,
             h.crescent('hoop', 'ring', 0.0035, 0.0055, 15, 345, 16, 0, 0.002),
             { ring: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // A nose stud standing on its bent end, 12 mm tall: a 6 mm domed head on top of a short post that bends into an L
  // at its foot.
  h.compound('gold_nose_ring_stud', 0.0005,
             [
               h.disc('head', 'stud', 0.0028, 0.008, 0.01, 0.001, 0.001),
               h.disc('head-crown', 'stud', 0.001, 0.01, 0.0115, 0.001, 0.001),
               h.disc('post', 'stud', 0.001, 0.002, 0.008, 0.001, 0.001),
               box('bend', 'stud', [0, 0, 0], [0.006, 0.002, 0.002]),
             ],
             { stud: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // An open toe ring lying flat, 20 mm across: a 4 mm band with a raised round boss at the front and its ends left
  // apart at the back so it can be squeezed to fit.
  h.compound('gold_toe_ring', 0.003,
             h.crescent('band', 'ring', 0.008, 0.01, 200, 520, 20, 0, 0.004)
             + [ball('boss', 'ring', 0.0025, 0, 0.003, 0.0095)],
             { ring: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // A self-winding wristwatch lying face up with its link bracelet opened out, 210 mm end to end: a 38 mm gold case
  // with a ridged bezel round a white dial and black hands under the crystal, a winding crown on +x, and a gold
  // bracelet of three-piece links running to a fold clasp.
  h.compound('gold_watch', 0.15,
             [
               h.disc('case', 'case', 0.019, 0, 0.009),
               ring('bezel', 'case', 0.0145, 0.0195, 0.009, 0.012),
               h.disc('dial', 'dial', 0.0145, 0.009, 0.01),
               h.disc('crystal', 'crystal', 0.0145, 0.01, 0.0115),
               box('hand-hour', 'hand', [-0.001, 0.0095, -0.009], [0.001, 0.0105, 0.0]),
               box('hand-minute', 'hand', [0, 0.0095, -0.001], [0.012, 0.0105, 0.001]),
               h.rod('crown', 'case', 0.003, 0.019, 0.023, 0.005),
             ]
             + std.flattenArrays([
               local z0 = s * (0.018 + 0.009 * k), z1 = s * (0.018 + 0.009 * k + 0.008);
               [
                 box('link-%s-%d-mid' % [side, k], 'link', [-0.004, 0.001, std.min(z0, z1)], [0.004, 0.006, std.max(z0, z1)]),
                 box('link-%s-%d-l' % [side, k], 'link', [-0.009, 0, std.min(z0, z1)], [-0.0045, 0.0045, std.max(z0, z1)]),
                 box('link-%s-%d-r' % [side, k], 'link', [0.0045, 0, std.min(z0, z1)], [0.009, 0.0045, std.max(z0, z1)]),
               ]
               for side in ['n', 's']
               for s in [if side == 'n' then 1 else -1]
               for k in std.range(0, 8)
             ])
             + [box('clasp', 'link', [-0.009, 0, -0.112], [0.009, 0.007, -0.098])],
             { case: 'metal-gold', dial: 'enamel-white', crystal: 'glass-clear', hand: 'plastic-black', link: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // A fine chain necklace laid out in a loop 140 mm across, with a 26 mm round pendant at the front: a medallion
  // bearing a raised ring and an eight-rayed star of a faith nobody remembers.
  h.compound('holy_symbol', 0.07,
             chain('link', 'chain', 0.07, 56, 10, 350)
             + [
               ring('bail', 'chain', 0.002, 0.004, 0, 0.003, 0, 0.074),
               h.disc('medal', 'medal', 0.013, 0, 0.003, 0, 0.09),
               ring('medal-rim', 'relief', 0.011, 0.013, 0.003, 0.0045, 0, 0.09),
               h.disc('medal-boss', 'relief', 0.003, 0.003, 0.006, 0, 0.09),
             ]
             + [
               local p = onArc(0.0085, i * 45, 0, 0.09);
               local w = if i % 2 == 0 then 0.0015 else 0.001;
               local q = onArc(0.003, i * 45, 0, 0.09);
               local nx = w * std.cos(rad(i * 45)), nz = -w * std.sin(rad(i * 45));
               flat('ray-%d' % i, 'relief', [[q[0] + nx, q[1] + nz], [p[0], p[1]], [q[0] - nx, q[1] - nz]], 0.003, 0.0045)
               for i in std.range(0, 7)
             ],
             { chain: 'metal-gold', medal: 'metal-gold', relief: 'brass-polished' })
  + { voxelGrain: 0.002 },

  // A handmade pendant on a cotton cord laid in a loop 160 mm across: a 40 mm disc whittled from pale wood with a ring
  // and a cross-mark burnt into its face, hung from a cord knotted through a hole at its top.
  h.compound('holy_symbol_wood', 0.0057,
             [ring('cord', 'cord', 0.078, 0.081, 0, 0.003)]
             + [
               box('cord-knot', 'cord', [-0.005, 0, -0.084], [0.005, 0.006, -0.075]),
               box('cord-drop', 'cord', [-0.0015, 0, 0.08], [0.0015, 0.003, 0.092]),
               h.disc('plaque', 'wood', 0.02, 0, 0.006, 0, 0.11),
               ring('burn-ring', 'burn', 0.014, 0.016, 0.006, 0.007, 0, 0.11),
               box('burn-v', 'burn', [-0.0015, 0.006, 0.1], [0.0015, 0.007, 0.12]),
               box('burn-h', 'burn', [-0.01, 0.006, 0.1085], [0.01, 0.007, 0.1115]),
               ring('hole-ring', 'cord', 0.0015, 0.003, 0.006, 0.008, 0, 0.0945),
             ],
             { cord: 'cord-cotton', wood: 'wood-pine', burn: 'bark' })
  + { voxelGrain: 0.002 },

  // An oval brooch lying face up, 36 mm by 26 mm: a domed green jade cabochon in a gold rope-edged bezel, with a
  // steel pin and catch across its back.
  h.compound('jade_brooch', 0.015,
             [
               flat('bezel', 'bezel', oval(0.018, 0.013, 20), 0.002, 0.005),
               flat('stone-0', 'stone', oval(0.0155, 0.0105, 20), 0.005, 0.007),
               flat('stone-1', 'stone', oval(0.0135, 0.009, 20), 0.007, 0.009),
               flat('stone-2', 'stone', oval(0.01, 0.0065, 16), 0.009, 0.011),
               flat('stone-3', 'stone', oval(0.0055, 0.0035, 12), 0.011, 0.012),
               h.rod('pin', 'pin', 0.001, -0.016, 0.014, 0.001),
               box('catch', 'pin', [0.012, 0, -0.003], [0.016, 0.002, 0.003]),
             ]
             + [
               local p = onArc(1, i * 360 / 24);
               ball('rope-%d' % i, 'bezel', 0.0015, 0.0175 * p[0], 0.005, 0.0125 * p[1], 4)
               for i in std.range(0, 23)
             ],
             { bezel: 'metal-gold', stone: 'gem-green', pin: 'steel-bright' })
  + { voxelGrain: 0.002 },
]
