local h = import '../compound.libsonnet';
local box = h.box;
// A loose strap lying flat on the floor behind a bag in a U from z = `z0` back to `z1`, `w` across and `s` wide.
local strapBehind(prefix, slot, w, z0, z1, s) = [
  box(prefix + '-back', slot, [-w / 2, 0, z1], [w / 2, 0.003, z1 + s]),
  box(prefix + '-left', slot, [-w / 2, 0, z1], [-w / 2 + s, 0.003, z0]),
  box(prefix + '-right', slot, [w / 2 - s, 0, z1], [w / 2, 0.003, z0]),
];
// Two padded shoulder straps on the back face of an upright pack at z, from `y0` to `y1`, their centres `x` either
// side. Slot strap.
local shoulderStraps(x, y0, y1, z, w=0.05, t=0.015) = [
  box('shoulder-%d' % i, 'strap', [s * x - w / 2, y0, z - t], [s * x + w / 2, y1, z])
  for i in [0, 1]
  for s in [[-1, 1][i]]
];
// A grab handle standing over a top face at y: two posts and a bar, `w` long along x. Slot handle.
local grab(prefix, slot, w, y, z=0, rise=0.03, t=0.012) = [
  box(prefix + '-a', slot, [-w / 2, y, z - t / 2], [-w / 2 + t, y + rise, z + t / 2]),
  box(prefix + '-b', slot, [w / 2 - t, y, z - t / 2], [w / 2, y + rise, z + t / 2]),
  box(prefix + '-bar', slot, [-w / 2, y + rise - t * 0.6, z - t / 2], [w / 2, y + rise, z + t / 2]),
];
// A cylinder lying along x from `x0` to `x1`, its axis at height `r` so it rests on the floor.
local lying(id, slot, r, x0, x1, z=0) = h.turned(id, slot, 'x', [[0, 0], [0, r], [x1 - x0, r], [x1 - x0, 0]], [x0, r, z]);
// A carry handle arching over a lying cylinder of radius `r`: two tabs down its sides and a strap across the top,
// `w` wide along x, centred at x.
local overHandle(prefix, slot, r, x, w, rise=0.03) = [
  box(prefix + '-front', slot, [x - w / 2, r * 0.9, r * 0.45], [x + w / 2, r * 2 + rise, r * 0.45 + 0.006]),
  box(prefix + '-back', slot, [x - w / 2, r * 0.9, -r * 0.45 - 0.006], [x + w / 2, r * 2 + rise, -r * 0.45]),
  box(prefix + '-top', slot, [x - w / 2, r * 2 + rise - 0.006, -r * 0.45 - 0.006], [x + w / 2, r * 2 + rise, r * 0.45 + 0.006]),
];
local rad(d) = d * std.pi / 180;
local hide(id) = h.compound(id, 0.25, [
  h.turned('sack', 'hide', 'y', [[0, 0], [0, 0.05], [0.02, 0.07], [0.07, 0.075], [0.11, 0.058], [0.13, 0.03], [0.14, 0]]),
  // Lumps where the load pushes the skin out.
  h.turned('lump-a', 'hide', 'y', [[0, 0], [0, 0.03], [0.03, 0.04], [0.06, 0.03], [0.07, 0]], [0.035, 0.02, 0.03]),
  h.turned('lump-b', 'hide', 'y', [[0, 0], [0, 0.025], [0.025, 0.035], [0.05, 0.025], [0.06, 0]], [-0.04, 0.035, -0.02]),
  h.turned('neck', 'hide', 'y', [[0, 0], [0, 0.02], [0.03, 0.016], [0.03, 0]], [0, 0.135, 0]),
  // The drawstring wound round the neck, tied in a bow with its ends hanging.
  h.turned('tie', 'tie', 'y', [[0, 0], [0, 0.023], [0.01, 0.023], [0.01, 0]], [0, 0.145, 0]),
  h.turned('bow-a', 'tie', 'z', [[0, 0], [0, 0.009], [0.006, 0.009], [0.006, 0]], [0.012, 0.155, 0.02]),
  h.turned('bow-b', 'tie', 'z', [[0, 0], [0, 0.009], [0.006, 0.009], [0.006, 0]], [-0.012, 0.155, 0.02]),
  box('tail-a', 'tie', [0.003, 0.07, 0.022], [0.009, 0.15, 0.028]),
  box('tail-b', 'tie', [-0.012, 0.09, 0.02], [-0.006, 0.15, 0.026]),
  // The closed mouth: a dark pucker inside the crumpled flaps.
  h.disc('mouth', 'mouth', 0.012, 0.165, 0.178),
] + [
  // Gathers: creases running down from the tie over the shoulder of the sack.
  local a = rad(360 * i / 10 + 9), r0 = 0.02, r1 = [0.06, 0.047, 0.034][k], y0 = [0.1, 0.115, 0.127][k];
  local w = 0.0035;
  h.prism('gather-%d-%d' % [i, k], 'hide', 'y', [[std.cos(a) * r0 - std.sin(a) * w, std.sin(a) * r0 + std.cos(a) * w], [std.cos(a) * r1 - std.sin(a) * w, std.sin(a) * r1 + std.cos(a) * w], [std.cos(a) * r1 + std.sin(a) * w, std.sin(a) * r1 - std.cos(a) * w], [std.cos(a) * r0 + std.sin(a) * w, std.sin(a) * r0 - std.cos(a) * w]], y0, y0 + 0.014)
  for k in [0, 1, 2]
  for i in std.range(0, 9)
] + [
  // Crumpled flaps of skin standing above the tie, leaning out at uneven angles.
  local a = rad(360 * i / 7), lean = 0.012 + 0.008 * (i % 3), ht = 0.03 + 0.008 * ((i * 2) % 3);
  local c = [std.sin(a), std.cos(a)], n = [std.cos(a), -std.sin(a)];
  local p(r, w) = [c[1] * r + n[1] * w, c[0] * r + n[0] * w];
  h.prism('flap-%d' % i, 'hide', 'y', [p(0.008, -0.012), p(0.008, 0.012), p(0.022 + lean, 0.008), p(0.024 + lean, -0.008)], 0.155, 0.155 + ht)
  for i in std.range(0, 6)
], { hide: 'skin-rawhide', mouth: 'leather-charcoal', tie: 'leather-chestnut' });
[
  // A padded nylon camera bag 260 mm wide, 190 mm tall and 150 mm deep, with a flap lid, a zipped front pocket, a
  // side pocket and a grab handle, its shoulder strap lying behind it.
  h.compound('camera_bag', 0.6, h.pouch(0.26, 0.19, 0.15, 0.07, 0) + [
    box('front-pocket', 'pocket', [-0.1, 0.02, 0.075], [0.1, 0.11, 0.1]),
    box('front-zip', 'zip', [-0.09, 0.105, 0.1], [0.09, 0.11, 0.102]),
    box('side-pocket', 'pocket', [-0.155, 0.02, -0.05], [-0.13, 0.13, 0.05]),
    box('ring-left', 'buckle', [-0.137, 0.15, -0.01], [-0.13, 0.18, 0.01]),
    box('ring-right', 'buckle', [0.13, 0.15, -0.01], [0.137, 0.18, 0.01]),
    h.stud('stud', 'buckle', 0, 0.15, 0.078),
  ] + grab('handle', 'strap', 0.1, 0.193) + strapBehind('strap', 'strap', 0.3, -0.075, -0.22, 0.035), {
    body: 'nylon-black', flap: 'nylon-black', pocket: 'cloth-charcoal', zip: 'steel-grey', strap: 'webbing-black', buckle: 'plastic-matte-black',
  }) + { voxelGrain: 0.004 },

  // A shaped violin case 800 mm long, 250 mm across the wide end and 120 mm tall, lying flat with its lid closed,
  // a metal-edged seam round it, a side handle and two latches facing +z.
  h.compound('case_violin', 1.5, [
    h.prism('wide', 'shell', 'y', [[-0.09, -0.4], [0.09, -0.4], [0.125, -0.36], [0.125, -0.06], [0.105, -0.02], [-0.105, -0.02], [-0.125, -0.06], [-0.125, -0.36]], 0, 0.12),
    h.prism('narrow', 'shell', 'y', [[-0.105, -0.02], [0.105, -0.02], [0.065, 0.38], [0.04, 0.4], [-0.04, 0.4], [-0.065, 0.38]], 0, 0.12),
    h.prism('seam-wide', 'seam', 'y', [[-0.093, -0.404], [0.093, -0.404], [0.129, -0.362], [0.129, -0.06], [0.109, -0.02], [-0.109, -0.02], [-0.129, -0.06], [-0.129, -0.362]], 0.068, 0.076),
    h.prism('seam-narrow', 'seam', 'y', [[-0.109, -0.02], [0.109, -0.02], [0.069, 0.382], [0.042, 0.404], [-0.042, 0.404], [-0.069, 0.382]], 0.068, 0.076),
    box('handle-a', 'handle', [-0.2, 0.05, 0.125], [-0.19, 0.08, 0.15]),
    box('handle-b', 'handle', [-0.09, 0.05, 0.125], [-0.08, 0.08, 0.15]),
    box('handle-bar', 'handle', [-0.2, 0.05, 0.14], [-0.08, 0.08, 0.155]),
    box('latch-a', 'latch', [-0.33, 0.06, 0.125], [-0.3, 0.085, 0.133]),
    box('latch-b', 'latch', [0.05, 0.06, 0.085], [0.08, 0.085, 0.099]),
    h.prism('lid-ridge', 'shell', 'y', [[-0.07, -0.34], [0.07, -0.34], [0.09, -0.3], [0.09, -0.1], [-0.09, -0.1], [-0.09, -0.3]], 0.12, 0.125),
  ], { shell: 'leather-charcoal', seam: 'steel-bright', handle: 'leather-black', latch: 'steel-bright' }) + { voxelGrain: 0.004 },

  // A slim nylon daypack 300 mm wide, 450 mm tall and 120 mm deep, standing front +z, with a domed top, a zipped
  // front pocket, a grab loop and two thin shoulder straps on its back.
  h.compound('daypack', 0.75, [
    h.prism('body', 'body', 'z', [[-0.15, 0], [0.15, 0], [0.15, 0.37], [0.11, 0.44], [-0.11, 0.44], [-0.15, 0.37]], -0.06, 0.06),
    h.prism('zip', 'trim', 'z', [[-0.153, 0.25], [0.153, 0.25], [0.153, 0.372], [0.112, 0.444], [-0.112, 0.444], [-0.153, 0.372]], -0.004, 0.004),
    h.prism('zip-inner', 'body', 'z', [[-0.149, 0.25], [0.149, 0.25], [0.149, 0.369], [0.109, 0.438], [-0.109, 0.438], [-0.149, 0.369]], -0.005, 0.005),
    box('pocket', 'pocket', [-0.11, 0.04, 0.06], [0.11, 0.24, 0.085]),
    box('pocket-zip', 'trim', [-0.1, 0.225, 0.085], [0.1, 0.23, 0.087]),
    box('pull', 'trim', [0.06, 0.2, 0.085], [0.07, 0.228, 0.089]),
    box('base', 'trim', [-0.152, 0, -0.062], [0.152, 0.02, 0.062]),
  ] + shoulderStraps(0.07, 0.03, 0.42, -0.06, 0.04, 0.012) + grab('loop', 'trim', 0.05, 0.44, -0.03, 0.025, 0.01), {
    body: 'nylon-red', pocket: 'nylon-red', trim: 'nylon-black', strap: 'webbing-black',
  }) + { voxelGrain: 0.004 },

  // A nylon utility bag 250 mm wide, 150 mm tall and 90 mm deep, standing front +z, zipped along the top, with
  // clips at its top corners for a waist strap and webbing rows across its back.
  h.compound('deployment_bag', 0.25, [
    box('body', 'body', [-0.125, 0, -0.045], [0.125, 0.15, 0.045]),
    box('zip', 'zip', [-0.12, 0.15, -0.004], [0.12, 0.154, 0.004]),
    box('pull', 'clip', [0.08, 0.15, 0.004], [0.095, 0.158, 0.012]),
    box('front-panel', 'trim', [-0.11, 0.015, 0.045], [0.11, 0.12, 0.05]),
    box('label', 'clip', [-0.03, 0.08, 0.05], [0.03, 0.1, 0.052]),
    box('clip-left', 'clip', [-0.145, 0.11, -0.02], [-0.125, 0.15, 0.02]),
    box('clip-right', 'clip', [0.125, 0.11, -0.02], [0.145, 0.15, 0.02]),
  ] + h.webbing('back-row', 'trim', -0.11, 0.11, [0.03, 0.065, 0.1], -0.048), {
    body: 'cloth-olive-drab', trim: 'webbing-olive-dark', zip: 'plastic-matte-black', clip: 'plastic-matte-black',
  }) + { voxelGrain: 0.004 },

  // A mesh drawstring bag 400 mm wide and 500 mm long lying flat, its open netting showing the floor, its mouth hem at -z, cords running down both
  // sides to reinforced bottom corners, and a toggle on the cords.
  h.compound('dive_bag', 0.53, [
    box('net-x-%d-%d' % [l, i], 'net', [-0.2, y, -0.21 + i * 0.025], [0.2, y + 0.004, -0.206 + i * 0.025])
    for l in [0, 1]
    for y in [[0, 0.026][l]]
    for i in std.range(0, 19)
  ] + [
    box('net-z-%d-%d' % [l, i], 'net', [-0.19 + i * 0.025, y, -0.21], [-0.186 + i * 0.025, y + 0.004, 0.28])
    for l in [0, 1]
    for y in [[0, 0.026][l]]
    for i in std.range(0, 15)
  ] + [
    box('hem', 'hem', [-0.205, 0, -0.25], [0.205, 0.036, -0.21]),
    box('cord-left', 'cord', [-0.21, 0, -0.25], [-0.2, 0.012, 0.28]),
    box('cord-right', 'cord', [0.2, 0, -0.25], [0.21, 0.012, 0.28]),
    box('corner-left', 'hem', [-0.215, 0, 0.24], [-0.16, 0.034, 0.29]),
    box('corner-right', 'hem', [0.16, 0, 0.24], [0.215, 0.034, 0.29]),
    box('cord-tail-a', 'cord', [-0.04, 0, -0.33], [-0.03, 0.01, -0.25]),
    box('cord-tail-b', 'cord', [0.03, 0, -0.33], [0.04, 0.01, -0.25]),
    box('toggle', 'toggle', [-0.045, 0, -0.31], [0.045, 0.02, -0.285]),
    box('side-left', 'hem', [-0.205, 0, -0.21], [-0.2, 0.03, 0.24]),
    box('side-right', 'hem', [0.2, 0, -0.21], [0.205, 0.03, 0.24]),
  ], { net: 'plastic-hivis', hem: 'nylon-black', cord: 'cord-cotton', toggle: 'plastic-orange' }) + { voxelGrain: 0.004 },

  // A roll-top dry bag 200 mm across and 430 mm tall standing up, its top rolled flat into a band clipped down at
  // both ends, with two shoulder straps on its back.
  h.compound('dry_bag', 0.6, [
    h.turned('body', 'body', 'y', [[0, 0], [0, 0.1], [0.34, 0.1], [0.38, 0.06], [0.38, 0]]),
    box('roll', 'band', [-0.125, 0.36, -0.022], [0.125, 0.41, 0.022]),
    box('clip-left-strap', 'strap', [-0.118, 0.27, -0.012], [-0.104, 0.4, 0.012]),
    box('clip-right-strap', 'strap', [0.104, 0.27, -0.012], [0.118, 0.4, 0.012]),
    box('clip-left', 'clip', [-0.12, 0.23, -0.018], [-0.098, 0.275, 0.018]),
    box('clip-right', 'clip', [0.098, 0.23, -0.018], [0.12, 0.275, 0.018]),
    box('patch', 'band', [-0.04, 0.1, 0.098], [0.04, 0.16, 0.104]),
  ] + shoulderStraps(0.05, 0.03, 0.33, -0.098, 0.035, 0.012), {
    body: 'rubber-yellow', band: 'plastic-charcoal', strap: 'webbing-black', clip: 'plastic-matte-black',
  }) + { voxelGrain: 0.004 },

  // A roll-top dry duffel 650 mm long and 300 mm across lying along x, closed at -x and rolled flat at +x, with two
  // carry handles over the top, lashing cord across it and shoulder straps down its back.
  h.compound('dry_duffelbag', 1.3, [
    lying('body', 'body', 0.15, -0.32, 0.26),
    h.turned('taper', 'body', 'x', [[0, 0], [0, 0.15], [0.05, 0.08], [0.05, 0]], [0.26, 0.15, 0]),
    h.turned('cap', 'end', 'x', [[0, 0], [0, 0.152], [0.015, 0.152], [0.015, 0]], [-0.335, 0.15, 0]),
    box('roll', 'end', [0.3, 0.02, -0.03], [0.35, 0.28, 0.03]),
    box('clip-top', 'clip', [0.29, 0.28, -0.02], [0.33, 0.31, 0.02]),
    box('clip-bottom', 'clip', [0.29, 0.0, 0.03], [0.33, 0.04, 0.07]),
    box('cord-a', 'cord', [-0.15, 0.295, -0.08], [-0.145, 0.302, 0.08]),
    box('cord-b', 'cord', [0.1, 0.295, -0.08], [0.105, 0.302, 0.08]),
    box('cord-x', 'cord', [-0.15, 0.295, -0.003], [0.105, 0.302, 0.003]),
    box('back-strap-a', 'strap', [-0.2, 0.06, -0.165], [-0.15, 0.26, -0.14]),
    box('back-strap-b', 'strap', [0.05, 0.06, -0.165], [0.1, 0.26, -0.14]),
  ] + overHandle('handle-a', 'strap', 0.15, -0.08, 0.035) + overHandle('handle-b', 'strap', 0.15, 0.04, 0.035), {
    body: 'plastic-blue', end: 'plastic-charcoal', clip: 'plastic-matte-black', cord: 'cord-cotton', strap: 'webbing-black',
  }) + { voxelGrain: 0.004 },

  // A canvas duffel 600 mm long and 300 mm across lying along x, zipped along the top, with darker end panels, two
  // carry handles over the top and a shoulder strap lying in front of it.
  h.compound('duffelbag', 0.69, [
    lying('body', 'body', 0.15, -0.28, 0.28),
    lying('end-left', 'end', 0.153, -0.3, -0.28),
    lying('end-right', 'end', 0.153, 0.28, 0.3),
    box('zip', 'zip', [-0.25, 0.296, -0.006], [0.25, 0.302, 0.006]),
    box('pull', 'zip', [0.2, 0.3, 0.006], [0.215, 0.306, 0.025]),
    box('ring-left', 'zip', [-0.31, 0.2, -0.008], [-0.3, 0.24, 0.008]),
    box('ring-right', 'zip', [0.3, 0.2, -0.008], [0.31, 0.24, 0.008]),
    box('strap-front', 'strap', [-0.32, 0, 0.17], [0.32, 0.003, 0.2]),
    box('strap-left', 'strap', [-0.32, 0, 0.0], [-0.29, 0.003, 0.2]),
    box('strap-right', 'strap', [0.29, 0, 0.0], [0.32, 0.003, 0.2]),
    box('pad', 'end', [-0.07, 0, 0.165], [0.07, 0.008, 0.205]),
  ] + overHandle('handle-a', 'handle', 0.15, -0.09, 0.035) + overHandle('handle-b', 'handle', 0.15, 0.09, 0.035), {
    body: 'cloth-canvas', end: 'cloth-khaki', zip: 'steel-grey', strap: 'webbing-olive-dark', handle: 'webbing-olive-dark',
  }) + { voxelGrain: 0.004 },

  // A dump pouch rolled up and stowed: 150 mm wide, 120 mm tall and 60 mm deep, held shut by a hook-and-loop flap,
  // with two webbing straps on its back and a drawcord toggle at the side.
  h.compound('dump_pouch', 0.27, h.pouch(0.15, 0.12, 0.06, 0.05, 2) + [
    box('roll-line-a', 'trim', [-0.075, 0.035, 0.03], [0.075, 0.04, 0.034]),
    box('roll-line-b', 'trim', [-0.075, 0.065, 0.03], [0.075, 0.07, 0.034]),
    box('hook-loop', 'hook', [-0.04, 0.085, 0.033], [0.04, 0.11, 0.035]),
    box('cord', 'cord', [0.075, 0.02, -0.004], [0.08, 0.1, 0.004]),
    box('toggle', 'toggle', [0.075, 0.03, -0.008], [0.088, 0.05, 0.008]),
  ], { body: 'nylon-coyote', flap: 'nylon-coyote', strap: 'webbing-olive-dark', trim: 'webbing-olive-dark', hook: 'hook-loop-grey', cord: 'cord-cotton', toggle: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },

  // A wooden pack frame standing upright: two rails 750 mm tall, 360 mm apart, three cross slats, a load shelf
  // 250 mm deep at the foot facing +z, two lashing straps across the front and shoulder straps behind.
  h.compound('frame_pack', 4.4, [
    box('rail-left', 'rail', [-0.2, 0, -0.02], [-0.16, 0.75, 0.02]),
    box('rail-right', 'rail', [0.16, 0, -0.02], [0.2, 0.75, 0.02]),
    box('slat-top', 'slat', [-0.16, 0.66, -0.012], [0.16, 0.72, 0.008]),
    box('slat-mid', 'slat', [-0.16, 0.4, -0.012], [0.16, 0.46, 0.008]),
    box('slat-low', 'slat', [-0.16, 0.14, -0.012], [0.16, 0.2, 0.008]),
    box('shelf', 'slat', [-0.2, 0, 0.02], [0.2, 0.03, 0.27]),
    box('shelf-lip', 'rail', [-0.2, 0, 0.25], [0.2, 0.05, 0.27]),
    box('brace-left', 'rail', [-0.2, 0.03, 0.02], [-0.17, 0.12, 0.05]),
    box('brace-right', 'rail', [0.17, 0.03, 0.02], [0.2, 0.12, 0.05]),
    box('lash-upper', 'strap', [-0.21, 0.52, 0.02], [0.21, 0.55, 0.026]),
    box('lash-lower', 'strap', [-0.21, 0.27, 0.02], [0.21, 0.3, 0.026]),
    box('buckle-upper', 'buckle', [0.08, 0.515, 0.026], [0.11, 0.555, 0.032]),
    box('buckle-lower', 'buckle', [0.08, 0.265, 0.026], [0.11, 0.305, 0.032]),
  ] + shoulderStraps(0.1, 0.15, 0.68, -0.02, 0.05, 0.015), {
    rail: 'wood-oak', slat: 'wood-pine', strap: 'leather-tan', buckle: 'brass-dull',
  }) + { voxelGrain: 0.008 },

  // A golf bag 250 mm across and 900 mm tall standing on its foot, with a moulded top cuff and dividers, a long
  // front pocket, an umbrella sleeve at its side, two folded stand legs and shoulder straps on its back.
  h.compound('golf_bag', 1.8, [
    h.disc('body', 'body', 0.12, 0.04, 0.82),
    h.disc('foot', 'trim', 0.125, 0, 0.06),
    h.turned('cuff', 'trim', 'y', [[0, 0.11], [0, 0.13], [0.08, 0.13], [0.08, 0.11], [0, 0.11]], [0, 0.82, 0]),
    h.disc('well', 'well', 0.11, 0.86, 0.88),
    box('divider-x', 'trim', [-0.11, 0.86, -0.006], [0.11, 0.895, 0.006]),
    box('divider-z', 'trim', [-0.006, 0.86, -0.11], [0.006, 0.895, 0.11]),
    box('pocket', 'pocket', [-0.07, 0.12, 0.1], [0.07, 0.62, 0.15]),
    box('pocket-zip', 'zip', [-0.065, 0.6, 0.15], [0.065, 0.606, 0.153]),
    box('pocket-top', 'pocket', [-0.06, 0.66, 0.1], [0.06, 0.76, 0.14]),
    h.disc('umbrella', 'pocket', 0.025, 0.1, 0.8, 0.13, 0.0),
    box('leg-left', 'leg', [-0.07, 0.1, -0.135], [-0.06, 0.78, -0.125]),
    box('leg-right', 'leg', [0.06, 0.1, -0.135], [0.07, 0.78, -0.125]),
    box('hinge', 'trim', [-0.08, 0.76, -0.14], [0.08, 0.8, -0.11]),
  ] + shoulderStraps(0.05, 0.3, 0.7, -0.12, 0.04, 0.015), {
    body: 'cloth-navy', trim: 'plastic-charcoal', well: 'velvet-black', pocket: 'leather-white', zip: 'steel-grey', leg: 'steel-bright', strap: 'webbing-black',
  }) + { voxelGrain: 0.008 },

  // A fresh animal hide gathered into a lumpy sack 150 mm across and 200 mm tall, its neck drawn tight with a thong
  // tied in a bow, creases running down from the tie and crumpled flaps of skin closing the mouth above it.
  hide('hide_bag') + { voxelGrain: 0.004 },

  // A hard black briefcase 544 mm wide, 370 mm tall and 110 mm deep standing on its feet, front +z, with a bright
  // seam round it, two latches and a handle with a trigger tucked under it, and a port in its right end.
  h.compound('hk_briefcase', 3.4, [
    box('shell', 'shell', [-0.272, 0.01, -0.055], [0.272, 0.37, 0.055]),
    box('seam', 'seam', [-0.275, 0.008, -0.004], [0.275, 0.373, 0.004]),
    box('rib-front', 'shell', [-0.24, 0.04, 0.055], [0.24, 0.33, 0.059]),
    box('latch-left', 'latch', [-0.17, 0.33, 0.04], [-0.13, 0.36, 0.06]),
    box('latch-right', 'latch', [0.13, 0.33, 0.04], [0.17, 0.36, 0.06]),
    box('trigger', 'trigger', [-0.01, 0.37, -0.006], [0.01, 0.39, 0.006]),
    box('foot-a', 'handle', [-0.22, 0, -0.03], [-0.19, 0.01, 0.03]),
    box('foot-b', 'handle', [0.19, 0, -0.03], [0.22, 0.01, 0.03]),
    h.turned('port', 'port', 'x', [[0, 0], [0, 0.018], [0.002, 0.018], [0.002, 0]], [0.272, 0.2, 0.02]),
  ] + grab('handle', 'handle', 0.13, 0.373, 0, 0.04, 0.015), {
    shell: 'plastic-black', seam: 'steel-grey', latch: 'steel-bright', handle: 'plastic-matte-black', trigger: 'plastic-charcoal', port: 'velvet-black',
  }) + { voxelGrain: 0.004 },

  // A plastic jerrycan 350 mm wide, 470 mm tall and 165 mm deep standing front +z, with three handles across the
  // top, a capped spout at one corner, an X pressed into each face and canvas shoulder straps on its back.
  h.compound('jerrypack', 1.4, [
    h.prism('body', 'body', 'z', [[-0.175, 0], [0.175, 0], [0.175, 0.44], [0.155, 0.46], [-0.155, 0.46], [-0.175, 0.44]], -0.0825, 0.0825),
    h.prism('x-a', 'body', 'z', [[-0.14, 0.04], [-0.11, 0.04], [0.14, 0.4], [0.11, 0.4]], 0.0825, 0.09),
    h.prism('x-b', 'body', 'z', [[0.11, 0.04], [0.14, 0.04], [-0.11, 0.4], [-0.14, 0.4]], 0.0825, 0.09),
    box('rim', 'body', [-0.178, 0.2, -0.085], [0.178, 0.215, 0.085]),
    box('handle-a', 'body', [-0.12, 0.46, -0.06], [-0.1, 0.52, -0.04]),
    box('handle-b', 'body', [-0.12, 0.46, -0.01], [-0.1, 0.52, 0.01]),
    box('handle-c', 'body', [-0.12, 0.46, 0.04], [-0.1, 0.52, 0.06]),
    box('handle-bar', 'body', [-0.12, 0.5, -0.06], [0.04, 0.52, 0.06]),
    box('handle-post', 'body', [0.02, 0.46, -0.06], [0.04, 0.52, 0.06]),
    h.disc('spout', 'cap', 0.025, 0.46, 0.5, 0.12, 0),
    h.disc('cap', 'cap', 0.03, 0.5, 0.53, 0.12, 0),
    box('strap-top', 'strap', [-0.15, 0.36, -0.1], [0.15, 0.39, -0.0825]),
    box('strap-bottom', 'strap', [-0.15, 0.06, -0.1], [0.15, 0.09, -0.0825]),
  ] + shoulderStraps(0.08, 0.05, 0.42, -0.1, 0.045, 0.015), {
    body: 'plastic-red', cap: 'plastic-matte-black', strap: 'cloth-khaki',
  }) + { voxelGrain: 0.004 },
]
