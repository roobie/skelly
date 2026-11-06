local h = import '../compound.libsonnet';
local box = h.box;
local rad(deg) = deg * std.pi / 180;

// Kitchen and camp cooking gear, standing as found, front on +z.

// A closed ring turned about y from y0 to y1 between radii r0 and r1, centred on (x, z).
local ring(id, slot, r0, r1, y0, y1, x=0, z=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);
// A box standing on y at angle `ang` degrees round the y axis (0 points to +z), its centre `r` out, `w` wide and
// `d` deep: legs, ribs and pot supports set round a turned body.
local around(id, slot, ang, r, w, d, y0, y1) =
  local x = r * std.sin(rad(ang)), z = r * std.cos(rad(ang));
  local hx = std.abs(std.cos(rad(ang))) * w / 2 + std.abs(std.sin(rad(ang))) * d / 2;
  local hz = std.abs(std.sin(rad(ang))) * w / 2 + std.abs(std.cos(rad(ang))) * d / 2;
  box(id, slot, [x - hx, y0, z - hz], [x + hx, y1, z + hz]);

// A flat sachet with a printed band across its face, lying along x; the used one sags and goes lumpy.
local heatPack(used) =
  local t = if used then 0.009 else 0.012;
  h.sachet(0.12, 0.09, t)
  + [box('print', 'print', [-0.045, t, -0.03], [0.02, t + 0.001, 0.03])]
  + (if used then [
       h.ball('lump-%d' % i, 'lump', 0.012, p[0], t, p[1], 0.35)
       for i in std.range(0, 4)
       for p in [[[-0.03, 0.02], [0.01, -0.025], [0.035, 0.01], [-0.01, 0.035], [0.04, -0.03]][i]]
     ] else [
       box('tab', 'tab', [0.03, t, -0.008], [0.048, t + 0.002, 0.008]),
     ]);

