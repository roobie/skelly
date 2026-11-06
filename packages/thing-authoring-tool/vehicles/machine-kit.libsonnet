// Pressings the machines share: rows stay per-vehicle because each is pressed for its own machine.
local k = import 'kit.libsonnet';
local box = k.box;
local prism = k.prism;
local rad(degrees) = degrees * std.pi / 180;
local polar(cx, cy, r, degrees) = [cx + r * std.cos(rad(degrees)), cy + r * std.sin(rad(degrees))];
// Convex trapezoids around a centre, since a prism must be convex. Angles run counter-clockwise from +x.
local arc(id, slot, cx, cy, inner, outer, from, to, steps, z) = [
  local a0 = from + (to - from) * i / steps;
  local a1 = from + (to - from) * (i + 1) / steps;
  prism(id + '_' + i, slot, [polar(cx, cy, inner, a0), polar(cx, cy, outer, a0), polar(cx, cy, outer, a1), polar(cx, cy, inner, a1)], z)
  for i in std.range(0, steps - 1)
];
local across(a, b, half) =
  local dx = b[0] - a[0];
  local dy = b[1] - a[1];
  local length = std.sqrt(dx * dx + dy * dy);
  [-dy / length * half, dx / length * half];
// A bar between two (x, y) points, tapering from `thick` at a to `thickB` at b.
local bar(id, slot, a, b, thick, z, thickB=null) =
  local na = across(a, b, thick / 2);
  local nb = across(a, b, (if thickB == null then thick else thickB) / 2);
  prism(id, slot, [[a[0] - na[0], a[1] - na[1]], [b[0] - nb[0], b[1] - nb[1]], [b[0] + nb[0], b[1] + nb[1]], [a[0] + na[0], a[1] + na[1]]], z);
