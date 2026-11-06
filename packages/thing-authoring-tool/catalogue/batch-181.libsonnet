local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;
local flat = g.flat;
local strip = g.strip;
local rad(d) = d * std.pi / 180;

// A tapered strip lying on a top face at y from point a to point b ([x, z]), w0 wide at a and w1 at b: sleeves laid
// out flat, straps and long bones.
local taper(id, slot, a, b, w0, w1, y, t) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len, nz = dx / len;
  flat(id, slot, [
    [a[0] + nx * w0 / 2, a[1] + nz * w0 / 2],
    [b[0] + nx * w1 / 2, b[1] + nz * w1 / 2],
    [b[0] - nx * w1 / 2, b[1] - nz * w1 / 2],
    [a[0] - nx * w0 / 2, a[1] - nz * w0 / 2],
  ], y, t);

// Round heads of rivets or bolts at each [x, z] in pts, on a face at y.
local rivets(prefix, slot, pts, y, r=0.005, t=0.004) = [
  h.disc('%s-%d' % [prefix, i], slot, r, y, y + t, pts[i][0], pts[i][1])
  for i in std.range(0, std.length(pts) - 1)
];

// A flat plate from x0..x1 by z0..z1 on a face at y, with a rivet near each corner.
local plate(id, x0, x1, z0, z1, y, t=0.004, inset=0.012, rivetSlot='rivet') =
  [box(id, 'plate', [x0, y, z0], [x1, y + t, z1])]
  + rivets(id + '-rivet', rivetSlot, [[x0 + inset, z0 + inset], [x1 - inset, z0 + inset], [x0 + inset, z1 - inset], [x1 - inset, z1 - inset]], y + t, 0.004, 0.003);

// A top laid out flat, front up, collar towards +z: a body `w` across and `l` long, `t` thick, its shoulders sloping
// in to a neck notch `neckW` wide and `neckD` deep where the back panel's inside shows (slot lining). A sleeveless
// top cuts armholes `armIn` in from each side and `armD` deep below the shoulder; optional sleeves { l, w0, w1, ang }
// lie angled `ang` degrees out from straight down, from the shoulder. Slots: cloth, lining, sleeve.
local flatTop(o) =
  local c = { w: 0.44, l: 0.6, t: 0.008, sh: 0.06, neckW: 0.075, neckD: 0.06, armIn: 0, armD: 0.16, sleeves: null } + o;
  local w = c.w, l = c.l, t = c.t, top = l / 2 - c.neckD, sw = w / 2 - c.armIn;
  [
    flat('body', 'cloth', [[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, top - c.armD], [-w / 2, top - c.armD]], 0, t),
    flat('chest', 'cloth', [[-sw, top - c.armD - 0.01], [sw, top - c.armD - 0.01], [sw, top], [-sw, top]], 0, t),
    flat('lining', 'lining', [[-c.neckW, top], [c.neckW, top], [c.neckW, l / 2 - 0.004], [-c.neckW, l / 2 - 0.004]], 0, t * 0.5),
  ] + [
    flat('shoulder-%d' % (s + 1), 'cloth', [[s * c.neckW, top], [s * sw, top], [s * (sw - 0.02), top + c.neckD - c.sh * 0.5], [s * (c.neckW + 0.02), l / 2], [s * c.neckW, l / 2]], 0, t)
    for s in [-1, 1]
  ] + (if c.armIn > 0 then [
         flat('armhole-%d' % (s + 1), 'cloth', [[s * sw, top - c.armD - 0.01], [s * (sw + c.armIn), top - c.armD - 0.01], [s * (sw + c.armIn), top - c.armD + 0.004], [s * sw, top - c.armD + c.armIn * 1.2]], 0, t)
         for s in [-1, 1]
       ] else [])
  + (if c.sleeves == null then [] else
       local sl = c.sleeves;
       [
         local a = [s * (w / 2 - 0.03), top - sl.w0 / 2 + 0.02];
         local b = [a[0] + s * sl.l * std.sin(rad(sl.ang)), a[1] - sl.l * std.cos(rad(sl.ang))];
         taper('sleeve-%d' % (s + 1), 'sleeve', a, b, sl.w0, sl.w1, 0, t)
         for s in [-1, 1]
       ]);
