local k = import 'kit.libsonnet';
local w = import 'burnt_out_bus.spec.libsonnet';
local s = import 'jackknifed_lorry_cab.spec.libsonnet';
local abs = std.abs;
local q = w.quantise;
local box = k.box;
local fin = s.finish;
local field(id, plane, u, v, du, dv, at) = w.field(id, plane, u, v, du, dv, at, s.tile);
local between(x, a, b) = x > a && x < b;
local hit(x, y, seed) =
  0.14 + 0.5 * w.smooth((x - 0.15) / 2.4) + (w.noise(x, y, seed) - 0.5) * 0.72
  + (w.hash(std.floor(x * 8), std.floor(y * 8), seed + 5) - 0.5) * 0.16;
local cabLine(x) =
  if x < 0 then s.fairingTop
  else if x < s.fold then w.lerp(s.fairingTop, s.foldY, x / s.fold)
  else w.lerp(s.foldY, s.screenY, (x - s.fold) / (s.cabFront - s.fold));
// The near side of the roof went down further, so the cab is twisted as well as flattened.
local cabTop(x, z) =
  local crushed = w.smooth((x - 0.1) / 0.6);
  cabLine(x) - crushed * 0.2 * w.clamp(z / s.side, 0, 1) + q((w.noise(x, z, 7) - 0.5) * 0.34 * crushed, 0.0625);
local wall(sign, seed, opening) = function(x, y)
  local z = sign * s.side;
  local top = cabTop(x, z);
  local t = hit(x, y, seed);
  local window = between(x, 0.6, 1.8) && y > 1.92 && y < top - 0.08;
  local door = opening && between(x, 0.46, 1.88) && y < top - 0.08;
  local berth = between(x, -0.62, -0.12) && between(y, 2.08, 2.36);
  local locker = between(x, -0.72, -0.05) && between(y, 1.1, 1.42);
  if y > top || window || door || (y < 1.4 && t > 0.82) then null
  else
    local inward = w.smooth((x - 0.5) / 1.2) * 0.2 + (w.noise(x / 1.8, y / 1.8, seed + 9) - 0.5) * 0.2 * w.smooth((x - 0.2) / 0.9);
    local face = sign * (s.side - q(inward, 0.0625));
    {
      slot: if berth then 'crease' else if locker && t < 0.5 then 'frame' else s.damage(t, 'paint'),
      w: if sign > 0 then [face - 0.0625, face] else [face, face + 0.0625],
    };
local roof(x, z) =
  local n = w.noise(x, z, 17);
  local t = hit(x, z + 3, 19) - 0.14;
  local top = q(cabTop(x, z), 0.0625);
  local onFold = abs(x - s.fold) < 0.1 || abs(x - 1.45) < 0.07;
  if onFold && n > 0.74 then null
  else { slot: if onFold then 'crease' else s.damage(t, 'paint'), w: [top - 0.125, top] };
local backWall(z, y) =
  local t = 0.26 + (w.noise(z, y, 29) - 0.5) * 0.8;
  if y > s.fairingTop then null
  else { slot: s.damage(t, 'paint'), w: [s.sleeperBack, s.sleeperBack + 0.0625] };
local windscreen(z, y) =
  local top = cabTop(s.cabFront - 0.1, z);
  local t = hit(s.cabFront, y + z, 31);
  local post = abs(z) < 0.06;
  if y > top then null
  else if y > 1.92 && abs(z) < 1.0 && !post then null
  else { slot: if post then 'bare' else s.damage(t, 'paint'), w: [s.cabFront - 0.06, s.cabFront] };
local tri(x) = abs(std.mod(x * 3.1 + 40, 1) - 0.5) * 2;
local bonnetTop(x, z) =
  q(1.9 - 0.1 * (x - s.cabFront) + 0.16 * (tri(x + 0.14 * z) - 0.5) + (w.noise(x, z, 37) - 0.5) * 0.16 - (if abs(z) > 0.6 then 0.08 else 0), 0.0625);
local bonnet(x, z) =
  local t = hit(x + 0.6, z + 5, 41) - 0.26;
  local top = bonnetTop(x, z);
  { slot: if tri(x + 0.14 * z) > 0.86 then 'crease' else s.damage(t, 'paint'), w: [top - 0.125, top] };
