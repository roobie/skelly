local h = import '../compound.libsonnet';
local box = h.box;
// A curved shell lying along x from `x0` to `x1`, convex side up, its outer radius `r`, `t` thick and spanning `deg`
// degrees of arc centred on the top, its axis at height `ya`. The compound check takes convex outlines only, so the
// arc is built from `n` quads.
local arch(id, slot, r, t, x0, x1, z, deg, ya, n=8) =
  local a = deg * std.pi / 180;
  local p(rad, th) = [ya + rad * std.cos(th), z + rad * std.sin(th)];
  [
    local th0 = -a / 2 + a * i / n, th1 = -a / 2 + a * (i + 1) / n;
    h.prism('%s-%d' % [id, i], slot, 'x', [p(r, th0), p(r, th1), p(r - t, th1), p(r - t, th0)], x0, x1)
    for i in std.range(0, n - 1)
  ];
// A shell whose radius tapers from `r0` at `x0` to `r1` at `x1` in `steps` slices: a thigh narrowing to the knee,
// a calf narrowing to the ankle.
local taper(id, slot, r0, r1, t, x0, x1, z, deg, ya, steps=4) = std.flattenArrays([
  arch('%s-%d' % [id, i], slot, r0 + (r1 - r0) * (i + 0.5) / steps, t, x0 + (x1 - x0) * i / steps, x0 + (x1 - x0) * (i + 1) / steps, z, deg, ya)
  for i in std.range(0, steps - 1)
]);
// A domed cop over a knee, standing on y at (x, y, z).
local cop(id, slot, r, ht, x, y, z) = h.turned(id, slot, 'y', [[0, 0], [0, r], [ht * 0.4, r * 0.85], [ht * 0.8, r * 0.5], [ht, 0]], [x, y, z]);
// The axis height every shell of a leg guard shares, so the plates sit on the chain leg.
local ya = 0.012;
// A leather strap round a shell of radius `r` at x, `w` wide along x, with a buckle high on the outer flank `side`.
// Slots: strap, buckle.
local strap(id, r, x, w, z, side, deg) =
  local za = z + side * r * 0.72, zb = z + side * (r * 0.72 + 0.014);
  [box(id + '-buckle', 'buckle', [x - 0.003, ya + r * 0.62, std.min(za, zb)], [x + w + 0.003, ya + r * 0.62 + 0.016, std.max(za, zb)])]
  + arch(id, 'strap', r + 0.004, 0.004, x, x + w, z, deg, ya);
// One steel leg guard lying along x, hip end at x = 0 and ankle at x = 0.6, convex side up, its outer side toward
// `side` in z. `kind` is 'light', 'standard' or 'heavy': light has a narrow plate down the thigh and another down the
// shin on a chain leg that is bare at the knee; standard has half-round cuisse and greave plates and a domed knee cop
// with a side wing; heavy has thicker, wider plates, a rolled hip edge, two lames below the cuisse, a lame either side
// of the cop and a flare over the ankle. Slots: plate, chain, strap, buckle.
local legGuard(prefix, z, side, kind, strapShift=0) =
  local t = if kind == 'heavy' then 0.006 else 0.004;
  local deg = { light: 120, standard: 180, heavy: 200 }[kind];
  local p(id) = prefix + '-' + id;
  // The chain leg runs the whole length under the plates; ridges across its bare stretches read as rows of rings.
  taper(p('chain'), 'chain', 0.07, 0.046, 0.004, 0.0, 0.6, z, 210, ya, 6)
  + std.flattenArrays([
    arch(p('knee-ring-%d' % i), 'chain', 0.062, 0.003, x, x + 0.005, z, 210, ya)
    for i in std.range(0, 6)
    for x in [0.25 + i * 0.011]
  ])
  + std.flattenArrays([
    arch(p('ankle-ring-%d' % i), 'chain', 0.05, 0.003, x, x + 0.005, z, 210, ya)
    for i in std.range(0, 1)
    for x in [0.575 + i * 0.01]
  ])
  + (if kind == 'light' then
       taper(p('cuisse'), 'plate', 0.076, 0.068, t, 0.03, 0.24, z, deg, ya, 3)
       + taper(p('greave'), 'plate', 0.064, 0.054, t, 0.34, 0.57, z, deg, ya, 4)
     else
       taper(p('cuisse'), 'plate', 0.078, 0.069, t, 0.02, 0.25, z, deg, ya, 3)
       + taper(p('greave'), 'plate', 0.066, 0.054, t, 0.33, 0.58, z, deg, ya, 4)
       + [cop(p('cop'), 'plate', 0.058, 0.08, 0.29, ya + 0.025, z)]
       + [h.prism(p('wing'), 'plate', 'x', [[0.03, z + 0.066 * side], [0.075, z + 0.06 * side], [0.075, z + 0.067 * side], [0.03, z + 0.073 * side]], 0.255, 0.325)])
  + (if kind == 'heavy' then
       arch(p('rim'), 'plate', 0.084, 0.01, 0.0, 0.016, z, deg, ya)
       + arch(p('lame-1'), 'plate', 0.075, t, 0.235, 0.255, z, deg, ya)
       + arch(p('lame-2'), 'plate', 0.07, t, 0.25, 0.265, z, deg, ya)
       + arch(p('lame-3'), 'plate', 0.068, t, 0.315, 0.335, z, deg, ya)
       + taper(p('ankle'), 'plate', 0.054, 0.064, t, 0.57, 0.6, z, deg, ya, 2)
     else [])
  + strap(p('strap-a'), if kind == 'light' then 0.076 else 0.079, 0.08 + strapShift, 0.035, z, side, deg)
  + strap(p('strap-b'), if kind == 'light' then 0.062 else 0.064, 0.4 + strapShift, 0.035, z, side, deg);
