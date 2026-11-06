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
[
  // A pack of five sticks of gum, 76 mm long, 21 mm wide and 13 mm thick, lying flat, with the foil
  // ends of the sticks showing where the wrapper is torn open.
  h.compound('caffeine_gum', 0.017, [
    box('wrap', 'wrap', [-0.038, 0, -0.0105], [0.032, 0.013, 0.0105]),
    box('band', 'band', [-0.012, -0.0005, -0.011], [0.008, 0.0135, 0.011]),
    box('foil', 'foil', [0.032, 0.0005, -0.01], [0.038, 0.0125, 0.01]),
  ], { wrap: 'plastic-black', band: 'plastic-yellow', foil: 'alu-bare' }) + inHand('caffeine_gum', 'wrap') + { voxelGrain: 0.002 },

  // A small bottle of caffeine tablets, 35 mm across and 70 mm tall with its cap.
  bottle('caffeine_pills', 0.034, 0.0175, 0.05, 0.013, 0.015, 0.01,
         { body: 'plastic-white', label: 'plastic-black', cap: 'plastic-yellow' }),

  // A tall supplement bottle of 200 calcium tablets, 60 mm across and 125 mm tall.
  bottle('calcium_tablets', 0.15, 0.03, 0.1, 0.022, 0.024, 0.014,
         { body: 'plastic-white', label: 'paint-police-blue', cap: 'plastic-white' },
         { shoulderHeight: 0.006, neckHeight: 0.004 }),

  // A reused jam jar of jelly, 68 mm across and 82 mm tall, with a steel screw lid and a strip of tape
  // for a label. The glass is a shell so the jelly shows through it in the game.
  h.compound('cattail_jelly', 0.32, [
    turned('jar', 'glass', 'y', [[0, 0], [0, 0.034], [0.062, 0.034], [0.068, 0.03], [0.072, 0.03], [0.072, 0.027], [0.066, 0.027], [0.06, 0.031], [0.003, 0.031], [0.003, 0]]),
    disc('jelly', 'jelly', 0.031, 0.003, 0.058),
    disc('lid', 'lid', 0.0315, 0.07, 0.082),
    turned('tape', 'tape', 'y', [[0.025, 0], [0.025, 0.0345], [0.04, 0.0345], [0.04, 0]]),
  ], { glass: 'glass-clear', jelly: 'wax-cream', lid: 'steel-grey', tape: 'tape-grey' }) + inHand('cattail_jelly', 'jar') + { voxelGrain: 0.002 },

  // A round tin of chewing tobacco, 68 mm across and 22 mm tall, with a printed lid.
  h.compound('chewing_tobacco', 0.052, [
    disc('body', 'body', 0.033, 0, 0.016),
    disc('lid', 'lid', 0.034, 0.014, 0.022),
    disc('print', 'print', 0.024, 0.022, 0.024),
  ], { body: 'plastic-black', lid: 'steel-grey', print: 'plastic-green' }) + inHand('chewing_tobacco', 'body') + { voxelGrain: 0.002 },

  // The brown pharmacy bottle of 3 % hydrogen peroxide, 60 mm across and 140 mm tall with its cap.
  bottle('hydrogen_peroxide', 0.3, 0.03, 0.11, 0.012, 0.0135, 0.016,
         { body: 'paperboard-brown', label: 'paper-white', cap: 'plastic-white' },
         { shoulderHeight: 0.01, neckHeight: 0.006 }),

  // A soft pack of cigarettes, 55 mm wide, 88 mm tall and 22 mm deep, with its red top and a warning band.
  h.compound('cigarette', 0.022, [
    box('pack', 'pack', [-0.0275, 0, -0.011], [0.0275, 0.086, 0.011]),
    box('top', 'top', [-0.028, 0.06, -0.0115], [0.028, 0.086, 0.0115]),
    box('band', 'band', [-0.028, 0.012, -0.0115], [0.028, 0.03, 0.0115]),
    box('foil', 'foil', [-0.01, 0.086, -0.006], [0.01, 0.088, 0.006]),
  ], { pack: 'paper-white', top: 'plastic-red', band: 'plastic-black', foil: 'alu-bare' }) + inHand('cigarette', 'pack') + { voxelGrain: 0.002 },

  // One cigar, 150 mm long and 18 mm thick, lying along x with its rounded head at +x and a red paper band.
  h.compound('cigar', 0.014, [
    turned('body', 'leaf', 'x', [[0, 0], [0, 0.008], [0.135, 0.009], [0.145, 0.0075], [0.15, 0.004], [0.15, 0]], [-0.075, 0.009, 0]),
    turned('band', 'band', 'x', [[0.1, 0], [0.1, 0.0098], [0.114, 0.0098], [0.114, 0]], [-0.075, 0.009, 0]),
  ], { leaf: 'leather-brown', band: 'paint-red' }) + { handling: h.gripOn('cigar', 'body'), voxelGrain: 0.002 },

  // A 30 g squeeze tube of anaesthetic cream, 130 mm long and 26 mm across, lying flat along x with the
  // crimped end at +x and the screw cap at -x. Round behind the cap, it keeps its full width to the crimp
  // and flattens only in thickness, drawn as slabs across z whose height follows the round section.
  h.compound('anaesthetic_cream', 0.039, [
    turned('tube', 'tube', 'x', [[0, 0], [0, 0.007], [0.006, 0.013], [0.04, 0.013], [0.04, 0]], [-0.05, 0.013, 0]),
  ] + [
    local slabs = 6, z0 = -0.013 + i * 0.026 / slabs, z1 = z0 + 0.026 / slabs, zm = (z0 + z1) / 2;
    local half = 0.013 * std.sqrt(1 - std.pow(zm / 0.013, 2));
    h.prism('flat' + i, 'tube', 'z', [
      [-0.01, 0.013 - half], [0.025, 0.013 - (half * 0.7 + 0.0006)], [0.055, 0.011],
      [0.055, 0.015], [0.025, 0.013 + (half * 0.7 + 0.0006)], [-0.01, 0.013 + half],
    ], z0, z1)
    for i in std.range(0, 5)
  ] + [
    box('crimp', 'tube', [0.055, 0.0115, -0.0135], [0.07, 0.0145, 0.0135]),
    turned('stripe', 'stripe', 'x', [[0.01, 0], [0.01, 0.0134], [0.034, 0.0134], [0.034, 0]], [-0.05, 0.013, 0]),
    turned('cap', 'cap', 'x', [[0, 0], [0, 0.007], [0.015, 0.007], [0.015, 0]], [-0.065, 0.013, 0]),
  ], { tube: 'plastic-white', stripe: 'plastic-red', cap: 'plastic-red' }) + inHand('anaesthetic_cream', 'tube') + { voxelGrain: 0.002 },

  // A small zip bag, 40 mm by 50 mm and lying flat, with a pinch of white powder in its bottom half.
  h.compound('cocaine', 0.0036, [
    box('bag', 'bag', [-0.02, 0, -0.025], [0.02, 0.002, 0.025]),
    box('zip', 'zip', [-0.02, 0, -0.025], [0.02, 0.003, -0.02]),
    box('powder', 'powder', [-0.014, 0.002, -0.008], [0.014, 0.006, 0.02]),
    box('heap', 'powder', [-0.008, 0.006, 0], [0.008, 0.008, 0.014]),
  ], { bag: 'glass-clear', zip: 'plastic-red', powder: 'plastic-white' }) + inHand('cocaine', 'bag') + { voxelGrain: 0.002 },

  // A 250 ml plastic soda bottle of dark homemade cola, 54 mm across and 150 mm tall, with a strip of
  // tape for a label. The body shows the liquid, as through clear plastic.
  h.compound('methacola', 0.22, [
    disc('liquid', 'liquid', 0.027, 0, 0.1),
    turned('shoulder', 'plastic', 'y', [[0.1, 0], [0.1, 0.027], [0.122, 0.011], [0.136, 0.011], [0.136, 0]]),
    disc('cap', 'cap', 0.0125, 0.136, 0.15),
    turned('tape', 'tape', 'y', [[0.035, 0], [0.035, 0.0275], [0.065, 0.0275], [0.065, 0]]),
  ], { liquid: 'paint-oxblood', plastic: 'glass-clear', cap: 'plastic-red', tape: 'tape-grey' }) + inHand('methacola', 'liquid') + { voxelGrain: 0.004 },

  // A tiny glass vial of crack, 12 mm across and 32 mm tall, with a coloured push cap.
  h.compound('crack', 0.0059, [
    disc('vial', 'glass', 0.006, 0, 0.024),
    disc('rocks', 'rocks', 0.004, 0.002, 0.012),
    disc('cap', 'cap', 0.0068, 0.022, 0.032),
  ], { glass: 'glass-clear', rocks: 'wax-ivory', cap: 'plastic-red' }) + inHand('crack', 'vial') + { voxelGrain: 0.002 },

  // A 250 ml bottle of orange cough syrup, 62 mm across and 165 mm tall, with a dosing cup over the cap.
  bottle('cough_syrup', 0.35, 0.031, 0.105, 0.014, 0.022, 0.03,
         { body: 'fuel-amber', label: 'plastic-blue', cap: 'plastic-white' },
         { shoulderHeight: 0.016, neckHeight: 0.01 }),

  // A pharmacy prescription vial, 33 mm across and 62 mm tall, amber with a blue cap.
  bottle('prescription_sedative', 0.03, 0.016, 0.05, 0.016, 0.0168, 0.011,
         { body: 'fuel-amber', label: 'paper-white', cap: 'plastic-blue' },
         { shoulderHeight: 0.001, neckHeight: 0.001, bandHeight: 0.026 }),

  // A reused 250 ml glass bottle of homemade antiseptic, 62 mm across and 165 mm tall, stoppered with a
  // cork and labelled with a strip of tape.
  h.compound('makeshift_antiseptic', 0.27, [
    turned('bottle', 'glass', 'y', [[0, 0], [0, 0.031], [0.095, 0.031], [0.12, 0.011], [0.15, 0.011], [0.15, 0]]),
    disc('cork', 'cork', 0.0095, 0.145, 0.165),
    turned('tape', 'tape', 'y', [[0.035, 0], [0.035, 0.0315], [0.06, 0.0315], [0.06, 0]]),
  ], { glass: 'glass-clear', cork: 'wood-birch', tape: 'tape-grey' }) + inHand('makeshift_antiseptic', 'bottle') + { voxelGrain: 0.004 },
]
