local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A solid cylinder along z from `z0` to `z1`, its axis at (`x`, `y`).
local cylZ(id, slot, r, z0, z1, x, y) = turned(id, slot, 'z', [[0, 0], [0, r], [z1 - z0, r], [z1 - z0, 0]], [x, y, z0]);
// A solid cylinder along x from `x0` to `x1`, its axis at (`y`, `z`).
local cylX(id, slot, r, x0, x1, y, z) = turned(id, slot, 'x', [[0, 0], [0, r], [x1 - x0, r], [x1 - x0, 0]], [x0, y, z]);
// A ring along z, inner radius `r0`, outer `r1`.
local ringZ(id, slot, r0, r1, z0, z1, x, y) = turned(id, slot, 'z', [[0, r0], [0, r1], [z1 - z0, r1], [z1 - z0, r0], [0, r0]], [x, y, z0]);
// A cone loudspeaker facing +z: the cone dips from the rim at `z1` towards the dust cap, a ring frame round it.
local speaker(prefix, r, depth, z0, x, y) = [
  turned(prefix + '-cone', 'cone', 'z', [[0, 0], [0, r * 0.95], [depth, r * 0.95], [depth, r * 0.85], [depth * 0.35, r * 0.25], [depth * 0.35, 0]], [x, y, z0]),
  turned(prefix + '-cap', 'cap', 'z', [[0, 0], [0, r * 0.25], [depth * 0.15, r * 0.2], [depth * 0.25, 0]], [x, y, z0 + depth * 0.35]),
  ringZ(prefix + '-frame', 'frame', r * 0.85, r, z0 + depth * 0.8, z0 + depth * 1.05, x, y),
];
// A row of thin fins along x on top of a plate, spaced across z.
local fins(prefix, slot, x0, x1, y0, y1, z0, z1, n, t) = [
  box('%s-%d' % [prefix, i], slot, [x0, y0, z0 + (z1 - z0) * i / (n - 1) - t / 2], [x1, y1, z0 + (z1 - z0) * i / (n - 1) + t / 2])
  for i in std.range(0, n - 1)
];
[
  // A camping-stove-sized thermoelectric generator, 180 mm long, 115 mm tall and 120 mm deep: a black burner base,
  // an aluminium heat sink of upright fins on top, a brass propane fitting with a valve knob on the right end and
  // a charging socket with a status lamp on the front.
  h.compound('gas_charger', 1, [
    box('base', 'body', [-0.09, 0, -0.06], [0.09, 0.05, 0.06]),
    box('vent', 'vent', [-0.07, 0.012, 0.06], [0.03, 0.03, 0.062]),
    box('plate', 'sink', [-0.085, 0.05, -0.055], [0.085, 0.06, 0.055]),
  ] + fins('fin', 'sink', -0.085, 0.085, 0.06, 0.115, -0.05, 0.05, 9, 0.004) + [
    cylX('fitting', 'brass', 0.009, 0.09, 0.115, 0.03, 0),
    cylX('fitting-nut', 'brass', 0.012, 0.1, 0.108, 0.03, 0),
    turned('valve-stem', 'brass', 'y', [[0, 0], [0, 0.003], [0.012, 0.003], [0.012, 0]], [0.104, 0.039, 0]),
    disc('valve-knob', 'knob', 0.01, 0.051, 0.059, 0.104, 0),
    cylZ('socket', 'socket', 0.006, 0.06, 0.064, 0.055, 0.03),
    cylZ('socket-pin', 'pin', 0.002, 0.06, 0.065, 0.055, 0.03),
    cylZ('lamp', 'lamp', 0.0035, 0.06, 0.064, 0.075, 0.03),
  ], { body: 'plastic-black', vent: 'plastic-charcoal', sink: 'alu-bare', brass: 'brass', knob: 'plastic-red', socket: 'plastic-charcoal', pin: 'brass', lamp: 'plastic-green' }) + { voxelGrain: 0.004 },
  // A handheld Geiger counter, 115 mm long, 60 mm tall and 30 mm deep: a yellow case with a black carry handle on
  // top, a round meter dial with a needle and two knobs on the front, and the detector tube clipped along the back.
  h.compound('geiger_counter', 0.12, [
    box('case', 'case', [-0.0575, 0, -0.015], [0.0575, 0.05, 0.015]),
    box('handle-post-l', 'handle', [-0.05, 0.05, -0.006], [-0.04, 0.066, 0.006]),
    box('handle-post-r', 'handle', [0.04, 0.05, -0.006], [0.05, 0.066, 0.006]),
    box('handle-grip', 'handle', [-0.05, 0.06, -0.007], [0.05, 0.07, 0.007]),
    cylZ('dial-bezel', 'bezel', 0.018, 0.015, 0.018, -0.02, 0.026),
    cylZ('dial', 'dial', 0.015, 0.015, 0.019, -0.02, 0.026),
    box('needle', 'needle', [-0.021, 0.026, 0.019], [-0.019, 0.04, 0.0198]),
    box('scale-red', 'needle', [-0.006, 0.03, 0.019], [-0.004, 0.036, 0.0196]),
    cylZ('knob-range', 'knob', 0.006, 0.015, 0.024, 0.02, 0.032),
    cylZ('knob-power', 'knob', 0.005, 0.015, 0.022, 0.04, 0.014),
    box('speaker-grille', 'grille', [0.012, 0.006, 0.015], [0.05, 0.016, 0.0165]),
    cylX('tube', 'tube', 0.008, -0.055, 0.045, 0.02, -0.024),
    cylX('tube-window', 'window', 0.0085, -0.065, -0.055, 0.02, -0.024),
    box('tube-clip', 'handle', [-0.005, 0.012, -0.02], [0.005, 0.03, -0.015]),
  ], { case: 'plastic-yellow', handle: 'plastic-black', bezel: 'plastic-black', dial: 'paint-cream', needle: 'paint-red', knob: 'plastic-black', grille: 'plastic-charcoal', tube: 'alu-bare', window: 'mesh-black' }) + { voxelGrain: 0.002 },

  // A gel electrophoresis tank, 250 mm long, 100 mm tall and 110 mm wide: a clear acrylic box with a frosted gel
  // tray inside, a clear lid, and a red and a black electrode lead plugged in at each end of the lid.
  h.compound('electrophoresis_tray', 1.3, [
    box('floor', 'acrylic', [-0.125, 0, -0.055], [0.125, 0.006, 0.055]),
    box('wall-front', 'acrylic', [-0.125, 0.006, 0.05], [0.125, 0.08, 0.055]),
    box('wall-back', 'acrylic', [-0.125, 0.006, -0.055], [0.125, 0.08, -0.05]),
    box('wall-left', 'acrylic', [-0.125, 0.006, -0.05], [-0.12, 0.08, 0.05]),
    box('wall-right', 'acrylic', [0.12, 0.006, -0.05], [0.125, 0.08, 0.05]),
    box('dam-left', 'acrylic', [-0.06, 0.006, -0.05], [-0.055, 0.035, 0.05]),
    box('dam-right', 'acrylic', [0.055, 0.006, -0.05], [0.06, 0.035, 0.05]),
    box('gel-tray', 'tray', [-0.055, 0.02, -0.045], [0.055, 0.03, 0.045]),
    box('gel', 'gel', [-0.05, 0.03, -0.04], [0.05, 0.036, 0.04]),
    box('buffer', 'buffer', [-0.12, 0.006, -0.05], [0.12, 0.04, 0.05]),
    box('lid', 'lid', [-0.128, 0.08, -0.058], [0.128, 0.086, 0.058]),
    box('lid-lip', 'lid', [-0.128, 0.07, 0.055], [0.128, 0.08, 0.058]),
  ] + std.flattenArrays([
    [
      disc('jack-%s' % e.id, e.id, 0.007, 0.086, 0.1, e.x, 0),
      disc('plug-%s' % e.id, e.id, 0.005, 0.1, 0.112, e.x, 0),
      box('lead-%s-up' % e.id, e.id, [e.x - 0.0025, 0.112, -0.0025], [e.x + 0.0025, 0.12, 0.0025]),
      box('lead-%s-run' % e.id, e.id, [e.x * 1.06 - 0.0025, 0.115, -0.0025], [e.x * 1.06 + 0.0025, 0.12, 0.06]),
    ]
    for e in [{ id: 'red', x: -0.1 }, { id: 'black', x: 0.1 }]
  ]), { acrylic: 'plastic-clear', tray: 'plastic-frosted', gel: 'jelly-pale', buffer: 'plastic-clear-blue', lid: 'plastic-clear', red: 'plastic-red', black: 'plastic-black' }) + { voxelGrain: 0.004 },

  // A hand-crank battery charger, 110 mm long, 75 mm tall and 60 mm deep: a heavy orange case holding a geared
  // dynamo, a folding crank on the right end, and on top an adjustable cradle of two sliding jaws holding a cell.
  h.compound('hand_crank_charger', 0.37, [
    box('case', 'case', [-0.055, 0, -0.03], [0.055, 0.055, 0.03]),
    box('bumper-l', 'rubber', [-0.058, 0, -0.032], [-0.05, 0.055, 0.032]),
    box('bumper-r', 'rubber', [0.05, 0, -0.032], [0.058, 0.055, 0.032]),
    box('cradle-floor', 'cradle', [-0.045, 0.055, -0.02], [0.045, 0.058, 0.02]),
    box('jaw-fixed', 'cradle', [-0.045, 0.058, -0.02], [-0.039, 0.078, 0.02]),
    box('jaw-slide', 'cradle', [0.027, 0.058, -0.02], [0.033, 0.078, 0.02]),
    box('rail-front', 'rail', [-0.039, 0.058, 0.015], [0.045, 0.061, 0.018]),
    box('rail-back', 'rail', [-0.039, 0.058, -0.018], [0.045, 0.061, -0.015]),
    cylX('cell', 'cell', 0.0085, -0.039, 0.021, 0.0695, 0),
    cylX('cell-tip', 'tip', 0.003, 0.021, 0.027, 0.0695, 0),
    cylX('hub', 'hub', 0.012, 0.058, 0.066, 0.03, 0),
    box('crank-arm', 'arm', [0.066, 0.024, -0.006], [0.072, 0.075, 0.006]),
    cylX('crank-knob', 'knob', 0.007, 0.072, 0.095, 0.068, 0),
    cylZ('lamp', 'lamp', 0.004, 0.03, 0.033, -0.035, 0.04),
    box('label', 'label', [-0.04, 0.012, 0.03], [0.03, 0.03, 0.0305]),
  ], { case: 'plastic-orange', rubber: 'rubber-black', cradle: 'plastic-black', rail: 'alu-bare', cell: 'plastic-blue', tip: 'steel-stainless', hub: 'plastic-black', arm: 'plastic-black', knob: 'plastic-grey', lamp: 'plastic-green', label: 'paint-charcoal' }) + { voxelGrain: 0.004 },
  // A laptop computer standing open, 322 mm wide, 215 mm deep and 10 mm thick when shut: a silver aluminium base
  // with a black keyboard and a touchpad, the lid tipped back 15 degrees past upright with a dark screen facing +z.
  local lid = { hingeY: 0.01, hingeZ: -0.098, len: 0.205, tilt: 15 * std.pi / 180 };
  local along = [std.cos(lid.tilt), -std.sin(lid.tilt)];
  local facing = [std.sin(lid.tilt), std.cos(lid.tilt)];
  local at(s, n) = [lid.hingeY + along[0] * s + facing[0] * n, lid.hingeZ + along[1] * s + facing[1] * n];
  h.compound('laptop', 1.2, [
    box('base', 'shell', [-0.161, 0, -0.107], [0.161, 0.009, 0.107]),
    box('deck', 'deck', [-0.15, 0.009, -0.095], [0.15, 0.0095, 0.03]),
  ] + [
    box('keys-%d' % r, 'keys', [-0.142, 0.0095, -0.09 + r * 0.02], [0.142, 0.012, -0.076 + r * 0.02])
    for r in std.range(0, 5)
  ] + [
    box('touchpad', 'pad', [-0.05, 0.009, 0.045], [0.05, 0.0098, 0.1]),
    box('hinge', 'deck', [-0.13, 0.006, -0.107], [0.13, 0.016, -0.095]),
    h.prism('lid', 'shell', 'x', [at(0, 0), at(lid.len, 0), at(lid.len, -0.006), at(0, -0.006)], -0.161, 0.161),
    h.prism('bezel', 'bezel', 'x', [at(0.004, 0), at(lid.len - 0.002, 0), at(lid.len - 0.002, 0.0015), at(0.004, 0.0015)], -0.157, 0.157),
    h.prism('screen', 'screen', 'x', [at(0.016, 0.0015), at(lid.len - 0.012, 0.0015), at(lid.len - 0.012, 0.0025), at(0.016, 0.0025)], -0.148, 0.148),
  ], { shell: 'alu-bare', deck: 'plastic-charcoal', keys: 'plastic-black', pad: 'plastic-grey', bezel: 'plastic-black', screen: 'screen-black' }) + { voxelGrain: 0.004 },

  // A full-size memory card lying face up, 32 mm long, 24 mm wide and 2 mm thick: a black card with one corner
  // clipped, a blue printed label, a white write-protect slider on the left edge and gold contacts at the clipped end.
  h.compound('memory_card', 0.002, [
    h.prism('card', 'card', 'y', [[-0.016, -0.012], [-0.016, 0.012], [0.016, 0.012], [0.016, -0.008], [0.012, -0.012]], 0, 0.002),
    box('label', 'label', [-0.01, 0.001, -0.012], [0.01, 0.002, 0.008]),
    box('lock', 'lock', [-0.0135, 0, -0.006], [-0.011, 0.002, 0.0]),
  ] + [
    box('contact-%d' % i, 'contact', [-0.0095 + i * 0.0022, 0.001, 0.011], [-0.0083 + i * 0.0022, 0.002, 0.0145])
    for i in std.range(0, 8)
  ], { card: 'plastic-black', label: 'plastic-blue', lock: 'plastic-white', contact: 'foil-gold' }) + { voxelGrain: 0.002 },
  // A methanol fuel cell power unit, 448 mm long, 250 mm tall and 220 mm deep: a grey aluminium case on rubber
  // feet with a folding carry handle, a white fuel cartridge with a blue cap docked in a bay on the front, a vent
  // grille, a small display and a row of output sockets.
  h.compound('methanol_fuel_cell', 9.5, [
    box('case', 'case', [-0.224, 0.01, -0.11], [0.224, 0.23, 0.11]),
    box('trim-l', 'trim', [-0.224, 0.01, -0.112], [-0.21, 0.23, 0.112]),
    box('trim-r', 'trim', [0.21, 0.01, -0.112], [0.224, 0.23, 0.112]),
  ] + [
    box('foot-%d-%d' % [i, j], 'trim', [-0.2 + i * 0.37, 0, -0.09 + j * 0.15], [-0.17 + i * 0.37, 0.01, -0.06 + j * 0.15])
    for i in [0, 1]
    for j in [0, 1]
  ] + [
    box('handle-post-l', 'trim', [-0.11, 0.23, -0.012], [-0.095, 0.25, 0.012]),
    box('handle-post-r', 'trim', [0.095, 0.23, -0.012], [0.11, 0.25, 0.012]),
    box('handle-grip', 'trim', [-0.11, 0.24, -0.014], [0.11, 0.255, 0.014]),
    box('bay', 'bay', [-0.2, 0.03, 0.105], [-0.05, 0.2, 0.111]),
    box('cartridge', 'cartridge', [-0.19, 0.04, 0.06], [-0.06, 0.18, 0.12]),
    cylZ('cartridge-cap', 'cap', 0.018, 0.12, 0.135, -0.125, 0.15),
    box('cartridge-window', 'level', [-0.18, 0.05, 0.12], [-0.17, 0.17, 0.1205]),
    box('display', 'display', [0.0, 0.16, 0.11], [0.08, 0.2, 0.1115]),
    cylZ('button', 'button', 0.008, 0.11, 0.116, 0.11, 0.18),
  ] + [
    box('grille-%d' % i, 'grille', [0.0, 0.035 + i * 0.012, 0.11], [0.19, 0.041 + i * 0.012, 0.1115])
    for i in std.range(0, 7)
  ] + [
    cylZ('socket-%d' % i, 'socket', 0.009, 0.11, 0.116, 0.12 + i * 0.03, 0.18)
    for i in [1, 2]
  ], { case: 'alu-bare', trim: 'plastic-charcoal', bay: 'plastic-black', cartridge: 'plastic-white', cap: 'plastic-blue', level: 'plastic-frosted', display: 'lcd-green', button: 'plastic-red', grille: 'plastic-black', socket: 'plastic-black' }) + { voxelGrain: 0.008 },

  // A pocket music player lying face up, 90 mm long, 45 mm wide and 9 mm thick: a white face with a small screen
  // above a grey click wheel round a centre button, on a polished aluminium back, with a headphone jack on top.
  h.compound('mp3_player', 0.045, [
    box('back', 'back', [-0.0225, 0, -0.045], [0.0225, 0.006, 0.045]),
    box('face', 'face', [-0.0225, 0.004, -0.045], [0.0225, 0.009, 0.045]),
    box('screen-bezel', 'bezel', [-0.017, 0.008, -0.04], [0.017, 0.0092, -0.012]),
    box('screen', 'screen', [-0.015, 0.0085, -0.038], [0.015, 0.0094, -0.014]),
    disc('wheel', 'wheel', 0.016, 0.008, 0.0094, 0, 0.022),
    disc('button', 'face', 0.006, 0.0085, 0.0098, 0, 0.022),
    turned('jack', 'jack', 'z', [[0, 0.0015], [0, 0.003], [0.002, 0.003], [0.002, 0.0015], [0, 0.0015]], [0.01, 0.0045, -0.0465]),
    box('hold-switch', 'jack', [-0.015, 0.003, -0.0465], [-0.008, 0.006, -0.045]),
  ], { back: 'alu-bare', face: 'plastic-white', bezel: 'plastic-black', screen: 'screen-black', wheel: 'plastic-grey', jack: 'plastic-charcoal' }) + { voxelGrain: 0.002 },

  // A homemade noise emitter, 120 mm wide, 100 mm tall and 90 mm deep: a car speaker screwed to the front of a
  // grey project box, an amplifier board wired on the open top, a 9 V battery taped to the side and a toggle switch.
  h.compound('noise_emitter', 0.33, [
    box('box', 'box', [-0.06, 0, -0.045], [0.06, 0.09, 0.035]),
    box('baffle', 'baffle', [-0.058, 0.002, 0.035], [0.058, 0.098, 0.04]),
  ] + speaker('speaker', 0.045, 0.014, 0.04, 0, 0.05) + [
    box('board', 'board', [-0.045, 0.09, -0.035], [0.035, 0.093, 0.02]),
    box('chip', 'chip', [-0.02, 0.093, -0.015], [0.0, 0.098, 0.0]),
    box('heatsink', 'sink', [0.005, 0.093, -0.03], [0.025, 0.11, -0.022]),
    disc('cap-a', 'capacitor', 0.005, 0.093, 0.108, -0.035, 0.008),
    disc('cap-b', 'capacitor', 0.004, 0.093, 0.104, -0.035, -0.025),
    box('wire-red', 'wire-red', [0.03, 0.093, 0.005], [0.064, 0.096, 0.008]),
    box('wire-black', 'wire-black', [0.03, 0.093, 0.011], [0.064, 0.096, 0.014]),
    box('battery', 'battery', [0.06, 0.02, -0.025], [0.077, 0.068, 0.001]),
    box('battery-snap', 'wire-black', [0.062, 0.068, -0.02], [0.075, 0.074, -0.004]),
    box('tape', 'tape', [0.059, 0.035, -0.028], [0.079, 0.05, 0.004]),
    box('switch-plate', 'switch', [-0.035, 0.093, 0.022], [-0.015, 0.096, 0.032]),
    box('switch-lever', 'lever', [-0.027, 0.096, 0.025], [-0.023, 0.11, 0.029]),
  ], { box: 'plastic-grey', baffle: 'plastic-black', cone: 'plastic-matte-black', cap: 'plastic-charcoal', frame: 'alu-bare', board: 'circuit-green', chip: 'plastic-black', sink: 'alu-bare', capacitor: 'plastic-blue', 'wire-red': 'plastic-red', 'wire-black': 'plastic-black', battery: 'plastic-orange', tape: 'tape-grey', switch: 'plastic-black', lever: 'steel-stainless' }) + { voxelGrain: 0.004 },

  // A hot-rodded noise emitter, 300 mm long, 230 mm tall and 150 mm deep: a steel frame holding a flared horn
  // speaker on the front, three amplifier boards stacked on standoffs behind it, each with a finned heat sink,
  // and a bundle of red and black wires to a knob and switch panel on top.
  h.compound('noise_emitter_super', 5, [
    box('base', 'frame', [-0.15, 0, -0.075], [0.15, 0.008, 0.075]),
    box('post-fl', 'frame', [-0.15, 0.008, 0.06], [-0.138, 0.2, 0.075]),
    box('post-fr', 'frame', [0.138, 0.008, 0.06], [0.15, 0.2, 0.075]),
    box('post-bl', 'frame', [-0.15, 0.008, -0.075], [-0.138, 0.2, -0.06]),
    box('post-br', 'frame', [0.138, 0.008, -0.075], [0.15, 0.2, -0.06]),
    box('top-front', 'frame', [-0.15, 0.2, 0.06], [0.15, 0.21, 0.075]),
    box('top-back', 'frame', [-0.15, 0.2, -0.075], [0.15, 0.21, -0.06]),
    box('driver', 'driver', [-0.06, 0.04, -0.06], [0.06, 0.16, 0.0]),
    turned('horn', 'horn', 'z', [[0, 0.0], [0, 0.03], [0.04, 0.06], [0.075, 0.095], [0.075, 0.088], [0.04, 0.052], [0.005, 0.0]], [0, 0.1, 0.0]),
    turned('horn-mouth', 'cone', 'z', [[0, 0], [0, 0.055], [0.002, 0.055], [0.002, 0]], [0, 0.1, 0.04]),
  ] + std.flattenArrays([
    [
      box('amp-%d' % i, 'board', [-0.13, 0.03 + i * 0.055, -0.058], [-0.07, 0.034 + i * 0.055, 0.055]),
      box('amp-%d-chip' % i, 'chip', [-0.12, 0.034 + i * 0.055, -0.02], [-0.1, 0.04 + i * 0.055, 0.0]),
      disc('amp-%d-cap' % i, 'capacitor', 0.007, 0.034 + i * 0.055, 0.05 + i * 0.055, -0.085, 0.03),
    ] + fins('amp-%d-fin' % i, 'sink', 0.07, 0.13, 0.03 + i * 0.055, 0.075 + i * 0.055, -0.055, -0.005, 5, 0.004)
    + [box('amp-%d-sinkplate' % i, 'sink', [0.07, 0.03 + i * 0.055, -0.058], [0.13, 0.034 + i * 0.055, 0.0])]
    for i in std.range(0, 2)
  ]) + [
    box('panel', 'panel', [-0.1, 0.21, -0.05], [0.1, 0.216, 0.05]),
    disc('knob-a', 'knob', 0.012, 0.216, 0.232, -0.06, 0.01),
    disc('knob-b', 'knob', 0.012, 0.216, 0.232, -0.02, 0.01),
    box('switch', 'switch', [0.03, 0.216, 0.0], [0.05, 0.226, 0.02]),
    box('wire-red', 'wire-red', [0.13, 0.04, -0.072], [0.137, 0.21, -0.064]),
    box('wire-black', 'wire-black', [0.12, 0.04, -0.072], [0.127, 0.21, -0.064]),
  ], { frame: 'steel-grey', driver: 'plastic-black', horn: 'plastic-charcoal', cone: 'plastic-matte-black', board: 'circuit-green', chip: 'plastic-black', capacitor: 'plastic-blue', sink: 'alu-bare', panel: 'alu-anodized-black', knob: 'plastic-red', switch: 'steel-stainless', 'wire-red': 'plastic-red', 'wire-black': 'plastic-black' }) + { voxelGrain: 0.004 },

  // A strange field recorder, 180 mm long, 150 mm tall and 120 mm deep: a white base with a small blank screen
  // and a red print button on the front, a thermal printer slot on top with a curl of paper coming out, and a
  // microphone on a stalk under a clear glass dome.
  h.compound('nre_recorder', 1, [
    box('base', 'base', [-0.09, 0, -0.06], [0.09, 0.07, 0.06]),
    box('screen-bezel', 'bezel', [0.01, 0.025, 0.06], [0.075, 0.06, 0.062]),
    box('screen', 'screen', [0.014, 0.029, 0.061], [0.071, 0.056, 0.063]),
    box('battery-mark', 'lamp', [0.062, 0.05, 0.062], [0.07, 0.054, 0.0635]),
    cylZ('button', 'button', 0.01, 0.06, 0.068, -0.05, 0.04),
    box('printer-slot', 'slot', [0.02, 0.07, -0.05], [0.08, 0.073, -0.04]),
    box('paper', 'paper', [0.025, 0.07, -0.046], [0.075, 0.105, -0.044]),
    box('paper-curl', 'paper', [0.025, 0.103, -0.044], [0.075, 0.105, -0.025]),
    disc('dome-collar', 'bezel', 0.042, 0.07, 0.078, -0.04, 0),
    turned('dome', 'glass', 'y', [[0, 0], [0, 0.038], [0.04, 0.038], [0.06, 0.03], [0.072, 0.016], [0.075, 0]], [-0.04, 0.078, 0]),
    disc('stalk', 'mic', 0.003, 0.078, 0.11, -0.04, 0),
    turned('mic', 'mic', 'y', [[0, 0], [0, 0.009], [0.018, 0.009], [0.022, 0.006], [0.024, 0]], [-0.04, 0.11, 0]),
  ], { base: 'plastic-white', bezel: 'plastic-charcoal', screen: 'lcd-green', lamp: 'plastic-green', button: 'plastic-red', slot: 'plastic-black', paper: 'paper-white', glass: 'glass-clear', mic: 'plastic-black' }) + { voxelGrain: 0.004 },
  // A handheld game console lying face up, 180 mm wide, 85 mm deep and 25 mm thick: a grey body with rounded
  // grips, a wide screen in a black bezel, a cross pad on the left, four coloured buttons on the right, two small
  // menu buttons below the screen and shoulder buttons on the back edge.
  h.compound('handheld_game', 0.36, [
    box('body', 'body', [-0.0475, 0, -0.0425], [0.0475, 0.022, 0.0425]),
    disc('grip-l', 'body', 0.0425, 0, 0.022, -0.0475, 0),
    disc('grip-r', 'body', 0.0425, 0, 0.022, 0.0475, 0),
    box('bezel', 'bezel', [-0.05, 0.02, -0.032], [0.05, 0.0235, 0.028]),
    box('screen', 'screen', [-0.044, 0.021, -0.028], [0.044, 0.024, 0.024]),
    box('pad-x', 'pad', [-0.081, 0.02, -0.004], [-0.059, 0.026, 0.004]),
    box('pad-z', 'pad', [-0.074, 0.02, -0.011], [-0.066, 0.026, 0.011]),
    disc('button-a', 'button-a', 0.0045, 0.02, 0.026, 0.078, 0),
    disc('button-b', 'button-b', 0.0045, 0.02, 0.026, 0.07, 0.008),
    disc('button-c', 'button-c', 0.0045, 0.02, 0.026, 0.07, -0.008),
    disc('button-d', 'button-d', 0.0045, 0.02, 0.026, 0.062, 0),
    box('menu-l', 'pad', [-0.016, 0.02, 0.032], [-0.006, 0.024, 0.036]),
    box('menu-r', 'pad', [0.006, 0.02, 0.032], [0.016, 0.024, 0.036]),
    box('shoulder-l', 'pad', [-0.08, 0.008, -0.044], [-0.05, 0.02, -0.036]),
    box('shoulder-r', 'pad', [0.05, 0.008, -0.044], [0.08, 0.02, -0.036]),
  ], { body: 'plastic-grey', bezel: 'plastic-black', screen: 'screen-black', pad: 'plastic-black', 'button-a': 'plastic-red', 'button-b': 'plastic-blue', 'button-c': 'plastic-green', 'button-d': 'plastic-yellow' }) + { voxelGrain: 0.004 },

  // A portable hard drive lying face up, 120 mm long, 80 mm wide and 15 mm thick: a brushed aluminium top on a
  // black rubber bumper, a blue activity lamp near one end and a cable socket in that end.
  h.compound('portable_hard_drive', 0.3, [
    box('bumper', 'bumper', [-0.06, 0, -0.04], [0.06, 0.014, 0.04]),
    box('top', 'top', [-0.056, 0.006, -0.036], [0.056, 0.015, 0.036]),
    box('lamp', 'lamp', [0.044, 0.0145, -0.002], [0.05, 0.0155, 0.004]),
    box('socket', 'socket', [0.059, 0.004, -0.008], [0.0605, 0.01, 0.008]),
    box('stripe', 'bumper', [-0.056, 0.0145, 0.026], [0.04, 0.0152, 0.028]),
  ], { bumper: 'rubber-black', top: 'alu-bare', lamp: 'plastic-clear-blue', socket: 'plastic-charcoal' }) + { voxelGrain: 0.002 },

  // A crude laboratory measuring device, 160 mm long, 110 mm tall and 70 mm deep: a box of laminated white
  // board with a dim screen and a single button on the front, a battery strapped to one end, and on top a spool
  // wound with pale cloth netting, a loose end of the net hanging down the back.
  h.compound('resonance_meter', 0.95, [
    box('case', 'case', [-0.07, 0, -0.035], [0.07, 0.07, 0.035]),
  ] + [
    box('seam-%d' % i, 'seam', [-0.0705, 0.017 * (i + 1), -0.0355], [0.0705, 0.017 * (i + 1) + 0.002, 0.0355])
    for i in std.range(0, 2)
  ] + [
    box('screen-bezel', 'bezel', [-0.05, 0.03, 0.035], [0.02, 0.06, 0.037]),
    box('screen', 'screen', [-0.046, 0.034, 0.036], [0.016, 0.056, 0.038]),
    cylZ('button', 'button', 0.006, 0.035, 0.041, 0.045, 0.045),
    box('battery', 'battery', [0.07, 0.008, -0.025], [0.09, 0.06, 0.025]),
    box('strap', 'strap', [0.069, 0.03, -0.027], [0.092, 0.038, 0.027]),
    box('spool-post-l', 'bezel', [-0.06, 0.07, -0.004], [-0.054, 0.104, 0.004]),
    box('spool-post-r', 'bezel', [0.054, 0.07, -0.004], [0.06, 0.104, 0.004]),
    cylX('spool-core', 'bezel', 0.004, -0.054, 0.054, 0.092, 0),
    cylX('net-roll', 'net', 0.016, -0.05, 0.05, 0.092, 0),
    cylX('flange-l', 'bezel', 0.02, -0.054, -0.05, 0.092, 0),
    cylX('flange-r', 'bezel', 0.02, 0.05, 0.054, 0.092, 0),
    box('net-tail', 'net', [-0.045, 0.03, -0.039], [0.045, 0.092, -0.035]),
    box('net-tail-top', 'net', [-0.045, 0.088, -0.035], [0.045, 0.09, -0.01]),
  ], { case: 'plastic-white', seam: 'paint-cream', bezel: 'plastic-charcoal', screen: 'lcd-green', button: 'plastic-red', battery: 'plastic-black', strap: 'nylon-black', net: 'mesh-white' }) + { voxelGrain: 0.004 },
]
