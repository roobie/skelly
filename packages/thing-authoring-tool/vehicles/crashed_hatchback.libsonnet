local b = import 'burnt_out_saloon.spec.libsonnet';
local k = import 'kit.libsonnet';
local s = import 'crashed_hatchback.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bar = b.bar;
local fbm = b.fbm;
local g = b.gauss;
local sheet = b.sheet;
local pi = std.pi;
local paintFinish = { paint: s.paint, crease: 'paint-police-blue', bare: 'steel-grey', dark: 'steel-spall-black', trim: 'plastic-black', glass: 'glass-clear' };
local roofRear = s.tailWaist + s.dLean;
local roofFront = s.aPost - s.aLean;
local height = s.roof - s.waist;
local face(z) = s.poleX + s.flare * std.abs(z - s.poleZ);
local folds(x, z) = std.abs(std.sin((x + 0.15 * z) * pi / 0.14));
// The bonnet folded up into a tent against the screen, highest along the line of the pole.
local crushTop(x, z) = 0.8 + 0.2 * g((x - 0.98) / 0.2) * g((z - s.poleZ) / 0.5) + 0.07 * folds(x, z) + 0.04 * fbm(x, z, 51) - 0.08 * std.pow(std.abs(z) / s.side, 2);
local crushSlot(a, c, seed) =
  local n = fbm(a, c, seed);
  if folds(a, c) < 0.28 then 'crease'
  else if n > 0.63 then 'bare'
  else if n < 0.36 then 'crease'
  else 'paint';
local wheelBite(x, y, axle) = std.pow(x - axle, 2) + std.pow(y - s.axleY, 2) < std.pow(s.arch - 0.02, 2);
local bodyTop(x) = s.waist;
local bottom(x) = if x < s.rearAxle + s.arch then 0.2 else s.sill;
local bodySide(x, y, front) = y >= bottom(x) && y < bodyTop(x) && !wheelBite(x, y, s.rearAxle) && !wheelBite(x, y, front);
local seamSlot(x, y) =
  if (std.abs(x - s.bFront) < 0.032 || std.abs(x - s.bRear) < 0.032 || std.abs(x - s.rearDoor) < 0.032 || std.abs(x - s.cowl) < 0.032) && y > s.sill + 0.06 then 'crease' else 'paint';
// The impact wave reaches into the front door and stops at the B-pillar.
local nearDoorSlot(x, y) =
  local n = fbm(x, y, 52);
  if x > s.bFront + 0.2 && folds(x, y * 1.4) < 0.2 then 'crease'
  else if x > 0.3 && n > 0.62 then 'bare'
  else seamSlot(x, y);
