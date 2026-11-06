local h = import '../compound.libsonnet';
local box = h.box;

// Knitted wool and fur scarves, each folded as it is found on a shelf or the floor: a stack of folds along x with
// its free end drooping off the +x end and lying out on the floor, front on +z.

// A ball of radius r resting on y0 at [x, z].
local ball(id, slot, r, x, z, y0=0, steps=6) =
  h.turned(id, slot, 'y', [[r * (1 - std.cos(std.pi * i / steps)), r * std.sin(std.pi * i / steps)] for i in std.range(0, steps)], [x, y0, z]);

// A scarf folded back and forth into `folds` layers `t` thick, the stack `len` long along x and the scarf `w` wide
// along z. Each fold turns round a rolled edge at alternate ends; the top layer runs off the +x end, drops to the
// floor and lies out `tail` further. Ribs run the length of the top layer and the tail as strips of slot `rib`.
// Slots: cloth, rib.
local foldedScarf(len, w, folds, t, tail, ribs) =
  local x0 = -len / 2, x1 = len / 2, r = t;
  local ht = folds * t;
  local ribW = w / (2 * ribs);
  [
    box('layer-%d' % i, 'cloth', [x0 + r, i * t, -w / 2], [x1 - r, (i + 1) * t, w / 2])
    for i in std.range(0, folds - 2)
  ] + [
    // the rolled edge joining layer i to layer i + 1, at -x after even layers and +x after odd ones
    h.turned('fold-%d' % i, 'cloth', 'z', [[0, 0], [0, r], [w, r], [w, 0]], [if i % 2 == 0 then x0 + r else x1 - r, (i + 1) * t, -w / 2])
    for i in std.range(0, folds - 2)
  ] + [
    // the top layer, its ribs and the drop off the +x end to the floor
    box('top-%d' % k, if k % 2 == 0 then 'cloth' else 'rib', [x0 + r, ht - t, -w / 2 + k * ribW], [x1, ht, -w / 2 + (k + 1) * ribW])
    for k in std.range(0, 2 * ribs - 1)
  ] + [
    h.turned('drape-bend', 'cloth', 'z', [[0, 0], [0, t], [w, t], [w, 0]], [x1, ht - t, -w / 2]),
    box('drape', 'cloth', [x1, 0, -w / 2], [x1 + t, ht - t, w / 2]),
  ] + [
    box('tail-%d' % k, if k % 2 == 0 then 'cloth' else 'rib', [x1, 0, -w / 2 + k * ribW], [x1 + tail, t, -w / 2 + (k + 1) * ribW])
    for k in std.range(0, 2 * ribs - 1)
  ];

// Two knitted stripe bands of slot `stripe` across the tail lying on the floor from x0, near its end at x0 + tail.
local stripes(x0, w, t, tail) = [
  box('stripe-%d' % i, 'stripe', [x0 + tail - 0.024 - 0.024 * i, 0, -w / 2], [x0 + tail - 0.012 - 0.024 * i, t + 0.002, w / 2])
  for i in [0, 1]
];

// A tasselled fringe of `n` strands of slot `fringe`, 45 mm long, out from the scarf end at x0, across width w.
local fringe(x0, w, n) = [
  box('fringe-%d' % i, 'fringe', [x0, 0, -w / 2 + (i + 0.25) * w / n], [x0 + 0.045 - 0.006 * (i % 2), 0.004, -w / 2 + (i + 0.75) * w / n])
  for i in std.range(0, n - 1)
];

// The scarf end at x0 rounded off across width w, t thick, with two fur pompoms of slot `cloth` on short cords of
// slot `cord` lying out beyond it.
local furEnd(x0, w, t) = [
  h.turned('end-round', 'cloth', 'z', [[0, 0], [0, t], [w, t], [w, 0]], [x0, 0, -w / 2]),
] + std.flattenArrays([
  [
    box('cord-%d' % i, 'cord', [x0, 0, z - 0.002], [x0 + 0.02 + 0.01 * i, 0.004, z + 0.002]),
    ball('pompom-%d' % i, 'cloth', 0.024, x0 + 0.04 + 0.01 * i, z, 0, 6),
  ]
  for i in [0, 1]
  for z in [(i - 0.5) * w * 0.5]
]);

local wool = { cloth: 'cloth-red', rib: 'cloth-crimson', stripe: 'cloth-cream', fringe: 'cloth-crimson' };
local fur = { cloth: 'fur-brown', rib: 'fur-brown', cord: 'leather-chestnut' };

[
  // A knitted wool scarf about 1.5 m long and 200 mm wide, folded in four into a stack 300 x 200 x 24 mm with
  // one end lying out 150 mm, two cream bands knitted near the end and a tasselled fringe.
  h.compound('scarf', 0.2,
             foldedScarf(0.3, 0.2, 4, 0.006, 0.15, 8)
             + stripes(0.15, 0.2, 0.006, 0.15)
             + fringe(0.3, 0.2, 9),
             wool)
  + { voxelGrain: 0.004 },

  // A long knitted wool scarf about 2.5 m long and 220 mm wide, folded in eight into a stack 340 x 220 x 48 mm with
  // one end trailing 420 mm out along the floor, banded and fringed like the short one.
  h.compound('scarf_long', 0.35,
             foldedScarf(0.34, 0.22, 8, 0.006, 0.42, 8)
             + stripes(0.17, 0.22, 0.006, 0.42)
             + fringe(0.59, 0.22, 10),
             wool)
  + { voxelGrain: 0.004 },

  // A fur scarf about 1.2 m long and 160 mm wide, folded in three into a soft stack 300 x 160 x 48 mm with one
  // end lying out 120 mm and two pompoms on short cords.
  h.compound('scarf_fur', 0.3,
             foldedScarf(0.3, 0.16, 3, 0.016, 0.12, 1)
             + furEnd(0.27, 0.16, 0.016),
             fur)
  + { voxelGrain: 0.004 },

  // A long fur scarf about 2.2 m long and 180 mm wide, folded in six into a soft stack 340 x 180 x 96 mm with one
  // end trailing 400 mm out along the floor and two pompoms on short cords.
  h.compound('scarf_fur_long', 0.55,
             foldedScarf(0.34, 0.18, 6, 0.016, 0.4, 1)
             + furEnd(0.57, 0.18, 0.016),
             fur)
  + { voxelGrain: 0.004 },
]
