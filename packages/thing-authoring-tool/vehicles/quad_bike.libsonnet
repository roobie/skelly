local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'quad_bike.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local bar = m.bar;
local tube = 0.05;
local fender(axle) = [
  box('fender_top', 'paint', [axle - 0.25, 0.62, 0.2], [axle + 0.25, 0.72, 0.56]),
  prism('skirt_fore', 'paint', [[axle + 0.29, 0.46], [axle + 0.35, 0.48], [axle + 0.25, 0.66], [axle + 0.2, 0.66]], [0.27, 0.56]),
  prism('skirt_aft', 'paint', [[axle - 0.35, 0.48], [axle - 0.29, 0.46], [axle - 0.2, 0.66], [axle - 0.25, 0.66]], [0.27, 0.56]),
];
local rack(id, x0, x1, y) = k.compound(id, 5, [
  box('front_rail', 'steel', [x1 - 0.04, y, -0.34], [x1, y + 0.04, 0.34]),
  box('rear_rail', 'steel', [x0, y, -0.34], [x0 + 0.04, y + 0.04, 0.34]),
  box('slat_a', 'steel', [x0, y, -0.12], [x1, y + 0.03, -0.08]),
  box('slat_b', 'steel', [x0, y, 0.08], [x1, y + 0.03, 0.12]),
] + bothSides([
  box('side_rail', 'steel', [x0, y, 0.3], [x1, y + 0.04, 0.34]),
]), { steel: 'steel-spall-black' });
[
  k.compound('quad_bike_frame', s.shellMass, [
    box('skid_plate', 'steel', [-0.42, 0.2, -0.15], [0.5, 0.24, 0.15]),
    box('cross_front', 'steel', [0.5, 0.26, -0.15], [0.56, 0.68, 0.15]),
    box('cross_mid', 'steel', [-0.32, 0.24, -0.15], [-0.26, 0.74, 0.15]),
    box('rear_cross', 'steel', [-0.82, 0.74, -0.2], [-0.76, 0.78, 0.2]),
  ] + bothSides([
    bar('lower_rail', 'steel', [-0.42, 0.26], [0.56, 0.26], tube, [0.1, 0.15]),
    bar('front_rise', 'steel', [0.54, 0.26], [0.44, 0.84], tube, [0.1, 0.15]),
    bar('top_rail', 'steel', [0.46, 0.84], [-0.3, 0.745], tube, [0.1, 0.15]),
    bar('seat_rail', 'steel', [-0.3, 0.745], [-0.8, 0.77], tube, [0.1, 0.15]),
    bar('seat_stay', 'steel', [-0.42, 0.26], [-0.7, 0.76], tube, [0.1, 0.15]),
    bar('rack_prop', 'steel', [0.48, 0.66], [0.6, 0.82], 0.04, [0.1, 0.14]),
    bar('footrest_arm', 'steel', [0.1, 0.25], [0.1, 0.295], 0.04, [0.15, 0.24]),
  ]), { steel: 'steel-spall-black' }),
  k.compound('quad_bike_front_arm', 9, [
    box('upper', 'steel', [s.frontAxle - 0.04, 0.32, 0.12], [s.frontAxle + 0.04, 0.36, s.wheelZ - 0.08]),
    box('lower', 'steel', [s.frontAxle - 0.05, 0.22, 0.12], [s.frontAxle + 0.05, 0.26, s.wheelZ - 0.08]),
    box('inner', 'steel', [0.54, 0.22, 0.1], [s.frontAxle + 0.05, 0.36, 0.14]),
    box('knuckle', 'steel', [s.frontAxle - 0.04, 0.22, s.wheelZ - 0.1], [s.frontAxle + 0.04, 0.38, s.wheelZ - 0.05]),
    bar('shock', 'spring', [s.frontAxle, 0.34], [0.46, 0.74], 0.05, [0.2, 0.25]),
    box('shock_mount', 'steel', [0.42, 0.7, 0.14], [0.5, 0.74, 0.25]),
  ], { steel: 'steel-spall-black', spring: 'paint-red' }),
  k.compound('quad_bike_swing_arm', 24, [
    box('axle', 'steel', [s.rearAxle - 0.03, s.hub - 0.03, -s.wheelZ + 0.05], [s.rearAxle + 0.03, s.hub + 0.03, s.wheelZ - 0.05]),
    box('diff', 'cast', [s.rearAxle - 0.11, s.hub - 0.1, -0.11], [s.rearAxle + 0.11, s.hub + 0.1, 0.11]),
    box('shock_mount', 'steel', [-0.5, 0.56, -0.06], [-0.44, 0.76, 0.06]),
  ] + bothSides([
    bar('arm', 'steel', [-0.34, 0.27], [s.rearAxle, s.hub], 0.07, [0.08, 0.14]),
  ]) + [
    bar('shock', 'spring', [s.rearAxle + 0.05, s.hub + 0.08], [-0.47, 0.6], 0.06, [-0.03, 0.03]),
  ], { steel: 'steel-spall-black', cast: 'iron-cast', spring: 'paint-red' }),
  k.compound('quad_bike_front_fenders', 7, [
    box('nose', 'paint', [0.46, 0.68, -0.26], [0.92, 0.82, 0.26]),
    prism('beak', 'paint', [[0.8, 0.5], [1.0, 0.56], [1.0, 0.68], [0.92, 0.82], [0.8, 0.82]], [-0.2, 0.2]),
  ] + bothSides(fender(s.frontAxle)), { paint: s.paint }),
  k.compound('quad_bike_rear_fenders', 8, [
    box('deck', 'paint', [-0.84, 0.7, -0.26], [-0.32, 0.8, 0.26]),
    box('tail', 'dark', [-0.98, 0.56, -0.2], [-0.82, 0.8, 0.2]),
  ] + bothSides(fender(s.rearAxle)), { paint: s.paint, dark: 'plastic-black' }),
  rack('quad_bike_front_rack', 0.5, 0.95, 0.82),
  rack('quad_bike_rear_rack', -1.02, -0.74, 0.8),
  k.compound('quad_bike_seat', 6, [
    box('pad', 'cloth', [-0.68, 0.8, -0.1875], [-0.02, s.seatTop, 0.1875]),
    box('base', 'dark', [-0.7, 0.76, -0.09375], [0, 0.82, 0.09375]),
    prism('hump', 'cloth', [[-0.72, 0.82], [-0.58, 0.82], [-0.6, 0.98], [-0.72, 0.98]], [-0.1875, 0.1875]),
  ], { cloth: 'cloth-seat', dark: 'plastic-black' }),
  k.compound('quad_bike_tank', 4, [
    prism('tank', 'paint', [[-0.05, 0.76], [0.44, 0.84], [0.44, 0.94], [0.3, 1.02], [-0.05, 0.98]], [-0.13, 0.13]),
    k.turned('cap', 'dark', 'y', k.disc(0.05, 1.0, 1.04), [0.16, 0, 0]) + { sides: 12 },
    box('column_boot', 'boot', [0.28, 0.96, -0.05], [0.4, 1.06, 0.05]),
  ], { paint: s.paint, dark: 'steel-spall-black', boot: 'plastic-black' }),
  k.compound('quad_bike_engine', 40, [
    box('crankcase', 'cast', [-0.2, 0.29, -0.16], [0.2, 0.52, 0.16]),
    box('cylinder', 'alu', [-0.08, 0.52, -0.09], [0.12, 0.7, 0.09]),
    box('fin_a', 'cast', [-0.12, 0.56, -0.12], [0.16, 0.58, 0.12]),
    box('fin_b', 'cast', [-0.12, 0.62, -0.12], [0.16, 0.64, 0.12]),
    box('head', 'cast', [-0.09, 0.7, -0.1], [0.13, 0.76, 0.1]),
  ], { cast: 'iron-cast', alu: 'alu-bare' }),
  k.compound('quad_bike_exhaust', 4, [
    bar('downpipe', 'steel', [0.1, 0.62], [-0.4, 0.46], 0.05, [0.18, 0.23]),
    bar('midpipe', 'steel', [-0.38, 0.46], [-0.66, 0.5], 0.05, [0.18, 0.23]),
    bar('silencer', 'steel', [-0.62, 0.49], [-0.96, 0.51], 0.09, [0.17, 0.26]),
  ], { steel: 'steel-spall-black' }),
  k.compound('quad_bike_handlebar', 3, [
    bar('column', 'steel', [0.42, 0.84], [0.26, 1.2], 0.04, [-0.02, 0.02]),
    box('bar', 'steel', [0.22, 1.18, -0.36], [0.28, 1.22, 0.36]),
    box('grip_near', 'grip', [0.21, 1.17, 0.26], [0.29, 1.23, 0.38]),
    box('grip_far', 'grip', [0.21, 1.17, -0.38], [0.29, 1.23, -0.26]),
    box('pod', 'pod', [0.2, 1.21, -0.08], [0.3, 1.26, 0.08]),
  ], { steel: 'steel-spall-black', grip: 'rubber-black', pod: 'plastic-black' }, {}),
  m.wheel('quad_bike_wheel', 11, s.wheelWidth, 0.125, s.hub, 12, 0.025, 'steel-grey'),
  k.compound('quad_bike_headlamp', 0.4, [
    k.turned('shell', 'shell', 'x', k.disc(0.056, 0, 0.03)) + { sides: 12 },
    k.turned('lens', 'lens', 'x', k.disc(0.045, 0.03, 0.05)) + { sides: 12 },
  ], { shell: 'plastic-black', lens: 'plastic-frosted' }),
  m.step('quad_bike_footboard', 3, [-0.3, 0.34], s.footY + 0.03, [0.15, 0.3], 'steel-grey'),
]
