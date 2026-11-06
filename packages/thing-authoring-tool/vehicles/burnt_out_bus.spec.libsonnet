// A 12 m low-floor city bus after a rear engine fire, about 9 t: on bare rims, so 0.23 m lower than on tyres, with the
// roof collapsed over its rear third. Metres in the vehicle frame; the rims rest on y = 0.
local clamp(v, a, b) = std.max(a, std.min(b, v));
local smooth(t0) = local t = clamp(t0, 0, 1); t * t * (3 - 2 * t);
local lerp(a, b, t) = a + (b - a) * t;
local hash(i, j, seed) =
  local v = std.mod((i + 4096) * 7919 + (j + 4096) * 104729 + seed * 1299709, 65521);
  local u = std.mod(v * v + 977, 65521);
  std.mod(u * u + 1, 65521) / 65521;
local value(x, y, seed) =
  local i = std.floor(x);
  local j = std.floor(y);
  local fx = smooth(x - i);
  local fy = smooth(y - j);
  lerp(lerp(hash(i, j, seed), hash(i + 1, j, seed), fx), lerp(hash(i, j + 1, seed), hash(i + 1, j + 1, seed), fx), fy);
// About 0.5 with a spread reaching 0 and 1; its finest octave is what breaks up a patch's edge.
local noise(x, y, seed) =
  clamp(0.5 + 2 * (0.55 * value(x / 2, y / 2, seed) + 0.32 * value(x / 0.75, y / 0.75, seed + 1) + 0.13 * value(x / 0.28, y / 0.28, seed + 2) - 0.5), 0, 1);
local quantise(v, step) = std.floor(v / step + 0.5) * step;
local boxOn(plane, id, slot, u, v, w) =
  if plane == 'z' then { id: id, kind: 'box', slot: slot, min: [u[0], v[0], w[0]], max: [u[1], v[1], w[1]] }
  else if plane == 'y' then { id: id, kind: 'box', slot: slot, min: [u[0], w[0], v[0]], max: [u[1], w[1], v[1]] }
  else { id: id, kind: 'box', slot: slot, min: [w[0], v[0], u[0]], max: [w[1], v[1], u[1]] };
{
  // Shared with the other road wrecks, which are built the same way.
  clamp: clamp,
  smooth: smooth,
  lerp: lerp,
  hash: hash,
  noise: noise,
  quantise: quantise,
  // A panel cut into tiles. `at(u, v)` gives each tile { slot, w: [low, high] } or null for a hole, so colour, rust-through
  // and crumple all come from one function and no patch has a straight edge. Equal neighbours along u merge into one piece.
  // A plane is named by its normal: 'z' lays (u, v) on (x, y), 'y' on (x, z) and 'x' on (z, y).
  field(id, plane, u, v, du, dv, at, emit=null)::
    local nu = std.ceil((u[1] - u[0]) / du - 1e-9);
    local nv = std.ceil((v[1] - v[0]) / dv - 1e-9);
    local place(pid, slot, a, b, c) = if emit == null then [boxOn(plane, pid, slot, a, b, c)] else emit(pid, plane, slot, a, b, c);
    std.flattenArrays([
      local v0 = v[0] + j * dv;
      local tiles = [at(u[0] + (i + 0.5) * du, v0 + 0.5 * dv) for i in std.range(0, nu - 1)];
      local runs = std.foldl(function(runs, i)
        local n = std.length(runs);
        local tile = tiles[i];
        if tile == null then runs
        else if n > 0 && runs[n - 1].end == i && runs[n - 1].slot == tile.slot && runs[n - 1].w == tile.w then
          runs[:n - 1] + [runs[n - 1] { end: i + 1 }]
        else runs + [{ start: i, end: i + 1, slot: tile.slot, w: tile.w }], std.range(0, nu - 1), []);
      std.flattenArrays([
        place(id + '_' + j + '_' + run.start, run.slot, [u[0] + run.start * du, u[0] + run.end * du], [v0, v0 + dv], run.w)
        for run in runs
      ])
      for j in std.range(0, nv - 1)
    ]),
  // The compound check takes counterclockwise outlines only.
  ccw(profile)::
    local n = std.length(profile);
    local area = std.sum([profile[i][0] * profile[(i + 1) % n][1] - profile[(i + 1) % n][0] * profile[i][1] for i in std.range(0, n - 1)]);
    if area > 0 then profile else std.reverse(profile),
  bar(a, b, thick)::
    local dx = b[0] - a[0];
    local dy = b[1] - a[1];
    local length = std.sqrt(dx * dx + dy * dy);
    local nx = -dy / length * thick / 2;
    local ny = dx / length * thick / 2;
    [[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]],

  rear: -6, front: 6, side: 1.275, sill: 0.07, floor: 0.13, floorRear: 0.59, floorStep: -1.4,
  deck: { x: -4.25, y: 0.97 },
  waist: 0.92, windowTop: 2.32, roofBase: 2.59, roof: 2.77, lean: 0.14, screenLow: 0.72,
  bayFront: 5.6, pitch: 1.35, bays: 8,
  frontAxle: 3.3, rearAxle: -2.6, hubY: 0.3, rimR: 0.3, wheelZ: 1.1, arch: 0.58,
  doors: [[4.3, 5.55], [0.2, 1.5]],
  // How far the roof has dropped along its centre at the rear wall, and the station where it starts to go.
  collapse: { depth: 1.45, from: -0.8, to: -5.6 },
  seats: [
    { x: 2.25, y: 0.13 },
    { x: 1.45, y: 0.13 },
    { x: 0.65, y: 0.13 },
    { x: -0.15, y: 0.13 },
    { x: -0.95, y: 0.13 },
    { x: -1.75, y: 0.59 },
    { x: -3.5, y: 0.59 },
  ],
  driver: { x: 4.72, y: 0.13, z: 0.72 },
  finish: {
    paint: 'paint-white',
    band: 'paint-drum-blue',
    rust: 'scrap-rusted',
    rustRed: 'rust-red',
    ash: 'iron-dull',
    soot: 'iron-cast',
    char: 'steel-spall-black',
  },
  // The heat of the fire on a panel, from `heat` near 1 down to bare paint below 0.3.
  burn(heat, base)::
    if heat > 0.8 then 'char'
    else if heat > 0.62 then 'soot'
    else if heat > 0.48 then 'ash'
    else if heat > 0.36 then 'rust'
    else if heat > 0.33 then 'rustRed'
    else base,
}
