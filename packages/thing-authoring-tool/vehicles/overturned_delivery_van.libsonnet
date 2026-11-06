local k = import 'kit.libsonnet';
local w = import 'burnt_out_van.spec.libsonnet';
local s = import 'overturned_delivery_van.spec.libsonnet';
local box = k.box;
local lying(pieces) = std.map(s.lie, pieces);
local finish = {
  paint: 'paint-drum-blue', band: 'paint-cream', rust: 'scrap-rusted', scrape: 'steel-grey', bright: 'steel-bright', grime: 'paint-charcoal',
  pan: 'paint-charcoal', soot: 'steel-spall-black', trim: 'plastic-black', steel: 'steel-grey', lining: 'plastic-grey',
};
local constant(v) = function(x) v;
local hood(x) = s.waist - (x - 1.75) * 0.3;
local roofFront = 0.85;
// The roof took the first blow of the roll, so it has come down over the cab.
local roofTop(x) = s.roof - 0.16 * std.max(0, 1 - std.abs(x - 0.5) / 1.3);
local archBottom(axle, x) =
  local d = std.abs(x - axle);
  if d >= s.arch then s.sill else s.sill + s.archRise * std.sqrt(1 - d * d / (s.arch * s.arch));
local bottom(x) = std.max(archBottom(s.rearAxle, x), archBottom(s.frontAxle, x));
// Sound paint and a pale courier's stripe on the upper side, with rust blistering at the sills and the arches.
local skin(seed) = function(x, y)
  local blister = w.noise(seed, x, y);
  if y < 0.55 + 0.45 * (blister - 0.3) || blister > 0.79 then 'rust'
  else if blister > 0.73 then 'grime'
  else if y > 0.98 && y < 1.2 && blister > 0.24 then 'band'
  else 'paint';
// Long scrapes along x, where the side and the roof slid down the road.
local scraped(seed) = function(x, y)
  local v = w.noise(seed, x * 0.15, y * 3);
  if v > 0.68 then 'bright' else if v > 0.6 then 'scrape' else if w.noise(seed + 2, x, y) > 0.76 then 'rust' else 'paint';
// The near corner of the nose was stove in, pushing the wing back and in.
local crush(x) = 0.28 * std.max(0, x - 1.95);
local grid(from, to, count) = [from + (to - from) * i / count for i in std.range(0, count)];
local nearWall =
  w.sheet('near_load', 'z', [s.rear, 0], bottom, function(x) roofTop(x) - 0.1, constant([s.skin, s.side]), skin(3))
  + w.sheet('near_b', 'z', [0, 0.1], constant(s.sill), function(x) roofTop(x) - 0.1, constant([s.skin, s.side]), skin(5))
  + w.sheet('near_header', 'z', [0.1, roofFront], function(x) roofTop(x) - 0.24, function(x) roofTop(x) - 0.1, constant([s.skin, s.side]), skin(7))
  + w.sheet('near_sill', 'z', [0.1, 1.3], constant(s.sill), constant(s.floor), constant([s.skin, s.side]), skin(9))
  + w.sheet('near_wing', 'z', [1.3, s.nose - 0.02], bottom, function(x) std.min(s.waist, hood(x)), function(x) [s.skin - crush(x), s.side - crush(x)], skin(11));
local farWall =
  w.sheet('far_load', 'z', [s.rear, 0], bottom, function(x) roofTop(x) - 0.1, constant([-s.side, -s.skin]), scraped(13))
  + w.sheet('far_b', 'z', [0, 0.1], constant(s.sill), function(x) roofTop(x) - 0.1, constant([-s.side, -s.skin]), scraped(15))
  + w.sheet('far_header', 'z', [0.1, roofFront], function(x) roofTop(x) - 0.24, function(x) roofTop(x) - 0.1, constant([-s.side, -s.skin]), scraped(17))
  + w.sheet('far_sill', 'z', [0.1, 1.3], constant(s.sill), constant(s.floor), constant([-s.side, -s.skin]), scraped(19))
  + w.sheet('far_wing', 'z', [1.3, s.nose - 0.02], bottom, function(x) std.min(s.waist, hood(x)), constant([-s.side, -s.skin]), scraped(21));
local noseHole(z, y) =
  local a = std.abs(z);
  (a < 0.5 && y > 0.56 && y < 0.78) || (a > 0.55 && a < 0.86 && y > 0.6 && y < 0.82);