local bonnetSide(sign, seed) = function(x, y)
  local t = hit(x + 0.6, y, seed) - 0.22;
  local top = bonnetTop(x, sign * s.bonnetZ);
  local face = sign * (s.bonnetZ + q((w.noise(x, y, seed + 3) - 0.5) * 0.28, 0.0625));
  if y > top then null
  else { slot: s.damage(t, 'paint'), w: [face - 0.0625, face + 0.0625] };
local wing(x, z) =
  local t = hit(x + 0.6, z, 47) - 0.2;
  local y = q(s.wingY + 0.1 * (s.cabFront - x) + (w.noise(x, z, 49) - 0.5) * 0.32, 0.0625);
  if t > 0.92 then null else { slot: s.damage(t, 'paint'), w: [y - 0.0625, y] };
local wingSide(sign, seed) = function(x, y)
  local t = hit(x + 0.6, y, seed) - 0.2;
  local top = q(s.wingY + 0.1 * (s.cabFront - x), 0.0625);
  local face = sign * (s.wingZ + q((w.noise(x, y, seed + 2) - 0.5) * 0.24, 0.0625));
  // The arch the front wheel sat in.
  local arch = (x - 2.72) * (x - 2.72) + (y - 0.52) * (y - 0.52) < 0.45;
  if y > top || arch then null
  else { slot: s.damage(t, 'paint'), w: [face - 0.0625, face + 0.0625] };
local grille(z, y) =
  local top = bonnetTop(s.noseX, z);
  local bar = std.mod(y + 8, 0.14) < 0.07;
  local x = s.noseX + q((w.noise(z, 3.3, 53) - 0.5) * 0.3, 0.03125);
  local edge = abs(z) > 0.56;
  if y > top then null
  else if edge then { slot: 'chrome', w: [x, x + 0.08] }
  else { slot: if bar then 'chrome' else 'crease', w: [x - (if bar then 0 else 0.06), x + 0.04] };
// Earth shoved up ahead of the buried nose, thinning out along both flanks to where the rails go under.
local mound(x, z) =
  local n = w.noise(x, z, 59);
  local along = if x > 2.9 then (x - 2.9) / 1.15 else (x - 2.9) / 1.6;
  local d = std.sqrt(along * along + (z / 1.5) * (z / 1.5)) + (n - 0.5) * 0.5;
  local ridge = std.max(0, 1 - abs(d - 0.85) / 0.34);
  local h = q((ridge * (if x > 3.1 then 0.46 else 0.2) + (if d < 0.85 then 0.07 else 0)) * (0.6 + 0.8 * n), 0.0625);
  if h < 0.06 then null
  else { slot: if w.hash(std.floor(x * 5), std.floor(z * 5), 61) > 0.975 then 'stone' else 'earth', w: [0, h] };
local tank(x, y) =
  local t = 0.26 + (w.noise(x, y, 67) - 0.5) * 0.9;
  { slot: s.damage(t, 'chrome'), w: [1.18, 1.24] };
local rail(sign) =
  local z = sign * s.railZ;
  s.box('rail_' + (if sign > 0 then 'near' else 'far'), 'frame', [s.rear, s.rail[0], std.min(z, z + 0.1)], [3.2, s.rail[1], std.max(z, z + 0.1)]);
