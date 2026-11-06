local h = import '../compound.libsonnet';
local box = h.box;
// Coats, tunics, vests and robes folded on a shelf: each is `h.foldedGarment` with its collar at the back (-z) and
// its front closure running towards the hem at +z on top. Prism outlines on y are [z, x] points.

// A flat patch pocket on the top face at `top`, from x0 to x1 and z0 to z1, with a flap `flap` deep across its
// back edge when `flap` is above zero. Slots: pocket, flap.
local pocket(id, x0, x1, z0, z1, top, t=0.004, flap=0) =
  [box(id, 'pocket', [x0, top, z0], [x1, top + t, z1])]
  + (if flap > 0 then [box(id + '-flap', 'flap', [x0 - 0.003, top + t, z0], [x1 + 0.003, top + t + 0.003, z0 + flap])] else []);
// A row of round buttons standing on the top face at x, from z0 to z1. Slot: button.
local buttons(prefix, x, z0, z1, n, top, r=0.007) = [
  h.disc('%s-%d' % [prefix, i], 'button', r, top, top + 0.004, x, z0 + (z1 - z0) * i / (n - 1))
  for i in std.range(0, n - 1)
];
// A collar rolled along the back edge on top of a garment `w` across. Slot: collar.
local collar(w, z, top, r) = h.turned('collar', 'collar', 'x', [[0, 0], [0, r], [w, r], [w, 0]], [-w / 2, top + r * 0.4, z]);
// Two wide lapels lying back from the collar, meeting at a point `zTip` on the centre line. Slot: lapel.
local lapels(z0, zTip, w, top, t=0.005) = [
  h.prism('lapel-l', 'lapel', 'y', [[z0, -w], [z0, -0.012], [zTip, 0]], top, top + t),
  h.prism('lapel-r', 'lapel', 'y', [[z0, 0.012], [z0, w], [zTip, 0]], top, top + t),
];
// A belt laid across the fold at z with a square buckle at x. Slots: belt, buckle.
local belt(w, z, top, bx, bw=0.04) = [
  box('belt', 'belt', [-w / 2, top, z - 0.018], [w / 2, top + 0.005, z + 0.018]),
  box('buckle', 'buckle', [bx - bw / 2, top + 0.005, z - bw / 2], [bx + bw / 2, top + 0.009, z + bw / 2]),
  box('buckle-gap', 'belt', [bx - bw / 2 + 0.007, top + 0.005, z - bw / 2 + 0.007], [bx + bw / 2 - 0.007, top + 0.0095, z + bw / 2 - 0.007]),
];
// Raised seams or quilting ridges across x at the given z. Slot given.
local ridges(prefix, slot, x0, x1, zs, top, t=0.003, w=0.006) = [
  box('%s-%d' % [prefix, i], slot, [x0, top, zs[i] - w / 2], [x1, top + t, zs[i] + w / 2])
  for i in std.range(0, std.length(zs) - 1)
];
// A hood folded down flat on the top face, its crown at the back. Slots: hood, rim.
local hood(w, z0, z1, top, t, rimT=0.008) =
  local hw = w / 2, d = z1 - z0;
  [
    h.prism('hood', 'hood', 'y', [
      [z0, -hw * 0.6], [z0 + d * 0.3, -hw], [z1, -hw], [z1, hw], [z0 + d * 0.3, hw], [z0, hw * 0.6],
    ], top, top + t),
    h.turned('hood-rim', 'rim', 'x', [[0, 0], [0, rimT], [w, rimT], [w, 0]], [-hw, top + t * 0.6, z1 - rimT * 0.5]),
  ];

// A long double-breasted trench coat folded: lapels, two rows of buttons, the belt across the hem fold with its
// buckle, and two flapped hip pockets. Slots: cloth, collar, lapel, button, belt, buckle, pocket, flap, lining.
local trench(id, mass, w, d, top, folds, finish) =
  h.compound(id, mass,
    h.foldedGarment(w, d, top, folds)
    + [collar(w * 0.7, -d / 2 + 0.02, top, 0.018)]
    + lapels(-d / 2 + 0.03, -0.02, w * 0.38, top)
    + [box('edge', 'lining', [-0.014, top, -0.02], [0.014, top + 0.003, d / 2])]
    + buttons('button-l', -0.05, -0.0, 0.07, 3, top, 0.009)
    + buttons('button-r', 0.05, -0.0, 0.07, 3, top, 0.009)
    + belt(w + 0.01, 0.105, top + 0.003, 0.11)
    + pocket('pocket-l', -w / 2 + 0.015, -0.08, 0.13, d / 2 - 0.006, top, 0.004, 0.02)
    + pocket('pocket-r', 0.08, w / 2 - 0.015, 0.13, d / 2 - 0.006, top, 0.004, 0.02),
    finish)
  + { voxelGrain: 0.004 };

