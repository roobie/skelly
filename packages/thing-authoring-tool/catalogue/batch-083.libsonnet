local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local prism = h.prism;
local disc = h.disc;
local rod = h.rod;
// A cylinder along z from `z0` to `z1`, its axis at (x, y).
local zrod(id, slot, r, z0, z1, x, y) = turned(id, slot, 'z', [[0, 0], [0, r], [z1 - z0, r], [z1 - z0, 0]], [x, y, z0]);
// A flat ring of hose lying on y, centred at (x, z), its tube `t` thick; it closes on its first point to keep the hole.
local hoseRing(id, slot, r, t, x=0, z=0) = turned(id, slot, 'y', [[0, r - t], [t, r - t * 1.4], [2 * t, r - t], [2 * t, r + t], [t, r + t * 1.4], [0, r + t], [0, r - t]], [x, 0, z]);
// A needle file lying along x from `x0`, 0.14 m long: a 50 mm round handle and a 90 mm cut tapering to a point.
local needleFile(id, z, cut) = [
  rod(id + '-handle', 'handle', 0.0025, -0.07, -0.02, 0.006) + { origin: [-0.07, 0.006, z] },
  box(id + '-cut', 'file', [-0.02, 0.0035, z - cut], [0.06, 0.0075, z + cut]),
  box(id + '-tip', 'file', [0.06, 0.0045, z - cut * 0.5], [0.07, 0.0065, z + cut * 0.5]),
];
// A curved pick arm lying on y as convex strips: each [z, centre x, half width] station runs out from the eye.
local pickArm(prefix, stations, y0, y1) = [
  local a = stations[i], b = stations[i + 1];
  prism('%s-%d' % [prefix, i], 'head', 'y', [[a[0], a[1] - a[2]], [b[0], b[1] - b[2]], [b[0], b[1] + b[2]], [a[0], a[1] + a[2]]], y0, y1)
  for i in std.range(0, std.length(stations) - 2)
];
[
  // An L-shaped car lug wrench of 18 mm bar: a 0.40 m lever ending in a flattened tyre-lever blade, bent to a 0.12 m
  // leg carrying a 19 mm hex socket coaxial with it; 0.46 m along the diagonal.
  h.compound('lug_wrench', 1.1, [
    rod('lever', 'bar', 0.009, -0.20, 0.17, 0.011),
    box('blade', 'bar', [-0.25, 0.007, -0.014], [-0.20, 0.014, 0.014]),
    turned('bend', 'bar', 'y', [[0, 0], [0, 0.012], [0.022, 0.012], [0.022, 0]], [0.175, 0, 0]),
    zrod('leg', 'bar', 0.009, 0.005, 0.10, 0.175, 0.011),
    zrod('socket', 'socket', 0.0145, 0.10, 0.145, 0.175, 0.0145),
    zrod('socket-mouth', 'mouth', 0.011, 0.145, 0.1455, 0.175, 0.0145),
  ], { bar: 'steel-grey', socket: 'steel-bright', mouth: 'plastic-matte-black' })
  + { handling: h.gripOn('lug_wrench', 'lever'), voxelGrain: 0.004 },

  // A crude hammer: a 0.30 m sapling haft 28 mm thick with a 100 mm steel offcut lashed across its head end with wire.
  h.compound('makeshift_hammer', 1.1, [
    rod('haft', 'haft', 0.014, -0.15, 0.15, 0.019),
    box('head', 'head', [0.10, 0.003, -0.045], [0.135, 0.035, 0.055]),
    box('face', 'face', [0.102, 0.005, 0.055], [0.133, 0.033, 0.062]),
    box('wrap-a', 'lashing', [0.093, 0.0, -0.018], [0.099, 0.038, 0.018]),
    box('wrap-b', 'lashing', [0.136, 0.0, -0.018], [0.142, 0.038, 0.018]),
    box('wrap-x', 'lashing', [0.098, 0.034, -0.016], [0.138, 0.038, -0.010]),
    box('wrap-y', 'lashing', [0.098, 0.034, 0.010], [0.138, 0.038, 0.016]),
  ], { haft: 'bark', head: 'iron-dull', face: 'steel-bright', lashing: 'steel-galvanised' })
  + { handling: h.gripOn('makeshift_hammer', 'haft'), voxelGrain: 0.004 },

  // A stitched leather hose about 1.5 m long and 18 mm thick, coiled flat in three loops 0.23 m across, its two ends
  // laid out with a hard leather collar on each.
  h.compound('leather_hose', 0.3, [
    hoseRing('loop-a', 'hose', 0.05, 0.009),
    hoseRing('loop-b', 'hose', 0.078, 0.009),
    hoseRing('loop-c', 'hose', 0.106, 0.009),
    zrod('tail', 'hose', 0.009, 0.10, 0.145, 0.0, 0.009),
    zrod('collar-a', 'collar', 0.0115, 0.145, 0.163, 0.0, 0.0115),
    rod('end-in', 'hose', 0.009, -0.035, 0.01, 0.027),
    rod('collar-b', 'collar', 0.0115, 0.01, 0.028, 0.029),
    box('seam', 'seam', [-0.12, 0.018, -0.0015], [-0.04, 0.0195, 0.0015]),
  ], { hose: 'leather-tan', collar: 'leather-chestnut', seam: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A home-made vacuum former: a plywood box 300 by 240 mm and 70 mm tall with a pegboard platen on top, a hinged
  // wooden clamp frame propped open above it holding a plastic sheet, and a hand-pump bulb on a hose at the side.
  h.compound('makeshift_vacuum_mold', 1.1, [
    box('base', 'box', [-0.15, 0, -0.12], [0.15, 0.07, 0.12]),
    box('platen', 'platen', [-0.13, 0.07, -0.10], [0.13, 0.074, 0.10]),
  ] + [
    disc('hole-%d-%d' % [i, j], 'hole', 0.003, 0.0735, 0.0745, -0.11 + i * 0.0275, -0.08 + j * 0.032)
    for i in std.range(0, 8)
    for j in std.range(0, 5)
  ] + [
    box('frame-back', 'frame', [-0.15, 0.07, -0.14], [0.15, 0.085, -0.12]),
    prism('frame-l', 'frame', 'x', [[0.08, -0.13], [0.07, -0.12], [0.14, 0.10], [0.15, 0.09]], -0.15, -0.13),
    prism('frame-r', 'frame', 'x', [[0.08, -0.13], [0.07, -0.12], [0.14, 0.10], [0.15, 0.09]], 0.13, 0.15),
    prism('sheet', 'sheet', 'x', [[0.08, -0.12], [0.077, -0.118], [0.142, 0.095], [0.145, 0.093]], -0.13, 0.13),
    rod('hose', 'hose', 0.006, 0.15, 0.21, 0.035),
    turned('bulb', 'pump', 'x', [[0, 0], [0, 0.012], [0.02, 0.03], [0.07, 0.03], [0.09, 0.012], [0.09, 0]], [0.21, 0.035, 0]),
  ], { box: 'board-mdf', platen: 'wood-pine', hole: 'plastic-matte-black', frame: 'wood-pine', sheet: 'plastic-clear', hose: 'rubber-black', pump: 'rubber-black' })
  + { voxelGrain: 0.004 },

  // A welding mat about 0.9 by 0.7 m sewn from glass-fibre oven batts under an aramid cover, folded to 450 by 350 mm
  // and 70 mm thick, its quilting stitched as thin sunken lines a shade darker than the cover and tied with a cord.
  h.compound('makeshift_welding_blanket', 1,
    h.foldedGarment(0.45, 0.35, 0.07, 3) + [
      box('stitch-%d' % i, 'stitch', [-0.215, 0.066, -0.162 + i * 0.081], [0.215, 0.0702, -0.158 + i * 0.081])
      for i in std.range(0, 4)
    ] + [
      box('tie', 'tie', [0.064, -0.001, -0.177], [0.07, 0.0715, 0.177]),
    ], { cloth: 'aramid-gold', stitch: 'cloth-turnout', tie: 'jute' })
  + { voxelGrain: 0.004 },

  // A set of five needle files 140 mm long, each with its own cut, laid in a vinyl wallet 150 by 80 mm.
  h.compound('metal_file', 0.087, [
    box('wallet', 'wallet', [-0.076, 0, -0.042], [0.076, 0.0025, 0.042]),
    box('band', 'band', [-0.04, 0.0025, -0.042], [-0.032, 0.010, 0.042]),
  ] + std.flattenArrays([needleFile('file-%d' % i, -0.032 + i * 0.016, [0.003, 0.0025, 0.002, 0.003, 0.0015][i]) for i in std.range(0, 4)]),
  { wallet: 'vinyl-black', band: 'webbing-black', handle: 'plastic-red', file: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // A hand concrete float: a 150 by 75 mm iron blade with rounded front corners and a bent iron strap handle.
  h.compound('metal_smoother', 0.3, [
    prism('blade', 'blade', 'y', [[-0.0375, -0.065], [0.0375, -0.065], [0.0375, 0.065], [0.03, 0.075], [-0.03, 0.075]], 0, 0.003),
    box('foot-a', 'strap', [-0.06, 0.003, -0.008], [-0.03, 0.006, 0.008]),
    box('foot-b', 'strap', [0.03, 0.003, -0.008], [0.06, 0.006, 0.008]),
    box('post-a', 'strap', [-0.036, 0.003, -0.008], [-0.03, 0.04, 0.008]),
    box('post-b', 'strap', [0.03, 0.003, -0.008], [0.036, 0.04, 0.008]),
    rod('grip', 'grip', 0.012, -0.05, 0.05, 0.048),
  ], { blade: 'iron-dull', strap: 'iron-dull', grip: 'wood-oak' })
  + { handling: h.gripOn('metal_smoother', 'grip'), voxelGrain: 0.002 },

  // A field repair roll laid open: a 460 by 140 mm canvas wrap holding a folding wood saw, a craft knife and a
  // square of soft cleaning cloth.
  h.compound('misc_repairkit', 0.35, [
    box('roll', 'canvas', [-0.23, 0, -0.07], [0.23, 0.003, 0.07]),
    box('flap', 'canvas', [-0.23, 0, 0.07], [0.23, 0.006, 0.085]),
    box('tie-a', 'tie', [-0.24, 0.003, 0.0], [-0.20, 0.005, 0.012]),
    box('saw-handle', 'handle', [-0.21, 0.003, 0.025], [-0.08, 0.019, 0.055]),
    prism('saw-blade', 'blade', 'y', [[0.032, -0.08], [0.052, -0.08], [0.046, 0.20], [0.036, 0.20]], 0.003, 0.0045),
  ] + [
    prism('tooth-%d' % i, 'blade', 'y', [[0.029, -0.07 + i * 0.02], [0.033, -0.07 + i * 0.02], [0.033, -0.06 + i * 0.02]], 0.003, 0.0045)
    for i in std.range(0, 12)
  ] + [
    rod('knife-body', 'knife', 0.0055, -0.18, -0.05, 0.0085) + { origin: [-0.18, 0.0085, -0.02] },
    prism('knife-blade', 'blade', 'y', [[-0.024, -0.05], [-0.016, -0.05], [-0.02, -0.025], [-0.024, -0.03]], 0.007, 0.008),
    box('patch', 'patch', [-0.02, 0.003, -0.06], [0.09, 0.008, 0.00]),
  ], { canvas: 'canvas-grey', tie: 'webbing-black', handle: 'plastic-orange', blade: 'steel-bright', knife: 'plastic-yellow', patch: 'cloth-yellow' })
  + { voxelGrain: 0.004 },

  // A folding pliers multitool opened out, 135 mm long: a 45 mm jaw head and two 90 mm steel channel handles with
  // their tucked blades and drivers showing along the inner edges.
  h.compound('multitool', 0.32, [
    prism('jaw-a', 'jaw', 'y', [[0.003, 0.0], [0.010, 0.0], [0.004, 0.045], [0.001, 0.045]], 0.004, 0.012),
    prism('jaw-b', 'jaw', 'y', [[-0.010, 0.0], [-0.003, 0.0], [-0.001, 0.045], [-0.004, 0.045]], 0.004, 0.012),
    disc('pivot', 'pivot', 0.008, 0.002, 0.014),
    prism('handle-a', 'handle', 'y', [[0.004, -0.005], [0.017, -0.005], [0.032, -0.088], [0.018, -0.088]], 0.0, 0.016),
    prism('handle-b', 'handle', 'y', [[-0.017, -0.005], [-0.004, -0.005], [-0.018, -0.088], [-0.032, -0.088]], 0.0, 0.016),
    prism('tools-a', 'tools', 'y', [[0.009, -0.015], [0.014, -0.015], [0.026, -0.083], [0.021, -0.083]], 0.016, 0.0175),
    prism('tools-b', 'tools', 'y', [[-0.014, -0.015], [-0.009, -0.015], [-0.021, -0.083], [-0.026, -0.083]], 0.016, 0.0175),
  ], { jaw: 'steel-bright', pivot: 'steel-grey', handle: 'steel-grey', tools: 'steel-blued' })
  + { handling: h.gripOn('multitool', 'handle-a'), voxelGrain: 0.002 },

  // A cast bronze nail puller 250 mm long: a 16 mm square bar with a curled claw at one end and a flat split claw
  // at the other, a striking boss behind the curl.
  h.compound('nail_puller_bronze', 0.59, [
    box('bar', 'bar', [-0.10, 0.0, -0.008], [0.09, 0.016, 0.008]),
    prism('curl-a', 'bar', 'z', [[0.09, 0.0], [0.115, 0.004], [0.11, 0.02], [0.09, 0.016]], -0.008, 0.008),
    prism('curl-b', 'bar', 'z', [[0.115, 0.004], [0.125, 0.02], [0.12, 0.045], [0.11, 0.02]], -0.008, 0.008),
    prism('curl-c', 'bar', 'z', [[0.12, 0.045], [0.108, 0.05], [0.106, 0.036], [0.11, 0.02]], -0.008, 0.008),
    box('boss', 'boss', [0.075, 0.016, -0.011], [0.095, 0.032, 0.011]),
    prism('flat-a', 'claw', 'y', [[-0.008, -0.10], [-0.001, -0.10], [-0.001, -0.125], [-0.011, -0.125]], 0.0, 0.006),
    prism('flat-b', 'claw', 'y', [[0.001, -0.10], [0.008, -0.10], [0.011, -0.125], [0.001, -0.125]], 0.0, 0.006),
    prism('notch', 'notch', 'z', [[0.104, 0.044], [0.11, 0.02], [0.113, 0.02], [0.108, 0.046]], -0.0012, 0.0012),
  ], { bar: 'bronze', boss: 'bronze-polished', claw: 'bronze', notch: 'coal-black' })
  + { handling: h.gripOn('nail_puller_bronze', 'bar'), voxelGrain: 0.004 },

  // An oxy-acetylene torch: a 250 mm brass handle with red and blue valve knobs at the hose end and a cutting
  // attachment 200 mm long with its oxygen lever and a 75 degree copper nozzle, two short hose tails.
  h.compound('oxy_torch', 0.91, [
    rod('handle', 'handle', 0.014, -0.20, 0.03, 0.016),
    box('valve-block', 'body', [-0.22, 0.004, -0.018], [-0.20, 0.03, 0.018]),
    zrod('knob-red', 'red', 0.009, 0.018, 0.03, -0.21, 0.017),
    zrod('knob-blue', 'blue', 0.009, -0.03, -0.018, -0.21, 0.017),
    rod('hose-red', 'red-hose', 0.006, -0.30, -0.22, 0.017) + { origin: [-0.30, 0.017, 0.009] },
    rod('hose-blue', 'blue-hose', 0.006, -0.30, -0.22, 0.017) + { origin: [-0.30, 0.017, -0.009] },
    rod('nut', 'body', 0.017, 0.03, 0.05, 0.017),
    rod('tube-a', 'tube', 0.005, 0.05, 0.22, 0.012),
    rod('tube-b', 'tube', 0.004, 0.05, 0.22, 0.024),
    box('lever', 'body', [0.06, 0.028, -0.006], [0.17, 0.034, 0.006]),
    box('head', 'body', [0.22, 0.005, -0.009], [0.245, 0.03, 0.009]),
    prism('nozzle', 'nozzle', 'z', [[0.236, 0.004], [0.249, 0.006], [0.258, -0.005], [0.252, -0.009]], -0.0055, 0.0055),
  ], { handle: 'brass-polished', body: 'brass-dull', red: 'plastic-red', blue: 'plastic-blue', 'red-hose': 'rubber-black', 'blue-hose': 'rubber-black', tube: 'steel-bright', nozzle: 'copper' })
  + { handling: h.gripOn('oxy_torch', 'handle'), voxelGrain: 0.004 },

  // A 100 mm wall brush, 210 mm long: a flat beavertail wooden handle, a steel ferrule and a block of bristle.
  h.compound('paint_brush', 0.2, [
    prism('handle', 'handle', 'y', [[-0.014, -0.11], [0.014, -0.11], [0.024, -0.06], [0.03, -0.025], [-0.03, -0.025], [-0.024, -0.06]], 0.006, 0.018),
    disc('hang-hole', 'hole', 0.004, 0.0175, 0.0185, -0.095, 0),
    box('ferrule', 'ferrule', [-0.025, 0.002, -0.052], [0.005, 0.022, 0.052]),
    box('bristle', 'bristle', [0.005, 0.004, -0.05], [0.07, 0.020, 0.05]),
    box('tip', 'bristle', [0.07, 0.007, -0.049], [0.10, 0.017, 0.049]),
  ], { handle: 'wood-birch', hole: 'coal-black', ferrule: 'steel-galvanised', bristle: 'horsehair-black' })
  + { handling: h.gripOn('paint_brush', 'handle'), voxelGrain: 0.004 },

  // A 5 lb pick: a 0.91 m hickory haft swelling toward the head, and a 0.6 m curved steel head with a point on one
  // side and a chisel blade on the other.
  h.compound('pickaxe', 6.6, [
    turned('haft', 'haft', 'x', [[0, 0], [0, 0.018], [0.05, 0.016], [0.70, 0.019], [0.85, 0.022], [0.85, 0]], [-0.40, 0.026, 0]),
    box('eye', 'eye', [0.405, 0.002, -0.032], [0.465, 0.05, 0.032]),
  ] + pickArm('point', [[0.02, 0.435, 0.03], [0.12, 0.43, 0.022], [0.20, 0.415, 0.014], [0.29, 0.385, 0.002]], 0.008, 0.044)
  + pickArm('chisel', [[-0.02, 0.435, 0.03], [-0.12, 0.43, 0.022], [-0.20, 0.418, 0.018], [-0.30, 0.395, 0.017]], 0.014, 0.038) + [
    box('wedge', 'wedge', [0.425, 0.05, -0.012], [0.445, 0.052, 0.012]),
  ], { haft: 'wood-oak', eye: 'steel-grey', head: 'steel-grey', wedge: 'steel-bright' })
  + { handling: h.gripOn('pickaxe', 'haft'), voxelGrain: 0.008 },

  // A hand pin reamer 130 mm long: a plain 45 mm steel handle with faint knurl rings and an 85 mm fluted taper from
  // 8 mm to 3 mm.
  h.compound('pin_reamer', 0.09, [
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.007], [0.004, 0.009], [0.041, 0.009], [0.045, 0.006], [0.045, 0]], [-0.065, 0.009, 0]),
  ] + [
    h.tube('knurl-%d' % i, 'knurl', 0.0086, 0.0092, -0.059 + i * 0.006, -0.057 + i * 0.006, 0.009, 0)
    for i in std.range(0, 5)
  ] + [
    turned('taper', 'reamer', 'x', [[0, 0], [0, 0.004]] + std.flattenArrays([
      [[0.006 + i * 0.0105, 0.004 - i * 0.00032], [0.0065 + i * 0.0105, 0.0032 - i * 0.00032], [0.0105 + i * 0.0105, 0.0038 - i * 0.00032]]
      for i in std.range(0, 7)
    ]) + [[0.085, 0.0012], [0.085, 0]], [-0.02, 0.009, 0]),
  ], { handle: 'steel-grey', knurl: 'steel-galvanised', reamer: 'steel-bright' })
  + { handling: h.gripOn('pin_reamer', 'handle'), voxelGrain: 0.002 },

  // A pair of 170 mm slip-joint pliers with ridged jaws and red dipped grips.
  h.item('pliers', 'pliers', 0.2, {
    kind: 'groove', length: 0.170, jawLength: 0.045, spread: 0.045,
    gripWidth: 0.013, thickness: 0.008, pivotRadius: 0.012, teeth: 5, toothDepth: 0.003,
  }, { metal: 'steel-grey', grip: 'plastic-red', dark: 'paint-charcoal' })
  + { handling: { part: 'pliers', solid: 'grip--1', fraction: [0.5, 0.5, 0.5], turn: [0, 0, 0], hold: 'upright', roll: 0 }, voxelGrain: 0.002 },
]
