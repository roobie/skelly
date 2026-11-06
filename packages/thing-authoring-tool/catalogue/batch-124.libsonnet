local h = import '../compound.libsonnet';
local box = h.box;
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);

// Finger columns as [x offset from the hand's middle at the knuckle, length, splay], index finger nearest the thumb.
// The splay fans each finger out by that share of its length, so the fingers stand apart in the tiles.
local fingers = [[0.028, 0.074, 0.12], [0.009, 0.084, 0.04], [-0.01, 0.078, -0.05], [-0.029, 0.062, -0.14]];
local knuckleZ = 0.088;
// A strip `w` wide along finger i, from share a to share b of its length, lying from y0 to y1.
local onFinger(id, slot, cx, s, i, a, b, w, y0, y1) =
  local fx = fingers[i][0], fl = fingers[i][1], sp = fingers[i][2];
  local at(k) = [knuckleZ + k * fl, cx + s * (fx + sp * k * fl)];
  local p0 = at(a), p1 = at(b);
  h.prism(id, slot, 'y', [[p0[0], p0[1] - w / 2], [p0[0], p0[1] + w / 2], [p1[0], p1[1] + w / 2], [p1[0], p1[1] - w / 2]], y0, y1);

// One glove lying back up, fingers towards +z, thumb out to side s, centred on cx. `o` sets the cloth thickness `t`,
// the cuff length and flare, `reach` (1 for full fingers, less for fingerless) and the slots of the fingers and thumb.
// Prism outlines are [z, x]. Slots: glove, cuff, and whatever `fingerSlot` and `thumbSlot` name.
local defaults = { t: 0.016, cuff: 0.06, flare: 0.052, reach: 1, fingerSlot: 'glove', thumbSlot: 'glove', fingerW: 0.017 };
local glove(p, cx, s, o={}) =
  local c = defaults + o;
  local x(v) = cx + s * v;
  local f = c.reach;
  [
    sbox(p + 'palm', 'glove', [x(-0.045), 0, -0.02], [x(0.045), c.t, 0.09]),
    h.prism(p + 'cuff', 'cuff', 'y', [[-0.015 - c.cuff, x(-c.flare)], [-0.015 - c.cuff, x(c.flare)], [-0.015, x(0.046)], [-0.015, x(-0.046)]], 0, c.t * 0.9),
    h.prism(p + 'thumb', c.thumbSlot, 'y', [
      [-0.01, x(0.04)],
      [0.03, x(0.045)],
      [0.03 + f * 0.055, x(0.045 + f * 0.04)],
      [0.005 + f * 0.065, x(0.06 + f * 0.04)],
      [0.005, x(0.06)],
    ], 0, c.t * 0.9),
  ] + [
    onFinger(p + 'finger-%d' % i, c.fingerSlot, cx, s, i, -0.01, f, c.fingerW, 0, c.t * 0.85)
    for i in std.range(0, 3)
  ];
local pair(parts, gap=0.07) = parts('l-', -gap, -1) + parts('r-', gap, 1);

// Raised strips across the cuff from z0 towards the wrist, for ribbed knit and gathered elastic.
local ribs(p, slot, cx, half, z0, z1, n, y) = [
  box(p + 'rib-%d' % i, slot, [cx - half, y, z0 + (z1 - z0) * i / n], [cx + half, y + 0.003, z0 + (z1 - z0) * i / n + (z1 - z0) / n * 0.5])
  for i in std.range(0, n - 1)
];

