local h = import '../compound.libsonnet';
local box = h.box;

// A ball of radius r centred on [x, y, z], turned about y.
local ball(id, slot, r, x, y, z, steps=6) = h.turned(id, slot, 'y', [
  [r - r * std.cos(std.pi * i / steps), r * std.sin(std.pi * i / steps)]
  for i in std.range(0, steps)
], [x, y - r, z]);
// A regular hexagon of [z, x] points round [cx, cz], for a prism standing on y.
local hex(r, cx=0, cz=0) = [[cz + r * std.sin(std.pi * i / 3), cx + r * std.cos(std.pi * i / 3)] for i in std.range(0, 5)];
// A crystal standing on y from y0: a hexagonal shaft of radius r, `ht` tall, ending in a point stepped in three
// rings `tip` tall, and a shorter stepped point below so it rests on a blunt foot.
local crystal(prefix, slot, r, ht, tip, y0, cx=0, cz=0) =
  [h.prism(prefix + '-shaft', slot, 'y', hex(r, cx, cz), y0 + tip * 0.5, y0 + tip * 0.5 + ht)]
  + [
    h.prism('%s-tip-%d' % [prefix, i], slot, 'y', hex(r * (1 - (i + 1) / 4), cx, cz), y0 + tip * 0.5 + ht + tip * i / 3, y0 + tip * 0.5 + ht + tip * (i + 1) / 3)
    for i in std.range(0, 2)
  ]
  + [
    h.prism(prefix + '-foot', slot, 'y', hex(r * 0.7, cx, cz), y0, y0 + tip * 0.5),
  ];
// Thin lighter plates on alternate faces of a hexagonal shaft of radius r from y0 to y1, so its facets read in two
// tones. Slot: facet.
local facets(prefix, r, y0, y1) = [
  local a = hex(r), b = hex(r * 1.12);
  h.prism('%s-facet-%d' % [prefix, i], 'facet', 'y', [a[i], a[(i + 1) % 6], b[(i + 1) % 6], b[i]], y0, y1)
  for i in [0, 2, 4]
];
// A crystal point lying along x from x0 towards x1 at height y: a hexagonal shaft of radius r over half the length,
// then three shrinking steps to the tip.
local sidePoint(prefix, slot, r, x0, x1, y, z) =
  local at(f) = x0 + (x1 - x0) * f;
  local stage(id, rr, f0, f1) = h.prism(id, slot, 'x', [[y + p[0], z + p[1]] for p in hex(rr)], std.min(at(f0), at(f1)), std.max(at(f0), at(f1)));
  [stage(prefix + '-shaft', r, 0, 0.5)]
  + [stage('%s-tip-%d' % [prefix, i], r * (1 - i / 4), 0.5 + (i - 1) / 6, 0.5 + i / 6) for i in [1, 2, 3]];

