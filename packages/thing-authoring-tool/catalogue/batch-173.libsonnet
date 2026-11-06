local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;

// Whole-body suits folded on a shelf, neck or hood at +z. Mail suits fold into a heavy pile ridged where the rows of
// rings lie, with a coif on top. The hauberks and jumpsuits ride on batch 174's mail models.

// Rows of rings: ridges across x every `pitch` along z over a top face at y.
local ridges(p, x0, x1, z0, z1, y, pitch=0.016) = [
  box('%s-%d' % [p, i], 'mail', [x0, y, z0 + pitch * i], [x1, y + 0.004, z0 + pitch * i + 0.008])
  for i in std.range(0, std.floor((z1 - z0 - 0.008) / pitch))
];

// A folded mail suit `w` across x, `d` along z and `ht` tall. Options: `sleeves` rolls a mail sleeve down each side;
// `legs` lays the legs folded up over the front; `coif` lays a hood face up at the neck, `cage` bars its face
// opening, `mitts` and `socks` add mail hands draped over the front fold and mail feet on the leg ends, `braid` a
// bonding strap down the middle. Slots: mail, binding, opening, cage, braid.
local mailSuit(o) =
  local c = { w: 0.4, d: 0.32, ht: 0.08, sleeves: false, legs: false, coif: false, cage: false, mitts: false, socks: false, braid: false } + o;
  local w = c.w, d = c.d, ht = c.ht, sr = 0.032, sx = w / 2 - sr - 0.006, lw = 0.1, lx = 0.01 + lw / 2;
  local legEnd = if c.coif then -0.03 else 0.0, cz = d / 2 - (if c.coif then 0.09 else 0.075);
  [p { slot: 'mail' } for p in h.foldedGarment(w, d, ht, 3)]
  + ridges('rings', -w / 2 + 0.008, w / 2 - 0.008, -d / 2 + 0.012, d / 2 - 0.006, ht)
  + (if c.coif then [] else h.crescent('neck', 'binding', 0.062, 0.078, -180, 180, 16, ht, ht + 0.007, 0, cz))
  + (if c.sleeves then std.flattenArrays([
       local x = s * sx, z0 = -d / 2 + 0.012, len = d - 0.05;
       [h.turned('sleeve-%d' % (s + 1), 'mail', 'z', [[0, 0], [0, sr * 0.8], [0.012, sr], [len, sr], [len, 0]], [x, ht, z0])]
       + [
         h.turned('sleeve-%d-row-%d' % [s + 1, i], 'mail', 'z', [[0, 0], [0, sr + 0.003], [0.006, sr + 0.003], [0.006, 0]], [x, ht, z0 + 0.025 + i * 0.022])
         for i in std.range(0, std.floor((len - 0.04) / 0.022))
       ]
       for s in [-1, 1]
     ]) else [])
  + (if c.legs then std.flattenArrays([
       local x = s * lx;
       [box('leg-%d' % (s + 1), 'mail', [x - lw / 2, ht, -d / 2 - 0.004], [x + lw / 2, ht + 0.014, legEnd])]
       + ridges('leg-%d-rings' % (s + 1), x - lw / 2 + 0.006, x + lw / 2 - 0.006, -d / 2 + 0.006, legEnd - 0.016, ht + 0.014)
       + [box('leg-%d-hem' % (s + 1), 'binding', [x - lw / 2, ht, legEnd - 0.012], [x + lw / 2, ht + 0.019, legEnd])]
       + (if c.socks then [box('sock-%d' % (s + 1), 'mail', [x - lw / 2 + 0.008, ht + 0.014, legEnd - 0.085], [x + lw / 2 - 0.008, ht + 0.026, legEnd - 0.014])] else [])
       for s in [-1, 1]
     ]) else [])
  + (if c.coif then [
       h.dome('coif', 'mail', 0.088, 0.05, 0.012, 'y', [0, ht, cz]),
     ] + h.crescent('coif-edge', 'binding', 0.08, 0.092, -180, 180, 16, ht, ht + 0.01, 0, cz) else [])
  + (if c.mitts then [
       box('mitt-%d' % (s + 1), 'mail', [s * sx - 0.045, 0.01, -d / 2 - 0.016], [s * sx + 0.045, ht - 0.004, -d / 2 - 0.002])
       for s in [-1, 1]
     ] + [
       g.sbox('mitt-%d-thumb' % (s + 1), 'mail', [s * (sx + 0.045), 0.03, -d / 2 - 0.014], [s * (sx + 0.06), ht - 0.02, -d / 2 - 0.004])
       for s in [-1, 1]
     ] else [])
  + (if c.braid then [box('braid', 'braid', [-0.006, ht, -d / 2 - 0.006], [0.006, ht + 0.02, cz - 0.07]), box('braid-front', 'braid', [-0.006, 0.006, -d / 2 - 0.008], [0.006, ht + 0.02, -d / 2])] else []);

