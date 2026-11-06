local h = import '../compound.libsonnet';
local box = h.box;
// Trousers, leggings, a skirt and loincloths as found on a shelf or the floor. Trousers are folded with their
// waistband along the back edge (-z) and the rolled fold towards the viewer (+z); the top face shows the seat.

// A stack of `folds` cloth layers `w` across x and `d` along z, `ht` tall, each front edge rolled over at +z so the
// stack reads as folded cloth from the front. Slot: cloth.
local fold(w, d, ht, folds) =
  local t = ht / folds, r = t / 2;
  std.flattenArrays([
    local inset = (i % 2) * std.min(0.006, w * 0.03);
    [
      box('fold-%d' % i, 'cloth', [-w / 2 + inset, i * t, -d / 2], [w / 2 - inset, (i + 1) * t, d / 2 - r]),
      h.rod('edge-%d' % i, 'cloth', r, -w / 2 + inset, w / 2 - inset, i * t + r) + { origin: [-w / 2 + inset, i * t + r, d / 2 - r] },
    ]
    for i in std.range(0, folds - 1)
  ]);

// Folded trousers `w` by `d`, `ht` tall. The waistband runs along the back edge with belt loops and a button at +x;
// a centre seam runs from it to the fold. Options add details on the top face at `ht`:
//   pocket   a back patch pocket { x, z, w, d, flap } (flap depth, 0 for none);
//   cargo    a bellows pocket { x, z, w, d, flap } standing proud, with a flap and a press stud;
//   knee     an articulated knee panel { z, d } with darts;
//   lining   a strip of lining showing under the waistband and along the side edge, in slot lining;
//   loops    false for an elastic or drawstring waist (no loops, a drawcord in slot cord instead).
// Slots: cloth, waistband, loop, button, seam, pocket, flap, stud, knee, lining, cord.
local trousers(o) =
  local c = { w: 0.26, d: 0.34, ht: 0.06, folds: 4, band: 0.035, pocket: null, cargo: null, knee: null, lining: false, loops: true } + o;
  local w = c.w, d = c.d, ht = c.ht, z0 = -d / 2;
  fold(w, d, ht, c.folds)
  + [box('waistband', 'waistband', [-w / 2, ht - 0.002, z0], [w / 2, ht + 0.004, z0 + c.band])]
  + (if c.loops then [
       box('loop-%d' % i, 'loop', [x - 0.005, ht + 0.004, z0 - 0.002], [x + 0.005, ht + 0.008, z0 + c.band + 0.004])
       for i in [0, 1, 2]
       for x in [[-w * 0.38, -w * 0.05, w * 0.3][i]]
     ] + [h.disc('button', 'button', 0.008, ht + 0.004, ht + 0.009, w * 0.42, z0 + c.band / 2)]
     else [
       box('cord', 'cord', [-0.006, ht + 0.004, z0 + c.band * 0.3], [0.006, ht + 0.008, z0 + c.band * 0.7]),
       box('cord-end-a', 'cord', [-0.02, ht + 0.004, z0 + c.band], [-0.014, ht + 0.007, z0 + c.band + 0.07]),
       box('cord-end-b', 'cord', [0.014, ht + 0.004, z0 + c.band], [0.02, ht + 0.007, z0 + c.band + 0.06]),
     ])
  + [box('seam', 'seam', [-0.003, ht, z0 + c.band], [0.003, ht + 0.002, d / 2 - 0.01])]
  + (if c.pocket == null then [] else
       local p = { flap: 0 } + c.pocket;
       [box('pocket', 'pocket', [p.x - p.w / 2, ht, p.z - p.d / 2], [p.x + p.w / 2, ht + 0.003, p.z + p.d / 2])]
       + (if p.flap > 0 then [box('pocket-flap', 'flap', [p.x - p.w / 2 - 0.003, ht + 0.003, p.z - p.d / 2 - 0.002], [p.x + p.w / 2 + 0.003, ht + 0.006, p.z - p.d / 2 + p.flap])] else []))
  + (if c.cargo == null then [] else
       local p = { flap: 0.035 } + c.cargo;
       [
         box('cargo', 'pocket', [p.x - p.w / 2, ht, p.z - p.d / 2], [p.x + p.w / 2, ht + 0.012, p.z + p.d / 2]),
         box('cargo-flap', 'flap', [p.x - p.w / 2 - 0.004, ht + 0.012, p.z - p.d / 2 - 0.004], [p.x + p.w / 2 + 0.004, ht + 0.016, p.z - p.d / 2 + p.flap]),
         h.disc('cargo-stud', 'stud', 0.006, ht + 0.016, ht + 0.02, p.x, p.z - p.d / 2 + p.flap - 0.01),
       ])
  + (if c.knee == null then [] else [
       box('knee', 'knee', [-w / 2 + 0.01, ht, c.knee.z - c.knee.d / 2], [-0.006, ht + 0.004, c.knee.z + c.knee.d / 2]),
     ] + [
       box('knee-dart-%d' % i, 'seam', [-w / 2 + 0.01, ht + 0.004, c.knee.z - c.knee.d / 2 + i * c.knee.d / 3 - 0.002], [-w * 0.2, ht + 0.006, c.knee.z - c.knee.d / 2 + i * c.knee.d / 3 + 0.002])
       for i in [1, 2]
     ])
  + (if c.lining then [
       box('lining-band', 'lining', [-w / 2 - 0.004, ht - 0.006, z0 - 0.004], [w / 2 + 0.004, ht, z0 + c.band]),
       box('lining-side', 'lining', [w / 2 - 0.004, 0, z0], [w / 2 + 0.004, ht - 0.004, d / 2 - 0.02]),
       box('lining-side-b', 'lining', [-w / 2 - 0.004, 0, z0], [-w / 2 + 0.004, ht - 0.004, d / 2 - 0.02]),
     ] else []);

