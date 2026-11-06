local k = import 'kit.libsonnet';
local s = import 'burnt_out_saloon.spec.libsonnet';
local box = k.box;
local sheet = s.sheet;
local bar = s.bar;
local g = s.gauss;
local fbm = s.fbm;
local finish = s.burntFinish;
local hood(x) = s.hoodBack - (x - s.aPost) * s.hoodFall;
local roofRear = s.tailWaist + s.dLean;
local roofFront = s.aPost - s.aLean;
local height = s.roof - s.waist;
local lean(y) = (y - s.waist) / height;
// The roof sags most just behind the B-pillar, toward the near side.
local sag(x, z) = 0.2 * g((x + 0.2) / 0.8) * g((z - 0.15) / 0.62);
local roofAt(x, z) = s.roof + 0.03125 - sag(x, z) - 0.03 * fbm(x, z, 5);
local lowerTop(x) = if x >= s.aPost then hood(x) else if x >= s.deckFront then s.waist else s.deck;
local lowerBottom(x) = if x > s.frontAxle - s.arch || x < s.rearAxle + s.arch then 0.125 else s.sill;
local inArch(x, y, axle) = std.pow(x - axle, 2) + std.pow(y - s.axleY, 2) < s.arch * s.arch;
local lowerSide(x, y) = y >= lowerBottom(x) && y < lowerTop(x) && !inArch(x, y, s.frontAxle) && !inArch(x, y, s.rearAxle);
local seam(x) = std.abs(x - s.cowl) < 0.032 || std.abs(x - s.bFront) < 0.032 || std.abs(x - s.bRear) < 0.032 || std.abs(x - s.rearDoor) < 0.032;
local doorSpan(x, from, to, y) = x > from && x < to && y > s.floor;
local sideSlot(seed) = function(x, y)
  if seam(x) && y > s.sill + 0.06 && y < s.waist then 'soot'
  else if y < 0.16 && fbm(x, y, seed + 40) > 0.52 then 'rust'
  else s.burnt(x, y, seed, if x < s.deckFront then 0.04 else 0);
// Heat warp only: at this grain a shallow dent is one step in or out, read by its shadow line.
local warp(x, y, seed) = s.side - 0.04 * fbm(x, y, seed + 20);
local pillars(x, y, z) =
  local t = lean(y);
  local aFront = s.aPost - s.aLean * t;
  local cFront = s.cWaist + s.cLean * t;
  local cRear = s.deckFront + (roofRear - s.deckFront) * t;
  y < roofAt(x, z) && x > cRear && x < aFront && (
    x > aFront - 0.14 || (x > s.bRear - 0.02 && x < s.bFront + 0.02) || x < cFront || y > roofAt(x, z) - 0.09
  );
