local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A flat ring turned about `axis`, `t` thick from radius `r0` to `r1`, starting at `origin`.
local ring(id, slot, axis, r0, r1, t, origin) = turned(id, slot, axis, [[0, r0], [0, r1], [t, r1], [t, r0], [0, r0]], origin);
// An arc of convex quads in the xy plane round (cx, cy), radii r0 to r1, from angle a0 to a1 degrees (0 is +x,
// counterclockwise), spanning z0 to z1; for blade guards. Points are [x, y].
local arc(prefix, slot, r0, r1, a0, a1, steps, cx, cy, z0, z1) =
  local ang(i) = (a0 + (a1 - a0) * i / steps) * std.pi / 180;
  local pt(r, i) = [cx + r * std.cos(ang(i)), cy + r * std.sin(ang(i))];
  [
    h.prism('%s-%d' % [prefix, i], slot, 'z', [pt(r0, i), pt(r1, i), pt(r1, i + 1), pt(r0, i + 1)], z0, z1)
    for i in std.range(0, steps - 1)
  ];
// A cut-off saw's blade standing in the xy plane round (cx, cy) under a guard over its back and top, radius r.
// Slots: blade, guard.
local cutoffBlade(r, cx, cy) = [
  ring('blade', 'blade', 'z', 0.012, r, 0.004, [cx, cy, -0.002]),
  ring('arbor', 'guard', 'z', 0, 0.030, 0.016, [cx, cy, -0.016]),
] + arc('guard-rim', 'guard', r + 0.003, r + 0.010, 15, 215, 10, cx, cy, -0.012, 0.012)
  + arc('guard-front', 'guard', r * 0.45, r + 0.010, 15, 215, 10, cx, cy, 0.008, 0.012)
  + arc('guard-back', 'guard', r * 0.45, r + 0.010, 15, 215, 10, cx, cy, -0.012, -0.008);
// A closed rear handle along x from x0 to x1 standing on the floor, its grip `grip` at height y. Slots: handle, grip.
local rearHandle(x0, x1, y) = [
  turned('grip', 'grip', 'x', [[0, 0], [0, 0.016], [x1 - x0 - 0.02, 0.016], [x1 - x0 - 0.02, 0]], [x0 + 0.02, y, 0]),
  box('handle-post', 'handle', [x0, 0, -0.014], [x0 + 0.022, y + 0.014, 0.014]),
  box('handle-foot', 'handle', [x0, 0, -0.016], [x1, 0.020, 0.016]),
  box('trigger', 'handle', [x1 - 0.07, y - 0.034, -0.007], [x1 - 0.03, y - 0.012, 0.007]),
];
// A front loop handle arched across the body at x, its top bar along z at height y, z0 to z1. Slot: handle.
local loopHandle(x, y, z0, z1, foot) = [
  turned('loop-top', 'handle', 'z', [[0, 0], [0, 0.013], [z1 - z0, 0.013], [z1 - z0, 0]], [x, y, z0]),
  box('loop-near', 'handle', [x - 0.012, foot, z1 - 0.012], [x + 0.012, y + 0.010, z1 + 0.010]),
  box('loop-far', 'handle', [x - 0.012, foot, z0 - 0.010], [x + 0.012, y + 0.010, z0 + 0.012]),
];
// One diamond segment on a grinder disc of rim radius r, from angle a to a + w, lying flat; points are [z, x].
local segment(i, n, r0, r) =
  local a = 2 * std.pi * i / n, w = 2 * std.pi / n * 0.82;
  local pt(rr, t) = [rr * std.sin(t), rr * std.cos(t)];
  [
    h.prism('seg-%d-%d' % [i, k], 'segment', 'y', [pt(r0, a + w * k / 2), pt(r, a + w * k / 2), pt(r, a + w * (k + 1) / 2), pt(r0, a + w * (k + 1) / 2)], 0, 0.0024)
    for k in [0, 1]
  ];
