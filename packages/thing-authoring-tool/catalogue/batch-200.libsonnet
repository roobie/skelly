local h = import '../compound.libsonnet';
local box = h.box;
// A buckle frame lying flat round a strap's end at x = x0 on a strap centred at z = cz: an open rectangle `bw` along
// x and `bh` across z, bar `b` thick, with its tongue lying across the strap. Slot buckle.
local buckleFrame(prefix, x0, bw, bh, b, y0, y1, cz) = [
  box(prefix + '-left', 'buckle', [x0 - bw, y0, cz - bh / 2], [x0 - bw + b, y1, cz + bh / 2]),
  box(prefix + '-right', 'buckle', [x0 - b, y0, cz - bh / 2], [x0, y1, cz + bh / 2]),
  box(prefix + '-front', 'buckle', [x0 - bw, y0, cz + bh / 2 - b], [x0, y1, cz + bh / 2]),
  box(prefix + '-back', 'buckle', [x0 - bw, y0, cz - bh / 2], [x0, y1, cz - bh / 2 + b]),
  box(prefix + '-tongue', 'buckle', [x0 - bw + b, y1 - 0.002, cz - 0.002], [x0 + 0.004, y1, cz + 0.002]),
];
// A belt `len` long, `w` wide and `t` thick laid flat in a U, outside up: the buckle run along +z and the tip run
// along -z, both ending at x = -run / 2, joined by a bend at +x with `gap` between the runs. The tip run has
// `holes` punched holes. Slots: strap, buckle, hole.
local beltRun(len, w, gap) = (len - std.pi * (gap / 2 + w / 2)) / 2;
local beltU(len, w, t, holes, bw, bh, b, gap=0.04) =
  local run = beltRun(len, w, gap), x0 = -run / 2, x1 = run / 2, zu = gap / 2 + w / 2, tip = w / 2;
  [
    box('run-buckle', 'strap', [x0, 0, gap / 2], [x1, t, gap / 2 + w]),
    box('run-tip', 'strap', [x0 + tip, 0, -gap / 2 - w], [x1, t, -gap / 2]),
    h.prism('tip', 'strap', 'y', [[-zu - w / 2, x0 + tip], [-zu + w / 2, x0 + tip], [-zu + w * 0.25, x0 + tip * 0.25], [-zu - w * 0.25, x0 + tip * 0.25]], 0, t),
  ] + h.crescent('bend', 'strap', gap / 2, gap / 2 + w, 0, 180, 12, 0, t, x1, 0)
  + buckleFrame('buckle', x0 + bw * 0.25, bw, bh, b, 0, t + 0.004, zu) + [
    h.disc('hole-%d' % i, 'hole', 0.0025, t, t + 0.0005, x0 + 0.1 + i * 0.025, -zu)
    for i in std.range(0, holes - 1)
  ];
