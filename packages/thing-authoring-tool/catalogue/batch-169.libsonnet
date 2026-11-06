local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;

// One-piece suits folded on a shelf, neck on +z: the body folded flat with the collar at +z and the legs folded up
// over the lower half, their hems lying towards the chest, so a one-piece reads apart from a shirt.

// A folded one-piece's layout: `w` across x and `d` along z, its body `ht` tall. Options:
//   collar    a stand collar of inner radius r, or null;
//   zip       a strip down the front from the collar, `zipW` wide, in slot front;
//   buttons   a count of buttons down the front;
//   sleeves   { l, w, cuff } lying along both sides from the shoulder, `l` long (short or long sleeves), or null;
//   legs      { l, cuff } the legs folded up over the lower body, `l` long from the hem fold, a seam between them;
//   pockets   chest patch pockets { x, z, w, d, flap }, mirrored; legPockets the same on the folded legs;
//   hood      { w, l } folded flat behind the collar and draped over the +z edge;
//   feet      true to end each leg in a sewn-on foot.
// The layout also gives the heights and edges that extras lie on: legTop, legZ1 (the folded hems), legX (each leg's
// middle) and chest (the z span of the chest between the hems and the collar).
local layout(o) =
  local c = {
    w: 0.36, d: 0.32, ht: 0.05, folds: 3, neck: 0.07,
    collar: { r: 0.055, wd: 0.022, ht: 0.016, gap: 35 },
    zip: true, zipW: 0.016, buttons: 0,
    sleeves: { l: 0.12, w: 0.06, cuff: 0.012 },
    legs: { l: 0.12, cuff: 0.014 },
    pockets: [], legPockets: [], hood: null, feet: false,
  } + o;
  c {
    cz: c.d / 2 - c.neck,
    cr: if c.collar == null then 0.045 else c.collar.r,
    legY: c.ht + (if c.sleeves == null then 0.004 else 0.006),
    legTop: self.legY + 0.012,
    legZ1: -c.d / 2 + c.legs.l,
    legX: (c.w / 2 - 0.02 + 0.005) / 2,
    chest: [self.legZ1, self.cz - self.cr],
  };
// The folded one-piece. Slots: cloth, collar, front, button, sleeve, cuff, legs, seam, pocket, flap, hood, foot.
local suit(c) =
  local w = c.w, d = c.d, ht = c.ht, sl = c.sleeves, lg = c.legs, legY = c.legY, legTop = c.legTop, legZ1 = c.legZ1;
  g.jacket({
    w: w, d: d, ht: ht, folds: c.folds, neck: c.neck, collar: c.collar,
    front: if c.zip then 'placket' else 'none', frontW: c.zipW, frontT: 0.003,
    buttons: if c.buttons > 0 then [c.chest[1] - 0.012 - i * (c.chest[1] - legZ1 - 0.02) / std.max(1, c.buttons - 1) for i in std.range(0, c.buttons - 1)] else [],
    pockets: c.pockets,
    hood: c.hood,
  })
  + (if sl == null then [] else std.flattenArrays([
       local x0 = if s < 0 then -w / 2 else w / 2 - sl.w, x1 = if s < 0 then -w / 2 + sl.w else w / 2;
       local z1 = d / 2 - 0.03, z0 = z1 - sl.l;
       [
         box('sleeve-%d' % (s + 1), 'sleeve', [x0, ht, z0], [x1, ht + 0.006, z1]),
         box('sleeve-cuff-%d' % (s + 1), 'cuff', [x0 - 0.002, ht, z0 - 0.002], [x1 + 0.002, ht + 0.008, z0 + sl.cuff]),
       ]
       for s in [-1, 1]
     ]))
  + std.flattenArrays([
    local x0 = if s < 0 then -w / 2 + 0.02 else 0.005, x1 = if s < 0 then -0.005 else w / 2 - 0.02;
    [
      box('leg-%d' % (s + 1), 'legs', [x0, legY, -d / 2 - 0.004], [x1, legTop, legZ1]),
      box('leg-cuff-%d' % (s + 1), 'cuff', [x0 - 0.002, legY, legZ1 - lg.cuff], [x1 + 0.002, legTop + 0.002, legZ1 + 0.002]),
    ] + (if c.feet then [
           h.prism('foot-%d' % (s + 1), 'foot', 'y', [[legZ1, x0 + 0.01], [legZ1, x1 - 0.01], [legZ1 + 0.045, x1 - 0.016], [legZ1 + 0.06, (x0 + x1) / 2], [legZ1 + 0.045, x0 + 0.016]], legY, legTop + 0.004),
         ] else [])
    for s in [-1, 1]
  ])
  // The legs' fold round the hem at -z, and the seam between them.
  + [h.rod('leg-fold', 'legs', (legTop - ht) / 2 + 0.002, -w / 2 + 0.02, w / 2 - 0.02, (ht + legTop) / 2) + { origin: [-w / 2 + 0.02, (ht + legTop) / 2, -d / 2 - 0.004] }]
  + [box('crotch-seam', 'seam', [-0.003, legY, -d / 2 - 0.004], [0.003, legTop + 0.001, legZ1])]
  + std.flattenArrays([
    local p = { flap: 0.022 } + pk;
    [
      box('leg-pocket-%d-%d' % [i, m], 'pocket', [x - p.w / 2, legTop, p.z - p.d / 2], [x + p.w / 2, legTop + 0.004, p.z + p.d / 2]),
    ] + (if p.flap > 0 then [box('leg-flap-%d-%d' % [i, m], 'flap', [x - p.w / 2 - 0.003, legTop + 0.004, p.z + p.d / 2 - p.flap], [x + p.w / 2 + 0.003, legTop + 0.008, p.z + p.d / 2 + 0.003])] else [])
    for i in std.range(0, std.length(c.legPockets) - 1)
    for pk in [c.legPockets[i]]
    for m in [0, 1]
    for x in [if m == 0 then pk.x else -pk.x]
  ]);

