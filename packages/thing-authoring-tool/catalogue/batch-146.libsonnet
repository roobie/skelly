local h = import '../compound.libsonnet';
local box = h.box;

// Pinned badges, rings and a pearl collar as found on a shelf or the floor: badges and the collar lying face up, rings
// standing upright with their hole facing +z. The onyx pieces ride on batch 145's onyx models.

local deg = std.pi / 180;
// A point on a circle of radius `r` round [cx, cz] at bearing `a` degrees, 0 toward +z and 90 toward +x.
local onCircle(r, a, cx=0, cz=0) = [cx + r * std.sin(a * deg), cz + r * std.cos(a * deg)];
// A flat convex outline of [x, z] points lying on the floor from y0 to y1.
local flat(id, slot, outline, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in outline], y0, y1);
// A ball of radius `r` resting on y0 at [x, z].
local ball(id, slot, r, x, z, y0=0, steps=6) =
  h.turned(id, slot, 'y', [[r * (1 - std.cos(std.pi * i / steps)), r * std.sin(std.pi * i / steps)] for i in std.range(0, steps)], [x, y0, z]);

// A ring band standing upright in the x-y plane, its hole on z, from z0 to z1 between radii r0 and r1, resting on the
// floor: `n` sectors, each taking the slot `slotAt(i)` gives, so bands can carry twists and engraving. Sector 0
// starts at the top.
local bandR = 0.0105;
local band(prefix, r0, r1, z0, z1, n, slotAt) = [
  local a0 = 360 * i / n, a1 = 360 * (i + 1) / n;
  local p(r, a) = [r * std.sin(a * deg), bandR + r * std.cos(a * deg)];
  h.prism('%s-%d' % [prefix, i], slotAt(i), 'z', [p(r1, a0), p(r1, a1), p(r0, a1), p(r0, a0)], z0, z1)
  for i in std.range(0, n - 1)
];
// An oval of half-axes a along x and b along z, in n points.
local oval(a, b, n=16) = [[a * std.cos(2 * std.pi * i / n), b * std.sin(2 * std.pi * i / n)] for i in std.range(0, n - 1)];
local plain(slot) = function(i) slot;
// A five-pointed star centred on the service medal's cross, as alternating outer and inner points.
local star = [onCircle(if i % 2 == 0 then 0.0058 else 0.0024, 36 * i, 0, 0.038) for i in std.range(0, 9)];
// A brilliant-cut stone of girdle radius r standing point down on y0 at [x, z].
local brilliant(id, slot, r, x, y0, z) = h.turned(id, slot, 'y', [[0, 0], [r * 0.8, r], [r * 1.05, r], [r * 1.45, r * 0.55], [r * 1.45, 0]], [x, y0, z]);

