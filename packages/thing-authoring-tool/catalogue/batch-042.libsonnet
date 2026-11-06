local h = import '../compound.libsonnet';
local box = h.box;
local ball = h.ball;
// A long bone `length` along x on the ground, ball head and knob at -x, two knuckles at +x, banded with darker
// rings so it reads as old bone rather than a club. Drawn at 400 mm and scaled. Slots: bone, band.
local bone(length) = h.scaled([
  h.turned('shaft', 'bone', 'x', [[0, 0], [0, 0.019], [0.03, 0.014], [0.17, 0.0115], [0.31, 0.014], [0.34, 0.02], [0.34, 0]], [-0.17, 0.024, 0]),
  h.rod('neck', 'bone', 0.011, -0.2, -0.165, 0.03) + { profile: [[0, 0], [0, 0.009], [0.035, 0.012], [0.035, 0]] },
  ball('head', 'bone', 0.02, -0.19, 0.032, 0.022),
  ball('knob', 'bone', 0.016, -0.165, 0.028, -0.012, 0.9),
  ball('knuckle-a', 'bone', 0.02, 0.175, 0.023, 0.016, 0.95),
  ball('knuckle-b', 'bone', 0.019, 0.172, 0.023, -0.017, 0.95),
  h.tube('band-a', 'band', 0, 0.0125, -0.09, -0.08, 0.024),
  h.tube('band-b', 'band', 0, 0.012, 0.01, 0.016, 0.024),
  h.tube('band-c', 'band', 0, 0.0128, 0.11, 0.122, 0.024),
], length / 0.4);
// A rough rock from convex lobes, each an [x, z] outline lifted from y0 to y1 in slices that swell and shrink,
// with each slice nudged by `lean` so the sides read rounded and uneven. Slots are the lobes' own.
local lobe(id, slot, outline, y0, y1, cx=0, cz=0, lean=[0, 0]) =
  local scales = [0.62, 0.84, 0.95, 1, 0.97, 0.88, 0.72, 0.5];
  local n = std.length(scales), dy = (y1 - y0) / n;
  [
    local k = scales[i], f = i / (n - 1);
    h.prism('%s-%d' % [id, i], slot, 'y', [[cz + lean[1] * f + p[1] * k, cx + lean[0] * f + p[0] * k] for p in outline], y0 + i * dy, y0 + (i + 1) * dy)
    for i in std.range(0, n - 1)
  ];
[
  // A fossil thigh bone about 400 mm long, its shaft about 25 mm across.
  h.compound('bone_fossil', 0.69, bone(0.4), { bone: 'clay-wet', band: 'stone-whet' }) + { voxelGrain: 0.004 },

  // A cast of a large leg bone about 2 m long, the shaft about 120 mm across, the ends nearer 200 mm.
  h.compound('large_bone_fossil', 9.7, bone(2), { bone: 'clay-wet', band: 'stone-whet' }) + { voxelGrain: 0.01 },

  // A flat field stone about 350 by 230 mm and 35 mm thick.
  h.compound('field_stone', 3.8,
             lobe('body', 'stone', [[-0.17, -0.04], [-0.12, -0.105], [0.02, -0.115], [0.15, -0.07], [0.175, 0.02], [0.11, 0.1], [-0.03, 0.115], [-0.15, 0.06]], 0, 0.03, 0, 0, [0.01, -0.006])
             + lobe('hump', 'grain', [[-0.08, -0.05], [0.04, -0.06], [0.09, 0.0], [0.04, 0.05], [-0.06, 0.05], [-0.1, 0.0]], 0.018, 0.036, 0.02, -0.01, [0.006, 0.004]),
             { stone: 'stone-grey', grain: 'stone-whet' }) + { voxelGrain: 0.004 },

  // A big lumpy rock about 300 by 230 mm and 180 mm high.
  h.compound('rock_large', 20,
             lobe('body', 'stone', [[-0.15, -0.05], [-0.09, -0.11], [0.04, -0.115], [0.145, -0.04], [0.14, 0.06], [0.06, 0.115], [-0.07, 0.11], [-0.14, 0.05]], 0, 0.15, 0, 0, [0.02, -0.015])
             + lobe('lump', 'stone', [[-0.07, -0.06], [0.04, -0.07], [0.09, 0.0], [0.04, 0.07], [-0.06, 0.06], [-0.09, 0.0]], 0.06, 0.18, -0.04, 0.02, [0.01, 0.01])
             + lobe('spur', 'grain', [[-0.05, -0.04], [0.04, -0.05], [0.07, 0.0], [0.03, 0.05], [-0.05, 0.04]], 0.01, 0.1, 0.1, 0.05, [-0.01, 0.0]),
             { stone: 'stone-whet', grain: 'stone-grey' }) + { voxelGrain: 0.006 },

  // A foil-wrapped batt of mineral wool about 500 by 300 mm and 20 mm thick, the fibre showing at both cut ends.
  h.compound('rock_wool_bat', 0.23, [
    box('batt', 'fibre', [-0.25, 0.001, -0.15], [0.25, 0.019, 0.15]),
    box('foil-bottom', 'foil', [-0.245, 0, -0.152], [0.245, 0.002, 0.152]),
    box('foil-top', 'foil', [-0.245, 0.018, -0.152], [0.245, 0.02, 0.152]),
    box('foil-front', 'foil', [-0.245, 0, 0.15], [0.245, 0.02, 0.152]),
    box('foil-back', 'foil', [-0.245, 0, -0.152], [0.245, 0.02, -0.15]),
    box('seam', 'tape', [-0.245, 0.02, -0.02], [0.245, 0.021, 0.02]),
  ], { fibre: 'paperboard-tan', foil: 'foil-alu', tape: 'tape-silver' }) + { voxelGrain: 0.004 },

  // A square of heavy canvas 150 mm a side, its edges turned and stitched.
  h.compound('canvas_patch', 0.015, [
    box('patch', 'canvas', [-0.075, 0, -0.075], [0.075, 0.002, 0.075]),
    box('hem-n', 'hem', [-0.075, 0.002, -0.075], [0.075, 0.004, -0.067]),
    box('hem-s', 'hem', [-0.075, 0.002, 0.067], [0.075, 0.004, 0.075]),
    box('hem-w', 'hem', [-0.075, 0.002, -0.067], [-0.067, 0.004, 0.067]),
    box('hem-e', 'hem', [0.067, 0.002, -0.067], [0.075, 0.004, 0.067]),
    box('stitch-n', 'stitch', [-0.071, 0.004, -0.072], [0.071, 0.006, -0.070]),
    box('stitch-s', 'stitch', [-0.071, 0.004, 0.070], [0.071, 0.006, 0.072]),
    box('stitch-w', 'stitch', [-0.072, 0.004, -0.07], [-0.070, 0.006, 0.07]),
    box('stitch-e', 'stitch', [0.070, 0.004, -0.07], [0.072, 0.006, 0.07]),
  ], { canvas: 'cloth-canvas', hem: 'cloth-canvas', stitch: 'cord-cotton' }) + { voxelGrain: 0.002 },
]
