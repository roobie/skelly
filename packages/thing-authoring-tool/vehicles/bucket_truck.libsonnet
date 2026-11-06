local t = import 'truck-cab.libsonnet';
local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local box = k.box;
local s = import 'bucket_truck.spec.libsonnet';
local finish = { paint: s.paint, frame: 'paint-charcoal', steel: 'steel-grey', alu: 'alu-bare', dark: 'plastic-black', reflect: 'reflective-yellow', orange: 'plastic-orange', insulated: 'plastic-yellow', red: 'plastic-red', cone: 'plastic-hivis' };
local doors = [[-3.55, -2.55], [-2.45, -1.0], [-0.9, 0.3], [0.4, 1.74]];
local basketZ = 0.4;
t.rows('bucket_truck', s) + [
  k.compound('bucket_truck_subframe', 300, [
    box('deck', 'alu', [s.bodyRear, s.deckTop - 0.06, -0.72], [s.bodyFront, s.deckTop, 0.72]),
    box('tail', 'frame', [s.bodyRear, s.lockerBottom, -0.72], [s.bodyRear + 0.06, s.deckTop - 0.06, 0.72]),
  ] + k.bothSides([
    box('runner', 'frame', [s.bodyRear + 0.06, s.railTop, 0.3], [s.bodyFront, s.deckTop - 0.06, 0.44]),
  ]) + [
    box('chevron_' + i, if i % 2 == 0 then 'red' else 'paint', [s.bodyRear - 0.02, s.lockerBottom + 0.06, -s.side + i * s.side / 3], [s.bodyRear, s.lockerBottom + 0.2, -s.side + (i + 1) * s.side / 3])
    for i in std.range(0, 5)
  ], finish),
  k.compound('bucket_truck_locker', 170, [
    box('case', 'paint', [s.bodyRear, s.lockerBottom + 0.06, s.lockerIn], [s.bodyFront - 0.02, s.deckTop + 0.3, s.side]),
    box('lid', 'alu', [s.bodyRear - 0.02, s.deckTop + 0.3, s.lockerIn - 0.02], [s.bodyFront, s.deckTop + 0.33, s.side + 0.01]),
    box('band', 'reflect', [s.bodyRear, s.deckTop + 0.1, s.side], [s.bodyFront - 0.02, s.deckTop + 0.17, s.side + 0.012]),
  ] + std.flattenArrays([
    [
      box('seam_' + i, 'dark', [doors[i][0] - 0.03, s.lockerBottom + 0.14, s.side], [doors[i][0], s.deckTop + 0.1, s.side + 0.012]),
      box('handle_' + i, 'frame', [(doors[i][0] + doors[i][1]) / 2 - 0.12, s.deckTop - 0.12, s.side], [(doors[i][0] + doors[i][1]) / 2 + 0.12, s.deckTop - 0.06, s.side + 0.03]),
    ]
    for i in std.range(0, 3)
  ]), finish),
  k.compound('bucket_truck_turret', 480, [
    k.turned('ring', 'frame', 'y', k.disc(0.5, 0, 0.14), [s.turretX, s.deckTop, 0]) + { sides: 24 },
    box('housing', 'paint', [s.turretX - 0.42, s.deckTop + 0.14, -0.34], [s.turretX + 0.42, s.deckTop + 0.5, 0.34]),
    m.axleDisc('pin', 'steel', s.turretX, s.boomY - 0.02, 0.08, [-0.28, 0.28], 12),
  ] + k.bothSides([
    box('cheek', 'paint', [s.turretX - 0.24, s.deckTop + 0.5, 0.2], [s.turretX + 0.24, s.boomY + 0.1, 0.26]),
  ]), finish),
  k.compound('bucket_truck_lower_boom', 330, [
    box('boom', 'paint', [s.turretX - 0.2, s.boomY - 0.15, -0.16], [s.knuckleX, s.boomY + 0.15, 0.16]),
    box('stripe', 'frame', [s.turretX + 0.4, s.boomY - 0.02, 0.16], [s.knuckleX - 0.2, s.boomY + 0.03, 0.17]),
  ], finish),
  k.compound('bucket_truck_cradle', 45, [
    box('saddle', 'frame', [s.cradleX - 0.1, s.boomY - 0.2, -0.26], [s.cradleX + 0.1, s.boomY - 0.15, 0.26]),
  ] + k.bothSides([
    box('lug', 'frame', [s.cradleX - 0.1, s.boomY - 0.15, 0.16], [s.cradleX + 0.1, s.boomY + 0.04, 0.26]),
    m.bar('leg', 'frame', [s.cradleX + 0.02, s.deckTop], [s.cradleX, s.boomY - 0.2], 0.1, [0.16, 0.26]),
  ]), finish),
  k.compound('bucket_truck_knuckle', 95, [
    box('elbow', 'frame', [s.knuckleX, s.boomY - 0.17, -0.18], [s.knuckleX + 0.34, s.boomTopY + 0.14, 0.18]),
    m.axleDisc('pin_low', 'steel', s.knuckleX + 0.16, s.boomY, 0.09, [-0.2, 0.2], 12),
    m.axleDisc('pin_high', 'steel', s.knuckleX + 0.16, s.boomTopY, 0.09, [-0.2, 0.2], 12),
  ], finish),
  k.compound('bucket_truck_insulated_boom', 210, [
    box('boom', 'insulated', [s.basketFront + 0.04, s.boomTopY - 0.11, -0.12], [s.knuckleX, s.boomTopY + 0.11, 0.12]),
    box('collar', 'frame', [-1.2, s.boomTopY - 0.13, -0.14], [-1.0, s.boomTopY + 0.13, 0.14]),
    box('band_a', 'dark', [-2.0, s.boomTopY - 0.115, -0.125], [-1.92, s.boomTopY + 0.115, 0.125]),
    box('band_b', 'dark', [0.1, s.boomTopY - 0.115, -0.125], [0.18, s.boomTopY + 0.115, 0.125]),
  ], finish),
  k.compound('bucket_truck_basket', 90, [
    box('floor', 'insulated', [s.basketRear, s.basketFloor, -basketZ], [s.basketFront, s.basketFloor + 0.05, basketZ]),
    box('wall_fore', 'insulated', [s.basketFront - 0.05, s.basketFloor, -basketZ], [s.basketFront, s.basketTop, basketZ]),
    box('wall_aft', 'insulated', [s.basketRear, s.basketFloor, -basketZ], [s.basketRear + 0.05, s.basketTop, basketZ]),
    box('lip_fore', 'dark', [s.basketFront - 0.06, s.basketTop, -basketZ - 0.01], [s.basketFront + 0.01, s.basketTop + 0.04, basketZ + 0.01]),
    box('lip_aft', 'dark', [s.basketRear - 0.01, s.basketTop, -basketZ - 0.01], [s.basketRear + 0.06, s.basketTop + 0.04, basketZ + 0.01]),
    box('hanger', 'frame', [s.basketFront, s.boomTopY - 0.14, -0.15], [s.basketFront + 0.12, s.boomTopY + 0.14, 0.15]),
  ] + k.bothSides([
    box('wall', 'insulated', [s.basketRear, s.basketFloor, basketZ - 0.05], [s.basketFront, s.basketTop, basketZ]),
    box('lip', 'dark', [s.basketRear - 0.01, s.basketTop, basketZ - 0.06], [s.basketFront + 0.01, s.basketTop + 0.04, basketZ + 0.01]),
  ]), finish),
  k.compound('bucket_truck_basket_rest', 25, [
    box('foot', 'frame', [s.basketFront - 0.5, s.deckTop, -0.3], [s.basketFront - 0.1, s.deckTop + 0.05, 0.3]),
    box('pad', 'dark', [s.basketFront - 0.5, s.basketFloor - 0.03, -0.3], [s.basketFront - 0.1, s.basketFloor, 0.3]),
  ] + k.bothSides([
    box('post', 'frame', [s.basketFront - 0.34, s.deckTop + 0.05, 0.2], [s.basketFront - 0.26, s.basketFloor - 0.03, 0.28]),
  ]), finish),
  k.compound('bucket_truck_jack', 38, [
    box('sleeve', 'paint', [-3.2, 0.5, 0.74], [-3.04, s.lockerBottom + 0.06, 0.9]),
    box('leg', 'steel', [-3.17, 0.36, 0.77], [-3.07, 0.5, 0.87]),
    box('foot', 'frame', [-3.3, 0.3, 0.66], [-2.94, 0.36, 0.98]),
  ], finish),
  k.compound('bucket_truck_cone', 3, [
    k.turned('cone', 'cone', 'y', [[0, 0], [0, 0.11], [0.5, 0.03], [0.5, 0], [0, 0]]) + { sides: 12 },
    box('base', 'dark', [-0.15, 0, -0.15], [0.15, 0.03, 0.15]),
  ], finish),
]