// Steel gauntlet over a leather glove: a crowned plate over the back of the hand, two knuckle lames, three lames down
// each finger, a flared steel cuff and rivets. Slots: glove, cuff, plate, rivet.
local gauntlet(p, cx, s) =
  local t = 0.018, x(v) = cx + s * v;
  glove(p, cx, s, { t: t, cuff: 0.11, flare: 0.065 })
  + h.curvedPlate(p + 'back', 'plate', [[-0.047, -0.016], [0.047, -0.016], [0.047, 0.07], [-0.047, 0.07]], t, 0.003, 0.08, 6, cx)
  + h.curvedPlate(p + 'knuckle-a', 'plate', [[-0.048, 0.068], [0.048, 0.068], [0.046, 0.082], [-0.046, 0.082]], t, 0.003, 0.08, 6, cx)
  + h.curvedPlate(p + 'knuckle-b', 'plate', [[-0.047, 0.08], [0.047, 0.08], [0.045, 0.094], [-0.045, 0.094]], t + 0.002, 0.003, 0.08, 6, cx)
  + h.curvedPlate(p + 'cuff-plate', 'plate', [[-0.068, -0.125], [0.068, -0.125], [0.05, -0.018], [-0.05, -0.018]], 0.004, 0.003, 0.07, 6, cx)
  + std.flattenArrays([
    [
      onFinger(p + 'finger-%d-lame-%d' % [i, k], 'plate', cx, s, i, 0.06 + k * 0.32, 0.34 + k * 0.32, 0.02, t * 0.85, t * 0.85 + 0.004)
      for k in [0, 1, 2]
    ]
    for i in std.range(0, 3)
  ])
  + [
    h.prism(p + 'thumb-lame', 'plate', 'y', [[0.032, x(0.046)], [0.07, x(0.07)], [0.064, x(0.082)], [0.026, x(0.058)]], t * 0.9, t * 0.9 + 0.004),
  ]
  + [
    sbox(p + 'rivet-%d' % i, 'rivet', [x(v - 0.003), h.curvedTopAt([[-0.047, -0.016], [0.047, -0.016]], t, 0.003, 0.08, v), -0.008], [x(v + 0.003), h.curvedTopAt([[-0.047, -0.016], [0.047, -0.016]], t, 0.003, 0.08, v) + 0.003, -0.002])
    for i in [0, 1, 2]
    for v in [[-0.035, 0, 0.035][i]]
  ];

// A long kitchen glove: thin rubber, a cuff to mid-forearm with a rolled lip at its mouth and grip ridges across the
// fingertips. Slots: glove, cuff, lip.
local rubberGlove(p, cx, s) =
  local x(v) = cx + s * v;
  glove(p, cx, s, { t: 0.01, cuff: 0.17, flare: 0.07, fingerW: 0.018 })
  + [sbox(p + 'lip', 'lip', [x(-0.074), 0, -0.19], [x(0.074), 0.012, -0.182])]
  + [
    onFinger(p + 'grip-%d-%d' % [i, k], 'lip', cx, s, i, 0.9 - k * 0.09, 0.94 - k * 0.09, 0.018, 0.0085, 0.0105)
    for i in std.range(0, 3)
    for k in [0, 1, 2]
  ];

// A thin costume glove with the bones of the hand printed on its back: wrist bones, four hand bones fanning to the
// knuckles, three bones down each finger and two down the thumb. Slots: glove, cuff, print.
local skeletonGlove(p, cx, s) =
  local t = 0.008, x(v) = cx + s * v, y0 = t, y1 = t + 0.0015;
  glove(p, cx, s, { t: t, cuff: 0.045, flare: 0.05 })
  + [
    sbox(p + 'carpal-a', 'print', [x(-0.03), y0, -0.012], [x(0.01), y1, 0.0]),
    sbox(p + 'carpal-b', 'print', [x(0.014), y0, -0.012], [x(0.03), y1, 0.004]),
  ] + std.flattenArrays([
    local fx = fingers[i][0];
    [sbox(p + 'meta-%d' % i, 'print', [x(fx * 0.75 - 0.003), y0, 0.008], [x(fx - 0.001), y1, 0.08])]
    + [
      onFinger(p + 'bone-%d-%d' % [i, k], 'print', cx, s, i, 0.06 + k * 0.32, 0.3 + k * 0.32, 0.007, t * 0.85, t * 0.85 + 0.0015)
      for k in [0, 1, 2]
    ]
    for i in std.range(0, 3)
  ]) + [
    h.prism(p + 'thumb-bone-a', 'print', 'y', [[0.004, x(0.044)], [0.034, x(0.054)], [0.031, x(0.06)], [0.002, x(0.05)]], t * 0.9, t * 0.9 + 0.0015),
    h.prism(p + 'thumb-bone-b', 'print', 'y', [[0.042, x(0.058)], [0.068, x(0.074)], [0.064, x(0.08)], [0.04, x(0.064)]], t * 0.9, t * 0.9 + 0.0015),
  ];

