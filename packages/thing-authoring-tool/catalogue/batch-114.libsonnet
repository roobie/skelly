local h = import '../compound.libsonnet';
local box = h.box;

// Coats and jackets folded on a shelf: each lies on h.foldedGarment, `w` across x and `d` along z, its top face at
// `ht`, with the collar at the +z end (front) and the hem folded under at the -z end.

// A flat convex outline of [x, z] points lying on a top face from y to y + t.
local flat(id, slot, pts, y, t=0.004) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y, y + t);

// A strip `w` wide lying on a top face at y, from [xa, za] to [xb, zb].
local strip(id, slot, a, b, y, w=0.012, t=0.004) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  flat(id, slot, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], y, t);

// A collar round the neck at (0, cz), open towards the hem by `gap` degrees either side.
local collar(prefix, slot, r, wd, y, ht, cz, gap=35) = h.crescent(prefix, slot, r, r + wd, -180 + gap, 180 - gap, 12, y, y + ht, 0, cz);

// Round buttons or snaps at x along each z in zs, on a face at y.
local buttons(prefix, slot, x, zs, y, r=0.007, t=0.004) = [
  h.disc('%s-%d' % [prefix, i], slot, r, y, y + t, x, zs[i])
  for i in std.range(0, std.length(zs) - 1)
];

// A patch pocket centred on (x, z) with an optional flap across its collar-side edge.
local pocket(id, slot, flapSlot, x, z, w, d, y, flap=0.03) = [
  box(id, slot, [x - w / 2, y, z - d / 2], [x + w / 2, y + 0.004, z + d / 2]),
] + (if flapSlot == null then [] else [
       box(id + '-flap', flapSlot, [x - w / 2 - 0.003, y + 0.004, z + d / 2 - flap], [x + w / 2 + 0.003, y + 0.008, z + d / 2 + 0.003]),
     ]);

// A belt, sash or tie wrapped across the bundle at z, over the top and down both sides.
local bandX(id, slot, z, bw, w, ht, t=0.004) = [
  box(id + '-top', slot, [-w / 2 - t, ht, z - bw / 2], [w / 2 + t, ht + t, z + bw / 2]),
  box(id + '-left', slot, [-w / 2 - t, 0, z - bw / 2], [-w / 2, ht, z + bw / 2]),
  box(id + '-right', slot, [w / 2, 0, z - bw / 2], [w / 2 + t, ht, z + bw / 2]),
];

// A hood folded flat on the top face behind the collar, its crown draped over the front edge.
local hood(prefix, slot, w, d, ht, hw, hl, t=0.012) = [
  flat(prefix + '-flat', slot, [[-hw / 2, d / 2], [hw / 2, d / 2], [hw / 2 - 0.02, d / 2 - hl * 0.6], [0, d / 2 - hl], [-hw / 2 + 0.02, d / 2 - hl * 0.6]], ht, t),
  box(prefix + '-drape', slot, [-hw / 2, ht * 0.35, d / 2], [hw / 2, ht + t, d / 2 + t]),
];

// The hakama folded in a long bundle, pleats running its length, the stiff back board at the +z end and the long
// ties crossed over the top and wrapped round it.
local hakama(id, mass) =
  local w = 0.3, d = 0.42, ht = 0.045;
  h.compound(id, mass, h.foldedGarment(w, d, ht, 3) + [
    strip('pleat-%d' % i, 'pleat', [x, d / 2 - 0.1], [x, -d / 2 + 0.02], ht, 0.006, 0.003)
    for i in std.range(0, 4)
    for x in [-0.1 + i * 0.05]
  ] + [
    flat('board', 'cloth', [[-0.1, d / 2], [0.1, d / 2], [0.075, d / 2 - 0.09], [-0.075, d / 2 - 0.09]], ht, 0.008),
    strip('tie-a', 'tie', [-w / 2, 0.08], [w / 2, -0.12], ht + 0.003, 0.016),
    strip('tie-b', 'tie', [w / 2, 0.08], [-w / 2, -0.12], ht + 0.007, 0.016),
    box('knot', 'tie', [-0.025, ht + 0.003, -0.04], [0.025, ht + 0.018, 0.0]),
  ] + bandX('tie-wrap', 'tie', -0.02, 0.016, w, ht), { cloth: 'cloth-navy', pleat: 'cloth-black', tie: 'cloth-navy' })
  + { voxelGrain: 0.004 };

