local k = import 'kit.libsonnet';
local h = import 'helicopter-kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'crashed_military_helicopter.spec.libsonnet';
local box = k.box;
local lean(id, slot, x, foot, head, thick) = {
  id: id, kind: 'prism', slot: slot, axis: 'x', start: x[0], end: x[1],
  profile: [[foot[0], foot[1] - thick], [head[0], head[1] - thick], [head[0], head[1] + thick], [foot[0], foot[1] + thick]],
};
local wall(id, slot, x, arc, thick=0.075, stations=s.body) = h.shell(id, slot, stations, thick=thick, x=x, arc=arc, step=0.125);
// Stands proud of the skin, so it never shares a surface with the wall beneath it.
local proud(stations, by) = [station + { half: station.half + by, top: station.top + by, bottom: station.bottom } for station in stations];
local burn(id, slot, x, arc, stations=s.body) = h.shell(id, slot, proud(stations, 0.04), thick=0.05, x=x, arc=arc, step=0.125, sides=32);
// A burn is thin strips across the skin, each its own arc, eased between the rows so its edge wanders without stepping.
local blotch(id, slot, x, rows, stations=s.body) =
  local last = std.length(rows) - 1;
  local arcAt(i) =
    local a = rows[std.min(std.floor(i / 2), last)];
    local b = rows[std.min(std.ceil(i / 2), last)];
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  std.flattenArrays([
    burn(id + '_' + i, slot, [x + i * 0.125, x + (i + 1) * 0.125], arcAt(i), stations)
    for i in std.range(0, 2 * last + 1)
  ]);
local yPrism(id, slot, profile, y) = { id: id, kind: 'prism', slot: slot, axis: 'y', profile: profile, start: y[0], end: y[1] };
local lerp(a, b, t) = a + (b - a) * t;
// A tapered tube lying on `ground`, running in plan from `a` to `b`, each { x, z, r }, as stacked slabs.
local lyingTube(id, slot, a, b, segments=20, layers=8, ground=0) = std.flattenArrays([
  local t0 = i / segments;
  local t1 = (i + 1) / segments;
  local r = lerp(a.r, b.r, (t0 + t1) / 2);
  [
    local height = 2 * r / layers;
    local mid = (j + 0.5) * height;
    local half = std.sqrt(std.max(r * r - (mid - r) * (mid - r), 0.0004));
    yPrism(id + '_' + i + '_' + j, slot,
           h.planQuad([lerp(a.x, b.x, t0), lerp(a.z, b.z, t0)], [lerp(a.x, b.x, t1), lerp(a.z, b.z, t1)], half, half),
           [ground + j * height, ground + (j + 1) * height])
    for j in std.range(0, layers - 1)
  ]
  for i in std.range(0, segments - 1)
]);
// A thin plate standing up as a stack: `stations` list { y, a: [x, z], b: [x, z] }.
local standingPlate(id, slot, stations, half=0.04) = [
  local s0 = stations[i];
  local s1 = stations[i + 1];
  yPrism(id + '_' + i, slot, h.planQuad([(s0.a[0] + s1.a[0]) / 2, (s0.a[1] + s1.a[1]) / 2], [(s0.b[0] + s1.b[0]) / 2, (s0.b[1] + s1.b[1]) / 2], half, half), [s0.y, s1.y])
  for i in std.range(0, std.length(stations) - 2)
];
local along(t) = { x: s.boomRoot.x + (s.boomTip.x - s.boomRoot.x) * t, z: s.boomRoot.z + (s.boomTip.z - s.boomRoot.z) * t };
local across(t, by) =
  local p = along(t);
  local dx = s.boomTip.x - s.boomRoot.x;
  local dz = s.boomTip.z - s.boomRoot.z;
  local length = std.sqrt(dx * dx + dz * dz);
  [p.x + dz / length * by, p.z - dx / length * by];
