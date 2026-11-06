local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'excavator.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local bar = m.bar;
local doorRear = -0.08;
local doorFront = 0.72;
local belt = 1.92;
// The cab stands on the machine's left, at -z, with its boxes written outboard-positive.
local left(piece) = piece { min: [piece.min[0], piece.min[1], -piece.max[2]], max: [piece.max[0], piece.max[1], -piece.min[2]] };
[
  k.compound('excavator_carbody', 2900, [
    box('centre', 'steel', [-0.9, 0.42, -0.85], [0.9, 0.86, 0.85]),
    m.axleDisc('swivel', 'steel', 0, 0.6, 0.2, [-0.9, 0.9]),
    k.turned('slew_ring', 'ring', 'y', k.disc(0.86, 0.86, 1.08), [0, 0, 0]) + { sides: 24 },
  ], { steel: 'paint-charcoal', ring: 'steel-spall-black' }),
  m.track('excavator_track', 1550, s.trackLength, s.trackRadius, s.trackWidth, 0.09, 'steel-spall-black', 7, 22),
  k.compound('excavator_house', s.shellMass, [
    box('deck', 'paint', [-1.6, 1.06, -s.side], [1.06, s.deck, s.side]),
    prism('hood', 'paint', [[-1.6, s.deck], [-0.36, s.deck], [-0.36, s.hoodTop - 0.08], [-0.46, s.hoodTop], [-1.6, s.hoodTop]], [-s.side, s.side]),
    box('hood_grille', 'trim', [-1.25, s.hoodTop, -0.1], [-0.6, s.hoodTop + 0.02, 0.7]),
    box('tool_cover', 'paint', [-0.38, s.deck, 0.36], [1.06, 1.9, s.side]),
    box('boom_foot', 'steel', [0.3, s.deck, -0.3], [1.3, 1.78, 0.3]),
    box('foot_nose', 'steel', [1.06, 1.08, -0.3], [1.3, s.deck, 0.3]),
    box('near_vent_a', 'trim', [-1.5, 1.42, s.side], [-0.6, 1.46, s.side + 0.01]),
    box('near_vent_b', 'trim', [-1.5, 1.54, s.side], [-0.6, 1.58, s.side + 0.01]),
    box('near_vent_c', 'trim', [-1.5, 1.66, s.side], [-0.6, 1.7, s.side + 0.01]),
    box('far_vent_a', 'trim', [-1.5, 1.42, -s.side - 0.01], [-0.6, 1.46, -s.side]),
    box('far_vent_b', 'trim', [-1.5, 1.54, -s.side - 0.01], [-0.6, 1.58, -s.side]),
    box('far_vent_c', 'trim', [-1.5, 1.66, -s.side - 0.01], [-0.6, 1.7, -s.side]),
    box('rail_a', 'trim', [-0.3, 1.9, 1.18], [-0.26, 2.2, 1.22]),
    box('rail_b', 'trim', [0.96, 1.9, 1.18], [1.0, 2.2, 1.22]),
    box('rail_c', 'trim', [-0.3, 2.16, 1.18], [1.0, 2.2, 1.22]),
  ], { paint: s.paint, trim: 'paint-charcoal', steel: s.paint }),
  k.compound('excavator_counterweight', 2500, [
    prism('block', 'iron', [[-2.2, 1.14], [-1.55, 1.14], [-1.55, s.hoodTop - 0.04], [-2.02, s.hoodTop - 0.04], [-2.2, 1.78]], [-s.side, s.side]),
  ], { iron: 'paint-charcoal' }),
  k.compound('excavator_cab', 420, std.map(left, [
    box('floor', 'floor', [s.cabRear, s.deck, s.cabIn], [s.cabFront, s.deck + 0.06, s.side]),
    box('rear', 'paint', [s.cabRear, s.deck, s.cabIn], [s.cabRear + 0.07, s.cabRoof, s.side]),
    box('inner_lower', 'paint', [s.cabRear, s.deck, s.cabIn], [s.cabFront, belt, s.cabIn + 0.05]),
    box('inner_post_mid', 'paint', [doorFront, belt, s.cabIn], [doorFront + 0.06, s.cabRoof, s.cabIn + 0.05]),
    box('inner_glass', 'glass', [s.cabRear + 0.07, belt, s.cabIn + 0.015], [s.cabFront, s.cabRoof - 0.06, s.cabIn + 0.04]),
    box('outer_sill', 'paint', [doorFront, s.deck, s.side - 0.05], [s.cabFront, belt, s.side]),
    box('outer_post', 'paint', [doorFront, s.deck, s.side - 0.05], [doorFront + 0.06, s.cabRoof, s.side]),
    box('outer_rear_post', 'paint', [s.cabRear, s.deck, s.side - 0.05], [doorRear, s.cabRoof, s.side]),
    box('outer_glass', 'glass', [doorFront + 0.06, belt, s.side - 0.04], [s.cabFront, s.cabRoof - 0.06, s.side - 0.01]),
    box('roof', 'paint', [s.cabRear - 0.04, s.cabRoof - 0.06, s.cabIn - 0.04], [s.cabFront + 0.06, s.cabRoof + 0.03, s.side + 0.04]),
    box('front_foot', 'paint', [s.cabFront - 0.06, s.deck, s.cabIn], [s.cabFront, s.deck + 0.28, s.side]),
    box('post_front_inner', 'paint', [s.cabFront - 0.06, s.deck, s.cabIn], [s.cabFront, s.cabRoof, s.cabIn + 0.06]),
    box('post_front_outer', 'paint', [s.cabFront - 0.06, s.deck, s.side - 0.06], [s.cabFront, s.cabRoof, s.side]),
    box('seat_box', 'floor', [-0.1, s.deck + 0.06, 0.5], [0.4, s.deck + 0.2, 1.05]),
    box('console', 'trim', [0.42, s.deck + 0.06, 0.48], [0.62, s.deck + 0.52, 1.08]),
  ]), { paint: s.paint, floor: 'rubber-black', trim: 'plastic-black', glass: 'glass-clear' }),
  k.compound('excavator_cab_door', 40, std.map(left, [
    box('skin', 'paint', [doorRear, s.deck + 0.02, s.side - 0.04], [doorFront, belt, s.side]),
    box('top', 'paint', [doorRear, s.cabRoof - 0.12, s.side - 0.04], [doorFront, s.cabRoof - 0.06, s.side]),
    box('stile_rear', 'paint', [doorRear, belt, s.side - 0.04], [doorRear + 0.05, s.cabRoof - 0.12, s.side]),
    box('stile_front', 'paint', [doorFront - 0.05, belt, s.side - 0.04], [doorFront, s.cabRoof - 0.12, s.side]),
    box('glass', 'glass', [doorRear + 0.05, belt, s.side - 0.03], [doorFront - 0.05, s.cabRoof - 0.12, s.side - 0.01]),
    box('handle', 'trim', [doorFront - 0.2, belt - 0.12, s.side], [doorFront - 0.06, belt - 0.08, s.side + 0.02]),
  ]), { paint: s.paint, trim: 'plastic-black', glass: 'glass-clear' }, {
    hinge_a: ['skin', [0, 0.2, 0]],
    hinge_b: ['skin', [0, 0.8, 0]],
  }),
  k.compound('excavator_windscreen', 18, [
    left(box('glass', 'glass', [s.cabFront - 0.045, s.deck + 0.28, s.cabIn + 0.06], [s.cabFront - 0.015, s.cabRoof - 0.06, s.side - 0.06])),
  ], { glass: 'glass-clear' }),
  k.compound('excavator_boom', 1150, [
    bar('foot', 'paint', s.footPivot, s.knee, 0.34, [-0.2, 0.2], 0.6),
    bar('reach', 'paint', s.knee, s.tip, 0.6, [-0.2, 0.2], 0.28),
    m.axleDisc('knee_cap', 'paint', s.knee[0], s.knee[1], 0.3, [-0.2, 0.2]),
    m.axleDisc('foot_pin', 'pin', s.footPivot[0], s.footPivot[1], 0.09, [-0.26, 0.26], 12),
  ] + bothSides([
    box('ram_lug', 'paint', [1.7, 2.4, 0.2], [1.95, 2.62, 0.26]),
  ]), { paint: s.paint, pin: 'steel-stainless' }),
  k.compound('excavator_arm', 620, [
    bar('stick', 'paint', [s.tip[0], s.tip[1] + 0.04], s.wrist, 0.44, [-0.13, 0.13], 0.2),
    bar('horn', 'paint', [s.tip[0], s.tip[1] + 0.04], [4.06, 3.46], 0.3, [-0.13, 0.13], 0.2),
    m.axleDisc('tip_pin', 'pin', s.tip[0], s.tip[1], 0.09, [-0.22, 0.22], 12),
    m.axleDisc('wrist_pin', 'pin', s.wrist[0], s.wrist[1], 0.07, [-0.17, 0.17], 12),
  ], { paint: s.paint, pin: 'steel-stainless' }),
  k.compound('excavator_bucket', 480,
    m.bucket(2.87, 0.54, 0.5, 240, 395, 0.46) + [
      bar('ear', 'shell', [3.0, 0.9], [s.wrist[0] + 0.02, s.wrist[1] + 0.04], 0.14, [-0.17, 0.17]),
      bar('ear_link', 'shell', [3.25, 0.82], [3.38, 1.22], 0.1, [-0.1, 0.1]),
    ], { shell: 'paint-charcoal', tooth: 'steel-grey' }),
  k.compound('excavator_boom_ram', 110, [
    bar('barrel', 'dark', [1.2, 1.34], [1.6, 2.02], 0.17, [0.21, 0.33]),
    bar('rod', 'bright', [1.56, 1.95], [1.84, 2.48], 0.08, [0.235, 0.305]),
  ], { dark: 'paint-charcoal', bright: 'steel-stainless' }),
  k.compound('excavator_arm_ram', 120, [
    bar('barrel', 'dark', [2.2, 3.62], [3.2, 3.62], 0.17, [-0.08, 0.08]),
    bar('rod', 'bright', [3.15, 3.62], [4.0, 3.42], 0.08, [-0.04, 0.04]),
    box('saddle', 'dark', [2.14, 3.46, -0.09], [2.3, 3.7, 0.09]),
  ], { dark: 'paint-charcoal', bright: 'steel-stainless' }),
  k.compound('excavator_bucket_ram', 90, [
    bar('barrel', 'dark', [4.02, 3.3], [3.72, 2.3], 0.14, [-0.06, 0.06]),
    bar('rod', 'bright', [3.74, 2.36], [3.46, 1.3], 0.06, [-0.03, 0.03]),
    bar('link', 'dark', [3.5, 1.3], [3.16, 1.06], 0.08, [-0.05, 0.05]),
  ], { dark: 'paint-charcoal', bright: 'steel-stainless' }),
  k.compound('excavator_exhaust', 6, [
    k.turned('pipe', 'steel', 'y', k.disc(0.05, 0, 0.42)) + { sides: 12 },
  ], { steel: 'steel-spall-black' }),
]
