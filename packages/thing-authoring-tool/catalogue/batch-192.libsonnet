local h = import '../compound.libsonnet';
local box = h.box;
// A rolled hide lying along x, `len` long and `r` in radius, its axis at height r: the outer turn, end faces showing
// the spiral as alternating rings of outer and inner side, a loose edge along its front, and ties at `ties`.
// Slots: outer, inner, edge, tie.
local hideRoll(len, r, ties) =
  local y = r;
  [
    h.rod('roll', 'outer', r, -len / 2, len / 2, y),
    box('edge', 'edge', [-len / 2, 0, r * 0.55], [len / 2, r * 0.5, r * 1.05]),
  ] + std.flattenArrays([
    [
      h.tube('end-%d-ring-%d' % [e, i], if i % 2 == 0 then 'inner' else 'outer', r * (0.15 + 0.17 * i), r * (0.15 + 0.17 * (i + 1)) - 0.002, x, x + 0.002, y, 0)
      for i in [0, 1, 2, 3, 4]
    ] + [h.rod('end-%d-core' % e, 'inner', r * 0.15, x, x + 0.002, y)]
    for e in [0, 1]
    for x in [if e == 0 then -len / 2 - 0.002 else len / 2]
  ]) + [
    h.tube('tie-%d' % i, 'tie', r - 0.001, r + 0.005, ties[i] - 0.006, ties[i] + 0.006, y, 0)
    for i in std.range(0, std.length(ties) - 1)
  ];
