local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'semi_trailer.spec.libsonnet';
local box = k.box;
local bothSides = k.bothSides;
local axleIds = std.range(0, std.length(s.axles) - 1);
local crossIds = std.range(0, 11);
local suspension(i) = local x = s.axles[i]; [
  box('trailing_arm_' + i, 'frame', [x - 0.1, s.hub - 0.04, 0.42], [x + 0.55, s.hub + 0.04, 0.5]),
  box('hanger_' + i, 'frame', [x + 0.45, s.hub - 0.1, 0.4], [x + 0.57, s.frameLow, 0.52]),
  box('air_spring_' + i, 'rubber', [x - 0.2, s.hub + 0.04, 0.38], [x + 0.02, s.frameLow, 0.54]),
];
[
  k.compound('semi_trailer_chassis', 3790,
    [box('cross_' + i, 'frame', [-6.3 + 0.9 * i - 0.04, 1.2, -1.24], [-6.3 + 0.9 * i + 0.04, s.frameHigh, 1.24]) for i in crossIds]
    + [
      box('rear_sill', 'frame', [s.rear, 1.1, -1.24], [s.rear + 0.1, s.floor, 1.24]),
      box('coupler_plate', 'frame', [4.2, s.frameLow - 0.02, -s.side + 0.03], [s.front, s.frameHigh, s.side - 0.03]),
      box('leg_cross', 'frame', [s.legX - 0.08, s.frameLow, -1.0], [s.legX + 0.08, s.frameHigh, 1.0]),
      box('brace_cross', 'frame', [s.legX - 0.94, s.frameLow, -1.0], [s.legX - 0.74, s.frameHigh, 1.0]),
      box('leg_tie', 'frame', [s.legX - 0.02, 0.68, -s.legZ], [s.legX + 0.02, 0.72, s.legZ]),
    ]
    + bothSides([box('main_rail', 'frame', [s.rear, s.frameLow, 0.4], [s.front, s.frameHigh, 0.52])]
                + std.flattenArrays([suspension(i) for i in axleIds])),
    { frame: s.frame, rubber: 'rubber-black' }),
  k.compound('semi_trailer_floor', 400, [
    box('deck', 'wood', [s.rear, s.frameHigh, -1.24], [s.front, s.floor, 1.24]),
  ], { wood: 'wood-oak' }),
  k.compound('semi_trailer_side', 350,
    [
      box('skin', 'paint', [s.rear + 0.04, s.frameHigh, s.side - 0.03], [s.front, s.roof - 0.06, s.side]),
      box('band', 'band', [s.rear + 0.1, s.bandLow, s.side], [s.front - 0.08, s.bandHigh, s.side + 0.03]),
      box('bottom_rail', 'trim', [s.rear, 1.2, s.side - 0.05], [s.front, 1.42, s.side + 0.05]),
      box('top_rail', 'trim', [s.rear, s.roof - 0.16, s.side - 0.05], [s.front, s.roof - 0.04, s.side + 0.05]),
      box('rear_post', 'trim', [s.rear - 0.02, 1.2, s.side - 0.1], [s.rear + 0.1, s.roof - 0.06, s.side + 0.06]),
      box('front_post', 'trim', [s.front - 0.08, 1.2, s.side - 0.1], [s.front + 0.02, s.roof - 0.06, s.side + 0.06]),
    ]
    + [box('rib_' + i, 'trim', [-6.0 + 1.2 * i - 0.03, 1.42, s.side], [-6.0 + 1.2 * i + 0.03, s.roof - 0.16, s.side + 0.06]) for i in std.range(0, 10)],
    { paint: s.paint, band: s.band, trim: s.trim }),
  k.compound('semi_trailer_roof', 200, [
    box('skin', 'trim', [s.rear, s.roof - 0.06, -s.side - 0.02], [s.front, s.roof, s.side + 0.02]),
    box('rear_header', 'trim', [s.rear - 0.02, s.roof - 0.18, -s.side], [s.rear + 0.1, s.roof - 0.06, s.side]),
  ] + [box('bow_' + i, 'trim', [-6.0 + 1.2 * i - 0.06, s.roof, -s.side + 0.1], [-6.0 + 1.2 * i + 0.06, s.roof + 0.02, s.side - 0.1]) for i in std.range(0, 10)],
  { trim: s.trim }),
  k.compound('semi_trailer_front_wall', 150, [
    box('skin', 'paint', [s.front - 0.04, s.frameHigh, -s.side + 0.08], [s.front, s.roof - 0.06, s.side - 0.08]),
    box('band', 'band', [s.front, s.bandLow, -s.side + 0.08], [s.front + 0.03, s.bandHigh, s.side - 0.08]),
    box('air_lines', 'frame', [s.front, 1.46, -0.3], [s.front + 0.06, 1.6, 0.3]),
    box('foot_step', 'frame', [s.front, 1.3, -0.3], [s.front + 0.1, 1.36, 0.3]),
  ], { paint: s.paint, band: s.band, frame: s.frame }),
  // Barn doors hinge on the rear posts and meet on the centre line.
  k.compound('semi_trailer_rear_door', 60, [
    box('skin', 'paint', [s.rear - 0.02, s.floor, 0.02], [s.rear + 0.03, s.roof - 0.18, s.side - 0.1]),
    box('band', 'band', [s.rear - 0.04, s.bandLow, 0.02], [s.rear - 0.02, s.bandHigh, s.side - 0.1]),
    box('lock_bar_inner', 'trim', [s.rear - 0.07, s.floor + 0.03, 0.2], [s.rear - 0.03, s.roof - 0.21, 0.25]),
    box('lock_bar_outer', 'trim', [s.rear - 0.07, s.floor + 0.03, 0.8], [s.rear - 0.03, s.roof - 0.21, 0.85]),
    box('handle_inner', 'frame', [s.rear - 0.08, 2.0, 0.12], [s.rear - 0.04, 2.05, 0.25]),
    box('handle_outer', 'frame', [s.rear - 0.08, 2.0, 0.8], [s.rear - 0.04, 2.05, 0.93]),
  ] + [box('hinge_' + i, 'trim', [s.rear - 0.05, s.floor + 0.25 + 0.7 * i, s.side - 0.2], [s.rear - 0.02, s.floor + 0.33 + 0.7 * i, s.side - 0.08]) for i in std.range(0, 3)],
  { paint: s.paint, band: s.band, trim: s.trim, frame: s.frame },
  { hinge_a: ['skin', [0.5, 0.1, 1]], hinge_b: ['skin', [0.5, 0.9, 1]] }),
  k.compound('semi_trailer_kingpin', 60, [
    box('plate', 'steel', [s.kingpin - 0.6, s.frameLow - 0.06, -0.6], [s.kingpin + 0.6, s.frameLow - 0.02, 0.6]),
    k.turned('pin', 'steel', 'y', k.disc(0.055, s.frameLow - 0.24, s.frameLow - 0.06), [s.kingpin, 0, 0]),
    k.turned('flange', 'steel', 'y', k.disc(0.09, s.frameLow - 0.27, s.frameLow - 0.24), [s.kingpin, 0, 0]),
  ], { steel: 'steel-grey' }),
  // Fits at the foot, so the brace reaches back up to its own cross member.
  k.compound('semi_trailer_landing_leg', 60, [
    box('shoe', 'frame', [-0.17, 0, -0.13], [0.17, 0.06, 0.13]),
    box('inner_tube', 'steel', [-0.05, 0.06, -0.05], [0.05, 0.6, 0.05]),
    box('outer_tube', 'frame', [-0.07, 0.55, -0.07], [0.07, s.frameLow, 0.07]),
    box('gearbox', 'frame', [-0.1, 0.82, -0.1], [0.1, 1.0, 0.1]),
    k.prism('brace', 'frame', [[-0.06, 0.7], [-0.06, 0.8], [-0.76, s.frameLow], [-0.9, s.frameLow]], [-0.03, 0.03]),
  ], { frame: s.frame, steel: 'steel-galvanised' }),
  k.compound('semi_trailer_side_guard', 20, [
    box('rail_low', 'frame', [-0.4, 0.62, s.side - 0.07], [2.5, 0.72, s.side - 0.02]),
    box('rail_high', 'frame', [-0.4, 0.9, s.side - 0.07], [2.5, 1.0, s.side - 0.02]),
    box('post_rear', 'frame', [-0.3, 0.62, s.side - 0.1], [-0.22, 1.3, s.side - 0.05]),
    box('post_mid', 'frame', [1.0, 0.62, s.side - 0.1], [1.08, 1.3, s.side - 0.05]),
    box('post_front', 'frame', [2.3, 0.62, s.side - 0.1], [2.38, 1.3, s.side - 0.05]),
  ], { frame: s.frame }),
  k.compound('semi_trailer_mudguard', 18,
    std.flattenArrays([
      h.arcBand('arc_' + i, 'frame', s.axles[i], s.hub, 0.55, 0.58, 12, 168, 8, [s.wheelZ - 0.18, s.wheelZ + 0.2])
      + [box('strut_' + i, 'frame', [s.axles[i] - 0.05, s.hub + 0.56, s.wheelZ - 0.12], [s.axles[i] + 0.05, s.frameHigh, s.wheelZ + 0.1])]
      for i in axleIds
    ]), { frame: s.frame }),
  k.compound('semi_trailer_underrun', 40, [
    box('bar', 'frame', [s.rear + 0.02, 0.48, -1.2], [s.rear + 0.14, 0.6, 1.2]),
    box('stripe', 'reflector', [s.rear + 0.0, 0.5, -1.15], [s.rear + 0.02, 0.58, 1.15]),
  ] + bothSides([box('strut', 'frame', [s.rear + 0.06, 0.6, 0.42], [s.rear + 0.16, s.frameLow, 0.5])]),
  { frame: s.frame, reflector: 'reflective-yellow' }),
]
