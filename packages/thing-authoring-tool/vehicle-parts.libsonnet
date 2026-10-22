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

// The crane truck keeps the 1/32 m grid its look was approved on: pieces are grid points with the rear
// underrun at x 0, the ground at y 0 and the centre plane at z 32; `ht.at` turns one into metres.
local ht = { at(p):: [(p[0] - 96) / 32, p[1] / 32, (p[2] - 32) / 32] };
local pi = 3.141592653589793;
local hbox(id, slot, min, max) = box(id, slot, ht.at(min), ht.at(max));
local hprism(id, slot, profile, z) = prism(id, slot, [[(p[0] - 96) / 32, p[1] / 32] for p in profile], [(z[0] - 32) / 32, (z[1] - 32) / 32]);
// A disc or ring about `axis` through `centre`, spanning `span` along that axis.
local hdisc(id, slot, axis, centre, radius, span, inner=0) =
  local i = { x: 0, y: 1, z: 2 }[axis];
  local mid = (span[0] + span[1]) / 2;
  local half = (span[1] - span[0]) / 2 / 32;
  turned(id, slot, axis, if inner == 0 then disc(radius / 32, -half, half) else annulus(inner / 32, radius / 32, -half, half),
         ht.at([if j == i then mid else centre[j] for j in [0, 1, 2]]));
// A straight member of full `width` from `a` to `b` in the side view.
local htube(id, slot, a, b, width, z) =
  local len = std.sqrt(std.pow(b[0] - a[0], 2) + std.pow(b[1] - a[1], 2));
  local n = [-(b[1] - a[1]) * width / 2 / len, (b[0] - a[0]) * width / 2 / len];
  hprism(id, slot, [[a[0] - n[0], a[1] - n[1]], [b[0] - n[0], b[1] - n[1]], [b[0] + n[0], b[1] + n[1]], [a[0] + n[0], a[1] + n[1]]], z);
local harc(id, slot, centre, inner, outer, from, to, segments, z) = [
  local a = from + (to - from) * i / segments;
  local b = from + (to - from) * (i + 1) / segments;
  local at(r, t) = [centre[0] + r * std.cos(t), centre[1] + r * std.sin(t)];
  hprism(id + '_' + i, slot, [at(inner, a), at(outer, a), at(outer, b), at(inner, b)], z)
  for i in std.range(0, segments - 1)
];
local hoistFinish = {
  chassis: 'paint-charcoal',
  radiator: 'paint-charcoal',
  trim: 'plastic-black',
  dash: 'plastic-black',
  grille: 'plastic-black',
  chrome: 'steel-stainless',
  badge: 'steel-stainless',
  engine: 'steel-grey',
  hub: 'steel-grey',
  alloy: 'steel',
  tank: 'polymer-od-green',
  tail: 'plastic-red',
  amber: 'plastic-yellow',
  carpet: 'rubber-black',
  headliner: 'cloth-rag',
  seat: 'cloth-seat',
  card: 'cloth-seat',
  load: 'wood-birch',
  glass: 'glass-clear',
  crane: 'paint-crane-yellow',
  paint: 'paint-cream',
  plate: 'plastic-white',
  dial: 'plastic-white',
};
local hpart(id, massKg, pieces, anchors={}) = compound(id, massKg, pieces, hoistFinish, anchors);

