local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
// A small thing held upright in the hand by its named solid, as the medicine bottles in food-medical.libsonnet are.
local inHand(id, solid) = { handling: { part: id, solid: solid, fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 } };
// A medicine bottle of the vessel family: a body, a shoulder up to a neck, a cap and a paper label band.
local bottle(id, massKg, radius, height, neckRadius, capRadius, capHeight, finish, dimensions={}, grain=0.002) = h.item(id, 'vessel', massKg, {
  radius: radius, height: height, shoulderHeight: 0.005, neckRadius: neckRadius, neckHeight: 0.005,
  capRadius: capRadius, capHeight: capHeight, rimHeight: 0.001, bandHeight: height * 0.6, bandInset: 0.0004,
} + dimensions, finish) + inHand(id, 'body') + { voxelGrain: grain };
// A cylinder standing on y from `y0` to `y1`.
local disc(id, slot, radius, y0, y1) = turned(id, slot, 'y', [[y0, 0], [y0, radius], [y1, radius], [y1, 0]]);
// A cylinder lying along x from `x0` to `x1`, its axis at height `y`.
local rod(id, slot, radius, x0, x1, y) = turned(id, slot, 'x', [[0, 0], [0, radius], [x1 - x0, radius], [x1 - x0, 0]], [x0, y, 0]);
[
  // A disposable cigarette-sized vape, 105 mm long and 9 mm across, lying along x with its tapered
  // mouthpiece at +x and the glowing tip at -x.
  h.compound('ecig', 0.011, [
    rod('body', 'body', 0.0045, -0.0505, 0.028, 0.0045),
    turned('mouth', 'mouth', 'x', [[0, 0], [0, 0.0045], [0.02, 0.004], [0.0245, 0.003], [0.0245, 0]], [0.028, 0.0045, 0]),
    rod('band', 'band', 0.0047, 0.012, 0.02, 0.0045),
    rod('tip', 'tip', 0.004, -0.0525, -0.0505, 0.0045),
  ], { body: 'alu-anodized-black', mouth: 'plastic-black', band: 'steel-stainless', tip: 'plastic-clear-red' }) + { handling: h.gripOn('ecig', 'body'), voxelGrain: 0.002 },

  // A 15 ml squeeze bottle of eye drops, 24 mm across and 84 mm tall, with its pointed dropper cap.
  h.compound('eyedrops', 0.02, [
    turned('bottle', 'bottle', 'y', [[0, 0], [0, 0.012], [0.05, 0.012], [0.056, 0.007], [0.058, 0.005], [0.058, 0]]),
    turned('label', 'label', 'y', [[0.008, 0], [0.008, 0.0123], [0.042, 0.0123], [0.042, 0]]),
    turned('cap', 'cap', 'y', [[0.056, 0], [0.056, 0.0085], [0.068, 0.008], [0.081, 0.003], [0.084, 0.0012], [0.084, 0]]),
  ], { bottle: 'plastic-white', label: 'paint-police-blue', cap: 'plastic-white' }) + inHand('eyedrops', 'bottle') + { voxelGrain: 0.002 },

  // A prefilled vaccine syringe, 125 mm long with its plunger and needle cap, lying along x on the paper
  // backing of its peel pack, needle cap at +x.
  h.compound('flu_shot', 0.011, [
    box('backing', 'backing', [-0.078, 0, -0.013], [0.056, 0.001, 0.013]),
    rod('barrel', 'barrel', 0.0045, -0.03, 0.024, 0.008),
    rod('dose', 'dose', 0.0038, -0.024, 0.018, 0.008),
    rod('stopper', 'stopper', 0.0043, -0.03, -0.024, 0.008),
    box('flange', 'barrel', [-0.033, 0.006, -0.011], [-0.03, 0.01, 0.011]),
    rod('rod', 'plunger', 0.0025, -0.07, -0.03, 0.008),
    rod('thumb', 'plunger', 0.0065, -0.073, -0.07, 0.008),
    rod('hub', 'hub', 0.0032, 0.024, 0.03, 0.008),
    turned('cap', 'cap', 'x', [[0, 0], [0, 0.003], [0.022, 0.0025], [0.024, 0]], [0.03, 0.008, 0]),
  ], { backing: 'paper-white', barrel: 'glass-clear', dose: 'wax-ivory', stopper: 'rubber-black', plunger: 'plastic-white', hub: 'plastic-white', cap: 'plastic-yellow' }) + { handling: h.gripOn('flu_shot', 'barrel'), voxelGrain: 0.002 },

  // A hand-rolled cigarette, 70 mm long and 8 mm thick, lying along x with its twisted paper end at +x
  // and loose tobacco showing at the open end.
  h.compound('handrolled_cig', 0.0008, [
    turned('paper', 'paper', 'x', [[0, 0], [0, 0.0036], [0.058, 0.004], [0.064, 0.0025], [0.07, 0.001], [0.07, 0]], [-0.035, 0.004, 0]),
    rod('tobacco', 'tobacco', 0.003, -0.037, -0.035, 0.004),
  ], { paper: 'paper-white', tobacco: 'leather-brown' }) + { handling: h.gripOn('handrolled_cig', 'paper'), voxelGrain: 0.002 },

  // A folded glassine stamp bag of powder, 30 mm by 45 mm and lying flat, its flap tucked over and a red
  // dealer's stamp on the face.
  h.compound('heroin', 0.0015, [
    box('bag', 'bag', [-0.015, 0, -0.0225], [0.015, 0.002, 0.0225]),
    box('powder', 'powder', [-0.011, 0.002, -0.018], [0.011, 0.004, 0.008]),
    box('flap', 'bag', [-0.015, 0.002, 0.01], [0.015, 0.004, 0.0225]),
    box('stamp', 'stamp', [-0.007, 0.004, -0.014], [0.007, 0.006, 0.002]),
  ], { bag: 'wax-ivory', powder: 'paperboard-tan', stamp: 'paint-red' }) + inHand('heroin', 'bag') + { voxelGrain: 0.002 },

  // A 1 ml glass dosing syringe of golden cannabis oil, 85 mm long with its plunger, lying along x with
  // the luer cap at +x.
  h.compound('hi_q_distillate', 0.0065, [
    rod('barrel', 'glass', 0.004, -0.025, 0.025, 0.007),
    rod('oil', 'oil', 0.0034, -0.02, 0.022, 0.007),
    box('flange', 'glass', [-0.027, 0.005, -0.008], [-0.025, 0.009, 0.008]),
    rod('rod', 'plunger', 0.002, -0.05, -0.025, 0.007),
    rod('thumb', 'plunger', 0.0055, -0.053, -0.05, 0.007),
    turned('cap', 'cap', 'x', [[0, 0], [0, 0.0035], [0.008, 0.0025], [0.008, 0]], [0.025, 0.007, 0]),
  ], { glass: 'glass-clear', oil: 'fuel-amber', plunger: 'plastic-black', cap: 'plastic-black' }) + { handling: h.gripOn('hi_q_distillate', 'barrel'), voxelGrain: 0.002 },

  // A 70 mm square of parchment, opened flat, with a glassy amber slab of shatter on it and a shard
  // broken off one corner.
  h.compound('hi_q_shatter', 0.0054, [
    box('paper', 'paper', [-0.035, 0, -0.035], [0.035, 0.002, 0.035]),
    box('slab', 'slab', [-0.022, 0.002, -0.018], [0.016, 0.004, 0.02]),
    box('slab-corner', 'slab', [0.016, 0.002, -0.018], [0.024, 0.004, 0.006]),
    box('shard', 'slab', [0.012, 0.002, 0.024], [0.022, 0.004, 0.03]),
  ], { paper: 'paper-white', slab: 'fuel-amber' }) + inHand('hi_q_shatter', 'paper') + { voxelGrain: 0.002 },

  // A 5 ml glass concentrate jar, 38 mm across and 20 mm tall, standing open with a smear of yellow wax in
  // the bottom and its black screw lid lying beside it, 70 mm across the pair.
  h.compound('hi_q_wax', 0.026, [
    turned('jar', 'glass', 'y', [[0, 0], [0, 0.019], [0.02, 0.019], [0.02, 0.016], [0.004, 0.016], [0.004, 0]], [-0.014, 0, 0]),
    turned('wax', 'wax', 'y', [[0.004, 0], [0.004, 0.016], [0.01, 0.016], [0.01, 0]], [-0.014, 0, 0]),
    turned('lid', 'lid', 'y', [[0, 0], [0, 0.0175], [0.008, 0.0175], [0.008, 0]], [0.0195, 0, 0]),
  ], { glass: 'glass-clear', wax: 'plastic-yellow', lid: 'plastic-black' }) + inHand('hi_q_wax', 'jar') + { voxelGrain: 0.002 },

  // A clear tube of sugar pellets, 18 mm across and 65 mm tall with a blue flip cap and a paper label.
  h.compound('homeopathic_pills', 0.0083, [
    turned('tube', 'tube', 'y', [[0, 0], [0, 0.009], [0.05, 0.009], [0.05, 0.0075], [0.002, 0.0075], [0.002, 0]]),
    disc('pellets', 'pellets', 0.0075, 0.002, 0.03),
    turned('label', 'label', 'y', [[0.03, 0], [0.03, 0.0093], [0.047, 0.0093], [0.047, 0]]),
    disc('cap', 'cap', 0.0095, 0.05, 0.062),
    disc('flip', 'cap', 0.006, 0.062, 0.065),
  ], { tube: 'glass-clear', pellets: 'wax-ivory', label: 'paper-white', cap: 'plastic-blue' }) + inHand('homeopathic_pills', 'tube') + { voxelGrain: 0.002 },

  // A 100-tablet bottle of anti-inflammatory painkillers, 44 mm across and 88 mm tall with its cap.
  bottle('ibuprofen', 0.063, 0.022, 0.07, 0.017, 0.02, 0.012,
         { body: 'plastic-white', label: 'paint-police-blue', cap: 'plastic-blue' }),

  // A 20 ml glass injection vial of dark yellow iron solution, 24 mm across and 57 mm tall, with an
  // aluminium crimp seal under a red flip-off top and a paper label.
  h.compound('inj_iron', 0.024, [
    turned('vial', 'glass', 'y', [[0, 0], [0, 0.012], [0.042, 0.012], [0.047, 0.007], [0.05, 0.007], [0.05, 0.0055], [0.046, 0.0055], [0.041, 0.0105], [0.002, 0.0105], [0.002, 0]]),
    disc('liquid', 'liquid', 0.0098, 0.002, 0.036),
    turned('label', 'label', 'y', [[0.01, 0], [0.01, 0.0123], [0.034, 0.0123], [0.034, 0]]),
    disc('crimp', 'crimp', 0.0075, 0.047, 0.054),
    disc('flip', 'flip', 0.0065, 0.054, 0.057),
  ], { glass: 'glass-clear', liquid: 'fuel-amber', label: 'paper-white', crimp: 'alu-bare', flip: 'plastic-red' }) + inHand('inj_iron', 'vial') + { voxelGrain: 0.002 },

  // A foil blister card of fourteen round iodide tablets, 80 mm by 30 mm and lying flat, two rows of seven.
  h.compound('iodine', 0.0057, [
    box('card', 'foil', [-0.04, 0, -0.015], [0.04, 0.002, 0.015]),
    box('print', 'print', [-0.04, 0.002, -0.015], [-0.034, 0.0025, 0.015]),
  ] + [
    turned('tablet-%d-%d' % [i, j], 'tablet', 'y', [[0, 0], [0, 0.004], [0.002, 0.004], [0.004, 0.003], [0.004, 0]], [-0.026 + i * 0.01, 0.002, [-0.007, 0.007][j]])
    for i in std.range(0, 6)
    for j in std.range(0, 1)
  ], { foil: 'alu-bare', print: 'paint-red', tablet: 'plastic-white' }) + inHand('iodine', 'card') + { voxelGrain: 0.002 },

  // A cone-rolled joint, 85 mm long, 6 mm across at the card crutch at -x widening to 10 mm before the
  // twisted tip at +x.
  h.compound('joint', 0.0014, [
    turned('paper', 'paper', 'x', [[0, 0], [0, 0.003], [0.07, 0.005], [0.078, 0.0025], [0.085, 0.001], [0.085, 0]], [-0.0425, 0.005, 0]),
    rod('crutch', 'crutch', 0.0033, -0.0435, -0.03, 0.005),
  ], { paper: 'paper-white', crutch: 'paperboard-tan' }) + { handling: h.gripOn('joint', 'paper'), voxelGrain: 0.002 },

  // A small zip bag, 30 mm by 40 mm and lying flat, holding a 2 by 2 square of perforated pink blotter
  // tabs, 6 mm each.
  h.compound('lsd', 0.0013, [
    box('bag', 'bag', [-0.015, 0, -0.02], [0.015, 0.002, 0.02]),
    box('zip', 'zip', [-0.015, 0, -0.02], [0.015, 0.003, -0.016]),
  ] + [
    box('tab-%d-%d' % [i, j], 'tab', [-0.008 + i * 0.008, 0.002, -0.006 + j * 0.008], [-0.002 + i * 0.008, 0.004, 0 + j * 0.008])
    for i in std.range(0, 1)
    for j in std.range(0, 1)
  ], { bag: 'glass-clear', zip: 'plastic-red', tab: 'plastic-clear-red' }) + inHand('lsd', 'bag') + { voxelGrain: 0.002 },

  // A dark blue supplement bottle of sleep tablets, 50 mm across and 96 mm tall with a white cap.
  bottle('melatonin_tablet', 0.089, 0.025, 0.08, 0.019, 0.021, 0.012,
         { body: 'paint-police-blue', label: 'paper-white', cap: 'plastic-white' },
         { shoulderHeight: 0.006, neckHeight: 0.004 }),
]
