local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local box = k.box;
local prism = k.prism;
local s = import 'cement_mixer.spec.libsonnet';
local finish = { paint: 'paint-white', orange: 'plastic-orange', frame: 'paint-charcoal', steel: 'steel-grey', alu: 'alu-bare', rust: 'scrap-rusted', yellow: 'paint-crane-yellow', water: 'plastic-gloss-white' };
// A station `a` along the axis from the front apex toward the mouth.
local radiusAt(a) =
  local st = s.stations;
  if a <= st[1][0] then st[0][1] + (st[1][1] - st[0][1]) * a / st[1][0]
  else if a <= st[2][0] then st[1][1]
  else st[2][1] + (st[3][1] - st[2][1]) * (a - st[2][0]) / (st[3][0] - st[2][0]);
// A turned axis can only run along x, so the drum lies level. A true cone stair-steps in two directions and speckles at voxel grain, so its ends are terraced into short drums.
local terraces(a0, a1, n) = [[a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n, 'paint', 0] for i in std.range(0, n - 1)];
local bands = terraces(0, 0.95, 4) + [
  [0.95, 1.2, 'orange', 0],
  [1.2, 2.2, 'paint', 0],
  [2.2, 2.45, 'orange', 0],
  [2.45, 3.2, 'paint', 0],
  [3.2, 3.5, 'steel', 0.03],
  [3.5, 3.55, 'paint', 0],
] + terraces(3.55, 4.95, 5);
local drumPieces = [
  local b = bands[i];
  local r = radiusAt((b[0] + b[1]) / 2) + b[3];
  k.turned('band_' + i, b[2], 'x', [[-b[1], 0], [-b[1], r], [-b[0], r], [-b[0], 0], [-b[1], 0]], [s.apex[0], s.apex[1], 0]) + { sides: 24 }
  for i in std.range(0, std.length(bands) - 1)
];
local rollerX = s.apex[0] - 3.35;
// Where the rollers bear on the steel ring, each at z = 0.59 with radius 0.13.
local rollerY = s.apex[1] - std.sqrt(1.13 * 1.13 - 0.59 * 0.59) - 0.13;
local wall = 0.0625;
local rungs = std.range(0, 5);
[
  k.compound('cement_mixer_subframe', 560, [
    box('rear_beam', 'frame', [-3.5, 1.14, -1.15], [-2.85, s.beamTop, 1.15]),
    box('guard_beam', 'frame', [-2.2, 1.14, -1.15], [-1.62, 1.26, 1.15]),
    box('roller_beam', 'frame', [rollerX - 0.2, s.beamY, -0.46], [rollerX + 0.2, s.beamTop, 0.46]),
  ] + k.bothSides([
    box('runner', 'frame', [-3.6, s.railTop, 0.34], [2.08, s.beamY, 0.46]),
  ]), finish),
  k.compound('cement_mixer_drive', 240, [
    box('pedestal', 'yellow', [1.55, s.beamY, -0.34], [2.08, 2.28, 0.34]),
    box('foot', 'frame', [1.55, s.railTop, -0.46], [2.08, s.beamY, 0.46]),
    box('gear', 'frame', [1.68, 1.68, -0.42], [1.98, 2.28, 0.42]),
  ], finish),
  k.compound('cement_mixer_drum', 2400, drumPieces, finish),
  k.compound('cement_mixer_roller_stand', 70, [
    box('post', 'yellow', [rollerX - 0.2, s.beamTop, 0.46], [rollerX + 0.2, rollerY, 0.72]),
    box('foot', 'frame', [rollerX - 0.24, s.beamY, 0.46], [rollerX + 0.24, s.beamTop, 0.76]),
    k.turned('roller', 'steel', 'x', k.disc(0.13, -0.17, 0.17), [rollerX, rollerY, 0.59]) + { sides: 12 },
  ], finish),
  k.compound('cement_mixer_rear_frame', 200, [
    box('head', 'yellow', [s.hopperX - 0.2, s.headY - 0.1, -0.74], [s.hopperX + 0.22, s.headY, 0.74]),
  ] + k.bothSides([
    box('post', 'yellow', [s.hopperX - 0.07, s.beamTop, 0.62], [s.hopperX + 0.07, s.headY - 0.1, 0.72]),
  ]), finish),
  k.compound('cement_mixer_hopper', 120, [
    box('throat', 'frame', [-3.42 + 2 * wall, s.headY, -0.6 + 2 * wall], [-3.0 - 2 * wall, s.headY + 0.04, 0.6 - 2 * wall]),
    prism('wall_aft', 'steel', [[-3.42, s.headY], [-3.42 + wall, s.headY], [-3.68 + wall, s.rimY], [-3.68, s.rimY]], [-0.6, 0.6]),
    prism('lining_aft', 'frame', [[-3.42 + wall, s.headY], [-3.42 + 2 * wall, s.headY], [-3.68 + 2 * wall, s.rimY], [-3.68 + wall, s.rimY]], [-0.6 + wall, 0.6 - wall]),
    prism('wall_fore', 'steel', [[-3.0 - wall, s.headY], [-3.0, s.headY], [-2.72, s.rimY], [-2.72 - wall, s.rimY]], [-0.6, 0.6]),
    prism('lining_fore', 'frame', [[-3.0 - 2 * wall, s.headY], [-3.0 - wall, s.headY], [-2.72 - wall, s.rimY], [-2.72 - 2 * wall, s.rimY]], [-0.6 + wall, 0.6 - wall]),
    box('rim_aft', 'yellow', [-3.72, s.rimY, -0.64], [-3.72 + wall, s.rimY + 0.06, 0.64]),
    box('rim_fore', 'yellow', [-2.68 - wall, s.rimY, -0.64], [-2.68, s.rimY + 0.06, 0.64]),
  ] + k.bothSides([
    prism('cheek', 'steel', [[-3.42, s.headY], [-3.0, s.headY], [-2.72, s.rimY], [-3.68, s.rimY]], [0.6 - wall, 0.6]),
    prism('cheek_lining', 'frame', [[-3.42, s.headY], [-3.0, s.headY], [-2.72, s.rimY], [-3.68, s.rimY]], [0.6 - 2 * wall, 0.6 - wall]),
    box('rim_side', 'yellow', [-3.72 + wall, s.rimY, 0.64 - wall], [-2.68 - wall, s.rimY + 0.06, 0.64]),
  ]), finish),
  k.compound('cement_mixer_chute', 60, [
    m.bar('main', 'rust', [-3.32, s.headY - 0.1], [-3.9, 1.84], 0.2, [-0.26, 0.26]),
    m.bar('tip', 'steel', [-3.9, 1.84], [-4.08, 1.42], 0.14, [-0.2, 0.2]),
  ] + k.bothSides([
    m.bar('cheek', 'yellow', [-3.3, s.headY - 0.04], [-3.92, 1.92], 0.2, [0.26, 0.29]),
  ]), finish),
  k.compound('cement_mixer_platform', 70, [
    box('grating', 'alu', [-3.72, s.platformY - 0.04, 0.6], [-3.1, s.platformY, 1.16]),
    box('hanger', 'frame', [s.hopperX - 0.07, s.headY, 0.62], [s.hopperX + 0.07, s.platformY - 0.04, 0.72]),
    box('rail_top', 'yellow', [-3.72, s.platformY + 0.72, 1.12], [-3.1, s.platformY + 0.76, 1.16]),
    box('rail_post_aft', 'yellow', [-3.72, s.platformY, 1.12], [-3.68, s.platformY + 0.72, 1.16]),
    box('rail_post_fore', 'yellow', [-3.14, s.platformY, 1.12], [-3.1, s.platformY + 0.72, 1.16]),
    box('ladder_a', 'steel', [-3.5, s.beamTop, 0.78], [-3.45, s.platformY - 0.04, 0.83]),
    box('ladder_b', 'steel', [-3.5, s.beamTop, 1.08], [-3.45, s.platformY - 0.04, 1.13]),
  ] + [
    box('rung_' + i, 'steel', [-3.49, s.beamTop + 0.2 + i * 0.26, 0.83], [-3.46, s.beamTop + 0.24 + i * 0.26, 1.08])
    for i in rungs
  ], finish),
  k.compound('cement_mixer_water_tank', 90, [
    k.turned('tank', 'water', 'y', k.disc(0.27, 1.26, 2.34), [1.6, 0, 0.95]) + { sides: 16 },
    box('shelf', 'frame', [1.3, s.beamY - 0.04, 0.46], [1.9, 1.26, 1.22]),
  ], finish),
]
