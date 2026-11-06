local h = import '../compound.libsonnet';
local box = h.box;
// A sloped strap of width `w` along x, running in the yz plane from [ya, za] to [yb, zb], `t` thick.
local strap(id, slot, a, b, x0, x1, t=0.006) =
  local dy = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dy * dy + dz * dz);
  local ny = -dz / len * t, nz = dy / len * t;
  h.prism(id, slot, 'x', [a, b, [b[0] + ny, b[1] + nz], [a[0] + ny, a[1] + nz]], x0, x1);
// A gym duffel lying along x, `l` long and `r` in radius, settled on a flat sole inside its footprint, end panels, a zip along its top, two carry
// handles meeting over the zip in a wrapped grip, and a zipped pocket on its +x end. Front on +z.
// Slots: body, trim, grip.
local duffel(l, r) =
  local hx = l * 0.2, top = 2 * r, reach = top + 0.07;
  [
    h.rod('body', 'body', r, -l / 2, l / 2, r),
    box('base', 'body', [-l / 2 + 0.01, 0, -r * 0.5], [l / 2 - 0.01, r * 0.3, r * 0.5]),
    h.turned('end-left', 'trim', 'x', [[0, 0], [0, r + 0.004], [0.008, r + 0.004], [0.008, 0]], [-l / 2 - 0.004, r, 0]),
    h.turned('end-right', 'trim', 'x', [[0, 0], [0, r + 0.004], [0.008, r + 0.004], [0.008, 0]], [l / 2 - 0.004, r, 0]),
    h.turned('end-pocket', 'body', 'x', [[0, 0], [0, r * 0.62], [0.025, r * 0.58], [0.03, 0]], [l / 2 + 0.004, r * 0.95, 0]),
    h.turned('end-pocket-zip', 'trim', 'x', [[0, 0], [0, r * 0.66], [0.008, r * 0.66], [0.008, 0]], [l / 2 + 0.004, r * 0.95, 0]),
    box('zip', 'trim', [-l * 0.44, top - 0.006, -0.008], [l * 0.44, top + 0.004, 0.008]),
    box('zip-pull', 'grip', [l * 0.3, top, 0.004], [l * 0.3 + 0.014, top + 0.008, 0.03]),
    box('base-band', 'trim', [-l / 2 + 0.01, 0, r * 0.5], [l / 2 - 0.01, r * 0.2, r * 0.5 + 0.004]),
  ] + std.flattenArrays([
    [
      box('band-front-%d' % i, 'trim', [x - 0.016, r * 0.6, r * 0.9], [x + 0.016, r * 1.15, r + 0.004]),
      box('band-back-%d' % i, 'trim', [x - 0.016, r * 0.6, -r - 0.004], [x + 0.016, r * 1.15, -r * 0.9]),
      strap('handle-front-%d' % i, 'trim', [r * 1.15, r * 0.97], [reach, 0.012], x - 0.016, x + 0.016),
      strap('handle-back-%d' % i, 'trim', [reach, -0.012], [r * 1.15, -r * 0.97], x - 0.016, x + 0.016),
    ]
    for i in [0, 1]
    for x in [[-hx, hx][i]]
  ]) + [
    box('grip', 'grip', [-hx - 0.03, reach - 0.012, -0.022], [hx + 0.03, reach + 0.008, 0.022]),
  ];
local gym(id, massKg, l, r, body) = h.compound(id, massKg, duffel(l, r), { body: body, trim: 'webbing-black', grip: 'plastic-matte-black' })
  + h.inHand(id, 'grip') + { voxelGrain: 0.004 };
