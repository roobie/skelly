local b = import 'burnt_out_saloon.spec.libsonnet';
local k = import 'kit.libsonnet';
local s = import 'abandoned_pickup.spec.libsonnet';
local box = k.box;
local bar = b.bar;
local fbm = b.fbm;
local g = b.gauss;
local sheet = b.sheet;
local finish = { paint: s.paint, rust: 'rust-red', dark: 'plastic-scorched', hole: 'steel-spall-black', steel: 'steel-parkerized' };
// Rust climbs from the sills and spreads from the seams; the old paint lasts longest high up.
local rusted(a, c, height, seed, bias=0) =
  local m = fbm(a, c, seed) + 0.1 * fbm(a * 4, c * 4, seed + 1) + bias + 0.3 * std.max(0, 1 - height / 1.1);
  if m > 0.5 then 'rust' else 'paint';
local hood(x) = s.hoodBack - (x - s.aPost) * s.hoodFall;
local inArch(x, y, axle) = std.pow(x - axle, 2) + std.pow(y - s.axleY, 2) < s.arch * s.arch;
local eaten(a, c, height, seed) = height < 0.8 && fbm(a, c, seed) > 0.66;
local cabTop(x) = if x >= s.aPost then hood(x) else s.waist;
local cabBottom(x) = if x > s.frontAxle - s.arch then s.railLow + 0.06 else s.sill;
local cabSide(x, y, door) = y >= cabBottom(x) && y < cabTop(x) && !inArch(x, y, s.frontAxle) && !(door && x > s.doorRear && x < s.cowl && y > s.floor - 0.1);
local roofFront = s.aPost - s.aLean;
local upper(x, y) =
  local t = (y - s.waist) / (s.roof - s.waist);
  local front = s.aPost - s.aLean * t;
  local rear = s.cabBack + s.cabLean * t;
  x > rear && x < front && (x > front - 0.1 || x < s.doorRear + s.cabLean * t || y > s.roof - 0.06);
