local h = import '../compound.libsonnet';
local box = h.box;
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);
local zx(poly) = [[p[1], p[0]] for p in poly];

// A flat convex outline of [x, z] points lying on a top face from y to y + t.
local flat(id, slot, pts, y, t=0.004) = h.prism(id, slot, 'y', zx(pts), y, y + t);

// A strip `w` wide lying on a top face at y, from [xa, za] to [xb, zb].
local strip(id, slot, a, b, y, w=0.012, t=0.004) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  flat(id, slot, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], y, t);

// Quilting on a top face at y: raised channels running along z every `pitch` across x, from z0 to z1.
local quiltChannels(prefix, slot, x0, x1, z0, z1, y, pitch, w=0.012, t=0.006) = [
  box('%s-%d' % [prefix, i], slot, [x0 + pitch * (i + 0.5) - w / 2, y, z0], [x0 + pitch * (i + 0.5) + w / 2, y + t, z1])
  for i in std.range(0, std.floor((x1 - x0) / pitch) - 1)
];

// Open sunglasses standing on their lens rims, front on +z, the arms running back to -z and hooking down to the floor
// behind. Each lens sits proud of its rim so the frame shows round it. Slots: frame, lens.
local lensOutline(cx, s, sc, lift) = [
  [cx + s * p[0] * sc, 0.022 + (p[1] - 0.022) * sc + lift]
  for p in [[-0.028, 0.008], [-0.022, 0.0], [0.02, 0.0], [0.027, 0.006], [0.029, 0.034], [0.023, 0.044], [-0.024, 0.044], [-0.028, 0.036]]
];
local sunglasses =
  std.flattenArrays([
    [
      h.prism('rim-%d' % s, 'frame', 'z', lensOutline(s * 0.035, s, 1.14, 0.003), 0, 0.004),
      h.prism('lens-%d' % s, 'lens', 'z', lensOutline(s * 0.035, s, 1, 0.003), 0.004, 0.0055),
      sbox('hinge-%d' % s, 'frame', [s * 0.062, 0.034, -0.006], [s * 0.069, 0.044, 0.002]),
      sbox('arm-%d' % s, 'frame', [s * 0.066, 0.036, -0.13], [s * 0.069, 0.042, -0.006]),
      h.prism('ear-%d' % s, 'frame', 'x', [[0.042, -0.13], [0.036, -0.13], [0.0, -0.152], [0.0, -0.158], [0.006, -0.158]], std.min(s * 0.066, s * 0.069), std.max(s * 0.066, s * 0.069)),
    ]
    for s in [-1, 1]
  ]) + [
    box('bridge', 'frame', [-0.008, 0.036, 0], [0.008, 0.042, 0.004]),
    box('pad-l', 'frame', [-0.011, 0.016, -0.008], [-0.007, 0.026, 0]),
    box('pad-r', 'frame', [0.007, 0.016, -0.008], [0.011, 0.026, 0]),
  ];

// One quilted arming glove lying back up, fingers towards +z, thumb out to side s, centred on cx: the back of the hand
// quilted in channels, each finger in two quilted segments, and a short flared cuff. Slots: cloth, quilt, cuff.
local glove(p, cx, s) =
  local x(v) = cx + s * v;
  local fingers = [[0.026, 0.07], [0.006, 0.08], [-0.014, 0.074], [-0.034, 0.058]];
  [
    sbox(p + 'palm', 'cloth', [x(-0.045), 0, -0.02], [x(0.045), 0.02, 0.09]),
    h.prism(p + 'cuff', 'cuff', 'y', [[-0.11, x(-0.058)], [-0.11, x(0.058)], [-0.015, x(0.047)], [-0.015, x(-0.047)]], 0, 0.016),
    sbox(p + 'cuff-hem', 'quilt', [x(-0.06), 0.0, -0.112], [x(0.06), 0.019, -0.1]),
    h.prism(p + 'thumb', 'cloth', 'y', [[-0.01, x(0.04)], [0.03, x(0.045)], [0.08, x(0.08)], [0.066, x(0.095)], [0.005, x(0.06)]], 0, 0.016),
  ]
  + [
    sbox(p + 'quilt-%d' % i, 'quilt', [x(-0.042 + i * 0.021), 0.02, -0.015], [x(-0.042 + i * 0.021 + 0.013), 0.025, 0.085])
    for i in std.range(0, 3)
  ]
  + std.flattenArrays([
    local fx = fingers[i][0], fl = fingers[i][1];
    [
      sbox(p + 'finger-%d' % i, 'cloth', [x(fx - 0.0095), 0, 0.088], [x(fx + 0.0095), 0.016, 0.09 + fl]),
      sbox(p + 'finger-%d-seg-a' % i, 'quilt', [x(fx - 0.0075), 0.016, 0.092], [x(fx + 0.0075), 0.019, 0.09 + fl * 0.48]),
      sbox(p + 'finger-%d-seg-b' % i, 'quilt', [x(fx - 0.0075), 0.016, 0.094 + fl * 0.52], [x(fx + 0.0075), 0.019, 0.086 + fl]),
    ]
    for i in std.range(0, 3)
  ]);

