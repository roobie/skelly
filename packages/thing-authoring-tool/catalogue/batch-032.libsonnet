local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
local tube = h.tube;
// A solid cylinder along `axis` from `a0` to `a1` on that axis, its axis through `origin` (the axis coordinate ignored).
local cyl(id, slot, axis, r, a0, a1, origin) =
  local o = [if ['x', 'y', 'z'][i] == axis then a0 else origin[i] for i in [0, 1, 2]];
  turned(id, slot, axis, [[0, 0], [0, r], [a1 - a0, r], [a1 - a0, 0]], o);
// A hollow ring along `axis`, radii r0 to r1, from `a0` to `a1`, through `origin`.
local ring(id, slot, axis, r0, r1, a0, a1, origin) =
  local o = [if ['x', 'y', 'z'][i] == axis then a0 else origin[i] for i in [0, 1, 2]];
  turned(id, slot, axis, [[0, r0], [0, r1], [a1 - a0, r1], [a1 - a0, r0], [0, r0]], o);
// A flat strap `w` wide lying on y from `y0` to `y1`, running from [xa, za] to [xb, zb].
local strap(id, slot, a, b, w, y0, y1) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  h.prism(id, slot, 'y', [
    [a[1] + nz, a[0] + nx],
    [b[1] + nz, b[0] + nx],
    [b[1] - nz, b[0] - nx],
    [a[1] - nz, a[0] - nx],
  ], y0, y1);
// A regular hexagon of circumradius `r` about [u, v], for hex nuts and flats.
local hexagon(r, u=0, v=0) = [[u + r * std.cos(std.pi / 3 * i), v + r * std.sin(std.pi / 3 * i)] for i in std.range(0, 5)];
// A finned cylinder standing on y from `y0`, core radius `r0`, fins out to `r1` every `pitch`, `fins` of them.
local finned(id, slot, r0, r1, y0, pitch, fins, x, z) =
  local top = pitch * fins + pitch / 2;
  turned(id, slot, 'y', [[0, 0], [0, r0]] + std.flattenArrays([
    [[pitch / 2 + k * pitch, r0], [pitch / 2 + k * pitch, r1], [pitch + k * pitch, r1], [pitch + k * pitch, r0]]
    for k in std.range(0, fins - 1)
  ]) + [[top, r0], [top, 0]], [x, y0, z]);
