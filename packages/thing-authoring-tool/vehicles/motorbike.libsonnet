local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'motorbike.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local rad(degrees) = degrees * std.pi / 180;
local tube = (import 'machine-kit.libsonnet').bar;
// The steering axis leans back 27 degrees and passes through the front axle.
local forkX(y) = s.frontAxle - (y - s.hub) * 0.51;
local spokes = [
  local a = rad(i * 60);
  local c = std.cos(a);
  local n = std.sin(a);
  tube('spoke_' + i, 'spoke', [0.06 * c, 0.06 * n], [0.21 * c, 0.21 * n], 0.05, [-0.032, 0.032])
  for i in std.range(0, 5)
];
local fin(y, half) = prism('fin_' + y, if half > 0.08 then 'alloy' else 'dark', [
  [-0.095 + (y - 0.44) * 0.3, y], [0.065 + (y - 0.44) * 0.3, y], [0.065 + (y + 0.032 - 0.44) * 0.3, y + 0.032], [-0.095 + (y + 0.032 - 0.44) * 0.3, y + 0.032],
], [-half, half]);
[
  k.compound('motorbike_frame', 24, [
    tube('head', 'frame', [forkX(0.74), 0.74], [forkX(0.96), 0.96], 0.075, [-0.032, 0.032]),
    tube('spine', 'frame', [-0.22, 0.61], [0.3125, 0.86], 0.075, [-0.032, 0.032]),
    tube('down', 'frame', [0.2125, 0.31], [0.297, 0.84], 0.075, [-0.032, 0.032]),
    tube('seat_post', 'frame', [-0.3, 0.41], [-0.2, 0.64], 0.075, [-0.032, 0.032]),
    box('cradle', 'frame', [-0.34, 0.41, -0.125], [-0.25, 0.47, 0.125]),
    box('rear_cross', 'frame', [-0.84, 0.625, -0.094], [-0.78, 0.69, 0.094]),
    box('seat_cross', 'frame', [-0.25, 0.625, -0.094], [-0.19, 0.69, 0.094]),
  ] + bothSides([
    box('pivot_plate', 'frame', [-0.375, 0.25, 0.09], [-0.25, 0.44, 0.125]),
    box('sub_rail', 'frame', [-0.84, 0.625, 0.0625], [-0.19, 0.69, 0.094]),
  ]), { frame: 'paint-charcoal' }),
  k.compound('motorbike_fork', 7, [
    box('top_yoke', 'alloy', [0.22, 0.94, -0.094], [0.34, 0.97, 0.094]),
    box('lower_yoke', 'alloy', [0.31, 0.75, -0.094], [0.375, 0.78, 0.094]),
    k.turned('axle', 'alloy', 'z', k.disc(0.025, -0.094, 0.094), [s.frontAxle, s.hub, 0]),
  ] + bothSides([
    tube('stanchion', 'chrome', [forkX(0.3), 0.3], [forkX(0.97), 0.97], 0.05, [0.0625, 0.094]),
    tube('slider', 'alloy', [forkX(0.26), 0.26], [forkX(0.55), 0.55], 0.075, [0.0625, 0.094]),
  ]), { alloy: 'alu-bare', chrome: 'steel-bright' }),
  k.compound('motorbike_swingarm', 4, [
    box('pivot_tube', 'frame', [-0.31, 0.31, -0.0625], [-0.25, 0.375, 0.0625]),
    k.turned('axle', 'frame', 'z', k.disc(0.025, -0.094, 0.094), [s.rearAxle, s.hub, 0]),
    box('chain_guard', 'guard', [-0.56, 0.27, -0.125], [-0.31, 0.375, -0.094]),
  ] + bothSides([
    tube('arm', 'frame', [s.rearAxle - 0.03, s.hub], [-0.266, 0.344], 0.05, [0.0625, 0.094]),
  ]), { frame: 'paint-charcoal', guard: 'plastic-black' }),
  k.compound('motorbike_shock', 1.5, [
    tube('rod', 'chrome', [-0.553, 0.31], [-0.647, 0.656], 0.05, [0.094, 0.156]),
    tube('spring', 'spring', [-0.575, 0.406], [-0.628, 0.594], 0.08, [0.094, 0.156]),
  ], { chrome: 'steel-bright', spring: 'paint-charcoal' }),
  k.compound('motorbike_wheel', 9, [
    k.turned('tyre', 'tyre', 'z', [[-0.04, 0.235], [-0.04, 0.28], [-0.03, s.tyre], [0.03, s.tyre], [0.04, 0.28], [0.04, 0.235], [-0.04, 0.235]]) + { sides: 24 },
    k.turned('rim', 'rim', 'z', k.annulus(0.205, 0.235, -0.032, 0.032)) + { sides: 24 },
    // Eight fine spokes clump at the vehicle grain, so a dark web carries the few that survive it.
    k.turned('web', 'web', 'z', k.disc(0.21, -0.016, 0.016)) + { sides: 24 },
    k.turned('hub', 'hub', 'z', k.disc(0.07, -0.0625, 0.0625)) + { sides: 12 },
  ] + spokes, { tyre: 'rubber-black', rim: 'steel-bright', web: 'plastic-black', spoke: 'steel-stainless', hub: 'alu-bare' }, { hub: ['hub', [0.5, 0.5, 0.5]] }),
  k.compound('motorbike_engine', 30, [
    box('crankcase', 'casing', [-0.25, 0.1875, -0.125], [0.125, 0.47, 0.125]),
    k.turned('flywheel_cover', 'alloy', 'z', k.disc(0.11, -0.156, -0.125), [-0.14, 0.33, 0]) + { sides: 12 },
    box('clutch_cover', 'alloy', [-0.19, 0.22, 0.125], [0.0625, 0.44, 0.156]),
    box('sump', 'casing', [0.125, 0.28, -0.03], [0.19, 0.375, 0.03]),
    fin(0.44, 0.094),
    fin(0.472, 0.07),
    fin(0.504, 0.094),
    fin(0.536, 0.07),
    fin(0.568, 0.094),
    prism('head', 'casing', [[-0.04, 0.6], [0.11, 0.6], [0.12, 0.64], [-0.03, 0.64]], [-0.06, 0.06]),
  ], { casing: 'steel-grey', alloy: 'alu-bare', dark: 'paint-charcoal' }),
  k.compound('motorbike_exhaust', 5, [
    box('header', 'chrome', [0.156, 0.19, 0.03], [0.22, 0.56, 0.094]),
    box('bend', 'chrome', [0.125, 0.19, 0.094], [0.22, 0.25, 0.22]),
    box('run', 'chrome', [-0.31, 0.19, 0.156], [0.125, 0.28, 0.22]),
    k.turned('silencer', 'chrome', 'x', k.disc(0.06, -0.84, -0.31), [0, 0.26, 0.22]) + { sides: 12 },
    k.turned('tip', 'dark', 'x', k.disc(0.03, -0.875, -0.84), [0, 0.26, 0.22]),
    box('bracket', 'frame', [-0.77, 0.3, 0.094], [-0.74, 0.6875, 0.125]),
    box('bracket_foot', 'frame', [-0.77, 0.28, 0.094], [-0.74, 0.31, 0.19]),
  ], { chrome: 'steel-bright', dark: 'plastic-black', frame: 'paint-charcoal' }),
  k.compound('motorbike_footrest', 0.5, [
    box('bar', 'frame', [-0.094, 0.26, 0.125], [0, 0.31, 0.2]),
    box('rubber', 'rubber', [-0.094, 0.26, 0.2], [0, 0.31, 0.31]),
  ], { frame: 'paint-charcoal', rubber: 'rubber-black' }),
  k.compound('motorbike_centre_stand', 2.5, [
    box('cross', 'frame', [-0.34, 0.03, -0.094], [-0.28, 0.0625, 0.094]),
  ] + bothSides([
    box('leg', 'frame', [-0.34, 0.03, 0.09], [-0.28, 0.27, 0.125]),
    box('foot', 'frame', [-0.41, 0, 0.0625], [-0.25, 0.03, 0.156]),
  ]), { frame: 'paint-charcoal' }),
  k.compound('motorbike_front_mudguard', 1, h.arcBand('guard', 'chrome', s.frontAxle, s.hub, 0.315, 0.35, 35, 165, 8, [-0.0625, 0.0625]), { chrome: 'steel-bright' }),
  k.compound('motorbike_rear_mudguard', 1.5, h.arcBand('guard', 'chrome', s.rearAxle, s.hub, 0.315, 0.35, 35, 165, 8, [-0.0625, 0.0625]), { chrome: 'steel-bright' }),
  k.compound('motorbike_headlamp', 1.5, [
    k.turned('shell', 'chrome', 'x', k.disc(0.094, 0.33, 0.47), [0, 0.86, 0]) + { sides: 16 },
    k.turned('lens', 'lens', 'x', k.disc(0.08, 0.47, 0.5), [0, 0.86, 0]) + { sides: 16 },
    box('speedo', 'dash', [0.344, 0.94, -0.0625], [0.4375, 1.0, 0.0625]),
  ], { chrome: 'steel-bright', lens: 'plastic-frosted', dash: 'plastic-black' }),
  k.compound('motorbike_tail_lamp', 0.3, [
    box('stay', 'stay', [-0.86, 0.625, -0.03], [-0.84, 0.66, 0.03]),
    box('lens', 'lens', [-0.9, 0.595, -0.05], [-0.86, 0.66, 0.05]),
  ], { stay: 'paint-charcoal', lens: 'plastic-red' }),
  k.compound('motorbike_handlebar', 2, [
    box('riser', 'alloy', [0.25, 0.97, -0.0625], [0.31, 1.0, 0.0625]),
    box('bar', 'chrome', [0.25, 1.0, -0.25], [0.31, 1.03, 0.25]),
  ] + bothSides([
    box('grip', 'rubber', [0.19, 1.0, 0.22], [0.25, 1.03, 0.375]),
    box('mirror_stalk', 'chrome', [0.25, 1.03, 0.156], [0.285, 1.09, 0.19]),
    box('mirror', 'chrome', [0.22, 1.06, 0.156], [0.25, 1.125, 0.25]),
  ]), { alloy: 'alu-bare', chrome: 'steel-bright', rubber: 'rubber-black' }),
  k.compound('motorbike_tank', 4, [
    prism('tank', 'paint', [[0, 0.625], [0.1875, 0.67], [0.2625, 0.734], [0.27, 0.844], [0.234, 0.875], [-0.078, 0.8], [-0.156, 0.734], [-0.17, 0.625]], [-0.156, 0.156]),
    box('cap', 'chrome', [0.094, 0.84, -0.03], [0.156, 0.89, 0.03]),
  ] + bothSides([
    box('badge', 'badge', [0, 0.72, 0.156], [0.156, 0.78, 0.17]),
    box('knee_pad', 'rubber', [-0.125, 0.656, 0.156], [-0.03, 0.75, 0.17]),
  ]), { paint: s.paint, chrome: 'steel-bright', badge: 'paint-white', rubber: 'rubber-black' }),
  k.compound('motorbike_seat', 3, [
    prism('saddle', 'saddle', [[-0.797, 0.6875], [-0.1875, 0.6875], [-0.194, 0.76], [-0.25, 0.79], [-0.75, 0.77], [-0.797, 0.734]], [-0.125, 0.125]),
    box('pan', 'pan', [-0.78, 0.66, -0.125], [-0.19, 0.6875, 0.125]),
  ], { saddle: 'vinyl-black', pan: 'plastic-black' }),
  k.compound('motorbike_side_cover', 0.5, [
    box('cover', 'paint', [-0.375, 0.47, 0.094], [-0.1875, 0.656, 0.156]),
    box('badge', 'badge', [-0.34, 0.53, 0.156], [-0.22, 0.59, 0.17]),
  ], { paint: s.paint, badge: 'paint-white' }),
]