local hoistFrameRail = hpart('hoist_frame_rail', 110, [hbox('rail', 'chassis', [4, 13, 46], [188, 17, 50])]);
local hoistCrossmember = hpart('hoist_crossmember', 15, [box('beam', 'chassis', [0, 0, 0], [4 / 32, 3 / 32, 28 / 32])]);
local hoistWheel = compound('hoist_wheel', 30, [
  turned('tyre', 'tyre', 'z', annulus(6.5 / 32, 12 / 32, -3.5 / 32, 3.5 / 32)),
  turned('rim', 'rim', 'z', disc(6.5 / 32, -3 / 32, 3 / 32)),
], { tyre: 'rubber-black', rim: 'steel-grey' }, { hub: ['rim', [0.5, 0.5, 0.5]] });
local hoistAxle(id, x) = hpart(id, 140, [
  hbox('beam', 'chassis', [x - 2, 10, 14], [x + 2, 13, 50]),
  hbox('diff', 'chassis', [x - 4, 6, 25], [x + 5, 13, 35]),
  hdisc('hub_near', 'hub', 'z', [x, 12, 0], 4.5, [50, 51]),
  hdisc('hub_far', 'hub', 'z', [x, 12, 0], 4.5, [13, 14]),
]);
local hoistFrontAxle = hoistAxle('hoist_front_axle', 157);
local hoistRearAxle = hoistAxle('hoist_rear_axle', 48);
// The alloy top is ringed by the block rather than sunk into it, so no two finishes share a face.
local hoistEngine = hpart('hoist_engine', 280, [
  hbox('block', 'engine', [140, 17, 22], [168, 26, 42]),
  hbox('block_far', 'engine', [140, 26, 22], [168, 29, 24]),
  hbox('block_near', 'engine', [140, 26, 40], [168, 29, 42]),
  hbox('block_rear', 'engine', [140, 26, 24], [142, 29, 40]),
  hbox('block_front', 'engine', [166, 26, 24], [168, 29, 40]),
  hbox('top', 'alloy', [142, 26, 24], [166, 29, 40]),
  hbox('sump', 'engine', [144, 14, 26], [164, 17, 38]),
  hbox('mount_far', 'chassis', [148, 15, 18], [152, 17, 22]),
  hbox('mount_near', 'chassis', [148, 15, 42], [152, 17, 46]),
  hdisc('fan', 'trim', 'x', [0, 23, 32], 5.5, [168, 170]),
]);
local hoistGearbox = hpart('hoist_gearbox', 70, [
  hbox('case', 'engine', [118, 17, 27], [140, 25, 37]),
  hbox('transfer', 'engine', [126, 12, 28], [136, 17, 36]),
]);
local hoistPropShaft = hpart('hoist_prop_shaft', 18, [htube('shaft', 'chassis', [53, 11], [118, 20], 3, [31, 34])]);
local hoistFuelTank = hpart('hoist_fuel_tank', 55, [hbox('tank', 'tank', [70, 8, 4], [100, 17, 14])]);
local hoistExhaust = hpart('hoist_exhaust', 18, [
  hdisc('pipe', 'engine', 'x', [0, 14, 52], 1.6, [104, 128]),
  hbox('silencer', 'engine', [84, 10, 50], [104, 16, 58]),
  hdisc('tailpipe', 'engine', 'x', [0, 12, 54], 1.6, [70, 84]),
]);
local hoistRadiator = hpart('hoist_radiator', 15, [hbox('core', 'radiator', [182, 16, 20], [186, 29, 44])]);

