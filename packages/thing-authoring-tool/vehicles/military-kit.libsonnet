// Pressings the military family shares. `truckRows`, `truckItems` and `truckFittings` press one high-clearance
// bonneted six-wheeled chassis per vehicle id, so its cargo and box bodies differ only by what stands on the deck.
// The item and fitting builders take deadvox's vehicle kit as an argument because this file also evaluates in the thing tool.
local k = import 'kit.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
// A prism along x has the (y, z) profile.
local xPrism(id, slot, profile, x) = { id: id, kind: 'prism', slot: slot, axis: 'x', profile: profile, start: x[0], end: x[1] };
local slats(id, slot, from, to, count, make) = [
  local at = from + (to - from) * i / (count - 1);
  make(id + '_' + i, slot, at)
  for i in std.range(0, count - 1)
];
local arcY(a, dx) = a.y + std.sqrt(std.max(0, a.r * a.r - dx * dx));
// A flat panel at `z` from x[0] to x[1] and y[0] to y[1] with round wheel openings: full-height piers between
// the openings and vertical-sided columns over each arc. `arches` are { x, y, r } hub centres, sorted by x.
local arched(id, slot, x, y, z, arches, steps=8) =
  local n = std.length(arches);
  local edges = [x[0]] + std.flattenArrays([[a.x - a.r, a.x + a.r] for a in arches]) + [x[1]];
  [
    box(id + '_pier_' + i, slot, [edges[2 * i], y[0], z[0]], [edges[2 * i + 1], y[1], z[1]])
    for i in std.range(0, n)
    if edges[2 * i + 1] > edges[2 * i]
  ] + std.flattenArrays([
    local a = arches[j];
    [
      local x0 = a.x - a.r + 2 * a.r * i / steps;
      local x1 = a.x - a.r + 2 * a.r * (i + 1) / steps;
      local y0 = std.max(y[0], arcY(a, x0 - a.x));
      local y1 = std.max(y[0], arcY(a, x1 - a.x));
      prism(id + '_arc_' + j + '_' + i, slot, [[x0, y0], [x1, y1], [x1, y[1]], [x0, y[1]]], z)
      for i in std.range(0, steps - 1)
    ]
    for j in std.range(0, n - 1)
  ]);
// A military flat guard: a level top with ends sloping down, from `inner` to `outer` across z.
local flatGuard(id, slot, x, top, drop, run, z, thick=0.04) = [
  box(id + '_top', slot, [x[0], top - thick, z[0]], [x[1], top, z[1]]),
  prism(id + '_fore', slot, [[x[1], top - thick], [x[1] + run, top - thick - drop], [x[1] + run, top - drop], [x[1], top]], z),
  prism(id + '_aft', slot, [[x[0] - run, top - thick - drop], [x[0], top - thick], [x[0], top], [x[0] - run, top - drop]], z),
];

local truckDefaults = {
  paint: 'paint-olive',
  frame: 'steel-parkerized',
  gearboxLength: 0.72,
  engineLength: 0.86,
};
local truckSpec(s) = truckDefaults + s;

