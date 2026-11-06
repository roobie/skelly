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

// A belt, sash or trim band wrapped across the bundle at z, over the top and down both sides.
local bandX(id, slot, z, bw, w, ht, t=0.004) = [
  box(id + '-top', slot, [-w / 2 - t, ht, z - bw / 2], [w / 2 + t, ht + t, z + bw / 2]),
  box(id + '-left', slot, [-w / 2 - t, 0, z - bw / 2], [-w / 2, ht, z + bw / 2]),
  box(id + '-right', slot, [w / 2, 0, z - bw / 2], [w / 2 + t, ht, z + bw / 2]),
];

// The two armholes of a sleeveless coat, cut into each side edge at z: the shadowed opening (slot hole) and the
// bound edge round it (slot `bind`), so the folded bundle reads as sleeveless.
local armholes(w, z, r, y, bind, bw=0.012) =
  h.crescent('armhole-l', 'hole', 0.004, r, 0, 180, 8, y, y + 0.002, -w / 2, z)
  + h.crescent('armhole-r', 'hole', 0.004, r, 180, 360, 8, y, y + 0.002, w / 2, z)
  + h.crescent('armhole-bind-l', bind, r, r + bw, 0, 180, 8, y, y + 0.005, -w / 2, z)
  + h.crescent('armhole-bind-r', bind, r, r + bw, 180, 360, 8, y, y + 0.005, w / 2, z);

// Sleeves folded in along both sides of the body, `sw` wide, with a cuff band of slot `cuff` at the hem end.
local sleeves(w, d, ht, sw, cuff, cuffD=0.03, t=0.008) = std.flattenArrays([
  [
    box('sleeve-' + s, 'sleeve', [x0, ht, -d / 2 + 0.02], [x0 + sw, ht + t, d / 2 - 0.04]),
    box('cuff-' + s, cuff, [x0 - 0.002, ht, -d / 2 + 0.015], [x0 + sw + 0.002, ht + t + 0.004, -d / 2 + 0.015 + cuffD]),
  ]
  for s in ['l', 'r']
  for x0 in [if s == 'l' then -w / 2 else w / 2 - sw]
]);

// A sleeveless duster folded long: a stand collar, a bound front edge with buttons, two flapped hip pockets, and
// either a short shoulder cape between the armholes or a deep rolled collar for the fur ones.
// Slots: cloth, cape, collar, edge, button, hole, bind, pocket, flap.
local sleevelessDuster(id, mass, w, d, ht, folds, cape, finish) =
  local cz = d / 2 - 0.07, az = d / 2 - 0.1;
  h.compound(id, mass, h.foldedGarment(w, d, ht, folds)
                       + armholes(w, az, 0.055, ht, 'bind')
                       + (if cape then [
                            flat('cape', 'cape', [[-w / 2 + 0.08, d / 2], [w / 2 - 0.08, d / 2], [w / 2 - 0.08, d / 2 - 0.08], [0.1, d / 2 - 0.17], [-0.1, d / 2 - 0.17], [-w / 2 + 0.08, d / 2 - 0.08]], ht, 0.006),
                            box('cape-drape', 'cape', [-w / 2 + 0.08, ht * 0.3, d / 2], [w / 2 - 0.08, ht + 0.006, d / 2 + 0.006]),
                          ] + collar('collar', 'collar', 0.06, 0.022, ht + 0.006, 0.016, cz)
                          else [
                            h.turned('collar', 'collar', 'x', [[0, 0], [0, 0.03], [w - 0.18, 0.03], [w - 0.18, 0]], [-w / 2 + 0.09, ht + 0.012, d / 2 - 0.04]),
                          ])
                       + [box('edge', 'edge', [-0.014, ht, -d / 2], [0.014, ht + 0.004, d / 2 - (if cape then 0.17 else 0.07)])]
                       + buttons('button', 'button', 0, [-0.12, -0.06, 0.0], ht + 0.004, 0.008)
                       + pocket('pocket-l', 'pocket', 'flap', -w / 2 + 0.075, -0.07, 0.11, 0.1, ht)
                       + pocket('pocket-r', 'pocket', 'flap', w / 2 - 0.075, -0.07, 0.11, 0.1, ht),
             finish)
  + { voxelGrain: 0.004 };

