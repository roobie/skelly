local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A point `r` out from [cx, cz] at angle `a` degrees, 0 towards +z, as [x, z].
local polar(r, a, cx=0, cz=0) = [cx + r * std.sin(a * std.pi / 180), cz + r * std.cos(a * std.pi / 180)];
// A flat diamond lying on y from y0 to y1, pointing out at angle `a` from radius r0 to r1, `w` wide at its middle.
local petal(id, slot, a, r0, r1, w, y0, y1, cx=0, cz=0) =
  local mid = (r0 + r1) / 2, side = std.atan2(w / 2, mid) * 180 / std.pi;
  local pts = [polar(r0, a, cx, cz), polar(mid, a + side, cx, cz), polar(r1, a, cx, cz), polar(mid, a - side, cx, cz)];
  h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y0, y1);
// A flat pointed leaf lying on y from y0 to y1, `l` long from its base at [bx, bz] towards angle `a`, `w` wide.
local leaf(id, slot, a, bx, bz, l, w, y0, y1) =
  local ux = std.sin(a * std.pi / 180), uz = std.cos(a * std.pi / 180);
  local pts = [
    local t = i / 10, along = l * t, across = w / 2 * std.sin(std.pi * std.pow(t, 0.8));
    [bx + ux * along + uz * across, bz + uz * along - ux * across]
    for i in std.range(0, 10)
  ] + [
    local t = i / 10, along = l * t, across = w / 2 * std.sin(std.pi * std.pow(t, 0.8));
    [bx + ux * along - uz * across, bz + uz * along + ux * across]
    for i in std.range(1, 9)
  ];
  local ordered = pts[0:11] + std.reverse(pts[11:]);
  h.prism(id, slot, 'y', [[p[1], p[0]] for p in ordered], y0, y1);