// The coif's face opening and its cage: a dark oval flush on the dome's crown, barred by a grid of steel wire.
local face(ht, cz, cage) =
  local y = ht + 0.044;
  [
    h.turned('face-opening', 'opening', 'y', [[0, 0], [0, 0.042], [0.006, 0.042], [0.006, 0]], [0, y, cz]),
  ] + (if cage then [
         box('cage-x-%d' % i, 'cage', [-0.044, y + 0.006, cz + i * 0.014 - 0.002], [0.044, y + 0.01, cz + i * 0.014 + 0.002])
         for i in std.range(-3, 3)
       ] + [
         box('cage-z-%d' % i, 'cage', [i * 0.014 - 0.002, y + 0.006, cz - 0.044], [i * 0.014 + 0.002, y + 0.01, cz + 0.044])
         for i in std.range(-3, 3)
       ] else []);

// A protective coverall folded on h.foldedGarment with its hood laid face up at +z: a window in the hood, a zip flap
// down the front, and attached gloves and boots or booties folded over the front. Slots: cloth, hood, window, zip,
// glove, boot, cuff.
local coverall(o) =
  local c = { w: 0.42, d: 0.36, ht: 0.1, hood: 0.24, win: [0.16, 0.1], gloves: false, boots: false, booties: false, cuffs: false, rim: false } + o;
  local w = c.w, d = c.d, ht = c.ht, hz0 = d / 2 - c.hood, hz1 = d / 2;
  h.foldedGarment(w, d, ht, 4)
  + [
    g.flat('hood', 'hood', [[-c.hood / 2, hz1], [c.hood / 2, hz1], [c.hood / 2, hz0 + 0.05], [c.hood / 2 - 0.05, hz0], [-c.hood / 2 + 0.05, hz0], [-c.hood / 2, hz0 + 0.05]], ht, 0.022),
    box('window', 'window', [-c.win[0] / 2, ht + 0.022, (hz0 + hz1) / 2 - c.win[1] / 2], [c.win[0] / 2, ht + 0.026, (hz0 + hz1) / 2 + c.win[1] / 2]),
    box('zip', 'zip', [-0.014, ht, -d / 2 - 0.004], [0.014, ht + 0.008, hz0 + 0.004]),
  ]
  + (if c.rim then [
       box('window-rim-%d' % i, 'cuff', [-c.win[0] / 2 - 0.008, ht + 0.022, (hz0 + hz1) / 2 + (if i == 0 then -c.win[1] / 2 - 0.008 else c.win[1] / 2)], [c.win[0] / 2 + 0.008, ht + 0.028, (hz0 + hz1) / 2 + (if i == 0 then -c.win[1] / 2 else c.win[1] / 2 + 0.008)])
       for i in [0, 1]
     ] else [])
  + (if c.gloves then std.flattenArrays([
       local x = s * (w / 2 - 0.07);
       [
         box('glove-%d' % (s + 1), 'glove', [x - 0.045, ht, -d / 2 + 0.02], [x + 0.045, ht + 0.016, -d / 2 + 0.13]),
         box('glove-%d-thumb' % (s + 1), 'glove', [x - s * 0.045 - (if s > 0 then 0.03 else 0), ht, -d / 2 + 0.07], [x - s * 0.045 + (if s < 0 then 0.03 else 0), ht + 0.014, -d / 2 + 0.1]),
         box('glove-%d-cuff' % (s + 1), 'cuff', [x - 0.05, ht, -d / 2 + 0.13], [x + 0.05, ht + 0.02, -d / 2 + 0.17]),
       ]
       for s in [-1, 1]
     ]) else [])
  + (if c.boots then std.flattenArrays([
       local x = s * 0.075;
       [
         box('boot-%d-shaft' % (s + 1), 'boot', [x - 0.05, 0, -d / 2 - 0.09], [x + 0.05, ht + 0.01, -d / 2 - 0.004]),
         box('boot-%d-foot' % (s + 1), 'boot', [x - 0.05, 0, -d / 2 - 0.14], [x + 0.05, 0.06, -d / 2 - 0.004]),
         h.turned('boot-%d-toe' % (s + 1), 'boot', 'x', [[0, 0], [0, 0.04], [0.1, 0.04], [0.1, 0]], [x - 0.05, 0.04, -d / 2 - 0.14]),
         box('boot-%d-sole' % (s + 1), 'sole', [x - 0.054, 0, -d / 2 - 0.185], [x + 0.054, 0.014, -d / 2]),
       ]
       for s in [-1, 1]
     ]) else [])
  + (if c.booties then [
       box('bootie-%d' % (s + 1), 'cuff', [s * 0.075 - 0.05, 0.004, -d / 2 - 0.018], [s * 0.075 + 0.05, ht - 0.01, -d / 2 - 0.002])
       for s in [-1, 1]
     ] else [])
  + (if c.cuffs then [
       box('cuff-%d' % (s + 1), 'cuff', [s * (w / 2 - 0.06) - 0.04, ht, -d / 2 + 0.01], [s * (w / 2 - 0.06) + 0.04, ht + 0.01, -d / 2 + 0.035])
       for s in [-1, 1]
     ] else []);

