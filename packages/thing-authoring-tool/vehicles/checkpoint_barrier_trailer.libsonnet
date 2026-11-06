local k = import 'kit.libsonnet';
local m = import 'military-kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'checkpoint_barrier_trailer.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local finish = { paint: s.paint, frame: 'steel-parkerized', dark: 'paint-charcoal' };
local stake(id, x0, x1) = box(id, 'paint', [x0, s.frameHigh, s.side - 0.04], [x1, s.railTop, s.side + 0.02]);
local halfLength = s.barrierLength / 2;
local boards = [[0.08, 0.28], [0.34, 0.56]];
local strap(x, n) = [
  box('over_' + n, 'strap', [x - 0.03, s.railTop, -s.side - 0.035], [x + 0.03, s.railTop + 0.02, s.side + 0.035]),
] + bothSides([
  box('drop_' + n, 'strap', [x - 0.03, s.wall - 0.02, s.side + 0.02], [x + 0.03, s.railTop + 0.02, s.side + 0.035]),
  box('hook_' + n, 'strap', [x - 0.03, s.wall - 0.02, s.side], [x + 0.03, s.wall, s.side + 0.02]),
]);
[
  k.compound('checkpoint_barrier_trailer_chassis', 180, [
    box('front_rail', 'frame', [s.front - 0.04, s.frameLow, -0.55], [s.front, s.frameHigh, 0.55]),
    box('mid_rail', 'frame', [s.axle - 0.04, s.frameLow, -0.55], [s.axle + 0.04, s.frameHigh, 0.55]),
    box('rear_rail', 'frame', [s.rear, s.frameLow - 0.03, -0.62], [s.rear + 0.04, s.frameHigh, 0.62]),
    box('chest_plate', 'frame', [s.front, s.frameHigh - 0.04, -0.3], [s.front + 0.35, s.frameHigh, 0.3]),
    box('chest', 'paint', [s.front, s.frameHigh, -0.28], [s.front + 0.34, s.wall, 0.28]),
    box('chest_lid', 'dark', [s.front + 0.02, s.wall, -0.26], [s.front + 0.32, s.wall + 0.02, 0.26]),
    box('leg_clamp', 'dark', [s.tip - 0.48, s.frameLow - 0.02, 0.11], [s.tip - 0.36, s.frameHigh + 0.02, 0.29]),
  ] + bothSides([
    box('side_rail', 'frame', [s.rear, s.frameLow, 0.47], [s.front, s.frameHigh, 0.55]),
    box('spring', 'frame', [s.axle - 0.34, s.hub, 0.5], [s.axle + 0.34, s.frameLow, 0.54]),
  ]) + h.drawbar(s.front, 0.5, s.tip, [s.frameLow, s.frameHigh]), finish),
  k.compound('checkpoint_barrier_trailer_floor', 50, [
    box('deck', 'wood', [s.rear, s.frameHigh, -s.side + 0.04], [s.front, s.deck, s.side - 0.04]),
  ], { wood: 'wood-oak' }),
  k.compound('checkpoint_barrier_trailer_side', 28, [
    box('skin', 'paint', [s.rear, s.frameHigh, s.side - 0.04], [s.front, s.wall, s.side]),
    box('top_rail', 'paint', [s.rear, s.railLow, s.side - 0.04], [s.front, s.railTop, s.side + 0.02]),
    stake('stake_rear', s.rear, s.rear + 0.06),
    stake('stake_mid', -0.03, 0.03),
    stake('stake_front', s.front - 0.06, s.front),
  ], finish),
  k.compound('checkpoint_barrier_trailer_headboard', 14, [
    box('skin', 'paint', [s.front - 0.04, s.deck, -s.side + 0.04], [s.front, s.railTop, s.side - 0.04]),
  ], finish),
  // The tailgate drops about its lower edge.
  k.compound('checkpoint_barrier_trailer_tailgate', 12, [
    box('skin', 'paint', [s.rear, s.deck, -s.side + 0.04], [s.rear + 0.04, s.wall, s.side - 0.04]),
  ], finish, { hinge_a: ['skin', [0, 0, 0.2]], hinge_b: ['skin', [0, 0, 0.8]] }),
  k.compound('checkpoint_barrier_trailer_mudguard', 4,
    m.flatGuard('guard', 'dark', [s.axle - 0.3, s.axle + 0.3], 0.66, 0.2, 0.12, [s.side, s.wheelZ + 0.1]), finish),
  k.compound('checkpoint_barrier_trailer_straps', 2, strap(-0.55, 'rear') + strap(0.55, 'front'), { strap: 'webbing-olive-dark' }),
  // Stands on edge with its origin at the middle of its bottom rail.
  k.compound('checkpoint_barrier_trailer_barrier', 34, [
    box('base_rail', 'steel', [-halfLength, 0, -0.03], [halfLength, 0.08, 0.03]),
    box('top_rail', 'steel', [-halfLength, 0.56, -0.03], [halfLength, s.barrierHeight, 0.03]),
    box('mid_rail', 'steel', [-halfLength, 0.28, -0.03], [halfLength, 0.34, 0.03]),
    box('end_post_rear', 'steel', [-halfLength, 0, -0.03], [-halfLength + 0.05, s.barrierHeight, 0.03]),
    box('end_post_front', 'steel', [halfLength - 0.05, 0, -0.03], [halfLength, s.barrierHeight, 0.03]),
  ] + bothSides([
    box('folded_leg_rear', 'steel', [-0.82, 0, 0.03], [-0.78, s.barrierHeight - 0.05, 0.05]),
    box('folded_leg_front', 'steel', [0.78, 0, 0.03], [0.82, s.barrierHeight - 0.05, 0.05]),
  ]) + std.flattenArrays([
    [box('board_' + b, 'white', [-halfLength + 0.05, boards[b][0], -0.02], [halfLength - 0.05, boards[b][1], 0.02])] + [
      local x = -0.72 + 0.31 * i;
      prism('stripe_' + b + '_' + i, 'red', [[x, boards[b][0]], [x + 0.16, boards[b][0]], [x + 0.26, boards[b][1]], [x + 0.1, boards[b][1]]], [-0.03, 0.03])
      for i in std.range(0, 4)
    ]
    for b in [0, 1]
  ]), { steel: 'steel-galvanised', white: 'paint-white', red: 'paint-red' }),
]
