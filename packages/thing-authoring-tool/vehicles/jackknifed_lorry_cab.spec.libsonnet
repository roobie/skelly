// A three-axle bonneted road tractor run nose-first into the ground, about 5.8 t. Everything is authored in the tractor's own
// level frame and pitched forward about the first rear axle's ground contact, so that axle's tyres rest on y = 0, the last axle
// hangs clear and the nose is cut off at the ground line. Metres in the vehicle frame.
local angle = 12 * std.pi / 180;
local cos = std.cos(angle);
local sin = std.sin(angle);
local pivot = -1.85;
local at(p) = [pivot + (p[0] - pivot) * cos + p[1] * sin, p[1] * cos - (p[0] - pivot) * sin];
// Keeps the part of a counterclockwise outline at or above the ground.
local aboveGround(points) =
  local n = std.length(points);
  local cut = std.flattenArrays([
    local a = points[i];
    local b = points[(i + 1) % n];
    local crossing = if (a[1] < 0) != (b[1] < 0) then [[a[0] + (b[0] - a[0]) * (0 - a[1]) / (b[1] - a[1]), 0]] else [];
    (if a[1] >= 0 then [a] else []) + crossing
    for i in std.range(0, n - 1)
  ]);
  local m = std.length(cut);
  local apart(a, b) = std.abs(a[0] - b[0]) + std.abs(a[1] - b[1]) > 1e-3;
  [cut[i] for i in std.range(0, m - 1) if apart(cut[i], cut[(i + 1) % m])];
local area(points) =
  local n = std.length(points);
  std.sum([points[i][0] * points[(i + 1) % n][1] - points[(i + 1) % n][0] * points[i][1] for i in std.range(0, n - 1)]) / 2;
// A level-frame outline around z, pitched and cut; a piece wholly under the ground is dropped.
local poly(id, slot, points, z) =
  local kept = aboveGround([at(p) for p in points]);
  if std.length(kept) < 3 || area(kept) < 2e-4 then [] else
    [{ id: id, kind: 'prism', slot: slot, axis: 'z', profile: kept, start: z[0], end: z[1] }];
local pitchedBox(id, slot, min, max) =
  poly(id, slot, [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]], [min[2], max[2]]);
{
  at: at,
  poly: poly,
  box: pitchedBox,
  // A `field` emit that lays each run of tiles in the pitched frame.
  tile(id, plane, slot, u, v, w)::
    if plane == 'z' then pitchedBox(id, slot, [u[0], v[0], w[0]], [u[1], v[1], w[1]])
    else if plane == 'y' then pitchedBox(id, slot, [u[0], w[0], v[0]], [u[1], w[1], v[1]])
    else pitchedBox(id, slot, [w[0], v[0], u[0]], [w[1], v[1], u[1]]),

  rear: -3.65, side: 1.24, sleeperBack: -0.95, cabBack: 0.38, cabFront: 2.0, floor: 1.22,
  rail: [0.74, 0.99], railZ: 0.44,
  noseX: 3.25, bonnetZ: 0.72, wingZ: 1.2, wingY: 1.24,
  rearAxles: [-1.85, -3.1], hubY: 0.522, wheelR: 0.508, rimR: 0.29, wheelZ: 0.98,
  fairingTop: 3.72, fold: 0.9, foldY: 2.62, screenY: 2.16,
  fifth: { x: -2.45, y: 1.28 },
  finish: {
    paint: 'paint-oxblood',
    rust: 'scrap-rusted',
    rustRed: 'rust-red',
    bare: 'iron-dull',
    crease: 'steel-spall-black',
    frame: 'steel-parkerized',
    chrome: 'steel-stainless',
    earth: 'clay-wet',
    stone: 'stone-grey',
    rubber: 'rubber-black',
  },
  // How hard a panel was hit, from creased down to whole paint below 0.34.
  damage(hit, base)::
    if hit > 0.76 then 'crease'
    else if hit > 0.6 then 'rust'
    else if hit > 0.46 then 'bare'
    else if hit > 0.37 then 'rust'
    else if hit > 0.34 then 'rustRed'
    else base,
}
