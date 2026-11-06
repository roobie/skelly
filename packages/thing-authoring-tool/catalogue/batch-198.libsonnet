local h = import '../compound.libsonnet';
local f = import '../footwear.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;
// A ring on y between radii r0 and r1 from y0 to y1.
local ring(id, slot, r0, r1, y0, y1) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [0, y0, 0]);
// A circlet standing on its lower edge, front on +z: a wooden band of radius r and height ht, metal bands round both
// edges, metal studs round it and a pointed metal plaque at the front. Slots: band, trim.
local circlet(r, ht) =
  [
    ring('band', 'band', r - 0.006, r, 0, ht),
    ring('rim-low', 'trim', r - 0.006, r + 0.002, 0, 0.004),
    ring('rim-high', 'trim', r - 0.006, r + 0.002, ht - 0.004, ht),
    h.prism('plaque', 'trim', 'z', [[-0.022, 0], [0.022, 0], [0.022, ht], [0, ht + 0.03], [-0.022, ht]], r - 0.002, r + 0.003),
    h.prism('plaque-inset', 'band', 'z', [[-0.01, 0.008], [0.01, 0.008], [0.01, ht], [0, ht + 0.016], [-0.01, ht]], r + 0.003, r + 0.005),
  ] + [
    local a = std.pi * 2 * i / 12;
    box('stud-%d' % i, 'trim', [r * std.sin(a) - 0.004, ht / 2 - 0.004, r * std.cos(a) - 0.004], [r * std.sin(a) + 0.004, ht / 2 + 0.004, r * std.cos(a) + 0.004])
    for i in std.range(1, 11)
  ];
// A backpack standing on its base, front on +z and harness on -z: a squared body `w` wide, `ht` tall and `d` deep,
// a lid coming `lid` down the front with two buckled straps, a front pocket covered in rows of raised hide scutes,
// side pockets, padded back, two shoulder straps, a hip belt and a grab handle. Slots: body, pocket, scute, back,
// strap, trim.
local pack(w, ht, d) =
  local lid = ht * 0.24, pw = w * 0.78, ph = ht * 0.42, pd = d * 0.2, py = ht * 0.08, pad = 0.014, sx = w * 0.22, sw = w * 0.15;
  local side = d * 0.25;
  [
    box('body', 'body', [-w / 2, 0, -d / 2], [w / 2, ht, d / 2]),
    box('pocket', 'pocket', [-pw / 2, py, d / 2], [pw / 2, py + ph, d / 2 + pd]),
    box('back-pad', 'back', [-w / 2 + 0.02, ht * 0.08, -d / 2 - pad], [w / 2 - 0.02, ht * 0.85, -d / 2]),
    box('handle', 'strap', [-0.04, ht + 0.05, -d / 2 + 0.01], [0.04, ht + 0.075, -d / 2 + 0.035]),
    box('lid-top', 'pocket', [-w / 2 - 0.006, ht, -d / 2], [w / 2 + 0.006, ht + 0.05, d / 2 + 0.008]),
    box('lid-front', 'pocket', [-w / 2 - 0.006, ht - lid, d / 2], [w / 2 + 0.006, ht + 0.05, d / 2 + 0.008]),
    box('hip-belt', 'strap', [-w / 2 - 0.09, ht * 0.03, -d / 2 - 0.06], [w / 2 + 0.09, ht * 0.03 + 0.1, -d / 2 - pad]),
    box('hip-buckle', 'trim', [-0.03, ht * 0.03 + 0.03, -d / 2 - 0.068], [0.03, ht * 0.03 + 0.07, -d / 2 - 0.06]),
  ] + std.flattenArrays([
    [
      box('shoulder-%d' % i, 'strap', [x - sw / 2, ht * 0.3, -d / 2 - pad - 0.025], [x + sw / 2, ht * 0.9, -d / 2 - pad]),
      box('buckle-%d' % i, 'trim', [x - 0.02, ht * 0.28, -d / 2 - pad - 0.03], [x + 0.02, ht * 0.32, -d / 2 - pad - 0.022]),
      box('lid-strap-%d' % i, 'strap', [x * 1.2 - 0.0125, ht * 0.6, d / 2], [x * 1.2 + 0.0125, ht - lid + 0.03, d / 2 + 0.008]),
      box('lid-buckle-%d' % i, 'trim', [x * 1.2 - 0.018, ht * 0.62, d / 2 + 0.008], [x * 1.2 + 0.018, ht * 0.62 + 0.03, d / 2 + 0.013]),
      box('side-%d' % i, 'pocket', [if i == 0 then -w / 2 - side else w / 2, 0.02, -d * 0.35], [if i == 0 then -w / 2 else w / 2 + side, 0.02 + ht * 0.35, d * 0.35]),
    ]
    for i in [0, 1]
    for x in [[-sx, sx][i]]
  ]) + [
    // Scutes: rows of small raised plates on the pocket face, each row offset half a scute from the last.
    local sz = pw / 6, row = ph / 5, x0 = -pw / 2 + (j % 2) * sz / 2 + k * sz + 0.004;
    box('scute-%d-%d' % [j, k], 'scute', [x0, py + j * row + 0.006, d / 2 + pd], [x0 + sz - 0.008, py + (j + 1) * row - 0.004, d / 2 + pd + 0.004])
    for j in std.range(0, 4)
    for k in std.range(0, if j % 2 == 0 then 5 else 4)
  ];
