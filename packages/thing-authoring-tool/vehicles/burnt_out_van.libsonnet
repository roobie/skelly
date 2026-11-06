local k = import 'kit.libsonnet';
local s = import 'burnt_out_van.spec.libsonnet';
local box = k.box;
local finish = { paint: 'paint-cream', ash: 'iron-dull', rust: 'scrap-rusted', scorch: 'plastic-scorched', soot: 'steel-spall-black' };
local edge(x) = s.lerp([[-2.6, 2.08], [-2.2, 2.05], [-1.6, 1.86], [-0.95, 1.73], [-0.35, 1.78], [0.2, 1.98], [0.85, 2.06]], x);
local sag(x) = (2.08 - edge(x)) / 0.35;
local hood(x) = s.waist - (x - 1.75) * 0.3;
local archBottom(axle, x) =
  local d = std.abs(x - axle);
  if d >= s.arch then s.sill else s.sill + s.archRise * std.sqrt(1 - d * d / (s.arch * s.arch));
local bottom(x) = std.max(archBottom(s.rearAxle, x), archBottom(s.frontAxle, x));
// The fire started in the cab, so the burn deepens forward; only the lower rear keeps flakes of its white paint.
local heat(x, y) = 0.6 + 0.1 * x + 0.08 * (y - 1);
local burn = s.burn([[0.74, 'soot'], [0.58, 'scorch'], [0.38, 'rust'], [0.3, 'ash']]);
local mottle(seed) = function(x, y) burn(heat(x, y) + 0.55 * (s.noise(seed, x, y) - 0.5));
local zr(sign, range) = if sign > 0 then range else [-range[1], -range[0]];
// The walls bow out where the roof has come down on them.
local bowed(sign) = function(x) zr(sign, [s.skin + 0.05 * sag(x), s.side + 0.05 * sag(x)]);
local flat(sign) = function(x) zr(sign, [s.skin, s.side]);
local constant(v) = function(x) v;
local wall(tag, sign, seed, holes) =
  local slot = function(x, y) if holes(x, y) then null else mottle(seed)(x, y);
  s.sheet(tag + '_load', 'z', [s.rear, 0], bottom, edge, bowed(sign), slot)
  + s.sheet(tag + '_b_post', 'z', [0, 0.1], constant(s.sill), edge, flat(sign), mottle(seed))
  + s.sheet(tag + '_header', 'z', [0.1, 0.85], function(x) edge(x) - 0.14, edge, flat(sign), mottle(seed))
  + s.sheet(tag + '_sill', 'z', [0.1, 1.3], constant(s.sill), constant(s.floor), flat(sign), mottle(seed))
  + s.sheet(tag + '_wing', 'z', [1.3, s.nose - 0.02], bottom, function(x) std.min(s.waist, hood(x)), flat(sign), mottle(seed));
local lining(tag, sign, x) = s.sheet(tag, 'z', x, constant(s.floor), function(u) edge(u) - 0.1, constant(zr(sign, [s.skin - 0.03, s.skin])), function(u, v) if s.noise(9 + sign, u, v) > 0.6 then 'scorch' else 'soot', 0.25);
local roofY(x, z) = edge(x) - 0.2 * sag(x) * (1 - z * z / 0.81) - (if z > 0 then 0.05 * sag(x) else 0);
local grid(from, to, count) = [from + (to - from) * i / count for i in std.range(0, count)];
local noseHole(z, y) =
  local a = std.abs(z);
  (a < 0.5 && y > 0.46 && y < 0.66) || (a > 0.55 && a < 0.86 && y > 0.5 && y < 0.72);
