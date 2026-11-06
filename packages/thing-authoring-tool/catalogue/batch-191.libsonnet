local h = import '../compound.libsonnet';
local box = h.box;
// A ball of radius `r` turned about y, its centre at [x, y, z]; `squash` scales its height.
local ball(id, slot, r, x, y, z, squash=1, steps=8) =
  local pts = [
    local a = std.pi * i / steps;
    [r * squash * (1 - std.cos(a)), r * std.sin(a)]
    for i in std.range(0, steps)
  ];
  h.turned(id, slot, 'y', [[0, 0]] + pts[1:std.length(pts) - 1] + [[2 * r * squash, 0]], [x, y - r * squash, z]);
// A tapering curved spike lying in the xy plane, drawn as convex quads along an arc of radius `R` swept through
// `sweep` radians from its base at [x0, y0]; it is `w0` wide at the base and `w1` at the tip, and as thick on z as it
// is wide times `depth`. For fangs, claws and horns.
local spike(prefix, slot, R, sweep, x0, y0, w0, w1, n, depth=0.7) =
  local c(t) = [x0 + R * std.sin(sweep * t), y0 + R * (1 - std.cos(sweep * t))];
  local nrm(t) = [-std.sin(sweep * t), std.cos(sweep * t)];
  local w(t) = w0 + (w1 - w0) * t;
  local side(t, s) = [c(t)[0] + s * nrm(t)[0] * w(t) / 2, c(t)[1] + s * nrm(t)[1] * w(t) / 2];
  [
    local ta = i / n, tb = (i + 1) / n, d = w(ta) * depth / 2;
    h.prism('%s-%d' % [prefix, i], slot, 'z', [side(ta, -1), side(tb, -1), side(tb, 1), side(ta, 1)], -d, d)
    for i in std.range(0, n - 1)
  ];
// A domed lid with its crown along -z, its rim at z = `z0`: the reading light's cover swung open on its rear hinge.
local backDome(id, slot, a, ht, t, origin) =
  local d = h.dome(id, slot, a, ht, t, 'z', origin);
  d + { profile: [[-p[0], p[1]] for p in d.profile] };
