local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local bar = m.bar;
local s = import 'beach_buggy.spec.libsonnet';
local tubeZ = [0.42, 0.47];
[
  m.wheel('beach_buggy_front_wheel', 9, s.frontWidth, 0.15, s.frontHub),
  m.wheel('beach_buggy_rear_wheel', 24, s.rearWidth, 0.2, s.rearHub, 14, 0.025, 'paint-charcoal'),
  k.compound('beach_buggy_frame', s.shellMass * 0.6, [
    box('rear_cross', 'tube', [s.rear, 0.3, -0.47], [s.rear + 0.05, 0.36, 0.47]),
    box('rear_bar', 'tube', [s.rear, 0.58, -0.47], [s.rear + 0.05, 0.63, 0.47]),
    box('front_cross', 'tube', [0.76, 0.24, -0.47], [0.82, 0.3, 0.47]),
    box('engine_cross', 'tube', [-0.82, 0.3, -0.47], [-0.76, 0.36, 0.47]),
  ] + bothSides([
    box('lower_rail', 'tube', [s.rear, 0.3, tubeZ[0]], [0.82, 0.36, tubeZ[1]]),
    bar('upper_rail', 'tube', [-0.56, s.tubTop], [s.rear + 0.03, 0.6], 0.05, tubeZ),
    box('tail_post', 'tube', [s.rear, 0.36, tubeZ[0]], [s.rear + 0.05, 0.6, tubeZ[1]]),
    bar('rear_stay', 'tube', [-0.8, 0.36], [-1.1, 0.6], 0.05, tubeZ),
  ]), { tube: 'steel-spall-black' }),
  k.compound('beach_buggy_tub', s.shellMass * 0.4, [
    box('floor_pan', 'paint', [-0.58, 0.22, -s.tub], [0.82, s.floor, s.tub]),
    box('seat_wall', 'paint', [-0.58, s.floor, -s.tub], [-0.54, s.tubTop, s.tub]),
    prism('nose', 'paint', [[0.78, 0.26], [1.42, 0.36], [1.62, 0.46], [1.62, 0.58], [1.2, 0.72], [0.78, 0.84]], [-0.5, 0.5]),
  ] + bothSides([
    box('side_rear', 'paint', [-0.58, 0.22, s.tub - 0.04], [-0.3, s.tubTop, s.tub]),
    box('side_dip', 'paint', [-0.3, 0.22, s.tub - 0.04], [0.3, s.tubTop - 0.1, s.tub]),
    prism('side_front', 'paint', [[0.3, 0.22], [0.82, 0.22], [0.82, 0.8], [0.5, 0.68], [0.3, s.tubTop - 0.1]], [s.tub - 0.04, s.tub]),
  ] + m.arc('fender', 'paint', s.frontAxle, s.frontHub, 0.31, 0.35, 6, 174, 9, [0.46, 0.78])
  ), { paint: s.paint }),
  k.compound('beach_buggy_roll_bar', 28, [
    box('top_bar', 'tube', [s.hoopX - 0.09, s.hoopTop - 0.06, -s.hoopZ - 0.03], [s.hoopX - 0.03, s.hoopTop, s.hoopZ + 0.03]),
    box('harness_bar', 'tube', [s.hoopX - 0.06, 0.92, -s.hoopZ], [s.hoopX, 0.97, s.hoopZ]),
  ] + bothSides([
    bar('hoop', 'tube', [s.hoopX, 0.58], [s.hoopX - 0.06, s.hoopTop - 0.03], 0.06, [s.hoopZ - 0.03, s.hoopZ + 0.03]),
    bar('brace', 'tube', [s.hoopX - 0.06, s.hoopTop - 0.05], [s.rear + 0.05, 0.6], 0.05, tubeZ),
  ]), { tube: 'paint-charcoal' }),
  k.compound('beach_buggy_windscreen', 7, [
    bar('glass', 'glass', [0.66, 0.8], [0.5, 1.12], 0.03, [-0.42, 0.42]),
    box('header', 'frame', [0.46, 1.12, -0.46], [0.54, 1.15, 0.46]),
  ] + bothSides([
    bar('post', 'frame', [0.66, 0.74], [0.5, 1.14], 0.04, [0.42, 0.46]),
  ]), { glass: 'glass-clear', frame: 'steel-grey' }),
  k.compound('beach_buggy_dashboard', 6, [
    box('panel', 'trim', [0.54, 0.6, -0.5], [0.8, 0.78, 0.5]),
    box('column', 'trim', [0.28, 0.66, -0.3], [0.56, 0.72, -0.22]),
  ], { trim: 'plastic-black' }),
  k.compound('beach_buggy_front_axle', 18, [
    box('beam', 'steel', [s.frontAxle - 0.04, s.frontHub - 0.04, -s.frontWheelZ + 0.05], [s.frontAxle + 0.04, s.frontHub + 0.04, s.frontWheelZ - 0.05]),
  ] + bothSides([
    bar('radius_arm', 'steel', [0.8, 0.27], [s.frontAxle, s.frontHub], 0.05, [0.4, 0.45]),
    bar('shock', 'spring', [s.frontAxle, s.frontHub + 0.04], [s.frontAxle - 0.1, 0.54], 0.05, [0.5, 0.55]),
  ]), { steel: 'steel-grey', spring: 'paint-red' }),
  k.compound('beach_buggy_rear_axle', 34, [
    box('beam', 'steel', [s.rearAxle - 0.04, s.rearHub - 0.04, -s.rearWheelZ + 0.1], [s.rearAxle + 0.04, s.rearHub + 0.04, s.rearWheelZ - 0.1]),
  ] + bothSides([
    bar('swing_arm', 'steel', [-0.76, 0.33], [s.rearAxle, s.rearHub], 0.06, tubeZ),
    bar('shock', 'spring', [s.rearAxle - 0.02, s.rearHub + 0.04], [-1.1, 0.6], 0.05, [0.47, 0.52]),
  ]), { steel: 'steel-grey', spring: 'paint-red' }),
  m.step('beach_buggy_step', 5, [-0.35, 0.32], 0.28, [s.tub, s.tub + 0.14], 'steel-grey'),
  k.compound('beach_buggy_exhaust', 8, [
    box('collector', 'steel', [-1.42, 0.34, -0.22], [-1.36, 0.4, 0.22]),
  ] + bothSides([
    box('tailpipe', 'steel', [s.rear - 0.14, 0.42, 0.18], [-1.36, 0.48, 0.24]),
    box('drop', 'steel', [-1.42, 0.4, 0.18], [-1.36, 0.48, 0.24]),
  ]), { steel: 'steel-stainless' }),
  k.compound('beach_buggy_seat', 10, [
    box('base', 'frame', [-0.22, 0, -0.22], [0.22, 0.05, 0.22]),
    box('cushion', 'cloth', [-0.24, 0.05, -0.25], [0.26, 0.16, 0.25]),
    prism('back', 'cloth', [[-0.3, 0.12], [-0.18, 0.12], [-0.34, 0.72], [-0.46, 0.72]], [-0.25, 0.25]),
  ], { frame: 'steel-grey', cloth: 'leather-black' }, { hips: ['cushion', [0.4, 1, 0.5]] }),
  k.compound('beach_buggy_headlamp', 1.5, [
    k.turned('bowl', 'bright', 'x', k.disc(0.09, 1.26, 1.38), [0, 0.82, 0.3]) + { sides: 12 },
    k.turned('lens', 'lens', 'x', k.disc(0.075, 1.38, 1.41), [0, 0.82, 0.3]) + { sides: 12 },
    box('stalk', 'bright', [1.28, 0.66, 0.28], [1.34, 0.74, 0.32]),
  ], { bright: 'steel-bright', lens: 'plastic-frosted' }),
]
