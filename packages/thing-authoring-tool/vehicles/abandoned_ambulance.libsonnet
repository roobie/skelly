local k = import 'kit.libsonnet';
local w = import 'burnt_out_van.spec.libsonnet';
local s = import 'abandoned_ambulance.spec.libsonnet';
local box = k.box;
local finish = {
  paint: 'paint-cream', white: 'plastic-white', grime: 'plastic-grey', rust: 'scrap-rusted', rustred: 'rust-red', band: 'paint-terracotta',
  dark: 'plastic-charcoal', soot: 'steel-spall-black', trim: 'plastic-black', steel: 'steel-grey', glass: 'glass-grey',
};
local constant(v) = function(x) v;
local zr(sign, range) = if sign > 0 then range else [-range[1], -range[0]];
local hood(x) = s.waist - (x - 1.75) * 0.3;
local roofFront = 0.85;
local archBottom(axle, sill, x) =
  local d = std.abs(x - axle);
  if d >= s.arch then sill else sill + s.archRise * std.sqrt(1 - d * d / (s.arch * s.arch));
// Faded paint, mostly whole: rust climbing from the sills and blistering here and there, grime weeping down in streaks,
// and the red stripe worn through in places.
local skin(seed) = function(x, y)
  local blister = w.noise(seed, x, y);
  local weep = w.noise(seed + 2, x * 3.2, y * 0.3);
  if y < 0.5 + 0.5 * (blister - 0.3) || blister > 0.8 then (if w.noise(seed + 4, x, y) > 0.56 then 'rustred' else 'rust')
  else if blister > 0.74 || weep > 0.74 + 0.3 * w.noise(seed + 9, x * 2.7, y * 2.7) then 'grime'
  else if y > 0.86 && y < 1.0 && blister > 0.26 then 'band'
  else 'paint';
// A skin facing up has no height to rust from, so it reads as the upper body.
local roofSkin(seed) = function(x, z)
  local blister = w.noise(seed, x, z);
  if blister > 0.78 then 'rust' else if blister > 0.72 then 'grime' else 'paint';
local grid(from, to, count) = [from + (to - from) * i / count for i in std.range(0, count)];
local boxTop(x) = s.boxRoof - 0.06;
local boxBottom(x) = archBottom(s.rearAxle, s.boxSill, x);
local cabBottom(x) = archBottom(s.frontAxle, s.sill, x);
local window(x, y) = x > -2.5 && x < -1.9 && y > 1.5 && y < 2.1;
local boxWall(tag, sign, seed, holes) =
  w.sheet(tag, 'z', [s.rear, 0], boxBottom, boxTop, constant(zr(sign, [s.boxSkin, s.boxSide])), function(x, y) if holes(x, y) then null else skin(seed)(x, y));
local cabWall(tag, sign, seed) =
  w.sheet(tag + '_sill', 'z', [0, 1.3], constant(s.sill), constant(s.floor), constant(zr(sign, [s.skin, s.side])), skin(seed))
  + w.sheet(tag + '_wing', 'z', [1.3, s.nose - 0.02], cabBottom, function(x) std.min(s.waist, hood(x)), constant(zr(sign, [s.skin, s.side])), skin(seed))
  + w.sheet(tag + '_header', 'z', [0.06, roofFront], constant(s.cabRoof - 0.16), constant(s.cabRoof - 0.04), constant(zr(sign, [s.skin, s.side])), skin(seed))
  + w.sheet(tag + '_b', 'z', [0.06, 0.16], constant(s.floor), constant(s.cabRoof - 0.16), constant(zr(sign, [s.skin, s.side])), skin(seed));
local noseHole(z, y) =
  local a = std.abs(z);
  (a < 0.5 && y > 0.56 && y < 0.78) || (a > 0.55 && a < 0.86 && y > 0.6 && y < 0.82);
local doorSkin(seed, windowBelow) = function(t, y)
  if y > windowBelow && y < windowBelow + 0.62 && t > 0.14 && t < 0.86 then null else skin(seed)(t * 2, y);
