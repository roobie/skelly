local h = import '../compound.libsonnet';
local box = h.box;
// A ring of bore `r` lying on a strap face at `y`, its bore along z from `z0`, for one round lying across the strap.
local loop(id, slot, x, y, z0, r, len, wall=0.003) =
  h.turned(id, slot, 'z', [[0, r], [0, r + wall], [len, r + wall], [len, r], [0, r]], [x, y + r, z0]);
// A soft pouch for a coiled machine-gun belt: a flapped box with a fastener tab down the front, a slit at one side
// where the belt end feeds out, and two straps on its back. Slots: body, flap, strap, fastener.
local beltPouch(id, massKg, w, ht, d) = h.compound(id, massKg, h.pouch(w, ht, d, ht * 0.45) + [
  box('tab', 'flap', [-0.015, ht * 0.4, d / 2 + 0.003], [0.015, ht, d / 2 + 0.006]),
  box('fastener', 'fastener', [-0.012, ht * 0.42, d / 2 + 0.006], [0.012, ht * 0.5, d / 2 + 0.01]),
  box('feed-slit', 'fastener', [w / 2, ht * 0.35, -d * 0.3], [w / 2 + 0.002, ht * 0.75, d * 0.3]),
] + h.webbing('front-row', 'strap', -w / 2, w / 2, [ht * 0.12], d / 2), {
  body: 'cloth-olive-drab',
  flap: 'cloth-olive-drab',
  strap: 'webbing-olive-dark',
  fastener: 'plastic-matte-black',
});
// A stone pouch: a flapped box with a doubled foot, a press stud and one strap on its back. Slots: body,
// flap, foot, strap, stud.
local stonePouch(id, massKg, cloth, leather, stud) = h.compound(id, massKg, h.pouch(0.12, 0.13, 0.065, 0.06, 1) + [
  box('foot', 'foot', [-0.0615, 0, -0.0335], [0.0615, 0.03, 0.0355]),
  h.stud('stud', 'stud', 0, 0.1, 0.0355),
], { body: cloth, flap: leather, foot: leather, strap: leather, stud: stud });
// A bandolier lying flat as a flattened loop `l` long and `s` wide, strap `w` wide, a buckle at one end and `n`
// empty loops of radius `r` along the front run. Slots: strap, loop, buckle.
local bandolier(id, massKg, l, s, w, n, r, pitch) = h.compound(id, massKg, [
  box('run-front', 'strap', [-l / 2, 0, s / 2 - w], [l / 2, 0.004, s / 2]),
  box('run-back', 'strap', [-l / 2, 0, -s / 2], [l / 2, 0.004, -s / 2 + w]),
] + std.flattenArrays([
  [
    // A prism on y takes its outline as [z, x] pairs.
    h.prism('end-%d-front' % i, 'strap', 'y', [[s / 2, e], [w * 0.5, e + sg * s * 0.3], [-w * 0.5, e + sg * s * 0.3], [s / 2 - w, e]], 0, 0.004),
    h.prism('end-%d-back' % i, 'strap', 'y', [[-s / 2, e], [-w * 0.5, e + sg * s * 0.3], [w * 0.5, e + sg * s * 0.3], [-s / 2 + w, e]], 0, 0.004),
  ]
  for i in [0, 1]
  for sg in [[-1, 1][i]]
  for e in [sg * l / 2]
]) + [
  box('buckle', 'buckle', [l / 2 - 0.01, 0.004, -s / 2 - 0.004], [l / 2 + 0.01, 0.01, -s / 2 + w + 0.004]),
  box('buckle-tongue', 'strap', [l / 2 + 0.01, 0, -s / 2 + 0.006], [l / 2 + 0.05, 0.005, -s / 2 + w - 0.006]),
] + [
  loop('loop-%d' % i, 'loop', -(n - 1) * pitch / 2 + i * pitch, 0.004, s / 2 - w, r, w)
  for i in std.range(0, n - 1)
], { strap: 'leather-brown', loop: 'leather-black', buckle: 'brass' });
[
  // A cotton pouch 150 mm wide, 130 mm tall and 80 mm deep that holds a coiled belt of 200 rifle rounds for a light
  // machine gun.
  beltPouch('cheap_ammo_pouch_belt223', 0.059, 0.15, 0.13, 0.08) + { voxelGrain: 0.004 },

  // The same cotton pouch made larger, 190 mm wide, 150 mm tall and 95 mm deep, for a belt of 100 heavier rounds.
  beltPouch('cheap_ammo_pouch_belt308', 0.094, 0.19, 0.15, 0.095) + { voxelGrain: 0.004 },

  // A leather cartridge box 180 mm wide, 110 mm tall and 55 mm deep with a deep flap over its whole front, a round
  // brass plate on the flap, a closing tab with a stud below it and two belt loops on its back.
  h.compound('flintlock_pouch', 0.35, h.pouch(0.18, 0.11, 0.055, 0.1, 2) + [
    h.turned('plate', 'plate', 'z', [[0, 0], [0, 0.022], [0.003, 0.022], [0.003, 0]], [0, 0.065, 0.0305]),
    box('tab', 'strap', [-0.008, 0, 0.0305], [0.008, 0.022, 0.0335]),
    h.stud('stud', 'plate', 0, 0.009, 0.0335, 0.005),
  ], { body: 'leather-black', flap: 'leather-black', strap: 'leather-brown', plate: 'brass' })
  + { voxelGrain: 0.002 },

  // A two-cell nylon pouch 100 mm wide, 120 mm tall and 50 mm deep, each cell taking one 40 mm grenade cartridge
  // under its own snapped flap, with one strap on its back.
  h.compound('grenade_pouch', 0.08, [
    box('back', 'strap', [-0.05, 0.005, -0.028], [0.05, 0.11, -0.025]),
    box('back-strap', 'strap', [-0.0125, 0.02, -0.032], [0.0125, 0.115, -0.028]),
  ] + std.flattenArrays([
    [
      h.disc('cell-%d' % i, 'body', 0.024, 0, 0.12, x, 0),
      box('flap-%d' % i, 'flap', [x - 0.025, 0.12, -0.025], [x + 0.025, 0.124, 0.027]),
      box('flap-front-%d' % i, 'flap', [x - 0.012, 0.085, 0.024], [x + 0.012, 0.124, 0.027]),
      h.stud('stud-%d' % i, 'stud', x, 0.095, 0.027, 0.005),
    ]
    for i in [0, 1]
    for x in [[-0.025, 0.025][i]]
  ]), { body: 'cloth-olive-drab', flap: 'webbing-olive-dark', strap: 'webbing-olive-dark', stud: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },

  // A nylon pouch 330 mm wide, 170 mm tall and 85 mm deep: four round cells on a shared back panel, each taking one
  // hand grenade under a buckled lid, with two straps on its back.
  h.compound('grenadebandolier', 0.25, [
    box('panel', 'strap', [-0.165, 0.01, -0.045], [0.165, 0.16, -0.04]),
  ] + h.webbing('back-strap', 'strap', -0.165, 0.165, [0.03, 0.11], -0.05, 0.005) + std.flattenArrays([
    [
      h.disc('cell-%d' % i, 'body', 0.04, 0, 0.15, x, 0),
      h.disc('lid-%d' % i, 'flap', 0.042, 0.15, 0.17, x, 0),
      box('lid-strap-%d' % i, 'flap', [x - 0.01, 0.1, 0.038], [x + 0.01, 0.17, 0.044]),
      box('buckle-%d' % i, 'buckle', [x - 0.012, 0.1, 0.044], [x + 0.012, 0.118, 0.048]),
    ]
    for i in std.range(0, 3)
    for x in [-0.12 + i * 0.08]
  ]), { body: 'nylon-coyote', flap: 'nylon-coyote', strap: 'webbing-olive-dark', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A heavy leather pouch 120 mm wide, 130 mm tall and 65 mm deep for throwing stones, with a rounded doubled foot,
  // a flap and a brass stud.
  stonePouch('leather_stone_pouch', 0.36, 'leather-brown', 'leather-black', 'brass') + { voxelGrain: 0.002 },

  // The same pouch in cotton duck with a leather flap, foot and strap.
  stonePouch('stone_pouch', 0.11, 'cloth-canvas', 'leather-brown', 'steel-grey') + { voxelGrain: 0.002 },

  // A leather bandolier about 1.2 m round, lying flat as a loop 560 mm long, its 65 mm strap carrying eight loops for
  // 40 mm grenade cartridges.
  bandolier('torso_bandolier_grenade', 0.4, 0.44, 0.2, 0.065, 8, 0.021, 0.05) + { voxelGrain: 0.004 },

  // A leather bandolier about 1.3 m round, lying flat as a loop 640 mm long, its 50 mm strap carrying 18 shell loops.
  bandolier('torso_bandolier_shotgun', 0.28, 0.52, 0.2, 0.05, 18, 0.0105, 0.027) + { voxelGrain: 0.004 },
]
