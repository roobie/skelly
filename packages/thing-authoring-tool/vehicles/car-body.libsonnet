// Welded-shell car panels from one measurement spec, so a new car body differs by its measures and each part
// stays pressed for its body and fitted at the vehicle origin. `s.boot` gives a fixed rear screen and a boot lid
// in place of a tailgate; `s.twoDoor` drops the rear doors, so a long front door and a fixed quarter light stand
// ahead of a solid rear quarter. `s.rearDoorFront` stops the rear door short of the B-pillar, for a stretch section
// its own vehicle presses between them. `s.sideGlass` tints all but the windscreen. `s.open` leaves a windscreen and its header over a waist-high body, side glass wound down, for a hood its own vehicle presses. `s.cab` ends the body at a back wall at `s.tailWaist`, for a load bed that its
// own vehicle presses behind it. `s.lift` raises everything the measures do not name, for a tall body.
local k = import 'kit.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local carShape = import 'car-shape.libsonnet';
function(id, s) {
  local shape = carShape(s),
  local lean = shape.tumble,
  local grain = shape.grain,
  local roofHalf = s.glassOut - 0.09 - lean,
  local hood(x) = s.hoodBack - (x - s.aPost) * s.hoodFall,
  local nose = s.front - 0.075,
  local bonnetThick = 0.0625,
  // One whole grain under the bonnet top: voxelised level with it, the two tops fight along the nose.
  local noseShut = (std.round(hood(nose) / grain) - 1) * grain,
  local roofRear = s.tailWaist + s.dLean,
  local roofFront = s.aPost - s.aLean,
  local open = std.get(s, 'open', false),
  local windowTop = if open then s.waist + 0.06 else s.roof - 0.03,
  local pillarBack = if open then s.cowl - 0.04 else s.cowl - 0.14,
  local roofBack = if open then pillarBack - s.aLean else roofRear,
  local twoDoor = std.get(s, 'twoDoor', false),
  local boot = std.get(s, 'boot', false),
  local cab = std.get(s, 'cab', false),
  local lift = std.get(s, 'lift', 0),
  local grille = std.get(s, 'grilleHalf', 0.42),
  // `s.blankNose` closes the grille in body paint for a car with no radiator to feed; `s.grilleShut` closes that fraction
  // of it from the top. `s.noseAccent` runs a coloured strip along where the closure meets the opening.
  local blankNose = std.get(s, 'blankNose', false),
  local accent = std.get(s, 'noseAccent', null),
  local grilleLow = std.get(s, 'grilleLow', 0.58 + lift),
  local grilleTop = noseShut,
  local grilleSplit = if blankNose then (grilleLow + grilleTop) / 2 else grilleTop - std.get(s, 'grilleShut', 0) * (grilleTop - grilleLow),
  local slam = std.get(s, 'slamHalf', 0.6),
  local slamTop = std.get(s, 'slamTop', 0.8 + lift),
  local rail = std.get(s, 'railHalf', 0.55),
  local bumperLow = std.get(s, 'bumperLow', 0.3) + lift,
  local bumperTop = std.get(s, 'bumperTop', 0.55) + lift,
  local tailTop = if boot then s.deck else s.waist,
  local bumperPaint = std.get(s, 'bumperPaint', s.paint),
  local barHalf = std.get(s, 'barHalf', s.side - 0.03),
  local doorPaint = std.get(s, 'doorPaint', s.paint),
  local stripe = std.get(s, 'stripe', null),
  local roofPaint = std.get(s, 'roofPaint', null),
  local rearDoorFront = std.get(s, 'rearDoorFront', s.bRear),
  local stripes(top, from, to) = if stripe == null then [] else [
    box('stripe_' + from, 'stripe', [from, top, 0.09], [to, top + 0.012, 0.27]),
    box('stripe_' + from + '_far', 'stripe', [from, top, -0.27], [to, top + 0.012, -0.09]),
  ],
  local sideGlass = std.get(s, 'sideGlass', 'glass-clear'),
  local paint = { paint: s.paint, trim: 'plastic-black', glass: sideGlass },
  local bumperFinish = paint + { paint: bumperPaint },
  local doorFinish = paint + { paint: doorPaint },
  local rearPanelTop = s.rearSill,
  local floorBack = if boot then s.rear + 0.1 else s.tailWaist,
  // Closes the arch fore and aft, because a look down past the wheel otherwise leaves through the open underside of the wing.
  local archEnds(name, axle) = [
    box(name + '_liner_fore', 'trim', [axle + s.arch, 0.2 + lift, s.skin - 0.26], [axle + s.arch + 0.04, s.archTop - shape.chamfer + 0.0625, s.skin]),
    box(name + '_liner_aft', 'trim', [axle - s.arch - 0.04, 0.2 + lift, s.skin - 0.26], [axle - s.arch, s.archTop - shape.chamfer + 0.0625, s.skin]),
  ],
  local archLiner(name, axle) = shape.liner(name + '_liner', 'trim', axle, 0.2 + lift, [s.skin - 0.26, s.skin], [s.skin - 0.26, s.skin - 0.22]) + archEnds(name, axle),
  // Door and quarter glass stand two voxels thick: a thinner pane falls between cells where its bands step in.
  local paneZ = [s.skin + 0.01 - 2 * grain, s.skin + 0.01],
  // The rear arch's forward corner rides on the rear door wherever the door reaches over the arch.
  local hasDoorCorner = !twoDoor && s.rearDoor < s.rearDoorArch,
  local rows = [
    k.compound(id + '_shell', s.shellMass, [
      box('floor_pan', 'pan', [s.rearFloorFront, 0.2 + lift, -s.skin], [s.cowl, s.floor, s.skin]),
      box('carpet', 'carpet', [s.rearFloorFront, s.floor, -s.skin + 0.04], [s.cowl, s.floor + 0.01, s.skin - 0.04]),
      box('tunnel', 'carpet', [s.rearFloorFront + 0.35, s.floor, -0.12], [s.cowl, 0.45 + lift, 0.12]),
    ] + (if cab then [] else [
      box('rear_floor', 'pan', [floorBack, 0.38 + lift, -s.skin], [s.rearFloorFront, 0.48 + lift, s.skin]),
    ]) + [
      box('bulkhead', 'paint', [s.cowl, s.floor, -s.skin + 0.02], [s.aPost, s.waist - 0.04, s.skin - 0.02]),
      box('slam_panel', 'paint', [nose - 0.05, 0.35 + lift, -slam], [nose, slamTop, slam]),
    ] + (if noseShut > slamTop then [
      box('slam_header', 'paint', [nose - 0.05, slamTop, -s.skin], [nose, noseShut, s.skin]),
    ] else []) + (if slam < s.skin then bothSides([
      // The wing nose is only a skin, so without this return the slot beside the slam panel shows daylight.
      box('nose_return', 'paint', [nose - 0.05, 0.35 + lift, slam], [nose, noseShut, s.skin]),
    ]) else []) + (if cab then [
      box('back_wall', 'paint', [s.tailWaist, s.floor - 0.1, -s.skin], [s.tailWaist + 0.05, s.waist, s.skin]),
    ] + shape.across('back_header', 'paint', [[s.tailWaist, s.roof - 0.1], [s.tailWaist + 0.05, s.roof - 0.1], [s.tailWaist + 0.05, s.roof], [s.tailWaist, s.roof]], s.skin) + shape.across('back_glass', 'glass', [[s.tailWaist + 0.01, s.waist], [s.tailWaist + 0.04, s.waist], [s.tailWaist + 0.04, s.roof - 0.1], [s.tailWaist + 0.01, s.roof - 0.1]], s.glassIn + 0.01) + [
    ] else [
      box('rear_panel', 'paint', [if boot then s.rear + 0.03 else s.rear + 0.02, 0.45 + lift, -s.skin], [floorBack, if boot then 0.62 + lift else rearPanelTop, s.skin]),
    ]) + [
      box('roof', if roofPaint == null then 'paint' else 'roof_paint', [roofBack, s.roof, -roofHalf], [roofFront, s.roof + 0.04, roofHalf]),
    ] + (if open then [] else [
      box('headliner', 'headliner', [roofRear + 0.1, s.roof - 0.02, -roofHalf + 0.02], [roofFront - 0.1, s.roof, roofHalf - 0.02]),
    ]) + stripes(s.roof + 0.03, roofBack, roofFront) + (if boot && !open then
      shape.across('rear_screen', 'glass', [[roofRear + grain + 0.08, s.roof], [roofRear + grain, s.roof], [s.deckFront + grain, s.waist], [s.deckFront + grain + 0.08, s.waist]], s.glassIn)
    else []) + bothSides([
      box('sill', 'paint', [s.rearDoorArch, s.sill, s.skin - 0.02], [s.aPost, s.floor, s.side]),
      box('chassis_leg', 'pan', [s.aPost, s.floor, rail], [nose, 0.42 + lift, std.get(s, 'legOuter', 0.62)]),
      box('strut_tower', 'paint', [s.aPost + 0.05, 0.42 + lift, rail], [s.frontAxle + 0.45, std.get(s, 'towerTop', s.waist - 0.12), std.get(s, 'towerOuter', 0.6)]),
      box('a_post', 'paint', [s.cowl, s.floor, s.skin - 0.02], [s.aPost, s.waist, s.side]),
      box('b_pillar', 'paint', [s.bRear, s.floor, s.skin - 0.02], [s.bFront, s.waist, s.glassOut + 0.02]),
    ] + shape.side('a_pillar', 'paint', [[pillarBack, s.waist], [s.aPost, s.waist], [s.aPost - s.aLean, s.roof], [pillarBack - s.aLean, s.roof]], [s.glassIn - 0.02, s.glassOut])
    + shape.side('b_pillar_head', 'paint', [[s.bRear, s.waist], [s.bFront, s.waist], [s.bFront, if open then windowTop else s.roof - 0.02], [s.bRear, if open then windowTop else s.roof - 0.02]], [s.skin - 0.02, s.glassOut + 0.02])
    + (if open then [] else [
      box('cant_rail', 'paint', [roofRear, s.roof - 0.04, roofHalf - 0.01], [roofFront, s.roof + 0.02, s.glassOut - lean]),
    ]) + (if cab then [
      box('cab_corner', 'paint', [s.tailWaist, s.floor - 0.1, s.skin - 0.02], [s.rearDoorArch, s.waist, s.side]),
    ] + shape.side('c_pillar', 'paint', [[s.tailWaist, s.waist], [s.cWaist, s.waist], [s.cWaist + s.cLean, s.roof], [s.tailWaist, s.roof]], [s.glassIn, s.glassOut]) else [
      box('quarter_rear', 'paint', [s.rear + 0.1, std.min(s.floor, bumperLow - 0.06), s.skin], [s.rearAxle - s.arch, tailTop, s.side]),
      // The lamp's corner, closed round the lens, so the tail reads square from the side and from above.
      box('tail_over', 'paint', [s.rear + 0.04, s.lampTop, s.hatchSide], [if boot then s.rear + 0.1 else std.max(s.rear + 0.1, std.min(s.tailWaist, s.rear + 0.2)), if boot then s.deck - 0.03 else tailTop, s.side]),
    ] + (if boot then [
      box('tail_over_edge', 'paint', [s.rear + 0.04, s.deck - 0.03, s.glassIn], [s.rear + 0.1, s.deck, s.side]),
    ] else []) + [
      box('tail_out', 'paint', [s.rear + 0.04, 0.62 + lift, s.skin + 0.04], [s.rear + 0.1, s.lampTop, s.side]),
      box('tail_under', 'paint', [s.rear + 0.04, bumperTop, s.hatchSide], [s.rear + 0.1, 0.62 + lift, s.side]),
      box('quarter_arch', 'paint', [s.rearAxle - s.arch, s.archTop, s.skin], [s.rearDoor, s.waist, s.side]),
      shape.aftCorner('quarter_corner_aft', 'paint', s.rearAxle, [s.skin, s.side]),
      box('boot_side', 'trim', [floorBack, 0.48 + lift, s.glassIn - 0.04], [s.rearFloorFront, s.waist, s.skin]),
    ]) + (if !cab && !hasDoorCorner then [
      shape.foreCorner('quarter_corner_fore', 'paint', s.rearAxle, [s.skin, s.side]),
    ] else []) + (if std.get(s, 'archLiner', false) then archLiner('front', s.frontAxle) + (if cab then [] else archLiner('rear', s.rearAxle)) else []) + (if twoDoor then [
      box('quarter_door', 'paint', [s.rearDoorArch, s.floor, s.skin], [s.bRear, s.waist, s.side]),
    ] + shape.side('quarter_light', 'glass', [[s.cWaist, s.waist], [s.bRear, s.waist], [s.bRear, windowTop], [s.cWaist + (windowTop - s.waist) * s.cLean / (s.roof - s.waist), windowTop]], paneZ) else []) + (if cab then [] else if boot then (if open then [] else
      shape.side('c_pillar', 'paint', [[s.deckFront, s.waist], [s.cWaist, s.waist], [s.cWaist + s.cLean, s.roof], [roofRear, s.roof]], [s.glassIn, s.glassOut])
    ) + [
      box('deck_side', 'paint', [s.rear + 0.1, s.deck - 0.08, s.glassIn], [s.deckFront, s.deck, s.side]),
    ] else
      shape.side('c_pillar', 'paint', [[s.cWaist - s.cWidth, s.waist], [s.cWaist, s.waist], [s.cWaist + s.cLean, s.roof], [s.cWaist - s.cWidth + s.cLean, s.roof]], [s.glassIn, s.glassOut])
      + (if s.cWaist - s.cWidth > s.tailWaist + 0.08 then
        shape.side('rear_quarter_glass', 'glass', [[s.tailWaist + 0.08, s.waist], [s.cWaist - s.cWidth, s.waist], [s.cWaist - s.cWidth + s.cLean, s.roof], [s.tailWaist + 0.08 + s.dLean, s.roof]], [s.glassOut - 2 * grain, s.glassOut])
      else [])
      + shape.side('d_pillar', 'paint', [[s.tailWaist, s.waist], [s.tailWaist + 0.08, s.waist], [s.tailWaist + 0.08 + s.dLean, s.roof], [s.tailWaist + s.dLean, s.roof]], [s.hatchSide, s.glassOut])
    )), { pan: 'paint-charcoal', paint: s.paint, carpet: 'plastic-black', headliner: 'cloth-rag', trim: 'plastic-black', glass: sideGlass } + (if stripe == null then {} else { stripe: stripe }) + (if roofPaint == null then {} else { roof_paint: roofPaint })),
    // Side doors hinge on their leading edge, with the handle near the trailing one.
    local door(suffix, massKg, lower, glass) = k.compound(id + suffix, massKg, lower + [
      box('trim', 'trim', [glass[0][0] + 0.02, s.floor + 0.02, s.skin - 0.03], [glass[1][0] - 0.02, s.waist - 0.02, s.skin]),
    ] + shape.side('glass', 'glass', glass, paneZ) + [
      box('handle', 'trim', [glass[0][0] + 0.08, s.waist - 0.11, s.side - 0.01], [glass[0][0] + 0.2, s.waist - 0.08, s.side + 0.002]),
    ], doorFinish, {
      hinge_a: ['skin', [1, 0.2, 1]],
      hinge_b: ['skin', [1, 0.8, 1]],
    });
    door('_front_door', if twoDoor then 34 else 25, [
      box('skin', 'paint', [s.bFront, s.floor, s.skin], [s.cowl, s.waist, s.side]),
    ], [[s.bFront, s.waist], [s.cowl, s.waist], [s.cowl - (windowTop - s.waist) * s.aLean / (s.roof - s.waist), windowTop], [s.bFront, windowTop]]),
    k.compound(id + '_windscreen', 12, [
    ] + shape.across('glass', 'glass', [[s.cowl, s.waist], [s.cowl + 0.08, s.waist], [s.cowl + 0.08 - s.aLean, s.roof], [s.cowl - s.aLean, s.roof]], s.glassIn - 0.02), { glass: 'glass-clear' }),
    k.compound(id + '_bonnet', 13, [
      prism('skin', 'paint', [[s.aPost, hood(s.aPost) - bonnetThick], [nose, hood(nose) - bonnetThick], [nose, hood(nose)], [s.aPost, hood(s.aPost)]], [-s.skin, s.skin]),
    ] + (if std.get(s, 'scoop', false) then [
      prism('scoop', 'paint', [[s.frontAxle - 0.45, hood(s.frontAxle - 0.45)], [s.frontAxle + 0.1, hood(s.frontAxle + 0.1)], [s.frontAxle + 0.1, hood(s.frontAxle + 0.1) + 0.08], [s.frontAxle - 0.45, hood(s.frontAxle - 0.45) + 0.05]], [-0.3, 0.3]),
      box('scoop_mouth', 'trim', [s.frontAxle + 0.09, hood(s.frontAxle + 0.1) + 0.015, -0.24], [s.frontAxle + 0.115, hood(s.frontAxle + 0.1) + 0.07, 0.24]),
    ] else []) + (if stripe == null then [] else [
      prism('stripe', 'stripe', [[s.aPost, hood(s.aPost) - 0.005], [nose, hood(nose) - 0.005], [nose, hood(nose) + 0.012], [s.aPost, hood(s.aPost) + 0.012]], [0.09, 0.27]),
      prism('stripe_far', 'stripe', [[s.aPost, hood(s.aPost) - 0.005], [nose, hood(nose) - 0.005], [nose, hood(nose) + 0.012], [s.aPost, hood(s.aPost) + 0.012]], [-0.27, -0.09]),
    ]), { paint: s.paint } + (if std.get(s, 'scoop', false) then { trim: 'plastic-black' } else {}) + (if stripe == null then {} else { stripe: stripe })),
    k.compound(id + '_front_wing', 4, [
      box('rear', 'paint', [s.aPost, s.sill, s.skin], [s.frontAxle - s.arch, hood(s.frontAxle - s.arch), s.side]),
      prism('arch', 'paint', [[s.frontAxle - s.arch, s.archTop], [s.frontAxle + s.arch, s.archTop], [s.frontAxle + s.arch, hood(s.frontAxle + s.arch)], [s.frontAxle - s.arch, hood(s.frontAxle - s.arch)]], [s.skin, s.side]),
      prism('nose', 'paint', [[s.frontAxle + s.arch, 0.35 + lift], [nose, 0.35 + lift], [nose, hood(nose)], [s.frontAxle + s.arch, hood(s.frontAxle + s.arch)]], [s.skin, s.side]),
      shape.aftCorner('corner_aft', 'paint', s.frontAxle, [s.skin, s.side]),
      shape.foreCorner('corner_fore', 'paint', s.frontAxle, [s.skin, s.side]),
    ], { paint: s.paint }),
    k.compound(id + '_front_bumper', 7, [
      box('bar', 'paint', [nose - 0.05, bumperLow, -barHalf], [s.front, bumperTop, barHalf]),
    ] + (if blankNose then [
      box('closing', 'body', [nose - 0.02, grilleLow, -grille], [nose + 0.03, grilleTop, grille]),
    ] else [
      box('grille', 'trim', [nose - 0.02, grilleLow, -grille], [nose + 0.03, grilleSplit, grille]),
    ]) + (if !blankNose && grilleSplit < grilleTop then [
      box('closing', 'body', [nose - 0.02, grilleSplit, -grille], [nose + 0.03, grilleTop, grille]),
    ] else []) + (if accent == null then [] else [
      box('accent', 'accent', [nose + 0.03, grilleSplit - grain, -grille], [nose + 0.03 + grain, grilleSplit, grille]),
    ]) + (if std.get(s, 'grilleBars', false) then [
      box('rail_top', 'body', [nose + 0.03, grilleTop - 0.0625, -grille], [nose + 0.06, grilleTop, grille]),
      box('rail_foot', 'body', [nose + 0.03, grilleLow, -grille], [nose + 0.06, grilleLow + 0.0625, grille]),
    ] + [
      box('slat_' + i, 'body', [nose + 0.03, grilleLow + 0.0625, -grille + i * 0.125], [nose + 0.06, grilleTop - 0.0625, -grille + i * 0.125 + 0.0625])
      for i in std.range(0, std.floor(2 * grille / 0.125))
    ] else []) + (if bumperTop - bumperLow < 0.2 then [] else [
      box('intake', 'trim', [s.front, bumperLow + 0.04, -grille], [s.front + 0.01, bumperLow + 0.14, grille]),
    ]), bumperFinish + { body: s.paint } + (if accent == null then {} else { accent: accent })),
  ] + (if cab then [] else [
    k.compound(id + '_rear_bumper', 6, [
      box('bar', 'paint', [s.rear - std.get(s, 'rearBarProud', 0), bumperLow, -barHalf], [s.rear + 0.13, bumperTop, barHalf]),
    ], bumperFinish),
    k.compound(id + '_tail_lamp', 1, [
      box('lens', 'lens', [s.rear + 0.04, 0.62 + lift, s.hatchSide], [s.rear + 0.11, s.lampTop, s.skin + 0.04]),
    ], { lens: 'plastic-red' }),
  ]) + [
    k.compound(id + '_dashboard', 15, [
      box('lower', 'trim', [s.cowl - 0.15, 0.45 + lift, -s.skin + 0.06], [s.cowl, s.waist - 0.17, s.skin - 0.06]),
      box('top', 'trim', [s.cowl - 0.32, s.waist - 0.17, -s.skin + 0.06], [s.cowl, s.waist - 0.05, s.skin - 0.06]),
      box('console', 'trim', [s.cowl - 0.6, s.floor, -0.1], [s.cowl - 0.15, 0.55 + lift, 0.1]),
      box('column', 'trim', [s.cowl - 0.37, s.waist - 0.23, -0.41], [s.cowl - 0.15, s.waist - 0.15, -0.33]),
    ], { trim: 'plastic-black' }),
  ] + (if twoDoor then [] else [
    k.compound(id + '_rear_door', 21, [
      box('skin', 'paint', [s.rearDoorArch, s.floor, s.skin], [rearDoorFront, s.waist, s.side]),
    ] + (if hasDoorCorner then [
      box('skin_arch', 'paint', [s.rearDoor, s.archTop, s.skin], [s.rearDoorArch, s.waist, s.side]),
      shape.foreCorner('skin_corner', 'paint', s.rearAxle, [s.skin, s.side]),
    ] else []) + [
      box('trim', 'trim', [if std.get(s, 'archLiner', false) then s.rearDoorArch + 0.02 else s.cWaist + 0.02, s.floor + 0.02, s.skin - 0.03], [rearDoorFront - 0.02, s.waist - 0.02, s.skin]),
    ] + shape.side('glass', 'glass', [[s.cWaist, s.waist], [rearDoorFront, s.waist], [rearDoorFront, windowTop], [s.cWaist + (windowTop - s.waist) * s.cLean / (s.roof - s.waist), windowTop]], paneZ) + [
      box('handle', 'trim', [s.cWaist + 0.08, s.waist - 0.11, s.side - 0.01], [s.cWaist + 0.2, s.waist - 0.08, s.side + 0.002]),
    ], doorFinish, { hinge_a: ['skin', [1, 0.2, 1]], hinge_b: ['skin', [1, 0.8, 1]] }),
  ]) + (if cab then [] else if boot then [
    // The lid lifts about its leading edge.
    k.compound(id + '_boot_lid', 12, [
      box('skin', 'paint', [s.rear + 0.04, s.deck - 0.02, -s.glassIn], [s.deckFront, s.deck + 0.02, s.glassIn]),
      box('tail', 'paint', [s.rear + 0.02, 0.62 + lift, -s.hatchSide], [s.rear + 0.06, s.deck - 0.02, s.hatchSide]),
    ] + (if stripe == null then [] else stripes(s.deck + 0.01, s.rear + 0.04, s.deckFront)), paint + (if stripe == null then {} else { stripe: stripe }), { hinge_a: ['skin', [1, 1, 1]], hinge_b: ['skin', [1, 1, 0]] }),
  ] else [
    // The whole rear opening, glass and all, lifts as one about the roof's rear edge.
    k.compound(id + '_tailgate', 18, [
      box('skin', 'paint', [s.rear + 0.05, 0.62 + lift, -s.hatchSide], [s.tailWaist, s.waist, s.hatchSide]),
      box('handle', 'trim', [s.rear + 0.04, s.rearSill + 0.13, -0.12], [s.rear + 0.05, s.rearSill + 0.18, 0.12]),
    ] + shape.across('glass', 'glass', [[s.tailWaist - 0.01, s.waist], [s.tailWaist + 0.03, s.waist], [s.tailWaist + 0.03 + s.dLean, s.roof], [s.tailWaist - 0.01 + s.dLean, s.roof]], s.hatchSide - 0.02), paint, { hinge_a: [shape.top('glass'), [1, 1, 1]], hinge_b: [shape.top('glass'), [1, 1, 0]] }),
  ]),
  rows: rows,
}.rows
