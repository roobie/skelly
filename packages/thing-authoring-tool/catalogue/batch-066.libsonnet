local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A solid of revolution along x from a list of [x, radius] stations, closed on its axis at both ends.
local alongX(id, slot, stations, y=0, z=0) = turned(id, slot, 'x', [[stations[0][0], 0]] + stations + [[stations[std.length(stations) - 1][0], 0]], [0, y, z]);
// A flat arc in the x-y plane, `t` thick on z about `z`, from angle a0 to a1 (degrees, 0 on +x, 90 on +y) between
// radii r0 and r1 round (cx, cy), as convex quads: bucket handles and bails.
local arc(prefix, slot, cx, cy, r0, r1, a0, a1, steps, t, z=0) = [
  local a = std.pi * (a0 + (a1 - a0) * i / steps) / 180;
  local b = std.pi * (a0 + (a1 - a0) * (i + 1) / steps) / 180;
  h.prism('%s-%d' % [prefix, i], slot, 'z', [
    [cx + r0 * std.cos(a), cy + r0 * std.sin(a)],
    [cx + r1 * std.cos(a), cy + r1 * std.sin(a)],
    [cx + r1 * std.cos(b), cy + r1 * std.sin(b)],
    [cx + r0 * std.cos(b), cy + r0 * std.sin(b)],
  ], z - t / 2, z + t / 2)
  for i in std.range(0, steps - 1)
];
// A solid of revolution standing on y from a list of [y, radius] stations, closed on its axis at both ends.
local standing(id, slot, stations, x=0, z=0) = turned(id, slot, 'y', [[stations[0][0], 0]] + stations + [[stations[std.length(stations) - 1][0], 0]], [x, 0, z]);
[
  // A jumbo permanent marker, 14 cm long and 22 mm across: a grey barrel with a paper label, a black cap with a
  // pocket clip over the chisel tip at +x, and a black end plug.
  h.compound('permanent_marker', 0.024, [
    alongX('plug', 'cap', [[-0.07, 0.009], [-0.066, 0.0105]]),
    alongX('barrel', 'body', [[-0.066, 0.011], [0.03, 0.011], [0.034, 0.0105]]),
    alongX('label', 'label', [[-0.05, 0.0114], [0.016, 0.0114]]),
    alongX('cap', 'cap', [[0.03, 0.0118], [0.062, 0.0118], [0.07, 0.009]]),
    alongX('cap-ring', 'cap', [[0.034, 0.0124], [0.038, 0.0124]]),
    box('clip', 'cap', [0.036, 0.011, -0.003], [0.064, 0.016, 0.003]),
    box('clip-tip', 'cap', [0.012, 0.014, -0.003], [0.036, 0.016, 0.003]),
  ], { body: 'plastic-grey', label: 'paper-white', cap: 'plastic-black' }) + {
    handling: h.gripOn('permanent_marker', 'barrel'),
    voxelGrain: 0.002,
  },

  // A gold pocket watch lying face up, 50 mm across the case and 12 mm thick, with a white dial, black hour marks
  // and hands, and the winding crown and bow at 12 o'clock on +z.
  h.compound('pocketwatch', 0.073, [
    turned('case', 'case', 'y', [[0, 0], [0, 0.022], [0.003, 0.025], [0.009, 0.025], [0.011, 0.023], [0.011, 0]]),
    turned('bezel', 'case', 'y', [[0.011, 0.019], [0.011, 0.023], [0.013, 0.022], [0.013, 0.019], [0.011, 0.019]]),
    disc('dial', 'dial', 0.0195, 0.01, 0.012),
    disc('hub', 'hand', 0.0015, 0.012, 0.014),
    box('hand-hour', 'hand', [-0.001, 0.012, -0.001], [0.01, 0.014, 0.001]),
    box('hand-minute', 'hand', [-0.001, 0.012, 0], [0.001, 0.014, 0.016]),
    turned('stem', 'case', 'z', [[0, 0], [0, 0.003], [0.004, 0.003], [0.004, 0]], [0, 0.0055, 0.0245]),
    turned('crown', 'case', 'z', [[0, 0], [0, 0.004], [0.005, 0.004], [0.005, 0]], [0, 0.0055, 0.0285]),
  ] + [
    local a = std.pi * i / 6;
    box('mark-%d' % i, 'hand', [0.0165 * std.sin(a) - 0.001, 0.012, 0.0165 * std.cos(a) - 0.001], [0.0165 * std.sin(a) + 0.001, 0.0135, 0.0165 * std.cos(a) + 0.001])
    for i in std.range(0, 11)
  ] + h.crescent('bow', 'case', 0.006, 0.008, 0, 360, 12, 0.004, 0.007, 0, 0.0405), {
    case: 'metal-gold', dial: 'enamel-white', hand: 'plastic-matte-black',
  }) + h.inHand('pocketwatch', 'case') + { voxelGrain: 0.002 },

  // A glazed porcelain urn 30 cm tall and 20 cm across the belly: a turned foot, a round body with a gold band, a
  // narrow neck and a domed lid with a knob.
  h.compound('porcelain_urn', 1.3, [
    standing('body', 'porcelain', [[0, 0.06], [0.012, 0.06], [0.02, 0.045], [0.06, 0.08], [0.12, 0.1], [0.17, 0.095], [0.22, 0.07], [0.245, 0.05], [0.26, 0.052]]),
    turned('band', 'gold', 'y', [[0.115, 0.098], [0.115, 0.1015], [0.135, 0.1015], [0.135, 0.098], [0.115, 0.098]]),
    turned('foot-ring', 'gold', 'y', [[0.012, 0.058], [0.012, 0.0615], [0.016, 0.0615], [0.016, 0.058], [0.012, 0.058]]),
    standing('lid', 'porcelain', [[0.26, 0.056], [0.268, 0.056], [0.28, 0.045], [0.29, 0.02]]),
    standing('knob', 'gold', [[0.288, 0.008], [0.294, 0.012], [0.302, 0.01], [0.306, 0.004]]),
  ], { porcelain: 'ceramic-white', gold: 'metal-gold' }) + h.inHand('porcelain_urn', 'body') + { voxelGrain: 0.004 },

  // A riding crop 60 cm long: a black fibreglass shaft tapering from 12 to 5 mm, a leather-bound grip with a
  // knob and a flat leather popper at the tip on +x.
  h.compound('riding_crop', 0.041, [
    alongX('knob', 'grip', [[-0.3, 0.006], [-0.296, 0.011], [-0.288, 0.011], [-0.284, 0.008]]),
    alongX('grip', 'grip', [[-0.284, 0.009], [-0.17, 0.008], [-0.164, 0.0075]]),
    alongX('shaft', 'shaft', [[-0.166, 0.006], [0.25, 0.003], [0.262, 0.0025]]),
    alongX('keeper', 'grip', [[0.25, 0.0042], [0.262, 0.0042]]),
    box('popper', 'popper', [0.256, -0.015, -0.002], [0.3, 0.015, 0.002]),
  ], { grip: 'leather-black', shaft: 'plastic-black', popper: 'leather-brown' }) + {
    handling: h.gripOn('riding_crop', 'grip'),
    voxelGrain: 0.002,
  },

  // A closed-cell foam sleeping mat rolled into a cylinder 55 cm long and 16 cm across, the spiral of its layers
  // showing on each end and two webbing straps round it.
  h.compound('rollmat', 0.4, [
    h.rod('roll', 'foam', 0.08, -0.275, 0.275, 0.08),
  ] + [
    h.tube('end-%d-%s' % [i, side], 'seam', r - 0.002, r, x, x + 0.002, 0.08, 0)
    for i in std.range(0, 4)
    for r in [0.018 + i * 0.014]
    for side in ['a', 'b']
    for x in [if side == 'a' then -0.277 else 0.275]
  ] + [
    h.tube('strap-%d' % i, 'strap', 0.08, 0.083, x - 0.0125, x + 0.0125, 0.08, 0)
    for i in [0, 1]
    for x in [[-0.16, 0.16][i]]
  ] + [
    box('buckle-%d' % i, 'buckle', [x - 0.016, 0.155, -0.012], [x + 0.016, 0.166, 0.012])
    for i in [0, 1]
    for x in [[-0.16, 0.16][i]]
  ], { foam: 'foam-eva', seam: 'plastic-charcoal', strap: 'webbing-black', buckle: 'plastic-matte-black' }) + { voxelGrain: 0.004 },
  // A steel combination lockbox 24 cm wide, 12 cm tall and 14 cm deep: a lid hinged at the back, a number dial
  // and a turn handle on the front at +z, and rubber feet.
  h.compound('safe_box', 2.7, [
    box('body', 'steel', [-0.12, 0.004, -0.07], [0.12, 0.09, 0.07]),
    box('lid', 'steel', [-0.122, 0.092, -0.072], [0.122, 0.124, 0.072]),
    box('seam', 'seam', [-0.12, 0.09, -0.07], [0.12, 0.092, 0.07]),
    h.rod('hinge', 'metal', 0.004, -0.09, 0.09, 0.092) + { origin: [-0.09, 0.092, -0.073] },
    turned('dial-plate', 'metal', 'z', [[0, 0], [0, 0.026], [0.002, 0.026], [0.002, 0]], [-0.04, 0.06, 0.072]),
    turned('dial', 'dial', 'z', [[0, 0], [0, 0.019], [0.006, 0.018], [0.008, 0.012], [0.008, 0]], [-0.04, 0.06, 0.074]),
    box('dial-mark', 'mark', [-0.041, 0.081, 0.072], [-0.039, 0.086, 0.075]),
    turned('handle-boss', 'metal', 'z', [[0, 0], [0, 0.01], [0.008, 0.01], [0.008, 0]], [0.05, 0.06, 0.072]),
    box('handle', 'metal', [0.03, 0.056, 0.078], [0.07, 0.064, 0.086]),
    box('lid-lip', 'steel', [-0.03, 0.098, 0.072], [0.03, 0.112, 0.078]),
  ] + [
    box('foot-%d' % i, 'foot', [x - 0.012, 0, z - 0.012], [x + 0.012, 0.004, z + 0.012])
    for i in std.range(0, 3)
    for x in [[-0.1, 0.1, -0.1, 0.1][i]]
    for z in [[-0.05, -0.05, 0.05, 0.05][i]]
  ] + [
    box('tick-%d' % i, 'mark', [-0.04 + 0.016 * std.sin(a) - 0.001, 0.06 + 0.016 * std.cos(a) - 0.001, 0.08], [-0.04 + 0.016 * std.sin(a) + 0.001, 0.06 + 0.016 * std.cos(a) + 0.001, 0.0825])
    for i in std.range(0, 7)
    for a in [std.pi * i / 4]
  ], { steel: 'paint-charcoal', seam: 'plastic-matte-black', metal: 'steel-stainless', dial: 'plastic-black', mark: 'paint-white', foot: 'rubber-black' }) + { voxelGrain: 0.004 },

  // A child's beach bucket 16 cm across the rim and 13 cm tall with a thin plastic carry handle, a toy spade and a
  // toy rake standing in it, their heads above the rim.
  h.compound('sandbox_kit', 0.2, [
    turned('bucket', 'bucket', 'y', [[0, 0], [0, 0.065], [0.13, 0.08], [0.13, 0.074], [0.004, 0.061], [0.004, 0]]),
    turned('rim', 'bucket', 'y', [[0.122, 0.079], [0.122, 0.084], [0.132, 0.084], [0.132, 0.079], [0.122, 0.079]]),
    turned('stripe', 'stripe', 'y', [[0.05, 0.0705], [0.05, 0.0735], [0.065, 0.0755], [0.065, 0.0725], [0.05, 0.0705]]),
    box('lug-l', 'bucket', [-0.088, 0.11, -0.005], [-0.08, 0.124, 0.005]),
    box('lug-r', 'bucket', [0.08, 0.11, -0.005], [0.088, 0.124, 0.005]),
    // The spade: a shaft from the floor of the bucket and a blade standing above the rim.
    box('spade-shaft', 'spade', [-0.035, 0.004, -0.024], [-0.025, 0.17, -0.014]),
    box('spade-grip', 'spade', [-0.05, 0.004, -0.024], [-0.01, 0.014, -0.014]),
    h.prism('spade-blade', 'spade', 'z', [[-0.055, 0.165], [-0.005, 0.165], [-0.005, 0.215], [-0.03, 0.235], [-0.055, 0.215]], -0.022, -0.016),
    // The rake: a shaft and a bar with tines pointing up.
    box('rake-shaft', 'rake', [0.025, 0.004, 0.014], [0.035, 0.18, 0.024]),
    box('rake-bar', 'rake', [0.0, 0.176, 0.014], [0.06, 0.188, 0.024]),
  ] + [
    box('tine-%d' % i, 'rake', [0.002 + i * 0.0115, 0.188, 0.016], [0.0065 + i * 0.0115, 0.208, 0.022])
    for i in std.range(0, 4)
  ] + arc('handle', 'handle', 0, 0.117, 0.081, 0.085, 0, 180, 16, 0.004), { bucket: 'plastic-red', stripe: 'plastic-white', spade: 'plastic-yellow', rake: 'plastic-blue', handle: 'plastic-white' }) + h.inHand('sandbox_kit', 'bucket') + { voxelGrain: 0.002 },

  // A letter-size printout folded in three, 21.6 by 9.3 cm, with a row of printed digits and lines of text on the
  // top panel and the folded edge showing at +z.
  h.compound('sarcophagus_access_code', 0.005, [
    box('sheet', 'paper', [-0.108, 0, -0.0465], [0.108, 0.002, 0.0465]),
    box('flap', 'paper', [-0.107, 0.002, -0.046], [0.107, 0.004, 0.0455]),
    box('fold', 'paper', [-0.108, 0, 0.0455], [0.108, 0.004, 0.0475]),
    box('header', 'print', [-0.09, 0.004, -0.036], [0.02, 0.005, -0.03]),
  ] + [
    box('digit-%d' % i, 'print', [-0.09 + i * 0.016, 0.004, -0.018], [-0.08 + i * 0.016, 0.005, -0.002])
    for i in std.range(0, 9)
  ] + [
    box('line-%d' % i, 'print', [-0.09, 0.004, 0.01 + i * 0.008], [0.09 - (i % 2) * 0.04, 0.005, 0.013 + i * 0.008])
    for i in std.range(0, 3)
  ], { paper: 'paper-white', print: 'plastic-matte-black' }) + { voxelGrain: 0.002 },

  // A portable electric heater 20 cm wide, 25 cm tall and 11 cm deep: a steel case on two feet, a chrome grille
  // over the heating bars on the front at +z, two knobs on top and a carry slot in the top.
  h.compound('small_space_heater', 2, [
    box('case', 'case', [-0.1, 0.012, -0.055], [0.1, 0.25, 0.055]),
    box('recess', 'recess', [-0.08, 0.04, 0.05], [0.08, 0.2, 0.0555]),
    box('foot-l', 'foot', [-0.1, 0, -0.06], [-0.07, 0.012, 0.06]),
    box('foot-r', 'foot', [0.07, 0, -0.06], [0.1, 0.012, 0.06]),
    box('handle-slot', 'recess', [-0.04, 0.25, -0.012], [0.04, 0.2505, 0.012]),
    box('handle-bar', 'trim', [-0.045, 0.25, -0.016], [0.045, 0.256, -0.012]),
    turned('knob-a', 'knob', 'y', [[0, 0], [0, 0.011], [0.012, 0.01], [0.014, 0]], [0.06, 0.25, 0.025]),
    turned('knob-b', 'knob', 'y', [[0, 0], [0, 0.011], [0.012, 0.01], [0.014, 0]], [0.06, 0.25, -0.02]),
    box('lamp', 'lamp', [-0.08, 0.215, 0.055], [-0.07, 0.225, 0.057]),
  ] + [
    h.rod('element-%d' % i, 'element', 0.005, -0.075, 0.075, 0.06 + i * 0.04) + { origin: [-0.075, 0.06 + i * 0.04, 0.051] }
    for i in std.range(0, 3)
  ] + [
    box('grille-%d' % i, 'trim', [-0.082, 0.042 + i * 0.016, 0.0575], [0.082, 0.045 + i * 0.016, 0.06])
    for i in std.range(0, 9)
  ] + [
    box('grille-post-%d' % i, 'trim', [x - 0.0015, 0.04, 0.0555], [x + 0.0015, 0.2, 0.0575])
    for i in std.range(0, 2)
    for x in [[-0.08, 0, 0.08][i]]
  ], { case: 'enamel-white', recess: 'paint-charcoal', foot: 'plastic-black', trim: 'steel-stainless', knob: 'plastic-black', element: 'steel-grey', lamp: 'plastic-red' }) + { voxelGrain: 0.004 },

  // An aerosol paint can 21 cm tall to the cap and 66 mm across: a painted steel body with a label band, a domed
  // top with a rolled rim and a cap the colour of the paint.
  h.compound('spray_can', 0.47, [
    standing('base', 'metal', [[0, 0.03], [0.006, 0.033]]),
    standing('body', 'body', [[0.006, 0.033], [0.155, 0.033]]),
    standing('label', 'label', [[0.04, 0.0335], [0.12, 0.0335]]),
    standing('dome', 'metal', [[0.155, 0.033], [0.162, 0.031], [0.172, 0.022], [0.176, 0.015]]),
    standing('collar', 'metal', [[0.172, 0.0215], [0.176, 0.0215]]),
    standing('cap', 'cap', [[0.17, 0.03], [0.205, 0.03], [0.21, 0.028]]),
  ], { metal: 'alu-bare', body: 'paint-red', label: 'paper-white', cap: 'plastic-red' }) + h.inHand('spray_can', 'body') + { voxelGrain: 0.002 },
  // A wooden stepladder standing open, 1.5 m tall: two front rails with five flat treads, two rear legs joined by
  // braces, a top cap and steel spreader bars, the treads facing +z.
  local rail(id, slot, x0, x1, zBottom, zTop, top, depth) = h.prism(id, slot, 'x', [
    [0, zBottom - depth / 2], [0, zBottom + depth / 2], [top, zTop + depth / 2], [top, zTop - depth / 2],
  ], x0, x1);
  local frontZ(y) = 0.36 - (0.36 - 0.06) * y / 1.42;
  local backZ(y) = -0.42 + (0.42 - 0.06) * y / 1.42;
  h.compound('stepladder', 10, [
    rail('front-l', 'wood', -0.24, -0.21, 0.36, 0.06, 1.42, 0.07),
    rail('front-r', 'wood', 0.21, 0.24, 0.36, 0.06, 1.42, 0.07),
    rail('back-l', 'wood', -0.23, -0.2, -0.42, -0.06, 1.42, 0.05),
    rail('back-r', 'wood', 0.2, 0.23, -0.42, -0.06, 1.42, 0.05),
    box('cap', 'cap', [-0.25, 1.42, -0.12], [0.25, 1.46, 0.12]),
    box('spreader-l', 'metal', [-0.25, 0.68, -0.18], [-0.244, 0.69, 0.2]),
    box('spreader-r', 'metal', [0.244, 0.68, -0.18], [0.25, 0.69, 0.2]),
  ] + [
    box('tread-%d' % i, 'wood', [-0.21, y - 0.02, frontZ(y) - 0.05], [0.21, y, frontZ(y) + 0.04])
    for i in std.range(0, 4)
    for y in [0.28 + i * 0.25]
  ] + [
    box('brace-%d' % i, 'wood', [-0.2, y - 0.03, backZ(y) - 0.012], [0.2, y, backZ(y) + 0.012])
    for i in std.range(0, 1)
    for y in [[0.25, 0.9][i]]
  ] + [
    box('shoe-%d' % i, 'foot', [x - 0.017, 0, z - 0.04], [x + 0.017, 0.015, z + 0.04])
    for i in std.range(0, 3)
    for x in [[-0.225, 0.225, -0.215, 0.215][i]]
    for z in [[0.36, 0.36, -0.42, -0.42][i]]
  ], { wood: 'wood-pine', cap: 'wood-oak', metal: 'steel-grey', foot: 'rubber-black' }) + { voxelGrain: 0.01 },

  // A stick of charcoal 10 cm long and 12 mm across, sharpened to a point at +x, its back half wrapped in a twist of
  // rag to keep the fingers clean.
  h.compound('survival_marker', 0.0052, [
    alongX('stick', 'charcoal', [[-0.05, 0.005], [-0.048, 0.006], [0.025, 0.006], [0.046, 0.0015], [0.05, 0.0008]]),
    alongX('wrap', 'rag', [[-0.046, 0.0075], [-0.002, 0.0075]]),
    alongX('tie', 'tie', [[-0.034, 0.0085], [-0.03, 0.0085]]),
    alongX('tie-b', 'tie', [[-0.012, 0.0085], [-0.008, 0.0085]]),
  ], { charcoal: 'coal-black', rag: 'cloth-rag', tie: 'cord-cotton' }) + {
    handling: h.gripOn('survival_marker', 'wrap'),
    voxelGrain: 0.002,
  },

  // A homemade draw-tube telescope pulled out to 38 cm: three nested plastic tubes bound with tape at each joint,
  // an eyepiece at -x and the objective lens at +x.
  h.compound('survivor_scope', 0.15, [
    alongX('eyepiece', 'cap', [[-0.19, 0.012], [-0.175, 0.013], [-0.165, 0.015]]),
    alongX('tube-inner', 'tube-a', [[-0.165, 0.015], [-0.05, 0.015]]),
    alongX('tape-inner', 'tape', [[-0.055, 0.0175], [-0.035, 0.0175]]),
    alongX('tube-mid', 'tube-b', [[-0.04, 0.018], [0.07, 0.018]]),
    alongX('tape-mid', 'tape', [[0.065, 0.0205], [0.085, 0.0205]]),
    alongX('tube-outer', 'tube-a', [[0.08, 0.021], [0.18, 0.021]]),
    alongX('tape-tip', 'tape', [[0.168, 0.0235], [0.186, 0.0235]]),
    alongX('lens', 'lens', [[0.186, 0.018], [0.19, 0.018]]),
    alongX('eye-lens', 'lens', [[-0.192, 0.008], [-0.19, 0.008]]),
  ], { 'tube-a': 'plastic-black', 'tube-b': 'plastic-grey', tape: 'tape-grey', cap: 'rubber-black', lens: 'glass-clear' }) + {
    handling: h.gripOn('survivor_scope', 'tube-outer'),
    voxelGrain: 0.002,
  },

  // A pocket tear gas canister 9 cm tall and 34 mm across: a black body with a label band, a red flip-top
  // actuator with its nozzle facing +z and a key ring at the back.
  h.compound('teargas_sprayer', 0.06, [
    standing('base', 'body', [[0, 0.015], [0.004, 0.017]]),
    standing('body', 'body', [[0.004, 0.017], [0.064, 0.017], [0.068, 0.014]]),
    standing('label', 'label', [[0.02, 0.0175], [0.052, 0.0175]]),
    standing('collar', 'actuator', [[0.066, 0.015], [0.074, 0.015]]),
    standing('actuator', 'actuator', [[0.074, 0.012], [0.086, 0.012], [0.09, 0.01]]),
    box('guard', 'actuator', [-0.008, 0.074, -0.016], [0.008, 0.09, -0.012]),
    turned('nozzle', 'nozzle', 'z', [[0, 0], [0, 0.003], [0.003, 0.003], [0.003, 0]], [0, 0.082, 0.0115]),
    box('thumb', 'nozzle', [-0.006, 0.09, -0.006], [0.006, 0.092, 0.006]),
  ] + h.crescent('ring', 'ring', 0.007, 0.009, 0, 360, 12, 0.076, 0.078, 0, -0.026), { body: 'plastic-black', label: 'paint-police-blue', actuator: 'plastic-red', nozzle: 'plastic-black', ring: 'steel-stainless' }) + h.inHand('teargas_sprayer', 'body') + { voxelGrain: 0.002 },

  // A small whistle 6 cm long cast from a dark, faintly blue alloy in sharp, uneven angles: a skewed mouthpiece
  // at -x, a body made of a twisted wedge and a crooked fin, a black window through the body and a loop at +x.
  h.compound('tindalos_whistle', 0.04, [
    h.prism('mouth', 'metal', 'x', [[0.002, -0.004], [0.008, -0.006], [0.011, 0.003], [0.004, 0.005]], -0.03, -0.012),
    h.prism('body', 'metal', 'x', [[0, -0.009], [0.012, -0.012], [0.019, 0.004], [0.007, 0.011], [-0.002, 0.004]], -0.012, 0.02),
    h.prism('tip', 'metal', 'x', [[0.003, -0.006], [0.013, -0.008], [0.009, 0.005]], 0.02, 0.03),
    h.prism('fin', 'metal', 'z', [[-0.006, 0.012], [0.014, 0.016], [0.026, 0.028], [0.006, 0.022]], -0.002, 0.002),
    h.prism('window', 'window', 'x', [[0.008, 0.003], [0.014, 0.004], [0.01, 0.009]], -0.006, 0.006),
  ] + h.crescent('loop', 'metal', 0.003, 0.0045, 0, 360, 8, 0.004, 0.007, 0.034, 0), { metal: 'steel-blued', window: 'void-black' }) + h.inHand('tindalos_whistle', 'body') + { voxelGrain: 0.002 },
]