// A tool pouch lying on its back beside a belt run at height y, `w` along x, hanging `l` away from the belt towards
// side `s` (+1 for +z, -1 for -z) from the belt's outer edge at z = `e`: a leather loop over the belt, a body `d`
// deep with rounded bottom corners and a belly that steps in towards its face, a flap over its top fastened by a
// stud, a dark mouth either side of the flap where the tools stand, and a glowing stone set in the flap.
// Slots: pouch, flap, mouth, seam, stone.
local toolPouch(p, cx, w, l, d, y, e, s, stone=0.006) =
  local z0 = e, rr = std.min(0.025, w / 4);
  // The [z, x] outline of a pouch face inset by `i`, its bottom corners cut round.
  local face(i) =
    local x0 = cx - w / 2 + i, x1 = cx + w / 2 - i, zt = z0 + s * i, zb = z0 + s * (l - i), r = std.max(0.004, rr - i);
    [[zt, x0], [zt, x1], [zb - s * r, x1], [zb - s * r * 0.3, x1 - r * 0.3], [zb, x1 - r], [zb, x0 + r], [zb - s * r * 0.3, x0 + r * 0.3], [zb - s * r, x0]];
  local fw = w * 0.42, fl = l * 0.55;
  [
    h.prism(p + '-body', 'pouch', 'y', face(0), y, y + d * 0.55),
    h.prism(p + '-belly', 'pouch', 'y', face(0.006), y + d * 0.55, y + d * 0.85),
    h.prism(p + '-face', 'pouch', 'y', face(0.013), y + d * 0.85, y + d),
    box(p + '-loop', 'seam', [cx - 0.02, 0.0, std.min(z0 - s * 0.06, z0 + s * 0.012)], [cx + 0.02, y + 0.004, std.max(z0 - s * 0.06, z0 + s * 0.012)]),
  ] + [
    box('%s-mouth-%d' % [p, k], 'mouth', [std.min(cx + k * (fw / 2 + 0.004), cx + k * (w / 2 - 0.012)), y + d - 0.003, std.min(z0 + s * 0.016, z0 + s * 0.03)], [std.max(cx + k * (fw / 2 + 0.004), cx + k * (w / 2 - 0.012)), y + d + 0.0006, std.max(z0 + s * 0.016, z0 + s * 0.03)])
    for k in [-1, 1]
  ] + [
    h.prism(p + '-flap', 'flap', 'y', [[z0 + s * 0.012, cx - fw / 2], [z0 + s * 0.012, cx + fw / 2], [z0 + s * (fl - 0.012), cx + fw / 2], [z0 + s * fl, cx + fw / 4], [z0 + s * fl, cx - fw / 4], [z0 + s * (fl - 0.012), cx - fw / 2]], y + d, y + d + 0.005),
    h.disc(p + '-stud', 'seam', 0.005, y + d + 0.005, y + d + 0.008, cx, z0 + s * (fl - 0.01)),
    h.disc(p + '-stone', 'stone', stone, y + d + 0.005, y + d + 0.009, cx, z0 + s * fl * 0.5),
    box(p + '-seam', 'seam', [cx - w / 2 + 0.01, y + d * 0.85, std.min(z0 + s * (l - 0.02), z0 + s * (l - 0.017))], [cx + w / 2 - 0.01, y + d + 0.001, std.max(z0 + s * (l - 0.02), z0 + s * (l - 0.017))]),
  ];
// A tool handle sticking out of a pouch mouth towards the belt: a rod along z from z0 for `len` towards side -s.
local handle(id, slot, x, y, z0, len, r, s) =
  h.turned(id, slot, 'z', [[0, 0], [0, r], [len, r], [len, 0]], [x, y, if s > 0 then z0 - len else z0]);
local beltFinish = { flap: 'leather-brown', strap: 'leather-brown', buckle: 'brass-dull', hole: 'plastic-matte-black', pouch: 'leather-tan', mouth: 'velvet-black', seam: 'leather-chestnut', stone: 'crystal-glow-violet', tool: 'steel-grey', grip: 'plastic-red', wood: 'wood-oak' };
// A dimensional work belt: a 50 mm leather belt in a U with `n` tool pouches on each run.
local toolBelt(pouches) =
  beltU(1.1, 0.05, 0.005, 4, 0.05, 0.065, 0.007)
  + std.flattenArrays([
    toolPouch('pouch-%d' % i, pouches[i].x, pouches[i].w, pouches[i].l, 0.04, 0.005, pouches[i].s * 0.07, pouches[i].s, pouches[i].stone)
    + [
      handle('pouch-%d-tool-a' % i, 'grip', pouches[i].x - pouches[i].w * 0.33, 0.045 - 0.002, pouches[i].s * 0.095, 0.05, 0.007, pouches[i].s),
      handle('pouch-%d-tool-b' % i, 'tool', pouches[i].x + pouches[i].w * 0.33, 0.045 - 0.002, pouches[i].s * 0.095, 0.035, 0.004, pouches[i].s),
    ]
    for i in std.range(0, std.length(pouches) - 1)
  ]);