// The cuff end of a flatTop sleeve: [x, z] at share k of its length and the sleeve direction.
local alongSleeve(c, s, k) =
  local w = c.w, l = c.l, top = l / 2 - c.neckD, sl = c.sleeves;
  local a = [s * (w / 2 - 0.03), top - sl.w0 / 2 + 0.02];
  [a[0] + s * k * sl.l * std.sin(rad(sl.ang)), a[1] - k * sl.l * std.cos(rad(sl.ang))];

// A folded jacket with flat sleeves, as the armoured jackets share: `w` across, `d` deep, `ht` tall.
local jacketBase(w, d, ht, front, buttons) =
  g.jacket({ w: w, d: d, ht: ht, front: front, buttons: buttons, sleeves: { kind: 'flat', w: 0.085, t: 0.006 } });

// Mirror armour laid out as a set: the front and back panels side by side at the top, each a leather backing with a
// domed round mirror in its middle and steel plates round it, and the two side panels below them, joined by
// buckled leather straps. `style` sets the plates: 'squares' (crude square plates in a grid), 'bars' (rectangular
// plates in rows) or 'framed' (one well-formed plate with a beaded border). Slots: leather, plate, mirror, rivet,
// strap, buckle.
local mirrorArmor(id, mass, style) =
  local pw = 0.22, pl = 0.27, pz = 0.07, sw = 0.18, sl = 0.2, sz = -0.19, y = 0.004, pt = 0.004;
  local panel(p, cx, cz, w, l, disc) =
    [box(p + '-leather', 'leather', [cx - w / 2, 0, cz - l / 2], [cx + w / 2, y, cz + l / 2])]
    + (if style == 'squares' then
         local n = 4, m = 5, gap = 0.006, s = (w - 0.016 - (n - 1) * gap) / n, sz2 = (l - 0.016 - (m - 1) * gap) / m;
         std.flattenArrays([
           local x0 = cx - w / 2 + 0.008 + i * (s + gap), z0 = cz - l / 2 + 0.008 + j * (sz2 + gap);
           if disc && std.abs(x0 + s / 2 - cx) < 0.06 && std.abs(z0 + sz2 / 2 - cz) < 0.06 then []
           else plate('%s-sq-%d-%d' % [p, i, j], x0, x0 + s, z0, z0 + sz2, y, pt, 0.008)
           for i in std.range(0, n - 1)
           for j in std.range(0, m - 1)
         ])
       else if style == 'bars' then
         local m = 6, gap = 0.006, bl = (l - 0.016 - (m - 1) * gap) / m;
         std.flattenArrays([
           local z0 = cz - l / 2 + 0.008 + j * (bl + gap);
           if disc && std.abs(z0 + bl / 2 - cz) < 0.06 then
             plate('%s-bar-%d-l' % [p, j], cx - w / 2 + 0.008, cx - 0.072, z0, z0 + bl, y, pt, 0.008)
             + plate('%s-bar-%d-r' % [p, j], cx + 0.072, cx + w / 2 - 0.008, z0, z0 + bl, y, pt, 0.008)
           else plate('%s-bar-%d' % [p, j], cx - w / 2 + 0.008, cx + w / 2 - 0.008, z0, z0 + bl, y, pt, 0.008)
           for j in std.range(0, m - 1)
         ])
       else
         [box(p + '-plate', 'plate', [cx - w / 2 + 0.008, y, cz - l / 2 + 0.008], [cx + w / 2 - 0.008, y + pt, cz + l / 2 - 0.008])]
         + [
           box(p + '-bead-%d' % i, 'mirror', [cx + e[0] - e[2], y + pt, cz + e[1] - e[3]], [cx + e[0] + e[2], y + pt + 0.003, cz + e[1] + e[3]])
           for i in [0, 1, 2, 3]
           for e in [[[0, l / 2 - 0.016, w / 2 - 0.012, 0.003], [0, -l / 2 + 0.016, w / 2 - 0.012, 0.003], [w / 2 - 0.016, 0, 0.003, l / 2 - 0.012], [-w / 2 + 0.016, 0, 0.003, l / 2 - 0.012]][i]]
         ]
         + rivets(p + '-rivet', 'rivet', [[cx + sx * (w / 2 - 0.024), cz + sz3 * (l / 2 - 0.024)] for sx in [-1, 1] for sz3 in [-1, 1]], y + pt, 0.005, 0.003))
    + (if disc then [
         h.disc(p + '-disc-rim', 'plate', 0.068, y, y + pt + 0.002, cx, cz),
         h.dome(p + '-disc', 'mirror', 0.06, 0.014, 0.004, 'y', [cx, y + pt + 0.002, cz]),
       ] else []);
  h.compound(id, mass,
             panel('front', -0.13, pz, pw, pl, true)
             + panel('back', 0.13, pz, pw, pl, true)
             + panel('side-l', -0.13, sz, sw, sl, false)
             + panel('side-r', 0.13, sz, sw, sl, false)
             + std.flattenArrays([
               [
                 box('shoulder-%d-%d' % [i, k], 'strap', [x - 0.015, y, pz + pl / 2 - 0.02], [x + 0.015, y + 0.004, pz + pl / 2 + 0.06]),
                 box('shoulder-buckle-%d-%d' % [i, k], 'buckle', [x - 0.019, y + 0.004, pz + pl / 2 + 0.03], [x + 0.019, y + 0.008, pz + pl / 2 + 0.05]),
               ]
               for i in [0, 1]
               for k in [0, 1]
               for x in [[-0.13, 0.13][i] + [-0.06, 0.06][k]]
             ])
             + std.flattenArrays([
               [
                 box('side-strap-%d-%d' % [i, k], 'strap', [x - 0.012, y, sz + sl / 2 - 0.02], [x + 0.012, y + 0.004, pz - pl / 2 + 0.02]),
                 box('side-buckle-%d-%d' % [i, k], 'buckle', [x - 0.016, y + 0.004, sz + sl / 2 + 0.002], [x + 0.016, y + 0.008, pz - pl / 2 - 0.002]),
               ]
               for i in [0, 1]
               for k in [0, 1]
               for x in [[-0.13, 0.13][i] + [-0.05, 0.05][k]]
             ])
             + [box('join', 'strap', [-0.02, y, pz - 0.08], [0.02, y + 0.004, pz + 0.08])],
             {
               leather: 'leather-brown',
               plate: if style == 'squares' then 'steel-bright' else if style == 'bars' then 'steel-grey' else 'steel-blued',
               mirror: if style == 'framed' then 'mirror-silver' else if style == 'bars' then 'steel-grey' else 'steel-bright',
               rivet: 'steel',
               strap: 'leather-tan',
               buckle: 'brass-dull',
             })
  + { voxelGrain: 0.004 };