local tailHub = { x: along(0.97).x - 0.25, y: 1.45, z: along(0.97).z + 0.2 };
[
  k.compound('crashed_military_helicopter_fuselage', s.shellMass,
             wall('cabin_front', 'paint', [s.doorFront, s.cockpitRear], [-180, 180])
             + wall('cabin_rear', 'paint', [s.cabinRear, s.doorRear], [-180, 180])
             + wall('cabin_door_side', 'paint', [s.doorRear, s.doorFront], [125, 405])
             + wall('door_lintel', 'paint', [s.doorRear, s.doorFront], [-180, -180 + 8])
             + wall('nose_low', 'paint', [s.cockpitRear, s.nose], [100, 260])
             + wall('cockpit_roof', 'paint', [s.cockpitRear, 3.45], [-14, 14])
             + wall('pillar_b', 'paint', [2.55, 2.68], [14, 100])
             + wall('pillar_b_far', 'paint', [2.55, 2.68], [260, 346])
             + wall('pillar_a', 'paint', [3.4, 3.52], [14, 100])
             + wall('pillar_a_far', 'paint', [3.4, 3.52], [260, 346])
             + wall('post_c', 'paint', [s.cockpitRear, 1.75], [14, 100])
             + wall('post_c_far', 'paint', [s.cockpitRear, 1.75], [260, 346])
             // Teeth of torn skin where the boom came away.
             + wall('tear_0', 'paint', [-3.0, s.cabinRear], [-180, 180])
             + wall('tear_1', 'paint', [-3.5, -3.0], [-40, 25])
             + wall('tear_2', 'paint', [-3.25, -3.0], [25, 80])
             + wall('tear_3', 'paint', [-3.65, -3.0], [80, 135])
             + wall('tear_4', 'paint', [-3.15, -3.0], [135, 215])
             + wall('tear_5', 'paint', [-3.45, -3.0], [215, 270])
             + wall('tear_6', 'paint', [-3.2, -3.0], [270, 320])
             + h.loft('rear_bulkhead', 'soot', s.body, x=[-3.0, -2.95], step=0.05)
             + h.loft('cockpit_bulkhead', 'soot', s.body, x=[s.cockpitRear - 0.05, s.cockpitRear], step=0.05)
             + [
               box('deck', 'soot', [-2.95, 0.18, -0.98], [3.25, s.deck, 0.98]),
               m.bar('drive_shaft', 'steel', [-3.0, 1.32], [-3.95, 1.42], 0.09, [-0.05, 0.05]),
             ]
             // The dark lining makes the open door read as a hole, not as the far wall's paint.
             + h.shell('lining', 'soot', [station + { half: std.max(station.half - 0.08, 0.05), top: station.top - 0.08, bottom: station.bottom + 0.08 } for station in s.body], thick=0.05, x=[-2.95, s.cockpitRear], step=0.125)
             + burn('window_far', 'glass', [-0.95, 0.05], [262, 298])
             + burn('window_far_rear', 'glass', [-2.4, -1.75], [270, 296])
             + blotch('b_aft', 'soot', -3.0, [[-70, 120], [-60, 135], [-45, 105], [-65, 90], [-30, 110], [-20, 60], [-40, 75], [-10, 35]])
             + blotch('b_door', 'soot', 0.5, [[35, 128], [55, 115], [78, 112]])
             + blotch('b_door_edge', 'scorch', 0.5, [[20, 35], [30, 55], [40, 78], [70, 105], [85, 100]])
             + blotch('b_roof', 'scorch', -0.25, [[-40, -22], [-52, -18], [-48, -12], [-60, -24], [-42, -20], [-50, -30], [-36, -26]])
             + blotch('b_far', 'soot', -2.0, [[300, 325], [298, 345], [300, 335], [302, 318]])
             + blotch('b_far_edge', 'scorch', -1.75, [[325, 340], [335, 350], [318, 355], [300, 340], [302, 322], [300, 312]])
             + blotch('b_nose', 'scorch', 2.75, [[100, 125], [100, 138], [104, 150], [100, 142], [108, 132]])
             + blotch('b_nose_core', 'soot', 3.0, [[105, 122], [108, 130], [112, 124]]),
             { paint: s.paint, scorch: s.scorch, soot: s.soot, steel: 'steel-grey', glass: 'glass-grey' }),
  k.compound('crashed_military_helicopter_windscreen', 30,
             // The near windscreen is gone, so the burnt cockpit shows through its frame.
             wall('side_near', 'glass', [1.75, 2.55], [14, 100], 0.05)
             + wall('door_near', 'glass', [2.68, 3.4], [50, 100], 0.05)
             + wall('side_far', 'glass', [1.75, 2.55], [260, 346], 0.05)
             + wall('door_far', 'glass', [2.68, 3.4], [260, 346], 0.05)
             + wall('screen_far', 'glass', [3.52, s.nose], [260, 346], 0.05)
             + wall('screen_near', 'glass', [3.52, 3.72], [60, 100], 0.05),
             { glass: 'glass-grey' }),
  k.compound('crashed_military_helicopter_cowling', 150,
             wall('far', 'paint', [-2.5, 1.2], [180, 360], 0.06, s.doghouse)
             + wall('crown', 'paint', [-2.5, 1.2], [0, 22], 0.06, s.doghouse)
             + wall('torn_front', 'paint', [0.05, 1.2], [22, 180], 0.06, s.doghouse)
             + wall('torn_tooth', 'paint', [-0.45, 0.05], [22, 58], 0.06, s.doghouse)
             + wall('torn_rear', 'paint', [-2.5, -1.75], [22, 180], 0.06, s.doghouse)
             + wall('sill', 'paint', [-1.75, 0.05], [118, 180], 0.06, s.doghouse)
             + blotch('b_crown', 'soot', -2.5, [[-14, 44], [-30, 40], [-20, 30], [-26, 18], [-10, 26], [-16, 12]], s.doghouse)
             + blotch('b_sill', 'soot', -1.75, [[118, 158], [118, 148], [118, 170], [118, 142], [118, 150], [118, 138], [118, 134]], s.doghouse)
             + blotch('b_far', 'scorch', -1.9, [[320, 350], [305, 345], [300, 330], [312, 352], [300, 325], [318, 340]], s.doghouse)
             + blotch('b_front', 'scorch', 0.05, [[30, 118], [40, 96], [34, 72]], s.doghouse),
             { paint: s.paint, scorch: s.scorch, soot: s.soot }),
  h.turbine('crashed_military_helicopter_engine', 210, 1.5, 0.26, finish='steel-spall-black', dark='plastic-scorched'),
  h.mast('crashed_military_helicopter_mast', 90, s.hub - s.mastFoot, radius=0.09),
  k.compound('crashed_military_helicopter_main_rotor', 340,
             [
               k.turned('hub', 'head', 'y', k.disc(0.32, s.hub - 0.12, s.hub + 0.04)) + { sides: 12 },
               k.turned('cap', 'head', 'y', k.disc(0.14, s.hub + 0.04, s.hub + 0.16)) + { sides: 8 },
             ]
             // Bent from a tree strike: sags off the near side until its tip drags on the ground.
             + h.ribbon('a', 'blade', [[0.15, 3.1, 0.25], [1.1, 2.98, 1.9], [1.75, 2.45, 3.05], [2.25, 1.35, 3.95], [2.75, 0.45, 4.85], [3.15, 0.1, 5.9]], 0.5)
             + h.ribbon('a_tip', 'tip', [[3.15, 0.1, 5.9], [3.3, 0.09, 6.6]], 0.5)
             // Snapped short, its end split.
             + h.ribbon('b', 'blade', [[-0.25, 3.1, 0.15], [-1.5, 3.0, 0.85], [-2.25, 2.86, 1.3]], 0.5, endWidth=0.12)
             + h.ribbon('b_splinter', 'blade', [[-2.25, 2.86, 1.14], [-2.75, 2.72, 1.42]], 0.14)
             // Folded down over the far side and trailing forward along the ground.
             + h.ribbon('c', 'blade', [[0.2, 3.1, -0.2], [1.3, 3.02, -1.55], [1.75, 2.45, -2.2], [2.05, 1.2, -2.75], [2.4, 0.3, -3.3], [3.5, 0.09, -3.95], [5.0, 0.09, -4.35]], 0.5)
             + h.ribbon('c_tip', 'tip', [[5.0, 0.09, -4.35], [5.7, 0.09, -4.5]], 0.5)
             // Kinked upward, then gone at the break.
             + h.ribbon('d', 'blade', [[-0.2, 3.1, -0.2], [-1.2, 3.1, -1.05], [-2.1, 3.42, -1.85], [-3.3, 3.2, -2.9]], 0.5, endWidth=0.16),
             { blade: 'paint-charcoal', tip: 'paint-crane-yellow', head: 'steel-grey' }),
  k.compound('crashed_military_helicopter_snapped_blade', 70,
             h.ribbon('blade', 'blade', [[-0.9, 0.08, 3.9], [-2.2, 0.08, 4.5], [-3.6, 0.08, 4.65], [-4.4, 0.09, 5.1]], 0.5, step=0.25)
             + h.ribbon('tip', 'tip', [[-4.4, 0.09, 5.1], [-4.95, 0.09, 5.35]], 0.5, step=0.25),
             { blade: 'paint-charcoal', tip: 'paint-crane-yellow' }),
  k.compound('crashed_military_helicopter_tail_boom', 260,
             lyingTube('tear', 'soot', s.boomRoot, along(0.03) + { r: 0.41 }, segments=1)
             + lyingTube('boom', 'paint', along(0.03) + { r: 0.41 }, s.boomTip)
             + standingPlate('fin', 'paint', [
               local u = i / 10;
               local rear = along(1);
               local front = along(0.74 + 0.21 * u * u);
               { y: 0.3 + 1.75 * u, a: [front.x, front.z], b: [rear.x - 0.72 * u, rear.z + 0.3 * u] }
               for i in std.range(0, 10)
             ], half=0.07)
             + h.ribbon('tailplane_near', 'paint', [[along(0.9).x, 0.52, along(0.9).z], [across(0.9, -1.0)[0], 0.3, across(0.9, -1.0)[1]], [across(0.9, -1.5)[0], 0.07, across(0.9, -1.5)[1]]], 0.5, thick=0.06)
             + h.ribbon('tailplane_far', 'paint', [[along(0.9).x, 0.52, along(0.9).z], [across(0.9, 1.4)[0], 0.62, across(0.9, 1.4)[1]]], 0.5, thick=0.06)
             + [box('gearbox', 'soot', [tailHub.x - 0.12, tailHub.y - 0.12, tailHub.z - 0.22], [tailHub.x + 0.12, tailHub.y + 0.12, tailHub.z + 0.02])]
             + lyingTube('b_0', 'soot', along(0.03) + { r: 0.43 }, along(0.22) + { r: 0.4 }, segments=4)
             + lyingTube('b_1', 'scorch', along(0.22) + { r: 0.4 }, along(0.34) + { r: 0.37 }, segments=3),
             { paint: s.paint, scorch: s.scorch, soot: s.soot }),
  k.compound('crashed_military_helicopter_tail_rotor', 45, [
    k.turned('hub', 'head', 'z', k.disc(0.09, tailHub.z, tailHub.z + 0.1), [tailHub.x, tailHub.y, 0]) + { sides: 8 },
    m.bar('up', 'blade', [tailHub.x, tailHub.y], [tailHub.x + 0.25, tailHub.y + 1.0], 0.2, [tailHub.z + 0.02, tailHub.z + 0.08]),
    m.bar('up_tip', 'tip', [tailHub.x + 0.25, tailHub.y + 1.0], [tailHub.x + 0.3, tailHub.y + 1.2], 0.2, [tailHub.z + 0.02, tailHub.z + 0.08]),
    m.bar('back', 'blade', [tailHub.x, tailHub.y], [tailHub.x - 0.75, tailHub.y + 0.25], 0.2, [tailHub.z + 0.02, tailHub.z + 0.08]),
    m.bar('down', 'blade', [tailHub.x, tailHub.y], [tailHub.x - 0.2, tailHub.y - 1.1], 0.2, [tailHub.z + 0.02, tailHub.z + 0.08]),
    m.bar('stub', 'blade', [tailHub.x, tailHub.y], [tailHub.x + 0.5, tailHub.y - 0.1], 0.2, [tailHub.z + 0.02, tailHub.z + 0.08], thickB=0.06),
  ], { blade: 'paint-charcoal', tip: 'paint-crane-yellow', head: 'steel-grey' }),
  k.compound('crashed_military_helicopter_cabin_door', 45, [
    lean('skin', 'paint', [-2.75, -1.45], [0.03, 1.72], [1.72, 1.27], 0.05),
    k.prism('foot', 'paint', [[-2.75, 0], [-1.45, 0], [-1.45, 0.04], [-2.75, 0.04]], [1.62, 1.84]),
    lean('b_0', 'soot', [-2.75, -2.2], [0.5, 1.61], [1.5, 1.34], 0.08),
    lean('b_1', 'scorch', [-2.2, -1.75], [0.9, 1.5], [1.72, 1.29], 0.08),
  ], { paint: s.paint, scorch: s.scorch, soot: s.soot }),
  k.compound('crashed_military_helicopter_console', 40, [
    box('pedestal', 'dark', [2.4, s.deck, -0.18], [3.1, 0.78, 0.18]),
    k.prism('panel', 'dark', [[2.95, 0.78], [3.3, 0.78], [3.24, 1.2], [3.0, 1.2]], [-0.75, 0.75]),
  ], { dark: 'plastic-scorched' }),
  k.compound('crashed_military_helicopter_seat_frame', 18, [
    box('pan', 'dark', [-0.26, 0, -0.26], [0.26, 0.05, 0.26]),
    k.prism('back', 'dark', [[-0.34, 0.05], [-0.26, 0.05], [-0.34, 0.68], [-0.42, 0.68]], [-0.26, 0.26]),
  ] + k.bothSides([
    box('leg', 'dark', [-0.05, -0.18, 0.18], [0.05, 0, 0.26]),
  ]), { dark: 'steel-spall-black' }),
  m.wheel('crashed_military_helicopter_main_wheel', 45, 0.24, 0.16, 0.36, hub='steel-spall-black'),
  k.compound('crashed_military_helicopter_gear_strut', 40, [
    lean('leg', 'steel', [0.1, 0.24], [0.28, 1.56], [0.42, 1.16], 0.05),
    box('axle', 'steel', [0.12, 0.3, 1.5], [0.22, 0.38, 1.66]),
  ], { steel: 'steel-grey' }),
]
