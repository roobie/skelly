local t = import 'truck-cab.libsonnet';
local k = import 'kit.libsonnet';
local box = k.box;
local s = import 'fire_engine.spec.libsonnet';
local finish = { paint: s.paint, white: 'paint-white', reflect: 'reflective-yellow', frame: 'paint-charcoal', steel: 'steel-grey', alu: 'alu-bare', dark: 'plastic-black', tank: 'polymer-black', hose: 'plastic-red', gauge: 'plastic-yellow', chrome: 'steel-stainless' };
local archRear = s.rearAxles[0] - s.r - 0.1;
local archFront = s.rearAxles[0] + s.r + 0.1;
local archChamfer = 0.3;
local shutterTop = s.bodyTop - 0.1;
local bandLow = s.floor - 0.03;
local bandTop = s.floor + 0.07;
local shutterLow = bandTop;
local inset = s.bodySide - 0.04;
// A roller shutter: horizontal aluminium strips in the wall's skin depth, with a dark grab bar along its foot.
local shutter(name, x0, x1, y0, y1) = [
  box(name + '_bar', 'dark', [x0, y0, inset], [x1, y0 + 0.08, s.bodySide]),
] + [
  box(name + '_slat_' + i, if i % 2 == 0 then 'alu' else 'steel', [x0, y0 + 0.08 + i * 0.09, inset], [x1, std.min(y0 + 0.08 + (i + 1) * 0.09, y1), s.bodySide])
  for i in std.range(0, std.ceil((y1 - y0 - 0.08) / 0.09) - 1)
];
local rungs = std.range(0, 12);
local gantry = [s.bodyRear + 0.6, -1.2, 0.5];
t.rows('fire_engine', s) + [
  k.compound('fire_engine_body', 3000, [
    box('floor', 'frame', [s.bodyRear, s.bodyFloor - 0.05, -s.bodySide], [s.bodyFront, s.bodyFloor, s.bodySide]),
    box('roof', 'paint', [s.bodyRear, s.bodyTop - 0.05, -s.bodySide], [s.bodyFront, s.bodyTop, s.bodySide]),
    box('front_wall', 'paint', [s.bodyFront - 0.05, s.bodyFloor, -s.bodySide], [s.bodyFront, s.bodyTop, s.bodySide]),
    box('rear_wall', 'paint', [s.bodyRear, s.bodyFloor, -s.bodySide], [s.bodyRear + 0.05, s.bodyTop, s.bodySide]),
  ] + k.bothSides([
    box('wall', 'paint', [s.bodyRear, s.bodyFloor, inset - 0.04], [s.bodyFront, s.bodyTop, inset]),
    box('low_fore', 'paint', [archFront, s.bodyLow, inset], [s.bodyFront, s.bodyFloor - 0.05, s.bodySide]),
    box('low_aft', 'paint', [s.bodyRear, s.bodyLow, inset], [archRear, s.bodyFloor - 0.05, s.bodySide]),
    box('sill', 'paint', [s.bodyRear, s.bodyFloor - 0.05, inset], [s.bodyFront, bandLow, s.bodySide]),
  ] + t.archCorners('arch', 'paint', archRear, archFront, s.bodyFloor - 0.05, archChamfer, inset, s.bodySide)
    + t.archCorners('arch_liner', 'frame', archRear, archFront, s.bodyFloor - 0.05, archChamfer, 0.44, inset) + [
    box('arch_wall', 'frame', [archRear, 2 * s.r - 0.12, 0.5], [archFront, s.bodyFloor - 0.05, 0.53125]),
    box('arch_jamb_aft', 'frame', [archRear, s.bodyLow, 0.5], [archRear + 0.0625, s.bodyFloor - 0.05 - archChamfer, inset]),
    box('arch_jamb_fore', 'frame', [archFront - 0.0625, s.bodyLow, 0.5], [archFront, s.bodyFloor - 0.05 - archChamfer, inset]),
    box('band', 'reflect', [s.bodyRear, bandLow, inset], [s.bodyFront, bandTop, s.bodySide]),
    box('cap', 'white', [s.bodyRear, s.bodyTop - 0.1, inset], [s.bodyFront, s.bodyTop, s.bodySide]),
    box('post_rear', 'paint', [s.bodyRear, bandTop, inset], [s.bodyRear + 0.08, s.bodyTop - 0.1, s.bodySide]),
    box('post_front', 'paint', [s.bodyFront - 0.08, bandTop, inset], [s.bodyFront, s.bodyTop - 0.1, s.bodySide]),
  ]), finish),
  k.compound('fire_engine_cab_stripe', 6, k.bothSides([
    box('band', 'reflect', [s.cabBack, s.floor - 0.03, s.side], [s.face, s.floor + 0.07, s.side + 0.032]),
  ]), finish),
  k.compound('fire_engine_water_tank', 2000, [
    box('tank', 'tank', [archRear + 0.1, s.bodyFloor, -0.82], [archFront + 0.5, s.bodyTop - 0.1, 0.82]),
  ], finish),
  k.compound('fire_engine_lockers', 120,
    shutter('fore', -0.5, s.bodyFront - 0.08, shutterLow, shutterTop)
    + shutter('mid', archFront + 0.02, -0.6, shutterLow, shutterTop)
    + shutter('wheel', archRear + 0.02, archFront - 0.02, shutterLow, shutterTop)
    + shutter('aft', s.bodyRear + 0.08, archRear - 0.02, shutterLow, shutterTop)
    + [
      box('low_fore_handle', 'dark', [-0.6, 0.98, s.bodySide], [-0.2, 1.02, s.bodySide + 0.032]),
      box('low_aft_handle', 'dark', [-3.4, 0.98, s.bodySide], [-3.0, 1.02, s.bodySide + 0.032]),
    ], finish),
  k.compound('fire_engine_roof_ladder', 95, [
    box('rail_near', 'alu', [s.bodyRear + 0.1, s.ladderY, 0.26], [1.7, s.ladderY + 0.07, 0.32]),
    box('rail_far', 'alu', [s.bodyRear + 0.1, s.ladderY, -0.32], [1.7, s.ladderY + 0.07, -0.26]),
  ] + [
    box('rung_' + i, 'steel', [s.bodyRear + 0.25 + i * 0.44 - 0.02, s.ladderY + 0.02, -0.26], [s.bodyRear + 0.25 + i * 0.44 + 0.02, s.ladderY + 0.05, 0.26])
    for i in rungs
  ], finish),
  k.compound('fire_engine_gantry', 60, std.flattenArrays([
    [
      box('beam_' + i, 'frame', [gantry[i] - 0.04, s.ladderY - 0.04, -0.5], [gantry[i] + 0.04, s.ladderY, 0.5]),
    ] + k.bothSides([
      box('post_' + i, 'frame', [gantry[i] - 0.03, s.bodyTop, 0.44], [gantry[i] + 0.03, s.ladderY - 0.04, 0.5]),
    ])
    for i in std.range(0, 2)
  ]), finish),
  k.compound('fire_engine_pump_panel', 260, [
    box('panel', 'alu', [s.bodyRear - 0.02, 1.2, -0.82], [s.bodyRear, 2.2, 0.82]),
    box('surround', 'dark', [s.bodyRear - 0.015, 2.2, -0.82], [s.bodyRear, 2.25, 0.82]),
  ] + [
    box('gauge_' + i, 'gauge', [s.bodyRear - 0.03, 1.98, -0.64 + i * 0.32 - 0.06], [s.bodyRear - 0.02, 2.1, -0.64 + i * 0.32 + 0.06])
    for i in std.range(0, 4)
  ] + k.bothSides([
    box('valve', 'hose', [s.bodyRear - 0.1, 1.42, 0.42], [s.bodyRear - 0.02, 1.62, 0.62]),
    box('outlet', 'chrome', [s.bodyRear - 0.16, 1.47, 0.47], [s.bodyRear - 0.1, 1.57, 0.57]),
    box('chevron', 'reflect', [s.bodyRear - 0.006, s.bodyFloor, 0.9], [s.bodyRear, s.bodyTop - 0.1, 1.2]),
  ]), finish),
  k.compound('fire_engine_hose_reel', 70, k.bothSides([
    k.turned('drum', 'hose', 'z', k.disc(0.21, -0.18, 0.18), [s.bodyRear - 0.25, 2.6, 0.5]) + { sides: 16 },
    k.turned('flange_in', 'chrome', 'z', k.disc(0.25, -0.22, -0.18), [s.bodyRear - 0.25, 2.6, 0.5]) + { sides: 16 },
    k.turned('flange_out', 'chrome', 'z', k.annulus(0.12, 0.25, 0.18, 0.22), [s.bodyRear - 0.25, 2.6, 0.5]) + { sides: 16 },
    box('arm', 'frame', [s.bodyRear - 0.25, 2.57, 0.24], [s.bodyRear, 2.63, 0.28]),
  ]), finish),
  k.compound('fire_engine_rear_step', 50, [
    box('tread', 'alu', [s.rear, 0.9, -s.bodySide + 0.1], [s.bodyRear, 0.95, s.bodySide - 0.1]),
    box('skirt', 'dark', [s.rear, 0.82, -s.bodySide + 0.1], [s.bodyRear, 0.9, s.bodySide - 0.1]),
  ], finish),
]
