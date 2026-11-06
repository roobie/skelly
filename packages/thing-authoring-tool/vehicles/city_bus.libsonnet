local k = import 'kit.libsonnet';
local rows = (import 'bus-body.libsonnet').rows('city_bus', import 'city_bus.spec.libsonnet');
rows + [
  // Hung from the ceiling at the height of the grab poles' heads, so rail and poles join.
  k.compound('city_bus_ceiling_rail', 7, [
    k.turned('rail', 'bright', 'x', k.disc(0.022, -3, 3)),
  ] + [
    k.box('hanger_' + i, 'bright', [-2.7 + 1.8 * i - 0.015, 0, -0.015], [-2.7 + 1.8 * i + 0.015, 0.17, 0.015])
    for i in std.range(0, 3)
  ], { bright: 'paint-crane-yellow' }),
  k.compound('city_bus_roof_unit', 180, [
    k.box('casing', 'casing', [-1.1, 0, -0.85], [1.1, 0.24, 0.85]),
    k.box('grille', 'trim', [-0.8, 0.24, -0.55], [0.8, 0.26, 0.55]),
  ], { casing: 'paint-white', trim: 'plastic-grey' }),
]
