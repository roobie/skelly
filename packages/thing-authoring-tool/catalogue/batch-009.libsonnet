local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
// A cylinder standing on y from `y0` to `y1`, centred at (x, z).
local disc(id, slot, radius, y0, y1, x=0, z=0) = turned(id, slot, 'y', [[0, 0], [0, radius], [y1 - y0, radius], [y1 - y0, 0]], [x, y0, z]);
// A drum shell standing on y, `height` tall, its top and bottom edges rolled in by `chime`.
local shell(id, slot, radius, height, chime) = turned(id, slot, 'y', [[0, 0], [0, radius - chime], [chime, radius], [height - chime, radius], [height, radius - chime], [height, 0]]);
[
  // A foil blister card of ten plain white antibiotic tablets, 70 mm by 35 mm and lying flat, two rows of
  // five, with a green printed band at one end.
  h.compound('narrow_spectrum_antibiotic', 0.0054, h.blister(0.07, 0.035, 5, 2, h.tablet(0.0045)),
             { foil: 'alu-bare', print: 'plastic-green', tablet: 'chalk-white' })
  + h.inHand('narrow_spectrum_antibiotic', 'card') + { voxelGrain: 0.002 },

  // A small clear zip bag of dried cannabis buds, 80 mm by 60 mm and lying flat, with a red press seal
  // along one end. The film is a thin floor and edge welts so the bud clusters, which fill and bulge the
  // bag, read through it.
  local bud(name, at, r, tall) = turned(name, 'bud', 'y', [[0, 0], [0, r * 0.7], [tall * 0.45, r], [tall * 0.85, r * 0.6], [tall, 0]], at);
  local tip(name, at, r) = turned(name, 'tip', 'y', [[0, 0], [0, r], [r * 1.2, r * 0.6], [r * 1.6, 0]], at);
  h.compound('cannabis', 0.0055, [
    box('film', 'bag', [-0.04, 0, -0.03], [0.04, 0.0015, 0.03]),
    box('welt-l', 'bag', [-0.04, 0, -0.03], [-0.037, 0.005, 0.03]),
    box('welt-f', 'bag', [-0.04, 0, 0.027], [0.03, 0.005, 0.03]),
    box('welt-b', 'bag', [-0.04, 0, -0.03], [0.03, 0.005, -0.027]),
    box('zip', 'bag', [0.03, 0, -0.03], [0.04, 0.006, 0.03]),
    box('seal', 'seal', [0.031, 0.006, -0.029], [0.035, 0.0075, 0.029]),
    bud('bud-a', [-0.02, 0.001, -0.012], 0.011, 0.018),
    bud('bud-b', [0.004, 0.001, 0.01], 0.012, 0.02),
    bud('bud-c', [0.014, 0.001, -0.014], 0.009, 0.015),
    bud('bud-d', [-0.022, 0.001, 0.013], 0.009, 0.014),
    bud('bud-e', [-0.004, 0.001, -0.006], 0.008, 0.016),
    tip('tip-a', [-0.018, 0.015, -0.01], 0.004),
    tip('tip-b', [0.006, 0.017, 0.008], 0.004),
    tip('tip-c', [0.015, 0.0125, -0.012], 0.0035),
    tip('tip-d', [-0.004, 0.0135, -0.006], 0.003),
    turned('stem', 'stem', 'x', [[0, 0], [0, 0.0012], [0.016, 0.0012], [0.016, 0]], [0.008, 0.0015, 0.022]),
  ], { bag: 'plastic-bag', seal: 'plastic-red', bud: 'plant-dried', tip: 'leaf-green', stem: 'paperboard-tan' })
  + h.inHand('cannabis', 'film') + { voxelGrain: 0.002 },

  // A squat 50 ml jar of wintergreen ointment, 56 mm across and 42 mm tall with its lid: white with a
  // paper label band and a green screw lid.
  h.compound('wintergreen_ointment', 0.05, [
    turned('jar', 'jar', 'y', [[0, 0], [0, 0.026], [0.028, 0.026], [0.03, 0.024], [0.032, 0.024], [0.032, 0]]),
    turned('label', 'label', 'y', [[0, 0], [0, 0.0264], [0.018, 0.0264], [0.018, 0]], [0, 0.006, 0]),
    turned('lid', 'lid', 'y', [[0, 0], [0, 0.028], [0.011, 0.028], [0.012, 0.026], [0.012, 0]], [0, 0.03, 0]),
  ], { jar: 'enamel-white', label: 'paper-white', lid: 'plastic-green' })
  + h.inHand('wintergreen_ointment', 'jar') + { voxelGrain: 0.002 },

  // A pharmacy prescription vial of sedative tablets, 28 mm across and 62 mm tall, amber with a white
  // child-proof cap and a white label.
  h.compound('fast_acting_sedative', 0.013, [
    turned('vial', 'vial', 'y', [[0, 0], [0, 0.014], [0.05, 0.014], [0.05, 0]]),
    turned('label', 'label', 'y', [[0, 0], [0, 0.0144], [0.028, 0.0144], [0.028, 0]], [0, 0.01, 0]),
    turned('cap', 'cap', 'y', [[0, 0], [0, 0.0155], [0.011, 0.0155], [0.012, 0.0145], [0.012, 0]], [0, 0.05, 0]),
  ], { vial: 'plastic-amber', label: 'paper-white', cap: 'plastic-white' })
  + h.inHand('fast_acting_sedative', 'vial') + { voxelGrain: 0.002 },

  // A red plastic first aid case, 240 mm wide, 170 mm tall and 75 mm deep, standing on its edge with a
  // carry handle on top, a white cross on the front, a lid seam all round and two white latches.
  h.compound('first_aid_box', 0.6, [
    box('base', 'case', [-0.12, 0, -0.0375], [0.12, 0.17, 0.004]),
    box('lid', 'case', [-0.12, 0, 0.006], [0.12, 0.17, 0.0375]),
    box('seam', 'seam', [-0.119, 0.001, 0.004], [0.119, 0.169, 0.006]),
    box('cross-bar', 'cross', [-0.04, 0.072, 0.0375], [0.04, 0.098, 0.0395]),
    box('cross-post', 'cross', [-0.013, 0.045, 0.0375], [0.013, 0.125, 0.0395]),
    box('grip', 'handle', [-0.045, 0.19, -0.01], [0.045, 0.2, 0.01]),
    box('post-a', 'handle', [-0.045, 0.17, -0.01], [-0.035, 0.19, 0.01]),
    box('post-b', 'handle', [0.035, 0.17, -0.01], [0.045, 0.19, 0.01]),
    box('latch-a', 'latch', [-0.095, 0.17, -0.006], [-0.075, 0.176, 0.014]),
    box('latch-b', 'latch', [0.075, 0.17, -0.006], [0.095, 0.176, 0.014]),
  ], { case: 'plastic-red', seam: 'plastic-grey', cross: 'paint-white', handle: 'plastic-grey', latch: 'plastic-white' })
  + { voxelGrain: 0.004 },

  // A blue plastic 30 gallon closed-head barrel, 480 mm across and 720 mm tall, with two moulded rolling
  // ribs, a raised top ring and two screw bungs, one large and one small.
  h.compound('plastic_barrel', 5.1, [
    shell('body', 'body', 0.24, 0.7, 0.02),
    turned('rib-a', 'body', 'y', [[0, 0], [0, 0.25], [0.02, 0.25], [0.02, 0]], [0, 0.22, 0]),
    turned('rib-b', 'body', 'y', [[0, 0], [0, 0.25], [0.02, 0.25], [0.02, 0]], [0, 0.48, 0]),
    turned('ring', 'body', 'y', [[0, 0.2], [0, 0.236], [0.02, 0.236], [0.02, 0.2]], [0, 0.7, 0]),
    disc('bung-large', 'bung', 0.035, 0.7, 0.72, 0.12, 0),
    disc('bung-small', 'bung', 0.025, 0.7, 0.72, -0.12, 0),
  ], { body: 'plastic-blue', bung: 'plastic-white' }),

  // A red open-head 30 gallon steel drum, 465 mm across and 745 mm tall, with two rolled rolling hoops, a
  // lid held by a bolted clamp ring and a small bung in the lid.
  h.compound('steel_drum_100', 16, [
    shell('body', 'body', 0.2325, 0.72, 0.01),
    turned('hoop-a', 'body', 'y', [[0, 0], [0, 0.2425], [0.02, 0.2425], [0.02, 0]], [0, 0.24, 0]),
    turned('hoop-b', 'body', 'y', [[0, 0], [0, 0.2425], [0.02, 0.2425], [0.02, 0]], [0, 0.48, 0]),
    disc('lid', 'body', 0.236, 0.72, 0.73),
    turned('clamp', 'clamp', 'y', [[0, 0.215], [0, 0.242], [0.025, 0.242], [0.025, 0.215]], [0, 0.71, 0]),
    box('bolt', 'clamp', [0.235, 0.712, -0.025], [0.26, 0.732, 0.025]),
    disc('bung', 'bung', 0.025, 0.73, 0.745, -0.13, 0.06),
  ], { body: 'paint-red', clamp: 'steel', bung: 'steel-grey' }),

  // An olive drab closed-head 55 gallon steel drum, 585 mm across and 880 mm tall, with two rolled rolling
  // hoops, rolled chimes top and bottom, and two screw bungs in the top, one large and one small.
  h.compound('steel_drum_200', 37, [
    shell('body', 'body', 0.2925, 0.88, 0.012),
    turned('hoop-a', 'body', 'y', [[0, 0], [0, 0.3025], [0.02, 0.3025], [0.02, 0]], [0, 0.285, 0]),
    turned('hoop-b', 'body', 'y', [[0, 0], [0, 0.3025], [0.02, 0.3025], [0.02, 0]], [0, 0.577, 0]),
    turned('chime-top', 'chime', 'y', [[0, 0.27], [0, 0.296], [0.02, 0.296], [0.02, 0.27]], [0, 0.868, 0]),
    turned('chime-foot', 'chime', 'y', [[0, 0.27], [0, 0.296], [0.014, 0.296], [0.014, 0.27]]),
    disc('bung-large', 'bung', 0.036, 0.87, 0.9, 0.18, 0),
    disc('bung-small', 'bung', 0.025, 0.87, 0.9, -0.18, 0),
  ], { body: 'paint-olive', chime: 'paint-olive', bung: 'steel-grey' }),
]
