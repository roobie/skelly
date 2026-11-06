local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;
local strip = g.strip;
local flat = g.flat;

// Aprons, shirts and dresses folded on a shelf: each lies on h.foldedGarment, `w` across x and `d` along z, its top
// face at `ht`, with the neck at the +z end (front) and the hem folded under at the -z end.

// An apron folded into a block with its bib lying on top: the bib tapering towards the neck, the neck strap
// running up to the top edge and along it, the waist ties running from the bib's corners down both side edges, and a
// patch pocket split in two near the hem, so the bib stays clear.
// `t` is the cloth thickness, `binding` a finish slot for edges and `rivets` adds rivets at the pocket's corners.
local apron(id, mass, finish, o={}) =
  local c = { w: 0.26, d: 0.32, ht: 0.024, folds: 2, t: 0.004, rivets: false, buckle: false } + o;
  local w = c.w, d = c.d, ht = c.ht, t = c.t;
  local bz0 = -0.035, bz1 = 0.085;
  h.compound(id, mass, h.foldedGarment(w, d, ht, c.folds) + [
    flat('bib', 'bib', [[-0.105, bz0], [0.105, bz0], [0.07, bz1], [-0.07, bz1]], ht, t),
    flat('bib-hem', 'binding', [[-0.07, bz1 - 0.008], [0.07, bz1 - 0.008], [0.07, bz1], [-0.07, bz1]], ht + t, 0.002),
    // The neck strap rises from the bib's top corners and lies along the top edge.
    strip('neck-l', 'strap', [-0.07, bz1 - 0.004], [-0.1, d / 2 - 0.01], ht + t, 0.012, 0.004),
    strip('neck-r', 'strap', [0.07, bz1 - 0.004], [0.1, d / 2 - 0.01], ht + t, 0.012, 0.004),
    box('neck-top', 'strap', [-0.106, ht, d / 2 - 0.016], [0.106, ht + t + 0.004, d / 2 - 0.004]),
  ] + std.flattenArrays([
    // Each waist tie leaves the bib's lower corner and runs down its side edge, its end tucked under at the hem.
    [
      g.sbox('tie-%s-out' % sd, 'strap', [sg * 0.1, ht + t, bz0 - 0.002], [sg * (w / 2 - 0.004), ht + t + 0.004, bz0 + 0.012]),
      g.sbox('tie-%s' % sd, 'strap', [sg * (w / 2 - 0.018), ht, -d / 2 + 0.012], [sg * (w / 2 - 0.004), ht + t + 0.004, bz0 + 0.012]),
    ]
    for sd in ['l', 'r']
    for sg in [if sd == 'l' then -1 else 1]
  ]) + [
    box('pocket', 'pocket', [-0.085, ht, -d / 2 + 0.02], [0.085, ht + t, -0.055]),
    box('pocket-seam', 'binding', [-0.002, ht + t, -d / 2 + 0.02], [0.002, ht + t + 0.002, -0.055]),
    box('pocket-hem', 'binding', [-0.085, ht + t, -0.063], [0.085, ht + t + 0.002, -0.055]),
  ] + (if c.rivets then [
         h.disc('rivet-%d-%d' % [i, j], 'rivet', 0.004, ht + t, ht + t + 0.003, x, z)
         for i in [0, 1, 2]
         for j in [0, 1]
         for x in [[-0.08, 0, 0.08][i]]
         for z in [[-d / 2 + 0.026, -0.061][j]]
       ] else [])
  + (if c.buckle then [
       box('buckle', 'rivet', [0.072, ht + t + 0.004, bz1 + 0.026], [0.09, ht + t + 0.008, bz1 + 0.044]),
     ] else []), finish)
  + { voxelGrain: 0.004 };

