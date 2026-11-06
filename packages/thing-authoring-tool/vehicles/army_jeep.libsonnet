local k = import 'kit.libsonnet';
local m = import 'military-kit.libsonnet';
local s = import 'army_jeep.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local finish = { paint: s.paint, trim: 'paint-charcoal', frame: 'steel-parkerized', dark: 'steel-spall-black', glass: 'glass-clear', tan: 'cloth-canvas', strap: 'webbing-olive-dark', seat: 'cloth-olive-drab', spring: 'steel-grey' };
[
  k.compound('army_jeep_frame', s.frameMass, [
    box('cross_front', 'frame', [1.46, 0.46, -0.34], [1.56, 0.58, 0.34]),
    box('cross_mid', 'frame', [-0.2, 0.46, -0.34], [-0.1, 0.58, 0.34]),
    box('cross_rear', 'frame', [-1.62, 0.46, -0.34], [-1.52, 0.58, 0.34]),
    box('front_bumper', 'paint', [s.front - 0.08, 0.48, -0.74], [s.front, 0.6, 0.74]),
  ] + bothSides([
    box('rail', 'frame', [-1.62, 0.46, 0.26], [s.front - 0.08, 0.58, 0.34]),
    box('front_spring', 'spring', [s.frontAxle - 0.42, 0.415, 0.26], [s.frontAxle + 0.42, 0.46, 0.34]),
    box('rear_spring', 'spring', [s.rearAxle - 0.42, 0.415, 0.26], [s.rearAxle + 0.42, 0.46, 0.34]),
    box('rear_stub', 'paint', [s.rear - 0.04, 0.48, 0.4], [s.rear + 0.08, 0.6, 0.58]),
  ]), finish),
  k.compound('army_jeep_tub', s.tubMass, bothSides([
    box('side_rear', 'paint', [s.rear, 0.5, s.side - 0.03], [s.cutRear, s.waist, s.side]),
    box('side_low', 'paint', [s.cutRear, 0.5, s.side - 0.03], [s.cutFront, s.cut, s.side]),
    box('side_fore', 'paint', [s.cutFront, 0.5, s.side - 0.03], [s.cowl, s.waist, s.side]),
    prism('cut_rear', 'paint', [[s.cutRear, s.cut], [s.cutRear + 0.12, s.cut], [s.cutRear, s.waist]], [s.side - 0.03, s.side]),
    prism('cut_fore', 'paint', [[s.cutFront - 0.12, s.cut], [s.cutFront, s.cut], [s.cutFront, s.waist]], [s.side - 0.03, s.side]),
    box('lip_rear', 'paint', [s.rear, s.waist, s.side - 0.05], [s.cutRear, s.waist + 0.03, s.side + 0.01]),
    box('bead', 'trim', [s.rear, 0.5, s.side], [s.cowl, 0.53, s.side + 0.01]),
  ]) + [
    box('floor', 'trim', [s.rear + 0.06, s.floor - 0.04, -s.side], [s.cowl, s.floor, s.side]),
    box('tunnel', 'paint', [-0.13, s.floor, -0.15], [s.cowl - 0.08, s.floor + 0.1, 0.15]),
    box('rear_panel', 'paint', [s.rear, 0.5, -s.side], [s.rear + 0.06, s.waist + 0.03, s.side]),
    box('rear_deck', 'paint', [s.rear + 0.06, s.waist - 0.04, -s.side + 0.03], [s.deckFront, s.waist, s.side - 0.03]),
    box('seat_riser', 'paint', [s.deckFront - 0.02, s.floor, -s.side + 0.03], [s.deckFront, s.waist, s.side - 0.03]),
    box('cowl', 'paint', [s.cowl - 0.1, s.floor, -s.side], [s.cowl, s.waist + 0.06, s.side]),
    box('cowl_top', 'paint', [s.cowl - 0.1, s.waist + 0.06, -s.bonnetZ], [s.cowl, s.bonnetBack, s.bonnetZ]),
  ], finish),
  k.compound('army_jeep_bonnet', 28, [
    prism('top', 'paint', [[s.cowl, s.bonnetBack - 0.04], [s.nose, s.bonnetFront - 0.04], [s.nose, s.bonnetFront], [s.cowl, s.bonnetBack]], [-s.bonnetZ, s.bonnetZ]),
  ] + bothSides([
    prism('side', 'paint', [[s.cowl, 0.6], [s.nose, 0.6], [s.nose, s.bonnetFront - 0.03], [s.cowl, s.bonnetBack - 0.03]], [s.bonnetZ - 0.03, s.bonnetZ]),
    box('latch', 'dark', [0.92, 0.8, s.bonnetZ], [0.98, 0.9, s.bonnetZ + 0.015]),
    box('fold', 'trim', [s.cowl, s.bonnetFront - 0.01, s.bonnetZ - 0.04], [s.nose, s.bonnetFront + 0.03, s.bonnetZ - 0.02]),
  ]), finish),
  k.compound('army_jeep_grille', 18, [
    box('backing', 'dark', [s.nose, 0.56, -s.bonnetZ], [s.nose + 0.03, s.bonnetFront, s.bonnetZ]),
    box('head', 'paint', [s.nose + 0.03, s.bonnetFront - 0.06, -s.bonnetZ], [s.nose + 0.06, s.bonnetFront, s.bonnetZ]),
    box('foot', 'paint', [s.nose + 0.03, 0.56, -s.bonnetZ], [s.nose + 0.06, 0.62, s.bonnetZ]),
  ] + bothSides([
    box('cheek', 'paint', [s.nose + 0.03, 0.56, s.bonnetZ - 0.05], [s.nose + 0.06, s.bonnetFront, s.bonnetZ]),
    box('bar_a', 'paint', [s.nose + 0.03, 0.62, 0.05], [s.nose + 0.06, s.bonnetFront - 0.06, 0.09]),
    box('bar_b', 'paint', [s.nose + 0.03, 0.62, 0.14], [s.nose + 0.06, s.bonnetFront - 0.06, 0.18]),
  ]), finish),
  k.compound('army_jeep_front_wing', 16, m.flatGuard('guard', 'paint', [0.62, 1.42], 0.88, 0.22, 0.2, [s.bonnetZ, 0.8]) + [
    prism('rear_slope', 'paint', [[0.36, 0.6], [0.62, 0.84], [0.62, 0.88], [0.36, 0.64]], [s.bonnetZ, 0.74]),
    box('apron', 'paint', [s.cowl, 0.62, s.bonnetZ], [1.42, 0.84, s.bonnetZ + 0.03]),
    box('step', 'trim', [-0.02, 0.5, s.side], [0.36, 0.54, 0.74]),
    prism('step_toe', 'trim', [[0.36, 0.5], [0.4, 0.6], [0.36, 0.64]], [s.side, 0.74]),
  ], finish),
  k.compound('army_jeep_rear_fender', 9, m.flatGuard('guard', 'paint', [-1.42, -0.6], 0.86, 0.24, 0.16, [s.side, 0.8]), finish),
  k.compound('army_jeep_windscreen', 16, [
    box('sill', 'paint', [s.cowl - 0.06, s.bonnetBack, -0.64], [s.cowl - 0.01, s.bonnetBack + 0.05, 0.64]),
    box('head', 'paint', [s.cowl - 0.06, s.screenTop - 0.05, -0.64], [s.cowl - 0.01, s.screenTop, 0.64]),
    box('glass', 'glass', [s.cowl - 0.05, s.bonnetBack + 0.05, -0.59], [s.cowl - 0.02, s.screenTop - 0.05, 0.59]),
    box('wiper', 'dark', [s.cowl - 0.01, s.bonnetBack + 0.05, 0.2], [s.cowl, s.bonnetBack + 0.3, 0.22]),
  ] + bothSides([
    box('post', 'paint', [s.cowl - 0.06, s.bonnetBack, 0.59], [s.cowl - 0.01, s.screenTop, 0.64]),
    box('foot', 'paint', [s.cowl - 0.08, s.waist, 0.57], [s.cowl - 0.02, s.bonnetBack + 0.05, 0.62]),
  ]), finish),
  k.compound('army_jeep_dashboard', 9, [
    box('panel', 'paint', [s.cowl - 0.16, 0.78, -s.side + 0.03], [s.cowl - 0.1, s.waist + 0.06, s.side - 0.03]),
    box('dial', 'dark', [s.cowl - 0.17, 0.88, -0.3], [s.cowl - 0.16, 0.94, -0.14]),
    box('column', 'dark', [0.06, 0.96, -0.32], [s.cowl - 0.16, 1.0, -0.28]),
  ], finish),
  k.compound('army_jeep_seat', 7, [
    box('base', 'frame', [-0.2, 0, -0.2], [0.18, 0.08, 0.2]),
    box('cushion', 'seat', [-0.24, 0.08, -0.25], [0.22, 0.18, 0.25]),
    prism('back', 'seat', [[-0.27, 0.16], [-0.18, 0.16], [-0.22, 0.56], [-0.31, 0.56]], [-0.25, 0.25]),
  ], finish, { hips: ['cushion', [0.4, 1, 0.5]] }),
  // The open tub's cut-out is its way in: a hinged rail across it, wider than the player.
  k.compound('army_jeep_side_rail', 5, [
    box('top', 'paint', [s.cutRear + 0.02, s.waist + 0.02, s.side - 0.02], [s.cutFront + 0.02, s.waist + 0.05, s.side + 0.01]),
    box('fore', 'paint', [s.cutFront - 0.02, s.cut, s.side - 0.02], [s.cutFront + 0.02, s.waist + 0.02, s.side + 0.01]),
    box('aft', 'paint', [s.cutRear + 0.02, s.cut, s.side - 0.02], [s.cutRear + 0.06, s.waist + 0.02, s.side + 0.01]),
  ], finish, { hinge_a: ['fore', [0.5, 0.1, 0.5]], hinge_b: ['fore', [0.5, 0.9, 0.5]] }),
  k.compound('army_jeep_steering_box', 14, [
    box('box', 'dark', [0.72, 0.52, -0.42], [0.86, 0.62, -0.34]),
    box('drag_link', 'frame', [0.8, 0.46, -0.43], [1.0, 0.49, -0.4]),
    box('arm', 'frame', [0.78, 0.46, -0.42], [0.84, 0.52, -0.36]),
  ], finish),
  k.compound('army_jeep_folded_canvas', 22, [
    prism('roll', 'tan', [[s.rear + 0.04, s.waist], [s.deckFront - 0.02, s.waist], [s.deckFront - 0.02, s.waist + 0.14], [s.deckFront - 0.08, s.waist + 0.2], [s.rear + 0.1, s.waist + 0.2], [s.rear + 0.04, s.waist + 0.14]], [-0.56, 0.56]),
  ] + bothSides([
    box('strap', 'strap', [s.rear + 0.03, s.waist, 0.26], [s.deckFront - 0.01, s.waist + 0.21, 0.3]),
    box('bow_foot', 'frame', [s.deckFront - 0.12, s.waist, 0.56], [s.deckFront - 0.08, s.waist + 0.2, 0.59]),
    box('bow', 'frame', [s.rear + 0.08, s.waist + 0.14, 0.56], [s.deckFront - 0.08, s.waist + 0.18, 0.59]),
  ]), finish),
]
