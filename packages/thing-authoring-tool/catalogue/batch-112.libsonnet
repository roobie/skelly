local h = import '../compound.libsonnet';
local box = h.box;

// A flag folded into a flat oblong `w` across, `d` deep and `ht` tall in `folds` layers, with its canvas hoist strip
// and two brass grommets lying along the left end of the top fold. Slots: cloth, header, grommet.
local foldedFlag(w, d, ht, folds) =
  h.foldedGarment(w, d, ht, folds) + [
    box('header', 'header', [-w / 2, ht, -d / 2 + 0.01], [-w / 2 + 0.04, ht + 0.003, d / 2]),
  ] + [
    h.disc('grommet-%d' % i, 'grommet', 0.008, ht + 0.003, ht + 0.006, -w / 2 + 0.02, z)
    for i in [0, 1]
    for z in [[-d / 2 + 0.05, d / 2 - 0.04][i]]
  ];

// A sleeve folded back across the top of a folded garment at height y: a flattened tube from x0 to x1 centred on z,
// `w` wide, ending in a cuff at x1. Slots: sleeve, cuff.
local sleeve(p, x0, x1, z, w, y, t=0.014, cuff=0.03) = [
  box(p + 'sleeve', 'sleeve', [x0, y, z - w / 2], [x1 - cuff, y + t, z + w / 2]),
  box(p + 'cuff', 'cuff', [x1 - cuff, y, z - w / 2 - 0.002], [x1, y + t + 0.002, z + w / 2 + 0.002]),
];

