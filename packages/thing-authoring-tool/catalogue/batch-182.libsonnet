local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;
local sbox = g.sbox;
local flat = g.flat;

// Torso armour laid flat, front up, neck towards -z, as batch 180 lays its guards; shirts and vests are folded on a
// shelf instead, neck at +z, as batch 180 folds its padded tops.

local sides = [-1, 1];
local sideName(s) = if s < 0 then 'l' else 'r';

// A breastplate outline `w` across and `l` long, centred on [0, 0], its armholes cut away at the top corners.
local chestOutline(w, l, arm=0.13) = [
  [-w / 2 + 0.07, -l / 2], [w / 2 - 0.07, -l / 2], [w / 2, -l / 2 + arm], [w / 2 - 0.02, l / 2], [-w / 2 + 0.02, l / 2], [-w / 2, -l / 2 + arm],
];

// Cloth or leather patches on a folded top: [x, z, w, d, slot] rectangles on the top face at y, each with a running
// stitch along its top and bottom edge. Slots: the patches' own, stitch.
local patches(list, y, pre='patch') = std.flattenArrays([
  local p = list[i], t = 0.004 + 0.002 * (i % 2);
  [
    box('%s-%d' % [pre, i], p[4], [p[0] - p[2] / 2, y, p[1] - p[3] / 2], [p[0] + p[2] / 2, y + t, p[1] + p[3] / 2]),
    box('%s-%d-stitch-a' % [pre, i], 'stitch', [p[0] - p[2] / 2 + 0.006, y + t, p[1] - p[3] / 2 + 0.005], [p[0] + p[2] / 2 - 0.006, y + t + 0.002, p[1] - p[3] / 2 + 0.008]),
    box('%s-%d-stitch-b' % [pre, i], 'stitch', [p[0] - p[2] / 2 + 0.006, y + t, p[1] + p[3] / 2 - 0.008], [p[0] + p[2] / 2 - 0.006, y + t + 0.002, p[1] + p[3] / 2 - 0.005]),
  ]
  for i in std.range(0, std.length(list) - 1)
]);

// A scooped neck and armholes bound on a sleeveless top folded `w` across, `d` deep and `ht` tall, neck at +z. Slot binding.
local sleevelessEdges(w, d, ht) =
  h.crescent('neck', 'binding', 0.07, 0.085, 90, 270, 10, ht, ht + 0.006, 0, d / 2)
  + std.flattenArrays([
    h.crescent('armhole-' + sideName(s), 'binding', 0.05, 0.064, if s > 0 then 180 else 0, if s > 0 then 360 else 180, 10, ht, ht + 0.006, s * w / 2, d / 2 - 0.085)
    for s in sides
  ]);

// Riveted steel plates on a folded vest's top face at y: [x, z, w, d] rectangles, a rivet near each corner. Slots:
// plate, rivet.
local plates(list, y, t=0.004) = std.flattenArrays([
  local p = list[i], x0 = p[0] - p[2] / 2, x1 = p[0] + p[2] / 2, z0 = p[1] - p[3] / 2, z1 = p[1] + p[3] / 2;
  [box('plate-%d' % i, 'plate', [x0, y, z0], [x1, y + t, z1])]
  + [
    h.disc('plate-%d-rivet-%d' % [i, j], 'rivet', 0.005, y + t, y + t + 0.003, if j % 2 == 0 then x0 + 0.01 else x1 - 0.01, if j < 2 then z0 + 0.01 else z1 - 0.01)
    for j in [0, 1, 2, 3]
  ]
  for i in std.range(0, std.length(list) - 1)
]);

