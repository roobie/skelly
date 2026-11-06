local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
local rod = h.rod;
local tube = h.tube;

// A pole lying along x from `x0` to `x1` with radius `r`, its axis at (y, z).
local pole(id, slot, r, x0, x1, y, z) = rod(id, slot, r, x0, x1, y) + { origin: [x0, y, z] };

// A bundle of poles along x, `length` long, wrapped in a rolled hide and tied with thongs: the hide roll
// sits on top of the poles, which show at both ends. `broken` snaps one pole short and lets a torn hide
// flap hang loose.
local shelterBundle(length, poleR, rows, hideR, ties, broken=false) =
  local half = length / 2;
  local centres = h.hexPack(poleR, rows);
  local bundleR = poleR * std.foldl(std.max, rows, 0);
  local packTop = std.foldl(std.max, [c.y for c in centres], 0) + poleR;
  local hideY = packTop + hideR * 0.85;
  local hideHalf = half * 0.78;
  [
    pole('pole-%d' % i, if i % 3 == 0 then 'pole-dark' else 'pole',
         poleR,
         -half + (i % 4) * poleR * 2.5,
         (if broken && i == 1 then half * 0.35 else half - ((i * 3) % 5) * poleR * 2),
         centres[i].y, centres[i].z)
    for i in std.range(0, std.length(centres) - 1)
  ] + (if broken then [
    // The snapped end of the short pole, splintered.
    pole('splinter', 'pole-dark', poleR * 0.5, half * 0.35, half * 0.35 + poleR * 4, centres[1].y + poleR * 0.3, centres[1].z),
  ] else []) + [
    tube('hide', 'hide', 0, hideR, -hideHalf, hideHalf, hideY),
    tube('hide-edge', 'hide-edge', hideR * 0.35, hideR + 0.003, -hideHalf - 0.004, -hideHalf, hideY),
    tube('hide-edge-b', 'hide-edge', hideR * 0.35, hideR + 0.003, hideHalf, hideHalf + 0.004, hideY),
  ] + std.flattenArrays([
    [
      // A rawhide thong round poles and hide together.
      tube('tie-%d-hide' % i, 'tie', hideR - 0.002, hideR + 0.004, x - 0.008, x + 0.008, hideY),
      box('tie-%d-a' % i, 'tie', [x - 0.008, 0, -bundleR - 0.004], [x + 0.008, packTop, -bundleR]),
      box('tie-%d-b' % i, 'tie', [x - 0.008, 0, bundleR], [x + 0.008, packTop, bundleR + 0.004]),
      box('tie-%d-top' % i, 'tie', [x - 0.008, packTop - 0.004, -bundleR - 0.004], [x + 0.008, packTop, bundleR + 0.004]),
      box('tie-%d-under' % i, 'tie', [x - 0.008, -0.004, -bundleR - 0.004], [x + 0.008, 0, bundleR + 0.004]),
    ]
    for i in std.range(0, std.length(ties) - 1)
    for x in [ties[i]]
  ]) + (if broken then [
    // A torn flap of hide hanging down the near side.
    h.prism('flap', 'hide', 'z',
            [[-half * 0.1, hideY], [half * 0.3, hideY], [half * 0.22, hideY - hideR * 1.6], [half * 0.05, hideY - hideR * 2.2], [-half * 0.05, hideY - hideR * 1.2]],
            bundleR + 0.002, bundleR + 0.006),
    box('tear', 'tear', [-half * 0.05, hideY + hideR - 0.001, -0.004], [half * 0.25, hideY + hideR + 0.001, 0.004]),
  ] else []);

// A soft tent bag lying along x with drawstring end, two compression straps and a pole pocket on its side.
local tentBag(length, r) =
  local half = length / 2;
  [
    tube('bag', 'bag', 0, r, -half, half, r),
    tube('end-a', 'trim', 0, r * 0.92, -half - 0.006, -half, r),
    turned('mouth', 'trim', 'x', [[0, 0], [0, r * 0.92], [0.02, r * 0.45], [0.03, r * 0.3], [0.03, 0]], [half, r, 0]),
    tube('cord', 'cord', 0, 0.004, half + 0.03, half + 0.06, r),
    tube('toggle', 'toggle', 0, 0.008, half + 0.058, half + 0.072, r),
    // A zipped pocket for the poles along the near side.
    box('pole-pocket', 'pocket', [-half * 0.85, r * 0.45, r * 0.7], [half * 0.7, r * 1.25, r * 1.08]),
    box('zip', 'zip', [-half * 0.85, r * 1.25, r * 0.86], [half * 0.7, r * 1.25 + 0.003, r * 0.92]),
    box('label', 'label', [-half * 0.25, r * 1.8, -r * 0.35], [half * 0.15, r * 2 + 0.002, r * 0.35]),
  ] + [
    tube('strap-%d' % i, 'strap', r, r + 0.004, x - 0.012, x + 0.012, r)
    for i in [0, 1]
    for x in [[-half * 0.5, half * 0.5][i]]
  ] + [
    box('buckle-%d' % i, 'buckle', [x - 0.016, 2 * r + 0.002, -0.014], [x + 0.016, 2 * r + 0.010, 0.014])
    for i in [0, 1]
    for x in [[-half * 0.5, half * 0.5][i]]
  ];

