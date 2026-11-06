local t = import 'truck-cab.libsonnet';
local k = import 'kit.libsonnet';
local box = k.box;
local s = import 'flatbed_truck.spec.libsonnet';
local plankEdges = [-s.deckSide + 0.05, -1, -0.5, 0, 0.5, 1, s.deckSide - 0.05];
local stakes = [s.deckRear + 0.5 + i * (s.deckFront - s.deckRear - 0.9) / 5 for i in std.range(0, 5)];
t.rows('flatbed_truck', s) + [
  k.compound('flatbed_truck_deck', 720, [
    box('bed', 'steel', [s.deckRear, s.deckBottom + 0.02, -s.deckSide + 0.05], [s.deckFront, s.deckTop - 0.05, s.deckSide - 0.05]),
    box('tail', 'steel', [s.deckRear - 0.03, s.deckBottom, -s.deckSide], [s.deckRear + 0.05, s.deckTop, s.deckSide]),
  ] + [
    box('plank_' + i, if i % 2 == 0 then 'planks' else 'planks_dark', [s.deckRear, s.deckTop - 0.05, plankEdges[i]], [s.deckFront, s.deckTop, plankEdges[i + 1]])
    for i in std.range(0, 5)
  ] + k.bothSides([
    box('edge', 'steel', [s.deckRear, s.deckBottom, s.deckSide - 0.05], [s.deckFront, s.deckTop, s.deckSide]),
    box('runner', 'steel', [s.deckRear + 0.04, s.railTop, 0.3], [s.deckFront, s.deckBottom, 0.44]),
  ] + [
    box('stake_' + i, 'steel', [stakes[i] - 0.05, s.deckBottom - 0.05, s.deckSide - 0.005], [stakes[i] + 0.05, s.deckTop, s.deckSide + 0.02])
    for i in std.range(0, 5)
  ]), { planks: 'wood-pine', planks_dark: 'wood-oak', steel: s.paint }),
  k.compound('flatbed_truck_headboard', 110, [
    box('frame_top', 'steel', [s.deckFront - 0.08, s.boardTop - 0.08, -s.deckSide], [s.deckFront, s.boardTop, s.deckSide]),
    box('frame_low', 'steel', [s.deckFront - 0.08, s.deckTop, -s.deckSide], [s.deckFront, s.deckTop + 0.1, s.deckSide]),
  ] + [
    box('bar_' + i, 'bar', [s.deckFront - 0.06, s.deckTop + 0.1, -1.05 + i * 0.3], [s.deckFront - 0.02, s.boardTop - 0.08, -0.97 + i * 0.3])
    for i in std.range(0, 7)
  ] + k.bothSides([
    box('post', 'steel', [s.deckFront - 0.08, s.deckTop, s.deckSide - 0.1], [s.deckFront, s.boardTop, s.deckSide]),
  ]), { steel: s.paint, bar: 'steel-grey' }),
  k.compound('flatbed_truck_toolbox', 28, [
    box('box', 'steel', [-0.5, 0, -0.26], [0.5, 0.42, 0.26]),
    box('lid', 'lid', [-0.46, 0.05, 0.26], [0.46, 0.38, 0.27]),
    box('catch', 'trim', [-0.06, 0.28, 0.27], [0.06, 0.33, 0.285]),
  ], { steel: 'paint-charcoal', lid: 'alu-bare', trim: 'plastic-black' }),
]
