local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'log_trailer.spec.libsonnet';
local box = k.box;
local bothSides = k.bothSides;
[
  k.compound('log_trailer_chassis', 1900,
    [
      box('rear_beam', 'frame', [s.rear, s.frameLow, -1.1], [s.rear + 0.12, s.frameHigh, 1.1]),
      box('front_beam', 'frame', [s.front - 0.12, s.frameLow, -1.06], [s.front, s.frameHigh, 1.06]),
      box('drawbar_brace', 'frame', [s.front + 0.55, s.drawLow, -0.36], [s.front + 0.67, s.drawHigh, 0.36]),
      box('tank_cross', 'frame', [1.5, 0.85, -0.85], [1.6, s.frameHigh, 0.85]),
      box('underrun', 'frame', [s.rear, 0.46, -1.1], [s.rear + 0.1, 0.56, 1.1]),
      box('reflector', 'reflector', [s.rear - 0.02, 0.48, -1.05], [s.rear, 0.54, 1.05]),
      box('eye_plate', 'dark', [s.tip - 0.14, s.drawLow, -0.09], [s.tip, s.drawHigh, 0.09]),
      k.turned('towing_eye', 'steel', 'y', k.annulus(0.05, 0.11, s.drawLow + 0.04, s.drawHigh - 0.04), [s.tip + 0.09, 0, 0]) + { sides: 12 },
    ]
    + [box('axle_cross_' + i, 'frame', [s.axles[i] - 0.05, 0.85, -1.06], [s.axles[i] + 0.05, s.frameHigh, 1.06]) for i in [0, 1]]
    + bothSides([
      box('main_rail', 'frame', [s.rear, s.frameLow, 0.35], [s.front, s.frameHigh, 0.47]),
      box('walking_beam', 'dark', [s.axles[0] - 0.12, s.hub - 0.05, 0.48], [s.axles[1] + 0.12, s.hub + 0.05, 0.58]),
      box('pivot_hanger', 'frame', [s.pivot - 0.12, s.hub - 0.08, 0.4], [s.pivot + 0.12, s.frameLow, 0.58]),
      box('underrun_strut', 'frame', [s.rear + 0.02, 0.56, 0.37], [s.rear + 0.1, s.frameLow, 0.45]),
      k.turned('air_tank', 'steel', 'x', k.disc(0.11, 1.0, 2.0), [0, 0.82, 0.7]),
    ])
    + h.drawbar(s.front, s.drawBack, s.tip, [s.drawLow, s.drawHigh], 0.2, 0.07),
    { frame: s.frame, dark: s.dark, steel: 'steel-galvanised', reflector: 'reflective-yellow' }),
  // A narrow walkway on the bolsters: the timber bears on the bolsters, with the frame open beneath it.
  k.compound('log_trailer_floor', 160, [
    box('walkway', 'wood', [-4.0, s.deckLow, -0.3], [3.28, s.deck, 0.3]),
  ], { wood: 'wood-pine' }),
  k.compound('log_trailer_bolster', 90, [
    box('beam', 'frame', [-0.1, s.frameHigh, -1.2], [0.1, s.deckLow, 1.2]),
  ] + bothSides([box('cap', 'frame', [-0.1, s.deckLow, 0.6], [0.1, s.deck, 1.2])]), { frame: s.frame }),
  // Fits at its foot on the bolster top; the pocket grips the bolster end.
  k.compound('log_trailer_stake', 28, [
    box('pocket', 'dark', [-0.08, -0.06, -0.07], [0.08, 0.22, 0.07]),
    box('post', 'dark', [-0.05, 0.22, -0.05], [0.05, s.stakeHeight, 0.05]),
    box('tip', 'frame', [-0.06, s.stakeHeight, -0.06], [0.06, s.stakeHeight + 0.05, 0.06]),
  ], { dark: s.dark, frame: s.frame }),
  k.compound('log_trailer_headboard', 110,
    [box('bar_' + i, 'frame', [3.3, s.frameHigh + 0.38 * i, -1.0], [3.38, s.frameHigh + 0.1 + 0.38 * i, 1.0]) for i in std.range(0, 4)]
    + [box('centre_post', 'frame', [3.28, s.frameHigh, -0.06], [3.4, 2.72, 0.06])]
    + bothSides([box('post', 'frame', [3.28, s.frameHigh, 0.92], [3.4, 2.72, 1.04])]),
    { frame: s.frame }),
  k.compound('log_trailer_mudguard', 12,
    std.flattenArrays([h.arcBand('arc_' + i, 'dark', s.axles[i], s.hub, 0.46, 0.49, 10, 170, 8, [s.wheelZ - 0.13, s.wheelZ + 0.16]) for i in [0, 1]]),
    { dark: s.dark }),
]
