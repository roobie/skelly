local t = import 'truck-cab.libsonnet';
local k = import 'kit.libsonnet';
local box = k.box;
local prism = k.prism;
local s = import 'tipper_truck.spec.libsonnet';
local tubPaint = { paint: s.paint, steel: 'steel-grey', frame: 'paint-charcoal', trim: 'plastic-black' };
local wallFront = s.tubFront - 0.07;
local topAt(x) = s.wallTopRear + (x - s.tubRear) * (s.wallTop - s.wallTopRear) / (wallFront - s.tubRear);
local ribs = [s.tubRear + 0.5 + i * 0.95 for i in std.range(0, 5)];
t.rows('tipper_truck', s) + [
  k.compound('tipper_truck_subframe', 520, k.bothSides([
    box('runner', 'frame', [s.tubRear + 0.2, s.railTop, 0.34], [wallFront, s.tubFloor, 0.46]),
    box('hinge', 'steel', [s.tubRear + 0.2, s.tubFloor - 0.14, 0.46], [s.tubRear + 0.5, s.tubFloor, 0.56]),
  ]), tubPaint),
  k.compound('tipper_truck_tub_floor', 1500, [
    box('plate', 'steel', [s.tubRear + 0.08, s.tubFloor, -s.tubSide], [wallFront, s.tubFloorTop, s.tubSide]),
  ] + [
    box('sill_' + i, 'frame', [s.tubRear + 0.3 + i * 0.95 - 0.04, s.tubFloor - 0.08, -s.tubSide], [s.tubRear + 0.3 + i * 0.95 + 0.04, s.tubFloor, s.tubSide])
    for i in std.range(0, 5)
  ], tubPaint),
  k.compound('tipper_truck_tub_side', 620, [
    prism('wall', 'paint', [[s.tubRear, s.tubFloor], [wallFront, s.tubFloor], [wallFront, s.wallTop], [s.tubRear, s.wallTopRear]], [s.wallIn, s.tubSide]),
    prism('top_rail', 'frame', [[s.tubRear, s.wallTopRear], [wallFront, s.wallTop], [wallFront, s.wallTop + 0.05], [s.tubRear, s.wallTopRear + 0.05]], [s.wallIn - 0.03, s.tubSide + 0.02]),
    box('bottom_rail', 'frame', [s.tubRear, s.tubFloor - 0.04, s.tubSide], [wallFront, s.tubFloor + 0.08, s.tubSide + 0.02]),
  ] + [
    box('rib_' + i, 'paint', [ribs[i] - 0.05, s.tubFloor + 0.08, s.tubSide], [ribs[i] + 0.05, topAt(ribs[i]) - 0.01, s.tubSide + 0.02])
    for i in std.range(0, 5)
  ], tubPaint),
  k.compound('tipper_truck_tub_front', 420, [
    box('wall', 'paint', [wallFront, s.tubFloor, -s.tubSide], [s.tubFront, s.canopyTop - 0.06, s.tubSide]),
    box('canopy', 'paint', [s.tubFront, s.canopyTop - 0.06, -s.tubSide + 0.06], [s.canopyFront, s.canopyTop, s.tubSide - 0.06]),
    box('canopy_lip', 'frame', [s.canopyFront, s.canopyTop - 0.1, -s.tubSide + 0.06], [s.canopyFront + 0.05, s.canopyTop, s.tubSide - 0.06]),
    box('ram_bracket', 'frame', [s.tubFront, 2.34, -0.14], [s.ramX + 0.12, 2.42, 0.14]),
  ] + k.bothSides([
    prism('gusset', 'frame', [[s.tubFront, s.canopyTop - 0.34], [s.tubFront + 0.5, s.canopyTop - 0.06], [s.tubFront, s.canopyTop - 0.06]], [s.tubSide - 0.1, s.tubSide - 0.06]),
  ]), tubPaint),
  k.compound('tipper_truck_tailgate', 190, [
    box('gate', 'paint', [s.tubRear - 0.03125, s.tubFloor + 0.02, -s.tubSide + 0.0625], [s.tubRear + 0.05, s.wallTopRear - 0.02, s.tubSide - 0.0625]),
    box('top_bar', 'frame', [s.tubRear - 0.0625, s.wallTopRear - 0.09, -s.tubSide], [s.tubRear - 0.03125, s.wallTopRear - 0.02, s.tubSide]),
    box('catch_bar', 'frame', [s.tubRear - 0.0625, s.tubFloor + 0.06, -s.tubSide], [s.tubRear - 0.03125, s.tubFloor + 0.14, s.tubSide]),
  ] + [
    box('rib_' + i, 'paint', [s.tubRear - 0.0625, s.tubFloor + 0.14, -0.9 + i * 0.6 - 0.04], [s.tubRear - 0.03125, s.wallTopRear - 0.09, -0.9 + i * 0.6 + 0.04])
    for i in std.range(0, 3)
  ], tubPaint),
  k.compound('tipper_truck_tip_ram', 150, [
    k.turned('sleeve', 'frame', 'y', k.disc(0.09, s.railTop, 1.8), [s.ramX, 0, 0]),
    k.turned('rod', 'steel', 'y', k.disc(0.055, 1.8, 2.34), [s.ramX, 0, 0]),
    box('foot', 'frame', [s.ramX - 0.12, s.railTop - 0.03, -0.46], [s.ramX + 0.12, s.railTop + 0.05, 0.46]),
  ], tubPaint),
]
