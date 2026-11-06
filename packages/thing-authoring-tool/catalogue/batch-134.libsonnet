local h = import '../compound.libsonnet';
local box = h.box;
local rad(deg) = deg * std.pi / 180;

// An ellipse outline [[x, z]...], `a` across x and `b` along z, centred on z = cz.
local ell(a, b, cz=0, n=28) = [[a * std.cos(2 * std.pi * k / n), cz + b * std.sin(2 * std.pi * k / n)] for k in std.range(0, n - 1)];

// The ellipse with its front point pushed `tip` further forward, for a pointed visor or prow.
local prow(a, b, cz, tip) = [if k == 7 then [0, cz + b + tip] else ell(a, b, cz)[k] for k in std.range(0, 27) if k != 6 && k != 8];

// The part of a convex [x, z] outline where nx * x + nz * z <= c, without repeated points.
local clip(poly, nx, nz, c) =
  local n = std.length(poly);
  local d(p) = nx * p[0] + nz * p[1] - c;
  local raw = std.flattenArrays([
    local p = poly[i];
    local q = poly[(i + 1) % n];
    (if d(p) <= 0 then [p] else [])
    + (if (d(p) < 0 && d(q) > 0) || (d(p) > 0 && d(q) < 0) then [[p[0] + (q[0] - p[0]) * d(p) / (d(p) - d(q)), p[1] + (q[1] - p[1]) * d(p) / (d(p) - d(q))]] else [])
    for i in std.range(0, n - 1)
  ]);
  local m = std.length(raw);
  [raw[i] for i in std.range(0, m - 1) if m > 0 && (std.abs(raw[i][0] - raw[(i + 1) % m][0]) > 1e-5 || std.abs(raw[i][1] - raw[(i + 1) % m][1]) > 1e-5)];

local area(poly) =
  local n = std.length(poly);
  if n < 3 then 0 else std.abs(std.sum([poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in std.range(0, n - 1)])) / 2;

// A convex [x, z] outline standing on y from y0 to y1, or nothing when the outline is empty.
local slab(id, slot, poly, y0, y1) = if area(poly) > 2e-6 then [h.prism(id, slot, 'y', [[p[1], p[0]] for p in poly], y0, y1)] else [];

// Heights from y0 to y1 in n even steps.
local steps(y0, y1, n) = [y0 + (y1 - y0) * i / n for i in std.range(0, n - 1)];
// Heights up a dome from y0, `ht` high, in n steps even in angle, so the slabs thin where the dome turns in.
local domeSteps(y0, ht, n) = [y0 + ht * std.sin(rad(90 * i / n)) for i in std.range(0, n)];
// How far a dome of height `ht` rising from y0 has drawn in at height y, as a share of its rim.
local domeScale(y0, ht, y) = std.sqrt(std.max(0, 1 - std.pow((y - y0) / ht, 2)));

// A helmet shell stacked from elliptical slabs at heights `ys`, front on +z. `f(y)` gives [a, b, cz] for the slab
// about height y; `cuts(y)` gives the slab's cuts, sorted along x and not overlapping. Within a cut's x0..x1 the
// shell gives way to `fill` (nothing when null) between z0 and z1, and to `below` behind z0. Prisms must be convex,
// so each slab is split at the cuts. Slot: `slot`, plus the cuts' own.
local shell(prefix, ys, f, cuts=function(y) [], slot='shell') = std.flattenArrays([
  local y0 = ys[i];
  local y1 = ys[i + 1];
  local e = f((y0 + y1) / 2);
  local poly = ell(e[0], e[1], e[2]);
  local cs = cuts((y0 + y1) / 2);
  local edges = [-1] + std.flattenArrays([[c.x0, c.x1] for c in cs]) + [1];
  std.flattenArrays([
    slab('%s-%d-%d' % [prefix, i, j], slot, clip(clip(poly, -1, 0, -edges[2 * j]), 1, 0, edges[2 * j + 1]), y0, y1)
    for j in std.range(0, std.length(cs))
  ]) + std.flattenArrays([
    local c = cs[j];
    local band = clip(clip(poly, -1, 0, -c.x0), 1, 0, c.x1);
    slab('%s-%d-b%d' % [prefix, i, j], c.below, clip(band, 0, 1, c.z0), y0, y1)
    + (if c.fill == null then [] else slab('%s-%d-f%d' % [prefix, i, j], c.fill, clip(clip(band, 0, -1, -c.z0), 0, 1, c.z1), y0, y1))
    + slab('%s-%d-a%d' % [prefix, i, j], slot, clip(band, 0, -1, -c.z1), y0, y1)
    for j in std.range(0, std.length(cs) - 1)
  ])
  for i in std.range(0, std.length(ys) - 2)
]);
// A face opening from x0 to x1, back to z = zr. The opening is filled flush with the dark inside, because the iso
// tile looks at the face side-on and a recess hides behind its own edges there.
local face(x0, x1, zr, inside='inside') = { x0: x0, x1: x1, z0: zr, z1: 1, fill: inside, below: inside };
// A band of the shell from x0 to x1 and z0 to z1 that is `fill` instead, or open when null.
local patch(x0, x1, z0, z1, fill, slot='shell') = { x0: x0, x1: x1, z0: z0, z1: z1, fill: fill, below: slot };

