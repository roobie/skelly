local h = import '../compound.libsonnet';

// Shears lying flat, scaled by k from a 200 mm pair and shifted to [ox, oy, oz]: two finger loops, arms to a
// pivot at x = 0, and two closed straight blades to +x. A prism on y takes its outline as [z, x].
local shears(p, k, ox, oy, oz) =
  local P(pts) = [[oz + q[0] * k, ox + q[1] * k] for q in pts];
  local ring(id, r0, r1, x, z) = h.turned(id, 'handle', 'y', [[0, r0 * k], [0, r1 * k], [0.007 * k, r1 * k], [0.007 * k, r0 * k], [0, r0 * k]], [ox + x * k, oy, oz + z * k]);
  [
    ring(p + 'loop-a', 0.009, 0.015, -0.072, 0.018),
    ring(p + 'loop-b', 0.011, 0.019, -0.070, -0.023),
    h.prism(p + 'arm-a', 'handle', 'y', P([[0.008, -0.060], [0.016, -0.060], [0.005, 0.002], [-0.002, 0.002]]), oy, oy + 0.007 * k),
    h.prism(p + 'arm-b', 'handle', 'y', P([[-0.012, -0.056], [-0.004, -0.056], [0.002, 0.002], [-0.005, 0.002]]), oy, oy + 0.007 * k),
    h.prism(p + 'blade-a', 'blade', 'y', P([[-0.009, -0.006], [0.009, -0.006], [0.003, 0.112], [-0.004, 0.112]]), oy + 0.004 * k, oy + 0.007 * k),
    h.prism(p + 'blade-b', 'blade', 'y', P([[-0.009, -0.006], [0.009, -0.006], [0.004, 0.108], [-0.003, 0.108]]), oy + 0.001 * k, oy + 0.004 * k),
    h.disc(p + 'pivot', 'pivot', 0.005 * k, oy, oy + 0.009 * k, ox, oz),
  ];

// A straight needle lying along x with its point at +x and an eye at -x: a tapered round shaft of radius r and
// a flattened head of two side bars round an eye slot `eyeW` wide, `wall` thick, its axis at height r.
local needle(slot, len, r, eyeLen, eyeW, wall) =
  local half = eyeW / 2 + wall;
  [
    h.turned('shaft', slot, 'x', [[0, 0], [0, r], [len * 0.55, r], [len, 0]], [0, r, 0]),
    h.box('eye-a', slot, [-eyeLen, r * 0.4, eyeW / 2], [0.001, r * 1.6, half]),
    h.box('eye-b', slot, [-eyeLen, r * 0.4, -half], [0.001, r * 1.6, -eyeW / 2]),
    h.box('eye-end', slot, [-eyeLen - wall, r * 0.4, -half], [-eyeLen, r * 1.6, half]),
  ];

// A hide rolled along x, `len` long and `r` across, flesh side out, tied with two cords and with its loose end
// lying out to +z. The ends show the turns of the roll in alternating layers; `inner` is the finish of the inside
// face (flesh-tan leather for a hide, fur for a pelt).
local roll(len, r, inner, fringe) =
  local layers = 6;
  local step = r / layers;
  [
    h.tube('layer-%d' % i, if (layers - 1 - i) % 2 == 0 then 'hide' else 'inner', i * step, (i + 1) * step, 0, len, r, 0)
    for i in std.range(1, layers - 1)
  ] + [
    h.rod('core', 'inner', step, 0, len, r) + { origin: [0, r, 0] },
    h.box('flap', 'hide', [0.004, 0, 0], [len - 0.006, 0.004, r + 0.040]),
    h.prism('flap-edge', 'hide', 'y', [[r + 0.040, 0.004], [r + 0.052, 0.040], [r + 0.050, len - 0.060], [r + 0.040, len - 0.006]], 0, 0.004),
    h.tube('cord-a', 'cord', r, r + 0.003, len * 0.2, len * 0.2 + 0.006, r, 0),
    h.tube('cord-b', 'cord', r, r + 0.003, len * 0.8 - 0.006, len * 0.8, r, 0),
  ] + (if fringe then [
         h.tube('fringe-a', 'inner', r * 0.5, r * 0.95, -0.006, 0, r, 0),
         h.tube('fringe-b', 'inner', r * 0.5, r * 0.95, len, len + 0.006, r, 0),
         h.box('flap-fur', 'inner', [0.010, 0, r + 0.040], [len - 0.020, 0.006, r + 0.056]),
       ] else []);

