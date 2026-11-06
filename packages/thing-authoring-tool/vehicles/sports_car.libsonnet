local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local s = import 'sports_car.spec.libsonnet';
(import 'car-body.libsonnet')('sports_car', s) + [
  m.wheel('sports_car_wheel', 24, 0.245, 0.23, s.hubHeight),
  k.compound('sports_car_bucket_seat', 12, [
    box('base', 'frame', [-0.22, 0, -0.22], [0.22, 0.05, 0.22]),
    box('cushion', 'cloth', [-0.24, 0.05, -0.25], [0.26, 0.16, 0.25]),
    prism('back', 'cloth', [[-0.3, 0.12], [-0.18, 0.12], [-0.34, 0.72], [-0.46, 0.72]], [-0.25, 0.25]),
  ], { frame: 'steel-grey', cloth: 'leather-black' }, { hips: ['cushion', [0.4, 1, 0.5]] }),
  k.compound('sports_car_wishbone', 12, [
    box('lower_arm', 'steel', [-0.14, -0.1, -0.27], [0.14, -0.05, -0.04]),
    box('upper_arm', 'steel', [-0.1, 0.1, -0.24], [0.1, 0.13, -0.04]),
    box('knuckle', 'steel', [-0.05, -0.06, -0.05], [0.05, 0.13, 0]),
    box('damper', 'spring', [-0.03, 0, -0.22], [0.03, 0.2, -0.16]),
  ], { steel: 'steel-grey', spring: 'paint-charcoal' }, { hub: ['knuckle', [0.5, 0.32, 1]] }),
  k.compound('sports_car_front_skirt', 3, bothSides([
    box('skirt', 'paint', [s.frontAxle + s.arch, s.bumperLow, s.skin], [s.front - 0.125, 0.35, s.side]),
  ]), { paint: s.paint }),
  k.compound('sports_car_firewall', 18, [
    box('wall', 'trim', [s.rearFloorFront + 0.04, s.floor, -s.glassIn], [s.rearFloorFront + 0.08, s.waist, s.glassIn]),
  ], { trim: 'plastic-black' }),
  k.compound('sports_car_side_intake', 3, bothSides([
    prism('mouth', 'trim', [[-0.95, 0.42], [-0.45, 0.42], [-0.45, 0.68], [-0.72, 0.68]], [s.side - 0.02, s.side + 0.03]),
  ]), { trim: 'plastic-black' }),
  k.compound('sports_car_spoiler', 6, [
    box('blade', 'trim', [s.rear + 0.02, s.deck + 0.14, -0.78], [s.rear + 0.26, s.deck + 0.18, 0.78]),
  ] + bothSides([
    box('upright', 'trim', [s.rear + 0.1, s.deck, 0.5], [s.rear + 0.2, s.deck + 0.14, 0.56]),
    box('end_plate', 'trim', [s.rear + 0.02, s.deck + 0.06, 0.78], [s.rear + 0.26, s.deck + 0.22, 0.8]),
  ]), { trim: 'plastic-black' }),
]
