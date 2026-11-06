local h = import '../compound.libsonnet';

local deg = std.pi / 180;
// A point on a circle of radius `r` round [cx, cz] at bearing `a` degrees, 0 toward +z and 90 toward +x.
local onCircle(r, a, cx=0, cz=0) = [cx + r * std.sin(a * deg), cz + r * std.cos(a * deg)];
// A local [along, out] point placed at bearing `a` on a circle of radius `r`: `along` runs with the circle, `out`
// away from its centre, so charms and shells hung round a loop face outward.
local onLoop(r, a, p, cx=0, cz=0) =
  local u = [std.sin(a * deg), std.cos(a * deg)], v = [std.cos(a * deg), -std.sin(a * deg)];
  [cx + (r + p[1]) * u[0] + p[0] * v[0], cz + (r + p[1]) * u[1] + p[0] * v[1]];
// A flat convex outline of [x, z] points lying on the floor from y0 to y1.
local flat(id, slot, outline, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in outline], y0, y1);
// An oval of [along, out] half-axes `a` and `b` in `n` points, for `onLoop`.
local oval(a, b, n=12) = [[a * std.cos(2 * std.pi * i / n), b * std.sin(2 * std.pi * i / n)] for i in std.range(0, n - 1)];
// A ball of radius `r` resting on y0 at [x, z].
local ball(id, slot, r, x, z, y0=0, steps=6) =
  h.turned(id, slot, 'y', [[r * (1 - std.cos(std.pi * i / steps)), r * std.sin(std.pi * i / steps)] for i in std.range(0, steps)], [x, y0, z]);
// A ring of wire radius `r` bent to radius `R` about `axis` through `origin`; its outline closes on its first point.
local torus(id, slot, R, r, axis, origin, steps=8) =
  h.turned(id, slot, axis, [[r * std.sin(2 * std.pi * i / steps), R + r * std.cos(2 * std.pi * i / steps)] for i in std.range(0, steps)], origin);
// `n` beads of radius `br` threaded round a circle of radius `R` lying on the floor.
local beadRing(prefix, slot, R, br, n, cx=0, cz=0) = [
  local p = onCircle(R, 360 * i / n, cx, cz);
  ball('%s-%d' % [prefix, i], if std.type(slot) == 'array' then slot[i % std.length(slot)] else slot, br, p[0], p[1])
  for i in std.range(0, n - 1)
];
// A chain lying flat in a circle of radius `R`: `n` links, alternately flat and on edge, so it reads as links.
local chain(prefix, slot, R, n, w, cx=0, cz=0) = std.flattenArrays([
  local a0 = 360 * i / n, a1 = 360 * (i + 1) / n - 360 / n * 0.15;
  if i % 2 == 0 then h.crescent('%s-%d' % [prefix, i], slot, R - w / 2, R + w / 2, a0, a1, 1, 0, w * 0.45, cx, cz)
  else h.crescent('%s-%d' % [prefix, i], slot, R - w * 0.2, R + w * 0.2, a0 - 360 / n * 0.2, a1 + 360 / n * 0.2, 1, 0, w * 0.9, cx, cz)
  for i in std.range(0, n - 1)
]);
// A flat arc standing upright in the x-y plane from z0 to z1: radii [ax, ay] inner to outer by `w`, over [a0, a1]
// degrees from +x round through +y, in `steps` quads. For a headband standing on its ends.
local archXY(prefix, slot, ax, ay, w, a0, a1, steps, z0, z1) = [
  local t0 = (a0 + (a1 - a0) * i / steps) * deg, t1 = (a0 + (a1 - a0) * (i + 1) / steps) * deg;
  h.prism('%s-%d' % [prefix, i], slot, 'z', [
    [ax * std.cos(t0), ay * std.sin(t0)],
    [ax * std.cos(t1), ay * std.sin(t1)],
    [(ax + w) * std.cos(t1), (ay + w) * std.sin(t1)],
    [(ax + w) * std.cos(t0), (ay + w) * std.sin(t0)],
  ], z0, z1)
  for i in std.range(0, steps - 1)
];
// An upright oval in the x-y plane round [cx, cy], half-axes a and b, tilted `tilt` degrees, from z0 to z1.
local ovalXY(id, slot, cx, cy, a, b, tilt, z0, z1, n=16) =
  local c = std.cos(tilt * deg), s = std.sin(tilt * deg);
  h.prism(id, slot, 'z', [
    local x = a * std.cos(2 * std.pi * i / n), y = b * std.sin(2 * std.pi * i / n);
    [cx + x * c - y * s, cy + x * s + y * c]
    for i in std.range(0, n - 1)
  ], z0, z1);

