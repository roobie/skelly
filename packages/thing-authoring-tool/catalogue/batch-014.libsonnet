local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// Open slatted walls round a rectangle `lx` by `lz`, from `y0` to `y1`: posts `bar` wide with gaps as wide, `wall`
// thick, for a vented plastic basket. Slot: wall.
local slats(lx, lz, y0, y1, bar, wall) =
  local nx = std.floor(lx / (2 * bar)), nz = std.floor(lz / (2 * bar));
  [
    box('slat-%s-%d' % [s.id, i], 'wall', [-lx / 2 + bar * (2 * i + 0.5), y0, s.z0], [-lx / 2 + bar * (2 * i + 1.5), y1, s.z0 + wall])
    for s in [{ id: 'front', z0: -lz / 2 }, { id: 'back', z0: lz / 2 - wall }]
    for i in std.range(0, nx - 1)
  ] + [
    box('slat-%s-%d' % [s.id, i], 'wall', [s.x0, y0, -lz / 2 + bar * (2 * i + 0.5)], [s.x0 + wall, y1, -lz / 2 + bar * (2 * i + 1.5)])
    for s in [{ id: 'left', x0: -lx / 2 }, { id: 'right', x0: lx / 2 - wall }]
    for i in std.range(0, nz - 1)
  ];
// A band of wall round a rectangle `lx` by `lz`, from `y0` to `y1`, `wall` thick.
local band(id, slot, lx, lz, y0, y1, wall) = [
  box(id + '-front', slot, [-lx / 2, y0, -lz / 2], [lx / 2, y1, -lz / 2 + wall]),
  box(id + '-back', slot, [-lx / 2, y0, lz / 2 - wall], [lx / 2, y1, lz / 2]),
  box(id + '-left', slot, [-lx / 2, y0, -lz / 2], [-lx / 2 + wall, y1, lz / 2]),
  box(id + '-right', slot, [lx / 2 - wall, y0, -lz / 2], [lx / 2, y1, lz / 2]),
];
// A horizontal band round a turned basket, standing on y, from `y0` to `y1` at radius `r`, `wall` thick.
local ring(id, slot, r, y0, y1, wall) = turned(id, slot, 'y', [[0, r - wall], [0, r], [y1 - y0, r], [y1 - y0, r - wall], [0, r - wall]], [0, y0, 0]);
// A collapsible rubber drum emptied and pressed flat, lying along x: a flat rubber body `length` long, `width` wide and
// `thick` high, its ends tapering into gathered collars round a flat steel end fitting of radius `plate` at each end,
// a valve on the +x fitting, a towing ring on each fitting and D-rings along both sides, with a stencilled panel on
// top. Slots: rubber, plate, valve, ring, stencil.
local collapsedDrum(length, width, thick, plate) =
  local half = length / 2, w = width / 2, gather = length * 0.14, r = plate * 0.8, top = thick * 1.25, tip = half + r;
  [
    h.prism('body', 'rubber', 'x', [[0, -w + thick / 2], [0, w - thick / 2], [thick / 2, w], [thick, w - thick / 2], [thick, -w + thick / 2], [thick / 2, -w]], -half + gather, half - gather),
  ] + [
    h.prism('gather-%s' % e.id, 'rubber', 'y', [[(w - thick / 2), e.s * (half - gather)], [-(w - thick / 2), e.s * (half - gather)], [-r * 1.1, e.s * half], [r * 1.1, e.s * half]], 0, thick * 0.9)
    for e in [{ id: 'a', s: -1 }, { id: 'b', s: 1 }]
  ] + [
    turned('collar-%s' % e.id, 'rubber', 'y', [[0, 0], [0, r * 1.15], [thick, r * 1.05], [thick, 0]], [e.s * half, 0, 0])
    for e in [{ id: 'a', s: -1 }, { id: 'b', s: 1 }]
  ] + [
    turned('plate-%s' % e.id, 'plate', 'y', [[0, 0], [0, r], [top - thick * 0.9, r], [top - thick * 0.9, r * 0.6], [top - thick * 0.7, r * 0.5], [top - thick * 0.7, 0]], [e.s * half, thick * 0.9, 0])
    for e in [{ id: 'a', s: -1 }, { id: 'b', s: 1 }]
  ] + [
    turned('valve', 'valve', 'y', [[0, 0], [0, r * 0.3], [r * 0.35, r * 0.3], [r * 0.35, r * 0.4], [r * 0.5, r * 0.4], [r * 0.5, 0]], [half, top + thick * 0.2, 0]),
    box('handle', 'valve', [half - r * 0.05, top + thick * 0.2 + r * 0.5, -r * 0.45], [half + r * 0.05, top + thick * 0.2 + r * 0.58, r * 0.45]),
  ] + [
    box('tow-%s' % e.id, 'ring', [std.min(e.s * tip, e.s * (tip + r * 0.3)), 0, -r * 0.1], [std.max(e.s * tip, e.s * (tip + r * 0.3)), thick * 0.3, r * 0.1])
    for e in [{ id: 'a', s: -1 }, { id: 'b', s: 1 }]
  ] + [
    box('tow-%s-loop' % e.id, 'ring', [std.min(e.s * (tip + r * 0.3), e.s * (tip + r * 0.42)), 0, -r * 0.35], [std.max(e.s * (tip + r * 0.3), e.s * (tip + r * 0.42)), thick * 0.3, r * 0.35])
    for e in [{ id: 'a', s: -1 }, { id: 'b', s: 1 }]
  ] + [
    box('stencil', 'stencil', [-length * 0.22, thick, -w * 0.35], [length * 0.22, thick + 0.003, w * 0.35]),
  ] + [
    box('d-ring-%s-%d' % [s.id, i], 'ring', [length * (i * 0.25 - 0.03), thick * 0.3, s.z0], [length * (i * 0.25 + 0.03), thick * 0.7, s.z0 + s.dz])
    for s in [{ id: 'left', z0: -w - plate * 0.15, dz: plate * 0.15 }, { id: 'right', z0: w, dz: plate * 0.15 }]
    for i in [-1, 1]
  ];