[
  // A brown fur trench coat folded thick, 420 mm by 360 mm and 80 mm tall: wide fur lapels, double-breasted front,
  // a leather belt across the hem fold and two flapped hip pockets.
  trench('trenchcoat_fur', 2.3, 0.42, 0.36, 0.08, 5, {
    cloth: 'fur-brown', collar: 'fur-brown', lapel: 'fur-brown', lining: 'leather-brown', button: 'leather-black',
    belt: 'leather-black', buckle: 'brass-dull', pocket: 'fur-brown', flap: 'fur-brown',
  }),

  // A brown leather trench coat folded, 400 mm by 340 mm and 60 mm tall: the same cut as the fur one in smooth
  // leather, with a self belt and dark buttons.
  trench('trenchcoat_leather', 2.5, 0.4, 0.34, 0.06, 4, {
    cloth: 'leather-brown', collar: 'leather-brown', lapel: 'leather-brown', lining: 'leather-black', button: 'plastic-charcoal',
    belt: 'leather-brown', buckle: 'steel-grey', pocket: 'leather-brown', flap: 'leather-brown',
  }),

  // A black leather steampunk coat folded, 400 mm by 340 mm and 60 mm tall: no pockets, a high stand collar, three
  // buckled straps across the front instead of buttons, brass rivets down the edge and a brass cog pinned to the
  // left lapel.
  local top = 0.06;
  h.compound('trenchcoat_steampunk', 2.4,
    h.foldedGarment(0.4, 0.34, top, 4)
    + [box('collar', 'collar', [-0.13, top, -0.17], [0.13, top + 0.02, -0.145])]
    + lapels(-0.14, -0.04, 0.15, top)
    + [box('edge', 'lining', [-0.014, top, -0.04], [0.014, top + 0.003, 0.17])]
    + std.flattenArrays([
      [
        box('strap-%d' % i, 'belt', [-0.09, top, z - 0.01], [0.09, top + 0.004, z + 0.01]),
        box('buckle-%d' % i, 'buckle', [0.06, top + 0.004, z - 0.014], [0.085, top + 0.008, z + 0.014]),
      ]
      for i in [0, 1, 2]
      for z in [0.0 + 0.055 * i]
    ])
    + [h.disc('rivet-%d' % i, 'buckle', 0.004, top, top + 0.004, -0.024, -0.03 + 0.03 * i) for i in std.range(0, 6)]
    + [
      h.disc('cog', 'buckle', 0.016, top + 0.005, top + 0.009, -0.09, -0.11),
      h.disc('cog-hub', 'lining', 0.006, top + 0.009, top + 0.011, -0.09, -0.11),
    ]
    + [box('cog-tooth-%d' % i, 'buckle', [-0.09 - 0.004 + 0.02 * c, top + 0.005, -0.11 - 0.004 + 0.02 * s], [-0.09 + 0.004 + 0.02 * c, top + 0.009, -0.11 + 0.004 + 0.02 * s])
       for i in std.range(0, 7)
       for c in [std.cos(i * std.pi / 4)]
       for s in [std.sin(i * std.pi / 4)]],
    { cloth: 'leather-black', collar: 'leather-black', lapel: 'leather-black', lining: 'plastic-charcoal', belt: 'leather-oxblood', buckle: 'brass-polished' })
  + { voxelGrain: 0.004 },

  // A plain cream cotton tunic folded, 300 mm by 240 mm and 20 mm tall: a slit neck with a drawstring tie at the back.
  local top = 0.02;
  h.compound('tunic', 0.32,
    h.foldedGarment(0.3, 0.24, top, 3)
    + [
      h.prism('neck', 'neck', 'y', [[-0.12, -0.05], [-0.1, -0.055], [-0.1, 0.055], [-0.12, 0.05]], top, top + 0.002),
      box('slit', 'neck', [-0.003, top, -0.1], [0.003, top + 0.002, -0.03]),
      box('tie-l', 'tie', [-0.03, top + 0.002, -0.07], [-0.003, top + 0.005, -0.065]),
      box('tie-r', 'tie', [0.003, top + 0.002, -0.07], [0.03, top + 0.005, -0.065]),
      box('hem', 'hem', [-0.15, top, 0.105], [0.15, top + 0.002, 0.115]),
    ],
    { cloth: 'cloth-cream', neck: 'cloth-khaki', tie: 'cord-cotton', hem: 'cloth-khaki' })
  + { voxelGrain: 0.002 },

  // A rag tunic folded loosely, 300 mm by 240 mm and 25 mm tall: grey-brown rag cloth with darker patches sewn on
  // crooked, a ragged hem and the string belt coiled on top.
  local top = 0.025;
  h.compound('tunic_rag', 0.42,
    h.foldedGarment(0.3, 0.24, top, 3)
    + [
      h.prism('patch-a', 'patch', 'y', [[-0.08, -0.12], [-0.09, -0.04], [-0.02, -0.035], [-0.01, -0.11]], top, top + 0.003),
      h.prism('patch-b', 'patch', 'y', [[-0.0, 0.04], [-0.01, 0.12], [0.05, 0.125], [0.06, 0.05]], top, top + 0.003),
      h.prism('patch-c', 'patch', 'y', [[-0.1, 0.06], [-0.1, 0.11], [-0.06, 0.11], [-0.06, 0.06]], top, top + 0.003),
    ]
    + [box('fray-%d' % i, 'cloth', [-0.15 + 0.03 * i, top - 0.012, 0.12], [-0.135 + 0.03 * i, top - 0.004, 0.13 + 0.008 * (i % 3)]) for i in std.range(0, 9)]
    + h.strapLoop('string', 'string', 0.16, 0.025, 0.004, 0.004, top + 0.003, 0, 0.095),
    { cloth: 'cloth-rag', patch: 'cloth-rag-shadow', string: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A black tuxedo jacket folded with its trousers beneath, 380 mm by 320 mm and 50 mm tall: shiny satin lapels, the
  // white shirt front between them with a black bow tie, one button, and the trousers' satin side stripe showing on
  // the bottom fold.
  local top = 0.05;
  h.compound('tux', 1.4,
    h.foldedGarment(0.38, 0.32, top, 4)
    + [
      h.prism('shirt', 'shirt', 'y', [[-0.16, -0.07], [-0.16, 0.07], [0.04, 0.0]], top, top + 0.002),
      h.prism('lapel-l', 'lapel', 'y', [[-0.16, -0.12], [-0.16, -0.07], [0.04, -0.002], [0.04, -0.03]], top, top + 0.005),
      h.prism('lapel-r', 'lapel', 'y', [[-0.16, 0.07], [-0.16, 0.12], [0.04, 0.03], [0.04, 0.002]], top, top + 0.005),
      h.prism('bow-l', 'bow', 'y', [[-0.15, -0.03], [-0.13, -0.03], [-0.14, 0.0]], top + 0.002, top + 0.008),
      h.prism('bow-r', 'bow', 'y', [[-0.15, 0.03], [-0.14, 0.0], [-0.13, 0.03]], top + 0.002, top + 0.008),
      box('bow-knot', 'bow', [-0.006, top + 0.002, -0.146], [0.006, top + 0.01, -0.134]),
      box('pocket', 'lapel', [0.06, top, 0.08], [0.15, top + 0.002, 0.09]),
      box('pocket-l', 'lapel', [-0.15, top, 0.08], [-0.06, top + 0.002, 0.09]),
      box('stripe', 'lapel', [-0.19, 0.0, 0.158], [0.19, 0.012, 0.161]),
    ]
    + buttons('shirt-stud', 0, -0.11, -0.03, 3, top + 0.002, 0.003)
    + [h.disc('button', 'satin-button', 0.008, top, top + 0.004, 0, 0.065)],
    { cloth: 'cloth-black', shirt: 'cloth-bright-white', lapel: 'leather-patent', bow: 'leather-patent', button: 'plastic-black', 'satin-button': 'leather-patent' })
  + { voxelGrain: 0.004 },

  // A sleeveless denim vest folded, 300 mm by 240 mm and 25 mm tall: a shirt collar along the back, two buttoned
  // flap pockets on the chest, a row of metal buttons down the front and the waistband seam across the hem.
  local top = 0.025;
  h.compound('vest_jean', 0.45,
    h.foldedGarment(0.3, 0.24, top, 3)
    + [collar(0.2, -0.11, top, 0.01)]
    + pocket('pocket-l', -0.11, -0.03, -0.07, 0.0, top, 0.003, 0.024)
    + pocket('pocket-r', 0.03, 0.11, -0.07, 0.0, top, 0.003, 0.024)
    + [
      h.disc('pocket-l-button', 'button', 0.005, top + 0.006, top + 0.009, -0.07, -0.055),
      h.disc('pocket-r-button', 'button', 0.005, top + 0.006, top + 0.009, 0.07, -0.055),
      box('placket', 'seam', [-0.009, top, -0.1], [0.009, top + 0.002, 0.12]),
      box('waistband', 'seam', [-0.15, top, 0.09], [0.15, top + 0.002, 0.096]),
    ]
    + buttons('button', 0, -0.07, 0.105, 5, top + 0.002, 0.006),
    { cloth: 'cloth-denim', collar: 'cloth-denim', pocket: 'cloth-denim', flap: 'cloth-denim', seam: 'cloth-khaki', button: 'metal-silver' })
  + { voxelGrain: 0.002 },

  // A dark grey waistcoat folded, 280 mm by 220 mm and 15 mm tall: the deep V neck showing the black satin back,
  // five small buttons down the front, two welt pockets and the pointed front tips at the hem.
  local top = 0.015;
  h.compound('waistcoat', 0.3,
    h.foldedGarment(0.28, 0.22, top, 3)
    + [
      h.prism('neck', 'back', 'y', [[-0.11, -0.07], [-0.11, 0.07], [-0.01, 0.0]], top, top + 0.002),
      box('welt-l', 'welt', [-0.12, top, 0.03], [-0.05, top + 0.002, 0.038]),
      box('welt-r', 'welt', [0.05, top, 0.03], [0.12, top + 0.002, 0.038]),
      box('welt-breast', 'welt', [0.05, top, -0.05], [0.1, top + 0.002, -0.044]),
      h.prism('tip-l', 'cloth', 'y', [[0.11, -0.06], [0.11, -0.002], [0.14, -0.03]], 0, top),
      h.prism('tip-r', 'cloth', 'y', [[0.11, 0.002], [0.11, 0.06], [0.14, 0.03]], 0, top),
      box('placket', 'welt', [-0.002, top, -0.01], [0.002, top + 0.002, 0.11]),
    ]
    + buttons('button', 0.008, 0.0, 0.1, 5, top, 0.0045),
    { cloth: 'wool-grey', back: 'cloth-black', welt: 'plastic-charcoal', button: 'plastic-black' })
  + { voxelGrain: 0.002 },

  // An olive drab padded army winter jacket folded, 380 mm by 320 mm and 50 mm tall: quilted baffles, the hood
  // folded down on top, a zip with a storm flap, two flapped chest pockets, two flapped hip pockets and a
  // hook-and-loop patch on the left chest.
  local top = 0.05;
  h.compound('winter_jacket_army', 1.6,
    h.foldedGarment(0.38, 0.32, top, 3)
    + ridges('baffle', 'baffle', -0.19, 0.19, [-0.02, 0.04, 0.1, 0.15], top, 0.005, 0.01)
    + hood(0.24, -0.16, -0.05, top, 0.012, 0.012)
    + [
      box('zip', 'zip', [-0.004, top, -0.05], [0.004, top + 0.007, 0.16]),
      box('storm-flap', 'flap', [0.004, top, -0.05], [0.02, top + 0.006, 0.16]),
      box('patch', 'patch', [-0.15, top + 0.005, -0.04], [-0.1, top + 0.008, -0.01]),
    ]
    + pocket('chest-l', -0.09, -0.03, -0.045, 0.03, top + 0.005, 0.004, 0.02)
    + pocket('chest-r', 0.04, 0.12, -0.045, 0.03, top + 0.005, 0.004, 0.02)
    + pocket('hip-l', -0.17, -0.06, 0.07, 0.155, top + 0.005, 0.005, 0.025)
    + pocket('hip-r', 0.06, 0.17, 0.07, 0.155, top + 0.005, 0.005, 0.025),
    { cloth: 'cloth-olive-drab', baffle: 'cloth-olive-drab', hood: 'cloth-olive-drab', rim: 'webbing-olive-dark', zip: 'plastic-matte-black', pocket: 'cloth-olive-drab', flap: 'webbing-olive-dark', patch: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },

  // A blue cotton summer robe folded flat, 320 mm by 260 mm and 25 mm tall: the white collar band crossing
  // left over right, and the folded red sash laid across the hem.
  local top = 0.025;
  h.compound('yukata', 0.54,
    h.foldedGarment(0.32, 0.26, top, 3)
    + [
      h.prism('collar-l', 'collar', 'y', [[-0.13, -0.06], [-0.13, -0.035], [0.05, 0.04], [0.05, 0.015]], top, top + 0.003),
      h.prism('collar-r', 'collar', 'y', [[-0.13, 0.035], [-0.13, 0.06], [-0.04, 0.015], [-0.04, -0.01]], top, top + 0.002),
      box('sash', 'sash', [-0.15, top, 0.06], [0.15, top + 0.01, 0.12]),
      box('sash-fold', 'sash', [-0.15, top + 0.01, 0.07], [0.15, top + 0.016, 0.11]),
      box('sash-edge', 'edge', [-0.15, top + 0.016, 0.088], [0.15, top + 0.017, 0.092]),
    ],
    { cloth: 'cloth-navy', collar: 'cloth-cream', sash: 'cloth-crimson', edge: 'brass-dull' })
  + { voxelGrain: 0.004 },
]
