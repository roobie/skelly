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
// A low domed tablet standing on y at `y0`, centred at (x, z).
local tablet(id, slot, radius, y0, x, z) = turned(id, slot, 'y', [[0, 0], [0, radius], [0.002, radius], [0.004, radius * 0.7], [0.004, 0]], [x, y0, z]);
[
  // A foil blister strip of ten round heart tablets, 70 mm by 32 mm and lying flat, two rows of five,
  // with a printed band at one end.
  h.compound('metoprolol', 0.0055, [
    box('card', 'foil', [-0.035, 0, -0.016], [0.035, 0.002, 0.016]),
    box('print', 'print', [-0.035, 0.002, -0.016], [-0.025, 0.0025, 0.016]),
  ] + [
    tablet('tablet-%d-%d' % [i, j], 'tablet', 0.0045, 0.002, -0.016 + i * 0.011, [-0.0075, 0.0075][j])
    for i in std.range(0, 4)
    for j in std.range(0, 1)
  ], { foil: 'alu-bare', print: 'plastic-red', tablet: 'plastic-white' }) + inHand('metoprolol', 'card') + { voxelGrain: 0.002 },

  // A small zip bag, 40 mm by 50 mm and lying flat, holding a few cloudy crystal shards.
  h.compound('meth', 0.0027, [
    box('bag', 'bag', [-0.02, 0, -0.025], [0.02, 0.002, 0.025]),
    box('zip', 'zip', [-0.02, 0, -0.025], [0.02, 0.003, -0.02]),
    box('shard-a', 'crystal', [-0.012, 0.002, -0.006], [-0.002, 0.006, 0.004]),
    box('shard-b', 'crystal', [0.0, 0.002, 0.002], [0.012, 0.005, 0.01]),
    box('shard-c', 'crystal', [-0.006, 0.002, 0.008], [0.002, 0.008, 0.016]),
    box('shard-d', 'crystal', [0.004, 0.002, -0.012], [0.01, 0.004, -0.004]),
  ], { bag: 'plastic-clear', zip: 'plastic-blue', crystal: 'plastic-frosted' }) + inHand('meth', 'bag') + { voxelGrain: 0.002 },

  // A 50 ml amber glass dropper bottle of homemade herbal oil, 36 mm across and 110 mm tall with its
  // rubber bulb, labelled with a strip of tape.
  h.compound('mugwort_oil', 0.1, [
    turned('bottle', 'glass', 'y', [[0, 0], [0, 0.018], [0.062, 0.018], [0.072, 0.009], [0.076, 0.009], [0.076, 0]]),
    disc('collar', 'collar', 0.0105, 0.074, 0.09),
    turned('bulb', 'bulb', 'y', [[0.09, 0], [0.09, 0.0075], [0.104, 0.0075], [0.108, 0.005], [0.11, 0.002], [0.11, 0]]),
    turned('tape', 'tape', 'y', [[0.022, 0], [0.022, 0.0185], [0.042, 0.0185], [0.042, 0]]),
  ], { glass: 'plastic-amber', collar: 'plastic-black', bulb: 'rubber-black', tape: 'tape-grey' }) + inHand('mugwort_oil', 'bottle') + { voxelGrain: 0.002 },

  // A twin contact lens case, 52 mm long and 17 mm tall: two round wells joined by a bridge, one screw
  // cap blue and one green to tell left from right.
  h.compound('contact_lenses', 0.0094, [
    turned('well-left', 'body', 'y', [[0, 0], [0, 0.011], [0.011, 0.011], [0.011, 0]], [-0.014, 0, 0]),
    turned('well-right', 'body', 'y', [[0, 0], [0, 0.011], [0.011, 0.011], [0.011, 0]], [0.014, 0, 0]),
    box('bridge', 'body', [-0.012, 0, -0.005], [0.012, 0.006, 0.005]),
    turned('cap-left', 'left', 'y', [[0.009, 0], [0.009, 0.0125], [0.017, 0.0125], [0.017, 0]], [-0.014, 0, 0]),
    turned('cap-right', 'right', 'y', [[0.009, 0], [0.009, 0.0125], [0.017, 0.0125], [0.017, 0]], [0.014, 0, 0]),
  ], { body: 'plastic-white', left: 'plastic-blue', right: 'plastic-green' }) + inHand('contact_lenses', 'bridge') + { voxelGrain: 0.002 },

  // A 50-tablet bottle of long-lasting painkillers, 40 mm across and 80 mm tall with its cap.
  bottle('naproxen', 0.05, 0.02, 0.064, 0.015, 0.0175, 0.012,
         { body: 'plastic-white', label: 'plastic-green', cap: 'plastic-green' }),

  // A blister card of twelve square pieces of gum, 70 mm by 50 mm and lying flat, three rows of four,
  // with a mint-green printed band.
  h.compound('nicotine_gum', 0.01, [
    box('card', 'foil', [-0.035, 0, -0.025], [0.035, 0.002, 0.025]),
    box('print', 'print', [-0.035, 0.002, -0.025], [-0.026, 0.0025, 0.025]),
  ] + [
    box('piece-%d-%d' % [i, j], 'gum', [-0.022 + i * 0.014, 0.002, -0.02 + j * 0.014], [-0.012 + i * 0.014, 0.006, -0.01 + j * 0.014])
    for i in std.range(0, 3)
    for j in std.range(0, 2)
  ], { foil: 'alu-bare', print: 'plastic-green', gum: 'plastic-white' }) + inHand('nicotine_gum', 'card') + { voxelGrain: 0.002 },

  // A round plastic can of nicotine pouches, 68 mm across and 24 mm tall, its snap lid carrying a small
  // compartment on top for used pouches.
  h.compound('nicotine_pouch', 0.026, [
    disc('body', 'body', 0.033, 0, 0.016),
    turned('lid', 'lid', 'y', [[0.013, 0], [0.013, 0.034], [0.02, 0.034], [0.022, 0.032], [0.022, 0]]),
    disc('catch', 'catch', 0.016, 0.022, 0.025),
  ], { body: 'plastic-white', lid: 'plastic-blue', catch: 'plastic-white' }) + inHand('nicotine_pouch', 'body') + { voxelGrain: 0.002 },

  // A 250 ml bottle of green night-time cough syrup, 62 mm across and 165 mm tall, with a dosing cup
  // over the cap.
  bottle('night_cough_syrup', 0.35, 0.031, 0.105, 0.014, 0.022, 0.03,
         { body: 'plastic-green', label: 'paint-police-blue', cap: 'plastic-white' },
         { shoulderHeight: 0.016, neckHeight: 0.01 }),

  // A pharmacy prescription vial, 37 mm across and 70 mm tall, amber with a white child-proof cap.
  bottle('oxycodone', 0.041, 0.0185, 0.058, 0.0185, 0.0195, 0.012,
         { body: 'plastic-amber', label: 'paper-white', cap: 'plastic-white' },
         { shoulderHeight: 0.001, neckHeight: 0.001, bandHeight: 0.03 }),

  // A single two-tone capsule, 26 mm long and 11 mm across, lying along z, one half apple-red and the
  // other white.
  h.compound('panacea', 0.0012, h.capsule(0.026, 0.0055)('capsule', 0, 0, 0),
             { 'capsule-a': 'plastic-clear-red', 'capsule-b': 'plastic-white' })
  + inHand('panacea', 'capsule-a') + { voxelGrain: 0.002 },

  // A carton of sleeping tablets, 45 mm wide, 85 mm tall and 18 mm deep, standing, dark blue with a white
  // band and a yellow moon on the face.
  h.compound('sleeping_pills', 0.013, [
    box('carton', 'carton', [-0.0225, 0, -0.009], [0.0225, 0.085, 0.009]),
    box('band', 'band', [-0.023, 0.012, -0.0095], [0.023, 0.028, 0.0095]),
    turned('moon', 'moon', 'z', [[0, 0], [0, 0.009], [0.0015, 0.009], [0.0015, 0]], [0, 0.055, 0.009]),
  ], { carton: 'paint-police-blue', band: 'paper-white', moon: 'plastic-yellow' }) + inHand('sleeping_pills', 'carton') + { voxelGrain: 0.002 },

  // A small reused glass vial of brown homemade tablets, 20 mm across and 58 mm tall, stoppered with
  // a cork and labelled with a strip of tape.
  h.compound('poppy_painkiller', 0.022, [
    turned('vial', 'glass', 'y', [[0, 0], [0, 0.01], [0.044, 0.01], [0.046, 0.008], [0.048, 0.008], [0.048, 0]]),
    disc('pills', 'pills', 0.0085, 0.002, 0.026),
    disc('cork', 'cork', 0.0078, 0.044, 0.058),
    turned('tape', 'tape', 'y', [[0.014, 0], [0.014, 0.0105], [0.03, 0.0105], [0.03, 0]]),
  ], { glass: 'glass-clear', pills: 'paperboard-brown', cork: 'cork', tape: 'tape-grey' }) + inHand('poppy_painkiller', 'vial') + { voxelGrain: 0.002 },

  // A round steel pill tin, 50 mm across and 16 mm tall, its lid labelled with a paper disc.
  h.compound('poppy_sleep', 0.021, [
    disc('body', 'body', 0.024, 0, 0.011),
    disc('lid', 'lid', 0.0245, 0.009, 0.016),
    disc('label', 'label', 0.016, 0.016, 0.017),
  ], { body: 'steel-grey', lid: 'steel-stainless', label: 'paper-white' }) + inHand('poppy_sleep', 'body') + { voxelGrain: 0.002 },

  // A reused 250 ml glass medicine bottle of dark homemade syrup, 60 mm across and 160 mm tall,
  // stoppered with a cork and labelled with a strip of tape. The body shows the syrup, as through glass.
  h.compound('poppy_cough_syrup', 0.34, [
    disc('syrup', 'syrup', 0.03, 0, 0.1),
    turned('shoulder', 'glass', 'y', [[0.1, 0], [0.1, 0.03], [0.118, 0.012], [0.145, 0.012], [0.145, 0]]),
    disc('cork', 'cork', 0.0105, 0.14, 0.16),
    turned('tape', 'tape', 'y', [[0.035, 0], [0.035, 0.0305], [0.06, 0.0305], [0.06, 0]]),
  ], { syrup: 'paint-oxblood', glass: 'glass-clear', cork: 'cork', tape: 'tape-grey' }) + inHand('poppy_cough_syrup', 'syrup') + { voxelGrain: 0.004 },

  // A 240 ml bottle of pink heartburn syrup, 60 mm across and 170 mm tall, with a wide cap.
  bottle('heartburn_syrup', 0.32, 0.03, 0.115, 0.016, 0.02, 0.026,
         { body: 'paint-terracotta', label: 'paper-white', cap: 'paint-terracotta' },
         { shoulderHeight: 0.018, neckHeight: 0.008 }),
]
