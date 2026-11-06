local k = import 'kit.libsonnet';
local m = import 'military-kit.libsonnet';
local s = import 'military_ambulance.spec.libsonnet';
local box = k.box;
local bothSides = k.bothSides;
local finish = { white: 'paint-white', cross: 'paint-green', paint: 'paint-olive', frame: 'steel-parkerized', floor: 'steel-grey', dark: 'steel-spall-black', frost: 'plastic-frosted', mattress: 'canvas-grey', trim: 'paint-charcoal' };
local back = s.bedRear;
[
  // Stops inside the walls, which run down past it.
  k.compound('military_ambulance_box_floor', s.boxFloorMass, [
    box('floor', 'floor', [back + 0.05, s.deckBottom, -s.boxSide + 0.04], [s.bedFront, s.deckTop, s.boxSide - 0.04]),
  ], finish),
  k.compound('military_ambulance_box', s.boxMass, [
    box('roof', 'paint', [back - 0.04, s.boxTop, -s.boxSide - 0.03], [s.bedFront + 0.03, s.boxTop + 0.05, s.boxSide + 0.03]),
    box('front_wall', 'paint', [s.bedFront - 0.04, s.deckTop, -s.boxSide], [s.bedFront, s.boxTop, s.boxSide]),
    box('rear_lintel', 'paint', [back, s.boxTop - 0.14, -s.boxSide], [back + 0.05, s.boxTop, s.boxSide]),
    box('rear_sill', 'paint', [back, s.deckBottom, -s.boxSide], [back + 0.05, s.deckTop + 0.04, s.boxSide]),
    box('vent_fore', 'trim', [-0.42, s.boxTop + 0.05, -0.2], [-0.02, s.boxTop + 0.13, 0.2]),
    box('vent_aft', 'trim', [-3.1, s.boxTop + 0.05, -0.2], [-2.7, s.boxTop + 0.13, 0.2]),
    box('roof_field', 'white', [-2.21875, s.boxTop + 0.05, -0.625], [-0.96875, s.boxTop + 0.08125, 0.625]),
    box('roof_cross_long', 'cross', [-2.0625, s.boxTop + 0.08125, -0.15625], [-1.125, s.boxTop + 0.1125, 0.15625]),
    box('roof_cross_short', 'cross', [-1.75, s.boxTop + 0.08125, -0.46875], [-1.4375, s.boxTop + 0.1125, 0.46875]),
  ] + bothSides([
    box('field', 'white', [-2.0625, 1.8125, s.boxSide], [-1.125, 2.75, s.boxSide + 0.03125]),
    box('cross_bar', 'cross', [-1.9375, 2.15625, s.boxSide + 0.03125], [-1.25, 2.40625, s.boxSide + 0.0625]),
    box('cross_post', 'cross', [-1.71875, 1.9375, s.boxSide + 0.03125], [-1.46875, 2.625, s.boxSide + 0.0625]),
    box('side', 'paint', [back, s.deckBottom, s.boxSide - 0.04], [s.bedFront, s.boxTop, s.boxSide]),
    box('rear_post', 'paint', [back, s.deckTop, s.boxSide - 0.2], [back + 0.05, s.boxTop - 0.14, s.boxSide]),
    box('rub', 'frame', [back, s.deckBottom - 0.04, s.boxSide - 0.02], [s.bedFront, s.deckBottom, s.boxSide + 0.01]),
    box('window_fore', 'frost', [-0.56, 2.2, s.boxSide], [-0.1, 2.68, s.boxSide + 0.01]),
    box('window_aft', 'frost', [-3.14, 2.2, s.boxSide], [-2.68, 2.68, s.boxSide + 0.01]),
    box('frame_top', 'trim', [-0.6, 2.68, s.boxSide], [-0.06, 2.72, s.boxSide + 0.015]),
    box('frame_low', 'trim', [-0.6, 2.16, s.boxSide], [-0.06, 2.2, s.boxSide + 0.015]),
    box('frame_top_aft', 'trim', [-3.18, 2.68, s.boxSide], [-2.64, 2.72, s.boxSide + 0.015]),
    box('frame_low_aft', 'trim', [-3.18, 2.16, s.boxSide], [-2.64, 2.2, s.boxSide + 0.015]),
  ]), finish),
  k.compound('military_ambulance_rear_door', s.doorMass, [
    box('skin', 'paint', [back - 0.03, s.deckTop + 0.04, 0.005], [back + 0.03, s.boxTop - 0.14, s.boxSide - 0.2]),
    box('hinge_top', 'dark', [back - 0.05, 2.62, s.boxSide - 0.24], [back - 0.03, 2.68, s.boxSide - 0.16]),
    box('hinge_low', 'dark', [back - 0.05, 1.68, s.boxSide - 0.24], [back - 0.03, 1.74, s.boxSide - 0.16]),
    box('handle', 'dark', [back - 0.08, 2.0, 0.07], [back - 0.04, 2.32, 0.11]),
    box('handle_foot_top', 'dark', [back - 0.08, 2.28, 0.03], [back - 0.04, 2.32, 0.07]),
  ], finish, { hinge_a: ['skin', [0.5, 0.2, 1]], hinge_b: ['skin', [0.5, 0.8, 1]] }),
  k.compound('military_ambulance_rear_step', 24, [
    box('tread_top', 'frame', [back - 0.3, s.deckBottom - 0.2, -0.6], [back - 0.04, s.deckBottom - 0.16, 0.6]),
    box('tread_low', 'frame', [back - 0.42, 0.72, -0.6], [back - 0.16, 0.76, 0.6]),
  ] + bothSides([
    box('stringer', 'frame', [back - 0.24, 0.76, 0.56], [back - 0.2, s.deckBottom - 0.2, 0.6]),
    box('hanger', 'frame', [back - 0.06, s.deckBottom - 0.2, 0.56], [back, s.deckBottom, 0.6]),
    box('grab', 'dark', [back - 0.06, s.deckTop + 0.3, s.boxSide - 0.02], [back, s.deckTop + 1.1, s.boxSide + 0.02]),
  ]), finish),
  k.compound('military_ambulance_stretcher_rack', s.rackMass, [
    box('lower_mattress', 'mattress', [-3.0, 1.9, 0.5], [-1.0, 1.96, 1.1]),
    box('upper_mattress', 'mattress', [-3.0, 2.46, 0.5], [-1.0, 2.52, 1.1]),
    box('lower_rail', 'frame', [-3.0, 1.88, 0.5], [-1.0, 1.9, 1.1]),
    box('upper_rail', 'frame', [-3.0, 2.44, 0.5], [-1.0, 2.46, 1.1]),
    box('post_aft', 'frame', [-3.04, s.deckTop, 0.46], [-3.0, s.boxTop, 0.5]),
    box('post_fore', 'frame', [-1.0, s.deckTop, 0.46], [-0.96, s.boxTop, 0.5]),
    box('wall_tie_aft', 'frame', [-3.04, 2.84, 0.5], [-3.0, 2.88, 1.16]),
    box('wall_tie_fore', 'frame', [-1.0, 2.84, 0.5], [-0.96, 2.88, 1.16]),
  ], finish),
] + m.truckRows('military_ambulance', s)