// A disc lying across the vehicle at (x, y).
local axleDisc(id, slot, x, y, radius, z, sides=24) =
  local half = (z[1] - z[0]) / 2;
  k.turned(id, slot, 'z', k.disc(radius, -half, half), [x, y, (z[0] + z[1]) / 2]) + { sides: sides };
{
  arc: arc,
  bar: bar,
  axleDisc: axleDisc,
  // A tyre on its hub at the origin, lugged when `lugs` is above zero so it reads as off-road.
  wheel(id, massKg, width, rim, outer, lugs=0, lug=0.025, hub='steel-grey')::
    local body = outer - (if lugs > 0 then lug else 0);
    k.compound(id, massKg, [
      k.turned('tyre', 'tyre', 'z', [[-width / 2, rim], [-width / 2, body - width * 0.08], [-width * 0.42, body], [width * 0.42, body], [width / 2, body - width * 0.08], [width / 2, rim], [-width / 2, rim]]) + { sides: 24 },
      k.turned('rim', 'rim', 'z', k.disc(rim, -width * 0.36, width * 0.36)) + { sides: 24 },
      k.turned('cap', 'cap', 'z', k.disc(rim * 0.4, width * 0.3, width * 0.42)) + { sides: 12 },
    ] + (if lugs > 0 then std.flattenArrays([
      local at = 360 * i / lugs;
      arc('lug_' + i, 'tyre', 0, 0, body - 0.01, outer, at, at + 180 / lugs, 1, [-width / 2, width / 2])
      for i in std.range(0, lugs - 1)
    ]) else []), { tyre: 'rubber-black', rim: hub, cap: 'paint-charcoal' }, { hub: ['rim', [0.5, 0.5, 0.5]] }),
  // A crawler track centred on its own length and width with the ground at y = 0: the band runs round a sprocket
  // and an idler of `radius`, with road rollers along a frame between them.
  track(id, massKg, length, radius, width, band, finish, rollers=5, cleats=18, sprocketFinish='steel-spall-black')::
    local reach = length / 2 - radius;
    local half = width / 2;
    local z = [-half, half];
    local inner = radius - band;
    local cleat(i) =
      local x = -reach + 2 * reach * (i + 0.25) / cleats;
      box('cleat_b_' + i, 'cleat', [x, -0.0, -half], [x + reach / cleats, 0.03, half]);
    local cleatTop(i) =
      local x = -reach + 2 * reach * (i + 0.25) / cleats;
      box('cleat_t_' + i, 'cleat', [x, 2 * radius - 0.03, -half], [x + reach / cleats, 2 * radius, half]);
    k.compound(id, massKg, [
      box('run_bottom', 'band', [-reach, 0.03, -half], [reach, 0.03 + band, half]),
      box('run_top', 'band', [-reach, 2 * radius - 0.03 - band, -half], [reach, 2 * radius - 0.03, half]),
      box('frame', 'frame', [-reach, radius - 0.14 * radius / 0.4, -half * 0.5], [reach, radius + 0.2 * radius / 0.4, half * 0.5]),
      axleDisc('sprocket', 'sprocket', -reach, radius, inner - 0.01, [-half * 0.55, half * 0.55]),
      axleDisc('idler', 'sprocket', reach, radius, inner - 0.01, [-half * 0.55, half * 0.55]),
    ] + arc('wrap_rear', 'band', -reach, radius, inner, radius, 90, 270, 8, z)
    + arc('wrap_front', 'band', reach, radius, inner, radius, -90, 90, 8, z)
    + [cleat(i) for i in std.range(0, cleats - 1)]
    + [cleatTop(i) for i in std.range(0, cleats - 1)]
    + [
      local x = -reach + 2 * reach * (i + 1) / (rollers + 1);
      axleDisc('roller_' + i, 'roller', x, 0.03 + band + radius * 0.2, radius * 0.2, [-half * 0.6, half * 0.6], 12)
      for i in std.range(0, rollers - 1)
    ],
    { band: finish, cleat: finish, frame: 'paint-charcoal', sprocket: sprocketFinish, roller: 'steel-grey' }),
  // A curved dig bucket: a shell around (cx, cy) from `from` to `to` degrees, side plates and teeth at the `from` lip.
  bucket(cx, cy, radius, from, to, halfWidth, thick=0.05, teeth=5, tooth=0.14)::
    local z = [-halfWidth, halfWidth];
    local lip = polar(cx, cy, radius - thick / 2, from);
    local steps = 8;
    local side = [polar(cx, cy, radius, from + (to - from) * i / steps) for i in std.range(0, steps)];
    local tip = polar(lip[0], lip[1], tooth, from - 90);
    local plate(near) =
      local range = if near then [halfWidth - 0.05, halfWidth] else [-halfWidth, -halfWidth + 0.05];
      prism(if near then 'side_near' else 'side_far', 'shell', side, range);
    arc('shell', 'shell', cx, cy, radius - thick, radius, from, to, steps, z)
    + [plate(true), plate(false)]
    + [
      local at = -halfWidth + (2 * halfWidth) * (i + 0.5) / teeth;
      bar('tooth_' + i, 'tooth', lip, tip, 0.05, [at - 0.04, at + 0.04], 0.03)
      for i in std.range(0, teeth - 1)
    ],
  // A folding step with a grab rail is how an open machine is entered: its hinge runs along the tread's rear edge.
  step(id, massKg, x, y, z, finish='paint-charcoal', rail=null):: k.compound(id, massKg, [
    box('tread', 'tread', [x[0], y - 0.06, z[0]], [x[1], y, z[1]]),
  ] + (if rail == null then [] else [
    box('hanger_a', 'tread', [x[0] + 0.02, y, z[0]], [x[0] + 0.06, rail, z[0] + 0.04]),
    box('hanger_b', 'tread', [x[1] - 0.06, y, z[0]], [x[1] - 0.02, rail, z[0] + 0.04]),
    box('rail', 'tread', [x[0] + 0.02, rail - 0.04, z[0]], [x[1] - 0.02, rail, z[0] + 0.04]),
  ]), { tread: finish }, {
    hinge_a: ['tread', [0, 0.5, 0]],
    hinge_b: ['tread', [1, 0.5, 0]],
  }),
}
