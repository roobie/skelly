local k = import 'kit.libsonnet';
local m = import 'military-kit.libsonnet';
local s = import 'military_cargo_truck.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local finish = { paint: 'paint-olive', frame: 'steel-parkerized', floor: 'wood-oak', dark: 'steel-spall-black', canvas: 'cloth-olive-drab', strap: 'webbing-olive-dark', rope: 'cord-olive' };
local stakes = [s.bedRear + 0.05 + i * (s.bedFront - s.bedRear - 0.15) / 6 for i in std.range(0, 6)];
local rail = 1.95;
local shoulder = 2.72;
local peak = 2.96;
local outer = s.bedSide + 0.04;
local SHOULDER = [[peak - 0.03, 0.8], [peak + 0.03, 0.8], [shoulder + 0.05, outer], [shoulder, outer]];
local CORNER = [[shoulder, 0.8], [peak, 0.8], [shoulder, outer]];
local HOOP_SHOULDER = [[peak + 0.03, 0.8], [peak + 0.06, 0.8], [shoulder + 0.08, outer + 0.01], [shoulder + 0.05, outer + 0.01]];
m.truckRows('military_cargo_truck', s) + [
  k.compound('military_cargo_truck_bed_floor', s.bedFloorMass, [
    box('floor', 'floor', [s.bedRear, s.deckBottom, -s.bedSide], [s.bedFront, s.deckTop, s.bedSide]),
  ], finish),
  k.compound('military_cargo_truck_bed', s.bedMass, [
    box('headboard', 'paint', [s.bedFront - 0.05, s.deckTop, -s.bedSide], [s.bedFront, rail, s.bedSide]),
    box('rear_sill', 'frame', [s.bedRear, s.deckBottom - 0.04, -s.bedSide], [s.bedRear + 0.04, s.deckBottom, s.bedSide]),
  ] + bothSides([
    box('side_board', 'paint', [s.bedRear, s.deckTop, s.bedSide - 0.04], [s.bedFront, rail, s.bedSide]),
    box('side_rub', 'frame', [s.bedRear, s.deckBottom - 0.04, s.bedSide], [s.bedFront, s.deckTop, s.bedSide + 0.01]),
  ] + [
    box('stake_' + i, 'frame', [stakes[i], s.deckTop, s.bedSide], [stakes[i] + 0.05, rail + 0.03, s.bedSide + 0.02])
    for i in std.range(0, 6)
  ]), finish),
  k.compound('military_cargo_truck_tailgate', 60, [
    box('board', 'paint', [s.bedRear - 0.04, s.deckBottom, -s.bedSide + 0.04], [s.bedRear, rail, s.bedSide - 0.04]),
    box('rib', 'frame', [s.bedRear - 0.05, 1.68, -s.bedSide + 0.04], [s.bedRear - 0.04, 1.72, s.bedSide - 0.04]),
  ] + bothSides([
    box('rib_v', 'frame', [s.bedRear - 0.05, s.deckBottom, 0.5], [s.bedRear - 0.04, rail, 0.54]),
  ]), finish, { hinge_a: ['board', [0, 0, 0.2]], hinge_b: ['board', [0, 0, 0.8]] }),
  k.compound('military_cargo_truck_tilt', s.tiltMass, [
    box('roof', 'canvas', [s.bedRear, peak, -0.8], [s.bedFront, peak + 0.03, 0.8]),
    box('front_upper', 'canvas', [s.bedFront - 0.03, shoulder, -0.8], [s.bedFront, peak, 0.8]),
    box('front_lower', 'canvas', [s.bedFront - 0.03, rail, -s.bedSide], [s.bedFront, shoulder, s.bedSide]),
    box('rear_roll', 'canvas', [s.bedRear - 0.06, shoulder - 0.14, -0.6], [s.bedRear + 0.04, shoulder, 0.6]),
    box('rear_top', 'canvas', [s.bedRear - 0.01, shoulder, -0.8], [s.bedRear + 0.02, peak, 0.8]),
  ] + bothSides([
    m.xPrism('shoulder', 'canvas', SHOULDER, [s.bedRear, s.bedFront]),
    m.xPrism('front_corner', 'canvas', CORNER, [s.bedFront - 0.03, s.bedFront]),
    m.xPrism('rear_corner', 'canvas', CORNER, [s.bedRear - 0.01, s.bedRear + 0.02]),
    box('side', 'canvas', [s.bedRear, rail - 0.1, s.bedSide + 0.01], [s.bedFront, shoulder, s.bedSide + 0.04]),
    box('rear_flap', 'canvas', [s.bedRear - 0.02, rail - 0.05, 0.62], [s.bedRear + 0.03, shoulder, s.bedSide + 0.04]),
    box('tie', 'rope', [s.bedRear - 0.03, 2.22, 0.6], [s.bedRear + 0.03, 2.26, s.bedSide + 0.05]),
  ] + [
    box('hoop_' + i, 'strap', [stakes[i] + 0.0, rail - 0.1, s.bedSide + 0.04], [stakes[i] + 0.05, shoulder + 0.08, s.bedSide + 0.05])
    for i in std.range(0, 6)
  ] + [
    m.xPrism('hoop_shoulder_' + i, 'strap', HOOP_SHOULDER, [stakes[i], stakes[i] + 0.05])
    for i in std.range(0, 6)
  ]) + [
    box('hoop_roof_' + i, 'strap', [stakes[i], peak + 0.03, -0.8], [stakes[i] + 0.05, peak + 0.04, 0.8])
    for i in std.range(0, 6)
  ], finish),
]