local folded(id, mass, pieces, finish) = h.compound(id, mass, pieces, finish) + { voxelGrain: 0.004 };
// Finishes for every suit slot in one cloth, with `trim` for the zip, seams and flaps.
local cloth(f, trim) = {
  cloth: f, collar: f, sleeve: f, cuff: f, legs: f, pocket: f, hood: f, foot: f,
  front: trim, seam: trim, flap: trim, button: 'plastic-matte-black',
};

// Stripes `w` wide every `pitch` along z, across x0..x1 between z0 and z1 on a top face at y.
local stripes(prefix, slot, x0, x1, z0, z1, y, w=0.012, pitch=0.024) = [
  box('%s-%d' % [prefix, i], slot, [x0, y, z0 + i * pitch], [x1, y + 0.004, std.min(z1, z0 + i * pitch + w)])
  for i in std.range(0, std.floor((z1 - z0) / pitch))
  if z0 + i * pitch < z1 - 0.004
];
// A zigzag band along x from x0 to x1 about z, `amp` high in `n` legs, on a top face at y.
local zigzag(prefix, slot, x0, x1, z, amp, n, y) = [
  g.strip('%s-%d' % [prefix, i], slot, [x0 + (x1 - x0) * i / n, z + amp * (if i % 2 == 0 then -1 else 1)], [x0 + (x1 - x0) * (i + 1) / n, z + amp * (if i % 2 == 0 then 1 else -1)], y, 0.008)
  for i in std.range(0, n - 1)
];
// Bones printed on the folded legs: a thigh bone down each leg with knuckled ends and a kneecap by the hem.
local legBones(c) = std.flattenArrays([
  local x = s * c.legX, y = c.legTop, z0 = -c.d / 2 + 0.012, z1 = c.legZ1 - c.legs.cuff - 0.03;
  [
    box('femur-%d' % (s + 1), 'bone', [x - 0.007, y, z0], [x + 0.007, y + 0.004, z1]),
    box('femur-head-%d' % (s + 1), 'bone', [x - 0.016, y, z0], [x + 0.016, y + 0.004, z0 + 0.014]),
    box('femur-knee-%d' % (s + 1), 'bone', [x - 0.016, y, z1 - 0.012], [x + 0.016, y + 0.004, z1]),
    h.disc('kneecap-%d' % (s + 1), 'bone', 0.012, y, y + 0.004, x, z1 + 0.016),
  ]
  for s in [-1, 1]
]);
// Ribs either side of the zip, a breastbone over it, and an arm bone down each sleeve.
local chestBones(c, ribs) = [
  box('rib-%d-%d' % [s + 1, i], 'bone', [if s < 0 then -0.1 else 0.016, c.ht + 0.003, c.chest[0] + 0.012 + i * 0.016], [if s < 0 then -0.016 else 0.1, c.ht + 0.007, c.chest[0] + 0.02 + i * 0.016])
  for s in [-1, 1]
  for i in std.range(0, ribs - 1)
] + [
  box('arm-bone-%d' % (s + 1), 'bone', [s * (c.w / 2 - c.sleeves.w / 2) - 0.006, c.ht + 0.006, c.d / 2 - 0.03 - c.sleeves.l + 0.02], [s * (c.w / 2 - c.sleeves.w / 2) + 0.006, c.ht + 0.01, c.d / 2 - 0.05])
  for s in [-1, 1]
];

