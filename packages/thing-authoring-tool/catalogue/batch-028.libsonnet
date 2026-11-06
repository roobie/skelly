local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A ring of radii r0 to r1 and `t` long about `axis`, starting at `origin`; it closes on its first point so the
// hole stays open.
local ring(id, slot, axis, r0, r1, t, origin) = turned(id, slot, axis, [[0, r0], [0, r1], [t, r1], [t, r0], [0, r0]], origin);
// A loop handle on a cup's +x side: a ring about z, `w` wide, centred at (cx, cy).
local loop(id, slot, cx, cy, r0, r1, w) = ring(id, slot, 'z', r0, r1, w, [cx, cy, -w / 2]);
// A wire bail of `n` small blocks arched over a pot in the xy plane, radius `r` about (0, cy), `s` thick.
local bail(prefix, slot, r, cy, s, n=14) = [
  local a = std.pi * i / n;
  box('%s-%d' % [prefix, i], slot, [r * std.cos(a) - s / 2, cy + r * std.sin(a) - s / 2, -s / 2], [r * std.cos(a) + s / 2, cy + r * std.sin(a) + s / 2, s / 2])
  for i in std.range(0, n)
];
// A flat fork 210 mm long lying along x, head at +x: a handle tapering into a neck, a head and four tines.
local forkPieces(t) = [
  h.prism('handle', 'fork', 'y', [[-0.0095, 0], [0.0095, 0], [0.0095, 0.012], [0.006, 0.11], [-0.006, 0.11], [-0.0095, 0.012]], 0, t),
  h.prism('neck', 'fork', 'y', [[-0.006, 0.11], [0.006, 0.11], [0.012, 0.15], [-0.012, 0.15]], 0, t),
  box('head', 'fork', [0.15, 0, -0.012], [0.165, t, 0.012]),
] + [
  box('tine-%d' % i, 'fork', [0.165, 0, -0.012 + i * 0.007], [0.21, t, -0.009 + i * 0.007])
  for i in std.range(0, 3)
];
[
  // A soup bowl 130 mm across and 60 mm deep on a foot ring, with a blue band glazed round the rim.
  h.compound('ceramic_bowl', 0.27, [
    turned('body', 'bowl', 'y', [[0, 0], [0, 0.032], [0.006, 0.034], [0.012, 0.045], [0.03, 0.058], [0.052, 0.0635], [0.052, 0.0595], [0.03, 0.053], [0.014, 0.041], [0.009, 0]]),
    turned('band', 'band', 'y', [[0.052, 0.0595], [0.052, 0.0635], [0.06, 0.065], [0.06, 0.061], [0.052, 0.0595]]),
  ], { bowl: 'ceramic-white', band: 'paint-police-blue' })
  + { voxelGrain: 0.002 },

  // A teacup 90 mm across the rim and 60 mm tall on a narrow foot, with a loop handle; 115 mm over the handle.
  h.compound('ceramic_cup', 0.14, [
    turned('body', 'cup', 'y', [[0, 0], [0, 0.022], [0.004, 0.024], [0.01, 0.032], [0.03, 0.042], [0.06, 0.045], [0.06, 0.042], [0.03, 0.039], [0.012, 0.028], [0.007, 0]]),
    loop('handle', 'cup', 0.0575, 0.036, 0.009, 0.0165, 0.007),
  ], { cup: 'ceramic-white' })
  + { voxelGrain: 0.002 },

  // A straight coffee mug 84 mm across and 95 mm tall with a loop handle, 122 mm over the handle; glazed red outside,
  // white inside.
  h.compound('ceramic_mug', 0.31, [
    turned('body', 'glaze', 'y', [[0, 0], [0, 0.04], [0.003, 0.042], [0.095, 0.042], [0.095, 0.038], [0.008, 0.038], [0.008, 0]]),
    disc('floor', 'inside', 0.038, 0.008, 0.01),
    loop('handle', 'glaze', 0.059, 0.05, 0.013, 0.021, 0.01),
  ], { glaze: 'paint-oxblood', inside: 'ceramic-white' })
  + { voxelGrain: 0.002 },

  // A dinner plate 260 mm across and 22 mm high: a flat well and a wide sloping rim on a low foot.
  h.compound('ceramic_plate', 0.35, [
    turned('body', 'plate', 'y', [[0, 0], [0, 0.06], [0.004, 0.064], [0.006, 0.085], [0.016, 0.122], [0.022, 0.13], [0.022, 0.126], [0.017, 0.118], [0.011, 0.085], [0.009, 0]]),
  ], { plate: 'ceramic-white' })
  + { voxelGrain: 0.004 },

  // A pair of wooden chopsticks 230 mm long lying side by side, tapering from 7 mm to 4 mm, lacquered at the thick end.
  h.compound('chopsticks', 0.0077, std.flattenArrays([
    [
      turned('grip-%s' % s, 'grip', 'x', [[0, 0], [0, 0.0036], [0.08, 0.003], [0.08, 0]], [0, 0.0036, z]),
      turned('tip-%s' % s, 'stick', 'x', [[0.08, 0], [0.08, 0.003], [0.23, 0.002], [0.23, 0]], [0, 0.0036, z]),
    ]
    for s in ['a', 'b']
    for z in [if s == 'a' then -0.006 else 0.006]
  ]), { grip: 'lacquer-red', stick: 'wood-birch' })
  + { voxelGrain: 0.002 },

  // A glass drip-coffee carafe 150 mm across and 180 mm tall: a bulging glass body, a black plastic collar and lid,
  // and a looped handle on its +x side, 200 mm over the handle.
  h.compound('coffeepot', 0.39, [
    turned('body', 'glass', 'y', [[0, 0], [0, 0.065], [0.01, 0.072], [0.06, 0.075], [0.11, 0.062], [0.14, 0.05], [0.14, 0.046], [0.11, 0.058], [0.06, 0.071], [0.01, 0.068], [0.005, 0.06], [0.005, 0]]),
    ring('collar', 'plastic', 'y', 0.046, 0.056, 0.03, [0, 0.14, 0]),
    disc('lid', 'plastic', 0.05, 0.165, 0.172),
    disc('knob', 'plastic', 0.012, 0.172, 0.182),
    h.prism('spout', 'plastic', 'z', [[-0.058, 0.15], [-0.058, 0.17], [-0.072, 0.172], [-0.066, 0.15]], -0.012, 0.012),
    box('handle-top', 'plastic', [0.056, 0.148, -0.008], [0.1, 0.165, 0.008]),
    box('handle-grip', 'plastic', [0.088, 0.05, -0.009], [0.102, 0.165, 0.009]),
    box('handle-foot', 'plastic', [0.073, 0.045, -0.008], [0.1, 0.058, 0.008]),
  ], { glass: 'glass-clear', plastic: 'plastic-black' })
  + { voxelGrain: 0.004 },

  // A stainless mesh colander 220 mm across the rim and 108 mm tall on a foot ring, with a handle at each side;
  // 280 mm over the handles.
  h.compound('colander_steel', 0.4, [
    turned('mesh', 'mesh', 'y', [[0, 0], [0, 0.055], [0.03, 0.08], [0.06, 0.098], [0.09, 0.106], [0.09, 0.102], [0.06, 0.094], [0.03, 0.076], [0.004, 0.052], [0.004, 0]], [0, 0.014, 0]),
    ring('foot', 'steel', 'y', 0.05, 0.057, 0.016, [0, 0, 0]),
    ring('rim', 'steel', 'y', 0.1, 0.112, 0.008, [0, 0.1, 0]),
  ] + std.flattenArrays([
    [
      box('handle-%d' % i, 'steel', if i > 0 then [0.108, 0.098, -0.022] else [-0.14, 0.098, -0.022], if i > 0 then [0.14, 0.106, 0.022] else [-0.108, 0.106, 0.022]),
      box('handle-lip-%d' % i, 'steel', if i > 0 then [0.132, 0.092, -0.022] else [-0.14, 0.092, -0.022], if i > 0 then [0.14, 0.106, 0.022] else [-0.132, 0.106, 0.022]),
    ]
    for i in [0, 1]
  ]), { mesh: 'mesh-black', steel: 'steel-stainless' })
  + { voxelGrain: 0.004 },

  // A wooden chopping board 410 by 250 mm and 20 mm thick lying flat, with a hanging slot at its +x end.
  h.compound('cutting_board', 1.4, [
    box('board', 'wood', [-0.205, 0, -0.125], [0.155, 0.02, 0.125]),
    box('end', 'wood', [0.185, 0, -0.125], [0.205, 0.02, 0.125]),
    box('side-a', 'wood', [0.155, 0, -0.125], [0.185, 0.02, -0.03]),
    box('side-b', 'wood', [0.155, 0, 0.03], [0.185, 0.02, 0.125]),
  ], { wood: 'wood-birch' })
  + { voxelGrain: 0.004 },

  // A cast-iron camp dutch oven: a pot 260 mm across and 105 mm deep on three stub legs, a flanged lid that holds
  // coals, a loop on the lid and a wire bail over the top; 285 mm across the bail ears.
  h.compound('dutch_oven', 8.3, [
    turned('pot', 'iron', 'y', [[0, 0], [0, 0.13], [0.105, 0.13], [0.105, 0.124], [0.008, 0.124], [0.008, 0]], [0, 0.03, 0]),
    disc('lid', 'iron', 0.136, 0.135, 0.143),
    ring('lid-rim', 'iron', 'y', 0.124, 0.136, 0.015, [0, 0.143, 0]),
    box('lid-post-a', 'iron', [-0.03, 0.143, -0.006], [-0.022, 0.165, 0.006]),
    box('lid-post-b', 'iron', [0.022, 0.143, -0.006], [0.03, 0.165, 0.006]),
    box('lid-bar', 'iron', [-0.03, 0.158, -0.006], [0.03, 0.166, 0.006]),
    box('ear-a', 'iron', [-0.142, 0.085, -0.012], [-0.126, 0.115, 0.012]),
    box('ear-b', 'iron', [0.126, 0.085, -0.012], [0.142, 0.115, 0.012]),
  ] + [
    disc('leg-%d' % i, 'iron', 0.012, 0, 0.032, 0.09 * std.sin(2 * std.pi * i / 3), 0.09 * std.cos(2 * std.pi * i / 3))
    for i in [0, 1, 2]
  ] + bail('bail', 'wire', 0.134, 0.1, 0.008, 36), { iron: 'iron-cast', wire: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A stainless table fork 210 mm long lying flat.
  h.compound('fork', 0.079, forkPieces(0.003), { fork: 'steel-stainless' })
  + { voxelGrain: 0.002 },

  // A tall drinking glass 80 mm across the rim and 160 mm tall, tapering to a thick base.
  h.compound('glass', 0.34, [
    turned('glass', 'glass', 'y', [[0, 0], [0, 0.034], [0.16, 0.04], [0.16, 0.037], [0.012, 0.031], [0.012, 0]]),
  ], { glass: 'glass-clear' })
  + { voxelGrain: 0.002 },

  // A glass dessert bowl 130 mm across and 65 mm deep on a flat foot.
  h.compound('glass_bowl', 0.29, [
    turned('glass', 'glass', 'y', [[0, 0], [0, 0.035], [0.012, 0.045], [0.035, 0.06], [0.065, 0.065], [0.065, 0.061], [0.035, 0.056], [0.016, 0.042], [0.008, 0.03], [0.008, 0]]),
  ], { glass: 'glass-clear' })
  + { voxelGrain: 0.002 },

  // A big steel stockpot made into a stovetop oven: 220 mm across and 150 mm deep, sooted at the base, with a bed of
  // pebbles and a wire trivet inside and its lid pushed aside to show them; 250 mm over the side handles.
  h.compound('improvised_oven', 2.1, [
    turned('pot', 'steel', 'y', [[0, 0], [0, 0.11], [0.15, 0.11], [0.15, 0.106], [0.005, 0.106], [0.005, 0]], [0, 0.004, 0]),
    ring('soot', 'soot', 'y', 0.106, 0.1105, 0.04, [0, 0, 0]),
    disc('soot-base', 'soot', 0.106, 0, 0.004),
    ring('trivet', 'wire', 'y', 0.07, 0.08, 0.004, [0, 0.04, 0]),
    box('trivet-bar-a', 'wire', [-0.075, 0.04, -0.003], [0.075, 0.044, 0.003]),
    box('trivet-bar-b', 'wire', [-0.003, 0.04, -0.075], [0.003, 0.044, 0.075]),
    disc('lid', 'steel', 0.114, 0.154, 0.16, 0.02, -0.09),
    disc('lid-knob', 'knob', 0.016, 0.16, 0.176, 0.02, -0.09),
    box('handle-a', 'steel', [-0.125, 0.12, -0.02], [-0.11, 0.132, 0.02]),
    box('handle-b', 'steel', [0.11, 0.12, -0.02], [0.125, 0.132, 0.02]),
  ] + [
    h.ball('pebble-%d' % i, 'stone', 0.012, 0.06 * std.cos(i * 1.3) * (1 - (i % 3) * 0.3), 0.022, 0.06 * std.sin(i * 1.3) * (1 - (i % 3) * 0.3), 0.7)
    for i in std.range(0, 11)
  ], { steel: 'steel-grey', soot: 'coal-black', wire: 'steel-bright', knob: 'plastic-black', stone: 'stone-grey' })
  + { voxelGrain: 0.004 },

  // An enamelled cast-iron pot 210 mm across and 120 mm tall with a lug handle at each side, black outside and
  // cream enamel inside; 250 mm over the lugs.
  h.compound('iron_pot', 3.5, [
    turned('shell', 'iron', 'y', [[0, 0], [0, 0.1], [0.008, 0.105], [0.12, 0.105], [0.12, 0.1], [0.012, 0.1], [0.012, 0]]),
    turned('enamel', 'enamel', 'y', [[0.012, 0], [0.012, 0.1], [0.12, 0.1], [0.12, 0.096], [0.016, 0.096], [0.016, 0]]),
    box('lug-a', 'iron', [-0.125, 0.09, -0.03], [-0.1, 0.106, 0.03]),
    box('lug-b', 'iron', [0.1, 0.09, -0.03], [0.125, 0.106, 0.03]),
  ], { iron: 'iron-cast', enamel: 'paint-cream' })
  + { voxelGrain: 0.004 },

  // A stainless stovetop kettle 170 mm across the base and 165 mm tall to its lid knob, with a spout on its -x side
  // and an arched handle with a black grip; 190 mm over the spout.
  h.compound('kettle', 0.58, [
    turned('body', 'steel', 'y', [[0, 0], [0, 0.082], [0.006, 0.085], [0.09, 0.075], [0.13, 0.06], [0.145, 0.045], [0.145, 0]]),
    disc('lid', 'steel', 0.045, 0.145, 0.15),
    disc('knob', 'grip', 0.012, 0.15, 0.164),
    h.prism('spout', 'steel', 'z', [[-0.06, 0.03], [-0.08, 0.03], [-0.105, 0.125], [-0.095, 0.13]], -0.009, 0.009),
    box('post-a', 'steel', [-0.042, 0.12, -0.006], [-0.034, 0.2, 0.006]),
    box('post-b', 'steel', [0.034, 0.12, -0.006], [0.042, 0.2, 0.006]),
    box('grip', 'grip', [-0.045, 0.195, -0.01], [0.045, 0.212, 0.01]),
  ], { steel: 'steel-stainless', grip: 'plastic-black' })
  + { voxelGrain: 0.004 },
]
