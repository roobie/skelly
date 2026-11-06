local k = import 'kit.libsonnet';
local s = import 'swat_truck.spec.libsonnet';
local box = k.box;
local b = s.body;
local wallZ = [b.side - b.wall, b.side];
local slitEdges = std.flattenArrays(b.slit.x);
local piers = [
  [s.rear + b.wall, slitEdges[0]],
  [slitEdges[1], slitEdges[2]],
  [slitEdges[3], b.front],
];
local finish = { armour: s.paint, plate: 'paint-charcoal', deck: 'plastic-charcoal', glass: 'glass-clear', steel: 'steel-parkerized' };
local r = s.ram;
local leanAt(y) = s.lean * (y - s.waist) / (s.roof - s.waist);
local windowTop = s.roof - 0.05;
local screenBars = [-1.0 + 0.2 * i for i in std.range(0, 10)];
local doorBars = [s.doorRear + 0.1 + 0.2 * i for i in std.range(0, 4)];
(import 'truck-cab.libsonnet').rows('swat_truck', s) + [
  k.compound('swat_truck_body_floor', 520, [
    box('deck', 'deck', [s.rear, b.floorLow, -wallZ[0]], [b.front, b.floorTop, wallZ[0]]),
    box('rear_apron', 'plate', [s.rear, b.apron[0], -b.side], [s.rear + 0.05, b.apron[1], b.side]),
  ] + k.bothSides([
    box('runner', 'plate', [s.rear + 0.04, s.railTop, 0.3], [b.front, b.floorLow, 0.44]),
  ]), finish),
  k.compound('swat_truck_body_side', 780, [
    box('low', 'armour', [s.rear, b.floorLow, wallZ[0]], [b.front, b.slit.y[0], wallZ[1]]),
    box('high', 'armour', [s.rear, b.slit.y[1], wallZ[0]], [b.front, b.top, wallZ[1]]),
    box('strake', 'plate', [s.rear, b.strake[0], b.side], [b.front, b.strake[1], b.side + 0.02]),
    box('front_post', 'plate', [b.front - 0.04, b.floorLow, wallZ[1]], [b.front, b.top, wallZ[1] + 0.02]),
  ] + [
    box('pier_' + i, 'armour', [piers[i][0], b.slit.y[0], wallZ[0]], [piers[i][1], b.slit.y[1], wallZ[1]])
    for i in std.range(0, 2)
  ] + [
    box('skirt_' + i, 'plate', [b.skirt.x[i][0], b.skirt.y[0], wallZ[0]], [b.skirt.x[i][1], b.skirt.y[1], wallZ[1]])
    for i in std.range(0, 1)
  ] + (import 'truck-cab.libsonnet').archCorners('skirt_corner', 'plate', b.skirt.x[0][1], b.skirt.x[1][0], b.skirt.y[1], b.skirt.chamfer, wallZ[0], wallZ[1]), finish),
  k.compound('swat_truck_body_glass', 40, [
    box('slit_' + z + '_' + i, 'glass', [b.slit.x[i][0], b.slit.y[0], z * (b.side - 0.05)], [b.slit.x[i][1], b.slit.y[1], z * (b.side - 0.05) + 0.03])
    for z in [1, -1]
    for i in std.range(0, 1)
  ], finish),
  k.compound('swat_truck_body_front', 260, [
    box('wall', 'armour', [b.front - b.wall, b.floorTop, -b.side], [b.front, b.top, b.side]),
  ], finish),
  k.compound('swat_truck_body_roof', 420, [
    box('roof', 'armour', [s.rear, b.top, -b.side], [b.front, b.top + 0.05, b.side]),
    box('hatch', 'plate', [-2.2, b.top + 0.05, -0.42], [-1.4, b.top + 0.1, 0.42]),
  ], finish),
  k.compound('swat_truck_rear_door', 150, [
    box('low', 'armour', [s.rear, b.floorTop, 0.01], [s.rear + b.wall, b.doorWindow.y[0], b.side - b.wall]),
    box('high', 'armour', [s.rear, b.doorWindow.y[1], 0.01], [s.rear + b.wall, b.top, b.side - b.wall]),
    box('inner_pier', 'armour', [s.rear, b.doorWindow.y[0], 0.01], [s.rear + b.wall, b.doorWindow.y[1], b.doorWindow.z[0]]),
    box('outer_pier', 'armour', [s.rear, b.doorWindow.y[0], b.doorWindow.z[1]], [s.rear + b.wall, b.doorWindow.y[1], b.side - b.wall]),
    box('window', 'glass', [s.rear + 0.015, b.doorWindow.y[0], b.doorWindow.z[0]], [s.rear + 0.045, b.doorWindow.y[1], b.doorWindow.z[1]]),
    box('handle', 'plate', [s.rear - 0.02, 1.42, 0.2], [s.rear, 1.48, 0.5]),
  ], finish, { hinge_a: ['low', [0, 0.1, 1]], hinge_b: ['high', [0, 0.9, 1]] }),
  k.compound('swat_truck_rear_step', 40, [
    box('tread', 'plate', [s.rear - 0.3, b.stepY[0], -0.9], [s.rear + 0.04, b.stepY[1], 0.9]),
  ] + k.bothSides([
    box('hanger', 'plate', [s.rear, b.stepY[1], 0.36], [s.rear + 0.06, b.floorLow, 0.44]),
  ]), finish),
  // Closes the side view between the wing and the bonnet's lower edge, which the helper leaves open at this cab height.
  k.compound('swat_truck_engine_guard', 60, k.bothSides([
    box('plate', 'plate', [s.face, s.bumperTop - 0.04, s.bonnet.z - 0.04], [s.bonnet.nose, s.floor + 0.02, s.bonnet.z]),
  ]), finish),
  // Stands proud of the raked windscreen and follows it, so the mesh reads as armour from the front.
  k.compound('swat_truck_windscreen_guard', 30, [
    box('rail_low', 'steel', [s.face, s.waist, -s.side], [s.face + 0.05, s.waist + 0.06, s.side]),
    box('rail_high', 'steel', [s.face - leanAt(windowTop), windowTop - 0.06, -s.side], [s.face - leanAt(windowTop) + 0.05, windowTop, s.side]),
  ] + [
    k.prism('bar_' + i, 'steel', [[s.face + 0.01, s.waist], [s.face + 0.05, s.waist], [s.face - leanAt(windowTop) + 0.05, windowTop], [s.face - leanAt(windowTop) + 0.01, windowTop]], [screenBars[i] - 0.03, screenBars[i] + 0.03])
    for i in std.range(0, std.length(screenBars) - 1)
  ], finish),
  k.compound('swat_truck_door_guard', 10, [
    box('rail_low', 'steel', [s.doorRear, s.waist - 0.03, s.side], [s.doorFront, s.waist + 0.03, s.side + 0.04]),
    box('rail_high', 'steel', [s.doorRear, windowTop - 0.03, s.side], [s.doorFront - leanAt(windowTop), windowTop + 0.03, s.side + 0.04]),
  ] + [
    box('bar_' + i, 'steel', [doorBars[i] - 0.03, s.waist, s.side], [doorBars[i] + 0.03, windowTop, s.side + 0.04])
    for i in std.range(0, std.length(doorBars) - 1)
  ], finish),
  k.compound('swat_truck_ram', 240, [
    box('beam', 'steel', [r.x, r.low, -r.half], [r.x + r.plate, r.mid, r.half]),
    box('top_bar', 'steel', [r.x, r.high - 0.1, -r.postZ - 0.1], [r.x + r.plate - 0.04, r.high, r.postZ + 0.1]),
  ] + k.bothSides([
    box('upright', 'steel', [r.x, r.mid, r.postZ], [r.x + r.plate - 0.04, r.high - 0.1, r.postZ + 0.1]),
    box('arm', 'steel', [s.front - 0.3, r.low + 0.04, r.postZ], [r.x, r.mid - 0.04, r.postZ + 0.1]),
  ]), finish),
]