// A hood laid face up over the chest, crown to +z, `w` wide and `l` long from z0, lying from y. With `skull`, a
// printed skull face: a bone oval with dark eye sockets, nose and a row of teeth. Slots: hood, bone, socket.
local hoodUp(c, w, l, z0, y, skull) =
  local zc = z0 + l / 2;
  [
    g.flat('hood-up', 'hood', [[-w / 2 + 0.02, z0], [w / 2 - 0.02, z0], [w / 2, z0 + l * 0.35], [w / 2 - 0.01, z0 + l * 0.85], [0, z0 + l], [-w / 2 + 0.01, z0 + l * 0.85], [-w / 2, z0 + l * 0.35]], y, 0.01),
  ] + (if !skull then [] else [
         g.flat('skull', 'bone', [[0.05 * std.sin(a * std.pi / 6), zc + 0.008 + 0.06 * std.cos(a * std.pi / 6)] for a in std.range(0, 11)], y + 0.01, 0.004),
         h.disc('socket-l', 'socket', 0.014, y + 0.014, y + 0.018, -0.022, zc + 0.012),
         h.disc('socket-r', 'socket', 0.014, y + 0.014, y + 0.018, 0.022, zc + 0.012),
         g.flat('nose', 'socket', [[-0.007, zc - 0.014], [0.007, zc - 0.014], [0, zc + 0.002]], y + 0.014, 0.004),
         box('teeth', 'socket', [-0.026, y + 0.014, zc - 0.036], [0.026, y + 0.018, zc - 0.03]),
       ] + [
         box('tooth-gap-%d' % i, 'bone', [-0.024 + i * 0.012, y + 0.014, zc - 0.04], [-0.02 + i * 0.012, y + 0.018, zc - 0.026])
         for i in std.range(0, 4)
       ]);

local orange = cloth('cloth-safety-orange', 'leather-chestnut');
local chestPockets = [{ x: 0.085, z: 0.03, w: 0.065, d: 0.05, flap: 0.008 }];
local skeleton = layout({ sleeves: { l: 0.25, w: 0.06, cuff: 0.012 } });
local skeletonFinish = cloth('cloth-charcoal', 'cloth-black') + { bone: 'bone', socket: 'cloth-black' };
local wool = layout({ ht: 0.07, hood: { w: 0.16, l: 0.11 }, feet: true, sleeves: { l: 0.25, w: 0.065, cuff: 0.016 }, legs: { l: 0.13, cuff: 0.016 } });
local flag = layout({ zip: false });
local mummy = layout({ sleeves: { l: 0.25, w: 0.06, cuff: 0.01 } });
local coverall = layout({
  ht: 0.06, folds: 4, sleeves: { l: 0.25, w: 0.065, cuff: 0.018 }, legs: { l: 0.13, cuff: 0.016 },
  pockets: [{ x: 0.09, z: 0.03, w: 0.07, d: 0.055, flap: 0.018, snap: true }],
  legPockets: [{ x: 0.095, z: -0.12, w: 0.08, d: 0.06, flap: 0.02 }],
});
local heavy = coverall { ht: 0.08, legY: 0.086, legTop: 0.098, collar: { r: 0.055, wd: 0.026, ht: 0.02, gap: 30 } };
local union = layout({ w: 0.3, d: 0.27, ht: 0.03, folds: 2, zipW: 0.022, buttons: 5, collar: { r: 0.05, wd: 0.014, ht: 0.006, gap: 8 }, sleeves: { l: 0.2, w: 0.05, cuff: 0.022 }, legs: { l: 0.1, cuff: 0.022 } });
local zentai = layout({
  w: 0.2, d: 0.17, ht: 0.024, folds: 2, neck: 0.035, collar: null, zip: false,
  sleeves: { l: 0.11, w: 0.035, cuff: 0.008 }, legs: { l: 0.07, cuff: 0.008 },
});
local fur = layout({
  w: 0.46, d: 0.4, ht: 0.11, folds: 4, collar: null, zip: true, zipW: 0.02,
  sleeves: { l: 0.3, w: 0.08, cuff: 0.02 }, legs: { l: 0.15, cuff: 0.02 }, feet: true,
});

