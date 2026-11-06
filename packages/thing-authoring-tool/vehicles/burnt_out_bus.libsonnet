local k = import 'kit.libsonnet';
local s = import 'burnt_out_bus.spec.libsonnet';
local box = k.box;
local abs = std.abs;
local bars = [s.bayFront - i * s.pitch for i in std.range(0, s.bays)];
local fin = s.finish;
local frame = { steel: 'iron-cast', rust: 'scrap-rusted', char: 'steel-spall-black' };
local sag(x) = s.collapse.depth * s.smooth((s.collapse.from - x) / (s.collapse.from - s.collapse.to));
local roofY(x, z) =
  local across = abs(z) / s.side;
  local shoulder = s.clamp((abs(z) - 0.95) / 0.325, 0, 1) * (s.roof - s.roofBase);
  s.quantise(s.roof - shoulder - sag(x) * (0.8 + 0.2 * (1 - across)), 0.0625);
local edgeY(x) = roofY(x, s.side);
local heat(x, y) = 0.2 + 0.58 * s.smooth((3.2 - x) / 6.2) + (if y > s.waist then 0.1 else 0);
local rakeX(y) = s.front - s.lean * s.clamp((y - s.screenLow) / 1.6, 0, 1);
local inside(spans, x) = std.length([1 for span in spans if x > span[0] && x < span[1]]) > 0;
local isBar(x) = std.length([1 for b in bars if abs(x - b) < 0.07]) > 0;
local wall(z0, seed, doors) = function(x, y)
  local n = s.noise(x, y, seed);
  local t = heat(x, y) + (n - 0.5) * 0.72 + (s.hash(std.floor(x * 8), std.floor(y * 8), seed + 5) - 0.5) * 0.16;
  local arch = std.length([1 for a in [s.frontAxle, s.rearAxle] if (x - a) * (x - a) + (y - s.hubY) * (y - s.hubY) < s.arch * s.arch]) > 0;
  local window = y > s.waist + 0.1 && y < s.windowTop && !isBar(x);
  if y > edgeY(x) + 0.0625 || x > rakeX(y) || arch || window || inside(doors, x) && y < s.windowTop || (y < s.waist && t > 0.8 && n > 0.74) then null
  else
    local buckle = 0.2 * s.smooth((-1.2 - x) / 2.5) * (if y > s.waist then 1 else 0.3);
    local crumple = s.quantise((s.noise(x / 2.4, y / 2.4, seed + 9) - 0.5) * 0.14 + buckle, 0.0625);
    local out = z0 + (if z0 > 0 then crumple else -crumple);
    { slot: s.burn(t, if y < s.waist then 'band' else 'paint'), w: [out - 0.0625, out] };
local roofAt(x, z) =
  local n = s.noise(x, z, 41);
  local t = heat(x, 3) + 0.02 + (n - 0.5) * 0.72;
  local y = roofY(x, z);
  local fold = abs(x - -2.6) < 0.2 || abs(x - -4.3) < 0.14;
  if x > rakeX(2.7) || (x < -1.6 && fold && n > 0.6) then null
  else { slot: if fold then 'char' else s.burn(t, 'paint'), w: [y - 0.125, y] };
local frontAt(z, y) =
  local n = s.noise(z, y, 53);
  local t = 0.16 + (y - 0.6) * 0.07 + (n - 0.5) * 0.72;
  local screen = y > s.screenLow && y < s.windowTop - 0.05 && abs(z) < 1.1;
  local lamp = y > 0.4 && y < 0.6 && abs(z) > 0.72 && abs(z) < 1.1;
  local sign = y > s.windowTop + 0.02 && y < s.roofBase - 0.08 && abs(z) < 0.95;
  local x = s.quantise(rakeX(y), 0.03125);
  if screen || lamp || y > s.roofBase then null
  else { slot: if sign then 'char' else s.burn(t, if y < s.waist then 'band' else 'paint'), w: [x - 0.0625, x] };
local rearAt(z, y) =
  local n = s.noise(z, y, 61);
  local t = 0.76 + (n - 0.5) * 0.72;
  local top = roofY(s.rear + 0.1, z);
  local hatch = y > 0.27 && y < 1.15 && abs(z) < 0.72;
  local window = y > 1.28 && abs(z) < 0.98;
  if y > top || hatch || window || abs(z) > s.side then null
  else { slot: s.burn(t, 'band'), w: [s.rear, s.rear + 0.0625] };
local floorAt(x, z) =
  local n = s.noise(x, z, 71);
  local y = if x < s.deck.x then s.deck.y else if x < s.floorStep then s.floorRear else s.floor;
  // The engine lies open under its burnt deck.
  if x < s.deck.x && abs(z) < 0.72 && x < -4.5 then null
  else { slot: s.burn(0.42 + 0.26 * s.smooth((2 - x) / 5) + (n - 0.5) * 0.5, 'rust'), w: [y - 0.0625, y] };
