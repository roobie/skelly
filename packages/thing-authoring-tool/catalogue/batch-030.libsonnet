local h = import '../compound.libsonnet';
local box = h.box, turned = h.turned, prism = h.prism;

// A loop handle on a pot's side at `side` (+1 or -1 on x): two lugs and a bar standing clear of the wall.
local potHandle(name, side, r, y, reach) =
  local near = side * (r - 0.004), far = side * (r + reach), bar = side * (r + reach - 0.010);
  local span(a, b) = [std.min(a, b), std.max(a, b)];
  [
    box(name + '-lug-a', 'handle', [span(near, far)[0], y - 0.006, -0.040], [span(near, far)[1], y + 0.006, -0.030]),
    box(name + '-lug-b', 'handle', [span(near, far)[0], y - 0.006, 0.030], [span(near, far)[1], y + 0.006, 0.040]),
    box(name + '-bar', 'handle', [span(bar, far)[0], y - 0.008, -0.040], [span(bar, far)[1], y + 0.008, 0.040]),
  ];

// Ink lines of writing on a sheet's upward face at height `y`, from z0 down to z1.
local lines(prefix, slot, x0, x1, z0, z1, n, y) = [
  box('%s-%d' % [prefix, i], slot, [x0, y, z0 - i * (z0 - z1) / (n - 1) - 0.001], [x1 - (if i % 3 == 2 then (x1 - x0) * 0.35 else 0), y + 0.0005, z0 - i * (z0 - z1) / (n - 1) + 0.001])
  for i in std.range(0, n - 1)
];

[
  // A steel stock pot 260 mm across and 240 mm tall, about 12.7 L, on a thick aluminium base disc, with a
  // rolled rim and a riveted loop handle each side.
  h.compound('stock_pot', 1.6, [
    turned('body', 'body', 'y', [[0.006, 0], [0.006, 0.128], [0.236, 0.128], [0.240, 0.131], [0.244, 0.128], [0.240, 0.124], [0.012, 0.124], [0.012, 0]]),
    turned('base', 'base', 'y', [[0, 0], [0, 0.122], [0.010, 0.122], [0.010, 0]]),
  ] + potHandle('handle-a', 1, 0.128, 0.205, 0.025) + potHandle('handle-b', -1, 0.128, 0.205, 0.025), {
    body: 'steel-stainless', base: 'alu-bare', handle: 'steel-grey',
  }) + { voxelGrain: 0.004 },

  // A clear acrylic tumbler 110 mm tall, 80 mm across the mouth and 64 mm at its thick base.
  h.compound('tumbler_plastic', 0.058, [
    turned('cup', 'cup', 'y', [[0, 0], [0, 0.032], [0.110, 0.040], [0.110, 0.037], [0.012, 0.030], [0.012, 0]]),
  ], { cup: 'plastic-clear' }) + { voxelGrain: 0.002 },

  // A stemmed wine glass 200 mm tall: a 75 mm foot, a slender stem and a tulip bowl 88 mm across.
  h.compound('wine_glass', 0.15, [
    turned('glass', 'glass', 'y', [
      [0, 0], [0, 0.037], [0.003, 0.036], [0.006, 0.010], [0.012, 0.004], [0.090, 0.004], [0.100, 0.012],
      [0.120, 0.034], [0.150, 0.044], [0.180, 0.042], [0.200, 0.038], [0.200, 0.036], [0.180, 0.040],
      [0.150, 0.042], [0.120, 0.032], [0.104, 0.010], [0.104, 0],
    ]),
  ], { glass: 'glass-clear' }) + { voxelGrain: 0.002 },

  // A sealed business envelope 241 by 105 mm lying back up, showing its pointed flap.
  h.compound('envelope', 0.005, [
    box('body', 'paper', [-0.1205, 0, -0.0525], [0.1205, 0.002, 0.0525]),
    prism('flap', 'flap', 'y', [[0.0525, -0.1205], [0.0525, 0.1205], [-0.004, 0]], 0.002, 0.003),
  ], { paper: 'paper-white', flap: 'paper-white' }) + { voxelGrain: 0.002 },

  // A plastic gift card the size of a bank card, 86 by 54 mm, with a printed band and a magnetic stripe.
  h.compound('gift_card', 0.005, [
    box('card', 'card', [-0.043, 0, -0.027], [0.043, 0.002, 0.027]),
    box('band', 'print', [-0.043, 0.002, -0.004], [0.043, 0.0025, 0.012]),
    box('logo', 'logo', [-0.036, 0.002, -0.022], [-0.016, 0.0025, -0.010]),
  ], { card: 'plastic-red', print: 'plastic-white', logo: 'foil-gold' }) + { voxelGrain: 0.002 },

  // A folded greeting card 177 by 127 mm standing half open as a tent, a printed panel on its front face.
  h.compound('greeting_card', 0.015, [
    prism('front', 'card', 'x', [[0, 0.050], [0.120, 0.004], [0.120, 0.002], [0, 0.048]], -0.0885, 0.0885),
    prism('back', 'card', 'x', [[0, -0.048], [0.120, -0.002], [0.120, -0.004], [0, -0.050]], -0.0885, 0.0885),
    prism('picture', 'picture', 'x', [[0.020, 0.0435], [0.100, 0.0128], [0.100, 0.0148], [0.020, 0.0455]], -0.060, 0.060),
    prism('heart', 'heart', 'x', [[0.045, 0.0352], [0.075, 0.0237], [0.075, 0.0257], [0.045, 0.0372]], -0.015, 0.015),
  ], { card: 'paper-white', picture: 'cloth-blue', heart: 'plastic-red' }) + { voxelGrain: 0.002 },

  // A handwritten letter on one A4 sheet, 297 by 210 mm, lying flat face up.
  h.compound('letter', 0.005, [
    box('sheet', 'paper', [-0.105, 0, -0.1485], [0.105, 0.002, 0.1485]),
  ] + lines('line', 'ink', -0.085, 0.085, 0.125, -0.110, 18, 0.002), { paper: 'paper-white', ink: 'plastic-charcoal' }) + { voxelGrain: 0.002 },

  // A picture postcard 152 by 102 mm lying picture up: sky over green hills with a white border.
  h.compound('postcard', 0.003, [
    box('card', 'card', [-0.076, 0, -0.051], [0.076, 0.002, 0.051]),
    box('sky', 'sky', [-0.070, 0.002, -0.045], [0.070, 0.0025, 0.010]),
    box('land', 'land', [-0.070, 0.002, 0.010], [0.070, 0.0025, 0.045]),
    box('sun', 'sun', [0.035, 0.0025, -0.035], [0.050, 0.003, -0.020]),
  ], { card: 'paper-white', sky: 'plastic-blue', land: 'leaf-green', sun: 'plastic-yellow' }) + { voxelGrain: 0.002 },
]