[
  // A short-sleeved cotton jumpsuit folded, 360 mm by 320 mm and about 70 mm tall: zip front, two chest pockets and
  // the legs folded up over the lower body.
  folded('jumpsuit', 1.1, suit(layout({ pockets: chestPockets })), orange),

  // The same jumpsuit without pockets.
  folded('jumpsuit_pocketless', 1.1, suit(layout({})), orange),

  // A white jumpsuit printed with red stripes and a blue starred corner on the chest, folded as the jumpsuit.
  folded('flag_jumpsuit', 1.1, suit(flag)
                                + stripes('stripe-leg', 'stripe', -flag.w / 2 + 0.02, flag.w / 2 - 0.02, -flag.d / 2, flag.legZ1 - 0.016, flag.legTop)
                                + stripes('stripe-chest', 'stripe', 0.012, 0.12, flag.chest[0] + 0.004, flag.chest[1] + 0.03, flag.ht)
                                + stripes('stripe-sleeve-l', 'stripe', -flag.w / 2, -flag.w / 2 + 0.06, flag.d / 2 - 0.15, flag.d / 2 - 0.044, flag.ht + 0.006)
                                + stripes('stripe-sleeve-r', 'stripe', flag.w / 2 - 0.06, flag.w / 2, flag.d / 2 - 0.15, flag.d / 2 - 0.044, flag.ht + 0.006)
                                + [box('canton', 'canton', [-0.115, flag.ht, flag.chest[0] + 0.004], [-0.012, flag.ht + 0.004, flag.chest[1] + 0.02])]
                                + [
                                  box('star-%d-%d' % [i, j], 'star', [-0.105 + i * 0.02, flag.ht + 0.004, flag.chest[0] + 0.012 + j * 0.016], [-0.099 + i * 0.02, flag.ht + 0.008, flag.chest[0] + 0.018 + j * 0.016])
                                  for i in std.range(0, 4)
                                  for j in std.range(0, 3)
                                ],
         cloth('cloth-bright-white', 'cloth-red') + { stripe: 'cloth-red', canton: 'cloth-navy', star: 'cloth-bright-white', button: 'cloth-bright-white' }),

  // A black long-sleeved jumpsuit printed with bones, its skull-printed hood unzipped and folded back over the collar.
  folded('jumpsuit_skeleton', 1.2, suit(skeleton { hood: { w: 0.15, l: 0.1 } }) + legBones(skeleton) + chestBones(skeleton, 3), skeletonFinish),

  // The same jumpsuit with its hood zipped up and laid face up over the chest, showing the skull.
  folded('jumpsuit_skeleton_zipped', 1.2, suit(skeleton) + legBones(skeleton) + chestBones(skeleton, 3)
                                           + hoodUp(skeleton, 0.16, 0.2, -0.035, skeleton.ht + 0.018, true), skeletonFinish),

  // An off-white jumpsuit printed with crossing bandage wraps, a few loose ends trailing off the sides.
  folded('mummy_jumpsuit', 1.1, suit(mummy)
                                 + [
                                   g.strip('wrap-leg-%d' % i, 'wrap', [-mummy.w / 2 + 0.02, -mummy.d / 2 + 0.01 + i * 0.03], [mummy.w / 2 - 0.02, -mummy.d / 2 + 0.03 + i * 0.03 + (if i % 2 == 0 then 0.02 else -0.015)], mummy.legTop, 0.014)
                                   for i in std.range(0, 2)
                                 ]
                                 + [
                                   g.strip('wrap-chest-%d' % i, 'wrap', [-0.11, mummy.chest[0] + 0.008 + i * 0.03], [0.11, mummy.chest[0] + 0.02 + i * 0.03 + (if i % 2 == 0 then 0.012 else -0.012)], mummy.ht + 0.004, 0.012)
                                   for i in std.range(0, 1)
                                 ]
                                 + [
                                   g.strip('wrap-sleeve-%d-%d' % [s + 1, i], 'wrap', [s * (mummy.w / 2 - 0.062), mummy.d / 2 - 0.26 + i * 0.05], [s * (mummy.w / 2 + 0.002), mummy.d / 2 - 0.24 + i * 0.05], mummy.ht + 0.006, 0.012)
                                   for s in [-1, 1]
                                   for i in std.range(0, 3)
                                 ]
                                 + [
                                   box('loose-end-1', 'wrap', [mummy.w / 2 - 0.02, 0.01, -0.09], [mummy.w / 2 - 0.004, mummy.legTop + 0.004, -0.076]),
                                   box('loose-end-1-drop', 'wrap', [mummy.w / 2 - 0.004, 0.0, -0.09], [mummy.w / 2, mummy.legTop + 0.004, -0.076]),
                                   box('loose-end-2', 'wrap', [-mummy.w / 2 - 0.004, 0.0, 0.03], [-mummy.w / 2, mummy.ht + 0.01, 0.044]),
                                 ],
         cloth('cloth-cream', 'cloth-khaki') + { wrap: 'cloth-white' }),

  // Navy canvas work coveralls folded, 360 mm by 320 mm and about 90 mm tall: zip front, flapped chest pockets with
  // press studs, flapped thigh pockets on the folded legs.
  folded('technician_coveralls', 1.1, suit(coverall), cloth('cloth-navy', 'cloth-charcoal') + { button: 'steel-grey' }),

  // Brown duck coveralls with a quilted lining, folded thicker, a pale fleece collar and double knees.
  folded('technician_coveralls_h', 2, suit(heavy)
                                          + [
                                            box('knee-%d' % (s + 1), 'knee', [s * heavy.legX - 0.05, heavy.legTop, heavy.legZ1 - heavy.legs.cuff - 0.05], [s * heavy.legX + 0.05, heavy.legTop + 0.004, heavy.legZ1 - heavy.legs.cuff - 0.004])
                                            for s in [-1, 1]
                                          ],
         cloth('cloth-brown', 'suede-brown') + { collar: 'fur-pale', button: 'brass-dull', knee: 'suede-brown' }),

  // Red cotton long underwear folded thin, 300 mm by 270 mm and about 50 mm tall: a buttoned placket from a round
  // neck, ribbed cuffs at the wrists and ankles.
  folded('union_suit', 0.45, suit(union)
                              + [
                                box('rib-%d-%d' % [s + 1, i], 'rib', [s * union.legX - 0.06, union.legTop + 0.002, union.legZ1 - 0.02 + i * 0.006], [s * union.legX + 0.06, union.legTop + 0.004, union.legZ1 - 0.017 + i * 0.006])
                                for s in [-1, 1]
                                for i in std.range(0, 3)
                              ],
         cloth('cloth-red', 'cloth-crimson') + { cuff: 'cloth-crimson', rib: 'cloth-red', button: 'pearl' }),

  // A thick knitted wool onesie folded, 360 mm by 320 mm and about 110 mm tall: a hood folded back, footed legs and
  // pale zigzag pattern bands across the chest, sleeves and legs.
  folded('wool_suit', 1.5, suit(wool)
                             + zigzag('band-leg-a', 'band', -wool.w / 2 + 0.03, wool.w / 2 - 0.03, -0.12, 0.008, 10, wool.legTop)
                             + zigzag('band-leg-b', 'band', -wool.w / 2 + 0.03, wool.w / 2 - 0.03, -0.075, 0.008, 10, wool.legTop)
                             + zigzag('band-chest', 'band', -0.1, 0.1, wool.chest[0] + 0.02, 0.008, 6, wool.ht + 0.003)
                             + std.flattenArrays([zigzag('band-sleeve-%d' % (s + 1), 'band', s * (wool.w / 2 - 0.06), s * (wool.w / 2 - 0.004), 0.0, 0.008, 2, wool.ht + 0.006) for s in [-1, 1]]),
         cloth('cloth-navy', 'cloth-blue') + { band: 'cloth-cream', foot: 'cloth-cream', cuff: 'cloth-cream' }),

  // A red wool onesie folded as the thick onesie, its hood carrying two black horns and a pointed tail lying across
  // the folded legs.
  folded('wool_suit_devil', 1.5, suit(wool)
                                   + [
                                     h.turned('horn-%d' % (s + 1), 'horn', 'y', [[0, 0], [0, 0.014], [0.02, 0.009], [0.036, 0.003], [0.04, 0]], [s * 0.04, wool.ht + 0.012, wool.d / 2 - 0.035])
                                     for s in [-1, 1]
                                   ]
                                   + [
                                     g.strip('tail-a', 'tail', [-0.02, wool.legZ1 - 0.02], [0.08, -0.13], wool.legTop, 0.012, 0.006),
                                     g.strip('tail-b', 'tail', [0.08, -0.13], [0.17, -0.1], wool.legTop, 0.012, 0.006),
                                     box('tail-drop', 'tail', [0.17, 0.0, -0.106], [0.182, wool.legTop + 0.006, -0.094]),
                                     g.flat('tail-tip', 'horn', [[0.182, -0.124], [0.214, -0.1], [0.182, -0.076]], 0.0, 0.01),
                                   ],
         cloth('cloth-red', 'cloth-crimson') + { horn: 'cloth-black', tail: 'cloth-red', foot: 'cloth-crimson', cuff: 'cloth-crimson' }),

  // A thin stretch full-body suit folded small, 200 mm by 170 mm and about 40 mm tall: no openings, the hood lying
  // over the chest.
  folded('zentai', 0.2, suit(zentai) + hoodUp(zentai, 0.11, 0.1, zentai.legZ1 + 0.004, zentai.legY, false)
                        + [box('hood-seam', 'seam', [-0.002, zentai.legY + 0.01, zentai.legZ1 + 0.02], [0.002, zentai.legY + 0.013, zentai.legZ1 + 0.1])],
         cloth('cloth-green', 'leaf-green')),

  // A full-body animal costume, 7 kg of faux fur: the body folded thick, 460 mm by 400 mm, with footed paws, and the
  // big costume head, 260 mm across, sitting on the chest with round ears, a pale muzzle and a fluffy tail out one side.
  folded('fursuit', 4.4, suit(fur)
                           + [
                             h.turned('head', 'head', 'y', [[0, 0], [0, 0.09], [0.04, 0.12], [0.1, 0.13], [0.16, 0.12], [0.22, 0.085], [0.25, 0.04], [0.26, 0]], [0, fur.ht + 0.004, 0.06]),
                             h.turned('muzzle', 'muzzle', 'z', [[0, 0], [0, 0.06], [0.04, 0.058], [0.07, 0.045], [0.085, 0.02], [0.088, 0]], [0, fur.ht + 0.09, 0.15]),
                             h.turned('nose', 'nose', 'z', [[0, 0], [0, 0.02], [0.012, 0.016], [0.018, 0]], [0, fur.ht + 0.11, 0.233]),
                             h.turned('eye-l', 'eye', 'z', [[0, 0], [0, 0.02], [0.01, 0.017], [0.014, 0]], [-0.05, fur.ht + 0.16, 0.165]),
                             h.turned('eye-r', 'eye', 'z', [[0, 0], [0, 0.02], [0.01, 0.017], [0.014, 0]], [0.05, fur.ht + 0.16, 0.165]),
                           ]
                           + [
                             h.turned('ear-%d' % (s + 1), 'head', 'z', [[0, 0], [0, 0.05], [0.03, 0.045], [0.035, 0]], [s * 0.09, fur.ht + 0.235, 0.04])
                             for s in [-1, 1]
                           ]
                           + [
                             h.turned('ear-inner-%d' % (s + 1), 'muzzle', 'z', [[0, 0], [0, 0.03], [0.005, 0]], [s * 0.09, fur.ht + 0.235, 0.075])
                             for s in [-1, 1]
                           ]
                           + [
                             h.turned('tail', 'cloth', 'x', [[0, 0], [0, 0.04], [0.06, 0.055], [0.13, 0.05], [0.17, 0.035], [0.19, 0]], [fur.w / 2 - 0.03, 0.06, -0.12]),
                             h.turned('tail-tip', 'muzzle', 'x', [[0, 0], [0, 0.036], [0.025, 0.02], [0.03, 0]], [fur.w / 2 + 0.155, 0.06, -0.12]),
                           ],
         cloth('fur-brown', 'leather-black') + { head: 'fur-brown', muzzle: 'fur-pale', nose: 'leather-black', eye: 'screen-black', foot: 'fur-pale' }),
]
