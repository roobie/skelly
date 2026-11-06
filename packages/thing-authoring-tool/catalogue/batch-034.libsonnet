local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
// The slice of a ball of radius `r` between u0 and u1 along `axis`, centred at `c`, for coloured panels.
local zone(id, slot, r, u0, u1, axis, c, steps=6) =
  local us = [u0 + (u1 - u0) * i / steps for i in std.range(0, steps)];
  local shift = if axis == 'x' then [-r, 0, 0] else if axis == 'y' then [0, -r, 0] else [0, 0, -r];
  turned(id, slot, axis, [[u0 + r, 0]] + [[u + r, std.sqrt(std.max(0, r * r - u * u))] for u in us] + [[u1 + r, 0]], [c[0] + shift[0], c[1] + shift[1], c[2] + shift[2]]);
// A seam band `w` wide standing `t` proud of a ball of radius `r`, at `u` along `axis` from the centre `c`.
local seam(id, slot, r, u, axis, c, w=0.005, t=0.0015) =
  local ro = std.sqrt(r * r - u * u) + t, ri = std.sqrt(std.max(0, r * r - (std.abs(u) + w) * (std.abs(u) + w))) - 0.004;
  local shift = if axis == 'x' then [u - w / 2, 0, 0] else if axis == 'y' then [0, u - w / 2, 0] else [0, 0, u - w / 2];
  turned(id, slot, axis, [[0, ri], [0, ro], [w, ro], [w, ri], [0, ri]], [c[0] + shift[0], c[1] + shift[1], c[2] + shift[2]]);
// A flat strip `w` wide lying on y from y0 to y1 between [xa, za] and [xb, zb].
local strip(id, slot, a, b, w, y0, y1) =
  local dx = b[0] - a[0], dz = b[1] - a[1], l = std.sqrt(dx * dx + dz * dz), nx = -dz / l * w / 2, nz = dx / l * w / 2;
  h.prism(id, slot, 'y', [[a[1] - nz, a[0] - nx], [b[1] - nz, b[0] - nx], [b[1] + nz, b[0] + nx], [a[1] + nz, a[0] + nx]], y0, y1);
// A carabiner lying flat, its long side along x, centred on [cx, cz].
local carabiner(prefix, cx, cz, y) =
  h.strapLoop(prefix, 'clip', 0.03, 0.011, 0.004, 0.004, y, cx, cz, 6)
  + [box(prefix + '-gate', 'gate', [cx - 0.012, y + 0.004, cz + 0.008], [cx + 0.012, y + 0.006, cz + 0.013])];