// A folded aketon: a thick quilted jack folded on a shelf, its quilting channels running down the front, a stand
// collar at the +z end and a row of toggles closing the front. `sleeves` lays the folded-in sleeves along each side;
// a vest instead shows its armholes cut into the top layer's shoulders and a laced front. Slots: cloth, quilt,
// collar, toggle.
local aketon(w, d, ht, folds, sleeves) =
  local cz = d / 2 - 0.08;
  h.foldedGarment(w, d, ht, folds)
  + quiltChannels('quilt', 'quilt', -w / 2 + 0.01, w / 2 - 0.01, -d / 2 + 0.01, cz - 0.04, ht, 0.04)
  + h.crescent('collar', 'collar', 0.065, 0.09, -150, 150, 12, ht, ht + 0.03, 0, cz)
  + (if sleeves then [
       box('sleeve-' + k, 'cloth', [if k == 'l' then -w / 2 else w / 2 - 0.085, ht + 0.006, -d / 2 + 0.02], [if k == 'l' then -w / 2 + 0.085 else w / 2, ht + 0.026, d / 2 - 0.04])
       for k in ['l', 'r']
     ] + std.flattenArrays([
       quiltChannels('sleeve-quilt-' + k, 'quilt', if k == 'l' then -w / 2 else w / 2 - 0.085, if k == 'l' then -w / 2 + 0.085 else w / 2, -d / 2 + 0.02, d / 2 - 0.04, ht + 0.026, 0.028, 0.01, 0.005)
       for k in ['l', 'r']
     ]) + [
       box('cuff-' + k, 'collar', [if k == 'l' then -w / 2 else w / 2 - 0.085, ht + 0.006, -d / 2 + 0.005], [if k == 'l' then -w / 2 + 0.085 else w / 2, ht + 0.03, -d / 2 + 0.02])
       for k in ['l', 'r']
     ] + [
       box('placket', 'collar', [-0.014, ht, -d / 2], [0.014, ht + 0.008, cz - 0.075]),
     ] + [
       box('toggle-%d' % i, 'toggle', [-0.012, ht + 0.008, cz - 0.1 - i * 0.045], [0.012, ht + 0.016, cz - 0.09 - i * 0.045])
       for i in std.range(0, std.floor((cz - 0.1 + d / 2 - 0.02) / 0.045))
     ] else std.flattenArrays([
       // Armholes: dark crescents biting into the shoulders of the top layer.
       h.crescent('armhole-' + k, 'toggle', 0.035, 0.05, if k == 'l' then 10 else -170, if k == 'l' then 170 else -10, 8, ht, ht + 0.004, if k == 'l' then -w / 2 else w / 2, d / 2 - 0.12)
       for k in ['l', 'r']
     ]) + [
       box('front-edge', 'collar', [-0.012, ht, -d / 2], [0.012, ht + 0.008, cz - 0.075]),
     ] + std.flattenArrays([
       [
         strip('lace-%d-a' % i, 'toggle', [-0.025, z], [0.025, z - 0.035], ht + 0.008, 0.005, 0.003),
         strip('lace-%d-b' % i, 'toggle', [0.025, z], [-0.025, z - 0.035], ht + 0.011, 0.005, 0.003),
       ]
       for i in std.range(0, 3)
       for z in [cz - 0.09 - i * 0.04]
     ]));

