local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'trencher.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local bar = m.bar;
local along(t) = [s.chainTop[0] + (s.chainTip[0] - s.chainTop[0]) * t, s.chainTop[1] + (s.chainTip[1] - s.chainTop[1]) * t];
local dirX = (s.chainTip[0] - s.chainTop[0]) / std.sqrt(std.pow(s.chainTip[0] - s.chainTop[0], 2) + std.pow(s.chainTip[1] - s.chainTop[1], 2));
local dirY = (s.chainTip[1] - s.chainTop[1]) / std.sqrt(std.pow(s.chainTip[0] - s.chainTop[0], 2) + std.pow(s.chainTip[1] - s.chainTop[1], 2));
local chainOffset = 0.17;
local stepZ = s.trackZ + s.trackWidth / 2 + 0.01;
local tooth(i) =
  local p = along(0.08 + 0.84 * i / 13);
  local under = [p[0] + dirY * chainOffset, p[1] - dirX * chainOffset];
  local over = [p[0] - dirY * chainOffset, p[1] + dirX * chainOffset];
  [
    bar('tooth_under_' + i, 'tooth', under, [under[0] + dirY * 0.12, under[1] - dirX * 0.12], 0.07, [-s.chainZ - 0.05, s.chainZ + 0.05], 0.04),
    bar('tooth_over_' + i, 'tooth', over, [over[0] - dirY * 0.1, over[1] + dirX * 0.1], 0.07, [-s.chainZ - 0.05, s.chainZ + 0.05], 0.04),
  ];
