local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'tank_trailer.spec.libsonnet';
local box = k.box;
local bothSides = k.bothSides;
local finish = { paint: s.paint, frame: s.frame };
local barrelAt = [0, s.barrelY, 0];
local section(id, slot, r, from, to) = k.turned(id, slot, 'x', k.disc(r, from, to), barrelAt) + { sides: 24 };
local bandAt = [-1.3, -0.5, 0.3, 1.1];
[
  k.compound('tank_trailer_chassis', 320, [
    box('rear_rail', 'frame', [s.rear - 0.08, 0.5, -0.85], [s.rear, 0.6, 0.85]),
    box('rear_cross', 'frame', [s.rear, s.frameLow, -0.5], [s.rear + 0.06, s.frameHigh, 0.5]),
    box('axle_cross', 'frame', [s.axle - 0.05, s.frameLow, -0.5], [s.axle + 0.05, s.frameHigh, 0.5]),
    box('front_cross', 'frame', [s.front - 0.06, s.frameLow, -0.5], [s.front, s.frameHigh, 0.5]),
  ] + bothSides([
    box('side_rail', 'frame', [s.rear, s.frameLow, 0.45], [s.front, s.frameHigh, 0.55]),
    box('rear_hanger', 'frame', [s.rear - 0.06, 0.5, 0.45], [s.rear, s.frameLow, 0.55]),
    box('spring', 'frame', [s.axle - 0.3, s.hub, 0.5], [s.axle + 0.3, s.frameLow, 0.56]),
    box('guard_stub', 'frame', [s.axle - 0.05, s.frameLow, 0.55], [s.axle + 0.05, 0.78, 0.58]),
    box('guard_arm', 'frame', [s.axle - 0.05, 0.75, 0.55], [s.axle + 0.05, 0.78, 0.92]),
  ]) + [
    box('hose_hanger', 'frame', [0.58, s.frameLow, 0.55], [0.64, 0.8, 0.72]),
  ] + h.drawbar(s.front, 0.5, s.tip, [s.frameLow, s.frameLow + 0.1]), finish),
  // Stepped to hug the barrel, which sinks into each saddle's top step.
  k.compound('tank_trailer_saddle', 18, [
    box('base', 'frame', [-0.06, s.frameHigh, -0.55], [0.06, 0.84, 0.55]),
  ] + bothSides([
    box('low', 'frame', [-0.06, 0.84, 0.3], [0.06, 0.98, 0.55]),
    box('high', 'frame', [-0.06, 0.98, 0.45], [0.06, 1.12, 0.57]),
  ]), finish),
  k.compound('tank_trailer_barrel', 340, [
    section('shell', 'paint', s.radius, s.barrelRear, s.barrelFront),
    section('rear_dish', 'paint', 0.5, s.barrelRear - 0.08, s.barrelRear),
    section('rear_cap', 'paint', 0.3, s.barrelRear - 0.12, s.barrelRear - 0.08),
    section('front_dish', 'paint', 0.5, s.barrelFront, s.barrelFront + 0.08),
    section('front_cap', 'paint', 0.3, s.barrelFront + 0.08, s.barrelFront + 0.12),
    k.turned('manhole', 'chrome', 'y', k.disc(0.22, 1.98, 2.1), [-0.25, 0, 0]) + { sides: 16 },
    k.turned('lid', 'frame', 'y', k.disc(0.17, 2.1, 2.14), [-0.25, 0, 0]) + { sides: 16 },
    k.turned('outlet', 'chrome', 'x', k.disc(0.06, s.barrelRear - 0.34, s.barrelRear + 0.04), [0, 0.92, 0]) + { sides: 12 },
    box('valve', 'frame', [s.barrelRear - 0.26, 0.84, -0.08], [s.barrelRear - 0.16, 1.0, 0.08]),
    box('rear_plate', 'plate', [s.barrelRear - 0.14, 1.28, -0.16], [s.barrelRear - 0.11, 1.5, 0.16]),
  ]
  + [section('band_' + i, 'frame', s.radius + 0.012, bandAt[i], bandAt[i] + 0.04) for i in std.range(0, std.length(bandAt) - 1)]
  + bothSides([
    box('side_plate', 'plate', [-0.2, 1.3, 0.56], [0.25, 1.56, 0.635]),
  ]), finish { chrome: 'steel-bright', plate: 'plastic-orange' }),
  k.compound('tank_trailer_walkway', 22, [
    box('tread', 'tread', [0.12, 2.03, -0.18], [1.1, 2.06, 0.18]),
    box('tread_rear', 'tread', [-1.3, 2.03, -0.18], [-0.53, 2.06, 0.18]),
    box('foot_front', 'frame', [0.5, 1.98, -0.1], [0.56, 2.03, 0.1]),
    box('foot_rear', 'frame', [-1.0, 1.98, -0.1], [-0.94, 2.03, 0.1]),
  ], { tread: 'steel-galvanised', frame: s.frame }),
  k.compound('tank_trailer_ladder', 9, [
    box('rung_' + i, 'steel', [s.barrelRear - 0.16, 1.1 + 0.2 * i, -0.2], [s.barrelRear - 0.12, 1.13 + 0.2 * i, 0.2])
    for i in std.range(0, 4)
  ] + bothSides([
    box('rail', 'steel', [s.barrelRear - 0.16, 1.0, 0.2], [s.barrelRear - 0.12, 2.06, 0.24]),
    box('top_stay', 'steel', [s.barrelRear - 0.16, 1.96, 0.2], [s.barrelRear + 0.1, 2.0, 0.24]),
    box('low_stay', 'steel', [s.barrelRear - 0.16, 1.02, 0.2], [s.barrelRear - 0.02, 1.06, 0.24]),
  ]), { steel: 'steel-galvanised' }),
  k.compound('tank_trailer_hose', 12, [
    k.turned('hose', 'hose', 'x', k.disc(0.045, -1.1, 0.72), [0, 0.84, 0.66]) + { sides: 8 },
    box('front_clip', 'steel', [0.56, 0.8, 0.6], [0.66, 0.9, 0.72]),
    box('rear_clip', 'steel', [s.axle - 0.05, 0.78, 0.6], [s.axle + 0.05, 0.89, 0.72]),
  ], { hose: 'rubber-black', steel: 'steel-galvanised' }),
  h.mudguard('tank_trailer_mudguard', 8, s.axle, s.hub, 0.4, 0.43, [0.82, s.wheelZ + 0.14], s.frame),
]
