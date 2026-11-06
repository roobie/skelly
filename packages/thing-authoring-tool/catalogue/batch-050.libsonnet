local h = import '../compound.libsonnet';
local box = h.box;
// A hollow turned vessel standing on y: outer [height, radius] points from the base up to the rim, then the wall
// `t` thick coming back down to a floor `t` thick, so the open mouth shows inside.
local vessel(id, slot, outer, t, origin=[0, 0, 0]) =
  local top = outer[std.length(outer) - 1];
  h.turned(id, slot, 'y', [[0, 0]] + outer + [[top[0], top[1] - t]] + [[if p[0] == 0 then t else p[0], p[1] - t] for p in std.reverse(outer[0:std.length(outer) - 1])] + [[t, 0]], origin);
// A closed loop of round wire lying on y at height y, centre radius r, wire radius w.
local ring(id, slot, r, w, y, x=0, z=0) = h.turned(id, slot, 'y', [[0, r - w], [0, r + w], [2 * w, r + w], [2 * w, r - w], [0, r - w]], [x, y, z]);
[
  // A wooden fruit and cider press 500 mm wide, 440 mm deep and 900 mm tall: a heavy plank base with a pouring lip
  // at the front, two posts and a crossbeam carrying an iron screw, and a hooped slatted basket under the pressing
  // block. It stands where it is used.
  h.compound('screw_press', 34, [
    box('base', 'wood', [-0.25, 0.06, -0.22], [0.25, 0.14, 0.2]),
    box('foot-l', 'wood', [-0.25, 0, -0.22], [-0.19, 0.06, 0.2]),
    box('foot-r', 'wood', [0.19, 0, -0.22], [0.25, 0.06, 0.2]),
    // The juice tray rim and its spout at the front.
    box('rim-b', 'wood', [-0.2, 0.14, -0.2], [0.2, 0.16, -0.18]),
    box('rim-l', 'wood', [-0.2, 0.14, -0.2], [-0.18, 0.16, 0.18]),
    box('rim-r', 'wood', [0.18, 0.14, -0.2], [0.2, 0.16, 0.18]),
    box('lip', 'wood', [-0.03, 0.1, 0.2], [0.03, 0.13, 0.24]),
    box('post-l', 'wood', [-0.25, 0.14, -0.04], [-0.19, 0.84, 0.04]),
    box('post-r', 'wood', [0.19, 0.14, -0.04], [0.25, 0.84, 0.04]),
    box('beam', 'wood', [-0.27, 0.72, -0.05], [0.27, 0.82, 0.05]),
    // The slatted basket: an oak tub with dark gaps between staves, bound by two iron hoops.
    h.turned('tub', 'wood', 'y', [[0, 0.13], [0, 0.15], [0.3, 0.15], [0.3, 0.13], [0, 0.13]], [0, 0.16, 0]),
  ] + [
    box('gap-%d' % i, 'gap', [-0.004 + 0.151 * std.sin(i * std.pi / 6) - 0.002, 0.16, 0.151 * std.cos(i * std.pi / 6) - 0.004], [0.004 + 0.151 * std.sin(i * std.pi / 6), 0.46, 0.151 * std.cos(i * std.pi / 6) + 0.004])
    for i in std.range(0, 11)
  ] + [
    ring('hoop-a', 'iron', 0.152, 0.006, 0.2),
    ring('hoop-b', 'iron', 0.152, 0.006, 0.4),
    // The pressing block sitting in the mouth of the basket, the screw rising from it through the beam, and the
    // tommy bar through its head.
    h.disc('block', 'wood', 0.125, 0.44, 0.5),
    h.disc('screw', 'iron', 0.02, 0.5, 0.9),
  ] + [
    ring('thread-%d' % i, 'iron', 0.022, 0.003, 0.52 + i * 0.03)
    for i in std.range(0, 5)
  ] + [
    h.disc('nut', 'iron', 0.04, 0.82, 0.86),
    h.disc('head', 'iron', 0.03, 0.86, 0.9),
    box('bar', 'iron', [-0.2, 0.87, -0.01], [0.2, 0.89, 0.01]),
  ], { wood: 'wood-oak', gap: 'paint-charcoal', iron: 'iron-dull' }) + { voxelGrain: 0.008 },

  // A shallow woven sieve 240 mm across and 45 mm deep: a coiled rim of plant strips round a tight basket-weave
  // floor.
  h.compound('sieve_primitive', 0.11, [
    vessel('tray', 'weave', [[0, 0.11], [0.04, 0.12]], 0.004),
    ring('rim', 'rim', 0.12, 0.004, 0.038),
    // The floor: dark gaps under a basket weave of strips 8 mm wide.
    h.disc('floor', 'gap', 0.108, 0.004, 0.005),
  ] + [
    local x = -0.1 + i * 0.0125, c = std.sqrt(0.0121 - x * x) - 0.004;
    box('warp-%d' % i, if i % 2 == 0 then 'weave' else 'strip', [x - 0.004, 0.005, -c], [x + 0.004, 0.007, c])
    for i in std.range(0, 16)
  ] + [
    local z = -0.1 + i * 0.0125, c = std.sqrt(0.0121 - z * z) - 0.004;
    box('weft-%d' % i, if i % 2 == 0 then 'strip' else 'weave', [-c, 0.006, z - 0.004], [c, 0.008, z + 0.004])
    for i in std.range(0, 16)
  ], { weave: 'straw-wicker', strip: 'plant-dried', rim: 'plant-dried', gap: 'bark' }) + { voxelGrain: 0.002 },

  // A laboratory test sieve 200 mm across and 50 mm tall: a polished stainless frame with a stepped skirt that
  // nests on the next sieve, and a fine woven mesh across its middle.
  h.compound('sieve_steel', 0.61, [
    vessel('frame', 'frame', [[0, 0.094], [0.012, 0.094], [0.012, 0.1], [0.05, 0.1]], 0.002),
    ring('lip', 'frame', 0.1, 0.002, 0.046),
    h.disc('mesh', 'mesh', 0.093, 0.012, 0.014),
  ] + [
    local z = -0.084 + i * 0.008, c = std.sqrt(0.0086 - z * z);
    box('wire-x-%d' % i, 'wire', [-c, 0.014, z - 0.001], [c, 0.016, z + 0.001])
    for i in std.range(0, 21)
  ] + [
    local x = -0.084 + i * 0.008, c = std.sqrt(0.0086 - x * x);
    box('wire-z-%d' % i, 'wire', [x - 0.001, 0.014, -c], [x + 0.001, 0.016, c])
    for i in std.range(0, 21)
  ] + [
    // A stamped label plate on the front of the frame.
    box('label', 'label', [-0.025, 0.022, 0.099], [0.025, 0.036, 0.102]),
  ], { frame: 'steel-stainless', mesh: 'steel-grey', wire: 'steel-bright', label: 'brass' }) + { voxelGrain: 0.002 },

  // A hand sieve twisted from stiff wire: a loop 130 mm across holding a disc of fine mesh, its two wire ends
  // twisted into a 120 mm handle with a hanging loop, 255 mm overall. Lies along x, handle to +x.
  h.compound('sieve_steel_makeshift', 0.15, [
    ring('frame', 'wire', 0.065, 0.002, 0.0, -0.06, 0),
    h.disc('mesh', 'mesh', 0.064, 0.001, 0.003, -0.06, 0),
  ] + [
    local z = -0.054 + i * 0.012, c = std.sqrt(0.0039 - z * z);
    box('strand-%d' % i, 'strand', [-0.06 - c, 0.002, z - 0.001], [-0.06 + c, 0.004, z + 0.001])
    for i in std.range(0, 9)
  ] + [
    // The twisted handle: two wires wound round each other, drawn as alternating offsets.
    box('twist-%d' % i, 'wire', [0.005 + i * 0.012, 0.0, -0.003 + (i % 2) * 0.002], [0.017 + i * 0.012, 0.004, -0.001 + (i % 2) * 0.002])
    for i in std.range(0, 9)
  ] + [
    ring('loop', 'wire', 0.012, 0.002, 0.0, 0.135, 0),
  ], { wire: 'steel-bright', mesh: 'steel-grey', strand: 'steel-stainless' }) + {
    voxelGrain: 0.002,
    handling: h.gripOn('sieve_steel_makeshift', 'twist-5'),
  },

  // A countertop shaved-ice maker 240 mm wide, 190 mm deep and 300 mm tall: a red housing with a clear ice hopper
  // on top under a push-down lid, a chute at the front and a clear catch tray on the base.
  h.compound('snow_machine_home', 1.4, [
    box('plinth', 'body', [-0.12, 0, -0.095], [0.12, 0.025, 0.095]),
    box('tower', 'body', [-0.085, 0.025, -0.095], [0.085, 0.2, -0.005]),
    box('neck', 'body', [-0.05, 0.12, -0.005], [0.05, 0.2, 0.04]),
    // The chute under the blade housing, open at the front.
    box('chute', 'trim', [-0.035, 0.1, 0.0], [0.035, 0.12, 0.06]),
    box('chute-mouth', 'dark', [-0.028, 0.098, 0.005], [0.028, 0.1, 0.055]),
    h.disc('hopper', 'clear', 0.07, 0.2, 0.27, 0, -0.03),
    ring('collar', 'trim', 0.07, 0.004, 0.2, 0, -0.03),
    h.disc('lid', 'trim', 0.073, 0.27, 0.282, 0, -0.03),
    h.disc('pusher', 'trim', 0.02, 0.282, 0.3, 0, -0.03),
    // Ice inside the hopper, drawn as a pale fill below the lid.
    h.disc('ice', 'ice', 0.06, 0.205, 0.24, 0, -0.03),
    // The catch tray.
    vessel('tray', 'clear', [[0, 0.055], [0.035, 0.06]], 0.003, [0, 0.025, 0.035]),
    h.disc('snow', 'ice', 0.04, 0.035, 0.07, 0, 0.035),
    // The power switch on the front of the tower.
    box('switch', 'trim', [0.055, 0.15, -0.005], [0.075, 0.17, 0.002]),
  ], { body: 'plastic-red', clear: 'plastic-clear', trim: 'plastic-white', dark: 'paint-charcoal', ice: 'chalk-white' }) + { voxelGrain: 0.004 },

  // A copper pot still 620 mm wide and 560 mm tall: a riveted boiler 300 mm across with a domed shoulder, a column
  // and helmet with a thermometer port, a swan-neck arm running down to a worm tub with a tap at the front.
  h.compound('still', 18, [
    h.turned('boiler', 'copper', 'y', [[0, 0], [0, 0.14], [0.02, 0.15], [0.22, 0.15], [0.27, 0.12], [0.3, 0.07], [0.31, 0.045], [0.31, 0]], [-0.15, 0, 0]),
    ring('seam', 'brass', 0.15, 0.004, 0.11, -0.15, 0),
    h.disc('column', 'copper', 0.04, 0.31, 0.46, -0.15, 0),
    h.turned('helmet', 'copper', 'y', [[0, 0], [0, 0.05], [0.04, 0.06], [0.08, 0.05], [0.1, 0.02], [0.1, 0]], [-0.15, 0.46, 0]),
    // The thermometer port and its dial, facing the front.
    h.turned('port', 'brass', 'z', [[0, 0], [0, 0.012], [0.03, 0.012], [0.03, 0]], [-0.15, 0.5, 0.04]),
    h.turned('dial', 'dial', 'z', [[0, 0], [0, 0.022], [0.008, 0.022], [0.008, 0]], [-0.15, 0.5, 0.07]),
    // The lyne arm, stepping down from the helmet to the worm tub.
  ] + [
    h.turned('arm-%d' % i, 'copper', 'x', [[0, 0], [0, 0.016], [0.036, 0.016], [0.036, 0]], [-0.1 + i * 0.034, 0.52 - i * 0.022, 0])
    for i in std.range(0, 7)
  ] + [
    vessel('tub', 'tub', [[0, 0.11], [0.36, 0.11]], 0.004, [0.2, 0, 0]),
    ring('tub-hoop-a', 'brass', 0.11, 0.004, 0.06, 0.2, 0),
    ring('tub-hoop-b', 'brass', 0.11, 0.004, 0.3, 0.2, 0),
    h.disc('water', 'water', 0.105, 0.004, 0.33, 0.2, 0),
    // The top turn of the worm coil, showing in the water, and its outlet tap at the front.
    ring('worm', 'copper', 0.07, 0.008, 0.31, 0.2, 0),
    h.turned('outlet', 'copper', 'z', [[0, 0], [0, 0.008], [0.05, 0.008], [0.05, 0]], [0.2, 0.05, 0.1]),
    box('tap', 'brass', [0.19, 0.035, 0.14], [0.21, 0.065, 0.16]),
    // Two drop handles on the boiler.
    box('handle-l', 'brass', [-0.315, 0.2, -0.02], [-0.295, 0.24, 0.02]),
    // A drain tap at the boiler's foot.
    h.turned('drain', 'brass', 'z', [[0, 0], [0, 0.01], [0.04, 0.01], [0.04, 0]], [-0.15, 0.04, 0.14]),
  ], { copper: 'copper', brass: 'brass', dial: 'paint-white', tub: 'steel-galvanised', water: 'water' }) + { voxelGrain: 0.004 },

  // A home-made mess kit laid out together, 240 mm across: a steel billy can with a wire bail and a lid, a
  // kerosene burner with a pump, pot supports and a brass burner head, and a glass jar of fuel in front.
  h.compound('survivor_mess_kit', 1.3, [
    vessel('pot', 'steel', [[0, 0.07], [0.11, 0.07]], 0.002, [-0.05, 0, -0.02]),
    h.disc('lid', 'steel', 0.073, 0.11, 0.116, -0.05, -0.02),
    h.disc('lid-knob', 'black', 0.012, 0.116, 0.128, -0.05, -0.02),
    // The bail, lifted over the lid.
    box('bail-l', 'wire', [-0.124, 0.09, -0.022], [-0.12, 0.16, -0.018]),
    box('bail-r', 'wire', [0.02, 0.09, -0.022], [0.024, 0.16, -0.018]),
    box('bail-top', 'wire', [-0.124, 0.16, -0.022], [0.024, 0.164, -0.018]),
    // The burner: a sooted fuel tank, a pump plunger, a brass head and three pot supports.
    h.disc('tank', 'tank', 0.045, 0, 0.06, 0.075, -0.03),
    h.disc('pump', 'brass', 0.006, 0.06, 0.085, 0.045, 0.0),
    h.disc('riser', 'brass', 0.008, 0.06, 0.09, 0.075, -0.03),
    h.disc('head', 'brass', 0.022, 0.09, 0.1, 0.075, -0.03),
    h.disc('flame-ring', 'soot', 0.016, 0.1, 0.102, 0.075, -0.03),
  ] + [
    box('support-%d' % i, 'steel', [0.075 + 0.03 * std.sin(i * 2.094) - 0.003, 0.06, -0.03 + 0.03 * std.cos(i * 2.094) - 0.003], [0.075 + 0.03 * std.sin(i * 2.094) + 0.003, 0.108, -0.03 + 0.03 * std.cos(i * 2.094) + 0.003])
    for i in std.range(0, 2)
  ] + [
    // A stoppered glass jar of kerosene.
    vessel('jar', 'glass', [[0, 0.025], [0.07, 0.025]], 0.002, [0.095, 0, 0.07]),
    h.disc('fuel', 'fuel', 0.023, 0.002, 0.05, 0.095, 0.07),
    h.disc('cork', 'cork', 0.022, 0.07, 0.082, 0.095, 0.07),
    // A spoon lying in front of the pot.
    box('spoon-handle', 'steel', [-0.115, 0, 0.065], [-0.035, 0.003, 0.073]),
    h.disc('spoon-bowl', 'steel', 0.016, 0, 0.006, -0.02, 0.069),
  ], { steel: 'steel-stainless', black: 'plastic-black', wire: 'steel-bright', tank: 'steel-grey', brass: 'brass', soot: 'coal-black', glass: 'glass-clear', fuel: 'fuel-amber', cork: 'cork' }) + { voxelGrain: 0.002 },

  // A stainless teapot 120 mm across and 125 mm tall over its knob, 175 mm from the spout tip to the back of the
  // loop handle; spout to +x.
  h.compound('teapot', 0.45, [
    h.turned('body', 'steel', 'y', [[0, 0], [0, 0.05], [0.01, 0.058], [0.05, 0.06], [0.085, 0.052], [0.1, 0.04], [0.1, 0]]),
    h.disc('lid', 'steel', 0.04, 0.1, 0.108),
    h.turned('knob', 'black', 'y', [[0, 0], [0, 0.006], [0.008, 0.01], [0.016, 0.008], [0.017, 0]], [0, 0.108, 0]),
  ] + [
    // The spout, rising in steps from the belly.
    h.turned('spout-%d' % i, 'steel', 'x', [[0, 0], [0, 0.011 - i * 0.0007], [0.01, 0.0105 - i * 0.0007], [0.01, 0]], [0.05 + i * 0.0055, 0.03 + i * 0.0065, 0])
    for i in std.range(0, 9)
  ] + [
    // The loop handle at the back, with a black grip.
    box('handle-top', 'steel', [-0.075, 0.084, -0.006], [-0.045, 0.092, 0.006]),
    box('handle-low', 'steel', [-0.075, 0.03, -0.006], [-0.05, 0.038, 0.006]),
    box('grip', 'black', [-0.075, 0.03, -0.007], [-0.065, 0.092, 0.007]),
  ], { steel: 'steel-stainless', black: 'plastic-black' }) + { voxelGrain: 0.002 },

  // A two-slice toaster 270 mm wide, 160 mm deep and 190 mm tall: a brushed metal shell on a black base, two
  // bread slots in the top, and a carriage lever, browning dial and cancel button on the front.
  h.compound('toaster', 1.8, [
    box('base', 'black', [-0.135, 0, -0.08], [0.135, 0.015, 0.08]),
    box('shell', 'metal', [-0.13, 0.015, -0.075], [0.13, 0.182, 0.075]),
    box('top-b', 'metal', [-0.13, 0.182, -0.075], [0.13, 0.19, -0.04]),
    box('top-m', 'metal', [-0.13, 0.182, -0.022], [0.13, 0.19, 0.022]),
    box('top-f', 'metal', [-0.13, 0.182, 0.04], [0.13, 0.19, 0.075]),
    box('top-l', 'metal', [-0.13, 0.182, -0.075], [-0.11, 0.19, 0.075]),
    box('top-r', 'metal', [0.11, 0.182, -0.075], [0.13, 0.19, 0.075]),
    box('slot-a', 'dark', [-0.11, 0.17, -0.04], [0.11, 0.19, -0.022]),
    box('slot-b', 'dark', [-0.11, 0.17, 0.022], [0.11, 0.19, 0.04]),
    // The control strip and its lever, dial and button.
    box('panel', 'black', [0.07, 0.03, 0.075], [0.12, 0.17, 0.078]),
    box('lever', 'black', [0.08, 0.135, 0.078], [0.11, 0.15, 0.1]),
    h.turned('dial', 'black', 'z', [[0, 0], [0, 0.011], [0.012, 0.009], [0.012, 0]], [0.095, 0.075, 0.078]),
    box('button', 'red', [0.088, 0.04, 0.078], [0.102, 0.052, 0.084]),
    box('crumb-tray', 'black', [-0.1, 0.0, 0.08], [0.0, 0.012, 0.083]),
  ], { metal: 'steel-stainless', black: 'plastic-black', dark: 'paint-charcoal', red: 'plastic-red' }) + { voxelGrain: 0.004 },

  // A countertop vacuum sealer 350 mm long, 150 mm deep and 80 mm tall: a silver base with a black hinged lid,
  // a latch at each end, a soft-touch button strip along the front and the cutter rail on top.
  h.compound('vac_sealer', 2.3, [
    box('base', 'metal', [-0.175, 0, -0.075], [0.175, 0.045, 0.075]),
    box('lid', 'black', [-0.17, 0.045, -0.072], [0.17, 0.075, 0.05]),
    box('lid-front', 'black', [-0.17, 0.045, 0.05], [0.17, 0.065, 0.072]),
    box('panel', 'panel', [-0.1, 0.065, 0.05], [0.1, 0.067, 0.07]),
  ] + [
    box('button-%d' % i, if i == 3 then 'red' else 'white', [-0.085 + i * 0.045, 0.067, 0.055], [-0.065 + i * 0.045, 0.069, 0.065])
    for i in std.range(0, 3)
  ] + [
    box('latch-l', 'grey', [-0.17, 0.05, -0.05], [-0.15, 0.08, 0.05]),
    box('latch-r', 'grey', [0.15, 0.05, -0.05], [0.17, 0.08, 0.05]),
    // The bag cutter rail across the back of the lid.
    box('rail', 'grey', [-0.14, 0.075, -0.06], [0.14, 0.081, -0.045]),
    box('cutter', 'red', [0.06, 0.081, -0.062], [0.075, 0.088, -0.043]),
  ], { metal: 'steel-stainless', black: 'plastic-black', panel: 'screen-black', white: 'plastic-white', red: 'plastic-red', grey: 'plastic-grey' }) + { voxelGrain: 0.004 },

  // A cast aluminium stovetop waffle iron 300 mm long: a closed round mould 160 mm across and 45 mm thick with a
  // grid cast into its top, hinged at -x, and two long handles with wooden grips running to +x.
  h.compound('waffleiron', 1.3, [
    h.disc('lower', 'alu', 0.08, 0.0, 0.02, -0.06, 0),
    h.disc('upper', 'alu', 0.08, 0.022, 0.042, -0.06, 0),
    h.disc('seam', 'dark', 0.078, 0.02, 0.022, -0.06, 0),
  ] + [
    box('rib-x-%d' % i, 'rib', [-0.06 - std.sqrt(0.0049 - std.pow(-0.06 + i * 0.02, 2)), 0.042, -0.061 + i * 0.02], [-0.06 + std.sqrt(0.0049 - std.pow(-0.06 + i * 0.02, 2)), 0.046, -0.059 + i * 0.02])
    for i in std.range(0, 6)
  ] + [
    box('rib-z-%d' % i, 'rib', [-0.061 + (-0.06 + i * 0.02), 0.042, -std.sqrt(0.0049 - std.pow(-0.06 + i * 0.02, 2))], [-0.059 + (-0.06 + i * 0.02), 0.046, std.sqrt(0.0049 - std.pow(-0.06 + i * 0.02, 2))])
    for i in std.range(0, 6)
  ] + [
    box('hinge', 'alu', [-0.152, 0.012, -0.02], [-0.138, 0.032, 0.02]),
    box('arm-lower', 'alu', [0.015, 0.006, -0.012], [0.08, 0.014, -0.004]),
    box('arm-upper', 'alu', [0.015, 0.028, 0.004], [0.08, 0.036, 0.012]),
    h.rod('grip-lower', 'wood', 0.008, 0.08, 0.15, 0.01) + { origin: [0.08, 0.01, -0.008] },
    h.rod('grip-upper', 'wood', 0.008, 0.08, 0.15, 0.032) + { origin: [0.08, 0.032, 0.008] },
  ], { alu: 'alu-bare', rib: 'steel-grey', dark: 'paint-charcoal', wood: 'wood-walnut' }) + { voxelGrain: 0.002 },

  // A slow sand filter in a 20 litre bucket, 300 mm across the rim and 370 mm tall: a white pail filled with sand
  // over gravel, a wire bail handle and a blue drip tap low on the front.
  h.compound('water_filter_sand', 31, [
    vessel('bucket', 'bucket', [[0, 0.13], [0.35, 0.15], [0.37, 0.152]], 0.004),
    ring('rib-a', 'bucket', 0.149, 0.004, 0.3),
    ring('rib-b', 'bucket', 0.15, 0.004, 0.33),
    // The sand bed, a layer of gravel under it shows only at the floor.
    h.turned('sand', 'sand', 'y', [[0, 0], [0, 0.126], [0.34, 0.145], [0.34, 0]], [0, 0.004, 0]),
    // A ring of washed gravel round the inlet in the middle of the sand.
  ] + [
    h.ball('pebble-%d' % i, 'gravel', 0.012, 0.05 * std.sin(i * 1.047), 0.346, 0.05 * std.cos(i * 1.047), 0.6)
    for i in std.range(0, 5)
  ] + [
    box('ear-l', 'bucket', [-0.158, 0.33, -0.012], [-0.15, 0.36, 0.012]),
    box('ear-r', 'bucket', [0.15, 0.33, -0.012], [0.158, 0.36, 0.012]),
    // The bail handle, folded back behind the rim.
    box('bail-l', 'wire', [-0.162, 0.34, -0.166], [-0.158, 0.345, 0.0]),
    box('bail-r', 'wire', [0.158, 0.34, -0.166], [0.162, 0.345, 0.0]),
    box('bail-back', 'wire', [-0.162, 0.34, -0.166], [0.162, 0.345, -0.162]),
    box('bail-grip', 'tap', [-0.05, 0.338, -0.17], [0.05, 0.347, -0.158]),
    // The drip tap.
    h.turned('spigot', 'tap', 'z', [[0, 0], [0, 0.01], [0.035, 0.01], [0.035, 0]], [0, 0.04, 0.13]),
    box('tap-lever', 'tap', [-0.004, 0.05, 0.15], [0.004, 0.075, 0.162]),
    box('tap-nozzle', 'tap', [-0.006, 0.02, 0.155], [0.006, 0.035, 0.167]),
  ], { bucket: 'plastic-white', sand: 'brick-buff', gravel: 'stone-grey', wire: 'steel-bright', tap: 'plastic-blue' }) + { voxelGrain: 0.004 },

  // A battery water purifier 220 mm tall: a grey housing with a lit display and buttons on the front, a clear
  // filter canister on its side, a pump head on top with an outlet nozzle, and an intake hose coiled at its foot.
  h.compound('water_purifier', 1.1, [
    box('housing', 'body', [-0.07, 0, -0.045], [0.04, 0.2, 0.045]),
    box('cap', 'trim', [-0.072, 0.2, -0.047], [0.042, 0.215, 0.047]),
    box('display', 'lcd', [-0.05, 0.13, 0.045], [0.02, 0.17, 0.047]),
  ] + [
    box('button-%d' % i, if i == 0 then 'green' else 'trim', [-0.05 + i * 0.025, 0.1, 0.045], [-0.035 + i * 0.025, 0.112, 0.05])
    for i in std.range(0, 2)
  ] + [
    box('battery-door', 'trim', [-0.055, 0.02, 0.045], [0.025, 0.07, 0.047]),
    // The filter canister clipped to the right side.
    h.disc('canister', 'clear', 0.032, 0.015, 0.19, 0.075, 0),
    h.disc('cartridge', 'filter', 0.024, 0.02, 0.18, 0.075, 0),
    h.disc('canister-cap', 'trim', 0.034, 0.19, 0.205, 0.075, 0),
    h.disc('canister-base', 'trim', 0.034, 0.0, 0.015, 0.075, 0),
    // The outlet spout on the cap.
    h.turned('spout', 'trim', 'z', [[0, 0], [0, 0.007], [0.04, 0.007], [0.04, 0]], [-0.02, 0.222, 0.0]),
    h.disc('spout-riser', 'trim', 0.008, 0.215, 0.23, -0.02, 0),
    // The intake hose and its strainer, coiled on the ground at the back.
    ring('hose-a', 'hose', 0.05, 0.005, 0.0, -0.02, -0.1),
    ring('hose-b', 'hose', 0.042, 0.005, 0.01, -0.02, -0.1),
    h.turned('strainer', 'trim', 'x', [[0, 0], [0, 0.009], [0.03, 0.009], [0.03, 0]], [0.03, 0.006, -0.1]),
  ], { body: 'plastic-grey', trim: 'plastic-charcoal', lcd: 'lcd-green', green: 'plastic-green', clear: 'plastic-clear-blue', filter: 'paper-white', hose: 'plastic-frosted' }) + { voxelGrain: 0.004 },
]
