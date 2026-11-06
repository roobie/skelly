local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A flat bar `w` wide from point `a` to point `b` in the x-y plane, from z0 to z1: hanger arms, needles, wire.
local seg(id, slot, a, b, w, z0, z1) =
  local dx = b[0] - a[0], dy = b[1] - a[1], len = std.sqrt(dx * dx + dy * dy), nx = -dy / len * w / 2, ny = dx / len * w / 2;
  h.prism(id, slot, 'z', [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], z0, z1);
// A hollow tube along z from z0 to z1, its axis at (x, y).
local tubeZ(id, slot, r0, r1, z0, z1, x, y) = turned(id, slot, 'z', [[0, r0], [0, r1], [z1 - z0, r1], [z1 - z0, r0], [0, r0]], [x, y, z0]);
// A solid cylinder along z from z0 to z1, its axis at (x, y).
local rodZ(id, slot, r, z0, z1, x, y) = turned(id, slot, 'z', [[0, 0], [0, r], [z1 - z0, r], [z1 - z0, 0]], [x, y, z0]);
// A solid cylinder along x from x0 to x1, its axis at (y, z).
local rodX(id, slot, r, x0, x1, y, z) = turned(id, slot, 'x', [[0, 0], [0, r], [x1 - x0, r], [x1 - x0, 0]], [x0, y, z]);
// A hexagon of corner radius r standing on y from y0 to y1, centred at (x, z).
local hexY(id, slot, r, y0, y1, x, z) = h.prism(id, slot, 'y', [[z + r * std.sin(i * std.pi / 3), x + r * std.cos(i * std.pi / 3)] for i in std.range(0, 5)], y0, y1);
// A round dial facing +z, centred at (x, y) with its face at z: white face, ticks from 225 to -45 degrees, a red band
// at the top end and a black needle pointing at `at` (0 to 1 along the scale).
local dial(prefix, r, x, y, z, at) =
  local ang(t) = (225 - 270 * t) * std.pi / 180;
  [
    rodZ(prefix + '-face', 'face', r, z - 0.002, z, x, y),
  ] + [
    seg(prefix + '-tick-%d' % i, 'ink', [x + r * 0.72 * std.cos(ang(i / 10)), y + r * 0.72 * std.sin(ang(i / 10))], [x + r * 0.9 * std.cos(ang(i / 10)), y + r * 0.9 * std.sin(ang(i / 10))], 0.002, z, z + 0.001)
    for i in std.range(0, 10)
  ] + [
    seg(prefix + '-red-%d' % i, 'danger', [x + r * 0.78 * std.cos(ang(0.8 + i * 0.05)), y + r * 0.78 * std.sin(ang(0.8 + i * 0.05))], [x + r * 0.78 * std.cos(ang(0.85 + i * 0.05)), y + r * 0.78 * std.sin(ang(0.85 + i * 0.05))], 0.005, z, z + 0.0012)
    for i in std.range(0, 3)
  ] + [
    seg(prefix + '-needle', 'ink', [x - r * 0.15 * std.cos(ang(at)), y - r * 0.15 * std.sin(ang(at))], [x + r * 0.82 * std.cos(ang(at)), y + r * 0.82 * std.sin(ang(at))], 0.003, z + 0.001, z + 0.003),
    rodZ(prefix + '-pivot', 'ink', r * 0.1, z, z + 0.004, x, y),
  ];