[
  // A cloak of thin plastic panels folded flat, 400 mm by 300 mm and 36 mm tall in three layers: rows of tiny
  // camera lenses and LEDs across the outer face, and a power lead coiled on top ending in a plug.
  h.compound('optical_cloak', 1.4, h.foldedGarment(0.4, 0.3, 0.03, 3) + [
    h.disc('lens-%d-%d' % [i, j], 'lens', 0.005, 0.03, 0.033, -0.17 + j * 0.034, -0.12 + i * 0.04)
    for i in std.range(0, 6)
    for j in std.range(0, 10)
    if (i + j) % 2 == 0
  ] + [
    box('led-%d-%d' % [i, j], 'led', [-0.174 + j * 0.034, 0.03, -0.124 + i * 0.04], [-0.166 + j * 0.034, 0.032, -0.116 + i * 0.04])
    for i in std.range(0, 6)
    for j in std.range(0, 10)
    if (i + j) % 2 == 1
  ] + h.strapLoop('lead-', 'lead', 0.16, 0.035, 0.008, 0.006, 0.033, 0.06, 0.07) + [
    box('lead-tail', 'lead', [0.1, 0.033, 0.03], [0.108, 0.039, 0.16]),
    box('plug', 'plug', [0.096, 0.03, 0.16], [0.112, 0.042, 0.19]),
  ], { cloth: 'plastic-charcoal', lens: 'screen-black', led: 'lcd-green', lead: 'plastic-matte-black', plug: 'plastic-grey' })
  + { voxelGrain: 0.004 },

  // A wool poncho folded flat, 320 mm by 240 mm and 36 mm tall in three layers: grey with a red and a cream band
  // woven across it, the neck slit lying open on top and a knotted fringe hanging from the front edge.
  h.compound('poncho', 0.64, h.foldedGarment(0.32, 0.24, 0.036, 3) + [
    box('band-red', 'band-red', [-0.16, 0.036, 0.03], [0.16, 0.038, 0.055]),
    box('band-cream-a', 'band-cream', [-0.16, 0.036, 0.062], [0.16, 0.038, 0.072]),
    box('band-cream-b', 'band-cream', [-0.16, 0.036, 0.013], [0.16, 0.038, 0.023]),
    box('band-red-b', 'band-red', [-0.16, 0.036, -0.1], [0.16, 0.038, -0.088]),
    box('neck', 'neck', [-0.01, 0.036, -0.07], [0.01, 0.038, -0.01]),
    box('neck-trim', 'band-red', [-0.016, 0.036, -0.076], [0.016, 0.039, -0.07]),
  ] + [
    box('fringe-%d' % i, 'fringe', [-0.15 + i * 0.02, 0.012 + (i % 2) * 0.004, 0.12], [-0.144 + i * 0.02, 0.036, 0.15])
    for i in std.range(0, 15)
  ], { cloth: 'wool-grey', 'band-red': 'cloth-red', 'band-cream': 'cloth-cream', neck: 'cloth-black', fringe: 'wool-grey' })
  + { voxelGrain: 0.004 },

  // A black plastic bin bag flattened out, 600 mm across and 800 mm long: a notch cut from the middle of its closed
  // end for the head, one cut from each side for the arms, and the yellow drawstring knotted at the open end.
  h.compound('poncho_makeshift', 0.048, [
    box('bag-body', 'bag', [-0.26, 0, -0.33], [0.26, 0.004, 0.4]),
    box('bag-l-top', 'bag', [-0.3, 0, -0.4], [-0.26, 0.004, -0.22]),
    box('bag-l-low', 'bag', [-0.3, 0, -0.12], [-0.26, 0.004, 0.4]),
    box('bag-r-top', 'bag', [0.26, 0, -0.4], [0.3, 0.004, -0.22]),
    box('bag-r-low', 'bag', [0.26, 0, -0.12], [0.3, 0.004, 0.4]),
    box('bag-end-l', 'bag', [-0.26, 0, -0.4], [-0.08, 0.004, -0.33]),
    box('bag-end-r', 'bag', [0.08, 0, -0.4], [0.26, 0.004, -0.33]),
    box('seam', 'seam', [-0.3, 0.004, -0.4], [-0.08, 0.005, -0.392]),
    box('seam-b', 'seam', [0.08, 0.004, -0.4], [0.3, 0.005, -0.392]),
    box('hem', 'seam', [-0.3, 0.004, 0.384], [0.3, 0.005, 0.4]),
    box('tie-a', 'tie', [-0.06, 0.004, 0.39], [-0.02, 0.008, 0.45]),
    box('tie-b', 'tie', [0.02, 0.004, 0.39], [0.06, 0.008, 0.45]),
    h.disc('knot', 'tie', 0.014, 0.004, 0.016, 0, 0.45),
    box('crease', 'seam', [-0.3, 0.004, 0.1], [0.3, 0.005, 0.106]),
  ], { bag: 'plastic-black', seam: 'plastic-charcoal', tie: 'plastic-yellow' })
  + { voxelGrain: 0.004 },

  // A large cotton flag folded into an oblong, 340 mm by 250 mm and 48 mm tall in four layers: six rainbow stripes
  // run across the top fold, with a canvas hoist strip and two brass grommets along its left end.
  h.compound('pride_flag', 0.6, foldedFlag(0.34, 0.25, 0.048, 4) + [
    box('stripe-%d' % i, 'stripe-%d' % i, [-0.13, 0.048, -0.12 + i * 0.04], [0.17, 0.0495, -0.08 + i * 0.04])
    for i in std.range(0, 5)
  ], {
    cloth: 'cloth-white',
    header: 'cloth-cream',
    grommet: 'brass-polished',
    'stripe-0': 'cloth-red',
    'stripe-1': 'cloth-orange',
    'stripe-2': 'cloth-yellow',
    'stripe-3': 'cloth-green',
    'stripe-4': 'cloth-blue',
    'stripe-5': 'plant-purple',
  })
  + { voxelGrain: 0.004 },

  // A fleece blanket with sleeves folded flat, 320 mm by 260 mm and 40 mm tall in four layers, both sleeves folded
  // back across the top side by side, each ending in a ribbed cuff.
  h.compound('snuggie', 0.64, h.foldedGarment(0.32, 0.26, 0.04, 4)
                               + sleeve('l-', -0.16, 0.13, -0.06, 0.08, 0.04, 0.016, 0.035)
                               + sleeve('r-', -0.16, 0.13, 0.04, 0.08, 0.04, 0.016, 0.035),
             { cloth: 'cloth-blue', sleeve: 'cloth-blue', cuff: 'cloth-navy' })
  + { voxelGrain: 0.004 },

  // A white cotton flag folded into an oblong, 340 mm by 250 mm and 48 mm tall in four layers: a blue shield with a
  // gold star in its centre lies on the top fold, with a canvas hoist strip and two brass grommets at the left end.
  h.compound('state_flag', 0.6, foldedFlag(0.34, 0.25, 0.048, 4) + [
    h.prism('shield', 'shield', 'y', [[-0.09, -0.07], [-0.09, 0.07], [0.02, 0.07], [0.08, 0], [0.02, -0.07]], 0.048, 0.0495),
  ] + [
    // A five-pointed star: a pentagon with a triangle on each side, every piece convex.
    local pt(k, r) = [-0.012 - r * std.cos(std.pi * k / 5), r * std.sin(std.pi * k / 5)];
    h.prism('star-core', 'star', 'y', [pt(k, 0.014) for k in [1, 3, 5, 7, 9]], 0.0495, 0.051),
  ] + [
    local pt(k, r) = [-0.012 - r * std.cos(std.pi * k / 5), r * std.sin(std.pi * k / 5)];
    h.prism('star-point-%d' % i, 'star', 'y', [pt(2 * i - 1, 0.014), pt(2 * i, 0.035), pt(2 * i + 1, 0.014)], 0.0495, 0.051)
    for i in std.range(0, 4)
  ], { cloth: 'cloth-cream', header: 'cloth-khaki', grommet: 'brass-polished', shield: 'cloth-blue', star: 'cloth-yellow' })
  + { voxelGrain: 0.004 },

  // A full-length black cotton robe folded flat, 320 mm by 240 mm and 32 mm tall in four layers: the front opening
  // runs down the top fold edged with a narrow gold-embroidered trim, and one sleeve lies folded back with a trimmed
  // cuff.
  h.compound('abaya', 0.61, h.foldedGarment(0.32, 0.24, 0.032, 4) + [
    box('opening', 'trim', [-0.012, 0.032, -0.11], [-0.006, 0.0335, 0.12]),
    box('opening-b', 'trim', [0.006, 0.032, -0.11], [0.012, 0.0335, 0.12]),
    box('collar', 'trim', [-0.06, 0.032, -0.116], [0.06, 0.0335, -0.108]),
  ] + sleeve('l-', -0.16, 0.12, 0.05, 0.08, 0.032, 0.012, 0.025)
  + [box('cuff-trim', 'trim', [0.12 - 0.006, 0.044, 0.008], [0.12, 0.0455, 0.092])],
             { cloth: 'cloth-black', sleeve: 'cloth-black', cuff: 'cloth-black', trim: 'metal-gold' })
  + { voxelGrain: 0.004 },

  // A firefighter's turnout coat folded flat, 420 mm by 320 mm and 60 mm tall in three layers of tan shell: two
  // reflective bands with a silver centre stripe across it, a big bellows pocket with a flap, a row of steel hook
  // clasps down the storm flap, the high collar on top and one sleeve folded back ending in a black knit wristlet.
  h.compound('bunker_coat', 2.1, h.foldedGarment(0.42, 0.32, 0.06, 3) + [
    box('band-a', 'band', [-0.21, 0.06, 0.105], [0.21, 0.062, 0.15]),
    box('band-a-silver', 'silver', [-0.21, 0.062, 0.122], [0.21, 0.0635, 0.133]),
    box('band-b', 'band', [-0.21, 0.0, 0.158], [0.21, 0.06, 0.16]),
    box('pocket', 'cloth', [0.05, 0.06, -0.03], [0.18, 0.075, 0.09]),
    box('pocket-flap', 'flap', [0.045, 0.075, -0.035], [0.185, 0.079, 0.015]),
    box('pocket-band', 'band', [0.05, 0.075, 0.05], [0.18, 0.077, 0.07]),
    box('storm-flap', 'flap', [0.0, 0.06, -0.15], [0.04, 0.064, 0.16]),
    box('collar', 'flap', [-0.13, 0.06, -0.16], [0.13, 0.072, -0.12]),
    box('collar-tab', 'flap', [0.13, 0.06, -0.155], [0.18, 0.07, -0.125]),
  ] + [
    box('clasp-%d' % i, 'clasp', [0.012, 0.064, z], [0.03, 0.068, z + 0.012])
    for i in std.range(0, 4)
    for z in [-0.1 + i * 0.05]
  ] + sleeve('l-', -0.21, 0.02, -0.04, 0.11, 0.06, 0.02, 0.04)
  + [box('sleeve-band', 'band', [-0.08, 0.08, -0.096], [-0.04, 0.082, 0.016])],
             { cloth: 'cloth-khaki', sleeve: 'cloth-khaki', cuff: 'cloth-black', flap: 'cloth-khaki', band: 'reflective-yellow', silver: 'mirror-silver', clasp: 'steel-grey' })
  + { voxelGrain: 0.004 },
]