// The reading light's brass foot, glass globe with its glowing core, top collar and carry ring; 120 mm tall.
local lampBody = [
  h.disc('foot', 'brass', 0.042, 0, 0.012),
  h.disc('foot-step', 'brass', 0.034, 0.012, 0.018),
  h.turned('globe', 'glass', 'y', [[0, 0], [0, 0.026], [0.015, 0.034], [0.035, 0.036], [0.055, 0.03], [0.068, 0.018], [0.07, 0]], [0, 0.018, 0]),
  ball('core', 'glow', 0.014, 0, 0.052, 0),
  h.disc('collar', 'brass', 0.02, 0.084, 0.094),
  box('ring-left', 'brass', [-0.018, 0.094, -0.003], [-0.012, 0.118, 0.003]),
  box('ring-right', 'brass', [0.012, 0.094, -0.003], [0.018, 0.118, 0.003]),
  box('ring-top', 'brass', [-0.018, 0.112, -0.003], [0.018, 0.118, 0.003]),
  box('hinge', 'brass', [-0.012, 0.012, -0.046], [0.012, 0.022, -0.04]),
];
// A broken egg-shell fragment's outline, [x, z] in metres; curvedPlate strips must stay convex.
local shellOutline = [[-0.06, -0.01], [-0.04, -0.04], [0.0, -0.048], [0.04, -0.042], [0.062, -0.02], [0.065, 0.015], [0.035, 0.04], [-0.015, 0.045], [-0.05, 0.025]];
local chitinOutline = [[-0.22, -0.1], [-0.12, -0.17], [0.0, -0.18], [0.14, -0.15], [0.22, -0.08], [0.23, 0.05], [0.16, 0.15], [0.0, 0.18], [-0.15, 0.15], [-0.23, 0.04]];
local buletteOutline = [[-0.42, -0.1], [-0.3, -0.27], [0.0, -0.32], [0.3, -0.27], [0.42, -0.1], [0.4, 0.12], [0.22, 0.28], [0.0, 0.3], [-0.22, 0.28], [-0.4, 0.12]];
[
  // A lumpy pearl about 48 mm long and 40 mm across, nacre flecked with grains of gold and garnet that grew into it.
  h.compound('bulette_pearl', 0.1, [
    ball('body', 'pearl', 0.02, 0, 0.02, 0, 0.95),
    ball('lobe-a', 'pearl', 0.014, 0.014, 0.017, 0.006),
    ball('lobe-b', 'pearl', 0.012, -0.015, 0.016, -0.005),
    ball('sheen', 'sheen', 0.006, -0.004, 0.034, 0.008, 0.5),
    box('glint', 'glint', [-0.006, 0.0375, 0.006], [-0.002, 0.0395, 0.01]),
    box('glint-b', 'glint', [0.012, 0.03, 0.012], [0.016, 0.034, 0.016]),
    box('fleck-a', 'gold', [0.006, 0.036, 0.0], [0.008, 0.038, 0.002]),
    box('fleck-b', 'gold', [-0.018, 0.022, 0.014], [-0.016, 0.024, 0.016]),
    box('fleck-c', 'garnet', [0.012, 0.016, 0.018], [0.014, 0.018, 0.02]),
  ], { pearl: 'pearl', sheen: 'iridescent', glint: 'crystal-glow-white', gold: 'metal-gold', garnet: 'gem-red' }) + h.inHand('bulette_pearl', 'body') + { voxelGrain: 0.002 },

  // A shield-sized armour plate 840 mm long, 620 mm wide and 30 mm thick, domed across its width, with three raised
  // growth ridges and a pale seam of mineral along its crest.
  h.compound('bulette_plate', 47, h.curvedPlate('plate', 'plate', buletteOutline, 0, 0.03, 0.9, 16) + [
    h.onCurvedFace('ridge-%d' % i, 'ridge', buletteOutline, 0, 0.03, 0.9, [-0.3 + 0.3 * i, -0.24], [-0.32 + 0.32 * i, 0.24], 0.03)
    for i in [0, 1, 2]
  ] + [
    h.onCurvedFace('vein-a', 'vein', buletteOutline, 0, 0.03, 0.9, [-0.36, 0.02], [-0.08, -0.04], 0.012),
    h.onCurvedFace('vein-b', 'vein', buletteOutline, 0, 0.03, 0.9, [0.06, 0.05], [0.34, -0.02], 0.012),
  ], { plate: 'iron-dull', ridge: 'steel-blued', vein: 'gem-aquamarine' }) + h.inHand('bulette_plate', 'plate-8') + { voxelGrain: 0.008 },

  // A plate of black spider shell 460 mm long, 360 mm wide and 8 mm thick, curved across its width, with red seams
  // where its segments meet and two short spurs on its crest.
  h.compound('demon_chitin_plate', 1.4, h.curvedPlate('plate', 'shell', chitinOutline, 0, 0.008, 0.6, 24) + [
    h.onCurvedFace('seam-%d' % i, 'seam', chitinOutline, 0, 0.008, 0.6, [-0.14 + 0.14 * i, -0.15], [-0.14 + 0.14 * i, 0.15], 0.008)
    for i in [0, 1, 2]
  ] + [
    h.turned('spur-a', 'shell', 'y', [[0, 0], [0, 0.012], [0.03, 0]], [-0.07, h.curvedTopAt(chitinOutline, 0, 0.008, 0.6, -0.07) - 0.004, 0.02]),
    h.turned('spur-b', 'shell', 'y', [[0, 0], [0, 0.012], [0.03, 0]], [0.07, h.curvedTopAt(chitinOutline, 0, 0.008, 0.6, 0.07) - 0.004, -0.02]),
  ], { shell: 'lacquer-black', seam: 'lacquer-red' }) + h.inHand('demon_chitin_plate', 'plate-12') + { voxelGrain: 0.004 },

  // A hooked fang 150 mm along its curve and 26 mm across at the root, black and glossy, with a green venom groove down
  // its outer face, a bead of venom at the tip and a ragged lump of gum at the root.
  h.compound('demon_spider_fang', 0.1, spike('fang', 'fang', 0.13, 1.1, 0.03, 0.0, 0.026, 0.003, 10) + [
    ball('gum', 'gum', 0.02, 0.02, 0.012, 0, 0.8),
    box('gum-tag', 'gum', [0.0, 0.0, -0.012], [0.022, 0.012, 0.014]),
  ] + spike('groove', 'venom', 0.13, 0.95, 0.03, 0.0, 0.006, 0.002, 8, 2.9) + [
    ball('drop', 'venom', 0.004, 0.03 + 0.13 * std.sin(1.1), 0.13 * (1 - std.cos(1.1)) + 0.005, 0.0),
  ], { fang: 'gem-onyx', gum: 'flesh-membrane', venom: 'syrup-green' }) + { handling: h.gripOn('demon_spider_fang', 'gum') } + { voxelGrain: 0.002 },

  // A straight branch 1.3 m long and 50 mm thick in its bark, ringed with carved rune bands that glow pale blue.
  h.compound('enchanted_wood', 1.2, [
    h.turned('branch', 'bark', 'x', [[0, 0], [0, 0.024], [0.6, 0.026], [1.3, 0.022], [1.3, 0]], [-0.65, 0.026, 0]),
    h.turned('end-left', 'heart', 'x', [[0, 0], [0, 0.02], [0.004, 0.02], [0.004, 0]], [-0.652, 0.026, 0]),
    h.turned('end-right', 'heart', 'x', [[0, 0], [0, 0.018], [0.004, 0.018], [0.004, 0]], [0.65, 0.026, 0]),
    h.turned('knot', 'bark', 'z', [[0, 0], [0, 0.012], [0.012, 0.008], [0.016, 0]], [0.2, 0.03, 0.018]),
  ] + [
    h.tube('rune-%d' % i, 'rune', 0.02, 0.0275, -0.45 + 0.3 * i, -0.43 + 0.3 * i, 0.026, 0)
    for i in [0, 1, 2, 3]
  ] + [
    box('glyph-%d' % i, 'rune', [-0.36 + 0.3 * i, 0.03, 0.022], [-0.33 + 0.3 * i, 0.036, 0.028])
    for i in [0, 1, 2]
  ], { bark: 'bark', heart: 'wood-pine', rune: 'gem-aquamarine' }) + { handling: h.gripOn('enchanted_wood', 'branch') } + { voxelGrain: 0.004 },

  // A corked glass vial 64 mm tall and 26 mm across, two thirds full of a pale green powder that glows.
  h.compound('glow_dust', 0.035, [
    h.turned('vial', 'glass', 'y', [[0, 0], [0, 0.013], [0.05, 0.013], [0.054, 0.009], [0.056, 0.009], [0.056, 0]], [0, 0, 0]),
    h.disc('powder', 'dust', 0.0132, 0.002, 0.034),
    h.turned('cork', 'cork', 'y', [[0, 0], [0, 0.0085], [0.012, 0.0095], [0.012, 0]], [0, 0.052, 0]),
  ], { glass: 'glass-clear', dust: 'gem-peridot', cork: 'cork' }) + h.inHand('glow_dust', 'vial') + { voxelGrain: 0.002 },

  // A brass-footed glass globe 120 mm tall and 84 mm across with a glowing ball inside, its domed brass cover swung
  // back on a rear hinge.
  h.compound('glow_light', 0.52, lampBody + [
    backDome('cover', 'brass', 0.038, 0.06, 0.003, [0, 0.05, -0.044]),
  ], { brass: 'brass-polished', glass: 'glass-clear', glow: 'gem-aquamarine' }) + h.inHand('glow_light', 'foot') + { voxelGrain: 0.002 },

  // The same reading light with its domed brass cover shut over the globe: 120 mm tall and 84 mm across.
  h.compound('glow_light_covered', 0.5, lampBody + [
    h.dome('cover', 'brass', 0.04, 0.072, 0.003, 'y', [0, 0.016, 0]),
  ], { brass: 'brass-polished', glass: 'glass-clear', glow: 'gem-aquamarine' }) + h.inHand('glow_light_covered', 'foot') + { voxelGrain: 0.002 },

  // A clear violet sphere 48 mm across with a pale blue light at its heart.
  h.compound('mana_pearl', 0.14, [
    ball('sphere', 'shell', 0.024, 0, 0.024, 0),
    ball('heart', 'heart', 0.011, 0, 0.024, 0),
    h.turned('glow', 'glow', 'z', [[0, 0], [0, 0.01], [0.002, 0.009], [0.004, 0.005], [0.005, 0]], [0, 0.024, 0.0205]),
    box('glint', 'glint', [-0.012, 0.038, 0.012], [-0.006, 0.042, 0.016]),
  ], { shell: 'gem-purple', heart: 'gem-aquamarine', glow: 'crystal-glow-blue', glint: 'crystal-glow-white' }) + h.inHand('mana_pearl', 'sphere') + { voxelGrain: 0.002 },

  // A smooth stone 165 mm long, pinched in the middle into two unequal lobes, one sandy and one dark, joined by a band
  // of milky quartz.
  h.compound('owlbear_stone', 1.9, [
    h.turned('lobe-large', 'pale', 'x', [[0, 0], [0, 0.02], [0.02, 0.045], [0.05, 0.052], [0.08, 0.04], [0.088, 0.03], [0.088, 0]], [-0.085, 0.05, 0]),
    h.turned('waist', 'quartz', 'x', [[0, 0], [0, 0.031], [0.012, 0.031], [0.012, 0]], [0.0, 0.05, 0]),
    h.turned('lobe-small', 'dark', 'x', [[0, 0], [0, 0.028], [0.02, 0.04], [0.045, 0.038], [0.065, 0.022], [0.07, 0]], [0.01, 0.05, 0]),
  ], { pale: 'brick-buff', quartz: 'gem-opaque', dark: 'stone-whet' }) + { handling: h.gripOn('owlbear_stone', 'lobe-large') } + { voxelGrain: 0.004 },

  // A segmented feeding tube 300 mm long, tapering from 14 mm across at its fleshy root to a needle point.
  h.compound('stirge_proboscis', 0.03, [
    ball('root', 'flesh', 0.018, 0.016, 0.018, 0, 0.9),
    h.turned('tube', 'shell', 'x', [[0, 0], [0, 0.007], [0.12, 0.005], [0.24, 0.0025], [0.27, 0]], [0.03, 0.018, 0]),
  ] + [
    h.tube('band-%d' % i, 'band', 0.002, 0.0075 - 0.0012 * i, 0.04 + 0.045 * i, 0.046 + 0.045 * i, 0.018, 0)
    for i in [0, 1, 2, 3]
  ], { flesh: 'flesh-membrane', shell: 'chitin-brown', band: 'bone' }) + { handling: h.gripOn('stirge_proboscis', 'tube') } + { voxelGrain: 0.002 },

  // A curved fragment of stone eggshell 125 mm long, 90 mm wide and 6 mm thick, broken to sharp edges and speckled.
  h.compound('stone_shell', 0.14, h.curvedPlate('shell', 'shell', shellOutline, 0, 0.006, 0.08, 20) + [
    h.onCurvedFace('speck-%d' % i, 'speck', shellOutline, 0, 0.006, 0.08, s[0], s[1], 0.005)
    for i in std.range(0, 4)
    for s in [[[[-0.04, -0.01], [-0.035, -0.012]], [[-0.01, 0.015], [-0.005, 0.016]], [[0.02, -0.02], [0.026, -0.018]], [[0.04, 0.012], [0.046, 0.01]], [[0.0, -0.03], [0.005, -0.028]]][i]]
  ], { shell: 'stone-grey', speck: 'stone-whet' }) + h.inHand('stone_shell', 'shell-10') + { voxelGrain: 0.002 },
]