local truckRows(id, s0) = {
  local s = truckSpec(s0),
  local finish = { paint: s.paint, trim: 'paint-charcoal', glass: 'glass-clear', dark: 'steel-spall-black', frame: s.frame, liner: 'cloth-olive-drab', spring: 'steel-grey' },
  local bogie = (s.rearAxles[0] + s.rearAxles[1]) / 2,
  local cross = [s.rear + 0.1 + i * (s.nose - s.rear - 0.3) / 7 for i in std.range(0, 7)],
  local bearers = [s.bedRear + 0.1 + i * (s.bedFront - s.bedRear - 0.2) / 6 for i in std.range(0, 6)],
  rows: [
    k.compound(id + '_chassis', s.chassisMass, [
      box('crossmember_' + i, 'frame', [cross[i] - 0.05, s.railBottom + 0.03, -s.railZ], [cross[i] + 0.05, s.railTop - 0.03, s.railZ])
      for i in std.range(0, 7)
    ] + [
      box('bearer_' + i, 'frame', [bearers[i] - 0.05, s.runnerTop, -s.bedSide + 0.02], [bearers[i] + 0.05, s.deckBottom, s.bedSide - 0.02])
      for i in std.range(0, 6)
    ] + [
      box('bed_web', 'dark', [s.bedRear + 0.02, s.runnerTop, -0.04], [s.bedFront, s.deckBottom, 0.04]),
    ] + bothSides([
      box('rail', 'frame', [s.rear + 0.04, s.railBottom, s.railZ - 0.08], [s.nose, s.railTop, s.railZ]),
      box('runner', 'frame', [s.bedRear + 0.02, s.railTop, s.railZ - 0.08], [s.bedFront, s.runnerTop, s.railZ]),
      prism('front_spring', 'spring', [[s.frontAxle - 0.6, s.railBottom - 0.06], [s.frontAxle - 0.12, 0.62], [s.frontAxle + 0.12, 0.62], [s.frontAxle + 0.6, s.railBottom - 0.06], [s.frontAxle + 0.6, s.railBottom], [s.frontAxle - 0.6, s.railBottom]], [s.railZ - 0.04, s.railZ + 0.1]),
      box('walking_beam', 'spring', [s.rearAxles[1] - 0.14, 0.59, s.railZ + 0.02], [s.rearAxles[0] + 0.14, 0.74, s.railZ + 0.14]),
      box('trunnion', 'frame', [bogie - 0.2, 0.74, s.railZ - 0.08], [bogie + 0.2, s.railBottom, s.railZ + 0.1]),
      box('bumper_hanger', 'frame', [s.nose - 0.1, s.railBottom, s.railZ - 0.08], [s.nose + 0.04, s.bumperLow, s.railZ]),
      box('step_hanger', 'frame', [s.doorRear + 0.3, s.stepY, s.railZ], [s.doorRear + 0.38, s.stepY + 0.05, s.side + 0.1]),
      box('step_post', 'frame', [s.doorRear + 0.3, s.stepY + 0.05, s.railZ], [s.doorRear + 0.38, s.railBottom + 0.08, s.railZ + 0.06]),
    ]) + [
      box('tank_strap', 'frame', [s.tankX - 0.2, 0.52, s.railZ], [s.tankX + 0.2, 0.55, 1.04]),
      box('tank_hanger', 'frame', [s.tankX - 0.04, 0.52, s.railZ], [s.tankX + 0.04, s.railBottom + 0.1, s.railZ + 0.08]),
      box('locker', 'paint', [s.lockerX[0], s.lockerY[0], -0.96], [s.lockerX[1], s.lockerY[1], -s.railZ - 0.02]),
      box('locker_lid', 'trim', [s.lockerX[0] + 0.04, s.lockerY[0] + 0.05, -0.97], [s.lockerX[1] - 0.04, s.lockerY[1] - 0.05, -0.96]),
      box('locker_hanger', 'frame', [s.lockerX[0] + 0.1, s.lockerY[1], -0.5], [s.lockerX[1] - 0.1, s.railBottom + 0.04, -s.railZ]),
    ], finish),
    k.compound(id + '_cab', s.shellMass, bothSides([
      box('sill', 'paint', [s.cabBack, s.floor - 0.12, s.skin], [s.cabFront, s.floor, s.side]),
      box('rear_post', 'paint', [s.cabBack, s.floor, s.skin], [s.doorRear, s.roof, s.side]),
      box('corner', 'paint', [s.doorFront, s.floor, s.skin], [s.cabFront, s.waist, s.side]),
      box('a_post', 'paint', [s.doorFront + 0.1, s.waist, s.skin], [s.cabFront, s.roof, s.side]),
      box('cant_rail', 'paint', [s.cabBack, s.roof - 0.08, s.skin], [s.cabFront, s.roof, s.side]),
    ]) + [
      box('floor', 'trim', [s.cabBack, s.floor - 0.05, -s.skin], [s.cabFront, s.floor, s.skin]),
      box('tunnel', 'trim', [s.cabBack + 0.1, s.floor, -0.22], [s.cabFront, s.floor + 0.28, 0.22]),
      box('back_lower', 'paint', [s.cabBack, s.floor - 0.05, -s.side], [s.cabBack + 0.05, s.waist, s.side]),
      box('back_upper', 'paint', [s.cabBack, s.roof - 0.1, -s.side], [s.cabBack + 0.05, s.roof, s.side]),
      box('back_post', 'paint', [s.cabBack, s.waist, -0.12], [s.cabBack + 0.05, s.roof - 0.1, 0.12]),
      box('firewall', 'paint', [s.cabFront - 0.06, s.floor - 0.05, -s.side], [s.cabFront, s.waist, s.side]),
      box('centre_post', 'paint', [s.cabFront - 0.05, s.waist, -0.04], [s.cabFront, s.roof, 0.04]),
      box('roof', 'paint', [s.cabBack - 0.02, s.roof, -s.side - 0.02], [s.cabFront + 0.08, s.roof + 0.05, s.side + 0.02]),
      box('roof_crown', 'paint', [s.cabBack + 0.08, s.roof + 0.05, -s.side + 0.12], [s.cabFront - 0.1, s.roof + 0.09, s.side - 0.12]),
      box('headliner', 'liner', [s.cabBack + 0.05, s.roof - 0.02, -s.skin], [s.cabFront - 0.06, s.roof, s.skin]),
    ], finish),
    k.compound(id + '_door', 55, [
      box('skin', 'paint', [s.doorRear, s.floor, s.skin], [s.doorFront, s.waist, s.side]),
      box('rail_rear', 'paint', [s.doorRear, s.waist, s.skin], [s.doorRear + 0.06, s.roof - 0.08, s.side]),
      box('rail_front', 'paint', [s.doorFront - 0.06, s.waist, s.skin], [s.doorFront + 0.1, s.roof - 0.08, s.side]),
      box('glass', 'glass', [s.doorRear + 0.06, s.waist, s.skin + 0.01], [s.doorFront - 0.06, s.roof - 0.08, s.skin + 0.03]),
      box('handle', 'trim', [s.doorRear + 0.08, s.waist - 0.12, s.side], [s.doorRear + 0.22, s.waist - 0.08, s.side + 0.02]),
      box('hinge_top', 'trim', [s.doorFront - 0.03, s.waist - 0.14, s.side], [s.doorFront + 0.04, s.waist - 0.08, s.side + 0.015]),
      box('hinge_low', 'trim', [s.doorFront - 0.03, s.floor + 0.12, s.side], [s.doorFront + 0.04, s.floor + 0.18, s.side + 0.015]),
    ], finish, { hinge_a: ['skin', [1, 0.2, 1]], hinge_b: ['skin', [1, 0.8, 1]] }),
    k.compound(id + '_windscreen', 26, [
      box('glass_' + side.n, 'glass', [s.cabFront - 0.04, s.waist, side.a], [s.cabFront - 0.01, s.roof - 0.02, side.b])
      for side in [{ n: 'near', a: 0.04, b: s.skin }, { n: 'far', a: -s.skin, b: -0.04 }]
    ] + bothSides([
      box('back_glass', 'glass', [s.cabBack + 0.01, s.waist, 0.12], [s.cabBack + 0.04, s.roof - 0.1, s.skin]),
    ]), { glass: 'glass-clear' }),
    k.compound(id + '_fuel_tank', 28, [
      box('tank', 'paint', [-0.45, 0, -0.26], [0.45, 0.52, 0.26]),
      box('filler', 'dark', [0.28, 0.52, -0.05], [0.38, 0.55, 0.05]),
    ], finish),
    k.compound(id + '_dashboard', 25, [
      box('panel', 'trim', [s.cabFront - 0.22, s.floor + 0.42, -s.skin], [s.cabFront - 0.06, s.waist, s.skin]),
      box('column', 'trim', [s.cabFront - 0.3, s.floor + 0.8, -s.seatZ - 0.03], [s.cabFront - 0.22, s.floor + 0.86, -s.seatZ + 0.03]),
    ], finish),
    k.compound(id + '_bonnet', 85, [
      prism('top', 'paint', [[s.cabFront, s.bonnetBack - 0.05], [s.nose, s.bonnetFront - 0.05], [s.nose, s.bonnetFront], [s.cabFront, s.bonnetBack]], [-s.bonnetZ, s.bonnetZ]),
    ] + bothSides([
      prism('side', 'paint', [[s.cabFront, s.bonnetLow], [s.nose, s.bonnetLow], [s.nose, s.bonnetFront - 0.04], [s.cabFront, s.bonnetBack - 0.04]], [s.bonnetZ - 0.03, s.bonnetZ]),
    ] + slats('louvre', 'trim', s.cabFront + 0.3, s.nose - 0.5, 5, function(id, slot, x) box(id, slot, [x, s.bonnetLow + 0.3, s.bonnetZ], [x + 0.08, s.bonnetBack - 0.18, s.bonnetZ + 0.01]))), finish),
    k.compound(id + '_grille', 60, [
      box('backing', 'dark', [s.nose - 0.03, s.bonnetLow - 0.04, -s.bonnetZ], [s.nose + 0.03, s.bonnetFront, s.bonnetZ]),
      box('head', 'paint', [s.nose + 0.03, s.bonnetFront - 0.08, -s.bonnetZ - 0.02], [s.nose + 0.08, s.bonnetFront + 0.02, s.bonnetZ + 0.02]),
      box('foot', 'paint', [s.nose + 0.03, s.bonnetLow - 0.04, -s.bonnetZ - 0.02], [s.nose + 0.08, s.bonnetLow + 0.04, s.bonnetZ + 0.02]),
    ] + bothSides([
      box('cheek', 'paint', [s.nose + 0.03, s.bonnetLow - 0.04, s.bonnetZ - 0.04], [s.nose + 0.08, s.bonnetFront + 0.02, s.bonnetZ + 0.02]),
    ]) + slats('bar', 'paint', -s.bonnetZ + 0.12, s.bonnetZ - 0.12, 9, function(id, slot, z) box(id, slot, [s.nose + 0.03, s.bonnetLow + 0.04, z - 0.025], [s.nose + 0.07, s.bonnetFront - 0.08, z + 0.025])), finish),
    k.compound(id + '_wing', 48, flatGuard('guard', 'paint', [s.frontAxle - 0.46, s.frontAxle + 0.72], s.wingTop, 0.3, 0.3, [s.bonnetZ, s.wingZ], 0.05) + [
      box('apron', 'paint', [s.cabFront, s.bonnetLow, s.bonnetZ], [s.frontAxle + 0.72, s.wingTop - 0.05, s.bonnetZ + 0.03]),
      box('lip', 'paint', [s.frontAxle - 0.46, s.wingTop - 0.1, s.wingZ - 0.02], [s.frontAxle + 0.72, s.wingTop - 0.05, s.wingZ]),
      box('running_board', 'trim', [s.cabBack + 0.02, s.boardY, s.skin - 0.1], [s.frontAxle - 0.76, s.boardY + 0.05, s.wingZ]),
      box('board_hanger', 'frame', [s.doorRear + 0.05, s.boardY - 0.03, s.railZ], [s.doorRear + 0.13, s.boardY, s.wingZ - 0.02]),
      box('board_tie', 'frame', [s.doorRear + 0.05, s.boardY + 0.05, s.skin - 0.04], [s.doorRear + 0.13, s.floor - 0.12, s.skin]),
      box('step', 'trim', [s.doorRear + 0.22, s.stepY + 0.05, s.side + 0.02], [s.doorFront - 0.2, s.stepY + 0.09, s.side + 0.18]),
      box('step_tread_post', 'frame', [s.doorRear + 0.3, s.stepY + 0.05, s.side + 0.04], [s.doorRear + 0.36, s.boardY, s.side + 0.08]),
    ], finish),
    k.compound(id + '_rear_mudguard', 22, flatGuard('guard', 'paint', [s.rearAxles[1] - s.r - 0.08, s.rearAxles[0] + s.r + 0.08], s.mudguardTop, 0.22, 0.12, [s.railZ + 0.16, s.bedSide - 0.03], 0.04) + [
      box('hanger_fore', 'frame', [s.rearAxles[0] + 0.42, s.mudguardTop, s.railZ + 0.2], [s.rearAxles[0] + 0.5, s.deckBottom, s.railZ + 0.28]),
      box('hanger_aft', 'frame', [s.rearAxles[1] - 0.5, s.mudguardTop, s.railZ + 0.2], [s.rearAxles[1] - 0.42, s.deckBottom, s.railZ + 0.28]),
      box('flap', 'dark', [s.rearAxles[1] - s.r - 0.22, s.r - 0.2, s.railZ + 0.4], [s.rearAxles[1] - s.r - 0.2, s.mudguardTop - 0.26, s.bedSide - 0.03]),
    ], finish),
    k.compound(id + '_front_bumper', 110, [
      box('bar', 'paint', [s.nose + 0.04, s.bumperLow, -s.wingZ], [s.front, s.bumperTop, s.wingZ]),
      box('winch', 'dark', [s.nose + 0.08, s.bumperTop, -0.26], [s.front - 0.02, s.bumperTop + 0.14, 0.26]),
    ] + bothSides([
      box('tow_eye', 'dark', [s.front, s.bumperLow + 0.06, 0.5], [s.front + 0.04, s.bumperTop - 0.06, 0.56]),
    ]), finish),
    k.compound(id + '_rear_bumper', 40, [
      box('bar', 'frame', [s.rear, s.railBottom - 0.22, -s.bedSide + 0.1], [s.rear + 0.1, s.railBottom - 0.08, s.bedSide - 0.1]),
    ] + bothSides([
      box('hanger', 'frame', [s.rear + 0.02, s.railBottom - 0.08, s.railZ - 0.08], [s.rear + 0.1, s.railBottom + 0.04, s.railZ]),
    ]), finish),
  ],
}.rows;

