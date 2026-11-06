local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A cone standing on y from `y0`, `r` across at its base and `ht` tall.
local spike(id, slot, r, y0, ht, x, z) = turned(id, slot, 'y', [[0, 0], [0, r], [ht, 0]], [x, y0, z]);
// A flat triangle lying on y between `y0` and `y1`, `w` wide at (x, z), its point `len` out at angle `a` (radians).
local flatPoint(id, slot, x, z, a, len, w, y0, y1) =
  local c = std.cos(a), s = std.sin(a);
  h.prism(id, slot, 'y', [[z - c * w / 2, x + s * w / 2], [z + c * w / 2, x - s * w / 2], [z + s * len, x + c * len]], y0, y1);
// A straight cord of square section `t` lying on y between two [x, z] points.
local cord(id, slot, a, b, t, y, ht=null) =
  local dx = b[0] - a[0], dz = b[1] - a[1], l = std.sqrt(dx * dx + dz * dz), nx = -dz / l * t / 2, nz = dx / l * t / 2;
  h.prism(id, slot, 'y', [[a[1] + nz, a[0] + nx], [b[1] + nz, b[0] + nx], [b[1] - nz, b[0] - nx], [a[1] - nz, a[0] - nx]], y, y + (if ht == null then t else ht));
// A coil of cord lying flat at (x, z): a ring of radius `r` and thickness `t`.
local coil(id, slot, r, t, x, z, y0=0) = turned(id, slot, 'y', [[0, r - t], [0, r], [t, r], [t, r - t], [0, r - t]], [x, y0, z]);
// One caltrop at (x, z): three points lying on the ground at angle `a` and its turns, one spike standing up.
local caltrop(p, slot, x, z, a, size) = [
  flatPoint(p + '-leg' + i, slot, x, z, a + i * 2.0944, size, size * 0.45, 0, size * 0.35)
  for i in [0, 1, 2]
] + [spike(p + '-up', slot, size * 0.22, size * 0.3, size * 1.1, x, z)];
// A lump of glue at (x, z) with sharp bits sticking out every way: blades for glass, cones for teeth.
local glassLump(p, x, z, k) = [
  h.ball(p + '-glue', 'glue', 0.007 * k, x, 0.008 * k, z, 0.8),
  h.prism(p + '-a', 'shard', 'z', [[x - 0.006 * k, 0.006 * k], [x + 0.004 * k, 0.004 * k], [x + 0.002 * k, 0.03 * k]], z - 0.001, z + 0.001),
  h.prism(p + '-b', 'shard', 'z', [[x, 0.004 * k], [x + 0.026 * k, 0.003 * k], [x + 0.003 * k, 0.012 * k]], z - 0.0015, z + 0.0015),
  h.prism(p + '-c', 'shard', 'x', [[0.003 * k, z], [0.013 * k, z - 0.004 * k], [0.004 * k, z + 0.024 * k]], x - 0.001, x + 0.001),
  flatPoint(p + '-d', 'shard', x, z, 3.6, 0.024 * k, 0.012 * k, 0.001, 0.003),
  flatPoint(p + '-e', 'shard', x, z, 4.9, 0.02 * k, 0.01 * k, 0.004, 0.006),
];
local toothLump(p, x, z, k) = [
  h.ball(p + '-glue', 'glue', 0.009 * k, x, 0.008 * k, z, 0.8),
  spike(p + '-up', 'tooth', 0.004 * k, 0.012 * k, 0.018 * k, x, z),
  turned(p + '-e', 'tooth', 'x', [[0, 0], [0, 0.0035 * k], [0.022 * k, 0]], [x + 0.004 * k, 0.007 * k, z]),
  turned(p + '-w', 'tooth', 'x', [[0, 0], [0, 0.0035 * k], [-0.02 * k, 0]], [x - 0.004 * k, 0.006 * k, z]),
  turned(p + '-n', 'tooth', 'z', [[0, 0], [0, 0.0035 * k], [0.02 * k, 0]], [x, 0.006 * k, z + 0.004 * k]),
  turned(p + '-s', 'tooth', 'z', [[0, 0], [0, 0.0035 * k], [-0.021 * k, 0]], [x, 0.007 * k, z - 0.004 * k]),
];
[
  // A machete bolted flat to the output hub of a small two-stroke engine, which sits on a 30 cm square plank.
  // The blade reaches 55 cm out to +x at hip-low height; a cord from the throttle runs to a tripwire spool.
  h.compound('blade_trap', 6.5, [
    box('base', 'wood', [-0.16, 0, -0.15], [0.16, 0.025, 0.15]),
    box('block', 'engine', [-0.09, 0.025, -0.08], [0.06, 0.16, 0.08]),
    h.rod('head', 'metal', 0.028, -0.15, -0.09, 0.1),
  ] + [
    turned('fin' + i, 'metal', 'x', [[0, 0], [0, 0.045], [0.003, 0.045], [0.003, 0]], [-0.145 + i * 0.01, 0.1, 0])
    for i in std.range(0, 4)
  ] + [
    box('tank', 'tank', [-0.06, 0.16, 0.0], [0.05, 0.21, 0.075]),
    turned('starter', 'engine', 'z', [[0, 0], [0, 0.045], [0.02, 0.045], [0.02, 0]], [-0.02, 0.09, 0.08]),
    box('pull', 'grip', [-0.035, 0.08, 0.1], [-0.005, 0.1, 0.115]),
    disc('shaft', 'metal', 0.01, 0.16, 0.29, 0, -0.04),
    disc('hub', 'metal', 0.032, 0.27, 0.29, 0, -0.04),
    box('handle', 'grip', [-0.02, 0.29, -0.055], [0.13, 0.31, -0.025]),
    box('clamp-a', 'tape', [0.01, 0.288, -0.06], [0.03, 0.312, -0.02]),
    box('clamp-b', 'tape', [0.08, 0.288, -0.06], [0.1, 0.312, -0.02]),
    h.prism('blade', 'blade', 'y', [[-0.058, 0.13], [-0.022, 0.13], [-0.012, 0.48], [-0.04, 0.56], [-0.06, 0.5]], 0.297, 0.303),
    box('cable', 'cord', [0.06, 0.12, 0.05], [0.12, 0.124, 0.054]),
    disc('spool', 'cord', 0.022, 0.025, 0.05, 0.12, 0.08),
    disc('spool-flange', 'wood', 0.03, 0.05, 0.055, 0.12, 0.08),
  ], {
    wood: 'wood-pine', engine: 'plastic-red', metal: 'steel-grey', tank: 'plastic-white', grip: 'plastic-black',
    tape: 'tape-silver', blade: 'steel-bright', cord: 'cord-cotton',
  }) + { voxelGrain: 0.004 },

  // A nailboard 65 cm long and 25 cm wide: three pine boards on two battens, with a grid of nails driven up
  // through it so 4 cm of each point stands clear.
  h.compound('board_trap', 2, [
    box('batten-a', 'batten', [-0.29, 0, -0.125], [-0.24, 0.02, 0.125]),
    box('batten-b', 'batten', [0.24, 0, -0.125], [0.29, 0.02, 0.125]),
  ] + [
    box('board' + i, 'board', [-0.325, 0.02, -0.125 + i * 0.084], [0.325, 0.04, -0.125 + i * 0.084 + 0.08])
    for i in [0, 1, 2]
  ] + [
    disc('nail' + i + '-' + j, 'nail', 0.002, 0.04, 0.08, -0.25 + i * 0.1, -0.085 + j * 0.084)
    for i in std.range(0, 5)
    for j in [0, 1, 2]
  ], { batten: 'wood-oak', board: 'wood-pine', nail: 'steel-bright' }) + { voxelGrain: 0.004 },

  // A tin can 75 mm across and 110 mm tall bound with black tape, a nail through its lid for a striker, and a
  // pull string tied to the pin and coiled at its foot.
  h.compound('boobytrap', 0.65, [
    disc('can', 'can', 0.0375, 0, 0.11),
    turned('tape', 'tape', 'y', [[0.03, 0], [0.03, 0.0385], [0.075, 0.0385], [0.075, 0]]),
    disc('lid', 'lid', 0.034, 0.11, 0.114),
    disc('striker', 'nail', 0.003, 0.114, 0.13, 0.01, 0),
    disc('pin', 'nail', 0.0015, 0.114, 0.14, -0.012, 0.005),
    turned('pin-ring', 'nail', 'z', [[0, 0.006], [0, 0.009], [0.002, 0.009], [0.002, 0.006], [0, 0.006]], [-0.012, 0.148, 0.004]),
    box('string-up', 'cord', [-0.0135, 0.0, 0.039], [-0.0105, 0.148, 0.042]),
    box('string-top', 'cord', [-0.0135, 0.145, 0.006], [-0.0105, 0.148, 0.042]),
    coil('string-coil', 'cord', 0.035, 0.003, 0.03, 0.07),
  ], { can: 'steel-galvanised', tape: 'plastic-black', lid: 'steel-grey', nail: 'steel-bright', cord: 'cord-cotton' })
  + h.inHand('boobytrap', 'can') + { voxelGrain: 0.002 },

  // A roll of bubble wrap 20 cm wide and 40 mm across, its loose end unrolled 9 cm towards +z to show the
  // bubbles.
  h.compound('bubblewrap', 0.021, [
    h.tube('roll', 'film', 0.008, 0.02, -0.1, 0.1, 0.02, 0),
    box('sheet', 'film', [-0.1, 0, 0], [0.1, 0.002, 0.11]),
  ] + [
    disc('bubble' + i + '-' + j, 'bubble', 0.004, 0.002, 0.005, -0.09 + i * 0.012, 0.03 + j * 0.012)
    for i in std.range(0, 15)
    for j in std.range(0, 6)
  ] + [
    turned('roll-bubble' + i, 'bubble', 'x', [[0, 0], [0, 0.0215], [0.007, 0.0215], [0.007, 0]], [-0.095 + i * 0.012, 0.02, 0])
    for i in std.range(0, 15)
  ], { film: 'plastic-clear', bubble: 'plastic-frosted' }) + h.inHand('bubblewrap', 'roll') + { voxelGrain: 0.002 },

  // A loose handful of five iron caltrops, each about 35 mm across, scattered over a 10 cm patch with one
  // point of each standing up.
  h.compound('caltrops', 0.083, std.flattenArrays([
    caltrop('c1', 'iron', 0, 0, 0.3, 0.02),
    caltrop('c2', 'iron', 0.04, 0.025, 1.1, 0.02),
    caltrop('c3', 'iron', -0.038, 0.03, 2.0, 0.02),
    caltrop('c4', 'iron', 0.03, -0.035, 0.7, 0.02),
    caltrop('c5', 'iron', -0.035, -0.03, 1.6, 0.02),
  ]), { iron: 'iron-dull' }) + h.inHand('caltrops', 'c1-up') + { voxelGrain: 0.002 },

  // A handful of four glass caltrops: lumps of glue about 5 cm across with broken glass set in them edge out.
  h.compound('caltrops_glass', 0.04, std.flattenArrays([
    glassLump('g1', 0, 0, 1),
    glassLump('g2', 0.05, 0.03, 0.9),
    glassLump('g3', -0.045, 0.035, 0.95),
    glassLump('g4', 0.01, -0.05, 0.9),
  ]), { glue: 'resin-honey', shard: 'glass-clear' }) + h.inHand('caltrops_glass', 'g1-glue') + { voxelGrain: 0.002 },

  // A handful of four tooth caltrops: lumps of glue about 5 cm across bristling with long pointed teeth.
  h.compound('caltrops_teeth', 0.03, std.flattenArrays([
    toothLump('t1', 0, 0, 1),
    toothLump('t2', 0.05, 0.03, 0.9),
    toothLump('t3', -0.045, 0.035, 0.95),
    toothLump('t4', 0.01, -0.05, 0.9),
  ]), { glue: 'resin-honey', tooth: 'bone' }) + h.inHand('caltrops_teeth', 't1-glue') + { voxelGrain: 0.002 },

  // A pistol crossbow 55 cm long with a 50 cm prod, lashed to a short board, a bolt on the rail and a cord
  // tied to the trigger running back to a tripwire coil. The bow points to +z.
  h.compound('crossbow_trap', 1.3, [
    box('board', 'board', [-0.06, 0, -0.32], [0.06, 0.02, 0.2]),
    box('stock', 'stock', [-0.02, 0.02, -0.3], [0.02, 0.06, 0.26]),
    box('grip', 'stock', [-0.015, 0.0, -0.3], [0.015, 0.02, -0.2]),
  ] + [
    local arc = [[-0.25, 0.228], [-0.12, 0.262], [0, 0.272], [0.12, 0.262], [0.25, 0.228]];
    cord('prod' + i, 'prod', arc[i], arc[i + 1], 0.014, 0.04, 0.012)
    for i in [0, 1, 2, 3]
  ] + [
    cord('string-l', 'string', [-0.245, 0.228], [0, 0.07], 0.003, 0.06),
    cord('string-r', 'string', [0.245, 0.228], [0, 0.07], 0.003, 0.06),
    turned('bolt', 'bolt', 'z', [[0, 0], [0, 0.004], [0.3, 0.004], [0.3, 0]], [0, 0.065, -0.04]),
    turned('bolt-tip', 'tip', 'z', [[0, 0], [0, 0.005], [0.025, 0]], [0, 0.065, 0.26]),
    box('trigger', 'tip', [-0.004, 0.0, -0.17], [0.004, 0.02, -0.16]),
    box('lash-a', 'cord', [-0.062, 0, -0.26], [0.062, 0.064, -0.25]),
    box('lash-b', 'cord', [-0.062, 0, 0.12], [0.062, 0.064, 0.13]),
    cord('wire', 'cord', [0, -0.165], [0.07, -0.3], 0.003, 0.02),
    coil('wire-coil', 'cord', 0.035, 0.004, 0.1, -0.31),
  ], {
    board: 'wood-pine', stock: 'wood-walnut', prod: 'plastic-black', string: 'cord-olive', bolt: 'alu-bare',
    tip: 'steel-grey', cord: 'cord-cotton',
  }) + { voxelGrain: 0.004 },

  // A bounding fragmentation mine: an olive steel can 100 mm across and 120 mm tall with a pressure fuze on
  // top, its three prongs standing up, and a pull ring on the safety pin.
  h.compound('landmine', 3.3, [
    disc('body', 'body', 0.05, 0, 0.12),
    turned('rim', 'body', 'y', [[0.115, 0], [0.115, 0.052], [0.12, 0.052], [0.12, 0]]),
    disc('band', 'band', 0.0505, 0.07, 0.085),
    disc('fuze', 'fuze', 0.014, 0.12, 0.15),
    disc('cap', 'fuze', 0.009, 0.15, 0.156),
  ] + [
    disc('prong' + i, 'fuze', 0.0018, 0.156, 0.176, 0.005 * std.cos(i * 2.0944), 0.005 * std.sin(i * 2.0944))
    for i in [0, 1, 2]
  ] + [
    turned('pin-ring', 'ring', 'z', [[0, 0.008], [0, 0.011], [0.002, 0.011], [0.002, 0.008], [0, 0.008]], [0.028, 0.137, 0]),
    box('pin', 'ring', [0.01, 0.135, -0.001], [0.02, 0.138, 0.001]),
  ], { body: 'paint-olive', band: 'cloth-yellow', fuze: 'steel-grey', ring: 'steel-bright' })
  + h.inHand('landmine', 'body') + { voxelGrain: 0.004 },

  // A small-game snare kit laid out: an 80 cm pole with a wire noose at its tip, two 30 cm pointed stakes, a
  // wooden mallet and a hank of cord.
  h.compound('light_snare_kit', 0.67, [
    h.rod('pole', 'wood', 0.015, -0.4, 0.4, 0.015),
    coil('noose', 'wire', 0.035, 0.003, 0.43, 0),
    box('noose-tie', 'wire', [0.38, 0.0, -0.003], [0.4, 0.03, 0.003]),
    turned('stake-a', 'wood', 'x', [[0, 0], [0, 0.012], [0.25, 0.012], [0.3, 0]], [-0.3, 0.012, 0.07]),
    turned('stake-b', 'wood', 'x', [[0, 0], [0, 0.012], [0.25, 0.012], [0.3, 0]], [-0.3, 0.012, 0.1]),
    turned('mallet-handle', 'handle', 'x', [[0, 0], [0, 0.013], [0.32, 0.013], [0.32, 0]], [-0.3, 0.035, -0.1]),
    turned('mallet-head', 'wood', 'z', [[0, 0], [0, 0.035], [0.12, 0.035], [0.12, 0]], [0.055, 0.035, -0.16]),
    coil('hank', 'cord', 0.04, 0.008, 0.2, 0.12),
  ], { wood: 'wood-birch', handle: 'wood-oak', wire: 'steel-galvanised', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A double slam-fire pipe shotgun, two steel pipes 45 cm long strapped side by side on a pine board, each
  // with a capped breech and a sprung striker held back by a pin. A cord from the pins runs back to a tripwire
  // coil. The muzzles point to +z.
  h.compound('shotgun_trap', 2.7, [
    box('board', 'board', [-0.05, 0, -0.3], [0.05, 0.025, 0.25]),
  ] + std.flattenArrays([
    [
      turned('barrel' + s, 'pipe', 'z', [[0, 0], [0, 0.0135], [0.45, 0.0135], [0.45, 0]], [s * 0.015, 0.0385, -0.2]),
      turned('bore' + s, 'bore', 'z', [[0, 0], [0, 0.0095], [0.002, 0.0095], [0.002, 0]], [s * 0.015, 0.0385, 0.25]),
      turned('breech' + s, 'cap', 'z', [[0, 0], [0, 0.017], [0.04, 0.017], [0.04, 0]], [s * 0.015, 0.0385, -0.24]),
      turned('striker' + s, 'pipe', 'z', [[0, 0], [0, 0.004], [0.04, 0.004], [0.04, 0]], [s * 0.015, 0.0385, -0.28]),
      box('band' + s, 'rubber', [s * 0.015 - 0.006, 0.0, -0.29], [s * 0.015 + 0.006, 0.06, -0.24]),
    ]
    for s in [-1, 1]
  ]) + [
    box('clamp-a', 'tape', [-0.032, 0.0, -0.1], [0.032, 0.055, -0.07]),
    box('clamp-b', 'tape', [-0.032, 0.0, 0.12], [0.032, 0.055, 0.15]),
    box('pins', 'pipe', [-0.035, 0.05, -0.268], [0.035, 0.054, -0.264]),
    cord('wire', 'cord', [0.035, -0.266], [0.08, -0.33], 0.003, 0.05),
    coil('wire-coil', 'cord', 0.035, 0.004, 0.1, -0.34),
  ], { board: 'wood-pine', pipe: 'steel-grey', bore: 'void-black', cap: 'steel-galvanised', rubber: 'rubber-offblack', tape: 'tape-silver', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A tripwire kit: a 70 mm hank of thin cord with a screw eye tied to each end, lying flat.
  h.compound('tripwire', 0.0084, [
    coil('hank', 'cord', 0.035, 0.006, 0, 0),
    coil('hank-b', 'cord', 0.03, 0.004, 0.002, 0.002, 0.004),
    cord('tail-a', 'cord', [0.03, 0.015], [0.06, 0.03], 0.0025, 0),
    cord('tail-b', 'cord', [0.025, -0.02], [0.06, -0.035], 0.0025, 0),
    coil('eye-a', 'eye', 0.006, 0.002, 0.066, 0.033),
    turned('screw-a', 'eye', 'x', [[0, 0], [0, 0.0018], [0.028, 0.0018], [0.034, 0]], [0.072, 0.002, 0.033]),
    coil('eye-b', 'eye', 0.006, 0.002, 0.066, -0.038),
    turned('screw-b', 'eye', 'x', [[0, 0], [0, 0.0018], [0.028, 0.0018], [0.034, 0]], [0.072, 0.002, -0.038]),
  ], { cord: 'cord-cotton', eye: 'brass-polished' }) + h.inHand('tripwire', 'hank') + { voxelGrain: 0.002 },
]