// A skull: straight walls `a` by `b` to y1, then a dome `ht` high.
local skull(a, b, cz, y1, ht) = function(y) if y < y1 then [a, b, cz] else local s = domeScale(y1, ht, y); [a * s, b * s, cz];

// A raised keel `out` proud of a dome front to back, `w` thick: the dome rises `ht` from yBase over half-length b.
local keel(id, slot, b, cz, yBase, ht, out, w, a0=12, a1=168, n=12) =
  h.prism(id, slot, 'x', [
    [yBase + (ht + out) * std.sin(rad(a0 + (a1 - a0) * i / n)), cz + (b + out) * std.cos(rad(a0 + (a1 - a0) * i / n))]
    for i in std.range(0, n)
  ], -w / 2, w / 2);

// A strap `w` wide lying on y from y0 to y1 between [xa, za] and [xb, zb].
local strip(id, slot, pa, pb, w, y0, y1) =
  local dx = pb[0] - pa[0], dz = pb[1] - pa[1], len = std.sqrt(dx * dx + dz * dz), nx = -dz / len * w / 2, nz = dx / len * w / 2;
  slab(id, slot, [[pa[0] + nx, pa[1] + nz], [pb[0] + nx, pb[1] + nz], [pb[0] - nx, pb[1] - nz], [pa[0] - nx, pa[1] - nz]], y0, y1);

// A closed ring turned about y from y0 to y1 between radii r0 and r1, centred on (x, z).
local ring(id, slot, r0, r1, y0, y1, x=0, z=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);

// A disc on the side of a head at x = ±xs, axis x, from `depth` inside the face to `t` proud of it.
local sideDisc(id, slot, s, xs, y, z, r, depth, t) = h.turned(id, slot, 'x', [[0, 0], [0, r], [depth + t, r], [depth + t, 0]], [if s > 0 then xs - depth else -xs - t, y, z]);

// A half-oval peak reaching forward from radius `r` on the crown to `reach` at the front, `half` wide.
local bill(id, slot, r, reach, half, y0, y1, n=8) =
  slab(id, slot, [
    [half * std.cos(rad(180 * i / n)), r * 0.2 + (reach - r * 0.2) * std.sin(rad(180 * i / n))]
    for i in std.range(0, n)
  ], y0, y1);

// Rivet heads round an ellipse a by b about cz at height y, at the given angles (0 points to +z).
local rivetRow(prefix, slot, a, b, cz, y, angles, r=0.004) = [
  local t = rad(angles[i]);
  h.disc('%s-%d' % [prefix, i], slot, r, y - r, y + r, (a + 0.001) * std.sin(t), cz + (b + 0.001) * std.cos(t))
  for i in std.range(0, std.length(angles) - 1)
];

// The y-height of a dome's face over (x, z): walls a by b to y1, dome ht high.
local domeY(a, b, cz, y1, ht, x, z) = y1 + ht * std.sqrt(std.max(0, 1 - std.pow(x / a, 2) - std.pow((z - cz) / b, 2)));

