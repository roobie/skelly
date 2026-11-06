local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'small_tractor.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
[
  k.compound('small_tractor_chassis', s.shellMass, [
    box('transmission', 'cast', [s.rear, 0.42, -0.24], [0.6, s.deck, 0.24]),
    box('engine_cradle', 'cast', [0.6, 0.46, -0.22], [1.0, 0.66, 0.22]),
    box('front_bolster', 'cast', [0.95, 0.44, -0.2], [s.nose, 0.66, 0.2]),
    box('seat_riser', 'cast', [-0.9, s.deck, -0.24], [-0.4, s.deck + 0.06, 0.24]),
    box('bar_mount', 'cast', [s.barX - 0.06, 0.75, -s.barZ - 0.04], [s.barX + 0.08, s.deck, s.barZ + 0.04]),
    box('console', 'cast', [0.03, s.deck, -0.14], [0.3, 1.3, 0.14]),
    box('column', 'cast', [0.05, 1.25, -0.03], [0.1, 1.42, 0.03]),
    box('pto_stub', 'cast', [s.rear - 0.12, 0.5, -0.04], [s.rear, 0.58, 0.04]),
  ] + bothSides([
    box('lift_arm', 'cast', [s.rear - 0.34, 0.4, 0.18], [s.rear, 0.46, 0.22]),
    box('lift_link', 'cast', [s.rear - 0.26, 0.44, 0.19], [s.rear - 0.22, 0.82, 0.22]),
    box('rocker', 'cast', [s.rear - 0.26, 0.8, 0.14], [s.rear + 0.02, 0.86, 0.22]),
  ]), { cast: 'paint-charcoal' }),
  k.compound('small_tractor_bonnet', 26, [
    prism('top', 'paint', [[s.bonnetBack, s.bonnetTop - 0.05], [s.nose, s.bonnetNose - 0.05], [s.nose, s.bonnetNose], [s.bonnetBack, s.bonnetTop]], [-s.bonnetSide, s.bonnetSide]),
    box('grille', 'trim', [s.nose - 0.04, s.bonnetSkirt, -s.bonnetSide + 0.02], [s.nose + 0.01, s.bonnetNose - 0.05, s.bonnetSide - 0.02]),
    box('nose_bar', 'paint', [s.nose - 0.02, 0.8, -s.bonnetSide], [s.nose + 0.02, 0.84, s.bonnetSide]),
  ] + bothSides([
    prism('side', 'paint', [[s.bonnetBack, s.bonnetSkirt], [s.nose, s.bonnetSkirt], [s.nose, s.bonnetNose - 0.04], [s.bonnetBack, s.bonnetTop - 0.04]], [s.bonnetSide - 0.03, s.bonnetSide]),
    box('vent_a', 'trim', [0.6, 1.0, s.bonnetSide], [1.3, 1.03, s.bonnetSide + 0.01]),
    box('vent_b', 'trim', [0.6, 0.92, s.bonnetSide], [1.3, 0.95, s.bonnetSide + 0.01]),
  ]), { paint: s.paint, trim: 'paint-charcoal' }),
  // Its plate closes the gap down to the transmission, so the arc rests on something.
  k.compound('small_tractor_fender', 14,
    h.arcBand('arc', 'paint', s.rearAxle, s.rearHub, s.fenderInner, s.fenderOuter, 22, 168, 9, [s.fenderZ, s.rearZ + 0.16])
    + h.arcBand('plate', 'paint', s.rearAxle, s.rearHub, 0.2, s.fenderInner, 22, 168, 9, [s.fenderZ, s.fenderZ + 0.02])
    + [box('bracket', 'trim', [s.rearAxle - 0.2, 0.8, 0.24], [s.rearAxle + 0.4, s.deck, s.fenderZ])],
    { paint: s.paint, trim: 'paint-charcoal' }),
  // The footboard is the way aboard an open tractor: it folds up about its inner edge for transport.
  k.compound('small_tractor_footboard', 9, [
    box('board', 'tread', [-0.18, 0.56, 0.24], [0.47, 0.6, 0.58]),
    box('step', 'tread', [0.0, 0.36, 0.5], [0.3, 0.39, 0.62]),
    box('hanger', 'tread', [0.12, 0.38, 0.54], [0.16, 0.56, 0.58]),
  ], { tread: 'paint-charcoal' }, { hinge_a: ['board', [0.2, 0.5, 0]], hinge_b: ['board', [0.8, 0.5, 0]] }),
  k.compound('small_tractor_roll_bar', 22, [
    box('top_bar', 'frame', [s.barX - 0.04, s.barTop - 0.08, -s.barZ - 0.04], [s.barX + 0.04, s.barTop, s.barZ + 0.04]),
    box('mid_bar', 'frame', [s.barX - 0.03, 1.2, -s.barZ], [s.barX + 0.03, 1.26, s.barZ]),
  ] + bothSides([
    box('post', 'frame', [s.barX - 0.04, s.deck, s.barZ - 0.04], [s.barX + 0.04, s.barTop, s.barZ + 0.04]),
  ]), { frame: 'paint-charcoal' }),
  // Narrower than a road axle: a compact's front wheels sit close under the bonnet.
  k.compound('small_tractor_front_axle', 40, [
    box('beam', 'cast', [-0.05, s.frontHub - 0.05, -s.frontZ + 0.09], [0.05, s.frontHub + 0.05, s.frontZ - 0.09]),
    box('pivot', 'cast', [-0.1, s.frontHub + 0.05, -0.1], [0.1, 0.44, 0.1]),
  ] + bothSides([
    box('king_pin', 'cast', [-0.04, s.frontHub - 0.08, s.frontZ - 0.12], [0.04, s.frontHub + 0.08, s.frontZ - 0.07]),
  ]), { cast: 'iron-cast' }),
]
