local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A knob turned along z, its back face at z0.
local dial(id, slot, x, y, z0, radius, depth) = turned(id, slot, 'z', [[0, 0], [0, radius], [depth, radius], [depth, 0]], [x, y, z0]);
// A wire stub along z from z0 to z1 at (x, y).
local wire(id, slot, x, y, z0, z1) = turned(id, slot, 'z', [[0, 0], [0, 0.003], [z1 - z0, 0.003], [z1 - z0, 0]], [x, y, z0]);
[
  // An oven's broiler drawer, 660 mm wide, 440 mm deep and 90 mm tall: an open sheet-steel tray with
  // runner lips along its sides and an enamelled front panel with a finger pull along its top.
  h.compound('oven_broiler_pan', 4.5, [
    box('floor', 'floor', [-0.31, 0, -0.22], [0.31, 0.006, 0.21]),
    box('side-l', 'tray', [-0.31, 0, -0.22], [-0.304, 0.09, 0.21]),
    box('side-r', 'tray', [0.304, 0, -0.22], [0.31, 0.09, 0.21]),
    box('back', 'tray', [-0.31, 0, -0.22], [0.31, 0.09, -0.214]),
    box('runner-l', 'tray', [-0.33, 0.07, -0.22], [-0.31, 0.078, 0.21]),
    box('runner-r', 'tray', [0.31, 0.07, -0.22], [0.33, 0.078, 0.21]),
    box('front', 'front', [-0.33, -0.01, 0.21], [0.33, 0.11, 0.222]),
    box('pull', 'pull', [-0.2, 0.09, 0.222], [0.2, 0.1, 0.234]),
  ], { tray: 'steel-grey', floor: 'iron-dull', front: 'paint-charcoal', pull: 'steel-stainless' })
  + { voxelGrain: 0.006 },

  // The bare steel body of an electric oven, 600 mm wide, 690 mm tall and 600 mm deep, door, controls and
  // drawer gone: a white shell round a dark enamelled cavity with rack ridges, an empty control bay above and
  // an empty drawer bay below, and cut wires hanging from the control bay.
  h.compound('oven_cabinet', 46, [
    box('foot-a', 'foot', [-0.28, 0, -0.28], [-0.24, 0.02, -0.24]),
    box('foot-b', 'foot', [0.24, 0, -0.28], [0.28, 0.02, -0.24]),
    box('foot-c', 'foot', [-0.28, 0, 0.24], [-0.24, 0.02, 0.28]),
    box('foot-d', 'foot', [0.24, 0, 0.24], [0.28, 0.02, 0.28]),
    box('side-l', 'shell', [-0.3, 0.02, -0.3], [-0.282, 0.69, 0.3]),
    box('side-r', 'shell', [0.282, 0.02, -0.3], [0.3, 0.69, 0.3]),
    box('top', 'shell', [-0.3, 0.672, -0.3], [0.3, 0.69, 0.3]),
    box('bottom', 'shell', [-0.3, 0.02, -0.3], [0.3, 0.038, 0.3]),
    box('back', 'shell', [-0.3, 0.02, -0.3], [0.3, 0.69, -0.282]),
    box('frame-l', 'shell', [-0.282, 0.038, 0.282], [-0.24, 0.672, 0.3]),
    box('frame-r', 'shell', [0.24, 0.038, 0.282], [0.282, 0.672, 0.3]),
    box('frame-mid', 'shell', [-0.24, 0.1, 0.282], [0.24, 0.13, 0.3]),
    box('frame-top', 'shell', [-0.24, 0.54, 0.282], [0.24, 0.56, 0.3]),
    box('cavity-back', 'liner', [-0.282, 0.13, -0.282], [0.282, 0.54, -0.27]),
    box('cavity-l', 'liner', [-0.282, 0.13, -0.282], [-0.27, 0.54, 0.282]),
    box('cavity-r', 'liner', [0.27, 0.13, -0.282], [0.282, 0.54, 0.282]),
    box('cavity-floor', 'liner', [-0.282, 0.13, -0.282], [0.282, 0.142, 0.282]),
    box('cavity-roof', 'liner', [-0.282, 0.528, -0.282], [0.282, 0.54, 0.282]),
    box('bay-back', 'bay', [-0.282, 0.56, -0.282], [0.282, 0.672, -0.27]),
    box('drawer-bay', 'bay', [-0.282, 0.038, -0.282], [0.282, 0.1, -0.27]),
  ] + [
    box('ridge-%d-%s' % [i, s], 'ridge', [if s == 'l' then -0.27 else 0.258, 0.22 + i * 0.1, -0.26], [if s == 'l' then -0.258 else 0.27, 0.23 + i * 0.1, 0.26])
    for i in [0, 1, 2]
    for s in ['l', 'r']
  ] + [
    turned('wire-%d' % i, ['wire-red', 'wire-blue', 'wire-red'][i], 'y', [[0, 0], [0, 0.004], [0.1 - i * 0.02, 0.004], [0.1 - i * 0.02, 0]], [-0.1 + i * 0.08, 0.572 + i * 0.02, 0.27])
    for i in [0, 1, 2]
  ], { foot: 'rubber-black', shell: 'paint-white', liner: 'paint-charcoal', bay: 'steel-galvanised', ridge: 'paint-charcoal', 'wire-red': 'plastic-red', 'wire-blue': 'plastic-blue' })
  + { voxelGrain: 0.006 },

  // An oven's control strip pulled from the cabinet, 650 mm long, 120 mm tall and 25 mm deep: a steel
  // backing under a dark glass fascia with a small green display, four knobs, a circuit board behind and cut
  // wires trailing from the back.
  h.compound('oven_controls', 1.8, [
    box('backing', 'steel', [-0.325, 0, 0], [0.325, 0.12, 0.016]),
    box('fascia', 'fascia', [-0.32, 0.004, 0.016], [0.32, 0.116, 0.02]),
    box('display', 'display', [-0.05, 0.04, 0.02], [0.05, 0.08, 0.022]),
    box('board', 'board', [-0.12, 0.02, -0.008], [0.12, 0.1, 0]),
    dial('knob-a', 'knob', -0.24, 0.06, 0.02, 0.022, 0.024),
    dial('knob-b', 'knob', -0.14, 0.06, 0.02, 0.022, 0.024),
    dial('knob-c', 'knob', 0.14, 0.06, 0.02, 0.022, 0.024),
    dial('knob-d', 'knob', 0.24, 0.06, 0.02, 0.022, 0.024),
    wire('wire-a', 'wire-red', -0.08, 0.05, -0.03, 0),
    wire('wire-b', 'wire-blue', 0, 0.06, -0.035, 0),
    wire('wire-c', 'wire-yellow', 0.08, 0.05, -0.025, 0),
  ], { steel: 'steel-grey', fascia: 'glass-grey', display: 'lcd-green', board: 'circuit-green', knob: 'plastic-black', 'wire-red': 'plastic-red', 'wire-blue': 'plastic-blue', 'wire-yellow': 'plastic-yellow' })
  + { voxelGrain: 0.004 },

  // An electric oven's door, 660 mm wide, 480 mm tall and 50 mm thick, laid face up with its top edge toward
  // +z: an enamelled steel frame round a smoked double-glass window, a bar handle on two posts near the top
  // and the two hinge arms that once held it to the cabinet sticking out from the bottom edge.
  h.compound('oven_door', 17, [
    box('frame', 'frame', [-0.33, 0, -0.24], [0.33, 0.05, 0.24]),
    box('window', 'window', [-0.22, 0.05, -0.15], [0.22, 0.052, 0.13]),
    box('inner-glass', 'window', [-0.24, -0.002, -0.17], [0.24, 0, 0.15]),
    box('post-a', 'handle', [-0.25, 0.05, 0.19], [-0.23, 0.08, 0.21]),
    box('post-b', 'handle', [0.23, 0.05, 0.19], [0.25, 0.08, 0.21]),
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.012], [0.54, 0.012], [0.54, 0]], [-0.27, 0.088, 0.2]),
    box('hinge-a', 'hinge', [-0.29, 0.012, -0.32], [-0.27, 0.03, -0.2]),
    box('hinge-b', 'hinge', [0.27, 0.012, -0.32], [0.29, 0.03, -0.2]),
  ], { frame: 'paint-charcoal', window: 'glass-grey', handle: 'steel-stainless', hinge: 'steel-grey' })
  + { voxelGrain: 0.006 },

  // An electric stovetop lifted off its range, 600 mm wide, 520 mm deep and 45 mm tall: an enamelled steel
  // top with four chrome drip bowls, two large and two small, their coils gone, leaving the white ceramic
  // terminal blocks and cut wires trailing out the back.
  local burners = [
    { x: -0.15, z: 0.12, r: 0.1 },
    { x: 0.16, z: 0.12, r: 0.075 },
    { x: -0.16, z: -0.12, r: 0.075 },
    { x: 0.15, z: -0.12, r: 0.1 },
  ];
  h.compound('oven_stovetop', 9.1, [
    box('pan', 'top', [-0.3, 0, -0.26], [0.3, 0.04, 0.26]),
    box('lip', 'top', [-0.3, 0.04, 0.25], [0.3, 0.045, 0.26]),
  ] + [
    disc('bowl-%d' % i, 'bowl', burners[i].r, 0.04, 0.043, burners[i].x, burners[i].z)
    for i in std.range(0, 3)
  ] + [
    disc('hole-%d' % i, 'hole', burners[i].r * 0.25, 0.043, 0.0445, burners[i].x, burners[i].z)
    for i in std.range(0, 3)
  ] + [
    box('block-%d' % i, 'block', [burners[i].x - burners[i].r - 0.02, 0.043, burners[i].z - 0.015], [burners[i].x - burners[i].r + 0.01, 0.06, burners[i].z + 0.015])
    for i in std.range(0, 3)
  ] + [
    wire('wire-%d' % i, ['wire-red', 'wire-blue'][i % 2], -0.2 + i * 0.13, 0.02, -0.32 + (i % 2) * 0.02, -0.26)
    for i in std.range(0, 3)
  ], { top: 'enamel-white', bowl: 'steel-stainless', hole: 'paint-charcoal', block: 'ceramic-white', 'wire-red': 'plastic-red', 'wire-blue': 'plastic-blue' })
  + { voxelGrain: 0.004 },

  // A 250 ml squeeze bottle of hair dye, 56 mm across and 165 mm tall to the tip of its pointed applicator
  // nozzle, with a dark label and a wide colour swatch band that names the shade.
  h.compound('hair_dye', 0.26, [
    turned('bottle', 'bottle', 'y', [[0, 0], [0, 0.028], [0.11, 0.028], [0.125, 0.014], [0.125, 0]]),
    turned('nozzle', 'bottle', 'y', [[0, 0], [0, 0.012], [0.035, 0.003], [0.035, 0]], [0, 0.125, 0]),
    turned('tip', 'tip', 'y', [[0, 0], [0, 0.004], [0.007, 0.003], [0.007, 0]], [0, 0.158, 0]),
    turned('label', 'label', 'y', [[0, 0], [0, 0.0285], [0.075, 0.0285], [0.075, 0]], [0, 0.02, 0]),
    turned('swatch', 'swatch', 'y', [[0, 0], [0, 0.029], [0.03, 0.029], [0.03, 0]], [0, 0.04, 0]),
  ], { bottle: 'plastic-white', tip: 'plastic-black', label: 'plastic-charcoal', swatch: 'cloth-brown' })
  + h.inHand('hair_dye', 'bottle') + { voxelGrain: 0.004 },

  // A screw-top glass jar 70 mm across and 95 mm tall, filled with clear mineral oil over grey lumps of a
  // reactive metal, with a black lid and a yellow hazard label.
  local lumps = [[-0.012, 0.012, 0.008], [0.014, 0.011, -0.006], [0, 0.01, -0.016], [-0.004, 0.026, 0.004], [0.012, 0.03, 0.012]];
  h.compound('chem_potassium', 0.24, [
    turned('jar', 'glass', 'y', [[0, 0], [0, 0.035], [0.08, 0.035], [0.08, 0.031], [0.004, 0.031], [0.004, 0], [0, 0]]),
    disc('oil', 'oil', 0.031, 0.004, 0.068),
    disc('lid', 'lid', 0.036, 0.08, 0.095),
    turned('label', 'label', 'y', [[0, 0.035], [0, 0.0355], [0.04, 0.0355], [0.04, 0.035], [0, 0.035]], [0, 0.02, 0]),
  ] + [
    h.ball('lump-%d' % i, 'metal', 0.008, lumps[i][0], 0.004 + lumps[i][1], lumps[i][2], 0.7)
    for i in std.range(0, std.length(lumps) - 1)
  ], { glass: 'glass-clear', oil: 'jelly-pale', lid: 'plastic-black', label: 'plastic-yellow', metal: 'iron-dull' })
  + h.inHand('chem_potassium', 'jar') + { voxelGrain: 0.002 },
]
