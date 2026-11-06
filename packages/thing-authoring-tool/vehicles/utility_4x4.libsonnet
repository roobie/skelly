local k = import 'kit.libsonnet';
local m = import 'military-kit.libsonnet';
local s = import 'utility_4x4.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local shape = (import 'car-shape.libsonnet')(s);
local lean = shape.tumble;
local rect(x0, x1, y0, y1) = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
local finish = { paint: 'paint-olive', plate: 'paint-olive', frame: 'steel-parkerized', dark: 'steel-spall-black', trim: 'paint-charcoal', glass: 'glass-clear' };
local door(id, x0, x1, screenFront, windowFront) =
  local bolts = [[x0 + 0.1, 0.76], [x0 + 0.1, 1.16], [x1 - 0.1, 0.76], [x1 - 0.1, 1.16]];
  k.compound(id, 110, [
    box('skin', 'paint', [x0, s.floor, s.skinIn], [x1, s.waist, s.skin]),
    box('plate', 'plate', [x0 + 0.05, s.floor + 0.08, s.skin], [x1 - 0.05, s.waist - 0.06, s.skin + 0.02]),
    box('handle', 'dark', [x0 + 0.08, s.waist - 0.2, s.skin + 0.02], [x0 + 0.24, s.waist - 0.14, s.skin + 0.04]),
  ] + shape.side('window_sill', 'paint', rect(x0, screenFront, s.waist, s.waist + 0.08), [s.skinIn, s.skin])
  + shape.side('stile_rear', 'paint', rect(x0, x0 + 0.08, s.waist + 0.08, s.roof - 0.06), [s.skinIn, s.skin])
  + shape.side('stile_front', 'paint', rect(windowFront, screenFront, s.waist + 0.08, s.roof - 0.06), [s.skinIn, s.skin])
  + shape.side('head', 'paint', rect(x0, screenFront, s.roof - 0.14, s.roof - 0.06), [s.skinIn, s.skin])
  + shape.side('glass', 'glass', rect(x0 + 0.08, windowFront, s.waist + 0.08, s.roof - 0.14), [s.skinIn + 0.01, s.skin - 0.01])
  + [
    box('bolt_' + i, 'dark', [bolts[i][0] - 0.02, bolts[i][1] - 0.02, s.skin + 0.02], [bolts[i][0] + 0.02, bolts[i][1] + 0.02, s.skin + 0.03])
    for i in std.range(0, 3)
  ], finish, { hinge_a: ['skin', [1, 0.2, 1]], hinge_b: ['skin', [1, 0.8, 1]] });
