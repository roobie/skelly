local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
// A limb standing on y from `y0` to `y1`, radius `r0` at the bottom and `r1` at the top.
local limbY(id, slot, r0, r1, y0, y1, x, z) = turned(id, slot, 'y', [[0, 0], [0, r0], [y1 - y0, r1], [y1 - y0, 0]], [x, y0, z]);
// A limb lying along z from `z0` to `z1`, its axis at [x, y].
local limbZ(id, slot, r, z0, z1, x, y) = turned(id, slot, 'z', [[0, 0], [0, r], [z1 - z0, r], [z1 - z0, 0]], [x, y, z0]);
// A moulded action figure 150 mm tall standing on a round peg base, front on +z, fists at its sides.
local figure = [
  h.disc('base', 'base', 0.035, 0, 0.006),
  box('boot-l', 'boot', [-0.022, 0.006, -0.01], [-0.004, 0.03, 0.014]),
  box('boot-r', 'boot', [0.004, 0.006, -0.01], [0.022, 0.03, 0.014]),
  limbY('leg-l', 'suit', 0.008, 0.011, 0.03, 0.074, -0.013, 0),
  limbY('leg-r', 'suit', 0.008, 0.011, 0.03, 0.074, 0.013, 0),
  box('belt', 'trim', [-0.023, 0.072, -0.013], [0.023, 0.08, 0.013]),
  turned('torso', 'suit', 'y', [[0, 0], [0, 0.021], [0.03, 0.026], [0.042, 0.027], [0.046, 0.02], [0.046, 0]], [0, 0.078, 0]),
  box('emblem', 'trim', [-0.009, 0.098, 0.022], [0.009, 0.112, 0.027]),
  limbY('arm-l', 'suit', 0.007, 0.009, 0.08, 0.118, -0.033, 0),
  limbY('arm-r', 'suit', 0.007, 0.009, 0.08, 0.118, 0.033, 0),
  h.ball('fist-l', 'boot', 0.009, -0.033, 0.078, 0),
  h.ball('fist-r', 'boot', 0.009, 0.033, 0.078, 0),
  limbY('neck', 'skin', 0.006, 0.006, 0.122, 0.128, 0, 0),
  h.ball('head', 'skin', 0.012, 0, 0.138, 0.001, 1.1),
  h.ball('hair', 'hair', 0.0125, 0, 0.142, -0.003, 1.0),
  box('eye-l', 'eye', [-0.007, 0.138, 0.01], [-0.003, 0.141, 0.013]),
  box('eye-r', 'eye', [0.003, 0.138, 0.01], [0.007, 0.141, 0.013]),
];
[
  // A stuffed toy shark 1.03 m from snout to tail, 0.26 m through the body, lying on its white belly, snout on +z,
  // with a tall back fin, two side fins and an upright tail fin.
  h.compound('shark_plushie', 0.6, [
    turned('body', 'hide', 'z', [[0, 0], [0, 0.03], [0.12, 0.07], [0.35, 0.115], [0.55, 0.13], [0.72, 0.12], [0.82, 0.095], [0.88, 0.06], [0.9, 0]], [0, 0.14, -0.4]),
    turned('belly', 'belly', 'z', [[0, 0], [0, 0.06], [0.2, 0.1], [0.45, 0.12], [0.6, 0.11], [0.7, 0.08], [0.74, 0]], [0, 0.12, -0.25]),
    // A back fin raked towards the tail, as a thick slab standing on the back.
    h.prism('fin-back', 'hide', 'x', [[0.25, 0.02], [0.25, 0.2], [0.4, -0.02], [0.33, -0.06]], -0.012, 0.012),
    h.prism('fin-l', 'hide', 'y', [[0.17, -0.09], [0.08, -0.26], [0.05, -0.24], [0.11, -0.09]], 0.07, 0.09),
    h.prism('fin-r', 'hide', 'y', [[0.17, 0.09], [0.11, 0.09], [0.05, 0.24], [0.08, 0.26]], 0.07, 0.09),
    // The tail fin stands upright behind the body, its upper lobe longer than the lower.
    h.prism('tail-top', 'hide', 'x', [[0.14, -0.36], [0.16, -0.4], [0.38, -0.53], [0.33, -0.43]], -0.012, 0.012),
    h.prism('tail-low', 'hide', 'x', [[0.14, -0.36], [0.03, -0.48], [0.06, -0.5], [0.16, -0.4]], -0.012, 0.012),
    h.ball('eye-l', 'eye', 0.012, -0.075, 0.17, 0.36),
    h.ball('eye-r', 'eye', 0.012, 0.075, 0.17, 0.36),
    box('mouth', 'mouth', [-0.04, 0.1, 0.43], [0.04, 0.108, 0.455]),
  ], { hide: 'cloth-shirt-blue', belly: 'cloth-cream', eye: 'plastic-matte-black', mouth: 'cloth-crimson' }),

  // A stuffed bear 300 mm tall sitting with its legs out in front, front on +z: round head and ears, a pale
  // muzzle, belly and foot pads, and a red ribbon tied at the neck.
  h.compound('teddy_bear', 0.2, [
    h.ball('body', 'fur', 0.075, 0, 0.11, 0, 1.25),
    h.ball('belly', 'pale', 0.052, 0, 0.1, 0.033, 1.2),
    limbZ('leg-l', 'fur', 0.032, 0, 0.11, -0.045, 0.032),
    limbZ('leg-r', 'fur', 0.032, 0, 0.11, 0.045, 0.032),
    limbZ('pad-l', 'pale', 0.024, 0.11, 0.114, -0.045, 0.032),
    limbZ('pad-r', 'pale', 0.024, 0.11, 0.114, 0.045, 0.032),
    limbY('arm-l', 'fur', 0.024, 0.026, 0.09, 0.19, -0.078, 0.02),
    limbY('arm-r', 'fur', 0.024, 0.026, 0.09, 0.19, 0.078, 0.02),
    h.ball('paw-l', 'fur', 0.025, -0.078, 0.09, 0.02),
    h.ball('paw-r', 'fur', 0.025, 0.078, 0.09, 0.02),
    turned('ribbon', 'ribbon', 'y', [[0, 0], [0, 0.048], [0.012, 0.048], [0.012, 0]], [0, 0.19, 0]),
    box('bow', 'ribbon', [-0.03, 0.184, 0.04], [0.03, 0.208, 0.056]),
    h.ball('head', 'fur', 0.065, 0, 0.26, 0.005),
    h.ball('ear-l', 'fur', 0.024, -0.05, 0.315, 0, 0.9),
    h.ball('ear-r', 'fur', 0.024, 0.05, 0.315, 0, 0.9),
    h.ball('ear-in-l', 'pale', 0.014, -0.05, 0.315, 0.012, 0.9),
    h.ball('ear-in-r', 'pale', 0.014, 0.05, 0.315, 0.012, 0.9),
    h.ball('muzzle', 'pale', 0.028, 0, 0.24, 0.05, 0.8),
    h.ball('nose', 'eye', 0.01, 0, 0.25, 0.076),
    h.ball('eye-l', 'eye', 0.007, -0.026, 0.278, 0.058),
    h.ball('eye-r', 'eye', 0.007, 0.026, 0.278, 0.058),
  ], { fur: 'fur-brown', pale: 'fur-pale', ribbon: 'cloth-red', eye: 'plastic-matte-black' })
  + h.inHand('teddy_bear', 'body') + { voxelGrain: 0.004 },

  // A plastic action figure 150 mm tall on a round peg base: blue suit, red boots and gloves, a yellow belt and
  // chest badge.
  h.compound('toy_figurine', 0.12, figure, {
    base: 'plastic-black', boot: 'plastic-red', suit: 'plastic-blue', trim: 'plastic-yellow',
    skin: 'latex-pale', hair: 'plastic-black', eye: 'plastic-matte-black',
  }) + h.inHand('toy_figurine', 'torso') + { voxelGrain: 0.002 },

  // A collectible figure 320 mm tall: a caped knight in grey armour with a sword planted point-down in front of him,
  // standing on a square black plinth.
  h.compound('toy_figurine_large', 1.3, [
    box('plinth', 'plinth', [-0.075, 0, -0.075], [0.075, 0.03, 0.075]),
    box('plaque', 'trim', [-0.04, 0.008, 0.075], [0.04, 0.022, 0.078]),
  ] + [
    p + (if p.kind == 'box' then { min: [p.min[0], p.min[1] + 0.018, p.min[2]], max: [p.max[0], p.max[1] + 0.018, p.max[2]] }
         else if std.objectHas(p, 'origin') then { origin: [p.origin[0], p.origin[1] + 0.018, p.origin[2]] }
         else { origin: [0, 0.018, 0] })
    for p in h.scaled(figure[1:], 2)
  ] + [
    // The cape hangs from the shoulders down the back to the knees.
    h.prism('cape', 'cape', 'z', [[-0.05, 0.08], [0.05, 0.08], [0.035, 0.27], [-0.035, 0.27]], -0.064, -0.054),
    box('blade', 'blade', [-0.004, 0.03, 0.062], [0.004, 0.19, 0.068]),
    box('guard', 'trim', [-0.028, 0.19, 0.06], [0.028, 0.198, 0.07]),
    limbY('grip', 'cape', 0.005, 0.005, 0.198, 0.23, 0, 0.065),
  ], {
    plinth: 'lacquer-black', trim: 'brass-polished', boot: 'iron-dull', suit: 'steel-grey', cape: 'cloth-crimson',
    blade: 'steel-bright', skin: 'latex-pale', hair: 'leather-chestnut', eye: 'plastic-matte-black',
  }) + h.inHand('toy_figurine_large', 'plinth') + { voxelGrain: 0.004 },

  // A plastic yo-yo 64 mm across and 35 mm wide, standing on its rim, face on +z, with its string wound in the
  // gap and a tail ending in a finger loop lying beside it.
  h.compound('yoyo', 0.049, [
    turned('halves', 'shell', 'z', [[0, 0], [0, 0.026], [0.004, 0.032], [0.014, 0.032], [0.0155, 0.007], [0.0195, 0.007], [0.021, 0.032], [0.031, 0.032], [0.035, 0.026], [0.035, 0]], [0, 0.032, -0.0175]),
    turned('string-wound', 'string', 'z', [[0, 0], [0, 0.016], [0.004, 0.016], [0.004, 0]], [0, 0.032, -0.002]),
    turned('cap-front', 'cap', 'z', [[0, 0], [0, 0.013], [0.002, 0.013], [0.002, 0]], [0, 0.032, 0.0175]),
    turned('cap-back', 'cap', 'z', [[0, 0], [0, 0.013], [0.002, 0.013], [0.002, 0]], [0, 0.032, -0.0195]),
    box('string-drop', 'string', [0.003, 0, -0.001], [0.005, 0.03, 0.001]),
    box('string-tail', 'string', [0.003, 0, -0.001], [0.05, 0.002, 0.001]),
    box('string-bend', 'string', [0.048, 0, -0.001], [0.05, 0.002, 0.05]),
    turned('loop', 'string', 'y', [[0, 0.008], [0, 0.0105], [0.002, 0.0105], [0.002, 0.008], [0, 0.008]], [0.049, 0, 0.06]),
  ], { shell: 'plastic-red', string: 'cord-cotton', cap: 'plastic-white' })
  + h.inHand('yoyo', 'halves') + { voxelGrain: 0.002 },
]
