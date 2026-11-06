local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local prism = h.prism;
// A hollow shell turned about `axis`, closed on its first point so the hole stays open.
local shell(id, slot, axis, profile, origin) = turned(id, slot, axis, profile + [profile[0]], origin);
// A stored-pressure extinguisher standing on y, label on +z and hose down the +x side: a cylinder `r` across and
// `ht` to the shoulder, a valve with carry handle and squeeze lever on top, a hose from the valve to an outlet `nozzle`
// clipped low on the side. Slots: body, foot, label, valve, lever, gauge, hose, nozzle.
local extinguisher(r, ht, valveHt, hoseR, nozzle) =
  local top = ht + r * 0.5;
  local vy = top + 0.004;
  local hx = r + hoseR + 0.002;
  [
    turned('body', 'body', 'y', [[0, 0], [0, r - 0.004], [0.006, r], [ht, r], [ht + r * 0.3, r * 0.75], [top, r * 0.3], [top, 0]]),
    shell('foot', 'foot', 'y', [[0, r - 0.006], [0, r + 0.003], [0.02, r + 0.003], [0.02, r - 0.006]], [0, -0.002, 0]),
    box('label', 'label', [-r * 0.6, ht * 0.35, r - 0.01], [r * 0.6, ht * 0.75, r + 0.003]),
    h.disc('neck', 'valve', r * 0.22, top - 0.004, vy + 0.012),
    box('valve', 'valve', [-r * 0.3, vy + 0.008, -0.016], [r * 0.45, vy + valveHt, 0.016]),
    h.turned('gauge', 'gauge', 'z', [[0, 0], [0, 0.014], [0.008, 0.014], [0.008, 0]], [-r * 0.05, vy + valveHt * 0.55, 0.016]),
    box('carry', 'valve', [-r * 1.1, vy + valveHt - 0.012, -0.009], [-r * 0.3, vy + valveHt - 0.002, 0.009]),
    box('lever', 'lever', [-r * 1.15, vy + valveHt + 0.012, -0.010], [r * 0.4, vy + valveHt + 0.020, 0.010]),
    box('lever-pin', 'lever', [r * 0.25, vy + valveHt - 0.004, -0.006], [r * 0.4, vy + valveHt + 0.014, 0.006]),
    h.rod('hose-out', 'hose', hoseR, r * 0.45, hx + hoseR, vy + valveHt * 0.4),
    turned('hose', 'hose', 'y', [[0, 0], [0, hoseR], [vy + valveHt * 0.4 - nozzle[1], hoseR], [vy + valveHt * 0.4 - nozzle[1], 0]], [hx, nozzle[1], 0]),
    box('clip', 'foot', [r - 0.004, nozzle[1] + 0.01, -0.012], [hx + nozzle[0] + 0.004, nozzle[1] + 0.022, 0.012]),
    turned('nozzle', 'nozzle', 'y', [[0, nozzle[0] * 0.5], [0, nozzle[0]], [nozzle[2], nozzle[0] * 0.6], [nozzle[2], 0]], [hx, nozzle[1] - nozzle[2], 0]),
  ];
