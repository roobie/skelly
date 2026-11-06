local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local prism = h.prism;
// A short rod or button standing on y from `y0`, `height` tall.
local post(id, slot, x, y0, z, radius, height) = turned(id, slot, 'y', [[0, 0], [0, radius], [height, radius], [height, 0]], [x, y0, z]);
// A dial or knob facing +z from a front face at `z0`.
local dial(id, slot, x, y, z0, radius, depth) = turned(id, slot, 'z', [[0, 0], [0, radius], [depth, radius], [depth, 0]], [x, y, z0]);
[
  // A 100 litre upright receiver tank, 0.4 m across, on a steel skid with the motor and pump on top; 1.1 m tall.
  h.compound('air_compressor', 63, [
    box('skid', 'frame', [-0.28, 0, -0.28], [0.28, 0.05, 0.28]),
    turned('tank', 'tank', 'y', [[0.05, 0], [0.05, 0.15], [0.09, 0.20], [0.86, 0.20], [0.90, 0.15], [0.92, 0]]),
    box('plate', 'frame', [-0.22, 0.90, -0.14], [0.22, 0.92, 0.14]),
    turned('motor', 'motor', 'x', [[0, 0], [0, 0.08], [0.24, 0.08], [0.26, 0.05], [0.26, 0]], [-0.20, 1.00, 0]),
    box('pump', 'pump', [0.06, 0.92, -0.08], [0.20, 1.08, 0.08]),
    box('pump-head', 'pump', [0.04, 1.08, -0.10], [0.22, 1.10, 0.10]),
    dial('gauge', 'gauge', 0.10, 0.75, 0.19, 0.035, 0.03),
  ], { frame: 'steel-grey', tank: 'paint-red', motor: 'paint-charcoal', pump: 'alu-bare', gauge: 'plastic-white' }),

  // A small tilting electric arc furnace: a 1.3 m refractory-lined shell under a domed roof, three graphite
  // electrodes rising to 2 m from a mast at the side.
  h.compound('arc_furnace', 1600, [
    box('cradle', 'frame', [-0.75, 0, -0.75], [0.75, 0.25, 0.75]),
    turned('shell', 'shell', 'y', [[0.25, 0], [0.25, 0.65], [1.05, 0.65], [1.05, 0]]),
    turned('rim', 'lining', 'y', [[1.05, 0], [1.05, 0.69], [1.12, 0.69], [1.12, 0]]),
    turned('roof', 'roof', 'y', [[1.12, 0], [1.12, 0.66], [1.28, 0.52], [1.38, 0.28], [1.40, 0]]),
    post('electrode-a', 'electrode', 0.25, 1.20, 0, 0.06, 0.80),
    post('electrode-b', 'electrode', -0.125, 1.20, 0.2165, 0.06, 0.80),
    post('electrode-c', 'electrode', -0.125, 1.20, -0.2165, 0.06, 0.80),
    box('mast', 'frame', [0.85, 0, -0.06], [0.97, 1.95, 0.06]),
    box('arm-a', 'arm', [0.25, 1.80, -0.04], [0.90, 1.88, 0.04]),
    box('arm-b', 'arm', [-0.125, 1.68, 0.18], [0.90, 1.76, 0.25]),
    box('arm-c', 'arm', [-0.125, 1.56, -0.25], [0.90, 1.64, -0.18]),
    box('spout', 'lining', [-1.00, 0.85, -0.08], [-0.60, 0.95, 0.08]),
  ], { frame: 'steel-grey', shell: 'paint-charcoal', lining: 'clay-terracotta', roof: 'steel-grey', electrode: 'stone-grey', arm: 'copper' }),

  // An upright arcade cabinet, 0.66 m wide, 0.82 m deep and 1.85 m tall, screen and controls facing +z.
  h.compound('arcade_machine', 64, [
    box('lower', 'cabinet', [-0.33, 0, -0.40], [0.33, 0.95, 0.25]),
    prism('panel', 'panel', 'x', [[0.85, 0.05], [1.00, 0.05], [0.90, 0.42], [0.85, 0.42]], -0.33, 0.33),
    box('upper', 'cabinet', [-0.33, 0.95, -0.40], [0.33, 1.85, 0.05]),
    box('screen', 'screen', [-0.26, 1.05, 0.05], [0.26, 1.50, 0.07]),
    box('marquee', 'marquee', [-0.31, 1.62, 0.05], [0.31, 1.80, 0.10]),
    box('coin-door', 'door', [-0.12, 0.35, 0.25], [0.12, 0.65, 0.27]),
    turned('stick', 'stick', 'y', [[0, 0], [0, 0.008], [0.08, 0.008], [0.08, 0.012], [0.09, 0.018], [0.11, 0.018], [0.12, 0.010], [0.12, 0]], [-0.14, 0.93, 0.25]),
    post('button-a', 'button', 0.02, 0.93, 0.25, 0.014, 0.03),
    post('button-b', 'button', 0.08, 0.93, 0.25, 0.014, 0.03),
    post('button-c', 'button', 0.14, 0.93, 0.25, 0.014, 0.03),
  ], {
    cabinet: 'paint-police-blue', panel: 'paint-charcoal', screen: 'glass-grey', marquee: 'plastic-yellow',
    door: 'steel-grey', stick: 'plastic-black', button: 'plastic-red',
  }),

  // A floor-standing band saw, 2.05 m tall: a cabinet base, two wheel housings joined by a spine, a 0.5 m
  // table and the blade running down the open side.
  h.compound('bandsaw', 210, [
    box('base', 'base', [-0.30, 0, -0.25], [0.30, 0.85, 0.25]),
    box('lower-housing', 'housing', [-0.38, 0.85, -0.20], [0.30, 1.25, 0.05]),
    box('spine', 'housing', [0.18, 1.25, -0.20], [0.30, 1.60, 0.05]),
    box('upper-housing', 'housing', [-0.38, 1.60, -0.20], [0.30, 2.05, 0.05]),
    box('table', 'table', [-0.55, 1.25, -0.30], [-0.05, 1.29, 0.20]),
    box('blade', 'blade', [-0.31, 1.29, -0.081], [-0.29, 1.60, -0.075]),
    box('guide', 'blade', [-0.33, 1.42, -0.10], [-0.27, 1.60, -0.06]),
    turned('motor', 'motor', 'x', [[0, 0], [0, 0.09], [0.25, 0.09], [0.25, 0]], [0.30, 0.45, 0]),
  ], { base: 'paint-charcoal', housing: 'polymer-od-green', table: 'iron-cast', blade: 'steel-grey', motor: 'paint-charcoal' }),

  // A pine box, 0.46 by 0.36 m and 0.3 m deep, its lid leaning back on its hinge, a charger with a meter,
  // a dial and two lamps on its top, and its red and black clip leads hung over the front rim.
  h.compound('box_battery_charger', 7.6, [
    box('floor', 'box', [-0.23, 0, -0.18], [0.23, 0.018, 0.18]),
    box('front', 'box', [-0.23, 0, 0.162], [0.23, 0.30, 0.18]),
    box('back', 'box', [-0.23, 0, -0.18], [0.23, 0.30, -0.162]),
    box('left', 'box', [-0.23, 0, -0.162], [-0.212, 0.30, 0.162]),
    box('right', 'box', [0.212, 0, -0.162], [0.23, 0.30, 0.162]),
    box('cleat-left', 'box', [-0.25, 0.20, -0.06], [-0.23, 0.23, 0.06]),
    box('cleat-right', 'box', [0.23, 0.20, -0.06], [0.25, 0.23, 0.06]),
    // Hinged on the back rim and leaning 20 degrees past upright.
    prism('lid', 'box', 'x', [[0.30, -0.18], [0.638, -0.303], [0.632, -0.320], [0.294, -0.197]], -0.23, 0.23),
    box('hinge-a', 'metal', [-0.17, 0.285, -0.20], [-0.11, 0.31, -0.178]),
    box('hinge-b', 'metal', [0.11, 0.285, -0.20], [0.17, 0.31, -0.178]),
    box('charger', 'charger', [-0.17, 0.018, -0.155], [0.17, 0.22, -0.01]),
    box('meter', 'meter', [-0.13, 0.22, -0.13], [-0.03, 0.226, -0.04]),
    box('needle', 'charger', [-0.082, 0.226, -0.11], [-0.078, 0.228, -0.05]),
    post('dial', 'knob', 0.05, 0.22, -0.08, 0.022, 0.02),
    post('lamp-green', 'lamp-green', 0.11, 0.22, -0.11, 0.008, 0.008),
    post('lamp-red', 'lamp-red', 0.11, 0.22, -0.05, 0.008, 0.008),
  ] + std.flattenArrays([
    // Each lead rises from the charger's front to the rim, crosses it and hangs down the outside to its clip.
    [
      prism('lead-%s' % c[0], 'lead-%s' % c[0], 'x', [[0.14, -0.01], [0.152, -0.01], [0.312, 0.16], [0.30, 0.16]], c[1] - 0.006, c[1] + 0.006),
      box('lead-%s-rim' % c[0], 'lead-%s' % c[0], [c[1] - 0.006, 0.30, 0.16], [c[1] + 0.006, 0.312, 0.192]),
      box('lead-%s-drop' % c[0], 'lead-%s' % c[0], [c[1] - 0.006, 0.17, 0.18], [c[1] + 0.006, 0.312, 0.192]),
      box('clip-%s-grip' % c[0], 'lead-%s' % c[0], [c[1] - 0.018, 0.12, 0.18], [c[1] + 0.018, 0.17, 0.205]),
      box('clip-%s-jaw' % c[0], 'clip', [c[1] - 0.014, 0.08, 0.18], [c[1] + 0.014, 0.12, 0.20]),
    ]
    for c in [['red', -0.10], ['black', 0.10]]
  ]), {
    box: 'wood-pine', metal: 'steel-grey', charger: 'plastic-black', meter: 'plastic-white', knob: 'plastic-red',
    'lamp-green': 'glass-lens-green', 'lamp-red': 'plastic-red', 'lead-red': 'plastic-red', 'lead-black': 'plastic-black', clip: 'copper',
  }),

  // An armoured radioisotope generator, 0.84 m long: a lead-lined block in steel end caps with cooling fins.
  h.compound('radioisotope_generator', 1200, [
    box('skid-a', 'frame', [-0.40, 0, -0.18], [0.40, 0.05, -0.12]),
    box('skid-b', 'frame', [-0.40, 0, 0.12], [0.40, 0.05, 0.18]),
    box('core', 'core', [-0.38, 0.05, -0.20], [0.38, 0.45, 0.20]),
    box('cap-a', 'frame', [-0.42, 0.03, -0.22], [-0.38, 0.47, 0.22]),
    box('cap-b', 'frame', [0.38, 0.03, -0.22], [0.42, 0.47, 0.22]),
  ] + [
    box('fin-%d' % i, 'fin', [-0.31 + i * 0.124, 0.08, -0.26], [-0.29 + i * 0.124, 0.42, 0.26])
    for i in std.range(0, 5)
  ] + [
    box('warning', 'warning', [-0.08, 0.45, -0.08], [0.08, 0.455, 0.08]),
    turned('terminal', 'terminal', 'x', [[0, 0], [0, 0.02], [0.04, 0.02], [0.04, 0]], [0.42, 0.30, 0]),
  ], { frame: 'steel-grey', core: 'lead', fin: 'alu-bare', warning: 'plastic-yellow', terminal: 'copper' }),

  // A floor drill press, 1.37 m tall: cast base, a 90 mm column, a round table on its arm, the head with
  // a vertical motor behind and three feed handles.
  h.compound('drill_press', 200, [
    box('base', 'base', [-0.22, 0, -0.32], [0.22, 0.06, 0.20]),
    turned('column', 'column', 'y', [[0.06, 0], [0.06, 0.045], [1.15, 0.045], [1.15, 0]], [0, 0, -0.20]),
    turned('collar', 'base', 'y', [[0.66, 0], [0.66, 0.065], [0.78, 0.065], [0.78, 0]], [0, 0, -0.20]),
    box('arm', 'base', [-0.05, 0.70, -0.20], [0.05, 0.76, 0.00]),
    turned('table', 'base', 'y', [[0.74, 0], [0.74, 0.16], [0.78, 0.16], [0.78, 0]], [0, 0, 0.02]),
    box('head', 'head', [-0.12, 1.05, -0.28], [0.12, 1.30, 0.10]),
    box('cover', 'head', [-0.13, 1.30, -0.32], [0.13, 1.37, 0.12]),
    box('motor-mount', 'head', [-0.05, 1.10, -0.34], [0.05, 1.20, -0.28]),
    turned('motor', 'motor', 'y', [[0, 0], [0, 0.08], [0.25, 0.08], [0.25, 0]], [0, 1.02, -0.42]),
    turned('quill', 'steel', 'y', [[0.92, 0], [0.92, 0.03], [1.05, 0.03], [1.05, 0]], [0, 0, 0.02]),
    turned('chuck', 'steel', 'y', [[0.84, 0], [0.84, 0.004], [0.86, 0.004], [0.86, 0.018], [0.92, 0.025], [0.92, 0]], [0, 0, 0.02]),
    turned('hub', 'steel', 'x', [[0, 0], [0, 0.03], [0.03, 0.03], [0.03, 0]], [0.12, 1.15, 0]),
    turned('handle-a', 'steel', 'x', [[0, 0], [0, 0.008], [0.22, 0.008], [0.22, 0.016], [0.25, 0.016], [0.25, 0]], [0.12, 1.15, 0]),
    turned('handle-b', 'steel', 'y', [[0, 0], [0, 0.008], [0.16, 0.008], [0.16, 0.016], [0.19, 0.016], [0.19, 0]], [0.135, 1.16, 0]),
    turned('handle-c', 'steel', 'y', [[0, 0], [0, 0.016], [0.03, 0.016], [0.03, 0.008], [0.19, 0.008], [0.19, 0]], [0.135, 0.95, 0]),
  ], { base: 'iron-cast', column: 'steel-stainless', head: 'polymer-od-green', motor: 'paint-charcoal', steel: 'steel-grey' }),

  // A steel foot locker, 0.92 by 0.5 m and 0.48 m tall, with a charging panel set into its front.
  h.compound('charging_foot_locker', 53, [
    box('body', 'body', [-0.45, 0, -0.24], [0.45, 0.42, 0.24]),
    box('lid', 'body', [-0.46, 0.42, -0.25], [0.46, 0.48, 0.25]),
    box('handle-a', 'trim', [-0.48, 0.26, -0.08], [-0.45, 0.30, 0.08]),
    box('handle-b', 'trim', [0.45, 0.26, -0.08], [0.48, 0.30, 0.08]),
    box('latch-a', 'trim', [-0.28, 0.36, 0.24], [-0.22, 0.44, 0.26]),
    box('latch-b', 'trim', [0.22, 0.36, 0.24], [0.28, 0.44, 0.26]),
    box('panel', 'panel', [-0.15, 0.12, 0.24], [0.15, 0.30, 0.25]),
    box('lamp-a', 'lamp', [-0.10, 0.24, 0.25], [-0.08, 0.26, 0.255]),
    box('lamp-b', 'lamp', [-0.06, 0.24, 0.25], [-0.04, 0.26, 0.255]),
    dial('socket', 'trim', 0.08, 0.20, 0.25, 0.025, 0.02),
  ], { body: 'paint-olive', trim: 'steel-grey', panel: 'plastic-black', lamp: 'glass-lens-green' }),

  // An electric glass crucible furnace on four legs, 1 m tall: a 0.52 m drum with a lined mouth, a lid,
  // a vent and a control box on its side.
  h.compound('glassblowers_crucible', 86, [
    box('leg-a', 'frame', [-0.22, 0, -0.22], [-0.18, 0.42, -0.18]),
    box('leg-b', 'frame', [0.18, 0, -0.22], [0.22, 0.42, -0.18]),
    box('leg-c', 'frame', [-0.22, 0, 0.18], [-0.18, 0.42, 0.22]),
    box('leg-d', 'frame', [0.18, 0, 0.18], [0.22, 0.42, 0.22]),
    turned('drum', 'drum', 'y', [[0.40, 0], [0.40, 0.26], [0.90, 0.26], [0.90, 0]]),
    turned('mouth', 'lining', 'y', [[0.88, 0.17], [0.88, 0.27], [0.93, 0.27], [0.93, 0.17]]),
    turned('lid', 'drum', 'y', [[0.93, 0], [0.93, 0.24], [0.96, 0.24], [0.98, 0.07], [0.98, 0]]),
    post('vent', 'frame', 0, 0.98, 0, 0.03, 0.02),
    box('controls', 'controls', [0.25, 0.55, -0.08], [0.36, 0.80, 0.08]),
    turned('knob', 'knob', 'x', [[0, 0], [0, 0.018], [0.02, 0.018], [0.02, 0]], [0.36, 0.72, 0]),
  ], { frame: 'steel-grey', drum: 'steel-stainless', lining: 'clay-terracotta', controls: 'paint-charcoal', knob: 'plastic-black' }),

  // A breathing-air compressor in a 0.63 m roll frame: motor, a finned two-stage pump and a separator bottle.
  h.compound('high_pressure_compressor', 54, [
    box('base', 'frame', [-0.315, 0, -0.22], [0.315, 0.03, 0.22]),
    box('post-a', 'frame', [-0.315, 0, -0.22], [-0.29, 0.45, -0.195]),
    box('post-b', 'frame', [0.29, 0, -0.22], [0.315, 0.45, -0.195]),
    box('post-c', 'frame', [-0.315, 0, 0.195], [-0.29, 0.45, 0.22]),
    box('post-d', 'frame', [0.29, 0, 0.195], [0.315, 0.45, 0.22]),
    box('rail-a', 'frame', [-0.315, 0.425, -0.22], [0.315, 0.45, -0.195]),
    box('rail-b', 'frame', [-0.315, 0.425, 0.195], [0.315, 0.45, 0.22]),
    turned('motor', 'motor', 'x', [[0, 0], [0, 0.10], [0.28, 0.10], [0.30, 0.06], [0.30, 0]], [-0.25, 0.15, 0]),
    box('block', 'pump', [0.07, 0.03, -0.10], [0.25, 0.25, 0.10]),
    turned('stage-a', 'pump', 'y', [[0, 0], [0, 0.045], [0.02, 0.045], [0.02, 0.035], [0.04, 0.035], [0.04, 0.045], [0.06, 0.045], [0.06, 0.035], [0.12, 0.035], [0.12, 0]], [0.12, 0.25, 0]),
    turned('stage-b', 'pump', 'y', [[0, 0], [0, 0.03], [0.10, 0.03], [0.10, 0]], [0.21, 0.25, 0]),
    turned('bottle', 'bottle', 'y', [[0, 0], [0, 0.03], [0.24, 0.03], [0.27, 0.01], [0.27, 0]], [-0.02, 0.03, -0.15]),
    box('gauge-panel', 'frame', [-0.29, 0.28, 0.195], [-0.06, 0.38, 0.205]),
    dial('gauge', 'gauge', -0.10, 0.33, 0.205, 0.03, 0.025),
  ], { frame: 'paint-oxblood', motor: 'paint-charcoal', pump: 'alu-bare', bottle: 'steel-grey', gauge: 'plastic-white' }),

  // A 20 tonne H-frame shop press, 1.58 m tall and 0.84 m wide: channel uprights, a pinned bed with two
  // press plates and a bottle jack hung from the top beam.
  h.compound('hydraulic_press', 130, [
    box('foot-a', 'frame', [-0.45, 0, -0.30], [-0.27, 0.06, 0.30]),
    box('foot-b', 'frame', [0.27, 0, -0.30], [0.45, 0.06, 0.30]),
    box('upright-a', 'frame', [-0.40, 0.06, -0.06], [-0.32, 1.58, 0.06]),
    box('upright-b', 'frame', [0.32, 0.06, -0.06], [0.40, 1.58, 0.06]),
    box('top', 'frame', [-0.40, 1.42, -0.07], [0.40, 1.58, 0.07]),
    box('bed-a', 'frame', [-0.42, 0.62, -0.10], [0.42, 0.74, -0.06]),
    box('bed-b', 'frame', [-0.42, 0.62, 0.06], [0.42, 0.74, 0.10]),
    box('plate-a', 'plate', [-0.20, 0.74, -0.10], [-0.04, 0.80, 0.10]),
    box('plate-b', 'plate', [0.04, 0.74, -0.10], [0.20, 0.80, 0.10]),
    post('jack', 'jack', 0, 1.10, 0, 0.06, 0.32),
    post('ram', 'ram', 0, 0.95, 0, 0.025, 0.15),
    post('ram-foot', 'ram', 0, 0.92, 0, 0.04, 0.03),
    turned('pump-handle', 'ram', 'x', [[0, 0], [0, 0.01], [0.30, 0.01], [0.30, 0]], [0.06, 1.25, 0.04]),
    dial('gauge', 'gauge', 0, 1.50, 0.07, 0.04, 0.02),
  ], { frame: 'paint-red', plate: 'steel-grey', jack: 'paint-charcoal', ram: 'steel-stainless', gauge: 'plastic-white' }),

  // An industrial 2.2 m long jointer: cast infeed and outfeed tables on a closed stand, the cutterhead in
  // the gap between them, a fence along the back and the bridge guard over the cut.
  h.compound('jointer', 250, [
    box('stand', 'stand', [-0.40, 0, -0.22], [0.40, 0.70, 0.22]),
    box('bed', 'stand', [-0.80, 0.70, -0.18], [0.80, 0.78, 0.18]),
    box('infeed', 'table', [-1.10, 0.78, -0.20], [-0.04, 0.82, 0.20]),
    box('outfeed', 'table', [0.04, 0.80, -0.20], [1.10, 0.84, 0.20]),
    turned('cutterhead', 'cutter', 'z', [[0, 0], [0, 0.04], [0.40, 0.04], [0.40, 0]], [0, 0.78, -0.20]),
    box('guard', 'guard', [-0.12, 0.84, 0.00], [0.12, 0.86, 0.20]),
    box('fence', 'cutter', [-0.45, 0.82, -0.22], [0.45, 0.98, -0.19]),
    box('fence-bracket', 'cutter', [-0.06, 0.82, -0.30], [0.06, 0.90, -0.22]),
    dial('wheel-a', 'cutter', -0.25, 0.50, 0.22, 0.06, 0.03),
    dial('wheel-b', 'cutter', 0.25, 0.50, 0.22, 0.06, 0.03),
  ], { stand: 'paint-cream', table: 'iron-cast', cutter: 'steel-grey', guard: 'paint-red' }),

  // A sliding compound mitre saw on its extension wings, 1.24 m wide: base and turntable, fence, the head
  // on two rails behind, a 254 mm blade under a half guard.
  h.compound('mitre_saw', 21, [
    box('base', 'base', [-0.25, 0, -0.25], [0.25, 0.08, 0.20]),
    turned('turntable', 'base', 'y', [[0.08, 0], [0.08, 0.17], [0.10, 0.17], [0.10, 0]], [0, 0, 0.02]),
    box('front-arm', 'base', [-0.04, 0.06, 0.18], [0.04, 0.10, 0.32]),
    turned('wing-rail-a', 'rail', 'x', [[0, 0], [0, 0.012], [0.37, 0.012], [0.37, 0]], [-0.62, 0.06, -0.15]),
    turned('wing-rail-b', 'rail', 'x', [[0, 0], [0, 0.012], [0.37, 0.012], [0.37, 0]], [-0.62, 0.06, 0.10]),
    turned('wing-rail-c', 'rail', 'x', [[0, 0], [0, 0.012], [0.37, 0.012], [0.37, 0]], [0.25, 0.06, -0.15]),
    turned('wing-rail-d', 'rail', 'x', [[0, 0], [0, 0.012], [0.37, 0.012], [0.37, 0]], [0.25, 0.06, 0.10]),
    box('stop-a', 'base', [-0.62, 0, -0.18], [-0.58, 0.10, 0.13]),
    box('stop-b', 'base', [0.58, 0, -0.18], [0.62, 0.10, 0.13]),
    box('fence-a', 'base', [-0.25, 0.10, -0.07], [-0.02, 0.18, -0.05]),
    box('fence-b', 'base', [0.02, 0.10, -0.07], [0.25, 0.18, -0.05]),
    box('pivot', 'base', [-0.06, 0.08, -0.30], [0.06, 0.35, -0.20]),
    turned('slide-a', 'rail', 'z', [[0, 0], [0, 0.012], [0.48, 0.012], [0.48, 0]], [-0.04, 0.30, -0.60]),
    turned('slide-b', 'rail', 'z', [[0, 0], [0, 0.012], [0.48, 0.012], [0.48, 0]], [0.04, 0.30, -0.60]),
    box('carriage', 'head', [-0.07, 0.27, -0.20], [0.07, 0.34, -0.10]),
    box('motor', 'head', [0.03, 0.25, -0.12], [0.15, 0.40, 0.04]),
    prism('guard', 'head', 'x', [[0.25, -0.14], [0.32, -0.12], [0.37, -0.07], [0.39, 0], [0.37, 0.07], [0.32, 0.12], [0.25, 0.14]], -0.03, 0.03),
    turned('blade', 'blade', 'x', [[0, 0], [0, 0.127], [0.004, 0.127], [0.004, 0]], [-0.002, 0.25, 0]),
    box('handle', 'handle', [-0.02, 0.38, 0.10], [0.12, 0.41, 0.20]),
  ], { base: 'alu-bare', rail: 'steel-stainless', head: 'plastic-yellow', blade: 'steel-grey', handle: 'plastic-black' }) + { voxelGrain: 0.002 },

  // A free-standing electric convection oven, 0.6 m wide, 0.6 m deep and 0.69 m tall, door facing +z.
  h.compound('oven', 93, [
    box('foot-a', 'foot', [-0.28, 0, -0.28], [-0.24, 0.02, -0.24]),
    box('foot-b', 'foot', [0.24, 0, -0.28], [0.28, 0.02, -0.24]),
    box('foot-c', 'foot', [-0.28, 0, 0.22], [-0.24, 0.02, 0.26]),
    box('foot-d', 'foot', [0.24, 0, 0.22], [0.28, 0.02, 0.26]),
    box('body', 'body', [-0.30, 0.02, -0.30], [0.30, 0.69, 0.28]),
    box('door', 'door', [-0.28, 0.05, 0.28], [0.28, 0.52, 0.31]),
    box('window', 'window', [-0.20, 0.14, 0.31], [0.20, 0.44, 0.312]),
    box('standoff-a', 'handle', [-0.22, 0.48, 0.31], [-0.20, 0.50, 0.35]),
    box('standoff-b', 'handle', [0.20, 0.48, 0.31], [0.22, 0.50, 0.35]),
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.012], [0.46, 0.012], [0.46, 0]], [-0.23, 0.49, 0.35]),
    box('controls', 'door', [-0.28, 0.54, 0.28], [0.28, 0.67, 0.30]),
    box('display', 'display', [-0.04, 0.585, 0.30], [0.04, 0.625, 0.302]),
    dial('knob-a', 'knob', -0.20, 0.605, 0.30, 0.02, 0.025),
    dial('knob-b', 'knob', -0.10, 0.605, 0.30, 0.02, 0.025),
    dial('knob-c', 'knob', 0.10, 0.605, 0.30, 0.02, 0.025),
    dial('knob-d', 'knob', 0.20, 0.605, 0.30, 0.02, 0.025),
  ], {
    foot: 'rubber-black', body: 'paint-white', door: 'paint-charcoal', window: 'glass-grey',
    handle: 'steel-stainless', display: 'glass-lens-green', knob: 'plastic-black',
  }),

  // A home oxygen concentrator on casters, 0.38 m wide and 0.7 m tall, with a flow meter and humidifier
  // bottle on its front and a filter grille at the back.
  h.compound('oxygen_concentrator', 16, [
    box('body', 'body', [-0.19, 0.06, -0.17], [0.19, 0.62, 0.17]),
    box('top', 'body', [-0.17, 0.62, -0.15], [0.17, 0.66, 0.15]),
    box('handle', 'body', [-0.10, 0.66, -0.03], [0.10, 0.70, 0.03]),
    box('panel', 'panel', [-0.15, 0.40, 0.17], [0.15, 0.58, 0.18]),
    turned('flow-meter', 'glass', 'y', [[0, 0], [0, 0.012], [0.10, 0.012], [0.10, 0]], [-0.08, 0.44, 0.19]),
    turned('humidifier', 'glass', 'y', [[0, 0], [0, 0.035], [0.12, 0.035], [0.12, 0]], [0.08, 0.24, 0.205]),
    box('switch', 'switch', [0.04, 0.50, 0.18], [0.10, 0.54, 0.19]),
    box('grille', 'panel', [-0.15, 0.12, -0.18], [0.15, 0.32, -0.17]),
  ] + [
    turned('caster-%d' % i, 'caster', 'x', [[0, 0], [0, 0.03], [0.025, 0.03], [0, 0]], [[-0.17, 0.145][i % 2], 0.03, [-0.13, 0.13][std.floor(i / 2)]])
    for i in std.range(0, 3)
  ], { body: 'plastic-white', panel: 'plastic-grey', glass: 'glass-clear', switch: 'plastic-green', caster: 'rubber-black' }),
]
