local h = import '../compound.libsonnet';
local box = h.box;

// Costume pieces and onyx jewellery as found on a shelf or the floor: headbands standing on their tips, collars,
// necklaces and bracelets lying flat, rings and tiaras upright, front on +z.

local rad(a) = a * std.pi / 180;

// An upright arc in the x-y plane between radii r0 and r1 over [a0, a1] degrees (0 points to +y, positive towards
// +x), from z0 to z1, built from `steps` convex quads: headbands and bands seen face on.
local arcZ(prefix, slot, r0, r1, a0, a1, steps, z0, z1, cx=0, cy=0) =
  local pt(r, i) = local a = rad(a0 + (a1 - a0) * i / steps); [cx + r * std.sin(a), cy + r * std.cos(a)];
  [
    h.prism('%s-%d' % [prefix, i], slot, 'z', [pt(r1, i), pt(r1, i + 1), pt(r0, i + 1), pt(r0, i)], z0, z1)
    for i in std.range(0, steps - 1)
  ];

// A flat ring lying on y between radii r0 and r1, from y0 to y1.
local ringY(id, slot, r0, r1, y0, y1, x=0, z=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);

// A bead of radius r resting on y0, turned about y.
local bead(id, slot, r, x, y0, z) = h.turned(id, slot, 'y', [[0, 0], [0, r * 0.55], [r * 0.3, r * 0.92], [r, r], [r * 1.7, r * 0.92], [r * 2, r * 0.55], [r * 2, 0]], [x, y0, z]);

// A low dome of radius r and height ht standing on y0: cabochon stones.
local cabochon(id, slot, r, ht, x, y0, z) = h.turned(id, slot, 'y', [[0, 0], [0, r], [ht * 0.5, r * 0.85], [ht, r * 0.4], [ht, 0]], [x, y0, z]);

// A point on the floor plane at radius r and angle a (degrees, 0 towards +z), moved `off` along the tangent, as a
// [z, x] pair for y-axis prisms.
local zx(r, a, off=0) = [r * std.cos(rad(a)) - off * std.sin(rad(a)), r * std.sin(rad(a)) + off * std.cos(rad(a))];

// Points of a convex outline drawn towards its centroid by factor k.
local shrink(pts, k) =
  local n = std.length(pts);
  local c = [std.sum([p[0] for p in pts]) / n, std.sum([p[1] for p in pts]) / n];
  [[c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k] for p in pts];

// Cat-ear headband geometry: arc centre height so the band's tips touch the floor.
local earR = 0.072;
local earCy = earR * -std.cos(rad(115)) + 0.001;
local earAt(r, a) = [r * std.sin(rad(a)), earCy + r * std.cos(rad(a))];
local ear(side) =
  local s = if side == 'l' then -1 else 1;
  local pts = [earAt(earR - 0.004, 16 * s), earAt(earR - 0.004, 54 * s), earAt(earR + 0.05, 30 * s)];
  [
    h.prism('ear-' + side, 'ear', 'z', pts, -0.002, 0.002),
    h.prism('ear-inner-' + side, 'inner', 'z', shrink([pts[0], pts[1], pts[2]], 0.6), 0.002, 0.004),
  ];

// Cat tail: beads along a gentle S on the floor, tapering from root to tip.
local tailN = 70;
local tailAt(i) = local t = i / (tailN - 1); { x: -0.26 + 0.53 * t, z: 0.05 * std.sin(t * 2 * std.pi * 0.9), r: 0.015 - 0.007 * t };

// A gold onyx tiara: a front half circlet whose wall rises to peaks, highest at the middle.
local tiaraR0 = 0.074, tiaraR1 = 0.078, tiaraSteps = 20;
local tiaraHt(i) =
  local a = -80 + 160 * (i + 0.5) / tiaraSteps;
  local swell = std.pow(std.max(0, std.cos(rad(a * 1.05))), 1.5);
  0.01 + 0.032 * swell * (if i % 2 == 0 then 0.55 else 1);
local tiaraStone(id, a, y, r) = h.turned(id, 'stone', 'z', [[0, 0], [0, r], [0.002, r], [0.004, r * 0.5], [0.004, 0]], [tiaraR1 * std.sin(rad(a)), y, tiaraR1 * std.cos(rad(a)) - 0.001]);

