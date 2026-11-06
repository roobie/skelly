local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'road_roller.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local yoke(id, x, back) = k.compound(id, 240, [
  box('head', 'paint', [x - 0.42, 1.18, -s.drumHalf - 0.08], [x + 0.42, 1.28, s.drumHalf + 0.08]),
  box('neck', 'paint', [back - 0.02, 0.88, -0.28], [x - 0.3 * std.sign(x), 1.2, 0.28]),
  box('scraper', 'dark', [x + std.sign(x) * 0.63 - 0.03, 0.74, -s.drumHalf + 0.03], [x + std.sign(x) * 0.63 + 0.03, 1.3, s.drumHalf - 0.03]),
] + bothSides([
  prism('cheek', 'paint', [[x - 0.13, s.drumRadius - 0.12], [x + 0.13, s.drumRadius - 0.12], [x + 0.4, 1.2], [x - 0.4, 1.2]], [s.drumHalf + 0.02, s.drumHalf + 0.08]),
  m.axleDisc('bearing', 'dark', x, s.drumRadius, 0.14, [s.drumHalf + 0.02, s.drumHalf + 0.14], 12),
]), { paint: s.paint, dark: 'paint-charcoal' });
[
  k.compound('road_roller_drum', 1500, [
    m.axleDisc('roll', 'steel', 0, 0, s.drumRadius, [-s.drumHalf, s.drumHalf], 32),
  ] + bothSides([
    m.axleDisc('end_plate', 'dark', 0, 0, s.drumRadius - 0.07, [s.drumHalf - 0.02, s.drumHalf + 0.03], 24),
    m.axleDisc('hub', 'dark', 0, 0, 0.14, [s.drumHalf - 0.02, s.drumHalf + 0.07], 12),
  ]), { steel: 'steel-grey', dark: 'paint-charcoal' }, { hub: ['roll', [0.5, 0.5, 0.5]] }),
  yoke('road_roller_front_yoke', s.frontAxle, 0.6),
  yoke('road_roller_rear_yoke', s.rearAxle, -1.08),
  k.compound('road_roller_platform', s.shellMass, [
    box('spine', 'dark', [-1.1, 0.76, -0.36], [0.72, s.deck - 0.03, 0.36]),
    box('floor', 'mat', [-0.68, s.deck - 0.03, -s.side - 0.1], [0.68, s.deck, s.side + 0.1]),
    box('floor_frame', 'dark', [-0.68, s.deck - 0.1, -s.side - 0.1], [0.68, s.deck - 0.03, s.side + 0.1]),
    box('console', 'paint', [0.42, s.deck, -0.3], [0.68, 1.5, 0.3]),
    box('console_top', 'dark', [0.38, 1.5, -0.34], [0.7, 1.56, 0.34]),
    box('seat_pedestal', 'dark', [-0.26, s.deck, -0.2], [0.14, s.deck + 0.26, 0.2]),
  ] + bothSides([
    box('guard_rail', 'dark', [-0.68, 1.56, s.side + 0.06], [-0.2, 1.6, s.side + 0.1]),
    box('guard_post_front', 'dark', [-0.24, s.deck, s.side + 0.06], [-0.2, 1.6, s.side + 0.1]),
    box('guard_post_rear', 'dark', [-0.68, s.deck, s.side + 0.06], [-0.64, 1.6, s.side + 0.1]),
  ]), { dark: 'paint-charcoal', mat: 'rubber-black', paint: s.paint }),
  k.compound('road_roller_engine_hood', 110, [
    prism('hood', 'paint', [[-2.02, 1.28], [-0.68, 1.28], [-0.68, s.hoodTop], [-1.84, s.hoodTop], [-2.02, s.hoodTop - 0.16]], [-0.62, 0.62]),
    box('rear_panel', 'dark', [-2.04, 1.3, -0.5], [-2.02, s.hoodTop - 0.2, 0.5]),
  ] + bothSides([
    box('vent_a', 'dark', [-1.7, 1.4, 0.62], [-0.9, 1.44, 0.63]),
    box('vent_b', 'dark', [-1.7, 1.5, 0.62], [-0.9, 1.54, 0.63]),
  ]), { paint: s.paint, dark: 'paint-charcoal' }),
  k.compound('road_roller_water_tank', 90, [
    prism('tank', 'paint', [[0.68, 1.28], [2.0, 1.28], [2.0, 1.5], [1.86, 1.62], [0.68, 1.62]], [-0.62, 0.62]),
    k.turned('filler', 'dark', 'y', k.disc(0.09, 1.62, 1.68), [1.3, 0, 0]) + { sides: 12 },
  ], { paint: s.paint, dark: 'paint-charcoal' }),
  k.compound('road_roller_canopy', 85, [
    box('roof', 'paint', [-0.92, s.canopy - 0.06, -0.78], [0.92, s.canopy, 0.78]),
    box('roof_rim', 'dark', [-0.86, s.canopy - 0.1, -0.72], [0.86, s.canopy - 0.06, 0.72]),
  ] + bothSides([
    box('post_rear', 'dark', [-0.72, s.hoodTop - 0.04, 0.5], [-0.66, s.canopy - 0.06, 0.56]),
    box('post_front', 'dark', [0.62, s.deck, 0.5], [0.68, s.canopy - 0.06, 0.56]),
  ]), { paint: s.paint, dark: 'paint-charcoal' }),
  m.step('road_roller_step', 10, [-0.12, 0.5], 0.56, [s.side + 0.1, s.side + 0.28]),
  k.compound('road_roller_step_hanger', 6, [
    box('hanger_a', 'dark', [-0.12, 0.5, s.side + 0.1], [-0.06, s.deck - 0.03, s.side + 0.14]),
    box('hanger_b', 'dark', [0.44, 0.5, s.side + 0.1], [0.5, s.deck - 0.03, s.side + 0.14]),
  ], { dark: 'paint-charcoal' }),
  k.compound('road_roller_exhaust', 8, [
    k.turned('pipe', 'steel', 'y', k.disc(0.04, 0, 0.5)) + { sides: 12 },
    box('rain_cap', 'steel', [-0.06, 0.5, -0.05], [0.06, 0.53, 0.05]),
  ], { steel: 'steel-spall-black' }),
]