[
  // A laboratory vortex mixer, 130 mm wide, 160 mm deep and 150 mm tall to the top of its rubber cup: a
  // weighted cast base tapering upward, a speed dial and a rocker switch on the front.
  h.compound('vortex', 6.8, [
    h.prism('base', 'body', 'x', [[0, -0.08], [0, 0.08], [0.10, 0.06], [0.10, -0.055]], -0.065, 0.065),
    box('foot', 'foot', [-0.064, 0, -0.079], [0.064, 0.006, 0.079]),
    h.prism('panel', 'panel', 'x', [[0.006, 0.0786], [0.094, 0.0610], [0.094, 0.0625], [0.006, 0.0801]], -0.055, 0.055),
    disc('neck', 'motor', 0.024, 0.10, 0.112, 0, -0.005),
    turned('cup', 'cup', 'y', [[0, 0], [0, 0.026], [0.012, 0.028], [0.030, 0.022], [0.034, 0.012], [0.034, 0]], [0, 0.112, -0.005]),
    disc('cup-well', 'well', 0.009, 0.1465, 0.147, 0, -0.005),
    turned('dial', 'dial', 'z', [[0, 0], [0, 0.013], [0.012, 0.012], [0.012, 0]], [-0.025, 0.05, 0.072]),
    box('dial-mark', 'mark', [-0.0265, 0.054, 0.0835], [-0.0235, 0.062, 0.085]),
    box('switch', 'switch', [0.016, 0.038, 0.072], [0.040, 0.062, 0.082]),
    box('switch-rocker', 'rocker', [0.019, 0.050, 0.081], [0.037, 0.059, 0.086]),
  ], { body: 'enamel-white', foot: 'rubber-black', panel: 'plastic-charcoal', motor: 'steel-grey', cup: 'rubber-black', well: 'plastic-charcoal', dial: 'plastic-black', mark: 'paint-white', switch: 'plastic-black', rocker: 'plastic-red' })
  + { voxelGrain: 0.004 },

  // A storm-glass barometer 500 mm tall: a pear-shaped sealed glass body 200 mm across, half full of
  // water, with a thin spout rising from near its foot to above its shoulder, on a turned oak stand.
  h.compound('weather_glass', 5.7, [
    turned('stand', 'stand', 'y', [[0, 0], [0, 0.12], [0.02, 0.12], [0.03, 0.10], [0.045, 0.085], [0.045, 0]]),
    turned('body', 'glass', 'y', [[0, 0], [0, 0.05], [0.03, 0.08], [0.09, 0.10], [0.16, 0.098], [0.24, 0.08], [0.30, 0.05], [0.33, 0.025], [0.36, 0.012], [0.36, 0]], [0, 0.045, 0]),
    turned('water', 'water', 'y', [[0, 0], [0, 0.045], [0.03, 0.075], [0.09, 0.095], [0.16, 0.093], [0.17, 0.092], [0.17, 0]], [0, 0.05, 0]),
    // The spout leaves the body low on its front and climbs to an open lip above the shoulder.
    h.prism('spout-root', 'glass', 'x', [[0.09, 0.085], [0.11, 0.13], [0.13, 0.13], [0.13, 0.085]], -0.009, 0.009),
    turned('spout', 'glass', 'y', [[0, 0], [0, 0.010], [0.37, 0.008], [0.38, 0.012], [0.38, 0]], [0, 0.11, 0.135]),
    turned('spout-water', 'water', 'y', [[0, 0], [0, 0.006], [0.12, 0.006], [0.12, 0]], [0, 0.11, 0.135]),
    turned('stopper', 'stopper', 'y', [[0, 0], [0, 0.011], [0.02, 0.013], [0.02, 0]], [0, 0.405, 0]),
  ], { stand: 'wood-oak', glass: 'glass-clear', water: 'water', stopper: 'cork' })
  + { voxelGrain: 0.004 },

  // A weather station built into a hard briefcase, 400 mm wide, 300 mm deep and 90 mm thick closed,
  // shown open: a green monochrome screen in the lid, a keypad and gauges in the base.
  h.compound('weather_reader', 2, [
    box('base', 'case', [-0.2, 0, -0.15], [0.2, 0.045, 0.15]),
    box('base-rim', 'rim', [-0.201, 0.04, -0.151], [0.201, 0.047, 0.151]),
    box('deck', 'deck', [-0.19, 0.045, -0.14], [0.19, 0.047, 0.14]),
    box('keypad', 'keys', [-0.17, 0.047, 0.01], [0.06, 0.053, 0.12]),
  ] + [
    box('key-row-%d' % i, 'keyline', [-0.17, 0.053, z], [0.06, 0.0535, z + 0.002])
    for i in [0, 1, 2, 3]
    for z in [0.035 + i * 0.022]
  ] + [
    turned('gauge-%d' % i, 'gauge', 'y', [[0, 0], [0, 0.022], [0.006, 0.022], [0.006, 0]], [x, 0.047, 0.06])
    for i in [0, 1]
    for x in [[0.105, 0.16][i]]
  ] + [
    box('needle-%d' % i, 'needle', [x - 0.001, 0.053, 0.045], [x + 0.001, 0.0535, 0.065])
    for i in [0, 1]
    for x in [[0.105, 0.16][i]]
  ] + [
    box('speaker', 'grille', [0.08, 0.047, -0.12], [0.18, 0.050, -0.02]),
    box('printer-slot', 'slot', [-0.17, 0.047, -0.13], [0.04, 0.049, -0.12]),
    // The lid stands open, tilted back, screen facing +z.
    h.prism('lid', 'case', 'x', [[0.045, -0.15], [0.045, -0.135], [0.34, -0.175], [0.34, -0.19]], -0.2, 0.2),
    h.prism('bezel', 'bezel', 'x', [[0.07, -0.1394], [0.07, -0.1354], [0.32, -0.1693], [0.32, -0.1733]], -0.185, 0.185),
    h.prism('screen', 'screen', 'x', [[0.09, -0.1391], [0.09, -0.1366], [0.30, -0.1651], [0.30, -0.1676]], -0.15, 0.15),
    box('handle', 'handle', [-0.06, 0.012, 0.15], [0.06, 0.024, 0.172]),
    box('latch-a', 'latch', [-0.15, 0.03, 0.15], [-0.12, 0.045, 0.155]),
    box('latch-b', 'latch', [0.12, 0.03, 0.15], [0.15, 0.045, 0.155]),
  ], { 'case': 'alu-bare', rim: 'plastic-black', deck: 'plastic-grey', keys: 'paint-cream', keyline: 'plastic-charcoal', gauge: 'plastic-white', needle: 'paint-red', grille: 'mesh-black', slot: 'plastic-black', bezel: 'plastic-charcoal', screen: 'lcd-green', handle: 'plastic-black', latch: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A one-person lean-to packed for carrying, 900 mm long: a dozen peeled poles 30 mm thick under a rolled
  // hide, tied with rawhide thongs.
  h.compound('shelter_kit', 6.5, shelterBundle(0.9, 0.015, [5, 4, 3], 0.06, [-0.3, 0, 0.3]),
             { pole: 'wood-birch', 'pole-dark': 'bark', hide: 'leather-tan', 'hide-edge': 'skin-rawhide', tie: 'skin-rawhide' })
  + { voxelGrain: 0.004 },

  // The same lean-to bundle, damaged: one pole snapped short and a torn flap of hide hanging loose.
  h.compound('damaged_shelter_kit', 6.3, shelterBundle(0.9, 0.015, [5, 4, 3], 0.06, [-0.3, 0, 0.3], true),
             { pole: 'wood-birch', 'pole-dark': 'bark', hide: 'leather-tan', 'hide-edge': 'skin-rawhide', tie: 'skin-rawhide', tear: 'coal-black' })
  + { voxelGrain: 0.004 },

  // A large hide shelter packed for hauling, 3 m long: a dozen poles 40 mm thick under a heavy rolled hide.
  h.compound('large_shelter_kit', 35, shelterBundle(3.0, 0.02, [5, 4, 3], 0.08, [-1.1, -0.4, 0.4, 1.1]),
             { pole: 'wood-pine', 'pole-dark': 'bark', hide: 'leather-brown', 'hide-edge': 'skin-rawhide', tie: 'skin-rawhide' })
  + { voxelGrain: 0.008 },

  // A family tent in its storage bag, 700 mm long and 160 mm across, poles in a side pocket.
  h.compound('large_tent_kit', 2.9, tentBag(0.7, 0.08),
             { bag: 'nylon-ranger-green', trim: 'webbing-black', cord: 'cord-cotton', toggle: 'plastic-black', pocket: 'nylon-black', zip: 'plastic-black', label: 'paint-white', strap: 'webbing-black', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A one-person tent in its stuff sack, 420 mm long and 100 mm across, poles in a side pocket.
  h.compound('tent_kit', 0.71, tentBag(0.42, 0.05),
             { bag: 'nylon-red', trim: 'webbing-black', cord: 'cord-cotton', toggle: 'plastic-black', pocket: 'nylon-black', zip: 'plastic-black', label: 'paint-white', strap: 'webbing-black', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },
]
