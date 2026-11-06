local t = import 'truck-cab.libsonnet';
local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local box = k.box;
local prism = k.prism;
local s = import 'street_sweeper.spec.libsonnet';
local finish = { paint: s.paint, frame: 'paint-charcoal', steel: 'steel-grey', dark: 'plastic-black', bristle: 'plastic-orange', broom: 'plastic-yellow', band: 'plastic-orange', red: 'plastic-red', pale: 'plastic-hivis', hose: 'rubber-black', hinge: 'steel-hardened' };
local shoulder = 0.24;
local capLength = 0.42;
local capFall = 0.3;
local midRear = s.bodyRear + capLength;
local crown = s.bodySide - shoulder;
// One prism along the body per curved surface: the section's shoulders are its own chamfers, so no layers show.
local section(id, x0, x1) = prism(id, 'paint', [], [0, 0]) + {
  axis: 'x', start: x0, end: x1,
  profile: [[s.bodyLow, -s.bodySide], [s.bodyTop - shoulder, -s.bodySide], [s.bodyTop, -crown], [s.bodyTop, crown], [s.bodyTop - shoulder, s.bodySide], [s.bodyLow, s.bodySide]],
};
// The rear falls away in side view on the cap and in plan on the corner wedges beside it; a y prism's profile is (z, x).
local hopperPieces = [
  section('hopper_mid', midRear, s.hopperFront),
  prism('hopper_cap', 'paint', [[s.bodyRear, s.bodyLow + 0.25], [midRear, s.bodyLow], [midRear, s.bodyTop], [s.bodyRear, s.bodyTop - capFall]], [-crown, crown]),
] + k.bothSides([
  prism('hopper_corner', 'paint', [], [0, 0]) + {
    axis: 'y', start: s.bodyLow, end: s.bodyTop - shoulder,
    profile: [[crown, s.bodyRear + 0.1], [s.bodySide, midRear], [crown, midRear]],
  },
]);
// The round door stays on the flat rear face, so its rim never crosses the sloped cap.
local doorY = (s.bodyLow + 0.25 + s.bodyTop - capFall) / 2;
local doorR = 0.58;
// Hazard stripes on the round door, on an x prism whose profile is (y, z).
local stripe(id, slot, z0) = prism(id, slot, [], [0, 0]) + {
  axis: 'x', start: s.bodyRear - 0.1, end: s.bodyRear - 0.08,
  profile: [[doorY - 0.24, z0 + 0.1], [doorY - 0.24, z0], [doorY + 0.24, z0 + 0.19], [doorY + 0.24, z0 + 0.29]],
};
t.rows('street_sweeper', s) + [
  k.compound('street_sweeper_subframe', 260, [
    box('guard_beam', 'frame', [-1.6, 0.94, -s.bodySide], [-0.9, s.bodyLow, s.bodySide]),
    box('front_beam', 'frame', [s.hopperFront, 0.94, -0.46], [s.hopperFront + 0.3, s.bodyLow, 0.46]),
  ] + k.bothSides([
    box('runner', 'frame', [s.bodyRear + 0.2, s.railTop, 0.3], [s.bodyFront, s.bodyLow, 0.44]),
  ]), finish),
  k.compound('street_sweeper_hopper', 950, hopperPieces + k.bothSides([
    box('band', 'band', [s.bodyRear + 0.3, 1.9, s.bodySide], [s.hopperFront, 2.14, s.bodySide + 0.032]),
    box('rib_a', 'steel', [-2.2, s.bodyLow, s.bodySide], [-2.12, 1.9, s.bodySide + 0.032]),
    box('rib_b', 'steel', [-1.2, s.bodyLow, s.bodySide], [-1.12, 1.9, s.bodySide + 0.032]),
    m.bar('tip_ram', 'hinge', [-0.72, 1.02], [-1.5, 1.86], 0.09, [s.bodySide + 0.02, s.bodySide + 0.07]),
  ]), finish),
  k.compound('street_sweeper_rear_door', 110, [
    k.turned('door', 'paint', 'x', k.disc(doorR - 0.06, s.bodyRear - 0.08, s.bodyRear), [0, doorY, 0]) + { sides: 20 },
    k.turned('rim', 'frame', 'x', k.annulus(doorR - 0.06, doorR, s.bodyRear - 0.09, s.bodyRear), [0, doorY, 0]) + { sides: 20 },
    stripe('stripe_a', 'red', -0.43),
    stripe('stripe_b', 'red', -0.145),
    stripe('stripe_c', 'red', 0.14),
    box('latch', 'frame', [s.bodyRear - 0.12, doorY - doorR - 0.03, -0.14], [s.bodyRear - 0.04, doorY - doorR + 0.09, 0.14]),
  ], finish),
  k.compound('street_sweeper_water_tank', 340, [
    section('tank', s.hopperFront, s.bodyFront),
  ] + [
    k.turned('filler', 'dark', 'y', k.disc(0.15, s.bodyTop, s.bodyTop + 0.08), [0.4, 0, 0]) + { sides: 12 },
  ] + k.bothSides([
    box('band', 'band', [s.hopperFront, 1.9, s.bodySide], [s.bodyFront, 2.14, s.bodySide + 0.032]),
  ]), finish),
  k.compound('street_sweeper_fan_housing', 170, k.bothSides([
    box('housing', 'steel', [0.05, 1.2, s.bodySide], [0.85, 1.78, s.bodySide + 0.0625]),
  ] + [
    box('louvre_' + i, 'dark', [0.11, 1.27 + i * 0.1, s.bodySide + 0.0625], [0.79, 1.32 + i * 0.1, s.bodySide + 0.094])
    for i in std.range(0, 4)
  ]), finish),
  k.compound('street_sweeper_gutter_brush', 60, [
    k.turned('bristles', 'bristle', 'y', k.disc(s.brushR, 0.02, 0.12), [s.brushX, 0, s.brushZ]) + { sides: 20 },
    k.turned('plate', 'frame', 'y', k.disc(0.24, 0.12, 0.18), [s.brushX, 0, s.brushZ]) + { sides: 16 },
    k.turned('motor', 'dark', 'y', k.disc(0.09, 0.18, 0.38), [s.brushX, 0, s.brushZ]) + { sides: 12 },
    box('arm', 'frame', [s.brushX - 0.04, 0.38, 0.42], [s.brushX + 0.04, 0.46, s.brushZ + 0.06]),
    box('hanger', 'frame', [s.brushX - 0.05, 0.46, 0.42], [s.brushX + 0.05, s.railBottom + 0.04, 0.52]),
  ], finish),
  k.compound('street_sweeper_main_broom', 90, [
    k.turned('broom', 'broom', 'z', k.disc(0.2, -0.52, 0.52), [s.broomX, 0.22, 0]) + { sides: 16 },
    k.turned('core', 'frame', 'z', k.disc(0.05, -0.6, 0.6), [s.broomX, 0.22, 0]) + { sides: 8 },
  ] + k.bothSides([
    box('hanger', 'frame', [s.broomX - 0.04, 0.2, 0.54], [s.broomX + 0.04, s.railBottom + 0.04, 0.6]),
  ]), finish),
  k.compound('street_sweeper_suction', 70, [
    box('nozzle', 'dark', [s.broomX - 0.14, 0.06, 0.62], [s.broomX + 0.14, 0.22, 0.78]),
    box('nozzle_lip', 'hose', [s.broomX - 0.16, 0.02, 0.6], [s.broomX + 0.16, 0.06, 0.8]),
    k.turned('hose', 'hose', 'y', k.disc(0.11, 0.22, s.bodyLow + 0.02), [s.broomX, 0, 0.7]) + { sides: 12 },
    k.turned('collar_low', 'steel', 'y', k.disc(0.13, 0.46, 0.52), [s.broomX, 0, 0.7]) + { sides: 12 },
    k.turned('collar_high', 'steel', 'y', k.disc(0.13, 0.8, 0.86), [s.broomX, 0, 0.7]) + { sides: 12 },
  ], finish),
]