[
  // A storage line: a doubled nylon cord about 1.2 m long folded into a hank 450 mm long, with six aluminium
  // carabiners 55 mm long clipped along it for hanging gear in camp.
  h.compound('storage_line', 0.14,
             h.strapLoop('hank-a', 'cord', 0.4, 0.016, 0.006, 0.006, 0)
             + h.strapLoop('hank-b', 'cord', 0.39, 0.009, 0.006, 0.006, 0.004)
             + std.flattenArrays([carabiner('clip-%d' % i, -0.15 + i * 0.06, 0.02, 0.006) for i in std.range(0, 5)]),
             { cord: 'nylon-red', clip: 'steel-bright', gate: 'plastic-charcoal' })
  + { voxelGrain: 0.002 },

  // A fibrous plant stalk about 550 mm long and 16 mm across at the base, green, jointed every 120 mm, with
  // two torn leaf stubs and frayed fibres at the cut end.
  h.compound('stick_fiber', 0.04, [
    turned('stalk', 'stalk', 'x', [[0, 0], [0, 0.008], [0.55, 0.005], [0.55, 0]], [-0.275, 0.008, 0]),
  ] + [
    turned('node-%d' % i, 'node', 'x', [[0, 0], [0, 0.0085 - i * 0.0007], [0.006, 0.0085 - i * 0.0007], [0.006, 0]], [-0.2 + i * 0.12, 0.008, 0])
    for i in std.range(0, 3)
  ] + [
    strip('leaf-a', 'leaf', [-0.08, 0.006], [0.02, 0.05], 0.014, 0.008, 0.01),
    strip('leaf-b', 'leaf', [0.04, -0.006], [0.12, -0.045], 0.012, 0.008, 0.01),
  ] + [
    strip('fibre-%d' % i, 'node', [-0.27, (i - 1) * 0.003], [-0.3, (i - 1) * 0.008], 0.002, 0.004 + i * 0.002, 0.006 + i * 0.002)
    for i in std.range(0, 2)
  ], { stalk: 'leaf-green', node: 'plant-dried', leaf: 'leaf-green' })
  + { voxelGrain: 0.002 },

  // A short piece of cotton string 150 mm long and 3 mm across, lying in loose waves with a knot at one end.
  local pts = [[-0.072 + i * 0.016, 0.012 * std.sin(i * 1.1)] for i in std.range(0, 9)];
  h.compound('string_6', 0.00074, [
    strip('run-%d' % i, 'cord', pts[i], pts[i + 1], 0.003, 0, 0.003)
    for i in std.range(0, 8)
  ] + [
    h.ball('knot', 'cord', 0.0035, pts[9][0], 0.003, pts[9][1]),
  ], { cord: 'cord-cotton' })
  + { voxelGrain: 0.002 },

  // A laser target practice kit: two toy laser pistols 180 mm long lying in front of two round electronic
  // targets 180 mm across on folding stands, each target with a hit display under its face.
  h.compound('aim_game', 1, std.flattenArrays([
    [
      box('gun-%d-body' % i, 'gun', [x - 0.09, 0, 0.06], [x + 0.07, 0.028, 0.095]),
      box('gun-%d-barrel' % i, 'gun', [x + 0.07, 0.006, 0.07], [x + 0.095, 0.022, 0.09]),
      box('gun-%d-muzzle' % i, 'lens', [x + 0.095, 0.009, 0.074], [x + 0.098, 0.019, 0.086]),
      h.prism('gun-%d-grip' % i, 'grip', 'y', [[0.095, x - 0.085], [0.095, x - 0.05], [0.16, x - 0.065], [0.16, x - 0.1]], 0.002, 0.026),
      box('gun-%d-trigger' % i, 'grip', [x - 0.045, 0.008, 0.095], [x - 0.037, 0.02, 0.11]),
    ]
    for i in [0, 1]
    for x in [[-0.1, 0.11][i]]
  ]) + std.flattenArrays([
    [
      box('stand-%d-foot' % i, 'stand', [x - 0.07, 0, -0.1], [x + 0.07, 0.008, -0.04]),
      box('stand-%d-post' % i, 'stand', [x - 0.006, 0.008, -0.08], [x + 0.006, 0.06, -0.068]),
      box('target-%d-display' % i, 'body', [x - 0.04, 0.05, -0.085], [x + 0.04, 0.075, -0.06]),
      box('target-%d-screen' % i, 'screen', [x - 0.03, 0.055, -0.06], [x + 0.03, 0.07, -0.058]),
      turned('target-%d-face' % i, 'face', 'z', [[0, 0], [0, 0.09], [0.018, 0.09], [0.018, 0]], [x, 0.165, -0.085]),
      turned('target-%d-ring-a' % i, 'ring', 'z', [[0, 0], [0, 0.07], [0.019, 0.07], [0.019, 0]], [x, 0.165, -0.085]),
      turned('target-%d-ring-b' % i, 'face', 'z', [[0, 0], [0, 0.048], [0.02, 0.048], [0.02, 0]], [x, 0.165, -0.085]),
      turned('target-%d-eye' % i, 'ring', 'z', [[0, 0], [0, 0.022], [0.021, 0.022], [0.021, 0]], [x, 0.165, -0.085]),
    ]
    for i in [0, 1]
    for x in [[-0.1, 0.11][i]]
  ]), {
    gun: 'plastic-orange',
    grip: 'plastic-charcoal',
    lens: 'gem-red',
    stand: 'foil-alu',
    body: 'plastic-charcoal',
    screen: 'lcd-green',
    face: 'plastic-gloss-white',
    ring: 'plastic-red',
  })
  + { voxelGrain: 0.004 },

  // A size 7 basketball, 239 mm across, pebbled orange rubber with black seams: two great circles and two
  // rings standing in for the curved seams.
  local r = 0.1195, c = [0, r, 0];
  h.compound('basketball', 0.41, [
    h.ball('ball', 'ball', r, 0, r, 0, 1, 12),
    seam('seam-z', 'seam', r, 0, 'z', c),
    seam('seam-x', 'seam', r, 0, 'x', c),
    seam('seam-left', 'seam', r, -0.075, 'x', c),
    seam('seam-right', 'seam', r, 0.075, 'x', c),
  ], { ball: 'foam-orange', seam: 'rubber-offblack' })
  + { voxelGrain: 0.004 },

  // A beach volleyball 270 mm across, soft vinyl in bright yellow, blue and white bands.
  local r = 0.135, c = [0, r, 0], cuts = [-r, -0.09, -0.045, 0, 0.045, 0.09, r];
  h.compound('beach_volleyball', 0.27, [
    zone('band-%d' % i, ['yellow', 'blue', 'white'][i % 3], r, cuts[i], cuts[i + 1], 'x', c)
    for i in std.range(0, 5)
  ], { yellow: 'rubber-yellow', blue: 'paint-drum-blue', white: 'plastic-gloss-white' })
  + { voxelGrain: 0.004 },

  // A bowling ball 216 mm across, glossy red, with three finger holes on its front face.
  local r = 0.108, holes = [[-0.024, 0.15, 0.012], [0.024, 0.15, 0.012], [0, 0.1, 0.014]];
  h.compound('bowling_ball', 4.9, [
    h.ball('ball', 'ball', r, 0, r, 0, 1, 12),
  ] + [
    local z = std.sqrt(r * r - holes[i][0] * holes[i][0] - (holes[i][1] - r) * (holes[i][1] - r));
    turned('hole-%d' % i, 'hole', 'z', [[0, 0], [0, holes[i][2]], [0.012, holes[i][2]], [0.012, 0]], [holes[i][0], holes[i][1], z - 0.01])
    for i in std.range(0, 2)
  ], { ball: 'lacquer-red', hole: 'void-black' })
  + { voxelGrain: 0.004 },

  // An American football 290 mm long and 170 mm across, brown leather with white stripes near each end and
  // white laces along the top seam.
  local a = 0.145, R = 0.085, rad(x) = R * std.pow(std.max(0, 1 - (x / a) * (x / a)), 0.75);
  h.compound('football', 0.21, [
    turned('ball', 'leather', 'x', [[0, 0]] + [[a + x, rad(x)] for x in [-a + 2 * a * i / 16 for i in std.range(1, 15)]] + [[2 * a, 0]], [-a, R, 0]),
  ] + [
    local x0 = x - 0.005, ri = std.min(rad(x0), rad(x0 + 0.01)) - 0.01;
    turned('stripe-%d' % i, 'stripe', 'x', [[0, ri], [0, rad(x0) + 0.0015], [0.01, rad(x0 + 0.01) + 0.0015], [0.01, ri], [0, ri]], [x0, R, 0])
    for i in [0, 1]
    for x in [[-0.1, 0.1][i]]
  ] + [
    box('lace-run', 'lace', [-0.045, 2 * R - 0.002, -0.003], [0.045, 2 * R + 0.002, 0.003]),
  ] + [
    box('lace-%d' % i, 'lace', [-0.04 + i * 0.01 - 0.002, 2 * R - 0.003 - 0.0002 * (i - 4) * (i - 4), -0.012], [-0.04 + i * 0.01 + 0.002, 2 * R + 0.004, 0.012])
    for i in std.range(0, 8)
  ], { leather: 'leather-chestnut', stripe: 'cloth-cream', lace: 'cloth-cream' })
  + { voxelGrain: 0.004 },
]
