local k = import 'kit.libsonnet';
local s = import 'shuttle_bus.spec.libsonnet';
local box = k.box;
local r = s.rack;
local pitch = (r.y[1] - r.y[0] - 0.04) / r.shelves;
local shelf(i) = r.y[0] + 0.02 + i * pitch;
(import 'bus-body.libsonnet').rows('shuttle_bus', s) + [
  // Bright tiers show through the side windows between the doors, so the bus reads as carrying bags.
  k.compound('shuttle_bus_luggage_rack', 60, [
    box('shelf_' + i, 'frame', [-r.half, shelf(i) - 0.02, r.z[0]], [r.half, shelf(i) + 0.02, r.z[1]])
    for i in std.range(0, r.shelves)
  ] + [
    box('post_' + i, 'frame', [i * r.half - 0.025, r.y[0], r.z[0]], [i * r.half + 0.025, r.y[1], r.z[0] + 0.05])
    for i in [-1, 1]
  ] + [
    box('case_' + i, 'case', [-0.3 + 0.32 * (i % 2), shelf(i) + 0.02, r.z[0] + 0.06], [-0.3 + 0.32 * (i % 2) + 0.28, shelf(i) + pitch - 0.06, r.z[1] - 0.02])
    for i in std.range(0, r.shelves - 1)
  ], { frame: 'steel-stainless', case: 'plastic-orange' }),
  k.compound('shuttle_bus_roof_unit', 110, [
    box('pod', 'pod', [-1.2, s.roof, -0.7], [0.4, s.roof + 0.16, 0.7]),
    box('grille', 'grille', [-1.0, s.roof + 0.16, -0.5], [0.2, s.roof + 0.18, 0.5]),
  ], { pod: 'paint-white', grille: 'plastic-charcoal' }),
]