// A hammer hanging in a steel loop on the belt, laid flat across x: handle along x, head along z.
local hammer(p, x, z, y) = [
  h.rod(p + '-handle', 'wood', 0.012, x - 0.14, x + 0.13, y + 0.012) + { origin: [x - 0.14, y + 0.012, z] },
  box(p + '-head', 'tool', [x + 0.11, y, z - 0.055], [x + 0.135, y + 0.026, z + 0.05]),
];
// A row of carved rune strokes on an upward face at y, along x from x0, `n` glyphs `g` apart, centred at z = cz,
// each glyph an upright stroke and a slanted one. Slot rune.
local runes(p, x0, n, g, cz, y, ht=0.03) = std.flattenArrays([
  [
    box('%s-%d-a' % [p, i], 'rune', [x0 + i * g, y, cz - ht / 2], [x0 + i * g + 0.003, y + 0.0015, cz + ht / 2]),
    h.prism('%s-%d-b' % [p, i], 'rune', 'y', [[cz - ht / 2, x0 + i * g + 0.003], [cz - ht / 2 + 0.004, x0 + i * g + 0.003], [cz + ht / 2, x0 + i * g + 0.015], [cz + ht / 2 - 0.004, x0 + i * g + 0.015]], y, y + 0.0015),
  ]
  for i in std.range(0, n - 1)
]);
// A wildwood weaver standing on its eight legs, head on +z: a carved wooden body like a spider's, a ridged bark
// abdomen with a sprouting leaf, two eyes and a pair of long needle forelegs. `k` scales it; `needle` is the
// forelegs' reach; `shears` adds a pair of blade mandibles. Slots: body, bark, leg, eye, needle, leaf, blade.
local weaver(k, needle, shears) =
  local y = 0.014 * k;
  [
    h.turned('abdomen', 'body', 'z', [[0, 0], [0.006 * k, 0.011 * k], [0.02 * k, 0.015 * k], [0.034 * k, 0.012 * k], [0.044 * k, 0]], [0, y + 0.002, -0.048 * k]),
    h.turned('thorax', 'body', 'z', [[0, 0], [0.004 * k, 0.009 * k], [0.016 * k, 0.01 * k], [0.026 * k, 0.006 * k], [0.03 * k, 0]], [0, y, -0.006 * k]),
    box('eye-l', 'eye', [-0.0065 * k, y + 0.003 * k, 0.018 * k], [-0.0025 * k, y + 0.007 * k, 0.022 * k]),
    box('eye-r', 'eye', [0.0025 * k, y + 0.003 * k, 0.018 * k], [0.0065 * k, y + 0.007 * k, 0.022 * k]),
    h.prism('leaf', 'leaf', 'x', [[y + 0.016 * k, -0.03 * k], [y + 0.024 * k, -0.036 * k], [y + 0.034 * k, -0.026 * k], [y + 0.024 * k, -0.02 * k]], -0.0015, 0.0015),
    h.turned('needle-l', 'needle', 'z', [[0, 0.0016 * k], [needle * 0.8, 0.0012 * k], [needle, 0]], [-0.004 * k, y - 0.002 * k, 0.016 * k]),
    h.turned('needle-r', 'needle', 'z', [[0, 0.0016 * k], [needle * 0.8, 0.0012 * k], [needle, 0]], [0.004 * k, y - 0.002 * k, 0.016 * k]),
  ] + [
    box('ridge-%d' % i, 'bark', [-0.012 * k, y + 0.002 + 0.012 * k, (-0.044 + i * 0.01) * k], [0.012 * k, y + 0.002 + 0.0155 * k, (-0.04 + i * 0.01) * k])
    for i in std.range(0, 3)
  ] + std.flattenArrays([
    local s = side, z = (0.012 - j * 0.009) * k, reach = [0.04, 0.048, 0.046, 0.042][j] * k;
    [
      h.prism('leg-%d-%d-upper' % [if s < 0 then 0 else 1, j], 'leg', 'z', [[s * 0.006 * k, y - 0.002 * k], [s * 0.006 * k, y + 0.002 * k], [s * reach * 0.55, y + 0.012 * k], [s * reach * 0.55, y + 0.008 * k]], z - 0.0015 * k, z + 0.0015 * k),
      h.prism('leg-%d-%d-lower' % [if s < 0 then 0 else 1, j], 'leg', 'z', [[s * reach * 0.53, y + 0.012 * k], [s * reach * 0.57, y + 0.012 * k], [s * reach, 0], [s * (reach - 0.003 * k), 0]], z - 0.0012 * k, z + 0.0012 * k),
    ]
    for side in [-1, 1]
    for j in std.range(0, 3)
  ]) + (if shears then [
          h.prism('blade-l', 'blade', 'y', [[0.02 * k, -0.003 * k], [0.02 * k, -0.0005 * k], [0.04 * k, 0.003 * k], [0.036 * k, -0.002 * k]], y - 0.005 * k, y - 0.0035 * k),
          h.prism('blade-r', 'blade', 'y', [[0.02 * k, 0.0005 * k], [0.02 * k, 0.003 * k], [0.036 * k, 0.002 * k], [0.04 * k, -0.003 * k]], y - 0.0035 * k, y - 0.002 * k),
        ] else []);
