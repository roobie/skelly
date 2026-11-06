local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
// A press stud on the front face at (x, y), standing `t` proud of the face at `z`.
local stud(id, slot, x, y, z, r=0.007, t=0.004) = turned(id, slot, 'z', [[0, 0], [0, r], [t * 0.5, r], [t, r * 0.6], [t, 0]], [x, y, z]);
// A closed pouch standing on y, `w` along x, `d` deep along z with its front on +z, under a flap that wraps the
// top and comes `flap` down the front. `back` vertical webbing straps on the back thread it onto a belt or vest.
// Slots: body, flap, strap.
local pouch(w, ht, d, flap, back=2, t=0.003) = [
  box('body', 'body', [-w / 2, 0, -d / 2], [w / 2, ht, d / 2]),
  box('flap-top', 'flap', [-w / 2 - t, ht, -d / 2], [w / 2 + t, ht + t, d / 2 + t]),
  box('flap-front', 'flap', [-w / 2 - t, ht - flap, d / 2], [w / 2 + t, ht, d / 2 + t]),
] + [
  box('back-strap-%d' % i, 'strap', [x - 0.0125, ht * 0.15, -d / 2 - 0.004], [x + 0.0125, ht * 0.95, -d / 2])
  for i in std.range(0, back - 1)
  for x in [if back == 1 then 0 else -w * 0.25 + i * w * 0.5 / (back - 1)]
];
// Horizontal webbing rows across a face at z, for attaching more pouches.
local webbing(prefix, slot, x0, x1, ys, z, t=0.003) = [
  box('%s-%d' % [prefix, i], slot, [x0, ys[i], z], [x1, ys[i] + 0.025, z + t])
  for i in std.range(0, std.length(ys) - 1)
];
// A loose strap dropped behind a pouch, lying flat on the floor in a U from z = `z0` back to `z1`, `w` across and
// webbing `s` wide.
local strapBehind(prefix, slot, w, z0, z1, s) = [
  box(prefix + '-back', slot, [-w / 2, 0, z1], [w / 2, 0.003, z1 + s]),
  box(prefix + '-left', slot, [-w / 2, 0, z1], [-w / 2 + s, 0.003, z0]),
  box(prefix + '-right', slot, [w / 2 - s, 0, z1], [w / 2, 0.003, z0]),
];
// A belt loop lying flat: a webbing tab `l` long along x and `w` wide, with a loop of webbing standing on its middle
// to take a tool's handle, and a press stud closing the tab. Slots: strap, loop, stud.
local beltLoop(id, massKg, l, w, r) = h.compound(id, massKg, [
  box('tab', 'strap', [-l / 2, 0, -w / 2], [l / 2, 0.003, w / 2]),
  h.tube('loop', 'loop', r, r + 0.003, -w * 0.4, w * 0.4, r + 0.003, 0),
  box('fold', 'strap', [l / 2 - 0.012, 0.003, -w / 2], [l / 2, 0.006, w / 2]),
  h.disc('stud', 'stud', w * 0.22, 0.006, 0.009, l / 2 - 0.006, 0),
  h.disc('socket', 'stud', w * 0.22, 0.003, 0.006, -l / 2 + 0.008, 0),
], { strap: 'cloth-olive-drab', loop: 'cloth-olive-drab', stud: 'plastic-black' });
// A waist satchel standing up with its strap buckled round it for carrying. Slots: body, flap, strap, fastener.
local satchel(id, massKg, cloth, fastener) = h.compound(id, massKg, pouch(0.2, 0.15, 0.06, 0.075, 0) + [
  box('gusset-left', 'flap', [-0.103, 0, -0.03], [-0.1, 0.15, 0.03]),
  box('gusset-right', 'flap', [0.1, 0, -0.03], [0.103, 0.15, 0.03]),
  box('strap-up-left', 'strap', [-0.107, 0.01, -0.015], [-0.103, 0.157, 0.015]),
  box('strap-up-right', 'strap', [0.103, 0.01, -0.015], [0.107, 0.157, 0.015]),
  box('strap-over', 'strap', [-0.107, 0.153, -0.015], [0.107, 0.157, 0.015]),
  box('fastener', 'fastener', [-0.012, 0.09, 0.033], [0.012, 0.11, 0.037]),
], { body: cloth, flap: cloth, strap: cloth, fastener: fastener });
// A tall single-magazine pouch standing up, its neck harness laid flat on the floor beside it in a closed loop.
// Slots: body, flap, strap, fastener.
local chestPouch(id, massKg, cloth, strap, fastener) = h.compound(id, massKg, pouch(0.09, 0.2, 0.045, 0.06, 1) + [
  stud('fastener', 'fastener', 0, 0.165, 0.0255),
] + h.strapLoop('harness', 'strap', 0.08, 0.045, 0.02, 0.003, 0, 0.155, 0), { body: cloth, flap: cloth, strap: strap, fastener: fastener });
// Rows of PALS webbing on a flat panel from x0 to x1 and down from z0, `rows` rows 25 mm wide every 38 mm, cut into
// 38 mm channels, standing on height y.
local molle(id, x0, x1, z0, rows, y) = [
  box('%s-%d-%d' % [id, i, j], 'webbing', [x0 + j * 0.038 + 0.002, y, z0 + i * 0.038], [x0 + (j + 1) * 0.038 - 0.002, y + 0.004, z0 + i * 0.038 + 0.025])
  for i in std.range(0, rows - 1)
  for j in std.range(0, std.floor((x1 - x0) / 0.038) - 1)
];
[
  // A leather belt pouch 150 mm wide, 110 mm tall and 50 mm deep, with a flap closed by a press stud and a belt
  // loop sewn to its back.
  h.compound('ammo_pouch', 0.13, pouch(0.15, 0.11, 0.05, 0.05, 1) + [
    stud('stud', 'stud', 0, 0.08, 0.028),
  ], { body: 'leather-brown', flap: 'leather-brown', strap: 'leather-black', stud: 'brass' })
  + { voxelGrain: 0.002 },

  // A canvas satchel 200 mm wide, 150 mm tall and 60 mm deep, sized for one long magazine, with a buckled flap and
  // a waist strap lying coiled round it.
  satchel('ammo_satchel', 0.18, 'cloth-canvas', 'steel-grey') + { voxelGrain: 0.004 },

  // The same satchel in heavy leather with a brass buckle.
  satchel('ammo_satchel_leather', 0.6, 'leather-brown', 'brass') + { voxelGrain: 0.004 },

  // A webbing tab 160 mm long and 50 mm wide with a loop 60 mm across for an axe or a long tool's handle.
  beltLoop('belt_loop_large', 0.015, 0.16, 0.05, 0.03) + { voxelGrain: 0.002 },

  // A webbing tab 120 mm long and 40 mm wide with a loop 40 mm across for a hammer or a knife.
  beltLoop('belt_loop_medium', 0.008, 0.12, 0.04, 0.02) + { voxelGrain: 0.002 },

  // A webbing tab 90 mm long and 25 mm wide with a loop 24 mm across for a screwdriver or a torch.
  beltLoop('belt_loop_small', 0.004, 0.09, 0.025, 0.012) + { voxelGrain: 0.002 },

  // A square nylon pouch 140 mm wide, 170 mm tall and 90 mm deep for a one-litre canteen, with a snapped flap and
  // two webbing straps on its back.
  h.compound('canteen_pouch', 0.18, pouch(0.14, 0.17, 0.09, 0.06) + [
    stud('stud', 'stud', 0, 0.14, 0.048),
    box('side-pocket', 'body', [0.07, 0.02, -0.025], [0.09, 0.09, 0.025]),
  ], { body: 'cloth-olive-drab', flap: 'cloth-olive-drab', strap: 'polymer-od-green', stud: 'plastic-black' })
  + { voxelGrain: 0.004 },

  // A canvas pouch 90 mm wide, 200 mm tall and 45 mm deep for one rifle magazine, with a snapped flap and a harness
  // strap lying round it.
  chestPouch('chestpouch', 0.075, 'cloth-canvas', 'cloth-khaki', 'steel-grey') + { voxelGrain: 0.004 },

  // The same chest pouch in thick leather with a leather harness.
  chestPouch('chestpouch_leather', 0.5, 'leather-brown', 'leather-black', 'brass') + { voxelGrain: 0.004 },

  // A canvas chest rig lying flat: four magazine pouches 70 mm wide and 160 mm long in a row 320 mm across, on a
  // back panel, with two shoulder straps crossing behind and a waist strap either side.
  h.compound('chestrig', 0.22, [
    box('panel', 'body', [-0.17, 0, -0.1], [0.17, 0.006, 0.08]),
  ] + std.flattenArrays([
    [
      box('pouch-%d' % i, 'body', [x - 0.035, 0.006, -0.085], [x + 0.035, 0.04, 0.075]),
      box('flap-%d' % i, 'flap', [x - 0.037, 0.04, -0.087], [x + 0.037, 0.043, -0.02]),
      h.disc('stud-%d' % i, 'stud', 0.006, 0.043, 0.046, x, -0.035),
    ]
    for i in std.range(0, 3)
    for x in [-0.12 + i * 0.08]
  ]) + [
    h.prism('shoulder-left', 'strap', 'y', [[-0.1, -0.15], [-0.1, -0.12], [-0.32, 0.06], [-0.32, 0.03]], 0, 0.004),
    h.prism('shoulder-right', 'strap', 'y', [[-0.1, 0.12], [-0.1, 0.15], [-0.32, -0.03], [-0.32, -0.06]], 0, 0.004),
    box('waist-left', 'strap', [-0.32, 0, 0.02], [-0.17, 0.004, 0.05]),
    box('waist-right', 'strap', [0.17, 0, 0.02], [0.32, 0.004, 0.05]),
    box('buckle', 'stud', [0.3, 0.004, 0.015], [0.33, 0.01, 0.055]),
  ], { body: 'cloth-canvas', flap: 'cloth-canvas', strap: 'cloth-khaki', stud: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A small nylon pouch 50 mm wide, 130 mm tall and 45 mm deep that takes one torch, with a snapped flap.
  h.compound('flashlight_pouch', 0.031, pouch(0.05, 0.13, 0.045, 0.04, 1) + [
    stud('stud', 'stud', 0, 0.11, 0.0255, 0.006),
  ], { body: 'cloth-olive-drab', flap: 'cloth-olive-drab', strap: 'polymer-od-green', stud: 'plastic-black' })
  + { voxelGrain: 0.002 },

  // A nylon utility pouch 120 mm wide, 150 mm tall and 60 mm deep with a hook-and-loop flap and a row of webbing
  // across its front.
  h.compound('gadget_pouch', 0.11, pouch(0.12, 0.15, 0.06, 0.05) + webbing('front-row', 'strap', -0.06, 0.06, [0.03], 0.03), {
    body: 'cloth-olive-drab',
    flap: 'cloth-olive-drab',
    strap: 'polymer-od-green',
  })
  + { voxelGrain: 0.004 },

  // A drop-leg nylon pouch 180 mm wide, 230 mm tall and 110 mm deep, big enough for a mask and a spare filter, with
  // a buckled flap and a thigh strap lying round it.
  h.compound('gas_mask_pouch', 0.37, pouch(0.18, 0.23, 0.11, 0.08) + [
    box('buckle', 'buckle', [-0.02, 0.16, 0.058], [0.02, 0.19, 0.064]),
    box('hanger', 'strap', [-0.02, 0.23, -0.059], [0.02, 0.3, -0.055]),
  ] + strapBehind('thigh', 'strap', 0.2, -0.059, -0.14, 0.035), {
    body: 'cloth-olive-drab',
    flap: 'cloth-olive-drab',
    strap: 'polymer-od-green',
    buckle: 'plastic-black',
  })
  + { voxelGrain: 0.004 },

  // A round nylon bottle pouch 90 mm across and 230 mm tall with a drawcord top and a flat pocket on its front.
  h.compound('h2o_pouch', 0.14, [
    h.disc('body', 'body', 0.045, 0, 0.23),
    h.disc('cuff', 'flap', 0.047, 0.2, 0.23),
    h.disc('toggle', 'stud', 0.008, 0.23, 0.245, 0.03, 0.02),
    box('pocket', 'flap', [-0.035, 0.03, 0.035], [0.035, 0.14, 0.058]),
    box('pocket-flap', 'flap', [-0.037, 0.11, 0.055], [0.037, 0.143, 0.061]),
    box('back-strap', 'strap', [-0.0125, 0.04, -0.05], [0.0125, 0.21, -0.042]),
  ], { body: 'cloth-olive-drab', flap: 'polymer-od-green', strap: 'polymer-od-green', stud: 'plastic-black' })
  + { voxelGrain: 0.004 },

  // A heavy webbing vest laid flat, front up with its neck at -z: 520 mm wide and 560 mm long, two padded front
  // panels covered in rows of webbing and closed by two buckles, padded shoulder straps and a padded cummerbund
  // either side.
  local w = 0.52, l = 0.56, t = 0.022, top = -0.08;
  h.compound('heavy_load_bearing_vest', 1.5, [
    box('back', 'body', [-w / 2, 0, top], [w / 2, 0.006, l / 2]),
    box('yoke', 'body', [-0.17, 0, -l / 2 + 0.06], [0.17, 0.006, top]),
    box('shoulder-l', 'body', [-0.17, 0.004, -l / 2], [-0.08, t, top + 0.01]),
    box('shoulder-r', 'body', [0.08, 0.004, -l / 2], [0.17, t, top + 0.01]),
    box('front-l', 'body', [-w / 2, 0.004, top], [-0.012, t, l / 2]),
    box('front-r', 'body', [0.012, 0.004, top], [w / 2, t, l / 2]),
    box('buckle-a', 'buckle', [-0.022, t, top + 0.04], [0.022, t + 0.008, top + 0.06]),
    box('buckle-b', 'buckle', [-0.022, t, l / 2 - 0.06], [0.022, t + 0.008, l / 2 - 0.04]),
    box('wing-l', 'body', [-w / 2 - 0.08, 0.002, 0.02], [-w / 2, t * 0.6, l / 2 - 0.02]),
    box('wing-r', 'body', [w / 2, 0.002, 0.02], [w / 2 + 0.08, t * 0.6, l / 2 - 0.02]),
    box('drag-handle', 'webbing', [-0.05, 0, -l / 2 - 0.03], [0.05, 0.014, -l / 2 + 0.03]),
  ]
  + molle('webbing-l', -w / 2 + 0.02, -0.03, top + 0.012, 8, t)
  + molle('webbing-r', 0.03, w / 2 - 0.02, top + 0.012, 8, t)
  + molle('wing-webbing-l', -w / 2 - 0.078, -w / 2 - 0.002, 0.04, 5, t * 0.6)
  + molle('wing-webbing-r', w / 2 + 0.002, w / 2 + 0.078, 0.04, 5, t * 0.6),
  { body: 'cloth-olive-drab', webbing: 'webbing-olive-dark', buckle: 'plastic-black' })
  + { voxelGrain: 0.004 },
]