[
  k.compound('abandoned_pickup_cab', 290,
             // The near door is gone from its opening; the far door is its own part.
             sheet('near', 'z', [s.cabBack, s.nose], [s.sill, s.waist],
                   function(x, y) s.side,
                   function(x, y) cabSide(x, y, true) && !eaten(x, y, y, 71),
                   function(x, y) rusted(x, y, y, 72))
             + sheet('far', 'z', [s.cabBack, s.nose], [s.sill, s.waist],
                     function(x, y) -s.side + 0.0625,
                     function(x, y) cabSide(x, y, true) && !eaten(x, y, y, 74),
                     function(x, y) rusted(x, y, y, 75))
             + sheet('near_up', 'z', [s.cabBack, s.aPost], [s.waist, s.roof],
                     function(x, y) s.glassOut,
                     upper,
                     function(x, y) rusted(x, y, y, 76))
             + sheet('far_up', 'z', [s.cabBack, s.aPost], [s.waist, s.roof],
                     function(x, y) -s.glassOut + 0.0625,
                     upper,
                     function(x, y) rusted(x, y, y, 77))
             + sheet('roof', 'y', [s.cabBack, roofFront], [-s.glassOut, s.glassOut],
                     function(x, z) s.roofTop,
                     function(x, z) true,
                     function(x, z) rusted(x, z, 1.1, 78))
             + sheet('back', 'x', [-s.side, s.side - 0.01], [s.railTop, 1.74],
                     function(z, y) s.cabBack + 0.0625,
                     function(z, y) (y < s.waist || std.abs(z) < s.glassOut) && !(std.abs(z) < 0.52 && y > s.waist + 0.05 && y < s.roof - 0.09),
                     function(z, y) rusted(z, y, y, 79))
             + sheet('firewall', 'x', [-s.side + 0.06, s.side - 0.06], [s.railTop, s.waist],
                     function(z, y) s.cowl + 0.0625,
                     function(z, y) std.abs(z) < s.skin && !(fbm(z, y, 80) > 0.65),
                     function(z, y) if fbm(z, y, 81) > 0.5 then 'rust' else 'dark')
             + sheet('cowl', 'y', [s.cowl, s.aPost], [-s.glassOut, s.glassOut],
                     function(x, z) s.waist,
                     function(x, z) true,
                     function(x, z) rusted(x, z, 1.1, 82))
             // A rotten floor pan, open to the ground in places.
             + sheet('floor', 'y', [s.cabBack, s.cowl], [-s.side + 0.06, s.side - 0.06],
                     function(x, z) s.floor,
                     function(x, z) fbm(x * 1.5, z * 1.5, 83) < 0.7,
                     function(x, z) if fbm(x, z, 84) > 0.48 then 'rust' else 'dark')
             + sheet('wing_near', 'y', [s.aPost, s.nose], [s.hoodHalf, s.side],
                     function(x, z) hood(x),
                     function(x, z) z < s.side,
                     function(x, z) rusted(x, z, 1.1, 85))
             + sheet('wing_far', 'y', [s.aPost, s.nose], [-s.side, -s.hoodHalf],
                     function(x, z) hood(x),
                     function(x, z) z < -s.hoodHalf,
                     function(x, z) rusted(x, z, 1.1, 86))
             // The radiator, grille and lamps are gone, leaving the bare support and empty sockets.
             + sheet('wing_face', 'x', [-s.side, s.side - 0.01], [s.railLow + 0.06, hood(s.nose)],
                     function(z, y) s.nose,
                     function(z, y) std.abs(z) > s.hoodHalf && !(y > 0.84 && y < 1.04 && std.abs(z) < 0.8),
                     function(z, y) rusted(z, y, y, 87))
             + k.bothSides([
               box('sill_box', 'rust', [s.cabBack, s.sill, 0.7], [s.cowl, s.floor, s.side - 0.03]),
               box('inner_wing', 'dark', [s.aPost, s.railTop, s.hoodHalf - 0.03], [s.nose - 0.06, hood(s.nose) - 0.05, s.hoodHalf]),
               box('support_post', 'steel', [s.nose - 0.08, s.railTop, 0.5], [s.nose - 0.02, hood(s.nose), 0.56]),
             ])
             + [
               box('support_top', 'steel', [s.nose - 0.08, hood(s.nose) - 0.05, -s.hoodHalf], [s.nose - 0.02, hood(s.nose), s.hoodHalf]),
               box('support_low', 'steel', [s.nose - 0.08, s.railTop, -s.hoodHalf], [s.nose - 0.02, s.railTop + 0.05, s.hoodHalf]),
               box('battery_tray', 'rust', [s.aPost + 0.1, 0.95, 0.3], [s.aPost + 0.32, 0.98, 0.55]),
               box('dash_rail', 'steel', [s.cowl - 0.2, 1.02, -s.side + 0.08], [s.cowl - 0.14, 1.08, s.side - 0.08]),
               box('dash_top', 'dark', [s.cowl - 0.14, 1.08, -s.side + 0.08], [s.cowl, s.waist, s.side - 0.08]),
               bar('column', 'steel', [s.cowl - 0.14, 1.06], [s.cowl - 0.45, 1.2], 0.05, [-0.39, -0.33]),
             ],
             finish),
  // Propped wide open on its stay, the empty bay plain beneath it.
  k.compound('abandoned_pickup_bonnet', 20,
             sheet('skin', 'x', [-s.hoodHalf + 0.02, s.hoodHalf - 0.02], [hood(s.aPost), hood(s.aPost) + s.hingeRise],
                   function(z, y) s.aPost + (y - hood(s.aPost)) * s.hingeRun / s.hingeRise + 0.04 * g((z - 0.2) / 0.2) * g((y - 1.65) / 0.2),
                   function(z, y) true,
                   function(z, y) rusted(z, y, 1.1, 88),
                   thick=0.125)
             + [
               bar('stay', 'steel', [s.nose - 0.05, hood(s.nose)], [s.aPost + 0.32, hood(s.aPost) + 0.47], 0.03, [0.42, 0.45]),
             ],
             finish),
  k.compound('abandoned_pickup_door', 26,
             sheet('skin', 'z', [s.doorRear, s.cowl], [s.sill + 0.03, s.waist],
                   function(x, y) -s.side + 0.0625 - 0.02,
                   function(x, y) !eaten(x, y, y, 89),
                   function(x, y) rusted(x, y, y, 90),
                   thick=-0.0625)
             + [
               bar('front_frame', 'rust', [s.cowl, s.waist], [s.cowl - s.aLean + 0.02, s.roof - 0.04], 0.05, [-s.glassOut, -s.glassOut + 0.05]),
               box('top_frame', 'rust', [s.doorRear + s.cabLean, s.roof - 0.08, -s.glassOut], [s.cowl - s.aLean, s.roof - 0.04, -s.glassOut + 0.05]),
               box('rear_frame', 'rust', [s.doorRear + 0.04, s.waist, -s.glassOut], [s.doorRear + 0.09, s.roof - 0.04, -s.glassOut + 0.05]),
             ],
             finish),
  k.compound('abandoned_pickup_bed', 170,
             sheet('near', 'z', [s.rear, s.cabBack], [s.railTop, s.bedTop],
                   function(x, y) s.side,
                   function(x, y) !inArch(x, y, s.rearAxle) && !eaten(x, y, y, 92),
                   function(x, y) rusted(x, y, y, 93))
             + sheet('far', 'z', [s.rear, s.cabBack], [s.railTop, s.bedTop],
                     function(x, y) -s.side + 0.0625,
                     function(x, y) !inArch(x, y, s.rearAxle) && !eaten(x, y, y, 95),
                     function(x, y) rusted(x, y, y, 96))
             // Rotted through at the wheel tubs, so the frame shows from above.
             + sheet('deck', 'y', [s.rear, s.cabBack], [-s.bedInner, s.bedInner],
                     function(x, z) s.bedFloor,
                     function(x, z) fbm(x * 2.5, z * 2.5, 97) < 0.72,
                     function(x, z) 'rust',
                     thick=0.0625)
             + sheet('top_near', 'y', [s.rear, s.cabBack], [s.bedInner, s.side],
                     function(x, z) s.bedTop, function(x, z) true, function(x, z) rusted(x, z, 1.1, 99))
             + sheet('top_far', 'y', [s.rear, s.cabBack], [-s.side, -s.bedInner],
                     function(x, z) s.bedTop, function(x, z) true, function(x, z) rusted(x, z, 1.1, 100))
             // Tail lamps taken: the post keeps its socket. The tailgate has gone, so the bed stands open.
             + sheet('post', 'x', [-s.side, s.side - 0.01], [s.railTop, s.bedTop],
                     function(z, y) s.rear + 0.0625,
                     function(z, y) std.abs(z) > s.bedInner && !(y > 0.88 && y < 1.08),
                     function(z, y) rusted(z, y, y, 101))
             + k.bothSides([
               box('inner_wall', 'rust', [s.rear, s.bedFloor, s.bedInner], [s.cabBack, s.bedTop - 0.0625, s.bedInner + 0.04]),
               box('under_wall', 'dark', [s.rear + 0.06, s.railTop, s.bedInner], [s.cabBack, s.bedFloor, s.bedInner + 0.04]),
               box('wheel_tub', 'rust', [s.rearAxle - s.arch, s.bedFloor, s.bedInner - 0.2], [s.rearAxle + s.arch, s.bedFloor + 0.2, s.bedInner]),
               box('lip', 'rust', [s.rear, s.bedFloor - 0.08, s.bedInner - 0.03], [s.rear + 0.04, s.bedFloor, s.bedInner]),
             ])
             + [
               box('front_wall', 'rust', [s.cabBack - 0.05, s.bedFloor, -s.bedInner], [s.cabBack, s.bedTop, s.bedInner]),
               box('tail_sill', 'rust', [s.rear, s.bedFloor - 0.08, -s.bedInner], [s.rear + 0.05, s.bedFloor, s.bedInner]),
             ],
             finish),
  k.compound('abandoned_pickup_frame', 170,
             k.bothSides([
               box('rail', 'rail', [s.rear + 0.18, s.railLow, s.railZ - 0.03], [s.nose - 0.08, s.railTop, s.railZ + 0.03]),
             ])
             + [
               box('cross_' + i, 'rail', [s.rear + 0.3 + i * 1.05, s.railLow + 0.02, -s.railZ], [s.rear + 0.36 + i * 1.05, s.railTop - 0.02, s.railZ])
               for i in std.range(0, 4)
             ],
             { rail: 'rust-red' }),
  // Bare axle: hubs without their wheels, leaf springs still up to the frame.
  k.compound('abandoned_pickup_axle', 62,
             k.bothSides([
               k.turned('drum', 'drum', 'z', k.disc(0.13, 0.66, 0.74)) + { sides: 16 },
               k.turned('flange', 'dark', 'z', k.disc(0.08, 0.74, 0.76)) + { sides: 12 },
               bar('leaf_front', 'dark', [0, -0.03], [0.5, 0.11], 0.04, [s.railZ - 0.03, s.railZ + 0.03]),
               bar('leaf_rear', 'dark', [0, -0.03], [-0.5, 0.11], 0.04, [s.railZ - 0.03, s.railZ + 0.03]),
             ])
             + [
               box('tube', 'tube', [-0.05, -0.05, -0.66], [0.05, 0.05, 0.66]),
               k.turned('pumpkin', 'tube', 'x', k.disc(0.13, -0.1, 0.12)) + { sides: 16 },
             ],
             { tube: 'iron-cast', drum: 'rust-red', dark: 'steel-spall-black' }),
  // Two courses of concrete block laid crosswise, the top one carrying the axle.
  k.compound('abandoned_pickup_block_stack', 24, [
    box('low', 'block', [-0.2, 0, -0.1], [0.2, 0.175, 0.1]),
    box('high', 'block', [-0.1, 0.175, -0.2], [0.1, 0.33, 0.2]),
    box('hole_a', 'hole', [-0.15, 0.17, -0.06], [-0.11, 0.1755, 0.06]),
    box('packer', 'wood', [-0.12, 0.33, -0.2], [0.12, s.stackTop, 0.2]),
  ], { block: 'stone-grey', hole: 'steel-spall-black', wood: 'wood-oak' }),
  // The cushions have rotted away, leaving the spring frame.
  k.compound('abandoned_pickup_bench_frame', 12,
             [
               box('pan_front', 'frame', [0.24, 0, -0.7], [0.3, 0.26, 0.7]),
               box('pan_back', 'frame', [-0.3, 0, -0.7], [-0.24, 0.26, 0.7]),
               box('end_near', 'frame', [-0.3, 0.2, 0.64], [0.3, 0.26, 0.7]),
               box('end_far', 'frame', [-0.3, 0.2, -0.7], [0.3, 0.26, -0.64]),
               bar('back_near', 'frame', [-0.27, 0.24], [-0.36, 0.74], 0.05, [0.64, 0.7]),
               bar('back_far', 'frame', [-0.27, 0.24], [-0.36, 0.74], 0.05, [-0.7, -0.64]),
               bar('back_top', 'frame', [-0.36, 0.72], [-0.37, 0.76], 0.05, [-0.7, 0.7]),
             ]
             + [box('spring_' + i, 'spring', [-0.2 + i * 0.1, 0.23, -0.64], [-0.17 + i * 0.1, 0.26, 0.64]) for i in std.range(0, 3)]
             + [bar('back_spring_' + i, 'spring', [-0.3 - i * 0.03, 0.36 + i * 0.12], [-0.29 - i * 0.03, 0.39 + i * 0.12], 0.03, [-0.64, 0.64]) for i in std.range(0, 2)],
             { frame: 'steel-parkerized', spring: 'rust-red' }),
]
