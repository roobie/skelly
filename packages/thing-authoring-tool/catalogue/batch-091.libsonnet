local h = import '../compound.libsonnet';
local box = h.box;
// A curved shell lying along x from `x0` to `x1`, convex side up, its outer radius `r`, `t` thick and spanning `deg`
// degrees of arc centred on the top, its axis at (`ya`, z); with no `ya` its lower edges rest on the floor. The
// compound check takes convex outlines only, so the arc is built from `n` quads.
local arch(id, slot, r, t, x0, x1, z, deg=180, n=8, ya=null) =
  local a = deg * std.pi / 180, yc = if ya == null then -r * std.cos(a / 2) else ya;
  local p(rad, th) = [yc + rad * std.cos(th), z + rad * std.sin(th)];
  [
    local th0 = -a / 2 + a * i / n, th1 = -a / 2 + a * (i + 1) / n;
    h.prism('%s-%d' % [id, i], slot, 'x', [p(r, th0), p(r, th1), p(r - t, th1), p(r - t, th0)], x0, x1)
    for i in std.range(0, n - 1)
  ];
// A shell whose radius tapers from `r0` at `x0` to `r1` at `x1` in `steps` slices, for a forearm plate narrowing to
// the wrist.
local taper(id, slot, r0, r1, t, x0, x1, z, deg=180, steps=4, ya=null) = std.flattenArrays([
  arch('%s-%d' % [id, i], slot, r0 + (r1 - r0) * (i + 0.5) / steps, t, x0 + (x1 - x0) * i / steps, x0 + (x1 - x0) * (i + 1) / steps, z, deg, 8, ya)
  for i in std.range(0, steps - 1)
]);
// A domed cop over an elbow, standing on y at (x, y, z).
local cop(id, slot, r, ht, x, y, z) = h.turned(id, slot, 'y', [[0, 0], [0, r], [ht * 0.4, r * 0.85], [ht * 0.8, r * 0.5], [ht, 0]], [x, y, z]);
// The axis height every shell of a steel guard shares, so the plates sit on the chain sleeve.
local ya = 0.009;
// A leather strap round a shell of radius `r` at x, `w` wide along x, with a buckle high on the outer flank `side`
// (+1 or -1 in z). Slots: strap, buckle.
local strap(id, r, x, w, z, side, deg) =
  local za = z + side * r * 0.72, zb = z + side * (r * 0.72 + 0.012);
  [box(id + '-buckle', 'buckle', [x - 0.003, ya + r * 0.62, std.min(za, zb)], [x + w + 0.003, ya + r * 0.62 + 0.014, std.max(za, zb)])]
  + arch(id, 'strap', r + 0.004, 0.004, x, x + w, z, deg, 8, ya);
// One steel arm guard lying along x, shoulder end at x = 0 and wrist at x = 0.6, convex side up, its outer side
// toward `side` in z. `kind` is 'light', 'standard' or 'heavy': light has a narrow plate over each half of the arm,
// standard full half-round plates and an elbow cop, heavy thicker plates, a rolled top edge, lames and a flared
// cuff. Slots: plate, chain, strap, buckle.
local steelGuard(prefix, z, side, kind, strapShift=0) =
  local t = if kind == 'heavy' then 0.005 else 0.004;
  local deg = { light: 150, standard: 180, heavy: 190 }[kind];
  local p(id) = prefix + '-' + id;
  // The chain sleeve runs the whole length under the plates; it shows at the elbow and past the plate edges.
  taper(p('sleeve'), 'chain', 0.05, 0.036, 0.004, 0.0, 0.6, z, 200, 6, ya)
  + std.flattenArrays([
    // Ridges across the bare chain read as rows of rings.
    arch(p('ring-%d' % i), 'chain', 0.048, 0.003, x, x + 0.004, z, 200, 8, ya)
    for i in std.range(0, 5)
    for x in [0.235 + i * 0.01]
  ]) + std.flattenArrays([
    arch(p('wrist-ring-%d' % i), 'chain', 0.041, 0.003, x, x + 0.004, z, 200, 8, ya)
    for i in std.range(0, 1)
    for x in [0.583 + i * 0.008]
  ])
  + (if kind == 'light' then
       taper(p('upper'), 'plate', 0.056, 0.053, t, 0.02, 0.22, z, deg, 2, ya)
       + taper(p('lower'), 'plate', 0.05, 0.043, t, 0.31, 0.57, z, deg, 4, ya)
     else
       taper(p('upper'), 'plate', 0.058, 0.054, t, 0.02, 0.24, z, deg, 2, ya)
       + taper(p('lower'), 'plate', 0.052, 0.044, t, 0.29, 0.58, z, deg, 4, ya)
       + [cop(p('cop'), 'plate', 0.046, 0.036, 0.265, ya + 0.034, z)]
       + [h.prism(p('wing'), 'plate', 'x', [[0.02, z + 0.05 * side], [0.06, z + 0.046 * side], [0.06, z + 0.052 * side], [0.02, z + 0.056 * side]], 0.235, 0.295)])
  + (if kind == 'heavy' then
       arch(p('rim'), 'plate', 0.063, 0.008, 0.0, 0.014, z, deg, 8, ya)
       + arch(p('lame-1'), 'plate', 0.062, t, 0.055, 0.095, z, deg, 8, ya)
       + arch(p('lame-2'), 'plate', 0.061, t, 0.135, 0.175, z, deg, 8, ya)
       + taper(p('cuff'), 'plate', 0.047, 0.054, t, 0.56, 0.6, z, deg, 2, ya)
     else [])
  + strap(p('strap-a'), if kind == 'light' then 0.056 else 0.058, 0.09 + strapShift, 0.03, z, side, deg)
  + strap(p('strap-b'), if kind == 'light' then 0.047 else 0.048, 0.43 + strapShift, 0.03, z, side, deg);