// A duty glove: fabric back, a moulded hard knuckle shell, padded strips over the finger joints and a hook-and-loop
// wrist strap. Slots: glove, cuff, shell, pad, strap.
local tacticalGlove(p, cx, s) =
  local t = 0.016, x(v) = cx + s * v;
  glove(p, cx, s, { t: t, cuff: 0.05, flare: 0.05 })
  + h.curvedPlate(p + 'shell', 'shell', [[-0.046, 0.06], [0.046, 0.06], [0.044, 0.088], [-0.044, 0.088]], t, 0.006, 0.07, 5, cx)
  + [
    onFinger(p + 'pad-%d' % i, 'pad', cx, s, i, 0.32, 0.55, 0.018, t * 0.85, t * 0.85 + 0.004)
    for i in std.range(0, 3)
  ] + [
    sbox(p + 'strap', 'strap', [x(-0.052), t * 0.9, -0.05], [x(0.05), t * 0.9 + 0.004, -0.03]),
    sbox(p + 'tab', 'shell', [x(-0.06), t * 0.9, -0.052], [x(-0.044), t * 0.9 + 0.006, -0.028]),
  ];

// A plain cotton dress glove with three raised stitch lines down the back and a snap at the wrist. Slots: glove,
// cuff, stitch, snap.
local whiteGlove(p, cx, s) =
  local t = 0.01, x(v) = cx + s * v;
  glove(p, cx, s, { t: t, cuff: 0.05, flare: 0.05 })
  + [
    sbox(p + 'stitch-%d' % i, 'stitch', [x(v - 0.0015), t, 0.02], [x(v + 0.0015), t + 0.002, 0.08])
    for i in [0, 1, 2]
    for v in [[-0.02, 0.0, 0.02][i]]
  ] + [h.disc(p + 'snap', 'snap', 0.005, t * 0.9, t * 0.9 + 0.003, x(0.03), -0.04)];

// A padded winter glove: thick insulated shell quilted across the back in baffles, puffed fingers and a long gathered
// knit cuff. Slots: glove, cuff, quilt.
local winterGlove(p, cx, s) =
  local t = 0.03, x(v) = cx + s * v;
  glove(p, cx, s, { t: t, cuff: 0.07, flare: 0.054, fingerW: 0.019 })
  + [
    sbox(p + 'baffle-%d' % i, 'quilt', [x(-0.046), t, -0.012 + i * 0.026], [x(0.046), t + 0.005, -0.012 + i * 0.026 + 0.018])
    for i in std.range(0, 3)
  ] + ribs(p, 'cuff', cx, 0.052, -0.08, -0.02, 6, t * 0.9);

// A knitted wool glove with a ribbed cuff; `reach` cuts the fingers short for the fingerless pair, which then shows a
// ribbed band round each finger's open end. Slots: glove, cuff, rib.
local woolGlove(reach) = function(p, cx, s)
  local t = 0.014, x(v) = cx + s * v;
  glove(p, cx, s, { t: t, cuff: 0.07, flare: 0.05, reach: reach })
  + ribs(p, 'rib', cx, 0.05, -0.083, -0.02, 7, t * 0.9)
  + (if reach < 1 then [
       onFinger(p + 'end-%d' % i, 'rib', cx, s, i, reach - 0.08, reach, 0.02, 0, t * 0.85 + 0.002)
       for i in std.range(0, 3)
     ] + [
       // The thumb's band, between its two long edges from share reach - 0.12 to reach.
       local ea(k) = [0.03 + k * 0.055, x(0.045 + k * 0.04)], eb(k) = [0.005 + k * 0.065, x(0.06 + k * 0.04)];
       h.prism(p + 'thumb-end', 'rib', 'y', [ea(reach - 0.12), ea(reach), eb(reach), eb(reach - 0.12)], 0, t * 0.9 + 0.002),
     ]
     else []);