local tyre = [[-0.15, 0.22], [-0.15, 0.42], [-0.126, s.hub], [0.126, s.hub], [0.15, 0.42], [0.15, 0.22], [-0.15, 0.22]];
[
  k.compound('utility_4x4_wheel', 45, [
    k.turned('tyre', 'tyre', 'z', tyre) + { sides: 24 },
    k.turned('rim', 'rim', 'z', k.disc(0.22, -0.105, 0.105)) + { sides: 24 },
  ], { tyre: 'rubber-black', rim: 'paint-olive' }, { hub: ['rim', [0.5, 0.5, 0.5]] }),
  k.compound('utility_4x4_frame', s.frameMass, [
    box('cross_front', 'frame', [s.nose - 0.12, 0.5, -0.42], [s.nose, 0.58, 0.42]),
    box('cross_mid', 'frame', [-0.1, 0.5, -0.42], [0.0, 0.58, 0.42]),
    box('cross_rear', 'frame', [s.rear + 0.04, 0.5, -0.42], [s.rear + 0.14, 0.58, 0.42]),
    box('skid', 'dark', [0.95, 0.44, -0.42], [s.nose, 0.5, 0.42]),
    box('rear_bumper', 'paint', [s.rear - 0.07, 0.48, -0.92], [s.rear, 0.66, 0.92]),
  ] + bothSides([
    box('rail', 'frame', [s.rear, 0.5, 0.34], [s.nose, 0.58, 0.42]),
    box('sill_bracket', 'frame', [-0.5, 0.5, 0.42], [-0.4, 0.56, 0.94]),
    box('sill_bracket_fore', 'frame', [0.4, 0.5, 0.42], [0.5, 0.56, 0.94]),
  ]), finish),
  k.compound('utility_4x4_hull', s.hullMass, bothSides(
    m.arched('rear_panel', 'paint', [s.rear, s.cabBack], [s.sill, s.rearPanelTop], [s.panelIn, s.side], [{ x: s.rearAxle, y: s.hub, r: s.archR }])
    + m.arched('wing_panel', 'paint', [s.hoodBack, s.nose], [s.sill, s.hoodFrontY], [s.panelIn, s.side], [{ x: s.frontAxle, y: s.hub, r: s.archR }])
    + [
      prism('rear_panel_top', 'paint', [[s.rear, s.rearPanelTop], [s.cabBack, s.rearPanelTop], [s.cabBack, s.waist]], [s.panelIn, s.side]),
      prism('wing_panel_top', 'paint', [[s.hoodBack, s.hoodFrontY], [s.nose, s.hoodFrontY], [s.hoodBack, s.hoodBackY]], [s.panelIn, s.side]),
      box('rear_closer', 'paint', [s.cabBack - 0.07, s.sill, s.skinIn], [s.cabBack, s.waist, s.side]),
      box('fore_closer', 'paint', [s.hoodBack, s.sill, s.skinIn], [s.hoodBack + 0.07, s.hoodBackY, s.side]),
      box('sill', 'dark', [s.cabBack, s.sill, s.skinIn - 0.04], [s.hoodBack, s.floor, s.skin + 0.04]),
      box('rear_inner', 'trim', [s.rear + 0.04, s.sill, s.innerZ - 0.04], [s.cabBack, s.rearPanelTop, s.innerZ]),
      box('front_inner', 'trim', [s.hoodBack, s.sill, s.innerZ - 0.04], [s.nose, s.hoodFrontY, s.innerZ]),
      box('rear_crown', 'trim', [s.rearAxle - s.archR, s.hub + s.archR, s.innerZ], [s.rearAxle + s.archR, s.hub + s.archR + 0.04, s.panelIn]),
      box('front_crown', 'trim', [s.frontAxle - s.archR, s.hub + s.archR, s.innerZ], [s.frontAxle + s.archR, s.hub + s.archR + 0.04, s.panelIn]),
      box('rear_post', 'paint', [s.cabBack, s.floor, s.skinIn], [s.cabBack + 0.08, s.waist, s.skin]),
      box('centre_post', 'paint', [-0.06, s.floor, s.skinIn], [-0.02, s.waist, s.skin]),
      box('cant_rail', 'paint', [s.cabBack, s.roof - 0.06, s.skinIn - lean], [s.cabFront + 0.02, s.roof, s.skin - lean]),
      prism('hood_louvre_a', 'dark', [[1.1, 1.17], [1.9, 1.09], [1.9, 1.172], [1.1, 1.252]], [0.5625, 0.625]),
      prism('hood_louvre_b', 'dark', [[1.1, 1.17], [1.9, 1.09], [1.9, 1.172], [1.1, 1.252]], [0.71875, 0.78125]),
    ]
    + shape.side('rear_post_head', 'paint', rect(s.cabBack, s.cabBack + 0.08, s.waist, s.roof), [s.skinIn, s.skin])
    + shape.side('centre_post_head', 'paint', rect(-0.06, -0.02, s.waist, s.roof), [s.skinIn, s.skin])
    + shape.side('a_post', 'paint', rect(s.cabFront - 0.06, s.cabFront + 0.02, s.waist, s.roof), [s.skinIn, s.skin])
  ) + [
    box('floor', 'trim', [s.cabBack, s.floor - 0.04, -s.skinIn], [s.hoodBack, s.floor, s.skinIn]),
    box('tunnel', 'trim', [s.cabBack + 0.1, s.floor, -0.22], [s.hoodBack, s.floor + 0.26, 0.22]),
    box('cargo_bulkhead', 'paint', [s.cabBack - 0.04, s.floor - 0.04, -s.skin], [s.cabBack, s.waist, s.skin]),
    box('roof', 'paint', [s.cabBack - 0.03, s.roof, lean - s.skin - 0.02], [s.cabFront + 0.06, s.roof + 0.06, s.skin + 0.02 - lean]),
    box('roof_rib_a', 'paint', [s.cabBack + 0.14, s.roof + 0.06, lean - s.skin + 0.04], [s.cabBack + 0.2, s.roof + 0.08, s.skin - 0.04 - lean]),
    box('roof_rib_b', 'paint', [s.cabFront - 0.2, s.roof + 0.06, lean - s.skin + 0.04], [s.cabFront - 0.14, s.roof + 0.08, s.skin - 0.04 - lean]),
    box('scuttle', 'paint', [s.cabFront + 0.02, s.floor, -s.skin], [s.hoodBack, s.waist, s.skin]),
    box('windscreen_post', 'paint', [s.cabFront - 0.06, s.waist, -0.04], [s.cabFront + 0.02, s.roof - 0.08, 0.04]),
    prism('rear_deck', 'paint', [[s.rear, s.rearPanelTop], [s.cabBack, s.waist], [s.cabBack, s.waist + 0.04], [s.rear, s.rearPanelTop + 0.04]], [-s.side, s.side]),
    box('rear_wall', 'paint', [s.rear, s.sill, -s.side], [s.rear + 0.04, s.rearPanelTop, s.side]),
    box('rear_step', 'dark', [s.rear - 0.02, 0.74, -0.58], [s.rear, 0.78, 0.58]),
    box('rear_hatch', 'trim', [s.rear - 0.02, 0.84, -0.58], [s.rear, s.rearPanelTop - 0.04, 0.58]),
  ] + shape.across('cargo_bulkhead_head', 'paint', rect(s.cabBack - 0.04, s.cabBack, s.waist, s.roof), s.skin)
  + shape.across('windscreen_head', 'paint', rect(s.cabFront - 0.06, s.cabFront + 0.02, s.roof - 0.08, s.roof), s.skin), finish),
  k.compound('utility_4x4_hood', 80, [
    prism('top', 'paint', [[s.hoodBack, s.hoodBackY - 0.04], [s.nose, s.hoodFrontY - 0.04], [s.nose, s.hoodFrontY], [s.hoodBack, s.hoodBackY]], [-s.side, s.side]),
    prism('bulge', 'paint', [[s.hoodBack + 0.1, s.hoodBackY - 0.01], [s.nose - 0.3, s.hoodFrontY + 0.06], [s.nose - 0.34, s.hoodFrontY + 0.1], [s.hoodBack + 0.14, s.hoodBackY + 0.04]], [-0.48, 0.48]),
  ], finish),
  k.compound('utility_4x4_face', 70, [
    box('panel', 'paint', [s.nose - 0.04, s.sill + 0.06, -s.side], [s.nose, s.hoodFrontY, s.side]),
    box('rib_top', 'paint', [s.nose, s.hoodFrontY - 0.06, -s.side], [s.nose + 0.02, s.hoodFrontY, s.side]),
  ] + m.slats('slot', 'dark', -0.44, 0.44, 9, function(id, slot, z) box(id, slot, [s.nose, 0.72, z - 0.025], [s.nose + 0.01, 1.0, z + 0.025])), finish),
  k.compound('utility_4x4_guard', 95, [
    box('bar', 'paint', [s.nose, 0.56, -s.side], [s.frontBumper, 0.72, s.side]),
    box('winch', 'dark', [s.nose + 0.02, 0.72, -0.2], [s.frontBumper - 0.02, 0.84, 0.2]),
    box('top_bar', 'frame', [s.frontBumper - 0.05, 1.12, -0.74], [s.frontBumper - 0.01, 1.16, 0.74]),
    box('mid_bar', 'frame', [s.frontBumper - 0.05, 0.94, -0.74], [s.frontBumper - 0.01, 0.97, 0.74]),
  ] + bothSides([
    box('upright_outer', 'frame', [s.frontBumper - 0.05, 0.72, 0.7], [s.frontBumper - 0.01, 1.16, 0.74]),
    box('upright_inner', 'frame', [s.frontBumper - 0.05, 0.72, 0.28], [s.frontBumper - 0.01, 1.16, 0.32]),
    box('stay', 'frame', [s.nose + 0.02, 1.0, 0.7], [s.frontBumper - 0.05, 1.04, 0.74]),
    box('tow_eye', 'dark', [s.frontBumper, 0.6, 0.86], [s.frontBumper + 0.04, 0.68, 0.92]),
  ]), finish),
  door('utility_4x4_front_door', -0.02, s.hoodBack, s.cabFront - 0.06, s.cabFront - 0.14),
  door('utility_4x4_rear_door', s.cabBack + 0.08, -0.06, -0.06, -0.14),
  k.compound('utility_4x4_windscreen', 30, [
  ] + bothSides(shape.band('glass', 'glass', rect(s.cabFront - 0.03, s.cabFront, s.waist, s.roof - 0.08), function(inset) [0.04, s.skinIn - inset])), finish),
  k.compound('utility_4x4_dashboard', 16, [
    box('panel', 'trim', [s.cabFront - 0.12, s.floor + 0.44, -s.skinIn], [s.cabFront + 0.02, s.waist, s.skinIn]),
    box('column', 'dark', [s.cabFront - 0.2, s.waist + 0.1, -0.54], [s.cabFront - 0.12, s.waist + 0.16, -0.48]),
    box('column_foot', 'dark', [s.cabFront - 0.14, s.waist, -0.54], [s.cabFront - 0.12, s.waist + 0.1, -0.48]),
  ], finish),
  k.compound('utility_4x4_hatch', 45, [
    box('ring_fore', 'frame', [-0.06, s.roof + 0.06, -0.36], [0.0, s.roof + 0.14, 0.36]),
    box('ring_aft', 'frame', [-0.66, s.roof + 0.06, -0.36], [-0.6, s.roof + 0.14, 0.36]),
    box('lid', 'paint', [-0.62, s.roof + 0.14, -0.34], [-0.04, s.roof + 0.17, 0.34]),
    box('catch', 'dark', [-0.04, s.roof + 0.1, -0.05], [0.0, s.roof + 0.18, 0.05]),
  ] + bothSides([
    box('ring_side', 'frame', [-0.66, s.roof + 0.06, 0.3], [0.0, s.roof + 0.14, 0.36]),
  ]), finish),
  k.compound('utility_4x4_steering_box', 16, [
    box('box', 'dark', [1.0, 0.56, -0.42], [1.16, 0.68, -0.3]),
    box('drag_link', 'frame', [1.1, 0.48, -0.45], [1.5, 0.51, -0.42]),
    box('arm', 'frame', [1.06, 0.48, -0.42], [1.12, 0.56, -0.38]),
  ], finish),
]