[
  k.compound('abandoned_ambulance_chassis', 280, [
    box('axle_front', 'rust', [s.frontAxle - 0.05, s.hubY - 0.04, -0.8], [s.frontAxle + 0.05, s.hubY + 0.04, 0.8]),
    box('axle_rear', 'rust', [s.rearAxle - 0.05, s.hubY - 0.04, -0.8], [s.rearAxle + 0.05, s.hubY + 0.04, 0.8]),
    box('diff', 'rust', [s.rearAxle - 0.14, s.hubY - 0.1, -0.14], [s.rearAxle + 0.14, s.hubY + 0.1, 0.14]),
    box('exhaust', 'rust', [-2.8, 0.24, 0.5], [0.8, 0.3, 0.58]),
    box('crossmember', 'rust', [-2.9, 0.24, -0.5], [-2.8, 0.32, 0.5]),
  ] + k.bothSides([
    box('rail', 'rust', [-2.95, 0.24, 0.42], [2.4, 0.42, 0.5]),
  ]), { rust: 'scrap-rusted' }),
  k.compound('abandoned_ambulance_cab', 600,
             cabWall('near', 1, 3)
             + cabWall('far', -1, 11)
             + w.sheet('roof', 'y', [0, roofFront], constant(-s.side), constant(s.side), constant([s.cabRoof - 0.06, s.cabRoof]), roofSkin(17))
             + w.sheet('nose', 'x', [-s.skin, s.skin], constant(s.sill + 0.08), constant(hood(2.6)), constant([2.56, 2.62]), function(z, y) if noseHole(z, y) then null else skin(21)(z, y))
             + w.sheet('cowl', 'x', [-s.skin, s.skin], constant(0.96), constant(s.waist + 0.02), constant([1.62, 1.75]), skin(23))
             + w.sheet('front_panel_low', 'x', [-s.skin, s.skin], constant(s.sill), constant(s.floor), constant([1.2, 1.3]), skin(27), 0.25)
             + [
               box('floor', 'dark', [0, s.sill, -s.skin], [1.3, s.floor, s.skin]),
               box('bay_floor', 'soot', [1.3, 0.36, -0.72], [2.56, 0.4, 0.72]),
               box('grille', 'trim', [2.5, 0.54, -0.5], [2.54, 0.8, 0.5]),
               box('dash', 'dark', [1.26, 0.78, -0.88], [1.42, 1.02, 0.88]),
               box('glass_shard_low', 'glass', [1.6, 1.08, -0.86], [1.64, 1.16, 0.1]),
               k.prism('glass_shard_tooth', 'glass', [[1.5, 1.14], [1.64, 1.14], [1.48, 1.4]], [-0.86, -0.34]),
               k.prism('glass_shard_tooth_b', 'glass', [[1.5, 1.14], [1.64, 1.14], [1.56, 1.28]], [-0.2, 0.1]),
             ]
             + k.bothSides([
               k.prism('a_post', 'paint', [[1.64, 1.12], [1.76, 1.12], [0.97, 2.18], [0.85, 2.18]], [0.88, 0.98]),
               box('tub_front', 'soot', [s.frontAxle - s.arch, s.sill, 0.72], [s.frontAxle + s.arch, 0.76, 0.74]),
               box('tub_front_top', 'soot', [s.frontAxle - s.arch, 0.74, 0.74], [s.frontAxle + s.arch, 0.76, s.skin]),
               box('lamp_socket', 'soot', [2.48, 0.56, 0.5], [2.54, 0.86, 0.9]),
             ]),
             finish),
  k.compound('abandoned_ambulance_box', 840,
             boxWall('near', 1, 31, function(x, y) window(x, y) || (x > -1.1 && x < -0.12 && y > s.boxSill + 0.04 && y < s.doorTop + 0.04))
             + boxWall('far', -1, 37, window)
             + w.sheet('roof', 'y', [s.rear, 0], constant(-s.boxSide), constant(s.boxSide), constant([s.boxRoof - 0.06, s.boxRoof]), roofSkin(41))
             + w.sheet('front_wall', 'x', [-s.boxSide, s.boxSide], function(z) if std.abs(z) < s.side then s.cabRoof else s.boxSill, constant(s.boxRoof - 0.06), constant([0, 0.06]), skin(43))
             + w.sheet('rear_header', 'x', [-s.boxSkin, s.boxSkin], constant(s.doorTop), constant(s.boxRoof - 0.06), constant([s.rear, s.rear + 0.08]), skin(47))
             + w.sheet('line_far', 'z', [s.rear, 0], constant(s.boxFloor), constant(s.boxRoof - 0.06), constant([-s.boxSkin, -s.boxSkin + 0.03]), function(x, y) if w.noise(53, x, y) > 0.56 then 'grime' else 'dark', 0.25)
             + [
               box('floor', 'dark', [s.rear, 0.6, -s.boxSkin], [0, s.boxFloor, s.boxSkin]),
               box('ceiling', 'soot', [s.rear + 0.1, s.boxRoof - 0.08, -s.boxSkin], [0, s.boxRoof - 0.06, s.boxSkin]),
               box('bulkhead', 'soot', [-0.04, s.boxFloor, -s.boxSkin], [0, s.boxRoof - 0.08, s.boxSkin]),
               box('step', 'rust', [s.rear - 0.16, 0.4, -s.boxSkin], [s.rear + 0.02, 0.5, s.boxSkin]),
               box('tub_near', 'soot', [s.rearAxle - s.arch, s.boxSill, 0.84], [s.rearAxle + s.arch, 0.8, 0.86]),
               box('tub_far', 'soot', [s.rearAxle - s.arch, s.boxSill, -0.86], [s.rearAxle + s.arch, 0.8, -0.84]),
               box('tub_top_near', 'soot', [s.rearAxle - s.arch, 0.78, 0.86], [s.rearAxle + s.arch, 0.8, s.boxSkin]),
               box('tub_top_far', 'soot', [s.rearAxle - s.arch, 0.78, -s.boxSkin], [s.rearAxle + s.arch, 0.8, -0.86]),
               box('locker', 'grime', [-2.6, s.boxFloor, -s.boxSkin + 0.03], [-0.9, 1.56, -0.62]),
               box('locker_gap', 'soot', [-2.0, 0.96, -0.62], [-1.5, 1.48, -0.6]),
             ]
             + k.bothSides([
               box('rear_post', 'paint', [s.rear, s.boxFloor, 0.98], [s.rear + 0.08, s.doorTop, s.boxSkin]),
             ]),
             finish),
  k.compound('abandoned_ambulance_bonnet', 24,
             // Sprung a hand's width off its catch, the near corner pushed down.
             w.surface('skin', grid(1.75, 2.62, 6), grid(-0.94, 0.94, 12), function(x, z)
               hood(x) + 0.1 * (x - 1.75) - (if z > 0.4 then 0.09 * (z - 0.4) * (x - 1.75) else 0), 0.05, roofSkin(61)),
             finish),
  k.compound('abandoned_ambulance_bumper', 18, [
    // Off its near mount, the end resting on the road.
    w.xprism('beam', 'trim', [[0.38, -0.3], [0.52, -0.3], [0.16, 1.0], [0.02, 1.0]], [2.6, 2.74]),
    box('beam_far', 'trim', [2.6, 0.38, -1.0], [2.74, 0.52, -0.3]),
  ], finish),
  k.compound('abandoned_ambulance_lamp', 6, [
    box('lens', 'lens', [2.5, 0.62, -0.84], [2.6, 0.82, -0.56]),
  ], { lens: 'plastic-frosted' }),
  k.compound('abandoned_ambulance_mirror', 3, [
    box('arm', 'trim', [1.68, 1.28, 1.0], [1.72, 1.32, 1.1]),
    box('plate', 'trim', [1.68, 0.92, 1.1], [1.72, 1.32, 1.2]),
  ], finish),
  k.compound('abandoned_ambulance_engine', 220, [
    box('block', 'soot', [1.78, 0.4, -0.26], [2.32, 0.88, 0.26]),
    box('head', 'rust', [1.82, 0.88, -0.2], [2.28, 0.98, 0.2]),
    box('gearbox', 'soot', [1.3, 0.4, -0.16], [1.78, 0.68, 0.16]),
  ], finish),
  k.compound('abandoned_ambulance_cab_door', 32,
             w.sheet('panel', 'z', [0.16, 1.3], constant(s.floor), constant(s.waist), constant([s.skin, s.side]), skin(71))
             + w.sheet('rear_bar', 'z', [0.16, 0.26], constant(s.waist), constant(s.cabRoof - 0.16), constant([s.skin, s.side]), skin(73)),
             finish),
  k.compound('abandoned_ambulance_cab_door_ajar', 32,
             w.swung('panel', [-1.0, 1.3], [-1.42, 0.2], 0.05, constant(s.floor - 0.06), constant(s.waist - 0.06), function(t, y) skin(77)(t * 3, y), 10)
             + w.swung('top_rail', [-1.0, 1.3], [-1.42, 0.2], 0.05, constant(1.9), constant(1.98), function(t, y) 'paint', 4)
             + w.swung('rear_bar', [-1.38, 0.3], [-1.42, 0.2], 0.05, constant(s.waist - 0.06), constant(1.9), function(t, y) 'paint', 1),
             finish),
  k.compound('abandoned_ambulance_sliding_door', 46,
             // Left a hand's width open on its runner.
             w.sheet('panel', 'z', [-1.24, -0.26], constant(s.boxSill + 0.04), constant(s.doorTop), constant([s.boxSide, s.boxSide + 0.05]), function(x, y)
               if x > -1.14 && x < -0.36 && y > 1.5 && y < 2.1 then null else skin(81)(x, y)),
             finish),
  k.compound('abandoned_ambulance_rear_door_near', 36,
             // The lower hinge has failed, so the door hangs from the upper one with its corner on the road.
             w.swung('panel', [0.98, s.rear], [1.6, s.rear - 0.7], 0.05, function(t) s.boxFloor * (1 - t), function(t) s.doorTop - 0.62 * t, doorSkin(83, 1.5), 7),
             finish),
  k.compound('abandoned_ambulance_rear_door_far', 36,
             w.swung('panel', [-0.98, s.rear], [-1.24, s.rear - 0.92], 0.05, function(t) s.boxFloor - 0.14 * t, function(t) s.doorTop - 0.14 * t, doorSkin(87, 1.5), 7),
             finish),
  k.compound('abandoned_ambulance_stretcher', 34,
             // Half out of the back: its inner end still on the floor, its folding legs dropped to the road.
             [box('bar_' + i, 'frame', [-3.92 + i * 0.36, 0.72 + i * 0.024, -0.26], [-3.88 + i * 0.36, 0.76 + i * 0.024, 0.26]) for i in std.range(0, 5)]
             + k.bothSides([
               k.prism('rail', 'frame', [[-3.95, 0.74], [-2.05, 0.86], [-2.05, 0.9], [-3.95, 0.78]], [0.24, 0.28]),
               k.prism('leg', 'frame', [[-3.72, 0.1], [-3.66, 0.1], [-3.36, 0.76], [-3.42, 0.76]], [0.2, 0.24]),
               k.prism('leg_rear', 'frame', [[-3.12, 0.1], [-3.06, 0.1], [-3.3, 0.78], [-3.36, 0.78]], [0.2, 0.24]),
               k.turned('castor', 'tyre', 'z', k.disc(0.07, 0.18, 0.26), [-3.69, 0.07, 0]) + { sides: 12 },
               k.turned('castor_rear', 'tyre', 'z', k.disc(0.07, 0.18, 0.26), [-3.09, 0.07, 0]) + { sides: 12 },
             ])
             + [
               k.prism('pad_' + i, if i == 2 then 'foam' else 'pad', [[-2.9 + i * 0.2, 0.88 + i * 0.013], [-2.7 + i * 0.2, 0.893 + i * 0.013], [-2.7 + i * 0.2, 0.933 + i * 0.013], [-2.9 + i * 0.2, 0.92 + i * 0.013]], [-0.24 + (i % 2) * 0.05, 0.24 - (i % 3) * 0.04])
               for i in std.range(0, 3)
             ],
             { frame: 'steel-stainless', tyre: 'rubber-black', pad: 'vinyl-black', foam: 'foam-orange' }),
  k.compound('abandoned_ambulance_seat', 16, [
    box('base', 'frame', [-0.22, 0, -0.2], [0.22, 0.32, 0.2]),
    box('pad', 'cloth', [-0.24, 0.32, -0.24], [0.24, 0.42, 0.24]),
    k.prism('back', 'cloth', [[-0.24, 0.42], [-0.12, 0.42], [-0.3, 1.0], [-0.42, 1.0]], [-0.24, 0.24]),
  ], { frame: 'steel-spall-black', cloth: 'cloth-rag' }),
  k.compound('abandoned_ambulance_beacon', 3, [
    box('base', 'trim', [-0.1, 0, -0.1], [0.1, 0.04, 0.1]),
    k.turned('dome', 'dome', 'y', [[0.04, 0], [0.04, 0.08], [0.14, 0.05], [0.14, 0], [0.04, 0]]) + { sides: 12 },
  ], { trim: 'plastic-black', dome: 'plastic-blue' }),
  k.compound('abandoned_ambulance_wheel', 34, [
    // A flat tyre: the rubber slumps out under the rim and sits on the road across a wide patch.
    k.prism('tyre', 'tyre', [[-0.2, -s.hubY], [0.2, -s.hubY], [0.34, -0.1], [0.34, 0.1], [0.22, 0.27], [-0.22, 0.27], [-0.34, 0.1], [-0.34, -0.1]], [-0.11, 0.11]),
    box('bulge', 'tyre', [-0.26, -s.hubY, -0.14], [0.26, -0.12, 0.14]),
    k.turned('rim', 'rim', 'z', k.disc(0.18, 0.09, 0.12)) + { sides: 24 },
    k.turned('rim_back', 'rim', 'z', k.disc(0.18, -0.12, -0.09)) + { sides: 24 },
    k.turned('hub', 'hub', 'z', k.disc(0.07, 0.12, 0.14)) + { sides: 12 },
    k.turned('hub_back', 'hub', 'z', k.disc(0.07, -0.14, -0.12)) + { sides: 12 },
  ], { tyre: 'rubber-offblack', rim: 'scrap-rusted', hub: 'steel-grey' }),
]