[
  // A loose handful of black and galvanised iron fittings for 20 mm pipe, about 180 mm by 130 mm laid out: an elbow,
  // a tee, a coupling, a threaded nipple, two end caps and a hex bushing, each fitting about 34 mm across.
  local r = 0.017, bore = 0.0115;
  h.compound('pipe_fittings', 0.8, [
    // Elbow, corner at (-0.06, -0.035).
    h.ball('elbow-corner', 'black', r, -0.06, r, -0.035),
    h.tube('elbow-x', 'black', bore, r, -0.06, -0.02, r, -0.035),
    h.tube('elbow-x-bead', 'black', bore, r + 0.002, -0.026, -0.02, r, -0.035),
    tubeZ('elbow-z', 'black', bore, r, -0.035, 0.005, -0.06, r),
    tubeZ('elbow-z-bead', 'black', bore, r + 0.002, -0.001, 0.005, -0.06, r),
    // Tee, run along x, branch to -z.
    h.tube('tee-run', 'galv', bore, r, 0.0, 0.07, r, -0.03),
    h.tube('tee-bead-a', 'galv', bore, r + 0.002, 0.0, 0.006, r, -0.03),
    h.tube('tee-bead-b', 'galv', bore, r + 0.002, 0.064, 0.07, r, -0.03),
    tubeZ('tee-branch', 'galv', bore, r, -0.068, -0.03, 0.035, r),
    tubeZ('tee-branch-bead', 'galv', bore, r + 0.002, -0.068, -0.062, 0.035, r),
    // Coupling, lying along x.
    h.tube('coupling', 'galv', bore, r, 0.03, 0.068, r, 0.04),
    h.tube('coupling-bead-a', 'galv', bore, r + 0.002, 0.03, 0.035, r, 0.04),
    h.tube('coupling-bead-b', 'galv', bore, r + 0.002, 0.063, 0.068, r, 0.04),
    // Threaded nipple, lying along x.
    h.tube('nipple', 'black', bore - 0.002, 0.0135, 0.075, 0.125, 0.0135, 0.045),
  ] + [
    h.tube('nipple-thread-%d' % i, 'black', bore - 0.002, 0.0145, x, x + 0.002, 0.0135, 0.045)
    for i in std.range(0, 9)
    for x in [0.076 + (if i < 5 then i else i + 7) * 0.004]
  ] + [
    // End caps standing open end down.
    turned('cap-a', 'black', 'y', [[0, 0], [0, r + 0.002], [0.005, r + 0.002], [0.005, r], [0.017, r], [0.022, r - 0.004], [0.022, 0]], [-0.08, 0, 0.045]),
    turned('cap-b', 'galv', 'y', [[0, 0], [0, r + 0.002], [0.005, r + 0.002], [0.005, r], [0.017, r], [0.022, r - 0.004], [0.022, 0]], [-0.035, 0, 0.055]),
    // Hex bushing lying flat.
    hexY('bushing-hex', 'galv', 0.02, 0, 0.008, 0.1, -0.075 + 0.02),
    disc('bushing-hole', 'dark', 0.0085, 0.008, 0.009, 0.1, -0.055),
    turned('bushing-boss', 'galv', 'y', [[0, 0.0085], [0, 0.0145], [0.006, 0.0145], [0.006, 0.0085], [0, 0.0085]], [0.1, 0.008, -0.055]),
  ], { black: 'iron-dull', galv: 'steel-galvanised', dark: 'plastic-charcoal' })
  + { voxelGrain: 0.002 },

  // A dial pressure gauge built into a short length of thick-walled pipe: the pipe 200 mm long and 60 mm across with
  // threaded ends, a boss rising from its middle to a steel-cased dial 100 mm across facing front.
  h.compound('pressure_gauge', 3.6, [
    h.tube('pipe', 'steel', 0.014, 0.03, -0.085, 0.085, 0.03, 0),
  ] + [
    h.tube('thread-%s-%d' % [side, i], 'steel', 0.014, 0.0275, x, x + 0.002, 0.03, 0)
    for side in ['a', 'b']
    for i in std.range(0, 3)
    for x in [if side == 'a' then -0.1 + i * 0.004 else 0.087 + i * 0.004]
  ] + [
    h.tube('thread-core-a', 'steel', 0.014, 0.026, -0.1, -0.085, 0.03, 0),
    h.tube('thread-core-b', 'steel', 0.014, 0.026, 0.085, 0.1, 0.03, 0),
    disc('boss', 'steel', 0.016, 0.055, 0.075),
    hexY('boss-hex', 'brass', 0.014, 0.075, 0.087, 0, 0),
    disc('stem', 'brass', 0.007, 0.087, 0.095),
    rodZ('case', 'steel', 0.05, -0.016, 0.012, 0, 0.145),
    tubeZ('bezel', 'chrome', 0.043, 0.052, 0.012, 0.019, 0, 0.145),
  ] + dial('dial', 0.044, 0, 0.145, 0.014, 0.35), {
    steel: 'steel-grey',
    brass: 'brass',
    chrome: 'steel-bright',
    face: 'paint-white',
    ink: 'plastic-black',
    danger: 'paint-red',
  })
  + { voxelGrain: 0.002 },

  // A compact three-plunger high-pressure pump, 190 mm long, 120 mm deep and 110 mm tall: a cast-iron crankcase on a
  // foot with an oil cap, a keyed drive shaft out of one side and a brass manifold across the front with three valve
  // plugs, a suction port and a smaller pressure outlet.
  h.compound('pump_complex', 4, [
    box('foot', 'iron', [-0.07, 0, -0.05], [0.07, 0.008, 0.035]),
    box('crankcase', 'iron', [-0.06, 0.008, -0.045], [0.06, 0.09, 0.035]),
  ] + [
    box('rib-%d' % i, 'iron', [x - 0.004, 0.012, -0.05], [x + 0.004, 0.085, -0.045])
    for i in std.range(0, 2)
    for x in [-0.035 + i * 0.035]
  ] + [
    rodX('bearing-housing', 'iron', 0.032, 0.06, 0.074, 0.05, -0.005),
    rodX('shaft', 'shaft', 0.0095, 0.074, 0.122, 0.05, -0.005),
    box('key', 'brightsteel', [0.085, 0.0585, -0.0075], [0.118, 0.062, -0.0025]),
    rodX('bearing-cover', 'iron', 0.028, -0.068, -0.06, 0.05, -0.005),
    disc('oil-cap', 'cap', 0.014, 0.09, 0.102, 0.02, -0.02),
    disc('oil-cap-grip', 'cap', 0.006, 0.102, 0.108, 0.02, -0.02),
    box('manifold', 'brass', [-0.066, 0.012, 0.035], [0.066, 0.082, 0.075]),
  ] + [
    hexY('valve-%d' % i, 'brass', 0.011, 0.082, 0.094, x, 0.055)
    for i in std.range(0, 2)
    for x in [-0.042 + i * 0.042]
  ] + [
    rodZ('inlet-boss', 'brass', 0.017, 0.075, 0.082, -0.03, 0.045),
    tubeZ('inlet', 'brass', 0.009, 0.013, 0.082, 0.1, -0.03, 0.045),
    rodZ('inlet-bore', 'dark', 0.009, 0.098, 0.1005, -0.03, 0.045),
    rodZ('outlet-boss', 'brass', 0.013, 0.075, 0.082, 0.035, 0.04),
    turned('outlet-hex', 'brass', 'z', [[0, 0], [0, 0.0095], [0.012, 0.0095], [0.012, 0]], [0.035, 0.04, 0.082]),
    tubeZ('outlet', 'brass', 0.004, 0.0065, 0.094, 0.104, 0.035, 0.04),
    rodZ('outlet-bore', 'dark', 0.004, 0.1025, 0.1045, 0.035, 0.04),
  ], {
    iron: 'paint-charcoal',
    shaft: 'steel-grey',
    brightsteel: 'steel-bright',
    cap: 'plastic-yellow',
    brass: 'brass-polished',
    dark: 'plastic-charcoal',
  })
  + { voxelGrain: 0.002 },

  // A handheld thermocouple pyrometer laid flat: a meter 150 mm by 75 mm and 32 mm thick in a yellow rubber boot,
  // a green display and four buttons on top, and a cable to a steel probe 260 mm long with a black handle.
  h.compound('pyrometer', 0.35, [
    box('boot', 'boot', [-0.0375, 0, -0.075], [0.0375, 0.026, 0.075]),
    box('body', 'body', [-0.032, 0.026, -0.068], [0.032, 0.032, 0.068]),
    box('display-bezel', 'bezel', [-0.026, 0.032, -0.008], [0.026, 0.033, 0.058]),
    box('display', 'display', [-0.022, 0.033, -0.002], [0.022, 0.034, 0.052]),
  ] + [
    box('digit-%d' % i, 'bezel', [-0.018 + i * 0.01, 0.034, 0.012], [-0.011 + i * 0.01, 0.0345, 0.036])
    for i in std.range(0, 3)
  ] + [
    disc('button-%d' % i, if i == 0 then 'power' else 'button', 0.005, 0.032, 0.036, -0.018 + (i % 2) * 0.036, -0.025 - std.floor(i / 2) * 0.022)
    for i in std.range(0, 3)
  ] + [
    box('socket', 'bezel', [-0.012, 0.012, -0.08], [0.012, 0.024, -0.075]),
    box('cable-a', 'cable', [-0.0025, 0.015, -0.12], [0.0025, 0.02, -0.08]),
    box('cable-b', 'cable', [-0.0025, 0, -0.125], [0.0025, 0.02, -0.12]),
    box('cable-c', 'cable', [-0.0025, 0, -0.125], [0.0725, 0.005, -0.12]),
    box('cable-d', 'cable', [0.0675, 0, -0.125], [0.0725, 0.005, -0.095]),
    turned('handle', 'handle', 'z', [[0, 0.004], [0.008, 0.009], [0.075, 0.01], [0.08, 0.012], [0.085, 0.012], [0.085, 0]], [0.07, 0.012, -0.1]),
    turned('handle-end', 'handle', 'z', [[0, 0], [0, 0.004], [0.001, 0.004], [0.001, 0]], [0.07, 0.012, -0.1]),
    rodZ('probe', 'probe', 0.003, -0.015, 0.16, 0.07, 0.012),
    turned('probe-tip', 'probe', 'z', [[0, 0.003], [0.006, 0.0012], [0.006, 0]], [0.07, 0.012, 0.16]),
  ], {
    boot: 'rubber-yellow',
    body: 'plastic-charcoal',
    bezel: 'plastic-black',
    display: 'lcd-green',
    button: 'plastic-grey',
    power: 'plastic-red',
    cable: 'plastic-black',
    handle: 'plastic-black',
    probe: 'steel-stainless',
  })
  + { voxelGrain: 0.002 },

  // A hand crank bent from one iron rod 16 mm across, lying flat: a shaft 200 mm long with a square drive end and a
  // fixed collar, a right-angled arm 140 mm long and a handle 110 mm long carrying a loose grip sleeve.
  local r = 0.008, y = 0.012;
  h.compound('simple_crank', 0.81, [
    box('drive', 'iron', [-0.142, y - 0.0065, -0.0065], [-0.12, y + 0.0065, 0.0065]),
    rodX('shaft', 'iron', r, -0.12, 0.06, y, 0),
    rodX('collar', 'iron', 0.012, -0.08, -0.068, y, 0),
    h.ball('bend-a', 'iron', r, 0.06, y, 0),
    rodZ('arm', 'iron', r, 0, 0.14, 0.06, y),
    h.ball('bend-b', 'iron', r, 0.06, y, 0.14),
    rodX('pin', 'iron', r, 0.06, 0.175, y, 0.14),
    h.tube('grip', 'grip', r, 0.012, 0.072, 0.162, y, 0.14),
    rodX('peen', 'iron', 0.01, 0.175, 0.18, y, 0.14),
  ], { iron: 'iron-dull', grip: 'iron-cast' })
  + { voxelGrain: 0.002 },

  // A small thick-walled steel pressure vessel standing upright, 400 mm tall and 180 mm across with rounded heads: a
  // skirt foot, a threaded nozzle on the top head, a side port and a stamped plate.
  h.compound('small_pressure_vessel', 19, [
    turned('skirt', 'steel', 'y', [[0, 0.066], [0, 0.074], [0.03, 0.074], [0.03, 0.066], [0, 0.066]]),
    turned('shell', 'steel', 'y', [
      [0, 0], [0, 0.045], [0.006, 0.064], [0.016, 0.078], [0.03, 0.087], [0.045, 0.09],
      [0.315, 0.09], [0.33, 0.087], [0.344, 0.078], [0.354, 0.064], [0.36, 0.045], [0.36, 0],
    ], [0, 0.016, 0]),
    turned('weld-a', 'weld', 'y', [[0, 0.09], [0, 0.0915], [0.006, 0.0915], [0.006, 0.09]], [0, 0.07, 0]),
    turned('weld-b', 'weld', 'y', [[0, 0.09], [0, 0.0915], [0.006, 0.0915], [0.006, 0.09]], [0, 0.32, 0]),
    disc('nozzle-boss', 'steel', 0.026, 0.37, 0.38),
    hexY('nozzle-hex', 'fitting', 0.017, 0.38, 0.39, 0, 0),
    turned('nozzle', 'fitting', 'y', [[0, 0.0055], [0, 0.011], [0.01, 0.011], [0.01, 0.0055], [0, 0.0055]], [0, 0.39, 0]),
    disc('nozzle-bore', 'dark', 0.0055, 0.398, 0.3995),
    rodZ('side-boss', 'steel', 0.018, 0.08, 0.1, 0, 0.25),
    turned('side-plug', 'fitting', 'z', [[0, 0], [0, 0.011], [0.012, 0.011], [0.012, 0]], [0, 0.25, 0.1]),
    box('plate', 'plate', [-0.035, 0.13, 0.088], [0.035, 0.19, 0.092]),
  ] + [
    box('plate-line-%d' % i, 'stamp', [-0.028, 0.142 + i * 0.012, 0.092], [0.028 - (i % 2) * 0.014, 0.146 + i * 0.012, 0.093])
    for i in std.range(0, 3)
  ], { steel: 'steel-grey', weld: 'steel-heat-tint', fitting: 'brass-dull', dark: 'plastic-charcoal', plate: 'steel-bright', stamp: 'iron-dull' })
  + { voxelGrain: 0.004 },

  // A small cast-iron centrifugal pump, 170 mm tall, 150 mm wide and 190 mm deep: a round volute casing facing front
  // with a flanged suction eye on its axis, a flanged outlet rising off its top edge, and a bearing bracket with the
  // drive shaft out the back on a cast foot.
  local cy = 0.08;
  h.compound('well_pump', 3.5, [
    box('foot', 'iron', [-0.045, 0, -0.1], [0.045, 0.01, -0.01]),
    box('pedestal', 'iron', [-0.012, 0.01, -0.09], [0.012, cy - 0.02, -0.02]),
    rodZ('volute', 'iron', 0.062, -0.02, 0.025, 0, cy),
    rodZ('volute-lip', 'iron', 0.066, -0.006, 0.006, 0, cy),
  ] + [
    rodZ('bolt-%d' % i, 'bolt', 0.004, 0.006, 0.01, 0.059 * std.cos(i * std.pi / 3 + 0.3), cy + 0.059 * std.sin(i * std.pi / 3 + 0.3))
    for i in std.range(0, 5)
  ] + [
    box('scroll', 'iron', [0.02, cy, -0.02], [0.062, cy + 0.052, 0.025]),
    rodZ('eye-neck', 'iron', 0.022, 0.025, 0.055, 0, cy),
    tubeZ('eye-flange', 'iron', 0.017, 0.036, 0.055, 0.065, 0, cy),
    rodZ('eye-bore', 'dark', 0.017, 0.04, 0.0645, 0, cy),
    turned('outlet', 'iron', 'y', [[0, 0], [0, 0.019], [0.06, 0.017], [0.06, 0]], [0.042, cy + 0.03, 0.002]),
    turned('outlet-flange', 'iron', 'y', [[0, 0.013], [0, 0.03], [0.01, 0.03], [0.01, 0.013], [0, 0.013]], [0.042, cy + 0.09, 0.002]),
    disc('outlet-bore', 'dark', 0.013, cy + 0.098, cy + 0.0995, 0.042, 0.002),
    turned('bracket', 'iron', 'z', [[0, 0], [0, 0.024], [0.05, 0.026], [0.07, 0.04], [0.07, 0]], [0, cy, -0.09]),
    rodZ('shaft', 'shaft', 0.008, -0.13, -0.09, 0, cy),
    box('key', 'shaft', [-0.002, cy + 0.007, -0.125], [0.002, cy + 0.01, -0.1]),
    rodZ('drain', 'bolt', 0.005, 0.0, 0.03, -0.035, cy - 0.052),
  ], { iron: 'iron-cast', bolt: 'steel-grey', shaft: 'steel-bright', dark: 'plastic-charcoal' })
  + { voxelGrain: 0.002 },

  // A refrigerant recovery machine, 380 mm wide, 230 mm deep and 330 mm tall: a steel cabinet with a carry handle
  // across the top, and on its front two dial gauges, two valve knobs, a selector knob, a switch and hose ports.
  h.compound('recovery_pump', 29, [
    box('cabinet', 'cabinet', [-0.19, 0.02, -0.115], [0.19, 0.29, 0.105]),
    box('panel', 'panel', [-0.18, 0.03, 0.105], [0.18, 0.28, 0.11]),
  ] + [
    box('foot-%d-%d' % [i, j], 'rubber', [x - 0.02, 0, z - 0.015], [x + 0.02, 0.02, z + 0.015])
    for i in [0, 1]
    for j in [0, 1]
    for x in [[-0.15, 0.15][i]]
    for z in [[-0.085, 0.075][j]]
  ] + [
    box('post-a', 'rubber', [-0.15, 0.29, -0.02], [-0.13, 0.31, 0.01]),
    box('post-b', 'rubber', [0.13, 0.29, -0.02], [0.15, 0.31, 0.01]),
    rodX('handle', 'rubber', 0.012, -0.15, 0.15, 0.32, -0.005),
  ] + [
    rodZ('gauge-%s-case' % s, 'chrome', 0.042, 0.11, 0.125, x, 0.205)
    for s in ['low', 'high']
    for x in [if s == 'low' then -0.095 else 0.095]
  ] + dial('low', 0.037, -0.095, 0.205, 0.127, 0.2) + [
    p + { slot: if p.slot == 'face' then 'face-high' else p.slot }
    for p in dial('high', 0.037, 0.095, 0.205, 0.127, 0.55)
  ] + [
    tubeZ('low-ring', 'blue', 0.037, 0.042, 0.125, 0.127, -0.095, 0.205),
    tubeZ('high-ring', 'red', 0.037, 0.042, 0.125, 0.127, 0.095, 0.205),
    rodZ('knob-low', 'blue', 0.018, 0.11, 0.135, -0.095, 0.11),
    rodZ('knob-high', 'red', 0.018, 0.11, 0.135, 0.095, 0.11),
    rodZ('selector', 'knob', 0.022, 0.11, 0.13, 0, 0.17),
    box('selector-mark', 'face', [-0.003, 0.17, 0.13], [0.003, 0.188, 0.131]),
    box('switch-plate', 'knob', [-0.015, 0.235, 0.11], [0.015, 0.265, 0.113]),
    box('switch', 'red', [-0.006, 0.243, 0.113], [0.006, 0.257, 0.123]),
  ] + [
    rodZ('port-%d' % i, 'brass', 0.007, 0.11, 0.135, x, 0.06)
    for i in std.range(0, 2)
    for x in [-0.03 + i * 0.03]
  ] + [
    box('vent-%d' % i, 'vent', [-0.1915, 0.07 + i * 0.03, -0.09], [-0.19, 0.08 + i * 0.03, 0.08])
    for i in std.range(0, 5)
  ], {
    cabinet: 'paint-charcoal',
    panel: 'paint-cream',
    rubber: 'rubber-black',
    chrome: 'steel-bright',
    face: 'paint-white',
    'face-high': 'paint-white',
    ink: 'plastic-black',
    danger: 'paint-red',
    blue: 'plastic-blue',
    red: 'plastic-red',
    knob: 'plastic-black',
    brass: 'brass',
    vent: 'plastic-black',
  })
  + { voxelGrain: 0.004 },

  // A plastic clothes hanger hung facing front, 420 mm wide and 230 mm tall with its hook: sloping shoulders, a
  // bar along the bottom and a twisted steel hook from the neck.
  local z0 = -0.005, z1 = 0.005;
  h.compound('clothes_hanger', 0.091, [
    seg('shoulder-a', 'plastic', [-0.205, 0.012], [-0.018, 0.13], 0.014, z0, z1),
    seg('shoulder-b', 'plastic', [0.205, 0.012], [0.018, 0.13], 0.014, z0, z1),
    seg('notch-a', 'plastic', [-0.17, 0.028], [-0.155, 0.045], 0.008, z0, z1),
    seg('notch-b', 'plastic', [0.17, 0.028], [0.155, 0.045], 0.008, z0, z1),
    box('tip-a', 'plastic', [-0.212, 0, -0.006], [-0.196, 0.022, 0.006]),
    box('tip-b', 'plastic', [0.196, 0, -0.006], [0.212, 0.022, 0.006]),
    rodX('bar', 'plastic', 0.005, -0.2, 0.2, 0.006, 0),
    box('neck', 'plastic', [-0.022, 0.12, -0.006], [0.022, 0.15, 0.006]),
    seg('stem', 'hook', [0, 0.148], [0, 0.19], 0.004, -0.002, 0.002),
  ] + [
    local a0 = i * std.pi / 6, a1 = (i + 1) * std.pi / 6;
    seg('hook-%d' % i, 'hook', [-0.022 + 0.022 * std.cos(a0), 0.19 + 0.022 * std.sin(a0)], [-0.022 + 0.022 * std.cos(a1), 0.19 + 0.022 * std.sin(a1)], 0.004, -0.002, 0.002)
    for i in std.range(0, 7)
  ], { plastic: 'plastic-black', hook: 'steel-bright' })
  + { voxelGrain: 0.002 },
]