[
  // A denim jacket folded flat, 420 mm by 340 mm and 80 mm tall, with mild steel plates riveted over the chest, the
  // belly and the sleeves: two plates each side of the button placket and a long plate down each flat sleeve.
  local w = 0.42, d = 0.34, ht = 0.08, st = ht + 0.006;
  h.compound('jacket_jean_mod', 2.4, jacketBase(w, d, ht, 'placket', 4)
                                      + plate('chest-l', -0.12, -0.03, -0.06, 0.02, ht)
                                      + plate('chest-r', 0.03, 0.12, -0.06, 0.02, ht)
                                      + plate('belly-l', -0.12, -0.03, -0.155, -0.075, ht)
                                      + plate('belly-r', 0.03, 0.12, -0.155, -0.075, ht)
                                      + plate('sleeve-l', -w / 2 + 0.01, -w / 2 + 0.075, -0.13, 0.04, st)
                                      + plate('sleeve-r', w / 2 - 0.075, w / 2 - 0.01, -0.13, 0.04, st),
             { cloth: 'cloth-denim', collar: 'cloth-denim', front: 'cloth-denim', sleeve: 'cloth-denim', button: 'brass-dull', plate: 'steel-bright', rivet: 'steel' })
  + { voxelGrain: 0.004 },

  // A black leather motorcycle jacket folded flat, 420 mm by 340 mm and 80 mm tall: wide lapels, a zip running
  // off-centre down the front, and mild steel plates bolted on: a hexagonal plate each side of the chest, a plate
  // over each shoulder and one over each elbow on the flat sleeves, with hex bolt heads.
  local w = 0.42, d = 0.34, ht = 0.08, cz = d / 2 - 0.09, st = ht + 0.006, sx = w / 2 - 0.0425;
  local hexPlate(id, cx, cz2, rx, rz, y) = [
    flat(id, 'plate', [[cx - rx, cz2], [cx - rx * 0.5, cz2 - rz], [cx + rx * 0.5, cz2 - rz], [cx + rx, cz2], [cx + rx * 0.5, cz2 + rz], [cx - rx * 0.5, cz2 + rz]], y, 0.005),
  ] + rivets(id + '-bolt', 'rivet', [[cx - rx * 0.6, cz2], [cx + rx * 0.6, cz2], [cx, cz2 - rz * 0.7], [cx, cz2 + rz * 0.7]], y + 0.005, 0.005, 0.004);
  h.compound('jacket_leather_mod', 10, jacketBase(w, d, ht, 'none', [])
                                        + [
                                          flat('lapel-l', 'front', [[-0.04, cz - 0.05], [-0.12, cz - 0.03], [-0.06, cz - 0.14]], ht, 0.008),
                                          flat('lapel-r', 'front', [[0.04, cz - 0.05], [0.12, cz - 0.03], [0.06, cz - 0.14]], ht, 0.008),
                                          strip('zip-a', 'zip', [0.06, cz - 0.07], [0.02, -0.03], ht, 0.008),
                                          strip('zip-b', 'zip', [0.02, -0.03], [0.02, -d / 2 + 0.01], ht, 0.008),
                                        ]
                                        + hexPlate('chest-l', -0.075, -0.06, 0.045, 0.045, ht)
                                        + hexPlate('chest-r', 0.085, -0.075, 0.04, 0.042, ht)
                                        + hexPlate('shoulder-l', -sx, 0.1, 0.038, 0.05, st)
                                        + hexPlate('shoulder-r', sx, 0.1, 0.038, 0.05, st)
                                        + hexPlate('elbow-l', -sx, -0.06, 0.038, 0.05, st)
                                        + hexPlate('elbow-r', sx, -0.06, 0.038, 0.05, st),
             { cloth: 'leather-black', collar: 'leather-black', front: 'leather-black', sleeve: 'leather-black', zip: 'metal-silver', plate: 'steel-bright', rivet: 'steel' })
  + { voxelGrain: 0.004 },

  // A brown leather motorcycle jacket folded flat, 420 mm by 340 mm and 80 mm tall, with chunks of tyre stitched on:
  // treaded slabs 12 mm thick over the chest and belly, the shoulders and down each flat sleeve, their lugs standing
  // in rows across them.
  local w = 0.42, d = 0.34, ht = 0.08, st = ht + 0.006, sx = w / 2 - 0.0425;
  local tread(id, cx, cz, rw, rl, y) =
    [box(id, 'tyre', [cx - rw / 2, y, cz - rl / 2], [cx + rw / 2, y + 0.01, cz + rl / 2])]
    + [
      box('%s-lug-%d-%d' % [id, i, k], 'lug', [cx + (if k == 0 then -rw / 2 + 0.004 else 0.004), y + 0.01, z], [cx + (if k == 0 then -0.004 else rw / 2 - 0.004), y + 0.015, z + 0.01])
      for i in std.range(0, std.floor((rl - 0.012) / 0.02) - 1)
      for k in [0, 1]
      for z in [cz - rl / 2 + 0.008 + i * 0.02 + (if k == 0 then 0 else 0.008)]
    ];
  h.compound('jacket_leather_tire', 9.2, jacketBase(w, d, ht, 'placket', [])
                                         + tread('chest-l', -0.075, -0.03, 0.09, 0.11, ht)
                                         + tread('chest-r', 0.075, -0.03, 0.09, 0.11, ht)
                                         + tread('belly', 0, -0.135, 0.2, 0.06, ht + 0.005)
                                         + tread('shoulder-l', -sx, 0.1, 0.07, 0.07, st)
                                         + tread('shoulder-r', sx, 0.1, 0.07, 0.07, st)
                                         + tread('arm-l', -sx, -0.06, 0.07, 0.13, st)
                                         + tread('arm-r', sx, -0.06, 0.07, 0.13, st),
             { cloth: 'leather-brown', collar: 'leather-brown', front: 'leather-brown', sleeve: 'leather-brown', button: 'brass-dull', tyre: 'rubber-tread', lug: 'rubber-offblack' })
  + { voxelGrain: 0.004 },

  // A thick black leather jacket folded flat, 420 mm by 340 mm and 80 mm tall, covered in carved bone: a breastbone
  // down the front with four curved ribs off each side, knuckle bones over the shoulders and a long bone down each
  // flat sleeve, all scored with dark carving.
  local w = 0.42, d = 0.34, ht = 0.08, st = ht + 0.006, sx = w / 2 - 0.0425, by = ht + 0.002;
  h.compound('jacket_leather_bone', 9, jacketBase(w, d, ht, 'none', [])
                                         + [
                                           taper('sternum', 'bone', [0, 0.02], [0, -0.13], 0.03, 0.018, ht, 0.008),
                                         ]
                                         + std.flattenArrays([
                                           [
                                             taper('rib-%d-%d' % [i, s + 1], 'bone', [s * 0.016, z], [s * 0.115, z - 0.035], 0.016, 0.01, by, 0.007),
                                             taper('rib-tip-%d-%d' % [i, s + 1], 'bone', [s * 0.11, z - 0.033], [s * 0.14, z - 0.06], 0.012, 0.008, by, 0.006),
                                             strip('carve-%d-%d' % [i, s + 1], 'carving', [s * 0.03, z - 0.004], [s * 0.09, z - 0.026], by + 0.007, 0.004, 0.002),
                                           ]
                                           for i in std.range(0, 3)
                                           for s in [-1, 1]
                                           for z in [0.012 - i * 0.035]
                                         ])
                                         + std.flattenArrays([
                                           [
                                             taper('long-bone-%d' % (s + 1), 'bone', [s * sx, 0.06], [s * sx, -0.13], 0.016, 0.016, st, 0.01),
                                             h.disc('long-knob-a-%d' % (s + 1), 'bone', 0.016, st, st + 0.012, s * sx, 0.065),
                                             h.disc('long-knob-b-%d' % (s + 1), 'bone', 0.016, st, st + 0.012, s * sx, -0.135),
                                             strip('long-carve-%d' % (s + 1), 'carving', [s * sx, 0.03], [s * sx, -0.1], st + 0.01, 0.004, 0.002),
                                           ] + [
                                             h.disc('knuckle-%d-%d' % [s + 1, k], 'bone', 0.011, st, st + 0.01, s * (sx + [-0.02, 0.0, 0.02][k]), 0.115 + [0, 0.02, 0][k])
                                             for k in [0, 1, 2]
                                           ]
                                           for s in [-1, 1]
                                         ]),
             { cloth: 'leather-black', collar: 'leather-black', sleeve: 'leather-black', bone: 'bone', carving: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },

  // A light concealable ballistic vest lying flat, front up: a navy front panel 460 mm across and 560 mm from hem
  // to shoulder over a slightly wider back panel, 24 mm thick together, with hook-and-loop shoulder tabs, a white
  // label on the chest and elastic side straps hanging loose with hook-and-loop ends.
  local o = { w: 0.46, l: 0.56, t: 0.012, neckW: 0.085, neckD: 0.07, armIn: 0.06, armD: 0.17 };
  h.compound('kevlar', 1.3, [
    q { start: q.start + 0.012, end: q.end + 0.012 }
    for q in flatTop(o)
  ] + [
    flat('back', 'back', [[-0.235, -0.29], [0.235, -0.29], [0.235, 0.05], [-0.235, 0.05]], 0, 0.012),
    flat('back-chest', 'back', [[-0.175, 0.04], [0.175, 0.04], [0.175, 0.2], [-0.175, 0.2]], 0, 0.012),
  ] + [
    box('tab-%d' % (s + 1), 'tab', [s * 0.155 - 0.035, 0.024, 0.2], [s * 0.155 + 0.035, 0.029, 0.26])
    for s in [-1, 1]
  ] + [
    box('side-strap-%d-%d' % [s + 1, k], 'strap', [if s < 0 then -0.36 else 0.2, 0.0, z - 0.025], [if s < 0 then -0.2 else 0.36, 0.006, z + 0.025])
    for s in [-1, 1]
    for k in [0, 1]
    for z in [[-0.18, -0.06][k]]
  ] + [
    box('side-end-%d-%d' % [s + 1, k], 'tab', [if s < 0 then -0.36 else 0.31, 0.006, z - 0.025], [if s < 0 then -0.31 else 0.36, 0.01, z + 0.025])
    for s in [-1, 1]
    for k in [0, 1]
    for z in [[-0.18, -0.06][k]]
  ] + [
    box('label', 'label', [-0.04, 0.024, 0.06], [0.04, 0.028, 0.12]),
  ], { cloth: 'cloth-navy', back: 'cloth-navy', lining: 'cloth-charcoal', tab: 'hook-loop-grey', strap: 'cloth-charcoal', label: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A foil fencing vest lying flat, front up: a sleeveless top of silvery woven metal cloth 400 mm across and
  // 560 mm long, a groin flap tapering down from the hem, a white binding round the neck and the body-wire clip at
  // the hip.
  local o = { w: 0.4, l: 0.56, t: 0.006, neckW: 0.07, neckD: 0.06, armIn: 0.055, armD: 0.17 };
  h.compound('lame_foil', 0.32, flatTop(o) + [
    flat('flap', 'cloth', [[-0.11, -0.28], [0.11, -0.28], [0.06, -0.4], [-0.06, -0.4]], 0, 0.006),
    box('neck-binding', 'binding', [-0.07, 0.0, 0.214], [0.07, 0.008, 0.226]),
    box('neck-binding-l', 'binding', [-0.082, 0.0, 0.22], [-0.07, 0.008, 0.28]),
    box('neck-binding-r', 'binding', [0.07, 0.0, 0.22], [0.082, 0.008, 0.28]),
    box('clip-tab', 'binding', [0.15, 0.006, -0.27], [0.18, 0.01, -0.22]),
    box('clip', 'clip', [0.155, 0.01, -0.26], [0.175, 0.016, -0.235]),
  ], { cloth: 'cloth-shimmer', lining: 'cloth-white', binding: 'cloth-cream', clip: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // A sabre fencing jacket lying flat, front up: silvery woven metal cloth 400 mm across and 480 mm long, cut
  // straight at the waist, its sleeves laid out to the sides, 560 mm long, with a stand collar, white cuffs and the
  // body-wire clip at the hip.
  local o = { w: 0.4, l: 0.48, t: 0.006, neckW: 0.07, neckD: 0.06, sleeves: { l: 0.56, w0: 0.15, w1: 0.09, ang: 35 } };
  h.compound('lame_saber', 0.45, flatTop(o) + [
    box('collar', 'binding', [-0.08, 0.0, 0.176], [0.08, 0.012, 0.19]),
    box('collar-l', 'binding', [-0.092, 0.0, 0.18], [-0.07, 0.012, 0.24]),
    box('collar-r', 'binding', [0.07, 0.0, 0.18], [0.092, 0.012, 0.24]),
    box('clip-tab', 'binding', [0.15, 0.006, -0.23], [0.18, 0.01, -0.18]),
    box('clip', 'clip', [0.155, 0.01, -0.22], [0.175, 0.016, -0.195]),
  ] + [
    taper('cuff-%d' % (s + 1), 'binding', alongSleeve(o, s, 0.93), alongSleeve(o, s, 1.0), 0.094, 0.094, 0.0, 0.008)
    for s in [-1, 1]
  ], { cloth: 'cloth-shimmer', sleeve: 'cloth-shimmer', lining: 'cloth-shimmer', binding: 'cloth-cream', clip: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // A motorcycle mesh jacket lying flat, front up: black stretch cloth 460 mm across and 560 mm long with open mesh
  // panels down the sides, its sleeves laid out, 600 mm long, a zip down the front and grey moulded pads over the
  // chest, the shoulders, the elbows and the forearms, ribbed with vents.
  local o = { w: 0.46, l: 0.56, t: 0.008, neckW: 0.075, neckD: 0.06, sleeves: { l: 0.6, w0: 0.17, w1: 0.1, ang: 32 } };
  local pad(id, at, w, l, y) = [
    taper(id, 'pad', [at[0], at[1] + l / 2], [at[0], at[1] - l / 2], w, w * 0.85, y, 0.01),
    taper(id + '-vent', 'vent', [at[0], at[1] + l * 0.3], [at[0], at[1] - l * 0.3], w * 0.25, w * 0.25, y + 0.01, 0.004),
  ];
  h.compound('motorbike_armor', 1.3, flatTop(o) + [
    box('mesh-l', 'mesh', [-0.23, 0.008, -0.27], [-0.17, 0.011, 0.14]),
    box('mesh-r', 'mesh', [0.17, 0.008, -0.27], [0.23, 0.011, 0.14]),
    box('zip', 'zip', [-0.006, 0.008, -0.28], [0.006, 0.012, 0.22]),
    box('collar', 'collar', [-0.09, 0.0, 0.212], [0.09, 0.014, 0.226]),
  ]
  + pad('chest-l', [-0.09, 0.08], 0.11, 0.14, 0.008)
  + pad('chest-r', [0.09, 0.08], 0.11, 0.14, 0.008)
  + std.flattenArrays([
    pad('shoulder-pad-%d' % (s + 1), alongSleeve(o, s, 0.12), 0.12, 0.1, 0.008)
    + pad('elbow-%d' % (s + 1), alongSleeve(o, s, 0.55), 0.1, 0.1, 0.008)
    + pad('forearm-%d' % (s + 1), alongSleeve(o, s, 0.8), 0.08, 0.1, 0.008)
    for s in [-1, 1]
  ]), { cloth: 'lycra-black', sleeve: 'lycra-black', lining: 'cloth-charcoal', mesh: 'mesh-black', zip: 'metal-silver', collar: 'lycra-black', pad: 'plastic-grey', vent: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },

  // Mild steel mirror armour laid out as a set, 500 mm across and 550 mm long: front and back panels 220 by 270 mm,
  // side panels 180 by 200 mm, each a leather backing with crude square plates riveted on in a grid, the front and
  // back with a domed round mirror 136 mm across in the middle.
  mirrorArmor('lc_mirror_armor', 5.7, 'squares'),

  // Medium steel mirror armour laid out as a set, 500 mm across and 550 mm long: the same four leather panels with
  // rectangular plates riveted on in rows, the front and back with a domed round mirror in the middle.
  mirrorArmor('mc_mirror_armor', 5.9, 'bars'),

  // High steel mirror armour laid out as a set, 500 mm across and 550 mm long: four leather panels, each faced with one
  // well-formed blued plate inside a polished bead, the front and back with a polished domed mirror in the middle.
  mirrorArmor('hc_mirror_armor', 7.5, 'framed'),

  // A sleeveless mail vest lying flat, front up, 440 mm across and 600 mm long, 8 mm thick, ridged across where its
  // rows of rings lie, with leather straps over the shoulders and a buckled strap round the waist to spread the
  // weight, and a leather binding at the neck.
  local o = { w: 0.44, l: 0.6, t: 0.008, neckW: 0.08, neckD: 0.065, armIn: 0.06, armD: 0.18 };
  local top = 0.3 - 0.065;
  h.compound('lc_chainmail_vest', 4.4, flatTop(o) + [
    local z = -0.296 + i * 0.016, half = if z < top - 0.18 then 0.216 else 0.156;
    box('ring-row-%d' % i, 'rings', [-half, 0.008, z], [half, 0.012, z + 0.006])
    for i in std.range(0, std.floor((top - 0.01 + 0.296) / 0.016))
  ] + [
    box('shoulder-strap-%d' % (s + 1), 'strap', [s * 0.15 - 0.018, 0.012, 0.0], [s * 0.15 + 0.018, 0.016, 0.29])
    for s in [-1, 1]
  ] + [
    box('waist-strap', 'strap', [-0.22, 0.012, -0.17], [0.22, 0.016, -0.135]),
    box('waist-buckle', 'buckle', [0.13, 0.016, -0.174], [0.165, 0.021, -0.131]),
    box('neck-binding', 'strap', [-0.08, 0.0, top - 0.012], [0.08, 0.012, top]),
  ], { cloth: 'steel-mail', lining: 'leather-brown', rings: 'steel-mail', strap: 'leather-brown', buckle: 'brass-dull' })
  + { voxelGrain: 0.004 },
]