// The cab tilts over the engine, so its floor carries the cab and sits on four mounts.
local hoistCabFloor = hpart('hoist_cab_floor', 80, [
  hbox('floor', 'chassis', [132, 30, 3], [188, 32, 61]),
  hbox('carpet', 'carpet', [135, 32, 8], [178, 33, 56]),
] + [
  hbox('mount_' + x + '_' + z, 'chassis', [x, 17, z], [x + 4, 30, z + 4])
  for x in [134, 178]
  for z in [14, 46]
]);
// The step below the door follows the front wheel arch in strips, since a compound cannot cut a hole.
local hoistCabSkirt = hpart('hoist_cab_skirt', 10, [
  hbox('rear', 'paint', [132, 18, 57], [143.5, 30, 61]),
  hbox('front', 'paint', [170.5, 18, 57], [188, 30, 61]),
] + [
  local x0 = 143.5 + 1.5 * i;
  local dx = std.max(0, std.max(x0 - 157, 157 - (x0 + 1.5)));
  hbox('strip_' + i, 'paint', [x0, std.max(18, 12 + std.sqrt(13.5 * 13.5 - dx * dx)), 57], [x0 + 1.5, 30, 61])
  for i in std.range(0, 17)
] + harc('arch', 'trim', [157, 12], 13.5, 15.5, 0, pi, 8, [61, 62]));
local hoistCabBack = hpart('hoist_cab_back', 35, [
  hbox('wall_low', 'paint', [132, 32, 3], [135, 48, 61]),
  hbox('wall_high', 'paint', [132, 58, 3], [135, 67, 61]),
  hbox('wall_far', 'paint', [132, 48, 3], [135, 58, 14]),
  hbox('wall_near', 'paint', [132, 48, 50], [135, 58, 61]),
  hbox('glass', 'glass', [132, 48, 14], [135, 58, 50]),
  hbox('pillar_near', 'paint', [135, 32, 57], [138, 67, 61]),
  hbox('pillar_far', 'paint', [135, 32, 3], [138, 67, 7]),
]);
local hoistFrontPanel = hpart('hoist_front_panel', 20, [
  hbox('face', 'paint', [185, 32, 7], [188, 46, 57]),
  hbox('corner_near', 'paint', [183, 32, 57], [188, 46, 61]),
  hbox('corner_far', 'paint', [183, 32, 3], [188, 46, 7]),
  hbox('grille', 'grille', [188, 34, 18], [188.5, 42, 46]),
  hbox('badge', 'badge', [188, 43, 28], [188.5, 45, 36]),
]);
local hoistAPost = hpart('hoist_a_post', 6, [hbox('post', 'paint', [183, 46, 57], [188, 67, 61])]);
local hoistWindscreen = hpart('hoist_windscreen', 14, [hbox('glass', 'glass', [186, 46, 7], [187, 67, 57])]);
local hoistRoof = hpart('hoist_roof', 30, [
  hprism('skin', 'paint', [[132, 67], [188, 67], [185, 70], [132, 70]], [3, 61]),
  hbox('headliner', 'headliner', [135, 66, 8], [183, 67, 56]),
]);
// The door hinges on its leading edge, against the A-post.
local hoistDoor = hpart('hoist_door', 30, [
  hbox('skin', 'paint', [138, 32, 57], [183, 46, 61]),
  hbox('card', 'card', [138, 32, 56], [183, 46, 57]),
  hbox('frame_low', 'trim', [138, 46, 57], [183, 47, 61]),
  hbox('frame_high', 'trim', [138, 65, 57], [183, 67, 61]),
  hbox('frame_rear', 'trim', [138, 47, 57], [140, 65, 61]),
  hbox('frame_front', 'trim', [181, 47, 57], [183, 65, 61]),
  hbox('glass', 'glass', [140, 47, 57], [181, 65, 61]),
  hbox('handle', 'chrome', [140, 40, 61], [145, 41, 62]),
], {
  hinge_a: ['skin', [1, 0.2, 1]],
  hinge_b: ['skin', [1, 0.8, 1]],
});
local hoistFrontBumper = hpart('hoist_front_bumper', 20, [
  hbox('bar', 'trim', [188, 18, 3], [191, 26, 61]),
  hbox('bracket_far', 'chassis', [188, 13, 14], [190, 18, 18]),
  hbox('bracket_near', 'chassis', [188, 13, 46], [190, 18, 50]),
  hbox('plate', 'plate', [191, 20, 26], [192, 24, 38]),
]);
local hoistDashboard = hpart('hoist_dashboard', 18, [
  hbox('lower', 'dash', [178, 32, 8], [185, 46, 56]),
  hbox('binnacle', 'dash', [178, 46, 43], [183, 53, 54]),
  hbox('dial', 'dial', [177.5, 49, 44], [178, 52, 53]),
]);
local hoistEngineCover = hpart('hoist_engine_cover', 12, [hbox('cover', 'trim', [150, 33, 24], [176, 40, 40])]);
local hoistBench = hpart('hoist_bench', 30, [
  hbox('cushion', 'seat', [138, 33, 9], [150, 44, 55]),
  hbox('back', 'seat', [135, 44, 9], [138, 62, 55]),
], { hips: ['cushion', [0.4, 1, 0.5]] });

local hoistDeckFloor = hpart('hoist_deck_floor', 120, [
  hbox('floor', 'load', [4, 28, 3], [110, 30, 61]),
  hbox('bearer_far', 'chassis', [4, 17, 14], [110, 28, 18]),
  hbox('bearer_near', 'chassis', [4, 17, 46], [110, 28, 50]),
]);
local hoistHeadboard = hpart('hoist_headboard', 15, [hbox('board', 'paint', [108, 30, 3], [110, 40, 61])]);
local hoistMudguard = hpart('hoist_mudguard', 4, harc('guard', 'trim', [48, 12], 13.5, 16.5, std.asin(4 / 13.5), pi - std.asin(4 / 13.5), 8, [51, 59]));
local hoistRearUnderrun = hpart('hoist_rear_underrun', 20, [
  hbox('leg_far', 'chassis', [0, 12, 14], [4, 17, 18]),
  hbox('leg_near', 'chassis', [0, 12, 46], [4, 17, 50]),
  hbox('bar', 'trim', [0, 8, 6], [3, 12, 58]),
  hbox('lamp_bracket_far', 'chassis', [0, 17, 6], [2, 18, 18]),
  hbox('lamp_bracket_near', 'chassis', [0, 17, 46], [2, 18, 58]),
  hbox('plate', 'plate', [0, 12, 26], [1, 16, 38]),
]);
local hoistTailLamp = hpart('hoist_tail_lamp', 1, [
  hbox('indicator', 'amber', [0, 18, 50], [2, 20, 58]),
  hbox('lens', 'tail', [0, 20, 50], [2, 23, 58]),
]);