// A wooden training dummy 1.75 m tall standing on crossed feet, its front on +z, forearms held forward on guard.
// Slots: wood, foot, tape; `armour` adds scrap plates (slots plate, rust, sheet, bolt, bucket).
local dummy(id, massKg, armour) =
  local wood = [
    box('foot-x', 'foot', [-0.32, 0, -0.05], [0.32, 0.09, 0.05]),
    box('foot-z', 'foot', [-0.05, 0, -0.32], [0.05, 0.09, 0.32]),
    disc('post', 'wood', 0.065, 0.09, 1.02),
    box('hips', 'wood', [-0.17, 0.9, -0.1], [0.17, 1.02, 0.1]),
    box('torso', 'wood', [-0.21, 1.02, -0.11], [0.21, 1.48, 0.11]),
    disc('neck', 'wood', 0.05, 1.48, 1.55),
    h.ball('head', 'wood', 0.11, 0, 1.65, 0, 1.1),
    turned('arm-l', 'wood', 'y', [[0, 0], [0, 0.045], [0.26, 0.045], [0.26, 0]], [-0.26, 1.2, 0]),
    turned('arm-r', 'wood', 'y', [[0, 0], [0, 0.045], [0.26, 0.045], [0.26, 0]], [0.26, 1.2, 0]),
    box('shoulder-l', 'wood', [-0.31, 1.4, -0.06], [-0.21, 1.47, 0.06]),
    box('shoulder-r', 'wood', [0.21, 1.4, -0.06], [0.31, 1.47, 0.06]),
    turned('forearm-l', 'wood', 'z', [[0, 0], [0, 0.04], [0.28, 0.04], [0.28, 0]], [-0.26, 1.24, 0]),
    turned('forearm-r', 'wood', 'z', [[0, 0], [0, 0.04], [0.28, 0.04], [0.28, 0]], [0.26, 1.24, 0]),
    h.ball('fist-l', 'wood', 0.05, -0.26, 1.27, 0.3),
    h.ball('fist-r', 'wood', 0.05, 0.26, 1.27, 0.3),
  ];
  local tape = [
    box('tape-chest-a', 'tape', [-0.15, 1.33, 0.11], [0.15, 1.36, 0.116]),
    box('tape-chest-b', 'tape', [-0.015, 1.2, 0.11], [0.015, 1.45, 0.116]),
    box('tape-belly', 'tape', [-0.12, 1.07, 0.11], [0.12, 1.1, 0.116]),
    box('tape-ribs-l', 'tape', [-0.211, 1.15, -0.06], [-0.205, 1.18, 0.06]),
    box('tape-ribs-r', 'tape', [0.205, 1.15, -0.06], [0.211, 1.18, 0.06]),
    box('tape-face', 'tape', [-0.07, 1.66, 0.095], [0.07, 1.69, 0.12]),
    box('tape-knee', 'tape', [-0.07, 0.48, -0.07], [0.07, 0.51, 0.07]),
  ];
  local plates = [
    box('chest', 'plate', [-0.19, 1.22, 0.11], [0.19, 1.46, 0.122]),
    box('belly', 'sheet', [-0.17, 1.03, 0.11], [0.17, 1.2, 0.12]),
    box('pauldron-l', 'rust', [-0.33, 1.47, -0.08], [-0.17, 1.49, 0.08]),
    box('pauldron-l-side', 'rust', [-0.33, 1.36, -0.08], [-0.315, 1.49, 0.08]),
    box('pauldron-r', 'rust', [0.17, 1.47, -0.08], [0.33, 1.49, 0.08]),
    box('pauldron-r-side', 'rust', [0.315, 1.36, -0.08], [0.33, 1.49, 0.08]),
    h.tube('guard-l', 'sheet', 0.04, 0.052, 0.06, 0.24, 0, 0) + { axis: 'z', origin: [-0.26, 1.24, 0.06], profile: [[0, 0.04], [0, 0.052], [0.18, 0.052], [0.18, 0.04], [0, 0.04]] },
    h.tube('guard-r', 'sheet', 0.04, 0.052, 0.06, 0.24, 0, 0) + { axis: 'z', origin: [0.26, 1.24, 0.06], profile: [[0, 0.04], [0, 0.052], [0.18, 0.052], [0.18, 0.04], [0, 0.04]] },
    turned('bucket', 'bucket', 'y', [[0, 0.125], [0.17, 0.115], [0.17, 0], [0.165, 0], [0.165, 0.11], [0, 0.12], [0, 0.125]], [0, 1.56, 0]),
    box('slit', 'tape', [-0.07, 1.65, 0.11], [0.07, 1.67, 0.13]),
    box('skirt', 'rust', [-0.19, 0.84, 0.1], [0.19, 1.03, 0.112]),
    box('shin', 'sheet', [-0.075, 0.25, 0.06], [0.075, 0.7, 0.072]),
  ] + [
    disc('bolt-%d' % i, 'bolt', 0.008, 0, 0.008) + { axis: 'z', origin: [[-0.16, 0.16, -0.16, 0.16][i], [1.25, 1.25, 1.43, 1.43][i], 0.122] }
    for i in std.range(0, 3)
  ];
  h.compound(id, massKg, wood + (if armour then plates + [tape[3], tape[4], tape[6]] else tape),
             { wood: 'wood-pine', foot: 'wood-oak', tape: 'tape-silver' }
             + (if armour then { plate: 'scrap-rusted', rust: 'rust-red', sheet: 'steel-galvanised', bolt: 'steel-grey', bucket: 'iron-dull', tape: 'tape-silver' } else {}))
  + { voxelGrain: 0.006 };