// ---- Shapes ----

local barbute = {
  f: skull(0.1, 0.122, -0.004, 0.175, 0.115),
  ys: steps(0, 0.175, 14) + domeSteps(0.175, 0.115, 10),
  cuts(y): if y < 0.115 then local w = 0.026 + 0.01 * y / 0.115; [face(-w, w, 0.06)]
  else if y < 0.165 then local w = 0.036 + 0.04 * (y - 0.115) / 0.05; [face(-w, w, 0.06)]
  else [],
};

local closeHelm = {
  f(y): if y < 0.03 then [0.106, 0.124, 0]
  else if y < 0.13 then [0.098, 0.124, 0.006]
  else skull(0.098, 0.118, 0, 0.185, 0.115)(y),
  ys: steps(0, 0.03, 2) + steps(0.03, 0.13, 8) + steps(0.13, 0.185, 5) + domeSteps(0.185, 0.115, 10),
  cuts(y): if y > 0.135 && y < 0.185 then [face(-0.072, 0.072, 0.03)] else [],
};

local sparring = {
  f: skull(0.104, 0.118, 0, 0.14, 0.09),
  ys: steps(0, 0.14, 12) + domeSteps(0.14, 0.09, 8),
  cuts(y): if y > 0.045 && y < 0.165 then [face(-0.074, 0.074, -0.01)] else [],
};

local ach = {
  f: skull(0.114, 0.138, 0, 0.05, 0.118),
  ys: steps(0, 0.05, 4) + domeSteps(0.05, 0.118, 10),
  cuts(y): if y < 0.03 then [face(-0.085, 0.085, 0.07)] else [],
};

local flak = {
  f(y): if y < 0.012 then [0.124, 0.139, 0] else skull(0.108 + 0.006 * std.max(0, 1 - (y - 0.012) / 0.048), 0.123 + 0.006 * std.max(0, 1 - (y - 0.012) / 0.048), 0, 0.06, 0.112)(y),
  ys: [0, 0.006] + steps(0.012, 0.06, 4) + domeSteps(0.06, 0.112, 10),
};

local eagle = {
  f: skull(0.11, 0.13, 0, 0.17, 0.1),
  ys: steps(0, 0.17, 14) + domeSteps(0.17, 0.1, 9),
  cuts(y): if y > 0.05 && y < 0.165 then [face(-0.072, 0.072, 0.02)] else [],
};

local batting = {
  f: skull(0.102, 0.122, 0, 0.12, 0.092),
  ys: steps(0, 0.12, 10) + domeSteps(0.12, 0.092, 9),
  cuts(y): if y < 0.03 then [patch(-0.068, 0.068, -1, 1, null, 'shell')]
  else if y < 0.085 then [face(-0.072, 0.072, 0.03)]
  else [],
};

local bike = {
  local vents = [[-0.062, -0.046], [-0.024, -0.01], [0.01, 0.024], [0.046, 0.062]],
  f(y): if y < 0.03 then [0.1, 0.13, -0.008] else skull(0.1, 0.13, -0.008, 0.03, 0.12)(y),
  ys: steps(0, 0.03, 3) + domeSteps(0.03, 0.12, 12),
  cuts(y): if y > 0.07 then [patch(v[0], v[1], -0.1, 0.09, 'inside') for v in vents] else [],
};

local bronzeHelm = {
  local holes = [[-0.042, -0.032], [-0.018, -0.008], [0.008, 0.018], [0.032, 0.042]],
  f(y): if y < 0.014 then [0.106, 0.128, -0.004] else skull(0.1, 0.122, -0.004, 0.17, 0.11)(y),
  ys: [0] + steps(0.014, 0.17, 13) + domeSteps(0.17, 0.11, 10),
  cuts(y): if y > 0.145 && y < 0.165 then [face(-0.086, 0.086, 0.03)]
  else if y > 0.07 && y < 0.082 then [face(c[0], c[1], 0.06) for c in holes]
  else [],
};

