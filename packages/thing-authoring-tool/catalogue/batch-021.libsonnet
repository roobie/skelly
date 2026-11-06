local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A plate insert 250 mm wide and 300 mm tall lying on its back, curved across its width and cut back at the top
// corners. Strip `i` runs from x0 to x1 and is lifted to follow the curve; outlines are [z, x], top at -z.
local plateTop(x) = if std.abs(x) > 0.065 then -0.15 + (std.abs(x) - 0.065) * 0.85 else -0.15;
local plateStrip(id, slot, x0, x1, lift, thick) = h.prism(id, slot, 'y',
                                                          [[0.15, x0], [0.15, x1], [plateTop(x1), x1]]
                                                          + (if x0 < 0.065 && 0.065 < x1 then [[-0.15, 0.065]] else [])
                                                          + (if x0 < -0.065 && -0.065 < x1 then [[-0.15, -0.065]] else [])
                                                          + [[plateTop(x0), x0]],
                                                          lift, lift + thick);
// A household water heater standing on the floor: a white jacket of radius `r` and height `height` with a domed grey
// top, hot and cold copper pipe stubs, a thermostat panel and drain cock low on the front (+z), a relief valve on its
// side and a rating label.
local waterHeater(id, massKg, r, height) = h.compound(id, massKg, [
  turned('jacket', 'jacket', 'y', [[0, 0], [0, r - 0.01], [0.01, r], [height - 0.03, r], [height, r - 0.04], [height, 0]], [0, 0.03, 0]),
  turned('foot', 'trim', 'y', [[0, 0], [0, r - 0.02], [0.03, r - 0.02], [0.03, 0]]),
  disc('cap', 'trim', r * 0.4, height + 0.03, height + 0.05),
  disc('pipe-hot', 'pipe', 0.014, height + 0.02, height + 0.15, -r * 0.5, 0),
  disc('pipe-cold', 'pipe', 0.014, height + 0.02, height + 0.15, r * 0.5, 0),
  disc('union-hot', 'brass', 0.02, height + 0.06, height + 0.09, -r * 0.5, 0),
  disc('union-cold', 'brass', 0.02, height + 0.06, height + 0.09, r * 0.5, 0),
  box('thermostat', 'trim', [-0.08, 0.25, r - 0.03], [0.08, 0.45, r + 0.02]),
  disc('knob', 'red', 0.025, 0, 0.02) + { axis: 'z', origin: [0, 0.36, r + 0.02] },
  box('label', 'label', [-0.1, height * 0.55, r - 0.02], [0.1, height * 0.55 + 0.18, r + 0.003]),
  h.rod('drain', 'brass', 0.012, 0, 0.07, 0.15) + { axis: 'z', origin: [0, 0.15, r - 0.02] },
  disc('drain-cap', 'brass', 0.016, 0.13, 0.17, 0, r + 0.06),
  h.rod('relief', 'brass', 0.014, r - 0.02, r + 0.06, height - 0.12),
  disc('relief-body', 'brass', 0.022, height - 0.15, height - 0.09, r + 0.05, 0),
  disc('relief-pipe', 'pipe', 0.011, height * 0.4, height - 0.13, r + 0.05, 0),
], { jacket: 'enamel-white', trim: 'plastic-grey', pipe: 'copper', brass: 'brass', red: 'plastic-red', label: 'paper-white' });
[
  // A hard steel armour plate, 250 mm wide, 300 mm tall and 8 mm thick, curved across its width with shooter's cuts
  // at the top corners and a stencilled label, lying on its back.
  local xs = [-0.125, -0.075, -0.025, 0.025, 0.075, 0.125], lifts = [0.012, 0.004, 0, 0.004, 0.012];
  h.compound('hard_steel_armor', 4.1, [
    plateStrip('strip-%d' % i, 'steel', xs[i], xs[i + 1], lifts[i], 0.008)
    for i in std.range(0, 4)
  ] + [
    box('label', 'label', [-0.04, 0.008, 0.03], [0.04, 0.0095, 0.08]),
  ], { steel: 'steel-grey', label: 'paint-white' })
  + { voxelGrain: 0.004 },

  // A small mechanical impact fuze 12 mm across and 22 mm long, standing on its threaded base: a steel nose cone
  // with a striker tip and a plastic body band.
  h.compound('impact_fuze', 0.0079, [
    turned('thread', 'thread', 'y', [[0, 0], [0, 0.005], [0.006, 0.005], [0.006, 0]]),
    turned('band', 'band', 'y', [[0, 0], [0, 0.006], [0.006, 0.006], [0.006, 0]], [0, 0.006, 0]),
    turned('nose', 'nose', 'y', [[0, 0], [0, 0.006], [0.004, 0.0055], [0.008, 0.0035], [0.01, 0.002], [0.01, 0]], [0, 0.012, 0]),
  ], { thread: 'brass', band: 'plastic-black', nose: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // A ground glass lens 30 mm across and 4 mm thick at the centre, lying flat.
  h.compound('lens', 0.0038, [
    turned('lens', 'glass', 'y', [[0, 0], [0, 0.015], [0.001, 0.015], [0.0025, 0.011], [0.004, 0]]),
  ], { glass: 'glass-clear' })
  + { voxelGrain: 0.002 },

  // A small ground glass lens 16 mm across and 4 mm thick at the centre, lying flat.
  h.compound('lens_small', 0.0011, [
    turned('lens', 'glass', 'y', [[0, 0], [0, 0.008], [0.001, 0.008], [0.0025, 0.006], [0.004, 0]]),
  ], { glass: 'glass-clear' })
  + { voxelGrain: 0.002 },

  // A household incandescent bulb 60 mm across and 108 mm tall, standing on its screw base: a dark contact tip, a
  // threaded metal cap 27 mm across and a pear-shaped glass bulb.
  h.compound('light_bulb', 0.029, [
    turned('tip', 'tip', 'y', [[0, 0], [0, 0.005], [0.004, 0.006], [0.004, 0]]),
    turned('cap', 'cap', 'y', [
      [0, 0], [0, 0.0125], [0.005, 0.0135], [0.008, 0.0125], [0.011, 0.0135], [0.014, 0.0125], [0.017, 0.0135], [0.02, 0.0125],
      [0.024, 0.0135], [0.024, 0],
    ], [0, 0.004, 0]),
    turned('glass', 'glass', 'y', [
      [0, 0], [0, 0.014], [0.012, 0.017], [0.026, 0.024], [0.042, 0.03], [0.056, 0.03], [0.068, 0.026], [0.076, 0.018],
      [0.08, 0.008], [0.081, 0],
    ], [0, 0.027, 0]),
  ], { tip: 'plastic-black', cap: 'alu-bare', glass: 'glass-clear' })
  + { voxelGrain: 0.002 },

  // A small brass padlock 30 mm wide, 14 mm deep and 32 mm tall with a steel shackle above it, its key still in the
  // keyway on the front face.
  h.compound('lock', 0.11, [
    box('body', 'body', [-0.015, 0, -0.007], [0.015, 0.032, 0.007]),
    box('leg-a', 'shackle', [-0.012, 0.032, -0.0025], [-0.007, 0.046, 0.0025]),
    box('leg-b', 'shackle', [0.007, 0.032, -0.0025], [0.012, 0.046, 0.0025]),
    box('arch', 'shackle', [-0.01, 0.046, -0.0025], [0.01, 0.05, 0.0025]),
    disc('keyway', 'face', 0.006, 0, 0.001) + { axis: 'z', origin: [0, 0.012, 0.007] },
    box('blade', 'key', [-0.0015, 0.009, 0.007], [0.0015, 0.015, 0.012]),
    h.prism('bow', 'key', 'z', [[-0.003, 0.006], [0.003, 0.006], [0.006, 0.012], [0.003, 0.018], [-0.003, 0.018], [-0.006, 0.012]], 0.012, 0.014),
  ], { body: 'brass', shackle: 'steel-stainless', face: 'steel-grey', key: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // A lotus flower 150 mm across cut with a short length of stem: a ring of broad pink petals spread flat, an inner
  // cup of petals rising to pointed tips, a yellow ring of stamens and a flat-topped green seed pod.
  local petal(id, a, inner, outer, width, y0) =
    local c = std.cos(a), s = std.sin(a), w = width / 2;
    h.prism(id, 'petal', 'y', [
      [s * inner, c * inner],
      [s * (outer * 0.55) + c * w, c * (outer * 0.55) - s * w],
      [s * outer, c * outer],
      [s * (outer * 0.55) - c * w, c * (outer * 0.55) + s * w],
    ], y0, y0 + 0.006);
  // An upright petal tip on the cup rim, pointing up; `axis` is the axis it is thin along.
  local tip(id, axis, at) = h.prism(id, 'petal', axis, [[at - 0.014, 0.044], [at + 0.014, 0.044], [at, 0.068]], -0.003, 0.003);
  h.compound('lotus', 0.092, [
    petal('outer-%d' % i, i * std.pi / 4, 0.01, 0.075, 0.05, 0.012)
    for i in std.range(0, 7)
  ] + [
    turned('base', 'leaf', 'y', [[0, 0], [0, 0.015], [0.012, 0.02], [0.012, 0]]),
    turned('cup', 'petal', 'y', [[0, 0.016], [0, 0.024], [0.03, 0.046], [0.03, 0.04], [0.004, 0.016], [0, 0.016]], [0, 0.016, 0]),
    tip('tip-a', 'z', 0.04),
    tip('tip-b', 'z', -0.04),
  ] + [
    h.prism('tip-%s' % n, 'petal', 'x', [[0.044, at - 0.014], [0.068, at], [0.044, at + 0.014]], -0.003, 0.003)
    for n in ['c', 'd']
    for at in [if n == 'c' then 0.04 else -0.04]
  ] + [
    turned('stamens', 'stamen', 'y', [[0, 0], [0, 0.024], [0.016, 0.024], [0.016, 0]], [0, 0.018, 0]),
    turned('pod', 'pod', 'y', [[0, 0], [0, 0.01], [0.014, 0.016], [0.014, 0]], [0, 0.03, 0]),
    h.rod('stem', 'leaf', 0.004, 0.012, 0.11, 0.006),
  ], { petal: 'plastic-pink', leaf: 'leaf-green', stamen: 'plastic-yellow', pod: 'leaf-green' })
  + { voxelGrain: 0.004 },

  // A pillowcase stuffed with straw and rolled for carrying, 360 mm long and 200 mm across, tied with cord in two
  // places, the straw showing in the ends.
  h.compound('makeshift_pillow', 0.55, [
    h.tube('roll', 'cloth', 0.06, 0.1, -0.18, 0.18, 0.1, 0),
    h.tube('roll-inner', 'cloth', 0.035, 0.045, -0.176, 0.176, 0.1, 0),
    h.tube('straw-outer', 'straw', 0.045, 0.06, -0.174, 0.174, 0.1, 0),
    h.rod('straw-core', 'straw', 0.035, -0.172, 0.172, 0.1),
    h.tube('tie-a', 'cord', 0.1, 0.104, -0.1, -0.088, 0.1, 0),
    h.tube('tie-b', 'cord', 0.1, 0.104, 0.088, 0.1, 0.1, 0),
  ], { cloth: 'cloth-cotton', straw: 'plant-dried', cord: 'cord-olive' })
  + { voxelGrain: 0.004 },

  // A hank of mild steel wire, loose loops about 100 mm across lying in a flat coil, held by three short twists of
  // the same wire.
  local loop(i, r, y) = turned('loop-%d' % i, 'wire', 'y', [[0, r - 0.002], [0, r], [0.002, r], [0.002, r - 0.002], [0, r - 0.002]], [0, y, 0]);
  h.compound('lc_wire', 0.071, [
    loop(i, [0.05, 0.052, 0.048, 0.051, 0.049][i], i * 0.002)
    for i in std.range(0, 4)
  ] + [
    box('twist-a', 'wire', [0.042, 0, -0.003], [0.058, 0.012, 0.003]),
    box('twist-b', 'wire', [-0.003, 0, 0.042], [0.003, 0.012, 0.058]),
    box('twist-c', 'wire', [-0.058, 0, -0.003], [-0.042, 0.012, 0.003]),
  ], { wire: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // A bare 42-inch LCD panel, 960 mm wide, 570 mm tall and 26 mm thick, lying face up: a dark screen in a black
  // bezel, a grey steel back and a driver board along its lower edge.
  h.compound('large_lcd_screen', 16, [
    box('back', 'back', [-0.48, 0, -0.285], [0.48, 0.018, 0.285]),
    box('bezel-top', 'bezel', [-0.48, 0.018, -0.285], [0.48, 0.026, -0.27]),
    box('bezel-bottom', 'bezel', [-0.48, 0.018, 0.265], [0.48, 0.026, 0.285]),
    box('bezel-left', 'bezel', [-0.48, 0.018, -0.27], [-0.465, 0.026, 0.265]),
    box('bezel-right', 'bezel', [0.465, 0.018, -0.27], [0.48, 0.026, 0.265]),
    box('screen', 'screen', [-0.465, 0.018, -0.27], [0.465, 0.024, 0.265]),
    box('board', 'board', [-0.2, 0.004, 0.285], [0.2, 0.016, 0.3]),
  ], { back: 'steel-grey', bezel: 'plastic-black', screen: 'plastic-charcoal', board: 'circuit-green' })
  + { voxelGrain: 0.006 },

  // A built-in dishwasher 600 mm wide, 600 mm deep and 840 mm tall: a stainless door with a control strip and a
  // pull handle along its top, grey steel sides and a black kick plate under the door.
  h.compound('household_dishwasher', 36, [
    box('cabinet', 'body', [-0.3, 0.1, -0.3], [0.3, 0.84, 0.28]),
    box('plinth', 'kick', [-0.29, 0, -0.28], [0.29, 0.1, 0.26]),
    box('door', 'door', [-0.298, 0.1, 0.28], [0.298, 0.76, 0.3]),
    box('controls', 'door', [-0.298, 0.77, 0.28], [0.298, 0.84, 0.3]),
    box('display', 'display', [0.08, 0.79, 0.3], [0.2, 0.82, 0.302]),
  ] + [
    box('button-%d' % i, 'kick', [-0.26 + i * 0.05, 0.795, 0.3], [-0.23 + i * 0.05, 0.815, 0.304])
    for i in std.range(0, 4)
  ] + [
    box('handle', 'handle', [-0.2, 0.71, 0.3], [0.2, 0.73, 0.32]),
  ], { body: 'steel-grey', door: 'steel-stainless', kick: 'plastic-black', handle: 'plastic-charcoal', display: 'lcd-green' }),

  // A top-loading washing machine 690 mm wide, 700 mm deep and 1.1 m tall to the top of its console, in white
  // enamel: a hinged lid with a dark glass window over the drum, and a raised control console along the back with
  // two dials and a display.
  h.compound('household_washing_machine', 45, [
    box('cabinet', 'body', [-0.345, 0.02, -0.35], [0.345, 0.91, 0.35]),
    box('feet', 'foot', [-0.32, 0, -0.33], [0.32, 0.02, 0.33]),
    box('lid', 'body', [-0.32, 0.91, -0.2], [0.32, 0.93, 0.33]),
    box('window', 'glass', [-0.22, 0.93, -0.12], [0.22, 0.934, 0.25]),
    box('lid-lip', 'trim', [-0.12, 0.905, 0.33], [0.12, 0.93, 0.345]),
    box('console', 'body', [-0.345, 0.91, -0.35], [0.345, 1.1, -0.24]),
    box('console-face', 'trim', [-0.33, 0.93, -0.24], [0.33, 1.08, -0.236]),
    disc('dial-a', 'rim', 0.035, 0, 0.025) + { axis: 'z', origin: [-0.22, 1.005, -0.236] },
    disc('dial-b', 'rim', 0.035, 0, 0.025) + { axis: 'z', origin: [0.22, 1.005, -0.236] },
    box('display', 'display', [-0.08, 0.985, -0.236], [0.08, 1.025, -0.232]),
    box('kick', 'trim', [-0.345, 0.02, 0.35], [0.345, 0.1, 0.355]),
  ], { body: 'enamel-white', foot: 'rubber-black', trim: 'plastic-grey', rim: 'steel-stainless', glass: 'plastic-charcoal', display: 'lcd-green' }),

  // A 240 litre water heater 500 mm across and 1.3 m tall to the tops of its pipe stubs.
  waterHeater('household_water_heater', 65, 0.25, 1.15),

  // A 400 litre family-sized water heater 600 mm across and 1.6 m tall to the tops of its pipe stubs.
  waterHeater('household_water_heater_family', 100, 0.3, 1.42),

  // A petrol push mower: a red steel deck 520 mm wide and 560 mm long on four 180 mm wheels, an engine with a black
  // shroud, fuel cap and starter pull on top, a side discharge chute, and a steel handle rising 1 m behind it with a
  // foam grip and a bail bar. The front is +z; overall 1.25 m long.
  local bar(id, x, y0, z0, y1, z1) = h.prism(id, 'handle', 'x', [[y0, z0], [y0 + 0.025, z0], [y1 + 0.025, z1], [y1, z1]], x - 0.012, x + 0.012);
  h.compound('lawnmower', 22, [
    box('deck', 'deck', [-0.26, 0.06, -0.28], [0.26, 0.2, 0.28]),
    box('skirt-front', 'deck', [-0.25, 0.04, 0.26], [0.25, 0.06, 0.28]),
    box('chute', 'chute', [0.26, 0.06, -0.12], [0.34, 0.16, 0.08]),
    disc('engine', 'engine', 0.11, 0.2, 0.3),
    disc('shroud', 'shroud', 0.13, 0.3, 0.4),
    disc('cap', 'cap', 0.03, 0.4, 0.43, 0.06, 0.06),
    disc('air-filter', 'shroud', 0.05, 0.25, 0.36, -0.12, 0.12),
    box('pull', 'shroud', [-0.04, 0.4, -0.08], [0.04, 0.43, -0.05]),
  ] + [
    h.rod('wheel-%d' % i, 'wheel', 0.09, [-0.31, 0.26][i % 2], [-0.26, 0.31][i % 2], 0.09) + { origin: [[-0.31, 0.26][i % 2], 0.09, [-0.2, 0.22][std.floor(i / 2)]] }
    for i in std.range(0, 3)
  ] + [
    h.rod('hub-%d' % i, 'hub', 0.04, [-0.315, 0.305][i % 2], [-0.305, 0.315][i % 2], 0.09) + { origin: [[-0.315, 0.305][i % 2], 0.09, [-0.2, 0.22][std.floor(i / 2)]] }
    for i in std.range(0, 3)
  ] + [
    bar('handle-left', -0.22, 0.16, -0.26, 0.95, -0.92),
    bar('handle-right', 0.22, 0.16, -0.26, 0.95, -0.92),
    h.rod('grip', 'grip', 0.016, -0.24, 0.24, 0.97) + { origin: [-0.24, 0.97, -0.94] },
    h.rod('bail', 'handle', 0.008, -0.22, 0.22, 0.9) + { origin: [-0.22, 0.9, -0.84] },
  ], {
    deck: 'paint-red',
    chute: 'plastic-black',
    engine: 'alu-bare',
    shroud: 'plastic-black',
    cap: 'plastic-yellow',
    wheel: 'rubber-black',
    hub: 'plastic-grey',
    handle: 'steel-grey',
    grip: 'rubber-black',
  }),
]