// A loincloth laid flat: a front flap `w` across and `l` long hanging towards +z from a tie cord along the back,
// whose loose ends, `span` long in all, trail down both sides. `patches` lists [x0, z0, x1, z1, slot] patches stitched over the flap;
// `ragged` cuts the hem into tongues. Slots: cloth, cord, and those the patches name.
local loincloth(w, l, t, patches, ragged=true, cordR=0.004, span=0.6) =
  local z0 = -l / 2;
  [box('flap', 'cloth', [-w / 2, 0, z0 + 0.01], [w / 2, t, l / 2 - (if ragged then 0.03 else 0)])]
  + (if ragged then [
       box('tongue-%d' % i, 'cloth', [-w / 2 + i * w / 4 + 0.004, 0, l / 2 - 0.03], [-w / 2 + (i + 1) * w / 4 - 0.004, t, l / 2 - (i % 2) * 0.015])
       for i in [0, 1, 2, 3]
     ] else [])
  + [box('hem', 'cloth', [-w / 2 - 0.005, 0, z0], [w / 2 + 0.005, t + 0.004, z0 + 0.02])]
  + [h.rod('cord', 'cord', cordR, -w / 2 - 0.03, w / 2 + 0.03, cordR) + { origin: [-w / 2 - 0.03, cordR, z0 + 0.01] }]
  + [
    box('cord-end-%d' % k, 'cord', [s * (w / 2 + 0.03) - cordR, 0, z0 + 0.01], [s * (w / 2 + 0.03) + cordR, 2 * cordR, z0 + 0.01 + (span - w) / 2 - 0.03])
    for k in [0, 1]
    for s in [[-1, 1][k]]
  ]
  + [
    box('patch-%d' % i, patches[i][4], [patches[i][0], t, patches[i][1]], [patches[i][2], t + 0.003, patches[i][3]])
    for i in std.range(0, std.length(patches) - 1)
  ];

local folded(id, mass, o, finish) = h.compound(id, mass, trousers(o), finish) + { voxelGrain: 0.004 };