[
  k.compound('burnt_out_saloon_shell', s.shellMass,
             // Near side: the front door has gone from its opening and hangs as its own part.
             sheet('near', 'z', [s.rear, s.nose], [s.sill, 0.98],
                   function(x, y) warp(x, y, 1),
                   function(x, y) lowerSide(x, y) && !doorSpan(x, s.bFront, s.cowl, y),
                   sideSlot(1))
             // Far side: the rear door has dropped off, leaving the seat frame in plain view.
             + sheet('far', 'z', [s.rear, s.nose], [s.sill, 0.98],
                     function(x, y) -warp(x, y, 2) + 0.0625,
                     function(x, y) lowerSide(x, y) && !doorSpan(x, s.rearDoor, s.bRear, y),
                     sideSlot(2))
             + sheet('near_up', 'z', [s.deckFront, s.aPost], [s.waist, s.roof + 0.04],
                     function(x, y) s.glassOut,
                     function(x, y) pillars(x, y, s.glassOut),
                     function(x, y) s.burnt(x, y, 3))
             + sheet('far_up', 'z', [s.deckFront, s.aPost], [s.waist, s.roof + 0.04],
                     function(x, y) -s.glassOut + 0.0625,
                     function(x, y) pillars(x, y, -s.glassOut),
                     function(x, y) s.burnt(x, y, 4))
             + sheet('roof', 'y', [roofRear, roofFront], [-s.glassOut, s.glassOut],
                     function(x, z) roofAt(x, z),
                     function(x, z) true,
                     function(x, z) s.burnt(x, z, 6))
             // The rear deck beside the lid, and the sills' top inside each opening.
             + sheet('deck_near', 'y', [s.rear, s.deckFront], [s.glassIn, s.side],
                     function(x, z) s.deck, function(x, z) true, function(x, z) s.burnt(x, z, 7, 0.04), thick=0.05)
             + sheet('deck_far', 'y', [s.rear, s.deckFront], [-s.side, -s.glassIn],
                     function(x, z) s.deck, function(x, z) true, function(x, z) s.burnt(x, z, 8, 0.04), thick=0.05)
             + sheet('wing_near', 'y', [s.aPost, s.nose], [s.skin - 0.0625, s.side],
                     function(x, z) hood(x), function(x, z) true, function(x, z) s.burnt(x, z, 9), thick=0.05)
             + sheet('wing_far', 'y', [s.aPost, s.nose], [-s.side, -s.skin + 0.0625],
                     function(x, z) hood(x), function(x, z) true, function(x, z) s.burnt(x, z, 10), thick=0.05)
             // The nose with its grille and lamps burnt out to empty sockets.
             + sheet('nose', 'x', [-s.side, s.side], [0.125, hood(s.nose)],
                     function(z, y) s.nose,
                     function(z, y) !(std.abs(z) < 0.42 && y > 0.36 && y < hood(s.nose) - 0.05) && !(std.abs(z) > 0.5 && std.abs(z) < 0.84 && y > 0.4 && y < 0.62),
                     function(z, y) s.burnt(z, y, 12))
             // The tail with its lamp lenses melted out.
             + sheet('tail', 'x', [-s.side, s.side], [0.125, s.deck],
                     function(z, y) s.rear + 0.0625,
                     function(z, y) !(std.abs(z) > 0.5 && std.abs(z) < 0.84 && y > 0.5 && y < 0.76),
                     function(z, y) s.burnt(z, y, 13, 0.05))
             + [
               box('floor', 'soot', [s.rear + 0.06, 0.125, -s.skin], [s.nose - 0.06, s.floor, s.skin]),
               box('sill_near', 'char', [s.frontAxle - s.arch - 0.5, s.sill, s.skin - 0.06], [s.frontAxle - s.arch, s.floor, s.side - 0.03]),
               box('sill_far', 'char', [s.rearAxle + s.arch, s.sill, -s.side + 0.03], [s.bRear, s.floor, -s.skin + 0.06]),
               box('bulkhead', 'soot', [s.cowl, s.floor, -s.skin], [s.aPost, s.waist - 0.02, s.skin]),
               box('cowl', 'char', [s.cowl - 0.04, s.waist - 0.06, -s.glassOut], [s.aPost + 0.03, s.waist, s.glassOut]),
               box('radiator_wall', 'soot', [s.nose - 0.28, 0.2, -s.skin + 0.05], [s.nose - 0.22, hood(s.nose) - 0.08, s.skin - 0.05]),
               box('grille_bar_0', 'rust', [s.nose - 0.0625, 0.44, -0.42], [s.nose - 0.02, 0.47, 0.42]),
               box('grille_bar_1', 'ash', [s.nose - 0.0625, 0.54, -0.42], [s.nose - 0.02, 0.57, 0.42]),
               box('tail_inner', 'soot', [s.rear + 0.16, 0.25, -s.skin], [s.rear + 0.22, s.deck - 0.05, s.skin]),
               box('parcel_shelf', 'soot', [s.deckFront - 0.02, s.waist - 0.05, -s.glassOut], [s.deckFront + 0.42, s.waist, s.glassOut]),
               box('boot_wall', 'soot', [s.deckFront - 0.02, s.floor, -s.skin], [s.deckFront + 0.04, s.waist - 0.05, s.skin]),
               box('front_liner_near', 'soot', [s.frontAxle - s.arch, 0.125, s.skin - 0.3], [s.frontAxle + s.arch, 0.68, s.skin - 0.26]),
               box('front_liner_far', 'soot', [s.frontAxle - s.arch, 0.125, -s.skin + 0.26], [s.frontAxle + s.arch, 0.68, -s.skin + 0.3]),
               box('rear_liner_near', 'soot', [s.rearAxle - s.arch, 0.125, s.skin - 0.3], [s.rearAxle + s.arch, 0.68, s.skin - 0.26]),
               box('rear_liner_far', 'soot', [s.rearAxle - s.arch, 0.125, -s.skin + 0.26], [s.rearAxle + s.arch, 0.68, -s.skin + 0.3]),
             ],
             finish),
  // Warped by the heat and sprung off its catch, so the front edge stands clear of the nose.
  k.compound('burnt_out_saloon_bonnet', 13,
             sheet('skin', 'y', [s.aPost, s.nose + 0.02], [-s.skin + 0.03, s.skin - 0.03],
                   function(x, z)
                     local t = (x - s.aPost) / (s.nose - s.aPost);
                     hood(x) + 0.03 + 0.15 * t * t + 0.05 * g((x - 1.55) / 0.14) * (1 - std.abs(z)) - 0.04 * fbm(x, z, 21),
                   function(x, z) true,
                   function(x, z) s.burnt(x, z, 22),
                   thick=0.0625),
             finish),
  k.compound('burnt_out_saloon_boot_lid', 11,
             sheet('skin', 'y', [s.rear + 0.04, s.deckFront - 0.02], [-s.glassIn + 0.02, s.glassIn - 0.02],
                   function(x, z) s.deck + 0.03 + 0.07 * (s.deckFront - x) / (s.deckFront - s.rear) * (0.6 + z * 0.5) - 0.03 * fbm(x, z, 24),
                   function(x, z) true,
                   function(x, z) s.burnt(x, z, 25, 0.05),
                   thick=0.0625),
             finish),
  // Swung out on its one remaining hinge, the free corner dropped until it rests on the ground.
  k.compound('burnt_out_saloon_door', 18,
             std.flattenArrays([
               local width = s.cowl - s.bFront;
               local n = 14;
               local t = (i + 0.5) / n;
               local reach = width * t;
               local x = s.cowl - reach * 0.74;
               local z = s.side + reach * 0.67;
               local foot = s.floor - s.floor * t;
               local x0 = s.cowl - width * 0.74 * i / n;
               local x1 = s.cowl - width * 0.74 * (i + 1) / n;
               local z0 = s.side + width * 0.67 * i / n;
               local z1 = s.side + width * 0.67 * (i + 1) / n;
               local rows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
               local cell = 0.0625;
               [
                 local y = foot + j * cell;
                 box('skin_' + i + '_' + j, s.burnt(x, y, 27), [x1, y, z0], [x0, y + cell, z1 + 0.0625])
                 for j in rows
               ] + (if i == 13 || i == 12 then [
                 box('post_' + i, 'char', [x1, foot + 11 * cell, z0], [x0, foot + 11 * cell + 0.12, z1 + 0.0625]),
               ] else [])
               for i in std.range(0, 13)
             ]),
             finish),
  // The bar has dropped off its far mounting and hangs to the ground.
  k.compound('burnt_out_saloon_front_bumper', 8,
             sheet('bar', 'x', [-s.side + 0.03, s.side - 0.03], [0, 0.45],
                   function(z, y) s.front + (if z < 0 then 0.1 * z else 0) - 0.03 * fbm(z, y, 30),
                   function(z, y)
                     local low = if z > 0.1 then 0.26 else 0.26 * (z + 0.87) / 0.97;
                     y >= low && y < low + 0.16,
                   function(z, y) s.burnt(z, y, 31, 0.03),
                   thick=0.0625),
             finish),
  k.compound('burnt_out_saloon_rear_bumper', 7,
             sheet('bar', 'x', [-s.side + 0.03, s.side - 0.03], [0.05, 0.5],
                   function(z, y) s.rear + 0.09 - 0.03 * fbm(z, y, 32),
                   function(z, y)
                     local low = if z > 0.2 then 0.27 - (z - 0.2) * 0.1 else 0.27;
                     y >= low && y < low + 0.17,
                   function(z, y) s.burnt(z, y, 33, 0.06),
                   thick=-0.0625),
             finish),
  k.compound('burnt_out_saloon_rim', 9, [
    k.turned('flange', 'rim', 'z', k.annulus(0.17, 0.2, -0.08, 0.07)) + { sides: 24 },
    k.turned('dish', 'dark', 'z', k.disc(0.17, -0.08, 0.02)) + { sides: 24 },
    k.turned('hub', 'steel', 'z', k.disc(0.07, 0.02, 0.05)) + { sides: 12 },
    // The steel bead wire is all that survives of the tyre.
    k.turned('bead', 'dark', 'z', k.annulus(0.2, 0.2125, 0.04, 0.07)) + { sides: 24 },
  ] + sheet('ash', 'y', [-0.22, 0.22], [-0.12, 0.12],
            function(x, z) -s.axleY + 0.03125,
            function(x, z) x * x / 0.05 + z * z / 0.014 < 0.4 + fbm(x, z, 34),
            function(x, z) if fbm(x, z, 35) > 0.5 then 'residue' else 'dark',
            thick=0.03125), {
    rim: 'rust-red', dark: 'steel-spall-black', steel: 'iron-dull', residue: 'plastic-scorched',
  }),
  k.compound('burnt_out_saloon_seat_frame', 6,
             [
               box('rail_inner', 'frame', [-0.26, 0, -0.24], [0.26, 0.05, -0.2]),
               box('rail_outer', 'frame', [-0.26, 0, 0.2], [0.26, 0.05, 0.24]),
               box('pan_front', 'frame', [0.2, 0.05, -0.24], [0.25, 0.2, 0.24]),
               box('pan_back', 'frame', [-0.26, 0.05, -0.24], [-0.2, 0.2, 0.24]),
               bar('back_inner', 'frame', [-0.24, 0.2], [-0.42, 0.72], 0.05, [-0.24, -0.2]),
               bar('back_outer', 'frame', [-0.24, 0.2], [-0.42, 0.72], 0.05, [0.2, 0.24]),
               bar('back_top', 'frame', [-0.42, 0.7], [-0.43, 0.74], 0.05, [-0.24, 0.24]),
               box('post_a', 'rust', [-0.45, 0.72, -0.1], [-0.42, 0.8, -0.07]),
               box('post_b', 'rust', [-0.45, 0.72, 0.07], [-0.42, 0.8, 0.1]),
             ]
             + [box('spring_' + i, 'rust', [-0.2 + i * 0.1, 0.17, -0.2], [-0.17 + i * 0.1, 0.2, 0.2]) for i in std.range(0, 3)]
             + [bar('back_spring_' + i, 'rust', [-0.28 - i * 0.04, 0.32 + i * 0.12], [-0.27 - i * 0.04, 0.35 + i * 0.12], 0.03, [-0.2, 0.2]) for i in std.range(0, 2)],
             { frame: 'steel-spall-black', rust: 'rust-red' }),
  k.compound('burnt_out_saloon_bench_frame', 9,
             [
               box('pan_front', 'frame', [0.24, 0, -0.68], [0.3, 0.26, 0.68]),
               box('pan_back', 'frame', [-0.3, 0, -0.68], [-0.24, 0.26, 0.68]),
               box('end_near', 'frame', [-0.3, 0.2, 0.62], [0.3, 0.26, 0.68]),
               box('end_far', 'frame', [-0.3, 0.2, -0.68], [0.3, 0.26, -0.62]),
               bar('back_near', 'frame', [-0.27, 0.24], [-0.42, 0.66], 0.05, [0.62, 0.68]),
               bar('back_far', 'frame', [-0.27, 0.24], [-0.42, 0.66], 0.05, [-0.68, -0.62]),
               bar('back_top', 'frame', [-0.42, 0.64], [-0.43, 0.68], 0.05, [-0.68, 0.68]),
             ]
             + [box('spring_' + i, 'rust', [-0.2 + i * 0.1, 0.23, -0.62], [-0.17 + i * 0.1, 0.26, 0.62]) for i in std.range(0, 3)],
             { frame: 'steel-spall-black', rust: 'rust-red' }),
  k.compound('burnt_out_saloon_dash_frame', 10, [
    box('beam', 'steel', [s.cowl - 0.2, s.waist - 0.17, -s.skin], [s.cowl - 0.14, s.waist - 0.11, s.skin]),
    bar('column', 'steel', [s.cowl - 0.14, s.waist - 0.12], [s.cowl - 0.42, s.waist - 0.02], 0.05, [-0.4, -0.35]),
    k.turned('ring', 'rust', 'x', k.annulus(0.15, 0.175, -0.0156, 0.0156), [s.cowl - 0.42, s.waist - 0.02, -0.375]) + { sides: 16 },
    box('spoke', 'steel', [s.cowl - 0.436, s.waist - 0.04, -0.53], [s.cowl - 0.404, s.waist, -0.22]),
    box('console', 'steel', [s.cowl - 0.2, s.floor, -0.05], [s.cowl - 0.14, s.waist - 0.17, 0.05]),
  ], { steel: 'steel-spall-black', rust: 'rust-red' }),
  k.compound('burnt_out_saloon_engine', 160, [
    box('block', 'block', [-0.25, 0.08, -0.32], [0.25, 0.42, 0.26]),
    box('head', 'block', [-0.22, 0.42, -0.26], [0.22, 0.54, 0.2]),
    box('sump', 'dark', [-0.25, 0, -0.26], [0.25, 0.08, 0.2]),
    box('manifold', 'rust', [0.25, 0.26, -0.26], [0.3, 0.46, 0.2]),
    box('gearbox', 'dark', [-0.2, 0.03, -0.72], [0.2, 0.38, -0.32]),
  ], { block: 'iron-cast', dark: 'steel-spall-black', rust: 'rust-red' }),
]
