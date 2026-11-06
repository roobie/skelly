local h = import '../compound.libsonnet';
local box = h.box;
// A quiver lying on the floor along x, its closed foot at x = 0 and its open mouth at +x behind a stiffened cuff.
// Slots: body, cuff.
local quiverTube(prefix, length, r) = [
  h.rod(prefix + '-body', 'body', r, 0, length - 0.04, r),
  h.tube(prefix + '-mouth', 'body', r - 0.003, r, length - 0.04, length, r, 0),
  h.tube(prefix + '-cuff', 'cuff', r - 0.002, r + 0.003, length - 0.05, length - 0.01, r, 0),
  h.tube(prefix + '-foot', 'cuff', r * 0.5, r + 0.002, 0, 0.02, r, 0),
];
// A long strap lying on the floor beside a quiver at z from `z0` to `z0 + w`, its ends turning in to the quiver.
local strapAlong(prefix, slot, x0, x1, z0, w) = [
  box(prefix + '-run', slot, [x0, 0, z0], [x1, 0.003, z0 + w]),
  box(prefix + '-end-a', slot, [x0, 0, 0], [x0 + w, 0.003, z0]),
  box(prefix + '-end-b', slot, [x1 - w, 0, 0], [x1, 0.003, z0]),
];
[
  // A cotton tube quiver 600 mm long and 80 mm across, open at one end under a stiffened cuff, with a tie cord at
  // its middle and a shoulder strap lying beside it.
  h.compound('quiver_simple_cloth', 0.12, quiverTube('quiver', 0.6, 0.04)
    + strapAlong('strap', 'strap', 0.06, 0.52, 0.05, 0.025)
    + [h.tube('tie', 'strap', 0.04, 0.043, 0.3, 0.31, 0.04, 0)], {
    body: 'cloth-canvas',
    cuff: 'cloth-khaki',
    strap: 'cloth-khaki',
  })
  + { voxelGrain: 0.004 },

  // A cotton quiver 700 mm long and 100 mm across with a flat bag 700 mm by 110 mm strapped along its side for a
  // takedown bow's limbs, and a small accessory pouch sewn on top.
  h.compound('quiver_takedown_bow', 0.35, quiverTube('quiver', 0.7, 0.05) + [
    box('bow-bag', 'bag', [0.02, 0, -0.17], [0.68, 0.04, -0.06]),
    box('bow-bag-zip', 'strap', [0.02, 0.04, -0.118], [0.68, 0.043, -0.112]),
    box('pouch', 'bag', [0.2, 0.09, -0.035], [0.32, 0.12, 0.035]),
    box('pouch-flap', 'strap', [0.28, 0.09, -0.038], [0.323, 0.123, 0.038]),
  ] + [
    box('band-%d' % i, 'strap', [x, 0, -0.172], [x + 0.025, 0.043, -0.04])
    for i in [0, 1]
    for x in [[0.12, 0.52][i]]
  ] + [
    h.tube('band-ring-%d' % i, 'strap', 0.05, 0.053, x, x + 0.025, 0.05, 0)
    for i in [0, 1]
    for x in [[0.12, 0.52][i]]
  ], { body: 'cloth-olive-drab', cuff: 'webbing-olive-dark', bag: 'cloth-olive-drab', strap: 'webbing-olive-dark' })
  + { voxelGrain: 0.004 },

  // A nylon radio pouch 80 mm wide, 160 mm tall and 50 mm deep, open-topped with a shock-cord retainer across the
  // top and a toggle, and two webbing straps on its back.
  h.compound('radio_pouch', 0.07, [
    box('body', 'body', [-0.04, 0, -0.025], [0.04, 0.16, 0.025]),
    box('cord-front', 'cord', [-0.003, 0.11, 0.025], [0.003, 0.165, 0.028]),
    box('cord-top', 'cord', [-0.003, 0.16, -0.025], [0.003, 0.164, 0.028]),
    h.disc('toggle', 'fastener', 0.006, 0.104, 0.112, 0, 0.03),
    h.disc('antenna-port', 'fastener', 0.012, 0.16, 0.162, -0.02, 0),
  ] + [
    box('back-strap-%d' % i, 'strap', [x - 0.0125, 0.02, -0.029], [x + 0.0125, 0.15, -0.025])
    for i in [0, 1]
    for x in [[-0.02, 0.02][i]]
  ] + h.webbing('front-row', 'strap', -0.04, 0.04, [0.03], 0.025), {
    body: 'nylon-coyote',
    cord: 'plastic-matte-black',
    fastener: 'plastic-matte-black',
    strap: 'nylon-coyote',
  })
  + { voxelGrain: 0.002 },

  // A nylon sustainment pouch 180 mm wide, 230 mm tall and 100 mm deep with a drawcord collar under a buckled lid,
  // big enough for three ration packs, and two webbing straps on its back.
  h.compound('sustainment_pouch', 0.16, h.pouch(0.18, 0.23, 0.1, 0.07) + [
    box('collar', 'collar', [-0.088, 0.2, -0.048], [0.088, 0.228, 0.051]),
    box('lid-strap', 'flap', [-0.0125, 0.1, 0.05], [0.0125, 0.16, 0.054]),
    box('buckle', 'buckle', [-0.016, 0.11, 0.054], [0.016, 0.135, 0.06]),
  ] + h.webbing('front-row', 'strap', -0.09, 0.09, [0.02, 0.06], 0.05), {
    body: 'cloth-olive-drab',
    flap: 'cloth-olive-drab',
    collar: 'webbing-olive-dark',
    strap: 'webbing-olive-dark',
    buckle: 'plastic-matte-black',
  })
  + { voxelGrain: 0.004 },

  // A round nylon grenade pouch 70 mm across and 115 mm tall, shaped to one grenade, under a domed lid whose tab
  // snaps down the front, with one webbing strap on its back.
  h.compound('tactical_grenade_pouch', 0.05, [
    h.disc('body', 'body', 0.034, 0, 0.095),
    { id: 'lid', slot: 'flap', kind: 'turned', axis: 'y', profile: [[0, 0], [0, 0.036], [0.01, 0.036], [0.017, 0.026], [0.02, 0]], origin: [0, 0.092, 0] },
    box('lid-tab', 'flap', [-0.012, 0.06, 0.033], [0.012, 0.104, 0.037]),
    h.stud('stud', 'stud', 0, 0.072, 0.037, 0.006),
    box('back-strap', 'strap', [-0.0125, 0.01, -0.038], [0.0125, 0.09, -0.031]),
  ], { body: 'cloth-olive-drab', flap: 'cloth-olive-drab', strap: 'webbing-olive-dark', stud: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },

  // A nylon pistol holster 230 mm tall, its muzzle end down, 50 mm thick with the grip opening 120 mm deep at the
  // top, the sheath narrowing below the trigger guard, an open mouth with a retention hood arching over the grip
  // space and snapping at the front, a webbing back panel and a leg strap lying looped behind it.
  h.compound('tactical_holster', 0.25, [
    h.prism('barrel', 'body', 'x', [[0, -0.012], [0, 0.028], [0.11, 0.032], [0.11, -0.0165]], -0.015, 0.015),
    h.prism('sheath', 'body', 'x', [[0.11, -0.0165], [0.11, 0.032], [0.2, 0.035], [0.2, -0.02]], -0.02, 0.02),
    h.prism('guard', 'body', 'x', [[0.11, 0.032], [0.2, 0.035], [0.2, 0.065], [0.14, 0.065]], -0.02, 0.02),
    box('muzzle', 'trim', [-0.016, 0, -0.013], [0.016, 0.012, 0.029]),
    box('mouth', 'mouth', [-0.017, 0.2, -0.017], [0.017, 0.201, 0.062]),
    box('rim-back', 'trim', [-0.021, 0.19, -0.021], [0.021, 0.204, -0.017]),
    box('rim-front', 'trim', [-0.021, 0.19, 0.062], [0.021, 0.204, 0.066]),
    box('rim-left', 'trim', [-0.021, 0.19, -0.017], [-0.017, 0.204, 0.062]),
    box('rim-right', 'trim', [0.017, 0.19, -0.017], [0.021, 0.204, 0.062]),
    box('hood-back', 'retention', [-0.009, 0.2, -0.025], [0.009, 0.232, -0.021]),
    box('hood-top', 'retention', [-0.009, 0.228, -0.025], [0.009, 0.232, 0.07]),
    box('hood-front', 'retention', [-0.009, 0.16, 0.066], [0.009, 0.232, 0.07]),
    h.stud('release', 'buckle', 0, 0.175, 0.07, 0.006),
    box('spacer', 'strap', [-0.02, 0.03, -0.052], [0.02, 0.2, -0.015]),
    box('panel', 'strap', [-0.04, 0.01, -0.058], [0.04, 0.23, -0.052]),
  ] + h.webbing('panel-row', 'strap', -0.04, 0.04, [0.04, 0.09, 0.14], -0.061)
  + [
    box('leg-back', 'strap', [-0.08, 0, -0.17], [0.08, 0.003, -0.14]),
    box('leg-left', 'strap', [-0.08, 0, -0.17], [-0.05, 0.003, -0.058]),
    box('leg-right', 'strap', [0.05, 0, -0.17], [0.08, 0.003, -0.058]),
    box('leg-buckle', 'buckle', [0.045, 0.003, -0.165], [0.085, 0.012, -0.145]),
  ], {
    body: 'nylon-coyote',
    trim: 'webbing-olive-dark',
    retention: 'plastic-matte-black',
    mouth: 'void-black',
    strap: 'nylon-coyote',
    buckle: 'plastic-matte-black',
  })
  + { voxelGrain: 0.004 },

  // A nylon shotshell pouch 120 mm wide, 100 mm tall and 60 mm deep with a snapped flap, an elastic loop band across
  // its front for spare shells, and two webbing straps on its back.
  h.compound('tactical_shotshell_pouch', 0.08, h.pouch(0.12, 0.1, 0.06, 0.04) + [
    h.stud('stud', 'stud', 0, 0.08, 0.033, 0.006),
    box('elastic', 'elastic', [-0.06, 0.01, 0.03], [0.06, 0.045, 0.035]),
  ] + [
    box('stitch-%d' % i, 'strap', [-0.0475 + i * 0.019, 0.01, 0.035], [-0.0455 + i * 0.019, 0.045, 0.037])
    for i in std.range(0, 5)
  ], {
    body: 'cloth-charcoal',
    flap: 'cloth-black',
    strap: 'hook-loop-grey',
    elastic: 'webbing-black',
    stud: 'plastic-matte-black',
  })
  + { voxelGrain: 0.004 },

  // A light tactical vest folded in two on the floor, 420 mm by 340 mm and 60 mm deep, its front face up with three
  // rifle magazine pouches and two pistol magazine pouches, and a side buckle.
  h.compound('tacvest', 2.1, h.foldedGarment(0.42, 0.34, 0.06, 2) + std.flattenArrays([
    [
      box('mag-%d' % i, 'pouch', [x - 0.035, 0.06, -0.06], [x + 0.035, 0.1, 0.12]),
      box('mag-flap-%d' % i, 'flap', [x - 0.037, 0.1, 0.06], [x + 0.037, 0.103, 0.123]),
      box('mag-lip-%d' % i, 'flap', [x - 0.037, 0.06, 0.12], [x + 0.037, 0.103, 0.123]),
    ]
    for i in std.range(0, 2)
    for x in [-0.12 + i * 0.08]
  ]) + std.flattenArrays([
    [
      box('pistol-%d' % i, 'pouch', [x - 0.02, 0.06, -0.02], [x + 0.02, 0.09, 0.1]),
      box('pistol-flap-%d' % i, 'flap', [x - 0.022, 0.09, 0.05], [x + 0.022, 0.093, 0.103]),
    ]
    for i in [0, 1]
    for x in [[0.1, 0.155][i]]
  ]) + [
    box('shoulder', 'flap', [-0.16, 0.06, -0.17], [-0.12, 0.064, -0.07]),
    box('buckle', 'buckle', [0.21, 0.015, -0.03], [0.222, 0.045, 0.03]),
  ], { cloth: 'cloth-charcoal', pouch: 'cloth-black', flap: 'hook-loop-grey', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A low-profile nylon tool pouch 140 mm wide, 180 mm tall and 40 mm deep that zips open, with a row of elastic tool
  // loops across its front and two webbing straps on its back.
  h.compound('tool_pouch', 0.12, [
    box('body', 'body', [-0.07, 0, -0.02], [0.07, 0.18, 0.02]),
    box('zip', 'zip', [-0.068, 0.178, -0.003], [0.068, 0.183, 0.003]),
    box('zip-left', 'zip', [-0.073, 0.03, -0.003], [-0.068, 0.183, 0.003]),
    box('zip-right', 'zip', [0.068, 0.03, -0.003], [0.073, 0.183, 0.003]),
    box('pull', 'pull', [0.073, 0.15, -0.004], [0.08, 0.17, 0.004]),
    box('loops', 'strap', [-0.07, 0.09, 0.02], [0.07, 0.115, 0.024]),
  ] + [
    box('loop-stitch-%d' % i, 'stitch', [-0.051 + i * 0.034, 0.09, 0.024], [-0.049 + i * 0.034, 0.115, 0.026])
    for i in std.range(0, 3)
  ] + h.webbing('front-row', 'strap', -0.07, 0.07, [0.03], 0.02) + [
    box('back-strap-%d' % i, 'strap', [x - 0.0125, 0.02, -0.024], [x + 0.0125, 0.17, -0.02])
    for i in [0, 1]
    for x in [[-0.035, 0.035][i]]
  ], { body: 'nylon-coyote', zip: 'plastic-matte-black', pull: 'plastic-matte-black', strap: 'nylon-coyote', stitch: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A nylon magazine pouch 240 mm wide, 190 mm tall and 90 mm deep: three tall cells side by side, each taking two
  // rifle magazines one behind the other, each under its own flap with a pull tab, and webbing on its back.
  h.compound('triple_stacker_pouch', 0.25, std.flattenArrays([
    [
      box('cell-%d' % i, 'body', [x - 0.036, 0, -0.04], [x + 0.036, 0.19, 0.045]),
      box('flap-top-%d' % i, 'flap', [x - 0.037, 0.19, -0.04], [x + 0.037, 0.193, 0.048]),
      box('flap-front-%d' % i, 'flap', [x - 0.037, 0.14, 0.045], [x + 0.037, 0.193, 0.048]),
      box('tab-%d' % i, 'tab', [x - 0.01, 0.125, 0.045], [x + 0.01, 0.142, 0.05]),
    ]
    for i in std.range(0, 2)
    for x in [-0.08 + i * 0.08]
  ]) + [
    box('back-panel', 'body', [-0.12, 0, -0.045], [0.12, 0.19, -0.04]),
  ] + [
    box('front-row-%d' % i, 'strap', [x - 0.036, 0.02, 0.045], [x + 0.036, 0.045, 0.048])
    for i in std.range(0, 2)
    for x in [-0.08 + i * 0.08]
  ] + [
    box('back-strap-%d' % i, 'strap', [x - 0.0125, 0.02, -0.049], [x + 0.0125, 0.18, -0.045])
    for i in std.range(0, 2)
    for x in [-0.08 + i * 0.08]
  ], {
    body: 'cloth-olive-drab',
    flap: 'webbing-olive-dark',
    tab: 'plastic-matte-black',
    strap: 'webbing-olive-dark',
  })
  + { voxelGrain: 0.004 },

  // An oversized home-made ballistic vest lying flat, front up: two stiff panels 600 mm wide, 520 mm long and 50 mm
  // thick, the front's padded panel quilted in rows, with wide shoulder straps and side straps hanging loose.
  h.compound('xlkevlar', 4, [
    box('back', 'cloth', [-0.3, 0, -0.26], [0.3, 0.025, 0.26]),
    box('front', 'cloth', [-0.29, 0.025, -0.24], [0.29, 0.05, 0.26]),
    box('panel', 'panel', [-0.24, 0.05, -0.18], [0.24, 0.056, 0.22]),
    box('collar', 'cloth', [-0.12, 0.025, -0.26], [0.12, 0.05, -0.2]),
  ] + [
    box('quilt-%d' % i, 'strap', [-0.24, 0.056, -0.12 + i * 0.08], [0.24, 0.059, -0.11 + i * 0.08])
    for i in std.range(0, 3)
  ] + [
    box('shoulder-%d' % i, 'strap', [x - 0.03, 0.05, -0.26], [x + 0.03, 0.055, -0.17])
    for i in [0, 1]
    for x in [[-0.17, 0.17][i]]
  ] + [
    box('side-%d' % i, 'strap', [x0, 0.0, -0.06], [x0 + 0.1, 0.004, 0.0])
    for i in [0, 1]
    for x0 in [[-0.4, 0.3][i]]
  ] + [
    box('side-tab-%d' % i, 'buckle', [x0, 0.004, -0.06], [x0 + 0.04, 0.008, 0.0])
    for i in [0, 1]
    for x0 in [[-0.4, 0.36][i]]
  ], { cloth: 'cloth-charcoal', panel: 'cloth-black', strap: 'hook-loop-grey', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },
]