local inArch(x, z) = std.abs(z) > 0.72 && (std.abs(x - s.frontAxle) < s.arch || std.abs(x - s.rearAxle) < s.arch);
local muck(seed) = function(x, z) if inArch(x, z) then null else if w.noise(seed, x, z) > 0.72 then 'rust' else 'pan';
local tub(tag, axle) = [
  box(tag + '_near', 'soot', [axle - s.arch, s.sill, 0.72], [axle + s.arch, 0.84, 0.74]),
  box(tag + '_far', 'soot', [axle - s.arch, s.sill, -0.74], [axle + s.arch, 0.84, -0.72]),
  box(tag + '_top_near', 'soot', [axle - s.arch, 0.84, 0.74], [axle + s.arch, 0.86, s.skin]),
  box(tag + '_top_far', 'soot', [axle - s.arch, 0.84, -s.skin], [axle + s.arch, 0.86, -0.74]),
];
[
  k.compound('overturned_delivery_van_chassis', 300, lying([
    box('axle_front', 'rust', [s.frontAxle - 0.05, 0.31, -0.84], [s.frontAxle + 0.05, 0.41, 0.84]),
    box('axle_rear', 'rust', [s.rearAxle - 0.05, 0.31, -0.84], [s.rearAxle + 0.05, 0.41, 0.84]),
    box('diff', 'rust', [s.rearAxle - 0.17, 0.2, -0.17], [s.rearAxle + 0.17, 0.42, 0.17]),
    box('prop', 'steel', [s.rearAxle + 0.17, 0.27, -0.04], [1.0, 0.35, 0.04]),
    box('prop_joint', 'rust', [-0.3, 0.25, -0.07], [-0.2, 0.37, 0.07]),
    box('tank', 'pan', [-1.0, 0.2, 0.1], [-0.1, 0.42, 0.42]),
    box('exhaust', 'rust', [-2.5, 0.3, -0.34], [0.9, 0.38, -0.26]),
    box('silencer', 'rust', [-1.1, 0.24, -0.4], [-0.3, 0.42, -0.2]),
    box('crossmember_rear', 'rust', [-2.4, 0.3, -0.5], [-2.3, 0.42, 0.5]),
    box('crossmember_mid', 'rust', [0.4, 0.3, -0.5], [0.5, 0.42, 0.5]),
    box('rail_near', 'rust', [-2.5, 0.3, 0.42], [2.4, 0.42, 0.5]),
    box('rail_far', 'rust', [-2.5, 0.3, -0.5], [2.4, 0.42, -0.42]),
    box('spring_near', 'steel', [s.rearAxle - 0.6, 0.28, 0.52], [s.rearAxle + 0.6, 0.34, 0.6]),
    box('spring_far', 'steel', [s.rearAxle - 0.6, 0.28, -0.6], [s.rearAxle + 0.6, 0.34, -0.52]),
    box('spring_near_b', 'rust', [s.rearAxle - 0.35, 0.22, 0.52], [s.rearAxle + 0.35, 0.28, 0.6]),
    box('spring_far_b', 'rust', [s.rearAxle - 0.35, 0.22, -0.6], [s.rearAxle + 0.35, 0.28, -0.52]),
    box('drum', 'rust', [s.frontAxle - 0.13, 0.24, 0.72], [s.frontAxle + 0.13, 0.48, 0.86]),
  ]), finish),
  k.compound('overturned_delivery_van_shell', 760, lying(
    nearWall + farWall
    + w.sheet('roof', 'y', [s.rear, roofFront], constant(-s.side), constant(s.side), function(x) [roofTop(x) - 0.1, roofTop(x)], scraped(23))
    + w.sheet('pan', 'y', [s.rear, s.nose - 0.08], constant(-s.skin), constant(s.skin), constant([s.sill, s.sill + 0.08]), muck(25))
    + w.sheet('nose', 'x', [-s.skin, s.skin - 0.18], constant(s.sill + 0.08), constant(hood(2.6)), constant([2.54, 2.6]), function(z, y) if noseHole(z, y) then null else skin(27)(z, y))
    + w.sheet('cowl', 'x', [-s.skin, s.skin], constant(1.06), constant(s.waist + 0.02), constant([1.62, 1.75]), skin(29))
    + w.sheet('rear_header', 'x', [-s.skin, s.skin], constant(2.04), constant(s.roof - 0.1), constant([s.rear, s.rear + 0.08]), skin(31))
    + w.sheet('line_far', 'z', [s.rear, 0], constant(s.floor), function(x) roofTop(x) - 0.12, constant([-s.skin, -s.skin + 0.03]), function(x, y) if w.noise(33, x, y) > 0.56 then 'lining' else 'soot', 0.25)
    + w.sheet('line_cab', 'z', [0.1, 1.5], constant(s.floor), constant(1.1), constant([-s.skin, -s.skin + 0.03]), function(x, y) 'soot', 0.5)
    + tub('tub_front', s.frontAxle) + tub('tub_rear', s.rearAxle)
    + [
      box('floor', 'pan', [s.rear, s.sill + 0.08, -s.skin], [1.3, s.floor, s.skin]),
      box('bulkhead', 'soot', [0, s.floor, -s.skin], [0.04, 2.0, s.skin]),
      box('dash', 'soot', [1.26, 0.86, -0.88], [1.42, 1.12, 0.88]),
      box('radiator', 'soot', [2.36, 0.46, -0.62], [2.46, 0.84, 0.62]),
      box('rear_sill', 'trim', [s.rear - 0.1, s.sill, -s.side], [s.rear + 0.08, 0.62, s.side]),
      box('seam_rear', 'soot', [-1.05, 0.56, s.side], [-1.03, 2.0, s.side + 0.01]),
      box('seam_front', 'soot', [-0.02, 0.56, s.side], [0, 2.0, s.side + 0.01]),
      box('seam_top', 'soot', [-1.05, 2.0, s.side], [0, 2.02, s.side + 0.01]),
      box('rail', 'trim', [-2.2, 1.26, s.side], [-1.05, 1.3, s.side + 0.015]),
    ]
    + k.bothSides([
      k.prism('a_post', 'paint', [[1.64, 1.22], [1.76, 1.22], [0.97, 2.14], [0.85, 2.14]], [0.88, 0.98]),
      box('rear_post', 'paint', [s.rear, 0.62, 0.86], [s.rear + 0.08, 2.04, s.skin]),
      box('lamp_socket', 'soot', [2.46, 0.56, 0.4], [2.52, 0.86, 0.72]),
    ])
  ), finish),
  k.compound('overturned_delivery_van_bonnet', 24, lying(
    // Buckled by the roll, its skin rippled across and sprung up at the crushed corner.
    w.surface('skin', grid(1.75, 2.54, 6), grid(-0.94, 0.8, 11), function(x, z)
      hood(x) + 0.07 * std.sin(x * 14) * (x - 1.75) + (if z > 0.3 then 0.26 * (z - 0.3) * (x - 1.75) else 0), 0.05, function(x, z)
      local v = w.noise(35, x, z);
      if v > 0.68 then 'rust' else if v > 0.6 then 'grime' else 'paint'),
  ), finish),
  k.compound('overturned_delivery_van_bumper', 16, lying([
    // Torn from its near mount, so it swings down across the nose.
    w.xprism('beam', 'trim', [[0.34, -1.0], [0.48, -1.0], [0.76, 0.86], [0.62, 0.86]], [2.56, 2.68]),
  ]), finish),
  k.compound('overturned_delivery_van_engine', 240, lying([
    box('block', 'soot', [1.8, 0.5, -0.26], [2.34, 0.98, 0.26]),
    box('sump', 'rust', [1.86, 0.3, -0.2], [2.3, 0.5, 0.2]),
    box('gearbox', 'soot', [1.2, 0.34, -0.14], [1.8, 0.64, 0.14]),
  ]), finish),
  k.compound('overturned_delivery_van_cab_door_sprung', 34, lying(
    // Sprung on its hinges by the roll, it now stands up off the top of the wreck.
    w.swung('panel', [0.98, 1.3], [1.72, 0.42], 0.05, constant(s.floor), constant(s.waist), function(t, y) skin(37)(t * 2, y), 8)
    + w.swung('top_rail', [0.98, 1.3], [1.72, 0.42], 0.05, constant(1.9), constant(1.98), function(t, y) 'paint', 4)
    + w.swung('rear_bar', [1.66, 0.49], [1.72, 0.42], 0.05, constant(s.waist), constant(1.9), function(t, y) 'paint', 1),
  ), finish),
  k.compound('overturned_delivery_van_cab_door', 36, lying(
    w.sheet('panel', 'z', [0.1, 1.3], constant(s.floor), constant(s.waist), constant([-s.side, -s.skin]), scraped(39))
    + w.sheet('bar', 'z', [0.1, 0.2], constant(s.waist), constant(1.9), constant([-s.side, -s.skin]), scraped(41)),
  ), finish),
  k.compound('overturned_delivery_van_rear_door_upper', 34, lying(
    // The upper door droops open under its own weight.
    w.swung('panel', [0.86, s.rear], [0.46, s.rear - 0.8], 0.05, constant(0.62), constant(2.04), function(t, y) skin(43)(t * 2, y), 7),
  ), finish),
  k.compound('overturned_delivery_van_rear_door_lower', 34, lying(
    // The lower door has fallen flat open on the road.
    w.sheet('panel', 'z', [s.rear - 0.86, s.rear], constant(0.62), constant(2.04), constant([-s.side, -s.side + 0.05]), skin(45)),
  ), finish),
  k.compound('overturned_delivery_van_shelving', 40, lying([
    box('upright_rear', 'rack', [-2.2, s.floor, -0.9], [-2.16, 1.9, -0.86]),
    box('upright_mid', 'rack', [-1.2, s.floor, -0.9], [-1.16, 1.9, -0.86]),
    box('upright_front', 'rack', [-0.2, s.floor, -0.9], [-0.16, 1.9, -0.86]),
    box('shelf_low', 'rack', [-2.2, 0.94, -0.9], [-0.16, 0.98, -0.5]),
    box('shelf_mid', 'rack', [-2.2, 1.4, -0.9], [-0.16, 1.44, -0.5]),
    box('shelf_high', 'rack', [-2.2, 1.86, -0.9], [-0.16, 1.9, -0.5]),
  ]), { rack: 'steel-galvanised' }),
  k.compound('overturned_delivery_van_parcels', 60, [
    // Spilled from the burst rear doors across the road.
    box('a', 'card', [-3.95, 0, 0.62], [-3.45, 0.36, 1.1]),
    box('a_tape', 'tape', [-3.95, 0.36, 0.82], [-3.45, 0.37, 0.9]),
    box('b', 'tan', [-3.9, 0.36, 0.7], [-3.56, 0.6, 1.0]),
    box('c', 'dark', [-3.3, 0, 0.7], [-2.92, 0.28, 1.14]),
    box('c_tape', 'tape', [-3.3, 0.28, 0.88], [-2.92, 0.29, 0.96]),
    box('d', 'card', [-4.5, 0, 1.15], [-4.12, 0.22, 1.5]),
    box('e', 'tan', [-3.34, 0.05, -0.46], [-3.02, 0.29, -0.1]),
    box('f', 'dark', [-2.86, 0.05, -0.75], [-2.62, 0.4, -0.36]),
    box('g', 'card', [-2.5, 0.06, -0.3], [-1.96, 0.5, 0.26]),
    box('g_tape', 'tape', [-2.5, 0.5, -0.06], [-1.96, 0.51, 0.02]),
    box('h', 'tan', [-1.9, 0.06, -0.5], [-1.5, 0.36, -0.1]),
    box('i', 'card', [-2.42, 0.5, -0.24], [-2.1, 0.74, 0.12]),
    w.yprism('j', 'card', [[1.3, -3.2], [1.7, -3.42], [1.9, -3.08], [1.5, -2.86]], [0, 0.3]),
    w.yprism('k', 'tan', [[1.65, -4.2], [1.95, -4.32], [2.05, -4.04], [1.75, -3.92]], [0, 0.2]),
  ], { card: 'cardboard-corrugated', tan: 'paperboard-tan', dark: 'paperboard-brown', tape: 'tape-tan' }),
  k.compound('overturned_delivery_van_seat', 20, std.map(function(piece) s.lie(piece, 0, 0), [
    box('base', 'frame', [-0.22, 0, -0.2], [0.22, 0.3, 0.2]),
    box('pad', 'cloth', [-0.24, 0.3, -0.24], [0.24, 0.42, 0.24]),
    k.prism('back', 'cloth', [[-0.24, 0.42], [-0.12, 0.42], [-0.3, 1.02], [-0.42, 1.02]], [-0.24, 0.24]),
  ]), { frame: 'steel-spall-black', cloth: 'cloth-seat' }),
  k.compound('overturned_delivery_van_wheel', 34, [
    // The tyre's axis stands upright because the van lies on its side.
    k.turned('tyre', 'tyre', 'y', [[-0.11, 0.2], [-0.11, 0.33], [-0.09, 0.36], [0.09, 0.36], [0.11, 0.33], [0.11, 0.2], [-0.11, 0.2]]) + { sides: 24 },
    k.turned('rim', 'rim', 'y', k.disc(0.2, -0.08, 0.08)) + { sides: 24 },
    k.turned('hub', 'hub', 'y', k.disc(0.08, 0.08, 0.11)) + { sides: 12 },
  ], { tyre: 'rubber-black', rim: 'steel-grey', hub: 'paint-charcoal' }),
]