[
  k.compound('trencher_chassis', s.shellMass, [
    box('belly', 'dark', [-1.05, 0.32, -0.55], [1.25, s.deck, 0.55]),
    box('deck_plate', 'dark', [-1.3, s.deck - 0.05, -s.side], [1.55, s.deck, s.side]),
    box('rear_tower', 'dark', [-1.42, s.deck, -0.22], [-1.0, 1.84, 0.22]),
    box('rear_tower_foot', 'dark', [-1.42, 0.5, -0.22], [-1.05, s.deck, 0.22]),
    box('dozer_arm', 'dark', [1.25, 0.34, -0.14], [1.62, 0.5, 0.14]),
  ] + bothSides([
    box('track_beam_front', 'dark', [0.7, 0.3, 0.5], [1.0, 0.5, s.trackZ]),
    box('track_beam_rear', 'dark', [-0.9, 0.3, 0.5], [-0.6, 0.5, s.trackZ]),
  ]), { dark: 'paint-charcoal' }),
  m.track('trencher_track', 260, s.trackLength, s.trackRadius, s.trackWidth, 0.08, 'rubber-black', 4, 14),
  k.compound('trencher_hood', 95, [
    prism('hood', 'paint', [[s.hoodBack, s.deck], [s.hoodFront, s.deck], [s.hoodFront, s.hoodTop - 0.16], [s.hoodFront - 0.18, s.hoodTop], [s.hoodBack, s.hoodTop]], [-0.56, 0.56]),
    box('grille', 'dark', [s.hoodFront, s.deck + 0.12, -0.42], [s.hoodFront + 0.02, s.hoodTop - 0.22, 0.42]),
  ] + bothSides([
    box('vent_a', 'dark', [0.4, 1.3, 0.56], [1.3, 1.34, 0.57]),
    box('vent_b', 'dark', [0.4, 1.4, 0.56], [1.3, 1.44, 0.57]),
  ]), { paint: s.paint, dark: 'paint-charcoal' }),
  k.compound('trencher_platform', 120, [
    box('floor', 'mat', [s.opRear, s.deck, -s.side], [s.hoodBack, s.deck + 0.03, s.side]),
    box('console', 'paint', [s.hoodBack - 0.28, s.deck + 0.03, -0.42], [s.hoodBack, 1.5, 0.42]),
    box('console_top', 'dark', [s.hoodBack - 0.34, 1.5, -0.46], [s.hoodBack, 1.56, 0.46]),
    box('seat_box', 'paint', [-0.82, s.deck + 0.03, -0.32], [-0.36, s.deck + 0.36, 0.32]),
    box('rear_wall', 'paint', [s.opRear, s.deck + 0.03, -s.side], [s.opRear + 0.05, 1.5, s.side]),
  ] + bothSides([
    box('side_rail', 'dark', [s.opRear, 1.42, s.side - 0.04], [-0.4, 1.46, s.side]),
    box('side_post', 'dark', [-0.44, s.deck + 0.03, s.side - 0.04], [-0.4, 1.46, s.side]),
  ]), { paint: s.paint, dark: 'paint-charcoal', mat: 'rubber-black' }),
  k.compound('trencher_canopy', 75, [
    box('roof', 'paint', [s.opRear - 0.14, s.canopy - 0.06, -s.side - 0.04], [s.hoodBack + 0.14, s.canopy, s.side + 0.04]),
    box('roof_rim', 'dark', [s.opRear - 0.08, s.canopy - 0.1, -s.side + 0.02], [s.hoodBack + 0.08, s.canopy - 0.06, s.side - 0.02]),
  ] + bothSides([
    box('post_rear', 'dark', [s.opRear, 1.46, s.side - 0.06], [s.opRear + 0.06, s.canopy - 0.06, s.side]),
    box('post_front', 'dark', [s.hoodBack - 0.06, s.deck + 0.03, s.side - 0.1], [s.hoodBack, s.canopy - 0.06, s.side - 0.04]),
  ]), { paint: s.paint, dark: 'paint-charcoal' }),
  k.compound('trencher_digging_boom', 620, [
    bar('beam', 'paint', s.chainTop, s.chainTip, 0.3, [-s.chainZ, s.chainZ], 0.22),
    bar('chain_over', 'chain', [s.chainTop[0] + -dirY * chainOffset, s.chainTop[1] + dirX * chainOffset], [s.chainTip[0] + -dirY * chainOffset, s.chainTip[1] + dirX * chainOffset], 0.07, [-s.chainZ - 0.03, s.chainZ + 0.03]),
    bar('chain_under', 'chain', [s.chainTop[0] + dirY * chainOffset, s.chainTop[1] - dirX * chainOffset], [s.chainTip[0] + dirY * chainOffset, s.chainTip[1] - dirX * chainOffset], 0.07, [-s.chainZ - 0.03, s.chainZ + 0.03]),
    m.axleDisc('nose_wheel', 'chain', s.chainTip[0], s.chainTip[1], 0.19, [-s.chainZ - 0.03, s.chainZ + 0.03], 16),
    m.axleDisc('head_sprocket', 'chain', s.chainTop[0], s.chainTop[1], 0.24, [-s.chainZ - 0.03, s.chainZ + 0.03], 16),
    m.axleDisc('head_boss', 'paint', s.chainTop[0], s.chainTop[1], 0.12, [-0.26, 0.26], 12),
  ] + std.flattenArrays([tooth(i) for i in std.range(0, 13)]), { paint: s.paint, chain: 'steel-spall-black', tooth: 'steel-grey' }),
  k.compound('trencher_spoil_auger', 90, [
    m.axleDisc('shaft', 'dark', -1.62, 0.28, 0.05, [-0.74, 0.74], 12),
    box('hood', 'paint', [-1.82, 0.42, -0.76], [-1.42, 0.48, 0.76]),
    box('hood_back', 'paint', [-1.42, 0.42, -0.5], [-1.38, 0.8, 0.5]),
    box('mount', 'dark', [-1.42, 0.5, -0.2], [-1.38, 0.82, 0.2]),
    box('end_near', 'dark', [-1.67, 0.22, 0.72], [-1.57, 0.46, 0.76]),
    box('end_far', 'dark', [-1.67, 0.22, -0.76], [-1.57, 0.46, -0.72]),
  ] + std.flattenArrays([
    [
      local z = 0.14 + 0.1 * i;
      m.axleDisc('flight_near_' + i, 'flight', -1.62, 0.28, 0.13, [z, z + 0.05], 12),
      local z = 0.14 + 0.1 * i;
      m.axleDisc('flight_far_' + i, 'flight', -1.62, 0.28, 0.13, [-z - 0.05, -z], 12),
    ]
    for i in std.range(0, 5)
  ]), { paint: s.paint, dark: 'paint-charcoal', flight: 'steel-grey' }),
  k.compound('trencher_lift_ram', 30, [
    bar('barrel', 'dark', [-1.1, 1.72], [-1.75, 1.74], 0.1, [0.18, 0.28]),
    bar('rod', 'bright', [-1.7, 1.74], [-2.1, 1.3], 0.05, [0.2, 0.26]),
    bar('clevis', 'dark', [-2.12, 1.32], [-2.02, 1.2], 0.08, [0.06, 0.28]),
  ], { dark: 'paint-charcoal', bright: 'steel-stainless' }),
  k.compound('trencher_backfill_blade', 110, [
    prism('blade', 'paint', [[1.62, 0.04], [1.72, 0.04], [1.82, 0.6], [1.74, 0.6]], [-0.84, 0.84]),
    box('cutting_edge', 'dark', [1.6, 0.0, -0.84], [1.72, 0.05, 0.84]),
    box('brace', 'dark', [1.56, 0.34, -0.2], [1.7, 0.5, 0.2]),
  ], { paint: s.paint, dark: 'paint-charcoal' }),
  m.step('trencher_step', 8, [-0.46, 0.18], 0.5, [stepZ, stepZ + 0.16], 'paint-charcoal'),
  k.compound('trencher_step_hanger', 4, [
    box('arm_a', 'dark', [-0.4, 0.72, s.side - 0.04], [-0.34, s.deck, stepZ + 0.04]),
    box('leg_a', 'dark', [-0.4, 0.46, stepZ], [-0.34, s.deck, stepZ + 0.04]),
    box('arm_b', 'dark', [0.1, 0.72, s.side - 0.04], [0.16, s.deck, stepZ + 0.04]),
    box('leg_b', 'dark', [0.1, 0.46, stepZ], [0.16, s.deck, stepZ + 0.04]),
  ], { dark: 'paint-charcoal' }),
  k.compound('trencher_exhaust', 6, [
    k.turned('pipe', 'steel', 'y', k.disc(0.04, 0, 0.62)) + { sides: 12 },
    box('rain_cap', 'steel', [-0.06, 0.62, -0.05], [0.06, 0.65, 0.05]),
  ], { steel: 'steel-spall-black' }),
]
