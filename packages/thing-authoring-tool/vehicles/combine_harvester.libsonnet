local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'combine_harvester.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local bar = m.bar;
local door = s.cabRear + 0.55;
local bats = 6;
local polar(r, degrees) = [s.reel[0] + r * std.cos(degrees * std.pi / 180), s.reel[1] + r * std.sin(degrees * std.pi / 180)];
[
  k.compound('combine_harvester_body', s.shellMass, [
    box('main', 'paint', [s.bodyRear + 0.32, s.sill, -s.side], [s.bodyFront, s.shoulder, s.side]),
    box('top_deck', 'dark', [s.bodyRear, s.shoulder, -s.side], [s.tankRear, s.shoulder + 0.06, s.side]),
    box('front_face', 'dark', [s.bodyFront, 1.55, -0.62], [s.bodyFront + 0.28, 2.3, 0.62]),
    box('platform', 'mesh', [s.cabRear - 0.3, s.cabFloor - 0.06, -1.3], [s.cabFront, s.cabFloor, 1.3]),
    box('front_beam', 'dark', [s.frontAxle - 0.26, 0.5, -1.18], [s.frontAxle + 0.26, 0.84, 1.18]),
    box('rear_hood', 'paint', [s.bodyRear, 1.2, -s.side], [s.bodyRear + 0.34, s.shoulder, s.side]),
  ] + bothSides([
    box('door_panel_a', 'dark', [-1.8, 1.02, s.side], [-1.74, 2.6, s.side + 0.01]),
    box('door_panel_b', 'dark', [-0.8, 1.02, s.side], [-0.74, 2.6, s.side + 0.01]),
    box('stripe', 'yellow', [-3.7, 2.62, s.side], [0.9, 2.7, s.side + 0.01]),
    box('platform_rail', 'dark', [s.cabRear - 0.3, 3.0, 1.26], [s.cabFront, 3.04, 1.3]),
    box('rail_post_a', 'dark', [s.cabRear - 0.3, s.cabFloor, 1.26], [s.cabRear - 0.26, 3.0, 1.3]),
    box('rail_post_b', 'dark', [s.cabFront - 0.04, s.cabFloor, 1.26], [s.cabFront, 3.0, 1.3]),
    box('grille_plate', 'dark', [-3.6, 1.62, s.side], [-2.2, 2.4, s.side + 0.03]),
    box('belt_guard', 'mesh', [-1.66, 1.2, s.side], [-0.92, 2.2, s.side + 0.03]),
    box('sieve_panel', 'dark', [-0.66, 1.2, s.side], [0.7, 1.26, s.side + 0.03]),
    box('sieve_panel_top', 'dark', [-0.66, 2.14, s.side], [0.7, 2.2, s.side + 0.03]),
  ] + [
    box('grille_slat_' + i, 'paint', [-3.54, 1.68 + 0.12 * i, s.side + 0.03], [-2.26, 1.74 + 0.12 * i, s.side + 0.06])
    for i in std.range(0, 5)
  ]) + [
    box('engine_hatch', 'paint', [-3.5, s.shoulder + 0.06, -0.72], [-2.9, s.shoulder + 0.09, 0.72]),
    box('radiator_screen', 'mesh', [-2.3, s.shoulder + 0.06, -0.72], [-1.8, s.shoulder + 0.09, 0.72]),
  ], { paint: s.paint, dark: 'paint-charcoal', mesh: 'steel-galvanised', yellow: 'paint-white' }),
  k.compound('combine_harvester_cab', 420, [
    box('floor', 'mat', [s.cabRear, s.cabFloor, -s.cabSide], [s.cabFront, s.cabFloor + 0.04, s.cabSide]),
    box('roof', 'paint', [s.cabRear - 0.1, s.cabRoof - 0.08, -s.cabSide - 0.12], [s.cabFront + 0.2, s.cabRoof, s.cabSide + 0.12]),
    box('roof_liner', 'dark', [s.cabRear, s.cabRoof - 0.11, -s.cabSide], [s.cabFront + 0.04, s.cabRoof - 0.08, s.cabSide]),
    box('rear_wall', 'paint', [s.cabRear, s.cabFloor, -s.cabSide], [s.cabRear + 0.06, s.cabRoof - 0.08, s.cabSide]),
    box('dash', 'dark', [s.cabFront - 0.38, s.cabFloor + 0.04, -0.62], [s.cabFront - 0.05, 2.86, 0.62]),
    box('sill_front', 'paint', [s.cabFront - 0.05, s.cabFloor, -s.cabSide], [s.cabFront + 0.04, s.cabFloor + 0.1, s.cabSide]),
    box('work_lamp_bar', 'dark', [s.cabFront + 0.1, s.cabRoof - 0.12, -0.7], [s.cabFront + 0.16, s.cabRoof - 0.08, 0.7]),
    // The door opens on the near side only: the far side is the same frame with fixed glass.
    box('far_panel', 'paint', [door, s.cabFloor, -s.cabSide], [s.cabFront - 0.05, s.shoulderCab - 0.2, -s.cabSide + 0.04]),
    box('far_glass', 'glass', [door, s.shoulderCab - 0.2, -s.cabSide + 0.01], [s.cabFront - 0.05, s.cabRoof - 0.08, -s.cabSide + 0.03]),
  ] + bothSides([
    box('post_front', 'dark', [s.cabFront - 0.05, s.cabFloor, s.cabSide - 0.06], [s.cabFront + 0.04, s.cabRoof - 0.08, s.cabSide]),
    box('post_door', 'dark', [door - 0.05, s.cabFloor, s.cabSide - 0.06], [door, s.cabRoof - 0.08, s.cabSide]),
    box('post_rear', 'dark', [s.cabRear, s.cabFloor, s.cabSide - 0.06], [s.cabRear + 0.08, s.cabRoof - 0.08, s.cabSide]),
    box('side_lower', 'paint', [s.cabRear + 0.08, s.cabFloor, s.cabSide - 0.04], [door - 0.05, s.shoulderCab, s.cabSide]),
    box('side_glass', 'glass', [s.cabRear + 0.08, s.shoulderCab, s.cabSide - 0.04], [door - 0.05, s.cabRoof - 0.08, s.cabSide - 0.01]),
  ]), { paint: s.paint, dark: 'paint-charcoal', mat: 'rubber-black', glass: 'glass-clear' }),
  k.compound('combine_harvester_cab_door', 42, [
    box('frame_low', 'paint', [door + 0.01, s.cabFloor + 0.04, s.cabSide - 0.04], [s.cabFront - 0.06, s.shoulderCab - 0.2, s.cabSide]),
    box('glass', 'glass', [door + 0.05, s.shoulderCab - 0.2, s.cabSide - 0.03], [s.cabFront - 0.1, s.cabRoof - 0.14, s.cabSide - 0.01]),
    box('frame_head', 'paint', [door + 0.01, s.cabRoof - 0.14, s.cabSide - 0.04], [s.cabFront - 0.06, s.cabRoof - 0.08, s.cabSide]),
    box('stile', 'paint', [door + 0.01, s.shoulderCab - 0.2, s.cabSide - 0.04], [door + 0.05, s.cabRoof - 0.14, s.cabSide]),
    box('stile_front', 'paint', [s.cabFront - 0.1, s.shoulderCab - 0.2, s.cabSide - 0.04], [s.cabFront - 0.06, s.cabRoof - 0.14, s.cabSide]),
  ], { paint: s.paint, glass: 'glass-clear' }, {
    hinge_a: ['stile', [0, 0.1, 1]],
    hinge_b: ['stile', [0, 0.9, 1]],
  }),
  k.compound('combine_harvester_windscreen', 30, [
    box('glass', 'glass', [s.cabFront - 0.02, s.cabFloor + 0.1, -s.cabSide + 0.06], [s.cabFront + 0.02, s.cabRoof - 0.11, s.cabSide - 0.06]),
  ], { glass: 'glass-clear' }),
  k.compound('combine_harvester_grain_tank', 340, [
    box('rear_wall', 'paint', [s.tankRear, s.shoulder, -s.tankSide], [s.tankRear + 0.05, s.tankTop, s.tankSide]),
    box('front_wall', 'paint', [s.tankFront - 0.05, s.shoulder, -s.tankSide], [s.tankFront, s.tankTop, s.tankSide]),
  ] + bothSides([
    box('side_wall', 'paint', [s.tankRear, s.shoulder, s.tankSide - 0.05], [s.tankFront, s.tankTop, s.tankSide]),
    box('rim', 'yellow', [s.tankRear, s.tankTop - 0.1, s.tankSide - 0.02], [s.tankFront, s.tankTop, s.tankSide + 0.02]),
  ]), { paint: s.paint, yellow: 'paint-white' }),
  // Apart from the tank because a load floor's face is the top of its whole part (`packages/deadvox/src/core/cargoSpace.ts`).
  k.compound('combine_harvester_grain_floor', 80, [
    box('plate', 'steel', [s.tankRear + 0.05, s.shoulder - 0.03125, -s.tankSide + 0.05], [s.tankFront - 0.05, s.tankFloorTop, s.tankSide - 0.05]),
  ], { steel: 'steel-galvanised' }),
  k.compound('combine_harvester_unloading_auger', 210, [
    k.turned('tube', 'tube', 'x', k.disc(0.15, -1.9, 1.2), [-0.6, 3.15, -1.2]) + { sides: 12 },
    box('spout', 'tube', [-2.62, 2.85, -1.32], [-2.42, 3.1, -1.08]),
    box('root', 'dark', [0.34, 2.7, -1.3], [0.62, 3.2, -1.02]),
    box('cradle', 'dark', [-2.1, 3.0, -1.3], [-1.96, 3.1, -0.9]),
    box('cradle_post', 'dark', [-2.06, s.shoulder + 0.06, -1.0], [-2.0, 3.0, -0.9]),
  ], { tube: 'paint-white', dark: 'paint-charcoal' }),
  k.compound('combine_harvester_feeder', 640, [
    bar('housing', 'paint', [s.bodyFront, 1.68], [s.headerRear + 0.06, 0.8], 0.82, [-0.58, 0.58], 0.74),
  ] + bothSides([
    bar('lift_ram', 'dark', [s.bodyFront + 0.12, 0.74], [2.2, 0.84], 0.1, [0.5, 0.6]),
    bar('lift_rod', 'bright', [2.16, 0.84], [2.56, 0.98], 0.05, [0.52, 0.58]),
  ]), { paint: s.paint, dark: 'paint-charcoal', bright: 'steel-stainless' }),
  k.compound('combine_harvester_header', 1900, [
    box('floor', 'paint', [s.headerRear, 0.2, -s.headerHalf], [s.headerFront, 0.3, s.headerHalf]),
    box('rear_wall', 'paint', [s.headerRear, 0.26, -s.headerHalf], [s.headerRear + 0.1, s.wallTop, s.headerHalf]),
    box('top_channel', 'yellow', [s.headerRear - 0.05, s.wallTop - 0.08, -s.headerHalf], [s.headerRear + 0.2, s.wallTop, s.headerHalf]),
    box('cutter_bar', 'steel', [s.headerFront, 0.18, -s.headerHalf], [s.headerFront + 0.14, 0.26, s.headerHalf]),
    m.axleDisc('auger', 'yellow', s.headerRear + 0.42, 0.62, 0.26, [-s.headerHalf + 0.05, s.headerHalf - 0.05], 16),
  ] + [
    local z = -s.headerHalf + 0.2 + i * 0.4;
    box('finger_' + i, 'steel', [s.headerFront + 0.1, 0.18, z - 0.03], [s.headerFront + 0.24, 0.23, z + 0.03])
    for i in std.range(0, 13)
  ] + [
    local flight = -s.headerHalf + 0.45 + i * 0.55;
    m.axleDisc('auger_flight_' + i, 'paint', s.headerRear + 0.42, 0.62, 0.34, [flight, flight + 0.05], 16)
    for i in std.range(0, 8)
  ] + bothSides([
    prism('end_plate', 'paint', [[s.headerRear, 0.18], [s.headerFront + 0.06, 0.18], [s.headerFront + 0.4, 0.26], [s.headerRear + 0.62, s.wallTop], [s.headerRear, s.wallTop]], [s.headerHalf - 0.04, s.headerHalf]),
    prism('divider', 'yellow', [[s.headerFront, 0.18], [s.headerFront + 0.42, 0.22], [s.headerFront, 0.56]], [s.headerHalf - 0.1, s.headerHalf + 0.03]),
    bar('reel_arm', 'dark', [s.headerRear + 0.1, s.wallTop], [s.reel[0], s.reel[1]], 0.1, [s.headerHalf - 0.1, s.headerHalf - 0.04]),
  ]), { paint: s.paint, yellow: 'paint-white', steel: 'steel-grey', dark: 'paint-charcoal' }),
  k.compound('combine_harvester_reel', 180, [
    m.axleDisc('shaft', 'dark', s.reel[0], s.reel[1], 0.05, [-s.headerHalf + 0.1, s.headerHalf - 0.1], 12),
  ] + std.flattenArrays([
    local angle = i * 360 / bats;
    local tip = polar(s.reelRadius, angle);
    [
      box('bat_' + i, 'yellow', [tip[0] - 0.06, tip[1] - 0.06, -s.headerHalf + 0.12], [tip[0] + 0.06, tip[1] + 0.06, s.headerHalf - 0.12]),
      bar('spider_near_' + i, 'dark', s.reel, tip, 0.04, [s.headerHalf * 0.72, s.headerHalf * 0.72 + 0.04]),
      bar('spider_mid_' + i, 'dark', s.reel, tip, 0.04, [-0.02, 0.02]),
      bar('spider_far_' + i, 'dark', s.reel, tip, 0.04, [-s.headerHalf * 0.72 - 0.04, -s.headerHalf * 0.72]),
    ]
    for i in std.range(0, bats - 1)
  ]), { yellow: 'paint-white', dark: 'paint-charcoal' }),
  k.compound('combine_harvester_front_axle', 620, [
    m.axleDisc('tube', 'dark', s.frontAxle, s.frontHub, 0.13, [-s.frontZ + 0.1, s.frontZ - 0.1], 16),
  ], { dark: 'paint-charcoal' }),
  k.compound('combine_harvester_rear_axle', 320, [
    box('beam', 'dark', [s.rearAxle - 0.09, s.rearHub - 0.07, -s.rearZ + 0.1], [s.rearAxle + 0.09, s.rearHub + 0.07, s.rearZ - 0.1]),
    box('pivot', 'dark', [s.rearAxle - 0.2, s.rearHub - 0.02, -0.34], [s.rearAxle + 0.2, s.sill + 0.04, 0.34]),
  ], { dark: 'paint-charcoal' }),
  k.compound('combine_harvester_ladder', 28, [
    box('rail_a', 'dark', [1.76, 0.5, 1.26], [1.8, s.cabFloor, 1.3]),
    box('rail_b', 'dark', [2.2, 0.5, 1.26], [2.24, s.cabFloor, 1.3]),
  ] + [
    local y = 0.5 + i * 0.3;
    box('rung_' + i, 'dark', [1.76, y, 1.26], [2.24, y + 0.04, 1.3])
    for i in std.range(0, 5)
  ], { dark: 'paint-charcoal' }),
  k.compound('combine_harvester_straw_chopper', 260, [
    prism('hood', 'dark', [[s.bodyRear - 0.42, 0.72], [s.bodyRear + 0.34, 0.72], [s.bodyRear + 0.34, 1.26], [s.bodyRear - 0.3, 1.26]], [-0.86, 0.86]),
    box('chute', 'steel', [s.bodyRear - 0.5, 0.68, -0.82], [s.bodyRear - 0.2, 0.74, 0.82]),
  ], { dark: 'paint-charcoal', steel: 'steel-galvanised' }),
]
