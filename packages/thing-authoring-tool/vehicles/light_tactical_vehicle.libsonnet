local k = import 'kit.libsonnet';
local m = import 'military-kit.libsonnet';
local t = import 'truck-cab.libsonnet';
local s = import 'light_tactical_vehicle.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local id = 'light_tactical_vehicle';
local finish = { paint: 'paint-sand', frame: 'steel-parkerized', dark: 'steel-spall-black', trim: 'paint-charcoal', glass: 'glass-clear' };
// A flat-headed wheel opening with straight jambs and two chamfered top corners, the class's mark, where the other 4x4s have round arches.
local bandWide = 0.05;
local shoulder = s.archTop - s.archChamfer;
local crown = s.archBase - s.archChamfer;
local chamferFore(c, w) = [[c + s.archBase, shoulder], [c + s.archBase + w, shoulder], [c + crown + w, s.archTop], [c + crown, s.archTop]];
local chamferAft(c, w) = [[c - s.archBase - w, shoulder], [c - s.archBase, shoulder], [c - crown, s.archTop], [c - crown - w, s.archTop]];
local sidePanel(name, c, x0, x1) = [
  box(name + '_aft', 'paint', [x0, s.panelLow, s.panelIn], [c - s.archBase, s.archTop, s.panel]),
  box(name + '_fore', 'paint', [c + s.archBase, s.panelLow, s.panelIn], [x1, s.archTop, s.panel]),
] + t.archCorners(name + '_corner', 'paint', c - s.archBase, c + s.archBase, s.archTop, s.archChamfer, s.panelIn, s.panel);
local rim(name, slot, c, w, z) = [
  box(name + '_head', slot, [c - crown - w, s.archTop, z[0]], [c + crown + w, s.archTop + w, z[1]]),
  box(name + '_jamb_aft', slot, [c - s.archBase - w, s.panelLow, z[0]], [c - s.archBase, shoulder, z[1]]),
  box(name + '_jamb_fore', slot, [c + s.archBase, s.panelLow, z[0]], [c + s.archBase + w, shoulder, z[1]]),
  prism(name + '_chamfer_aft', slot, chamferAft(c, w), z),
  prism(name + '_chamfer_fore', slot, chamferFore(c, w), z),
];
local flare(name, c) = rim(name + '_flare', 'paint', c, bandWide, [s.panel, s.flare]);
// The wall's outer face sits behind the opening, so its liner shows only through the five sides.
local well(name, c) = [
  box(name + '_liner', 'trim', [c - s.archBase - 0.04, s.panelLow, s.bedZ], [c + s.archBase + 0.04, s.archTop + 0.04, s.wellIn]),
] + rim(name + '_well', 'trim', c, 0.04, [s.wellIn, s.panelIn]);
local door(name, x0, x1, topFront, winA, winB, hingeX) =
  k.compound(name, 48, [
    box('skin', 'paint', [x0, s.floor, s.lowerIn], [x1, s.waist, s.lowerSkin]),
    box('waist', 'paint', [x0, s.waist - 0.04, s.upperIn], [x1, s.waist, s.lowerSkin]),
    box('plate', 'paint', [x0 + 0.07, s.floor + 0.07, s.lowerSkin], [x1 - 0.07, s.waist - 0.12, s.lowerSkin + 0.03125]),
    box('window_sill', 'paint', [x0, s.waist, s.upperIn], [topFront, s.waist + 0.12, s.upperSkin]),
    box('window_head', 'paint', [x0, s.roof - 0.12, s.upperIn], [topFront, s.roof - 0.04, s.upperSkin]),
    box('stile_rear', 'paint', [x0, s.waist + 0.12, s.upperIn], [winA, s.roof - 0.12, s.upperSkin]),
    box('stile_front', 'paint', [winB, s.waist + 0.12, s.upperIn], [topFront, s.roof - 0.12, s.upperSkin]),
    box('glass', 'glass', [winA, s.waist + 0.12, s.upperIn + 0.005], [winB, s.roof - 0.12, s.upperSkin - 0.005]),
    box('handle', 'dark', [x0 + 0.1, s.waist - 0.22, s.lowerSkin + 0.03125], [x0 + 0.26, s.waist - 0.16, s.lowerSkin + 0.0625]),
    box('hinge_top', 'dark', [hingeX - 0.1, s.waist - 0.2, s.lowerSkin], [hingeX, s.waist - 0.12, s.lowerSkin + 0.0625]),
    box('hinge_low', 'dark', [hingeX - 0.1, s.floor + 0.12, s.lowerSkin], [hingeX, s.floor + 0.2, s.lowerSkin + 0.0625]),
  ], finish, { hinge_a: ['skin', [1, 0.2, 1]], hinge_b: ['skin', [1, 0.8, 1]] });
