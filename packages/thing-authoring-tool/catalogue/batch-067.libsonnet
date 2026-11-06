local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A solid of revolution along x from a list of [x, radius] stations, closed on its axis at both ends.
local alongX(id, slot, stations, y=0, z=0) = turned(id, slot, 'x', [[stations[0][0], 0]] + stations + [[stations[std.length(stations) - 1][0], 0]], [0, y, z]);
// A flat ring standing on y between radii r0 and r1, closed on its first point so the hole stays open.
local ring(id, slot, r0, r1, y0, y1, x=0, z=0) = turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);
// The seat of a folding camp toilet: a square frame `w` across with a round seat ring and a dark bag mouth.
local seat(y, w) = [
  box('frame', 'body', [-w / 2, y, -w / 2], [w / 2, y + 0.02, w / 2]),
  ring('seat', 'seat', 0.07, 0.125, y + 0.02, y + 0.034),
  disc('bag', 'bag', 0.07, y + 0.02, y + 0.022),
];
[
  // A folding camp toilet standing open, 33 cm square and 30 cm to the seat: four plastic legs braced front and back
  // under a square frame, a bucket hung below, a round seat ring over a dark bag mouth, and the lid standing open at the back (-z).
  h.compound('toilet_travel', 1, seat(0.28, 0.33) + [
    box('leg-%d' % i, 'leg', [sx * 0.15 - 0.012, 0, sz * 0.13 - 0.012], [sx * 0.15 + 0.012, 0.28, sz * 0.13 + 0.012])
    for sx in [-1, 1]
    for sz in [-1, 1]
    for i in [(sx + 1) + (sz + 1) / 2]
  ] + [
    box('brace-%d' % (sz + 1), 'leg', [-0.15, 0.04, sz * 0.13 - 0.006], [0.15, 0.06, sz * 0.13 + 0.006])
    for sz in [-1, 1]
  ] + [
    turned('bucket', 'lid', 'y', [[0, 0], [0, 0.1], [0.2, 0.125], [0.2, 0]], [0, 0.08, 0]),
    box('hinge', 'body', [-0.12, 0.30, -0.165], [0.12, 0.315, -0.15]),
    box('lid', 'lid', [-0.15, 0.31, -0.165], [0.15, 0.58, -0.15]),
  ], { body: 'plastic-grey', seat: 'plastic-white', lid: 'plastic-white', leg: 'plastic-grey', bag: 'plastic-black' }) + {
    voxelGrain: 0.004,
  },

  // The same toilet folded flat, 28 cm square and 4 cm thick: legs folded under the frame, the lid shut over the seat
  // with a carry handle at the front (+z).
  h.compound('toilet_travel_folded', 1.2, [
    box('leg-%d' % i, 'leg', [-0.13, 0.002 + i * 0.006, -0.12 + i * 0.07], [0.13, 0.008 + i * 0.006, -0.1 + i * 0.07])
    for i in [0, 1, 2, 3]
  ] + [
    box('frame', 'body', [-0.14, 0.008, -0.14], [0.14, 0.03, 0.14]),
    box('lid', 'lid', [-0.135, 0.03, -0.135], [0.135, 0.038, 0.135]),
    ring('lid-rim', 'seat', 0.09, 0.11, 0.038, 0.04),
    box('handle-a', 'seat', [-0.05, 0.012, 0.14], [-0.04, 0.026, 0.16]),
    box('handle-b', 'seat', [0.04, 0.012, 0.14], [0.05, 0.026, 0.16]),
    box('handle', 'seat', [-0.05, 0.012, 0.15], [0.05, 0.026, 0.162]),
  ], { body: 'plastic-grey', seat: 'plastic-grey', lid: 'plastic-white', leg: 'plastic-grey' }) + {
    voxelGrain: 0.004,
  },

  // A furled stick umbrella 1.01 m long lying along x: a crook handle at -x, a black canopy furled round an aluminium
  // shaft and closed with a strap, and a pointed ferrule at +x.
  h.compound('umbrella', 0.28,
    h.crescent('crook', 'handle', 0.03, 0.048, 180, 360, 10, 0.022, 0.048, -0.43, 0.039) + [
      alongX('grip', 'handle', [[-0.43, 0.012], [-0.34, 0.012], [-0.33, 0.009]], 0.035),
      alongX('shaft', 'shaft', [[-0.33, 0.006], [-0.26, 0.006]], 0.035),
      alongX('canopy', 'canopy', [[-0.27, 0.007], [-0.24, 0.02], [-0.1, 0.034], [0.12, 0.03], [0.42, 0.01], [0.45, 0.006]], 0.035),
      alongX('strap', 'strap', [[0.0, 0.0345], [0.03, 0.0345]], 0.035),
      box('strap-tab', 'strap', [0.0, 0.065, -0.01], [0.045, 0.07, 0.01]),
      alongX('ferrule', 'shaft', [[0.45, 0.005], [0.53, 0.0025], [0.545, 0.001]], 0.035),
    ], { handle: 'wood-walnut', shaft: 'alu-bare', canopy: 'nylon-black', strap: 'cloth-charcoal' }) + {
    handling: h.gripOn('umbrella', 'grip'),
    voxelGrain: 0.004,
  },

  // A flat grey stone 9 cm across and 3.5 cm thick, its faces carved with a spiral groove and its rim pierced by
  // twelve holes.
  h.compound('vortex_stone', 0.43, [
    turned('stone', 'stone', 'y', [[0, 0], [0, 0.036], [0.006, 0.044], [0.029, 0.044], [0.035, 0.036], [0.035, 0]]),
  ] + std.flattenArrays([
    h.crescent('spiral-%d' % i, 'groove', 0.004 + 0.0012 * i, 0.0065 + 0.0012 * i, 40 * i, 40 * i + 42, 2, 0.035, 0.0358)
    for i in std.range(0, 25)
  ]) + [
    local a = std.pi * i / 6;
    box('hole-%d' % i, 'groove', [0.0415 * std.sin(a) - 0.003, 0.0145, 0.0415 * std.cos(a) - 0.003], [0.0415 * std.sin(a) + 0.003, 0.0205, 0.0415 * std.cos(a) + 0.003])
    for i in std.range(0, 11)
  ], { stone: 'stone-grey', groove: 'paint-charcoal' }) + h.inHand('vortex_stone', 'stone') + { voxelGrain: 0.002 },

  // A pocket whistle gadget 7 cm long: an orange whistle body with a mouthpiece at -x, a compass on top, a strip
  // thermometer on its front (+z), a magnifier lens at +x and a lanyard ring.
  h.compound('whistle_multitool', 0.012, [
    box('mouth', 'body', [-0.035, 0.002, -0.006], [-0.02, 0.01, 0.006]),
    box('body', 'body', [-0.02, 0, -0.01], [0.022, 0.014, 0.01]),
    box('slot', 'dark', [-0.016, 0.014, -0.004], [-0.008, 0.0145, 0.004]),
    box('mouth-hole', 'dark', [-0.0355, 0.004, -0.004], [-0.035, 0.008, 0.004]),
    disc('compass-rim', 'trim', 0.0085, 0.014, 0.016, 0.007),
    disc('compass-face', 'face', 0.007, 0.016, 0.0165, 0.007),
    box('needle', 'needle', [0.0055, 0.0165, -0.005], [0.0085, 0.017, 0.0]),
    box('needle-tail', 'trim', [0.0055, 0.0165, 0.0], [0.0085, 0.017, 0.005]),
    box('thermo', 'face', [-0.016, 0.003, 0.01], [0.018, 0.011, 0.0105]),
    box('thermo-bulb', 'needle', [-0.016, 0.006, 0.0105], [0.004, 0.008, 0.011]),
    turned('lens-rim', 'trim', 'x', [[0, 0], [0, 0.009], [0.004, 0.009], [0.004, 0]], [0.022, 0.007, 0]),
    turned('lens', 'lens', 'x', [[0, 0], [0, 0.0075], [0.0045, 0.0075], [0.0045, 0]], [0.022, 0.007, 0]),
  ] + h.crescent('loop', 'trim', 0.003, 0.005, 0, 360, 8, 0.002, 0.005, -0.028, -0.012), {
    body: 'plastic-orange', dark: 'plastic-black', trim: 'plastic-charcoal', face: 'enamel-white', needle: 'plastic-red', lens: 'glass-clear',
  }) + h.inHand('whistle_multitool', 'body') + { voxelGrain: 0.002 },

  // A five-string banjo 82 cm long lying face up, neck along +x, drawn full size and scaled by 0.75 towards the
  // reference's 72 cm: a wooden resonator pot 25 cm across with a steel
  // tension hoop and brackets round a white drum head, a bridge and tailpiece, a dark fingerboard, a headstock with
  // four pegs and the short fifth-string peg on the side of the neck.
  h.compound('banjo', 4.5, h.scaled([
    turned('pot', 'wood', 'y', [[0, 0], [0, 0.15], [0.01, 0.165], [0.05, 0.165], [0.055, 0.15], [0.055, 0]], [-0.2, 0, 0]),
    ring('flange', 'metal', 0.14, 0.167, 0.055, 0.06, -0.2),
    disc('head', 'head', 0.142, 0.055, 0.068, -0.2),
    ring('hoop', 'metal', 0.138, 0.15, 0.068, 0.076, -0.2),
    box('bridge', 'bridge', [-0.25, 0.068, -0.03], [-0.244, 0.08, 0.03]),
    box('tailpiece', 'metal', [-0.36, 0.068, -0.012], [-0.3, 0.074, 0.012]),
  ] + [
    local a = std.pi * i / 12;
    box('bracket-%d' % i, 'metal', [-0.2 + 0.158 * std.sin(a) - 0.004, 0.055, 0.158 * std.cos(a) - 0.004], [-0.2 + 0.158 * std.sin(a) + 0.004, 0.072, 0.158 * std.cos(a) + 0.004])
    for i in std.range(0, 23)
  ] + [
    box('neck', 'wood', [-0.06, 0.045, -0.017], [0.56, 0.068, 0.017]),
    box('fingerboard', 'board', [-0.06, 0.068, -0.016], [0.56, 0.074, 0.016]),
    box('peghead', 'wood', [0.56, 0.05, -0.035], [0.72, 0.066, 0.035]),
    box('peghead-face', 'board', [0.565, 0.066, -0.032], [0.715, 0.068, 0.032]),
  ] + [
    local x = 0.6 + 0.07 * std.floor(i / 2);
    local z0 = if i % 2 == 0 then 0.035 else -0.055;
    box('peg-%d' % i, 'metal', [x - 0.006, 0.052, z0], [x + 0.006, 0.064, z0 + 0.02])
    for i in [0, 1, 2, 3]
  ] + [
    box('peg-5', 'metal', [0.24, 0.054, 0.017], [0.25, 0.064, 0.035]),
  ] + [
    box('fret-%d' % i, 'metal', [0.5 - 0.6 * (1 - std.pow(2, -i / 12)), 0.074, -0.016], [0.502 - 0.6 * (1 - std.pow(2, -i / 12)), 0.076, 0.016])
    for i in std.range(1, 17)
  ], 0.75), { wood: 'wood-walnut', metal: 'steel-stainless', head: 'cloth-cream', bridge: 'wood-birch', board: 'lacquer-black' }) + {
    handling: h.gripOn('banjo', 'neck'),
    voxelGrain: 0.004,
  },

  // A tom drum 28 cm across and 20 cm deep standing on its bottom head: a red lacquered wood shell, steel hoops
  // top and bottom, eight lugs with tension rods, and a white batter head.
  h.compound('drum_percussion', 3, [
    disc('shell', 'shell', 0.13, 0.008, 0.192),
    ring('hoop-low', 'metal', 0.126, 0.137, 0, 0.012),
    ring('hoop-top', 'metal', 0.126, 0.137, 0.188, 0.2),
    disc('head', 'head', 0.126, 0.192, 0.196),
  ] + std.flattenArrays([
    local s = std.sin(std.pi * i / 4);
    local c = std.cos(std.pi * i / 4);
    [
      box('lug-top-%d' % i, 'metal', [0.133 * s - 0.008, 0.13, 0.133 * c - 0.008], [0.133 * s + 0.008, 0.16, 0.133 * c + 0.008]),
      box('lug-low-%d' % i, 'metal', [0.133 * s - 0.008, 0.04, 0.133 * c - 0.008], [0.133 * s + 0.008, 0.07, 0.133 * c + 0.008]),
      box('rod-top-%d' % i, 'metal', [0.134 * s - 0.003, 0.16, 0.134 * c - 0.003], [0.134 * s + 0.003, 0.2, 0.134 * c + 0.003]),
      box('rod-low-%d' % i, 'metal', [0.134 * s - 0.003, 0, 0.134 * c - 0.003], [0.134 * s + 0.003, 0.04, 0.134 * c + 0.003]),
    ]
    for i in std.range(0, 7)
  ]) + [
    box('badge', 'badge', [-0.015, 0.09, 0.129], [0.015, 0.11, 0.132]),
  ], { shell: 'lacquer-red', metal: 'steel-stainless', head: 'cloth-cream', badge: 'brass' }) + h.inHand('drum_percussion', 'shell') + {
    voxelGrain: 0.004,
  },

  // A hand-made drum 28 cm across and 26 cm tall: a carved wooden shell narrowing to a foot, a rawhide head
  // tacked round the rim, and cord lacing from the head down to a cord ring round the waist.
  h.compound('drum_percussion_primitive', 2.1, [
    turned('shell', 'shell', 'y', [[0, 0], [0, 0.1], [0.04, 0.095], [0.1, 0.11], [0.2, 0.13], [0.24, 0.135], [0.24, 0]]),
    turned('head', 'head', 'y', [[0.23, 0], [0.23, 0.138], [0.244, 0.138], [0.246, 0.13], [0.246, 0]]),
    ring('cord-ring', 'cord', 0.105, 0.115, 0.075, 0.085),
  ] + std.flattenArrays([
    local a = std.pi * i / 6;
    local s = std.sin(a);
    local c = std.cos(a);
    // Lacing segments [y0, y1, radius] stepping out with the shell's flare.
    local seg = [[0.08, 0.12, 0.115], [0.12, 0.18, 0.127], [0.18, 0.232, 0.135]];
    [
      box('lace-%d-%d' % [i, j], 'cord', [seg[j][2] * s - 0.003, seg[j][0], seg[j][2] * c - 0.003], [seg[j][2] * s + 0.003, seg[j][1], seg[j][2] * c + 0.003])
      for j in [0, 1, 2]
    ] + [
      box('tack-%d' % i, 'tack', [0.139 * s - 0.003, 0.234, 0.139 * c - 0.003], [0.139 * s + 0.003, 0.24, 0.139 * c + 0.003]),
    ]
    for i in std.range(0, 11)
  ]), { shell: 'wood-oak', head: 'skin-rawhide', cord: 'jute', tack: 'steel-grey' }) + h.inHand('drum_percussion_primitive', 'shell') + {
    voxelGrain: 0.004,
  },
]
