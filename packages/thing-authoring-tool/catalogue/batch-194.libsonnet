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
// A straight strand `w` wide from [x, y] point `a` to `b`, standing from z0 to z1.
local strand(id, slot, a, b, w, z0, z1) =
  local dx = b[0] - a[0], dy = b[1] - a[1], len = std.sqrt(dx * dx + dy * dy);
  local nx = -dy / len * w / 2, ny = dx / len * w / 2;
  h.prism(id, slot, 'z', [[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]], z0, z1);
// A flat ring facing +z, radii r0 to r1, `t` thick from z0, centred on [x, y].
local ringZ(id, slot, r0, r1, t, x, y, z0) = h.turned(id, slot, 'z', [[0, r0], [0, r1], [t, r1], [t, r0], [0, r0]], [x, y, z0]);
// A flat strip `w` wide lying on y between [x, z] points `a` and `b`, from y0 to y1.
local flatStrand(id, slot, a, b, w, y0, y1) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2, nz = dx / len * w / 2;
  // A y prism's outline is listed as [z, x].
  h.prism(id, slot, 'y', [[a[1] + nz, a[0] + nx], [b[1] + nz, b[0] + nx], [b[1] - nz, b[0] - nx], [a[1] - nz, a[0] - nx]], y0, y1);
// A stag beetle in relief on the front (+z, or −z with `side` −1) of a ball of radius `r` centred at y = r:
// each piece stands from inside the ball to 4 mm proud of its surface.
local beetle(prefix, slot, r, side) =
  local proud(x, y) = std.sqrt(r * r - x * x - (y - r) * (y - r)) + 0.004;
  local piece(name, x0, y0, x1, y1) =
    local cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, far = proud(std.max(std.abs(x0), std.abs(x1)), cy);
    local z1 = proud(cx, cy);
    box('%s-%s' % [prefix, name], slot,
        if side > 0 then [x0, y0, far - 0.012] else [x0, y0, -z1],
        if side > 0 then [x1, y1, z1] else [x1, y1, -(far - 0.012)]);
  [
    piece('wing', -0.014, r - 0.03, 0.014, r + 0.004),
    piece('thorax', -0.011, r + 0.004, 0.011, r + 0.014),
    piece('head', -0.008, r + 0.014, 0.008, r + 0.021),
    piece('jaw-left', -0.012, r + 0.021, -0.008, r + 0.036),
    piece('jaw-right', 0.008, r + 0.021, 0.012, r + 0.036),
    piece('jaw-tip-left', -0.008, r + 0.032, -0.004, r + 0.036),
    piece('jaw-tip-right', 0.004, r + 0.032, 0.008, r + 0.036),
  ] + [
    piece('leg-%d-%s' % [i, s], if s == 'l' then -0.026 else 0.014, r - 0.022 + 0.011 * i, if s == 'l' then -0.014 else 0.026, r - 0.019 + 0.011 * i)
    for i in [0, 1, 2]
    for s in ['l', 'r']
  ];
