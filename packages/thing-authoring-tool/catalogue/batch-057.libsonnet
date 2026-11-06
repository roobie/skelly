local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local tube = h.tube;
// A tool lies along x and takes its grip on a named solid.
local gripOn(id, solid) = { part: id, solid: solid, fraction: [0.5, 0.5, 0.5], turn: [0, 0, 0], hold: 'upright', roll: 90 };
// A J hook lying flat on y from 0 to `t`, the bend centred on the origin with centre radius `r`, wire `w` wide: the
// shank runs up +z on the +x side to an eye, the point leg up +z on the -x side with a barb turned in.
local hook(slot, r, w, t, shank, point, eye) =
  h.crescent('bend', slot, r - w / 2, r + w / 2, 90, 270, 8, 0, t)
  + [
    box('shank', slot, [r - w / 2, 0, 0], [r + w / 2, t, shank]),
    h.prism('point', slot, 'y', [[0, -r - w / 2], [0, -r + w / 2], [point, -r + w / 2], [point + w * 1.5, -r]], 0, t),
    h.prism('barb', slot, 'y', [[point - w * 1.6, -r + w / 2], [point - w * 0.2, -r + w / 2], [point - w * 1.2, -r + w * 1.6]], 0, t),
  ]
  + h.crescent('eye', slot, eye, eye + w, 0, 360, 10, 0, t, r, shank + eye);
// Guide rings along a blank lying on x at height y, standing out on +z: each [x, ring radius, blank radius there].
local guides(prefix, rings, y, z=0) = std.flattenArrays([
  [
    box('%s-foot-%d' % [prefix, i], 'guide', [rings[i][0] - 0.004, y - 0.001, z], [rings[i][0] + 0.004, y + 0.001, z + rings[i][2] + 0.004]),
    tube('%s-ring-%d' % [prefix, i], 'guide', rings[i][1], rings[i][1] + 0.0015, rings[i][0] - 0.001, rings[i][0] + 0.001, y, z + rings[i][2] + 0.004 + rings[i][1]),
  ]
  for i in std.range(0, std.length(rings) - 1)
]);
// A small spinning reel on a rod lying along x at height y, its foot on the seat at x and the reel standing out on
// +z: foot, stem, body, spool of line facing the tip, a folded bail and a crank handle. Slots reel, spool, line.
local spinningReel(prefix, x, y, rodR) =
  local bz = rodR + 0.05;
  [
    box(prefix + '-foot', 'reel', [x - 0.025, y - 0.003, rodR - 0.001], [x + 0.025, y + 0.003, rodR + 0.004]),
    box(prefix + '-stem', 'reel', [x - 0.006, y - 0.004, rodR + 0.004], [x + 0.006, y + 0.004, bz - 0.02]),
    turned(prefix + '-body', 'reel', 'x', [[0, 0], [0, 0.012], [0.006, 0.02], [0.04, 0.021], [0.05, 0.014], [0.05, 0]], [x - 0.035, y, bz]),
    turned(prefix + '-spool', 'spool', 'x', [[0, 0], [0, 0.016], [0.004, 0.023], [0.028, 0.023], [0.03, 0.016], [0.03, 0]], [x + 0.015, y, bz]),
    turned(prefix + '-line', 'line', 'x', [[0, 0], [0, 0.0235], [0.02, 0.0235], [0.02, 0]], [x + 0.019, y, bz]),
    box(prefix + '-bail', 'reel', [x + 0.012, y - 0.0015, bz + 0.024], [x + 0.03, y + 0.0015, bz + 0.027]),
    box(prefix + '-crank', 'reel', [x - 0.03, y + 0.02, bz - 0.003], [x - 0.024, y + 0.05, bz + 0.003]),
    turned(prefix + '-knob', 'knob', 'x', [[0, 0], [0, 0.006], [0.018, 0.006], [0.018, 0]], [x - 0.045, y + 0.05, bz]),
  ];
// Moves a box or y-axis prism from `hook` by [dx, dy, dz].
local shift(p, dx, dy, dz) =
  if p.kind == 'box' then p + { min: [p.min[0] + dx, p.min[1] + dy, p.min[2] + dz], max: [p.max[0] + dx, p.max[1] + dy, p.max[2] + dz] }
  else p + { profile: [[q[0] + dz, q[1] + dx] for q in p.profile], start: p.start + dy, end: p.end + dy };