[
  // A plastic laundry basket, 600 mm long, 420 mm wide and 270 mm tall: a blue tub with a solid foot band,
  // slotted vented walls, and a rolled rim with a hand hole in each end.
  h.compound('basket_laundry', 0.96, [
    box('floor', 'wall', [-0.29, 0, -0.2], [0.29, 0.012, 0.2]),
  ] + band('foot', 'wall', 0.6, 0.42, 0, 0.06, 0.006)
  + slats(0.6, 0.42, 0.06, 0.2, 0.018, 0.006)
  + band('rim-low', 'wall', 0.6, 0.42, 0.2, 0.214, 0.006)
  + band('rim', 'rim', 0.612, 0.432, 0.252, 0.27, 0.012) + [
    box('rim-%s-%s' % [e.id, s.id], 'wall', [e.x0, 0.214, s.z0], [e.x0 + 0.006, 0.252, s.z1])
    for e in [{ id: 'left', x0: -0.3 }, { id: 'right', x0: 0.294 }]
    for s in [{ id: 'a', z0: -0.21, z1: -0.07 }, { id: 'b', z0: 0.07, z1: 0.21 }]
  ] + [
    box('upper-%s' % s.id, 'wall', [-0.3, 0.214, s.z0], [0.3, 0.252, s.z0 + 0.006])
    for s in [{ id: 'front', z0: -0.21 }, { id: 'back', z0: 0.204 }]
  ], { wall: 'plastic-blue', rim: 'plastic-blue' })
  + { voxelGrain: 0.006 },

  // A round plastic kitchen trash can, 400 mm across and 510 mm tall: a grey tapered tub with a moulded foot
  // and grab handles on both sides, under a domed black lid with a swing flap.
  h.compound('trashcan', 1.5, [
    turned('tub', 'tub', 'y', [[0, 0], [0, 0.17], [0.46, 0.195], [0.46, 0.185], [0.012, 0.16], [0.012, 0]]),
    turned('foot', 'tub', 'y', [[0, 0.165], [0, 0.175], [0.02, 0.176], [0.02, 0.165], [0, 0.165]]),
    turned('lip', 'tub', 'y', [[0, 0.19], [0, 0.2], [0.02, 0.2], [0.02, 0.19], [0, 0.19]], [0, 0.44, 0]),
    box('handle-left', 'tub', [-0.215, 0.38, -0.05], [-0.19, 0.4, 0.05]),
    box('handle-right', 'tub', [0.19, 0.38, -0.05], [0.215, 0.4, 0.05]),
    turned('lid', 'lid', 'y', [[0, 0], [0, 0.203], [0.02, 0.203], [0.04, 0.17], [0.05, 0.1], [0.05, 0]], [0, 0.46, 0]),
    box('flap', 'flap', [-0.08, 0.494, -0.11], [0.08, 0.51, 0.06]),
  ], { tub: 'plastic-grey', lid: 'plastic-black', flap: 'plastic-black' })
  + { voxelGrain: 0.006 },

  // A two-wheeled kerbside bin, 580 mm wide, 740 mm deep and 1140 mm tall: a green tapered body on a pair of
  // black wheels at the back, a hinged green lid with a front lip, and a moulded grip bar behind the lid.
  h.compound('trashcan_large', 16, [
    h.prism('body', 'body', 'x', [[0.04, -0.27], [0.04, 0.29], [1.06, 0.34], [1.06, -0.34]], -0.28, 0.28),
    box('rib-left', 'body', [-0.295, 0.2, -0.3], [-0.28, 1.04, 0.32]),
    box('rib-right', 'body', [0.28, 0.2, -0.3], [0.295, 1.04, 0.32]),
    box('lid', 'lid', [-0.3, 1.06, -0.38], [0.3, 1.1, 0.36]),
    box('lid-lip', 'lid', [-0.29, 1.03, -0.39], [0.29, 1.1, -0.37]),
    box('hinge', 'lid', [-0.27, 1.06, 0.34], [0.27, 1.11, 0.38]),
    turned('grip', 'grip', 'x', [[0, 0], [0, 0.018], [0.5, 0.018], [0.5, 0]], [-0.25, 1.1, 0.38]),
    box('grip-left', 'body', [-0.27, 1.06, 0.34], [-0.22, 1.12, 0.4]),
    box('grip-right', 'body', [0.22, 1.06, 0.34], [0.27, 1.12, 0.4]),
    box('foot', 'body', [-0.2, 0, -0.29], [0.2, 0.06, -0.2]),
    turned('axle', 'axle', 'x', [[0, 0], [0, 0.015], [0.64, 0.015], [0.64, 0]], [-0.32, 0.1, 0.3]),
    turned('wheel-left', 'wheel', 'x', [[0, 0], [0, 0.1], [0.05, 0.1], [0.05, 0]], [-0.32, 0.1, 0.3]),
    turned('wheel-right', 'wheel', 'x', [[0, 0], [0, 0.1], [0.05, 0.1], [0.05, 0]], [0.27, 0.1, 0.3]),
  ], { body: 'plastic-green', lid: 'plastic-green', grip: 'plastic-green', axle: 'steel', wheel: 'rubber-black' }),

  // A large round straw basket, 440 mm across the top and 400 mm tall: woven bands of two straw tones round a
  // tapered body with a thick rolled rim, and a looped handle on each side.
  h.compound('wicker_basket_large', 0.56, [
    turned('body', 'straw', 'y', [[0, 0], [0, 0.17], [0.38, 0.215], [0.38, 0.205], [0.012, 0.16], [0.012, 0]]),
  ] + [
    turned('weave-%d' % i, 'weave', 'y', [[0, 0.168 + 0.045 * (0.03 + i * 0.05) / 0.38], [0, 0.176 + 0.045 * (0.03 + i * 0.05) / 0.38], [0.025, 0.176 + 0.045 * (0.055 + i * 0.05) / 0.38], [0.025, 0.168 + 0.045 * (0.055 + i * 0.05) / 0.38], [0, 0.168 + 0.045 * (0.03 + i * 0.05) / 0.38]], [0, 0.03 + i * 0.05, 0])
    for i in std.range(0, 6)
  ] + [
    ring('rim', 'rim', 0.225, 0.37, 0.4, 0.022),
  ] + std.flattenArrays([
    [
      box('handle-%s-front' % s.id, 'rim', [s.x0, 0.38, -0.07], [s.x0 + 0.016, 0.47, -0.05]),
      box('handle-%s-back' % s.id, 'rim', [s.x0, 0.38, 0.05], [s.x0 + 0.016, 0.47, 0.07]),
      box('handle-%s-top' % s.id, 'rim', [s.x0, 0.45, -0.07], [s.x0 + 0.016, 0.47, 0.07]),
    ]
    for s in [{ id: 'left', x0: -0.222 }, { id: 'right', x0: 0.206 }]
  ]), { straw: 'wax-cream', weave: 'wood-pine', rim: 'wood-pine' })
  + { voxelGrain: 0.006 },

  // A US-style 55 gallon collapsible water drum emptied and pressed flat, 1.1 m long over its towing rings, 500 mm
  // wide and 140 mm tall at the valve: a beige rubber body tapering into gathered collars round flat steel end
  // fittings, a water valve on one end, towing rings and side D-rings, and a dark stencilled panel on top.
  h.compound('collapsible_drum_water', 21, collapsedDrum(0.85, 0.5, 0.06, 0.11),
             { rubber: 'polymer-fde', plate: 'steel-grey', valve: 'brass', ring: 'steel', stencil: 'paint-charcoal' })
  + { voxelGrain: 0.006 },

  // A 500 gallon collapsible fuel drum emptied and pressed flat, 2.5 m long over its towing rings, 1.1 m wide and
  // 260 mm tall at the valve: a black rubber body tapering into gathered collars round flat steel end fittings, a
  // fuel valve on one end, towing rings and side D-rings, and a yellow stencilled panel on top.
  h.compound('collapsible_drum_fuel', 170, collapsedDrum(1.95, 1.1, 0.1, 0.24),
             { rubber: 'rubber-black', plate: 'steel-grey', valve: 'steel', ring: 'steel', stencil: 'paint-crane-yellow' }),

  // A rugged plastic lab box, 220 mm long, 170 mm deep and 180 mm tall: a grey case under a ribbed lid held by
  // two yellow snap latches at the front and one at each end, with hinges at the back and a folding handle on top.
  h.compound('box_small_plastic', 0.93, [
    box('case', 'shell', [-0.105, 0, -0.08], [0.105, 0.13, 0.08]),
    box('foot', 'shell', [-0.1, -0.004, -0.075], [0.1, 0, 0.075]),
    box('seam', 'trim', [-0.107, 0.13, -0.082], [0.107, 0.136, 0.082]),
    box('lid', 'shell', [-0.11, 0.136, -0.085], [0.11, 0.17, 0.085]),
    box('rib-a', 'shell', [-0.09, 0.17, -0.07], [0.09, 0.174, -0.05]),
    box('rib-b', 'shell', [-0.09, 0.17, 0.05], [0.09, 0.174, 0.07]),
    box('handle-post-a', 'trim', [-0.06, 0.17, -0.008], [-0.05, 0.18, 0.008]),
    box('handle-post-b', 'trim', [0.05, 0.17, -0.008], [0.06, 0.18, 0.008]),
    box('handle', 'trim', [-0.06, 0.176, -0.01], [0.06, 0.184, 0.01]),
    box('hinge', 'trim', [-0.08, 0.12, 0.08], [0.08, 0.145, 0.09]),
  ] + [
    box('latch-front-%s' % s.id, 'latch', [s.x - 0.018, 0.1, -0.09], [s.x + 0.018, 0.155, -0.08])
    for s in [{ id: 'a', x: -0.055 }, { id: 'b', x: 0.055 }]
  ] + [
    box('latch-%s' % s.id, 'latch', [s.x0, 0.1, -0.018], [s.x0 + 0.01, 0.155, 0.018])
    for s in [{ id: 'left', x0: -0.115 }, { id: 'right', x0: 0.105 }]
  ], { shell: 'plastic-grey', trim: 'plastic-black', latch: 'plastic-yellow' })
  + { voxelGrain: 0.004 },

  // A zipped garment bag lying flat, 1.3 m long with its hanger hook, 600 mm wide and 70 mm thick: a navy bag
  // with tapered shoulders, a black zip down its middle, a steel hanger hook out of the top and a clear name pocket.
  h.compound('outfit_storage', 0.78, [
    box('bag', 'bag', [-0.62, 0, -0.3], [0.5, 0.06, 0.3]),
    h.prism('shoulders', 'bag', 'x', [[0, -0.3], [0, 0.3], [0.06, 0.3], [0.06, -0.3]], 0.5, 0.52),
    h.prism('shoulder-taper-a', 'bag', 'x', [[0, -0.24], [0, 0.24], [0.055, 0.24], [0.055, -0.24]], 0.52, 0.56),
    h.prism('shoulder-taper-b', 'bag', 'x', [[0, -0.14], [0, 0.14], [0.05, 0.14], [0.05, -0.14]], 0.56, 0.6),
    box('zip', 'zip', [-0.6, 0.06, -0.008], [0.55, 0.066, 0.008]),
    box('pull', 'hook', [0.4, 0.066, -0.006], [0.43, 0.07, 0.014]),
    box('pocket', 'pocket', [-0.3, 0.06, 0.08], [-0.15, 0.064, 0.22]),
    box('neck', 'hook', [0.6, 0.02, -0.005], [0.64, 0.03, 0.005]),
    box('hook-top', 'hook', [0.64, 0.02, -0.005], [0.7, 0.03, 0.005]),
    box('hook-side', 'hook', [0.69, 0.02, -0.005], [0.7, 0.03, 0.05]),
    box('hook-tip', 'hook', [0.665, 0.02, 0.04], [0.69, 0.03, 0.05]),
  ], { bag: 'cloth-navy', zip: 'plastic-black', hook: 'steel', pocket: 'plastic-clear' })
  + { voxelGrain: 0.006 },
]