local hoistCraneBase = hpart('hoist_crane_base', 180, [
  hbox('sill_far', 'crane', [112, 17, 14], [130, 26, 18]),
  hbox('sill_near', 'crane', [112, 17, 46], [130, 26, 50]),
  hbox('plate', 'crane', [112, 26, 14], [130, 30, 50]),
]);
local hoistStabiliser = hpart('hoist_stabiliser', 45, [
  hbox('beam', 'crane', [116, 22, 50], [126, 26, 60]),
  hbox('leg', 'crane', [118, 12, 56], [124, 22, 60]),
  hbox('foot', 'trim', [116, 10, 55], [126, 12, 61]),
]);
local hoistCraneColumn = hpart('hoist_crane_column', 140, [
  hdisc('slew_ring', 'chassis', 'y', [121, 0, 32], 7, [30, 34]),
  hbox('post', 'crane', [117, 34, 28], [125, 56, 36]),
  hbox('cheek_far', 'crane', [116, 52, 25], [126, 64, 28]),
  hbox('cheek_near', 'crane', [116, 52, 36], [126, 64, 39]),
  hdisc('pin_far', 'chrome', 'z', [121, 60, 0], 2, [24, 25]),
  hdisc('pin_near', 'chrome', 'z', [121, 60, 0], 2, [39, 40]),
]);
local hoistBoom = hpart('hoist_boom', 90, [htube('boom', 'crane', [122, 60], [68, 52], 6, [28, 36])]);
local hoistBoomExtension = hpart('hoist_boom_extension', 70, [htube('extension', 'crane', [75, 53], [14, 44], 4.5, [29, 35])]);
local hoistLuffRam = hpart('hoist_luff_ram', 35, [htube('ram', 'chrome', [116.8, 40], [92, 50.5], 3, [30, 34])]);
local hoistWinch = hpart('hoist_winch', 45, [
  hdisc('drum', 'chassis', 'z', [128, 44, 0], 3.5, [27, 37]),
  hdisc('flange_far', 'crane', 'z', [128, 44, 0], 4.5, [26, 27]),
  hdisc('flange_near', 'crane', 'z', [128, 44, 0], 4.5, [37, 38]),
]);
local hoistHookBlock = hpart('hoist_hook_block', 15, [
  hbox('block', 'amber', [12, 36, 30], [18, 41, 34]),
  hbox('hook', 'chrome', [14, 33, 31], [16, 36, 33]),
]);
local hoistBoomRest = hpart('hoist_boom_rest', 8, [hbox('rest', 'crane', [22, 30, 29], [26, 42, 35])]);

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
  hoistFrameRail,
  hoistCrossmember,
  hoistWheel,
  hoistFrontAxle,
  hoistRearAxle,
  hoistEngine,
  hoistGearbox,
  hoistPropShaft,
  hoistFuelTank,
  hoistExhaust,
  hoistRadiator,
  hoistCabFloor,
  hoistCabSkirt,
  hoistCabBack,
  hoistFrontPanel,
  hoistAPost,
  hoistWindscreen,
  hoistRoof,
  hoistDoor,
  hoistFrontBumper,
  hoistDashboard,
  hoistEngineCover,
  hoistBench,
  hoistDeckFloor,
  hoistHeadboard,
  hoistMudguard,
  hoistRearUnderrun,
  hoistTailLamp,
  hoistCraneBase,
  hoistStabiliser,
  hoistCraneColumn,
  hoistBoom,
  hoistBoomExtension,
  hoistLuffRam,
  hoistWinch,
  hoistHookBlock,
  hoistBoomRest,
]