// A trench coat folded long: wide lapels, a gun flap over the right shoulder, epaulettes, two columns of buttons,
// slanted flapped pockets and the belt buckled round the bundle. Sleeveless ones show their armholes; a sleeved one
// has its sleeves folded in along the sides with strapped cuffs.
// Slots: cloth, lapel, button, belt, buckle, pocket, flap, hole, bind, sleeve, cuff.
local trench(id, mass, w, d, ht, folds, sleeved, finish) =
  local cz = d / 2 - 0.07, az = d / 2 - 0.1;
  h.compound(id, mass, h.foldedGarment(w, d, ht, folds)
                       + (if sleeved then sleeves(w, d, ht, 0.075, 'belt') else armholes(w, az, 0.055, ht, 'bind'))
                       + collar('collar', 'lapel', 0.055, 0.022, ht, 0.012, cz, 40)
                       + [
                         flat('lapel-l', 'lapel', [[-0.03, cz - 0.045], [-0.1, cz - 0.03], [-0.05, cz - 0.16]], ht, 0.008),
                         flat('lapel-r', 'lapel', [[0.03, cz - 0.045], [0.1, cz - 0.03], [0.05, cz - 0.16]], ht, 0.008),
                         strip('epaulette-l', 'lapel', [-w / 2 + 0.02, d / 2 - 0.03], [-0.09, d / 2 - 0.03], ht + (if sleeved then 0.008 else 0), 0.024, 0.006),
                       ]
                       + (if sleeved then [flat('gun-flap', 'lapel', [[0.04, d / 2 - 0.01], [w / 2 - 0.075, d / 2 - 0.01], [w / 2 - 0.075, d / 2 - 0.13], [0.07, d / 2 - 0.13]], ht, 0.005)] else [])
                       + buttons('epaulette-button', 'button', -0.095, [d / 2 - 0.03], ht + (if sleeved then 0.014 else 0.006), 0.006)
                       + buttons('button-l', 'button', -0.045, [cz - 0.17, -0.0, -0.1], ht, 0.008)
                       + buttons('button-r', 'button', 0.045, [cz - 0.17, -0.0, -0.1], ht, 0.008)
                       + bandX('belt', 'belt', -0.05, 0.03, w, ht + (if sleeved then 0.008 else 0), 0.005)
                       + [
                         box('buckle', 'buckle', [-0.1, ht + (if sleeved then 0.013 else 0.005), -0.07], [-0.06, ht + (if sleeved then 0.018 else 0.01), -0.03]),
                         box('buckle-tongue', 'belt', [-0.08, ht + (if sleeved then 0.013 else 0.005), -0.055], [-0.06, ht + (if sleeved then 0.017 else 0.009), -0.045]),
                         flat('pocket-flap-l', 'flap', [[-0.15, -0.09], [-0.09, -0.12], [-0.08, -0.105], [-0.14, -0.075]], ht, 0.006),
                         flat('pocket-flap-r', 'flap', [[0.15, -0.09], [0.09, -0.12], [0.08, -0.105], [0.14, -0.075]], ht, 0.006),
                       ],
             finish)
  + { voxelGrain: 0.004 };