// A bat charm lying flat at bearing `at` on a loop of radius R, its head toward the loop: a body and two wings, each
// wing two convex panels. Slot charm.
local bat(prefix, R, at, y0, t) =
  local p(q) = onLoop(R, at, [q[0] * 1.5, q[1] * 1.5]);
  [
    flat(prefix + '-body', 'charm', [p(q) for q in oval(0.0022, 0.0045, 8)], y0, y0 + t + 0.001),
  ] + std.flattenArrays([
    [
      flat('%s-wing-%d-a' % [prefix, s + 1], 'charm', [p([s * q[0], q[1]]) for q in [[0.001, -0.003], [0.008, -0.004], [0.009, 0.001], [0.001, 0.002]]], y0, y0 + t),
      flat('%s-wing-%d-b' % [prefix, s + 1], 'charm', [p([s * q[0], q[1]]) for q in [[0.007, -0.004], [0.012, -0.006], [0.011, 0.0], [0.008, 0.002]]], y0, y0 + t),
    ]
    for s in [-1, 1]
  ]);
// A drop charm with its point toward the loop. Slot drop.
local drop(prefix, R, at, y0, t) =
  [flat(prefix, 'drop', [onLoop(R, at, [q[0] * 1.4, q[1] * 1.4]) for q in [[0, -0.0015], [0.003, 0.003], [0.0035, 0.006], [0.002, 0.008], [-0.002, 0.008], [-0.0035, 0.006], [-0.003, 0.003]]], y0, y0 + t)];
// A small split ring joining a charm to its loop, on edge. Slot ring.
local jumpRing(id, R, at) =
  local q = onLoop(R, at, [0, 0.0015]);
  h.box(id, 'ring', [q[0] - 0.0012, 0, q[1] - 0.0012], [q[0] + 0.0012, 0.003, q[1] + 0.0012]);

// A cowrie shell lying slit up at bearing `at` round a loop of radius R, its length along the loop: a low oval
// base, a domed back and a dark slit. Slots shell and slit.
local cowrie(prefix, R, at, y0) =
  local p(q) = onLoop(R, at, q);
  [
    flat(prefix + '-base', 'shell', [p([q[0], q[1] + 0.006]) for q in oval(0.009, 0.0062)], y0, y0 + 0.003),
    flat(prefix + '-back', 'shell', [p([q[0], q[1] + 0.006]) for q in oval(0.0068, 0.0045)], y0 + 0.003, y0 + 0.006),
    flat(prefix + '-slit', 'slit', [p(q) for q in [[-0.0062, 0.0055], [0.0062, 0.0055], [0.0062, 0.0068], [-0.0062, 0.0068]]], y0 + 0.006, y0 + 0.0075),
  ];

