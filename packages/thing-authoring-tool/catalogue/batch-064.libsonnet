local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local prism = h.prism;
// A closed ring standing on y, bore r0 and rim r1, from y0 to y1 at (x, z).
local ring(id, slot, r0, r1, y0, y1, x, z) = turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);
// A bar `w` wide lying on y from (xa, za) to (xb, zb), between heights y0 and y1.
local bar(id, slot, xa, za, xb, zb, w, y0, y1) =
  local dx = xb - xa, dz = zb - za, l = std.sqrt(dx * dx + dz * dz), nx = -dz / l * w / 2, nz = dx / l * w / 2;
  prism(id, slot, 'y', [[za + nz, xa + nx], [za - nz, xa - nx], [zb - nz, xb - nx], [zb + nz, xb + nx]], y0, y1);
[
  // A blacksmith's drift: a hardened round bar 32 mm across and 235 mm long, tapering over its last 80 mm to a
  // blunt point, with a mushroomed striking end.
  h.compound('drift', 0.93, [
    turned('body', 'body', 'x', [[0, 0], [0, 0.014], [0.006, 0.016], [0.150, 0.016], [0.225, 0.006], [0.235, 0]]),
    turned('head', 'head', 'x', [[0, 0], [0, 0.019], [0.006, 0.018], [0.010, 0.016], [0.010, 0]], [-0.004, 0, 0]),
  ], { body: 'steel-hardened', head: 'steel-heat-tint' }) + {
    handling: h.gripOn('drift', 'body'),
    voxelGrain: 0.002,
  },

  // A benchtop electric heat-treating forge, 300 mm wide, 240 mm deep and 260 mm tall: a painted steel case with a
  // hinged door over a glowing chamber, a control panel at the right and a mains cord at the back. Front on +z.
  h.compound('forge', 5.6, [
    box('case', 'case', [-0.15, 0.015, -0.12], [0.15, 0.26, 0.12]),
    box('foot-a', 'foot', [-0.14, 0, -0.11], [-0.11, 0.015, -0.08]),
    box('foot-b', 'foot', [0.11, 0, -0.11], [0.14, 0.015, -0.08]),
    box('foot-c', 'foot', [-0.14, 0, 0.08], [-0.11, 0.015, 0.11]),
    box('foot-d', 'foot', [0.11, 0, 0.08], [0.14, 0.015, 0.11]),
    box('door', 'door', [-0.14, 0.07, 0.12], [0.055, 0.245, 0.135]),
    box('mouth', 'mouth', [-0.105, 0.115, 0.135], [0.015, 0.200, 0.137]),
    box('handle', 'handle', [0.028, 0.12, 0.135], [0.040, 0.195, 0.152]),
    box('panel', 'panel', [0.065, 0.025, 0.12], [0.145, 0.245, 0.126]),
    box('display', 'display', [0.080, 0.195, 0.126], [0.130, 0.225, 0.128]),
    turned('knob', 'knob', 'z', [[0, 0], [0, 0.012], [0.014, 0.011], [0.014, 0]], [0.105, 0.145, 0.126]),
    box('switch', 'switch', [0.090, 0.055, 0.126], [0.120, 0.080, 0.132]),
    box('vent-a', 'panel', [-0.10, 0.26, -0.06], [-0.08, 0.263, 0.06]),
    box('vent-b', 'panel', [-0.05, 0.26, -0.06], [-0.03, 0.263, 0.06]),
    box('vent-c', 'panel', [0.00, 0.26, -0.06], [0.02, 0.263, 0.06]),
    box('cord', 'cord', [0.095, 0.035, -0.30], [0.105, 0.045, -0.12]),
    box('plug', 'cord', [0.088, 0.025, -0.34], [0.112, 0.055, -0.30]),
  ], {
    case: 'paint-drum-blue',
    foot: 'rubber-black',
    door: 'steel-grey',
    mouth: 'glow-flame',
    handle: 'plastic-matte-black',
    panel: 'plastic-matte-black',
    display: 'lcd-green',
    knob: 'steel-bright',
    switch: 'lacquer-red',
    cord: 'rubber-black',
  }) + { voxelGrain: 0.004 },

  // A propane forge: an insulated steel drum 280 mm across and 340 mm long lying front to back on a welded stand,
  // its mouth on +z lined with fire brick and glowing, a burner tube standing in its top fed by a hose. 0.56 m tall.
  h.compound('gas_forge', 15, [
    turned('shell', 'shell', 'z', [[0, 0], [0, 0.14], [0.34, 0.14], [0.34, 0]], [0, 0.26, -0.17]),
    turned('lining', 'lining', 'z', [[0, 0.065], [0, 0.125], [0.012, 0.125], [0.012, 0.065], [0, 0.065]], [0, 0.26, 0.17]),
    turned('fire', 'fire', 'z', [[0, 0], [0, 0.066], [0.004, 0.066], [0.004, 0]], [0, 0.26, 0.17]),
    turned('back', 'lining', 'z', [[0, 0], [0, 0.125], [0.008, 0.125], [0.008, 0]], [0, 0.26, -0.178]),
    turned('collar', 'burner', 'y', [[0, 0], [0, 0.030], [0.035, 0.030], [0.035, 0]], [0, 0.385, 0]),
    turned('burner', 'burner', 'y', [[0, 0], [0, 0.018], [0.15, 0.018], [0.15, 0]], [0, 0.40, 0]),
    turned('bell', 'bell', 'y', [[0, 0], [0, 0.020], [0.010, 0.036], [0.050, 0.036], [0.050, 0]], [0, 0.50, 0]),
    box('hose-top', 'hose', [-0.007, 0.535, -0.32], [0.007, 0.549, -0.03]),
    box('hose-down', 'hose', [-0.007, 0, -0.334], [0.007, 0.549, -0.32]),
    box('valve', 'bell', [-0.014, 0.528, -0.06], [0.014, 0.556, -0.03]),
    box('leg-a', 'stand', [-0.13, 0, -0.14], [-0.11, 0.14, -0.12]),
    box('leg-b', 'stand', [0.11, 0, -0.14], [0.13, 0.14, -0.12]),
    box('leg-c', 'stand', [-0.13, 0, 0.12], [-0.11, 0.14, 0.14]),
    box('leg-d', 'stand', [0.11, 0, 0.12], [0.13, 0.14, 0.14]),
    box('cradle-a', 'stand', [-0.13, 0.12, -0.14], [0.13, 0.14, -0.12]),
    box('cradle-b', 'stand', [-0.13, 0.12, 0.12], [0.13, 0.14, 0.14]),
    box('shelf', 'stand', [-0.13, 0.12, 0.14], [0.13, 0.13, 0.20]),
  ], {
    shell: 'steel-parkerized',
    lining: 'brick-buff',
    fire: 'glow-flame',
    burner: 'steel-galvanised',
    bell: 'brass-dull',
    hose: 'rubber-black',
    stand: 'steel-grey',
  }) + { voxelGrain: 0.004 },

  // A handled hot cut: a 25 by 40 mm chisel head 150 mm tall on a 300 mm hickory handle, struck on its top and
  // set edge-down on hot stock.
  h.compound('hotcut', 1, [
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.011], [0.29, 0.013], [0.29, 0]]),
    box('head', 'head', [0.290, -0.065, -0.020], [0.315, 0.050, 0.020]),
    box('face', 'face', [0.287, 0.050, -0.022], [0.318, 0.060, 0.022]),
    prism('edge', 'edge', 'z', [[0.290, -0.065], [0.315, -0.065], [0.3035, -0.095], [0.3015, -0.095]], -0.020, 0.020),
  ], { handle: 'wood-oak', head: 'steel-hardened', face: 'steel-heat-tint', edge: 'steel-bright' }) + {
    handling: h.gripOn('hotcut', 'handle'),
    voxelGrain: 0.002,
  },

  // A sheet of riveted mail 250 mm square laid flat, its rows of rings standing proud and its far edge rolled up.
  h.compound('lc_link_sheet', 0.95, [
    box('sheet', 'mail', [-0.125, 0, -0.125], [0.125, 0.004, 0.11]),
    turned('roll', 'mail', 'x', [[0, 0], [0, 0.012], [0.25, 0.012], [0.25, 0]], [-0.125, 0.012, 0.113]),
  ] + [
    box('row-%d' % i, 'rings', [-0.123, 0.004, -0.121 + 0.012 * i], [0.123, 0.006, -0.117 + 0.012 * i])
    for i in std.range(0, 18)
  ] + [
    box('col-%d' % i, 'rings', [-0.121 + 0.012 * i, 0.004, -0.123], [-0.119 + 0.012 * i, 0.007, 0.104])
    for i in std.range(0, 20)
  ], { mail: 'steel-mail', rings: 'steel-mail-dark' }) + { voxelGrain: 0.002 },

  // A palm-sized patch of leather, 90 by 60 mm, with a handful of sand pressed into its rough side.
  h.compound('leather_filing', 0.036, [
    box('leather', 'leather', [-0.045, 0, -0.030], [0.045, 0.004, 0.030]),
    box('sand', 'sand', [-0.040, 0.004, -0.025], [0.038, 0.006, 0.026]),
    h.ball('heap', 'sand', 0.014, 0.010, 0.006, 0.004, 0.25),
  ], { leather: 'leather-tan', sand: 'brick-buff' }) + h.inHand('leather_filing', 'leather') + { voxelGrain: 0.002 },

  // Flatjaw blacksmith's tongs 440 mm long, lying open on their side: two flat jaws 100 mm long, a riveted boss and
  // round reins spreading to 60 mm apart at the ends.
  h.compound('metalworking_tongs', 0.94, [
    box('jaw-a', 'jaw', [0, 0.001, 0.002], [0.105, 0.019, 0.014]),
    box('jaw-b', 'jaw', [0, 0.001, -0.014], [0.105, 0.019, -0.002]),
    h.disc('boss', 'boss', 0.020, 0.002, 0.018, 0.115, 0),
    h.disc('rivet', 'rivet', 0.007, 0.018, 0.021, 0.115, 0),
    bar('rein-a', 'rein', 0.125, 0.006, 0.44, 0.030, 0.011, 0.005, 0.015),
    bar('rein-b', 'rein', 0.125, -0.006, 0.44, -0.030, 0.011, 0.005, 0.015),
  ], { jaw: 'steel-blued', boss: 'steel-blued', rivet: 'steel-bright', rein: 'steel-grey' }) + {
    handling: h.gripOn('metalworking_tongs', 'rein-a'),
    voxelGrain: 0.002,
  },

  // A treadle grindstone: a 300 mm sandstone wheel 50 mm wide on an iron axle between two posts of a wooden frame
  // 500 mm long, a crank on its right turned by a rod from a foot treadle, a water trough under the wheel.
  h.compound('pedal_grindstone', 15, [
    box('skid-a', 'frame', [-0.17, 0, -0.25], [-0.13, 0.05, 0.25]),
    box('skid-b', 'frame', [0.13, 0, -0.25], [0.17, 0.05, 0.25]),
    box('rail-a', 'frame', [-0.17, 0.05, -0.24], [0.17, 0.09, -0.20]),
    box('rail-b', 'frame', [-0.17, 0.05, 0.20], [0.17, 0.09, 0.24]),
    box('rail-c', 'frame', [-0.17, 0.05, -0.02], [0.17, 0.09, 0.02]),
    box('post-a', 'frame', [-0.11, 0.09, -0.02], [-0.07, 0.42, 0.02]),
    box('post-b', 'frame', [0.07, 0.09, -0.02], [0.11, 0.42, 0.02]),
    box('trough', 'trough', [-0.05, 0.09, -0.17], [0.05, 0.19, 0.17]),
    box('water', 'water', [-0.04, 0.19, -0.16], [0.04, 0.192, 0.16]),
    turned('wheel', 'wheel', 'x', [[0, 0], [0, 0.140], [0.005, 0.150], [0.045, 0.150], [0.05, 0.140], [0.05, 0]], [-0.025, 0.40, 0]),
    h.rod('axle', 'iron', 0.010, -0.13, 0.20, 0.40),
    turned('hub', 'iron', 'x', [[0, 0], [0, 0.030], [0.064, 0.030], [0.064, 0]], [-0.032, 0.40, 0]),
    box('crank', 'iron', [0.18, 0.30, -0.010], [0.192, 0.41, 0.010]),
    box('rod', 'iron', [0.192, 0.08, -0.006], [0.200, 0.31, 0.006]),
    box('treadle', 'treadle', [0.17, 0.06, -0.05], [0.25, 0.08, 0.30]),
    box('pivot', 'iron', [0.17, 0.05, -0.06], [0.25, 0.07, -0.04]),
  ], {
    frame: 'wood-oak',
    trough: 'wood-pine',
    water: 'water',
    wheel: 'brick-buff',
    iron: 'iron-dull',
    treadle: 'wood-pine',
  }) + { voxelGrain: 0.004 },

  // A sheet of sandpaper, 230 by 280 mm, grit side up with one corner folded back to show the paper.
  h.compound('sandpaper', 0.015, [
    box('sheet', 'grit', [-0.115, 0, -0.140], [0.115, 0.002, 0.140]),
    prism('fold', 'paper', 'y', [[0.140, 0.035], [0.140, 0.115], [0.060, 0.115]], 0.002, 0.004),
  ], { grit: 'rust-red', paper: 'paper-butcher' }) + { voxelGrain: 0.002 },

  // A two-handled metal scraper like a small drawknife: a 260 mm hardened blade 30 mm wide with a honed front
  // edge, cranked at each end into a 110 mm turned wooden handle pointing back towards the user.
  h.compound('scraper_steel', 0.51, [
    box('blade', 'blade', [-0.13, 0.012, 0], [0.13, 0.016, 0.030]),
    box('edge', 'edge', [-0.13, 0.012, 0.030], [0.13, 0.015, 0.034]),
    box('tang-a', 'blade', [-0.150, 0.010, -0.020], [-0.130, 0.018, 0.012]),
    box('tang-b', 'blade', [0.130, 0.010, -0.020], [0.150, 0.018, 0.012]),
    turned('ferrule-a', 'ferrule', 'z', [[0, 0], [0, 0.012], [0.012, 0.012], [0.012, 0]], [-0.140, 0.014, -0.032]),
    turned('ferrule-b', 'ferrule', 'z', [[0, 0], [0, 0.012], [0.012, 0.012], [0.012, 0]], [0.140, 0.014, -0.032]),
    turned('handle-a', 'handle', 'z', [[0, 0], [0, 0.009], [0.020, 0.013], [0.090, 0.014], [0.110, 0.010], [0.110, 0]], [-0.140, 0.014, -0.142]),
    turned('handle-b', 'handle', 'z', [[0, 0], [0, 0.009], [0.020, 0.013], [0.090, 0.014], [0.110, 0.010], [0.110, 0]], [0.140, 0.014, -0.142]),
  ], { blade: 'steel-blued', edge: 'steel-bright', ferrule: 'brass-dull', handle: 'wood-walnut' }) + {
    handling: h.gripOn('scraper_steel', 'handle-a'),
    voxelGrain: 0.002,
  },

  // A flat slab of natural stone, about 300 by 200 mm and 70 mm thick, with rough sides and a ground, smooth top.
  h.compound('stone_polishing', 11, [
    prism('slab', 'stone', 'y', [[-0.08, -0.14], [-0.10, -0.08], [-0.095, 0.10], [-0.06, 0.15], [0.07, 0.145], [0.10, 0.09], [0.095, -0.11], [0.05, -0.15]], 0, 0.06),
    prism('top', 'face', 'y', [[-0.07, -0.12], [-0.085, -0.07], [-0.08, 0.09], [-0.05, 0.13], [0.06, 0.125], [0.085, 0.08], [0.08, -0.10], [0.04, -0.13]], 0.06, 0.07),
    h.ball('lump-a', 'stone', 0.045, -0.11, 0.03, 0.04, 0.7),
    h.ball('lump-b', 'stone', 0.040, 0.12, 0.028, -0.03, 0.7),
    h.ball('lump-c', 'stone', 0.040, 0.02, 0.028, 0.085, 0.7),
    h.ball('lump-d', 'stone', 0.042, -0.02, 0.03, -0.085, 0.7),
  ], { stone: 'stone-grey', face: 'stone-whet' }) + { voxelGrain: 0.004 },

  // A swage set: a bottom swage 100 mm long with a 20 mm round groove and a square shank for the anvil's hardy hole,
  // its matching top swage laid groove up on a 250 mm steel rod handle with a ring end, and two round heading dies.
  h.compound('swage', 3.5, [
    box('shank', 'block', [-0.0925, 0, -0.0125], [-0.0675, 0.04, 0.0125]),
    box('base', 'block', [-0.13, 0.04, -0.025], [-0.03, 0.06, 0.025]),
    box('cheek-a', 'block', [-0.13, 0.06, -0.025], [-0.09, 0.085, 0.025]),
    box('cheek-b', 'block', [-0.07, 0.06, -0.025], [-0.03, 0.085, 0.025]),
    turned('groove', 'groove', 'z', [[0, 0], [0, 0.010], [0.05, 0.010], [0.05, 0]], [-0.08, 0.065, -0.025]),
    box('top-base', 'block', [0.02, 0, -0.025], [0.12, 0.02, 0.025]),
    box('top-cheek-a', 'block', [0.02, 0.02, -0.025], [0.06, 0.045, 0.025]),
    box('top-cheek-b', 'block', [0.08, 0.02, -0.025], [0.12, 0.045, 0.025]),
    turned('top-groove', 'groove', 'z', [[0, 0], [0, 0.010], [0.05, 0.010], [0.05, 0]], [0.07, 0.025, -0.025]),
    turned('rod', 'rod', 'z', [[0, 0], [0, 0.006], [0.23, 0.006], [0.23, 0]], [0.07, 0.022, 0.025]),
    ring('eye', 'rod', 0.012, 0.020, 0.017, 0.027, 0.07, 0.272),
    ring('die-a', 'die', 0.008, 0.025, 0, 0.022, 0.175, -0.035),
    ring('die-b', 'die', 0.005, 0.022, 0, 0.020, 0.175, 0.030),
  ], { block: 'steel-grey', groove: 'steel-bright', rod: 'steel-blued', die: 'steel-hardened' }) + { voxelGrain: 0.002 },

  // Stainless kitchen tongs 300 mm long lying on their side, open: two pressed arms sprung from a looped end, with
  // scalloped heads and rubber grips.
  h.compound('tongs', 0.17, [
    box('loop', 'arm', [-0.012, 0, -0.008], [0.002, 0.018, 0.008]),
    turned('pull', 'arm', 'y', [[0, 0.007], [0, 0.011], [0.003, 0.011], [0.003, 0.007], [0, 0.007]], [-0.018, 0.0075, 0]),
    bar('arm-a', 'arm', 0, 0.006, 0.26, 0.030, 0.003, 0, 0.018),
    bar('arm-b', 'arm', 0, -0.006, 0.26, -0.030, 0.003, 0, 0.018),
    bar('grip-a', 'grip', 0.015, 0.0075, 0.12, 0.0172, 0.006, 0.001, 0.017),
    bar('grip-b', 'grip', 0.015, -0.0075, 0.12, -0.0172, 0.006, 0.001, 0.017),
    box('head-a', 'arm', [0.255, 0, 0.026], [0.30, 0.028, 0.032]),
    box('head-b', 'arm', [0.255, 0, -0.032], [0.30, 0.028, -0.026]),
  ] + [
    box('tooth-%s-%d' % [s, i], 'arm', [0.262 + 0.012 * i, 0.002, if s == 'a' then 0.022 else -0.026], [0.268 + 0.012 * i, 0.026, if s == 'a' then 0.026 else -0.022])
    for s in ['a', 'b']
    for i in std.range(0, 2)
  ], { arm: 'steel-stainless', grip: 'rubber-black' }) + {
    handling: h.gripOn('tongs', 'arm-a'),
    voxelGrain: 0.002,
  },
]