local weaverFinish = { body: 'wood-oak', bark: 'bark', leg: 'wood-oak', needle: 'bark-birch', leaf: 'leaf-green', blade: 'bone' };
// One steel bracer lying convex side up, centred at x = cx, wrist towards +z: a curved plate `l` long tapering from
// `w0` at the elbow to `w1` at the wrist, a raised rib down its middle, rolled rims at both ends, a flared elbow cop
// and two leather straps with buckles running off its edge. Slots: plate, rib, rim, strap, buckle, rivet.
local bracer(p, cx, l, w0, w1) =
  local outline = [[-w0 / 2, -l / 2], [w0 / 2, -l / 2], [w1 / 2, l / 2], [-w1 / 2, l / 2]];
  local r = 0.075, t = 0.002, y0 = 0.0;
  local top(x) = h.curvedTopAt(outline, y0, t, r, x);
  h.curvedPlate(p + '-plate', 'plate', outline, y0, t, r, 9, cx)
  + h.curvedPlate(p + '-rim-wrist', 'rim', [[-w1 / 2, l / 2 - 0.012], [w1 / 2, l / 2 - 0.012], [w1 / 2, l / 2], [-w1 / 2, l / 2]], y0 + 0.002, t, r, 7, cx, 0, w0 / 2)
  + h.curvedPlate(p + '-rim-elbow', 'rim', [[-w0 / 2, -l / 2], [w0 / 2, -l / 2], [w0 / 2 - 0.002, -l / 2 + 0.012], [-w0 / 2 + 0.002, -l / 2 + 0.012]], y0 + 0.002, t, r, 7, cx)
  + [
    h.prism(p + '-rib', 'rib', 'y', [[-l / 2 + 0.02, cx - 0.004], [-l / 2 + 0.02, cx + 0.004], [l / 2 - 0.02, cx + 0.003], [l / 2 - 0.02, cx - 0.003]], top(0) - 0.001, top(0) + 0.004),
    h.dome(p + '-cop', 'rim', 0.032, 0.018, 0.002, 'y', [cx, top(0) - 0.004, -l / 2 + 0.035]),
  ] + std.flattenArrays([
    local z = [-l * 0.2, l * 0.28][i], wz = w0 / 2 + (w1 / 2 - w0 / 2) * (z + l / 2) / l;
    [
      box('%s-strap-%d' % [p, i], 'strap', [cx - wz - 0.05, 0, z - 0.011], [cx - wz + 0.004, 0.003, z + 0.011]),
    ] + [
      h.onCurvedFace('%s-strap-%d-%d' % [p, i, j], 'strap', outline, y0, t, r, [-wz + j * wz * 0.4, z], [-wz + (j + 1) * wz * 0.4, z], 0.022, cx)
      for j in std.range(0, 3)
    ] + [
      box('%s-tongue-%d' % [p, i], 'strap', [cx + wz - 0.004, 0, z - 0.009], [cx + wz + 0.03, 0.004, z + 0.009]),
      h.disc('%s-rivet-%d' % [p, i], 'rivet', 0.004, top(0) + 0.001, top(0) + 0.003, cx + wz * 0.15, z),
    ] + buckleFrame('%s-buckle-%d' % [p, i], cx - wz - 0.03, 0.02, 0.028, 0.004, 0, 0.006, z)
    for i in [0, 1]
  ]);
