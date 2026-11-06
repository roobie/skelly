local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'dirt_bike.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local rad(degrees) = degrees * std.pi / 180;
local tube = (import 'machine-kit.libsonnet').bar;
local forkX(y) = s.frontAxle - (y - s.frontHub) * 0.52;
// Blocks alternating in height round the tyre: the knobbly tread is what reads as off-road at the vehicle grain.
local knobbly(radius) = std.flattenArrays([
  h.arcBand('tread_' + i, 'tyre', 0, 0, radius - 0.1, if i % 2 == 0 then radius else radius - 0.03, i * 15, (i + 1) * 15, 1, [-0.055, 0.055])
  for i in std.range(0, 23)
]);
local wheel(id, massKg, radius) = k.compound(id, massKg, knobbly(radius) + [
  k.turned('rim', 'rim', 'z', k.annulus(radius - 0.13, radius - 0.1, -0.03, 0.03)) + { sides: 24 },
  k.turned('hub', 'hub', 'z', k.disc(0.07, -0.06, 0.06)) + { sides: 12 },
] + [
  local a = rad(i * 60 + 15);
  tube('spoke_' + i, 'spoke', [0.06 * std.cos(a), 0.06 * std.sin(a)], [(radius - 0.12) * std.cos(a), (radius - 0.12) * std.sin(a)], 0.04, [-0.03, 0.03])
  for i in std.range(0, 5)
], { tyre: 'rubber-black', rim: 'steel-grey', spoke: 'steel-stainless', hub: 'alu-bare' }, { hub: ['hub', [0.5, 0.5, 0.5]] });
[
  k.compound('dirt_bike_frame', 19, [
    tube('head', 'frame', [forkX(0.84), 0.84], [forkX(1.06), 1.06], 0.08, [-0.032, 0.032]),
    tube('spine', 'frame', [-0.24, 0.78], [forkX(0.98), 0.98], 0.07, [-0.032, 0.032]),
    tube('down', 'frame', [0.24, 0.3], [forkX(0.9), 0.9], 0.07, [-0.032, 0.032]),
    box('cradle', 'frame', [-0.28, 0.3, -0.05], [0.26, 0.36, 0.05]),
    tube('seat_post', 'frame', [-0.28, 0.34], [-0.24, 0.84], 0.08, [-0.06, 0.06]),
    box('pivot_plate', 'frame', [-0.36, 0.38, -0.0625], [-0.24, 0.62, 0.0625]),
  ] + bothSides([
    // A voxel inboard of the saddle's flank and below its base, so the rail cannot speckle through either.
    tube('sub_rail', 'frame', [-0.24, 0.8], [-0.9, 0.85], 0.05, [0.03125, 0.0625]),
    tube('sub_stay', 'frame', [-0.3, 0.56], [-0.8, 0.84], 0.04, [0.03125, 0.0625]),
  ]), { frame: s.frame }),
  k.compound('dirt_bike_fork', 9, [
    box('top_yoke', 'alloy', [forkX(1.1) - 0.07, 1.08, -0.11], [forkX(1.1) + 0.07, 1.12, 0.11]),
    box('lower_yoke', 'alloy', [forkX(0.98) - 0.07, 0.96, -0.11], [forkX(0.98) + 0.07, 1.0, 0.11]),
    k.turned('axle', 'alloy', 'z', k.disc(0.025, -0.11, 0.11), [s.frontAxle, s.frontHub, 0]),
  ] + bothSides([
    tube('tube', 'alloy', [forkX(0.7), 0.7], [forkX(1.12), 1.12], 0.0625, [0.07, 0.11]),
    tube('stanchion', 'chrome', [s.frontAxle, s.frontHub], [forkX(0.72), 0.72], 0.05, [0.07, 0.11]),
  ]), { alloy: 'plastic-black', chrome: 'steel-bright' }),
  k.compound('dirt_bike_swingarm', 5, [
    box('pivot_tube', 'frame', [-0.36, 0.44, -0.075], [-0.28, 0.52, 0.075]),
    k.turned('axle', 'frame', 'z', k.disc(0.025, -0.095, 0.095), [s.rearAxle, s.rearHub, 0]),
  ] + bothSides([
    tube('arm', 'frame', [s.rearAxle - 0.03, s.rearHub], [-0.3, 0.48], 0.06, [0.065, 0.095]),
  ]), { frame: 'alu-bare' }),
  k.compound('dirt_bike_shock', 3, [
    tube('rod', 'chrome', [-0.44, 0.45], [-0.32, 0.82], 0.045, [-0.03, 0.03]),
    tube('spring', 'spring', [-0.41, 0.54], [-0.34, 0.76], 0.09, [-0.04, 0.04]),
    box('link', 'chrome', [-0.5, 0.42, -0.07], [-0.38, 0.47, 0.07]),
  ], { chrome: 'steel-bright', spring: 'plastic-yellow' }),
  wheel('dirt_bike_front_wheel', 8, s.frontHub),
  wheel('dirt_bike_rear_wheel', 10, s.rearHub),
  k.compound('dirt_bike_exhaust', 4, [
    box('header', 'chrome', [0.0, 0.64, 0.05], [0.28, 0.71, 0.11]),
    box('header_bend', 'chrome', [0.2, 0.42, 0.05], [0.28, 0.71, 0.11]),
    box('crossover', 'chrome', [0.2, 0.42, 0.11], [0.28, 0.49, 0.23]),
    tube('run', 'chrome', [0.24, 0.44], [-0.3, 0.66], 0.07, [0.17, 0.23]),
    tube('silencer', 'can', [-0.28, 0.65], [-0.82, 0.8], 0.11, [0.16, 0.24]),
  ], { chrome: 'steel-grey', can: 'alu-bare' }),
  k.compound('dirt_bike_race_stand', 3, [
    box('top', 'frame', [-0.26, 0.28, -0.1], [0.14, 0.3, 0.1]),
  ] + bothSides([
    box('foot', 'frame', [-0.3, 0, 0.09], [0.18, 0.03, 0.14]),
    box('rear_post', 'frame', [-0.25, 0.03, 0.09], [-0.2, 0.3, 0.125]),
    box('front_post', 'frame', [0.08, 0.03, 0.09], [0.13, 0.3, 0.125]),
  ]), { frame: 'paint-charcoal' }),
  k.compound('dirt_bike_front_mudguard', 1, [
    prism('blade_rear', 'paint', [[0.42, 0.77], [0.73, 0.82], [0.73, 0.86], [0.42, 0.81]], [-0.065, 0.065]),
    prism('blade_front', 'paint', [[0.73, 0.82], [1.14, 0.76], [1.14, 0.8], [0.73, 0.86]], [-0.065, 0.065]),
    box('bracket', 'dark', [forkX(0.81) - 0.04, 0.78, -0.11], [forkX(0.81) + 0.04, 0.84, 0.11]),
  ], { paint: s.paint, dark: 'plastic-black' }),
  k.compound('dirt_bike_rear_mudguard', 1.5, [
    // Under the saddle it stays between the side panels and below the seat base, so no two tops nearly coincide.
    prism('under_seat', 'paint', [[-0.84, 0.85], [-0.38, 0.82], [-0.38, 0.85], [-0.84, 0.88]], [-0.09, 0.09]),
    prism('tail', 'paint', [[-1.12, 0.93], [-0.84, 0.85], [-0.84, 0.88], [-1.12, 0.97]], [-0.11, 0.11]),
  ], { paint: s.paint }),
  // A racing plate carries a small lamp instead of a road headlamp shell.
  k.compound('dirt_bike_number_plate', 1, [
    prism('plate', 'plate', [[forkX(0.9) + 0.07, 0.9], [forkX(0.9) + 0.11, 0.9], [forkX(1.2) + 0.11, 1.2], [forkX(1.2) + 0.07, 1.2]], [-0.13, 0.13]),
    box('lens', 'lens', [forkX(0.96) + 0.09, 0.96, -0.05], [forkX(0.96) + 0.13, 1.04, 0.05]),
  ], { plate: 'plastic-white', lens: 'plastic-frosted' }),
  k.compound('dirt_bike_handlebar', 2, [
    box('clamp', 'alloy', [forkX(1.14) - 0.03, 1.12, -0.05], [forkX(1.14) + 0.03, 1.18, 0.05]),
    box('bar', 'alloy', [forkX(1.2) - 0.03, 1.18, -0.34], [forkX(1.2) + 0.03, 1.22, 0.34]),
    box('cross_brace', 'alloy', [forkX(1.2) - 0.02, 1.26, -0.12], [forkX(1.2) + 0.02, 1.29, 0.12]),
  ] + bothSides([
    box('brace_post', 'alloy', [forkX(1.2) - 0.02, 1.22, 0.09], [forkX(1.2) + 0.02, 1.26, 0.12]),
    box('grip', 'rubber', [forkX(1.2) - 0.03, 1.18, 0.3], [forkX(1.2) + 0.03, 1.22, 0.42]),
  ]), { alloy: 'alu-bare', rubber: 'rubber-black' }),
  k.compound('dirt_bike_tank', 4, [
    prism('tank', 'paint', [[-0.06, 0.83], [0.28, 0.89], [0.34, 0.97], [0.3, 1.05], [0.1, 1.05], [-0.06, 0.93]], [-0.13, 0.13]),
    box('cap', 'dark', [0.14, 1.05, -0.04], [0.22, 1.08, 0.04]),
  ], { paint: s.paint, dark: 'plastic-black' }),
  // Long and flat, running up onto the tank so a rider slides along it standing up.
  k.compound('dirt_bike_seat', 2.5, [
    prism('saddle', 'saddle', [[-0.84, 0.91], [-0.26, 0.87], [-0.26, 0.97], [-0.84, 0.98]], [-0.09, 0.09]),
    prism('saddle_nose', 'saddle', [[-0.26, 0.87], [0.16, 1.01], [0.16, 1.08], [-0.26, 0.97]], [-0.09, 0.09]),
  ], { saddle: 'vinyl-black' }),
  k.compound('dirt_bike_side_panel', 0.5, [
    prism('panel', 'paint', [[-0.62, 0.81], [-0.42, 0.72], [-0.12, 0.72], [-0.1, 0.83], [-0.62, 0.86]], [0.09, 0.12]),
    box('number', 'plate', [-0.42, 0.75, 0.12], [-0.2, 0.84, 0.13]),
  ], { paint: s.paint, plate: 'plastic-white' }),
]
