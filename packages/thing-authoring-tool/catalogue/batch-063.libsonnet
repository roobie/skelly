local h = import '../compound.libsonnet';
local box = h.box;
// A London-pattern anvil, horn on -x and heel on +x, scaled by `s` from a design 540 mm long and 250 mm high: a
// splayed foot, a narrower waist, the body with a hardened face plate, a lower step before the horn, and the hardy
// (square) and pritchel (round) holes painted dark on the face near the heel. Slots: body, face, hole.
local anvil(s) = h.scaled([
  box('foot', 'body', [-0.15, 0, -0.09], [0.15, 0.04, 0.09]),
  h.prism('foot-taper', 'body', 'z', [[-0.15, 0.04], [0.15, 0.04], [0.11, 0.08], [-0.11, 0.08]], -0.075, 0.075),
  box('waist', 'body', [-0.11, 0.08, -0.05], [0.11, 0.15, 0.05]),
  h.prism('waist-flare', 'body', 'z', [[-0.11, 0.14], [0.11, 0.14], [0.2, 0.19], [-0.15, 0.19]], -0.055, 0.055),
  box('body', 'body', [-0.15, 0.19, -0.055], [0.2, 0.24, 0.055]),
  h.prism('heel', 'body', 'z', [[0.2, 0.2], [0.27, 0.225], [0.27, 0.24], [0.2, 0.24]], -0.05, 0.05),
  box('face', 'face', [-0.15, 0.24, -0.055], [0.27, 0.25, 0.055]),
  box('step', 'body', [-0.2, 0.19, -0.04], [-0.15, 0.235, 0.04]),
  h.turned('horn', 'body', 'x', [[0, 0], [0, 0.006], [0.03, 0.017], [0.1, 0.031], [0.19, 0.038], [0.19, 0]], [-0.37, 0.21, 0]),
  box('hardy', 'hole', [0.2, 0.2495, -0.012], [0.224, 0.2505, 0.012]),
  h.disc('pritchel', 'hole', 0.007, 0.2495, 0.2505, 0.165, 0),
], s);
local anvilFinish = { body: 'iron-dull', face: 'steel-bright', hole: 'coal-black' };
[
  // A 26 kg anvil: 520 mm long horn to heel, 200 mm high, a 90 mm wide face.
  h.compound('anvil', 37, anvil(0.8), anvilFinish),
  // A small 15 kg anvil: 300 mm long and 120 mm high.
  h.compound('anvil_crude', 7.5, anvil(0.47), anvilFinish) + { voxelGrain: 0.004 },
  // A 225 kg smithy anvil: 960 mm long and 375 mm high, a 165 mm face.
  h.compound('anvil_heavy', 240, anvil(1.5), anvilFinish),
  // A 400 mm offcut of a machine bed, 150 mm high on a 200 mm flange: torch-cut ends, a ground top face rounded off at
  // one end, two bolt bosses, and patches of the machine's old paint and rust.
  h.compound('anvil_scavenged', 66, [
    box('flange', 'body', [-0.2, 0, -0.1], [0.2, 0.03, 0.1]),
    box('block', 'body', [-0.2, 0.03, -0.06], [0.14, 0.15, 0.06]),
    h.turned('round', 'body', 'z', [[0, 0], [0, 0.06], [0.12, 0.06], [0.12, 0]], [0.14, 0.09, -0.06]),
    box('round-fill', 'body', [0.14, 0.03, -0.06], [0.2, 0.09, 0.06]),
    box('face', 'face', [-0.2, 0.15, -0.06], [0.14, 0.152, 0.06]),
    h.turned('face-round', 'face', 'z', [[0, 0], [0, 0.0615], [0.12, 0.0615], [0.12, 0]], [0.14, 0.09, -0.06]) + { profile: [[0, 0.059], [0, 0.0615], [0.12, 0.0615], [0.12, 0.059], [0, 0.059]] },
    h.disc('boss-a', 'bolt', 0.016, 0.03, 0.05, -0.16, 0.08),
    h.disc('boss-b', 'bolt', 0.016, 0.03, 0.05, 0.16, -0.08),
    h.disc('boss-c', 'bolt', 0.016, 0.03, 0.05, -0.16, -0.08),
    box('paint-a', 'paint', [-0.17, 0.05, 0.0595], [-0.05, 0.13, 0.061]),
    box('paint-b', 'paint', [-0.12, 0.031, -0.1], [0.05, 0.0315, -0.065]),
    box('rust-a', 'rust', [0.0, 0.04, 0.0595], [0.1, 0.1, 0.061]),
    box('cut-a', 'cut', [-0.2005, 0.03, -0.06], [-0.2, 0.15, 0.06]),
  ], { body: 'steel-parkerized', face: 'steel-bright', bolt: 'iron-dull', paint: 'paint-olive', rust: 'rust-red', cut: 'steel-heat-tint' }),
  // A hardwood stump 300 mm high and 260 mm across, three steel plates and a square bar bolted across its sawn top.
  local r = 0.13, ht = 0.3;
  h.compound('anvil_stump', 15, [
    h.turned('stump', 'bark', 'y', [[0, 0], [0, r + 0.008], [0.04, r], [ht, r * 0.96], [ht, 0]]),
    h.disc('top', 'end', r * 0.96 - 0.008, ht, ht + 0.002),
    h.tube('ring', 'grain', 0.05, 0.054, 0, 0.002, 0, 0) + { axis: 'y', origin: [0, ht + 0.0005, 0] },
    box('plate-a', 'plate', [-0.11, ht + 0.002, -0.08], [0.11, ht + 0.014, -0.03]),
    box('plate-b', 'plate', [-0.11, ht + 0.002, 0.03], [0.11, ht + 0.014, 0.08]),
    box('bar', 'bar', [-0.1, ht + 0.002, -0.025], [0.1, ht + 0.03, 0.025]),
  ] + [
    h.disc('bolt-%d' % i, 'bolt', 0.008, ht + 0.014, ht + 0.02, [-0.09, 0.09][i % 2], [-0.055, 0.055][std.floor(i / 2)])
    for i in std.range(0, 3)
  ], { bark: 'bark', end: 'wood-pine', grain: 'wood-oak', plate: 'steel-grey', bar: 'steel-bright', bolt: 'iron-dull' }),
  // Bolt cutters 460 mm long: tubular arms with red grips, splaying to 70 mm apart, the compound head plates and pivot
  // bolts, and short stubby jaws closed at +x.
  local arm(id, slot, sgn, x0, x1, z0, z1, w0, w1) = h.prism(id, slot, 'y', [[sgn * z0, x0], [sgn * (z0 + w0), x0], [sgn * (z1 + w1), x1], [sgn * z1, x1]], -0.008, 0.008);
  h.compound('boltcutters', 1.1, [
    arm('arm-a', 'arm', 1, 0.17, 0.33, 0.026, 0.006, 0.008, 0.008),
    arm('arm-b', 'arm', -1, 0.17, 0.33, 0.026, 0.006, 0.008, 0.008),
    arm('grip-a', 'grip', 1, 0, 0.19, 0.03, 0.024, 0.013, 0.012) + { start: -0.011, end: 0.011 },
    arm('grip-b', 'grip', -1, 0, 0.19, 0.03, 0.024, 0.013, 0.012) + { start: -0.011, end: 0.011 },
    box('plate', 'head', [0.31, -0.011, -0.022], [0.4, 0.011, 0.022]),
    h.prism('jaws', 'jaw', 'y', [[-0.018, 0.4], [0.018, 0.4], [0.003, 0.46], [-0.003, 0.46]], -0.008, 0.008),
    box('bite', 'gap', [0.4, -0.0085, -0.0006], [0.46, 0.0085, 0.0006]),
  ] + [
    h.disc('pivot-%d' % i, 'bolt', 0.006, -0.013, 0.013, [0.325, 0.325, 0.385][i], [-0.012, 0.012, 0][i])
    for i in [0, 1, 2]
  ], { arm: 'steel-grey', grip: 'plastic-red', head: 'steel-blued', jaw: 'steel-hardened', gap: 'coal-black', bolt: 'steel-bright' }) + { handling: h.gripOn('boltcutters', 'grip-a') },
  // A two-part sand mould in a wooden flask 400 by 260 mm and 200 mm high: a lower drag and an upper cope, packed
  // sand showing on top with a pouring cup and a riser, alignment lugs with steel pins at the ends.
  local L = 0.2, W = 0.13, t = 0.02;
  h.compound('casting_mold', 28, std.flattenArrays([
    [
      box('%s-front' % n, 'flask', [-L, y0, W - t], [L, y1, W]),
      box('%s-back' % n, 'flask', [-L, y0, -W], [L, y1, -W + t]),
      box('%s-left' % n, 'flask', [-L, y0, -W + t], [-L + t, y1, W - t]),
      box('%s-right' % n, 'flask', [L - t, y0, -W + t], [L, y1, W - t]),
      box('%s-lug-a' % n, 'flask', [-L - 0.03, y0 + 0.02, -0.025], [-L, y1 - 0.02, 0.025]),
      box('%s-lug-b' % n, 'flask', [L, y0 + 0.02, -0.025], [L + 0.03, y1 - 0.02, 0.025]),
    ]
    for p in [['drag', 0, 0.098], ['cope', 0.102, 0.2]]
    for n in [p[0]]
    for y0 in [p[1]]
    for y1 in [p[2]]
  ]) + [
    box('sand', 'sand', [-L + t, 0, -W + t], [L - t, 0.195, W - t]),
    box('parting', 'gap', [-L + 0.001, 0.098, -W + 0.001], [L - 0.001, 0.102, W - 0.001]),
    h.disc('cup', 'gap', 0.025, 0.1945, 0.1955, -0.1, 0.03),
    h.disc('cup-rim', 'sand', 0.035, 0.195, 0.205, -0.1, 0.03) + { profile: [[0, 0.025], [0, 0.035], [0.01, 0.035], [0.01, 0.025], [0, 0.025]] },
    h.disc('riser', 'gap', 0.018, 0.1945, 0.1955, 0.1, -0.03),
    h.disc('pin-a', 'pin', 0.006, 0.12, 0.215, -L - 0.015, 0),
    h.disc('pin-b', 'pin', 0.006, 0.12, 0.215, L + 0.015, 0),
  ], { flask: 'wood-oak', sand: 'brick-buff', gap: 'coal-black', pin: 'steel-grey' }),
  // A tabletop charcoal forge 480 mm long: a steel pan 380 by 280 mm on four short legs, a round firepot holding
  // charcoal, and an air pipe to a hand-cranked blower at the +x end.
  local yp = 0.08;
  h.compound('char_forge', 6, [
    box('pan-floor', 'pan', [-0.19, yp, -0.14], [0.19, yp + 0.005, 0.14]),
    box('pan-front', 'pan', [-0.19, yp, 0.135], [0.19, yp + 0.07, 0.14]),
    box('pan-back', 'pan', [-0.19, yp, -0.14], [0.19, yp + 0.12, -0.135]),
    box('pan-left', 'pan', [-0.19, yp, -0.14], [-0.185, yp + 0.07, 0.14]),
    box('pan-right', 'pan', [0.185, yp, -0.14], [0.19, yp + 0.07, 0.14]),
    h.turned('firepot', 'pan', 'y', [[0, 0], [0, 0.05], [0.05, 0.09], [0.05, 0]], [0, yp - 0.045, 0]),
    h.turned('charcoal', 'coal', 'y', [[0, 0], [0, 0.09], [0.012, 0.075], [0.025, 0.04], [0.03, 0]], [0, yp + 0.005, 0]),
    h.disc('ember', 'ember', 0.03, yp + 0.03, yp + 0.036, 0.01, 0.0),
    h.rod('pipe', 'pipe', 0.016, 0.0, 0.25, yp - 0.03),
    h.turned('blower', 'blower', 'z', [[0, 0], [0, 0.07], [0.06, 0.07], [0.06, 0]], [0.3, yp + 0.02, -0.03]),
    box('crank', 'pipe', [0.295, yp + 0.015, 0.03], [0.305, yp + 0.09, 0.04]),
    h.turned('crank-handle', 'grip', 'z', [[0, 0], [0, 0.008], [0.05, 0.008], [0.05, 0]], [0.3, yp + 0.09, 0.04]),
  ] + [
    box('leg-%d' % i, 'pan', [x - 0.01, 0, z - 0.01], [x + 0.01, yp, z + 0.01])
    for i in std.range(0, 3)
    for x in [[-0.17, 0.17][i % 2]]
    for z in [[-0.12, 0.12][std.floor(i / 2)]]
  ], { pan: 'paint-charcoal', coal: 'coal-black', ember: 'glow-flame', pipe: 'steel-grey', blower: 'paint-oxblood', grip: 'wood-oak' }),
  // A drum kiln 580 mm across and 850 mm high: an open-head drum with its lid clamped on, a short chimney on the lid
  // and four air holes round the foot.
  local r = 0.29, ht = 0.85;
  h.compound('char_kiln', 40, h.drum(r, ht, 2, false) + [
    h.disc('lid', 'body', r + 0.006, ht, ht + 0.012),
    h.tube('chimney', 'chimney', 0.045, 0.05, 0, 0.18) + { axis: 'y', origin: [0.08, ht + 0.012, 0] },
    h.disc('flue', 'hole', 0.045, ht + 0.19, ht + 0.192, 0.08, 0),
  ] + [
    h.turned('vent-%d' % i, 'hole', v[0], [[0, 0], [0, 0.025], [0.004, 0.025], [0.004, 0]], v[1])
    for i in std.range(0, 3)
    for v in [[['z', [0, 0.08, r - 0.002]], ['x', [r - 0.002, 0.08, 0]], ['z', [0, 0.08, -r - 0.002]], ['x', [-r - 0.002, 0.08, 0]]][i]]
  ], { body: 'iron-dull', chime: 'iron-dull', clamp: 'steel-grey', chimney: 'steel-galvanised', hole: 'coal-black' }),
  // A cold chisel 200 mm long from 19 mm bar: a mushroomed striking head, the shank, and a ground wedge edge at +x.
  h.compound('chisel', 0.37, [
    h.turned('head', 'head', 'x', [[0, 0], [0, 0.009], [0.004, 0.0105], [0.012, 0.0095], [0.012, 0]], [0, 0.0105, 0]),
    h.turned('shank', 'shank', 'x', [[0, 0], [0, 0.0095], [0.15, 0.0095], [0.15, 0]], [0.012, 0.0105, 0]),
    h.prism('wedge', 'shank', 'z', [[0.162, 0.001], [0.19, 0.0085], [0.19, 0.0125], [0.162, 0.02]], -0.0085, 0.0085),
    h.prism('edge', 'edge', 'z', [[0.19, 0.0085], [0.2, 0.01], [0.2, 0.011], [0.19, 0.0125]], -0.0085, 0.0085),
  ], { head: 'steel-heat-tint', shank: 'steel-grey', edge: 'steel-bright' }) + { voxelGrain: 0.002, handling: h.gripOn('chisel', 'shank') },
  // A crucible like a stout tumbler, 165 mm high and 135 mm across the rim, thick-walled, with a pouring lip and a
  // little dross on the floor.
  h.compound('crucible', 1, [
    h.turned('pot', 'pot', 'y', [[0, 0], [0, 0.058], [0.15, 0.067], [0.165, 0.067], [0.165, 0.055], [0.025, 0.046], [0.025, 0]]),
    h.disc('dross', 'dross', 0.044, 0.025, 0.028),
    h.prism('lip', 'pot', 'y', [[0.06, -0.012], [0.06, 0.012], [0.078, 0.006], [0.078, -0.006]], 0.155, 0.167),
  ], { pot: 'ceramic-grey', dross: 'coal-black' }) + { voxelGrain: 0.004 },
  // A crude cast bronze nail 40 mm long: a lumpy round head and a square shank tapering to a blunt point.
  h.compound('crude_bronze_nail', 0.006, [
    h.turned('head', 'nail', 'x', [[0, 0], [0, 0.0045], [0.0025, 0.004], [0.0025, 0]], [0, 0.003, 0]),
    h.prism('shank', 'nail', 'z', [[0.0025, 0.0005], [0.04, 0.0024], [0.04, 0.0036], [0.0025, 0.0055]], -0.0025, 0.0025),
  ], { nail: 'bronze-polished' }) + { voxelGrain: 0.002 },
  // A steel draw plate 160 by 40 by 8 mm, two rows of tapered holes stepping down in size along it.
  h.compound('draw_plate', 0.32, [
    box('plate', 'plate', [-0.08, 0, -0.02], [0.08, 0.008, 0.02]),
  ] + [
    h.disc('hole-%d-%d' % [row, i], 'hole', 0.0045 - 0.00018 * (i + 9 * row), 0.0075, 0.0085, -0.068 + i * 0.017, [-0.009, 0.009][row])
    for row in [0, 1]
    for i in std.range(0, 8)
  ], { plate: 'steel-grey', hole: 'coal-black' }) + { voxelGrain: 0.002 },
]
