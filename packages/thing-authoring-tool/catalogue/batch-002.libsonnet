local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local prism = h.prism;
// A rod or button standing on y from `y0`, `height` tall.
local post(id, slot, x, y0, z, radius, height) = turned(id, slot, 'y', [[0, 0], [0, radius], [height, radius], [height, 0]], [x, y0, z]);
// A wheel or knob facing +z from a face at `z0`.
local dial(id, slot, x, y, z0, radius, depth) = turned(id, slot, 'z', [[0, 0], [0, radius], [depth, radius], [depth, 0]], [x, y, z0]);
// A wheel or knob facing +x from a face at `x0`.
local sideDial(id, slot, x0, y, z, radius, depth) = turned(id, slot, 'x', [[0, 0], [0, radius], [depth, radius], [depth, 0]], [x0, y, z]);
[
  // A floor thickness planer, 1.21 m long with its infeed and outfeed tables out, 1.05 m tall: a closed
  // stand, the cast bed, four posts carrying the cutter head and the height crank on top.
  h.compound('planer', 320, [
    box('stand', 'stand', [-0.28, 0, -0.26], [0.28, 0.55, 0.26]),
    box('plinth', 'stand', [-0.31, 0, -0.29], [0.31, 0.04, 0.29]),
    box('bed', 'table', [-0.30, 0.55, -0.25], [0.30, 0.62, 0.25]),
    box('infeed', 'table', [-0.605, 0.595, -0.20], [-0.30, 0.615, 0.20]),
    box('outfeed', 'table', [0.30, 0.595, -0.20], [0.605, 0.615, 0.20]),
    turned('infeed-roller', 'steel', 'z', [[0, 0], [0, 0.015], [0.40, 0.015], [0.40, 0]], [-0.58, 0.63, -0.20]),
    turned('outfeed-roller', 'steel', 'z', [[0, 0], [0, 0.015], [0.40, 0.015], [0.40, 0]], [0.58, 0.63, -0.20]),
    post('post-a', 'steel', -0.22, 0.62, -0.22, 0.025, 0.20),
    post('post-b', 'steel', 0.22, 0.62, -0.22, 0.025, 0.20),
    post('post-c', 'steel', -0.22, 0.62, 0.22, 0.025, 0.20),
    post('post-d', 'steel', 0.22, 0.62, 0.22, 0.025, 0.20),
    box('head', 'head', [-0.26, 0.80, -0.27], [0.26, 0.98, 0.27]),
    box('motor', 'motor', [-0.14, 0.82, -0.40], [0.14, 0.97, -0.27]),
    turned('dust-port', 'head', 'x', [[0, 0], [0, 0.055], [0.10, 0.055], [0.10, 0]], [0.26, 0.90, 0]),
    post('crank-hub', 'steel', 0, 0.98, 0, 0.03, 0.03),
    turned('crank-wheel', 'steel', 'y', [[0, 0.09], [0, 0.12], [0.02, 0.12], [0.02, 0.09]], [0, 1.01, 0]),
    box('crank-spoke', 'steel', [-0.10, 1.01, -0.01], [0.10, 1.03, 0.01]),
    post('crank-handle', 'handle', 0.10, 1.03, 0, 0.012, 0.03),
    box('switch', 'switch', [-0.08, 0.40, 0.26], [0.08, 0.50, 0.29]),
    box('button', 'button', [-0.03, 0.43, 0.29], [0.03, 0.47, 0.30]),
  ], { stand: 'paint-charcoal', table: 'iron-cast', steel: 'steel-grey', head: 'paint-cream', motor: 'paint-charcoal', handle: 'plastic-black', switch: 'plastic-yellow', button: 'plastic-red' }),

  // A heavy floor router table, 1.47 m long and 0.7 m deep, 0.98 m tall to the fence: a cast top on a
  // steel cabinet, an aluminium insert plate with the bit through it, a fence with its dust hood, and
  // the router motor hung under the plate behind the cabinet doors.
  h.compound('router_table', 400, [
    box('cabinet', 'cabinet', [-0.55, 0.06, -0.30], [0.55, 0.86, 0.30]),
    box('foot-a', 'foot', [-0.53, 0, -0.28], [-0.45, 0.06, 0.28]),
    box('foot-b', 'foot', [0.45, 0, -0.28], [0.53, 0.06, 0.28]),
    box('door-a', 'door', [-0.52, 0.12, 0.30], [-0.01, 0.78, 0.31]),
    box('door-b', 'door', [0.01, 0.12, 0.30], [0.52, 0.78, 0.31]),
    box('pull-a', 'steel', [-0.06, 0.40, 0.31], [-0.04, 0.55, 0.33]),
    box('pull-b', 'steel', [0.04, 0.40, 0.31], [0.06, 0.55, 0.33]),
    box('top', 'top', [-0.735, 0.86, -0.35], [0.735, 0.90, 0.35]),
    box('plate', 'plate', [-0.15, 0.90, -0.11], [0.15, 0.903, 0.11]),
    post('bit', 'steel', 0, 0.903, 0, 0.014, 0.035),
    box('mitre-track', 'plate', [-0.735, 0.90, 0.20], [0.735, 0.903, 0.22]),
    box('fence', 'plate', [-0.60, 0.90, -0.12], [0.60, 0.98, -0.08]),
    box('fence-gap', 'steel', [-0.05, 0.90, -0.08], [0.05, 0.93, -0.075]),
    box('fence-clamp-a', 'steel', [-0.60, 0.86, -0.12], [-0.56, 0.98, 0.36]),
    box('fence-clamp-b', 'steel', [0.56, 0.86, -0.12], [0.60, 0.98, 0.36]),
    box('hood', 'hood', [-0.08, 0.90, -0.20], [0.08, 0.98, -0.12]),
    turned('dust-port', 'hood', 'z', [[0, 0], [0, 0.05], [0.10, 0.05], [0.10, 0]], [0, 0.94, -0.30]),
    box('switch', 'switch', [0.30, 0.78, 0.30], [0.42, 0.84, 0.34]),
    box('paddle', 'paddle', [0.33, 0.79, 0.34], [0.39, 0.83, 0.36]),
  ], { cabinet: 'paint-police-blue', foot: 'steel-grey', door: 'paint-police-blue', steel: 'steel-grey', top: 'iron-cast', plate: 'alu-bare', hood: 'plastic-black', switch: 'plastic-yellow', paddle: 'plastic-red' }),

  // A cross-legged work light stand, 1.7 m tall: four legs spread 0.9 m, a pole with its locking collar,
  // and a 0.28 m flood head on a yoke facing +z, its fins at the back.
  h.compound('standing_floodlight', 4.5, [
    prism('leg-a', 'frame', 'z', [[-0.45, 0], [-0.43, 0], [0, 0.55], [-0.02, 0.55]], -0.01, 0.01),
    prism('leg-b', 'frame', 'z', [[0.43, 0], [0.45, 0], [0.02, 0.55], [0, 0.55]], -0.01, 0.01),
    prism('leg-c', 'frame', 'x', [[0.55, -0.02], [0.55, 0], [0, -0.43], [0, -0.45]], -0.01, 0.01),
    prism('leg-d', 'frame', 'x', [[0.55, 0], [0.55, 0.02], [0, 0.45], [0, 0.43]], -0.01, 0.01),
  ] + [
    box('foot-%d' % i, 'foot', [[-0.47, 0.41, -0.03, -0.03][i], 0, [-0.03, -0.03, -0.47, 0.41][i]], [[-0.41, 0.47, 0.03, 0.03][i], 0.015, [0.03, 0.03, -0.41, 0.47][i]])
    for i in std.range(0, 3)
  ] + [
    post('hub', 'frame', 0, 0.50, 0, 0.025, 0.08),
    post('pole', 'frame', 0, 0.55, 0, 0.014, 0.65),
    post('collar', 'knob', 0, 1.18, 0, 0.022, 0.04),
    post('mast', 'frame', 0, 1.20, 0, 0.010, 0.27),
    box('yoke-bar', 'frame', [-0.17, 1.46, -0.01], [0.17, 1.48, 0.01]),
    box('yoke-a', 'frame', [-0.17, 1.46, -0.01], [-0.155, 1.58, 0.01]),
    box('yoke-b', 'frame', [0.155, 1.46, -0.01], [0.17, 1.58, 0.01]),
    sideDial('yoke-knob', 'knob', 0.17, 1.56, 0, 0.018, 0.02),
    box('head', 'head', [-0.14, 1.46, -0.05], [0.14, 1.66, 0.04]),
    box('lens', 'lens', [-0.12, 1.48, 0.04], [0.12, 1.64, 0.045]),
    box('bezel-top', 'head', [-0.14, 1.64, 0.04], [0.14, 1.66, 0.06]),
    box('bezel-bottom', 'head', [-0.14, 1.46, 0.04], [0.14, 1.48, 0.06]),
    box('handle-a', 'handle', [-0.08, 1.66, -0.015], [-0.065, 1.70, 0.015]),
    box('handle-b', 'handle', [0.065, 1.66, -0.015], [0.08, 1.70, 0.015]),
    box('handle-c', 'handle', [-0.08, 1.685, -0.015], [0.08, 1.70, 0.015]),
  ] + [
    box('fin-%d' % i, 'head', [-0.13 + i * 0.037, 1.48, -0.08], [-0.12 + i * 0.037, 1.64, -0.05])
    for i in std.range(0, 7)
  ], { frame: 'steel-grey', foot: 'rubber-black', knob: 'plastic-black', head: 'plastic-yellow', lens: 'glass-clear', handle: 'plastic-black' }),

  // A floor lamp, 1.7 m tall: a weighted round base 0.28 m across, a thin pole with a pull switch and a
  // 0.44 m drum shade over the bulb.
  h.compound('standing_lamp', 5, [
    turned('base', 'base', 'y', [[0, 0], [0, 0.14], [0.015, 0.14], [0.03, 0.11], [0.03, 0]]),
    post('collar', 'base', 0, 0.03, 0, 0.022, 0.04),
    post('pole', 'pole', 0, 0.07, 0, 0.011, 1.38),
    box('switch', 'switch', [0.008, 1.10, -0.012], [0.035, 1.16, 0.012]),
    post('socket', 'switch', 0, 1.45, 0, 0.022, 0.06),
    turned('bulb', 'bulb', 'y', [[0, 0], [0, 0.018], [0.03, 0.032], [0.07, 0.032], [0.09, 0]], [0, 1.51, 0]),
    turned('shade', 'shade', 'y', [[1.40, 0.21], [1.40, 0.22], [1.70, 0.16], [1.70, 0.15]]),
    box('spider-a', 'pole', [-0.15, 1.69, -0.006], [0.15, 1.70, 0.006]),
    box('spider-b', 'pole', [-0.006, 1.69, -0.15], [0.006, 1.70, 0.15]),
    post('spider-hub', 'pole', 0, 1.60, 0, 0.008, 0.10),
  ], { base: 'paint-charcoal', pole: 'steel-stainless', switch: 'plastic-black', bulb: 'glass-clear', shade: 'cloth-cotton' }),

  // A mains water purifier, 0.36 m wide and 0.5 m tall: a cabinet with a UV lamp tube along its top,
  // three filter bowls on its front, a display and a tap on the side.
  h.compound('stationary_water_purifier', 19, [
    box('cabinet', 'cabinet', [-0.18, 0, -0.12], [0.18, 0.42, 0.08]),
    box('bracket', 'steel', [-0.17, 0.32, 0.08], [0.17, 0.36, 0.10]),
  ] + [
    turned('bowl-%d' % i, 'bowl', 'y', [[0, 0], [0, 0.042], [0.20, 0.048], [0.20, 0]], [-0.11 + i * 0.11, 0.12, 0.14])
    for i in std.range(0, 2)
  ] + [
    turned('cap-%d' % i, 'steel', 'y', [[0, 0], [0, 0.052], [0.04, 0.052], [0.04, 0]], [-0.11 + i * 0.11, 0.32, 0.14])
    for i in std.range(0, 2)
  ] + [
    turned('uv-tube', 'tube', 'x', [[0, 0], [0, 0.035], [0.34, 0.035], [0.34, 0]], [-0.17, 0.46, -0.02]),
    box('uv-saddle-a', 'steel', [-0.14, 0.42, -0.05], [-0.11, 0.44, 0.01]),
    box('uv-saddle-b', 'steel', [0.11, 0.42, -0.05], [0.14, 0.44, 0.01]),
    sideDial('inlet', 'steel', -0.22, 0.46, -0.02, 0.015, 0.05),
    box('display', 'display', [-0.08, 0.37, 0.10], [0.08, 0.41, 0.105]),
    box('lamp', 'lamp', [0.10, 0.38, 0.10], [0.12, 0.40, 0.105]),
    sideDial('tap-stem', 'steel', 0.18, 0.12, -0.02, 0.012, 0.06),
    post('tap-spout', 'steel', 0.225, 0.07, -0.02, 0.01, 0.05),
    post('tap-handle', 'handle', 0.21, 0.13, -0.02, 0.012, 0.04),
  ], { cabinet: 'paint-white', steel: 'steel-stainless', bowl: 'plastic-blue', tube: 'steel-stainless', display: 'glass-lens-green', lamp: 'glass-lens-amber', handle: 'plastic-blue' }),

  // A cabinet table saw, 1.35 m across its fence rail and 1.02 m tall: a closed base, a cast top with two
  // wings, a 254 mm blade showing through the throat plate, the riving knife, a rip fence, and the height
  // and tilt wheels.
  h.compound('tablesaw', 280, [
    box('plinth', 'cabinet', [-0.27, 0, -0.27], [0.27, 0.05, 0.27]),
    box('cabinet', 'cabinet', [-0.25, 0.05, -0.25], [0.25, 0.80, 0.25]),
    box('motor-cover', 'cabinet', [-0.15, 0.25, -0.32], [0.15, 0.55, -0.25]),
    turned('dust-port', 'steel', 'z', [[0, 0], [0, 0.05], [0.08, 0.05], [0.08, 0]], [0, 0.12, -0.33]),
    box('top', 'top', [-0.35, 0.80, -0.34], [0.35, 0.86, 0.34]),
    box('wing-a', 'top', [-0.65, 0.82, -0.34], [-0.35, 0.86, 0.34]),
    box('wing-b', 'top', [0.35, 0.82, -0.34], [0.65, 0.86, 0.34]),
    box('throat', 'throat', [-0.11, 0.86, -0.17], [-0.05, 0.862, 0.17]),
    turned('blade', 'blade', 'x', [[0, 0], [0, 0.127], [0.003, 0.127], [0.003, 0]], [-0.0815, 0.81, 0]),
    prism('riving-knife', 'blade', 'x', [[0.86, -0.24], [0.95, -0.17], [0.95, -0.13], [0.86, -0.13]], -0.082, -0.078),
    box('rail-bracket', 'steel', [-0.675, 0.76, 0.34], [0.675, 0.84, 0.36]),
    turned('rail', 'steel', 'x', [[0, 0], [0, 0.025], [1.35, 0.025], [1.35, 0]], [-0.675, 0.81, 0.385]),
    box('fence', 'fence', [0.20, 0.86, -0.34], [0.25, 0.93, 0.36]),
    box('fence-head', 'fence', [0.18, 0.78, 0.36], [0.27, 0.93, 0.43]),
    box('fence-lever', 'handle', [0.21, 0.93, 0.38], [0.24, 0.95, 0.46]),
    box('switch', 'switch', [-0.40, 0.70, 0.36], [-0.28, 0.79, 0.40]),
    box('switch-paddle', 'paddle', [-0.37, 0.72, 0.40], [-0.31, 0.77, 0.42]),
    dial('height-wheel', 'wheel', 0, 0.55, 0.25, 0.08, 0.025),
    dial('height-knob', 'handle', 0.06, 0.55, 0.275, 0.012, 0.05),
    sideDial('tilt-wheel', 'wheel', 0.25, 0.55, 0, 0.08, 0.025),
    sideDial('tilt-knob', 'handle', 0.275, 0.55, 0.06, 0.012, 0.05),
  ], { cabinet: 'paint-charcoal', steel: 'steel-grey', top: 'iron-cast', throat: 'plastic-red', blade: 'steel-grey', fence: 'alu-bare', handle: 'plastic-black', switch: 'plastic-yellow', paddle: 'plastic-red', wheel: 'iron-cast' }),

  // A round bulkhead light, 0.2 m across and 0.09 m deep, as it hangs on a wall facing +z: a steel back
  // plate, a frosted dome and a two-bar guard over it.
  h.compound('wall_light', 1, [
    turned('plate', 'plate', 'z', [[0, 0], [0, 0.10], [0.02, 0.10], [0.025, 0.095], [0.025, 0]], [0, 0.10, -0.045]),
    turned('dome', 'dome', 'z', [[0, 0], [0, 0.085], [0.03, 0.082], [0.05, 0.065], [0.06, 0.03], [0.062, 0]], [0, 0.10, -0.02]),
    turned('rim', 'plate', 'z', [[0, 0.080], [0, 0.090], [0.012, 0.090], [0.012, 0.080]], [0, 0.10, -0.02]),
  ] + std.flattenArrays([
    // Each guard bar follows the dome's outline a few millimetres proud of it, crown to rim on both sides.
    local pts = [[0.0838, 0.012], [0.082, 0.03], [0.065, 0.05], [0.03, 0.06], [0, 0.062]];
    local out(p, d) = local nr = p[0] / (0.085 * 0.085), nh = p[1] / (0.062 * 0.062), n = std.sqrt(nr * nr + nh * nh); [p[0] + d * nr / n, p[1] + d * nh / n];
    local w = 0.005, z0 = -0.02;
    [
      local a = pts[i], b = pts[i + 1], ia = out(a, 0.001), ib = out(b, 0.001), oa = out(a, 0.007), ob = out(b, 0.007);
      local quad = [[s * ia[0], ia[1]], [s * ib[0], ib[1]], [s * ob[0], ob[1]], [s * oa[0], oa[1]]];
      if bar == 'a' then prism('guard-a-%d-%d' % [(s + 1) / 2, i], 'guard', 'y', [[q[1] + z0, q[0]] for q in quad], 0.10 - w, 0.10 + w)
      else prism('guard-b-%d-%d' % [(s + 1) / 2, i], 'guard', 'x', [[q[0] + 0.10, q[1] + z0] for q in quad], -w, w)
      for i in std.range(0, std.length(pts) - 2)
    ]
    for bar in ['a', 'b']
    for s in [-1, 1]
  ]) + [
    box('gland', 'gland', [-0.012, 0, -0.045], [0.012, 0.012, -0.02]),
  ], { plate: 'steel-grey', dome: 'plastic-white', guard: 'steel-grey', gland: 'rubber-black' }) + { voxelGrain: 0.004 },
]