[
  // A red Santa jacket folded, 380 mm by 320 mm and 70 mm tall: white faux fur on the collar, down the front and
  // round the hem and cuffs of the sleeves folded in at the sides, and a black belt with a gold buckle.
  local w = 0.38, d = 0.32, ht = 0.07, cz = d / 2 - 0.08;
  h.compound('santa_jacket', 2.4, h.foldedGarment(w, d, ht, 3)
                                  + sleeves(w, d, ht, 0.075, 'fur', 0.035, 0.01)
                                  + [
                                    h.turned('collar', 'fur', 'x', [[0, 0], [0, 0.022], [0.2, 0.022], [0.2, 0]], [-0.1, ht + 0.01, d / 2 - 0.03]),
                                    box('front-fur', 'fur', [-0.022, ht, -d / 2], [0.022, ht + 0.012, d / 2 - 0.05]),
                                  ]
                                  + bandX('hem-fur', 'fur', -d / 2 + 0.03, 0.05, w, ht, 0.012)
                                  + bandX('belt', 'belt', -0.04, 0.035, w, ht + 0.012, 0.005)
                                  + [
                                    box('buckle', 'buckle', [-0.035, ht + 0.017, -0.065], [0.035, ht + 0.023, -0.015]),
                                    box('buckle-hole', 'belt', [-0.022, ht + 0.018, -0.052], [0.022, ht + 0.024, -0.028]),
                                  ]
                                  + pocket('pocket-l', 'cloth', null, -0.1, 0.03, 0.08, 0.07, ht)
                                  + pocket('pocket-r', 'cloth', null, 0.1, 0.03, 0.08, 0.07, ht)
                                  + [
                                    box('pocket-fur-l', 'fur', [-0.142, ht + 0.004, 0.06], [-0.058, ht + 0.01, 0.075]),
                                    box('pocket-fur-r', 'fur', [0.058, ht + 0.004, 0.06], [0.142, ht + 0.01, 0.075]),
                                  ],
             { cloth: 'cloth-red', sleeve: 'cloth-red', fur: 'fur-pale', belt: 'leather-black', buckle: 'metal-gold' })
  + { voxelGrain: 0.004 },

  // A short sleeveless red jacket folded, 320 mm by 260 mm and 45 mm tall: white faux fur round the collar, the
  // armholes, down the front and along the hem, closed with three white pompom buttons.
  local w = 0.32, d = 0.26, ht = 0.045;
  h.compound('santa_jacket_short', 0.93, h.foldedGarment(w, d, ht, 3)
                                        + armholes(w, d / 2 - 0.09, 0.05, ht, 'fur', 0.018)
                                        + [
                                          h.turned('collar', 'fur', 'x', [[0, 0], [0, 0.018], [0.16, 0.018], [0.16, 0]], [-0.08, ht + 0.008, d / 2 - 0.025]),
                                          box('front-fur', 'fur', [-0.02, ht, -d / 2], [0.02, ht + 0.01, d / 2 - 0.04]),
                                        ]
                                        + bandX('hem-fur', 'fur', -d / 2 + 0.025, 0.04, w, ht, 0.01)
                                        + [
                                          h.dome('pompom-%d' % i, 'fur', 0.012, 0.012, 0.012, 'y', [0, ht + 0.01, z])
                                          for i in std.range(0, 2)
                                          for z in [0.06 - i * 0.055]
                                        ],
             { cloth: 'cloth-red', fur: 'fur-pale', hole: 'cloth-crimson' })
  + { voxelGrain: 0.004 },

  // A red insulated ski jacket folded thick, 380 mm by 320 mm and 75 mm tall: quilted baffles, a black yoke over the
  // shoulders, the red hood folded down on top, a zip up the front and zipped chest and hip pockets.
  local w = 0.38, d = 0.32, ht = 0.075;
  h.compound('ski_jacket', 1.2, h.foldedGarment(w, d, ht, 3)
                                  + [
                                    box('baffle-%d' % i, 'cloth', [-w / 2, ht, z - 0.007], [w / 2, ht + 0.005, z + 0.007])
                                    for i in std.range(0, 3)
                                    for z in [-0.13 + i * 0.05]
                                  ]
                                  + [
                                    box('yoke', 'yoke', [-w / 2, ht, 0.06], [w / 2, ht + 0.006, d / 2]),
                                    box('yoke-drape', 'yoke', [-w / 2, ht * 0.4, d / 2], [w / 2, ht + 0.006, d / 2 + 0.004]),
                                    flat('hood', 'cloth', [[-0.11, d / 2 - 0.005], [0.11, d / 2 - 0.005], [0.11, d / 2 - 0.08], [0.06, d / 2 - 0.13], [-0.06, d / 2 - 0.13], [-0.11, d / 2 - 0.08]], ht + 0.006, 0.014),
                                    h.turned('hood-rim', 'trim', 'x', [[0, 0], [0, 0.007], [0.12, 0.007], [0.12, 0]], [-0.06, ht + 0.016, d / 2 - 0.13]),
                                    box('zip', 'zip', [-0.005, ht + 0.005, -d / 2], [0.005, ht + 0.01, d / 2 - 0.135]),
                                    strip('chest-zip', 'zip', [0.06, 0.02], [0.14, 0.045], ht + 0.005, 0.006, 0.004),
                                    strip('pocket-zip-l', 'zip', [-0.15, -0.135], [-0.09, -0.075], ht + 0.005, 0.006, 0.004),
                                    strip('pocket-zip-r', 'zip', [0.15, -0.135], [0.09, -0.075], ht + 0.005, 0.006, 0.004),
                                  ],
             { cloth: 'nylon-red', yoke: 'cloth-black', trim: 'plastic-charcoal', zip: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A sleeveless canvas duster folded long, 380 mm by 320 mm and 55 mm tall in five layers: a short shoulder cape
  // between the armholes, a stand collar, three leather buttons and two flapped hip pockets.
  sleevelessDuster('sleeveless_duster', 1.7, 0.38, 0.32, 0.055, 5, true,
                   { cloth: 'cloth-canvas', cape: 'cloth-canvas', collar: 'cloth-canvas', edge: 'cloth-canvas', button: 'leather-brown', hole: 'cloth-brown', bind: 'leather-brown', pocket: 'cloth-canvas', flap: 'cloth-canvas' }),

  // A sleeveless pale faux fur duster folded thick, 420 mm by 360 mm and 80 mm tall: a deep rolled collar, cotton
  // binding round the armholes and down the front, toggle buttons and two flapped pockets.
  sleevelessDuster('sleeveless_duster_faux_fur', 2.3, 0.42, 0.36, 0.08, 5, false,
                   { cloth: 'fur-pale', collar: 'fur-pale', edge: 'cloth-khaki', button: 'leather-brown', hole: 'cloth-khaki', bind: 'cloth-khaki', pocket: 'fur-pale', flap: 'fur-pale' }),

  // A sleeveless brown fur duster folded thick, 420 mm by 360 mm and 80 mm tall: a deep rolled collar, black leather
  // binding round the armholes and down the front, and two flapped pockets.
  sleevelessDuster('sleeveless_duster_fur', 2.4, 0.42, 0.36, 0.08, 5, false,
                   { cloth: 'fur-brown', collar: 'fur-brown', edge: 'leather-black', button: 'leather-black', hole: 'leather-black', bind: 'leather-black', pocket: 'fur-brown', flap: 'fur-brown' }),

  // A sleeveless brown leather duster folded long, 400 mm by 340 mm and 55 mm tall: the shoulder cape between the
  // armholes, a stand collar, brass buttons and two flapped pockets.
  sleevelessDuster('sleeveless_duster_leather', 2.3, 0.4, 0.34, 0.055, 5, true,
                   { cloth: 'leather-brown', cape: 'leather-brown', collar: 'leather-brown', edge: 'leather-brown', button: 'brass-dull', hole: 'leather-black', bind: 'leather-black', pocket: 'leather-brown', flap: 'leather-brown' }),

  // A sleeveless khaki canvas trench coat folded, 360 mm by 320 mm and 50 mm tall: wide lapels, an epaulette, double-breasted buttons, slanted pocket flaps and the belt buckled round it.
  trench('sleeveless_trenchcoat', 1.4, 0.36, 0.32, 0.05, 4, false,
         { cloth: 'cloth-khaki', lapel: 'cloth-khaki', button: 'plastic-charcoal', belt: 'cloth-khaki', buckle: 'brass-dull', flap: 'cloth-khaki', hole: 'cloth-brown', bind: 'cloth-brown' }),

  // A sleeveless pale faux fur trench coat folded thick, 380 mm by 320 mm and 70 mm tall, cut and belted as the
  // canvas one with a tan belt and dark buttons.
  trench('sleeveless_trenchcoat_faux_fur', 1.7, 0.38, 0.32, 0.07, 4, false,
         { cloth: 'fur-pale', lapel: 'fur-pale', button: 'leather-brown', belt: 'leather-tan', buckle: 'brass-dull', flap: 'fur-pale', hole: 'cloth-khaki', bind: 'cloth-khaki' }),

  // A sleeveless brown fur trench coat folded thick, 380 mm by 320 mm and 70 mm tall, with a black leather belt.
  trench('sleeveless_trenchcoat_fur', 1.7, 0.38, 0.32, 0.07, 4, false,
         { cloth: 'fur-brown', lapel: 'fur-brown', button: 'leather-black', belt: 'leather-black', buckle: 'metal-silver', flap: 'fur-brown', hole: 'leather-black', bind: 'leather-black' }),

  // A sleeveless black leather trench coat folded, 360 mm by 320 mm and 50 mm tall, with silver buckle and buttons.
  trench('sleeveless_trenchcoat_leather', 1.8, 0.36, 0.32, 0.05, 4, false,
         { cloth: 'leather-black', lapel: 'leather-black', button: 'metal-silver', belt: 'leather-black', buckle: 'metal-silver', flap: 'leather-black', hole: 'plastic-charcoal', bind: 'plastic-charcoal' }),

  // A sleeveless cotton tunic folded thin, 300 mm by 260 mm and 20 mm tall: a laced slit at the neck, bound
  // armholes and a stitched hem.
  local w = 0.3, d = 0.26, ht = 0.02;
  h.compound('sleeveless_tunic', 0.36, h.foldedGarment(w, d, ht, 2)
                                       + armholes(w, d / 2 - 0.08, 0.05, ht, 'bind', 0.008)
                                       + h.crescent('neck', 'bind', 0.045, 0.055, -150, 150, 12, ht, ht + 0.003, 0, d / 2 - 0.05)
                                       + [
                                         box('slit', 'hole', [-0.003, ht, d / 2 - 0.18], [0.003, ht + 0.002, d / 2 - 0.095]),
                                         strip('lace-a', 'lace', [-0.015, d / 2 - 0.1], [0.015, d / 2 - 0.13], ht + 0.002, 0.004, 0.003),
                                         strip('lace-b', 'lace', [0.015, d / 2 - 0.1], [-0.015, d / 2 - 0.13], ht + 0.002, 0.004, 0.003),
                                         strip('lace-c', 'lace', [-0.015, d / 2 - 0.13], [0.015, d / 2 - 0.16], ht + 0.002, 0.004, 0.003),
                                         strip('lace-d', 'lace', [0.015, d / 2 - 0.13], [-0.015, d / 2 - 0.16], ht + 0.002, 0.004, 0.003),
                                         strip('lace-end-a', 'lace', [-0.003, d / 2 - 0.095], [-0.02, d / 2 - 0.06], ht + 0.002, 0.004, 0.003),
                                         strip('lace-end-b', 'lace', [0.003, d / 2 - 0.095], [0.025, d / 2 - 0.065], ht + 0.002, 0.004, 0.003),
                                         box('hem', 'bind', [-w / 2, ht, -d / 2 + 0.02], [w / 2, ht + 0.002, -d / 2 + 0.026]),
                                       ],
             { cloth: 'cloth-cotton', bind: 'cloth-brown', hole: 'cloth-brown', lace: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A grey-green tactical jacket folded, 360 mm by 300 mm and 45 mm tall: a high mandarin collar, a zip under a
  // snapped storm flap, slanted zipped chest pockets, hook-and-loop panels on the folded sleeves, an ID plate and
  // flapped cargo pockets low on both sides.
  local w = 0.36, d = 0.3, ht = 0.045, cz = d / 2 - 0.08;
  h.compound('tacjacket', 1.3, h.foldedGarment(w, d, ht, 3)
                                 + sleeves(w, d, ht, 0.07, 'loop', 0.025, 0.008)
                                 + collar('collar', 'cloth', 0.06, 0.024, ht, 0.022, cz, 22)
                                 + [
                                   box('storm-flap', 'flap', [-0.018, ht, -d / 2], [0.018, ht + 0.006, cz - 0.06]),
                                   box('sleeve-panel-l', 'loop', [-w / 2 + 0.012, ht + 0.008, 0.03], [-w / 2 + 0.058, ht + 0.011, 0.09]),
                                   box('sleeve-panel-r', 'loop', [w / 2 - 0.058, ht + 0.008, 0.03], [w / 2 - 0.012, ht + 0.011, 0.09]),
                                   box('sleeve-pocket-l', 'flap', [-w / 2 + 0.012, ht + 0.008, -0.04], [-w / 2 + 0.058, ht + 0.013, 0.015]),
                                   box('sleeve-pocket-r', 'flap', [w / 2 - 0.058, ht + 0.008, -0.04], [w / 2 - 0.012, ht + 0.013, 0.015]),
                                   box('id-plate', 'plate', [-0.105, ht + 0.004, 0.07], [-0.065, ht + 0.007, 0.09]),
                                   strip('chest-zip-l', 'zip', [-0.03, 0.05], [-0.09, -0.01], ht, 0.008, 0.004),
                                   strip('chest-zip-r', 'zip', [0.03, 0.05], [0.09, -0.01], ht, 0.008, 0.004),
                                   box('chest-panel', 'loop', [0.055, ht, 0.06], [0.11, ht + 0.004, 0.095]),
                                 ]
                                 + buttons('snap', 'snap', 0, [cz - 0.09, -0.02, -0.08, -0.14], ht + 0.006, 0.006)
                                 + pocket('cargo-l', 'flap', 'flap', -0.075, -0.1, 0.08, 0.08, ht)
                                 + pocket('cargo-r', 'flap', 'flap', 0.075, -0.1, 0.08, 0.08, ht)
                                 + buttons('cargo-snap-l', 'snap', -0.075, [-0.075], ht + 0.008, 0.005)
                                 + buttons('cargo-snap-r', 'snap', 0.075, [-0.075], ht + 0.008, 0.005),
             { cloth: 'cloth-ucp', sleeve: 'cloth-ucp', flap: 'cloth-ucp', loop: 'hook-loop-grey', zip: 'plastic-matte-black', snap: 'plastic-matte-black', plate: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A white cotton thawb folded long, 360 mm by 340 mm and 50 mm tall in four layers: a narrow stand collar, a short
  // buttoned placket, a breast pocket, and the wide sleeves folded in along the sides.
  local w = 0.36, d = 0.34, ht = 0.05, cz = d / 2 - 0.07;
  h.compound('thawb', 1.5, h.foldedGarment(w, d, ht, 4)
                           + sleeves(w, d, ht, 0.085, 'sleeve', 0.02, 0.006)
                           + collar('collar', 'cloth', 0.05, 0.012, ht, 0.014, cz, 20)
                           + [
                             box('placket', 'cloth', [-0.014, ht, cz - 0.2], [0.014, ht + 0.004, cz - 0.05]),
                             box('placket-seam', 'seam', [-0.001, ht + 0.004, cz - 0.2], [0.001, ht + 0.005, cz - 0.05]),
                           ]
                           + buttons('button', 'button', 0, [cz - 0.075, cz - 0.115, cz - 0.155], ht + 0.004, 0.005)
                           + pocket('breast', 'cloth', null, -0.06, cz - 0.11, 0.06, 0.06, ht)
                           + [box('breast-seam', 'seam', [-0.09, ht + 0.004, cz - 0.082], [-0.03, ht + 0.005, cz - 0.08])],
             { cloth: 'cloth-cream', sleeve: 'cloth-cream', seam: 'cloth-white', button: 'cloth-white' })
  + { voxelGrain: 0.004 },

  // A khaki canvas trench coat folded, 380 mm by 340 mm and 60 mm tall: the sleeves folded in along the sides with
  // strapped cuffs, wide lapels, a gun flap, an epaulette, double-breasted buttons and the belt buckled round it.
  trench('trenchcoat', 2, 0.38, 0.34, 0.06, 4, true,
         { cloth: 'cloth-khaki', sleeve: 'cloth-khaki', lapel: 'cloth-khaki', button: 'plastic-charcoal', belt: 'cloth-khaki', buckle: 'brass-dull', flap: 'cloth-khaki' }),
]