local seatBar(id, a, b, z) = k.prism(id, 'steel', s.ccw(s.bar(a, b, 0.04)), z);
local seat(id) = [
  // The cushions and shell burnt away; what stands is the welded frame.
  seatBar(id + '_leg_front', [0.2, 0], [0.16, 0.44], [-0.04, 0.04]),
  seatBar(id + '_leg_rear', [-0.22, 0], [-0.18, 0.44], [-0.04, 0.04]),
  seatBar(id + '_rail_a', [-0.24, 0.44], [0.24, 0.42], [-0.42, -0.38]),
  seatBar(id + '_rail_b', [-0.24, 0.44], [0.24, 0.42], [0.38, 0.42]),
  seatBar(id + '_rail_c', [-0.24, 0.44], [0.24, 0.42], [-0.02, 0.02]),
  box(id + '_nose', 'rust', [0.22, 0.4, -0.42], [0.26, 0.44, 0.42]),
  seatBar(id + '_back_a', [-0.24, 0.42], [-0.34, 0.92], [-0.42, -0.38]),
  seatBar(id + '_back_b', [-0.24, 0.42], [-0.34, 0.92], [0.38, 0.42]),
  seatBar(id + '_back_c', [-0.24, 0.42], [-0.34, 0.92], [-0.02, 0.02]),
  box(id + '_back_top', 'rust', [-0.37, 0.88, -0.42], [-0.32, 0.92, 0.42]),
];
local rim(id, massKg, twin) =
  local width = if twin then 0.26 else 0.24;
  local one(id, at) = [
    k.turned(id + '_band', 'rust', 'z', k.annulus(s.rimR - 0.05, s.rimR, -width / 2, width / 2), [0, 0, at]) + { sides: 24 },
    k.turned(id + '_flange', 'char', 'z', k.annulus(s.rimR - 0.02, s.rimR, width / 2 - 0.03, width / 2), [0, 0, at]) + { sides: 24 },
    k.turned(id + '_centre', 'steel', 'z', k.disc(s.rimR - 0.04, -0.02, 0.02), [0, 0, at]) + { sides: 24 },
    k.turned(id + '_hub', 'char', 'z', k.disc(0.11, -0.06, 0.06), [0, 0, at]) + { sides: 12 },
  ];
  k.compound(id, massKg, one('outer', if twin then 0.15 else 0) + (if twin then one('inner', -0.15) else []) + [
    // What is left of the tyre: a burnt pool under the rim.
    box('slag_a', 'char', [-0.42, -s.hubY, -0.2], [0.34, -s.hubY + 0.03, 0.22]),
    box('slag_b', 'char', [-0.26, -s.hubY, 0.2], [0.46, -s.hubY + 0.02, 0.3]),
    box('bead_a', 'char', [0.2, -s.hubY + 0.03, -0.1], [0.34, -s.hubY + 0.07, 0.12]),
  ], frame);
