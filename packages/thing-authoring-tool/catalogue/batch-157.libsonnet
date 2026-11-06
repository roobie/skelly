local h = import '../compound.libsonnet';
local box = h.box;

// Costume wigs, a clown nose, crowns, an identity tag, a mouthguard, sleeping bags, a tarpaulin, tefillin and a bow
// tie, each as it is found loose on a shelf or the floor, front on +z.

local rad(a) = a * std.pi / 180;
// The [x, z] point at `a` degrees on a circle of radius r round [cx, cz]; 0 points to +z, 90 to +x.
local onCircle(r, a, cx=0, cz=0) = [cx + r * std.sin(rad(a)), cz + r * std.cos(rad(a))];
// A flat convex outline of [x, z] points lying on y from y0 to y1.
local flat(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y0, y1);
// A ball of radius r resting on y0 at [x, z].
local ball(id, slot, r, x, z, y0=0, steps=6) =
  h.turned(id, slot, 'y', [[r * (1 - std.cos(std.pi * i / steps)), r * std.sin(std.pi * i / steps)] for i in std.range(0, steps)], [x, y0, z]);
// An oval outline of `n` points, half-axes a along x and b along z, round [cx, cz].
local oval(a, b, n=16, cx=0, cz=0) = [[cx + a * std.cos(2 * std.pi * i / n), cz + b * std.sin(2 * std.pi * i / n)] for i in std.range(0, n - 1)];
// A flat ring lying on y from y0 to y1 between radii r0 and r1, round [cx, cz].
local ring(id, slot, r0, r1, y0, y1, cx=0, cz=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [cx, y0, cz]);

// A wig cap sitting crown up, rim radius r: a dome of hair over a dark net cap whose rim shows at the bottom.
// Slots: hair, cap.
local wigCap(r, ht) = [
  h.dome('crown', 'hair', r, ht, 0.014),
  ring('rim', 'cap', r - 0.012, r - 0.004, 0, 0.004),
];

// A lock of hair lying on the floor from a root [x0, z0] to a tip [x1, z1], `w0` wide at the root and `w1` at the
// tip, `t` thick.
local lock(id, slot, a, b, w0, w1, t, y0=0) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len, nz = dx / len;
  flat(id, slot, [
    [a[0] + nx * w0 / 2, a[1] + nz * w0 / 2],
    [b[0] + nx * w1 / 2, b[1] + nz * w1 / 2],
    [b[0] - nx * w1 / 2, b[1] - nz * w1 / 2],
    [a[0] - nx * w0 / 2, a[1] - nz * w0 / 2],
  ], y0, y0 + t);

// A gold circlet standing on y: a band of outer radius r and height ht with raised rims at its foot and top edge.
// Slots: gold, rim.
local circlet(r, ht, wall=0.004) = [
  ring('band', 'gold', r - wall, r, 0, ht),
  ring('foot', 'rim', r - wall - 0.001, r + 0.003, 0, 0.006),
  ring('lip', 'rim', r - wall - 0.001, r + 0.003, ht - 0.005, ht),
];

// A small stylised tree rising from a crown band at bearing a: a trunk on the wall, two branches and a round
// canopy set with blossoms on its outer face. Slots: gold, blossom.
local tree(p, r, ht, a, wall=0.004) =
  local span = 3.2;
  local c = onCircle(r - wall / 2, a);
  local o = onCircle(r + 0.008, a);
  h.crescent(p + 'trunk', 'gold', r - wall, r, a - span, a + span, 1, ht - 0.002, ht + 0.03)
  + h.crescent(p + 'bough', 'gold', r - wall, r, a - span * 3.5, a + span * 3.5, 2, ht + 0.012, ht + 0.017)
  + [
    ball(p + 'canopy', 'gold', 0.015, c[0], c[1], ht + 0.022, 6),
    ball(p + 'canopy-l', 'gold', 0.009, onCircle(r - wall / 2, a - 10)[0], onCircle(r - wall / 2, a - 10)[1], ht + 0.012, 4),
    ball(p + 'canopy-r', 'gold', 0.009, onCircle(r - wall / 2, a + 10)[0], onCircle(r - wall / 2, a + 10)[1], ht + 0.012, 4),
    ball(p + 'bloom-a', 'blossom', 0.004, o[0], o[1], ht + 0.03, 4),
    ball(p + 'bloom-b', 'blossom', 0.004, onCircle(r + 0.008, a - 6)[0], onCircle(r + 0.008, a - 6)[1], ht + 0.04, 4),
    ball(p + 'bloom-c', 'blossom', 0.004, onCircle(r + 0.008, a + 6)[0], onCircle(r + 0.008, a + 6)[1], ht + 0.04, 4),
  ];