[
  // A handful of pale berries from a strange bush, about 90 mm across and 45 mm high: fourteen milky white
  // berries 14 to 18 mm across heaped on a forked purple twig, with one curled grey-green leaf.
  local berries = [
    [0, 0.008, 0, 0.009], [0.016, 0.008, 0.004, 0.008], [-0.016, 0.008, -0.002, 0.0085], [0.006, 0.008, 0.016, 0.008],
    [-0.008, 0.008, 0.015, 0.0075], [0.004, 0.008, -0.016, 0.008], [-0.014, 0.008, -0.017, 0.007], [0.022, 0.007, -0.012, 0.007],
    [0.03, 0.007, 0.01, 0.007], [-0.03, 0.007, 0.006, 0.007], [0.008, 0.022, 0.002, 0.008], [-0.007, 0.022, -0.004, 0.008],
    [0.002, 0.021, 0.012, 0.007], [0.0, 0.034, 0.0, 0.0075],
  ];
  h.compound('pale_bush_berries', 0.025,
             [ball('berry-%d' % i, 'berry', berries[i][3], berries[i][0], berries[i][1], berries[i][2]) for i in std.range(0, std.length(berries) - 1)]
             + [
               h.rod('twig', 'twig', 0.0022, -0.05, -0.004, 0.018),
               box('fork-a', 'twig', [-0.006, 0.016, -0.002], [-0.002, 0.03, 0.002]),
               box('fork-b', 'twig', [-0.022, 0.017, 0.002], [-0.018, 0.024, 0.012]),
               h.prism('leaf', 'leaf', 'y', [[-0.004, -0.06], [0.006, -0.052], [0.012, -0.04], [0.006, -0.034], [-0.006, -0.042]], 0.0, 0.002),
             ],
             { berry: 'pearl', twig: 'plant-purple', leaf: 'verdigris' })
  + { voxelGrain: 0.002 },

  // A heavy alien fruit about 240 mm across and 270 mm tall: a squat egg of hard dark rind split into eight raised
  // ribs, with a woody stalk scar on top and a crown of five blunt purple knobs round it.
  local profile = [[0, 0], [0, 0.05], [0.02, 0.085], [0.05, 0.105], [0.09, 0.117], [0.13, 0.119], [0.17, 0.112], [0.21, 0.092], [0.24, 0.062], [0.26, 0.03], [0.265, 0], [0.265, 0]];
  local rAt(y) =
    local i = std.length(std.filter(function(p) p[0] <= y, profile)) - 1;
    local a = profile[std.min(i, std.length(profile) - 2)], b = profile[std.min(i + 1, std.length(profile) - 1)];
    if b[0] == a[0] then a[1] else a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
  local segs = [[0.025, 0.06], [0.06, 0.1], [0.1, 0.14], [0.14, 0.18], [0.18, 0.215], [0.215, 0.24]];
  h.compound('hard_rind_fruit', 6.9,
             [h.turned('rind', 'rind', 'y', std.slice(profile, 0, std.length(profile) - 1, 1))]
             + [
               local ang = std.pi * k / 4, ym = (s[0] + s[1]) / 2, r = rAt(ym), c = std.cos(ang), sn = std.sin(ang), w = 0.008;
               // A rib segment: a slab from r - 8 mm to r + 8 mm along the ray at `ang`, 16 mm wide.
               h.prism('rib-%d-%g' % [k, s[0] * 1000], 'rib', 'y', [
                 [(r - w) * c - w * sn, (r - w) * sn + w * c],
                 [(r + w) * c - w * sn, (r + w) * sn + w * c],
                 [(r + w) * c + w * sn, (r + w) * sn - w * c],
                 [(r - w) * c + w * sn, (r - w) * sn - w * c],
               ], s[0], s[1])
               for k in std.range(0, 7)
               for s in segs
             ]
             + [h.disc('stalk', 'stalk', 0.014, 0.255, 0.285)]
             + [
               ball('knob-%d' % i, 'knob', 0.011, 0.035 * std.sin(2 * std.pi * i / 5), 0.262, 0.035 * std.cos(2 * std.pi * i / 5))
               for i in std.range(0, 4)
             ],
             { rind: 'chitin-brown', rib: 'bark', stalk: 'plant-dried', knob: 'plant-purple' })
  + { voxelGrain: 0.004 },

  // A wobbly blue-green fruit lying on its side, 96 mm long and 68 mm thick: a smooth translucent jelly-like egg
  // with a darker cloudy core and a small dry nub where it hung.
  h.compound('jelly_fruit', 0.25,
             [
               h.turned('flesh', 'flesh', 'x', [[0, 0], [0.006, 0.02], [0.016, 0.029], [0.032, 0.034], [0.05, 0.034], [0.068, 0.031], [0.082, 0.024], [0.092, 0.013], [0.096, 0], [0.096, 0]], [-0.048, 0.034, 0]),
               h.turned('core', 'core', 'x', [[0, 0], [0.008, 0.012], [0.03, 0.016], [0.046, 0.012], [0.054, 0]], [-0.024, 0.034, 0]),
               h.rod('nub', 'nub', 0.004, 0.046, 0.054, 0.034),
               // A wet highlight along the top, and the cloudy core showing as a dark patch at the blunt end.
               box('shine', 'shine', [-0.024, 0.064, -0.013], [0.016, 0.068, -0.007]),
               h.turned('core-end', 'core', 'x', [[0, 0], [0, 0.012], [0.003, 0.012], [0.003, 0]], [-0.046, 0.034, 0]),
             ],
             { flesh: 'jelly-teal', core: 'verdigris', nub: 'plant-dried', shine: 'crystal-glow-white' })
  + { voxelGrain: 0.002 },

  // A small corked glass vial of glittering crystal dust, 16 mm across and 48 mm tall with the cork: the bottom
  // 14 mm is packed with coloured dust, the rest clear glass with a rolled lip.
  h.compound('crystal_dust_vial', 0.0085,
             [
               h.disc('dust', 'dust', 0.007, 0, 0.014),
               h.turned('glass', 'glass', 'y', [[0, 0.0058], [0, 0.007], [0.024, 0.007], [0.026, 0.0062], [0.027, 0.0075], [0.029, 0.0075], [0.029, 0.0058], [0, 0.0058]], [0, 0.014, 0]),
               h.turned('cork', 'cork', 'y', [[0, 0], [0, 0.0055], [0.005, 0.006], [0.009, 0.0068], [0.009, 0]], [0, 0.039, 0]),
             ],
             { dust: 'gem-pink', glass: 'glass-clear', cork: 'cork' })
  + { voxelGrain: 0.002 },

  // A tiny round-bellied glass phial of refined crystal powder, 18 mm across and 36 mm tall: the powder fills the
  // belly, the narrow neck is stopped and sealed with a blob of dark wax.
  h.compound('refined_crystal_powder_phial', 0.0047,
             [
               h.turned('powder', 'powder', 'y', [[0, 0], [0, 0.005], [0.002, 0.0075], [0.006, 0.009], [0.009, 0.0085], [0.009, 0]]),
               h.turned('glass', 'glass', 'y', [[0, 0.0084], [0, 0.0085], [0.004, 0.0075], [0.008, 0.004], [0.014, 0.0035], [0.014, 0.0028], [0, 0.0084]], [0, 0.009, 0]),
               h.turned('neck', 'glass', 'y', [[0, 0.0028], [0, 0.0035], [0.004, 0.0035], [0.004, 0.0028], [0, 0.0028]], [0, 0.023, 0]),
               h.turned('seal', 'seal', 'y', [[0, 0], [0, 0.0045], [0.003, 0.0048], [0.007, 0.004], [0.009, 0]], [0, 0.027, 0]),
             ],
             { powder: 'gem-pink', glass: 'glass-clear', seal: 'lacquer-black' })
  + { voxelGrain: 0.002 },

  // A strange crystal the size of a thumb tip, 27 mm tall and 14 mm across: a stubby six-sided point with two
  // smaller points jutting out sideways near its foot. Dense for its size.
  h.compound('strange_crystal', 0.01,
             crystal('main', 'crystal', 0.0062, 0.011, 0.008, 0)
             + facets('main', 0.0062, 0.002, 0.004 + 0.011)
             + [
               // A sharp pointed tip on the shaft, lighter facets on alternate sides.
               h.prism('main-point-%d' % i, if i % 2 == 0 then 'facet' else 'crystal', 'y', hex(0.0062 * [0.85, 0.62, 0.4, 0.2][i]), 0.015 + 0.003 * i, 0.018 + 0.003 * i)
               for i in std.range(0, 3)
             ]
             + sidePoint('point-a', 'point-a', 0.0026, 0.004, 0.0105, 0.005, 0.0015)
             + sidePoint('point-b', 'point-b', 0.0022, -0.004, -0.0095, 0.004, -0.002),
             { crystal: 'gem-pink', facet: 'petal-pink', 'point-a': 'petal-pink', 'point-b': 'gem-pink' })
  + { voxelGrain: 0.002 },

  // A small vial of clear treatment, 20 mm across and 56 mm tall: a glass vial with 10 ml of clear liquid, a grey
  // rubber stopper under a crimped aluminium cap, a white label band and a few pale crystal flecks settled in the bottom.
  h.compound('crystal_tonic_vial', 0.02,
             [
               h.disc('base', 'glass', 0.01, 0, 0.001),
               h.turned('glass', 'glass', 'y', [[0, 0.0088], [0, 0.01], [0.04, 0.01], [0.044, 0.0065], [0.048, 0.0065], [0.048, 0.0053], [0.044, 0.0053], [0.04, 0.0088], [0, 0.0088]]),
               h.disc('liquid', 'liquid', 0.0088, 0.001, 0.034),
               box('fleck-a', 'fleck', [-0.004, 0.001, -0.002], [-0.001, 0.003, 0.001]),
               box('fleck-b', 'fleck', [0.002, 0.001, 0.001], [0.005, 0.003, 0.004]),
               h.turned('label', 'label', 'y', [[0, 0.0098], [0, 0.0103], [0.022, 0.0103], [0.022, 0.0098], [0, 0.0098]], [0, 0.01, 0]),
               h.disc('stopper', 'stopper', 0.0062, 0.046, 0.05),
               h.turned('cap', 'cap', 'y', [[0, 0], [0, 0.0072], [0.009, 0.0072], [0.009, 0]], [0, 0.046, 0]),
             ],
             { glass: 'glass-clear', liquid: 'water', fleck: 'gem-clear', label: 'plastic-white', stopper: 'rubber-black', cap: 'foil-alu' })
  + { voxelGrain: 0.002 },
]