[
  // A pearl choker lying flat, 150 mm across and 8 mm tall: three strands of 6 mm pearls held apart by gold spacer
  // bars, closed at the back by a gold box clasp.
  h.compound('pearl_collar', 0.11,
             std.flattenArrays([
               local R = [0.059, 0.065, 0.071][s];
               local n = std.floor(2 * std.pi * R / 0.0056);
               [
                 local p = onCircle(R, 360 * (i + 0.5) / n);
                 ball('pearl-%d-%d' % [s, i], 'pearl', 0.003, p[0], p[1])
                 for i in std.range(0, n - 1)
                 if std.abs(std.mod(360 * (i + 0.5) / n + 180, 360) - 180) < 172
               ]
               for s in std.range(0, 2)
             ])
             + [
               local a = 45 * k;
               local q = [onCircle(0.0555, a - 1.3), onCircle(0.0745, a - 1.6), onCircle(0.0745, a + 1.6), onCircle(0.0555, a + 1.3)];
               flat('spacer-%d' % k, 'metal', q, 0.0045, 0.0065)
               for k in std.range(1, 7)
             ]
             + [box('clasp', 'metal', [-0.007, 0, -0.077], [0.007, 0.006, -0.053])],
             { pearl: 'pearl', metal: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // A round button badge lying face up, 25 mm across and 4 mm tall: a rolled steel back with a pin behind, and a
  // printed face in an orange ring round a white field with a black centre.
  h.compound('pin_badge', 0.003, [
    h.disc('back', 'back', 0.0125, 0, 0.001),
    box('pin', 'back', [-0.009, 0, -0.001], [0.009, 0.001, 0.001]),
    h.disc('ring', 'ring', 0.0125, 0.001, 0.003),
    h.disc('field', 'field', 0.0095, 0.003, 0.004),
    h.disc('centre', 'centre', 0.0045, 0.004, 0.005),
  ], { back: 'steel-bright', ring: 'plastic-orange', field: 'enamel-white', centre: 'lacquer-black' })
  + { voxelGrain: 0.002 },

  // A film radiation badge lying face up, 40 mm by 58 mm and 10 mm thick: a white plastic holder with a steel clip
  // over its top edge, an amber window over the film strip with three filter squares, and a yellow warning label
  // with a black trefoil below.
  h.compound('rad_badge', 0.017, [
    box('body', 'body', [-0.02, 0, -0.026], [0.02, 0.008, 0.029]),
    box('clip', 'clip', [-0.008, 0, -0.03], [0.008, 0.01, -0.024]),
    box('window', 'window', [-0.015, 0.008, -0.019], [0.015, 0.009, 0.006]),
    box('filter-a', 'filter-a', [-0.012, 0.009, -0.015], [-0.005, 0.01, -0.008]),
    box('filter-b', 'filter-b', [-0.0035, 0.009, -0.015], [0.0035, 0.01, -0.008]),
    box('filter-c', 'filter-a', [0.005, 0.009, -0.015], [0.012, 0.01, -0.008]),
    box('label', 'label', [-0.016, 0.008, 0.008], [0.016, 0.009, 0.0275]),
    h.disc('trefoil-hub', 'mark', 0.0017, 0.009, 0.01, 0, 0.018),
  ] + [
    local a = 120 * k + 180;
    flat('trefoil-%d' % k, 'mark', [onCircle(0.0028, a - 30, 0, 0.018), onCircle(0.0078, a - 30, 0, 0.018), onCircle(0.0078, a + 30, 0, 0.018), onCircle(0.0028, a + 30, 0, 0.018)], 0.009, 0.01)
    for k in std.range(0, 2)
  ], { body: 'enamel-white', clip: 'steel-bright', window: 'plastic-amber', 'filter-a': 'foil-alu', 'filter-b': 'bronze', label: 'plastic-hivis', mark: 'lacquer-black' })
  + { voxelGrain: 0.002 },

  // A gold engagement ring standing upright, 21 mm across and 27 mm tall: a slim band with a raised gold setting on
  // top holding a large diamond ringed by six small ones.
  h.compound('ring_engagement', 0.012,
             band('band', 0.0085, bandR, -0.0015, 0.0015, 24, plain('metal'))
             + [
               h.disc('setting', 'metal', 0.0055, 0.019, 0.022),
               brilliant('stone', 'stone', 0.003, 0, 0.0215, 0),
             ]
             + [
               local p = onCircle(0.0042, 60 * k + 30);
               ball('cluster-%d' % k, 'stone', 0.0014, p[0], p[1], 0.0215)
               for k in std.range(0, 5)
             ],
             { metal: 'metal-gold', stone: 'gem-clear' })
  + { voxelGrain: 0.002 },

  // A silver promise ring standing upright, 21 mm across and 6 mm wide: a flat band with a line of engraved script
  // running all the way round its middle, shown as one continuous darkened groove.
  h.compound('ring_purity', 0.0052,
             band('band', 0.009, bandR, -0.003, -0.001, 24, plain('metal'))
             + band('band-back', 0.009, bandR, 0.001, 0.003, 24, plain('metal'))
             + band('script', 0.009, bandR, -0.001, 0.001, 24, plain('script')),
             { metal: 'metal-silver', script: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // A signet ring standing upright, 21 mm across and 25 mm tall: a gold band rising to a flat oval table on top, set
  // with a silver face whose stamped crest has worn faint.
  h.compound('ring_signet', 0.023,
             band('band', 0.0085, bandR, -0.002, 0.002, 24, plain('gold'))
             + [
               flat('table', 'gold', oval(0.0075, 0.0065), 0.018, 0.022),
               flat('face', 'silver', oval(0.006, 0.005), 0.022, 0.024),
               box('crest-a', 'crest', [-0.001, 0.0235, -0.003], [0.001, 0.0245, 0.003]),
               box('crest-b', 'crest', [-0.003, 0.0235, -0.001], [0.003, 0.0245, 0.001]),
             ],
             { gold: 'metal-gold', silver: 'metal-silver', crest: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // A gold wedding ring standing upright, 21 mm across and 4 mm wide: a plain unbroken band with one small diamond
  // set flush into its top.
  h.compound('ring_wedding', 0.0091,
             band('band', 0.0085, bandR, -0.002, 0.002, 24, plain('metal'))
             + [box('stone', 'stone', [-0.0012, 0.0192, -0.0012], [0.0012, 0.021, 0.0012])],
             { metal: 'metal-gold', stone: 'gem-clear' })
  + { voxelGrain: 0.002 },

  // A service medal lying face up, 35 mm wide and 92 mm long: a striped blue, white and red ribbon drape with a brass
  // pin bar along its top, a ring, and a bronze cross with a gold centre bearing a star.
  h.compound('service_medal', 0.035,
             [
               box('ribbon-l', 'edge', [-0.0175, 0, -0.03], [-0.0105, 0.0015, 0.012]),
               box('stripe-l', 'stripe', [-0.0105, 0, -0.03], [-0.0065, 0.0015, 0.012]),
               box('ribbon-c', 'ribbon', [-0.0065, 0, -0.03], [0.0065, 0.0015, 0.012]),
               box('stripe-r', 'stripe', [0.0065, 0, -0.03], [0.0105, 0.0015, 0.012]),
               box('ribbon-r', 'edge', [0.0105, 0, -0.03], [0.0175, 0.0015, 0.012]),
               box('pin-bar', 'brass', [-0.0185, 0.0015, -0.034], [0.0185, 0.004, -0.028]),
               h.turned('ring', 'brass', 'y', [[0, 0.002], [0, 0.0035], [0.002, 0.0035], [0.002, 0.002], [0, 0.002]], [0, 0, 0.0145]),
             ]
             + [
               local a = 90 * k;
               flat('arm-%d' % k, 'cross', [onCircle(0.004, a - 50, 0, 0.038), onCircle(0.0195, a - 22, 0, 0.038), onCircle(0.0195, a + 22, 0, 0.038), onCircle(0.004, a + 50, 0, 0.038)], 0, 0.003)
               for k in std.range(0, 3)
             ]
             + [h.disc('boss', 'centre', 0.0075, 0, 0.004, 0, 0.038)]
             + [flat('star-core', 'star', [star[i] for i in std.range(0, 9) if i % 2 == 1], 0.004, 0.005)]
             + [flat('star-point-%d' % i, 'star', [star[(2 * i + 9) % 10], star[2 * i], star[2 * i + 1]], 0.004, 0.005) for i in std.range(0, 4)],
             { edge: 'cloth-blue', stripe: 'cloth-cream', ribbon: 'cloth-red', brass: 'brass-polished', cross: 'bronze', centre: 'metal-gold', star: 'brass-polished' })
  + { voxelGrain: 0.002 },
]
