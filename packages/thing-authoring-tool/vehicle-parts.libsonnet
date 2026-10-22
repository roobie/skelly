// Vehicle parts in the vehicle frame: x forward, y up, z toward the near side.
local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local part(id, family, massKg, dimensions, finish, anchors, exportMass) = {
  id: id,
  exportMass: exportMass,
  parts: [{ id: 'body', family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
  anchors: { [name]: { part: 'body', solid: anchors[name][0], fraction: anchors[name][1] } for name in std.objectFields(anchors) },
};
local tray(id, massKg, width, height, depth, exportMass) = part(id, 'block', massKg, { width: width, height: height, depth: depth }, { body: 'steel-grey' }, {
  seat: ['body', [0.5, 1, 0.5]],
}, exportMass);

// Compound pieces. A z prism's profile is (x, y); a turned profile is (axial, radial) and closes on itself.
local box(id, slot, min, max) = { id: id, kind: 'box', slot: slot, min: min, max: max };
local prism(id, slot, profile, z) = { id: id, kind: 'prism', slot: slot, axis: 'z', profile: profile, start: z[0], end: z[1] };
local turned(id, slot, axis, profile, origin=[0, 0, 0]) = { id: id, kind: 'turned', slot: slot, axis: axis, profile: profile, origin: origin };
local disc(radius, from, to) = [[from, 0], [from, radius], [to, radius], [to, 0], [from, 0]];
local annulus(inner, outer, from, to) = [[from, inner], [from, outer], [to, outer], [to, inner], [from, inner]];
local compound(id, massKg, pieces, finish, anchors={}) = part(id, 'compound', massKg, { pieces: pieces }, finish, anchors, exportMass='parts');
// A welded shell carries both sides: each near-side piece and its reflection across the centre plane.
local reflect(piece) = piece + { id: piece.id + '_far' } + (
  if piece.kind == 'box' then { min: [piece.min[0], piece.min[1], -piece.max[2]], max: [piece.max[0], piece.max[1], -piece.min[2]] }
  else if piece.kind == 'prism' then { start: -piece.end, end: -piece.start }
  else { origin: [piece.origin[0], piece.origin[1], -piece.origin[2]] }
);
local bothSides(pieces) = [piece + { id: piece.id + '_near' } for piece in pieces] + [reflect(piece) for piece in pieces];

// The compact five-door's reference dimensions, in its frame (`packages/deadvox/docs/vehicle-spike.md`,
// "Proportions"). Its own panels are pressed for this body, so they are authored where they sit on it and
// fit at the vehicle origin; shared parts have their own frames and the blueprint places them.
local hb = {
  rear: -2.075,
  front: 2.075,
  side: 0.8675,
  skin: 0.8,
  sill: 0.17,
  floor: 0.3,
  waist: 0.97,
  roof: 1.4,
  roofTop: 1.44,
  rearAxle: -1.27,
  frontAxle: 1.24,
  arch: 0.36,
  archTop: 0.68,
  cowl: 0.7,
  aPost: 0.8,
  bRear: -0.36,
  bFront: -0.26,
  rearDoor: -1.14,
  rearDoorArch: -0.91,
  // The windscreen and A-pillars lean back 0.66 m between waist and roof; the tailgate glass leans forward
  // 0.31 m; the rear door frame and C-pillar edge lean forward 0.22 m.
  aLean: 0.66,
  dLean: 0.31,
  cLean: 0.22,
  tailWaist: -1.98,
  cWaist: -1.106,
  hatchSide: 0.62,
  glassIn: 0.74,
  glassOut: 0.82,
  hood(x):: 0.94 - (x - 0.8) * 0.105,
  roofRear:: self.tailWaist + self.dLean,
  roofFront:: self.aPost - self.aLean,
};
local doorWindowTop = hb.roof - 0.03;
local paintFinish = { paint: 'paint-oxblood', trim: 'plastic-black', glass: 'glass-clear' };

// The shell carries the wiring, trim and sound deadening that no part models, so the fitted car weighs
// what the reference does at the kerb.
local shell = compound('hatchback_shell', 520, [
  box('floor_pan', 'pan', [-0.95, 0.2, -hb.skin], [hb.cowl, hb.floor, hb.skin]),
  box('carpet', 'carpet', [-0.95, hb.floor, -0.76], [hb.cowl, hb.floor + 0.01, 0.76]),
  box('tunnel', 'carpet', [-0.6, hb.floor, -0.12], [hb.cowl, 0.45, 0.12]),
  box('rear_floor', 'pan', [hb.tailWaist, 0.38, -hb.skin], [-0.95, 0.48, hb.skin]),
  box('bulkhead', 'paint', [hb.cowl, hb.floor, -0.78], [hb.aPost, 0.93, 0.78]),
  box('slam_panel', 'paint', [1.95, 0.35, -0.6], [2.0, 0.8, 0.6]),
  box('rear_panel', 'paint', [-2.06, 0.45, -hb.skin], [hb.tailWaist, 0.62, hb.skin]),
  box('roof', 'paint', [hb.roofRear, hb.roof, -0.7], [hb.roofFront, hb.roofTop, 0.7]),
  box('headliner', 'headliner', [-1.6, hb.roof - 0.02, -0.68], [0.1, hb.roof, 0.68]),
] + bothSides([
  box('sill', 'paint', [hb.rearDoorArch, hb.sill, hb.skin - 0.02], [hb.aPost, hb.floor, hb.side]),
  box('chassis_leg', 'pan', [hb.aPost, hb.floor, 0.55], [1.95, 0.42, 0.62]),
  box('strut_tower', 'paint', [0.85, 0.42, 0.55], [1.7, 0.85, 0.6]),
  box('a_post', 'paint', [hb.cowl, hb.floor, hb.skin - 0.02], [hb.aPost, hb.waist, hb.side]),
  prism('a_pillar', 'paint', [[0.66, hb.waist], [hb.aPost, hb.waist], [hb.aPost - hb.aLean, hb.roof], [0.66 - hb.aLean, hb.roof]], [hb.glassIn - 0.02, hb.glassOut]),
  box('b_pillar', 'paint', [hb.bRear, hb.floor, hb.skin - 0.02], [hb.bFront, hb.roof - 0.02, hb.glassOut + 0.02]),
  box('cant_rail', 'paint', [hb.roofRear, hb.roof - 0.04, 0.66], [hb.roofFront, hb.roof + 0.02, hb.glassOut]),
  box('quarter_rear', 'paint', [-1.96, hb.floor, hb.skin], [hb.rearAxle - hb.arch, hb.waist, hb.side]),
  box('quarter_arch', 'paint', [hb.rearAxle - hb.arch, hb.archTop, hb.skin], [hb.rearDoor, hb.waist, hb.side]),
  box('boot_side', 'trim', [hb.tailWaist, 0.48, 0.7], [-1.0, hb.waist, hb.skin]),
  prism('c_pillar', 'paint', [[hb.tailWaist, hb.waist], [hb.cWaist, hb.waist], [hb.cWaist + hb.cLean, hb.roof], [hb.tailWaist + hb.dLean, hb.roof]], [hb.glassIn, hb.glassOut]),
  prism('d_pillar', 'paint', [[hb.tailWaist, hb.waist], [hb.tailWaist + 0.08, hb.waist], [hb.tailWaist + 0.08 + hb.dLean, hb.roof], [hb.tailWaist + hb.dLean, hb.roof]], [hb.hatchSide, hb.glassIn]),
]), { pan: 'paint-charcoal', paint: 'paint-oxblood', carpet: 'plastic-black', headliner: 'cloth-rag', trim: 'plastic-black' });

// Side doors hinge on their leading edge, the handle near the trailing one; the far doors are the near
// ones reflected. `glass` runs from the trailing edge at the waist, counterclockwise.
local door(id, massKg, lower, glass) = compound(id, massKg, lower + [
  box('trim', 'trim', [glass[0][0] + 0.02, hb.floor + 0.02, hb.skin - 0.03], [glass[1][0] - 0.02, hb.waist - 0.02, hb.skin]),
  prism('glass', 'glass', glass, [hb.skin, hb.skin + 0.01]),
  box('handle', 'trim', [glass[0][0] + 0.08, 0.86, hb.side], [glass[0][0] + 0.2, 0.89, hb.side + 0.015]),
], paintFinish, {
  hinge_a: ['skin', [1, 0.2, 1]],
  hinge_b: ['skin', [1, 0.8, 1]],
});
local frontDoor = door('hatchback_front_door', 24, [
  box('skin', 'paint', [hb.bFront, hb.floor, hb.skin], [hb.cowl, hb.waist, hb.side]),
], [[hb.bFront, hb.waist], [hb.cowl, hb.waist], [hb.cowl - (doorWindowTop - hb.waist) * hb.aLean / (hb.roof - hb.waist), doorWindowTop], [hb.bFront, doorWindowTop]]);
local rearDoor = door('hatchback_rear_door', 20, [
  box('skin', 'paint', [hb.rearDoorArch, hb.floor, hb.skin], [hb.bRear, hb.waist, hb.side]),
  box('skin_arch', 'paint', [hb.rearDoor, hb.archTop, hb.skin], [hb.rearDoorArch, hb.waist, hb.side]),
], [[hb.cWaist, hb.waist], [hb.bRear, hb.waist], [hb.bRear, doorWindowTop], [hb.cWaist + (doorWindowTop - hb.waist) * hb.cLean / (hb.roof - hb.waist), doorWindowTop]]);

// The whole rear opening, glass and all, lifts as one about the roof's rear edge.
local tailgate = compound('hatchback_tailgate', 16, [
  box('skin', 'paint', [-2.02, 0.62, -hb.hatchSide], [hb.tailWaist, hb.waist, hb.hatchSide]),
  prism('glass', 'glass', [[hb.tailWaist - 0.01, hb.waist], [hb.tailWaist + 0.03, hb.waist], [hb.tailWaist + 0.03 + hb.dLean, hb.roof], [hb.tailWaist - 0.01 + hb.dLean, hb.roof]], [-hb.hatchSide + 0.02, hb.hatchSide - 0.02]),
  box('handle', 'trim', [-2.03, 0.75, -0.12], [-2.02, 0.8, 0.12]),
], paintFinish, {
  hinge_a: ['glass', [1, 1, 1]],
  hinge_b: ['glass', [1, 1, 0]],
});

local windscreen = compound('hatchback_windscreen', 11, [
  prism('glass', 'glass', [[hb.cowl, hb.waist], [hb.cowl + 0.06, hb.waist], [hb.cowl + 0.06 - hb.aLean, hb.roof], [hb.cowl - hb.aLean, hb.roof]], [-(hb.glassIn - 0.02), hb.glassIn - 0.02]),
], { glass: 'glass-clear' });
local bonnet = compound('hatchback_bonnet', 12, [
  prism('skin', 'paint', [[hb.aPost, hb.hood(hb.aPost) - 0.02], [2.0, hb.hood(2.0) - 0.02], [2.0, hb.hood(2.0)], [hb.aPost, hb.hood(hb.aPost)]], [-0.76, 0.76]),
], { paint: 'paint-oxblood' });
local frontWing = compound('hatchback_front_wing', 4, [
  box('rear', 'paint', [hb.aPost, hb.floor, hb.skin], [hb.frontAxle - hb.arch, hb.hood(hb.frontAxle - hb.arch), hb.side]),
  prism('arch', 'paint', [[hb.frontAxle - hb.arch, hb.archTop], [hb.frontAxle + hb.arch, hb.archTop], [hb.frontAxle + hb.arch, hb.hood(hb.frontAxle + hb.arch)], [hb.frontAxle - hb.arch, hb.hood(hb.frontAxle - hb.arch)]], [hb.skin, hb.side]),
  prism('nose', 'paint', [[hb.frontAxle + hb.arch, 0.35], [2.0, 0.35], [2.0, hb.hood(2.0)], [hb.frontAxle + hb.arch, hb.hood(hb.frontAxle + hb.arch)]], [hb.skin, hb.side]),
], { paint: 'paint-oxblood' });
local bumper(id, massKg, x, extra) = compound(id, massKg, [box('bar', 'paint', [x[0], 0.25, -(hb.side - 0.03)], [x[1], 0.55, hb.side - 0.03])] + extra, paintFinish);
local frontBumper = bumper('hatchback_front_bumper', 6, [1.95, hb.front], [
  box('grille', 'trim', [1.98, 0.58, -0.4], [2.03, 0.78, 0.4]),
  box('intake', 'trim', [hb.front, 0.3, -0.4], [hb.front + 0.01, 0.42, 0.4]),
]);
local rearBumper = bumper('hatchback_rear_bumper', 5, [hb.rear, -1.95], []);
local tailLamp = compound('hatchback_tail_lamp', 1, [
  box('lens', 'lens', [-2.03, 0.62, hb.hatchSide], [-1.96, 0.88, 0.84]),
], { lens: 'plastic-red' });

// Running gear: MacPherson struts in front, a twist beam behind.
local frontStrut = compound('hatchback_front_strut', 14, [
  box('lower_arm', 'steel', [1.1, 0.2, 0.35], [1.4, 0.26, 0.6]),
  box('knuckle', 'steel', [1.19, 0.26, 0.6], [1.29, 0.38, 0.645]),
  turned('damper', 'spring', 'y', disc(0.035, 0, 0.47), [hb.frontAxle, 0.38, 0.62]),
], { steel: 'steel-grey', spring: 'paint-charcoal' }, { hub: ['knuckle', [0.5, 0.5, 1]] });
local rearAxle = compound('hatchback_rear_axle', 30, [
  box('beam', 'steel', [-1.1, 0.25, -0.56], [-1.02, 0.33, 0.56]),
] + bothSides([
  box('trailing_arm', 'steel', [-1.3, 0.27, 0.56], [-0.96, 0.34, 0.6]),
  box('stub', 'steel', [-1.31, 0.28, 0.6], [-1.23, 0.36, 0.645]),
  turned('spring_seat', 'spring', 'y', disc(0.045, 0, 0.04), [-1.22, 0.34, 0.5]),
]), { steel: 'steel-grey', spring: 'paint-charcoal' });

// The engine bay: a transverse four with its gearbox on the far side, the radiator ahead of it.
local engine = compound('hatchback_engine', 140, [
  box('sump', 'casting', [1.32, hb.floor, -0.25], [1.58, 0.38, 0.2]),
  box('block', 'casting', [1.3, 0.38, -0.3], [1.62, 0.72, 0.25]),
  box('head', 'casting', [1.33, 0.72, -0.28], [1.6, 0.8, 0.23]),
  box('cam_cover', 'cover', [1.35, 0.8, -0.26], [1.55, 0.83, 0.21]),
  box('intake', 'casting', [1.24, 0.55, -0.25], [1.3, 0.75, 0.2]),
], { casting: 'steel-grey', cover: 'paint-charcoal' });
local gearbox = compound('hatchback_gearbox', 35, [
  box('case', 'casting', [1.22, 0.33, -0.52], [1.5, 0.62, -0.3]),
], { casting: 'steel-grey' });
local radiator = compound('hatchback_radiator', 6, [
  box('core', 'core', [1.86, 0.38, -0.5], [1.92, 0.78, 0.5]),
], { core: 'paint-charcoal' });
local fuelTank = compound('hatchback_fuel_tank', 8, [
  box('tank', 'tank', [-0.92, 0.12, -0.65], [-0.5, 0.2, -0.15]),
], { tank: 'polymer-black' });
local exhaust = compound('hatchback_exhaust', 12, [
  box('pipe', 'steel', [-1.4, 0.13, 0.05], [1.3, 0.18, 0.11]),
  box('silencer', 'steel', [-1.85, 0.16, -0.3], [-1.4, 0.32, 0.3]),
  box('tailpipe', 'steel', [-2.1, 0.2, 0.2], [-1.85, 0.25, 0.26]),
], { steel: 'scrap-rusted' });

// The cabin: the driver sits on the near side.
local dashboard = compound('hatchback_dashboard', 14, [
  box('lower', 'trim', [0.55, 0.45, -0.74], [hb.cowl, 0.8, 0.74]),
  box('top', 'trim', [0.38, 0.8, -0.74], [hb.cowl, 0.92, 0.74]),
  box('console', 'trim', [0.1, hb.floor, -0.1], [0.55, 0.55, 0.1]),
  box('column', 'trim', [0.33, 0.74, 0.33], [0.55, 0.82, 0.41]),
], { trim: 'plastic-black' });
local rearSeat = compound('hatchback_rear_seat', 20, [
  box('base', 'frame', [-0.95, hb.floor, -0.68], [-0.55, 0.44, 0.68]),
  box('cushion', 'cloth', [-1.0, 0.44, -0.68], [-0.52, 0.55, 0.68]),
  prism('back', 'cloth', [[-1.05, 0.53], [-0.95, 0.53], [-1.12, 1.2], [-1.22, 1.2]], [-0.68, 0.68]),
], { frame: 'steel-grey', cloth: 'cloth-seat' });

// Load bodies, authored where they sit on their host and fitted at its origin. Floor edges lie on the 0.1 m
// inventory cell lattice, so cargo spaces can cover the whole floor.
local bed = { rear: -2.2, front: -0.1, side: 0.8, floor: 0.85, top: 1.22 };
local bedFloor = compound('pickup_bed_floor', 45, [
  box('deck', 'deck', [bed.rear, bed.floor - 0.05, -bed.side], [bed.front, bed.floor, bed.side]),
  box('bearers', 'steel', [bed.rear, 0.55, -0.45], [bed.front, bed.floor - 0.05, 0.45]),
], { deck: 'paint-charcoal', steel: 'steel-grey' });
// A 4WD's wheel tub rises through the bed floor's edge, leaving the widest cargo space between the tubs.
local bedSide = compound('pickup_bed_side', 24, [
  box('panel', 'paint', [bed.rear, 0.62, bed.side], [bed.front, bed.top, bed.side + 0.06]),
  box('wheel_tub', 'paint', [-1.7, 0.55, 0.6], [-0.7, bed.floor + 0.1, bed.side]),
], { paint: 'paint-terracotta' });
local bedFront = compound('pickup_bed_front', 10, [
  box('headboard', 'paint', [bed.front, bed.floor - 0.05, -bed.side - 0.06], [bed.front + 0.06, bed.top, bed.side + 0.06]),
], { paint: 'paint-terracotta' });
local van = { rear: -3.0, front: 1.2, side: 1.0, floor: 1.0, roof: 3.0, skin: 0.06 };
local vanFloor = compound('box_van_floor', 180, [
  box('deck', 'deck', [van.rear, van.floor - 0.03, -van.side], [van.front, van.floor, van.side]),
  box('subframe', 'steel', [van.rear, 0.72, -0.45], [van.front, van.floor - 0.03, 0.45]),
], { deck: 'paint-charcoal', steel: 'steel-grey' });
local vanSide = compound('box_van_side', 70, [
  box('panel', 'paint', [van.rear, van.floor - 0.1, van.side], [van.front, van.roof, van.side + van.skin]),
], { paint: 'plastic-white' });
local vanFront = compound('box_van_front', 45, [
  box('panel', 'paint', [van.front, van.floor, -van.side - van.skin], [van.front + van.skin, van.roof, van.side + van.skin]),
], { paint: 'plastic-white' });
local vanRoof = compound('box_van_roof', 40, [
  box('panel', 'paint', [van.rear, van.roof, -van.side - van.skin], [van.front + van.skin, van.roof + van.skin, van.side + van.skin]),
], { paint: 'plastic-white' });

// Parts real cars share: each has its own frame, about its mount or centre, so any host can place it.
local wheel = compound('wheel_205_55r16', 18, [
  turned('tyre', 'tyre', 'z', [[-0.1025, 0.203], [-0.1025, 0.295], [-0.085, 0.316], [0.085, 0.316], [0.1025, 0.295], [0.1025, 0.203], [-0.1025, 0.203]]),
  turned('rim', 'rim', 'z', disc(0.203, -0.07, 0.07)),
], { tyre: 'rubber-black', rim: 'steel-grey' }, { hub: ['rim', [0.5, 0.5, 0.5]] });
local frontSeat = compound('front_seat', 16, [
  box('base', 'frame', [-0.25, 0, -0.24], [0.25, 0.1, 0.24]),
  box('cushion', 'cloth', [-0.26, 0.1, -0.25], [0.24, 0.24, 0.25]),
  prism('back', 'cloth', [[-0.3, 0.2], [-0.18, 0.2], [-0.3, 0.84], [-0.42, 0.84]], [-0.25, 0.25]),
  box('headrest', 'cloth', [-0.45, 0.86, -0.13], [-0.35, 1.04, 0.13]),
], { frame: 'steel-grey', cloth: 'cloth-seat' }, { hips: ['cushion', [0.4, 1, 0.5]] });
local doorMirror = compound('door_mirror', 1, [
  box('arm', 'housing', [-0.03, 0.02, 0], [0.03, 0.06, 0.06]),
  box('housing', 'housing', [-0.04, 0, 0.06], [0.04, 0.12, 0.2]),
  box('glass', 'glass', [-0.05, 0.01, 0.07], [-0.04, 0.11, 0.19]),
], { housing: 'polymer-black', glass: 'glass-grey' }, { mount: ['arm', [0.5, 0.5, 0]] });
local steeringWheel = compound('steering_wheel', 2, [
  turned('rim', 'grip', 'x', annulus(0.17, 0.19, 0, 0.03)),
  turned('hub', 'hub', 'x', disc(0.06, 0, 0.05)),
  box('spoke', 'hub', [0.01, -0.17, -0.02], [0.03, 0, 0.02]),
], { grip: 'polymer-black', hub: 'plastic-black' }, { column: ['hub', [1, 0.5, 0.5]] });
local gearLever = compound('gear_lever', 1, [
  box('gaiter', 'gaiter', [-0.05, 0, -0.05], [0.05, 0.03, 0.05]),
  turned('stick', 'stick', 'y', disc(0.008, 0, 0.22)),
  turned('knob', 'knob', 'y', [[0, 0], [0, 0.02], [0.03, 0.025], [0.05, 0.015], [0.055, 0], [0, 0]], [0, 0.2, 0]),
], { gaiter: 'rubber-black', stick: 'steel-grey', knob: 'polymer-black' });

[
  part('car_battery', 'carton', 14, {
    width: 0.24, height: 0.17, depth: 0.175, lidHeight: 0.02, bandHeight: 0.06, bandInset: 0.0005,
    handleHeight: 0, handleWidth: 0.12, handleDepth: 0.04, handleWall: 0.006,
  }, { body: 'plastic-black', label: 'plastic-red', cap: 'plastic-black' }, {
    base: ['body', [0.5, 0, 0.5]],
    // Off the centre plane, so reflecting the battery moves its terminal to the other side.
    terminal_positive: ['lid', [0.8, 1, 0.2]],
  }, exportMass='parts'),
  part('car_headlamp', 'block', 1.2, { width: 0.08, height: 0.16, depth: 0.22 }, { body: 'glass-grey' }, {
    mount: ['body', [0, 0.5, 0.15]],
    beam: ['body', [1, 0.5, 0.5]],
  }, exportMass='parts'),
  tray('hatchback_battery_tray', 1.5, 0.28, 0.02, 0.21, exportMass='parts'),
  tray('pickup_battery_tray', 2.2, 0.32, 0.03, 0.24, exportMass='parts'),
  // One inventory cell; a fitting scales it to the cargo space's size. The space weighs next to nothing: its
  // load is its contents.
  part('cargo_space', 'block', 0.2, { width: 0.1, height: 0.1, depth: 0.1 }, { body: 'plastic-green' }, {}, exportMass='parts'),
  bedFloor,
  bedSide,
  bedFront,
  vanFloor,
  vanSide,
  vanFront,
  vanRoof,
  wheel,
  frontSeat,
  doorMirror,
  steeringWheel,
  gearLever,
  shell,
  frontDoor,
  rearDoor,
  tailgate,
  windscreen,
  bonnet,
  frontWing,
  frontBumper,
  rearBumper,
  tailLamp,
  frontStrut,
  rearAxle,
  engine,
  gearbox,
  radiator,
  fuelTank,
  exhaust,
  dashboard,
  rearSeat,
]