[
  // A bare 7-inch LCD panel, 165 mm by 100 mm and 8 mm thick, lying screen up in its steel frame, with a
  // flat ribbon cable out of one end to a small driver board.
  h.compound('small_lcd_screen', 0.11, [
    box('back', 'frame', [-0.0825, 0, -0.05], [0.0825, 0.004, 0.05]),
    box('bezel-n', 'bezel', [-0.0825, 0.004, -0.05], [0.0825, 0.008, -0.044]),
    box('bezel-s', 'bezel', [-0.0825, 0.004, 0.044], [0.0825, 0.008, 0.05]),
    box('bezel-w', 'bezel', [-0.0825, 0.004, -0.044], [-0.076, 0.008, 0.044]),
    box('bezel-e', 'bezel', [0.072, 0.004, -0.044], [0.0825, 0.008, 0.044]),
    box('screen', 'screen', [-0.076, 0.004, -0.044], [0.072, 0.006, 0.044]),
    box('ribbon', 'ribbon', [0.0825, 0, -0.016], [0.112, 0.002, 0.016]),
    box('board', 'board', [0.112, 0, -0.024], [0.146, 0.002, 0.024]),
    box('chip', 'chip', [0.12, 0.002, -0.01], [0.134, 0.004, 0.01]),
    box('plug', 'plug', [0.138, 0.002, -0.016], [0.146, 0.006, 0.016]),
  ], { frame: 'alu-bare', bezel: 'plastic-black', screen: 'screen-black', ribbon: 'foil-gold', board: 'circuit-green', chip: 'plastic-matte-black', plug: 'plastic-white' })
  + { voxelGrain: 0.002 },

  // A wet adobe brick, 250 mm by 125 mm and 75 mm tall, its edges slumped and flecked with chopped straw.
  h.compound('soft_adobe_brick', 4.7, [
    box('body', 'clay', [-0.125, 0, -0.0625], [0.125, 0.064, 0.0625]),
    box('top', 'clay', [-0.119, 0.064, -0.057], [0.119, 0.075, 0.057]),
    box('bulge', 'clay', [-0.128, 0.004, -0.066], [0.128, 0.03, 0.066]),
  ] + [
    local s = [[-0.09, -0.03, 1], [-0.05, 0.02, 0], [0.0, -0.04, 1], [0.04, 0.03, 0], [0.08, -0.01, 1], [0.1, 0.035, 0], [-0.02, 0.0, 0], [0.06, -0.045, 1]][i];
    if s[2] == 1 then box('straw-%d' % i, 'straw', [s[0] - 0.014, 0.075, s[1] - 0.002], [s[0] + 0.014, 0.077, s[1] + 0.002])
    else box('straw-%d' % i, 'straw', [s[0] - 0.002, 0.075, s[1] - 0.012], [s[0] + 0.002, 0.077, s[1] + 0.012])
    for i in std.range(0, 7)
  ] + [
    box('straw-side-%d' % i, 'straw', [-0.1 + i * 0.05, 0.02 + (i % 2) * 0.02, 0.066], [-0.08 + i * 0.05, 0.024 + (i % 2) * 0.02, 0.068])
    for i in std.range(0, 3)
  ], { clay: 'clay-wet', straw: 'straw-pale' })
  + { voxelGrain: 0.002 },

  // A block of pressed soybean and wheat dough, 140 mm by 90 mm and 40 mm tall, grown over with pale mould
  // that has started to turn yellow-green in patches.
  h.compound('soy_wheat_dough_done', 0.45, [
    box('block', 'dough', [-0.07, 0, -0.045], [0.07, 0.034, 0.045]),
    box('crown', 'mould', [-0.066, 0.034, -0.041], [0.066, 0.038, 0.041]),
    h.ball('lump-a', 'mould', 0.018, -0.035, 0.038, -0.015, 0.4),
    h.ball('lump-b', 'mould', 0.016, 0.025, 0.038, 0.02, 0.45),
    h.ball('lump-c', 'mould', 0.014, 0.045, 0.038, -0.022, 0.4),
    box('patch-a', 'spores', [-0.05, 0.038, 0.01], [-0.02, 0.04, 0.032]),
    box('patch-b', 'spores', [0.01, 0.038, -0.036], [0.04, 0.04, -0.016]),
    box('patch-c', 'spores', [0.046, 0.034, 0.015], [0.071, 0.036, 0.04]),
    box('patch-d', 'spores', [-0.071, 0.012, -0.02], [-0.07, 0.026, 0.01]),
    box('patch-e', 'spores', [-0.03, 0.01, 0.045], [0.0, 0.024, 0.047]),
  ], { dough: 'mushroom-pale', mould: 'fleece-pale', spores: 'cloth-sage' })
  + { voxelGrain: 0.002 },

  // A swing-out spare wheel carrier lying flat: a 50 mm square steel arm 700 mm long with a hinge bracket and
  // latch at one end and a round wheel plate with five studs at the other, braced by two gussets.
  h.compound('spare_tire_carrier', 6, [
    box('arm', 'body', [-0.33, 0, -0.025], [0.33, 0.05, 0.025]),
    box('bracket', 'body', [-0.4, 0, -0.08], [-0.33, 0.008, 0.08]),
    disc('knuckle-a', 'pin', 0.018, 0.008, 0.03, -0.38, -0.055),
    disc('knuckle-b', 'pin', 0.018, 0.008, 0.03, -0.38, 0.055),
    disc('pin', 'pin', 0.008, 0.03, 0.04, -0.38, -0.055),
    disc('pin-b', 'pin', 0.008, 0.03, 0.04, -0.38, 0.055),
    h.prism('gusset', 'body', 'y', [[0.025, 0.12], [0.025, 0.25], [0.1, 0.25]], 0, 0.006),
    h.prism('gusset-b', 'body', 'y', [[-0.025, 0.12], [-0.025, 0.25], [-0.1, 0.25]], 0, 0.006),
    disc('plate', 'body', 0.1, 0, 0.008, 0.33, 0),
    disc('hub', 'stud', 0.035, 0.008, 0.02, 0.33, 0),
  ] + [
    local p = polar(0.057, i * 72, 0.33, 0);
    disc('stud-%d' % i, 'stud', 0.007, 0.008, 0.05, p[0], p[1])
    for i in std.range(0, 4)
  ] + [
    box('latch', 'latch', [-0.31, 0.05, -0.012], [-0.17, 0.062, 0.012]),
    box('latch-tab', 'latch', [-0.33, 0.05, -0.035], [-0.31, 0.07, 0.035]),
  ], { body: 'paint-charcoal', pin: 'steel-grey', stud: 'steel-bright', latch: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A heavy suspension coil spring, 120 mm across and about 240 mm tall, wound from 13 mm steel bar.
  h.item('spring', 'coil', 2.8, { radius: 0.054, tubeRadius: 0.0065, turns: 8, pitch: 0.032 }, { body: 'steel-parkerized' })
  + { voxelGrain: 0.002 },

  // A handful of spurge, five stems about 160 mm long, each topped with a flat spray of small yellow-green
  // flower bracts, lying on its side.
  h.compound('spurge', 0.0099, std.flattenArrays([
    local s = [[-10, 0.15], [-4, 0.16], [2, 0.14], [8, 0.155], [14, 0.13]][i];
    local tip = polar(s[1], 90 + s[0] * 2, -0.08, 0);
    [
      leaf('stem-%d' % i, 'stem', 90 + s[0] * 2, -0.08, 0, s[1], 0.004, 0.004 + i * 0.002, 0.006 + i * 0.002),
      leaf('bract-%d-a' % i, 'bract', 90 + s[0] * 2 + 60, tip[0], tip[1], 0.022, 0.016, 0.006 + i * 0.002, 0.008 + i * 0.002),
      leaf('bract-%d-b' % i, 'bract', 90 + s[0] * 2 - 60, tip[0], tip[1], 0.022, 0.016, 0.006 + i * 0.002, 0.008 + i * 0.002),
      leaf('bract-%d-c' % i, 'bract', 90 + s[0] * 2, tip[0], tip[1], 0.02, 0.016, 0.008 + i * 0.002, 0.01 + i * 0.002),
      h.ball('flower-%d' % i, 'flower', 0.006, tip[0] + 0.006, 0.012 + i * 0.002, tip[1], 0.6),
      leaf('leaf-%d' % i, 'stem', 90 + s[0] * 2 + 25, polar(s[1] * 0.45, 90 + s[0] * 2, -0.08, 0)[0], polar(s[1] * 0.45, 90 + s[0] * 2, -0.08, 0)[1], 0.035, 0.008, 0.004 + i * 0.002, 0.006 + i * 0.002),
    ]
    for i in std.range(0, 4)
  ]), { stem: 'leaf-green', bract: 'cloth-sage', flower: 'plastic-yellow' })
  + { voxelGrain: 0.002 },

  // A steel armour plate for a vest, 250 mm by 300 mm with the top corners cut, about 2 mm thick and curved
  // across, lying strike face up: a dark grey spall coat on the face, stopping short of a bare steel rim.
  local plate = [[-0.125, 0.15], [0.125, 0.15], [0.125, -0.09], [0.07, -0.15], [-0.07, -0.15], [-0.125, -0.09]];
  local coat = [[-0.115, 0.14], [0.115, 0.14], [0.115, -0.086], [0.066, -0.14], [-0.066, -0.14], [-0.115, -0.086]];
  h.compound('steel_armor', 2.7, h.smoothPlate('plate', 'plate', plate, 0, 0.004, 0.4, 25)
    + h.smoothPlate('coat', 'coat', coat, 0.003, 0.004, 0.4, 23), { plate: 'steel-grey', coat: 'plastic-charcoal' })
  + { voxelGrain: 0.002 },

  // A straw doll 250 mm tall, a bundle of straw bent over for a head and tied off at the neck and waist, the
  // lower half spread into a long skirt, a twist of straw through the shoulders for arms.
  h.compound('straw_doll', 0.14, [
    turned('skirt', 'straw', 'y', [[0, 0], [0, 0.058], [0.008, 0.058], [0.07, 0.04], [0.13, 0.02], [0.13, 0]]),
    turned('bodice', 'straw', 'y', [[0, 0], [0, 0.02], [0.03, 0.024], [0.055, 0.02], [0.065, 0.012], [0.065, 0]], [0, 0.13, 0]),
    h.ball('head', 'straw', 0.026, 0, 0.222, 0, 1.1),
    h.rod('arms', 'arm', 0.007, -0.075, 0.075, 0.175),
    h.tube('wrist-l', 'tie', 0.007, 0.0095, -0.066, -0.06, 0.175, 0),
    h.tube('wrist-r', 'tie', 0.007, 0.0095, 0.06, 0.066, 0.175, 0),
    turned('neck-tie', 'tie', 'y', [[0, 0], [0, 0.014], [0.006, 0.014], [0.006, 0]], [0, 0.193, 0]),
    turned('waist-tie', 'tie', 'y', [[0, 0], [0, 0.023], [0.006, 0.023], [0.006, 0]], [0, 0.127, 0]),
  ] + [
    local p = polar(0.057, i * 30);
    box('stalk-%d' % i, 'dark', [p[0] - 0.002, 0, p[1] - 0.002], [p[0] + 0.002, 0.016, p[1] + 0.002])
    for i in std.range(0, 11)
  ], { straw: 'straw-pale', arm: 'straw-pale', tie: 'silk-cord-crimson', dark: 'plant-dried' })
  + { voxelGrain: 0.002 },

  // A cut sunflower head 260 mm across lying face up: a domed brown disc of seeds 170 mm across ringed with
  // yellow petals over green bracts, with a stub of stalk behind.
  h.compound('sunflower', 0.66, [
    disc('back', 'green', 0.09, 0, 0.022),
    turned('seeds', 'seeds', 'y', [[0, 0], [0, 0.085], [0.006, 0.084], [0.012, 0.06], [0.014, 0]], [0, 0.022, 0]),
    disc('centre', 'core', 0.03, 0.035, 0.038),
    h.rod('stalk', 'green', 0.014, -0.2, -0.05, 0.012),
  ] + [
    petal('bract-%d' % i, 'green', i * 20 + 10, 0.07, 0.115, 0.035, 0.012, 0.018)
    for i in std.range(0, 17)
  ] + [
    petal('petal-%d' % i, 'petal', i * 15, 0.075, 0.13, 0.028, 0.018 + (i % 2) * 0.004, 0.022 + (i % 2) * 0.004)
    for i in std.range(0, 23)
  ], { green: 'leaf-green', seeds: 'bark', core: 'coal-black', petal: 'plastic-yellow' })
  + { voxelGrain: 0.002 },

  // A slab of tree bark 240 mm long, 120 mm wide and 8 mm thick, curled across, rough outer bark up and
  // the pale inner bark showing at the edges.
  local slab = [[-0.06, -0.12], [0.04, -0.118], [0.06, -0.08], [0.058, 0.11], [0.03, 0.12], [-0.05, 0.115], [-0.06, 0.06]];
  h.compound('tanbark',
             0.26,
             h.smoothPlate('inner', 'inner', slab, 0, 0.004, 0.08, 8)
             + h.smoothPlate('outer', 'outer', [[p[0] * 0.95, p[1] * 0.97] for p in slab], 0.004, 0.005, 0.08, 8)
             + [
               h.onCurvedFace('crack-%d' % i, 'crack', slab, 0.004, 0.005, 0.08, [[-0.03, -0.1], [0.0, -0.06], [0.025, -0.11]][i], [[-0.025, 0.05], [0.005, 0.1], [0.03, 0.0]][i], 0.004)
               for i in std.range(0, 2)
             ],
             { inner: 'wood-oak', outer: 'bark', crack: 'coal-black' })
  + { voxelGrain: 0.002 },

  // A 42-inch flat-screen television, 960 mm wide and 570 mm tall, on a centre stand 300 mm across; its front
  // faces +z.
  h.compound('television', 11, [
    box('base', 'stand', [-0.15, 0, -0.11], [0.15, 0.02, 0.11]),
    box('neck', 'stand', [-0.04, 0.02, -0.03], [0.04, 0.09, 0.0]),
    box('frame', 'bezel', [-0.48, 0.07, -0.02], [0.48, 0.64, 0.03]),
    box('back', 'bezel', [-0.3, 0.12, -0.06], [0.3, 0.5, -0.02]),
    box('screen', 'screen', [-0.465, 0.09, 0.03], [0.465, 0.625, 0.032]),
    box('logo', 'logo', [-0.02, 0.076, 0.03], [0.02, 0.082, 0.034]),
    box('lamp', 'lamp', [0.4, 0.074, 0.03], [0.41, 0.08, 0.034]),
  ], { stand: 'plastic-black', bezel: 'plastic-charcoal', screen: 'screen-black', logo: 'metal-silver', lamp: 'plastic-red' })
  + { voxelGrain: 0.004 },

  // A bimetal thermostat 80 mm long: a steel base plate with a ceramic block holding a brass-and-steel strip
  // whose silver contact touches a fixed contact under a knurled setting screw, and two wiring terminals.
  h.compound('thermostat', 0.16, [
    box('base', 'steel', [-0.04, 0, -0.02], [0.04, 0.003, 0.02]),
    box('ear-a', 'steel', [-0.05, 0, -0.008], [-0.04, 0.003, 0.008]),
    box('ear-b', 'steel', [0.04, 0, -0.008], [0.05, 0.003, 0.008]),
    box('block', 'ceramic', [-0.036, 0.003, -0.016], [-0.016, 0.021, 0.016]),
    box('strip-brass', 'brass', [-0.03, 0.017, -0.005], [0.028, 0.019, 0.005]),
    box('strip-steel', 'steel', [-0.03, 0.015, -0.005], [0.028, 0.017, 0.005]),
    disc('contact', 'silver', 0.003, 0.019, 0.021, 0.024, 0),
    box('post', 'steel', [0.032, 0.003, -0.006], [0.038, 0.032, 0.006]),
    box('arm', 'steel', [0.018, 0.028, -0.005], [0.038, 0.031, 0.005]),
    disc('screw', 'brass', 0.0025, 0.021, 0.042, 0.024, 0),
    disc('knob', 'knob', 0.009, 0.034, 0.042, 0.024, 0),
    disc('fixed', 'silver', 0.003, 0.025, 0.028, 0.024, 0),
    disc('terminal-a', 'brass', 0.004, 0.021, 0.026, -0.03, -0.009),
    disc('terminal-b', 'brass', 0.004, 0.021, 0.026, -0.03, 0.009),
    box('lug-a', 'copper', [-0.034, 0.021, -0.014], [-0.02, 0.023, -0.004]),
    box('lug-b', 'copper', [-0.034, 0.021, 0.004], [-0.02, 0.023, 0.014]),
    disc('hole-a', 'hole', 0.0025, 0.003, 0.004, -0.045, 0),
    disc('hole-b', 'hole', 0.0025, 0.003, 0.004, 0.045, 0),
  ], { steel: 'steel-grey', ceramic: 'ceramic-white', brass: 'brass-polished', silver: 'metal-silver', knob: 'plastic-black', copper: 'copper', hole: 'coal-black' })
  + { voxelGrain: 0.002 },

  // A bunch of five raw tobacco leaves, each about 250 mm long and 100 mm wide, fanned out from their stalks,
  // which are tied together with string.
  h.compound('tobacco_raw', 0.13, std.flattenArrays([
    local a = [52, 72, 92, 112, 132][i];
    [
      leaf('leaf-%d' % i, 'leaf', a, -0.11, 0, 0.25 - (i % 2) * 0.03, 0.1, 0.002 + [0, 2, 4, 1, 3][i] * 0.002, 0.004 + [0, 2, 4, 1, 3][i] * 0.002),
      leaf('rib-%d' % i, 'rib', a, -0.11, 0, 0.22 - (i % 2) * 0.03, 0.006, 0.004 + [0, 2, 4, 1, 3][i] * 0.002, 0.005 + [0, 2, 4, 1, 3][i] * 0.002),
    ]
    for i in std.range(0, 4)
  ]) + [
    h.rod('stalks', 'rib', 0.008, -0.14, -0.1, 0.008),
    h.tube('string', 'tie', 0.008, 0.011, -0.128, -0.12, 0.008, 0),
  ], { leaf: 'leaf-green', rib: 'cloth-sage', tie: 'cord-cotton' })
  + { voxelGrain: 0.002 },

  // A home-made armoured training dummy 1.75 m tall: the wooden dummy below with scrap steel bolted over its
  // chest, belly, shoulders, forearms and shins, and a dented steel bucket for a helmet.
  dummy('training_dummy_heavy', 64, true),

  // A home-made wooden training dummy 1.75 m tall on crossed feet: a post for legs, a plank torso, a round
  // head and forearms held forward, with silver tape marking where to strike.
  dummy('training_dummy_light', 47, false),
]
