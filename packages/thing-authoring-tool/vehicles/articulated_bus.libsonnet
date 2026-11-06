local k = import 'kit.libsonnet';
local bus = import 'bus-body.libsonnet';
local s = import 'articulated_bus.spec.libsonnet';
local box = k.box;
local endsWith(id, suffixes) = std.length([1 for suffix in suffixes if std.endsWith(id, suffix)]) > 0;
local x = s.bellowsX;
local ribs = std.floor((x[1] - x[0]) / 0.1);
local top = s.fore.roof;
local rib(i) =
  local x0 = x[0] + i * 0.1;
  local x1 = x0 + 0.1;
  local proud = i % 2 == 0;
  local half = if proud then s.fore.side - 0.03 else s.fore.side - 0.11;
  local head = if proud then top - 0.04 else top - 0.12;
  local slot = if proud then 'fold' else 'gusset';
  // A proud fold reaches back to its neighbours' depth, so no light passes through the concertina.
  local wall = if proud then 0.13 else 0.05;
  [
    box('near_' + i, slot, [x0, s.fore.sill, half - wall], [x1, head, half]),
    box('far_' + i, slot, [x0, s.fore.sill, -half], [x1, head, -half + wall]),
    box('top_' + i, slot, [x0, head - wall, -half], [x1, head, half]),
  ];
[
  r
  for r in bus.rows('articulated_bus', s.fore)
  if r.id != 'articulated_bus_rear_bumper'
] + [
  r
  for r in bus.rows('articulated_bus_aft', s.aft)
  if endsWith(r.id, ['_shell', '_rear_bumper', '_rear_panel', '_rear_window'])
] + [
  k.compound('articulated_bus_bellows', 160, std.flattenArrays([rib(i) for i in std.range(0, ribs - 1)]), {
    fold: 'rubber-black',
    gusset: 'plastic-charcoal',
  }),
  // Paints over the windscreen pillar the rear section's shell keeps at this end, so both ends of the joint match.
  k.compound('articulated_bus_aft_end_panel', 30, k.bothSides([
    box('panel', 'paint', [s.aft.front - 0.25, s.aft.decks[0].waist, s.aft.skin - 0.01], [s.aft.front, s.aft.decks[0].top, s.aft.side + 0.03]),
  ]), { paint: s.aft.paint }),
  k.compound('articulated_bus_joint', 420, [
    box('turntable', 'plate', [x[0] - 0.02, s.fore.sill, -s.fore.skin], [x[1] + 0.02, s.fore.floor, s.fore.skin]),
  ], { plate: 'plastic-charcoal' }),
]
