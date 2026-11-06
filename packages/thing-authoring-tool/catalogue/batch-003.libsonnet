local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
// Prism profiles here are written in either winding; the family wants counterclockwise.
local prism(id, slot, axis, profile, start, end) =
  local n = std.length(profile);
  local area = std.sum([profile[i][0] * profile[(i + 1) % n][1] - profile[(i + 1) % n][0] * profile[i][1] for i in std.range(0, n - 1)]);
  h.prism(id, slot, axis, if area > 0 then profile else std.reverse(profile), start, end);
// A short rod or button standing on y from `y0`, `height` tall.
local post(id, slot, x, y0, z, radius, height) = turned(id, slot, 'y', [[0, 0], [0, radius], [height, radius], [height, 0]], [x, y0, z]);
// A dial or knob facing +z from a front face at `z0`.
local dial(id, slot, x, y, z0, radius, depth) = turned(id, slot, 'z', [[0, 0], [0, radius], [depth, radius], [depth, 0]], [x, y, z0]);
// Four rubber feet under a cabinet's corners.
local feet(hw, hd) = [
  post('foot-%d' % i, 'foot', [-1, 1, -1, 1][i] * (hw - 0.04), 0, [-1, -1, 1, 1][i] * (hd - 0.04), 0.02, 0.02)
  for i in std.range(0, 3)
];
// An upright shop cooler, `width` by `depth` by `height`, with `doors` glass doors on its +z face, a
// grille under them and a lit header above. `stock(level, hw, front)` fills each shelf level.
local cooler(id, massKg, width, depth, height, doors, levels, stock, finish) =
  local hw = width / 2;
  local hd = depth / 2;
  local front = hd - 0.04;
  local top = height - 0.17;
  local dw = width / doors;
  h.compound(id, massKg, [
    box('base', 'body', [-hw, 0, -hd], [hw, 0.19, front]),
    box('grille', 'grille', [-hw + 0.02, 0.02, front], [hw - 0.02, 0.13, front + 0.01]),
    box('back', 'body', [-hw, 0.19, -hd], [hw, top, -hd + 0.04]),
    box('side-a', 'body', [-hw, 0.19, -hd], [-hw + 0.04, top, front]),
    box('side-b', 'body', [hw - 0.04, 0.19, -hd], [hw, top, front]),
    box('header', 'body', [-hw, top, -hd], [hw, height, front]),
    box('sign', 'sign', [-hw + 0.03, top + 0.03, front], [hw - 0.03, height - 0.03, front + 0.01]),
  ] + std.flattenArrays([
    local x0 = -hw + i * dw;
    local hx = if i % 2 == 0 then x0 + dw - 0.045 else x0 + 0.015;
    [
      box('stile-a-%d' % i, 'frame', [x0, 0.15, front], [x0 + 0.05, top, hd]),
      box('stile-b-%d' % i, 'frame', [x0 + dw - 0.05, 0.15, front], [x0 + dw, top, hd]),
      box('rail-a-%d' % i, 'frame', [x0, 0.15, front], [x0 + dw, 0.21, hd]),
      box('rail-b-%d' % i, 'frame', [x0, top - 0.06, front], [x0 + dw, top, hd]),
      box('glass-%d' % i, 'glass', [x0 + 0.05, 0.21, front + 0.015], [x0 + dw - 0.05, top - 0.06, front + 0.025]),
      box('handle-%d' % i, 'handle', [hx, (top + 0.15) / 2 - 0.25, hd], [hx + 0.03, (top + 0.15) / 2 + 0.25, hd + 0.03]),
    ]
    for i in std.range(0, doors - 1)
  ]) + [
    box('shelf-%d' % j, 'shelf', [-hw + 0.04, levels[j] - 0.015, -hd + 0.04], [hw - 0.04, levels[j], front - 0.02])
    for j in std.range(1, std.length(levels) - 1)
  ] + std.flattenArrays([stock(levels[j], hw, front) for j in std.range(0, std.length(levels) - 1)]), finish);