// A ball chain lying flat in a loop of radius R: `n` beads of radius br.
local ballChain(prefix, slot, R, br, n, cx=0, cz=0) = [
  local p = onCircle(R, 360 * i / n, cx, cz);
  ball('%s-%d' % [prefix, i], slot, br, p[0], p[1], 0, 4)
  for i in std.range(0, n - 1)
];

// An identity tag lying flat, an oval `len` along z centred on [x, z] at height y0: a stamped plate with a rolled
// rim, a hole at its -z end and four lines of stamped text. Slots: tag, rim, text, hole.
local idTag(p, x, z, y0, len=0.05, w=0.029) = [
  flat(p + 'plate', 'tag', oval(w / 2, len / 2, 20, x, z), y0, y0 + 0.002),
  ring(p + 'rim', 'rim', w / 2 - 0.003, w / 2 - 0.001, y0 + 0.002, y0 + 0.003, x, z),
  h.disc(p + 'hole', 'hole', 0.0025, y0 + 0.002, y0 + 0.003, x, z - len / 2 + 0.005),
] + [
  box(p + 'text-%d' % i, 'text', [x - 0.009 + 0.002 * (i % 2), y0 + 0.002, z - 0.012 + 0.008 * i], [x + 0.009 - 0.003 * (i % 3), y0 + 0.003, z - 0.0095 + 0.008 * i])
  for i in std.range(0, 3)
];

// A sleeping bag rolled tight and lying along x, `len` long and radius r, its axis at height r: the wound layers
// show as rings of shell and lining on each end, two compression straps with buckles ring it and a carry strap
// runs over the top between them. Slots: shell, lining, strap, buckle.
local bedRoll(len, r, layers=4) =
  [h.rod('body', 'shell', r, -len / 2 + 0.004, len / 2 - 0.004, r)]
  + std.flattenArrays([
    [
      h.tube('end-%s-%d' % [e, k], if k % 2 == 0 then 'lining' else 'shell', r * k / layers, r * (k + 1) / layers - 0.002, x0, x0 + 0.004, r, 0)
      for k in std.range(0, layers - 1)
    ]
    for e in ['a', 'b']
    for x0 in [if e == 'a' then -len / 2 else len / 2 - 0.004]
  ])
  + std.flattenArrays([
    [
      h.tube('band-%d' % i, 'strap', r - 0.002, r + 0.004, x - 0.0125, x + 0.0125, r, 0),
      box('buckle-%d' % i, 'buckle', [x - 0.018, 2 * r, -0.03], [x + 0.018, 2 * r + 0.008, 0.0]),
    ]
    for i in [0, 1]
    for x in [(i - 0.5) * len * 0.6]
  ])
  + [box('carry', 'strap', [-len * 0.3, 2 * r + 0.004, 0.006], [len * 0.3, 2 * r + 0.008, 0.031])];

// The half-width of the open sleeping bag at z, tapering from the shoulders at z = -0.85 to the foot at z = 1.
local bagHalf(z) = 0.4 - 0.12 * (z + 0.85) / 1.85;

// A coil of strap lying flat round [cx, cz]: `n` turns from radius r0 outward, `w` wide and `t` thick, each turn
// broken where it steps out to the next. Slot strap.
local coil(prefix, cx, cz, r0, n, w, t, step) = std.flattenArrays([
  h.crescent('%s-%d' % [prefix, k], 'strap', r0 + k * step - w / 2, r0 + k * step + w / 2, 20, 350, 18, 0, t, cx, cz)
  for k in std.range(0, n - 1)
]);

