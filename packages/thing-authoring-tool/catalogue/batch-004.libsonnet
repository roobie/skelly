local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
// A short rod standing on y from `y0`, `height` tall.
local post(id, slot, x, y0, z, radius, height) = turned(id, slot, 'y', [[0, 0], [0, radius], [height, radius], [height, 0]], [x, y0, z]);
// A small thing held upright in the hand by its named solid, as the medicine bottles in food-medical.libsonnet are.
local inHand(id, solid) = { handling: { part: id, solid: solid, fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 } };
// A medicine bottle of the vessel family: a body, a shoulder up to a neck, a cap and a paper label band.
local bottle(id, massKg, radius, height, neckRadius, capRadius, capHeight, finish, dimensions={}) = h.item(id, 'vessel', massKg, {
  radius: radius, height: height, shoulderHeight: 0.005, neckRadius: neckRadius, neckHeight: 0.005,
  capRadius: capRadius, capHeight: capHeight, rimHeight: 0.001, bandHeight: height * 0.6, bandInset: 0.0004,
} + dimensions, finish) + inHand(id, 'body') + { voxelGrain: 0.002 };
// One caster: a steel plate and stem over a rubber wheel turning on x, wheel resting on the floor.
local caster(i, x, z) = [
  box('caster-plate-%d' % i, 'caster', [x - 0.04, 0.11, z - 0.04], [x + 0.04, 0.12, z + 0.04]),
  post('caster-stem-%d' % i, 'caster', x, 0.07, z, 0.012, 0.04),
  turned('caster-wheel-%d' % i, 'wheel', 'x', [[0, 0], [0, 0.04], [0.03, 0.04], [0.03, 0]], [x - 0.015, 0.04, z]),
];
[
  // A one-door commercial reach-in fridge, 0.74 m wide, 0.82 m deep and 2.15 m tall on casters, with the
  // compressor in a louvred housing on top and the door on +z.
  h.compound('heavy_duty_fridge', 300, std.flattenArrays([
    caster(i, [-1, 1, -1, 1][i] * 0.30, [-1, -1, 1, 1][i] * 0.33)
    for i in std.range(0, 3)
  ]) + [
    box('body', 'body', [-0.37, 0.12, -0.41], [0.37, 1.93, 0.36]),
    box('seal', 'seal', [-0.368, 0.15, 0.36], [0.368, 1.915, 0.37]),
    box('door', 'door', [-0.36, 0.16, 0.36], [0.36, 1.905, 0.41]),
    box('handle', 'handle', [-0.33, 0.85, 0.41], [-0.30, 1.40, 0.44]),
    box('hinge-a', 'handle', [0.355, 0.24, 0.37], [0.375, 0.34, 0.41]),
    box('hinge-b', 'handle', [0.355, 1.73, 0.37], [0.375, 1.83, 0.41]),
    box('housing', 'body', [-0.37, 1.93, -0.41], [0.37, 2.15, 0.41]),
    box('grille', 'grille', [-0.10, 1.96, 0.41], [0.34, 2.12, 0.415]),
    box('panel', 'panel', [-0.34, 2.00, 0.41], [-0.16, 2.08, 0.42]),
    box('readout', 'readout', [-0.31, 2.02, 0.42], [-0.22, 2.06, 0.425]),
  ] + [
    box('louvre-%d' % k, 'body', [-0.10, 1.97 + k * 0.03, 0.415], [0.34, 1.985 + k * 0.03, 0.43])
    for k in std.range(0, 4)
  ], { body: 'steel-stainless', door: 'steel-stainless', seal: 'rubber-black', handle: 'steel-grey', grille: 'plastic-black', panel: 'plastic-black', readout: 'plastic-clear-red', caster: 'steel-grey', wheel: 'rubber-black' }),

  // A cube minifridge, 0.48 m wide, 0.50 m deep and 0.84 m tall, door on +z and the condenser coil on its back.
  h.compound('minifridge', 25, [
    post('foot-%d' % i, 'foot', [-1, 1, -1, 1][i] * 0.21, 0, [-1, -1, 1, 1][i] * 0.22, 0.015, 0.015)
    for i in std.range(0, 3)
  ] + [
    box('body', 'body', [-0.24, 0.015, -0.25], [0.24, 0.84, 0.21]),
    box('seal', 'seal', [-0.235, 0.085, 0.21], [0.235, 0.835, 0.22]),
    box('door', 'door', [-0.24, 0.09, 0.22], [0.24, 0.84, 0.25]),
    box('vent', 'vent', [-0.22, 0.025, 0.21], [0.22, 0.075, 0.225]),
    box('handle', 'handle', [0.19, 0.45, 0.25], [0.215, 0.76, 0.27]),
    box('coil-side-a', 'coil', [-0.20, 0.10, -0.265], [-0.19, 0.76, -0.25]),
    box('coil-side-b', 'coil', [0.19, 0.10, -0.265], [0.20, 0.76, -0.25]),
  ] + [
    turned('coil-%d' % k, 'coil', 'x', [[0, 0], [0, 0.005], [0.40, 0.005], [0.40, 0]], [-0.20, 0.12 + k * 0.06, -0.26])
    for k in std.range(0, 10)
  ] + [
    box('vent-slat-%d' % k, 'body', [-0.21 + k * 0.035, 0.03, 0.225], [-0.195 + k * 0.035, 0.07, 0.23])
    for k in std.range(0, 11)
  ], { body: 'paint-charcoal', door: 'plastic-black', vent: 'plastic-grey', seal: 'rubber-black', handle: 'steel-stainless', coil: 'steel-grey', foot: 'rubber-black' }),

  // A 100-tablet over-the-counter bottle, 44 mm across and 92 mm tall with its push-and-turn cap.
  bottle('acetaminophen', 0.063, 0.022, 0.07, 0.017, 0.02, 0.012,
         { body: 'plastic-white', label: 'plastic-yellow', cap: 'plastic-red' }),

  // A pharmacy prescription vial, 33 mm across and 70 mm tall, amber with a white cap.
  bottle('prescription_stimulant', 0.034, 0.016, 0.058, 0.016, 0.0168, 0.011,
         { body: 'fuel-amber', label: 'paper-white', cap: 'plastic-white' },
         { shoulderHeight: 0.001, neckHeight: 0.001, bandHeight: 0.03 }),

  // A tablet carton, 90 mm wide, 60 mm tall and 22 mm deep, with a coloured band and a tuck flap on top.
  h.item('antifungal', 'carton', 0.04, {
    width: 0.09, height: 0.058, depth: 0.022, lidHeight: 0.002, bandHeight: 0.02, bandInset: 0.0004,
    handleHeight: 0, handleWidth: 0.01, handleDepth: 0.01, handleWall: 0.002,
  }, { body: 'paper-white', label: 'plastic-green', cap: 'paper-white' }) + inHand('antifungal', 'body') + { voxelGrain: 0.002 },

  // A blister card of ten oblong tablets, 100 mm by 45 mm and 6 mm thick at the bubbles, lying flat.
  h.compound('antihistamine', 0.0086, [
    box('card', 'foil', [-0.05, 0, -0.0225], [0.05, 0.002, 0.0225]),
  ] + [
    box('bubble-%d-%d' % [i, j], 'bubble', [-0.042 + i * 0.018, 0.002, [-0.014, 0.006][j]], [-0.032 + i * 0.018, 0.006, [-0.006, 0.014][j]])
    for i in std.range(0, 4)
    for j in std.range(0, 1)
  ], { foil: 'alu-bare', bubble: 'plastic-clear-red' }) + inHand('antihistamine', 'card') + { voxelGrain: 0.002 },

  // A squat wide-mouthed tub of livestock wormer tablets, 64 mm across and 70 mm tall with its lid.
  bottle('antiparasitic', 0.09, 0.032, 0.05, 0.029, 0.031, 0.014,
         { body: 'plastic-white', label: 'paint-olive', cap: 'plastic-green' },
         { shoulderHeight: 0.003, neckHeight: 0.004 }),

  // A shaker canister of wound powder, 42 mm across and 90 mm tall, with a sifter cap pierced on top.
  h.compound('antiseptic_powder', 0.055, [
    turned('body', 'body', 'y', [[0, 0], [0, 0.02], [0.075, 0.02], [0.075, 0]]),
    turned('label', 'label', 'y', [[0.012, 0], [0.012, 0.0204], [0.062, 0.0204], [0.062, 0]]),
    turned('cap', 'cap', 'y', [[0.074, 0], [0.074, 0.021], [0.086, 0.021], [0.09, 0.017], [0.09, 0]]),
  ] + [
    box('hole-%d' % k, 'hole', [[-0.006, 0.002, -0.002][k], 0.09, [-0.002, -0.002, 0.004][k]], [[-0.004, 0.004, 0][k], 0.092, [0, 0, 0.006][k]])
    for k in std.range(0, 2)
  ], { body: 'plastic-yellow', label: 'paper-white', cap: 'plastic-white', hole: 'plastic-black' }) + inHand('antiseptic_powder', 'body') + { voxelGrain: 0.002 },
]