// A row of drink bottles standing on a shelf at `y`, alternating three colours.
local bottles(y, hw, front) = [
  turned('bottle-%d-%d' % [std.floor(y * 100), k], ['bottle-a', 'bottle-b', 'bottle-c'][k % 3], 'y',
         [[0, 0], [0, 0.034], [0.17, 0.034], [0.21, 0.012], [0.25, 0.012], [0.25, 0]],
         [-hw + 0.09 + k * 0.085, y, front - 0.09])
  for k in std.range(0, std.floor((2 * hw - 0.18) / 0.085))
];
// A row of frozen food cartons standing on a shelf at `y`.
local cartons(y, hw, front) = [
  box('carton-%d-%d' % [std.floor(y * 100), k], ['carton-a', 'carton-b'][k % 2],
      [-hw + 0.06 + k * 0.125, y, front - 0.30], [-hw + 0.17 + k * 0.125, y + 0.17, front - 0.05])
  for k in std.range(0, std.floor((2 * hw - 0.23) / 0.125))
];
[
  // An open-frame camp generator, 0.45 m long, 0.38 m wide and 0.42 m tall: a tube frame round the engine
  // and alternator, the fuel tank on top and the outlet panel facing +z.
  h.compound('portable_generator', 37, [
    box('rail-a', 'frame', [-0.227, 0, -0.19], [0.227, 0.022, -0.168]),
    box('rail-b', 'frame', [-0.227, 0, 0.168], [0.227, 0.022, 0.19]),
    box('foot-a', 'frame', [-0.227, 0, -0.19], [-0.205, 0.022, 0.19]),
    box('foot-b', 'frame', [0.205, 0, -0.19], [0.227, 0.022, 0.19]),
    box('post-a', 'frame', [-0.227, 0.022, -0.19], [-0.205, 0.36, -0.168]),
    box('post-b', 'frame', [0.205, 0.022, -0.19], [0.227, 0.36, -0.168]),
    box('post-c', 'frame', [-0.227, 0.022, 0.168], [-0.205, 0.36, 0.19]),
    box('post-d', 'frame', [0.205, 0.022, 0.168], [0.227, 0.36, 0.19]),
    box('top-a', 'frame', [-0.227, 0.34, -0.19], [0.227, 0.362, -0.168]),
    box('top-b', 'frame', [-0.227, 0.34, 0.168], [0.227, 0.362, 0.19]),
    box('engine', 'engine', [-0.18, 0.03, -0.13], [0.03, 0.26, 0.12]),
    box('head', 'metal', [-0.13, 0.12, -0.17], [-0.02, 0.22, -0.13]),
    turned('recoil', 'engine', 'x', [[0, 0], [0, 0.08], [0.025, 0.08], [0.025, 0]], [-0.205, 0.15, -0.01]),
    box('pull', 'black', [-0.225, 0.22, 0.02], [-0.205, 0.24, 0.09]),
    turned('alternator', 'alternator', 'x', [[0, 0], [0, 0.10], [0.17, 0.10], [0.17, 0]], [0.03, 0.13, 0]),
    box('panel', 'black', [0.04, 0.05, 0.11], [0.20, 0.25, 0.13]),
    dial('outlet-a', 'outlet', 0.08, 0.19, 0.13, 0.022, 0.01),
    dial('outlet-b', 'outlet', 0.15, 0.19, 0.13, 0.022, 0.01),
    box('switch', 'switch', [0.07, 0.09, 0.13], [0.10, 0.12, 0.145]),
    box('muffler', 'metal', [0.05, 0.25, -0.15], [0.20, 0.31, -0.06]),
    prism('tank', 'tank', 'x', [[0.31, -0.165], [0.31, 0.165], [0.39, 0.16], [0.42, 0.12], [0.42, -0.12], [0.39, -0.16]], -0.20, 0.20),
    post('cap', 'black', -0.08, 0.42, 0, 0.03, 0.02),
  ], { frame: 'paint-charcoal', engine: 'paint-red', metal: 'alu-bare', black: 'plastic-black', alternator: 'steel-grey', outlet: 'plastic-grey', switch: 'plastic-red', tank: 'paint-red' }),

  // An upright household freezer, 0.6 m wide, 0.64 m deep and 0.93 m tall, one door on +z.
  h.compound('apartment_freezer', 110, feet(0.30, 0.32) + [
    box('body', 'body', [-0.30, 0.02, -0.32], [0.30, 0.928, 0.28]),
    box('grille', 'grille', [-0.28, 0.03, 0.28], [0.28, 0.10, 0.30]),
    box('seal', 'seal', [-0.295, 0.105, 0.28], [0.295, 0.92, 0.29]),
    box('door', 'body', [-0.30, 0.11, 0.29], [0.30, 0.928, 0.32]),
    box('handle', 'handle', [0.23, 0.55, 0.32], [0.26, 0.88, 0.345]),
    dial('dial', 'grille', -0.20, 0.07, 0.30, 0.018, 0.01),
  ], { body: 'paint-white', grille: 'plastic-grey', seal: 'rubber-black', handle: 'plastic-grey', foot: 'rubber-black' }),

  // A household fridge with the freezer above, 0.6 m wide, 0.67 m deep and 1.5 m tall, doors on +z.
  h.compound('apartment_fridge', 58, feet(0.30, 0.335) + [
    box('body', 'body', [-0.30, 0.02, -0.335], [0.30, 1.495, 0.30]),
    box('grille', 'grille', [-0.28, 0.03, 0.30], [0.28, 0.10, 0.31]),
    box('seal', 'seal', [-0.295, 0.105, 0.30], [0.295, 1.49, 0.31]),
    box('door', 'door', [-0.30, 0.11, 0.31], [0.30, 1.02, 0.335]),
    box('freezer-door', 'door', [-0.30, 1.035, 0.31], [0.30, 1.495, 0.335]),
    box('handle-a', 'handle', [0.23, 0.62, 0.335], [0.26, 0.98, 0.36]),
    box('handle-b', 'handle', [0.23, 1.06, 0.335], [0.26, 1.26, 0.36]),
  ], { body: 'steel-grey', door: 'steel-stainless', grille: 'plastic-black', seal: 'rubber-black', handle: 'plastic-black', foot: 'rubber-black' }),

  // A shop chest freezer with two sliding glass lids, 1.86 m long, 0.66 m deep and 0.85 m tall, stock inside.
  h.compound('display_freezer', 150, [
    box('plinth', 'grille', [-0.90, 0, -0.31], [0.90, 0.08, 0.31]),
    box('floor', 'body', [-0.9275, 0.08, -0.33], [0.9275, 0.36, 0.33]),
    box('wall-a', 'body', [-0.9275, 0.36, 0.28], [0.9275, 0.80, 0.33]),
    box('wall-b', 'body', [-0.9275, 0.36, -0.33], [0.9275, 0.80, -0.28]),
    box('wall-c', 'body', [-0.9275, 0.36, -0.28], [-0.8775, 0.80, 0.28]),
    box('wall-d', 'body', [0.8775, 0.36, -0.28], [0.9275, 0.80, 0.28]),
    box('rim-a', 'rim', [-0.9275, 0.80, 0.28], [0.9275, 0.82, 0.33]),
    box('rim-b', 'rim', [-0.9275, 0.80, -0.33], [0.9275, 0.82, -0.28]),
    box('rim-c', 'rim', [-0.9275, 0.80, -0.28], [-0.8775, 0.82, 0.28]),
    box('rim-d', 'rim', [0.8775, 0.80, -0.28], [0.9275, 0.82, 0.28]),
    box('lid-a', 'glass', [-0.8775, 0.82, -0.28], [0.03, 0.835, 0.28]),
    box('lid-b', 'glass', [-0.03, 0.835, -0.28], [0.8775, 0.85, 0.28]),
    box('lid-frame-a', 'rim', [0.0, 0.82, -0.28], [0.03, 0.838, 0.28]),
    box('lid-frame-b', 'rim', [-0.03, 0.835, -0.28], [0.0, 0.853, 0.28]),
    box('grip-a', 'grille', [-0.06, 0.835, -0.08], [-0.03, 0.85, 0.08]),
    box('grip-b', 'grille', [0.03, 0.85, -0.08], [0.06, 0.865, 0.08]),
    box('vent', 'grille', [0.60, 0.12, 0.33], [0.88, 0.30, 0.335]),
  ] + [
    box('pack-%d-%d' % [i, j], ['pack-a', 'pack-b', 'pack-c'][(i + j) % 3],
        [-0.85 + i * 0.21, 0.36, -0.25 + j * 0.26], [-0.66 + i * 0.21, 0.36 + 0.10 + 0.05 * ((i + j) % 2), -0.02 + j * 0.26])
    for i in std.range(0, 7)
    for j in std.range(0, 1)
  ], { body: 'paint-white', grille: 'plastic-grey', rim: 'alu-bare', glass: 'glass-clear', 'pack-a': 'paperboard-tan', 'pack-b': 'plastic-blue', 'pack-c': 'paint-cream' }),

  // A deli display case, 0.92 m wide, 0.76 m deep and 1.25 m tall: a steel counter base, an upright glass
  // front with a sloped top edge over three tiers of trays and sliding glass doors at the back for the server. Every face sits on
  // the 1 cm voxel grain, so the glass stays clean.
  h.compound('display_fridge', 160, [
    box('base', 'base', [-0.46, 0, -0.38], [0.46, 0.74, 0.37]),
    box('kick', 'grille', [-0.44, 0.02, 0.37], [0.44, 0.11, 0.38]),
    box('rail', 'trim', [-0.46, 0.74, -0.38], [0.46, 0.76, 0.38]),
    // An upright front pane and one 45-degree pane up to a flat glass top.
    box('front', 'glass', [-0.44, 0.76, 0.36], [0.44, 1.10, 0.38]),
    prism('slope', 'glass', 'x', [[1.10, 0.38], [1.10, 0.36], [1.23, 0.23], [1.25, 0.23]], -0.44, 0.44),
    box('roof', 'glass', [-0.44, 1.23, -0.38], [0.44, 1.25, 0.23]),
    box('doors', 'glass', [-0.44, 0.76, -0.38], [0.44, 1.23, -0.36]),
  ] + [
    prism('end-%d' % i, 'glass', 'x', [[0.76, -0.38], [0.76, 0.38], [1.10, 0.38], [1.25, 0.23], [1.25, -0.38]], [-0.46, 0.44][i], [-0.44, 0.46][i])
    for i in [0, 1]
  ] + [
    box('shelf-a', 'shelf', [-0.44, 0.93, -0.36], [0.44, 0.94, 0.14]),
    box('shelf-b', 'shelf', [-0.44, 1.08, -0.36], [0.44, 1.09, -0.06]),
  ] + [
    box('tray-%d-%d' % [t, k], ['tray-a', 'tray-b', 'tray-c'][(t + k) % 3],
        [-0.42 + k * 0.29, [0.76, 0.94, 1.09][t], [-0.06, -0.22, -0.34][t]],
        [-0.16 + k * 0.29, [0.76, 0.94, 1.09][t] + 0.05, [0.30, 0.12, -0.08][t]])
    for t in std.range(0, 2)
    for k in std.range(0, 2)
  ], { base: 'steel-galvanised', grille: 'plastic-black', trim: 'alu-bare', shelf: 'steel-grey', glass: 'glass-clear', 'tray-a': 'paint-cream', 'tray-b': 'paint-terracotta', 'tray-c': 'plastic-green' }),

  // A single glass-door shop freezer, 0.62 m wide, 0.66 m deep and 1.86 m tall, cartons on wire shelves.
  cooler('glass_freezer', 160, 0.62, 0.66, 1.855, 1, [0.19, 0.55, 0.92, 1.29], cartons,
         { body: 'paint-white', grille: 'plastic-black', sign: 'plastic-blue', frame: 'paint-charcoal', glass: 'glass-clear', handle: 'steel-grey', shelf: 'steel-grey', 'carton-a': 'paperboard-tan', 'carton-b': 'plastic-white' }),

  // A single glass-door drinks fridge, 0.62 m wide, 0.62 m deep and 1.98 m tall, bottles on its shelves.
  cooler('glass_fridge', 130, 0.62, 0.62, 1.98, 1, [0.19, 0.52, 0.86, 1.20, 1.54], bottles,
         { body: 'paint-charcoal', grille: 'plastic-black', sign: 'plastic-red', frame: 'alu-bare', glass: 'glass-clear', handle: 'alu-bare', shelf: 'steel-grey', 'bottle-a': 'plastic-green', 'bottle-b': 'plastic-red', 'bottle-c': 'fuel-amber' }),

  // A two-door drinks fridge, 1.1 m wide, 0.7 m deep and 2 m tall, bottles on its shelves.
  cooler('glass_fridge_double', 230, 1.10, 0.70, 1.998, 2, [0.19, 0.52, 0.86, 1.20, 1.54], bottles,
         { body: 'paint-charcoal', grille: 'plastic-black', sign: 'plastic-red', frame: 'alu-bare', glass: 'glass-clear', handle: 'alu-bare', shelf: 'steel-grey', 'bottle-a': 'plastic-green', 'bottle-b': 'plastic-red', 'bottle-c': 'fuel-amber' }),
]