[
  // A canvas loot sack about 380 mm tall and 320 mm across when stuffed, its neck gathered and tied with cord
  // above a short tuft of cloth.
  h.compound('swag_bag', 4, [
    h.turned('sack', 'body', 'y', [[0, 0], [0, 0.11], [0.03, 0.15], [0.12, 0.16], [0.22, 0.14], [0.29, 0.08], [0.32, 0.035], [0.32, 0]], [0, 0, 0]),
    h.turned('tuft', 'body', 'y', [[0, 0], [0, 0.03], [0.03, 0.045], [0.06, 0.055], [0.065, 0]], [0, 0.32, 0]),
    h.turned('tie', 'cord', 'y', [[0, 0], [0, 0.042], [0.014, 0.042], [0.014, 0]], [0, 0.315, 0]),
    box('tie-end-a', 'cord', [0.035, 0.24, 0.02], [0.045, 0.325, 0.03]),
    box('tie-end-b', 'cord', [0.025, 0.25, 0.034], [0.035, 0.325, 0.044]),
  ], { body: 'cloth-canvas', cord: 'cord-cotton' }) + h.inHand('swag_bag', 'tuft') + { voxelGrain: 0.004 },

  // A pack frame 620 mm tall and 340 mm wide: two pine uprights with three cross slats and a shelf 220 mm deep at the
  // foot, carrying a bundle of olive canvas with its top rolled down over the front, lashed to the frame with two
  // rawhide cords, and two leather shoulder straps on the back.
  h.compound('trapper_pack', 2.7, [
    box('upright-left', 'wood', [-0.17, 0, -0.13], [-0.14, 0.62, -0.1]),
    box('upright-right', 'wood', [0.14, 0, -0.13], [0.17, 0.62, -0.1]),
    box('slat-top', 'wood', [-0.17, 0.56, -0.12], [0.17, 0.6, -0.1]),
    box('slat-mid', 'wood', [-0.17, 0.33, -0.12], [0.17, 0.37, -0.1]),
    box('slat-low', 'wood', [-0.17, 0.1, -0.12], [0.17, 0.14, -0.1]),
    box('shelf', 'wood', [-0.17, 0, -0.1], [0.17, 0.025, 0.12]),
    box('shelf-lip', 'wood', [-0.17, 0.025, 0.1], [0.17, 0.045, 0.12]),
    h.prism('bundle', 'canvas', 'x', [[0.025, -0.08], [0.025, 0.08], [0.05, 0.105], [0.37, 0.105], [0.4, 0.08], [0.4, -0.08], [0.37, -0.1], [0.05, -0.1]], -0.13, 0.13),
    h.turned('roll', 'canvas', 'x', [[0, 0], [0, 0.048], [0.27, 0.048], [0.27, 0]], [-0.135, 0.4, 0.06]),
    box('flap', 'canvas', [-0.125, 0.29, 0.1], [0.125, 0.4, 0.114]),
    box('flap-hem', 'cord', [-0.125, 0.285, 0.1], [0.125, 0.295, 0.116]),
  ] + [
    box('lash-%d' % i, 'cord', [-0.177, y, -0.13], [0.177, y + 0.016, 0.112])
    for i in [0, 1]
    for y in [[0.12, 0.31][i]]
  ] + [
    box('strap-left', 'leather', [-0.11, 0.08, -0.15], [-0.07, 0.59, -0.13]),
    box('strap-right', 'leather', [0.07, 0.08, -0.15], [0.11, 0.59, -0.13]),
    box('strap-left-pad', 'leather', [-0.115, 0.38, -0.165], [-0.065, 0.54, -0.15]),
    box('strap-right-pad', 'leather', [0.065, 0.38, -0.165], [0.115, 0.54, -0.15]),
  ], { wood: 'wood-pine', canvas: 'cloth-olive-drab', cord: 'skin-rawhide', leather: 'leather-tan' })
  + h.inHand('trapper_pack', 'slat-top') + { voxelGrain: 0.004 },

  // A nylon daypack 290 mm wide, 440 mm tall and 170 mm deep with a rounded top, a zipped front pocket, mesh bottle
  // pockets on its sides, a grab loop and padded shoulder straps on its back. Front on +z.
  h.compound('travelpack', 0.52, [
    box('body', 'body', [-0.145, 0, -0.085], [0.145, 0.295, 0.085]),
    h.turned('crown', 'body', 'z', [[0, 0], [0, 0.145], [0.17, 0.145], [0.17, 0]], [0, 0.295, -0.085]),
    box('base', 'trim', [-0.148, 0, -0.088], [0.148, 0.02, 0.088]),
    box('pocket', 'body', [-0.115, 0.03, 0.085], [0.115, 0.16, 0.12]),
    h.turned('pocket-top', 'body', 'z', [[0, 0], [0, 0.115], [0.035, 0.115], [0.035, 0]], [0, 0.16, 0.085]),
    h.turned('zip', 'trim', 'z', [[0, 0.139], [0, 0.149], [0.006, 0.149], [0.006, 0.139], [0, 0.139]], [0, 0.295, 0.082]),
    box('pocket-zip', 'trim', [-0.1, 0.2, 0.118], [0.1, 0.206, 0.123]),
    box('pull-a', 'grip', [0.09, 0.19, 0.12], [0.1, 0.21, 0.126]),
    box('pull-b', 'grip', [0.12, 0.38, 0.06], [0.13, 0.4, 0.066]),
    box('mesh-left', 'mesh', [-0.17, 0.02, -0.06], [-0.145, 0.15, 0.06]),
    box('mesh-right', 'mesh', [0.145, 0.02, -0.06], [0.17, 0.15, 0.06]),
    box('grab-loop', 'trim', [-0.02, 0.44, -0.07], [0.02, 0.455, -0.03]),
    box('strap-left', 'trim', [-0.11, 0.03, -0.11], [-0.055, 0.42, -0.085]),
    box('strap-right', 'trim', [0.055, 0.03, -0.11], [0.11, 0.42, -0.085]),
    box('back-pad', 'trim', [-0.13, 0.06, -0.095], [0.13, 0.3, -0.085]),
  ], { body: 'nylon-red', trim: 'nylon-black', grip: 'plastic-matte-black', mesh: 'mesh-black' })
  + h.inHand('travelpack', 'grab-loop') + { voxelGrain: 0.004 },

  // A woven straw basket 360 mm tall and 320 mm across at the mouth, flaring from its base, under a domed lid with a
  // loop handle, with woven rings every 60 mm and two leather shoulder straps on its back.
  h.compound('wicker_backpack', 0.68, [
    h.turned('basket', 'body', 'y', [[0, 0], [0, 0.125], [0.015, 0.135], [0.36, 0.16], [0.36, 0]], [0, 0, 0]),
    h.turned('lid', 'rim', 'y', [[0, 0], [0, 0.168], [0.02, 0.168], [0.045, 0.12], [0.055, 0]], [0, 0.355, 0]),
    h.turned('lid-loop', 'strap', 'y', [[0, 0.018], [0, 0.026], [0.012, 0.026], [0.012, 0.018], [0, 0.018]], [0, 0.41, 0]),
  ] + [
    h.turned('ring-%d' % i, 'rim', 'y', [[0, 0], [0, 0.126 + 0.034 * y / 0.36 + 0.005], [0.012, 0.126 + 0.034 * y / 0.36 + 0.005], [0.012, 0]], [0, y, 0])
    for i in std.range(0, 5)
    for y in [0.01 + i * 0.06]
  ] + [
    strap('strap-left', 'strap', [0.03, -0.128], [0.34, -0.152], -0.1, -0.07, -0.008),
    strap('strap-right', 'strap', [0.03, -0.128], [0.34, -0.152], 0.07, 0.1, -0.008),
  ], { body: 'straw-wicker', rim: 'jute', strap: 'leather-tan' })
  + h.inHand('wicker_backpack', 'lid-loop') + { voxelGrain: 0.004 },

  // A lycra gym duffel 560 mm long and 280 mm across.
  gym('duffelbag_gym_l', 0.6, 0.56, 0.14, 'nylon-red'),

  // A lycra gym duffel 480 mm long and 240 mm across.
  gym('duffelbag_gym_m', 0.59, 0.48, 0.12, 'cloth-navy'),

  // A lycra gym duffel 420 mm long and 210 mm across.
  gym('duffelbag_gym_s', 0.46, 0.42, 0.105, 'cloth-charcoal'),

  // A lycra gym duffel 640 mm long and 320 mm across.
  gym('duffelbag_gym_xl', 0.75, 0.64, 0.16, 'cloth-blue'),
]