[
  // A five-gallon foam extinguisher 500 mm tall: a 170 mm steel cylinder, a brass valve with lever and gauge, and
  // a hose running down the side to a foam nozzle.
  h.compound('extinguisher', 14, extinguisher(0.085, 0.38, 0.04, 0.009, [0.016, 0.15, 0.09]), {
    body: 'paint-red', foot: 'plastic-black', label: 'paper-white', valve: 'brass', lever: 'steel-grey',
    gauge: 'plastic-white', hose: 'rubber-black', nozzle: 'plastic-black',
  }) + { voxelGrain: 0.004 },
  // A 2 kg CO2 extinguisher 400 mm tall: a narrow steel cylinder with a valve and a hose to a black discharge horn
  // clipped to the side.
  h.compound('sm_extinguisher', 6.5, extinguisher(0.05, 0.3, 0.035, 0.007, [0.03, 0.15, 0.13]), {
    body: 'paint-red', foot: 'plastic-black', label: 'paper-white', valve: 'steel-grey', lever: 'steel-grey',
    gauge: 'plastic-white', hose: 'rubber-black', nozzle: 'plastic-black',
  }) + h.inHand('sm_extinguisher', 'body') + { voxelGrain: 0.004 },
  // A thrown extinguisher 120 mm tall: an 84 mm steel ball of agent with a short neck, a capped plug with a pull ring
  // and a label band round its middle.
  h.compound('throw_extinguisher', 0.4, [
    h.ball('ball', 'body', 0.042, 0, 0.042, 0),
    h.disc('band', 'label', 0.0425, 0.036, 0.048),
    h.disc('neck', 'body', 0.014, 0.08, 0.094),
    h.disc('cap', 'cap', 0.017, 0.094, 0.104),
    shell('ring', 'ring', 'z', [[-0.002, 0.008], [-0.002, 0.013], [0.002, 0.013], [0.002, 0.008]], [0, 0.118, 0]),
  ], { body: 'paint-red', label: 'paper-white', cap: 'plastic-black', ring: 'steel-grey' }) + h.inHand('throw_extinguisher', 'ball') + {
    voxelGrain: 0.002,
  },
  // A 900 mm pickhead fire axe lying flat: a hickory haft and a red forged head, a 140 mm cutting blade on +z and a
  // 170 mm pick on -z.
  h.compound('fire_ax', 5, [
    turned('grip', 'haft', 'x', [[0, 0], [0, 0.021], [0.03, 0.019], [0.3, 0.017], [0.3, 0]]),
    turned('haft', 'haft', 'x', [[0, 0], [0, 0.017], [0.5, 0.016], [0.6, 0.019], [0.6, 0]], [0.3, 0, 0]),
    box('eye', 'head', [0.79, -0.018, -0.03], [0.89, 0.018, 0.03]),
    prism('cheek', 'head', 'y', [[0.03, 0.795], [0.03, 0.885], [0.11, 0.91], [0.11, 0.765]], -0.01, 0.01),
    prism('edge', 'edge', 'y', [[0.11, 0.765], [0.11, 0.91], [0.135, 0.925], [0.135, 0.75]], -0.005, 0.005),
    prism('pick', 'head', 'y', [[-0.03, 0.80], [-0.03, 0.88], [-0.17, 0.842], [-0.17, 0.838]], -0.01, 0.01),
    prism('pick-tip', 'edge', 'y', [[-0.15, 0.835], [-0.15, 0.845], [-0.172, 0.841], [-0.172, 0.839]], -0.006, 0.006),
  ], { haft: 'wood-oak', head: 'paint-red', edge: 'steel-bright' }) + {
    handling: h.gripOn('fire_ax', 'grip'),
    voxelGrain: 0.004,
  },
  // A 760 mm forged Halligan bar lying flat, drawn at 0.9 scale from a 845 mm sketch: a 30 mm shaft with a fork at -x, and at +x an adze blade on +z and a
  // tapered pike on -z.
  h.compound('halligan', 5.4, h.scaled([
    turned('shaft', 'shaft', 'x', [[0, 0], [0, 0.017], [0.66, 0.017], [0.66, 0]], [0.02, 0, 0]),
    turned('collar', 'head', 'x', [[0, 0], [0, 0.024], [0.06, 0.024], [0.06, 0]], [0.68, 0, 0]),
    prism('adze', 'head', 'y', [[0.02, 0.695], [0.02, 0.74], [0.1, 0.76], [0.115, 0.745], [0.1, 0.70]], -0.008, 0.008),
    prism('adze-edge', 'edge', 'y', [[0.1, 0.70], [0.115, 0.745], [0.12, 0.742], [0.104, 0.698]], -0.004, 0.004),
    prism('pike', 'head', 'y', [[-0.02, 0.69], [-0.02, 0.735], [-0.15, 0.716], [-0.15, 0.712]], -0.012, 0.012),
    prism('fork-root', 'head', 'y', [[-0.022, -0.02], [0.022, -0.02], [0.02, 0.04], [-0.02, 0.04]], -0.012, 0.012),
    prism('tine-a', 'edge', 'y', [[0.004, -0.02], [0.024, -0.02], [0.03, -0.075], [0.018, -0.085], [0.006, -0.06]], -0.006, 0.006),
    prism('tine-b', 'edge', 'y', [[-0.004, -0.02], [-0.006, -0.06], [-0.018, -0.085], [-0.03, -0.075], [-0.024, -0.02]], -0.006, 0.006),
  ] + [
    turned('knurl-%d' % i, 'knurl', 'x', [[0, 0], [0, 0.0185], [0.012, 0.0185], [0.012, 0]], [0.1 + i * 0.03, 0, 0])
    for i in std.range(0, 5)
  ], 0.9), { shaft: 'steel-grey', head: 'steel-grey', edge: 'steel-bright', knurl: 'steel-parkerized' }) + {
    handling: h.gripOn('halligan', 'shaft'),
    voxelGrain: 0.004,
  },
  // A 1.6 m pike pole lying flat: a yellow fibreglass shaft with a rubber butt grip, and a steel head with a straight
  // spike and a hook curving back on +z.
  h.compound('pike_pole', 2, [
    turned('shaft', 'shaft', 'x', [[0, 0], [0, 0.016], [1.48, 0.016], [1.48, 0]]),
    turned('grip', 'grip', 'x', [[0, 0], [0, 0.02], [0.3, 0.019], [0.3, 0]]),
    turned('ferrule', 'head', 'x', [[0, 0], [0, 0.02], [0.07, 0.019], [0.07, 0]], [1.47, 0, 0]),
    turned('spike', 'head', 'x', [[0, 0], [0, 0.012], [0.06, 0.002], [0.06, 0]], [1.54, 0, 0]),
    prism('hook-arm', 'head', 'y', [[0.012, 1.565], [0.064, 1.53], [0.058, 1.514], [0.012, 1.545]], -0.006, 0.006),
    prism('hook-tip', 'head', 'y', [[0.056, 1.534], [0.072, 1.525], [0.072, 1.48], [0.058, 1.494]], -0.006, 0.006),
  ], { shaft: 'plastic-yellow', grip: 'rubber-black', head: 'steel-grey' }) + {
    handling: h.gripOn('pike_pole', 'grip'),
  },
  // A two-litre bottle trap 330 mm long lying on x: the bottle's top cut off and pushed back into it neck first as
  // a funnel at +x, tied in with cord, a cord loop on top and a few drain holes.
  h.compound('fish_trap', 0.05, [
    turned('bottle', 'bottle', 'x', [[0, 0], [0, 0.03], [0.006, 0.045], [0.014, 0.051], [0.27, 0.051], [0.27, 0.048], [0.016, 0.048], [0.008, 0.042], [0.003, 0.027], [0.003, 0]]),
    shell('funnel', 'funnel', 'x', [[0.08, 0.046], [0.08, 0.054], [0.086, 0.054], [0.086, 0.046], [0.04, 0.033], [0, 0.013], [0, 0.009], [0.04, 0.029]], [0.19, 0, 0]),
    shell('tie-a', 'cord', 'x', [[0, 0.051], [0, 0.055], [0.006, 0.055], [0.006, 0.051]], [0.25, 0, 0]),
    shell('tie-b', 'cord', 'x', [[0, 0.051], [0, 0.055], [0.006, 0.055], [0.006, 0.051]], [0.03, 0, 0]),
    box('loop', 'cord', [0.03, 0.053, -0.002], [0.256, 0.056, 0.002]),
  ] + [
    box('hole-%d' % i, 'hole', [0.06 + i * 0.05, 0.049, -0.003], [0.066 + i * 0.05, 0.0515, 0.003])
    for i in std.range(0, 3)
  ] + [
    box('side-hole-%d' % i, 'hole', [0.085 + i * 0.05, -0.003, 0.049], [0.091 + i * 0.05, 0.003, 0.0515])
    for i in std.range(0, 2)
  ], { bottle: 'plastic-clear', funnel: 'plastic-clear-blue', cord: 'cord-cotton', hole: 'plastic-charcoal' }) + {
    voxelGrain: 0.004,
  },
  // A woven trap 500 mm long lying on x: a wicker cone closed and tied at -x, 240 mm across its mouth at +x, with an
  // inner funnel in the mouth and bark hoops round it.
  h.compound('fish_trap_basket', 0.35, [
    shell('body', 'wicker', 'x', [
      [0.01, 0], [0.01, 0.02], [0.08, 0.06], [0.14, 0.085], [0.145, 0.08], [0.2, 0.098], [0.205, 0.093], [0.26, 0.108],
      [0.265, 0.103], [0.32, 0.115], [0.325, 0.11], [0.38, 0.12], [0.385, 0.115], [0.5, 0.12], [0.5, 0.114],
      [0.3, 0.103], [0.08, 0.055], [0.015, 0.016], [0.015, 0],
    ], [0, 0, 0]),
    shell('funnel', 'reed', 'x', [[0.5, 0.114], [0.5, 0.11], [0.36, 0.032], [0.36, 0.038]], [0, 0, 0]),
    shell('tail', 'tie', 'x', [[0, 0], [0, 0.016], [0.035, 0.022], [0.035, 0]], [-0.02, 0, 0]),
  ] + [
    shell('hoop-%d' % i, 'hoop', 'x', [[0, hoop[1] - 0.004], [0, hoop[1] + 0.005], [0.012, hoop[1] + 0.005], [0.012, hoop[1] - 0.004]], [hoop[0], 0, 0])
    for hoop in [[0.08, 0.06], [0.17, 0.09], [0.27, 0.108], [0.37, 0.118]]
    for i in [std.find(hoop[0], [0.08, 0.17, 0.27, 0.37])[0]]
  ] + [
    shell('rim', 'hoop', 'x', [[0, 0.112], [0, 0.126], [0.014, 0.126], [0.014, 0.112]], [0.488, 0, 0]),
  ], { wicker: 'straw-wicker', reed: 'plant-dried', hoop: 'bark', tie: 'straw-rope' }) + {
    voxelGrain: 0.004,
  },
]