// A shirt folded as shops fold them: the collar standing at the +z end with its two points lying forward, a placket
// of small buttons down the middle and the sleeves tucked behind. `pockets` are jacket pocket options.
local shirt(id, mass, finish, o={}) =
  local c = { w: 0.24, d: 0.3, ht: 0.03, buttons: 5, pockets: [], front: 'placket', collar: true } + o;
  local w = c.w, d = c.d, ht = c.ht, cz = d / 2 - 0.06;
  h.compound(id, mass, g.jacket({
    w: w, d: d, ht: ht, folds: 3, neck: 0.06,
    collar: if c.collar then { r: 0.05, wd: 0.016, ht: 0.018, gap: 30 } else null,
    front: c.front, frontW: 0.024, frontT: 0.003,
    buttons: std.makeArray(c.buttons, function(i) cz - 0.07 - i * (cz - 0.07 + d / 2 - 0.02) / c.buttons),
    buttonR: 0.0045,
    pockets: c.pockets,
  }) + (if c.collar then [
          h.disc('neck', 'lining', 0.05, ht - 0.001, ht + 0.001, 0, cz),
          flat('collar-point-l', 'collar', [[-0.008, cz - 0.048], [-0.05, cz - 0.02], [-0.034, cz - 0.078]], ht, 0.007),
          flat('collar-point-r', 'collar', [[0.008, cz - 0.048], [0.034, cz - 0.078], [0.05, cz - 0.02]], ht, 0.007),
        ] else []) + std.get(c, 'extra', []), finish)
  + { voxelGrain: 0.004 };

// A dress folded flat: a neckline scooped into the top layer at the +z end, painted dark as the inside showing, and
// optional extras. Compound pieces only add, so the neckline is a flush crescent of the lining finish.
local dress(o) =
  local c = { w: 0.28, d: 0.34, ht: 0.04, folds: 4, neckR: 0.06 } + o;
  local cz = c.d / 2;
  h.foldedGarment(c.w, c.d, c.ht, c.folds)
  + [flat('neckline', 'lining', [g.onArc(c.neckR, 90 + 180 * i / 10, cz) for i in std.range(0, 10)], c.ht - 0.001, 0.002)]
  + h.crescent('neck-trim', 'trim', c.neckR, c.neckR + 0.01, 90, 270, 10, c.ht, c.ht + 0.003, 0, cz);