[
  // An immature wildwood weaver: a living carved-wood creature like a spider 60 mm long and 80 mm across its
  // legs, with short needle forelegs and bright watching eyes.
  h.compound('mag_immature_weaver', 0.02, weaver(1.0, 0.022, false), weaverFinish { eye: 'gem-citrine' })
  + { voxelGrain: 0.002 },

  // A grown wildwood weaver: the same creature 75 mm long and 100 mm across its legs, with long needle forelegs,
  // a pair of pale blade mandibles and dark, unlit eyes.
  h.compound('mag_adult_weaver', 0.039, weaver(1.25, 0.04, true), weaverFinish { eye: 'gem-onyx' })
  + { voxelGrain: 0.002 },

  // A braided steel belt 1.1 m long and 30 mm wide laid in a U, its plaits shown as alternating raised links, with
  // a plain steel buckle and a wrapped steel grip at its tip where it becomes a whip's handle.
  h.compound('mbelt_iron_whip', 1.2, beltU(1.1, 0.03, 0.005, 0, 0.035, 0.042, 0.005)
    + std.flattenArrays([
      [
        h.prism('plait-a-%d' % i, 'plait', 'y', [[0.02 + 0.002, x0], [0.02 + 0.014, x0 + 0.012], [0.02 + 0.014, x0 + 0.018], [0.02 + 0.002, x0 + 0.006]], 0.005, 0.0065),
        h.prism('plait-b-%d' % i, 'plait', 'y', [[0.05 - 0.002, x0], [0.05 - 0.014, x0 + 0.012], [0.05 - 0.014, x0 + 0.018], [0.05 - 0.002, x0 + 0.006]], 0.005, 0.0065),
        h.prism('plait-c-%d' % i, 'plait', 'y', [[-0.02 - 0.002, x0], [-0.02 - 0.014, x0 + 0.012], [-0.02 - 0.014, x0 + 0.018], [-0.02 - 0.002, x0 + 0.006]], 0.005, 0.0065),
        h.prism('plait-d-%d' % i, 'plait', 'y', [[-0.05 + 0.002, x0], [-0.05 + 0.014, x0 + 0.012], [-0.05 + 0.014, x0 + 0.018], [-0.05 + 0.002, x0 + 0.006]], 0.005, 0.0065),
      ]
      for i in std.range(0, 20)
      for x0 in [-0.17 + i * 0.019]
    ]) + [
      h.turned('grip', 'grip', 'x', [[0, 0.009], [0.08, 0.009], [0.085, 0.012], [0.095, 0.012], [0.1, 0]], [-0.33, 0.009, -0.035]),
    ] + [
      h.turned('grip-wrap-%d' % i, 'buckle', 'x', [[0, 0], [0, 0.0105], [0.004, 0.0105], [0.004, 0]], [-0.325 + i * 0.013, 0.009, -0.035])
      for i in std.range(0, 5)
    ], { strap: 'steel-grey', plait: 'steel-bright', buckle: 'steel-parkerized', hole: 'plastic-matte-black', grip: 'steel-parkerized' })
  + { voxelGrain: 0.002 },

  // A lesser dimensional tool belt: a 50 mm brown leather work belt 1.1 m long laid in a U, with two flapped tan
  // tool pouches 120 mm square hanging from the buckle run, tools standing in their mouths, each flap set with a
  // small violet stone.
  h.compound('mbelt_pockets_lesser', 1.5, toolBelt([
    { x: -0.07, w: 0.12, l: 0.12, s: 1, stone: 0.006 },
    { x: 0.08, w: 0.12, l: 0.12, s: 1, stone: 0.006 },
  ]), beltFinish)
  + { voxelGrain: 0.004 },

  // A greater dimensional tool belt: the same work belt with four pouches, two on each run, a hammer in a steel
  // loop at the bend, and larger violet stones.
  h.compound('mbelt_pockets_greater', 3, toolBelt([
    { x: -0.11, w: 0.11, l: 0.12, s: 1, stone: 0.009 },
    { x: 0.03, w: 0.13, l: 0.13, s: 1, stone: 0.009 },
    { x: -0.06, w: 0.11, l: 0.11, s: -1, stone: 0.009 },
    { x: 0.08, w: 0.11, l: 0.11, s: -1, stone: 0.009 },
  ]) + hammer('hammer', 0.27, 0, 0.005) + h.crescent('hammer-loop', 'tool', 0.016, 0.02, 0, 360, 12, 0.005, 0.03, 0.19, 0), beltFinish)
  + { voxelGrain: 0.004 },

  // A technomancer's tool belt: a 60 mm black leather belt 1.15 m long laid in a U, faced with steel plates carved
  // with glowing blue runes, a steel buckle set with a blue crystal, and tools hanging in steel loops along both runs:
  // a hammer, an adjustable spanner, a screwdriver and a folding saw.
  h.compound('mbelt_technomancer_toolbelt', 2, beltU(1.15, 0.06, 0.006, 4, 0.06, 0.08, 0.009)
    + [
      box('plate-%d' % i, 'plate', [-0.2 + i * 0.1, 0.006, 0.024], [-0.13 + i * 0.1, 0.009, 0.076])
      for i in std.range(0, 3)
    ] + std.flattenArrays([
      runes('rune-%d' % i, -0.195 + i * 0.1, 3, 0.02, 0.05, 0.009, 0.026)
      for i in std.range(0, 3)
    ]) + [
      h.disc('buckle-stone', 'stone', 0.012, 0.01, 0.016, -0.25, 0.05),
      // A spanner lying across the tip run.
      box('spanner-shank', 'tool', [-0.16, 0.006, -0.17], [-0.145, 0.012, -0.01]),
      box('spanner-jaw-a', 'tool', [-0.172, 0.006, -0.01], [-0.133, 0.012, 0.004]),
      box('spanner-jaw-b', 'tool', [-0.172, 0.006, 0.004], [-0.162, 0.012, 0.016]),
      box('spanner-jaw-c', 'tool', [-0.143, 0.006, 0.004], [-0.133, 0.012, 0.016]),
      // A screwdriver across the tip run.
      h.turned('driver-grip', 'grip', 'z', [[0, 0], [0, 0.012], [0.09, 0.012], [0.1, 0]], [-0.02, 0.018, -0.2]),
      h.turned('driver-shaft', 'tool', 'z', [[0, 0.003], [0.11, 0.003], [0.115, 0]], [-0.02, 0.018, -0.1]),
      // A folding saw across the tip run.
      box('saw-handle', 'grip', [0.09, 0.006, -0.19], [0.12, 0.022, -0.08]),
      box('saw-blade', 'tool', [0.095, 0.022, -0.1], [0.115, 0.025, 0.01]),
    ] + std.flattenArrays([
      h.crescent('loop-%d' % i, 'buckle', 0.014, 0.018, 0, 360, 10, 0.006, 0.016, [-0.02, 0.105, -0.152][i], -0.07)
      for i in std.range(0, 2)
    ]) + hammer('hammer', 0.3, 0, 0.006) + h.crescent('hammer-loop', 'buckle', 0.016, 0.02, 0, 360, 12, 0.006, 0.032, 0.21, 0), {
    strap: 'leather-black',
    buckle: 'steel-grey',
    hole: 'plastic-matte-black',
    plate: 'steel-grey',
    rune: 'crystal-glow-blue',
    stone: 'crystal-glow-blue',
    tool: 'steel-bright',
    grip: 'plastic-red',
    wood: 'wood-oak',
  })
  + { voxelGrain: 0.004 },

  // A wide fighting girdle 1.1 m long and 100 mm wide in black leather laid in a U, edged in oxblood, a band of
  // carved violet runes along both runs, two empty weapon frogs on the buckle run and a broad bronze buckle.
  h.compound('mbelt_weaponry', 0.9, beltU(1.1, 0.1, 0.005, 3, 0.09, 0.12, 0.014, 0.03)
    + [
      box('edge-a', 'edge', [-0.21, 0.005, 0.015], [0.21, 0.0065, 0.022]),
      box('edge-b', 'edge', [-0.21, 0.005, 0.108], [0.21, 0.0065, 0.115]),
      box('edge-c', 'edge', [-0.19, 0.005, -0.115], [0.21, 0.0065, -0.108]),
      box('edge-d', 'edge', [-0.19, 0.005, -0.022], [0.21, 0.0065, -0.015]),
    ] + runes('rune-a', -0.14, 8, 0.04, -0.065, 0.005, 0.04)
    + runes('rune-b', -0.14, 3, 0.03, 0.065, 0.005, 0.04)
    + runes('rune-c', 0.11, 3, 0.03, 0.065, 0.005, 0.04)
    + std.flattenArrays([
      [
        box('frog-%d' % i, 'frog', [x - 0.02, 0.005, 0.03], [x + 0.02, 0.012, 0.19]),
        box('frog-%d-slot' % i, 'hole', [x - 0.012, 0.012, 0.16], [x + 0.012, 0.0125, 0.175]),
        h.disc('frog-%d-rivet' % i, 'buckle', 0.004, 0.012, 0.014, x, 0.05),
      ]
      for i in [0, 1]
      for x in [[0.0, 0.07][i]]
    ]), { strap: 'leather-black', edge: 'leather-oxblood', rune: 'crystal-glow-violet', frog: 'leather-oxblood', buckle: 'bronze-polished', hole: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A pair of steel bracers lying side by side, convex side up, wrists towards +z: each a curved plate 250 mm long,
  // 120 mm across at the elbow and 95 mm at the wrist, with a raised rib, rolled rims, an elbow cop and two buckled
  // leather straps.
  h.compound('mbracer_steel_pair', 1.3, bracer('l', -0.1, 0.25, 0.12, 0.095) + bracer('r', 0.1, 0.25, 0.12, 0.095), {
    plate: 'steel-grey',
    rib: 'steel-bright',
    rim: 'steel-bright',
    strap: 'leather-brown',
    buckle: 'brass-dull',
    rivet: 'brass-dull',
  })
  + { voxelGrain: 0.004 },
]