// A medal lying flat on its neck ribbon, the ribbon folded short: a loop at -z whose two legs cross into a V at a
// brass bar, the right leg over the left, and below it at +z a struck disc with a raised rim and a raised star hung
// from a small ring. Slots medal, ribbon, stripe.
local medal(id, mass) =
  local r = 0.03, mz = 0.011 + r, top = -0.08, w = 0.03, t = 0.0015;
  local star = [onCircle(if i % 2 == 0 then 0.017 else 0.007, 36 * i, 0, mz) for i in std.range(0, 9)];
  // A leg from the loop end at bearing side s (-1 left, +1 right) down to the bar, `hw` wide either side of its
  // centre line.
  local leg(pid, slot, s, hw, y0, y1) =
    flat(pid, slot, [[s * 0.03 - hw, top], [s * 0.03 + hw, top], [hw, 0], [-hw, 0]], y0, y1);
  h.compound(id, mass,
             h.crescent('loop', 'ribbon', 0.03 - w / 2, 0.03 + w / 2, 90, 270, 8, 0, t, 0, top)
             + h.crescent('loop-stripe', 'stripe', 0.0265, 0.0335, 90, 270, 8, t, t + 0.0006, 0, top)
             + [
               leg('leg-left', 'ribbon', -1, w / 2, 0, t),
               leg('leg-left-stripe', 'stripe', -1, 0.0035, t, t + 0.0006),
               leg('leg-right', 'ribbon', 1, w / 2, t + 0.0006, 2 * t + 0.0006),
               leg('leg-right-stripe', 'stripe', 1, 0.0035, 2 * t + 0.0006, 2 * t + 0.0012),
               h.box('bar', 'medal', [-0.019, 0, -0.004], [0.019, 0.005, 0.004]),
               torus('bail', 'medal', 0.0045, 0.0012, 'z', [0, 0.003, 0.0075], 6),
               h.disc('disc', 'medal', r, 0, 0.003, 0, mz),
               torus('rim', 'medal', r - 0.0018, 0.0018, 'y', [0, 0.003, mz], 6),
               flat('star-core', 'relief', [star[i] for i in std.range(0, 9) if i % 2 == 1], 0.003, 0.005),
             ]
             + [
               flat('star-point-%d' % i, 'relief', [star[(2 * i + 9) % 10], star[2 * i], star[2 * i + 1]], 0.003, 0.005)
               for i in std.range(0, 4)
             ],
             { medal: 'bronze', relief: 'brass-polished', ribbon: 'cloth-red', stripe: 'cloth-cream' })
  + { voxelGrain: 0.002 };

