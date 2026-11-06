local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
local pi = 3.141592653589793;
// A flat piece lying on y from `y0` to `y1`, its convex outline given as [x, z] points.
local flatY(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y0, y1);
// An upright piece from `z0` to `z1`, its convex outline given as [x, y] points.
local flatZ(id, slot, pts, z0, z1) = h.prism(id, slot, 'z', pts, z0, z1);
// An ellipse outline centred at [cx, cz], `rx` by `rz`.
local ellipse(cx, cz, rx, rz, n=24) = [[cx + rx * std.cos(2 * pi * i / n), cz + rz * std.sin(2 * pi * i / n)] for i in std.range(0, n - 1)];
// A strip `w` wide from point a to point b of a plane, as a four-point outline.
local strip(a, b, w) =
  local dx = b[0] - a[0], dz = b[1] - a[1], l = std.sqrt(dx * dx + dz * dz), nx = -dz / l * w / 2, nz = dx / l * w / 2;
  [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]];
// A rod along x from `x0` to `x1`, its axis at (y, z).
local rodAt(id, slot, r, x0, x1, y, z) = turned(id, slot, 'x', [[0, 0], [0, r], [x1 - x0, r], [x1 - x0, 0]], [x0, y, z]);
// A rod along z from `z0` to `z1`, its axis at (x, y).
local rodZ(id, slot, r, z0, z1, x, y) = turned(id, slot, 'z', [[z0, 0], [z0, r], [z1, r], [z1, 0]], [x, y, 0]);
// Frets from a nut at `nut` towards -x on a scale `scale` long, `half` either side of the middle, standing on `y`.
local frets(n, nut, scale, half, y) = [
  box('fret-%d' % i, 'fret', [nut - scale * (1 - std.pow(2, -i / 12)) - 0.001, y, -half], [nut - scale * (1 - std.pow(2, -i / 12)) + 0.001, y + 0.002, half])
  for i in std.range(1, n)
];
[
  // A concert flute, 660 mm long and 19 mm across: a silver tube with a crown cap, a lip plate near the head end, two
  // joint rings and a row of key cups on a side rod down the body and foot.
  h.compound('flute', 0.4, [
    rodAt('body', 'body', 0.0095, -0.325, 0.33, 0.0095, 0),
    rodAt('crown', 'keys', 0.011, -0.335, -0.325, 0.0095, 0),
    rodAt('ring-head', 'keys', 0.0108, -0.13, -0.118, 0.0095, 0),
    rodAt('ring-foot', 'keys', 0.0108, 0.2, 0.212, 0.0095, 0),
    flatY('lip', 'keys', ellipse(-0.258, 0, 0.014, 0.01, 12), 0.0145, 0.021),
    flatY('hole', 'hole', ellipse(-0.258, 0, 0.005, 0.0035, 10), 0.021, 0.022),
    rodAt('rod', 'keys', 0.0022, -0.07, 0.3, 0.014, 0.0105),
  ] + [
    disc('key-%d' % i, 'cup', 0.0068, 0.0145, 0.022, -0.06 + i * 0.029, if i % 3 == 1 then 0.002 else 0)
    for i in std.range(0, 11)
  ] + [
    box('arm-%d' % i, 'keys', [-0.063 + i * 0.029, 0.013, 0.002], [-0.057 + i * 0.029, 0.017, 0.0105])
    for i in std.range(0, 11)
  ], { body: 'metal-silver', keys: 'metal-silver', cup: 'steel-mirror', hole: 'plastic-matte-black' })
  + { handling: h.gripOn('flute', 'body'), voxelGrain: 0.002 },

  // A five-string kantele, 460 mm long, 150 mm across the peg end and 70 mm across the tail, 60 mm deep: a carved
  // wooden box with a pale soundboard and a round sound hole, steel strings fanning from a tail bar to a slanted row
  // of tuning pins.
  local pegs = [[-0.2, -0.05 + i * 0.027 + 0.004 * i] for i in std.range(0, 4)];
  local tails = [[0.195, -0.058 + i * 0.012] for i in std.range(0, 4)];
  h.compound('kantele', 0.83, [
    flatY('box', 'box', [[-0.23, -0.07], [0.23, -0.07], [0.23, 0.0], [-0.23, 0.085]], 0, 0.05),
    flatY('top', 'top', [[-0.225, -0.066], [0.225, -0.066], [0.225, -0.004], [-0.225, 0.08]], 0.05, 0.055),
    flatY('wing', 'box', [[0.23, -0.07], [0.27, -0.07], [0.27, -0.045], [0.23, -0.035]], 0.02, 0.05),
    flatY('hole', 'hole', ellipse(0.02, -0.025, 0.017, 0.017, 16), 0.055, 0.056),
    box('tail-bar', 'metal', [0.19, 0.055, -0.064], [0.2, 0.063, -0.004]),
  ] + [
    disc('pin-%d' % i, 'metal', 0.0035, 0.055, 0.072, pegs[i][0] + (pegs[i][1] + 0.05) * 0.1, pegs[i][1])
    for i in std.range(0, 4)
  ] + [
    flatY('string-%d' % i, 'string', strip([pegs[i][0] + (pegs[i][1] + 0.05) * 0.1, pegs[i][1]], tails[i], 0.002), 0.06, 0.062)
    for i in std.range(0, 4)
  ], { box: 'wood-birch', top: 'wood-pine', hole: 'plastic-matte-black', metal: 'steel-bright', string: 'steel-mirror' })
  + { voxelGrain: 0.002 },

  // A golden krar, a bowl lyre 1 m tall and 760 mm across the yoke: a round bowl sound box 360 mm across faced with
  // a skin, two arms spreading up from it to a crossbar, and six strings fanning from a tailpiece on the skin up to
  // the crossbar. Standing upright, face on +z.
  local bowlY = 0.19;
  h.compound('krar_golden', 18, [
    turned('bowl', 'bowl', 'z', [[-0.11, 0], [-0.11, 0.06], [-0.08, 0.13], [-0.04, 0.17], [0, 0.18], [0, 0]], [0, bowlY, 0]),
    turned('skin', 'skin', 'z', [[0, 0], [0, 0.172], [0.005, 0.172], [0.005, 0]], [0, bowlY, 0]),
    flatZ('arm-left', 'frame', strip([-0.11, bowlY + 0.08], [-0.33, 0.95], 0.04), -0.06, -0.02),
    flatZ('arm-right', 'frame', strip([0.11, bowlY + 0.08], [0.33, 0.95], 0.04), -0.06, -0.02),
    box('yoke', 'frame', [-0.38, 0.92, -0.065], [0.38, 0.97, -0.015]),
    box('tailpiece', 'frame', [-0.05, bowlY - 0.14, 0.005], [0.05, bowlY - 0.115, 0.016]),
    box('bridge', 'frame', [-0.06, bowlY - 0.04, 0.005], [0.06, bowlY - 0.025, 0.03]),
  ] + [
    flatZ('string-%d' % i, 'string', strip([-0.04 + i * 0.016, bowlY - 0.12], [-0.2 + i * 0.08, 0.94], 0.004), 0.022, 0.026)
    for i in std.range(0, 5)
  ] + [
    rodZ('peg-%d' % i, 'frame', 0.012, -0.075, 0.0, -0.2 + i * 0.08, 0.945)
    for i in std.range(0, 5)
  ], { bowl: 'metal-gold', skin: 'brass-polished', frame: 'metal-gold', string: 'steel-mirror' })
  + { voxelGrain: 0.004 },

  // A soprano ukulele, 580 mm long: a figure-eight body 240 mm long, 165 mm across and 60 mm deep with a pale top, a
  // sound hole and a bridge, a neck with a dark fingerboard and twelve frets, a flat headstock with four tuners and
  // four strings. Lying soundboard up, head on +x.
  h.compound('ukulele', 0.36, [
    flatY('lower', 'sides', ellipse(-0.22, 0, 0.075, 0.0825), 0, 0.058),
    flatY('upper', 'sides', ellipse(-0.11, 0, 0.065, 0.07), 0, 0.058),
    flatY('waist', 'sides', ellipse(-0.165, 0, 0.07, 0.06), 0, 0.058),
    flatY('top-waist', 'top', ellipse(-0.165, 0, 0.067, 0.057), 0.058, 0.06),
    flatY('top-lower', 'top', ellipse(-0.22, 0, 0.072, 0.0795), 0.058, 0.06),
    flatY('top-upper', 'top', ellipse(-0.11, 0, 0.062, 0.067), 0.058, 0.06),
    flatY('hole', 'hole', ellipse(-0.12, 0, 0.024, 0.024, 16), 0.06, 0.061),
    box('bridge', 'dark', [-0.235, 0.06, -0.036], [-0.223, 0.068, 0.036]),
    box('neck', 'sides', [-0.06, 0.036, -0.017], [0.18, 0.058, 0.017]),
    box('fingerboard', 'dark', [-0.1, 0.058, -0.019], [0.17, 0.064, 0.019]),
    box('nut', 'nut', [0.17, 0.058, -0.019], [0.176, 0.068, 0.019]),
    flatY('head', 'sides', [[0.176, -0.02], [0.285, -0.028], [0.285, 0.028], [0.176, 0.02]], 0.042, 0.056),
  ] + frets(12, 0.17, 0.33, 0.019, 0.064) + [
    disc('post-%d' % i, 'metal', 0.004, 0.056, 0.064, [0.21, 0.25][std.floor(i / 2)], [-0.014, 0.014][i % 2])
    for i in std.range(0, 3)
  ] + [
    disc('button-%d' % i, 'button', 0.008, 0.028, 0.042, [0.21, 0.25][std.floor(i / 2)], [-0.014, 0.014][i % 2])
    for i in std.range(0, 3)
  ] + [
    flatY('string-%d' % i, 'string', strip([-0.229, -0.015 + i * 0.01], [0.173, -0.012 + i * 0.008], 0.002), 0.066, 0.068)
    for i in std.range(0, 3)
  ], { sides: 'wood-oak', top: 'wood-pine', hole: 'plastic-matte-black', dark: 'wood-walnut', nut: 'bone', fret: 'steel-bright', metal: 'steel-bright', button: 'plastic-white', string: 'cord-cotton' })
  + { handling: h.gripOn('ukulele', 'neck'), voxelGrain: 0.002 },

  // A full-size violin, 600 mm long: a body 355 mm long and 205 mm across with an arched top, f-holes, a bridge, a
  // black tailpiece and chin rest, a black fingerboard over the neck, a pegbox with four pegs ending in a scroll, and
  // four strings. Lying top up, scroll on +x.
  local fhole(id, x, z, s) = flatY(id, 'hole', strip([x - 0.035, z - s * 0.006], [x + 0.035, z + s * 0.006], 0.004), 0.04, 0.041);
  h.compound('violin', 0.48, [
    flatY('lower', 'ribs', ellipse(-0.2, 0, 0.1, 0.1025), 0, 0.03),
    flatY('upper', 'ribs', ellipse(-0.03, 0, 0.085, 0.084), 0, 0.03),
    flatY('waist', 'ribs', ellipse(-0.115, 0, 0.06, 0.058), 0, 0.03),
    flatY('top-waist', 'top', ellipse(-0.115, 0, 0.057, 0.055), 0.03, 0.035),
    flatY('arch-waist', 'top', ellipse(-0.115, 0, 0.05, 0.045), 0.035, 0.04),
    flatY('top-lower', 'top', ellipse(-0.2, 0, 0.097, 0.099), 0.03, 0.035),
    flatY('top-upper', 'top', ellipse(-0.03, 0, 0.082, 0.081), 0.03, 0.035),
    flatY('arch-lower', 'top', ellipse(-0.19, 0, 0.08, 0.075), 0.035, 0.04),
    flatY('arch-upper', 'top', ellipse(-0.04, 0, 0.065, 0.06), 0.035, 0.04),
    fhole('f-left', -0.12, -0.042, 1),
    fhole('f-right', -0.12, 0.042, -1),
    box('bridge', 'bridge', [-0.124, 0.04, -0.022], [-0.118, 0.062, 0.022]),
    flatY('tailpiece', 'ebony', [[-0.285, -0.011], [-0.175, -0.02], [-0.175, 0.02], [-0.285, 0.011]], 0.04, 0.048),
    flatY('chinrest', 'ebony', ellipse(-0.262, -0.05, 0.024, 0.03, 16), 0.04, 0.05),
    box('neck', 'ribs', [0.05, 0.022, -0.012], [0.185, 0.048, 0.012]),
    flatY('fingerboard', 'ebony', [[-0.07, -0.021], [0.185, -0.012], [0.185, 0.012], [-0.07, 0.021]], 0.048, 0.056),
    box('nut', 'ebony', [0.185, 0.044, -0.013], [0.19, 0.06, 0.013]),
    box('pegbox', 'ribs', [0.19, 0.018, -0.012], [0.265, 0.046, 0.012]),
    rodZ('scroll', 'ribs', 0.02, -0.012, 0.012, 0.28, 0.034),
    rodZ('scroll-eye', 'top', 0.007, -0.014, 0.014, 0.28, 0.034),
  ] + [
    rodZ('peg-%d' % i, 'ebony', 0.004, -0.032, 0.032, 0.205 + i * 0.017, 0.034)
    for i in std.range(0, 3)
  ] + [
    flatY('string-%d' % i, 'string', strip([-0.18, -0.012 + i * 0.008], [0.186, -0.0075 + i * 0.005], 0.002), 0.058, 0.06)
    for i in std.range(0, 3)
  ], { ribs: 'wood-walnut', top: 'wood-oak', hole: 'plastic-matte-black', bridge: 'wood-pine', ebony: 'lacquer-black', string: 'steel-mirror' })
  + { handling: h.gripOn('violin', 'neck'), voxelGrain: 0.002 },

  // A steel dog whistle, 60 mm long and 10 mm across: a tube with a flattened mouthpiece, a sound window, a knurled
  // tuning sleeve and a lanyard ring at the far end.
  h.compound('dog_whistle', 0.023, [
    rodAt('tube', 'body', 0.005, -0.026, 0.02, 0.006, 0),
    rodAt('sleeve', 'sleeve', 0.0058, -0.024, -0.008, 0.006, 0),
    box('mouth', 'body', [0.02, 0.003, -0.004], [0.034, 0.009, 0.004]),
    box('window', 'hole', [0.012, 0.0105, -0.002], [0.017, 0.0115, 0.002]),
    turned('ring', 'body', 'z', [[-0.001, 0.0035], [-0.001, 0.0055], [0.001, 0.0055], [0.001, 0.0035], [-0.001, 0.0035]], [-0.031, 0.006, 0]),
  ], { body: 'steel-mirror', sleeve: 'steel-grey', hole: 'plastic-matte-black' })
  + { handling: h.gripOn('dog_whistle', 'tube'), voxelGrain: 0.002 },

  // Corded electric animal shears, 330 mm long and 70 mm across the head: a moulded motor body with a rubber grip
  // band and a slide switch, a head housing carrying a toothed comb under a cutter plate held by a tension nut, and a
  // short length of cord to a plug.
  h.compound('elec_shears', 0.87, [
    turned('body', 'body', 'x', [[0, 0], [0, 0.014], [0.02, 0.026], [0.15, 0.03], [0.2, 0.033], [0.23, 0.03], [0.23, 0]], [-0.14, 0.035, 0]),
    rodAt('grip', 'grip', 0.0305, -0.08, 0.02, 0.035, 0),
    box('switch', 'switch', [0.03, 0.064, -0.008], [0.055, 0.07, 0.008]),
    box('head', 'body', [0.08, 0.008, -0.036], [0.13, 0.058, 0.036]),
    box('comb', 'blade', [0.13, 0.012, -0.038], [0.16, 0.018, 0.038]),
    box('cutter', 'cutter', [0.13, 0.018, -0.032], [0.158, 0.024, 0.032]),
    disc('nut', 'blade', 0.008, 0.058, 0.068, 0.11, 0),
    rodAt('relief', 'grip', 0.008, -0.165, -0.14, 0.035, 0),
    rodAt('cord', 'grip', 0.004, -0.24, -0.165, 0.035, 0),
    box('plug', 'plug', [-0.28, 0.022, -0.015], [-0.24, 0.048, 0.015]),
    box('prong-a', 'blade', [-0.296, 0.03, -0.008], [-0.28, 0.04, -0.006]),
    box('prong-b', 'blade', [-0.296, 0.03, 0.006], [-0.28, 0.04, 0.008]),
  ] + [
    box('tooth-%d' % i, 'blade', [0.16, 0.012, -0.038 + i * 0.0084], [0.18, 0.016, -0.034 + i * 0.0084])
    for i in std.range(0, 9)
  ], { body: 'plastic-blue', grip: 'rubber-black', switch: 'plastic-white', blade: 'steel-grey', cutter: 'steel-bright', plug: 'plastic-black' })
  + { handling: h.gripOn('elec_shears', 'body'), voxelGrain: 0.002 },
]