local packFinish = { body: 'hide-dragon-black', pocket: 'hide-dragon-black', scute: 'leather-charcoal', back: 'leather-chestnut', strap: 'leather-chestnut', trim: 'bone' };
// Hide boots: a tall soft boot with a turned-down cuff and two buckled straps round the shaft.
local hideBoot = f.preset.hiking { t: 0.018, heel: 0.008, top: 0.3, collar: 0.04, collarOut: 0.008, toeSlot: 'rand' };
local hideExtra(b) = function(p, cx) [
  f.band(p + 'strap-a', 'strap', b, cx, b.top * 0.4, b.top * 0.4 + 0.02, 0.004),
  f.band(p + 'strap-b', 'strap', b, cx, b.top * 0.7, b.top * 0.7 + 0.02, 0.004),
  box(p + 'buckle-a', 'buckle', [cx + b.rx - 0.004, b.top * 0.4 - 0.004, f.shaftZ(b) - 0.012], [cx + b.rx + 0.008, b.top * 0.4 + 0.024, f.shaftZ(b) + 0.012]),
  box(p + 'buckle-b', 'buckle', [cx + b.rx - 0.004, b.top * 0.7 - 0.004, f.shaftZ(b) - 0.012], [cx + b.rx + 0.008, b.top * 0.7 + 0.024, f.shaftZ(b) + 0.012]),
];
local hideFinish = { sole: 'leather-charcoal', upper: 'hide-dragon-black', rand: 'leather-chestnut', shaft: 'hide-dragon-black', collar: 'leather-chestnut', lining: 'cloth-charcoal', strap: 'leather-chestnut', buckle: 'bone' };
// Scale boots: lamellar toe steps alternating scale and hide, and the shaft ringed with overlapping scale rows.
local scaleBoot = f.preset.plated { top: 0.3, collar: 0.03, laneSlots: ['scale', 'hide'] };
local scaleExtra(b) = function(p, cx) [
  f.band(p + 'row-%d' % i, if i % 2 == 0 then 'scale' else 'hide', b, cx, b.ankle + i * 0.024, b.ankle + i * 0.024 + (if i % 2 == 0 then 0.024 else 0.02), if i % 2 == 0 then 0.008 else 0.002)
  for i in std.range(0, std.floor((b.top - b.collar - b.ankle) / 0.024) - 1)
];
local scaleFinish = { sole: 'leather-charcoal', scale: 'chitin-black', hide: 'leather-charcoal', shaft: 'hide-dragon-black', collar: 'chitin-black', lining: 'cloth-charcoal' };
local scaleGlove = { t: 0.02, cuff: 0.11, flare: 0.07, mail: 'scale', binding: 'trim', knuckle: 'scale' };
[
  // A circlet 170 mm across and 25 mm tall: a band of dark wood with copper bands round both edges, copper studs
  // and a pointed copper plaque at the brow.
  h.compound('copper_circlet', 0.45, circlet(0.085, 0.025), { band: 'wood-oak', trim: 'copper' })
  + { voxelGrain: 0.002 },

  // A black dragonhide backpack 360 mm wide, 520 mm tall and 220 mm deep: a squared body under a deep lid, a front
  // pocket scaled with raised scutes, side pockets, a hip belt and bone buckles.
  h.compound('backpack_black_dragon_hide', 2.5, pack(0.36, 0.52, 0.22), packFinish),

  // The large dragonhide backpack, 440 mm wide, 640 mm tall and 270 mm deep, cut for a big body.
  h.compound('backpack_xl_black_dragon_hide', 3.5, pack(0.44, 0.64, 0.27), packFinish),

  // A standing pair of black dragonhide boots 290 mm long and 300 mm tall, with a turned-down cuff and two
  // bone-buckled straps round each shaft.
  h.compound('boots_black_dragon_hide', 2.2, f.pair(hideBoot, 0.02, hideExtra(hideBoot)), hideFinish),

  // The oversized dragonhide boots, 360 mm long and 360 mm tall, cut for a big or misshapen foot.
  local xlHide = hideBoot { l: 0.36, w: 0.135, ankle: 0.1, top: 0.36, rx: 0.058, rz: 0.072 };
  h.compound('boots_xlblack_dragon_hide', 3.5, f.pair(xlHide, 0.02, hideExtra(xlHide)), hideFinish),

  // A standing pair of black dragonscale boots 300 mm long and 300 mm tall: hide boots armoured in overlapping
  // rows of glossy black scales from the toe up the shaft.
  h.compound('boots_black_dragon_scale', 3, f.pair(scaleBoot, 0.02, scaleExtra(scaleBoot)), scaleFinish),

  // The oversized dragonscale boots, 370 mm long and 360 mm tall.
  local xlScale = scaleBoot { l: 0.37, w: 0.14, ankle: 0.12, top: 0.36, rx: 0.062, rz: 0.075 };
  h.compound('boots_xlblack_dragon_scale', 4.5, f.pair(xlScale, 0.02, scaleExtra(xlScale)), scaleFinish),

  // A pair of black dragonscale gauntlets laid flat side by side, backs up, 300 mm from cuff to fingertip: hide
  // gloves with rows of scales over the back and fingers, a scale knuckle ridge and wide flared cuffs.
  h.compound('gauntlets_black_dragon_scale', 0.37, g.glovePair(scaleGlove, 0.085), { glove: 'hide-dragon-black', cuff: 'hide-dragon-black', scale: 'chitin-black', trim: 'leather-chestnut' })
  + { voxelGrain: 0.004 },
]