[
  // An electric carving knife, 482 mm with its cord stub: a 180 mm moulded handle with a trigger and a blade
  // release button, two 200 mm serrated blades riveted together lying flat, and a short cord with its plug.
  h.compound('carver_off', 0.43, [
    h.turned('handle', 'body', 'x', [[0, 0], [0, 0.012], [0.015, 0.024], [0.06, 0.03], [0.15, 0.027], [0.18, 0.022], [0.18, 0]], [0, 0.03, 0]),
    box('trigger', 'trigger', [0.07, 0.02, 0.026], [0.11, 0.038, 0.034]),
    box('release', 'trigger', [0.135, 0.054, -0.008], [0.155, 0.06, 0.008]),
    box('collar', 'collar', [0.172, 0.018, -0.016], [0.186, 0.042, 0.016]),
    h.prism('blade-a', 'blade', 'y', [[-0.011, 0.186], [0.011, 0.186], [0.011, 0.37], [0, 0.38], [-0.011, 0.372]], 0.026, 0.03),
    h.prism('blade-b', 'blade', 'y', [[-0.011, 0.186], [0.011, 0.186], [0.011, 0.372], [0, 0.38], [-0.011, 0.37]], 0.03, 0.034),
  ] + [
    box('tooth-%d' % i, 'blade', [0.195 + i * 0.016, 0.026, 0.011], [0.203 + i * 0.016, 0.034, 0.014])
    for i in std.range(0, 10)
  ] + [
    box('rivet', 'rivet', [0.355, 0.024, -0.004], [0.363, 0.036, 0.004]),
    h.rod('cord', 'cord', 0.004, -0.075, 0, 0.03),
    box('plug', 'plug', [-0.1, 0.02, -0.012], [-0.075, 0.04, 0.012]),
    box('pin-a', 'pin', [-0.106, 0.026, -0.008], [-0.1, 0.034, -0.006]),
    box('pin-b', 'pin', [-0.106, 0.026, 0.006], [-0.1, 0.034, 0.008]),
  ], { body: 'plastic-white', trigger: 'plastic-charcoal', collar: 'plastic-charcoal', blade: 'steel-stainless', rivet: 'steel-grey', cord: 'plastic-white', plug: 'plastic-white', pin: 'brass' }) + {
    handling: h.gripOn('carver_off', 'handle'),
    voxelGrain: 0.004,
  },

  // A gravity water filter 300 mm tall and 130 mm across: a clear reservoir on top, a cloth pad, then charcoal,
  // sand and gravel in plain bands held by a white frame, a lid with a knob and a tap at the foot.
  h.compound('char_purifier', 1.9, [
    h.disc('foot', 'frame', 0.066, 0, 0.02),
    ring('gravel', 'gravel', 0, 0.062, 0.02, 0.06),
    ring('sand', 'sand', 0, 0.062, 0.06, 0.1),
    ring('charcoal', 'charcoal', 0, 0.062, 0.1, 0.2),
    ring('pad', 'pad', 0, 0.063, 0.2, 0.21),
    h.disc('reservoir', 'reservoir', 0.062, 0.21, 0.28),
    h.disc('lid', 'frame', 0.066, 0.28, 0.292),
    h.disc('knob', 'frame', 0.015, 0.292, 0.3),
  ] + [
    around('rib-%d' % i, 'frame', 45 + 90 * i, 0.063, 0.012, 0.006, 0.02, 0.28)
    for i in std.range(0, 3)
  ] + [
    box('tap', 'tap', [-0.008, 0.006, 0.064], [0.008, 0.02, 0.085]),
    box('tap-lever', 'tap', [-0.004, 0.02, 0.072], [0.004, 0.034, 0.08]),
  ], { frame: 'plastic-white', gravel: 'stone-grey', sand: 'brick-buff', charcoal: 'coal-black', pad: 'cloth-cream', reservoir: 'plastic-clear-blue', tap: 'plastic-blue' }) + {
    voxelGrain: 0.004,
  },

  // A portable bullet smoker 600 mm tall and 300 mm across: a charcoal bowl on three legs, a straight body with a
  // front fuel door and side handles, a domed lid with a vent, a dial thermometer and a top handle.
  h.compound('char_smoker', 10, [
    h.turned('bowl', 'body', 'y', [[0, 0], [0, 0.1], [0.04, 0.14], [0.06, 0.15], [0.06, 0]], [0, 0.1, 0]),
    ring('body', 'body', 0, 0.15, 0.16, 0.46),
    ring('band', 'trim', 0.148, 0.154, 0.455, 0.47),
    h.turned('lid', 'body', 'y', [[0, 0], [0, 0.152], [0.04, 0.14], [0.09, 0.09], [0.115, 0.03], [0.118, 0]], [0, 0.47, 0]),
    h.disc('vent', 'trim', 0.03, 0.586, 0.592),
    box('top-handle', 'handle', [-0.05, 0.6, -0.012], [0.05, 0.622, 0.012]),
    box('top-post-a', 'trim', [-0.045, 0.585, -0.006], [-0.035, 0.6, 0.006]),
    box('top-post-b', 'trim', [0.035, 0.585, -0.006], [0.045, 0.6, 0.006]),
    h.disc('thermo', 'thermo', 0.022, 0, 0.008, 0, 0) + { axis: 'z', origin: [0, 0.53, 0.098] },
    box('door', 'door', [-0.07, 0.19, 0.145], [0.07, 0.33, 0.156]),
    box('door-knob', 'handle', [-0.012, 0.25, 0.156], [0.012, 0.27, 0.172]),
  ] + std.flattenArrays([
    [
      box('handle-%d' % (s + 1), 'handle', [s * 0.15 + (if s < 0 then -0.03 else 0), 0.4, -0.04], [s * 0.15 + (if s < 0 then 0 else 0.03), 0.418, 0.04]),
    ]
    for s in [-1, 1]
  ]) + [
    around('leg-%d' % i, 'leg', 60 + 120 * i, 0.13, 0.02, 0.01, 0, 0.17)
    for i in std.range(0, 2)
  ] + [
    around('foot-%d' % i, 'leg', 60 + 120 * i, 0.13, 0.04, 0.04, 0, 0.008)
    for i in std.range(0, 2)
  ], { body: 'paint-charcoal', trim: 'steel-grey', handle: 'plastic-black', thermo: 'paint-white', door: 'paint-charcoal', leg: 'steel-grey' }),

  // A small charcoal cooker 300 mm tall to the top of its flue: a 120 mm steel tank with a firebox door and a
  // pot grate on top, a flue pipe out the back that turns up, and a brass pilot valve on the front.
  h.compound('charcoal_cooker', 1.6, [
    h.disc('tank', 'tank', 0.06, 0, 0.14),
    ring('rim', 'rim', 0.054, 0.062, 0.14, 0.15),
    box('grate-a', 'grate', [-0.058, 0.15, -0.004], [0.058, 0.158, 0.004]),
    box('grate-b', 'grate', [-0.004, 0.15, -0.058], [0.004, 0.158, 0.058]),
    box('door', 'door', [-0.03, 0.025, 0.055], [0.03, 0.07, 0.064]),
    box('door-latch', 'rim', [0.016, 0.042, 0.064], [0.026, 0.052, 0.07]),
    h.rod('valve', 'pilot', 0.006, 0, 0.022, 0) + { axis: 'z', origin: [-0.03, 0.105, 0.058] },
    h.disc('valve-knob', 'pilot', 0.009, 0, 0.006) + { axis: 'z', origin: [-0.03, 0.105, 0.08] },
    h.tube('flue-out', 'flue', 0, 0.014, 0, 0.05) + { axis: 'z', origin: [0, 0.11, -0.1] },
    ring('flue-up', 'flue', 0.01, 0.014, 0.096, 0.3, 0, -0.105),
    ring('flue-cap', 'rim', 0.01, 0.02, 0.29, 0.296, 0, -0.105),
  ], { tank: 'iron-dull', rim: 'steel-grey', grate: 'iron-cast', door: 'iron-cast', pilot: 'brass', flue: 'steel-galvanised' }) + {
    voxelGrain: 0.004,
  },

  // A crude hand-built clay pot 150 mm tall and 190 mm across the belly, open at the top, with two lugs.
  h.compound('clay_pot', 0.68, [
    h.turned('pot', 'pot', 'y', [
      [0, 0], [0, 0.06], [0.02, 0.085], [0.07, 0.095], [0.12, 0.08], [0.135, 0.074], [0.145, 0.08], [0.152, 0.08],
      [0.152, 0.071], [0.135, 0.066], [0.12, 0.072], [0.07, 0.087], [0.025, 0.077], [0.01, 0.05], [0.01, 0],
    ]),
    box('lug-a', 'pot', [-0.106, 0.1, -0.015], [-0.082, 0.112, 0.015]),
    box('lug-b', 'pot', [0.082, 0.1, -0.015], [0.106, 0.112, 0.015]),
  ], { pot: 'clay-terracotta' }) + {
    voxelGrain: 0.004,
  },

  // A round clay teapot 140 mm tall to the lid knob and 230 mm from spout to handle: a squat body, a lid with a
  // knob, a spout rising to +x and a loop handle on -x.
  h.compound('clay_teapot', 0.61, [
    h.turned('body', 'body', 'y', [[0, 0], [0, 0.045], [0.01, 0.06], [0.045, 0.068], [0.08, 0.058], [0.1, 0.042], [0.1, 0]]),
    h.turned('lid', 'lid', 'y', [[0, 0], [0, 0.044], [0.006, 0.044], [0.016, 0.03], [0.018, 0.008], [0.03, 0.01], [0.034, 0]], [0, 0.1, 0]),
    h.prism('spout', 'body', 'z', [[0.05, 0.02], [0.068, 0.025], [0.118, 0.098], [0.106, 0.104], [0.055, 0.06]], -0.009, 0.009),
    box('handle-top', 'body', [-0.1, 0.075, -0.007], [-0.05, 0.088, 0.007]),
    box('handle-bottom', 'body', [-0.095, 0.022, -0.007], [-0.055, 0.034, 0.007]),
    box('handle-back', 'body', [-0.112, 0.03, -0.007], [-0.096, 0.086, 0.007]),
  ], { body: 'clay-terracotta', lid: 'clay-terracotta' }) + {
    voxelGrain: 0.004,
  },

  // A drip coffeemaker 250 mm tall, 180 mm wide and 220 mm deep: a base with a warming plate under a glass carafe,
  // a water tower at the back, a head over the filter basket and a red switch on the front.
  h.compound('coffeemaker', 1.2, [
    box('base', 'body', [-0.09, 0, -0.11], [0.09, 0.03, 0.11]),
    box('tower', 'body', [-0.09, 0.03, -0.11], [0.09, 0.25, -0.04]),
    box('head', 'body', [-0.09, 0.19, -0.04], [0.09, 0.25, 0.1]),
    box('gauge', 'gauge', [0.09, 0.08, -0.1], [0.092, 0.2, -0.085]),
    h.disc('plate', 'plate', 0.058, 0.03, 0.034, 0, 0.035),
    h.turned('basket', 'basket', 'y', [[0, 0], [0, 0.02], [0.03, 0.055], [0.03, 0]], [0, 0.16, 0.035]),
    h.turned('carafe', 'carafe', 'y', [[0, 0], [0, 0.058], [0.08, 0.06], [0.1, 0.045], [0.11, 0.04], [0.11, 0]], [0, 0.034, 0.035]),
    h.turned('coffee', 'coffee', 'y', [[0, 0], [0, 0.054], [0.05, 0.056], [0.05, 0]], [0, 0.038, 0.035]),
    ring('collar', 'body', 0.038, 0.045, 0.124, 0.144, 0, 0.035),
    box('carafe-handle-top', 'body', [-0.007, 0.124, 0.075], [0.007, 0.136, 0.115]),
    box('carafe-handle', 'body', [-0.007, 0.06, 0.103], [0.007, 0.136, 0.115]),
    box('carafe-handle-low', 'body', [-0.007, 0.06, 0.09], [0.007, 0.07, 0.115]),
    box('switch', 'switch', [0.04, 0.008, 0.11], [0.07, 0.022, 0.114]),
  ], { body: 'plastic-black', gauge: 'plastic-clear', plate: 'steel-grey', basket: 'plastic-charcoal', carafe: 'glass-clear', coffee: 'wood-walnut', switch: 'plastic-red' }) + {
    voxelGrain: 0.004,
  },

  // A small glass 50 mm across holding sugar syrup, a wooden skewer clipped across the rim by a peg and hung in
  // the syrup, its lower half crusted with sugar crystals.
  h.compound('crystallizing_sugar', 0.13, [
    h.turned('glass', 'glass', 'y', [[0, 0], [0, 0.025], [0.06, 0.027], [0.06, 0.024], [0.004, 0.022], [0.004, 0]]),
    h.disc('syrup', 'syrup', 0.022, 0.004, 0.045),
    h.disc('skewer', 'skewer', 0.002, 0.012, 0.11),
    box('peg', 'peg', [-0.004, 0.06, -0.032], [0.004, 0.068, 0.032]),
    box('peg-spring', 'spring', [-0.0045, 0.062, -0.006], [0.0045, 0.066, 0.006]),
  ] + [
    h.ball('crystal-%d' % i, 'crystal', 0.005, p[0], 0.016 + i * 0.006, p[1], 1.2)
    for i in std.range(0, 4)
    for p in [[[0.003, 0.0], [-0.002, 0.003], [0, -0.003], [0.003, 0.002], [-0.003, -0.001]][i]]
  ], { glass: 'glass-clear', syrup: 'resin-honey', skewer: 'wood-birch', peg: 'wood-pine', spring: 'steel-grey', crystal: 'salt-white' }) + h.inHand('crystallizing_sugar', 'glass') + {
    voxelGrain: 0.002,
  },

  // A round stacking food dehydrator 250 mm tall and 280 mm across: a motor base with a dial, five slatted trays
  // and a vented lid.
  h.compound('dehydrator', 1.5, [
    h.turned('base', 'base', 'y', [[0, 0], [0, 0.136], [0.005, 0.14], [0.06, 0.14], [0.06, 0]]),
    h.disc('dial', 'dial', 0.016, 0, 0.01) + { axis: 'z', origin: [0, 0.03, 0.136] },
  ] + std.flattenArrays([
    [
      ring('tray-%d' % i, 'tray', 0, 0.136, 0.06 + i * 0.032, 0.088 + i * 0.032),
      ring('lip-%d' % i, 'lip', 0.132, 0.14, 0.088 + i * 0.032, 0.092 + i * 0.032),
    ]
    for i in std.range(0, 4)
  ]) + [
    h.turned('lid', 'base', 'y', [[0, 0], [0, 0.14], [0.012, 0.136], [0.025, 0.1], [0.03, 0]], [0, 0.22, 0]),
    h.disc('vent', 'dial', 0.03, 0.25, 0.256),
  ], { base: 'plastic-white', dial: 'plastic-charcoal', tray: 'plastic-amber', lip: 'plastic-white' }),

  // A 1 litre glass jar 132 mm tall, left open, full of brine with peeled eggs packed in it.
  h.compound('eggs_ferment', 1.3, [
    h.turned('jar', 'jar', 'y', [
      [0, 0], [0, 0.05], [0.105, 0.05], [0.115, 0.042], [0.132, 0.042],
      [0.132, 0.038], [0.112, 0.038], [0.104, 0.046], [0.004, 0.046], [0.004, 0],
    ]),
    ring('thread', 'thread', 0.041, 0.044, 0.118, 0.128),
    h.turned('brine', 'brine', 'y', [[0, 0], [0, 0.046], [0.1, 0.046], [0.108, 0.038], [0.112, 0.038], [0.112, 0]], [0, 0.004, 0]),
  ] + [
    h.ball('egg-%d' % i, 'egg', 0.02, p[0], p[1], p[2], 1.3)
    for i in std.range(0, 5)
    for p in [[[-0.02, 0.03, 0.0], [0.02, 0.03, 0.005], [0, 0.06, -0.022], [0.0, 0.065, 0.02], [-0.015, 0.098, 0.0], [0.018, 0.1, 0.004]][i]]
  ], { jar: 'glass-clear', thread: 'glass-clear', brine: 'syrup-green', egg: 'wax-cream' }) + h.inHand('eggs_ferment', 'jar') + {
    voxelGrain: 0.004,
  },

  // A folding pocket stove opened out: a 100 by 75 mm base tray with a tablet of fuel on it and two side walls
  // folded up, each with an inward tab to carry a pot.
  h.compound('esbit_stove', 0.1, [
    box('base', 'stove', [-0.05, 0, -0.0375], [0.05, 0.002, 0.0375]),
    box('tray', 'stove', [-0.03, 0.002, -0.022], [0.03, 0.006, 0.022]),
    box('tablet', 'fuel', [-0.016, 0.006, -0.012], [0.016, 0.018, 0.012]),
  ] + std.flattenArrays([
    [
      box('wall-%d' % (s + 1), 'stove', [-0.05, 0, s * 0.0375 - (if s < 0 then 0.002 else 0)], [0.05, 0.062, s * 0.0375 + (if s > 0 then 0.002 else 0)]),
      box('tab-a-%d' % (s + 1), 'stove', [-0.04, 0.058, s * 0.0375 - (if s < 0 then 0 else 0.014)], [-0.028, 0.062, s * 0.0375 + (if s < 0 then 0.014 else 0)]),
      box('tab-b-%d' % (s + 1), 'stove', [0.028, 0.058, s * 0.0375 - (if s < 0 then 0 else 0.014)], [0.04, 0.062, s * 0.0375 + (if s < 0 then 0.014 else 0)]),
      box('vent-%d' % (s + 1), 'vent', [-0.018, 0.012, s * 0.0375 - 0.0022], [0.018, 0.03, s * 0.0375 + 0.0022]),
    ]
    for s in [-1, 1]
  ]), { stove: 'alu-bare', fuel: 'chalk-white', vent: 'plastic-charcoal' }) + h.inHand('esbit_stove', 'base') + {
    voxelGrain: 0.002,
  },

  // A food processor 400 mm tall to the top of its pusher: a motor base with two buttons, a clear bowl with a
  // side handle, a lid with a feed tube on the right and a pusher in it, and a blade on its spindle.
  h.compound('food_processor', 3.1, [
    box('base', 'base', [-0.1, 0, -0.1], [0.1, 0.13, 0.12]),
    box('button-a', 'button', [-0.04, 0.05, 0.12], [-0.01, 0.07, 0.125]),
    box('button-b', 'button', [0.01, 0.05, 0.12], [0.04, 0.07, 0.125]),
    h.turned('bowl', 'bowl', 'y', [[0, 0], [0, 0.09], [0.15, 0.1], [0.15, 0]], [0, 0.13, 0]),
    h.disc('spindle', 'blade', 0.012, 0.13, 0.25),
    box('blade', 'blade', [-0.08, 0.16, -0.008], [0.08, 0.164, 0.008]),
    box('bowl-handle-top', 'bowl', [0.1, 0.25, -0.014], [0.14, 0.266, 0.014]),
    box('bowl-handle', 'bowl', [0.124, 0.15, -0.014], [0.14, 0.266, 0.014]),
    box('bowl-handle-low', 'bowl', [0.09, 0.15, -0.014], [0.14, 0.164, 0.014]),
    h.disc('lid', 'lid', 0.104, 0.28, 0.292),
    h.turned('chute', 'lid', 'y', [[0, 0.028], [0, 0.036], [0.09, 0.036], [0.09, 0.028], [0, 0.028]], [0.045, 0.292, 0]),
    h.disc('pusher', 'pusher', 0.027, 0.3, 0.4, 0.045, 0),
    h.disc('pusher-cap', 'pusher', 0.04, 0.392, 0.4, 0.045, 0),
  ], { base: 'plastic-white', button: 'plastic-charcoal', bowl: 'plastic-clear', blade: 'steel-stainless', lid: 'plastic-clear', pusher: 'plastic-white' }),

  // A pressure stove for petrol 210 mm tall and 140 mm across the pot supports: a brass tank with a filler cap
  // and a pump, a burner on a riser, three legs carrying a pot ring, and a valve key.
  h.compound('gasoline_cooker', 1.5, [
    h.turned('tank', 'tank', 'y', [[0, 0], [0, 0.05], [0.01, 0.055], [0.07, 0.055], [0.095, 0.035], [0.1, 0]]),
    h.disc('cap', 'cap', 0.01, 0.085, 0.104, 0.03, 0),
    h.disc('riser', 'burner', 0.007, 0.1, 0.165),
    h.turned('burner', 'burner', 'y', [[0, 0], [0, 0.012], [0.008, 0.026], [0.02, 0.026], [0.02, 0]], [0, 0.16, 0]),
    ring('pot-ring', 'leg', 0.06, 0.07, 0.205, 0.212),
    h.rod('pump', 'pump', 0.006, 0.05, 0.09, 0.06),
    box('pump-knob', 'cap', [0.09, 0.052, -0.008], [0.098, 0.068, 0.008]),
    box('key', 'key', [-0.065, 0.006, 0.06], [-0.01, 0.01, 0.068]),
    box('key-head', 'key', [-0.075, 0.004, 0.054], [-0.062, 0.012, 0.074]),
  ] + std.flattenArrays([
    [
      around('leg-%d' % i, 'leg', 30 + 120 * i, 0.062, 0.006, 0.006, 0.07, 0.212),
      around('arm-%d' % i, 'leg', 30 + 120 * i, 0.048, 0.006, 0.04, 0.2, 0.212),
      around('clamp-%d' % i, 'leg', 30 + 120 * i, 0.05, 0.016, 0.012, 0.07, 0.078),
    ]
    for i in std.range(0, 2)
  ]), { tank: 'brass', cap: 'brass-dull', burner: 'brass-dull', leg: 'steel-grey', pump: 'steel-grey', key: 'steel-grey' }) + {
    voxelGrain: 0.004,
  },

  // A single-use chemical heat pack, 120 by 90 mm and 12 mm thick, with a pull tab to start it.
  h.compound('heatpack', 0.06, heatPack(false), { pouch: 'plastic-white', crimp: 'plastic-white', print: 'plastic-red', tab: 'plastic-orange' }) + h.inHand('heatpack', 'pouch') + {
    voxelGrain: 0.002,
  },

  // The same pack spent: flatter, gone hard in lumps, its print faded and its tab gone.
  h.compound('heatpack_used', 0.065, heatPack(true), { pouch: 'plastic-grey', crimp: 'plastic-grey', print: 'paint-oxblood', lump: 'plastic-grey' }) + h.inHand('heatpack_used', 'pouch') + {
    voxelGrain: 0.002,
  },
]