// A work glove: canvas back, leather fingers, thumb and a leather strip across the knuckles, and a stiff safety cuff
// bound at its edge. Slots: glove, cuff, leather, binding.
local workGlove(p, cx, s) =
  local t = 0.018, x(v) = cx + s * v;
  glove(p, cx, s, { t: t, cuff: 0.07, flare: 0.06, fingerSlot: 'leather', thumbSlot: 'leather', fingerW: 0.018 })
  + [
    sbox(p + 'knuckle', 'leather', [x(-0.046), t, 0.07], [x(0.046), t + 0.003, 0.09]),
    sbox(p + 'heel', 'leather', [x(-0.046), t, -0.02], [x(0.046), t + 0.003, -0.008]),
    sbox(p + 'binding', 'binding', [x(-0.062), 0, -0.088], [x(0.062), t * 0.9 + 0.002, -0.08]),
  ];

// A mail glove: steel rings over the whole hand, shown as rows of rings across the back and down the fingers, with a
// leather wrist band. Slots: glove, cuff, ring.
local mailGlove(p, cx, s) =
  local t = 0.014, x(v) = cx + s * v;
  glove(p, cx, s, { t: t, cuff: 0.06, flare: 0.056, fingerW: 0.018 })
  + [
    sbox(p + 'row-%d' % i, 'ring', [x(-0.046), t, -0.016 + i * 0.012], [x(0.046), t + 0.002, -0.016 + i * 0.012 + 0.006])
    for i in std.range(0, 8)
  ] + [
    local step = 0.012 / fingers[i][1];
    onFinger(p + 'finger-%d-row-%d' % [i, k], 'ring', cx, s, i, 0.04 + k * step, 0.04 + k * step + step / 2, 0.019, t * 0.85, t * 0.85 + 0.002)
    for i in std.range(0, 3)
    for k in std.range(0, std.floor(fingers[i][1] / 0.012) - 1)
  ] + [
    sbox(p + 'band', 'band', [x(-0.054), t * 0.9, -0.05], [x(0.054), t * 0.9 + 0.003, -0.034]),
  ];

// A demi-gauntlet: a leather glove with mail fingers and thumb, a crowned plate over the back of the hand, a plate
// round the wrist and rivets. Slots: glove, cuff, mail, plate, rivet.
local demiGauntlet(p, cx, s) =
  local t = 0.016, x(v) = cx + s * v;
  local back = [[-0.047, -0.014], [0.047, -0.014], [0.047, 0.084], [-0.047, 0.084]];
  glove(p, cx, s, { t: t, cuff: 0.08, flare: 0.058, fingerSlot: 'mail', thumbSlot: 'mail', fingerW: 0.018 })
  + h.curvedPlate(p + 'back', 'plate', back, t, 0.003, 0.08, 6, cx)
  + h.curvedPlate(p + 'wrist', 'plate', [[-0.06, -0.09], [0.06, -0.09], [0.05, -0.02], [-0.05, -0.02]], 0.0, 0.003, 0.07, 6, cx)
  + [
    sbox(p + 'rivet-%d' % i, 'rivet', [x(v - 0.003), h.curvedTopAt(back, t, 0.003, 0.08, v), zz - 0.003], [x(v + 0.003), h.curvedTopAt(back, t, 0.003, 0.08, v) + 0.003, zz + 0.003])
    for i in [0, 1, 2, 3]
    for v in [[-0.036, 0.036, -0.036, 0.036][i]]
    for zz in [[-0.004, -0.004, 0.074, 0.074][i]]
  ];

