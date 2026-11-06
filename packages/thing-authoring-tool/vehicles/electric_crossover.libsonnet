local k = import 'kit.libsonnet';
local box = k.box;
local s = import 'electric_crossover.spec.libsonnet';
local shape = (import 'car-shape.libsonnet')(s);
local cladding(id, axle) = shape.flare(id, 'trim', axle, s.sill, [s.side - 0.01, s.side + 0.02], 0.05, 0.02);
(import 'car-body.libsonnet')('electric_crossover', s) + [
  k.compound('electric_crossover_cladding', 3, cladding('front_flare', s.frontAxle) + cladding('rear_flare', s.rearAxle) + [
    box('sill', 'trim', [s.rearAxle + s.arch, s.sill, s.side - 0.01], [s.frontAxle - s.arch, s.floor, s.side + 0.02]),
  ], { trim: 'plastic-black' }),
]
