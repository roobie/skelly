local h = import '../compound.libsonnet';
local box = h.box;
// An [x, z] outline as a prism lying flat on y from `y0` to `y1`.
local flat(id, slot, outline, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in outline], y0, y1);
// A strip of flat stock lying on y from [x0, z0] to [x1, z1], `w` wide and `t` thick.
local strip(id, slot, a, b, w, t, y0=0) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz), nx = -dz / len * w / 2, nz = dx / len * w / 2;
  flat(id, slot, [[a[0] - nx, a[1] - nz], [b[0] - nx, b[1] - nz], [b[0] + nx, b[1] + nz], [a[0] + nx, a[1] + nz]], y0, y0 + t);
[
  // A rugged field power pack 200 mm wide, 100 mm tall and 125 mm deep, with rubber corner guards, a carry
  // handle on top and a front panel of sockets, a status screen and a power switch.
  h.compound('ups', 3.4, [
    box('body', 'body', [-0.1, 0, -0.0625], [0.1, 0.1, 0.0625]),
  ] + [
    box('guard-%d-%d' % [i, j], 'guard', [sx * 0.1 - 0.012, 0, sz * 0.0625 - 0.012], [sx * 0.1 + 0.012, 0.1, sz * 0.0625 + 0.012])
    for i in [0, 1]
    for j in [0, 1]
    for sx in [[-1, 1][i]]
    for sz in [[-1, 1][j]]
  ] + [
    box('panel', 'panel', [-0.08, 0.012, 0.0625], [0.08, 0.088, 0.065]),
    box('screen', 'screen', [-0.07, 0.055, 0.065], [-0.025, 0.08, 0.066]),
    box('switch', 'switch', [0.055, 0.06, 0.065], [0.07, 0.075, 0.069]),
    box('post-a', 'handle', [-0.06, 0.1, -0.01], [-0.05, 0.125, 0.01]),
    box('post-b', 'handle', [0.05, 0.1, -0.01], [0.06, 0.125, 0.01]),
    box('grip', 'handle', [-0.06, 0.125, -0.01], [0.06, 0.135, 0.01]),
  ] + [
    h.turned('socket-%d' % i, 'socket', 'z', [[0, 0], [0, 0.009], [0.004, 0.009], [0.004, 0]], [-0.06 + i * 0.03, 0.03, 0.065])
    for i in [0, 1, 2, 3]
  ] + [
    h.turned('pin-%d' % i, 'pin', 'z', [[0, 0], [0, 0.004], [0.005, 0.004], [0.005, 0]], [-0.06 + i * 0.03, 0.03, 0.065])
    for i in [0, 1, 2, 3]
  ], {
    body: 'polymer-od-green', guard: 'rubber-black', panel: 'plastic-charcoal', screen: 'lcd-green',
    switch: 'plastic-red', handle: 'alu-bare', socket: 'alu-bare', pin: 'plastic-black',
  }) + { voxelGrain: 0.004 },

  // A thumb drive 50 mm long: an 18 mm by 8 mm plastic body with a lanyard hole, and a 12 mm metal plug.
  h.compound('usb_drive', 0.0055, [
    box('body', 'body', [-0.025, 0, -0.009], [0.012, 0.008, 0.009]),
    box('loop', 'loop', [-0.025, 0.008, -0.003], [-0.019, 0.009, 0.003]),
    box('plug', 'plug', [0.012, 0.0015, -0.006], [0.025, 0.0065, 0.006]),
    box('tongue', 'tongue', [0.0125, 0.002, -0.005], [0.0252, 0.004, 0.005]),
    box('hole-a', 'hole', [0.018, 0.0065, -0.004], [0.021, 0.0068, -0.002]),
    box('hole-b', 'hole', [0.018, 0.0065, 0.002], [0.021, 0.0068, 0.004]),
  ], { body: 'plastic-blue', loop: 'plastic-black', plug: 'steel-stainless', tongue: 'plastic-black', hole: 'plastic-black' }) + {
    voxelGrain: 0.002,
  },

  // A corded-style wand massager 198 mm long: a 34 mm handle with a switch, a narrow neck and a 46 mm soft head.
  h.compound('vibrator', 0.13, [
    h.turned('handle', 'handle', 'x', [[0, 0], [0, 0.013], [0.006, 0.017], [0.125, 0.017], [0.145, 0.012], [0.155, 0.011], [0.155, 0]], [0, 0.023, 0]),
    h.turned('band', 'band', 'x', [[0, 0], [0, 0.0175], [0.006, 0.0175], [0.006, 0]], [0.118, 0.023, 0]),
    h.turned('head', 'head', 'x', [[0, 0], [0, 0.012], [0.006, 0.019], [0.014, 0.0225], [0.024, 0.023], [0.034, 0.0215], [0.040, 0.016], [0.043, 0.008], [0.043, 0]], [0.155, 0.023, 0]),
    box('switch', 'switch', [0.075, 0.038, -0.005], [0.093, 0.0415, 0.005]),
  ], { handle: 'plastic-gloss-white', band: 'alu-bare', head: 'plastic-pink', switch: 'plastic-charcoal' }) + {
    handling: h.gripOn('vibrator', 'handle'),
    voxelGrain: 0.002,
  },

  // A pick and a tension wrench cut from scrap strip: a 110 mm pick with a taped grip and a bent hook, and a 70 mm
  // L-shaped wrench with a 15 mm leg.
  h.compound('crude_picklock', 0.016, [
    strip('pick', 'metal', [-0.055, 0.008], [0.048, 0.008], 0.005, 0.002),
    strip('pick-tip', 'metal', [0.046, 0.008], [0.055, 0.014], 0.003, 0.002),
    box('tape', 'tape', [-0.055, 0, 0.004], [-0.02, 0.003, 0.012]),
    strip('wrench', 'metal', [-0.03, -0.012], [0.04, -0.014], 0.005, 0.002),
    strip('wrench-leg', 'metal', [0.0375, -0.0135], [0.04, -0.028], 0.005, 0.002),
  ], { metal: 'scrap-rusted', tape: 'tape-grey' }) + { voxelGrain: 0.002 },

  // Two lengths of thin bent wire: an 80 mm pick with a kinked tip and an L-shaped 60 mm tension wrench.
  h.compound('emergency_lockpick', 0.004, [
    strip('pick', 'wire', [-0.04, 0.008], [0.036, 0.008], 0.002, 0.002),
    strip('pick-kink', 'wire', [0.035, 0.008], [0.04, 0.012], 0.002, 0.002),
    strip('pick-loop', 'wire', [-0.04, 0.008], [-0.04, 0.014], 0.002, 0.002),
    strip('pick-back', 'wire', [-0.04, 0.014], [-0.02, 0.014], 0.002, 0.002),
    strip('wrench', 'wire', [-0.03, -0.01], [0.03, -0.01], 0.002, 0.002),
    strip('wrench-leg', 'wire', [0.03, -0.01], [0.03, -0.022], 0.002, 0.002),
  ], { wire: 'steel-galvanised' }) + { voxelGrain: 0.002 },

  // A 1.52 m construction pry bar of 26 mm round steel, pointed at one end and forged to a hardened chisel at the other.
  h.compound('heavy_crowbar', 5.5, [
    h.turned('bar', 'bar', 'x', [[0, 0], [0, 0.004], [0.08, 0.013], [1.44, 0.013], [1.44, 0]], [0, 0.013, 0]),
    h.prism('chisel', 'tip', 'z', [[1.44, 0], [1.44, 0.026], [1.52, 0.015], [1.52, 0.011]], -0.015, 0.015),
  ], { bar: 'steel-parkerized', tip: 'steel-bright' }) + {
    handling: h.gripOn('heavy_crowbar', 'bar'),
    voxelGrain: 0.004,
  },

  // A 500 mm mountaineering axe lying flat: an oval alloy shaft with a rubber grip and a spike, and a steel head
  // with a curved pick on one side and a square hammer face on the other.
  h.compound('iceaxe', 0.5, [
    flat('spike', 'head', [[0, 0], [0.03, -0.012], [0.03, 0.012]], 0.004, 0.016),
    box('shaft', 'shaft', [0.03, 0, -0.012], [0.47, 0.02, 0.012]),
    box('grip', 'grip', [0.035, -0.001, -0.013], [0.2, 0.021, 0.013]),
    box('collar', 'head', [0.025, -0.001, -0.013], [0.035, 0.021, 0.013]),
    box('socket', 'head', [0.455, -0.001, -0.016], [0.51, 0.021, 0.016]),
    flat('pick-a', 'head', [[0.51, -0.016], [0.495, -0.09], [0.474, -0.09], [0.48, -0.016]], 0.003, 0.017),
    flat('pick-b', 'head', [[0.495, -0.09], [0.47, -0.15], [0.46, -0.14], [0.474, -0.09]], 0.004, 0.016),
    flat('pick-c', 'head', [[0.47, -0.15], [0.452, -0.168], [0.46, -0.14]], 0.005, 0.015),
    box('hammer-neck', 'head', [0.475, 0.003, 0.016], [0.505, 0.017, 0.05]),
    box('hammer', 'head', [0.47, 0, 0.05], [0.51, 0.02, 0.07]),
  ], { shaft: 'paint-police-blue', grip: 'rubber-black', head: 'steel-stainless' }) + {
    handling: h.gripOn('iceaxe', 'grip'),
    voxelGrain: 0.002,
  },

  // A locksmith's zip wallet laid open, 170 mm by 110 mm: picks in an elastic band on the right, tension wrenches
  // and a pin gauge on the left.
  h.compound('picklocks', 0.15, [
    box('cover-a', 'case', [-0.085, 0, -0.055], [-0.002, 0.006, 0.055]),
    box('cover-b', 'case', [0.002, 0, -0.055], [0.085, 0.006, 0.055]),
    box('spine', 'case', [-0.004, 0, -0.055], [0.004, 0.004, 0.055]),
    box('zip-a', 'zip', [-0.085, 0, 0.055], [-0.002, 0.006, 0.058]),
    box('zip-b', 'zip', [0.002, 0, 0.055], [0.085, 0.006, 0.058]),
    box('zip-c', 'zip', [-0.085, 0, -0.058], [-0.002, 0.006, -0.055]),
    box('zip-d', 'zip', [0.002, 0, -0.058], [0.085, 0.006, -0.055]),
    box('zip-e', 'zip', [-0.088, 0, -0.058], [-0.085, 0.006, 0.058]),
    box('zip-f', 'zip', [0.085, 0, -0.058], [0.088, 0.006, 0.058]),
    box('puller', 'zip', [0.088, 0.001, 0.04], [0.1, 0.004, 0.048]),
    box('band-a', 'band', [0.012, 0.009, -0.02], [0.078, 0.011, -0.008]),
    box('band-b', 'band', [-0.078, 0.009, -0.02], [-0.012, 0.011, -0.008]),
  ] + std.flattenArrays(
    local pts = [-0.044, -0.03, -0.016, -0.002, 0.012, 0.026, 0.04];
    local tips = ['hook', 'rake', 'diamond', 'hook', 'rake', 'diamond', 'hook'];
    std.map(function(i) [
      box('pick-%d-handle' % i, 'handle', [0.01, 0.006, pts[i] - 0.004], [0.04, 0.009, pts[i] + 0.004]),
      box('pick-%d-shank' % i, 'pick', [0.04, 0.006, pts[i] - 0.001], [0.074, 0.008, pts[i] + 0.001]),
    ] + (
      if tips[i] == 'hook' then [box('pick-%d-tip' % i, 'pick', [0.071, 0.006, pts[i]], [0.074, 0.008, pts[i] + 0.004])]
      else if tips[i] == 'rake' then [box('pick-%d-tooth-%d' % [i, k], 'pick', [0.064 + k * 0.004, 0.006, pts[i]], [0.066 + k * 0.004, 0.008, pts[i] + 0.003]) for k in [0, 1, 2]]
      else [box('pick-%d-tip' % i, 'pick', [0.066, 0.006, pts[i]], [0.074, 0.008, pts[i] + 0.003])]
    ), std.range(0, 6))
  ) + [
    box('wrench-%d' % i, 'pick', [-0.074, 0.006, -0.04 + i * 0.016], [-0.02, 0.008, -0.036 + i * 0.016])
    for i in [0, 1, 2, 3]
  ] + [
    box('wrench-%d-leg' % i, 'pick', [-0.024, 0.006, -0.046 + i * 0.016], [-0.02, 0.008, -0.036 + i * 0.016])
    for i in [0, 1, 2, 3]
  ] + [
    box('gauge', 'handle', [-0.074, 0.006, 0.03], [-0.03, 0.009, 0.044]),
  ], { case: 'leather-brown', zip: 'brass-dull', band: 'webbing-black', handle: 'plastic-matte-black', pick: 'steel-stainless' }) + {
    voxelGrain: 0.002,
  },
]