// Rows of small raised scales over the top of a hide roll, `len` long and `r` in radius. Slot: scale.
local rollScales(len, r, rows) = [
  local x = -len / 2 + 0.04 + i * (len - 0.08) / 9, z = (j - 1) * r * 0.45 + (if i % 2 == 0 then 0 else r * 0.2);
  box('scale-%d-%d' % [i, j], 'scale', [x - 0.012, 2 * r - 0.004, z - 0.008], [x + 0.012, 2 * r + 0.003, z + 0.008])
  for i in std.range(0, 9)
  for j in std.range(0, rows - 1)
];
// The outline of one dragon scale, [x, z]: broad and round at the root (-x), tapering to a blunt point at +x.
local scaleOutline = [[-0.05, -0.02], [-0.04, -0.038], [-0.015, -0.045], [0.015, -0.04], [0.045, -0.02], [0.06, 0.0], [0.045, 0.02], [0.015, 0.04], [-0.015, 0.045], [-0.04, 0.038], [-0.05, 0.02]];
// A strip `w` wide on the dragon scale's face from [xa, za] to [xb, zb], in `n` short pieces so it bends with the
// scale's curve instead of standing off it at the ends. Slot: keel.
local bentStrip(prefix, a, b, w, n) = [
  local f0 = i / n, f1 = (i + 1) / n;
  h.onCurvedFace('%s-%d' % [prefix, i], 'keel', scaleOutline, 0, 0.008, 0.08, [a[0] + (b[0] - a[0]) * f0, a[1] + (b[1] - a[1]) * f0], [a[0] + (b[0] - a[0]) * f1, a[1] + (b[1] - a[1]) * f1], w)
  for i in std.range(0, n - 1)
];
// A round-bellied flask standing on y: a sphere of radius R with a flat foot, a neck, a lip; the liquid follows the
// bulb to `fill` of the half-turn, standing just proud of the glass so it shows on the tile.
local flaskR = 0.04;
local flaskOff = flaskR * (1 - std.cos(0.5));
local bulbAt(a, d) = [flaskR * (1 - std.cos(a)) - flaskOff, (flaskR + d) * std.sin(a)];
local flask(fill) = [
  h.turned('bulb', 'glass', 'y', [[0, 0]] + [bulbAt(0.5 + (2.75 - 0.5) * i / 10, 0) for i in std.range(0, 10)] + [[0.115, 0.011], [0.118, 0.014], [0.122, 0.014], [0.122, 0]], [0, 0, 0]),
  h.turned('liquid', 'liquid', 'y', [[0.001, 0]] + [bulbAt(0.5 + (fill - 0.5) * i / 8, 0.0006) for i in std.range(0, 8)] + [[bulbAt(fill, 0)[0], 0]], [0, 0, 0]),
  h.turned('cork', 'cork', 'y', [[0, 0], [0, 0.0105], [0.018, 0.012], [0.018, 0]], [0, 0.11, 0]),
  h.disc('seal', 'seal', 0.0155, 0.112, 0.12),
];
[
  // A tanned hide rolled into a bundle 500 mm long and 100 mm across, black outside with rows of dark green scales
  // left on, its pale inner side showing in the spiral at each end, tied with two cords.
  h.compound('black_dragon_hide', 1.8, hideRoll(0.5, 0.05, [-0.15, 0.15]) + rollScales(0.5, 0.05, 3), {
    outer: 'hide-dragon-black',
    inner: 'leather-tan',
    edge: 'hide-dragon-black',
    tie: 'cord-cotton',
    scale: 'scale-dragon',
  }) + { handling: h.gripOn('black_dragon_hide', 'roll') } + { voxelGrain: 0.004 },

  // The same black hide 500 mm long and 100 mm across, still raw and crusted with tanning salt, bound tight with
  // three twine ties while it cures.
  h.compound('black_dragon_tanning_hide', 2, hideRoll(0.5, 0.05, [-0.18, 0.0, 0.18]) + rollScales(0.5, 0.05, 2) + [
    box('crust-%d' % i, 'crust', [-0.22 + 0.11 * i, 0.07 + 0.01 * (i % 2), -0.03 + 0.012 * (i % 3)], [-0.18 + 0.11 * i, 0.103, 0.0 + 0.012 * (i % 3)])
    for i in [0, 1, 2, 3]
  ], {
    outer: 'hide-dragon-black',
    inner: 'flesh-membrane',
    edge: 'flesh-membrane',
    tie: 'jute',
    scale: 'scale-dragon',
    crust: 'salt-white',
  }) + { handling: h.gripOn('black_dragon_tanning_hide', 'roll') } + { voxelGrain: 0.004 },

  // One dragon scale 110 mm long, 90 mm wide and 8 mm thick, curved across its width, glossy black with a raised
  // dark green keel down its middle.
  h.compound('dragon_black_scale', 0.085, h.curvedPlate('scale', 'scale', scaleOutline, 0, 0.008, 0.08, 14) + [
  ] + bentStrip('keel', [-0.04, 0.0], [0.05, 0.0], 0.01, 12)
  + bentStrip('ridge-a', [-0.035, -0.02], [0.03, -0.012], 0.004, 9)
  + bentStrip('ridge-b', [-0.035, 0.02], [0.03, 0.012], 0.004, 9), { scale: 'chitin-black', keel: 'scale-dragon' }) + h.inHand('dragon_black_scale', 'scale-7') + { voxelGrain: 0.002 },

  // A scroll of heavy paper 300 mm long and 50 mm across, rolled on a wooden rod with turned knobs, tied with a red
  // ribbon and sealed in red wax, a strip unrolled at its front showing glowing violet runes.
  h.compound('forge_warp_scroll', 0.32, [
    h.rod('roll', 'paper', 0.025, -0.15, 0.15, 0.025),
    h.rod('rod', 'wood', 0.006, -0.17, 0.17, 0.025),
    h.turned('knob-l', 'wood', 'x', [[0, 0], [0, 0.009], [0.012, 0.01], [0.016, 0]], [-0.186, 0.025, 0]),
    h.turned('knob-r', 'wood', 'x', [[0, 0], [0, 0.01], [0.004, 0.009], [0.016, 0]], [0.17, 0.025, 0]),
    box('leaf', 'paper', [-0.145, 0, 0.02], [0.145, 0.003, 0.072]),
  ] + [
    box('rune-%d-%d' % [i, j], 'rune', [-0.12 + 0.032 * i, 0.003, 0.032 + 0.0135 * j], [-0.105 + 0.032 * i + 0.004 * (i % 2), 0.0045, 0.038 + 0.0135 * j + 0.003 * (j % 2)])
    for i in std.range(0, 7)
    for j in [0, 1, 2]
  ] + [
    h.tube('ribbon', 'ribbon', 0.024, 0.027, 0.04, 0.052, 0.025, 0),
    h.disc('wax', 'wax', 0.011, 0.048, 0.054, 0.046, 0.0),
  ], { paper: 'paper-butcher', wood: 'wood-walnut', rune: 'crystal-glow-violet', ribbon: 'cloth-crimson', wax: 'lacquer-red' }) + { handling: h.gripOn('forge_warp_scroll', 'roll') } + { voxelGrain: 0.002 },

  // A round-bellied glass flask 122 mm tall and 80 mm across, corked and sealed, about two thirds full of a glowing
  // blue liquid.
  h.compound('mana_potion_lesser', 0.35, flask(1.9), { glass: 'glass-clear', liquid: 'crystal-glow-blue', cork: 'cork', seal: 'lacquer-red' }) + h.inHand('mana_potion_lesser', 'bulb') + { voxelGrain: 0.002 },

  // A hollow leg bone 200 mm long and 26 mm across at its knuckle, broken off at the other end and ground to a slanted
  // point, with a red rune carved into its shaft and a dark plug of sludge sealing the knuckle.
  h.compound('biomancer_booster_1', 0.04, [
    h.turned('knuckle', 'bone', 'x', [[0, 0], [0, 0.009], [0.008, 0.013], [0.022, 0.012], [0.034, 0.008], [0.034, 0]], [-0.1, 0.013, 0]),
    h.rod('knuckle-lobe', 'bone', 0.0075, -0.096, -0.076, 0.013) + { origin: [-0.096, 0.013, 0.008] },
    h.turned('shaft', 'bone', 'x', [[0, 0], [0, 0.008], [0.1, 0.0075], [0.13, 0.007], [0.13, 0]], [-0.066, 0.013, 0]),
    h.turned('point', 'bone', 'x', [[0, 0], [0, 0.007], [0.036, 0.0015], [0.036, 0]], [0.064, 0.013, 0]),
    h.tube('bore', 'bore', 0.0, 0.003, 0.064, 0.066, 0.013, 0),
    h.disc('plug', 'plug', 0.006, 0.019, 0.023, -0.093, 0.0),
  ] + [
    box('rune-%d' % i, 'rune', [-0.04 + 0.016 * i, 0.019 - 0.002 * (i % 2), -0.003 + 0.002 * (i % 3)], [-0.032 + 0.016 * i, 0.0215, 0.003 + 0.002 * (i % 3)])
    for i in std.range(0, 5)
  ] + [
    box('rune-bar', 'rune', [-0.042, 0.0195, -0.0012], [0.052, 0.0215, 0.0012]),
  ], { bone: 'bone', bore: 'flesh-membrane', plug: 'plant-purple', rune: 'lacquer-red' }) + { handling: h.gripOn('biomancer_booster_1', 'shaft') } + { voxelGrain: 0.002 },

  // A steel syringe 200 mm long from thumb ring to capped needle, its barrel 18 mm across and banded with a carved
  // red rune, a brass plunger and finger flange.
  h.compound('biomancer_booster_2', 0.13, h.syringe(0.09, 0.009, 0.8, 0.05) + [
    h.tube('band-%d' % i, 'rune', 0.0085, 0.0098, -0.03 + 0.03 * i, -0.022 + 0.03 * i, 0.0135, 0)
    for i in [0, 1, 2]
  ] + [
    box('glyph-%d' % i, 'rune', [-0.016 + 0.03 * i, 0.0215, -0.003], [-0.008 + 0.03 * i, 0.0235, 0.003])
    for i in [0, 1]
  ], { barrel: 'steel-stainless', dose: 'syrup-green', stopper: 'rubber-black', plunger: 'brass-polished', hub: 'brass-polished', cap: 'steel-stainless', rune: 'lacquer-red' }) + { handling: h.gripOn('biomancer_booster_2', 'barrel') } + { voxelGrain: 0.002 },

  // A thick pale candle 90 mm tall and 60 mm across, unlit, its black wick standing in a cupped top, a band of
  // glowing blue runes cut into its front and wax runs down one side.
  h.compound('kelvinist_booster_1', 0.22, [
    h.turned('body', 'wax', 'y', [[0, 0], [0, 0.03], [0.09, 0.03], [0.09, 0.024], [0.086, 0.018], [0.086, 0]], [0, 0, 0]),
    h.disc('wick', 'wick', 0.0015, 0.086, 0.1),
    box('run-a', 'wax', [0.024, 0.05, 0.016], [0.032, 0.09, 0.022]),
    box('run-b', 'wax', [0.027, 0.03, 0.006], [0.0315, 0.072, 0.012]),
  ] + [
    box('rune-%d' % i, 'rune', [-0.022 + 0.011 * i, 0.034 + 0.004 * (i % 2), 0.02], [-0.016 + 0.011 * i, 0.05 + 0.006 * (i % 3) - 0.004 * (i % 2), 0.031 - 0.002 * std.abs(i - 2)])
    for i in std.range(0, 4)
  ] + [
    box('rune-line', 'rune', [-0.02, 0.028, 0.026], [0.02, 0.031, 0.0305]),
  ], { wax: 'wax-ivory', wick: 'cloth-charred', rune: 'crystal-glow-blue' }) + h.inHand('kelvinist_booster_1', 'body') + { voxelGrain: 0.002 },
]
