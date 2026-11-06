local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'tractor.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local door = s.cabFront - 0.75;
local shoulder = 1.68;
local sideGlass = 0.61;
[
  k.compound('tractor_chassis', s.shellMass, [
    box('front_bolster', 'cast', [1.55, 0.52, -0.34], [s.nose, 0.86, 0.34]),
    box('transmission', 'cast', [-1.72, 0.5, -0.36], [0.5, 1.1, 0.36]),
    box('engine_cradle', 'cast', [0.5, 0.6, -0.3], [1.6, 0.9, 0.3]),
    box('pto_stub', 'cast', [-1.86, 0.62, -0.05], [-1.72, 0.72, 0.05]),
  ] + bothSides([
    box('lift_arm', 'cast', [-2.06, 0.48, 0.28], [-1.68, 0.56, 0.34]),
    box('lift_link', 'cast', [-1.96, 0.54, 0.29], [-1.91, 1.02, 0.33]),
    box('rocker', 'cast', [-1.96, 1.02, 0.1], [-1.5, 1.1, 0.34]),
  ]), { cast: 'paint-charcoal' }),
  k.compound('tractor_bonnet', 48, [
    prism('top', 'paint', [[s.bonnetBack, s.bonnetTop - 0.08], [s.nose, 1.47], [s.nose, 1.55], [s.bonnetBack, s.bonnetTop]], [-s.bonnetSide, s.bonnetSide]),
    box('grille', 'trim', [s.nose - 0.05, 0.88, -s.bonnetSide + 0.02], [s.nose + 0.01, 1.47, s.bonnetSide - 0.02]),
    box('nose_bar', 'paint', [s.nose - 0.02, 1.12, -s.bonnetSide], [s.nose + 0.02, 1.17, s.bonnetSide]),
    box('nose_foot', 'paint', [s.nose - 0.08, 0.86, -s.bonnetSide], [s.nose + 0.02, 0.92, s.bonnetSide]),
  ] + bothSides([
    prism('side', 'paint', [[s.bonnetBack, s.bonnetSkirt], [s.nose, s.bonnetSkirt], [s.nose, 1.48], [s.bonnetBack, s.bonnetTop - 0.07]], [s.bonnetSide - 0.04, s.bonnetSide]),
    box('vent_a', 'trim', [0.5, 1.3, s.bonnetSide], [1.5, 1.34, s.bonnetSide + 0.01]),
    box('vent_b', 'trim', [0.5, 1.38, s.bonnetSide], [1.5, 1.42, s.bonnetSide + 0.01]),
  ]), { paint: s.paint, trim: 'paint-charcoal' }),
  k.compound('tractor_fender', 22, h.arcBand('arc', 'paint', s.rearAxle, s.rearHub, s.fenderInner, s.fenderOuter, 22, 168, 9, [s.cabSide, s.rearZ + 0.26])
    + h.arcBand('lip', 'paint', s.rearAxle, s.rearHub, s.fenderInner - 0.12, s.fenderOuter, 22, 168, 9, [s.rearZ + 0.26, s.rearZ + 0.3]),
    { paint: s.paint }),
  k.compound('tractor_cab', 300, [
    box('floor', 'floor', [s.cabRear, s.deck, -s.cabSide], [s.cabFront, s.deck + 0.05, s.cabSide]),
    box('scuttle', 'paint', [s.cabFront - 0.04, s.deck, -s.cabSide + 0.03], [s.bonnetBack, shoulder, s.cabSide - 0.03]),
    box('dash', 'trim', [s.cabFront - 0.3, shoulder - 0.08, -s.cabSide + 0.05], [s.cabFront - 0.04, shoulder, s.cabSide - 0.05]),
    box('column', 'trim', [s.cabFront - 0.34, 1.15, -0.07], [s.cabFront - 0.04, shoulder - 0.08, 0.07]),
    box('rear_lower', 'paint', [s.cabRear, s.deck, -s.cabSide], [s.cabRear + 0.05, shoulder, s.cabSide]),
    box('rear_rail', 'paint', [s.cabRear, s.roof - 0.1, -s.cabSide], [s.cabRear + 0.05, s.roof, s.cabSide]),
    box('roof_pan', 'paint', [s.cabRear - 0.12, s.roof, -s.cabSide - 0.1], [s.cabFront + 0.14, s.roof + 0.06, s.cabSide + 0.1]),
    box('roof_cap', 'paint', [s.cabRear - 0.02, s.roof + 0.06, -s.cabSide], [s.cabFront + 0.02, s.roof + 0.1, s.cabSide]),
    box('headliner', 'liner', [s.cabRear + 0.05, s.roof - 0.02, -s.cabSide + 0.05], [s.cabFront - 0.05, s.roof, s.cabSide - 0.05]),
    box('front_rail', 'paint', [s.cabFront - 0.04, s.roof - 0.1, -s.cabSide], [s.cabFront + 0.03, s.roof, s.cabSide]),
  ] + bothSides([
    box('front_post', 'paint', [s.cabFront - 0.04, shoulder, s.cabSide - 0.07], [s.cabFront + 0.03, s.roof, s.cabSide]),
    box('rear_post', 'paint', [s.cabRear, s.deck, s.cabSide - 0.07], [s.cabRear + 0.08, s.roof, s.cabSide]),
    box('door_post', 'paint', [door - 0.05, s.deck, s.cabSide - 0.05], [door, s.roof, s.cabSide]),
    box('side_lower', 'paint', [s.cabRear + 0.08, s.deck, s.cabSide - 0.05], [door - 0.05, shoulder, s.cabSide]),
    box('side_rail', 'paint', [s.cabRear, s.roof - 0.08, s.cabSide - 0.05], [s.cabFront + 0.03, s.roof, s.cabSide]),
    box('side_glass', 'glass', [s.cabRear + 0.08, shoulder, sideGlass], [door - 0.05, s.roof - 0.08, sideGlass + 0.02]),
    box('step_hanger', 'trim', [-0.34, 0.66, s.cabSide - 0.05], [-0.3, s.deck, s.cabSide]),
    box('step', 'trim', [-0.38, 0.62, s.cabSide - 0.08], [-0.08, 0.68, s.cabSide + 0.12]),
    box('sill', 'trim', [door, s.deck - 0.03, s.cabSide - 0.08], [s.cabFront, s.deck + 0.03, s.cabSide + 0.02]),
  ]), { paint: s.paint, trim: 'paint-charcoal', floor: 'rubber-black', liner: 'cloth-rag', glass: 'glass-clear' }),
  k.compound('tractor_cab_door', 30, [
    box('skin', 'paint', [door + 0.02, s.deck + 0.03, s.cabSide - 0.04], [s.cabFront - 0.04, shoulder, s.cabSide]),
    box('top', 'paint', [door + 0.02, s.roof - 0.13, s.cabSide - 0.04], [s.cabFront - 0.04, s.roof - 0.08, s.cabSide]),
    box('glass', 'glass', [door + 0.02, shoulder, sideGlass], [s.cabFront - 0.04, s.roof - 0.13, sideGlass + 0.02]),
    box('handle', 'trim', [door + 0.06, shoulder - 0.1, s.cabSide], [door + 0.2, shoulder - 0.06, s.cabSide + 0.02]),
  ], { paint: s.paint, trim: 'plastic-black', glass: 'glass-clear' }, {
    hinge_a: ['skin', [1, 0.2, 1]],
    hinge_b: ['skin', [1, 0.8, 1]],
  }),
  k.compound('tractor_windscreen', 14, [
    box('glass', 'glass', [s.cabFront - 0.02, shoulder, -s.cabSide + 0.07], [s.cabFront + 0.01, s.roof - 0.1, s.cabSide - 0.07]),
  ], { glass: 'glass-clear' }),
  k.compound('tractor_rear_window', 9, [
    box('glass', 'glass', [s.cabRear + 0.01, shoulder, -s.cabSide + 0.07], [s.cabRear + 0.04, s.roof - 0.1, s.cabSide - 0.07]),
  ], { glass: 'glass-clear' }),
  k.compound('tractor_front_pivot', 40, [
    box('bracket', 'cast', [0.98, 0.44, -0.16], [1.32, 0.62, 0.16]),
    k.turned('pin', 'cast', 'x', k.disc(0.05, 0.9, 1.4), [0, 0.5, 0]),
  ], { cast: 'iron-cast' }),
  k.compound('tractor_front_weight', 160, [
    box('block', 'cast', [s.nose + 0.02, 0.56, -0.44], [s.nose + 0.2, 0.86, 0.44]),
    box('lift_eye', 'cast', [s.nose + 0.07, 0.86, -0.04], [s.nose + 0.15, 0.94, 0.04]),
  ], { cast: 'iron-cast' }),
]