local corinthian = {
  f(y): if y < 0.14 then [0.1, 0.132, -0.004] else skull(0.1, 0.126, -0.004, 0.18, 0.105)(y),
  ys: steps(0, 0.14, 12) + steps(0.14, 0.18, 4) + domeSteps(0.18, 0.105, 10),
  cuts(y): if y > 0.13 && y < 0.172 then [face(-0.084, -0.013, 0.03), face(0.013, 0.084, 0.03)]
  else if y < 0.13 then local w = 0.018 + 0.014 * (1 - y / 0.13); [face(-w, w, 0.06)]
  else [],
};

local chitin(open) = {
  local mouth = [[-0.032, -0.024], [-0.014, -0.006], [0.006, 0.014], [0.024, 0.032]],
  f: skull(0.105, 0.126, 0, 0.17, 0.11),
  ys: steps(0, 0.17, 14) + domeSteps(0.17, 0.11, 10),
  cuts(y): if open then (if y > 0.04 && y < 0.168 then [face(-0.064, 0.064, 0.0)] else [])
  else if y > 0.13 && y < 0.168 then [face(-0.07, -0.018, 0.04), face(0.018, 0.07, 0.04)]
  else if y > 0.045 && y < 0.09 then [face(m[0], m[1], 0.07) for m in mouth]
  else [],
};

local football = {
  f: skull(0.116, 0.14, -0.012, 0.13, 0.105),
  ys: steps(0, 0.13, 11) + domeSteps(0.13, 0.105, 10),
  cuts(y): if y < 0.165 then [face(-0.076, 0.076, 0.02)]
  else if y > 0.175 then [patch(-0.012, 0.012, -1, 1, 'stripe')]
  else [],
};

local galea = {
  f: skull(0.1, 0.116, -0.006, 0.15, 0.1),
  ys: steps(0.08, 0.15, 6) + domeSteps(0.15, 0.1, 10),
};