[
  // A plastic hair barrette 75 mm long and 14 mm wide lying ornaments up: a black bar on a steel spring clasp, a pink
  // bow in the middle and a row of clear rhinestones and pearl beads along it.
  h.compound('barrette', 0.01,
             [
               h.box('clasp', 'clasp', [-0.034, 0, -0.004], [0.034, 0.002, 0.004]),
               flat('bar', 'bar', oval(0.0375, 0.007, 20), 0.002, 0.005),
               flat('bow-left', 'bow', [[0, 0], [-0.013, -0.008], [-0.013, 0.008]], 0.005, 0.008),
               flat('bow-right', 'bow', [[0, 0], [0.013, 0.008], [0.013, -0.008]], 0.005, 0.008),
               h.box('bow-knot', 'bow', [-0.003, 0.005, -0.004], [0.003, 0.0095, 0.004]),
             ]
             + [ball('stone-%d' % i, 'stone', 0.0022, [-0.031, -0.018, 0.018, 0.031][i], 0, 0.0045) for i in std.range(0, 3)]
             + [ball('pearl-%d' % i, 'pearl', 0.0025, [-0.0245, 0.0245][i], 0, 0.0045) for i in [0, 1]],
             { clasp: 'metal-silver', bar: 'plastic-black', bow: 'plastic-pink', stone: 'gem-clear', pearl: 'gem-opaque' })
  + { voxelGrain: 0.002 },

  // A black cord anklet 250 mm round lying flat, with three black bat charms 24 mm across and three red drop charms
  // hung on small rings, all lying outward.
  local R = 0.04;
  h.compound('bat_anklet', 0.0044,
             [torus('cord', 'cord', R, 0.0012, 'y', [0, 0.0012, 0])]
             + std.flattenArrays([
               [jumpRing('ring-%d' % i, R, 60 * i)]
               + (if i % 2 == 0 then bat('bat-%d' % i, R + 0.011, 60 * i, 0, 0.002) else drop('drop-%d' % i, R + 0.002, 60 * i, 0, 0.003))
               for i in std.range(0, 5)
             ]),
             { cord: 'cloth-black', charm: 'plastic-black', drop: 'plastic-red', ring: 'metal-silver' })
  + { voxelGrain: 0.002 },

  // A stretch bracelet of 22 round wooden beads, 8 mm each, lying flat in a ring 68 mm across.
  h.compound('bead_bracelet', 0.0037, beadRing('bead', 'bead', 0.03, 0.004, 22), { bead: 'wood-walnut' })
  + { voxelGrain: 0.002 },

  // A pair of beaded earrings lying flat side by side, each 32 mm long: a silver ear wire bent into a hook and three
  // wooden beads strung below it, the middle one larger.
  h.compound('bead_ear', 0.0014,
             std.flattenArrays([
               h.crescent('hook-%d' % k, 'wire', 0.0055, 0.0068, -10, 200, 6, 0, 0.0014, x, 0.011)
               + [
                 h.box('pin-%d' % k, 'wire', [x - 0.0006, 0, -0.012], [x + 0.0006, 0.0014, 0.005]),
                 ball('bead-%d-a' % k, 'bead', 0.0025, x, 0.002),
                 ball('bead-%d-b' % k, 'bead', 0.0032, x, -0.0037),
                 ball('bead-%d-c' % k, 'bead', 0.0025, x, -0.0095),
               ]
               for k in [0, 1]
               for x in [if k == 0 then -0.011 else 0.011]
             ]),
             { wire: 'metal-silver', bead: 'wood-walnut' })
  + { voxelGrain: 0.002 },

  // A string of 60 wooden beads, 10 mm each, lying flat in a ring 210 mm across, with a larger guru bead and a red
  // cord tassel at +z so it doubles as prayer beads.
  local R = 0.1;
  h.compound('bead_necklace', 0.021,
             beadRing('bead', 'bead', R, 0.005, 60)
             + [
               ball('guru', 'bead', 0.0075, 0, R + 0.011),
               h.box('tassel-cap', 'tassel', [-0.003, 0, R + 0.017], [0.003, 0.006, R + 0.023]),
               flat('tassel', 'tassel', [[-0.002, R + 0.022], [0.002, R + 0.022], [0.006, R + 0.05], [-0.006, R + 0.05]], 0, 0.004),
             ],
             { bead: 'wood-birch', tassel: 'cloth-red' })
  + { voxelGrain: 0.002 },

  // A woven cord friendship bracelet lying flat in a ring 66 mm across, its band banded red, yellow and blue, with
  // the tie ends trailing at -z and a few knick-knacks threaded on: wooden letter cubes, a green bead and an orange
  // bead.
  local R = 0.03;
  h.compound('bracelet_friendship', 0.003,
             std.flattenArrays([
               h.crescent('band-%d' % i, ['thread-a', 'thread-b', 'thread-c'][i % 3], R - 0.003, R + 0.003, 15 + 330 * i / 24, 15 + 330 * (i + 1) / 24, 1, 0, 0.003)
               for i in std.range(0, 23)
             ])
             + [
               flat('tail-left', 'thread-a', [[-0.009, -R - 0.002], [-0.005, -R + 0.001], [-0.009, -R - 0.03], [-0.012, -R - 0.029]], 0, 0.002),
               flat('tail-right', 'thread-b', [[0.005, -R + 0.001], [0.009, -R - 0.002], [0.012, -R - 0.029], [0.009, -R - 0.03]], 0, 0.002),
               h.box('knot', 'thread-c', [-0.006, 0, -R - 0.003], [0.006, 0.004, -R + 0.003]),
             ]
             + [
               local p = onCircle(R, a);
               h.box('block-%d' % a, 'block', [p[0] - 0.0035, 0, p[1] - 0.0035], [p[0] + 0.0035, 0.007, p[1] + 0.0035])
               for a in [-20, 0, 20]
             ]
             + [local p = onCircle(R, 90); ball('bead-green', 'bead-a', 0.0045, p[0], p[1])]
             + [local p = onCircle(R, 270); ball('bead-orange', 'bead-b', 0.0045, p[0], p[1])],
             { 'thread-a': 'cloth-red', 'thread-b': 'cloth-yellow', 'thread-c': 'cloth-blue', block: 'wood-birch', 'bead-a': 'plastic-green', 'bead-b': 'plastic-orange' })
  + { voxelGrain: 0.002 },

  // A third-place medal 60 mm across, struck in brass with a raised rim and star, on a red neck ribbon with a cream
  // stripe folded short into a V above it.
  medal('bronze_medal', 0.1),

  // A pair of black bunny ears on a headband, standing on the band's ends, front on +z: a black velvet band 150 mm
  // across and two upright ears 150 mm tall, splayed a little, with pink inner faces.
  local ax = 0.07, ay = 0.085, top = ay + 0.006;
  h.compound('bunny_ears_black', 0.026,
             archXY('band', 'band', ax, ay, 0.006, 0, 180, 18, -0.006, 0.006)
             + std.flattenArrays([
               [
                 ovalXY('ear-%d' % (s + 1), 'fur', s * 0.03, top + 0.06, 0.022, 0.072, -s * 12, -0.005, 0.005),
                 ovalXY('ear-%d-inner' % (s + 1), 'inner', s * 0.03 - s * 0.001, top + 0.065, 0.012, 0.055, -s * 12, 0.005, 0.0065),
               ]
               for s in [-1, 1]
             ]),
             { band: 'velvet-black', fur: 'velvet-black', inner: 'plastic-pink' })
  + { voxelGrain: 0.002 },

  // A detached shirt collar standing on its lower edge, 130 mm across and 40 mm tall, front on +z: a white band with
  // its wing tips folded down at the front, a gold stud at the back and a black bow tie 95 mm wide at the throat.
  local R = 0.065, ht = 0.04;
  h.compound('collar_playboy', 0.02,
             [
               h.turned('band', 'collar', 'y', [[0, R - 0.002], [0, R], [ht, R], [ht, R - 0.002], [0, R - 0.002]]),
               h.prism('wing-left', 'collar', 'z', [[-0.003, ht], [-0.02, ht], [-0.012, ht - 0.016]], R - 0.004, R + 0.002),
               h.prism('wing-right', 'collar', 'z', [[0.003, ht], [0.012, ht - 0.016], [0.02, ht]], R - 0.004, R + 0.002),
               h.prism('bow-left', 'bow', 'z', [[-0.004, 0.02], [-0.047, 0.004], [-0.047, 0.036]], R + 0.002, R + 0.01),
               h.prism('bow-right', 'bow', 'z', [[0.004, 0.02], [0.047, 0.036], [0.047, 0.004]], R + 0.002, R + 0.01),
               h.box('bow-knot', 'bow', [-0.007, 0.013, R + 0.002], [0.007, 0.027, R + 0.012]),
               ball('stud', 'stud', 0.003, 0, -R - 0.002, 0.017),
             ],
             { collar: 'cloth-bright-white', bow: 'satin-black', stud: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // A silver collar bar 55 mm long lying on the floor: a slim rod with a ball at each end, one of them screwing off
  // so the bar passes through the collar's eyelets.
  h.compound('collarpin', 0.0064,
             [
               h.rod('bar', 'metal', 0.0015, -0.024, 0.024, 0.003),
               ball('end-left', 'metal', 0.0035, -0.0255, 0, -0.0005),
               ball('end-right', 'metal', 0.0035, 0.0255, 0, -0.0005),
             ],
             { metal: 'metal-silver' })
  + { voxelGrain: 0.002 },

  // A pair of heavy copper hoop earrings 30 mm across lying flat side by side, each with a hinged post across the
  // top of the hoop.
  h.compound('copper_ear', 0.016,
             std.flattenArrays([
               [
                 torus('hoop-%d' % k, 'metal', 0.013, 0.002, 'y', [x, 0.002, 0]),
                 h.box('hinge-%d' % k, 'metal', [x - 0.002, 0, 0.0115], [x + 0.002, 0.0045, 0.0155]),
               ]
               for k in [0, 1]
               for x in [if k == 0 then -0.017 else 0.017]
             ]),
             { metal: 'copper' })
  + { voxelGrain: 0.002 },

  // A copper hairpin 45 mm long lying flat: two slim prongs joined by a rounded bend, one prong crimped in waves so it
  // grips the hair.
  h.compound('copper_hairpin', 0.002,
             h.crescent('bend', 'metal', 0.0015, 0.0035, 180, 360, 6, 0, 0.002, -0.02, 0)
             + [
               h.box('prong-straight', 'metal', [-0.02, 0, 0.0015], [0.025, 0.002, 0.0035]),
             ]
             + [
               h.box('prong-wave-%d' % i, 'metal', [-0.02 + 0.009 * i, 0, if i % 2 == 0 then -0.0035 else -0.0055], [-0.011 + 0.009 * i, 0.002, if i % 2 == 0 then -0.0015 else -0.0035])
               for i in std.range(0, 4)
             ],
             { metal: 'copper' })
  + { voxelGrain: 0.002 },

  // A round copper locket 30 mm across and 7 mm thick lying lid up at +z on a fine chain laid in a ring 160 mm across:
  // a rounded case with a raised ring on the lid, a hinge at the side, a bail at the top and dull green spots of
  // tarnish.
  local R = 0.08, lz = R + 0.004 + 0.015;
  h.compound('copper_locket', 0.028,
             chain('chain', 'metal', R, 64, 0.0028)
             + [
               h.turned('case', 'metal', 'y', [[0, 0], [0, 0.0135], [0.0015, 0.015], [0.0055, 0.015], [0.007, 0.0135], [0.007, 0]], [0, 0, lz]),
               torus('lid-ring', 'metal', 0.01, 0.001, 'y', [0, 0.007, lz], 6),
               h.box('hinge', 'metal', [0.0145, 0.002, lz - 0.004], [0.017, 0.005, lz + 0.004]),
               torus('bail', 'metal', 0.003, 0.001, 'z', [0, 0.004, R + 0.002], 6),
             ]
             + [
               local p = onCircle(c[0], c[1], 0, lz);
               h.disc('spot-%d' % c[1], 'patina', c[2], 0.0068, 0.0074, p[0], p[1])
               for c in [[0.006, 40, 0.0025], [0.011, 200, 0.002], [0.004, 280, 0.0018]]
             ],
             { metal: 'copper', patina: 'paint-green' })
  + { voxelGrain: 0.002 },

  // A copper chain necklace 560 mm long laid in a ring 180 mm across, its links alternately flat and on edge, with a
  // spring-ring clasp and its tab at +z.
  local R = 0.09;
  h.compound('copper_necklace', 0.014,
             chain('chain', 'metal', R, 80, 0.0032)
             + [
               torus('clasp', 'metal', 0.004, 0.0014, 'y', [0, 0.0014, R + 0.004]),
               h.box('clasp-tab', 'metal', [-0.003, 0, R - 0.003], [0.003, 0.0025, R + 0.001]),
             ],
             { metal: 'copper' })
  + { voxelGrain: 0.002 },

  // A bracelet of nine cowrie shells, 18 mm each, threaded slit up on a cotton cord and lying flat in a ring 80 mm
  // across, the cord's ends tied off at -z.
  local R = 0.03;
  h.compound('cowrie_bracelet', 0.0062,
             [torus('cord', 'cord', R, 0.0012, 'y', [0, 0.0012, 0])]
             + std.flattenArrays([cowrie('shell-%d' % i, R, 20 + 320 * i / 8, 0) for i in std.range(0, 8)])
             + [h.box('knot', 'cord', [-0.003, 0, -R - 0.004], [0.003, 0.004, -R + 0.002])],
             { cord: 'cord-cotton', shell: 'bone', slit: 'chitin-brown' })
  + { voxelGrain: 0.002 },
]