// The guards lie close, so their straps are staggered rather than meeting between them.
local legPair(kind) = legGuard('left', -0.08, -1, kind) + legGuard('right', 0.08, 1, kind, 0.05);
local steelFinish = { plate: 'steel-bright', chain: 'steel-mail-dark', strap: 'leather-brown', buckle: 'steel' };

// One improvised shin guard lying flat along x: a split length of plank with a rag pad wrapped round it at each end
// and string lashed round the rags. Slots: wood, rag, string.
local plankGuard(prefix, z, side, shift=0) =
  local p(id) = prefix + '-' + id;
  [
    box(p('plank'), 'wood', [0, 0.004, z - 0.04], [0.26, 0.019, z + 0.04]),
    // The broken end is ragged: two short splinters stand past the square end.
    box(p('splinter-a'), 'wood', [0.26, 0.006, z - 0.035], [0.285, 0.016, z - 0.012]),
    box(p('splinter-b'), 'wood', [0.26, 0.008, z + 0.006], [0.275, 0.017, z + 0.03]),
  ]
  + std.flattenArrays([
    local x0 = [0.03, 0.17][k] + shift, za = z + side * 0.048, zb = z + side * 0.09;
    [
      box(p('rag-%d' % k), 'rag', [x0, 0, z - 0.046], [x0 + 0.06, 0.023, z + 0.046]),
      box(p('string-%d-a' % k), 'string', [x0 + 0.012, 0, z - 0.048], [x0 + 0.016, 0.025, z + 0.048]),
      box(p('string-%d-b' % k), 'string', [x0 + 0.044, 0, z - 0.048], [x0 + 0.048, 0.025, z + 0.048]),
      // The loose ends of the string hang off the outer edge.
      box(p('tail-%d' % k), 'string', [x0 + 0.03, 0, std.min(za, zb)], [x0 + 0.033, 0.003, std.max(za, zb)]),
    ]
    for k in [0, 1]
  ]);
[
  // A pair of improvised shin guards, each a split plank 260 mm long and 80 mm wide, padded and tied on with rags and
  // string at both ends, laid side by side.
  h.compound('two_by_shin_guards', 0.49, plankGuard('left', -0.065, -1) + plankGuard('right', 0.065, 1, 0.02), {
    wood: 'wood-pine',
    rag: 'cloth-rag',
    string: 'cord-cotton',
  }) + { voxelGrain: 0.004 },

  // A pair of light steel leg guards 600 mm long from hip to ankle, each a chain leg with a narrow plate down the
  // thigh and another down the shin, buckled on with leather straps, laid side by side.
  h.compound('leg_guard_steel_light', 4.2, legPair('light'), steelFinish) + { voxelGrain: 0.004 },

  // A pair of steel leg guards 600 mm long: half-round cuisse and greave plates on a chain leg, a domed knee cop
  // with a side wing.
  h.compound('leg_guard_steel', 6.9, legPair('standard'), steelFinish) + { voxelGrain: 0.004 },

  // A pair of heavy steel leg guards 600 mm long: thicker, wider plates than the standard pair, a rolled hip edge,
  // lames above and below the knee cop and a flare over the ankle.
  h.compound('leg_guard_steel_heavy', 9.4, legPair('heavy'), steelFinish) + { voxelGrain: 0.004 },
]
