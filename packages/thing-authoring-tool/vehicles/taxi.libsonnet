local k = import 'kit.libsonnet';
local box = k.box;
local s = import 'taxi.spec.libsonnet';
local signX = -0.35;
local square = 0.125;
local checks(id, from, to) = [
  local x = from + i * square;
  local row = i % 2;
  box(id + '_' + i, 'band', [x, s.waist - 0.40625 + row * square, s.side - 0.02], [x + square, s.waist - 0.40625 + (row + 1) * square, s.side + 0.03])
  for i in std.range(0, std.floor((to - from) / square) - 1)
];
(import 'car-body.libsonnet')('taxi', s) + [
  k.compound('taxi_roof_sign', 3, [
    box('base', 'dark', [signX - 0.2, s.roof + 0.04, -0.3], [signX + 0.2, s.roof + 0.07, 0.3]),
    k.prism('lamp', 'lamp', [[signX - 0.15, s.roof + 0.07], [signX + 0.15, s.roof + 0.07], [signX + 0.1, s.roof + 0.22], [signX - 0.1, s.roof + 0.22]], [-0.27, 0.27]),
  ], { dark: 'plastic-black', lamp: 'plastic-white' }),
  k.compound('taxi_side_band', 1, k.bothSides(checks('front', s.bFront + 0.03, s.cowl - 0.03) + checks('rear', s.rearDoorArch + 0.03, s.bRear - 0.03)), { band: 'paint-charcoal' }),
]
