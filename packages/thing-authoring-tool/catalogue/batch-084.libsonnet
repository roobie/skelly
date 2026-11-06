local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local prism = h.prism;
local disc = h.disc;
local rod = h.rod;
// A cylinder along z from `z0` to `z1`, its axis at (x, y).
local zrod(id, slot, r, z0, z1, x, y) = turned(id, slot, 'z', [[0, 0], [0, r], [z1 - z0, r], [z1 - z0, 0]], [x, y, z0]);
// A rod along x from `x0` to `x1` at height `y`, off the x axis at `z`.
local xrod(id, slot, r, x0, x1, y, z) = rod(id, slot, r, x0, x1, y) + { origin: [x0, y, z] };
// A screwdriver lying along x at `z` on a floor at `y0`: handle from `x0`, shaft to `x1`.
local driver(id, x0, x1, z, y0, r, handle) = [
  turned(id + '-handle', handle, 'x', [[0, 0], [0, r * 0.7], [0.006, r], [0.075, r], [0.085, r * 0.75], [0.085, 0]], [x0, y0 + r, z]),
  xrod(id + '-shaft', 'shaft', r * 0.28, x0 + 0.085, x1, y0 + r, z),
];
[
  // A fist-sized river stone 130 mm long lashed with rawhide across the end of a 300 mm wooden haft.
  h.compound('primitive_hammer', 1.2, [
    rod('haft', 'haft', 0.014, 0, 0.30, 0.031),
    box('stone', 'stone', [0.232, 0.004, -0.052], [0.29, 0.06, 0.058]),
    box('stone-nose', 'stone', [0.238, 0.012, 0.058], [0.284, 0.052, 0.074]),
    box('stone-heel', 'stone', [0.242, 0.012, -0.066], [0.28, 0.05, -0.052]),
    box('stone-crown', 'stone', [0.24, 0.06, -0.035], [0.282, 0.066, 0.04]),
    box('lash-front', 'lashing', [0.216, 0.014, -0.018], [0.232, 0.049, 0.018]),
    box('lash-back', 'lashing', [0.29, 0.014, -0.018], [0.3, 0.049, 0.018]),
    box('lash-over', 'lashing', [0.226, 0.066, -0.016], [0.296, 0.07, 0.016]),
    box('lash-under', 'lashing', [0.226, 0.0, -0.016], [0.296, 0.004, 0.016]),
  ], { haft: 'wood-birch', stone: 'stone-grey', lashing: 'skin-rawhide' })
  + { handling: h.gripOn('primitive_hammer', 'haft'), voxelGrain: 0.004 },

  // A hand propane torch 0.42 m long: a brass cylinder fitting and control valve, a moulded grip, a steel burner tube
  // and a flared burner nozzle.
  h.compound('propane_torch', 0.46, [
    rod('fitting', 'brass', 0.012, 0, 0.025, 0.02),
    rod('valve', 'brass', 0.016, 0.025, 0.06, 0.02),
    zrod('knob-stem', 'brass', 0.004, 0.012, 0.024, 0.042, 0.02),
    zrod('knob', 'knob', 0.013, 0.024, 0.032, 0.042, 0.02),
    turned('grip', 'grip', 'x', [[0, 0], [0, 0.014], [0.01, 0.017], [0.1, 0.017], [0.11, 0.012], [0.11, 0]], [0.06, 0.02, 0]),
    box('trigger', 'knob', [0.075, 0.0, -0.006], [0.095, 0.006, 0.006]),
    rod('tube', 'tube', 0.006, 0.17, 0.37, 0.02),
    turned('nozzle', 'nozzle', 'x', [[0, 0], [0, 0.009], [0.04, 0.016], [0.05, 0.016], [0.05, 0]], [0.37, 0.02, 0]),
    rod('nozzle-mouth', 'mouth', 0.011, 0.418, 0.421, 0.02),
  ], { brass: 'brass', knob: 'plastic-red', grip: 'plastic-yellow', tube: 'steel-stainless', nozzle: 'steel-heat-tint', mouth: 'coal-black' })
  + { handling: h.gripOn('propane_torch', 'grip'), voxelGrain: 0.004 },

  // A cordless reciprocating saw 0.45 m long with its blade: a motor body on a D handle over the battery pack, a
  // rubber nose with the pivoting shoe, and a 150 mm blade, teeth down.
  h.compound('reciprocating_saw', 2.4, [
    box('battery', 'battery', [-0.17, 0, -0.04], [-0.04, 0.065, 0.04]),
    box('battery-latch', 'grip', [-0.04, 0.02, -0.03], [-0.032, 0.06, 0.03]),
    box('handle-post', 'grip', [-0.17, 0.065, -0.017], [-0.14, 0.165, 0.017]),
    box('handle-top', 'grip', [-0.17, 0.135, -0.017], [-0.03, 0.165, 0.017]),
    box('handle-foot', 'body', [-0.10, 0.065, -0.025], [-0.03, 0.08, 0.025]),
    box('trigger', 'trigger', [-0.11, 0.115, -0.007], [-0.09, 0.135, 0.007]),
    turned('motor', 'body', 'x', [[0, 0], [0, 0.034], [0.02, 0.04], [0.2, 0.04], [0.2, 0]], [-0.04, 0.11, 0]),
    box('vents', 'grip', [0.0, 0.146, -0.02], [0.06, 0.152, 0.02]),
    turned('nose', 'grip', 'x', [[0, 0], [0, 0.036], [0.07, 0.03], [0.07, 0]], [0.16, 0.11, 0]),
    box('shoe-arm', 'shoe', [0.2, 0.07, -0.006], [0.25, 0.08, 0.006]),
    box('shoe', 'shoe', [0.25, 0.06, -0.022], [0.258, 0.135, 0.022]),
    box('clamp', 'shoe', [0.23, 0.095, -0.012], [0.25, 0.125, 0.012]),
    box('blade', 'blade', [0.25, 0.088, -0.002], [0.39, 0.108, 0.002]),
    prism('blade-tip', 'blade', 'z', [[0.39, 0.088], [0.41, 0.088], [0.39, 0.108]], -0.002, 0.002),
  ] + [
    box('tooth-%d' % i, 'blade', [0.262 + i * 0.012, 0.083, -0.002], [0.268 + i * 0.012, 0.088, 0.002])
    for i in std.range(0, 10)
  ], { body: 'plastic-red', grip: 'rubber-black', battery: 'plastic-charcoal', trigger: 'plastic-matte-black', shoe: 'steel-bright', blade: 'steel-grey' })
  + { handling: h.gripOn('reciprocating_saw', 'handle-top'), voxelGrain: 0.004 },

  // A long zipped nylon kit bag 600 by 130 mm and 35 mm thick, sized for barrels and tools, with a carry strap
  // stitched along its top, a zip round three sides and a pale stencilled panel.
  h.compound('robofac_gun_kit', 0.3, [
    box('bag', 'bag', [-0.3, 0, -0.065], [0.3, 0.032, 0.065]),
    box('edge-front', 'zip', [-0.296, 0.024, 0.06], [0.296, 0.03, 0.068]),
    box('edge-left', 'zip', [-0.304, 0.024, -0.062], [-0.296, 0.03, 0.068]),
    box('edge-right', 'zip', [0.296, 0.024, -0.062], [0.304, 0.03, 0.068]),
    box('pull', 'pull', [0.27, 0.026, 0.068], [0.282, 0.03, 0.084]),
    box('strap', 'strap', [-0.2, 0.032, -0.012], [0.2, 0.036, 0.012]),
    box('strap-loop', 'strap', [-0.08, 0.036, -0.012], [0.08, 0.048, 0.012]),
    box('panel', 'panel', [0.12, 0.032, -0.05], [0.24, 0.034, 0.04]),
    box('panel-mark', 'mark', [0.15, 0.034, -0.03], [0.21, 0.035, 0.02]),
  ], { bag: 'nylon-black', zip: 'webbing-black', pull: 'steel-grey', strap: 'webbing-olive-dark', panel: 'plastic-grey', mark: 'paint-charcoal' })
  + { voxelGrain: 0.004 },

  // A cast bronze wood saw 0.5 m overall: a 380 mm blade tapering from 90 to 35 mm deep, toothed along its edge,
  // with an open wooden grip riveted on.
  h.compound('saw_bronze', 0.5, [
    box('grip-a', 'grip', [0, 0.0, -0.025], [0.12, 0.006, 0.02]),
    box('grip-b', 'grip', [0, 0.01, -0.025], [0.12, 0.016, 0.02]),
    box('grip-butt', 'grip', [0, 0.006, -0.03], [0.025, 0.01, 0.025]),
    prism('tang', 'blade', 'y', [[-0.02, 0.025], [0.018, 0.025], [0.018, 0.12], [-0.02, 0.12]], 0.006, 0.01),
    prism('blade', 'blade', 'y', [[-0.05, 0.12], [0.04, 0.12], [0.012, 0.5], [-0.023, 0.5]], 0.006, 0.01),
    disc('rivet-a', 'rivet', 0.005, 0.0, 0.017, 0.04, -0.003),
    disc('rivet-b', 'rivet', 0.005, 0.0, 0.017, 0.09, -0.003),
  ] + [
    local x = 0.13 + i * 0.019, z = -0.05 + (x - 0.12) * 0.027 / 0.38;
    prism('tooth-%d' % i, 'blade', 'y', [[z, x], [z, x + 0.012], [z - 0.006, x + 0.006]], 0.006, 0.01)
    for i in std.range(0, 18)
  ], { grip: 'wood-oak', blade: 'bronze', rivet: 'bronze-polished' })
  + { handling: h.gripOn('saw_bronze', 'grip-a'), voxelGrain: 0.004 },

  // A moulded screwdriver case 280 by 90 mm opened flat on its hinge: six drivers from 140 to 250 mm in the tray,
  // the empty lid behind.
  h.compound('screwdriver_set', 0.29, [
    box('tray', 'case', [-0.14, 0, 0.0], [0.14, 0.016, 0.09]),
    box('tray-rim-front', 'case', [-0.14, 0.016, 0.084], [0.14, 0.024, 0.09]),
    box('tray-rim-left', 'case', [-0.14, 0.016, 0.0], [-0.134, 0.024, 0.09]),
    box('tray-rim-right', 'case', [0.134, 0.016, 0.0], [0.14, 0.024, 0.09]),
    box('lid', 'case', [-0.14, 0, -0.09], [0.14, 0.012, 0.0]),
    box('lid-rim', 'case', [-0.14, 0.012, -0.09], [0.14, 0.018, -0.084]),
    box('latch', 'latch', [-0.015, 0.012, 0.09], [0.015, 0.022, 0.096]),
    box('hinge', 'latch', [-0.12, 0.004, -0.003], [0.12, 0.014, 0.003]),
  ]
  + driver('d1', -0.13, 0.12, 0.012, 0.016, 0.012, 'handle-red')
  + driver('d2', -0.13, 0.10, 0.026, 0.016, 0.011, 'handle-yellow')
  + driver('d3', -0.13, 0.08, 0.040, 0.016, 0.011, 'handle-red')
  + driver('d4', -0.13, 0.06, 0.054, 0.016, 0.010, 'handle-yellow')
  + driver('d5', -0.13, 0.04, 0.067, 0.016, 0.009, 'handle-red')
  + driver('d6', -0.13, 0.01, 0.078, 0.016, 0.008, 'handle-yellow'),
  { case: 'plastic-charcoal', latch: 'plastic-matte-black', 'handle-red': 'plastic-red', 'handle-yellow': 'plastic-yellow', shaft: 'steel-stainless' })
  + { voxelGrain: 0.002 },

  // A hard case 320 by 220 mm, opened with its lid standing behind: a foam tray holding a hammer, a file, a mini
  // hacksaw, a punch and a screwdriver, and a battery pack driving the powered bits.
  h.compound('small_repairkit', 2.5, [
    box('base', 'case', [-0.16, 0, -0.11], [0.16, 0.06, 0.11]),
    box('foam', 'foam', [-0.152, 0.06, -0.102], [0.152, 0.064, 0.102]),
    box('lid', 'case', [-0.16, 0.04, -0.13], [0.16, 0.26, -0.11]),
    box('lid-foam', 'foam', [-0.152, 0.048, -0.11], [0.152, 0.252, -0.104]),
    box('handle', 'latch', [-0.05, 0.26, -0.125], [0.05, 0.272, -0.115]),
    box('latch-a', 'latch', [-0.1, 0.03, 0.11], [-0.08, 0.055, 0.116]),
    box('latch-b', 'latch', [0.08, 0.03, 0.11], [0.1, 0.055, 0.116]),
    box('battery', 'battery', [0.08, 0.064, -0.095], [0.145, 0.09, -0.04]),
    box('battery-led', 'led', [0.12, 0.09, -0.08], [0.13, 0.092, -0.07]),
    // Hammer.
    rod('hammer-handle', 'grip', 0.008, -0.14, 0.02, 0.072) + { origin: [-0.14, 0.072, -0.075] },
    box('hammer-head', 'steel', [0.02, 0.064, -0.095], [0.035, 0.084, -0.055]),
    // File.
    box('file', 'steel', [-0.06, 0.064, -0.035], [0.13, 0.07, -0.022]),
    box('file-grip', 'wood', [-0.14, 0.064, -0.034], [-0.06, 0.076, -0.023]),
    // Mini hacksaw.
    box('saw-blade', 'blade', [-0.1, 0.064, 0.0], [0.08, 0.067, 0.008]),
    box('saw-back', 'grip', [-0.1, 0.064, 0.035], [0.08, 0.072, 0.042]),
    box('saw-end', 'grip', [0.08, 0.064, 0.0], [0.088, 0.072, 0.042]),
    box('saw-grip', 'grip', [-0.14, 0.064, -0.002], [-0.1, 0.08, 0.042]),
  ]
  + driver('driver', -0.14, 0.07, 0.065, 0.064, 0.01, 'grip')
  + [
    xrod('punch', 'steel', 0.004, -0.14, 0.0, 0.069, 0.09),
    xrod('punch-tip', 'steel', 0.002, 0.0, 0.02, 0.069, 0.09),
  ],
  { case: 'paint-olive', foam: 'foam-eva', latch: 'steel-grey', battery: 'plastic-charcoal', led: 'lcd-green', grip: 'rubber-black', steel: 'steel-grey', wood: 'wood-walnut', blade: 'steel-blued', shaft: 'steel-stainless' })
  + { voxelGrain: 0.004 },

  // A pencil soldering iron 220 mm long: a cord strain relief, a ribbed grip, a steel heater barrel and a copper
  // tip.
  h.compound('soldering_iron', 0.059, [
    turned('relief', 'cord', 'x', [[0, 0], [0, 0.004], [0.025, 0.006], [0.025, 0]], [0, 0.012, 0]),
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.009], [0.08, 0.011], [0.09, 0.011], [0.09, 0]], [0.025, 0.012, 0]),
    turned('grip', 'grip', 'x', [[0, 0], [0, 0.012], [0.04, 0.012], [0.04, 0]], [0.075, 0.012, 0]),
    turned('collar', 'barrel', 'x', [[0, 0], [0, 0.008], [0.012, 0.008], [0.012, 0]], [0.115, 0.012, 0]),
    rod('barrel', 'barrel', 0.0045, 0.127, 0.195, 0.012),
    turned('tip', 'tip', 'x', [[0, 0], [0, 0.0025], [0.02, 0.001], [0.025, 0]], [0.195, 0.012, 0]),
  ] + [
    rod('rib-%d' % i, 'handle', 0.0115, 0.04 + i * 0.008, 0.044 + i * 0.008, 0.012)
    for i in std.range(0, 3)
  ], { cord: 'rubber-black', handle: 'plastic-blue', grip: 'rubber-black', barrel: 'steel-stainless', tip: 'copper' })
  + { handling: h.gripOn('soldering_iron', 'grip'), voxelGrain: 0.002 },

  // A die stock 400 mm across its handles holding a 38 mm round die, and a T tap wrench 180 mm across with a tap,
  // laid side by side.
  h.compound('thread_cutting_set', 2, [
    xrod('stock-left', 'handle', 0.009, -0.2, -0.04, 0.012, -0.04),
    xrod('stock-right', 'handle', 0.009, 0.04, 0.2, 0.012, -0.04),
    xrod('grip-left', 'grip', 0.0105, -0.2, -0.13, 0.012, -0.04),
    xrod('grip-right', 'grip', 0.0105, 0.13, 0.2, 0.012, -0.04),
    turned('stock-ring', 'stock', 'y', [[0, 0.019], [0, 0.04], [0.022, 0.04], [0.022, 0.019], [0, 0.019]], [0, 0.001, -0.04]),
    disc('die', 'die', 0.019, 0.003, 0.02, 0, -0.04),
    disc('die-hole', 'hole', 0.007, 0.02, 0.021, 0, -0.04),
    disc('set-screw', 'grip', 0.004, 0.022, 0.03, 0.03, -0.04),
    xrod('wrench-bar', 'handle', 0.006, -0.09, 0.09, 0.008, 0.05),
    xrod('wrench-grip-a', 'grip', 0.0075, -0.09, -0.04, 0.008, 0.05),
    xrod('wrench-grip-b', 'grip', 0.0075, 0.04, 0.09, 0.008, 0.05),
    box('wrench-chuck', 'stock', [-0.013, 0.0, 0.04], [0.013, 0.016, 0.065]),
    zrod('tap', 'tap', 0.005, 0.065, 0.13, 0, 0.008),
    zrod('tap-point', 'tap', 0.003, 0.13, 0.14, 0, 0.008),
  ] + [
    zrod('tap-thread-%d' % i, 'stock', 0.0058, 0.09 + i * 0.008, 0.093 + i * 0.008, 0, 0.008)
    for i in std.range(0, 4)
  ], { handle: 'steel-bright', grip: 'steel-parkerized', stock: 'steel-grey', die: 'steel-heat-tint', hole: 'coal-black', tap: 'steel-hardened' })
  + { voxelGrain: 0.004 },

  // Straight-cut tin snips 250 mm long lying flat: short broad jaws on a pivot bolt, a spring between the handles,
  // and plastic-dipped grips spread at the back.
  h.compound('tin_snips', 0.21, [
    prism('jaw-lower', 'jaw', 'y', [[-0.016, 0.16], [0.008, 0.16], [0.003, 0.25], [-0.006, 0.248]], 0.0, 0.005),
    prism('jaw-upper', 'jaw', 'y', [[-0.008, 0.16], [0.016, 0.16], [0.006, 0.248], [-0.003, 0.25]], 0.005, 0.01),
    prism('arm-lower', 'arm', 'y', [[-0.004, 0.165], [0.01, 0.165], [0.03, 0.12], [0.016, 0.12]], 0.0, 0.005),
    prism('arm-upper', 'arm', 'y', [[-0.01, 0.165], [0.004, 0.165], [-0.016, 0.12], [-0.03, 0.12]], 0.005, 0.01),
    prism('grip-lower', 'grip', 'y', [[0.014, 0.122], [0.032, 0.122], [0.052, 0.0], [0.034, 0.0]], -0.002, 0.007),
    prism('grip-upper', 'grip', 'y', [[-0.032, 0.122], [-0.014, 0.122], [-0.034, 0.0], [-0.052, 0.0]], 0.003, 0.012),
    disc('pivot', 'pivot', 0.009, 0.0, 0.013, 0.163, 0),
    box('spring', 'spring', [0.126, 0.003, -0.02], [0.131, 0.007, 0.02]),
  ], { jaw: 'steel-grey', arm: 'steel-grey', grip: 'plastic-yellow', pivot: 'steel-bright', spring: 'steel-blued' })
  + { handling: h.gripOn('tin_snips', 'grip-lower'), voxelGrain: 0.004 },

  // A steel toolbox 420 by 180 mm and 200 mm tall to the lid's ridge: a box body, a hip-roofed lid with a folding
  // handle, two snap latches and a hasp on the front.
  h.compound('toolbox_empty', 5.3, [
    box('body', 'body', [-0.21, 0, -0.09], [0.21, 0.14, 0.09]),
    box('lid-skirt', 'body', [-0.212, 0.14, -0.092], [0.212, 0.165, 0.092]),
    prism('lid-roof', 'body', 'x', [[0.165, -0.092], [0.165, 0.092], [0.195, 0.04], [0.195, -0.04]], -0.212, 0.212),
    box('seam', 'seam', [-0.213, 0.138, -0.093], [0.213, 0.142, 0.093]),
    box('handle-grip', 'handle', [-0.08, 0.215, -0.009], [0.08, 0.228, 0.009]),
    box('handle-post-a', 'handle', [-0.09, 0.193, -0.006], [-0.078, 0.228, 0.006]),
    box('handle-post-b', 'handle', [0.078, 0.193, -0.006], [0.09, 0.228, 0.006]),
    box('latch-a', 'latch', [-0.17, 0.11, 0.09], [-0.14, 0.16, 0.097]),
    box('latch-b', 'latch', [0.14, 0.11, 0.09], [0.17, 0.16, 0.097]),
    box('hasp', 'latch', [-0.01, 0.12, 0.09], [0.01, 0.155, 0.096]),
    box('foot', 'seam', [-0.205, 0, -0.085], [0.205, 0.006, 0.085]),
  ], { body: 'paint-red', seam: 'paint-charcoal', handle: 'plastic-matte-black', latch: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // A tabletop vacuum former 350 mm wide: a base with a perforated platen, a clamp frame riding two columns, a
  // heater hood on top and a pump hose at the back.
  h.compound('vac_mold', 8, [
    box('base', 'base', [-0.175, 0, -0.12], [0.175, 0.07, 0.12]),
    box('platen', 'platen', [-0.11, 0.07, -0.09], [0.11, 0.076, 0.09]),
    box('switch', 'switch', [0.13, 0.03, 0.12], [0.155, 0.05, 0.126]),
    box('dial', 'switch', [-0.155, 0.03, 0.12], [-0.135, 0.05, 0.126]),
    disc('column-a', 'column', 0.008, 0.07, 0.29, -0.155, -0.1),
    disc('column-b', 'column', 0.008, 0.07, 0.29, 0.155, -0.1),
    box('frame-front', 'frame', [-0.14, 0.16, 0.08], [0.14, 0.172, 0.1]),
    box('frame-back', 'frame', [-0.14, 0.16, -0.1], [0.14, 0.172, -0.08]),
    box('frame-left', 'frame', [-0.14, 0.16, -0.1], [-0.12, 0.172, 0.1]),
    box('frame-right', 'frame', [0.12, 0.16, -0.1], [0.14, 0.172, 0.1]),
    box('sheet', 'sheet', [-0.12, 0.166, -0.08], [0.12, 0.168, 0.08]),
    box('frame-slide-a', 'frame', [-0.168, 0.155, -0.112], [-0.14, 0.177, -0.088]),
    box('frame-slide-b', 'frame', [0.14, 0.155, -0.112], [0.168, 0.177, -0.088]),
    box('handle-a', 'grip', [-0.1, 0.162, 0.1], [-0.07, 0.17, 0.125]),
    box('handle-b', 'grip', [0.07, 0.162, 0.1], [0.1, 0.17, 0.125]),
    box('heater', 'heater', [-0.165, 0.27, -0.115], [0.165, 0.31, 0.1]),
    box('heater-face', 'element', [-0.13, 0.266, -0.09], [0.13, 0.27, 0.08]),
    box('heater-grip', 'grip', [-0.05, 0.28, 0.1], [0.05, 0.296, 0.115]),
    disc('pump', 'heater', 0.03, 0.0, 0.07, 0, -0.15),
    zrod('hose', 'hose', 0.009, -0.15, -0.12, 0, 0.04),
  ] + [
    box('hole-%d-%d' % [i, j], 'hole', [-0.1 + i * 0.025, 0.076, -0.08 + j * 0.025], [-0.094 + i * 0.025, 0.077, -0.074 + j * 0.025])
    for i in std.range(0, 8)
    for j in std.range(0, 6)
  ], { base: 'alu-bare', platen: 'steel-grey', hole: 'coal-black', switch: 'plastic-red', column: 'steel-stainless', frame: 'alu-bare', sheet: 'plastic-clear', grip: 'plastic-matte-black', heater: 'plastic-charcoal', element: 'steel-heat-tint', hose: 'plastic-frosted' })
  + { voxelGrain: 0.004 },

  // A portable inverter arc welder: a cased power unit 130 mm wide, 300 mm deep and 210 mm tall with a carry
  // handle, its control panel on +z, and two leads laid out in front to an electrode holder and an earth clamp.
  h.compound('welder', 4.3, [
    box('case', 'case', [-0.065, 0.004, -0.15], [0.065, 0.2, 0.15]),
    box('foot', 'trim', [-0.067, 0, -0.152], [0.067, 0.012, 0.152]),
    box('cap', 'trim', [-0.067, 0.195, -0.152], [0.067, 0.205, 0.152]),
    box('panel', 'panel', [-0.06, 0.012, 0.15], [0.06, 0.195, 0.155]),
    zrod('knob', 'knob', 0.016, 0.155, 0.17, 0, 0.14),
    box('display', 'display', [-0.03, 0.165, 0.155], [0.03, 0.185, 0.157]),
    zrod('socket-a', 'socket', 0.011, 0.155, 0.165, -0.03, 0.05),
    zrod('socket-b', 'socket', 0.011, 0.155, 0.165, 0.03, 0.05),
    box('handle-grip', 'handle', [-0.012, 0.23, -0.1], [0.012, 0.245, 0.1]),
    box('handle-post-a', 'handle', [-0.01, 0.205, -0.11], [0.01, 0.245, -0.09]),
    box('handle-post-b', 'handle', [-0.01, 0.205, 0.09], [0.01, 0.245, 0.11]),
  ] + [
    box('vent-%d' % i, 'trim', [0.065, 0.06 + i * 0.02, -0.12], [0.068, 0.068 + i * 0.02, 0.12])
    for i in std.range(0, 4)
  ] + [
    // Electrode lead and holder.
    turned('lead-a-drop', 'cable', 'y', [[0, 0], [0, 0.008], [0.05, 0.008], [0.05, 0]], [-0.03, 0.0, 0.175]),
    zrod('lead-a', 'cable', 0.008, 0.165, 0.32, -0.03, 0.008),
    zrod('holder', 'holder', 0.016, 0.32, 0.44, -0.03, 0.016),
    box('jaw', 'clamp', [-0.04, 0.026, 0.44], [-0.02, 0.036, 0.48]),
    // Earth lead and clamp.
    turned('lead-b-drop', 'cable', 'y', [[0, 0], [0, 0.008], [0.05, 0.008], [0.05, 0]], [0.03, 0.0, 0.175]),
    zrod('lead-b', 'cable', 0.008, 0.165, 0.3, 0.05, 0.008),
    box('earth-a', 'clamp', [0.035, 0.0, 0.3], [0.065, 0.012, 0.4]),
    box('earth-b', 'clamp', [0.035, 0.016, 0.3], [0.065, 0.028, 0.4]),
    box('earth-spring', 'trim', [0.04, 0.012, 0.33], [0.06, 0.016, 0.35]),
  ], { case: 'paint-crane-yellow', trim: 'plastic-charcoal', panel: 'plastic-matte-black', knob: 'plastic-red', display: 'lcd-green', socket: 'brass', handle: 'rubber-black', cable: 'rubber-black', holder: 'plastic-red', clamp: 'copper' })
  + { voxelGrain: 0.004 },

  // A makeshift arc welder on a 380 by 260 mm plank: two salvaged transformers with copper windings wired in
  // series, a taped mains cord, and leads to a wooden-handled electrode holder and a spring clamp.
  h.compound('welder_crude', 16, [
    box('plank', 'plank', [-0.19, 0, -0.13], [0.19, 0.02, 0.13]),
  ] + std.flattenArrays([
    local x = [-0.09, 0.07][k];
    [
      box('core-%d' % k, 'core', [x - 0.06, 0.02, -0.06], [x + 0.06, 0.12, 0.04]),
      box('winding-a-%d' % k, 'winding', [x - 0.045, 0.03, -0.07], [x - 0.012, 0.11, 0.05]),
      box('winding-b-%d' % k, 'winding', [x + 0.012, 0.03, -0.07], [x + 0.045, 0.11, 0.05]),
      box('bolt-a-%d' % k, 'bolt', [x - 0.058, 0.12, -0.04], [x - 0.048, 0.128, -0.03]),
      box('bolt-b-%d' % k, 'bolt', [x + 0.048, 0.12, 0.02], [x + 0.058, 0.128, 0.03]),
    ]
    for k in [0, 1]
  ]) + [
    xrod('link', 'wire', 0.004, -0.045, 0.025, 0.115, 0.055),
    xrod('link-tape', 'tape', 0.006, -0.02, 0.0, 0.115, 0.055),
    box('terminal', 'bolt', [0.12, 0.02, 0.06], [0.16, 0.04, 0.1]),
    xrod('mains', 'cable', 0.005, -0.3, -0.15, 0.025, -0.1),
    box('plug', 'plug', [-0.34, 0.016, -0.115], [-0.3, 0.036, -0.085]),
    box('mains-tape', 'tape', [-0.165, 0.018, -0.11], [-0.145, 0.032, -0.09]),
    // Leads from the terminal block forward.
    zrod('lead-a', 'cable', 0.007, 0.08, 0.28, 0.13, 0.027),
    zrod('lead-b', 'cable', 0.007, 0.08, 0.24, 0.155, 0.027),
    zrod('holder', 'handle', 0.014, 0.28, 0.38, 0.13, 0.014),
    box('holder-jaw', 'clamp', [0.122, 0.022, 0.38], [0.138, 0.032, 0.42]),
    box('holder-tape', 'tape', [0.114, 0.0, 0.29], [0.146, 0.03, 0.305]),
    box('spring-clamp-a', 'clamp', [0.145, 0.0, 0.24], [0.17, 0.008, 0.33]),
    box('spring-clamp-b', 'clamp', [0.145, 0.014, 0.24], [0.17, 0.022, 0.33]),
  ], { plank: 'wood-pine', core: 'iron-dull', winding: 'copper', bolt: 'steel-grey', wire: 'copper', tape: 'tape-grey', cable: 'rubber-black', plug: 'plastic-white', handle: 'wood-birch', clamp: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A welding blanket 1.8 by 1.8 m folded to 500 by 400 mm and 60 mm thick, with a stitched hem and brass
  // grommets at the corners.
  h.compound('welding_blanket', 2.4, h.foldedGarment(0.5, 0.4, 0.06, 4) + [
    box('hem', 'hem', [-0.25, 0.06, 0.17], [0.25, 0.062, 0.18]),
    disc('grommet-a', 'grommet', 0.008, 0.06, 0.063, -0.225, 0.175),
    disc('grommet-b', 'grommet', 0.008, 0.06, 0.063, 0.225, 0.175),
  ], { cloth: 'canvas-grey', hem: 'cord-cotton', grommet: 'brass' })
  + { voxelGrain: 0.004 },
]