local wheelBox(id, x) = [
  box(id, 'soot', [x - s.arch - 0.05, s.floor, 0.76], [x + s.arch + 0.05, s.waist - 0.04, 0.82]),
  box(id + '_top', 'soot', [x - s.arch - 0.05, s.waist - 0.1, 0.76], [x + s.arch + 0.05, s.waist - 0.04, s.side - 0.06]),
];
[
  k.compound('burnt_out_bus_floor', 2300,
             s.field('deck', 'y', [s.rear, s.front - 0.06], [-s.side + 0.03, s.side - 0.03], 0.25, 0.25, floorAt)
             + [
               box('riser', 'soot', [s.floorStep - 0.06, s.floor, -s.side + 0.03], [s.floorStep, s.floorRear, s.side - 0.03]),
               box('deck_riser', 'soot', [s.deck.x - 0.06, s.floorRear, -s.side + 0.03], [s.deck.x, s.deck.y, s.side - 0.03]),
               box('rail_near', 'char', [s.rear, 0.02, 0.5], [s.front - 0.3, s.floor - 0.0625, 0.62]),
               box('rail_far', 'char', [s.rear, 0.02, -0.62], [s.front - 0.3, s.floor - 0.0625, -0.5]),
               box('axle_front', 'char', [s.frontAxle - 0.07, s.hubY - 0.07, -1.0], [s.frontAxle + 0.07, s.hubY + 0.07, 1.0]),
               box('axle_rear', 'char', [s.rearAxle - 0.1, s.hubY - 0.1, -0.86], [s.rearAxle + 0.1, s.hubY + 0.1, 0.86]),
             ]
             + k.bothSides(wheelBox('well_front', s.frontAxle) + wheelBox('well_rear', s.rearAxle)),
             fin),
  k.compound('burnt_out_bus_near_side', 1350,
             s.field('wall', 'z', [s.rear, s.front], [s.sill, s.roofBase], 0.125, 0.125, wall(s.side, 11, s.doors)), fin),
  k.compound('burnt_out_bus_far_side', 1500,
             s.field('wall', 'z', [s.rear, s.front], [s.sill, s.roofBase], 0.125, 0.125, wall(-s.side + 0.0625, 23, [])), fin),
  k.compound('burnt_out_bus_roof', 950,
             s.field('skin', 'y', [s.rear, s.front], [-s.side, s.side], 0.125, 0.125, roofAt), fin),
  k.compound('burnt_out_bus_roof_unit', 90, [
    box('base', 'soot', [0.2, s.roof, -0.72], [2.0, s.roof + 0.05, 0.72]),
    box('case', 'ash', [0.3, s.roof + 0.05, -0.62], [1.9, s.roof + 0.14, 0.62]),
    box('burst', 'char', [0.75, s.roof + 0.12, -0.36], [1.5, s.roof + 0.15, 0.3]),
    box('scab', 'rust', [1.5, s.roof + 0.12, 0.05], [1.8, s.roof + 0.15, 0.45]),
  ], fin),
  k.compound('burnt_out_bus_front', 420,
             s.field('face', 'x', [-s.side, s.side], [s.sill + 0.06, s.roofBase], 0.125, 0.125, frontAt), fin),
  k.compound('burnt_out_bus_rear', 480,
             s.field('face', 'x', [-s.side, s.side], [s.sill, 2.0], 0.125, 0.125, rearAt), fin),
  k.compound('burnt_out_bus_engine', 820, [
    box('block', 'soot', [-5.7, s.sill + 0.08, -0.34], [-4.45, 0.82, 0.34]),
    box('head', 'char', [-5.6, 0.82, -0.26], [-4.55, 0.96, 0.26]),
    box('pan', 'rust', [-5.6, s.sill, -0.24], [-4.6, s.sill + 0.08, 0.24]),
    box('radiator', 'char', [-5.88, 0.2, -0.5], [-5.72, 1.0, 0.5]),
  ], fin),
  k.compound('burnt_out_bus_hatch', 40, [
    // Hanging from one hinge, its foot on the ground behind the bus.
    k.prism('leaf', 'rust', s.ccw(s.bar([-6.02, 1.13], [-6.42, 0.03], 0.06)), [-0.72, 0.1]),
    k.prism('leaf_scorch', 'char', s.ccw(s.bar([-6.1, 0.92], [-6.38, 0.15], 0.075)), [-0.5, -0.08]),
  ], fin),
  k.compound('burnt_out_bus_bumper', 55, [
    { id: 'bar', kind: 'prism', slot: 'band', axis: 'x', profile: s.ccw(s.bar([0.14, 1.28], [0.46, -0.3], 0.26)), start: s.front - 0.04, end: s.front + 0.08 },
    { id: 'end', kind: 'prism', slot: 'char', axis: 'x', profile: s.ccw(s.bar([0.46, -0.3], [0.56, -0.92], 0.2)), start: s.front - 0.02, end: s.front + 0.08 },
    { id: 'scorch_a', kind: 'prism', slot: 'char', axis: 'x', profile: s.ccw(s.bar([0.22, 0.86], [0.33, 0.38], 0.15)), start: s.front + 0.07, end: s.front + 0.09 },
    { id: 'scorch_b', kind: 'prism', slot: 'rust', axis: 'x', profile: s.ccw(s.bar([0.36, 0.26], [0.44, -0.12], 0.12)), start: s.front + 0.07, end: s.front + 0.09 },
  ], fin),
  k.compound('burnt_out_bus_mirror', 12, [
    k.prism('arm', 'steel', s.ccw(s.bar([5.86, 2.2], [5.98, 1.62], 0.05)), [s.side, s.side + 0.04]),
    box('head', 'char', [5.94, 1.3, s.side - 0.02], [5.99, 1.65, s.side + 0.16]),
  ], { steel: 'iron-cast', char: 'steel-spall-black' }),
  k.compound('burnt_out_bus_stanchions', 45, [
    // The poles softened in the fire, so each one is two straight lengths with a kink.
    k.prism('pole_a', 'pole', s.ccw(s.bar([4.05, s.floor], [4.05, 1.5], 0.05)), [0.46, 0.51]),
    k.prism('pole_a_top', 'pole', s.ccw(s.bar([4.05, 1.5], [3.85, 2.3], 0.05)), [0.46, 0.51]),
    k.prism('pole_b', 'pole', s.ccw(s.bar([1.75, s.floor], [1.75, 1.15], 0.05)), [0.72, 0.77]),
    k.prism('pole_b_top', 'pole', s.ccw(s.bar([1.75, 1.15], [1.42, 1.72], 0.05)), [0.72, 0.77]),
    k.prism('pole_c', 'pole', s.ccw(s.bar([-0.1, s.floor], [-0.1, 2.45], 0.05)), [-0.1, -0.05]),
    k.prism('pole_d', 'pole', s.ccw(s.bar([-1.2, s.floor], [-1.2, 1.3], 0.05)), [0.1, 0.15]),
    k.prism('pole_d_top', 'pole', s.ccw(s.bar([-1.2, 1.3], [-0.85, 1.56], 0.05)), [0.1, 0.15]),
    box('rail_front', 'pole', [-0.6, 2.16, 0.2], [4.1, 2.2, 0.24]),
  ], { pole: 'steel-heat-tint' }),
  k.compound('burnt_out_bus_dash', 60, [
    box('console', 'char', [5.0, s.floor, 0.2], [5.65, 0.86, 1.15]),
    k.prism('top', 'soot', s.ccw([[5.0, 0.86], [5.65, 0.86], [5.65, 0.96], [5.2, 1.04]]), [0.2, 1.15]),
    k.prism('column', 'steel', s.ccw(s.bar([5.2, 0.9], [4.98, 1.18], 0.06)), [0.69, 0.75]),
    k.turned('wheel', 'steel', 'y', k.annulus(0.19, 0.23, 1.17, 1.21), [4.96, 0, 0.72]) + { sides: 16 },
  ], { char: 'steel-spall-black', soot: 'iron-cast', steel: 'iron-dull' }),
  k.compound('burnt_out_bus_seat_frame', 9, seat('pair'), frame),
  k.compound('burnt_out_bus_driver_frame', 14, [
    box('pedestal', 'char', [-0.18, 0, -0.2], [0.18, 0.34, 0.2]),
    seatBar('rail_a', [-0.24, 0.42], [0.22, 0.4], [-0.25, -0.21]),
    seatBar('rail_b', [-0.24, 0.42], [0.22, 0.4], [0.21, 0.25]),
    box('cross', 'rust', [-0.05, 0.34, -0.25], [0.04, 0.42, 0.25]),
    seatBar('back_a', [-0.24, 0.42], [-0.36, 1.05], [-0.25, -0.21]),
    seatBar('back_b', [-0.24, 0.42], [-0.36, 1.05], [0.21, 0.25]),
    box('back_top', 'rust', [-0.39, 1.0, -0.25], [-0.34, 1.05, 0.25]),
  ], frame),
  rim('burnt_out_bus_rim', 70, false),
  rim('burnt_out_bus_dual_rim', 130, true),
  k.compound('burnt_out_bus_sprung_door', 32, [
    // Hanging out from the front opening on its upper hinge.
    { id: 'post_a', kind: 'prism', slot: 'steel', axis: 'y', profile: s.ccw(s.bar([1.3, 5.5], [1.34, 5.46], 0.06)), start: 0.06, end: 2.26 },
    { id: 'post_b', kind: 'prism', slot: 'rust', axis: 'y', profile: s.ccw(s.bar([1.74, 5.12], [1.78, 5.08], 0.06)), start: 0.1, end: 2.2 },
    { id: 'head', kind: 'prism', slot: 'steel', axis: 'y', profile: s.ccw(s.bar([1.3, 5.5], [1.76, 5.1], 0.05)), start: 2.14, end: 2.26 },
    { id: 'mid', kind: 'prism', slot: 'char', axis: 'y', profile: s.ccw(s.bar([1.3, 5.5], [1.76, 5.1], 0.05)), start: 1.0, end: 1.08 },
    { id: 'foot', kind: 'prism', slot: 'rust', axis: 'y', profile: s.ccw(s.bar([1.3, 5.5], [1.76, 5.1], 0.05)), start: 0.1, end: 0.28 },
  ], frame),
  k.compound('burnt_out_bus_fallen_door', 30, [
    box('post_a', 'steel', [0.2, 0, 1.55], [0.28, 0.06, 2.15]),
    box('post_b', 'rust', [1.3, 0, 1.55], [1.38, 0.06, 2.15]),
    box('head', 'rust', [0.28, 0, 1.55], [1.3, 0.06, 1.63]),
    box('foot', 'char', [0.28, 0, 2.07], [1.3, 0.06, 2.15]),
    box('mid', 'steel', [0.28, 0, 1.82], [0.86, 0.04, 1.9]),
  ], frame),
]
