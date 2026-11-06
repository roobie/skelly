local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A flat ring standing on y, `t` thick, from radius `r0` to `r1`, its centre at (x, y0, z).
local washer(id, slot, r0, r1, t, x, y0, z) = turned(id, slot, 'y', [[0, r0], [0, r1], [t, r1], [t, r0], [0, r0]], [x, y0, z]);
// The same ring standing on its edge, turned about `axis` ('x' or 'z'), centred at (x, y, z).
local edgeRing(id, slot, axis, r0, r1, t, x, y, z) = turned(id, slot, axis, [[0, r0], [0, r1], [t, r1], [t, r0], [0, r0]],
                                                              if axis == 'x' then [x - t / 2, y, z] else [x, y, z - t / 2]);
// Chain links of 8 mm stock, 40 mm across with a 24 mm opening, every other one standing on its edge.
local linkR0 = 0.012, linkR1 = 0.020, linkT = 0.008, linkY = 0.020, pitch = 0.026;
local chainRun(name, n, x0, z) = [
  if i % 2 == 0 then washer('%s-%d' % [name, i], 'link', linkR0, linkR1, linkT, x0 + i * pitch, linkY - linkT / 2, z)
  else edgeRing('%s-%d' % [name, i], 'link', 'z', linkR0, linkR1, linkT, x0 + i * pitch, linkY, z)
  for i in std.range(0, n - 1)
];
// The top edge of a ceramic plate 250 mm wide with 60 mm shooter's cuts off its top corners, at `x`.
local plateTop(x) = if std.abs(x) <= 0.065 then 0.15 else 0.15 - (std.abs(x) - 0.065) * 70 / 60;
// One curved strip of the plate from `x0` to `x1`, raised `lift` off the floor; points are [z, x].
local plateStrip(i, x0, x1, lift) = h.prism('strip-%d' % i, 'cover', 'y',
                                            [[-0.15, x0], [-0.15, x1], [plateTop(x1), x1]]
                                            + (if x0 < 0.065 && 0.065 < x1 then [[0.15, 0.065]] else [])
                                            + (if x0 < -0.065 && -0.065 < x1 then [[0.15, -0.065]] else [])
                                            + [[plateTop(x0), x0]],
                                            lift, lift + 0.012);
// One saw tooth on a blade of radius 92 mm, leaning forward to a tip at 102 mm; points are [z, x].
local tooth(i, n) =
  local a = 2 * std.pi * i / n, d = std.pi / n;
  h.prism('tooth-%d' % i, 'tooth', 'y', [
    [0.090 * std.sin(a - d), 0.090 * std.cos(a - d)],
    [0.090 * std.sin(a + d * 0.6), 0.090 * std.cos(a + d * 0.6)],
    [0.102 * std.sin(a + d * 0.6), 0.102 * std.cos(a + d * 0.6)],
  ], 0, 0.002);
// One chamomile head lying face up at the end of a stem along x.
local flower(i, x, z, len) = [
  h.rod('stem-%d' % i, 'stem', 0.0015, x - len, x, 0.0015) + { origin: [x - len, 0.0015, z] },
  disc('petals-%d' % i, 'petal', 0.010, 0, 0.002, x, z),
  turned('eye-%d' % i, 'eye', 'y', [[0, 0], [0, 0.0045], [0.002, 0.004], [0.004, 0.002], [0.0045, 0]], [x, 0.002, z]),
];
// A flat gear lying on y: a disc with `n` teeth round radius `r`, its teeth `d` deep; tooth points are [z, x].
local gear(id, slot, r, d, n, t, x, y0, z) = [disc(id, slot, r - d + 0.0005, y0, y0 + t, x, z)] + [
  local a = 2 * std.pi * i / n, w = std.pi / n;
  h.prism('%s-tooth-%d' % [id, i], slot, 'y', [
    [z + (r - d) * std.sin(a - w * 0.5), x + (r - d) * std.cos(a - w * 0.5)],
    [z + r * std.sin(a - w * 0.4), x + r * std.cos(a - w * 0.4)],
    [z + r * std.sin(a + w * 0.4), x + r * std.cos(a + w * 0.4)],
    [z + (r - d) * std.sin(a + w * 0.5), x + (r - d) * std.cos(a + w * 0.5)],
  ], y0, y0 + t)
  for i in std.range(0, n - 1)
];
// A clock hand on the face plane from the centre (cx, cy) toward the hour `at`, `len` long and `w` wide; points are [x, y].
local hand(id, at, len, w, cx, cy, z0) =
  local a = 2 * std.pi * at / 12, ux = std.sin(a), uy = std.cos(a);
  h.prism(id, 'hand', 'z', [
    [cx - uy * w / 2 - ux * 0.006, cy + ux * w / 2 - uy * 0.006],
    [cx + uy * w / 2 - ux * 0.006, cy - ux * w / 2 - uy * 0.006],
    [cx + ux * len, cy + uy * len],
  ], z0, z0 + 0.002);
