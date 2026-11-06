local k = import 'kit.libsonnet';
local s = import 'ambulance.spec.libsonnet';
local van = import 'van-body.libsonnet';
local tail = van.tail(s);
local grain = 1 / 32;
local block = 0.28;
local rowHeight = 0.14;
local low = s.bands[0].y[1];
local slot(i, row) = if (i + row) % 2 == 0 then 'yellow' else 'green';
local colours = { yellow: 'reflective-yellow', green: 'paint-green', cross: 'paint-green' };
// A green cross on the white body, centred at (u, v) on a face whose in-plane axes `face` maps to a box: a full upright
// and an arm each side, so no two pieces overlap.
local plus(tag, u, v, half, arm, face) = [
  face(tag + '_upright', [u - arm, u + arm], [v - half, v + half]),
  face(tag + '_arm_low', [u - half, u - arm], [v - arm, v + arm]),
  face(tag + '_arm_high', [u + arm, u + half], [v - arm, v + arm]),
];
local sidePlus(tag, z0, z1) = plus(tag, -1.5, 2.0, 11 * grain, 4 * grain, function(id, x, y) k.box(id, 'cross', [x[0], y[0], z0], [x[1], y[1], z1]));
// The chequer cells of one wall between x0 and x1, cut to that span, so a wall and its door stay in step.
local checks(tag, x0, x1, z0, z1) = [
  k.box(tag + '_' + i + '_' + row, slot(i, row), [std.max(tail + i * block, x0), low + row * rowHeight, z0], [std.min(tail + (i + 1) * block, x1), low + (row + 1) * rowHeight, z1])
  for i in std.range(0, std.floor((s.box.slideFront - tail) / block) - 1)
  for row in [0, 1]
  if std.max(tail + i * block, x0) < std.min(tail + (i + 1) * block, x1)
];
van.rows('ambulance', s) + [
  // A two-row chequer above the stripe and a green cross between the window and the side door on each wall and on the
  // roof, which tell this box from a parcel van's.
  k.compound('ambulance_markings', 3, checks('far', tail, s.box.slideFront, -s.box.side - grain, -s.box.side)
                                      + checks('near_rear', tail, s.slideRear, s.box.side, s.box.side + grain)
                                      + sidePlus('far_plus', -s.box.glassOut - grain, -s.box.glassOut)
                                      + sidePlus('near_plus', s.box.glassOut, s.box.glassOut + grain)
                                      + plus('roof_plus', -1.5, 0, 16 * grain, 5 * grain, function(id, x, z) k.box(id, 'cross', [x[0], s.box.roof, z[0]], [x[1], s.box.roof + grain, z[1]])), colours),
  // On the door, so these move with it.
  k.compound('ambulance_door_markings', 1, checks('door', s.slideRear, s.box.slideFront, s.box.side, s.box.side + grain), colours),
  // One rear leaf's cross, below its glass.
  k.compound('ambulance_rear_markings', 1, plus('plus', 16 * grain, 42 * grain, 8 * grain, 3 * grain, function(id, z, y) k.box(id, 'cross', [tail - grain, y[0], z[0]], [tail, y[1], z[1]])), colours),
  k.compound('ambulance_locker', 70, [
    k.box('carcass', 'unit', [-2.6, s.box.floor, -s.box.skin], [-0.9, 1.56, -0.56]),
    k.box('door_seam_low', 'trim', [-2.6, 1.2, -0.56], [-0.9, 1.22, -0.55]),
    k.box('door_seam_mid', 'trim', [-1.76, s.box.floor, -0.56], [-1.74, 1.56, -0.55]),
  ], { unit: 'plastic-white', trim: 'plastic-grey' }),
]
