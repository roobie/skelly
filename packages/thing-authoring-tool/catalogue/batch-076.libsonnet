local h = import '../compound.libsonnet';
// A point on a scissor blade: `u` along the blade from the pivot, `v` across it, the blade turned `deg` about y.
local bladePoint(deg, u, v) =
  local a = deg * std.pi / 180;
  [u * std.cos(a) - v * std.sin(a), u * std.sin(a) + v * std.cos(a)];
// One wavy blade lying flat from the pivot towards +x, its cutting edge on the side facing the other blade: a tapered
// body plus a row of teeth, each a convex piece because prisms must be convex. `side` is +1 for the blade above the
// x axis, -1 below; y0 and y1 its thickness.
local wavyBlade(name, side, deg, y0, y1) =
  local len = 0.092, teeth = 9, step = len / teeth;
  local back(u) = side * (0.009 - 0.006 * u / len);
  local outline = [bladePoint(deg, 0, 0), bladePoint(deg, len, 0), bladePoint(deg, len, back(len)), bladePoint(deg, 0, back(0))];
  [h.prism(name, 'blade', 'y', [[p[1], p[0]] for p in outline], y0, y1)] + [
    local u0 = i * step, u1 = (i + 1) * step;
    local tooth = [bladePoint(deg, u0, 0), bladePoint(deg, (u0 + u1) / 2, -side * 0.003), bladePoint(deg, u1, 0)];
    h.prism(name + '-tooth-' + i, 'blade', 'y', [[p[1], p[0]] for p in tooth], y0, y1)
    for i in std.range(0, teeth - 2)
  ];