[
  // A pair of cat ears on a headband standing on its tips, 150 mm across and 140 mm tall: a thin black plastic band
  // with two pointed glossy leather ears rising from its crown, their inner faces lined in pink.
  h.compound('leather_cat_ears', 0.021,
             arcZ('band', 'band', earR - 0.006, earR, -115, 115, 18, -0.005, 0.005, 0, earCy) + ear('l') + ear('r'),
             { band: 'plastic-matte-black', ear: 'leather-patent', inner: 'plastic-pink' })
  + { voxelGrain: 0.002 },

  // A glossy black leather tail lying on the floor in a loose S, 550 mm long and 30 mm thick at the root, tapering to
  // the tip, with a strap loop at the root for a belt.
  h.compound('leather_cat_tail', 0.15,
             [bead('bead-%d' % i, 'tail', p.r, p.x, 0, p.z) for i in std.range(0, tailN - 1) for p in [tailAt(i)]]
             + h.strapLoop('loop', 'strap', 0.02, 0.012, 0.01, 0.004, 0, -0.29, 0)
             + [h.stud('snap', 'snap', -0.275, 0.004, 0, 0.004, 0.003)],
             { tail: 'leather-patent', strap: 'leather-black', snap: 'metal-silver' })
  + { voxelGrain: 0.004 },

  // A black leather collar lying flat, 135 mm across and 22 mm tall: a closed band buckled at the back, a steel ring
  // at the front with a small bell lying beside it.
  h.compound('leather_collar', 0.068, [
    ringY('band', 'band', 0.061, 0.065, 0, 0.022),
    box('buckle-top', 'metal', [-0.013, 0.02, -0.069], [0.013, 0.024, -0.064]),
    box('buckle-bottom', 'metal', [-0.013, -0.0, -0.069], [0.013, 0.004, -0.064]),
    box('buckle-l', 'metal', [-0.013, 0, -0.069], [-0.009, 0.024, -0.064]),
    box('buckle-r', 'metal', [0.009, 0, -0.069], [0.013, 0.024, -0.064]),
    box('tongue', 'metal', [-0.002, 0.004, -0.069], [0.002, 0.02, -0.066]),
    box('tail', 'band', [0.013, 0.002, -0.068], [0.04, 0.02, -0.064]),
    h.turned('d-ring', 'metal', 'z', [[0, 0.007], [0, 0.011], [0.003, 0.011], [0.003, 0.007], [0, 0.007]], [0, 0.011, 0.065]),
    bead('bell', 'bell', 0.009, 0, 0, 0.088),
    box('bell-slot', 'slot', [-0.006, 0.017, 0.087], [0.006, 0.0185, 0.089]),
  ], { band: 'leather-black', metal: 'metal-silver', bell: 'brass-polished', slot: 'screen-black' })
  + { voxelGrain: 0.002 },

  // A necklace of animal teeth lying flat, 200 mm across: a leather thong loop with nine pointed teeth strung along
  // its front, the longest in the middle.
  h.compound('necklace_teeth', 0.017, [
    ringY('thong', 'thong', 0.083, 0.087, 0, 0.003),
  ] + [
    local a = -60 + 15 * i;
    local len = 0.022 + 0.01 * std.cos(rad(a * 1.4));
    h.prism('tooth-%d' % i, 'tooth', 'y', [zx(0.085, a, -0.0035), zx(0.085, a, 0.0035), zx(0.085 + len * 0.35, a, 0.005), zx(0.085 + len, a), zx(0.085 + len * 0.35, a, -0.005)], 0, 0.006)
    for i in std.range(0, 8)
  ], { thong: 'leather-tan', tooth: 'bone' })
  + { voxelGrain: 0.002 },

  // A gold bangle lying flat, 72 mm across and 4 mm tall, set round its top with six black onyx stones.
  h.compound('onyx_gold_bracelet', 0.03, [
    ringY('band', 'metal', 0.028, 0.036, 0, 0.004),
  ] + [
    cabochon('stone-%d' % i, 'stone', 0.0035, 0.002, 0.032 * std.sin(rad(60 * i)), 0.004, 0.032 * std.cos(rad(60 * i)))
    for i in std.range(0, 5)
  ], { metal: 'metal-gold', stone: 'gem-onyx' })
  + { voxelGrain: 0.002 },

  // A pair of gold cufflinks lying face up, each 16 mm across and 13 mm tall: a round gold face inset with black onyx
  // on a short post over a swivel bar.
  h.compound('onyx_gold_cufflinks', 0.02, std.flattenArrays([
    [
      box('bar-' + s, 'metal', [x - 0.008, 0, -0.002], [x + 0.008, 0.003, 0.002]),
      h.disc('post-' + s, 'metal', 0.002, 0.003, 0.008, x, 0),
      h.disc('face-' + s, 'metal', 0.008, 0.008, 0.011, x, 0),
      h.disc('stone-' + s, 'stone', 0.006, 0.0105, 0.013, x, 0),
    ]
    for s in ['l', 'r']
    for x in [if s == 'l' then -0.012 else 0.012]
  ]), { metal: 'metal-gold', stone: 'gem-onyx' })
  + { voxelGrain: 0.002 },

  // A pair of gold drop earrings lying flat, each 30 mm long: a gold hoop with a gold cap holding a black onyx drop.
  h.compound('onyx_gold_earring', 0.007, std.flattenArrays([
    [
      ringY('hoop-' + s, 'metal', 0.005, 0.007, 0, 0.002, x, 0),
      h.disc('cap-' + s, 'metal', 0.0025, 0, 0.004, x, 0.0085),
      bead('drop-' + s, 'stone', 0.005, x, 0, 0.015),
    ]
    for s in ['l', 'r']
    for x in [if s == 'l' then -0.011 else 0.011]
  ]), { metal: 'metal-gold', stone: 'gem-onyx' })
  + { voxelGrain: 0.002 },

  // A gold chain necklace lying flat in a loop, 140 mm across, with an oval gold pendant at the front set with a
  // domed black onyx.
  h.compound('onyx_gold_pendant_necklace', 0.05, [
    ringY('chain', 'metal', 0.069, 0.071, 0, 0.002),
    box('bail', 'metal', [-0.002, 0, 0.069], [0.002, 0.003, 0.078]),
    h.disc('bezel', 'metal', 0.01, 0, 0.003, 0, 0.087),
    cabochon('stone', 'stone', 0.0075, 0.003, 0, 0.003, 0.087),
  ], { metal: 'metal-gold', stone: 'gem-onyx' })
  + { voxelGrain: 0.002 },

  // A gold ring standing upright, 22 mm across and 26 mm tall: a plain band with a domed black onyx in a raised
  // setting on top.
  h.compound('onyx_gold_ring', 0.007, [
    h.turned('band', 'metal', 'z', [[0, 0.009], [0, 0.011], [0.004, 0.011], [0.004, 0.009], [0, 0.009]], [0, 0.011, -0.002]),
    h.disc('setting', 'metal', 0.0045, 0.02, 0.023, 0, 0),
    cabochon('stone', 'stone', 0.004, 0.003, 0, 0.023, 0),
  ], { metal: 'metal-gold', stone: 'gem-onyx' })
  + { voxelGrain: 0.002 },

  // A gold tiara standing upright, 155 mm across and 42 mm tall at the front: a half circlet rising to a row of
  // points, highest in the middle, set with black onyx stones along its front.
  h.compound('onyx_gold_tiara', 0.2,
             std.flattenArrays([
               h.crescent('wall-%d' % i, 'metal', tiaraR0, tiaraR1, -80 + 160 * i / tiaraSteps, -80 + 160 * (i + 1) / tiaraSteps, 1, 0, tiaraHt(i))
               for i in std.range(0, tiaraSteps - 1)
             ])
             + [tiaraStone('stone-c', 0, 0.026, 0.006)]
             + [tiaraStone('stone-%d' % i, a, 0.008, 0.0035) for i in std.range(0, 3) for a in [[-48, -24, 24, 48][i]]],
             { metal: 'metal-gold', stone: 'gem-onyx' })
  + { voxelGrain: 0.002 },
]