// The guards lie close, so their straps are staggered rather than meeting between them.
local steelPair(kind) =
  steelGuard('left', -0.058, -1, kind) + steelGuard('right', 0.058, 1, kind, 0.04);
// One riot arm guard lying along x, elbow end at x = 0 and wrist at x = 0.4, convex side up: a moulded shell with a
// raised spine and ribs, a domed elbow cup, a foam liner showing at the ends and two hook-and-loop straps.
// Slots: shell, trim, liner, strap.
local riotGuard(prefix, z, strapShift=0) =
  local p(id) = prefix + '-' + id, a = 0.008;
  taper(p('liner'), 'liner', 0.044, 0.034, 0.006, 0.0, 0.4, z, 200, 4, a)
  + taper(p('shell'), 'shell', 0.05, 0.04, 0.004, 0.025, 0.37, z, 190, 4, a)
  + [
    box(p('spine'), 'trim', [0.09, a + 0.044, z - 0.007], [0.36, a + 0.054, z + 0.007]),
    cop(p('cup'), 'trim', 0.048, 0.04, 0.055, a + 0.03, z),
  ]
  + std.flattenArrays([
    arch(p('rib-%d' % i), 'trim', 0.053 - i * 0.003, 0.006, x, x + 0.012, z, 150, 8, a)
    for i in std.range(0, 2)
    for x in [0.14 + i * 0.08]
  ])
  + arch(p('strap-a'), 'strap', 0.052, 0.004, 0.11 + strapShift, 0.135 + strapShift, z, 200, 8, a)
  + arch(p('strap-b'), 'strap', 0.046, 0.004, 0.33 + strapShift, 0.355 + strapShift, z, 200, 8, a);
local steelFinish = { plate: 'steel-stainless', chain: 'steel', strap: 'leather-brown', buckle: 'steel' };
[
  // A pair of light steel arm guards 600 mm long, each a chain sleeve from shoulder to wrist with a narrow plate over
  // the upper arm and another tapering down the forearm, buckled on with leather straps, laid side by side.
  h.compound('arm_guard_steel_light', 3.8, steelPair('light'), steelFinish) + { voxelGrain: 0.004 },

  // A pair of steel arm guards 600 mm long, each half-round plates over the upper arm and forearm on a chain sleeve,
  // with a domed cop and a small fan over the elbow.
  h.compound('arm_guard_steel', 5.5, steelPair('standard'), steelFinish) + { voxelGrain: 0.004 },

  // A pair of heavy steel arm guards 600 mm long: thicker plates than the standard pair, a rolled edge at the
  // shoulder, two lames over the upper arm and a cuff flaring over the back of the hand.
  h.compound('arm_guard_steel_heavy', 7.2, steelPair('heavy'), steelFinish) + { voxelGrain: 0.004 },

  // A pair of riot arm guards 400 mm long, black moulded plastic shells over a foam liner, each with a domed elbow
  // cup, a raised spine and two straps, laid side by side.
  h.compound('arm_guard_riot', 0.44, riotGuard('left', -0.052) + riotGuard('right', 0.052, 0.03), {
    shell: 'plastic-charcoal',
    trim: 'ceramic-grey',
    liner: 'felt-grey',
    strap: 'hook-loop-grey',
  }) + { voxelGrain: 0.004 },
]