// A finger loop lying flat, centred at (x, z).
local loop(id, x, z, r0, r1, y0, y1) = h.turned(id, 'handle', 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);
[
  // Craft scissors with a zigzag edge, 160 mm overall: 92 mm steel blades opened a little and two plastic finger loops.
  h.compound('scissors_wavy', 0.034,
    wavyBlade('blade-a', 1, 8, 0.002, 0.004) + wavyBlade('blade-b', -1, -8, 0, 0.002) + [
      loop('loop-a', -0.048, 0.017, 0.009, 0.015, 0.002, 0.008),
      loop('loop-b', -0.048, -0.017, 0.009, 0.015, -0.004, 0.002),
      h.prism('shank-a', 'handle', 'y', [[0.002, -0.034], [0.002, 0.004], [0.010, 0.004], [0.010, -0.036]], 0.002, 0.007),
      h.prism('shank-b', 'handle', 'y', [[-0.010, -0.036], [-0.010, 0.004], [-0.002, 0.004], [-0.002, -0.034]], -0.003, 0.002),
      h.disc('pivot', 'pivot', 0.004, -0.004, 0.009, 0.0, 0.0),
    ], { blade: 'steel-stainless', handle: 'plastic-orange', pivot: 'steel-grey' }) + {
    handling: h.gripOn('scissors_wavy', 'loop-a'),
    voxelGrain: 0.002,
  },
  // A full-strip desk stapler, 160 mm long, 38 mm wide and 55 mm tall: a black plastic cap over an aluminium magazine,
  // hinged at the back above a base with a steel anvil at the front.
  h.compound('stapler', 0.32, [
    h.box('base', 'base', [-0.080, 0, -0.019], [0.080, 0.010, 0.019]),
    h.box('foot', 'foot', [-0.078, -0.002, -0.017], [0.078, 0, 0.017]),
    h.box('anvil', 'anvil', [0.052, 0.010, -0.008], [0.072, 0.012, 0.008]),
    h.box('hinge', 'magazine', [-0.078, 0.010, -0.012], [-0.062, 0.026, 0.012]),
    h.prism('magazine', 'magazine', 'z', [[-0.076, 0.018], [0.074, 0.020], [0.074, 0.032], [-0.076, 0.032]], -0.013, 0.013),
    h.prism('cap', 'cap', 'z', [[-0.080, 0.030], [0.080, 0.032], [0.080, 0.044], [0.055, 0.055], [-0.060, 0.050], [-0.080, 0.042]], -0.018, 0.018),
    h.box('strike', 'anvil', [0.068, 0.016, -0.010], [0.074, 0.032, 0.010]),
  ], { base: 'plastic-black', foot: 'rubber-black', anvil: 'steel-grey', magazine: 'alu-bare', cap: 'plastic-charcoal' }) + {
    handling: h.gripOn('stapler', 'cap'),
    voxelGrain: 0.004,
  },
  // A 200 mm length of leg bone, 30 mm thick in the shaft and swelling to 46 mm at the knuckled ends.
  h.compound('billet_bone', 0.2, [
    h.turned('shaft', 'bone', 'x', [[0, 0], [0, 0.012], [0.006, 0.020], [0.022, 0.021], [0.045, 0.015], [0.155, 0.015], [0.178, 0.020], [0.194, 0.019], [0.200, 0.011], [0.200, 0]], [-0.100, 0.023, 0]),
    h.ball('knuckle-a', 'bone', 0.012, -0.090, 0.024, 0.010),
    h.ball('knuckle-b', 'bone', 0.011, -0.090, 0.024, -0.011),
    h.ball('knuckle-c', 'bone', 0.011, 0.091, 0.022, 0.011),
    h.box('scuff', 'wear', [0.080, 0.036, -0.012], [0.098, 0.040, 0.012]),
  ], { bone: 'bone', wear: 'body-bone' }) + {
    handling: h.gripOn('billet_bone', 'shaft'),
    voxelGrain: 0.004,
  },
  // A 200 mm baton of hardwood, 40 mm thick, the bark left on the grip and the striking end rounded and bruised.
  h.compound('billet_wood', 0.22, [
    h.turned('baton', 'wood', 'x', [[0, 0], [0, 0.016], [0.004, 0.019], [0.180, 0.020], [0.192, 0.018], [0.200, 0.011], [0.200, 0]], [-0.100, 0.020, 0]),
    h.turned('bark', 'bark', 'x', [[0, 0], [0, 0.0175], [0.004, 0.0205], [0.090, 0.0205], [0.090, 0]], [-0.100, 0.020, 0]),
    h.turned('bruise', 'bruise', 'x', [[0, 0], [0, 0.0185], [0.008, 0.0115], [0.008, 0]], [0.093, 0.020, 0]),
  ], { wood: 'wood-oak', bark: 'bark', bruise: 'wood-walnut' }) + {
    handling: h.gripOn('billet_wood', 'bark'),
    voxelGrain: 0.004,
  },
  // A 200 mm straight wooden spindle, 30 mm thick, its working end ground flat and caked with wet rock grit, a
  // turned-down neck at the other end for a bow string or the palm.
  h.compound('drill_rock_primitive', 0.076, [
    h.turned('spindle', 'wood', 'x', [[0, 0], [0, 0.012], [0.006, 0.015], [0.030, 0.015], [0.036, 0.011], [0.050, 0.011], [0.056, 0.015], [0.186, 0.015], [0.186, 0]], [-0.100, 0.015, 0]),
    h.turned('grit', 'grit', 'x', [[0, 0], [0, 0.0155], [0.010, 0.0155], [0.014, 0.0135], [0.014, 0]], [0.086, 0.015, 0]),
    h.turned('cord', 'cord', 'x', [[0, 0], [0, 0.0125], [0.012, 0.0125], [0.012, 0]], [-0.067, 0.015, 0]),
  ], { wood: 'wood-birch', grit: 'stone-grey', cord: 'cord-cotton' }) + {
    handling: h.gripOn('drill_rock_primitive', 'spindle'),
    voxelGrain: 0.004,
  },
  // A 150 mm stub of bone, 36 mm across the knuckle end, ground down to a short blunt point.
  h.compound('punch_bone', 0.084, [
    h.turned('body', 'bone', 'x', [[0, 0], [0, 0.012], [0.005, 0.018], [0.020, 0.017], [0.040, 0.012], [0.105, 0.011], [0.140, 0.004], [0.150, 0.0015], [0.150, 0]], [-0.075, 0.018, 0]),
    h.ball('knuckle-a', 'bone', 0.010, -0.066, 0.020, 0.009),
    h.ball('knuckle-b', 'bone', 0.009, -0.066, 0.019, -0.009),
    h.turned('tip', 'tip', 'x', [[0, 0], [0, 0.0045], [0.010, 0.0015], [0.010, 0]], [0.065, 0.018, 0]),
  ], { bone: 'bone', tip: 'body-bone' }) + {
    handling: h.gripOn('punch_bone', 'body'),
    voxelGrain: 0.002,
  },
  // A 150 mm punch: a round 100 mm nail clamped between two split wooden cheeks 130 mm long, bound with three
  // wraps of cord, its point standing 20 mm proud.
  h.compound('punch_nail', 0.043, [
    h.box('cheek-a', 'wood', [-0.075, 0, -0.011], [0.055, 0.009, 0.011]),
    h.box('cheek-b', 'wood', [-0.075, 0.012, -0.011], [0.055, 0.021, 0.011]),
    h.turned('nail', 'nail', 'x', [[0, 0], [0, 0.0025], [0.090, 0.0025], [0.100, 0.0006], [0.100, 0]], [-0.025, 0.0105, 0]),
    h.box('wrap-a', 'cord', [-0.062, -0.0015, -0.0125], [-0.052, 0.0225, 0.0125]),
    h.box('wrap-b', 'cord', [-0.012, -0.0015, -0.0125], [-0.002, 0.0225, 0.0125]),
    h.box('wrap-c', 'cord', [0.038, -0.0015, -0.0125], [0.048, 0.0225, 0.0125]),
  ], { wood: 'wood-pine', nail: 'steel-grey', cord: 'jute' }) + {
    handling: h.gripOn('punch_nail', 'cheek-b'),
    voxelGrain: 0.002,
  },
  // A 150 mm sewing awl: a 75 mm grip carved from a bone end, then a 75 mm spike tapering to a needle point.
  h.compound('awl_bone', 0.04, [
    h.turned('grip', 'handle', 'x', [[0, 0], [0, 0.013], [0.006, 0.017], [0.020, 0.016], [0.035, 0.012], [0.070, 0.011], [0.075, 0.008], [0.075, 0]], [-0.075, 0.017, 0]),
    h.ball('knob', 'handle', 0.009, -0.068, 0.019, 0.008),
    h.turned('spike', 'point', 'x', [[0, 0], [0, 0.0065], [0.040, 0.004], [0.072, 0.0012], [0.075, 0.0004], [0.075, 0]], [0, 0.017, 0]),
  ], { handle: 'bone', point: 'body-bone' }) + {
    handling: h.gripOn('awl_bone', 'grip'),
    voxelGrain: 0.002,
  },
]