[
  k.compound('crashed_hatchback_shell', s.shellMass,
             sheet('near', 'z', [s.rear + 0.03, s.aPost], [s.sill, s.waist],
                   function(x, y) s.side - (if x > s.bFront then 0.15 * std.pow((x - s.bFront) / (s.aPost - s.bFront), 2) * (0.5 + folds(x, y)) else 0),
                   function(x, y) bodySide(x, y, s.frontNear),
                   nearDoorSlot)
             // The far front door has burst its catch, its rear edge standing proud of the B-pillar.
             + sheet('far', 'z', [s.rear + 0.03, s.aPost], [s.sill, s.waist],
                     function(x, y) -s.side + 0.0625 - (if x > s.bFront && x < s.cowl then 0.14 * (s.cowl - x) / (s.cowl - s.bFront) else 0),
                     function(x, y) bodySide(x, y, s.frontFar),
                     seamSlot)
             + [
               box('floor_pan', 'dark', [s.rear + 0.06, s.floor - 0.1, -s.skin], [s.aPost, s.floor, s.skin]),
               box('bulkhead', 'dark', [s.cowl, s.floor, -s.skin], [s.aPost, s.waist - 0.02, s.skin]),
               box('rear_panel', 'paint', [s.rear + 0.02, 0.38, -s.skin], [s.rear + 0.08, 0.55, s.skin]),
               box('roof', 'paint', [roofRear, s.roof, -s.skin + 0.08], [-0.1, s.roofTop, s.skin - 0.08]),
               box('headliner', 'lining', [roofRear + 0.08, s.roof - 0.02, -s.skin + 0.1], [roofFront - 0.08, s.roof, s.skin - 0.1]),
               box('rear_liner_near', 'dark', [s.rearAxle - s.arch, s.floor, 0.5], [s.rearAxle + s.arch, 0.66, 0.54]),
               box('rear_liner_far', 'dark', [s.rearAxle - s.arch, s.floor, -0.54], [s.rearAxle + s.arch, 0.66, -0.5]),
               box('rear_arch_top', 'dark', [s.rearAxle - s.arch, 0.62, 0.5], [s.rearAxle + s.arch, 0.66, s.skin]),
               box('rear_arch_top_far', 'dark', [s.rearAxle - s.arch, 0.62, -s.skin], [s.rearAxle + s.arch, 0.66, -0.5]),
               box('tail_rail', 'paint', [s.tailWaist - 0.04, 0.55, -s.skin], [s.tailWaist + 0.02, s.waist, -s.hatchSide]),
               box('tail_rail_near', 'paint', [s.tailWaist - 0.04, 0.55, s.hatchSide], [s.tailWaist + 0.02, s.waist, s.skin]),
             ]
             // The roof kinks upward over the front seats where the pillars drove back into it.
             + sheet('roof_front', 'y', [-0.1, roofFront + 0.03], [-s.skin + 0.08, s.skin - 0.08],
                     function(x, z) s.roofTop + 0.05 * g((x - 0.02) / 0.09) * (1 - std.abs(z) * 0.5) + 0.02 * g((x - 0.13) / 0.06),
                     function(x, z) true,
                     function(x, z) if std.abs(x - 0.02) < 0.04 && fbm(x, z, 53) < 0.5 then 'crease' else 'paint',
                     thick=0.05)
             + k.bothSides([
               box('b_pillar', 'paint', [s.bRear, s.floor, s.skin - 0.02], [s.bFront, s.roof - 0.02, s.glassOut + 0.02]),
               box('cant_rail', 'paint', [roofRear, s.roof - 0.04, s.glassIn - 0.08], [roofFront, s.roof + 0.02, s.glassOut]),
               prism('c_pillar', 'paint', [[s.tailWaist, s.waist], [s.cWaist, s.waist], [s.cWaist + s.cLean, s.roof], [s.tailWaist + s.dLean, s.roof]], [s.hatchSide, s.glassOut]),
               prism('rear_glass', 'glass', [[s.cWaist, s.waist], [s.bRear, s.waist], [s.bRear, s.roof - 0.03], [s.cWaist + s.cLean, s.roof - 0.03]], [s.skin, s.skin + 0.0156]),
               box('front_handle', 'trim', [s.bFront + 0.08, s.waist - 0.11, s.side - 0.01], [s.bFront + 0.2, s.waist - 0.08, s.side + 0.002]),
               box('rear_handle', 'trim', [s.cWaist + 0.08, s.waist - 0.11, s.side - 0.01], [s.cWaist + 0.2, s.waist - 0.08, s.side + 0.002]),
             ])
             // The pillars bow outward and back under the load; both stay standing, one more bent than the other.
             + [
               bar('a_low_near', 'paint', [s.aPost - 0.04, s.waist], [0.58, 1.17], 0.1, [s.glassIn - 0.02, s.glassOut]),
               bar('a_high_near', 'paint', [0.58, 1.17], [roofFront + 0.02, s.roof + 0.02], 0.1, [s.glassIn - 0.02, s.glassOut]),
               bar('a_low_far', 'paint', [s.aPost - 0.04, s.waist], [0.5, 1.15], 0.1, [-s.glassOut, -s.glassIn + 0.02]),
               bar('a_high_far', 'paint', [0.5, 1.15], [roofFront + 0.02, s.roof + 0.02], 0.1, [-s.glassOut, -s.glassIn + 0.02]),
             ],
             paintFinish + { lining: 'cloth-rag' }),
  k.compound('crashed_hatchback_crushed_nose', 130,
             sheet('top', 'y', [s.aPost - 0.03, 1.5], [-s.side, s.side],
                   crushTop,
                   function(x, z) x < face(z),
                   function(x, z) crushSlot(x, z, 54),
                   thick=0.1875)
             + sheet('wing_near', 'z', [s.aPost, 1.4], [0.5, 1.1],
                     function(x, y) s.side + 0.07 * folds(x, y) - 0.05,
                     function(x, y) x < face(s.side) && y < crushTop(x, s.side) && y > 0.56 + 0.1 * fbm(x, y, 55),
                     function(x, y) crushSlot(x, y, 56),
                     thick=0.125)
             + sheet('wing_far', 'z', [s.aPost, 1.4], [0.5, 1.1],
                     function(x, y) -s.side - 0.07 * folds(x, y) + 0.05,
                     function(x, y) x < face(-s.side) && y < crushTop(x, -s.side) && y > 0.56 + 0.1 * fbm(x, y, 57),
                     function(x, y) crushSlot(x, y, 58),
                     thick=-0.125)
             // Radiator, slam panel and grille, all rammed into one face with scraps of paint among them.
             + sheet('face', 'x', [-s.side - 0.03, s.side + 0.03], [0.28, 1.0],
                     function(z, y) face(z) + 0.1 * fbm(z, y, 59),
                     function(z, y) y < crushTop(face(z), z) + 0.02,
                     function(z, y)
                       local n = fbm(z, y, 60);
                       if n < 0.42 then 'dark' else if n < 0.53 then 'paint' else if n < 0.6 then 'crease' else if n < 0.66 then 'cast' else 'bare',
                     thick=0.25)
             + [
               box('crushed_mass', 'dark', [s.aPost, 0.22, -0.62], [1.05, 0.72, 0.62]),
               box('lens_shard_near', 'glass', [face(0.7) + 0.05, 0.56, 0.62], [face(0.7) + 0.11, 0.66, 0.76]),
               box('lens_shard_far', 'glass', [face(-0.7) + 0.05, 0.6, -0.72], [face(-0.7) + 0.11, 0.68, -0.6]),
             ],
             paintFinish + { cast: 'iron-cast', glass: 'glass-grey' }),
  // Crazed white where it still hangs in the frame, and holed where the driver's side gave way.
  k.compound('crashed_hatchback_windscreen', 12,
             sheet('pane', 'x', [-s.glassIn, s.glassIn], [s.waist - 0.02, s.roof],
                   function(z, y) s.cowl + 0.05 - s.aLean * (y - s.waist) / height - 0.16 * g(z / 0.6) * g((y - 1.08) / 0.16),
                   function(z, y) fbm(z, y, 61) > 0.3 && !(std.pow((z - 0.35) / 0.3, 2) + std.pow((y - 1.06) / 0.14, 2) < 1 + fbm(z, y, 62)),
                   function(z, y) if fbm(z, y, 63) > 0.56 then 'craze' else 'glass',
                   thick=0.125),
             { craze: 'plastic-frosted', glass: 'glass-clear' }),
  k.compound('crashed_hatchback_tailgate', 18, [
    box('skin', 'paint', [s.rear + 0.055, 0.55, -s.hatchSide], [s.tailWaist, s.waist, s.hatchSide]),
    prism('glass', 'glass', [[s.tailWaist - 0.01, s.waist], [s.tailWaist + 0.03, s.waist], [s.tailWaist + 0.03 + s.dLean, s.roof], [s.tailWaist - 0.01 + s.dLean, s.roof]], [-s.hatchSide + 0.02, s.hatchSide - 0.02]),
    box('handle', 'trim', [s.rear + 0.045, 0.68, -0.12], [s.rear + 0.055, 0.73, 0.12]),
  ], paintFinish),
  k.compound('crashed_hatchback_tail_lamp', 1, [
    box('lens', 'lens', [s.rear + 0.0, 0.56, s.hatchSide], [s.rear + 0.12, 0.84, s.skin + 0.03]),
  ], { lens: 'plastic-red' }),
  k.compound('crashed_hatchback_rear_bumper', 6, [
    box('bar', 'paint', [s.rear, 0.2, -s.side + 0.03], [s.rear + 0.13, 0.42, s.side - 0.03]),
  ], paintFinish),
  // Wrapped round the pole, so its middle went back with the face and its ends flare forward past the wings.
  k.compound('crashed_hatchback_front_bumper', 7,
             sheet('bar', 'x', [-s.side, s.side], [0.1, 0.6],
                   function(z, y) face(z) + 0.11,
                   function(z, y)
                     local low = 0.27 - (if z > 0.3 then (z - 0.3) * 0.28 else 0);
                     y >= low && y < low + 0.17,
                   function(z, y) if fbm(z, y, 64) > 0.64 then 'bare' else 'trim',
                   thick=0.09375),
             paintFinish),
  k.compound('crashed_hatchback_flat_wheel', 16, [
    prism('tyre', 'tyre', [[-0.2, -s.axleY], [0.2, -s.axleY], [0.33, -0.14], [0.33, 0.06], [0.22, 0.22], [0.08, 0.3], [-0.08, 0.3], [-0.22, 0.22], [-0.33, 0.06], [-0.33, -0.14]], [-0.105, 0.105]),
    prism('bulge', 'tyre', [[-0.26, -s.axleY], [0.26, -s.axleY], [0.31, -0.16], [-0.31, -0.16]], [-0.13, 0.13]),
    k.turned('rim', 'rim', 'z', k.disc(0.2, -0.0625, 0.12)) + { sides: 24 },
    k.turned('hub', 'dark', 'z', k.disc(0.07, 0.12, 0.14)) + { sides: 12 },
  ], { tyre: 'rubber-black', rim: 'steel-grey', dark: 'steel-spall-black' }),
  k.compound('crashed_hatchback_front_seat', 14, [
    box('cushion', 'seat', [-0.24, 0.06, -0.24], [0.26, 0.2, 0.24]),
    box('rails', 'trim', [-0.26, 0, -0.2], [0.26, 0.06, 0.2]),
    bar('back', 'seat', [-0.24, 0.16], [-0.36, 0.7], 0.12, [-0.24, 0.24]),
    box('head', 'seat', [-0.42, 0.74, -0.12], [-0.32, 0.88, 0.12]),
  ], { seat: 'cloth-seat', trim: 'plastic-black' }),
  k.compound('crashed_hatchback_rear_bench', 16, [
    box('cushion', 'seat', [-0.28, 0, -0.66], [0.26, 0.2, 0.66]),
    bar('back', 'seat', [-0.26, 0.16], [-0.38, 0.62], 0.12, [-0.66, 0.66]),
  ], { seat: 'cloth-seat' }),
  // Driven back into the cabin with the engine behind it, so the column rakes high and close to the seat.
  k.compound('crashed_hatchback_dash', 16, [
    box('lower', 'trim', [s.cowl - 0.2, 0.42, -s.skin + 0.05], [s.cowl, s.waist - 0.17, s.skin - 0.05]),
    box('top', 'trim', [s.cowl - 0.38, s.waist - 0.17, -s.skin + 0.05], [s.cowl, s.waist - 0.05, s.skin - 0.05]),
    box('console', 'trim', [s.cowl - 0.65, s.floor, -0.1], [s.cowl - 0.2, 0.48, 0.1]),
    bar('column', 'steel', [s.cowl - 0.3, s.waist - 0.12], [s.cowl - 0.56, s.waist + 0.08], 0.05, [-0.39, -0.33]),
    k.turned('ring', 'trim', 'x', k.annulus(0.14, 0.17, -0.0156, 0.0156), [s.cowl - 0.57, s.waist + 0.08, -0.36]) + { sides: 16 },
    box('spoke', 'trim', [s.cowl - 0.586, s.waist + 0.06, -0.51], [s.cowl - 0.554, s.waist + 0.1, -0.21]),
  ], { trim: 'plastic-black', steel: 'steel-grey' }),
  k.compound('crashed_hatchback_engine', 150, [
    box('block', 'block', [-0.25, 0.08, -0.32], [0.25, 0.42, 0.26]),
    box('head', 'block', [-0.22, 0.42, -0.26], [0.22, 0.54, 0.2]),
  ], { block: 'iron-cast' }),
]