// A fencing underarm protector laid flat, front up, neck towards -z: a quilted half vest covering the weapon-arm side
// of the chest with a short sleeve over the upper arm, a strap over the other shoulder and a tie at the waist.
// Slots: cloth, quilt, binding, strap.
local underarmGuard() =
  local y1 = 0.008;
  local chest = [[-0.06, -0.2], [0.17, -0.2], [0.17, 0.19], [-0.06, 0.19]];
  local sleeve = [[0.16, -0.2], [0.32, -0.17], [0.33, -0.05], [0.17, -0.08]];
  [flat('chest', 'cloth', chest, 0, y1), flat('sleeve', 'cloth', sleeve, 0, y1 - 0.002)]
  + [box('quilt-%d' % i, 'quilt', [-0.05, y1, -0.17 + i * 0.045], [0.16, y1 + 0.003, -0.165 + i * 0.045]) for i in std.range(0, 7)]
  + [
    g.strip('sleeve-hem', 'binding', [0.322, -0.17], [0.332, -0.05], y1 - 0.002, 0.012, 0.004),
    box('centre-binding', 'binding', [-0.068, 0, -0.2], [-0.056, y1 + 0.004, 0.19]),
    box('waist-binding', 'binding', [-0.068, 0, 0.18], [0.17, y1 + 0.004, 0.192]),
    // The strap runs up from the top of the panel over the far shoulder; the waist tie runs out round the far side.
    g.strip('shoulder-strap', 'strap', [-0.04, -0.195], [-0.17, -0.29], 0, 0.03, 0.004),
    g.strip('waist-tie', 'strap', [-0.06, 0.16], [-0.26, 0.15], 0, 0.022, 0.004),
    box('tie-ring', 'binding', [-0.27, 0, 0.135], [-0.25, 0.006, 0.165]),
  ];

// A fencer's plastic chest protector laid flat, front up, neck towards -z: a rigid plate curved across the chest with
// two moulded cups, rolled edges and webbing straps round the back and over the shoulders. Slots: shell, strap, buckle.
local cupGuard() =
  local w = 0.3, l = 0.26, r = 0.3, t = 0.004, y0 = 0.004;
  local out = [[-w / 2 + 0.03, -l / 2], [w / 2 - 0.03, -l / 2], [w / 2, -l / 2 + 0.05], [w / 2 - 0.02, l / 2], [-w / 2 + 0.02, l / 2], [-w / 2, -l / 2 + 0.05]];
  local top(x) = h.curvedTopAt(out, y0, t, r, x);
  h.curvedPlate('plate', 'shell', out, y0, t, r, 10)
  + [h.dome('cup-' + sideName(s), 'shell', 0.065, 0.045, 0.004, 'y', [s * 0.07, top(s * 0.07) - 0.004, 0.0]) for s in sides]
  + [
    h.onCurvedFace('rim-neck', 'shell', out, y0, t, r, [-w / 2 + 0.04, -l / 2 + 0.006], [w / 2 - 0.04, -l / 2 + 0.006], 0.01),
    h.onCurvedFace('rim-hem', 'shell', out, y0, t, r, [-w / 2 + 0.03, l / 2 - 0.006], [w / 2 - 0.03, l / 2 - 0.006], 0.01),
  ]
  + std.flattenArrays([
    [
      sbox('shoulder-strap-' + sideName(s), 'strap', [s * 0.09, 0, -l / 2 - 0.13], [s * 0.115, 0.004, -l / 2 + 0.01]),
      sbox('side-strap-' + sideName(s), 'strap', [s * (w / 2 - 0.01), 0, 0.03], [s * (w / 2 + 0.12), 0.004, 0.055]),
      sbox('side-buckle-' + sideName(s), 'buckle', [s * (w / 2 + 0.06), 0.004, 0.026], [s * (w / 2 + 0.085), 0.01, 0.059]),
    ]
    for s in sides
  ]);