[
  // A cotton kitchen apron folded to 260 mm by 320 mm and 24 mm tall: the bib on top, its neck strap along
  // the top edge, the waist ties down both side edges and a split patch pocket near the hem.
  apron('apron_cotton', 0.31, { cloth: 'cloth-cream', bib: 'cloth-cream', binding: 'cloth-navy', strap: 'cloth-navy', pocket: 'cloth-cream' }),

  // A cut-resistant aramid apron folded the same, a little stiffer, with black binding and black ties.
  apron('apron_cut_resistant', 0.39, { cloth: 'aramid-gold', bib: 'aramid-gold', binding: 'webbing-black', strap: 'webbing-black', pocket: 'aramid-gold' }, { ht: 0.03, t: 0.005 }),

  // A heavy leather work apron folded to 260 mm by 320 mm and 36 mm tall: riveted pocket, leather ties and a buckle
  // on the neck strap.
  apron('apron_leather', 1.4, { cloth: 'leather-tan', bib: 'leather-tan', binding: 'leather-chestnut', strap: 'leather-chestnut', pocket: 'leather-tan', rivet: 'brass-dull' }, { ht: 0.036, t: 0.006, rivets: true, buckle: true }),

  // A blue PVC splash apron folded to 260 mm by 320 mm and 24 mm tall, with white ties and binding.
  apron('apron_plastic', 0.35, { cloth: 'nitrile-blue', bib: 'nitrile-blue', binding: 'cloth-bright-white', strap: 'cloth-bright-white', pocket: 'nitrile-blue' }),

  // A short yellow dress with black stripes, folded to 280 mm by 300 mm and 40 mm tall, with its gauzy wings laid on
  // top and the antenna headband resting on them.
  local w = 0.28, d = 0.3, ht = 0.04;
  h.compound('bee_dress', 0.68, dress({ w: w, d: d, ht: ht }) + [
    box('stripe-%d' % i, 'stripe', [-w / 2 - 0.002, 0, z - 0.02], [w / 2 + 0.002, ht + 0.002, z + 0.02])
    for i in [0, 1, 2]
    for z in [[0.03, -0.045, -0.12][i]]
  ] + [
    flat('wing-l', 'wing', [[-0.01, 0.0], [-0.06, 0.07], [-0.12, 0.08], [-0.13, 0.03], [-0.09, -0.04], [-0.03, -0.03]], ht + 0.002, 0.004),
    flat('wing-r', 'wing', [[0.01, 0.0], [0.03, -0.03], [0.09, -0.04], [0.13, 0.03], [0.12, 0.08], [0.06, 0.07]], ht + 0.002, 0.004),
    box('wing-root', 'wire', [-0.012, ht + 0.002, -0.03], [0.012, ht + 0.01, 0.01]),
  ] + h.crescent('headband', 'wire', 0.055, 0.062, -120, 120, 12, ht + 0.006, ht + 0.012, 0, -0.06) + [
    strip('antenna-l', 'wire', [-0.03, -0.02], [-0.06, 0.06], ht + 0.012, 0.004, 0.004),
    strip('antenna-r', 'wire', [0.03, -0.02], [0.06, 0.06], ht + 0.012, 0.004, 0.004),
    h.disc('antenna-tip-l', 'wire', 0.009, ht + 0.012, ht + 0.026, -0.06, 0.062),
    h.disc('antenna-tip-r', 'wire', 0.009, ht + 0.012, ht + 0.026, 0.06, 0.062),
  ], { cloth: 'cloth-yellow', stripe: 'cloth-black', lining: 'cloth-black', trim: 'cloth-black', wing: 'mesh-white', wire: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },
  // A navy wool blazer folded flat, 360 mm by 340 mm and 60 mm tall: crossed lapels, two brass buttons, flapped hip
  // pockets and a breast welt, the sleeves folded in along each side.
  h.compound('blazer', 1.1, g.jacket({
    w: 0.36, d: 0.34, ht: 0.06, collar: null, front: 'shawl', vz: -0.05, frontW: 0.04, frontT: 0.005, buttons: [-0.07, -0.12], buttonR: 0.008,
    pockets: [{ x: 0.1, z: -0.11, w: 0.1, d: 0.014, flap: 0.012 }, { x: -0.1, z: 0.05, w: 0.07, d: 0.01, flap: 0, single: true }],
    sleeves: { kind: 'flat', w: 0.07, t: 0.005 },
  }) + [
    flat('shirt', 'shirt', [[-0.062, 0.17], [0.062, 0.17], [0, -0.045]], 0.06 - 0.001, 0.002),
    flat('tie', 'tie', [[-0.01, 0.17], [0.01, 0.17], [0.016, 0.02], [0, -0.01], [-0.016, 0.02]], 0.06, 0.003),
  ], { shirt: 'cloth-bright-white', tie: 'cloth-crimson', cloth: 'cloth-navy', collar: 'cloth-navy', front: 'cloth-navy', button: 'brass-dull', pocket: 'cloth-navy', flap: 'cloth-navy', sleeve: 'cloth-navy' })
  + { voxelGrain: 0.004 },

  // A strapless black patent bodysuit laid flat, 240 mm wide and 270 mm long, folded double: a corset bodice with
  // white piping along its top edge and down two boning seams, narrowing at the waist to a high-cut leg line.
  h.compound('bunny_suit_playboy', 0.26, [
    flat('bodice', 'suit', [[-0.12, 0.12], [-0.085, 0], [0.085, 0], [0.12, 0.12]], 0, 0.012),
    flat('hips', 'suit', [[-0.085, 0], [-0.11, -0.06], [-0.025, -0.15], [0.025, -0.15], [0.11, -0.06], [0.085, 0]], 0, 0.012),
    flat('cup-l', 'suit', [[-0.11, 0.12], [-0.1, 0.075], [-0.06, 0.06], [-0.015, 0.08], [-0.005, 0.12]], 0.012, 0.006),
    flat('cup-r', 'suit', [[0.005, 0.12], [0.015, 0.08], [0.06, 0.06], [0.1, 0.075], [0.11, 0.12]], 0.012, 0.006),
    box('piping-top', 'trim', [-0.12, 0.012, 0.114], [0.12, 0.02, 0.122]),
    strip('bone-l', 'trim', [-0.06, 0.06], [-0.045, -0.06], 0.012, 0.004, 0.002),
    strip('bone-r', 'trim', [0.06, 0.06], [0.045, -0.06], 0.012, 0.004, 0.002),
    strip('leg-l', 'trim', [-0.11, -0.06], [-0.025, -0.15], 0.012, 0.004, 0.002),
    strip('leg-r', 'trim', [0.11, -0.06], [0.025, -0.15], 0.012, 0.004, 0.002),
  ], { suit: 'leather-patent', trim: 'cloth-bright-white' })
  + { voxelGrain: 0.002 },

  // A pale blue long-sleeved button shirt folded as a shop folds it, 240 mm by 300 mm and 35 mm tall: collar
  // points, a placket of small white buttons.
  shirt('buttonshirt', 0.32, { cloth: 'cloth-blue', collar: 'cloth-blue', front: 'cloth-blue', button: 'cloth-bright-white', lining: 'cloth-navy' }),

  // A blue and white cheerleader dress folded small, 240 mm by 280 mm and 25 mm tall: a white chest band where the
  // lettering goes, white neck trim and a pleated skirt hem of alternating white panels.
  local w = 0.24, d = 0.28, ht = 0.025;
  h.compound('cheerleader_dress', 0.24, dress({ w: w, d: d, ht: ht, folds: 3, neckR: 0.05 }) + [
    box('chest-band', 'trim', [-w / 2, ht, 0.03], [w / 2, ht + 0.003, 0.065]),
    box('waist', 'trim', [-w / 2, ht, -0.04], [w / 2, ht + 0.003, -0.03]),
  ] + [
    box('pleat-%d' % i, 'trim', [-w / 2 + 0.01 + i * 0.04, ht, -d / 2], [-w / 2 + 0.03 + i * 0.04, ht + 0.003, -0.05])
    for i in std.range(0, 5)
  ], { cloth: 'cloth-blue', lining: 'cloth-navy', trim: 'cloth-bright-white' })
  + { voxelGrain: 0.004 },

  // A short red cheerleader tank top folded small, 200 mm by 200 mm and 20 mm tall: white straps and neck trim, and
  // a white band across the chest where the lettering goes.
  local w = 0.2, d = 0.2, ht = 0.02;
  h.compound('cheerleader_top_short', 0.11, dress({ w: w, d: d, ht: ht, folds: 2, neckR: 0.045 }) + [
    box('strap-l', 'trim', [-0.075, ht, d / 2 - 0.03], [-0.055, ht + 0.003, d / 2]),
    box('strap-r', 'trim', [0.055, ht, d / 2 - 0.03], [0.075, ht + 0.003, d / 2]),
    box('chest-band', 'trim', [-w / 2, ht, -0.015], [w / 2, ht + 0.003, 0.02]),
  ], { cloth: 'cloth-red', lining: 'cloth-crimson', trim: 'cloth-bright-white' })
  + { voxelGrain: 0.004 },

  // A combat shirt folded flat, 280 mm by 320 mm and 40 mm tall: a thin khaki torso with a short zip under a mandarin
  // collar, olive jacket-weight sleeves folded in along each side, each with a flapped shoulder pocket, grey
  // hook-and-loop patch panels and a pen slot on the left.
  local w = 0.28, d = 0.32, ht = 0.04;
  h.compound('combat_shirt', 0.58, g.jacket({
    w: w, d: d, ht: ht, neck: 0.07, collar: { r: 0.05, wd: 0.016, ht: 0.024, gap: 25 },
    front: 'placket', frontW: 0.016, frontT: 0.003, buttons: [], sleeves: { kind: 'flat', w: 0.075, t: 0.006 },
  }) + [
    box('zip', 'zip', [-0.004, ht + 0.003, -0.02], [0.004, ht + 0.005, d / 2 - 0.12]),
    box('zip-pull', 'zip', [-0.006, ht + 0.005, -0.03], [0.006, ht + 0.008, -0.016]),
  ] + std.flattenArrays([
    local x = s * (w / 2 - 0.0375);
    [
      box('arm-pocket-%d' % (s + 1), 'sleeve', [x - 0.03, ht + 0.006, -0.02], [x + 0.03, ht + 0.01, 0.06]),
      box('arm-flap-%d' % (s + 1), 'flap', [x - 0.032, ht + 0.01, 0.035], [x + 0.032, ht + 0.014, 0.063]),
      box('arm-patch-%d' % (s + 1), 'patch', [x - 0.025, ht + 0.01, 0.0], [x + 0.025, ht + 0.012, 0.03]),
    ]
    for s in [-1, 1]
  ]) + [
    box('pen-slot', 'flap', [-w / 2 + 0.06, ht + 0.006, -0.1], [-w / 2 + 0.075, ht + 0.01, -0.04]),
    h.disc('pen-cap', 'zip', 0.004, ht + 0.01, ht + 0.016, -w / 2 + 0.0675, -0.04),
  ], { cloth: 'cloth-khaki', collar: 'cloth-khaki', front: 'cloth-khaki', button: 'cloth-khaki', sleeve: 'cloth-olive-drab', flap: 'cloth-olive-drab', patch: 'hook-loop-grey', zip: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A denim shirt folded as a shop folds it, 240 mm by 300 mm and 40 mm tall: collar points, pearl snaps down the
  // placket and two flapped chest pockets with snaps.
  shirt('denim_shirt', 0.39, { cloth: 'cloth-denim', collar: 'cloth-denim', front: 'cloth-denim', button: 'pearl', pocket: 'cloth-denim', flap: 'cloth-denim-faded', lining: 'cloth-denim-faded' }, {
    ht: 0.036, pockets: [{ x: 0.06, z: -0.035, w: 0.05, d: 0.055, flap: 0.018, snap: true }],
  }),

  // A long cotton dress folded in a thick bundle, 280 mm by 360 mm and 50 mm tall: a scooped neckline and a sash
  // wrapped round the waist and tied in a bow on top.
  local w = 0.28, d = 0.36, ht = 0.05, z = 0.03;
  h.compound('dress', 0.69, dress({ w: w, d: d, ht: ht, folds: 5 }) + [
    box('sash-top', 'sash', [-w / 2 - 0.004, ht, z - 0.016], [w / 2 + 0.004, ht + 0.004, z + 0.016]),
    box('sash-l', 'sash', [-w / 2 - 0.004, 0, z - 0.016], [-w / 2, ht, z + 0.016]),
    box('sash-r', 'sash', [w / 2, 0, z - 0.016], [w / 2 + 0.004, ht, z + 0.016]),
    flat('bow-l', 'sash', [[-0.006, z], [-0.04, z + 0.022], [-0.045, z - 0.018]], ht + 0.004, 0.008),
    flat('bow-r', 'sash', [[0.006, z], [0.045, z - 0.018], [0.04, z + 0.022]], ht + 0.004, 0.008),
    box('bow-knot', 'sash', [-0.008, ht + 0.004, z - 0.01], [0.008, ht + 0.016, z + 0.01]),
    strip('bow-end-l', 'sash', [-0.004, z - 0.01], [-0.02, z - 0.08], ht + 0.004, 0.014, 0.004),
    strip('bow-end-r', 'sash', [0.004, z - 0.01], [0.025, z - 0.075], ht + 0.004, 0.014, 0.004),
  ], { cloth: 'cloth-sage', lining: 'cloth-charcoal', trim: 'cloth-sage', sash: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A white pocket shirt folded as a shop folds it, 240 mm by 300 mm and 35 mm tall: collar points, a placket of
  // small buttons and one patch pocket on the left breast.
  shirt('dress_shirt', 0.32, { cloth: 'cloth-bright-white', collar: 'cloth-bright-white', front: 'cloth-bright-white', button: 'cloth-cream', pocket: 'cloth-cream', lining: 'cloth-cream' }, {
    pockets: [{ x: -0.06, z: -0.035, w: 0.05, d: 0.055, flap: 0, single: true }],
  }),

  // A wedding gown folded into a deep box-sized bundle, 560 mm by 460 mm and 140 mm tall: the boned bodice with a
  // sweetheart neckline lying on top, a pearl-studded waist band, and tiers of tulle ruffles spilling over the hem
  // end and both sides.
  local w = 0.56, d = 0.46, ht = 0.14;
  h.compound('dress_wedding', 5.6, h.foldedGarment(w, d, ht, 5) + [
    flat('bodice', 'bodice', [[-0.11, 0.2], [-0.075, 0.03], [0.075, 0.03], [0.11, 0.2]], ht, 0.01),
    flat('cup-l', 'bodice', [[-0.105, 0.2], [-0.1, 0.17], [-0.06, 0.155], [-0.012, 0.18], [-0.005, 0.2]], ht + 0.01, 0.008),
    flat('cup-r', 'bodice', [[0.005, 0.2], [0.012, 0.18], [0.06, 0.155], [0.1, 0.17], [0.105, 0.2]], ht + 0.01, 0.008),
    box('waist', 'bodice', [-0.09, ht, 0.0], [0.09, ht + 0.014, 0.03]),
  ] + [
    h.disc('pearl-%d' % i, 'pearl', 0.005, ht + 0.014, ht + 0.02, -0.075 + i * 0.025, 0.015)
    for i in std.range(0, 6)
  ] + [
    strip('seam-%d' % i, 'tulle', [x, 0.16], [x * 0.7, 0.035], ht + 0.01, 0.004, 0.002)
    for i in [0, 1, 2]
    for x in [[-0.05, 0, 0.05][i]]
  ] + [
    flat('skirt', 'tulle', [[-0.2, 0.0], [0.2, 0.0], [0.26, -d / 2], [-0.26, -d / 2]], ht, 0.006),
  ] + g.quilt({ style: 'lattice', x0: -0.18, x1: 0.18, z0: -d / 2 + 0.02, z1: -0.02, y: ht + 0.006, pitch: 0.05, w: 0.005, t: 0.002, slot: 'lace', prefix: 'lace' }) + std.flattenArrays([
    [
      h.turned('ruffle-hem-%d' % i, 'tulle', 'x', [[0, 0], [0, 0.022], [w + 0.02, 0.022], [w + 0.02, 0]], [-w / 2 - 0.01, ht * (i + 0.5) / 3, -d / 2 - 0.006]),
    ]
    for i in [0, 1, 2]
  ]) + [
    h.turned('ruffle-side-%d-%d' % [s + 1, i], 'tulle', 'z', [[0, 0], [0, 0.018], [d * 0.7, 0.018], [d * 0.7, 0]], [s * (w / 2 + 0.004), ht * (i + 0.5) / 3, -d / 2])
    for s in [-1, 1]
    for i in [0, 1, 2]
  ], { cloth: 'cloth-cream', bodice: 'cloth-bright-white', pearl: 'pearl', tulle: 'mesh-white', lace: 'cloth-cream' })
  + { voxelGrain: 0.004 },
]
