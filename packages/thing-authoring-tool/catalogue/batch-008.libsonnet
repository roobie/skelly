local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
// A prism whose profile may be listed either way round: it is turned counterclockwise before use.
local prism(id, slot, axis, profile, start, end) =
  local n = std.length(profile);
  local area = std.sum([profile[i][0] * profile[(i + 1) % n][1] - profile[(i + 1) % n][0] * profile[i][1] for i in std.range(0, n - 1)]);
  h.prism(id, slot, axis, if area > 0 then profile else std.reverse(profile), start, end);
local rod = h.rod;
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
local tablet(id, slot, radius, y0, x, z) = turned(id, slot, 'y', [[0, 0], [0, radius], [0.0015, radius], [0.003, radius * 0.7], [0.003, 0]], [x, y0, z]);
// A two-tone capsule lying along z on a card at `y0`, centred at (x, z): one half in slot `a`, the other in `b`.
local capsule(id, a, b, length, radius, y0, x, z) = [
  turned(id + '-a', a, 'z', [[0, 0], [0, radius * 0.6], [radius * 0.5, radius], [length / 2, radius], [length / 2, 0]], [x, y0 + radius, z - length / 2]),
  turned(id + '-b', b, 'z', [[0, 0], [0, radius], [length / 2 - radius * 0.5, radius], [length / 2, radius * 0.6], [length / 2, 0]], [x, y0 + radius, z]),
];
[
  // A 10 ml amber injection vial, 24 mm across and 52 mm tall, with an aluminium crimp, a green flip-off
  // cap and a paper label.
  h.compound('prophylactic_antivenom', 0.02, [
    turned('vial', 'glass', 'y', [[0, 0], [0, 0.012], [0.036, 0.012], [0.04, 0.007], [0.043, 0.007], [0.043, 0]]),
    disc('crimp', 'crimp', 0.0085, 0.042, 0.05),
    disc('flip', 'flip', 0.0082, 0.05, 0.053),
    turned('label', 'label', 'y', [[0.006, 0], [0.006, 0.0124], [0.03, 0.0124], [0.03, 0]]),
  ], { glass: 'plastic-amber', crimp: 'alu-bare', flip: 'plastic-green', label: 'paper-white' }) + inHand('prophylactic_antivenom', 'vial') + { voxelGrain: 0.002 },

  // A 30-capsule pharmacy bottle of antidepressants, 36 mm across and 72 mm tall with its cap.
  bottle('fluoxetine', 0.039, 0.018, 0.056, 0.014, 0.0175, 0.012,
         { body: 'plastic-white', label: 'plastic-green', cap: 'paint-cream' }),

  // A carton of Prussian blue capsules, 50 mm wide, 95 mm tall and 25 mm deep, standing, dark blue with
  // a white band and a black and yellow radiation trefoil on the face.
  h.compound('prussian_blue', 0.022, [
    box('carton', 'carton', [-0.025, 0, -0.0125], [0.025, 0.095, 0.0125]),
    box('band', 'band', [-0.0255, 0.012, -0.013], [0.0255, 0.03, 0.013]),
    turned('sign', 'sign', 'z', [[0, 0], [0, 0.011], [0.0015, 0.011], [0.0015, 0]], [0, 0.062, 0.0125]),
    turned('trefoil', 'trefoil', 'z', [[0, 0], [0, 0.004], [0.002, 0.004], [0.002, 0]], [0, 0.062, 0.0125]),
  ], { carton: 'paint-police-blue', band: 'paper-white', sign: 'plastic-yellow', trefoil: 'plastic-black' }) + inHand('prussian_blue', 'carton') + { voxelGrain: 0.002 },

  // A sealed single-use olive foil sachet of clotting powder, 50 mm by 70 mm and lying flat, with a white
  // printed panel, a red stripe and crimped ends.
  h.compound('hemostatic_powder', 0.03, [
    box('pouch', 'pouch', [-0.03, 0, -0.025], [0.03, 0.006, 0.025]),
    box('crimp-top', 'crimp', [0.03, 0.002, -0.025], [0.035, 0.004, 0.025]),
    box('crimp-bottom', 'crimp', [-0.035, 0.002, -0.025], [-0.03, 0.004, 0.025]),
    box('panel', 'panel', [-0.022, 0.006, -0.019], [0.012, 0.007, 0.019]),
    box('stripe', 'stripe', [0.017, 0.006, -0.025], [0.023, 0.007, 0.025]),
  ], { pouch: 'paint-olive', crimp: 'paint-olive', panel: 'paper-white', stripe: 'plastic-red' }) + inHand('hemostatic_powder', 'pouch') + { voxelGrain: 0.002 },

  // A 250 ml bag of saline for a drip, 180 mm long and 95 mm wide lying flat, with a printed label, two
  // ports at one end and a hanging tab at the other.
  h.compound('saline', 0.24, [
    prism('bag', 'bag', 'z', [[-0.075, 0.009], [-0.065, 0], [0.065, 0], [0.075, 0.009], [0.065, 0.02], [-0.065, 0.02]], -0.045, 0.045),
    box('label', 'label', [-0.05, 0.02, -0.032], [0.045, 0.021, 0.032]),
    box('tab', 'bag', [0.075, 0.008, -0.012], [0.09, 0.01, 0.012]),
    rod('port-a', 'port', 0.0035, -0.092, -0.07, 0.009) + { origin: [-0.092, 0.009, -0.014] },
    rod('port-b', 'port', 0.0035, -0.092, -0.07, 0.009) + { origin: [-0.092, 0.009, 0.014] },
    rod('cap-a', 'cap', 0.004, -0.1, -0.092, 0.009) + { origin: [-0.1, 0.009, -0.014] },
    rod('cap-b', 'tip', 0.004, -0.1, -0.092, 0.009) + { origin: [-0.1, 0.009, 0.014] },
  ], { bag: 'plastic-clear', label: 'paper-white', port: 'plastic-white', cap: 'plastic-blue', tip: 'plastic-red' }) + inHand('saline', 'bag') + { voxelGrain: 0.004 },

  // A reused 250 ml trigger spray bottle of homemade deodorising wash, 55 mm across and 200 mm tall,
  // labelled with a strip of tape.
  h.compound('skunk_neutralizer', 0.26, [
    turned('bottle', 'bottle', 'y', [[0, 0], [0, 0.0275], [0.12, 0.0275], [0.135, 0.013], [0.145, 0.013], [0.145, 0]]),
    disc('collar', 'head', 0.015, 0.145, 0.158),
    box('head', 'head', [-0.025, 0.158, -0.012], [0.028, 0.188, 0.012]),
    box('nozzle', 'nozzle', [0.028, 0.172, -0.005], [0.038, 0.182, 0.005]),
    prism('trigger', 'trigger', 'z', [[0.012, 0.158], [0.022, 0.158], [0.026, 0.13], [0.018, 0.13]], -0.006, 0.006),
    rod('tube', 'head', 0.006, -0.025, -0.012, 0.18),
    turned('tape', 'tape', 'y', [[0.05, 0], [0.05, 0.028], [0.08, 0.028], [0.08, 0]]),
  ], { bottle: 'plastic-frosted', head: 'plastic-white', nozzle: 'plastic-black', trigger: 'plastic-blue', tape: 'tape-grey' }) + inHand('skunk_neutralizer', 'bottle') + { voxelGrain: 0.004 },

  // A 5 ml white dropper bottle of steroid eye drops, 18 mm across and 62 mm tall, with a narrow paper
  // label and a tall pink cap.
  h.compound('steroid_eyedrops', 0.012, [
    turned('bottle', 'bottle', 'y', [[0, 0], [0, 0.009], [0.034, 0.009], [0.04, 0.006], [0.04, 0]]),
    turned('label', 'label', 'y', [[0.01, 0], [0.01, 0.0094], [0.026, 0.0094], [0.026, 0]]),
    turned('cap', 'cap', 'y', [[0.038, 0], [0.038, 0.0075], [0.054, 0.0075], [0.062, 0.004], [0.062, 0]]),
  ], { bottle: 'enamel-white', label: 'paper-white', cap: 'plastic-pink' }) + inHand('steroid_eyedrops', 'bottle') + { voxelGrain: 0.002 },

  // A foil blister card of ten red and yellow capsules, 80 mm by 45 mm and lying flat, two rows of five,
  // with a printed band at one end.
  h.compound('broad_spectrum_antibiotic', 0.0085, [
    box('card', 'foil', [-0.04, 0, -0.0225], [0.04, 0.002, 0.0225]),
    box('print', 'print', [-0.04, 0.002, -0.0225], [-0.03, 0.0025, 0.0225]),
  ] + std.flattenArrays([
    capsule('capsule-%d-%d' % [i, j], 'red', 'yellow', 0.018, 0.003, 0.002, -0.02 + i * 0.012, [-0.0105, 0.0105][j])
    for i in std.range(0, 4)
    for j in std.range(0, 1)
  ]), { foil: 'alu-bare', print: 'plastic-blue', red: 'plastic-red', yellow: 'plastic-yellow' }) + inHand('broad_spectrum_antibiotic', 'card') + { voxelGrain: 0.002 },

  // A foil blister strip of ten small orange coated antipsychotic tablets, 70 mm by 32 mm and lying flat,
  // two rows of five, with a printed band at one end.
  h.compound('chlorpromazine', 0.0047, [
    box('card', 'foil', [-0.035, 0, -0.016], [0.035, 0.002, 0.016]),
    box('print', 'print', [-0.035, 0.002, -0.016], [-0.025, 0.0025, 0.016]),
  ] + [
    tablet('tablet-%d-%d' % [i, j], 'tablet', 0.004, 0.002, -0.016 + i * 0.011, [-0.0075, 0.0075][j])
    for i in std.range(0, 4)
    for j in std.range(0, 1)
  ], { foil: 'alu-bare', print: 'paint-charcoal', tablet: 'paint-terracotta' }) + inHand('chlorpromazine', 'card') + { voxelGrain: 0.002 },

  // A 30 ml cobalt-blue glass bottle of essential oil, 32 mm across and 80 mm tall, with a black dropper
  // cap and a paper label.
  h.compound('thyme_oil', 0.035, [
    turned('bottle', 'glass', 'y', [[0, 0], [0, 0.016], [0.052, 0.016], [0.06, 0.008], [0.062, 0.008], [0.062, 0]]),
    turned('cap', 'cap', 'y', [[0.06, 0], [0.06, 0.0105], [0.078, 0.0105], [0.08, 0.009], [0.08, 0]]),
    turned('label', 'label', 'y', [[0.012, 0], [0.012, 0.0164], [0.042, 0.0164], [0.042, 0]]),
  ], { glass: 'plastic-clear-blue', cap: 'plastic-black', label: 'paper-white' }) + inHand('thyme_oil', 'bottle') + { voxelGrain: 0.002 },

  // A soft folding pouch of fine-cut rolling tobacco, 130 mm by 90 mm and 18 mm thick, lying flat, its
  // flap folded over the front and a tuft of brown tobacco showing at the open side.
  h.compound('rolling_tobacco', 0.044, [
    box('pouch', 'pouch', [-0.065, 0, -0.045], [0.065, 0.016, 0.045]),
    prism('flap', 'flap', 'z', [[-0.065, 0.016], [0.02, 0.016], [0.03, 0.018], [-0.065, 0.018]], -0.045, 0.045),
    box('band', 'band', [-0.05, 0.018, -0.045], [-0.01, 0.0185, 0.045]),
    box('tuft', 'tobacco', [0.065, 0.004, -0.035], [0.069, 0.012, 0.035]),
  ], { pouch: 'paint-charcoal', flap: 'paint-oxblood', band: 'paper-white', tobacco: 'paperboard-brown' }) + inHand('rolling_tobacco', 'pouch') + { voxelGrain: 0.002 },

  // A pharmacy prescription vial of painkillers, 33 mm across and 70 mm tall, amber with a blue
  // child-proof cap and a white label.
  bottle('tramadol', 0.035, 0.0165, 0.058, 0.0165, 0.0175, 0.012,
         { body: 'plastic-amber', label: 'paper-white', cap: 'plastic-blue' },
         { shoulderHeight: 0.001, neckHeight: 0.001, bandHeight: 0.03 }),

  // A wide-mouthed 100-tablet supplement bottle, 60 mm across and 110 mm tall, white with an orange
  // label and a white cap.
  bottle('multivitamin', 0.14, 0.03, 0.09, 0.025, 0.027, 0.014,
         { body: 'plastic-white', label: 'paint-terracotta', cap: 'plastic-white' },
         { shoulderHeight: 0.006, neckHeight: 0.004 }),

  // A broken half of a large white vitamin tablet, 20 mm by 9 mm and 6 mm thick, lying flat.
  h.compound('vitamin_c_fragment', 0.0012, [
    prism('half', 'tablet', 'y', [[0, -0.01], [0.003, -0.0095], [0.006, -0.008], [0.008, -0.005], [0.009, 0], [0.008, 0.005], [0.006, 0.008], [0.003, 0.0095], [0, 0.01]], 0, 0.006),
  ], { tablet: 'enamel-white' }) + inHand('vitamin_c_fragment', 'half') + { voxelGrain: 0.002 },

  // A screw-capped tube of twenty large vitamin tablets, 30 mm across and 105 mm tall, standing, with an
  // orange label band and a yellow cap.
  h.compound('vitamin_c', 0.043, [
    disc('tube', 'tube', 0.015, 0, 0.092),
    turned('label', 'label', 'y', [[0.01, 0], [0.01, 0.0154], [0.08, 0.0154], [0.08, 0]]),
    disc('cap', 'cap', 0.0158, 0.09, 0.105),
  ], { tube: 'plastic-white', label: 'paint-terracotta', cap: 'plastic-yellow' }) + inHand('vitamin_c', 'tube') + { voxelGrain: 0.002 },
]