local truckItems(kit, id, name, s) = local pile = kit.pileSize; [
  kit.part(id + '_chassis', name + ' chassis', pile, ['structure']),
  kit.part(id + '_cab', name + ' cab', pile, ['structure', 'protection']),
  kit.part(id + '_door', name + ' door', pile, ['entry', 'glazing', 'protection']),
  kit.part(id + '_windscreen', name + ' windscreen', pile, ['glazing']),
  kit.part(id + '_dashboard', name + ' dashboard', pile, ['structure']),
  kit.part(id + '_bonnet', name + ' bonnet', pile, ['protection']),
  kit.part(id + '_grille', name + ' grille', pile, ['protection']),
  kit.part(id + '_wing', name + ' wing', pile, ['protection']),
  kit.part(id + '_rear_mudguard', name + ' rear mudguard', pile, ['protection']),
  kit.part(id + '_front_bumper', name + ' front bumper', pile, ['protection']),
  kit.part(id + '_rear_bumper', name + ' rear bumper', pile, ['protection']),
  kit.part(id + '_fuel_tank', name + ' fuel tank', [9, 5], ['fuel']),
];

local truckFittings(kit, id, s0) =
  local s = truckSpec(s0);
  local fitting = kit.fitting;
  local pair = kit.pair;
  local on = kit.on;
  local origin = kit.origin;
  local bogie = (s.rearAxles[0] + s.rearAxles[1]) / 2;
  local gearboxX = s.engineX - s.engineLength / 2 - s.gearboxLength / 2;
  local shaftFrom = gearboxX - s.gearboxLength / 2;
  [
    fitting('chassis', id + '_chassis', origin),
    fitting('cab', id + '_cab', origin, ['chassis']),
    fitting('windscreen', id + '_windscreen', origin, ['cab']),
    fitting('dashboard', id + '_dashboard', origin, ['cab']),
    fitting('bonnet', id + '_bonnet', origin, ['chassis']),
    fitting('grille', id + '_grille', origin, ['chassis']),
    fitting('front_bumper', id + '_front_bumper', origin, ['chassis']),
    fitting('rear_bumper', id + '_rear_bumper', origin, ['chassis']),
    fitting('front_axle', 'steered_axle_heavy', [s.frontAxle, s.r - 0.52, 0], ['chassis']),
    fitting('rear_axle_0', 'beam_axle_truck', [s.rearAxles[0], s.r - 0.52, 0], ['chassis']),
    fitting('rear_axle_1', 'beam_axle_truck', [s.rearAxles[1], s.r - 0.52, 0], ['chassis']),
    fitting('engine', 'engine_i6_diesel', [s.engineX, s.engineY, 0], ['chassis']),
    fitting('gearbox', 'gearbox_truck', [gearboxX, s.engineY + 0.1, 0], ['engine']),
    fitting('prop_shaft', 'prop_shaft_long', [(shaftFrom + s.rearAxles[0]) / 2, s.railBottom - 0.04, 0], ['gearbox', 'rear_axle_0']),
    fitting('inter_axle_shaft', 'prop_shaft_short', [bogie, s.r + 0.14, 0], ['rear_axle_0', 'rear_axle_1']),
    fitting('radiator', 'radiator_truck', [s.nose - 0.14, 0.98, 0], ['chassis']),
    fitting('fuel_tank', id + '_fuel_tank', [s.tankX, 0.55, s.tankZ], ['chassis']),
    fitting('exhaust', 'exhaust_side_high', [s.cabBack - 0.01, 1.05, s.side], ['engine', 'chassis']),
    fitting('steering_wheel', 'steering_wheel', [s.cabFront - 0.32, s.floor + 0.83, -s.seatZ], ['dashboard']),
    fitting('gear_lever', 'gear_lever', [s.cabFront - 0.42, s.floor + 0.28, 0], ['cab']),
    fitting('battery_tray', 'truck_battery_tray', [-0.15, 0.96, 0], ['chassis']),
    fitting('battery', 'car_battery', [-0.15, 0.99, 0], ['battery_tray']),
  ]
  + pair('front_wheel', s.wheel, [s.frontAxle, s.r, s.wheelZ], on(['front_axle']))
  + pair('middle_wheel', s.wheel, [s.rearAxles[0], s.r, s.wheelZ], on(['rear_axle_0']))
  + pair('rear_wheel', s.wheel, [s.rearAxles[1], s.r, s.wheelZ], on(['rear_axle_1']))
  + pair('seat', 'front_seat', [s.cabBack + 0.52, s.floor, s.seatZ], on(['cab']))
  + pair('door', id + '_door', origin, on(['cab']))
  + pair('wing', id + '_wing', origin, on(['chassis']))
  + pair('rear_mudguard', id + '_rear_mudguard', origin, on(['chassis']))
  + pair('mirror', 'door_mirror_large', [s.doorFront + 0.04, s.waist, s.side], on(['cab']))
  + pair('headlamp', 'headlamp_military', [s.nose + 0.07, s.lampY - 0.125, s.lampZ], on(['grille']))
  + pair('side_lamp', 'marker_lamp', [s.frontAxle + 0.5, s.wingTop, s.wingZ - 0.14], on(paired=['wing']))
  + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.01, s.railBottom - 0.2, s.bedSide - 0.36], on(['rear_bumper']));

{
  xPrism: xPrism,
  slats: slats,
  arched: arched,
  flatGuard: flatGuard,
  truckSpec: truckSpec,
  truckRows: truckRows,
  truckItems: truckItems,
  truckFittings: truckFittings,
}