local doorRow(t, y) = burn(0.72 + 0.55 * (s.noise(31, t * 1.2, y) - 0.5));
[
  k.compound('burnt_out_van_chassis', 170, [
    box('axle_front', 'rust', [s.frontAxle - 0.05, 0.16, -0.8], [s.frontAxle + 0.05, 0.24, 0.8]),
    box('axle_rear', 'rust', [s.rearAxle - 0.05, 0.16, -0.8], [s.rearAxle + 0.05, 0.24, 0.8]),
    box('diff', 'rust', [s.rearAxle - 0.14, 0.12, -0.14], [s.rearAxle + 0.14, 0.28, 0.14]),
    box('exhaust', 'soot', [-2.4, 0.16, 0.5], [0.8, 0.22, 0.58]),
    box('crossmember', 'rust', [-2.4, 0.16, -0.5], [-2.3, 0.24, 0.5]),
  ] + k.bothSides([
    box('rail', 'rust', [-2.5, 0.16, 0.42], [2.4, 0.24, 0.5]),
  ]), { rust: 'scrap-rusted', soot: 'steel-spall-black' }),
  k.compound('burnt_out_van_shell', 640,
             wall('near', 1, 3, function(x, y) x > -1.04 && y > s.floor && y < edge(x) - 0.18)
             + wall('far', -1, 11, function(x, y) false)
             + lining('line_far', -1, [s.rear, 0])
             + lining('line_near', 1, [s.rear, -1.04])
             + s.surface('roof', grid(s.rear, 0.85, 23), grid(-0.94, 0.94, 12), roofY, 0.07, function(x, z)
               local v = heat(x, 2.2) + 0.65 * (s.noise(17, x, z) - 0.5);
               // The skin has burnt through where the sag is deepest.
               if sag(x) > 0.55 && std.abs(z) < 0.6 && s.noise(23, x, z) > 0.52 then null else burn(v))
             + s.sheet('nose', 'x', [-s.skin, s.skin], constant(0.3), constant(hood(2.6)), constant([2.56, 2.62]), function(z, y) if noseHole(z, y) then null else mottle(41)(z + 2.4, y))
             + s.sheet('rear_header', 'x', [-s.skin, s.skin], constant(1.82), function(z) roofY(s.rear + 0.05, z), constant([s.rear, s.rear + 0.08]), mottle(43))
             + s.sheet('cowl', 'x', [-s.skin, s.skin], constant(0.86), constant(s.waist), constant([1.62, 1.75]), mottle(47))
             + [
               box('floor', 'soot', [s.rear, s.sill, -s.skin], [1.3, s.floor, s.skin]),
               box('bay_floor', 'soot', [1.3, 0.28, -0.72], [2.56, 0.32, 0.72]),
               box('bulkhead', 'soot', [0, s.floor, -s.skin], [0.04, 1.58, s.skin]),
               box('radiator', 'soot', [2.4, 0.36, -0.62], [2.5, 0.76, 0.62]),
               box('rear_bumper', 'rust', [s.rear - 0.08, 0.24, -s.side], [s.rear + 0.08, 0.44, s.side]),
             ]
             + k.bothSides([
               k.prism('a_post', 'soot', [[1.64, 1.02], [1.76, 1.02], [0.92, 2.05], [0.8, 2.05]], [0.88, 0.97]),
               box('tub_front', 'soot', [s.frontAxle - s.arch, s.sill, 0.72], [s.frontAxle + s.arch, 0.68, 0.74]),
               box('tub_front_top', 'soot', [s.frontAxle - s.arch, 0.66, 0.74], [s.frontAxle + s.arch, 0.68, s.skin]),
               box('tub_rear', 'soot', [s.rearAxle - s.arch, s.sill, 0.72], [s.rearAxle + s.arch, 0.68, 0.74]),
               box('tub_rear_top', 'soot', [s.rearAxle - s.arch, 0.66, 0.74], [s.rearAxle + s.arch, 0.68, s.skin]),
               box('lamp_socket', 'soot', [2.48, 0.46, 0.5], [2.54, 0.76, 0.9]),
               box('rear_post', 'rust', [s.rear, 0.44, 0.86], [s.rear + 0.08, 1.82, s.skin]),
             ]),
             finish),
  k.compound('burnt_out_van_bonnet', 18,
             // Sprung off its catch: the hinge still holds at the cowl and the front edge has curled.
             s.surface('skin', [1.74, 1.95, 2.15, 2.35, 2.5, 2.62], grid(-0.86, 0.86, 10), function(x, z)
               local rise = s.lerp([[1.74, 1.08], [2.35, 1.42], [2.5, 1.46], [2.62, 1.38]], x);
               rise - (if z > 0.3 then 0.1 * (z - 0.3) * (x - 1.74) else 0), 0.05, function(x, z) burn(0.7 + 0.8 * (s.noise(51, x, z) - 0.5))),
             finish),
  k.compound('burnt_out_van_cab_door_hanging', 28,
             // Hangs from its top hinge, swung wide; the free corner has dropped to the road.
             s.swung('panel', [1.0, 1.3], [1.92, 0.5], 0.05, function(t) 0.3 * (1 - t) + 0.0, function(t) 1.02 - 0.3 * t, doorRow)
             + s.swung('top_rail', [1.0, 1.3], [1.92, 0.5], 0.05, function(t) 1.62 - 0.32 * t, function(t) 1.7 - 0.32 * t, function(t, y) 'soot')
             + s.swung('rear_bar', [1.84, 0.57], [1.92, 0.5], 0.05, function(t) 0.72, function(t) 1.38, function(t, y) 'soot', 1),
             finish),
  k.compound('burnt_out_van_cab_door', 30,
             s.sheet('panel', 'z', [0.1, 1.3], constant(s.floor), constant(s.waist), constant([-s.side, -s.skin]), mottle(61))
             + s.sheet('rear_bar', 'z', [0.1, 0.2], constant(s.waist), function(x) edge(x) - 0.14, constant([-s.side, -s.skin]), mottle(63)),
             finish),
  k.compound('burnt_out_van_sliding_door', 36,
             // Fell off its runner and lies propped on the sill, in the road beside the opening.
             s.surface('panel', grid(-1.3, -0.1, 8), [1.08, 1.32, 1.56, 1.8, 2.04, 2.28, 2.52], function(x, z) 0.3 - (z - 1.08) * 0.2 + 0.02 * (x + 0.7), 0.05, function(x, z) burn(0.5 + 1.0 * (s.noise(71, x, z) - 0.5))),
             finish),
  k.compound('burnt_out_van_rear_door', 30,
             s.sheet('panel', 'x', [-0.84, 0], constant(0.44), function(z) roofY(s.rear, z) - 0.24, constant([s.rear, s.rear + 0.05]), mottle(81))
             + [
               box('skin_in', 'soot', [s.rear + 0.05, 0.44, -0.84], [s.rear + 0.07, 1.8, 0]),
             ],
             finish),
  k.compound('burnt_out_van_rear_door_hanging', 28,
             s.swung('panel', [0.86, s.rear], [1.56, s.rear - 0.56], 0.05, function(t) 0.44 * (1 - t), function(t) 1.8 - 0.36 * t, function(t, y) burn(0.5 + 0.8 * (s.noise(83, t * 1.1, y) - 0.5))),
             finish),
  k.compound('burnt_out_van_bumper', 16, [
    s.xprism('beam', 'rust', [[0, -0.95], [0.12, -0.95], [0.46, 0.95], [0.34, 0.95]], [2.62, 2.7]),
  ], { rust: 'scrap-rusted' }),
  k.compound('burnt_out_van_engine', 210, [
    box('block', 'soot', [1.78, 0.3, -0.26], [2.32, 0.8, 0.26]),
    box('head', 'rust', [1.82, 0.8, -0.2], [2.28, 0.92, 0.2]),
    box('manifold', 'rust', [1.86, 0.6, 0.26], [2.24, 0.72, 0.34]),
    box('gearbox', 'soot', [1.3, 0.3, -0.16], [1.78, 0.6, 0.16]),
  ], { rust: 'scrap-rusted', soot: 'steel-spall-black' }),
  k.compound('burnt_out_van_dash', 14, [
    box('beam', 'soot', [1.3, 0.76, -0.86], [1.42, 0.86, 0.86]),
    box('column', 'scorch', [1.0, 0.86, -0.54], [1.36, 0.92, -0.48]),
    k.turned('wheel_hoop', 'rust', 'x', k.annulus(0.15, 0.18, 0.98, 1.01), [0, 0.98, -0.51]) + { sides: 12 },
  ], { rust: 'scrap-rusted', soot: 'steel-spall-black', scorch: 'plastic-scorched' }),
  k.compound('burnt_out_van_seat_frame', 9, [
    box('rail', 'frame', [-0.22, 0, -0.2], [0.22, 0.04, -0.16]),
    box('rail_b', 'frame', [-0.22, 0, 0.16], [0.22, 0.04, 0.2]),
    box('leg_front', 'frame', [0.16, 0.04, -0.2], [0.2, 0.34, 0.2]),
    box('leg_back', 'frame', [-0.2, 0.04, -0.2], [-0.16, 0.34, 0.2]),
    box('pan_a', 'frame', [-0.2, 0.34, -0.22], [0.2, 0.38, -0.18]),
    box('pan_b', 'frame', [-0.2, 0.34, 0.18], [0.2, 0.38, 0.22]),
    box('spring_a', 'spring', [-0.2, 0.35, -0.08], [0.2, 0.37, -0.05]),
    box('spring_b', 'spring', [-0.2, 0.35, 0.05], [0.2, 0.37, 0.08]),
    k.prism('back_a', 'frame', [[-0.24, 0.34], [-0.2, 0.34], [-0.34, 0.94], [-0.38, 0.94]], [-0.22, -0.18]),
    k.prism('back_b', 'frame', [[-0.24, 0.34], [-0.2, 0.34], [-0.34, 0.94], [-0.38, 0.94]], [0.18, 0.22]),
    box('back_top', 'frame', [-0.38, 0.94, -0.22], [-0.34, 0.98, 0.22]),
  ], { frame: 'steel-spall-black', spring: 'scrap-rusted' }),
  s.rim('burnt_out_van_rim', 16, s.rimRadius, 0.18),
]
