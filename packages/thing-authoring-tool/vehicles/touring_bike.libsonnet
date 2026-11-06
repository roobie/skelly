local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'touring_bike.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local tube = m.bar;
local rad(degrees) = degrees * std.pi / 180;
local forkX(y) = s.frontAxle - (y - s.hub) * 0.51;
local spokes = [
  local a = rad(i * 72 + 18);
  local c = std.cos(a);
  local n = std.sin(a);
  tube('spoke_' + i, 'spoke', [0.06 * c, 0.06 * n], [0.21 * c, 0.21 * n], 0.05, [-0.035, 0.035])
  for i in std.range(0, 4)
];
local fin(i) =
  local y = 0.5 + i * 0.032;
  local at(height) = (height - 0.5) * 0.3;
  local half = if i % 2 == 0 then 0.17 else 0.15;
  prism('fin_' + i, if i % 2 == 0 then 'alloy' else 'dark', [
    [-0.04 + at(y), y], [0.3 + at(y), y], [0.3 + at(y + 0.032), y + 0.032], [-0.04 + at(y + 0.032), y + 0.032],
  ], [-half, half]);
[
  k.compound('touring_bike_frame', 28, [
    tube('head', 'frame', [forkX(0.84), 0.84], [forkX(1.06), 1.06], 0.08, [-0.04, 0.04]),
    tube('down', 'frame', [0.4, 0.22], [0.46, 0.95], 0.07, [-0.04, 0.04]),
    box('cradle', 'frame', [-0.32, 0.16, -0.06], [0.38, 0.21, 0.06]),
    box('rear_cross', 'frame', [-1.0, 0.66, -0.1], [-0.94, 0.72, 0.1]),
    box('seat_cross', 'frame', [-0.34, 0.66, -0.1], [-0.28, 0.72, 0.1]),
  ] + bothSides([
    tube('spar', 'frame', [-0.3, 0.66], [0.43, 0.98], 0.09, [0.094, 0.125]),
    tube('rear_post', 'frame', [-0.33, 0.2], [-0.3, 0.7], 0.08, [0.06, 0.1]),
    box('pivot_plate', 'frame', [-0.42, 0.28, 0.1], [-0.26, 0.5, 0.14]),
    box('sub_rail', 'frame', [-1.0, 0.66, 0.07], [-0.28, 0.72, 0.1]),
    tube('sub_stay', 'frame', [-0.34, 0.46], [-0.8, 0.68], 0.05, [0.07, 0.1]),
  ]), { frame: 'paint-charcoal' }),
  k.compound('touring_bike_fork', 14, [
    box('top_yoke', 'alloy', [forkX(1.06) - 0.06, 1.05, -0.105], [forkX(1.06) + 0.06, 1.08, 0.105]),
    box('lower_yoke', 'alloy', [forkX(0.9) - 0.06, 0.88, -0.105], [forkX(0.9) + 0.06, 0.91, 0.105]),
    k.turned('axle', 'alloy', 'z', k.disc(0.025, -0.105, 0.105), [s.frontAxle, s.hub, 0]),
  ] + bothSides([
    tube('stanchion', 'chrome', [forkX(0.5), 0.5], [forkX(1.08), 1.08], 0.055, [0.075, 0.105]),
    tube('slider', 'alloy', [forkX(s.hub), s.hub], [forkX(0.6), 0.6], 0.08, [0.075, 0.105]),
  ]), { alloy: 'alu-bare', chrome: 'steel-bright' }),
  // Shaft drive: the final-drive case on the far side stands in for a chain.
  k.compound('touring_bike_swingarm', 11, [
    box('pivot_tube', 'frame', [-0.4, 0.33, -0.085], [-0.3, 0.42, 0.085]),
    k.turned('axle', 'frame', 'z', k.disc(0.025, -0.105, 0.105), [s.rearAxle, s.hub, 0]),
    k.turned('final_drive', 'alloy', 'z', k.disc(0.09, -0.13, -0.075), [s.rearAxle, s.hub, 0]) + { sides: 12 },
  ] + bothSides([
    tube('arm', 'frame', [s.rearAxle, s.hub], [-0.35, 0.375], 0.07, [0.075, 0.105]),
  ]), { frame: 'paint-charcoal', alloy: 'alu-bare' }),
  k.compound('touring_bike_shock', 3, [
    tube('rod', 'chrome', [-0.38, 0.4], [-0.29, 0.66], 0.05, [-0.03, 0.03]),
  ], { chrome: 'steel-bright' }),
  k.compound('touring_bike_wheel', 14, [
    k.turned('tyre', 'tyre', 'z', [[-0.065, 0.235], [-0.065, 0.28], [-0.05, s.tyre], [0.05, s.tyre], [0.065, 0.28], [0.065, 0.235], [-0.065, 0.235]]) + { sides: 24 },
    k.turned('rim', 'rim', 'z', k.annulus(0.205, 0.235, -0.05, 0.05)) + { sides: 24 },
    k.turned('web', 'web', 'z', k.disc(0.21, -0.016, 0.016)) + { sides: 24 },
    k.turned('hub', 'hub', 'z', k.disc(0.07, -0.06, 0.06)) + { sides: 12 },
  ] + spokes, { tyre: 'rubber-black', rim: 'alu-bare', web: 'plastic-black', spoke: 'alu-bare', hub: 'alu-bare' }, { hub: ['hub', [0.5, 0.5, 0.5]] }),
  k.compound('touring_bike_engine', 105, [
    box('crankcase', 'casing', [-0.24, 0.24, -0.19], [0.3, 0.5, 0.19]),
    box('gearbox', 'casing', [-0.24, 0.5, -0.12], [-0.06, 0.62, 0.12]),
    box('sump', 'casing', [-0.1, 0.2, -0.12], [0.22, 0.24, 0.12]),
    prism('head', 'casing', [[0.008, 0.66], [0.348, 0.66], [0.366, 0.72], [0.026, 0.72]], [-0.15, 0.15]),
    k.turned('near_cover', 'alloy', 'z', k.disc(0.12, 0.19, 0.225), [-0.02, 0.37, 0]) + { sides: 16 },
    k.turned('far_cover', 'alloy', 'z', k.disc(0.12, -0.225, -0.19), [-0.02, 0.37, 0]) + { sides: 16 },
  ] + [fin(i) for i in std.range(0, 4)], { casing: 'steel-grey', alloy: 'alu-bare', dark: 'paint-charcoal' }),
  k.compound('touring_bike_exhaust', 7, [
    box('header', 'chrome', [0.3, 0.2, 0.08], [0.36, 0.56, 0.16]),
    box('run', 'chrome', [-0.36, 0.17, 0.08], [0.36, 0.23, 0.18]),
    box('link', 'chrome', [-0.52, 0.2, 0.12], [-0.34, 0.26, 0.24]),
    k.turned('silencer', 'chrome', 'x', k.disc(0.065, -1.0, -0.52), [0, 0.28, 0.24]) + { sides: 12 },
    k.turned('tip', 'dark', 'x', k.disc(0.03, -1.03, -1.0), [0, 0.28, 0.24]),
    box('bracket', 'frame', [-0.59, 0.33, 0.1], [-0.56, 0.6, 0.19]),
  ], { chrome: 'steel-bright', dark: 'plastic-black', frame: 'paint-charcoal' }),
  k.compound('touring_bike_centre_stand', 4, [
    box('cross', 'frame', [-0.3, 0.03, -0.19], [-0.24, 0.06, 0.19]),
  ] + bothSides([
    box('leg', 'frame', [-0.3, 0.03, 0.19], [-0.24, 0.34, 0.22]),
    box('foot', 'frame', [-0.34, 0, 0.16], [-0.2, 0.03, 0.25]),
  ]), { frame: 'paint-charcoal' }),
  k.compound('touring_bike_footrest', 0.5, [
    box('bar', 'frame', [-0.28, 0.34, 0.19], [-0.2, 0.38, 0.26]),
    box('rubber', 'rubber', [-0.28, 0.34, 0.26], [-0.2, 0.38, 0.34]),
  ], { frame: 'paint-charcoal', rubber: 'rubber-black' }),
  k.compound('touring_bike_pillion_footrest', 0.5, [
    box('hanger', 'frame', [-0.46, 0.4, 0.1], [-0.42, 0.52, 0.14]),
    box('bar', 'frame', [-0.5, 0.38, 0.1], [-0.42, 0.42, 0.2]),
    box('rubber', 'rubber', [-0.5, 0.38, 0.2], [-0.42, 0.42, 0.27]),
  ], { frame: 'paint-charcoal', rubber: 'rubber-black' }),
  k.compound('touring_bike_front_mudguard', 2, h.arcBand('guard', 'paint', s.frontAxle, s.hub, 0.33, 0.36, 30, 125, 7, [-0.075, 0.075]), { paint: s.paint }),
  k.compound('touring_bike_rear_mudguard', 1.5, h.arcBand('guard', 'paint', s.rearAxle, s.hub, 0.33, 0.36, 40, 170, 8, [-0.075, 0.075]), { paint: s.paint }),
  k.compound('touring_bike_tail_lamp', 0.3, [
    box('stay', 'stay', [-1.03, 0.64, -0.03], [-1.0, 0.68, 0.03]),
    box('lens', 'lens', [-1.06, 0.6, -0.1], [-1.03, 0.68, 0.1]),
  ], { stay: 'paint-charcoal', lens: 'plastic-red' }),
  k.compound('touring_bike_tank', 8, [
    prism('tank', 'paint', [[-0.06, 0.72], [0.25, 0.78], [0.38, 0.88], [0.4, 0.98], [0.34, 1.03], [0.06, 0.98], [-0.06, 0.86]], [-0.2, 0.2]),
    box('cap', 'chrome', [0.12, 0.99, -0.04], [0.2, 1.02, 0.04]),
  ], { paint: s.paint, chrome: 'steel-bright' }),
  // The rider sits in a dip and the pillion on a raised step, both above the pannier lids.
  k.compound('touring_bike_seat', 6, [
    box('pan', 'pan', [-0.95, 0.72, -0.15], [-0.06, 0.74, 0.15]),
    prism('rider', 'saddle', [[-0.62, 0.74], [-0.06, 0.74], [-0.06, 0.8], [-0.1, 0.82], [-0.62, 0.81]], [-0.17, 0.17]),
    prism('pillion', 'saddle', [[-0.95, 0.74], [-0.62, 0.74], [-0.62, 0.89], [-0.91, 0.9], [-0.95, 0.86]], [-0.16, 0.16]),
  ], { saddle: 'vinyl-black', pan: 'plastic-black' }),
  k.compound('touring_bike_side_cover', 0.5, [
    prism('cover', 'paint', [[-0.4, 0.6], [-0.26, 0.5], [-0.08, 0.5], [-0.08, 0.72], [-0.4, 0.72]], [0.1, 0.18]),
  ], { paint: s.paint }),
  // Frame-mounted, so the bars and fork turn inside it; the slot between the cheeks leaves the headlamp showing.
  k.compound('touring_bike_fairing', 18, [
    prism('nose', 'paint', [[0.49, 0.96], [0.725, 0.96], [0.72, 1.0], [0.6, 1.14], [0.51, 1.12]], [-0.11, 0.11]),
    prism('dash', 'dash', [[0.49, 0.98], [0.54, 0.98], [0.54, 1.1], [0.51, 1.1]], [-0.2, 0.2]),
  ] + bothSides([
    prism('cheek', 'paint', [[0.42, 0.6], [0.64, 0.66], [0.74, 0.82], [0.72, 1.0], [0.6, 1.14], [0.51, 1.12]], [0.11, 0.33]),
    box('indicator', 'lamp', [0.68, 0.86, 0.33], [0.74, 0.92, 0.36]),
    box('mirror', 'dash', [0.5, 1.06, 0.33], [0.56, 1.16, 0.42]),
  ]), { paint: s.paint, dash: 'plastic-black', lamp: 'plastic-orange' }),
  k.compound('touring_bike_headlamp', 1.5, [
    box('housing', 'dark', [0.56, 0.8, -0.11], [0.74, 0.96, 0.11]),
    box('lens', 'lens', [0.74, 0.82, -0.09], [0.755, 0.93, 0.09]),
  ], { dark: 'plastic-black', lens: 'plastic-frosted' }),
  k.compound('touring_bike_windscreen', 2, [
    prism('screen', 'glass', [[0.6, 1.14], [0.64, 1.14], [0.48, 1.4], [0.44, 1.4]], [-0.24, 0.24]),
  ], { glass: 'glass-clear' }),
  k.compound('touring_bike_handlebar', 3, [
    box('riser', 'alloy', [0.34, 1.08, -0.06], [0.42, 1.12, 0.06]),
    box('bar', 'chrome', [0.3, 1.12, -0.24], [0.36, 1.15, 0.24]),
  ] + bothSides([
    box('grip', 'rubber', [0.24, 1.12, 0.22], [0.3, 1.15, 0.36]),
  ]), { alloy: 'alu-bare', chrome: 'steel-bright', rubber: 'rubber-black' }),
  k.compound('touring_bike_lower_fairing', 3, [
    prism('panel', 'paint', [[0.16, 0.46], [0.4, 0.46], [0.42, 0.6], [0.42, 0.7], [0.16, 0.76]], [0.21, 0.27]),
    box('standoff', 'dark', [0.2, 0.5, 0.17], [0.3, 0.6, 0.21]),
  ], { paint: s.paint, dark: 'plastic-black' }),
  // Lids stop below both saddles and the boxes start behind the rider, so the seat stays clear between them.
  k.compound('touring_bike_pannier', 8, [
    prism('body', 'paint', [[-1.06, 0.42], [-1.02, 0.38], [-0.64, 0.38], [-0.6, 0.42], [-0.6, 0.66], [-1.06, 0.66]], [0.17, 0.4]),
    box('lid', 'lid', [-1.07, 0.66, 0.165], [-0.59, 0.72, 0.405]),
    box('latch', 'chrome', [-0.86, 0.63, 0.4], [-0.8, 0.69, 0.415]),
  ], { paint: s.paint, lid: 'paint-charcoal', chrome: 'steel-bright' }),
  k.compound('touring_bike_pannier_rack', 2, [
    box('rear_stay', 'frame', [-0.98, 0.46, 0.1], [-0.92, 0.69, 0.17]),
    box('front_stay', 'frame', [-0.66, 0.46, 0.1], [-0.6, 0.69, 0.17]),
    box('rail', 'frame', [-1.02, 0.6, 0.1], [-0.6, 0.63, 0.13]),
  ], { frame: 'paint-charcoal' }),
  k.compound('touring_bike_top_box', 6, [
    prism('body', 'paint', [[-1.28, 0.89], [-1.24, 0.85], [-0.98, 0.85], [-0.98, 1.08], [-1.28, 1.08]], [-0.19, 0.19]),
    box('lid', 'lid', [-1.29, 1.08, -0.195], [-0.97, 1.14, 0.195]),
    box('reflector', 'lamp', [-1.29, 0.93, -0.12], [-1.28, 0.98, 0.12]),
  ], { paint: s.paint, lid: 'paint-charcoal', lamp: 'plastic-red' }),
  k.compound('touring_bike_top_rack', 1.5, [
    box('plate', 'frame', [-1.24, 0.82, -0.16], [-0.96, 0.85, 0.16]),
  ] + bothSides([
    box('post', 'frame', [-1.0, 0.72, 0.06], [-0.96, 0.82, 0.094]),
    tube('brace', 'frame', [-1.0, 0.7], [-1.16, 0.83], 0.03, [0.06, 0.094]),
  ]), { frame: 'paint-charcoal' }),
]