// A ball of radius `r` centred at (x, y, z), turned on y.
local ball(id, slot, r, x, y, z) = turned(id, slot, 'y', [
  [r * (1 - std.cos(std.pi * i / 8)), r * std.sin(std.pi * i / 8)]
  for i in std.range(0, 8)
], [x, y - r, z]);
// One turn of wire `w` thick wound at radius `r` round an axis along x, starting at `x0`; the outline closes on its
// first point so the turn stays open.
local wireTurn(id, slot, r, w, x0, y, z) = turned(id, slot, 'x', [[0, r], [w, r + w], [2 * w, r], [w, r - w], [0, r]], [x0, y, z]);
[
  // A curved body-armour plate insert, 250 mm wide and 300 mm tall, 12 mm thick, with shooter's cuts at the top
  // corners, in a black fabric cover with a white label, lying on its back.
  h.compound('ceramic_armor', 2.5, [
    plateStrip(i, [-0.125, -0.075, -0.025, 0.025, 0.075][i], [-0.075, -0.025, 0.025, 0.075, 0.125][i], [0.012, 0.004, 0, 0.004, 0.012][i])
    for i in std.range(0, 4)
  ] + [
    box('label', 'label', [-0.04, 0.012, -0.08], [0.04, 0.0135, -0.03]),
  ], { cover: 'cloth-black', label: 'paper-white' })
  + { voxelGrain: 0.004 },

  // About 2.4 m of 8 mm steel chain with 40 mm round links, laid flat in four runs joined at the turns.
  h.compound('chain', 3.5,
             chainRun('a', 23, -0.286, -0.078) + chainRun('b', 23, -0.286, -0.026) + chainRun('c', 23, -0.286, 0.026) + chainRun('d', 23, -0.286, 0.078)
             + [
               edgeRing('turn-ab', 'link', 'x', linkR0, linkR1, linkT, 0.286, linkY, -0.052),
               edgeRing('turn-bc', 'link', 'x', linkR0, linkR1, linkT, -0.286, linkY, 0),
               edgeRing('turn-cd', 'link', 'x', linkR0, linkR1, linkT, 0.286, linkY, 0.052),
             ], { link: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // A gold chalice 120 mm tall with an 80 mm cup on a knopped stem and a 70 mm foot.
  h.compound('chalice', 0.48, [
    turned('body', 'gold', 'y', [
      [0, 0], [0, 0.035], [0.004, 0.035], [0.008, 0.028], [0.014, 0.010], [0.020, 0.006], [0.034, 0.006], [0.038, 0.012],
      [0.044, 0.012], [0.048, 0.006], [0.056, 0.006], [0.062, 0.016], [0.072, 0.030], [0.090, 0.038], [0.120, 0.040],
      [0.120, 0.037], [0.090, 0.035], [0.074, 0.027], [0.066, 0.012], [0.064, 0],
    ]),
  ], { gold: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // A handful of six chamomile flowers, heads 20 mm across on stems 30 to 50 mm long.
  h.compound('chamomile', 0.003, std.flattenArrays([
    flower(0, 0.020, -0.012, 0.050),
    flower(1, 0.032, 0.008, 0.055),
    flower(2, 0.010, 0.022, 0.040),
    flower(3, 0.002, -0.004, 0.035),
    flower(4, 0.040, -0.016, 0.060),
    flower(5, 0.024, 0.032, 0.050),
  ]), { stem: 'plant-dried', petal: 'cloth-white', eye: 'plastic-yellow' })
  + { voxelGrain: 0.002 },

  // An 8 inch (204 mm) circular saw blade, 2 mm plate with a 16 mm arbor hole and 24 hooked teeth.
  h.compound('circsaw_blade', 0.44, [
    washer('plate', 'plate', 0.008, 0.092, 0.002, 0, 0, 0),
    washer('collar', 'collar', 0.008, 0.025, 0.002, 0, 0.002, 0),
  ] + [tooth(i, 24) for i in std.range(0, 23)], { plate: 'steel-stainless', collar: 'steel-blued', tooth: 'steel-grey' })
  + { voxelGrain: 0.002 },
  // A lump of fresh potter's clay about 90 by 70 mm and 45 mm high, squashed where it was set down.
  h.compound('clay_lump', 0.34, [
    turned('mass', 'clay', 'y', [[0, 0], [0, 0.030], [0.008, 0.036], [0.025, 0.035], [0.038, 0.026], [0.045, 0]], [-0.006, 0, 0]),
    turned('bulge', 'clay', 'y', [[0, 0], [0, 0.022], [0.010, 0.026], [0.022, 0.022], [0.030, 0]], [0.018, 0, 0.010]),
    turned('pinch', 'clay', 'y', [[0, 0], [0, 0.016], [0.010, 0.017], [0.020, 0]], [-0.022, 0.018, -0.012]),
  ], { clay: 'clay-terracotta' })
  + { voxelGrain: 0.002 },

  // A terracotta flower pot 155 mm tall and 176 mm across its rolled rim, with a 120 mm base.
  h.compound('clay_pot_flower', 0.85, [
    turned('pot', 'clay', 'y', [
      [0, 0], [0, 0.060], [0.125, 0.080], [0.125, 0.088], [0.155, 0.088], [0.155, 0.078], [0.012, 0.052], [0.012, 0],
    ]),
  ], { clay: 'clay-terracotta' })
  + { voxelGrain: 0.004 },

  // A wind-up twin-bell alarm clock 110 mm across and 150 mm tall on two feet, its hands stopped at ten past ten.
  local cy = 0.075;
  h.compound('clock', 0.61, [
    turned('case', 'case', 'z', [[0, 0], [0, 0.052], [0.004, 0.055], [0.040, 0.055], [0.040, 0]], [0, cy, -0.024]),
    turned('bezel', 'bezel', 'z', [[0, 0.046], [0, 0.056], [0.006, 0.054], [0.006, 0.046], [0, 0.046]], [0, cy, 0.016]),
    turned('face', 'face', 'z', [[0, 0], [0, 0.047], [0.002, 0.047], [0.002, 0]], [0, cy, 0.016]),
    hand('hour', 10.17, 0.026, 0.006, 0, cy, 0.018),
    hand('minute', 2, 0.038, 0.004, 0, cy, 0.020),
    turned('pin', 'hand', 'z', [[0, 0], [0, 0.003], [0.006, 0.003], [0.006, 0]], [0, cy, 0.018]),
    turned('bell-left', 'bell', 'y', [[0, 0], [0, 0.030], [0.012, 0.026], [0.022, 0.016], [0.026, 0]], [-0.030, 0.124, 0]),
    turned('bell-right', 'bell', 'y', [[0, 0], [0, 0.030], [0.012, 0.026], [0.022, 0.016], [0.026, 0]], [0.030, 0.124, 0]),
    box('bridge', 'bell', [-0.004, 0.126, -0.004], [0.004, 0.138, 0.004]),
    box('hammer', 'bell', [-0.003, 0.138, -0.003], [0.003, 0.150, 0.003]),
    box('key', 'bell', [-0.012, cy - 0.014, -0.034], [0.012, cy + 0.014, -0.024]),
    turned('foot-left', 'bell', 'y', [[0, 0.004], [0, 0.009], [0.008, 0.005], [0.024, 0.004], [0.024, 0]], [-0.034, 0, 0]),
    turned('foot-right', 'bell', 'y', [[0, 0.004], [0, 0.009], [0.008, 0.005], [0.024, 0.004], [0.024, 0]], [0.034, 0, 0]),
  ], { case: 'paint-red', bezel: 'steel-stainless', face: 'paper-white', hand: 'plastic-black', bell: 'steel-stainless' })
  + { voxelGrain: 0.002 },

  // A handful of clock parts about 60 mm across: three brass gears, a steel pinion and a balance wheel on their arbors.
  h.compound('clockworks', 0.036, gear('wheel-large', 'brass', 0.022, 0.003, 30, 0.002, -0.006, 0, -0.004)
    + gear('wheel-mid', 'brass', 0.014, 0.0025, 20, 0.002, 0.022, 0, 0.018)
    + gear('wheel-small', 'brass', 0.010, 0.002, 14, 0.002, 0.020, 0, -0.024)
    + gear('pinion', 'steel', 0.006, 0.002, 8, 0.004, -0.006, 0.002, -0.004) + [
    washer('balance', 'steel', 0.008, 0.011, 0.002, -0.026, 0, 0.022),
    box('balance-spoke', 'steel', [-0.036, 0, 0.021], [-0.016, 0.002, 0.023]),
    disc('arbor-large', 'steel', 0.002, 0, 0.014, -0.006, -0.004),
    disc('arbor-mid', 'steel', 0.002, 0, 0.010, 0.022, 0.018),
    disc('arbor-small', 'steel', 0.002, 0, 0.008, 0.020, -0.024),
    disc('arbor-balance', 'steel', 0.002, 0, 0.008, -0.026, 0.022),
  ], { brass: 'brass', steel: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // A small kraft paper sack of dry concrete mix, 80 by 50 mm and 96 mm tall, its top rolled down into a roll across
  // the top edge and a printed band round the middle.
  h.compound('concrete', 0.47, [
    box('sack', 'paper', [-0.040, 0, -0.025], [0.040, 0.070, 0.025]),
    h.prism('shoulder', 'paper', 'x', [[0.070, -0.025], [0.070, 0.025], [0.080, 0.010], [0.080, -0.010]], -0.040, 0.040),
    turned('roll', 'roll', 'x', [[0, 0], [0, 0.010], [0.082, 0.010], [0.082, 0]], [-0.041, 0.086, 0]),
    box('band', 'print', [-0.0405, 0.028, -0.0255], [0.0405, 0.048, 0.0255]),
  ], { paper: 'cardboard-corrugated', roll: 'paperboard-tan', print: 'paint-red' })
  + { voxelGrain: 0.002 },
  // A refrigeration condensing unit on a 400 by 260 mm base: a domed compressor, a fan in its shroud and a finned
  // coil with copper tubes, about 300 mm tall.
  h.compound('condensor_coil', 13, [
    box('base', 'base', [-0.200, 0, -0.130], [0.200, 0.008, 0.130]),
    turned('compressor', 'compressor', 'y', [[0, 0], [0, 0.070], [0.150, 0.070], [0.180, 0.058], [0.198, 0.035], [0.204, 0]], [-0.110, 0.008, 0]),
    disc('terminal', 'cover', 0.022, 0.090, 0.120, -0.110, 0.072) + { axis: 'z', origin: [-0.110, 0.110, 0.060], profile: [[0, 0], [0, 0.022], [0.020, 0.022], [0.020, 0]] },
    h.rod('suction', 'tube', 0.006, -0.090, 0.180, 0.240) + { origin: [-0.090, 0.200, 0.040] },
    h.rod('discharge', 'tube', 0.004, -0.060, 0.180, 0.170) + { origin: [-0.060, 0.170, -0.040] },
    turned('shroud', 'base', 'x', [[0, 0.110], [0, 0.118], [0.050, 0.118], [0.050, 0.110], [0, 0.110]], [0.080, 0.140, 0]),
    box('shroud-foot', 'base', [0.080, 0.008, -0.050], [0.130, 0.024, 0.050]),
    turned('motor', 'cover', 'x', [[0, 0], [0, 0.032], [0.040, 0.032], [0.045, 0.012], [0.050, 0]], [0.040, 0.140, 0]),
    box('motor-arm-a', 'base', [0.060, 0.024, -0.006], [0.072, 0.108, 0.006]),
    h.prism('blade-a', 'blade', 'x', [[0.142, -0.008], [0.142, 0.008], [0.240, 0.030], [0.240, -0.030]], 0.100, 0.104),
    h.prism('blade-b', 'blade', 'x', [[0.138, -0.008], [0.138, 0.008], [0.040, 0.030], [0.040, -0.030]], 0.100, 0.104),
    h.prism('blade-c', 'blade', 'x', [[0.132, 0.002], [0.148, 0.002], [0.170, 0.100], [0.110, 0.100]], 0.100, 0.104),
    h.prism('blade-d', 'blade', 'x', [[0.132, -0.002], [0.148, -0.002], [0.170, -0.100], [0.110, -0.100]], 0.100, 0.104),
    box('fins', 'fins', [0.160, 0.008, -0.120], [0.196, 0.290, 0.120]),
    box('end-a', 'base', [0.156, 0.008, -0.126], [0.200, 0.296, -0.120]),
    box('end-b', 'base', [0.156, 0.008, 0.120], [0.200, 0.296, 0.126]),
  ] + [
    turned('pass-%d' % i, 'tube', 'z', [[0, 0], [0, 0.005], [0.264, 0.005], [0.264, 0]], [0.168 + (i % 2) * 0.020, 0.040 + i * 0.040, -0.132])
    for i in std.range(0, 5)
  ], { base: 'steel-galvanised', compressor: 'paint-charcoal', cover: 'plastic-black', tube: 'copper', blade: 'plastic-black', fins: 'alu-bare' })
  + { voxelGrain: 0.004 },

  // A cottonwood seed tuft, a loose white puff about 80 mm across with its small brown seed showing.
  h.compound('cottonwood_tree_boll', 0.0011, [
    ball('puff-main', 'fluff', 0.024, 0, 0.024, 0),
    ball('puff-a', 'fluff', 0.017, 0.026, 0.017, 0.008),
    ball('puff-b', 'fluff', 0.015, -0.024, 0.015, -0.010),
    ball('puff-c', 'fluff', 0.013, 0.004, 0.013, 0.024),
    ball('puff-d', 'fluff', 0.012, 0.010, 0.036, -0.012),
    ball('seed', 'seed', 0.005, -0.012, 0.030, 0.018),
  ], { fluff: 'cloth-white', seed: 'bark' })
  + { voxelGrain: 0.002 },

  // A home-made heating element: 4 mm steel wire wound into a 34 mm coil 200 mm long, with straight leads at both
  // ends twisted into terminal loops.
  local turns = 24, pitch = 0.008, cy = 0.019;
  h.compound('crude_heating_element', 0.14, [
    wireTurn('turn-%d' % i, 'wire', 0.015, 0.002, -0.096 + i * pitch, cy, 0)
    for i in std.range(0, turns - 1)
  ] + [
    h.rod('lead-a', 'wire', 0.002, -0.140, -0.094, 0.004),
    h.rod('lead-b', 'wire', 0.002, 0.094, 0.140, 0.004),
    edgeRing('eye-a', 'wire', 'z', 0.003, 0.006, 0.004, -0.146, 0.006, 0),
    edgeRing('eye-b', 'wire', 'z', 0.003, 0.006, 0.004, 0.146, 0.006, 0),
  ], { wire: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // A small mechanical delay fuze 46 mm long: a threaded steel nose, an olive plastic body with a striker lever along
  // its side, and a safety pin with a pull ring.
  h.compound('delay_fuze', 0.03, [
    turned('nose', 'steel', 'x', [[0, 0], [0, 0.005], [0.012, 0.005], [0.012, 0]], [-0.024, 0.007, 0]),
    turned('body', 'body', 'x', [[0, 0], [0, 0.007], [0.022, 0.007], [0.026, 0.004], [0.026, 0]], [-0.012, 0.007, 0]),
    box('lever', 'steel', [-0.010, 0.012, -0.003], [0.012, 0.016, 0.003]),
    box('pin', 'steel', [0.004, 0.004, 0.006], [0.006, 0.010, 0.012]),
    edgeRing('ring', 'steel', 'x', 0.004, 0.007, 0.002, 0.005, 0.007, 0.019),
  ], { steel: 'steel-grey', body: 'polymer-od-green' })
  + { voxelGrain: 0.002 },

  // A one-carat round brilliant diamond, 6.5 mm across, resting on the opened paper it is sold folded in, 70 by 40 mm.
  h.compound('diamond', 0.003, [
    box('paper', 'paper', [-0.035, 0, -0.020], [0.035, 0.002, 0.020]),
    h.prism('flap-a', 'paper', 'x', [[0.002, -0.020], [0.002, 0.020], [0.006, 0.020], [0.006, -0.020]], -0.035, -0.031),
    h.prism('flap-b', 'paper', 'x', [[0.002, -0.020], [0.002, 0.020], [0.006, 0.020], [0.006, -0.020]], 0.031, 0.035),
    box('liner', 'liner', [-0.022, 0.002, -0.016], [0.022, 0.0025, 0.016]),
    turned('stone', 'stone', 'y', [[0, 0], [0.0035, 0.00325], [0.004, 0.00325], [0.006, 0.0018], [0.006, 0]], [0, 0.0025, 0]),
  ], { paper: 'paper-white', liner: 'plastic-clear-blue', stone: 'gem-clear' })
  + { voxelGrain: 0.002 },
]