[
  // Lycra leggings folded small, 220 mm by 200 mm and 24 mm tall: thin stretch cloth with a wide elastic waistband
  // and no fly, pockets or loops.
  h.compound('leggings', 0.16,
    fold(0.22, 0.2, 0.024, 3)
    + [box('waistband', 'waistband', [-0.11, 0.022, -0.1], [0.11, 0.028, -0.055])]
    + [box('seam', 'seam', [-0.002, 0.024, -0.055], [0.002, 0.026, 0.09])],
    { cloth: 'cloth-black', waistband: 'cloth-charcoal', seam: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A rag loincloth laid flat, 180 mm across and 300 mm long on a 600 mm tie cord: mismatched cotton scraps.
  h.compound('loincloth', 0.069,
    loincloth(0.18, 0.3, 0.004, [[-0.08, -0.08, -0.01, 0.02, 'patch'], [0.015, 0.0, 0.085, 0.09, 'patch-b']]),
    { cloth: 'cloth-rag', cord: 'cord-cotton', patch: 'cloth-khaki', 'patch-b': 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A fur pelt loincloth laid flat, 200 mm across and 300 mm long with its leg tabs and tail, tied on with a
  // rawhide thong 700 mm long.
  // The pelt keeps its leg tabs and a pale belly stripe; the hem is not cut into tongues.
  h.compound('loincloth_fur', 0.15,
    loincloth(0.2, 0.3, 0.014, [[-0.025, -0.1, 0.025, 0.14, 'belly']], false, 0.004, 0.7)
    + [
      h.prism('leg-%d' % k, 'cloth', 'y', [[z, s * 0.098], [z + 0.05, s * 0.098], [z + 0.03, s * 0.15], [z + 0.005, s * 0.145]], 0, 0.012)
      for k in [0, 1, 2, 3]
      for s in [[-1, 1, -1, 1][k]]
      for z in [[-0.1, -0.1, 0.07, 0.07][k]]
    ]
    + [h.prism('tail', 'cloth', 'y', [[0.14, -0.03], [0.14, 0.03], [0.2, 0.012], [0.2, -0.012]], 0, 0.012)],
    { cloth: 'fur-brown', cord: 'skin-rawhide', belly: 'fur-pale' })
  + { voxelGrain: 0.004 },

  // A leather loincloth laid flat, 200 mm across and 300 mm long: square leather patches stitched together on a
  // leather thong 650 mm long.
  h.compound('loincloth_leather', 0.2,
    loincloth(0.2, 0.3, 0.006, [
      [-0.095, -0.1, -0.005, -0.005, 'patch'],
      [0.005, 0.005, 0.095, 0.1, 'patch'],
      [-0.003, -0.13, 0.003, 0.14, 'stitch'],
      [-0.1, -0.003, 0.1, 0.003, 'stitch'],
    ], false, 0.005, 0.65),
    { cloth: 'leather-brown', cord: 'leather-tan', patch: 'leather-chestnut', stitch: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A wool loincloth laid flat, 170 mm across and 280 mm long on a 600 mm cord: knitted scraps sewn together.
  h.compound('loincloth_wool', 0.083,
    loincloth(0.17, 0.28, 0.006, [[-0.075, -0.07, 0.0, 0.03, 'patch'], [0.01, 0.01, 0.08, 0.08, 'patch-b']]),
    { cloth: 'wool-grey', cord: 'cord-cotton', patch: 'felt-grey', 'patch-b': 'felt-brown' })
  + { voxelGrain: 0.004 },

  // A cotton skirt far shorter than a miniskirt laid flat: 360 mm across the flared hem, 260 mm at the waist and 140 mm
  // long, with a waistband, a button and topstitching above the hem.
  h.compound('nanoskirt', 0.1,
    [
      h.prism('skirt', 'cloth', 'y', [[-0.07, -0.13], [-0.07, 0.13], [0.07, 0.18], [0.07, -0.18]], 0, 0.008),
      box('waistband', 'waistband', [-0.132, 0, -0.07], [0.132, 0.012, -0.045]),
      h.disc('button', 'button', 0.007, 0.012, 0.016, 0.1, -0.058),
      h.prism('hem', 'seam', 'y', [[0.05, -0.172], [0.05, 0.172], [0.056, 0.174], [0.056, -0.174]], 0.008, 0.01),
      box('fly', 'seam', [0.03, 0.008, -0.045], [0.034, 0.01, 0.03]),
    ] + [
      h.prism('side-%d' % k, 'seam', 'y', [[-0.045, s * 0.128], [-0.045, s * 0.124], [0.05, s * 0.166], [0.05, s * 0.17]], 0.008, 0.01)
      for k in [0, 1]
      for s in [[-1, 1][k]]
    ],
    { cloth: 'cloth-denim', waistband: 'cloth-denim', button: 'metal-silver', seam: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // Plain khaki cotton trousers folded, 260 mm by 340 mm and 56 mm tall: belt loops, a button and a back pocket.
  folded('pants', 0.69, { ht: 0.056, pocket: { x: 0.06, z: -0.07, w: 0.11, d: 0.12 } },
         { cloth: 'cloth-khaki', waistband: 'cloth-khaki', loop: 'cloth-khaki', button: 'brass-dull', seam: 'cloth-brown', pocket: 'cloth-khaki' }),

  // Military field trousers folded, 270 mm by 340 mm and 64 mm tall: a flapped back pocket and a bellows cargo
  // pocket on the thigh.
  folded('pants_army', 0.85, { w: 0.27, ht: 0.064, pocket: { x: 0.07, z: -0.09, w: 0.1, d: 0.1, flap: 0.03 }, cargo: { x: -0.05, z: 0.06, w: 0.12, d: 0.13 } },
         { cloth: 'cloth-olive-drab', waistband: 'cloth-olive-drab', loop: 'cloth-olive-drab', button: 'plastic-matte-black', seam: 'webbing-olive-dark', pocket: 'cloth-olive-drab', flap: 'webbing-olive-dark', stud: 'plastic-matte-black' }),

  // Checkered cotton trousers folded, 260 mm by 320 mm and 40 mm tall: a small check of raised grey squares, 16 mm
  // across, on charcoal cloth stands in for the print, which no finish provides.
  h.compound('pants_checkered', 0.48,
    trousers({ d: 0.32, ht: 0.04, folds: 3 })
    + [
      box('check-%d-%d' % [i, j], 'check', [-0.128 + i * 0.016, 0.04, -0.128 + j * 0.016], [-0.128 + (i + 1) * 0.016, 0.042, -0.128 + (j + 1) * 0.016])
      for i in std.range(0, 15)
      for j in std.range(0, 17)
      if (i + j) % 2 == 0
    ],
    { cloth: 'cloth-charcoal', waistband: 'cloth-charcoal', loop: 'cloth-charcoal', button: 'metal-silver', seam: 'cloth-black', check: 'cloth-heather-grey' })
  + { voxelGrain: 0.004 },

  // Cotton trousers lined with synthetic fur, folded thick, 280 mm by 360 mm and 90 mm tall: pale fur shows at the
  // waist and along the folded sides.
  folded('pants_faux_fur', 1.3, { w: 0.28, d: 0.36, ht: 0.09, folds: 4, lining: true, pocket: { x: 0.07, z: -0.08, w: 0.11, d: 0.12 } },
         { cloth: 'cloth-charcoal', waistband: 'cloth-charcoal', loop: 'cloth-charcoal', button: 'metal-silver', seam: 'cloth-black', pocket: 'cloth-charcoal', lining: 'fur-pale' }),

  // Cotton trousers lined with real fur, folded thick, 280 mm by 360 mm and 90 mm tall, a drawcord at the waist and
  // brown fur showing at the waist and sides.
  folded('pants_fur', 1.3, { w: 0.28, d: 0.36, ht: 0.09, folds: 4, lining: true, loops: false },
         { cloth: 'cloth-brown', waistband: 'cloth-brown', seam: 'leather-brown', cord: 'skin-rawhide', lining: 'fur-brown' }),

  // Light nylon hiking trousers folded, 250 mm by 330 mm and 50 mm tall: a flapped back pocket, a slim cargo
  // pocket and a knee seam where the zip-off leg joins.
  h.compound('pants_hiking', 0.35,
    trousers({ w: 0.25, d: 0.33, ht: 0.05, pocket: { x: 0.065, z: -0.085, w: 0.09, d: 0.09, flap: 0.025 }, cargo: { x: -0.06, z: 0.03, w: 0.09, d: 0.1, flap: 0.025 } })
    + [box('zip', 'zip', [-0.125, 0.05, 0.1], [0.125, 0.053, 0.106])],
    { cloth: 'cloth-ucp', waistband: 'cloth-ucp', loop: 'cloth-ucp', button: 'plastic-matte-black', seam: 'cloth-charcoal', pocket: 'cloth-ucp', flap: 'cloth-charcoal', stud: 'plastic-matte-black', zip: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // Black leather trousers folded, 270 mm by 340 mm and 60 mm tall: belt loops, a steel button and a long side
  // seam, no pockets.
  folded('pants_leather', 1.5, { w: 0.27, ht: 0.06, folds: 3 },
         { cloth: 'leather-black', waistband: 'leather-black', loop: 'leather-black', button: 'steel-bright', seam: 'leather-charcoal' }),

  // Insulated ski trousers folded, 270 mm by 340 mm and 60 mm tall: an elastic drawcord waist and padded knees.
  folded('pants_ski', 0.77, { w: 0.27, d: 0.34, ht: 0.06, folds: 3, loops: false, knee: { z: 0.07, d: 0.12 } },
         { cloth: 'cloth-navy', waistband: 'nylon-black', seam: 'nylon-black', cord: 'cord-cotton', knee: 'nylon-black' }),

  // Tactical trousers folded, 270 mm by 340 mm and 64 mm tall: reinforced belt loops, flapped back pocket, cargo
  // pocket with a press stud and an articulated knee panel.
  folded('pants_tactical', 0.86, { w: 0.27, ht: 0.064, pocket: { x: 0.075, z: -0.09, w: 0.09, d: 0.09, flap: 0.025 }, cargo: { x: 0.06, z: 0.045, w: 0.11, d: 0.12 }, knee: { z: 0.07, d: 0.12 } },
         { cloth: 'nylon-coyote', waistband: 'nylon-coyote', loop: 'webbing-black', button: 'plastic-matte-black', seam: 'cloth-brown', pocket: 'nylon-coyote', flap: 'cloth-brown', stud: 'plastic-matte-black', knee: 'cloth-brown' }),
]