[
  // A black hooded robe folded flat, 340 mm by 280 mm and 50 mm tall in four layers: the long pointed hood laid
  // over the top with its crown draped down the front, and a pale cord belt tied round the bundle.
  local w = 0.34, d = 0.28, ht = 0.05;
  h.compound('grim_reaper_robe_faceless', 0.8, h.foldedGarment(w, d, ht, 4)
                                                 + hood('hood', 'hood', w, d, ht, 0.24, 0.24)
                                                 + [
                                                   strip('hood-seam', 'seam', [0, d / 2], [0, d / 2 - 0.22], ht + 0.012, 0.006, 0.002),
                                                 ]
                                                 + bandX('cord', 'cord', -0.08, 0.012, w, ht + 0.012)
                                                 + [
                                                   box('cord-knot', 'cord', [0.04, ht + 0.012, -0.095], [0.07, ht + 0.03, -0.065]),
                                                   strip('cord-end-a', 'cord', [0.06, -0.08], [0.1, -d / 2], ht + 0.012, 0.008),
                                                   strip('cord-end-b', 'cord', [0.05, -0.08], [0.06, -d / 2], ht + 0.012, 0.008),
                                                 ], { cloth: 'cloth-black', hood: 'cloth-black', seam: 'plastic-charcoal', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A navy pleated hakama folded in a long bundle, 300 mm by 420 mm and 45 mm tall, with its back board at one end
  // and the long ties crossed over the top.
  hakama('hakama', 0.9),

  // A plain black practice hakama folded the same way, lighter cloth.
  hakama('hakama_gi', 0.7) + { parts: [super.parts[0] { finish: { cloth: 'cloth-black', pleat: 'plastic-charcoal', tie: 'cloth-black' } }] },

  // A black haori folded flat, 380 mm by 340 mm and 40 mm tall: the collar band running down both front edges, the
  // wide sleeves folded in along each side, gold crests and a sprig of gold embroidery, and a gold tie cord.
  local w = 0.38, d = 0.34, ht = 0.04;
  h.compound('haori', 1.3, h.foldedGarment(w, d, ht, 3) + [
    box('sleeve-' + s, 'cloth', [if s == 'l' then -w / 2 else w / 2 - 0.09, ht, -d / 2 + 0.03], [if s == 'l' then -w / 2 + 0.09 else w / 2, ht + 0.006, d / 2 - 0.02])
    for s in ['l', 'r']
  ] + [
    strip('collar-l', 'collar', [-0.03, d / 2], [-0.06, -d / 2], ht + 0.006, 0.026),
    strip('collar-r', 'collar', [0.03, d / 2], [0.06, -d / 2], ht + 0.006, 0.026),
    strip('cord-l', 'gold', [-0.045, 0.0], [-0.01, -0.01], ht + 0.01, 0.006),
    strip('cord-r', 'gold', [0.045, 0.0], [0.01, -0.01], ht + 0.01, 0.006),
    h.disc('cord-knot', 'gold', 0.01, ht + 0.01, ht + 0.018, 0, -0.01),
    h.disc('crest-l', 'gold', 0.016, ht + 0.006, ht + 0.01, -w / 2 + 0.045, d / 2 - 0.06),
    h.disc('crest-r', 'gold', 0.016, ht + 0.006, ht + 0.01, w / 2 - 0.045, d / 2 - 0.06),
    strip('sprig-stem', 'gold', [0.09, -0.13], [0.13, 0.0], ht + 0.006, 0.004),
    strip('sprig-leaf-a', 'gold', [0.1, -0.09], [0.12, -0.1], ht + 0.006, 0.006),
    strip('sprig-leaf-b', 'gold', [0.115, -0.05], [0.095, -0.04], ht + 0.006, 0.006),
    strip('sprig-leaf-c', 'gold', [0.125, -0.02], [0.14, -0.035], ht + 0.006, 0.006),
  ], { cloth: 'cloth-black', collar: 'cloth-black', gold: 'metal-gold' })
  + { voxelGrain: 0.004 },

  // A towelling bathrobe folded thick, 360 mm by 320 mm and 80 mm tall: a wide shawl collar meeting in a V, two patch
  // pockets low on the front, and the belt wrapped round the bundle and knotted on top.
  local w = 0.36, d = 0.32, ht = 0.08;
  h.compound('house_coat', 1.2, h.foldedGarment(w, d, ht, 3) + [
    strip('collar-l', 'collar', [-0.08, d / 2], [0.005, -0.04], ht, 0.05, 0.008),
    strip('collar-r', 'collar', [0.08, d / 2], [-0.005, -0.04], ht, 0.05, 0.008),
  ] + pocket('pocket-l', 'collar', null, -0.11, -0.1, 0.1, 0.1, ht)
  + pocket('pocket-r', 'collar', null, 0.11, -0.1, 0.1, 0.1, ht)
  + bandX('belt', 'belt', 0.0, 0.035, w, ht + 0.008, 0.006) + [
    box('belt-knot', 'belt', [-0.025, ht + 0.014, -0.022], [0.025, ht + 0.034, 0.022]),
    strip('belt-end-a', 'belt', [-0.01, -0.02], [-0.05, -d / 2 + 0.01], ht + 0.014, 0.035, 0.006),
    strip('belt-end-b', 'belt', [0.01, -0.02], [0.06, -d / 2 + 0.02], ht + 0.014, 0.035, 0.006),
  ], { cloth: 'cloth-cream', collar: 'cloth-cream', belt: 'cloth-blue' })
  + { voxelGrain: 0.004 },

  // An olive field jacket folded flat, 380 mm by 340 mm and 70 mm tall: a tall stand collar that hides a rolled hood,
  // a storm flap with snaps down the front, four flapped patch pockets and buttoned epaulettes.
  local w = 0.38, d = 0.34, ht = 0.07, cz = d / 2 - 0.09;
  h.compound('jacket_army', 2.2, h.foldedGarment(w, d, ht, 3)
                                 + collar('collar', 'cloth', 0.07, 0.028, ht, 0.022, cz)
                                 + [box('placket', 'flap', [-0.016, ht, -d / 2], [0.016, ht + 0.005, cz - 0.07])]
                                 + buttons('snap', 'snap', 0, [cz - 0.1, cz - 0.15, cz - 0.2, cz - 0.24], ht + 0.005, 0.006)
                                 + pocket('chest-l', 'cloth', 'flap', -0.09, 0.0, 0.1, 0.1, ht)
                                 + pocket('chest-r', 'cloth', 'flap', 0.09, 0.0, 0.1, 0.1, ht)
                                 + pocket('hip-l', 'cloth', 'flap', -0.1, -0.115, 0.12, 0.09, ht)
                                 + pocket('hip-r', 'cloth', 'flap', 0.1, -0.115, 0.12, 0.09, ht)
                                 + [
                                   strip('epaulette-l', 'flap', [-w / 2 + 0.005, cz + 0.02], [-0.085, cz + 0.035], ht, 0.03),
                                   strip('epaulette-r', 'flap', [w / 2 - 0.005, cz + 0.02], [0.085, cz + 0.035], ht, 0.03),
                                 ]
                                 + buttons('epaulette-button', 'snap', -0.1, [cz + 0.034], ht + 0.004, 0.006)
                                 + buttons('epaulette-button-r', 'snap', 0.1, [cz + 0.034], ht + 0.004, 0.006)
                                 + buttons('pocket-snap', 'snap', -0.09, [0.035], ht + 0.008, 0.005)
                                 + buttons('pocket-snap-r', 'snap', 0.09, [0.035], ht + 0.008, 0.005),
             { cloth: 'cloth-olive-drab', flap: 'cloth-olive-drab', snap: 'steel-parkerized' })
  + { voxelGrain: 0.004 },

  // A grey-green combat blouse folded flat, 360 mm by 320 mm and 50 mm tall: a mandarin collar, a zip under a flap,
  // two breast pockets with angled flaps, and grey hook-and-loop panels above them and between them for patches.
  local w = 0.36, d = 0.32, ht = 0.05, cz = d / 2 - 0.085;
  h.compound('jacket_army_modern', 1, h.foldedGarment(w, d, ht, 3)
                                         + collar('collar', 'cloth', 0.065, 0.02, ht, 0.026, cz, 25)
                                         + [box('placket', 'cloth', [-0.014, ht, -d / 2], [0.014, ht + 0.004, cz - 0.065])]
                                         + std.flattenArrays([
                                           [
                                             flat('pocket-' + s, 'cloth', [[x0, 0.04 + dz0], [x1, 0.04 + dz1], [x1, -0.07], [x0, -0.07]], ht),
                                             flat('pocket-flap-' + s, 'flap', [[x0 - 0.003, 0.045 + dz0], [x1 + 0.003, 0.045 + dz1], [x1 + 0.003, 0.015 + dz1], [x0 - 0.003, 0.015 + dz0]], ht + 0.004),
                                             box('tape-' + s, 'loop', [std.min(x0, x1), ht, 0.075], [std.max(x0, x1), ht + 0.004, 0.1]),
                                           ]
                                           for s in ['l', 'r']
                                           for x0 in [if s == 'l' then -0.16 else 0.16]
                                           for x1 in [if s == 'l' then -0.04 else 0.04]
                                           for dz0 in [-0.015]
                                           for dz1 in [0.015]
                                         ])
                                         + [
                                           box('rank', 'loop', [-0.022, ht + 0.004, -0.02], [0.022, ht + 0.008, 0.04]),
                                           box('pen-pocket', 'flap', [-w / 2 + 0.012, ht, -0.13], [-w / 2 + 0.05, ht + 0.004, -0.09]),
                                         ],
             { cloth: 'cloth-ucp', flap: 'cloth-ucp', loop: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },

  // A white double-breasted chef's jacket folded flat, 360 mm by 320 mm and 50 mm tall: a stand collar, the front
  // panel crossing over to one side, and two columns of black knot buttons.
  local w = 0.36, d = 0.32, ht = 0.05, cz = d / 2 - 0.085;
  h.compound('jacket_chef', 1.4, h.foldedGarment(w, d, ht, 3)
                                  + collar('collar', 'cloth', 0.065, 0.02, ht, 0.026, cz, 30)
                                  + [
                                    flat('panel', 'cloth', [[-0.07, cz - 0.06], [0.04, cz - 0.03], [w / 2 - 0.01, cz - 0.03], [w / 2 - 0.01, -d / 2], [-0.07, -d / 2]], ht, 0.004),
                                    strip('panel-edge', 'piping', [-0.07, cz - 0.06], [-0.07, -d / 2], ht + 0.004, 0.004, 0.002),
                                  ]
                                  + buttons('button-a', 'button', -0.04, [0.03, -0.04, -0.11], ht + 0.004, 0.008)
                                  + buttons('button-b', 'button', 0.1, [0.03, -0.04, -0.11], ht + 0.004, 0.008),
             { cloth: 'cloth-cream', piping: 'cloth-cream', button: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A thin orange emergency windbreaker folded small, 340 mm by 300 mm and 35 mm tall: the hood rolled into the
  // collar, a dark zip down the front, slanted pocket zips, and a yellow reflective band round the chest and sleeves.
  local w = 0.34, d = 0.3, ht = 0.035;
  h.compound('jacket_evac', 0.6, h.foldedGarment(w, d, ht, 2) + [
    h.turned('hood-roll', 'cloth', 'x', [[0, 0], [0, 0.016], [0.24, 0.016], [0.24, 0]], [-0.12, ht + 0.014, d / 2 - 0.03]),
    box('zip', 'zip', [-0.004, ht, -d / 2], [0.004, ht + 0.003, d / 2 - 0.05]),
    strip('pocket-zip-l', 'zip', [-0.13, -0.12], [-0.08, -0.05], ht, 0.006, 0.003),
    strip('pocket-zip-r', 'zip', [0.13, -0.12], [0.08, -0.05], ht, 0.006, 0.003),
  ] + bandX('band', 'band', 0.04, 0.028, w, ht, 0.003), { cloth: 'cloth-orange', zip: 'plastic-charcoal', band: 'reflective-yellow' })
  + { voxelGrain: 0.004 },

  // A red flannel jacket folded flat, 360 mm by 320 mm and 70 mm tall, checked with dark stripes: a brown corduroy
  // collar, a button front and two flapped chest pockets.
  local w = 0.36, d = 0.32, ht = 0.07, cz = d / 2 - 0.09;
  h.compound('jacket_flannel', 0.8, h.foldedGarment(w, d, ht, 3) + [
    box('check-z-%d' % i, 'check', [x - 0.007, ht, -d / 2], [x + 0.007, ht + 0.002, d / 2 + 0.002])
    for i in std.range(0, 5)
    for x in [-0.15 + i * 0.06]
  ] + [
    box('check-x-%d' % i, 'check', [-w / 2, ht, z - 0.007], [w / 2, ht + 0.002, z + 0.007])
    for i in std.range(0, 4)
    for z in [-0.13 + i * 0.065]
  ] + [
    box('check-front-%d' % i, 'check', [x - 0.007, 0, d / 2], [x + 0.007, ht, d / 2 + 0.002])
    for i in std.range(0, 5)
    for x in [-0.15 + i * 0.06]
  ] + collar('collar', 'collar', 0.07, 0.03, ht, 0.012, cz)
  + [box('placket', 'cloth', [-0.016, ht, -d / 2], [0.016, ht + 0.006, cz - 0.07])]
  + buttons('button', 'button', 0, [cz - 0.1, cz - 0.15, cz - 0.2, cz - 0.23], ht + 0.006, 0.006)
  + pocket('chest-l', 'cloth', 'cloth', -0.09, 0.0, 0.09, 0.1, ht + 0.002)
  + pocket('chest-r', 'cloth', 'cloth', 0.09, 0.0, 0.09, 0.1, ht + 0.002),
             { cloth: 'cloth-red', check: 'cloth-black', collar: 'cloth-brown', button: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },

  // A denim jacket folded flat, 360 mm by 320 mm and 60 mm tall: a pointed collar, a yoke seam, two chest pockets
  // with pointed flaps, a buttoned waistband and brass buttons down the front.
  local w = 0.36, d = 0.32, ht = 0.06, cz = d / 2 - 0.085;
  h.compound('jacket_jean', 1, h.foldedGarment(w, d, ht, 3)
                                 + collar('collar', 'cloth', 0.065, 0.03, ht, 0.008, cz, 40)
                                 + [
                                   flat('collar-point-l', 'cloth', [[-0.035, cz - 0.05], [-0.075, cz - 0.04], [-0.04, cz - 0.1]], ht, 0.008),
                                   flat('collar-point-r', 'cloth', [[0.035, cz - 0.05], [0.075, cz - 0.04], [0.04, cz - 0.1]], ht, 0.008),
                                   strip('yoke', 'stitch', [-w / 2, -0.015], [w / 2, -0.015], ht, 0.004, 0.002),
                                   box('placket', 'cloth', [-0.016, ht, -d / 2 + 0.04], [0.016, ht + 0.004, cz - 0.065]),
                                   box('waistband', 'cloth', [-w / 2, ht, -d / 2], [w / 2, ht + 0.005, -d / 2 + 0.04]),
                                 ]
                                 + std.flattenArrays([
                                   [
                                     box('pocket-' + s, 'cloth', [x - 0.045, ht, -0.1], [x + 0.045, ht + 0.004, -0.03]),
                                     flat('pocket-flap-' + s, 'cloth', [[x - 0.048, -0.028], [x + 0.048, -0.028], [x + 0.048, -0.055], [x, -0.075], [x - 0.048, -0.055]], ht + 0.004),
                                     strip('seam-' + s, 'stitch', [x, -0.1], [x, -d / 2 + 0.04], ht, 0.004, 0.002),
                                   ]
                                   for s in ['l', 'r']
                                   for x in [if s == 'l' then -0.09 else 0.09]
                                 ])
                                 + buttons('button', 'button', 0, [cz - 0.1, -0.06, -0.11], ht + 0.004, 0.007)
                                 + buttons('pocket-button-l', 'button', -0.09, [-0.062], ht + 0.008, 0.006)
                                 + buttons('pocket-button-r', 'button', 0.09, [-0.062], ht + 0.008, 0.006)
                                 + buttons('band-button-l', 'button', -0.15, [-d / 2 + 0.02], ht + 0.005, 0.006)
                                 + buttons('band-button-r', 'button', 0.15, [-d / 2 + 0.02], ht + 0.005, 0.006),
             { cloth: 'cloth-denim', stitch: 'leather-tan', button: 'brass-dull' })
  + { voxelGrain: 0.004 },

  // A black leather motorcycle jacket folded flat, 360 mm by 300 mm and 70 mm tall: wide lapels with snap studs, a
  // silver zip running off-centre down the front, slanted zip pockets and a buckled belt across the hem.
  local w = 0.36, d = 0.3, ht = 0.07, cz = d / 2 - 0.08;
  h.compound('jacket_leather', 2.2, h.foldedGarment(w, d, ht, 3)
                                     + collar('collar', 'cloth', 0.06, 0.025, ht, 0.01, cz, 40)
                                     + [
                                       flat('lapel-l', 'cloth', [[-0.04, cz - 0.04], [-0.13, cz - 0.03], [-0.06, cz - 0.15]], ht, 0.008),
                                       flat('lapel-r', 'cloth', [[0.04, cz - 0.04], [0.13, cz - 0.03], [0.06, cz - 0.15]], ht, 0.008),
                                       strip('zip-a', 'zip', [0.07, cz - 0.07], [0.035, -0.04], ht, 0.008),
                                       strip('zip-b', 'zip', [0.035, -0.04], [0.035, -d / 2 + 0.04], ht, 0.008),
                                       strip('pocket-zip-l', 'zip', [-0.15, -0.1], [-0.07, -0.05], ht, 0.006),
                                       strip('pocket-zip-r', 'zip', [0.14, -0.1], [0.08, -0.06], ht, 0.006),
                                       box('belt', 'cloth', [-w / 2, ht, -d / 2], [w / 2, ht + 0.006, -d / 2 + 0.035]),
                                       box('buckle', 'zip', [0.12, ht + 0.006, -d / 2 + 0.002], [0.15, ht + 0.01, -d / 2 + 0.033]),
                                     ]
                                     + buttons('stud-l', 'zip', -0.11, [cz - 0.04], ht + 0.008, 0.005)
                                     + buttons('stud-r', 'zip', 0.11, [cz - 0.04], ht + 0.008, 0.005),
             { cloth: 'leather-black', zip: 'metal-silver' })
  + { voxelGrain: 0.004 },

  // A thin khaki cotton jacket folded flat, 340 mm by 300 mm and 40 mm tall: the hood laid on top with its crown
  // draped over the front edge and two pale drawcords, a zip down the front and two pocket welts.
  local w = 0.34, d = 0.3, ht = 0.04;
  h.compound('jacket_light', 0.5, h.foldedGarment(w, d, ht, 3)
                                    + hood('hood', 'cloth', w, d, ht, 0.22, 0.18, 0.01)
                                    + [
                                      box('zip', 'zip', [-0.004, ht, -d / 2], [0.004, ht + 0.003, d / 2 - 0.18]),
                                      strip('cord-l', 'cord', [-0.025, d / 2 - 0.17], [-0.045, d / 2 - 0.26], ht, 0.005),
                                      strip('cord-r', 'cord', [0.025, d / 2 - 0.17], [0.04, d / 2 - 0.26], ht, 0.005),
                                      strip('welt-l', 'cloth', [-0.13, -0.11], [-0.09, -0.05], ht, 0.012),
                                      strip('welt-r', 'cloth', [0.13, -0.11], [0.09, -0.05], ht, 0.012),
                                    ],
             { cloth: 'cloth-khaki', zip: 'plastic-charcoal', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A black wrap-over jacket folded flat, 320 mm by 280 mm and 30 mm tall: the collar band crossing the chest, a
  // dark indigo sash tied round it, and a pair of cloth gauntlets with thumb loops laid on top.
  local w = 0.32, d = 0.28, ht = 0.03;
  h.compound('jacket_ninja', 0.5, h.foldedGarment(w, d, ht, 2) + [
    strip('collar-a', 'cloth', [-0.08, d / 2], [0.1, -0.03], ht, 0.03),
    strip('collar-b', 'cloth', [0.08, d / 2], [0.02, 0.06], ht + 0.004, 0.03),
  ] + bandX('sash', 'sash', -0.06, 0.05, w, ht, 0.004) + [
    box('sash-knot', 'sash', [-0.13, ht + 0.004, -0.085], [-0.09, ht + 0.02, -0.035]),
    strip('sash-end', 'sash', [-0.11, -0.06], [-0.13, -d / 2], ht + 0.004, 0.04),
  ] + std.flattenArrays([
    [
      flat('gauntlet-' + s, 'gauntlet', [[x - 0.035, 0.12], [x + 0.035, 0.12], [x + 0.028, -0.05], [x - 0.028, -0.05]], ht + 0.008, 0.012),
      strip('thumb-' + s, 'sash', [x - 0.02, -0.05], [x + 0.02, -0.05], ht + 0.02, 0.008, 0.003),
    ]
    for s in ['l', 'r']
    for x in [if s == 'l' then 0.04 else 0.12]
  ]), { cloth: 'cloth-black', sash: 'cloth-navy', gauntlet: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A red wool varsity jacket folded flat, 380 mm by 320 mm and 70 mm tall: white leather sleeves folded round the
  // sides, a striped knit collar and hem, a row of silver snaps and a cream felt letter on the chest.
  local w = 0.38, d = 0.32, ht = 0.07, cz = d / 2 - 0.085;
  h.compound('jacket_varsity', 1.5, h.foldedGarment(w, d, ht, 3) + [
    box('sleeve-l', 'sleeve', [-w / 2 - 0.003, 0, -d / 2 + 0.01], [-w / 2 + 0.06, ht + 0.004, d / 2]),
    box('sleeve-r', 'sleeve', [w / 2 - 0.06, 0, -d / 2 + 0.01], [w / 2 + 0.003, ht + 0.004, d / 2]),
    box('hem', 'cloth', [-w / 2 + 0.06, ht, -d / 2], [w / 2 - 0.06, ht + 0.006, -d / 2 + 0.04]),
    box('hem-stripe-a', 'stripe', [-w / 2 + 0.06, ht + 0.006, -d / 2 + 0.01], [w / 2 - 0.06, ht + 0.008, -d / 2 + 0.016]),
    box('hem-stripe-b', 'stripe', [-w / 2 + 0.06, ht + 0.006, -d / 2 + 0.024], [w / 2 - 0.06, ht + 0.008, -d / 2 + 0.03]),
    box('placket', 'cloth', [-0.014, ht, -d / 2 + 0.04], [0.014, ht + 0.004, cz - 0.065]),
  ] + collar('collar', 'cloth', 0.065, 0.026, ht, 0.016, cz)
  + collar('collar-stripe', 'stripe', 0.071, 0.006, ht + 0.016, 0.002, cz)
  + collar('collar-stripe-b', 'stripe', 0.081, 0.006, ht + 0.016, 0.002, cz)
  + buttons('snap', 'snap', 0, [cz - 0.09, cz - 0.14, cz - 0.19], ht + 0.004, 0.007)
  + [
    box('letter-l', 'stripe', [-0.15, ht, -0.115], [-0.13, ht + 0.005, -0.03]),
    box('letter-r', 'stripe', [-0.09, ht, -0.115], [-0.07, ht + 0.005, -0.03]),
    box('letter-bar', 'stripe', [-0.13, ht, -0.083], [-0.09, ht + 0.005, -0.063]),
  ], { cloth: 'cloth-red', sleeve: 'leather-white', stripe: 'cloth-cream', snap: 'metal-silver' })
  + { voxelGrain: 0.004 },
]