[
  // A hardened steel mail suit folded on a shelf, 400 mm by 340 mm and 90 mm tall: sleeves, folded-up legs and a mail
  // coif 180 mm across laid face up at the neck. The high-carbon and rusted suits share this model.
  h.compound('ch_chainmail_suit', 18, mailSuit({ d: 0.34, ht: 0.09, sleeves: true, legs: true, coif: true }) + face(0.09, 0.08, false), { mail: 'steel-mail-dark', binding: 'leather-brown', opening: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A tempered steel mail suit folded on a shelf, 400 mm by 340 mm and 90 mm tall, made as one conductive cage: a coif
  // with a wire grille over the face, mail mitts hanging over the front fold, mail socks on the legs and a bright
  // braided bonding strap down the middle joining the parts.
  h.compound('chainmail_suit_faraday', 25, mailSuit({ d: 0.34, ht: 0.09, sleeves: true, legs: true, coif: true, mitts: true, socks: true, braid: true }) + face(0.09, 0.08, true), { mail: 'steel-heat-tint', binding: 'leather-brown', opening: 'cloth-black', cage: 'steel-bright', braid: 'bronze-polished' })
  + { voxelGrain: 0.004 },

  // A disposable white cleansuit folded on a shelf, 380 mm by 320 mm and 70 mm tall: a hooded coverall of spun plastic
  // sheet with a zip flap, elastic cuffs and booties folded over the front.
  h.compound('cleansuit', 0.2, coverall({ w: 0.38, d: 0.32, ht: 0.07, hood: 0.2, win: [0.12, 0.07], cuffs: true, booties: true }), { cloth: 'cloth-bright-white', hood: 'cloth-bright-white', window: 'cloth-charcoal', zip: 'plastic-charcoal', cuff: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A firefighter's aluminised entry suit folded on a shelf, 440 mm by 380 mm and 110 mm tall: a hooded coverall in
  // silvered flame-resistant cloth with a gold-faced visor in the hood, a zip flap and attached gauntlets.
  h.compound('entry_suit', 4.5, coverall({ w: 0.44, d: 0.38, ht: 0.11, hood: 0.26, win: [0.18, 0.1], gloves: true, rim: true }), { cloth: 'foil-alu', hood: 'foil-alu', window: 'foil-gold', zip: 'foil-alu', glove: 'foil-alu', cuff: 'cloth-turnout' })
  + { voxelGrain: 0.004 },

  // A yellow encapsulating hazmat suit folded on a shelf, 500 mm by 420 mm and 140 mm tall: a hood with a broad clear
  // face window in a black rim, a zip flap, black gloves folded on top and black boots sealed to the legs standing out
  // over the front.
  h.compound('hazmat_suit', 3.8, coverall({ w: 0.5, d: 0.42, ht: 0.14, hood: 0.3, win: [0.22, 0.13], gloves: true, boots: true, rim: true }), { cloth: 'rubber-yellow', hood: 'rubber-yellow', window: 'plastic-clear', zip: 'rubber-yellow', glove: 'jade-green', cuff: 'plastic-matte-black', boot: 'plastic-matte-black', sole: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },
]
