local k = import 'kit.libsonnet';
local box = k.box;
local s = import 'police_car.spec.libsonnet';
local barX = -0.4;
(import 'car-body.libsonnet')('police_car', s) + [
  k.compound('police_car_light_bar', 8, [
    box('bar', 'bar', [barX - 0.13, s.roof + 0.06, -0.62], [barX + 0.13, s.roof + 0.12, 0.62]),
  ] + k.bothSides([
    box('foot', 'bar', [barX - 0.08, s.roof + 0.04, 0.5], [barX + 0.08, s.roof + 0.06, 0.58]),
  ]), { bar: 'plastic-black' }),
  k.compound('police_car_push_bar', 18, [
    box('cross', 'bar', [s.front + 0.05, 0.5, -0.5], [s.front + 0.09, 0.54, 0.5]),
    box('top', 'bar', [s.front + 0.05, 0.7, -0.4], [s.front + 0.09, 0.74, 0.4]),
  ] + k.bothSides([
    box('upright', 'bar', [s.front + 0.05, 0.25, 0.36], [s.front + 0.09, 0.74, 0.4]),
    box('mount', 'bar', [s.front - 0.04, 0.4, 0.36], [s.front + 0.05, 0.44, 0.4]),
  ]), { bar: 'steel-grey' }),
]