// A hand wrap rolled up for storage and lying on its side: the roll along x, a tail unrolled towards +z ending in a
// thumb loop, and an optional cord tied round the roll. Slots: wrap, end, loop, and tie when `tie` is set.
local wrapRoll(p, cx, r, w, tail, t, tie=false) = [
  h.turned(p + 'roll', 'wrap', 'x', [[0, 0], [0, r], [w, r], [w, 0]], [cx - w / 2, r, 0]),
  h.turned(p + 'end-a', 'end', 'x', [[0, 0], [0, r * 0.45], [0.002, r * 0.45], [0.002, 0]], [cx - w / 2 - 0.002, r, 0]),
  h.turned(p + 'end-b', 'end', 'x', [[0, 0], [0, r * 0.45], [0.002, r * 0.45], [0.002, 0]], [cx + w / 2, r, 0]),
  box(p + 'tail', 'wrap', [cx - w / 2, 0, 0], [cx + w / 2, t, r + tail]),
] + h.strapLoop(p + 'loop', 'loop', 0.012, 0.016, 0.008, t, 0, cx, r + tail + 0.016)
  + (if tie then [h.tube(p + 'tie', 'tie', r, r + 0.003, cx - 0.004, cx + 0.004, r, 0)] else []);
local wrapPair(r, w, tail, t, tie=false) = wrapRoll('l-', -0.045, r, w, tail, t, tie) + wrapRoll('r-', 0.045, r, w, tail, t, tie);
[
  // A pair of steel gauntlets laid flat side by side, backs up, each 290 mm from cuff to fingertip and 100 mm across
  // the knuckles: leather gloves with a crowned plate over the back of the hand, two knuckle lames, three lames down
  // each finger, a lame on the thumb and a flared steel cuff. The xl and xs sizes share this model.
  h.compound('gloves_plate', 1.8, pair(gauntlet, 0.075),
             { glove: 'leather-brown', cuff: 'leather-brown', plate: 'steel-grey', rivet: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // A pair of yellow rubber kitchen gloves laid flat, each 360 mm from the rolled lip of its long cuff to the
  // fingertips, with grip ridges across the fingertips.
  h.compound('gloves_rubber', 0.08, pair(rubberGlove, 0.078), { glove: 'plastic-yellow', cuff: 'plastic-yellow', lip: 'plastic-yellow' })
  + { voxelGrain: 0.004 },

  // A pair of thin black costume gloves laid flat, each 230 mm from cuff to fingertip, with the hand's bones printed
  // in white on the back.
  h.compound('gloves_skeleton', 0.04, pair(skeletonGlove), { glove: 'cloth-black', cuff: 'cloth-black', print: 'cloth-bright-white' })
  + { voxelGrain: 0.002 },

  // A pair of tan duty gloves laid flat, each 230 mm from cuff to fingertip: aramid fabric backs, a black moulded
  // knuckle shell, padded finger joints and a grey hook-and-loop wrist strap with a black pull tab.
  h.compound('gloves_tactical', 0.15, pair(tacticalGlove),
             { glove: 'nylon-coyote', cuff: 'nylon-coyote', shell: 'plastic-matte-black', pad: 'plastic-charcoal', strap: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },

  // A pair of white cotton dress gloves laid flat, each 230 mm from cuff to fingertip, with three stitch lines down the
  // back and a snap at the wrist.
  h.compound('gloves_white', 0.068, pair(whiteGlove), { glove: 'cloth-bright-white', cuff: 'cloth-bright-white', stitch: 'cloth-white', snap: 'metal-silver' })
  + { voxelGrain: 0.002 },

  // A pair of padded winter gloves laid flat, each 260 mm from cuff to fingertip and 30 mm thick, quilted across the
  // back in navy with a long gathered charcoal knit cuff.
  h.compound('gloves_winter', 0.19, pair(winterGlove, 0.074), { glove: 'cloth-navy', cuff: 'cloth-charcoal', quilt: 'cloth-navy' })
  + { voxelGrain: 0.004 },

  // A pair of grey knitted wool gloves laid flat, each 250 mm from cuff to fingertip with a 70 mm dark ribbed cuff. The xl
  // and xs sizes share this model.
  h.compound('gloves_wool', 0.1, pair(woolGlove(1)), { glove: 'wool-grey', cuff: 'wool-grey', rib: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A pair of grey fingerless wool gloves laid flat, each 200 mm from cuff to the open finger ends, with a ribbed cuff
  // and a ribbed band round each finger end. The xl and xs sizes share this model.
  h.compound('gloves_wool_fingerless', 0.088, pair(woolGlove(0.4)), { glove: 'wool-grey', cuff: 'wool-grey', rib: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A pair of work gloves laid flat, each 260 mm from cuff to fingertip: cream canvas backs, tan leather fingers,
  // thumb, knuckle strip and heel strip, and a stiff khaki safety cuff bound in leather.
  h.compound('gloves_work', 0.2, pair(workGlove, 0.075),
             { glove: 'cloth-cream', cuff: 'cloth-khaki', leather: 'leather-tan', binding: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A pair of red cotton hand wraps rolled up, each roll 50 mm wide and 45 mm across, a 120 mm tail unrolled and
  // ending in a thumb loop.
  h.compound('gloves_wraps', 0.1, wrapPair(0.022, 0.05, 0.12, 0.003), { wrap: 'cloth-red', end: 'cloth-crimson', loop: 'cloth-red' })
  + { voxelGrain: 0.002 },

  // A pair of fur hand wraps rolled up and tied with a rawhide thong, each roll 70 mm wide and 70 mm across, with a
  // 120 mm tail of pelt and a thumb loop of hide.
  h.compound('gloves_wraps_fur', 0.25, wrapPair(0.035, 0.07, 0.12, 0.01, true), { wrap: 'fur-brown', end: 'skin-rawhide', loop: 'skin-rawhide', tie: 'skin-rawhide' })
  + { voxelGrain: 0.004 },

  // A pair of leather hand wraps rolled up and tied with a thong, each roll 50 mm wide and 55 mm across, with a 120 mm
  // tail and a thumb loop.
  h.compound('gloves_wraps_leather', 0.11, wrapPair(0.0275, 0.05, 0.12, 0.004, true), { wrap: 'leather-brown', end: 'leather-chestnut', loop: 'leather-brown', tie: 'leather-black' })
  + { voxelGrain: 0.002 },

  // A pair of grey wool hand wraps rolled up, each roll 50 mm wide and 45 mm across, with a 120 mm tail and a thumb
  // loop.
  h.compound('gloves_wraps_wool', 0.12, wrapPair(0.022, 0.05, 0.12, 0.004), { wrap: 'wool-grey', end: 'felt-grey', loop: 'wool-grey' })
  + { voxelGrain: 0.002 },

  // A pair of steel mail gloves laid flat, each 240 mm from cuff to fingertip, rows of rings across the back and down
  // the fingers and a leather band at the wrist. The xl and xs sizes share this model.
  h.compound('hc_chainmail_hands', 1.5, pair(mailGlove, 0.074), { glove: 'steel-mail', cuff: 'steel-mail', ring: 'steel-mail', band: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A pair of steel demi-gauntlets laid flat, each 260 mm from cuff to fingertip: leather gloves with mail fingers and
  // thumb, a crowned blued plate over the back of the hand, a plate round the wrist and four rivets. The xl size
  // shares this model.
  h.compound('hc_demi_gaunt', 1.5, pair(demiGauntlet, 0.074),
             { glove: 'leather-brown', cuff: 'leather-brown', mail: 'steel-mail', plate: 'steel-blued', rivet: 'steel-bright' })
  + { voxelGrain: 0.004 },
]