// A rod blank along x from x0 to x1 tapering from radius r0 to r1, at height y and depth z.
local blank(id, slot, r0, r1, x0, x1, y, z=0) = turned(id, slot, 'x', [[0, 0], [0, r0], [x1 - x0, r1], [x1 - x0, 0]], [x0, y, z]);
[
  // A plain steel J hook, 30 mm long and 14 mm across the bend, with a ring eye and a barbed point, lying flat.
  h.compound('fishing_hook_basic', 0.0005, hook('steel', 0.006, 0.002, 0.002, 0.022, 0.009, 0.002), { steel: 'steel-blued' })
  + { voxelGrain: 0.002 },

  // A hook carved from bone, 42 mm long, 4 mm stock, with a knob at the top of the shank and a fibre lashing for the
  // line under it.
  h.compound('fishing_hook_bone', 0.002,
             hook('bone', 0.008, 0.004, 0.004, 0.03, 0.014, 0.002)[0:11]
             + [
               box('knob', 'bone', [0.0045, 0, 0.03], [0.0115, 0.004, 0.036]),
             ]
             + [
               box('lash-%d' % i, 'cord', [0.0055, -0.001, 0.018 + i * 0.003], [0.0105, 0.005, 0.02 + i * 0.003])
               for i in [0, 1, 2]
             ]
             + [box('tail', 'cord', [0.0105, 0.001, 0.02], [0.022, 0.003, 0.022])],
             { bone: 'bone', cord: 'jute' })
  + { voxelGrain: 0.002 },

  // A two-piece spinning rod taken apart for carrying: two 1 m sections side by side held by two hook-and-loop
  // straps, the butt section with its cork grip, reel seat and small reel, the tip section with its ferrule and
  // guides.
  local y = 0.008;
  h.compound('fishing_rod_2pc_packed', 0.45,
             [
               turned('butt-cap', 'cap', 'x', [[0, 0], [0, 0.011], [0.015, 0.012], [0.015, 0]], [-0.5, 0.012, 0]),
               turned('grip', 'cork', 'x', [[0, 0], [0, 0.012], [0.25, 0.011], [0.25, 0]], [-0.485, 0.012, 0]),
               turned('seat', 'seat', 'x', [[0, 0], [0, 0.01], [0.1, 0.01], [0.1, 0]], [-0.235, 0.012, 0]),
               turned('fore-grip', 'cork', 'x', [[0, 0], [0, 0.011], [0.06, 0.009], [0.06, 0]], [-0.135, 0.012, 0]),
               blank('butt-blank', 'blank', 0.006, 0.0045, -0.075, 0.47, 0.012),
               blank('ferrule', 'wrap', 0.006, 0.006, 0.44, 0.5, 0.012),
               blank('tip-blank', 'blank', 0.0042, 0.0026, -0.5, 0.49, y, -0.03),
               blank('tip-top', 'guide', 0.0035, 0.0035, 0.49, 0.5, y, -0.03),
               blank('tip-ferrule', 'wrap', 0.005, 0.0045, -0.5, -0.46, y, -0.03),
             ]
             + guides('butt', [[0.05, 0.012, 0.006], [0.3, 0.008, 0.005]], 0.012)
             + guides('tip', [[-0.3, 0.004, 0.0038], [-0.05, 0.003, 0.0033], [0.2, 0.0025, 0.0028]], y, -0.03)
             + spinningReel('reel', -0.185, 0.012, 0.01)
             + std.flattenArrays([
               [
                 box('strap-%d' % s, 'strap', [x - 0.012, 0.025, -0.038], [x + 0.012, 0.027, 0.008]),
                 box('strap-a-%d' % s, 'strap', [x - 0.012, 0, -0.04], [x + 0.012, 0.027, -0.038]),
                 box('strap-b-%d' % s, 'strap', [x - 0.012, 0, 0.008], [x + 0.012, 0.027, 0.01]),
               ]
               for s in [0, 1]
               for x in [[-0.03, 0.38][s]]
             ]),
             { cap: 'rubber-black', cork: 'cork', seat: 'plastic-charcoal', blank: 'polymer-black', wrap: 'steel-grey', guide: 'steel-stainless', reel: 'plastic-charcoal', spool: 'alu-bare', line: 'plastic-green', knob: 'plastic-black', strap: 'hook-loop-grey' })
  + { handling: gripOn('fishing_rod_2pc_packed', 'grip'), voxelGrain: 0.002 },

  // A rough stick 900 mm long and 45 mm across at the butt, its bark on, with a cotton line tied at the tip, run
  // back along the stick and wound round it near the butt, a bent-wire hook caught in the winding.
  local top(x) = 0.0225 + 0.0225 - 0.0125 * (x + 0.45) / 0.9;
  h.compound('fishing_rod_basic', 0.38,
             [
               blank('stick', 'bark', 0.0225, 0.01, -0.45, 0.45, 0.0225),
               turned('butt-cut', 'cut', 'x', [[0, 0], [0, 0.019], [0.002, 0.019], [0.002, 0]], [-0.452, 0.0225, 0]),
               turned('twig', 'bark', 'z', [[0, 0], [0, 0.006], [0.03, 0.004], [0.03, 0]], [0.07, 0.02, 0]),
               blank('tie', 'line', 0.012, 0.012, 0.43, 0.442, 0.0225),
             ]
             + [
               blank('wind-%d' % i, 'line', 0.024, 0.024, -0.34 + i * 0.008, -0.335 + i * 0.008, 0.0225)
               for i in std.range(0, 7)
             ]
             + [
               box('run-%d' % i, 'line', [x, top(x + 0.073) - 0.001, -0.001], [x + 0.073, top(x + 0.073) + 0.001, 0.001])
               for i in std.range(0, 9)
               for x in [-0.28 + i * 0.073]
             ]
             + [shift(p, -0.29, 0.0465, -0.008) for p in hook('hook', 0.006, 0.002, 0.002, 0.022, 0.009, 0.002)]
             + [
             ],
             { bark: 'bark', cut: 'wood-pine', line: 'cloth-cream', hook: 'steel-grey' })
  + { handling: gripOn('fishing_rod_basic', 'stick'), voxelGrain: 0.002 },

  // A 2 m one-piece spinning rod: rubber butt cap, a 300 mm cork grip, a screw reel seat with a small spinning reel,
  // a cork fore grip, then a black blank tapering from 14 mm to 4 mm with six guides and a tip ring.
  local y = 0.013;
  h.compound('fishing_rod_professional', 0.45,
             [
               turned('butt-cap', 'cap', 'x', [[0, 0], [0, 0.012], [0.02, 0.013], [0.02, 0]], [-1, y, 0]),
               turned('grip', 'cork', 'x', [[0, 0], [0, 0.013], [0.3, 0.012], [0.3, 0]], [-0.98, y, 0]),
               turned('seat', 'seat', 'x', [[0, 0], [0, 0.011], [0.12, 0.011], [0.12, 0]], [-0.68, y, 0]),
               turned('seat-nut', 'wrap', 'x', [[0, 0], [0, 0.0125], [0.02, 0.0125], [0.02, 0]], [-0.6, y, 0]),
               turned('fore-grip', 'cork', 'x', [[0, 0], [0, 0.011], [0.08, 0.009], [0.08, 0]], [-0.56, y, 0]),
               blank('blank', 'blank', 0.007, 0.0026, -0.48, 0.99, y),
               blank('tip-top', 'guide', 0.0035, 0.0035, 0.99, 1, y),
             ]
             + guides('guide', [[-0.3, 0.014, 0.0064], [-0.05, 0.01, 0.0056], [0.2, 0.007, 0.0047], [0.45, 0.005, 0.0039], [0.68, 0.004, 0.003], [0.88, 0.003, 0.0024]], y)
             + spinningReel('reel', -0.62, y, 0.011),
             { cap: 'rubber-black', cork: 'cork', seat: 'plastic-charcoal', blank: 'polymer-black', wrap: 'alu-bare', guide: 'steel-stainless', reel: 'plastic-charcoal', spool: 'alu-bare', line: 'plastic-green', knob: 'plastic-black' })
  + { handling: gripOn('fishing_rod_professional', 'grip'), voxelGrain: 0.002 },

  // A telescoping spinning rod pushed shut, 500 mm long: a rubber cap, an EVA foam grip, a screw reel seat with a small
  // spinning reel, then the butt tube with the ends of four nested sections stepping down to a tip cap.
  local y = 0.016;
  h.compound('fishing_rod_tele_packed', 0.42,
             [
               turned('butt-cap', 'cap', 'x', [[0, 0], [0, 0.014], [0.02, 0.015], [0.02, 0]], [-0.25, y, 0]),
               turned('grip', 'foam', 'x', [[0, 0], [0, 0.015], [0.16, 0.014], [0.16, 0]], [-0.23, y, 0]),
               turned('seat', 'seat', 'x', [[0, 0], [0, 0.0125], [0.11, 0.0125], [0.11, 0]], [-0.07, y, 0]),
               turned('seat-nut', 'wrap', 'x', [[0, 0], [0, 0.014], [0.018, 0.014], [0.018, 0]], [0.04, y, 0]),
               blank('butt', 'blank', 0.0125, 0.012, 0.058, 0.2, y),
             ]
             + [
               blank('section-%d' % i, 'blank', 0.0115 - i * 0.0015, 0.0115 - i * 0.0015, 0.2 + i * 0.008, 0.208 + i * 0.008, y)
               for i in std.range(0, 3)
             ]
             + [
               blank('band-%d' % i, 'wrap', 0.0122 - i * 0.0015, 0.0122 - i * 0.0015, 0.196 + i * 0.008, 0.2 + i * 0.008, y)
               for i in std.range(0, 3)
             ]
             + [
               turned('tip-cap', 'cap', 'x', [[0, 0], [0, 0.0065], [0.014, 0.005], [0.014, 0]], [0.232, y, 0]),
               box('guide-foot', 'guide', [0.17, y - 0.001, 0], [0.18, y + 0.001, 0.016]),
               tube('guide-ring', 'guide', 0.006, 0.0075, 0.174, 0.176, y, 0.022),
             ]
             + spinningReel('reel', -0.015, y, 0.0125),
             { cap: 'rubber-black', foam: 'rubber-offblack', seat: 'plastic-charcoal', blank: 'polymer-black', wrap: 'alu-bare', guide: 'steel-stainless', reel: 'plastic-charcoal', spool: 'alu-bare', line: 'plastic-green', knob: 'plastic-black' })
  + { handling: gripOn('fishing_rod_tele_packed', 'grip'), voxelGrain: 0.002 },

  // A whittled wooden hand reel, 150 mm long: a 30 mm round handle, then a spool section with a lip at each end and
  // cotton line wound between them, the end split by a notch to hold the line.
  h.compound('hoboreel', 0.093,
             [
               turned('handle', 'wood', 'x', [[0, 0], [0, 0.013], [0.004, 0.015], [0.07, 0.015], [0.07, 0]], [-0.075, 0.03, 0]),
               turned('lip-a', 'wood', 'x', [[0, 0], [0, 0.03], [0.01, 0.03], [0.01, 0]], [-0.005, 0.03, 0]),
               turned('core', 'wood', 'x', [[0, 0], [0, 0.017], [0.05, 0.017], [0.05, 0]], [0.005, 0.03, 0]),
               turned('line', 'line', 'x', [[0, 0], [0, 0.024], [0.05, 0.024], [0.05, 0]], [0.005, 0.03, 0]),
               turned('lip-b', 'wood', 'x', [[0, 0], [0, 0.03], [0.01, 0.03], [0.01, 0]], [0.055, 0.03, 0]),
               box('prong-a', 'wood', [0.065, 0.016, -0.012], [0.075, 0.044, -0.003]),
               box('prong-b', 'wood', [0.065, 0.016, 0.003], [0.075, 0.044, 0.012]),
               box('notch', 'shadow', [0.065, 0.02, -0.003], [0.071, 0.04, 0.003]),
               box('line-end', 'line', [0.06, 0.029, -0.001], [0.085, 0.031, 0.001]),
             ],
             { wood: 'wood-pine', line: 'cord-cotton', shadow: 'wood-walnut' })
  + { handling: gripOn('hoboreel', 'handle'), voxelGrain: 0.002 },

  // A moulded plastic hand reel, 158 mm long: a ribbed handle, a spool 70 mm across wound with green line, and an
  // open guard of two hoops and four bars round the spool with an eyelet for the line.
  h.compound('plastichoboreel', 0.12,
             [
               turned('handle', 'handle', 'x', [[0, 0], [0, 0.012], [0.005, 0.016], [0.07, 0.016], [0.075, 0.02], [0.075, 0]], [-0.079, 0.04, 0]),
               turned('flange-a', 'spool', 'x', [[0, 0], [0, 0.034], [0.005, 0.034], [0.005, 0]], [-0.004, 0.04, 0]),
               turned('line', 'line', 'x', [[0, 0], [0, 0.029], [0.06, 0.029], [0.06, 0]], [0.001, 0.04, 0]),
               turned('flange-b', 'spool', 'x', [[0, 0], [0, 0.034], [0.005, 0.034], [0.005, 0]], [0.061, 0.04, 0]),
               turned('cap', 'handle', 'x', [[0, 0], [0, 0.012], [0.013, 0.008], [0.013, 0]], [0.066, 0.04, 0]),
               tube('hoop-a', 'guard', 0.037, 0.04, -0.012, -0.006, 0.04, 0),
               tube('hoop-b', 'guard', 0.037, 0.04, 0.066, 0.072, 0.04, 0),
               box('bar-top', 'guard', [-0.012, 0.077, -0.004], [0.072, 0.08, 0.004]),
               box('bar-bottom', 'guard', [-0.012, 0, -0.004], [0.072, 0.003, 0.004]),
               box('bar-front', 'guard', [-0.012, 0.036, 0.037], [0.072, 0.044, 0.04]),
               box('bar-back', 'guard', [-0.012, 0.036, -0.04], [0.072, 0.044, -0.037]),
               tube('eyelet', 'eyelet', 0.003, 0.0045, 0.028, 0.032, 0.0845, 0),
               box('eyelet-post', 'guard', [0.028, 0.08, -0.002], [0.032, 0.081, 0.002]),
             ],
             { handle: 'plastic-black', spool: 'plastic-red', line: 'plastic-green', guard: 'plastic-charcoal', eyelet: 'steel-stainless' })
  + { handling: gripOn('plastichoboreel', 'handle'), voxelGrain: 0.002 },
]