// A padded coif standing upright as on a shelf, face opening on +z: a rounded quilted crown over a neck tube that
// flares into a cape resting on the shoulders. Slots: cloth, quilt, face, binding.
local coif =
  local neck = 0.06;
  local crown = [[0, 0.068], [0.03, 0.082], [0.07, 0.09], [0.11, 0.09], [0.15, 0.08], [0.18, 0.058], [0.196, 0.03], [0.2, 0]];
  [
    // The cape, a sloping skirt resting on the floor.
    h.turned('cape', 'cloth', 'y', [[0, 0], [0, 0.14], [0.01, 0.138], [0.035, 0.105], [0.055, 0.076], [0.07, 0.07], [0.07, 0], [0, 0]]),
    h.turned('cape-hem', 'binding', 'y', [[0, 0.132], [0, 0.144], [0.01, 0.142], [0.01, 0.13], [0, 0.132]]),
    h.turned('crown', 'cloth', 'y', [[0, 0]] + crown, [0, neck, 0]),
  ] + [
    // Quilting rings round the crown.
    h.turned('quilt-%d' % i, 'quilt', 'y', [[0, 0], [0, r + 0.003], [0.008, r + 0.003], [0.008, 0]], [0, neck + y0, 0])
    for i in std.range(0, 3)
    for y0 in [[0.03, 0.07, 0.11, 0.15][i]]
    for r in [[0.082, 0.09, 0.09, 0.08][i]]
  ] + [
    // The face opening, a dark oval set into the front of the crown, bound round its edge.
    h.prism('face-rim', 'binding', 'z', [[-0.052, 0.12], [-0.04, 0.1], [0, 0.093], [0.04, 0.1], [0.052, 0.12], [0.05, 0.19], [0.03, 0.21], [-0.03, 0.21], [-0.05, 0.19]], 0.06, 0.094),
    h.prism('face', 'face', 'z', [[-0.044, 0.122], [-0.034, 0.105], [0, 0.099], [0.034, 0.105], [0.044, 0.122], [0.042, 0.186], [0.026, 0.202], [-0.026, 0.202], [-0.042, 0.186]], 0.06, 0.096),
  ];

[
  // Open sunglasses with a black plastic frame and smoked prescription lenses, 140 mm across the front, 45 mm tall
  // and 160 mm from the lenses to the arm tips, standing on the rims with the arms hooked down behind.
  h.compound('sunglasses_eye', 0.046, sunglasses, { frame: 'plastic-matte-black', lens: 'glass-lens-green' })
  + { voxelGrain: 0.002 },

  // A canvas aketon folded on a shelf, 380 mm by 340 mm and 70 mm tall in four layers: quilted channels down the
  // front, a stand collar, the quilted sleeves folded in along each side and toggles closing the front.
  h.compound('aketon_canvas', 2.5, aketon(0.38, 0.34, 0.07, 4, true), { cloth: 'cloth-canvas', quilt: 'cloth-canvas', collar: 'cloth-khaki', toggle: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A sleeveless canvas aketon folded on a shelf, 340 mm by 320 mm and 50 mm tall: quilted channels, a stand collar,
  // armholes at the shoulders and a laced front.
  h.compound('aketon_canvas_vest', 1.5, aketon(0.34, 0.32, 0.05, 3, false), { cloth: 'cloth-canvas', quilt: 'cloth-canvas', collar: 'cloth-khaki', toggle: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A pair of quilted canvas arming gloves laid flat side by side, backs up, each 230 mm from cuff to fingertip and
  // 90 mm across the knuckles, with quilted channels over the back of the hand and the fingers.
  h.compound('aketon_gloves_canvas', 0.17, glove('l-', -0.065, -1) + glove('r-', 0.065, 1), { cloth: 'cloth-canvas', quilt: 'cloth-canvas', cuff: 'cloth-khaki' })
  + { voxelGrain: 0.004 },

  // A canvas coif standing upright, 290 mm across the shoulder cape and 260 mm tall: a quilted round crown with an
  // oval face opening, over a neck that flares into the cape.
  h.compound('aketon_hood_canvas', 0.4, coif, { cloth: 'cloth-canvas', quilt: 'cloth-canvas', face: 'cloth-black', binding: 'cloth-khaki' })
  + { voxelGrain: 0.004 },
]
