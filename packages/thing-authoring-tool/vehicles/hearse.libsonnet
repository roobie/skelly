local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local box = k.box;
local prism = k.prism;
local s = import 'hearse.spec.libsonnet';
local shape = (import 'car-shape.libsonnet')(s);
local lean = shape.tumble;
local deckTop = 0.6;
local deckFront = s.bRear - 0.18;
local deckRear = s.tailWaist;
local windowTop = s.roof - 0.03;
local coachTop = s.roof + 0.26;
local panelIn = s.glassOut - 0.03;
local panelOut = s.glassOut + 0.02;
// The tailgate's rake, followed by every piece stacked on the tail.
local rake(y) = s.tailWaist + s.dLean * (y - s.waist) / (s.roof - s.waist);
local nose = s.front - 0.075;
local hoodNose = s.hoodBack - (nose - s.aPost) * s.hoodFall;
local vane = 0.0625;
local pleat = 0.0625;
local drape(id, from, count) = [
  box(id + '_' + i, if i % 2 == 0 then 'cloth' else 'fold', [from + i * pleat, s.waist, s.skin - 0.04 - (i % 2) * 0.03 - lean], [from + (i + 1) * pleat, windowTop, s.skin - 0.01 - lean])
  for i in std.range(0, count - 1)
];
local landauX(t) = -2.42 + t * 0.96;
local landauY(t) = 1.25 + 0.14 * std.sin(t * 2 * std.pi);
local landauSteps = 8;
local landauOut(y) = panelOut - shape.inset(y);
local tailProfile(low, high) = [[rake(low), low], [rake(low) + 0.03, low], [rake(high) + 0.03, high], [rake(high), high]];
local tailPanel(id, slot, low, high, half) = shape.across(id, slot, tailProfile(low, high), half);
local glassLow = s.waist + 0.06;
local glassHigh = s.roof - 0.06;
local glassHalf = 0.26;
std.filter(function(row) row.id != 'hearse_tailgate', (import 'car-body.libsonnet')('hearse', s)) + [
  // The narrow rear glass, in a blind tail: a real hearse opens by the whole tail, so the hinge stays at its head.
  k.compound('hearse_tailgate', 22, [
    box('skin', 'paint', [s.rear + 0.05, 0.62, -s.hatchSide], [s.tailWaist, s.waist, s.hatchSide]),
    box('handle', 'bright', [s.rear + 0.03, s.rearSill + 0.13, -0.16], [s.rear + 0.05, s.rearSill + 0.18, 0.16]),
  ] + tailPanel('foot', 'paint', s.waist, glassLow, s.hatchSide - 0.02)
  + tailPanel('head', 'paint', glassHigh, s.roof, s.hatchSide - 0.02)
  + [prism('glass', 'glass', tailProfile(glassLow, glassHigh), [-glassHalf, glassHalf])]
  + k.bothSides(
    shape.band('blind', 'paint', tailProfile(glassLow, glassHigh), function(inset) [glassHalf + 0.03, s.hatchSide - 0.02 - inset])
    + [prism('frame', 'bright', tailProfile(glassLow, glassHigh), [glassHalf, glassHalf + 0.03])]
  ), { paint: s.paint, glass: 'glass-clear', bright: 'steel-bright' }, { hinge_a: [shape.top('head'), [1, 1, 1]], hinge_b: [shape.top('head'), [1, 1, 0]] }),
  // The raised blind rear body: a roof that steps up behind the cab, solid quarters over the shell's glass and the bars across them.
  k.compound('hearse_coach', 90, [
    prism('roof', 'cover', [[rake(s.roof + 0.04), s.roof + 0.04], [0.14, s.roof + 0.04], [-0.26, coachTop], [rake(coachTop), coachTop]], [lean - panelOut, panelOut - lean]),
  ] + k.bothSides(
    shape.side('quarter', 'cover', [[rake(s.waist) + 0.08, s.waist], [s.cWaist, s.waist], [s.cWaist, windowTop], [rake(windowTop) + 0.08, windowTop]], [panelIn, panelOut])
    + shape.side('cantle', 'cover', [[rake(windowTop), windowTop], [s.bRear, windowTop], [s.bRear, s.roof + 0.04], [rake(s.roof + 0.04), s.roof + 0.04]], [panelIn, panelOut])
    + shape.side('window_post', 'bright', [[s.cWaist - 0.03, s.waist], [s.cWaist, s.waist], [s.cWaist, windowTop], [s.cWaist - 0.03, windowTop]], [panelOut, panelOut + 0.02])
    + [
      box('drip', 'bright', [rake(windowTop), windowTop - 0.03, panelOut - lean], [s.bRear, windowTop, panelOut + 0.02 - lean]),
      box('landau_foot', 'bright', [landauX(0) - 0.04, landauY(0) - 0.04, landauOut(landauY(0))], [landauX(0) + 0.04, landauY(0) + 0.04, landauOut(landauY(0)) + 0.025]),
      box('landau_head', 'bright', [landauX(1) - 0.04, landauY(1) - 0.04, landauOut(landauY(1))], [landauX(1) + 0.04, landauY(1) + 0.04, landauOut(landauY(1)) + 0.025]),
    ] + [
      m.bar('landau_' + i, 'bright', [landauX(i / landauSteps), landauY(i / landauSteps)], [landauX((i + 1) / landauSteps), landauY((i + 1) / landauSteps)], 0.0625, [landauOut(landauY(i / landauSteps)), landauOut(landauY(i / landauSteps)) + 0.025])
      for i in std.range(0, landauSteps - 1)
    ]
  ), { cover: 'vinyl-black', bright: 'steel-bright' }),
  k.compound('hearse_curtains', 8, k.bothSides(
    drape('rear_drape', s.cWaist, 5) + drape('front_drape', s.bRear - 5 * pleat, 5) + [
      box('valance', 'cloth', [s.cWaist, windowTop - 0.1, s.skin - 0.05 - lean], [s.bRear, windowTop, s.skin - 0.01 - lean]),
    ]
  ), { cloth: 'cloth-cream', fold: 'cloth-heather-grey' }),
  k.compound('hearse_grille', 9, [
    box('head', 'bright', [nose, hoodNose - 0.03, -0.42], [nose + 0.075, hoodNose + 0.02, 0.42]),
    box('foot', 'bright', [nose, 0.53, -0.42], [nose + 0.075, 0.57, 0.42]),
    box('backing', 'dark', [nose, 0.57, -0.38], [nose + 0.05, hoodNose - 0.03, 0.38]),
  ] + k.bothSides([
    box('cheek', 'bright', [nose, 0.53, 0.38], [nose + 0.075, hoodNose + 0.02, 0.42]),
  ]) + [
    box('vane_' + i, 'bright', [nose + 0.04, 0.57, -0.375 + 2 * i * vane], [nose + 0.07, hoodNose - 0.03, -0.375 + (2 * i + 1) * vane])
    for i in std.range(0, 6)
  ], { bright: 'steel-bright', dark: 'plastic-black' }),
  // A load floor's cargo face is its highest point, so the slats and rollers finish level and the rails stand in their own part.
  k.compound('hearse_deck', 45, [
    box('bed', 'deck', [deckRear, 0.48, -0.72], [deckFront, deckTop - 0.03, 0.72]),
    box('slat_tail', 'deck', [deckRear, deckTop - 0.03, -0.72], [deckRear + 0.2, deckTop, 0.72]),
  ] + [
    box('roller_' + i, 'rail', [deckRear + 0.2 + i * 0.4, deckTop - 0.03, -0.72], [deckRear + 0.26 + i * 0.4, deckTop, 0.72])
    for i in std.range(0, 4)
  ] + [
    box('slat_' + i, 'deck', [deckRear + 0.26 + i * 0.4, deckTop - 0.03, -0.72], [std.min(deckRear + 0.6 + i * 0.4, deckFront), deckTop, 0.72])
    for i in std.range(0, 4)
  ] + [
    box('slat_front', 'deck', [deckRear + 2.26, deckTop - 0.03, -0.72], [deckFront, deckTop, 0.72]),
  ], { deck: 'plastic-black', rail: 'steel-stainless' }),
  k.compound('hearse_partition', 30, [
    box('partition', 'wall', [deckFront, s.floor, -s.skin + 0.04], [deckFront + 0.05, s.waist, s.skin - 0.04]),
  ] + shape.across('partition_head', 'wall', [[deckFront, s.waist], [deckFront + 0.05, s.waist], [deckFront + 0.05, s.roof - 0.02], [deckFront, s.roof - 0.02]], s.skin - 0.04) + k.bothSides([
    box('rail', 'rail', [deckRear + 0.05, deckTop, 0.3], [deckFront - 0.08, deckTop + 0.06, 0.36]),
    box('stop', 'rail', [deckFront - 0.08, deckTop, 0.24], [deckFront - 0.04, deckTop + 0.1, 0.38]),
  ]), { wall: 'plastic-black', rail: 'steel-stainless' }),
  k.compound('hearse_brightwork', 3, k.bothSides([
    box('rear_belt', 'bright', [s.rear + 0.12, s.waist - 0.03, s.side - 0.02], [s.bRear, s.waist, s.side + 0.03]),
    box('front_belt', 'bright', [s.bFront, s.waist - 0.03, s.side - 0.02], [s.cowl, s.waist, s.side + 0.03]),
  ]), { bright: 'steel-bright' }),
]
