local k = import 'kit.libsonnet';
local s = import 'riot_van.spec.libsonnet';
local van = import 'van-body.libsonnet';
local box = k.box;
local tail = van.tail(s);
local nose = van.nose(s);
local finish = { steel: 'paint-charcoal' };
local steps(from, to, n) = [from + (to - from) * i / n for i in std.range(0, n)];
// A flat grille over one window: a square frame with bars the vehicle grain can hold.
local grid(tag, x, y, z) = [
  box(tag + '_upright' + i, 'steel', [steps(x[0], x[1] - 0.03, std.ceil((x[1] - x[0]) / 0.16))[i], y[0], z[0]], [steps(x[0], x[1] - 0.03, std.ceil((x[1] - x[0]) / 0.16))[i] + 0.03, y[1], z[1]])
  for i in std.range(0, std.ceil((x[1] - x[0]) / 0.16))
] + [
  box(tag + '_rail' + i, 'steel', [x[0], steps(y[0], y[1] - 0.03, 4)[i], z[0]], [x[1], steps(y[0], y[1] - 0.03, 4)[i] + 0.03, z[1]])
  for i in std.range(0, 4)
];
local nearOut = [s.glassOut - 0.01, s.side + 0.015];
local farOut = [-s.side - 0.015, -s.glassOut + 0.01];
local pillarAt(y) = s.aPost - 0.1 - (y - s.waist) * s.aLean / (s.cabRoof - s.waist);
local pillarY(x) = s.waist + (s.aPost - 0.1 - x) * (s.cabRoof - s.waist) / s.aLean;
local doorGrilleFront = 1.08;
local doorGlassFront = s.cowl - 0.04;
local doorRails = steps(s.waist + 0.02, s.windowTop - 0.05, 4);
// The door glass ahead of the square grille narrows under the raked pillar.
local doorWedge = [
  box('wedge_rail' + i, 'steel', [doorGrilleFront, doorRails[i], nearOut[0]], [std.min(doorGlassFront, pillarAt(doorRails[i] + 0.03)), doorRails[i] + 0.03, nearOut[1]])
  for i in std.range(0, 4)
] + [
  box('wedge_upright', 'steel', [doorGlassFront - 0.03, s.waist + 0.02, nearOut[0]], [doorGlassFront, pillarY(doorGlassFront) - 0.04, nearOut[1]]),
];
local quarterGrille(tag, z) = [
  box(tag + '_upright' + i, 'steel', [[1.3, 1.42, 1.54][i], s.waist, z[0]], [[1.3, 1.42, 1.54][i] + 0.03, pillarY([1.3, 1.42, 1.54][i] + 0.03), z[1]])
  for i in [0, 1, 2]
] + [
  box(tag + '_rail', 'steel', [s.cowl, s.waist + 0.14, z[0]], [pillarAt(s.waist + 0.17), s.waist + 0.17, z[1]]),
];
local rakeX(y) = s.aPost - 0.02 - (y - s.waist) * s.aLean / (s.cabRoof - s.waist);
local screenBar(id, y) = box(id, 'steel', [rakeX(y) - 0.02, y, -s.glassIn], [rakeX(y) + 0.05, y + 0.04, s.glassIn]);
local screenPost(id, z) = k.prism(id, 'steel', [[rakeX(s.waist), s.waist], [rakeX(s.waist) + 0.05, s.waist], [rakeX(s.cabRoof - 0.1) + 0.05, s.cabRoof - 0.1], [rakeX(s.cabRoof - 0.1), s.cabRoof - 0.1]], [z - 0.02, z + 0.02]);
// Chequer blocks the height of two strips, running from the tail to ahead of the front arch where the bonnet still
// stands above them. Each wall's blocks are cut to its span, so the doors carry their own and the pattern moves with them.
local checks(tag, x0, x1, z0, z1) = [
  box(tag + '_' + i + '_' + row, if (i + row) % 2 == 0 then 'yellow' else 'blue', [std.max(tail + i * 0.28, x0), 0.92 + row * 0.12, z0], [std.min(tail + (i + 1) * 0.28, x1), 0.92 + (row + 1) * 0.12, z1])
  for i in std.range(0, 18)
  for row in [0, 1]
  if (i < 18 || row == 0) && std.max(tail + i * 0.28, x0) < std.min(tail + (i + 1) * 0.28, x1)
];
local chequerEnd = tail + 19 * 0.28;
local nearFace = [s.side, s.side + 1 / 32];
local farFace = [-s.side - 1 / 32, -s.side];
local chequerFinish = { yellow: 'reflective-yellow', blue: 'paint-police-blue' };
van.rows('riot_van', s) + [
  k.compound('riot_van_windscreen_grille', 22, [
    screenBar('bar' + i, s.waist + 0.06 + i * 0.16)
    for i in std.range(0, 5)
  ] + [
    screenPost('post' + i, -0.8 + i * 0.32)
    for i in std.range(0, 5)
  ], finish),
  k.compound('riot_van_door_grille', 6, grid('door', [s.bFront + 0.03, doorGrilleFront], [s.waist + 0.02, s.windowTop - 0.02], nearOut) + doorWedge, finish),
  k.compound('riot_van_side_door_grille', 6, grid('door', [s.slideRear + 0.05, -0.05], [s.waist + 0.02, s.windowTop - 0.02], nearOut), finish),
  // The rear leaf's face looks along x, so its bars stand off the door in x rather than z.
  k.compound('riot_van_rear_grille', 5, [
    box('upright' + i, 'steel', [tail - 0.03, s.waist + 0.02, 0.08 + i * 0.17], [tail + 0.01, s.windowTop - 0.02, 0.11 + i * 0.17])
    for i in std.range(0, 4)
  ] + [
    box('rail' + i, 'steel', [tail - 0.03, s.waist + 0.02 + i * 0.15, 0.08], [tail + 0.01, s.waist + 0.05 + i * 0.15, s.hatchSide - 0.06])
    for i in std.range(0, 4)
  ], finish),
  k.compound('riot_van_side_grilles', 28, std.flattenArrays([
    grid('near' + i, s.windows[i], [s.waist + 0.02, s.windowTop - 0.02], nearOut)
    for i in [0, 1, 2]
  ] + [
    grid('far' + i, s.windows[i], [s.waist + 0.02, s.windowTop - 0.02], farOut)
    for i in [0, 1, 2, 3]
  ] + [quarterGrille('near_quarter', nearOut), quarterGrille('far_quarter', farOut)]), finish),
  k.compound('riot_van_markings', 2, checks('near_rear', tail, s.slideRear, nearFace[0], nearFace[1])
                                     + checks('near_pillar', s.bRear, s.bFront, nearFace[0], nearFace[1])
                                     + checks('near_front', s.cowl, chequerEnd, nearFace[0], nearFace[1])
                                     + checks('far_rear', tail, s.bFront, farFace[0], farFace[1])
                                     + checks('far_front', s.cowl, chequerEnd, farFace[0], farFace[1]), chequerFinish),
  k.compound('riot_van_side_door_markings', 1, checks('door', s.slideRear, s.bRear, nearFace[0], nearFace[1]), chequerFinish),
  k.compound('riot_van_door_markings', 1, checks('door', s.bFront, s.cowl, nearFace[0], nearFace[1]), chequerFinish),
  k.compound('riot_van_rear_markings', 1, [
    box('check_' + i + '_' + row, if (i + row) % 2 == 0 then 'yellow' else 'blue', [tail - 1 / 32, 0.92 + row * 0.12, 0.005 + i * 0.28], [tail, 0.92 + (row + 1) * 0.12, 0.005 + (i + 1) * 0.28])
    for i in [0, 1, 2]
    for row in [0, 1]
  ], { yellow: 'reflective-yellow', blue: 'paint-police-blue' }),
  k.compound('riot_van_push_bar', 28, [
    box('cross', 'bar', [s.front + 0.04, 0.5, -0.8], [s.front + 0.09, 0.56, 0.8]),
    box('top', 'bar', [s.front + 0.04, 0.96, -0.7], [s.front + 0.09, 1.02, 0.7]),
  ] + k.bothSides([
    box('upright', 'bar', [s.front + 0.04, 0.3, 0.64], [s.front + 0.09, 1.02, 0.7]),
    box('mount', 'bar', [s.front - 0.06, 0.42, 0.64], [s.front + 0.04, 0.48, 0.7]),
  ]), { bar: 'steel-grey' }),
]