[
  // A long blue costume wig sitting crown up, 190 mm across a round cap, its straight hair falling 530 mm behind it
  // as a loose hank: a cut fringe over the face and three layers of locks, the upper ones shorter, wavering and
  // narrowing to the tips.
  h.compound('long_blue_wig', 0.23,
             wigCap(0.095, 0.115)
             + [
               box('fringe', 'hair', [-0.07, 0.035, 0.064], [0.07, 0.085, 0.088]),
               box('fringe-tip', 'hair', [-0.065, 0.022, 0.074], [0.065, 0.04, 0.092]),
             ]
             + std.flattenArrays([
               local n = 7 - 2 * l;
               local half = 0.08 - 0.02 * l;
               local x0 = -half + 2 * half * i / (n - 1);
               local wave = 0.012 * std.sin(i * 2.1 + l * 1.3);
               local root = [x0, -std.sqrt(0.0081 - x0 * x0 * 0.9) + 0.01];
               local mid = [x0 * 0.75 + wave, -0.26 + 0.02 * l];
               local tip = [x0 * 0.8 - wave * 1.5, -0.53 + 0.06 * l + 0.025 * ((i + l) % 3)];
               local y = 0.011 * l;
               [
                 lock('lock-%d-%d-a' % [l, i], 'hair', root, [mid[0], mid[1] - 0.01], 0.034, 0.032, 0.012, y),
                 lock('lock-%d-%d-b' % [l, i], 'hair', [mid[0], mid[1] + 0.01], tip, 0.032, 0.024, 0.012, y),
               ] + (if (i + l) % 2 == 0 then [
                 lock('strand-%d-%d' % [l, i], 'strand', [mid[0] + 0.006, mid[1] + 0.02], [tip[0] * 0.95, tip[1] + 0.04], 0.004, 0.003, 0.0015, y + 0.012),
               ] else [])
               for l in std.range(0, 2)
               for i in std.range(0, 6 - 2 * l)
             ])
             + [
               lock('side-%d' % k, 'hair', onCircle(0.08, 90 + 180 * k), [(1 - 2 * k) * 0.07, -0.2], 0.03, 0.03, 0.012, 0.03)
               for k in std.range(0, 1)
             ],
             { hair: 'cloth-blue', strand: 'cloth-navy', cap: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A red clown nose, a ball 40 mm across with a slit at the back where it pinches on.
  h.compound('clown_nose', 0.003, [
    ball('nose', 'nose', 0.02, 0, 0, 0, 8),
    box('slit', 'slit', [-0.009, 0.014, -0.0195], [0.009, 0.026, -0.016]),
  ], { nose: 'plastic-red', slit: 'plastic-charcoal' })
  + { voxelGrain: 0.002 },

  // A clown wig sitting crown up, 300 mm across: a bald pink crown between two big puffs of curls and a ring of
  // curls round the back, in bright colours.
  local colours = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
  h.compound('clown_wig', 0.2,
             [
               h.dome('crown', 'skin', 0.085, 0.08, 0.014),
               ring('rim', 'cap', 0.073, 0.081, 0, 0.004),
             ]
             + [
               local a = 70 + 220 * i / 13;
               local p = onCircle(0.095, a);
               ball('curl-%d' % i, colours[i % 6], 0.034 + 0.006 * (i % 2), p[0], p[1], 0.0)
               for i in std.range(0, 13)
             ]
             + [
               local a = 95 + 170 * i / 8;
               local p = onCircle(0.07, a);
               ball('upper-%d' % i, colours[(i + 3) % 6], 0.03, p[0], p[1], 0.04)
               for i in std.range(0, 8)
             ]
             + [
               ball('puff-%s-%d' % [s, i], colours[(i + (if s == 'l' then 0 else 2)) % 6], 0.032, (if s == 'l' then -1 else 1) * (0.115 + 0.02 * (i % 2)), -0.02 + 0.03 * (i - 1), 0.03 + 0.02 * (i % 2))
               for s in ['l', 'r']
               for i in [0, 1, 2]
             ],
             { skin: 'plastic-pink', cap: 'cloth-white', red: 'cloth-red', orange: 'cloth-orange', yellow: 'cloth-yellow', green: 'cloth-green', blue: 'cloth-blue', purple: 'cloth-purple' })
  + { voxelGrain: 0.004 },
  // A golden crown standing upright, 190 mm across and 95 mm tall: a 40 mm band between raised rims, with eight
  // small flowering trees rising from it, their canopies set with red blossoms, and a red stone in the band between
  // each pair of trees.
  h.compound('crown_golden', 1.9,
             circlet(0.095, 0.04)
             + std.flattenArrays([tree('tree-%d-' % i, 0.095, 0.04, 45 * i) for i in std.range(0, 7)])
             + [
               local p = onCircle(0.096, 45 * i + 22.5);
               ball('stone-%d' % i, 'stone', 0.006, p[0], p[1], 0.014, 4)
               for i in std.range(0, 7)
             ],
             { gold: 'metal-gold', rim: 'brass-polished', blossom: 'gem-red', stone: 'gem-red' })
  + { voxelGrain: 0.002 },

  // A heavy golden crown standing upright, 200 mm across and 115 mm tall: a 45 mm band between raised rims, set
  // round with red, blue and green stones, and eight tall stepped points each tipped with a gold ball.
  local survivorStones = ['red', 'blue', 'green'];
  h.compound('crown_golden_survivor', 1.8,
             circlet(0.1, 0.045, 0.005)
             + std.flattenArrays([
               h.crescent('point-%d-%d' % [i, k], 'gold', 0.095, 0.1, i * 45 - 14 + 13 * k / 8, i * 45 + 14 - 13 * k / 8, 2, 0.044 + 0.0075 * k, 0.044 + 0.0075 * (k + 1))
               for i in std.range(0, 7)
               for k in std.range(0, 7)
             ])
             + [
               local p = onCircle(0.0975, 45 * i);
               ball('tip-%d' % i, 'rim', 0.007, p[0], p[1], 0.104, 4)
               for i in std.range(0, 7)
             ]
             + [
               local p = onCircle(0.1, 22.5 * i);
               ball('stone-%d' % i, survivorStones[i % 3], 0.0075, p[0], p[1], 0.015, 4)
               for i in std.range(0, 15)
             ],
             { gold: 'metal-gold', rim: 'brass-polished', red: 'gem-red', blue: 'gem-blue', green: 'gem-green' })
  + { voxelGrain: 0.002 },

  // A pair of steel identity tags on a ball chain lying in a loop, 180 mm across: two 50 by 29 mm stamped tags
  // overlapping at the front, the second hung from a short loop of chain.
  h.compound('dog_tag', 0.016,
             ballChain('chain', 'chain', 0.09, 0.0022, 110, 0, 0)
             + ballChain('short', 'chain', 0.018, 0.002, 22, -0.006, 0.105)
             + idTag('a-', 0.008, 0.118, 0.0)
             + idTag('b-', -0.016, 0.135, 0.003),
             { chain: 'steel-stainless', tag: 'steel-stainless', rim: 'steel-grey', text: 'steel-grey', hole: 'plastic-charcoal' })
  + { voxelGrain: 0.002 },

  // A sports mouthguard lying flat, 70 mm across and 60 mm deep: a horseshoe channel moulded to the upper teeth,
  // open on top, with a tether tab at the front.
  h.compound('mouthpiece', 0.017,
             h.crescent('floor', 'guard', 0.016, 0.034, -95, 95, 16, 0, 0.004)
             + h.crescent('outer', 'guard', 0.03, 0.035, -95, 95, 16, 0, 0.02)
             + h.crescent('inner', 'guard', 0.016, 0.02, -95, 95, 16, 0, 0.013)
             + [
               box('arm-%s-floor' % s, 'guard', [if s == 'l' then -0.034 else 0.016, 0, -0.028], [if s == 'l' then -0.016 else 0.034, 0.004, 0.002])
               for s in ['l', 'r']
             ]
             + [
               box('arm-%s-outer' % s, 'guard', [if s == 'l' then -0.035 else 0.03, 0, -0.028], [if s == 'l' then -0.03 else 0.035, 0.018, 0.002])
               for s in ['l', 'r']
             ]
             + [
               box('arm-%s-inner' % s, 'guard', [if s == 'l' then -0.02 else 0.016, 0, -0.026], [if s == 'l' then -0.016 else 0.02, 0.011, 0.002])
               for s in ['l', 'r']
             ]
             + [
               box('tab', 'tab', [-0.006, 0.004, 0.034], [0.006, 0.01, 0.044]),
               ring('tab-hole', 'hole', 0.0, 0.0025, 0.01, 0.0105, 0, 0.04),
             ],
             { guard: 'plastic-clear-blue', tab: 'plastic-blue', hole: 'plastic-charcoal' })
  + { voxelGrain: 0.002 },

  // A black bow tie lying flat, 130 mm across the bow and 60 mm tall: two pleated wings either side of a wrapped
  // knot, its neckband laid out in a loop behind with a sliding adjuster.
  h.compound('tie_bow', 0.02,
             [
               flat('wing-%s' % s, 'bow', [[k * 0.009, -0.011], [k * 0.058, -0.029], [k * 0.065, 0], [k * 0.058, 0.029], [k * 0.009, 0.011]], 0.002, 0.01)
               for s in ['l', 'r']
               for k in [if s == 'l' then -1 else 1]
             ]
             + [
               box('pleat-%s-%d' % [s, i], 'pleat', [if s == 'l' then -0.05 else 0.012, 0.01, -0.004 + 0.008 * (i - 0.5) * 1.6], [if s == 'l' then -0.012 else 0.05, 0.011, -0.002 + 0.008 * (i - 0.5) * 1.6])
               for s in ['l', 'r']
               for i in [0, 1]
             ]
             + [box('knot', 'bow', [-0.011, 0.002, -0.015], [0.011, 0.014, 0.015])]
             + h.strapLoop('band', 'band', 0.06, 0.05, 0.012, 0.002, 0, 0, -0.05)
             + [box('adjuster', 'slide', [-0.012, 0.002, -0.108], [0.012, 0.004, -0.092])],
             { bow: 'satin-black', pleat: 'cloth-charcoal', band: 'cloth-black', slide: 'metal-silver' })
  + { voxelGrain: 0.002 },
  // A fur-lined sleeping bag laid out flat and open, 2 m long and 800 mm across the shoulders: a quilted olive shell
  // tapering to the foot, a rounded hood, and the top corner turned back to show the fur lining. A zip runs down the
  // right side.
  h.compound('sleeping_bag_fur', 2.2,
             [
               flat('body', 'shell', [[-0.4, -0.85], [0.4, -0.85], [0.28, 1.0], [-0.28, 1.0]], 0, 0.05),
               flat('hood', 'shell', [onCircle(0.4, 90 + 180 * i / 12, 0, -0.85) for i in std.range(0, 12)], 0, 0.06),
               flat('mouth', 'fur', oval(0.24, 0.13, 16, 0, -0.86), 0.06, 0.066),
               flat('turned-back', 'fur', [[0.0, -0.86], [0.4, -0.85], [0.4, -0.25]], 0.05, 0.068),
               lock('zip', 'zip', [0.375, -0.25], [0.265, 0.97], 0.012, 0.012, 0.004, 0.05),
             ]
             + [
               local z = -0.6 + 0.2 * i;
               box('baffle-%d' % i, 'baffle', [-bagHalf(z) + 0.01, 0.05, z], [(if z < -0.25 then 0 else bagHalf(z) - 0.03), 0.053, z + 0.012])
               for i in std.range(0, 7)
             ],
             { shell: 'cloth-olive-drab', baffle: 'webbing-olive-dark', fur: 'fur-pale', zip: 'plastic-matte-black' })
  + { voxelGrain: 0.008 },

  // The fur-lined sleeping bag rolled tight, 450 mm long and 260 mm across, the fur showing in rings on its ends,
  // two black compression straps round it and a carry strap over the top.
  h.compound('sleeping_bag_fur_roll', 3, bedRoll(0.45, 0.13, 5),
             { shell: 'cloth-olive-drab', lining: 'fur-pale', strap: 'webbing-black', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A plain sleeping bag rolled tight, 400 mm long and 200 mm across, a navy shell wound round a grey flannel lining,
  // with two black compression straps and a carry strap.
  h.compound('sleeping_bag_roll', 1.1, bedRoll(0.4, 0.1, 4),
             { shell: 'cloth-navy', lining: 'wool-grey', strap: 'webbing-black', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A blue plastic tarpaulin folded into a 400 by 300 mm stack, 60 mm thick: a reinforced hem with three metal
  // grommets runs along the top fold's edge, and a corner patch.
  h.compound('tarp', 1.2,
             h.foldedGarment(0.4, 0.3, 0.06, 5)
             + [
               box('hem', 'hem', [0.16, 0.06, -0.15], [0.2, 0.063, 0.15]),
               flat('patch', 'hem', [[0.12, 0.15], [0.2, 0.15], [0.2, 0.07]], 0.06, 0.064),
             ]
             + [
               ring('grommet-%d' % i, 'grommet', 0.004, 0.009, 0.063, 0.066, 0.18, -0.1 + 0.1 * i)
               for i in std.range(0, 2)
             ],
             { cloth: 'plastic-blue', hem: 'cloth-navy', grommet: 'steel-galvanised' })
  + { voxelGrain: 0.004 },

  // An arm tefillin as it is put away: a black leather cube 32 mm across on a square base 44 mm across, with a
  // loop at the back where the strap passes through and a small knot beside it, its long strap wound in a flat coil
  // beside the box with the end trailing.
  h.compound('tefillin_arm', 0.046,
             [
               box('base', 'box', [-0.022, 0, -0.022], [0.022, 0.006, 0.022]),
               box('bridge', 'box', [-0.012, 0, -0.042], [0.012, 0.012, -0.022]),
               box('house', 'box', [-0.016, 0.006, -0.016], [0.016, 0.038, 0.016]),
               box('knot', 'strap', [-0.008, 0, -0.05], [0.008, 0.014, -0.042]),
               box('lead', 'strap', [-0.005, 0, -0.06], [0.08, 0.003, -0.05]),
               box('tail', 'strap', [0.13, 0, 0.02], [0.2, 0.003, 0.03]),
             ]
             + coil('coil', 0.085, -0.005, 0.016, 4, 0.01, 0.004 + 0.002, 0.012),
             { box: 'leather-patent', strap: 'leather-black' })
  + { voxelGrain: 0.002 },

  // A head tefillin laid out flat: a black leather box 30 mm across of four ridged compartments on a 40 mm base,
  // threaded on a strap loop sized to the head, knotted at the back, with the two long ends trailing out behind.
  h.compound('tefillin_head', 0.038,
             [
               box('base', 'box', [-0.02, 0, -0.02], [0.02, 0.006, 0.02]),
               box('bridge', 'box', [-0.012, 0, -0.042], [0.012, 0.012, -0.02]),
             ]
             + [
               box('cell-%d' % i, 'box', [-0.015 + 0.0076 * i, 0.006, -0.015], [-0.015 + 0.0076 * i + 0.0064, 0.034, 0.015])
               for i in std.range(0, 3)
             ]
             + h.crescent('loop', 'strap', 0.084, 0.094, 0, 360, 36, 0, 0.003, 0, -0.13)
             + [
               box('knot', 'strap', [-0.012, 0, -0.238], [0.012, 0.012, -0.218]),
               lock('end-l', 'strap', [-0.006, -0.232], [-0.11, -0.62], 0.01, 0.01, 0.003),
               lock('end-r', 'strap', [0.006, -0.232], [0.07, -0.64], 0.01, 0.01, 0.003),
             ],
             { box: 'leather-patent', strap: 'leather-black' })
  + { voxelGrain: 0.002 },
]