local seatFrame(id, x, z) = std.flattenArrays([
  s.poly(id + '_cushion_a', 'bare', w.bar([x - 0.22, s.floor + 0.42], [x + 0.26, s.floor + 0.4], 0.04), [z - 0.25, z - 0.21]),
  s.poly(id + '_cushion_b', 'bare', w.bar([x - 0.22, s.floor + 0.42], [x + 0.26, s.floor + 0.4], 0.04), [z + 0.21, z + 0.25]),
  s.box(id + '_pedestal', 'crease', [x - 0.16, s.floor, z - 0.18], [x + 0.16, s.floor + 0.36, z + 0.18]),
  s.poly(id + '_back_a', 'rust', w.bar([x - 0.22, s.floor + 0.42], [x - 0.36, s.floor + 0.98], 0.04), [z - 0.25, z - 0.21]),
  s.poly(id + '_back_b', 'rust', w.bar([x - 0.22, s.floor + 0.42], [x - 0.36, s.floor + 0.98], 0.04), [z + 0.21, z + 0.25]),
]);
local rearWheel(id, massKg) = k.compound(id, massKg, [
  k.turned('tyre_outer', 'rubber', 'z', k.annulus(s.rimR, s.wheelR, 0.03, 0.32)) + { sides: 24 },
  k.turned('tyre_inner', 'rubber', 'z', k.annulus(s.rimR, s.wheelR, -0.3, -0.01)) + { sides: 24 },
  k.turned('rim', 'bare', 'z', k.disc(s.rimR, -0.25, 0.3)) + { sides: 24 },
  k.turned('hub', 'crease', 'z', k.disc(0.12, 0.3, 0.33)) + { sides: 12 },
  // A strip of tread torn loose, so the tyre is not read as whole.
  box('tread_a', 'tread', [-0.12, s.wheelR - 0.02, 0.08], [0.28, s.wheelR + 0.01, 0.28]),
], { rubber: 'rubber-black', bare: 'scrap-rusted', crease: 'steel-spall-black', tread: 'rubber-offblack' });
local frontWheelDisc = [
  k.turned('tyre', 'rubber', 'z', k.annulus(s.rimR, s.wheelR + 0.01, -0.14, 0.14)) + { sides: 24 },
  k.turned('rim', 'bare', 'z', k.disc(s.rimR, -0.1, 0.12)) + { sides: 24 },
  k.turned('hub', 'crease', 'z', k.disc(0.12, 0.12, 0.17)) + { sides: 12 },
];
[
  k.compound('jackknifed_lorry_cab_chassis', 2350,
             rail(1) + rail(-1) + std.flattenArrays([
               s.box('cross_' + i, 'frame', [-3.3 + i * 1.1, s.rail[0] + 0.05, -s.railZ], [-3.2 + i * 1.1, s.rail[1] - 0.05, s.railZ])
               for i in std.range(0, 5)
             ]) + std.flattenArrays([
               s.box('axle_' + i, 'crease', [s.rearAxles[i] - 0.09, s.hubY - 0.09, -0.86], [s.rearAxles[i] + 0.09, s.hubY + 0.09, 0.86])
               for i in [0, 1]
             ])
             + s.box('fifth_plate', 'crease', [s.fifth.x - 0.52, s.rail[1], -0.48], [s.fifth.x + 0.46, s.fifth.y - 0.08, 0.48])
             + s.box('fifth_a', 'bare', [s.fifth.x - 0.4, s.fifth.y - 0.08, -0.48], [s.fifth.x + 0.46, s.fifth.y, -0.1])
             + s.box('fifth_b', 'rust', [s.fifth.x - 0.4, s.fifth.y - 0.08, 0.1], [s.fifth.x + 0.46, s.fifth.y, 0.48])
             + s.box('fifth_c', 'rust', [s.fifth.x + 0.1, s.fifth.y - 0.08, -0.1], [s.fifth.x + 0.46, s.fifth.y, 0.1])
             + s.box('tail_bar', 'frame', [s.rear, s.rail[0] - 0.2, -1.2], [s.rear + 0.1, s.rail[0] - 0.08, 1.2])
             + s.box('guard_near', 'paintless', [-3.45, 1.18, 0.62], [-1.5, 1.23, 1.28])
             + s.box('guard_near_drop', 'paintless', [-3.45, 0.84, 0.62], [-3.4, 1.18, 1.28])
             + s.box('guard_far', 'frame', [-3.45, 1.18, -1.28], [-1.5, 1.23, -0.62])
             + s.box('guard_far_drop', 'frame', [-1.56, 0.84, -1.28], [-1.5, 1.18, -0.62])
             + field('floor', 'y', [s.sleeperBack, s.cabFront], [-s.side + 0.05, s.side - 0.05], 0.25, 0.25, function(x, z) { slot: s.damage(0.5 + (w.noise(x, z, 71) - 0.5) * 0.6, 'frame'), w: [s.floor - 0.06, s.floor] }),
             fin + { paintless: 'iron-cast' }),
  k.compound('jackknifed_lorry_cab_near_side', 280,
             field('wall', 'z', [s.sleeperBack, s.cabFront], [s.rail[1], 3.75], 0.125, 0.125, wall(1, 73, true)), fin),
  k.compound('jackknifed_lorry_cab_far_side', 340,
             field('wall', 'z', [s.sleeperBack, s.cabFront], [s.rail[1], 3.75], 0.125, 0.125, wall(-1, 79, false)), fin),
  k.compound('jackknifed_lorry_cab_roof', 260,
             field('skin', 'y', [s.sleeperBack, s.cabFront], [-s.side, s.side], 0.125, 0.125, roof), fin),
  k.compound('jackknifed_lorry_cab_back', 150,
             field('skin', 'x', [-s.side, s.side], [s.rail[1], s.fairingTop], 0.125, 0.25, backWall), fin),
  k.compound('jackknifed_lorry_cab_windscreen_frame', 70,
             field('frame', 'x', [-s.side, s.side], [s.rail[1], 2.3], 0.125, 0.0625, windscreen), fin),
  k.compound('jackknifed_lorry_cab_nose', 1300,
             field('bonnet', 'y', [s.cabFront, s.noseX], [-s.bonnetZ, s.bonnetZ], 0.0625, 0.125, bonnet)
             + field('side_near', 'z', [s.cabFront, s.noseX], [0.7, 2.1], 0.125, 0.125, bonnetSide(1, 83))
             + field('side_far', 'z', [s.cabFront, s.noseX], [0.7, 2.1], 0.125, 0.125, bonnetSide(-1, 89))
             + field('grille', 'x', [-s.bonnetZ, s.bonnetZ], [0.55, 2.0], 0.125, 0.035, grille)
             + field('wing_near', 'y', [s.cabFront, s.noseX], [s.bonnetZ, s.wingZ], 0.125, 0.125, wing)
             + field('wing_far', 'y', [s.cabFront, s.noseX], [-s.wingZ, -s.bonnetZ], 0.125, 0.125, wing)
             + field('wing_side_near', 'z', [s.cabFront, s.noseX], [0.4, 1.8], 0.125, 0.125, wingSide(1, 97))
             + field('wing_side_far', 'z', [s.cabFront, s.noseX], [0.4, 1.8], 0.125, 0.125, wingSide(-1, 101)),
             fin),
  k.compound('jackknifed_lorry_cab_earth', 40,
             w.field('heap', 'y', [1.0, 4.4], [-2.0, 2.0], 0.125, 0.125, mound), fin),
  k.compound('jackknifed_lorry_cab_bumper', 90, [
    // Ripped off one side frame, so its end stands up out of the earth while the rest is under it.
    k.prism('end', 'chrome', w.ccw(w.bar([3.32, 0.06], [3.62, 0.86], 0.24)), [0.72, 1.3]),
    k.prism('end_scrape', 'rust', w.ccw(w.bar([3.48, 0.38], [3.62, 0.8], 0.1)), [0.9, 1.31]),
    box('middle', 'chrome', [3.55, 0.08, -0.72], [3.75, 0.27, 0.72]),
    k.prism('far', 'chrome', w.ccw(w.bar([3.68, 0.06], [3.42, 0.48], 0.2)), [-1.28, -0.72]),
  ], fin),
  k.compound('jackknifed_lorry_cab_near_door', 55, [
    // Sprung past its stop and hanging from the top hinge.
    { id: 'skin', kind: 'prism', slot: 'paint', axis: 'y', profile: w.ccw(w.bar([1.3, 1.92], [2.08, 1.3], 0.07)), start: 0.42, end: 1.22 },
    { id: 'crease_a', kind: 'prism', slot: 'crease', axis: 'y', profile: w.ccw(w.bar([1.54, 1.77], [1.82, 1.55], 0.09)), start: 0.72, end: 0.8 },
    { id: 'rust_a', kind: 'prism', slot: 'rust', axis: 'y', profile: w.ccw(w.bar([1.6, 1.7], [1.92, 1.44], 0.09)), start: 0.42, end: 0.56 },
    { id: 'rust_b', kind: 'prism', slot: 'rust', axis: 'y', profile: w.ccw(w.bar([1.82, 1.5], [2.08, 1.3], 0.09)), start: 0.56, end: 0.68 },
    { id: 'post_a', kind: 'prism', slot: 'paint', axis: 'y', profile: w.ccw(w.bar([1.3, 1.92], [1.36, 1.87], 0.07)), start: 1.22, end: 1.82 },
    { id: 'post_b', kind: 'prism', slot: 'rust', axis: 'y', profile: w.ccw(w.bar([2.02, 1.35], [2.08, 1.3], 0.07)), start: 1.22, end: 1.68 },
    { id: 'top', kind: 'prism', slot: 'paint', axis: 'y', profile: w.ccw(w.bar([1.3, 1.92], [2.08, 1.3], 0.06)), start: 1.68, end: 1.82 },
  ], fin),
  k.compound('jackknifed_lorry_cab_stacks', 45,
             // The near stack bent over at the fold; the far one came away and lies on the ground.
             s.poly('near_low', 'chrome', w.bar([0.44, 1.2], [0.44, 2.75], 0.13), [1.24, 1.36])
             + s.poly('near_high', 'chrome', w.bar([0.44, 2.75], [1.12, 3.32], 0.13), [1.24, 1.36])
             + s.poly('near_tip', 'rust', w.bar([1.12, 3.32], [1.3, 3.42], 0.13), [1.24, 1.36])
             + [
               { id: 'far_pipe', kind: 'prism', slot: 'chrome', axis: 'y', profile: w.ccw(w.bar([-1.72, -1.0], [-2.02, 1.5], 0.13)), start: 0, end: 0.13 },
               { id: 'far_rust', kind: 'prism', slot: 'rust', axis: 'y', profile: w.ccw(w.bar([-1.82, -0.2], [-1.92, 0.65], 0.14)), start: 0, end: 0.14 },
             ],
             fin),
  k.compound('jackknifed_lorry_cab_fuel_tank', 95,
             s.box('case', 'crease', [-1.0, 0.54, 0.62], [0.24, 1.0, 1.18])
             + field('skin', 'z', [-1.0, 0.24], [0.54, 1.0], 0.0625, 0.0625, tank)
             + s.box('strap_a', 'frame', [-0.8, 0.5, 0.6], [-0.74, 1.02, 1.26])
             + s.box('strap_b', 'frame', [-0.02, 0.5, 0.6], [0.04, 1.02, 1.26]),
             fin),
  k.compound('jackknifed_lorry_cab_seat_frames', 30, seatFrame('near', 1.05, 0.56) + seatFrame('far', 1.05, -0.56), fin),
  k.compound('jackknifed_lorry_cab_dash', 30,
             s.box('console', 'crease', [1.62, s.floor, -1.0], [1.92, 1.82, 1.0])
             + s.poly('column', 'bare', w.bar([1.65, 1.5], [1.4, 1.74], 0.05), [0.53, 0.59])
             + s.poly('wheel', 'crease', w.bar([1.26, 1.62], [1.52, 1.88], 0.05), [0.36, 0.76]),
             fin),
  rearWheel('jackknifed_lorry_cab_rear_wheel', 125),
  k.compound('jackknifed_lorry_cab_loose_wheel', 85, [
    // Torn off the buried axle and lying on its side.
    k.turned('tyre', 'rubber', 'y', k.annulus(s.rimR, s.wheelR + 0.01, 0, 0.26)) + { sides: 24 },
    k.turned('rim', 'bare', 'y', k.disc(s.rimR, 0.03, 0.2)) + { sides: 24 },
    k.turned('hub', 'crease', 'y', k.disc(0.12, 0.2, 0.25)) + { sides: 12 },
  ], { rubber: 'rubber-black', bare: 'scrap-rusted', crease: 'steel-spall-black' }),
  k.compound('jackknifed_lorry_cab_jammed_wheel', 85, frontWheelDisc, { rubber: 'rubber-black', bare: 'scrap-rusted', crease: 'steel-spall-black' }),
]