local lugCount = 20;
local lugs = [
  local a = 2 * std.pi * i / lugCount;
  local d = 0.04 / 0.47;
  local at(r, t) = [r * std.cos(t), r * std.sin(t)];
  prism('lug_' + i, 'tyre', [at(0.43, a - d), at(0.47, a - d), at(0.47, a + d), at(0.43, a + d)], if i % 2 == 0 then [-0.01, 0.15] else [-0.15, 0.01])
  for i in std.range(0, lugCount - 1)
];
local rakeTop = s.roof - 0.06;
[
  k.compound(id + '_wheel', 55, [
    k.turned('tyre', 'tyre', 'z', [[-0.16, 0.21], [-0.16, 0.4], [-0.128, 0.445], [0.128, 0.445], [0.16, 0.4], [0.16, 0.21], [-0.16, 0.21]]) + { sides: 24 },
    k.turned('rim', 'rim', 'z', k.disc(0.21, -0.12, 0.12)) + { sides: 24 },
    k.turned('boss', 'boss', 'z', k.disc(0.09, -0.15, 0.15)) + { sides: 12 },
  ] + lugs, { tyre: 'rubber-black', rim: 'paint-sand', boss: 'steel-spall-black' }, { hub: ['rim', [0.5, 0.5, 0.5]] }),
  // The hub stands below the half shaft in a drop box, which is what lifts the belly so high off the ground.
  k.compound(id + '_portal_axle', 120, [
    box('diff', 'steel', [-0.12, 0.42, -0.16], [0.12, 0.74, 0.16]),
    box('half_shaft', 'steel', [-0.04, 0.58, -0.62], [0.04, 0.66, 0.62]),
  ] + bothSides([
    box('portal', 'steel', [-0.1, 0.34, 0.62], [0.1, 0.68, s.wellIn]),
    box('lower_arm', 'steel', [-0.12, 0.42, 0.16], [0.12, 0.46, 0.62]),
    box('upper_arm', 'steel', [-0.1, 0.6, 0.44], [0.1, 0.64, 0.62]),
  ]), { steel: 'steel-grey' }),
  k.compound(id + '_rear_prop_shaft', 18, [k.turned('tube', 'steel', 'x', k.disc(0.04, -1.08, 1.08))], { steel: 'steel-grey' }),
  k.compound(id + '_frame', s.frameMass, [
    box('cross_' + i, 'frame', [[-2.46, -2.3, -1.5, -0.55, 0.5, 1.2, 2.18][i] - 0.04, s.railLow, -s.railZ], [[-2.46, -2.3, -1.5, -0.55, 0.5, 1.2, 2.18][i] + 0.04, s.railTop, s.railZ])
    for i in std.range(0, 6)
  ] + [
    box('bearer_aft', 'frame', [-2.12, s.railTop, -s.railZ], [-2.06, s.bedUnder, s.railZ]),
    box('bearer_fore', 'frame', [-1.5, s.railTop, -s.railZ], [-1.44, s.bedUnder, s.railZ]),
    box('rear_bar', 'paint', [s.rear - 0.02, s.railTop, -0.9], [s.rear + 0.04, s.railTop + 0.1, 0.9]),
  ] + bothSides([
    box('rail', 'frame', [s.rear + 0.02, s.railLow, s.railZ - 0.08], [s.nose, s.railTop, s.railZ]),
    box('sill_bracket_aft', 'frame', [-0.8, s.railLow, s.railZ], [-0.7, 0.58, 0.92]),
    box('sill_bracket_fore', 'frame', [0.4, s.railLow, s.railZ], [0.5, 0.58, 0.92]),
  ]), finish),
  k.compound(id + '_hull', s.hullMass, bothSides(
    sidePanel('rear_panel', s.rearAxle, s.rear, s.cabBack)
    + flare('rear', s.rearAxle)
    + well('rear', s.rearAxle)
    + well('front', s.frontAxle)
    + [
      prism('rear_panel_upper', 'paint', [[s.rear, s.archTop], [s.cabBack, s.archTop], [s.cabBack, 1.3], [s.rear, 1.14]], [s.panelIn, s.panel]),
      prism('gunwale', 'paint', [[s.rear, 1.12], [s.cabBack, 1.28], [s.cabBack, 1.32], [s.rear, 1.16]], [s.bedZ, s.panel]),
      prism('bed_wall', 'trim', [[s.bedRear, s.bedUnder], [s.cabBack, s.bedUnder], [s.cabBack, 1.29], [s.bedRear, 1.13]], [s.bedZ, s.wellIn]),
      box('tail_corner', 'paint', [s.rear, s.railTop + 0.1, s.bedZ], [s.rear + 0.04, 1.13, s.panel]),
      box('sill', 'dark', [s.rearAxle + s.archBase, 0.5, 0.88], [s.frontAxle - s.archBase, s.floor, 1.0]),
      box('c_post', 'paint', [s.cabBack, s.floor, s.lowerIn], [s.cabBack + 0.1, s.waist, s.lowerSkin]),
      box('c_post_upper', 'paint', [s.cabBack, s.waist, s.upperIn], [s.cabBack + 0.1, s.roof, s.upperSkin]),
      box('b_post', 'paint', [s.bPost - 0.02, s.floor, s.lowerIn], [s.bPost + 0.02, s.waist, s.lowerSkin]),
      box('b_post_upper', 'paint', [s.bPost - 0.02, s.waist, s.upperIn], [s.bPost + 0.02, s.roof, s.upperSkin]),
      prism('a_post', 'paint', [[s.topFront, s.waist], [s.cabFront + 0.01, s.waist], [s.cabFront - 0.06, s.roof], [s.topFront, s.roof]], [0.86, s.upperSkin]),
      box('cant_rail', 'paint', [s.cabBack, s.roof - 0.04, s.upperIn], [s.topFront, s.roof, s.upperSkin]),
      box('back_side', 'paint', [s.cabBack, s.waist, 0.68], [s.cabBack + 0.04, s.roof, s.upperSkin]),
    ]
  ) + [
    box('floor', 'trim', [s.cabBack, s.railTop, -s.lowerIn], [s.cabFront, s.floor, s.lowerIn]),
    box('tunnel', 'trim', [s.cabBack + 0.04, s.floor, -0.28], [s.cabFront - 0.02, 1.0, 0.28]),
    box('firewall', 'paint', [s.cabFront - 0.02, s.railTop, -s.lowerIn], [s.cabFront + 0.02, s.bonnetUnder, s.lowerIn]),
    box('back_lower', 'paint', [s.cabBack, s.railTop, -s.lowerSkin], [s.cabBack + 0.04, s.waist + 0.14, s.lowerSkin]),
    box('back_head', 'paint', [s.cabBack, s.roof - 0.14, -s.upperSkin], [s.cabBack + 0.04, s.roof, s.upperSkin]),
    box('back_post', 'paint', [s.cabBack, s.waist + 0.14, -0.1], [s.cabBack + 0.04, s.roof - 0.14, 0.1]),
    box('roof', 'paint', [s.cabBack - 0.02, s.roof, -0.95], [s.cabFront - 0.06, s.roofTop, 0.95]),
    box('windscreen_head', 'paint', [s.topFront - 0.02, s.roof - 0.06, -s.upperSkin], [s.cabFront - 0.06, s.roof, s.upperSkin]),
    prism('windscreen_post', 'paint', [[s.cabFront - 0.04, s.waist], [s.cabFront + 0.01, s.waist], [s.cabFront - 0.05, rakeTop], [s.cabFront - 0.1, rakeTop]], [-0.04, 0.04]),
    prism('rear_deck', 'trim', [[s.deckFoot, s.bedTop - 0.01], [s.cabBack + 0.04, s.bedTop - 0.01], [s.cabBack + 0.04, 1.3], [s.cabBack, 1.3]], [-s.bedZ, s.bedZ]),
  ], finish),
  k.compound(id + '_bed_floor', 55, [
    box('floor', 'dark', [s.bedRear, s.bedUnder, -s.bedZ], [s.cabBack + 0.04, s.bedTop, s.bedZ]),
  ], finish),
  k.compound(id + '_tailgate', 35, [
    box('gate', 'paint', [s.rear, s.railTop + 0.1, -s.bedZ], [s.rear + 0.06, 1.1, s.bedZ]),
  ] + bothSides([
    box('rib', 'trim', [s.rear - 0.02, s.railTop + 0.14, 0.3], [s.rear, 1.06, 0.36]),
    box('chain', 'dark', [s.rear + 0.02, 1.1, 0.64], [s.rear + 0.05, 1.13, s.bedZ]),
  ]), finish),
  k.compound(id + '_bonnet', 95, [
    box('top', 'paint', [s.bonnetBack, s.bonnetUnder, -s.panel], [s.bonnetFlat, s.waist, s.panel]),
    prism('nose_slope', 'paint', [[s.bonnetFlat, s.bonnetUnder], [s.nose, 1.02], [s.nose, 1.06], [s.bonnetFlat, s.waist]], [-s.panel, s.panel]),
    box('crown', 'paint', [1.0, s.waist, -0.24], [1.92, s.waist + 0.03125, 0.24]),
    box('face_top', 'paint', [s.nose - 0.04, 1.0, -0.54], [s.nose, 1.06, 0.54]),
    box('face_foot', 'paint', [s.nose - 0.04, s.panelLow, -0.54], [s.nose, 0.7, 0.54]),
  ] + bothSides(
    sidePanel('side', s.frontAxle, s.cabFront, s.nose)
    + flare('front', s.frontAxle)
    + [
      box('side_upper', 'paint', [s.cabFront, s.archTop, s.panelIn], [s.bonnetFlat, s.bonnetUnder, s.panel]),
      prism('side_nose', 'paint', [[s.bonnetFlat, s.archTop], [s.nose, s.archTop], [s.bonnetFlat, s.bonnetUnder + 0.02]], [s.panelIn, s.panel]),
      box('face_side', 'paint', [s.nose - 0.04, s.panelLow, 0.54], [s.nose, 1.06, s.panel]),
    ]
    + m.slats('louvre', 'dark', 1.0, 1.75, 7, function(id, slot, x) box(id, slot, [x, s.waist, 0.32], [x + 0.0625, s.waist + 0.03125, 0.8]))
  ), finish),
  k.compound(id + '_grille', 16, [
    box('backing', 'dark', [s.nose - 0.07, 0.68, -0.54], [s.nose - 0.04, 1.02, 0.54]),
  ] + m.slats('bar', 'paint', -0.5, 0.5, 9, function(id, slot, z) box(id, slot, [s.nose - 0.04, 0.7, z - 0.03125], [s.nose, 1.0, z + 0.03125])), finish),
  k.compound(id + '_headlamp', 1.5, [
    box('pod', 'dark', [0, -0.11, -0.11], [0.03125, 0.11, 0.11]),
    k.turned('lens', 'lens', 'x', k.disc(0.08, 0.03125, 0.0625)) + { sides: 16 },
  ], { dark: 'steel-spall-black', lens: 'plastic-frosted' }),
  k.compound(id + '_brush_guard', 48, [
    box('bumper', 'paint', [s.nose, 0.58, -s.panel], [s.front, 0.76, s.panel]),
    box('top_bar', 'frame', [s.front - 0.05, 1.04, -0.98], [s.front - 0.01, 1.08, 0.98]),
  ] + bothSides([
    box('upright_' + i, 'frame', [s.front - 0.05, 0.76, [0.3, 0.56, 0.94][i]], [s.front - 0.01, 1.08, [0.3, 0.56, 0.94][i] + 0.04])
    for i in std.range(0, 2)
  ] + [
    box('stay', 'frame', [s.nose, 0.98, 0.56], [s.front - 0.05, 1.02, 0.6]),
    box('stay_outer', 'frame', [s.nose, 0.98, 0.94], [s.front - 0.05, 1.02, 0.98]),
    box('tow_eye', 'dark', [s.front, 0.62, 0.7], [s.front + 0.03125, 0.72, 0.76]),
  ]), finish),
  door(id + '_front_door', s.bPost + 0.02, s.cabFront, s.topFront, s.bPost + 0.12, 0.56, s.cabFront),
  door(id + '_rear_door', s.cabBack + 0.1, s.bPost - 0.02, s.bPost - 0.02, s.cabBack + 0.26, s.bPost - 0.24, s.bPost - 0.02),
  k.compound(id + '_windscreen', 26, [
    prism('pane_' + side.n, 'glass', [[s.cabFront - 0.03, s.waist], [s.cabFront, s.waist], [s.cabFront - 0.06, rakeTop], [s.cabFront - 0.09, rakeTop]], side.z)
    for side in [{ n: 'near', z: [0.04, 0.86] }, { n: 'far', z: [-0.86, -0.04] }]
  ] + bothSides([
    box('back_glass', 'glass', [s.cabBack + 0.01, s.waist + 0.14, 0.1], [s.cabBack + 0.03, s.roof - 0.14, 0.68]),
  ]), finish),
  k.compound(id + '_dashboard', 14, [
    box('panel', 'trim', [s.cabFront - 0.2, 1.02, -s.upperIn], [s.cabFront - 0.02, s.waist, s.upperIn]),
    box('column', 'dark', [0.56, 1.3, -s.seatZ - 0.03], [0.72, 1.34, -s.seatZ + 0.03]),
    box('column_foot', 'dark', [0.66, s.waist, -s.seatZ - 0.03], [0.72, 1.3, -s.seatZ + 0.03]),
  ], finish),
  k.compound(id + '_roof_hatch', 32, [
    k.turned('ring', 'frame', 'y', k.annulus(0.38, 0.46, s.roofTop, s.roofTop + 0.09), [s.ring, 0, 0]) + { sides: 24 },
    k.turned('lid', 'paint', 'y', k.disc(0.38, s.roofTop + 0.05, s.roofTop + 0.09), [s.ring, 0, 0]) + { sides: 24 },
    box('handle', 'dark', [s.ring - 0.12, s.roofTop + 0.09, -0.03], [s.ring + 0.12, s.roofTop + 0.12, 0.03]),
  ], finish),
  k.compound(id + '_steering_box', 14, [
    box('box', 'dark', [1.08, 0.62, -s.railZ + 0.08], [1.22, 0.74, -0.32]),
    box('drag_link', 'frame', [1.22, 0.62, -0.41], [1.56, 0.65, -0.38]),
  ], finish),
]