[
  // A sealed fridge compressor: a black steel shell 160 mm across and 190 mm tall on a base plate 200 by 150 mm with
  // rubber grommets at the corners, three copper pipe stubs on top and a terminal cover on the front.
  h.compound('compressor', 7.5, [
    box('base', 'base', [-0.1, 0.012, -0.075], [0.1, 0.018, 0.075]),
  ] + [
    disc('grommet-%d' % i, 'rubber', 0.011, 0, 0.022, [-0.082, 0.082][i % 2], [-0.058, 0.058][std.floor(i / 2)])
    for i in std.range(0, 3)
  ] + [
    turned('shell', 'shell', 'y', [[0, 0], [0, 0.07], [0.015, 0.079], [0.12, 0.08], [0.15, 0.074], [0.17, 0.056], [0.182, 0.03], [0.186, 0]], [0, 0.018, 0]),
    ring('seam', 'seam', 'y', 0.078, 0.083, 0.098, 0.106, [0, 0, 0]),
    box('terminal', 'terminal', [-0.03, 0.06, 0.07], [0.03, 0.115, 0.092]),
    cyl('stub-suction', 'copper', 'y', 0.0045, 0.16, 0.235, [-0.035, 0, -0.02]),
    cyl('stub-discharge', 'copper', 'y', 0.0035, 0.16, 0.225, [0.03, 0, -0.02]),
    cyl('stub-process', 'copper', 'y', 0.003, 0.16, 0.215, [0, 0, 0.035]),
    disc('crimp', 'copper', 0.0045, 0.215, 0.22, 0, 0.035),
  ], { base: 'steel-grey', rubber: 'rubber-black', shell: 'paint-charcoal', seam: 'steel-parkerized', terminal: 'plastic-black', copper: 'copper' })
  + { voxelGrain: 0.004 },

  // A heavy V-belt, 2 m round, lying on its side as a loop 640 mm across: 22 mm wide at the back face tapering to
  // 13 mm at the inner edge, 14 mm deep, with a white printed size code on the back face.
  h.compound('drivebelt', 0.52, [
    turned('belt', 'belt', 'y', [[0.0045, 0.306], [0.0175, 0.306], [0.022, 0.32], [0, 0.32], [0.0045, 0.306]], [0, 0, 0]),
  ] + [
    box('print-%d' % i, 'print', [-0.07 + i * 0.03, 0.007, 0.319], [-0.05 + i * 0.03, 0.015, 0.322])
    for i in std.range(0, 4)
  ], { belt: 'rubber-black', print: 'paint-white' })
  + { voxelGrain: 0.004 },

  // A belt cobbled from leather strapping, laid out as a loop 860 mm long, 45 mm wide and 7 mm thick, its joint
  // overlapped and bound with cotton cord, with a second cord-bound patch on the other run.
  h.compound('drivebelt_makeshift', 0.64, h.strapLoop('belt', 'leather', 0.6, 0.13, 0.045, 0.007) + [
    box('splice', 'leather-dark', [-0.08, 0.007, 0.105], [0.06, 0.013, 0.155]),
  ] + [
    box('bind-%d' % i, 'cord', [x - 0.006, -0.001, 0.101], [x + 0.006, 0.016, 0.159])
    for i in [0, 1, 2]
    for x in [[-0.07, -0.01, 0.05][i]]
  ] + [
    box('patch', 'cloth', [0.02, 0.007, -0.157], [0.14, 0.011, -0.103]),
  ] + [
    box('wrap-%d' % i, 'cord', [x - 0.005, -0.001, -0.159], [x + 0.005, 0.014, -0.101])
    for i in [0, 1]
    for x in [[0.035, 0.125][i]]
  ], { leather: 'leather-brown', 'leather-dark': 'leather-chestnut', cord: 'cord-cotton', cloth: 'cloth-canvas' })
  + { voxelGrain: 0.004 },

  // A panel engine air filter, 240 by 170 mm and 40 mm deep: a black plastic frame round off-white pleated paper,
  // with a soft sealing lip round its bottom edge.
  h.compound('filter_air', 0.54, [
    box('lip', 'lip', [-0.124, 0, -0.089], [0.124, 0.008, 0.089]),
    box('frame-front', 'frame', [-0.12, 0.008, 0.075], [0.12, 0.04, 0.085]),
    box('frame-back', 'frame', [-0.12, 0.008, -0.085], [0.12, 0.04, -0.075]),
    box('frame-left', 'frame', [-0.12, 0.008, -0.075], [-0.11, 0.04, 0.075]),
    box('frame-right', 'frame', [0.11, 0.008, -0.075], [0.12, 0.04, 0.075]),
    box('floor', 'valley', [-0.11, 0.004, -0.075], [0.11, 0.008, 0.075]),
  ] + [
    h.prism('pleat-%d' % i, 'paper', 'z', [[-0.11 + i * 0.22 / 27, 0.008], [-0.11 + (i + 1) * 0.22 / 27, 0.008], [-0.11 + (i + 0.5) * 0.22 / 27, 0.037]], -0.075, 0.075)
    for i in std.range(0, 26)
  ], { lip: 'rubber-black', frame: 'plastic-black', valley: 'paperboard-tan', paper: 'paper-white' })
  + { voxelGrain: 0.002 },

  // A cut-down plastic bottle, 110 mm across and 190 mm long, lying on its side: its neck taped onto a stub of hose
  // and its open end stuffed with wadded paper that bulges out past the rim.
  h.compound('filter_air_makeshift', 0.12, [
    turned('bottle', 'bottle', 'x', [[0, 0.049], [0, 0.055], [0.12, 0.055], [0.15, 0.04], [0.165, 0.016], [0.165, 0.012], [0.16, 0.012], [0.145, 0.035], [0.117, 0.049], [0, 0.049]], [-0.09, 0.055, 0]),
    cyl('fill', 'paper', 'x', 0.048, -0.075, 0.06, [0, 0.055, 0]),
    turned('neck', 'bottle', 'x', [[0, 0.012], [0, 0.016], [0.02, 0.016], [0.02, 0.012], [0, 0.012]], [0.075, 0.055, 0]),
    ring('hose', 'hose', 'x', 0.011, 0.017, 0.085, 0.15, [0, 0.055, 0]),
    ring('tape-neck', 'tape', 'x', 0.016, 0.02, 0.07, 0.1, [0, 0.055, 0]),
    ring('tape-rim', 'tape', 'x', 0.055, 0.058, -0.09, -0.065, [0, 0.055, 0]),
  ] + [
    h.ball('wad-%d' % i, 'paper', w[3], w[0], w[1], w[2])
    for i in std.range(0, 5)
    for w in [[[-0.095, 0.055, 0, 0.03], [-0.1, 0.075, 0.02, 0.02], [-0.098, 0.035, -0.022, 0.022], [-0.1, 0.03, 0.025, 0.018], [-0.097, 0.08, -0.018, 0.019], [-0.11, 0.06, -0.005, 0.016]][i]]
  ], { bottle: 'plastic-frosted', paper: 'paper-white', hose: 'rubber-black', tape: 'tape-grey' })
  + { voxelGrain: 0.004 },

  // A spin-on oil filter, 100 mm across and 150 mm long, lying on its side with its base plate to the front: a
  // blue-painted steel can with a domed end and printed band, a rolled seam, a rubber gasket ring, a threaded centre
  // hole and a ring of six inlet holes.
  h.compound('filter_liquid', 1.1, [
    turned('can', 'can', 'z', [[0, 0], [0.004, 0.03], [0.012, 0.044], [0.024, 0.05], [0.14, 0.05], [0.14, 0]], [0, 0.05, -0.075]),
    ring('band', 'band', 'z', 0.049, 0.0505, -0.02, 0.03, [0, 0.05, 0]),
    ring('seam', 'seam', 'z', 0.04, 0.0505, 0.065, 0.072, [0, 0.05, 0]),
    cyl('plate', 'plate', 'z', 0.044, 0.065, 0.075, [0, 0.05, 0]),
    ring('gasket', 'gasket', 'z', 0.031, 0.038, 0.075, 0.08, [0, 0.05, 0]),
    ring('thread', 'plate', 'z', 0.009, 0.013, 0.075, 0.078, [0, 0.05, 0]),
    cyl('hole', 'hole', 'z', 0.009, 0.075, 0.0752, [0, 0.05, 0]),
  ] + [
    cyl('inlet-%d' % i, 'hole', 'z', 0.0045, 0.075, 0.0752, [0.021 * std.cos(std.pi / 3 * i), 0.05 + 0.021 * std.sin(std.pi / 3 * i), 0])
    for i in std.range(0, 5)
  ], { can: 'paint-drum-blue', band: 'paint-white', seam: 'steel-grey', plate: 'steel-galvanised', gasket: 'rubber-black', hole: 'plastic-black' })
  + { voxelGrain: 0.002 },

  // A food tin, 85 mm across and 110 mm tall, turned into a filter: a soldered-on lid with two copper hose nipples,
  // its sides bound with grey tape and a twist of wire.
  h.compound('filter_liquid_makeshift', 0.12, [
    turned('can', 'can', 'y', [[0, 0], [0, 0.04], [0.004, 0.0425], [0.008, 0.04], [0.102, 0.04], [0.106, 0.0425], [0.11, 0.04], [0.11, 0]], [0, 0, 0]),
    ring('solder', 'solder', 'y', 0.036, 0.042, 0.11, 0.114, [0, 0, 0]),
    ring('tape', 'tape', 'y', 0.04, 0.0425, 0.035, 0.075, [0, 0, 0]),
    ring('wire', 'wire', 'y', 0.0425, 0.0445, 0.052, 0.056, [0, 0, 0]),
    box('wire-twist', 'wire', [-0.003, 0.05, 0.043], [0.003, 0.058, 0.055]),
    cyl('nipple-in', 'copper', 'y', 0.006, 0.11, 0.15, [-0.016, 0, 0]),
    cyl('nipple-out', 'copper', 'y', 0.006, 0.11, 0.15, [0.016, 0, 0]),
    ring('barb-in', 'copper', 'y', 0.006, 0.0075, 0.138, 0.144, [-0.016, 0, 0]),
    ring('barb-out', 'copper', 'y', 0.006, 0.0075, 0.138, 0.144, [0.016, 0, 0]),
    disc('bore-in', 'bore', 0.0035, 0.15, 0.1502, -0.016, 0),
    disc('bore-out', 'bore', 0.0035, 0.15, 0.1502, 0.016, 0),
  ], { can: 'steel-bright', solder: 'lead', tape: 'tape-grey', wire: 'steel-grey', copper: 'copper', bore: 'plastic-black' })
  + { voxelGrain: 0.002 },

  // A five-point seat harness laid out flat, about 700 mm across and 900 mm long: black webbing 50 mm wide, two
  // shoulder straps, two lap straps and a crotch strap meeting at a round turn-release buckle, each strap with a
  // slide adjuster and a steel bolt-in tab at its end.
  local ends = [[-0.13, -0.62], [0.13, -0.62], [-0.36, 0.06], [0.36, 0.06], [0, 0.3]];
  local adj = [[-0.1, -0.48], [0.1, -0.48], [-0.22, 0.035], [0.22, 0.035], [0, 0.18]];
  h.compound('five_point_harness', 1.5, [
    strap('strap-%d' % i, 'webbing', [0, 0], ends[i], 0.05, 0, 0.003)
    for i in std.range(0, 4)
  ] + [
    strap('pad-%d' % i, 'pad', [ends[i][0] * 0.25, ends[i][1] * 0.25], [ends[i][0] * 0.6, ends[i][1] * 0.6], 0.08, 0.003, 0.012)
    for i in [0, 1]
  ] + [
    box('adjuster-%d' % i, 'steel', [adj[i][0] - 0.03, 0.003, adj[i][1] - 0.03], [adj[i][0] + 0.03, 0.009, adj[i][1] + 0.03])
    for i in std.range(0, 4)
  ] + [
    box('tab-%d' % i, 'steel', [ends[i][0] - 0.022, 0.003, ends[i][1] - 0.022], [ends[i][0] + 0.022, 0.007, ends[i][1] + 0.022])
    for i in std.range(0, 4)
  ] + [
    disc('tab-hole-%d' % i, 'hole', 0.007, 0.007, 0.0072, ends[i][0], ends[i][1])
    for i in std.range(0, 4)
  ] + [
    disc('buckle', 'buckle', 0.05, 0.003, 0.018),
    disc('dial', 'dial', 0.032, 0.018, 0.026),
    box('dial-grip', 'buckle', [-0.028, 0.026, -0.005], [0.028, 0.032, 0.005]),
  ], { webbing: 'webbing-black', pad: 'cloth-red', steel: 'steel-bright', hole: 'plastic-black', buckle: 'alu-bare', dial: 'paint-red' })
  + { voxelGrain: 0.004 },

  // A diesel glow plug, 100 mm long, lying on its side: a terminal stud and nut, a plastic insulating collar, a
  // 12 mm hex, a threaded section, a long shank and a thin heater rod at the tip.
  h.compound('glowplug', 0.048, [
    cyl('stud', 'stud', 'x', 0.0025, -0.05, -0.036, [0, 0.007, 0]),
    h.prism('nut', 'stud', 'x', hexagon(0.0045, 0.007, 0), -0.047, -0.042),
    cyl('collar', 'collar', 'x', 0.0045, -0.036, -0.03, [0, 0.007, 0]),
    h.prism('hex', 'body', 'x', hexagon(0.007, 0.007, 0), -0.03, -0.018),
    turned('body', 'body', 'x', [[0, 0], [0, 0.005], [0.02, 0.005], [0.02, 0.0045], [0.05, 0.0045], [0.054, 0.003], [0.054, 0]], [-0.018, 0.007, 0]),
  ] + [
    ring('thread-%d' % i, 'thread', 'x', 0.004, 0.0055, -0.016 + i * 0.004, -0.014 + i * 0.004, [0, 0.007, 0])
    for i in std.range(0, 4)
  ] + [
    turned('heater', 'heater', 'x', [[0, 0], [0, 0.0025], [0.016, 0.0025], [0.018, 0.0015], [0.018, 0]], [0.032, 0.007, 0]),
  ], { stud: 'brass', collar: 'plastic-black', body: 'steel-bright', thread: 'steel-grey', heater: 'steel-heat-tint' })
  + { voxelGrain: 0.002 },

  // A twin-cylinder industrial compressor pump, 420 mm wide and 420 mm tall: a red cast-iron crankcase on feet, two
  // finned cast-iron cylinders with alloy heads joined by a copper discharge pipe, an intake filter on each head and
  // a spoked flywheel pulley 300 mm across on the front.
  h.compound('hd_compressor', 41, [
    box('foot-left', 'iron', [-0.15, 0, -0.12], [-0.11, 0.04, 0.12]),
    box('foot-right', 'iron', [0.11, 0, -0.12], [0.15, 0.04, 0.12]),
    box('crankcase', 'case', [-0.15, 0.04, -0.1], [0.15, 0.24, 0.1]),
    box('oil-window', 'window', [0.06, 0.07, 0.1], [0.09, 0.1, 0.103]),
    cyl('bearing', 'case', 'z', 0.055, 0.1, 0.13, [0, 0.16, 0]),
    cyl('shaft', 'steel', 'z', 0.016, 0.13, 0.2, [0, 0.16, 0]),
    ring('rim', 'wheel', 'z', 0.125, 0.15, 0.15, 0.19, [0, 0.16, 0]),
    ring('groove', 'groove', 'z', 0.145, 0.1505, 0.164, 0.176, [0, 0.16, 0]),
    cyl('hub', 'wheel', 'z', 0.032, 0.148, 0.192, [0, 0.16, 0]),
    box('spoke-v', 'wheel', [-0.012, 0.04, 0.162], [0.012, 0.28, 0.178]),
    box('spoke-h', 'wheel', [-0.13, 0.148, 0.162], [0.13, 0.172, 0.178]),
    finned('cylinder-left', 'iron', 0.045, 0.066, 0.24, 0.016, 8, -0.075, 0),
    finned('cylinder-right', 'iron', 0.045, 0.066, 0.24, 0.016, 8, 0.075, 0),
    box('head-left', 'head', [-0.145, 0.376, -0.07], [-0.005, 0.41, 0.07]),
    box('head-right', 'head', [0.005, 0.376, -0.07], [0.145, 0.41, 0.07]),
    turned('pipe', 'copper', 'x', [[0, 0], [0, 0.009], [0.13, 0.009], [0.13, 0]], [-0.065, 0.393, 0.08]),
    box('pipe-drop-left', 'copper', [-0.074, 0.384, 0.055], [-0.056, 0.402, 0.089]),
    box('pipe-drop-right', 'copper', [0.056, 0.384, 0.055], [0.074, 0.402, 0.089]),
    cyl('intake-left', 'filter', 'y', 0.04, 0.41, 0.45, [-0.075, 0, -0.02]),
    cyl('intake-right', 'filter', 'y', 0.04, 0.41, 0.45, [0.075, 0, -0.02]),
  ], { iron: 'iron-cast', case: 'paint-red', window: 'plastic-clear', steel: 'steel-grey', wheel: 'paint-red', groove: 'iron-cast', head: 'alu-bare', copper: 'copper', filter: 'paint-charcoal' })
  + { voxelGrain: 0.004 },

  // A 400 mm length of heavy-wall steel pipe, 48 mm across with an 11 mm wall, threaded at both ends: one end open
  // to show the thick wall, the other under a red plastic thread cap, with a yellow pressure-rating stripe.
  h.compound('hd_pipe', 4.2, [
    tube('pipe', 'pipe', 0.013, 0.024, -0.2, 0.2, 0.0245, 0),
    tube('thread-left', 'thread', 0.013, 0.0243, -0.2, -0.17, 0.0245, 0),
    tube('thread-right', 'thread', 0.013, 0.0243, 0.17, 0.2, 0.0245, 0),
    turned('cap', 'cap', 'x', [[0, 0.0235], [0, 0.0275], [0.035, 0.0275], [0.035, 0], [0.031, 0], [0.031, 0.0235], [0, 0.0235]], [0.174, 0.0245, 0]),
    tube('stripe', 'stripe', 0.023, 0.0242, -0.02, 0.02, 0.0245, 0),
  ], { pipe: 'steel-grey', thread: 'steel-parkerized', cap: 'plastic-red', stripe: 'paint-crane-yellow' })
  + { voxelGrain: 0.004 },

  // A loose set of heavy forged steel pipe fittings for 48 mm pipe, spread over about 330 by 230 mm: a 90-degree
  // elbow, a tee, a domed end cap, a coupling and a weld-neck flange with four bolt holes.
  h.compound('hd_pipe_fittings', 3.5, [
    tube('elbow-x', 'forged', 0.012, 0.024, -0.15, -0.09, 0.024, -0.07),
    turned('elbow-z', 'forged', 'z', [[0, 0.012], [0, 0.024], [0.06, 0.024], [0.06, 0.012], [0, 0.012]], [-0.15, 0.024, -0.07]),
    h.ball('elbow-knee', 'forged', 0.025, -0.15, 0.024, -0.07),
    tube('tee-run', 'forged', 0.012, 0.024, 0.0, 0.11, 0.024, -0.08),
    ring('tee-branch', 'forged', 'y', 0.012, 0.024, 0.024, 0.085, [0.055, 0, -0.08]),
    turned('cap', 'forged', 'y', [[0, 0], [0, 0.027], [0.03, 0.027], [0.038, 0.022], [0.044, 0.012], [0.046, 0]], [-0.1, 0, 0.07]),
    turned('coupling', 'forged', 'z', [[0, 0.012], [0, 0.027], [0.055, 0.027], [0.055, 0.012], [0, 0.012]], [0.0, 0.027, 0.04]),
    ring('flange', 'flange', 'y', 0.013, 0.065, 0, 0.016, [0.12, 0, 0.07]),
    turned('flange-neck', 'flange', 'y', [[0, 0.013], [0, 0.04], [0.012, 0.028], [0.04, 0.024], [0.04, 0.013], [0, 0.013]], [0.12, 0.016, 0.07]),
  ] + [
    disc('bolt-hole-%d' % i, 'hole', 0.007, 0.016, 0.0162, 0.12 + 0.05 * std.cos(std.pi / 2 * i + std.pi / 4), 0.07 + 0.05 * std.sin(std.pi / 2 * i + std.pi / 4))
    for i in std.range(0, 3)
  ], { forged: 'steel-parkerized', flange: 'steel-grey', hole: 'plastic-black' })
  + { voxelGrain: 0.004 },

  // A flanged gate valve, 270 mm long and 330 mm tall: a short heavy-wall pipe body with a bolted flange at each end,
  // a swollen gate chamber, a bonnet, a rising stem and a red spoked handwheel 150 mm across.
  h.compound('hd_valve', 7.9, [
    tube('body', 'body', 0.016, 0.03, -0.12, 0.12, 0.07, 0),
    ring('flange-left', 'body', 'x', 0.016, 0.07, -0.135, -0.115, [0, 0.07, 0]),
    ring('flange-right', 'body', 'x', 0.016, 0.07, 0.115, 0.135, [0, 0.07, 0]),
  ] + [
    cyl('bolt-%s-%d' % [s, i], 'bolt', 'x', 0.007, [-0.141, 0.135][if s == 'l' then 0 else 1], [-0.135, 0.141][if s == 'l' then 0 else 1], [0, 0.07 + 0.052 * std.sin(std.pi / 2 * i + std.pi / 4), 0.052 * std.cos(std.pi / 2 * i + std.pi / 4)])
    for s in ['l', 'r']
    for i in std.range(0, 3)
  ] + [
    h.ball('chamber', 'body', 0.05, 0, 0.07, 0, 1.1),
    turned('bonnet', 'body', 'y', [[0, 0], [0, 0.05], [0.012, 0.05], [0.012, 0.034], [0.09, 0.03], [0.1, 0.018], [0.1, 0]], [0, 0.11, 0]),
    cyl('stem', 'stem', 'y', 0.008, 0.21, 0.3, [0, 0, 0]),
    ring('wheel', 'wheel', 'y', 0.064, 0.075, 0.262, 0.276, [0, 0, 0]),
    cyl('wheel-hub', 'wheel', 'y', 0.018, 0.258, 0.282, [0, 0, 0]),
    box('spoke-x', 'wheel', [-0.068, 0.263, -0.007], [0.068, 0.275, 0.007]),
    box('spoke-z', 'wheel', [-0.007, 0.263, -0.068], [0.007, 0.275, 0.068]),
    cyl('stem-nut', 'bolt', 'y', 0.01, 0.282, 0.292, [0, 0, 0]),
  ], { body: 'iron-cast', bolt: 'steel-grey', stem: 'steel-bright', wheel: 'paint-red' })
  + { voxelGrain: 0.004 },

  // A horizontal steel pressure vessel, 3 m long and 600 mm across, with elliptical heads, standing on two saddles:
  // a bolted manway on top, two smaller flanged nozzles, a drain at the bottom, lifting lugs and a nameplate.
  local axisY = 0.55, R = 0.3;
  h.compound('large_pressure_vessel', 290, [
    turned('shell', 'shell', 'x', [[0, 0]] + [
      [0.16 * (1 - std.cos(std.pi / 2 * k / 6)), R * std.sin(std.pi / 2 * k / 6)]
      for k in std.range(1, 6)
    ] + [
      [3 - 0.16 * (1 - std.cos(std.pi / 2 * k / 6)), R * std.sin(std.pi / 2 * k / 6)]
      for k in [6, 5, 4, 3, 2, 1]
    ] + [[3, 0]], [-1.5, axisY, 0]),
    ring('weld-left', 'weld', 'x', 0.29, 0.304, -1.345, -1.33, [0, axisY, 0]),
    ring('weld-right', 'weld', 'x', 0.29, 0.304, 1.33, 1.345, [0, axisY, 0]),
  ] + std.flattenArrays([
    [
      box('saddle-base-%d' % i, 'saddle', [x - 0.1, 0, -0.27], [x + 0.1, 0.02, 0.27]),
      h.prism('saddle-web-%d' % i, 'saddle', 'x', [[0.02, -0.25], [0.02, 0.25], [0.4, 0.2], [0.4, -0.2]], x - 0.012, x + 0.012),
      box('saddle-rib-%d' % i, 'saddle', [x - 0.09, 0.02, -0.012], [x + 0.09, 0.3, 0.012]),
    ]
    for i in [0, 1]
    for x in [[-0.95, 0.95][i]]
  ]) + [
    cyl('manway-neck', 'nozzle', 'y', 0.12, 0.8, 0.98, [0.2, 0, 0]),
    cyl('manway-flange', 'nozzle', 'y', 0.17, 0.98, 1.01, [0.2, 0, 0]),
    cyl('manway-cover', 'cover', 'y', 0.17, 1.01, 1.04, [0.2, 0, 0]),
  ] + [
    disc('manway-bolt-%d' % i, 'bolt', 0.012, 1.04, 1.055, 0.2 + 0.145 * std.cos(std.pi / 4 * i), 0.145 * std.sin(std.pi / 4 * i))
    for i in std.range(0, 7)
  ] + [
    cyl('nozzle-%d' % i, 'nozzle', 'y', 0.035, 0.8, 0.95, [x, 0, 0])
    for i in [0, 1]
    for x in [[-1.0, 0.9][i]]
  ] + [
    cyl('nozzle-flange-%d' % i, 'nozzle', 'y', 0.07, 0.95, 0.975, [x, 0, 0])
    for i in [0, 1]
    for x in [[-1.0, 0.9][i]]
  ] + [
    cyl('drain', 'nozzle', 'y', 0.025, 0.12, 0.3, [-0.4, 0, 0]),
    cyl('drain-flange', 'nozzle', 'y', 0.05, 0.12, 0.14, [-0.4, 0, 0]),
    box('lug-left', 'saddle', [-0.66, 0.8, -0.015], [-0.54, 0.92, 0.015]),
    box('lug-right', 'saddle', [0.54, 0.8, -0.015], [0.66, 0.92, 0.015]),
    cyl('lug-eye-left', 'hole', 'z', 0.025, -0.016, 0.016, [-0.6, 0.88, 0]),
    cyl('lug-eye-right', 'hole', 'z', 0.025, -0.016, 0.016, [0.6, 0.88, 0]),
    box('nameplate', 'plate', [-0.6, 0.48, 0.29], [-0.4, 0.6, 0.302]),
  ], { shell: 'paint-cream', weld: 'steel-grey', saddle: 'paint-charcoal', nozzle: 'steel-grey', cover: 'steel-grey', bolt: 'steel-parkerized', hole: 'plastic-black', plate: 'steel-stainless' }),

  // A nitrogen separation membrane module, 600 mm long and 64 mm across: a stainless tube with machined end caps, a
  // brass air inlet and nitrogen outlet on the ends, a vent port near the outlet and a blue label band.
  h.compound('nitrogen_membrane_filter', 2.1, [
    cyl('tube', 'tube', 'x', 0.03, -0.255, 0.255, [0, 0.032, 0]),
    cyl('cap-left', 'cap', 'x', 0.032, -0.29, -0.25, [0, 0.032, 0]),
    cyl('cap-right', 'cap', 'x', 0.032, 0.25, 0.29, [0, 0.032, 0]),
    ring('cap-groove-left', 'groove', 'x', 0.028, 0.0322, -0.262, -0.258, [0, 0.032, 0]),
    ring('cap-groove-right', 'groove', 'x', 0.028, 0.0322, 0.258, 0.262, [0, 0.032, 0]),
    h.prism('inlet-hex', 'brass', 'x', hexagon(0.012, 0.032, 0), -0.302, -0.29),
    cyl('inlet', 'brass', 'x', 0.007, -0.312, -0.302, [0, 0.032, 0]),
    h.prism('outlet-hex', 'brass', 'x', hexagon(0.012, 0.032, 0), 0.29, 0.302),
    cyl('outlet', 'brass', 'x', 0.007, 0.302, 0.312, [0, 0.032, 0]),
    cyl('vent', 'brass', 'y', 0.008, 0.055, 0.076, [0.27, 0, 0]),
    ring('label', 'label', 'x', 0.029, 0.031, -0.12, 0.12, [0, 0.032, 0]),
    box('arrow', 'arrow', [-0.06, 0.0615, -0.006], [0.06, 0.0635, 0.006]),
    h.prism('arrow-head', 'arrow', 'y', [[-0.014, 0.06], [0, 0.085], [0.014, 0.06]], 0.0615, 0.0635),
  ], { tube: 'steel-stainless', cap: 'alu-bare', groove: 'steel-grey', brass: 'brass', label: 'paint-police-blue', arrow: 'paint-white' })
  + { voxelGrain: 0.004 },
]