[
  // A battery cordless cut-off saw 0.58 m long and 0.27 m tall: a 230 mm diamond blade under its guard at the
  // front on a side arm, a round motor body with the battery under it, a loop handle over the top and a closed
  // rear handle with its trigger.
  local r = 0.115, cx = 0.215, cy = 0.122;
  h.compound('electric_masonrysaw_off', 4.2, cutoffBlade(r, cx, cy) + rearHandle(-0.245, -0.07, 0.165) + loopHandle(0.0, 0.245, -0.060, 0.050, 0.150) + [
    box('arm', 'body', [0.05, cy - 0.022, -0.050], [cx, cy + 0.022, -0.016]),
    turned('motor', 'body', 'x', [[0, 0], [0, 0.055], [0.010, 0.068], [0.150, 0.068], [0.170, 0.052], [0.170, 0]], [-0.110, 0.140, -0.010]),
    box('vents', 'trim', [-0.060, 0.135, 0.050], [0.010, 0.150, 0.060]),
    box('battery', 'battery', [-0.140, 0.020, -0.040], [-0.020, 0.090, 0.040]),
    box('battery-band', 'battery-band', [-0.140, 0.060, -0.041], [-0.020, 0.072, 0.041]),
    box('neck', 'body', [-0.080, 0.100, -0.025], [-0.060, 0.170, 0.025]),
  ], { blade: 'steel-bright', guard: 'paint-charcoal', body: 'plastic-red', trim: 'plastic-black', handle: 'plastic-black', grip: 'rubber-black', battery: 'plastic-black', 'battery-band': 'plastic-red' })
  + { handling: h.gripOn('electric_masonrysaw_off', 'grip'), voxelGrain: 0.004 },

  // A 125 mm segmented diamond cutting disc for an angle grinder, 2.4 mm thick: a steel core with a 22 mm bore,
  // ten dark diamond segments round its rim and a paper label ring at the centre.
  h.compound('grinder_blade', 0.14, [
    ring('core', 'core', 'y', 0.011, 0.0575, 0.0018, [0, 0.0003, 0]),
    ring('label', 'label', 'y', 0.011, 0.030, 0.0004, [0, 0.0021, 0]),
  ] + std.flattenArrays([segment(i, 10, 0.055, 0.0625) for i in std.range(0, 9)]),
  { core: 'steel-grey', segment: 'plastic-charcoal', label: 'plastic-yellow' })
  + { voxelGrain: 0.002 },

  // A petrol cut-off saw 0.80 m long and 0.38 m tall: a 350 mm blade under its guard on a side arm, a two-stroke
  // engine under a cover with the starter on its far side, a fuel tank and closed rear handle behind, a loop handle
  // over the top and a muffler at the front.
  local r = 0.175, cx = 0.330, cy = 0.182;
  h.compound('masonrysaw_off', 7.3, cutoffBlade(r, cx, cy) + rearHandle(-0.33, -0.15, 0.215) + loopHandle(0.04, 0.340, -0.085, 0.075, 0.200) + [
    box('arm', 'body', [0.10, cy - 0.030, -0.065], [cx, cy + 0.030, -0.020]),
    box('crankcase', 'engine', [-0.15, 0.020, -0.080], [0.13, 0.130, 0.070]),
    box('cover', 'body', [-0.12, 0.130, -0.070], [0.11, 0.270, 0.060]),
    box('filter', 'cover', [-0.10, 0.270, -0.060], [0.06, 0.300, 0.050]),
    turned('starter', 'engine', 'z', [[0, 0], [0, 0.060], [0.020, 0.060], [0.020, 0]], [-0.02, 0.120, -0.100]),
    box('starter-grip', 'handle', [-0.03, 0.180, -0.112], [0.01, 0.192, -0.098]),
    box('muffler', 'muffler', [0.13, 0.040, -0.020], [0.18, 0.120, 0.060]),
    box('tank', 'body', [-0.33, 0.020, -0.060], [-0.15, 0.110, 0.060]),
    disc('fuel-cap', 'cover', 0.018, 0.110, 0.125, -0.27, 0.0),
  ], { blade: 'steel-bright', guard: 'plastic-orange', body: 'plastic-orange', cover: 'plastic-white', engine: 'paint-charcoal', muffler: 'steel-grey', handle: 'plastic-black', grip: 'rubber-black' })
  + { handling: h.gripOn('masonrysaw_off', 'grip'), voxelGrain: 0.004 },

  // A carton of adhesive plasters 75 mm wide, 95 mm tall and 28 mm deep standing upright, a blue printed band
  // across the top, a red cross and a single plaster pictured on its front.
  h.compound('adhesive_bandages', 0.05, [
    box('carton', 'carton', [-0.0375, 0, -0.014], [0.0375, 0.095, 0.014]),
    box('band', 'print', [-0.038, 0.072, -0.0145], [0.038, 0.090, 0.0145]),
    box('cross-v', 'cross', [-0.004, 0.050, 0.014], [0.004, 0.066, 0.0145]),
    box('cross-h', 'cross', [-0.008, 0.054, 0.014], [0.008, 0.062, 0.0145]),
    box('strip', 'plaster', [-0.030, 0.018, 0.014], [0.030, 0.036, 0.015]),
    box('pad', 'pad', [-0.009, 0.020, 0.015], [0.009, 0.034, 0.0155]),
  ], { carton: 'paper-white', print: 'plastic-blue', cross: 'paint-red', plaster: 'paperboard-tan', pad: 'cloth-white' })
  + { voxelGrain: 0.002 } + h.inHand('adhesive_bandages', 'carton'),

  // A dispenser carton of foil-wrapped alcohol prep pads, 68 mm square and 60 mm tall, one 30 by 65 mm sachet
  // standing out of the slot in its top.
  h.compound('alcohol_wipes', 0.12, [
    box('carton', 'carton', [-0.034, 0, -0.034], [0.034, 0.060, 0.034]),
    box('band', 'print', [-0.0345, 0.030, -0.0345], [0.0345, 0.044, 0.0345]),
    box('slot', 'slot', [-0.022, 0.060, -0.003], [0.022, 0.0605, 0.003]),
    box('sachet', 'sachet', [-0.016, 0.040, -0.0012], [0.016, 0.088, 0.0012]),
    box('sachet-stripe', 'print', [-0.0162, 0.074, -0.0014], [0.0162, 0.080, 0.0014]),
  ], { carton: 'paper-white', print: 'plastic-blue', slot: 'plastic-black', sachet: 'foil-alu' })
  + { voxelGrain: 0.002 } + h.inHand('alcohol_wipes', 'carton'),

  // A white plastic carrier 200 by 135 mm holding six 250 ml amber glass bottles of anaesthetic agent with
  // colour-coded caps and paper labels, and a carry bar over the middle; 165 mm tall.
  h.compound('anesthetic_kit', 3.6, [
    box('tray', 'tray', [-0.100, 0, -0.0675], [0.100, 0.045, 0.0675]),
    box('post-a', 'tray', [-0.100, 0.045, -0.004], [-0.092, 0.165, 0.004]),
    box('post-b', 'tray', [0.092, 0.045, -0.004], [0.100, 0.165, 0.004]),
    turned('bar', 'tray', 'x', [[0, 0], [0, 0.007], [0.184, 0.007], [0.184, 0]], [-0.092, 0.158, 0]),
  ] + std.flattenArrays([
    local x = -0.062 + i * 0.062, z = (if j == 0 then -0.034 else 0.034);
    [
      turned('bottle-%d-%d' % [i, j], 'glass', 'y', [[0, 0], [0, 0.029], [0.088, 0.029], [0.102, 0.012], [0.110, 0.011], [0.110, 0]], [x, 0.004, z]),
      ring('label-%d-%d' % [i, j], 'label', 'y', 0.0285, 0.0295, 0.045, [x, 0.030, z]),
      disc('cap-%d-%d' % [i, j], if (i + j) % 2 == 0 then 'cap-a' else 'cap-b', 0.013, 0.114, 0.130, x, z),
    ]
    for i in [0, 1, 2]
    for j in [0, 1]
  ]), { tray: 'plastic-white', glass: 'plastic-amber', label: 'paper-white', 'cap-a': 'plastic-yellow', 'cap-b': 'plastic-blue' })
  + { voxelGrain: 0.004 },

  // A strip of torn cloth rolled into a bandage 45 mm wide and 26 mm across, its loose end trailing 30 mm.
  h.compound('bandages_makeshift', 0.0083, [
    turned('roll', 'cloth', 'x', [[0, 0], [0, 0.012], [0.045, 0.0125], [0.045, 0]], [-0.0225, 0.013, 0]),
    ring('layer-a', 'layer', 'x', 0.004, 0.005, 0.0005, [-0.023, 0.013, 0]),
    ring('layer-b', 'layer', 'x', 0.008, 0.009, 0.0005, [-0.023, 0.013, 0]),
    ring('layer-c', 'layer', 'x', 0.004, 0.005, 0.0005, [0.0225, 0.013, 0]),
    ring('layer-d', 'layer', 'x', 0.008, 0.009, 0.0005, [0.0225, 0.013, 0]),
    box('tail', 'cloth', [-0.020, 0, 0.004], [0.018, 0.0012, 0.032]),
    box('fray', 'layer', [-0.019, 0, 0.032], [0.015, 0.0010, 0.035]),
  ], { cloth: 'cloth-rag', layer: 'cloth-rag-shadow' })
  + { voxelGrain: 0.002 },

  // A small heap of five cotton balls, each about 22 mm across, slightly squashed where they rest.
  h.compound('cotton_ball', 0.0025, [
    h.ball('ball-a', 'cotton', 0.011, -0.012, 0.010, -0.006, 0.9),
    h.ball('ball-b', 'cotton', 0.011, 0.010, 0.010, -0.010, 0.9),
    h.ball('ball-c', 'cotton', 0.011, 0.000, 0.010, 0.012, 0.9),
    h.ball('ball-d', 'cotton', 0.010, 0.022, 0.009, 0.010, 0.9),
    h.ball('ball-e', 'cotton', 0.010, 0.000, 0.026, -0.001, 0.9),
  ], { cotton: 'fleece-pale' })
  + { voxelGrain: 0.002 },
]
