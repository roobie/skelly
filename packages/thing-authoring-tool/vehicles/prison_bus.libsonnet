local k = import 'kit.libsonnet';
local bus = import 'bus-body.libsonnet';
local s = import 'prison_bus.spec.libsonnet';
local box = k.box;
local deck = s.decks[0];
local w = deck.pitch - s.pillar;
local h = deck.top - deck.waist;
local b = s.bars;
local steps(span) = std.floor(span / b.pitch);
local offsets(span) = [(i - steps(span) / 2) * b.pitch for i in std.range(0, steps(span))];
local hole = s.rearHoles[0];
local g = bus.layout(s);
local doorW = g.leafWidth;
local doorH = g.doorHeight - s.doorKick;
local cage = s.bulkhead;
bus.rows('prison_bus', s) + [
  // The rails overlap the pillars either side, so the grille is seated on the skin at its fitting's `at`.
  k.compound('prison_bus_window_bars', 11, [
    box('rail_low', 'bar', [-w / 2 - 0.05, -0.02, 0], [w / 2 + 0.05, b.rail, b.z]),
    box('rail_high', 'bar', [-w / 2 - 0.05, h - b.rail, 0], [w / 2 + 0.05, h + 0.02, b.z]),
  ] + [
    box('bar_' + i, 'bar', [offsets(w)[i] - b.width / 2, 0, 0.005], [offsets(w)[i] + b.width / 2, h, b.z])
    for i in std.range(0, std.length(offsets(w)) - 1)
  ], { bar: 'paint-charcoal' }),
  // Seated proud of the leaf at its fitting's `at`, the foot of the door's glass.
  k.compound('prison_bus_door_bars', 6, [
    box('rail_low', 'bar', [-doorW / 2, -0.02, 0.03], [doorW / 2, b.rail, 0.07]),
    box('rail_high', 'bar', [-doorW / 2, doorH - b.rail, 0.03], [doorW / 2, doorH, 0.07]),
  ] + [
    box('bar_' + i, 'bar', [offsets(doorW)[i] - b.width / 2, 0, 0.035], [offsets(doorW)[i] + b.width / 2, doorH, 0.07])
    for i in std.range(0, std.length(offsets(doorW)) - 1)
  ], { bar: 'paint-charcoal' }),
  // Solid to the seated prisoners' shoulders and barred above, between the door's bay and the first seat row.
  k.compound('prison_bus_bulkhead', 90, [
    box('panel', 'plate', [cage.x - 0.02, s.floor, -s.skin], [cage.x + 0.02, cage.panelTop, s.skin]),
    box('rail_high', 'bar', [cage.x - 0.03, s.roofBase - b.rail, -s.skin], [cage.x + 0.03, s.roofBase, s.skin]),
  ] + [
    box('bar_' + i, 'bar', [cage.x - 0.02, cage.panelTop, offsets(2 * s.skin)[i] - b.width / 2], [cage.x + 0.02, s.roofBase, offsets(2 * s.skin)[i] + b.width / 2])
    for i in std.range(0, std.length(offsets(2 * s.skin)) - 1)
  ], { bar: 'paint-charcoal', plate: 'paint-white' }),
  k.compound('prison_bus_rear_bars', 12, [
    box('rail_low', 'bar', [s.rear - b.z, hole.y[0] - 0.02, -hole.z - 0.05], [s.rear, hole.y[0] + b.rail, hole.z + 0.05]),
    box('rail_high', 'bar', [s.rear - b.z, hole.y[1] - b.rail, -hole.z - 0.05], [s.rear, hole.y[1] + 0.02, hole.z + 0.05]),
  ] + [
    box('bar_' + i, 'bar', [s.rear - b.z, hole.y[0], offsets(2 * hole.z)[i] - b.width / 2], [s.rear - 0.005, hole.y[1], offsets(2 * hole.z)[i] + b.width / 2])
    for i in std.range(0, std.length(offsets(2 * hole.z)) - 1)
  ], { bar: 'paint-charcoal' }),
]