// A tyre plate laid flat, front up, neck towards -z: chunks of tread overlapping in rows on a cloth backing, a curved
// chunk arching over each shoulder, everything bound together with bands of grey tape. Slots: backing, tread, lug,
// tape.
local tirePlate() =
  local pieces = [
    [-0.09, -0.14, 0.07, 0.055], [0.09, -0.14, 0.07, 0.055],
    [-0.13, -0.035, 0.06, 0.06], [0.0, -0.04, 0.065, 0.06], [0.13, -0.035, 0.06, 0.06],
    [-0.1, 0.075, 0.075, 0.055], [0.06, 0.08, 0.08, 0.055],
    [-0.04, 0.175, 0.1, 0.045], [0.13, 0.175, 0.055, 0.045],
  ];
  [flat('backing', 'backing', chestOutline(0.4, 0.44, 0.11), 0, 0.004)]
  + std.flattenArrays([
    local p = pieces[i], x = p[0], z = p[1], a = p[2], b = p[3], y0 = 0.004 + (i % 2) * 0.006, ht = 0.012;
    local k = 0.008 * ((i * 7 % 5) - 2);
    [flat('chunk-%d' % i, 'tread', [[x - a + k, z - b], [x + a, z - b - k], [x + a - k, z + b], [x - a, z + b + k]], y0, ht)]
    + [
      box('lug-%d-%d' % [i, j], 'lug', [x - a + 0.012, y0 + ht, z - b + 0.01 + j * (2 * b - 0.02) / 3], [x + a - 0.012, y0 + ht + 0.005, z - b + 0.01 + j * (2 * b - 0.02) / 3 + (2 * b - 0.02) / 6])
      for j in [0, 1, 2]
    ]
    for i in std.range(0, std.length(pieces) - 1)
  ])
  // Shoulder chunks: a curved slice of tyre arching up over each shoulder, sidewall out.
  + std.flattenArrays([
    h.curvedPlate('shoulder-' + sideName(s), 'tread', [[-0.07, -0.05], [0.07, -0.05], [0.07, 0.05], [-0.07, 0.05]], 0.0, 0.014, 0.09, 6, s * 0.15, -0.27)
    for s in sides
  ])
  + [
    // Tape bands wrapped round the seams and over the shoulder chunks.
    box('tape-0', 'tape', [-0.21, 0.0, -0.095], [0.21, 0.03, -0.07]),
    box('tape-1', 'tape', [-0.2, 0.0, 0.025], [0.2, 0.03, 0.05]),
    box('tape-2', 'tape', [-0.19, 0.0, 0.125], [0.19, 0.03, 0.15]),
    box('tape-3', 'tape', [-0.012, 0.0, -0.22], [0.012, 0.03, 0.22]),
  ]
  + std.flattenArrays([
    [
      box('tape-shoulder-' + sideName(s), 'tape', [s * 0.15 - 0.012, 0.0, -0.33], [s * 0.15 + 0.012, 0.05, -0.18]),
      sbox('tape-side-' + sideName(s), 'tape', [s * 0.19, 0, -0.01], [s * 0.3, 0.004, 0.018]),
    ]
    for s in sides
  ]);

// A sleeveless top folded on a shelf, neck at +z, w across x, d along z, ht tall.
local sleeveless(w, d, ht) = g.jacket({ w: w, d: d, ht: ht, folds: 3, front: 'none', buttons: [], collar: null }) + sleevelessEdges(w, d, ht);

// Leather sections sewn over a thick shirt, leaving the joints bare.
local leatherSections = [
  [-0.055, -0.05, 0.09, 0.12, 'leather-a'], [0.055, -0.05, 0.09, 0.12, 'leather-b'],
  [-0.055, -0.135, 0.09, 0.022, 'leather-b'], [0.055, -0.135, 0.09, 0.022, 'leather-a'],
];