[
  // A leather satchel 300 mm wide, 240 mm tall and 100 mm deep, its flap stitched with a glowing ring of runes; its
  // shoulder strap runs down from brass rings at the sides and lies coiled flat on the ground behind it.
  h.compound('rune_stitched_satchel', 0.9, h.pouch(0.3, 0.24, 0.1, 0.13, 1) + [
    box('strap-left', 'strap', [-0.162, 0.0, -0.05], [-0.15, 0.2, -0.02]),
    box('strap-right', 'strap', [0.15, 0.0, -0.05], [0.162, 0.2, -0.02]),
    h.disc('ring-left', 'metal', 0.012, 0.196, 0.204, -0.156, -0.035),
    h.disc('ring-right', 'metal', 0.012, 0.196, 0.204, 0.156, -0.035),
  ] + h.strapLoop('strap', 'strap', 0.34, 0.08, 0.03, 0.004, 0, 0, -0.15) + [
    box('buckle', 'metal', [-0.016, 0.08, 0.05], [0.016, 0.12, 0.056]),
    box('buckle-tab', 'strap', [-0.01, 0.12, 0.053], [0.01, 0.15, 0.056]),
    box('seam-front', 'stitch', [-0.15, 0.002, 0.05], [0.15, 0.006, 0.053]),
    ringZ('rune-ring', 'rune', 0.034, 0.039, 0.003, 0, 0.188, 0.053),
    box('rune-stem', 'rune', [-0.002, 0.168, 0.053], [0.002, 0.208, 0.056]),
    strand('rune-arm-a', 'rune', [-0.016, 0.176], [0.016, 0.2], 0.004, 0.053, 0.056),
    strand('rune-arm-b', 'rune', [-0.016, 0.2], [0.016, 0.176], 0.004, 0.053, 0.056),
  ] + [
    box('glyph-%d' % i, 'rune', [-0.06 + 0.12 * (i % 2) - 0.006, 0.17 + 0.012 * std.floor(i / 2), 0.053], [-0.06 + 0.12 * (i % 2) + 0.006, 0.175 + 0.012 * std.floor(i / 2), 0.056])
    for i in std.range(0, 3)
  ], { body: 'leather-chestnut', flap: 'leather-chestnut', strap: 'leather-tan', metal: 'brass-dull', stitch: 'cord-cotton', rune: 'crystal-glow-violet' }) + h.inHand('rune_stitched_satchel', 'body'),

  // A squat iron chest 600 mm wide, 400 mm tall and 420 mm deep with banded corners, a hinged lid, a hasp and two
  // side handles; violet rune lines run round the front and lid.
  h.compound('rune_iron_preservation_chest', 48, [
    box('body', 'iron', [-0.3, 0.0, -0.21], [0.3, 0.32, 0.21]),
    box('lid', 'iron', [-0.305, 0.32, -0.215], [0.305, 0.4, 0.215]),
    box('lid-seam', 'band', [-0.306, 0.316, -0.216], [0.306, 0.324, 0.216]),
    box('hasp', 'band', [-0.022, 0.25, 0.21], [0.022, 0.35, 0.222]),
    box('hasp-loop', 'band', [-0.008, 0.26, 0.222], [0.008, 0.28, 0.234]),
    box('handle-left-grip', 'band', [-0.33, 0.2, -0.06], [-0.318, 0.212, 0.06]),
    box('handle-left-a', 'band', [-0.318, 0.2, -0.06], [-0.3, 0.212, -0.048]),
    box('handle-left-b', 'band', [-0.318, 0.2, 0.048], [-0.3, 0.212, 0.06]),
    box('handle-right-grip', 'band', [0.318, 0.2, -0.06], [0.33, 0.212, 0.06]),
    box('handle-right-a', 'band', [0.3, 0.2, -0.06], [0.318, 0.212, -0.048]),
    box('handle-right-b', 'band', [0.3, 0.2, 0.048], [0.318, 0.212, 0.06]),
  ] + [
    // Corner bands up each upright edge and across the lid.
    box('corner-%d' % i, 'band', [sx * 0.3 - (if sx > 0 then 0.03 else -0.0) - 0.004, 0.0, sz * 0.21 - (if sz > 0 then 0.03 else 0) - 0.004], [sx * 0.3 + (if sx < 0 then 0.03 else 0) + 0.004, 0.4, sz * 0.21 + (if sz < 0 then 0.03 else 0) + 0.004])
    for i in std.range(0, 3)
    for sx in [[-1, 1, -1, 1][i]]
    for sz in [[-1, -1, 1, 1][i]]
  ] + [
    box('lid-band-%d' % i, 'band', [x - 0.02, 0.4, -0.219], [x + 0.02, 0.408, 0.219])
    for i in [0, 1]
    for x in [[-0.16, 0.16][i]]
  ] + [
    // Runes: a line round the front, a circle each side of the hasp and a row along the lid's front edge.
    box('rune-line', 'rune', [-0.26, 0.05, 0.21], [0.26, 0.058, 0.214]),
    ringZ('rune-circle-left', 'rune', 0.05, 0.058, 0.004, -0.15, 0.17, 0.21),
    ringZ('rune-circle-right', 'rune', 0.05, 0.058, 0.004, 0.15, 0.17, 0.21),
    box('rune-left-v', 'rune', [-0.154, 0.13, 0.21], [-0.146, 0.21, 0.214]),
    box('rune-left-h', 'rune', [-0.18, 0.166, 0.21], [-0.12, 0.174, 0.214]),
    strand('rune-right-a', 'rune', [0.12, 0.14], [0.18, 0.2], 0.008, 0.21, 0.214),
    strand('rune-right-b', 'rune', [0.12, 0.2], [0.18, 0.14], 0.008, 0.21, 0.214),
  ] + [
    box('lid-glyph-%d' % i, 'rune', [-0.25 + 0.0625 * i, 0.345, 0.215], [-0.234 + 0.0625 * i, 0.375, 0.219])
    for i in std.range(0, 8)
    if i != 4
  ], { iron: 'iron-dull', band: 'steel-parkerized', rune: 'crystal-glow-violet' }),

  // A carved wooden ball 124 mm across, a stag beetle in relief on each side and a carved band round its middle.
  h.compound('carved_beetle_ball', 0.74, [
    ball('ball', 'wood', 0.062, 0, 0.062, 0, 1, 16),
    h.turned('band-top', 'band', 'y', [[0, 0.054], [0, 0.0595], [0.004, 0.0595], [0.004, 0.054], [0, 0.054]], [0, 0.082, 0]),
    h.turned('band-low', 'band', 'y', [[0, 0.054], [0, 0.0595], [0.004, 0.0595], [0.004, 0.054], [0, 0.054]], [0, 0.038, 0]),
  ] + beetle('beetle-front', 'relief', 0.062, 1) + beetle('beetle-back', 'relief', 0.062, -1),
  { wood: 'wood-oak', band: 'wood-walnut', relief: 'chitin-brown' }) + h.inHand('carved_beetle_ball', 'ball') + { voxelGrain: 0.002 },

  // A rune of amber resin 34 mm across and 10 mm thick, wrapped in a leaf 70 mm long whose sides fold over it.
  h.compound('leaf_wrapped_resin_rune', 0.029, [
    h.prism('leaf', 'leaf', 'y', [[0, -0.035], [0.018, -0.024], [0.024, 0], [0.018, 0.024], [0, 0.035], [-0.018, 0.024], [-0.024, 0], [-0.018, -0.024]], 0, 0.002),
    box('stem', 'stem', [0.035, 0.0, -0.0015], [0.05, 0.002, 0.0015]),
    h.turned('resin', 'resin', 'y', [[0, 0], [0, 0.015], [0.008, 0.017], [0.012, 0.014], [0.014, 0]], [0, 0.002, 0]),
    box('rune-stem', 'rune', [-0.002, 0.016, -0.009], [0.002, 0.018, 0.009]),
    flatStrand('rune-arm-a', 'rune', [-0.008, -0.006], [0.0, 0.002], 0.003, 0.016, 0.018),
    flatStrand('rune-arm-b', 'rune', [0.008, -0.006], [0.0, 0.002], 0.003, 0.016, 0.018),
    box('fold-left', 'leaf', [-0.02, 0.002, -0.022], [-0.008, 0.014, 0.022]),
    box('fold-left-top', 'leaf', [-0.02, 0.014, -0.02], [-0.011, 0.016, 0.02]),
    box('fold-right', 'leaf', [0.008, 0.002, -0.022], [0.02, 0.014, 0.022]),
    box('fold-right-top', 'leaf', [0.011, 0.014, -0.02], [0.02, 0.016, 0.02]),
    box('vein', 'stem', [-0.034, 0.002, -0.001], [-0.02, 0.003, 0.001]),
  ], { leaf: 'leaf-green', stem: 'plant-dried', resin: 'resin-honey', rune: 'wood-walnut' }) + h.inHand('leaf_wrapped_resin_rune', 'resin') + { voxelGrain: 0.002 },

  // A gold skeleton key 64 mm long lying flat, with a ring bow round a small blue crystal, a round shank and a
  // two-toothed bit.
  h.compound('gold_skeleton_key', 0.05, [
    h.turned('bow', 'gold', 'y', [[0, 0.007], [0, 0.012], [0.004, 0.012], [0.004, 0.007], [0, 0.007]], [-0.02, 0, 0]),
    h.disc('crystal', 'crystal', 0.006, 0.0, 0.006, -0.02),
    h.turned('shank', 'gold', 'x', [[0, 0], [0, 0.0025], [0.002, 0.0035], [0.004, 0.0025], [0.044, 0.0025], [0.044, 0]], [-0.008, 0.002, 0]),
    box('bit', 'gold', [0.024, 0.0, 0.0], [0.034, 0.004, 0.014]),
    box('bit-tooth', 'gold', [0.028, 0.0, 0.014], [0.03, 0.004, 0.018]),
    box('bit-tip', 'gold', [0.032, 0.0, 0.014], [0.036, 0.004, 0.018]),
  ], { gold: 'metal-gold', crystal: 'crystal-glow-blue' }) + { handling: h.gripOn('gold_skeleton_key', 'bow') } + { voxelGrain: 0.002 },

  // An engraved wooden torch 500 mm long lying along x: a fluted grip bound with brass, and a brass cup at the head
  // holding a flame that never goes out.
  h.compound('everburning_torch', 0.8, [
    h.turned('shaft', 'wood', 'x', [[0, 0], [0, 0.015], [0.01, 0.016], [0.36, 0.019], [0.4, 0.024], [0.4, 0]], [-0.2, 0, 0]),
    h.tube('band-butt', 'brass', 0.0, 0.018, -0.196, -0.184),
    h.tube('band-grip', 'brass', 0.0, 0.019, -0.06, -0.05),
    h.tube('band-neck', 'brass', 0.0, 0.023, 0.17, 0.186),
    h.turned('cup', 'brass', 'x', [[0, 0], [0, 0.024], [0.04, 0.034], [0.046, 0.036], [0.046, 0]], [0.2, 0, 0]),
    h.turned('flame', 'flame', 'x', [[0, 0], [0, 0.03], [0.02, 0.028], [0.045, 0.018], [0.065, 0.006], [0.075, 0]], [0.246, 0, 0]),
    h.turned('flame-core', 'core', 'x', [[0, 0], [0, 0.016], [0.02, 0.012], [0.035, 0]], [0.256, 0, 0]),
  ] + [
    // Engraved rings and a spiral of carved bands between the grip and the neck.
    local x = -0.04 + 0.03 * i;
    h.tube('carving-%d' % i, 'carve', 0.0, 0.0175 + 0.003 * (x + 0.19) / 0.35, x, x + 0.006)
    for i in std.range(0, 6)
  ], { wood: 'wood-oak', brass: 'brass-dull', carve: 'wood-walnut', flame: 'glow-flame', core: 'cloth-yellow' }) + {
    handling: { part: 'everburning_torch', solid: 'shaft', fraction: [0.3, 0.5, 0.5], turn: [0, 0, 0], hold: 'upright', rest: 'upright', roll: 0 },
    anchors: { flame: { part: 'everburning_torch', solid: 'flame', fraction: [0.5, 0.5, 0.5] } },
  },

  // A large silver coin 40 mm across and 2 mm thick, lying flat, with a raised rim and a sword struck on its face.
  h.compound('silver_weapon_token', 0.03, [
    h.disc('coin', 'silver', 0.02, 0, 0.002),
    h.turned('rim', 'silver', 'y', [[0, 0.017], [0, 0.02], [0.002, 0.02], [0.002, 0.017], [0, 0.017]], [0, 0.002, 0]),
    box('blade', 'relief', [-0.004, 0.002, -0.0015], [0.014, 0.004, 0.0015]),
    flatStrand('blade-tip', 'relief', [0.013, 0], [0.016, 0], 0.002, 0.002, 0.004),
    box('guard', 'relief', [-0.006, 0.002, -0.007], [-0.004, 0.004, 0.007]),
    box('grip', 'relief', [-0.012, 0.002, -0.001], [-0.006, 0.004, 0.001]),
    box('pommel', 'relief', [-0.015, 0.002, -0.002], [-0.012, 0.004, 0.002]),
  ], { silver: 'metal-silver', relief: 'steel-grey' }) + h.inHand('silver_weapon_token', 'coin') + { voxelGrain: 0.002 },

  // A slender wooden wand 380 mm long lying along x, tapering from a carved grip to a fine tip, with a brass socket
  // at its base holding a mana crystal.
  h.compound('crystal_socket_wand', 0.14, [
    h.turned('crystal', 'crystal', 'x', [[0, 0], [0.012, 0.009], [0.03, 0.009], [0.03, 0]], [-0.19, 0, 0]),
    h.turned('socket', 'brass', 'x', [[0, 0], [0, 0.011], [0.008, 0.012], [0.022, 0.009], [0.022, 0]], [-0.162, 0, 0]),
    h.turned('grip', 'wood', 'x', [[0, 0], [0, 0.009], [0.1, 0.0095], [0.11, 0.0075], [0.11, 0]], [-0.14, 0, 0]),
    h.turned('shaft', 'wood', 'x', [[0, 0], [0, 0.0075], [0.22, 0.004], [0.22, 0]], [-0.03, 0, 0]),
    h.tube('collar', 'brass', 0.0, 0.0095, -0.035, -0.027),
  ] + [
    h.tube('grip-ring-%d' % i, 'carve', 0.0, 0.0105, -0.13 + 0.02 * i, -0.124 + 0.02 * i)
    for i in std.range(0, 4)
  ], { wood: 'wood-walnut', carve: 'wood-oak', brass: 'brass-dull', crystal: 'crystal-glow-blue' }) + {
    handling: h.gripOn('crystal_socket_wand', 'grip'),
    voxelGrain: 0.002,
  },
]