// A thread spool standing on the tray floor at (x, z): two white flanges and a wound core.
local spool(n, x, z, y0) = [
  h.disc('spool-%d-base' % n, 'flange', 0.011, y0, y0 + 0.003, x, z),
  h.disc('spool-%d-thread' % n, 'thread-%d' % n, 0.009, y0 + 0.003, y0 + 0.021, x, z),
  h.disc('spool-%d-top' % n, 'flange', 0.011, y0 + 0.021, y0 + 0.024, x, z),
];

[
  // Heavy-duty shears for aramid cloth, 200 mm long, lying flat: yellow moulded loops and straight steel blades.
  h.compound('aramid_shears', 0.088, shears('', 1, 0, 0, 0), {
    handle: 'plastic-yellow',
    blade: 'steel-stainless',
    pivot: 'steel-grey',
  }) + {
    handling: h.gripOn('aramid_shears', 'loop-a'),
    voxelGrain: 0.002,
  },
  // Two 360 mm wooden knitting needles, 7 mm thick, side by side with a round knob at each head.
  h.compound('knitting_needles', 0.012, std.flattenArrays([
    [
      h.turned('needle-%d' % n, 'needle', 'x', [[0, 0], [0, 0.0035], [0.30, 0.0035], [0.352, 0.0008], [0.356, 0]], [-0.176, 0.006, 0.020 * n - 0.030]),
      h.ball('knob-%d' % n, 'knob', 0.006, -0.180, 0.006, 0.020 * n - 0.030),
    ]
    for n in [1, 2]
  ]), { needle: 'wood-birch', knob: 'wood-walnut' }) + {
    handling: h.gripOn('knitting_needles', 'needle-1'),
    voxelGrain: 0.002,
  },
  // A standing frame loom 0.68 m wide and 0.82 m tall on two 0.30 m feet: pine posts and beams, a warp of cotton
  // threads, a heddle rod across them and a hand's breadth of striped cloth woven at the bottom.
  h.compound('loom_frame', 3.5, [
    h.box('foot-l', 'frame', [-0.335, 0, -0.150], [-0.265, 0.030, 0.150]),
    h.box('foot-r', 'frame', [0.265, 0, -0.150], [0.335, 0.030, 0.150]),
    h.box('post-l', 'frame', [-0.325, 0.030, -0.020], [-0.275, 0.820, 0.020]),
    h.box('post-r', 'frame', [0.275, 0.030, -0.020], [0.325, 0.820, 0.020]),
    h.box('beam-bottom', 'frame', [-0.275, 0.060, -0.025], [0.275, 0.100, 0.025]),
    h.box('beam-top', 'frame', [-0.275, 0.740, -0.025], [0.275, 0.780, 0.025]),
    h.rod('heddle', 'rod', 0.008, -0.300, 0.300, 0.500) + { origin: [-0.300, 0.500, 0.016] },
    h.box('cloth', 'cloth', [-0.256, 0.100, -0.004], [0.256, 0.300, 0.004]),
  ] + [
    h.box('stripe-%d' % i, 'stripe', [-0.256, 0.060 + 0.080 * i, -0.005], [0.256, 0.076 + 0.080 * i, 0.005])
    for i in [1, 2]
  ] + [
    h.box('warp-%d' % i, 'warp', [-0.250 + i * 0.020 - 0.002, 0.300, -0.002], [-0.250 + i * 0.020 + 0.002, 0.740, 0.002])
    for i in std.range(0, 25)
  ], { frame: 'wood-pine', rod: 'wood-oak', cloth: 'cloth-cream', stripe: 'cloth-red', warp: 'cord-cotton' }) + {
    voxelGrain: 0.004,
  },
  // A bone needle 110 mm long and 7 mm thick, filed to a point, with a wide flat head and a drilled eye.
  h.compound('needle_bone', 0.004, needle('needle', 0.100, 0.0035, 0.008, 0.002, 0.003), { needle: 'bone' }) + h.inHand('needle_bone', 'shaft') + {
    voxelGrain: 0.002,
  },
  // A curved steel suture-style needle: a half circle 50 mm across, 3 mm thick, with a pointed tip and an eye end.
  h.compound('needle_curved', 0.0068, h.crescent('arc', 'needle', 0.0235, 0.0265, -90, 90, 12, 0, 0.003) + [
    h.prism('point', 'needle', 'y', [[0.0, -0.0270], [0.0, -0.0230], [-0.009, -0.0250]], 0, 0.003),
    h.box('eye', 'needle', [0.0225, 0, -0.006], [0.0285, 0.003, 0.0]),
  ], { needle: 'steel-stainless' }) + h.inHand('needle_curved', 'arc-6') + {
    voxelGrain: 0.002,
  },
  // A heavy steel darning needle 100 mm long and 3.6 mm thick with a long eye.
  h.compound('needle_steel', 0.0054, needle('needle', 0.092, 0.0018, 0.008, 0.002, 0.002), { needle: 'steel-stainless' }) + h.inHand('needle_steel', 'shaft') + {
    voxelGrain: 0.002,
  },
  // A whittled wooden needle 120 mm long and 7 mm thick, with a narrow carved eye in a flat head.
  h.compound('needle_wood', 0.0014, needle('needle', 0.108, 0.0035, 0.010, 0.002, 0.003), { needle: 'wood-pine' }) + h.inHand('needle_wood', 'shaft') + {
    voxelGrain: 0.002,
  },
  // A flat wooden shed stick 550 mm long, 50 mm wide and 10 mm thick, its ends tapered to blunt points.
  h.compound('shed_stick', 0.18, [
    h.prism('stick', 'stick', 'y', [[0, -0.275], [0.025, -0.240], [0.025, 0.240], [0, 0.275], [-0.025, 0.240], [-0.025, -0.240]], 0, 0.010),
  ], { stick: 'wood-oak' }) + {
    handling: h.gripOn('shed_stick', 'stick'),
    voxelGrain: 0.004,
  },
  // A kraft envelope of sewing patterns, 310 mm by 230 mm and 12 mm thick, a sheaf of printed tissue sheets
  // pulled half out at +x and a label with a shirt outline on its face.
  h.compound('tailoring_pattern_set', 0.1, [
    h.box('envelope', 'envelope', [-0.155, 0, -0.115], [0.155, 0.012, 0.115]),
    h.box('label', 'label', [-0.120, 0.012, -0.020], [0.020, 0.013, 0.090]),
    h.prism('shirt-body', 'print', 'y', [[0.010, -0.075], [0.075, -0.075], [0.075, -0.035], [0.010, -0.035]], 0.013, 0.014),
    h.prism('shirt-sleeves', 'print', 'y', [[0.010, -0.095], [0.035, -0.095], [0.035, -0.015], [0.010, -0.015]], 0.013, 0.014),
  ] + [
    h.box('sheet-%d' % i, 'sheet', [0.120 + i * 0.012, 0.002 + i * 0.003, -0.100 + i * 0.006], [0.215 + i * 0.012, 0.005 + i * 0.003, 0.100 - i * 0.004])
    for i in std.range(0, 2)
  ] + [
    h.box('line-%d' % i, 'print', [0.160, 0.0115, -0.080 + i * 0.040], [0.235, 0.0125, -0.078 + i * 0.040])
    for i in std.range(0, 4)
  ] + [
    h.box('cut-line', 'print', [0.200, 0.0115, -0.085], [0.202, 0.0125, 0.085]),
  ], { envelope: 'paper-butcher', label: 'paper-white', print: 'plastic-black', sheet: 'paper-white' }) + {
    voxelGrain: 0.002,
  },
  // A sewing case 180 mm by 110 mm and 30 mm deep, opened with its lid lying flat behind: spools of thread, a
  // pincushion and an awl in the tray, small shears and a felt strip of needles in the lid.
  h.compound('tailors_kit', 0.11, [
    h.box('floor', 'case', [-0.090, 0, 0], [0.090, 0.002, 0.110]),
    h.box('tray-lining', 'lining', [-0.087, 0.002, 0.003], [0.087, 0.003, 0.107]),
    h.box('wall-front', 'case', [-0.090, 0.003, 0.107], [0.090, 0.030, 0.110]),
    h.box('wall-back', 'case', [-0.090, 0.003, 0], [0.090, 0.030, 0.003]),
    h.box('wall-l', 'case', [-0.090, 0.003, 0.003], [-0.087, 0.030, 0.107]),
    h.box('wall-r', 'case', [0.087, 0.003, 0.003], [0.090, 0.030, 0.107]),
    h.box('lid', 'case', [-0.090, 0, -0.112], [0.090, 0.004, -0.002]),
    h.box('lid-lining', 'lining', [-0.086, 0.004, -0.108], [0.086, 0.005, -0.006]),
    h.box('felt', 'felt', [-0.070, 0.005, -0.030], [0.070, 0.008, -0.016]),
    h.ball('pincushion', 'cushion', 0.014, 0.020, 0.0142, 0.040, 0.8),
    h.rod('awl-handle', 'awl-handle', 0.006, -0.075, -0.020, 0.009) + { origin: [-0.075, 0.009, 0.085] },
    h.rod('awl-spike', 'steel', 0.0015, -0.020, 0.030, 0.009) + { origin: [-0.020, 0.009, 0.085] },
  ] + spool(1, -0.065, 0.035, 0.003) + spool(2, -0.038, 0.035, 0.003) + spool(3, -0.011, 0.035, 0.003) + [
    h.box('needle-%d' % i, 'steel', [-0.060 + i * 0.012, 0.008, -0.040], [-0.058 + i * 0.012, 0.010, -0.004])
    for i in std.range(0, 9)
  ] + shears('mini-', 0.5, 0.010, 0.005, -0.075), {
    case: 'plastic-blue',
    lining: 'plastic-grey',
    felt: 'felt-grey',
    cushion: 'velvet-red',
    'awl-handle': 'wood-walnut',
    steel: 'steel-stainless',
    flange: 'plastic-white',
    'thread-1': 'cloth-red',
    'thread-2': 'cloth-yellow',
    'thread-3': 'cloth-navy',
    handle: 'plastic-black',
    blade: 'steel-stainless',
    pivot: 'steel-grey',
  }) + {
    voxelGrain: 0.002,
  },
  // A raw hide rolled up 260 mm long and 70 mm across while it cures, flesh side out, tied with two cords.
  h.compound('tanning_hide', 0.8, roll(0.260, 0.035, 'leather-tan', false), {
    hide: 'skin-rawhide',
    inner: 'leather-tan',
    cord: 'jute',
  }) + {
    voxelGrain: 0.002,
  },
  // A furred pelt rolled up 260 mm long and 76 mm across while it cures, fur side in so the fur shows at the ends
  // and along the loose edge.
  h.compound('tanning_pelt', 0.69, roll(0.260, 0.038, 'fur-brown', true), {
    hide: 'skin-rawhide',
    inner: 'fur-brown',
    cord: 'jute',
  }) + {
    voxelGrain: 0.002,
  },
]