[
  // A cotton fencing underarm protector laid flat, 400 mm from shoulder to waist and 600 mm from tie to sleeve hem.
  h.compound('plastron_cotton', 0.18, underarmGuard(), { cloth: 'cloth-bright-white', quilt: 'cloth-cream', binding: 'cloth-cream', strap: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A plastic fencing chest protector laid flat, 260 mm tall and 300 mm across, straps reaching 540 mm across.
  h.compound('plastron_plastic', 0.34, cupGuard(), { shell: 'enamel-white', strap: 'webbing-black', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A thick cotton shirt folded on a shelf, 380 mm by 330 mm and 80 mm tall, leather sections sewn over the chest,
  // the shoulders and the folded sleeves, but not over the elbows.
  h.compound('survivor_adhoc_leather_shirt', 1.2,
             g.jacket({ w: 0.38, d: 0.33, ht: 0.08, folds: 4, front: 'none', buttons: [], collar: { r: 0.06, wd: 0.016, ht: 0.01, gap: 0 }, sleeves: { kind: 'flat', w: 0.085, t: 0.008 } })
             + patches(leatherSections, 0.08)
             + patches([[-0.1475, -0.08, 0.075, 0.1, 'leather-b'], [0.1475, -0.08, 0.075, 0.1, 'leather-a'], [-0.1475, 0.09, 0.075, 0.09, 'leather-a'], [0.1475, 0.09, 0.075, 0.09, 'leather-b']], 0.088, 'sleeve-patch'),
             { cloth: 'cloth-khaki', collar: 'cloth-khaki', sleeve: 'cloth-khaki', 'leather-a': 'leather-chestnut', 'leather-b': 'leather-tan', stitch: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // The same shirt with its sleeves cut off, folded on a shelf, 360 mm by 320 mm and 70 mm tall.
  h.compound('survivor_adhoc_leather_torso', 0.89,
             sleeveless(0.36, 0.32, 0.07) + patches(leatherSections, 0.07)
             + patches([[-0.13, -0.06, 0.07, 0.12, 'leather-b'], [0.13, -0.06, 0.07, 0.12, 'leather-a']], 0.07, 'side-patch'),
             { cloth: 'cloth-khaki', binding: 'cloth-khaki', 'leather-a': 'leather-chestnut', 'leather-b': 'leather-tan', stitch: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A tyre plate laid flat, 550 mm from the shoulder chunks to the hem and 600 mm across the side tapes.
  h.compound('tireplate', 2.3, tirePlate(), { backing: 'cloth-khaki', tread: 'rubber-offblack', lug: 'rubber-tread', tape: 'tape-silver' })
  + { voxelGrain: 0.006 },

  // A denim vest folded on a shelf, 340 mm by 280 mm and 40 mm tall, steel plates riveted over both chest panels and
  // the belly, metal buttons down the front between them.
  h.compound('vest_jean_mod', 1.5,
             sleeveless(0.34, 0.28, 0.04)
             + [box('placket', 'seam', [-0.009, 0.04, -0.14], [0.009, 0.042, 0.05])]
             + g.buttons('button', 'button', 0, [-0.11, -0.07, -0.03, 0.01], 0.042, 0.006)
             + plates([[-0.075, -0.035, 0.1, 0.13], [0.075, -0.035, 0.1, 0.13], [-0.075, -0.12, 0.1, 0.035], [0.075, -0.12, 0.1, 0.035]], 0.04),
             { cloth: 'cloth-denim', binding: 'cloth-denim-faded', seam: 'cloth-denim-faded', button: 'metal-silver', plate: 'steel-bright', rivet: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A thick leather vest folded on a shelf, 360 mm by 300 mm and 45 mm tall, steel plates riveted in two columns down
  // the front either side of its laced opening.
  h.compound('vest_leather_mod', 3,
             sleeveless(0.36, 0.3, 0.045)
             + plates([[s * 0.07, -0.1 + i * 0.07, 0.095, 0.06] for s in sides for i in [0, 1, 2]], 0.045)
             + [g.strip('lace-%d' % i, 'lace', [-0.018, -0.13 + i * 0.04], [0.018, -0.11 + i * 0.04], 0.045, 0.005, 0.003) for i in [0, 1, 2, 3]],
             { cloth: 'leather-black', binding: 'leather-charcoal', plate: 'steel-bright', rivet: 'steel-grey', lace: 'leather-tan' })
  + { voxelGrain: 0.004 },
]
