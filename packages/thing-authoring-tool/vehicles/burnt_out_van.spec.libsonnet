// A panel van of the 3.5-tonne class after a cab fire: 5.3 m long and 2.0 m wide, the tyres gone so it sits 0.16 m low on
// bare rims, its roof sagged 0.35 m over the load bay. About 1200 kg left. Metres in the vehicle frame.
// The helpers also serve the other two van wrecks. A panel's colour comes from a burn field cell by cell, so a burn
// has no edge of its own to read as a sticker.
local k = import 'kit.libsonnet';
local lerp(points, x) =
  local n = std.length(points);
  local span = [i for i in std.range(0, n - 2) if x <= points[i + 1][0]];
  if x <= points[0][0] then points[0][1]
  else if std.length(span) == 0 then points[n - 1][1]
  else
    local a = points[span[0]];
    local b = points[span[0] + 1];
    a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
local hash(a, b, seed) =
  local n = (a + 1000) * 3741 + (b + 1000) * 6682 + seed * 997;
  ((n % 65536) * (n % 65521) + n) % 65521 / 65521;
local mix(a, b, t) = a + (b - a) * t * t * (3 - 2 * t);
local noiseAt(seed, x, y, size) =
  local u = x / size;
  local v = y / size;
  local i = std.floor(u);
  local j = std.floor(v);
  mix(mix(hash(i, j, seed), hash(i + 1, j, seed), u - i), mix(hash(i, j + 1, seed), hash(i + 1, j + 1, seed), u - i), v - j);
local noise(seed, x, y) = 0.5 * noiseAt(seed, x, y, 0.4) + 0.5 * noiseAt(seed + 1, x, y, 0.14);
local place(plane, id, slot, u, v, w) =
  if plane == 'z' then k.box(id, slot, [u[0], v[0], w[0]], [u[1], v[1], w[1]])
  else if plane == 'x' then k.box(id, slot, [w[0], v[0], u[0]], [w[1], v[1], u[1]])
  else k.box(id, slot, [u[0], w[0], v[0]], [u[1], w[1], v[1]]);
// Cells run up each column of a panel with `slot(u, v)`, and null leaves a hole. Equal neighbours merge into one box.
local sheet(tag, plane, u, bottom, top, w, slot, cell=0.125) =
  local columns = std.max(1, std.ceil((u[1] - u[0]) / cell));
  local width = (u[1] - u[0]) / columns;
  std.flattenArrays([
    local a = u[0] + i * width;
    local middle = a + width / 2;
    local low = bottom(middle);
    local high = top(middle);
    local rows = std.max(1, std.ceil((high - low) / cell));
    local height = (high - low) / rows;
    local runs = if high - low < 0.02 then [] else std.foldl(function(acc, j)
      local s = slot(middle, low + (j + 0.5) * height);
      local n = std.length(acc);
      if n > 0 && acc[n - 1].s == s && acc[n - 1].end == j then acc[:n - 1] + [acc[n - 1] { end: j + 1 }]
      else acc + [{ s: s, from: j, end: j + 1 }], std.range(0, rows - 1), []);
    [
      place(plane, tag + '_' + i + '_' + run.from, run.s, [a, a + width], [low + run.from * height, low + run.end * height], w(middle))
      for run in runs
      if run.s != null
    ]
    for i in std.range(0, columns - 1)
  ]);
// A skin over x and z whose height `y(x, z)` may slope along x; it steps across z.
local surface(tag, xs, zs, y, thick, slot) = std.flattenArrays([
  [
    local zm = (zs[j] + zs[j + 1]) / 2;
    k.prism(tag + '_' + i + '_' + j, slot((xs[i] + xs[i + 1]) / 2, zm), [
      [xs[i], y(xs[i], zm) - thick],
      [xs[i + 1], y(xs[i + 1], zm) - thick],
      [xs[i + 1], y(xs[i + 1], zm)],
      [xs[i], y(xs[i], zm)],
    ], [zs[j], zs[j + 1]])
    for j in std.range(0, std.length(zs) - 2)
    if slot((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2) != null
  ]
  for i in std.range(0, std.length(xs) - 2)
]);
local yprism(id, slot, profile, y) = { id: id, kind: 'prism', slot: slot, axis: 'y', profile: profile, start: y[0], end: y[1] };
local xprism(id, slot, profile, x) = { id: id, kind: 'prism', slot: slot, axis: 'x', profile: profile, start: x[0], end: x[1] };
// A flat door or panel standing on edge, seen from above as a strip from `from` to `to`, both (z, x). It steps down along
// its length, between `bottom(t)` and `top(t)`, so a door off its hinge can trail its free corner on the road.
local swung(tag, from, to, thick, bottom, top, slot, cells=8) =
  local dz = to[0] - from[0];
  local dx = to[1] - from[1];
  local length = std.sqrt(dz * dz + dx * dx);
  local nz = -dx / length * thick;
  local nx = dz / length * thick;
  local at(t) = [from[0] + dz * t, from[1] + dx * t];
  std.flattenArrays([
    local a = at(i / cells);
    local b = at((i + 1) / cells);
    local t = (i + 0.5) / cells;
    local low = bottom(t);
    local high = top(t);
    local rows = std.max(1, std.ceil((high - low) / 0.14));
    [
      yprism(tag + '_' + i + '_' + j, slot(t, low + (j + 0.5) * (high - low) / rows), [
        a,
        b,
        [b[0] + nz, b[1] + nx],
        [a[0] + nz, a[1] + nx],
      ], [low + j * (high - low) / rows, low + (j + 1) * (high - low) / rows])
      for j in std.range(0, rows - 1)
      if slot(t, low + (j + 0.5) * (high - low) / rows) != null
    ]
    for i in std.range(0, cells - 1)
  ]);
// A wire-edged steel rim with no tyre, its dish a little dark, hub at the origin.
local rim(id, massKg, radius, width, rust='scrap-rusted', dish='steel-spall-black') = k.compound(id, massKg, [
  k.turned('hoop', 'rust', 'z', k.annulus(radius - 0.035, radius, -width / 2, width / 2)) + { sides: 24 },
  k.turned('flange_out', 'rust', 'z', k.annulus(radius - 0.05, radius, width / 2 - 0.02, width / 2)) + { sides: 24 },
  k.turned('dish', 'dish', 'z', k.disc(radius - 0.03, -0.02, 0.03)) + { sides: 24 },
  k.turned('hub', 'rust', 'z', k.disc(radius * 0.32, 0.03, 0.06)) + { sides: 12 },
], { rust: rust, dish: dish });
{
  lerp: lerp,
  noise: noise,
  sheet: sheet,
  surface: surface,
  yprism: yprism,
  xprism: xprism,
  swung: swung,
  rim: rim,
  // Picks the slot from `levels`, [[threshold, slot], ...] highest first.
  burn(levels, fallback='paint'): function(v)
    local hit = [level[1] for level in levels if v >= level[0]];
    if std.length(hit) > 0 then hit[0] else fallback,

  rear: -2.6, nose: 2.62, side: 1.0, skin: 0.94,
  rearAxle: -1.53, frontAxle: 1.77, rimRadius: 0.2, wheelZ: 0.86,
  arch: 0.45, archRise: 0.42,
  sill: 0.24, floor: 0.34, waist: 1.04,
}