[
  // A barbute standing upright, front on +z, 290 mm tall, 200 mm across and 245 mm front to back: a close steel skull
  // reaching down to the neck, with a Y-shaped opening for the eyes, nose and mouth, a low keel and a row of liner
  // rivets.
  h.compound('helmet_barbute', 2.5,
             shell('skull', barbute.ys, barbute.f, barbute.cuts)
             + [keel('keel', 'shell', 0.122, -0.004, 0.175, 0.115, 0.006, 0.006)]
             + rivetRow('rivet', 'rivet', 0.1, 0.122, -0.004, 0.16, [-150, -120, -90, -60, 60, 90, 120, 150, 180]),
             { shell: 'steel-grey', inside: 'cloth-black', rivet: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // A light close helm with its visor raised, standing upright, front on +z, 300 mm tall and 260 mm front to back: a
  // rounded skull with a keel, a jutting bevor over the chin, a short gorget flare at the neck and the pointed visor
  // swung up over the brow on a pivot each side, leaving the face open.
  h.compound('hc_lighthelm_close_raised', 3.5,
             shell('skull', closeHelm.ys, closeHelm.f, closeHelm.cuts)
             + [keel('keel', 'shell', 0.118, 0, 0.185, 0.115, 0.01, 0.006)]
             + slab('visor-low', 'visor', clip(prow(0.104, 0.136, 0, 0.018), 0, -1, 0), 0.188, 0.21)
             + slab('visor-high', 'visor', clip(prow(0.092, 0.124, 0, 0.014), 0, -1, 0), 0.21, 0.232)
             + [box('slit-%d' % i, 'inside', [-0.06, 0.202 + i * 0.012, 0.11], [-0.008, 0.206 + i * 0.012, 0.13]) for i in [0, 1]]
             + [box('slit-r%d' % i, 'inside', [0.008, 0.202 + i * 0.012, 0.11], [0.06, 0.206 + i * 0.012, 0.13]) for i in [0, 1]]
             + [h.rod('pivot', 'rivet', 0.01, -0.108, 0.108, 0.198)]
             + rivetRow('rivet', 'rivet', 0.098, 0.124, 0.006, 0.11, [-120, -60, 60, 120]),
             { shell: 'steel-blued', visor: 'steel-blued', inside: 'cloth-black', rivet: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // Sparring headgear standing upright, front on +z, 230 mm tall: a padded leather hood with a wide face opening, a
  // chin bar, a brow roll, a ringed ear pad each side and laces up the back.
  h.compound('headgear', 0.55,
             shell('hood', sparring.ys, sparring.f, sparring.cuts, 'pad')
             + slab('brow', 'trim', clip(ell(0.11, 0.126, 0), 0, -1, -0.06), 0.165, 0.185)
             + slab('chin', 'trim', clip(ell(0.11, 0.126, 0), 0, -1, -0.06), 0.0, 0.045)
             + std.flattenArrays([
               [
                 h.turned('ear-pad-%d' % s, 'trim', 'x', [[0, 0.016], [0, 0.034], [0.012, 0.034], [0.012, 0.016], [0, 0.016]], [if s > 0 then 0.098 else -0.11, 0.095, -0.005]),
                 sideDisc('ear-hole-%d' % s, 'inside', s, 0.104, 0.095, -0.005, 0.016, 0.006, 0.002),
               ]
               for s in [-1, 1]
             ])
             + [box('lace-%d' % i, 'trim', [-0.02, 0.05 + i * 0.022, -0.124], [0.02, 0.056 + i * 0.022, -0.114]) for i in std.range(0, 4)]
             + [box('lace-gap', 'inside', [-0.004, 0.05, -0.122], [0.004, 0.15, -0.115])],
             { pad: 'leather-red', trim: 'vinyl-black', inside: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A combat helmet standing on its rim, front on +z, 290 mm front to back and 175 mm tall: a tan composite shell cut
  // high at the brow, an accessory rail along each side, a night-vision shroud at the front, and a chinstrap with a
  // cup lying on the floor in front.
  h.compound('helmet_army', 1.4,
             shell('shell', ach.ys, ach.f, ach.cuts)
             + std.flattenArrays([
               [
                 box('rail-%d' % s, 'rail', [if s > 0 then 0.104 else -0.12, 0.05, -0.05], [if s > 0 then 0.12 else -0.104, 0.064, 0.04]),
                 box('strap-%d' % s, 'strap', [if s > 0 then 0.104 else -0.116, 0, -0.014], [if s > 0 then 0.116 else -0.104, 0.05, 0.01]),
               ] + strip('strap-floor-%d' % s, 'strap', [s * 0.11, 0.0], [s * 0.03, 0.15], 0.02, 0, 0.003)
               for s in [-1, 1]
             ])
             + [
               box('cup', 'strap', [-0.04, 0, 0.142], [0.04, 0.012, 0.166]),
               box('shroud', 'rail', [-0.022, 0.088, 0.112], [0.022, 0.118, 0.13]),
               box('shroud-plate', 'rail', [-0.012, 0.094, 0.13], [0.012, 0.112, 0.134]),
             ],
             { shell: 'polymer-fde', inside: 'cloth-black', rail: 'polymer-black', strap: 'nylon-coyote' })
  + { voxelGrain: 0.004 },

  // A steel flak helmet standing on its rim, front on +z, 280 mm front to back and 175 mm tall: a round pot with a
  // flared, rolled rim and a leather chinstrap lying out in front with its buckle.
  h.compound('helmet_army_outdated', 1.2,
             shell('pot', flak.ys, flak.f)
             + std.flattenArrays([
               [box('bail-%d' % s, 'strap', [if s > 0 then 0.112 else -0.122, 0.0, -0.012], [if s > 0 then 0.122 else -0.112, 0.05, 0.012])]
               + strip('strap-%d' % s, 'strap', [s * 0.118, 0.0], [s * 0.03, 0.16], 0.02, 0, 0.003)
               for s in [-1, 1]
             ])
             + [box('strap-front', 'strap', [-0.034, 0, 0.15], [0.034, 0.003, 0.17]), box('buckle', 'buckle', [-0.014, 0, 0.146], [0.006, 0.006, 0.174])],
             { shell: 'paint-olive', strap: 'leather-brown', buckle: 'brass-dull' })
  + { voxelGrain: 0.004 },

  // An eagle helmet standing upright, front on +z, 270 mm tall and 360 mm long: a carved wooden head whose open beak is
  // the face opening, the hooked upper beak jutting over the brow and the lower beak under the chin, an eye on each
  // side, painted feather bands round the head and a fan of plumes rising at the back.
  h.compound('helmet_aztec', 2.5,
             shell('head', eagle.ys, eagle.f, eagle.cuts)
             + std.flattenArrays([
               slab('band-%d' % i, 'band', clip(ell(0.116, 0.136, 0), 0, 1, 0.03), 0.02 + i * 0.06, 0.032 + i * 0.06)
               for i in [0, 1, 2]
             ])
             + [
               h.prism('beak-top', 'beak', 'x', [[0.235, 0.08], [0.215, 0.19], [0.175, 0.232], [0.15, 0.218], [0.165, 0.08]], -0.032, 0.032),
               h.prism('beak-top-l', 'beak', 'x', [[0.228, 0.08], [0.205, 0.16], [0.165, 0.16], [0.165, 0.08]], -0.058, -0.032),
               h.prism('beak-top-r', 'beak', 'x', [[0.228, 0.08], [0.205, 0.16], [0.165, 0.16], [0.165, 0.08]], 0.032, 0.058),
               h.prism('beak-low', 'beak', 'x', [[0.05, 0.08], [0.046, 0.17], [0.03, 0.195], [0.0, 0.16], [0.0, 0.08]], -0.045, 0.045),
             ]
             + std.flattenArrays([
               [
                 sideDisc('eye-%d' % s, 'eye', s, 0.088, 0.205, 0.075, 0.017, 0.01, 0.006),
                 sideDisc('pupil-%d' % s, 'inside', s, 0.094, 0.205, 0.075, 0.008, 0.002, 0.004),
               ]
               for s in [-1, 1]
             ])
             + [
               local t = rad(-50 + 25 * i);
               h.prism('plume-%d' % i, if i % 2 == 0 then 'plume' else 'plume-b', 'x', [[0.23, -0.06], [0.23 + 0.13 * std.cos(rad(25 * (i - 2) + 70)) * 0.4 + 0.02, -0.07 - 0.03], [0.23 + 0.13, -0.13 - 0.02 * i], [0.24 + 0.12, -0.11 - 0.02 * i]], -0.004 + 0.022 * (i - 2), 0.004 + 0.022 * (i - 2))
               for i in std.range(0, 4)
             ],
             { shell: 'wood-walnut', band: 'paint-cream', inside: 'cloth-black', beak: 'paint-crane-yellow', eye: 'paint-white', plume: 'cloth-green', 'plume-b': 'cloth-red' })
  + { voxelGrain: 0.004 },

  // A batting helmet standing on its ear flaps, front on +z, 255 mm front to back and 210 mm tall: a glossy shell over
  // a padded liner, an ear flap down each side with its ear hole, a short peak and vent holes in the crown.
  h.compound('helmet_ball', 0.57,
             shell('shell', batting.ys, batting.f, batting.cuts)
             + bill('peak', 'shell', 0.1, 0.19, 0.084, 0.081, 0.094)
             + std.flattenArrays([
               [sideDisc('ear-%d' % s, 'inside', s, 0.102, 0.06, -0.012, 0.014, 0.008, 0.002)]
               for s in [-1, 1]
             ])
             + [
               h.disc('vent-%d' % i, 'inside', 0.007, domeY(0.102, 0.122, 0, 0.12, 0.092, v[0], v[1]) - 0.006, domeY(0.102, 0.122, 0, 0.12, 0.092, v[0], v[1]) + 0.001, v[0], v[1])
               for i in std.range(0, 3)
               for v in [[[-0.03, 0.04], [0.03, 0.04], [-0.04, -0.05], [0.04, -0.05]][i]]
             ],
             { shell: 'plastic-blue', inside: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A bike helmet standing on its rim, front on +z, 260 mm front to back and 155 mm tall: a long rounded shell with
  // four dark vent channels front to back, a white foam band round the rim, a short visor and straps lying out to a buckle.
  h.compound('helmet_bike', 0.2,
             shell('shell', bike.ys, bike.f, bike.cuts)
             + slab('foam', 'foam', ell(0.102, 0.132, -0.008), 0.0, 0.026)
             + bill('visor', 'shell', 0.1, 0.165, 0.075, 0.05, 0.056)
             + std.flattenArrays([
               strip('strap-%d' % s, 'strap', [s * 0.098, -0.02], [s * 0.02, 0.15], 0.016, 0, 0.003)
               for s in [-1, 1]
             ])
             + [box('buckle', 'buckle', [-0.02, 0, 0.145], [0.02, 0.008, 0.162])],
             { shell: 'plastic-red', inside: 'plastic-black', foam: 'plastic-white', strap: 'webbing-black', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A closed bronze helmet standing upright, front on +z, 280 mm tall and 255 mm front to back: one rounded shell to
  // the neck with a thickened rim, a single eye slit, a row of breathing holes and a keel over the crown.
  h.compound('helmet_bronze', 2.2,
             shell('shell', bronzeHelm.ys, bronzeHelm.f, bronzeHelm.cuts)
             + [keel('keel', 'shell', 0.122, -0.004, 0.17, 0.11, 0.014, 0.01)],
             { shell: 'bronze', inside: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A chitin helmet standing upright, front on +z, 280 mm tall: a full shell of overlapping insect plates with raised
  // seams, two eye holes and a slotted mouth grille, and a ridge over the crown.
  h.compound('helmet_chitin', 1.8,
             shell('shell', chitin(false).ys, chitin(false).f, chitin(false).cuts)
             + std.flattenArrays([slab('seam-%d' % i, 'seam', clip(ell(0.111, 0.132, 0), 0, 1, 0.08), 0.02 + i * 0.05, 0.028 + i * 0.05) for i in [0, 1]])
             + slab('seam-brow', 'seam', ell(0.111, 0.132, 0), 0.172, 0.18)
             + [keel('keel', 'seam', 0.126, 0, 0.17, 0.11, 0.008, 0.012)],
             { shell: 'chitin-brown', seam: 'leather-chestnut', inside: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A light chitin helmet standing upright, front on +z, 280 mm tall: the chitin shell with the face left open from
  // brow to chin, raised seams and a ridge over the crown.
  h.compound('helmet_chitin_light', 1.4,
             shell('shell', chitin(true).ys, chitin(true).f, chitin(true).cuts)
             + std.flattenArrays([slab('seam-%d' % i, 'seam', clip(ell(0.111, 0.132, 0), 0, 1, 0.0), 0.02 + i * 0.05, 0.028 + i * 0.05) for i in [0, 1]])
             + slab('seam-brow', 'seam', ell(0.111, 0.132, 0), 0.172, 0.18)
             + [keel('keel', 'seam', 0.126, 0, 0.17, 0.11, 0.008, 0.012)],
             { shell: 'chitin-brown', seam: 'leather-chestnut', inside: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A conical helm standing on its neck guard, front on +z, 340 mm tall and 236 mm across: a tall iron cone rising to a
  // spike over a fur brim, with a skirt of laced iron lames round the back and sides.
  h.compound('helmet_conical', 2.3, [
    h.turned('bowl', 'iron', 'y', [[0, 0], [0, 0.1], [0.05, 0.098], [0.11, 0.074], [0.16, 0.036], [0.18, 0.016], [0.2, 0.01], [0.215, 0.004], [0.24, 0]], [0, 0.1, 0]),
    h.disc('knop', 'trim', 0.014, 0.28, 0.296),
    ring('fur', 'fur', 0.094, 0.116, 0.085, 0.13),
  ]
  + h.crescent('lames', 'iron', 0.094, 0.106, 40, 320, 18, 0, 0.09)
  + [
    h.disc('lace-%d' % i, 'trim', 0.003, 0.004, 0.088, 0.107 * std.sin(rad(50 + 20 * i)), 0.107 * std.cos(rad(50 + 20 * i)))
    for i in std.range(0, 13)
  ]
  + [
    h.disc('tuft-%d' % i, 'fur', 0.008, 0.086, 0.13, 0.115 * std.sin(2 * std.pi * i / 22), 0.115 * std.cos(2 * std.pi * i / 22))
    for i in std.range(0, 21)
  ], { iron: 'steel-grey', trim: 'leather-brown', fur: 'fur-brown' })
  + { voxelGrain: 0.004 },

  // A Corinthian helm standing upright, front on +z, 285 mm tall and 280 mm front to back: one bronze shell to the
  // neck, flaring at the nape, with almond eye holes either side of a nose guard and a narrow gap between the cheek
  // guards down to the chin.
  h.compound('helmet_corinthian', 1.9,
             shell('shell', corinthian.ys, corinthian.f, corinthian.cuts)
             + slab('nape', 'shell', clip(ell(0.112, 0.15, -0.004), 0, 1, -0.04), 0, 0.03)
             + slab('brow', 'shell', clip(ell(0.106, 0.134, -0.004), 0, -1, -0.02), 0.172, 0.182),
             { shell: 'bronze', inside: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A football helmet standing on its rim, front on +z, 300 mm front to back and 235 mm tall: a glossy shell with a
  // centre stripe, an ear hole each side, a smoked visor across the eyes and a barred face mask.
  h.compound('helmet_football', 1.5,
             shell('shell', football.ys, football.f, football.cuts)
             + std.flattenArrays([
               [sideDisc('ear-%d' % s, 'inside', s, 0.116, 0.075, -0.02, 0.012, 0.008, 0.002)]
               for s in [-1, 1]
             ])
             + std.flattenArrays([h.crescent('bar-%d' % i, 'mask', 0.13, 0.138, -40, 40, 8, y, y + 0.009) for i in [0, 1, 2] for y in [[0.025, 0.06, 0.096][i]]])
             + [h.disc('post-%d' % i, 'mask', 0.0045, 0.025, 0.105, 0.134 * std.sin(rad(a)), 0.134 * std.cos(rad(a))) for i in [0, 1, 2] for a in [[-40, 0, 40][i]]]
             + [box('visor', 'visor', [-0.074, 0.112, 0.088], [0.074, 0.16, 0.094])],
             { shell: 'plastic-red', stripe: 'plastic-white', inside: 'cloth-black', mask: 'plastic-grey', visor: 'lens-smoke' })
  + { voxelGrain: 0.004 },

  // A galea standing on its cheek guards, front on +z, 250 mm tall and 330 mm long: an iron bowl with a brow
  // reinforce, a broad neck guard sloping out at the back, a hinged cheek guard hanging each side with brass bosses
  // and a crest knob on top.
  h.compound('helmet_galea', 2.2,
             shell('bowl', galea.ys, galea.f)
             + slab('neck-guard', 'shell', clip(ell(0.124, 0.19, -0.03), 0, 1, -0.07), 0.076, 0.086)
             + slab('brow', 'shell', clip(ell(0.108, 0.126, -0.006), 0, -1, -0.03), 0.118, 0.13)
             + std.flattenArrays([
               [
                 h.prism('cheek-%d' % s, 'shell', 'x', [[0.092, -0.03], [0.092, 0.07], [0.04, 0.082], [0.0, 0.05], [0.0, -0.012]], if s > 0 then 0.096 else -0.1, if s > 0 then 0.1 else -0.096),
                 sideDisc('boss-%d' % s, 'trim', s, 0.1, 0.05, 0.03, 0.008, 0.001, 0.004),
                 sideDisc('hinge-%d' % s, 'trim', s, 0.1, 0.088, 0.02, 0.006, 0.001, 0.004),
               ]
               for s in [-1, 1]
             ])
             + [
               h.disc('knob', 'trim', 0.012, 0.245, 0.262, 0, -0.006),
               box('crest-holder', 'trim', [-0.006, 0.255, -0.03], [0.006, 0.27, 0.02]),
             ],
             { shell: 'steel-grey', trim: 'brass-dull' })
  + { voxelGrain: 0.004 },
]
