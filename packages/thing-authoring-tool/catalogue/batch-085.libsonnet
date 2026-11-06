local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A cylinder along x from `x0` to `x1`, its axis at (y, z).
local rod(id, slot, r, x0, x1, y, z=0) = turned(id, slot, 'x', [[0, 0], [0, r], [x1 - x0, r], [x1 - x0, 0]], [x0, y, z]);
// A cylinder along z from `z0` to `z1`, its axis at (x, y).
local zrod(id, slot, r, z0, z1, x, y) = turned(id, slot, 'z', [[0, 0], [0, r], [z1 - z0, r], [z1 - z0, 0]], [x, y, z0]);
// An adjustable spanner `L` long lying flat along x, its jaws opening toward +x: a tapered handle with a hang hole, a
// round head, a fixed jaw on +z and a sliding jaw on -z set by a knurled worm. Slots: body, worm, hole.
local adjustable(id, massKg, L) = h.compound(id, massKg, [
  h.prism('handle', 'body', 'y', [[-0.045 * L, 0], [0.045 * L, 0], [0.06 * L, 0.74 * L], [-0.06 * L, 0.74 * L]], 0, 0.022 * L),
  disc('head', 'body', 0.10 * L, 0, 0.026 * L, 0.78 * L, 0),
  box('fixed-jaw', 'body', [0.84 * L, 0, 0.03 * L], [1.0 * L, 0.026 * L, 0.10 * L]),
  box('moving-jaw', 'body', [0.85 * L, 0.002 * L, -0.10 * L], [0.985 * L, 0.024 * L, -0.03 * L]),
  zrod('worm', 'worm', 0.016 * L, -0.095 * L, -0.035 * L, 0.80 * L, 0.013 * L),
  disc('hang-hole', 'hole', 0.018 * L, 0.022 * L, 0.0225 * L, 0.06 * L, 0),
], { body: 'steel-bright', worm: 'steel-grey', hole: 'void-black' }) + { handling: h.gripOn(id, 'handle') };
[
  // A small arc welder 300 by 220 by 220 mm standing on a folded fireproof blanket 500 by 360 mm, its front panel
  // with a current dial and two cable sockets on +z, a carry handle on top, the electrode cable coiled beside it and
  // the electrode holder and earth clamp laid in front.
  h.compound('welding_kit', 10, [
    box('blanket', 'blanket', [-0.25, 0, -0.18], [0.25, 0.05, 0.18]),
    box('fold-a', 'fold', [-0.25, 0.05, -0.06], [0.25, 0.054, -0.052]),
    box('fold-b', 'fold', [-0.25, 0.05, 0.052], [0.25, 0.054, 0.06]),
    box('case', 'case', [-0.19, 0.054, -0.11], [0.11, 0.274, 0.11]),
    box('panel', 'panel', [-0.18, 0.064, 0.11], [0.10, 0.264, 0.114]),
    zrod('dial', 'knob', 0.022, 0.114, 0.134, -0.08, 0.20),
    zrod('dial-mark', 'mark', 0.004, 0.134, 0.136, -0.08, 0.214),
    zrod('socket-a', 'socket', 0.012, 0.114, 0.13, 0.0, 0.10),
    zrod('socket-b', 'socket', 0.012, 0.114, 0.13, 0.06, 0.10),
    box('switch', 'knob', [0.03, 0.19, 0.114], [0.07, 0.23, 0.124]),
    box('handle-post-a', 'handle', [-0.15, 0.274, -0.012], [-0.13, 0.31, 0.012]),
    box('handle-post-b', 'handle', [0.05, 0.274, -0.012], [0.07, 0.31, 0.012]),
    box('handle-bar', 'handle', [-0.15, 0.30, -0.015], [0.07, 0.325, 0.015]),
  ] + [
    box('vent-%d' % i, 'panel', [-0.17 + i * 0.03, 0.12, -0.112], [-0.155 + i * 0.03, 0.22, -0.11])
    for i in std.range(0, 8)
  ] + [
    turned('coil', 'cable', 'y', [[0, 0.028], [0, 0.056], [0.032, 0.056], [0.032, 0.028], [0, 0.028]], [0.185, 0.05, -0.05]),
    rod('lead', 'cable', 0.007, 0.0, 0.16, 0.06, 0.14),
    rod('holder', 'holder', 0.014, -0.14, 0.0, 0.065, 0.14),
    rod('electrode', 'rod', 0.003, -0.24, -0.14, 0.065, 0.14),
    box('clamp', 'clamp', [0.17, 0.05, 0.08], [0.24, 0.075, 0.12]),
    box('clamp-jaw', 'clamp', [0.14, 0.05, 0.09], [0.17, 0.07, 0.11]),
  ], {
    blanket: 'cloth-turnout', fold: 'canvas-grey', case: 'paint-drum-blue', panel: 'paint-charcoal', knob: 'plastic-matte-black',
    mark: 'plastic-gloss-white', socket: 'brass-dull', handle: 'plastic-matte-black', cable: 'rubber-black',
    holder: 'plastic-red', rod: 'steel-heat-tint', clamp: 'copper',
  }) + { voxelGrain: 0.004 },

  // A bench wire-drawing machine on a steel base 500 by 240 mm: a die block with a row of tapering holes at -x, a
  // capstan drum 160 mm across at +x turned by a crank on top, and a length of wire running from the die to the drum.
  h.compound('wire_draw_machine', 34, [
    box('base', 'base', [-0.25, 0, -0.12], [0.25, 0.02, 0.12]),
    box('foot-a', 'base', [-0.25, -0.01, -0.12], [-0.21, 0, 0.12]),
    box('foot-b', 'base', [0.21, -0.01, -0.12], [0.25, 0, 0.12]),
    box('die-post-a', 'frame', [-0.22, 0.02, -0.10], [-0.18, 0.18, -0.07]),
    box('die-post-b', 'frame', [-0.22, 0.02, 0.07], [-0.18, 0.18, 0.10]),
    box('die-plate', 'die', [-0.21, 0.04, -0.07], [-0.19, 0.17, 0.07]),
    box('die-cap', 'frame', [-0.225, 0.18, -0.105], [-0.175, 0.20, 0.105]),
  ] + [
    rod('die-hole-%d' % i, 'hole', 0.003 + i * 0.0008, -0.19, -0.188, 0.105, -0.05 + i * 0.02)
    for i in std.range(0, 5)
  ] + [
    disc('pedestal', 'frame', 0.05, 0.02, 0.06, 0.09, 0),
    disc('drum', 'drum', 0.08, 0.06, 0.16, 0.09, 0),
    disc('drum-flange', 'frame', 0.09, 0.15, 0.165, 0.09, 0),
    disc('drum-foot', 'frame', 0.09, 0.055, 0.065, 0.09, 0),
    turned('wound', 'wire', 'y', [[0, 0.08], [0, 0.084], [0.05, 0.084], [0.05, 0.08], [0, 0.08]], [0.09, 0.08, 0]),
    rod('wire-in', 'wire', 0.003, -0.188, 0.0225, 0.105, -0.05),
    rod('wire-tail', 'wire', 0.003, -0.25, -0.21, 0.105, -0.05),
    disc('hub', 'frame', 0.02, 0.165, 0.19, 0.09, 0),
    box('crank', 'frame', [0.08, 0.19, -0.012], [0.25, 0.205, 0.012]),
    disc('crank-grip', 'grip', 0.014, 0.205, 0.29, 0.235, 0),
  ], { base: 'paint-charcoal', frame: 'steel-grey', die: 'steel-hardened', hole: 'void-black', drum: 'steel-bright', wire: 'copper', grip: 'wood-oak' })
  + { voxelGrain: 0.004 },

  // A home-made concrete float: a 610 by 120 mm pine board 22 mm thick with a rounded oak grip on two blocks.
  h.compound('wood_smoother', 1.1, [
    box('board', 'board', [0, 0, -0.06], [0.61, 0.022, 0.06]),
    box('bevel-a', 'board', [-0.01, 0.002, -0.055], [0, 0.016, 0.055]),
    box('bevel-b', 'board', [0.61, 0.002, -0.055], [0.62, 0.016, 0.055]),
    box('block-a', 'block', [0.17, 0.022, -0.02], [0.21, 0.06, 0.02]),
    box('block-b', 'block', [0.40, 0.022, -0.02], [0.44, 0.06, 0.02]),
    rod('grip', 'grip', 0.018, 0.16, 0.45, 0.075),
    box('nail-a', 'nail', [0.185, 0.0, -0.004], [0.195, 0.023, 0.004]),
    box('nail-b', 'nail', [0.415, 0.0, -0.004], [0.425, 0.023, 0.004]),
  ], { board: 'wood-pine', block: 'wood-pine', grip: 'wood-oak', nail: 'steel-grey' })
  + { handling: h.gripOn('wood_smoother', 'grip'), voxelGrain: 0.004 },

  // A 48 inch pipe wrench 1.2 m long lying flat: a red I-beam handle, a cast frame at +x with a knurled adjusting nut,
  // a toothed heel jaw and a hook jaw on a shank across the frame, opening 120 mm toward +x.
  h.compound('wrench_48', 21, [
    box('handle-web', 'handle', [0.02, 0.012, -0.022], [0.95, 0.038, 0.022]),
    box('flange-a', 'handle', [0.0, 0, -0.03], [0.95, 0.05, -0.018]),
    box('flange-b', 'handle', [0.0, 0, 0.018], [0.95, 0.05, 0.03]),
    box('end-cap', 'handle', [0.0, 0, -0.03], [0.02, 0.05, 0.03]),
    disc('hang-hole', 'hole', 0.008, 0.038, 0.039, 0.05, 0),
    box('frame', 'frame', [0.93, 0, -0.05], [1.06, 0.056, 0.05]),
    box('heel-jaw', 'jaw', [1.06, 0.006, -0.04], [1.2, 0.05, 0.0]),
  ] + [
    box('heel-tooth-%d' % i, 'jaw', [1.075 + i * 0.02, 0.008, 0.0], [1.085 + i * 0.02, 0.048, 0.006])
    for i in std.range(0, 5)
  ] + [
    box('shank', 'jaw', [1.0, 0.01, -0.08], [1.045, 0.046, 0.17]),
    zrod('nut', 'nut', 0.034, 0.05, 0.085, 1.0225, 0.028),
    box('hook-jaw', 'jaw', [1.045, 0.006, 0.12], [1.2, 0.05, 0.165]),
  ] + [
    box('hook-tooth-%d' % i, 'jaw', [1.065 + i * 0.02, 0.008, 0.114], [1.075 + i * 0.02, 0.048, 0.12])
    for i in std.range(0, 6)
  ], { handle: 'paint-red', hole: 'void-black', frame: 'iron-dull', jaw: 'steel-grey', nut: 'steel-parkerized' })
  + { handling: h.gripOn('wrench_48', 'handle-web'), voxelGrain: 0.008 },

  // An 18 inch adjustable spanner, 460 mm long, jaws opening to about 60 mm.
  adjustable('wrench_large', 2.2, 0.46) + { voxelGrain: 0.004 },

  // A 6 inch adjustable spanner, 150 mm long, jaws opening to about 20 mm.
  adjustable('wrench_small', 0.075, 0.15) + { voxelGrain: 0.002 },

  // A craft knife 100 mm long: a ribbed 9 mm handle, a tapered collet and a pointed angled blade.
  h.compound('xacto', 0.0096, [
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.004], [0.004, 0.0045], [0.072, 0.0045], [0.072, 0]]),
  ] + [
    turned('rib-%d' % i, 'rib', 'x', [[0, 0], [0, 0.0052], [0.003, 0.0052], [0.003, 0]], [0.012 + i * 0.008, 0, 0])
    for i in std.range(0, 4)
  ] + [
    turned('collet', 'collet', 'x', [[0, 0], [0, 0.0055], [0.008, 0.0055], [0.016, 0.003], [0.016, 0]], [0.072, 0, 0]),
    h.prism('blade', 'blade', 'z', [[0.084, -0.002], [0.101, -0.0045], [0.088, 0.003], [0.084, 0.003]], -0.001, 0.001),
  ], { handle: 'plastic-charcoal', rib: 'alu-bare', collet: 'alu-bare', blade: 'steel-mirror' })
  + { handling: h.gripOn('xacto', 'handle'), voxelGrain: 0.002 },

  // A three-lobed fidget spinner about 95 mm across and 11 mm thick lying flat: a bearing in the middle under round caps
  // and a steel weight ring in each lobe.
  local lobe(i) = { x: 0.035 * std.sin(i * 2 * std.pi / 3), z: 0.035 * std.cos(i * 2 * std.pi / 3) };
  local arm(i) = local l = lobe(i), c = std.cos(i * 2 * std.pi / 3), s = std.sin(i * 2 * std.pi / 3), w = 0.009;
    h.prism('arm-%d' % i, 'body', 'y', [[-s * w, c * w], [l.z - s * w, l.x + c * w], [l.z + s * w, l.x - c * w], [s * w, -c * w]], 0.001, 0.010);
  h.compound('fidget_spinner', 0.13, [
    disc('hub', 'body', 0.017, 0.001, 0.010),
    disc('bearing', 'bearing', 0.011, 0, 0.011),
    disc('cap-top', 'cap', 0.009, 0.011, 0.013),
    disc('cap-bottom', 'cap', 0.009, -0.002, 0),
  ] + [arm(i) for i in [0, 1, 2]] + [
    disc('lobe-%d' % i, 'body', 0.015, 0.001, 0.010, lobe(i).x, lobe(i).z)
    for i in [0, 1, 2]
  ] + [
    turned('weight-%d' % i, 'weight', 'y', [[0, 0.007], [0, 0.0115], [0.0105, 0.0115], [0.0105, 0.007], [0, 0.007]], [lobe(i).x, 0.0005, lobe(i).z])
    for i in [0, 1, 2]
  ], { body: 'plastic-blue', bearing: 'steel-bright', cap: 'plastic-matte-black', weight: 'steel-mirror' })
  + h.inHand('fidget_spinner', 'hub') + { voxelGrain: 0.002 },
]
