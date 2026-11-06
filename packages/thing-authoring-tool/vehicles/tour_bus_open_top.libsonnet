local k = import 'kit.libsonnet';
local s = import 'tour_bus_open_top.spec.libsonnet';
local box = k.box;
local cap = s.roofBase;
local topX = s.front - s.lean;
local d = s.deflector;
(import 'bus-body.libsonnet').rows('tour_bus_open_top', s) + [
  k.compound('tour_bus_open_top_deck_rail', 140, [
    box('cap_rear', 'cap', [s.rear, cap, -s.side], [s.rear + 0.08, cap + 0.04, s.side]),
    box('cap_front', 'cap', [topX - 0.08, cap, -s.side], [topX, cap + 0.04, s.side]),
    box('rail_rear', 'rail', [s.rear + 0.02, s.rail.top - 0.05, -s.side + 0.02], [s.rear + 0.07, s.rail.top, s.side - 0.02]),
  ] + k.bothSides([
    box('cap_side', 'cap', [s.rear, cap, s.skin], [topX, cap + 0.04, s.side]),
    box('rail_side', 'rail', [s.rear + 0.02, s.rail.top - 0.05, s.side - 0.07], [d.x, s.rail.top, s.side - 0.02]),
  ] + [
    box('post_' + i, 'rail', [s.rear + 0.02 + i * s.rail.post, cap + 0.04, s.side - 0.07], [s.rear + 0.07 + i * s.rail.post, s.rail.top, s.side - 0.02])
    for i in std.range(0, s.rail.posts - 1)
  ]) + k.bothSides([
    box('post_front', 'rail', [d.x - 0.05, cap + 0.04, s.side - 0.07], [d.x, s.rail.top, s.side - 0.02]),
  ]), { cap: 'paint-cream', rail: 'paint-crane-yellow' }),
  k.compound('tour_bus_open_top_deflector', 28, [
    k.prism('glass', 'glass', [[d.x + d.rake, cap + 0.04], [d.x + d.rake + 0.04, cap + 0.04], [d.x + 0.04, d.top], [d.x, d.top]], [-(s.side - 0.1), s.side - 0.1]),
  ], { glass: 'glass-clear' }),
]
