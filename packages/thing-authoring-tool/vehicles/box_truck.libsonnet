local t = import 'truck-cab.libsonnet';
local k = import 'kit.libsonnet';
local box = k.box;
local s = import 'box_truck.spec.libsonnet';
// The electric truck keeps this cab but has no radiator for a grille to feed.
t.rows('box_truck', s) + [
  r for r in t.rows('electric_box_truck', s { grille: false }) if r.id == 'electric_box_truck_front_panel'
] + [
  k.compound('box_truck_box_floor', 420, [
    box('deck', 'deck', [s.boxRear, s.boxFloor, -s.boxSide], [s.boxFront, s.boxFloorTop, s.boxSide]),
    box('skirt', 'steel', [s.boxRear, s.boxFloor - 0.08, -s.boxSide], [s.boxFront, s.boxFloor, s.boxSide]),
  ] + k.bothSides([
    box('runner', 'steel', [s.boxRear + 0.04, s.railTop, 0.3], [s.boxFront - 0.04, s.boxFloor - 0.08, 0.44]),
  ]), { deck: 'wood-oak', steel: 'paint-charcoal' }),
  k.compound('box_truck_box_side', 240, [
    box('wall', 'wall', [s.boxRear + 0.06, s.boxFloorTop - 0.08, s.boxSide - 0.04], [s.boxFront - 0.05, s.boxTop - 0.08, s.boxSide]),
    box('rail_low', 'rail', [s.boxRear, s.boxFloor - 0.08, s.boxSide - 0.03], [s.boxFront, s.boxFloorTop, s.boxSide + 0.015]),
    box('rail_top', 'rail', [s.boxRear, s.boxTop - 0.1, s.boxSide - 0.03], [s.boxFront, s.boxTop, s.boxSide + 0.015]),
  ] + [
    box('post_' + i, 'rail', [s.boxRear + 0.05 + i * (s.boxFront - s.boxRear - 0.14) / 7, s.boxFloorTop, s.boxSide], [s.boxRear + 0.09 + i * (s.boxFront - s.boxRear - 0.14) / 7, s.boxTop - 0.1, s.boxSide + 0.012])
    for i in std.range(0, 7)
  ], { wall: 'paint-white', rail: 'alu-bare' }),
  k.compound('box_truck_box_front', 110, [
    box('wall', 'wall', [s.boxFront - 0.05, s.boxFloorTop - 0.08, -s.boxSide], [s.boxFront, s.boxTop, s.boxSide]),
  ], { wall: 'paint-white' }),
  k.compound('box_truck_box_roof', 130, [
    box('roof', 'roof', [s.boxRear, s.boxTop, -s.boxSide], [s.boxFront, s.boxTop + 0.0625, s.boxSide]),
  ], { roof: 'alu-bare' }),
  k.compound('box_truck_rear_door', 62, [
    box('skin', 'wall', [s.boxRear, s.boxFloorTop, 0.012], [s.boxRear + 0.05, s.boxTop - 0.1, s.boxSide - 0.04]),
    box('bar', 'rail', [s.boxRear - 0.015, s.boxFloorTop + 0.02, s.boxSide * 0.5], [s.boxRear, s.boxTop - 0.14, s.boxSide * 0.5 + 0.03]),
    box('handle', 'rail', [s.boxRear - 0.02, 2.0, s.boxSide * 0.5 - 0.22], [s.boxRear - 0.01, 2.04, s.boxSide * 0.5 + 0.03]),
  ], { wall: 'paint-white', rail: 'alu-bare' }, { hinge_a: ['skin', [0, 0.1, 1]], hinge_b: ['skin', [0, 0.9, 1]] }),
]
